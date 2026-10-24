/* temps-de-bloc.js — LE TEMPS DE BLOC MESURE, jamais suppose (2026-10-23, Denim). PUR : aucun reseau, aucune signature.
 * POURQUOI : Base « Denim » passe d un bloc toutes les 2 s a cinq blocs par seconde (200 ms). Source : https://docs.base.org/upgrades/denim/overview
 *   et https://docs.base.org/upgrades/denim/200ms-blocks (lus le 2026-10-23) : Base Sepolia active le 2026-10-21 18:00 UTC ; Base Mainnet « targeting
 *   November 2026 », sans horodatage d activation. `block.timestamp` / `timestamp` RESTENT en secondes entieres (plusieurs blocs partagent une
 *   seconde) ; des champs RPC optionnels `timestampMs` (blocs, en-tetes) et `blockTimestampMs` (tx, logs, recus) donnent les millisecondes.
 *   ⛔ La doc ne dit RIEN de BLOCKHASH (fenetre de 256 blocs), des limites eth_getLogs ni de la profondeur servie par les noeuds publics.
 * CE QUE CA CHANGE ICI : tout ce qui compte du TEMPS en BLOCS vaut 10x moins de temps. Les fenetres des CONTRATS (256 blocs de BlockRolls /
 *   BlockDuels) restent en blocs — c est le contrat qui compte — mais leur texte dit la duree au temps MESURE ; les reculs exprimes en temps
 *   (« 7 jours de duels », « N heures de lancements », « 6 s de marge ») sont convertis ici, avec le temps mesure sur deux en-tetes.
 * ⛔ Inconnu -> null, jamais 2 par defaut : l appelant dit « not measured » ou n affiche que les blocs. */

/** bornes plausibles d un temps de bloc Base (s) : 200 ms et 2 s dedans, une mesure aberrante dehors */
export const S_PAR_BLOC_MIN = 0.05, S_PAR_BLOC_MAX = 30;
/** horodatages en SECONDES entieres : l arrondi coute jusqu a 1 s ; 20 s d ecart au moins = erreur <= 5 % */
export const ECART_MIN_S = 20;
/** recul de la mesure : 1 000 blocs = ~2 000 s aujourd hui, ~200 s apres Denim (>= ECART_MIN_S dans les deux cas) */
export const RECUL_MESURE_BLOCS = 1000;

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const plausible = (s) => (fini(s) && s >= S_PAR_BLOC_MIN && s <= S_PAR_BLOC_MAX ? s : null);

/** secondes par bloc entre deux en-tetes { bloc, ts (s), tsMs? (ms) } ; null si non mesurable. Les ms servent seulement si LES DEUX en ont. */
export function sParBlocMesure({ haut, bas } = {}) {
  if (!haut || !bas || !Number.isSafeInteger(haut.bloc) || !Number.isSafeInteger(bas.bloc)) return null;
  const n = haut.bloc - bas.bloc;
  if (n <= 0) return null;
  if (fini(haut.tsMs) && fini(bas.tsMs)) {
    const d = haut.tsMs - bas.tsMs;
    return d > 0 ? plausible(d / 1000 / n) : null;
  }
  if (!fini(haut.ts) || !fini(bas.ts)) return null;
  const d = haut.ts - bas.ts;
  if (d < ECART_MIN_S) return null;
  return plausible(d / n);
}

const entier = (v) => {
  if (typeof v === 'number') return Number.isSafeInteger(v) ? v : null;
  const s = String(v ?? '');
  if (/^0x[0-9a-f]+$/i.test(s)) { const x = parseInt(s, 16); return Number.isSafeInteger(x) ? x : null; }
  if (/^[0-9]+$/.test(s)) { const x = Number(s); return Number.isSafeInteger(x) ? x : null; }
  return null;
};
/** un en-tete RPC (eth_getBlockByNumber) -> { bloc, ts, tsMs } ; tsMs = null s il manque ou ne colle pas a ts (format NON confirme sur mainnet) */
export function enteteVersMesure(b) {
  if (!b || typeof b !== 'object') return null;
  const bloc = entier(b.number), ts = entier(b.timestamp);
  if (bloc === null || ts === null) return null;
  let tsMs = b.timestampMs === undefined || b.timestampMs === null ? null : entier(b.timestampMs);
  if (tsMs !== null && Math.abs(tsMs / 1000 - ts) >= 2) tsMs = null;
  return { bloc, ts, tsMs };
}

