/* test-pairer-block-est-une-fonction.mjs — « Pair a block with it » DOIT ETRE UNE FONCTION, PAS UN PIEGE.
 *
 * ⛔⛔ CE QUI A DECLENCHE CE TEST : Phil, 2026-09-26 — « le paired with block est casse, build it ».
 *     Le diagnostic a trouve TROIS defauts empiles, et le dernier est le plus grave :
 *
 *     1. L EFFET DU CLIC ETAIT HORS ECRAN. `pairerAvec()` appelle `allerA('creer')`, dont le
 *        gestionnaire fait `window.scrollTo({ top: 0 })` — puis ecrit tout son resultat dans la
 *        carte « Instant Birth », que ce depot mesure lui-meme a plusieurs ecrans de defilement en
 *        375 px. Le visiteur etait renvoye en HAUT d un formulaire, sans rien voir bouger.
 *        ⛔ Et le bouton « Buy » de la MEME liste faisait deja un `scrollIntoView`, trente lignes
 *          plus bas. Deux gestes voisins, un seul amenait son resultat sous les yeux.
 *
 *     2. L OPTION DE REPLI ETAIT `disabled` ET LIBELLEE « — soon », alors que le code qui s en sert
 *        tourne : `pairerAvec` la selectionne pour tout block hors registre, et `majPaire` verifie
 *        le marqueur `0xef` sur la chaine avant d accepter. « soon » pour une fonction qui marche.
 *
 *     3. ⛔⛔ LE MARCHE PRODUIT ETAIT INECHANGEABLE A 100 %. `fraisDevisesOk` n etait peuple que
 *        depuis `pairesProposees()` : un block n y entrait JAMAIS, donc `echange.js` refusait tout
 *        achat et toute vente sur un marche cote en block. L appairage creait un marche REEL sur la
 *        chaine que l app elle-meme refusait de tracer — exactement le « piege, pas une fonction »
 *        que Phil avait nomme le 2026-09-18 avant de cacher le bouton.
 *
 * ⛔ CE QU ON N A PAS FAIT : retirer la garde. Sa raison tient — a6cf a ete paye en jetons
 *   invendables (7 detentions, 0 avec un marche, part reelle 0 $). On a cesse de SUPPOSER qu un
 *   block ne peut jamais etre vendable, et on lui applique la MEME regle qu aux autres devises :
 *   un prix en dollars LU, et une profondeur au-dessus du seuil.
 *
 * ⚠️ CE QUE CE TEST NE PROUVE PAS : que le frais se vendra. Il prouve qu on ne l accepte que si un
 *   prix ET une profondeur ont ete lus au moment du plan. Le marche peut s evaporer apres.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const brut = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔ commentaires depouilles : ce fichier cite ses defauts en clair, « soon » et `disabled` compris. */
const nu = brut.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

let n = 0;
const v = (nom, fn) => { fn(); n++; };

function corpsDe(signature) {
  const d = nu.indexOf(signature);
  if (d < 0) return null;
  let prof = 0, dans = null;
  for (let i = nu.indexOf('{', d); i < nu.length; i++) {
    const c = nu[i];
    if (dans) { if (c === dans && nu[i - 1] !== '\\') dans = null; continue; }
    if (c === '"' || c === "'" || c === '`') { dans = c; continue; }
    if (c === '{') prof++;
    else if (c === '}' && !--prof) return nu.slice(d, i + 1);
  }
  return null;
}

