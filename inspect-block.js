// inspect-block.js — game57 #4b (d), Phil 2026-10-26 17:55: "from inside, the user is OMNISCIENT about the block".
// ONE inspect model, built only from what the page already holds for this block. Pure: no DOM, network, clock or randomness.
// Each field is one of:
//   - "read":      a real value, passed through unchanged, with the source it came from;
//   - NOT_READ:    the app has a source for it, but holds no value right now (never a zero, never a default);
//   - NO_SOURCE:   the app has no data source for it at all — said plainly, with why, instead of fabricating one.
import { maskFeeAddresses } from './frais-creation.js';

export const NOT_READ = 'not read';
export const NO_SOURCE = 'no source in this app';
export const VERSION_INSPECT = 'tblock-inspect/1';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/** game59 1(b): the neighbours that appear in the EXACT facts given to pas() (an address as a key or as a value), or null without
 *  facts. `keys` = that input vector. A neighbour that is only near on the map is not "read". */
export function neighboursReadFrom(facts, neighbours) {
  if (!facts || typeof facts !== 'object') return null;
  const near = new Map((Array.isArray(neighbours) ? neighbours : []).filter((n) => n && /^0x[0-9a-fA-F]{40}$/.test(String(n.adr || '')))
    .map((n) => [String(n.adr).toLowerCase(), n]));
  const keys = Object.keys(facts);
  const found = [];
  for (const k of keys) {
    const v = facts[k];
    for (const cand of [k, typeof v === 'string' ? v : null]) {
      const a = cand ? String(cand).toLowerCase() : null;
      if (a && near.has(a) && !found.some((x) => x.adr === a)) found.push({ adr: a, sym: near.get(a).sym || null, key: k });
    }
  }
  return { read: found, keys };
}
const NONE_READ = 'none read this beat';
/** game59 1(c): why "its expectations" has no source — named from the real brain state keys */
function expectationsNote(stateKeys) {
  const keys = Array.isArray(stateKeys) && stateKeys.length ? stateKeys.join(', ') : 'c, tick, potentiels, memoire, spikes, dernierSpikes';
  return 'its brain state has no prediction field (it holds: ' + keys + '); memoire is a trace of past firing, not an expectation; the What-if book replays a change you pick, it is not its expectation';
}

/** game59 1(a): the birth block held by a holders-replay reply (/api/holders), or null. Only a successful reply, only a positive
 *  integer: a failed read, a missing field or a string is "not read", never a guess. */
export function birthBlockFrom(reply) {
  if (!reply || typeof reply !== 'object' || reply.ok !== true) return null;
  return Number.isSafeInteger(reply.naissance) && reply.naissance > 0 ? reply.naissance : null;
}
const text = (x) => (typeof x === 'string' && x.trim() ? x : null);
const list = (x) => (Array.isArray(x) && x.length ? x : null);

