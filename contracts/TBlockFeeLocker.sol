// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/*  TBlockFeeLocker — LA LIQUIDITE RESTE ENFERMEE, LES FRAIS SORTENT.
 *
 *  ⛔⛔ POURQUOI CE CONTRAT EXISTE. Regle de TokenizedBlock du 2026-09-13 : la position de
 *      liquidite est frappee au nom de l adresse morte `0x…dEaD`. Promesse tenue — personne ne peut
 *      retirer. Mais `onlyIfApproved` du PositionManager v4 garde le RETRAIT **et la COLLECTE** :
 *      une position possedee par l adresse morte ne peut JAMAIS `collect()` ses frais. D ou
 *      `FEE_POOL = 0` dans l app : on ne fait pas payer un frais que personne ne touchera.
 *      Consequence mesuree le 2026-09-26, 24 h, 44 fenetres sur 44, 0 ratee :
 *        685 pools B20 ouvertes sur Base · 0 sur notre hook · 14 378 echanges B20 · 0 chez nous.
 *        Et le wallet de frais : 0,002293010 ETH, dont 0 des 7 jetons encaisses n a de marche.
 *      ⇒ Nos pools ne rapportent RIEN par construction.
 *
 *  ⛔ CE QUE CE CONTRAT CHANGE, ET RIEN D AUTRE : le proprietaire de la position devient CE contrat
 *    au lieu de l adresse morte. La liquidite reste irretirable — ce contrat n a AUCUN chemin vers
 *    `DECREASE_LIQUIDITY` avec une liquidite non nulle, vers `BURN_POSITION`, vers `transferFrom`,
 *    vers `approve` ni vers `setApprovalForAll`. Il n y a pas de proprietaire, pas de fonction
 *    d administration, pas de `selfdestruct`, pas de proxy : RIEN N EST MODIFIABLE APRES LE DEPLOI.
 *
 *  ⛔⛔ LE CALLDATA EST FABRIQUE ICI, JAMAIS RECU. C est LA propriete de securite de ce fichier.
 *      Si `collect` acceptait des `bytes` de l appelant, n importe qui passerait un
 *      `DECREASE_LIQUIDITY` a liquidite > 0 ou un `BURN_POSITION` et viderait la pool. Le contrat
 *      construit donc lui-meme les deux actions, avec `liquidity` CODE EN DUR A ZERO.
 *      ⛔ `amount0Min`/`amount1Min` a zero est correct ICI et nulle part ailleurs : le
 *        PositionManager verifie le slippage sur `(liquidityDelta - feesAccrued)`, qui vaut 0 quand
 *        la liquidite retiree est 0. Il n y a pas de principal a proteger, donc pas de borne a poser.
 *        Lu dans `PositionManager._decrease`, pas suppose.
 *
 *  ⛔ `collect` EST SANS PERMISSION, ET C EST VOULU. Les fonds ne peuvent aller qu a deux adresses
 *    figees a la naissance de la position ; laisser n importe qui declencher la collecte empeche
 *    que quiconque — nous compris — la retienne en otage.
 *
 *  ⚠️ CE QUE CE CONTRAT NE FAIT PAS, ET QU UN CONCURRENT FAIT : il n a AUCUN moyen de reassigner le
 *    flux de frais. Mesure du 2026-09-26 sur thestonks.exchange : leur
 *    `proposeFeeOwner`/`executeFeeOwner` transfere le flux de n importe quel coin a n importe
 *    quelle adresse apres 24 h de preavis, et ils l ont exerce ce jour-la. Leur page `/launch`
 *    affiche « Paid to your wallet » sans le dire. Ici, le destinataire d une position est ecrit
 *    UNE FOIS, a la reception du NFT, et plus rien ne peut le changer.
 *
 *  ⚠️ CE QUI RESTE VRAI ET QU IL FAUDRA DIRE AUX UTILISATEURS : ce contrat rend la collecte
 *    possible, donc un frais de pool non nul redevient honnete. Il ne rend PAS la liquidite
 *    retirable. La phrase publique passe de « personne ne peut jamais y toucher » a « personne ne
 *    peut retirer la liquidite ; les frais d echange vont a des adresses fixees d avance ».
 *    C est une REGLE PUBLIEE qui change : elle se dit, elle ne se glisse pas.
 *
 *  ⛔ NON DEPLOYE, NON SIGNE. Ce fichier est du code a relire ; la signature appartient a Phil.
 */

