/* MESURE — LE GRAPHE COMPLET DES POOLS, LU SUR LA CHAINE (fork Base epingle).
 *
 *   PORT_FORK=8599 node mesure-multipool-graphe.mjs [sortie.json]
 *
 * ⛔ LA DECOUVERTE ET LA PREUVE SONT SEPAREES. Les CANDIDATS viennent de trois sources :
 *     1. /api/trending (nos 245 lignes servies) et /api/cle/<adr> (cles V4 lues par NOTRE serveur
 *        sur l evenement Initialize) ;
 *     2. DexScreener /token-pairs (adresse de pool V3 / Slipstream, poolId V4) — un AGREGATEUR ;
 *     3. un balayage EXHAUSTIF factory par factory entre les devises « coeur » (pas d agregateur).
 *   Une arete n entre dans le graphe QUE si la chaine la confirme : factory() connue, jetons lus,
 *   liquidite > 0, et un DEVIS non nul dans au moins un sens. Le reste est compte et nomme.
 */
import { writeFileSync } from 'node:fs';
import { ADRESSES, devisSaut, noeud } from './multipool.js';
import { selecteur, mot, motAdr, motSigne, poolId, cleDePool } from './pool.js';
import { ACTIONS_COINBASE, DEVISES_BASE } from './paires.js';
import { TBLOCK, TBGAS, HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8 } from './tokenomics.js';

const PORT = process.env.PORT_FORK || '8599';
const URL = 'http://127.0.0.1:' + PORT;
const SITE = 'https://tokenizedblock.space';
const SORTIE = process.argv[2] || '/workspace/mp-data/graphe.json';
const dors = (ms) => new Promise((r) => setTimeout(r, ms));
const bas = (a) => String(a || '').toLowerCase();
let id = 0, erreursAmont = 0, appelsPerdus = 0, appelsTimeout = 0;
async function rpc(m, p) {
  for (let t = 0; t < 4; t += 1) {
    try {
      const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(Number(process.env.TIMEOUT_MS || 90000)), body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
      const j = await r.json();
      if (j.error) {
        /* ⛔ un 429 du noeud amont N EST PAS un « pas de pool » : on reessaie, puis on COMPTE l erreur */
        if (/429|rate limit|Max retries|Transport/i.test(j.error.message || '') && t < 3) { erreursAmont += 1; await dors(4000 * (t + 1)); continue; }
        const e = new Error(j.error.message); e.rpc = true; e.amont = /429|rate limit|Max retries|Transport/i.test(j.error.message || ''); throw e;
      }
      return j.result;
    } catch (e) { if (e.rpc) throw e; if (e && e.name === 'TimeoutError') { appelsTimeout += 1; const x = new Error('TIMEOUT'); x.rpc = true; x.amont = true; throw x; } await dors(500 * (t + 1)); }
  }
  throw new Error('transport');
}
const call = async (to, data) => { try { return await rpc('eth_call', [{ to, data }, 'latest']); } catch (e) { if (!e.rpc || e.amont) appelsPerdus += 1; return null; } };
const w = (r, i = 0) => (r && r.length >= 2 + 64 * (i + 1) ? BigInt('0x' + r.slice(2 + 64 * i, 66 + 64 * i)) : null);
const a = (r, i = 0) => (r && r.length >= 2 + 64 * (i + 1) ? '0x' + r.slice(26 + 64 * i, 66 + 64 * i) : null);
async function getJson(u) {
  for (let t = 0; t < 3; t += 1) {
    try { const r = await fetch(u); if (r.status === 429) { await dors(3000); continue; } return await r.json(); } catch (_) { await dors(1000); }
  }
  return null;
}

const NOS_HOOKS = new Map([[HOOK_PREVU, 'V1'], [HOOK_V2, 'V2'], [HOOK_V3, 'V3'], [HOOK_V4, 'V4'], [HOOK_V5, 'V5'], [HOOK_V6, 'V6'], [HOOK_V7, 'V7'], [HOOK_V8, 'V8']].map(([k, v]) => [bas(k), v]));

