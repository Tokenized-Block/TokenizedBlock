// banc-fly-sim-20261109.mjs — SIMULATED markets where the truth is known, to judge the fly's trading rules (Phil 09/11: "run simulations to
// prove whether it is good and what to improve"). The REAL fly (hemibrain circuit, fly-core.js session) trades each market; every window
// records its call, the move, and the record known when the call was made, so any sizing rule is replayed EXACTLY afterwards.
// Markets (deterministic LCG, no Math.random), noise per window = the shared fly's measured usual move (0.15%), fee 0.05% per switch:
//   noise    : no signal at all — a good rule loses ~nothing here
//   down     : no signal, the price drifts down (like SNDKc while the shared fly ran)
//   signal-1 : smell A is followed by a rise, B by a fall, 1 window later; signal-2: 2 windows later (what the trace is for)
//   weak-1   : the same, signal a quarter of the noise
// Rules compared: all-in fly (the old rule), Kelly variants (prior a, fraction f), always in, cash.
// It proves what these SYNTHETIC markets show; it does not prove anything about the real market. Usage: node banc-fly-sim-20261109.mjs [seeds] [windows]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFly, createSession } from './fly-core.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const circuit = JSON.parse(readFileSync(join(ICI, 'fly-brain-circuit.json'), 'utf8'));
/* FEE: the cost of one side of a trade (0.0005 = the pool fee alone; 0.0015 = pool + the app's 10 bps interface fee, the REAL cost the
 *   fork measured: a round trip of 6,000 units on 2,000,000). SCALE: a longer window = a bigger move per decision (x sqrt(time) for the
 *   noise and the signal, x time for the drift; SCALE = 3.16 is a 10x longer window) */
const FEE = Number(process.env.FEE || 0.0005), SCALE = Number(process.env.SCALE || 1);
const SEEDS = Number(process.argv[2] || 12), W = Number(process.argv[3] || 200), NOISE = 0.0015 * SCALE;
const lcg = (seed) => { let x = (seed * 2654435761) >>> 0 || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; };
const S = '0x' + '5'.repeat(40), P = '0x' + '9'.repeat(40);
const tx = (h, kind) => ({ tx: h, bloc: 1, signataire: S, mouvements: [kind === 'A' ? { de: P, vers: S, montant: String(30e8) } : { de: S, vers: P, montant: String(30e8) }] });
const MARKETS = {
  noise: { signal: 0, lag: 1, drift: 0 },
  down: { signal: 0, lag: 1, drift: -0.0002 * SCALE * SCALE },
  'signal-1': { signal: 0.0008 * SCALE, lag: 1, drift: 0 },
  'signal-2': { signal: 0.0008 * SCALE, lag: 2, drift: 0 },
  'weak-1': { signal: 0.0004 * SCALE, lag: 1, drift: 0 },
};

