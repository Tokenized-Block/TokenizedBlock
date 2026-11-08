/* human-brain.js — a wired human brain, region by region, facing emotion categories (Phil 2026-11-08: "draw the connections like on the
 * hemibrain page"). Everything measured comes from human-brain-data.js (HCP structural / functional connectivity via the ENIGMA Toolbox,
 * emotion regions from open meta-analyses or single studies, each cited there); the layout, the impulse rule, speeds and colours are OURS
 * and the page says so. It shows what was measured in people; it does not feel anything. */
import { REGIONS, WIRING, FUNCTION, DEEP_LINKS, POS3D, PACKS, SOURCES } from './human-brain-data.js';
import { ANATOMY_NAMES, CENTROIDS, CORTEX, DEEP } from './human-brain-anatomy.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const fmt = (x, d = 2) => Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KIND_COLOR = { cortex: '#7dd3fc', subcortex: '#f472b6', deep: '#fbbf24' };

/* ── the network shown: measured wiring (structure) or regions active together at rest (function) ── */
let network = 'wiring', edges = [], wMax = 1, adj = [];
function useNetwork(kind) {
  network = kind;
  edges = (kind === 'function' ? FUNCTION : WIRING).filter(([, , w]) => w > 0);
  wMax = edges.reduce((m, [, , w]) => Math.max(m, w), 0) || 1;
  adj = REGIONS.map(() => []);
  for (const [i, j, w] of edges) { adj[i].push([j, w]); adj[j].push([i, w]); }
  for (const [i, j] of DEEP_LINKS) { adj[i].push([j, null]); adj[j].push([i, null]); }
  $('netCount').textContent = `${edges.length.toLocaleString('en-US')} ${kind === 'function' ? 'functional' : 'measured'} connections` + (DEEP_LINKS.length ? ` + ${DEEP_LINKS.length} known deep pathways (no measured strength)` : '');
}

/* ── 3-D camera (same gestures as the hemibrain page): drag to turn, wheel / two fingers to zoom, shift-drag to move ── */
/* a side view, slightly from above: the shape a reader recognises as a brain */
const cam = { yaw: 1.25, pitch: 0.22, zoom: 1, panX: 0, panY: 0, moving: 0 };
const HOME = { yaw: 1.25, pitch: 0.22, zoom: 1, panX: 0, panY: 0 };
/* REAL positions (Phil 08/11: "build a real human brain model"): each region at the centroid of its vertices on the fsaverage5 surface,
 * in mm (human-brain-anatomy.js); a node the surface lacks (deep nuclei added from the literature) keeps the data module's POS3D. */
const anatIndex = new Map(ANATOMY_NAMES.map((n, i) => [n, i]));
const P = REGIONS.map((r, i) => (anatIndex.has(r.id) ? [...CENTROIDS[anatIndex.get(r.id)]] : [...(POS3D[i] || [0, 0, 0])]));
const SIL = []; for (let k = 0; k < CORTEX.length; k += 3) SIL.push([CORTEX[k], CORTEX[k + 1], CORTEX[k + 2]]);
const DEEPP = []; for (let k = 0; k < DEEP.length; k += 4) DEEPP.push([DEEP[k], DEEP[k + 1], DEEP[k + 2], DEEP[k + 3]]);
(function normalise() { /* one centre and one scale for everything, taken on the cortex (mm -> canvas units) */
  const ref = SIL.length ? SIL : P, c = [0, 1, 2].map((k) => ref.reduce((s, p) => s + p[k], 0) / ref.length);
  const r = Math.max(...ref.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]))) || 1;
  for (const L of [P, SIL, DEEPP]) for (const p of L) for (let k = 0; k < 3; k++) p[k] = (p[k] - c[k]) / r * 360;
})();
/* MNI axes: x left-right, y back-front, z down-up -> the camera turns around the vertical z */
for (const L of [P, SIL, DEEPP]) for (const p of L) { const y = p[1], z = p[2]; p[1] = z; p[2] = -y; }
const scr = REGIONS.map(() => ({ x: 0, y: 0, f: 1 }));
const silScr = new Float32Array(SIL.length * 2), deepScr = new Float32Array(DEEPP.length * 2);
function projectPoint(x, y, z, W, H, cy, sy, cp, sp, D) { const x1 = x * cy - z * sy, z1 = x * sy + z * cy, y2 = -y * cp - z1 * sp, z2 = -y * sp + z1 * cp, f = D / Math.max(200, D + z2) * cam.zoom; return [W / 2 + x1 * f + cam.panX, H / 2 + y2 * f + cam.panY, f]; }
function project() {
  const W = canvas.width, H = canvas.height, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), D = 1500;
  P.forEach(([x, y, z], i) => {
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy, y2 = -y * cp - z1 * sp, z2 = -y * sp + z1 * cp, f = D / Math.max(200, D + z2) * cam.zoom;
    scr[i].x = W / 2 + x1 * f + cam.panX; scr[i].y = H / 2 + y2 * f + cam.panY; scr[i].f = f;
  });
  SIL.forEach(([x, y, z], k) => { const q = projectPoint(x, y, z, W, H, cy, sy, cp, sp, D); silScr[2 * k] = q[0]; silScr[2 * k + 1] = q[1]; });
  DEEPP.forEach(([x, y, z], k) => { const q = projectPoint(x, y, z, W, H, cy, sy, cp, sp, D); deepScr[2 * k] = q[0]; deepScr[2 * k + 1] = q[1]; });
}
function zoomBy(k) { cam.zoom = Math.min(8, Math.max(0.35, cam.zoom * k)); cam.moving = Date.now(); }
function pos(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; }
function nearest(p) { let best = null, bd = 22 * 22; scr.forEach((s, i) => { const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2; if (d < bd) { bd = d; best = i; } }); return best; }

