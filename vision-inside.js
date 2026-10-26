/* vision-inside.js — "VIEW INSIDE THE BRAIN" (owner, 2026-10-26, game57 item 4): the PURE logic of the 3D window.
 * ⛔⛔ EVERY EFFECT COMES FROM A REAL FIELD OF THE BEAT (`vu` returned by cerveau.js#pas) and carries that field and its value:
 *     buy = vu.nouveaux.achats (from the front, warm) · sell = vu.nouveaux.ventes (from behind, cold) · transfer = vu.nouveaux.gm
 *     (shimmer at the sides) · new holder = vu.nouveaux.detenteurs (one particle each). Missing, zero or unreadable = NO effect.
 * ⛔ The light = the DECIDED phase (vu.phase); its strength = vu.spikes / 128. NON_LU and MORT colour nothing (like haloDeLHumeur).
 * ⛔ The voice = beatSentence (vision-cerveau.js): only the beat's fields speak, never a guessed cause.
 * ⛔ PURE: no network, no clock, no randomness, no DOM. The drawing lives in app.html (the page's 3D engine).
 * Field names read from the beat, the brain state and vision-cerveau.js#champ (vu.*, entrees[].cle/libelle/valeur/brut/lu,
 * etat.potentiels, liens[].vers/poids, interne().neurones[].potentiel/lueur) keep the names of those base structures. */
import { NEURONES } from './cerveau.js';
import { projectCam } from './map3d.js';
import { beatSentence, apportDe, interne, SOURCES_INTERIEUR, humeurCourte } from './vision-cerveau.js';

export const VERSION_INSIDE = 'tblock-brain-view-inside/1';
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const r3 = (x) => Math.round(x * 1000) / 1000;

export const SENSATIONS = Object.freeze([
  Object.freeze({ key: 'achats', field: 'nouveaux.achats', effect: 'buy', direction: 'front', temperature: 'warm', shape: 'glow' }),
  Object.freeze({ key: 'ventes', field: 'nouveaux.ventes', effect: 'sell', direction: 'back', temperature: 'cold', shape: 'glow' }),
  Object.freeze({ key: 'gm', field: 'nouveaux.gm', effect: 'transfer', direction: 'sides', temperature: null, shape: 'shimmer' }),
  Object.freeze({ key: 'detenteurs', field: 'nouveaux.detenteurs', effect: 'holder', direction: 'center', temperature: null, shape: 'particle' }),
]);
/** The sensations of ONE beat. A dead block feels nothing (same rule as beatSentence). */
export function effectsOf(vu) {
  if (!vu || typeof vu !== 'object' || vu.phase === 'MORT') return [];
  const counts = vu.nouveaux && typeof vu.nouveaux === 'object' ? vu.nouveaux : null;
  if (!counts) return [];
  const out = [];
  for (const s of SENSATIONS) {
    const v = counts[s.key];
    if (!finite(v) || v <= 0) continue;
    const e = { field: s.field, value: v, effect: s.effect, direction: s.direction, temperature: s.temperature, shape: s.shape,
      intensity: r3(Math.min(1, 0.35 + 0.2 * v)) };
    if (s.shape === 'particle') e.particles = Math.min(12, Math.round(v));
    out.push(e);
  }
  return out;
}

