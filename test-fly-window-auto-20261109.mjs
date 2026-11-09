// test-fly-window-auto-20261109.mjs — the decision window FITTED TO THE STOCK (fly-core createSession { windowMs: 'auto' }), with mutants.
// Proves: the window = read interval x (cost of a side / EDGE_TARGET / usual move per read)^2, measured live, within [5 min, 2 h]; a quiet
// stock gets a long window, a nervous one the minimum; the fee read on chain enters the cost; the decision falls when that window closes;
// a reset (stock switch) forgets the stock's moves; the page and the server ask for 'auto'. Does NOT prove the sqrt(time) scaling holds
// on the real market (our assumption), nor that a window this long keeps the fly learning fast enough: both are said on the page.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const S = '0x' + '5'.repeat(40), PP = '0x' + '9'.repeat(40);

async function banc(dir) {
  const { createSession, FLY } = await import(pathToFileURL(join(dir, 'fly-core.js')).href + '?t=' + Date.now() + Math.random());
  let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
  ok(FLY.EDGE_TARGET === 0.3 && FLY.WINDOW_MIN_MS === 300000 && FLY.WINDOW_MAX_MS === 7200000, 'the constants as fixed');
  const make = (feePips = 500) => {
    const ev = [];
    const fly = { N: [], odorDrive: (m) => m, present: (d, { onStart, onPeak } = {}) => { if (onStart) { onStart(); if (onPeak) onPeak({}); return; } if (onPeak) onPeak({ t: 0.1, ap: 0, av: 0, word: 'x' }); },
      addDopamine: () => 0, snapshot: () => null, weakened: () => [], thought: () => [] };
    const ses = createSession(fly, (e) => ev.push(e), { windowMs: 'auto' });
    let k = 0;
    const read = (at, p) => { k++; return ses.window({ symbol: 'X', at, price: p == null ? null : { priceUsd: p, tokenDecimals: 0, feePips, block: k }, transactions: [{ tx: '0x' + k.toString(16), bloc: k, signataire: S, mouvements: [{ de: PP, vers: S, montant: '1' }] }] }); };
    return { ses, ev, read };
  };
  /* a stock whose price alternates by exactly m per read, every 30 s: usual move per read -> m, interval -> 30 s */
  const expected = (m, feePips = 500) => Math.min(7200000, Math.max(300000, Math.round(30000 * (((feePips / 1e6 + 0.001) / 0.3) / m) ** 2)));
  const T0 = 1_000_000;
  for (const [m, label] of [[0.0003, 'quiet (0.03% a read)'], [0.0008, 'GOOGLc-like (0.08%)'], [0.002, 'nervous (0.2%)'], [0.00005, 'asleep (0.005%)']]) {
    const { ses, read } = make(); let p = 100;
    for (let i = 0; i < 400; i++) { read(T0 + i * 30000, p); p *= i % 2 ? 1 / (1 + m) : 1 + m; }
    const w = ses.state().windowMs, want = expected(m);
    ok(Math.abs(w - want) / want < 0.02, label + ': window ' + Math.round(w / 60000) + ' min vs ' + Math.round(want / 60000) + ' min computed by hand');
  }
  { /* the fee read on chain enters the cost: a 0.3% pool fee asks for a longer window than 0.05% */
    const a = make(500), b = make(3000); let p = 100;
    for (let i = 0; i < 300; i++) { a.read(T0 + i * 30000, p); b.read(T0 + i * 30000, p); p *= i % 2 ? 1 / 1.0008 : 1.0008; }
    ok(b.ses.state().windowMs > a.ses.state().windowMs * 2, 'a dearer route asks for a longer window: ' + Math.round(a.ses.state().windowMs / 60000) + ' -> ' + Math.round(b.ses.state().windowMs / 60000) + ' min');
  }
  { /* the decision falls when the fitted window closes, not at 5 min */
    const { ses, ev, read } = make(); let p = 100, i = 0;
    for (; i < 200; i++) { read(T0 + i * 30000, p); p *= i % 2 ? 1 / 1.0006 : 1.0006; }
    const w = ses.state().windowMs, before = ev.filter((e) => e.type === 'decision').length;
    const t1 = T0 + i * 30000; let firstAfter = null;
    for (let j = 0; j * 30000 < w + 60000; j++) { const r = read(t1 + j * 30000, p); p *= (i + j) % 2 ? 1 / 1.0006 : 1.0006; if (!r.gathering && firstAfter === null && j > 0) firstAfter = j * 30000; }
    ok(w > 600000 && ev.filter((e) => e.type === 'decision').length >= before + 1 && firstAfter !== null && firstAfter <= w + 30000, 'decided when the fitted window (' + Math.round(w / 60000) + ' min) closed: after ' + Math.round(firstAfter / 60000) + ' min');
  }
  { /* a reset (stock switch) forgets the stock's moves */
    const { ses, read } = make(); let p = 100;
    for (let i = 0; i < 100; i++) { read(T0 + i * 30000, p); p *= i % 2 ? 1 / 1.0002 : 1.0002; }
    const w = ses.state().windowMs; ses.reset();
    ok(w > 300000 && ses.state().windowMs === 300000 && ses.state().readMove === 0, 'after a reset: back to the minimum until the new stock is measured (' + Math.round(w / 60000) + ' -> 5 min)');
  }
  return n;
}