/* ── emotion: its regions fire; impulses travel along the shown connections, more often along stronger ones (OUR rule) ── */
let pack = PACKS[0], emotion = pack ? pack.emotions[0] : null, compare = null;
const regionIndex = new Map(REGIONS.map((r, i) => [r.id, i]));
const idxOf = (ids) => (ids || []).map((id) => regionIndex.get(id)).filter((i) => i !== undefined);
let pulses = [], glow = new Float64Array(REGIONS.length), hovered = null, selected = null, lastSeed = 0;
function seed(now) {
  if (!emotion) return;
  for (const i of idxOf(emotion.regions)) {
    glow[i] = 1;
    for (const [j, w] of adj[i]) {
      const u = w == null ? 0.35 : w / wMax;              /* a deep pathway has no measured strength: a fixed, stated chance */
      if (((i * 7919 + j * 104729 + Math.floor(now / 1000)) % 997) / 997 < 0.08 + 0.7 * u * u) pulses.push({ i, j, t0: now, dur: 900 + 700 * (1 - u), deep: w == null });
    }
  }
}
function step(now) {
  if (now - lastSeed > 1500) { seed(now); lastSeed = now; }
  pulses = pulses.filter((p) => { if (now - p.t0 >= p.dur) { glow[p.j] = Math.max(glow[p.j], 0.6); return false; } return true; });
  for (let i = 0; i < glow.length; i++) glow[i] *= 0.985;
}