v('⛔⛔ le clic amene son resultat sous les yeux', () => {
  const corps = corpsDe('function pairerAvec(');
  assert.ok(corps, 'pairerAvec() est introuvable');
  assert.ok(/scrollIntoView\(\{ block: 'center'/.test(corps),
    'l appairage ne ramene plus son resultat a l ecran : `allerA` remonte en haut de page et tout '
    + 'l effet du clic vit plusieurs ecrans plus bas — le visiteur ne verrait rien bouger');
  /* ⛔ DANS UN try : un navigateur sans defilement doux ne doit pas faire tomber l appairage. */
  assert.ok(/try \{ \(det \|\| s\)\.scrollIntoView/.test(corps),
    'le defilement n est plus protege : une exception ferait echouer un appairage par ailleurs valide');
});

v('⛔ l option de repli n est plus desactivee, ni annoncee « soon »', () => {
  const i = nu.indexOf('AUTRE_PAIRE + \'">');
  assert.ok(i > 0 || /AUTRE_PAIRE \+ '"[^>]*>/.test(nu), 'l option de repli a disparu du selecteur');
  const ligne = nu.slice(Math.max(0, nu.indexOf('AUTRE_PAIRE + \'"') - 60), nu.indexOf('</option>', nu.indexOf('AUTRE_PAIRE + \'"')) + 9);
  assert.ok(!/disabled/.test(ligne),
    'l option de repli est de nouveau `disabled` : `pairerAvec` la selectionne a chaque clic, donc '
    + 'le bouton emprunterait un chemin muet');
  assert.ok(!/soon/i.test(ligne),
    'le libelle annonce encore « soon » pour une fonction qui tourne');
});

v('⛔⛔ un block peut etre une devise de frais — aux MEMES conditions que les autres', () => {
  const i = nu.indexOf('const fraisDevisesOk = (() => {');
  assert.ok(i > 0, 'l ensemble des devises de frais est introuvable');
  const corps = nu.slice(i, nu.indexOf('})();', i) + 5);
  assert.ok(/for \(const \[adrBlock, l\] of marcheParAdr\)/.test(corps),
    'les blocks n entrent plus dans les devises de frais : tout marche cote en block redeviendrait '
    + 'inechangeable, et « Pair a block with it » redeviendrait un piege');
  /* ⛔ DEUX CONDITIONS. Un prix sans profondeur ne rend rien vendable. */
  assert.ok(/Number\(l\.prixUsd\) > 0/.test(corps), 'le prix en dollars n est plus exige');
  assert.ok(/Number\(l\.liquiditeUsd\) >= LIQ_MIN_BUY_USD/.test(corps),
    'la profondeur n est plus exigee : un frais preleve dans un jeton sans marche ne se touche pas');
  /* ⛔ ET L USDC RESTE LA BASE : un registre illisible doit rendre le comportement d AVANT, jamais
   *   « tout ouvert ». */
  assert.ok(/const s = new Set\(\[USDC_BASE\.toLowerCase\(\)\]\);/.test(corps),
    'l ensemble ne part plus de l USDC : un echec de lecture pourrait tout ouvrir');
  const catches = (corps.match(/catch \(_\)/g) || []).length;
  assert.ok(catches >= 2,
    'une des deux lectures n est plus protegee : une liste illisible ferait tomber le plan d echange');
});

v('⛔ UN SEUL SEUIL pour « Buy » et pour la devise de frais', () => {
  /* ⛔ Deux seuils separes auraient derive : on proposerait d acheter un marche dont on refuserait
   *   le frais, ou l inverse — et personne ne verrait la contradiction avant qu elle coute. */
  assert.ok(/const LIQ_MIN_BUY_USD = 500;/.test(nu), 'le seuil unique a disparu');
  assert.ok(!/liquiditeUsd \|\| 0\) >= 500/.test(nu),
    'le bouton « Buy » a retrouve un 500 en dur : les deux decisions peuvent desormais diverger');
  const combien = (nu.match(/LIQ_MIN_BUY_USD/g) || []).length;
  assert.ok(combien >= 3,
    'le seuil n est plus partage par les deux decisions (' + combien + ' occurrence(s))');
});

assert.equal(n, 4, 'compte de cas inattendu : ' + n);
console.log('ok pairer-block-est-une-fonction — ' + n + ' cas.');
console.log('   Le clic ramene son resultat a l ecran, l option n annonce plus « soon », et un');
console.log('   marche cote en block est echangeable SI son prix et sa profondeur ont ete lus.');
console.log('⚠️ NE PROUVE PAS que le frais se vendra : seulement qu on ne l accepte pas sans mesure.');
