// tam-chimie.js -- TAM, chimie, chaque systeme une simulation honnete comparee a une formule EXACTE.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-biologie.js : SYSTEMES, ENTIERS, COLONNES, SOURCES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun generateur aleatoire natif (graines : mulberry32).
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux du moteur ; e^(-x) par demi-reductions + serie + carres.
// REGLE DU PROJET : aucune valeur publiee sans source lue. game214 : SEULS pKa de l acide acetique et Kw (SOURCES) ; sinon AUCUNE : constantes de vitesse et concentrations sans dimension ;
//   chaque formule comparee est derivee dans le commentaire de sa section ; SOURCES est vide expres. (Pas de pH : la constante de
//   l eau est une valeur publiee, pas lue ici.)
// Les systemes :
//   reactionsChaine : A -> B -> C, molecule par molecule ; parts de A, B exactes (Bateman), pic de B a t* = ln(k1/k2)/(k1 - k2).
//   equilibreChimique : A <-> B, molecule par molecule ; part de B = pi (1 - e^(-(kf + kb) t)), pi = kf / (kf + kb), binomiale exacte.
//   brusselator  : l horloge chimique ; point fixe (A, B/A), seuil d oscillation B = 1 + A^2, taux d amortissement et periode exacts
//     de la linearisation (lus en fin de course, ou l ecart est petit).
//   gazParfait   : molecules dans une boite, chocs comptes un par un ; P A = N T, vitesse moyenne sqrt(pi T / 2) (Maxwell 2-D).
import { sinD, cosD, lnD } from './tam-moteur.js';

const DEUX_PI = 2 * Math.PI;

/* game214 : PREMIERES valeurs publiees du module (codex Grok Bot 19, sources lues par Grok) : pKa de l acide acetique a 25 C et
 *   constante de l eau Kw a 25 C (valeur de modele). Le banc exige valeur = texte lu, URL https. */
