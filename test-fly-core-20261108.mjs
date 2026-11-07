// test-fly-core-20261108.mjs — the fly's brain and market protocol (fly-core.js), on the REAL circuit (fly-brain-circuit.json), with
// mutants. Each defect found in the browser on 2026-11-07 is a mutant here: dopamine or APL spread as excitation, Kenyon sparsity lost,
// reward and punishment swapped, the fee forgotten, the first window's past trades smelled, received and sent swapped.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const circuit = JSON.parse(readFileSync(join(ICI, 'fly-brain-circuit.json'), 'utf8'));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

async function banc(dir) {
  n = 0;
  const { createFly, createSession, classify, FLY } = await import(pathToFileURL(join(dir, 'fly-core.js')).href + '?t=' + Date.now() + Math.random());
  const fly = createFly(circuit), N = fly.N;
  ok(N.length === 1119 && N.counts.approach === 35 && N.counts.avoid === 32, 'circuit: 1119 neurons, 35 approach / 32 avoid MBONs ' + N.counts.approach + '/' + N.counts.avoid);

  /* at rest the circuit is quiet, and stays quiet */
  for (let k = 0; k < 30; k++) fly.step([]);
  ok(fly.act.every((a) => a === 0), 'quiet at rest');

  const fall = { received: 0, sent: 5000, moved: 0 }, rise = { received: 5000, sent: 0, moved: 0 };
  /* naive: a smell gives no preference */
  let naive = null; fly.present(fly.odorDrive(fall), { onPeak: (t) => { naive = t; } }); fly.drain();
  ok(naive && naive.word === 'undecided' && Math.abs(naive.ap - 1) < 1e-9 && Math.abs(naive.av - 1) < 1e-9, 'naive fly is undecided ' + JSON.stringify(naive));
  /* sparse coding: at most 10% of Kenyon cells active at the peak */
  let kcPeak = 0; fly.present(fly.odorDrive(fall), { onPeak: () => { kcPeak = fly.kcIdx.filter((j) => fly.act[j] > 0).length; } }); fly.drain();
  ok(kcPeak > 0 && kcPeak <= Math.ceil(fly.kcIdx.length * FLY.KC_SHARE), 'Kenyon cells active at the peak ' + kcPeak + '/' + fly.kcIdx.length);
  /* the circuit fades back to quiet after a pulse */
  ok(Math.max(...fly.act) < 1e-2, 'fades under 1% before the next pulse may start: ' + Math.max(...fly.act));

  /* conditioning: "sent" followed by falls three times -> the fly avoids "sent"; "received" followed by rises -> it approaches "received" */
  const teach = (mix, move) => { const d = fly.odorDrive(mix); fly.addDopamine(d, move); let before = null, list = null;
    fly.present(d, { onStart: () => { before = fly.snapshot(); }, onPeak: () => { list = fly.weakened(before); } }); fly.drain(); return list; };
  const ask = (mix) => { let t = null; fly.present(fly.odorDrive(mix), { onPeak: (x) => { t = x; } }); fly.drain(); return t; };
  let trace = null; for (let k = 0; k < 3; k++) trace = teach(fall, -0.01);
  const sides = trace.reduce((o, x) => { o[N[x.j].valence] = (o[N[x.j].valence] || 0) + 1; return o; }, {});
  /* not "only": some avoid-side MBONs also get a little PPL1 input in the measured circuit (150 vs 7 on 2026-11-08) */
  ok(trace.length > 0 && (sides.approach || 0) > 10 * (sides.avoid || 0), 'punishment weakens mostly approach-side synapses ' + JSON.stringify(sides));
  const afterFall = ask(fall);
  ok(afterFall.word === 'avoid' && afterFall.ap < afterFall.av, 'after three punished "sent": avoid ' + JSON.stringify(afterFall));
  for (let k = 0; k < 3; k++) teach(rise, 0.01);
  const afterRise = ask(rise);
  ok(afterRise.word === 'approach' && afterRise.av < afterRise.ap, 'after three rewarded "received": approach ' + JSON.stringify(afterRise));
  ok(ask(fall).word === 'avoid', 'the two memories stay apart: "sent" is still avoided');

  /* memory export and import round trip */
  const m = fly.exportMemory(), fly2 = createFly(circuit); fly2.importMemory(m);
  ok(JSON.stringify(fly2.exportMemory()) === JSON.stringify(m) && m.some((x) => x < 1e5), 'memory round trip, ' + m.filter((x) => x < 1e5).length + ' synapses weakened');

  /* classify: what the chain proves, from the signer */
  const S = '0x' + '5'.repeat(40), P = '0x' + '9'.repeat(40), O = '0x' + '7'.repeat(40);
  ok(classify({ signataire: S, mouvements: [{ de: P, vers: S }] }) === 'received' && classify({ signataire: S, mouvements: [{ de: S, vers: P }] }) === 'sent'
    && classify({ signataire: S, mouvements: [{ de: P, vers: O }] }) === 'moved', 'classify received / sent / moved');

  /* protocol: first window's past trades are skipped; then smell, predict, judge on the next move, settle the paper book with the fee */
  const events = [], f3 = createFly(circuit), ses = createSession(f3, (e) => events.push(e));
  const px = (p) => ({ priceUsd: p, tokenDecimals: 8, feePips: 500, block: 1 });
  const tx = (h, kind, units) => ({ tx: h, bloc: 1, signataire: S, mouvements: [kind === 'received' ? { de: P, vers: S, montant: String(units * 1e8) } : { de: S, vers: P, montant: String(units * 1e8) }] });
  ses.window({ symbol: 'X', price: px(100), transactions: [tx('0x01', 'received', 1)] }); f3.drain();
  ok(events.some((e) => e.type === 'skipped' && e.n === 1) && !events.some((e) => e.type === 'tx'), 'first window: past trades skipped, not smelled');
  ses.window({ symbol: 'X', price: px(100), transactions: [tx('0x01', 'received', 1), tx('0x02', 'sent', 2)] }); f3.drain();
  const t2 = events.filter((e) => e.type === 'tx');
  ok(t2.length === 1 && t2[0].tx === '0x02' && t2[0].kind === 'sent' && Math.abs(t2[0].usd - 200) < 1e-9, 'second window: only the new trade, sent $200');
  ok(events.some((e) => e.type === 'predict' && e.word === 'undecided'), 'a naive prediction is made BEFORE the outcome');
  ses.window({ symbol: 'X', price: px(99), transactions: [] }); f3.drain();
  const st = ses.state();
  ok(st.tally.undecided === 1 && st.settled === 2, 'the undecided prediction is counted, two windows settled ' + JSON.stringify(st.tally) + ' ' + st.settled);
  ok(Math.abs(st.books.hold.ret - (1 - 500 / 1e6) * 0.99) < 1e-12 && st.books.hold.switches === 1, 'always-in pays one fee then the -1%: ' + st.books.hold.ret);
  ok(st.books.fly.ret === 1 && st.books.fly.switches === 0, 'an undecided fly stays out: 0%');
  ok(events.some((e) => e.type === 'taught' && e.move < 0 && e.weakened > 0), 'the move that followed teaches the fly (synapses weakened)');
  return n;
}

