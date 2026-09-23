/* test-pool-la-moins-chere.mjs — A CONFIANCE EGALE, LA ROUTE LA MOINS CHERE GAGNE.
 *
 * ⛔⛔ LE DEFAUT, MESURE SUR LA CHAINE LE 2026-09-23. `poolDecouvertPour` classait les pools par
 *     CONFIANCE seulement. Entre plusieurs pools du meme rang, la PREMIERE rencontree l emportait,
 *     quel que soit son prix. Sur SPIKE (`0xb200…d601`), 7 pools v4 existent :
 *         77,00 %  <- celle que l app proposait
 *         88,73 % · 87,84 % · 50,00 %   (sans hook)
 *         0,00 % x3                     (avec hook)
 *     L app offrait donc un achat a 77 % de frais alors qu une pool a 50 % etait disponible. Le
 *     badge « Fee 77.5% » etait VRAI — c est la ROUTE qui etait mal choisie. On routait un achat
 *     sans regarder ce qu il coute.
 *
 * ⛔ CE TEST EXECUTE LE CODE LIVRE : il extrait le corps de `poolDecouvertPour` d `app.html` et le
 *    fait tourner sur des pools fabriquees. Recopier la logique prouverait la copie.
 * ⛔ CE QU IL NE PROUVE PAS : que la pool choisie soit BONNE. Choisir la moins chere de sept
 *    mauvaises reste un achat a 50 %. Le seuil de refus est une decision produit, pas une garde.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const d = html.indexOf('function poolDecouvertPour(');
assert.ok(d > 0, 'poolDecouvertPour introuvable — cette garde ne protege plus rien');
const fin = html.indexOf('\n}', d);
assert.ok(fin > d, 'fin de fonction introuvable');
const source = html.slice(d, fin + 2);
assert.ok(source.length > 600, 'extraction suspecte : ' + source.length + ' caracteres');
for (const j of ['_score', 'MAX_SAFE_INTEGER', 'confiance']) {
  assert.ok(source.includes(j), 'extraction incomplete, il manque ' + j);
}

/* ⛔ on fournit les dependances que la fonction attend, sans en recopier la logique */
const choisir = new Function('poolsLive', 'estNotreHook', 'confianceDe', 'adr',
  source + '\nreturn poolDecouvertPour(adr);');

const JETON = '0xb200000000000000000000fac1a85ab57681d601';
const NOTRE = '0x5926abdabf5d0006ee960a8270f3e124e5a764cc';
const estNotreHook = (h) => String(h || '').toLowerCase() === NOTRE;
const confianceDe = (cle) => (String(cle.hooks || '').toLowerCase() === '0x0000000000000000000000000000000000000000'
  ? 'SANS_HOOK' : 'HOOK');
const pool = (fee, hooks) => ({ jeton: JETON, cle: { currency0: '0x0000000000000000000000000000000000000000',
  currency1: JETON, fee, tickSpacing: 200, hooks } });
const ZERO = '0x0000000000000000000000000000000000000000';

let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('entre sept pools sans hook, la moins chere gagne (le cas SPIKE reel)', () => {
  const m = new Map([[1, pool(770000, ZERO)], [2, pool(887323, ZERO)], [3, pool(878449, ZERO)],
    [4, pool(500000, ZERO)]].map(([k, p]) => [k, p]));
  const r = choisir(m, estNotreHook, confianceDe, JETON);
  assert.equal(r.cle.fee, 500000, 'la pool choisie coute ' + (r.cle.fee / 10000) + ' % au lieu de 50 %');
});

v('l ordre de rencontre ne decide plus', () => {
  /* ⛔ Le defaut d origine : la PREMIERE gagnait. On presente donc la chere en premier ET en
   *    dernier — les deux doivent rendre la meme reponse. */
  const a = choisir(new Map([[1, pool(770000, ZERO)], [2, pool(30000, ZERO)]]), estNotreHook, confianceDe, JETON);
  const b = choisir(new Map([[1, pool(30000, ZERO)], [2, pool(770000, ZERO)]]), estNotreHook, confianceDe, JETON);
  assert.equal(a.cle.fee, 30000, 'la chere gagne quand elle est presentee en premier');
  assert.equal(b.cle.fee, 30000, 'la chere gagne quand elle est presentee en dernier');
});

v('NOTRE hook passe devant, meme si une autre pool est moins chere', () => {
  /* ⛔ Notre pool est a 0 % de frais de POOL (le hook preleve a part) : la confiance doit rester
   *    prioritaire, sinon ce correctif nous ferait router hors de notre propre marche. */
  const r = choisir(new Map([[1, pool(0, ZERO)], [2, pool(0, NOTRE)]]), estNotreHook, confianceDe, JETON);
  assert.equal(String(r.cle.hooks).toLowerCase(), NOTRE, 'notre hook a perdu la priorite');
  assert.equal(r.isTbFeeHook, true);
});

v('un frais ILLISIBLE ne gagne jamais', () => {
  /* ⛔ `nan-walks-through-every-bound` : sans repli, `NaN < x` est faux mais `x < NaN` aussi —
   *    l ordre deviendrait dependant de la rencontre, c est-a-dire du defaut qu on corrige. */
  for (const mauvais of [undefined, null, NaN, 'beaucoup', {}]) {
    const r = choisir(new Map([[1, pool(mauvais, ZERO)], [2, pool(100000, ZERO)]]), estNotreHook, confianceDe, JETON);
    assert.equal(r.cle.fee, 100000, 'un frais illisible (' + String(mauvais) + ') a gagne');
  }
});

v('une seule pool, meme chere, reste choisie (on ne casse pas le cas simple)', () => {
  const r = choisir(new Map([[1, pool(770000, ZERO)]]), estNotreHook, confianceDe, JETON);
  assert.ok(r && r.cle.fee === 770000, 'la seule pool disponible n est plus rendue');
});

v('aucune pool pour ce jeton : null, pas un repli au hasard', () => {
  const autre = { jeton: '0xb200000000000000000000000000000000000099',
    cle: { currency0: ZERO, currency1: '0xb200000000000000000000000000000000000099', fee: 0, hooks: ZERO } };
  assert.equal(choisir(new Map([[1, autre]]), estNotreHook, confianceDe, JETON), null);
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok pool-la-moins-chere — ' + n + ' cas, fonction extraite d app.html et EXECUTEE');
