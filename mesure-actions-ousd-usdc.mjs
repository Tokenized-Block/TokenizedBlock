/* MESURE — CHAQUE ACTION TOKENISEE DE BASE : sa meilleure pool contre OUSD et contre USDC (et ETH).
 *
 *   PORT_FORK=8599 node mesure-actions-ousd-usdc.mjs [/workspace/mp-data/actions-base.json] [graphe.json]
 *
 * Demande de Raksha (2026-10-01 23:12) : les blocks TB sont des memestocks apparies a TOUTES les
 * actions tokenisees (Coinbase *c B20 ET autres emetteurs), avec OUSD ou USDC comme liquidite de base.
 *   (1) pour chaque action : meilleure pool existante vs OUSD et vs USDC — DEX, palier, liquidite $ MESUREE ;
 *   (2) la route block -> action -> OUSD/USDC et son devis ;
 *   (3) les actions sans profondeur OUSD ni USDC, qui ont besoin de l ETH comme saut.
 *
 * ⛔ SOURCES : la LISTE des actions vient de deux sources hors chaine NOMMEES (stocksonchain.io
 *   /chains/base.md, un annuaire tiers ; api.coinbase.com/v1/tokenized-stocks, l emetteur). Chaque
 *   adresse est ensuite LUE sur la chaine (code, symbol, decimals, totalSupply). Aucune pool n est
 *   prise d un agregateur : on BALAYE les factories (Uniswap V3 x4 paliers, Slipstream f3 et f2 x6
 *   tickSpacings, Uniswap V4 sans hook x4) et on ajoute les cles V4 hookees connues de /api/cle.
 * ⛔ LIQUIDITE $ :
 *   - V3 / Slipstream : TVL = soldes REELS des deux jetons dans la pool x prix. Prix de l action =
 *     devis on-chain de 10 $ de devise -> action sur CETTE pool ; prix de la devise : USDC = 1,
 *     OUSD et ETH = devis on-chain vers USDC.
 *   - V4 : le PoolManager est un singleton, aucun solde par pool n est lisible -> TVL « inconnu » ;
 *     la profondeur est donnee par les devis.
 *   - PROFONDEUR (toutes venues) : devis de 1 000 $ et 10 000 $ dans les DEUX sens ; « retenu » =
 *     valeur recue / valeur donnee. C est le critere de « meilleure pool » (retenu min a 1 000 $).
 * ⛔ Un appel rate est COMPTE (appelsPerdus), jamais lu comme « pas de pool ». */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ADRESSES, devisSaut, noeud, cheminsCandidats, coterChemin, devisesFraisAdmises, placerFrais, decrireChemin } from './multipool.js';
import { selecteur, mot, motAdr, motSigne, poolId, cleDePool } from './pool.js';
import { ACTIONS_COINBASE } from './paires.js';
import { HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8 } from './tokenomics.js';

