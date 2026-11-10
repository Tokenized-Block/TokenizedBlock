// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2, Vm} from "forge-std/Test.sol";
import {TBlockBuybackV2 as TBlockBuyback} from "../src/buyback/TBlockBuybackV2.sol";

interface IERC20Min {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

interface IV3PoolMin {
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool);
    function observations(uint256) external view returns (uint32, int56, uint160, bool);
    function swap(address, bool, int256, uint160, bytes calldata) external returns (int256, int256);
}

interface IPMMin {
    function extsload(bytes32) external view returns (bytes32);
    function unlock(bytes calldata) external returns (bytes memory);
    function swap(TBlockBuyback.PoolKey memory, TBlockBuyback.SwapParams memory, bytes calldata) external returns (int256);
    function sync(address) external;
    function settle() external payable returns (uint256);
    function take(address, address, uint256) external;
}

/// @dev test-only attacker: exact-input swaps on the v4 TBLOCK pool and the v3 WETH/wtCOIN pool, paid from its own balance;
///      can also wrap a buyback() inside its own call (atomic sandwich). Accepts the public tip.
contract Swapper {
    address constant PM = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant WTCOIN = 0x5cDa0E1CA4ce2af96315f7F8963C85399c172204;
    address constant TBLOCK = 0xB200000000000000000000BA9BF8330307f8830E;
    address constant HOOK = 0x3e6B46810b1fd5085086Fd1417E8adB02f34a044;
    address constant V3 = 0x8495444b5f3699D223baa01E67Bf534475620aff;
    address constant WETH = 0x4200000000000000000000000000000000000006;

    receive() external payable {}

    function v4(bool zeroForOne, uint256 amountIn) public returns (uint256 out) {
        return abi.decode(IPMMin(PM).unlock(abi.encode(zeroForOne, amountIn)), (uint256));
    }

    /// @dev front-run, victim, back-run in ONE call. Returns wtCOIN got back.
    function atomicSandwich(TBlockBuyback bb, uint256 size, uint256 amount) external returns (uint256) {
        uint256 tb = v4(true, size);
        bb.buyback(amount);
        return v4(false, tb);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (bool z, uint256 amt) = abi.decode(data, (bool, uint256));
        TBlockBuyback.PoolKey memory k = TBlockBuyback.PoolKey(WTCOIN, TBLOCK, 3000, 60, HOOK);
        int256 d = IPMMin(PM).swap(k, TBlockBuyback.SwapParams(z, -int256(amt), z ? 4295128740 : 1461446703485210103287273052203988822378723970341), "");
        int128 d0 = int128(d >> 128);
        int128 d1 = int128(d);
        (address tin, address tout, int128 dOut) = z ? (WTCOIN, TBLOCK, d1) : (TBLOCK, WTCOIN, d0);
        IPMMin(PM).sync(tin);
        IERC20Min(tin).transfer(PM, amt);
        IPMMin(PM).settle();
        IPMMin(PM).take(tout, address(this), uint256(int256(dOut)));
        return abi.encode(uint256(int256(dOut)));
    }

    function v3(bool zeroForOne, uint256 amountIn) external {
        IV3PoolMin(V3).swap(address(this), zeroForOne, int256(amountIn), zeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341, "");
    }

    function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata) external {
        if (a0 > 0) IERC20Min(WETH).transfer(V3, uint256(a0));
        if (a1 > 0) IERC20Min(WTCOIN).transfer(V3, uint256(a1));
    }
}

/// @dev sends ETH without calling receive() (selfdestruct in the constructor still deletes + transfers under Cancun).
contract ForceSender {
    constructor(address payable to) payable { selfdestruct(to); }
}

