/* mesure-misables-20261024.mjs — QUELS JETONS PEUVENT PAYER UN JEU EN USDC, MESURE EN LECTURE SEULE (Phil, 2026-10-24 : « miser en USDC OU
 * en tout B20 / action de l app ; l app swappe en USDC ; seul ce qui a une liquidite profonde est misable »).
 *
 * Pour chaque jeton que l app connait, un devis EXACT-OUTPUT de 0,50 / 5 / 10 USDC (un roll ou un spin, dix rolls, un week pass) :
 *   - le montant de jeton demande (amountIn du quoter), le prix MOYEN (slot0 de la pool) et l ecart = cout total vs le prix moyen, en bps,
 *     FRAIS DE LA POOL COMPRIS (c est ce que le joueur paie en plus d un change au prix moyen) ;
 *   - la route : 'aerodrome-cl' (factory 0xf8f2…61ef, celle que declare notre routeur Aerodrome — la SEULE ou l app sait construire un
 *     exact-output), 'v4' (PoolManager, mesure pour information), 'aero-nouvelle' (factory 0x9cb2…7a76, injoignable par notre routeur) ;
 *   - la profondeur : l USDC detenu par la pool CL (balanceOf) ; pour v4 aucune profondeur par pool n est lisible (le PoolManager detient
 *     tout) : seul le devis vaut.
 * ⛔ LECTURE SEULE : eth_call / eth_getCode / eth_blockNumber, en LOTS JSON-RPC (peu de requetes HTTP), aucun eth_getLogs, aucune archive.
 *   Tous les devis sont lus AU MEME BLOC (le numero, epingle, est ecrit dans le JSON).
 * Usage : node mesure-misables-20261024.mjs [rpc] [sortie.json]  (defaut https://base-rpc.publicnode.com, mesures/misables-20261024.json) */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { selecteur } from './keccak.js';
import { ACTIONS_COINBASE } from './paires.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { LOGS_INITIALIZE_ACTIONS } from './cles-v4-actions.js';
import { ESPACEMENTS_RETOMBEE } from './espacements-cl.js';
import { FACTORY_AERODROME_CL, ROUTEUR_AERODROME_CL } from './calldata-aerodrome.js';
import { QUOTEUR_AERODROME_CL } from './rolls-en-action.js';
import { QUOTEUR } from './echange.js';
import { V4_ADRESSES, FEE_POOL, TICK_SPACING_POOL } from './lancer-pool.js';
import { USDC_BASE } from './frais-creation.js';
import { UNIT, HOOK } from './blockrolls-plan.js';
import { poolId } from './pool.js';
import { FACTORY_NOUVELLE_INJOIGNABLE } from './misables.js';

const RPC = process.argv[2] || 'https://base-rpc.publicnode.com';
const SORTIE = process.argv[3] || 'mesures/misables-20261024.json';
const SOURCE_MARCHE = 'https://tokenizedblock.space/api/trending';
const USDC = USDC_BASE.toLowerCase();
const WETH = '0x4200000000000000000000000000000000000006';
const ETH = '0x0000000000000000000000000000000000000000';
const MONTANTS = [500000n, 5000000n, 10000000n];
const Q192 = 1n << 192n;
const bas = (x) => String(x || '').toLowerCase();
const mot = (n) => BigInt(n).toString(16).padStart(64, '0');
const motA = (a) => bas(a).slice(2).padStart(64, '0');
const motI24 = (n) => { const v = BigInt(n); return (v < 0n ? v + (1n << 256n) : v).toString(16).padStart(64, '0'); };
const motsDe = (hex) => { const h = String(hex || '').slice(2); const r = []; for (let i = 0; i + 64 <= h.length; i += 64) r.push(BigInt('0x' + h.slice(i, i + 64))); return r; };
const adrDeMot = (w) => '0x' + w.toString(16).padStart(64, '0').slice(24);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

