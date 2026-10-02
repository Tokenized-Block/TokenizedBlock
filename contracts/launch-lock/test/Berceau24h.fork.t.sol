// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {console2} from "forge-std/console2.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {LiquidityAmounts} from "../src/lib/LiquidityAmounts.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {TBlockBloc24h} from "../src/TBlockBloc24h.sol";
import {TBlockBloc24hFactory} from "../src/TBlockBloc24hFactory.sol";
import {LLBase, IERC20L} from "./LLBase.sol";
import {MockPaire, RouteurHop, Rachat, IUR, IPermit2, ExactInputSingleParams} from "./Helpers24h.sol";
import {Acrobate} from "./Acrobate.sol";

/// FORK ONLY. The 24 h cradle on MEMESTOCK pairs: a cradle block vs the REAL tokenized stock NVDAc (and AAPLc).
/// Every negative control is paired with a positive control in the same state.
contract Berceau24hTest is LLBase {
    function _l() internal returns (L memory) {
        return _lancer(_hook24h(), NVDAc, MINIMUM, "MS24");
    }

    // ── R1 buy then sell the same amount: OK, fee in the STOCK to the wei; creator's unbacked sell REVERTS ──
    function test_R1_achatPuisVente_memeMontant_fraisAuWei() public fork {
        L memory l = _l();
        uint256 s0 = _sinkQ(l);
        (uint256 du0,) = _du(l);
        uint256 q = 3 * UN; // 3 NVDAc
        uint256 r = _acheter(l, alice, q);
        assertEq(l.t.sellCredit(alice), r, "credit == bought, to the wei");
        assertEq(_sinkQ(l) - s0, q * P_SINK / 1e6, "buy: sink += floor(q*700/1e6) NVDAc");
        (uint256 du1,) = _du(l);
        assertEq(du1 - du0, q * P_CREA / 1e6, "buy: creator claims += floor(q*300/1e6) NVDAc");
        console2.log("R1 buy  q=%s NVDAc-wei -> blocks %s ; sink +%s", q, r, q * P_SINK / 1e6);
        // negative control: the creator's retained 0.1 % (never bought) cannot be dumped into the buyers' stock
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, 0, 1 ether));
        _vendre(l, adm, 1 ether);
        // positive: the buyer sells back exactly what it bought
        uint256 s1 = _sinkQ(l);
        uint256 out = _vendre(l, alice, r);
        uint256 fw = _sinkQ(l) - s1;
        (uint256 du2,) = _du(l);
        uint256 cr = du2 - du1;
        uint256 qPool = out + fw + cr; // the pool's quote output (fee base)
        assertEq(fw, qPool * P_SINK / 1e6, "sell: sink == floor(qPool*700/1e6)");
        assertEq(cr, qPool * P_CREA / 1e6, "sell: creator == floor(qPool*300/1e6)");
        console2.log("R1 sell %s blocks -> %s NVDAc-wei ; sink +%s", r, out, fw);
        assertEq(l.t.balanceOf(alice), 0);
        assertEq(l.t.sellCredit(alice), 0);
        _invariant(l);
    }

    // ── R2 oversell: credit + 1 wei REVERTS; exactly the credit passes ─────────────────────────────────
    function test_R2_surVente_plusUnWei_revert() public fork {
        L memory l = _l();
        uint256 retenu = l.t.balanceOf(adm);
        uint256 r = _acheter(l, adm, UN); // the creator buys: balance = retained + r, credit = r
        assertEq(l.t.sellCredit(adm), r);
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, r, r + 1));
        _vendre(l, adm, r + 1);
        _vendre(l, adm, r);
        assertEq(l.t.sellCredit(adm), 0);
        assertEq(l.t.balanceOf(adm), retenu, "only the unbacked retained part is left");
    }

    // ── R3 A -> B: credit moves with the tokens; B never exceeds; creator / airdrop to B REVERTS ───────
    function test_R3_creditSuitLesJetons() public fork {
        L memory l = _l();
        uint256 r = _acheter(l, alice, UN);
        vm.prank(alice);
        l.t.transfer(bob, r / 2);
        assertEq(l.t.sellCredit(alice), r - r / 2);
        assertEq(l.t.sellCredit(bob), r / 2);
        vm.expectRevert(TBlockBloc24h.Solde.selector);
        vm.prank(alice);
        l.t.transfer(bob, r - r / 2 + 1);
        // creator airdrop of unbacked tokens to B: refused (no laundering through a second wallet)
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, 0, 5 ether));
        vm.prank(adm);
        l.t.transfer(bob, 5 ether);
        _vendre(l, bob, r / 2);
        assertEq(l.t.balanceOf(bob), 0);
        vm.expectRevert(TBlockBloc24h.Solde.selector);
        _vendre(l, bob, 1);
        assertEq(l.t.sellCredit(alice) + l.t.sellCredit(bob), r - r / 2);
    }

    // ── R4 foreign venues inside 24 h: hookless v4 pool sell / add REVERT; V2-style pair: unbacked REVERTS ──
    function test_R4_poolSansHook_et_paireV2() public fork {
        L memory l = _l();
        uint256 r = _acheter(l, alice, 2 * UN);
        PoolKey memory k2 = PoolKey(l.key.currency0, l.key.currency1, 3000, 200, IHooks(address(0)));
        PM.initialize(k2, l.sp);
        // stock-only liquidity (no block moves): allowed
        int24 t0 = TickMath.getTickAtSqrtPrice(l.sp);
        _fundStock(NVDAc, carol, 10 * UN);
        (int24 a, int24 b) = l.devise0 ? (t0 + 200, t0 + 6000) : (t0 - 6000, t0 - 200);
        uint128 L2 = l.devise0
            ? LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(a), TickMath.getSqrtPriceAtTick(b), 5 * UN)
            : LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(a), TickMath.getSqrtPriceAtTick(b), 5 * UN);
        vm.prank(carol);
        lp.modifyLiquidity(k2, IPoolManager.ModifyLiquidityParams(a, b, int256(uint256(L2)), bytes32(0)), "");
        // a BACKED holder sells into the hookless pool: refused (not our pool)
        bool zfo = !l.devise0;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockBloc24h.PasNotrePool.selector, r / 4, 0));
        swapper.swap(k2, IPoolManager.SwapParams(zfo, -int256(r / 4), zfo ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), PoolSwapTest.TestSettings(false, false), "");
        // block liquidity in the hookless pool: refused
        (int24 c, int24 d) = l.devise0 ? (t0 - 6000, t0 - 200) : (t0 + 200, t0 + 6000);
        uint128 L4 = l.devise0
            ? LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(c), TickMath.getSqrtPriceAtTick(d), r / 4)
            : LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(c), TickMath.getSqrtPriceAtTick(d), r / 4);
        vm.prank(alice);
        vm.expectPartialRevert(TBlockBloc24h.PasNotrePool.selector);
        lp.modifyLiquidity(k2, IPoolManager.ModifyLiquidityParams(c, d, int256(uint256(L4)), bytes32(0)), "");
        // V2/V3-style pair (transferFrom into the pair): unbacked refused, backed passes and the credit MOVES
        MockPaire p = new MockPaire();
        _fundStock(NVDAc, address(p), 10);
        vm.startPrank(adm);
        l.t.approve(address(p), type(uint256).max);
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, 0, 1000 ether));
        p.vendre(address(l.t), NVDAc, 1000 ether);
        vm.stopPrank();
        vm.startPrank(alice);
        l.t.approve(address(p), type(uint256).max);
        p.vendre(address(l.t), NVDAc, r / 4);
        vm.stopPrank();
        assertEq(l.t.sellCredit(address(p)), r / 4, "pair holds BACKED tokens: credit moved, none created");
        // positive control: the same holder sells through OUR pool
        _vendre(l, alice, r / 4);
    }

    // ── R5 Universal Router (LIVE Base deployment) — MS/TS path: NVDAc in / block out, block in / NVDAc out ──
    function _urSwap(L memory l, address qui, bool achat, uint256 m) internal {
        bytes memory actions = abi.encodePacked(uint8(0x06), uint8(0x0c), uint8(0x0f));
        bytes[] memory params = new bytes[](3);
        bool zfo = achat ? l.devise0 : !l.devise0;
        params[0] = abi.encode(ExactInputSingleParams(l.key, zfo, uint128(m), 0, ""));
        (address cin, address cout) = achat ? (l.devise, address(l.t)) : (address(l.t), l.devise);
        params[1] = abi.encode(Currency.wrap(cin), m);
        params[2] = abi.encode(Currency.wrap(cout), uint256(0));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);
        vm.prank(qui);
        IUR(UR).execute(hex"10", inputs, block.timestamp + 60);
    }

    function _permit2(address qui, address token) internal {
        vm.startPrank(qui);
        IERC20L(token).approve(PERMIT2, type(uint256).max);
        IPermit2(PERMIT2).approve(token, UR, type(uint160).max, uint48(block.timestamp + 30 days));
        vm.stopPrank();
    }

    function test_R5_universalRouter_achatVente() public fork {
        L memory l = _l();
        _fundStock(NVDAc, alice, UN);
        _permit2(alice, NVDAc);
        _permit2(alice, address(l.t));
        uint256 s0 = _sinkQ(l);
        _urSwap(l, alice, true, UN);
        uint256 r = l.t.balanceOf(alice);
        assertGt(r, 0, "UR buy delivered");
        assertEq(l.t.sellCredit(alice), r, "UR buy: TAKE_ALL pays the user directly, credited to the user");
        assertEq(_sinkQ(l) - s0, UN * P_SINK / 1e6, "UR buy: sink == floor(1e8*700/1e6) = 70000 NVDAc-wei");
        uint256 n0 = IERC20L(NVDAc).balanceOf(alice);
        _urSwap(l, alice, false, r);
        assertEq(l.t.balanceOf(alice), 0);
        assertGt(IERC20L(NVDAc).balanceOf(alice) - n0, UN * 99 / 100, "UR sell: permit2 pull user->PM, debited");
        // negative control: the creator's unbacked tokens through the same router (permit2 flattens the reason)
        _permit2(adm, address(l.t));
        vm.expectRevert(bytes("TRANSFER_FROM_FAILED"));
        _urSwap(l, adm, false, 1 ether);
    }

    // ── R6 router hops: PM -> router -> user / user -> router -> PM; a PRE-settle router FAILS ───────────
    function test_R6_routeurHops_preSettleEchoue() public fork {
        L memory l = _l();
        RouteurHop rh = new RouteurHop(PM);
        _fundStock(NVDAc, alice, UN);
        vm.startPrank(alice);
        IERC20L(NVDAc).approve(address(rh), type(uint256).max);
        l.t.approve(address(rh), type(uint256).max);
        rh.acheter(l.key, address(l.t), NVDAc, UN, alice);
        vm.stopPrank();
        uint256 r = l.t.balanceOf(alice);
        assertGt(r, 0);
        assertEq(l.t.sellCredit(alice), r, "credit followed the router -> user leg");
        assertEq(l.t.sellCredit(address(rh)), 0);
        vm.expectRevert(abi.encodeWithSelector(TBlockBloc24h.PasNotrePool.selector, r / 2, 0));
        vm.prank(alice);
        rh.vendre(l.key, address(l.t), NVDAc, r / 2, alice, true);
        uint256 n0 = IERC20L(NVDAc).balanceOf(alice);
        vm.prank(alice);
        rh.vendre(l.key, address(l.t), NVDAc, r / 2, alice, false);
        assertGt(IERC20L(NVDAc).balanceOf(alice), n0, "settle AFTER the swap works");
        assertEq(l.t.sellCredit(alice), r - r / 2);
        vm.startPrank(adm);
        l.t.approve(address(rh), type(uint256).max);
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, 0, 1 ether));
        rh.vendre(l.key, address(l.t), NVDAc, 1 ether, adm, false);
        vm.stopPrank();
    }

    // ── R7 the lift is AUTOMATIC at birth + 24 h (fin - 1 s still locked; fin: everything free) ────────────
    function test_R7_levee24h_depuisLaNaissance() public fork {
        Hook h = _hook24h();
        TBlockBloc24hFactory f = new TBlockBloc24hFactory(address(PM), address(h));
        TBlockBloc24h t = _bloc(f, "MS24L");
        uint256 cree = block.timestamp;
        assertEq(t.restrictionsEndAt(), 0, "not born: no window yet");
        vm.warp(cree + 3 hours); // born 3 h after creation
        L memory l = _naitre(t, address(h), NVDAc, MINIMUM);
        uint256 fin = cree + 3 hours + 24 hours;
        assertEq(t.restrictionsEndAt(), fin, "window = BIRTH (pool initialization) + 24 h, not deployment + 24 h");
        _acheter(l, alice, UN);
        // creation + 24 h (< birth + 24 h): still locked
        vm.warp(cree + 24 hours);
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, 0, 1 ether));
        _vendre(l, adm, 1 ether);
        // fin - 1: still locked (control)
        vm.warp(fin - 1);
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, 0, 1 ether));
        _vendre(l, adm, 1 ether);
        vm.expectRevert(_wrapped(l.hook, IHooks.beforeRemoveLiquidity.selector, abi.encodeWithSelector(Hook.RetraitBloque24h.selector)));
        vm.prank(adm);
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(l.lo, l.hi, -int256(uint256(l.liq / 2)), bytes32(0)), "");
        // fin: free, with no transaction, no keeper
        vm.warp(fin);
        assertFalse(t.restreint());
        assertEq(t.sellCredit(adm), type(uint256).max, "no cap after the window");
        vm.prank(adm);
        t.transfer(bob, 10 ether); // unbacked p2p
        _vendre(l, adm, 1 ether); // unbacked sell
        _vendre(l, bob, 10 ether);
        vm.prank(adm);
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(l.lo, l.hi, -int256(uint256(l.liq / 2)), bytes32(0)), "");
        // hookless pool with block liquidity: allowed now
        PoolKey memory k2 = PoolKey(l.key.currency0, l.key.currency1, 3000, 200, IHooks(address(0)));
        PM.initialize(k2, l.sp);
        int24 t0 = TickMath.getTickAtSqrtPrice(l.sp);
        (int24 c, int24 d) = l.devise0 ? (t0 - 6000, t0 - 200) : (t0 + 200, t0 + 6000);
        vm.prank(adm);
        lp.modifyLiquidity(k2, IPoolManager.ModifyLiquidityParams(c, d, 1e18, bytes32(0)), "");
    }

    // ── R8 birth: only the bound hook arms, once; a second pool does not re-arm; a B20/foreign block cannot be
    //    born on the 24 h hook; never born -> 7-day safety valve ───────────────────────────────────────────
    function test_R8_naissance_armement() public fork {
        Hook h = _hook24h();
        TBlockBloc24hFactory f = new TBlockBloc24hFactory(address(PM), address(h));
        assertTrue(f.hook() == address(h) && f.poolManager() == address(PM));
        TBlockBloc24h t = _bloc(f, "MS24N");
        assertTrue(f.estBloc(address(t)));
        assertEq(address(t.hook()), address(h));
        assertEq(t.seeder(), adm);
        vm.expectRevert(TBlockBloc24h.PasLeHook.selector);
        vm.prank(adm);
        t.armer();
        // before birth: restricted (creator cannot airdrop), positive: burn always allowed
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, 0, 1 ether));
        vm.prank(adm);
        t.transfer(bob, 1 ether);
        vm.prank(adm);
        t.transfer(MORT, 1);
        L memory l = _naitre(t, address(h), NVDAc, MINIMUM);
        uint256 fin = t.restrictionsEndAt();
        assertEq(fin, block.timestamp + 24 hours);
        // second birth (same block, AAPLc pool) 2 h later: the window does NOT move
        vm.warp(block.timestamp + 2 hours);
        L memory l2 = _naitreAvec(t, address(h), AAPLc, 0, 100_000 ether);
        assertEq(t.restrictionsEndAt(), fin, "second pool does not re-arm");
        uint256 r = _acheter(l2, alice, UN / 10);
        assertEq(t.sellCredit(alice), r, "buy on the AAPLc pool credited too");
        _vendre(l, alice, r); // sold on the NVDAc pool: both are OUR pools
        // a block that is not a cradle block cannot be born on the 24 h hook (its pool init reverts)
        TBlockBloc24hFactory autre = new TBlockBloc24hFactory(address(PM), address(0xdead));
        vm.prank(adm);
        TBlockBloc24h etranger = TBlockBloc24h(autre.creer("X", "X", URI, SUPPLY, bytes32("x")));
        PoolKey memory k = _cle(NVDAc, address(etranger), address(h));
        (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == NVDAc);
        vm.deal(adm, 1 ether);
        vm.prank(adm);
        h.inscrire{value: FRAIS_VIE}(k, sp);
        vm.expectRevert(_wrapped(address(h), IHooks.beforeInitialize.selector, abi.encodeWithSelector(Hook.PasUnBloc24h.selector)));
        PM.initialize(k, sp);
        // safety valve: a block never born is a plain ERC-20 after 7 days
        TBlockBloc24h orphelin = _bloc(f, "MS24O");
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, 0, 1 ether));
        vm.prank(adm);
        orphelin.transfer(bob, 1 ether);
        vm.warp(orphelin.creeLe() + 7 days);
        vm.prank(adm);
        orphelin.transfer(bob, 1 ether);
        // the 24 h hook refuses a B20 config (B20 cannot carry the rule)
        Hook.Config memory c = _cfg(P_SINK, P_CREA, 0, 1, true, true);
        bytes memory init = abi.encodePacked(type(Hook).creationCode, abi.encode(c));
        vm.expectRevert();
        this.deployer(init);
    }

    function deployer(bytes memory init) external {
        _mine(init, FLAGS_24H);
    }

    // ── R9 seed exemption only; LP removal locked during the window ──────────────────────────────────────
    function test_R9_exemptionSemence_retraitBloque() public fork {
        L memory l = _l(); // the birth seed itself is the positive control
        assertFalse(l.t.trading());
        uint256 r = _acheter(l, alice, UN);
        assertTrue(l.t.trading());
        (int24 a, int24 b) = l.devise0 ? (l.lo, l.hi - 2000) : (l.lo + 2000, l.hi);
        uint128 L2 = l.devise0
            ? LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(a), TickMath.getSqrtPriceAtTick(b), 1000 ether)
            : LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(a), TickMath.getSqrtPriceAtTick(b), 1000 ether);
        vm.prank(adm);
        vm.expectPartialRevert(TBlockBloc24h.CreditInsuffisant.selector);
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(a, b, int256(uint256(L2)), bytes32(0)), "");
        // a backed holder CAN add (credit debited 1:1)
        uint128 L3 = l.devise0
            ? LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(a), TickMath.getSqrtPriceAtTick(b), r / 2)
            : LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(a), TickMath.getSqrtPriceAtTick(b), r / 2);
        vm.prank(alice);
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(a, b, int256(uint256(L3)), bytes32("a")), "");
        assertEq(l.t.sellCredit(alice), l.t.balanceOf(alice), "add debited the credit 1:1");
        assertLt(l.t.balanceOf(alice), r);
        vm.expectRevert(_wrapped(l.hook, IHooks.beforeRemoveLiquidity.selector, abi.encodeWithSelector(Hook.RetraitBloque24h.selector)));
        vm.prank(alice);
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(a, b, -int256(uint256(L3)), bytes32("a")), "");
        // carol (no credit) cannot seed our pool
        vm.prank(carol);
        vm.expectRevert();
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(a, b, 1e18, bytes32("c")), "");
        // positive control after the lift: removal works
        vm.warp(l.t.restrictionsEndAt());
        vm.prank(alice);
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(a, b, -int256(uint256(L3)), bytes32("a")), "");
    }

    // ── R10 claims redeemed in a LATER tx arrive UNBACKED; R11 one payout credited once ───────────────────
    /// forge-config: default.isolate = true
    function test_R10_claimsRachetesPlusTard_nonAdosses() public fork {
        L memory l = _l();
        Rachat rc = new Rachat(PM);
        _fundStock(NVDAc, alice, UN);
        BalanceDelta d = _swapBrut(l, alice, true, true, UN, true);
        uint256 x = uint256(_db(l, d));
        assertEq(PM.balanceOf(alice, uint256(uint160(address(l.t)))), x, "bought as claims");
        assertEq(l.t.sellCredit(alice), 0, "no token transfer, no credit");
        vm.prank(alice);
        PM.setOperator(address(rc), true);
        rc.racheter(alice, Currency.wrap(address(l.t)), x);
        assertEq(l.t.balanceOf(alice), x);
        assertEq(l.t.sellCredit(alice), 0, "redeemed later = unbacked");
        vm.prank(alice);
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, alice, 0, x));
        l.t.transfer(bob, x);
    }

    /// forge-config: default.isolate = true
    function test_R11_paiementCrediteUneSeuleFois() public fork {
        L memory l = _l();
        Rachat rc = new Rachat(PM);
        _fundStock(NVDAc, alice, UN);
        BalanceDelta d = _swapBrut(l, alice, true, true, UN, true);
        uint256 x = uint256(_db(l, d));
        vm.prank(alice);
        PM.setOperator(address(rc), true);
        _fundStock(NVDAc, address(rc), UN);
        rc.acheterPuisRacheter(l.key, address(l.t), NVDAc, UN, bob, alice, x);
        uint256 y = l.t.balanceOf(bob);
        assertGt(y, 0);
        assertEq(l.t.sellCredit(bob), y, "bob credited his payout");
        assertEq(l.t.balanceOf(alice), x);
        assertEq(l.t.sellCredit(alice), 0, "the same hooked payout is not credited twice");
    }

    // ── R12 credit games: same-tx round trip (sandwich legs) pays the fee twice and nets; block moved to a
    //    hookless pool with PM credit stays FROZEN when it leaves (documented limit) ─────────────────────────
    /// forge-config: default.isolate = true
    function test_R12_jeuxDeCredit() public fork {
        L memory l = _l();
        Acrobate ac = new Acrobate(PM);
        _fundStock(NVDAc, address(ac), 10 * UN);
        uint256 s0 = _sinkQ(l);
        ac.jouer(Acrobate.Ordre(Acrobate.Op.ALLER_RETOUR, l.key, l.key, address(l.t), UN, 0));
        assertEq(l.t.balanceOf(address(ac)), 0, "round trip: no block left, nothing to dump");
        assertGe(_sinkQ(l) - s0, UN * P_SINK / 1e6, "round trip paid the fee (twice)");
        // buy on our pool, park the block credit as liquidity in a hookless pool (no token transfer at all)
        PoolKey memory k2 = PoolKey(l.key.currency0, l.key.currency1, 3000, 200, IHooks(address(0)));
        PM.initialize(k2, l.sp);
        ac.jouer(Acrobate.Ordre(Acrobate.Op.ACHAT_PUIS_LP_SANS_HOOK, l.key, k2, address(l.t), UN, 1e15));
        // later: pull it back out -> the PoolManager pays the block, NOT a payout of our pool -> unbacked
        // (the part of the bought block the LP add did not use was taken by the attacker: a legit hooked payout)
        uint256 c1 = l.t.sellCredit(address(ac));
        uint256 b1 = l.t.balanceOf(address(ac));
        assertEq(c1, b1, "only the hooked payout is credited");
        ac.jouer(Acrobate.Ordre(Acrobate.Op.RETRAIT_SANS_HOOK, l.key, k2, address(l.t), 0, -1e15));
        uint256 b = l.t.balanceOf(address(ac));
        assertGt(b, b1, "the hookless position came back");
        assertEq(l.t.sellCredit(address(ac)), c1, "what left the hookless pool arrived UNBACKED");
        vm.prank(address(ac));
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, address(ac), c1, b));
        l.t.transfer(bob, b);
    }

    // ── R13 hookData spoofing has no effect (fee and credit identical) ─────────────────────────────────────
    function test_R13_hookDataSansEffet() public fork {
        L memory l = _l();
        uint256 s0 = _sinkQ(l);
        _fundStock(NVDAc, alice, UN);
        bool zfo = l.devise0;
        vm.prank(alice);
        BalanceDelta d = swapper.swap(
            l.key,
            IPoolManager.SwapParams(zfo, -int256(UN), zfo ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1),
            PoolSwapTest.TestSettings(false, false),
            abi.encode(adm, uint256(type(uint128).max), "exempt")
        );
        assertEq(_sinkQ(l) - s0, UN * P_SINK / 1e6, "fee unchanged by hookData");
        assertEq(l.t.sellCredit(alice), uint256(_db(l, d)), "credit unchanged by hookData");
    }

    // ── R14 honeypot fuzz: whoever bought on our pool can ALWAYS sell it back inside the window ────────────
    /// forge-config: default.fuzz.runs = 24
    function testFuzz_R14_pasDeHoneypot(uint256 q, uint256 part) public fork {
        q = bound(q, 1_000, 50 * UN);
        L memory l = _l();
        uint256 r = _acheter(l, alice, q);
        part = bound(part, 0, r);
        vm.prank(alice);
        l.t.transfer(bob, part);
        if (r - part > 0) _vendre(l, alice, r - part);
        if (part > 0) _vendre(l, bob, part);
        assertEq(l.t.balanceOf(alice) + l.t.balanceOf(bob), 0, "everything bought was sold back");
    }

    // ── R15 invariant walk: credit <= balance; total credit <= net hooked payout; creator never moves unbacked ──
    function test_R15_marcheInvariante() public fork {
        L memory l = _l();
        address[3] memory w = [alice, bob, carol];
        uint256 netPaye;
        uint256 x = 0xC0FFEE;
        for (uint256 i; i < 40; ++i) {
            x = uint256(keccak256(abi.encode(x, i)));
            address a = w[x % 3];
            address b = w[(x >> 8) % 3];
            uint256 op = (x >> 16) % 5;
            if (op == 0 || l.t.balanceOf(a) == 0) {
                netPaye += _acheter(l, a, UN / 100 + (x >> 24) % (UN / 5));
            } else if (op == 1) {
                uint256 m = 1 + (x >> 24) % l.t.sellCredit(a);
                _vendre(l, a, m);
                netPaye -= m;
            } else if (op == 2) {
                uint256 m = 1 + (x >> 24) % l.t.balanceOf(a);
                vm.prank(a);
                l.t.transfer(b, m);
            } else if (op == 3) {
                uint256 m = 1 + (x >> 24) % l.t.balanceOf(a);
                vm.prank(a);
                l.t.transfer(MORT, m);
            } else {
                vm.prank(adm);
                (bool ok,) = address(l.t).call(abi.encodeWithSelector(l.t.transfer.selector, a, 1 ether));
                assertFalse(ok, "unbacked transfer passed");
            }
            uint256 somme;
            for (uint256 j; j < 3; ++j) {
                assertLe(l.t.sellCredit(w[j]), l.t.balanceOf(w[j]), "credit > balance");
                somme += l.t.sellCredit(w[j]);
            }
            somme += l.t.sellCredit(adm) + l.t.sellCredit(MORT) + l.t.sellCredit(address(swapper));
            assertLe(somme, netPaye, "total credit above what our pools paid out net");
        }
        _invariant(l);
    }
}
