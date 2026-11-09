/* human-brain.js — a wired human brain as a map to visit (Phil 2026-11-08: "draw the connections like on the hemibrain page"; 2026-11-09: "the
 * different parts of the brain to visit with the emotions, like an interactive map, readable by people who do not know; we do not see the
 * connections live"). Everything measured comes from human-brain-data.js (HCP structural / functional connectivity via the ENIGMA Toolbox,
 * emotion regions from open meta-analyses or single studies, each cited there); the parts and their plain sentences (human-brain-parts.js),
 * the layout, the curves, the impulse rule, speeds and colours are OURS and the page says so. It shows what was measured; it feels nothing. */
import { REGIONS, WIRING, FUNCTION, DEEP_LINKS, POS3D, PACKS, SOURCES } from './human-brain-data.js';
import { ANATOMY_NAMES, CENTROIDS, CORTEX, DEEP } from './human-brain-anatomy.js';
import { PARTS, partOf, shortName, partLinks, talksWith, partsOfEmotion } from './human-brain-parts.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PART_INDEX = new Map(PARTS.map((p, k) => [p.id, k]));
const regionPart = REGIONS.map((r) => PART_INDEX.get(partOf(r.id)));
const colorOf = (i) => PARTS[regionPart[i]].color;

/* ── the network shown: measured wiring (structure) or regions active together at rest (function) ── */
let network = 'wiring', edges = [], wMax = 1, adj = [], links = [];
function useNetwork(kind) {
  network = kind;
  edges = (kind === 'function' ? FUNCTION : WIRING).filter(([, , w]) => w > 0);
  wMax = edges.reduce((m, [, , w]) => Math.max(m, w), 0) || 1;
  adj = REGIONS.map(() => []);
  for (const [i, j, w] of edges) { adj[i].push([j, w]); adj[j].push([i, w]); }
  for (const [i, j] of DEEP_LINKS) { adj[i].push([j, null]); adj[j].push([i, null]); }
  links = partLinks(REGIONS, edges);
  $('netCount').textContent = `${edges.length.toLocaleString('en-US')} ${kind === 'function' ? 'functional' : 'measured'} connections + ${DEEP_LINKS.length} known deep pathways`;
}

/* ── 3-D camera: drag to turn, wheel / two fingers to zoom, shift-drag to move; "visit" turns the brain smoothly toward a part ── */
const cam = { yaw: 1.25, pitch: 0.22, zoom: 1.45, panX: 0, panY: 0 }, HOME = { yaw: 1.25, pitch: 0.22, zoom: 1.45, panX: 0, panY: 0 };
let camTarget = null;
/* REAL positions: each region at the centroid of its vertices on the fsaverage5 surface (mm); deep nuclei the surface lacks keep POS3D */
const anatIndex = new Map(ANATOMY_NAMES.map((n, i) => [n, i]));
const P = REGIONS.map((r, i) => (anatIndex.has(r.id) ? [...CENTROIDS[anatIndex.get(r.id)]] : [...(POS3D[i] || [0, 0, 0])]));
const SIL = []; for (let k = 0; k < CORTEX.length; k += 3) SIL.push([CORTEX[k], CORTEX[k + 1], CORTEX[k + 2]]);
const DEEPP = []; for (let k = 0; k < DEEP.length; k += 8) DEEPP.push([DEEP[k], DEEP[k + 1], DEEP[k + 2], DEEP[k + 3]]); /* every 2nd deep point */
(function normalise() {
  const ref = SIL, c = [0, 1, 2].map((k) => ref.reduce((s, p) => s + p[k], 0) / ref.length);
  const r = Math.max(...ref.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]))) || 1;
  for (const L of [P, SIL, DEEPP]) for (const p of L) for (let k = 0; k < 3; k++) p[k] = (p[k] - c[k]) / r * 360;
})();
/* MNI axes: x left-right, y back-front, z down-up -> the camera turns around the vertical */
for (const L of [P, SIL, DEEPP]) for (const p of L) { const y = p[1], z = p[2]; p[1] = z; p[2] = -y; }
/* each cortex surface point takes the part of the NEAREST cortex region centre (our approximation: the atlas labels per vertex are not
 *  shipped); each deep point carries its structure's index in the data (exact) */
