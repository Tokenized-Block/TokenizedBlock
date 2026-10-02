// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {console2} from "forge-std/console2.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {LiquidityAmounts} from "../src/lib/LiquidityAmounts.sol";
import {V9Devises} from "../src/V9Devises.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {TBlockBloc24h} from "../src/TBlockBloc24h.sol";
import {LLBase, IERC20L, ICreateRouterL, IInscrireL} from "./LLBase.sol";

interface IB20Policy {
    function policyId(bytes32) external view returns (uint64);
    function isPaused(uint8) external view returns (bool);
}

interface IPolicyRegistry {
    function isAuthorized(uint64, address) external view returns (bool);
}

/// FORK ONLY. Economics on MEMESTOCK pairs (block x REAL NVDAc): 700/300 split to the wei, creator escrow
/// (anti flash-loan, exit, recharge), all-OFF == Zero 1's V9 verbatim, gas, Cobalt seize census.
contract EconomieTest is LLBase {
    using PoolIdLibrary for PoolKey;

    // ── E1 the 700/300 split ALONE, to the wei, on the 4 swap shapes (quote = NVDAc) ────────────────────────
    struct Avant {
        uint256 fw;
        uint256 du;
        uint256 co;
    }

    function _avant(L memory l) internal view returns (Avant memory a) {
        a.fw = _sinkQ(l);
        (a.du, a.co) = _du(l);
    }

    function _verifierSplit(L memory l, Avant memory a, uint256 cas, uint256 m, BalanceDelta d, uint24 pc, uint24 pk)
        internal
        view
        returns (uint256 q)
    {
        Avant memory b = _avant(l);
        uint256 fw = b.fw - a.fw;
        uint256 cr = b.du - a.du;
        uint256 co = b.co - a.co;
        int256 dq = _dq(l, d);
        uint256 t = fw + cr + co;
        if (cas == 0 || cas == 3) q = m; // quote specified
        else if (cas == 1) q = uint256(-dq) - t; // buy exact-out: trader paid q + t
        else q = uint256(dq) + t; // sell exact-in: trader got q - t
        assertEq(fw, q * P_SINK / 1e6, "sink == floor(q*700/1e6) NVDAc, computed alone");
        assertEq(cr, q * pc / 1e6, "creator == floor(q*300/1e6) NVDAc (claims)");
        assertEq(co, q * pk / 1e6, "collateral piece");
        assertLe(t, q * 1000 / 1e6, "total never above 0.10 % - never 0.09 % + 0.09 %");
        if (cas == 0) assertEq(-dq, int256(m), "buy exact-in: paid exactly q");
        if (cas == 3) assertEq(dq, int256(m), "sell exact-out: got exactly q");
        if (cas == 1) assertEq(_db(l, d), int256(m), "buy exact-out: exactly the blocks asked");
        if (cas == 2) assertEq(_db(l, d), -int256(m), "sell exact-in: exactly the blocks sold");
        string[4] memory nom = ["buyExactIn ", "buyExactOut", "sellExactIn", "sellExactOut"];
        console2.log(string.concat("E1 ", nom[cas], " q(NVDAc-wei) / sink / creator"), q, fw, cr);
    }

    function _matrice(L memory l, uint24 pc, uint24 pk) internal {
        // cas 0 buy exact-in 2 NVDAc · 1 buy exact-out 1000 blocks · 2 sell exact-in 1000 blocks · 3 sell exact-out 0.1 NVDAc
        _fundStock(NVDAc, alice, 10 * UN);
        uint256[4] memory m = [2 * UN, 1000 ether, 1000 ether, UN / 10];
        for (uint256 cas; cas < 4; ++cas) {
            Avant memory a = _avant(l);
            BalanceDelta d = _swapBrut(l, alice, cas < 2, cas == 0 || cas == 2, m[cas], false);
            _verifierSplit(l, a, cas, m[cas], d, pc, pk);
            _invariant(l);
        }
    }

    function test_E1_split700_300_auWei_berceau() public fork {
        L memory l = _lancer(_hook24h(), NVDAc, MINIMUM, "MSE1");
        assertTrue(Hook(l.hook).createurActif(l.key.toId()));
        _matrice(l, P_CREA, 0);
        // the creator's claims are paid by ANYONE to the FIXED creator, exactly
        (uint256 du,) = _du(l);
        uint256 c0 = IERC20L(NVDAc).balanceOf(adm);
        vm.prank(passant);
        uint256 paye = Hook(l.hook).reclamer(l.key);
        assertEq(paye, du);
        assertEq(IERC20L(NVDAc).balanceOf(adm) - c0, du, "creator received exactly its accrued claims");
        assertEq(IERC20L(NVDAc).balanceOf(passant), 0, "the caller gets nothing");
        (uint256 du2,) = _du(l);
        assertEq(du2, 0);
        _invariant(l);
    }

    /// the split alone, on a REAL B20 block and a hook WITHOUT the cradle: identical to the wei
    function test_E1b_split700_300_auWei_blocB20_sansBerceau() public fork {
        Hook h = _deployHook(_cfg(P_SINK, P_CREA, 0, 1, true, false));
        L memory l = _ouvrirB20(address(h), "MSE1B", MINIMUM);
        _matrice(l, P_CREA, 0);
    }

    // ── E2 escrow: flash-loan proof, exit stops the share AT ONCE, escrow back after 7 days, below the minimum the
    //    share feeds the collateral, recharge resumes it ─────────────────────────────────────────────────────
    function test_E2_cautionCreateur_cycleComplet() public fork {
        L memory l = _lancer(_hook24h(), NVDAc, MINIMUM, "MSE2");
        Hook h = Hook(l.hook);
        PoolId id = l.key.toId();
        assertEq(IERC20L(NVDAc).balanceOf(adm), 0, "the minimum left the creator's wallet at registration");
        assertEq(h.caution(id), MINIMUM);
        assertEq(h.minimumCaution(id), MINIMUM);
        // flash-loan shape: whatever is escrowed cannot come back in the same tx (or before 7 days)
        vm.prank(adm);
        h.demanderRetrait(l.key);
        vm.expectRevert(Hook.RetraitPasPret.selector);
        vm.prank(adm);
        h.retirerCaution(l.key);
        assertFalse(h.createurActif(id), "exit requested: share stopped at once");
        // next swap: the creator piece goes to the collateral, the sink piece unchanged
        _fundStock(NVDAc, alice, 10 * UN);
        Avant memory a = _avant(l);
        BalanceDelta d = _swapBrut(l, alice, true, true, UN, false);
        _verifierSplit(l, a, 0, UN, d, 0, P_CREA);
        // cancel the exit (recharger 0): share resumes immediately (escrow never left)
        vm.prank(adm);
        h.recharger(l.key, 0);
        assertTrue(h.createurActif(id));
        a = _avant(l);
        d = _swapBrut(l, alice, true, true, UN, false);
        _verifierSplit(l, a, 0, UN, d, P_CREA, 0);
        // exit for real: 7 days - 1 s refused, 7 days: exactly the escrow comes back
        vm.prank(adm);
        h.demanderRetrait(l.key);
        uint256 des = block.timestamp + 7 days;
        vm.warp(des - 1);
        vm.expectRevert(Hook.RetraitPasPret.selector);
        vm.prank(adm);
        h.retirerCaution(l.key);
        vm.warp(des);
        vm.prank(adm);
        h.retirerCaution(l.key);
        assertEq(IERC20L(NVDAc).balanceOf(adm), MINIMUM, "escrow returned exactly");
        assertEq(h.caution(id), 0);
        // below the minimum: share -> collateral
        a = _avant(l);
        d = _swapBrut(l, alice, true, true, UN, false);
        _verifierSplit(l, a, 0, UN, d, 0, P_CREA);
        // partial recharge (minimum - 1 wei): still below -> still collateral (negative control)
        vm.startPrank(adm);
        IERC20L(NVDAc).approve(address(h), type(uint256).max);
        h.recharger(l.key, MINIMUM - 1);
        vm.stopPrank();
        assertFalse(h.createurActif(id), "minimum - 1 wei: share does not resume");
        a = _avant(l);
        d = _swapBrut(l, alice, true, true, UN, false);
        _verifierSplit(l, a, 0, UN, d, 0, P_CREA);
        // + 1 wei: back at the minimum -> share resumes
        vm.prank(adm);
        h.recharger(l.key, 1);
        assertTrue(h.createurActif(id));
        a = _avant(l);
        d = _swapBrut(l, alice, true, true, UN, false);
        _verifierSplit(l, a, 0, UN, d, P_CREA, 0);
        _invariant(l);
        // only the creator controls its escrow
        vm.prank(passant);
        vm.expectRevert(Hook.PasLeCreateur.selector);
        h.demanderRetrait(l.key);
        vm.prank(passant);
        vm.expectRevert(Hook.PasLeCreateur.selector);
        h.recharger(l.key, 0);
        vm.prank(passant);
        vm.expectRevert(Hook.PasLeCreateur.selector);
        h.retirerCaution(l.key);
    }

    /// a creator who borrows the minimum for one tx cannot repay it: the loan stays stuck >= 7 days
    function test_E2b_flashLoan_impossible() public fork {
        L memory l = _lancer(_hook24h(), NVDAc, MINIMUM, "MSE2B");
        Hook h = Hook(l.hook);
        vm.prank(adm);
        h.demanderRetrait(l.key);
        vm.warp(block.timestamp + 7 days);
        vm.prank(adm);
        h.retirerCaution(l.key);
        // "flash": borrow MINIMUM, recharge, try to exit and withdraw in the same block -> RetraitPasPret
        vm.startPrank(adm);
        IERC20L(NVDAc).approve(address(h), type(uint256).max);
        h.recharger(l.key, MINIMUM);
        h.demanderRetrait(l.key);
        vm.expectRevert(Hook.RetraitPasPret.selector);
        h.retirerCaution(l.key);
        vm.stopPrank();
        // and during that window the share does NOT flow (exit pending)
        assertFalse(h.createurActif(l.key.toId()));
        _fundStock(NVDAc, alice, UN);
        Avant memory a = _avant(l);
        BalanceDelta d = _swapBrut(l, alice, true, true, UN, false);
        _verifierSplit(l, a, 0, UN, d, 0, P_CREA);
    }

    // ── E3 all OFF == Zero 1's V9 VERBATIM, to the wei (4 shapes + LP removal), real B20 block x NVDAc ─────────
    function test_E3_toutOFF_identiqueV9Zero1() public fork {
        address v9 = _deployV9Zero1();
        Hook off = _deployHook(_cfg(TAUX_V9, 0, 0, 0, true, false));
        assertEq(uint160(address(off)) & Hooks.ALL_HOOK_MASK, uint160(v9) & Hooks.ALL_HOOK_MASK, "same permission bits (0x24cc)");
        assertFalse(off.SUIVI_24H());
        L memory a = _ouvrirB20(v9, "MSE3A", 0);
        L memory b = _ouvrirB20(address(off), "MSE3B", 0);
        _fundStock(NVDAc, alice, 10 * UN);
        _approve(alice, address(a.t));
        _approve(alice, address(b.t));
        uint256[4] memory m = [2 * UN, 1000 ether, 1000 ether, UN / 10];
        for (uint256 cas; cas < 4; ++cas) {
            uint256 s0 = _sinkQ(a);
            BalanceDelta da = _swapBrut(a, alice, cas < 2, cas == 0 || cas == 2, m[cas], false);
            uint256 fa = _sinkQ(a) - s0;
            s0 = _sinkQ(b);
            BalanceDelta db = _swapBrut(b, alice, cas < 2, cas == 0 || cas == 2, m[cas], false);
            uint256 fb = _sinkQ(b) - s0;
            assertEq(_dq(a, da), _dq(b, db), "quote delta identical to the wei");
            assertEq(_db(a, da), _db(b, db), "block delta identical to the wei");
            assertEq(fa, fb, "sink piece identical to the wei");
            console2.log("E3 shape %s : sink V9 %s == OFF %s", cas, fa, fb);
        }
        // LP removal still allowed on the OFF hook (no beforeRemoveLiquidity bit)
        vm.prank(adm);
        lp.modifyLiquidity(b.key, IPoolManager.ModifyLiquidityParams(b.lo, b.hi, -int256(uint256(b.liq / 2)), bytes32(0)), "");
        vm.prank(adm);
        lp.modifyLiquidity(a.key, IPoolManager.ModifyLiquidityParams(a.lo, a.hi, -int256(uint256(a.liq / 2)), bytes32(0)), "");
    }

    /// a REAL B20 block (CreateRouter on the fork, label engraved), registered on `hook`, 99.9 %-style seed vs NVDAc
    function _ouvrirB20(address hook, string memory sym, uint128 minimum) internal returns (L memory l) {
        bytes memory params = abi.encode(Params(1, sym, sym, adm, 18));
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeWithSignature("updateContractURI(string)", URI);
        vm.deal(adm, adm.balance + FRAIS_OUVERTURE + 1 ether);
        vm.prank(adm);
        address bloc = ICreateRouterL(CREATE_ROUTER).createPaid{value: FRAIS_OUVERTURE}(
            0, keccak256(abi.encode(sym, nonceSel++)), params, calls, adm
        );
        l.t = TBlockBloc24h(bloc); // (ERC-20 view only: balanceOf / transfer / approve)
        l.hook = hook;
        l.devise = NVDAc;
        l.key = _cle(NVDAc, bloc, hook);
        l.devise0 = Currency.unwrap(l.key.currency0) == NVDAc;
        int24 tick;
        (l.sp, tick) = _prix(l.devise0);
        if (minimum == 0) {
            vm.prank(adm);
            IInscrireL(hook).inscrire{value: FRAIS_VIE}(l.key, l.sp);
        } else {
            _fundStock(NVDAc, adm, minimum);
            vm.prank(adm);
            IERC20L(NVDAc).approve(hook, minimum);
            vm.prank(adm);
            Hook(hook).inscrireAvecCaution{value: FRAIS_VIE}(l.key, l.sp, minimum);
        }
        PM.initialize(l.key, l.sp);
        uint256 seed = IERC20L(bloc).balanceOf(adm) * 999 / 1000;
        require(seed > 0, "B20 supply");
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
        _approve(alice, bloc);
        _approve(alice, NVDAc);
    }

    // ── E4 gas: V9 verbatim + B20 block (today) vs 24 h hook + cradle block (inside / after the window) ────────
    function _mesurer(L memory l, string memory tag) internal {
        _fundStock(NVDAc, alice, 10 * UN);
        _fundStock(NVDAc, bob, 10 * UN);
        _approve(bob, address(l.t));
        _approve(bob, NVDAc);
        _swapBrut(l, alice, true, true, UN / 10, false); // prime
        _swapBrut(l, bob, true, true, UN / 10, false);
        uint256 g = gasleft();
        BalanceDelta d = _swapBrut(l, alice, true, true, UN / 10, false);
        uint256 gBuy = g - gasleft();
        uint256 r = uint256(_db(l, d));
        g = gasleft();
        _swapBrut(l, alice, false, true, r / 2, false);
        uint256 gSell = g - gasleft();
        vm.prank(alice);
        g = gasleft();
        IERC20L(address(l.t)).transfer(bob, r / 8);
        uint256 gP2p = g - gasleft();
        console2.log(tag);
        console2.log("  buy exactIn (warm) / sell exactIn (warm) / p2p transfer (warm)", gBuy, gSell, gP2p);
    }

    function test_E4_gaz() public fork {
        _mesurer(_ouvrirB20(_deployV9Zero1(), "G1", 0), "G1 V9 verbatim (900) + B20 block - today");
        _mesurer(_ouvrirB20(address(_deployHook(_cfg(TAUX_V9, 0, 0, 0, true, false))), "G2", 0), "G2 new hook all OFF + B20 block");
        L memory l = _lancer(_hook24h(), NVDAc, MINIMUM, "G3");
        _approve(alice, address(l.t));
        _mesurer(l, "G3 24h hook 700/300 + cradle block, INSIDE 24 h");
        L memory l4 = _lancer(_hook24h(), NVDAc, MINIMUM, "G4");
        vm.warp(l4.t.restrictionsEndAt());
        _mesurer(l4, "G4 24h hook 700/300 + cradle block, AFTER 24 h");
    }

    // ── E5 Cobalt: fork block post-activation; seize census of every paired stock (read on chain) ───────────────
    function test_E5_cobalt_recensementSaisie() public view fork {
        assertGt(block.timestamp, COBALT_TS, "post-Cobalt");
        console2.log("E5 fork block / timestamp / cobalt activation", block.number, block.timestamp, COBALT_TS);
        address[] memory l = V9Devises.liste();
        string[19] memory sym = ["USDC", "cbBTC", "TOSHI", "OUSD", "AAPLc", "AMZNc", "AVGOc", "BEc", "GOOGLc", "HIMSc",
            "METAc", "MSFTc", "MSTRc", "MUc", "NVDAc", "PLTRc", "SNDKc", "SPCXc", "TSLAc"];
        bytes32 se = keccak256("SEIZE_EXEMPT_POLICY");
        uint256 inconnus;
        for (uint256 i; i < l.length; ++i) {
            (bool ok, bytes memory r) = l[i].staticcall(abi.encodeWithSelector(IB20Policy.policyId.selector, se));
            string memory etat;
            if (l[i].code.length == 0 || uint8(l[i].code[0]) != 0xef) etat = "n/a (plain ERC-20, no B20 seize)";
            else if (!ok || r.length < 32) {
                // this Base forge build's precompile does not know the key (reverts 0xcdd98a4a): status UNKNOWN here,
                // the authoritative read is the live node at the pinned block (seize-census.sh)
                etat = "UNKNOWN in this precompile build";
                ++inconnus;
            } else if (abi.decode(r, (uint64)) == 0) etat = "seize DISABLED (SEIZE_EXEMPT_POLICY = 0)";
            else etat = string.concat("seize ENABLED (SEIZE_EXEMPT_POLICY = ", vm.toString(abi.decode(r, (uint64))), ")");
            console2.log(string.concat("E5 SEIZE ", sym[i], " ", vm.toString(l[i]), " : ", etat));
        }
        console2.log("E5 keys unknown to the local precompile build:", inconnus);
    }
}
