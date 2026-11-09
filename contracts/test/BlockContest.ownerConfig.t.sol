// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockContest} from "../src/BlockContest.sol";
import {Pairs7030} from "./Pairs7030.sol";
import {ContestToken, MockHook} from "./BlockContest.t.sol";

/// @notice The OWNER'S config: votes 100 % burned (BURN_BPS = 10000), winner takes all (10000/0/0), an entry qualifies with
///         >= 3 votes from >= 3 distinct addresses, a round pays only if >= 2 entries qualify. The pot is only funding + entry
///         fees; votes are pure buy pressure.
contract BlockContestOwnerConfigTest is Test {
    event Voted(uint256 indexed round, uint256 indexed entryId, address indexed voter, uint256 votes, uint256 toPot, uint256 burned);

    BlockContest c;
    ContestToken tb;
    MockHook hook;

    uint256 constant PRICE = 8_621e18;   // ~$0.05 at $0.0000058
    uint256 constant FEE = 17_241e18;    // ~$0.10
    uint256 constant FUND = 862_000e18;  // ~$5
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint64 G;

    address funder = makeAddr("funder");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address[6] v; // voters
    address[3] blocks;

    function setUp() public {
        vm.warp(1_800_000_000);
        G = uint64(block.timestamp + 1 hours);
        tb = new ContestToken();
        hook = new MockHook();
        c = new BlockContest(BlockContest.Config({
            tblock: address(tb), hook: address(hook), genesis: G, entryPeriod: 3 days, votePeriod: 4 days, votePrice: PRICE,
            entryFee: FEE, burnBps: 10_000, split1: 10_000, split2: 0, split3: 0, minVotes: 3, minVoters: 3, minQualifiedEntries: 2, maxPot: 862_000e18
        }), Pairs7030.list());
        for (uint256 i; i < 6; ++i) v[i] = makeAddr(string(abi.encodePacked("voter", vm.toString(i))));
        address[10] memory people = [funder, alice, bob, carol, v[0], v[1], v[2], v[3], v[4], v[5]];
        for (uint256 i; i < people.length; ++i) {
            tb.mint(people[i], 100_000_000e18);
            vm.prank(people[i]); tb.approve(address(c), type(uint256).max);
        }
        address[3] memory who = [alice, bob, carol];
        for (uint160 i; i < 3; ++i) {
            blocks[i] = address(uint160(0xb2000000000000000000) << 80 | (0x2000 + i));
            hook.setBlock(blocks[i], true);
            hook.setCreator(_id(_key(blocks[i])), who[i]);
        }
    }

    function _key(address blk) internal view returns (BlockContest.PoolKey memory) {
        return BlockContest.PoolKey(address(0), blk, 0, 200, address(hook));
    }
    function _id(BlockContest.PoolKey memory k) internal pure returns (bytes32) { return keccak256(abi.encode(k)); }
    function _enter(address who, address blk) internal returns (uint256 id) { vm.prank(who); id = c.enter(blk, _key(blk)); }
    function _vote(address who, uint256 id, uint256 n) internal { vm.prank(who); c.vote(0, id, n); }
    /// n votes, one each from voters v[0..n-1] (n distinct addresses)
    function _spread(uint256 id, uint256 n) internal { for (uint256 i; i < n; ++i) _vote(v[i], id, 1); }
    function _pot(uint256 r) internal view returns (uint256 p) { (p,,,,,) = c.roundInfo(r); }
    function _solvent() internal view { assertEq(tb.balanceOf(address(c)), c.liabilities(), "balance == liabilities"); }

    function test_config_values() public view {
        assertEq(c.BURN_BPS(), 10_000);
        assertEq(c.SPLIT1(), 10_000); assertEq(c.SPLIT2(), 0); assertEq(c.SPLIT3(), 0);
        assertEq(c.MIN_VOTES(), 3); assertEq(c.MIN_VOTERS(), 3); assertEq(c.MIN_QUALIFIED_ENTRIES(), 2);
        assertEq(c.MAX_FUND_AHEAD(), 8);
    }

    function test_vote_burnsExactly_nTimesPrice_potAndLiabilitiesUnchanged() public {
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        vm.warp(c.voteStart(0));
        uint256 pot0 = _pot(0); uint256 liab0 = c.liabilities(); uint256 bal0 = tb.balanceOf(address(c));
        uint256 dead0 = tb.balanceOf(DEAD); uint256 v0 = tb.balanceOf(v[0]);
        vm.expectEmit(true, true, true, true, address(c));
        emit Voted(0, a, v[0], 7, 0, 7 * PRICE);
        _vote(v[0], a, 7);
        assertEq(tb.balanceOf(DEAD) - dead0, 7 * PRICE, "dead gets exactly n * VOTE_PRICE");
        assertEq(v0 - tb.balanceOf(v[0]), 7 * PRICE, "voter pays exactly n * VOTE_PRICE");
        assertEq(_pot(0), pot0, "pot unchanged by votes");
        assertEq(c.liabilities(), liab0, "liabilities unchanged by votes");
        assertEq(tb.balanceOf(address(c)), bal0, "contract balance unchanged by votes");
        _solvent();
    }

    function test_vote_rejectsTokenThatShortChangesTheBurn() public {
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        vm.warp(c.voteStart(0));
        tb.setFee(1);
        vm.prank(v[0]);
        vm.expectRevert(BlockContest.TransferFailed.selector);
        c.vote(0, a, 3);
    }

    // ---------------------------------------------------------------- MIN_VOTERS
    function test_threeVotesFromOneAddress_notQualified() public {
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        vm.warp(c.voteStart(0));
        _vote(v[0], a, 1); _vote(v[0], a, 1); _vote(v[0], a, 1); // 3 votes, 1 address
        BlockContest.Entry memory e = c.entryOf(0, a);
        assertEq(e.votes, 3); assertEq(e.voters, 1); assertFalse(e.qualified);
        _vote(v[0], a, 10); // even 13 votes from one address
        assertFalse(c.entryOf(0, a).qualified);
        assertEq(c.qualifiedCount(0), 0);
        (,,,,, uint256 podium) = c.roundInfo(0);
        assertEq(podium, 0, "an unqualified entry is never on the podium");
    }

    function test_threeVotesFromThreeAddresses_qualified() public {
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        vm.warp(c.voteStart(0));
        _spread(a, 2);
        assertFalse(c.entryOf(0, a).qualified, "2 voters: not yet");
        _vote(v[2], a, 1);
        BlockContest.Entry memory e = c.entryOf(0, a);
        assertEq(e.votes, 3); assertEq(e.voters, 3); assertTrue(e.qualified);
        assertEq(c.qualifiedCount(0), 1);
        _vote(v[0], a, 1); // a repeat voter does not count twice
        assertEq(c.entryOf(0, a).voters, 3);
        assertEq(c.qualifiedCount(0), 1, "qualifies once");
    }

    function test_threeVotesTwoVoters_notQualified() public {
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        vm.warp(c.voteStart(0));
        _vote(v[0], a, 2); _vote(v[1], a, 1);
        assertFalse(c.entryOf(0, a).qualified, "3 votes, 2 voters");
    }

    // ---------------------------------------------------------------- quorum MIN_QUALIFIED_ENTRIES = 2
    function test_singleEntrantWithTenVotes_noPayout_rollsOver() public {
        vm.prank(funder); c.fund(0, FUND);
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        vm.warp(c.voteStart(0));
        _spread(a, 5); _vote(v[0], a, 5); // 10 votes, 5 voters: qualified, but alone
        assertTrue(c.entryOf(0, a).qualified);
        uint256 pot = _pot(0);
        uint256 a0 = tb.balanceOf(alice);
        vm.warp(c.roundEnd(0));
        c.settle(0);
        assertEq(tb.balanceOf(alice), a0, "quorum not met: no payout");
        assertEq(_pot(2), pot, "everything rolls to currentRound() + 1");
        _solvent();
    }

    function test_twoQualifiedEntrants_winnerTakesWholePot() public {
        vm.prank(funder); c.fund(0, FUND);
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        uint256 b = _enter(bob, blocks[1]);
        vm.warp(c.voteStart(0));
        _spread(a, 3);
        _spread(b, 4);
        uint256 pot = _pot(0);
        assertEq(pot, FUND, "pot capped at MAX_POT = funding: entry fees on the full pot were burned");
        uint256 a0 = tb.balanceOf(alice); uint256 b0 = tb.balanceOf(bob);
        vm.warp(c.roundEnd(0));
        c.settle(0);
        assertEq(tb.balanceOf(bob) - b0, pot, "winner (4 votes) takes the WHOLE pot");
        assertEq(tb.balanceOf(alice), a0, "2nd: share 0");
        assertEq(_pot(2), 0, "nothing rolled");
        assertEq(_pot(1), 2 * FEE, "the entry fees did not fit round 0: they went to round 1, not to DEAD");
        assertEq(tb.balanceOf(address(c)), 2 * FEE); assertEq(c.liabilities(), 2 * FEE);
        _solvent();
    }

    function test_rankingByTotalVotes_unqualifiedWhaleCannotBlockOrWin() public {
        vm.prank(funder); c.fund(0, FUND);
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        uint256 b = _enter(bob, blocks[1]);
        uint256 cc = _enter(carol, blocks[2]);
        vm.warp(c.voteStart(0));
        _vote(v[5], cc, 50);              // carol: 50 votes, 1 address -> not qualified
        _spread(a, 3);                    // alice: 3 votes / 3 voters
        _spread(b, 3); _vote(v[4], b, 2); // bob: 5 votes / 4 voters -> more TOTAL votes than alice
        (,,,, uint256[3] memory top, uint256 n) = c.roundInfo(0);
        assertEq(n, 2); assertEq(top[0], b); assertEq(top[1], a); // ranked by total votes among qualified
        uint256 pot = _pot(0);
        uint256 b0 = tb.balanceOf(bob); uint256 c0 = tb.balanceOf(carol);
        vm.warp(c.roundEnd(0));
        c.settle(0);
        assertEq(tb.balanceOf(bob) - b0, pot, "bob wins on total votes");
        assertEq(tb.balanceOf(carol), c0, "the 50-vote single-wallet entry gets nothing");
        _solvent();
    }

    function test_tieAmongQualified_earlierEntryWins() public {
        vm.prank(funder); c.fund(0, FUND);
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        uint256 b = _enter(bob, blocks[1]);
        vm.warp(c.voteStart(0));
        _spread(b, 3); _spread(a, 3);
        uint256 a0 = tb.balanceOf(alice);
        vm.warp(c.roundEnd(0));
        c.settle(0);
        assertEq(tb.balanceOf(alice) - a0, FUND, "equal votes: lower entry id wins (pot capped at FUND)");
    }

    function test_selfVoteRecoversNothing() public {
        // alice and bob both qualify; alice adds 3 more self-votes and wins: she pays 3 * PRICE, all burned
        vm.prank(funder); c.fund(0, FUND);
        vm.warp(G);
        uint256 aStart = tb.balanceOf(alice);
        uint256 a = _enter(alice, blocks[0]);
        _enter(bob, blocks[1]);
        vm.warp(c.voteStart(0));
        _spread(a, 3); _spread(1, 3);
        _vote(alice, a, 3);
        vm.warp(c.roundEnd(0));
        c.settle(0);
        // alice: - entry fee - 3 * PRICE (burned) + pot (FUND; both entry fees were burned, the pot was already at MAX_POT)
        assertEq(tb.balanceOf(alice), aStart - FEE - 3 * PRICE + FUND);
        _solvent();
    }

    /// gas of vote() under the owner's config, on the mock token (the real TBLOCK transfer cost is measured in the fork test)
    function test_gas_vote() public {
        vm.warp(G);
        uint256 a = _enter(alice, blocks[0]);
        uint256 b = _enter(bob, blocks[1]);
        vm.warp(c.voteStart(0));
        vm.prank(v[0]); uint256 g0 = gasleft(); c.vote(0, a, 1); uint256 gFirst = g0 - gasleft();
        vm.prank(v[0]); g0 = gasleft(); c.vote(0, a, 1); uint256 gRepeat = g0 - gasleft();
        _vote(v[1], a, 1);
        vm.prank(v[2]); g0 = gasleft(); c.vote(0, a, 1); uint256 gQualify = g0 - gasleft(); // qualifies + joins the podium
        _spread(b, 3);
        vm.prank(v[3]); g0 = gasleft(); c.vote(0, a, 1); uint256 gPodium = g0 - gasleft(); // re-rank a podium of 2
        emit log_named_uint("vote() gas, first vote of an address for an entry", gFirst);
        emit log_named_uint("vote() gas, repeat voter", gRepeat);
        emit log_named_uint("vote() gas, the vote that qualifies the entry", gQualify);
        emit log_named_uint("vote() gas, qualified entry, podium of 2", gPodium);
        assertLt(gFirst, 200_000); assertLt(gQualify, 250_000);
    }

    // ---------------------------------------------------------------- SEC-201 MAX_POT (spill to rounds with room, clip fund)
    event Burned(uint256 indexed round, uint256 amount, bytes32 reason);
    event Placed(uint256 indexed round, uint256 amount, bytes32 reason);
    event BurnDeferred(uint256 indexed round, uint256 amount, bytes32 reason);

    function _fundFull(uint256 from, uint256 to) internal { for (uint256 r = from; r <= to; ++r) { vm.prank(funder); c.fund(r, FUND); } }
    /// fills every round of the placement window (current .. current + MAX_FUND_AHEAD) to MAX_POT. fund() only reaches 2 rounds
    /// ahead (SEC-301), so the window is filled the other legitimate way: a plain transfer + sweepSurplus(), placed exactly.
    function _fillWindow() internal {
        uint256 cur = c.currentRound(); uint256 total;
        for (uint256 k = cur; k <= cur + c.MAX_FUND_AHEAD(); ++k) total += c.fundRoom(k);
        if (total == 0) return;
        tb.mint(address(c), total);
        c.sweepSurplus();
    }

    /// (3) fund() is clipped to the room: a 1-wei pre-fund or an entry fee cannot make the owner's call revert, and he never
    ///     pays more than the room.
    function test_fund_clippedToRoom_griefingCannotBlockOwner() public {
        assertEq(c.MAX_POT(), FUND);
        uint256 dead0 = tb.balanceOf(DEAD);
        // a griefer pre-funds 1 wei
        vm.prank(alice); c.fund(0, 1);
        uint256 f0 = tb.balanceOf(funder);
        vm.prank(funder); c.fund(0, FUND); // the owner's usual call: clipped, not reverted
        assertEq(_pot(0), FUND);
        assertEq(f0 - tb.balanceOf(funder), FUND - 1, "owner paid exactly the room");
        // a full round: only then does fund() revert
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(BlockContest.PotFull.selector, 0, 0));
        c.fund(0, 1);
        // an entry fee lands in round 1 (round 0 is full) before the owner funds round 1 with the room he read earlier
        uint256 previousRoom = c.fundRoom(1);
        assertEq(previousRoom, FUND);
        vm.warp(G);
        _enter(alice, blocks[0]);
        assertEq(_pot(1), FEE);
        f0 = tb.balanceOf(funder);
        vm.prank(funder); c.fund(1, previousRoom);
        assertEq(_pot(1), FUND);
        assertEq(f0 - tb.balanceOf(funder), FUND - FEE, "clipped to the room left by the fee");
        assertEq(tb.balanceOf(DEAD), dead0, "nothing burned anywhere");
        _solvent();
    }

    /// (2) an entry fee on a full pot goes to the next round with room, not to DEAD; burned only when all 9 rounds are full.
    function test_cap_entryFeeOnFullPot_goesToNextRoundWithRoom() public {
        _fundFull(0, 0);
        vm.warp(G);
        uint256 dead0 = tb.balanceOf(DEAD);
        vm.expectEmit(true, false, false, true, address(c));
        emit Placed(1, FEE, "ENTRY_FEE");
        _enter(alice, blocks[0]);
        assertEq(_pot(0), FUND); assertEq(_pot(1), FEE);
        assertEq(tb.balanceOf(DEAD), dead0, "not burned");
        _solvent();
        // now rounds 1..8 full too (current = 0): the next fee fits nowhere -> burned exactly
        _fillWindow(); // rounds 1..8 to MAX_POT
        vm.expectEmit(true, false, false, true, address(c));
        emit Burned(0, FEE, "ENTRY_FEE");
        _enter(bob, blocks[1]);
        assertEq(tb.balanceOf(DEAD) - dead0, FEE, "burned only because all 9 rounds were full");
        for (uint256 q; q < 10; ++q) assertLe(_pot(q), FUND);
        _solvent();
    }

    /// (2) quiet rounds: the owner keeps the 2-round funding window full every week (fund(r, FUND), clipped), nobody plays,
    ///     for 8 rounds. Every rollover finds a round with room -> NOTHING of the owner's funding is burned, no round ever
    ///     exceeds MAX_POT, and everything he paid is still in the contract.
    function test_cap_quietRounds_ownerFundingNeverBurned() public {
        uint256 dead0 = tb.balanceOf(DEAD);
        uint256 f0 = tb.balanceOf(funder);
        uint256 burnedWeeks;
        for (uint256 r; r < 14; ++r) {
            uint256 cur = c.currentRound();
            for (uint256 k = cur; k <= cur + c.FUND_AHEAD_MAX(); ++k) {
                if (c.fundRoom(k) != 0) { vm.prank(funder); c.fund(k, FUND); } // the owner's weekly script
            }
            vm.warp(c.roundEnd(r));
            // are the 8 rounds a rollover can reach (currentRound()+1 .. +8) all at MAX_POT right now?
            uint256 to = c.currentRound() + 1;
            bool allFull = true;
            for (uint256 k = to; k < to + 8; ++k) if (c.fundRoom(k) != 0) { allFull = false; break; }
            uint256 d0 = tb.balanceOf(DEAD);
            uint256 potR = _pot(r);
            c.settle(r);
            uint256 burnedNow = tb.balanceOf(DEAD) - d0;
            if (!allFull) assertEq(burnedNow, 0, "owner funding burned while a future round had room");
            else { assertEq(burnedNow, potR, "all 8 full: the quiet pot is burned, exactly"); burnedWeeks++; }
            if (r < 5) assertEq(burnedNow, 0, "first five quiet weeks: nothing burned");
            for (uint256 q; q < 30; ++q) assertLe(_pot(q), c.MAX_POT(), "no round ever exceeds MAX_POT");
            _solvent();
        }
        uint256 paid = f0 - tb.balanceOf(funder);
        uint256 burned = tb.balanceOf(DEAD) - dead0;
        emit log_named_uint("quiet weeks (of 14) whose pot burned because 8 future rounds were full", burnedWeeks);
        assertEq(tb.balanceOf(address(c)) + burned, paid, "every token the owner paid is either in a pot or burned-when-full");
        uint256 sum;
        for (uint256 q; q < 30; ++q) sum += _pot(q);
        assertEq(sum, tb.balanceOf(address(c)), "spread over future rounds, each <= MAX_POT");
    }

    /// (2) the only case the owner's funding burns: all 8 rounds after the current one are already full.
    function test_cap_rolloverBurnsOnlyWhenAll8FutureRoundsFull() public {
        _fundFull(0, 0);                   // the owner funds round 0
        vm.warp(c.roundStart(1));          // == roundEnd(0); current = 1
        _fillWindow();                     // rounds 1..9 full: the 8 future rounds 2..9 included
        uint256 dead0 = tb.balanceOf(DEAD);
        vm.expectEmit(true, false, false, true, address(c));
        emit Burned(0, FUND, "ROLLOVER");
        c.settle(0);
        assertEq(tb.balanceOf(DEAD) - dead0, FUND, "round 0's pot burned: nowhere had room");
        for (uint256 q; q < 12; ++q) assertLe(_pot(q), FUND);
        _solvent();
    }

    /// (4) a token refusing DEAD: enter() still succeeds, the fee that fits nowhere waits in pendingBurn; flushBurn() works
    ///     once DEAD is accepted again. A vote (100 % burn) reverts meanwhile - documented and accepted.
    function test_burnRefused_enterSucceeds_pendingBurn_thenFlush() public {
        _fillWindow(); // rounds 0..8 full
        vm.warp(G);
        tb.setBlocked(DEAD, true);
        uint256 a0 = tb.balanceOf(alice);
        vm.expectEmit(true, false, false, true, address(c));
        emit BurnDeferred(0, FEE, "ENTRY_FEE");
        uint256 a = _enter(alice, blocks[0]);
        assertEq(a0 - tb.balanceOf(alice), FEE, "fee paid");
        assertEq(c.pendingBurn(), FEE);
        _solvent(); // pendingBurn is inside liabilities
        vm.prank(alice);
        vm.expectRevert(BlockContest.TransferFailed.selector);
        c.flushBurn(); // still refused: reverts, pendingBurn kept
        assertEq(c.pendingBurn(), FEE);
        vm.warp(c.voteStart(0));
        vm.prank(v[0]);
        vm.expectRevert(BlockContest.TransferFailed.selector);
        c.vote(0, a, 1); // 100 % burn, DEAD refused: the vote reverts (accepted, see NatSpec)
        tb.setBlocked(DEAD, false);
        uint256 dead0 = tb.balanceOf(DEAD);
        vm.prank(bob); c.flushBurn(); // anyone
        assertEq(tb.balanceOf(DEAD) - dead0, FEE);
        assertEq(c.pendingBurn(), 0);
        _solvent();
        vm.expectRevert(BlockContest.NothingToBurn.selector);
        c.flushBurn();
    }

    // ---------------------------------------------------------------- SEC-202 fuzz: podium with distinct voters
    function testFuzz_podiumMatchesBruteForce_distinctVoters(uint8[30] memory picks) public {
        vm.warp(G);
        _enter(alice, blocks[0]); _enter(bob, blocks[1]); _enter(carol, blocks[2]);
        vm.warp(c.voteStart(0));
        uint256[3] memory votes;
        bool[3][3] memory seen; // seen[entry][voter]
        for (uint256 i; i < 30; ++i) {
            uint256 p = picks[i];
            uint256 id = p % 3; uint256 who = (p / 3) % 3; uint256 n = (p / 9) % 3; // 3 voter addresses, 0..2 votes
            if (n == 0) continue;
            _vote(v[who], id, n);
            votes[id] += n; seen[id][who] = true;
        }
        bool[3] memory q;
        uint256 qc;
        for (uint256 id; id < 3; ++id) {
            uint256 dv = (seen[id][0] ? 1 : 0) + (seen[id][1] ? 1 : 0) + (seen[id][2] ? 1 : 0);
            q[id] = votes[id] >= 3 && dv >= 3;
            if (q[id]) qc++;
            assertEq(c.entryOf(0, id).voters, dv, "distinct voters");
            assertEq(c.entryOf(0, id).qualified, q[id], "qualified");
        }
        assertEq(c.qualifiedCount(0), qc);
        uint256[3] memory want; uint256 wn; bool[3] memory used;
        for (uint256 place; place < 3; ++place) {
            uint256 best = type(uint256).max;
            for (uint256 id; id < 3; ++id) {
                if (used[id] || !q[id]) continue;
                if (best == type(uint256).max || votes[id] > votes[best]) best = id;
            }
            if (best == type(uint256).max) break;
            used[best] = true; want[wn++] = best;
        }
        (,,,, uint256[3] memory top, uint256 n2) = c.roundInfo(0);
        assertEq(n2, wn, "podium size");
        for (uint256 i; i < wn; ++i) assertEq(top[i], want[i], "podium place");
    }
}
