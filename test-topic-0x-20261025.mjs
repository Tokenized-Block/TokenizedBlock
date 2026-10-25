// 2026-10-25 : /sante montrait 176 erreurs d archive « invalid argument 0: hex string without 0x prefix », toutes
// sur « route /api/holders/:adr », forme topics ["0x66", "dec64"]. Cause : soldes-jeton.js `mot()` rendait le mot
// de 64 caracteres SANS « 0x » et lireNaissance le passait tel quel comme topic. publicnode le tolere, le noeud
// d archive Coinbase le refuse. Les faux noeuds des bancs existants ne regardaient que le NOMBRE de topics,
// jamais leur forme : le defaut leur etait invisible.
// Ce banc : un faux noeud STRICT (comme Coinbase) refuse tout topic hors /^0x[0-9a-f]{64}$/.
// Borne : il prouve la forme envoyee par lireNaissance et passeIncrementale, pas le comportement d un vrai noeud.
import assert from 'node:assert/strict';
import * as S from './soldes-jeton.js';

const JETON = '0xb20000000000000000000000000000000000abcd';
const TOPIC = /^0x[0-9a-f]{64}$/;
let ok = 0, ko = 0;
async function cas(nom, f) { try { await f(); ok++; console.log('ok  ' + nom); } catch (e) { ko++; console.log('KO  ' + nom + ' : ' + e.message); } }

const vus = [];
function rpcStrict(logs) {
  return async (methode, params) => {
    if (methode !== 'eth_getLogs') throw new Error('methode inattendue ' + methode);
    const f = params[0];
    for (const t of f.topics || []) {
      vus.push(t);
      if (t !== null && !TOPIC.test(t)) throw new Error('invalid argument 0: hex string without 0x prefix');
    }
    const de = parseInt(f.fromBlock, 16), a = parseInt(f.toBlock, 16);
    return logs.filter((l) => parseInt(l.blockNumber, 16) >= de && parseInt(l.blockNumber, 16) <= a);
  };
}
const mot = (a) => '0x' + a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const mint = { blockNumber: '0x3e8', logIndex: '0x0', transactionHash: '0x' + '1'.repeat(64),
  topics: [S.TOPIC_TRANSFER, mot(S.ADRESSE_ZERO), mot('0x' + '2'.repeat(40))], data: '0x' + '5'.padStart(64, '0') };

await cas('T1 lireNaissance envoie des topics 0x-prefixes et trouve le mint sur un noeud strict', async () => {
  const r = await S.lireNaissance({ rpc: rpcStrict([mint]), jeton: JETON, depuis: 1, jusqua: 3000 });
  assert.ok(vus.length > 0, 'aucun topic vu : le banc ne prouve rien');
  for (const t of vus) assert.match(t, TOPIC, 'topic envoye hors forme : ' + t);
  assert.equal(r.etat, 'LUE', 'etat ' + r.etat + ' sur un noeud strict');
  assert.equal(r.bloc, 1000);
});

await cas('T2 temoin : le noeud strict refuse bien un topic sans 0x', async () => {
  await assert.rejects(rpcStrict([])('eth_getLogs', [{ topics: ['0'.repeat(64)], fromBlock: '0x1', toBlock: '0x2' }]), /0x prefix/);
});

console.log(ok + ' ok, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