/* the hue per phase: SAME table as app.html#TEINTE_HUMEUR (null = the theme's hue); MORT and NON_LU absent = neutral */
export const TINTS = Object.freeze({ DORMANT: 220, EVEILLE: 190, CALME: 160, CURIEUX: null, EXCITE: 45, INQUIET: 20 });
export function lightOf(vu, tints = TINTS) {
  const phase = vu && typeof vu.phase === 'string' ? vu.phase : null;
  if (!phase || !Object.prototype.hasOwnProperty.call(tints, phase)) return { phase, neutral: true, hue: null, theme: false, strength: 0 };
  const strength = finite(vu.spikes) ? r3(Math.max(0, Math.min(1, vu.spikes / NEURONES))) : 0;
  return { phase, neutral: false, hue: tints[phase], theme: tints[phase] === null, strength };
}
/** The pulse at the screen edge: its strength = the share of neurons that fired; it only beats on screen without reduced motion. */
export function pulseOf(vu, { reduced = false } = {}) {
  const ok = !!vu && Number.isSafeInteger(vu.tick);
  return { tick: ok ? vu.tick : null, strength: ok && finite(vu.spikes) ? r3(Math.max(0, Math.min(1, vu.spikes / NEURONES))) : 0, animated: ok && !reduced };
}
/** The echoes: the (up to) 5 RECORDED beats before the beat shown, newest first. */
export function echoesOf(histo, i, n = 5) {
  const H = Array.isArray(histo) ? histo : [];
  const out = [];
  for (let k = i - 1; k >= 0 && out.length < n; k--) {
    const v = H[k];
    if (!v || !Number.isSafeInteger(v.tick)) continue;
    out.push({ tick: v.tick, phase: v.phase || null, spikes: finite(v.spikes) ? v.spikes : null,
      indices: Array.isArray(v.indices) ? v.indices.slice() : [], age: out.length + 1 });
  }
  return out;
}
/** Steering tilts the horizon (bounded to ±20°). Without a read steering, it does not tilt. */
export function horizonOf(vu) {
  if (!vu || !finite(vu.virage)) return { deg: 0, steering: null };
  return { deg: Math.round(Math.max(-20, Math.min(20, vu.virage * 14)) * 100) / 100, steering: vu.virage };
}
/** THE beat number: the one of the beat shown, and no other. */
export const beatNumber = (vu) => (vu && Number.isSafeInteger(vu.tick) ? vu.tick : null);
/** The inner voice: one sentence, made only of the beat's fields. */
export function voiceOf(vu) { return beatSentence(vu); }

const CHANGES = ['phase', 'spikes', 'virage', 'vitesse', 'delta'];
const NEW_COUNTS = ['achats', 'ventes', 'gm', 'messages', 'detenteurs'];
/** "Why": what weighed the most, its neurons, what changed, where it is looking. Nothing is guessed. */
export function whyOf({ c = null, faits = null, vu = null, vuAvant = null, etat = null, capMap = null } = {}) {
  if (!vu || !Number.isSafeInteger(vu.tick) || !c || !Array.isArray(c.entrees)) return null;
  let strongest = null;
  for (const s of SOURCES_INTERIEUR) {
    const e = c.entrees.find((x) => x.cle === s.cle);
    if (!e || !e.lu) continue;
    const a = apportDe(faits, s.cle);
    if (!finite(a) || a === 0) continue;
    if (!strongest || Math.abs(a) > Math.abs(strongest.contribution)) strongest = { key: e.cle, label: e.libelle, value: e.valeur, raw: e.brut, contribution: a };
  }
  const inn = etat ? interne(etat) : null;
  const closest = inn && inn.tick === vu.tick
    ? inn.neurones.filter((x) => finite(x.potentiel)).sort((a, b) => b.potentiel - a.potentiel || a.n - b.n).slice(0, 5).map((x) => ({ n: x.n, potential: x.potentiel, glow: x.lueur }))
    : null;
  const changes = [];
  if (vuAvant && Number.isSafeInteger(vuAvant.tick)) {
    for (const k of CHANGES) if (k in vu && k in vuAvant && vu[k] !== vuAvant[k]) changes.push({ field: k, before: vuAvant[k], after: vu[k] });
    const a = vuAvant.nouveaux || {}, b = vu.nouveaux || {};
    for (const k of NEW_COUNTS) if (finite(a[k]) && finite(b[k]) && a[k] !== b[k]) changes.push({ field: 'nouveaux.' + k, before: a[k], after: b[k] });
  }
  return {
    tick: vu.tick, phase: vu.phase || null, mood: typeof vu.phase === 'string' ? humeurCourte(vu.phase) : null, strongest,
    neurons: { fired: Array.isArray(vu.indices) ? vu.indices.slice(0, 8) : [], nFired: finite(vu.spikes) ? vu.spikes : null, closest },
    changes,
    gaze: { steering: finite(vu.virage) ? vu.virage : null, speed: finite(vu.vitesse) ? vu.vitesse : null,
      side: !finite(vu.virage) ? null : vu.virage < 0 ? 'left' : vu.virage > 0 ? 'right' : 'straight', capMap: finite(capMap) ? capMap : null },
  };
}

