// test-vision-inside-20261026.mjs — "VIEW INSIDE THE BRAIN": the 3D window only shows REAL fields.
//
// What this bench requires (owner, 2026-10-26, game57 item 4):
//   A. directional effects 1:1 with real fields: buy = nouveaux.achats (front, warm), sell = nouveaux.ventes (behind, cold),
//      transfer = nouveaux.gm (sides, shimmer), new holder = nouveaux.detenteurs (one particle); each effect carries the field
//      and the value that created it;
//   B. a missing (or zero) input produces NO effect;
//   C. the inner voice: one sentence per beat, each piece comes from a field PRESENT in the beat; no invented field
//      (cause, reason, whale…) ever reaches the sentence;
//   D. "Why": the strongest input carries its real value, the neurons come from vu.indices / from the state, "what changed"
//      only compares held fields;
//   E. "Take control": a LOCAL snapshot, zero write request (fetch / XHR / wallet stubbed, zero non-GET call);
//   F. prefers-reduced-motion: no flight, no shake, static light, no requestAnimationFrame loop;
//   G. app.html: the window reuses the Control panel code (bcBornerTaille), is not modal, shelves its sections like books.
// ⛔ EOL-agnostic reading (Phil's checkout is CRLF); every extraction asserts it found its function.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const D = await import(new URL(process.env.INSIDE_MODULE || './vision-inside.js', import.meta.url).href);
const V = await import(new URL('./vision-cerveau.js', import.meta.url).href);
const C = await import(new URL('./cerveau.js', import.meta.url).href);
const { effectsOf, SENSATIONS, lightOf, pulseOf, echoesOf, horizonOf, beatNumber, voiceOf, whyOf, insideSnapshot,
  freeCam, orbitCam, zoomCam, projectNeurons, cameraPose, animationPlan, outsideNeighbours } = D;
const { etatInitial, pas, NEURONES } = C;

const ADR = '0xb2000000000000000000007afa7ed748b0874f27';
const FACTS = { vie: 12000, vieAvant: 11000, gm: 3, messages: 1, detenteurs: 2, mort: false, etatVie: 'LUE', gmAvant: 2, messagesAvant: 0,
  detenteursAvant: 1, achats: 2, ventes: 1, achatsAvant: 1, ventesAvant: 0, role: 'SENTINELLE', bloc: 53106615 };
const run = (f, k) => { let e = etatInitial(ADR); const h = []; for (let i = 0; i < k; i++) { const r = pas(e, f(i)); e = r.etat; h.push(r.vu); } return { h, e }; };
const { h: HISTO, e: STATE } = run(() => FACTS, 8);
const VU = HISTO[0];   /* first beat: buys 1→2, sells 0→1, gm 2→3, holders 1→2 are NEW */

/* ══ A. 1:1 WITH REAL FIELDS ══ */
{
  ok(VU.nouveaux.achats === 1 && VU.nouveaux.ventes === 1 && VU.nouveaux.gm === 1 && VU.nouveaux.detenteurs === 1, 'A: the reference beat does carry 4 new counts');
  const e = effectsOf(VU);
  eq(e.map((x) => x.field).sort(), ['nouveaux.achats', 'nouveaux.detenteurs', 'nouveaux.gm', 'nouveaux.ventes'], 'A: one effect per non-zero field, no more, no less');
  const by = Object.fromEntries(e.map((x) => [x.effect, x]));
  ok(by.buy.direction === 'front' && by.buy.temperature === 'warm', 'A: buy arrives from the front, warm');
  ok(by.sell.direction === 'back' && by.sell.temperature === 'cold', 'A: sell arrives from behind, cold');
  ok(by.transfer.direction === 'sides' && by.transfer.shape === 'shimmer', 'A: transfer shimmers at the sides');
  ok(by.holder.shape === 'particle' && by.holder.particles === 1, 'A: a new holder adds ONE particle');
  for (const x of e) {
    const [a, b] = x.field.split('.');
    ok(VU[a][b] === x.value && x.value > 0, 'A: the ' + x.effect + ' effect carries the exact value of ' + x.field);
  }
  eq(SENSATIONS.map((s) => s.field), ['nouveaux.achats', 'nouveaux.ventes', 'nouveaux.gm', 'nouveaux.detenteurs'], 'A: the sensations table is fixed');
  const three = effectsOf({ tick: 5, phase: 'CALME', nouveaux: { detenteurs: 3 } });
  ok(three.length === 1 && three[0].particles === 3, 'A: 3 new holders = 3 particles');
}

