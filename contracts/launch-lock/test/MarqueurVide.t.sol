// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
/* ⛔ L IMPORT EST COPIE DE `LLBase.sol`, PAS ECRIT DE MEMOIRE. Ma premiere version mettait
 *   `v4-core/src/interfaces/...` : le remapping ajoute deja `src`, d ou un chemin double
 *   `lib/v4-core/src/src/...` et un refus de compilation. « Sonder avant de coder contre » vaut
 *   aussi pour un chemin d import. */
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {V9Devises} from "../src/V9Devises.sol";

/// @title Un marqueur vide desactivait ENTIEREMENT la verification du label.
/// @notice ⛔⛔⛔ LE DEFAUT, CORRIGE LE 2026-10-02. `porteLeLabel` commencait par :
///         `bytes memory m = marqueur; if (m.length == 0) return true;`
///         Un marqueur vide rendait donc `true` pour N IMPORTE QUELLE adresse : la verification
///         sautait, et n importe quel jeton pouvait inscrire une pool sur ce hook — `_verifier`
///         appelle `porteLeLabel` sur le chemin de `inscrire` ET de `inscrireAvecCaution`.
///         `marqueur` est en storage, pose UNE SEULE FOIS au constructeur, sans aucun setter
///         (conception adminless) : l etat aurait ete DEFINITIF.
///
///   ⛔ POURQUOI LE CORRECTIF EST AU CONSTRUCTEUR ET PAS DANS `porteLeLabel`. Inverser le `return`
///     seul aurait BRIQUE un hook deja deploye avec un marqueur vide : il aurait refuse tout, pour
///     toujours. C est « fail-closed sur une affordance efface le produit », deja paye en prod
///     (13 puces reduites a 2). On valide donc a la frontiere ou c est ENCORE REPARABLE — le
///     deploiement. La branche de `porteLeLabel` devient inatteignable et reste fail-closed comme
///     assertion de l invariant.
///
///   ⚠️ UN MARQUEUR VIDE N A JAMAIS ETE UNE CONFIGURATION VOULUE : la valeur reelle est
///     `%22face%22%3A%7B` (encodage URL de `"face":{`), qui verifie que le block est GRAVE. Ce
///     contrat exprime deja ses exigences par des DRAPEAUX explicites (`exigerB20`) ; un
///     « pas de verification » encode dans une chaine VIDE etait la seule exception, et elle etait
///     implicite — personne ne l avait choisie.
contract MarqueurVideTest is Test {
    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant SINK = 0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4;
    bytes constant MARQUEUR = bytes("%22face%22%3A%7B");

    function _cfg(bytes memory marqueur) internal pure returns (Hook.Config memory c) {
        c.poolManager = PM;
        c.feeWallet = SINK;
        c.fraisVie = 0;
        c.hookFee = 900;
        c.partCreateur = 300;
        c.partCollateral = 0;
        c.modeCollateral = 0;
        c.ancre = false;
        c.largeur = 4000;
        c.seuil = 0;
        c.delaiRetrait = 7 days;
        c.exigerB20 = true;
        c.devises = V9Devises.liste();
        c.marqueur = marqueur;
        c.suivi24h = false;
    }

    /// ⛔ LE CAS QUI COMPTE : le constructeur REFUSE un marqueur vide.
    function test_constructeur_refuse_un_marqueur_vide() public {
        vm.expectRevert(Hook.MarqueurVide.selector);
        new Hook(_cfg(bytes("")));
    }

    /// ⛔⛔⛔ LE TEMOIN DE CONTRASTE, ET IL EST INDISPENSABLE. Sans lui, « ca revert » serait
    ///      indiscernable d un constructeur qui revert TOUJOURS — et un test qui ne distingue pas
    ///      les deux ne prouve RIEN. Ce depot a deja vu une sonde rendre « oui » a tout.
    ///
    ///   ⇒ Avec un marqueur NON vide, le constructeur va PLUS LOIN et echoue sur une AUTRE erreur :
    ///     `HookAddressNotValid`, l exigence d Uniswap V4 que l adresse du hook encode ses
    ///     permissions dans ses bits de poids faible. Deux erreurs DIFFERENTES prouvent que ma garde
    ///     tire precisement sur le marqueur, et pas sur n importe quoi.
    ///
    ///   ⚠️ CE QUE CE TEST NE FAIT DONC PAS : construire un hook VIVANT. Ca demande de miner un sel
    ///     CREATE2 pour obtenir une adresse aux bons bits (`LLBase._mine`), ce que font les bancs
    ///     fork. Ici on prouve l ORDRE des gardes du constructeur, pas le comportement du hook —
    ///     et je le dis plutot que de laisser croire a une preuve de bout en bout.
    function test_TEMOIN_un_marqueur_non_vide_passe_LA_garde() public {
        vm.expectRevert(
            abi.encodeWithSignature("HookAddressNotValid(address)", address(0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f))
        );
        new Hook(_cfg(MARQUEUR));
    }

    /// ⛔ L AUTRE BORNE : un marqueur d UN SEUL octet passe aussi la garde. Elle porte sur le VIDE,
    ///   pas sur une longueur arbitraire — si quelqu un la durcissait en seuil, ce test le dirait.
    ///   Une garde doit refuser ce qu elle annonce refuser, et rien de plus.
    function test_TEMOIN_un_octet_passe_LA_garde() public {
        vm.expectRevert(
            abi.encodeWithSignature("HookAddressNotValid(address)", address(0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f))
        );
        new Hook(_cfg(bytes("x")));
    }
}
