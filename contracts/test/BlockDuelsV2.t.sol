// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/BlockDuelsV2.sol";
import "../src/BlockDuels.sol";
import "../src/BlockRolls.sol";
import {V2Jeton, V2JetonSansBool, V2JetonAFrais, V2JetonHostile, V2HookStub} from "./DuelsV2Jetons.sol";

/* BlockDuelsV2 (decision de Phil, 2026-10-24) : la suite de BlockDuels (v1) reprise telle quelle sur v2 -- sauf ce que la regle v2 change
 * (un duel rejoint non regle dans sa fenetre : GAGNE PAR DEFAUT par le createur, jamais rembourse) -- plus les proprietes exigees :
 *   (1) aucune strategie de celui qui rejoint ne bat le reglement honnete (BlockDuelsV2EVTest, 2000 duels, deux strategies + temoins) ;
 *   (2) conservation : solde du contrat == mises vivantes + ce qui est du (BlockDuelsV2InvariantTest, invariant + gestionnaire) ;
 *   (3) egalite DANS la fenetre remboursee ; egalite NON reglee -> createur ; (4) aucun double reglement / remboursement ;
 *   (5) settleDefault avant cible + 257 revert ; settle apres cible + 256 revert ; (6) cancel : ouvert et createur seulement ;
 *   (7) un hash nul ne juge jamais. */
