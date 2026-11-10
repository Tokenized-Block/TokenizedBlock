// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockLikes} from "../src/BlockLikes.sol";
import {TBlockVault} from "../src/TBlockVault.sol";

contract VToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { _move(msg.sender, to, a); return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a, "allowance"); allowance[f][msg.sender] -= a; _move(f, to, a); return true;
    }
    function _move(address f, address to, uint256 a) internal { require(balanceOf[f] >= a, "balance"); balanceOf[f] -= a; balanceOf[to] += a; }
}

/// @dev the contest's fund() rules: clip to room, pull with transferFrom, revert when full
contract FakeContest {
    VToken t; uint256 public round; uint256 public maxPot; mapping(uint256 => uint256) public pot; bool public pullHalf;
    constructor(VToken _t, uint256 _max) { t = _t; maxPot = _max; }
    function setRound(uint256 r) external { round = r; }
    function setPullHalf(bool b) external { pullHalf = b; }
    function currentRound() external view returns (uint256) { return round; }
    function fundRoom(uint256 r) public view returns (uint256) { return pot[r] >= maxPot ? 0 : maxPot - pot[r]; }
    function fund(uint256 r, uint256 a) external {
        uint256 room = fundRoom(r); require(room > 0, "PotFull"); if (a > room) a = room; if (pullHalf) a = a / 2;
        t.transferFrom(msg.sender, address(this), a); pot[r] += a;
    }
}