/* ══ TAKE CONTROL — a LOCAL, frozen snapshot; the free camera is a pure function ══ */
const deepFreeze = (o) => { if (o && typeof o === 'object') { for (const k of Object.keys(o)) deepFreeze(o[k]); Object.freeze(o); } return o; };
export function insideSnapshot({ adr = null, etat = null, histo = [], i = -1 } = {}) {
  const H = Array.isArray(histo) ? histo : [];
  const k = i >= 0 && i < H.length ? i : H.length - 1;
  const vu = k >= 0 ? H[k] : null;
  if (!vu || !Number.isSafeInteger(vu.tick)) return null;
  const pots = etat && Array.isArray(etat.potentiels) && etat.potentiels.length === NEURONES && etat.tick === vu.tick ? etat.potentiels.slice() : null;
  const links = etat && etat.c && Array.isArray(etat.c.liens) ? etat.c.liens.map((l) => l.map((x) => ({ to: x.vers, weight: x.poids }))) : null;
  return deepFreeze({ version: VERSION_INSIDE, adr: adr ? String(adr).toLowerCase() : null, tick: vu.tick, phase: vu.phase || null,
    indices: Array.isArray(vu.indices) ? vu.indices.slice() : [], potentials: pots || new Array(NEURONES).fill(null), stateOfThisBeat: !!pots, links });
}
export const freeCam = () => ({ yaw: 0, pitch: 0, dist: 0.35 });
export function orbitCam(cam, dx, dy) {
  const c = cam || freeCam();
  return { ...c, yaw: c.yaw + (finite(dx) ? dx : 0) * 0.01, pitch: Math.max(-1.4, Math.min(1.4, c.pitch + (finite(dy) ? dy : 0) * 0.01)) };
}
export function zoomCam(cam, dz) {
  const c = cam || freeCam();
  return { ...c, dist: Math.max(0.2, Math.min(6, c.dist + (finite(dz) ? dz : 0) * 0.15)) };
}
/** game57 #4b (b): projected with THE map engine (map3d.js#projectCam); behind the camera = not drawn. */
export function projectNeurons(pos, cam, L, H) {
  const c = cam || freeCam();
  const out = [];
  (Array.isArray(pos) ? pos : []).forEach(([x, y, z], n) => {
    const p = projectCam(c, x, y, z, L, H, 0.05);
    if (p) out.push({ n, x: p.sx, y: p.sy, z: p.zc, k: 1 / p.zc });
  });
  return out.sort((a, b) => b.z - a.z);
}
/** pan the camera on screen (like right-drag on the map), bounded to +-600 px */
export function panCam(cam, dx, dy) {
  const c = cam || freeCam(), bound = (v) => Math.max(-600, Math.min(600, v));
  return { ...c, ox: bound((c.ox || 0) + (finite(dx) ? dx : 0)), oy: bound((c.oy || 0) + (finite(dy) ? dy : 0)) };
}
/* the "seen from the map" pose: the map camera's heading, from afar (the block among its real neighbours) */
const MAP_POSE_DIST = 6;
export function mapPose(mapCam) {
  const known = mapCam && finite(mapCam.yaw) && finite(mapCam.pitch);
  return { yaw: known ? mapCam.yaw : 0.65, pitch: known ? mapCam.pitch : -0.18, dist: MAP_POSE_DIST, ox: 0, oy: 0 };
}
/** the flight between two poses (map -> inside, or back); u in [0, 1]; reduced motion = the arrival pose, no flight */
export function flightPose(from, to, u, reduced = false) {
  const end = { yaw: to.yaw, pitch: to.pitch, dist: to.dist, ox: to.ox || 0, oy: to.oy || 0 };
  if (reduced || !from) return end;
  const t = Math.max(0, Math.min(1, finite(u) ? u : 1));
  if (t >= 1) return end;
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const mix = (a, b) => (a || 0) + ((b || 0) - (a || 0)) * e;
  return t <= 0 ? { yaw: from.yaw, pitch: from.pitch, dist: from.dist, ox: from.ox || 0, oy: from.oy || 0 }
    : { yaw: mix(from.yaw, end.yaw), pitch: mix(from.pitch, end.pitch), dist: mix(from.dist, end.dist), ox: mix(from.ox, end.ox), oy: mix(from.oy, end.oy) };
}
/** ONE space: the 128 neurons (positions given), its inputs on an arc in front of it (outside the sphere), its REAL neighbours in
 *  their place. No value is changed: a "not read" input stays so; a neighbour is never said to be read by its neurons. */
