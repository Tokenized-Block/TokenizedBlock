// test-fly-patient-20261109.mjs — the PATIENT shadow book of fly-core.js (fixed 9 Nov, before any measure), with mutants.
// A stub fly whose tendency per window is set by the test: the session's real protocol (window -> predict -> settle on the next move, fee per
// switch) runs unchanged, so each book's value is computed by hand. Proves: a lukewarm call (|t| < 3 x threshold) keeps the patient's position
// and its fee; a strong one moves it; the "same windows" comparison starts where the patient started; an old saved state (no patient) starts
// it fresh at the next window, a new one keeps it. Does NOT prove the patient rule earns more on the real market: that is what it is
// running for, judged on windows it has never seen.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const S = '0x' + '5'.repeat(40), PP = '0x' + '9'.repeat(40);

async function banc(dir) {
  const { createSession, FLY } = await import(pathToFileURL(join(dir, 'fly-core.js')).href + '?t=' + Date.now() + Math.random());
  let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
  const make = () => {
    const q = [];
    /* learn() presents with onStart, predict() without: only a prediction takes the next tendency of the queue */
    const fly = { N: [], odorDrive: (m) => m, present: (d, { onStart, onPeak } = {}) => { if (onStart) { onStart(); if (onPeak) onPeak({}); return; } if (onPeak) onPeak({ t: q.length ? q.shift() : 0, ap: 0, av: 0, word: 'x' }); },
      addDopamine: () => 0, snapshot: () => null, weakened: () => [], thought: () => [] };
    const ses = createSession(fly, () => {});
    let k = 0;
    /* one window at price p, with one fresh trade (so the fly smells and decides, with tendency t) */
    /* the first window skips past trades (no smell, no prediction): its tendency is never asked for */
    const win = (p, t) => { if (k > 0) q.push(t); k++; ses.window({ symbol: 'X', price: { priceUsd: p, tokenDecimals: 0, feePips: 500, block: k }, transactions: [{ tx: '0x' + k.toString(16), bloc: k, signataire: S, mouvements: [{ de: PP, vers: S, montant: '1' }] }] }); };
    return { ses, win };
  };
  const fee = 1 - 500 / 1e6;
  ok(FLY.PATIENT === 3 && FLY.DECIDE === 0.02, 'the rule as fixed: 3 x 0.02');

  /* 1. lukewarm calls, alternating: the fly switches every window, the patient never enters */
  { const { ses, win } = make();
    win(100, 0); /* first window: past trades skipped, no smell */
    /* each lukewarm call is followed by the opposite move (approach then a fall, avoid then a rise) */
    const ts = [0.03, -0.03, 0.03, -0.03, 0.03, -0.03], prices = [100, 99, 100, 99, 100, 99, 100];
    for (let i = 0; i < ts.length; i++) win(prices[i], ts[i]);
    win(prices[ts.length], 0);
    const st = ses.state();
    ok(st.books.patient.switches === 0 && st.books.patient.ret === 1 && st.books.patient.pos === 0, 'lukewarm (|t| = 0.03 < 0.06): patient never moves, pays nothing (' + JSON.stringify(st.books.patient) + ')');
    ok(st.books.fly.switches >= 5, 'the fly switched on each lukewarm call: ' + st.books.fly.switches);
    ok(st.books.fly.ret < st.books.patient.ret, 'here the fly lost its fees and its timing: ' + st.books.fly.ret.toFixed(6));
  }
  /* 2. strong calls move it, exactly at 3 x threshold */
  { const { ses, win } = make();
    win(100, 0);
    win(100, 0.0601); win(110, 0.0599); win(99, -0.0601); win(90, 0.03); win(95, 0);
    /* settles: [100->110] patient enters (0.0601 > 0.06): fee, x1.10 ; [110->99] t 0.0599 keeps in: x0.9 ; [99->90] t -0.0601 exits: fee, flat ; [90->95] t 0.03 out: flat */
    const want = fee * 1.1 * (99 / 110) * fee;
    const p = ses.state().books.patient;
    ok(Math.abs(p.ret - want) < 1e-12 && p.switches === 2 && p.pos === 0, 'strong calls move it, lukewarm ones keep it: ' + p.ret + ' vs ' + want + ', ' + p.switches + ' switches');
    const sw = ses.state().sameWindows;
    ok(sw && sw.windows === 5 && /* 100->100 (the first settle, no tendency yet), then the four above */ Math.abs(sw.patient - p.ret) < 1e-15 && Math.abs(sw.hold - ses.state().books.hold.ret / ses.state().patientFrom.hold) < 1e-15, 'same-windows comparison: ' + JSON.stringify(sw));
  }
  /* 3. a quiet window (no tendency) keeps the position */
  { const { ses, win } = make();
    win(100, 0); win(100, 0.1); win(100, NaN); win(100, 0);
    ok(ses.state().books.patient.pos === 1 && ses.state().books.patient.switches === 1, 'no tendency -> the position is kept');
  }
  /* 4. restore: an old state (no patient) starts it fresh at the next window; a new state keeps it */
  { const { ses, win } = make();
    win(100, 0); win(100, 0.1); win(120, 0); win(120, 0);
    const saved = JSON.parse(JSON.stringify(ses.state()));
    const old = JSON.parse(JSON.stringify(saved)); delete old.books.patient; delete old.patientFrom; delete old.sameWindows;
    const a = make(); a.ses.restore(old);
    ok(a.ses.state().books.patient.ret === 1 && a.ses.state().patientFrom === null && a.ses.state().books.fly.ret === saved.books.fly.ret, 'old state: patient fresh, the others kept');
    const b = make(); b.ses.restore(saved);
    ok(b.ses.state().books.patient.ret === saved.books.patient.ret && b.ses.state().books.patient.pos === saved.books.patient.pos && JSON.stringify(b.ses.state().patientFrom) === JSON.stringify(saved.patientFrom), 'new state: patient and its start kept');
    const c = make(); const bad = JSON.parse(JSON.stringify(saved)); bad.patientFrom.fly = 0; c.ses.restore(bad);
    ok(c.ses.state().patientFrom === null && c.ses.state().books.patient.ret === 1, 'a broken start is not taken back: the comparison restarts');
  }
  return n;
}