const total = await banc(ICI);
const page = readFileSync(join(ICI, 'fly-brain.js'), 'utf8'), srv = readFileSync(join(ICI, 'serveur-web.js'), 'utf8');
assert.ok(page.includes("session = createSession(fly, onEvent, { windowMs: 'auto' });"), 'the page fits the window to the stock');
assert.ok(/MOUCHE\.session = createSession\(MOUCHE\.fly, [\s\S]{0,700}\}, \{ windowMs: 'auto' \}\);/.test(srv), 'the server fly fits the window to its stock');
console.log('test-fly-window-auto-20261109 : ' + (total + 2) + ' assertions OK');

const MUT = [
  ['auto ignored (always 5 min)', "const AUTO = windowMs === 'auto',", "const AUTO = false,"],
  ['linear, not squared', 'readDt * (target / readMove) ** 2', 'readDt * (target / readMove)'],
  ['no 2 h cap', 'Math.min(FLY.WINDOW_MAX_MS, Math.max(FLY.WINDOW_MIN_MS,', 'Math.min(Infinity, Math.max(FLY.WINDOW_MIN_MS,'],
  ['no 5 min floor', 'Math.max(FLY.WINDOW_MIN_MS, readDt', 'Math.max(0, readDt'],
  ['interface fee left out', 'const cost = (feePips == null ? 500 : feePips) / 1e6 + FLY.INTERFACE_FEE,', 'const cost = (feePips == null ? 500 : feePips) / 1e6,'],
  ['pool fee left out', 'const cost = (feePips == null ? 500 : feePips) / 1e6 + FLY.INTERFACE_FEE,', 'const cost = FLY.INTERFACE_FEE,'],
  ['reset keeps the moves', 'pendFrom = null; readMove = 0; readDt = 0; lastRead = null; }', 'pendFrom = null; }'],
];
const src = readFileSync(join(ICI, 'fly-core.js'), 'utf8').replace(/\r\n/g, '\n');
let tues = 0;
for (const [nom, de, a] of MUT) {
  const k = src.split(de).length - 1; if (k !== 1) { console.log('  ' + nom + ' : MOTIF x' + k + ' -> SURVIT'); continue; }
  const d = mkdtempSync(join(tmpdir(), 'fly-auto-mut-'));
  try { writeFileSync(join(d, 'fly-core.js'), src.replace(de, () => a)); await banc(d); console.log('  ' + nom + ' : SURVIT'); }
  catch (e) { tues++; console.log('  ' + nom + ' : TUE (' + String(e.message).slice(0, 90) + ')'); }
  finally { rmSync(d, { recursive: true, force: true }); }
}
assert.equal(tues, MUT.length, 'MUTANTS : ' + tues + '/' + MUT.length);
console.log('MUTANTS : ' + tues + '/' + MUT.length + ' tues');