console.log('=== GRAPHE MULTIPOOL — fork ' + URL + ' ===');
const bloc = parseInt(await rpc('eth_blockNumber', []), 16);
{ /* ⛔ ETAT VIERGE : un banc passe sur ce fork mine des blocs locaux et deplace les pools. Mesurer apres
   *   lui, c est mesurer NOTRE etat, pas celui de Base. On exige bloc courant == bloc de fork. */
  let fi = null; try { fi = await rpc('anvil_nodeInfo', []); } catch (_) { /* */ }
  const fb = fi && fi.forkConfig && Number(fi.forkConfig.forkBlockNumber);
  if (fb && bloc !== fb && process.env.ACCEPTER_ETAT_MODIFIE !== '1') { console.log('KO : le fork a mine ' + (bloc - fb) + ' bloc(s) local(aux) depuis ' + fb + ' — etat modifie, redemarrer le fork. NON MESURE'); process.exit(1); }
}
const chainId = parseInt(await rpc('eth_chainId', []), 16);
if (chainId !== 8453) { console.log('KO pas Base'); process.exit(1); }
console.log('bloc ' + bloc);
/* ⛔⛔ TEMOIN B20 : un anvil STANDARD rend OpcodeNotFound sur les actions tokenisees et les blocks
 *   (code 0xef, precompile Base). Sans ce temoin, chaque devis qui touche un B20 serait un faux
 *   « pas de pool ». Il faut base-anvil --base. */
{
  let d = null; try { d = await rpc('eth_call', [{ to: '0xb200000000000000000000c2e324d24d7eecd1fb', data: '0x313ce567' }, 'latest']); } catch (e) { d = 'ERR ' + e.message; }
  if (!d || !/^0x[0-9a-f]{64}$/.test(d)) { console.log('KO ce fork ne sait pas executer un B20 (' + String(d).slice(0, 60) + ') : il faut base-anvil --base. NON MESURE'); process.exit(1); }
  console.log('temoin B20 : AAPLc.decimals() lu (' + BigInt(d) + ') -> le fork execute les precompiles B20');
}

/* ── 1. LES NOEUDS ─────────────────────────────────────────────────────────────────────────── */
const trending = await getJson(SITE + '/api/trending');
const nos = await getJson(SITE + '/api/nos-blocks');
const noeuds = new Map();
const ajouter = (adr, info) => { const k = noeud(adr); if (!/^0x[0-9a-f]{40}$/.test(k)) return; noeuds.set(k, { ...(noeuds.get(k) || {}), ...info, adr: k }); };
for (const d of DEVISES_BASE.filter((d) => d.chaines.includes(8453))) ajouter(d.adr, { sym: d.symbole, classe: d.symbole === 'TBLOCK' ? 'block' : 'coeur' });
ajouter(TBGAS, { sym: 'TBGAS', classe: 'block' });
for (const s of ACTIONS_COINBASE) ajouter(s.adr, { sym: s.symbole, classe: 'action' });
for (const l of (trending && trending.lignes) || []) {
  if (!noeuds.has(noeud(l.adr))) ajouter(l.adr, { sym: l.sym, classe: 'block' });
  noeuds.get(noeud(l.adr)).ligne = { prixUsd: l.prixUsd, liquiditeUsd: l.liquiditeUsd, volume24hUsd: l.volume24hUsd, quoteAdr: bas(l.quoteAdr), quoteSym: l.quoteSym, dex: l.dex, poolAdr: l.poolAdr, emetteur: !!l.emetteur };
  const q = noeud(l.quoteAdr);
  if (!noeuds.has(q)) ajouter(q, { sym: l.quoteSym, classe: /^0xb2/.test(q) ? 'devise-b20' : 'devise' });
}
for (const b of (nos && nos.blocks) || []) if (!noeuds.has(noeud(b))) ajouter(b, { sym: null, classe: 'block', nosBlocks: true });
for (const b of (nos && nos.blocks) || []) noeuds.get(noeud(b)).nosBlocks = true;
console.log('noeuds ' + noeuds.size + ' (trending ' + ((trending && trending.lignes) || []).length + ')');

/* ⛔ PARALLELE BORNE : les phases sur la chaine passent par `par(n)`. Un appel PERDU (429 apres
 *   reessais) est COMPTE (appelsPerdus) — jamais lu comme « pas de pool ». */
