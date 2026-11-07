/* The real memory circuit of the fly (hemibrain v1.2, Janelia FlyEM, CC BY 4.0) wired READ-ONLY to the price of a tokenized stock.
 * The price comes from /api/actions/reference/<address> (Chainlink feed read by the server). Neurons and synapses are measured; the
 * dynamics (proportional spread, APL = keep the top 10% of Kenyon cells) and the rise/fall mapping onto PNs are OUR choices, stated on the
 * page. Nothing is signed, nothing is advice. */
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';

/* Order: 24 h volume measured by Coinbase search_tokens on 2026-11-07 (mesures/coinbase-actions-20261107.json). ADDRESSES come from the
 * registry, never from here. */
const ORDER = ['SNDKc', 'MSTRc', 'SPCXc', 'NVDAc', 'AMZNc', 'GOOGLc', 'METAc', 'MSFTc', 'TSLAc', 'MUc', 'AAPLc', 'PLTRc'];
const STOCKS = ORDER.map((s) => [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === s)).filter(Boolean)
  .map(([address, t]) => ({ address, symbol: t.symbole }));

const COLOR = { PN: '#4fd1c5', KC: '#f6c453', MBON: '#f472b6', DAN: '#a78bfa', APL: '#f87171' };
const FAMILIES = ['PN', 'KC', 'MBON', 'DAN', 'APL'];
const KC_SHARE = 0.10, DECAY = 0.82, GAIN = 0.9, POLL_MS = 30000;

const canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const fmt = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const clock = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

let N = [], inputs = [], act, next, current = STOCKS[0], lastPrice = null, timer = null;

function log(text, sim) {
  const p = document.createElement('p'); if (sim) p.className = 'sim';
  p.textContent = clock() + ' · ' + text; $('log').prepend(p);
  while ($('log').children.length > 60) $('log').lastChild.remove();
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
  cloud(by.MBON || [], W * 0.85, H * 0.40, W * 0.07, H * 0.22);
  (by.DAN || []).forEach((n, i, l) => { const t = Math.PI * (0.12 + 0.76 * (i / Math.max(1, l.length - 1))), j = (i % 5) * 9;
    n.x = W * 0.5 - (W * 0.38 + j) * Math.cos(t); n.y = H * 0.50 + (H * 0.36 + j) * Math.sin(t) * 0.9; });
  (by.APL || []).forEach((n) => { n.x = W * 0.50; n.y = H * 0.70; });
}

function prepare(circuit) {
  N = circuit.neurons.map((n) => ({ ...n }));
  const index = new Map(N.map((n, i) => [n.id, i]));
  const incoming = N.map(() => []), totalIn = new Float64Array(N.length);
  for (const [a, b, w] of circuit.edges) { const i = index.get(a), j = index.get(b); incoming[j].push([i, w]); totalIn[j] += w; }
  inputs = incoming.map((l, j) => l.map(([i, w]) => [i, w / totalIn[j]]));
  act = new Float64Array(N.length); next = new Float64Array(N.length);
  /* drawn edges: the 1,800 strongest, so the canvas stays readable */
  N.edges = circuit.edges.map(([a, b, w]) => [index.get(a), index.get(b), w]).sort((x, y) => y[2] - x[2]).slice(0, 1800);
  N.wMax = N.edges[0][2];
  place(N);
}

/* One step: each neuron takes the synapse-weighted mean of its inputs; APL lets only the top 10% of Kenyon cells live. */
function step(drive) {
  for (let j = 0; j < N.length; j++) {
    let s = 0; for (const [i, w] of inputs[j]) s += w * act[i];
    next[j] = Math.min(1, DECAY * act[j] + GAIN * s * (1 - DECAY) + (drive[j] || 0));
  }
  const kc = []; for (let j = 0; j < N.length; j++) if (N[j].family === 'KC') kc.push(j);
  const cut = kc.map((j) => next[j]).sort((a, b) => b - a)[Math.floor(kc.length * KC_SHARE)] || 0;
  let activeKc = 0;
  for (const j of kc) { if (next[j] <= cut) next[j] = 0; else activeKc++; }
  const apl = N.findIndex((n) => n.family === 'APL'); if (apl >= 0) next[apl] = Math.min(1, activeKc / (kc.length * KC_SHARE));
  [act, next] = [next, act];
}

/* A price move becomes a pulse: rises go to even-id PNs, falls to odd-id PNs (arbitrary choice); strength follows Weber-Fechner (log of
 * the relative move), and dopamine receives the size. */
function pulse(move) {
  const drive = new Float64Array(N.length), strength = Math.min(1, Math.log1p(Math.abs(move) * 100) / Math.log1p(8));
  const parity = move > 0 ? 0n : 1n;
  N.forEach((n, j) => {
    if (n.family === 'PN' && BigInt(n.id) % 2n === parity) drive[j] = strength * (0.6 + 0.4 * ((j * 7919) % 97) / 97);
    if (n.family === 'DAN') drive[j] = strength * 0.35;
  });
  return { drive, strength };
}

