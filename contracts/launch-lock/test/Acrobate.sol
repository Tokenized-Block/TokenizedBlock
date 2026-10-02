// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {TransientStateLibrary} from "v4-core/libraries/TransientStateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";

interface IERC20T {
    function transfer(address, uint256) external returns (bool);
}

/// @notice ATTACKER stand-in (test only). Plays the PoolManager "credit" games a plain token cannot see:
///         buy on the TB pool and NOT take the block, use that credit elsewhere in the same unlock; buy+sell in one
///         transaction (flash round trip). Every leg is settled with the contract's own balances.
contract Acrobate is IUnlockCallback {
    using TransientStateLibrary for IPoolManager;

    IPoolManager public immutable pm;

    enum Op {
        ACHAT_PUIS_LP_SANS_HOOK,
        RETRAIT_SANS_HOOK,
        ALLER_RETOUR
    }

    struct Ordre {
        Op op;
        PoolKey tb;
        PoolKey autre;
        address bloc;
        uint256 quoteIn;
        int256 liquidite;
    }

    constructor(IPoolManager _pm) {
        pm = _pm;
    }

    function jouer(Ordre calldata o) external {
        pm.unlock(abi.encode(o));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(pm), "pm");
        Ordre memory o = abi.decode(data, (Ordre));
        if (o.op == Op.ACHAT_PUIS_LP_SANS_HOOK) {
            _acheter(o.tb, o.bloc, o.quoteIn); // block credit stays INSIDE the PoolManager
            pm.modifyLiquidity(o.autre, IPoolManager.ModifyLiquidityParams(-887200, 887200, o.liquidite, 0), "");
        } else if (o.op == Op.RETRAIT_SANS_HOOK) {
            pm.modifyLiquidity(o.autre, IPoolManager.ModifyLiquidityParams(-887200, 887200, o.liquidite, 0), "");
        } else {
            _acheter(o.tb, o.bloc, o.quoteIn);
            int256 credit = pm.currencyDelta(address(this), Currency.wrap(o.bloc));
            bool z = Currency.unwrap(o.tb.currency0) == o.bloc;
            pm.swap(o.tb, IPoolManager.SwapParams(z, -credit, z ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
        }
        _solder(o.tb.currency0);
        _solder(o.tb.currency1);
        return "";
    }

    function _acheter(PoolKey memory k, address bloc, uint256 quoteIn) internal {
        bool z = Currency.unwrap(k.currency0) != bloc; // pay the quote
        pm.swap(k, IPoolManager.SwapParams(z, -int256(quoteIn), z ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
    }

    /// @dev pay what we owe from our own balance, take what we are owed (this is where the token guard sees it).
    function _solder(Currency c) internal {
        int256 d = pm.currencyDelta(address(this), c);
        if (d < 0) {
            pm.sync(c);
            IERC20T(Currency.unwrap(c)).transfer(address(pm), uint256(-d));
            pm.settle();
        } else if (d > 0) {
            pm.take(c, address(this), uint256(d));
        }
    }
}