/** one market, one seed: the fly trades it; returns the per-window path [{ inWanted, move, tally }] */
function play(m, seed, threshold) {
  let lastDecision = null;
  const fly = createFly(circuit), ses = createSession(fly, (e) => { if (e.type === 'decision' && !e.sim) lastDecision = e.action; }, { threshold }), rnd = lcg(seed * 7919 + 13);
  const smells = [], path = [];
  let price = 100;
  ses.window({ symbol: 'X', price: { priceUsd: price, tokenDecimals: 8, feePips: Math.round(FEE * 1e6), block: 1 }, transactions: [] }); fly.drain();
  for (let w = 0; w < W; w++) {
    const k = rnd() < 0.5 ? 'A' : 'B'; smells.push(k);
    const n = ((rnd() + rnd() + rnd() + rnd()) - 2) * NOISE * 1.732; /* sum of 4 uniforms, scaled to an sd of about NOISE */
    const past = smells[smells.length - 1 - m.lag], sig = past === 'A' ? m.signal : past === 'B' ? -m.signal : 0;
    const before = { ...ses.state().tally }, prev = price, wanted = lastDecision === 'buy' || lastDecision === 'hold';
    price *= 1 + m.drift + sig + n;
    ses.window({ symbol: 'X', price: { priceUsd: price, tokenDecimals: 8, feePips: Math.round(FEE * 1e6), block: 1 }, transactions: [tx('0x' + seed.toString(16) + 'w' + w, k)] }); fly.drain();
    /* the window just settled the call made at the previous window, with the record known then (before this window's verdict) */
    path.push({ inWanted: wanted, move: price / prev - 1, tally: before });
  }
  return { path, tally: ses.state().tally, sessionFly: ses.state().books.fly.ret };
}
/** replay a sizing rule on a path: share(record) when the fly wants in, 0 otherwise; fee on the share that changes hands */
function replay(path, share, band = 0.005) {
  let e = 0, ret = 1, peak = 1, dd = 0, switches = 0, nM = 0, sAbs = 0, sSq = 0, ema = 0;
  for (const s of path) {
    /* what is known when the call is made: the record, and the moves seen BEFORE this window (mean |move|, mean move^2) */
    const stats = { meanAbs: nM ? sAbs / nM : 0, meanSq: nM ? sSq / nM : 0, n: nM, ema };
    /* band = Infinity: the size is set when it ENTERS and kept while in (only entry and exit pay a fee) */
    const want = s.inWanted ? share(s.tally, stats) : 0, to = want === 0 ? 0 : e === 0 ? want : Math.abs(want - e) > band ? want : e;
    if (to !== e) { ret *= 1 - Math.abs(to - e) * FEE; e = to; switches++; }
    ret *= 1 + e * s.move; peak = Math.max(peak, ret); dd = Math.max(dd, 1 - ret / peak);
    nM++; sAbs += Math.abs(s.move); sSq += s.move * s.move;
    /* the session's own usual move (fly-core typical: EMA, alpha 0.1, moves of 0 skipped) */
    if (s.move !== 0) ema = ema > 0 ? ema * 0.9 + Math.abs(s.move) * 0.1 : Math.abs(s.move);
  }
  return { ret, dd, switches };
}
const kelly = (a, f) => ({ consistent: k = 0, opposite: o = 0 }) => { const p = (k + a) / (k + o + 2 * a); return Math.max(0, Math.min(1, f * (2 * p - 1))); };
/* the existing record gate of the page (recordEdge p < 0.1 over >= 10 judged calls), as a sizing rule: all in once it beats a coin */
const binomP = (k, n) => { let lc = 0; const t = []; for (let i = 0; i <= n; i++) { if (i > 0) lc += Math.log((n - i + 1) / i); if (i >= k) t.push(lc - n * Math.LN2); } const m = Math.max(...t); return Math.min(1, Math.exp(m) * t.reduce((a, x) => a + Math.exp(x - m), 0)); };
const gated = ({ consistent: k = 0, opposite: o = 0 }) => (k + o >= 10 && binomP(k, k + o) < 0.1 ? 1 : 0);
const gatedAt = (pMax) => ({ consistent: k = 0, opposite: o = 0 }) => (k + o >= 10 && binomP(k, k + o) < pMax ? 1 : 0);
/* the edge pays the fee: the expected gain per window in, (2p - 1) x mean |move| (p shrunk by Beta(10, 10)), must exceed the one-way fee */
const pShrunk = ({ consistent: k = 0, opposite: o = 0 }) => (k + 10) / (k + o + 20);
const edgePays = (t, st) => ((2 * pShrunk(t) - 1) * st.meanAbs > FEE ? 1 : 0);
/* continuous Kelly: f* = mean / variance of the return while in, mean = (2p - 1) x mean |move|, variance = mean move^2; capped at 1 */
const kellyCont = (t, st) => (st.meanSq > 0 ? Math.max(0, Math.min(1, ((2 * pShrunk(t) - 1) * st.meanAbs) / st.meanSq)) : 0);
const RULES = process.env.RULES2 ? {
  'all-in fly (old)': [() => 1],
  'Kelly a=10 f=0.5 (shipped)': [kelly(10, 0.5)],
  'all-in once p<0.1 (gate)': [gatedAt(0.1), Infinity],
  'all-in once p<0.01 (gate)': [gatedAt(0.01), Infinity],
  'all-in once the edge pays the fee': [edgePays, Infinity],
  'edge pays the fee (session EMA)': [(t, st) => ((2 * pShrunk(t) - 1) * st.ema > FEE ? 1 : 0), Infinity],
  'gate p<0.1 AND edge pays fee': [(t, st) => gatedAt(0.1)(t) * edgePays(t, st), Infinity],
  'continuous Kelly, size at entry': [kellyCont, Infinity],
} : {
  'all-in fly (old)': [() => 1],
  'Kelly a=10 f=0.5 (shipped)': [kelly(10, 0.5)],
  'Kelly a=10 f=0.5, size at entry': [kelly(10, 0.5), Infinity],
  'Kelly a=2 f=0.5': [kelly(2, 0.5)],
  'Kelly a=30 f=0.5': [kelly(30, 0.5)],
  'Kelly a=10 f=1, size at entry': [kelly(10, 1), Infinity],
  'all-in once p<0.1 (gate)': [gated, Infinity],
};
const pct = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';
const t0 = Date.now(), out = {};
for (const threshold of (process.env.TH || '0.02,0.05').split(',').map(Number)) for (const [name, m] of Object.entries(MARKETS)) {
  const res = Object.fromEntries([...Object.keys(RULES), 'always in'].map((r) => [r, []])), acc = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const g = play(m, seed, threshold);
    for (const [r, [f, band]] of Object.entries(RULES)) res[r].push(replay(g.path, f, band));
    /* witness: the replayed all-in fly IS the session's own paper book (else the replay is lying) */
    const allIn = res['all-in fly (old)'][res['all-in fly (old)'].length - 1].ret;
    if (Math.abs(allIn - g.sessionFly) > 1e-9) { console.log('WITNESS FAILED: replay ' + allIn + ' vs session ' + g.sessionFly); process.exitCode = 1; }
    res['always in'].push(replay(g.path.map((s) => ({ ...s, inWanted: true })), () => 1));
    const n = g.tally.consistent + g.tally.opposite; acc.push(n ? g.tally.consistent / n : null);
  }
  const row = {};
  for (const [r, list] of Object.entries(res)) {
    const rets = list.map((x) => x.ret - 1).sort((a, b) => a - b);
    row[r] = { mean: rets.reduce((s, x) => s + x, 0) / rets.length, median: rets[rets.length >> 1], worst: rets[0], winShare: rets.filter((x) => x > 0).length / rets.length,
      dd: list.reduce((s, x) => s + x.dd, 0) / list.length, switches: list.reduce((s, x) => s + x.switches, 0) / list.length };
  }
  const a = acc.filter((x) => x !== null);
  out[threshold + ' ' + name] = row;
  console.log(`\n== market ${name} (threshold ${threshold}) — fly right ${(100 * a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)).toFixed(1)}% of its judged calls, ${SEEDS} seeds x ${W} windows`);
  for (const [r, v] of Object.entries(row)) console.log(`  ${r.padEnd(28)} mean ${pct(v.mean).padStart(8)} · median ${pct(v.median).padStart(8)} · worst ${pct(v.worst).padStart(8)} · seeds up ${(100 * v.winShare).toFixed(0).padStart(3)}% · drawdown ${(100 * v.dd).toFixed(2)}% · switches ${v.switches.toFixed(1)}`);
}
console.log('\n' + Math.round((Date.now() - t0) / 1000) + ' s');