let requetesHttp = 0;
/* un LOT JSON-RPC ; un 429 / une panne de transport = on ATTEND et on recommence (un refus certain n est pas une panne a sauter) */
async function lot(appels, taille = 60) {
  const sortie = [];
  for (let i = 0; i < appels.length; i += taille) {
    const tranche = appels.slice(i, i + taille).map((c, k) => ({ jsonrpc: '2.0', id: k, method: c.method, params: c.params }));
    let rep = null;
    for (let essai = 0; essai < 6 && !rep; essai += 1) {
      try {
        requetesHttp += 1;
        const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tranche) });
        if (r.status === 429 || r.status >= 500) { await pause(1500 * (essai + 1)); continue; }
        const j = await r.json();
        if (!Array.isArray(j)) { await pause(1500 * (essai + 1)); continue; }
        rep = j;
      } catch (_) { await pause(1500 * (essai + 1)); }
    }
    if (!rep) throw new Error('RPC lot illisible apres 6 essais (' + RPC + ')');
    const parId = new Map(rep.map((x) => [x.id, x]));
    tranche.forEach((t) => { const x = parId.get(t.id); sortie.push(x ? (x.error ? { erreur: String(x.error.message || JSON.stringify(x.error)).slice(0, 160) } : { res: x.result }) : { erreur: 'pas de reponse' }); });
    await pause(250);
  }
  return sortie;
}
const appelA = (to, data, bloc) => ({ method: 'eth_call', params: [{ to, data }, bloc] });

/* ── calldata ─────────────────────────────────────────────────────────────────────────────────────────────── */
const S = {
  getPool: selecteur('getPool(address,address,int24)'), factory: selecteur('factory()'), slot0: selecteur('slot0()'), liquidity: selecteur('liquidity()'),
  fee: selecteur('fee()'), tickSpacing: selecteur('tickSpacing()'), token0: selecteur('token0()'), balanceOf: selecteur('balanceOf(address)'), decimals: selecteur('decimals()'),
  symbol: selecteur('symbol()'),
  qOutCl: selecteur('quoteExactOutputSingle((address,address,uint256,int24,uint160))'),
  qOutV4: selecteur('quoteExactOutputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))'),
  getSlot0V4: selecteur('getSlot0(bytes32)'),
};
const dGetPool = (a, b, ts) => S.getPool + motA(a) + motA(b) + motI24(ts);
const dQuoteCl = (tin, tout, montant, ts) => S.qOutCl + motA(tin) + motA(tout) + mot(montant) + motI24(ts) + mot(0);
const cleInline = (c) => motA(c.currency0) + motA(c.currency1) + mot(c.fee) + motI24(c.tickSpacing) + motA(c.hooks);
const dQuoteV4 = (cle, zeroForOne, montant) => S.qOutV4 + mot(0x20) + cleInline(cle) + mot(zeroForOne ? 1 : 0) + mot(montant) + mot(0x100) + mot(0);

/* le montant MOYEN de tokenIn pour `sortie` de tokenOut au prix sqrtP (token1/token0 = sqrtP^2 / 2^192), en fraction num/den */
function moyen(tokenIn, tokenOut, sortie, sqrtP) {
  const s2 = sqrtP * sqrtP;
  const inEst0 = BigInt(bas(tokenIn) === ETH ? 0 : bas(tokenIn)) < BigInt(bas(tokenOut) === ETH ? 0 : bas(tokenOut));
  return inEst0 ? { num: sortie * Q192, den: s2 } : { num: sortie * s2, den: Q192 };
}
const ecartBps = (amountIn, m) => Number(((amountIn * m.den - m.num) * 10000n) / m.num);

