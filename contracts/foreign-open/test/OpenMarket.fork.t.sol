// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "v4-core/test/PoolModifyLiquidityTest.sol";
import {LiquidityAmounts} from "./LiquidityAmounts.sol";
import {TBlockOpenMarketHook} from "../src/TBlockOpenMarketHook.sol";

interface IERC20L {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

interface IFeeEscrowO1 {
    function owed(address, address) external view returns (uint256);
}

/// FORK ONLY (Base mainnet, pinned block 52074194, Base build of forge: BRIAN is the REAL B20 precompile).
/// Nothing is broadcast. a6cf is never a sender: it only RECEIVES, and every assertion is a wei-exact delta.
contract OpenMarketForkTest is Test {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant SINK = 0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4;
    /// BRIAN, launched by LaunchBlitz through the o1 Standard factory 0x1176…63dC (tx 0xc9d2fe34…)
    address constant BRIAN = 0xb2000000000000000000002EEFeBd3dd6Ef2d601;
    address constant O1_HOOK = 0x1f91c998e7c2F4b690D75BDBf6502BDcD6e02AcC;
    address constant O1_ESCROW = 0xB3F11a3fb06A88059b7F7F423Ec0Dda506356866;
    address constant O1_PLATFORM = 0x1cAa1962428382106Eb3f29B9719bdF797621C90;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    uint24 constant HOOK_FEE = 2000; // 0.20 % of the ETH leg -> a6cf
    uint24 constant LP_FEE = 3000; // 0.30 % to LPs (ordinary v4 LP fee)
    int24 constant SPACING = 60;
    uint160 constant FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
    );

    PoolSwapTest swapR;
    PoolModifyLiquidityTest liqR;
    TBlockOpenMarketHook hook;
    PoolKey o1Key;
    PoolKey tbKey;
    address lp = makeAddr("tb-open-lp-20261002");
    address buyer = makeAddr("tb-open-buyer-20261002");

    function setUp() public {
        swapR = new PoolSwapTest(PM);
        liqR = new PoolModifyLiquidityTest(PM);
        hook = _deployHook();
        o1Key = PoolKey(Currency.wrap(address(0)), Currency.wrap(BRIAN), 0, 200, IHooks(O1_HOOK));
        tbKey = PoolKey(Currency.wrap(address(0)), Currency.wrap(BRIAN), LP_FEE, SPACING, IHooks(address(hook)));
        vm.deal(lp, 10 ether);
        vm.deal(buyer, 10 ether);
    }

    // ── helpers ──
    function _deployHook() internal returns (TBlockOpenMarketHook h) {
        bytes memory init = abi.encodePacked(type(TBlockOpenMarketHook).creationCode, abi.encode(PM, SINK, HOOK_FEE));
        bytes32 ih = keccak256(init);
        uint160 mask = uint160(Hooks.ALL_HOOK_MASK);
        for (uint256 s; s < 200_000; ++s) {
            address a = vm.computeCreate2Address(bytes32(s), ih, CREATE2_DEPLOYER);
            if (uint160(a) & mask == FLAGS && a.code.length == 0) {
                (bool ok,) = CREATE2_DEPLOYER.call(abi.encodePacked(bytes32(s), init));
                require(ok, "create2");
                return TBlockOpenMarketHook(payable(a));
            }
        }
        revert("salt not found");
    }

    function _buyOnO1(address who, uint256 ethIn, bytes memory hookData) internal returns (BalanceDelta d) {
        vm.prank(who);
        d = swapR.swap{value: ethIn}(
            o1Key,
            IPoolManager.SwapParams(true, -int256(ethIn), TickMath.MIN_SQRT_PRICE + 1),
            PoolSwapTest.TestSettings(false, false),
            hookData
        );
    }