const PORT = process.env.PORT_FORK || '8599';
const URL = 'http://127.0.0.1:' + PORT;
const LISTE = process.argv[2] || '/workspace/mp-data/actions-base.json';
const GRAPHE = process.argv[3] || '/workspace/mp-data/graphe.json';
const SORTIE = '/workspace/mp-data/actions-pools.json';
const CSV = '/workspace/canal/actions-ousd-usdc-2026-10-01.csv';
const CONC = Number(process.env.CONC || 8);
const bas = (a) => String(a || '').toLowerCase();
const dors = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0, perdus = 0, reessais = 0;
async function rpc(m, p) {
  for (let t = 0; t < 5; t += 1) {
    try {
      const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(Number(process.env.TIMEOUT_MS || 90000)), body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
      const j = await r.json();
      if (j.error) {
        if (/429|rate limit|Max retries|Transport|timed out/i.test(j.error.message || '') && t < 4) { reessais += 1; await dors(3000 * (t + 1)); continue; }
        const e = new Error(j.error.message); e.rpc = true; e.amont = /429|rate limit|Max retries|Transport/i.test(j.error.message || ''); throw e;
      }
      return j.result;
    } catch (e) { if (e.rpc) throw e; if (e && e.name === 'TimeoutError') { const x = new Error('TIMEOUT ' + (Number(process.env.TIMEOUT_MS || 90000) / 1000) + ' s (le devis traverse probablement des ticks vides : profondeur insuffisante)'); x.rpc = true; throw x; } await dors(500 * (t + 1)); }
  }
  throw new Error('transport');
}
const call = async (to, data) => { try { return await rpc('eth_call', [{ to, data }, 'latest']); } catch (e) { if (!e.rpc || e.amont) perdus += 1; return null; } };
const w = (r, i = 0) => (r && r.length >= 2 + 64 * (i + 1) ? BigInt('0x' + r.slice(2 + 64 * i, 66 + 64 * i)) : null);
const a = (r) => (r && r.length >= 66 ? '0x' + r.slice(26, 66) : null);
const S = (s) => '0x' + selecteur(s);
async function par(items, n, fn) { const it = [...items]; let k = 0; await Promise.all(Array.from({ length: Math.min(n, it.length) }, async () => { while (k < it.length) { const x = it[k++]; await fn(x); } })); }
async function getJson(u) { for (let t = 0; t < 3; t += 1) { try { const r = await fetch(u); if (r.status === 429) { await dors(3000); continue; } return await r.json(); } catch (_) { await dors(1000); } } return null; }
function chaine(hex) {
  if (!hex || hex === '0x') return null;
  const b = hex.slice(2);
  try { if (b.length >= 128) { const lg = Number(BigInt('0x' + b.slice(64, 128))); if (lg > 0 && lg <= 64) return Buffer.from(b.slice(128, 128 + lg * 2), 'hex').toString('utf8'); } return Buffer.from(b.slice(0, 64), 'hex').toString('utf8').replace(/\0+/g, '') || null; } catch (_) { return null; }
}
const NOS_HOOKS = new Map([[HOOK_PREVU, 'V1'], [HOOK_V2, 'V2'], [HOOK_V3, 'V3'], [HOOK_V4, 'V4'], [HOOK_V5, 'V5'], [HOOK_V6, 'V6'], [HOOK_V7, 'V7'], [HOOK_V8, 'V8']].map(([k, v]) => [bas(k), v]));

console.log('=== ACTIONS TOKENISEES x OUSD / USDC / ETH — fork ' + URL + ' ===');
const bloc = parseInt(await rpc('eth_blockNumber', []), 16);
{ const d = await call('0xb200000000000000000000c2e324d24d7eecd1fb', '0x313ce567'); if (!d) { console.log('KO : le fork n execute pas les B20 — il faut base-anvil --base. NON MESURE'); process.exit(1); } }
console.log('bloc ' + bloc + ' · temoin B20 ok');

/* ── 1. la liste, puis la chaine ── */
const src = JSON.parse(readFileSync(LISTE, 'utf8'));
const actions = new Map();
for (const x of src.actions) if (!actions.has(x.adr)) actions.set(x.adr, { ...x });
/* docs.base.org (tokenized-stocks-on-base) nomme COINc et INTCc, absents de l API de l emetteur ce soir */
for (const [t, adr] of [['COIN', '0xb200000000000000000000c85a31389d71f3ecfb'], ['INTC', '0xb2000000000000000000004aff16039ba04bdfbc']]) if (!actions.has(adr)) actions.set(adr, { ticker: t, nom: null, emetteur: 'Coinbase (docs.base.org)', adr });
/* Ondo : une seule adresse vue (BaseScan, recherche web) — pas de liste d emetteur pour Base */
if (!actions.has('0x15a1647c3362b1d8d9ece1a0791da070118710fc')) actions.set('0x15a1647c3362b1d8d9ece1a0791da070118710fc', { ticker: 'ONDS', nom: 'Ondas Holdings (Ondo)', emetteur: 'Ondo (1 adresse vue, liste inconnue)', adr: '0x15a1647c3362b1d8d9ece1a0791da070118710fc' });
await par([...actions.values()], CONC, async (x) => {
  const code = await rpc('eth_getCode', [x.adr, 'latest']).catch(() => null);
  x.code = code === null ? 'INCONNU' : code === '0xef' ? 'B20(0xef)' : code === '0x' ? 'VIDE' : 'contrat(' + ((code.length - 2) / 2) + ' o)';
  if (code === '0x') return;
  x.symbole = chaine(await call(x.adr, S('symbol()')));
  const d = w(await call(x.adr, S('decimals()'))); x.dec = d === null ? null : Number(d);
  const ts = w(await call(x.adr, S('totalSupply()'))); x.supply = ts === null ? null : ts.toString();
});
const liste = [...actions.values()];
const vivantes = liste.filter((x) => x.code !== 'VIDE' && x.dec !== null && x.supply !== null && BigInt(x.supply) > 0n);
console.log('actions listees ' + liste.length + ' · code vide ' + liste.filter((x) => x.code === 'VIDE').length + ' · supply nulle ou illisible ' + (liste.length - vivantes.length - liste.filter((x) => x.code === 'VIDE').length) + ' · vivantes ' + vivantes.length);

