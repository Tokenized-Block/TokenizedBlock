/* test-plancher-devise-non-lue.mjs — SANS PRIX, ON NE PEUT PAS JUGER : ON DEMANDE.
 *
 * ⛔⛔ CE QUI ETAIT OUVERT, mesure du 2026-09-25 : sur les treize actions Coinbase proposees au
 *     lancement, CINQ n ont aucun prix lisible — COINc, CRCLc, INTCc, MSTRc, SNDKc (pas de paire
 *     cotee, ou liquidite sous le seuil de /api/prix-usd).
 *     Le plancher anti-brade ne s appliquait QUE si le prix avait ete lu :
 *         if (p > 0 && ethUsd > 0 && valo * p < VALO_PLANCHER_ETH * ethUsd) …
 *     Pour ces cinq, `p` valait `null`, le classement restait `NON_APPLICABLE`, et RIEN ne
 *     prevenait : on pouvait ouvrir un marche a n importe quel prix de depart et se faire racheter
 *     toute sa supply en quelques secondes. La voie ETH, elle, refuse sous 1 ETH — l asymetrie
 *     etait reelle, et silencieuse.
 *
 * ⛔ ET LE TEXTE DE LA CONFIRMATION CITAIT « Below 1 ETH » DEVANT UNE VALEUR EN INTCc. Un seuil
 *   juste, applique au mauvais referentiel, se lit comme une erreur de l app — et il empeche de
 *   comprendre le vrai risque, qui est le meme dans les deux cas.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : qu aucun block ne sera brade. C est une CONFIRMATION, pas un
 *   blocage (le fichier le dit : « repris de l ecran qui a marche »). Ce qui est garde, c est que
 *   personne ne le fera sans l avoir lu.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { VALO_PLANCHER_ETH } from './lancement.js';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('⛔⛔ un prix de devise NON LU declenche la confirmation', () => {
  /* ⛔⛔ LE CAS CENTRAL : c est le trou par lequel une supply pouvait partir sans un mot. */
  assert.match(html, /else if \(!\(p > 0\)\) plan\.classement = \{ etat: 'TROP_BON_MARCHE', valo, plancherEth: null, prixDeviseNonLu: true \}/,
    'un prix de devise non lu laisse de nouveau le classement a NON_APPLICABLE : aucune '
    + 'confirmation, aucun plancher, et toute la supply peut partir a n importe quel prix');
});

v('⛔ le plancher CHIFFRE existe toujours — temoin positif', () => {
  /* ⛔ Le nouveau cas ne doit pas avaler l ancien : un seuil franchi reste un seuil franchi. */
  assert.match(html, /if \(p > 0 && ethUsd > 0 && valo \* p < VALO_PLANCHER_ETH \* ethUsd\) plan\.classement = \{ etat: 'TROP_BON_MARCHE', valo, plancherEth: VALO_PLANCHER_ETH \}/,
    'le plancher chiffre a disparu : les devises DONT on lit le prix ne sont plus protegees');
  assert.equal(VALO_PLANCHER_ETH, 1,
    'le plancher a change de valeur : verifier que la mesure qui le justifie a ete refaite');
});

v('⛔ le nouveau cas est un `else if`, pas une branche qui double l ancien', () => {
  /* ⛔⛔ TEMOIN NEGATIF, et il compte : si le cas « prix non lu » n etait pas exclusif, un prix
   *     PARFAITEMENT LU et une valeur SAINE pourraient quand meme declencher la confirmation.
   *     Une garde qui crie sur tout le monde est desactivee par ceux qui la lisent. */
  const i = html.indexOf("if (p > 0 && ethUsd > 0 && valo * p < VALO_PLANCHER_ETH");
  assert.ok(i > 0, 'le bloc du plancher est introuvable');
  const bloc = html.slice(i, i + 1600);
  const iElse = bloc.indexOf('else if (!(p > 0))');
  assert.ok(iElse > 0, 'le cas du prix non lu n est plus attache a la condition du plancher');
  /* rien d autre ne doit poser TROP_BON_MARCHE entre les deux : une troisieme porte serait un trou */
  const entre = bloc.slice(0, iElse);
  assert.equal((entre.match(/TROP_BON_MARCHE/g) || []).length, 1,
    'plus d un chemin pose TROP_BON_MARCHE dans ce bloc : leur ordre devient decisif, et personne '
    + 'ne le relira');
});

v('⛔⛔ le texte de la confirmation ne cite JAMAIS un seuil qu il n a pas', () => {
  /* ⛔⛔ « Below 1 ETH » devant une valeur en INTCc, c est un chiffre juste au mauvais endroit. */
  const i = html.indexOf("const txtConfirm = $('#plConfirmTexte');");
  assert.ok(i > 0, 'le texte de la confirmation n est plus pilote : il redevient statique, donc faux '
    + 'des qu on lance dans une autre devise');
  const bloc = html.slice(i, i + 1100);
  assert.match(bloc, /plan\.classement\.plancherEth == null/,
    'les deux raisons de demander la confirmation ne sont plus distinguees');
  assert.match(bloc, /We could not read a USD price for/,
    'le cas « prix non lu » n a plus sa propre phrase : il retomberait sur celle du seuil');
  assert.match(bloc, /'Below ' \+ plan\.classement\.plancherEth \+ ' ETH/,
    'le seuil affiche n est plus celui du classement : il redevient un litteral qui derivera');
  assert.doesNotMatch(bloc, /Below 1 ETH/,
    'le seuil est de nouveau ecrit en dur dans le code du peintre : il mentira au prochain '
    + 'changement de VALO_PLANCHER_ETH');
});

v('⛔ le texte lit `plan.symDevise`, pas une variable d une autre fonction', () => {
  /* ⛔⛔ PIEGE QUE J AI FAILLI LIVRER : `symDevise` vit dans `calculerLancement`, pas dans le
   *     peintre. Ca COMPILE (une autre liaison du meme nom existe ailleurs) et ca jetterait a
   *     l EXECUTION, sur le chemin d un refus — donc au moment le moins observe de l app. */
  const i = html.indexOf("const txtConfirm = $('#plConfirmTexte');");
  const bloc = html.slice(i, i + 1100);
  assert.match(bloc, /plan\.symDevise \|\| 'this currency'/,
    'le nom de la devise ne vient plus du plan : une variable hors portee jetterait ici');
  assert.doesNotMatch(bloc, /\(symDevise \|\|/,
    'la variable `symDevise` d une autre fonction est de nouveau lue : ReferenceError a l execution');
});

v('l element du texte existe dans le HTML', () => {
  assert.match(html, /id="plConfirmTexte"/,
    'l element a disparu : le peintre ecrirait dans le vide et la phrase resterait celle du seuil');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok plancher-devise-non-lue — ' + n + ' cas : sans prix on demande, avec prix on cite le');
console.log('   seuil, et jamais « 1 ETH » devant une valeur libellee autrement.');
console.log('⚠️ NE PROUVE PAS qu aucun block ne sera brade : c est une CONFIRMATION, pas un blocage.');
console.log('   Ce qui est garde, c est que personne ne le fera sans l avoir lu.');
