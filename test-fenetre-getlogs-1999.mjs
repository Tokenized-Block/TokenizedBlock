// test-fenetre-getlogs-1999.mjs — la fenetre eth_getLogs suit la limite MESUREE du noeud (2000), pas sa moitie.
// ⛔ Mesure 2026-10-01 (Claude, re-mesuree par le Grok Bot) : mainnet.base.org sert 2000 blocs et refuse 3000
//   (« eth_getLogs is limited to a 2,000 range ») ; publicnode sert 3000. 999 doublait donc les requetes.
// ⛔ Le faux noeud ci-dessous se comporte comme mainnet.base.org : il REFUSE toute fenetre de plus de 2000 blocs.
//   Il compte les requetes d un balayage de 43 200 blocs (la fenetre de la map et de « My blocks »).
import assert from 'node:assert/strict';
import { listerCreations, FENETRE_MAX } from './index-blocks.js';

let n = 0;
assert.ok(Number.isInteger(FENETRE_MAX), 'FENETRE_MAX entier'); n++;
assert.ok(FENETRE_MAX <= 2000, 'FENETRE_MAX ' + FENETRE_MAX + ' > 2000 : mainnet.base.org refuserait chaque fenetre'); n++;
assert.ok(FENETRE_MAX >= 1500, 'FENETRE_MAX ' + FENETRE_MAX + ' : on paie a nouveau ~2x trop de getLogs pour la meme plage'); n++;

const appels = [];
const rpc = async (methode, params) => {
  if (methode === 'eth_blockNumber') return '0x' + (52049395).toString(16);
  if (methode !== 'eth_getLogs') throw new Error('methode inattendue ' + methode);
  const de = parseInt(params[0].fromBlock, 16), a = parseInt(params[0].toBlock, 16);
  appels.push([de, a]);
  if (a - de + 1 > 2000) { const e = new Error('eth_getLogs is limited to a 2,000 range'); e.code = -32614; throw e; }
  return [];
};
const r = await listerCreations({ rpc, blocs: 43200 });
assert.equal(r.fenetresRatees.length, 0, r.fenetresRatees.length + ' fenetre(s) refusee(s) par un noeud a 2000'); n++;
assert.ok(appels.length <= 23, appels.length + ' getLogs pour 43 200 blocs (attendu <= 23 ; 999 en faisait 44)'); n++;
/* couverture exacte, sans trou ni recouvrement */
const tri = [...appels].sort((x, y) => x[0] - y[0]);
for (let i = 1; i < tri.length; i++) { assert.equal(tri[i][0], tri[i - 1][1] + 1, 'trou ou recouvrement'); n++; }
assert.equal(tri[tri.length - 1][1], 52049395, 'la tete est lue'); n++;
console.log('test-fenetre-getlogs-1999 :', n, 'assertions OK —', appels.length, 'getLogs pour 43 200 blocs, fenetre', FENETRE_MAX);