/** Every field, its section, and WHERE the app gets it (null = no source in this app). */
export const FIELDS = Object.freeze([
  { section: 'identity', key: 'name', label: 'Name', source: 'server market index (/api/trending, nom)' },
  { section: 'identity', key: 'symbol', label: 'Symbol', source: 'its profile, or the server market index' },
  { section: 'identity', key: 'pairedWith', label: 'Paired with', source: 'server market index (quoteSym): the currency or stock its pool is paired with' },
  { section: 'identity', key: 'creator', label: 'Creator', source: 'chain: its creation transaction, looked up in an 8000-block window (createursConnus)' },
  { section: 'identity', key: 'creationTx', label: 'Creation transaction', source: 'chain: same lookup as the creator' },
  { section: 'identity', key: 'createdAt', label: 'Created at', source: 'server market index (creeLe)' },
  /* game59 1(a): the holders replay starts at the block's first Transfer from the zero address — that is its birth */
  { section: 'identity', key: 'birthBlock', label: 'Birth block', source: 'holders replay (/api/holders naissance): the block of its first Transfer from the zero address' },
  { section: 'personality', key: 'bio', label: 'Bio', source: 'its voice, signed by its creator (/api/voix)' },
  { section: 'personality', key: 'tone', label: 'Tone', source: 'its voice (/api/voix)' },
  { section: 'personality', key: 'topics', label: 'Topics', source: 'its voice (/api/voix)' },
  { section: 'state', key: 'neurons', label: '128 neurons', source: 'its live state on this page (potentials and traces after the newest beat)' },
  { section: 'state', key: 'sensors', label: '16 sensors', source: 'its live state + the current pas() gave its sensors' },
  { section: 'state', key: 'mood', label: 'Mood', source: 'the phase its brain decided on this beat' },
  { section: 'state', key: 'why', label: 'Why this mood', source: 'its strongest read input on this beat (vision-inside#whyOf)' },
  { section: 'state', key: 'steering', label: 'Steering', source: 'its wings on this beat (vu.virage)' },
  { section: 'state', key: 'speed', label: 'Speed', source: 'its wings on this beat (vu.vitesse)' },
  { section: 'state', key: 'memory', label: 'Memory of its last beats', source: 'the beats recorded on this page, and its mean trace' },
  { section: 'perceives', key: 'inputs', label: 'Inputs', source: 'the exact facts given to pas() on its newest beat' },
  /* game59 1(b): read from the exact input vector given to pas() — today it holds no neighbour, and the inspector says so */
  { section: 'perceives', key: 'neighboursRead', label: 'Neighbours its neurons read', source: 'its input vector on this beat (the exact facts given to pas(), cerveau.js#courant)' },
  { section: 'perceives', key: 'neighboursNearby', label: 'Neighbours nearby', source: 'the map: nearest blocks by world position' },
  { section: 'perceives', key: 'market', label: 'Market', source: 'server market index (price, liquidity, venue)' },
  { section: 'done', key: 'recentBeats', label: 'Recent beats', source: 'the beats recorded on this page' },
  { section: 'done', key: 'thoughts', label: 'Thoughts and requests', source: 'its journal, kept in this browser' },
  { section: 'done', key: 'spoken', label: 'What it said', source: 'the map talk feed on this page (map blocks only)' },
  { section: 'expectations', key: 'next', label: 'What it expects', source: null, note: 'its brain makes no prediction; the What-if book replays a change you pick, it is not its expectation' },
]);
const TITLES = { identity: 'Identity', personality: 'Personality', state: 'Full state', perceives: 'What it perceives now', done: 'What it has done', expectations: 'Its expectations' };

const NO_VOICE = Object.freeze({ none: 'none — its creator has not written its voice (/api/voix: voix null)' });
/** the value for each field, or null — only ever taken from `src`, never made up */
function valueOf(key, src) {
  const m = src.market && typeof src.market === 'object' ? src.market : null;
  const vu = src.vu && typeof src.vu === 'object' && Number.isSafeInteger(src.vu.tick) ? src.vu : null;
  const inn = src.internals && vu && src.internals.tick === vu.tick && Array.isArray(src.internals.neurones) && src.internals.neurones.length === 128 ? src.internals : null;
  const histo = Array.isArray(src.histo) ? src.histo.filter((v) => v && Number.isSafeInteger(v.tick)) : [];
  switch (key) {
    case 'name': return m ? text(m.nom) : null;
    case 'symbol': return text(src.symbol) || (m ? text(m.sym) : null);
    case 'pairedWith': return m ? text(m.quoteSym) : null;
    case 'creator': return src.creator ? text(src.creator.createur) : null;
    case 'creationTx': return src.creator ? text(src.creator.tx) : null;
    case 'createdAt': return m ? text(m.creeLe) : null;
    case 'birthBlock': return birthBlockFrom(src.holders);
    /* game59 4: a voice READ as empty (/api/voix: voix null) is a fact, not a missing read */
    case 'bio': return src.voice ? text(src.voice.bio) : src.voiceRead === true ? NO_VOICE : null;
    case 'tone': return src.voice ? text(src.voice.ton) : src.voiceRead === true ? NO_VOICE : null;
    case 'topics': return src.voice ? list(src.voice.sujets) : src.voiceRead === true ? NO_VOICE : null;
    case 'neurons': return inn ? inn.neurones : null;
    case 'sensors': return inn ? { potentials: inn.neurones.slice(0, 16).map((x) => x.potentiel),
      current: src.champ && src.champ.sensations && finite(src.champ.sensations.total) ? src.champ.sensations.total : null } : null;
    case 'mood': return vu && text(vu.phase);
    case 'why': return src.why && src.why.strongest ? src.why.strongest : null;
    case 'steering': return vu && finite(vu.virage) ? vu.virage : null;
    case 'speed': return vu && finite(vu.vitesse) ? vu.vitesse : null;
    case 'memory': return histo.length ? { beats: histo.length, from: histo[0].tick, to: histo[histo.length - 1].tick, trace: vu && finite(vu.memoire) ? vu.memoire : null } : null;
    case 'inputs': return src.champ && Array.isArray(src.champ.entrees) && src.champ.entrees.length
      ? src.champ.entrees.map((e) => ({ key: e.cle, label: e.libelle, read: e.lu === true, text: e.texte, source: e.source || null })) : null;
    case 'neighboursNearby': return src.onMap === true ? list(src.neighbours) : null;
    case 'neighboursRead': return neighboursReadFrom(src.facts, src.neighbours);
    case 'market': return m && (finite(m.prixUsd) || finite(m.liquiditeUsd))
      ? { prixUsd: finite(m.prixUsd) ? m.prixUsd : null, liquiditeUsd: finite(m.liquiditeUsd) ? m.liquiditeUsd : null, dex: text(m.dex) } : null;
    case 'recentBeats': return histo.length ? histo.slice(-5).map((v) => ({ tick: v.tick, phase: v.phase || null, spikes: finite(v.spikes) ? v.spikes : null })) : null;
    case 'thoughts': return list(src.journal) ? src.journal.slice(-5) : null;
    case 'spoken': return list(src.spoken) ? src.spoken.slice(0, 5) : null;
    default: return null;
  }
}

