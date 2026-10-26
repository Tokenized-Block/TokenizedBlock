/* vision-dedans.js — « VIEW INSIDE THE BRAIN » (proprietaire, 2026-10-26, game57 item 4) : la logique PURE de la fenetre 3D.
 * ⛔⛔ CHAQUE EFFET VIENT D UN CHAMP REEL DU BATTEMENT (`vu` rendu par cerveau.js#pas) et porte ce champ et sa valeur :
 *     buy = vu.nouveaux.achats (de face, chaud) · sell = vu.nouveaux.ventes (de dos, froid) · transfer = vu.nouveaux.gm (miroitement
 *     sur les cotes) · new holder = vu.nouveaux.detenteurs (une particule chacun). Absent, nul ou illisible = AUCUN effet.
 * ⛔ La lumiere = la phase DECIDEE (vu.phase) ; sa force = vu.spikes / 128. NON_LU et MORT ne colorent rien (comme haloDeLHumeur).
 * ⛔ La voix = phraseBattement (vision-cerveau.js) : seuls les champs du battement parlent, jamais une cause devinee.
 * ⛔ PUR : aucun reseau, aucune horloge, aucun hasard, aucun DOM. Le dessin vit dans app.html (moteur 3D de la page). */
import { NEURONES } from './cerveau.js';
import { projectCam } from './map3d.js';
import { phraseBattement, apportDe, interne, SOURCES_INTERIEUR, humeurCourte } from './vision-cerveau.js';

export const VERSION_DEDANS = 'tblock-brain-view-inside/1';
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const r3 = (x) => Math.round(x * 1000) / 1000;

export const SENSATIONS = Object.freeze([
  Object.freeze({ cle: 'achats', champ: 'nouveaux.achats', effet: 'buy', direction: 'front', temperature: 'warm', forme: 'glow' }),
  Object.freeze({ cle: 'ventes', champ: 'nouveaux.ventes', effet: 'sell', direction: 'back', temperature: 'cold', forme: 'glow' }),
  Object.freeze({ cle: 'gm', champ: 'nouveaux.gm', effet: 'transfer', direction: 'sides', temperature: null, forme: 'shimmer' }),
  Object.freeze({ cle: 'detenteurs', champ: 'nouveaux.detenteurs', effet: 'holder', direction: 'center', temperature: null, forme: 'particle' }),
]);
/** Les sensations d UN battement. Un block mort ne ressent rien (meme regle que phraseBattement). */
export function effetsDe(vu) {
  if (!vu || typeof vu !== 'object' || vu.phase === 'MORT') return [];
  const nv = vu.nouveaux && typeof vu.nouveaux === 'object' ? vu.nouveaux : null;
  if (!nv) return [];
  const out = [];
  for (const s of SENSATIONS) {
    const v = nv[s.cle];
    if (!fini(v) || v <= 0) continue;
    const e = { champ: s.champ, valeur: v, effet: s.effet, direction: s.direction, temperature: s.temperature, forme: s.forme,
      intensite: r3(Math.min(1, 0.35 + 0.2 * v)) };
    if (s.forme === 'particle') e.particules = Math.min(12, Math.round(v));
    out.push(e);
  }
  return out;
}

/* la teinte par phase : MEME table que app.html#TEINTE_HUMEUR (null = la teinte du theme) ; MORT et NON_LU absents = neutre */
export const TEINTES = Object.freeze({ DORMANT: 220, EVEILLE: 190, CALME: 160, CURIEUX: null, EXCITE: 45, INQUIET: 20 });
export function lumiereDe(vu, teintes = TEINTES) {
  const phase = vu && typeof vu.phase === 'string' ? vu.phase : null;
  if (!phase || !Object.prototype.hasOwnProperty.call(teintes, phase)) return { phase, neutre: true, teinte: null, theme: false, force: 0 };
  const force = fini(vu.spikes) ? r3(Math.max(0, Math.min(1, vu.spikes / NEURONES))) : 0;
  return { phase, neutre: false, teinte: teintes[phase], theme: teintes[phase] === null, force };
}
/** Le pouls au bord de l ecran : sa force = la part de neurones qui ont tire ; il ne bat a l ecran que sans mouvement reduit. */
export function poulsDe(vu, { reduit = false } = {}) {
  const ok = !!vu && Number.isSafeInteger(vu.tick);
  return { tick: ok ? vu.tick : null, force: ok && fini(vu.spikes) ? r3(Math.max(0, Math.min(1, vu.spikes / NEURONES))) : 0, anime: ok && !reduit };
}
/** Les echos : les (jusqu a) 5 battements ENREGISTRES avant le battement montre, du plus recent au plus ancien. */
export function echosDe(histo, i, n = 5) {
  const H = Array.isArray(histo) ? histo : [];
  const out = [];
  for (let k = i - 1; k >= 0 && out.length < n; k--) {
    const v = H[k];
    if (!v || !Number.isSafeInteger(v.tick)) continue;
    out.push({ tick: v.tick, phase: v.phase || null, spikes: fini(v.spikes) ? v.spikes : null,
      indices: Array.isArray(v.indices) ? v.indices.slice() : [], age: out.length + 1 });
  }
  return out;
}
/** Le virage penche l horizon (borne a ±20°). Sans virage lu, il ne penche pas. */
export function horizonDe(vu) {
  if (!vu || !fini(vu.virage)) return { deg: 0, virage: null };
  return { deg: Math.round(Math.max(-20, Math.min(20, vu.virage * 14)) * 100) / 100, virage: vu.virage };
}
/** LE numero de battement : celui du battement montre, et aucun autre. */
export const numeroBattement = (vu) => (vu && Number.isSafeInteger(vu.tick) ? vu.tick : null);
/** La voix interieure : une phrase, faite des seuls champs du battement. */
export function voixDe(vu) { return phraseBattement(vu); }