async function main() {
  const tete = await lot([{ method: 'eth_blockNumber', params: [] }, { method: 'eth_chainId', params: [] }]);
  if (BigInt(tete[1].res) !== 8453n) throw new Error('pas Base mainnet');
  const blocN = Number(BigInt(tete[0].res));
  const bloc = '0x' + blocN.toString(16);
  const [bTete, bAvant] = await lot([{ method: 'eth_getBlockByNumber', params: [bloc, false] }, { method: 'eth_getBlockByNumber', params: ['0x' + (blocN - 1000).toString(16), false] }]);
  const tsTete = Number(BigInt(bTete.res.timestamp)), tsAvant = Number(BigInt(bAvant.res.timestamp));
  const msParBloc = ((tsTete - tsAvant) * 1000) / 1000;

  /* le temoin : le quoter CL et le routeur declarent bien la factory epinglee ; la nouvelle factory est bien une AUTRE */
  const temoins = await lot([appelA(QUOTEUR_AERODROME_CL, S.factory, bloc), appelA(ROUTEUR_AERODROME_CL, S.factory, bloc), { method: 'eth_getCode', params: [FACTORY_NOUVELLE_INJOIGNABLE, bloc] }]);
  const factoryQuoter = adrDeMot(motsDe(temoins[0].res)[0]), factoryRouteur = adrDeMot(motsDe(temoins[1].res)[0]);
  if (factoryQuoter !== FACTORY_AERODROME_CL || factoryRouteur !== FACTORY_AERODROME_CL) throw new Error('factory du quoter/routeur inattendue : ' + factoryQuoter + ' / ' + factoryRouteur);

  /* ── l univers : le registre des actions, le marche servi (trending), UNIT, ETH ─────────────────────── */
  const marche = await (await fetch(SOURCE_MARCHE)).json();
  requetesHttp += 1;
  const lignes = Array.isArray(marche.lignes) ? marche.lignes : [];
  const actions = new Map(ACTIONS_COINBASE.map((a) => [bas(a.adr), a.symbole]));
  const univers = new Map();
  for (const [adr, sym] of actions) univers.set(adr, { jeton: adr, symbole: sym, famille: 'action', sources: ['registre'] });
  for (const l of lignes) {
    const adr = bas(l.adr);
    if (!/^0x[0-9a-f]{40}$/.test(adr)) continue;
    const u = univers.get(adr) || { jeton: adr, symbole: String(l.sym || '').slice(0, 24), famille: actions.has(adr) ? 'action' : 'b20', sources: [] };
    u.sources.push('marche');
    u.marche = { dex: l.dex || null, poolAdr: l.poolAdr ? bas(l.poolAdr) : null, quoteSym: l.quoteSym || null, liquiditeUsd: l.liquiditeUsd ?? null, cle: (l.achat && l.achat.cle) || null };
    univers.set(adr, u);
  }
  /* un INSTANTANE plus ancien du meme /api/trending (argv[4]) : les cles v4 qu il servait (achat.cle) et que la lecture du moment ne sert
   *   plus — le serveur ne garde la cle que des lignes cotees recemment. La cle est une donnee immuable de la pool ; le devis, lui, est
   *   relu ICI au bloc epingle. La provenance est ecrite (cleDepuisInstantane). */
  if (process.argv[4]) {
    const inst = JSON.parse((await import('node:fs')).readFileSync(process.argv[4], 'utf8'));
    for (const l of inst.lignes || []) {
      const u = univers.get(bas(l.adr));
      if (u && u.marche && !u.marche.cle && l.achat && l.achat.cle) { u.marche.cle = l.achat.cle; u.marche.cleDepuisInstantane = inst.lu || true; }
    }
  }
  const unit = univers.get(bas(UNIT)) || { jeton: bas(UNIT), symbole: 'UNIT', famille: 'b20', sources: [] };
  unit.sources.push('jeu (BlockRolls)');
  unit.cleV4 = { currency0: ETH, currency1: bas(UNIT), fee: FEE_POOL, tickSpacing: TICK_SPACING_POOL, hooks: HOOK };
  univers.set(bas(UNIT), unit);
  univers.set(ETH, { jeton: ETH, symbole: 'ETH', famille: 'eth', sources: ['natif'] });

  /* ── 1. Aerodrome CL (ancienne factory) : getPool(USDC, jeton, ts) pour chaque espacement ─────────────── */
  const candidatsCl = [...univers.values()].map((u) => ({ u, adr: u.jeton === ETH ? WETH : u.jeton }));
  const reqPools = [];
  for (const c of candidatsCl) for (const ts of ESPACEMENTS_RETOMBEE) reqPools.push({ c, ts, a: appelA(FACTORY_AERODROME_CL, dGetPool(USDC, c.adr, ts), bloc) });
  const repPools = await lot(reqPools.map((r) => r.a), 90);
  const poolsCl = [];
  repPools.forEach((r, i) => {
    if (!r.res) return;
    const p = adrDeMot(motsDe(r.res)[0] || 0n);
    if (p !== ETH) poolsCl.push({ ...reqPools[i], pool: p });
  });
  /* etat de chaque pool trouvee : USDC detenu, slot0, liquidite, fee */
  const repEtat = await lot(poolsCl.flatMap((p) => [appelA(USDC, S.balanceOf + motA(p.pool), bloc), appelA(p.pool, S.slot0, bloc), appelA(p.pool, S.liquidity, bloc), appelA(p.pool, S.fee, bloc)]), 80);
  poolsCl.forEach((p, i) => {
    const [b, s, l, f] = repEtat.slice(i * 4, i * 4 + 4);
    p.usdcPool = b.res ? motsDe(b.res)[0] : null; p.sqrtP = s.res ? motsDe(s.res)[0] : null;
    p.liquidite = l.res ? motsDe(l.res)[0] : null; p.feePpm = f.res ? Number(motsDe(f.res)[0]) : null;
  });
  /* devis exact-out sur chaque pool vivante (sqrtP > 0, liquidite > 0) */
  const vivantes = poolsCl.filter((p) => p.sqrtP && p.sqrtP > 0n && p.liquidite && p.liquidite > 0n);
  const repQ = await lot(vivantes.flatMap((p) => MONTANTS.map((m) => appelA(QUOTEUR_AERODROME_CL, dQuoteCl(p.c.adr, USDC, m, p.ts), bloc))), 60);
  vivantes.forEach((p, i) => {
    p.devis = MONTANTS.map((m, k) => {
      const r = repQ[i * MONTANTS.length + k];
      if (!r.res) return { usdc: String(m), ok: false, erreur: r.erreur || 'vide' };
      const amountIn = motsDe(r.res)[0];
      const mm = moyen(p.c.adr, USDC, m, p.sqrtP);
      return { usdc: String(m), ok: amountIn > 0n, montantIn: String(amountIn), moyenIn: String(mm.num / mm.den), ecartBps: ecartBps(amountIn, mm) };
    });
  });

  /* ── 2. v4 : les pools USDC/action sans hook (logs Initialize gardes), UNIT/ETH et les blocks du marche portant une cle ────────────── */
  const clesV4 = [];
  for (const l of LOGS_INITIALIZE_ACTIONS) {
    const [, , t0, t1] = l.topics; const w = motsDe(l.data);
    const cle = { currency0: adrDeMot(BigInt(t0)), currency1: adrDeMot(BigInt(t1)), fee: Number(w[0]), tickSpacing: Number(BigInt.asIntN(24, w[1])), hooks: adrDeMot(w[2]) };
    const jeton = cle.currency0 === USDC ? cle.currency1 : cle.currency0;
    if (univers.has(jeton)) clesV4.push({ u: univers.get(jeton), cle, quote: USDC });
  }
  for (const u of univers.values()) {
    const cle = u.cleV4 || (u.famille === 'b20' && u.marche && u.marche.cle) || null;
    if (cle) clesV4.push({ u, cle: { currency0: bas(cle.currency0), currency1: bas(cle.currency1), fee: Number(cle.fee), tickSpacing: Number(cle.tickSpacing), hooks: bas(cle.hooks) }, quote: null });
  }
  for (const k of clesV4) k.quote = k.quote || (k.cle.currency0 === k.u.jeton ? k.cle.currency1 : k.cle.currency0);
  /* le saut ETH -> USDC des blocks apparies a l ETH : la meilleure pool WETH/USDC CL trouvee ci-dessus (devis le plus bas a chaque taille) */
  const wethPools = vivantes.filter((p) => p.c.adr === WETH);
  const wethIn = MONTANTS.map((m, k) => {
    const ok = wethPools.map((p) => p.devis[k]).filter((d) => d.ok);
    return ok.length ? ok.reduce((a, b) => (BigInt(a.montantIn) <= BigInt(b.montantIn) ? a : b)) : null;
  });
  const sv = V4_ADRESSES[8453].stateView, qv4 = QUOTEUR[8453];
  const appelsV4 = [];
  for (const k of clesV4) {
    const zeroForOne = k.cle.currency0 === k.u.jeton; /* le jeton est vendu */
    k.zeroForOne = zeroForOne;
    k.sorties = MONTANTS.map((m, i) => (k.quote === USDC ? m : (k.quote === ETH && wethIn[i] ? BigInt(wethIn[i].montantIn) : null)));
    appelsV4.push(appelA(sv, S.getSlot0V4 + poolId(k.cle).slice(2), bloc));
    k.sorties.forEach((s) => appelsV4.push(s === null ? null : appelA(qv4, dQuoteV4(k.cle, zeroForOne, s), bloc)));
  }
  const repV4 = await lot(appelsV4.filter(Boolean), 50);
  let iv = 0;
  for (const k of clesV4) {
    const s0 = repV4[iv++]; k.sqrtP = s0.res ? motsDe(s0.res)[0] : null;
    k.devis = k.sorties.map((s, i) => {
      if (s === null) return { usdc: String(MONTANTS[i]), ok: false, erreur: 'no ' + k.quote + ' -> USDC hop measured' };
      const r = repV4[iv++];
      if (!r.res) return { usdc: String(MONTANTS[i]), ok: false, erreur: r.erreur || 'vide' };
      const amountIn = motsDe(r.res)[0];
      if (!(k.sqrtP > 0n) || !(amountIn > 0n)) return { usdc: String(MONTANTS[i]), ok: false, erreur: 'no price' };
      const m1 = moyen(k.u.jeton, k.quote, s, k.sqrtP);
      let ecart = ecartBps(amountIn, m1);
      let ecartSaut2 = null;
      if (k.quote === ETH) { ecartSaut2 = wethIn[i].ecartBps; ecart = Math.round(((1 + ecart / 10000) * (1 + ecartSaut2 / 10000) - 1) * 10000); }
      return { usdc: String(MONTANTS[i]), ok: true, montantIn: String(amountIn), sortieSaut1: String(s), ecartBps: ecart, ecartSaut2Bps: ecartSaut2 };
    });
  }

  /* ── 3. les pools du marche sur une AUTRE factory : factory() lue, et l USDC qu elles tiennent (ce qui est hors de portee) ───────── */
  const autres = [...univers.values()].filter((u) => u.marche && u.marche.poolAdr && /^0x[0-9a-f]{40}$/.test(u.marche.poolAdr));
  /* + slot0 et token0 de la pool du marche : son prix moyen AU MEME BLOC sert de REFERENCE (la pool la plus liquide du jeton, toute factory) */
  const repF = await lot(autres.flatMap((u) => [appelA(u.marche.poolAdr, S.factory, bloc), appelA(USDC, S.balanceOf + motA(u.marche.poolAdr), bloc),
    appelA(u.marche.poolAdr, S.slot0, bloc), appelA(u.marche.poolAdr, S.token0, bloc)]), 80);
  autres.forEach((u, i) => {
    const [f, b, s, t0] = repF.slice(i * 4, i * 4 + 4);
    u.marche.factory = f.res && f.res.length >= 66 ? adrDeMot(motsDe(f.res)[0]) : null;
    u.marche.usdcPool = b.res ? String(motsDe(b.res)[0]) : null;
    u.marche.sqrtPriceX96 = s.res && s.res.length >= 66 ? String(motsDe(s.res)[0]) : null;
    u.marche.token0 = t0.res && t0.res.length >= 66 ? adrDeMot(motsDe(t0.res)[0]) : null;
  });
  /* la reference n a de sens que pour une pool jeton/USDC (token0 lu) dont la factory est une factory CL connue */
  for (const u of autres) {
    const m = u.marche;
    const cl = m.factory === FACTORY_AERODROME_CL || m.factory === FACTORY_NOUVELLE_INJOIGNABLE;
    const paire = m.token0 === USDC || m.token0 === u.jeton;
    if (!cl || !paire || !m.sqrtPriceX96 || BigInt(m.sqrtPriceX96) === 0n) continue;
    /* USDC brut par jeton brut, en fraction : token1/token0 = s^2 / 2^192 */
    const s2 = BigInt(m.sqrtPriceX96) ** 2n;
    m.refUsdcParJeton = m.token0 === USDC ? { num: Q192, den: s2 } : { num: s2, den: Q192 };
  }
  /* les decimales de chaque jeton qui a un devis */
  const avecDevis = [...new Set([...vivantes.map((p) => p.c.u.jeton), ...clesV4.map((k) => k.u.jeton)])].filter((a) => a !== ETH);
  const repD = await lot(avecDevis.map((a) => appelA(a, S.decimals, bloc)), 90);
  const decimales = new Map(avecDevis.map((a, i) => [a, repD[i].res ? Number(motsDe(repD[i].res)[0]) : null]));
  decimales.set(ETH, 18);

  /* ── la table ──────────────────────────────────────────────────────────────────────────────────────── */
  const table = [];
  for (const u of univers.values()) {
    const routes = [];
    const ref = u.marche && u.marche.refUsdcParJeton;
    for (const p of poolsCl.filter((x) => x.c.u === u)) {
      /* l ecart de NOTRE pool a la reference : (USDC par jeton chez nous / chez la reference - 1) ; negatif = notre pool paie MOINS d USDC */
      let ecartReferenceBps = null;
      if (ref && p.sqrtP && p.sqrtP > 0n && p.pool !== u.marche.poolAdr) {
        const s2 = p.sqrtP * p.sqrtP;
        const nous = BigInt(p.c.adr) < BigInt(USDC) ? { num: s2, den: Q192 } : { num: Q192, den: s2 };
        ecartReferenceBps = Number((nous.num * ref.den * 10000n) / (nous.den * ref.num)) - 10000;
      } else if (ref && p.pool === u.marche.poolAdr) ecartReferenceBps = 0;
      routes.push({ route: 'aerodrome-cl', factory: FACTORY_AERODROME_CL, routeur: ROUTEUR_AERODROME_CL, pool: p.pool, tickSpacing: p.ts, jetonIn: p.c.adr, feePpm: p.feePpm,
        usdcPool: p.usdcPool === null ? null : String(p.usdcPool), liquidite: p.liquidite === null ? null : String(p.liquidite), sqrtPriceX96: p.sqrtP === null ? null : String(p.sqrtP),
        ecartReferenceBps, devis: p.devis || null });
    }
    for (const k of clesV4.filter((x) => x.u === u)) {
      routes.push({ route: 'v4', cle: k.cle, apparieA: k.quote, feePpm: k.cle.fee, sqrtPriceX96: k.sqrtP === null ? null : String(k.sqrtP), devis: k.devis,
        note: k.quote === ETH ? 'two hops: token -> ETH (v4) then ETH -> USDC (best Aerodrome CL WETH/USDC pool); ecartBps compounds both' : null });
    }
    const m = u.marche || null;
    table.push({ jeton: u.jeton, symbole: u.symbole, famille: u.famille, sources: u.sources, decimales: decimales.get(u.jeton) ?? null, routes,
      marche: m ? { dex: m.dex, poolAdr: m.poolAdr, quoteSym: m.quoteSym, liquiditeUsd: m.liquiditeUsd, factory: m.factory || null, usdcPool: m.usdcPool || null,
        sqrtPriceX96: m.sqrtPriceX96 || null, token0: m.token0 || null, cleServie: m.cle || null, cleDepuisInstantane: m.cleDepuisInstantane || null,
        injoignable: !!(m.factory && m.factory === FACTORY_NOUVELLE_INJOIGNABLE) } : null });
  }
  const out = { mesure: 'misables-20261024', rpc: RPC, bloc: blocN, horodatageBloc: tsTete, lu: new Date().toISOString(), msParBlocMesure: msParBloc,
    montantsUsdc: MONTANTS.map(String), quoteurCl: QUOTEUR_AERODROME_CL, quoteurV4: qv4, factoryAerodromeCl: FACTORY_AERODROME_CL, factoryNouvelle: FACTORY_NOUVELLE_INJOIGNABLE,
    temoins: { factoryDuQuoteurCl: factoryQuoter, factoryDuRouteur: factoryRouteur, codeFactoryNouvelleOctets: (String(temoins[2].res || '0x').length - 2) / 2 },
    sourceMarche: SOURCE_MARCHE, marcheLu: marche.lu || null, lignesMarche: lignes.length, requetesHttp, definitionEcart: 'ecartBps = (amountIn - moyenIn) / moyenIn x 10000, moyenIn au sqrtPriceX96 du slot0 au meme bloc ; frais de la pool COMPRIS', table };
  mkdirSync(dirname(SORTIE), { recursive: true });
  writeFileSync(SORTIE, JSON.stringify(out, null, 1) + '\n');
  console.log('bloc', blocN, 'ms/bloc', msParBloc, 'jetons', table.length, 'pools CL', poolsCl.length, 'vivantes', vivantes.length, 'cles v4', clesV4.length, 'requetes HTTP', requetesHttp, '->', SORTIE);
}
main().catch((e) => { console.error('ECHEC', e && e.stack || e); process.exit(1); });
