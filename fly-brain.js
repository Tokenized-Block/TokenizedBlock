/* The real memory circuit of the fly (hemibrain v1.2, Janelia FlyEM, CC BY 4.0) living READ-ONLY on the live price of a tokenized stock.
 * Price: /api/fly/price/<address> = the stock's Aerodrome pool (slot0), 24/7, weekends included. Reference: /api/actions/reference/
 * (Chainlink, holds its last value while US markets are closed) — shown next to it, never used as the stimulus.
 * Measured: neurons, synapse counts, which dopamine neurons reach which MBON. Ours, and stated on the page: the dynamics, the rise/fall
 * mapping onto PNs, the learning constants, the approach/avoid reading. Nothing is signed, nothing is advice. */
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';

/* Order: 24 h volume measured by Coinbase search_tokens on 2026-11-07 (mesures/coinbase-actions-20261107.json). ADDRESSES come from the
 * registry, never from here. */
const ORDER = ['SNDKc', 'MSTRc', 'SPCXc', 'NVDAc', 'AMZNc', 'GOOGLc', 'METAc', 'MSFTc', 'TSLAc', 'MUc', 'AAPLc', 'PLTRc'];
const STOCKS = ORDER.map((s) => [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === s)).filter(Boolean)
  .map(([address, t]) => ({ address, symbol: t.symbole }));

const COLOR = { PN: '#4fd1c5', KC: '#f6c453', MBON: '#f472b6', DAN: '#a78bfa', APL: '#f87171' };
const FAMILIES = ['PN', 'KC', 'MBON', 'DAN', 'APL'];
/* our constants */
const KC_SHARE = 0.10, DECAY = 0.6, GAIN = 0.5, POLL_MS = 10000, REF_MS = 60000;
const WEBER_UNIT = 0.0005, WEBER_SPAN = 200;            // a 0.05% move is one unit; strength saturates near 10%
const LEARN = 0.15, RECOVER = 0.0002, FLOOR = 0.05;      // a strong move weakens its pattern's synapses by a few %; forgotten over ~10 min (0.12 s / 0.0002)
const HORIZON_MS = 5 * 60000, FLAT = 0.0005;             // consequences are judged 5 min later; under 0.05% = flat

const canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
const spark = document.getElementById('spark'), sctx = spark.getContext('2d');
const $ = (id) => document.getElementById(id);
const fmt = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x) * 100, d) + '%';
const clock = (t = Date.now()) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

let N = [], inputs = [], act, next, kcIdx = [], mbonIdx = [], aplIdx = -1;
let current = STOCKS[0], lastPrice = null, history = [], pending = [], tally = { consistent: 0, opposite: 0, flat: 0 }, timer = null, refTimer = null;

function log(text, kind) {
  const p = document.createElement('p'); if (kind) p.className = kind;
  p.textContent = clock() + ' · ' + text; $('log').prepend(p);
  while ($('log').children.length > 80) $('log').lastChild.remove();
}

/* Deterministic layout: PNs left, Kenyon cells centre, MBONs right, dopamine arc below, APL at the core. */
function place(neurons) {
  const W = canvas.width, H = canvas.height, by = {};
  for (const n of neurons) (by[n.family] = by[n.family] || []).push(n);
  const cloud = (list, cx, cy, rx, ry) => list.forEach((n, i) => {
    const t = i * 2.399963, r = Math.sqrt((i + 0.5) / list.length);
    n.x = cx + rx * r * Math.cos(t); n.y = cy + ry * r * Math.sin(t);
  });
  cloud(by.PN || [], W * 0.15, H * 0.42, W * 0.11, H * 0.30);
  cloud(by.KC || [], W * 0.50, H * 0.36, W * 0.15, H * 0.24);
  const mb = by.MBON || [];
  cloud(mb.filter((n) => n.valence === 'approach'), W * 0.86, H * 0.25, W * 0.06, H * 0.13);
  cloud(mb.filter((n) => n.valence !== 'approach'), W * 0.86, H * 0.58, W * 0.06, H * 0.13);
  (by.DAN || []).forEach((n, i, l) => { const t = Math.PI * (0.12 + 0.76 * (i / Math.max(1, l.length - 1))), j = (i % 5) * 9;
    n.x = W * 0.5 - (W * 0.38 + j) * Math.cos(t); n.y = H * 0.50 + (H * 0.36 + j) * Math.sin(t) * 0.9; });
  (by.APL || []).forEach((n) => { n.x = W * 0.50; n.y = H * 0.70; });
}

