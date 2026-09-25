/* test-lien-partage-amene-au-block.mjs — UN LIEN VERS UN BLOCK DOIT MONTRER CE BLOCK.
 *
 * ⛔⛔ CE QUI A ETE MESURE LE 2026-09-25, sur la page LIVE, en 375 px de large.
 *     Un visiteur ouvre `/?block=0x…` — un lien partage. Le profil s ouvre bien, mais il commence
 *     a 927 px : plus d un ecran SOUS la ligne de flottaison, derriere « Biggest blocks » et
 *     « Blocks by stage ». Et le scroll reste a ZERO — observe sur 12 secondes, `scrollY` ne bouge
 *     jamais. Le visiteur atterrit donc sur un classement generique, pas sur le block qu il venait
 *     voir.
 *   ⇒ ENJEU : la veille, 7 visiteurs sur 30 sont arrives par un lien de block (`lien_recu`), et
 *     ZERO a clique sur Create. C est le chemin d entree le plus utilise, et il menait a cote.
 *
 * ⛔ CE N ETAIT PAS LE MECANISME : appele a la main sur la meme page, `scrollIntoView` scrolle a
 *   982 px et met le profil en haut. C etait le MOMENT — l appel partait avant que les ~900 px de
 *   classement au-dessus ne soient peints, donc il visait une position qui n existait pas encore.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que le visiteur reste. Il prouve qu il voit ce pour quoi il a
 *    clique. Le reste se lira dans `lien_recu` -> `create_clic` dans quelques jours.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const src = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

const i = src.indexOf('function amenerEnVue(');
assert.ok(i > 0, 'amenerEnVue est introuvable : ce test ne garde plus rien');
const j = src.indexOf('\nasync function', i);
const f = src.slice(i, j > i ? j : i + 1600);

v('le profil est amene en vue quand on navigue vers lui', () => {
  assert.match(src, /if \(!\(opts && opts\.sansNaviguer\)\) amenerEnVue\(p\)/,
    "le profil n est plus amene en vue : un lien partage retombe sur le classement generique");
});

v('⛔ et PAS quand on reste dans Create', () => {
  /* ⛔ Le parcours de creation charge le profil SANS naviguer : y scroller arracherait
   *   l utilisateur a son geste — exactement le defaut qu on a corrige hier. */
  const g = src.indexOf('const goLaunch = ');
  assert.ok(g > 0, 'goLaunch introuvable');
  assert.match(src.slice(g, g + 2200), /sansNaviguer:\s*true/,
    'le parcours de creation ne demande plus le silence : il se ferait deplacer');
});

v('⛔ le scroll est REAFFIRME, parce qu une seule fois ne suffit pas', () => {
  /* ⛔⛔ LE CAS CENTRAL. Un appel unique part avant que le contenu au-dessus soit peint et vise une
   *     position qui n existe pas encore. C est tout le defaut. */
  assert.match(f, /setTimeout\(essayer/, "le scroll n est plus reaffirme : un seul essai echouera comme avant");
  assert.match(f, /essais\s*>=\s*4|essais\s*>\s*3/, 'le nombre d essais n est plus borne');
});

v('⛔ instantane, jamais « smooth »', () => {
  /* ⛔ Une animation en cours se fait annuler par le prochain repaint — et le prochain repaint est
   *   precisement ce qui deplace la cible. `smooth` etait une des deux causes. */
  assert.match(f, /behavior:\s*'auto'/, "le scroll est redevenu anime : il sera annule par le repaint suivant");
  assert.doesNotMatch(f, /behavior:\s*'smooth'/, 'un scroll anime est revenu');
});

v('⛔ ON NE SE BAT PAS CONTRE L UTILISATEUR', () => {
  /* ⛔⛔ Une page qui ramene de force quelqu un ou il ne veut pas aller est PIRE que celle qui ne
   *     l y amene jamais. Des qu il scrolle lui-meme, on se tait. */
  assert.match(f, /addEventListener\('scroll'/, "on ne surveille plus le scroll de l utilisateur");
  assert.match(f, /arrete = true/, "rien n arrete la reaffirmation : la page se battrait contre lui");
  assert.match(f, /removeEventListener\('scroll'/,
    "l ecouteur n est jamais retire : il s accumulerait a chaque profil ouvert");
});

v('la distinction notre-scroll / son-scroll repose sur une marge NOMMEE', () => {
  /* ⛔ Sans marge, le moindre arrondi du navigateur passerait pour un geste de l utilisateur et
   *   couperait la reaffirmation des le premier essai. */
  assert.match(f, /dernierY/, 'plus de reference pour distinguer notre scroll du sien');
  assert.match(f, />\s*4\b/, 'la marge de tolerance a disparu');
});

v('un element cache ou detache n est pas poursuivi', () => {
  /* ⛔ `nan-walks-through-every-bound` voisin : sans ces gardes, on scrollerait vers un element qui
   *   n est plus dans la page, ou on releverait une exception a chaque tentative. */
  assert.match(f, /el\.hidden/, 'un profil referme continuerait d etre poursuivi');
  assert.match(f, /catch \(_\)/, 'un element detache ferait remonter une exception');
});

assert.equal(n, 7, 'compte de cas inattendu : ' + n);
console.log('ok lien-partage-amene-au-block — ' + n + ' cas : le scroll est reaffirme, borne,');
console.log('   instantane, et il se tait des que l utilisateur bouge.');
console.log('⚠️ NE PROUVE PAS que le visiteur reste : seulement qu il voit ce pour quoi il a clique.');