contract BlockDuelsV2Test is Test {
    V2Jeton usdc;
    V2Jeton action; /* une action tokenisee de test (18 decimales) */
    BlockDuelsV2 bd;
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
    event DefaultWon(uint256 indexed id, address indexed winner, uint256 payout);
    event TokenSet(address indexed token, bool ok);
    event Owed(address indexed token, address indexed to, uint256 amount);

    function setUp() public {
        vm.roll(1000);
        vm.warp(1_700_006_400);
        usdc = new V2Jeton(6);
        action = new V2Jeton(18);
        bd = new BlockDuelsV2(address(usdc), DEV, POOL, GARDIEN);
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
        V2Jeton(token).approve(address(bd), stake);
        id = bd.create(token, stake, g, EXP);
        vm.stopPrank();
    }

    function _join(address who, uint256 id, uint8[5] memory g) internal {
        (,,,,,,, address token, uint96 stake) = bd.duels(id);
        vm.startPrank(who);
        V2Jeton(token).approve(address(bd), stake);
        bd.join(id, g);
        vm.stopPrank();
    }

    function _joinRefuse(address who, uint256 id, uint8[5] memory g, bytes4 err) internal {
        (,,,,,,, address token, uint96 stake) = bd.duels(id);
        if (token == address(0)) token = address(usdc);
        vm.startPrank(who);
        V2Jeton(token).approve(address(bd), stake == 0 ? MISE : stake);
        vm.expectRevert(err);
        bd.join(id, g);
        vm.stopPrank();
    }

    function _target(uint256 id) internal view returns (uint256 t) {
        (,,,,, uint40 tb,,,) = bd.duels(id);
        t = tb;
    }

    function _status(uint256 id) internal view returns (BlockDuelsV2.Status s) {
        (,, s,,,,,,) = bd.duels(id);
    }

    function _revele(uint256 id, bytes32 h) internal {
        uint256 t = _target(id);
        vm.roll(t + 1);
        vm.setBlockhash(t, h);
    }

    function _duel(address token, uint256 stake, bytes32 h, uint8 kA, uint8 kB) internal returns (uint256 id) {
        uint8[5] memory face = bd.faceOf(h);
        id = _create(A, token, stake, _guessScore(face, kA));
        _join(B, id, _guessScore(face, kB));
        _revele(id, h);
    }

    /* ============================================================ v1 repris : configuration, jetons, create, cancel, join */

    function test_ConfigImmuable() public view {
        assertEq(bd.USDC(), address(usdc));
        assertEq(bd.DEV_WALLET(), DEV);
        assertEq(bd.REWARD_POOL(), POOL);
        assertEq(bd.GUARDIAN(), GARDIEN);
        assertTrue(bd.tokenOk(address(usdc)), "USDC admis a la construction");
        assertFalse(bd.tokenOk(address(action)));
        assertEq(bd.nextId(), 1, "les ids commencent a 1");
        assertEq(bd.WINNER_BPS(), 9_000);
        assertEq(bd.POOL_BPS(), 700);
        assertEq(bd.MIN_STAKE(), 100_000);
        assertEq(bd.MAX_STAKE(), type(uint96).max);
        assertEq(bd.MIN_EXPIRY(), 600);
        assertEq(bd.MAX_EXPIRY(), 7 days);
        assertEq(bd.SETTLE_WINDOW(), 256);
        assertEq(bd.TARGET_DELAY(), 2);
    }

    function test_ConfigRefusee() public {
        vm.expectRevert(BlockDuelsV2.BadConfig.selector);
        new BlockDuelsV2(address(0), DEV, POOL, GARDIEN);
        vm.expectRevert(BlockDuelsV2.BadConfig.selector);
        new BlockDuelsV2(address(0x1234), DEV, POOL, GARDIEN); /* usdc sans code */
        vm.expectRevert(BlockDuelsV2.BadConfig.selector);
        new BlockDuelsV2(address(usdc), address(0), POOL, GARDIEN);
        vm.expectRevert(BlockDuelsV2.BadConfig.selector);
        new BlockDuelsV2(address(usdc), DEV, address(0), GARDIEN);
        vm.expectRevert(BlockDuelsV2.BadConfig.selector);
        new BlockDuelsV2(address(usdc), DEV, POOL, address(0));
    }

    function test_SetTokenSeulLeGardien() public {
        vm.prank(A);
        vm.expectRevert(BlockDuelsV2.NotGuardian.selector);
        bd.setToken(address(action), true);
        vm.prank(DEV);
        vm.expectRevert(BlockDuelsV2.NotGuardian.selector);
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
        vm.expectRevert(BlockDuelsV2.BadToken.selector);
        bd.setToken(address(usdc), false);
        vm.expectRevert(BlockDuelsV2.BadToken.selector);
        bd.setToken(address(0), true);
        vm.expectRevert(BlockDuelsV2.BadToken.selector);
        bd.setToken(address(0xBEEF), true);
        bd.setToken(address(0xBEEF), false);
        vm.stopPrank();
        assertTrue(bd.tokenOk(address(usdc)));
    }

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
        (address cr, uint64 exp, BlockDuelsV2.Status s,, address jo, uint40 tb,, address tok, uint96 st) = bd.duels(id);
        assertEq(cr, A);
        assertEq(exp, uint64(block.timestamp) + EXP);
        assertEq(uint256(s), uint256(BlockDuelsV2.Status.Open));
        assertEq(jo, address(0));
        assertEq(tb, 0);
        assertEq(tok, address(usdc));
        assertEq(st, MISE);
        (uint8[5] memory ga,) = bd.guessesOf(id);
        assertEq(abi.encode(ga), abi.encode(g));
    }

    function test_CreateBornesDeMise() public {
        vm.startPrank(A);
        usdc.approve(address(bd), type(uint256).max);
        vm.expectRevert(BlockDuelsV2.BadStake.selector);
        bd.create(address(usdc), 0, _g(0, 0, 0, 0, 0), EXP);
        vm.expectRevert(BlockDuelsV2.BadStake.selector);
        bd.create(address(usdc), 99_999, _g(0, 0, 0, 0, 0), EXP);
        bd.create(address(usdc), 100_000, _g(0, 0, 0, 0, 0), EXP);
        vm.expectRevert(BlockDuelsV2.BadStake.selector);
        bd.create(address(usdc), uint256(type(uint96).max) + 1, _g(0, 0, 0, 0, 0), EXP);
        vm.stopPrank();
    }

    function test_CreateBornesDExpiration() public {
        vm.startPrank(A);
        usdc.approve(address(bd), type(uint256).max);
        vm.expectRevert(BlockDuelsV2.BadExpiry.selector);
        bd.create(address(usdc), MISE, _g(0, 0, 0, 0, 0), 599);
        vm.expectRevert(BlockDuelsV2.BadExpiry.selector);
        bd.create(address(usdc), MISE, _g(0, 0, 0, 0, 0), 7 days + 1);
        vm.expectRevert(BlockDuelsV2.BadExpiry.selector);
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
            vm.expectRevert(BlockDuelsV2.BadGuess.selector);
            bd.create(address(usdc), MISE, g, EXP);
            g[i] = n[i] - 1;
            bd.create(address(usdc), MISE, g, EXP);
        }
        vm.stopPrank();
    }

    function test_CreateJetonNonAdmis() public {
        vm.startPrank(A);
        action.approve(address(bd), 1 ether);
        vm.expectRevert(BlockDuelsV2.TokenNotAdmitted.selector);
        bd.create(address(action), 1 ether, _g(0, 0, 0, 0, 0), EXP);
        vm.stopPrank();
    }

    function test_CreateApprobationInsuffisante() public {
        vm.startPrank(A);
        usdc.approve(address(bd), MISE - 1);
        vm.expectRevert(BlockDuelsV2.TransferFailed.selector);
        bd.create(address(usdc), MISE, _g(0, 0, 0, 0, 0), EXP);
        vm.stopPrank();
        assertEq(bd.nextId(), 1);
    }

    function test_JetonQuiRendFauxRefuse() public {
        vm.startPrank(A);
        usdc.approve(address(bd), MISE);
        usdc.setFaux(true);
        vm.expectRevert(BlockDuelsV2.TransferFailed.selector);
        bd.create(address(usdc), MISE, _g(0, 0, 0, 0, 0), EXP);
        vm.stopPrank();
    }

    function test_JetonAFraisRefuse() public {
        V2JetonAFrais f = new V2JetonAFrais();
        f.mint(A, 100 ether);
        vm.prank(GARDIEN);
        bd.setToken(address(f), true);
        vm.startPrank(A);
        f.approve(address(bd), 1 ether);
        vm.expectRevert(BlockDuelsV2.NotExact.selector);
        bd.create(address(f), 1 ether, _g(0, 0, 0, 0, 0), EXP);
        vm.stopPrank();
    }

    /// @dev (6) cancel : seulement un duel OUVERT, seulement par son createur
    function test_CancelRendTout() public {
        uint256 a0 = usdc.balanceOf(A);
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        vm.prank(B);
        vm.expectRevert(BlockDuelsV2.NotCreator.selector);
        bd.cancel(id);
        vm.prank(TIERS);
        vm.expectRevert(BlockDuelsV2.NotCreator.selector);
        bd.cancel(id);
        vm.expectEmit(true, false, false, true);
        emit Cancelled(id);
        vm.prank(A);
        bd.cancel(id);
        assertEq(usdc.balanceOf(A), a0);
        assertEq(usdc.balanceOf(address(bd)), 0);
        assertEq(uint256(_status(id)), uint256(BlockDuelsV2.Status.Cancelled));
        vm.prank(A);
        vm.expectRevert(BlockDuelsV2.NotOpen.selector);
        bd.cancel(id);
        _joinRefuse(B, id, _g(0, 0, 0, 0, 0), BlockDuelsV2.NotOpen.selector);
    }

    function test_CancelApresJoinRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        vm.prank(A);
        vm.expectRevert(BlockDuelsV2.NotOpen.selector);
        bd.cancel(id);
        /* apres la fenetre non plus : le createur gagne par defaut, il ne reprend pas « sa » mise seule */
        vm.roll(_target(id) + 300);
        vm.prank(A);
        vm.expectRevert(BlockDuelsV2.NotOpen.selector);
        bd.cancel(id);
    }

    function test_CancelApresExpirationAdmis() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        vm.warp(block.timestamp + EXP + 10);
        vm.prank(A);
        bd.cancel(id);
        assertEq(usdc.balanceOf(address(bd)), 0);
    }

    function test_CancelApresDefautOuReglementRefuse() public {
        uint256 id = _duel(address(usdc), MISE, keccak256("c1"), 1, 2);
        bd.settle(id);
        vm.prank(A);
        vm.expectRevert(BlockDuelsV2.NotOpen.selector);
        bd.cancel(id);
        uint256 id2 = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id2, _g(1, 1, 1, 1, 1));
        vm.roll(_target(id2) + 257);
        bd.settleDefault(id2);
        vm.prank(A);
        vm.expectRevert(BlockDuelsV2.NotOpen.selector);
        bd.cancel(id2);
    }

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
        assertEq(uint256(_status(id)), uint256(BlockDuelsV2.Status.Joined));
        (, uint8[5] memory gb) = bd.guessesOf(id);
        assertEq(abi.encode(gb), abi.encode(g));
        assertEq(bd.settleableUntil(id), block.number + 2 + 256);
    }

    function test_JoinSonPropreDuelRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        vm.startPrank(A);
        usdc.approve(address(bd), MISE);
        vm.expectRevert(BlockDuelsV2.OwnDuel.selector);
        bd.join(id, _g(1, 1, 1, 1, 1));
        vm.stopPrank();
    }

    function test_JoinApresExpirationRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        (, uint64 exp,,,,,,,) = bd.duels(id);
        vm.warp(exp);
        vm.startPrank(B);
        usdc.approve(address(bd), MISE);
        vm.expectRevert(BlockDuelsV2.Expired.selector);
        bd.join(id, _g(1, 1, 1, 1, 1));
        vm.warp(exp - 1);
        bd.join(id, _g(1, 1, 1, 1, 1));
        vm.stopPrank();
    }

    function test_JoinDeuxFoisRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        _joinRefuse(TIERS, id, _g(2, 2, 2, 2, 2), BlockDuelsV2.NotOpen.selector);
        _joinRefuse(B, 42, _g(2, 2, 2, 2, 2), BlockDuelsV2.NotOpen.selector);
    }

    function test_JoinGuessHorsBornes() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        vm.startPrank(B);
        usdc.approve(address(bd), MISE);
        vm.expectRevert(BlockDuelsV2.BadGuess.selector);
        bd.join(id, _g(0, 0, 19, 0, 0));
        vm.stopPrank();
    }

    /* ============================================================ settle DANS la fenetre : le vrai resultat (comme v1) */

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
        assertEq(usdc.balanceOf(A) - a0, 9_000_000);
        assertEq(usdc.balanceOf(B), b0);
        assertEq(usdc.balanceOf(POOL), 700_000);
        assertEq(usdc.balanceOf(DEV), 300_000);
        assertEq(usdc.balanceOf(address(bd)), 0);
        assertEq(usdc.balanceOf(TIERS), 1_000_000_000_000, "l appelant ne touche rien");
        assertEq(uint256(_status(id)), uint256(BlockDuelsV2.Status.Settled));
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

    /// @dev (3) une egalite reglee DANS la fenetre rembourse les deux, sans frais
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
        assertEq(usdc.balanceOf(A) - a0, MISE);
        assertEq(usdc.balanceOf(B) - b0, MISE);
        assertEq(usdc.balanceOf(POOL), 0);
        assertEq(usdc.balanceOf(DEV), 0);
        assertEq(usdc.balanceOf(address(bd)), 0);
    }

    function test_SettleEgaliteAZero() public {
        uint256 id = _duel(address(usdc), MISE, keccak256("zero zero"), 0, 0);
        (address w,) = bd.settle(id);
        assertEq(w, address(0));
        assertEq(usdc.balanceOf(DEV), 0);
    }

    function test_PoussiereDArrondiAuDev() public {
        (uint256 w, uint256 p, uint256 d) = bd.splitOf(100_001);
        assertEq(w, 180_001);
        assertEq(p, 14_000);
        assertEq(d, 6_001);
        assertEq(w + p + d, 200_002);
        uint256 id = _duel(address(usdc), 100_001, keccak256("poussiere"), 1, 0);
        bd.settle(id);
        assertEq(usdc.balanceOf(DEV), 6_001);
        assertEq(usdc.balanceOf(POOL), 14_000);
        assertEq(usdc.balanceOf(address(bd)), 0);
    }

    function testFuzz_PartageSommeExacte(uint256 stake) public view {
        stake = bound(stake, bd.MIN_STAKE(), bd.MAX_STAKE());
        (uint256 w, uint256 p, uint256 d) = bd.splitOf(stake);
        assertEq(w + p + d, 2 * stake);
        assertEq(w, (2 * stake * 9000) / 10000);
        assertEq(p, (2 * stake * 700) / 10000);
        assertGe(d, (2 * stake * 300) / 10000);
        assertLe(d, (2 * stake * 300) / 10000 + 2);
    }

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
        assertEq(usdc.balanceOf(address(bd)), 0);
        assertEq(usdc.balanceOf(A) + usdc.balanceOf(B) + usdc.balanceOf(POOL) + usdc.balanceOf(DEV), total0);
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

    /* ============================================================ (5) la fenetre : settle <= cible + 256 < settleDefault */

    function test_SettleTropTot() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        vm.expectRevert(BlockDuelsV2.TooEarly.selector);
        bd.settle(id);
        vm.roll(_target(id));
        vm.expectRevert(BlockDuelsV2.TooEarly.selector);
        bd.settle(id);
    }

    function test_SettleDernierBlocDeLaFenetre() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        uint256 t = _target(id);
        vm.roll(t + 256);
        vm.setBlockhash(t, keccak256("dernier"));
        vm.expectRevert(BlockDuelsV2.WindowOpen.selector);
        bd.settleDefault(id); /* au dernier bloc reglable : pas de defaut */
        bd.settle(id);
        assertEq(uint256(_status(id)), uint256(BlockDuelsV2.Status.Settled));
    }

    /// @dev settle (le vrai resultat) apres cible + 256 : TooLate, MEME si un hash etait lisible (le gagnant ne choisit pas apres coup)
    function test_SettleHorsFenetreRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        uint256 t = _target(id);
        vm.roll(t + 257);
        vm.expectRevert(BlockDuelsV2.TooLate.selector);
        bd.settle(id);
        vm.roll(t + 10_000);
        vm.expectRevert(BlockDuelsV2.TooLate.selector);
        bd.settle(id);
    }

    /// @dev settleDefault avant cible + 257 : WindowOpen a CHAQUE bloc depuis le join
    function test_DefautAvantFinDeFenetreRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        uint256 t = _target(id);
        for (uint256 b = block.number; b <= t + 256; b++) {
            vm.roll(b);
            vm.expectRevert(BlockDuelsV2.WindowOpen.selector);
            bd.settleDefault(id);
        }
        vm.roll(t + 257);
        bd.settleDefault(id);
        assertEq(uint256(_status(id)), uint256(BlockDuelsV2.Status.Defaulted));
    }

    /// @dev pour TOUT decalage k depuis la cible : exactement UNE des deux portes est ouverte (aucune pour k <= 0)
    function testFuzz_UneSeulePorte(uint256 k) public {
        k = bound(k, 0, 5000);
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        uint256 t = _target(id);
        vm.roll(t + k);
        if (k >= 1 && k <= 256) vm.setBlockhash(t, keccak256(abi.encode("porte", k)));
        uint256 snap = vm.snapshotState();
        (bool okS,) = address(bd).call(abi.encodeWithSelector(BlockDuelsV2.settle.selector, id));
        vm.revertToState(snap);
        (bool okD,) = address(bd).call(abi.encodeWithSelector(BlockDuelsV2.settleDefault.selector, id));
        assertEq(okS, k >= 1 && k <= 256, "settle : seulement cible < bloc <= cible + 256");
        assertEq(okD, k >= 257, "settleDefault : seulement bloc > cible + 256");
        assertFalse(okS && okD);
    }

    /// @dev (7) un hash nul ne juge jamais : settle le refuse dans la fenetre ; apres, le defaut ne lit aucun hash
    function test_SettleHashNulRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        _revele(id, bytes32(0));
        vm.expectRevert(BlockDuelsV2.HashUnavailable.selector);
        bd.settle(id);
        assertEq(uint256(_status(id)), uint256(BlockDuelsV2.Status.Joined), "rien n est juge");
        assertEq(usdc.balanceOf(address(bd)), 2 * MISE);
    }

    /* ============================================================ v2 : le defaut au createur */

    function test_DefautPaieCommeUneVictoireDuCreateur() public {
        /* B a la face PARFAITE : il aurait gagne. Il ne regle pas : le createur gagne par defaut. */
        bytes32 h = keccak256("B aurait gagne");
        uint256 id = _duel(address(usdc), MISE, h, 0, 5);
        uint256 a0 = usdc.balanceOf(A);
        uint256 b0 = usdc.balanceOf(B);
        vm.roll(_target(id) + 257);
        vm.expectEmit(true, true, false, true);
        emit DefaultWon(id, A, 9_000_000);
        vm.prank(TIERS);
        (address w, uint256 p) = bd.settleDefault(id);
        assertEq(w, A);
        assertEq(p, 9_000_000);
        assertEq(usdc.balanceOf(A) - a0, 9_000_000, "90 % au createur");
        assertEq(usdc.balanceOf(B), b0, "celui qui rejoint ne recoit rien");
        assertEq(usdc.balanceOf(POOL), 700_000, "7 % au pot commun");
        assertEq(usdc.balanceOf(DEV), 300_000, "3 % au dev");
        assertEq(usdc.balanceOf(TIERS), 1_000_000_000_000, "l appelant ne touche rien");
        assertEq(usdc.balanceOf(address(bd)), 0);
        assertEq(uint256(_status(id)), uint256(BlockDuelsV2.Status.Defaulted));
        assertEq(bd.settleableUntil(id), 0);
    }

    /// @dev (3) une egalite NON reglee dans la fenetre va au createur (par defaut), avec les frais d une victoire
    function test_EgaliteNonRegleeVaAuCreateur() public {
        uint256 id = _duel(address(usdc), MISE, keccak256("egalite oubliee"), 2, 2);
        uint256 a0 = usdc.balanceOf(A);
        vm.roll(_target(id) + 257);
        (address w, uint256 p) = bd.settleDefault(id);
        assertEq(w, A);
        assertEq(usdc.balanceOf(A) - a0, p);
        assertEq(p, 9_000_000);
        assertEq(usdc.balanceOf(POOL) + usdc.balanceOf(DEV), 1_000_000);
    }

    function test_DefautPoussiereCommeV1() public {
        uint256 id = _create(A, address(usdc), 100_001, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        vm.roll(_target(id) + 257);
        (, uint256 p) = bd.settleDefault(id);
        assertEq(p, 180_001);
        assertEq(usdc.balanceOf(POOL), 14_000);
        assertEq(usdc.balanceOf(DEV), 6_001);
        assertEq(usdc.balanceOf(address(bd)), 0);
    }

    /// @dev pour TOUTE mise et TOUTE paire de guess : le defaut paie EXACTEMENT splitOf au createur, au pot commun, au dev
    function testFuzz_DefautCommeVictoireCreateur(uint8[5] memory ga, uint8[5] memory gb, uint256 stake, uint256 retard) public {
        uint8[5] memory n = [uint8(6), 10, 19, 9, 8];
        for (uint256 i = 0; i < 5; i++) { ga[i] = uint8(ga[i] % n[i]); gb[i] = uint8(gb[i] % n[i]); }
        stake = bound(stake, 100_000, 1_000_000_000_000 / 2);
        retard = bound(retard, 257, 1_000_000);
        uint256 id = _create(A, address(usdc), stake, ga);
        _join(B, id, gb);
        vm.roll(_target(id) + retard);
        uint256 a0 = usdc.balanceOf(A);
        uint256 b0 = usdc.balanceOf(B);
        (address w, uint256 p) = bd.settleDefault(id);
        (uint256 tw, uint256 tp, uint256 td) = bd.splitOf(stake);
        assertEq(w, A);
        assertEq(p, tw);
        assertEq(usdc.balanceOf(A) - a0, tw);
        assertEq(usdc.balanceOf(B), b0);
        assertEq(usdc.balanceOf(POOL), tp);
        assertEq(usdc.balanceOf(DEV), td);
        assertEq(usdc.balanceOf(address(bd)), 0);
    }

    /* ============================================================ (4) aucun double reglement, aucun double remboursement */

    function test_SettleDeuxFoisRefuse() public {
        uint256 id = _duel(address(usdc), MISE, keccak256("deux fois"), 5, 0);
        bd.settle(id);
        uint256 p0 = usdc.balanceOf(POOL);
        vm.expectRevert(BlockDuelsV2.NotJoined.selector);
        bd.settle(id);
        vm.expectRevert(BlockDuelsV2.NotRefundable.selector);
        bd.refundExpired(id);
        vm.roll(_target(id) + 257);
        vm.expectRevert(BlockDuelsV2.NotJoined.selector);
        bd.settleDefault(id); /* un duel regle ne se gagne pas une 2e fois par defaut */
        assertEq(usdc.balanceOf(POOL), p0);
    }

    function test_EgaliteRegleePuisDefautRefuse() public {
        uint256 id = _duel(address(usdc), MISE, keccak256("egalite puis defaut"), 1, 1);
        bd.settle(id);
        vm.roll(_target(id) + 257);
        vm.expectRevert(BlockDuelsV2.NotJoined.selector);
        bd.settleDefault(id);
        vm.expectRevert(BlockDuelsV2.NotRefundable.selector);
        bd.refundExpired(id);
        assertEq(usdc.balanceOf(address(bd)), 0);
    }

    function test_DefautDeuxFoisRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        vm.roll(_target(id) + 257);
        bd.settleDefault(id);
        uint256 a1 = usdc.balanceOf(A);
        vm.expectRevert(BlockDuelsV2.NotJoined.selector);
        bd.settleDefault(id);
        vm.expectRevert(BlockDuelsV2.NotJoined.selector);
        bd.settle(id);
        vm.expectRevert(BlockDuelsV2.NotRefundable.selector);
        bd.refundExpired(id);
        assertEq(usdc.balanceOf(A), a1);
    }

    function test_SettleSansJoinRefuse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        vm.expectRevert(BlockDuelsV2.NotJoined.selector);
        bd.settle(id);
        vm.expectRevert(BlockDuelsV2.NotJoined.selector);
        bd.settle(77);
        vm.warp(block.timestamp + 8 days);
        vm.roll(block.number + 1000);
        vm.expectRevert(BlockDuelsV2.NotJoined.selector);
        bd.settleDefault(id); /* un duel ouvert n a pas de « createur gagnant » : refundExpired */
        vm.expectRevert(BlockDuelsV2.NotJoined.selector);
        bd.settleDefault(77);
        vm.prank(A);
        bd.cancel(id);
        vm.expectRevert(BlockDuelsV2.NotJoined.selector);
        bd.settleDefault(id);
    }

    /* ============================================================ refundExpired : seulement un duel jamais rejoint */

    /// @dev v2 : un duel REJOINT ne se rembourse JAMAIS (ni dans la fenetre, ni apres)
    function test_RejointJamaisRembourse() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        uint256 t = _target(id);
        uint256[4] memory quand = [block.number, t + 1, t + 256, t + 257];
        for (uint256 i = 0; i < 4; i++) {
            vm.roll(quand[i]);
            vm.expectRevert(BlockDuelsV2.NotRefundable.selector);
            bd.refundExpired(id);
        }
        vm.roll(t + 100_000);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(BlockDuelsV2.NotRefundable.selector);
        bd.refundExpired(id);
        assertEq(usdc.balanceOf(address(bd)), 2 * MISE);
    }

    function test_RemboursementJamaisRejoint() public {
        uint256 a0 = usdc.balanceOf(A);
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        (, uint64 exp,,,,,,,) = bd.duels(id);
        vm.warp(exp - 1);
        vm.expectRevert(BlockDuelsV2.NotRefundable.selector);
        bd.refundExpired(id);
        vm.warp(exp);
        vm.expectEmit(true, false, false, true);
        emit Refunded(id, MISE, 0);
        vm.prank(TIERS);
        bd.refundExpired(id);
        assertEq(usdc.balanceOf(A), a0);
        assertEq(uint256(_status(id)), uint256(BlockDuelsV2.Status.Refunded));
        _joinRefuse(B, id, _g(1, 1, 1, 1, 1), BlockDuelsV2.NotOpen.selector);
        vm.expectRevert(BlockDuelsV2.NotRefundable.selector);
        bd.refundExpired(id); /* deux fois : refuse */
    }

    function test_RemboursementRefuseSiInexistantOuAnnule() public {
        vm.expectRevert(BlockDuelsV2.NotRefundable.selector);
        bd.refundExpired(9);
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        vm.prank(A);
        bd.cancel(id);
        vm.warp(block.timestamp + 8 days);
        vm.expectRevert(BlockDuelsV2.NotRefundable.selector);
        bd.refundExpired(id);
    }

    /* ============================================================ jetons : action tokenisee, sans bool, retire, liste noire */

    function test_DuelEnActionTokenisee() public {
        vm.prank(GARDIEN);
        bd.setToken(address(action), true);
        uint256 id = _duel(address(action), 2 ether, keccak256("action"), 2, 1);
        bd.settle(id);
        assertEq(action.balanceOf(POOL), 0.28 ether);
        assertEq(action.balanceOf(DEV), 0.12 ether);
        assertEq(action.balanceOf(address(bd)), 0);
        assertEq(usdc.balanceOf(POOL), 0);
        /* et le defaut, dans le MEME jeton que la mise */
        uint256 id2 = _create(A, address(action), 1 ether, _g(0, 0, 0, 0, 0));
        _join(B, id2, _g(1, 1, 1, 1, 1));
        vm.roll(_target(id2) + 257);
        (, uint256 p) = bd.settleDefault(id2);
        assertEq(p, 1.8 ether);
        assertEq(action.balanceOf(POOL), 0.28 ether + 0.14 ether);
        assertEq(action.balanceOf(address(bd)), 0);
        assertEq(usdc.balanceOf(POOL), 0, "aucun USDC ne bouge");
    }

    function test_JetonSansBool() public {
        V2JetonSansBool t = new V2JetonSansBool();
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
        uint256 id = _duel(address(action), 1 ether, keccak256("retire"), 5, 4);
        uint256 ouvert = _create(A, address(action), 1 ether, _g(0, 0, 0, 0, 0));
        uint256 rejoint = _create(A, address(action), 1 ether, _g(0, 0, 0, 0, 0));
        _join(B, rejoint, _g(1, 1, 1, 1, 1));
        vm.prank(GARDIEN);
        bd.setToken(address(action), false);
        vm.startPrank(A);
        action.approve(address(bd), 1 ether);
        vm.expectRevert(BlockDuelsV2.TokenNotAdmitted.selector);
        bd.create(address(action), 1 ether, _g(0, 0, 0, 0, 0), EXP);
        vm.stopPrank();
        _joinRefuse(B, ouvert, _g(1, 1, 1, 1, 1), BlockDuelsV2.TokenNotAdmitted.selector);
        (address w,) = bd.settle(id);
        assertEq(w, A);
        vm.prank(A);
        bd.cancel(ouvert);
        vm.roll(_target(rejoint) + 257);
        bd.settleDefault(rejoint); /* v2 : le defaut passe aussi sur un jeton retire */
        assertEq(action.balanceOf(address(bd)), 0, "aucun fonds bloque par le retrait du jeton");
    }

    function test_GagnantSurListeNoireNeBloquePasLesAutres() public {
        uint256 id = _duel(address(usdc), MISE, keccak256("liste noire"), 5, 0);
        usdc.setNoire(A, true);
        vm.expectEmit(true, true, false, true);
        emit Owed(address(usdc), A, 9_000_000);
        (address w, uint256 p) = bd.settle(id);
        assertEq(w, A);
        assertEq(p, 9_000_000);
        assertEq(usdc.balanceOf(POOL), 700_000);
        assertEq(usdc.balanceOf(DEV), 300_000);
        assertEq(bd.owed(address(usdc), A), 9_000_000);
        assertEq(usdc.balanceOf(address(bd)), 9_000_000);
        vm.prank(B);
        vm.expectRevert(BlockDuelsV2.NothingOwed.selector);
        bd.claim(address(usdc), B);
        vm.prank(A);
        vm.expectRevert(BlockDuelsV2.TransferFailed.selector);
        bd.claim(address(usdc), A);
        address neuve = address(0xA12);
        vm.prank(A);
        bd.claim(address(usdc), neuve);
        assertEq(usdc.balanceOf(neuve), 9_000_000);
        assertEq(bd.owed(address(usdc), A), 0);
        assertEq(usdc.balanceOf(address(bd)), 0);
    }

    /// @dev v2 : un createur sur liste noire gagne par defaut quand meme ; son gain reste DU, le pot commun et le dev sont payes
    function test_DefautVersCreateurSurListeNoire() public {
        uint256 id = _create(A, address(usdc), MISE, _g(0, 0, 0, 0, 0));
        _join(B, id, _g(1, 1, 1, 1, 1));
        usdc.setNoire(A, true);
        vm.roll(_target(id) + 257);
        bd.settleDefault(id);
        assertEq(bd.owed(address(usdc), A), 9_000_000);
        assertEq(usdc.balanceOf(POOL), 700_000);
        assertEq(usdc.balanceOf(DEV), 300_000);
        assertEq(usdc.balanceOf(address(bd)), 9_000_000, "solde = ce qui est du");
    }

    /* ============================================================ reentree */

    function _dueldHostile() internal returns (V2JetonHostile hu, BlockDuelsV2 b2, uint256 a, uint256 b, bytes32 h) {
        hu = new V2JetonHostile();
        b2 = new BlockDuelsV2(address(hu), DEV, POOL, GARDIEN);
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
        (V2JetonHostile hu, BlockDuelsV2 b2, uint256 a, uint256 b,) = _dueldHostile();
        hu.armer(address(b2), abi.encodeWithSelector(BlockDuelsV2.settle.selector, b));
        b2.settle(a);
        assertGt(hu.tentatives(), 0);
        assertFalse(hu.reentreeReussie());
        assertEq(hu.erreurVue(), BlockDuelsV2.Reentrancy.selector);
        (,, BlockDuelsV2.Status sb,,,,,,) = b2.duels(b);
        assertEq(uint256(sb), uint256(BlockDuelsV2.Status.Joined));
        assertEq(hu.balanceOf(A), 100_000_000 - 2 * MISE + 9_000_000);
        assertEq(hu.balanceOf(address(b2)), 2 * MISE);
    }

    function test_ReentreeDefautRefusee() public {
        (V2JetonHostile hu, BlockDuelsV2 b2, uint256 a, uint256 b,) = _dueldHostile();
        vm.roll(block.number + 300);
        /* pendant le paiement du defaut de a, tenter le defaut de b (meme verrou) */
        hu.armer(address(b2), abi.encodeWithSelector(BlockDuelsV2.settleDefault.selector, b));
        b2.settleDefault(a);
        assertGt(hu.tentatives(), 0);
        assertFalse(hu.reentreeReussie());
        assertEq(hu.erreurVue(), BlockDuelsV2.Reentrancy.selector);
        (,, BlockDuelsV2.Status sb,,,,,,) = b2.duels(b);
        assertEq(uint256(sb), uint256(BlockDuelsV2.Status.Joined));
        assertEq(hu.balanceOf(address(b2)), 2 * MISE);
        /* et un defaut qui tente de re-entrer dans lui-meme : un seul paiement */
        hu.armer(address(b2), abi.encodeWithSelector(BlockDuelsV2.settleDefault.selector, b));
        b2.settleDefault(b);
        assertEq(hu.balanceOf(address(b2)), 0);
        assertEq(hu.balanceOf(A), 100_000_000 - 2 * MISE + 2 * 9_000_000);
    }

    function test_ReentreeRefundEtCancelRefusees() public {
        (V2JetonHostile hu, BlockDuelsV2 b2, uint256 a,,) = _dueldHostile();
        vm.prank(A);
        uint256 c = b2.create(address(hu), MISE, _g(0, 0, 0, 0, 0), EXP);
        vm.prank(A);
        uint256 d = b2.create(address(hu), MISE, _g(0, 0, 0, 0, 0), EXP);
        vm.warp(block.timestamp + EXP + 1);
        hu.armer(address(b2), abi.encodeWithSelector(BlockDuelsV2.refundExpired.selector, d));
        b2.settle(a);
        assertFalse(hu.reentreeReussie());
        assertEq(hu.erreurVue(), BlockDuelsV2.Reentrancy.selector);
        hu.armer(address(b2), abi.encodeWithSelector(BlockDuelsV2.cancel.selector, d));
        vm.prank(A);
        b2.cancel(c);
        assertFalse(hu.reentreeReussie());
        /* l erreur vue pendant le cancel est celle du VERROU (sans lui : NotCreator, le jeton n est pas le createur) */
        assertEq(hu.erreurVue(), BlockDuelsV2.Reentrancy.selector);
        (,, BlockDuelsV2.Status sd,,,,,,) = b2.duels(d);
        assertEq(uint256(sd), uint256(BlockDuelsV2.Status.Open));
    }

    /* ============================================================ la face : parite avec BlockRolls et v1 */

    function testFuzz_FaceIdentiqueABlockRollsEtV1(bytes32 h) public {
        BlockRolls br = new BlockRolls(BlockRolls.Config(address(usdc), DEV, address(new V2HookStub()), bytes32(uint256(1)), 500_000, 10_000_000, 30, 1 days, 5000, 5_000_000, 3_000_000, 1_000_000, 500_000, 2));
        BlockDuels v1 = new BlockDuels(address(usdc), DEV, POOL, GARDIEN);
        assertEq(abi.encode(bd.faceOf(h)), abi.encode(br.faceOf(h)));
        assertEq(abi.encode(bd.faceOf(h)), abi.encode(v1.faceOf(h)));
        assertEq(bd.hueOf(h), br.hueOf(h));
        (uint256 w1, uint256 p1, uint256 d1) = v1.splitOf(uint256(h) % (uint256(type(uint96).max) + 1));
        (uint256 w2, uint256 p2, uint256 d2) = bd.splitOf(uint256(h) % (uint256(type(uint96).max) + 1));
        assertEq(abi.encode(w1, p1, d1), abi.encode(w2, p2, d2), "meme partage que v1");
    }

    function _parite(bytes32 h, uint8 bande, uint8 orbite, uint8 facette, uint8 matiere, uint8 ornement, uint16 teinte) internal view {
        uint8[5] memory f = bd.faceOf(h);
        assertEq(f[0], bande);
        assertEq(f[1], orbite);
        assertEq(f[2], facette);
        assertEq(f[3], matiere);
        assertEq(f[4], ornement);
        assertEq(bd.hueOf(h), teinte);
    }

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

    /* ============================================================ aucun pouvoir au-dela de v1 */

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
            (ok,) = address(bd).call(abi.encodeWithSignature("pause()"));
            assertFalse(ok);
            (ok,) = address(bd).call(abi.encodeWithSignature("owner()"));
            assertFalse(ok);
            vm.stopPrank();
        }
        assertEq(usdc.balanceOf(address(bd)), MISE);
    }
}