function prepare(circuit) {
  N = circuit.neurons.map((n) => ({ ...n, dan: /^PAM/.test(n.type) ? 'reward' : /^PPL1/.test(n.type) ? 'punishment' : null }));
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
  /* dopamine is a modulator, not a driver: its synapses are not spread as excitation, their effect is the learning in step() */
  /* APL is inhibitory (GABA): its synapses are not spread as excitation either, its effect is the top-10% rule in step() */
  for (const [a, b, w] of circuit.edges) { const i = index.get(a), j = index.get(b); if (N[i].family === 'DAN' || N[i].family === 'APL') continue; incoming[j].push([i, w]); totalIn[j] += w; }
  /* [source, normalised weight, plasticity multiplier (KC->MBON only)] */
  inputs = incoming.map((l, j) => l.map(([i, w]) => [i, w / totalIn[j], N[i].family === 'KC' && N[j].family === 'MBON' ? 1 : null]));
  act = new Float64Array(N.length); next = new Float64Array(N.length);
  N.forEach((n, j) => { if (n.family === 'KC') kcIdx.push(j); if (n.family === 'MBON') mbonIdx.push(j); if (n.family === 'APL') aplIdx = j; });
  N.edges = circuit.edges.map(([a, b, w]) => [index.get(a), index.get(b), w]).sort((x, y) => y[2] - x[2]).slice(0, 1800);
  N.wMax = N.edges[0][2];
  N.counts = { approach: N.filter((n) => n.valence === 'approach').length, avoid: N.filter((n) => n.valence === 'avoid').length };
  place(N);
}

/* One step: synapse-weighted mean of inputs (KC->MBON scaled by what was learned); APL keeps the top 10% of Kenyon cells;
 * then dopamine depresses the KC->MBON synapses of co-active Kenyon cells in its compartment (the fly's learning rule), slowly recovering. */
function step(drive) {
  for (let j = 0; j < N.length; j++) {
    /* dopamine neurons carry the teaching signal (the price move) only, so a rise never wakes the punishment side through Kenyon cells */
    /* ...and only while the move is being felt: a lingering dopamine tail would teach the hub cells the circuit settles on afterwards */
    if (N[j].family === 'DAN') { next[j] = drive[j] || 0; continue; }
    let s = 0; for (const [i, w, m] of inputs[j]) s += w * (m == null ? 1 : m) * act[i];
    next[j] = Math.min(1, DECAY * act[j] + GAIN * s * (1 - DECAY) + (drive[j] || 0));
  }
  const cut = kcIdx.map((j) => next[j]).sort((a, b) => b - a)[Math.floor(kcIdx.length * KC_SHARE)] || 0;
  let activeKc = 0;
  for (const j of kcIdx) { if (next[j] <= cut || next[j] < 0.01) next[j] = 0; else activeKc++; }
  if (aplIdx >= 0) next[aplIdx] = Math.min(1, activeKc / (kcIdx.length * KC_SHARE));
  for (const j of mbonIdx) {
    let d = 0; for (const [i, w] of N[j].danIn) d += w * next[i];
    for (const e of inputs[j]) if (e[2] != null) {
      const k = next[e[0]];
      e[2] = Math.max(FLOOR, Math.min(1, e[2] - LEARN * d * k * e[2] + RECOVER * (1 - e[2])));
    }
  }
  [act, next] = [next, act];
}

/* A price move becomes a pulse: rises on even-id PNs, falls on odd-id PNs (arbitrary); strength = Weber-Fechner, log of the relative
 * move; a rise drives the PAM (reward) dopamine neurons, a fall the PPL1 (punishment) ones. */
