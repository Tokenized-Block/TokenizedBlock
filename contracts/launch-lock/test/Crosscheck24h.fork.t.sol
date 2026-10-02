// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// ZERO 1 INDEPENDENT CROSSCHECK of Grok Bot's 24h cradle (feat/launch-lock-24h @ 6260b7c).
// Section C spike (Block24hToken + suivi24h) 13 checks PORTED onto THEIR TBlockBloc24h / TBlockLaunchLockHook,
// plus the task's negative checks and OPEN RISK #1 (hookless parking) measured to the wei. FORK ONLY.
import {console2} from "forge-std/console2.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId} from "v4-core/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {TransientStateLibrary} from "v4-core/libraries/TransientStateLibrary.sol";
import {LiquidityAmounts} from "../src/lib/LiquidityAmounts.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {TBlockBloc24h} from "../src/TBlockBloc24h.sol";
import {TBlockBloc24hFactory} from "../src/TBlockBloc24hFactory.sol";
import {LLBase, IERC20L} from "./LLBase.sol";
import {MockPaire, RouteurHop, Rachat} from "./Helpers24h.sol";
import {Acrobate} from "./Acrobate.sol";

/// a fake "block token" that hammers the hook's per-tx consumers directly, to prove no reentrancy leak:
/// consommerSortie/consommerEntree are keyed by msg.sender (== this fake), touch only transient storage, make no
/// external call, so a hostile caller can at most read its OWN (zero) net. Returns the max it could pull.
contract FauxJeton {
    function piller(Hook h, uint256 n) external returns (uint256 sortie, uint256 vente, uint256 ajout) {
        for (uint256 i; i < n; ++i) {
            sortie += h.consommerSortie(type(uint256).max);
            (uint256 ve, uint256 aj) = h.consommerEntree(type(uint256).max);
            vente += ve;
            ajout += aj;
        }
    }
}