async function par(items, n, fn) {
  const it = [...items]; let k = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(n, it.length) }, async () => { while (k < it.length) { const x = it[k++]; await fn(x); if (k % 500 === 0) console.log('  ... ' + k + '/' + it.length + ' en ' + Math.round((Date.now() - t0) / 1000) + ' s · perdus ' + appelsPerdus + ' · 429 reessayes ' + erreursAmont); } }));
}
const CONC = Number(process.env.CONC || 6);
/* ── 2. CANDIDATS : /api/cle (V4) et DexScreener (V3, Slipstream, poolIds V4) ───────────────── */
const candV4 = new Map(), candPool = new Map();
let nCle = 0, nDs = 0;
const CACHE = '/workspace/mp-data/candidats.json';
const { existsSync, readFileSync } = await import('node:fs');
if (process.env.CANDIDATS_CACHE && existsSync(CACHE)) {
  const c = JSON.parse(readFileSync(CACHE, 'utf8'));
  for (const [k, v] of c.v4) candV4.set(k, v);
  for (const [k, v] of c.pools) candPool.set(k, v);
  for (const [k, p] of c.prixDs || []) if (noeuds.get(k)) noeuds.get(k).prixDs = p;
  nCle = c.nCle; nDs = c.nDs;
  console.log('candidats relus du cache ' + CACHE + ' (lu ' + c.lu + ')');
} else {
  await par([...noeuds.keys()].filter((k) => k !== ADRESSES.ETH), 3, async (k) => {
    const c = await getJson(SITE + '/api/cle/' + k); nCle += 1;
    for (const cle of (c && c.cles) || []) candV4.set(bas(cle.poolId), { ...cle, source: 'api/cle' });
    const ds = await getJson('https://api.dexscreener.com/token-pairs/v1/base/' + k); nDs += 1;
    for (const p of Array.isArray(ds) ? ds : []) {
      const pa = bas(p.pairAddress);
      const t0 = noeud(p.baseToken && p.baseToken.address), t1 = noeud(p.quoteToken && p.quoteToken.address);
      if (!noeuds.has(t0) || !noeuds.has(t1)) continue;
      const liq = p.liquidity && Number(p.liquidity.usd);
      if (pa.length === 66) { if (!candV4.has(pa)) candV4.set(pa, { poolId: pa, source: 'dexscreener', liqDs: liq }); else candV4.get(pa).liqDs = liq; }
      else if (pa.length === 42) candPool.set(pa, { pool: pa, dexId: p.dexId, labels: (p.labels || []).join(','), liqDs: liq });
      if (p.priceUsd && noeuds.get(t0) && !noeuds.get(t0).prixDs) noeuds.get(t0).prixDs = Number(p.priceUsd);
    }
    await dors(300);
  });
  writeFileSync(CACHE, JSON.stringify({ lu: new Date().toISOString(), nCle, nDs, v4: [...candV4], pools: [...candPool], prixDs: [...noeuds].map(([k, n]) => [k, n.prixDs || null]) }));
}
console.log('candidats V4 ' + candV4.size + ' · pools adresse ' + candPool.size + ' (api/cle ' + nCle + ', dexscreener ' + nDs + ')');

/* ── 3. BALAYAGE EXHAUSTIF ENTRE NOEUDS NON-BLOCK (sans agregateur) ─────────────────────────── */
const coeur = [...noeuds.values()].filter((n) => n.classe !== 'block').map((n) => n.adr);
const sGetPoolV3 = selecteur('getPool(address,address,uint24)'), sGetPoolCl = selecteur('getPool(address,address,int24)');
const tok = (x) => (x === ADRESSES.ETH ? ADRESSES.WETH : x);
const taches = [];
for (let i = 0; i < coeur.length; i += 1) for (let j = i + 1; j < coeur.length; j += 1) {
  const x = tok(coeur[i]), y = tok(coeur[j]);
  for (const f of [100, 500, 3000, 10000]) taches.push([ADRESSES.FACTORY_V3, '0x' + sGetPoolV3 + motAdr(x) + motAdr(y) + mot(f), 'balayage-v3']);
  for (const fac of [ADRESSES.FACTORY_CL3, ADRESSES.FACTORY_CL2]) for (const ts of [1, 10, 50, 100, 200, 2000]) taches.push([fac, '0x' + sGetPoolCl + motAdr(x) + motAdr(y) + motSigne(ts), 'balayage-cl']);
  for (const kp of [{ fee: 100, tickSpacing: 1 }, { fee: 500, tickSpacing: 10 }, { fee: 3000, tickSpacing: 60 }, { fee: 10000, tickSpacing: 200 }]) {
    const cle = cleDePool(coeur[i], coeur[j], kp);
    const pid = bas(poolId(cle));
    /* ⛔ BUG CORRIGE 2026-10-02 : un poolId deja vu SANS cle (DexScreener ne donne que l id) n etait pas
     *   complete par le balayage, puis rejete en « v4SansCle » — c est ainsi que la pool OUSD/USDC v4
     *   (fee 100, ts 1, sans hook, liquidite 1,56e16) manquait au graphe. On complete la cle. */
    const deja = candV4.get(pid);
    if (!deja || !deja.currency0) candV4.set(pid, { ...(deja || {}), poolId: pid, currency0: bas(cle.currency0), currency1: bas(cle.currency1), fee: kp.fee, tickSpacing: kp.tickSpacing, hooks: ADRESSES.ETH, source: deja ? deja.source + '+cle-balayage' : 'balayage-v4' });
  }
}
console.log('balayage : ' + coeur.length + ' noeuds non-block, ' + taches.length + ' getPool');
await par(taches, CONC, async ([to, data, source]) => {
  const p = a(await call(to, data));
  if (p && !/^0x0{40}$/.test(p)) candPool.set(bas(p), { ...(candPool.get(bas(p)) || {}), pool: bas(p), source: (candPool.get(bas(p)) || {}).source || source });
});
console.log('apres balayage : V4 ' + candV4.size + ' · pools adresse ' + candPool.size + ' · appels perdus ' + appelsPerdus);