function pulse(move) {
  const drive = new Float64Array(N.length);
  const strength = Math.min(1, Math.log1p(Math.abs(move) / WEBER_UNIT) / Math.log1p(WEBER_SPAN));
  const parity = move > 0 ? 0n : 1n, dan = move > 0 ? 'reward' : 'punishment';
  N.forEach((n, j) => {
    if (n.family === 'PN' && BigInt(n.id) % 2n === parity) drive[j] = strength * (0.6 + 0.4 * ((j * 7919) % 97) / 97);
    if (n.dan === dan) drive[j] = strength * 0.5;
  });
  return { drive, strength };
}

/* The tendency is what the active Kenyon cells still send to each side, against what a naive fly would send (100% = nothing learned):
 * a pattern whose approach synapses were weakened by punishment now drives the avoid side harder, and the other way round. */
function tendency() {
  const sum = { approach: [0, 0], avoid: [0, 0] };
  for (const j of mbonIdx) { const v = N[j].valence; if (!v) continue;
    for (const [i, w, m] of inputs[j]) if (m != null && act[i] > 0) { sum[v][0] += act[i] * w * m; sum[v][1] += act[i] * w; } }
  if (!sum.approach[1] && !sum.avoid[1]) return { ap: 1, av: 1, t: 0, word: 'quiet' };
  const ap = sum.approach[1] ? sum.approach[0] / sum.approach[1] : 1, av = sum.avoid[1] ? sum.avoid[0] / sum.avoid[1] : 1;
  const t = (ap - av) / Math.max(1e-6, ap + av);
  return { ap, av, t, word: t > 0.02 ? 'approach' : t < -0.02 ? 'avoid' : 'undecided' };
}

function memory() {
  const r = { approach: [0, 0], avoid: [0, 0] };
  for (const j of mbonIdx) { const v = N[j].valence; if (!v) continue; for (const e of inputs[j]) if (e[2] != null) { r[v][0] += 1 - e[2]; r[v][1]++; } }
  return { approach: r.approach[1] ? r.approach[0] / r.approach[1] : 0, avoid: r.avoid[1] ? r.avoid[0] / r.avoid[1] : 0 };
}

let pulseSteps = 0, pulseDrive = null, onPeak = null;
function fire(move, sim, price) {
  const { drive, strength } = pulse(move);
  pulseDrive = drive; pulseSteps = 6;
  log(`${sim ? 'SIMULATION · ' : ''}${current.symbol} ${pct(move, 3)} ${price ? 'to $' + fmt(price) + ' ' : ''}→ input ${fmt(strength * 100, 0)}% `
    + `(Weber–Fechner), ${move > 0 ? 'reward (PAM)' : 'punishment (PPL1)'} dopamine`, sim ? 'sim' : 'live');
  onPeak = (t) => {
    const m = measure(), mem = memory();
    const say = { approach: 'leans toward it', avoid: 'pulls away from it', undecided: 'is undecided', quiet: 'barely reacts' }[t.word];
    log(`… the circuit ${say} (this pattern still drives approach at ${fmt(t.ap * 100, 1)}% and avoid at ${fmt(t.av * 100, 1)}% of a naive fly), Kenyon ${m.KC.n}/${m.KC.total}, `
      + `memory trace: approach side −${fmt(mem.approach * 100, 1)}%, avoid side −${fmt(mem.avoid * 100, 1)}%`, sim ? 'sim' : 'live');
    if (!sim && price && (t.word === 'approach' || t.word === 'avoid')) pending.push({ t: Date.now(), word: t.word, price, symbol: current.symbol });
  };
}

/* Consequences: 5 min after a computed approach/avoid, what did the live price do? Misses are counted next to hits. */
function judge(priceNow) {
  const due = pending.filter((p) => Date.now() - p.t >= HORIZON_MS && p.symbol === current.symbol);
  pending = pending.filter((p) => !due.includes(p));
  for (const p of due) {
    const move = priceNow / p.price - 1;
    const kind = Math.abs(move) < FLAT ? 'flat' : (move > 0) === (p.word === 'approach') ? 'consistent' : 'opposite';
    tally[kind]++;
    log(`consequence of ${clock(p.t)} (${p.word}): ${p.symbol} moved ${pct(move, 3)} in 5 min → ${kind === 'flat' ? 'flat, no verdict' : kind === 'consistent' ? 'the tendency matched the move' : 'the move went the other way'}`, 'verdict');
  }
  renderTally();
}

