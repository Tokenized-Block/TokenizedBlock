// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {Devises7030} from "../src/Devises7030.sol";

/// @title Constructor guards (no fork). Every immutable that could silently weaken the hook is refused at deploy:
///        an empty label marker (fail-open label check), a zero withdrawal delay (flash-borrowable escrow), a floor
///        list that does not match the currency list or holds a zero floor (no ~$1 minimum), a duplicate currency.
/// @dev   A valid config passes every guard and then fails on Uniswap's address-bits check (`HookAddressNotValid`):
///        that control proves each refusal below fires on ITS field, not on everything.
contract GardesConstructeurTest is Test {
    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant SINK = 0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4;
    bytes constant MARQUEUR = bytes("%22face%22%3A%7B");

    function _cfg() internal pure returns (Hook.Config memory c) {
        c.poolManager = PM;
        c.feeWallet = SINK;
        c.fraisVie = 0.0003 ether;
        c.hookFee = 700;
        c.partCreateur = 300;
        c.modeCollateral = 1;
        c.largeur = 4000;
        c.delaiRetrait = 7 days;
        c.exigerB20 = true;
        c.devises = Devises7030.liste();
        c.marqueur = MARQUEUR;
        c.plancherEth = Devises7030.PLANCHER_ETH;
        c.planchers = Devises7030.planchers();
        c.createRouter = 0xe05CD0336cD18A0909BCA980a4191A0B00a3FdF5;
        c.fraisCreation = 0.0007 ether;
    }

    function _passeLesGardes(Hook.Config memory c) internal {
        vm.expectRevert(abi.encodeWithSignature("HookAddressNotValid(address)", address(0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f)));
        new Hook(c);
    }

    function test_CONTROLE_configValide_passeLesGardes() public {
        _passeLesGardes(_cfg());
    }

    function test_marqueurVide_refuse() public {
        Hook.Config memory c = _cfg();
        c.marqueur = "";
        vm.expectRevert(Hook.MarqueurVide.selector);
        new Hook(c);
    }

    function test_CONTROLE_marqueurUnOctet_passe() public {
        Hook.Config memory c = _cfg();
        c.marqueur = "x";
        _passeLesGardes(c);
    }

    function test_delaiNul_refuse() public {
        Hook.Config memory c = _cfg();
        c.delaiRetrait = 0;
        vm.expectRevert(Hook.DelaiRetraitNul.selector);
        new Hook(c);
    }

    function test_CONTROLE_delaiUneSeconde_passe() public {
        Hook.Config memory c = _cfg();
        c.delaiRetrait = 1;
        _passeLesGardes(c);
    }

    function test_plancherEthNul_refuse() public {
        Hook.Config memory c = _cfg();
        c.plancherEth = 0;
        vm.expectRevert(Hook.PlanchersInvalides.selector);
        new Hook(c);
    }

    function test_listeDePlanchersCourte_refusee() public {
        Hook.Config memory c = _cfg();
        uint256[] memory p = new uint256[](c.devises.length - 1);
        for (uint256 i; i < p.length; ++i) p[i] = c.planchers[i];
        c.planchers = p;
        vm.expectRevert(Hook.PlanchersInvalides.selector);
        new Hook(c);
    }

    function test_plancherNul_refuse() public {
        Hook.Config memory c = _cfg();
        c.planchers[38] = 0; // PFEc
        vm.expectRevert(Hook.PlanchersInvalides.selector);
        new Hook(c);
    }

    function test_deviseEnDouble_refusee() public {
        Hook.Config memory c = _cfg();
        c.devises[39] = c.devises[27]; // PMc slot holds NFLXc a second time
        vm.expectRevert(Hook.DeviseEnDouble.selector);
        new Hook(c);
    }

    /// provenance: without a CreateRouter the salt proof would be meaningless -> refused
    function test_createRouterNul_refuse() public {
        Hook.Config memory c = _cfg();
        c.createRouter = address(0);
        vm.expectRevert(Hook.AdresseNulle.selector);
        new Hook(c);
    }

    /// a zero Create fee would let a factory-direct block register for the life fee alone -> refused
    function test_fraisCreationNul_refuse() public {
        Hook.Config memory c = _cfg();
        c.fraisCreation = 0;
        vm.expectRevert(Hook.FraisInvalide.selector);
        new Hook(c);
    }

    function test_CONTROLE_fraisCreation1wei_passe() public {
        Hook.Config memory c = _cfg();
        c.fraisCreation = 1;
        _passeLesGardes(c);
    }

    function test_ethDansLaListe_refuse() public {
        Hook.Config memory c = _cfg();
        c.devises[0] = address(0);
        vm.expectRevert(Hook.AdresseNulle.selector);
        new Hook(c);
    }

    /// the shipped list itself: 62 distinct currencies — the 41 of a54ced1 in order (GMEc HTZc PFEc PMc at 37..40), then the 21
    /// issuer stocks of 2026-10-03 (AMCc first, XYZc last), one floor > 0 each
    function test_liste62_planchers() public pure {
        address[] memory l = Devises7030.liste();
        uint256[] memory p = Devises7030.planchers();
        assertEq(l.length, 62);
        assertEq(p.length, 62);
        assertEq(l[41], Devises7030.AMCc, "AMCc first of the 21");
        assertEq(p[41], 36_101_084, "AMCc floor (REFERENCE $2.77)");
        assertEq(l[56], Devises7030.SOUNc);
        assertEq(l[61], Devises7030.XYZc, "XYZc last");
        assertEq(p[61], 1_345_352, "XYZc floor (REFERENCE $74.33)");
        for (uint256 i; i < l.length; ++i) {
            assertTrue(l[i] != address(0));
            assertGt(p[i], 0);
            for (uint256 j; j < i; ++j) assertTrue(l[i] != l[j], "no duplicate");
        }
        assertEq(l[37], 0xb2000000000000000000007790ed6E48e06eD935, "GMEc");
        assertEq(l[37], Devises7030.GMEc);
        assertEq(p[37], 4_162_864, "GMEc floor (POOL)");
        assertEq(l[38], Devises7030.HTZc);
        assertEq(l[39], Devises7030.PFEc);
        assertEq(l[40], Devises7030.PMc);
        assertEq(l[27], Devises7030.NFLXc);
        assertGt(Devises7030.PLANCHER_ETH, 0);
    }
}