const S = (valeur, unite, url, lu) => Object.freeze({ valeur, unite, url, lu });
export const SOURCES = Object.freeze({
  // https://opentextbc.ca/introductorychemistry/back-matter/appendix-selected-acid-dissociation-constants-at-25c/ : ligne « Acetic acid », pKa 4.756
  pKaAcetique: S(4.756, '', 'https://opentextbc.ca/introductorychemistry/back-matter/appendix-selected-acid-dissociation-constants-at-25c/', '4.756'),
  // https://openstax.org/books/chemistry-2e/pages/14-2-ph-and-poh : Kw = 1.0 x 10^-14 a 25 C
  Kw: S(1.0e-14, '', 'https://openstax.org/books/chemistry-2e/pages/14-2-ph-and-poh', '1.0e-14'),
  /* game215 : angles de liaison EXPERIMENTAUX, NIST CCCBDB « Listing of experimental geometry data », Internal coordinates (lus par Grok Bot 19) */
  // https://cccbdb.nist.gov/expgeom2x.asp?casno=74828&charge=0 : aHCH = 109.471 (1974sve/kov)
  angleCH4: S(109.471, 'deg', 'https://cccbdb.nist.gov/expgeom2x.asp?casno=74828&charge=0', '109.471'),
  // https://cccbdb.nist.gov/expgeom2x.asp?casno=7664417&charge=0 : aHNH = 106.67 (1966Herzberg)
  angleNH3: S(106.67, 'deg', 'https://cccbdb.nist.gov/expgeom2x.asp?casno=7664417&charge=0', '106.67'),
  // https://cccbdb.nist.gov/expgeom2x.asp?casno=7732185&charge=0 : aHOH = 104.4776 (1979Hoy/Bun, equilibrium)
  angleH2O: S(104.4776, 'deg', 'https://cccbdb.nist.gov/expgeom2x.asp?casno=7732185&charge=0', '104.4776'),
  // https://cccbdb.nist.gov/expgeom2x.asp?casno=124389&charge=0 : aOCO = 180 (1966Herzberg)
  angleCO2: S(180, 'deg', 'https://cccbdb.nist.gov/expgeom2x.asp?casno=124389&charge=0', '180'),
  // https://cccbdb.nist.gov/expgeom2x.asp?casno=7637072&charge=0 : aFBF = 120 (1998Kuc)
  angleBF3: S(120, 'deg', 'https://cccbdb.nist.gov/expgeom2x.asp?casno=7637072&charge=0', '120'),
  /* game216 : constantes EXACTES du SI (CODATA 2022, NIST) et potentiels standard (OpenStax annexe L), lus par Grok Bot 19.
   *   R = N_A k_B et F = N_A e sont CALCULES dans le module, jamais tapes. */
  // https://physics.nist.gov/cgi-bin/cuu/Value?na : 6.022 140 76 x 10^23 mol^-1 (exact)
  NA: S(6.02214076e23, 'mol^-1', 'https://physics.nist.gov/cgi-bin/cuu/Value?na', '6.02214076e23'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?k : 1.380 649 x 10^-23 J K^-1 (exact)
  kB: S(1.380649e-23, 'J/K', 'https://physics.nist.gov/cgi-bin/cuu/Value?k', '1.380649e-23'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?e : 1.602 176 634 x 10^-19 C (exact)
  e: S(1.602176634e-19, 'C', 'https://physics.nist.gov/cgi-bin/cuu/Value?e', '1.602176634e-19'),
  // https://openstax.org/books/chemistry-2e/pages/l-standard-electrode-half-cell-potentials : Cu2+ + 2e- -> Cu, +0.337 V
  E0Cu: S(0.337, 'V', 'https://openstax.org/books/chemistry-2e/pages/l-standard-electrode-half-cell-potentials', '0.337'),
  // meme page : Zn2+ + 2e- -> Zn, -0.7618 V
  E0Zn: S(-0.7618, 'V', 'https://openstax.org/books/chemistry-2e/pages/l-standard-electrode-half-cell-potentials', '-0.7618'),
  /* game222 : H2 + I2 -> 2 HI, cours CHM1046 (Florida State University), « Activation Energy », exemple « Let's try a problem », lu par
   *   Grok Bot 19 (source pedagogique publiee, pas l article experimental primaire). Ea et A sont RECALCULES ici, pas tapes. */
  // https://www.chem.fsu.edu/chemlab/chm1046course/activation.html : T1 = 326 C, k1 = 5.4 x 10^-4 M^-1 s^-1
  T1arrhenius: S(326, 'C', 'https://www.chem.fsu.edu/chemlab/chm1046course/activation.html', '326'),
  k1arrhenius: S(5.4e-4, 'L/(mol s)', 'https://www.chem.fsu.edu/chemlab/chm1046course/activation.html', '5.4e-4'),
  // meme page : T2 = 410 C, k2 = 2.8 x 10^-2 M^-1 s^-1
  T2arrhenius: S(410, 'C', 'https://www.chem.fsu.edu/chemlab/chm1046course/activation.html', '410'),
  k2arrhenius: S(2.8e-2, 'L/(mol s)', 'https://www.chem.fsu.edu/chemlab/chm1046course/activation.html', '2.8e-2'),
});

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
// Dessin : un film de 3 courbes (A, puis B, puis C) au fil du temps, de 0 a T = 5 (1/k1 + 1/k2) ; vue de face.
function reactionsChaine(P, n) {
  const N = P.molecules, k1 = P.k1, k2 = P.k2, rng = mulberry32(P.graine), T = 5 * (1 / k1 + 1 / k2);
  const t1 = new Float64Array(N), t2 = new Float64Array(N);
  for (let i = 0; i < N; i++) { t1[i] = attente(rng, k1); t2[i] = t1[i] + attente(rng, k2); }
  const egal = Math.abs(k1 - k2) < 1e-9 * (k1 + k2);
  const aDe = (t) => expNegD(k1 * t);
  const bDe = (t) => (egal ? k1 * t * expNegD(k1 * t) : k1 / (k2 - k1) * (expNegD(k1 * t) - expNegD(k2 * t)));
  const tStar = egal ? 1 / k1 : (lnD(k1) - lnD(k2)) / (k1 - k2);
  const compter = (t) => { let a = 0, b = 0; for (let i = 0; i < N; i++) { if (t < t1[i]) a++; else if (t < t2[i]) b++; } return [a, b, N - a - b]; };
  /* game116 (Phil : « pour biologie et chimie on comprend mal les exemples ») : une seule courbe en 4-D se lisait mal ; TROIS courbes sur un meme graphique :
   *   image 1 = part de A, 2 = part de B, 3 = part de C, chacune sur toute la duree (vue de face : temps en x, part en y) */
  const images = Math.min(3, n), film = filmDe(decouper(n, images), n), brut = new Float64Array(n * 3);
  for (let f = 0; f < images; f++) { const d0 = film.debuts[f], c = film.tailles[f];
    for (let r = 0; r < c; r++) { const t = c === 1 ? T : r * T / (c - 1), o = 3 * (d0 + r); brut[o] = t; brut[o + 1] = compter(t)[f] / N; brut[o + 2] = f; } }
  const [aS, bS] = compter(tStar), bStar = bDe(tStar), aStar = aDe(tStar);
  const tm = 1 / k1, [aM] = compter(tm), am = aDe(tm);
  /* game116 : PAS un film (une image a la fois) : les courbes se comparent ENSEMBLE ; nuage de points, chaque courbe = ses lignes dans courbes */
  return { D: 3, brut, courbes: film, nuage: true, unite: 'sans objet (processus aleatoire, non chaotique)', invariants: {
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

// ---------- 4 : un gaz parfait, des molecules dans une boite ----------
// N molecules ponctuelles sans interaction dans une boite carree de cote L = 10 (2-D, k = m = 1), rebonds elastiques sur les parois.
//   Vitesses tirees de Maxwell a la temperature T : vx, vy ~ normale(0, T) (Box-Muller, ln et cos du moteur).
//   Trajectoire EXACTE sans integration : la coordonnee depliee u = x0 + vx t est repliee dans [0, L] (miroir de periode 2L) ;
//   chaque passage de u par L + 2 j L est un choc sur la paroi droite, qui recoit 2 |vx|.
// Pression (2-D : force par longueur) mesuree = impulsion totale recue par la paroi droite / (duree x L).
//   Exact a la limite des temps longs pour CET echantillon : P = sum vx^2 / L^2 (chaque molecule frappe la paroi tous les 2L/|vx| :
//   force moyenne vx^2 / L) ; l ecart vient des periodes incompletes (APPROCHE, borne ~ 2L / (|vx| duree) par molecule).
//   Gaz parfait : P A = N T (A = L^2) en moyenne sur les tirages : sigma de sum vx^2 / A = sqrt(2 N) T / A (vx^2 / T est un chi2 a 1 ddl).
// Vitesses : |v| suit la loi de Rayleigh v/T e^(-v^2/2T) (Maxwell 2-D) ; vitesse moyenne exacte sqrt(pi T / 2), sigma
//   sqrt((2 - pi/2) T / N).
// Dessin : un film de 8 instants ; chaque molecule a sa place (x, y) ; 3e colonne : sa vitesse (une etiquette).
const GAZ_L = 10, GAZ_IMAGES = 8;
function gazParfait(P, n) {
  const N = P.molecules, T = P.temperature, rng = mulberry32(P.graine), L = GAZ_L, duree = 400 * L / Math.sqrt(T);
  const x0 = new Float64Array(N), y0 = new Float64Array(N), vx = new Float64Array(N), vy = new Float64Array(N);
  const gauss = () => { const u = 1 - rng(), v = rng(); return Math.sqrt(-2 * lnD(u)) * cosD(2 * Math.PI * v); };
  for (let i = 0; i < N; i++) { x0[i] = rng() * L; y0[i] = rng() * L; vx[i] = Math.sqrt(T) * gauss(); vy[i] = Math.sqrt(T) * gauss(); }
  const replier = (u) => { const m = u - 2 * L * Math.floor(u / (2 * L)); return m <= L ? m : 2 * L - m; };
  let impulsion = 0, s2 = 0, sv = 0, borne = 0;
  for (let i = 0; i < N; i++) {
    const u1 = x0[i] + vx[i] * duree, a = Math.min(x0[i], u1), b = Math.max(x0[i], u1);
    /* chocs a droite : u = L + 2 j L dans ]a, b] */
    const chocs = Math.max(0, Math.floor((b - L) / (2 * L)) - Math.ceil((a - L) / (2 * L)) + 1);
    impulsion += 2 * Math.abs(vx[i]) * chocs; s2 += vx[i] * vx[i]; borne += 2 * Math.abs(vx[i]); sv += Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
  }
  const Pm = impulsion / (duree * L), Pech = s2 / (L * L), Pgaz = N * T / (L * L), vm = sv / N;
  const images = Math.min(GAZ_IMAGES, n), film = filmDe(decouper(n, images), n), brut = new Float64Array(n * 3), tFilm = 4 * L; /* banc du 03/11 : 4 L / sqrt(T) rendait le curseur « temperature » MUET (positions identiques : invariance d echelle) ; film fixe sur T = 1 : un gaz chaud va plus loin entre deux images */
  for (let f = 0; f < images; f++) { const d0 = film.debuts[f], c = film.tailles[f], t = images === 1 ? 0 : f * tFilm / (images - 1);
    for (let r = 0; r < c; r++) { const i = Math.floor(r * N / c) % N, o = 3 * (d0 + r); brut[o] = replier(x0[i] + vx[i] * t); brut[o + 1] = replier(y0[i] + vy[i] * t); brut[o + 2] = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]); } }
  return { D: 3, brut, film, nuage: true, unite: 'sans objet (gaz parfait, non chaotique)', invariants: {
    pressionEchantillon: { mesure: Pm, formule: Pech, borneEcart: borne / (duree * L), approchee: 'molecules that have not finished a last round trip make the gap; it shrinks as the run gets longer',
      note: 'push on the right wall per unit length (counted hit by hit) against sum vx^2 / L^2 for these very molecules' },
    gazParfait: { mesure: Pm, formule: Pgaz, sigma: Math.sqrt(2 * N) * T / (L * L), molecules: N, temperature: T,
      note: 'pressure against the ideal gas law P A = N T (k = 1) ; sigma from drawing the speeds at random' },
    vitesseMoyenne: { mesure: vm, formule: Math.sqrt(Math.PI * T / 2), sigma: Math.sqrt((2 - Math.PI / 2) * T / N),
      note: 'mean speed against sqrt(pi T / 2) (Maxwell in 2-D, a Rayleigh law)' } } };
}


// ---------- 5 : le cycle de Carnot ----------
// Gaz parfait (n R = 1) a f degres de liberte (gamma = 1 + 2/f, f curseur entier 3..7). Source chaude Th (curseur), froide Tc = 1.
//   A -> B : detente isotherme a Th de V1 = 1 a V2 = r ; B -> C : detente adiabatique jusqu a Tc ; C -> D : compression isotherme ;
//   D -> A : compression adiabatique. Sur une adiabatique T V^(gamma - 1) = const, donc V = V0 (T0/T)^(f/2) (puissances entieres et une
//   racine : deterministe) ; P = T / V partout.
// Exact (derive ici) : chaleur recue Qh = Th ln r ; travail du cycle W = (Th - Tc) ln r ; rendement W / Qh = 1 - Tc/Th, QUEL QUE SOIT f.
// Mesures : W par la methode des trapezes sur le contour echantillonne (4000 points par branche), contre (Th - Tc) ln r ; rendement W/Qh.
// Dessin : le cycle dans le plan (V, P) ; 3e colonne : la branche (0 A->B, 1 B->C, 2 C->D, 3 D->A). Vue de face.
function carnot(P, n) {
  const Th = P.chaude, Tc = 1, f = P.liberte, r = P.detente, K = 4000;
  const puiss = (x) => { let y = 1; for (let i = 0; i < Math.floor(f / 2); i++) y *= x; return f % 2 ? y * Math.sqrt(x) : y; }; /* x^(f/2) */
  const V3 = r * puiss(Th / Tc), V4 = 1 * puiss(Th / Tc), pts = [];
  for (let i = 0; i < K; i++) { const V = 1 + (r - 1) * i / K; pts.push([V, Th / V, 0]); }
  for (let i = 0; i < K; i++) { const T = Th + (Tc - Th) * i / K, V = r * puiss(Th / T); pts.push([V, T / V, 1]); }
  for (let i = 0; i < K; i++) { const V = V3 + (V4 - V3) * i / K; pts.push([V, Tc / V, 2]); }
  for (let i = 0; i <= K; i++) { const T = Tc + (Th - Tc) * i / K, V = V4 * puiss(Tc / T); pts.push([V, T / V, 3]); }
  let W = 0; for (let i = 1; i < pts.length; i++) W += (pts[i][0] - pts[i - 1][0]) * (pts[i][1] + pts[i - 1][1]) / 2;
  const lr = lnD(r), Qh = Th * lr, Wth = (Th - Tc) * lr;
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const q = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = q[0]; brut[o + 1] = q[1]; brut[o + 2] = q[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (thermodynamique)', invariants: {
    rendement: { mesure: W / Qh, formule: 1 - Tc / Th, gamma: 1 + 2 / f, note: 'work out / heat in against 1 - Tc/Th : the same for any gas (any number of degrees of freedom f)' },
    travail: { mesure: W, formule: Wth, note: 'area of the cycle in the (V, P) plane (trapezoids) against (Th - Tc) ln r' } } };
}

// ---------- game214 : titrage de l acide acetique par la soude (idee et valeurs : codex Grok Bot 19 ; pKa et Kw : SOURCES) ----------
// 10 mL d acide acetique a Ca, soude a Cb ajoutee de 0 a 2 fois l equivalence. Modele IDEAL (activites = concentrations, volumes additifs,
//   soude totalement dissociee). Exact ici : a chaque volume le pH est la racine de l equation de charge
//   h + [Na+] - Ct Ka/(Ka + h) - Kw/h = 0, trouvee par dichotomie sur le pH (80 coupes). Ka = 10^(-pKa) par expNegD(pKa ln 10).
// MESURE : residu de charge relatif sous 1e-9 a chaque point ; pH croissant ; a mi-equivalence le pH est a moins de 0.05 du pKa.
//   Pour Ca = Cb = 0.1 : pH a 0, 50, 100 et 150 % = valeurs de Grok (calcul, pas mesure de laboratoire).
// Temoin : a l equivalence le pH n est PAS 7 (l acetate est une base) : il est mesure ici.
// Dessin (vue de face) : la courbe (volume / volume d equivalence, pH / 14) ; etiquette = part de l acide encore sous forme HA.
function titrageAcideFaible(P, n) {
  const Ca = P.acide, Cb = P.base, Va = 10, Veq = Ca * Va / Cb, Ka = expNegD(SOURCES.pKaAcetique.valeur * lnD(10)), Kw = SOURCES.Kw.valeur;
  const phDe = (Vb) => { const Ct = Ca * Va / (Va + Vb), Na = Cb * Vb / (Va + Vb), f = (pH) => { const h = expNegD(pH * lnD(10)); return h + Na - Ct * Ka / (Ka + h) - Kw / h; };
    let lo = 0, hi = 14; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
    const pH = (lo + hi) / 2, h = expNegD(pH * lnD(10)), A = Ct * Ka / (Ka + h), residu = Math.abs(h + Na - A - Kw / h) / (h + Na + A + Kw / h);
    return { pH, residu, partHA: (Ct - A) / Ct }; };
  const pts = []; let residuMax = 0, nonCroissant = 0;
  for (let k = 0; k <= 400; k++) { const Vb = 2 * Veq * k / 400, r = phDe(Vb); residuMax = Math.max(residuMax, r.residu); if (k && r.pH < pts[k - 1].pH) nonCroissant++; pts.push({ x: Vb / Veq, ...r }); }
  const demi = phDe(Veq / 2).pH, equiv = phDe(Veq).pH, quatre = [0, 0.5, 1, 1.5].map((x) => phDe(x * Veq).pH);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const p = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = p.x / 2; brut[o + 1] = p.pH / 14; brut[o + 2] = p.partHA; }
  return { D: 3, brut, nuage: true, unite: 'pH', invariants: {
    titrageAcideFaible: { mesure: (residuMax < 1e-9 ? 0 : 1) + nonCroissant + (Math.abs(demi - SOURCES.pKaAcetique.valeur) < 0.05 ? 0 : 1), formule: 0, residuMax, demiEquivalence: demi, quatrePoints: quatre.map((x) => x.toFixed(6)).join(' '),
      note: 'charge balance residual above 1e-9, pH that goes down, or pH at half-equivalence more than 0.05 from pKa (ideal model)' },
    temoin: { mesure: equiv, formule: 7, note: 'witness: at equivalence the pH is not 7, because acetate is itself a weak base' } } };
}

// ---------- game215 : la geometrie VSEPR (idee et angles : codex Grok Bot 19 ; angles : SOURCES, NIST CCCBDB) ----------
// VSEPR : les domaines d electrons autour de l atome central s ecartent au maximum : 2 -> ligne (180), 3 -> triangle (120),
//   4 -> tetraedre, d angle arccos(-1/3) CALCULE ici par dichotomie sur cosD (aucun acos natif). Cinq molecules : CH4 (4 domaines,
//   0 doublet libre), NH3 (4, 1), H2O (4, 2), CO2 (2, 0), BF3 (3, 0). MESURE : sans doublet libre, angle mesure = angle ideal a 0.001 deg ;
//   avec doublets libres, l angle mesure baisse a chaque doublet (CH4 > NH3 > H2O).
// Temoin : NH3 et H2O ont 4 domaines comme CH4 mais leurs angles MESURES (106.67 et 104.4776) s ecartent de l ideal : les doublets libres poussent.
// Dessin : la molecule choisie en 3-D, liaisons echantillonnees de l atome central aux voisins, avec l angle MESURE ; les doublets libres
//   (pointilles courts) vers le haut. Colonnes x, y, z.
function arccosD(c) { let lo = 0, hi = Math.PI; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (cosD(m) > c) lo = m; else hi = m; } return (lo + hi) / 2; }
function geometrieVSEPR(P, n) {
  const MOL = [['CH4', 4, 0, SOURCES.angleCH4.valeur], ['NH3', 4, 1, SOURCES.angleNH3.valeur], ['H2O', 4, 2, SOURCES.angleH2O.valeur], ['CO2', 2, 0, SOURCES.angleCO2.valeur], ['BF3', 3, 0, SOURCES.angleBF3.valeur]];
  const tetra = arccosD(-1 / 3) * 180 / Math.PI, ideal = (dom) => (dom === 2 ? 180 : dom === 3 ? 120 : tetra);
  let ecarts = 0; for (const [, dom, libres, ang] of MOL) if (libres === 0 && Math.abs(ang - ideal(dom)) > 0.001) ecarts++;
  if (!(MOL[0][3] > MOL[1][3] && MOL[1][3] > MOL[2][3])) ecarts++;
  const [nom, dom, libres, ang] = MOL[P.molecule], th = ang * Math.PI / 180, liens = [];
  if (dom === 2) { liens.push([1, 0, 0], [-1, 0, 0]); }
  else if (dom === 3 && libres === 0) { for (let k = 0; k < 3; k++) liens.push([cosD(2 * Math.PI * k / 3), sinD(2 * Math.PI * k / 3), 0]); }
  else if (libres === 2) { liens.push([sinD(th / 2), 0, -cosD(th / 2)], [-sinD(th / 2), 0, -cosD(th / 2)]); }
  else { const nb = 4 - libres, c = cosD(th); let lo = 0, hi = Math.PI; for (let i = 0; i < 80; i++) { const a = (lo + hi) / 2, ca = cosD(a), sa = sinD(a); if (ca * ca - 0.5 * sa * sa > c) lo = a; else hi = a; }
    const al = (lo + hi) / 2; for (let k = 0; k < 3; k++) liens.push([sinD(al) * cosD(2 * Math.PI * k / 3), sinD(al) * sinD(2 * Math.PI * k / 3), -cosD(al)]); if (nb === 4) liens.push([0, 0, 1]); }
  const doublets = []; for (let k = 0; k < libres; k++) doublets.push(libres === 1 ? [0, 0, 1] : [0, (k ? -1 : 1) * sinD(th / 2), cosD(th / 2)]);
  const segs = [...liens.map((v) => [v, 1]), ...doublets.map((v) => [v, 0.45])], brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [v, L] = segs[l % segs.length], f = L * (Math.floor(l / segs.length) % 50) / 49, o = 3 * l; brut[o] = v[0] * f; brut[o + 1] = v[1] * f; brut[o + 2] = v[2] * f; }
  const dessine = liens.length >= 2 ? arccosD(liens[0][0] * liens[1][0] + liens[0][1] * liens[1][1] + liens[0][2] * liens[1][2]) * 180 / Math.PI : NaN;
  return { D: 3, brut, nuage: true, unite: 'longueur de liaison', invariants: {
    geometrieVSEPR: { mesure: ecarts, formule: 0, angleTetraedre: tetra, molecule: nom, angleMesure: ang, angleDessine: dessine, note: 'molecules without lone pairs whose measured angle is more than 0.001 deg from the VSEPR ideal, or measured angles not falling CH4 > NH3 > H2O' },
    temoin: { mesure: tetra - MOL[2][3], formule: 0, note: 'witness: H2O has 4 electron domains like CH4, yet its measured angle sits about 5 degrees below the tetrahedral ideal: lone pairs push' } } };
}

