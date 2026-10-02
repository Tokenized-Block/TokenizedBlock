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
    /// ⛔⛔⛔ LE PLAFOND DE LA PART CREATEUR, CORRIGE LE MEME JOUR. Ma premiere version bornait par
    ///      `caution - duCreateur`. Or `_parts` est appele DEUX fois par swap — en `beforeSwap`, ou
    ///      `_repartir` ECRIT `duCreateur += cr`, puis en `afterSwap`, ou `_verifierRemplissage` le
    ///      REJOUE et compare. Le second appel relisait l etat deja modifie : les totaux divergeaient
    ///      et le swap revertait `RemplissagePartiel`. Trouve par un verificateur adversarial, pas par
    ///      moi. La borne ne lit plus que `caution`, que `_repartir` n ecrit jamais.
    ///   ⇒ LA PROPRIETE A GARDER N EST PAS « la somme est conservee » — ca, l ancienne formule le
    ///     faisait aussi. C est L IDEMPOTENCE : before et after doivent rendre la meme chose.
    function _borne(uint256 caution_, uint256 cr) internal pure returns (uint256 crBorne, uint256 surplus) {
        if (cr > caution_) return (caution_, cr - caution_);
        return (cr, 0);
    }

    /// ⛔ L ANCIENNE FORMULE, GARDEE UNIQUEMENT POUR PROUVER QU ELLE ETAIT FAUTIVE. Sans ce temoin,
    ///   « la nouvelle est idempotente » ne dirait pas que l ancienne ne l etait pas — et le correctif
    ///   n aurait pas de raison mesurable.
    function _borneAncienne(uint256 caution_, uint256 dejaDu, uint256 cr) internal pure returns (uint256) {
        uint256 reste = caution_ > dejaDu ? caution_ - dejaDu : 0;
        return cr > reste ? reste : cr;
    }

    function test_plafond_deposer_presque_rien_rapporte_presque_rien_par_swap() public pure {
        (uint256 cr, uint256 surplus) = _borne(1, 1_000_000);
        assertEq(cr, 1, "une caution de 1 plafonne chaque swap a 1");
        assertEq(surplus, 999_999, "le reste n est pas verse au createur");
        assertEq(cr + surplus, 1_000_000, "rien ne disparait de la comptabilite");
    }

    /// ⛔ TEMOIN POSITIF — une caution large ne bride RIEN. Sans lui, « ca plafonne » serait
    ///   indiscernable d un plafond qui ecrase tout, et la part createur serait morte.
    function test_TEMOIN_une_caution_large_ne_bride_rien() public pure {
        (uint256 cr, uint256 surplus) = _borne(10_000_000, 1_000_000);
        assertEq(cr, 1_000_000, "une caution large ne doit rien plafonner");
        assertEq(surplus, 0, "aucun surplus");
    }

    /// ⛔⛔⛔ LE TEST QUI COMPTE : LE SWAP REJOUE NE DIVERGE PLUS. On simule exactement le cycle du
    ///      hook : un premier calcul (beforeSwap), l ecriture `duCreateur += cr`, puis un second
    ///      calcul sur l etat modifie (afterSwap). Le cas choisi est celui que le verificateur a nomme :
    ///      0 < caution - duCreateur < 2X.
    function test_idempotent_avant_et_apres_le_swap() public pure {
        uint256 caution_ = 100;
        uint256 X = 60;                 // part createur calculee pour ce swap
        uint256 dejaDu = 0;
        // NOUVELLE FORMULE : ne lit que la caution
        (uint256 avant,) = _borne(caution_, X);
        dejaDu += avant;                // ce que _repartir ecrit en beforeSwap
        (uint256 apres,) = _borne(caution_, X);
        assertEq(avant, apres, "nouvelle formule : before et after doivent rendre la meme part");
        assertEq(dejaDu, 60, "le cycle a bien credite la part");
    }

    /// ⛔⛔ ET LE TEMOIN QUE L ANCIENNE ETAIT FAUTIVE, sur le MEME cas. Si ce test passait au vert avec
    ///    egalite, mon correctif n aurait rien corrige. Il doit montrer la DIVERGENCE.
    function test_TEMOIN_lancienne_formule_divergeait() public pure {
        uint256 caution_ = 100;
        uint256 X = 60;
        uint256 dejaDu = 0;
        uint256 avant = _borneAncienne(caution_, dejaDu, X);   // 60
        dejaDu += avant;                                        // 60
        uint256 apres = _borneAncienne(caution_, dejaDu, X);   // min(60, 100-60) = 40
        assertTrue(avant != apres, "l ancienne formule DEVAIT diverger : c etait le defaut");
        assertEq(avant, 60, "before : 60");
        assertEq(apres, 40, "after : 40 -> RemplissagePartiel");
    }

    /// ⛔ ET POUR TOUTE ENTREE : conservation ET idempotence. La seconde est la propriete que j avais
    ///   cassee ; la premiere, je l avais deja, et elle ne m a pas protege.
    function testFuzz_conserve_et_idempotent(uint96 caution_, uint96 cr) public pure {
        (uint256 a, uint256 b) = _borne(caution_, cr);
        assertEq(a + b, cr, "la somme doit etre conservee");
        assertLe(a, caution_, "la part ne depasse jamais la caution");
        (uint256 a2,) = _borne(caution_, cr);
        assertEq(a, a2, "deux appels sur le meme etat rendent la meme part");
    }

    /// ⛔⛔ LE DELAI DE RETRAIT NUL EST REFUSE AU CONSTRUCTEUR. A 0, la caution ressortirait dans le meme
    ///    bloc et l invariant « cannot be flash-borrowed » tomberait.
    function test_constructeur_refuse_un_delai_de_retrait_nul() public {
        Hook.Config memory c = _cfg(MARQUEUR);
        c.delaiRetrait = 0;
        vm.expectRevert(Hook.DelaiRetraitNul.selector);
        new Hook(c);
    }

    /// ⛔ TEMOIN : un delai d UNE seconde passe la garde (et echoue plus loin, sur l adresse v4). La
    ///   garde porte sur le ZERO, pas sur une duree choisie — la duree economique est a Raksha.
    function test_TEMOIN_un_delai_dune_seconde_passe_la_garde() public {
        Hook.Config memory c = _cfg(MARQUEUR);
        c.delaiRetrait = 1;
        vm.expectRevert(
            abi.encodeWithSignature("HookAddressNotValid(address)", address(0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f))
        );
        new Hook(c);
    }

}
