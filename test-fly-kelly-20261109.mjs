// test-fly-kelly-20261109.mjs — the fly sized by its record (fly-core.kellyFraction + the Kelly paper book + the real-buy rule), with mutants.
// A stub fly whose tendency per window is set by the test runs the session's real protocol; an INDEPENDENT replay of the rule (share = half
// Kelly of the record known when the call was made, fees on the share that changes hands, no rebalance under the band) must give the
// module's book, window by window. Does NOT prove Kelly earns more on the real market: it bets in proportion to a measured edge, so with
// no edge it bets ~nothing; whether the edge grows is what the record will show.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const S = '0x' + '5'.repeat(40), PP = '0x' + '9'.repeat(40), FEE = 500;

async function banc(dir) {
  const { createSession, kellyFraction, FLY } = await import(pathToFileURL(join(dir, 'fly-core.js')).href + '?t=' + Date.now() + Math.random());
  let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
  ok(FLY.KELLY_PRIOR === 10 && FLY.KELLY_FRACTION === 0.5 && FLY.KELLY_BAND === 0.005, 'the constants as fixed');
  /* 1. the fraction */
  const near = (a, b) => Math.abs(a - b) < 1e-12;
  ok(kellyFraction({}) === 0 && kellyFraction({ consistent: 0, opposite: 0 }) === 0, 'no record: it does not bet');
  ok(near(kellyFraction({ consistent: 192, opposite: 180 }), 0.5 * (2 * 202 / 392 - 1)), 'the shared fly today (192 / 180): ' + kellyFraction({ consistent: 192, opposite: 180 }));
  ok(kellyFraction({ consistent: 10, opposite: 30 }) === 0, 'a losing record: 0, never a short');
  ok(near(kellyFraction({ consistent: 3, opposite: 0 }), 0.5 * (2 * 13 / 23 - 1)) && kellyFraction({ consistent: 3, opposite: 0 }) < 0.07, 'three right in a row is worth little: the prior holds it back');
  ok(near(kellyFraction({ consistent: 1000, opposite: 0 }), 0.5 * (2 * 1010 / 1020 - 1)) && kellyFraction({ consistent: 1e6, opposite: 0 }) <= 0.5, 'half Kelly: never more than half the money');

  /* 2. the book, replayed independently */
  const make = () => {
    const q = [], ev = [];
    const fly = { N: [], odorDrive: (m) => m, present: (d, { onStart, onPeak } = {}) => { if (onStart) { onStart(); if (onPeak) onPeak({}); return; } if (onPeak) onPeak({ t: q.length ? q.shift() : 0, ap: 0, av: 0, word: 'x' }); },
      addDopamine: () => 0, snapshot: () => null, weakened: () => [], thought: () => [] };
    const ses = createSession(fly, (e) => ev.push(e));
    let k = 0;
    const win = (p, t) => { if (k > 0) q.push(t); k++; ses.window({ symbol: 'X', price: { priceUsd: p, tokenDecimals: 0, feePips: FEE, block: k }, transactions: [{ tx: '0x' + k.toString(16), bloc: k, signataire: S, mouvements: [{ de: PP, vers: S, montant: '1' }] }] }); };
    return { ses, win, ev };
  };
  { const { ses, win, ev } = make();
    /* a fly that is RIGHT most of the time: approach before a rise, avoid before a fall, with a few misses */
    const plan = []; let p = 100;
    for (let i = 0; i < 120; i++) { const up = (i * 7) % 5 !== 0, right = i % 6 !== 3; plan.push([p, (up === right ? 1 : -1) * 0.1]); p *= up ? 1.004 : 0.996; }
    let e = 0, ret = 1, prevP = null, decision = null;
    win(100, 0); prevP = 100;
    for (const [price, t] of plan) {
      const before = ses.state().tally, move = price / prevP - 1;
      if (ses.state().feePips != null) {
        const flyIn = decision === 'buy' || decision === 'hold', share = flyIn ? kellyFraction(before) : 0;
        const to = share === 0 ? 0 : Math.abs(share - e) > 0.005 ? share : e;
        if (to !== e) { ret *= 1 - Math.abs(to - e) * FEE / 1e6; e = to; }
        ret *= 1 + e * move;
      }
      const nEv = ev.length; win(price, t); prevP = price;
      const d = ev.slice(nEv).filter((x) => x.type === 'decision').pop(); decision = d ? d.action : decision;
      const kb = ses.state().books.kelly;
      ok(Math.abs(kb.ret - ret) < 1e-12 && Math.abs(kb.pos - e) < 1e-15, 'window ' + n + ': module ' + kb.ret + ' / ' + kb.pos + ' vs replay ' + ret + ' / ' + e);
    }
    const st = ses.state();
    ok(st.tally.consistent > st.tally.opposite && st.books.kelly.pos < 0.5 && st.books.kelly.switches < st.books.fly.switches + 40, 'a right fly earns a share, never all: ' + JSON.stringify({ tally: st.tally, kelly: st.books.kelly, fly: st.books.fly.switches }));
    ok(st.kellyShare === kellyFraction(st.tally) && st.sameWindows && st.sameWindows.windows === 120 && st.sameWindows.kelly === st.books.kelly.ret, 'state says the share and the same-windows comparison: ' + JSON.stringify(st.sameWindows));
  }
  { /* 3. a fly with no record never bets, whatever it calls */
    const { ses, win } = make(); win(100, 0);
    for (let i = 0; i < 6; i++) win(i % 2 ? 99 : 101, i % 2 ? -0.1 : 0.1);
    /* each call is followed by the opposite move: a record of losses */
    ok(ses.state().books.kelly.ret === 1 && ses.state().books.kelly.switches === 0 && ses.state().books.fly.ret < 1, 'no edge: Kelly holds nothing, pays nothing; the all-in fly lost ' + ses.state().books.fly.ret);
  }
  { /* 4. restore: fractional share kept; old state (no kelly) starts fresh; broken start dropped */
    const { ses, win } = make(); win(100, 0);
    for (let i = 0; i < 40; i++) win(100 * (1 + 0.003 * (i + 1)), 0.1);
    const saved = JSON.parse(JSON.stringify(ses.state()));
    ok(saved.books.kelly.pos > 0 && saved.books.kelly.pos < 1, 'a fractional share to restore: ' + saved.books.kelly.pos);
    const a = make(); a.ses.restore(saved);
    ok(a.ses.state().books.kelly.pos === saved.books.kelly.pos && a.ses.state().books.kelly.ret === saved.books.kelly.ret && JSON.stringify(a.ses.state().kellyFrom) === JSON.stringify(saved.kellyFrom), 'the share and its start come back');
    const old = JSON.parse(JSON.stringify(saved)); delete old.books.kelly; delete old.kellyFrom;
    const b = make(); b.ses.restore(old);
    ok(b.ses.state().books.kelly.ret === 1 && b.ses.state().books.kelly.pos === 0 && b.ses.state().kellyFrom === null && b.ses.state().books.fly.ret === saved.books.fly.ret, 'an old state: Kelly fresh, the rest kept');
    const bad = JSON.parse(JSON.stringify(saved)); bad.kellyFrom.hold = 0;
    const c = make(); c.ses.restore(bad);
    ok(c.ses.state().kellyFrom === null && c.ses.state().books.kelly.ret === 1, 'a broken start is not taken back');
  }
  return n;
}

