// test-fly-window-20261109.mjs — the fly decides once per decision window (fly-core createSession { windowMs }), with mutants.
// Proves: every trade is still emitted as it is read (the screen stays live); between two decisions nothing is judged, learnt or decided;
// the decision smells the trades SUMMED over the window and the move since the last decision; a window closes only on a read with a
// price; windowMs 0 keeps one decision per read; the page and the server ask for FLY.WINDOW_MS. Does NOT prove 5 min is the best length:
// the simulation (banc-fly-sim, real costs) only showed that 10x longer windows let the edge rule trade where 30 s windows never could.
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
  ok(FLY.WINDOW_MS === 300000, 'the window as fixed: 5 min');
  const make = (windowMs) => {
    const ev = [], presented = [];
    const fly = { N: [], odorDrive: (m) => m, present: (d, { onStart, onPeak } = {}) => { if (onStart) { onStart(); if (onPeak) onPeak({}); return; } presented.push(d); if (onPeak) onPeak({ t: 0.1, ap: 0, av: 0, word: 'x' }); },
      addDopamine: () => 0, snapshot: () => null, weakened: () => [], thought: () => [] };
    const ses = createSession(fly, (e) => ev.push(e), { windowMs });
    let k = 0;
    const read = (at, p, units = 1) => { k++; return ses.window({ symbol: 'X', at, price: p == null ? null : { priceUsd: p, tokenDecimals: 0, feePips: 500, block: k }, transactions: [{ tx: '0x' + k.toString(16), bloc: k, signataire: S, mouvements: [{ de: PP, vers: S, montant: String(units) }] }] }); };
    return { ses, ev, read, presented };
  };
  const T0 = 1_000_000;
  { const { ses, ev, read, presented } = make(300000);
    read(T0, 100);                                     /* first read: trades skipped (already on chain), closes at once: the reference */
    const d0 = ev.filter((e) => e.type === 'decision').length;
    const g = [];
    for (let s = 30; s < 300; s += 30) g.push(read(T0 + s * 1000, 100 + s / 100, 2));
    ok(g.every((r) => r.gathering), 'reads inside the window only gather');
    ok(ev.filter((e) => e.type === 'tx').length === 9, 'every trade is still shown as it is read: ' + ev.filter((e) => e.type === 'tx').length);
    ok(ev.filter((e) => e.type === 'decision').length === d0 && !ev.some((e) => e.type === 'verdict' || e.type === 'taught'), 'nothing judged, taught or decided inside the window');
    const before = presented.length;
    const r = read(T0 + 300000, 103, 2);
    ok(!r.gathering, 'the read at 5 min closes the window');
    const dec = ev.filter((e) => e.type === 'decision');
    ok(dec.length === d0 + 1, 'one decision at the close');
    /* 9 reads of 2 units at ~$100 + this read's 2 units at $103: the smell is their SUM (received: the fly's signer received) */
    const want = [30, 60, 90, 120, 150, 180, 210, 240, 270].reduce((s, x) => s + 2 * (100 + x / 100), 0) + 2 * 103;
    ok(Math.abs(dec[dec.length - 1].mix.received - want) < 1e-9 && presented.length === before + 1, 'the decision smells the trades summed over the window: ' + dec[dec.length - 1].mix.received + ' vs ' + want);
    /* the next window: its move is measured from the last decision (103), not from the last read */
    for (let s = 330; s < 600; s += 30) read(T0 + s * 1000, 110);
    read(T0 + 600000, 113.3);
    const v = ev.filter((e) => e.type === 'verdict' || e.type === 'taught');
    ok(v.length > 0 && v.every((e) => Math.abs(e.move - (113.3 / 103 - 1)) < 1e-12 || e.type === 'taught'), 'the move is from the last decision to this one: ' + (v.find((e) => e.type === 'verdict') || {}).move);
    ok(ses.state().settled === 2, 'one settle per window: ' + ses.state().settled);
  }
  { /* a close needs a price: a read without one keeps gathering */
    const { ev, read } = make(300000);
    read(T0, 100); read(T0 + 30000, 100);
    const r = read(T0 + 310000, null);
    ok(r.gathering && ev.filter((e) => e.type === 'decision').length === 0, 'no price at 5 min: still gathering (the first read smelt nothing: no decision yet)');
    const r2 = read(T0 + 340000, 101);
    ok(!r2.gathering && ev.filter((e) => e.type === 'decision').length === 1, 'the next read with a price closes it');
  }
  { /* windowMs 0: one decision per read (the benches and the simulation) */
    const { ev, read } = make(0);
    read(T0, 100); read(T0 + 1000, 101); read(T0 + 2000, 102);
    ok(ev.filter((e) => e.type === 'decision').length === 2, 'windowMs 0: a decision at every read after the first (it smelt nothing)');
  }
  { /* reset drops what was gathered */
    const { ses, ev, read } = make(300000);
    read(T0, 100); read(T0 + 30000, 100, 50); ses.reset(); const mark = ev.length;
    read(T0 + 60000, 100); read(T0 + 360000, 100, 1);
    const after = ev.slice(mark).filter((e) => e.type === 'decision');
    ok(after.length === 1 && after[0].mix.received === 100, 'after a reset the gathered trades are gone: ' + JSON.stringify(after.map((e) => e.mix.received)));
  }
  return n;
}