let pulseSteps = 0, pulseDrive = null;
function fire(move, sim, price) {
  const { drive, strength } = pulse(move);
  pulseDrive = drive; pulseSteps = 6;
  log(`${sim ? 'SIMULATION · ' : ''}${current.symbol} ${move > 0 ? '+' : '−'}${fmt(Math.abs(move) * 100, 1)}% (${move > 0 ? 'rise' : 'fall'})`
    + `${price ? ' at $' + fmt(price) : ''} → input ${fmt(strength * 100, 0)}% (Weber–Fechner)`, sim);
  setTimeout(() => { const m = measure(); log(`… active Kenyon cells ${m.KC.n}/${m.KC.total}, strongest output: ${m.top}`, sim); }, 1600);
}

function measure() {
  const r = {}; for (const f of FAMILIES) r[f] = { s: 0, n: 0, total: 0 };
  let top = null;
  N.forEach((n, j) => { const x = r[n.family]; x.total++; x.s += act[j]; if (act[j] > 0.05) x.n++;
    if (n.family === 'MBON' && (top == null || act[j] > act[top])) top = j; });
  r.top = top != null && act[top] > 0.02 ? `${N[top].type} (${fmt(act[top] * 100, 0)}%)` : 'none';
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
    ctx.globalAlpha = 0.35 + a * 0.65; ctx.fillStyle = COLOR[n.family];
    if (a > 0.08) { ctx.shadowColor = COLOR[n.family]; ctx.shadowBlur = 14 * a; } else ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

function gauges() {
  const m = measure(), names = { PN: 'PN', KC: 'Kenyon', MBON: 'MBON', DAN: 'Dopa.', APL: 'APL' };
  $('gauges').innerHTML = FAMILIES.map((f) => { const p = m[f].total ? m[f].s / m[f].total : 0;
    return `<div><span>${names[f]}</span><span class="bar"><i style="width:${Math.min(100, p * 100 * 3)}%;background:${COLOR[f]}"></i></span><span>${fmt(p * 100, 1)}%</span></div>`; }).join('');
  $('output').textContent = `Most active MBON output: ${m.top}`;
}

let lastStep = 0;
function loop(t) {
  if (t - lastStep > 120) {
    lastStep = t;
    const d = pulseSteps > 0 ? pulseDrive : null; if (pulseSteps > 0) pulseSteps--;
    step(d || []);
    if (Math.floor(t / 500) !== Math.floor((t - 120) / 500)) gauges();
  }
  draw(); requestAnimationFrame(loop);
}

async function readPrice() {
  const stock = current;
  try {
    const r = await fetch('/api/actions/reference/' + stock.address, { cache: 'no-store' }).then((x) => x.json());
    if (stock !== current) return;
    const ref = r && r.reference;
    if (!r || !r.ok || !ref || ref.etat !== 'LU' || typeof ref.prixUsd !== 'number') {
      $('state').textContent = 'price not read: ' + ((r && r.pourquoi) || (ref && ref.pourquoi) || 'empty response'); return;
    }
    $('price').textContent = '$' + fmt(ref.prixUsd);
    $('state').textContent = `${ref.libelle} · updated ${new Date(ref.majA).toLocaleString('en-GB')}${ref.pourquoi ? ' · ' + ref.pourquoi : ''}`;
    if (lastPrice == null) log(`${stock.symbol} read at $${fmt(ref.prixUsd)} (Chainlink)${ref.fraicheur === 'DERNIERE_VALEUR' ? ', market closed: the fly receives nothing until the price moves' : ''}`);
    else if (ref.prixUsd !== lastPrice) fire(ref.prixUsd / lastPrice - 1, false, ref.prixUsd);
    lastPrice = ref.prixUsd;
  } catch (e) { $('state').textContent = 'price not read: ' + (e && e.message || e); }
}

function select(i) {
  current = STOCKS[i]; lastPrice = null; $('price').textContent = '—'; $('state').textContent = 'reading…';
  clearInterval(timer); readPrice(); timer = setInterval(readPrice, POLL_MS);
}

async function start() {
  $('pick').innerHTML = STOCKS.map((a, i) => `<option value="${i}">${a.symbol}</option>`).join('');
  $('pick').addEventListener('change', (e) => select(Number(e.target.value)));
  const slider = $('size'), show = () => { const v = Number(slider.value) / 10; $('sizeValue').textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), 1) + '%'; };
  slider.addEventListener('input', show); show();
  $('inject').addEventListener('click', () => { const v = Number(slider.value) / 1000; if (v) fire(v, true, null); });
  const circuit = await fetch('fly-brain-circuit.json').then((r) => r.json());
  prepare(circuit);
  log(`circuit loaded: ${N.length} neurons, ${circuit.edges.length} connections ≥ ${circuit.synapseThreshold} synapses`);
  requestAnimationFrame(loop);
  select(0);
}
start().catch((e) => log('error: ' + (e && e.message || e)));
