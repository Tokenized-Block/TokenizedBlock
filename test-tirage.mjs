// test-tirage.mjs — l ecran promet « the same chance — 1 in N ». On le mesure.
import assert from 'node:assert/strict';
import { tirageUniforme } from './tirage.js';

let n = 0;
const ok = (nom, f) => { f(); n++; console.log('  ok', nom); };

ok('entrees invalides : -1, jamais un indice invente', () => {
  for (const x of [0, -3, 1.5, NaN, Infinity, '7', null]) assert.equal(tirageUniforme(x), -1);
});

ok('n = 1 : toujours 0', () => {
  for (let i = 0; i < 50; i++) assert.equal(tirageUniforme(1), 0);
});

ok('uniforme mesure : 7 candidats, 700 000 tirages, chaque part a moins de 0,5 point de 1/7', () => {
  const N = 7, T = 700000, c = new Array(N).fill(0);
  for (let i = 0; i < T; i++) c[tirageUniforme(N)]++;
  for (const k of c) assert.ok(Math.abs(k / T - 1 / N) < 0.005, 'part ' + (k / T).toFixed(4));
});

ok('le rejet de queue est REEL : une source qui tombe dans la queue est rejetee, pas repliee', () => {
  /* n = 3 : limite = floor(2^32/3)*3 = 4294967295. La valeur 4294967295 est dans la queue -> doit etre REJETEE. */
  const valeurs = [0xffffffff, 5];
  let k = 0;
  const r = tirageUniforme(3, (t) => { t[0] = valeurs[k++]; });
  assert.equal(k, 2, 'la premiere valeur (dans la queue) a ete rejetee, la seconde utilisee');
  assert.equal(r, 5 % 3);
});

ok('temoin : sans rejet, le modulo naif serait biaise — on le montre, pour que le test ne se compare pas a lui-meme', () => {
  /* n = 3 sur 2^32 : l indice 0 a UN antecedent de plus que 1 et 2 en modulo naif */
  const naif = (v) => v % 3;
  assert.equal(naif(0xffffffff), 0);
});

console.log('test-tirage:', n, 'cas, exit 0');
