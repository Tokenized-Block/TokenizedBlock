// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockRolls -- un tirage PAYANT sur la face d un bloc Base (decision de Phil, 2026-10-17 soir ; economie du 20:30).
/// @notice Le joueur paie (USDC) et devine 5 traits ; la face revelee est celle du hash du bloc `targetBlock`,
///         calculee EXACTEMENT comme l app (face-du-jour.js faceRevelee + apparence.js apparenceDepuisAdresse).
/// @dev ⛔ CE QUI EST GRAVE ICI, ET POURQUOI :
///   - AUCUN proprietaire, AUCUN retrait : l USDC ne sort que par un settle gagnant (pot des rolls) ou un tirage du jour
///     (pot du jour). Le createur de UNIT fixe les REGLES (prix des gains, score minimum), rien d autre : ni retrait, ni pause.
///   - ROLL 0,50 : moitie au pot des rolls, moitie au DEV_WALLET tout de suite. Un gain est un PRIX FIXE par nombre de traits
///     en commun (Phil 2026-10-18 12:20, defauts : 2 -> 0,50 ; 3 -> 1 ; 4 -> 3 ; 5 -> 5 USDC ; 0 ou 1 -> rien), PLAFONNE par le
///     pot au moment du settle : payout = min(prize[score], pot). Le pot ne paie jamais plus qu il ne tient ; N gagnants sur
///     le meme bloc sont payes dans l ORDRE des settles sur ce qui RESTE.
///   - les REGLES (prize2 <= prize3 <= prize4 <= prize5 <= 1000 USDC, minScore 2..5) sont fixees par le createur de UNIT -- l adresse que le hook
///     7030 rend pour la pool UNIT/ETH (HOOK.createurs(UNIT_POOL_ID), premier mot), LUE a chaque appel -- et chaque roll
///     garde la VERSION des regles de sa creation : un changement ne touche que les rolls crees apres.
///   - PASS 10 USDC (skin pass, 24 h, PASS_ROLLS rolls) : moitie au POT DU JOUR (jour UTC = block.timestamp / 86400 a
///     l achat), moitie au DEV_WALLET. Les acheteurs du jour (UN par wallet) forment le tirage du jour : closeDay(day) par
///     n importe qui une fois le jour fini fixe target = block.number + 2 ; drawDay(day) dans les 256 blocs paie TOUT le pot
///     du jour a buyers[uint(blockhash(target)) % n]. Fenetre ratee : closeDay re-arme, SEULEMENT apres l expiration.
///     ⚠️ Revelation selective : celui qui a ferme le jour voit le hash et peut se taire s il perd -- mais N IMPORTE QUI peut
///     tirer, le gagnant d abord ; un perdant ne bloque personne. Reste : si personne ne tire en 256 blocs, le hash change.
///   - un roll non regle dans les 256 blocs apres sa cible est PERDU (pas de remboursement : un remboursement laisserait
///     le joueur ne reveler que ses gagnants).
///   - le hash du bloc cible est produit par le SEQUENCEUR de Base : meme confiance que le tirage de l app, dite, pas cachee.
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
    /* bornes des regles : un prix <= 1000 USDC, un score minimum entre 2 et 5 (1 trait ne paie jamais : ~35 % des rolls en ont 1) */
    uint64 public constant MAX_PRIZE = 1000_000000;
    uint8 public constant MIN_SCORE_FLOOR = 2;
    /* le bloc cible est 2 blocs APRES le roll (ou la fermeture du jour) : son hash n existe pas encore. En BLOCS, pas en
     * secondes : 4 s aujourd hui (2 s/bloc), ~0,4 s apres Denim (200 ms/bloc, Base mainnet vise novembre 2026). */
    uint256 public constant TARGET_DELAY = 2;
    /* ⛔ DENIM : blockhash() ne lit que les 256 derniers blocs -- une limite de l EVM, pas un choix. Aujourd hui 256 blocs
     * = ~8,5 min ; apres Denim (200 ms/bloc) = ~51 s. Un roll ou un tirage non regle dans ce delai est PERDU (roll) ou a
     * RE-ARMER (jour). L app ou un gardien (keeper) SANS permission regle vite : settleMany(ids) par n importe qui, et
     * settleableUntil(id) / drawableUntil(day) disent jusqu a quel bloc. Aucun chemin ne contourne cette limite ici : une
     * « preuve de hash » hors blockhash() ferait confiance a qui l apporte. */
    uint256 public constant SETTLE_WINDOW = 256;
    uint64 public constant DAY = 86400;

    /* ---------------------------------------------------------------- immuables */
    address public immutable USDC;
    address public immutable DEV_WALLET;
    /* le hook 7030 et l id de la pool UNIT/ETH : le createur de UNIT y est LU (createurs(bytes32)) */
    address public immutable HOOK;
    bytes32 public immutable UNIT_POOL_ID;
    uint256 public immutable ROLL_PRICE;
    uint256 public immutable PASS_PRICE;
    uint32 public immutable PASS_ROLLS;
    uint64 public immutable PASS_WINDOW;
    uint16 public immutable POT_SHARE_BPS;

    /* ---------------------------------------------------------------- etat */
    enum Status { None, Pending, Settled, Expired }
    enum DayState { Open, Armed, Drawn }

    /* ⚠️ une seule case de stockage : 20 + 5 + 1 + 3 + 2 = 31 octets */
    struct Roll {
        address player;
        uint40 targetBlock;
        Status status;
        uint24 guess; /* bits : colorBand 16..19, orbit 12..15, facet 7..11, material 3..6, ornament 0..2 */
        uint16 rulesVersion; /* les regles de SA creation */
    }

    struct Pass {
        uint32 rollsLeft;
        uint64 expiresAt;
    }

    /* prix FIXES en USDC brut par score, et le score minimum qui gagne */
    struct Rules {
        uint64 prize5;
        uint64 prize4;
        uint64 prize3;
        uint64 prize2;
        uint8 minScore;
    }

    struct Day {
        uint256 pot;
        uint40 targetBlock;
        DayState state;
    }

    /* le pot des rolls, tenu en compte (pas balanceOf) : un transfert direct au contrat n y entre pas, et rien ne le fait sortir
     * sauf un settle gagnant. Invariant : pot + somme(dayPots[d].pot) <= USDC.balanceOf(this). */
    uint256 public pot;
    uint256 public rollCount;
    uint16 public rulesVersion;
    mapping(uint16 => Rules) public rules;
    mapping(uint256 => Roll) public rolls;
    mapping(address => Pass) public passes;
    mapping(uint32 => Day) public dayPots;
    mapping(uint32 => address[]) internal _buyers;
    mapping(uint32 => mapping(address => bool)) public entered;
    uint256 private _lock = 1;

    /* ---------------------------------------------------------------- evenements */
    event Funded(address indexed from, uint256 amount, uint256 potAfter);
    /// @dev le serveur lit (player, day) sur le recu pour crediter le ticket du jour
    event PassBought(address indexed player, uint32 indexed day, uint32 rollsLeft, uint64 expiresAt, uint256 paid, uint256 dayPotAfter);
    event Rolled(uint256 indexed rollId, address indexed player, uint8[5] guess, uint256 targetBlock, bool withPass, uint256 toPot, uint256 toDev);
    event Settled(uint256 indexed rollId, address indexed player, bytes32 blockHash, uint8[5] face, uint8 score, uint256 payout, uint256 potAfter);
    event Expired(uint256 indexed rollId, address indexed player);
    event RulesSet(uint16 indexed version, uint64 prize5, uint64 prize4, uint64 prize3, uint64 prize2, uint8 minScore, address by);
    event DayClosed(uint32 indexed day, uint256 targetBlock, uint256 buyers, uint256 dayPot, address by);
    event DayDrawn(uint32 indexed day, address indexed winner, bytes32 blockHash, uint256 amount, uint256 buyers);

    /* ---------------------------------------------------------------- erreurs */
    error BadConfig();
    error BadGuess();
    error BadRules();
    error NotCreator();
    error ZeroAmount();
    error NoPass();
    error PassActive();
    error NotPending();
    error TooEarly();
    error TooLate();
    error StillSettleable();
    error HashUnavailable();
    error DayNotOver();
    error DayNotArmed();
    error DayDone();
    error NoBuyers();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /* ⚠️ un struct STATIQUE : encode exactement comme 14 mots a plat (le banc fork et preparer-deploiement encodent ainsi ; l ordre
     *    est verifie contre l ABI compilee par le preparateur et par test-blockrolls-plan) */
    struct Config {
        address usdc;
        address devWallet;
        address hook;
        bytes32 unitPoolId;
        uint256 rollPrice;
        uint256 passPrice;
        uint32 passRolls;
        uint64 passWindow;
        uint16 potShareBps;
        uint64 prize5;
        uint64 prize4;
        uint64 prize3;
        uint64 prize2;
        uint8 minScore;
    }

    constructor(Config memory c) {
        if (c.usdc == address(0) || c.usdc.code.length == 0 || c.devWallet == address(0)) revert BadConfig();
        if (c.hook.code.length == 0 || c.unitPoolId == bytes32(0)) revert BadConfig();
        if (c.rollPrice == 0 || c.passPrice == 0 || c.passRolls == 0 || c.passWindow == 0) revert BadConfig();
        if (c.potShareBps > BPS || !_rulesOk(c.prize5, c.prize4, c.prize3, c.prize2, c.minScore)) revert BadConfig();
        USDC = c.usdc;
        DEV_WALLET = c.devWallet;
        HOOK = c.hook;
        UNIT_POOL_ID = c.unitPoolId;
        ROLL_PRICE = c.rollPrice;
        PASS_PRICE = c.passPrice;
        PASS_ROLLS = c.passRolls;
        PASS_WINDOW = c.passWindow;
        POT_SHARE_BPS = c.potShareBps;
        rulesVersion = 1;
        rules[1] = Rules(c.prize5, c.prize4, c.prize3, c.prize2, c.minScore);
        emit RulesSet(1, c.prize5, c.prize4, c.prize3, c.prize2, c.minScore, msg.sender);
    }

    /* ================================================================ regles */

    /// @notice le createur de UNIT, LU au hook a chaque appel (premier mot de createurs(UNIT_POOL_ID)) ; address(0) si illisible.
    function unitCreator() public view returns (address c) {
        (bool ok, bytes memory ret) = HOOK.staticcall(abi.encodeWithSignature("createurs(bytes32)", UNIT_POOL_ID));
        if (ok && ret.length >= 32) c = abi.decode(ret, (address));
    }

    /// @notice SEUL le createur de UNIT. prize2 <= prize3 <= prize4 <= prize5 <= 1000 USDC, minScore 2..5. Ne touche que les rolls crees APRES.
    function setRules(uint64 prize5, uint64 prize4, uint64 prize3, uint64 prize2, uint8 minScore) external {
        address c = unitCreator();
        if (c == address(0) || msg.sender != c) revert NotCreator();
        if (!_rulesOk(prize5, prize4, prize3, prize2, minScore)) revert BadRules();
        uint16 v = ++rulesVersion;
        rules[v] = Rules(prize5, prize4, prize3, prize2, minScore);
        emit RulesSet(v, prize5, prize4, prize3, prize2, minScore, msg.sender);
    }

    function currentRules() external view returns (uint64 prize5, uint64 prize4, uint64 prize3, uint64 prize2, uint8 minScore) {
        Rules storage r = rules[rulesVersion];
        return (r.prize5, r.prize4, r.prize3, r.prize2, r.minScore);
    }

    /// @dev un palier plus haut ne paie jamais moins qu un plus bas (sinon viser 4 traits rapporterait plus que 5) ; le plus haut
    ///      est plafonne, donc tous le sont.
    function _rulesOk(uint64 p5, uint64 p4, uint64 p3, uint64 p2, uint8 minScore) internal pure returns (bool) {
        return p5 <= MAX_PRIZE && p2 <= p3 && p3 <= p4 && p4 <= p5 && minScore >= MIN_SCORE_FLOOR && minScore <= 5;
    }

    /* ================================================================ pot des rolls */

    /// @notice n importe qui ajoute de l USDC au pot des rolls (la part communautaire des frais, par exemple). Sans retour possible.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        pot += amount;
        _pull(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount, pot);
    }

    /* ================================================================ pass et pot du jour */

    function today() public view returns (uint32) {
        return uint32(block.timestamp / DAY);
    }

    function buyersOf(uint32 day) external view returns (address[] memory) {
        return _buyers[day];
    }

    function buyerCount(uint32 day) external view returns (uint256) {
        return _buyers[day].length;
    }

    /// @notice PASS_ROLLS rolls pendant PASS_WINDOW + une entree (par wallet) au tirage du jour UTC de l achat. Refuse tant
    ///         qu un pass ACTIF a encore des rolls : sinon racheter effacerait les rolls deja payes.
    function buyPass() external nonReentrant {
        Pass storage p = passes[msg.sender];
        if (p.rollsLeft != 0 && block.timestamp < p.expiresAt) revert PassActive();
        uint64 exp = uint64(block.timestamp) + PASS_WINDOW;
        p.rollsLeft = PASS_ROLLS;
        p.expiresAt = exp;
        uint32 day = today();
        Day storage d = dayPots[day];
        if (!entered[day][msg.sender]) {
            entered[day][msg.sender] = true;
            _buyers[day].push(msg.sender);
        }
        uint256 toPot = (PASS_PRICE * POT_SHARE_BPS) / BPS;
        uint256 toDev = PASS_PRICE - toPot;
        d.pot += toPot;
        if (toPot != 0) _pull(msg.sender, address(this), toPot);
        if (toDev != 0) _pull(msg.sender, DEV_WALLET, toDev);
        emit PassBought(msg.sender, day, PASS_ROLLS, exp, PASS_PRICE, d.pot);
    }

    /// @notice une fois le jour FINI, n importe qui arme le tirage : target = block.number + 2. Re-armer n est possible que si
    ///         la fenetre de 256 blocs du tirage precedent est passee sans tirage.
    function closeDay(uint32 day) external {
        if (today() <= day) revert DayNotOver();
        Day storage d = dayPots[day];
        if (d.state == DayState.Drawn) revert DayDone();
        if (_buyers[day].length == 0) revert NoBuyers();
        if (d.state == DayState.Armed && block.number <= uint256(d.targetBlock) + SETTLE_WINDOW) revert StillSettleable();
        d.targetBlock = uint40(block.number + TARGET_DELAY);
        d.state = DayState.Armed;
        emit DayClosed(day, d.targetBlock, _buyers[day].length, d.pot, msg.sender);
    }

    /// @notice n importe qui tire : buyers[uint(blockhash(target)) % n] recoit TOUT le pot du jour.
    function drawDay(uint32 day) external nonReentrant returns (address winner, uint256 amount) {
        Day storage d = dayPots[day];
        if (d.state != DayState.Armed) revert DayNotArmed();
        uint256 t = d.targetBlock;
        if (block.number <= t) revert TooEarly();
        if (block.number > t + SETTLE_WINDOW) revert TooLate();
        bytes32 h = blockhash(t);
        if (h == bytes32(0)) revert HashUnavailable();
        address[] storage b = _buyers[day];
        winner = b[uint256(h) % b.length];
        amount = d.pot;
        d.pot = 0;
        d.state = DayState.Drawn;
        if (amount != 0) _push(winner, amount);
        emit DayDrawn(day, winner, h, amount, b.length);
    }

    /* ================================================================ roll */

    /// @notice un roll paye : ROLL_PRICE, POT_SHARE_BPS au pot, le reste au DEV_WALLET tout de suite.
    function roll(uint8[5] calldata guess) external nonReentrant returns (uint256 rollId) {
        rollId = _record(guess);
        uint256 toPot = (ROLL_PRICE * POT_SHARE_BPS) / BPS;
        uint256 toDev = ROLL_PRICE - toPot;
        pot += toPot;
        if (toPot != 0) _pull(msg.sender, address(this), toPot);
        if (toDev != 0) _pull(msg.sender, DEV_WALLET, toDev);
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
        return _settle(rollId, r, h);
    }

    /// @notice plusieurs rolls en une transaction, par n importe qui. Un roll qui n est pas reglable (pas en attente, trop
    ///         tot, hors fenetre, hash illisible) est SAUTE, jamais la raison d un revert du lot. Rend le nombre regles.
    function settleMany(uint256[] calldata ids) external nonReentrant returns (uint256 done) {
        for (uint256 i = 0; i < ids.length; i++) {
            Roll storage r = rolls[ids[i]];
            if (r.status != Status.Pending) continue;
            uint256 t = r.targetBlock;
            if (block.number <= t || block.number > t + SETTLE_WINDOW) continue;
            bytes32 h = blockhash(t);
            if (h == bytes32(0)) continue;
            _settle(ids[i], r, h);
            done++;
        }
    }

    /// @dev le coeur : la face, le score, le prix FIXE des regles DE CE ROLL plafonne par le pot, le paiement au joueur
    function _settle(uint256 rollId, Roll storage r, bytes32 h) internal returns (uint8 score, uint256 payout) {
        uint8[5] memory face = faceOf(h);
        score = scoreOf(_unpack(r.guess), face);
        payout = _prizeFor(rules[r.rulesVersion], score);
        if (payout > pot) payout = pot;

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

    /// @notice ce que paierait un score SI un roll aux regles COURANTES etait regle maintenant (le pot peut bouger avant).
    function payoutFor(uint8 score) external view returns (uint256 p) {
        p = _prizeFor(rules[rulesVersion], score);
        if (p > pot) p = pot;
    }

    function guessOf(uint256 rollId) external view returns (uint8[5] memory) {
        return _unpack(rolls[rollId].guess);
    }

    /// @notice le DERNIER bloc ou settle(id) passe encore (cible + 256) ; 0 si le roll n est pas en attente.
    ///         Apres Denim c est ~51 s apres la cible : le gardien lit cette valeur et regle avant.
    function settleableUntil(uint256 rollId) external view returns (uint256) {
        Roll storage r = rolls[rollId];
        if (r.status != Status.Pending) return 0;
        return uint256(r.targetBlock) + SETTLE_WINDOW;
    }

    /// @notice le DERNIER bloc ou drawDay(day) passe encore ; 0 si le jour n est pas arme (a fermer, ou deja tire).
    function drawableUntil(uint32 day) external view returns (uint256) {
        Day storage d = dayPots[day];
        if (d.state != DayState.Armed) return 0;
        return uint256(d.targetBlock) + SETTLE_WINDOW;
    }

    /* ================================================================ interne */

    function _prizeFor(Rules storage r, uint8 score) internal view returns (uint256) {
        if (score < r.minScore) return 0;
        if (score == 5) return r.prize5;
        if (score == 4) return r.prize4;
        if (score == 3) return r.prize3;
        if (score == 2) return r.prize2;
        return 0;
    }

    function _record(uint8[5] calldata g) internal returns (uint256 rollId) {
        if (g[0] >= BANDS || g[1] >= ORBITS || g[2] >= FACETS || g[3] >= MATERIALS || g[4] >= ORNAMENTS) revert BadGuess();
        rollId = ++rollCount;
        rolls[rollId] = Roll({
            player: msg.sender,
            targetBlock: uint40(block.number + TARGET_DELAY),
            status: Status.Pending,
            guess: _pack(g),
            rulesVersion: rulesVersion
        });
    }

    function _pack(uint8[5] calldata g) internal pure returns (uint24 p) {
        p = (uint24(g[0]) << 16) | (uint24(g[1]) << 12) | (uint24(g[2]) << 7) | (uint24(g[3]) << 3) | uint24(g[4]);
    }

    function _unpack(uint24 p) internal pure returns (uint8[5] memory g) {
        g[0] = uint8(p >> 16) & 0x0f;
        g[1] = uint8(p >> 12) & 0x0f;
        g[2] = uint8(p >> 7) & 0x1f;
        g[3] = uint8(p >> 3) & 0x0f;
        g[4] = uint8(p) & 0x07;
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
