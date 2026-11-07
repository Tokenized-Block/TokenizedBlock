/* The real memory circuit of the fly (hemibrain v1.2, Janelia FlyEM, CC BY 4.0) living READ-ONLY on a tokenized stock's real trades.
 * The brain and the protocol live in fly-core.js, shared with the server; this file only shows them: the map, the log, the gauges, the
 * beats, the memory kept in this browser, and the server's shared fly.
 * Price: /api/fly/price/<address> (the stock's Aerodrome pool, slot0, 24/7). Trades: /api/activite/<address> (Transfer logs, each
 * confirmed by its transaction's signer). Reference: /api/actions/reference/ (Chainlink) shown, never fed. Shared fly: /api/fly/state. */
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { createFly, createSession } from './fly-core.js';

/* Order: 24 h volume measured by Coinbase search_tokens on 2026-11-07 (mesures/coinbase-actions-20261107.json). ADDRESSES come from the
 * registry, never from here. */
const ORDER = ['SNDKc', 'MSTRc', 'SPCXc', 'NVDAc', 'AMZNc', 'GOOGLc', 'METAc', 'MSFTc', 'TSLAc', 'MUc', 'AAPLc', 'PLTRc'];
const STOCKS = ORDER.map((s) => [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === s)).filter(Boolean)
  .map(([address, t]) => ({ address, symbol: t.symbole }));

const COLOR = { PN: '#4fd1c5', KC: '#f6c453', MBON: '#f472b6', DAN: '#a78bfa', APL: '#f87171' };
const FAMILIES = ['PN', 'KC', 'MBON', 'DAN', 'APL'];
const POLL_MS = 30000, REF_MS = 60000, SHARED_MS = 20000;

const canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
const spark = document.getElementById('spark'), sctx = spark.getContext('2d');
const $ = (id) => document.getElementById(id);
const fmt = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x) * 100, d) + '%';
const clock = (t = Date.now()) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const mixText = (mix) => Object.entries(mix).filter(([, v]) => v > 0).map(([k, v]) => `${k} $${fmt(v, 0)}`).join(', ') || 'nothing';
const SAY = { approach: 'leans toward it', avoid: 'pulls away from it', undecided: 'is undecided', quiet: 'barely reacts' };

let fly = null, session = null, N = [], act = new Float64Array(0);
let current = STOCKS[0], lastPrice = null, history = [], timer = null, refTimer = null;

function log(text, kind, link) {
  const p = document.createElement('p'); if (kind) p.className = kind;
  p.textContent = clock() + ' · ' + text;
  if (link) { const a = document.createElement('a'); a.href = link.href; a.textContent = link.text; a.target = '_blank'; a.rel = 'noopener'; p.append(' · ', a); }
  $('log').prepend(p);
  while ($('log').children.length > 80) $('log').lastChild.remove();
}

/* Deterministic layout: PNs left, Kenyon cells centre, MBONs right (approach side above, avoid side below), dopamine arc, APL at the core. */
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

/* ── EVENTS from fly-core, shown. The shared fly's events (server) use the same shapes. ── */
let flash = [];
function showTrace(e, kind) {
  const until = Date.now() + 6000; flash = e.top.map(({ i, j }) => [i, j, until]);
  if (!e.weakened) { log('… no synapse changed enough to show (below 0.2%)', kind); return; }
  log(`… ${e.weakened} synapses weakened (${Object.entries(e.sides).map(([s, c]) => c + ' ' + s + ' side').join(', ')}); strongest: `
    + e.top.slice(0, 3).map(({ i, j, d }) => `${N[i].type} #${N[i].id} → ${N[j].type} ${pct(d, 1)}`).join(' · '), kind);
}
function show(e, symbol) {
  const kind = e.sim ? 'sim' : 'live';
  if (e.type === 'skipped') log(`${e.n} recent transactions already on chain: the fly starts smelling from the next ones`);
  else if (e.type === 'tx') log(`${e.kind}: ${fmt(e.units, 4)} ${symbol} ($${fmt(e.usd, 0)})`, 'live', { href: 'https://basescan.org/tx/' + e.tx, text: 'tx ' + e.tx.slice(0, 10) + '…' });
  else if (e.type === 'predict') log(`smells ${mixText(e.mix)} → the circuit ${SAY[e.word]} (approach ${fmt(e.ap * 100, 1)}% / avoid ${fmt(e.av * 100, 1)}% of a naive fly)${e.sim ? '' : ' — prediction for the next window'}`, kind);
  else if (e.type === 'taught') { log(`taught: ${mixText(e.mix)} was followed by ${pct(e.move, 3)} → ${e.move > 0 ? 'reward (PAM)' : 'punishment (PPL1)'} dopamine ${fmt(e.strength * 100, 0)}%`, kind); showTrace(e, kind); }
  else if (e.type === 'verdict') log(`consequence: predicted ${e.prediction}, the price moved ${pct(e.move, 3)} → ${e.kind === 'flat' ? 'flat, no verdict' : e.kind === 'consistent' ? 'it matched' : 'it went the other way'}`, 'verdict');
}
function onEvent(e) {
  show(e, current.symbol);
  if (e.type === 'verdict' || e.type === 'taught') { renderTally(); }
  if (e.type === 'taught' && !e.sim) saveMemory();
}

