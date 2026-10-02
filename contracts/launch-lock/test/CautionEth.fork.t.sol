// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LLBase, ICreateRouterL} from "./LLBase.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";

/// @title La branche ETH de `inscrireAvecCaution` — le chemin PAR DEFAUT de l app, jamais execute.
/// @notice ⛔⛔⛔ LE TROU DE COUVERTURE, trouve le 2026-10-02 par un agent qui lisait LLBase.sol.
///         `_naitreAvec` fait, quand une caution est demandee :
///             _fundStock(devise, adm, minimum); IERC20L(devise).approve(hook, minimum);
///         Un `transfer` et un `approve` sur `devise == address(0)` sont IMPOSSIBLES : la branche
///         caution ne peut donc JAMAIS etre jouee avec ETH. Or « Paired with · ETH » est le choix par
///         defaut de l ecran Create. La branche ETH du hook —
///             if (devise.isAddressZero()) { if (msg.value < minimum) revert MontantInsuffisant();
///                                           pourFrais = msg.value - minimum; }
///         puis `poolManager.settle{value: m}()` dans l unlock OP_CAUTION — n etait executee par
///         AUCUN banc. Le « 14/14 PASS » du plan de deploiement ne la couvrait pas.
///
///   ⛔ POURQUOI CE BANC MAINTENANT : six hypotheses sur le crash de Zero 1 (« il plante sur un vrai
///     Create ») ont ete ELIMINEES par la mesure le meme jour. La branche ETH est la seule zone du
///     chemin par defaut qu aucun banc n avait jamais touchee — donc le meilleur candidat restant.
///     Ce banc ne pretend pas trouver le crash : il couvre la zone ou il pourrait vivre.
contract CautionEthTest is LLBase {
    uint128 constant MINIMUM_ETH = 0.0003 ether;

    function _creer(string memory sym) internal returns (address bloc) {
        bytes memory params = abi.encode(Params(1, sym, sym, adm, 18));
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeWithSignature("updateContractURI(string)", URI);
        vm.deal(adm, adm.balance + FRAIS_OUVERTURE + 1 ether);
        vm.prank(adm);
        bloc = ICreateRouterL(CREATE_ROUTER).createPaid{value: FRAIS_OUVERTURE}(
            0, keccak256(abi.encode(sym, nonceSel++)), params, calls, adm
        );
    }

    function _hookEth() internal returns (Hook h, PoolKey memory k, address bloc, uint160 sp) {
        h = _deployHook(_cfg(700, 300, 0, 1, true, false));
        bloc = _creer("ETHC");
        // ⛔ l ETH natif est address(0), donc TOUJOURS currency0 en v4
        k = _cle(address(0), bloc, address(h));
        assertEq(Currency.unwrap(k.currency0), address(0), "ETH doit etre currency0");
        (sp,) = _prix(true);
    }

    /// ⭐ LA CONVENTION DE L APP : value = frais + caution. Doit PASSER.
    ///   C est exactement ce que `lancer-pool-v2.js` envoie : (payee ? 0 : fraisWei) + cautionWei.
    function test_ETH_conventionDeLApp_passe() public fork {
        (Hook h, PoolKey memory k, address bloc,) = _hookEth();
        bloc;
        (uint160 sp,) = _prix(true);
        uint256 v = FRAIS_OUVERTURE + MINIMUM_ETH;
        vm.deal(adm, adm.balance + v);
        vm.prank(adm);
        h.inscrireAvecCaution{value: v}(k, sp, MINIMUM_ETH);
        assertEq(h.caution(k.toId()), MINIMUM_ETH, "la caution ETH doit etre exactement le minimum");
        assertTrue(h.createurActif(k.toId()), "le createur doit etre actif apres une caution ETH");
    }

    /// ⛔ LA CONVENTION V8 (value = frais de vie seul) DOIT REVERT : pourFrais = fraisVie - minimum
    ///   < fraisVie. Ce n est pas un bug du hook, c est la regle — mais c est un PIEGE pour tout
    ///   integrateur qui recopie la convention V8/V9, y compris le propre banc du projet.
    function test_ETH_conventionV8_revert() public fork {
        (Hook h, PoolKey memory k,,) = _hookEth();
        (uint160 sp,) = _prix(true);
        vm.deal(adm, adm.balance + FRAIS_VIE);
        vm.prank(adm);
        vm.expectRevert(Hook.MontantInsuffisant.selector);
        h.inscrireAvecCaution{value: FRAIS_VIE}(k, sp, MINIMUM_ETH);
    }

    /// ⛔ TEMOIN : sans caution, `inscrire` (convention V8) PASSE en ETH. Sans lui, un revert dans le
    ///   test precedent serait indiscernable d un hook qui refuse TOUTE inscription ETH.
    function test_TEMOIN_ETH_inscrireSansCaution_passe() public fork {
        (Hook h, PoolKey memory k,,) = _hookEth();
        (uint160 sp,) = _prix(true);
        vm.deal(adm, adm.balance + FRAIS_VIE);
        vm.prank(adm);
        h.inscrire{value: FRAIS_VIE}(k, sp);
        assertEq(h.inscrit(k.toId()), adm, "l inscription ETH sans caution doit passer");
    }
}