export function spaceScene({ pos = [], inputs = [], neighbours = [] } = {}) {
  const out = [];
  (Array.isArray(pos) ? pos : []).forEach(([x, y, z], n) => out.push({ kind: 'neuron', n, x, y, z }));
  const list = Array.isArray(inputs) ? inputs : [];
  list.forEach((s, k) => {
    const a = (list.length > 1 ? k / (list.length - 1) - 0.5 : 0) * Math.PI * 0.9;
    out.push({ kind: 'input', key: s.key, label: s.label || s.key, read: s.read === true, text: s.text ?? 'not read',
      x: r3(Math.sin(a) * 1.7), y: -0.35, z: r3(Math.cos(a) * 1.7) });
  });
  for (const v of Array.isArray(neighbours) ? neighbours : []) {
    if (!v || !finite(v.x) || !finite(v.y) || !finite(v.z)) continue;
    out.push({ kind: 'neighbour', adr: v.adr, sym: v.sym || null, x: v.x, y: v.y, z: v.z, read: false, note: 'not read by its neurons' });
  }
  return out;
}
/* Outside: map3d.js's starting view (yaw 0.65, pitch −0.18), pulled back to see its neighbours; Inside: first person.
 * The mode values 'dedans' / 'dehors' are the existing vision.vue values of app.html. */
const OUTSIDE_POSE = Object.freeze({ yaw: 0.65, pitch: -0.18, dist: 4.2 });
const INSIDE_POSE = Object.freeze({ yaw: 0, pitch: 0, dist: 0.35 });
export const FLIGHT_MS = 1400;
export function cameraPose(mode, t, reduced = false) {
  if (mode !== 'dedans') return { ...OUTSIDE_POSE };
  if (reduced) return { ...INSIDE_POSE };
  const u = Math.max(0, Math.min(1, finite(t) ? t : 1)), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const m = (a, b) => Math.round((a + (b - a) * e) * 1e4) / 1e4;
  return u >= 1 ? { ...INSIDE_POSE } : { yaw: m(OUTSIDE_POSE.yaw, INSIDE_POSE.yaw), pitch: m(OUTSIDE_POSE.pitch, INSIDE_POSE.pitch), dist: m(OUTSIDE_POSE.dist, INSIDE_POSE.dist) };
}
/** prefers-reduced-motion: no flight, no shake, static light, no animation loop. */
export function animationPlan(reduced) {
  return reduced ? { flight: false, shake: false, light: 'static', loop: false } : { flight: true, shake: true, light: 'live', loop: true };
}
/** Outside: its 6 closest REAL neighbours (the map's world positions), to scale; lit = only if it is read. */
export function outsideNeighbours(h, habitants, readSet = new Set(), n = 6) {
  if (!h || !finite(h.wx) || !finite(h.wy) || !finite(h.wz)) return [];
  const list = [];
  for (const o of Array.isArray(habitants) ? habitants : []) {
    if (!o || o === h || !finite(o.wx) || !finite(o.wy) || !finite(o.wz)) continue;
    const dx = o.wx - h.wx, dy = o.wy - h.wy, dz = o.wz - h.wz, d = Math.hypot(dx, dy, dz);
    if (!(d > 0)) continue;
    list.push({ o, dx, dy, dz, d });
  }
  list.sort((a, b) => a.d - b.d);
  const taken = list.slice(0, n), dMax = Math.max(...taken.map((x) => x.d), 1);
  /* square-root scale: the closest stays the closest, the far ones stay in frame */
  return taken.map(({ o, dx, dy, dz, d }) => {
    const k = (1.6 + 1.6 * Math.sqrt(d / dMax)) / d;
    const adr = String(o.adr || '').toLowerCase();
    return { adr, sym: o.sym || null, phase: o.phase || null, distance: Math.round(d), x: r3(dx * k), y: r3(dy * k), z: r3(dz * k), read: readSet instanceof Set && readSet.has(adr) };
  });
}

/* game59 3: THE BOX OF A LABEL = its drawn text (10px lines every 12 px, first baseline at top + 10) plus a margin, so two
 * labels closer than twice the margin overlap and placeLabels keeps one — measured in Chrome, "Sealed / not fed" 10 px from
 * "Read at block" read as one line. `widthOf(line)` = the canvas's measureText width. */
export const LABEL_PAD_X = 8;
export const LABEL_PAD_Y = 3;
export function labelBox(lines, cx, top, widthOf) {
  const list = Array.isArray(lines) ? lines : [];
  const w = Math.max(0, ...list.map((l) => Number(widthOf(String(l))) || 0));
  const h = list.length ? (list.length - 1) * 12 + 13 : 0;
  return { x: cx - w / 2 - LABEL_PAD_X, y: top - LABEL_PAD_Y, w: w + 2 * LABEL_PAD_X, h: h + 2 * LABEL_PAD_Y };
}