/* ── 4. PREUVE SUR LA CHAINE ────────────────────────────────────────────────────────────────── */
const aretes = [], rejets = { v4SansCle: 0, v4SansLiquidite: 0, poolFactoryInconnue: 0, poolSansLiquidite: 0, horsGraphe: 0 };
const sLiq = selecteur('getLiquidity(bytes32)'), sSlot = selecteur('getSlot0(bytes32)');
await par([...candV4], CONC, async ([pid, c]) => {
  if (!c.currency0) { rejets.v4SansCle += 1; return; }
  if (!noeuds.has(noeud(c.currency0)) || !noeuds.has(noeud(c.currency1))) { rejets.horsGraphe += 1; return; }
  const liq = w(await call(ADRESSES.STATE_VIEW, '0x' + sLiq + pid.slice(2)));
  const sq = w(await call(ADRESSES.STATE_VIEW, '0x' + sSlot + pid.slice(2)));
  if (!liq || liq === 0n || !sq) { rejets.v4SansLiquidite += 1; return; }
  const hooks = bas(c.hooks);
  aretes.push({ venue: 'uniswap-v4', id: pid, cle: { currency0: bas(c.currency0), currency1: bas(c.currency1), fee: Number(c.fee), tickSpacing: Number(c.tickSpacing), hooks },
    hook: hooks === ADRESSES.ETH ? null : (NOS_HOOKS.get(hooks) || 'tiers'), liquidite: liq.toString(), source: c.source, liqDs: c.liqDs ?? null });
});
const S = (s) => '0x' + selecteur(s);
await par([...candPool], CONC, async ([p, c]) => {
  const fac = a(await call(p, S('factory()')));
  const t0 = a(await call(p, S('token0()'))), t1 = a(await call(p, S('token1()')));
  if (!fac || !t0 || !t1) { rejets.poolFactoryInconnue += 1; return; }
  if (!noeuds.has(noeud(t0)) || !noeuds.has(noeud(t1))) { rejets.horsGraphe += 1; return; }
  const liq = w(await call(p, S('liquidity()')));
  if (!liq || liq === 0n) { rejets.poolSansLiquidite += 1; return; }
  if (bas(fac) === ADRESSES.FACTORY_V3) {
    const f = Number(w(await call(p, S('fee()'))));
    aretes.push({ venue: 'uniswap-v3', id: p, pool: p, fee: f, token0: bas(t0), token1: bas(t1), liquidite: liq.toString(), source: c.source || 'dexscreener', liqDs: c.liqDs ?? null });
  } else if (bas(fac) === ADRESSES.FACTORY_CL3 || bas(fac) === ADRESSES.FACTORY_CL2) {
    let ts = Number(w(await call(p, S('tickSpacing()'))));
    if (ts > 0x7fffff) ts -= 0x1000000;
    aretes.push({ venue: 'aerodrome-cl', id: p, pool: p, tickSpacing: ts, factory: bas(fac) === ADRESSES.FACTORY_CL3 ? 3 : 2, token0: bas(t0), token1: bas(t1), liquidite: liq.toString(), source: c.source || 'dexscreener', liqDs: c.liqDs ?? null });
  } else { rejets.poolFactoryInconnue += 1; c.factory = bas(fac); }
});
console.log('aretes prouvees ' + aretes.length + ' · rejets ' + JSON.stringify(rejets) + ' · appels perdus ' + appelsPerdus);

