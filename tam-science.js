/* tam-science.js — game76 (Phil 01/11 : « vasy fait tout ») : MINTER les sciences en direct (physique, fractales, or, quantique, fluides)
 *   avec le contrat TamArt DEJA deploye. Pur : aucun DOM, aucun reseau ; le serveur et la page l importent tous les deux.
 *   ⛔ Pourquoi ca tient sans TamArt v2 (relu dans contracts/src/TamArt.sol#mint) : le contrat ne verifie que l en-tete
 *     ('T' 'A' 'M', VERSION 1, q dans 1..16, drapeau nuage 0/1) et refuse un doublon par keccak ; il ne connait PAS la famille.
 *     Une oeuvre de science est donc encodee au MEME format (tam-moteur.js#encoder), q = 12, et rejouee par n importe qui depuis
 *     ses params publics : simuler (module de la science, deterministe : aucune fonction transcendante native) -> standardiser ->
 *     projeterND (la cascade du moteur) -> quantifier -> tri Morton pour un nuage -> encoder.
 *   ⛔ Certificats d une science : bornee, dans les bornes de son module, et DISTINCTE de toutes les oeuvres mintees (meme seuil que les
 *     attracteurs, 0.20). Pas de seuil de chaos : une orbite de Kepler n est pas chaotique, et elle n a pas a l etre — la carte le dit. */
import * as PHY from './tam-physique.js';
import * as SCI from './tam-sciences.js';
import * as FLU from './tam-fluides.js';
import { projeterND, encoder, signature, distance, canon, SEUIL_DISTINCT } from './tam-moteur.js';
import { keccak256Hex } from './keccak.js';

export const VERSION_SCIENCE = 'sci1';
export const Q_SCIENCE = 12;
const DEUX_PI = 6.283185307179586, ANGLE_OR = 2.399963229728653;
const ADR = /^0x[0-9a-f]{40}$/;
const CLES = new Set(['v', 'science', 'params', 'angles', 'q', 'minteur']);

export const SYSTEMES = Object.freeze([PHY, SCI, FLU].flatMap((mod) => mod.SYSTEMES.map((s) => Object.freeze({ ...s, mod }))));
export const systeme = (id) => SYSTEMES.find((s) => s.id === id) || null;

/** les angles des plans caches par defaut : l angle d or, comme le moteur (D - 3 angles) */
export function anglesDefaut(D) {
  const a = []; for (let i = 0; i < Math.max(0, D - 3); i++) a.push(Math.round(((i + 1) * ANGLE_OR % DEUX_PI) * 1e6) / 1e6);
  return a;
}
/** les params complets d une oeuvre de science : bornes par son module, angles par defaut, q fixe ; minteur si connu */
export function paramsScience(id, params = {}, { minteur = null, angles = null } = {}) {
  const s = systeme(id); if (!s) throw new Error('science inconnue: ' + id);
  const o = s.mod.simuler(id, params);
  const P = { v: VERSION_SCIENCE, science: id, params: o.params, angles: angles || anglesDefaut(o.D), q: Q_SCIENCE };
  if (minteur && ADR.test(String(minteur).toLowerCase())) P.minteur = String(minteur).toLowerCase();
  return P;
}

/** les params tiennent-ils ? (cles connues, science connue, params = ceux que le module rend apres bornage, angles, q, minteur) */
export function validerScience(P) {
  const non = (raison) => ({ ok: false, code: 'HORS_BORNES', raison });
  if (!P || typeof P !== 'object' || Array.isArray(P)) return non('params absents');
  for (const k of Object.keys(P)) if (!CLES.has(k)) return non('cle inconnue: ' + k);
  if (P.v !== VERSION_SCIENCE) return non('version');
  const s = systeme(P.science); if (!s) return non('science inconnue');
  if (P.q !== Q_SCIENCE) return non('q');
  if (!P.params || typeof P.params !== 'object' || Array.isArray(P.params)) return non('parametres absents');
  let o; try { o = s.mod.simuler(P.science, P.params); } catch (_) { return non('parametres refuses par le module'); }
  /* un params hors bornes serait RAMENE par le module : on exige qu il le soit deja (sinon deux JSON differents = la meme oeuvre) */
  if (canon(o.params) !== canon(P.params)) return non('parametres hors bornes (le module les ramene)');
  if (!Array.isArray(P.angles) || P.angles.length !== Math.max(0, o.D - 3) || !P.angles.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= DEUX_PI)) return non('angles hors bornes');
  if (P.minteur !== undefined && !ADR.test(P.minteur)) return non('minteur');
  return { ok: true, code: 'DANS_LES_BORNES', raison: null };
}

/** game77 (chasse aux bugs : Rabi 0.1 vs 5 -> distance 0.005, omega, lambda, hauteur -> 0.000) : la standardisation PAR AXE ramenait
 *   chaque axe a la meme taille et effacait ce que ces curseurs reglent. Une science garde ses PROPORTIONS : centree par axe, divisee
 *   par UN seul ecart-type (le plus grand des axes). Aucune science n est mintee (totalSupply = 0 le 01/11). */