const total = await banc(ICI);
console.log('test-fly-patient-20261109 : ' + total + ' assertions OK');
const MUT = [
  ['patient = the fly threshold', 'pos === 0 && t > FLY.PATIENT * decideAt ? 1 : pos === 1 && t < -FLY.PATIENT * decideAt ? 0 : pos', 'pos === 0 && t > decideAt ? 1 : pos === 1 && t < -decideAt ? 0 : pos'],
  ['quiet window moves it out', '(!Number.isFinite(t) ? pos :', '(!Number.isFinite(t) ? 0 :'],
  ['tendency not passed', 'if (done) done(word, action, t.t);', 'if (done) done(word, action);'],
  ['start re-taken each window', 'if (!patientFrom) patientFrom = { settled,', 'patientFrom = { settled,'],
  ['old state keeps a stale patient', 'if (!patientFrom) Object.assign(books.patient, { pos: 0, ret: 1, switches: 0 });', ''],
  ['broken start taken back', '&& Number.isFinite(pf.fly) && pf.fly > 0 &&', '&&'],
];
const src = readFileSync(join(ICI, 'fly-core.js'), 'utf8');
let tues = 0;
for (const [nom, de, a] of MUT) {
  const k = src.split(de).length - 1; if (k !== 1) { console.log('  ' + nom + ' : MOTIF x' + k + ' -> SURVIT'); continue; }
  const d = mkdtempSync(join(tmpdir(), 'fly-patient-mut-'));
  try { writeFileSync(join(d, 'fly-core.js'), src.replace(de, () => a)); await banc(d); console.log('  ' + nom + ' : SURVIT'); }
  catch (e) { tues++; console.log('  ' + nom + ' : TUE (' + String(e.message).slice(0, 90) + ')'); }
  finally { rmSync(d, { recursive: true, force: true }); }
}
assert.equal(tues, MUT.length, 'MUTANTS : ' + tues + '/' + MUT.length);
console.log('MUTANTS : ' + tues + '/' + MUT.length + ' tues');