/** The inspect model of one block, or null without an address. */
export function inspectBlock(src) {
  if (!src || typeof src !== 'object' || !/^0x[0-9a-fA-F]{40}$/.test(String(src.address || ''))) return null;
  const sections = [];
  const counts = { read: 0, notRead: 0, noSource: 0 };
  for (const d of FIELDS) {
    let s = sections.find((x) => x.key === d.section);
    if (!s) { s = { key: d.section, title: TITLES[d.section], fields: [] }; sections.push(s); }
    const value = d.source === null ? null : valueOf(d.key, src);
    const status = d.source === null ? NO_SOURCE : value === null || value === undefined ? NOT_READ : 'read';
    const note = d.key === 'next' ? expectationsNote(src.stateKeys)
      : d.note || (d.key === 'neighboursNearby' && src.onMap !== true ? 'not on the map on this page' : null);
    s.fields.push({ key: d.key, label: d.label, status, value: value === undefined ? null : value, source: d.source, note });
    counts[status === 'read' ? 'read' : status === NOT_READ ? 'notRead' : 'noSource']++;
  }
  return { version: VERSION_INSPECT, address: String(src.address).toLowerCase(), sections, counts };
}

/** What the camera looks at: the projected object nearest the screen centre, within `radius` px; null otherwise. */
export function aimedAt(points, L, H, radius = 60) {
  let best = null, bestD = radius;
  for (const p of Array.isArray(points) ? points : []) {
    if (!p || !finite(p.x) || !finite(p.y)) continue;
    const d = Math.hypot(p.x - L / 2, p.y - H / 2);
    if (d <= bestD) { best = p; bestD = d; }
  }
  return best;
}

const num = (x) => (finite(x) ? String(Math.round(x * 1e4) / 1e4) : NOT_READ);
/* game59 1(b): the overlay of a neighbour, from the same input vector as the inspector */
function neighbourReadLine(obj, s) {
  const r = neighboursReadFrom(s.facts, [{ adr: obj.adr, sym: obj.sym }]);
  if (!r) return 'not read — no beat facts held yet';
  return r.read.length ? 'yes — in its input vector (' + r.read[0].key + ')' : 'no — ' + NONE_READ + ' (context from the map only)';
}
/** The overlay for one looked-at object: real values only, "not read" otherwise.
 *  ⛔ game57 #10: a fee address is never displayed — the title and every value go through maskFeeAddresses. */
export function describeTarget(obj, src, model, shown = null) {
  const d = describeTargetRaw(obj, src, model, shown);
  return d ? { title: maskFeeAddresses(d.title), lines: d.lines.map((l) => ({ label: l.label, value: maskFeeAddresses(l.value) })) } : null;
}
/* game57 #4c (a): `shown` = the beat ON SCREEN ({ vu, beatText }, the header's own text). A neuron is described at that beat,
 *  and its beat line is that text — never a second counter. Without `shown`, no beat line at all. */
