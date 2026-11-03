// tam-chimie.js -- TAM, chimie, chaque systeme une simulation honnete comparee a une formule EXACTE.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-biologie.js : SYSTEMES, ENTIERS, COLONNES, SOURCES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun generateur aleatoire natif (graines : mulberry32).
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux du moteur ; e^(-x) par demi-reductions + serie + carres.
// REGLE DU PROJET : aucune valeur publiee sans source lue. Ici AUCUNE : constantes de vitesse et concentrations sans dimension ;
//   chaque formule comparee est derivee dans le commentaire de sa section ; SOURCES est vide expres. (Pas de pH : la constante de
//   l eau est une valeur publiee, pas lue ici.)
// Les systemes :
//   reactionsChaine : A -> B -> C, molecule par molecule ; parts de A, B exactes (Bateman), pic de B a t* = ln(k1/k2)/(k1 - k2).
//   equilibreChimique : A <-> B, molecule par molecule ; part de B = pi (1 - e^(-(kf + kb) t)), pi = kf / (kf + kb), binomiale exacte.
//   brusselator  : l horloge chimique ; point fixe (A, B/A), seuil d oscillation B = 1 + A^2, taux d amortissement et periode exacts
//     de la linearisation (lus en fin de course, ou l ecart est petit).
import { sinD, cosD, lnD } from './tam-moteur.js';

const DEUX_PI = 2 * Math.PI;

export const SOURCES = Object.freeze({});

function expNegD(x) {
  if (!(x >= 0)) return NaN;
  if (x === Infinity) return 0;
  let m = 0; while (x > 0.5) { x /= 2; m++; }
  let s = 1, t = 1; for (let j = 1; j <= 30; j++) { t *= -x / j; s += t; }
  for (let i = 0; i < m; i++) s *= s;
  return s;
}
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const attente = (rng, L) => -lnD(1 - rng()) / L;
function decouper(n, images) { const d = []; for (let k = 0; k < images; k++) d.push(Math.floor(k * n / images)); return d; }
function filmDe(debuts, n) {
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}

// ---------- 1 : reactions en chaine A -> B -> C ----------
// Chaque molecule de A se transforme en B apres une attente Exp(k1), puis B en C apres une attente Exp(k2), independamment des autres.
//   Exact (Bateman, derive de da/dt = -k1 a, db/dt = k1 a - k2 b) : a(t) = e^(-k1 t) ;
//   b(t) = k1/(k2 - k1) (e^(-k1 t) - e^(-k2 t)) (k1 != k2), b(t) = k t e^(-k t) (k1 = k2) ; c = 1 - a - b.
//   Pic de B : db/dt = 0 en t* = ln(k1/k2)/(k1 - k2) (1/k si k1 = k2), b(t*) = (k1/k2)^(k2/(k1 - k2)) ... calcule ici par b(t*).
//   Les N molecules sont independantes : le compte de B a t est EXACTEMENT binomial(N, b(t)), sigma sqrt(b(1-b)/N).
// Dessin : parts de A, B, C au fil du temps (une ligne par instant), de 0 a T = 5 (1/k1 + 1/k2).
function reactionsChaine(P, n) {
  const N = P.molecules, k1 = P.k1, k2 = P.k2, rng = mulberry32(P.graine), T = 5 * (1 / k1 + 1 / k2);
  const t1 = new Float64Array(N), t2 = new Float64Array(N);
  for (let i = 0; i < N; i++) { t1[i] = attente(rng, k1); t2[i] = t1[i] + attente(rng, k2); }
  const egal = Math.abs(k1 - k2) < 1e-9 * (k1 + k2);
  const aDe = (t) => expNegD(k1 * t);
  const bDe = (t) => (egal ? k1 * t * expNegD(k1 * t) : k1 / (k2 - k1) * (expNegD(k1 * t) - expNegD(k2 * t)));
  const tStar = egal ? 1 / k1 : (lnD(k1) - lnD(k2)) / (k1 - k2);
  const compter = (t) => { let a = 0, b = 0; for (let i = 0; i < N; i++) { if (t < t1[i]) a++; else if (t < t2[i]) b++; } return [a, b, N - a - b]; };
  const brut = new Float64Array(n * 4);
  /* tri des instants : comptes incrementaux (n lignes, N molecules) */
  for (let l = 0; l < n; l++) { const t = n === 1 ? T : l * T / (n - 1), [a, b, c] = compter(t), o = 4 * l; brut[o] = t; brut[o + 1] = a / N; brut[o + 2] = b / N; brut[o + 3] = c / N; }
  const [aS, bS] = compter(tStar), bStar = bDe(tStar), aStar = aDe(tStar);
  const tm = 1 / k1, [aM] = compter(tm), am = aDe(tm);
  return { D: 4, brut, unite: 'sans objet (processus aleatoire, non chaotique)', invariants: {
    picB: { mesure: bS / N, formule: bStar, sigma: Math.sqrt(bStar * (1 - bStar) / N), tPic: tStar, molecules: N,
      note: 'share of B at its peak time t* = ln(k1/k2)/(k1 - k2) against the exact b(t*) of the chain (Bateman) ; binomial sigma (molecules are independent)' },
    resteA: { mesure: aM / N, formule: am, sigma: Math.sqrt(am * (1 - am) / N), t: tm, note: 'share of A left at t = 1/k1 against e^(-1)' },
    partA: { mesure: aS / N, formule: aStar, sigma: Math.sqrt(aStar * (1 - aStar) / N), t: tStar, note: 'share of A at t* against e^(-k1 t*)' } } };
}