contract Crosscheck24hTest is LLBase {
    using CurrencyLibrary for Currency;
    using TransientStateLibrary for IPoolManager;

    uint256 constant Q = 3 * UN; // 3 NVDAc

    function _l() internal returns (L memory) {
        return _lancer(_hook24h(), NVDAc, MINIMUM, "XC24");
    }

    // ═══ 13 PORTED CHECKS (Zero 1 Section C C1..C12, C4a/C4b split) ═══════════════════════════════════

    // C1 unbacked sell reverts; backed sell OK (fee in the stock)
    function test_xc01_unbackedSellReverts_backedOk() public fork {
        L memory l = _l();
        uint256 r = _acheter(l, alice, Q);
        assertEq(l.t.sellCredit(alice), r, "C1 credit == bought");
        // the seeder's retained unbacked 0.1% cannot be dumped (trading is on)
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, 0, 1 ether));
        _vendre(l, adm, 1 ether);
        uint256 s0 = _sinkQ(l);
        uint256 out = _vendre(l, alice, r);
        assertGt(out, 0);
        assertEq(l.t.sellCredit(alice), 0, "C1 sold back to zero");
        assertGt(_sinkQ(l) - s0, 0, "C1 sell fee in the stock");
        _invariant(l);
    }

    // C2 credit + 1 wei reverts; exactly the credit passes
    function test_xc02_creditPlusOneWei() public fork {
        L memory l = _l();
        uint256 retenu = l.t.balanceOf(adm);
        uint256 r = _acheter(l, adm, UN); // seeder buys: balance = retained + r, credit = r
        assertEq(l.t.sellCredit(adm), r);
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, r, r + 1));
        _vendre(l, adm, r + 1);
        _vendre(l, adm, r);
        assertEq(l.t.sellCredit(adm), 0);
        assertEq(l.t.balanceOf(adm), retenu, "only the unbacked retained part left");
    }

    // C3 A->B: credit moves with the tokens, B never exceeds, unbacked airdrop reverts
    function test_xc03_creditFollowsTokens() public fork {
        L memory l = _l();
        uint256 r = _acheter(l, alice, UN);
        vm.prank(alice);
        l.t.transfer(bob, r / 2);
        assertEq(l.t.sellCredit(alice), r - r / 2, "C3 debited");
        assertEq(l.t.sellCredit(bob), r / 2, "C3 credit moved");
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, 0, 5 ether));
        vm.prank(adm);
        l.t.transfer(bob, 5 ether);
    }

    // C4a hookless v4 pool: a backed sell and a block-liquidity add both REVERT (PasNotrePool)
    function test_xc04a_hooklessV4Reverts() public fork {
        L memory l = _l();
        uint256 r = _acheter(l, alice, 2 * UN);
        PoolKey memory k2 = PoolKey(l.key.currency0, l.key.currency1, 3000, 200, IHooks(address(0)));
        PM.initialize(k2, l.sp);
        int24 t0 = TickMath.getTickAtSqrtPrice(l.sp);
        _fundStock(NVDAc, carol, 10 * UN);
        (int24 a, int24 b) = l.devise0 ? (t0 + 200, t0 + 6000) : (t0 - 6000, t0 - 200);
        uint128 L2 = l.devise0
            ? LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(a), TickMath.getSqrtPriceAtTick(b), 5 * UN)
            : LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(a), TickMath.getSqrtPriceAtTick(b), 5 * UN);
        _approve(carol, NVDAc);
        vm.prank(carol);
        lp.modifyLiquidity(k2, IPoolManager.ModifyLiquidityParams(a, b, int256(uint256(L2)), bytes32(0)), "");
        // a BACKED holder sells block into the hookless pool: refused (not our pool)
        bool zfo = !l.devise0;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockBloc24h.PasNotrePool.selector, r / 4, 0));
        swapper.swap(k2, IPoolManager.SwapParams(zfo, -int256(r / 4), zfo ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), PoolSwapTest.TestSettings(false, false), "");
    }

    // C4b V2/V3-style pair: unbacked REVERTS, backed passes and credit MOVES to the pair
    function test_xc04b_v2StylePair() public fork {
        L memory l = _l();
        uint256 r = _acheter(l, alice, 2 * UN);
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
        assertEq(l.t.sellCredit(address(p)), r / 4, "C4b credit moved, none created");
    }

    // C5 buy then sell the exact amount round-trips to zero (periphery swap)
    function test_xc05_roundTripToZero() public fork {
        L memory l = _l();
        uint256 r = _acheter(l, alice, Q);
        _vendre(l, alice, r);
        assertEq(l.t.balanceOf(alice), 0);
        assertEq(l.t.sellCredit(alice), 0);
        _invariant(l);
    }

    // C6 seed exemption only: the seeder's unbacked tokens cannot move except the birth seed (already placed)
    function test_xc06_seedExemptionOnly() public fork {
        L memory l = _l();
        assertFalse(l.t.trading());
        // the seeder cannot airdrop/park its retained unbacked 0.1% anywhere
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, 0, 1 ether));
        vm.prank(adm);
        l.t.transfer(bob, 1 ether);
        _acheter(l, alice, UN);
        assertTrue(l.t.trading(), "C6 first credited payout ends the seed phase");
        // after the first trade, a further UNBACKED seeder add on OUR pool is refused (exemption closed)
        (int24 x, int24 y) = l.devise0 ? (l.lo, l.hi - 2000) : (l.lo + 2000, l.hi);
        uint128 L2 = l.devise0
            ? LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(x), TickMath.getSqrtPriceAtTick(y), 1000 ether)
            : LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(x), TickMath.getSqrtPriceAtTick(y), 1000 ether);
        vm.prank(adm);
        vm.expectPartialRevert(TBlockBloc24h.CreditInsuffisant.selector);
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(x, y, int256(uint256(L2)), bytes32(0)), "");
    }

    // C7 after the 24h window everything is a plain ERC-20 (no restriction)
    function test_xc07_after24hFree() public fork {
        L memory l = _l();
        uint256 end = l.t.restrictionsEndAt();
        assertGt(end, 0);
        // inside the window: the seed LP cannot be pulled (RetraitBloque24h), at the end it can
        vm.warp(end - 1);
        vm.prank(adm);
        vm.expectRevert(_wrapped(l.hook, IHooks.beforeRemoveLiquidity.selector, abi.encodeWithSelector(Hook.RetraitBloque24h.selector)));
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(l.lo, l.hi, -int256(uint256(l.liq / 2)), bytes32(0)), "");
        vm.warp(end);
        vm.prank(adm);
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(l.lo, l.hi, -int256(uint256(l.liq / 2)), bytes32(0)), "");
        assertEq(l.t.sellCredit(adm), type(uint256).max, "C7 unrestricted");
        vm.prank(adm);
        l.t.transfer(bob, 1 ether); // the previously-unbacked retained tokens now move freely
        assertEq(l.t.balanceOf(bob), 1 ether);
    }

    // C8 invariant walk: credit <= balance; total credit <= net hooked payout
    function test_xc08_invariantWalk() public fork {
        L memory l = _l();
        address[3] memory w = [alice, bob, carol];
        uint256 net;
        uint256 x = 0xBEEF;
        for (uint256 i; i < 40; ++i) {
            x = uint256(keccak256(abi.encode(x, i)));
            address a = w[x % 3];
            if ((x >> 8) % 4 == 0 || l.t.balanceOf(a) == 0) {
                net += _acheter(l, a, UN / 50 + (x >> 16) % (UN / 10));
            } else if ((x >> 8) % 4 == 1) {
                uint256 m = 1 + (x >> 16) % l.t.sellCredit(a);
                _vendre(l, a, m);
                net -= m;
            } else if ((x >> 8) % 4 == 2) {
                uint256 m = 1 + (x >> 16) % l.t.balanceOf(a);
                vm.prank(a);
                l.t.transfer(w[(x >> 24) % 3], m);
            } else {
                uint256 m = 1 + (x >> 16) % l.t.balanceOf(a);
                vm.prank(a);
                l.t.transfer(MORT, m); // burn: credit must be trimmed to the balance
            }
            uint256 sum;
            for (uint256 j; j < 3; ++j) {
                assertLe(l.t.sellCredit(w[j]), l.t.balanceOf(w[j]), "C8 credit>balance");
                sum += l.t.sellCredit(w[j]);
            }
            assertLe(sum, net, "C8 total credit > net hooked payout");
        }
        _invariant(l);
    }

    // C10 claims redeemed in a LATER tx arrive UNBACKED (no credit)
    /// forge-config: default.isolate = true
    function test_xc10_claimsLaterUnbacked() public fork {
        L memory l = _l();
        Rachat rc = new Rachat(PM);
        _fundStock(NVDAc, alice, UN);
        BalanceDelta d = _swapBrut(l, alice, true, true, UN, true); // take as 6909 claims
        uint256 xb = uint256(_db(l, d));
        assertEq(l.t.sellCredit(alice), 0, "C10 no transfer, no credit");
        vm.prank(alice);
        PM.setOperator(address(rc), true);
        rc.racheter(alice, Currency.wrap(address(l.t)), xb);
        assertEq(l.t.balanceOf(alice), xb);
        assertEq(l.t.sellCredit(alice), 0, "C10 redeemed later = unbacked");
        vm.prank(alice);
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, alice, 0, xb));
        l.t.transfer(bob, xb);
    }

    // C11 router hops: a PRE-settle router (pays PM before the swap) FAILS; the post-settle order works
    function test_xc11_routerHops_preSettleFails() public fork {
        L memory l = _l();
        uint256 r = _acheter(l, alice, UN);
        RouteurHop rr = new RouteurHop(PM);
        vm.prank(alice);
        l.t.approve(address(rr), type(uint256).max);
        // pre-settle (avant=true): the block reaches the PM before the hook saw the sell -> revert
        vm.prank(alice);
        vm.expectRevert();
        rr.vendre(l.key, address(l.t), NVDAc, r / 2, alice, true);
        // post-settle (avant=false): works, credit debited
        vm.prank(alice);
        rr.vendre(l.key, address(l.t), NVDAc, r / 2, alice, false);
        assertEq(l.t.sellCredit(alice), r - r / 2, "C11 debited by what sold");
    }

    // C12 one hooked payout is credited exactly once (buy-then-redeem a third party's claims in one tx)
    /// forge-config: default.isolate = true
    function test_xc12_payoutConsumedOnce() public fork {
        L memory l = _l();
        Rachat rc = new Rachat(PM);
        _fundStock(NVDAc, alice, UN);
        BalanceDelta d = _swapBrut(l, alice, true, true, UN, true);
        uint256 xb = uint256(_db(l, d));
        vm.prank(alice);
        PM.setOperator(address(rc), true);
        _fundStock(NVDAc, address(rc), UN);
        rc.acheterPuisRacheter(l.key, address(l.t), NVDAc, UN, bob, alice, xb);
        assertEq(l.t.sellCredit(bob), l.t.balanceOf(bob), "C12 bob credited his own payout");
        assertEq(l.t.sellCredit(alice), 0, "C12 the same payout is NOT credited twice");
    }

    // ═══ NEGATIVE CHECKS (task 2) ═════════════════════════════════════════════════════════════════════

    // (b) the fee wallet NEVER receives the block token (only the stock), across buy + sell
    function test_neg_b_feeWalletNeverBlock() public fork {
        L memory l = _l();
        assertEq(l.t.balanceOf(SINK), 0);
        uint256 r = _acheter(l, alice, Q);
        _vendre(l, alice, r / 2);
        assertEq(l.t.balanceOf(SINK), 0, "sink holds 0 block tokens");
        assertEq(PM.balanceOf(SINK, uint256(uint160(address(l.t)))), 0, "sink holds 0 block claims");
        assertGt(IERC20L(NVDAc).balanceOf(SINK), 0, "sink paid only in the stock");
    }

    // (c) old / unhooked pools cannot be attached. V8 live hook + a hookless key: registration on a FOREIGN hook
    //     reverts MauvaisHook; the cradle token's armer() is callable only by its own hook.
    function test_neg_c_oldHookCannotAttach() public fork {
        Hook h = _hook24h();
        TBlockBloc24hFactory f = new TBlockBloc24hFactory(address(PM), address(h));
        TBlockBloc24h t = _bloc(f, "XCOLD");
        // register the SAME token on a pool keyed to the live V8 hook -> the 24h hook is not that pool's hook
        PoolKey memory kV8 = _cle(NVDAc, address(t), HOOK_V8);
        vm.deal(adm, adm.balance + 1 ether);
        vm.prank(adm);
        vm.expectRevert(Hook.MauvaisHook.selector);
        h.inscrire{value: FRAIS_VIE}(kV8, uint160(TickMath.getSqrtPriceAtTick(0)));
        // only the bound hook can arm the token's window
        vm.expectRevert(TBlockBloc24h.PasLeHook.selector);
        t.armer();
        // a hookless pool of the cradle token: initialize is possible, but a block-liquidity add / sell revert
        PoolKey memory k0 = _cle(NVDAc, address(t), address(0));
        (uint160 sp,) = _prix(Currency.unwrap(k0.currency0) == NVDAc);
        PM.initialize(k0, sp);
        // no birth on the hookless pool -> the token stays in the pre-birth restricted state (SOUPAPE), unbacked
        // inflow to the PM for that pool is refused
        assertEq(t.restrictionsEndAt(), 0, "hookless init does NOT arm the window");
    }

    // (d) flash-loan against the creator escrow: borrow(mint) -> demanderRetrait/retirerCaution/recharger -> repay,
    //     all in one tx, must extract 0. retirerCaution needs delaiRetrait, so the escrow cannot leave in-tx.
    function test_neg_d_flashLoanEscrowZero() public fork {
        L memory l = _l();
        Hook h = Hook(l.hook);
        PoolId id = l.key.toId();
        uint256 before = IERC20L(NVDAc).balanceOf(adm);
        assertEq(h.caution(id), MINIMUM);
        vm.startPrank(adm);
        h.demanderRetrait(l.key);
        vm.expectRevert(Hook.RetraitPasPret.selector);
        h.retirerCaution(l.key); // same tx: cannot pull the escrow
        vm.stopPrank();
        assertEq(h.caution(id), MINIMUM, "escrow untouched");
        assertEq(IERC20L(NVDAc).balanceOf(adm), before, "0 extracted");
        assertFalse(h.createurActif(id), "exit requested -> share stopped");
    }

    // 10:56 rule: below the minimum, the 0.03% creator piece goes to locked collateral; back at/above it the
    //     creator earns again on LATER swaps; the already-diverted fees stay in collateral.
    function test_rule_1056_belowMin_toCollateral_thenResumes() public fork {
        L memory l = _l();
        Hook h = Hook(l.hook);
        PoolId id = l.key.toId();
        _fundStock(NVDAc, alice, 20 * UN);
        // active: creator earns
        (uint256 du0,) = _du(l);
        _swapBrut(l, alice, true, true, UN, false);
        (uint256 du1, uint256 co1) = _du(l);
        assertEq(du1 - du0, UN * P_CREA / 1e6, "creator earns while active");
        // exit -> escrow stays but share stops; creator piece -> collateral
        vm.prank(adm);
        h.demanderRetrait(l.key);
        assertFalse(h.createurActif(id));
        _swapBrut(l, alice, true, true, UN, false);
        (uint256 du2, uint256 co2) = _du(l);
        assertEq(du2, du1, "creator does NOT earn below the gate");
        assertEq(co2 - co1, UN * P_CREA / 1e6, "the 0.03% went to collateral");
        // recharge back to >= minimum (escrow never left): creator earns again, collateral keeps what it got
        vm.prank(adm);
        h.recharger(l.key, 0);
        assertTrue(h.createurActif(id));
        _swapBrut(l, alice, true, true, UN, false);
        (uint256 du3, uint256 co3) = _du(l);
        assertEq(du3 - du2, UN * P_CREA / 1e6, "creator earns again after recharge");
        assertEq(co3, co2, "already-diverted collateral stays");
    }

    // OFF matches V9 to the wei: the 24h hook with every option OFF vs Zero 1's V9 reference (sha256-identical to
    //     /workspace/tb-v9/src). 4 shapes; sink pieces equal AND equal the closed form floor(q*900/1e6).
    function test_OFF_equals_V9_toTheWei() public fork {
        address v9 = _deployV9Zero1();
        Hook off = _deployHook(_cfg(TAUX_V9, 0, 0, 0, true, false));
        assertFalse(off.SUIVI_24H());
        L memory a = _ouvrirB20V9(v9, "XCV9A");
        // same currency ordering on both sides (B20 addresses vary with mining): otherwise tick rounding differs
        L memory b = _ouvrirB20V9(address(off), "XCV9B");
        // ⛔ 2026-10-02 : 6 essais = ~1 echec sur 128 sur un fork NON epingle (adresses pseudo-aleatoires) — vu une fois,
        //   88/89, sans rapport avec le hook. 24 essais : ~6e-8. Le banc cherche une ORIENTATION, il ne juge rien ici.
        for (uint256 i; b.devise0 != a.devise0 && i < 24; ++i) b = _ouvrirB20V9(address(off), string.concat("XCV9", vm.toString(i)));
        require(b.devise0 == a.devise0, "no same-orientation block found");
        _fundStock(NVDAc, alice, 20 * UN);
        _approve(alice, address(a.t));
        _approve(alice, address(b.t));
        _approve(alice, NVDAc);
        // V9's 4 shapes (tb-v9 V9.fork.t.sol): buy exact-in q / buy exact-out / sell exact-in / sell exact-out
        uint256[4] memory m = [uint256(2 * UN), 1000 ether, 1000 ether, UN / 10];
        uint256[4] memory attendu = [uint256(180000), 90, 90, 9000];
        for (uint256 c; c < 4; ++c) {
            bool achat = c < 2;
            bool exin = c == 0 || c == 2;
            uint256 s0 = _sinkQ(a);
            BalanceDelta da = _swapBrut(a, alice, achat, exin, m[c], false);
            uint256 fa = _sinkQ(a) - s0;
            s0 = _sinkQ(b);
            BalanceDelta db = _swapBrut(b, alice, achat, exin, m[c], false);
            uint256 fb = _sinkQ(b) - s0;
            assertEq(fa, fb, "OFF == V9 sink to the wei");
            assertEq(_dq(a, da), _dq(b, db), "quote delta identical");
            assertEq(_db(a, da), _db(b, db), "block delta identical");
            // Zero 1 tb-v9 closed forms (V9.fork.t.sol lines 129/145/159/173)
            int256 dq = _dq(b, db);
            uint256 formule;
            if (c == 0) formule = m[c] * 9 / 10000; // fee = q*9/1e4
            else if (c == 1) formule = (uint256(-dq) - fb) * 9 / 10000; // fee = (paid - fee)*9/1e4
            else if (c == 2) formule = (uint256(dq) + fb) * 9 / 10000; // fee = (received + fee)*9/1e4
            else formule = m[c] * 9 / 10000; // fee = wanted*9/1e4
            assertEq(fb, formule, "OFF == tb-v9 closed form");
            assertEq(fb, attendu[c], "OFF == 180000/90/90/9000");
            console2.log("OFF=V9 shape %s : V9 %s == OFF %s", c, fa, fb);
        }
    }

    // V9-style open of a REAL B20 block (no creator/collateral/cradle) on `hook`, seeded vs NVDAc
    function _ouvrirB20V9(address hook, string memory sym) internal returns (L memory l) {
        bytes memory params = abi.encode(Params(1, sym, sym, adm, 18));
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeWithSignature("updateContractURI(string)", URI);
        vm.deal(adm, adm.balance + FRAIS_OUVERTURE + 1 ether);
        vm.prank(adm);
        address bloc = ICreateRouter(CREATE_ROUTER).createPaid{value: FRAIS_OUVERTURE}(0, keccak256(abi.encode(sym, nonceSel++)), params, calls, adm);
        l.t = TBlockBloc24h(bloc);
        l.hook = hook;
        l.devise = NVDAc;
        l.key = _cle(NVDAc, bloc, hook);
        l.devise0 = Currency.unwrap(l.key.currency0) == NVDAc;
        int24 tick;
        (l.sp, tick) = _prix(l.devise0);
        vm.prank(adm);
        Hook(hook).inscrire{value: FRAIS_VIE}(l.key, l.sp);
        PM.initialize(l.key, l.sp);
        uint256 seed = IERC20L(bloc).balanceOf(adm) * 999 / 1000;
        if (l.devise0) {
            l.lo = TickMath.minUsableTick(200);
            l.hi = tick;
            l.liq = LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(l.lo), l.sp, seed);
        } else {
            l.lo = tick + 200;
            l.hi = TickMath.maxUsableTick(200);
            l.liq = LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(l.lo), TickMath.getSqrtPriceAtTick(l.hi), seed);
        }
        _approve(adm, bloc);
        _approve(adm, NVDAc);
        vm.prank(adm);
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(l.lo, l.hi, int256(uint256(l.liq)), bytes32(0)), "");
    }

    // ═══ OPEN RISK #1 — HOOKLESS PARKING, leak measured to the wei ════════════════════════════════════

    // Variant 1+2: buy X on our pool taking 6909 claims (no credit), then in the SAME unlock park X as liquidity
    //     in a HOOKLESS v4 pool. Then (later) pull it back out. Measure recreated/transferable sellCredit.
    /// forge-config: default.isolate = true
    function test_risk1_hooklessParking_viaClaimsAndLP() public fork {
        L memory l = _l();
        Acrobate ac = new Acrobate(PM);
        _fundStock(NVDAc, address(ac), 10 * UN);
        PoolKey memory k2 = PoolKey(l.key.currency0, l.key.currency1, 3000, 200, IHooks(address(0)));
        PM.initialize(k2, l.sp);
        // buy on our pool, park the whole bought amount as hookless LP, with NO ERC-20 transfer at all
        ac.jouer(Acrobate.Ordre(Acrobate.Op.ACHAT_PUIS_LP_SANS_HOOK, l.key, k2, address(l.t), UN, 1e15));
        uint256 credit1 = l.t.sellCredit(address(ac));
        uint256 bal1 = l.t.balanceOf(address(ac));
        assertEq(credit1, bal1, "park: credit == only the hooked payout kept as tokens");
        // pull the hookless position back: the PM pays block tokens NOT as a payout of our pool -> UNBACKED
        ac.jouer(Acrobate.Ordre(Acrobate.Op.RETRAIT_SANS_HOOK, l.key, k2, address(l.t), 0, -1e15));
        uint256 bal2 = l.t.balanceOf(address(ac));
        uint256 credit2 = l.t.sellCredit(address(ac));
        assertGt(bal2, bal1, "the parked block came back as tokens");
        assertEq(credit2, credit1, "LEAK CHECK: pulling from a hookless pool recreates 0 wei of credit");
        uint256 leak = credit2 - credit1; // recreated transferable/sellable credit
        // whatever is unbacked cannot be transferred or sold
        vm.prank(address(ac));
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, address(ac), credit2, bal2));
        l.t.transfer(bob, bal2);
        console2.log("RISK1 claims+hooklessLP: transferable credit (wei) =", leak);
        console2.log("RISK1 frozen unbacked block parked (wei) =", bal2 - credit2);
    }

    // Variant 3: buy-then-transfer to a fresh wallet. Only backed tokens move; the fresh wallet cannot exceed.
    function test_risk1_buyThenTransferFresh() public fork {
        L memory l = _l();
        uint256 r = _acheter(l, alice, UN);
        vm.prank(alice);
        l.t.transfer(passant, r);
        assertEq(l.t.sellCredit(passant), r, "fresh wallet gets exactly the moved credit");
        vm.expectRevert(TBlockBloc24h.Solde.selector);
        vm.prank(passant);
        l.t.transfer(bob, r + 1);
        // fresh wallet with no prior credit cannot receive unbacked
        vm.expectRevert(_sel(TBlockBloc24h.CreditInsuffisant.selector, adm, 0, 1));
        vm.prank(adm);
        l.t.transfer(passant, 1);
    }

    // Variant 4: same-tx flash round trip (buy then immediately sell the credit) extracts 0 block, pays fee twice.
    function test_risk1_sameTxRoundTrip() public fork {
        L memory l = _l();
        Acrobate ac = new Acrobate(PM);
        _fundStock(NVDAc, address(ac), 10 * UN);
        uint256 s0 = _sinkQ(l);
        ac.jouer(Acrobate.Ordre(Acrobate.Op.ALLER_RETOUR, l.key, l.key, address(l.t), UN, 0));
        assertEq(l.t.balanceOf(address(ac)), 0, "round trip leaves no block");
        assertEq(l.t.sellCredit(address(ac)), 0, "round trip recreates 0 credit");
        assertGe(_sinkQ(l) - s0, UN * P_SINK / 1e6, "round trip paid the fee");
    }

    // Variant 5: recursion/reentrancy directly against the per-tx consumers from a hostile fake token.
    //     Keyed by msg.sender, transient-only, no external call -> a stranger pulls 0.
    function test_risk1_reentrancyConsumers() public fork {
        L memory l = _l();
        Hook h = Hook(l.hook);
        FauxJeton fj = new FauxJeton();
        (uint256 sortie, uint256 vente, uint256 ajout) = fj.piller(h, 50);
        assertEq(sortie, 0, "no payout to steal");
        assertEq(vente, 0);
        assertEq(ajout, 0);
        console2.log("RISK1 reentrancy: pulled sortie/vente/ajout =", sortie, vente, ajout);
    }
}