const NCORTEX = REGIONS.filter((r) => r.kind === 'cortex').length;
const silPart = SIL.map(([x, y, z]) => { let b = 0, bd = Infinity; for (let i = 0; i < NCORTEX; i++) { const d = (P[i][0] - x) ** 2 + (P[i][1] - y) ** 2 + (P[i][2] - z) ** 2; if (d < bd) { bd = d; b = i; } } return regionPart[b]; });
const deepPart = DEEPP.map((p) => (Number.isInteger(p[3]) && REGIONS[p[3]] ? regionPart[p[3]] : PART_INDEX.get('thalamus')));
const byPart = (parts) => PARTS.map((_, k) => parts.reduce((a, q, n) => (q === k ? (a.push(n), a) : a), []));
const silOf = byPart(silPart), deepOf = byPart(deepPart);
const partCentre = PARTS.map((p) => { const m = REGIONS.map((_, i) => i).filter((i) => regionPart[i] === PART_INDEX.get(p.id)); return [0, 1, 2].map((k) => m.reduce((s, i) => s + P[i][k], 0) / m.length); });

const scr = REGIONS.map(() => ({ x: 0, y: 0, f: 1 }));
const silScr = new Float32Array(SIL.length * 2), deepScr = new Float32Array(DEEPP.length * 2);
let centreScr = { x: 0, y: 0 };
function project() {
  const W = canvas.width, H = canvas.height, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), D = 1500;
  const pr = (x, y, z) => { const x1 = x * cy - z * sy, z1 = x * sy + z * cy, y2 = -y * cp - z1 * sp, z2 = -y * sp + z1 * cp, f = D / Math.max(200, D + z2) * cam.zoom; return [W / 2 + x1 * f + cam.panX, H / 2 + y2 * f + cam.panY, f]; };
  P.forEach(([x, y, z], i) => { const q = pr(x, y, z); scr[i].x = q[0]; scr[i].y = q[1]; scr[i].f = q[2]; });
  SIL.forEach(([x, y, z], k) => { const q = pr(x, y, z); silScr[2 * k] = q[0]; silScr[2 * k + 1] = q[1]; });
  DEEPP.forEach(([x, y, z], k) => { const q = pr(x, y, z); deepScr[2 * k] = q[0]; deepScr[2 * k + 1] = q[1]; });
  const c = pr(0, 0, 0); centreScr = { x: c[0], y: c[1] };
}
function zoomBy(k) { camTarget = null; cam.zoom = Math.min(8, Math.max(0.35, cam.zoom * k)); }
function pos(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; }
function nearest(p) { let best = null, bd = 26 * 26; scr.forEach((s, i) => { const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2; if (d < bd) { bd = d; best = i; } }); return best; }
/** turn so the part faces the reader (its centre comes nearest); a part on the midline is shown from the side */
function visit(pk) {
  const [x, , z] = partCentre[pk], deep = PARTS[pk].members.every((m) => !/^[a-z]/.test(m));
  camTarget = { yaw: Math.abs(x) < 15 ? HOME.yaw : Math.atan2(-x, -z), pitch: 0.18, zoom: 1.55, panX: 0, panY: 0 };
}
function easeCamera() {
  if (!camTarget) return;
  let dy = camTarget.yaw - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  cam.yaw += dy * 0.08; for (const k of ['pitch', 'zoom', 'panX', 'panY']) cam[k] += (camTarget[k] - cam[k]) * 0.08;
  if (Math.abs(dy) < 1e-3 && Math.abs(camTarget.zoom - cam.zoom) < 1e-3) camTarget = null;
}