// ---------- 2 : equilibre A <-> B ----------
// Chaque molecule saute A -> B au taux kf et B -> A au taux kb (chaine de Markov a deux etats, independante des autres).
//   Exact : P(B a t | A a 0) = pi (1 - e^(-(kf + kb) t)), pi = kf / (kf + kb) ; a l equilibre la constante K = [B]/[A] = kf / kb.
//   Compte de B : binomial(N, P(B a t)) exact. K mesuree = nB/nA (sigma par la methode delta, APPROCHEE).
// Dessin : un film de 8 instants ; chaque molecule est un point dans le puits A (x = -1) ou le puits B (x = +1), place au hasard
//   dans son puits (le placement est dessine ; seul le puits a un sens).
const EQ_IMAGES = 8;
function equilibreChimique(P, n) {
  const N = P.molecules, kf = P.kf, kb = P.kb, rng = mulberry32(P.graine), r = kf + kb, pi = kf / r, T = 8 / r;
  const images = Math.min(EQ_IMAGES, n), ts = Array.from({ length: images }, (_, f) => (images === 1 ? T : f * T / (images - 1)));
  const etat = Array.from({ length: images }, () => new Uint8Array(N));
  const tTau = 1 / r; let bTau = 0;
  for (let i = 0; i < N; i++) {
    let e = 0, t = attente(rng, kf), f = 0, vuTau = false;
    while (f < images || !vuTau) {
      const prochain = Math.min(f < images ? ts[f] : Infinity, vuTau ? Infinity : tTau);
      if (t <= prochain) { e = 1 - e; t += attente(rng, e ? kb : kf); continue; }
      if (!vuTau && tTau === prochain) { if (e) bTau++; vuTau = true; }
      if (f < images && ts[f] === prochain) { etat[f][i] = e; f++; }
    }
  }
  const pDe = (t) => pi * (1 - expNegD(r * t));
  let nB = 0; for (let i = 0; i < N; i++) nB += etat[images - 1][i];
  const pT = pDe(T), Kf = kf / kb, nA = N - nB;
  const sK = Math.sqrt(pT * (1 - pT) / N) / ((1 - pT) * (1 - pT));
  const debuts = images === 1 ? [0] : decouper(n, images), film = filmDe(debuts, n), brut = new Float64Array(n * 3), place = mulberry32(P.graine ^ 0x5bd1e995);
  for (let f = 0; f < images; f++) { const d0 = film.debuts[f], c = film.tailles[f];
    /* banc du 03/11 : les c premieres molecules ne dependaient pas de N (curseur « molecules » muet) : on les prend reparties sur les N */
    for (let q = 0; q < c; q++) { const i = Math.floor(q * N / c) % N, o = 3 * (d0 + q), ang = DEUX_PI * place(), rad = 0.6 * Math.sqrt(place());
      brut[o] = (etat[f][i] ? 1 : -1) * 1.5 + rad * cosD(ang); brut[o + 1] = rad * sinD(ang); brut[o + 2] = ts[f]; } }
  return { D: 3, brut, film, nuage: true, unite: 'sans objet (processus aleatoire, non chaotique)', invariants: {
    partB: { mesure: nB / N, formule: pT, sigma: Math.sqrt(pT * (1 - pT) / N), t: T, molecules: N,
      note: 'share of B at the end against pi (1 - e^(-(kf + kb) t)), pi = kf/(kf + kb) ; binomial sigma (molecules are independent)' },
    relaxation: { mesure: bTau / N, formule: pDe(tTau), sigma: Math.sqrt(pDe(tTau) * (1 - pDe(tTau)) / N), t: tTau,
      note: 'share of B at the relaxation time 1/(kf + kb) against pi (1 - 1/e)' },
    /* sonde du 03/11 (40 graines) : a K = 50 les z valaient -3.85 en moyenne : a t = 4/(kf + kb) l equilibre n etait atteint qu a 98 %, et
     *   nB/nA est tres non lineaire quand il reste peu de A -> t = 8/(kf + kb) (e^-8 = 3e-4) et non compare sous 30 A attendues */
    constante: { mesure: nA ? nB / nA : NaN, formule: Kf, sigma: sK, ...(nA ? {} : { absente: 'every molecule is B at the end' }),
      ...(N * (1 - pi) < 30 ? { comparable: false, pasCompare: 'too few A molecules left (about ' + Math.round(N * (1 - pi)) + ') to read the ratio' } : {}),
      approchee: 'measured at t = 8/(kf + kb), where the system is within e^-8 of equilibrium; first-order sigma',
      note: 'equilibrium constant K = [B]/[A] against kf / kb' } } };
}

