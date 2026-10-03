// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {IERC20Minimal} from "v4-core/interfaces/external/IERC20Minimal.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/types/BeforeSwapDelta.sol";
import {LiquidityAmounts} from "./lib/LiquidityAmounts.sol";

/// @title TBlockLaunchLockHook — the "7030" quote-fee hook (fork-proven, not deployed)
/// @notice For block x quote pairs (the quote is ETH or one currency of the FIXED list; never the block):
///   0. FEE: `hookFee` pips of the quote to the immutable fee wallet, floor(q * hookFee / 1e6), computed alone.
///   1. CREATOR SHARE: `partCreateur` pips accrued as ERC-6909 claims held by the hook while the creator's ESCROW
///      (`inscrireAvecCaution`, at least the currency's immutable floor `plancherCaution`) is >= the minimum fixed at
///      registration and no exit is pending. Payout `reclamer` is permissionless to the fixed creator. Exit =
///      `demanderRetrait` (the share stops at once), then `retirerCaution` after `delaiRetrait`. While the gate is
///      closed the share feeds the block's collateral; `recharger` re-escrows and the share resumes at the minimum.
///      Per swap, the creator piece never exceeds the escrow.
///   2. COLLATERAL: `partCollateral` pips (+ the creator share while it is not flowing), claims per pool.
///      modeCollateral 0 off · 1 claims · 2 claims + single-sided quote wall · 3 conversion.
///   Every parameter is fixed at construction: no owner, no setter.
contract TBlockLaunchLockHook is IHooks, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    error PasLePoolManager();
    error AdresseNulle();
    error FraisInvalide();
    error MauvaisHook();
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
    error CreateurInactif();
    error DejaCautionne();
    error RetraitPasPret();
    error Reentrance();
    error ConversionInvalide();
    /// @dev constructor: an empty marker would make every token pass `porteLeLabel` (fail-open), forever.
    error MarqueurVide();
    /// @dev constructor: a zero delay would let the escrow leave in the same tx (flash-borrowable).
    error DelaiRetraitNul();
    /// @dev constructor: the floor list must match the currency list one to one, every floor > 0.
    error PlanchersInvalides();
    /// @dev constructor: a currency listed twice.
    error DeviseEnDouble();
    /// @dev `inscrireAvecCaution`: the escrow is below the currency's immutable floor (~$1, fixed at build).
    error CautionSousLePlancher(uint256 caution, uint256 plancher);
    /// the salt given does not derive this block's address from the CreateRouter (B20Factory CREATE2 tail)
    error PasNeDuRouteur();
    /// the life fee (and creation fee) is already paid for this pool: a re-registration must carry no ETH for fees
    error DejaPayee();

    event Inscrite(PoolId indexed id, address indexed createur, address indexed devise, uint160 sqrtPriceX96, uint256 paye);
    event Caution(PoolId indexed id, address indexed createur, uint256 montant);
    event FraisPreleve(PoolId indexed id, address indexed devise, uint256 montant, bool verse);
    event Parts(PoolId indexed id, uint256 createur, uint256 collateral);
    event Reclame(PoolId indexed id, address indexed createur, uint256 montant);
    event RetraitDemande(PoolId indexed id, uint256 des);
    event Recharge(PoolId indexed id, address indexed createur, uint256 montant, uint256 caution);
    event CautionRetiree(PoolId indexed id, address indexed createur, uint256 montant);
    event Deploye(PoolId indexed id, int24 tickLower, int24 tickUpper, uint256 montant);
    event Converti(PoolId indexed id, uint256 entree, uint256 sortie);
    event Verse(address indexed devise, uint256 montant);

    struct Config {
        IPoolManager poolManager;
        address feeWallet;
        uint256 fraisVie;
        uint24 hookFee; // pips, fee wallet only (900 = 0.09 %)
        uint24 partCreateur; // pips
        uint24 partCollateral; // pips
        uint8 modeCollateral; // 0..3, see title
        bool ancre;
        int24 largeur; // width of the liquidity wall, in ticks (multiple of the pool tick spacing)
        uint128 seuil; // mode 2: place liquidity once the block's collateral reaches this many quote units
        uint32 delaiRetrait; // seconds between demanderRetrait and retirerCaution
        bool exigerB20;
        address[] devises;
        bytes marqueur;
        PoolKey conversion; // mode 3: hookless pool (quote, stock)
        uint256 plancherEth; // floor of the ETH escrow, wei
        uint256[] planchers; // floor of each currency's escrow, raw units, same order as `devises`
        address createRouter; // the TB CreateRouter: blocks it created are proven by their B20Factory salt
        uint256 fraisCreation; // wei: the Create fee, charged at registration when no CreateRouter proof is given
    }

    uint256 public constant DIVISEUR = 1_000_000;
    uint24 public constant FRAIS_MAX = 10_000;
    uint256 public constant GAS_POUSSEE = 150_000;
    /// ⛔⛔ 2026-10-02 — 300 000 FAISAIT PLANTER TOUT VRAI CREATE (Zero 1, relaye par C2 ; confirme sur fork).
    ///   `contractURI()` d un B20 se lit a ~65,6 gas/octet a FROID (2 100 gas par slot de 32 octets) : mesure
    ///   mainnet 620 o -> ~45 000 gas d execution, fork froid 44 788. L app grave le SVG du block en `image_data` :
    ///   faces jusqu a 19 135 octets, factory acceptant 40 000. A 300 000, la lecture echouait des ~4 500 octets,
    ///   `porteLeLabel` rendait faux, et l inscription revertait `SansLabel`. Les bancs passaient : URI de 88 o,
    ///   et stockage CHAUD (block cree dans la meme transaction). 3 000 000 couvre 40 000 o a froid (~2,65 M).
    ///   Appele une seule fois, a l inscription — jamais dans un swap.
    /// @dev (re-mine 40, Zero 1) cap taken from 163b627 unchanged. Real Base node, eth_estimateGas of contractURI():
    ///   live faces 6,966 B -> 486k, 14,152 B -> 962k. Fail-closed: a failed or starved read (cap or 63/64 rule)
    ///   returns false -> SansLabel (test/Remine40.fork.t.sol, M4 killers).
    uint256 public constant GAS_LABEL = 3_000_000;
    /// @dev gas for the block's hasRole() read (constant size).
    uint256 public constant GAS_ROLE = 300_000;
    uint160 internal constant PREFIXE_B20 = uint160(0xb2) << 152;
    uint160 internal constant MASQUE_PREFIXE = type(uint160).max << 80;
    uint8 internal constant OP_VERSER = 1;
    uint8 internal constant OP_CAUTION = 2;
    uint8 internal constant OP_RECLAMER = 3;
    uint8 internal constant OP_RETIRER = 4;
    uint8 internal constant OP_DEPLOYER = 5;

    IPoolManager public immutable poolManager;
    address public immutable feeWallet;
    uint256 public immutable fraisVie;
    uint24 public immutable HOOK_FEE;
    uint24 public immutable PART_CREATEUR;
    uint24 public immutable PART_COLLATERAL;
    uint8 public immutable MODE_COLLATERAL;
    bool public immutable ANCRE;
    int24 public immutable LARGEUR;
    uint128 public immutable SEUIL;
    uint32 public immutable DELAI_RETRAIT;
    bool public immutable exigerB20;
    /// @notice the TB CreateRouter. A block it created sits at 0xb2 · 0^10 · bytes9(keccak256(abi.encode(router, salt))).
    address public immutable createRouter;
    /// @notice wei charged on top of `fraisVie` by a registration that does not prove CreateRouter provenance
    uint256 public immutable fraisCreation;

    bytes public marqueur;
    mapping(address => bool) public deviseAdmise;
    /// raw floor of the creator escrow per admitted currency (address(0) = ETH), fixed at construction
    mapping(address => uint256) public plancherCaution;
    PoolKey internal _conversion;

    // ── per-pool state ──────────────────────────────────────────────────────────────────────────
    mapping(PoolId => address) public inscrit;
    mapping(PoolId => uint160) public prixInscrit;
    mapping(PoolId => bool) public payee;
    mapping(PoolId => bool) public garnie;
    /// slot: creator (fixed at registration = the admin who registered) · withdrawal time · liquidity nonce
    struct Createur {
        address qui;
        uint64 retraitDes;
        uint32 nDeploy;
    }
    mapping(PoolId => Createur) public createurs;
    /// raw quote units currently escrowed (claims held by the hook)
    mapping(PoolId => uint256) public caution;
    /// the minimum fixed at registration (= the first escrow); the share flows only while caution >= minimum
    mapping(PoolId => uint256) public minimumCaution;
    /// slot: creator share accrued · collateral not yet placed (both raw quote units, claims held by the hook)
    struct Compte {
        uint128 duCreateur;
        uint128 collateral;
    }
    mapping(PoolId => Compte) public comptes;
    struct Ancre {
        int24 tick;
        uint64 bloc;
    }
    mapping(PoolId => Ancre) public ancres;
    /// mode 2: quote placed as liquidity · mode 3: stock units bought (claims)
    mapping(PoolId => uint256) public place;
    mapping(Currency => uint256) public enAttente;

    modifier seulementPoolManager() {
        if (msg.sender != address(poolManager)) revert PasLePoolManager();
        _;
    }

    modifier nonReentrant() {
        assembly ("memory-safe") {
            if tload(0x7e) {
                mstore(0, 0xc07c7e13) // Reentrance()
                revert(0x1c, 4)
            }
            tstore(0x7e, 1)
        }
        _;
        assembly ("memory-safe") {
            tstore(0x7e, 0)
        }
    }

    constructor(Config memory c) {
        if (address(c.poolManager) == address(0) || c.feeWallet == address(0)) revert AdresseNulle();
        if (c.hookFee == 0 || uint256(c.hookFee) + c.partCreateur + c.partCollateral > FRAIS_MAX) revert FraisInvalide();
        if (c.modeCollateral > 3) revert FraisInvalide();
        if (c.marqueur.length == 0) revert MarqueurVide();
        if (c.delaiRetrait == 0) revert DelaiRetraitNul();
        if (c.plancherEth == 0 || c.planchers.length != c.devises.length) revert PlanchersInvalides();
        if (c.createRouter == address(0)) revert AdresseNulle();
        if (c.fraisCreation == 0) revert FraisInvalide();
        if (c.modeCollateral == 3) {
            if (address(c.conversion.hooks) != address(0)) revert ConversionInvalide();
            _conversion = c.conversion;
        }
        poolManager = c.poolManager;
        feeWallet = c.feeWallet;
        fraisVie = c.fraisVie;
        HOOK_FEE = c.hookFee;
        PART_CREATEUR = c.partCreateur;
        PART_COLLATERAL = c.partCollateral;
        MODE_COLLATERAL = c.modeCollateral;
        ANCRE = c.ancre;
        LARGEUR = c.largeur;
        SEUIL = c.seuil;
        DELAI_RETRAIT = c.delaiRetrait;
        exigerB20 = c.exigerB20;
        createRouter = c.createRouter;
        fraisCreation = c.fraisCreation;
        marqueur = c.marqueur;
        deviseAdmise[address(0)] = true;
        plancherCaution[address(0)] = c.plancherEth;
        for (uint256 i; i < c.devises.length; ++i) {
            address d = c.devises[i];
            if (d == address(0)) revert AdresseNulle(); // ETH is implicit
            if (deviseAdmise[d]) revert DeviseEnDouble();
            if (c.planchers[i] == 0) revert PlanchersInvalides();
            deviseAdmise[d] = true;
            plancherCaution[d] = c.planchers[i];
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

    /// @notice does this token's contractURI carry our marker (an engraved TB face)? Fail-closed on any failure.
    ///         A shape check, not an identity proof: anyone can engrave the same shape (see Devises7030 for why the
    ///         QUOTE side is a fixed list and the block side cannot be).
    function porteLeLabel(address bloc) public view returns (bool) {
        (bool ok, bytes memory ret) = bloc.staticcall{gas: GAS_LABEL}(abi.encodeWithSelector(0xe8a3d485));
        if (!ok || ret.length < 64) return false;
        string memory uri;
        try this.decoderTexte(ret) returns (string memory s) { uri = s; } catch { return false; }
        return _contient(bytes(uri), marqueur);
    }

    function decoderTexte(bytes memory ret) external pure returns (string memory) {
        return abi.decode(ret, (string));
    }

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

    /// @notice provenance: was `bloc` created by the CreateRouter with B20Factory salt `sel`? The factory derives the
    ///         address from (deployer, salt) only: 0xb2, ten zero bytes, then the first 9 bytes of
    ///         keccak256(abi.encode(deployer, salt)); CreateRouter.createPaid passes the creator's salt unchanged.
    ///         A block made straight through the factory has deployer != router, so no salt maps it here (short of a
    ///         72-bit collision search, see plan/PLAN-DEPLOY-HOOK-7030.md). Pure arithmetic: ~100 gas.
    function neDuRouteur(address bloc, bytes32 sel) public view returns (bool) {
        uint160 attendu = PREFIXE_B20 | uint160(uint72(bytes9(keccak256(abi.encode(createRouter, sel)))));
        return uint160(bloc) == attendu;
    }

    function estAdminDuBlock(address bloc, address qui) public view returns (bool) {
        (bool ok, bytes memory ret) = bloc.staticcall{gas: GAS_ROLE}(abi.encodeWithSelector(0x91d14854, bytes32(0), qui));
        return ok && ret.length >= 32 && abi.decode(ret, (uint256)) == 1;
    }

    /// @notice is the creator share flowing for this pool right now? (escrow mode: escrow in place, no exit asked)
    function createurActif(PoolId id) public view returns (bool) {
        Createur memory k = createurs[id];
        if (k.qui == address(0) || k.retraitDes != 0) return false;
        uint256 mn = minimumCaution[id];
        return mn != 0 && caution[id] >= mn;
    }

    // ── registration ────────────────────────────────────────────────────────────────────────────
    /// @notice V8/V9-compatible registration (selector bb920fed): no creator share for this pool. Without a
    ///         CreateRouter proof the block may come straight from the factory, which skipped the Create fee: the
    ///         first payment is fraisVie + fraisCreation.
    function inscrire(PoolKey calldata key, uint160 sqrtPriceX96) external payable nonReentrant {
        _inscrire(key, sqrtPriceX96, false, 0);
    }

    /// @notice registration of a CreateRouter block, proven by its factory salt `sel`: the first payment is fraisVie.
    function inscrire(PoolKey calldata key, uint160 sqrtPriceX96, bytes32 sel) external payable nonReentrant {
        _inscrire(key, sqrtPriceX96, true, sel);
    }

    function _inscrire(PoolKey calldata key, uint160 sqrtPriceX96, bool preuve, bytes32 sel) internal {
        (PoolId id,) = _verifier(key);
        _payer(id, msg.value, _du(key, preuve, sel));
        inscrit[id] = msg.sender;
        prixInscrit[id] = sqrtPriceX96;
        emit Inscrite(id, msg.sender, Currency.unwrap(_devise(key)), sqrtPriceX96, msg.value);
    }

    /// @notice registration WITH a creator share. The creator (= msg.sender, an admin of the block) escrows
    ///         `minimum` raw units of the QUOTE in the hook, as PoolManager claims; at least the currency's
    ///         immutable floor `plancherCaution` (else `CautionSousLePlancher`). The minimum is fixed at creation and
    ///         cannot be flash-borrowed: it is locked from before the pool exists until `delaiRetrait` after an exit
    ///         request (during which the share no longer flows). ETH quote: msg.value = fees (if unpaid) + minimum.
    ///         Fees as `inscrire`: fraisVie + fraisCreation without a CreateRouter proof, fraisVie with one.
    function inscrireAvecCaution(PoolKey calldata key, uint160 sqrtPriceX96, uint128 minimum)
        external
        payable
        nonReentrant
    {
        _inscrireAvecCaution(key, sqrtPriceX96, minimum, false, 0);
    }

    function inscrireAvecCaution(PoolKey calldata key, uint160 sqrtPriceX96, uint128 minimum, bytes32 sel)
        external
        payable
        nonReentrant
    {
        _inscrireAvecCaution(key, sqrtPriceX96, minimum, true, sel);
    }

    function _inscrireAvecCaution(PoolKey calldata key, uint160 sqrtPriceX96, uint128 minimum, bool preuve, bytes32 sel)
        internal
    {
        if (PART_CREATEUR == 0 || minimum == 0) revert CreateurInactif();
        (PoolId id, Currency devise) = _verifier(key);
        if (createurs[id].qui != address(0)) revert DejaCautionne();
        uint256 pourFrais = msg.value;
        if (devise.isAddressZero()) {
            if (msg.value < minimum) revert MontantInsuffisant();
            pourFrais = msg.value - minimum;
        }
        _payer(id, pourFrais, _du(key, preuve, sel));
        inscrit[id] = msg.sender;
        prixInscrit[id] = sqrtPriceX96;
        bytes memory r = poolManager.unlock(abi.encode(OP_CAUTION, devise, msg.sender, uint256(minimum)));
        uint256 recu = abi.decode(r, (uint256));
        uint256 plancher = plancherCaution[Currency.unwrap(devise)];
        if (recu < plancher) revert CautionSousLePlancher(recu, plancher);
        createurs[id] = Createur(msg.sender, 0, 0);
        caution[id] = recu;
        minimumCaution[id] = recu;
        emit Inscrite(id, msg.sender, Currency.unwrap(devise), sqrtPriceX96, msg.value);
        emit Caution(id, msg.sender, recu);
    }

    // ── creator: claim / exit ───────────────────────────────────────────────────────────────────
    /// @notice push the accrued creator share to the creator (destination fixed). Anyone may call.
    ///         Never reverts on a frozen creator / quote: returns 0 and keeps the amount.
    function reclamer(PoolKey calldata key) external nonReentrant returns (uint256 m) {
        PoolId id = key.toId();
        Compte storage c = comptes[id];
        m = c.duCreateur;
        if (m == 0) return 0;
        address qui = createurs[id].qui;
        c.duCreateur = 0;
        try poolManager.unlock(abi.encode(OP_RECLAMER, _devise(key), qui, m)) {
            emit Reclame(id, qui, m);
        } catch {
            c.duCreateur = uint128(m);
            return 0;
        }
    }

    function demanderRetrait(PoolKey calldata key) external nonReentrant {
        PoolId id = key.toId();
        Createur storage k = createurs[id];
        if (msg.sender != k.qui) revert PasLeCreateur();
        if (k.retraitDes == 0) {
            k.retraitDes = uint64(block.timestamp + DELAI_RETRAIT);
            emit RetraitDemande(id, k.retraitDes);
        }
    }

    function retirerCaution(PoolKey calldata key) external nonReentrant {
        PoolId id = key.toId();
        Createur storage k = createurs[id];
        if (msg.sender != k.qui) revert PasLeCreateur();
        if (k.retraitDes == 0 || block.timestamp < k.retraitDes) revert RetraitPasPret();
        uint256 m = caution[id];
        caution[id] = 0;
        if (m > 0) {
            poolManager.unlock(abi.encode(OP_RETIRER, _devise(key), k.qui, m));
            emit CautionRetiree(id, k.qui, m);
        }
    }

    /// @notice re-escrow (creator only). Cancels a pending exit; the share resumes as soon as the escrow is back
    ///         >= the minimum fixed at registration (below it, the share keeps feeding the collateral). Flash-loan
    ///         proof: whatever is escrowed can only leave through demanderRetrait + delaiRetrait (share stopped).
    ///         ETH quote: msg.value = montant.
    function recharger(PoolKey calldata key, uint128 montant) external payable nonReentrant {
        PoolId id = key.toId();
        Createur storage k = createurs[id];
        if (msg.sender != k.qui) revert PasLeCreateur();
        Currency devise = _devise(key);
        if (devise.isAddressZero() ? msg.value != montant : msg.value != 0) revert MontantInsuffisant();
        uint256 recu;
        if (montant > 0) {
            bytes memory r = poolManager.unlock(abi.encode(OP_CAUTION, devise, msg.sender, uint256(montant)));
            recu = abi.decode(r, (uint256));
        }
        k.retraitDes = 0;
        uint256 c = caution[id] + recu;
        caution[id] = c;
        emit Recharge(id, msg.sender, recu, c);
    }

    // ── collateral ──────────────────────────────────────────────────────────────────────────────
    /// @notice permissionless: place the block's accrued collateral as single-sided QUOTE liquidity
    ///         (a buy wall for the block under the anchored price). The positions belong to the hook, which
    ///         has no remove path: the collateral can never be pulled out (no rug, no admin).
    function deployerCollateral(PoolKey calldata key) external nonReentrant returns (uint256 m) {
        if (MODE_COLLATERAL != 2) return 0;
        bytes memory r = poolManager.unlock(abi.encode(OP_DEPLOYER, key));
        m = abi.decode(r, (uint256));
    }

    function verser(Currency devise) external nonReentrant returns (uint256 verse) {
        uint256 m = enAttente[devise];
        if (m == 0) return 0;
        enAttente[devise] = 0;
        try poolManager.unlock(abi.encode(OP_VERSER, devise, feeWallet, m)) {
            emit Verse(Currency.unwrap(devise), m);
            return m;
        } catch {
            enAttente[devise] = m;
            return 0;
        }
    }

    function unlockCallback(bytes calldata data) external seulementPoolManager returns (bytes memory) {
        uint8 op = abi.decode(data[:32], (uint8));
        if (op == OP_DEPLOYER) {
            (, PoolKey memory key) = abi.decode(data, (uint8, PoolKey));
            bool d0 = deviseAdmise[Currency.unwrap(key.currency0)];
            return abi.encode(_deployer(key, key.toId(), d0));
        }
        (, Currency devise, address qui, uint256 m) = abi.decode(data, (uint8, Currency, address, uint256));
        if (op == OP_CAUTION) {
            poolManager.sync(devise);
            uint256 paye;
            if (devise.isAddressZero()) {
                paye = poolManager.settle{value: m}();
            } else {
                // pulled straight from the creator into the PoolManager (approval to this hook)
                if (!IERC20Minimal(Currency.unwrap(devise)).transferFrom(qui, address(poolManager), m)) revert EnvoiEchoue();
                paye = poolManager.settle();
            }
            poolManager.mint(address(this), devise.toId(), paye);
            return abi.encode(paye);
        }
        // OP_VERSER, OP_RECLAMER, OP_RETIRER: burn the hook's claims, pay the fixed destination
        poolManager.burn(address(this), devise.toId(), m);
        poolManager.take(devise, qui, m);
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

    function beforeSwap(address, PoolKey calldata key, IPoolManager.SwapParams calldata params, bytes calldata)
        external
        seulementPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        if (!garnie[id]) revert PoolVide();
        if (ANCRE) _ancrer(id);
        (bool devise0, bool deviseSpecifiee) = _sens(key, params);
        if (deviseSpecifiee) {
            uint256 montant = params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
            uint256 t = _repartir(id, key, devise0, montant);
            if (t > 0) return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(t)), 0), 0);
        }
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external seulementPoolManager returns (bytes4, int128) {
        (bool devise0, bool deviseSpecifiee) = _sens(key, params);
        PoolId id = key.toId();
        int128 dq = devise0 ? delta.amount0() : delta.amount1();
        int128 retour;
        if (deviseSpecifiee) {
            _verifierRemplissage(id, params.amountSpecified, dq);
        } else {
            uint256 montant = dq < 0 ? uint256(-int256(dq)) : uint256(int256(dq));
            retour = int128(int256(_repartir(id, key, devise0, montant)));
        }
        if (MODE_COLLATERAL == 2 && comptes[id].collateral >= SEUIL) _deployer(key, id, devise0);
        return (IHooks.afterSwap.selector, retour);
    }

    /// @dev quote-specified swap: the fee was charged in beforeSwap on the REQUESTED amount, so it must fill fully.
    function _verifierRemplissage(PoolId id, int256 spec, int128 dq) internal view {
        uint256 demande = spec < 0 ? uint256(-spec) : uint256(spec);
        (uint256 fw, uint256 cr, uint256 co) = _parts(id, demande);
        uint256 t = fw + cr + co;
        uint256 attendu = spec < 0 ? demande - t : demande + t;
        uint256 rempli = dq < 0 ? uint256(-int256(dq)) : uint256(int256(dq));
        if (rempli != attendu) revert RemplissagePartiel();
    }

    // ── internals ───────────────────────────────────────────────────────────────────────────────
    function _verifier(PoolKey calldata key) internal view returns (PoolId id, Currency devise) {
        if (address(key.hooks) != address(this)) revert MauvaisHook();
        Currency bloc;
        (devise, bloc) = cotes(key);
        address b = Currency.unwrap(bloc);
        if (exigerB20 && !estB20(b)) revert PasUnB20();
        if (!estAdminDuBlock(b, msg.sender)) revert PasAdminDuBlock();
        if (!porteLeLabel(b)) revert SansLabel();
        id = key.toId();
        (uint160 actuel,,,) = poolManager.getSlot0(id);
        if (actuel != 0) revert DejaOuverte();
        address deja = inscrit[id];
        if (deja != address(0) && deja != msg.sender) revert PasLeCreateur();
    }

    /// @dev fees due by a first registration: with a salt, the salt must prove CreateRouter provenance (else
    ///      PasNeDuRouteur) and only fraisVie is due; without one, the Create fee the factory path skipped is added.
    function _du(PoolKey calldata key, bool preuve, bytes32 sel) internal view returns (uint256) {
        if (!preuve) return fraisVie + fraisCreation;
        (, Currency bloc) = cotes(key);
        if (!neDuRouteur(Currency.unwrap(bloc), sel)) revert PasNeDuRouteur();
        return fraisVie;
    }

    /// @dev fees are paid once per pool: the first registration pays `du` (or more, all forwarded); a re-registration
    ///      before the pool opens must carry no fee ETH (DejaPayee), so nothing is forwarded twice.
    function _payer(PoolId id, uint256 v, uint256 du) internal {
        if (payee[id]) {
            if (v != 0) revert DejaPayee();
            return;
        }
        if (v < du) revert MontantInsuffisant();
        payee[id] = true;
        if (v > 0) {
            (bool ok,) = feeWallet.call{value: v}("");
            if (!ok) revert EnvoiEchoue();
        }
    }

    function _devise(PoolKey calldata key) internal view returns (Currency) {
        return deviseAdmise[Currency.unwrap(key.currency0)] ? key.currency0 : key.currency1;
    }

    function _sens(PoolKey calldata key, IPoolManager.SwapParams calldata params)
        internal
        view
        returns (bool devise0, bool deviseSpecifiee)
    {
        devise0 = deviseAdmise[Currency.unwrap(key.currency0)];
        bool specifie0 = params.zeroForOne == (params.amountSpecified < 0);
        deviseSpecifiee = (specifie0 == devise0);
    }

    /// @dev the three pieces of one swap. fw is computed ALONE (identical to V9 to the wei).
    function _parts(PoolId id, uint256 q) internal view returns (uint256 fw, uint256 cr, uint256 co) {
        fw = q * HOOK_FEE / DIVISEUR;
        if (PART_CREATEUR != 0) {
            cr = q * PART_CREATEUR / DIVISEUR;
            if (!createurActif(id)) {
                // gate closed: the creator piece feeds the block's collateral (or is not charged at all)
                if (MODE_COLLATERAL != 0) co = cr;
                cr = 0;
            } else {
                // per-swap cap: the creator piece never exceeds the escrow (same currency). Reads only `caution`,
                // which `_repartir` never writes, so the beforeSwap and afterSwap calls of `_parts` agree.
                // The surplus goes to the collateral (modes 1-3) or is not charged (mode 0).
                uint256 plafond = caution[id];
                if (cr > plafond) {
                    uint256 trop = cr - plafond;
                    cr = plafond;
                    if (MODE_COLLATERAL != 0) co = trop;
                }
            }
        }
        if (MODE_COLLATERAL != 0) co += q * PART_COLLATERAL / DIVISEUR;
    }

    function _repartir(PoolId id, PoolKey calldata key, bool devise0, uint256 q) internal returns (uint256 t) {
        (uint256 fw, uint256 cr, uint256 co) = _parts(id, q);
        t = fw + cr + co;
        if (t == 0) return 0;
        Currency devise = devise0 ? key.currency0 : key.currency1;
        if (fw > 0) _prelever(id, devise, fw);
        if (cr + co == 0) return t;
        if (MODE_COLLATERAL == 3 && co > 0 && _convertir(id, devise, co)) co = 0;
        uint256 garde = cr + co;
        if (garde > 0) {
            poolManager.mint(address(this), devise.toId(), garde);
            Compte storage c = comptes[id];
            if (cr > 0) c.duCreateur += uint128(cr);
            if (co > 0) c.collateral += uint128(co);
        }
        emit Parts(id, cr, co);
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

    /// @dev mode 3: swap the collateral piece quote -> stock on the hookless conversion pool, INSIDE the
    ///      current unlock (flash accounting nets it). Never bricks the swap: on failure, keep the quote.
    function _convertir(PoolId id, Currency devise, uint256 m) internal returns (bool) {
        PoolKey memory k = _conversion;
        bool zeroForOne;
        Currency action;
        if (Currency.unwrap(k.currency0) == Currency.unwrap(devise)) {
            zeroForOne = true;
            action = k.currency1;
        } else if (Currency.unwrap(k.currency1) == Currency.unwrap(devise)) {
            action = k.currency0;
        } else {
            return false;
        }
        try poolManager.swap(
            k,
            IPoolManager.SwapParams(zeroForOne, -int256(m), zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1),
            ""
        ) returns (BalanceDelta d) {
            int128 sortie = zeroForOne ? d.amount1() : d.amount0();
            int128 entree = zeroForOne ? d.amount0() : d.amount1();
            if (sortie <= 0) return false;
            if (uint256(-int256(entree)) != m) revert RemplissagePartiel();
            poolManager.mint(address(this), action.toId(), uint256(int256(sortie)));
            place[id] += uint256(int256(sortie));
            emit Converti(id, m, uint256(int256(sortie)));
            return true;
        } catch {
            return false;
        }
    }

    function _ancrer(PoolId id) internal {
        Ancre storage a = ancres[id];
        if (a.bloc != uint64(block.number)) {
            (, int24 tick,,) = poolManager.getSlot0(id);
            a.tick = tick;
            a.bloc = uint64(block.number);
        }
    }

    /// @dev single-sided quote liquidity, entirely on the "block gets cheaper" side of the anchored price.
    function _deployer(PoolKey memory key, PoolId id, bool devise0) internal returns (uint256 du) {
        uint256 dispo = comptes[id].collateral;
        if (dispo == 0) return 0;
        (int24 tl, int24 tu) = _plage(key, id, devise0);
        if (tl >= tu) return 0;
        uint128 L = devise0
            ? LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(tl), TickMath.getSqrtPriceAtTick(tu), dispo)
            : LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(tl), TickMath.getSqrtPriceAtTick(tu), dispo);
        if (L == 0) return 0;
        du = _placer(key, id, devise0, tl, tu, L);
        comptes[id].collateral = uint128(dispo - du);
        place[id] += du;
        emit Deploye(id, tl, tu, du);
    }

    function _plage(PoolKey memory key, PoolId id, bool devise0) internal view returns (int24 tl, int24 tu) {
        (, int24 tick,,) = poolManager.getSlot0(id);
        if (ANCRE) {
            Ancre memory a = ancres[id];
            if (a.bloc == uint64(block.number)) {
                // quote = currency0: block cheaper = higher tick ; quote = currency1: block cheaper = lower tick
                if (devise0 ? a.tick > tick : a.tick < tick) tick = a.tick;
            }
        }
        int24 s = key.tickSpacing;
        int24 base = _plancher(tick, s);
        if (devise0) {
            tl = base + s;
            tu = tl + LARGEUR;
            int24 mx = TickMath.maxUsableTick(s);
            if (tu > mx) tu = mx;
        } else {
            tu = base;
            tl = tu - LARGEUR;
            int24 mn = TickMath.minUsableTick(s);
            if (tl < mn) tl = mn;
        }
    }

    function _placer(PoolKey memory key, PoolId id, bool devise0, int24 tl, int24 tu, uint128 L)
        internal
        returns (uint256 du)
    {
        bytes32 sel = keccak256(abi.encode(id, createurs[id].nDeploy++));
        (BalanceDelta cd,) =
            poolManager.modifyLiquidity(key, IPoolManager.ModifyLiquidityParams(tl, tu, int256(uint256(L)), sel), "");
        du = _quoteSeule(cd, devise0);
        poolManager.burn(address(this), (devise0 ? key.currency0 : key.currency1).toId(), du);
    }

    /// @dev the placed position must be quote-only (the block side owed must be exactly 0)
    function _quoteSeule(BalanceDelta cd, bool devise0) internal pure returns (uint256) {
        int128 dq = devise0 ? cd.amount0() : cd.amount1();
        int128 db = devise0 ? cd.amount1() : cd.amount0();
        if (db != 0 || dq >= 0) revert ConversionInvalide();
        return uint256(-int256(dq));
    }

    function _plancher(int24 t, int24 s) internal pure returns (int24) {
        int24 q = t / s;
        if (t < 0 && t % s != 0) q -= 1;
        return q * s;
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