function describeTargetRaw(obj, src, model, shown = null) {
  if (!obj || typeof obj !== 'object') return null;
  const s = src || {};
  if (obj.kind === 'neuron' && Number.isInteger(obj.n)) {
    const base = shown && shown.vu ? shown.vu : s.vu;
    const vu = base && Number.isSafeInteger(base.tick) ? base : null;
    const inn = s.internals && vu && s.internals.tick === vu.tick && Array.isArray(s.internals.neurones) ? s.internals.neurones[obj.n] : null;
    const lines = [
      { label: 'Fired this beat', value: vu && Array.isArray(vu.indices) ? (vu.indices.includes(obj.n) ? 'yes' : 'no') : NOT_READ },
    /* 2026-10-27 (owner: two "not read" lines teach nothing): potential and trace exist only for the LIVE beat — say so once,
     *   and how to see them, instead of two dead lines on every past beat. */
    ].concat(inn ? [{ label: 'Potential', value: num(inn.potentiel) }, { label: 'Trace (memory)', value: num(inn.trace) }]
      : [{ label: 'Potential & memory', value: 'kept only while it plays live — press Back to live to see them' }]);
    if (shown && typeof shown.beatText === 'string' && shown.beatText) lines.push({ label: 'On screen', value: shown.beatText });
    return { title: 'Neuron #' + obj.n + (obj.n < 16 ? ' (sensor)' : ''), lines };
  }
  if (obj.kind === 'input') {
    const f = model && model.sections ? model.sections.flatMap((x) => x.fields).find((x) => x.key === 'inputs') : null;
    const e = f && Array.isArray(f.value) ? f.value.find((x) => x.key === obj.key) : null;
    return { title: 'Input: ' + (e ? e.label : obj.key), lines: [
      { label: 'Value', value: e ? e.text : NOT_READ },
      { label: 'Read', value: e ? (e.read ? 'yes' : 'no') : NOT_READ },
      { label: 'Source', value: e && e.source ? e.source : NO_SOURCE }] };
  }
  if (obj.kind === 'neighbour') {
    return { title: 'Neighbour: ' + (obj.sym || obj.adr), lines: [
      { label: 'Address', value: obj.adr || NOT_READ },
      { label: 'Read by its neurons', value: neighbourReadLine(obj, s) }] };
  }
  return null;
}

/** One line of text for a field, for the Inspect book. A field that is not read or has no source says so, with why.
 *  ⛔ game57 #10: the creator, neighbours and logs may hold a fee address — the line goes through maskFeeAddresses. */
export function fieldText(f) { return maskFeeAddresses(fieldTextRaw(f)); }
function fieldTextRaw(f) {
  if (!f) return NOT_READ;
  if (f.status !== 'read') return f.status + (f.note ? ' — ' + f.note : '');
  const v = f.value;
  if (v === NO_VOICE || (v && typeof v === 'object' && typeof v.none === 'string' && Object.keys(v).length === 1)) return v.none;
  if (f.key === 'neighboursRead') return v.read.length ? v.read.map((n) => (n.sym || n.adr) + ' (' + n.key + ')').join(' · ')
    : NONE_READ + ' — its input vector (' + v.keys.join(', ') + ') holds no neighbour';
  if (f.key === 'birthBlock') return 'block ' + v + ' (its first transfer from the zero address)';
  if (f.key === 'neurons') {
    const p = v.map((x) => x.potentiel).filter(finite);
    return v.length + ' neurons · potential ' + (p.length ? num(Math.min(...p)) + ' … ' + num(Math.max(...p)) : NOT_READ) + ' · ' + v.filter((x) => finite(x.potentiel) && x.potentiel < 0).length + ' held below zero';
  }
  if (f.key === 'sensors') return v.potentials.map(num).join(' · ') + ' · current received ' + (v.current === null ? NOT_READ : num(v.current));
  if (f.key === 'why') return v.label + ': ' + v.value + ' (adds ' + v.contribution + ')';
  if (f.key === 'memory') return v.beats + ' beats recorded (' + v.from + ' → ' + v.to + ') · mean trace ' + (v.trace === null ? NOT_READ : Math.round(v.trace * 100) + ' %');
  if (f.key === 'inputs') return v.map((e) => e.label + ': ' + e.text).join(' · ');
  if (f.key === 'neighboursNearby') return v.map((n) => (n.sym || n.adr) + (finite(n.distance) ? ' (' + Math.round(n.distance) + ' away)' : '')).join(' · ');
  if (f.key === 'market') return [v.dex, v.prixUsd === null ? 'price ' + NOT_READ : '$' + v.prixUsd, v.liquiditeUsd === null ? 'liquidity ' + NOT_READ : 'liquidity $' + Math.round(v.liquiditeUsd)].filter(Boolean).join(' · ');
  if (f.key === 'recentBeats') return v.map((b) => 'beat ' + b.tick + ' ' + (b.phase || NOT_READ) + ' ' + (b.spikes === null ? '' : b.spikes + ' fired')).join(' · ');
  if (f.key === 'thoughts') return v.map((t) => 'beat ' + t.tick + ': ' + t.texte).join(' · ');
  if (f.key === 'spoken') return v.map((t) => (t.heure ? t.heure + ' ' : '') + t.texte).join(' · ');
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}