contract TBlockVaultTest is Test {
    VToken t; BlockLikes L; TBlockVault V; FakeContest C;
    address A = address(0xA11CE); address B = address(0xB0B); address X = address(0x999); address D2 = address(0xD2D2);
    address constant BLK = address(uint160((uint256(0xb2000000000000000000) << 80) | 0xba9bf8330307f8830e));
    uint256 constant PRICE = 86_000e18; uint256 constant HOLD_LIKE = 2_580_000e18; uint256 constant HOLD_CLAIM = 17_200_000e18;
    uint256 constant MAXPOT = 862_000e18;
    uint64 G; uint64 constant EP = 7 days;

    function setUp() public {
        vm.warp(1_800_000_000); G = uint64(block.timestamp);
        t = new VToken();
        L = new BlockLikes(address(t), PRICE, HOLD_LIKE, G, EP);
        C = new FakeContest(t, MAXPOT);
        V = new TBlockVault(TBlockVault.Config({ tblock: address(t), likes: address(L), contest: address(C), minHold: HOLD_CLAIM,
            rewardBps: 5_000, topBps: 2_000, rebateBps: 5_000, maxEpochBudget: 50_000_000e18, claimWindow: 7 days,
            maxFeedPerCall: 862_000e18, feedCooldown: 1 days, dev: address(this), dev2: D2 }));
        for (uint256 i; i < 2; i++) { address p = i == 0 ? A : B; t.mint(p, 100_000_000e18); vm.prank(p); t.approve(address(L), type(uint256).max); }
    }

    function _play() internal { vm.prank(A); L.like(BLK, 3); vm.prank(B); L.like(BLK, 1); } // A 3 likes (top), B 1

    function test_players_paid_capped_and_top_bonus() public {
        _play();
        t.mint(address(V), 100_000_000e18);
        vm.expectRevert(abi.encodeWithSelector(TBlockVault.EpochNotOver.selector, uint256(G + EP))); V.closeEpoch(0);
        vm.warp(G + EP);
        uint256 budget = V.closeEpoch(0);
        // free*50% = 50M, capped by MAX 50M, capped by payable = total(4*PRICE)*50%*2 = 4*PRICE
        assertEq(budget, 4 * PRICE, "budget capped by what can be paid");
        assertEq(V.reserved(), budget);
        (uint256 sA, uint256 bA) = V.owed(0, A); (uint256 sB, uint256 bB) = V.owed(0, B);
        assertEq(sA, 3 * PRICE / 2, "A share capped at 50% of spent");
        assertEq(bA, budget * 2_000 / 10_000, "top bonus = 20% of the budget (under its cap of 50% of spent)");
        assertLe(bA, 3 * PRICE / 2);
        assertEq(sB, PRICE / 2); assertEq(bB, 0);
        assertLe(sA + bA, 3 * PRICE, "never more than burned");
        uint256 a0 = t.balanceOf(A);
        vm.prank(A); V.claim(0);
        assertEq(t.balanceOf(A) - a0, sA + bA);
        vm.prank(A); vm.expectRevert(TBlockVault.AlreadyClaimed.selector); V.claim(0);
        vm.prank(B); V.claim(0);
        assertEq(V.reserved(), budget - sA - bA - sB);
    }

    function test_pro_rata_when_budget_is_small() public {
        _play();
        t.mint(address(V), 100_000e18); // free 100k -> budget 50k
        vm.warp(G + EP); uint256 budget = V.closeEpoch(0);
        assertEq(budget, 50_000e18);
        (uint256 sA, uint256 bA) = V.owed(0, A); (uint256 sB,) = V.owed(0, B);
        assertEq(sA, budget * 8_000 / 10_000 * 3 / 4); assertEq(sB, budget * 8_000 / 10_000 * 1 / 4); assertEq(bA, budget * 2_000 / 10_000);
        assertLe(sA + bA + sB, budget);
    }

    function test_hold_gate_on_claim() public {
        _play(); t.mint(address(V), 10_000_000e18); vm.warp(G + EP); V.closeEpoch(0);
        vm.startPrank(B); t.transfer(X, t.balanceOf(B) - (HOLD_CLAIM - 1)); vm.stopPrank();
        vm.prank(B); vm.expectRevert(abi.encodeWithSelector(TBlockVault.HoldTooLow.selector, HOLD_CLAIM - 1, HOLD_CLAIM)); V.claim(0);
    }

    function test_non_player_gets_nothing() public {
        _play(); t.mint(address(V), 10_000_000e18); vm.warp(G + EP); V.closeEpoch(0);
        t.mint(X, HOLD_CLAIM);
        vm.prank(X); vm.expectRevert(TBlockVault.NothingToClaim.selector); V.claim(0);
    }

    function test_window_and_release() public {
        _play(); t.mint(address(V), 10_000_000e18); vm.warp(G + EP); uint256 budget = V.closeEpoch(0);
        vm.expectRevert(TBlockVault.WindowOpen.selector); V.release(0);
        vm.prank(A); V.claim(0);
        vm.warp(block.timestamp + 7 days);
        vm.prank(B); vm.expectRevert(TBlockVault.WindowClosed.selector); V.claim(0);
        uint256 back = V.release(0);
        (uint256 sA, uint256 bA) = (3 * PRICE / 2, budget * 2_000 / 10_000);
        assertEq(back, budget - sA - bA); assertEq(V.reserved(), 0);
        vm.expectRevert(TBlockVault.AlreadyReleased.selector); V.release(0);
        vm.expectRevert(TBlockVault.AlreadyClosed.selector); V.closeEpoch(0);
    }

    function test_players_first_then_contest() public {
        _play(); t.mint(address(V), 10_000_000e18);
        vm.warp(G + EP);
        vm.expectRevert(abi.encodeWithSelector(TBlockVault.PlayersFirst.selector, uint256(0))); V.feedContest();
        uint256 budget = V.closeEpoch(0);
        uint256 fed = V.feedContest();
        assertEq(fed, MAXPOT, "clipped to the contest room");
        assertEq(C.pot(0), MAXPOT);
        assertEq(t.allowance(address(V), address(C)), 0, "approval reset");
        assertEq(V.balance(), 10_000_000e18 - MAXPOT);
        assertGe(V.balance(), budget, "reserved budget untouched");
        vm.expectRevert(abi.encodeWithSelector(TBlockVault.Cooldown.selector, block.timestamp + 1 days)); V.feedContest();
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(TBlockVault.NothingToFeed.selector); V.feedContest(); // round 0 full
        C.setRound(1);
        assertEq(V.feedContest(), MAXPOT);
    }

    function test_feed_never_touches_reserved() public {
        _play(); t.mint(address(V), 4 * PRICE); vm.warp(G + EP);
        uint256 budget = V.closeEpoch(0); // 2*PRICE
        assertEq(V.free(), 4 * PRICE - budget);
        V.feedContest();
        assertEq(V.balance(), budget, "only the free part went to the pot");
        vm.prank(A); V.claim(0); vm.prank(B); V.claim(0);
    }

    function test_contest_pulling_less_leaves_no_allowance() public {
        t.mint(address(V), 1_000_000e18); vm.warp(G + EP); C.setPullHalf(true);
        uint256 fed = V.feedContest();
        assertEq(fed, MAXPOT / 2, "reports what actually left");
        assertEq(t.allowance(address(V), address(C)), 0, "approval reset even when less was pulled");
    }

    function test_top_bonus_capped_by_what_the_top_burned() public {
        TBlockVault V2 = new TBlockVault(TBlockVault.Config({ tblock: address(t), likes: address(L), contest: address(C), minHold: HOLD_CLAIM,
            rewardBps: 5_000, topBps: 4_999, rebateBps: 5_000, maxEpochBudget: 50_000_000e18, claimWindow: 7 days,
            maxFeedPerCall: 862_000e18, feedCooldown: 1 days, dev: address(this), dev2: D2 }));
        vm.prank(A); L.like(BLK, 1); vm.prank(B); L.like(BLK, 1); // tie: A is top
        t.mint(address(V2), 100_000_000e18); vm.warp(G + EP);
        uint256 budget = V2.closeEpoch(0);                 // capped at total*50%*2 = 2*PRICE
        (, uint256 bA) = V2.owed(0, A);
        assertLt(PRICE / 2, budget * 4_999 / 10_000, "the uncapped bonus would be larger");
        assertEq(bA, PRICE / 2, "top bonus capped at 50% of what the top burned");
    }

    function test_no_feeding_in_the_last_day_of_an_epoch_with_players() public {
        t.mint(address(V), 1_000_000e18);
        vm.prank(A); L.like(BLK, 1);
        uint256 snap = vm.snapshotState();
        vm.warp(G + EP - 1 days - 1);
        assertEq(V.feedContest(), MAXPOT, "allowed one second before the quiet day");
        vm.revertToState(snap);
        vm.warp(G + EP - 1 days);
        vm.expectRevert(abi.encodeWithSelector(TBlockVault.PlayersFirst.selector, uint256(0))); V.feedContest();
    }

    function test_stale_epoch_still_blocks_feeding() public {
        _play(); t.mint(address(V), 1_000_000e18);
        vm.warp(G + 2 * EP + 1);            // epoch 0 (players) never closed, epoch 1 empty, now in epoch 2
        vm.expectRevert(abi.encodeWithSelector(TBlockVault.PlayersFirst.selector, uint256(0))); V.feedContest();
        V.closeEpoch(0);
        assertGt(V.feedContest(), 0);
        assertEq(V.closeCursor(), 2);
    }

    function test_bounded_parameters() public {
        TBlockVault.Config memory c = TBlockVault.Config({ tblock: address(t), likes: address(L), contest: address(C), minHold: 1,
            rewardBps: 5_000, topBps: 5_000, rebateBps: 5_000, maxEpochBudget: 1, claimWindow: 1, maxFeedPerCall: 1, feedCooldown: 0, dev: address(this), dev2: D2 });
        vm.expectRevert(TBlockVault.BadParams.selector); new TBlockVault(c);           // top 50% refused
        c.topBps = 4_999; c.claimWindow = 365 days + 1;
        vm.expectRevert(TBlockVault.BadParams.selector); new TBlockVault(c);
        c.claimWindow = 365 days; c.feedCooldown = 30 days + 1;
        vm.expectRevert(TBlockVault.BadParams.selector); new TBlockVault(c);
        c.feedCooldown = 30 days; new TBlockVault(c);                                     // the bounds themselves pass
    }

    function test_empty_epoch_does_not_block_feeding() public {
        t.mint(address(V), 1_000_000e18); vm.warp(G + EP);
        assertEq(V.feedContest(), MAXPOT);
    }

    function test_dev_rescue_public_delayed_free_only() public {
        _play(); t.mint(address(V), 1_000_000e18); vm.warp(G + EP);
        uint256 budget = V.closeEpoch(0);
        vm.prank(A); V.claim(0); // A paid; B's part stays reserved
        assertEq(V.DEV(), address(this));
        vm.prank(A); vm.expectRevert(TBlockVault.NotDev.selector); V.announceRescue(1);
        vm.expectRevert(TBlockVault.NoRescue.selector); V.rescue();
        V.announceRescue(type(uint256).max);
        assertEq(V.rescueAt(), block.timestamp + 7 days);
        vm.expectRevert(abi.encodeWithSelector(TBlockVault.TooEarly.selector, block.timestamp + 7 days)); V.rescue();
        vm.warp(block.timestamp + 7 days - 1);
        vm.expectRevert(abi.encodeWithSelector(TBlockVault.TooEarly.selector, block.timestamp + 1)); V.rescue();
        vm.warp(block.timestamp + 1);
        vm.prank(A); vm.expectRevert(TBlockVault.NotDev.selector); V.rescue();
        uint256 before = t.balanceOf(address(this));
        uint256 got = V.rescue();
        assertEq(got, 1_000_000e18 - budget, "only the free part");
        assertEq(t.balanceOf(address(this)) - before, got);
        assertEq(V.balance(), V.reserved(), "reserved player budget untouched");
        assertGt(V.reserved(), 0);
        assertEq(V.rescueAmount(), 0);
        vm.warp(block.timestamp - 7 days); // back inside B's window (time travel only to check B is still payable from what stayed)
        (uint256 sB,) = V.owed(0, B);
        assertLe(sB, V.balance());
    }

    function test_second_dev_same_rights_and_paid_itself() public {
        t.mint(address(V), 1_000e18);
        assertEq(V.DEV2(), D2);
        vm.prank(A, A); vm.expectRevert(TBlockVault.NotDev.selector); V.announceRescue(1); // a plain wallet calling directly
        vm.prank(D2); V.announceRescue(100e18);
        vm.warp(block.timestamp + 7 days);
        uint256 d0 = t.balanceOf(address(this));
        vm.prank(D2); assertEq(V.rescue(), 100e18);
        assertEq(t.balanceOf(D2), 100e18, "the dev who executes receives it");
        assertEq(t.balanceOf(address(this)), d0, "the other dev receives nothing");
        V.announceRescue(1e18);                   // dev 1 announces, dev 2 cancels
        vm.prank(D2); V.cancelRescue();
        assertEq(V.rescueAmount(), 0);
        vm.prank(D2); V.renounceRescue();         // dev 2 renounces for both
        vm.expectRevert(TBlockVault.Renounced.selector); V.announceRescue(1);
    }

    function test_only_the_announcer_executes_and_it_expires() public {
        t.mint(address(V), 1_000e18);
        V.announceRescue(100e18);                                   // dev 1 announces
        assertEq(V.rescueBy(), address(this));
        vm.warp(block.timestamp + 7 days);
        vm.prank(D2); vm.expectRevert(abi.encodeWithSelector(TBlockVault.NotAnnouncer.selector, address(this))); V.rescue();
        vm.warp(block.timestamp + 2 days);                          // last second of the window: still allowed
        uint256 snap = vm.snapshotState();
        assertEq(V.rescue(), 100e18);
        vm.revertToState(snap);
        vm.warp(block.timestamp + 1);                               // one second after: expired
        vm.expectRevert(abi.encodeWithSelector(TBlockVault.Expired.selector, block.timestamp - 1)); V.rescue();
        V.announceRescue(100e18);                                   // must be announced again, in public, with a new 7-day delay
        assertEq(V.rescueAt(), block.timestamp + 7 days);
    }

    function test_rescue_events_name_who() public {
        t.mint(address(V), 1_000e18);
        vm.expectEmit(true, false, false, true);
        emit TBlockVault.RescueAnnounced(D2, 5e18, block.timestamp + 7 days, block.timestamp + 9 days, 1_000e18);
        vm.prank(D2); V.announceRescue(5e18);
        vm.expectEmit(true, false, false, false);
        emit TBlockVault.RescueCancelled(address(this));
        V.cancelRescue();
        assertEq(V.rescueBy(), address(0));
    }

    function test_two_devs_must_be_distinct_and_set() public {
        TBlockVault.Config memory c = TBlockVault.Config({ tblock: address(t), likes: address(L), contest: address(C), minHold: 1,
            rewardBps: 5_000, topBps: 2_000, rebateBps: 5_000, maxEpochBudget: 1, claimWindow: 1, maxFeedPerCall: 1, feedCooldown: 0, dev: address(this), dev2: address(this) });
        vm.expectRevert(TBlockVault.BadParams.selector); new TBlockVault(c);
        c.dev2 = address(0);
        vm.expectRevert(TBlockVault.BadParams.selector); new TBlockVault(c);
        c.dev2 = D2; c.dev = address(0);
        vm.expectRevert(TBlockVault.BadParams.selector); new TBlockVault(c);
    }

    function test_dev_cancel_and_renounce() public {
        t.mint(address(V), 1_000e18);
        V.announceRescue(10e18);
        vm.prank(A); vm.expectRevert(TBlockVault.NotDev.selector); V.cancelRescue();
        V.cancelRescue();
        vm.warp(block.timestamp + 8 days);
        vm.expectRevert(TBlockVault.NoRescue.selector); V.rescue();
        vm.prank(A); vm.expectRevert(TBlockVault.NotDev.selector); V.renounceRescue();
        V.announceRescue(10e18);
        V.renounceRescue();
        assertEq(V.rescueAmount(), 0);
        vm.warp(block.timestamp + 8 days);
        vm.expectRevert(TBlockVault.Renounced.selector); V.rescue();
        vm.expectRevert(TBlockVault.Renounced.selector); V.announceRescue(1);
    }

    function test_constructor_guards() public {
        TBlockVault.Config memory c = TBlockVault.Config({ tblock: address(t), likes: address(L), contest: address(C), minHold: 1,
            rewardBps: 5_000, topBps: 2_000, rebateBps: 5_001, maxEpochBudget: 1, claimWindow: 1, maxFeedPerCall: 1, feedCooldown: 0, dev: address(this), dev2: D2 });
        vm.expectRevert(TBlockVault.BadParams.selector); new TBlockVault(c);
        c.rebateBps = 5_000; c.rewardBps = 0;
        vm.expectRevert(TBlockVault.BadParams.selector); new TBlockVault(c);
        c.rewardBps = 5_000; c.tblock = address(0);
        vm.expectRevert(TBlockVault.BadParams.selector); new TBlockVault(c);
    }

    function testFuzz_total_paid_never_exceeds_budget_nor_burned(uint8 la, uint8 lb, uint64 fundIn) public {
        uint256 na = bound(uint256(la), 1, 50); uint256 nb = bound(uint256(lb), 1, 50);
        vm.prank(A); L.like(BLK, na); vm.prank(B); L.like(BLK, nb);
        t.mint(address(V), bound(uint256(fundIn), 1, type(uint64).max) * 1e9);
        vm.warp(G + EP); uint256 budget = V.closeEpoch(0);
        uint256 a0 = t.balanceOf(A); uint256 b0 = t.balanceOf(B);
        (uint256 s1, uint256 x1) = V.owed(0, A); (uint256 s2, uint256 x2) = V.owed(0, B);
        if (s1 + x1 > 0) { vm.prank(A); V.claim(0); }
        if (s2 + x2 > 0) { vm.prank(B); V.claim(0); }
        uint256 pa = t.balanceOf(A) - a0; uint256 pb = t.balanceOf(B) - b0;
        assertLe(pa + pb, budget);
        assertLe(pa, na * PRICE); assertLe(pb, nb * PRICE);
    }
}