/* ── what is lit: an emotion's regions, or the part being visited; impulses travel along the shown connections (OUR rule) ── */
let pack = PACKS[0], emotion = pack ? pack.emotions[0] : null, compare = null, visited = null, showAll = false;
const regionIndex = new Map(REGIONS.map((r, i) => [r.id, i]));
const idxOf = (ids) => (ids || []).map((id) => regionIndex.get(id)).filter((i) => i !== undefined);
let pulses = [], glow = new Float64Array(REGIONS.length), hovered = null, selected = null, lastSeed = 0;
const sources = () => (visited != null ? REGIONS.map((_, i) => i).filter((i) => regionPart[i] === visited) : idxOf(emotion && emotion.regions));
function seed(now) {
  for (const i of sources()) {
    glow[i] = 1;
    for (const [j, w] of adj[i]) {
      const u = w == null ? 0.35 : w / wMax;              /* a deep pathway has no measured strength: a fixed, stated chance */
      if (((i * 7919 + j * 104729 + Math.floor(now / 1000)) % 997) / 997 < 0.1 + 0.7 * u * u) pulses.push({ i, j, t0: now, dur: 1100 + 900 * (1 - u), deep: w == null });
    }
  }
  if (pulses.length > 600) pulses.splice(0, pulses.length - 600);
}
function step(now) {
  if (now - lastSeed > 1400) { seed(now); lastSeed = now; }
  pulses = pulses.filter((p) => { if (now - p.t0 >= p.dur) { glow[p.j] = Math.max(glow[p.j], 0.7); return false; } return true; });
  for (let i = 0; i < glow.length; i++) glow[i] *= 0.982;
}

