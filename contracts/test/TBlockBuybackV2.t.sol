// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TBlockBuybackV2 as TBlockBuyback} from "../src/buyback/TBlockBuybackV2.sol";

/// @dev Unit tests (no fork): constructor validation, guards, sweep, no-withdraw surface. The swap path is covered by
///      TBlockBuyback.fork.t.sol against the real pools on base-anvil.
contract BBToken {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract BBMockV3 {
    address public token0;
    address public token1;
    constructor(address a, address b) { token0 = a; token1 = b; }
}

contract BBMockPM {
    bytes32 public value;
    constructor(bytes32 v) { value = v; }
    function extsload(bytes32) external view returns (bytes32) { return value; }
}

contract Sender2300 {
    constructor() payable {}
    function send2300(address payable to, uint256 v) external returns (bool) { return to.send(v); }
}

contract TBlockBuybackUnitTestV2 is Test {
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address constant DEST = address(uint160(0x0000c0ffee000000000000000000000000000000c0)); // V2: the vault stand-in
    BBToken weth; BBToken wt; BBToken tb;
    BBMockV3 v3; BBMockPM pm;
    TBlockBuyback bb;

    function _cfg() internal view returns (TBlockBuyback.Config memory c) {
        c.poolManager = address(pm);
        (address c0, address c1) = address(wt) < address(tb) ? (address(wt), address(tb)) : (address(tb), address(wt));
        c.v4Key = TBlockBuyback.PoolKey(c0, c1, 3000, 60, address(0x3e6B46810b1fd5085086Fd1417E8adB02f34a044));
        c.v3Pool = address(v3);
        c.weth = address(weth); c.wtcoin = address(wt); c.tblock = address(tb);
        c.maxPerCall = 0.002 ether; c.minSpend = 0.0001 ether; c.cooldown = 1 hours; c.twapWindow = 1800;
        c.maxV3DevTicks = 100; c.maxV4ImpactTicks = 60; c.maxHookPpm = 12_000; c.tipBps = 50; c.maxTip = 0.00002 ether; c.dest = DEST;
        c.keeper = address(0xF1F1); c.publicDelay = 6 hours;
    }

    function setUp() public {
        weth = new BBToken(); wt = new BBToken(); tb = new BBToken();
        v3 = new BBMockV3(address(weth), address(wt));
        pm = new BBMockPM(bytes32(uint256(1) << 100)); // "initialized" pool
        vm.etch(DEST, hex"fe"); // V2: DEST must be a contract (the vault)
        bb = new TBlockBuyback(_cfg());
    }

    function test_constructor_wiring() public view {
        assertEq(bb.POOL_MANAGER(), address(pm));
        assertEq(bb.MAX_PER_CALL(), 0.002 ether);
        assertEq(bb.COOLDOWN(), 1 hours);
        assertEq(bb.V3_ZERO_FOR_ONE(), address(weth) == v3.token0());
        assertEq(bb.V4_ZERO_FOR_ONE(), address(wt) < address(tb));
        (uint256 k, uint256 p) = bb.readyAt();
        assertEq(k, block.timestamp, "fundedAt starts at deployment");
        assertEq(p, type(uint256).max, "public path closed until armed");
        assertFalse(bb.armed());
        assertEq(bb.V4_FLOOR_PPM(), 1e6 - 3000 - 12_000 - 6000);
    }

    function test_constructor_rejects() public {
        TBlockBuyback.Config memory c;
        c = _cfg(); c.poolManager = address(0);
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.minSpend = c.maxPerCall + 1;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.maxPerCall = 0;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.cooldown = 0;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.twapWindow = 59;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.tipBps = 101;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.maxTip = 0;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.maxV4ImpactTicks = 0;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.maxV3DevTicks = -1;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        // v3 pool of the wrong pair
        c = _cfg(); c.v3Pool = address(new BBMockV3(address(weth), address(tb)));
        vm.expectRevert(TBlockBuyback.BadPool.selector); new TBlockBuyback(c);
        // v4 key of the wrong pair
        c = _cfg(); c.v4Key.currency0 = address(weth);
        vm.expectRevert(TBlockBuyback.BadPool.selector); new TBlockBuyback(c);
        // uninitialized v4 pool
        c = _cfg(); c.poolManager = address(new BBMockPM(bytes32(0)));
        vm.expectRevert(TBlockBuyback.BadPool.selector); new TBlockBuyback(c);
        c = _cfg(); c.publicDelay = 0; // keeper without delay
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.maxHookPpm = 1e6; // floor slack >= 100 %
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.v4Key.fee = 0x800000; // dynamic fee: floor cannot know the LP fee
        vm.expectRevert(TBlockBuyback.BadPool.selector); new TBlockBuyback(c);
        c = _cfg(); c.keeper = address(0); c.publicDelay = 0; // public only
        assertEq(new TBlockBuyback(c).PUBLIC_DELAY(), 0);
        // NEW-2 upper bounds (and exact bounds accepted)
        c = _cfg(); c.cooldown = 7 days + 1;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.cooldown = 7 days; new TBlockBuyback(c);
        c = _cfg(); c.publicDelay = 7 days + 1;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.publicDelay = 7 days; new TBlockBuyback(c);
        c = _cfg(); c.twapWindow = 1 hours + 1;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.twapWindow = 1 hours; new TBlockBuyback(c);
        c = _cfg(); c.twapWindow = 60; new TBlockBuyback(c);
        // floor budget must leave room for the max protocol fee (1000 pips)
        c = _cfg(); c.maxHookPpm = uint24(1e6 - 3000 - 6000 - 1000);
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.maxHookPpm = uint24(1e6 - 3000 - 6000 - 1001); new TBlockBuyback(c);
        // tip 0 with cap 0 is allowed
        c = _cfg(); c.tipBps = 0; c.maxTip = 0;
        new TBlockBuyback(c);
    }

    function test_receive_fundedAt_and_badAmount() public {
        vm.prank(address(0xF1F1));
        vm.expectRevert(TBlockBuyback.BadAmount.selector);
        bb.buyback(0.0001 ether);
        uint256 deployedAt = bb.fundedAt();
        assertEq(deployedAt, block.timestamp);
        vm.expectRevert(TBlockBuyback.NotArmed.selector); // public, disarmed
        bb.buyback(0.0001 ether);
        vm.warp(block.timestamp + 1 days);
        (bool ok,) = payable(address(bb)).call{value: 0.00005 ether}(""); // below MIN_SPEND: no arm
        assertTrue(ok);
        assertFalse(bb.armed());
        assertEq(bb.fundedAt(), deployedAt);
        // a 2300-gas transfer that WOULD arm reverts (documented): the write does not fit the stipend
        Sender2300 s2300 = new Sender2300{value: 1 ether}();
        assertFalse(s2300.send2300(payable(address(bb)), 0.0001 ether), "2300-gas send that arms fails");
        (ok,) = payable(address(bb)).call{value: 1 ether}(""); // normal call: arms
        assertTrue(ok);
        assertTrue(bb.armed());
        assertEq(bb.fundedAt(), block.timestamp);
        vm.warp(block.timestamp + 1 hours);
        assertTrue(s2300.send2300(payable(address(bb)), 1 wei), "armed: 2300-gas transfer works, no write");
        assertEq(bb.fundedAt(), block.timestamp - 1 hours, "no re-arm while armed");
        vm.expectRevert(abi.encodeWithSelector(TBlockBuyback.TooEarly.selector, block.timestamp - 1 hours + 6 hours));
        bb.buyback(0.0001 ether);
    }

    /// @notice L-1 on mocks: arm() is a no-op below MIN_SPEND, arms once at/above it, then never moves fundedAt again.
    function test_arm_unit() public {
        uint256 t0 = block.timestamp;
        assertFalse(bb.arm(), "empty: no arm");
        vm.deal(address(bb), 0.0001 ether - 1);
        assertFalse(bb.arm(), "below MIN_SPEND: no arm");
        assertEq(bb.fundedAt(), t0);
        vm.warp(t0 + 1 days);
        vm.deal(address(bb), 0.0001 ether); // force-funded (no receive)
        assertFalse(bb.armed());
        assertTrue(bb.arm());
        assertEq(bb.fundedAt(), t0 + 1 days);
        assertEq(address(bb).balance, 0.0001 ether, "arm() moves no ETH");
        vm.warp(t0 + 2 days);
        assertTrue(bb.arm());
        assertEq(bb.fundedAt(), t0 + 1 days, "already armed: no-op");
        (, uint256 p) = bb.readyAt();
        assertEq(p, t0 + 1 days + 6 hours);
    }

    /// @notice NEW-3: the floor subtracts our direction's protocol fee, exactly, and refuses an impossible one.
    function test_v4Floor_protocolFee() public view {
        uint160 one = uint160(2 ** 96); // price 1
        uint256 f = bb.V4_FLOOR_PPM();
        assertEq(bb.v4Floor(1e18, one, 0), 1e18 * f / 1e6);
        assertEq(bb.v4Floor(1e18, one, 1000), 1e18 * (f - 1000) / 1e6);
        assertEq(bb.v4Floor(1e18, one, 0) - bb.v4Floor(1e18, one, 1000), 1e18 * 1000 / 1e6);
    }

    function test_v4Floor_protocolFee_aboveMaxReverts() public {
        vm.expectRevert(TBlockBuyback.BadPool.selector);
        bb.v4Floor(1e18, uint160(2 ** 96), 1001);
    }

    function test_mulDiv() public view {
        assertEq(bb.mulDiv(6, 7, 3), 14);
        assertEq(bb.mulDiv(2 ** 200, 2 ** 100, 2 ** 96), 2 ** 204, "512-bit intermediate");
        assertEq(bb.mulDiv(type(uint256).max, type(uint256).max, type(uint256).max), type(uint256).max);
        assertEq(bb.mulDiv(type(uint256).max - 1, type(uint256).max - 2, type(uint256).max), type(uint256).max - 3);
    }

    function test_mulDiv_fuzz(uint256 a, uint256 b, uint256 d) public view {
        d = bound(d, 1, type(uint256).max);
        a = bound(a, 0, type(uint128).max);
        b = bound(b, 0, type(uint128).max);
        assertEq(bb.mulDiv(a, b, d), a * b / d);
    }

    function test_mulDiv_reverts() public {
        vm.expectRevert(TBlockBuyback.BadParams.selector);
        bb.mulDiv(1, 1, 0);
        vm.expectRevert(TBlockBuyback.BadParams.selector);
        bb.mulDiv(2 ** 255, 4, 1); // overflow
    }

    function test_callbacks_guarded() public {
        vm.expectRevert(TBlockBuyback.NotPool.selector);
        bb.uniswapV3SwapCallback(1, 0, "");
        vm.prank(address(v3));
        vm.expectRevert(TBlockBuyback.NotPool.selector); // right sender, no swap in flight
        bb.uniswapV3SwapCallback(1, 0, "");
        vm.expectRevert(TBlockBuyback.NotPoolManager.selector);
        bb.unlockCallback(abi.encode(uint256(1)));
        vm.prank(address(pm));
        vm.expectRevert(TBlockBuyback.NotPoolManager.selector);
        bb.unlockCallback(abi.encode(uint256(1)));
    }

    function test_sweep_onlyTblock_onlyToDead() public {
        tb.mint(address(bb), 7 ether);
        wt.mint(address(bb), 3 ether);
        vm.deal(address(bb), 1 ether);
        vm.prank(address(0xBAD));
        assertEq(bb.sweepToDest(), 7 ether);
        assertEq(tb.balanceOf(DEST), 7 ether);
        assertEq(tb.balanceOf(address(bb)), 0);
        assertEq(wt.balanceOf(address(bb)), 3 ether, "other tokens untouched");
        assertEq(address(bb).balance, 1 ether, "ETH untouched");
        assertEq(bb.sweepToDest(), 0, "empty sweep is a no-op");
    }

    function test_noWithdrawSurface(bytes4 sel, address who) public {
        // the ONLY external entry points
        vm.assume(sel != TBlockBuyback.buyback.selector && sel != TBlockBuyback.sweepToDest.selector);
        vm.assume(sel != bytes4(0)); // empty-calldata-like selectors are not the point here
        vm.assume(sel != TBlockBuyback.uniswapV3SwapCallback.selector && sel != TBlockBuyback.unlockCallback.selector);
        vm.deal(address(bb), 1 ether);
        vm.prank(who);
        (bool ok,) = address(bb).call(abi.encodePacked(sel, abi.encode(who, uint256(1 ether))));
        ok; // views may succeed; what matters is the balance below
        assertEq(address(bb).balance, 1 ether, "no selector moves ETH");
    }
}