/* ── 2. prix des devises, mesures ── */
const { ETH, USDC, OUSD, WETH } = ADRESSES;
const DEVISES = [['USDC', USDC], ['OUSD', OUSD], ['ETH', ETH]];
const tok = (x) => (x === ETH ? WETH : x);
async function meilleurDevisVersUsdc(de, montant) {
  /* meilleure sortie USDC parmi : V4 sans hook (4 cles), V3 (4), CL3/CL2 (6x2) — balayage direct */
  let best = 0n, ou = null;
  for (const kp of [{ fee: 100, tickSpacing: 1 }, { fee: 500, tickSpacing: 10 }, { fee: 3000, tickSpacing: 60 }, { fee: 10000, tickSpacing: 200 }]) {
    const cle = cleDePool(de, USDC, kp); const q = devisSaut({ de, vers: USDC, e: { venue: 'uniswap-v4', cle: { ...cle, hooks: ETH } } }, montant);
    const o = w(await call(q.to, q.data)); if (o && o > best) { best = o; ou = 'v4:' + kp.fee; }
  }
  for (const f of [100, 500, 3000, 10000]) { const q = devisSaut({ de, vers: USDC, e: { venue: 'uniswap-v3', fee: f, token0: tok(de), token1: USDC } }, montant); const o = w(await call(q.to, q.data)); if (o && o > best) { best = o; ou = 'v3:' + f; } }
  for (const fac of [3, 2]) for (const ts of [1, 10, 50, 100, 200, 2000]) { const q = devisSaut({ de, vers: USDC, e: { venue: 'aerodrome-cl', factory: fac, tickSpacing: ts, token0: tok(de), token1: USDC } }, montant); const o = w(await call(q.to, q.data)); if (o && o > best) { best = o; ou = 'cl' + fac + ':' + ts; } }
  return { best, ou };
}
/* ⛔ les decimales D ABORD : OUSD en a 6, et un devis de 1e18 unites (= 1e12 OUSD) ne rend rien */
const DEC = { [USDC]: 6, [ETH]: 18, [OUSD]: Number(w(await call(OUSD, S('decimals()')))) };
const pEth = await meilleurDevisVersUsdc(ETH, 10n ** 16n);
const pOusd = await meilleurDevisVersUsdc(OUSD, 10n ** BigInt(DEC[OUSD]));
const PRIX = { [USDC]: 1, [ETH]: Number(pEth.best) / 1e6 * 100, [OUSD]: Number(pOusd.best) / 1e6 };
if (!(PRIX[ETH] > 0) || !(PRIX[OUSD] > 0)) { console.log('KO prix de devise non mesure (ETH ' + PRIX[ETH] + ', OUSD ' + PRIX[OUSD] + ') — arret'); process.exit(1); }
console.log('prix mesures : ETH ' + PRIX[ETH].toFixed(2) + ' $ (' + pEth.ou + ') · OUSD ' + PRIX[OUSD].toFixed(6) + ' $ (' + pOusd.ou + ', decimales ' + DEC[OUSD] + ')');

