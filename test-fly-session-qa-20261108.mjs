// test-fly-session-qa-20261108.mjs — defects of the fly's market protocol (fly-core.js createSession) found by SIMULATION on 2026-11-08
// (QA of the autonomous fly), each with a mutant that puts the defect back:
//  1. a first window whose trades were NOT read cleared the "first window" flag: the next window smelled the whole backlog of past
//     trades as if they had just happened (50 old transactions -> 50 "tx" events, a decision, and with a funded wallet a real order);
//  2. a restart (server deploy, page reload) dropped the paper positions: "Always in" was put out and paid one fake switch fee per restart;
//  3. a restart dropped the eligibility trace: the smells of the last windows were never taught by the moves that followed them.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const circuit = JSON.parse(readFileSync(join(ICI, 'fly-brain-circuit.json'), 'utf8'));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const SIGNER = '0x' + 'a'.repeat(40), OTHER = '0x' + 'b'.repeat(40);
const txOf = (k, kind = 'received', units = 10n ** 8n) => ({ tx: '0x' + k.toString(16).padStart(64, '0'), bloc: 1000 + k, signataire: SIGNER,
  mouvements: [kind === 'received' ? { de: OTHER, vers: SIGNER, montant: units.toString() } : { de: SIGNER, vers: OTHER, montant: units.toString() }] });
const price = (p) => ({ priceUsd: p, tokenDecimals: 8, feePips: 500, block: 1 });

async function banc(dir) {
  n = 0;
  const { createFly, createSession } = await import(pathToFileURL(join(dir, 'fly-core.js')).href + '?t=' + Date.now() + Math.random());
  const fly = createFly(circuit);

  /* 1. the first window's trades are not read: the backlog must still be skipped when they are */
  { const ev = []; const s = createSession(fly, (e) => ev.push(e));
    s.window({ symbol: 'X', price: price(100), transactions: null });
    const backlog = Array.from({ length: 50 }, (_, k) => txOf(k + 1));
    s.window({ symbol: 'X', price: price(100), transactions: backlog }); fly.drain();
    const txs = ev.filter((e) => e.type === 'tx').length, sk = ev.find((e) => e.type === 'skipped');
    ok(txs === 0 && sk && sk.n === 50, 'a first window without trades read does not make the backlog fresh: ' + txs + ' tx smelled, skipped ' + (sk && sk.n));
    s.window({ symbol: 'X', price: price(101), transactions: [...backlog, txOf(51)] }); fly.drain();
    ok(ev.filter((e) => e.type === 'tx').length === 1, 'the next new trade is smelled, once');
  }

  /* 2 + 3. a restart in the middle of a run gives the same books and the same pending lessons as no restart */
  const windows = []; let p = 100, k = 1000;
  for (let w = 0; w < 24; w++) { p *= 1 + (w % 3 === 0 ? 0.004 : w % 3 === 1 ? -0.003 : 0.002); windows.push({ price: price(p), transactions: w % 2 ? [txOf(k++, w % 4 ? 'received' : 'sent')] : [] }); }
  const run = (cut) => {
    const f = createFly(circuit), s0 = createSession(f, () => {}); let s = s0;
    windows.forEach((w, i) => {
      if (i === cut) { const st = JSON.parse(JSON.stringify(s.state())), mem = f.exportMemory(); f.importMemory(mem); s = createSession(f, () => {}); s.restore(st);
        /* the restarted session skips the first window's trades as already seen: this window has none, so both runs see the same */ }
      s.window({ symbol: 'X', ...w }); f.drain();
    });
    return { st: s.state(), next: s.next() };
  };
  const a = run(-1), b = run(12);
  ok(windows[12].transactions.length === 0, 'the restart lands on a window without new trades');
  ok(b.st.books.hold.pos === 1 && b.st.books.hold.switches === a.st.books.hold.switches,
    '"Always in" stays in across a restart, no fake switch fee: switches ' + a.st.books.hold.switches + ' vs ' + b.st.books.hold.switches);
  /* a restart breaks the chain of windows (by design: the price before it may be hours old): the move into the first window after it is
   *   not booked. Everything else of "Always in" is the same, fee included */
  const lost = windows[12].price.priceUsd / windows[11].price.priceUsd - 1;
  ok(Math.abs(b.st.books.hold.ret * (1 + lost) - a.st.books.hold.ret) < 1e-12 && b.st.settled === a.st.settled - 1,
    '"Always in" after a restart = without it, less only the one move not seen across the restart (no fee): ' + a.st.books.hold.ret + ' vs ' + b.st.books.hold.ret);
  /* restarted on the second-to-last window: the smell of the window before it is still waiting for its lessons */
  const c = run(22);
  ok(windows[22].transactions.length === 0 && windows[21].transactions.length === 1, 'the late restart lands just after a window with a trade');
  ok(JSON.stringify(a.next && a.next.lessons) === JSON.stringify(c.next && c.next.lessons) && a.next.lessons.length === 2,
    'the pending lessons (eligibility trace) survive a restart: ' + JSON.stringify(a.next && a.next.lessons).slice(0, 60) + ' vs ' + JSON.stringify(c.next && c.next.lessons).slice(0, 60));
  /* a corrupted stored trace is not taken */
  { const s = createSession(fly, () => {}); s.restore({ recent: [{ received: 'x', sent: 0, moved: 0 }, { received: -5, sent: 0, moved: 0 }, 7, null, null, null, null, null] });
    s.restore({ ...s.state(), lastOdor: { received: 10, sent: 0, moved: 0 } });
    const nx = s.next(); ok(nx && nx.lessons.length === 0, 'a corrupted stored trace is dropped: ' + JSON.stringify(nx && nx.lessons)); }
  return n;
}

const total = await banc(ICI);
console.log('test-fly-session-qa-20261108 : ' + total + ' assertions OK');

const MUTANTS = [
  ['premiere fenetre levee sans transactions lues', (s) => s.replace('      firstWindow = false;\n    }\n', '    }\n    firstWindow = false;\n')],
  ['positions perdues au redemarrage', (s) => s.replace('pos: x && x.books && x.books[k] && x.books[k].pos === 1 ? 1 : 0,', 'pos: 0,')],
  ['trace perdue au redemarrage', (s) => s.replace('recent = restoredTrace(x);', 'recent = [];')],
  ['trace corrompue acceptee', (s) => s.replace("const good = (m) => m && typeof m === 'object' && ['received', 'sent', 'moved'].every((k) => Number.isFinite(m[k]) && m[k] >= 0);", 'const good = (m) => !!m;')],
];
let tues = 0;
const source = readFileSync(join(ICI, 'fly-core.js'), 'utf8');
for (const [nom, muter] of MUTANTS) {
  const muted = muter(source);
  if (muted === source) { console.log('  ' + nom + ' : MOTIF ABSENT'); continue; }
  const d = mkdtempSync(join(tmpdir(), 'flysess-mut-'));
  writeFileSync(join(d, 'fly-core.js'), muted);
  try { await banc(d); console.log('  ' + nom + ' : SURVIT'); } catch (e) { tues++; console.log('  ' + nom + ' : TUE (' + String(e.message).slice(0, 90) + ')'); }
}
assert.equal(tues, MUTANTS.length, 'MUTANTS : ' + tues + '/' + MUTANTS.length);
console.log('MUTANTS : ' + tues + '/' + MUTANTS.length + ' tues');
