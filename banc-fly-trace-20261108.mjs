// banc-fly-trace-20261108.mjs — does the eligibility trace make the fly learn REAL patterns better, without inventing patterns in
// noise? A synthetic market, deterministic (LCG, no Math.random): each window brings smell A ("received") or B ("sent"), drawn at
// random; A is followed by a rise and B by a fall, LAG windows later, of size SIGNAL, inside a noise of size NOISE per window.
// Scored after W windows, on many seeds, with the session's own default threshold:
//   correct = A approach AND B avoid · wrong = A avoid AND B approach · decided = any of A or B not undecided.
// The null control (SIGNAL = 0) must stay undecided as often as before: a trace that "decides" on noise is a defect, not progress.
// Not in the series (minutes of CPU); its numbers are what justify FLY.TRACE. Usage: node banc-fly-trace-20261108.mjs [seeds] [windows]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFly, createSession, wordOf } from './fly-core.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const circuit = JSON.parse(readFileSync(join(ICI, 'fly-brain-circuit.json'), 'utf8'));
const SEEDS = Number(process.argv[2] || 8), W = Number(process.argv[3] || 50);
const lcg = (seed) => { let x = (seed * 2654435761) >>> 0 || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; };
const S = '0x' + '5'.repeat(40), P = '0x' + '9'.repeat(40);
const tx = (h, kind) => ({ tx: h, bloc: 1, signataire: S, mouvements: [kind === 'A' ? { de: P, vers: S, montant: String(30e8) } : { de: S, vers: P, montant: String(30e8) }] });

function run({ trace, lag, signal, noise, seed }) {
  const fly = createFly(circuit), ses = createSession(fly, () => {}, { trace }), rnd = lcg(seed);
  const smells = [], pending = new Map();
  let price = 100; ses.window({ symbol: 'X', price: { priceUsd: price, tokenDecimals: 8, feePips: 500, block: 1 }, transactions: [] }); fly.drain();
  for (let w = 0; w < W; w++) {
    const k = rnd() < 0.5 ? 'A' : 'B'; smells.push(k);
    /* the move of THIS window: noise, plus the signal of the smell LAG windows ago (Box-Muller-free: sum of 4 uniforms) */
    const n = ((rnd() + rnd() + rnd() + rnd()) - 2) * noise;
    const past = smells[smells.length - 1 - lag], drift = past === 'A' ? signal : past === 'B' ? -signal : 0;
    price *= 1 + drift + n;
    ses.window({ symbol: 'X', price: { priceUsd: price, tokenDecimals: 8, feePips: 500, block: 1 }, transactions: [tx('0x' + seed.toString(16) + 'w' + w, k)] }); fly.drain();
  }
  const ask = (k) => { const m = k === 'A' ? { received: 30 * price, sent: 0, moved: 0 } : { received: 0, sent: 30 * price, moved: 0 }; let t = null;
    fly.present(fly.odorDrive(m), { onPeak: (x) => { t = x; } }); fly.drain(); return wordOf(t.t); };
  const a = ask('A'), b = ask('B');
  return { correct: a === 'approach' && b === 'avoid', wrong: a === 'avoid' && b === 'approach', decided: a !== 'undecided' || b !== 'undecided' };
}

const t0 = Date.now(), rows = [];
for (const signal of [0.0004, 0]) for (const lag of [1, 2]) for (const trace of [1, 3]) {
  if (signal === 0 && lag === 2) continue;
  const r = { correct: 0, wrong: 0, decided: 0 };
  for (let seed = 1; seed <= SEEDS; seed++) { const x = run({ trace, lag, signal, noise: 0.0008, seed }); for (const k of Object.keys(r)) r[k] += x[k] ? 1 : 0; }
  rows.push({ signal, lag: signal ? lag : '-', trace, ...r });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
console.log(SEEDS + ' seeds x ' + W + ' windows each, noise 0.08% per window, ' + Math.round((Date.now() - t0) / 1000) + ' s');