function renderBook(st = session.state(), el = $('book')) {
  el.innerHTML = `<div class="state">Paper P&amp;L after ${st.settled} windows, pool fee ${st.feePips == null ? '?' : fmt(st.feePips / 1e4, 2) + '%'} per switch:</div>`
    + Object.values(st.books).map((b) => `<div class="row"><span>${b.label}</span><span>${pct(b.ret - 1, 3)}</span><span>${b.pos ? 'in' : 'out'} · ${b.switches} switches</span></div>`).join('');
}
function tallyText(t) {
  const n = t.consistent + t.opposite;
  return `${t.consistent} matched · ${t.opposite} opposite · ${t.flat} flat · ${t.undecided} undecided` + (n ? ` · ${fmt((t.consistent / n) * 100, 0)}% on ${n} judged` : ' · nothing judged yet');
}
function renderTally() { $('tally').textContent = tallyText(session.state().tally); }

function measure() {
  const r = {}; for (const f of FAMILIES) r[f] = { s: 0, n: 0, total: 0 };
  let top = null;
  N.forEach((n, j) => { const x = r[n.family]; x.total++; x.s += act[j]; if (act[j] > 0.05) x.n++;
    if (n.family === 'MBON' && (top == null || act[j] > act[top])) top = j; });
  r.top = top != null && act[top] > 0.02 ? `${N[top].type} (${fmt(act[top] * 100, 0)}%, ${N[top].valence || 'no dopamine'})` : 'none';
  return r;
}

