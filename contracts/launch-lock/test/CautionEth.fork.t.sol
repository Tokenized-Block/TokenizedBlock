// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LLBase} from "./LLBase.sol";
import {Devises7030} from "../src/Devises7030.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";

/// @title The ETH branch of `inscrireAvecCaution` (the app's default pairing): value = fee + caution.
contract CautionEthTest is LLBase {
    uint128 constant MINIMUM_ETH = uint128(Devises7030.PLANCHER_ETH);

    function _hookEth() internal returns (Hook h, PoolKey memory k, address bloc, uint160 sp) {
        h = _hookProd();
        bloc = _creerB20("ETHC");
        k = _cle(address(0), bloc, address(h)); // native ETH is address(0): always currency0
        assertEq(Currency.unwrap(k.currency0), address(0), "ETH is currency0");
        (sp,) = _prix(true);
    }

    /// the app's convention (lancer-pool-v2.js): value = (payee ? 0 : fee) + caution. Passes at the floor.
    function test_ETH_conventionDeLApp_passe() public fork {
        (Hook h, PoolKey memory k, address bloc,) = _hookEth();
        bloc;
        (uint160 sp,) = _prix(true);
        uint256 v = FRAIS_VIE + MINIMUM_ETH;
        vm.deal(adm, adm.balance + v);
        _froidTous();
        vm.prank(adm);
        h.inscrireAvecCaution{value: v}(k, sp, MINIMUM_ETH, selDe[bloc]);
        assertEq(h.caution(k.toId()), MINIMUM_ETH, "la caution ETH doit etre exactement le minimum");
        assertTrue(h.createurActif(k.toId()), "le createur doit etre actif apres une caution ETH");
    }

    /// the V8 convention (value = fee only) reverts: fee - minimum < fraisVie.
    function test_ETH_conventionV8_revert() public fork {
        (Hook h, PoolKey memory k, address bloc,) = _hookEth();
        (uint160 sp,) = _prix(true);
        vm.deal(adm, adm.balance + FRAIS_VIE);
        _froidTous();
        vm.prank(adm);
        vm.expectRevert(Hook.MontantInsuffisant.selector);
        h.inscrireAvecCaution{value: FRAIS_VIE}(k, sp, MINIMUM_ETH, selDe[bloc]);
    }

    /// control: without escrow, `inscrire` (V8 convention) passes in ETH, so the revert above is not "ETH refused".
    function test_TEMOIN_ETH_inscrireSansCaution_passe() public fork {
        (Hook h, PoolKey memory k, address bloc,) = _hookEth();
        (uint160 sp,) = _prix(true);
        vm.deal(adm, adm.balance + FRAIS_VIE);
        _froidTous();
        vm.prank(adm);
        h.inscrire{value: FRAIS_VIE}(k, sp, selDe[bloc]);
        assertEq(h.inscrit(k.toId()), adm, "l inscription ETH sans caution doit passer");
    }
}