// ---------- game216 : la pile Daniell et l equation de Nernst (idee et valeurs : codex Grok Bot 19 ; constantes et E0 : SOURCES) ----------
// Zn + Cu2+ -> Zn2+ + Cu, n = 2. E0 = E0(Cu) - E0(Zn) ; R = N_A k_B, F = N_A e (calcules) ; E = E0 - (R T / n F) ln Q, Q = [Zn2+]/[Cu2+].
// Modele IDEAL (activites = concentrations). La pile se DECHARGE dans une charge : a chaque pas la part du Cu2+ restant qui se depose
//   est une quantite ABSOLUE (0.004 mol/L par pas fois (E/E0)^3, choix de dessin, au plus la moitie du reste), autant de Zn2+ apparait :
//   plus de cuivre au depart = chute de tension plus tardive ; la forme depend aussi de T. Q ne depasse jamais K = e^(nFE0/RT) (E >= 0).
// MESURE : a chaque pas, E suit Nernst ; multiplier Q par 10 baisse E de ln(10) R T / (n F) exactement (verifie sur toute la decharge) ;
//   E decroit. A 298.15 K la pente vaut 29.5797 mV par decade (calcul de Grok).
// Temoin : Q = 1 avec des concentrations de 0.01 mol/L (loin de 1) : E = E0 quand meme. C est le RAPPORT qui compte.
// Dessin (vue de face) : (temps en pas / 600, E / E0) ; etiquette = log10 Q.
function pileDaniell(P, n) {
  const R = SOURCES.NA.valeur * SOURCES.kB.valeur, F = SOURCES.NA.valeur * SOURCES.e.valeur, E0 = SOURCES.E0Cu.valeur - SOURCES.E0Zn.valeur, T = P.kelvins, ne = 2;
  const EdeQ = (Q) => E0 - (R * T / (ne * F)) * lnD(Q), pente = lnD(10) * R * T / (ne * F), Keq = 1 / expNegD(ne * F * E0 / (R * T));
  const pts = []; let cu = P.cuivre, zn = P.zinc, pentesFausses = 0, montees = 0;
  for (let k = 0; k <= 600; k++) { const Q = zn / cu, E = EdeQ(Q); if (k && E > pts[k - 1].E) montees++;
    if (Math.abs((EdeQ(Q) - EdeQ(10 * Q)) - pente) > 1e-12) pentesFausses++; pts.push({ x: k / 600, E, lq: lnD(Q) / lnD(10) });
    const u = Math.max(0, E / E0), d = Math.min(0.004 * u * u * u, cu * 0.5, (Keq * cu - zn) / (Keq + 1)); cu -= d; zn += d; }
  const a298 = lnD(10) * R * 298.15 / (ne * F) * 1000, temoinE = EdeQ(0.01 / 0.01);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const p = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = p.x; brut[o + 1] = p.E / E0; brut[o + 2] = p.lq; }
  return { D: 3, brut, nuage: true, unite: 'V', invariants: {
    pileDaniell: { mesure: pentesFausses + montees, formule: 0, E0, R, F, penteDecade298mV: a298, troisExemples: [[0.01, 0.01], [0.01, 0.001], [0.001, 0.01]].map(([z, c]) => (E0 - (R * 298.15 / (ne * F)) * lnD(z / c)).toFixed(9)).join(' '),
      note: 'discharge steps where multiplying Q by 10 does not lower E by ln(10) R T / n F, or where E goes up (ideal model)' },
    temoin: { mesure: temoinE, formule: E0, note: 'witness: with both ions at 0.01 mol/L (far from 1), Q = 1 and the cell still gives exactly E0: only the ratio matters' } } };
}

