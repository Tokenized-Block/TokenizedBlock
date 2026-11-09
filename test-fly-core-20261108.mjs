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
  ok(JSON.stringify(ses.lastOdor) === JSON.stringify({ received: 0, sent: 200, moved: 0 }), 'the live odor a simulation is injected on: ' + JSON.stringify(ses.lastOdor));
  /* the paper trader's rule */
  const { decide } = await import(pathToFileURL(join(dir, 'fly-core.js')).href + '?d=' + Date.now() + Math.random());
  ok(decide('approach', 0) === 'buy' && decide('avoid', 1) === 'sell' && decide('approach', 1) === 'hold' && decide('undecided', 1) === 'hold'
    && decide('avoid', 0) === 'stay_out' && decide('undecided', 0) === 'stay_out', 'decide: buy / sell / hold / stay_out, never a short');
  ok(events.some((e) => e.type === 'decision' && e.action === 'stay_out' && e.inBefore === false), 'a naive fly that is out stays out (decision event)');
  /* a trained fly buys on "received", then windows without any trade keep its position: no smell, no move */
  const ev4 = [], f4 = createFly(circuit), s4 = createSession(f4, (e) => ev4.push(e));
  for (let k = 0; k < 3; k++) { const d = f4.odorDrive(rise); f4.addDopamine(d, 0.01); f4.present(d); f4.drain(); }
  s4.window({ symbol: 'X', price: px(100), transactions: [] }); f4.drain();
  s4.window({ symbol: 'X', price: px(100), transactions: [tx('0x10', 'received', 50)] }); f4.drain();
  const achat = ev4.filter((e) => e.type === 'decision').pop();
  s4.window({ symbol: 'X', price: px(101), transactions: [] }); f4.drain();
  s4.window({ symbol: 'X', price: px(102), transactions: [] }); f4.drain();
  const b4 = s4.state().books.fly;
  ok(achat && achat.action === 'buy' && b4.pos === 1 && b4.switches === 1, 'trained fly buys, then holds through windows without trades (' + (achat && achat.action) + ', pos ' + b4.pos + ', ' + b4.switches + ' switch)');
  ses.window({ symbol: 'X', price: px(99), transactions: [] }); f3.drain();
  const st = ses.state();
  ok(st.tally.undecided === 1 && st.settled === 2, 'the undecided prediction is counted, two windows settled ' + JSON.stringify(st.tally) + ' ' + st.settled);
  ok(Math.abs(st.books.hold.ret - (1 - 500 / 1e6) * 0.99) < 1e-12 && st.books.hold.switches === 1, 'always-in pays one fee then the -1%: ' + st.books.hold.ret);
  ok(st.books.fly.ret === 1 && st.books.fly.switches === 0, 'an undecided fly stays out: 0%');
  ok(events.some((e) => e.type === 'taught' && e.move < 0 && e.weakened > 0), 'the move that followed teaches the fly (synapses weakened)');
  const dec = events.find((e) => e.type === 'decision');
  ok(dec && Array.isArray(dec.path) && dec.path.length > 0 && dec.path.every((p, k, a) => !k || a[k - 1].c >= p.c), 'a decision carries the synapses of its thought, strongest first');

  /* Laplace's demon: the shadow's forecast of the fly's NEXT decision is exactly what the fly then does, per scenario of move */
  const { foresee } = await import(pathToFileURL(join(dir, 'fly-core.js')).href + '?t=' + Date.now() + Math.random());
  const shadow = createFly(circuit), before = JSON.stringify([...fly.saveState().act, ...fly.saveState().m]);
  const fs1 = foresee(shadow, fly, { lastMix: fall, nextMix: fall, pos: 0, moves: [0.02, 0, -0.02] });
  ok(fs1.exact && fs1.scenarios.length === 3, 'a fly at rest is forecast exactly, 3 scenarios');
  ok(JSON.stringify([...fly.saveState().act, ...fly.saveState().m]) === before, 'forecasting never changes the real fly');
  const real = (move) => { const c = createFly(circuit); c.loadState(fly.saveState());
    if (move) { const d = c.odorDrive(fall); c.addDopamine(d, move); c.present(d); c.drain(); }
    let t = null; c.present(c.odorDrive(fall), { onPeak: (x) => { t = x; } }); c.drain(); return t; };
  for (const sc of fs1.scenarios) { const t = real(sc.move); ok(t.ap === sc.ap && t.av === sc.av && t.word === sc.word, 'scenario ' + sc.move + ': forecast = what the fly does, bit for bit (' + sc.word + ')'); }
  /* and on the REAL fly itself, not a clone: teach the fall, then ask */
  const sc2 = fs1.scenarios[2]; teach(fall, -0.02); const now = ask(fall);
  ok(now.ap === sc2.ap && now.av === sc2.av, 'the real fly, taught -2% then asked, lands exactly on the forecast');
  ok(fs1.scenarios[0].ap !== fs1.scenarios[2].ap, 'a rise and a fall forecast different futures (the move is used)');
  fly.present(fly.odorDrive(rise));
  ok(!foresee(shadow, fly, { nextMix: rise, pos: 0 }).exact, 'a fly with a pulse queued is NOT claimed exact'); fly.drain();
  /* through the SESSION: forecast the next window, then run it (same price, the same trade again) -> the decision is the forecast */
  const { foreseeNext } = await import(pathToFileURL(join(dir, 'fly-core.js')).href + '?f=' + Date.now() + Math.random());
  const ev5 = [], f5 = createFly(circuit), s5 = createSession(f5, (e) => ev5.push(e));
  ok(foreseeNext(shadow, f5, s5).exact === false, 'nothing smelled yet: no forecast claimed');
  for (let k = 0; k < 3; k++) { const d = f5.odorDrive(rise); f5.addDopamine(d, 0.01); f5.present(d); f5.drain(); }
  s5.window({ symbol: 'X', price: px(100), transactions: [] }); f5.drain();
  s5.window({ symbol: 'X', price: px(100), transactions: [tx('0x20', 'received', 50)] }); f5.drain();
  const fc = foreseeNext(shadow, f5, s5), flat = fc.scenarios.find((x) => x.move === 0);
  ok(fc.exact && fc.pos === 1 && fc.learnsFrom && fc.learnsFrom.received === 5000, 'the forecast knows it will hold the stock and learn from $5000 received');
  s5.window({ symbol: 'X', price: px(100), transactions: [tx('0x21', 'received', 50)] }); f5.drain();
  const got = ev5.filter((e) => e.type === 'decision').pop();
  ok(got.ap === flat.ap && got.av === flat.av && got.action === flat.action, 'the next window\'s real decision = the flat-move forecast (' + got.action + ')');
  /* the last real smell is kept across a restart (state -> restore), and a corrupt one is refused */
  const s6 = createSession(createFly(circuit), () => {}); s6.restore(JSON.parse(JSON.stringify(s5.state())));
  ok(JSON.stringify(s6.lastOdor) === JSON.stringify(s5.lastOdor) && s6.next() && s6.next().nextMix.received === 5000, 'the last real smell survives a restart: ' + JSON.stringify(s6.lastOdor));
  s6.restore({ lastOdor: { received: -5, sent: 10, moved: 0 } }); ok(s6.lastOdor === null, 'a corrupt saved smell (negative) is refused');
  s6.restore({ lastOdor: { received: NaN, sent: 1, moved: 0 } }); ok(s6.lastOdor === null, 'a corrupt saved smell (NaN) is refused');
  /* Phil 08/11 "129 undecided": tiny but regular moves must teach. 12 windows: a "sent" smell, then a -0.01% fall each time */
  const ev7 = [], f7 = createFly(circuit), s7 = createSession(f7, (e) => ev7.push(e));
  let px7 = 100; s7.window({ symbol: 'X', price: px(px7), transactions: [] }); f7.drain();
  for (let k = 0; k < 12; k++) { s7.window({ symbol: 'X', price: px(px7), transactions: [tx('0x7' + k.toString(16).padStart(3, '0'), 'sent', 3)] }); f7.drain(); px7 *= 0.9999; }
  s7.window({ symbol: 'X', price: px(px7), transactions: [tx('0x7fff', 'sent', 3)] }); f7.drain();
  const d7 = ev7.filter((e) => e.type === 'decision').pop();
  ok(Math.abs(s7.typical - 0.0001) < 1e-6, 'the usual move is learned from the moves themselves: ' + s7.typical);
  ok(d7 && d7.word === 'avoid', 'after 12 small (-0.01%) falls the fly DECIDES: avoid (approach ' + (d7 && d7.ap.toFixed(3)) + ' / avoid ' + (d7 && d7.av.toFixed(3)) + ')');
  ok(JSON.stringify(createSession(createFly(circuit), () => {}).state().typical) === '0' && s7.state().typical === s7.typical, 'the usual move is saved with the state');
  /* idle ticks do not forget: the page ticks at rest, the server does not, and both must keep the same memory */
  const m0 = JSON.stringify(f7.exportMemory()); for (let k = 0; k < 3000; k++) f7.step([]);
  ok(JSON.stringify(f7.exportMemory()) === m0, 'three thousand idle steps change no synapse');
  ok(f7.addDopamine(new Float64Array(f7.N.length), 0.0001, 0.0001) === 0.5 && f7.addDopamine(new Float64Array(f7.N.length), 0.0003, 0.0001) === 1, 'a usual move teaches at 1/2, three times the usual saturates');
  /* boldness: the threshold to act. The shared fly's measured state on 08/11 (pull 93.2% / push 94.3%, t = -0.006) is undecided at
   *   the default 2% and "avoid" at 0.5%; the setter refuses absurd values; the forecast uses the session's own threshold */
  const { wordOf, FLY: F2 } = await import(pathToFileURL(join(dir, 'fly-core.js')).href + '?w=' + Date.now() + Math.random());
  const tProd = (0.932 - 0.943) / (0.932 + 0.943);
  ok(F2.DECIDE === 0.02 && wordOf(tProd) === 'undecided' && wordOf(tProd, 0.005) === 'avoid' && wordOf(-tProd, 0.005) === 'approach', 'the measured shared-fly state: undecided at 2%, decided at 0.5%');
  const s8 = createSession(createFly(circuit), () => {}); s8.threshold = 0.5; s8.threshold = 0; s8.threshold = NaN;
  ok(s8.threshold === 0.02, 'the threshold refuses 50%, 0 and NaN (stays ' + s8.threshold + ')');
  s8.threshold = 0.005; ok(s8.threshold === 0.005, 'a bold threshold of 0.5% is taken');
  const ev9 = [], f9 = createFly(circuit), s9 = createSession(f9, (e) => ev9.push(e), { threshold: 0.001 });
  for (let k = 0; k < 1; k++) { const d = f9.odorDrive(rise); f9.addDopamine(d, 0.0005); f9.present(d); f9.drain(); }
  s9.window({ symbol: 'X', price: px(100), transactions: [] }); f9.drain();
  s9.window({ symbol: 'X', price: px(100), transactions: [tx('0x90', 'received', 50)] }); f9.drain();
  const d9 = ev9.filter((e) => e.type === 'decision').pop();
  ok(d9 && d9.threshold === 0.001 && d9.word === wordOf(d9.t, 0.001) && d9.word !== wordOf(d9.t), 'a session decides with ITS threshold, and the event says which (' + (d9 && d9.word) + ' at 0.1%, ' + (d9 && wordOf(d9.t)) + ' at 2%)');
  const fc9 = foreseeNext(shadow, f9, s9);
  ok(fc9.exact && fc9.scenarios.find((x) => x.move === 0).word === d9.word, 'the forecast uses the same threshold as the session');
  /* the trace: a smell is taught by the next windows' moves too, half as much per window of age (measured gain: banc-fly-trace) */
  const { recordEdge, FLY: F3 } = await import(pathToFileURL(join(dir, 'fly-core.js')).href + '?r=' + Date.now() + Math.random());
  ok(F3.TRACE === 3 && F3.TRACE_DECAY === 0.5, 'default trace: 3 windows, halving');
  const ev10 = [], f10 = createFly(circuit), s10 = createSession(f10, (e) => ev10.push(e));
  s10.window({ symbol: 'X', price: px(100), transactions: [] }); f10.drain();
  s10.window({ symbol: 'X', price: px(100), transactions: [tx('0xa1', 'sent', 3)] }); f10.drain();   /* smell, no move yet */
  s10.window({ symbol: 'X', price: px(100), transactions: [] }); f10.drain();                       /* no trade, no move */
  s10.window({ symbol: 'X', price: px(99), transactions: [] }); f10.drain();                        /* -1%, two windows after the smell */
  const tg = ev10.filter((e) => e.type === 'taught');
  ok(tg.length === 1 && Math.abs(tg[0].move - (-0.01 * 0.5)) < 1e-12 && tg[0].mix.sent === 300, 'a move two windows later still teaches that smell, at half weight (' + (tg[0] && tg[0].move) + ')');
  const ev11 = [], f11 = createFly(circuit), s11 = createSession(f11, (e) => ev11.push(e), { trace: 1 });
  for (const [p, t] of [[100, []], [100, [tx('0xb1', 'sent', 3)]], [100, []], [99, []]]) { s11.window({ symbol: 'X', price: px(p), transactions: t }); f11.drain(); }
  ok(ev11.filter((e) => e.type === 'taught').length === 0, 'with trace 1 (the old model) that late move teaches nothing');
  const fc10 = foreseeNext(shadow, f10, s10);
  const ls10 = s10.next().lessons;
  ok(fc10.exact && ls10.length === 1 && ls10[0].weight === 0.25 && ls10[0].mix.sent === 300, 'the next lesson is that smell, now two windows older (weight 0.25): ' + JSON.stringify(ls10));
  /* its record against a coin flip (exact binomial, values checked by hand: 10/10 = 1/1024, 7/10 = 176/1024, 5/10 = 638/1024) */
  ok(recordEdge({}).p === 1 && Math.abs(recordEdge({ consistent: 10 }).p - 1 / 1024) < 1e-12 && Math.abs(recordEdge({ consistent: 7, opposite: 3 }).p - 176 / 1024) < 1e-12
    && Math.abs(recordEdge({ consistent: 5, opposite: 5 }).p - 638 / 1024) < 1e-12, 'record p-values exact');
  ok(Math.abs(recordEdge({ consistent: 60, opposite: 40 }).p - 0.0284439668) < 1e-8 && recordEdge({ consistent: 600, opposite: 400 }).p < 1e-9, 'record p-value stays finite and right for large n');
  return n;
}

