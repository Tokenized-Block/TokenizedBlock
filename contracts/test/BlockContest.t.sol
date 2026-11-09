// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockContest} from "../src/BlockContest.sol";
import {Pairs7030} from "./Pairs7030.sol";

/// @dev ERC-20 with transfer + optional fee-on-transfer + a recipient blocklist (to simulate a token refusing a payee).
contract ContestToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blocked;
    uint256 public feeBps;
    uint256 public deadFeeBps; // fee taken (destroyed) only on transfers TO 0x...dEaD
    /// behaviour of transfer() TO 0x...dEaD: 0 normal, 1 PARTIAL (moves half, returns true), 2 FALSE_NO_MOVE (returns false,
    /// moves nothing), 3 FALSE_BUT_MOVES (moves all, returns false), 4 DEBIT_PLUS_ONE (debits amount + 1, credits amount).
    uint8 public deadMode;
    address constant DEAD_ = 0x000000000000000000000000000000000000dEaD;

    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function setFee(uint256 b) external { feeBps = b; }
    function setDeadFee(uint256 b) external { deadFeeBps = b; }
    function setDeadMode(uint8 m) external { deadMode = m; }
    function setBlocked(address a, bool b) external { blocked[a] = b; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) {
        if (to == DEAD_ && deadMode != 0) {
            if (deadMode == 1) { _move(msg.sender, to, a / 2); return true; }
            if (deadMode == 2) return false;
            if (deadMode == 3) { _move(msg.sender, to, a); return false; }
            if (deadMode == 4) { _move(msg.sender, to, a); require(balanceOf[msg.sender] >= 1, "balance"); balanceOf[msg.sender] -= 1; return true; }
        }
        _move(msg.sender, to, a);
        return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        uint256 al = allowance[f][msg.sender];
        require(al >= a, "allowance");
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        _move(f, to, a);
        return true;
    }
    function _move(address f, address to, uint256 a) private {
        require(!blocked[to], "blocked");
        require(balanceOf[f] >= a, "balance");
        balanceOf[f] -= a;
        uint256 fee = a * feeBps / 10_000;
        if (to == address(0xdEaD)) fee += a * deadFeeBps / 10_000;
        balanceOf[to] += a - fee;
    }
}