// ---------- game222 : la loi d Arrhenius (idee et valeurs : codex Grok Bot 19 ; deux mesures publiees : SOURCES) ----------
// k = A e^(-Ea / R T). Deux points (T1, k1), (T2, k2) donnent Ea = R ln(k2/k1) / (1/T1 - 1/T2) et A = k1 e^(Ea / R T1), R = N_A k_B.
//   (Ea = 159965.618705 J/mol, calcul de Grok ; le cours publie 160 kJ/mol.) Reaction H2 + I2 -> 2 HI d ordre 2, [H2] = [I2] = c au depart :
//   exact c(t) = c0 / (1 + c0 k t). La reaction est INTEGREE pas a pas (RK4, 60 000 pas) sur une fenetre FIXE de 3600 s a la temperature du curseur.
// MESURE : k(T1) = k1 et k(T2) = k2 a 1e-12 relatif ; integration = solution exacte a 1e-9 relatif a chaque pas.
// Temoin : la regle « la vitesse double tous les 10 degres » ne vaut pas ici : a 326 C, k(336 C) / k(326 C) vaut environ 1.69.
// Dessin (vue de face) : (t / 3600 s, c / c0) ; etiquette = part de HI formee.
function arrhenius(P, n) {
  const R = SOURCES.NA.valeur * SOURCES.kB.valeur, T1 = SOURCES.T1arrhenius.valeur + 273.15, T2 = SOURCES.T2arrhenius.valeur + 273.15, k1 = SOURCES.k1arrhenius.valeur, k2 = SOURCES.k2arrhenius.valeur;
  const Ea = R * lnD(k2 / k1) / (1 / T1 - 1 / T2), A = k1 / expNegD(Ea / (R * T1)), kDe = (T) => A * expNegD(Ea / (R * T));
  const T = P.celsius + 273.15, k = kDe(T), c0 = P.concH2;
  let ecarts = (Math.abs(kDe(T1) / k1 - 1) < 1e-12 ? 0 : 1) + (Math.abs(kDe(T2) / k2 - 1) < 1e-12 ? 0 : 1);
  const dt = 3600 / 3000, g = (c) => -k * c * c, pts = []; let c = c0, t = 0;
  for (let i = 0; i <= 3000; i++) { const exact = c0 / (1 + c0 * k * t); if (Math.abs(c - exact) / exact > 1e-9) ecarts++; pts.push([t / 3600, c / c0, 1 - c / c0]);
    for (let sp = 0; sp < 20; sp++) { const h = dt / 20, a = g(c), b = g(c + h * a / 2), d = g(c + h * b / 2), e = g(c + h * d); c += h * (a + 2 * b + 2 * d + e) / 6; t += h; } }
  const temoin = kDe(T1 + 10) / kDe(T1);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [ta, ca, ha] = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = ta; brut[o + 1] = ca; brut[o + 2] = ha; }
  return { D: 3, brut, nuage: true, unite: 'mol/L', invariants: {
    arrhenius: { mesure: ecarts, formule: 0, Ea, A, kCurseur: k, note: 'k off the two published points by more than 1e-12, or step-by-step integration off c0/(1 + c0 k t) by more than 1e-9' },
    temoin: { mesure: temoin, formule: 2, note: 'witness: the rule that rates double every 10 degrees fails here: going from 326 C to 336 C multiplies k by about 1.69' } } };
}