/* ================================================================================================================================
 * (1) L ESPERANCE DE CELUI QUI REJOINT : rester silencieux quand il perd ne lui rapporte RIEN de plus que regler honnetement.
 *     Les MEMES 2000 duels (memes guess, memes hash, memes blocs) sont joues sur des contrats distincts, un par strategie :
 *       H  (honnete)          : celui qui rejoint regle TOUJOURS dans la fenetre ; le createur ne fait rien (hors ligne).
 *       S  (perdant muet)     : il regle s il gagne ou fait egalite, se tait s il perd -> settleDefault (par un tiers) apres la fenetre.
 *       O  (hors ligne)       : il ne regle jamais -> settleDefault apres la fenetre.
 *       C  (createur en ligne): comme S, mais le createur regle lui-meme quand il gagne.
 *       V1 (v1, perdant muet) : la strategie S sur le contrat v1 -- le temoin de l audit (attendu : joueur +, createur -).
 *     Exige, DUEL PAR DUEL : joueur(S) == joueur(H) ; createur(S) == createur(H) ; joueur(O) <= joueur(H) ; createur(O) >= createur(H) ;
 *     createur(C) == createur(S) (etre en ligne ne rapporte rien au createur, etre hors ligne ne lui coute rien).
 * ================================================================================================================================ */