/* ── 3. candidats : balayage + cles V4 hookees de /api/cle ── */
const sV3 = selecteur('getPool(address,address,uint24)'), sCl = selecteur('getPool(address,address,int24)');
const sLiq = selecteur('getLiquidity(bytes32)'), sSlot = selecteur('getSlot0(bytes32)');
const pools = [];
const taches = [];
for (const x of vivantes) for (const [qs, q] of DEVISES) {
  for (const f of [100, 500, 3000, 10000]) taches.push({ x, qs, q, venue: 'uniswap-v3', fee: f });
  for (const fac of [3, 2]) for (const ts of [1, 10, 50, 100, 200, 2000]) taches.push({ x, qs, q, venue: 'aerodrome-cl', factory: fac, tickSpacing: ts });
  for (const kp of [{ fee: 100, tickSpacing: 1 }, { fee: 500, tickSpacing: 10 }, { fee: 3000, tickSpacing: 60 }, { fee: 10000, tickSpacing: 200 }]) taches.push({ x, qs, q, venue: 'uniswap-v4', cle: { ...cleDePool(x.adr, q, kp), hooks: ETH } });
}
let nCle = 0;
if (!process.env.SANS_API_CLE) {
  await par(vivantes, 3, async (x) => {
    const c = await getJson('https://tokenizedblock.space/api/cle/' + x.adr); nCle += 1;
    for (const k of (c && c.cles) || []) {
      const c0 = bas(k.currency0), c1 = bas(k.currency1), autre = c0 === x.adr ? c1 : c1 === x.adr ? c0 : null;
      const d = DEVISES.find(([, q]) => noeud(q) === noeud(autre || ''));
      if (!d || bas(k.hooks) === ETH) continue;
      taches.push({ x, qs: d[0], q: d[1], venue: 'uniswap-v4', cle: { currency0: c0, currency1: c1, fee: Number(k.fee), tickSpacing: Number(k.tickSpacing), hooks: bas(k.hooks) }, source: 'api/cle' });
    }
    await dors(150);
  });
}
console.log('candidats ' + taches.length + ' (balayage + ' + nCle + ' lectures /api/cle)');
let fait = 0; const t0 = Date.now();
await par(taches, CONC, async (t) => {
  fait += 1; if (fait % 2000 === 0) console.log('  ... ' + fait + '/' + taches.length + ' en ' + Math.round((Date.now() - t0) / 1000) + ' s · perdus ' + perdus + ' · 429 ' + reessais);
  if (t.venue === 'uniswap-v4') {
    const pid = poolId(t.cle);
    const liq = w(await call(ADRESSES.STATE_VIEW, '0x' + sLiq + pid.slice(2)));
    if (!liq) return;
    const sq = w(await call(ADRESSES.STATE_VIEW, '0x' + sSlot + pid.slice(2)));
    if (!sq) return;
    pools.push({ action: t.x.adr, devise: t.qs, venue: 'uniswap-v4', id: bas(pid), cle: t.cle, hook: bas(t.cle.hooks) === ETH ? null : (NOS_HOOKS.get(bas(t.cle.hooks)) || 'tiers:' + t.cle.hooks.slice(0, 10)), liquidite: liq.toString(), source: t.source || 'balayage' });
    return;
  }
  const fac = t.venue === 'uniswap-v3' ? ADRESSES.FACTORY_V3 : t.factory === 3 ? ADRESSES.FACTORY_CL3 : ADRESSES.FACTORY_CL2;
  const p = a(await call(fac, '0x' + (t.venue === 'uniswap-v3' ? sV3 + motAdr(t.x.adr) + motAdr(tok(t.q)) + mot(t.fee) : sCl + motAdr(t.x.adr) + motAdr(tok(t.q)) + motSigne(t.tickSpacing))));
  if (!p || /^0x0{40}$/.test(p)) return;
  const liq = w(await call(p, S('liquidity()')));
  if (!liq) return;
  const t0a = bas(a(await call(p, S('token0()')))), t1a = bas(a(await call(p, S('token1()'))));
  pools.push({ action: t.x.adr, devise: t.qs, venue: t.venue, id: bas(p), pool: bas(p), fee: t.fee, factory: t.factory, tickSpacing: t.tickSpacing, token0: t0a, token1: t1a, liquidite: liq.toString(), source: 'balayage' });
});
console.log('pools avec liquidite > 0 : ' + pools.length + ' · appels perdus ' + perdus);

