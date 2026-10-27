/* pensee-cerveau.js — "LIVE THOUGHT" of a block's brain (owner, 2026-10-27): instead of the technical status line
 *   ("excited · 26 of 128 fired · steering 0 · speed 0.65 · This is its newest beat."), a short first-person thought of 2-3
 *   sentences that concludes what the block perceives and does on THIS beat.
 *
 * ⛔⛔ NEVER AN LLM, NEVER INVENTED. Every clause is a fixed template filled ONLY with fields of the recorded beats (`histo`, the
 *   records pas() returned: tick, phase, spikes, virage, vitesse, nouveaux, delta) and the count of real map neighbours the caller
 *   holds. Each clause carries `from`: the exact keys and values it was built from. Same beat + same history -> same text.
 *   cerveau.js is NOT touched (its moods, its fingerprint, its rules stay v1).
 *
 * THE READING (a human word for its state): the engine's mood (vu.phase) stays the mood. On top, a READING of the same real
 *   state, labelled as such on screen ("a reading of its state, not its engine mood"). The rules, in this order (first match):
 *     blind     — phase NON_LU: its market could not be read, no mood is judged;
 *     silent    — phase MORT: its creator holds none of it;
 *     wary      — this beat: sells > buys (at least one sell);
 *     restless  — fired >= 1.5 x its recent average AND its life rose (delta > 0);
 *     eager     — this beat: buys > sells (at least one buy);
 *     lonely    — no input at all (no buy, sell, holder, transfer, message, no life change) on LONELY_BEATS recorded beats in a row;
 *     stirred   — fired >= 1.5 x its recent average;
 *     settling  — fired <= 0.67 x its recent average;
 *     steady    — anything else.
 *   "Recent average" = the mean of `spikes` over up to AVG_WINDOW recorded beats BEFORE this one; with fewer than AVG_MIN of them
 *   no comparison is made (and none is said).
 */
import { beatSentence, humeurCourte } from './vision-cerveau.js';
import { NEURONES } from './cerveau.js';

export const VERSION_PENSEE = 'tblock-brain-thought/1';
export const AVG_WINDOW = 8;
export const AVG_MIN = 3;
export const LONELY_BEATS = 8;
export const HIGH = 1.5;
export const LOW = 0.67;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const INPUTS = ['achats', 'ventes', 'detenteurs', 'gm', 'messages'];
const compte = (vu, k) => (vu && vu.nouveaux && fini(vu.nouveaux[k]) && vu.nouveaux[k] > 0 ? vu.nouveaux[k] : 0);
const aucuneEntree = (vu) => INPUTS.every((k) => compte(vu, k) === 0) && !(fini(vu && vu.delta) && vu.delta !== 0);
/** a number as the screen writes it: at most 2 decimals, no trailing zeros */
export const nombre = (x) => String(Math.round(x * 100) / 100);

export const READINGS = Object.freeze({
  blind: 'its market could not be read on this beat, so no mood is judged',
  silent: 'its creator holds none of it — nothing reaches it',
  wary: 'more sells than buys reached it on this beat',
  restless: 'it fired well above its recent average while its life rose',
  eager: 'more buys than sells reached it on this beat',
  lonely: 'nothing at all has reached it for ' + LONELY_BEATS + ' recorded beats',
  stirred: 'it fired well above its recent average',
  settling: 'it fired well below its recent average',
  steady: 'nothing in this beat stands out from its recent beats',
});

/** The mean of `spikes` over up to AVG_WINDOW recorded beats before place i; null with fewer than AVG_MIN of them. */
export function moyenneRecente(histo, i) {
  const H = Array.isArray(histo) ? histo : [];
  const avant = H.slice(Math.max(0, i - AVG_WINDOW), Math.max(0, i)).filter((v) => v && fini(v.spikes));
  if (avant.length < AVG_MIN) return null;
  return { moyenne: avant.reduce((s, v) => s + v.spikes, 0) / avant.length, n: avant.length };
}