contract BlockDuelsV2EVTest is Test {
    V2Jeton u;
    uint256 constant N = 2000;
    uint256 constant MISE = 1e6; /* 1 USDC */
    uint256 constant FONDS = 1e13;
    address constant DEV = address(0xDE);
    address constant POOL = address(0x70);
    address constant TIERS = address(0x7135);

    struct Jeu { address d; address A; address B; }

    function setUp() public { vm.roll(5000); vm.warp(1_800_000_000); u = new V2Jeton(6); }

    function g(uint256 s) internal pure returns (uint8[5] memory x) {
        bytes32 r = keccak256(abi.encode("v", s));
        x[0] = uint8(r[0]) % 6; x[1] = uint8(r[1]) % 10; x[2] = uint8(r[2]) % 19; x[3] = uint8(r[3]) % 9; x[4] = uint8(r[4]) % 8;
    }

    function _jeu(address d, uint160 k) internal returns (Jeu memory j) {
        j = Jeu(d, address(0xA000 + k), address(0xB000 + k));
        u.mint(j.A, FONDS); u.mint(j.B, FONDS);
        vm.prank(j.A); u.approve(d, type(uint256).max);
        vm.prank(j.B); u.approve(d, type(uint256).max);
    }

    function _ouvrir(Jeu memory j, uint256 i) internal returns (uint256 id) {
        vm.prank(j.A); id = BlockDuelsV2(j.d).create(address(u), MISE, g(1000 + i), 7 days); /* meme selecteur en v1 */
        vm.prank(j.B); BlockDuelsV2(j.d).join(id, g(9000 + i));
    }

    function _net(address w) internal view returns (int256) { return int256(u.balanceOf(w)) - int256(FONDS); }

    /* les 5 jeux (H, S, O, C, V1) en STOCKAGE : la pile de la boucle ne deborde pas */
    Jeu[5] J;
    BlockDuelsV2 ref;
    uint256 gagne; uint256 perdu; uint256 egal;

    function _tour(uint256 i) internal {
        int256[8] memory av;
        for (uint256 k = 0; k < 4; k++) { av[2 * k] = _net(J[k].A); av[2 * k + 1] = _net(J[k].B); }
        uint256[5] memory id;
        for (uint256 k = 0; k < 5; k++) id[k] = _ouvrir(J[k], i);
        uint256 t = block.number + 2;
        bytes32 h = keccak256(abi.encode("hh", i));
        vm.roll(t + 1); vm.setBlockhash(t, h);
        uint8[5] memory f = ref.faceOf(h);
        uint8 a = ref.scoreOf(g(1000 + i), f); uint8 b = ref.scoreOf(g(9000 + i), f);
        if (b > a) gagne++; else if (a > b) perdu++; else egal++;
        /* dans la fenetre */
        vm.prank(J[0].B); BlockDuelsV2(J[0].d).settle(id[0]);                              /* H : toujours */
        if (b >= a) { vm.prank(J[1].B); BlockDuelsV2(J[1].d).settle(id[1]); }              /* S : seulement s il gagne ou fait egalite */
        if (b >= a) { vm.prank(J[3].B); BlockDuelsV2(J[3].d).settle(id[3]); }              /* C : le joueur comme S... */
        else { vm.prank(J[3].A); BlockDuelsV2(J[3].d).settle(id[3]); }                     /*     ...et le createur regle ses victoires */
        if (b >= a) { vm.prank(J[4].B); BlockDuels(J[4].d).settle(id[4]); }                /* V1 : S sur v1 */
        /* apres la fenetre : un tiers declenche ce qui reste */
        vm.roll(t + 257);
        vm.startPrank(TIERS);
        if (a > b) { BlockDuelsV2(J[1].d).settleDefault(id[1]); BlockDuels(J[4].d).refundExpired(id[4]); }
        BlockDuelsV2(J[2].d).settleDefault(id[2]);                                          /* O : jamais regle */
        vm.stopPrank();
        vm.roll(block.number + 1);
        /* duel par duel */
        int256 jH = _net(J[0].B) - av[1]; int256 cH = _net(J[0].A) - av[0];
        assertEq(_net(J[1].B) - av[3], jH, "joueur : perdant muet == honnete, a CHAQUE duel");
        assertEq(_net(J[1].A) - av[2], cH, "createur : perdant muet == honnete, a CHAQUE duel");
        assertLe(_net(J[2].B) - av[5], jH, "joueur hors ligne : jamais mieux qu honnete");
        assertGe(_net(J[2].A) - av[4], cH, "createur hors ligne : jamais moins bien");
        assertEq(_net(J[3].A) - av[6], _net(J[1].A) - av[2], "createur en ligne == createur hors ligne (contre un joueur rationnel)");
    }

    function test_EV_JoueurSilencieuxNeGagneRien() public {
        vm.pauseGasMetering(); /* 2000 duels x 5 contrats depassent le plafond de gas d un test (2^30) : le gas ne se mesure pas ici */
        ref = new BlockDuelsV2(address(u), DEV, POOL, address(0x6A));
        for (uint160 k = 0; k < 4; k++) J[k] = _jeu(address(new BlockDuelsV2(address(u), DEV, POOL, address(0x6A))), k + 1);
        J[4] = _jeu(address(new BlockDuels(address(u), DEV, POOL, address(0x6A))), 5);
        for (uint256 i = 0; i < N; i++) _tour(i);
        for (uint256 k = 0; k < 4; k++) assertEq(u.balanceOf(J[k].d), 0, "rien ne reste dans un contrat v2");
        emit log_named_uint("duels", N);
        emit log_named_uint("joiner wins", gagne);
        emit log_named_uint("joiner losses", perdu);
        emit log_named_uint("ties", egal);
        emit log_named_int("v2 joiner net raw, always settle (H)", _net(J[0].B));
        emit log_named_int("v2 joiner net raw, silent when losing (S)", _net(J[1].B));
        emit log_named_int("v2 joiner net raw, never settles (O)", _net(J[2].B));
        emit log_named_int("v2 creator net raw, offline (H)", _net(J[0].A));
        emit log_named_int("v2 creator net raw, offline vs silent loser (S)", _net(J[1].A));
        emit log_named_int("v2 creator net raw, offline vs offline joiner (O)", _net(J[2].A));
        emit log_named_int("v2 creator net raw, online vs silent loser (C)", _net(J[3].A));
        emit log_named_int("v1 joiner net raw, silent when losing", _net(J[4].B));
        emit log_named_int("v1 creator net raw, offline", _net(J[4].A));
        assertEq(_net(J[1].B), _net(J[0].B));
        assertEq(_net(J[1].A), _net(J[0].A));
        assertGt(_net(J[4].B), _net(J[1].B), "le temoin v1 : la meme strategie y rapportait plus (l option gratuite)");
    }
}
/* ================================================================================================================================
 * (2) CONSERVATION, sous une suite d appels ALEATOIRES (create / join / cancel / settle / settleDefault / refundExpired / claim /
 *     liste noire / temps qui passe) : solde du contrat == somme des mises vivantes (ouvert : 1 mise, rejoint : 2) + tout ce qui est DU.
 *     Le compte « vivant » est tenu par le GESTIONNAIRE (fantome), pas relu sur le contrat : un double paiement le casserait.
 * ================================================================================================================================ */
