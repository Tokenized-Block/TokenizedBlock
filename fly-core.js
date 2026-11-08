/* fly-core.js — the fly's brain and its market protocol, PURE: no DOM, no fetch, no timers. The page (fly-brain.js) and the server
 * (the shared fly that keeps training when nobody watches) run THIS code, so the two flies can never drift apart.
 * Circuit: hemibrain v1.2 (Janelia FlyEM, CC BY 4.0), measured neurons and synapse counts. Ours, and stated on the page: the dynamics,
 * the odor mapping onto PNs, the learning constants, the approach/avoid reading. Nothing is signed, nothing is advice. */

/* our constants */
export const FLY = Object.freeze({
  KC_SHARE: 0.10, DECAY: 0.6, GAIN: 0.5,
  WEBER_UNIT: 0.0005, WEBER_SPAN: 200,      // a 0.05% move is one unit; strength saturates near 10%
  ODOR_UNIT_USD: 50, ODOR_SPAN: 2000,        // a $50 trade is one unit; strength saturates near $100k
  LEARN: 0.15, RECOVER: 0.0002, FLOOR: 0.05, // a strong move weakens its pattern's synapses by a few %; forgotten over ~10 min of steps
  /* measured 2026-11-08: after a pulse the circuit stays saturated ~15 steps, falls under 1% at ~20 and under 0.1% at ~30 steps (3.6 s):
   *   a rest of 14 started the next pulse on a circuit still at 100% and mixed the two stimuli */
  FLAT: 0.0005, REST_TICKS: 30, PULSE_STEPS: 6,
});

/* Weber-Fechner: felt strength = log of the size in units, 0..1 */
export const weber = (x, unit, span) => Math.min(1, Math.log1p(Math.abs(x) / unit) / Math.log1p(span));

/* What the chain proves about a transaction, from its Transfer movements and its SIGNER (tx.from, read by the server — a Transfer log
 * alone can be emitted by anyone): the signer received the stock, sent it, or it moved between two others. Never "buy" or "sell". */
export function classify(t) {
  const s = t.signataire, mv = Array.isArray(t.mouvements) ? t.mouvements : [];
  if (s && mv.some((m) => m.vers === s)) return 'received';
  if (s && mv.some((m) => m.de === s)) return 'sent';
  return 'moved';
}