function renderTally() {
  const n = tally.consistent + tally.opposite;
  $('tally').textContent = `${tally.consistent} matched · ${tally.opposite} opposite · ${tally.flat} flat`
    + (n ? ` · ${fmt((tally.consistent / n) * 100, 0)}% on ${n} judged` : ' · nothing judged yet') + ` · ${pending.length} waiting`;
}

function measure() {
  const r = {}; for (const f of FAMILIES) r[f] = { s: 0, n: 0, total: 0 };
  let top = null;
  N.forEach((n, j) => { const x = r[n.family]; x.total++; x.s += act[j]; if (act[j] > 0.05) x.n++;
    if (n.family === 'MBON' && (top == null || act[j] > act[top])) top = j; });
  r.top = top != null && act[top] > 0.02 ? `${N[top].type} (${fmt(act[top] * 100, 0)}%, ${N[top].valence || 'no dopamine'})` : 'none';
  return r;
}

function draw() {
  const W = canvas.width, H = canvas.height;
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(5,7,13,0.35)'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (const [i, j, w] of N.edges) {
    const a = act[i], base = 0.025 + 0.05 * (w / N.wMax);
    ctx.strokeStyle = COLOR[N[i].family]; ctx.globalAlpha = Math.min(0.9, base + a * 0.45 * (0.3 + w / N.wMax));
    ctx.lineWidth = 0.4 + a * 1.2; ctx.beginPath(); ctx.moveTo(N[i].x, N[i].y); ctx.lineTo(N[j].x, N[j].y); ctx.stroke();
  }
  for (let j = 0; j < N.length; j++) {
    const n = N[j], a = act[j], r = (n.family === 'APL' ? 7 : n.family === 'MBON' ? 3.2 : 2.2) + a * 5;
    const c = n.family === 'DAN' && n.dan === 'punishment' ? '#fb923c' : COLOR[n.family];
    ctx.globalAlpha = 0.35 + a * 0.65; ctx.fillStyle = c;
    if (a > 0.08) { ctx.shadowColor = c; ctx.shadowBlur = 14 * a; } else ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 0.75; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#8a96ad'; ctx.font = '22px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('approach', W * 0.86, H * 0.08); ctx.fillText('avoid', W * 0.86, H * 0.80);
  ctx.globalAlpha = 1;
}

function drawSpark() {
  const W = spark.width, H = spark.height; sctx.clearRect(0, 0, W, H);
  if (history.length < 2) return;
  const ps = history.map((h) => h.p), lo = Math.min(...ps), hi = Math.max(...ps), span = hi - lo || hi * 1e-4;
  const t0 = history[0].t, t1 = history[history.length - 1].t || t0 + 1;
  sctx.strokeStyle = ps[ps.length - 1] >= ps[0] ? '#4ade80' : '#f87171'; sctx.lineWidth = 2; sctx.beginPath();
  history.forEach((h, i) => { const x = ((h.t - t0) / Math.max(1, t1 - t0)) * (W - 4) + 2, y = H - 4 - ((h.p - lo) / span) * (H - 8); if (i) sctx.lineTo(x, y); else sctx.moveTo(x, y); });
  sctx.stroke();
}

function gauges() {
  const m = measure(), t = peak || { t: 0, word: 'quiet' }, names = { PN: 'PN', KC: 'Kenyon', MBON: 'MBON', DAN: 'Dopa.', APL: 'APL' };
  $('gauges').innerHTML = FAMILIES.map((f) => { const p = m[f].total ? m[f].s / m[f].total : 0;
    return `<div><span>${names[f]}</span><span class="bar"><i style="width:${Math.min(100, p * 100 * 3)}%;background:${COLOR[f]}"></i></span><span>${fmt(p * 100, 1)}%</span></div>`; }).join('');
  $('output').textContent = `Most active output: ${m.top}`;
  const pos = 50 + 50 * Math.max(-1, Math.min(1, t.t * 4));
  $('needle').style.left = pos + '%';
  $('verdict').textContent = { approach: 'Approach', avoid: 'Avoid', undecided: 'Undecided', quiet: 'Quiet' }[t.word];
}

