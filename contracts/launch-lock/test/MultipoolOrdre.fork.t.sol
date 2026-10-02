// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {console2} from "forge-std/console2.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {TBlockBloc24h} from "../src/TBlockBloc24h.sol";
import {LLBase, IERC20L} from "./LLBase.sol";

/// FORK + FFI (FOUNDRY_PROFILE=multipool). The REAL calldata of multipool.js (fix branch vs 31d7700 as is), executed on the
/// LIVE Aerodrome Universal Router of the fork against a cradle block x NVDAc pool:
///   (b) settle AFTER the swap: the strict cradle block can be SOLD through the multipool; the old order (settle first) reverts;
///   (d) one fee per leg: on a leg our hook charges, the router adds nothing (0.10 % = 700 + 300 pips, or 0.09 % on a
///       V9-equivalent hook) — the old calldata charges router 9 bps ON TOP (the 0.18 % double charge), measured to the wei.
contract MultipoolOrdreTest is LLBase {
    address constant AERO_UR = 0xC5b6786D7B64767D775877b0B6A319AD946B11B5;

    struct Rq {
        string quelle;
        address de;
        address vers;
        uint256 m;
        uint256 fi;
        bool fact;
    }

    function _route(string memory quelle, address de, address vers, L memory l, uint256 m, uint256 fi, bool fact)
        internal
        returns (bytes memory)
    {
        return _ffi(Rq(quelle, de, vers, m, fi, fact), l.key);
    }

    function _ffi(Rq memory q, PoolKey memory k) internal returns (bytes memory) {
        string[] memory a = new string[](16);
        a[0] = "node";
        a[1] = "script/route-multipool.mjs";
        a[2] = q.quelle;
        a[3] = vm.toString(q.de);
        a[4] = vm.toString(q.vers);
        a[5] = vm.toString(Currency.unwrap(k.currency0));
        a[6] = vm.toString(Currency.unwrap(k.currency1));
        a[7] = vm.toString(uint256(k.fee));
        a[8] = vm.toString(int256(k.tickSpacing));
        a[9] = vm.toString(address(k.hooks));
        a[10] = vm.toString(q.m);
        a[11] = "1";
        a[12] = vm.toString(alice);
        a[13] = vm.toString(q.fi);
        a[14] = q.fact ? "1" : "0";
        a[15] = vm.toString(NVDAc);
        return vm.ffi(a);
    }

    function _executer(address qui, address jeton, uint256 m, bytes memory data) internal returns (bool ok, bytes memory ret) {
        vm.prank(qui);
        IERC20L(jeton).approve(AERO_UR, m);
        vm.prank(qui);
        (ok, ret) = AERO_UR.call(data);
    }

    function test_M1_achat_unSeulFraisParJambe_auWei() public fork {
        L memory l = _lancer(_hook24h(), NVDAc, MINIMUM, "MSM1");
        uint256 q = UN;
        // NEW (fix): the hooked leg is charged by the hook only
        _fundStock(NVDAc, alice, 2 * q);
        uint256 s0 = _sinkQ(l);
        (uint256 du0,) = _du(l);
        (bool ok,) = _executer(alice, NVDAc, q, _route("new", NVDAc, address(l.t), l, q, 0, true));
        assertTrue(ok, "new calldata: buy through the Aerodrome UR");
        uint256 fw = _sinkQ(l) - s0;
        (uint256 du1,) = _du(l);
        assertEq(fw, q * P_SINK / 1e6, "NEW: sink == floor(q*700/1e6) = 70000, NO router fee");
        assertEq(du1 - du0, q * P_CREA / 1e6, "NEW: creator == floor(q*300/1e6) = 30000");
        uint256 r = l.t.balanceOf(alice);
        assertEq(l.t.sellCredit(alice), r, "multipool buy credited to the user (PM -> router -> user, credit moved)");
        assertEq(l.t.balanceOf(AERO_UR), 0, "router keeps no block");
        assertEq(IERC20L(NVDAc).balanceOf(AERO_UR), 0, "router keeps no stock");
        console2.log("M1 NEW  buy 1 NVDAc: sink %s (0.07 %%), creator %s, router fee 0", fw, du1 - du0);
        // OLD (31d7700): router PAY_PORTION 9 bps in NVDAc at the entry + the hook's 0.10 % = double charge
        s0 = _sinkQ(l);
        (ok,) = _executer(alice, NVDAc, q, _route("old", NVDAc, address(l.t), l, q, 0, false));
        assertTrue(ok, "old calldata buys too (the ordering only matters for selling the block)");
        uint256 fwOld = _sinkQ(l) - s0;
        uint256 routeur = q * 9 / 1e4;
        assertEq(fwOld, routeur + (q - routeur) * P_SINK / 1e6, "OLD: sink == router 9 bps + hook 700 pips on the same leg");
        assertGt(fwOld, fw, "the double charge the fix removes");
        console2.log("M1 OLD  buy 1 NVDAc: sink %s = router %s + hook %s", fwOld, routeur, fwOld - routeur);
    }

    function test_M2_vente_reglementApresLeSwap() public fork {
        L memory l = _lancer(_hook24h(), NVDAc, MINIMUM, "MSM2");
        uint256 r = _acheter(l, alice, UN);
        // OLD order (SETTLE first): the block reaches the PoolManager before the hook saw the sell -> refused
        (bool ok, bytes memory ret) = _executer(alice, address(l.t), r / 2, _route("old", address(l.t), NVDAc, l, r / 2, 1, false));
        assertFalse(ok, "OLD calldata: selling a cradle block through the multipool REVERTS (settle before swap)");
        console2.log("M2 OLD revert data:");
        console2.logBytes(ret);
        _venteNouvelle(l, r);
        // negative control: the creator's unbacked tokens cannot go through the multipool either
        (ok,) = _executer(adm, address(l.t), 1 ether, _route("new", address(l.t), NVDAc, l, 1 ether, 1, true));
        assertFalse(ok, "unbacked sell through the multipool refused");
    }

    function _venteNouvelle(L memory l, uint256 r) internal {
        Avant memory a = Avant(_sinkQ(l), 0, IERC20L(NVDAc).balanceOf(alice));
        (a.du,) = _du(l);
        (bool ok,) = _executer(alice, address(l.t), r / 2, _route("new", address(l.t), NVDAc, l, r / 2, 1, true));
        assertTrue(ok, "NEW calldata: the cradle block sells through the Aerodrome UR");
        uint256 out = IERC20L(NVDAc).balanceOf(alice) - a.n;
        uint256 fw = _sinkQ(l) - a.fw;
        (uint256 du1,) = _du(l);
        uint256 qPool = out + fw + (du1 - a.du);
        assertEq(fw, qPool * P_SINK / 1e6, "NEW sell: sink == floor(qPool*700/1e6)");
        assertEq(du1 - a.du, qPool * P_CREA / 1e6, "NEW sell: creator == floor(qPool*300/1e6)");
        assertEq(l.t.sellCredit(alice), r - r / 2, "credit debited by exactly what was sold");
        assertEq(l.t.balanceOf(AERO_UR), 0);
        assertEq(IERC20L(NVDAc).balanceOf(AERO_UR), 0);
        console2.log("M2 NEW sell %s blocks -> %s NVDAc-wei, sink %s", r / 2, out, fw);
    }

    struct Avant {
        uint256 fw;
        uint256 du;
        uint256 n;
    }

    /// the founder's 0.18 %: a V9-equivalent hook (900 pips to the sink) + router 9 bps on the same leg
    function test_M3_dixHuitPourDixMille_impossible() public fork {
        Hook h900 = _deployHook(_cfg(TAUX_V9, 0, 0, 0, false, true)); // 0.09 % hook, cradle on
        L memory l = _lancer(h900, NVDAc, 0, "MSM3");
        uint256 q = 10 * UN;
        _fundStock(NVDAc, alice, 2 * q);
        uint256 s0 = _sinkQ(l);
        (bool ok,) = _executer(alice, NVDAc, q, _route("new", NVDAc, address(l.t), l, q, 0, true));
        assertTrue(ok);
        uint256 fNew = _sinkQ(l) - s0;
        assertEq(fNew, q * 900 / 1e6, "NEW: exactly 0.09 % (900000 NVDAc-wei on 10 NVDAc), once");
        s0 = _sinkQ(l);
        (ok,) = _executer(alice, NVDAc, q, _route("old", NVDAc, address(l.t), l, q, 0, false));
        assertTrue(ok);
        uint256 fOld = _sinkQ(l) - s0;
        assertEq(fOld, q * 9 / 1e4 + (q - q * 9 / 1e4) * 900 / 1e6, "OLD: 0.09 % router + 0.09 % hook = ~0.18 %");
        console2.log("M3 10 NVDAc: NEW %s (0.09 %%) / OLD %s (~0.18 %%)", fNew, fOld);
        // and the fix refuses to even build a router share on that leg (see test-multipool.mjs 6f/6g)
    }
}
