/* test-bridge-actifs-proposes.mjs — ON NE PROPOSE PAS D ECHANGER CE QUI NE S ECHANGE PAS.
 *
 * ⛔⛔ DECISION DE PHIL, 2026-09-24 : « retirer le TBLOCK de la, car le coin est pas reellement lance
 *     au public ». Il parlait du selecteur « From » du Swap via Bridge.
 *   ⇒ MESURE INDEPENDANTE FAITE LE MEME JOUR, qui va dans le meme sens : TBLOCK est l un des 7
 *     jetons detenus par le wallet de frais, et AUCUN des 7 n a de marche vivant (croise avec les
 *     268 marches suivis par /api/trending). Le proposer comme monnaie d echange revient a proposer
 *     d echanger quelque chose qui ne s echange pas — et l utilisateur ne le decouvrirait qu apres
 *     avoir choisi.
 *
 * ⛔ CE QUE CE TEST GARDE VRAIMENT : que les DEUX listes du Bridge (la dynamique et le repli code en
 *   dur) disent la meme chose. C est le motif `single-and-batch-twins-diverge` : filtrer l une en
 *   oubliant l autre rend le correctif invisible exactement quand la premiere echoue, donc au pire
 *   moment possible.
 *
 * ⛔ CE QU IL NE PROUVE PAS : que les autres actifs proposes ont, eux, un marche. Le drapeau est une
 *    DECLARATION portee a la main sur une entree ; ce test verifie qu elle est RESPECTEE, pas
 *    qu elle est exacte pour tous les actifs.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { DEVISES_BASE, proposableEnEchange, TBLOCK_MAINNET } from './paires.js';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const src = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('TBLOCK est marque comme non lance publiquement', () => {
  const t = DEVISES_BASE.find((p) => p.symbole === 'TBLOCK');
  assert.ok(t, 'l entree TBLOCK a disparu de DEVISES_BASE : ce test ne garde plus rien');
  assert.equal(t.lancePubliquement, false, 'TBLOCK n est plus marque non-lance : il reviendrait dans les listes');
  assert.equal(String(t.adr).toLowerCase(), String(TBLOCK_MAINNET).toLowerCase());
});

v('le filtre retire TBLOCK et RIEN D AUTRE', () => {
  /* ⛔⛔ LE CAS QUI EMPECHE LE CORRECTIF DE TROP COUPER. Un filtre trop large viderait le selecteur
   *     entier — un panneau vide serait bien pire que le defaut corrige. On verifie les DEUX cotes :
   *     ce qui doit partir part, ce qui doit rester reste. */
  const retires = DEVISES_BASE.filter((p) => !proposableEnEchange(p)).map((p) => p.symbole);
  assert.deepEqual(retires, ['TBLOCK'], 'actifs retires inattendus : ' + retires.join(', '));
  const gardes = DEVISES_BASE.filter(proposableEnEchange).map((p) => p.symbole);
  for (const doitRester of ['ETH', 'USDC', 'cbBTC']) {
    assert.ok(gardes.includes(doitRester), doitRester + ' a ete retire par erreur : le selecteur se viderait');
  }
  assert.ok(gardes.length >= 3, 'seulement ' + gardes.length + ' actif(s) proposable(s) : filtre trop large');
});

v('fail-open assume : une entree SANS drapeau reste proposable', () => {
  /* ⛔ Exiger le drapeau ferait disparaitre les dizaines d entrees existantes qui n en portent pas.
   *   Le defaut doit etre « lance », et seul l explicite retire. */
  assert.equal(proposableEnEchange({ symbole: 'X' }), true);
  assert.equal(proposableEnEchange({ symbole: 'Y', lancePubliquement: true }), true);
  assert.equal(proposableEnEchange({ symbole: 'Z', lancePubliquement: false }), false);
  /* une entree illisible ne doit pas faire disparaitre un actif sans raison */
  assert.equal(proposableEnEchange(null), true);
});

v('⛔ la liste DYNAMIQUE du Bridge applique le filtre', () => {
  const i = src.indexOf('function peindreBridgeActifs(');
  assert.ok(i > 0, 'peindreBridgeActifs introuvable : ce test ne garde plus rien');
  const corps = src.slice(i, i + 1600);
  assert.match(corps, /\.filter\(\s*proposableEnEchange\s*\)/,
    'la liste dynamique du Bridge ne filtre pas : TBLOCK y revient');
});

v('⛔ la liste de REPLI ne contient plus TBLOCK', () => {
  /* ⛔⛔ LE JUMEAU. Le repli sert quand la liste dynamique echoue ; y laisser TBLOCK code en dur
   *     rendrait le correctif inoperant precisement dans ce cas. */
  const i = src.indexOf('function peindreBridgeActifs(');
  const corps = src.slice(i, i + 1600);
  const repli = corps.slice(corps.indexOf('if (!opts.length)'));
  assert.ok(repli.length > 20, 'la liste de repli est introuvable');
  assert.doesNotMatch(repli, /TBLOCK/,
    'TBLOCK est encore code en dur dans la liste de repli du Bridge');
  assert.match(repli, /ETH/, 'le repli ne propose plus rien : un selecteur vide');
});

v('le module app.html importe bien le filtre', () => {
  /* ⛔ `garde-sur-element-absent-toujours-fausse` : sans l import, `proposableEnEchange` serait
   *    indefini et `.filter(undefined)` jetterait — le catch avalerait tout et on retomberait
   *    silencieusement sur le repli. Le defaut serait invisible. */
  assert.match(src, /import\s*\{[^}]*proposableEnEchange[^}]*\}\s*from\s*'\.\/paires\.js'/,
    "app.html n importe pas proposableEnEchange : le filtre jetterait et le repli prendrait la main");
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok bridge-actifs-proposes — ' + n + ' cas : TBLOCK retire des DEUX listes, '
  + DEVISES_BASE.filter(proposableEnEchange).length + ' actifs restent proposables.');
console.log('⚠️ NE PROUVE PAS que les autres actifs ont un marche : le drapeau est declare, pas mesure.');