const total = await banc(ICI);
console.log('test-fly-core-20261108 : ' + total + ' assertions OK');

const MUTANTS = [
  ['dopamine propagee comme excitation', (s) => s.replace("if (N[i].family === 'DAN' || N[i].family === 'APL') continue;", "if (N[i].family === 'APL') continue;").replace("if (N[j].family === 'DAN') { next[j] = drive[j] || 0; continue; }", '')],
  ['APL excitatrice', (s) => s.replace("if (N[i].family === 'DAN' || N[i].family === 'APL') continue;", "if (N[i].family === 'DAN') continue;")],
  ['plus de parcimonie Kenyon', (s) => s.replace('if (next[j] <= cut || next[j] < 0.01) next[j] = 0; else activeKc++;', 'activeKc++;')],
  ['recompense et punition inversees', (s) => s.replace("dan = move > 0 ? 'reward' : 'punishment';", "dan = move > 0 ? 'punishment' : 'reward';")],
  ['frais oublies', (s) => s.replace("b.ret *= 1 - Math.abs(want[k] - b.pos) * (feePips / 1e6 + (k === 'edge' ? FLY.INTERFACE_FEE : 0)); b.switches++;", 'b.switches++;')],
  ['passe senti a la premiere fenetre', (s) => s.replace("if (firstWindow) { emit({ type: 'skipped', n: fresh.length }); fresh = []; }", '')],
  ['recu et envoye inverses', (s) => s.replace("if (s && mv.some((m) => m.vers === s)) return 'received';", "if (s && mv.some((m) => m.vers === s)) return 'sent';")],
  ['vend sans tenir', (s) => s.replace("return word === 'approach' ? 'buy' : 'stay_out';", "return word === 'approach' ? 'buy' : word === 'avoid' ? 'sell' : 'stay_out';")],
  ['fenetre sans odeur vend', (s) => s.replace("const flyWants = win.decision ? (win.decision === 'buy' || win.decision === 'hold' ? 1 : 0) : books.fly.pos;", "const flyWants = win.decision === 'buy' || win.decision === 'hold' ? 1 : 0;")],
  ['prevision sur la vraie mouche', (s) => s.replace('    shadow.loadState(start);\n', '    shadow = fly; shadow.loadState(start);\n')],
  ['prevision sans le mouvement', (s) => s.replace('shadow.addDopamine(d, move * l.weight, typical); shadow.present(d);', 'shadow.present(d);')],
  ['etat copie sans la memoire', (s) => s.replace('act.set(s.act); let k = 0; for (const j of mbonIdx) for (const e of inputs[j]) if (e[2] != null) e[2] = s.m[k++];', 'act.set(s.act);')],
  ['pensee non triee', (s) => s.replace('return out.sort((a, b) => b.c - a.c).slice(0, limit);', 'return out.slice(0, limit);')],
  ['exact meme en pleine impulsion', (s) => s.replace('if (start.queued || start.pulseSteps) return { exact: false, scenarios: [] };', '')],
  ['prevision sur la position d avant la decision', (s) => s.replace("const pos = prevWin && prevWin.decision ? (prevWin.decision === 'buy' || prevWin.decision === 'hold' ? 1 : 0) : books.fly.pos;", 'const pos = books.fly.pos;')],
  ['odeur perdue au redemarrage', (s) => s.replace('settled, feePips, lastOdor: lastOdor ? { ...lastOdor } : null, typical,', 'settled, feePips, typical,')],
  ['odeur corrompue acceptee', (s) => s.replace("lastOdor = lo && ['received', 'sent', 'moved'].every((k) => Number.isFinite(lo[k]) && lo[k] >= 0) &&", 'lastOdor = lo &&')],
  ['dopamine non adaptee', (s) => s.replace('const s = typical > 0 ? Math.min(1, Math.abs(move) / (FLY.SURPRISE * typical)) : weber(', 'const s = (0) ? 0 : weber(')],
  ['oubli au repos', (s) => s.replace("(driven ? FLY.RECOVER * (1 - e[2]) : 0)", 'FLY.RECOVER * (1 - e[2])')],
  ['habituel jamais mis a jour', (s) => s.replace('if (move !== 0) typical = typical > 0 ?', 'if (false) typical = typical > 0 ?')],
  ['habituel non sauve', (s) => s.replace("settled, feePips, lastOdor: lastOdor ? { ...lastOdor } : null, typical,", "settled, feePips, lastOdor: lastOdor ? { ...lastOdor } : null,")],
  ['seuil de session ignore', (s) => s.replace("const word = t.word === 'quiet' ? 'quiet' : wordOf(t.t, decideAt);", 'const word = t.word;')],
  ['prevision au seuil par defaut', (s) => s.replace("{ ...nx, threshold: session.threshold }", 'nx')],
  ['seuil sans borne', (s) => s.replace("if (Number.isFinite(v) && v >= 0.001 && v <= 0.2) decideAt = v;", 'decideAt = v;')],
  ['trace oubliee', (s) => s.replace('if (move !== 0) recent.forEach((m, k) => { if (m) learn(m, move * FLY.TRACE_DECAY ** k, false); });', 'if (move !== 0 && recent[0]) learn(recent[0], move, false);')],
  ['trace sans attenuation', (s) => s.replace('learn(m, move * FLY.TRACE_DECAY ** k, false)', 'learn(m, move, false)')],
  ['binomiale depuis k+1', (s) => s.replace('if (i >= k) terms.push(lc - n * Math.LN2);', 'if (i > k) terms.push(lc - n * Math.LN2);')],
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