// ---------- 3 : le brusselator (horloge chimique) ----------
// dx/dt = A - (B + 1) x + x^2 y, dy/dt = B x - x^2 y (concentrations sans dimension). Point fixe EXACT (A, B/A).
//   Jacobienne au point fixe : [[B - 1, A^2], [-B, -A^2]] ; trace tr = B - 1 - A^2, determinant A^2 > 0.
//   tr < 0 : le point fixe attire ; tr > 0 : il repousse et un cycle limite apparait (Hopf) au seuil EXACT B = 1 + A^2.
//   Pres du point fixe, l ecart decroit au taux Re(lambda) = tr/2 (valeurs propres complexes : tr^2 < 4 A^2) et tourne a la pulsation
//   omega = sqrt(A^2 - tr^2/4) : EXACT pour la linearisation, compare en fin de course (ecart < 1e-3 : termes non lineaires negligeables).
//   Au-dessus du seuil, la periode du cycle est MESUREE ; pres du seuil elle tend vers 2 pi / A (approchee).
// RK4, h = 0.005, T = 120. Depart (A + 0.5, B/A) : un ecart fixe au point fixe.
function brusselator(P, n) {
  const A = P.A, mu = P.ecartSeuil, B = 1 + A * A + mu, h = 0.0025, xs = A, ys = B / A, tr0 = B - 1 - A * A;
  /* duree : 12 / |taux| quand le point fixe attire (assez pour descendre sous 1e-3), bornee a [120, 600] */
  const T = tr0 < 0 ? Math.min(600, Math.max(120, 24 / -tr0)) : 120, pas = Math.round(T / h);
  const f = (x, y) => [A - (B + 1) * x + x * x * y, B * x - x * x * y];
  let x = A + 0.5, y = ys;
  const brut = new Float64Array(n * 3), dist = [], tps = [], passages = [];
  let ligne = 0, yAvant = y - ys;
  const ecrire = (st) => { while (ligne < n && Math.round(ligne * pas / (n - 1)) === st) { const o = 3 * ligne; brut[o] = x; brut[o + 1] = y; brut[o + 2] = st * h; ligne++; } };
  ecrire(0);
  for (let st = 1; st <= pas; st++) {
    const [a1, b1] = f(x, y), [a2, b2] = f(x + h / 2 * a1, y + h / 2 * b1), [a3, b3] = f(x + h / 2 * a2, y + h / 2 * b2), [a4, b4] = f(x + h * a3, y + h * b3);
    x += h / 6 * (a1 + 2 * a2 + 2 * a3 + a4); y += h / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
    const dy = y - ys, dc = Math.sqrt((x - xs) * (x - xs) + dy * dy); if (yAvant < 0 && dy >= 0 && dc > 1e-8) passages.push(st * h - h * dy / (dy - yAvant)); yAvant = dy; /* au-dessus de l arrondi seulement */
    if (st % 4 === 0) { dist.push(Math.sqrt((x - xs) * (x - xs) + (y - ys) * (y - ys))); tps.push(st * h); }
    ecrire(st);
  }
  const tr = tr0, complexes = tr * tr < 4 * A * A, Bc = 1 + A * A;
  const reLam = complexes ? tr / 2 : (tr + Math.sqrt(tr * tr - 4 * A * A)) / 2, omega = complexes ? Math.sqrt(A * A - tr * tr / 4) : NaN;
  const dFin = dist[dist.length - 1], stable = tr < 0;
  /* taux mesure : pente (moindres carres) de ln(distance) sur TOUS les echantillons de la fenetre lineaire 1e-9 < d < 1e-3 (au-dessus de
   *   l arrondi) ; sonde du 03/11 : sur une spirale presque circulaire la distance n a pas de pics, la 1re version (pics) rendait NaN */
  let taux = NaN; { let n0 = 0, st0 = 0, sl = 0, stt = 0, stl = 0; for (let i = 0; i < dist.length; i++) if (dist[i] < 1e-3 && dist[i] > 1e-9) { const l = lnD(dist[i]), t = tps[i]; n0++; st0 += t; sl += l; stt += t * t; stl += t * l; }
    if (n0 >= 10) { const d = n0 * stt - st0 * st0; if (d > 0) taux = (n0 * stl - st0 * sl) / d; } }
  let periode = NaN; if ((!stable || complexes) && passages.length >= 4) { const k = passages.length; periode = (passages[k - 1] - passages[k - 3]) / 2; }
  let amp = 0; for (let i = Math.floor(dist.length / 2); i < dist.length; i++) amp = Math.max(amp, dist[i]);
  return { D: 3, brut, unite: 'sans objet (cinetique chimique)', invariants: {
    seuil: { bValeur: B, seuilHopf: Bc, ecartSeuil: mu, oscille: stable ? 0 : 1, ecartFinal: dFin, amplitude: amp,
      note: 'Hopf threshold B = 1 + A^2 (exact) : below it the reaction settles, above it the concentrations oscillate for ever' },
    pointFixe: { mesure: stable ? Math.sqrt(x * x + y * y) : NaN, formule: Math.sqrt(xs * xs + ys * ys), ...(stable ? {} : { absente: 'above the threshold the reaction never settles: it circles round (A, B/A)' }),
      xFixe: xs, yFixe: ys, note: 'distance of the end state from the origin against the fixed point (A, B/A)' },
    amortissement: { mesure: taux, formule: reLam, ...(stable ? (Number.isFinite(taux) ? {} : { absente: 'the run did not reach the small-deviation window (1e-9..1e-3)' }) : { absente: 'above the threshold deviations grow until the cycle' }),
      ...(stable && Math.abs(tr * tr - 4 * A * A) < 0.2 * A * A ? { approchee: 'the two rates are (nearly) equal: the deviation decays as t e^(rt), so its log slope only creeps up to r' } : {}),
      note: 'decay rate of the deviation (least-squares slope of ln distance) against the slowest Jacobian rate (tr/2 when it spirals)' },
    periode: { mesure: periode, formule: stable && complexes ? DEUX_PI / omega : DEUX_PI / A,
      ...(stable ? (complexes ? {} : { absente: 'real eigenvalues: no oscillation to time' }) : { approchee: 'the Hopf period 2 pi / A holds only close to the threshold' }),
      ...(Number.isFinite(periode) || (stable && !complexes) ? {} : { absente: 'fewer than 4 upward crossings of y = B/A in the run' }),
      note: 'time between two crossings of y = B/A upward, against 2 pi / omega of the linearised reaction (2 pi / A on the cycle near threshold)' } } };
}