contract GestionnaireV2 is Test {
    BlockDuelsV2 public bd;
    V2Jeton public u;
    address[4] public acteurs = [address(0xA1), address(0xB1), address(0xC1), address(0xD1)];
    address constant DEV = address(0xDE);
    address constant POOL = address(0x70);
    uint256[] public ids;
    mapping(uint256 => uint8) public fantome; /* 1 ouvert, 2 rejoint, 3 fini */
    mapping(uint256 => uint256) public miseDe;
    uint256 public vivant;
    uint256 public appels;
    uint256 public defauts;
    uint256 public reglements;
    bool public casse; /* une transition que le contrat n aurait pas du accepter (un assert dans un gestionnaire serait avale) */

    constructor(BlockDuelsV2 b, V2Jeton t) {
        bd = b; u = t;
        for (uint256 i = 0; i < 4; i++) { u.mint(acteurs[i], 1e15); vm.prank(acteurs[i]); u.approve(address(bd), type(uint256).max); }
    }

    function nIds() external view returns (uint256) { return ids.length; }
    function _id(uint256 s) internal view returns (uint256) { return ids.length == 0 ? 1 : ids[s % ids.length]; }
    function _g(uint256 s) internal pure returns (uint8[5] memory x) {
        bytes32 r = keccak256(abi.encode("g", s));
        x[0] = uint8(r[0]) % 6; x[1] = uint8(r[1]) % 10; x[2] = uint8(r[2]) % 19; x[3] = uint8(r[3]) % 9; x[4] = uint8(r[4]) % 8;
    }

    function creer(uint256 qui, uint256 mise, uint256 sg) external {
        appels++;
        mise = bound(mise, 100_000, 1e9);
        vm.prank(acteurs[qui % 4]);
        try bd.create(address(u), mise, _g(sg), 600 + uint64(sg % 7200)) returns (uint256 id) {
            ids.push(id); fantome[id] = 1; miseDe[id] = mise; vivant += mise;
        } catch {}
    }

    function rejoindre(uint256 s, uint256 qui, uint256 sg) external {
        appels++;
        uint256 id = _id(s);
        vm.prank(acteurs[qui % 4]);
        try bd.join(id, _g(sg)) { if (fantome[id] != 1) casse = true; fantome[id] = 2; vivant += miseDe[id]; } catch {}
    }

    function annuler(uint256 s, uint256 qui) external {
        appels++;
        uint256 id = _id(s);
        vm.prank(acteurs[qui % 4]);
        try bd.cancel(id) { if (fantome[id] != 1) casse = true; fantome[id] = 3; vivant -= miseDe[id]; } catch {}
    }

    function regler(uint256 s, uint256 sh) external {
        appels++;
        uint256 id = _id(s);
        (,,,,, uint40 t,,,) = bd.duels(id);
        if (t != 0 && block.number > t && block.number <= uint256(t) + 256) vm.setBlockhash(t, keccak256(abi.encode("h", sh, id)));
        try bd.settle(id) { if (fantome[id] != 2) casse = true; fantome[id] = 3; vivant -= 2 * miseDe[id]; reglements++; } catch {}
    }

    function parDefaut(uint256 s) external {
        appels++;
        uint256 id = _id(s);
        try bd.settleDefault(id) { if (fantome[id] != 2) casse = true; fantome[id] = 3; vivant -= 2 * miseDe[id]; defauts++; } catch {}
    }

    function rembourser(uint256 s) external {
        appels++;
        uint256 id = _id(s);
        try bd.refundExpired(id) { if (fantome[id] != 1) casse = true; fantome[id] = 3; vivant -= miseDe[id]; } catch {}
    }

    function reclamer(uint256 qui, uint256 vers) external {
        appels++;
        address a = qui % 6 == 4 ? DEV : qui % 6 == 5 ? POOL : acteurs[qui % 4];
        vm.prank(a);
        try bd.claim(address(u), address(uint160(0xF000 + vers % 3))) {} catch {}
    }

    function noircir(uint256 qui, bool b) external {
        appels++;
        address a = qui % 6 == 4 ? DEV : qui % 6 == 5 ? POOL : acteurs[qui % 4];
        u.setNoire(a, b);
    }

    function avancer(uint256 blocs, uint256 secondes) external {
        appels++;
        vm.roll(block.number + bound(blocs, 1, 400));
        vm.warp(block.timestamp + bound(secondes, 1, 3 hours));
    }

    function du() public view returns (uint256 s) {
        for (uint256 i = 0; i < 4; i++) s += bd.owed(address(u), acteurs[i]);
        s += bd.owed(address(u), DEV) + bd.owed(address(u), POOL);
    }
}

