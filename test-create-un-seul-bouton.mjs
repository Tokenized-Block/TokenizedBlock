/* test-create-un-seul-bouton.mjs — CREATE MONTRE UN BOUTON, PAS TREIZE.
 *
 * ⛔⛔ CE QUI A ETE MESURE, page live, 375 px (la taille ou arrive un lien partage) : l onglet
 *     Create exposait TREIZE boutons visibles et 4,5 ECRANS a faire defiler. UN SEUL agit
 *     (`#cCreer`, « Instant Birth ») ; les douze autres sont deux bascules de reglages, deux choix
 *     de mode, un sel, CINQ puces de devise et deux sorties « trouver de l argent ».
 *     Phil, plusieurs fois : « normalement y a que le bouton birth et il fait tout ».
 *
 * ⛔ ON N A RIEN SUPPRIME. Le repli « Manual settings » existait deja — il etait juste ouvert par
 *   defaut, alors que l attribut `aria-expanded="false"` de son propre bouton disait « ferme ».
 *   Le balisage se contredisait, et c est la version bavarde qui gagnait.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que les gens creent davantage. Ca se lira dans
 *    `create_clic` -> `cree`, et ca prendra des jours. Il garde le premier ecran, pas le resultat.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

const i = html.indexOf('id="cReglagesDetail"');
assert.ok(i > 0, 'le repli des reglages est introuvable : ce test ne garde plus rien');
/* la balise ouvrante, bornee a son propre `>` */
const balise = html.slice(html.lastIndexOf('<', i), html.indexOf('>', i) + 1);

v('⛔ les reglages demarrent FERMES', () => {
  /* ⛔⛔ LE CAS CENTRAL. Un seul attribut `open` separe « un bouton » de « treize ». */
  assert.doesNotMatch(balise, /\sopen[\s>]/,
    'les reglages de Create sont de nouveau ouverts par defaut : treize boutons et 4,5 ecrans '
    + 'accueillent quelqu un venu en creer un seul');
});

v('le repli existe toujours — on a cache, pas supprime', () => {
  /* ⛔ Si le `<details>` disparaissait, les reglages deviendraient INATTEIGNABLES : on aurait
   *   remplace un ecran bavard par une fonctionnalite perdue. */
  assert.match(balise, /<details/, 'le repli a disparu : les reglages seraient inatteignables');
  assert.match(html, /id="cManuel"/, 'le bouton qui ouvre les reglages a disparu');
  assert.match(html, /id="cReglages"/, 'la zone des reglages elle-meme a disparu');
});

v('le bouton et le repli ne se contredisent plus', () => {
  /* ⛔ C etait le cas AVANT : `<details … open>` d un cote, `aria-expanded="false"` de l autre.
   *   Deux sources de verite sur un meme etat finissent toujours par diverger — ici elles
   *   divergeaient depuis le depart, et c est la plus bavarde qui gagnait. */
  const j = html.indexOf('id="cManuel"');
  assert.ok(j > 0, 'le bouton des reglages est introuvable');
  const b = html.slice(html.lastIndexOf('<', j), html.indexOf('>', j) + 1);
  const ouvertDetails = /\sopen[\s>]/.test(balise);
  const ouvertBouton = /aria-expanded="true"/.test(b);
  assert.equal(ouvertDetails, ouvertBouton,
    'le repli dit « ' + (ouvertDetails ? 'ouvert' : 'ferme') + ' » et son bouton dit « '
    + (ouvertBouton ? 'ouvert' : 'ferme') + ' » : deux verites sur un meme etat');
});

v('⛔ le bouton qui AGIT, lui, est toujours la et visible', () => {
  /* ⛔ Replier les reglages ne doit pas replier l action. Si `#cCreer` finissait dans le
   *   `<details>`, on aurait cache le seul bouton qui sert a quelque chose. */
  const c = html.indexOf('id="cCreer"');
  assert.ok(c > 0, 'le bouton Instant Birth a disparu');
  const finDetails = html.indexOf('</details>', i);
  assert.ok(c > finDetails || c < i,
    'le bouton Instant Birth est passe DANS le repli des reglages : la seule action de l ecran '
    + 'serait cachee derriere une tape');
});

assert.equal(n, 4, 'compte de cas inattendu : ' + n);
console.log('ok create-un-seul-bouton — ' + n + ' cas : reglages replies, rien supprime,');
console.log('   plus de contradiction, et le bouton qui agit reste dehors.');
console.log('⚠️ NE PROUVE PAS que les gens creent davantage : ca se lira dans create_clic -> cree.');
