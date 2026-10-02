// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {LiquidityAmounts} from "../src/lib/LiquidityAmounts.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {TBlockBloc24h} from "../src/TBlockBloc24h.sol";
import {LLBase, IERC20L, ICreateRouterL} from "./LLBase.sol";

/// @title Le plafond de la part createur, execute par le HOOK REEL, en mode collateral 0.
/// @notice ⛔⛔⛔ LE DEFAUT QUE CE BANC GARDE, INTRODUIT PAR MOI ET TROUVE PAR UN VERIFICATEUR ADVERSARIAL.
///         Mon premier plafond bornait par `caution - duCreateur`. `_parts` est appele DEUX fois par
///         swap : en `beforeSwap` (via `_repartir`, qui ECRIT `duCreateur += cr`), puis en `afterSwap`
///         (via `_verifierRemplissage`, qui le REJOUE et compare `rempli != attendu`). Le second appel
///         relisait l etat deja ecrit : les deux totaux divergeaient -> `RemplissagePartiel`.
///   ⛔ POURQUOI MES 79/79 NE L ONT PAS VU : ils tournent en mode 1, ou `co` absorbe le surplus et le
///     total reste `fw + X` — invariant. En MODE 0, que le constructeur accepte, le surplus est
///     abandonne et le total depend de `duCreateur`.
///   ⛔ POURQUOI UN BANC FORK ET PAS SEULEMENT L ARITHMETIQUE : `MarqueurVide.t.sol` teste une COPIE de
///     la formule. Ici c est le hook REEL, sur un vrai fork de Base, qui fait le swap.
///   ⛔ ET UN BLOC B20 REEL, PAS UN BERCEAU. Ma premiere version passait par `_lancer`, qui fabrique un
///     bloc-berceau 24 h : il refuse toute pool d un hook sans suivi 24 h (`PasNotrePool`), et ma config
///     mode 0 coupe ce suivi. Les trois tests echouaient donc sur la CONSTRUCTION, pas sur le plafond —
///     un resultat NON MESURE que j aurais pu lire comme « le bug persiste ». Le bloc est desormais cree
///     par le vrai CREATE_ROUTER, exactement comme l app le fait sur mainnet.
///
///   LE SCENARIO NOMME PAR LE VERIFICATEUR : mode 0, part createur != 0, caution en place, achat a
///   montant de DEVISE exact, et `0 < caution - duCreateur < 2X`. Pour 2 NVDAc : X = 2e8*300/1e6 = 60 000.
///   Caution 100 000 : l ANCIENNE formule rendait 60 000 avant, min(60 000, 40 000) = 40 000 apres.
contract PlafondIdempotentTest is LLBase {
    uint128 constant CAUTION_ZONE = 100_000;

    function _creerB20(string memory sym) internal returns (address bloc) {
        bytes memory params = abi.encode(Params(1, sym, sym, adm, 18));
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeWithSignature("updateContractURI(string)", URI);
        vm.deal(adm, adm.balance + FRAIS_OUVERTURE + 1 ether);
        vm.prank(adm);
        bloc = ICreateRouterL(CREATE_ROUTER).createPaid{value: FRAIS_OUVERTURE}(
            0, keccak256(abi.encode(sym, nonceSel++)), params, calls, adm
        );
    }

    /// ⛔ RECOPIE FIDELE de `EconomieTest._ouvrirB20Sur` (inscription avec caution + initialisation +
    ///   liquidite). Recopiee plutot qu heritee, pour ne pas rejouer les 7 tests d Economie a chaque run.
    function _ouvrir(address hook, address bloc, uint128 minimum) internal returns (L memory l) {
        l.t = TBlockBloc24h(bloc);
        l.hook = hook;
        l.devise = NVDAc;
        l.key = _cle(NVDAc, bloc, hook);
        l.devise0 = Currency.unwrap(l.key.currency0) == NVDAc;
        int24 tick;
        (l.sp, tick) = _prix(l.devise0);
        _fundStock(NVDAc, adm, minimum);
        vm.prank(adm);
        IERC20L(NVDAc).approve(hook, minimum);
        vm.prank(adm);
        Hook(hook).inscrireAvecCaution{value: FRAIS_VIE}(l.key, l.sp, minimum);
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

    function _hookMode0() internal returns (Hook) {
        // ⛔ mode collateral 0, part createur 300, bloc B20 exige, pas de berceau 24 h
        return _deployHook(_cfg(700, P_CREA, 0, 0, true, false));
    }

    /// ⛔⛔⛔ LE CAS QUI REVERTAIT : il doit PASSER maintenant.
    function test_mode0_achatExact_dansLaZone_nerevertPlus() public fork {
        Hook h = _hookMode0();
        L memory l = _ouvrir(address(h), _creerB20("IDEM"), CAUTION_ZONE);
        assertTrue(h.createurActif(l.key.toId()), "le createur doit etre actif (caution en place)");
        assertEq(h.caution(l.key.toId()), CAUTION_ZONE, "la caution doit valoir 100 000");
        _acheter(l, alice, 2 * UN);
        // ⛔ si on arrive ici, `afterSwap` n a PAS revert RemplissagePartiel.
        (uint256 du,) = _du(l);
        assertEq(du, 60_000, "la part creditee doit etre X = 60 000, sous la caution de 100 000");
    }

    /// ⛔ LE SECOND SWAP : `duCreateur` vaut deja 60 000. La nouvelle formule ne lit que la caution, donc
    ///   chaque swap est plafonne independamment de l en-attente.
    function test_mode0_deuxiemeAchat_nerevertPas() public fork {
        Hook h = _hookMode0();
        L memory l = _ouvrir(address(h), _creerB20("IDE2"), CAUTION_ZONE);
        _acheter(l, alice, 2 * UN);
        _acheter(l, alice, 2 * UN);
        (uint256 du,) = _du(l);
        assertEq(du, 120_000, "deux swaps de X = 60 000 chacun, chacun sous la caution");
    }

    /// ⛔ TEMOIN DU PLAFOND : un achat dont X DEPASSE la caution est plafonne a la caution. Sans lui,
    ///   « ca ne revert plus » ne dirait pas que le plafond borne encore quelque chose.
    function test_TEMOIN_mode0_plafondBorneEncore() public fork {
        Hook h = _hookMode0();
        L memory l = _ouvrir(address(h), _creerB20("IDE3"), CAUTION_ZONE);
        _acheter(l, alice, 10 * UN);   // X = 10e8 * 300 / 1e6 = 300 000 > caution 100 000
        (uint256 du,) = _du(l);
        assertEq(du, CAUTION_ZONE, "X = 300 000 depasse la caution : la part est plafonnee a 100 000");
    }
}