/* game57 #4c (b): DECLUTTERED LABELS for the space view. `items` = [{ id, near, box: { x, y, w, h } }] in screen space (bigger
 * `near` = closer to the camera). The focus ids (hovered, pinned, aimed — in that order) come first and the first one is always
 * placed; then the nearest. A label whose box overlaps one already placed is skipped; at most `max` are placed. Pure: the
 * given items are returned as they are (no text is made up). */
/* game59 3: `bounds` = { w, h } of the canvas: a label whose text is not fully inside is not placed (it would take a place
 * for nothing); the focus rule stays. */
export function placeLabels(items, { max = 6, focus = [], bounds = null } = {}) {
  const inside = (b) => !bounds || (b.x + LABEL_PAD_X >= 0 && b.y + LABEL_PAD_Y >= 0 && b.x + b.w - LABEL_PAD_X <= bounds.w && b.y + b.h - LABEL_PAD_Y <= bounds.h);
  const all = Array.isArray(items) ? items.filter((it) => it && it.box && [it.box.x, it.box.y, it.box.w, it.box.h].every(Number.isFinite)) : [];
  const focusIds = Array.isArray(focus) ? focus : [];
  const list = all.filter((it) => focusIds.includes(it.id) || inside(it.box));
  const byId = new Map(list.map((it) => [it.id, it]));
  const first = [];
  for (const id of Array.isArray(focus) ? focus : []) { const it = byId.get(id); if (it && !first.includes(it)) first.push(it); }
  const rest = list.filter((it) => !first.includes(it)).map((it, i) => ({ it, i }))
    .sort((a, b) => (Number(b.it.near) || 0) - (Number(a.it.near) || 0) || a.i - b.i).map((x) => x.it);
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const placed = [];
  for (const it of [...first, ...rest]) {
    if (placed.length >= Math.max(0, max)) break;
    if (placed.some((p) => overlaps(p.box, it.box))) continue;
    placed.push(it);
  }
  return placed;
}

/* game57 #4d: THE BEAT HEADER of the brain view. Following live = "Beat M", M the page instance's live beat (the number Live,
 * the Control panel and the Brain tab show) — never the shown copy's own tick. A replay names both, so it is never mistaken
 * for live; Take control names the beat its snapshot was taken at. `fmt` = page-brains.js#beatText. */
export function beatHeader({ snapshotTick = null, shownTick = null, liveTick = null, replaying = false, fmt = (n) => (Number.isSafeInteger(n) ? n.toLocaleString('en-US') : '—') } = {}) {
  if (Number.isSafeInteger(snapshotTick)) return 'Snapshot of beat ' + fmt(snapshotTick);
  if (replaying && Number.isSafeInteger(shownTick)) return 'Replay: beat ' + fmt(shownTick) + ' · live ' + fmt(liveTick);
  if (Number.isSafeInteger(liveTick)) return 'Beat ' + fmt(liveTick);
  return Number.isSafeInteger(shownTick) ? 'Beat ' + fmt(shownTick) : '—';
}

/* game59 3: A REPLAY IS PINNED BY BEAT NUMBER. The brain keeps its last 64 beats; new beats push the oldest out, so an index
 * into that window means a different beat after each new one. `pinTick` = the number (tick) of the beat being replayed.
 * Found -> its place now; gone -> `left` = its number (to say so) and the oldest beat still recorded is shown. Pure. */
export function replayPosition(histo, pinTick) {
  const list = Array.isArray(histo) ? histo : [];
  const n = list.length;
  if (!n) return { i: -1, tick: null, left: null };
  const tickAt = (i) => (list[i] && Number.isSafeInteger(list[i].tick) ? list[i].tick : null);
  if (!Number.isSafeInteger(pinTick)) return { i: n - 1, tick: tickAt(n - 1), left: null };
  const i = list.findIndex((v) => v && v.tick === pinTick);
  if (i >= 0) return { i, tick: pinTick, left: null };
  return { i: 0, tick: tickAt(0), left: pinTick };
}
/* the beat recorded right after the pinned one (Play, Step); `live` = it is the latest beat recorded */
export function nextPinned(histo, pinTick) {
  const list = Array.isArray(histo) ? histo : [];
  const n = list.length;
  if (!n) return { i: -1, tick: null, live: true };
  const p = replayPosition(list, pinTick);
  const i = Math.min(n - 1, p.i + 1);
  return { i, tick: list[i] && Number.isSafeInteger(list[i].tick) ? list[i].tick : null, live: i >= n - 1 };
}
export function leftWindowText(tick, fmt = (n) => String(n)) {
  return Number.isSafeInteger(tick) ? 'beat ' + fmt(tick) + ' left the window' : '';
}