export function createFly(circuit) {
  const N = circuit.neurons.map((n) => ({ ...n, dan: /^PAM/.test(n.type) ? 'reward' : /^PPL1/.test(n.type) ? 'punishment' : null }));
  const index = new Map(N.map((n, i) => [n.id, i]));
  /* Each MBON's compartment, from MEASURED synapses: the dopamine class (PAM reward / PPL1 punishment) that sends it the most.
   * In the fly, dopamine depresses KC->MBON synapses in its compartment, so a PAM compartment's MBON pushes AWAY (reward silences it)
   * and a PPL1 compartment's MBON pushes TOWARD. */
  const danTo = new Map();
  for (const [a, b, w] of circuit.edges) {
    const A = N[index.get(a)], B = N[index.get(b)];
    if (A.dan && B.family === 'MBON') { const o = danTo.get(b) || { reward: 0, punishment: 0, from: [] }; o[A.dan] += w; o.from.push([index.get(a), w]); danTo.set(b, o); }
  }
  N.forEach((n) => { if (n.family !== 'MBON') return; const o = danTo.get(n.id);
    n.valence = !o ? null : o.reward > o.punishment ? 'avoid' : 'approach';
    const tot = o ? o.from.reduce((s, [, w]) => s + w, 0) : 0; n.danIn = o ? o.from.map(([i, w]) => [i, w / tot]) : []; });

  const incoming = N.map(() => []), totalIn = new Float64Array(N.length);
  /* dopamine is a modulator, not a driver: its synapses are not spread as excitation, their effect is the learning in step();
   * APL is inhibitory (GABA): its synapses are not spread as excitation either, its effect is the top-10% rule in step() */
  for (const [a, b, w] of circuit.edges) { const i = index.get(a), j = index.get(b); if (N[i].family === 'DAN' || N[i].family === 'APL') continue; incoming[j].push([i, w]); totalIn[j] += w; }
  /* [source, normalised weight, plasticity multiplier (KC->MBON only)] */
  const inputs = incoming.map((l, j) => l.map(([i, w]) => [i, w / totalIn[j], N[i].family === 'KC' && N[j].family === 'MBON' ? 1 : null]));
  let act = new Float64Array(N.length), next = new Float64Array(N.length);
  const kcIdx = [], mbonIdx = []; let aplIdx = -1;
  N.forEach((n, j) => { if (n.family === 'KC') kcIdx.push(j); if (n.family === 'MBON') mbonIdx.push(j); if (n.family === 'APL') aplIdx = j; });
  N.counts = { approach: N.filter((n) => n.valence === 'approach').length, avoid: N.filter((n) => n.valence === 'avoid').length };
  /* every measured connection of every neuron, for the map: [other neuron, synapses] */
  N.out = N.map(() => []); N.in = N.map(() => []);
  for (const [a, b, w] of circuit.edges) { const i = index.get(a), j = index.get(b); N.out[i].push([j, w]); N.in[j].push([i, w]); }

  /* One step: synapse-weighted mean of inputs (KC->MBON scaled by what was learned); APL keeps the top 10% of Kenyon cells; then dopamine
   * depresses the KC->MBON synapses of co-active Kenyon cells in its compartment (the fly's learning rule), slowly recovering. */
  function step(drive) {
    for (let j = 0; j < N.length; j++) {
      /* dopamine neurons carry the teaching signal (the price move) only, and only while it is felt */
      if (N[j].family === 'DAN') { next[j] = drive[j] || 0; continue; }
      let s = 0; for (const [i, w, m] of inputs[j]) s += w * (m == null ? 1 : m) * act[i];
      next[j] = Math.min(1, FLY.DECAY * act[j] + FLY.GAIN * s * (1 - FLY.DECAY) + (drive[j] || 0));
    }
    const cut = kcIdx.map((j) => next[j]).sort((a, b) => b - a)[Math.floor(kcIdx.length * FLY.KC_SHARE)] || 0;
    let activeKc = 0;
    for (const j of kcIdx) { if (next[j] <= cut || next[j] < 0.01) next[j] = 0; else activeKc++; }
    if (aplIdx >= 0) next[aplIdx] = Math.min(1, activeKc / (kcIdx.length * FLY.KC_SHARE));
    for (const j of mbonIdx) {
      let d = 0; for (const [i, w] of N[j].danIn) d += w * next[i];
      for (const e of inputs[j]) if (e[2] != null) {
        const k = next[e[0]];
        e[2] = Math.max(FLY.FLOOR, Math.min(1, e[2] - FLY.LEARN * d * k * e[2] + FLY.RECOVER * (1 - e[2])));
      }
    }
    [act, next] = [next, act];
  }

  /* The odor of a window: each kind of transaction on its own third of the PNs (id mod 3, arbitrary), strength by its USD size. */
  const ODOR_OF = { received: 0n, sent: 1n, moved: 2n };
  function odorDrive(mix) {
    const drive = new Float64Array(N.length);
    N.forEach((n, j) => {
      if (n.family !== 'PN') return;
      for (const [kind, usd] of Object.entries(mix)) if (usd > 0 && ODOR_OF[kind] === BigInt(n.id) % 3n)
        drive[j] = Math.max(drive[j], weber(usd, FLY.ODOR_UNIT_USD, FLY.ODOR_SPAN) * (0.6 + 0.4 * ((j * 7919) % 97) / 97));
    });
    return drive;
  }
  /* The outcome: a rise drives the PAM (reward) dopamine neurons, a fall the PPL1 (punishment) ones, strength by Weber-Fechner. */
  function addDopamine(drive, move) {
    const s = weber(move, FLY.WEBER_UNIT, FLY.WEBER_SPAN), dan = move > 0 ? 'reward' : 'punishment';
    if (move) N.forEach((n, j) => { if (n.dan === dan) drive[j] = s * 0.5; });
    return s;
  }
  /* The tendency is what the active Kenyon cells still send to each side, against what a naive fly would send (100% = nothing learned). */
  function tendency() {
    const sum = { approach: [0, 0], avoid: [0, 0] };
    for (const j of mbonIdx) { const v = N[j].valence; if (!v) continue;
      for (const [i, w, m] of inputs[j]) if (m != null && act[i] > 0) { sum[v][0] += act[i] * w * m; sum[v][1] += act[i] * w; } }
    if (!sum.approach[1] && !sum.avoid[1]) return { ap: 1, av: 1, t: 0, word: 'quiet' };
    const ap = sum.approach[1] ? sum.approach[0] / sum.approach[1] : 1, av = sum.avoid[1] ? sum.avoid[0] / sum.avoid[1] : 1;
    const t = (ap - av) / Math.max(1e-6, ap + av);
    return { ap, av, t, word: t > 0.02 ? 'approach' : t < -0.02 ? 'avoid' : 'undecided' };
  }
  /* Synapse trace: the KC->MBON multipliers before a learning pulse, and which ones it weakened. */
  function snapshot() { const s = []; for (const j of mbonIdx) for (const e of inputs[j]) if (e[2] != null) s.push(e[2]); return s; }
  function weakened(before) {
    const out = []; let k = 0;
    for (const j of mbonIdx) for (const e of inputs[j]) if (e[2] != null) { const d = e[2] - before[k++]; if (d < -0.002) out.push({ i: e[0], j, d }); }
    return out.sort((a, b) => a.d - b.d);
  }
  /* memory as integers (1e-5), to keep or to send */
  function exportMemory() { const m = []; for (const j of mbonIdx) for (const e of inputs[j]) if (e[2] != null) m.push(Math.round(e[2] * 1e5)); return m; }
  function importMemory(m) { let k = 0; for (const j of mbonIdx) for (const e of inputs[j]) if (e[2] != null) { e[2] = Array.isArray(m) && Number.isFinite(m[k]) ? m[k] / 1e5 : 1; k++; } }

  /* Pulses are queued and never overlap: each drives the circuit for PULSE_STEPS steps, then the circuit rests and fades. The tendency is
   * read at the pulse's last driven step: after it, Kenyon->Kenyon recurrence settles on the same hub cells whatever the stimulus. */
  const queue = []; let pulseSteps = 0, pulseDrive = null, onPeak = null, rest = 0, peak = null, ticks = 0;
  function present(drive, { onStart, onPeak: peakFn } = {}) { queue.push({ drive, onStart, peakFn }); }
  function tick() {
    if (pulseSteps === 0 && rest === 0 && queue.length) {
      const q = queue.shift(); if (q.onStart) q.onStart();
      pulseDrive = q.drive; pulseSteps = FLY.PULSE_STEPS; onPeak = q.peakFn || null;
    }
    const d = pulseSteps > 0 ? pulseDrive : null; if (pulseSteps > 0) pulseSteps--; else if (rest > 0) rest--;
    step(d || []);
    ticks++;
    if (d && pulseSteps === 0) { peak = tendency(); rest = FLY.REST_TICKS; if (onPeak) { const f = onPeak; onPeak = null; f(peak); } }
  }
  /* the server has no screen: it runs the queued pulses to the end at once */
  function drain(max = 10000) { let k = 0; while ((queue.length || pulseSteps || rest) && k++ < max) tick(); }

  return { N, inputs, kcIdx, mbonIdx, get act() { return act; }, get peak() { return peak; }, get ticks() { return ticks; },
    step, odorDrive, addDopamine, tendency, snapshot, weakened, exportMemory, importMemory, present, tick, drain };
}

