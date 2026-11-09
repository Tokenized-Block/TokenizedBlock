// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockContest} from "../src/BlockContest.sol";
import {Pairs7030} from "./Pairs7030.sol";

interface IB20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

/// @notice Full round against the REAL TBLOCK (a B20, code 0xef) and the REAL hook 7030 on a LOCAL fork. Never broadcasts.
/// Run (B20 code only executes under the Base build of foundry):
///   base-anvil --fork-url https://mainnet.base.org --port 8655
///   FOUNDRY_BASE=true <base-v1.1.1>/forge test --match-path test/BlockContest.fork.t.sol --fork-url http://127.0.0.1:8655 -vv
/// Skipped (not failed) when not on a Base fork.
contract BlockContestForkTest is Test {
    address constant TBLOCK = 0xB200000000000000000000BA9BF8330307f8830E;
    address constant HOLDER = 0x37Eb9b7ce0b51Fe12fBf092026e001918128580A; // ~14M TBLOCK on mainnet; impersonated on the FORK only
    /// copied from D:/tmp/wt-tblock/hook-7030-descripteur.js:11 (DESCRIPTEUR_7030.adresse == tokenomics.js HOOK_7030)
    address constant HOOK_7030 = 0x32F3f572Dd17625bAb9035789C953E1d001864cc;
    address constant UNIT = 0xb2000000000000000000007AFa7ed748B0874f27;     // an app block, paired with native ETH on 7030
    address constant UNIT_CREATOR = 0x31e0DBc9038C82184B9fa6a90057a3ED500BdE3B; // first word of HOOK_7030.createurs(UNIT poolId)
    bytes32 constant UNIT_POOL_ID = 0x79a40c325329a45db0874896a0ecd6f24ca2df12e1deb909bdfb3e5045b1c321;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address constant OUSD = 0xB2000000000000000000002fEb517dFeC7415344;          // descriptor line 23
    address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;  // lancer-pool.js V4_ADRESSES[8453].poolm
    uint256 constant OUSD_FLOOR = 999999;                                         // descriptor OUSD plancher
    /// a second app block on hook 7030 (pool listed in wt-tblock/mesures/usage-onchain-20261027.json, id 0x7378...0f22, key
    /// re-derived and creator read on the fork 2026-11-09)
    address constant BLK2 = 0xb200000000000000000000e0E18f3D8fD5A50164;
    address constant BLK2_CREATOR = 0xcaFCEd36364578a1DFADac08ea59DD78eBf61B2a;

    uint256 constant PRICE = 7_500e18;
    uint256 constant FEE = 15_000e18;
    uint256 constant BURN = 2_000;

    function _unitKey() internal pure returns (BlockContest.PoolKey memory) {
        return BlockContest.PoolKey(address(0), UNIT, 0, 200, HOOK_7030);
    }

    function test_hookAddress_matchesDescriptor() public pure {
        // pinned literal: a typo in HOOK_7030 here or a changed descriptor must be noticed
        assertEq(HOOK_7030, address(0x32F3f572Dd17625bAb9035789C953E1d001864cc));
        assertEq(keccak256(abi.encode(_unitKey())), UNIT_POOL_ID, "poolId of the UNIT key");
    }

    function test_fork_fullRound_realTBLOCK_realHook() public {
        if (block.chainid != 8453 || TBLOCK.code.length == 0) { vm.skip(true); return; }
        assertEq(TBLOCK.code, hex"ef", "TBLOCK is a B20 (0xef marker)"); // `tb` = the contract-level constant IB20(TBLOCK)
        assertEq(UNIT.code, hex"ef", "UNIT is a B20 (0xef marker)");
        assertGt(HOOK_7030.code.length, 0, "hook 7030 deployed");

        BlockContest c = new BlockContest(BlockContest.Config({
            tblock: TBLOCK, hook: HOOK_7030, genesis: uint64(block.timestamp + 60), entryPeriod: 3 days, votePeriod: 4 days,
            votePrice: PRICE, entryFee: FEE, burnBps: BURN, split1: 6_000, split2: 2_500, split3: 1_500, minVotes: 3,
            minVoters: 1, minQualifiedEntries: 1, maxPot: type(uint256).max // mechanics config; the owner's config is the next test
        }), Pairs7030.list());
        assertEq(c.HOOK(), HOOK_7030);
        assertEq(c.creatorOf(UNIT_POOL_ID), UNIT_CREATOR, "creator read from the live hook");
        {
            (address paired, address blk) = c.sidesOf(_unitKey());
            assertEq(paired, address(0), "live cotes(UNIT key): devise = ETH");
            assertEq(blk, UNIT, "live cotes(UNIT key): bloc = UNIT");
        }

        address stranger = makeAddr("fork-stranger");
        address voter = makeAddr("fork-voter");

        // real TBLOCK moves from the impersonated holder (fork only)
        assertGt(tb.balanceOf(HOLDER), 2_000_000e18, "holder balance on fork");
        vm.startPrank(HOLDER);
        tb.transfer(UNIT_CREATOR, 100_000e18);
        tb.transfer(stranger, 100_000e18);
        tb.transfer(voter, 500_000e18);
        tb.approve(address(c), type(uint256).max);
        vm.stopPrank();
        assertEq(tb.balanceOf(voter), 500_000e18, "B20 transfer executed");
        vm.prank(UNIT_CREATOR); tb.approve(address(c), type(uint256).max);
        vm.prank(stranger); tb.approve(address(c), type(uint256).max);
        vm.prank(voter); tb.approve(address(c), type(uint256).max);

        vm.prank(HOLDER); c.fund(0, 1_000_000e18);

        vm.warp(c.roundStart(0));
        BlockContest.PoolKey memory k = _unitKey();
        // a random address cannot enter UNIT
        vm.prank(stranger);
        vm.expectRevert(BlockContest.NotCreator.selector);
        c.enter(UNIT, k);
        // TBLOCK carries the prefix but is excluded
        vm.prank(stranger);
        vm.expectRevert(BlockContest.NotB20.selector);
        c.enter(TBLOCK, BlockContest.PoolKey(address(0), TBLOCK, 0, 200, HOOK_7030));
        // SEC-002 on the real hook, BEFORE the creator has any entry (so only the pair-currency rule can refuse): the creator
        // opens a REAL second pool OUSD/UNIT (registration accepted by hook 7030 on this in-memory fork), so
        // createurs(OUSD/UNIT) == creator; entering OUSD (an admitted pair currency) with that key is refused.
        BlockContest.PoolKey memory ko = BlockContest.PoolKey(OUSD, UNIT, 0, 200, HOOK_7030); // OUSD < UNIT -> currency0
        vm.prank(POOL_MANAGER); IB20(OUSD).transfer(UNIT_CREATOR, 10 * OUSD_FLOOR);
        vm.prank(UNIT_CREATOR); IB20(OUSD).approve(HOOK_7030, type(uint256).max);
        vm.deal(UNIT_CREATOR, 1 ether);
        vm.prank(UNIT_CREATOR);
        (bool okReg,) = HOOK_7030.call{value: 1e15}(abi.encodeWithSignature(
            "inscrireAvecCaution((address,address,uint24,int24,address),uint160,uint128)", ko, uint160(1 << 96), uint128(OUSD_FLOOR)));
        assertTrue(okReg, "creator registers OUSD/UNIT on the live hook (fork)");
        assertEq(c.creatorOf(keccak256(abi.encode(ko))), UNIT_CREATOR, "hook names the creator for OUSD/UNIT");
        assertFalse(c.enteredBy(0, UNIT_CREATOR), "no entry yet: nothing else can refuse");
        vm.prank(UNIT_CREATOR);
        vm.expectRevert(BlockContest.NotB20.selector);
        c.enter(OUSD, ko);
        // and the live hook independently says OUSD is the PAIRED side of that pool (SEC-102's check would refuse it too)
        {
            (address pO, address bO) = c.sidesOf(ko);
            assertEq(pO, OUSD); assertEq(bO, UNIT);
        }

        // the creator recorded by the live hook can enter his block
        vm.prank(UNIT_CREATOR);
        uint256 id = c.enter(UNIT, k);
        assertEq(c.entryOf(0, id).payee, UNIT_CREATOR);
        // and after that, the stranger hits AlreadyEntered rather than stealing the slot
        vm.prank(stranger);
        vm.expectRevert(BlockContest.AlreadyEntered.selector);
        c.enter(UNIT, k);

        vm.warp(c.voteStart(0));
        uint256 dead0 = tb.balanceOf(DEAD);
        vm.prank(voter); c.vote(0, id, 12);
        uint256 money = 12 * PRICE;
        assertEq(tb.balanceOf(DEAD) - dead0, money * BURN / 10_000, "exact dead share on real TBLOCK");

        (uint256 pot,,,,,) = c.roundInfo(0);
        assertEq(pot, 1_000_000e18 + FEE + money - money * BURN / 10_000, "pot");
        assertEq(tb.balanceOf(address(c)), c.liabilities(), "solvent");

        uint256 w0 = tb.balanceOf(UNIT_CREATOR);
        vm.warp(c.roundEnd(0));
        vm.prank(makeAddr("fork-anyone")); c.settle(0);
        assertEq(tb.balanceOf(UNIT_CREATOR) - w0, pot * 6_000 / 10_000, "creator paid 1st prize in real TBLOCK");
        assertEq(c.claimable(UNIT_CREATOR), 0, "nothing deferred");
        (uint256 next,,,,,) = c.roundInfo(2);
        assertEq(next, pot - pot * 6_000 / 10_000, "2nd+3rd shares rolled to currentRound()+1 = 2 (single candidate)");
        assertEq(tb.balanceOf(address(c)), c.liabilities(), "solvent after settle");
        assertEq(tb.balanceOf(address(c)), next, "contract holds exactly the rolled pot");
    }

    /// @notice the OWNER'S config on real TBLOCK + live hook 7030, with TWO real app blocks and their hook-recorded creators:
    ///         votes 100 % burned, winner takes all, qualify = >= 3 votes from >= 3 distinct addresses, quorum = 2 entries.
    ///         Amounts at $0.0000058/TBLOCK (vote ~$0.05, entry ~$0.10, funding ~$5).
    ///         Round 0: UNIT qualifies (3 votes / 3 voters), BLK2 has 10 votes from ONE address -> quorum fails -> rolls to 2.
    ///         Round 2: both qualify; BLK2 has more total votes -> its creator takes the whole pot; contract ends at 0.
    function test_fork_ownerConfig_quorum_distinctVoters_winnerTakesAll() public {
        if (block.chainid != 8453 || TBLOCK.code.length == 0) { vm.skip(true); return; }
        oc = new BlockContest(BlockContest.Config({
            tblock: TBLOCK, hook: HOOK_7030, genesis: uint64(block.timestamp + 60), entryPeriod: 3 days, votePeriod: 4 days,
            votePrice: P, entryFee: F, burnBps: 10_000, split1: 10_000, split2: 0, split3: 0,
            minVotes: 3, minVoters: 3, minQualifiedEntries: 2, maxPot: 862_000e18
        }), Pairs7030.list());
        assertEq(BLK2.code, hex"ef", "BLK2 is a B20");
        assertEq(oc.creatorOf(keccak256(abi.encode(_key2()))), BLK2_CREATOR, "BLK2 creator read from the live hook");
        vm.startPrank(HOLDER);
        for (uint256 i; i < 5; ++i) { v[i] = makeAddr(string(abi.encodePacked("fork-v", vm.toString(i)))); tb.transfer(v[i], 200_000e18); }
        tb.transfer(UNIT_CREATOR, 100_000e18);
        tb.transfer(BLK2_CREATOR, 100_000e18);
        tb.approve(address(oc), type(uint256).max);
        oc.fund(0, FUND);
        vm.stopPrank();
        for (uint256 i; i < 5; ++i) { vm.prank(v[i]); tb.approve(address(oc), type(uint256).max); }
        vm.prank(UNIT_CREATOR); tb.approve(address(oc), type(uint256).max);
        vm.prank(BLK2_CREATOR); tb.approve(address(oc), type(uint256).max);

        // ---- round 0
        vm.warp(oc.roundStart(0));
        uint256 dead0 = tb.balanceOf(DEAD);
        vm.prank(UNIT_CREATOR); uint256 u0 = oc.enter(UNIT, _unitKey());
        vm.prank(BLK2_CREATOR); uint256 k0 = oc.enter(BLK2, _key2());
        assertEq(tb.balanceOf(DEAD), dead0, "MAX_POT: entry fees on the full pot are NOT burned...");
        {
            (uint256 r1,,,,,) = oc.roundInfo(1);
            assertEq(r1, 2 * F, "...they went to the next round with room (round 1), real TBLOCK");
        }
        vm.warp(oc.voteStart(0));
        dead0 = tb.balanceOf(DEAD); uint256 liab0 = oc.liabilities(); uint256 bal0 = tb.balanceOf(address(oc));
        for (uint256 i; i < 3; ++i) { vm.prank(v[i]); oc.vote(0, u0, 1); }
        uint256 g0 = gasleft();
        vm.prank(v[4]); oc.vote(0, k0, 10); // 10 votes, ONE address
        emit log_named_uint("vote() gas on real TBLOCK (first vote of an address, 10 votes)", g0 - gasleft());
        assertEq(tb.balanceOf(DEAD) - dead0, 13 * P, "real TBLOCK: 13 votes burned exactly");
        assertEq(oc.liabilities(), liab0, "liabilities unchanged by votes");
        assertEq(tb.balanceOf(address(oc)), bal0, "contract balance unchanged by votes");
        assertTrue(oc.entryOf(0, u0).qualified, "UNIT: 3 votes / 3 voters");
        assertFalse(oc.entryOf(0, k0).qualified, "BLK2: 10 votes / 1 voter");
        assertEq(oc.qualifiedCount(0), 1);
        (uint256 pot0,,,,,) = oc.roundInfo(0);
        assertEq(pot0, FUND, "pot capped at MAX_POT = one round's funding");
        uint256 wu = tb.balanceOf(UNIT_CREATOR); uint256 wk = tb.balanceOf(BLK2_CREATOR);
        vm.warp(oc.roundEnd(0));
        oc.settle(0);
        assertEq(tb.balanceOf(UNIT_CREATOR), wu, "quorum failed: no prize");
        assertEq(tb.balanceOf(BLK2_CREATOR), wk, "quorum failed: no prize");
        (uint256 p1,,,,,) = oc.roundInfo(1);
        (uint256 p2,,,,,) = oc.roundInfo(2);
        assertEq(p1, 2 * F, "no rollover into round 1 (already open): it holds only the spilled entry fees");
        assertEq(p2, pot0, "rolled entirely into currentRound()+1 = 2");

        // ---- round 2
        // the rollover already filled round 2 to MAX_POT: the owner's weekly fund is refused, not burned
        assertEq(oc.fundRoom(2), 0);
        vm.prank(HOLDER);
        vm.expectRevert(abi.encodeWithSelector(BlockContest.PotFull.selector, 2, 0));
        oc.fund(2, FUND);
        vm.warp(oc.roundStart(2));
        dead0 = tb.balanceOf(DEAD);
        vm.prank(UNIT_CREATOR); uint256 u2 = oc.enter(UNIT, _unitKey());
        vm.prank(BLK2_CREATOR); uint256 k2 = oc.enter(BLK2, _key2());
        assertEq(tb.balanceOf(DEAD), dead0, "round 2 entry fees not burned either");
        {
            (uint256 r3,,,,,) = oc.roundInfo(3);
            assertEq(r3, 2 * F, "they went to round 3");
        }
        vm.warp(oc.voteStart(2));
        for (uint256 i; i < 3; ++i) { vm.prank(v[i]); oc.vote(2, u2, 1); }
        for (uint256 i; i < 4; ++i) { vm.prank(v[i + 1]); oc.vote(2, k2, 1); }
        assertEq(oc.qualifiedCount(2), 2);
        (uint256 pot2,,,,,) = oc.roundInfo(2);
        assertEq(pot2, FUND, "no jackpot: a quiet round 0 did not double round 2");
        wk = tb.balanceOf(BLK2_CREATOR); wu = tb.balanceOf(UNIT_CREATOR);
        vm.warp(oc.roundEnd(2));
        vm.prank(makeAddr("fork-anyone-owner")); oc.settle(2);
        assertEq(tb.balanceOf(BLK2_CREATOR) - wk, pot2, "BLK2 (4 votes) takes the WHOLE pot in real TBLOCK");
        assertEq(tb.balanceOf(UNIT_CREATOR), wu, "2nd: share 0");
        assertEq(oc.claimable(BLK2_CREATOR), 0, "paid directly, nothing deferred");
        assertEq(tb.balanceOf(address(oc)), 4 * F, "only the spilled entry fees remain (rounds 1 and 3)");
        assertEq(oc.liabilities(), 4 * F);
        assertEq(oc.pendingBurn(), 0);
    }

    /// @notice the burn path's precondition on the REAL token: TBLOCK accepts a transfer to 0x...dEaD (exact delta both sides).
    function test_fork_realTBLOCK_acceptsTransferToDead() public {
        if (block.chainid != 8453 || TBLOCK.code.length == 0) { vm.skip(true); return; }
        uint256 d0 = tb.balanceOf(DEAD);
        uint256 h0 = tb.balanceOf(HOLDER);
        emit log_named_uint("TBLOCK already at 0x...dEaD on the fork (raw)", d0);
        vm.prank(HOLDER);
        assertTrue(tb.transfer(DEAD, 1e18), "transfer to DEAD returns true");
        assertEq(tb.balanceOf(DEAD) - d0, 1e18, "DEAD received exactly");
        assertEq(h0 - tb.balanceOf(HOLDER), 1e18, "sender debited exactly");
    }

    /// @notice SEC-102: the static pair list (Pairs7030.sol, from hook-7030-descripteur.js) matches the LIVE hook: every one of
    ///         the 62 is deviseAdmise == 1 (probed: one 32-byte word, 1/0); blocks and TBLOCK are not.
    function test_fork_pairList_allAdmittedByLiveHook() public {
        if (block.chainid != 8453 || HOOK_7030.code.length == 0) { vm.skip(true); return; }
        address[] memory p = Pairs7030.list();
        assertEq(p.length, 62);
        for (uint256 i; i < p.length; ++i) assertEq(_admise(p[i]), 1, "listed currency admitted by the live hook");
        assertEq(_admise(UNIT), 0, "a block is not a pair currency");
        assertEq(_admise(BLK2), 0, "a block is not a pair currency");
        assertEq(_admise(TBLOCK), 0, "TBLOCK is not a pair currency");
    }

    function _admise(address a) internal view returns (uint256) {
        (bool ok, bytes memory r) = HOOK_7030.staticcall(abi.encodeWithSignature("deviseAdmise(address)", a));
        require(ok && r.length == 32, "deviseAdmise unreadable");
        return abi.decode(r, (uint256));
    }

    // owner-config fork test state (kept in storage: stack too deep otherwise)
    uint256 constant P = 8_621e18;
    uint256 constant F = 17_241e18;
    uint256 constant FUND = 862_000e18;
    BlockContest oc;
    address[5] v;
    IB20 constant tb = IB20(TBLOCK);

    function _key2() internal pure returns (BlockContest.PoolKey memory) {
        return BlockContest.PoolKey(address(0), BLK2, 0, 200, HOOK_7030);
    }
}
