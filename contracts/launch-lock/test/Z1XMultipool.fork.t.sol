// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// ZERO 1 — negative check (a): one fee per leg through multipool.js (f0b4e91, settle-after-swap) on the LIVE
// Aerodrome UR, cradle block x NVDAc + a hookless NVDAc/AAPLc v4 pool for the multi-hop. FFI (pure node), fork only.
// Grok Bot 2026-10-02 (multipool fix after f0b4e91):
//   · the cradle hook is in the DEFAULT hooked list through config-hooks-facturants.js; here the "deploy address" is
//     injected the way the deploy will inject it (env TB_HOOK_BERCEAU_24H, inherited by the FFI child), and the
//     NEGATIVE CONTROL clears it ("") and must see the double fee again (159,937) — so the test FAILS if the cradle is
//     missing from the default list;
//   · each leg pays exactly once: on AAPLc -> NVDAc (hookless) -> block (cradle) the router leg pays the router fee
//     (9 bps of AAPLc, 90,000 on 1 AAPLc) and the cradle leg pays the hook — f0b4e91 charged the router leg 0.
import {console2} from "forge-std/console2.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {LLBase, IERC20L} from "./LLBase.sol";

contract Z1XMultipoolOrdreTest is LLBase {
    address constant AERO_UR = 0xC5b6786D7B64767D775877b0B6A319AD946B11B5;
    PoolKey kS; // hookless NVDAc/AAPLc

    struct M {
        uint256 fwN;
        uint256 fwA;
        uint256 cr;
        bool ok;
    }

    function _hop(address de, address vers, PoolKey memory k) internal pure returns (string memory) {
        return string.concat(
            '{"de":"', vm.toString(de), '","vers":"', vm.toString(vers), '","c0":"', vm.toString(Currency.unwrap(k.currency0)),
            '","c1":"', vm.toString(Currency.unwrap(k.currency1)), '","fee":', vm.toString(uint256(k.fee)), ',"ts":',
            vm.toString(int256(k.tickSpacing)), ',"hooks":"', vm.toString(address(k.hooks)), '"}'
        );
    }

    function _fact(address fact) internal pure returns (string memory) {
        return fact == address(0) ? "" : string.concat('"', vm.toString(fact), '"');
    }

    function _adm(bool aapl) internal pure returns (string memory) {
        return aapl ? string.concat('"', vm.toString(NVDAc), '","', vm.toString(AAPLc), '"') : string.concat('"', vm.toString(NVDAc), '"');
    }

    function _route(string memory quelle, string memory hops, uint256 m, uint256 fi, address fact, bool aapl)
        internal
        returns (bytes memory)
    {
        string memory js = string.concat('{"hops":[', hops, '],"montant":"', vm.toString(m), '","dest":"', vm.toString(alice));
        js = string.concat(js, '","fi":', vm.toString(fi), ',"fact":[', _fact(fact), '],"admises":[', _adm(aapl), "]}");
        string[] memory a = new string[](4);
        a[0] = "node";
        a[1] = "script/z1-route.mjs";
        a[2] = quelle;
        a[3] = js;
        return vm.ffi(a);
    }

    uint256 recuA; // AAPLc received by alice in the last _exec

    /// the deploy address, injected as the deploy will inject it (env read by config-hooks-facturants.js in the FFI child)
    function _config(address hook) internal {
        vm.setEnv("TB_HOOK_BERCEAU_24H", hook == address(0) ? "" : vm.toString(hook));
    }

    function _exec(L memory l, address jeton, uint256 m, bytes memory data) internal returns (M memory r) {
        require(data.length > 0, "multipool REFUSED the route");
        uint256 n0 = IERC20L(NVDAc).balanceOf(SINK);
        uint256 a0 = IERC20L(AAPLc).balanceOf(SINK);
        uint256 u0 = IERC20L(AAPLc).balanceOf(alice);
        (uint256 du0,) = _du(l);
        vm.prank(alice);
        IERC20L(jeton).approve(AERO_UR, m);
        vm.prank(alice);
        (r.ok,) = AERO_UR.call(data);
        (uint256 du1,) = _du(l);
        r.fwN = IERC20L(NVDAc).balanceOf(SINK) - n0;
        r.fwA = IERC20L(AAPLc).balanceOf(SINK) - a0;
        uint256 u1 = IERC20L(AAPLc).balanceOf(alice);
        recuA = u1 > u0 ? u1 - u0 : 0;
        r.cr = du1 - du0;
        assertEq(l.t.balanceOf(SINK), 0, "(b) sink never gets the block");
        assertEq(l.t.balanceOf(AERO_UR), 0, "router keeps no block");
    }

    function _setup() internal returns (L memory l) {
        l = _lancer(_hook24h(), NVDAc, MINIMUM, "XMP1");
        (address c0, address c1) = NVDAc < AAPLc ? (NVDAc, AAPLc) : (AAPLc, NVDAc);
        kS = PoolKey(Currency.wrap(c0), Currency.wrap(c1), 500, 10, IHooks(address(0)));
        PM.initialize(kS, uint160(1 << 96));
        _fundStock(NVDAc, carol, 100 * UN);
        _fundStock(AAPLc, carol, 100 * UN);
        _approve(carol, NVDAc);
        _approve(carol, AAPLc);
        vm.prank(carol);
        lp.modifyLiquidity(kS, IPoolManager.ModifyLiquidityParams(TickMath.minUsableTick(10), TickMath.maxUsableTick(10), int256(50 * UN), 0), "");
        _fundStock(NVDAc, alice, 20 * UN);
        _fundStock(AAPLc, alice, 20 * UN);
    }

    function test_a1_buy() public fork {
        L memory l = _setup();
        string memory buy = _hop(NVDAc, address(l.t), l.key);
        _config(address(0));
        M memory b1 = _exec(l, NVDAc, UN, _route("new", buy, UN, 0, l.hook, false));
        assertTrue(b1.ok, "B1");
        assertEq(b1.fwN, UN * P_SINK / 1e6, "B1 sink == 70000, no router fee");
        assertEq(b1.cr, UN * P_CREA / 1e6, "B1 creator == 30000");
        console2.log("a B1 buy 1 NVDAc hook-declared: sink %s creator %s", b1.fwN, b1.cr);
        // DEFAULT list, cradle address injected by config (no hooksFacturants from the caller): the hook alone charges
        _config(l.hook);
        M memory b2 = _exec(l, NVDAc, UN, _route("new", buy, UN, 0, address(0), false));
        assertTrue(b2.ok, "B2");
        assertEq(b2.fwN, UN * P_SINK / 1e6, "B2 DEFAULT list + config: sink == 70000, router 0 (one fee per leg)");
        assertEq(b2.cr, UN * P_CREA / 1e6, "B2 creator == 30000");
        console2.log("a B2 buy 1 NVDAc DEFAULT list (config injected): sink %s creator %s", b2.fwN, b2.cr);
        // NEGATIVE CONTROL: config cleared -> the cradle is not in the default list -> router 9 bps + hook = double fee
        _config(address(0));
        M memory b3 = _exec(l, NVDAc, UN, _route("new", buy, UN, 0, address(0), false));
        assertTrue(b3.ok, "B3");
        uint256 rf = UN * 9 / 1e4;
        assertEq(b3.fwN, rf + (UN - rf) * P_SINK / 1e6, "B3 NEGATIVE CONTROL: without the config the leg is charged twice");
        console2.log("a B3 buy 1 NVDAc DEFAULT list WITHOUT config (negative control): sink %s creator %s", b3.fwN, b3.cr);
    }

    function test_a2_sell() public fork {
        L memory l = _setup();
        _exec(l, NVDAc, 2 * UN, _route("new", _hop(NVDAc, address(l.t), l.key), 2 * UN, 0, l.hook, false));
        uint256 r = l.t.balanceOf(alice) / 4;
        string memory sell = _hop(address(l.t), NVDAc, l.key);
        M memory s1 = _exec(l, address(l.t), r, _route("new", sell, r, 1, l.hook, false));
        assertTrue(s1.ok, "S1");
        console2.log("a S1 sell hook-declared: sink %s creator %s", s1.fwN, s1.cr);
        _config(l.hook);
        M memory s2 = _exec(l, address(l.t), r, _route("new", sell, r, 1, address(0), false));
        _config(address(0));
        assertTrue(s2.ok, "S2");
        // hook only: sink / creator == 700 / 300 up to floor rounding (a router 9 bps on top would break the ratio)
        assertApproxEqAbs(s2.fwN * 3, s2.cr * 7, 10, "S2 DEFAULT list + config: hook only, no router fee");
        console2.log("a S2 sell DEFAULT list (config injected): sink %s creator %s", s2.fwN, s2.cr);
        M memory s3 = _exec(l, address(l.t), r, _route("old", sell, r, 1, address(0), false));
        assertFalse(s3.ok, "S3 old calldata (settle first) cannot sell the cradle block");
    }

    function test_a3_multihop() public fork {
        L memory l = _setup();
        string memory mh = string.concat(_hop(AAPLc, NVDAc, kS), ",", _hop(NVDAc, address(l.t), l.key));
        _config(address(0));
        M memory h1 = _exec(l, AAPLc, UN, _route("new", mh, UN, 0, l.hook, true));
        assertTrue(h1.ok, "H1");
        // each leg pays exactly once: the ROUTER leg AAPLc -> NVDAc pays 9 bps of AAPLc, the cradle leg pays its hook
        assertEq(h1.fwA, UN * 9 / 1e4, "H1 router leg pays the router fee once: 90000 AAPLc-wei");
        assertGt(h1.fwN, 0, "H1 cradle leg pays its hook");
        assertApproxEqAbs(h1.fwN * 3, h1.cr * 7, 10, "H1 cradle leg: hook only (700/300), no second router fee");
        console2.log("a H1 AAPLc->NVDAc->block hook-declared: sinkN %s sinkA %s creator %s", h1.fwN, h1.fwA, h1.cr);
        _config(l.hook);
        M memory h2 = _exec(l, AAPLc, UN, _route("new", mh, UN, 0, address(0), true));
        _config(address(0));
        assertTrue(h2.ok, "H2");
        assertEq(h2.fwA, UN * 9 / 1e4, "H2 DEFAULT list + config: router leg pays once");
        console2.log("a H2 AAPLc->NVDAc->block DEFAULT list (config injected): sinkN %s sinkA %s creator %s", h2.fwN, h2.fwA, h2.cr);
        uint256 r3 = l.t.balanceOf(alice) / 2;
        string memory mh3 = string.concat(_hop(address(l.t), NVDAc, l.key), ",", _hop(NVDAc, AAPLc, kS));
        M memory h3 = _exec(l, address(l.t), r3, _route("new", mh3, r3, 2, l.hook, true));
        assertTrue(h3.ok, "H3");
        // router leg NVDAc -> AAPLc pays floor(router AAPLc balance x 9 / 1e4) at the output node, to the wei
        assertGt(h3.fwA, 0, "H3 router leg pays the router fee");
        assertEq(h3.fwA, (recuA + h3.fwA) * 9 / 1e4, "H3 router fee == floor(AAPLc at the node x 9 / 1e4), to the wei");
        console2.log("a H3 block->NVDAc->AAPLc hook-declared: sinkN %s sinkA %s creator %s", h3.fwN, h3.fwA, h3.cr);
        console2.log("a H3 alice AAPLc received:", recuA);
        _invariant(l);
    }
}