/* ── 4. mesure de chaque pool : prix, TVL (V3/CL), devis 1 000 $ et 10 000 $ dans les deux sens ── */
const xs = new Map(liste.map((x) => [x.adr, x]));
await par(pools, CONC, async (p) => {
  const x = xs.get(p.action), q = p.devise === 'USDC' ? USDC : p.devise === 'OUSD' ? OUSD : ETH;
  const e = p.venue === 'uniswap-v4' ? { venue: 'uniswap-v4', cle: p.cle } : p.venue === 'uniswap-v3' ? { venue: 'uniswap-v3', fee: p.fee, token0: p.token0, token1: p.token1 } : { venue: 'aerodrome-cl', factory: p.factory, tickSpacing: p.tickSpacing, token0: p.token0, token1: p.token1 };
  p.arete = { ...e, pool: p.pool, id: p.id };
  const unitesQ = (usd) => BigInt(Math.floor(usd / PRIX[q] * 1e6)) * 10n ** BigInt(DEC[q]) / 1000000n;
  const dq = async (de, vers, m) => { if (!m || m <= 0n) return null; const s = devisSaut({ de, vers, e }, m); return w(await call(s.to, s.data)); };
  /* prix de l action SUR CETTE POOL : 10 $ de devise -> action */
  const o10 = await dq(q, x.adr, unitesQ(10));
  p.prixAction = o10 && o10 > 0n ? 10 / (Number(o10) / 10 ** x.dec) : null;
  p.devis = {};
  for (const usd of [1000, 10000]) {
    const oB = await dq(q, x.adr, unitesQ(usd));
    p.devis['achat' + usd] = oB && p.prixAction ? +((Number(oB) / 10 ** x.dec * p.prixAction) / usd).toFixed(4) : null;
    const mS = p.prixAction ? BigInt(Math.floor(usd / p.prixAction * 10 ** Math.min(x.dec, 12))) * 10n ** BigInt(Math.max(x.dec - 12, 0)) : null;
    const oS = await dq(x.adr, q, mS);
    p.devis['vente' + usd] = oS ? +((Number(oS) / 10 ** DEC[q] * PRIX[q]) / usd).toFixed(4) : null;
  }
  p.retenu1000 = [p.devis.achat1000, p.devis.vente1000].every((v) => v !== null) ? Math.min(p.devis.achat1000, p.devis.vente1000) : null;
  p.retenu10000 = [p.devis.achat10000, p.devis.vente10000].every((v) => v !== null) ? Math.min(p.devis.achat10000, p.devis.vente10000) : null;
  if (p.venue !== 'uniswap-v4') {
    const bS = w(await call(x.adr, S('balanceOf(address)') + motAdr(p.pool))), bQ = w(await call(tok(q), S('balanceOf(address)') + motAdr(p.pool)));
    p.tvlUsd = bS !== null && bQ !== null && p.prixAction ? +(Number(bS) / 10 ** x.dec * p.prixAction + Number(bQ) / 10 ** DEC[q] * PRIX[q]).toFixed(2) : null;
    p.soldes = { action: bS === null ? null : bS.toString(), devise: bQ === null ? null : bQ.toString() };
  } else p.tvlUsd = null;
});