/// @notice FORK tests against Base mainnet on base-anvil (TBLOCK is a B20 token: code = 0xef marker, plain anvil cannot run it).
///   FOUNDRY_BASE=true ~/.foundry/versions/base-v1.1.1/forge.exe test --offline --match-contract TBlockBuybackFork --fork-url http://127.0.0.1:8656 -vv
/// NEVER --broadcast.
contract TBlockBuybackForkTestV2 is Test {
    address constant PM = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant WTCOIN = 0x5cDa0E1CA4ce2af96315f7F8963C85399c172204;
    address constant TBLOCK = 0xB200000000000000000000BA9BF8330307f8830E;
    address constant HOOK = 0x3e6B46810b1fd5085086Fd1417E8adB02f34a044;
    // On-chain: SwapRouter02(0x2626...e481).factory() = 0x33128a8f...FDfD, getPool(wtCOIN, WETH, 10000) = this address.
    address constant V3 = 0x8495444b5f3699D223baa01E67Bf534475620aff;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address constant DEST = address(uint160(0x0000c0ffee000000000000000000000000000000c0)); // V2: the vault stand-in
    bytes32 constant POOL_ID = 0x6869b9016937d97dfa595eb25bc72880e821b8eb22be32bc79c623bc64ce8a3e;
    uint256 constant MAXC = 0.002 ether;

    TBlockBuyback bb;
    address keeper = address(0xF1F1);
    address anyone = address(0xB0B);

    function _cfg() internal view returns (TBlockBuyback.Config memory c) {
        c.poolManager = PM;
        c.v4Key = TBlockBuyback.PoolKey(WTCOIN, TBLOCK, 3000, 60, HOOK);
        c.v3Pool = V3;
        c.weth = WETH;
        c.wtcoin = WTCOIN;
        c.tblock = TBLOCK;
        c.keeper = keeper;
        c.publicDelay = 6 hours;
        c.maxPerCall = MAXC;
        c.minSpend = 0.0001 ether;
        c.cooldown = 1 hours;
        c.twapWindow = 1800;
        c.maxV3DevTicks = 100;
        c.maxV4ImpactTicks = 60;
        c.maxHookPpm = 12_000;
        c.tipBps = 50;
        c.maxTip = 0.00002 ether;
        c.dest = DEST;
    }

    function setUp() public {
        if (PM.code.length == 0 || block.chainid != 8453) vm.skip(true);
        bb = new TBlockBuyback(_cfg());
    }

    function _fund(TBlockBuyback b, uint256 amt) internal {
        address funder = address(0xF00D);
        vm.deal(funder, amt);
        vm.prank(funder);
        (bool ok,) = address(b).call{value: amt}("");
        assertTrue(ok, "fund");
    }

    function _bal(address t, address w) internal view returns (uint256) { return IERC20Min(t).balanceOf(w); }

    function _v4Slot0() internal view returns (uint160 sqrtP, int24 tick) {
        bytes32 v = IPMMin(PM).extsload(keccak256(abi.encode(POOL_ID, uint256(6))));
        sqrtP = uint160(uint256(v));
        tick = int24(uint24(uint256(v) >> 160));
    }

    function _v4ProtocolFee0() internal view returns (uint256) {
        bytes32 v = IPMMin(PM).extsload(keccak256(abi.encode(POOL_ID, uint256(6))));
        return (uint256(v) >> 184) & 0xfff;
    }

    function _keeperBuy(uint256 amount) internal returns (uint256 toDead, uint256 fromSwap) {
        vm.prank(keeper, keeper);
        return bb.buyback(amount);
    }

    /// @dev pool-side TBLOCK output of our v4 swap, BEFORE the hook's afterSwap delta (PoolManager Swap event).
    function _poolOutFromLogs(Vm.Log[] memory logs) internal pure returns (uint256 poolOut, uint256 ethIn, uint256 wtMid, uint256 toDead) {
        bytes32 swapSig = keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
        bytes32 boughtSig = keccak256("Bought(uint256,uint256,uint256,address)");
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == PM && logs[i].topics[0] == swapSig && logs[i].topics[1] == POOL_ID) {
                (, int128 a1) = abi.decode(logs[i].data, (int128, int128));
                poolOut = uint256(int256(a1));
            }
            if (logs[i].topics[0] == boughtSig) (ethIn, wtMid, toDead) = abi.decode(logs[i].data, (uint256, uint256, uint256));
        }
    }

    // ---------------------------------------------------------------- facts re-verified on the fork

    function test_facts() public view {
        assertEq(TBLOCK.code.length, 1, "B20 marker");
        assertEq(uint8(TBLOCK.code[0]), 0xef);
        assertEq(keccak256(abi.encode(TBlockBuyback.PoolKey(WTCOIN, TBLOCK, 3000, 60, HOOK))), POOL_ID);
        assertEq(bb.V4_POOL_ID(), POOL_ID);
        assertEq(bytes4(keccak256("swap((address,address,uint24,int24,address),(bool,int256,uint160),bytes)")), bytes4(0xf3cd914c));
        assertTrue(bb.V3_ZERO_FOR_ONE(), "WETH is token0 of the v3 pool");
        assertTrue(bb.V4_ZERO_FOR_ONE(), "wtCOIN is currency0 of the v4 pool");
        assertEq(uint160(HOOK) & 0x3fff, (1 << 13) | (1 << 6) | (1 << 2), "hook flags");
        assertEq(bb.V4_FLOOR_PPM(), 1e6 - 3000 - 12_000 - 6000);
    }

    /// @notice SEC-005: does the v3 observation ring cover TWAP_WINDOW at today's swap rate?
    function test_v3_observationCoverage() public view {
        (,, uint16 idx, uint16 card, uint16 cardNext,,) = IV3PoolMin(V3).slot0();
        (uint32 oldestTs,,, bool init) = IV3PoolMin(V3).observations((uint256(idx) + 1) % card);
        console2.log("v3 observationIndex      ", idx);
        console2.log("v3 observationCardinality", card);
        console2.log("v3 cardinalityNext      ", cardNext);
        console2.log("oldest observation age s", block.timestamp - oldestTs);
        assertTrue(init);
        assertGe(block.timestamp - oldestTs, 1800, "ring covers the 30 min TWAP window");
    }

    // ---------------------------------------------------------------- main path + measurement (keeper, MAX_PER_CALL)

    struct M { uint160 v3Sqrt; uint160 v4Sqrt; int24 t0; int24 t1; uint256 dead0; uint256 toDeadRet; uint256 fromSwap;
        uint256 poolOut; uint256 ethIn; uint256 wtMid; uint256 toDead; }

    function test_buyback_burnsAndLeavesNothing() public {
        _fund(bb, 0.01 ether);
        M memory m;
        m.dead0 = _bal(TBLOCK, DEST);
        (m.v3Sqrt,,,,,,) = IV3PoolMin(V3).slot0();
        (m.v4Sqrt, m.t0) = _v4Slot0();

        vm.recordLogs();
        (m.toDeadRet, m.fromSwap) = _keeperBuy(MAXC);
        (m.poolOut, m.ethIn, m.wtMid, m.toDead) = _poolOutFromLogs(vm.getRecordedLogs());
        (, m.t1) = _v4Slot0();

        assertEq(_bal(TBLOCK, DEST) - m.dead0, m.toDead, "dEaD rose by exactly the event amount");
        assertEq(m.toDeadRet, m.toDead);
        assertGe(m.toDead, m.fromSwap);
        assertEq(_bal(TBLOCK, address(bb)), 0, "0 TBLOCK");
        assertEq(_bal(WTCOIN, address(bb)), 0, "0 wtCOIN");
        assertEq(_bal(WETH, address(bb)), 0, "0 WETH");
        assertEq(m.ethIn, MAXC, "keeper: no tip, the whole amount is swapped");
        assertEq(address(bb).balance, 0.01 ether - MAXC);
        assertEq(keeper.balance, 0, "keeper never receives ETH");
        _report(m);
    }

    function _report(M memory m) internal view {
        uint256 hookPpm = (m.poolOut - m.fromSwap) * 1e6 / m.poolOut;
        uint256 moved = uint256(int256(m.t0) - int256(m.t1));
        uint256 wtIdeal = (m.ethIn * m.v3Sqrt / 2 ** 96) * m.v3Sqrt / 2 ** 96;
        uint256 tbIdealFromWt = (m.wtMid * m.v4Sqrt / 2 ** 96) * m.v4Sqrt / 2 ** 96;
        uint256 tbIdeal = (wtIdeal * m.v4Sqrt / 2 ** 96) * m.v4Sqrt / 2 ** 96;
        uint256 floor = bb.v4Floor(m.wtMid, m.v4Sqrt, _v4ProtocolFee0());
        console2.log("v4 protocolFee zeroForOne (pips)", _v4ProtocolFee0());
        console2.log("ETH swapped (wei)              ", m.ethIn);
        console2.log("wtCOIN mid (wei)               ", m.wtMid);
        console2.log("leg1 cost vs v3 mid (bps)      ", (wtIdeal - m.wtMid) * 10_000 / wtIdeal);
        console2.log("pool-side TBLOCK out (wei)     ", m.poolOut);
        console2.log("TBLOCK from swap, to us (wei)  ", m.fromSwap);
        console2.log("hook cut (wei)                 ", m.poolOut - m.fromSwap);
        console2.log("hook cut (ppm of pool output)  ", hookPpm);
        console2.log("hook/other -> dEaD (wei)       ", m.toDead - m.fromSwap);
        console2.log("leg2 cost vs v4 mid (bps)      ", (tbIdealFromWt - m.fromSwap) * 10_000 / tbIdealFromWt);
        console2.log("TBLOCK to dEaD total (wei)     ", m.toDead);
        console2.log("end-to-end cost vs mid (bps)   ", (tbIdeal - m.fromSwap) * 10_000 / tbIdeal);
        console2.log("v4 ticks moved at MAX_PER_CALL ", moved);
        console2.log("v4 floor (wei)                 ", floor);
        console2.log("output / floor (ppm)           ", m.fromSwap * 1e6 / floor);
        assertLe(hookPpm, bb.MAX_HOOK_PPM(), "measured hook cut within MAX_HOOK_PPM");
        assertGe(m.fromSwap, floor, "honest call clears the floor");
        // reviewer bar: honest impact well below 4 x (30 bps LP + hook cut). Asserted below 1 x.
        assertLt(moved * 100, 3000 + hookPpm, "honest v4 impact < 1x (LP fee + hook cut)");
    }

    // ---------------------------------------------------------------- who may call, when

    function test_keeper_first_public_after_delay() public {
        _fund(bb, 1 ether);
        uint256 funded = block.timestamp;
        (uint256 kAt, uint256 pAt) = bb.readyAt();
        assertEq(kAt, funded);
        assertEq(pAt, funded + 6 hours);

        vm.prank(anyone, anyone);
        vm.expectRevert(abi.encodeWithSelector(TBlockBuyback.TooEarly.selector, funded + 6 hours));
        bb.buyback(MAXC);

        _keeperBuy(MAXC);
        assertEq(address(bb).balance, 1 ether - MAXC);

        vm.prank(keeper, keeper);
        vm.expectRevert(abi.encodeWithSelector(TBlockBuyback.TooEarly.selector, funded + 1 hours));
        bb.buyback(MAXC);

        vm.warp(funded + 1 hours);
        vm.roll(block.number + 1);
        vm.prank(anyone, anyone);
        vm.expectRevert(abi.encodeWithSelector(TBlockBuyback.TooEarly.selector, funded + 7 hours));
        bb.buyback(MAXC);

        // keeper "dies": public may call once the pot has been ready for PUBLIC_DELAY, and is tipped
        vm.warp(funded + 7 hours);
        vm.roll(block.number + 1);
        uint256 a0 = anyone.balance;
        vm.prank(anyone, anyone);
        bb.buyback(MAXC);
        assertEq(anyone.balance - a0, MAXC * 50 / 10_000, "public tip");
        assertEq(address(bb).balance, 1 ether - 2 * MAXC);
    }

    function test_fundedAt_restartsPublicDelay_afterEmptyPot() public {
        _fund(bb, MAXC);
        _keeperBuy(MAXC);
        assertEq(address(bb).balance, 0);
        vm.warp(block.timestamp + 3 days);
        vm.roll(block.number + 1);
        _fund(bb, MAXC); // pot crosses MIN_SPEND now
        (uint256 kAt, uint256 pAt) = bb.readyAt();
        assertEq(kAt, block.timestamp);
        assertEq(pAt, block.timestamp + 6 hours, "an idle pot does not open the public path on a fresh deposit");
        vm.prank(anyone, anyone);
        vm.expectRevert(abi.encodeWithSelector(TBlockBuyback.TooEarly.selector, block.timestamp + 6 hours));
        bb.buyback(MAXC);
    }

    // ---------------------------------------------------------------- NEW-1: arming

    /// @notice force-sent ETH does not arm and does not open the public path; the keeper can still spend it; the owner's
    ///         next normal deposit arms and starts the delay from THAT moment.
    function test_forceSentEth_doesNotArm() public {
        vm.warp(block.timestamp + 3 days);
        new ForceSender{value: 0.01 ether}(payable(address(bb)));
        assertEq(address(bb).balance, 0.01 ether);
        assertFalse(bb.armed(), "selfdestruct ETH does not arm");
        (, uint256 pAt) = bb.readyAt();
        assertEq(pAt, type(uint256).max);
        vm.prank(anyone, anyone);
        vm.expectRevert(TBlockBuyback.NotArmed.selector);
        bb.buyback(MAXC);
        vm.warp(block.timestamp + 30 days);
        vm.prank(anyone, anyone);
        vm.expectRevert(TBlockBuyback.NotArmed.selector);
        bb.buyback(MAXC);

        _fund(bb, 0.001 ether); // owner's normal deposit
        assertTrue(bb.armed());
        assertEq(bb.fundedAt(), block.timestamp);
        (, pAt) = bb.readyAt();
        assertEq(pAt, block.timestamp + 6 hours, "delay starts at the owner's deposit");
        vm.prank(anyone, anyone);
        vm.expectRevert(abi.encodeWithSelector(TBlockBuyback.TooEarly.selector, block.timestamp + 6 hours));
        bb.buyback(MAXC);
        _keeperBuy(MAXC); // keeper path ignores armed anyway
    }

    /// @notice a 1-wei pre-deposit cannot make publicAt already past when the owner funds.
    function test_oneWeiPredeposit_cannotBackdate() public {
        vm.warp(block.timestamp + 3 days);
        _fund(bb, 1); // attacker, 1 wei: below MIN_SPEND, no arm
        assertFalse(bb.armed());
        vm.warp(block.timestamp + 1 days);
        _fund(bb, 0.01 ether); // owner
        (, uint256 pAt) = bb.readyAt();
        assertEq(pAt, block.timestamp + 6 hours);
        vm.prank(anyone, anyone);
        vm.expectRevert(abi.encodeWithSelector(TBlockBuyback.TooEarly.selector, block.timestamp + 6 hours));
        bb.buyback(MAXC);
    }

    /// @notice what an attacker CAN do: pay >= MIN_SPEND himself to arm early. The public clock then starts at HIS deposit
    ///         (not back-dated); the owner's later deposit does not restart it. A keeper that buys within PUBLIC_DELAY closes
    ///         it: after any buy, public = lastBuyAt + COOLDOWN + PUBLIC_DELAY. Disarm happens when a buy leaves < MIN_SPEND.
    function test_attackerArmsEarly_bounded() public {
        uint256 t0 = block.timestamp;
        _fund(bb, 0.0001 ether); // attacker arms at t0, paying MIN_SPEND (it will be burned)
        assertTrue(bb.armed());
        vm.warp(t0 + 1 hours);
        _fund(bb, 0.01 ether); // owner: already armed, clock NOT restarted
        (, uint256 pAt) = bb.readyAt();
        assertEq(pAt, t0 + 6 hours, "measured from the attacker's arming, never earlier");
        _keeperBuy(MAXC); // live keeper
        (, pAt) = bb.readyAt();
        assertEq(pAt, t0 + 1 hours + 1 hours + 6 hours, "keeper buy pushes the public path out");
        vm.warp(t0 + 6 hours);
        vm.prank(anyone, anyone);
        vm.expectRevert(abi.encodeWithSelector(TBlockBuyback.TooEarly.selector, t0 + 8 hours));
        bb.buyback(MAXC);
    }

    // ---------------------------------------------------------------- L-1: arm()

    function test_arm_wethOnlyFunding() public {
        vm.warp(block.timestamp + 2 days);
        deal(WETH, address(bb), 0.01 ether); // funded as a token: receive() never ran
        assertFalse(bb.armed());
        (, uint256 pAt) = bb.readyAt();
        assertEq(pAt, type(uint256).max, "public path closed");
        vm.prank(anyone, anyone);
        vm.expectRevert(TBlockBuyback.NotArmed.selector);
        bb.buyback(MAXC);

        vm.prank(anyone);
        assertTrue(bb.arm());
        assertEq(_bal(WETH, address(bb)), 0, "WETH unwrapped");
        assertEq(address(bb).balance, 0.01 ether, "ETH stays here");
        assertEq(bb.fundedAt(), block.timestamp);
        (, pAt) = bb.readyAt();
        assertEq(pAt, block.timestamp + 6 hours, "public time = now + PUBLIC_DELAY");
        vm.prank(anyone, anyone);
        vm.expectRevert(abi.encodeWithSelector(TBlockBuyback.TooEarly.selector, block.timestamp + 6 hours));
        bb.buyback(MAXC);
    }

    function test_arm_forceSentEth() public {
        new ForceSender{value: 0.01 ether}(payable(address(bb)));
        assertFalse(bb.armed());
        vm.prank(anyone);
        assertTrue(bb.arm());
        assertEq(bb.fundedAt(), block.timestamp);
        assertEq(address(bb).balance, 0.01 ether);
    }

    function test_arm_noopWhenArmed() public {
        _fund(bb, 0.01 ether);
        uint256 f = bb.fundedAt();
        (, uint256 p0) = bb.readyAt();
        vm.warp(block.timestamp + 5 hours);
        vm.prank(anyone);
        assertTrue(bb.arm());
        assertEq(bb.fundedAt(), f, "fundedAt unchanged");
        (, uint256 p1) = bb.readyAt();
        assertEq(p1, p0, "public time unchanged");
    }

    /// @notice arm() can only set fundedAt to NOW while disarmed: never backwards, never inside the keeper window.
    function test_arm_cannotBackdateOrSkipKeeperWindow() public {
        _fund(bb, 0.0101 ether);
        _keeperBuy(MAXC);
        uint256 lb = bb.lastBuyAt();
        uint256 f = bb.fundedAt();
        vm.prank(anyone);
        bb.arm(); // armed already: no-op
        (, uint256 pAt) = bb.readyAt();
        assertEq(pAt, lb + 1 hours + 6 hours, "arm() does not shorten the keeper window");
        assertEq(bb.fundedAt(), f);
        // drain below MIN_SPEND with keeper buys -> disarmed; arm() with too little does nothing
        for (uint256 i; i < 4; ++i) {
            vm.warp(block.timestamp + 1 hours);
            vm.roll(block.number + 1);
            _keeperBuy(MAXC);
        }
        assertEq(address(bb).balance, 0.0001 ether);
        _keeperBuy2(0.0001 ether); // balance 0 -> disarmed
        assertFalse(bb.armed());
        vm.prank(anyone);
        assertFalse(bb.arm(), "below MIN_SPEND: stays disarmed");
        // re-armed later only at NOW, never earlier than the previous fundedAt
        vm.warp(block.timestamp + 2 hours);
        new ForceSender{value: 0.01 ether}(payable(address(bb)));
        vm.prank(anyone);
        assertTrue(bb.arm());
        assertEq(bb.fundedAt(), block.timestamp);
        assertGt(bb.fundedAt(), f, "fundedAt only moves forward");
        (, pAt) = bb.readyAt();
        assertEq(pAt, block.timestamp + 6 hours);
    }

    function _keeperBuy2(uint256 amount) internal {
        vm.warp(block.timestamp + 1 hours);
        vm.roll(block.number + 1);
        _keeperBuy(amount);
    }

    function test_disarm_whenBuyLeavesLessThanMinSpend() public {
        _fund(bb, MAXC + 0.00005 ether);
        assertTrue(bb.armed());
        _keeperBuy(MAXC);
        assertEq(address(bb).balance, 0.00005 ether);
        assertFalse(bb.armed(), "below MIN_SPEND: disarmed");
        _fund(bb, 1); // any normal send re-arms once the balance is >= MIN_SPEND
        assertFalse(bb.armed());
        _fund(bb, 0.00005 ether);
        assertTrue(bb.armed());
        assertEq(bb.fundedAt(), block.timestamp);
    }

    /// @notice NEW-3 on the real PoolManager: set the pool's zeroForOne protocol fee to the v4 max (1000 pips) in storage;
    ///         the PoolManager then really charges it, the floor subtracts it, and the honest buy still clears.
    function test_protocolFee_accountedOnFork() public {
        bytes32 slot = keccak256(abi.encode(POOL_ID, uint256(6)));
        uint256 v = uint256(vm.load(PM, slot));
        assertEq((v >> 184) & 0xffffff, 0, "protocol fee is 0 on Base today");
        uint256 snap = vm.snapshotState();
        _fund(bb, MAXC);
        (, uint256 noFee) = _keeperBuy(MAXC);
        vm.revertToState(snap);
        vm.store(PM, slot, bytes32(v | (uint256(1000) << 184)));
        assertEq(_v4ProtocolFee0(), 1000);
        _fund(bb, MAXC);
        (, uint256 withFee) = _keeperBuy(MAXC);
        console2.log("TBLOCK out, protocolFee 0    ", noFee);
        console2.log("TBLOCK out, protocolFee 1000 ", withFee);
        assertLt(withFee, noFee, "the PoolManager charged the protocol fee");
    }

    // ---------------------------------------------------------------- T-1: the floor reads the RIGHT protocol-fee half

    /// @notice (a) only the oneForZero half (upper 12 bits, bit offset 196) set: our zeroForOne buy is not charged.
    function test_protocolFee_upperHalf_notCharged() public {
        bytes32 slot = keccak256(abi.encode(POOL_ID, uint256(6)));
        uint256 v = uint256(vm.load(PM, slot));
        uint256 snap = vm.snapshotState();
        _fund(bb, MAXC);
        (, uint256 noFee) = _keeperBuy(MAXC);
        vm.revertToState(snap);
        vm.store(PM, slot, bytes32(v | (uint256(1000) << 196)));
        assertEq(_v4ProtocolFee0(), 0, "zeroForOne half still 0");
        assertEq((uint256(vm.load(PM, slot)) >> 196) & 0xfff, 1000, "oneForZero half = 1000");
        _fund(bb, MAXC);
        (, uint256 withUpper) = _keeperBuy(MAXC);
        assertEq(withUpper, noFee, "output unchanged");
    }

    /// @notice (b) zeroForOne half (lower 12 bits) = 1000. Budget H_disc is computed so the floor equals the measured output
    ///         ONLY if the 1000 pips are subtracted: it passes, and the same floor without the subtraction would be above
    ///         the output. A tighter budget reverts OutputTooLow; the normal budget passes.
    function test_protocolFee_lowerHalf_floor() public {
        bytes32 slot = keccak256(abi.encode(POOL_ID, uint256(6)));
        uint256 v = uint256(vm.load(PM, slot));
        vm.store(PM, slot, bytes32(v | uint256(1000) << 184));
        assertEq(_v4ProtocolFee0(), 1000);
        (uint160 sqrtP,) = _v4Slot0();

        uint256 snap = vm.snapshotState();
        _fund(bb, MAXC);
        vm.recordLogs();
        (, uint256 out) = _keeperBuy(MAXC); // normal budget (MAX_HOOK_PPM 12000): passes
        (,, uint256 wtMid,) = _poolOutFromLogs(vm.getRecordedLogs());
        vm.revertToState(snap);

        uint256 atMid = bb.mulDiv(bb.mulDiv(wtMid, sqrtP, 2 ** 96), sqrtP, 2 ** 96);
        uint256 ratioPpm = out * 1e6 / atMid;
        uint256 hDisc = 1e6 - 3000 - 6000 - 1000 - ratioPpm;
        console2.log("out / mid with protocol fee (ppm)", ratioPpm);
        console2.log("discriminating MAX_HOOK_PPM      ", hDisc);
        assertGe(hDisc, 2000);

        TBlockBuyback.Config memory c = _cfg();
        c.maxHookPpm = uint24(hDisc);
        TBlockBuyback disc = new TBlockBuyback(c);
        assertLe(disc.v4Floor(wtMid, sqrtP, 1000), out, "floor with the right half <= output");
        assertGt(disc.v4Floor(wtMid, sqrtP, 0), out, "floor ignoring the fee would be above the output");
        _fund(disc, MAXC);
        vm.prank(keeper, keeper);
        (, uint256 outDisc) = disc.buyback(MAXC);
        assertEq(outDisc, out, "passes only because the lower half is subtracted");

        snap = vm.snapshotState();
        c.maxHookPpm = uint24(hDisc - 2000);
        TBlockBuyback tight = new TBlockBuyback(c);
        _fund(tight, MAXC);
        vm.prank(keeper, keeper);
        vm.expectPartialRevert(TBlockBuyback.OutputTooLow.selector);
        tight.buyback(MAXC);
        vm.revertToState(snap);
    }

    function test_keeperZero_isPublicOnly() public {
        TBlockBuyback.Config memory c = _cfg();
        c.keeper = address(0);
        TBlockBuyback pub = new TBlockBuyback(c);
        assertEq(pub.PUBLIC_DELAY(), 0);
        _fund(pub, 2 * MAXC);
        vm.prank(anyone, anyone);
        pub.buyback(MAXC);
        vm.prank(address(0), address(0));
        vm.expectRevert(abi.encodeWithSelector(TBlockBuyback.TooEarly.selector, block.timestamp + 1 hours));
        pub.buyback(MAXC); // address(0) is not a keeper
    }

    // ---------------------------------------------------------------- amount (SEC-003)

    function test_amount_bounds() public {
        _fund(bb, 0.0015 ether);
        vm.startPrank(keeper, keeper);
        vm.expectRevert(TBlockBuyback.BadAmount.selector);
        bb.buyback(0.0001 ether - 1);
        vm.expectRevert(TBlockBuyback.BadAmount.selector);
        bb.buyback(0.0015 ether + 1); // > balance
        vm.stopPrank();
        _fund(bb, 1 ether);
        vm.prank(keeper, keeper);
        vm.expectRevert(TBlockBuyback.BadAmount.selector);
        bb.buyback(MAXC + 1);
        assertEq(bb.lastBuyAt(), 0, "a revert does not consume the cooldown");
        _keeperBuy(0.0001 ether); // smaller is always allowed
        assertEq(address(bb).balance, 1.0015 ether - 0.0001 ether);
        assertEq(_bal(WTCOIN, address(bb)), 0);
    }

    function test_empty_reverts() public {
        vm.prank(keeper, keeper);
        vm.expectRevert(TBlockBuyback.BadAmount.selector);
        bb.buyback(0.0001 ether);
    }

    function test_strayWeth_isUnwrappedAndCapped_strayTblock_goesToDead() public {
        deal(WETH, address(bb), 0.005 ether);
        vm.prank(DEAD);
        IERC20Min(TBLOCK).transfer(address(bb), 1000 ether); // B20 transfer from dEaD on the fork (prank only)
        uint256 dead0 = _bal(TBLOCK, DEST);
        (uint256 toDead, uint256 fromSwap) = _keeperBuy(MAXC);
        assertEq(_bal(WETH, address(bb)), 0);
        assertEq(address(bb).balance, 0.003 ether, "stray WETH became ETH, only the amount was spent");
        assertEq(_bal(TBLOCK, address(bb)), 0);
        assertEq(_bal(TBLOCK, DEST) - dead0, toDead);
        assertGe(toDead, fromSwap + 1000 ether);
    }

    function test_sweepToDead() public {
        vm.prank(DEAD);
        IERC20Min(TBLOCK).transfer(address(bb), 5 ether);
        uint256 dead0 = _bal(TBLOCK, DEST);
        vm.prank(address(0xABC));
        assertEq(bb.sweepToDest(), 5 ether);
        assertEq(_bal(TBLOCK, DEST) - dead0, 5 ether);
        assertEq(_bal(TBLOCK, address(bb)), 0);
    }

    function test_tipRejected_doesNotBlock() public {
        _fund(bb, MAXC);
        vm.warp(block.timestamp + 6 hours);
        bb.buyback(MAXC); // this test contract (public, no receive()) forfeits the tip
        assertEq(address(bb).balance, MAXC * 50 / 10_000, "tip kept, swap done");
        assertEq(_bal(WTCOIN, address(bb)), 0);
    }

    /// @notice nobody — deployer, funder, keeper, random — can get ETH out except through buyback()'s swap + public tip.
    function test_noWithdraw_anyone() public {
        _fund(bb, 0.5 ether);
        bytes4[9] memory sels = [
            bytes4(keccak256("withdraw()")), bytes4(keccak256("withdraw(uint256)")), bytes4(keccak256("rescue(address)")),
            bytes4(keccak256("rescueETH()")), bytes4(keccak256("owner()")), bytes4(keccak256("transferOwnership(address)")),
            bytes4(keccak256("sweep(address)")), bytes4(keccak256("emergencyWithdraw()")), bytes4(keccak256("execute(address,uint256,bytes)"))
        ];
        address[4] memory who = [address(this), address(0xF00D), keeper, address(0xBAD)];
        for (uint256 i; i < sels.length; ++i) {
            for (uint256 j; j < who.length; ++j) {
                vm.prank(who[j]);
                (bool ok,) = address(bb).call(abi.encodeWithSelector(sels[i], who[j], 0.5 ether, ""));
                assertFalse(ok, "unknown selector must revert");
            }
        }
        vm.expectRevert(TBlockBuyback.NotPool.selector);
        bb.uniswapV3SwapCallback(1 ether, 0, "");
        vm.prank(V3);
        vm.expectRevert(TBlockBuyback.NotPool.selector);
        bb.uniswapV3SwapCallback(1 ether, 0, "");
        vm.expectRevert(TBlockBuyback.NotPoolManager.selector);
        bb.unlockCallback(abi.encode(uint256(1)));
        vm.prank(PM);
        vm.expectRevert(TBlockBuyback.NotPoolManager.selector);
        bb.unlockCallback(abi.encode(uint256(1)));
        bb.sweepToDest();
        assertEq(address(bb).balance, 0.5 ether, "ETH untouched");
    }

    // ---------------------------------------------------------------- price guards

    function test_v4Impact_guard() public {
        TBlockBuyback.Config memory c = _cfg();
        c.maxV4ImpactTicks = 1;
        TBlockBuyback strict = new TBlockBuyback(c);
        _fund(strict, MAXC);
        vm.prank(keeper, keeper);
        vm.expectPartialRevert(TBlockBuyback.ImpactTooHigh.selector);
        strict.buyback(MAXC);
        assertEq(address(strict).balance, MAXC, "fail closed: nothing spent");
    }

    /// @notice SEC-002: with MAX_HOOK_PPM = 0 the floor (0.3 % LP + 0.6 % impact slack only) must reject the real hook cut.
    function test_v4Floor_guard() public {
        TBlockBuyback.Config memory c = _cfg();
        c.maxHookPpm = 0;
        TBlockBuyback strict = new TBlockBuyback(c);
        _fund(strict, MAXC);
        vm.prank(keeper, keeper);
        vm.expectPartialRevert(TBlockBuyback.OutputTooLow.selector);
        strict.buyback(MAXC);
        assertEq(address(strict).balance, MAXC, "fail closed: nothing spent");
    }

    function test_v3Twap_guard_blocksManipulatedPool() public {
        Swapper s = new Swapper();
        deal(WETH, address(s), 0.05 ether);
        (, int24 t0,,,,,) = IV3PoolMin(V3).slot0();
        s.v3(true, 0.05 ether);
        (, int24 t1,,,,,) = IV3PoolMin(V3).slot0();
        console2.log("v3 ticks pushed down by 0.05 WETH", uint256(int256(t0) - int256(t1)));
        _fund(bb, MAXC);
        vm.prank(keeper, keeper);
        vm.expectPartialRevert(TBlockBuyback.PriceOffTwap.selector);
        bb.buyback(MAXC);
        assertEq(address(bb).balance, MAXC, "fail closed");
    }

    // ---------------------------------------------------------------- sandwich (SEC-001, SEC-006): ASSERTED

    /// @notice keeper path: an attacker cannot wrap the buy (TooEarly). If he manages to order his own txs around the keeper's
    ///         tx, he LOSES wtCOIN at every measured size at MAX_PER_CALL.
    function test_sandwich_keeperPath_attackerLoses() public {
        _fund(bb, MAXC);
        Swapper s = new Swapper();
        deal(WTCOIN, address(s), 1 ether);
        vm.expectRevert(abi.encodeWithSelector(TBlockBuyback.TooEarly.selector, block.timestamp + 6 hours));
        s.atomicSandwich(bb, 0.2 ether, MAXC);

        uint256 snap = vm.snapshotState();
        (, uint256 fair) = _keeperBuy(MAXC);
        vm.revertToState(snap);

        uint256[4] memory sizes = [uint256(0.01 ether), 0.05 ether, 0.2 ether, 1 ether];
        for (uint256 i; i < sizes.length; ++i) {
            snap = vm.snapshotState();
            Swapper a = new Swapper();
            deal(WTCOIN, address(a), sizes[i]);
            uint256 tb = a.v4(true, sizes[i]);                 // tx 1: front-run
            (, uint256 victim) = _keeperBuy(MAXC);             // tx 2: keeper
            uint256 back = a.v4(false, tb);                    // tx 3: back-run
            console2.log("keeper path, front-run wtCOIN  ", sizes[i]);
            console2.log("  victim loss (bps)            ", (fair - victim) * 10_000 / fair);
            console2.log("  attacker loss wtCOIN (wei)   ", sizes[i] - back);
            assertLt(back, sizes[i], "attacker loses");
            vm.revertToState(snap);
        }
    }

    /// @notice public path (keeper silent for PUBLIC_DELAY): atomic sandwich is possible; asserted unprofitable INCLUDING the
    ///         tip (tip valued at 20 wtCOIN/ETH, above the measured ~15.6 v3 spot, i.e. conservative against the attacker).
    function test_sandwich_publicPath_atomic_attackerLoses() public {
        _fund(bb, MAXC);
        vm.warp(block.timestamp + 6 hours);
        vm.roll(block.number + 1);
        uint256[4] memory sizes = [uint256(0.01 ether), 0.05 ether, 0.2 ether, 1 ether];
        for (uint256 i; i < sizes.length; ++i) {
            uint256 snap = vm.snapshotState();
            Swapper a = new Swapper();
            deal(WTCOIN, address(a), sizes[i]);
            uint256 back = a.atomicSandwich(bb, sizes[i], MAXC);
            uint256 tipInWt = address(a).balance * 20;
            console2.log("public atomic, front-run wtCOIN", sizes[i]);
            console2.log("  attacker loss wtCOIN (wei)   ", sizes[i] - back);
            console2.log("  tip received (wei ETH)       ", address(a).balance);
            assertGt(sizes[i], back + tipInWt, "attacker loses even with the tip");
            vm.revertToState(snap);
        }
    }
}
