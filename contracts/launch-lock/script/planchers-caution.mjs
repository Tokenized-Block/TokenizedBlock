#!/usr/bin/env node
// planchers-caution.mjs — sizes the hook 7030 per-currency caution floor (~$1 in raw units), READ-ONLY.
//
//   node script/planchers-caution.mjs refs                       # off-chain cross-check prices -> plan/planchers-refs.json (recorded once)
//   node script/planchers-caution.mjs size  --block N [--rpc U]  # on-chain pool prices at block N + recorded refs -> plan/planchers-caution.{json,md}
//   node script/planchers-caution.mjs check --block N [--rpc U]  # recompute and compare with src/Devises7030.sol (exit 1 on mismatch)
//
// Sources are pinned in plan/planchers-sources.json (pools were found with Dexscreener, but every price is read on chain).
// Rule per currency (all integer math, BigInt, from sqrtPriceX96):
//   USDC                  -> 10^6 raw (the unit).
//   POOL                  -> ceil($1 / on-chain pool price), when the pool is live (active liquidity > 0), its quote-side
//                            depth is >= MIN_DEPTH_USD, and its price is within MAX_GAP_BPS (10 %) of BOTH off-chain references.
//   REFERENCE (fallback)  -> otherwise: ceil($1 / lower of the two off-chain references). Flagged in the table: there is no
//                            readable on-chain pool price for that currency, and the rule is a decision for Grok Bot.
// No key, no signature, no transaction: eth_call only.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_GAP_BPS = 1000n; // pool vs real-world price: catches a mispriced thin pool (PFEc +78 %), tolerates 24/7 premium/lag
const REF_AGREE_BPS = 100n; // the two references must agree with each other (cross-check) before one is used
const MIN_DEPTH_USD = 500;
const Q192 = 1n << 192n, Q96 = 1n << 96n;
const STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WETH = '0x4200000000000000000000000000000000000006';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const RPC = opt('--rpc', process.env.BASE_RPC || 'https://base.gateway.tenderly.co');
const sources = JSON.parse(readFileSync(join(ICI, 'plan/planchers-sources.json'), 'utf8')).devises;
const sleep = (ms) => new Promise((o) => setTimeout(o, ms));

let rid = 0;
async function rpc(method, params) {
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { if (k >= 5) throw e; await sleep(800 * (k + 1)); }
  }
}
const word = (h, i) => BigInt('0x' + h.slice(2 + 64 * i, 66 + 64 * i));
const pad = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

/** decimal string -> fraction {n, d} */
function frac(s) {
  const [i, f = ''] = String(s).split('.');
  return { n: BigInt(i + f), d: 10n ** BigInt(f.length) };
}
const mul = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
const ceilDiv = (a, b) => (a + b - 1n) / b;
const usd = (f, scale = 6) => Number((f.n * 10n ** BigInt(scale)) / f.d) / 10 ** scale;

async function lirePool(p, bloc) {
  const tag = '0x' + bloc.toString(16);
  let S, L, depthQuoteRaw, t0, t1;
  if (p.type === 'v4') {
    const s0 = await rpc('eth_call', [{ to: STATE_VIEW, data: '0xc815641c' + pad(p.pool) }, tag]);
    const l = await rpc('eth_call', [{ to: STATE_VIEW, data: '0xfa6793d5' + pad(p.pool) }, tag]);
    S = word(s0, 0); L = word(l, 0);
    [t0, t1] = [p.base.toLowerCase(), p.quote.toLowerCase()].sort();
    depthQuoteRaw = (p.quote.toLowerCase() === t0) ? (S === 0n ? 0n : L * Q96 / S) : L * S / Q96; // in-range virtual
  } else {
    const s0 = await rpc('eth_call', [{ to: p.pool, data: '0x3850c7bd' }, tag]);
    S = word(s0, 0);
    L = word(await rpc('eth_call', [{ to: p.pool, data: '0x1a686502' }, tag]), 0);
    t0 = '0x' + (await rpc('eth_call', [{ to: p.pool, data: '0x0dfe1681' }, tag])).slice(26).toLowerCase();
    t1 = '0x' + (await rpc('eth_call', [{ to: p.pool, data: '0xd21220a7' }, tag])).slice(26).toLowerCase();
    depthQuoteRaw = word(await rpc('eth_call', [{ to: p.quote, data: '0x70a08231' + pad(p.pool) }, tag]), 0); // real balance
  }
  const base = p.base.toLowerCase(), quote = p.quote.toLowerCase();
  if (![t0, t1].includes(base) || ![t0, t1].includes(quote)) throw new Error('pool tokens do not match ' + p.pool);
  // raw quote per raw base
  const qParB = base === t0 ? { n: S * S, d: Q192 } : { n: Q192, d: S * S };
  return { S, L, qParB, depthQuoteRaw };
}