/* ── 5. par action : meilleure pool par devise ── */
const lieu = (p) => (p.venue === 'uniswap-v4' ? 'Uniswap V4' + (p.hook ? ' hook ' + p.hook : '') + ' fee ' + p.cle.fee + ' ts ' + p.cle.tickSpacing : p.venue === 'uniswap-v3' ? 'Uniswap V3 fee ' + p.fee : 'Aerodrome Slipstream f' + p.factory + ' ts ' + p.tickSpacing);
const cle = (p) => [p.retenu1000 ?? -1, p.tvlUsd ?? -1];
const meilleur = (ps) => ps.slice().sort((u, v) => (cle(v)[0] - cle(u)[0]) || (cle(v)[1] - cle(u)[1]))[0] || null;
const SEUIL = 0.95; /* « profondeur » = retenu >= 95 % sur 1 000 $ dans les deux sens */
const lignes = [['ticker', 'emetteur', 'adresse', 'code', 'symbole_lu', 'decimales', 'supply', ...['USDC', 'OUSD', 'ETH'].flatMap((d) => [d + '_pools', d + '_meilleure', d + '_pool_id', d + '_tvl_usd', d + '_retenu_1k', d + '_retenu_10k', d + '_prix_action']), 'profondeur', 'besoin_saut_eth'].join(',')];
const csv = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const resume = { listees: liste.length, vivantes: vivantes.length, parEmetteur: {}, avecUSDC: 0, avecOUSD: 0, profondUSDC: 0, profondOUSD: 0, besoinEth: [], aucune: 0 };
for (const x of liste) {
  const e = resume.parEmetteur[x.emetteur] || (resume.parEmetteur[x.emetteur] = { listees: 0, vivantes: 0, avecPool: 0, profondUsdcOuOusd: 0 });
  e.listees += 1;
  const viv = vivantes.includes(x); if (viv) e.vivantes += 1;
  const best = {};
  for (const [d] of DEVISES) best[d] = meilleur(pools.filter((p) => p.action === x.adr && p.devise === d));
  x.meilleures = Object.fromEntries(Object.entries(best).map(([d, p]) => [d, p ? { lieu: lieu(p), id: p.id, tvlUsd: p.tvlUsd, retenu1000: p.retenu1000, retenu10000: p.retenu10000, prix: p.prixAction } : null]));
  const prof = (d) => !!(best[d] && best[d].retenu1000 !== null && best[d].retenu1000 >= SEUIL);
  if (best.USDC) resume.avecUSDC += 1; if (best.OUSD) resume.avecOUSD += 1;
  if (prof('USDC')) resume.profondUSDC += 1; if (prof('OUSD')) resume.profondOUSD += 1;
  if (best.USDC || best.OUSD || best.ETH) e.avecPool += 1;
  if (prof('USDC') || prof('OUSD')) e.profondUsdcOuOusd += 1;
  const besoinEth = !prof('USDC') && !prof('OUSD') && !!best.ETH;
  if (besoinEth) resume.besoinEth.push({ ticker: x.ticker, emetteur: x.emetteur, eth: lieu(best.ETH), retenu1000: best.ETH.retenu1000 });
  if (viv && !best.USDC && !best.OUSD && !best.ETH) resume.aucune += 1;
  x.profondeur = prof('USDC') && prof('OUSD') ? 'USDC+OUSD' : prof('USDC') ? 'USDC' : prof('OUSD') ? 'OUSD' : (best.USDC || best.OUSD) ? 'mince' : 'aucune';
  lignes.push([x.ticker, x.emetteur, x.adr, x.code, x.symbole, x.dec, x.supply,
    ...['USDC', 'OUSD', 'ETH'].flatMap((d) => { const p = best[d]; const n = pools.filter((y) => y.action === x.adr && y.devise === d).length; return p ? [n, lieu(p), p.id, p.tvlUsd ?? 'inconnu (V4)', p.retenu1000 ?? 'inconnu', p.retenu10000 ?? 'inconnu', p.prixAction ? p.prixAction.toFixed(4) : 'inconnu'] : [n, '', '', '', '', '', '']; }),
    x.profondeur, besoinEth ? 'oui' : (x.profondeur === 'aucune' && !best.ETH ? 'aucune pool' : 'non')].map(csv).join(','));
}
writeFileSync(CSV, lignes.join('\n') + '\n');
writeFileSync(SORTIE, JSON.stringify({ bloc, lu: new Date().toISOString(), prix: PRIX, sources: src.sources, appelsPerdus: perdus, reessais, seuil: SEUIL, actions: liste, pools }, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 1));
console.log(JSON.stringify({ ...resume, besoinEth: resume.besoinEth.length }, null, 1));
console.log('besoin du saut ETH : ' + resume.besoinEth.map((b) => b.ticker + '(' + b.emetteur.split(' ')[0] + ')').join(' '));
console.log('ecrit ' + CSV + ' et ' + SORTIE + ' · appels perdus ' + perdus);
