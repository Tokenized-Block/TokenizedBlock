// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/types/BeforeSwapDelta.sol";

/// @title TBlockQuoteFeeHookV9 — Tokenized Block "memestock" hook (sits BESIDE V8, never replaces it)
/// @notice One rule: the swap fee is ALWAYS taken in the QUOTE currency of the pool (native ETH, USDC,
///         cbBTC, a Coinbase tokenized stock, OUSD, ...), NEVER in the block token. Buys and sells,
///         exact-in and exact-out. The fee is HOOK_FEE pips of the quote amount (900 = 0.09 % = 9 bps,
///         Raksha 2026-10-01 22:15), 100 % to an IMMUTABLE fee wallet, no other recipient.
/// @dev ROUNDING: fee = floor(q * HOOK_FEE / 1e6) = floor(q * 9 / 10000), rounded DOWN (never above the
///      announced rate). q = the quote amount the pool moves: the specified amount (buy exact-in, sell
///      exact-out) or the filled quote (buy exact-out, sell exact-in). hookData is ignored.
/// @dev Instant Birth semantics are kept V8-compatible so the app flow can target this hook unchanged:
///        inscrire(PoolKey,uint160) payable · fraisVie dust · Create label (marker in contractURI) ·
///        payee/inscrit/prixInscrit getters · beforeInitialize pinned to the inscribed price ·
///        no swap until liquidity was added (garnie).
///      Quote list: FIXED at construction (no admin, no setter, no owner). Extending it = deploying a new
///      hook; existing pools are unaffected because the hook is part of every PoolKey.
///      Fee delivery: pushed to the fee wallet during the swap (gas-capped `take`). If the push fails
///      (issuer pause/freeze of the quote, PoolManager short of that token, wallet refuses ETH), the fee is
///      kept as ERC-6909 claims held by THIS hook and anyone can later push it with `verser` — a frozen
///      quote can never brick the pool, and the fee can only ever go to the fee wallet.
contract TBlockQuoteFeeHookV9 is IHooks, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    // ── errors (V8 names reused where the meaning is identical) ─────────────────────────────────
    error PasLePoolManager();
    error AdresseNulle();
    error FraisInvalide();
    error MauvaisHook();
    /// @dev neither side, or BOTH sides, are admitted quotes (block-as-quote / stock-vs-stock / block-vs-block)
    error PaireNonAdmise();
    error PasUnB20();
    error SansLabel();
    error PasAdminDuBlock();
    error MontantInsuffisant();
    error PasLeCreateur();
    error DejaOuverte();
    error PasInscrite();
    error PrixDifferent();
    error PoolVide();
    error EnvoiEchoue();
    error RemplissagePartiel();
    error HookNotImplemented();

    // ── events ──────────────────────────────────────────────────────────────────────────────────
    event Inscrite(PoolId indexed id, address indexed createur, address indexed devise, uint160 sqrtPriceX96, uint256 paye);
    /// @param verse true = pushed to the fee wallet now; false = kept as claims (see verser)
    event FraisPreleve(PoolId indexed id, address indexed devise, uint256 montant, bool verse);
    event Verse(address indexed devise, uint256 montant);

    // ── immutable configuration ─────────────────────────────────────────────────────────────────
    uint256 public constant DIVISEUR = 1_000_000;
    /// @dev hard ceiling so a mis-typed constructor argument cannot ship a predatory rate
    uint24 public constant FRAIS_MAX = 10_000; // 1 %
    /// @dev gas given to the fee push; on exhaustion the fee falls back to claims (never reverts the swap)
    uint256 public constant GAS_POUSSEE = 150_000;
    /// @dev gas given to the contractURI() read of the block
    uint256 public constant GAS_LABEL = 300_000;
    /// @dev B20 address format: 0xb2 followed by nine zero bytes (top 80 bits)
    uint160 internal constant PREFIXE_B20 = uint160(0xb2) << 152;
    uint160 internal constant MASQUE_PREFIXE = type(uint160).max << 80;

    IPoolManager public immutable poolManager;
    address public immutable feeWallet;
    uint256 public immutable fraisVie;
    /// @dev same getter name as V8; pips of 1e6 (900 = 0.09 %). Constructor value, no setter.
    uint24 public immutable HOOK_FEE;
    bool public immutable exigerB20;

    bytes public marqueur;
    mapping(address => bool) public deviseAdmise;
    address[] internal _devises;

    // ── per-pool state (V8-compatible getters) ──────────────────────────────────────────────────
    mapping(PoolId => address) public inscrit;
    mapping(PoolId => uint160) public prixInscrit;
    mapping(PoolId => bool) public payee;
    mapping(PoolId => bool) public garnie;
    /// @notice fee kept as ERC-6909 claims (by quote currency) waiting for `verser`
    mapping(Currency => uint256) public enAttente;

    modifier seulementPoolManager() {
        if (msg.sender != address(poolManager)) revert PasLePoolManager();
        _;
    }

    /// @param listeDevises admitted quotes besides native ETH (ETH is always admitted). Fixed forever.
    constructor(
        IPoolManager _poolManager,
        address _feeWallet,
        uint256 _fraisVie,
        uint24 _hookFee,
        bool _exigerB20,
        address[] memory listeDevises,
        bytes memory _marqueur
    ) {
        if (address(_poolManager) == address(0) || _feeWallet == address(0)) revert AdresseNulle();
        if (_hookFee == 0 || _hookFee > FRAIS_MAX) revert FraisInvalide();
        poolManager = _poolManager;
        feeWallet = _feeWallet;
        fraisVie = _fraisVie;
        HOOK_FEE = _hookFee;
        exigerB20 = _exigerB20;
        marqueur = _marqueur;

        deviseAdmise[address(0)] = true;
        _devises.push(address(0));
        for (uint256 i; i < listeDevises.length; ++i) {
            address d = listeDevises[i];
            if (d == address(0) || deviseAdmise[d]) continue;
            deviseAdmise[d] = true;
            _devises.push(d);
        }

        Hooks.validateHookPermissions(IHooks(address(this)), permissions());
    }

    // ── views ───────────────────────────────────────────────────────────────────────────────────
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

    function nombreDevises() external view returns (uint256) {
        return _devises.length;
    }

    function devises() external view returns (address[] memory) {
        return _devises;
    }

    function tailleMarqueur() external view returns (uint256) {
        return marqueur.length;
    }

    /// @notice does this block carry the Create label (marker inside contractURI())?
    function porteLeLabel(address bloc) public view returns (bool) {
        bytes memory m = marqueur;
        if (m.length == 0) return true;
        (bool ok, bytes memory ret) = bloc.staticcall{gas: GAS_LABEL}(abi.encodeWithSelector(0xe8a3d485));
        if (!ok || ret.length < 64) return false;
        string memory uri;
        try this.decoderTexte(ret) returns (string memory s) { uri = s; } catch { return false; }
        return _contient(bytes(uri), m);
    }

    /// @dev external only so a malformed return cannot revert porteLeLabel (try/catch needs an external call)
    function decoderTexte(bytes memory ret) external pure returns (string memory) {
        return abi.decode(ret, (string));
    }

    /// @notice (quote, block) of a key, or revert PaireNonAdmise. Exactly one side must be an admitted quote.
    function cotes(PoolKey calldata key) public view returns (Currency devise, Currency bloc) {
        bool a0 = deviseAdmise[Currency.unwrap(key.currency0)];
        bool a1 = deviseAdmise[Currency.unwrap(key.currency1)];
        if (a0 == a1) revert PaireNonAdmise();
        return a0 ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
    }

    function estB20(address t) public view returns (bool) {
        if ((uint160(t) & MASQUE_PREFIXE) != PREFIXE_B20) return false;
        if (t.code.length == 0) return false;
        bytes1 premier;
        assembly ("memory-safe") {
            let p := mload(0x40)
            extcodecopy(t, p, 0, 1)
            premier := mload(p)
        }
        return premier == 0xef;
    }

    /// @notice V8 parity (measured on the real node: V8 reverts PasAdminDuBlock() 0x37d927c1 for a non-admin
    ///         caller): only an account holding DEFAULT_ADMIN_ROLE (0x00) on the block may open its market.
    ///         Gas-capped staticcall; any failure / malformed return = not admin.
    function estAdminDuBlock(address bloc, address qui) public view returns (bool) {
        (bool ok, bytes memory ret) = bloc.staticcall{gas: GAS_LABEL}(abi.encodeWithSelector(0x91d14854, bytes32(0), qui));
        return ok && ret.length >= 32 && abi.decode(ret, (uint256)) == 1;
    }

    // ── Instant Birth ───────────────────────────────────────────────────────────────────────────
    /// @notice register (and pay to open) a NEW memestock market before the PoolManager initializes it.
    /// @dev same selector & argument layout as V8 (bb920fed). All msg.value goes to the fee wallet.
    function inscrire(PoolKey calldata key, uint160 sqrtPriceX96) external payable {
        if (address(key.hooks) != address(this)) revert MauvaisHook();
        (, Currency bloc) = cotes(key);
        address b = Currency.unwrap(bloc);
        if (exigerB20 && !estB20(b)) revert PasUnB20();
        if (!estAdminDuBlock(b, msg.sender)) revert PasAdminDuBlock();
        if (!porteLeLabel(b)) revert SansLabel();

        PoolId id = key.toId();
        (uint160 actuel,,,) = poolManager.getSlot0(id);
        if (actuel != 0) revert DejaOuverte();
        address deja = inscrit[id];
        if (deja != address(0) && deja != msg.sender) revert PasLeCreateur();
        if (!payee[id]) {
            if (msg.value < fraisVie) revert MontantInsuffisant();
            payee[id] = true;
        }
        inscrit[id] = msg.sender;
        prixInscrit[id] = sqrtPriceX96;
        if (msg.value > 0) {
            (bool ok,) = feeWallet.call{value: msg.value}("");
            if (!ok) revert EnvoiEchoue();
        }
        emit Inscrite(id, msg.sender, Currency.unwrap(key.currency0) == b ? Currency.unwrap(key.currency1) : Currency.unwrap(key.currency0), sqrtPriceX96, msg.value);
    }

    // ── pushing kept fees (permissionless, destination fixed) ───────────────────────────────────
    /// @notice push fees kept as claims (issuer freeze/pause fallback) to the fee wallet. Anyone may call;
    ///         the destination is the immutable fee wallet, never the caller.
    /// @return verse amount actually pushed. NEVER reverts: 0 if nothing is held, or if the push still fails
    ///         (issuer still frozen, PoolManager already unlocked) — the held amount then stays held.
    function verser(Currency devise) external returns (uint256 verse) {
        uint256 m = enAttente[devise];
        if (m == 0) return 0;
        enAttente[devise] = 0;
        try poolManager.unlock(abi.encode(devise, m)) {
            emit Verse(Currency.unwrap(devise), m);
            return m;
        } catch {
            enAttente[devise] = m;
            return 0;
        }
    }

    function unlockCallback(bytes calldata data) external seulementPoolManager returns (bytes memory) {
        (Currency devise, uint256 m) = abi.decode(data, (Currency, uint256));
        poolManager.burn(address(this), devise.toId(), m);
        poolManager.take(devise, feeWallet, m);
        return "";
    }

    // ── hook callbacks ──────────────────────────────────────────────────────────────────────────
    function beforeInitialize(address, PoolKey calldata key, uint160 sqrtPriceX96)
        external
        view
        seulementPoolManager
        returns (bytes4)
    {
        PoolId id = key.toId();
        if (!payee[id]) revert PasInscrite();
        if (prixInscrit[id] != sqrtPriceX96) revert PrixDifferent();
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

    /// @dev quote is the SPECIFIED currency (exact-in buy with quote, exact-out sell for quote):
    ///      the fee is taken here, on the specified amount, through the specified delta.
    function beforeSwap(address, PoolKey calldata key, IPoolManager.SwapParams calldata params, bytes calldata)
        external
        seulementPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        if (!garnie[id]) revert PoolVide();
        (bool devise0, bool deviseSpecifiee) = _sens(key, params);
        if (deviseSpecifiee) {
            uint256 montant = params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
            uint256 frais = montant * HOOK_FEE / DIVISEUR;
            if (frais > 0) {
                _prelever(id, devise0 ? key.currency0 : key.currency1, frais);
                return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(frais)), 0), 0);
            }
        }
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    /// @dev quote is the UNSPECIFIED currency (exact-in sell of the block, exact-out buy of the block):
    ///      the fee is taken here, on the quote amount the pool moved, through the unspecified delta.
    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external seulementPoolManager returns (bytes4, int128) {
        (bool devise0, bool deviseSpecifiee) = _sens(key, params);
        int128 dq = devise0 ? delta.amount0() : delta.amount1();
        if (deviseSpecifiee) {
            // The fee was taken in beforeSwap on the REQUESTED amount. A partial fill (price limit hit) would
            // charge it on more than was filled, so a quote-specified swap must fill completely or revert.
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
        _prelever(key.toId(), devise0 ? key.currency0 : key.currency1, frais);
        return (IHooks.afterSwap.selector, int128(int256(frais)));
    }

    // ── internals ───────────────────────────────────────────────────────────────────────────────
    /// @return devise0 the quote is currency0 · deviseSpecifiee the quote is the swap's specified currency
    function _sens(PoolKey calldata key, IPoolManager.SwapParams calldata params)
        internal
        view
        returns (bool devise0, bool deviseSpecifiee)
    {
        devise0 = deviseAdmise[Currency.unwrap(key.currency0)];
        // v4: specified currency is currency0 iff zeroForOne == exactInput
        bool specifie0 = params.zeroForOne == (params.amountSpecified < 0);
        deviseSpecifiee = (specifie0 == devise0);
    }

    function _prelever(PoolId id, Currency devise, uint256 frais) internal {
        try poolManager.take{gas: GAS_POUSSEE}(devise, feeWallet, frais) {
            emit FraisPreleve(id, Currency.unwrap(devise), frais, true);
        } catch {
            poolManager.mint(address(this), devise.toId(), frais);
            enAttente[devise] += frais;
            emit FraisPreleve(id, Currency.unwrap(devise), frais, false);
        }
    }

    function _contient(bytes memory h, bytes memory n) internal pure returns (bool) {
        if (n.length > h.length) return false;
        uint256 fin = h.length - n.length;
        for (uint256 i; i <= fin; ++i) {
            uint256 j;
            while (j < n.length && h[i + j] == n[j]) ++j;
            if (j == n.length) return true;
        }
        return false;
    }

    // ── unused callbacks (permission bits off; PoolManager never calls them) ────────────────────
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

    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure returns (bytes4) {
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
