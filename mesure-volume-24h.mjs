/* MESURE — LE VOLUME REEL DES 24 h PRECEDANT LE BLOC DE FORK, sur les pools du graphe multipool.
 *
 *   node mesure-volume-24h.mjs [graphe.json] [actions-pools.json]
 *
 * ⛔ Source : les evenements Swap LUS sur la chaine (eth_getLogs sur un RPC public d archive), de
 *   (bloc - 43 200) a bloc (Base : 2 s par bloc, donc 24 h). Pas un agregateur.
 *   - Uniswap V3 / Slipstream : Swap(address,address,int256,int256,uint160,uint128,int24) sur l adresse de pool ;
 *   - Uniswap V4 : Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24) du PoolManager, filtre par poolId.
 *   Volume $ = |montant du cote devise (USDC / OUSD / ETH)| x prix MESURE de la devise ; une pool
 *   sans cote devise (block/block) est comptee avec le prix agrege du block et MARQUEE.
 * ⛔ Sert a la projection de revenu : c est le volume qui a EXISTE, pas celui qu on capterait. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { topic } from './keccak.js';
import { ADRESSES, noeud } from './multipool.js';

const RPCS = (process.env.RPCS || 'https://base-mainnet.public.blastapi.io,https://base.gateway.tenderly.co,https://base.api.onfinality.io/public').split(',');
const GRAPHE = process.argv[2] || '/workspace/mp-data/graphe.json';
const AP = process.argv[3] || '/workspace/mp-data/actions-pools.json';
const T_V3 = topic('Swap(address,address,int256,int256,uint160,uint128,int24)');
const T_V4 = topic('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)');
const dors = (ms) => new Promise((r) => setTimeout(r, ms));
let k = 0, erreurs = 0, derniereErreur = '';
async function rpc(method, params) {
  for (let t = 0; t < 6; t += 1) {
    const u = RPCS[(k++) % RPCS.length];
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) });
      const j = await r.json();
      if (j.error) { erreurs += 1; derniereErreur = String(j.error.message || '') + ' ' + String(j.error.data || '').slice(0, 160); await dors(800 * (t + 1)); continue; }
      return j.result;
    } catch (_) { erreurs += 1; await dors(800 * (t + 1)); }
  }
  return null;
}
const g = JSON.parse(readFileSync(GRAPHE, 'utf8'));
const ap = existsSync(AP) ? JSON.parse(readFileSync(AP, 'utf8')) : { pools: [], prix: {} };
const FIN = g.bloc, DEBUT = g.bloc - 43200;
const bas = (a) => String(a || '').toLowerCase();
const ETH = ADRESSES.ETH, USDC = ADRESSES.USDC, OUSD = ADRESSES.OUSD;
const PRIX = { [USDC]: 1, [ETH]: (ap.prix && ap.prix[ETH]) || g.noeuds.find((n) => n.adr === ETH).prixMesure, [OUSD]: (ap.prix && ap.prix[OUSD]) || 1 };
if (!(PRIX[ETH] > 0)) throw new Error('prix ETH non mesure');
const DEC = { [USDC]: 6, [ETH]: 18, [OUSD]: 6 };
const N = new Map(g.noeuds.map((n) => [n.adr, n]));
const s2i = (h) => { const v = BigInt('0x' + h); return v >= 1n << 255n ? v - (1n << 256n) : v; };
const s2i128 = (h) => { const v = BigInt('0x' + h) & ((1n << 128n) - 1n); return v >= 1n << 127n ? v - (1n << 128n) : v; };
/* les pools : toutes les aretes du graphe + toutes les pools d actions mesurees */
const pools = new Map();
for (const e of g.aretes) pools.set(e.id, { ...e, origine: 'graphe' });
for (const p of ap.pools || []) if (p.arete && !pools.has(p.id)) pools.set(p.id, { ...p.arete, origine: 'actions', action: p.action, devise: p.devise });
console.log('=== VOLUME 24 h (blocs ' + DEBUT + ' -> ' + FIN + ') sur ' + pools.size + ' pools ===');
/* ⛔ Le RPC public Tenderly limite eth_getLogs a 1 000 blocs. On lit donc 44 tranches de 1 000 blocs,
 *   et pour CHAQUE tranche DEUX requetes seulement : (a) toutes les pools V3/Slipstream en un tableau
 *   d adresses (meme topic Swap), (b) le PoolManager V4 filtre par la liste des poolIds en topic1.
 *   Une tranche qui echoue apres 6 essais est COMPTEE (tranchesPerdues) et le volume est alors un minimum. */