export const COLONNES = Object.freeze({
  arrhenius: { colonnes: ['time / 3600 s', 'H2 left / H2 at start', 'share turned into HI (label)'], memeLongueur: [], autres: [0, 1, 2] },
  pileDaniell: { colonnes: ['time (steps / 600)', 'cell voltage E / E0', 'log10 of the ratio Q (label)'], memeLongueur: [], autres: [0, 1, 2] },
  geometrieVSEPR: { colonnes: ['x (bond lengths)', 'y (same)', 'z (same)'], memeLongueur: [[0, 1, 2]], autres: [] },
  titrageAcideFaible: { colonnes: ['base added / base needed (half scale)', 'pH / 14', 'share of acid still as HA (label)'], memeLongueur: [], autres: [0, 1, 2] },
  reactionsChaine: { colonnes: ['time t', 'share of the molecules (0..1)', 'which species (0 = A, 1 = B, 2 = C)'], memeLongueur: [], autres: [0, 1, 2] },
  equilibreChimique: { colonnes: ['x: well A on the left, well B on the right (placement inside a well is drawn)', 'y (drawn)', 'time t'], memeLongueur: [[0, 1]], autres: [2] },
  brusselator: { colonnes: ['concentration x', 'concentration y', 'time t'], memeLongueur: [[0, 1]], autres: [2] },
  carnot: { colonnes: ['volume V', 'pressure P', 'leg of the cycle (0 hot expansion, 1 cooling, 2 cold compression, 3 heating)'], memeLongueur: [], autres: [0, 1, 2] },
  gazParfait: { colonnes: ['x in the box', 'y in the box', 'speed of the molecule (label)'], memeLongueur: [[0, 1]], autres: [2] },
});