const total = await banc(ICI);
console.log('test-fly-core-20261108 : ' + total + ' assertions OK');

const MUTANTS = [
  ['dopamine propagee comme excitation', (s) => s.replace("if (N[i].family === 'DAN' || N[i].family === 'APL') continue;", "if (N[i].family === 'APL') continue;").replace("if (N[j].family === 'DAN') { next[j] = drive[j] || 0; continue; }", '')],
  ['APL excitatrice', (s) => s.replace("if (N[i].family === 'DAN' || N[i].family === 'APL') continue;", "if (N[i].family === 'DAN') continue;")],
  ['plus de parcimonie Kenyon', (s) => s.replace('if (next[j] <= cut || next[j] < 0.01) next[j] = 0; else activeKc++;', 'activeKc++;')],
  ['recompense et punition inversees', (s) => s.replace("dan = move > 0 ? 'reward' : 'punishment';", "dan = move > 0 ? 'punishment' : 'reward';")],
  ['frais oublies', (s) => s.replace('b.ret *= 1 - feePips / 1e6; b.switches++;', 'b.switches++;')],
  ['passe senti a la premiere fenetre', (s) => s.replace("if (firstWindow) { emit({ type: 'skipped', n: fresh.length }); fresh = []; }", '')],
  ['recu et envoye inverses', (s) => s.replace("if (s && mv.some((m) => m.vers === s)) return 'received';", "if (s && mv.some((m) => m.vers === s)) return 'sent';")],
  ['apprentissage sans dopamine', (s) => s.replace('let d = 0; for (const [i, w] of N[j].danIn) d += w * next[i];', 'let d = 0;')],
];
let tues = 0;
const source = readFileSync(join(ICI, 'fly-core.js'), 'utf8');
for (const [nom, muter] of MUTANTS) {
  const muted = muter(source);
  if (muted === source) { console.log('  ' + nom + ' : MOTIF ABSENT'); continue; }
  const d = mkdtempSync(join(tmpdir(), 'flycore-mut-'));
  writeFileSync(join(d, 'fly-core.js'), muted);
  try { await banc(d); console.log('  ' + nom + ' : SURVIT'); } catch (e) { tues++; console.log('  ' + nom + ' : TUE (' + String(e.message).slice(0, 90) + ')'); }
}
assert.equal(tues, MUTANTS.length, 'MUTANTS : ' + tues + '/' + MUTANTS.length);
console.log('MUTANTS : ' + tues + '/' + MUTANTS.length + ' tues');