/* ══ B. A MISSING INPUT PRODUCES NOTHING ══ */
{
  eq(effectsOf(null), [], 'B: no beat, no effect');
  eq(effectsOf({ tick: 3, phase: 'CALME' }), [], 'B: without `nouveaux`, no effect');
  eq(effectsOf({ tick: 3, phase: 'CALME', nouveaux: { achats: 0, ventes: 0, gm: 0, detenteurs: 0 } }), [], 'B: zeros do nothing');
  eq(effectsOf({ tick: 3, phase: 'CALME', nouveaux: { achats: null, ventes: undefined, gm: NaN, detenteurs: '2' } }), [], 'B: an unreadable field does nothing');
  eq(effectsOf({ tick: 3, phase: 'CALME', nouveaux: { ventes: 2 } }).map((x) => x.effect), ['sell'], 'B: only the sell present acts');
  eq(effectsOf({ tick: 3, phase: 'MORT', nouveaux: { achats: 4 } }), [], 'B: a dead block feels nothing (like beatSentence)');
  const l0 = lightOf(null);
  ok(l0.neutral === true && l0.hue === null, 'B: without a beat, neutral light');
  ok(lightOf({ tick: 1, phase: 'NON_LU', spikes: 9 }).neutral === true, 'B: NON_LU does not colour the scene');
  ok(lightOf({ tick: 1, phase: 'MORT', spikes: 0 }).neutral === true, 'B: MORT does not colour the scene');
  const l1 = lightOf({ tick: 1, phase: 'EXCITE', spikes: 64 });
  ok(l1.neutral === false && l1.phase === 'EXCITE' && l1.strength === 0.5, 'B: the light = the decided phase, its strength = spikes / 128');
  eq(horizonOf({ tick: 1 }), { deg: 0, steering: null }, 'B: without steering, the horizon does not tilt');
  ok(horizonOf({ tick: 1, virage: -0.5 }).deg < 0 && horizonOf({ tick: 1, virage: 0.5 }).deg > 0, 'B: steering tilts the horizon to its side');
  ok(Math.abs(horizonOf({ tick: 1, virage: 99 }).deg) <= 20, 'B: the tilt is bounded');
  ok(beatNumber(VU) === VU.tick && beatNumber(null) === null, 'B: ONE beat number, the one of the beat shown');
  const ec = echoesOf(HISTO, 7);
  ok(ec.length === 5 && ec[0].tick === HISTO[6].tick && ec[4].tick === HISTO[2].tick, 'B: the echoes = the 5 beats before, newest first');
  eq(echoesOf(HISTO, 1).map((x) => x.tick), [HISTO[0].tick], 'B: no echo invented before the first beat');
  const me = { adr: ADR, wx: 0, wy: 0, wz: 0 };
  const hab = [me, { adr: '0x' + '1'.repeat(40), sym: 'AAA', wx: 100, wy: 0, wz: 0, phase: 'CALME' }, { adr: '0x' + '2'.repeat(40), sym: 'BBB', wx: 0, wy: 300, wz: 0 },
    { adr: '0x' + '3'.repeat(40), wx: NaN, wy: 0, wz: 0 }];
  const nb = outsideNeighbours(me, hab, new Set());
  ok(nb.length === 2 && nb.every((v) => v.read === false), 'B: Outside — its real neighbours, none lit without a read');
  ok(nb[0].adr === hab[1].adr && Math.hypot(nb[1].x, nb[1].y, nb[1].z) > Math.hypot(nb[0].x, nb[0].y, nb[0].z), 'B: world distances are kept (the closest stays the closest)');
  const nl = outsideNeighbours(me, hab, new Set([hab[2].adr]));
  eq(nl.filter((v) => v.read).map((v) => v.adr), [hab[2].adr], 'B: only a REALLY read neighbour is lit');
  eq(outsideNeighbours(null, hab, new Set()), [], 'B: without a position, no invented neighbour');
  ok(pulseOf(null).strength === 0 && pulseOf(VU).strength === Math.round(VU.spikes / NEURONES * 1000) / 1000, 'B: the pulse = the share of neurons that fired');
}

