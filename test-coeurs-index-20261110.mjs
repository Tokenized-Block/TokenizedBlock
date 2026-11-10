/* test-coeurs-index-20261110.mjs — the hearts index never skips a window, and counts a re-read log once. */
import { creerIndexCoeurs, LIKES_DEPLOY_BLOC } from './coeurs-index.js';
import { TOPIC_LIKED } from './coeurs.js';

let ok = 0, ko = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { ko++; console.log('KO', m, '\n   got', JSON.stringify(a), '\n  want', JSON.stringify(b)); } };
const LIKES = '0x343a289d5469a17726be9a0d219ee00721646f8a';
const pad = (a) => '0x' + a.slice(2).padStart(64, '0');
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const lg = (bn, idx = 0) => ({ address: LIKES, topics: [TOPIC_LIKED, pad('0x0'), pad('0xb200000000000000000000000000000000000001'), pad('0x00000000000000000000000000000000000a11ce')],
  data: '0x' + u(1) + u(86000n * 10n ** 18n), blockNumber: '0x' + bn.toString(16), transactionHash: '0x' + bn.toString(16).padStart(64, '0'), logIndex: '0x' + idx.toString(16) });

function fauxNoeud({ tete, logs, panne = new Set() }) {
  const appels = [];
  const rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x' + tete.toString(16);
    const a = Number(BigInt(p[0].fromBlock)), b = Number(BigInt(p[0].toBlock));
    appels.push([a, b]);
    if (panne.has(a)) { panne.delete(a); throw new Error('rate limited'); }
    return logs.filter((l) => { const n = Number(BigInt(l.blockNumber)); return n >= a && n <= b; });
  };
  return { rpc, appels };
}

eq(LIKES_DEPLOY_BLOC, 55600255, 'starts at the deploy block measured on mainnet');
{
  const n = fauxNoeud({ tete: 1000 + 4999, logs: [lg(1500), lg(3500), lg(5999)], panne: new Set([3000]) });
  const ix = creerIndexCoeurs({ rpc: n.rpc, likes: LIKES, depuis: 1000, fenetre: 1000, parPasse: 10 });
  await ix.avancer();
  eq([ix.etat.prochain, ix.coeurs().length, ix.complet(), ix.etat.trou && ix.etat.trou.de], [3000, 1, false, 3000], 'a failed window stops the pass ON it: cursor stays, hole said, not complete');
  await ix.avancer();
  eq([ix.etat.prochain, ix.coeurs().length, ix.complet(), ix.etat.trou], [6000, 3, true, null], 'next pass re-reads the failed window: nothing lost, complete');
  eq(n.appels.filter(([a]) => a === 3000).length, 2, 'the failed window was asked twice, never skipped');
}
{
  const n = fauxNoeud({ tete: 3999, logs: [lg(1500)] });
  const ix = creerIndexCoeurs({ rpc: n.rpc, likes: LIKES, depuis: 1000, fenetre: 1000, parPasse: 1 });
  await ix.avancer();
  eq([ix.etat.prochain, ix.complet()], [2000, false], 'parPasse bounds one pass');
  await ix.avancer(); await ix.avancer();
  eq([ix.coeurs().length, ix.complet()], [1, true], 'three passes reach the head, still one heart');
}
{
  const n = fauxNoeud({ tete: 1999, logs: [lg(1500), lg(1500)] });
  const ix = creerIndexCoeurs({ rpc: n.rpc, likes: LIKES, depuis: 1000, fenetre: 1000 });
  await ix.avancer();
  eq(ix.coeurs().length, 1, 'the same log twice (same tx + index) counts once');
}
{
  const rpc = async (m) => { if (m === 'eth_blockNumber') throw new Error('down'); return []; };
  const ix = creerIndexCoeurs({ rpc, likes: LIKES, depuis: 1000 });
  await ix.avancer();
  eq([ix.complet(), ix.etat.prochain, !!ix.etat.trou], [false, 1000, true], 'head unread: not complete, cursor unchanged, hole said');
}
{
  const rpc = async (m) => (m === 'eth_blockNumber' ? '0x7cf' : { not: 'a list' });
  const ix = creerIndexCoeurs({ rpc, likes: LIKES, depuis: 1000 });
  await ix.avancer();
  eq([ix.etat.prochain, ix.complet(), ix.etat.trou && ix.etat.trou.a], [1000, false, 1999], 'a non-list answer is not "no heart": the window is read again, and named');
}
{
  /* the head is not on a window edge: the last window stops AT the head, and the blocks after it are read later, not skipped */
  let tete = 1499; const logs = [lg(1700)];
  const rpc = async (m, p) => { if (m === 'eth_blockNumber') return '0x' + tete.toString(16); const a = Number(BigInt(p[0].fromBlock)), b = Number(BigInt(p[0].toBlock)); return logs.filter((l) => { const x = Number(BigInt(l.blockNumber)); return x >= a && x <= b; }); };
  const ix = creerIndexCoeurs({ rpc, likes: LIKES, depuis: 1000, fenetre: 1000 });
  await ix.avancer();
  eq([ix.etat.prochain, ix.complet()], [1500, true], 'stops at the head (1499), not at the window edge');
  tete = 2600; await ix.avancer();
  eq(ix.coeurs().length, 1, 'the heart at 1700, after the old head, is found');
  /* the node goes down after a complete index: no longer called complete */
  let bas = false;
  const ix2 = creerIndexCoeurs({ rpc: async (m) => { if (m === 'eth_blockNumber') { if (bas) throw new Error('down'); return '0x7cf'; } return []; }, likes: LIKES, depuis: 1000, fenetre: 1000 });
  await ix2.avancer(); const avant = ix2.complet(); bas = true; await ix2.avancer();
  eq([avant, ix2.complet()], [true, false], 'head unread after being complete: said not complete');
}
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