const CHANGES = ['phase', 'spikes', 'virage', 'vitesse', 'delta'];
const NOUVEAUX = ['achats', 'ventes', 'gm', 'messages', 'detenteurs'];
/** « Why » : ce qui a pese le plus, ses neurones, ce qui a change, ou il regarde. Rien n est devine. */
export function pourquoiDe({ c = null, faits = null, vu = null, vuAvant = null, etat = null, capMap = null } = {}) {
  if (!vu || !Number.isSafeInteger(vu.tick) || !c || !Array.isArray(c.entrees)) return null;
  let dominante = null;
  for (const s of SOURCES_INTERIEUR) {
    const e = c.entrees.find((x) => x.cle === s.cle);
    if (!e || !e.lu) continue;
    const a = apportDe(faits, s.cle);
    if (!fini(a) || a === 0) continue;
    if (!dominante || Math.abs(a) > Math.abs(dominante.apport)) dominante = { cle: e.cle, libelle: e.libelle, valeur: e.valeur, brut: e.brut, apport: a };
  }
  const inn = etat ? interne(etat) : null;
  const proches = inn && inn.tick === vu.tick
    ? inn.neurones.filter((x) => fini(x.potentiel)).sort((a, b) => b.potentiel - a.potentiel || a.n - b.n).slice(0, 5).map((x) => ({ n: x.n, potentiel: x.potentiel, lueur: x.lueur }))
    : null;
  const changements = [];
  if (vuAvant && Number.isSafeInteger(vuAvant.tick)) {
    for (const k of CHANGES) if (k in vu && k in vuAvant && vu[k] !== vuAvant[k]) changements.push({ champ: k, avant: vuAvant[k], apres: vu[k] });
    const a = vuAvant.nouveaux || {}, b = vu.nouveaux || {};
    for (const k of NOUVEAUX) if (fini(a[k]) && fini(b[k]) && a[k] !== b[k]) changements.push({ champ: 'nouveaux.' + k, avant: a[k], apres: b[k] });
  }
  return {
    tick: vu.tick, phase: vu.phase || null, humeur: typeof vu.phase === 'string' ? humeurCourte(vu.phase) : null, dominante,
    neurones: { tires: Array.isArray(vu.indices) ? vu.indices.slice(0, 8) : [], nTires: fini(vu.spikes) ? vu.spikes : null, proches },
    changements,
    regard: { virage: fini(vu.virage) ? vu.virage : null, vitesse: fini(vu.vitesse) ? vu.vitesse : null,
      cote: !fini(vu.virage) ? null : vu.virage < 0 ? 'left' : vu.virage > 0 ? 'right' : 'straight', capMap: fini(capMap) ? capMap : null },
  };
}

