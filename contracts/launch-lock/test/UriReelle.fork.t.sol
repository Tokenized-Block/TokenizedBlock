// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LLBase, ICreateRouterL} from "./LLBase.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";

/// @title Le label lu sur une URI de TAILLE REELLE — le crash « un vrai Create plante » (Zero 1, relaye par C2).
/// @notice ⛔⛔ TOUS les bancs de ce dossier gravent une URI de 88 octets (LLBase.URI). L app grave le SVG du block
///   en `image_data`, URL-encode deux fois : son propre commentaire cite des faces jusqu a 19 135 octets, et 33 %
///   des tirages « Surprise me » au-dessus de 12 000. `porteLeLabel` lit `contractURI()` avec un plafond de
///   GAS_LABEL. Mesure sur Base mainnet (lecture seule, 2026-10-02) : TBLOCK, URI 620 octets -> 66 112 gas ;
///   URI 66 octets -> 29 919 gas ; soit ~65 gas par octet. A 300 000 gas, la limite tombe vers ~4 500 octets.
///   Ce banc cree de VRAIS B20 (createPaid, precompile) a ces tailles et exige que le label soit LU.
contract UriReelleTest is LLBase {
    /// une URI de l app : `data:application/json,` + JSON URL-encode, marqueur `"face":{` present, gonflee a `n` octets
    function _uri(uint256 n) internal pure returns (string memory) {
        bytes memory tete = bytes("data:application/json,%7B%22name%22%3A%22X%22%2C%22face%22%3A%7B%22eyes%22%3A1%7D%2C%22image_data%22%3A%22");
        bytes memory queue = bytes("%22%7D");
        require(n > tete.length + queue.length, "n trop petit");
        bytes memory u = new bytes(n);
        uint256 i;
        for (; i < tete.length; i++) u[i] = tete[i];
        uint256 finRemplissage = n - queue.length;
        for (; i < finRemplissage; i++) u[i] = "A";
        for (uint256 j; j < queue.length; j++) u[i + j] = queue[j];
        return string(u);
    }

    function _creer(string memory sym, string memory uri) internal returns (address bloc) {
        bytes memory params = abi.encode(Params(1, sym, sym, adm, 18));
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeWithSignature("updateContractURI(string)", uri);
        vm.deal(adm, adm.balance + FRAIS_OUVERTURE + 1 ether);
        bytes32 sel = keccak256(abi.encode(sym, nonceSel++));
        vm.prank(adm);
        bloc = ICreateRouterL(CREATE_ROUTER).createPaid{value: FRAIS_OUVERTURE}(0, sel, params, calls, adm);
        selDe[bloc] = sel; // re-mine 40: the CreateRouter provenance proof
    }

    /// ⛔⛔ STOCKAGE FROID OBLIGATOIRE. Le block est cree DANS la transaction du test : son stockage est chaud
    ///   (100 gas/slot) et la lecture coute ~20 fois moins que sur la chaine, ou l inscription est une AUTRE
    ///   transaction. Sans ce refroidissement, ce banc etait VERT sur le hook qui plante (mesure : 40 000 o lus
    ///   pour 129 478 gas chaud, contre plafond atteint a froid).
    ///   `_froid` (LLBase) : vm.cool(bloc), require ok — banc NON valide sans lui.

    function _label(uint256 n) internal returns (bool lu, uint256 octets) {
        Hook h = _deployHook(_cfgProd());
        string memory u = _uri(n);
        address bloc = _creer("URI", u);
        (bool ok, bytes memory r) = bloc.staticcall(abi.encodeWithSelector(0xe8a3d485));
        require(ok, "contractURI illisible");
        octets = bytes(abi.decode(r, (string))).length;
        _froid(bloc);
        lu = h.porteLeLabel(bloc);
    }

    /// TEMOIN NEGATIF : 40 000 octets SANS le marqueur -> faux. Sans lui, « vrai » partout ne prouverait rien.
    function test_TEMOIN_uri_40000_sansMarqueur_faux() public fork {
        Hook h = _deployHook(_cfgProd());
        bytes memory u = new bytes(40000);
        bytes memory tete = bytes("data:application/json,%7B%22name%22%3A%22X%22%2C%22pad%22%3A%22");
        for (uint256 i; i < u.length; i++) u[i] = i < tete.length ? tete[i] : bytes1("A");
        address bloc = _creer("NOF", string(u));
        _froid(bloc);
        assertFalse(h.porteLeLabel(bloc), "sans marqueur : le label ne doit PAS etre lu");
    }

    /// MESURE : gas d un contractURI() sur le fork, a comparer a la chaine (620 o -> 66 112 en eth_estimateGas).
    function test_MESURE_gas_contractURI() public fork {
        uint256[4] memory tailles = [uint256(620), 8000, 19135, 40000];
        for (uint256 i; i < tailles.length; i++) {
            address bloc = _creer(string(abi.encodePacked("G", vm.toString(i))), _uri(tailles[i]));
            /* ⛔ le block vient d etre cree DANS CETTE transaction : son stockage est CHAUD (100 gas/slot). Le vrai
             *   parcours inscrit dans une AUTRE transaction : stockage FROID (2 100 gas/slot). On refroidit. */
            _froid(bloc);
            uint256 g0 = gasleft();
            (bool ok,) = bloc.staticcall{gas: 3_000_000}(abi.encodeWithSelector(0xe8a3d485));
            uint256 g1 = gasleft();
            emit log_named_uint(string(abi.encodePacked("octets ", vm.toString(tailles[i]), " ok=", ok ? "1" : "0", " gas")), g0 - g1);
        }
    }

    /// TEMOIN : la taille des bancs existants (et de TBLOCK) — doit passer, sinon rien d autre ne veut rien dire.
    function test_TEMOIN_uri_620_label_lu() public fork {
        (bool lu, uint256 o) = _label(620);
        assertEq(o, 620, "la factory doit graver exactement 620 octets");
        assertTrue(lu, "620 octets : le label doit etre lu");
    }

    function test_uri_8000_label_lu() public fork {
        (bool lu, uint256 o) = _label(8000);
        assertEq(o, 8000, "8000 octets graves");
        assertTrue(lu, "8 000 octets (face moyenne) : le label doit etre lu");
    }

    function test_uri_19135_pireCasApp_label_lu() public fork {
        (bool lu, uint256 o) = _label(19135);
        assertEq(o, 19135, "19135 octets graves");
        assertTrue(lu, "19 135 octets (pire cas cite par l app) : le label doit etre lu");
    }

    function test_uri_40000_maxFactory_label_lu() public fork {
        (bool lu, uint256 o) = _label(40000);
        assertEq(o, 40000, "40000 octets graves");
        assertTrue(lu, "40 000 octets (accepte par la factory) : le label doit etre lu");
    }

    /// ⭐ LE CREATE REEL : inscription sur le hook d un block a URI pire-cas. C est le geste qui plantait.
    function test_inscrire_uri_19135_passe() public fork {
        Hook h = _deployHook(_cfgProd());
        address bloc = _creer("URIB", _uri(19135));
        _froid(bloc);
        PoolKey memory k = _cle(address(0), bloc, address(h));
        (uint160 sp,) = _prix(true);
        vm.deal(adm, adm.balance + FRAIS_VIE);
        vm.prank(adm);
        h.inscrire{value: FRAIS_VIE}(k, sp, selDe[bloc]);
        assertEq(h.inscrit(k.toId()), adm, "l inscription d un block a URI reelle doit passer");
    }
}
