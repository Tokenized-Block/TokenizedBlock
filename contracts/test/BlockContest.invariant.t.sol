// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockContest} from "../src/BlockContest.sol";
import {Pairs7030} from "./Pairs7030.sol";
import {ContestToken, MockHook} from "./BlockContest.t.sol";

/// @dev drives BlockContest through random sequences of every state-changing entry point. Expected reverts are swallowed
///      (try/catch); `ok[...]` counts the calls that actually changed state, so the run can be shown not to be vacuous.
contract ContestHandler is Test {
    BlockContest public c;
    ContestToken public tb;
    MockHook public hook;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address[3] public entrants;
    address[3] public blocks;
    address[3] public voters;
    address public funder = makeAddr("inv-funder");
    mapping(bytes32 => uint256) public ok;
    /// BurnDeferred events seen, by reason ("ENTRY_FEE", "SURPLUS", "ROLLOVER"), read from the recorded logs
    mapping(bytes32 => uint256) public deferred;
    bytes32 constant DEFERRED_SIG = keccak256("BurnDeferred(uint256,uint256,bytes32)");
    bool public deadRefused;

    constructor(BlockContest c_, ContestToken tb_, MockHook hook_, address[3] memory entrants_, address[3] memory blocks_) {
        c = c_; tb = tb_; hook = hook_; entrants = entrants_; blocks = blocks_;
        for (uint256 i; i < 3; ++i) voters[i] = makeAddr(string(abi.encodePacked("inv-voter", vm.toString(i))));
        address[7] memory all = [entrants[0], entrants[1], entrants[2], voters[0], voters[1], voters[2], funder];
        for (uint256 i; i < all.length; ++i) {
            tb.mint(all[i], 1e30);
            vm.prank(all[i]); tb.approve(address(c), type(uint256).max);
        }
    }

    function _key(address blk) internal view returns (BlockContest.PoolKey memory) {
        return BlockContest.PoolKey(address(0), blk, 0, 200, address(hook));
    }

    function warp(uint256 dt) external { vm.warp(block.timestamp + bound(dt, 0, 3 days)); ok["warp"]++; }

    function fund(uint256 rSeed, uint256 amount) external {
        uint256 r = c.currentRound() + (rSeed % 4); // includes one round past FUND_AHEAD_MAX (expected RoundTooFar)
        amount = bound(amount, 1, c.MAX_POT() * 2);
        vm.prank(funder);
        try c.fund(r, amount) { ok["fund"]++; } catch {}
    }

    function _scan() internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(c) && logs[i].topics.length != 0 && logs[i].topics[0] == DEFERRED_SIG) {
                (, bytes32 reason) = abi.decode(logs[i].data, (uint256, bytes32));
                deferred[reason]++;
            }
        }
    }

    function enter(uint256 who) external {
        uint256 i = who % 3;
        vm.recordLogs();
        vm.prank(entrants[i]);
        try c.enter(blocks[i], _key(blocks[i])) { ok["enter"]++; } catch {}
        _scan();
    }

    function vote(uint256 voterSeed, uint256 entrySeed, uint256 n) external {
        uint256 r = c.currentRound();
        uint256 count = c.entryCount(r);
        if (count == 0) return;
        vm.prank(voters[voterSeed % 3]);
        try c.vote(r, entrySeed % count, bound(n, 1, 3)) { ok["vote"]++; } catch {}
    }

    function sweep(uint256 amount) external {
        amount = bound(amount, 0, c.MAX_POT() * 12); // can exceed the 9-round window, so random runs also reach deferrals
        if (amount != 0) tb.mint(address(c), amount);
        vm.recordLogs();
        try c.sweepSurplus() { ok["sweep"]++; } catch {}
        _scan();
    }

    function settle(uint256 rSeed) external {
        uint256 r = rSeed % (c.currentRound() + 1);
        vm.recordLogs();
        try c.settle(r) { ok["settle"]++; } catch {}
        _scan();
    }

    function claim(uint256 who, uint256 toSeed) external {
        address payee = entrants[who % 3];
        address to = toSeed % 2 == 0 ? payee : makeAddr("inv-cold");
        vm.prank(payee);
        try c.claim(to) { ok["claim"]++; } catch {}
    }

    function flush() external { try c.flushBurn() { ok["flush"]++; } catch {} }

    /// SEC-404: 0 normal, 1 partial, 2 false/no move, 3 false/moves, 4 debit+1 (makes burns revert: expected, swallowed)
    function toggleDeadMode(uint8 mode) external { tb.setDeadMode(mode % 5); ok["toggleDeadMode"]++; }

    function toggleDead(bool refuse) external { tb.setBlocked(DEAD, refuse); deadRefused = refuse; ok["toggleDead"]++; }

    function togglePayee(uint256 who, bool refuse) external { tb.setBlocked(entrants[who % 3], refuse); ok["togglePayee"]++; }
}