export const COLONNES = Object.freeze({
  reactionsChaine: { colonnes: ['time t', 'share of A', 'share of B', 'share of C'], memeLongueur: [[1, 2, 3]], autres: [0] },
  equilibreChimique: { colonnes: ['x: well A on the left, well B on the right (placement inside a well is drawn)', 'y (drawn)', 'time t'], memeLongueur: [[0, 1]], autres: [2] },
  brusselator: { colonnes: ['concentration x', 'concentration y', 'time t'], memeLongueur: [[0, 1]], autres: [2] },
});

export const SYSTEMES = Object.freeze([
  { id: 'reactionsChaine', nom: 'A chain of reactions A to B to C (Bateman)', science: 'Chemical kinetics', D: 4, params: { molecules: 1000, k1: 1, k2: 0.5, graine: 1 },
    bornes: { molecules: [100, 5000], k1: [0.2, 5], k2: [0.2, 5], graine: [1, 1000000] },
    phrase: 'A visualisation of two reactions in a row, A -> B -> C, molecule by molecule: each A turns into B after a random wait, then B into C. The shares of A, B and C are compared with the exact Bateman solution, and the intermediate B peaks at the exact time t* = ln(k1/k2)/(k1 - k2). A finite number of molecules, so the agreement is statistical.' },
  { id: 'equilibreChimique', nom: 'A reaction going both ways (chemical equilibrium A <-> B)', science: 'Chemical equilibrium', D: 3, nuage: true, params: { molecules: 600, kf: 1, kb: 0.5, graine: 1 },
    bornes: { molecules: [100, 3000], kf: [0.1, 5], kb: [0.1, 5], graine: [1, 1000000] },
    phrase: 'A visualisation of a reversible reaction A <-> B, molecule by molecule, frame by frame: each molecule hops between the two wells at random. The share of B rises as pi (1 - e^(-(kf + kb) t)) and settles where the forward and backward flows balance, at the equilibrium constant K = kf / kb. A finite number of molecules, so the agreement is statistical; the place of a molecule inside its well is drawn.' },
  { id: 'brusselator', nom: 'A chemical clock (the Brusselator)', science: 'Chemical kinetics', D: 3, params: { A: 1, ecartSeuil: -0.5 },
    bornes: { A: [0.5, 2.5], ecartSeuil: [-1, 3] },
    phrase: 'A visualisation of the Brusselator, a model of an oscillating reaction: two concentrations integrated step by step. Below the exact threshold B = 1 + A^2 the reaction settles on the fixed point (A, B/A), spiralling in at the exact rate of its linearisation; above it, it never settles and ticks like a clock on a limit cycle, with a period near 2 pi / A close to the threshold.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { reactionsChaine: ['molecules', 'graine'], equilibreChimique: ['molecules', 'graine'], brusselator: [] };
const FONCTIONS = { reactionsChaine, equilibreChimique, brusselator };
const parId = (id) => { const s = SYSTEMES.find((x) => x.id === id); if (!s) throw new Error('systeme inconnu: ' + id); return s; };

function borner(id, params) {
  const s = parId(id), P = {};
  for (const k of Object.keys(s.params)) {
    let v = Number(params && params[k]); if (!Number.isFinite(v)) v = s.params[k];
    const [a, b] = s.bornes[k]; v = Math.min(b, Math.max(a, v));
    if ((ENTIERS[id] || []).includes(k)) v = Math.round(v);
    P[k] = v;
  }
  return P;
}

export function reglagesPhysique(id, params = {}) {
  const s = parId(id), P = borner(id, params);
  return Object.keys(s.params).map((k) => ({ chemin: 'params.' + k, nom: k, min: s.bornes[k][0], max: s.bornes[k][1], valeur: P[k] }));
}

export function simuler(id, params = {}, { n = 1500 } = {}) {
  const s = parId(id), P = borner(id, params);
  n = Math.max(2, Math.floor(n));
  const r = FONCTIONS[id](P, n);
  let fini = true; for (let i = 0; i < r.brut.length; i++) if (!Number.isFinite(r.brut[i])) { fini = false; break; }
  if (!fini) return { params: P, D: r.D, n, bornee: false, raison: 'NaN', brut: null, lyapunov: NaN, uniteLyapunov: r.unite, points: null, invariants: null };
  const o = { params: P, D: r.D, n, bornee: true, brut: r.brut, lyapunov: null, uniteLyapunov: r.unite, points: null, invariants: r.invariants };
  if (s.nuage || r.nuage) o.nuage = true;
  if (r.film) o.film = r.film;
  return o;
}
