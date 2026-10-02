// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/types/BeforeSwapDelta.sol";

/// @title TBlockOpenMarketHook — "V8-open": a SECOND, OPEN, DISCLOSED market for a token born elsewhere
/// @notice SKETCH, NOT DEPLOYED, NOT AUDITED. Flag OFF in the app until Phil's GO.
///         It never touches the token's existing pools (impossible in v4: a pool's hook is fixed at
///         initialization). It is a NEW pool beside them: ETH / <any token>, opened by anyone, filled by
///         ordinary LPs who keep the LP fee, and it charges ONE announced fee, HOOK_FEE pips of the ETH
///         amount, buys and sells, exact-in and exact-out, 100 % to an IMMUTABLE fee wallet (a6cf).
/// @dev Differences with V8 / V9 (whose fee mechanics are copied verbatim):
///        - no Create label, no admin-of-the-block check, no `inscrire` payment: any token, any opener;
///        - ETH (native, currency0 = address(0)) is the ONLY quote — the fee is always ETH;
///        - the LP fee must be static and <= 1 % (no dynamic-fee flag: what the user pays is readable);
///        - nothing is configurable after construction: no owner, no setter, no pause.
///      Rounding: fee = floor(q * HOOK_FEE / 1e6), never above the announced rate. hookData is ignored.
contract TBlockOpenMarketHook is IHooks, IUnlockCallback {
    using PoolIdLibrary for PoolKey;

    error PasLePoolManager();
    error AdresseNulle();
    error FraisInvalide();
    error PasUnePaireEth();
    error FraisLpInvalide();
    error PoolVide();
    error RemplissagePartiel();
    error HookNotImplemented();

    event Ouverte(PoolId indexed id, address indexed jeton, address indexed ouvreur, uint24 fraisLp);
    event FraisPreleve(PoolId indexed id, uint256 montant, bool verse);
    event Verse(uint256 montant);

    uint256 public constant DIVISEUR = 1_000_000;
    /// @dev hard ceiling so a mis-typed constructor argument cannot ship a predatory rate
    uint24 public constant FRAIS_MAX = 10_000; // 1 %
    uint24 public constant FRAIS_LP_MAX = 10_000; // 1 %
    uint256 public constant GAS_POUSSEE = 150_000;
    Currency internal constant ETH = Currency.wrap(address(0));

    IPoolManager public immutable poolManager;
    address public immutable feeWallet;
    /// @dev same getter name as V8 / V9; pips of 1e6 (2000 = 0.20 %)
    uint24 public immutable HOOK_FEE;

    mapping(PoolId => bool) public garnie;
    uint256 public enAttente;

    modifier seulementPoolManager() {
        if (msg.sender != address(poolManager)) revert PasLePoolManager();
        _;
    }

    constructor(IPoolManager _poolManager, address _feeWallet, uint24 _hookFee) {
        if (address(_poolManager) == address(0) || _feeWallet == address(0)) revert AdresseNulle();
        if (_hookFee == 0 || _hookFee > FRAIS_MAX) revert FraisInvalide();
        poolManager = _poolManager;
        feeWallet = _feeWallet;
        HOOK_FEE = _hookFee;
        Hooks.validateHookPermissions(IHooks(address(this)), permissions());
    }

    function permissions() public pure returns (Hooks.Permissions memory p) {
        p.beforeInitialize = true;
        p.afterAddLiquidity = true;
        p.beforeSwap = true;
        p.afterSwap = true;
        p.beforeSwapReturnDelta = true;
        p.afterSwapReturnDelta = true;
    }

    function getHookPermissions() external pure returns (Hooks.Permissions memory) {
        return permissions();
    }

    /// @notice permissionless: ETH / token, static LP fee <= 1 %. The opener gets nothing special.
    function beforeInitialize(address sender, PoolKey calldata key, uint160) external seulementPoolManager returns (bytes4) {
        if (Currency.unwrap(key.currency0) != address(0) || Currency.unwrap(key.currency1) == address(0)) {
            revert PasUnePaireEth();
        }
        if (LPFeeLibrary.isDynamicFee(key.fee) || key.fee > FRAIS_LP_MAX) revert FraisLpInvalide();
        emit Ouverte(key.toId(), Currency.unwrap(key.currency1), sender, key.fee);
        return IHooks.beforeInitialize.selector;
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external seulementPoolManager returns (bytes4, BalanceDelta) {
        if (params.liquidityDelta > 0) {
            PoolId id = key.toId();
            if (!garnie[id]) garnie[id] = true;
        }
        return (IHooks.afterAddLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }

    /// @dev ETH is the SPECIFIED currency (buy exact-in, sell exact-out): fee on the specified amount.
    function beforeSwap(address, PoolKey calldata key, IPoolManager.SwapParams calldata params, bytes calldata)
        external
        seulementPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        if (!garnie[id]) revert PoolVide();
        if (_ethSpecifie(params)) {
            uint256 montant = params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
            uint256 frais = montant * HOOK_FEE / DIVISEUR;
            if (frais > 0) {
                _prelever(id, frais);
                return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(frais)), 0), 0);
            }
        }
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    /// @dev ETH is the UNSPECIFIED currency (sell exact-in, buy exact-out): fee on the ETH the pool moved.
    function afterSwap(address, PoolKey calldata key, IPoolManager.SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        seulementPoolManager
        returns (bytes4, int128)
    {
        int128 dq = delta.amount0();
        if (_ethSpecifie(params)) {
            uint256 demande = params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
            uint256 f = demande * HOOK_FEE / DIVISEUR;
            uint256 attendu = params.amountSpecified < 0 ? demande - f : demande + f;
            uint256 rempli = dq < 0 ? uint256(-int256(dq)) : uint256(int256(dq));
            if (rempli != attendu) revert RemplissagePartiel();
            return (IHooks.afterSwap.selector, 0);
        }
        uint256 montant = dq < 0 ? uint256(-int256(dq)) : uint256(int256(dq));
        uint256 frais = montant * HOOK_FEE / DIVISEUR;
        if (frais == 0) return (IHooks.afterSwap.selector, 0);
        _prelever(key.toId(), frais);
        return (IHooks.afterSwap.selector, int128(int256(frais)));
    }

    /// @notice push fees kept as claims (fee wallet refused ETH / gas) to the fee wallet. Anyone may call.
    function verser() external returns (uint256 verse) {
        uint256 m = enAttente;
        if (m == 0) return 0;
        enAttente = 0;
        try poolManager.unlock(abi.encode(m)) {
            emit Verse(m);
            return m;
        } catch {
            enAttente = m;
            return 0;
        }
    }

    function unlockCallback(bytes calldata data) external seulementPoolManager returns (bytes memory) {
        uint256 m = abi.decode(data, (uint256));
        poolManager.burn(address(this), ETH.toId(), m);
        poolManager.take(ETH, feeWallet, m);
        return "";
    }

    /// @dev v4: the specified currency is currency0 (= ETH here) iff zeroForOne == exactInput
    function _ethSpecifie(IPoolManager.SwapParams calldata params) internal pure returns (bool) {
        return params.zeroForOne == (params.amountSpecified < 0);
    }

    function _prelever(PoolId id, uint256 frais) internal {
        try poolManager.take{gas: GAS_POUSSEE}(ETH, feeWallet, frais) {
            emit FraisPreleve(id, frais, true);
        } catch {
            poolManager.mint(address(this), ETH.toId(), frais);
            enAttente += frais;
            emit FraisPreleve(id, frais, false);
        }
    }

    // ── unused callbacks (permission bits off) ──
    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
