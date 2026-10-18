// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockDuels -- deux wallets misent la meme somme et devinent chacun la face d un bloc Base (decision de Phil, 2026-10-18).
/// @notice Un duel : le createur mise `stake` d un jeton ADMIS (USDC, ou une action tokenisee admise par le gardien) et devine 5 traits ;
///         un second wallet rejoint avec la MEME mise et son propre guess ; la face revelee est celle du hash du bloc `targetBlock`
///         (join + 2), calculee EXACTEMENT comme BlockRolls (copie verbatim de faceOf / _hexAddress / scoreOf, parite testee).
///         Le plus de traits en commun gagne : 90 % du pot au gagnant, 7 % au pot de recompense commun, le reste (3 % + la poussiere
///         d arrondi) au DEV_WALLET. Egalite : chacun recupere sa mise, aucun frais.
/// @dev ⛔ CE QUI EST GRAVE ICI, ET POURQUOI :
///   - AUCUN proprietaire, AUCUN retrait, AUCUNE mise a jour, AUCUN changement de frais. Les jetons ne sortent que par : un settle
///     (gagnant / pot commun / dev, ou les deux mises en cas d egalite), un cancel (createur, avant qu on rejoigne), un refundExpired.
///   - le GARDIEN ne fait qu UNE chose : admettre ou retirer un jeton (setToken) pour les NOUVEAUX duels. USDC est admis a la
///     construction et ne peut pas etre retire. Un jeton retire ne bloque JAMAIS le settle, le cancel ni le remboursement d un duel existant.
///   - aucun fonds ne reste bloque : un duel rejoint et non regle dans les 256 blocs apres sa cible (blockhash() rend 0) se rembourse
///     en entier (refundExpired, par n importe qui) ; un duel jamais rejoint se rembourse au createur apres expiresAt.
///     ⚠️ consequence ASSUMEE (le brief l exige) : si PERSONNE ne regle dans les 256 blocs, le duel devient un remboursement -- le
///     gagnant (ou l app, ou n importe qui) doit regler a temps : ~8,5 min aujourd hui, ~51 s apres Denim (200 ms/bloc).
///   - un paiement REFUSE par le jeton (adresse sur liste noire, jeton a liste blanche) ne bloque pas les autres : le montant reste
///     dans le contrat, DU a cette adresse (owed), qui le reclame vers l adresse de son choix (claim). Le pot reste exact.
///   - une mise est recue EXACTEMENT (solde avant/apres) : un jeton a frais de transfert est refuse, sinon le pot ne serait plus 2 x stake.
///   - le hash du bloc cible est produit par le SEQUENCEUR de Base : meme confiance que BlockRolls et le tirage de l app, dite, pas cachee.
contract BlockDuels {
    /* ---------------------------------------------------------------- constantes de la face (copie de BlockRolls) */
    /* l ordre et la longueur des listes d apparence.js (ORBITES 10, FACETTES 19, MATIERES 9, ORNEMENTS 8) et des 6 bandes
     * de face-du-jour.js (BANDES). ⛔ Si une liste change dans l app, la parite (test JS) rougit : rien ne derive en silence. */
    uint8 public constant BANDS = 6;
    uint8 public constant ORBITS = 10;
    uint8 public constant FACETS = 19;
    uint8 public constant MATERIALS = 9;
    uint8 public constant ORNAMENTS = 8;

    /* ---------------------------------------------------------------- constantes du duel */
    uint256 public constant BPS = 10_000;
    uint256 public constant WINNER_BPS = 9_000;
    uint256 public constant POOL_BPS = 700;
    /* le dev recoit pot - gagnant - pot commun : 300 bps + la poussiere d arrondi, la somme est EXACTE */
    uint256 public constant MIN_STAKE = 100_000;
    /* plafond de mise : 2 x stake x 9000 ne deborde jamais, un settle ne peut pas reverter sur un depassement */
    uint256 public constant MAX_STAKE = type(uint96).max;
    uint64 public constant MIN_EXPIRY = 600;
    uint64 public constant MAX_EXPIRY = 7 days;
    /* le bloc cible est 2 blocs APRES le join : son hash n existe pas encore quand le second guess est grave */
    uint256 public constant TARGET_DELAY = 2;
    /* ⛔ blockhash() ne lit que les 256 derniers blocs -- une limite de l EVM. Reglable : cible < bloc <= cible + 256 ;
     *    remboursable : bloc > cible + 256. Les deux bornes sont complementaires, aucun bloc n est « ni l un ni l autre ». */
    uint256 public constant SETTLE_WINDOW = 256;

    /* ---------------------------------------------------------------- immuables */
    address public immutable USDC;
    address public immutable DEV_WALLET;
    address public immutable REWARD_POOL;
    address public immutable GUARDIAN;

    /* ---------------------------------------------------------------- etat */
    enum Status { None, Open, Joined, Settled, Cancelled, Refunded }

    /* 3 cases : (creator 20 + expiresAt 8 + status 1 + guessA 3) · (joiner 20 + targetBlock 5 + guessB 3) · (token 20 + stake 12) */
    struct Duel {
        address creator;
        uint64 expiresAt;
        Status status;
        uint24 guessA; /* bits : colorBand 16..19, orbit 12..15, facet 7..11, material 3..6, ornament 0..2 (comme BlockRolls) */
        address joiner;
        uint40 targetBlock;
        uint24 guessB;
        address token;
        uint96 stake;
    }

    mapping(uint256 => Duel) public duels;
    /* l id que recevra le PROCHAIN duel ; les ids commencent a 1 (duels(0) n existe jamais) */
    uint256 public nextId = 1;
    mapping(address => bool) public tokenOk;
    /* ce qu un jeton a refuse de payer a une adresse : reclamable par elle seule (claim), jamais par un tiers */
    mapping(address => mapping(address => uint256)) public owed;
    uint256 private _lock = 1;

    /* ---------------------------------------------------------------- evenements */
    event Created(uint256 indexed id, address indexed creator, address token, uint256 stake, uint8[5] guess, uint64 expiresAt);
    event Cancelled(uint256 indexed id);
    event Joined(uint256 indexed id, address indexed joiner, uint8[5] guess, uint256 targetBlock);
    /// @dev egalite : winner = address(0), payout = 0, et Refunded(id, stake, stake) est emis juste apres
    event Settled(uint256 indexed id, bytes32 blockHash, uint8 scoreA, uint8 scoreB, address winner, uint256 payout);
    event Refunded(uint256 indexed id, uint256 toCreator, uint256 toJoiner);
    event TokenSet(address indexed token, bool ok);
    event Owed(address indexed token, address indexed to, uint256 amount);
    event Claimed(address indexed token, address indexed account, address to, uint256 amount);

    /* ---------------------------------------------------------------- erreurs */
    error BadConfig();
    error BadToken();
    error NotGuardian();
    error TokenNotAdmitted();
    error BadStake();
    error BadExpiry();
    error BadGuess();
    error NotOpen();
    error NotJoined();
    error NotCreator();
    error OwnDuel();
    error Expired();
    error TooEarly();
    error TooLate();
    error HashUnavailable();
    error NotRefundable();
    error NotExact();
    error NothingOwed();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address usdc, address devWallet, address rewardPool, address guardian) {
        if (usdc == address(0) || usdc.code.length == 0) revert BadConfig();
        if (devWallet == address(0) || rewardPool == address(0) || guardian == address(0)) revert BadConfig();
        USDC = usdc;
        DEV_WALLET = devWallet;
        REWARD_POOL = rewardPool;
        GUARDIAN = guardian;
        tokenOk[usdc] = true;
        emit TokenSet(usdc, true);
    }

    /* ================================================================ jetons admis */

    /// @notice SEUL le gardien. Admet (ok) ou retire un ERC20 pour les NOUVEAUX duels. USDC ne se retire pas. Un jeton admis doit avoir du code.
    function setToken(address token, bool ok) external {
        if (msg.sender != GUARDIAN) revert NotGuardian();
        if (token == address(0) || token == USDC) revert BadToken();
        if (ok && token.code.length == 0) revert BadToken();
        tokenOk[token] = ok;
        emit TokenSet(token, ok);
    }

    /* ================================================================ duel */

    /// @notice ouvre un duel : la mise est TIREE (transferFrom, recue exactement), le guess grave, ouvert pendant expiresIn secondes.
    function create(address token, uint256 stake, uint8[5] calldata guess, uint64 expiresIn) external nonReentrant returns (uint256 id) {
        if (!tokenOk[token]) revert TokenNotAdmitted();
        if (stake < MIN_STAKE || stake > MAX_STAKE) revert BadStake();
        if (expiresIn < MIN_EXPIRY || expiresIn > MAX_EXPIRY) revert BadExpiry();
        uint24 g = _check(guess);
        id = nextId++;
        uint64 exp = uint64(block.timestamp) + expiresIn;
        Duel storage d = duels[id];
        d.creator = msg.sender;
        d.expiresAt = exp;
        d.status = Status.Open;
        d.guessA = g;
        d.token = token;
        d.stake = uint96(stake);
        _pullExact(token, msg.sender, stake);
        emit Created(id, msg.sender, token, stake, guess, exp);
    }

    /// @notice le createur reprend sa mise tant que personne n a rejoint (avant ou apres l expiration).
    function cancel(uint256 id) external nonReentrant {
        Duel storage d = duels[id];
        if (d.status != Status.Open) revert NotOpen();
        if (msg.sender != d.creator) revert NotCreator();
        d.status = Status.Cancelled;
        _pay(d.token, d.creator, d.stake);
        emit Cancelled(id);
    }

    /// @notice rejoint un duel ouvert avec la MEME mise ; la cible est fixee a bloc + 2 (son hash n existe pas encore).
    function join(uint256 id, uint8[5] calldata guess) external nonReentrant {
        Duel storage d = duels[id];
        if (d.status != Status.Open) revert NotOpen();
        if (block.timestamp >= d.expiresAt) revert Expired();
        if (msg.sender == d.creator) revert OwnDuel();
        /* un jeton retire n accepte plus de NOUVEL argent ; le createur garde cancel / refundExpired */
        if (!tokenOk[d.token]) revert TokenNotAdmitted();
        uint24 g = _check(guess);
        uint256 t = block.number + TARGET_DELAY;
        d.joiner = msg.sender;
        d.guessB = g;
        d.targetBlock = uint40(t);
        d.status = Status.Joined;
        _pullExact(d.token, msg.sender, d.stake);
        emit Joined(id, msg.sender, guess, t);
    }

    /// @notice APPELABLE PAR TOUS, dans la fenetre (cible < bloc <= cible + 256). Le gain va TOUJOURS au gagnant, jamais a l appelant.
    function settle(uint256 id) external nonReentrant returns (address winner, uint256 payout) {
        Duel storage d = duels[id];
        if (d.status != Status.Joined) revert NotJoined();
        uint256 t = d.targetBlock;
        if (block.number <= t) revert TooEarly();
        if (block.number > t + SETTLE_WINDOW) revert TooLate();
        bytes32 h = blockhash(t);
        if (h == bytes32(0)) revert HashUnavailable();
        /* l etat AVANT tout transfert (checks-effects-interactions) */
        d.status = Status.Settled;
        return _settle(id, d, h);
    }

    /// @dev le coeur : la face, les deux scores, le partage ou le remboursement (egalite)
    function _settle(uint256 id, Duel storage d, bytes32 h) internal returns (address winner, uint256 payout) {
        uint8[5] memory face = faceOf(h);
        uint8 sA = scoreOf(_unpack(d.guessA), face);
        uint8 sB = scoreOf(_unpack(d.guessB), face);
        if (sA == sB) {
            _pay(d.token, d.creator, d.stake);
            _pay(d.token, d.joiner, d.stake);
            emit Settled(id, h, sA, sB, address(0), 0);
            emit Refunded(id, d.stake, d.stake);
            return (address(0), 0);
        }
        winner = sA > sB ? d.creator : d.joiner;
        payout = _payWin(d.token, d.stake, winner);
        emit Settled(id, h, sA, sB, winner, payout);
    }

    /// @dev 90 % au gagnant, 7 % au pot commun, le reste au dev ; rend la part du gagnant
    function _payWin(address token, uint256 stake, address winner) internal returns (uint256 toWinner) {
        (uint256 w, uint256 p, uint256 dv) = splitOf(stake);
        _pay(token, winner, w);
        _pay(token, REWARD_POOL, p);
        _pay(token, DEV_WALLET, dv);
        return w;
    }

    /// @notice APPELABLE PAR TOUS. Rejoint et plus reglable (bloc > cible + 256) : les deux mises rendues en entier.
    ///         Jamais rejoint et expire : la mise rendue au createur. Sinon : refus.
    function refundExpired(uint256 id) external nonReentrant {
        Duel storage d = duels[id];
        uint256 stake = d.stake;
        if (d.status == Status.Joined) {
            if (block.number <= uint256(d.targetBlock) + SETTLE_WINDOW) revert NotRefundable();
            d.status = Status.Refunded;
            _pay(d.token, d.creator, stake);
            _pay(d.token, d.joiner, stake);
            emit Refunded(id, stake, stake);
        } else if (d.status == Status.Open) {
            if (block.timestamp < d.expiresAt) revert NotRefundable();
            d.status = Status.Refunded;
            _pay(d.token, d.creator, stake);
            emit Refunded(id, stake, 0);
        } else {
            revert NotRefundable();
        }
    }

    /// @notice ce qu un jeton a refuse de payer a msg.sender, envoye a `to` (une autre adresse si la sienne est refusee par le jeton).
    function claim(address token, address to) external nonReentrant {
        uint256 a = owed[token][msg.sender];
        if (a == 0) revert NothingOwed();
        owed[token][msg.sender] = 0;
        if (!_tryPush(token, to, a)) revert TransferFailed();
        emit Claimed(token, msg.sender, to, a);
    }

    /* ================================================================ lectures */

    /// @notice le partage d un duel gagne : (gagnant 90 %, pot commun 7 %, dev le reste) de pot = 2 x stake ; la somme = pot exactement.
    function splitOf(uint256 stake) public pure returns (uint256 toWinner, uint256 toPool, uint256 toDev) {
        uint256 pot = 2 * stake;
        toWinner = (pot * WINNER_BPS) / BPS;
        toPool = (pot * POOL_BPS) / BPS;
        toDev = pot - toWinner - toPool;
    }

    function guessesOf(uint256 id) external view returns (uint8[5] memory a, uint8[5] memory b) {
        Duel storage d = duels[id];
        a = _unpack(d.guessA);
        b = _unpack(d.guessB);
    }

    /// @notice le DERNIER bloc ou settle(id) passe encore (cible + 256) ; 0 si le duel n est pas rejoint.
    function settleableUntil(uint256 id) external view returns (uint256) {
        Duel storage d = duels[id];
        if (d.status != Status.Joined) return 0;
        return uint256(d.targetBlock) + SETTLE_WINDOW;
    }

    /// @notice la face d un hash de bloc, comme face-du-jour.js faceRevelee : [colorBand, orbit, facet, material, ornament].
    /// @dev ⛔ COPIE VERBATIM de BlockRolls.faceOf (test_PariteAvecBlockRolls compare les deux contrats sur des hash aleatoires).
    ///      les 20 premiers octets du hash -> la chaine ASCII "0x" + 40 hex MINUSCULES -> keccak256 de cette chaine
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

    /* ================================================================ interne */

    function _check(uint8[5] calldata g) internal pure returns (uint24) {
        if (g[0] >= BANDS || g[1] >= ORBITS || g[2] >= FACETS || g[3] >= MATERIALS || g[4] >= ORNAMENTS) revert BadGuess();
        return _pack(g);
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

    /// @dev un retour ERC20 accepte : vide (jeton sans bool) ou un mot egal a 1. Tout le reste (false, donnee courte, 2...) = refus.
    function _accepted(bool ok, bytes memory ret) internal pure returns (bool) {
        if (!ok) return false;
        if (ret.length == 0) return true;
        if (ret.length < 32) return false;
        return abi.decode(ret, (uint256)) == 1;
    }

    function _balance(address token) internal view returns (uint256) {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSelector(0x70a08231, address(this)));
        if (!ok || ret.length < 32) revert TransferFailed();
        return abi.decode(ret, (uint256));
    }

    /// @dev transferFrom style SafeERC20, puis le solde du contrat doit avoir monte de `amount` EXACTEMENT
    function _pullExact(address token, address from, uint256 amount) internal {
        uint256 b0 = _balance(token);
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0x23b872dd, from, address(this), amount));
        if (!_accepted(ok, ret)) revert TransferFailed();
        if (_balance(token) != b0 + amount) revert NotExact();
    }

    function _tryPush(address token, address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        return _accepted(ok, ret);
    }

    /// @dev paie, ou, si le jeton refuse, inscrit le montant comme DU a `to` : un destinataire refuse ne bloque jamais les autres
    function _pay(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (!_tryPush(token, to, amount)) {
            owed[token][to] += amount;
            emit Owed(token, to, amount);
        }
    }
}
