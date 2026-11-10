// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockLikes} from "../src/BlockLikes.sol";

/// @dev token with switchable misbehaviour on transfers to 0x...dEaD: 0 normal, 1 moves half, 2 returns false, 3 no return data
contract LikeToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public mode;
    address constant DEAD_ = 0x000000000000000000000000000000000000dEaD;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function setMode(uint8 m) external { mode = m; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a, "allowance");
        allowance[f][msg.sender] -= a;
        if (to == DEAD_ && mode == 2) return false;
        uint256 moved = (to == DEAD_ && mode == 1) ? a / 2 : a;
        require(balanceOf[f] >= a, "balance");
        balanceOf[f] -= a; balanceOf[to] += moved;
        if (mode == 3) assembly { return(0, 0) }
        return true;
    }
}

contract BlockLikesTest is Test {
    LikeToken t;
    BlockLikes L;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address constant BLK = address(uint160((uint256(0xb2000000000000000000) << 80) | 0xba9bf8330307f8830e));
    address constant BLK2 = address(uint160((uint256(0xb2000000000000000000) << 80) | 0xe4b0c5fbe9c8df579e));
    address A = address(0xA11CE); address B = address(0xB0B);
    uint256 constant PRICE = 86_000e18; uint256 constant HOLD = 2_580_000e18;
    uint64 G; uint64 constant EP = 7 days;

    function setUp() public {
        vm.warp(1_800_000_000);
        G = uint64(block.timestamp);
        t = new LikeToken();
        L = new BlockLikes(address(t), PRICE, HOLD, G, EP);
        t.mint(A, 10_000_000e18); t.mint(B, 10_000_000e18);
        vm.prank(A); t.approve(address(L), type(uint256).max);
        vm.prank(B); t.approve(address(L), type(uint256).max);
    }

    function test_like_burns_exactly_and_counts() public {
        vm.prank(A); uint256 b = L.like(BLK, 3);
        assertEq(b, 3 * PRICE);
        assertEq(t.balanceOf(DEAD), 3 * PRICE);
        assertEq(t.balanceOf(address(L)), 0, "holds nothing");
        assertEq(L.likesOf(BLK), 3); assertEq(L.totalLikes(), 3); assertEq(L.totalBurned(), 3 * PRICE);
        assertEq(L.spentIn(0, A), 3 * PRICE); assertEq(L.totalSpentIn(0), 3 * PRICE); assertEq(L.topOf(0), A);
    }

    function test_not_a_block_refused() public {
        vm.prank(A); vm.expectRevert(BlockLikes.NotABlock.selector); L.like(address(0xb2), 1);
        vm.prank(A); vm.expectRevert(BlockLikes.NotABlock.selector); L.like(address(uint160((uint256(0xb3000000000000000000) << 80) | 1)), 1);
    }

    function test_count_bounds() public {
        vm.prank(A); vm.expectRevert(BlockLikes.BadCount.selector); L.like(BLK, 0);
        vm.prank(A); vm.expectRevert(BlockLikes.BadCount.selector); L.like(BLK, 1001);
        t.mint(A, 1000 * PRICE);
        vm.prank(A); L.like(BLK, 1000);
        assertEq(L.likesOf(BLK), 1000);
    }

    function test_hold_after_paying() public {
        address C = address(0xC0C);
        t.mint(C, HOLD + PRICE); vm.prank(C); t.approve(address(L), type(uint256).max);
        vm.prank(C); L.like(BLK, 1); // left exactly HOLD: allowed
        assertEq(t.balanceOf(C), HOLD);
        vm.prank(C); vm.expectRevert(abi.encodeWithSelector(BlockLikes.HoldTooLow.selector, HOLD - PRICE, HOLD)); L.like(BLK, 1);
    }

    function test_short_payment_refused() public {
        t.setMode(1);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(BlockLikes.PaymentShort.selector, PRICE, PRICE / 2)); L.like(BLK, 1);
    }

    function test_false_return_refused_and_no_return_ok() public {
        t.setMode(2);
        vm.prank(A); vm.expectRevert(BlockLikes.TransferFailed.selector); L.like(BLK, 1);
        t.setMode(3);
        vm.prank(A); L.like(BLK, 1);
        assertEq(L.likesOf(BLK), 1);
    }

    function test_epochs_and_top() public {
        vm.prank(A); L.like(BLK, 2);
        vm.prank(B); L.like(BLK2, 2);          // tie: A reached it first, stays top
        assertEq(L.topOf(0), A);
        vm.prank(B); L.like(BLK2, 1);
        assertEq(L.topOf(0), B);
        assertEq(L.totalSpentIn(0), 5 * PRICE);
        vm.warp(G + EP);                       // epoch 1 starts exactly here
        assertEq(L.currentEpoch(), 1); assertEq(L.epochEnd(0), G + EP);
        vm.prank(A); L.like(BLK, 1);
        assertEq(L.spentIn(1, A), PRICE); assertEq(L.topOf(1), A); assertEq(L.spentIn(0, A), 2 * PRICE);
        assertEq(L.likesOf(BLK), 3);
    }

    function test_last_second_of_epoch_0_and_others_allowance() public {
        vm.warp(G + EP - 1);
        vm.prank(A); L.like(BLK, 1);
        assertEq(L.spentIn(0, A), PRICE, "G+EP-1 is still epoch 0");
        uint256 b0 = t.balanceOf(B);
        address C = address(0xC0C); t.mint(C, HOLD + PRICE);   // C approved nothing; B approved L
        vm.prank(C); vm.expectRevert(); L.like(BLK, 1);       // C cannot spend B's approval
        assertEq(t.balanceOf(B), b0);
    }

    function test_before_genesis_counts_in_epoch_0() public {
        BlockLikes L2 = new BlockLikes(address(t), PRICE, HOLD, G + 1 days, EP);
        vm.prank(A); t.approve(address(L2), type(uint256).max);
        vm.prank(A); L2.like(BLK, 1);
        assertEq(L2.spentIn(0, A), PRICE);
    }

    function test_constructor_guards() public {
        vm.expectRevert(BlockLikes.BadParams.selector); new BlockLikes(address(0), PRICE, HOLD, G, EP);
        vm.expectRevert(BlockLikes.BadParams.selector); new BlockLikes(address(t), 0, HOLD, G, EP);
        vm.expectRevert(BlockLikes.BadParams.selector); new BlockLikes(address(t), PRICE, HOLD, G, 0);
        vm.expectRevert(BlockLikes.BadParams.selector); new BlockLikes(address(t), type(uint256).max, HOLD, G, EP);
    }

    function testFuzz_burn_equals_n_times_price(uint8 n8) public {
        uint256 n = bound(uint256(n8), 1, 100);
        t.mint(A, n * PRICE); // keep A above MIN_HOLD after paying (the hold rule is tested on its own)
        vm.prank(A); L.like(BLK, n);
        assertEq(t.balanceOf(DEAD), n * PRICE);
        assertEq(L.totalSpentIn(0), n * PRICE);
    }
}