/* ══ C. THE VOICE ONLY SAYS WHAT IS IN THE BEAT ══ */
{
  const v = voiceOf(VU);
  ok(typeof v.text === 'string' && /^[A-Z]/.test(v.text) && /\.$/.test(v.text) && (v.text.match(/[.!?](\s|$)/g) || []).length === 1, 'C: a single sentence');
  const path = (o, p) => p.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);
  /* a beat stuffed with fields that look like causes: none may reach the voice */
  const TRAPS = { cause: 'whale dumped', raison: 'news', pourquoi: 'rug pull', whale: true, message: 'pump it', because: 'x' };
  const raw = [VU, ...HISTO, { tick: 9, phase: 'NON_LU' }, { tick: 10, phase: 'MORT', nouveaux: { achats: 3 } }, { tick: 11, phase: 'CALME', delta: -0.04, nouveaux: { ventes: 2 } }];
  for (const b of raw) {
    const x = voiceOf({ ...b, ...TRAPS });
    for (const t of x.traces) {
      if (t.key === 'nothing') { ok(t.value === null, 'C: "nothing" carries no value'); continue; }
      ok(path(b, t.key) === t.value, 'C: the piece "' + t.says + '" comes from the present field ' + t.key);
    }
    ok(!/whale|news|rug|pump|because|due to/i.test(x.text), 'C: no invented cause in "' + x.text + '"');
  }
  const empty = voiceOf({ tick: 4, phase: 'CALME', nouveaux: {} });
  eq(empty.traces.map((t) => t.key), ['nothing'], 'C: without data, one neutral and factual line');
  ok(voiceOf(null).text && voiceOf(null).traces.length === 0, 'C: without a beat, nothing is asserted');
}

/* ══ D. "WHY" ══ */
{
  const c = V.champ({ adr: ADR, faits: FACTS, vu: HISTO[HISTO.length - 1], voisins: [], nourritureLue: true });
  const last = HISTO[HISTO.length - 1], before = HISTO[HISTO.length - 2];
  const w = whyOf({ c, faits: FACTS, vu: last, vuAvant: before, etat: STATE, capMap: 0.5 });
  ok(w && w.strongest && typeof w.strongest.key === 'string', 'D: a strongest input');
  const e = c.entrees.find((x) => x.cle === w.strongest.key);
  ok(e.lu && w.strongest.value === e.valeur && w.strongest.raw === e.brut, 'D: the strongest input carries its real read value');
  ok(w.strongest.contribution === V.apportDe(FACTS, w.strongest.key), 'D: its weight = apportDe (cerveau.js), not a copy');
  eq(w.neurons.fired, last.indices.slice(0, 8), 'D: the neurons that fired come from vu.indices');
  ok(Array.isArray(w.neurons.closest) && w.neurons.closest.length <= 5, 'D: the closest to threshold come from the held state');
  ok(w.changes.every((x) => ['phase', 'spikes', 'virage', 'vitesse', 'delta', 'nouveaux.achats', 'nouveaux.ventes', 'nouveaux.gm', 'nouveaux.messages', 'nouveaux.detenteurs'].includes(x.field)), 'D: what changed only compares held fields');
  ok(w.gaze.steering === last.virage && w.gaze.capMap === 0.5, 'D: where it is looking = its real steering and heading');
  const bare = whyOf({ c, faits: FACTS, vu: last, vuAvant: null, etat: null, capMap: null });
  ok(bare.changes.length === 0 && bare.neurons.closest === null && bare.gaze.capMap === null, 'D: without a previous beat or state, nothing is invented');
  const wrongState = whyOf({ c, faits: FACTS, vu: before, vuAvant: null, etat: STATE, capMap: null });
  ok(wrongState.neurons.closest === null, 'D: the state of another beat is not shown');
  ok(whyOf({ c: null, faits: null, vu: null }) === null, 'D: nothing to explain without a beat');
}