/* ── drawing: edges batched by strength, deep pathways dashed, impulses as travelling dots, regions sized by glow ── */
function draw(now) {
  const W = canvas.width, H = canvas.height;
  project();
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, W, H);
  /* the glass brain: the real cortex surface as faint dots, the deep structures (amygdala, hippocampus, thalamus...) a little brighter */
  ctx.globalAlpha = 0.34; ctx.fillStyle = '#a5b4c8'; ctx.beginPath(); for (let k = 0; k < silScr.length; k += 2) ctx.rect(silScr[k] - 1, silScr[k + 1] - 1, 2.2, 2.2); ctx.fill();
  ctx.globalAlpha = 0.45; ctx.fillStyle = KIND_COLOR.subcortex; ctx.beginPath(); for (let k = 0; k < deepScr.length; k += 2) ctx.rect(deepScr[k] - 1, deepScr[k + 1] - 1, 2.2, 2.2); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  const focus = selected != null ? selected : hovered, buckets = [[], [], [], []];
  for (const [i, j, w] of edges) { const q = Math.min(3, Math.floor((w / wMax) * 4)); buckets[q].push(i, j); }
  buckets.forEach((l, q) => {
    ctx.strokeStyle = network === 'function' ? '#a78bfa' : '#38bdf8'; ctx.globalAlpha = (focus != null ? 0.02 : 0.03) + q * q * 0.05; ctx.lineWidth = 0.5 + q * 0.6;
    ctx.beginPath(); for (let k = 0; k < l.length; k += 2) { ctx.moveTo(scr[l[k]].x, scr[l[k]].y); ctx.lineTo(scr[l[k + 1]].x, scr[l[k + 1]].y); } ctx.stroke();
  });
  ctx.setLineDash([6, 5]); ctx.strokeStyle = KIND_COLOR.deep; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2; ctx.beginPath();
  for (const [i, j] of DEEP_LINKS) { ctx.moveTo(scr[i].x, scr[i].y); ctx.lineTo(scr[j].x, scr[j].y); } ctx.stroke(); ctx.setLineDash([]);
  if (focus != null) { ctx.strokeStyle = '#fde68a'; for (const [j, w] of adj[focus]) { ctx.globalAlpha = w == null ? 0.6 : 0.25 + 0.7 * w / wMax; ctx.lineWidth = w == null ? 1.5 : 0.8 + 3 * w / wMax;
    ctx.beginPath(); ctx.moveTo(scr[focus].x, scr[focus].y); ctx.lineTo(scr[j].x, scr[j].y); ctx.stroke(); } }
  ctx.globalAlpha = 0.95;
  for (const p of pulses) { const f = Math.min(1, (now - p.t0) / p.dur), a = scr[p.i], b = scr[p.j];
    ctx.fillStyle = p.deep ? KIND_COLOR.deep : '#ffffff'; ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 2.2, 0, Math.PI * 2); ctx.fill(); }
  const emo = new Set(idxOf(emotion && emotion.regions)), other = new Set(idxOf(compare && compare.regions));
  REGIONS.forEach((r, i) => {
    const s = scr[i], g = glow[i], base = (r.kind === 'cortex' ? 4 : 5.5) * Math.sqrt(s.f);
    const c = emo.has(i) && other.has(i) ? '#ffffff' : emo.has(i) ? '#fb7185' : other.has(i) ? '#34d399' : KIND_COLOR[r.kind] || '#94a3b8';
    ctx.fillStyle = c; ctx.globalAlpha = 0.18 * g; ctx.beginPath(); ctx.arc(s.x, s.y, base * 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.45 + 0.55 * Math.max(g, emo.has(i) || other.has(i) ? 0.6 : 0); ctx.beginPath(); ctx.arc(s.x, s.y, base + (i === focus ? 4 : 0), 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9; ctx.fillStyle = '#e2e8f0'; ctx.font = '20px system-ui'; ctx.textAlign = 'center';
  for (const i of new Set([...emo, ...other, ...(focus != null ? [focus] : [])])) ctx.fillText(REGIONS[i].name, scr[i].x, scr[i].y - 12);
  ctx.globalAlpha = 1;
}

/* ── panels: the selected emotion in detail (one at a time), the region under the finger and its connections ── */
function renderEmotion() {
  const el = $('emotionInfo');
  if (!emotion) { el.textContent = 'No emotion data.'; return; }
  const own = idxOf(emotion.regions), shared = new Set(idxOf(emotion.shared)), s = emotion.source || {};
  el.innerHTML = `<h3>${esc(emotion.name)} <span class="muted">· ${esc(pack.name)}</span></h3>`
    + `<div class="muted">${own.length} region${own.length === 1 ? '' : 's'} reported · ${shared.size} shared with other emotions of this pack</div>`
    + `<ul class="regions">${own.map((i) => `<li><button data-region="${i}"><b>${esc(REGIONS[i].name)}</b>${shared.has(i) ? ' <span class="tag">shared</span>' : ''} — ${esc(REGIONS[i].plain || '')}</button></li>`).join('')}</ul>`
    + `<div class="src"><b>Source</b>: ${esc(s.cite || '?')}${s.year ? ', ' + esc(s.year) : ''}${s.n ? ' · n = ' + esc(s.n) : ''} · ${esc(s.design || '?')}${s.doi ? ` · <a href="https://doi.org/${esc(s.doi)}" target="_blank" rel="noopener">doi</a>` : ''}</div>`
    + `<div class="muted"><b>Measured</b>: ${esc(emotion.measured || '')}</div><div class="muted"><b>Our choice</b>: ${esc(emotion.ours || '')}</div>`;
  el.querySelectorAll('button[data-region]').forEach((b) => b.addEventListener('click', () => walkTo(Number(b.dataset.region))));
  if (compare) {
    const a = new Set(idxOf(emotion.regions)), both = idxOf(compare.regions).filter((i) => a.has(i));
    $('compareInfo').textContent = `${emotion.name} and ${compare.name} share ${both.length} region${both.length === 1 ? '' : 's'}${both.length ? ': ' + both.map((i) => REGIONS[i].name).join(', ') : ''}. White = both, pink = ${emotion.name} only, green = ${compare.name} only.`;
  } else $('compareInfo').textContent = '';
}
const back = [];
function walkTo(i) { if (selected != null && selected !== i) back.push(selected); selected = i; renderRegion(i); }
function renderRegion(i) {
  const el = $('regionInfo');
  if (i == null) { el.innerHTML = '<div class="muted">Hover or tap a region, then walk through its connections.</div>'; return; }
  const r = REGIONS[i], list = [...adj[i]].sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1));
  const inEmo = PACKS.flatMap((p) => p.emotions.filter((e) => (e.regions || []).includes(r.id)).map((e) => e.name));
  el.innerHTML = `<h3 style="color:${KIND_COLOR[r.kind] || '#fff'}">${esc(r.name)}</h3><div class="muted">${esc(r.plain || '')}</div>`
    + `<div class="muted">${list.length} connection${list.length === 1 ? '' : 's'} in the ${network === 'function' ? 'functional' : 'measured'} network${inEmo.length ? ' · reported in: ' + esc(inEmo.join(', ')) : ''}</div>`
    + `<div class="walk">${list.slice(0, 12).map(([j, w]) => `<button data-walk="${j}">${esc(REGIONS[j].name)} · ${w == null ? 'known pathway' : fmt(w, 2)}</button>`).join('')}</div>`
    + (back.length ? '<button id="walkBack" class="small">← back</button>' : '');
  el.querySelectorAll('button[data-walk]').forEach((b) => b.addEventListener('click', () => walkTo(Number(b.dataset.walk))));
  const bk = $('walkBack'); if (bk) bk.addEventListener('click', () => { selected = back.pop(); renderRegion(selected); });
}

/* ── controls ── */
function fillEmotions() {
  $('emotion').innerHTML = pack.emotions.map((e, k) => `<option value="${k}">${esc(e.name)}</option>`).join('');
  $('compare').innerHTML = '<option value="">— none —</option>' + pack.emotions.map((e, k) => `<option value="${k}">${esc(e.name)}</option>`).join('');
}
function wire() {
  $('pack').innerHTML = PACKS.map((p, k) => `<option value="${k}">${esc(p.name)}</option>`).join('');
  $('pack').addEventListener('change', (e) => { pack = PACKS[Number(e.target.value)]; fillEmotions(); emotion = pack.emotions[0]; compare = null; glow.fill(0); pulses = []; renderEmotion(); });
  $('emotion').addEventListener('change', (e) => { emotion = pack.emotions[Number(e.target.value)]; glow.fill(0); pulses = []; renderEmotion(); });
  $('compare').addEventListener('change', (e) => { compare = e.target.value === '' ? null : pack.emotions[Number(e.target.value)]; renderEmotion(); });
  $('net').addEventListener('change', (e) => { useNetwork(e.target.value); pulses = []; renderRegion(selected); });
  $('zoomIn').addEventListener('click', () => zoomBy(1.25)); $('zoomOut').addEventListener('click', () => zoomBy(0.8));
  $('viewReset').addEventListener('click', () => Object.assign(cam, HOME));
  const ptrs = new Map(); let dragged = 0, lastPinch = null;
  canvas.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, pos(e)); dragged = 0; lastPinch = null; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (!ptrs.has(e.pointerId)) { const j = nearest(p); if (j !== hovered) { hovered = j; if (selected == null) renderRegion(j); } return; }
    const q = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (lastPinch) zoomBy(d / lastPinch); lastPinch = d; dragged += 10; return; }
    const dx = p.x - q.x, dy = p.y - q.y; dragged += Math.abs(dx) + Math.abs(dy);
    if (e.shiftKey) { cam.panX += dx; cam.panY += dy; } else { cam.yaw += dx * 0.006; cam.pitch = Math.max(-1.3, Math.min(1.3, cam.pitch + dy * 0.006)); }
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) lastPinch = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('click', (e) => { if (dragged > 6) { dragged = 0; return; } const j = nearest(pos(e)); if (j == null) { selected = null; back.length = 0; renderRegion(null); } else walkTo(j); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  $('sources').innerHTML = SOURCES.map((s) => `<li>${esc(s.cite)}${s.doi ? ` · <a href="https://doi.org/${esc(s.doi)}" target="_blank" rel="noopener">doi</a>` : ''} · ${esc(s.licence || '')} — ${esc(s.what || '')}</li>`).join('');
}
function loop(now) { step(now); draw(now); requestAnimationFrame(loop); }

useNetwork('wiring'); wire(); fillEmotions(); renderEmotion(); renderRegion(null); requestAnimationFrame(loop);