/** combien de blocs couvrent `secondes` au temps mesure (arrondi vers le haut) ; null si inconnu */
export function blocsPour(secondes, sParBloc) {
  const s = plausible(sParBloc);
  if (s === null || !fini(secondes) || secondes < 0) return null;
  return Math.ceil(secondes / s - 1e-9);
}
/** combien de secondes durent `blocs` au temps mesure ; null si inconnu */
export function secondesPour(blocs, sParBloc) {
  const s = plausible(sParBloc);
  if (s === null || !fini(blocs) || blocs < 0) return null;
  return Math.round(blocs * s * 1000) / 1000;
}
/** « ~51 s », « ~9 min », « ~3 h », « ~3 days » ; null si inconnu */
export function dureeTexte(secondes) {
  if (!fini(secondes) || secondes < 0) return null;
  if (secondes < 60) return '~' + Math.round(secondes) + ' s';
  if (secondes < 5400) return '~' + Math.round(secondes / 60) + ' min';
  if (secondes < 172800) return '~' + Math.round(secondes / 3600) + ' h';
  return '~' + Math.round(secondes / 86400) + ' days';
}
/** « 256 blocks (~51 s at the measured block time) » ; sans mesure : « 256 blocks », rien d invente */
export function texteBlocs(blocs, sParBloc) {
  const b = Number(blocs);
  const base = b + ' block' + (b === 1 ? '' : 's');
  const d = dureeTexte(secondesPour(b, sParBloc));
  return d ? base + ' (' + d + ' at the measured block time)' : base;
}
/** intervalle de relecture pour une fenetre de `fenetreS` secondes : ~`parts` lectures par fenetre, borne [minMs, maxMs] ; inconnu -> inconnuMs */
export function intervalleSondageMs(fenetreS, { parts = 8, minMs = 2000, maxMs = 20000, inconnuMs = 5000 } = {}) {
  if (!fini(fenetreS) || fenetreS <= 0) return inconnuMs;
  return Math.min(maxMs, Math.max(minMs, Math.round((fenetreS * 1000) / parts)));
}
/** pause entre deux lectures de la tete quand on attend un bloc : un temps de bloc, borne [250, 2000] ms ; inconnu -> 1 s */
export function pasAttenteBlocMs(sParBloc) {
  const s = plausible(sParBloc);
  if (s === null) return 1000;
  return Math.min(2000, Math.max(250, Math.round(s * 1000)));
}

/* ══ LA MESURE COURTE (revue BlockDuelsV2 2026-10-24, n°2) : la mesure longue (RECUL_MESURE_BLOCS, relue toutes les 10 min) met ~13 min a
 *   suivre un passage de 2 s a 200 ms ; pendant ce temps « Settle within about 512 s » serait dit pour une fenetre de ~51 s. La mesure COURTE
 *   (RECUL_COURT_BLOCS blocs, relue souvent) suit le changement en ~RECUL_COURT_BLOCS blocs. C est une borne BASSE : avec des horodatages en
 *   secondes entieres, l ecart vrai peut etre plus court d 1 s, donc (ecart - 1) / n ; exacte avec timestampMs. */
export const RECUL_COURT_BLOCS = 100;
/** ecart minimal (s) pour une mesure courte en secondes entieres : 100 blocs = 20 s a 200 ms, 200 s a 2 s */
export const ECART_COURT_MIN_S = 10;
/** secondes par bloc, borne BASSE, entre deux en-tetes { bloc, ts, tsMs? } ; null si non mesurable */
export function sParBlocBorneBasse({ haut, bas } = {}) {
  if (!haut || !bas || !Number.isSafeInteger(haut.bloc) || !Number.isSafeInteger(bas.bloc)) return null;
  const n = haut.bloc - bas.bloc;
  if (n <= 0) return null;
  if (fini(haut.tsMs) && fini(bas.tsMs)) {
    const d = haut.tsMs - bas.tsMs;
    return d > 0 ? plausible(d / 1000 / n) : null;
  }
  if (!fini(haut.ts) || !fini(bas.ts)) return null;
  const d = haut.ts - bas.ts;
  if (d < ECART_COURT_MIN_S) return null;
  return plausible((d - 1) / n);
}
/** ecart relatif au-dela duquel la mesure courte l emporte (en dessous, c est l arrondi des secondes, pas un changement) */
export const ECART_PRUDENT = 0.1;
/**
 * le temps de bloc a DIRE (une fenetre en secondes ne doit jamais etre plus longue que la vraie) : la mesure longue, sauf si la mesure COURTE
 * est plus rapide de plus de ECART_PRUDENT (les blocs viennent d accelerer) ; une seule des deux -> elle ; aucune -> null.
 */
export function sParBlocPrudent(long, court) {
  const l = plausible(long), c = plausible(court);
  if (l === null) return c;
  if (c === null) return l;
  return c < l * (1 - ECART_PRUDENT) ? c : l;
}