/* The market protocol around a fly. One window: price + new transactions. Judge and teach with the last window's odor, then ask about
 * this one. Everything that happens is EMITTED as plain events (no text formatting here): the page shows them, the server keeps them. */
export function createSession(fly, emit) {
  const tally = { consistent: 0, opposite: 0, flat: 0, undecided: 0 };
  /* PAPER book, never real funds, never a signature: the fly is in the stock for a window when it predicted approach, out otherwise;
   * two dumb witnesses next to it; every change of position pays the pool's own fee, read on chain. */
  const books = { fly: { label: 'Fly', pos: 0, ret: 1, switches: 0 }, hold: { label: 'Always in', pos: 0, ret: 1, switches: 0 }, momentum: { label: 'Follow last move', pos: 0, ret: 1, switches: 0 } };
  let feePips = null, settled = 0, seen = new Set(), prevWin = null, firstWindow = true, lastOdor = null;

  function predict(mix, sim, done) {
    fly.present(fly.odorDrive(mix), { onPeak: (t) => { emit({ type: 'predict', sim, mix, ap: t.ap, av: t.av, word: t.word }); if (done) done(t.word); } });
  }
  function learn(mix, move, sim) {
    const drive = fly.odorDrive(mix), s = fly.addDopamine(drive, move);
    let before = null;
    fly.present(drive, { onStart: () => { before = fly.snapshot(); }, onPeak: () => {
      const list = fly.weakened(before);
      emit({ type: 'taught', sim, mix, move, strength: s, weakened: list.length,
        sides: list.reduce((o, x) => { const v = fly.N[x.j].valence || 'none'; o[v] = (o[v] || 0) + 1; return o; }, {}),
        top: list.slice(0, 40).map(({ i, j, d }) => ({ i, j, d })) });
    } });
  }
  function judge(prediction, move) {
    if (prediction !== 'approach' && prediction !== 'avoid') { tally.undecided++; return; }
    const kind = Math.abs(move) < FLY.FLAT ? 'flat' : (move > 0) === (prediction === 'approach') ? 'consistent' : 'opposite';
    tally[kind]++;
    emit({ type: 'verdict', prediction, move, kind });
  }
  function settle(win, move) {
    if (feePips == null) return;
    const want = { fly: win.prediction === 'approach' ? 1 : 0, hold: 1, momentum: win.lastMove > 0 ? 1 : 0 };
    for (const [k, b] of Object.entries(books)) {
      if (want[k] !== b.pos) { b.ret *= 1 - feePips / 1e6; b.switches++; b.pos = want[k]; }
      b.ret *= 1 + b.pos * move;
    }
    settled++;
  }

  /* price: { priceUsd, tokenDecimals, feePips, block } or null; transactions: the /api/activite rows or null */
  function window({ symbol, price, transactions }) {
    let p = null, decimals = null;
    if (price && typeof price.priceUsd === 'number') { p = price.priceUsd; decimals = price.tokenDecimals; if (Number.isInteger(price.feePips)) feePips = price.feePips; }
    const mix = { received: 0, sent: 0, moved: 0 };
    let fresh = [];
    if (Array.isArray(transactions)) {
      fresh = transactions.filter((t) => t && t.tx && !seen.has(t.tx)).sort((a, b) => a.bloc - b.bloc);
      fresh.forEach((t) => seen.add(t.tx));
      if (seen.size > 5000) seen = new Set([...seen].slice(-2000));
      if (firstWindow) { emit({ type: 'skipped', n: fresh.length }); fresh = []; }
    }
    firstWindow = false;
    if (p != null && decimals != null) {
      fresh.forEach((t) => {
        const units = (Array.isArray(t.mouvements) ? t.mouvements : []).reduce((s, m) => s + Number(BigInt(m.montant || 0)), 0) / 10 ** decimals;
        const kind = classify(t), usd = units * p; mix[kind] += usd;
        emit({ type: 'tx', symbol, kind, units, usd, tx: t.tx, bloc: t.bloc });
      });
    }
    let lastMove = 0;
    if (prevWin && p != null && prevWin.price != null) {
      const move = lastMove = p / prevWin.price - 1;
      settle(prevWin, move);
      if (prevWin.hasOdor) { judge(prevWin.prediction, move); if (move !== 0) learn(prevWin.mix, move, false); }
    }
    const hasOdor = mix.received + mix.sent + mix.moved > 0;
    if (hasOdor) lastOdor = { ...mix };
    const win = { price: p, mix, hasOdor, prediction: null, lastMove };
    if (hasOdor) predict(mix, false, (word) => { win.prediction = word; });
    prevWin = win;
    return { price: p, hasOdor };
  }
  function state() {
    return { tally: { ...tally }, books: Object.fromEntries(Object.entries(books).map(([k, b]) => [k, { label: b.label, pos: b.pos, ret: b.ret, switches: b.switches }])), settled, feePips };
  }
  function restore(x) {
    Object.assign(tally, { consistent: 0, opposite: 0, flat: 0, undecided: 0 }, x && x.tally ? x.tally : {});
    for (const [k, b] of Object.entries(books)) Object.assign(b, { pos: 0, ret: x && x.books && x.books[k] ? x.books[k].ret : 1, switches: x && x.books && x.books[k] ? x.books[k].switches : 0 });
    settled = x && Number.isFinite(x.settled) ? x.settled : 0;
  }
  function reset() { seen = new Set(); prevWin = null; firstWindow = true; feePips = null; lastOdor = null; }
  /* the odor of the last window that had real trades: a simulation is injected on what is really happening, not on a made-up smell */
  return { window, predict, learn, state, restore, reset, get feePips() { return feePips; }, get settled() { return settled; },
    get lastOdor() { return lastOdor ? { ...lastOdor } : null; } };
}
