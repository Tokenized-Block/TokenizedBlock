/* mesure-pools-actions-20261025.mjs — LA TABLE POOLS_ACTIONS_AERODROME RE-MESUREE, ET LES CANDIDATES DU RECENSEMENT (lecture seule).
 * Pour chaque action de la table + chaque candidate (registre, unites > 0, hors table) : routeAction (actions-chaine.js) — la MEME
 * fonction que le serveur — au MEME bloc epingle : pools USDC de la factory de notre routeur, USDC tenus, liquidite, devis de 10 USDC
 * contre le prix moyen. Temoin : une entree de table dont la pool n est plus celle que choisit routeAction est DITE (pas corrigee ici).
 * RPC : base-rpc.publicnode.com seulement (bloc recent : pas d archive). Rien n est signe ni envoye.
 * Usage : node mesure-pools-actions-20261025.mjs [sortie.json] */
import { writeFileSync } from 'node:fs';
import { routeAction, lireUnites } from './actions-chaine.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { ACTIONS_COINBASE } from './paires.js';

const RPC = 'https://base-rpc.publicnode.com';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
async function rpc(m, p) {
  for (let k = 0; k < 6; k += 1) {
    n += 1;
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: n, method: m, params: p }) });
      if (r.status === 429 || r.status >= 500) { await pause(1000 * (k + 1)); continue; }
      const j = await r.json();
      if (j.error) { if (/rate|limit/i.test(j.error.message)) { await pause(1000 * (k + 1)); continue; } throw new Error(j.error.message); }
      return j.result;
    } catch (e) { if (k === 5 || /revert|execution/i.test(e.message)) throw e; await pause(800 * (k + 1)); }
  }
  throw new Error('no answer');
}
const bloc = parseInt(await rpc('eth_blockNumber', []), 16);
const blocHex = '0x' + bloc.toString(16);
const appel = (to, data) => rpc('eth_call', [{ to, data }, blocHex]);
const rpcBloc = (m, p) => rpc(m, m === 'eth_call' ? [p[0], blocHex] : p);

const lignes = [];
const cibles = [...ACTIONS_COINBASE.map((a) => [String(a.adr).toLowerCase(), a.symbole])];
for (const [adr, sym] of cibles) {
  const t = POOLS_ACTIONS_AERODROME.get(adr) || null;
  const u = await lireUnites({ rpc: rpcBloc, adr });
  if (!t && !(u > 0n)) continue; /* sans unites et hors table : rien a acheter, pas de lecture de pool */
  const v = await routeAction({ appel, adr });
  const l = { sym, adr, table: !!t, unites: u === null ? null : String(u), etat: v.etat, achetable: v.achetable ?? null, code: v.code || null,
    pool: v.pool || null, tickSpacing: v.tickSpacing ?? null, usdc: v.usdcPool ? Math.round(Number(v.usdcPool) / 1e6) : null, ecartBps: v.ecartBps ?? null,
    pourquoi: v.pourquoi || null };
  if (t) { l.poolTable = t.pool; l.tsTable = t.tickSpacing; l.memePool = v.pool === t.pool && v.tickSpacing === t.tickSpacing; l.usdcTable = t.usdcMesure; }
  lignes.push(l);
  console.log([sym, t ? 'TABLE' : 'hors', v.etat, v.achetable ? 'ACHETABLE' : v.code, v.pool || '', 'ts' + (v.tickSpacing ?? '-'), (l.usdc ?? '-') + ' USDC', (l.ecartBps ?? '-') + ' bps', t ? (l.memePool ? '= table' : '≠ TABLE ' + t.pool) : ''].join('  '));
}
const res = { bloc, rpc: RPC, requetes: n, lignes,
  table: { n: lignes.filter((l) => l.table).length, memePool: lignes.filter((l) => l.table && l.memePool).length, achetables: lignes.filter((l) => l.table && l.achetable).length },
  horsTable: { n: lignes.filter((l) => !l.table).length, achetables: lignes.filter((l) => !l.table && l.achetable).map((l) => l.sym) } };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(res, null, 1));
console.log(JSON.stringify({ bloc, requetes: n, table: res.table, horsTable: res.horsTable }));
