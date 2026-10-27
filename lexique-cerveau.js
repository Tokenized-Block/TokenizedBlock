/* lexique-cerveau.js — THE WORD DICTIONARY of a block's live thought (owner, 2026-10-27).
 *
 * For each READING of its state (pensee-cerveau.js#lecture) and each INTENSITY TIER (low / mid / high), several words that say the
 *   same real state; plus the verbs of its movement and of its inner life. pensee-cerveau.js picks ONE word with `choisir`.
 *
 * ⛔⛔ DETERMINISTIC, NEVER RANDOM: the word = list[variete % length], where `variete` comes from the BEAT NUMBER and the block's
 *   wiring fingerprint (vu.cablage = keccak of its address) — never Math.random, never a clock. Same beat -> same word; the next
 *   beat, or another block, reads differently.
 * ⛔⛔ A WORD NEVER ADDS A FACT. Every word of a list says the SAME state at the SAME strength; the tier is computed from real
 *   numbers by the caller (`palier`). A word that would say more than its datum (a cause, a person, a price) does not belong here.
 */
export const VERSION_LEXIQUE = 'tblock-brain-lexicon/1';
export const PALIERS = Object.freeze(['low', 'mid', 'high']);

/** The readings: per tier, synonyms of the SAME state. (blind / silent / lonely have one state, the same words for each tier.) */
const un = (l) => Object.freeze({ low: l, mid: l, high: l });
export const HUMEURS = Object.freeze({
  blind: un(['in the dark', 'unseeing', 'blindfolded']),
  silent: un(['silent', 'switched off', 'without a pulse']),
  lonely: Object.freeze({ low: ['alone', 'unvisited', 'left be'], mid: ['lonely', 'forgotten for a while', 'on my own'], high: ['deeply alone', 'long forgotten', 'stranded'] }),
  wary: Object.freeze({ low: ['a little uneasy', 'watchful', 'slightly on edge'], mid: ['wary', 'on guard', 'uneasy'], high: ['alarmed', 'braced', 'on high alert'] }),
  eager: Object.freeze({ low: ['interested', 'perked up', 'warming'], mid: ['eager', 'keen', 'lit up'], high: ['thrilled', 'electric', 'buzzing'] }),
  restless: Object.freeze({ low: ['restless', 'fidgety', 'unsettled'], mid: ['agitated', 'keyed up', 'wound up'], high: ['frantic', 'racing', 'feverish'] }),
  stirred: Object.freeze({ low: ['stirred', 'nudged awake', 'roused'], mid: ['excited', 'sparked', 'busy inside'], high: ['buzzing', 'electric', 'ablaze'] }),
  settling: Object.freeze({ low: ['quieter', 'winding down', 'easing'], mid: ['settling', 'calming', 'slowing inside'], high: ['hushed', 'nearly still', 'very quiet'] }),
  steady: Object.freeze({ low: ['steady enough', 'roughly even', 'fairly level'], mid: ['steady', 'at ease', 'even'], high: ['settled', 'still', 'perfectly even'] }),
});

/** Movement: per tier of |steering| (see TOURNE_TIERS), and the speed verbs. */
export const MOUVEMENT = Object.freeze({
  gauche: Object.freeze({ low: ['I drift slightly left', 'I ease a touch left'], mid: ['I turn left', 'I lean left', 'I veer left'], high: ['I bank hard left', 'I swing left'] }),
  droite: Object.freeze({ low: ['I drift slightly right', 'I ease a touch right'], mid: ['I turn right', 'I lean right', 'I veer right'], high: ['I bank hard right', 'I swing right'] }),
  droit: Object.freeze(['I hold my heading', 'I keep my line', 'I fly straight on']),
  accelere: Object.freeze(['speed up', 'quicken', 'pick up pace']),
  ralentit: Object.freeze(['slow down', 'ease off', 'drift slower']),
  garde: Object.freeze(['keep my speed', 'hold my pace', 'hold steady']),
});
/** |steering| below 0.05 = slight, below 0.15 = a turn, else hard. */
export const TOURNE_TIERS = Object.freeze([0.05, 0.15]);

/** Inner life: the verb of firing, and of its memory trace against the beat before. */
export const INTERIEUR = Object.freeze({
  tire: Object.freeze(['fired', 'flashed', 'sparked', 'lit']),
  monte: Object.freeze(['my memory trace rises', 'my trace builds up', 'what I remember grows stronger']),
  baisse: Object.freeze(['my memory trace fades', 'my trace thins out', 'what I remember grows fainter']),
  stable: Object.freeze(['my memory trace holds', 'my trace stays level']),
});

/** The variety index of a beat: its number + the first 8 hex digits of its wiring fingerprint (0 without one). Never random. */
export function variete(vu, sel = 0) {
  const t = vu && Number.isSafeInteger(vu.tick) ? vu.tick : 0;
  const c = vu && typeof vu.cablage === 'string' && /^0x[0-9a-f]{8}/i.test(vu.cablage) ? parseInt(vu.cablage.slice(2, 10), 16) : 0;
  return (t * 7 + c + sel * 13) >>> 0;
}
/** One word of a list, by the variety index (deterministic). */
export function choisir(liste, v) {
  return Array.isArray(liste) && liste.length ? liste[(v >>> 0) % liste.length] : '';
}
/** The tier of a value against two ascending bounds: < a -> low, < b -> mid, else high. */
export function palier(x, a, b) {
  return !(typeof x === 'number' && Number.isFinite(x)) ? 'mid' : x < a ? 'low' : x < b ? 'mid' : 'high';
}
/** The word of a reading at a tier. */
export function motHumeur(cle, tier, v) {
  const e = HUMEURS[cle];
  return e ? choisir(e[PALIERS.includes(tier) ? tier : 'mid'], v) : '';
}