contract BlockDuelsV2InvariantTest is Test {
    GestionnaireV2 h;
    BlockDuelsV2 bd;
    V2Jeton u;

    function setUp() public {
        vm.roll(10_000);
        vm.warp(1_800_000_000);
        u = new V2Jeton(6);
        bd = new BlockDuelsV2(address(u), address(0xDE), address(0x70), address(0x6A));
        h = new GestionnaireV2(bd, u);
        targetContract(address(h));
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 100
    function invariant_SoldeEgaleMisesVivantesPlusDu() public view {
        assertEq(u.balanceOf(address(bd)), h.vivant() + h.du(), "solde == mises vivantes + du");
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 100
    function invariant_StatutsCommeLeFantome() public view {
        uint256 n = h.nIds();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = h.ids(i);
            (,, BlockDuelsV2.Status s,,,,,,) = bd.duels(id);
            uint8 f = h.fantome(id);
            if (f == 1) assertEq(uint256(s), uint256(BlockDuelsV2.Status.Open));
            else if (f == 2) assertEq(uint256(s), uint256(BlockDuelsV2.Status.Joined));
            else assertTrue(uint256(s) >= 3 && uint256(s) <= 6, "fini");
        }
    }

    function invariant_AucuneTransitionInterdite() public view {
        assertFalse(h.casse(), "le contrat a accepte une transition interdite");
    }

    function afterInvariant() external {
        emit log_named_uint("handler calls", h.appels());
        emit log_named_uint("settled in window", h.reglements());
        emit log_named_uint("won by default", h.defauts());
    }
}