/// @dev stands in for hook 7030: createurs(poolId) returns 3 words, the first being the creator (same shape as measured live);
///      cotes(key) returns (devise, bloc) like the live hook: the side flagged as a block is `bloc`; two blocks or two non-blocks
///      revert (live: PaireNonAdmise). `lie` swaps the answer, to test that the contract checks it against the key.
contract MockHook {
    struct Key { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
    error PaireNonAdmise();
    mapping(bytes32 => address) public creatorOfPool;
    mapping(address => bool) public isBlock;
    bool public lie;
    bool public dirty;
    function setCreator(bytes32 id, address who) external { creatorOfPool[id] = who; }
    function setBlock(address a, bool b) external { isBlock[a] = b; }
    function setLie(bool b) external { lie = b; }
    function setDirty(bool b) external { dirty = b; }
    function createurs(bytes32 id) external view returns (address, uint256, uint256) { return (creatorOfPool[id], 0, 0); }
    function cotes(Key calldata k) external view returns (address devise, address bloc) {
        if (isBlock[k.currency0] == isBlock[k.currency1]) revert PaireNonAdmise();
        (devise, bloc) = isBlock[k.currency1] ? (k.currency0, k.currency1) : (k.currency1, k.currency0);
        if (lie) (devise, bloc) = (bloc, devise);
        if (dirty) { // same addresses, but garbage in the upper 96 bits of the `bloc` word
            bytes memory out = abi.encode(uint256(uint160(devise)), uint256(uint160(bloc)) | (uint256(0xdead) << 200));
            assembly { return(add(out, 32), mload(out)) }
        }
    }
}

contract BlockContestTest is Test {
    BlockContest c;
    ContestToken tb;
    MockHook hook;

    uint64 constant ENTRY = 3 days;
    uint64 constant VOTE = 4 days;
    uint256 constant PRICE = 7_500e18;
    uint256 constant FEE = 15_000e18;
    uint256 constant BURN = 2_000;
    uint256 constant MINV = 3;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint64 G;

    address funder = makeAddr("funder");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave = makeAddr("dave");
    address voter = makeAddr("voter");
    address voter2 = makeAddr("voter2");
    address attacker = makeAddr("attacker");

    address[5] blocks;

    function setUp() public {
        vm.warp(1_800_000_000);
        G = uint64(block.timestamp + 1 hours);
        tb = new ContestToken();
        hook = new MockHook();
        c = new BlockContest(BlockContest.Config({
            tblock: address(tb), hook: address(hook), genesis: G, entryPeriod: ENTRY, votePeriod: VOTE, votePrice: PRICE, entryFee: FEE,
            burnBps: BURN, split1: 6_000, split2: 2_500, split3: 1_500, minVotes: MINV,
            minVoters: 1, minQualifiedEntries: 1, maxPot: type(uint256).max // mechanics suite; the owner's 3-voter / 2-entry quorum is in ownerConfig
        }), Pairs7030.list());
        for (uint160 i; i < 5; ++i) {
            blocks[i] = address(uint160(0xb2000000000000000000) << 80 | (0x1000 + i));
            hook.setBlock(blocks[i], true);
        }
        address[8] memory people = [funder, alice, bob, carol, dave, voter, voter2, attacker];
        for (uint256 i; i < people.length; ++i) {
            tb.mint(people[i], 100_000_000e18);
            vm.prank(people[i]);
            tb.approve(address(c), type(uint256).max);
        }
        // the hook records each block's creator (block paired with native ETH, like the live UNIT pool)
        hook.setCreator(_id(_key(blocks[0])), alice);
        hook.setCreator(_id(_key(blocks[1])), bob);
        hook.setCreator(_id(_key(blocks[2])), carol);
        hook.setCreator(_id(_key(blocks[3])), dave);
        hook.setCreator(_id(_key(blocks[4])), voter2);
    }

    // ---------------------------------------------------------------- helpers
    function _key(address blk) internal view returns (BlockContest.PoolKey memory) {
        return BlockContest.PoolKey(address(0), blk, 0, 200, address(hook));
    }
    function _id(BlockContest.PoolKey memory k) internal pure returns (bytes32) { return keccak256(abi.encode(k)); }
    function _enter(address who, address blk) internal returns (uint256 id) { vm.prank(who); id = c.enter(blk, _key(blk)); }
    function _vote(address who, uint256 r, uint256 id, uint256 n) internal { vm.prank(who); c.vote(r, id, n); }
    function _toVote(uint256 r) internal { vm.warp(c.voteStart(r)); }
    function _toEnd(uint256 r) internal { vm.warp(c.roundEnd(r)); }
    function _pot(uint256 r) internal view returns (uint256 p) { (p,,,,,) = c.roundInfo(r); }
    /// fills every round of x's placement window to MAX_POT by plain transfer + sweepSurplus() (fund() only reaches 2 ahead).
    function _fillWindowOf(BlockContest x) internal {
        uint256 cur = x.currentRound(); uint256 total;
        for (uint256 k = cur; k <= cur + x.MAX_FUND_AHEAD(); ++k) total += x.fundRoom(k);
        if (total == 0) return;
        tb.mint(address(x), total);
        x.sweepSurplus();
    }
    function _solvent() internal view { assertEq(tb.balanceOf(address(c)), c.liabilities(), "balance == liabilities"); }

    // ---------------------------------------------------------------- happy path
    function test_happyPath_top3_exactPayouts() public {
        vm.prank(funder); c.fund(0, 1_000_000e18);
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        uint256 b = _enter(bob, blocks[1]);
        uint256 cc = _enter(carol, blocks[2]);
        uint256 d = _enter(dave, blocks[3]);
        _toVote(0);
        _vote(voter, 0, b, 10);
        _vote(voter2, 0, a, 7);
        _vote(voter, 0, cc, 3);
        _vote(voter2, 0, d, 1);
        uint256 votesMoney = 21 * PRICE;
        uint256 pot = 1_000_000e18 + 4 * FEE + votesMoney - votesMoney * BURN / 10_000;
        assertEq(_pot(0), pot);
        _solvent();

        uint256 a0 = tb.balanceOf(alice); uint256 b0 = tb.balanceOf(bob); uint256 c0 = tb.balanceOf(carol); uint256 d0 = tb.balanceOf(dave);
        _toEnd(0);
        vm.prank(attacker); c.settle(0); // anyone settles
        assertEq(tb.balanceOf(bob) - b0, pot * 6_000 / 10_000, "1st");
        assertEq(tb.balanceOf(alice) - a0, pot * 2_500 / 10_000, "2nd");
        assertEq(tb.balanceOf(carol) - c0, pot * 1_500 / 10_000, "3rd");
        assertEq(tb.balanceOf(dave), d0, "4th gets nothing");
        uint256 dust = pot - pot * 6_000 / 10_000 - pot * 2_500 / 10_000 - pot * 1_500 / 10_000;
        assertEq(_pot(2), dust, "rounding dust rolls to next round");
        assertEq(_pot(0), 0);
        _solvent();
    }

    function test_deadShare_exact() public {
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        _toVote(0);
        uint256 dead0 = tb.balanceOf(DEAD);
        uint256 v0 = tb.balanceOf(voter);
        uint256 p0 = _pot(0);
        _vote(voter, 0, a, 3);
        assertEq(tb.balanceOf(DEAD) - dead0, 3 * PRICE * BURN / 10_000, "dead gets exactly BURN_BPS");
        assertEq(v0 - tb.balanceOf(voter), 3 * PRICE, "voter pays exactly n * price");
        assertEq(_pot(0) - p0, 3 * PRICE - 3 * PRICE * BURN / 10_000, "rest joins pot");
        _solvent();
    }

    // ---------------------------------------------------------------- ties
    function test_tie_earlierEntryWins() public {
        vm.prank(funder); c.fund(0, 1_000_000e18);
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]); // id 0
        uint256 b = _enter(bob, blocks[1]);   // id 1
        uint256 cc = _enter(carol, blocks[2]); // id 2
        _toVote(0);
        // vote order deliberately favours later entries first
        _vote(voter, 0, cc, 5);
        _vote(voter, 0, b, 5);
        _vote(voter, 0, a, 5);
        (,,,, uint256[3] memory top, uint256 n) = c.roundInfo(0);
        assertEq(n, 3);
        assertEq(top[0], a); assertEq(top[1], b); assertEq(top[2], cc);
        uint256 pot = _pot(0);
        uint256 a0 = tb.balanceOf(alice);
        _toEnd(0);
        c.settle(0);
        assertEq(tb.balanceOf(alice) - a0, pot * 6_000 / 10_000, "tie -> lower entry id wins");
    }

    // ---------------------------------------------------------------- rollover
    function test_emptyRound_rollsWholePotToNextRound() public {
        vm.prank(funder); c.fund(0, 500_000e18);
        _toEnd(0);
        c.settle(0);
        assertEq(_pot(0), 0);
        assertEq(_pot(2), 500_000e18);
        _solvent();
    }

    function test_entriesButNoVotes_rollsWholePot() public {
        vm.prank(funder); c.fund(0, 500_000e18);
        vm.warp(G);
        _enter(alice, blocks[0]);
        uint256 a0 = tb.balanceOf(alice);
        _toEnd(0);
        c.settle(0);
        assertEq(tb.balanceOf(alice), a0, "0 votes = not a winner");
        assertEq(_pot(2), 500_000e18 + FEE);
        _solvent();
    }

    function test_singleCandidate_unusedPlacesRollOver() public {
        vm.prank(funder); c.fund(0, 1_000_000e18);
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        _enter(bob, blocks[1]); // no votes
        _toVote(0);
        _vote(voter, 0, a, MINV);
        uint256 pot = _pot(0);
        uint256 a0 = tb.balanceOf(alice);
        _toEnd(0);
        c.settle(0);
        assertEq(tb.balanceOf(alice) - a0, pot * 6_000 / 10_000);
        assertEq(_pot(2), pot - pot * 6_000 / 10_000);
        _solvent();
    }

    function test_lateSettle_rollsIntoCurrentPlusOne_notASettledOne() public {
        vm.prank(funder); c.fund(0, 100e18);
        vm.prank(funder); c.fund(1, 200e18);
        _toEnd(1); // rounds 0 and 1 both over, current = 2
        c.settle(1);
        assertEq(_pot(3), 200e18, "rolls to current + 1 = 3");
        c.settle(0); // settled after round 1 -> must not land in settled round 1 (nor in round 2, already open)
        assertEq(_pot(1), 0);
        assertEq(_pot(2), 0);
        assertEq(_pot(3), 300e18);
        _solvent();
    }

    /// SEC-103: settled late, DURING the next round's vote window -> the money goes to a round whose entry window is still ahead.
    function test_settleLateDuringVoteWindow_rollsToRoundWithFullEntryWindow() public {
        vm.prank(funder); c.fund(0, 500e18);
        vm.warp(c.voteStart(1) + 1 hours); // round 1 is voting, its entries are closed
        c.settle(0);
        assertEq(_pot(1), 0, "not into round 1 (entries closed)");
        assertEq(_pot(2), 500e18, "into round 2");
        assertGt(c.roundStart(2), block.timestamp, "round 2 entry window entirely ahead");
        assertLe(uint256(2), c.currentRound() + c.MAX_FUND_AHEAD(), "within the funding horizon");
        _solvent();
    }

    // ---------------------------------------------------------------- windows
    function test_vote_outsideWindow_reverts() public {
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        vm.expectRevert(BlockContest.NotVoteWindow.selector);
        _vote(voter, 0, a, 1); // entry phase
        _toEnd(0);
        vm.expectRevert(BlockContest.NotVoteWindow.selector);
        _vote(voter, 0, a, 1); // after end
        vm.warp(c.voteStart(1));
        vm.expectRevert(BlockContest.NotVoteWindow.selector);
        _vote(voter, 0, a, 1); // old round during next round's vote window
    }

    function test_vote_beforeGenesis_reverts() public {
        vm.expectRevert(BlockContest.NotVoteWindow.selector);
        _vote(voter, 0, 0, 1);
    }

    function test_vote_badParams() public {
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        _toVote(0);
        vm.expectRevert(BlockContest.NoSuchEntry.selector);
        _vote(voter, 0, a + 1, 1);
        vm.expectRevert(BlockContest.BadParams.selector);
        _vote(voter, 0, a, 0);
    }

    function test_enter_windowAndPrefix() public {
        vm.prank(alice);
        vm.expectRevert(BlockContest.NotEntryWindow.selector);
        c.enter(blocks[0], _key(blocks[0])); // before genesis
        vm.warp(G);
        vm.prank(alice);
        vm.expectRevert(BlockContest.NotB20.selector);
        c.enter(address(0x1234), _key(address(0x1234))); // not B20 prefix
        vm.prank(alice);
        vm.expectRevert(BlockContest.NotB20.selector);
        c.enter(address(tb), _key(address(tb))); // mock TBLOCK has no prefix; real TBLOCK (which has it) checked in fork test
        _enter(alice, blocks[0]);
        vm.prank(alice);
        vm.expectRevert(BlockContest.AlreadyEntered.selector);
        c.enter(blocks[0], _key(blocks[0])); // one entry per block per round
        _toVote(0);
        vm.prank(bob);
        vm.expectRevert(BlockContest.NotEntryWindow.selector);
        c.enter(blocks[1], _key(blocks[1])); // vote phase
        vm.warp(c.roundStart(1));
        uint256 id = _enter(alice, blocks[0]); // same block can enter again next round
        assertEq(c.entryOf(1, id).payee, alice);
    }

    function test_enter_creatorOk_payeeIsCreator() public {
        vm.warp(G);
        uint256 id = _enter(bob, blocks[1]);
        BlockContest.Entry memory e = c.entryOf(0, id);
        assertEq(e.payee, bob);
        assertEq(e.blockToken, blocks[1]);
        assertEq(c.creatorOf(_id(_key(blocks[1]))), bob);
        // block as currency0 also accepted (pair currency on the other side)
        address blk = blocks[2];
        BlockContest.PoolKey memory k = BlockContest.PoolKey(blk, address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF), 0, 200, address(hook));
        hook.setCreator(_id(k), carol);
        vm.prank(carol);
        c.enter(blk, k);
    }

    function test_enter_nonCreatorRefused() public {
        vm.warp(G);
        vm.prank(alice);
        vm.expectRevert(BlockContest.NotCreator.selector);
        c.enter(blocks[1], _key(blocks[1])); // bob's block
        vm.prank(attacker);
        vm.expectRevert(BlockContest.NotCreator.selector);
        c.enter(blocks[0], _key(blocks[0]));
        // a non-creator holding the block is irrelevant now: no holder rule
        assertEq(c.entryCount(0), 0);
    }

    function test_enter_wrongHookRefused() public {
        vm.warp(G);
        MockHook other = new MockHook();
        BlockContest.PoolKey memory k = BlockContest.PoolKey(address(0), blocks[0], 0, 200, address(other));
        other.setCreator(_id(k), alice); // alice is "creator" on a hook the contest does not trust
        vm.prank(alice);
        vm.expectRevert(BlockContest.WrongHook.selector);
        c.enter(blocks[0], k);
    }

    function test_enter_blockNotInKeyRefused() public {
        vm.warp(G);
        // alice is creator of blocks[0]'s pool but tries to enter bob's block with her key
        vm.prank(alice);
        vm.expectRevert(BlockContest.NotInKey.selector);
        c.enter(blocks[1], _key(blocks[0]));
    }

    function test_enter_zeroCreatorRefused() public {
        vm.warp(G);
        address unknown = address(uint160(0xb2000000000000000000) << 80 | 0xbeef);
        hook.setBlock(unknown, true); // the hook knows which side is the block (cotes is computed from the key), not its creator
        assertEq(hook.creatorOfPool(_id(_key(unknown))), address(0));
        vm.prank(alice);
        vm.expectRevert(BlockContest.NotCreator.selector);
        c.enter(unknown, _key(unknown)); // pool unknown to the hook -> creator word 0
        vm.prank(address(0));
        vm.expectRevert(BlockContest.NotCreator.selector);
        c.enter(unknown, _key(unknown)); // even msg.sender == 0 cannot match a zero creator
        vm.expectRevert(BlockContest.NotCreator.selector);
        c.creatorOf(bytes32(uint256(1)));
    }

    function test_enter_hookWithoutCreateursRefused() public {
        // constructor-level misconfiguration: HOOK that implements neither cotes nor createurs -> every entry refused, nothing paid
        BlockContest c2 = new BlockContest(BlockContest.Config({
            tblock: address(tb), hook: address(tb), genesis: G, entryPeriod: ENTRY, votePeriod: VOTE, votePrice: PRICE,
            entryFee: FEE, burnBps: BURN, split1: 6_000, split2: 2_500, split3: 1_500, minVotes: MINV,
            minVoters: 1, minQualifiedEntries: 1, maxPot: type(uint256).max
        }), Pairs7030.list());
        vm.warp(G);
        BlockContest.PoolKey memory k = BlockContest.PoolKey(address(0), blocks[0], 0, 200, address(tb));
        vm.prank(alice);
        vm.expectRevert(BlockContest.NotBlockSide.selector);
        c2.enter(blocks[0], k);
    }

    function test_fund_rules() public {
        vm.prank(funder);
        vm.expectRevert(BlockContest.BadParams.selector);
        c.fund(0, 0);
        vm.prank(funder); c.fund(2, 1e18); // future round within FUND_AHEAD_MAX: fine
        _toEnd(0);
        vm.prank(funder);
        vm.expectRevert(BlockContest.RoundEnded.selector);
        c.fund(0, 1e18);
        assertEq(_pot(2), 1e18);
    }

    /// SEC-301: fund() reaches only currentRound() .. currentRound() + FUND_AHEAD_MAX (2); placement still reaches 8.
    function test_fund_capAtTwoRoundsAhead() public {
        assertEq(c.FUND_AHEAD_MAX(), 2); assertEq(c.MAX_FUND_AHEAD(), 8);
        // before genesis currentRound() == 0
        vm.prank(funder); c.fund(0, 1e18);
        vm.prank(funder); c.fund(2, 1e18); // upper bound: accepted
        vm.prank(funder);
        vm.expectRevert(BlockContest.RoundTooFar.selector);
        c.fund(3, 1e18);                    // one past: refused
        vm.warp(c.roundStart(1)); // current = 1 -> 3 now allowed, 4 not; 0 has ended
        vm.prank(funder); c.fund(3, 1e18);
        vm.prank(funder);
        vm.expectRevert(BlockContest.RoundTooFar.selector);
        c.fund(4, 1e18);
        vm.prank(funder);
        vm.expectRevert(BlockContest.RoundEnded.selector);
        c.fund(0, 1e18);                    // lower bound: an ended round is refused
        vm.prank(funder);
        vm.expectRevert(BlockContest.RoundTooFar.selector);
        c.fund(type(uint64).max, 1e18);
        assertEq(_pot(2), 1e18); assertEq(_pot(3), 1e18);
        _solvent();
    }

    // ---------------------------------------------------------------- SEC-002 pair currencies
    function test_pairList_isTheDescriptorList() public view {
        assertEq(Pairs7030.list().length, 62);
        assertTrue(c.isPairCurrency(0xB2000000000000000000002fEb517dFeC7415344), "OUSD");
        assertTrue(c.isPairCurrency(0xb20000000000000000000078ee7ce2fE4908108C), "NVDAc");
        assertTrue(c.isPairCurrency(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913), "USDC");
        assertFalse(c.isPairCurrency(blocks[0]));
        assertFalse(c.isPairCurrency(address(0)), "ETH is not in the list (and has no B20 prefix)");
    }

    function test_enter_pairCurrencyRefused_OUSD_NVDAc() public {
        vm.warp(G);
        address[2] memory pairs = [0xB2000000000000000000002fEb517dFeC7415344, 0xb20000000000000000000078ee7ce2fE4908108C];
        for (uint256 i; i < 2; ++i) {
            // alice is the hook-recorded creator of a pool pairing her block with the listed currency; she tries to enter the CURRENCY
            BlockContest.PoolKey memory k = pairs[i] < blocks[0]
                ? BlockContest.PoolKey(pairs[i], blocks[0], 0, 200, address(hook))
                : BlockContest.PoolKey(blocks[0], pairs[i], 0, 200, address(hook));
            hook.setCreator(_id(k), alice);
            vm.prank(alice);
            vm.expectRevert(BlockContest.NotB20.selector);
            c.enter(pairs[i], k);
            // with the same key she CAN enter her block (once)
            if (i == 0) { vm.prank(alice); c.enter(blocks[0], k); }
        }
        assertEq(c.entryCount(0), 1);
    }

    // ---------------------------------------------------------------- SEC-003 one entry per payee, MIN_VOTES
    function test_enter_onePerPayeePerRound() public {
        hook.setCreator(_id(_key(blocks[4])), alice); // alice also created blocks[4]
        vm.warp(G);
        _enter(alice, blocks[0]);
        vm.prank(alice);
        vm.expectRevert(BlockContest.PayeeAlreadyEntered.selector);
        c.enter(blocks[4], _key(blocks[4]));
        vm.warp(c.roundStart(1));
        _enter(alice, blocks[4]); // next round: fine
        assertTrue(c.enteredBy(0, alice) && c.enteredBy(1, alice));
    }

    function test_minVotes_placesUnderThresholdRollOver() public {
        vm.prank(funder); c.fund(0, 1_000_000e18);
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        uint256 b = _enter(bob, blocks[1]);
        uint256 cc = _enter(carol, blocks[2]);
        _toVote(0);
        _vote(voter, 0, a, 5);      // qualifies
        _vote(voter, 0, b, MINV - 1); // 2nd by rank, under MIN_VOTES
        _vote(voter, 0, cc, 1);     // 3rd by rank, under MIN_VOTES
        uint256 pot = _pot(0);
        uint256 a0 = tb.balanceOf(alice); uint256 b0 = tb.balanceOf(bob); uint256 c0 = tb.balanceOf(carol);
        _toEnd(0);
        c.settle(0);
        assertEq(tb.balanceOf(alice) - a0, pot * 6_000 / 10_000, "1st paid");
        assertEq(tb.balanceOf(bob), b0, "2nd under MIN_VOTES: unpaid");
        assertEq(tb.balanceOf(carol), c0, "3rd under MIN_VOTES: unpaid");
        assertEq(_pot(2), pot - pot * 6_000 / 10_000, "unpaid places roll over");
        _solvent();
    }

    function test_minVotes_soleEntryWithTooFewVotes_wholePotRollsOver() public {
        vm.prank(funder); c.fund(0, 1_000_000e18);
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        _toVote(0);
        _vote(alice, 0, a, MINV - 1); // self-vote under the threshold
        uint256 pot = _pot(0);
        uint256 a0 = tb.balanceOf(alice);
        _toEnd(0);
        c.settle(0);
        assertEq(tb.balanceOf(alice), a0, "no prize");
        assertEq(_pot(2), pot);
        _solvent();
    }

    function test_minVotes_exactThresholdPays() public {
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        _toVote(0);
        _vote(voter, 0, a, MINV);
        uint256 pot = _pot(0);
        uint256 a0 = tb.balanceOf(alice);
        _toEnd(0);
        c.settle(0);
        assertEq(tb.balanceOf(alice) - a0, pot * 6_000 / 10_000);
    }

    // ---------------------------------------------------------------- settle
    function test_settleTwice_reverts() public {
        vm.prank(funder); c.fund(0, 1e18);
        _toEnd(0);
        c.settle(0);
        vm.expectRevert(BlockContest.AlreadySettled.selector);
        c.settle(0);
    }

    function test_settleBeforeEnd_reverts() public {
        _toVote(0);
        vm.expectRevert(BlockContest.NotEnded.selector);
        c.settle(0);
        vm.warp(c.roundEnd(0) - 1);
        vm.expectRevert(BlockContest.NotEnded.selector);
        c.settle(0);
    }

    // ---------------------------------------------------------------- no admin drain
    function test_noAdminDrain_attackerCannotTakeAnything() public {
        vm.prank(funder); c.fund(0, 1_000_000e18);
        uint256 att0 = tb.balanceOf(attacker);
        vm.startPrank(attacker);
        vm.expectRevert(BlockContest.NothingToClaim.selector);
        c.claim(attacker);
        vm.expectRevert(BlockContest.NoSurplus.selector);
        c.sweepSurplus();
        vm.expectRevert(BlockContest.NotEnded.selector);
        c.settle(0);
        vm.stopPrank();
        // the deployer (this test contract) has no special power either: there is no owner function to call
        (bool ok,) = address(c).call(abi.encodeWithSignature("owner()"));
        assertFalse(ok, "no owner()");
        (ok,) = address(c).call(abi.encodeWithSignature("withdraw(uint256)", 1));
        assertFalse(ok, "no withdraw");
        (ok,) = address(c).call(abi.encodeWithSignature("rescue(address,uint256)", address(tb), 1));
        assertFalse(ok, "no rescue");
        // empty round: the pot goes to the next round, never to an address
        _toEnd(0);
        vm.prank(attacker); c.settle(0);
        assertEq(tb.balanceOf(attacker), att0);
        assertEq(_pot(2), 1_000_000e18);
        assertEq(tb.balanceOf(address(c)), 1_000_000e18);
        _solvent();
    }

    function test_surplus_goesToCurrentPot() public {
        tb.mint(address(c), 777e18); // plain transfer, not via fund
        vm.warp(G);
        vm.prank(attacker); c.sweepSurplus();
        assertEq(_pot(0), 777e18);
        _solvent();
    }

    // ---------------------------------------------------------------- token edge cases
    function test_feeOnTransfer_voteAndEntryRefused_fundCreditsReceived() public {
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        tb.setFee(100); // 1 %
        vm.prank(funder); c.fund(0, 1_000e18);
        assertEq(_pot(0), FEE + 990e18, "fund credits what arrived");
        vm.prank(bob);
        vm.expectRevert(BlockContest.TransferFailed.selector);
        c.enter(blocks[1], _key(blocks[1]));
        _toVote(0);
        vm.expectRevert(BlockContest.TransferFailed.selector);
        _vote(voter, 0, a, 1);
        _solvent();
    }

    function test_refusedPayee_isCredited_settleNotBlocked_thenClaims() public {
        vm.prank(funder); c.fund(0, 1_000_000e18);
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        uint256 b = _enter(bob, blocks[1]);
        _toVote(0);
        _vote(voter, 0, a, MINV + 1);
        _vote(voter, 0, b, MINV);
        uint256 pot = _pot(0);
        tb.setBlocked(alice, true);
        uint256 b0 = tb.balanceOf(bob);
        _toEnd(0);
        c.settle(0);
        assertEq(tb.balanceOf(bob) - b0, pot * 2_500 / 10_000, "2nd still paid");
        assertEq(c.claimable(alice), pot * 6_000 / 10_000, "1st credited");
        _solvent();
        // SEC-106: alice's address is STILL refused by the token -> she redirects her credit to another address of hers
        address aliceCold = makeAddr("alice-cold");
        vm.prank(alice);
        vm.expectRevert(BlockContest.TransferFailed.selector);
        c.claim(alice); // still refused: reverts, credit kept
        assertEq(c.claimable(alice), pot * 6_000 / 10_000, "credit kept after a failed claim");
        vm.prank(alice);
        vm.expectRevert(BlockContest.BadParams.selector);
        c.claim(address(0));
        vm.prank(alice);
        vm.expectRevert(BlockContest.BadParams.selector);
        c.claim(address(c));
        vm.prank(bob);
        vm.expectRevert(BlockContest.NothingToClaim.selector);
        c.claim(bob); // someone else cannot move alice's credit
        vm.prank(alice); c.claim(aliceCold);
        assertEq(tb.balanceOf(aliceCold), pot * 6_000 / 10_000, "redirected");
        assertEq(c.claimable(alice), 0);
        _solvent();
    }

    /// SEC-105: a griefer settling with a tight gas limit cannot push a winner onto the claimable path.
    /// SEC-204: an entry id that does not fit the uint32 podium slot is refused before the cast. 2^32 real entries cannot be
    ///          created in a test, so the round's entries array LENGTH is set directly (slot layout: forge inspect storageLayout,
    ///          _entries = slot 2; array length at keccak256(abi.encode(round, 2))); the far entries read as zero.
    function test_sec204_entryIdBeyondUint32_refused() public {
        _toVote(0);
        bytes32 lenSlot = keccak256(abi.encode(uint256(0), uint256(2)));
        vm.store(address(c), lenSlot, bytes32(uint256(type(uint32).max) + 1));
        assertEq(c.entryCount(0), uint256(type(uint32).max) + 1, "layout assumption holds");
        vm.prank(voter);
        vm.expectRevert(BlockContest.BadParams.selector);
        c.vote(0, type(uint32).max, MINV); // id == 2^32 - 1 : id + 1 would overflow uint32
        vm.prank(voter); c.vote(0, uint256(type(uint32).max) - 1, MINV); // the last id that fits: accepted
        (,,,, uint256[3] memory top, uint256 n) = c.roundInfo(0);
        assertEq(n, 1); assertEq(top[0], uint256(type(uint32).max) - 1);
    }

    /// SEC-201 on the other money paths (mechanics config with partial burn and a small cap): a vote's pot share and swept
    ///          surplus never push a pot past MAX_POT; what does not fit goes to the next round with room (not to DEAD), and
    ///          liabilities stay exact.
    function test_cap_voteShareAndSurplusOverCap_spillToNextRound() public {
        uint256 cap = 10_000e18;
        BlockContest c2 = new BlockContest(BlockContest.Config({
            tblock: address(tb), hook: address(hook), genesis: G, entryPeriod: ENTRY, votePeriod: VOTE, votePrice: PRICE,
            entryFee: 0, burnBps: BURN, split1: 6_000, split2: 2_500, split3: 1_500, minVotes: MINV,
            minVoters: 1, minQualifiedEntries: 1, maxPot: cap
        }), Pairs7030.list());
        vm.prank(voter); tb.approve(address(c2), type(uint256).max);
        vm.warp(G);
        vm.prank(alice); uint256 a = c2.enter(blocks[0], _key(blocks[0]));
        vm.warp(c2.voteStart(0));
        uint256 dead0 = tb.balanceOf(DEAD);
        vm.prank(voter); c2.vote(0, a, 2); // cost 15,000e18: 3,000 burned, 12,000 for the pot -> 10,000 in round 0, 2,000 in 1
        (uint256 p0,,,,,) = c2.roundInfo(0);
        (uint256 p1,,,,,) = c2.roundInfo(1);
        assertEq(p0, cap, "round 0 at the cap");
        assertEq(p1, 2 * PRICE * (10_000 - BURN) / 10_000 - cap, "the rest in round 1");
        assertEq(tb.balanceOf(DEAD) - dead0, 2 * PRICE * BURN / 10_000, "only the vote's own burn share burned");
        assertEq(tb.balanceOf(address(c2)), c2.liabilities(), "liabilities exact");
        tb.mint(address(c2), 777e18); // a plain transfer while round 0 is full
        dead0 = tb.balanceOf(DEAD);
        vm.prank(attacker); c2.sweepSurplus();
        assertEq(tb.balanceOf(DEAD), dead0, "surplus not burned");
        (p1,,,,,) = c2.roundInfo(1);
        assertEq(p1, 2 * PRICE * (10_000 - BURN) / 10_000 - cap + 777e18, "surplus went to round 1");
        assertEq(tb.balanceOf(address(c2)), c2.liabilities());
    }

    /// (4) a token refusing transfers to DEAD cannot block settle: the winner is paid, the rollover that fits nowhere waits in
    ///     pendingBurn (inside liabilities), flushBurn() burns it once DEAD is accepted again.
    function test_burnRefused_settleStillPaysWinner_pendingBurn_flush() public {
        uint256 cap = 1_000e18;
        BlockContest c3 = new BlockContest(BlockContest.Config({
            tblock: address(tb), hook: address(hook), genesis: G, entryPeriod: ENTRY, votePeriod: VOTE, votePrice: PRICE,
            entryFee: 0, burnBps: BURN, split1: 6_000, split2: 2_500, split3: 1_500, minVotes: MINV,
            minVoters: 1, minQualifiedEntries: 1, maxPot: cap
        }), Pairs7030.list());
        vm.prank(voter); tb.approve(address(c3), type(uint256).max);
        vm.startPrank(funder);
        tb.approve(address(c3), type(uint256).max);
        vm.stopPrank();
        _fillWindowOf(c3); // rounds 0..8 full (before genesis, current = 0)
        vm.warp(G);
        vm.prank(alice); uint256 a = c3.enter(blocks[0], _key(blocks[0]));
        vm.warp(c3.voteStart(0));
        vm.prank(voter); c3.vote(0, a, MINV); // DEAD still accepted here (a vote's burn is strict)
        vm.warp(c3.roundStart(1));            // current = 1
        _fillWindowOf(c3);                    // rounds 1..9 full: the 8 future rounds 2..9 included
        tb.setBlocked(DEAD, true);            // from now on the token refuses DEAD
        uint256 a0 = tb.balanceOf(alice);
        c3.settle(0);                         // must not revert
        assertEq(tb.balanceOf(alice) - a0, cap * 6_000 / 10_000, "winner paid");
        assertEq(c3.pendingBurn(), cap - cap * 6_000 / 10_000, "rollover that fits nowhere waits in pendingBurn");
        assertEq(tb.balanceOf(address(c3)), c3.liabilities(), "liabilities exact with the pending burn inside");
        vm.expectRevert(BlockContest.TransferFailed.selector);
        c3.flushBurn();                       // still refused
        tb.setBlocked(DEAD, false);
        uint256 dead0 = tb.balanceOf(DEAD);
        vm.prank(attacker); c3.flushBurn();   // permissionless
        assertEq(tb.balanceOf(DEAD) - dead0, cap - cap * 6_000 / 10_000, "burned exactly");
        assertEq(c3.pendingBurn(), 0);
        assertEq(tb.balanceOf(address(c3)), c3.liabilities());
    }

    function _capped(uint256 cap, uint256 fee) internal returns (BlockContest x) {
        x = new BlockContest(BlockContest.Config({
            tblock: address(tb), hook: address(hook), genesis: G, entryPeriod: ENTRY, votePeriod: VOTE, votePrice: PRICE,
            entryFee: fee, burnBps: BURN, split1: 6_000, split2: 2_500, split3: 1_500, minVotes: MINV,
            minVoters: 1, minQualifiedEntries: 1, maxPot: cap
        }), Pairs7030.list());
        address[4] memory who = [voter, funder, alice, bob];
        for (uint256 i; i < 4; ++i) { vm.prank(who[i]); tb.approve(address(x), type(uint256).max); }
    }

    /// SEC-302: a token that shaves 1 % off transfers TO DEAD (DEAD gains 99 %, the contract loses 100 %): settle does not revert,
    ///          the winner is paid, the rollover that fits nowhere counts as burned (it left the contract), accounting exact.
    ///          flushBurn stays strict: with the same token it reverts rather than accept an inexact burn.
    function test_sec302_deadShavingToken_settlePays_accountingExact_flushStrict() public {
        uint256 cap = 1_000e18;
        BlockContest c3 = _capped(cap, 0);
        _fillWindowOf(c3);
        vm.warp(G);
        vm.prank(alice); uint256 a = c3.enter(blocks[0], _key(blocks[0]));
        vm.warp(c3.voteStart(0));
        vm.prank(voter); c3.vote(0, a, MINV);
        vm.warp(c3.roundStart(1));
        _fillWindowOf(c3);
        tb.setDeadFee(100); // 1 % of anything sent to DEAD vanishes
        uint256 a0 = tb.balanceOf(alice); uint256 dead0 = tb.balanceOf(DEAD); uint256 bal0 = tb.balanceOf(address(c3));
        c3.settle(0);
        uint256 leftover = cap - cap * 6_000 / 10_000;
        assertEq(tb.balanceOf(alice) - a0, cap * 6_000 / 10_000, "winner paid");
        assertEq(bal0 - tb.balanceOf(address(c3)), cap * 6_000 / 10_000 + leftover, "contract lost prize + leftover, exactly");
        assertEq(tb.balanceOf(DEAD) - dead0, leftover - leftover / 100, "DEAD got 99 % (the token destroyed 1 %)");
        assertEq(c3.pendingBurn(), 0, "nothing stayed in the contract, nothing deferred");
        assertEq(tb.balanceOf(address(c3)), c3.liabilities(), "liabilities exact");
        // SEC-401: flushBurn follows the same rule: through the shaving token the contract loses all of pendingBurn, so it
        // is cleared (it can no longer be locked forever by a token that never delivers exactly)
        tb.setDeadFee(0);
        tb.setBlocked(DEAD, true);
        tb.mint(address(c3), 5e18);
        vm.prank(attacker); c3.sweepSurplus(); // window full -> 5e18 deferred
        assertEq(c3.pendingBurn(), 5e18);
        tb.setBlocked(DEAD, false);
        tb.setDeadFee(100);
        dead0 = tb.balanceOf(DEAD);
        c3.flushBurn();
        assertEq(c3.pendingBurn(), 0, "cleared: the contract lost all of it");
        assertEq(tb.balanceOf(DEAD) - dead0, 5e18 - 5e18 / 100, "DEAD got 99 %, the token destroyed 1 %");
        assertEq(tb.balanceOf(address(c3)), c3.liabilities());
    }

    /// (4) sweepSurplus with DEAD refused and the window full: the surplus waits in pendingBurn (liabilities include it), the
    ///     sweep does not revert; flushBurn later burns it exactly.
    function test_sweep_deadRefused_defers_thenFlush() public {
        uint256 cap = 1_000e18;
        BlockContest c3 = _capped(cap, 0);
        _fillWindowOf(c3);
        tb.setBlocked(DEAD, true);
        tb.mint(address(c3), 777e18);
        uint256 liab0 = c3.liabilities();
        vm.prank(attacker); c3.sweepSurplus();
        assertEq(c3.pendingBurn(), 777e18);
        assertEq(c3.liabilities(), liab0 + 777e18, "the deferred surplus is now inside liabilities");
        assertEq(tb.balanceOf(address(c3)), c3.liabilities());
        vm.expectRevert(BlockContest.NoSurplus.selector);
        c3.sweepSurplus(); // nothing left to sweep: the pending burn is not surplus
        tb.setBlocked(DEAD, false);
        uint256 dead0 = tb.balanceOf(DEAD);
        c3.flushBurn();
        assertEq(tb.balanceOf(DEAD) - dead0, 777e18);
        assertEq(c3.liabilities(), liab0);
        assertEq(tb.balanceOf(address(c3)), c3.liabilities());
    }

    // ---------------------------------------------------------------- SEC-404 DEAD modes x {settle (inLiabilities), sweep (not)}
    uint256 constant CAP_M = 1_000e18;
    uint256 constant SURPLUS_M = 777e18;

    /// round 0 has one qualified entry; at settle the 8 future rounds are full, so 40 % of round 0's pot must be burned
    function _settleSetup() internal returns (BlockContest x, uint256 leftover) {
        x = _capped(CAP_M, 0);
        _fillWindowOf(x);
        vm.warp(G);
        vm.prank(alice); uint256 a = x.enter(blocks[0], _key(blocks[0]));
        vm.warp(x.voteStart(0));
        vm.prank(voter); x.vote(0, a, MINV);
        vm.warp(x.roundStart(1));
        _fillWindowOf(x);
        leftover = CAP_M - CAP_M * 6_000 / 10_000;
    }

    function _sweepSetup() internal returns (BlockContest x) {
        x = _capped(CAP_M, 0);
        _fillWindowOf(x);
        tb.mint(address(x), SURPLUS_M);
    }

    function _settleMode(uint8 mode) internal returns (BlockContest x, uint256 leftover, uint256 deadGain, uint256 paid) {
        (x, leftover) = _settleSetup();
        tb.setDeadMode(mode);
        uint256 a0 = tb.balanceOf(alice); uint256 d0 = tb.balanceOf(DEAD);
        x.settle(0);
        deadGain = tb.balanceOf(DEAD) - d0; paid = tb.balanceOf(alice) - a0;
        assertEq(tb.balanceOf(address(x)), x.liabilities(), "liabilities exact (settle)");
    }

    function _sweepMode(uint8 mode) internal returns (BlockContest x, uint256 deadGain) {
        x = _sweepSetup();
        tb.setDeadMode(mode);
        uint256 d0 = tb.balanceOf(DEAD); uint256 liab0 = x.liabilities();
        vm.prank(attacker); x.sweepSurplus();
        deadGain = tb.balanceOf(DEAD) - d0;
        assertEq(x.liabilities(), liab0 + x.pendingBurn(), "only the unburned part entered liabilities (sweep)");
        assertEq(tb.balanceOf(address(x)), x.liabilities(), "liabilities exact (sweep)");
    }

    function test_deadMode1_partial_settle() public {
        (BlockContest x, uint256 l, uint256 g, uint256 paid) = _settleMode(1);
        assertEq(paid, CAP_M * 6_000 / 10_000, "winner paid");
        assertEq(g, l / 2, "half moved: counted as burned");
        assertEq(x.pendingBurn(), l - l / 2, "the rest deferred");
    }
    function test_deadMode1_partial_sweep() public {
        (BlockContest x, uint256 g) = _sweepMode(1);
        assertEq(g, SURPLUS_M / 2); assertEq(x.pendingBurn(), SURPLUS_M - SURPLUS_M / 2);
    }
    function test_deadMode2_falseNoMove_settle() public {
        (BlockContest x, uint256 l, uint256 g, uint256 paid) = _settleMode(2);
        assertEq(paid, CAP_M * 6_000 / 10_000, "winner paid");
        assertEq(g, 0); assertEq(x.pendingBurn(), l, "all deferred");
    }
    function test_deadMode2_falseNoMove_sweep() public {
        (BlockContest x, uint256 g) = _sweepMode(2);
        assertEq(g, 0); assertEq(x.pendingBurn(), SURPLUS_M);
    }
    function test_deadMode3_falseButMoves_settle() public {
        (BlockContest x, uint256 l, uint256 g, uint256 paid) = _settleMode(3);
        assertEq(paid, CAP_M * 6_000 / 10_000, "winner paid");
        assertEq(g, l, "it moved: counted as burned despite the false"); assertEq(x.pendingBurn(), 0);
    }
    function test_deadMode3_falseButMoves_sweep() public {
        (BlockContest x, uint256 g) = _sweepMode(3);
        assertEq(g, SURPLUS_M); assertEq(x.pendingBurn(), 0);
    }
    /// a token debiting amount + 1 would break the books: the whole call reverts (documented exception), nothing changes
    function test_deadMode4_debitPlusOne_settle_reverts() public {
        (BlockContest x,) = _settleSetup();
        tb.setDeadMode(4);
        uint256 a0 = tb.balanceOf(alice);
        vm.expectRevert(BlockContest.TransferFailed.selector);
        x.settle(0);
        assertEq(tb.balanceOf(alice), a0, "reverted as a whole: no payout either");
        (,,, bool settled,,) = x.roundInfo(0);
        assertFalse(settled);
        tb.setDeadMode(0);
        x.settle(0); // once the token behaves, settle goes through
        assertEq(tb.balanceOf(address(x)), x.liabilities());
    }
    function test_deadMode4_debitPlusOne_sweep_reverts() public {
        BlockContest x = _sweepSetup();
        tb.setDeadMode(4);
        vm.expectRevert(BlockContest.TransferFailed.selector);
        x.sweepSurplus();
        assertEq(x.pendingBurn(), 0);
    }

    // ---------------------------------------------------------------- SEC-401 flushBurn with the same rule
    function _pending() internal returns (BlockContest x) {
        (x,) = _sweepMode(2); // SURPLUS_M deferred
        assertEq(x.pendingBurn(), SURPLUS_M);
    }
    function test_flush_partialToken_reducesPending_neverLocked() public {
        BlockContest x = _pending();
        tb.setDeadMode(1);
        uint256 d0 = tb.balanceOf(DEAD);
        x.flushBurn();
        assertEq(x.pendingBurn(), SURPLUS_M - SURPLUS_M / 2, "half left the contract: half stays pending");
        assertEq(tb.balanceOf(DEAD) - d0, SURPLUS_M / 2);
        assertEq(tb.balanceOf(address(x)), x.liabilities());
        tb.setDeadMode(0);
        x.flushBurn();
        assertEq(x.pendingBurn(), 0);
        assertEq(tb.balanceOf(address(x)), x.liabilities());
    }
    function test_flush_falseNoMove_reverts_keepsPending() public {
        BlockContest x = _pending();
        vm.expectRevert(BlockContest.TransferFailed.selector);
        x.flushBurn();
        assertEq(x.pendingBurn(), SURPLUS_M);
    }
    function test_flush_falseButMoves_clears() public {
        BlockContest x = _pending();
        tb.setDeadMode(3);
        x.flushBurn();
        assertEq(x.pendingBurn(), 0);
        assertEq(tb.balanceOf(address(x)), x.liabilities());
    }
    function test_flush_debitPlusOne_reverts() public {
        BlockContest x = _pending();
        tb.setDeadMode(4);
        vm.expectRevert(BlockContest.TransferFailed.selector);
        x.flushBurn();
        assertEq(x.pendingBurn(), SURPLUS_M);
    }

    /// SEC-403: a huge round number reverts RoundTooFar (checked before roundEnd(r) would overflow), not a panic
    function test_fund_hugeRound_RoundTooFar_notPanic() public {
        vm.prank(funder);
        vm.expectRevert(BlockContest.RoundTooFar.selector);
        c.fund(type(uint256).max, 1e18);
    }

    /// (2) worst-case placement: the 9 rounds of the window each sit at MAX_POT - 1 wei; a 10-wei entry fee is spread 1 wei per
    ///     round over all 9 (9 Placed events, the full bounded loop) and 1 wei is burned. Gas of that enter() reported.
    ///     Pots are set by vm.store (slot layout from forge inspect: _rounds = slot 1, pot = first word; liabilities = slot 7),
    ///     with balance and liabilities set to match, since fund() cannot leave a round 1 wei short across 9 rounds.
    function test_place_nineRoundsAtCapMinusOne_gas() public {
        uint256 cap = 1_000e18;
        BlockContest c5 = _capped(cap, 10);
        for (uint256 r; r < 9; ++r) vm.store(address(c5), keccak256(abi.encode(r, uint256(1))), bytes32(cap - 1));
        vm.store(address(c5), bytes32(uint256(7)), bytes32(9 * (cap - 1)));
        tb.mint(address(c5), 9 * (cap - 1));
        assertEq(c5.fundRoom(0), 1); assertEq(c5.fundRoom(8), 1);
        assertEq(tb.balanceOf(address(c5)), c5.liabilities(), "seeded consistently");
        vm.warp(G);
        uint256 dead0 = tb.balanceOf(DEAD);
        uint256 g0 = gasleft();
        vm.prank(alice); c5.enter(blocks[0], _key(blocks[0]));
        uint256 gasUsed = g0 - gasleft();
        emit log_named_uint("enter() gas, fee spread over all 9 rounds + 1 wei burned", gasUsed);
        for (uint256 r; r < 9; ++r) { (uint256 p,,,,,) = c5.roundInfo(r); assertEq(p, cap, "each round filled to MAX_POT"); }
        assertEq(tb.balanceOf(DEAD) - dead0, 1, "the 10th wei fits nowhere: burned");
        assertEq(tb.balanceOf(address(c5)), c5.liabilities());
        assertLt(gasUsed, 500_000, "bounded");
    }

    function test_gasReserve_tightGasRevertsSettle_notDeferred() public {
        vm.prank(funder); c.fund(0, 1_000_000e18);
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        _toVote(0);
        _vote(voter, 0, a, MINV);
        _toEnd(0);
        // find a gas limit where settle reaches the payout with < reserve left: try a range, none may end with a credit
        uint256 deferredSeen;
        for (uint256 g = 60_000; g <= 400_000; g += 10_000) {
            uint256 snap = vm.snapshotState();
            (bool ok,) = address(c).call{gas: g}(abi.encodeCall(BlockContest.settle, (0)));
            if (ok && c.claimable(alice) != 0) deferredSeen++;
            vm.revertToState(snap);
        }
        assertEq(deferredSeen, 0, "no gas limit leads to a deferred payout");
        uint256 a0 = tb.balanceOf(alice);
        c.settle(0); // with normal gas: paid directly
        assertGt(tb.balanceOf(alice), a0);
        assertEq(c.claimable(alice), 0);
    }

    function test_constructor_rejectsBadParams() public {
        BlockContest.Config memory k = BlockContest.Config({
            tblock: address(tb), hook: address(0), genesis: uint64(block.timestamp), entryPeriod: ENTRY, votePeriod: VOTE,
            votePrice: PRICE, entryFee: FEE, burnBps: BURN, split1: 6_000, split2: 2_500, split3: 1_500, minVotes: MINV,
            minVoters: 1, minQualifiedEntries: 1, maxPot: type(uint256).max
        });
        address[] memory p = Pairs7030.list();
        vm.expectRevert(BlockContest.BadParams.selector); new BlockContest(k, p); // zero hook
        k.hook = address(hook);
        k.split3 = 1_400;
        vm.expectRevert(BlockContest.BadParams.selector); new BlockContest(k, p);
        k.split3 = 1_500; k.burnBps = 10_001; // > BPS refused; == BPS (100 % burn) allowed, see BlockContestOwnerConfigTest
        vm.expectRevert(BlockContest.BadParams.selector); new BlockContest(k, p);
        k.burnBps = 10_000; new BlockContest(k, p);
        k.burnBps = BURN; k.votePrice = 0;
        vm.expectRevert(BlockContest.BadParams.selector); new BlockContest(k, p);
        k.votePrice = PRICE; k.genesis = uint64(block.timestamp - 1);
        vm.expectRevert(BlockContest.BadParams.selector); new BlockContest(k, p);
        k.genesis = uint64(block.timestamp); k.split1 = 2_000; k.split2 = 6_500;
        vm.expectRevert(BlockContest.BadParams.selector); new BlockContest(k, p);
        k.split1 = 6_000; k.split2 = 2_500; k.minVotes = 0;
        vm.expectRevert(BlockContest.BadParams.selector); new BlockContest(k, p); // MIN_VOTES 0
        k.minVotes = MINV;
        vm.expectRevert(BlockContest.BadParams.selector); new BlockContest(k, new address[](0)); // empty pair list
        k.minVoters = 0;
        vm.expectRevert(BlockContest.BadParams.selector); new BlockContest(k, p); // MIN_VOTERS 0
        k.minVoters = 1; k.minQualifiedEntries = 0;
        vm.expectRevert(BlockContest.BadParams.selector); new BlockContest(k, p); // quorum 0
        k.minQualifiedEntries = 1;
        new BlockContest(k, p); // and the valid config deploys
    }

    // ---------------------------------------------------------------- SEC-102 the hook says which side is the block
    function test_enter_sideMustBeTheHooksBlock() public {
        vm.warp(G);
        // X: a prefixed B20 that is NOT in the static pair list, but the hook treats it as the PAIRED side of alice's pool
        address x = address(uint160(0xb2000000000000000000) << 80 | 0xcafe);
        assertFalse(c.isPairCurrency(x), "the static list does not know X");
        BlockContest.PoolKey memory k = x < blocks[0]
            ? BlockContest.PoolKey(x, blocks[0], 0, 200, address(hook))
            : BlockContest.PoolKey(blocks[0], x, 0, 200, address(hook));
        hook.setCreator(_id(k), alice);
        (address paired, address blk) = c.sidesOf(k);
        assertEq(blk, blocks[0]); assertEq(paired, x);
        vm.prank(alice);
        vm.expectRevert(BlockContest.NotBlockSide.selector);
        c.enter(x, k); // only cotes() catches this one
        vm.prank(alice); c.enter(blocks[0], k); // the real block side is accepted
    }

    function test_enter_hookAnswerInconsistentOrReverting_refused() public {
        vm.warp(G);
        hook.setLie(true); // hook answers (block, paired) swapped
        vm.prank(alice);
        vm.expectRevert(BlockContest.NotBlockSide.selector);
        c.enter(blocks[0], _key(blocks[0]));
        hook.setLie(false);
        // SEC-203: correct addresses but dirty upper bits in a returned word -> refused, not silently truncated
        hook.setDirty(true);
        vm.prank(alice);
        vm.expectRevert(BlockContest.NotBlockSide.selector);
        c.enter(blocks[0], _key(blocks[0]));
        vm.expectRevert(BlockContest.NotBlockSide.selector);
        c.sidesOf(_key(blocks[0]));
        hook.setDirty(false);
        // two blocks in one key: the hook reverts (PaireNonAdmise) -> NotBlockSide
        BlockContest.PoolKey memory k = BlockContest.PoolKey(blocks[0], blocks[1], 0, 200, address(hook));
        hook.setCreator(_id(k), alice);
        vm.prank(alice);
        vm.expectRevert(BlockContest.NotBlockSide.selector);
        c.enter(blocks[0], k);
    }

    // ---------------------------------------------------------------- fuzz: incremental top-3 == brute force
    function testFuzz_top3MatchesBruteForce(uint8[24] memory picks, uint8[24] memory amounts) public {
        // 5 entries (voter2 is the hook-recorded creator of blocks[4])
        vm.warp(G);
        _enter(alice, blocks[0]); _enter(bob, blocks[1]); _enter(carol, blocks[2]); _enter(dave, blocks[3]); _enter(voter2, blocks[4]);
        _toVote(0);
        uint256[5] memory v;
        for (uint256 i; i < 24; ++i) {
            uint256 id = picks[i] % 5;
            uint256 n = uint256(amounts[i] % 4); // 0 = skip, keeps many ties
            if (n == 0) continue;
            _vote(voter, 0, id, n);
            v[id] += n;
        }
        // brute force: order by votes desc, id asc, only voted entries
        uint256[3] memory want; uint256 wn;
        bool[5] memory used;
        for (uint256 place; place < 3; ++place) {
            uint256 best = type(uint256).max;
            for (uint256 id; id < 5; ++id) {
                if (used[id] || v[id] < MINV) continue; // podium = qualified entries only (MIN_VOTERS 1 in this suite)
                if (best == type(uint256).max || v[id] > v[best]) best = id;
            }
            if (best == type(uint256).max) break;
            used[best] = true; want[wn++] = best;
        }
        (,,,, uint256[3] memory top, uint256 n2) = c.roundInfo(0);
        assertEq(n2, wn, "count");
        for (uint256 i; i < wn; ++i) assertEq(top[i], want[i], "place");
    }
}
