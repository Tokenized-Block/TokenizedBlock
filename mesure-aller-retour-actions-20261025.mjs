/* Live, read-only: routeAction (with the round trip) for every seed stock with supply > 0, pinned block, publicnode.
 * Counts calls per route with a cold and a warm pool cache. Usage: node mesure-aller-retour.mjs <out.json> */
import { writeFileSync } from 'node:fs';
import { routeAction, lireUnites, CREATIONS_GRAINE } from './actions-chaine.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
const RPC = process.env.RPC || 'https://base-rpc.publicnode.com';
let n = 0, id = 0;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(m, p) {
  for (let k = 0; k < 6; k += 1) {
    n += 1;
    try {
      const r = await fetch(RPC, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
      if (r.status === 429 || r.status >= 500) { await pause(1000 * (k + 1)); continue; }
      const j = await r.json();
      if (j.error) { if (/rate|limit/i.test(j.error.message)) { await pause(1000 * (k + 1)); continue; } throw new Error(j.error.message); }
      return j.result;
    } catch (e) { if (k === 5 || /revert|execution/i.test(e.message)) throw e; await pause(800 * (k + 1)); }
  }
  throw new Error('no answer');
}
const bloc = parseInt(await rpc('eth_blockNumber', []), 16) - 10;
const tag = '0x' + bloc.toString(16);
let appels = 0;
const appel = async (to, data) => { appels += 1; const r = await rpc('eth_call', [{ to, data }, tag]); if (r === '0x') throw new Error('empty answer'); return r; };
const cache = new Map();
const lignes = [];
for (const [adr, g] of CREATIONS_GRAINE) {
  const u = await (async () => { try { const r = await rpc('eth_call', [{ to: adr, data: '0x18160ddd' }, tag]); return BigInt(r); } catch { return null; } })();
  if (!(u > 0n)) continue;
  const a0 = appels;
  const v = await routeAction({ appel, adr, cachePools: cache, bloc });
  const froid = appels - a0;
  const a1 = appels;
  const v2 = await routeAction({ appel, adr, cachePools: cache, bloc });
  const chaud = appels - a1;
  lignes.push({ sym: g.symbole, adr, table: POOLS_ACTIONS_AERODROME.has(adr), etat: v.etat, achetable: v.achetable ?? null, code: v.code || null,
    ecartBps: v.ecartBps ?? null, perteBps: v.perteBps ?? null, retour: v.retour || null, pool: v.pool || null, tablePool: (POOLS_ACTIONS_AERODROME.get(adr) || {}).pool || null,
    appelsFroid: froid, appelsChaud: chaud, memeVerdict: JSON.stringify([v.achetable, v.code]) === JSON.stringify([v2.achetable, v2.code]) });
}
const res = { bloc, rpc: RPC, requetesHttp: n, appelsRoute: appels, avecUnites: lignes.length,
  achetables: lignes.filter((l) => l.achetable).map((l) => l.sym), lignes };
writeFileSync(process.argv[2] || 'aller-retour.json', JSON.stringify(res, null, 1));
for (const l of lignes) console.log((l.table ? 'T ' : '  ') + l.sym.padEnd(8), l.etat, l.achetable ? 'ACHETABLE' : l.code, 'ecart', l.ecartBps, 'perte', l.perteBps, 'froid', l.appelsFroid, 'chaud', l.appelsChaud, l.pool && l.tablePool && l.pool !== l.tablePool ? 'POOL!=TABLE' : '');
console.log(JSON.stringify({ bloc, avecUnites: lignes.length, achetables: res.achetables.length, requetesHttp: n, appelsRoute: appels }));
