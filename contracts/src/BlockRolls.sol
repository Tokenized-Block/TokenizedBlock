// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockRolls -- un tirage PAYANT sur la face d un bloc Base (decision de Phil, 2026-10-17 soir).
/// @notice Le joueur paie (USDC) et devine 5 traits ; la face revelee est celle du hash du bloc `targetBlock`,
///         calculee EXACTEMENT comme l app (face-du-jour.js faceRevelee + apparence.js apparenceDepuisAdresse).
/// @dev ⛔ CE QUI EST GRAVE ICI, ET POURQUOI :
///   - AUCUN proprietaire, AUCUN retrait du pot : seul un settle gagnant fait sortir de l USDC du pot.
///   - le gain = une PART (bps) du pot AU MOMENT du settle : le pot ne peut jamais payer plus qu il ne tient.
///   - un roll non regle dans les 256 blocs apres sa cible est PERDU (pas de remboursement : un remboursement
///     laisserait le joueur ne reveler que ses gagnants -- il verrait le hash, et ne reglerait que s il gagne).
///   - le hash du bloc cible n est pas choisi par le joueur, mais le SEQUENCEUR de Base le produit : c est la
///     meme confiance que le tirage de l app, et elle est dite dans le rapport, pas cachee.
contract BlockRolls {
    /* ---------------------------------------------------------------- constantes de la face */
    /* l ordre et la longueur des listes d apparence.js (ORBITES 10, FACETTES 19, MATIERES 9, ORNEMENTS 8) et des 6 bandes
     * de face-du-jour.js (BANDES). ⛔ Si une liste change dans l app, la parite (test JS) rougit : rien ne derive en silence. */
    uint8 public constant BANDS = 6;
    uint8 public constant ORBITS = 10;
    uint8 public constant FACETS = 19;
    uint8 public constant MATERIALS = 9;
    uint8 public constant ORNAMENTS = 8;
    uint16 internal constant BPS = 10_000;
    /* le bloc cible est 2 blocs APRES le roll : son hash n existe pas encore quand le joueur devine */
    uint256 public constant TARGET_DELAY = 2;
    /* blockhash() ne lit que les 256 derniers blocs */
    uint256 public constant SETTLE_WINDOW = 256;

    /* ---------------------------------------------------------------- immuables */
    address public immutable USDC;
    address public immutable DEV_WALLET;
    uint256 public immutable ROLL_PRICE;
    uint256 public immutable PASS_PRICE;
    uint32 public immutable PASS_ROLLS;
    uint64 public immutable PASS_WINDOW;
    uint16 public immutable POT_SHARE_BPS;
    uint16 public immutable P5_BPS;
    uint16 public immutable P4_BPS;
    uint16 public immutable P3_BPS;

    /* ---------------------------------------------------------------- etat */
    enum Status { None, Pending, Settled, Expired }

    /* ⚠️ une seule case de stockage : 20 + 6 + 1 + 5 = 32 octets */
    struct Roll {
        address player;
        uint48 targetBlock;
        Status status;
        uint40 guess; /* 5 octets : colorBand, orbit, facet, material, ornament (octet 0 = colorBand, poids fort) */
    }

    struct Pass {
        uint32 rollsLeft;
        uint64 expiresAt;
    }

    /* le pot, tenu en compte (pas balanceOf) : un transfert direct au contrat n y entre pas, et rien ne le fait sortir
     * sauf un settle gagnant. Invariant : pot <= USDC.balanceOf(this). */
    uint256 public pot;
    uint256 public rollCount;
    mapping(uint256 => Roll) public rolls;
    mapping(address => Pass) public passes;
    uint256 private _lock = 1;

    /* ---------------------------------------------------------------- evenements */
    event Funded(address indexed from, uint256 amount, uint256 potAfter);
    event PassBought(address indexed player, uint32 rollsLeft, uint64 expiresAt, uint256 paid);
    event Rolled(uint256 indexed rollId, address indexed player, uint8[5] guess, uint256 targetBlock, bool withPass, uint256 toPot, uint256 toDev);
    event Settled(uint256 indexed rollId, address indexed player, bytes32 blockHash, uint8[5] face, uint8 score, uint256 payout, uint256 potAfter);
    event Expired(uint256 indexed rollId, address indexed player);

    /* ---------------------------------------------------------------- erreurs */
    error BadConfig();
    error BadGuess();
    error ZeroAmount();
    error NoPass();
    error PassActive();
    error NotPending();
    error TooEarly();
    error TooLate();
    error StillSettleable();
    error HashUnavailable();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(
        address usdc,
        address devWallet,
        uint256 rollPrice,
        uint256 passPrice,
        uint32 passRolls,
        uint64 passWindow,
        uint16 potShareBps,
        uint16 p5Bps,
        uint16 p4Bps,
        uint16 p3Bps
    ) {
        if (usdc == address(0) || usdc.code.length == 0 || devWallet == address(0)) revert BadConfig();
        if (rollPrice == 0 || passPrice == 0 || passRolls == 0 || passWindow == 0) revert BadConfig();
        if (potShareBps > BPS || p5Bps > BPS || p4Bps > p5Bps || p3Bps > p4Bps) revert BadConfig();
        USDC = usdc;
        DEV_WALLET = devWallet;
        ROLL_PRICE = rollPrice;
        PASS_PRICE = passPrice;
        PASS_ROLLS = passRolls;
        PASS_WINDOW = passWindow;
        POT_SHARE_BPS = potShareBps;
        P5_BPS = p5Bps;
        P4_BPS = p4Bps;
        P3_BPS = p3Bps;
    }

    /* ================================================================ pot */

    /// @notice n importe qui ajoute de l USDC au pot (la part communautaire des frais, par exemple). Sans retour possible.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        pot += amount;
        _pull(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount, pot);
    }

    /* ================================================================ pass */

    /// @notice PASS_ROLLS rolls utilisables pendant PASS_WINDOW. Refuse tant qu un pass ACTIF a encore des rolls :
    ///         sinon racheter effacerait les rolls deja payes.
    function buyPass() external nonReentrant {
        Pass storage p = passes[msg.sender];
        if (p.rollsLeft != 0 && block.timestamp < p.expiresAt) revert PassActive();
        uint64 exp = uint64(block.timestamp) + PASS_WINDOW;
        p.rollsLeft = PASS_ROLLS;
        p.expiresAt = exp;
        _charge(PASS_PRICE);
        emit PassBought(msg.sender, PASS_ROLLS, exp, PASS_PRICE);
    }

    /* ================================================================ roll */

    /// @notice un roll paye : ROLL_PRICE, POT_SHARE_BPS au pot, le reste au DEV_WALLET tout de suite.
    function roll(uint8[5] calldata guess) external nonReentrant returns (uint256 rollId) {
        rollId = _record(guess);
        (uint256 toPot, uint256 toDev) = _charge(ROLL_PRICE);
        emit Rolled(rollId, msg.sender, guess, rolls[rollId].targetBlock, false, toPot, toDev);
    }

    /// @notice un roll pris sur le pass du joueur (aucun paiement ici : il a ete fait a l achat du pass).
    function rollWithPass(uint8[5] calldata guess) external nonReentrant returns (uint256 rollId) {
        Pass storage p = passes[msg.sender];
        if (p.rollsLeft == 0 || block.timestamp >= p.expiresAt) revert NoPass();
        p.rollsLeft -= 1;
        rollId = _record(guess);
        emit Rolled(rollId, msg.sender, guess, rolls[rollId].targetBlock, true, 0, 0);
    }

    /* ================================================================ settle / expire */

    /// @notice APPELABLE PAR TOUS : le gain va TOUJOURS au joueur du roll, jamais a l appelant.
    function settle(uint256 rollId) external nonReentrant returns (uint8 score, uint256 payout) {
        Roll storage r = rolls[rollId];
        if (r.status != Status.Pending) revert NotPending();
        uint256 t = r.targetBlock;
        if (block.number <= t) revert TooEarly();
        if (block.number > t + SETTLE_WINDOW) revert TooLate();
        bytes32 h = blockhash(t);
        if (h == bytes32(0)) revert HashUnavailable();

        uint8[5] memory face = faceOf(h);
        score = scoreOf(_unpack(r.guess), face);
        uint16 bps = score == 5 ? P5_BPS : score == 4 ? P4_BPS : score == 3 ? P3_BPS : 0;
        payout = (pot * bps) / BPS;

        address player = r.player;
        r.status = Status.Settled;
        pot -= payout;
        if (payout != 0) _push(player, payout);
        emit Settled(rollId, player, h, face, score, payout, pot);
    }

    /// @notice marque PERDU un roll que plus personne ne peut regler (hash sorti de la fenetre de 256 blocs). Aucun fonds ne bouge.
    function expire(uint256 rollId) external {
        Roll storage r = rolls[rollId];
        if (r.status != Status.Pending) revert NotPending();
        if (block.number <= uint256(r.targetBlock) + SETTLE_WINDOW) revert StillSettleable();
        r.status = Status.Expired;
        emit Expired(rollId, r.player);
    }

    /* ================================================================ lectures (pures, pour l app et la parite) */

    /// @notice la face d un hash de bloc, comme face-du-jour.js faceRevelee : [colorBand, orbit, facet, material, ornament].
    /// @dev les 20 premiers octets du hash -> la chaine ASCII "0x" + 40 hex MINUSCULES -> keccak256 de cette chaine
    ///      (apparence.js : keccak256(enc.encode(adresse.toLowerCase()))). teinte = (o0*256+o1) % 361 ;
    ///      bande = ((teinte+30) % 360) / 60 ; orbite = o6 % 10 ; facette = o7 % 19 ; matiere = o8 % 9 ; ornement = o9 % 8.
    function faceOf(bytes32 blockHash) public pure returns (uint8[5] memory face) {
        bytes32 k = keccak256(_hexAddress(bytes20(blockHash)));
        uint256 teinte = (uint256(uint8(k[0])) * 256 + uint8(k[1])) % 361;
        face[0] = uint8(((teinte + 30) % 360) / 60);
        face[1] = uint8(k[6]) % ORBITS;
        face[2] = uint8(k[7]) % FACETS;
        face[3] = uint8(k[8]) % MATERIALS;
        face[4] = uint8(k[9]) % ORNAMENTS;
    }

    /// @notice la teinte brute (0..360) d un hash, pour l affichage « presque » de l app.
    function hueOf(bytes32 blockHash) external pure returns (uint16) {
        bytes32 k = keccak256(_hexAddress(bytes20(blockHash)));
        return uint16((uint256(uint8(k[0])) * 256 + uint8(k[1])) % 361);
    }

    /// @notice traits en commun sur 5.
    function scoreOf(uint8[5] memory guess, uint8[5] memory face) public pure returns (uint8 s) {
        for (uint256 i = 0; i < 5; i++) if (guess[i] == face[i]) s++;
    }

    /// @notice ce que paierait un score SI le settle avait lieu maintenant (le pot peut bouger avant).
    function payoutFor(uint8 score) external view returns (uint256) {
        uint16 bps = score == 5 ? P5_BPS : score == 4 ? P4_BPS : score == 3 ? P3_BPS : 0;
        return (pot * bps) / BPS;
    }

    function guessOf(uint256 rollId) external view returns (uint8[5] memory) {
        return _unpack(rolls[rollId].guess);
    }

    /* ================================================================ interne */

    function _record(uint8[5] calldata g) internal returns (uint256 rollId) {
        if (g[0] >= BANDS || g[1] >= ORBITS || g[2] >= FACETS || g[3] >= MATERIALS || g[4] >= ORNAMENTS) revert BadGuess();
        rollId = ++rollCount;
        rolls[rollId] = Roll({
            player: msg.sender,
            targetBlock: uint48(block.number + TARGET_DELAY),
            status: Status.Pending,
            guess: _pack(g)
        });
    }

    /// @dev la part du pot entre au contrat, le reste part au DEV_WALLET -- deux transferFrom, un approve EXACT du prix suffit.
    function _charge(uint256 price) internal returns (uint256 toPot, uint256 toDev) {
        toPot = (price * POT_SHARE_BPS) / BPS;
        toDev = price - toPot;
        pot += toPot;
        if (toPot != 0) _pull(msg.sender, address(this), toPot);
        if (toDev != 0) _pull(msg.sender, DEV_WALLET, toDev);
        if (toPot != 0) emit Funded(msg.sender, toPot, pot);
    }

    function _pack(uint8[5] calldata g) internal pure returns (uint40 p) {
        p = (uint40(g[0]) << 32) | (uint40(g[1]) << 24) | (uint40(g[2]) << 16) | (uint40(g[3]) << 8) | uint40(g[4]);
    }

    function _unpack(uint40 p) internal pure returns (uint8[5] memory g) {
        g[0] = uint8(p >> 32);
        g[1] = uint8(p >> 24);
        g[2] = uint8(p >> 16);
        g[3] = uint8(p >> 8);
        g[4] = uint8(p);
    }

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

    /// @dev transferFrom style SafeERC20 : l appel doit reussir ET rendre vide ou `true`
    function _pull(address from, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = USDC.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _push(address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = USDC.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
