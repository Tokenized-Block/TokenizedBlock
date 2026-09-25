/* test-paire-action-payable.mjs — UN BLOCK APPAIRE A UNE ACTION DOIT POUVOIR NAITRE.
 *
 * ⛔⛔ CE QUI BLOQUAIT, mesure du 2026-09-25. Un block appaire a une action Coinbase se lance en
 *     UNILATERAL : sur le plan reel (INTCc, valo 5) `etat = APPROBATIONS`, `ethRequis = 0`,
 *     `tx.value = 0x0`. Il n y a AUCUN seed a financer — `lancer-pool.js` le dit lui-meme,
 *     « Instant Birth only pairs against native ETH ».
 *     Or le preflight ramenait tout `seed <= 0n` au plancher : il exigeait ~0,0018 ETH au lieu de
 *     ~0,0013, REFUSAIT des comptes qui avaient de quoi payer, et nommait dans son message une
 *     depense qui n arrive jamais.
 *
 * ⛔ LA DISTINCTION EST TOUTE LA CORRECTION : `null` = « je n ai pas su lire le seed » ; `0n` = « il
 *   n y en a pas ». Les confondre, c est traiter une absence mesuree comme une lecture ratee — le
 *   meme motif que « pas de marche » vs « marche illisible », trouve trois fois dans cette session.
 *
 * ⛔ ET LE CHAMP « ETH seed » RESTAIT VISIBLE ET REMPLI sur une paire action : un montant annonce,
 *   jamais paye, juste au-dessus du bouton qui ouvre le wallet. `estNaissanceInstantaneeUi()`
 *   existait exactement pour ca — et n etait appelee nulle part. Du code mort ecrit pour ce defaut.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : qu une naissance appairee a une action aboutit sur la chaine.
 *   Le harnais interdit toute signature. Ce qui est garde, c est qu on ne la refuse plus pour une
 *   depense qui n existe pas, et qu on n en annonce pas une.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('⛔⛔ `0n` ne retombe plus au plancher, `null` si', () => {
  /* ⛔⛔ LE CAS CENTRAL. Un seul `<=` separait « payable » de « refuse ». */
  const i = html.indexOf('async function preflightInstantBirthEthFixe(');
  assert.ok(i > 0, 'le preflight est introuvable : ce test ne garde plus rien');
  const f = html.slice(i, i + 2600);
  assert.doesNotMatch(f, /if \(seed == null \|\| seed <= 0n\) seed = CREATE_FEE_WEI_FLOOR;/,
    'un seed de zero explicite retombe de nouveau au plancher : les creations appairees a une '
    + 'action seront refusees pour un montant qu elles ne depenseront jamais');
  assert.match(f, /if \(seed == null\) seed = CREATE_FEE_WEI_FLOOR;/,
    'une lecture ratee du seed ne retombe plus au plancher : le garde-fou saute dans l autre sens');
  assert.match(f, /else if \(seed < 0n\) seed = CREATE_FEE_WEI_FLOOR;/,
    'un seed negatif — donc aberrant — n est plus ramene au plancher');
});

v('⛔ Create passe un seed de zero EXPLICITE pour une paire action', () => {
  const i = html.indexOf('const sansSeed = !!(paireChoisie && paireChoisie.type === \'ACTION\')');
  assert.ok(i > 0, 'Create ne distingue plus la paire action au preflight');
  const f = html.slice(i, i + 260);
  assert.match(f, /seedWei: 0n/,
    'le seed de zero n est plus passe explicitement : on retombe sur le plancher par defaut');
});

v('⛔⛔ le champ « ETH seed » se cache quand il ne sert pas', () => {
  /* ⛔⛔ Un montant affiche qu on ne prendra pas est la forme la plus chere de malentendu, et il
   *     s affichait juste au-dessus du bouton qui ouvre le wallet. */
  const i = html.indexOf('const seedUtile = estNaissanceInstantaneeUi();');
  assert.ok(i > 0, 'le champ du seed n est plus pilote : il redevient visible sur une paire action');
  const f = html.slice(i, i + 420);
  assert.match(f, /\$\('#plQuoteWrap'\)\.hidden = !seedUtile/, 'le champ ne se cache plus');
  assert.match(f, /\$\('#plQuoteHint'\)\.hidden = !seedUtile/, 'l explication du seed ne se cache plus');
  assert.match(f, /\$\('#plQuoteEth'\)\.value = ''/,
    'le champ n est plus vide quand il devient inutile : une valeur residuelle pourrait etre relue');
});

v('⛔ le helper prevu pour ca est enfin APPELE', () => {
  /* ⛔⛔ Il existait, il portait le bon nom, et il ne servait a rien : du code mort ecrit pour ce
   *     defaut precis. Une fonction jamais appelee fait croire que le cas est couvert. */
  assert.match(html, /function estNaissanceInstantaneeUi\(\)/, 'le helper a disparu');
  const appels = [...html.matchAll(/estNaissanceInstantaneeUi\(\)/g)].length;
  assert.ok(appels >= 2,
    'estNaissanceInstantaneeUi n est appele nulle part (' + appels + ' occurrence) : il redevient '
    + 'du code mort, et le champ du seed redevient visible a tort');
});

assert.equal(n, 4, 'compte de cas inattendu : ' + n);
console.log('ok paire-action-payable — ' + n + ' cas : un seed de zero est une MESURE, pas une');
console.log('   lecture ratee, et le champ du seed disparait quand il ne sert pas.');
console.log('⚠️ NE PROUVE PAS qu une naissance appairee a une action aboutit sur la chaine : le');
console.log('   harnais interdit toute signature. Ce qui est garde, c est qu on ne la refuse plus');
console.log('   pour une depense inexistante.');