/* ── 5. PRIX ET PROFONDEUR : un devis de 100 $ et de 1 000 $ dans CHAQUE sens ─────────────────── */
const dec = new Map([[ADRESSES.ETH, 18]]);
await par([...noeuds.keys()].filter((k) => k !== ADRESSES.ETH), CONC, async (k) => { const d = w(await call(k, S('decimals()'))); dec.set(k, d === null ? null : Number(d)); noeuds.get(k).dec = d === null ? null : Number(d); });
noeuds.get(ADRESSES.ETH).dec = 18;
const prix = (k) => { const n = noeuds.get(k); if (!n) return null; if (k === ADRESSES.USDC) return 1; return (n.ligne && n.ligne.prixUsd) || n.prixDs || null; };
{
  const e = aretes.filter((x) => x.venue === 'uniswap-v4' && x.cle.currency0 === ADRESSES.ETH && x.cle.currency1 === ADRESSES.USDC && !x.hook);
  let best = 0n;
  for (const x of e) { const q = devisSaut({ de: ADRESSES.ETH, vers: ADRESSES.USDC, e: x }, 10n ** 16n); const o = w(await call(q.to, q.data)); if (o && o > best) best = o; }
  noeuds.get(ADRESSES.ETH).prixMesure = Number(best) / 1e6 * 100;
  console.log('ETH mesure ' + noeuds.get(ADRESSES.ETH).prixMesure + ' $ (devis 0,01 ETH sur ' + e.length + ' pools v4 ETH/USDC sans hook)');
}
const prixDe = (k) => (k === ADRESSES.ETH ? noeuds.get(ADRESSES.ETH).prixMesure : prix(k));
const unitesPour = (k, usd) => { const p = prixDe(k), d = dec.get(k); if (!p || d === null || d === undefined) return null; return BigInt(Math.floor((usd / p) * 10 ** Math.min(d, 18))) * 10n ** BigInt(Math.max(d - 18, 0)); };
let nDevis = 0;
await par(aretes, CONC, async (e) => {
  const [x, y] = e.venue === 'uniswap-v4' ? [noeud(e.cle.currency0), noeud(e.cle.currency1)] : [noeud(e.token0), noeud(e.token1)];
  e.devis = {};
  for (const [de, vers] of [[x, y], [y, x]]) for (const usd of [100, 1000]) {
    const m = unitesPour(de, usd);
    if (!m || m <= 0n) { e.devis[de.slice(0, 10) + '>' + usd] = { etat: 'PRIX_INCONNU' }; continue; }
    const q = devisSaut({ de, vers, e }, m);
    const o = w(await call(q.to, q.data)); nDevis += 1;
    const pv = prixDe(vers), dv = dec.get(vers);
    const usdOut = o && pv && dv !== null ? Number(o) / 10 ** dv * pv : null;
    e.devis[de.slice(0, 10) + '>' + usd] = { etat: o && o > 0n ? 'OK' : 'REFUSE', entree: m.toString(), sortie: o ? o.toString() : null, retenu: usdOut === null ? null : +(usdOut / usd).toFixed(4) };
  }
  const r1000 = Object.entries(e.devis).filter(([k, v]) => k.endsWith('>1000') && v.retenu !== null && v.retenu !== undefined).map(([, v]) => v.retenu);
  e.retenu1000 = r1000.length ? Math.min(...r1000) : null;
  e.liqUsd = Number.isFinite(e.liqDs) && e.liqDs > 0 ? e.liqDs : (e.retenu1000 !== null && e.retenu1000 > 0.5 ? 1000 / Math.max(1 - e.retenu1000, 0.001) : 0);
});
console.log('devis ' + nDevis);
writeFileSync(SORTIE, JSON.stringify({ bloc, lu: new Date().toISOString(), erreursAmont, appelsPerdus, appelsTimeout, noeuds: [...noeuds.values()], aretes, rejets }, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 1));
console.log('ecrit ' + SORTIE + ' · erreurs amont reessayees ' + erreursAmont + ' · appels PERDUS (non mesures) ' + appelsPerdus);
