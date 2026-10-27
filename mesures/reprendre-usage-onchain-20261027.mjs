/* reprendre-usage-onchain-20261027.mjs -- RE-READ the ranges the full run left unread (mesures/usage-onchain-20261027.json `nonLus`),
 * in smaller windows, with the SAME balayerFenetre / ligneDeTx / compter. Read-only (no signing, no key).
 * The ranges that are still refused stay in `nonLus` (never counted as empty); the pass is recorded under `reprise`.
 * usage: node mesures/reprendre-usage-onchain-20261027.mjs [rpcUrl] */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECONDES_PAR_BLOC, balayerFenetre, ligneDeTx, compter } from '../usage-onchain.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const FICHIER = path.join(ICI, 'usage-onchain-20261027.json');
const RPC = process.argv[2] || 'https://base-rpc.publicnode.com';
const PAS = 10000;
const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function rpc(m, p) {
  for (let k = 0; k < 7; k += 1) {
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }), signal: AbortSignal.timeout(60000) });
      if (r.status === 429 || r.status >= 500) throw Object.assign(new Error('HTTP ' + r.status), { relance: true });
      const j = await r.json();
      if (j.error) { const e = new Error(String(j.error.message)); if (/rate|limit reached|too many requests|internal/i.test(e.message) && !/range|exceed/i.test(e.message)) e.relance = true; throw e; }
      return j.result;
    } catch (e) { if (!e.relance && !/abort|timeout|fetch failed/i.test(String(e.name + e.message))) throw e; await attendre(1500 * 2 ** k); }
  }
  throw new Error('gave up after retries');
}

async function main() {
  const J = JSON.parse(readFileSync(FICHIER, 'utf8'));
  const tete = J.fin.bloc, tsTete = J.fin.ts;
  const tsDe = (b) => tsTete - (tete - b) * SECONDES_PAR_BLOC;
  /* the distinct unread block ranges (several queries can share one) */
  const plages = [...new Map(J.nonLus.map((u) => [u.de + '-' + u.a, [u.de, u.a]])).values()].sort((x, y) => x[0] - y[0]);
  const pools = new Map(J.poolsSurNosHooks.map((p) => [p.id, { c0: p.c0, c1: p.c1, hook: p.hook }]));
  const avantPools = pools.size;
  const hashes = new Set();
  const nonLus = [];
  for (const [de0, a0] of plages) {
    for (let de = de0; de <= a0; de += PAS) {
      const a = Math.min(a0, de + PAS - 1);
      const r = await balayerFenetre({ rpc, de, a, pools, min: 1000 });
      for (const h of r.hashes) hashes.add(h);
      nonLus.push(...r.nonLus);
      console.log('re-read', de, a, 'txs', hashes.size, 'still unread', nonLus.length);
    }
  }
  const connus = new Set(J.lignes.map((l) => l.h));
  const nouvelles = [];
  for (const h of hashes) {
    if (connus.has(h)) continue;
    const tx = await rpc('eth_getTransactionByHash', [h]);
    const recu = await rpc('eth_getTransactionReceipt', [h]);
    const ts = recu ? tsDe(parseInt(recu.blockNumber, 16)) : null;
    const jour = ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null;
    const p = jour && J.prixEthParJour[jour];
    const l = ligneDeTx({ tx: tx || { hash: h }, recu, pools, ethUsd: p && p.usd, ts });
    if (!l.refus) nouvelles.push({ h: l.h, b: l.b, ts: l.ts, from: l.from, cats: l.cats, usd: Math.round(l.usd * 1e6) / 1e6, nonPrice: l.nonPrice });
    else J.refusDetail.push({ h, refus: l.refus, to: tx && tx.to, from: tx && tx.from, b: recu && parseInt(recu.blockNumber, 16) });
  }
  J.reprise = { quand: new Date().toISOString(), rpc: RPC, pas: PAS, plagesRelues: plages, nonLusAvant: J.nonLus.length, nonLusApres: nonLus.length,
    txsTrouvees: hashes.size, lignesNouvelles: nouvelles.length, poolsNouveaux: pools.size - avantPools };
  J.nonLus = nonLus;
  J.poolsSurNosHooks = [...pools.entries()].map(([id, p]) => ({ id, ...p }));
  J.lignes = [...J.lignes, ...nouvelles].sort((x, y) => x.b - y.b);
  J.resultats = compter(J.lignes, { finTs: tsTete });
  writeFileSync(FICHIER, JSON.stringify(J, null, 1));
  console.log(JSON.stringify({ reprise: J.reprise, resultats: J.resultats }, null, 1));
}
main().catch((e) => { console.error('FAILED', e && e.stack || e); process.exitCode = 1; });