export const SYSTEMES = Object.freeze([
  { id: 'reactionsChaine', nom: 'A chain of reactions A to B to C (Bateman)', science: 'Chemical kinetics', D: 3, params: { molecules: 1000, k1: 1, k2: 0.5, graine: 1 },
    bornes: { molecules: [100, 5000], k1: [0.2, 5], k2: [0.2, 5], graine: [1, 1000000] },
    phrase: 'A visualisation of two reactions in a row, A -> B -> C, molecule by molecule: each A turns into B after a random wait, then B into C. The shares of A, B and C are compared with the exact Bateman solution, and the intermediate B peaks at the exact time t* = ln(k1/k2)/(k1 - k2). A finite number of molecules, so the agreement is statistical.' },
  { id: 'equilibreChimique', nom: 'A reaction going both ways (chemical equilibrium A <-> B)', science: 'Chemical equilibrium', D: 3, nuage: true, params: { molecules: 600, kf: 1, kb: 0.5, graine: 1 },
    bornes: { molecules: [100, 3000], kf: [0.1, 5], kb: [0.1, 5], graine: [1, 1000000] },
    phrase: 'A visualisation of a reversible reaction A <-> B, molecule by molecule, frame by frame: each molecule hops between the two wells at random. The share of B rises as pi (1 - e^(-(kf + kb) t)) and settles where the forward and backward flows balance, at the equilibrium constant K = kf / kb. A finite number of molecules, so the agreement is statistical; the place of a molecule inside its well is drawn.' },
  { id: 'brusselator', nom: 'A chemical clock (the Brusselator)', science: 'Chemical kinetics', D: 3, params: { A: 1, ecartSeuil: -0.5 },
    bornes: { A: [0.5, 2.5], ecartSeuil: [-1, 3] },
    phrase: 'A visualisation of the Brusselator, a model of an oscillating reaction: two concentrations integrated step by step. Below the exact threshold B = 1 + A^2 the reaction settles on the fixed point (A, B/A), spiralling in at the exact rate of its linearisation; above it, it never settles and ticks like a clock on a limit cycle, with a period near 2 pi / A close to the threshold.' },
  { id: 'gazParfait', nom: 'An ideal gas (molecules in a box)', science: 'Thermodynamics', D: 3, nuage: true, params: { molecules: 100, temperature: 1, graine: 1 },
    bornes: { molecules: [20, 400], temperature: [0.2, 5], graine: [1, 1000000] },
    phrase: 'A visualisation of an ideal gas: molecules flying freely in a box and bouncing off its walls, frame by frame, with speeds drawn from Maxwell\'s law at temperature T. Every hit on a wall is counted: the push per unit length is the pressure, and it obeys the ideal gas law P A = N T; the mean speed is the exact sqrt(pi T / 2). Paths are exact (no step-by-step integration); a finite number of molecules, so the agreement with the gas law is statistical.' },
  { id: 'carnot', nom: 'The Carnot cycle (the best possible engine)', science: 'Thermodynamics', D: 3, nuage: true, params: { chaude: 2, liberte: 3, detente: 2 },
    bornes: { chaude: [1.2, 5], liberte: [3, 7], detente: [1.5, 4] },
    phrase: 'A visualisation of the Carnot cycle of an ideal gas in the (V, P) plane: a hot expansion at Th, an expansion without heat down to Tc, a cold compression and a compression back. The area inside is the work; divided by the heat taken in, it is exactly 1 - Tc/Th, whatever the gas.' },
  { id: 'titrageAcideFaible', nom: 'Titrating vinegar acid with lye (acetic acid and NaOH)', science: 'Chemistry', D: 3, nuage: true, params: { acide: 0.1, base: 0.1 },
    bornes: { acide: [0.001, 0.5], base: [0.001, 0.5] },
    phrase: 'A visualisation of a titration: lye is poured into acetic acid and the pH is solved exactly from the charge balance at every drop (ideal solution, pKa and Kw from published tables). Halfway, the pH sits at the pKa of the acid. At the equivalence point the pH is not 7 but higher, since acetate is a base: that is the witness.' },
  { id: 'geometrieVSEPR', nom: 'Molecule shapes (VSEPR) with measured bond angles', science: 'Chemistry', D: 3, nuage: true, params: { molecule: 1 },
    bornes: { molecule: [0, 4] },
    phrase: 'A visualisation of molecule shapes (VSEPR): the electron groups around the central atom push each other as far apart as they can. Five molecules are drawn in 3-D with their bond angles measured by spectroscopy (NIST). Water has four electron groups like methane, yet its angle is about five degrees narrower, because two of the groups are lone pairs: that is the witness.' },
  { id: 'pileDaniell', nom: 'A zinc-copper battery running down (Nernst equation)', science: 'Electrochemistry', D: 3, nuage: true, params: { cuivre: 1, zinc: 0.01, kelvins: 298.15 },
    bornes: { cuivre: [0.01, 2], zinc: [0.001, 1], kelvins: [273.15, 373.15] },
    phrase: 'A visualisation of a Daniell cell (zinc and copper) running down: copper ions plate out, zinc ions pile up, and the voltage follows the Nernst equation at every step, with the gas and Faraday constants built from exact SI values. With both ions at the same low concentration the cell still gives its standard voltage: that is the witness.' },
  { id: 'arrhenius', nom: 'How heat speeds up a reaction (Arrhenius law)', science: 'Chemical kinetics', D: 3, nuage: true, params: { celsius: 380, concH2: 0.1 },
    bornes: { celsius: [300, 450], concH2: [0.01, 1] },
    phrase: 'A visualisation of the Arrhenius law on hydrogen and iodine forming hydrogen iodide: two published rate measurements give the activation energy, and the reaction is run for one hour at the chosen temperature. A little more heat makes it much faster. The classroom rule that rates double every 10 degrees does not hold here: that is the witness.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { reactionsChaine: ['molecules', 'graine'], equilibreChimique: ['molecules', 'graine'], brusselator: [], gazParfait: ['molecules', 'graine'], carnot: ['liberte'], titrageAcideFaible: [], geometrieVSEPR: ['molecule'], pileDaniell: [], arrhenius: [] };
const FONCTIONS = { arrhenius, pileDaniell, geometrieVSEPR, titrageAcideFaible, reactionsChaine, equilibreChimique, brusselator, gazParfait, carnot };
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
  if (r.courbes) o.courbes = r.courbes;
  return o;
}
