// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// Grok Bot 2026-10-02 — review of Zero 1's fix F1 (seed exemption ends at the block's first hooked swap).
// FORK ONLY. Nothing broadcast, nothing deployed, no key.
//   F1a  GRIEF: between birth (initialize) and the seed, ANYONE can add quote-only liquidity (allowed: no block moves)
//        and swap for ZERO block. If that zero-block swap ended the exemption, the seeder could never seed during the
//        24 h (unbacked tokens cannot enter our pool without credit, and nobody has credit before the first payout).
//        => the flag must only flip on a swap that MOVES the block (db != 0). Red on Zero 1's patch as is.
//   F1b  the first block-moving swap DOES end the exemption: a later unbacked seeder add reverts (documented trade-off).
//   F1c  the flag is per block: a swap on block A never ends block B's exemption.
import {console2} from "forge-std/console2.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {LiquidityAmounts} from "../src/lib/LiquidityAmounts.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {TBlockBloc24h} from "../src/TBlockBloc24h.sol";
import {TBlockBloc24hFactory} from "../src/TBlockBloc24hFactory.sol";
import {LLBase, IERC20L} from "./LLBase.sol";

contract SemenceF1Test is LLBase {
    using PoolIdLibrary for PoolKey;

    /// birth WITHOUT the seed: register with escrow, initialize (arms the 24 h). Nothing in the pool yet.
    function _naitreSansSemence(Hook h, string memory sym) internal returns (L memory l) {
        TBlockBloc24hFactory f = new TBlockBloc24hFactory(address(PM), address(h));
        TBlockBloc24h t = _bloc(f, sym);
        l.t = t;
        l.hook = address(h);
        l.devise = NVDAc;
        l.key = _cle(NVDAc, address(t), address(h));
        l.devise0 = Currency.unwrap(l.key.currency0) == NVDAc;
        (l.sp,) = _prix(l.devise0);
        vm.deal(adm, adm.balance + 1 ether);
        _fundStock(NVDAc, adm, MINIMUM);
        vm.prank(adm);
        IERC20L(NVDAc).approve(address(h), MINIMUM);
        vm.prank(adm);
        h.inscrireAvecCaution{value: FRAIS_VIE}(l.key, l.sp, MINIMUM);
        PM.initialize(l.key, l.sp);
        _approve(adm, address(t));
        _approve(adm, NVDAc);
    }

    /// the seeder's block-only seed, on a range strictly on the "block dearer" side of the CURRENT price
    function _semer(L memory l, uint256 seed) internal returns (bool ok, bytes memory why) {
        (, int24 tick,,) = _slot0(l);
        int24 s = _plancher(tick, 200);
        if (l.devise0) {
            l.lo = TickMath.minUsableTick(200);
            l.hi = s - 200;
            l.liq = LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(l.lo), TickMath.getSqrtPriceAtTick(l.hi), seed);
        } else {
            l.lo = s + 400;
            l.hi = TickMath.maxUsableTick(200);
            l.liq = LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(l.lo), TickMath.getSqrtPriceAtTick(l.hi), seed);
        }
        vm.prank(adm);
        try lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(l.lo, l.hi, int256(uint256(l.liq)), bytes32(0)), "") {
            ok = true;
        } catch (bytes memory e) {
            why = e;
        }
    }

    function _slot0(L memory l) internal view returns (uint160 sp, int24 tick, uint24, uint24) {
        return StateLibrary.getSlot0(PM, l.key.toId());
    }

    /// griefer: dust quote-only liquidity (makes the pool "garnie"), then a swap that pays out ZERO block
    function _grief(L memory l) internal returns (int256 dbGrief) {
        (, int24 tick,,) = _slot0(l);
        int24 s = _plancher(tick, 200);
        (int24 lo, int24 hi) = l.devise0 ? (s + 400, s + 800) : (s - 800, s - 400);
        uint128 L_ = l.devise0
            ? LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), 1e6)
            : LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), 1e6);
        _fundStock(NVDAc, passant, 2e6);
        _approve(passant, NVDAc);
        _approve(passant, address(l.t));
        vm.prank(passant);
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(lo, hi, int256(uint256(L_)), bytes32(0)), "");
        assertEq(l.t.balanceOf(address(PM)), 0, "no block in the PoolManager before the seed");
        // buy direction, exact OUT of 1e18 block, price limit one unit away: no block liquidity => 0 block moves
        bool zfo = l.devise0;
        uint160 lim = zfo ? l.sp - 1 : l.sp + 1;
        vm.prank(passant);
        BalanceDelta d = swapper.swap(l.key, IPoolManager.SwapParams(zfo, int256(1e18), lim), PoolSwapTest.TestSettings(false, false), "");
        dbGrief = _db(l, d);
    }

    function test_F1a_zeroBlockSwapBeforeSeed_doesNotKillTheSeed() public fork {
        L memory l = _naitreSansSemence(_hook24h(), "F1A");
        int256 dbG = _grief(l);
        console2.log("F1a griefer swap block delta (wei):", dbG);
        assertEq(dbG, 0, "the grief swap moved no block");
        bool flag = Hook(l.hook).echange(address(l.t));
        console2.log("F1a echange[block] after a ZERO-block swap:", flag);
        uint256 avant = l.t.balanceOf(adm);
        (bool ok, bytes memory why) = _semer(l, SEED);
        if (!ok) console2.logBytes(why);
        console2.log("F1a seeder seed after the grief succeeded:", ok);
        assertFalse(flag, "a swap that moves no block must not end the seed exemption");
        assertTrue(ok, "GRIEF: a zero-block swap before the seed made the birth seed impossible for 24 h");
        assertApproxEqRel(avant - l.t.balanceOf(adm), SEED, 1e9, "seed of ~99.9 % went in (liquidity rounding only)");
        assertEq(l.t.sellCredit(adm), 0, "the seed creates no credit");
    }

    function test_F1b_firstBlockMovingSwap_endsTheExemption() public fork {
        L memory l = _lancer(_hook24h(), NVDAc, MINIMUM, "F1B");
        assertFalse(Hook(l.hook).echange(address(l.t)), "seeded, no swap yet");
        uint256 r = l.t.balanceOf(adm);
        assertGt(r, 0);
        uint256 recu = _acheter(l, alice, UN);
        assertGt(recu, 0);
        assertTrue(Hook(l.hook).echange(address(l.t)), "first block-moving swap sets the flag");
        assertTrue(l.t.trading(), "credited payout too");
        // now an unbacked seeder add on OUR pool reverts (needs credit): Zero 1's documented trade-off
        (bool ok,) = _semer(l, r / 2);
        assertFalse(ok, "after the first swap, the seeder's unbacked add reverts");
        _invariant(l);
    }

    function test_F1c_flagIsPerBlock() public fork {
        Hook h = _hook24h();
        L memory a = _lancer(h, NVDAc, MINIMUM, "F1CA");
        L memory b = _naitreSansSemence(h, "F1CB");
        _acheter(a, alice, UN);
        assertTrue(h.echange(address(a.t)), "block A traded");
        assertFalse(h.echange(address(b.t)), "block B untouched by A's swap");
        (bool ok,) = _semer(b, SEED);
        assertTrue(ok, "B's birth seed still exempt");
    }
}