export function standardiserIso(brut, n, D) {
  const z = new Float64Array(n * D), m = new Float64Array(D); let sMax = 0;
  for (let j = 0; j < D; j++) {
    let a = 0; for (let i = 0; i < n; i++) a += brut[i * D + j]; m[j] = a / n;
    let v = 0; for (let i = 0; i < n; i++) { const w = brut[i * D + j] - m[j]; v += w * w; }
    const s = Math.sqrt(v / n); if (s > sMax) sMax = s;
  }
  const k = sMax > 0 ? 1 / sMax : 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < D; j++) z[i * D + j] = (brut[i * D + j] - m[j]) * k;
  return z;
}
/* le tri Morton d un nuage : la MEME cle que tam-moteur.js#morton (10 bits de poids fort par axe) */
function morton(x, y, z, q) {
  let k = 0; const s = q - 10;
  for (let b = 9; b >= 0; b--) k = k * 8 + (((x >> s) >> b & 1) << 2 | ((y >> s) >> b & 1) << 1 | ((z >> s) >> b & 1));
  return k;
}
/** la simulation, puis la vue stockee (points quantifies, comme generer du moteur) */
export function genererScience(P) {
  const s = systeme(P.science); if (!s) return { bornee: false, raison: 'science inconnue' };
  const o = s.mod.simuler(P.science, P.params);
  if (!o.bornee || !o.brut) return { ...o, bornee: false };
  const n = o.n, D = o.D, M = (1 << P.q) - 1, ordre = o.nuage ? 1 : 0;
  const fin = projeterND(standardiserIso(o.brut, n, D), n, D, P.angles);
  let pts = new Int32Array(n * 3);
  for (let i = 0; i < 3 * n; i++) { const v = Math.round((fin[i] + 1) / 2 * M); pts[i] = v < 0 ? 0 : v > M ? M : v; }
  if (ordre === 1) {
    const idx = Array.from({ length: n }, (_, i) => i), cle = idx.map((i) => morton(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2], P.q));
    idx.sort((a, b) => cle[a] - cle[b] || a - b);
    const t = new Int32Array(n * 3); idx.forEach((src, d) => { t[3 * d] = pts[3 * src]; t[3 * d + 1] = pts[3 * src + 1]; t[3 * d + 2] = pts[3 * src + 2]; }); pts = t;
  }
  return { ...o, points: pts, q: P.q, ordre };
}
/** n importe qui, avec les params publics, recalcule les memes octets */
export function rejouerScience(P) {
  const v = validerScience(P); if (!v.ok) return { ok: false, raisons: [v.raison] };
  const o = genererScience(P); if (!o.bornee) return { ok: false, raisons: ['the simulation left its valid domain'] };
  const octets = encoder({ q: o.q, ordre: o.ordre, points: o.points });
  return { ok: true, octets, hash: keccak256Hex(octets), oeuvre: o };
}
/** les certificats d une science : bornes, bornee, distincte de TOUTES les oeuvres mintees (une signature illisible -> NON_LU) */
export function certifierScience(P, existantes = []) {
  const v = validerScience(P);
  if (!v.ok) return { ok: false, etat: 'REFUSE', codes: ['HORS_BORNES'], raisons: [v.raison] };
  const r = rejouerScience(P);
  if (!r.ok) return { ok: false, etat: 'REFUSE', codes: ['DIVERGE'], raisons: r.raisons };
  const sig = signature(r.oeuvre.points, r.oeuvre.q);
  let dmin = 1, nonLues = 0;
  for (const e of existantes) {
    const s = e && (e.signature || e);
    if (!s || typeof s.length !== 'number' || s.length !== 512) { nonLues++; continue; }
    const d = distance(sig, s); if (!(d >= 0)) { nonLues++; continue; } if (d < dmin) dmin = d;
  }
  const codes = [], raisons = [];
  if (nonLues > 0) { codes.push('SIGNATURE_NON_LUE'); raisons.push('a minted work could not be read, so distinctness is not measured'); }
  else if (dmin < SEUIL_DISTINCT) { codes.push('DOUBLON'); raisons.push('too close to a minted work (distance ' + (Math.round(dmin * 100) / 100) + ', minimum ' + SEUIL_DISTINCT + ')'); }
  return { ok: codes.length === 0, etat: nonLues > 0 ? 'NON_LU' : codes.length ? 'REFUSE' : 'CERTIFIE', bornee: true, distanceMin: dmin, signaturesNonLues: nonLues,
    lyapunov: typeof r.oeuvre.lyapunov === 'number' ? r.oeuvre.lyapunov : NaN, uniteLyapunov: r.oeuvre.uniteLyapunov, codes, raisons, signature: sig, octets: r.octets, hash: r.hash };
}