/* ── drawing: the surface as soft dots coloured by part, connections as curves bowing outward, impulses as comets ── */
function ctrl(a, b) { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; return { x: mx + (mx - centreScr.x) * 0.28, y: my + (my - centreScr.y) * 0.28 }; }
function curve(a, b) { const c = ctrl(a, b); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.x, c.y, b.x, b.y); }
function along(a, b, t) { const c = ctrl(a, b), u = 1 - t; return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }; }
function dots(scrArr, list, r) { ctx.beginPath(); for (const k of list) { const x = scrArr[2 * k], y = scrArr[2 * k + 1]; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832); } ctx.fill(); }
let emoParts = new Set();
function draw(now) {
  const W = canvas.width, H = canvas.height;
  easeCamera(); project();
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const bg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7); bg.addColorStop(0, '#0d1428'); bg.addColorStop(1, '#04060c');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  /* the brain: every part in its colour; the visited part bright, the others dim; an emotion's parts a little brighter */
  PARTS.forEach((p, k) => {
    const a = visited != null ? (k === visited ? 0.75 : 0.09) : emoParts.has(k) ? 0.5 : 0.26;
    ctx.fillStyle = p.color; ctx.globalAlpha = a; dots(silScr, silOf[k], 1.7); ctx.globalAlpha = Math.min(1, a * 1.25); dots(deepScr, deepOf[k], 1.9);
  });
  ctx.globalCompositeOperation = 'lighter';
  const focus = selected != null ? selected : hovered, lit = new Set(sources());
  if (focus != null) lit.add(focus);
  /* all connections, faint, only when asked */
  if (showAll) { ctx.strokeStyle = network === 'function' ? '#a78bfa' : '#7dd3fc'; ctx.globalAlpha = 0.05; ctx.lineWidth = 0.8; ctx.beginPath(); for (const [i, j] of edges) curve(scr[i], scr[j]); ctx.stroke(); }
  /* the LIVE connections: those of what is lit, coloured like the part they reach, brighter = stronger */
  for (const [i, j, w] of edges) {
    if (!lit.has(i) && !lit.has(j)) continue;
    const far = lit.has(i) ? j : i, u = w / wMax;
    ctx.strokeStyle = colorOf(far); ctx.globalAlpha = 0.08 + 0.4 * u; ctx.lineWidth = 0.6 + 2.6 * u;
    ctx.beginPath(); curve(scr[i], scr[j]); ctx.stroke();
  }
  ctx.setLineDash([7, 6]); ctx.strokeStyle = '#fde68a'; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.3; ctx.beginPath();
  for (const [i, j] of DEEP_LINKS) if (showAll || lit.has(i) || lit.has(j)) curve(scr[i], scr[j]); ctx.stroke(); ctx.setLineDash([]);
  /* impulses: a bright head, a soft halo, a short tail */
  for (const p of pulses) {
    const t = Math.min(1, (now - p.t0) / p.dur), a = scr[p.i], b = scr[p.j], col = p.deep ? '#fde68a' : colorOf(p.j);
    for (let s = 3; s >= 0; s--) { const q = along(a, b, Math.max(0, t - s * 0.035)); ctx.fillStyle = s ? col : '#ffffff'; ctx.globalAlpha = s ? 0.22 / s : 0.95; ctx.beginPath(); ctx.arc(q.x, q.y, s ? 2.4 : 2.2, 0, 6.2832); ctx.fill(); }
    const h = along(a, b, t); ctx.fillStyle = col; ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(h.x, h.y, 8, 0, 6.2832); ctx.fill();
  }
  /* regions: a glowing node, white when both compared emotions report it */
  const emo = new Set(idxOf(emotion && emotion.regions)), other = new Set(idxOf(compare && compare.regions));
  REGIONS.forEach((r, i) => {
    const s = scr[i], g = Math.max(glow[i], emo.has(i) || other.has(i) ? 0.55 : 0), base = (r.kind === 'cortex' ? 3.6 : 5) * Math.sqrt(s.f);
    const c = emo.has(i) && other.has(i) ? '#ffffff' : other.has(i) && !emo.has(i) ? '#34d399' : colorOf(i);
    ctx.fillStyle = c; ctx.globalAlpha = 0.22 * g; ctx.beginPath(); ctx.arc(s.x, s.y, base * 5, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.35 + 0.65 * g; ctx.beginPath(); ctx.arc(s.x, s.y, base + (i === focus ? 4 : 0), 0, 6.2832); ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';
  drawLabels(emo, other, focus);
  ctx.globalAlpha = 1;
}
/* labels a reader can follow: ONE label per lit part and side ("Amygdala · left — spotting threats..."), and the exact region under the finger */
let placed = [];
/* the text keeps a readable size on screen: the canvas is drawn at 1280 px and shown at the page width (about 330 px on a phone) */
const fontScale = () => Math.max(1, canvas.width / Math.max(1, canvas.clientWidth) / 2.1);
const narrow = () => canvas.clientWidth < 520; /* a phone: the label says the part only; what it is known for stays in the panel */
function pill(x, y, title, sub, color) {
  if (narrow()) sub = null;
  let z = fontScale();
  ctx.font = '600 ' + Math.round(27 * z) + 'px system-ui'; let w1 = ctx.measureText(title).width; ctx.font = Math.round(21 * z) + 'px system-ui'; let w2 = sub ? ctx.measureText(sub).width : 0;
  /* a label wider than the canvas shrinks to fit (text width is proportional to the font size) */
  const fit = Math.min(1, (canvas.width - 12) / (Math.max(w1, w2) + 30 * z)); z *= fit; w1 *= fit; w2 *= fit;
  const F1 = Math.round(27 * z), F2 = Math.round(21 * z);
  const w = Math.max(w1, w2) + 30 * z, h = (sub ? 70 : 42) * z, x0 = Math.min(canvas.width - w - 6, Math.max(6, x - w / 2));
  /* no two labels on top of each other: a label that would overlap one already drawn moves up (then down) until it is free */
  const hits = (yy) => placed.some((r) => x0 < r.x + r.w + 6 && r.x < x0 + w + 6 && yy < r.y + r.h + 6 && r.y < yy + h + 6);
  let y0 = Math.max(6, y - h - 18);
  for (let k = 1; k < 12 && hits(y0); k++) y0 = Math.max(6, y - h - 18 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (h + 8));
  y0 = Math.min(canvas.height - h - 6, Math.max(6, y0)); placed.push({ x: x0, y: y0, w, h });
  ctx.globalAlpha = 0.86; ctx.fillStyle = '#0b1222'; ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 10); ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y0 + h); ctx.stroke();
  ctx.textAlign = 'left'; ctx.fillStyle = '#f1f5f9'; ctx.font = '600 ' + F1 + 'px system-ui'; ctx.fillText(title, x0 + 15 * z, y0 + 31 * z);
  if (sub) { ctx.fillStyle = '#a5b4cb'; ctx.font = F2 + 'px system-ui'; ctx.fillText(sub, x0 + 15 * z, y0 + 58 * z); }
}
function drawLabels(emo, other, focus) {
  const groups = new Map(); placed = [];
  const add = (i) => { const k = regionPart[i] + '|' + (REGIONS[i].side || ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); };
  if (visited != null) REGIONS.forEach((_, i) => { if (regionPart[i] === visited) add(i); }); else for (const i of new Set([...emo, ...other])) add(i);
  for (const [k, list] of groups) {
    if (focus != null && list.includes(focus)) continue;
    const pk = Number(k.split('|')[0]), side = k.split('|')[1], x = list.reduce((s, i) => s + scr[i].x, 0) / list.length, y = Math.min(...list.map((i) => scr[i].y));
    pill(x, y, PARTS[pk].name + (side === 'L' ? ' · left' : side === 'R' ? ' · right' : ''), PARTS[pk].knownFor, PARTS[pk].color);
  }
  if (focus != null) pill(scr[focus].x, scr[focus].y, shortName(REGIONS[focus]), PARTS[regionPart[focus]].name + ' · ' + adj[focus].length + ' connections', colorOf(focus));
}