/* ── interfaces minimales, recopiees des sources Uniswap v4-periphery ────────────────────────── */

type Currency is address;

struct PoolKey {
    Currency currency0;
    Currency currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

/* `PositionInfo` est un `uint256` empaquete cote Uniswap ; on ne le lit pas, on le jette. */
interface IPositionManager {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function getPoolAndPositionInfo(uint256 tokenId) external view returns (PoolKey memory, uint256);
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128);
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract TBlockFeeLocker {
    /* ⛔ LES ACTIONS DU POSITION MANAGER, LUES DANS `Actions.sol` le 2026-09-26 — pas recitees.
     *   Elles concordent avec la table deja mesuree dans `pool.js` de ce depot (MINT 0x02,
     *   SETTLE_PAIR 0x0d, BURN 0x03, TAKE_PAIR 0x11), ce qui fait deux sources independantes. */
    uint8 private constant DECREASE_LIQUIDITY = 0x01;
    uint8 private constant TAKE_PAIR = 0x11;

    IPositionManager public immutable POSM;

    /* ⛔ LE WALLET DE FRAIS EST IMMUABLE. Aucune fonction ne le change, parce qu aucune n existe. */
    address public immutable FEE_WALLET;

    /* ⛔ LA PART DU CREATEUR EST IMMUABLE ELLE AUSSI, en millioniemes comme `HOOK_FEE` du hook, pour
     *   qu on ne melange jamais deux unites. 300000 = 30 %. */
    uint256 public immutable CREATOR_SHARE_PPM;
    uint256 private constant PPM = 1_000_000;

    /* ⛔ LE CREATEUR D UNE POSITION EST ECRIT UNE SEULE FOIS. `creatorOf[id] == address(0)` veut dire
     *   « cette position n est pas connue » — et `collect` le refuse. */
    mapping(uint256 => address) public creatorOf;

    error NotThePositionManager();
    error AlreadyKnown();
    error UnknownPosition();
    error NoCreator();
    error ShareTooHigh();
    error NativeTransferFailed();

    event PositionLocked(uint256 indexed tokenId, address indexed creator);
    event FeesCollected(uint256 indexed tokenId, address currency, uint256 toCreator, uint256 toFeeWallet);

    constructor(IPositionManager posm_, address feeWallet_, uint256 creatorSharePpm_) {
        if (feeWallet_ == address(0)) revert NoCreator();
        /* ⛔ PLAFOND DUR. Un concurrent mesure plafonne sa part plateforme a 50 % « pour qu un
         *   launcher mis a jour ne puisse pas enregistrer une coupe de 100 % ». Ici il n y a pas de
         *   launcher modifiable, mais le plafond reste : une part de createur superieure a 100 %
         *   serait un sous-debordement a la soustraction. */
        if (creatorSharePpm_ > PPM) revert ShareTooHigh();
        POSM = posm_;
        FEE_WALLET = feeWallet_;
        CREATOR_SHARE_PPM = creatorSharePpm_;
    }

    /* ── reception du NFT de position ───────────────────────────────────────────────────────── */

    /**
     * ⛔ SEUL LE POSITION MANAGER PEUT DEPOSER. Accepter un ERC-721 quelconque laisserait n importe
     *   qui inscrire un `tokenId` de son choix et s attribuer une part sur une position qui n est
     *   pas la sienne.
     * ⛔ `from` EST LE CREATEUR. C est lui qui a fait frapper la position ; on n accepte pas une
     *   adresse passee dans `data`, qui serait choisie par l appelant.
     * ⛔ ET ON N ECRASE JAMAIS : une position deja connue est refusee, sinon un second depot
     *   changerait le destinataire — exactement le pouvoir qu on refuse d avoir.
     */
    function onERC721Received(address, address from, uint256 tokenId, bytes calldata)
        external
        returns (bytes4)
    {
        if (msg.sender != address(POSM)) revert NotThePositionManager();
        if (creatorOf[tokenId] != address(0)) revert AlreadyKnown();
        if (from == address(0)) revert NoCreator();
        creatorOf[tokenId] = from;
        emit PositionLocked(tokenId, from);
        return this.onERC721Received.selector;
    }

    /* ── collecte ───────────────────────────────────────────────────────────────────────────── */

    /**
     * Collecte les frais accumules d une position et les repartit. SANS PERMISSION : n importe qui
     * peut la declencher, et les fonds ne peuvent aller qu aux deux adresses figees.
     *
     * ⛔⛔ `liquidity` EST ZERO, EN DUR, ET C EST TOUTE LA SURETE DE CE CONTRAT. Le PositionManager
     *     rend `(liquidityDelta, feesAccrued)` ; a liquidite nulle les deux sont egaux, donc ce qui
     *     est credite est EXCLUSIVEMENT des frais. Le principal ne bouge pas, ne peut pas bouger, et
     *     aucun chemin de ce contrat ne permet de passer autre chose que zero.
     */
    function collect(uint256 tokenId) external {
        address creator = creatorOf[tokenId];
        if (creator == address(0)) revert UnknownPosition();

        (PoolKey memory key,) = POSM.getPoolAndPositionInfo(tokenId);

        bytes memory actions = abi.encodePacked(DECREASE_LIQUIDITY, TAKE_PAIR);
        bytes[] memory params = new bytes[](2);
        /* (tokenId, liquidity, amount0Min, amount1Min, hookData) — voir l en-tete pour le zero. */
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        /* (currency0, currency1, recipient) : on encaisse ICI, puis on repartit. TAKE_PAIR n a qu un
         * destinataire, donc le partage ne peut pas se faire dans l action elle-meme. */
        params[1] = abi.encode(key.currency0, key.currency1, address(this));

        POSM.modifyLiquidities(abi.encode(actions, params), block.timestamp);

        _repartir(tokenId, Currency.unwrap(key.currency0), creator);
        _repartir(tokenId, Currency.unwrap(key.currency1), creator);
    }

    /**
     * ⛔ ON REPARTIT LE SOLDE DU CONTRAT, pas un montant annonce. Lire le delta rendu par le
     *   PositionManager et le croire serait faire confiance a un chiffre pour deplacer de l argent ;
     *   le solde reel, lui, est un fait. Effet de bord assume et DIT : si quelqu un envoie des
     *   jetons a ce contrat, ils partiront a la prochaine collecte de cette devise.
     * ⛔ RIEN N EST BLOQUE PAR UN ZERO : une devise sans frais accumules sort sans transfert.
     */
    function _repartir(uint256 tokenId, address currency, address creator) private {
        uint256 solde = currency == address(0)
            ? address(this).balance
            : IERC20Minimal(currency).balanceOf(address(this));
        if (solde == 0) return;

        uint256 partCreateur = (solde * CREATOR_SHARE_PPM) / PPM;
        uint256 partNous = solde - partCreateur;

        if (partCreateur > 0) _envoyer(currency, creator, partCreateur);
        if (partNous > 0) _envoyer(currency, FEE_WALLET, partNous);
        emit FeesCollected(tokenId, currency, partCreateur, partNous);
    }

    function _envoyer(address currency, address to, uint256 montant) private {
        if (currency == address(0)) {
            /* ⛔ UN ECHEC D ENVOI D ETH NE SE TAIT PAS. Un `call` dont on ignore le retour laisserait
             *   l evenement annoncer un versement qui n a pas eu lieu. */
            (bool ok,) = payable(to).call{value: montant}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            /* ⛔ ON N EXIGE PAS `true` : des jetons anciens ne rendent rien du tout. On exige que
             *   l appel n ait pas revert, et qu un retour, s il existe, ne soit pas `false`. */
            (bool ok, bytes memory ret) =
                currency.call(abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, montant));
            if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) revert NativeTransferFailed();
        }
    }

    /* ⛔ NECESSAIRE : `TAKE_PAIR` envoie l ETH natif ici avant la repartition. Ce `receive` ne rend
     *   rien retirable — seul `_repartir` sort des fonds, et seulement vers les deux adresses. */
    receive() external payable {}
}
