/* human-brain-parts.js — the 89 nodes of human-brain-data.js grouped into parts a reader knows (Phil 2026-11-09: "the different parts of the
 * brain to visit, readable by people who do not know"). PURE: no DOM, no network.
 * The cortex grouping follows the usual lobe convention for the Desikan-Killiany atlas (FreeSurfer's lobe grouping: cingulate and insula kept
 * apart); the deep grouping and every "known for" sentence are OUR plain-language textbook summaries, said as such on the page. */

export const PARTS = Object.freeze([
  { id: 'frontal', name: 'Frontal lobe', color: '#60a5fa', knownFor: 'planning, decisions, self-control, and speaking (left side)',
    members: ['caudalmiddlefrontal', 'lateralorbitofrontal', 'medialorbitofrontal', 'paracentral', 'parsopercularis', 'parsorbitalis', 'parstriangularis', 'precentral', 'rostralmiddlefrontal', 'superiorfrontal', 'frontalpole'] },
  { id: 'parietal', name: 'Parietal lobe', color: '#34d399', knownFor: 'touch, where the body is, space and attention',
    members: ['inferiorparietal', 'postcentral', 'precuneus', 'superiorparietal', 'supramarginal'] },
  { id: 'temporal', name: 'Temporal lobe', color: '#fbbf24', knownFor: 'hearing, understanding words, faces and memories',
    members: ['bankssts', 'entorhinal', 'fusiform', 'inferiortemporal', 'middletemporal', 'parahippocampal', 'superiortemporal', 'temporalpole', 'transversetemporal'] },
  { id: 'occipital', name: 'Occipital lobe', color: '#a78bfa', knownFor: 'seeing',
    members: ['cuneus', 'lateraloccipital', 'lingual', 'pericalcarine'] },
  { id: 'cingulate', name: 'Cingulate cortex', color: '#f472b6', knownFor: 'noticing conflict and pain, steering attention and emotions',
    members: ['caudalanteriorcingulate', 'isthmuscingulate', 'posteriorcingulate', 'rostralanteriorcingulate'] },
  { id: 'insula', name: 'Insula', color: '#fb923c', knownFor: 'feeling the body from inside (heartbeat, gut), and disgust',
    members: ['insula'] },
  { id: 'amygdala', name: 'Amygdala', color: '#f43f5e', knownFor: 'spotting threats and what matters emotionally',
    members: ['Lamyg', 'Ramyg'] },
  { id: 'hippocampus', name: 'Hippocampus', color: '#2dd4bf', knownFor: 'making new memories and finding places',
    members: ['Lhippo', 'Rhippo'] },
  { id: 'reward', name: 'Reward circuit', color: '#facc15', knownFor: 'wanting, reward, motivation and habits',
    members: ['Laccumb', 'Raccumb', 'Lcaud', 'Rcaud', 'Lput', 'Rput', 'Lpal', 'Rpal', 'VTA_L', 'VTA_R', 'SN_L', 'SN_R'] },
  { id: 'thalamus', name: 'Thalamus', color: '#e2e8f0', knownFor: 'the relay station of the senses',
    members: ['Lthal', 'Rthal'] },
  { id: 'survival', name: 'Hypothalamus and brainstem core', color: '#ef4444', knownFor: 'body reactions: heart rate, hormones, freeze or fight',
    members: ['Hypothal', 'PAG'] },
  { id: 'cerebellum', name: 'Cerebellum', color: '#94a3b8', knownFor: 'coordination and timing',
    members: ['Cerebellum'] },
]);

/** the part of one node id of human-brain-data.js (cortex ids carry an L_ / R_ prefix), or null */
export function partOf(id) {
  const s = String(id), base = /^[LR]_/.test(s) ? s.slice(2) : s;
  for (const p of PARTS) if (p.members.includes(base) || p.members.includes(s)) return p.id;
  return null;
}
export const partById = (pid) => PARTS.find((p) => p.id === pid) || null;

/* 2026-11-09 (Phil: "the TAM brain is still messy; parts of the brain, readable by people who don't understand"): the TAM subject
 *   emotionWiringHCP colours each point by its part, with these colours. */
/** the colour key of a part-coloured drawing: the 12 parts in PARTS order (class k = entry k) */
export const pointPalette = () => Object.freeze(PARTS.map((p) => Object.freeze({ id: p.id, name: p.name, color: p.color, knownFor: p.knownFor })));
/** the class of a node id in pointPalette(): its part's index in PARTS, or -1 when it has none */
export function partIndexOf(id) { const pid = partOf(id); return pid === null ? -1 : PARTS.findIndex((p) => p.id === pid); }

/** a short readable name: "Left amygdala" -> "Amygdala (L)"; keeps the anatomical name, puts the side last */
export function shortName(r) {
  const m = /^(Left|Right) (.+)$/.exec(String(r && r.name || ''));
  if (!m) return String(r && r.name || '');
  return m[2].charAt(0).toUpperCase() + m[2].slice(1) + ' (' + m[1][0] + ')';
}

/** measured connections between parts: { a, b, count, strength } for every pair of parts linked by at least one edge (a <= b; a === b inside) */
export function partLinks(regions, edges) {
  const pid = regions.map((r) => partOf(r.id)), acc = new Map();
  for (const [i, j, w] of edges) {
    if (!(w > 0)) continue;
    const [a, b] = [pid[i], pid[j]].sort(), k = a + '|' + b, e = acc.get(k) || { a, b, count: 0, strength: 0 };
    e.count++; e.strength += w; acc.set(k, e);
  }
  return [...acc.values()].sort((x, y) => y.count - x.count || x.a.localeCompare(y.a));
}

/** the other parts one part talks with, most connections first: [{ part, count, strength }] (its own inside links left out) */
export function talksWith(links, pid) {
  return links.filter((l) => l.a !== l.b && (l.a === pid || l.b === pid)).map((l) => ({ part: l.a === pid ? l.b : l.a, count: l.count, strength: l.strength }))
    .sort((x, y) => y.count - x.count || y.strength - x.strength);
}

/** the parts an emotion's regions fall in, with those regions: [{ part, regions: [index] }] in PARTS order */
export function partsOfEmotion(regions, ids) {
  const out = new Map();
  for (const id of ids || []) { const i = regions.findIndex((r) => r.id === id); if (i < 0) continue; const p = partOf(id); if (!out.has(p)) out.set(p, []); out.get(p).push(i); }
  return PARTS.filter((p) => out.has(p.id)).map((p) => ({ part: p.id, regions: out.get(p.id) }));
}