/* ── panels ── */
const chip = (pk, extra = '') => `<button class="chip" data-part="${pk}" style="--c:${PARTS[pk].color}"><i></i>${esc(PARTS[pk].name)}${extra}</button>`;
function bindChips(root) { root.querySelectorAll('button[data-part]').forEach((b) => b.addEventListener('click', () => visitPart(Number(b.dataset.part)))); }
function renderParts() { $('partList').innerHTML = PARTS.map((_, k) => chip(k)).join(''); bindChips($('partList')); }
function visitPart(pk) {
  visited = pk; selected = null; glow.fill(0); pulses = []; visit(pk); renderPart();
  $('partList').querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.part) === pk));
}
function leavePart() { visited = null; pulses = []; renderPart(); $('partList').querySelectorAll('button').forEach((b) => b.classList.remove('on')); }
function renderPart() {
  const el = $('partInfo');
  if (visited == null) { el.innerHTML = '<div class="muted">Tap a part (or "Guided tour") to visit it: it lights up, the brain turns toward it, and its live connections fire.</div>'; return; }
  const p = PARTS[visited], members = REGIONS.map((_, i) => i).filter((i) => regionPart[i] === visited);
  const tw = talksWith(links, p.id).slice(0, 5), inside = (links.find((l) => l.a === p.id && l.b === p.id) || { count: 0 }).count;
  const emos = [...new Set(PACKS.flatMap((pk) => pk.emotions.filter((e) => (e.regions || []).some((id) => partOf(id) === p.id)).map((e) => e.name)))];
  el.innerHTML = `<h3 style="color:${p.color}">${esc(p.name)}</h3><div class="known">Known for: ${esc(p.knownFor)}.</div>`
    + `<div class="muted">${members.length} region${members.length === 1 ? '' : 's'} on this map · ${inside} measured connection${inside === 1 ? '' : 's'} inside it</div>`
    + (tw.length ? `<div class="talk">Talks most with (measured connections):</div><div class="walk">${tw.map((t) => chip(PART_INDEX.get(t.part), ` · ${t.count}`)).join('')}</div>` : '<div class="muted">No measured connection to other parts in this network (deep parts: dashed known pathways only).</div>')
    + `<div class="muted" style="margin-top:8px">Reported in ${emos.length} emotion${emos.length === 1 ? '' : 's'} of the packs${emos.length ? ': ' + esc(emos.slice(0, 12).join(', ')) + (emos.length > 12 ? '…' : '') : ''}.</div>`
    + `<button id="leavePart" class="small">Back to the emotion</button>`;
  bindChips(el); $('leavePart').addEventListener('click', leavePart);
}
function renderEmotion() {
  const el = $('emotionInfo');
  if (!emotion) { el.textContent = 'No emotion data.'; return; }
  const groups = partsOfEmotion(REGIONS, emotion.regions), shared = new Set(idxOf(emotion.shared)), s = emotion.source || {};
  emoParts = new Set(groups.map((g) => PART_INDEX.get(g.part)));
  el.innerHTML = `<h3>${esc(emotion.name)} <span class="muted">· ${esc(pack.name)}</span></h3>`
    + `<div class="known">When people feel this, studies saw activity in ${groups.length} part${groups.length === 1 ? '' : 's'} of the brain:</div>`
    + groups.map((g) => { const pk = PART_INDEX.get(g.part); return `<div class="egroup">${chip(pk)}<div class="muted">${esc(PARTS[pk].knownFor)}</div>`
      + `<div class="regs">${g.regions.map((i) => `<button data-region="${i}">${esc(shortName(REGIONS[i]))}${shared.has(i) ? ' <span class="tag">shared</span>' : ''}</button>`).join('')}</div></div>`; }).join('')
    + `<div class="src"><b>Source</b>: ${esc(s.cite || '?')}${s.year ? ', ' + esc(s.year) : ''}${s.n ? ' · n = ' + esc(s.n) : ''} · ${esc(s.design || '?')}${s.doi ? ` · <a href="https://doi.org/${esc(s.doi)}" target="_blank" rel="noopener">doi</a>` : ''}</div>`
    + `<div class="muted"><b>Measured</b>: ${esc(emotion.measured || '')}</div><div class="muted"><b>Our choice</b>: ${esc(emotion.ours || '')}</div>`;
  bindChips(el);
  el.querySelectorAll('button[data-region]').forEach((b) => b.addEventListener('click', () => { leavePart(); walkTo(Number(b.dataset.region)); }));
  if (compare) {
    const a = new Set(idxOf(emotion.regions)), both = idxOf(compare.regions).filter((i) => a.has(i));
    $('compareInfo').textContent = `${emotion.name} and ${compare.name} share ${both.length} region${both.length === 1 ? '' : 's'}${both.length ? ': ' + both.map((i) => shortName(REGIONS[i])).join(', ') : ''}. White = both, green = ${compare.name} only.`;
  } else $('compareInfo').textContent = '';
}
const back = [];
function walkTo(i) { if (selected != null && selected !== i) back.push(selected); selected = i; renderRegion(i); }
function renderRegion(i) {
  const el = $('regionInfo');
  if (i == null) { el.innerHTML = '<div class="muted">Hover or tap a glowing dot, then walk through its connections.</div>'; return; }
  const r = REGIONS[i], pk = regionPart[i], list = [...adj[i]].sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1));
  const inEmo = [...new Set(PACKS.flatMap((p) => p.emotions.filter((e) => (e.regions || []).includes(r.id)).map((e) => e.name)))];
  el.innerHTML = `<h3 style="color:${PARTS[pk].color}">${esc(shortName(r))}</h3><div class="muted">${esc(r.name)} · part of the ${esc(PARTS[pk].name)} (${esc(PARTS[pk].knownFor)})</div>`
    + `<div class="muted">${list.length} connection${list.length === 1 ? '' : 's'} in the ${network === 'function' ? 'functional' : 'measured'} network${inEmo.length ? ' · reported in: ' + esc(inEmo.join(', ')) : ''}</div>`
    + `<div class="walk">${list.slice(0, 12).map(([j, w]) => `<button data-walk="${j}" style="border-color:${colorOf(j)}66">${esc(shortName(REGIONS[j]))} · ${w == null ? 'known pathway' : 'strength ' + Number(w).toFixed(1)}</button>`).join('')}</div>`
    + (back.length ? '<button id="walkBack" class="small">← back</button>' : '');
  el.querySelectorAll('button[data-walk]').forEach((b) => b.addEventListener('click', () => walkTo(Number(b.dataset.walk))));
  const bk = $('walkBack'); if (bk) bk.addEventListener('click', () => { selected = back.pop(); renderRegion(selected); });
}

