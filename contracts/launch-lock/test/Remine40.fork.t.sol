// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {console2} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {Devises7030} from "../src/Devises7030.sol";
import {LLBase, IERC20L, ICreateRouterL} from "./LLBase.sol";

/// a contract that mimics a B20 block (marker in contractURI, admin role granted to anyone) but is NOT a precompile
contract FauxBloc {
    function contractURI() external pure returns (string memory) {
        return "data:application/json,%7B%22name%22%3A%22F%22%2C%22face%22%3A%7B%22eyes%22%3A1%7D%7D";
    }

    function hasRole(bytes32, address) external pure returns (uint256) {
        return 1;
    }
}

interface IVmCool {
    function cool(address) external;
}

/// the open B20Factory precompile: anyone can create a B20 here, skipping CreateRouter and its Create fee
interface IB20FactoryR {
    function createB20(uint8 variant, bytes32 salt, bytes calldata params, bytes[] calldata initCalls) external returns (address);
}

/// @title The 41-currency re-mine: D3 (label read of real face URIs), D2 (per-currency caution floor), the split to
///        the wei on ETH / NFLXc / PFEc, and the fail-closed paths (forged quote, non-B20, no label, not admin,
///        unregistered pool). FORK ONLY, Base build of forge (real B20 precompiles).
contract Remine40Test is LLBase {
    using PoolIdLibrary for PoolKey;

    // live TB blocks created by the app through CreateRouter, read at the pinned block (real face URIs)
    address constant FACE_6966 = 0xb200000000000000000000e4B0c5fBE9C8DF579E;
    address constant FACE_13494 = 0xb200000000000000000000E7e9DB76E8234f8f56;
    address constant FACE_14152 = 0xB200000000000000000000E63Ffc3f40bf92a042;
    address constant GMEc = 0xb2000000000000000000007790ed6E48e06eD935;

    // ── D3: the label read ─────────────────────────────────────────────────────────────────────────
    function _uriLen(address b) internal view returns (uint256) {
        (bool ok, bytes memory r) = b.staticcall(abi.encodeWithSignature("contractURI()"));
        require(ok, "contractURI");
        return bytes(abi.decode(r, (string))).length;
    }

    /// the live faces are blocks too: cold before every read, like the blocks this bench creates
    function _froidTous() internal override {
        super._froidTous();
        _froid(FACE_6966);
        _froid(FACE_13494);
        _froid(FACE_14152);
    }

    function _gazLabel(Hook h, address b) internal returns (bool ok, uint256 g) {
        _froidTous();
        _froid(b);
        g = gasleft();
        ok = h.porteLeLabel(b);
        g -= gasleft();
    }

    function _uri7040() internal view returns (string memory u) {
        u = vm.readFile("test/data/face-7040.txt");
        assertEq(bytes(u).length, 7040, "fixture is the 7,040-byte face URI the app writes");
    }

    /// pads a face URI (marker kept) to `n` bytes: the cap headroom, beyond anything the app writes
    function _uriDe(uint256 n) internal pure returns (string memory) {
        bytes memory u = bytes("data:application/json,%7B%22name%22%3A%22B%22%2C%22face%22%3A%7B%22p%22%3A%22");
        bytes memory z = new bytes(n - u.length - 12);
        for (uint256 i; i < z.length; ++i) z[i] = "A";
        return string(abi.encodePacked(u, z, "%22%7D%7D%7D"));
    }

    function test_D3_vraiesFaces_lues_sousLePlafond() public fork {
        Hook h = _hookProd();
        address[3] memory live = [FACE_6966, FACE_13494, FACE_14152];
        uint256[3] memory len = [uint256(6966), 13494, 14152];
        for (uint256 i; i < 3; ++i) {
            assertEq(_uriLen(live[i]), len[i], "live face URI length at the pinned block");
            (bool ok, uint256 g) = _gazLabel(h, live[i]);
            assertTrue(ok, "a real face URI carries the label");
            assertLt(g, h.GAS_LABEL(), "read fits under the cap");
            console2.log("D3 live face URI bytes / porteLeLabel forge-accounted gas", len[i], g);
        }
    }

    function test_D3_inscription_face7040_et_14k_et_32k() public fork {
        Hook h = _hookProd();
        string[3] memory u = [_uri7040(), _uriDe(14_000), _uriDe(32_768)];
        for (uint256 i; i < 3; ++i) {
            address b = _creerB20Uri(string.concat("D3", vm.toString(i)), u[i]);
            assertEq(_uriLen(b), bytes(u[i]).length);
            IVmCool(address(vm)).cool(b); // registration is a later tx than creation
            (bool ok, uint256 g) = _gazLabel(h, b);
            assertTrue(ok, "label found");
            console2.log("D3 own block URI bytes / porteLeLabel forge-accounted gas", bytes(u[i]).length, g);
            L memory l = _ouvrirSur(address(h), NVDAc, b, uint128(Devises7030.PLANCHER_NVDAC));
            assertEq(h.inscrit(l.key.toId()), adm, "registered with a big face");
        }
    }

    /// the runtime of `h` with every GAS_LABEL immediate (PUSH3 0x2dc6c0 = 3,000,000) set back to the old 300,000
    function _etchAncienPlafond(Hook h) internal returns (uint256 n) {
        bytes memory c = address(h).code;
        for (uint256 i; i + 3 < c.length; ++i) {
            if (c[i] == 0x62 && c[i + 1] == 0x2d && c[i + 2] == 0xc6 && c[i + 3] == 0xc0) {
                (c[i + 1], c[i + 2], c[i + 3]) = (0x04, 0x93, 0xe0);
                ++n;
            }
        }
        vm.etch(address(h), c);
    }

    function test_D3_REGRESSION_ancienPlafond300k_SansLabel_sur7KB() public fork {
        Hook h = _hookProd();
        address b7 = _creerB20Uri("RG7K", _uri7040());
        address petit = _creerB20("RGSM");
        _froidTous();
        assertTrue(h.porteLeLabel(b7), "the 3M cap reads the 7,040-byte face");
        assertGt(_etchAncienPlafond(h), 0, "GAS_LABEL immediate found");
        IVmCool(address(vm)).cool(b7); // registration is a later tx than creation: the URI storage is cold
        IVmCool(address(vm)).cool(petit);
        assertEq(h.GAS_LABEL(), 300_000, "patched runtime = the old 300k cap");
        _froidTous();
        assertFalse(h.porteLeLabel(FACE_6966), "old cap: a live 6,966-byte face is NOT read");
        _froidTous();
        assertFalse(h.porteLeLabel(b7), "old cap: the 7,040-byte face is NOT read");
        _froidTous();
        assertTrue(h.porteLeLabel(petit), "control: the old cap still reads an 84-byte URI");
        (uint160 sp,) = _prix(Currency.unwrap(_cle(NVDAc, b7, address(h)).currency0) == NVDAc);
        vm.deal(adm, 1 ether);
        _froidTous();
        vm.prank(adm);
        vm.expectRevert(Hook.SansLabel.selector);
        h.inscrire{value: FRAIS_VIE}(_cle(NVDAc, b7, address(h)), sp);
    }

    /// starving the read never yields true: the check fails CLOSED
    function test_D3_gazAffame_failClosed() public fork {
        Hook h = _hookProd();
        _froidTous();
        assertFalse(h.porteLeLabel{gas: 200_000}(FACE_14152), "starved read -> no label");
        _froidTous();
        assertTrue(h.porteLeLabel(FACE_14152), "control: fed read -> label");
    }

    // ── cradle strip: the 24 h cradle of a54ced1 (suivi24h, echange[], armer(), beforeRemoveLiquidity) is GONE ───────
    /// red if the cradle comes back: its getters answer, the remove-liquidity hook is wanted, or its key salt is in the code
    function test_BERCEAU_retire() public fork {
        Hook h = _hookProd();
        (bool a,) = address(h).staticcall(abi.encodeWithSignature("SUIVI_24H()"));
        assertFalse(a, "no SUIVI_24H getter");
        (bool b,) = address(h).staticcall(abi.encodeWithSignature("echange(address)", address(0)));
        assertFalse(b, "no echange[] (cradle seed-exemption map)");
        assertFalse(h.getHookPermissions().beforeRemoveLiquidity, "no beforeRemoveLiquidity (the cradle's withdrawal lock)");
        assertEq(uint160(address(h)) & 0x3fff, 0x24cc, "permission bits = 0x24cc, no remove-liquidity bit");
        bytes memory code = address(h).code;
        bytes memory sel = abi.encodePacked(bytes4(keccak256("armer()")));
        bytes memory tag = bytes("tblock.24h");
        assertFalse(_contient(code, sel), "the runtime never calls armer()");
        assertFalse(_contient(code, tag), "no cradle flow key in the runtime");
    }

    function _contient(bytes memory h, bytes memory n) internal pure returns (bool) {
        if (n.length > h.length) return false;
        for (uint256 i; i + n.length <= h.length; ++i) {
            bool ok = true;
            for (uint256 j; j < n.length && ok; ++j) ok = h[i + j] == n[j];
            if (ok) return true;
        }
        return false;
    }

    // ── D2: the immutable per-currency floor ───────────────────────────────────────────────────────
    function test_D2_planchersOnChain_egauxALaListe() public fork {
        Hook h = _hookProd();
        address[] memory l = Devises7030.liste();
        uint256[] memory p = Devises7030.planchers();
        assertEq(h.plancherCaution(address(0)), Devises7030.PLANCHER_ETH, "ETH floor");
        for (uint256 i; i < l.length; ++i) {
            assertEq(h.plancherCaution(l[i]), p[i], "floor of the list");
            assertTrue(h.deviseAdmise(l[i]), "admitted");
        }
        assertTrue(h.deviseAdmise(GMEc), "GMEc is in (Phil GO 2026-10-02 23:02)");
        assertEq(h.plancherCaution(GMEc), 4_162_864, "GMEc floor = ceil($1 / v4 pool price $24.0219 at block 52090382)");
        assertEq(l.length, 41, "41 currencies + ETH");
    }

    /// every immutable floor == the on-chain sizing table (plan/planchers-caution.json, written by
    /// script/planchers-caution.mjs from each pool's slot0 at block 52090382; `check` re-derives it from chain).
    /// Red if any one floor drifts (e.g. PFEc halved), not only the ones pinned by name.
    function test_D2_planchers_egauxAuDimensionnementOnChain() public fork {
        Hook h = _hookProd();
        string memory j = vm.readFile("plan/planchers-caution.json");
        address[] memory l = Devises7030.liste();
        assertEq(vm.parseJsonAddress(j, ".rows[0].adresse"), address(0), "row 0 = ETH");
        assertEq(vm.parseUint(vm.parseJsonString(j, ".rows[0].raw")), h.plancherCaution(address(0)), "ETH floor == sizing");
        for (uint256 i; i < l.length; ++i) {
            string memory k = string.concat(".rows[", vm.toString(i + 1), "]");
            assertEq(vm.parseJsonAddress(j, string.concat(k, ".adresse")), l[i], "same list, same order");
            assertEq(vm.parseUint(vm.parseJsonString(j, string.concat(k, ".raw"))), h.plancherCaution(l[i]),
                string.concat(vm.parseJsonString(j, string.concat(k, ".sym")), " floor == on-chain sizing"));
        }
        assertEq(l.length, 41);
    }

    function _inscrireCaution(Hook h, PoolKey memory k, uint160 sp, address devise, uint256 m, bytes32 sel) internal {
        vm.deal(adm, adm.balance + FRAIS_VIE + m + 1 ether);
        if (devise == address(0)) {
            _froidTous();
            vm.prank(adm);
            h.inscrireAvecCaution{value: FRAIS_VIE + m}(k, sp, uint128(m), sel);
        } else {
            _fundStock(devise, adm, m);
            vm.prank(adm);
            IERC20L(devise).approve(address(h), m);
            _froidTous();
            vm.prank(adm);
            h.inscrireAvecCaution{value: FRAIS_VIE}(k, sp, uint128(m), sel);
        }
    }

    /// for ETH and each of the 41: floor - 1 reverts CautionSousLePlancher(floor - 1, floor); exactly the floor registers
    function test_D2_plancher_41devises_sousRevert_egalPasse() public fork {
        Hook h = _hookProd();
        address bloc = _creerB20("D2AL");
        address[] memory l0 = Devises7030.liste();
        address[] memory l = new address[](l0.length + 1);
        for (uint256 i; i < l0.length; ++i) l[i + 1] = l0[i]; // l[0] = ETH
        for (uint256 i; i < l.length; ++i) {
            uint256 f = h.plancherCaution(l[i]);
            PoolKey memory k = _cle(l[i], bloc, address(h));
            (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == l[i]);
            if (l[i] == address(0)) {
                vm.deal(adm, adm.balance + FRAIS_VIE + f);
                _froidTous();
                vm.prank(adm);
                vm.expectRevert(abi.encodeWithSelector(Hook.CautionSousLePlancher.selector, f - 1, f));
                h.inscrireAvecCaution{value: FRAIS_VIE + f - 1}(k, sp, uint128(f - 1), selDe[bloc]);
            } else {
                _fundStock(l[i], adm, f);
                vm.prank(adm);
                IERC20L(l[i]).approve(address(h), f);
                _froidTous();
                vm.prank(adm);
                vm.expectRevert(abi.encodeWithSelector(Hook.CautionSousLePlancher.selector, f - 1, f));
                h.inscrireAvecCaution{value: FRAIS_VIE}(k, sp, uint128(f - 1), selDe[bloc]);
            }
            _inscrireCaution(h, k, sp, l[i], f, selDe[bloc]);
            assertEq(h.caution(k.toId()), f, "escrow == floor");
            assertTrue(h.createurActif(k.toId()), "creator active at the floor");
        }
    }

    // ── the split to the wei: 700 to the fee wallet / 300 to the creator, in the quote, buy and sell ──────────
    struct Etat {
        uint256 fw;
        uint256 du;
        uint256 co;
        uint256 blocsFw;
    }

    function _etat(L memory l) internal view returns (Etat memory e) {
        e.fw = _sinkQ(l);
        (e.du, e.co) = _du(l);
        e.blocsFw = l.t.balanceOf(SINK);
    }

    function _split(address devise, uint128 caution, string memory sym) internal {
        L memory l = _ouvrirSur(address(_hookProd()), devise, _creerB20(sym), caution);
        if (devise == address(0)) vm.deal(alice, 10 ether);
        else _fundStock(devise, alice, 10 * UN);
        // buy exact-in 2 units · buy exact-out 1e6 blocks · sell exact-in 5e5 blocks · sell exact-out 0.1 unit
        uint256[4] memory m = [2 * UN, 1e24, 5e23, UN / 10];
        string[4] memory nom = ["buyExactIn  ", "buyExactOut ", "sellExactIn ", "sellExactOut"];
        for (uint256 cas; cas < 4; ++cas) {
            Etat memory a = _etat(l);
            BalanceDelta d = _swapBrut(l, alice, cas < 2, cas == 0 || cas == 2, m[cas], false);
            Etat memory b = _etat(l);
            uint256 fw = b.fw - a.fw;
            uint256 cr = b.du - a.du;
            int256 dq = _dq(l, d);
            uint256 q;
            if (cas == 0 || cas == 3) q = m[cas];
            else if (cas == 1) q = uint256(-dq) - fw - cr;
            else q = uint256(dq) + fw + cr;
            assertEq(fw, q * P_SINK / 1e6, "fee wallet == floor(q * 700 / 1e6), in the quote");
            assertEq(cr, q * P_CREA / 1e6, "creator == floor(q * 300 / 1e6), in the quote");
            assertEq(b.co, a.co, "no collateral while the creator is active");
            assertEq(b.blocsFw, a.blocsFw, "the fee wallet never receives the block");
            assertGe(fw, 1, "0.07 % leg >= 1 raw at these sizes");
            if (cas == 0) assertEq(-dq, int256(m[cas]));
            if (cas == 1) assertEq(_db(l, d), int256(m[cas]));
            if (cas == 2) assertEq(_db(l, d), -int256(m[cas]));
            if (cas == 3) assertEq(dq, int256(m[cas]));
            console2.log(string.concat(sym, " ", nom[cas], " q / fee wallet / creator"), q, fw, cr);
        }
    }

    function test_SPLIT_ETH_auWei() public fork {
        _split(address(0), uint128(Devises7030.PLANCHER_ETH), "SPET");
    }

    function test_SPLIT_NFLXc_auWei() public fork {
        _split(Devises7030.NFLXc, uint128(Devises7030.PLANCHER_NFLXC), "SPNF");
    }

    function test_SPLIT_PFEc_auWei() public fork {
        _split(Devises7030.PFEc, uint128(Devises7030.PLANCHER_PFEC), "SPPF");
    }

    /// CH-2 boundary: at 1,428 raw the 0.07 % leg floors to 0; at 1,429 it is 1 raw (what the app enforces)
    function test_CH2_seuil1429_jambeFeeWallet() public fork {
        L memory l = _ouvrirSur(address(_hookProd()), Devises7030.NFLXc, _creerB20("CH2S"), uint128(Devises7030.PLANCHER_NFLXC));
        _fundStock(l.devise, alice, UN);
        uint256 a = _sinkQ(l);
        _swapBrut(l, alice, true, true, 1428, false);
        assertEq(_sinkQ(l) - a, 0, "1,428 raw: the fee wallet leg is 0");
        a = _sinkQ(l);
        _swapBrut(l, alice, true, true, 1429, false);
        assertEq(_sinkQ(l) - a, 1, "1,429 raw: the fee wallet leg is 1 raw");
    }

    // ── fail-closed: nothing forged or non-TB can register or earn ─────────────────────────────────────
    function _essai(Hook h, address quote, address bloc, address qui, bytes memory err) internal {
        PoolKey memory k = _cle(quote, bloc, address(h));
        (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == quote);
        vm.deal(qui, 1 ether);
        _froidTous();
        vm.prank(qui);
        vm.expectRevert(err);
        h.inscrire{value: FRAIS_VIE}(k, sp);
    }

    function test_FO_fauxNFLXc_B20_refuse() public fork {
        Hook h = _hookProd();
        // a real B20, symbol NFLXc, 8 decimals, created by anyone: not the Coinbase NFLXc -> not in the fixed list
        bytes memory params = abi.encode(Params(1, "Netflix Inc", "NFLXc", adm, 8));
        vm.deal(adm, 1 ether);
        vm.prank(adm);
        address faux = ICreateRouterL(CREATE_ROUTER).createPaid{value: FRAIS_OUVERTURE}(0, keccak256("faux-nflxc"), params, new bytes[](0), adm);
        assertFalse(h.deviseAdmise(faux));
        _essai(h, faux, _creerB20("FOQ1"), adm, abi.encodeWithSelector(Hook.PaireNonAdmise.selector));
    }

    function test_FO_paireDeuxDevises_ouDeuxBlocs_refusee() public fork {
        Hook h = _hookProd();
        _essai(h, NVDAc, Devises7030.NFLXc, adm, abi.encodeWithSelector(Hook.PaireNonAdmise.selector));
        _essai(h, _creerB20("FOB1"), _creerB20("FOB2"), adm, abi.encodeWithSelector(Hook.PaireNonAdmise.selector));
    }

    function test_FO_pasUnB20_refuse() public fork {
        Hook h = _hookProd();
        FauxBloc f = new FauxBloc();
        _froidTous();
        assertTrue(h.porteLeLabel(address(f)), "it does carry the marker");
        _essai(h, NVDAc, address(f), adm, abi.encodeWithSelector(Hook.PasUnB20.selector));
    }

    function test_FO_sansLabel_refuse() public fork {
        Hook h = _hookProd();
        address b = _creerB20Uri("FONL", "data:application/json,%7B%22name%22%3A%22face%22%7D");
        _essai(h, NVDAc, b, adm, abi.encodeWithSelector(Hook.SansLabel.selector));
    }

    function test_FO_pasAdmin_refuse() public fork {
        Hook h = _hookProd();
        _essai(h, NVDAc, _creerB20("FOAD"), passant, abi.encodeWithSelector(Hook.PasAdminDuBlock.selector));
    }

    function test_FO_poolNonInscrite_neDemarrePas() public fork {
        Hook h = _hookProd();
        PoolKey memory k = _cle(NVDAc, _creerB20("FONI"), address(h));
        (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == NVDAc);
        vm.expectRevert(_wrapped(address(h), IHooks.beforeInitialize.selector, abi.encodeWithSelector(Hook.PasInscrite.selector)));
        PM.initialize(k, sp);
    }

    /// design fact, kept visible: the label is a SHAPE check. Any B20 whose admin engraves the marker registers; it pays
    /// the life fee + a caution >= the floor, and the fee wallet still earns its 0.07 % in the real quote.
    function test_TEMOIN_labelEstUneForme_maisLeFeeWalletEncaisse() public fork {
        L memory l = _ouvrirSur(address(_hookProd()), NVDAc, _creerB20Uri("HAND", URI), uint128(Devises7030.PLANCHER_NVDAC));
        _fundStock(NVDAc, alice, UN);
        uint256 a = _sinkQ(l);
        _swapBrut(l, alice, true, true, UN, false);
        assertEq(_sinkQ(l) - a, UN * P_SINK / 1e6);
    }

    // ── M4 killers: a failed / starved URI read must REVERT the registration, never accept it ──────────────
    bytes4 constant SEL_INSCRIRE_PREUVE = bytes4(keccak256("inscrire((address,address,uint24,int24,address),uint160,bytes32)"));

    function _appelInscrire(Hook h, PoolKey memory k, uint160 sp, bytes32 sel, uint256 g, address b)
        internal
        returns (bool ok, bytes memory r)
    {
        IVmCool(address(vm)).cool(b); // registration is a later tx than creation: cold URI storage every attempt
        vm.prank(adm);
        (ok, r) = address(h).call{gas: g, value: FRAIS_VIE}(abi.encodeWithSelector(SEL_INSCRIRE_PREUVE, k, sp, sel));
    }


    /// 63/64 rule: the outer call gets g < GAS_LABEL, so the staticcall forwards only ~63/64 of what is left, which is
    /// below the cold read cost. The 1/64 kept by the outer frame is enough to revert: the result is EXACTLY
    /// SansLabel (an M4 mutant `!ok -> true` goes on and registers). Measured sweep (14,000 B cold, step 25k):
    /// 100k..925k -> SansLabel (inner read starved, outer survives), 950k..1,050k -> empty revert (the read was fed,
    /// the OUTER frame ran out later: still a revert), >= 1,075k -> registered. Never an acceptance while starved.
    function test_M4_lectureAffamee6364_revertSansLabel_jamaisAcceptee() public fork {
        Balayage memory z;
        Hook h = _hookProd();
        address b = _creerB20Uri("M4AF", _uriDe(14_000));
        PoolKey memory k = _cle(NVDAc, b, address(h));
        (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == NVDAc);
        vm.deal(adm, 10 ether);
        IVmCool(address(vm)).cool(b);
        (bool lu, uint256 cout) = _gazLabel(h, b);
        assertTrue(lu, "control: a fed cold read finds the label");
        assertLt(cout, h.GAS_LABEL(), "the read fits under the cap: only the 63/64 rule can starve it below");
        _balayer(h, k, sp, b, cout, z);
        _conclureM4(h, k, sp, b, cout, z);
    }

    struct Balayage {
        uint256 nSansLabel;
        uint256 nVide;
        uint256 gSansLabelMax;
        uint256 gOk;
    }

    function _balayer(Hook h, PoolKey memory k, uint160 sp, address b, uint256 cout, Balayage memory z) internal {
        for (uint256 g = 100_000; g < cout + 400_000; g += 25_000) {
            uint256 snap = vm.snapshotState();
            (bool ok, bytes memory r) = _appelInscrire(h, k, sp, selDe[b], g, b);
            if (ok) {
                z.gOk = g;
                vm.revertToState(snap);
                break;
            }
            assertLt(g, h.GAS_LABEL(), "every starved attempt is below the cap: the 63/64 rule did the starving");
            if (r.length == 0) {
                ++z.nVide; // outer frame out of gas AFTER a fed read: a revert, never an acceptance
            } else {
                assertEq(r, abi.encodeWithSelector(Hook.SansLabel.selector), "starved read -> exactly SansLabel()");
                assertEq(z.nVide, 0, "SansLabel only below the fed window: once fed, the read is never refused");
                ++z.nSansLabel;
                z.gSansLabelMax = g;
            }
            vm.revertToState(snap);
        }
    }

    function _conclureM4(Hook h, PoolKey memory k, uint160 sp, address b, uint256 cout, Balayage memory z) internal {
        assertGt(z.nSansLabel, 20, "the sweep really hit the starved window");
        assertGe(z.gSansLabelMax * 10, cout * 9, "the outer survives (SansLabel) right up to ~the read cost: 63/64 starvation proven");
        assertGt(z.gOk, z.gSansLabelMax, "acceptance only once the read is fed");
        assertEq(h.inscrit(k.toId()), address(0), "nothing registered");
        assertFalse(h.payee(k.toId()), "nothing paid");
        (bool okFed,) = _appelInscrire(h, k, sp, selDe[b], 3 * cout + 500_000, b);
        assertTrue(okFed, "control: the same call with enough gas registers");
        assertEq(h.inscrit(k.toId()), adm, "control: registered");
        console2.log("M4 cold 14,000 B: read cost / SansLabel count / max SansLabel gas", cout, z.nSansLabel, z.gSansLabelMax);
        console2.log("M4 empty-revert count (outer OOG after a fed read) / first accepted gas", z.nVide, z.gOk);
    }

    /// the view itself, starved at every step below the cost: false, never true (kills `!ok -> true`)
    function test_M4_porteLeLabel_affame_toujoursFaux() public fork {
        Hook h = _hookProd();
        address[2] memory bs = [FACE_14152, _creerB20Uri("M4V7", _uri7040())];
        for (uint256 j; j < 2; ++j) {
            IVmCool(address(vm)).cool(bs[j]);
            (, uint256 cout) = _gazLabel(h, bs[j]);
            for (uint256 g = 30_000; g < cout; g += 25_000) {
                IVmCool(address(vm)).cool(bs[j]);
                (bool ok, bytes memory r) = address(h).staticcall{gas: g}(abi.encodeWithSelector(Hook.porteLeLabel.selector, bs[j]));
                if (ok) assertEq(abi.decode(r, (bool)), false, "starved read -> false, never true");
            }
            IVmCool(address(vm)).cool(bs[j]);
            _froidTous();
            assertTrue(h.porteLeLabel(bs[j]), "control: fed read -> true");
        }
    }

    // ── provenance: a B20 forged straight through the factory (marker pasted) never escapes the Create fee ───────
    function _forger(string memory sym, bytes32 sel, address qui) internal returns (address b) {
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeWithSignature("updateContractURI(string)", URI);
        vm.prank(qui);
        b = IB20FactoryR(0xB20f000000000000000000000000000000000000).createB20(0, sel, abi.encode(Params(1, sym, sym, qui, 18)), calls);
    }

    function test_PROV_blocDuRouteur_prouveParSonSel() public fork {
        Hook h = _hookProd();
        address b = _creerB20("PRV1");
        assertTrue(h.neDuRouteur(b, selDe[b]), "the router block is proven by its salt");
        assertFalse(h.neDuRouteur(b, bytes32(uint256(selDe[b]) + 1)), "any other salt fails");
        assertFalse(h.neDuRouteur(b, bytes32(0)), "zero salt fails");
        // the same salt used straight on the factory by someone else lands elsewhere: copying a salt proves nothing
        address faux = _forger("PRV1", keccak256("prv-copie"), adm);
        assertTrue(faux != b);
        assertFalse(h.neDuRouteur(faux, keccak256("prv-copie")), "factory-direct: its own salt is no router proof");
    }

    function test_PROV_faux_selQuelconque_PasNeDuRouteur() public fork {
        Hook h = _hookProd();
        address faux = _forger("FRG1", keccak256("frg-1"), adm);
        _froidTous();
        assertTrue(h.porteLeLabel(faux), "the forger pasted the marker");
        assertTrue(h.estB20(faux), "a real B20 precompile");
        PoolKey memory k = _cle(NVDAc, faux, address(h));
        (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == NVDAc);
        bytes32[3] memory sels = [keccak256("frg-1"), bytes32(0), selDe[_creerB20("FRGV")]];
        vm.deal(adm, 1 ether);
        for (uint256 i; i < 3; ++i) {
            _froidTous();
            vm.prank(adm);
            vm.expectRevert(Hook.PasNeDuRouteur.selector);
            h.inscrire{value: FRAIS_VIE}(k, sp, sels[i]);
        }
    }

    function test_PROV_faux_sansPreuve_payeLaCreation_auWei() public fork {
        Hook h = _hookProd();
        address faux = _forger("FRG2", keccak256("frg-2"), adm);
        PoolKey memory k = _cle(NVDAc, faux, address(h));
        (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == NVDAc);
        vm.deal(adm, 1 ether);
        _froidTous();
        vm.prank(adm);
        vm.expectRevert(Hook.MontantInsuffisant.selector);
        h.inscrire{value: FRAIS_VIE}(k, sp); // the life fee alone is not enough without a router proof
        _froidTous();
        vm.prank(adm);
        vm.expectRevert(Hook.MontantInsuffisant.selector);
        h.inscrire{value: FRAIS_VIE + FRAIS_CREATION - 1}(k, sp);
        uint256 a = SINK.balance;
        _froidTous();
        vm.prank(adm);
        h.inscrire{value: FRAIS_VIE + FRAIS_CREATION}(k, sp);
        assertEq(SINK.balance - a, FRAIS_VIE + FRAIS_CREATION, "fee wallet gets life fee + the skipped Create fee");
        assertEq(h.inscrit(k.toId()), adm);
    }

    function test_PROV_faux_avecCaution_payeLaCreation() public fork {
        Hook h = _hookProd();
        address faux = _forger("FRG3", keccak256("frg-3"), adm);
        PoolKey memory k = _cle(NVDAc, faux, address(h));
        (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == NVDAc);
        uint256 f = Devises7030.PLANCHER_NVDAC;
        _fundStock(NVDAc, adm, f);
        vm.deal(adm, 1 ether);
        vm.prank(adm);
        IERC20L(NVDAc).approve(address(h), f);
        _froidTous();
        vm.prank(adm);
        vm.expectRevert(Hook.MontantInsuffisant.selector);
        h.inscrireAvecCaution{value: FRAIS_VIE}(k, sp, uint128(f));
        uint256 a = SINK.balance;
        _froidTous();
        vm.prank(adm);
        h.inscrireAvecCaution{value: FRAIS_VIE + FRAIS_CREATION}(k, sp, uint128(f));
        assertEq(SINK.balance - a, FRAIS_VIE + FRAIS_CREATION, "escrow path: the Create fee is charged too");
        assertEq(h.caution(k.toId()), f);
    }

    function test_PROV_blocDuRouteur_avecPreuve_neRepayePas() public fork {
        Hook h = _hookProd();
        address b = _creerB20("PRV2");
        PoolKey memory k = _cle(NVDAc, b, address(h));
        (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == NVDAc);
        vm.deal(adm, 1 ether);
        uint256 a = SINK.balance;
        _froidTous();
        vm.prank(adm);
        h.inscrire{value: FRAIS_VIE}(k, sp, selDe[b]);
        assertEq(SINK.balance - a, FRAIS_VIE, "proven router block: life fee only (the Create fee was paid at Create)");
    }

    // ── re-registration before the pool opens: no fee ETH forwarded twice ─────────────────────────────────────
    function test_REINSCRIPTION_avecEth_DejaPayee_sansEth_passe() public fork {
        Hook h = _hookProd();
        address b = _creerB20("REI1");
        PoolKey memory k = _cle(NVDAc, b, address(h));
        (uint160 sp,) = _prix(Currency.unwrap(k.currency0) == NVDAc);
        vm.deal(adm, 1 ether);
        _froidTous();
        vm.prank(adm);
        h.inscrire{value: FRAIS_VIE}(k, sp, selDe[b]);
        uint256 a = SINK.balance;
        _froidTous();
        vm.prank(adm);
        vm.expectRevert(Hook.DejaPayee.selector);
        h.inscrire{value: FRAIS_VIE}(k, sp, selDe[b]);
        _froidTous();
        vm.prank(adm);
        vm.expectRevert(Hook.DejaPayee.selector);
        h.inscrire{value: 1}(k, sp);
        _froidTous();
        vm.prank(adm);
        h.inscrire(k, sp, selDe[b]); // value 0: allowed (e.g. a new price before opening)
        // escrow after a plain registration: ETH-free for a stock quote
        uint256 f = Devises7030.PLANCHER_NVDAC;
        _fundStock(NVDAc, adm, f);
        vm.prank(adm);
        IERC20L(NVDAc).approve(address(h), f);
        _froidTous();
        vm.prank(adm);
        vm.expectRevert(Hook.DejaPayee.selector);
        h.inscrireAvecCaution{value: FRAIS_VIE}(k, sp, uint128(f), selDe[b]);
        _froidTous();
        vm.prank(adm);
        h.inscrireAvecCaution(k, sp, uint128(f), selDe[b]);
        assertEq(SINK.balance, a, "nothing forwarded a second time");
        assertEq(h.caution(k.toId()), f);
    }

    function test_REINSCRIPTION_ETH_cautionSeule_apresPaiement() public fork {
        Hook h = _hookProd();
        address b = _creerB20("REI2");
        PoolKey memory k = _cle(address(0), b, address(h));
        (uint160 sp,) = _prix(true);
        uint256 f = Devises7030.PLANCHER_ETH;
        vm.deal(adm, 1 ether);
        _froidTous();
        vm.prank(adm);
        h.inscrire{value: FRAIS_VIE}(k, sp, selDe[b]);
        uint256 a = SINK.balance;
        _froidTous();
        vm.prank(adm);
        vm.expectRevert(Hook.DejaPayee.selector);
        h.inscrireAvecCaution{value: FRAIS_VIE + f}(k, sp, uint128(f), selDe[b]);
        _froidTous();
        vm.prank(adm);
        h.inscrireAvecCaution{value: f}(k, sp, uint128(f), selDe[b]);
        assertEq(SINK.balance, a, "ETH escrow only, no second fee");
        assertEq(h.caution(k.toId()), f);
    }

    /// D2 at the very bottom: 1 wei of ETH and 1 raw OUSD are refused with the exact floor
    function test_D2_1wei_et_1rawOUSD_refuses() public fork {
        Hook h = _hookProd();
        address b = _creerB20("D21W");
        PoolKey memory k = _cle(address(0), b, address(h));
        (uint160 sp,) = _prix(true);
        vm.deal(adm, 1 ether);
        _froidTous();
        vm.prank(adm);
        vm.expectRevert(abi.encodeWithSelector(Hook.CautionSousLePlancher.selector, 1, Devises7030.PLANCHER_ETH));
        h.inscrireAvecCaution{value: FRAIS_VIE + 1}(k, sp, 1, selDe[b]);
        address ousd = Devises7030.liste()[3];
        assertEq(h.plancherCaution(ousd), Devises7030.PLANCHER_OUSD);
        k = _cle(ousd, b, address(h));
        (sp,) = _prix(Currency.unwrap(k.currency0) == ousd);
        _fundStock(ousd, adm, 1);
        vm.prank(adm);
        IERC20L(ousd).approve(address(h), 1);
        _froidTous();
        vm.prank(adm);
        vm.expectRevert(abi.encodeWithSelector(Hook.CautionSousLePlancher.selector, 1, Devises7030.PLANCHER_OUSD));
        h.inscrireAvecCaution{value: FRAIS_VIE}(k, sp, 1, selDe[b]);
    }
}
