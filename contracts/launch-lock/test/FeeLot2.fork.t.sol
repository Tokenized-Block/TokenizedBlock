// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {console2} from "forge-std/console2.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {LiquidityAmounts} from "../src/lib/LiquidityAmounts.sol";
import {V9Devises} from "../src/V9Devises.sol";
import {Devises7030} from "../src/Devises7030.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {IERC20L, IInscrireL} from "./LLBase.sol";
import {EconomieTest} from "./Economie.fork.t.sol";

interface IDec {
    function decimals() external view returns (uint8);
}

interface IMeta {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

/// B20Factory precompile (docs.base.org B20 spec): createB20(variant, salt, params, initCalls), selector 0x62975e6a
interface IB20FactoryL {
    function createB20(uint8 variant, bytes32 salt, bytes calldata params, bytes[] calldata initCalls) external returns (address);
}

/// FORK ONLY — fee lot 2 (founder 2026-10-02 14:34). The NEW hook: 0.07 % to the fee sink + 0.03 % to the block's
/// creator, IN THE PAIRED CURRENCY (creator share only while the birth minimum is escrowed, else the block's
/// collateral; resumes on recharge). Proves the 7 pairs V8 refuses (TOSHI, OUSD, AVGOc, BEc, HIMSc, MUc, PLTRc)
/// open on it, and that the sink receives the quote to the wei and NEVER the block token. Nothing is broadcast.
contract FeeLot2Test is EconomieTest {
    using PoolIdLibrary for PoolKey;

    address constant HOLDER_TOSHI = address(0); // TOSHI is a plain ERC-20: funded with deal() if the PM holds too little

    function _sept() internal pure returns (address[7] memory d, string[7] memory s) {
        d = [V9Devises.TOSHI, V9Devises.OUSD, V9Devises.AVGOc, V9Devises.BEc, V9Devises.HIMSc, V9Devises.MUc, V9Devises.PLTRc];
        s = ["TOSHI", "OUSD", "AVGOc", "BEc", "HIMSc", "MUc", "PLTRc"];
    }

    function _min(Hook h, address devise, uint256 u) internal view returns (uint128) {
        uint256 p = h.plancherCaution(devise);
        return uint128(u > p ? u : p);
    }

    function _sinkBloc(L memory l) internal view returns (uint256) {
        return IERC20L(address(l.t)).balanceOf(SINK) + PM.balanceOf(SINK, uint256(uint160(address(l.t))));
    }

    /// (1) each of the 7: birth on the new hook, the 4 swap shapes, sink == floor(q*700/1e6) in the quote, creator
    /// == floor(q*300/1e6) in the quote, sink block balance stays 0, invariant holds.
    function test_L2_septPaires_feeEnDeviseAuWei_jamaisEnBloc() public fork {
        Hook h = _deployHook(_cfgProd());
        (address[7] memory d, string[7] memory s) = _sept();
        for (uint256 i; i < 7; ++i) {
            assertTrue(h.deviseAdmise(d[i]), string.concat(s[i], " admitted by the new hook"));
            // small sizes: the thin stocks (AVGOc supply ~85) — the PoolManager's own balance funds the test
            uint256 u = UN / 100;
            console2.log(string.concat("L2 ", s[i], " PoolManager balance (raw)"), IERC20L(d[i]).balanceOf(address(PM)));
            L memory l = _ouvrirSur(address(h), d[i], _creerB20(string.concat("L2", s[i])), _min(h, d[i], u));
            assertTrue(h.createurActif(l.key.toId()), "creator active (minimum escrowed)");
            _fundStock(d[i], alice, 10 * u);
            uint256[4] memory m = [2 * u, 100 ether, 100 ether, u / 10];
            for (uint256 cas; cas < 4; ++cas) {
                Avant memory a = _avant(l);
                BalanceDelta dd = _swapBrut(l, alice, cas < 2, cas == 0 || cas == 2, m[cas], false);
                uint256 q = _verifierSplit(l, a, cas, m[cas], dd, P_CREA, 0);
                assertEq(_sinkBloc(l), 0, string.concat(s[i], ": the sink NEVER holds the block token"));
                assertGt(q * P_SINK / 1e6, 0, "non-dust leg");
                _invariant(l);
            }
            console2.log(string.concat("L2 ", s[i], " quote0? / dec / sink quote after 4 swaps"), l.devise0 ? 1 : 0, IDec(d[i]).decimals(), _sinkQ(l));
        }
    }

    /// (1) negative control: the LIVE V8 refuses these 7 at registration (PaireNonAdmise 0x9e16f763) — the reason
    /// they are not creatable today, and why only a new hook (no flag) changes it.
    function test_L2_controleNegatif_V8_refuseLesSept() public fork {
        (address[7] memory d, string[7] memory s) = _sept();
        for (uint256 i; i < 7; ++i) {
            address b = _creerB20(string.concat("N8", s[i]));
            PoolKey memory k = _cle(d[i], b, HOOK_V8);
            (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == d[i]);
            vm.deal(adm, adm.balance + 1 ether);
            _froidTous();
            vm.prank(adm);
            (bool ok, bytes memory r) = HOOK_V8.call{value: FRAIS_VIE}(abi.encodeWithSelector(IInscrireL.inscrire.selector, k, sp));
            assertFalse(ok, string.concat("V8 refuses ", s[i]));
            assertEq(bytes4(r), bytes4(0x9e16f763), "PaireNonAdmise");
        }
    }

    /// (4) negative control: creator gate closed (exit requested) -> the 0.03 % goes to the block's collateral, the
    /// sink piece unchanged; recharge -> creator share resumes. On PLTRc.
    function test_L2_porteCreateur_collateralPuisReprise() public fork {
        Hook h = _deployHook(_cfgProd());
        L memory l = _ouvrirSur(address(h), V9Devises.PLTRc, _creerB20("L2G"), MINIMUM);
        _fundStock(V9Devises.PLTRc, alice, 10 * UN);
        vm.prank(adm);
        h.demanderRetrait(l.key);
        assertFalse(h.createurActif(l.key.toId()));
        Avant memory a = _avant(l);
        BalanceDelta dd = _swapBrut(l, alice, true, true, UN, false);
        _verifierSplit(l, a, 0, UN, dd, 0, P_CREA);
        vm.prank(adm);
        h.recharger(l.key, 0);
        assertTrue(h.createurActif(l.key.toId()));
        a = _avant(l);
        dd = _swapBrut(l, alice, true, true, UN, false);
        _verifierSplit(l, a, 0, UN, dd, P_CREA, 0);
        assertEq(_sinkBloc(l), 0);
        _invariant(l);
    }

    // ── the 22 Coinbase stocks appended after the V9 19 (the 18 of 0ea4661, then GMEc, HTZc, PFEc, PMc) ───────────
    /// (5) the fixed list: the 19 (ETH implicit) still admitted + each of the 22: birth with escrowed minimum (>= its
    /// floor), the 4 swap shapes, sink == floor(q*700/1e6) and creator == floor(q*300/1e6) IN THE STOCK, sink never
    /// holds the block.
    function test_L3_nouvelles_admises_splitAuWei_jamaisEnBloc() public fork {
        Hook h = _deployHook(_cfgProd());
        address[] memory v9 = V9Devises.liste();
        for (uint256 i; i < v9.length; ++i) assertTrue(h.deviseAdmise(v9[i]), "the 19 of the fixed list stay admitted");
        assertTrue(h.deviseAdmise(address(0)), "ETH admitted");
        address[22] memory n = Devises7030.nouvelles();
        for (uint256 i; i < n.length; ++i) {
            string memory s = IMeta(n[i]).symbol();
            assertTrue(h.deviseAdmise(n[i]), string.concat(s, " admitted by the new hook"));
            assertTrue(h.estB20(n[i]), "a B20 precompile");
            assertEq(IDec(n[i]).decimals(), 8, "8 decimals");
            uint256 u = UN / 100;
            L memory l = _ouvrirSur(address(h), n[i], _creerB20(string.concat("L3", s)), _min(h, n[i], u));
            assertTrue(h.createurActif(l.key.toId()), "creator active (minimum escrowed)");
            _fundStock(n[i], alice, 10 * u);
            uint256[4] memory m = [2 * u, 100 ether, 100 ether, u / 10];
            for (uint256 cas; cas < 4; ++cas) {
                Avant memory a = _avant(l);
                BalanceDelta dd = _swapBrut(l, alice, cas < 2, cas == 0 || cas == 2, m[cas], false);
                uint256 q = _verifierSplit(l, a, cas, m[cas], dd, P_CREA, 0);
                assertEq(_sinkBloc(l), 0, string.concat(s, ": the sink NEVER holds the block token"));
                assertGt(q * P_SINK / 1e6, 0, "non-dust leg");
                _invariant(l);
            }
            console2.log(string.concat("L3 ", s, " quote0? / sink quote after 4 swaps"), l.devise0 ? 1 : 0, _sinkQ(l));
        }
    }

    /// (5) negative control: the LIVE V8 refuses the 22 at registration (PaireNonAdmise).
    function test_L3_controleNegatif_V8_refuseLesNouvelles() public fork {
        address[22] memory n = Devises7030.nouvelles();
        for (uint256 i; i < n.length; ++i) {
            address b = _creerB20(string.concat("N8x", IMeta(n[i]).symbol()));
            PoolKey memory k = _cle(n[i], b, HOOK_V8);
            (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == n[i]);
            vm.deal(adm, adm.balance + 1 ether);
            _froidTous();
            vm.prank(adm);
            (bool ok, bytes memory r) = HOOK_V8.call{value: FRAIS_VIE}(abi.encodeWithSelector(IInscrireL.inscrire.selector, k, sp));
            assertFalse(ok, "V8 refuses the new stock");
            assertEq(bytes4(r), bytes4(0x9e16f763), "PaireNonAdmise");
        }
    }

    // ── 2026-10-03 (founder: « la plus large ») : the 21 other stocks the issuer declares ───────────────────────────
    /// (6) all 62 admitted (ETH implicit); each of the 21: B20 precompile, 8 decimals, floor > 0 == Devises7030.planchers();
    /// the ones the PoolManager can fund on this fork get the full split proof (birth with escrowed minimum, the 4 swap
    /// shapes, sink == floor(q*700/1e6) and creator == floor(q*300/1e6) IN THE STOCK, sink never holds the block). The
    /// 20 created with supply 0 cannot be swapped today: admission + floor is what is proven for them, and it is SAID.
    function test_L4_vingtEtUn_admises_emisesSplitAuWei() public fork {
        Hook h = _deployHook(_cfgProd());
        address[] memory tout = Devises7030.liste();
        uint256[] memory planchers = Devises7030.planchers();
        assertEq(tout.length, 62, "62 quotes + ETH");
        for (uint256 i; i < tout.length; ++i) {
            assertTrue(h.deviseAdmise(tout[i]), "every quote of the list admitted");
            assertEq(h.plancherCaution(tout[i]), planchers[i], "floor stored as listed");
        }
        address[21] memory e = Devises7030.emetteur21();
        uint256 prouvees;
        for (uint256 i; i < 21; ++i) {
            string memory s = IMeta(e[i]).symbol();
            assertTrue(h.deviseAdmise(e[i]), string.concat(s, " admitted by the new hook"));
            assertTrue(h.estB20(e[i]), string.concat(s, " is a B20 precompile"));
            assertEq(IDec(e[i]).decimals(), 8, "8 decimals");
            assertGt(h.plancherCaution(e[i]), 0, "floor > 0");
            uint256 u = UN / 100;
            if (IERC20L(e[i]).balanceOf(address(PM)) < 10 * u + _min(h, e[i], u)) {
                console2.log(string.concat("L4 ", s, ": PoolManager cannot fund it on this fork (supply 0 or no pool) -> admission + floor only"));
                continue;
            }
            ++prouvees;
            L memory l = _ouvrirSur(address(h), e[i], _creerB20(string.concat("L4", s)), _min(h, e[i], u));
            assertTrue(h.createurActif(l.key.toId()), "creator active (minimum escrowed)");
            _fundStock(e[i], alice, 10 * u);
            uint256[4] memory m = [2 * u, 100 ether, 100 ether, u / 10];
            for (uint256 cas; cas < 4; ++cas) {
                Avant memory a = _avant(l);
                BalanceDelta dd = _swapBrut(l, alice, cas < 2, cas == 0 || cas == 2, m[cas], false);
                uint256 q = _verifierSplit(l, a, cas, m[cas], dd, P_CREA, 0);
                assertEq(_sinkBloc(l), 0, string.concat(s, ": the sink NEVER holds the block token"));
                assertGt(q * P_SINK / 1e6, 0, "non-dust leg");
                _invariant(l);
            }
            console2.log(string.concat("L4 ", s, " split proved: sink quote after 4 swaps"), _sinkQ(l));
        }
        console2.log("L4 split proved for", prouvees, "of the 21 (the others: no fundable supply on this fork)");
    }

    /// (6) negative control: the LIVE V8 refuses 20 of the 21 at registration (PaireNonAdmise) and ADMITS CRCLc —
    /// measured on Base mainnet 2026-10-03 (V8.deviseAdmise over the 62: 13 quotes besides ETH, the app registry's 12 + CRCLc).
    function test_L4_controleNegatif_V8_refuseLes21_saufCRCLc() public fork {
        address[21] memory e = Devises7030.emetteur21();
        uint256 refuses;
        for (uint256 i; i < 21; ++i) {
            address b = _creerB20(string.concat("N8y", IMeta(e[i]).symbol()));
            PoolKey memory k = _cle(e[i], b, HOOK_V8);
            (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == e[i]);
            vm.deal(adm, adm.balance + 1 ether);
            _froidTous();
            vm.prank(adm);
            (bool ok, bytes memory r) = HOOK_V8.call{value: FRAIS_VIE}(abi.encodeWithSelector(IInscrireL.inscrire.selector, k, sp));
            if (e[i] == Devises7030.CRCLc) { assertTrue(ok, "V8 already admits CRCLc (measured)"); continue; }
            assertFalse(ok, string.concat("V8 refuses the stock ", IMeta(e[i]).symbol()));
            assertEq(bytes4(r), bytes4(0x9e16f763), "PaireNonAdmise");
            ++refuses;
        }
        assertEq(refuses, 20, "20 refused by V8, CRCLc admitted");
    }

    /// (5) WHY A FIXED LIST: a forged "NFLXc" from the SAME permissionless B20Factory — same variant, name, symbol,
    /// 8 decimals, contractURI, any admin it likes — is indistinguishable on chain except by its address. The new hook
    /// refuses it (PaireNonAdmise) and admits the genuine NFLXc. A "genuine Coinbase stock" probe would have accepted it.
    function test_L3_fauxNFLXc_refuse() public fork {
        Hook h = _deployHook(_cfgProd());
        address vrai = Devises7030.NFLXc;
        vm.prank(alice);
        address faux = IB20FactoryL(0xB20f000000000000000000000000000000000000).createB20(
            0, keccak256("faux-nflxc"), abi.encode(Params(1, IMeta(vrai).name(), "NFLXc", adm, 8)), new bytes[](0)
        );
        assertTrue(h.estB20(faux), "forgery is a real B20 precompile (code 0xef, prefix 0xb2, variant ASSET)");
        assertEq(IMeta(faux).symbol(), IMeta(vrai).symbol(), "same symbol");
        assertEq(IMeta(faux).name(), IMeta(vrai).name(), "same name");
        assertEq(IDec(faux).decimals(), IDec(vrai).decimals(), "same decimals");
        assertTrue(h.deviseAdmise(vrai), "genuine NFLXc admitted");
        assertFalse(h.deviseAdmise(faux), "forged NFLXc not admitted");
        address b = _creerB20("L3FX");
        PoolKey memory k = _cle(faux, b, address(h));
        (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == faux);
        vm.deal(adm, adm.balance + 1 ether);
        _froidTous();
        vm.prank(adm);
        (bool ok, bytes memory r) = address(h).call{value: FRAIS_VIE}(abi.encodeWithSignature("inscrireAvecCaution((address,address,uint24,int24,address),uint160,uint128)", k, sp, uint128(1)));
        assertFalse(ok, "registration refused");
        assertEq(bytes4(r), bytes4(0x9e16f763), "PaireNonAdmise");
    }

    /// (4) THE DEPLOY PLAN: exact CREATE2 calldata through 0x4e59 (salt ++ initcode), mined address, gas used.
    function test_L2_planDeDeploiement() public fork {
        Hook.Config memory c = _cfgProd();
        bytes memory init = abi.encodePacked(type(Hook).creationCode, abi.encode(c));
        uint256 n0 = nonceSel;
        bytes32 h0 = keccak256(init);
        address cible;
        uint256 s = n0;
        for (; s < n0 + 800_000; ++s) {
            cible = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, bytes32(s), h0)))));
            if (uint160(cible) & uint160((1 << 14) - 1) == FLAGS_V9 && cible.code.length == 0) break;
        }
        bytes memory data = abi.encodePacked(bytes32(s), init);
        uint256 g = gasleft();
        (bool ok,) = CREATE2_DEPLOYER.call(data);
        g -= gasleft();
        assertTrue(ok && cible.code.length > 0, "create2");
        Hook h = Hook(cible);
        assertEq(h.feeWallet(), SINK);
        assertEq(h.HOOK_FEE(), 700);
        assertEq(h.PART_CREATEUR(), 300);
        assertEq(h.PART_COLLATERAL(), 0);
        assertEq(h.fraisVie(), FRAIS_VIE);
        vm.writeFile("plan/deploy-calldata.hex", vm.toString(data));
        vm.writeFile("plan/deploy-summary.txt", string.concat(
            "to=", vm.toString(CREATE2_DEPLOYER), "\nvalue=0\nsalt=", vm.toString(bytes32(s)), "\nhook=", vm.toString(cible),
            "\ninitcodeHash=", vm.toString(h0), "\ncalldataBytes=", vm.toString(data.length), "\ngasUsedInner=", vm.toString(g),
            "\nruntimeBytes=", vm.toString(cible.code.length), "\n"));
        console2.log("PLAN hook / salt / gas", cible, s, g);
    }
}