/* ── BEATS: the computed activity, played. A neuron "fires" on a step when a hash of (step, neuron) falls under its activity: no
 * Math.random, so the same moves give the same rhythm, like the block brain. Kenyon cells pluck a pentatonic note by cell, output
 * neurons hum high (approach side) or low (avoid side), reward dopamine rings, punishment dopamine drums, PNs tick. Off until asked:
 * browsers refuse sound without a click. */
const PENTA = [0, 2, 4, 7, 9];
let audio = null, master = null;
const fires = (j, t) => ((Math.imul(t + 1, 2654435761) ^ Math.imul(j + 7, 40503)) >>> 0) / 4294967296;
function voice({ freq, type = 'sine', dur = 0.12, vol = 0.08, noise = false, at = 0 }) {
  const t0 = audio.currentTime + at, g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(master);
  if (noise) {
    const b = audio.createBuffer(1, Math.ceil(audio.sampleRate * dur), audio.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = fires(i, ticks) * 2 - 1;
    const s = audio.createBufferSource(), f = audio.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    s.buffer = b; s.connect(f); f.connect(g); s.start(t0); return;
  }
  const o = audio.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0); o.connect(g); o.start(t0); o.stop(t0 + dur + 0.02);
}
function beat() {
  if (!audio) return;
  let n = 0; const cap = 7, slot = 0.12 / cap;
  for (const j of kcIdx) if (act[j] > 0 && fires(j, ticks) < act[j] * 0.5 && n < cap) {
    const k = kcIdx.indexOf(j); voice({ freq: 220 * 2 ** ((PENTA[k % 5] + 12 * ((k / 5 | 0) % 3)) / 12), type: 'triangle', dur: 0.18, vol: 0.05, at: slot * n++ });
  }
  for (const j of mbonIdx) if (N[j].valence && fires(j, ticks) < act[j] * 0.6 && n < cap) {
    voice({ freq: N[j].valence === 'approach' ? 660 : 110, type: 'sine', dur: 0.3, vol: 0.06, at: slot * n++ });
  }
  let rew = 0, pun = 0, pn = 0;
  N.forEach((x, j) => { if (x.dan === 'reward') rew = Math.max(rew, act[j]); if (x.dan === 'punishment') pun = Math.max(pun, act[j]); if (x.family === 'PN') pn += act[j]; });
  if (rew > 0.05 && ticks % 2 === 0) voice({ freq: 1320, type: 'sine', dur: 0.5, vol: 0.05 * rew });
  if (pun > 0.05 && ticks % 2 === 0) voice({ freq: 55, type: 'square', dur: 0.25, vol: 0.09 * pun });
  if (pn > 1 && ticks % 2 === 1) voice({ noise: true, dur: 0.04, vol: 0.03 });
}
function listen() {
  if (audio) { audio.close(); audio = null; $('listen').textContent = 'Listen to the brain'; return; }
  audio = new (window.AudioContext || window.webkitAudioContext)();
  master = audio.createGain(); master.gain.value = 0.7; master.connect(audio.destination);
  $('listen').textContent = 'Mute';
}

/* The brain steps on a timer, the drawing on animation frames: a background tab gets no frames, and its fly must keep living. */
/* The tendency is read at the pulse's last driven step: after it, Kenyon->Kenyon recurrence settles on the same hub cells whatever the
 * stimulus, and a later reading would describe that attractor, not the market move. */
let ticks = 0, peak = null;
function tick() {
  const d = pulseSteps > 0 ? pulseDrive : null; if (pulseSteps > 0) pulseSteps--;
  step(d || []);
  if (d && pulseSteps === 0) { peak = tendency(); if (onPeak) { const f = onPeak; onPeak = null; f(peak); } }
  beat();
  if (++ticks % 4 === 0) gauges();
}
function loop() { draw(); requestAnimationFrame(loop); }