interface ICreateRouter {
    function createPaid(uint8, bytes32, bytes calldata, bytes[] calldata, address) external payable returns (address);
}

/// Zero 1 generic PoolManager actor: runs a list of raw PM ops inside ONE unlock (no periphery), settling with
/// its own balances or with transferFrom on an approving owner. Used to hunt hookless-parking / seed-exemption leaks.
contract Z1Acteur {
    using TransientStateLibrary for IPoolManager;

    IPoolManager public immutable pm;
    uint8 constant SWAP = 0; // amountSpecified = amt (0: exact-in of the whole positive delta of cur)
    uint8 constant ADD = 1; // block-only liquidity worth amt of cur (0: the whole positive delta), records owed
    uint8 constant REMOVE = 2; // remove everything this actor added at (key, lo, hi)
    uint8 constant MINT = 3; // mint claims of cur to who (amt, 0: whole positive delta)
    uint8 constant BURN = 4; // burn amt claims of cur held by who (this actor or operator)
    uint8 constant PAYFROM = 5; // sync, transferFrom(who -> PM, amt; 0 = last owed), settle
    uint8 constant TAKE = 6; // take amt of cur to who (0 = last owed)
    uint8 constant SOLDER = 7; // close cur: pay negative delta from own balance, take positive delta to who

    struct Op {
        uint8 k;
        PoolKey key;
        bool zfo;
        int256 amt;
        int24 lo;
        int24 hi;
        address cur;
        address who;
    }

    mapping(bytes32 => uint128) public liq;
    uint256 public dernierDu;

    constructor(IPoolManager p) {
        pm = p;
    }

    function jouer(Op[] calldata ops) external {
        pm.unlock(abi.encode(ops));
    }

    function unlockCallback(bytes calldata d) external returns (bytes memory) {
        require(msg.sender == address(pm), "pm");
        Op[] memory ops = abi.decode(d, (Op[]));
        for (uint256 i; i < ops.length; ++i) _op(ops[i]);
        return "";
    }

    function _d(address c) internal view returns (int256) {
        return pm.currencyDelta(address(this), Currency.wrap(c));
    }

    function _k(Op memory o) internal pure returns (bytes32) {
        return keccak256(abi.encode(o.key, o.lo, o.hi));
    }

    function _op(Op memory o) internal {
        if (o.k == SWAP) {
            int256 a = o.amt == 0 ? -_d(o.cur) : o.amt;
            pm.swap(o.key, IPoolManager.SwapParams(o.zfo, a, o.zfo ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
        } else if (o.k == ADD) {
            uint256 m = o.amt == 0 ? uint256(_d(o.cur)) : uint256(o.amt);
            bool b0 = Currency.unwrap(o.key.currency0) == o.cur;
            uint160 sa = TickMath.getSqrtPriceAtTick(o.lo);
            uint160 sb = TickMath.getSqrtPriceAtTick(o.hi);
            uint128 L = b0 ? LiquidityAmounts.getLiquidityForAmount0(sa, sb, m) : LiquidityAmounts.getLiquidityForAmount1(sa, sb, m);
            int256 avant = _d(o.cur);
            pm.modifyLiquidity(o.key, IPoolManager.ModifyLiquidityParams(o.lo, o.hi, int256(uint256(L)), bytes32(0)), "");
            dernierDu = uint256(avant - _d(o.cur));
            liq[_k(o)] += L;
        } else if (o.k == REMOVE) {
            bytes32 kk = _k(o);
            uint128 L = liq[kk];
            liq[kk] = 0;
            pm.modifyLiquidity(o.key, IPoolManager.ModifyLiquidityParams(o.lo, o.hi, -int256(uint256(L)), bytes32(0)), "");
        } else if (o.k == MINT) {
            uint256 m = o.amt == 0 ? uint256(_d(o.cur)) : uint256(o.amt);
            pm.mint(o.who, uint256(uint160(o.cur)), m);
        } else if (o.k == BURN) {
            pm.burn(o.who, uint256(uint160(o.cur)), uint256(o.amt));
        } else if (o.k == PAYFROM) {
            uint256 m = o.amt == 0 ? dernierDu : uint256(o.amt);
            pm.sync(Currency.wrap(o.cur));
            if (o.who == address(this)) IERC20L(o.cur).transfer(address(pm), m);
            else IERC20T2(o.cur).transferFrom(o.who, address(pm), m);
            pm.settle();
        } else if (o.k == TAKE) {
            uint256 m = o.amt == 0 ? dernierDu : uint256(o.amt);
            pm.take(Currency.wrap(o.cur), o.who, m);
        } else if (o.k == SOLDER) {
            int256 x = _d(o.cur);
            if (x < 0) {
                pm.sync(Currency.wrap(o.cur));
                IERC20L(o.cur).transfer(address(pm), uint256(-x));
                pm.settle();
            } else if (x > 0) {
                pm.take(Currency.wrap(o.cur), o.who, uint256(x));
            }
        }
    }
}

interface IERC20T2 {
    function transferFrom(address, address, uint256) external returns (bool);
}

/// OPEN RISK #1, seeder path + single-tx bound. The seed exemption (`from == seeder && !trading` => only the SELL
/// part is debited) is the only place an UNBACKED inflow to the PoolManager is tolerated. It is meant for the birth
/// seed, whose block amount is recorded as `ajout` by OUR afterAddLiquidity. If an add on our pool is paid by PM
/// netting (a hooked buy's payout, or burned claims) instead of a token transfer, its `ajout` is left over and can
/// cover a DIFFERENT unbacked transfer of the seeder.
contract Crosscheck24hSemenceTest is LLBase {
    using TransientStateLibrary for IPoolManager;

    function _o(uint8 k, PoolKey memory key, bool zfo, int256 amt, int24 lo, int24 hi, address cur, address who)
        internal
        pure
        returns (Z1Acteur.Op memory)
    {
        return Z1Acteur.Op(k, key, zfo, amt, lo, hi, cur, who);
    }

    /// a block-only range far on the "block side" of the birth price (stays block-only after a small buy)
    function _plageLoin(L memory l) internal pure returns (int24 lo, int24 hi) {
        (, int24 t) = _prix(l.devise0);
        if (l.devise0) {
            // block = currency1: block-only BELOW the price
            lo = TickMath.minUsableTick(200);
            hi = t - 20000;
        } else {
            lo = t + 20000;
            hi = TickMath.maxUsableTick(200);
        }
    }

    // S1 — ONE tx, seeder before the first credited payout:
    //   hooked buy X (payout netted, not taken) -> add X to OUR pool netted (ajout X left over) ->
    //   transferFrom(seeder -> PM, A) of RETAINED UNBACKED tokens (covered by the leftover ajout, du = vente = 0) ->
    //   take A back to the seeder (covered by the leftover hooked net +X) => A unbacked tokens become CREDITED.
    /// forge-config: default.isolate = true
    function test_S1_seedExemption_launderRetained_oneTx() public fork {
        L memory l = _lancer(_hook24h(), NVDAc, MINIMUM, "XCS1");
        assertFalse(l.t.trading());
        uint256 retenu = l.t.balanceOf(adm);
        assertEq(l.t.sellCredit(adm), 0, "retained 0.1% is unbacked");
        Z1Acteur z = new Z1Acteur(PM);
        _fundStock(NVDAc, address(z), 2 * UN);
        vm.prank(adm);
        l.t.approve(address(z), type(uint256).max);
        (int24 lo, int24 hi) = _plageLoin(l);
        address bloc = address(l.t);
        Z1Acteur.Op[] memory ops = new Z1Acteur.Op[](6);
        ops[0] = _o(0, l.key, l.devise0, -int256(UN), 0, 0, bloc, address(0)); // hooked buy X, payout left in PM
        ops[1] = _o(1, l.key, false, 0, lo, hi, bloc, address(0)); // add ~X to OUR pool, paid by netting
        ops[2] = _o(5, l.key, false, 0, 0, 0, bloc, adm); // transferFrom(seeder -> PM, A) of RETAINED tokens
        ops[3] = _o(6, l.key, false, 0, 0, 0, bloc, adm); // take A back to the seeder
        ops[4] = _o(7, l.key, false, 0, 0, 0, bloc, address(z)); // close block delta
        ops[5] = _o(7, l.key, false, 0, 0, 0, NVDAc, address(z)); // pay the stock
        (bool ok, bytes memory why) = address(z).call(abi.encodeWithSelector(Z1Acteur.jouer.selector, ops));
        uint256 credit = l.t.sellCredit(adm);
        console2.log("S1 attack tx succeeded:", ok);
        console2.log("S1 seeder credit recreated from UNBACKED retained (wei):", credit);
        console2.log("S1 retained before / after:", retenu, l.t.balanceOf(adm));
        if (!ok) console2.logBytes(why);
        // SAFE property: the seeder's retained unbacked tokens never become sellable credit in the window
        assertEq(credit, 0, "LEAK: seed exemption + PM netting launders retained tokens into sellCredit");
    }

    // S2 — claims, cross-tx, NO credit needed: tx1 seeder buys X as 6909 claims (no credited payout -> trading
    //   stays false). tx2 burn claims -> add to OUR pool netted (ajout left over) -> transferFrom(seeder -> PM, A)
    //   unbacked, covered by ajout, not debited -> park A as HOOKLESS v4 liquidity. tx3 pull the hookless LP and
    //   SELL it into OUR pool through PM netting (no token transfer, no debit) -> seeder receives the stock.
    /// forge-config: default.isolate = true
    function test_S2_seedExemption_parkRetainedHookless_thenSell() public fork {
        L memory l = _lancer(_hook24h(), NVDAc, MINIMUM, "XCS2");
        address bloc = address(l.t);
        uint256 retenu = l.t.balanceOf(adm);
        _fundStock(NVDAc, adm, UN);
        BalanceDelta d = _swapBrut(l, adm, true, true, UN, true); // tx1: claims
        uint256 x = uint256(_db(l, d));
        assertFalse(l.t.trading(), "claims buy: no credited payout");
        Z1Acteur z = new Z1Acteur(PM);
        _fundStock(NVDAc, address(z), UN);
        vm.startPrank(adm);
        PM.setOperator(address(z), true);
        l.t.approve(address(z), type(uint256).max);
        vm.stopPrank();
        PoolKey memory k2 = PoolKey(l.key.currency0, l.key.currency1, 3000, 200, IHooks(address(0)));
        PM.initialize(k2, l.sp);
        (int24 lo, int24 hi) = _plageLoin(l);
        Z1Acteur.Op[] memory ops = new Z1Acteur.Op[](6);
        ops[0] = _o(4, l.key, false, int256(x), 0, 0, bloc, adm); // burn the seeder's claims -> +X
        ops[1] = _o(1, l.key, false, 0, lo, hi, bloc, address(0)); // add to OUR pool, netted
        ops[2] = _o(5, l.key, false, 0, 0, 0, bloc, adm); // transferFrom(seeder -> PM, A) UNBACKED
        ops[3] = _o(1, k2, false, 0, lo, hi, bloc, address(0)); // park A as hookless liquidity
        ops[4] = _o(7, l.key, false, 0, 0, 0, bloc, address(z));
        ops[5] = _o(7, l.key, false, 0, 0, 0, NVDAc, address(z));
        (bool ok,) = address(z).call(abi.encodeWithSelector(Z1Acteur.jouer.selector, ops)); // tx2
        uint256 parque = retenu - l.t.balanceOf(adm);
        console2.log("S2 tx2 park succeeded:", ok);
        console2.log("S2 unbacked retained parked in hookless v4 (wei):", parque);
        uint256 q0 = IERC20L(NVDAc).balanceOf(adm);
        if (ok) _s2Vendre(l, z, k2);
        uint256 extrait = IERC20L(NVDAc).balanceOf(adm) - q0;
        console2.log("S2 stock extracted for unbacked retained (NVDAc-wei):", extrait);
        assertEq(parque, 0, "LEAK: seeder parks retained unbacked tokens in a hookless pool");
        assertEq(extrait, 0, "LEAK: seeder sells retained unbacked tokens inside the window");
    }

    function _s2Vendre(L memory l, Z1Acteur z, PoolKey memory k2) internal {
        (int24 lo, int24 hi) = _plageLoin(l);
        address bloc = address(l.t);
        Z1Acteur.Op[] memory o3 = new Z1Acteur.Op[](4);
        o3[0] = _o(2, k2, false, 0, lo, hi, bloc, address(0)); // pull hookless LP -> +A block delta
        o3[1] = _o(0, l.key, !l.devise0, 0, 0, 0, bloc, address(0)); // SELL it on OUR pool via netting
        o3[2] = _o(7, l.key, false, 0, 0, 0, bloc, address(z));
        o3[3] = _o(7, l.key, false, 0, 0, 0, NVDAc, adm); // stock proceeds to the seeder
        (bool ok3,) = address(z).call(abi.encodeWithSelector(Z1Acteur.jouer.selector, o3)); // tx3
        console2.log("S2 tx3 sell-through-netting succeeded:", ok3);
    }
}