/* ══ TAKE CONTROL — un instantane LOCAL, fige ; la camera libre est une fonction pure ══ */
const geler = (o) => { if (o && typeof o === 'object') { for (const k of Object.keys(o)) geler(o[k]); Object.freeze(o); } return o; };
export function instantaneDedans({ adr = null, etat = null, histo = [], i = -1 } = {}) {
  const H = Array.isArray(histo) ? histo : [];
  const k = i >= 0 && i < H.length ? i : H.length - 1;
  const vu = k >= 0 ? H[k] : null;
  if (!vu || !Number.isSafeInteger(vu.tick)) return null;
  const pots = etat && Array.isArray(etat.potentiels) && etat.potentiels.length === NEURONES && etat.tick === vu.tick ? etat.potentiels.slice() : null;
  const liens = etat && etat.c && Array.isArray(etat.c.liens) ? etat.c.liens.map((l) => l.map((x) => ({ vers: x.vers, poids: x.poids }))) : null;
  return geler({ version: VERSION_DEDANS, adr: adr ? String(adr).toLowerCase() : null, tick: vu.tick, phase: vu.phase || null,
    indices: Array.isArray(vu.indices) ? vu.indices.slice() : [], potentiels: pots || new Array(NEURONES).fill(null), etatDuBattement: !!pots, liens });
}
export const camLibre = () => ({ yaw: 0, pitch: 0, dist: 0.35 });
export function orbiterCam(cam, dx, dy) {
  const c = cam || camLibre();
  return { ...c, yaw: c.yaw + (fini(dx) ? dx : 0) * 0.01, pitch: Math.max(-1.4, Math.min(1.4, c.pitch + (fini(dy) ? dy : 0) * 0.01)) };
}
export function zoomerCam(cam, dz) {
  const c = cam || camLibre();
  return { ...c, dist: Math.max(0.2, Math.min(6, c.dist + (fini(dz) ? dz : 0) * 0.15)) };
}
/** game57 #4b (b): projected with THE map engine (map3d.js#projectCam); behind the camera = not drawn. */
export function projeterNeurones(pos, cam, L, H) {
  const c = cam || camLibre();
  const out = [];
  (Array.isArray(pos) ? pos : []).forEach(([x, y, z], n) => {
    const p = projectCam(c, x, y, z, L, H, 0.05);
    if (p) out.push({ n, x: p.sx, y: p.sy, z: p.zc, k: 1 / p.zc });
  });
  return out.sort((a, b) => b.z - a.z);
}
/** pan the camera on screen (like right-drag on the map), bounded to +-600 px */
export function panCam(cam, dx, dy) {
  const c = cam || camLibre(), bound = (v) => Math.max(-600, Math.min(600, v));
  return { ...c, ox: bound((c.ox || 0) + (fini(dx) ? dx : 0)), oy: bound((c.oy || 0) + (fini(dy) ? dy : 0)) };
}
/* the "seen from the map" pose: the map camera's heading, from afar (the block among its real neighbours) */
const MAP_POSE_DIST = 6;
export function mapPose(mapCam) {
  const known = mapCam && fini(mapCam.yaw) && fini(mapCam.pitch);
  return { yaw: known ? mapCam.yaw : 0.65, pitch: known ? mapCam.pitch : -0.18, dist: MAP_POSE_DIST, ox: 0, oy: 0 };
}
/** the flight between two poses (map -> inside, or back); u in [0, 1]; reduced motion = the arrival pose, no flight */
export function flightPose(from, to, u, reduced = false) {
  const end = { yaw: to.yaw, pitch: to.pitch, dist: to.dist, ox: to.ox || 0, oy: to.oy || 0 };
  if (reduced || !from) return end;
  const t = Math.max(0, Math.min(1, fini(u) ? u : 1));
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
    if (!v || !fini(v.x) || !fini(v.y) || !fini(v.z)) continue;
    out.push({ kind: 'neighbour', adr: v.adr, sym: v.sym || null, x: v.x, y: v.y, z: v.z, read: false, note: 'not read by its neurons' });
  }
  return out;
}
/* Outside : la vue de depart de map3d.js (yaw 0,65, pitch −0,18), reculee pour voir ses voisins ; Inside : premiere personne */
const DEHORS = Object.freeze({ yaw: 0.65, pitch: -0.18, dist: 4.2 });
const DEDANS = Object.freeze({ yaw: 0, pitch: 0, dist: 0.35 });
export const DUREE_VOL_MS = 1400;
export function poseCamera(mode, t, reduit = false) {
  if (mode !== 'dedans') return { ...DEHORS };
  if (reduit) return { ...DEDANS };
  const u = Math.max(0, Math.min(1, fini(t) ? t : 1)), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const m = (a, b) => Math.round((a + (b - a) * e) * 1e4) / 1e4;
  return u >= 1 ? { ...DEDANS } : { yaw: m(DEHORS.yaw, DEDANS.yaw), pitch: m(DEHORS.pitch, DEDANS.pitch), dist: m(DEHORS.dist, DEDANS.dist) };
}
/** prefers-reduced-motion : ni vol, ni secousse, lumiere statique, aucune boucle d animation. */
export function planAnimation(reduit) {
  return reduit ? { vol: false, secousse: false, lumiere: 'statique', boucle: false } : { vol: true, secousse: true, lumiere: 'vivante', boucle: true };
}
/** Outside : ses 6 plus proches voisins REELS (positions monde de la map), a l echelle ; allume = seulement s il est lu. */
export function voisinsDehors(h, habitants, lus = new Set(), n = 6) {
  if (!h || !fini(h.wx) || !fini(h.wy) || !fini(h.wz)) return [];
  const l = [];
  for (const o of Array.isArray(habitants) ? habitants : []) {
    if (!o || o === h || !fini(o.wx) || !fini(o.wy) || !fini(o.wz)) continue;
    const dx = o.wx - h.wx, dy = o.wy - h.wy, dz = o.wz - h.wz, d = Math.hypot(dx, dy, dz);
    if (!(d > 0)) continue;
    l.push({ o, dx, dy, dz, d });
  }
  l.sort((a, b) => a.d - b.d);
  const pris = l.slice(0, n), dMax = Math.max(...pris.map((x) => x.d), 1);
  /* echelle racine : le plus proche reste le plus proche, les lointains restent dans le cadre */
  return pris.map(({ o, dx, dy, dz, d }) => {
    const k = (1.6 + 1.6 * Math.sqrt(d / dMax)) / d;
    const adr = String(o.adr || '').toLowerCase();
    return { adr, sym: o.sym || null, phase: o.phase || null, distance: Math.round(d), x: r3(dx * k), y: r3(dy * k), z: r3(dz * k), lu: lus instanceof Set && lus.has(adr) };
  });
}
