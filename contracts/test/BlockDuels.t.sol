// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/BlockDuels.sol";
import "../src/BlockRolls.sol";

/// @dev jeton de test : decimales au choix, transferFrom standard, un mode « rend false », une liste noire de DESTINATAIRES (comme USDC).
contract JetonT {
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public noire;
    bool public renvoieFaux;

    constructor(uint8 d) { decimals = d; }
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function setFaux(bool f) external { renvoieFaux = f; }
    function setNoire(address a, bool b) external { noire[a] = b; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }

    function transfer(address to, uint256 a) external virtual returns (bool) {
        if (renvoieFaux) return false;
        require(!noire[to], "blacklisted");
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address to, uint256 a) external virtual returns (bool) {
        if (renvoieFaux) return false;
        require(allowance[f][msg.sender] >= a, "allowance");
        require(balanceOf[f] >= a, "balance");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// @dev jeton SANS bool (style USDT) : transfer / transferFrom ne rendent rien.
contract JetonSansBool {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external { allowance[msg.sender][s] = a; }
    function transfer(address to, uint256 a) external {
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
    }
    function transferFrom(address f, address to, uint256 a) external {
        require(allowance[f][msg.sender] >= a, "allowance");
        require(balanceOf[f] >= a, "balance");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
    }
}

/// @dev jeton a FRAIS de transfert (1 %) : le contrat recevrait moins que la mise.
contract JetonAFrais is JetonT {
    constructor() JetonT(18) {}
    function transferFrom(address f, address to, uint256 a) external override returns (bool) {
        require(allowance[f][msg.sender] >= a, "allowance");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a - a / 100;
        return true;
    }
}

/// @dev jeton HOSTILE : pendant un transfert SORTANT du duel, il tente de re-entrer (appel arme a l avance) et note l erreur vue.
contract JetonHostile is JetonT {
    address public cible;
    bytes public appelArme;
    bytes4 public erreurVue;
    bool public reentreeReussie;
    uint256 public tentatives;

    constructor() JetonT(6) {}
    function armer(address c, bytes calldata d) external { cible = c; appelArme = d; }

    function transfer(address to, uint256 a) external override returns (bool) {
        if (cible != address(0) && msg.sender == cible && appelArme.length != 0) {
            tentatives++;
            (bool ok, bytes memory ret) = cible.call(appelArme);
            reentreeReussie = reentreeReussie || ok;
            if (!ok && ret.length >= 4) erreurVue = bytes4(ret);
        }
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract BlockDuelsTest is Test {
    JetonT usdc;
    JetonT action; /* une action tokenisee de test (18 decimales) */
    BlockDuels bd;
    address DEV = address(0xD3F);
    address POOL = address(0x7007);
    address GARDIEN = address(0x6A2D);
    address A = address(0xA11);
    address B = address(0xB22);
    address TIERS = address(0xC33);

    uint256 constant MISE = 5_000_000; /* 5 USDC */
    uint64 constant EXP = 1 hours;

    event Created(uint256 indexed id, address indexed creator, address token, uint256 stake, uint8[5] guess, uint64 expiresAt);
    event Cancelled(uint256 indexed id);
    event Joined(uint256 indexed id, address indexed joiner, uint8[5] guess, uint256 targetBlock);
    event Settled(uint256 indexed id, bytes32 blockHash, uint8 scoreA, uint8 scoreB, address winner, uint256 payout);
    event Refunded(uint256 indexed id, uint256 toCreator, uint256 toJoiner);
    event TokenSet(address indexed token, bool ok);
    event Owed(address indexed token, address indexed to, uint256 amount);

    function setUp() public {
        vm.roll(1000);
        vm.warp(1_700_006_400);
        usdc = new JetonT(6);
        action = new JetonT(18);
        bd = new BlockDuels(address(usdc), DEV, POOL, GARDIEN);
        for (uint256 i = 0; i < 3; i++) {
            address w = [A, B, TIERS][i];
            usdc.mint(w, 1_000_000_000_000);
            action.mint(w, 1_000_000 ether);
        }
    }

    /* ------------------------------------------------------------ aides */

    function _g(uint8 a, uint8 b, uint8 c, uint8 d, uint8 e) internal pure returns (uint8[5] memory g) {
        g[0] = a; g[1] = b; g[2] = c; g[3] = d; g[4] = e;
    }

    /// @dev un guess qui partage EXACTEMENT `k` traits avec la face (les autres decales de 1, modulo la taille de la liste)
    function _guessScore(uint8[5] memory face, uint8 k) internal pure returns (uint8[5] memory g) {
        uint8[5] memory n = [uint8(6), 10, 19, 9, 8];
        for (uint256 i = 0; i < 5; i++) g[i] = i < k ? face[i] : uint8((uint256(face[i]) + 1) % n[i]);
    }

    function _create(address who, address token, uint256 stake, uint8[5] memory g) internal returns (uint256 id) {
        vm.startPrank(who);
        JetonT(token).approve(address(bd), stake);
        id = bd.create(token, stake, g, EXP);
        vm.stopPrank();
    }

    function _join(address who, uint256 id, uint8[5] memory g) internal {
        (,,,,,,, address token, uint96 stake) = bd.duels(id);
        vm.startPrank(who);
        JetonT(token).approve(address(bd), stake);
        bd.join(id, g);
        vm.stopPrank();
    }

    /// @dev join qui DOIT reverter avec `err` (l attente est posee juste avant l appel join, pas avant les lectures)
    function _joinRefuse(address who, uint256 id, uint8[5] memory g, bytes4 err) internal {
        (,,,,,,, address token, uint96 stake) = bd.duels(id);
        if (token == address(0)) token = address(usdc);
        vm.startPrank(who);
        JetonT(token).approve(address(bd), stake == 0 ? MISE : stake);
        vm.expectRevert(err);
        bd.join(id, g);
        vm.stopPrank();
    }

    function _target(uint256 id) internal view returns (uint256 t) {
        (,,,,, uint40 tb,,,) = bd.duels(id);
        t = tb;
    }

    function _status(uint256 id) internal view returns (BlockDuels.Status s) {
        (,, s,,,,,,) = bd.duels(id);
    }

    /// @dev amene la chaine juste apres la cible et y grave le hash voulu
    function _revele(uint256 id, bytes32 h) internal {
        uint256 t = _target(id);
        vm.roll(t + 1);
        vm.setBlockhash(t, h);
    }

    /// @dev un duel complet : A devine avec kA traits, B avec kB traits, sur le hash h
    function _duel(address token, uint256 stake, bytes32 h, uint8 kA, uint8 kB) internal returns (uint256 id) {
        uint8[5] memory face = bd.faceOf(h);
        id = _create(A, token, stake, _guessScore(face, kA));
        _join(B, id, _guessScore(face, kB));
        _revele(id, h);
    }

    /* ------------------------------------------------------------ configuration */

    function test_ConfigImmuable() public view {
        assertEq(bd.USDC(), address(usdc));
        assertEq(bd.DEV_WALLET(), DEV);
        assertEq(bd.REWARD_POOL(), POOL);
        assertEq(bd.GUARDIAN(), GARDIEN);
        assertTrue(bd.tokenOk(address(usdc)), "USDC admis a la construction");
        assertFalse(bd.tokenOk(address(action)));
        assertEq(bd.nextId(), 1, "les ids commencent a 1");
        assertEq(bd.WINNER_BPS() + bd.POOL_BPS(), 9_700);
        assertEq(bd.MIN_STAKE(), 100_000);
        assertEq(bd.MIN_EXPIRY(), 600);
        assertEq(bd.MAX_EXPIRY(), 7 days);
        assertEq(bd.SETTLE_WINDOW(), 256);
        assertEq(bd.TARGET_DELAY(), 2);
    }

    function test_ConfigRefusee() public {
        vm.expectRevert(BlockDuels.BadConfig.selector);
        new BlockDuels(address(0), DEV, POOL, GARDIEN);
        vm.expectRevert(BlockDuels.BadConfig.selector);
        new BlockDuels(address(0x1234), DEV, POOL, GARDIEN); /* usdc sans code */
        vm.expectRevert(BlockDuels.BadConfig.selector);
        new BlockDuels(address(usdc), address(0), POOL, GARDIEN);
        vm.expectRevert(BlockDuels.BadConfig.selector);
        new BlockDuels(address(usdc), DEV, address(0), GARDIEN);
        vm.expectRevert(BlockDuels.BadConfig.selector);
        new BlockDuels(address(usdc), DEV, POOL, address(0));
    }

    /* ------------------------------------------------------------ jetons admis */

    function test_SetTokenSeulLeGardien() public {
        vm.prank(A);
        vm.expectRevert(BlockDuels.NotGuardian.selector);
        bd.setToken(address(action), true);
        vm.prank(DEV);
        vm.expectRevert(BlockDuels.NotGuardian.selector);
        bd.setToken(address(action), true);
        vm.expectEmit(true, false, false, true);
        emit TokenSet(address(action), true);
        vm.prank(GARDIEN);
        bd.setToken(address(action), true);
        assertTrue(bd.tokenOk(address(action)));
        vm.prank(GARDIEN);
        bd.setToken(address(action), false);
        assertFalse(bd.tokenOk(address(action)));
    }

    function test_SetTokenBornes() public {
        vm.startPrank(GARDIEN);
        vm.expectRevert(BlockDuels.BadToken.selector);
        bd.setToken(address(usdc), false); /* USDC ne se retire pas */
        vm.expectRevert(BlockDuels.BadToken.selector);
        bd.setToken(address(0), true);
        vm.expectRevert(BlockDuels.BadToken.selector);
        bd.setToken(address(0xBEEF), true); /* sans code */
        bd.setToken(address(0xBEEF), false); /* retirer une adresse sans code : sans effet, admis */
        vm.stopPrank();
        assertTrue(bd.tokenOk(address(usdc)));
    }

    /* ------------------------------------------------------------ create */

    function test_CreateTireLaMiseExacte() public {
        uint256 a0 = usdc.balanceOf(A);
        uint8[5] memory g = _g(5, 9, 18, 8, 7);
        vm.startPrank(A);
        usdc.approve(address(bd), MISE);
        vm.expectEmit(true, true, false, true);
        emit Created(1, A, address(usdc), MISE, g, uint64(block.timestamp) + EXP);
        uint256 id = bd.create(address(usdc), MISE, g, EXP);
        vm.stopPrank();
        assertEq(id, 1);
        assertEq(bd.nextId(), 2);
        assertEq(a0 - usdc.balanceOf(A), MISE);
        assertEq(usdc.balanceOf(address(bd)), MISE);
        assertEq(usdc.allowance(A, address(bd)), 0, "approve EXACT consomme");
        (address cr, uint64 exp, BlockDuels.Status s,, address jo, uint40 tb,, address tok, uint96 st) = bd.duels(id);
        assertEq(cr, A);
        assertEq(exp, uint64(block.timestamp) + EXP);
        assertEq(uint256(s), uint256(BlockDuels.Status.Open));
        assertEq(jo, address(0));
        assertEq(tb, 0);
        assertEq(tok, address(usdc));
        assertEq(st, MISE);
        (uint8[5] memory ga,) = bd.guessesOf(id);
        assertEq(abi.encode(ga), abi.encode(g), "guess grave et rendu");
    }

    function test_CreateBornesDeMise() public {
        vm.startPrank(A);
        usdc.approve(address(bd), type(uint256).max);
        vm.expectRevert(BlockDuels.BadStake.selector);
        bd.create(address(usdc), 0, _g(0, 0, 0, 0, 0), EXP);
        vm.expectRevert(BlockDuels.BadStake.selector);
        bd.create(address(usdc), 99_999, _g(0, 0, 0, 0, 0), EXP);
        bd.create(address(usdc), 100_000, _g(0, 0, 0, 0, 0), EXP); /* le minimum : admis */
        vm.expectRevert(BlockDuels.BadStake.selector);
        bd.create(address(usdc), uint256(type(uint96).max) + 1, _g(0, 0, 0, 0, 0), EXP);
        vm.stopPrank();
    }

    function test_CreateBornesDExpiration() public {
        vm.startPrank(A);
        usdc.approve(address(bd), type(uint256).max);
        vm.expectRevert(BlockDuels.BadExpiry.selector);
        bd.create(address(usdc), MISE, _g(0, 0, 0, 0, 0), 599);
        vm.expectRevert(BlockDuels.BadExpiry.selector);
        bd.create(address(usdc), MISE, _g(0, 0, 0, 0, 0), 7 days + 1);
        vm.expectRevert(BlockDuels.BadExpiry.selector);
        bd.create(address(usdc), MISE, _g(0, 0, 0, 0, 0), 0);
        bd.create(address(usdc), MISE, _g(0, 0, 0, 0, 0), 600);
        bd.create(address(usdc), MISE, _g(0, 0, 0, 0, 0), 7 days);
        vm.stopPrank();
    }

    function test_CreateGuessHorsBornes() public {
        uint8[5] memory n = [uint8(6), 10, 19, 9, 8];
        vm.startPrank(A);
        usdc.approve(address(bd), type(uint256).max);
        for (uint256 i = 0; i < 5; i++) {
            uint8[5] memory g;
            g[i] = n[i];
            vm.expectRevert(BlockDuels.BadGuess.selector);
            bd.create(address(usdc), MISE, g, EXP);
            g[i] = n[i] - 1;
            bd.create(address(usdc), MISE, g, EXP);
        }
        vm.stopPrank();
    }

    function test_CreateJetonNonAdmis() public {
        vm.startPrank(A);
        action.approve(address(bd), 1 ether);
        vm.expectRevert(BlockDuels.TokenNotAdmitted.selector);
        bd.create(address(action), 1 ether, _g(0, 0, 0, 0, 0), EXP);
        vm.stopPrank();
    }

    function test_CreateApprobationInsuffisante() public {
        vm.startPrank(A);
        usdc.approve(address(bd), MISE - 1);
        vm.expectRevert(BlockDuels.TransferFailed.selector);
        bd.create(address(usdc), MISE, _g(0, 0, 0, 0, 0), EXP);
        vm.stopPrank();
        assertEq(bd.nextId(), 1, "rien n est cree");
    }

    function test_JetonQuiRendFauxRefuse() public {
        vm.startPrank(A);
        usdc.approve(address(bd), MISE);
        usdc.setFaux(true);
        vm.expectRevert(BlockDuels.TransferFailed.selector);
        bd.create(address(usdc), MISE, _g(0, 0, 0, 0, 0), EXP);
        vm.stopPrank();
    }

    function test_JetonAFraisRefuse() public {
        JetonAFrais f = new JetonAFrais();
        f.mint(A, 100 ether);
        vm.prank(GARDIEN);
        bd.setToken(address(f), true);
        vm.startPrank(A);
        f.approve(address(bd), 1 ether);
        vm.expectRevert(BlockDuels.NotExact.selector);
        bd.create(address(f), 1 ether, _g(0, 0, 0, 0, 0), EXP);
        vm.stopPrank();
    }

    /* ------------------------------------------------------------ cancel */

    function test_CancelRendTout() public {
        uint256 a0 = usdc.balanceOf(A);
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        vm.prank(B);
        vm.expectRevert(BlockDuels.NotCreator.selector);
        bd.cancel(id);
        vm.expectEmit(true, false, false, true);
        emit Cancelled(id);
        vm.prank(A);
        bd.cancel(id);
        assertEq(usdc.balanceOf(A), a0, "remboursement entier");
        assertEq(usdc.balanceOf(address(bd)), 0);
        assertEq(uint256(_status(id)), uint256(BlockDuels.Status.Cancelled));
        vm.prank(A);
        vm.expectRevert(BlockDuels.NotOpen.selector);
        bd.cancel(id); /* deux fois : refuse */
        _joinRefuse(B, id, _g(0, 0, 0, 0, 0), BlockDuels.NotOpen.selector); /* on ne rejoint pas un duel annule */
    }

    function test_CancelApresJoinRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        vm.prank(A);
        vm.expectRevert(BlockDuels.NotOpen.selector);
        bd.cancel(id);
    }

    function test_CancelApresExpirationAdmis() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        vm.warp(block.timestamp + EXP + 10);
        vm.prank(A);
        bd.cancel(id);
        assertEq(usdc.balanceOf(address(bd)), 0);
    }

    /* ------------------------------------------------------------ join */

    function test_JoinTireLaMemeMiseEtFixeLaCible() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        uint256 b0 = usdc.balanceOf(B);
        uint8[5] memory g = _g(1, 2, 3, 4, 5);
        vm.startPrank(B);
        usdc.approve(address(bd), MISE);
        vm.expectEmit(true, true, false, true);
        emit Joined(id, B, g, block.number + 2);
        bd.join(id, g);
        vm.stopPrank();
        assertEq(b0 - usdc.balanceOf(B), MISE);
        assertEq(usdc.balanceOf(address(bd)), 2 * MISE);
        assertEq(_target(id), block.number + 2);
        assertEq(uint256(_status(id)), uint256(BlockDuels.Status.Joined));
        (, uint8[5] memory gb) = bd.guessesOf(id);
        assertEq(abi.encode(gb), abi.encode(g));
        assertEq(bd.settleableUntil(id), block.number + 2 + 256);
    }

    function test_JoinSonPropreDuelRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        vm.startPrank(A);
        usdc.approve(address(bd), MISE);
        vm.expectRevert(BlockDuels.OwnDuel.selector);
        bd.join(id, _g(1, 1, 1, 1, 1));
        vm.stopPrank();
    }

    function test_JoinApresExpirationRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        (, uint64 exp,,,,,,,) = bd.duels(id);
        vm.warp(exp);
        vm.startPrank(B);
        usdc.approve(address(bd), MISE);
        vm.expectRevert(BlockDuels.Expired.selector);
        bd.join(id, _g(1, 1, 1, 1, 1));
        vm.warp(exp - 1);
        bd.join(id, _g(1, 1, 1, 1, 1)); /* la derniere seconde : admis */
        vm.stopPrank();
    }

    function test_JoinDeuxFoisRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        _joinRefuse(TIERS, id, _g(2, 2, 2, 2, 2), BlockDuels.NotOpen.selector);
        _joinRefuse(B, 42, _g(2, 2, 2, 2, 2), BlockDuels.NotOpen.selector); /* duel inexistant */
    }

    function test_JoinGuessHorsBornes() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        vm.startPrank(B);
        usdc.approve(address(bd), MISE);
        vm.expectRevert(BlockDuels.BadGuess.selector);
        bd.join(id, _g(0, 0, 19, 0, 0));
        vm.stopPrank();
    }

    /* ------------------------------------------------------------ settle : le partage */

    function test_SettleGagnantA() public {
        bytes32 h = keccak256("gagnant A");
        uint256 id = _duel(address(usdc), MISE, h, 4, 2);
        uint256 a0 = usdc.balanceOf(A);
        uint256 b0 = usdc.balanceOf(B);
        vm.expectEmit(true, false, false, true);
        emit Settled(id, h, 4, 2, A, 9_000_000);
        vm.prank(TIERS);
        (address w, uint256 p) = bd.settle(id);
        assertEq(w, A);
        assertEq(p, 9_000_000);
        assertEq(usdc.balanceOf(A) - a0, 9_000_000, "90 % de 10 USDC au gagnant");
        assertEq(usdc.balanceOf(B), b0, "le perdant ne recoit rien");
        assertEq(usdc.balanceOf(POOL), 700_000, "7 % au pot commun");
        assertEq(usdc.balanceOf(DEV), 300_000, "3 % au dev");
        assertEq(usdc.balanceOf(address(bd)), 0, "rien ne reste");
        assertEq(usdc.balanceOf(TIERS), 1_000_000_000_000, "l appelant ne touche rien");
        assertEq(uint256(_status(id)), uint256(BlockDuels.Status.Settled));
        assertEq(bd.settleableUntil(id), 0);
    }

    function test_SettleGagnantB() public {
        bytes32 h = keccak256("gagnant B");
        uint256 id = _duel(address(usdc), MISE, h, 0, 5);
        uint256 b0 = usdc.balanceOf(B);
        (address w, uint256 p) = bd.settle(id);
        assertEq(w, B);
        assertEq(usdc.balanceOf(B) - b0, p);
        assertEq(p, 9_000_000);
        assertEq(usdc.balanceOf(POOL) + usdc.balanceOf(DEV) + p, 2 * MISE);
    }

    function test_SettleEgaliteRembourseSansFrais() public {
        bytes32 h = keccak256("egalite");
        uint256 id = _duel(address(usdc), MISE, h, 3, 3);
        uint256 a0 = usdc.balanceOf(A);
        uint256 b0 = usdc.balanceOf(B);
        vm.expectEmit(true, false, false, true);
        emit Settled(id, h, 3, 3, address(0), 0);
        vm.expectEmit(true, false, false, true);
        emit Refunded(id, MISE, MISE);
        (address w, uint256 p) = bd.settle(id);
        assertEq(w, address(0));
        assertEq(p, 0);
        assertEq(usdc.balanceOf(A) - a0, MISE, "A recupere sa mise entiere");
        assertEq(usdc.balanceOf(B) - b0, MISE, "B recupere sa mise entiere");
        assertEq(usdc.balanceOf(POOL), 0, "aucun frais au pot commun");
        assertEq(usdc.balanceOf(DEV), 0, "aucun frais au dev");
        assertEq(usdc.balanceOf(address(bd)), 0);
    }

    function test_SettleEgaliteAZero() public {
        bytes32 h = keccak256("zero zero");
        uint256 id = _duel(address(usdc), MISE, h, 0, 0);
        (address w,) = bd.settle(id);
        assertEq(w, address(0), "0 contre 0 : egalite, rembourse");
        assertEq(usdc.balanceOf(DEV), 0);
    }

    function test_PoussiereDArrondiAuDev() public {
        (uint256 w, uint256 p, uint256 d) = bd.splitOf(100_001);
        assertEq(w, 180_001); /* 200002 x 0,9 = 180001,8 */
        assertEq(p, 14_000); /* 200002 x 0,07 = 14000,14 */
        assertEq(d, 6_001); /* le reste : 3 % + 0,8 + 0,14 */
        assertEq(w + p + d, 200_002);
        bytes32 h = keccak256("poussiere");
        uint256 id = _duel(address(usdc), 100_001, h, 1, 0);
        bd.settle(id);
        assertEq(usdc.balanceOf(DEV), 6_001);
        assertEq(usdc.balanceOf(POOL), 14_000);
        assertEq(usdc.balanceOf(address(bd)), 0);
    }

    function testFuzz_PartageSommeExacte(uint256 stake) public view {
        stake = bound(stake, bd.MIN_STAKE(), bd.MAX_STAKE());
        (uint256 w, uint256 p, uint256 d) = bd.splitOf(stake);
        assertEq(w + p + d, 2 * stake, "gagnant + pot commun + dev = pot, au wei");
        assertEq(w, (2 * stake * 9000) / 10000);
        assertEq(p, (2 * stake * 700) / 10000);
        assertGe(d, (2 * stake * 300) / 10000, "le dev a au moins ses 3 %");
        assertLe(d, (2 * stake * 300) / 10000 + 2, "et au plus 2 unites de poussiere");
    }

    /// @dev un duel complet pour TOUT hash, TOUTE paire de guess et TOUTE mise : soldes conserves, le bon gagnant, rien ne reste
    function testFuzz_DuelComplet(bytes32 h, uint8[5] memory ga, uint8[5] memory gb, uint256 stake) public {
        uint8[5] memory n = [uint8(6), 10, 19, 9, 8];
        for (uint256 i = 0; i < 5; i++) { ga[i] = uint8(ga[i] % n[i]); gb[i] = uint8(gb[i] % n[i]); }
        vm.assume(h != bytes32(0));
        stake = bound(stake, 100_000, 1_000_000_000_000 / 2);
        uint256 id = _create(A, address(usdc), stake, ga);
        _join(B, id, gb);
        _revele(id, h);
        uint256 total0 = usdc.balanceOf(A) + usdc.balanceOf(B) + usdc.balanceOf(POOL) + usdc.balanceOf(DEV) + usdc.balanceOf(address(bd));
        uint256 a0 = usdc.balanceOf(A);
        uint256 b0 = usdc.balanceOf(B);
        (address w, uint256 p) = bd.settle(id);
        uint8[5] memory f = bd.faceOf(h);
        uint8 sA = bd.scoreOf(ga, f);
        uint8 sB = bd.scoreOf(gb, f);
        assertEq(usdc.balanceOf(address(bd)), 0, "rien ne reste dans le contrat");
        assertEq(usdc.balanceOf(A) + usdc.balanceOf(B) + usdc.balanceOf(POOL) + usdc.balanceOf(DEV), total0, "rien ne se cree ni ne se perd");
        if (sA == sB) {
            assertEq(w, address(0));
            assertEq(usdc.balanceOf(A) - a0, stake);
            assertEq(usdc.balanceOf(B) - b0, stake);
            assertEq(usdc.balanceOf(DEV) + usdc.balanceOf(POOL), 0);
        } else {
            assertEq(w, sA > sB ? A : B);
            (uint256 tw, uint256 tp, uint256 td) = bd.splitOf(stake);
            assertEq(p, tw);
            assertEq(usdc.balanceOf(w) - (w == A ? a0 : b0), tw);
            assertEq(usdc.balanceOf(POOL), tp);
            assertEq(usdc.balanceOf(DEV), td);
        }
    }

    /* ------------------------------------------------------------ settle : la fenetre */

    function test_SettleTropTot() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        vm.expectRevert(BlockDuels.TooEarly.selector);
        bd.settle(id);
        vm.roll(_target(id));
        vm.expectRevert(BlockDuels.TooEarly.selector);
        bd.settle(id); /* au bloc cible : son hash n existe pas encore */
    }

    function test_SettleDernierBlocDeLaFenetre() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        uint256 t = _target(id);
        vm.roll(t + 256);
        vm.setBlockhash(t, keccak256("dernier"));
        bd.settle(id);
        assertEq(uint256(_status(id)), uint256(BlockDuels.Status.Settled));
    }

    function test_SettleHorsFenetreRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        vm.roll(_target(id) + 257);
        vm.expectRevert(BlockDuels.TooLate.selector);
        bd.settle(id);
    }

    function test_SettleHashNulRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        _revele(id, bytes32(0));
        vm.expectRevert(BlockDuels.HashUnavailable.selector);
        bd.settle(id);
    }

    function test_SettleDeuxFoisRefuse() public {
        uint256 id = _duel(address(usdc), MISE, keccak256("deux fois"), 5, 0);
        bd.settle(id);
        uint256 p0 = usdc.balanceOf(POOL);
        vm.expectRevert(BlockDuels.NotJoined.selector);
        bd.settle(id);
        vm.expectRevert(BlockDuels.NotRefundable.selector);
        bd.refundExpired(id); /* un duel regle ne se rembourse pas */
        assertEq(usdc.balanceOf(POOL), p0);
    }

    function test_SettleSansJoinRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        vm.expectRevert(BlockDuels.NotJoined.selector);
        bd.settle(id);
        vm.expectRevert(BlockDuels.NotJoined.selector);
        bd.settle(77);
    }

    /* ------------------------------------------------------------ refundExpired */

    function test_Remboursement256Blocs() public {
        uint256 a0 = usdc.balanceOf(A);
        uint256 b0 = usdc.balanceOf(B);
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        uint256 t = _target(id);
        vm.roll(t + 256);
        vm.expectRevert(BlockDuels.NotRefundable.selector);
        bd.refundExpired(id); /* encore reglable : pas de remboursement */
        vm.roll(t + 257);
        assertEq(blockhash(t), bytes32(0), "le hash est sorti de la fenetre EVM");
        vm.expectEmit(true, false, false, true);
        emit Refunded(id, MISE, MISE);
        vm.prank(TIERS);
        bd.refundExpired(id);
        assertEq(usdc.balanceOf(A), a0, "A rembourse en entier");
        assertEq(usdc.balanceOf(B), b0, "B rembourse en entier");
        assertEq(usdc.balanceOf(DEV) + usdc.balanceOf(POOL), 0, "aucun frais");
        assertEq(usdc.balanceOf(address(bd)), 0);
        vm.expectRevert(BlockDuels.NotRefundable.selector);
        bd.refundExpired(id); /* deux fois : refuse */
        vm.expectRevert(BlockDuels.NotJoined.selector);
        bd.settle(id);
    }

    function test_RemboursementJamaisRejoint() public {
        uint256 a0 = usdc.balanceOf(A);
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        (, uint64 exp,,,,,,,) = bd.duels(id);
        vm.warp(exp - 1);
        vm.expectRevert(BlockDuels.NotRefundable.selector);
        bd.refundExpired(id); /* encore ouvert */
        vm.warp(exp);
        vm.expectEmit(true, false, false, true);
        emit Refunded(id, MISE, 0);
        vm.prank(TIERS);
        bd.refundExpired(id);
        assertEq(usdc.balanceOf(A), a0);
        assertEq(uint256(_status(id)), uint256(BlockDuels.Status.Refunded));
        _joinRefuse(B, id, _g(1, 1, 1, 1, 1), BlockDuels.NotOpen.selector);
    }

    function test_RemboursementRefuseSiInexistantOuAnnule() public {
        vm.expectRevert(BlockDuels.NotRefundable.selector);
        bd.refundExpired(9);
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        vm.prank(A);
        bd.cancel(id);
        vm.warp(block.timestamp + 8 days);
        vm.expectRevert(BlockDuels.NotRefundable.selector);
        bd.refundExpired(id);
    }

    /* ------------------------------------------------------------ jetons : action tokenisee, sans bool, retire */

    function test_DuelEnActionTokenisee() public {
        vm.prank(GARDIEN);
        bd.setToken(address(action), true);
        bytes32 h = keccak256("action");
        uint256 id = _duel(address(action), 2 ether, h, 2, 1);
        bd.settle(id);
        assertEq(action.balanceOf(POOL), 0.28 ether, "7 % de 4");
        assertEq(action.balanceOf(DEV), 0.12 ether, "3 % de 4");
        assertEq(action.balanceOf(address(bd)), 0);
        assertEq(usdc.balanceOf(POOL), 0, "aucun USDC ne bouge");
    }

    function test_JetonSansBool() public {
        JetonSansBool t = new JetonSansBool();
        t.mint(A, 100 ether);
        t.mint(B, 100 ether);
        vm.prank(GARDIEN);
        bd.setToken(address(t), true);
        bytes32 h = keccak256("sans bool");
        uint8[5] memory face = bd.faceOf(h);
        vm.startPrank(A);
        t.approve(address(bd), 1 ether);
        uint256 id = bd.create(address(t), 1 ether, _guessScore(face, 5), EXP);
        vm.stopPrank();
        vm.startPrank(B);
        t.approve(address(bd), 1 ether);
        bd.join(id, _guessScore(face, 0));
        vm.stopPrank();
        _revele(id, h);
        bd.settle(id);
        assertEq(t.balanceOf(A), 99 ether + 1.8 ether);
        assertEq(t.balanceOf(POOL), 0.14 ether);
        assertEq(t.balanceOf(DEV), 0.06 ether);
        assertEq(t.balanceOf(address(bd)), 0);
        /* cancel et refund aussi */
        vm.startPrank(A);
        t.approve(address(bd), 1 ether);
        uint256 id2 = bd.create(address(t), 1 ether, face, EXP);
        bd.cancel(id2);
        vm.stopPrank();
        assertEq(t.balanceOf(address(bd)), 0);
    }

    function test_JetonRetireRegleQuandMeme() public {
        vm.prank(GARDIEN);
        bd.setToken(address(action), true);
        bytes32 h = keccak256("retire");
        uint256 id = _duel(address(action), 1 ether, h, 5, 4);
        /* un duel ouvert, pas encore rejoint, et un rejoint qui expirera */
        uint256 ouvert = _create(A, address(action), 1 ether, _g(0, 0, 0, 0, 0));
        uint256 rejoint = _create(A, address(action), 1 ether, _g(0, 0, 0, 0, 0));
        _join(B, rejoint, _g(1, 1, 1, 1, 1));
        vm.prank(GARDIEN);
        bd.setToken(address(action), false);
        assertFalse(bd.tokenOk(address(action)));
        /* creer et rejoindre sont fermes au jeton retire... */
        vm.startPrank(A);
        action.approve(address(bd), 1 ether);
        vm.expectRevert(BlockDuels.TokenNotAdmitted.selector);
        bd.create(address(action), 1 ether, _g(0, 0, 0, 0, 0), EXP);
        vm.stopPrank();
        _joinRefuse(B, ouvert, _g(1, 1, 1, 1, 1), BlockDuels.TokenNotAdmitted.selector);
        /* ... mais le settle, le cancel et le remboursement passent */
        (address w,) = bd.settle(id);
        assertEq(w, A);
        assertEq(action.balanceOf(POOL), 0.14 ether);
        vm.prank(A);
        bd.cancel(ouvert);
        vm.roll(_target(rejoint) + 257);
        bd.refundExpired(rejoint);
        assertEq(action.balanceOf(address(bd)), 0, "aucun fonds bloque par le retrait du jeton");
    }

    /* ------------------------------------------------------------ un destinataire refuse ne bloque personne */

    function test_GagnantSurListeNoireNeBloquePasLesAutres() public {
        bytes32 h = keccak256("liste noire");
        uint256 id = _duel(address(usdc), MISE, h, 5, 0);
        usdc.setNoire(A, true);
        vm.expectEmit(true, true, false, true);
        emit Owed(address(usdc), A, 9_000_000);
        (address w, uint256 p) = bd.settle(id);
        assertEq(w, A);
        assertEq(p, 9_000_000);
        assertEq(usdc.balanceOf(POOL), 700_000, "le pot commun est paye");
        assertEq(usdc.balanceOf(DEV), 300_000, "le dev est paye");
        assertEq(bd.owed(address(usdc), A), 9_000_000, "le gain reste DU au gagnant");
        assertEq(usdc.balanceOf(address(bd)), 9_000_000, "solde = ce qui est du");
        vm.prank(B);
        vm.expectRevert(BlockDuels.NothingOwed.selector);
        bd.claim(address(usdc), B); /* un tiers ne reclame rien */
        vm.prank(A);
        vm.expectRevert(BlockDuels.TransferFailed.selector);
        bd.claim(address(usdc), A); /* toujours refuse vers A : rien ne bouge */
        assertEq(bd.owed(address(usdc), A), 9_000_000);
        address neuve = address(0xA12);
        vm.prank(A);
        bd.claim(address(usdc), neuve);
        assertEq(usdc.balanceOf(neuve), 9_000_000);
        assertEq(bd.owed(address(usdc), A), 0);
        assertEq(usdc.balanceOf(address(bd)), 0);
    }

    function test_RemboursementVersListeNoire() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        usdc.setNoire(B, true);
        vm.roll(_target(id) + 257);
        uint256 a0 = usdc.balanceOf(A);
        bd.refundExpired(id);
        assertEq(usdc.balanceOf(A) - a0, MISE, "A rembourse malgre B refuse");
        assertEq(bd.owed(address(usdc), B), MISE);
    }

    /* ------------------------------------------------------------ reentree */

    function _dueldHostile() internal returns (JetonHostile hu, BlockDuels b2, uint256 a, uint256 b, bytes32 h) {
        hu = new JetonHostile();
        b2 = new BlockDuels(address(hu), DEV, POOL, GARDIEN);
        hu.mint(A, 100_000_000);
        hu.mint(B, 100_000_000);
        h = keccak256("reentree");
        uint8[5] memory face = b2.faceOf(h);
        vm.prank(A);
        hu.approve(address(b2), 100_000_000);
        vm.prank(B);
        hu.approve(address(b2), 100_000_000);
        vm.prank(A);
        a = b2.create(address(hu), MISE, face, EXP);
        vm.prank(A);
        b = b2.create(address(hu), MISE, face, EXP);
        vm.prank(B);
        b2.join(a, _guessScore(face, 0));
        vm.prank(B);
        b2.join(b, _guessScore(face, 0));
        vm.roll(block.number + 3);
        vm.setBlockhash(block.number - 1, h);
    }

    function test_ReentreeSettleRefusee() public {
        (JetonHostile hu, BlockDuels b2, uint256 a, uint256 b,) = _dueldHostile();
        hu.armer(address(b2), abi.encodeWithSelector(BlockDuels.settle.selector, b));
        b2.settle(a);
        assertGt(hu.tentatives(), 0, "la reentree a bien ete tentee");
        assertFalse(hu.reentreeReussie(), "la reentree ne passe pas");
        assertEq(hu.erreurVue(), BlockDuels.Reentrancy.selector);
        (,, BlockDuels.Status sb,,,,,,) = b2.duels(b);
        assertEq(uint256(sb), uint256(BlockDuels.Status.Joined), "l autre duel reste a regler");
        assertEq(hu.balanceOf(A), 100_000_000 - 2 * MISE + 9_000_000, "le gagnant est paye UNE fois");
        assertEq(hu.balanceOf(address(b2)), 2 * MISE, "seul l autre duel reste tenu");
    }

    function test_ReentreeRefundEtCancelRefusees() public {
        (JetonHostile hu, BlockDuels b2, uint256 a, uint256 b,) = _dueldHostile();
        /* pendant le paiement du settle de a, tenter le remboursement de b puis un claim */
        hu.armer(address(b2), abi.encodeWithSelector(BlockDuels.refundExpired.selector, b));
        b2.settle(a);
        assertFalse(hu.reentreeReussie());
        assertEq(hu.erreurVue(), BlockDuels.Reentrancy.selector);
        /* pendant un cancel, tenter un autre cancel */
        vm.prank(A);
        uint256 c = b2.create(address(hu), MISE, _g(0, 0, 0, 0, 0), EXP);
        vm.prank(A);
        uint256 d = b2.create(address(hu), MISE, _g(0, 0, 0, 0, 0), EXP);
        hu.armer(address(b2), abi.encodeWithSelector(BlockDuels.cancel.selector, d));
        vm.prank(A);
        b2.cancel(c);
        assertFalse(hu.reentreeReussie());
        assertEq(hu.erreurVue(), BlockDuels.Reentrancy.selector);
        (,, BlockDuels.Status sd,,,,,,) = b2.duels(d);
        assertEq(uint256(sd), uint256(BlockDuels.Status.Open));
    }

    /* ------------------------------------------------------------ PARITE de la face avec BlockRolls (copie verbatim) */

    function _br() internal returns (BlockRolls br) {
        HookStubD hk = new HookStubD();
        br = new BlockRolls(BlockRolls.Config(address(usdc), DEV, address(hk), bytes32(uint256(1)), 500_000, 10_000_000, 30, 1 days, 5000, 5_000_000, 3_000_000, 1_000_000, 500_000, 2));
    }

    function testFuzz_FaceIdentiqueABlockRolls(bytes32 h) public {
        BlockRolls br = _br();
        assertEq(abi.encode(bd.faceOf(h)), abi.encode(br.faceOf(h)), "meme face que BlockRolls");
        assertEq(bd.hueOf(h), br.hueOf(h), "meme teinte que BlockRolls");
    }

    function _parite(bytes32 h, uint8 bande, uint8 orbite, uint8 facette, uint8 matiere, uint8 ornement, uint16 teinte) internal view {
        uint8[5] memory f = bd.faceOf(h);
        assertEq(f[0], bande, "bande");
        assertEq(f[1], orbite, "orbite");
        assertEq(f[2], facette, "facette");
        assertEq(f[3], matiere, "matiere");
        assertEq(f[4], ornement, "ornement");
        assertEq(bd.hueOf(h), teinte, "teinte");
    }

    /// @dev les MEMES epingles que BlockRolls.t.sol test_PariteFaceDuJour (recalculees par test-blockrolls-parite avec les modules de l app)
    function test_PariteFaceDuJour() public view {
        _parite(0x33670809921ee57e8248123f30ff8dbb27acac3454bcd1f5a4336580d0d68521, 4, 7, 12, 7, 2, 211);
        _parite(0x4649bfb672e1ba6238f8f691562ccc7b1c8af762f644dba5add955e9c74962cb, 2, 3, 10, 7, 4, 137);
        _parite(0x614a41e7fca4a30ed399723e1109b10db840fe6e83bb3bf746a0b31eb8d6de50, 1, 0, 2, 8, 1, 68);
        _parite(0x57b276e85e2da230e1f9dc29f618212b46b9da654f479ec9225b30f15f310785, 1, 2, 13, 3, 7, 82);
        _parite(0x5fad981384084d5de477813bf9d958e4805a76ff0f6008c1eb4a3b127a96abee, 4, 4, 7, 0, 4, 268);
        _parite(0xb711d32e79a26668135e088a66b12e421cbe6b55f6a929dd9e49896f952ccac8, 0, 5, 3, 2, 0, 332);
        _parite(0x494a1264ca7b526bafe16d03fdb088252af07d5ece0f3e9a5e02cdef14e9968c, 0, 4, 5, 7, 2, 360);
        _parite(0x0000000000000000000000000000000000000000000000000000000000000000, 1, 2, 7, 6, 0, 78);
    }

    /* ------------------------------------------------------------ aucun retrait */

    function test_AucunRetrait() public {
        _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        address[3] memory qui = [GARDIEN, DEV, POOL];
        for (uint256 i = 0; i < 3; i++) {
            vm.startPrank(qui[i]);
            (bool ok,) = address(bd).call(abi.encodeWithSignature("withdraw(uint256)", 1));
            assertFalse(ok);
            (ok,) = address(bd).call(abi.encodeWithSignature("sweep(address)", qui[i]));
            assertFalse(ok);
            (ok,) = address(bd).call(abi.encodeWithSignature("setFees(uint256,uint256)", 0, 0));
            assertFalse(ok);
            vm.stopPrank();
        }
        assertEq(usdc.balanceOf(address(bd)), MISE);
    }
}

/// @dev le hook 7030 tel que BlockRolls le lit (seulement pour construire un BlockRolls de comparaison)
contract HookStubD {
    function createurs(bytes32) external pure returns (address, uint256) { return (address(0x1), 0); }
}