contract BlockContestInvariantTest is Test {
    BlockContest c;
    ContestToken tb;
    MockHook hook;
    ContestHandler h;
    address[3] entrants;

    function setUp() public {
        vm.warp(1_800_000_000);
        tb = new ContestToken();
        hook = new MockHook();
        // small numbers so pots fill, spill, roll over, pay, defer and claim within a short run
        c = new BlockContest(BlockContest.Config({
            tblock: address(tb), hook: address(hook), genesis: uint64(block.timestamp + 1 hours), entryPeriod: 1 days,
            votePeriod: 1 days, votePrice: 1_000e18, entryFee: 500e18, burnBps: 2_000, split1: 6_000, split2: 2_500,
            split3: 1_500, minVotes: 2, minVoters: 2, minQualifiedEntries: 1, maxPot: 5_000e18
        }), Pairs7030.list());
        address[3] memory blocks;
        for (uint160 i; i < 3; ++i) {
            entrants[i] = makeAddr(string(abi.encodePacked("inv-entrant", vm.toString(uint256(i)))));
            blocks[i] = address(uint160(0xb2000000000000000000) << 80 | (0x3000 + i));
            hook.setBlock(blocks[i], true);
            hook.setCreator(keccak256(abi.encode(BlockContest.PoolKey(address(0), blocks[i], 0, 200, address(hook)))), entrants[i]);
        }
        h = new ContestHandler(c, tb, hook, entrants, blocks);
        targetContract(address(h));
    }

    /// liabilities == sum of pots of unsettled rounds + sum of claimable + pendingBurn, and balance >= liabilities.
    /// Settled rounds have pot 0 and no pot can sit beyond currentRound() + MAX_FUND_AHEAD, so summing 0 .. current+9 is exact.
    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 60
    function invariant_liabilitiesExact_andCovered() public view {
        uint256 last = c.currentRound() + c.MAX_FUND_AHEAD() + 1;
        uint256 pots;
        for (uint256 r; r <= last; ++r) { (uint256 p,,,,,) = c.roundInfo(r); pots += p; }
        uint256 claims = c.claimable(entrants[0]) + c.claimable(entrants[1]) + c.claimable(entrants[2]);
        assertEq(c.liabilities(), pots + claims + c.pendingBurn(), "liabilities == pots + claimable + pendingBurn");
        assertGe(tb.balanceOf(address(c)), c.liabilities(), "balance >= liabilities");
    }

    /// no pot ever above MAX_POT
    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 60
    function invariant_noPotAboveCap() public view {
        uint256 last = c.currentRound() + c.MAX_FUND_AHEAD() + 1;
        for (uint256 r; r <= last; ++r) { (uint256 p,,,,,) = c.roundInfo(r); assertLe(p, c.MAX_POT()); }
    }

    function _check(string memory step) internal view {
        uint256 last = c.currentRound() + c.MAX_FUND_AHEAD() + 1;
        uint256 pots;
        for (uint256 r; r <= last; ++r) { (uint256 p,,,,,) = c.roundInfo(r); pots += p; assertLe(p, c.MAX_POT(), step); }
        uint256 claims = c.claimable(entrants[0]) + c.claimable(entrants[1]) + c.claimable(entrants[2]);
        assertEq(c.liabilities(), pots + claims + c.pendingBurn(), step);
        assertGe(tb.balanceOf(address(c)), c.liabilities(), step);
    }

    /// The random runs above only log the LAST run's counts, so they do not prove every path was reached. This scripted
    /// sequence drives the SAME handler through every path - spill, payout, claimable + redirected claim, deferred burn,
    /// flush - and checks the invariant after each step (stimulus proved by the asserted effects).
    function test_handlerScript_everyPath_invariantHoldsEachStep() public {
        address DEAD = 0x000000000000000000000000000000000000dEaD;
        h.fund(0, 5_000e18); _check("fund r0");
        h.fund(1, 5_000e18); _check("fund r1");
        h.fund(2, 5_000e18); _check("fund r2");
        h.fund(3, 1e18); _check("fund r3 refused (RoundTooFar)");
        assertEq(h.ok("fund"), 3, "the 4th fund call did not succeed");
        { (uint256 p3,,,,,) = c.roundInfo(3); assertEq(p3, 0, "round 3 untouched"); }
        vm.prank(h.funder());
        vm.expectRevert(BlockContest.RoundTooFar.selector);
        c.fund(3, 1e18); // and the reason is RoundTooFar
        vm.warp(c.roundStart(0));
        h.enter(0); h.enter(1); _check("2 entries, fees spilled (r0 full)");
        assertEq(c.entryCount(0), 2);
        { (uint256 p0,,,,,) = c.roundInfo(0); assertEq(p0, c.MAX_POT(), "round 0 stayed at MAX_POT"); }
        { (uint256 p3,,,,,) = c.roundInfo(3); assertEq(p3, 2 * c.ENTRY_FEE(), "both fees spilled past full rounds 0..2 into round 3"); }
        vm.warp(c.voteStart(0));
        h.vote(0, 0, 2); h.vote(1, 0, 1); h.vote(0, 1, 1); h.vote(2, 1, 1); _check("votes, entries qualify");
        assertEq(c.qualifiedCount(0), 2);
        h.togglePayee(0, true); // the winner's address is refused by the token
        vm.warp(c.roundEnd(0));
        h.settle(0); _check("settle r0: 1st deferred to claimable, 2nd paid");
        assertGt(c.claimable(entrants[0]), 0, "claimable path reached");
        h.claim(0, 1); _check("claim redirected to a cold address");
        assertEq(c.claimable(entrants[0]), 0, "claim path reached");
        h.toggleDead(true);
        tb.mint(address(c), 60_000e18); // more than the 9-round window can hold (9 x 5,000e18)
        h.sweep(0); _check("big surplus: fills the window, the rest deferred (DEAD refused)");
        assertGt(c.pendingBurn(), 0, "deferred-burn path reached");
        h.flush(); _check("flush while refused: no-op (reverted)");
        assertGt(c.pendingBurn(), 0);
        h.toggleDead(false);
        uint256 d0 = tb.balanceOf(DEAD);
        h.flush(); _check("flush accepted");
        assertEq(c.pendingBurn(), 0, "flush path reached");
        assertGt(tb.balanceOf(DEAD), d0);
        for (uint256 r = 1; r < 4; ++r) { vm.warp(c.roundEnd(r)); h.settle(r); _check("quiet settles"); }
        assertGe(h.deferred("SURPLUS"), 1, "SURPLUS deferral reached");

        // ENTRY_FEE deferral: DEAD refused, the whole window (4..12) full, an entry fee fits nowhere
        assertEq(c.currentRound(), 4);
        h.toggleDead(true);
        tb.mint(address(c), 60_000e18);
        h.sweep(0); _check("window 4..12 filled, rest deferred");
        h.enter(2); _check("entry with the window full and DEAD refused");
        assertEq(c.entryCount(4), 1);
        assertGe(h.deferred("ENTRY_FEE"), 1, "ENTRY_FEE deferral reached");

        // ROLLOVER deferral: round 4 (full pot, 1 entry, no votes -> no quorum) settles while 6..13 are all full
        vm.warp(c.roundEnd(4)); // current = 5
        tb.mint(address(c), 60_000e18);
        h.sweep(0); _check("window 5..13 filled");
        h.settle(4); _check("settle r4: rollover fits nowhere, DEAD refused");
        assertGe(h.deferred("ROLLOVER"), 1, "ROLLOVER deferral reached");
        h.toggleDead(false);
        h.flush(); _check("final flush");
        assertEq(c.pendingBurn(), 0);
        emit log_named_uint("script: deferred SURPLUS", h.deferred("SURPLUS"));
        emit log_named_uint("script: deferred ENTRY_FEE", h.deferred("ENTRY_FEE"));
        emit log_named_uint("script: deferred ROLLOVER", h.deferred("ROLLOVER"));
        emit log_named_uint("script: ok fund", h.ok("fund"));
        emit log_named_uint("script: ok settle", h.ok("settle"));
        emit log_named_uint("script: ok claim", h.ok("claim"));
        emit log_named_uint("script: ok flush", h.ok("flush"));
    }

    function afterInvariant() external {
        emit log_named_uint("ok fund", h.ok("fund"));
        emit log_named_uint("ok enter", h.ok("enter"));
        emit log_named_uint("ok vote", h.ok("vote"));
        emit log_named_uint("ok sweep", h.ok("sweep"));
        emit log_named_uint("ok settle", h.ok("settle"));
        emit log_named_uint("ok claim", h.ok("claim"));
        emit log_named_uint("ok flush", h.ok("flush"));
        emit log_named_uint("ok toggleDeadMode", h.ok("toggleDeadMode"));
        emit log_named_uint("deferred SURPLUS (this run)", h.deferred("SURPLUS"));
        emit log_named_uint("deferred ENTRY_FEE (this run)", h.deferred("ENTRY_FEE"));
        emit log_named_uint("deferred ROLLOVER (this run)", h.deferred("ROLLOVER"));
        emit log_named_uint("pendingBurn at end", c.pendingBurn());
    }
}
