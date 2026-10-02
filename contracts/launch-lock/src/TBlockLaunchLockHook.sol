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

interface IBloc24hArmable {
    function armer() external returns (uint256 fin);
    function restrictionsEndAt() external view returns (uint256);
}

/// @title TBlockLaunchLockHook — PROTOTYPE, FORK-PROVEN ONLY, NOT DEPLOYED (2026-10-02, branch feat/launch-lock-24h)
/// @notice Zero 1's V9-collateral spike, cleaned and completed for the memestock (block x tokenized stock) pairs:
///   0. FEE (V9): `hookFee` pips of the QUOTE (the paired stock / ETH / USDC — never the block) to the immutable
///      fee wallet, floor(q * hookFee / 1e6) computed ALONE (identical to V9 to the wei when the parts are 0).
///   1. CREATOR SHARE (anti flash-loan): `partCreateur` pips accrued as ERC-6909 claims held by the hook while the
///      creator's ESCROW (>= the minimum fixed at registration, `inscrireAvecCaution`) is in place and no exit is
///      pending. Payout `reclamer` is permissionless to the fixed creator. Exit = `demanderRetrait` (share stops at
///      once) then `retirerCaution` after `delaiRetrait` (7 days). Below the minimum the share feeds the block's
///      collateral; `recharger` re-escrows and the share resumes once the escrow is back >= the minimum.
///   2. COLLATERAL: `partCollateral` pips (+ the creator share while it is not flowing), claims per pool.
///      modeCollateral 0 off · 1 claims · 2 claims + single-sided quote wall · 3 conversion (see spike note).
///   3. 24H CRADLE (`suivi24h`, needs exigerB20 = false and a TBlockBloc24h block): `beforeInitialize` ARMS the
///      block's 24 h window at BIRTH (first pool initialization), afterSwap / afterAddLiquidity expose per-tx
///      hooked block flows (transient) to the token, beforeRemoveLiquidity refuses removals during the window.
///   Every piece is fixed at construction (no owner, no setter). The rejected creator gates of the spike
///   (balanceOf at claim / per swap, flash-loanable) are REMOVED.
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
    error RetraitBloque24h();
    error ConfigIncompatible();
    /// @dev marqueur vide au constructeur : il desactiverait entierement la verification du label,
    ///      et sans setter l etat serait definitif. Voir `porteLeLabel`.
    error MarqueurVide();
    /// @dev delai de retrait nul au constructeur : la caution ressortirait dans le meme bloc, et
    ///      l invariant « cannot be flash-borrowed » tomberait. Voir le constructeur.
    error DelaiRetraitNul();
    error PasUnBloc24h();

    event Inscrite(PoolId indexed id, address indexed createur, address indexed devise, uint160 sqrtPriceX96, uint256 paye);
    event Caution(PoolId indexed id, address indexed createur, uint256 montant);
    event FraisPreleve(PoolId indexed id, address indexed devise, uint256 montant, bool verse);
    event Parts(PoolId indexed id, uint256 createur, uint256 collateral);
    event Reclame(PoolId indexed id, address indexed createur, uint256 montant);
    event RetraitDemande(PoolId indexed id, uint256 des);
    event Recharge(PoolId indexed id, address indexed createur, uint256 montant, uint256 caution);
    event CautionRetiree(PoolId indexed id, address indexed createur, uint256 montant);
    event Berceau(address indexed bloc, PoolId indexed id, uint256 fin);
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
        bool suivi24h; // Section C: expose per-tx hooked block flows to a restricted (non-B20) block token
    }

    uint256 public constant DIVISEUR = 1_000_000;
    uint24 public constant FRAIS_MAX = 10_000;
    uint256 public constant GAS_POUSSEE = 150_000;
    uint256 public constant GAS_LABEL = 300_000;
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
    /// Section C: when true, afterSwap/afterAddLiquidity record (transient) the block amounts OUR pools move,
    /// and beforeRemoveLiquidity refuses removals while the block's restriction window is open.
    bool public immutable SUIVI_24H;

    bytes public marqueur;
    mapping(address => bool) public deviseAdmise;
    address[] internal _devises;
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
    /// F1 (Zero 1 crosscheck 2026-10-02): true once the block has had a hooked swap that moved the block (any of
    /// OUR pools). Read by the TBlockBloc24h token: the seeder's seed exemption needs `!echange[block]`. Never reset.
    mapping(address => bool) public echange;

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
        // ⛔⛔⛔ LE MARQUEUR NE PEUT PAS ETRE VIDE — ajoute le 2026-10-02, et c est LE correctif du
        //      fail-open de `porteLeLabel`. Un marqueur vide y rendait `true` pour toute adresse :
        //      la verification du label sautait entierement, et n importe quel jeton pouvait
        //      inscrire une pool sur ce hook. `marqueur` est en storage, pose ICI et nulle part
        //      ailleurs (aucun setter, par conception adminless) : l erreur aurait ete DEFINITIVE.
        //   ⛔ ON VALIDE A LA FRONTIERE OU C EST ENCORE REPARABLE — le deploiement — plutot que dans
        //     le chemin chaud, ou refuser aurait brique le hook.
        // ⛔⛔ CORRECTION D UNE AFFIRMATION A MOI. J avais ecrit ici : « les autres champs de la
        //    Config sont deja valides ; `marqueur` etait le SEUL a ne pas l etre ». C etait FAUX, et
        //    un verificateur adversarial l a mesure : `fraisVie`, `largeur`, `seuil` et
        //    `delaiRetrait` ne sont pas valides non plus. Une affirmation de completude non verifiee
        //    est pire qu aucune : elle dispense le lecteur de chercher.
        //    Des quatre, `delaiRetrait` est le seul dont le zero est SILENCIEUX ET DE SECURITE — il
        //    est valide juste dessous. Les trois autres restent non valides, et je le dis :
        //      · `fraisVie` a 0 rend l inscription gratuite (choix economique, pas une faille) ;
        //      · `largeur` doit etre un multiple du tickSpacing, exigence ecrite en commentaire
        //        seulement (champ `largeur` de la Config) et jamais appliquee ;
        //      · `seuil` vaut 0 dans les trois endroits du depot qui le fixent.
        if (c.marqueur.length == 0) revert MarqueurVide();
        // ⛔⛔⛔ LE DELAI DE RETRAIT NE PEUT PAS ETRE NUL — ajoute le 2026-10-02. A 0, `demanderRetrait`
        //      pose `retraitDes = block.timestamp`, et la garde de `retirerCaution`
        //      (`block.timestamp < k.retraitDes`) est FAUSSE dans le meme bloc : la caution ressort
        //      immediatement. L invariant de la NatSpec — « cannot be flash-borrowed » — tombe, et le
        //      slot createur devient occupable a capital net nul.
        //   ⇒ LA BORNE EST EXACTE, ELLE NE CHOISIT AUCUNE DUREE. Des `delaiRetrait >= 1`, un retrait
        //     dans la MEME transaction voit `T < T + 1` et revert : le flash-loan est ferme. La duree
        //     ECONOMIQUE (7 jours dans les configs du depot) reste un choix de deploiement, celui de
        //     Raksha — je ne la fixe pas ici.
        //   ⚠️ NON ACTIF AUJOURD HUI : toutes les configs du depot posent 7 jours. C est une garde
        //     contre le prochain deploiement, pas la reparation d un incident.
        if (c.delaiRetrait == 0) revert DelaiRetraitNul();
        if (c.suivi24h && c.exigerB20) revert ConfigIncompatible(); // B20 precompiles cannot carry the rule
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
        SUIVI_24H = c.suivi24h;
        marqueur = c.marqueur;
        deviseAdmise[address(0)] = true;
        _devises.push(address(0));
        for (uint256 i; i < c.devises.length; ++i) {
            address d = c.devises[i];
            if (d == address(0) || deviseAdmise[d]) continue;
            deviseAdmise[d] = true;
            _devises.push(d);
        }
        Hooks.validateHookPermissions(IHooks(address(this)), permissions());
    }

    // ── views ───────────────────────────────────────────────────────────────────────────────────
    function permissions() public view returns (Hooks.Permissions memory p) {
        p.beforeInitialize = true;
        p.beforeRemoveLiquidity = SUIVI_24H;
        p.afterAddLiquidity = true;
        p.beforeSwap = true;
        p.afterSwap = true;
        p.beforeSwapReturnDelta = true;
        p.afterSwapReturnDelta = true;
    }

    function getHookPermissions() external view returns (Hooks.Permissions memory) {
        return permissions();
    }

    /// @notice does this token's URI carry our marker (i.e. is it an engraved block)?
    /// ⛔⛔⛔ FAIL-OPEN CORRIGE LE 2026-10-02. Cette ligne etait `if (m.length == 0) return true;` :
    ///      un marqueur vide rendait `true` pour N IMPORTE QUELLE adresse, donc la verification du
    ///      label etait ENTIEREMENT DESACTIVEE. N importe quel jeton pouvait alors inscrire une pool
    ///      sur ce hook. Et `marqueur` est en storage, pose une seule fois au constructeur, SANS
    ///      setter : l etat aurait ete permanent.
    ///   ⛔ LE VRAI CORRECTIF EST AU CONSTRUCTEUR, PAS ICI. Inverser ce `return` seul aurait BRIQUE un
    ///     hook deploye avec un marqueur vide — il aurait refuse tout, pour toujours. C est le motif
    ///     « fail-closed sur une affordance efface le produit », deja paye en production.
    ///     Le constructeur refuse desormais un marqueur vide (`MarqueurVide`), ce qui rend cette
    ///     branche INATTEIGNABLE. Elle reste, fail-closed, comme assertion de cet invariant : si
    ///     elle tirait un jour, c est que la garde du constructeur aurait saute, et refuser vaut
    ///     mieux qu ouvrir.
    ///   ⚠️ UN MARQUEUR VIDE N A JAMAIS ETE UNE CONFIGURATION VOULUE : la valeur reelle est
    ///     `%22face%22%3A%7B` (l encodage URL de `"face":{`), qui verifie que le block est GRAVE. Et
    ///     ce contrat exprime deja ses exigences par des DRAPEAUX explicites (`exigerB20`) — un
    ///     « pas de verification » encode dans une chaine vide etait la seule exception, implicite.
    function porteLeLabel(address bloc) public view returns (bool) {
        bytes memory m = marqueur;
        if (m.length == 0) return false;
        (bool ok, bytes memory ret) = bloc.staticcall{gas: GAS_LABEL}(abi.encodeWithSelector(0xe8a3d485));
        if (!ok || ret.length < 64) return false;
        string memory uri;
        try this.decoderTexte(ret) returns (string memory s) { uri = s; } catch { return false; }
        return _contient(bytes(uri), m);
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

    function estAdminDuBlock(address bloc, address qui) public view returns (bool) {
        (bool ok, bytes memory ret) = bloc.staticcall{gas: GAS_LABEL}(abi.encodeWithSelector(0x91d14854, bytes32(0), qui));
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
    /// @notice V8/V9-compatible registration (selector bb920fed): no creator share for this pool.
    function inscrire(PoolKey calldata key, uint160 sqrtPriceX96) external payable nonReentrant {
        (PoolId id,) = _verifier(key);
        _payer(id, msg.value);
        inscrit[id] = msg.sender;
        prixInscrit[id] = sqrtPriceX96;
        emit Inscrite(id, msg.sender, Currency.unwrap(_devise(key)), sqrtPriceX96, msg.value);
    }

    /// @notice registration WITH a creator share. The creator (= msg.sender, an admin of the block) escrows
    ///         `minimum` raw units of the QUOTE (the paired stock) in the hook, as PoolManager claims. The
    ///         minimum is therefore fixed at creation and cannot be flash-borrowed: it is locked from before the
    ///         pool exists until `delaiRetrait` after an exit request (during which the share no longer flows).
    ///         ETH quote: msg.value = fraisVie (if unpaid) + minimum.
    function inscrireAvecCaution(PoolKey calldata key, uint160 sqrtPriceX96, uint128 minimum)
        external
        payable
        nonReentrant
    {
        if (PART_CREATEUR == 0 || minimum == 0) revert CreateurInactif();
        (PoolId id, Currency devise) = _verifier(key);
        if (createurs[id].qui != address(0)) revert DejaCautionne();
        uint256 pourFrais = msg.value;
        if (devise.isAddressZero()) {
            if (msg.value < minimum) revert MontantInsuffisant();
            pourFrais = msg.value - minimum;
        }
        _payer(id, pourFrais);
        inscrit[id] = msg.sender;
        prixInscrit[id] = sqrtPriceX96;
        bytes memory r = poolManager.unlock(abi.encode(OP_CAUTION, devise, msg.sender, uint256(minimum)));
        uint256 recu = abi.decode(r, (uint256));
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
        seulementPoolManager
        returns (bytes4)
    {
        PoolId id = key.toId();
        if (!payee[id]) revert PasInscrite();
        if (prixInscrit[id] != sqrtPriceX96) revert PrixDifferent();
        if (SUIVI_24H) {
            // BIRTH: arm the block's 24 h cradle (first initialization only; the token ignores later calls).
            // A block that is not a TBlockBloc24h bound to THIS hook cannot be born on a 24h hook.
            (, Currency b) = cotes(key);
            try IBloc24hArmable(Currency.unwrap(b)).armer() returns (uint256 fin) {
                if (fin == 0) revert PasUnBloc24h();
                emit Berceau(Currency.unwrap(b), id, fin);
            } catch {
                revert PasUnBloc24h();
            }
        }
        return IHooks.beforeInitialize.selector;
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta,
        bytes calldata
    ) external seulementPoolManager returns (bytes4, BalanceDelta) {
        if (params.liquidityDelta > 0) {
            PoolId id = key.toId();
            if (!garnie[id]) garnie[id] = true;
        }
        if (SUIVI_24H) {
            (Currency d,) = cotes(key);
            bool d0 = d == key.currency0;
            int128 db = d0 ? delta.amount1() : delta.amount0();
            if (db < 0) _ajouterT(_cleT(d0 ? key.currency1 : key.currency0, 1), uint256(int256(-db)));
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
            _verifierRemplissage(id, key, params.amountSpecified, devise0, dq);
        } else {
            uint256 montant = dq < 0 ? uint256(-int256(dq)) : uint256(int256(dq));
            retour = int128(int256(_repartir(id, key, devise0, montant)));
        }
        if (MODE_COLLATERAL == 2 && comptes[id].collateral >= SEUIL) _deployer(key, id, devise0);
        if (SUIVI_24H) {
            // block side of the swapper's delta: > 0 = the pool pays the swapper (buy), < 0 = the swapper owes it (sell).
            // The fee is always in the quote, so this IS the block amount settle/take will move for our pool.
            int128 db = devise0 ? delta.amount1() : delta.amount0();
            bytes32 k = _cleT(devise0 ? key.currency1 : key.currency0, 0);
            // F1 (Zero 1 crosscheck + Grok Bot review): the block's FIRST swap that MOVES the block ends the seeder's
            // seed exemption for good. Only db != 0: a zero-block swap (dust quote-only liquidity + no block in range,
            // possible by ANYONE between birth and the seed) must not make the birth seed impossible for 24 h.
            if (db != 0) {
                address bq = Currency.unwrap(devise0 ? key.currency1 : key.currency0);
                if (!echange[bq]) echange[bq] = true;
            }
            assembly ("memory-safe") {
                tstore(k, add(tload(k), signextend(15, db)))
            }
        }
        return (IHooks.afterSwap.selector, retour);
    }

    /// @dev quote-specified swap: the fee was charged in beforeSwap on the REQUESTED amount, so it must fill fully.
    function _verifierRemplissage(PoolId id, PoolKey calldata key, int256 spec, bool devise0, int128 dq) internal view {
        uint256 demande = spec < 0 ? uint256(-spec) : uint256(spec);
        (uint256 fw, uint256 cr, uint256 co) = _parts(id, demande, key, devise0);
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

    function _payer(PoolId id, uint256 v) internal {
        if (!payee[id]) {
            if (v < fraisVie) revert MontantInsuffisant();
            payee[id] = true;
        }
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
    function _parts(PoolId id, uint256 q, PoolKey calldata, bool)
        internal
        view
        returns (uint256 fw, uint256 cr, uint256 co)
    {
        fw = q * HOOK_FEE / DIVISEUR;
        if (PART_CREATEUR != 0) {
            cr = q * PART_CREATEUR / DIVISEUR;
            if (!createurActif(id)) {
                // gate closed: the creator piece feeds the block's collateral (or is not charged at all)
                if (MODE_COLLATERAL != 0) co = cr;
                cr = 0;
            } else {
                // ⛔⛔⛔ PLAFOND AJOUTE LE 2026-10-02 : CE QUI EST DU AU CREATEUR NE DEPASSE JAMAIS CE
                //      QU IL A VERROUILLE. Zero 1 : « quelqu un pourrait toucher la part createur en
                //      deposant presque rien ». Verifie a la source : `minimumCaution[id] = recu` a
                //      l inscription, donc `caution >= minimum` est vrai PAR CONSTRUCTION — le seuil
                //      etait choisi par CELUI QU IL DOIT CONTRAINDRE. La garde existait et ne bornait
                //      RIEN (`enforced-key-that-bounds-nothing`).
                //   ⇒ ON NE CHOISIT AUCUN MONTANT, et c est tout l interet : la borne est la CAUTION
                //     ELLE-MEME, dans la MEME devise. Aucune constante nouvelle, aucun slot de
                //     stockage en plus. Deposer presque rien fait gagner presque rien PAR SWAP.
                //
                // ⛔⛔⛔ CORRIGE LE MEME JOUR, ET C EST MA FAUTE : LA PREMIERE VERSION ETAIT NON IDEMPOTENTE.
                //      Elle bornait par `caution[id] - comptes[id].duCreateur`. Or `_parts` est appele
                //      DEUX fois par swap : en `beforeSwap` (via `_repartir`, qui ECRIT
                //      `duCreateur += cr`), puis en `afterSwap` (via `_verifierRemplissage`, qui le
                //      REJOUE et compare `rempli != attendu`). Le second appel relisait un `duCreateur`
                //      deja augmente par le premier : les deux totaux divergeaient, et le swap
                //      revertait `RemplissagePartiel`. Trouve par un verificateur adversarial du
                //      workflow, pas par moi — mes 76/76 testent le mode 1, ou le total reste
                //      invariant parce que `co` absorbe le surplus. En mode 0, accepte par le
                //      constructeur, le surplus est abandonne, le total varie, et la taille maximale
                //      d un swap a montant exact s etranglait de facon geometrique.
                //   ⇒ LA BORNE NE LIT PLUS QUE `caution[id]`, que `_repartir` n ecrit JAMAIS. Les deux
                //     appels de `_parts` lisent donc le meme etat et rendent le meme total. Regle : une
                //     fonction appelee en before ET en after ne doit dependre d aucun etat que
                //     l appel before modifie.
                //   ⚠️ CE QUE CA CHANGE : le plafond est desormais PAR SWAP, plus sur l en-attente.
                //     Une caution d une unite plafonne chaque swap a une unite ; elle ne plafonne pas
                //     le cumul de plusieurs swaps. Le frein reste economique (le createur doit avoir
                //     verrouille au moins ce que chaque swap lui verse), pas une impossibilite. Un vrai
                //     plafond cumulatif couterait un slot de stockage par pool : decision de Raksha.
                //
                // ⛔⛔ « LE SURPLUS N EST PAS PERDU » — CETTE PHRASE, ECRITE PAR MOI, ETAIT TROMPEUSE.
                //    En mode 1 (la config de deploiement VISEE, FeeLot2Test._cfgProd), le surplus part
                //    bien au collateral et n est pas brule — mais `comptes[id].collateral` ne decroit
                //    JAMAIS : sa seule sortie est `_deployer`, dont les deux appelants exigent le mode 2,
                //    et `MODE_COLLATERAL` est `immutable` sans setter. Le surplus y est donc IMMOBILISE
                //    DEFINITIVEMENT. Ce bac etait deja sans issue avant ce plafond (porte fermee, plus
                //    haut) : ce correctif ne cree pas le gel, il y ajoute. En mode 0, le surplus n est
                //    simplement pas preleve — l acheteur paie moins, personne n est lese.
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
        (uint256 fw, uint256 cr, uint256 co) = _parts(id, q, key, devise0);
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

    function beforeRemoveLiquidity(address, PoolKey calldata key, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        seulementPoolManager
        returns (bytes4)
    {
        if (!SUIVI_24H) revert HookNotImplemented();
        (, Currency b) = cotes(key);
        (bool ok, bytes memory r) = Currency.unwrap(b).staticcall{gas: 10_000}(abi.encodeWithSignature("restrictionsEndAt()"));
        // fail closed: an unreadable / unarmed window counts as open
        if (!ok || r.length < 32) revert RetraitBloque24h();
        uint256 fin = abi.decode(r, (uint256));
        if (fin == 0 || block.timestamp < fin) revert RetraitBloque24h();
        return IHooks.beforeRemoveLiquidity.selector;
    }

    // ── Section C: per-tx hooked block flows, consumed ONLY by the block token itself ─────────────
    /// @dev slot 0 = signed NET block amount our pools owe out (+) / took in (-) in this tx (buys and sells net,
    ///      exactly as the PoolManager nets them); slot 1 = block amount owed to our pools by liquidity adds.
    function _cleT(Currency bloc, uint256 i) internal pure returns (bytes32 k) {
        k = keccak256(abi.encode(Currency.unwrap(bloc), i, "tblock.24h"));
    }

    function _ajouterT(bytes32 k, uint256 v) internal {
        assembly ("memory-safe") {
            tstore(k, add(tload(k), v))
        }
    }

    /// @notice called by the block token on a PoolManager -> x transfer: how much of `m` is a payout of a
    ///         swap on OUR pools in this tx (consumed). msg.sender is the token, so nobody can spend another's.
    function consommerSortie(uint256 m) external returns (uint256 pris) {
        bytes32 k = _cleT(Currency.wrap(msg.sender), 0);
        int256 n;
        assembly ("memory-safe") {
            n := tload(k)
        }
        if (n <= 0) return 0;
        pris = uint256(n) < m ? uint256(n) : m;
        assembly ("memory-safe") {
            tstore(k, sub(n, pris))
        }
    }

    /// @notice called by the block token on an x -> PoolManager transfer: how much of `m` pays a SELL on our pools
    ///         (`vente`) and how much pays a liquidity ADD on our pools (`ajout`), both consumed.
    function consommerEntree(uint256 m) external returns (uint256 vente, uint256 ajout) {
        bytes32 k = _cleT(Currency.wrap(msg.sender), 0);
        int256 n;
        assembly ("memory-safe") {
            n := tload(k)
        }
        if (n < 0) {
            vente = uint256(-n) < m ? uint256(-n) : m;
            assembly ("memory-safe") {
                tstore(k, add(n, vente))
            }
        }
        if (vente < m) {
            bytes32 k1 = _cleT(Currency.wrap(msg.sender), 1);
            uint256 a;
            assembly ("memory-safe") {
                a := tload(k1)
            }
            ajout = a < m - vente ? a : m - vente;
            assembly ("memory-safe") {
                tstore(k1, sub(a, ajout))
            }
        }
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