    /// LP buys BRIAN on o1 (fork only), opens the TB market at the SAME price, adds two-sided liquidity.
    function _openAndFill(uint256 ethForTokens, uint256 ethSide) internal {
        _buyOnO1(lp, ethForTokens, "");
        uint256 bal = IERC20L(BRIAN).balanceOf(lp);
        (uint160 sqrtP,,,) = PM.getSlot0(o1Key.toId());
        PM.initialize(tbKey, sqrtP);
        (, int24 tick,,) = PM.getSlot0(tbKey.toId());
        int24 lo = (tick / SPACING) * SPACING - SPACING * 100;
        int24 hi = (tick / SPACING) * SPACING + SPACING * 100;
        uint128 L = LiquidityAmounts.getLiquidityForAmounts(
            sqrtP, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), ethSide, bal
        );
        vm.startPrank(lp);
        IERC20L(BRIAN).approve(address(liqR), type(uint256).max);
        liqR.modifyLiquidity{value: ethSide + 1e15}(
            tbKey, IPoolManager.ModifyLiquidityParams(lo, hi, int256(uint256(L)), bytes32(0)), ""
        );
        vm.stopPrank();
    }

    // ── positive: fee to a6cf, wei-exact ──
    function test_buyExactIn_feeToSink_weiExact() public {
        _openAndFill(0.05 ether, 0.05 ether);
        uint256 s0 = SINK.balance;
        uint256 amt = 0.01 ether;
        vm.prank(buyer);
        BalanceDelta d = swapR.swap{value: amt}(
            tbKey, IPoolManager.SwapParams(true, -int256(amt), TickMath.MIN_SQRT_PRICE + 1),
            PoolSwapTest.TestSettings(false, false), ""
        );
        assertEq(SINK.balance - s0, amt * HOOK_FEE / 1e6, "sink = 0.20 % of 0.01 ETH");
        assertEq(SINK.balance - s0, 20_000_000_000_000);
        assertEq(-int256(d.amount0()), int256(amt), "buyer paid exactly amt");
        assertGt(d.amount1(), 0, "buyer received BRIAN");
    }

    function test_sellExactIn_feeToSink_weiExact() public {
        _openAndFill(0.05 ether, 0.05 ether);
        uint256 sell = IERC20L(BRIAN).balanceOf(lp) / 10; // what the LP kept outside the range math
        if (sell == 0) {
            _buyOnO1(buyer, 0.005 ether, "");
        } else {
            vm.prank(lp);
            (bool ok,) = BRIAN.call(abi.encodeWithSignature("transfer(address,uint256)", buyer, sell));
            require(ok);
        }
        uint256 tok = IERC20L(BRIAN).balanceOf(buyer);
        vm.startPrank(buyer);
        IERC20L(BRIAN).approve(address(swapR), type(uint256).max);
        uint256 s0 = SINK.balance;
        BalanceDelta d = swapR.swap(
            tbKey, IPoolManager.SwapParams(false, -int256(tok), TickMath.MAX_SQRT_PRICE - 1),
            PoolSwapTest.TestSettings(false, false), ""
        );
        vm.stopPrank();
        uint256 fee = SINK.balance - s0;
        uint256 recu = uint256(int256(d.amount0()));
        assertEq(fee, (recu + fee) * HOOK_FEE / 1e6, "sink = floor(0.20 % of the gross ETH moved)");
        assertGt(fee, 0);
        console2.log("sell exact-in: ETH to seller", recu, "ETH to a6cf", fee);
    }

    function test_buyExactOut_feeToSink_weiExact() public {
        _openAndFill(0.05 ether, 0.05 ether);
        uint256 s0 = SINK.balance;
        uint256 want = 1_000_000 ether; // 1M BRIAN out
        vm.prank(buyer);
        BalanceDelta d = swapR.swap{value: 1 ether}(
            tbKey, IPoolManager.SwapParams(true, int256(want), TickMath.MIN_SQRT_PRICE + 1),
            PoolSwapTest.TestSettings(false, false), ""
        );
        uint256 fee = SINK.balance - s0;
        uint256 paye = uint256(-int256(d.amount0()));
        assertEq(uint256(int256(d.amount1())), want);
        assertEq(fee, (paye - fee) * HOOK_FEE / 1e6, "sink = floor(0.20 % of the ETH the pool moved)");
    }

    // ── negative controls ──
    function test_neg_o1PoolUntouched_noReferrer_sinkZero() public {
        uint256 s0 = SINK.balance;
        uint256 e0 = IFeeEscrowO1(O1_ESCROW).owed(SINK, address(0));
        _buyOnO1(buyer, 0.01 ether, "");
        assertEq(SINK.balance, s0, "our hook never fees a pool it is not in");
        assertEq(IFeeEscrowO1(O1_ESCROW).owed(SINK, address(0)), e0, "no referrer, no o1 credit");
    }

    function test_o1Referrer_isDisclosedShareNotExtraCost_weiExact() public {
        uint256 amt = 0.01 ether;
        uint256 e0 = IFeeEscrowO1(O1_ESCROW).owed(SINK, address(0));
        uint256 p0 = IFeeEscrowO1(O1_ESCROW).owed(O1_PLATFORM, address(0));
        uint256 snap = vm.snapshotState();
        BalanceDelta dNo = _buyOnO1(buyer, amt, "");
        vm.revertToState(snap);
        BalanceDelta dRef = _buyOnO1(buyer, amt, abi.encode(SINK, bytes32("tokenizedblock")));
        assertEq(IFeeEscrowO1(O1_ESCROW).owed(SINK, address(0)) - e0, amt * 20 / 10_000, "a6cf = 0.20 % (o1 REFERRER row)");
        assertEq(IFeeEscrowO1(O1_ESCROW).owed(O1_PLATFORM, address(0)) - p0, amt * 30 / 10_000, "platform 0.30 %");
        assertEq(dRef.amount1(), dNo.amount1(), "the buyer gets EXACTLY the same tokens: the referrer share is not an extra cost");
    }

    function test_neg_nonEthPair_reverts() public {
        PoolKey memory k = PoolKey(Currency.wrap(USDC), Currency.wrap(BRIAN), LP_FEE, SPACING, IHooks(address(hook)));
        vm.expectRevert();
        PM.initialize(k, TickMath.getSqrtPriceAtTick(0));
    }

    function test_neg_dynamicOrHighLpFee_reverts() public {
        PoolKey memory k = PoolKey(Currency.wrap(address(0)), Currency.wrap(BRIAN), 0x800000, SPACING, IHooks(address(hook)));
        vm.expectRevert();
        PM.initialize(k, TickMath.getSqrtPriceAtTick(0));
        PoolKey memory k2 = PoolKey(Currency.wrap(address(0)), Currency.wrap(BRIAN), 10_001, SPACING, IHooks(address(hook)));
        vm.expectRevert();
        PM.initialize(k2, TickMath.getSqrtPriceAtTick(0));
    }

    function test_neg_swapBeforeLiquidity_reverts() public {
        (uint160 sqrtP,,,) = PM.getSlot0(o1Key.toId());
        PM.initialize(tbKey, sqrtP);
        vm.prank(buyer);
        vm.expectRevert();
        swapR.swap{value: 0.001 ether}(
            tbKey, IPoolManager.SwapParams(true, -int256(0.001 ether), TickMath.MIN_SQRT_PRICE + 1),
            PoolSwapTest.TestSettings(false, false), ""
        );
    }

    /// Price comparison for the routing rule: same 0.01 ETH buy, o1 pool (1 % hook fee) vs TB open pool
    /// (0.30 % LP + 0.20 % a6cf). Logged, not asserted: depth decides, and the app quotes both live.
    function test_info_compareOutputs() public {
        _openAndFill(0.05 ether, 0.05 ether);
        uint256 amt = 0.001 ether;
        uint256 snap = vm.snapshotState();
        BalanceDelta a = _buyOnO1(buyer, amt, "");
        vm.revertToState(snap);
        vm.prank(buyer);
        BalanceDelta b = swapR.swap{value: amt}(
            tbKey, IPoolManager.SwapParams(true, -int256(amt), TickMath.MIN_SQRT_PRICE + 1),
            PoolSwapTest.TestSettings(false, false), ""
        );
        console2.log("0.001 ETH -> BRIAN on o1 pool  :", uint256(int256(a.amount1())));
        console2.log("0.001 ETH -> BRIAN on TB pool  :", uint256(int256(b.amount1())));
    }
}