function draw() {
  if (!N.edges) return;
  const W = canvas.width, H = canvas.height;
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(5,7,13,0.35)'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const focus = selected != null ? selected : hovered;
  for (const [i, j, w] of N.edges) {
    if (hidden.has(N[i].family) || hidden.has(N[j].family)) continue;
    const a = act[i], base = (focus != null ? 0.008 : 0.025) + 0.05 * (w / N.wMax);
    ctx.strokeStyle = COLOR[N[i].family]; ctx.globalAlpha = Math.min(0.9, base + a * 0.45 * (0.3 + w / N.wMax));
    ctx.lineWidth = 0.4 + a * 1.2; ctx.beginPath(); ctx.moveTo(N[i].x, N[i].y); ctx.lineTo(N[j].x, N[j].y); ctx.stroke();
  }
  /* the focused neuron's real connections: inputs in cyan, outputs in gold, width by synapse count */
  if (focus != null) {
    const wMax = Math.max(1, ...N.in[focus].map(([, w]) => w), ...N.out[focus].map(([, w]) => w));
    for (const [list, color] of [[N.in[focus], '#67e8f9'], [N.out[focus], '#fde68a']]) {
      ctx.strokeStyle = color;
      for (const [k, w] of list) { if (hidden.has(N[k].family)) continue; ctx.globalAlpha = 0.25 + 0.6 * w / wMax; ctx.lineWidth = 0.6 + 2.4 * w / wMax;
        ctx.beginPath(); ctx.moveTo(N[focus].x, N[focus].y); ctx.lineTo(N[k].x, N[k].y); ctx.stroke(); }
    }
  }
  for (let j = 0; j < N.length; j++) {
    if (hidden.has(N[j].family)) continue;
    const n = N[j], a = act[j], r = (n.family === 'APL' ? 7 : n.family === 'MBON' ? 3.2 : 2.2) + a * 5 + (j === focus ? 5 : 0);
    const c = n.family === 'DAN' && n.dan === 'punishment' ? '#fb923c' : COLOR[n.family];
    ctx.globalAlpha = 0.35 + a * 0.65; ctx.fillStyle = c;
    if (a > 0.08) { ctx.shadowColor = c; ctx.shadowBlur = 14 * a; } else ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
  }
  /* the synapses the last learning step weakened, in white for 6 s */
  const now = Date.now(); flash = flash.filter((f) => f[2] > now);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
  for (const [i, j, until] of flash) { ctx.globalAlpha = Math.min(0.9, (until - now) / 3000); ctx.beginPath(); ctx.moveTo(N[i].x, N[i].y); ctx.lineTo(N[j].x, N[j].y); ctx.stroke(); }
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
  const m = measure(), t = fly.peak || { t: 0, word: 'quiet' }, names = { PN: 'PN', KC: 'Kenyon', MBON: 'MBON', DAN: 'Dopa.', APL: 'APL' };
  $('gauges').innerHTML = FAMILIES.map((f) => { const p = m[f].total ? m[f].s / m[f].total : 0;
    return `<div><span>${names[f]}</span><span class="bar"><i style="width:${Math.min(100, p * 100 * 3)}%;background:${COLOR[f]}"></i></span><span>${fmt(p * 100, 1)}%</span></div>`; }).join('');
  $('output').textContent = `Most active output: ${m.top}`;
  const pos = 50 + 50 * Math.max(-1, Math.min(1, t.t * 4));
  $('needle').style.left = pos + '%';
  $('verdict').textContent = { approach: 'Approach', avoid: 'Avoid', undecided: 'Undecided', quiet: 'Quiet' }[t.word];
}

/* ── THE MAP, INTERACTIVE: hover or tap a neuron to see what it is, its real connections, and what it has learned. ── */
const ROLE = {
  PN: 'Projection neuron: carries a smell from the antenna into the memory centre. Here it carries one kind of transaction.',
  KC: 'Kenyon cell: one of the cells that code which smell it is. Only about 10% fire at once, so each smell has its own small set.',
  MBON: 'Output neuron: its vote pushes the fly toward or away from the smell.',
  DAN: 'Dopamine neuron: the teacher. It weakens the Kenyon to output synapses that were active when it fired.',
  APL: 'APL: one giant inhibitory cell that keeps Kenyon activity sparse.',
};
let hovered = null, selected = null;
const hidden = new Set();
function nearest(e) {
  const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * canvas.width / r.width, y = (e.clientY - r.top) * canvas.height / r.height;
  let best = null, bd = 18 * 18;
  N.forEach((n, j) => { if (hidden.has(n.family)) return; const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = j; } });
  return best;
}
function describe(j) {
  if (j == null) { $('neuron').innerHTML = '<div class="state">Hover or tap a neuron on the map. Tap the legend to hide a family.</div>'; return; }
  const n = N[j], ins = N.in[j], outs = N.out[j], syn = (l) => l.reduce((s, [, w]) => s + w, 0), inputs = fly.inputs;
  const role = n.family === 'DAN' ? ROLE.DAN + (n.dan === 'reward' ? ' This one is a reward neuron (PAM): rises drive it.' : n.dan === 'punishment' ? ' This one is a punishment neuron (PPL1): falls drive it.' : ' Not used as a teacher here (neither PAM nor PPL1).')
    : n.family === 'MBON' ? ROLE.MBON + (n.valence ? ` Its compartment gets most of its dopamine from ${n.valence === 'avoid' ? 'reward' : 'punishment'} neurons, so here it sits on the ${n.valence} side.` : ' It receives no dopamine in this circuit.')
    : ROLE[n.family];
  let learned = '';
  if (n.family === 'KC') {
    const w = []; for (const [k] of outs) if (N[k].family === 'MBON') for (const e of inputs[k]) if (e[0] === j && e[2] != null && e[2] < 0.999) w.push(`${N[k].type} ${pct(e[2] - 1, 1)}`);
    learned = w.length ? `<div class="state">Learned so far (weaker synapses): ${w.slice(0, 6).join(' · ')}</div>` : '<div class="state">Nothing learned through this cell yet.</div>';
  }
  if (n.family === 'MBON') {
    let low = 0, tot = 0; for (const e of inputs[j]) if (e[2] != null) { tot++; if (e[2] < 0.999) low++; }
    learned = `<div class="state">${low} of its ${tot} Kenyon synapses have been weakened by learning.</div>`;
  }
  $('neuron').innerHTML = `<div class="nname" style="color:${COLOR[n.family]}">${n.family} · ${n.type || 'untyped'}</div>`
    + `<div class="state">Body id ${n.id} (hemibrain v1.2) · activity now ${fmt(act[j] * 100, 1)}%</div>`
    + `<div style="margin:6px 0">${role}</div>`
    + `<div class="state">Inputs: ${ins.length} neurons, ${syn(ins)} synapses (cyan) · Outputs: ${outs.length} neurons, ${syn(outs)} synapses (gold), counted at 5 synapses or more within this circuit.</div>`
    + learned;
}
function wireMap() {
  canvas.addEventListener('pointermove', (e) => { const j = nearest(e); if (j !== hovered) { hovered = j; if (selected == null) describe(j); } });
  canvas.addEventListener('pointerleave', () => { hovered = null; if (selected == null) describe(null); });
  canvas.addEventListener('click', (e) => { const j = nearest(e); selected = j === selected ? null : j; describe(selected != null ? selected : null); });
  document.querySelectorAll('.legend span[data-family]').forEach((s) => s.addEventListener('click', () => {
    const f = s.dataset.family; if (hidden.has(f)) hidden.delete(f); else hidden.add(f);
    document.querySelectorAll(`.legend span[data-family="${f}"]`).forEach((x) => x.classList.toggle('off', hidden.has(f)));
  }));
  describe(null);
}