const total = await banc(ICI);
const page = readFileSync(join(ICI, 'fly-brain.js'), 'utf8'), srv = readFileSync(join(ICI, 'serveur-web.js'), 'utf8');
/* game317: the page and the server fit the window to the stock ('auto', see test-fly-window-auto); this bench keeps the window mechanics */
assert.ok(page.includes("session = createSession(fly, onEvent, { windowMs: 'auto' });"), 'the page decides per window');
assert.ok(/MOUCHE\.session = createSession\(MOUCHE\.fly, [\s\S]{0,700}\}, \{ windowMs: 'auto' \}\);/.test(srv), 'the server fly decides per window');
console.log('test-fly-window-20261109 : ' + (total + 2) + ' assertions OK');

const MUT = [
  ['no window (decides every read)', 'W_MS = AUTO ? FLY.WINDOW_MIN_MS : Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 0;', 'W_MS = 0;'],
  ['last read only, not the sum', "for (const k of ['received', 'sent', 'moved']) mix[k] = pend[k];", ''],
  ['closes without a price', 'if (prevWin && (at - pendFrom < wNow || p == null))', 'if (prevWin && (at - pendFrom < wNow))'],
  ['never closes', 'if (prevWin && (at - pendFrom < wNow || p == null))', 'if (prevWin)'],
  ['window not restarted at close', "pend = { received: 0, sent: 0, moved: 0 }; pendFrom = at;\n    }", "pend = { received: 0, sent: 0, moved: 0 };\n    }"],
  ['reset keeps the gathered trades', 'recent = []; pend = { received: 0, sent: 0, moved: 0 }; pendFrom = null; readMove = 0;', 'recent = []; readMove = 0;'],
];
const src = readFileSync(join(ICI, 'fly-core.js'), 'utf8').replace(/\r\n/g, '\n');
let tues = 0;
for (const [nom, de, a] of MUT) {
  const k = src.split(de).length - 1; if (k !== 1) { console.log('  ' + nom + ' : MOTIF x' + k + ' -> SURVIT'); continue; }
  const d = mkdtempSync(join(tmpdir(), 'fly-window-mut-'));
  try { writeFileSync(join(d, 'fly-core.js'), src.replace(de, () => a)); await banc(d); console.log('  ' + nom + ' : SURVIT'); }
  catch (e) { tues++; console.log('  ' + nom + ' : TUE (' + String(e.message).slice(0, 90) + ')'); }
  finally { rmSync(d, { recursive: true, force: true }); }
}
assert.equal(tues, MUT.length, 'MUTANTS : ' + tues + '/' + MUT.length);
console.log('MUTANTS : ' + tues + '/' + MUT.length + ' tues');