const total = await banc(ICI);
/* the real buy follows the same rule (page source: fly-brain.js is a browser module; its money path is exercised on the fork bench) */
const page = readFileSync(join(ICI, 'fly-brain.js'), 'utf8');
assert.ok(/const share = kellyFraction\(session\.state\(\)\.tally\), r = recordEdge\(session\.state\(\)\.tally\);\s*const amt = BigInt\(Math\.floor\(Number\(base\) \* share\)\);\s*if \(amt < 100000n\) \{ autoNote\(/.test(page), 'the real BUY is sized by kellyFraction and refused under 0.10 USDC');
assert.ok(/de = USDC_BASE; vers = stock\.address; montant = amt\.toString\(\);/.test(page), 'the sized amount is what is planned');
console.log('test-fly-kelly-20261109 : ' + (total + 2) + ' assertions OK');

const MUT = [
  ['no prior (raw record)', 'a = FLY.KELLY_PRIOR;', 'a = 0;'],
  ['full Kelly', 'FLY.KELLY_FRACTION * (2 * p - 1)', '(2 * p - 1)'],
  ['a losing record shorts', 'return Math.max(0, Math.min(1, FLY.KELLY_FRACTION * (2 * p - 1)));', 'return Math.min(1, FLY.KELLY_FRACTION * (2 * p - 1));'],
  ['no band', 'Math.abs(share - kb.pos) > FLY.KELLY_BAND ? share : kb.pos', 'share'],
  ['fee on everything', 'b.ret *= 1 - Math.abs(want[k] - b.pos) * feePips / 1e6;', 'b.ret *= 1 - feePips / 1e6;'],
  ['all in when it calls', 'const share = flyWants ? kellyFraction(tally) : 0', 'const share = flyWants ? 1 : 0'],
  ['share rounded at restore', 'const posOf = (v) => (Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0);', 'const posOf = (v) => (v === 1 ? 1 : 0);'],
  ['old state keeps a stale Kelly', 'if (!kellyFrom) Object.assign(books.kelly, { pos: 0, ret: 1, switches: 0 });', ''],
  ['start re-taken each window', 'if (!kellyFrom) kellyFrom = { settled,', 'kellyFrom = { settled,'],
];
const src = readFileSync(join(ICI, 'fly-core.js'), 'utf8');
let tues = 0;
for (const [nom, de, a] of MUT) {
  const k = src.split(de).length - 1; if (k !== 1) { console.log('  ' + nom + ' : MOTIF x' + k + ' -> SURVIT'); continue; }
  const d = mkdtempSync(join(tmpdir(), 'fly-kelly-mut-'));
  try { writeFileSync(join(d, 'fly-core.js'), src.replace(de, () => a)); await banc(d); console.log('  ' + nom + ' : SURVIT'); }
  catch (e) { tues++; console.log('  ' + nom + ' : TUE (' + String(e.message).slice(0, 90) + ')'); }
  finally { rmSync(d, { recursive: true, force: true }); }
}
assert.equal(tues, MUT.length, 'MUTANTS : ' + tues + '/' + MUT.length);
console.log('MUTANTS : ' + tues + '/' + MUT.length + ' tues');