/* ── TRAINING THAT LASTS IN THIS BROWSER: per stock, so this fly keeps training from visit to visit. Per viewer only; a private window
 * or cleared site data starts a naive fly, and the page says so. The shared fly (server) is the one that trains when nobody watches. ── */
const memKey = (s) => 'fly-brain-memory-v1-' + s;
function saveMemory() {
  try { localStorage.setItem(memKey(current.symbol), JSON.stringify({ m: fly.exportMemory(), ...session.state(), at: Date.now() })); }
  catch (_) { /* storage refused: the fly still learns, it just forgets on reload */ }
}
function loadMemory() {
  let x = null; try { x = JSON.parse(localStorage.getItem(memKey(current.symbol)) || 'null'); } catch (_) { x = null; }
  fly.importMemory(x && x.m); session.restore(x);
  log(x ? `memory restored for ${current.symbol}: trained since ${new Date(x.at).toLocaleString('en-GB')}, ${session.settled} windows` : `a naive fly for ${current.symbol} (no memory kept in this browser yet)`);
  renderTally(); renderBook();
}
function forget() {
  try { localStorage.removeItem(memKey(current.symbol)); } catch (_) { /* nothing kept */ }
  loadMemory(); log('memory erased: the fly is naive again');
}

/* ── THE SHARED FLY: the server runs the same fly-core on one stock, every minute, whether anyone watches or not. Its memory starts again
 * when the server restarts (a deploy), and the panel says since when it has been training. ── */