async function readPrice() {
  const stock = current;
  try {
    const r = await fetch('/api/fly/price/' + stock.address, { cache: 'no-store' }).then((x) => x.json());
    if (stock !== current) return;
    if (!r || !r.ok || typeof r.priceUsd !== 'number') {
      const last = history.length ? ` · showing the last price read at ${clock(history[history.length - 1].t)}` : '';
      $('state').textContent = 'live price not read this time (' + ((r && r.why) || 'empty response') + ')' + last + ' · next try in 10 s'; return;
    }
    $('price').textContent = '$' + fmt(r.priceUsd);
    $('state').textContent = `live on-chain price · Aerodrome pool · block ${r.block.toLocaleString('en-US')} · ${clock(Date.parse(r.readAt))}`;
    history.push({ t: Date.now(), p: r.priceUsd }); while (history.length && Date.now() - history[0].t > 3600000) history.shift();
    drawSpark();
    if (lastPrice == null) log(`${stock.symbol} live at $${fmt(r.priceUsd)} (on-chain pool, block ${r.block.toLocaleString('en-US')})`);
    else if (r.priceUsd !== lastPrice) fire(r.priceUsd / lastPrice - 1, false, r.priceUsd);
    lastPrice = r.priceUsd;
    judge(r.priceUsd);
  } catch (e) { $('state').textContent = 'live price not read: ' + (e && e.message || e); }
}

/* The Chainlink reference next to the live price: on a weekend it holds Friday's close, and the gap is the market's own view. */
async function readReference() {
  const stock = current;
  try {
    const r = await fetch('/api/actions/reference/' + stock.address, { cache: 'no-store' }).then((x) => x.json());
    if (stock !== current) return;
    const ref = r && r.reference;
    if (!r || !r.ok || !ref || ref.etat !== 'LU' || typeof ref.prixUsd !== 'number') { $('ref').textContent = 'reference not read'; return; }
    const gap = lastPrice ? lastPrice / ref.prixUsd - 1 : null;
    $('ref').textContent = `Reference $${fmt(ref.prixUsd)} (${ref.libelle}, ${ref.fraicheur === 'DERNIERE_VALEUR' ? 'US market closed, last value' : 'live'})`
      + (gap == null ? '' : ` · on-chain ${pct(gap)} vs reference`);
  } catch (_) { $('ref').textContent = 'reference not read'; }
}

function select(i) {
  current = STOCKS[i]; lastPrice = null; history = []; drawSpark();
  $('price').textContent = '—'; $('state').textContent = 'reading…'; $('ref').textContent = '';
  clearInterval(timer); clearInterval(refTimer);
  readPrice().then(readReference); timer = setInterval(readPrice, POLL_MS); refTimer = setInterval(readReference, REF_MS);
}

async function start() {
  $('pick').innerHTML = STOCKS.map((a, i) => `<option value="${i}">${a.symbol}</option>`).join('');
  $('pick').addEventListener('change', (e) => select(Number(e.target.value)));
  const slider = $('size'), show = () => { const v = Number(slider.value) / 1000; $('sizeValue').textContent = pct(v, 1); };
  slider.addEventListener('input', show); show();
  $('listen').addEventListener('click', listen);
  $('inject').addEventListener('click', () => { const v = Number(slider.value) / 1000; if (v) fire(v, true, null); });
  const circuit = await fetch('fly-brain-circuit.json').then((r) => r.json());
  prepare(circuit);
  log(`circuit loaded: ${N.length} neurons, ${circuit.edges.length} connections ≥ ${circuit.synapseThreshold} synapses; `
    + `${N.counts.approach} approach-side and ${N.counts.avoid} avoid-side MBONs, from measured dopamine inputs`);
  renderTally();
  setInterval(tick, 120);
  requestAnimationFrame(loop);
  select(0);
}
start().catch((e) => log('error: ' + (e && e.message || e)));
