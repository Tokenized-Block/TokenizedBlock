// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// ZERO 1 — OPEN RISK #1, Universal Router multi-command: two V4_SWAP commands = two PM unlocks in ONE tx sharing the
// hook's transient net. cmd1: hooked buy X, then sell that X straight into a HOOKLESS v4 pool (netted, no transfer).
// cmd2: buy back from the hookless pool and TAKE -> how much credit does the leftover hooked net create? FORK ONLY.
import {console2} from "forge-std/console2.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {LiquidityAmounts} from "../src/lib/LiquidityAmounts.sol";
import {TBlockBloc24h} from "../src/TBlockBloc24h.sol";
import {LLBase, IERC20L} from "./LLBase.sol";
import {IUR, IPermit2, ExactInputSingleParams} from "./Helpers24h.sol";

contract Z1URMultiCommandTest is LLBase {
    function _permit2(address qui, address token) internal {
        vm.startPrank(qui);
        IERC20L(token).approve(PERMIT2, type(uint256).max);
        IPermit2(PERMIT2).approve(token, UR, type(uint160).max, uint48(block.timestamp + 30 days));
        vm.stopPrank();
    }

    function _k2(L memory l) internal returns (PoolKey memory k2) {
        k2 = PoolKey(l.key.currency0, l.key.currency1, 3000, 200, IHooks(address(0)));
        PM.initialize(k2, l.sp);
        int24 t0 = TickMath.getTickAtSqrtPrice(l.sp);
        _fundStock(NVDAc, carol, 10 * UN);
        _approve(carol, NVDAc);
        (int24 a, int24 b) = l.devise0 ? (t0 + 200, t0 + 6000) : (t0 - 6000, t0 - 200);
        uint128 L2 = l.devise0
            ? LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(a), TickMath.getSqrtPriceAtTick(b), 5 * UN)
            : LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(a), TickMath.getSqrtPriceAtTick(b), 5 * UN);
        vm.prank(carol);
        lp.modifyLiquidity(k2, IPoolManager.ModifyLiquidityParams(a, b, int256(uint256(L2)), bytes32(0)), "");
    }

    /// forge-config: default.isolate = true
    function test_U1_twoV4SwapCommands_oneTx() public fork {
        L memory l = _lancer(_hook24h(), NVDAc, MINIMUM, "XCUR");
        PoolKey memory k2 = _k2(l);
        _fundStock(NVDAc, alice, 5 * UN);
        _permit2(alice, NVDAc);
        _permit2(alice, address(l.t));
        bytes[] memory inputs = new bytes[](2);
        {
            // cmd1: buy X on OUR pool, sell all of it (OPEN_DELTA) into the hookless pool, settle the stock
            bytes memory act = abi.encodePacked(uint8(0x06), uint8(0x06), uint8(0x0c));
            bytes[] memory p = new bytes[](3);
            p[0] = abi.encode(ExactInputSingleParams(l.key, l.devise0, uint128(UN), 0, ""));
            p[1] = abi.encode(ExactInputSingleParams(k2, !l.devise0, 0, 0, ""));
            p[2] = abi.encode(Currency.wrap(NVDAc), type(uint256).max);
            inputs[0] = abi.encode(act, p);
        }
        {
            // cmd2: buy the block back from the HOOKLESS pool and take it to alice
            bytes memory act = abi.encodePacked(uint8(0x06), uint8(0x0c), uint8(0x0f));
            bytes[] memory p = new bytes[](3);
            p[0] = abi.encode(ExactInputSingleParams(k2, l.devise0, uint128(UN), 0, ""));
            p[1] = abi.encode(Currency.wrap(NVDAc), type(uint256).max);
            p[2] = abi.encode(Currency.wrap(address(l.t)), uint256(0));
            inputs[1] = abi.encode(act, p);
        }
        uint256 n0 = IERC20L(NVDAc).balanceOf(alice);
        vm.prank(alice);
        (bool ok, bytes memory why) = UR.call(abi.encodeWithSelector(IUR.execute.selector, hex"1010", inputs, block.timestamp + 60));
        if (!ok) console2.logBytes(why);
        assertTrue(ok, "UR two-command tx");
        uint256 y = l.t.balanceOf(alice);
        uint256 c = l.t.sellCredit(alice);
        uint256 parked = l.t.balanceOf(address(PM)); // all block inside the PM (our pool + hookless pool)
        console2.log("U1 stock spent (NVDAc-wei):", n0 - IERC20L(NVDAc).balanceOf(alice));
        console2.log("U1 block taken from the HOOKLESS pool Y (wei):", y);
        console2.log("U1 credit created in the tx (wei):", c);
        assertEq(c, y, "leftover hooked net credits the hookless payout (bounded by X)");
        // bound: credit created in the tx <= hooked payout X of cmd1. Re-measure X with a twin plain buy.
        assertLe(c, y, "credit <= tokens received");
        // nothing extra is sellable beyond c; alice can sell back exactly c on OUR pool, not c+1
        vm.prank(alice);
        vm.expectRevert(TBlockBloc24h.Solde.selector);
        l.t.transfer(bob, y + 1);
        assertGt(parked, 0);
    }
}