/* ══ E. TAKE CONTROL: LOCAL SNAPSHOT, ZERO WRITE ══ */
{
  const snap = insideSnapshot({ adr: ADR, etat: STATE, histo: HISTO, i: 7 });
  ok(snap && Object.isFrozen(snap) && Object.isFrozen(snap.potentials) && snap.potentials.length === NEURONES, 'E: a frozen snapshot of the 128 potentials');
  STATE.potentiels[0] = 999;
  ok(snap.potentials[0] !== 999, 'E: the snapshot is a COPY (the live brain does not change it)');
  ok(snap.indices.join() === HISTO[7].indices.join() && snap.tick === HISTO[7].tick, 'E: it freezes the beat shown');
  let cam = freeCam();
  cam = orbitCam(cam, 30, -10); cam = zoomCam(cam, 100);
  ok(cam.dist >= 0.2 && cam.dist <= 6 && Math.abs(cam.pitch) <= 1.4, 'E: free camera bounded');
  const pos = Array.from({ length: NEURONES }, (_, i) => [Math.cos(i), Math.sin(i) * 0.5, Math.sin(i)]);
  const p = projectNeurons(pos, cam, 360, 300);
  ok(p.every((x) => Number.isFinite(x.x) && Number.isFinite(x.y) && x.n >= 0 && x.n < NEURONES), 'E: finite projection, indices kept');

  const app = read('./app.html');
  const extract = (header) => { const i = app.indexOf(header); ok(i > 0, 'E: extraction found: ' + header); const f = /\n\}/.exec(app.slice(i)); return app.slice(i, i + f.index + 2); };
  const src = ['function bvTakeControl() {', 'function bvControlGesture(dx, dy, dz) {', 'function bvBackToLive() {'].map(extract).join('\n');
  const calls = [];
  const fetchStub = (url, o = {}) => { calls.push({ via: 'fetch', method: String((o && o.method) || 'GET').toUpperCase(), url }); return Promise.resolve({ ok: true, json: async () => ({}) }); };
  class XHR { open(m, u) { calls.push({ via: 'xhr', method: String(m).toUpperCase(), url: u }); } send() {} setRequestHeader() {} }
  const ethereum = { request: (a) => { calls.push({ via: 'wallet', method: 'WALLET', url: a && a.method }); return Promise.resolve(null); } };
  const saved = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest, window: globalThis.window, navigator: globalThis.navigator };
  globalThis.fetch = fetchStub; globalThis.XMLHttpRequest = XHR; globalThis.window = { ethereum, fetch: fetchStub };
  try {
    const el = () => ({ hidden: false, textContent: '', style: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, focus() {} });
    const els = {};
    const $ = (s) => (els[s] = els[s] || el());
    const vision = { jouer: true, control: null, i: 7 };
    let painted = 0;
    const f = new Function('vision', '$', 'visionCible', 'insideSnapshot', 'freeCam', 'orbitCam', 'zoomCam', 'peindreVision', 'bvReduit',
      src + '\nreturn { bvTakeControl, bvControlGesture, bvBackToLive };')(vision, $, () => ({ adr: ADR, etat: STATE, histo: HISTO }), insideSnapshot,
      freeCam, orbitCam, zoomCam, () => { painted++; }, () => false);
    f.bvTakeControl();
    ok(vision.control && vision.control.snap && vision.jouer === false, 'E: Take control freezes a snapshot and pauses live playback');
    for (let k = 0; k < 20; k++) f.bvControlGesture(k * 3, -k, k % 2 ? 1 : -1);
    ok(painted > 0, 'E: gestures repaint the scene');
    f.bvBackToLive();
    ok(vision.control === null && vision.jouer === true, 'E: Back to live resumes live playback');
  } finally { Object.assign(globalThis, saved); }
  eq(calls.filter((a) => a.method !== 'GET'), [], 'E: zero non-GET call (fetch / XHR / wallet)');
  eq(calls, [], 'E: and not even a network call');
  const block = src.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/fetch\s*\(|XMLHttpRequest|sendBeacon|ethereum|eth_|wallet_|\brpc\s*\(|bcSigner|method\s*:/.test(block), 'E: the Take control code names no write');
  const mod = read(process.env.INSIDE_MODULE || './vision-inside.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/Math\.random|Date\.now|new Date|performance\.now|fetch\s*\(|XMLHttpRequest|localStorage|document\.|window\./.test(mod), 'E: vision-inside.js is pure');
}

/* ══ F. PREFERS-REDUCED-MOTION ══ */
{
  eq(animationPlan(true), { flight: false, shake: false, light: 'static', loop: false }, 'F: reduced motion = nothing moves');
  eq(animationPlan(false), { flight: true, shake: true, light: 'live', loop: true }, 'F: otherwise, flight, shake, live light');
  const a = cameraPose('dedans', 0, true), b = cameraPose('dedans', 1, true), c = cameraPose('dedans', 1, false);
  eq(a, b, 'F: reduced motion — the camera is at its final pose right away (no flight)');
  eq(b, c, 'F: the final pose is the same with or without motion');
  ok(cameraPose('dedans', 0, false).dist > cameraPose('dedans', 1, false).dist, 'F: without reduction, the camera flies inside');
  ok(cameraPose('dehors', 0.3, false).dist > 1.5, 'F: Outside = the camera outside the block');
  ok(pulseOf(HISTO[3], { reduced: true }).animated === false && pulseOf(HISTO[3]).animated === true, 'F: the pulse does not beat on screen with reduced motion');
  const app = read('./app.html');
  const i = app.indexOf('function bvStartLoop() {'); ok(i > 0, 'F: extraction found: bvStartLoop');
  const f = /\n\}/.exec(app.slice(i)); const src = app.slice(i, i + f.index + 2);
  for (const reduced of [true, false]) {
    let raf = 0, painted = 0; const vision = { loop: null, flight: null };
    const g = new Function('vision', 'animationPlan', 'bvReduit', 'requestAnimationFrame', 'cancelAnimationFrame', 'bvPaint3D', 'performance',
      src + '\nreturn bvStartLoop;')(vision, animationPlan, () => reduced, () => { raf++; return 1; }, () => {}, () => { painted++; }, { now: () => 0 });
    g();
    if (reduced) ok(raf === 0 && painted === 1, 'F: reduced motion — no rAF loop, a single static paint');
    else ok(raf === 1, 'F: otherwise, the loop starts');
  }
  ok(/@media \(prefers-reduced-motion:reduce\)\{[^}]*#bvPop/.test(app), 'F: the window has its reduced-motion CSS rule');
}

/* ══ G. THE WINDOW ══ */
{
  const app = read('./app.html');
  ok(/<dialog class="bvPop" id="bvPop" data-window="panel"/.test(app), 'G: the window has the panel\'s shape');
  ok(/id="bvHandle"[^>]*role="separator"/.test(app) && /id="bvFold"/.test(app) && /id="bvMaximize"/.test(app), 'G: edge to drag, fold, maximise');
  const i = app.indexOf('function windowLikePanel('); ok(i > 0, 'G: extraction found: windowLikePanel');
  const body = app.slice(i, i + /\n\}/.exec(app.slice(i)).index);
  ok(/bcBornerTaille\(/.test(body) && /bcAxeTaille\(\)/.test(body) && /bcNavPx\(\)/.test(body), 'G: it reuses the Control panel\'s bounds and axis');
  ok(/windowLikePanel\(\{ d: \$\('#bvPop'\)/.test(app), 'G: the Brain window is wired to it');
  const o = app.indexOf('function ouvrirVision(source) {'); ok(o > 0, 'G: extraction found: ouvrirVision');
  const ov = app.slice(o, o + /\n\}/.exec(app.slice(o)).index);
  ok(!/showModal/.test(ov) && /dl\.show\(\)/.test(ov), 'G: not a modal');
  ok(/id="bvShelf"[^>]*role="tablist"/.test(app) && /id="bvTabs"/.test(app), 'G: a shelf and tabs');
  const books = [...app.matchAll(/data-book="([a-zA-Z]+)"/g)].map((m) => m[1]);
  for (const l of ['talk', 'reads', 'details', 'neurons', 'around', 'whatIf', 'why']) ok(books.includes(l), 'G: the ' + l + ' book is on the shelf');
  ok(/<canvas id="bv3d"/.test(app) && !/<svg id="bvChamp"/.test(app), 'G: the scene is the 3D engine, the flat diagram is removed');
  ok(/id="bvHumeur"[^>]*type="button"/.test(app.replace(/type="button"([^>]*)id="bvHumeur"/, 'id="bvHumeur"$1 type="button"')), 'G: the mood is clickable');
  ok(/id="bvControl"/.test(app) && /id="bvBackToLive"/.test(app), 'G: Take control / Back to live');
}

console.log('test-vision-inside-20261026 : ' + n + ' assertions, OK');
