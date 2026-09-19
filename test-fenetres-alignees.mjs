// listerTransfers : fenetres ALIGNEES sur FENETRE_MAX (2026-09-19, charge RPC).
// Prouve : couverture exacte de [debut, dernier], aucun recouvrement, aucun trou, fenetres basses alignees
// (donc identiques d une lecture a l autre, cachables), et le meme transfert n est jamais compte deux fois.
import assert from 'node:assert/strict';
import { listerTransfers, FENETRE_MAX } from './index-blocks.js';

const TOKEN = '0xb200000000000000000000df3ffcd9be89b3843c';
const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (a) => '0x' + a.slice(2).padStart(64, '0');
let n = 0;

async function fenetresPour(dernier, blocs, logsA = []) {
  const vues = [];
  const rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x' + dernier.toString(16);
    const de = parseInt(p[0].fromBlock, 16), a = parseInt(p[0].toBlock, 16);
    vues.push([de, a]);
    return logsA.filter((b) => b >= de && b <= a).map((b) => ({ blockNumber: '0x' + b.toString(16), transactionHash: '0x' + b.toString(16).padStart(64, '0'),
      logIndex: '0x0', topics: [TOPIC, pad('0x0000000000000000000000000000000000000001'), pad('0x0000000000000000000000000000000000000002')], data: '0x' + (1n).toString(16).padStart(64, '0') }));
  };
  const r = await listerTransfers({ rpc, token: TOKEN, blocs });
  return { vues, r };
}

for (const [dernier, blocs] of [[51522617, 8000], [51520000, 8000], [51521999, 2000], [1500, 8000], [51522617, 1]]) {
  const { vues, r } = await fenetresPour(dernier, blocs);
  const debut = Math.max(0, dernier - blocs);
  const tri = [...vues].sort((x, y) => x[0] - y[0]);
  assert.equal(tri[0][0], debut, 'commence a debut'); n++;
  assert.equal(tri[tri.length - 1][1], dernier, 'finit a dernier'); n++;
  for (let i = 1; i < tri.length; i++) { assert.equal(tri[i][0], tri[i - 1][1] + 1, 'jointif sans recouvrement ni trou'); n++; }
  for (const [de, a] of tri) { assert.ok(a - de + 1 <= FENETRE_MAX, 'fenetre <= FENETRE_MAX'); n++; }
  for (const [de] of tri.slice(1)) { assert.equal(de % FENETRE_MAX, 0, 'fenetres alignees'); n++; }
  assert.equal(r.fenetresRatees.length, 0); n++;
}
// stabilite : deux lectures a 30 blocs d ecart partagent toutes les fenetres sauf celle du haut
{
  const a = (await fenetresPour(51522617, 8000)).vues.map(String);
  const b = (await fenetresPour(51522647, 8000)).vues.map(String);
  const communes = a.filter((x) => b.includes(x)).length;
  assert.ok(communes >= a.length - 2, 'fenetres basses reutilisables : ' + communes + '/' + a.length); n++;
}
// un transfert pile sur une borne n est compte qu une fois (l ancien decoupage le lisait deux fois)
{
  const { r } = await fenetresPour(51522617, 8000, [51520000, 51518000]);
  assert.equal(r.transfers.length, 2, 'deux transferts, pas quatre'); n++;
}
console.log('test-fenetres-alignees :', n, 'assertions OK');