const TAILLE = Number(process.env.TRANCHE || 1000);
/* ⛔ « Query returned more than 20000 results » : on COUPE la tranche en deux, recursivement (pas d echantillonnage) */
async function logsDecoupes(filtre, x, y, prof = 0) {
  for (let t = 0; t < 5; t += 1) {
    const u = RPCS[(k++) % RPCS.length];
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: k, method: 'eth_getLogs', params: [{ ...filtre, fromBlock: '0x' + x.toString(16), toBlock: '0x' + y.toString(16) }] }) });
      const j = await r.json();
      if (!j.error) return j.result;
      erreurs += 1; derniereErreur = String(j.error.message || '') + ' ' + String(j.error.data || '').slice(0, 160);
      if (/more than|too many|range/i.test(derniereErreur) && y > x && prof < 12) {
        const m = Math.floor((x + y) / 2);
        const a = await logsDecoupes(filtre, x, m, prof + 1); if (a === null) return null;
        const b = await logsDecoupes(filtre, m + 1, y, prof + 1); if (b === null) return null;
        return a.concat(b);
      }
    } catch (e) { erreurs += 1; derniereErreur = String(e.message); }
    await dors(800 * (t + 1));
  }
  return null;
}
const tranches = []; for (let b = DEBUT; b <= FIN; b += TAILLE) tranches.push([b, Math.min(b + TAILLE - 1, FIN)]);
const liste = [...pools.values()];
const parAdr = new Map(), parId = new Map();
for (const p of liste) { if (p.venue === 'uniswap-v4') parId.set(bas(p.id), p); else parAdr.set(bas(p.pool), p); }
const acc = new Map(liste.map((p) => [p, { a0: 0n, a1: 0n, n: 0 }]));
let tranchesPerdues = 0, k2 = 0;
const adrs = [...parAdr.keys()], ids = [...parId.keys()];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (k2 < tranches.length) {
    const [x, y] = tranches[k2++];
    const fb = '0x' + x.toString(16), tb = '0x' + y.toString(16);
    for (const [filtre, v4] of [[{ address: adrs, fromBlock: fb, toBlock: tb, topics: [T_V3] }, false], [{ address: ADRESSES.POOL_MANAGER, fromBlock: fb, toBlock: tb, topics: [T_V4, ids] }, true]]) {
      if ((v4 && !ids.length) || (!v4 && !adrs.length)) continue;
      const logs = await logsDecoupes(filtre, x, y);
      if (logs === null) { tranchesPerdues += 1; console.log('  ⚠️ tranche ' + fb + '-' + tb + (v4 ? ' V4' : ' V3/CL') + ' PERDUE : ' + derniereErreur); continue; }
      for (const l of logs) {
        const p = v4 ? parId.get(bas(l.topics[1])) : parAdr.get(bas(l.address));
        if (!p) continue;
        const d = l.data.slice(2);
        const q0 = v4 ? s2i128(d.slice(0, 64)) : s2i(d.slice(0, 64));
        const q1 = v4 ? s2i128(d.slice(64, 128)) : s2i(d.slice(64, 128));
        const s = acc.get(p); s.a0 += q0 < 0n ? -q0 : q0; s.a1 += q1 < 0n ? -q1 : q1; s.n += 1;
      }
    }
    if (k2 % 10 === 0) console.log('  ... tranche ' + k2 + '/' + tranches.length + ' · erreurs rpc ' + erreurs + ' · tranches perdues ' + tranchesPerdues);
  }
}));
const res = [];
for (const p of liste) {
  const v4 = p.venue === 'uniswap-v4';
  const [t0, t1] = v4 ? [noeud(p.cle.currency0), noeud(p.cle.currency1)] : [noeud(p.token0), noeud(p.token1)];
  const { a0, a1, n } = acc.get(p);
  let usd = null, cote = null;
  for (const [t, a] of [[t0, a0], [t1, a1]]) if (PRIX[t] && usd === null) { usd = Number(a) / 10 ** DEC[t] * PRIX[t]; cote = t; }
  if (usd === null) { const n0 = N.get(t0), d0 = n0 && n0.dec; const pr = n0 && n0.ligne && n0.ligne.prixUsd; usd = pr && d0 !== null && d0 !== undefined ? Number(a0) / 10 ** d0 * pr : null; cote = usd === null ? null : t0 + ' (prix agrege)'; }
  res.push({ id: p.id, venue: p.venue, fee: v4 ? p.cle.fee : (p.fee ?? null), hook: p.hook || null, t0, t1, swaps: n, volumeUsd: usd === null ? null : +usd.toFixed(2), cote, origine: p.origine });
}
const somme = (f) => res.filter(f).reduce((s, r) => s + (r.volumeUsd || 0), 0);
const estB = (a) => { const n = N.get(a); return !!n && n.classe === 'block'; };
const ACT = new Set([...(ap.actions || []).map((x) => x.adr), ...g.noeuds.filter((n) => n.classe === 'action').map((n) => n.adr)]);
const estA = (a) => ACT.has(a);
const resume = {
  debut: DEBUT, fin: FIN, pools: res.length, poolsAvecSwaps: res.filter((r) => r.swaps > 0).length, tranches: tranches.length, tranchesPerdues, lu: new Date().toISOString(), erreursRpc: erreurs,
  volumeTotalUsd: +somme(() => true).toFixed(0),
  volumePoolsDeBlocksUsd: +somme((r) => estB(r.t0) || estB(r.t1)).toFixed(0),
  /* ⛔ trois familles DISJOINTES : (1) pool qui touche un block ; (2) pool action (sans block) ; (3) le coeur (ETH/USDC/OUSD/B20 devises) */
  volumePoolsActionsUsd: +somme((r) => !estB(r.t0) && !estB(r.t1) && (estA(r.t0) || estA(r.t1))).toFixed(0),
  volumeCoeurUsd: +somme((r) => !estB(r.t0) && !estB(r.t1) && !estA(r.t0) && !estA(r.t1)).toFixed(0),
  parPool: undefined,
  volumeNosHooksUsd: +somme((r) => r.hook && !String(r.hook).startsWith('tiers')).toFixed(0),
};
writeFileSync('/workspace/mp-data/volume-24h.json', JSON.stringify({ resume, pools: res.sort((x, y) => (y.volumeUsd || 0) - (x.volumeUsd || 0)) }, null, 1));
console.log(JSON.stringify(resume, null, 1));