async function refs() {
  const H = { 'user-agent': 'Mozilla/5.0', accept: 'application/json' };
  const out = {};
  for (const s of sources) {
    const r = s.ref; if (!r) continue;
    const v = {};
    try {
      if (r.kind === 'stock') {
        const y = await (await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${r.ticker}?range=1d&interval=1d`, { headers: H })).json();
        v.yahoo = String(y.chart.result[0].meta.regularMarketPrice);
        const n = await (await fetch(`https://api.nasdaq.com/api/quote/${r.ticker}/info?assetclass=stocks`, { headers: H })).json();
        v.nasdaq = String(n.data.primaryData.lastSalePrice).replace(/[$,]/g, '');
      } else if (r.kind === 'crypto') {
        v.coinbase = (await (await fetch(`https://api.coinbase.com/v2/prices/${r.coinbase}/spot`)).json()).data.amount;
        const k = await (await fetch(`https://api.kraken.com/0/public/Ticker?pair=${r.kraken}`)).json();
        v.kraken = Object.values(k.result)[0].c[0].replace(/0+$/, '');
      } else if (r.kind === 'peg') { v.peg = r.usd; }
    } catch (e) { v.erreur = String(e.message || e).slice(0, 120); }
    out[s.sym] = v; console.error(s.sym, JSON.stringify(v)); await sleep(250);
  }
  writeFileSync(join(ICI, 'plan/planchers-refs.json'), JSON.stringify({ lu: new Date().toISOString(), prix: out }, null, 1) + '\n');
}

async function size(bloc) {
  const R = JSON.parse(readFileSync(join(ICI, 'plan/planchers-refs.json'), 'utf8'));
  const eth = sources.find((s) => s.sym === 'ETH');
  const pe = await lirePool(eth.pool, bloc); // WETH/USDC: raw USDC per raw WETH
  const usdParWei = mul(pe.qParB, { n: 1n, d: 10n ** 6n });
  const rows = [];
  for (const s of sources) {
    const row = { sym: s.sym, adresse: s.adresse, decimales: s.decimales };
    const refVals = Object.entries(R.prix[s.sym] || {}).filter(([k]) => k !== 'erreur').map(([k, v]) => ({ k, f: frac(v) }));
    row.refs = Object.fromEntries(refVals.map(({ k, f }) => [k, usd(f, 8)]));
    if (s.unite) { Object.assign(row, { regle: 'UNIT', source: 'USDC is the unit', raw: 10n ** 6n, prixUsd: 1, valeurUsd: 1 }); rows.push(row); continue; }
    /* 2026-10-03 (liste 62) : une devise SANS pool declaree (`pool: null`, les 21 actions de l emetteur sans marche on-chain) va
     *   directement a la regle REFERENCE : ceil($1 / la plus basse de deux references qui s accordent a 100 bps). Rien n est lu
     *   sur la chaine pour elle ; la table le DIT (source '-', pourquoi 'no pool declared'). */
    if (!s.pool) {
      if (refVals.length < 2) throw new Error(s.sym + ': no pool AND fewer than 2 references: refuse to size');
      const lo = refVals.map((r) => r.f).reduce((a, b) => (a.n * b.d <= b.n * a.d ? a : b));
      const hi = refVals.map((r) => r.f).reduce((a, b) => (a.n * b.d >= b.n * a.d ? a : b));
      if ((hi.n * lo.d - lo.n * hi.d) * 10000n > REF_AGREE_BPS * lo.n * hi.d) throw new Error(s.sym + ': references disagree: refuse to size');
      row.source = '-'; row.prixPool = null; row.pourquoi = 'no pool declared';
      row.regle = 'REFERENCE'; row.raw = ceilDiv(10n ** BigInt(s.decimales) * lo.d, lo.n); row.prixUsd = usd(lo, 8);
      row.valeurUsd = row.prixUsd * Number(row.raw) / 10 ** s.decimales;
      row.valeurRefBasseUsd = Math.min(...refVals.map(({ f }) => usd(f, 8))) * Number(row.raw) / 10 ** s.decimales;
      rows.push(row); console.error(s.sym, row.regle, String(row.raw), 'no pool'); continue;
    }
    const p = await lirePool(s.pool, bloc);
    const usdParQ = s.pool.quote.toLowerCase() === USDC ? { n: 1n, d: 10n ** 6n } : usdParWei;
    const usdParRaw = mul(p.qParB, usdParQ);
    const unit = { n: usdParRaw.n * 10n ** BigInt(s.decimales), d: usdParRaw.d }; // USD per whole token
    row.source = `${s.pool.type} ${s.pool.pool} (${s.pool.note})`;
    row.prixPool = p.S === 0n ? null : usd(unit, 8);
    row.L = String(p.L);
    row.profondeurUsd = Math.round(usd(mul({ n: p.depthQuoteRaw, d: 1n }, usdParQ), 2));
    row.profondeur = s.pool.type === 'v4' ? 'virtual in-range quote (L, sqrtP)' : 'quote balance held by the pool';
    const gaps = refVals.map(({ f }) => { // |pool - ref| / ref in bps, exact
      const a = unit.n * f.d, b = f.n * unit.d; return (a > b ? a - b : b - a) * 10000n / b;
    });
    row.ecartBps = gaps.map(Number);
    const lisible = p.S !== 0n && p.L > 0n && row.profondeurUsd >= MIN_DEPTH_USD && refVals.length > 0 && gaps.every((g) => g <= MAX_GAP_BPS);
    if (lisible) {
      row.regle = 'POOL'; row.raw = ceilDiv(usdParRaw.d, usdParRaw.n); row.prixUsd = row.prixPool;
    } else {
      row.pourquoi = [p.L === 0n ? 'no active liquidity' : null, row.profondeurUsd < MIN_DEPTH_USD ? `depth $${row.profondeurUsd} < $${MIN_DEPTH_USD}` : null,
        gaps.some((g) => g > MAX_GAP_BPS) ? `pool vs reference gap ${row.ecartBps.join('/')} bps > ${MAX_GAP_BPS}` : null].filter(Boolean).join('; ');
      if (refVals.length < 2) throw new Error(s.sym + ': no readable pool price AND fewer than 2 references: refuse to size');
      const lo = refVals.map((r) => r.f).reduce((a, b) => (a.n * b.d <= b.n * a.d ? a : b));
      const hi = refVals.map((r) => r.f).reduce((a, b) => (a.n * b.d >= b.n * a.d ? a : b));
      if ((hi.n * lo.d - lo.n * hi.d) * 10000n > REF_AGREE_BPS * lo.n * hi.d) throw new Error(s.sym + ': references disagree: refuse to size');
      row.regle = 'REFERENCE'; row.raw = ceilDiv(10n ** BigInt(s.decimales) * lo.d, lo.n); row.prixUsd = usd(lo, 8);
    }
    row.valeurUsd = row.prixUsd * Number(row.raw) / 10 ** s.decimales;
    if (refVals.length) row.valeurRefBasseUsd = Math.min(...refVals.map(({ f }) => usd(f, 8))) * Number(row.raw) / 10 ** s.decimales;
    rows.push(row); console.error(s.sym, row.regle, String(row.raw), row.prixPool, row.ecartBps, row.profondeurUsd);
  }
  return { bloc, refsLues: R.lu, regle: { MAX_GAP_BPS: Number(MAX_GAP_BPS), REF_AGREE_BPS: Number(REF_AGREE_BPS), MIN_DEPTH_USD }, rows };
}

function ecrire(res) {
  const j = { ...res, rows: res.rows.map((r) => ({ ...r, raw: String(r.raw) })) };
  writeFileSync(join(ICI, 'plan/planchers-caution.json'), JSON.stringify(j, null, 1) + '\n');
  const L = [`# Caution floor per currency (hook 7030) — block ${res.bloc}, references read ${res.refsLues}`, '',
    `Rule: POOL = ceil($1 / on-chain pool price) when the pool is live, depth >= $${MIN_DEPTH_USD} and within ${MAX_GAP_BPS} bps of both references; REFERENCE = ceil($1 / lower of two references that agree within ${REF_AGREE_BPS} bps) — **no readable on-chain pool price: decision for Grok Bot**.`, '',
    '| # | currency | rule | price source pool | pool price $ | references $ | gap bps | depth $ (v4: virtual in-range) | raw minimum | $ value at the sizing price | $ value at the lower reference |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  res.rows.forEach((r, i) => L.push(`| ${i} | ${r.sym} | ${r.regle}${r.pourquoi ? ' (' + r.pourquoi + ')' : ''} | ${r.source || '-'} | ${r.prixPool ?? '-'} | ${Object.entries(r.refs).map(([k, v]) => k + ' ' + v).join(', ') || '-'} | ${(r.ecartBps || []).join(' / ') || '-'} | ${r.profondeurUsd ?? '-'} | ${r.raw} | ${r.valeurUsd.toFixed(4)} | ${r.valeurRefBasseUsd === undefined ? '-' : r.valeurRefBasseUsd.toFixed(4)} |`));
  writeFileSync(join(ICI, 'plan/PLANCHERS-CAUTION.md'), L.join('\n') + '\n');
}

function solidite() {
  const src = readFileSync(join(ICI, 'src/Devises7030.sol'), 'utf8');
  return Object.fromEntries([...src.matchAll(/uint256 internal constant PLANCHER_(\w+) = ([0-9_]+);/g)].map((m) => [m[1], BigInt(m[2].replace(/_/g, ''))]));
}

if (cmd === 'refs') await refs();
else if (cmd === 'size' || cmd === 'check') {
  const bloc = Number(opt('--block'));
  if (!Number.isInteger(bloc) || bloc <= 0) { console.error('--block N is required (pin it: the floor must be reproducible)'); process.exit(2); }
  const res = await size(bloc);
  if (cmd === 'size') { ecrire(res); for (const r of res.rows) console.log(`    uint256 internal constant PLANCHER_${r.sym.toUpperCase()} = ${r.raw};`); }
  else {
    const sol = solidite(); let ko = 0;
    for (const r of res.rows) { const v = sol[r.sym.toUpperCase()]; const ok = v === r.raw; if (!ok) ko++; console.log(`${ok ? 'OK ' : 'KO '} ${r.sym} script=${r.raw} sol=${v}`); }
    console.log(ko ? `MISMATCH ${ko}` : `ALL ${res.rows.length} MATCH`); process.exit(ko ? 1 : 0);
  }
} else { console.error('usage: refs | size --block N | check --block N'); process.exit(2); }
