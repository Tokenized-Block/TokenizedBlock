// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";

interface IERC20H {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IUR {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

/// the LIVE Universal Router's ExactInputSingleParams (5 fields, no minHopPriceX36)
struct ExactInputSingleParams {
    PoolKey poolKey;
    bool zeroForOne;
    uint128 amountIn;
    uint128 amountOutMinimum;
    bytes hookData;
}

/// V2/V3-style venue stand-in: pulls the block with transferFrom (what a pair contract does), pays 1 stock unit.
contract MockPaire {
    function vendre(address bloc, address stock, uint256 m) external {
        IERC20H(bloc).transferFrom(msg.sender, address(this), m);
        IERC20H(stock).transfer(msg.sender, 1);
    }
}

/// aggregator-style router: tokens HOP through it; pays the PoolManager BEFORE the swap (`avant`, pre-settle) or
/// AFTER it (Uniswap periphery order). Quote = an ERC-20 stock.
contract RouteurHop {
    IPoolManager immutable pm;

    constructor(IPoolManager p) {
        pm = p;
    }

    function acheter(PoolKey calldata k, address bloc, address stock, uint256 q, address qui) external {
        IERC20H(stock).transferFrom(qui, address(this), q);
        pm.unlock(abi.encode(true, k, bloc, stock, q, qui, false));
        IERC20H(bloc).transfer(qui, IERC20H(bloc).balanceOf(address(this))); // router -> user leg
    }

    function vendre(PoolKey calldata k, address bloc, address stock, uint256 m, address qui, bool avant) external {
        IERC20H(bloc).transferFrom(qui, address(this), m); // user -> router leg
        pm.unlock(abi.encode(false, k, bloc, stock, m, qui, avant));
    }

    function unlockCallback(bytes calldata d) external returns (bytes memory) {
        (bool achat, PoolKey memory k, address bloc, address stock, uint256 m, address qui, bool avant) =
            abi.decode(d, (bool, PoolKey, address, address, uint256, address, bool));
        bool bloc0 = Currency.unwrap(k.currency0) == bloc;
        bool zfo = achat ? !bloc0 : bloc0;
        if (achat) {
            BalanceDelta r = pm.swap(k, IPoolManager.SwapParams(zfo, -int256(m), zfo ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
            _payer(stock, m);
            pm.take(Currency.wrap(bloc), address(this), uint256(int256(bloc0 ? r.amount0() : r.amount1())));
        } else {
            if (avant) _payer(bloc, m);
            BalanceDelta r = pm.swap(k, IPoolManager.SwapParams(zfo, -int256(m), zfo ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
            if (!avant) _payer(bloc, m);
            pm.take(Currency.wrap(stock), qui, uint256(int256(bloc0 ? r.amount1() : r.amount0())));
        }
        return "";
    }

    function _payer(address c, uint256 m) internal {
        pm.sync(Currency.wrap(c));
        IERC20H(c).transfer(address(pm), m);
        pm.settle();
    }
}

/// redeems a holder's ERC-6909 block claims (holder made this contract its operator)
contract Rachat {
    IPoolManager immutable pm;

    constructor(IPoolManager p) {
        pm = p;
    }

    function racheter(address qui, Currency c, uint256 m) external {
        pm.unlock(abi.encode(uint8(0), abi.encode(qui, c, m)));
    }

    /// same tx: a hooked buy paid to `acheteur`, THEN the redemption of `qui`'s claims
    function acheterPuisRacheter(PoolKey calldata k, address bloc, address stock, uint256 q, address acheteur, address qui, uint256 x)
        external
    {
        pm.unlock(abi.encode(uint8(1), abi.encode(k, bloc, stock, q, acheteur, qui, x)));
    }

    function unlockCallback(bytes calldata d) external returns (bytes memory) {
        (uint8 op, bytes memory p) = abi.decode(d, (uint8, bytes));
        if (op == 0) {
            (address qui, Currency c, uint256 m) = abi.decode(p, (address, Currency, uint256));
            pm.burn(qui, c.toId(), m);
            pm.take(c, qui, m);
            return "";
        }
        (PoolKey memory k, address bloc, address stock, uint256 q, address acheteur, address qui, uint256 x) =
            abi.decode(p, (PoolKey, address, address, uint256, address, address, uint256));
        bool bloc0 = Currency.unwrap(k.currency0) == bloc;
        bool zfo = !bloc0;
        BalanceDelta r = pm.swap(k, IPoolManager.SwapParams(zfo, -int256(q), zfo ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
        pm.sync(Currency.wrap(stock));
        IERC20H(stock).transfer(address(pm), q);
        pm.settle();
        pm.take(Currency.wrap(bloc), acheteur, uint256(int256(bloc0 ? r.amount0() : r.amount1())));
        pm.burn(qui, Currency.wrap(bloc).toId(), x);
        pm.take(Currency.wrap(bloc), qui, x);
        return "";
    }
}

using CurrencyLibrary for Currency;