/** The reading of its state on the beat at place i (see the rules above). */
export function lecture(histo, i) {
  const H = Array.isArray(histo) ? histo : [], vu = H[i];
  if (!vu || !Number.isSafeInteger(vu.tick)) return null;
  const from = [{ key: 'phase', value: vu.phase }];
  const pick = (cle, extra = []) => ({ key: cle, word: cle, why: READINGS[cle], from: from.concat(extra) });
  if (vu.phase === 'NON_LU') return pick('blind');
  if (vu.phase === 'MORT') return pick('silent');
  const a = compte(vu, 'achats'), s = compte(vu, 'ventes');
  if (s > 0 && s > a) return pick('wary', [{ key: 'nouveaux.ventes', value: s }, { key: 'nouveaux.achats', value: a }]);
  const m = moyenneRecente(H, i), sp = fini(vu.spikes) ? vu.spikes : null;
  const haut = m && sp !== null && m.moyenne > 0 && sp >= HIGH * m.moyenne;
  const bas = m && sp !== null && m.moyenne > 0 && sp <= LOW * m.moyenne;
  const fx = m ? [{ key: 'spikes', value: sp }, { key: 'average', value: m.moyenne }] : [];
  if (haut && fini(vu.delta) && vu.delta > 0) return pick('restless', fx.concat([{ key: 'delta', value: vu.delta }]));
  if (a > 0 && a > s) return pick('eager', [{ key: 'nouveaux.achats', value: a }, { key: 'nouveaux.ventes', value: s }]);
  if (i + 1 >= LONELY_BEATS && H.slice(i + 1 - LONELY_BEATS, i + 1).every((v) => v && aucuneEntree(v))) return pick('lonely', [{ key: 'quietBeats', value: LONELY_BEATS }]);
  if (haut) return pick('stirred', fx);
  if (bas) return pick('settling', fx);
  return pick('steady', fx);
}

/**
 * THE THOUGHT of the beat at place i of `histo`. `voisins`: the number of real map neighbours the page holds (null = not known).
 * @returns {{ tick, mood, reading, clauses: Array<{text, from}>, text, version } | null}
 */
export function pensee(histo, i, { voisins = null } = {}) {
  const H = Array.isArray(histo) ? histo : [], vu = H[i];
  if (!vu || !Number.isSafeInteger(vu.tick)) return null;
  const clauses = [];
  /* 1. what reached it — beatSentence (its own traces, already first person, ONLY this beat's fields) */
  const b = beatSentence(vu);
  clauses.push({ text: b.text, from: b.traces.map((t) => ({ key: t.key, value: t.value })) });
  if (vu.phase !== 'MORT') {
    /* 2. inside: how many of its neurons fired, against its own recent beats */
    if (fini(vu.spikes)) {
      const m = moyenneRecente(H, i);
      const base = 'Inside, ' + vu.spikes + ' of my ' + NEURONES + ' neurons fired';
      let text, from = [{ key: 'spikes', value: vu.spikes }];
      if (!m) text = base + '; I hold too few earlier beats here to compare.';
      else {
        from = from.concat([{ key: 'average', value: m.moyenne }, { key: 'averageOver', value: m.n }]);
        const rel = m.moyenne > 0 && vu.spikes >= HIGH * m.moyenne ? 'well above' : m.moyenne > 0 && vu.spikes <= LOW * m.moyenne ? 'well below'
          : vu.spikes > m.moyenne ? 'a little above' : vu.spikes < m.moyenne ? 'a little below' : 'exactly';
        text = base + ' — ' + rel + ' my average of ' + nombre(m.moyenne) + ' over my last ' + m.n + ' beats.';
      }
      clauses.push({ text, from });
    }
    /* 3. what it does: steering and speed (against the beat before), and the neighbours it does not read */
    if (fini(vu.virage) && fini(vu.vitesse)) {
      const prev = i > 0 && H[i - 1] && fini(H[i - 1].vitesse) ? H[i - 1].vitesse : null;
      const tourne = vu.virage < 0 ? 'I turn left' : vu.virage > 0 ? 'I turn right' : 'I hold my heading';
      const vit = prev === null ? 'move at speed ' + nombre(vu.vitesse)
        : vu.vitesse > prev ? 'speed up from ' + nombre(prev) + ' to ' + nombre(vu.vitesse)
          : vu.vitesse < prev ? 'slow down from ' + nombre(prev) + ' to ' + nombre(vu.vitesse) : 'keep my speed at ' + nombre(vu.vitesse);
      const from = [{ key: 'virage', value: vu.virage }, { key: 'vitesse', value: vu.vitesse }].concat(prev === null ? [] : [{ key: 'vitesseAvant', value: prev }]);
      let text = tourne + ' and ' + vit;
      if (Number.isSafeInteger(voisins) && voisins > 0) { text += '; my ' + voisins + ' map neighbour' + (voisins === 1 ? '' : 's') + ' never reach my neurons'; from.push({ key: 'voisins', value: voisins }); }
      clauses.push({ text: text + '.', from });
    }
  }
  return { version: VERSION_PENSEE, tick: vu.tick, mood: humeurCourte(vu.phase), reading: lecture(H, i), clauses, text: clauses.map((c) => c.text).join(' ') };
}
