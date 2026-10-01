/* test-note-carte-ne-grandit-plus.mjs — LE PANNEAU DE LA MAP NE S ALLONGE PLUS A CHAQUE PASSE.
 *
 * ⛔⛔ LE DEFAUT (Raksha, 2026-10-01) : le texte d info de la map grandissait sans fin, et « x/N »
 *     ne s accordait pas avec « on map N ». Mesure du Grok Bot (Chrome headless, prod) :
 *       +20 s   « 349 blocks made … · on map 349 (life read for the first 30) »
 *       +160 s  « … · on map 349 (life read for the first 30) · life read on 30 more (30/238 so far…) »
 *     CAUSES : `lireLaVie` faisait `n.textContent = (n.textContent || '') + …` (une phrase de plus
 *     toutes les 90 s), et « on map 349 » restait le chiffre fige de `charger()`.
 * ⛔ CE FICHIER EXECUTE LA VRAIE PHRASE de fin de passe (extraite de `lireLaVie`, app.html depouille de
 *   ses commentaires) et la vraie `noteCarteSansPasse`, sur dix passes de suite.
 * ⛔⛔ TEMOINS NEGATIFS : l ajout sans fin remis, la reecriture de « on map » retiree, le suffixe
 *   « retried » oublie — chacun fait tomber un cas (mutations dans le message du commit).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';

let n = 0;
const cas = (t, f) => { n += 1; try { f(); console.log('  ok  ' + t); } catch (e) { console.error('✗ ' + t); throw e; } };
const nu = sansCommentaires(readFileSync(new URL('./app.html', import.meta.url), 'utf8'), { minRetire: 5000 });

const dF = nu.indexOf('function noteCarteSansPasse(');
const fF = nu.indexOf('\n}\n', dF);
assert.ok(dF > 0 && fF > dF, 'noteCarteSansPasse introuvable');
const noteCarteSansPasse = new Function(nu.slice(dF, fF + 2) + '\nreturn noteCarteSansPasse;')();

const dL = nu.indexOf('async function lireLaVie(');
const dM = nu.indexOf('n.textContent = ', dL);
const fM = nu.indexOf(';\n}', dM);
assert.ok(dL > 0 && dM > dL && fM > dM, 'phrase de fin de passe introuvable');
const phrase = nu.slice(dM + 'n.textContent = '.length, fM);
const ecrire = new Function('n', 'cible', 'lot', 'lus', 'faits', 'surLaCarte', 'avecMarche', 'nonLus', 'noteCarteSansPasse',
  'n.textContent = ' + phrase + ';');
assert.match(nu.slice(dL, fM), /const surLaCarte = habitants\.length;/, '« x/N » ne lit plus le nombre du moment');
assert.match(nu.slice(dL, fM), /const faits = Math\.min\(vieCurseur, surLaCarte\);/);

const BASE = '349 blocks made in the last 43,200 chain blocks · on map 349 (life read for the first 30)';
const passe = (el, { cible = null, lot = [], lus = 30, faits, sur, avec = 29, nonLus = 0 }) =>
  ecrire(el, cible, lot, lus, faits, sur, avec, nonLus, noteCarteSansPasse);

cas('⛔⛔⛔ DIX PASSES : le texte ne s allonge pas, une seule phrase de passe a l ecran', () => {
  const el = { textContent: BASE };
  const longueurs = [];
  for (let i = 1; i <= 10; i++) { passe(el, { faits: i * 30, sur: 238 }); longueurs.push(el.textContent.length); }
  assert.equal((el.textContent.match(/life read on/g) || []).length, 1, el.textContent);
  assert.ok(Math.max(...longueurs) - Math.min(...longueurs) <= 2, 'le texte grandit : ' + longueurs.join(','));
});

cas('⛔⛔ « on map N » ET « x/N » DISENT LE MEME N, celui du moment ou l on ecrit', () => {
  const el = { textContent: BASE };
  passe(el, { faits: 30, sur: 238 });
  assert.match(el.textContent, / · on map 238 · life read on 30 more \(30\/238 so far, still going\)/, el.textContent);
  assert.doesNotMatch(el.textContent, /on map 349/);
  passe(el, { faits: 60, sur: 386 });
  const m = /on map (\d+)[^]*\((\d+)\/(\d+) so far/.exec(el.textContent);
  assert.ok(m && m[1] === m[3] && m[1] === '386', el.textContent);
});

cas('⛔⛔ UNE PASSE « retried » REMPLACE AUSSI, et une passe normale ensuite la remplace a son tour', () => {
  const el = { textContent: BASE };
  for (let i = 0; i < 4; i++) passe(el, { cible: new Set(['a', 'b']), lot: ['a', 'b'], faits: 30, sur: 238 });
  assert.equal((el.textContent.match(/retried /g) || []).length, 1, el.textContent);
  passe(el, { faits: 60, sur: 238 });
  assert.doesNotMatch(el.textContent, /retried /);
  assert.equal((el.textContent.match(/life read on/g) || []).length, 1);
});

cas('⛔ CE QUI N EST PAS A NOUS RESTE : « window(s) unread » et une reponse de recherche ne sont pas coupes', () => {
  const el = { textContent: BASE + ' · 2 window(s) unread — this map is incomplete' };
  passe(el, { faits: 30, sur: 240 });
  passe(el, { faits: 60, sur: 240 });
  assert.match(el.textContent, /2 window\(s\) unread — this map is incomplete · life read on/);
  const r = { textContent: 'No block named “XYZ” among the 312 read here.' };
  passe(r, { faits: 30, sur: 240 });
  assert.ok(r.textContent.startsWith('No block named “XYZ” among the 312 read here. · life read on'), r.textContent);
});

cas('⛔ TEMOIN : la phrase dit encore qui a un marche et qui est illisible (rien de perdu)', () => {
  const el = { textContent: BASE };
  passe(el, { faits: 30, sur: 238, avec: 12, nonLus: 3 });
  assert.match(el.textContent, /— 12 with a market, 3 unreadable right now \(not the same as having no market\)$/);
});

console.log(n + ' cas OK — test-note-carte-ne-grandit-plus');