async function readShared() {
  try {
    const s = await fetch('/api/fly/state', { cache: 'no-store' }).then((x) => x.json());
    if (!s || !s.ok) { $('shared').innerHTML = `<div class="state">The shared fly is not running: ${(s && s.why) || 'no answer'}.</div>`; return; }
    const since = new Date(s.aliveSince).toLocaleString('en-GB');
    $('shared').innerHTML = `<div class="state">${s.symbol} · training since ${since} · ${s.windows} windows (${s.windowsRead} read, ${s.windowsMissed} not read) · ${s.weakened} synapses weakened so far</div>`
      + `<div class="state" style="margin-top:4px">${tallyText(s.session.tally)}</div><div id="sharedBook" class="book"></div>`
      + `<div class="log" style="margin-top:6px;max-height:180px">${s.events.slice(-12).reverse().map((e) => `<p class="${e.type === 'verdict' ? 'verdict' : 'live'}">${clock(e.at)} · ${eventText(e, s.symbol)}</p>`).join('')}</div>`;
    renderBook(s.session, $('sharedBook'));
  } catch (_) { $('shared').innerHTML = '<div class="state">The shared fly could not be read this time.</div>'; }
}
function eventText(e, symbol) {
  if (e.type === 'tx') return `${e.kind}: ${fmt(e.units, 4)} ${symbol} ($${fmt(e.usd, 0)}) · tx ${String(e.tx).slice(0, 10)}…`;
  if (e.type === 'predict') return `smells ${mixText(e.mix)} → ${SAY[e.word]}`;
  if (e.type === 'taught') return `taught: followed by ${pct(e.move, 3)}, ${e.weakened} synapses weakened`;
  if (e.type === 'verdict') return `predicted ${e.prediction}, moved ${pct(e.move, 3)} → ${e.kind}`;
  if (e.type === 'skipped') return `${e.n} past transactions skipped at start`;
  return e.type;
}

/* ── BEATS: the computed activity, played. A neuron "fires" on a step when a hash of (step, neuron) falls under its activity: no
 * Math.random, so the same moves give the same rhythm, like the block brain. Off until asked: browsers refuse sound without a click. ── */
const PENTA = [0, 2, 4, 7, 9];
let audio = null, master = null;
const fires = (j, t) => ((Math.imul(t + 1, 2654435761) ^ Math.imul(j + 7, 40503)) >>> 0) / 4294967296;
function voice({ freq, type = 'sine', dur = 0.12, vol = 0.08, noise = false, at = 0 }) {
  const t0 = audio.currentTime + at, g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(master);
  if (noise) {
    const b = audio.createBuffer(1, Math.ceil(audio.sampleRate * dur), audio.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = fires(i, fly.ticks) * 2 - 1;
    const s = audio.createBufferSource(), f = audio.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    s.buffer = b; s.connect(f); f.connect(g); s.start(t0); return;
  }
  const o = audio.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0); o.connect(g); o.start(t0); o.stop(t0 + dur + 0.02);
}
function beat() {
  if (!audio) return;
  const t = fly.ticks; let n = 0; const cap = 7, slot = 0.12 / cap;
  fly.kcIdx.forEach((j, k) => { if (act[j] > 0 && fires(j, t) < act[j] * 0.5 && n < cap) voice({ freq: 220 * 2 ** ((PENTA[k % 5] + 12 * ((k / 5 | 0) % 3)) / 12), type: 'triangle', dur: 0.18, vol: 0.05, at: slot * n++ }); });
  for (const j of fly.mbonIdx) if (N[j].valence && fires(j, t) < act[j] * 0.6 && n < cap) voice({ freq: N[j].valence === 'approach' ? 660 : 110, type: 'sine', dur: 0.3, vol: 0.06, at: slot * n++ });
  let rew = 0, pun = 0, pn = 0;
  N.forEach((x, j) => { if (x.dan === 'reward') rew = Math.max(rew, act[j]); if (x.dan === 'punishment') pun = Math.max(pun, act[j]); if (x.family === 'PN') pn += act[j]; });
  if (rew > 0.05 && t % 2 === 0) voice({ freq: 1320, type: 'sine', dur: 0.5, vol: 0.05 * rew });
  if (pun > 0.05 && t % 2 === 0) voice({ freq: 55, type: 'square', dur: 0.25, vol: 0.09 * pun });
  if (pn > 1 && t % 2 === 1) voice({ noise: true, dur: 0.04, vol: 0.03 });
}
function listen() {
  if (audio) { audio.close(); audio = null; $('listen').textContent = 'Listen to the brain'; return; }
  audio = new (window.AudioContext || window.webkitAudioContext)();
  master = audio.createGain(); master.gain.value = 0.7; master.connect(audio.destination);
  $('listen').textContent = 'Mute';
}

/* The brain steps on a timer, the drawing on animation frames: a background tab gets no frames, and its fly must keep living. */
function tick() { fly.tick(); act = fly.act; beat(); if (fly.ticks % 4 === 0) gauges(); }
function loop() { draw(); requestAnimationFrame(loop); }