/* ── controls ── */
function fillEmotions() {
  $('emotion').innerHTML = pack.emotions.map((e, k) => `<option value="${k}">${esc(e.name)}</option>`).join('');
  $('compare').innerHTML = '<option value="">— none —</option>' + pack.emotions.map((e, k) => `<option value="${k}">${esc(e.name)}</option>`).join('');
}
let tour = null;
function stopTour() { if (tour) { clearInterval(tour); tour = null; $('tour').textContent = 'Guided tour'; } }
function wire() {
  $('pack').innerHTML = PACKS.map((p, k) => `<option value="${k}">${esc(p.name)}</option>`).join('');
  const reset = () => { glow.fill(0); pulses = []; leavePart(); renderEmotion(); };
  $('pack').addEventListener('change', (e) => { pack = PACKS[Number(e.target.value)]; fillEmotions(); emotion = pack.emotions[0]; compare = null; reset(); });
  $('emotion').addEventListener('change', (e) => { emotion = pack.emotions[Number(e.target.value)]; reset(); });
  $('compare').addEventListener('change', (e) => { compare = e.target.value === '' ? null : pack.emotions[Number(e.target.value)]; renderEmotion(); });
  $('net').addEventListener('change', (e) => { useNetwork(e.target.value); pulses = []; renderRegion(selected); renderPart(); });
  $('showAll').addEventListener('change', (e) => { showAll = e.target.checked; });
  $('zoomIn').addEventListener('click', () => zoomBy(1.25)); $('zoomOut').addEventListener('click', () => zoomBy(0.8));
  $('viewReset').addEventListener('click', () => { camTarget = { ...HOME }; });
  $('tour').addEventListener('click', () => {
    if (tour) { stopTour(); return; }
    let k = visited == null ? 0 : (visited + 1) % PARTS.length; visitPart(k);
    tour = setInterval(() => { k = (k + 1) % PARTS.length; visitPart(k); }, 6000); $('tour').textContent = 'Stop the tour';
  });
  const ptrs = new Map(); let dragged = 0, lastPinch = null;
  canvas.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, pos(e)); dragged = 0; lastPinch = null; camTarget = null; stopTour(); canvas.setPointerCapture(e.pointerId); });
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

useNetwork('wiring'); wire(); renderParts(); fillEmotions(); renderEmotion(); renderPart(); renderRegion(null); requestAnimationFrame(loop);
/* for the bench (test-human-brain-map): what the page computed, read-only */
window.__brainMap = { PARTS, silPart, deepPart, regionPart, links: () => links, visit: visitPart, leave: leavePart, frameMs: () => { const t = performance.now(); step(t); draw(t); return performance.now() - t; }, state: () => ({ visited, showAll, pulses: pulses.length, cam: { ...cam } }) };
