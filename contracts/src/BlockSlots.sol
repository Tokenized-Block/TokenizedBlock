// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockSlots -- une machine a sous a TROIS faces de bloc (idee de Phil, 2026-10-23).
/// @notice Le joueur paie un spin (USDC, prix fixe). Le hasard vient de TROIS blocs FUTURS (targetBlock = bloc du spin + 2, puis + 1, + 2) :
///         ni le joueur ni nous ne les choisissons. Au settle, chaque face sort de SON bloc (Phil 2026-10-23 : « 3 blocs differents, chaque
///         face de son propre blockhash ») : face_r = faceOf(keccak256(abi.encode(blockhash(targetBlock + r), spinId, r))) pour r = 0, 1, 2
///         -- la meme derivation a 5 traits que BlockRolls (face-du-jour.js faceRevelee + apparence.js). Le settle attend les TROIS hashes
///         (bloc > targetBlock + 2) et reste dans la fenetre de 256 blocs du PREMIER. Pour chacun des 5 traits : les 3 faces egales = 3 points,
///         2 egales = 1 point, sinon 0. Le CONTRAT juge le resultat au settle et paie lui-meme un PRIX FIXE par nombre de points (table de 16
///         cases, 0..15 points), entre 0 et 5 USDC AU PLUS par spin (MAX_PRIZE), PLAFONNE aussi par le pot. Les points s ADDITIONNENT par wallet,
///         sur la chaine (pointsOf) : un COMPTEUR affiche, pas un gain -- le gain est PAR SPIN.
/// @dev ⛔ CE QUI EST GRAVE ICI, ET POURQUOI :
///   - AUCUN proprietaire, AUCUN retrait, AUCUNE regle modifiable : la table des prix est fixee a la construction. L USDC ne sort du pot que
///     par un settle gagnant, au joueur du spin.
///   - SPIN : POT_SHARE_BPS du prix au pot, le reste au DEV_WALLET tout de suite (comme un roll de BlockRolls).
///   - L AVANTAGE DE LA MAISON EST VERIFIE PAR LE CONTRAT : la distribution EXACTE des points (DIST, sur 2^144, derivee des tailles de
///     listes et des octets lus : teinte = 2 octets % 361 puis 6 bandes, orbite o6 % 10, facette o7 % 19, matiere o8 % 9, ornement o9 % 8)
///     est une constante ; le constructeur REFUSE une table dont l esperance par spin n est pas STRICTEMENT sous la part qui entre au pot.
///     En moyenne un spin fait donc GROSSIR le pot. (Hypothese dite : les octets d un keccak sont uniformes -- le modele de tout tirage
///     sur hash ; test-slots-ev le recalcule en node et l echantillonne.)
///   - ⛔ PAS DE REMBOURSEMENT d un spin non regle (fenetre de 256 blocs passee) : le hash du bloc cible est PUBLIC des qu il existe, donc
///     un remboursement laisserait le joueur regler ses gagnants et se faire rembourser ses perdants -- l avantage de la maison deviendrait
///     celui du joueur. Un spin perdu ne bloque aucun fonds : sa part est DEJA au pot et au dev depuis le spin ; expire() le marque.
///     Le brief de l orchestrateur demandait un remboursement ; il est refuse ici pour cette raison, et c est dit dans le rapport.
///   - ⛔ R1 (verdict adverse 2026-10-23) : un gain PLAFONNE par le pot ne peut etre accepte que par le JOUEUR. Un tiers qui regle un spin
///     dont le prix depasse le pot recoit PotShort (settle) ou voit le spin saute (settleMany) : il ne peut plus vider le pot puis clore le
///     gain d un autre au rabais. Avec un pot suffisant, n importe qui regle, et le gain va toujours au joueur.
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
    /* le pot, tenu en compte (pas balanceOf) : un transfert direct n y entre pas. Invariant : pot <= USDC.balanceOf(this). */
    uint256 public pot;
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
    event Expired(uint256 indexed spinId, address indexed player);

    /* ---------------------------------------------------------------- erreurs */
    error BadConfig();
    error ZeroAmount();
    error NotPending();
    error TooEarly();
    error TooLate();
    error StillSettleable();
    error HashUnavailable();
    /// @dev R1 : le pot ne couvre pas le prix ; seul le JOUEUR peut accepter un gain plafonne (un tiers ne le force pas)
    error PotShort();
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
        /* ⛔ l avantage de la maison : esperance(table) * BPS < prix * part du pot, en EXACT (DIST sur 2^144) */
        if (expectedNumerator(c.prizes) * BPS >= c.spinPrice * c.potShareBps * DIST_DENOM) revert BadConfig();
        USDC = c.usdc;
        DEV_WALLET = c.devWallet;
        SPIN_PRICE = c.spinPrice;
        POT_SHARE_BPS = c.potShareBps;
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

    function prizes() external view returns (uint64[16] memory) {
        return _prizes;
    }

    /// @notice ce que paieraient `points` si un spin etait regle maintenant (le pot peut bouger avant)
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

    /// @notice un spin paye : SPIN_PRICE (approve EXACT cote app), POT_SHARE_BPS au pot, le reste au DEV_WALLET tout de suite.
    ///         Le hasard : les hashes des blocs block.number + 2, + 3 et + 4, qui n existent pas encore (une face chacun).
    function spin() external nonReentrant returns (uint256 spinId) {
        spinId = ++spinCount;
        uint40 t = uint40(block.number + TARGET_DELAY);
        spins[spinId] = Spin({ player: msg.sender, targetBlock: t, status: Status.Pending });
        uint256 toPot = (SPIN_PRICE * POT_SHARE_BPS) / BPS;
        uint256 toDev = SPIN_PRICE - toPot;
        pot += toPot;
        if (toPot != 0) _pull(msg.sender, address(this), toPot);
        if (toDev != 0) _pull(msg.sender, DEV_WALLET, toDev);
        emit Spun(spinId, msg.sender, t, toPot, toDev);
    }

    /* ================================================================ settle / expire */

    /// @notice APPELABLE PAR TOUS : le gain va TOUJOURS au joueur du spin, jamais a l appelant. Le contrat juge (faces, points) et paie.
    ///         ⛔ R1 : si le pot ne couvre pas le prix, seul le JOUEUR peut regler (il accepte alors le pot) ; un tiers recoit PotShort.
    function settle(uint256 spinId) external nonReentrant returns (uint8 points, uint256 payout) {
        Spin storage s = spins[spinId];
        if (s.status != Status.Pending) revert NotPending();
        uint256 t = s.targetBlock;
        if (block.number <= t + (REELS - 1)) revert TooEarly();
        if (block.number > t + SETTLE_WINDOW) revert TooLate();
        (bool lu, bytes32[3] memory h) = _hashes(t);
        if (!lu) revert HashUnavailable();
        bool fait;
        (fait, points, payout) = _settle(spinId, s, h);
        if (!fait) revert PotShort();
    }

    /// @notice plusieurs spins en une transaction, par n importe qui. Un spin non reglable (pas en attente, trop tot, hors fenetre, hash
    ///         illisible, ou pot court quand l appelant n est pas le joueur) est SAUTE, jamais la raison d un revert du lot. Rend le nombre regles.
    function settleMany(uint256[] calldata ids) external nonReentrant returns (uint256 done) {
        for (uint256 i = 0; i < ids.length; i++) {
            Spin storage s = spins[ids[i]];
            if (s.status != Status.Pending) continue;
            uint256 t = s.targetBlock;
            if (block.number <= t + (REELS - 1) || block.number > t + SETTLE_WINDOW) continue;
            (bool lu, bytes32[3] memory h) = _hashes(t);
            if (!lu) continue;
            (bool fait,,) = _settle(ids[i], s, h);
            if (fait) done++;
        }
    }

    /// @dev les trois hashes : blockhash(t), blockhash(t + 1), blockhash(t + 2) ; faux si l un est illisible (0)
    function _hashes(uint256 t) internal view returns (bool lu, bytes32[3] memory h) {
        for (uint256 r = 0; r < REELS; r++) {
            h[r] = blockhash(t + r);
            if (h[r] == bytes32(0)) return (false, h);
        }
        lu = true;
    }

    /// @dev rend fait = false SANS rien ecrire quand le pot est court et que l appelant n est pas le joueur (R1)
    function _settle(uint256 spinId, Spin storage s, bytes32[3] memory h) internal returns (bool fait, uint8 points, uint256 payout) {
        uint8[5][3] memory f = facesOf(h, spinId);
        points = pointsFor(f);
        payout = _prizes[points];
        address player = s.player;
        if (payout > pot) {
            if (msg.sender != player) return (false, points, 0);
            payout = pot;
        }
        fait = true;
        s.status = Status.Settled;
        pot -= payout;
        uint256 total = pointsOf[player] + points;
        pointsOf[player] = total;
        wonOf[player] += payout;
        if (payout != 0) _push(player, payout);
        emit Settled(spinId, player, h, f, points, payout, pot, total);
    }

    /// @notice marque PERDU un spin que plus personne ne peut regler. Aucun fonds ne bouge (sa part est au pot et au dev depuis le spin).
    function expire(uint256 spinId) external {
        Spin storage s = spins[spinId];
        if (s.status != Status.Pending) revert NotPending();
        if (block.number <= uint256(s.targetBlock) + SETTLE_WINDOW) revert StillSettleable();
        s.status = Status.Expired;
        emit Expired(spinId, s.player);
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