/* One window, every 30 s: price + new transactions, handed to the shared protocol. */
async function readWindow() {
  const stock = current;
  const [r, ac] = await Promise.all([
    fetch('/api/fly/price/' + stock.address, { cache: 'no-store' }).then((x) => x.json()).catch(() => null),
    fetch('/api/activite/' + stock.address, { cache: 'no-store' }).then((x) => x.json()).catch(() => null),
  ]);
  if (stock !== current) return;
  const price = r && r.ok && typeof r.priceUsd === 'number' ? r : null;
  if (!price) {
    const last = history.length ? ` · showing the last price read at ${clock(history[history.length - 1].t)}` : '';
    $('state').textContent = 'live price not read this time (' + ((r && r.why) || 'empty response') + ')' + last + ' · next try in 30 s';
  } else {
    $('price').textContent = '$' + fmt(price.priceUsd);
    $('state').textContent = `live on-chain price · Aerodrome pool · block ${price.block.toLocaleString('en-US')} · ${clock(Date.parse(price.readAt))}`;
    history.push({ t: Date.now(), p: price.priceUsd }); while (history.length && Date.now() - history[0].t > 3600000) history.shift();
    drawSpark();
    if (lastPrice == null) log(`${stock.symbol} live at $${fmt(price.priceUsd)} (on-chain pool, block ${price.block.toLocaleString('en-US')})`);
    lastPrice = price.priceUsd;
  }
  if (ac && !ac.ok && ac.pourquoi) log('trades not read this time: ' + ac.pourquoi);
  session.window({ symbol: stock.symbol, price, transactions: ac && ac.ok && Array.isArray(ac.transactions) ? ac.transactions : null });
  renderBook(); renderTally(); saveMemory();
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
  session.reset(); loadMemory();
  $('price').textContent = '—'; $('state').textContent = 'reading…'; $('ref').textContent = '';
  clearInterval(timer); clearInterval(refTimer);
  readWindow().then(readReference); timer = setInterval(readWindow, POLL_MS); refTimer = setInterval(readReference, REF_MS);
}

async function start() {
  $('pick').innerHTML = STOCKS.map((a, i) => `<option value="${i}">${a.symbol}</option>`).join('');
  $('pick').addEventListener('change', (e) => select(Number(e.target.value)));
  const slider = $('size'), showSize = () => { const v = Number(slider.value) / 1000; $('sizeValue').textContent = pct(v, 1); };
  slider.addEventListener('input', showSize); showSize();
  $('listen').addEventListener('click', listen);
  $('forget').addEventListener('click', forget);
  const circuit = await fetch('fly-brain-circuit.json').then((r) => r.json());
  fly = createFly(circuit); N = fly.N; act = fly.act;
  session = createSession(fly, onEvent);
  const idx = new Map(N.map((n, i) => [n.id, i]));
  N.edges = circuit.edges.map(([a, b, w]) => [idx.get(a), idx.get(b), w]);
  /* drawn edges: the 1,800 strongest, so the canvas stays readable */
  N.edges = N.edges.sort((x, y) => y[2] - x[2]).slice(0, 1800); N.wMax = N.edges[0][2];
  place(N);
  /* simulation: a $5,000 "received" odor followed by the chosen move — taught, then asked again */
  $('inject').addEventListener('click', () => { const v = Number(slider.value) / 1000; if (!v) return;
    const mix = { received: 5000, sent: 0, moved: 0 };
    log(`SIMULATION · ${mixText(mix)} followed by ${pct(v, 1)}`, 'sim'); session.learn(mix, v, true); session.predict(mix, true); });
  log(`circuit loaded: ${N.length} neurons, ${circuit.edges.length} connections ≥ ${circuit.synapseThreshold} synapses; `
    + `${N.counts.approach} approach-side and ${N.counts.avoid} avoid-side MBONs, from measured dopamine inputs`);
  wireMap();
  setInterval(tick, 120);
  requestAnimationFrame(loop);
  select(0);
  readShared(); setInterval(readShared, SHARED_MS);
}
start().catch((e) => log('error: ' + (e && e.message || e)));
