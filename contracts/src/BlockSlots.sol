// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockSlots -- une machine a sous a TROIS faces de bloc (idee de Phil, 2026-10-23).
/// @notice Le joueur paie un spin (USDC, prix fixe). Le hasard vient de TROIS blocs FUTURS (targetBlock = bloc du spin + 2, puis + 1, + 2) :
///         ni le joueur ni nous ne les choisissons. Au settle, chaque face sort de SON bloc (Phil 2026-10-23 : « 3 blocs differents, chaque
///         face de son propre blockhash ») : face_r = faceOf(keccak256(abi.encode(blockhash(targetBlock + r), spinId, r))) pour r = 0, 1, 2
///         -- la meme derivation a 5 traits que BlockRolls (face-du-jour.js faceRevelee + apparence.js). Le settle attend les TROIS hashes
///         (bloc > targetBlock + 2) et reste dans la fenetre de 256 blocs du PREMIER. Pour chacun des 5 traits : les 3 faces egales = 3 points,
///         2 egales = 1 point, sinon 0. Le CONTRAT juge le resultat au settle et paie lui-meme un PRIX FIXE par nombre de points (table de 16
///         cases, 0..15 points), entre 0 et 5 USDC AU PLUS par spin (MAX_PRIZE) : en ENTIER si le pot le couvre, sinon le spin attend --
///         seul son joueur peut accepter moins (acceptCapped), jamais en silence. Une fenetre manquee est REMBOURSEE de la part tenue (REFUND).
///         Les points s ADDITIONNENT par wallet, sur la chaine (pointsOf) : un COMPTEUR affiche, pas un gain -- le gain est PAR SPIN.
/// @dev ⛔ CE QUI EST GRAVE ICI, ET POURQUOI :
///   - AUCUN proprietaire, AUCUN retrait, AUCUNE regle modifiable : la table des prix est fixee a la construction. L USDC ne sort du pot que
///     par un settle gagnant, au joueur du spin.
///   - SPIN (v3) : le prix ENTIER entre au contrat. TO_POT au pot ; REFUND (le reste, la part du dev) est TENU (escrow) : au settle il
///     devient du au DEV_WALLET (devOwed, envoye par payDev(), par n importe qui, au DEV_WALLET seul) ; si la fenetre passe, expire()
///     le REND au joueur (regle de Phil : fenetre manquee = remboursement).
///   - ⛔ POURQUOI LE REMBOURSEMENT EST LA PART DU DEV ET PAS LE PRIX ENTIER : le hash des blocs est PUBLIC des qu il existe ; le joueur sait
///     donc s il a gagne AVANT de choisir entre regler et laisser expirer. Avec un remboursement r, la meilleure strategie rend en moyenne
///     E[max(prix du spin, r)] >= r. Si r = le prix entier, elle rend AU MOINS le prix (0,556549 USDC par spin de 0,50 avec cette table) :
///     « esperance strictement sous le prix » serait impossible. Avec r = REFUND = prix - TO_POT : E[max(X, r)] <= E[X] + r < TO_POT + r
///     = prix (la garde du constructeur est EXACTE sur TO_POT, arrondi compris). bestPlayNumerator() le chiffre ; le pot n est jamais
///     touche par un remboursement (sa part y reste), et la garde lui garde l avantage (E[X] < TO_POT).
///   - L AVANTAGE DE LA MAISON EST VERIFIE PAR LE CONTRAT : la distribution EXACTE des points (DIST, sur 2^144, derivee des tailles de
///     listes et des octets lus : teinte = 2 octets % 361 puis 6 bandes, orbite o6 % 10, facette o7 % 19, matiere o8 % 9, ornement o9 % 8)
///     est une constante ; le constructeur REFUSE une table dont l esperance par spin n est pas STRICTEMENT sous ce qui ENTRE au pot
///     (TO_POT, arrondi bas). En moyenne un spin fait donc GROSSIR le pot. (Hypothese dite : les octets d un keccak sont uniformes -- le
///     modele de tout tirage sur hash ; test-slots-ev le recalcule en node et l echantillonne.)
///   - ⛔ R1 (verdicts adverses 2026-10-23) : un gain PLAFONNE par le pot n est JAMAIS pris en silence. settle() paie le prix ENTIER ou
///     revert PotShort (pour tout appelant, joueur compris) ; settleMany() SAUTE tout spin que le pot ne couvre pas (joueur compris : un
///     lot ne clot plus un gagnant a 0 parce qu un spin precedent du meme lot a vide le pot) ; seul acceptCapped(id, minimum), signe par
///     le JOUEUR, prend min(prix, pot), et refuse sous le minimum qu il a vu (BelowMinimum).
///   - les hashes des trois blocs sont produits par le SEQUENCEUR de Base : meme confiance que BlockRolls, dite, pas cachee. Trois blocs
///     differents ne retirent pas cette confiance (le meme sequenceur les produit) ; ils rendent les trois faces independantes entre elles.
contract BlockSlots {
    /* ---------------------------------------------------------------- constantes de la face (celles de BlockRolls) */
    uint8 public constant BANDS = 6;
    uint8 public constant ORBITS = 10;
    uint8 public constant FACETS = 19;
    uint8 public constant MATERIALS = 9;
    uint8 public constant ORNAMENTS = 8;
    uint8 public constant REELS = 3;
    uint8 public constant TRAITS = 5;
    /* 5 traits x 3 points (les trois faces egales) */
    uint8 public constant MAX_POINTS = 15;
    uint16 internal constant BPS = 10_000;
    /* (Phil 2026-10-23) le gain d UN spin : 0..5 USDC, jamais plus, quelle que soit la table */
    uint64 public constant MAX_PRIZE = 5_000000;
    uint256 public constant MAX_SPIN_PRICE = 1000_000000;
    uint256 public constant TARGET_DELAY = 2;
    /* ⛔ DENIM : blockhash() ne lit que les 256 derniers blocs. 256 blocs = ~8,5 min a 2 s/bloc, ~51 s a 200 ms/bloc (Denim). Les faces lisent
     *    targetBlock, +1, +2 : le settle passe de targetBlock + 3 a targetBlock + 256 (la fenetre du PREMIER hash). settleMany(ids) par
     *    n importe qui ; settleableUntil(id) dit jusqu a quel bloc. */
    uint256 public constant SETTLE_WINDOW = 256;
    /* la distribution exacte est sur 2^144 = (65536 x 256^4)^3 : 2 octets pour la teinte, 1 octet par autre trait, trois faces */
    uint256 public constant DIST_DENOM = 1 << 144;

    /* ---------------------------------------------------------------- immuables */
    address public immutable USDC;
    address public immutable DEV_WALLET;
    uint256 public immutable SPIN_PRICE;
    uint16 public immutable POT_SHARE_BPS;
    /// @notice ce qu un spin met au pot : SPIN_PRICE * POT_SHARE_BPS / BPS, arrondi bas
    uint256 public immutable TO_POT;
    /// @notice le reste du prix (la part du dev), tenu jusqu au settle ; RENDU au joueur si la fenetre passe (expire)
    uint256 public immutable REFUND;

    /* ---------------------------------------------------------------- etat */
    enum Status { None, Pending, Settled, Expired }

    /* une case : 20 + 5 + 1 = 26 octets */
    struct Spin {
        address player;
        uint40 targetBlock;
        Status status;
    }

    /* la table, fixee a la construction, jamais modifiable (aucune fonction ne l ecrit apres) */
    uint64[16] internal _prizes;
    /* le pot, tenu en compte (pas balanceOf) : un transfert direct n y entre pas.
     * Invariant de caisse : pot + escrow + devOwed <= USDC.balanceOf(this) (egal sans transfert direct). */
    uint256 public pot;
    /// @notice la part du dev des spins EN ATTENTE (REFUND chacun) : due au dev au settle, rendue au joueur a l expiration
    uint256 public escrow;
    /// @notice la part du dev des spins REGLES, pas encore envoyee : payDev() l envoie au DEV_WALLET, et nulle part ailleurs
    uint256 public devOwed;
    uint256 public spinCount;
    mapping(uint256 => Spin) public spins;
    /// @notice les points CUMULES d un wallet (tous ses spins regles)
    mapping(address => uint256) public pointsOf;
    /// @notice ce qu un wallet a gagne en tout (USDC brut)
    mapping(address => uint256) public wonOf;
    uint256 private _lock = 1;

    /* ---------------------------------------------------------------- evenements */
    event Funded(address indexed from, uint256 amount, uint256 potAfter);
    event Spun(uint256 indexed spinId, address indexed player, uint256 targetBlock, uint256 toPot, uint256 toDev);
    /// @dev blockHashes[r] = blockhash(targetBlock + r) ; faces[r] = [colorBand, orbit, facet, material, ornament] de la face r
    event Settled(uint256 indexed spinId, address indexed player, bytes32[3] blockHashes, uint8[5][3] faces, uint8 points, uint256 payout, uint256 potAfter, uint256 playerPoints);
    /// @dev v3 : refund = REFUND, rendu au joueur
    event Expired(uint256 indexed spinId, address indexed player, uint256 refund);
    event DevPaid(uint256 amount);

    /* ---------------------------------------------------------------- erreurs */
    error BadConfig();
    error ZeroAmount();
    error NotPending();
    error TooEarly();
    error TooLate();
    error StillSettleable();
    error HashUnavailable();
    /// @dev R1 : le pot ne couvre pas le prix ; settle() ne prend jamais moins que le prix (acceptCapped, par le joueur, le peut)
    error PotShort();
    /// @dev acceptCapped : seul le joueur du spin accepte un gain plafonne
    error NotPlayer();
    /// @dev acceptCapped : le pot a baisse sous le minimum que le joueur a vu
    error BelowMinimum();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /* ⚠️ un struct STATIQUE : encode exactement comme 20 mots a plat (usdc, devWallet, spinPrice, potShareBps, prizes[16]) -- slots-config.js */
    struct Config {
        address usdc;
        address devWallet;
        uint256 spinPrice;
        uint16 potShareBps;
        uint64[16] prizes;
    }

    constructor(Config memory c) {
        if (c.usdc == address(0) || c.usdc.code.length == 0 || c.devWallet == address(0)) revert BadConfig();
        if (c.spinPrice == 0 || c.spinPrice > MAX_SPIN_PRICE || c.potShareBps == 0 || c.potShareBps > BPS) revert BadConfig();
        /* un palier plus haut ne paie jamais moins (sinon viser moins de points rapporterait plus) ; le plus haut est borne, donc tous */
        if (c.prizes[MAX_POINTS] > MAX_PRIZE) revert BadConfig();
        for (uint256 k = 1; k <= MAX_POINTS; k++) if (c.prizes[k] < c.prizes[k - 1]) revert BadConfig();
        uint256 toPot = (c.spinPrice * c.potShareBps) / BPS;
        /* ⛔ l avantage de la maison : esperance(table) < ce qui ENTRE au pot (arrondi bas), en EXACT (DIST sur 2^144). Avec REFUND = prix -
         *    toPot, la meilleure strategie (regler ou laisser expirer) rend E[max(X, REFUND)] <= E[X] + REFUND < toPot + REFUND = prix. */
        if (expectedNumerator(c.prizes) >= toPot * DIST_DENOM) revert BadConfig();
        USDC = c.usdc;
        DEV_WALLET = c.devWallet;
        SPIN_PRICE = c.spinPrice;
        POT_SHARE_BPS = c.potShareBps;
        TO_POT = toPot;
        REFUND = c.spinPrice - toPot;
        _prizes = c.prizes;
    }

    /* ================================================================ la distribution exacte et l esperance */

    /// @notice P(points = k) * 2^144, exacte (k = 0..15 ; 14 points est impossible : 4 brelans + 1 paire = 13, 5 brelans = 15).
    /// @dev recalculee par test-slots-ev-20261023.mjs depuis les tailles de listes de l app ; une derive rougit la-bas.
    function distribution() public pure returns (uint256[16] memory d) {
        d = [
            uint256(3428884117927507324050275432894715396096000),
            7648590723549578990455994844309854827315200,
            6527578137388332631356339452991262792089600,
            3030049636410835769954265030731900292956160,
            1128529664476547868524120755253584267837440,
            401588648281843774575246823645379643310080,
            104641623152789656691372415393799159676928,
            23993160804353638786393207996641284456448,
            5832161513820386403392592040574488412160,
            867871199805070864307501136160808239104,
            162423161940631315942110019698781323264,
            24911117832161626637073347965957963776,
            1647211231548846984445290325324333056,
            469003306555126851966644856318590976,
            0,
            3330897132957594620951642163380224
        ];
    }

    /// @notice somme_k P(k) * prize[k] * 2^144 : l esperance d un spin (avant le plafond du pot) = expectedNumerator / 2^144 USDC brut.
    function expectedNumerator(uint64[16] memory table) public pure returns (uint256 s) {
        uint256[16] memory d = distribution();
        for (uint256 k = 0; k <= MAX_POINTS; k++) s += d[k] * table[k];
    }

    /// @notice l esperance de la table de CE contrat, en USDC brut arrondi vers le bas (avant le plafond du pot)
    function expectedPayout() external view returns (uint256) {
        return expectedNumerator(_prizes) / DIST_DENOM;
    }

    /// @notice la MEILLEURE strategie d un joueur qui voit ses faces avant de choisir : regler si le prix depasse REFUND, sinon laisser la
    ///         fenetre passer et etre rembourse. somme_k P(k) * max(prize[k], REFUND) * 2^144 ; strictement sous SPIN_PRICE * 2^144 pour
    ///         toute table admise (la garde du constructeur). Un plafond par le pot ne fait que baisser ce que rend un settle.
    function bestPlayNumerator() external view returns (uint256 s) {
        uint256[16] memory d = distribution();
        uint256 r = REFUND;
        for (uint256 k = 0; k <= MAX_POINTS; k++) s += d[k] * (_prizes[k] > r ? _prizes[k] : r);
    }

    function prizes() external view returns (uint64[16] memory) {
        return _prizes;
    }

    /// @notice min(prix de `points`, pot) : ce que paierait acceptCapped maintenant (le pot peut bouger avant). settle() et settleMany()
    ///         ne paient QUE le prix entier : si cette valeur est sous le prix de la table, ils refusent (ou sautent) le spin.
    function payoutFor(uint8 points) external view returns (uint256 p) {
        if (points > MAX_POINTS) return 0;
        p = _prizes[points];
        if (p > pot) p = pot;
    }

    /* ================================================================ pot */

    /// @notice n importe qui ajoute de l USDC au pot. Sans retour possible.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        pot += amount;
        _pull(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount, pot);
    }

    /* ================================================================ spin */

    /// @notice un spin paye : SPIN_PRICE entre au contrat (approve EXACT cote app) ; TO_POT au pot, REFUND tenu (escrow) jusqu au settle
    ///         (puis du au dev) ou a l expiration (puis rendu au joueur). Le hasard : les hashes des blocs block.number + 2, + 3 et + 4, qui
    ///         n existent pas encore (une face chacun).
    function spin() external nonReentrant returns (uint256 spinId) {
        spinId = ++spinCount;
        uint40 t = uint40(block.number + TARGET_DELAY);
        spins[spinId] = Spin({ player: msg.sender, targetBlock: t, status: Status.Pending });
        pot += TO_POT;
        escrow += REFUND;
        _pull(msg.sender, address(this), SPIN_PRICE);
        emit Spun(spinId, msg.sender, t, TO_POT, REFUND);
    }

    /* ================================================================ settle / acceptCapped / expire / payDev */

    /// @notice APPELABLE PAR TOUS : le gain va TOUJOURS au joueur du spin, jamais a l appelant. Le contrat juge (faces, points) et paie le
    ///         prix ENTIER de la table. ⛔ R1 : si le pot ne le couvre pas, PotShort -- pour tout appelant, joueur compris (acceptCapped).
    function settle(uint256 spinId) external nonReentrant returns (uint8 points, uint256 payout) {
        (Spin storage s, bytes32[3] memory h) = _ouvert(spinId);
        uint8[5][3] memory f;
        (f, points, payout) = _juger(h, spinId);
        if (payout > pot) revert PotShort();
        _payer(spinId, s, h, f, points, payout);
    }

    /// @notice le JOUEUR seul accepte un gain PLAFONNE par le pot : paie min(prix, pot), et refuse si c est sous `minPayout` (le montant
    ///         qu il a vu avant de signer ; le pot peut baisser entre-temps). Avec un pot suffisant, c est un settle au prix entier.
    function acceptCapped(uint256 spinId, uint256 minPayout) external nonReentrant returns (uint8 points, uint256 payout) {
        (Spin storage s, bytes32[3] memory h) = _ouvert(spinId);
        if (msg.sender != s.player) revert NotPlayer();
        uint8[5][3] memory f;
        (f, points, payout) = _juger(h, spinId);
        if (payout > pot) payout = pot;
        if (payout < minPayout) revert BelowMinimum();
        _payer(spinId, s, h, f, points, payout);
    }

    /// @notice plusieurs spins en une transaction, par n importe qui. Un spin non reglable (pas en attente, trop tot, hors fenetre, hash
    ///         illisible, ou pot qui ne couvre pas son prix ENTIER -- pour tout appelant, joueur compris) est SAUTE, jamais clos au rabais
    ///         ni la raison d un revert du lot. Les spins passent dans l ordre donne. Rend le nombre regles.
    function settleMany(uint256[] calldata ids) external nonReentrant returns (uint256 done) {
        for (uint256 i = 0; i < ids.length; i++) {
            Spin storage s = spins[ids[i]];
            if (s.status != Status.Pending) continue;
            uint256 t = s.targetBlock;
            if (block.number <= t + (REELS - 1) || block.number > t + SETTLE_WINDOW) continue;
            (bool lu, bytes32[3] memory h) = _hashes(t);
            if (!lu) continue;
            (uint8[5][3] memory f, uint8 points, uint256 payout) = _juger(h, ids[i]);
            if (payout > pot) continue;
            _payer(ids[i], s, h, f, points, payout);
            done++;
        }
    }

    /// @dev un spin en attente, dans sa fenetre, aux trois hashes lisibles -- sinon la raison exacte
    function _ouvert(uint256 spinId) internal view returns (Spin storage s, bytes32[3] memory h) {
        s = spins[spinId];
        if (s.status != Status.Pending) revert NotPending();
        uint256 t = s.targetBlock;
        if (block.number <= t + (REELS - 1)) revert TooEarly();
        if (block.number > t + SETTLE_WINDOW) revert TooLate();
        bool lu;
        (lu, h) = _hashes(t);
        if (!lu) revert HashUnavailable();
    }

    /// @dev les trois hashes : blockhash(t), blockhash(t + 1), blockhash(t + 2) ; faux si l un est illisible (0)
    function _hashes(uint256 t) internal view returns (bool lu, bytes32[3] memory h) {
        for (uint256 r = 0; r < REELS; r++) {
            h[r] = blockhash(t + r);
            if (h[r] == bytes32(0)) return (false, h);
        }
        lu = true;
    }

    /// @dev les faces, les points et le prix de la TABLE (avant le pot)
    function _juger(bytes32[3] memory h, uint256 spinId) internal view returns (uint8[5][3] memory f, uint8 points, uint256 prize) {
        f = facesOf(h, spinId);
        points = pointsFor(f);
        prize = _prizes[points];
    }

    /// @dev clot le spin et paie `payout` (<= pot, verifie par l appelant) au joueur ; la part tenue du dev devient due
    function _payer(uint256 spinId, Spin storage s, bytes32[3] memory h, uint8[5][3] memory f, uint8 points, uint256 payout) internal {
        address player = s.player;
        s.status = Status.Settled;
        pot -= payout;
        escrow -= REFUND;
        devOwed += REFUND;
        uint256 total = pointsOf[player] + points;
        pointsOf[player] = total;
        wonOf[player] += payout;
        if (payout != 0) _push(player, payout);
        emit Settled(spinId, player, h, f, points, payout, pot, total);
    }

    /// @notice un spin que plus personne ne peut regler (fenetre passee) : par N IMPORTE QUI, il est clos et sa part tenue (REFUND) est
    ///         RENDUE au joueur du spin, jamais a l appelant. La part du pot reste au pot.
    function expire(uint256 spinId) external nonReentrant {
        Spin storage s = spins[spinId];
        if (s.status != Status.Pending) revert NotPending();
        if (block.number <= uint256(s.targetBlock) + SETTLE_WINDOW) revert StillSettleable();
        s.status = Status.Expired;
        escrow -= REFUND;
        address player = s.player;
        if (REFUND != 0) _push(player, REFUND);
        emit Expired(spinId, player, REFUND);
    }

    /// @notice envoie au DEV_WALLET (immuable, et nulle part ailleurs) la part du dev des spins REGLES ; par n importe qui. Ne touche ni le
    ///         pot ni les parts encore tenues. Rend le montant envoye (0 si rien n est du).
    function payDev() external nonReentrant returns (uint256 amount) {
        amount = devOwed;
        if (amount == 0) return 0;
        devOwed = 0;
        _push(DEV_WALLET, amount);
        emit DevPaid(amount);
    }

    /// @notice le DERNIER bloc ou settle(id) passe encore ; 0 si le spin n est pas en attente
    function settleableUntil(uint256 spinId) external view returns (uint256) {
        Spin storage s = spins[spinId];
        if (s.status != Status.Pending) return 0;
        return uint256(s.targetBlock) + SETTLE_WINDOW;
    }

    /* ================================================================ lectures pures (pour l app et la parite) */

    /// @notice la graine de la face `reel` d un spin : keccak256(abi.encode(blockHash, spinId, reel)), blockHash = celui du bloc
    ///         targetBlock + reel. L id rend deux spins des memes blocs independants (sinon tous les joueurs d un bloc auraient les memes faces).
    function seedOf(bytes32 blockHash, uint256 spinId, uint256 reel) public pure returns (bytes32) {
        return keccak256(abi.encode(blockHash, spinId, reel));
    }

    /// @notice les trois faces d un spin : la face r sur le hash de SON bloc (blockHashes[r] = blockhash(targetBlock + r))
    function facesOf(bytes32[3] memory blockHashes, uint256 spinId) public pure returns (uint8[5][3] memory f) {
        for (uint256 r = 0; r < REELS; r++) f[r] = faceOf(seedOf(blockHashes[r], spinId, r));
    }

    /// @notice par trait : 3 faces egales = 3 points, 2 egales = 1 point
    function pointsFor(uint8[5][3] memory f) public pure returns (uint8 p) {
        for (uint256 i = 0; i < TRAITS; i++) {
            uint8 a = f[0][i];
            uint8 b = f[1][i];
            uint8 c = f[2][i];
            if (a == b && b == c) p += 3;
            else if (a == b || b == c || a == c) p += 1;
        }
    }

    /// @notice la face d un hash, EXACTEMENT comme BlockRolls.faceOf (et face-du-jour.js faceRevelee) : [colorBand, orbit, facet, material, ornament]
    function faceOf(bytes32 h) public pure returns (uint8[5] memory face) {
        bytes32 k = keccak256(_hexAddress(bytes20(h)));
        uint256 teinte = (uint256(uint8(k[0])) * 256 + uint8(k[1])) % 361;
        face[0] = uint8(((teinte + 30) % 360) / 60);
        face[1] = uint8(k[6]) % ORBITS;
        face[2] = uint8(k[7]) % FACETS;
        face[3] = uint8(k[8]) % MATERIALS;
        face[4] = uint8(k[9]) % ORNAMENTS;
    }

    /* ================================================================ interne */

    /// @dev "0x" + 40 caracteres hex minuscules (42 octets ASCII)
    function _hexAddress(bytes20 a) internal pure returns (bytes memory s) {
        bytes16 hexd = "0123456789abcdef";
        s = new bytes(42);
        s[0] = "0";
        s[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(a[i]);
            s[2 + 2 * i] = hexd[b >> 4];
            s[3 + 2 * i] = hexd[b & 0x0f];
        }
    }

    function _pull(address from, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = USDC.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _push(address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = USDC.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
