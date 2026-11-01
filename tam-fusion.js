// tam-fusion.js -- TAM, vue ASTRO : le signal de fusion de deux trous noirs A SPINS ALIGNES, par des modeles PUBLIES.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-physique.js / tam-astro.js : SYSTEMES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D), lyapunov: null,
//   uniteLyapunov, points: null, invariants }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun Math.random.
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux de tam-moteur.js ; exp, atan, atan2 = COPIES de
//   tam-astro.js (qui ne les exporte pas) ; seulement + - * / Math.sqrt/round/floor/abs/min/max (IEEE exacts).
//
// CE QUE CE MODULE REMPLACE (limites annoncees de tam-astro.js binaireFusion) :
//   (a) le pont de frequence quadratique AD HOC -> le modele phenomenologique IMRPhenomB (Ajith et al. 2011), dont les
//       transitions (f_merg, f_ring, sigma, f_cut) et la phase sont AJUSTEES a la relativite numerique (Table I) ;
//   (b) trous noirs sans spin -> spins alignes chi1, chi2 : spin effectif chi de PhenomB, termes spin-orbite (1.5PN) et
//       spin-spin (2PN) de sa phase, reste final par des ajustements publies a spins alignes (HBR 2016, BMR 2012) ;
//   (c) la relativite numerique complete n est PAS resolue ici (jours de supercalculateur) : le modele est VALIDE contre des
//       nombres publies issus de la RN (voir test-tam-fusion-20261101.mjs). Il reste un modele ajuste, pas une simulation.
//
// CONSTRUCTION TEMPORELLE : PhenomB est defini dans le domaine de Fourier, h(f) = A(f) exp(-i Psi(f)). On en prend la
//   TRANSFORMEE DE FOURIER INVERSE EXACTE (FFT radix 2 deterministe, spectre a frequences positives -> signal analytique
//   z(t) = h+ + i hx face au detecteur). Aucune approximation de phase stationnaire dans le signal dessine ; la phase
//   stationnaire sert seulement a placer la fenetre de temps (t(f) = Psi'(f) / 2 pi) et a la verifier.
//   Seuls choix de CE module : le spectre commence sous fDepart (0.9 a 0.5 fDepart, rampe sin^2 jusqu a fDepart, assez large
//   pour que duree x largeur >= 20 ; fenetrage standard, sinon un debut abrupt sonne) ; la courbe dessinee va de fDepart au pic puis 12 / (pi sigma) au plus apres le pic.
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = 3.141592653589793, DEUX_PI = 6.283185307179586, PI_2 = 1.5707963267948966;
const LN2 = 0.6931471805599453, RAD = PI / 180;

// ---------- arithmetique deterministe (COPIES de tam-astro.js, non exportees la-bas) ----------
function expD(x) { /* e^x avec + - * / seulement (copie de tam-astro.js / tam-physique.js) */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
function atanD(x) { /* copie de tam-astro.js (elle-meme copie de tam-formule.js) */
  if (x !== x) return NaN;
  if (x === Infinity) return PI_2;
  if (x === -Infinity) return -PI_2;
  let s = 1; if (x < 0) { x = -x; s = -1; }
  let inv = false; if (x > 1) { x = 1 / x; inv = true; }
  for (let i = 0; i < 3; i++) x = x / (1 + Math.sqrt(1 + x * x));
  const x2 = x * x; let t = x, r = x;
  for (let k = 1; k <= 15; k++) { t *= -x2; r += t / (2 * k + 1); }
  r *= 8;
  if (inv) r = PI_2 - r;
  return s * r;
}
function atan2D(y, x) { /* copie de tam-astro.js */
  if (y !== y || x !== x) return NaN;
  if (x > 0) return atanD(y / x);
  if (x < 0) return y >= 0 ? atanD(y / x) + PI : atanD(y / x) - PI;
  return y > 0 ? PI_2 : y < 0 ? -PI_2 : 0;
}
const puissance = (x, p) => (x === 0 ? 0 : expD(p * lnD(x))); /* x >= 0 */
const cbrt = (x) => (x === 0 ? 0 : x > 0 ? puissance(x, 1 / 3) : -puissance(-x, 1 / 3));
const ramener = (a) => a - DEUX_PI * Math.round(a / DEUX_PI);

// ---------- constantes physiques (memes valeurs que tam-astro.js) ----------
const GMSOL_SI = 1.32712440018e20, C_SI = 299792458, MPC_M = 3.0856775814913673e22;
const T_SOL = GMSOL_SI / (C_SI * C_SI * C_SI);

// ---------- IMRPhenomB : Ajith et al., PRL 106, 241101 (2011), arXiv:0909.2867 ----------
// LU dans la source LaTeX arXiv (e-print, version de juin 2011) : SpinTempl.tex eq. (1)-(2) et Table I, fichier
//   PhysParFits_v873_130909_nTM1e3_fLow2e-3_PolCoeffs.txt. Recopie colonne par colonne :
//   psi_k     = psi_k^0 + x10 eta + x11 eta chi + x12 eta chi^2 + x20 eta^2 + x21 eta^2 chi + x30 eta^3
//   pi M mu_k = mu_k^0  + y10 eta + y11 eta chi + y12 eta chi^2 + y20 eta^2 + y21 eta^2 chi + y30 eta^3
//   (N = min(3 - i, 2)). Limites masse-test (colonne psi_k^0 / mu_k^0 de la Table I) :
//   psi2^0 = 3715/756 ; psi3^0 = -16 pi + 113 chi / 3 (SPIN-ORBITE 1.5PN) ; psi4^0 = 15293365/508032 - 405 chi^2 / 8
//   (SPIN-SPIN 2PN) ; psi6^0 = psi7^0 = 0 ; f_merg^0 = 1 - 4.455 (1-chi)^0.217 + 3.521 (1-chi)^0.26 ;
//   f_ring^0 = [1 - 0.63 (1-chi)^0.3] / 2 ; sigma^0 = [1 - 0.63 (1-chi)^0.3] (1-chi)^0.45 / 4 ;
//   f_cut^0 = 0.3236 + 0.04894 chi + 0.01346 chi^2. psi5 n est pas dans la Table I (pris nul, comme le modele publie).
//   Amplitude (eq. 1) : alpha2 = -323/224 + 451 eta / 168, alpha3 = (27/8 - 11 eta / 6) chi,
//   eps1 = 1.4547 chi - 1.8897, eps2 = -1.8153 chi + 1.6557 ; w_m, w_r = continuite en f_merg et f_ring.
//   Lorentzienne L(f, f_ring, sigma) = sigma / (2 pi [(f - f_ring)^2 + sigma^2 / 4]) : le texte dit seulement
//   "Lorentzian of width sigma" ; la normalisation (sans effet : w_r la compense) est celle de LALSuite.
//   Domaine recommande par l article : q <~ 10, -0.85 <~ chi <~ 0.85, M f > 1e-3.
//   chi = (1 + delta) chi1 / 2 + (1 - delta) chi2 / 2, delta = (m1 - m2) / M  (= (m1 chi1 + m2 chi2) / M).
export const PHENOMB_X = Object.freeze({ /* [x10, x11, x12, x20, x21, x30] */
  psi2: Object.freeze([-920.9, 492.1, 135, 6742, -1053, -1.34e4]),
  psi3: Object.freeze([1.702e4, -9566, -2182, -1.214e5, 2.075e4, 2.386e5]),
  psi4: Object.freeze([-1.254e5, 7.507e4, 1.338e4, 8.735e5, -1.657e5, -1.694e6]),
  psi6: Object.freeze([-8.898e5, 6.31e5, 5.068e4, 5.981e6, -1.415e6, -1.128e7]),
  psi7: Object.freeze([8.696e5, -6.71e5, -3.008e4, -5.838e6, 1.514e6, 1.089e7]),
});
export const PHENOMB_Y = Object.freeze({ /* [y10, y11, y12, y20, y21, y30] */
  fMerg: Object.freeze([0.6437, 0.827, -0.2706, -0.05822, -3.935, -7.092]),
  fRing: Object.freeze([0.1469, -0.1228, -0.02609, -0.0249, 0.1701, 2.325]),
  sigma: Object.freeze([-0.4098, -0.03523, 0.1008, 1.829, -0.02017, -2.87]),
  fCut: Object.freeze([-0.1331, -0.08172, 0.1451, -0.2714, 0.1279, 4.922]),
});
const poly = (c, eta, chi) => c[0] * eta + c[1] * eta * chi + c[2] * eta * chi * chi + c[3] * eta * eta + c[4] * eta * eta * chi + c[5] * eta * eta * eta;
/** parametres PhenomB sans dimension : psi[k] (k = 0..7) et pi M mu_k */
export function phenomB(eta, chi) {
  const u = 1 - chi, X = PHENOMB_X, Y = PHENOMB_Y;
  const psi = [1, 0,
    3715 / 756 + poly(X.psi2, eta, chi),
    -16 * PI + 113 / 3 * chi + poly(X.psi3, eta, chi),
    15293365 / 508032 - 405 / 8 * chi * chi + poly(X.psi4, eta, chi),
    0,
    poly(X.psi6, eta, chi),
    poly(X.psi7, eta, chi)];
  const r0 = 1 - 0.63 * puissance(u, 0.3);
  return {
    psi,
    fMerg: 1 - 4.455 * puissance(u, 0.217) + 3.521 * puissance(u, 0.26) + poly(Y.fMerg, eta, chi),
    fRing: r0 / 2 + poly(Y.fRing, eta, chi),
    sigma: r0 * puissance(u, 0.45) / 4 + poly(Y.sigma, eta, chi),
    fCut: 0.3236 + 0.04894 * chi + 0.01346 * chi * chi + poly(Y.fCut, eta, chi),
    alpha2: -323 / 224 + 451 / 168 * eta, alpha3: (27 / 8 - 11 / 6 * eta) * chi,
    eps1: 1.4547 * chi - 1.8897, eps2: -1.8153 * chi + 1.6557,
  };
}

// ---------- reste final a spins alignes ----------
// Spin : Hofmann, Barausse & Rezzolla, ApJL 825, L19 (2016), arXiv:1605.01938 -- LU dans la source LaTeX (paper.tex) :
//   eq. (new_ansatz) a_fin = a_tot + nu [L_ISCO(a_eff) - 2 a_tot (E_ISCO(a_eff) - 1)] + sum_{i<=nM} sum_{j<=nJ} k_ij nu^(2+i) a_eff^j,
//   a_tot = (a1 + a2 q^2) / (1 + q)^2 (q = M2/M1 <= 1), a_eff = a_tot + xi nu (a1 + a2) ; Table "table_coeffs", bloc du haut
//   (nM = 1, nJ = 2, le choix optimal selon l article) : k01 = -1.2019, k02 = -1.20764, k10 = 3.79245, k11 = 1.18385,
//   k12 = 4.90494, xi = 0.41616 ; k00 IMPOSE par la contrainte sqrt(3)/2 + sum_i k_i0 / 4^(2+i) = 0.68646 (Scheel 2009)
//   -> k00 = 16 (0.68646 - sqrt(3)/2 - k10 / 64) = -3.8212 (l article ecrit "k00 ~ -3.82"). rms des residus 0.00198.
//   E_ISCO, L_ISCO, r_ISCO (Bardeen, Press & Teukolsky 1972) : eqs. (eisco)-(lisco) du meme article.
export const HBR = Object.freeze({ k01: -1.2019, k02: -1.20764, k10: 3.79245, k11: 1.18385, k12: 4.90494, xi: 0.41616, contrainte: 0.68646 });
const K00 = 16 * (HBR.contrainte - Math.sqrt(3) / 2 - HBR.k10 / 64);
// Masse : Barausse, Morozova & Rezzolla, ApJ 758, 63 (2012), arXiv:1206.3803 -- LU dans la source LaTeX (paper.tex) :
//   eq. (final_eq1) E_rad / M = [1 - E_ISCO(a~)] nu + 4 nu^2 [4 p0 + 16 p1 a~ (a~ + 1) + E_ISCO(a~) - 1], a~ = a_tot,
//   eq. (fitting_parameters) p0 = 0.04827 +- 0.00039, p1 = 0.01707 +- 0.00032 (ajuste aux simulations RN egales masses).
export const BMR = Object.freeze({ p0: 0.04827, p1: 0.01707 });
function rIsco(a) {
  const Z1 = 1 + cbrt(1 - a * a) * (cbrt(1 + a) + cbrt(1 - a)), Z2 = Math.sqrt(3 * a * a + Z1 * Z1);
  return 3 + Z2 - (a >= 0 ? 1 : -1) * Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2));
}
const eIsco = (a) => Math.sqrt(1 - 2 / (3 * rIsco(a)));
const lIsco = (a) => 2 / (3 * Math.sqrt(3)) * (1 + 2 * Math.sqrt(3 * rIsco(a) - 2));
/** reste final : masse en unites de la masse totale, spin final (projection sur L) */
export function resteAligne(m1, m2, a1, a2) {
  if (m2 > m1) { const t = m1; m1 = m2; m2 = t; const s = a1; a1 = a2; a2 = s; }
  const q = m2 / m1, nu = q / ((1 + q) * (1 + q)), aTot = (a1 + a2 * q * q) / ((1 + q) * (1 + q)), aEff = aTot + HBR.xi * nu * (a1 + a2);
  const n2 = nu * nu, n3 = n2 * nu;
  const chi = aTot + nu * (lIsco(aEff) - 2 * aTot * (eIsco(aEff) - 1))
    + n2 * (K00 + HBR.k01 * aEff + HBR.k02 * aEff * aEff) + n3 * (HBR.k10 + HBR.k11 * aEff + HBR.k12 * aEff * aEff);
  const E = eIsco(aTot), Erad = (1 - E) * nu + 4 * n2 * (4 * BMR.p0 + 16 * BMR.p1 * aTot * (aTot + 1) + E - 1);
  return { chi, Erad, Mf: 1 - Erad, nu, aTot, aEff };
}
// Mode l = m = 2, n = 0 : Berti, Cardoso & Will, PRD 73, 064030 (2006), Table 8 -- coefficients COPIES de tam-astro.js
//   (BCW_220, lus la-bas) : M_f omega = f1 + f2 (1 - j)^f3, Q = q1 + q2 (1 - j)^q3. |j| : un reste a spin oppose a L
//   (non atteint dans les bornes ici) sonnerait dans le mode co-rotatif de meme |j|.
export const BCW_220 = Object.freeze({ f1: 1.5251, f2: -1.1568, f3: 0.1292, q1: 0.7000, q2: 1.4187, q3: -0.4990 });
export function qnm220(j) {
  const u = 1 - Math.min(0.9999, Math.abs(j));
  const F = BCW_220.f1 + BCW_220.f2 * puissance(u, BCW_220.f3), Q = BCW_220.q1 + BCW_220.q2 * puissance(u, BCW_220.q3);
  return { MfOmega: F, Q };
}

// ---------- FFT inverse deterministe (radix 2, tables par sinD/cosD) ----------
function fftInverse(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  const C = new Float64Array(N >> 1), S = new Float64Array(N >> 1);
  for (let k = 0; k < N >> 1; k++) { const a = DEUX_PI * k / N; C[k] = cosD(a); S[k] = sinD(a); }
  for (let len = 2; len <= N; len <<= 1) {
    const moitie = len >> 1, pas = N / len;
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < moitie; k++) {
        const wr = C[k * pas], wi = S[k * pas], a = i + k, b = a + moitie;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
}

// ---------- le signal ----------
const RAMPE = 0.5, RAMPE_TB = 20, FIN_TAU = 12, F_NEWTON = 0.01, SEUIL_FIN = 1e-3, N_MAX = 1 << 21;
function fusionTrousNoirs(P, n) {
  const ms = P.m1 + P.m2, eta = P.m1 * P.m2 / (ms * ms), chi = (P.m1 * P.chi1 + P.m2 * P.chi2) / ms;
  const Md = ms * (1 + P.z), M = Md * T_SOL, Dsec = P.distance * MPC_M / C_SI; /* masse et distance en secondes */
  const ph = phenomB(eta, chi), psi = ph.psi, piM = PI * M;
  const fMerg = ph.fMerg / piM, fRing = ph.fRing / piM, sigma = ph.sigma / piM, fCut = ph.fCut / piM;
  if (!(fMerg > 0 && fRing > fMerg && fCut > fRing && sigma > 0)) return null;
  const fLo = Math.min(P.fDepart, 0.5 * fMerg);
  /* phase de Fourier sans le terme 2 pi f t0 + phi0 ; temps de phase stationnaire tau(f) = Psi'(f) / 2 pi ; Psi'' */
  const vDe = (f) => cbrt(piM * f);
  const psiF = (f) => { const v = vDe(f), v2 = v * v; let s = 0, vk = 1; for (let k = 0; k <= 7; k++) { s += psi[k] * vk; vk *= v; } return 3 / (128 * eta * v2 * v2 * v) * s; };
  const tauF = (f) => { const v = vDe(f); let s = 0, vk = 1 / (v * v * v * v * v); for (let k = 0; k <= 7; k++) { s += (k - 5) * psi[k] * vk; vk *= v; } return s / (256 * PI * eta * f); };
  const psi2F = (f) => { const v = vDe(f); let s = 0, vk = 1 / (v * v * v * v * v); for (let k = 0; k <= 7; k++) { s += (k - 5) * (k - 8) * psi[k] * vk; vk *= v; } return s / (384 * eta * f * f); };
  /* amplitude de Fourier, normalisee (C) sur l amplitude quadrupolaire face au detecteur :
     |h(f)| = sqrt(5 eta / 24) pi^(-2/3) M^(5/6) f^(-7/6) / D en debut de spirale (C f_merg^(-7/6) f'^(-7/6) = C f^(-7/6)) */
  const Camp = Math.sqrt(5 * eta / 24) * puissance(PI, -2 / 3) * puissance(M, 5 / 6) / Dsec;
  const vm = vDe(fMerg), vr = vDe(fRing);
  const wm = (1 + ph.alpha2 * vm * vm + ph.alpha3 * vm * vm * vm) / (1 + ph.eps1 * vm + ph.eps2 * vm * vm);
  const lor = (f) => sigma / (DEUX_PI * ((f - fRing) * (f - fRing) + sigma * sigma / 4));
  const wr = wm * puissance(fRing / fMerg, -2 / 3) * (1 + ph.eps1 * vr + ph.eps2 * vr * vr) / lor(fRing);
  const ampF = (f) => {
    if (f >= fCut) return 0;
    const v = vDe(f), fp = f / fMerg, base = Camp * puissance(fMerg, -7 / 6);
    if (f < fMerg) return base * puissance(fp, -7 / 6) * (1 + ph.alpha2 * v * v + ph.alpha3 * v * v * v);
    if (f < fRing) return base * wm * puissance(fp, -2 / 3) * (1 + ph.eps1 * v + ph.eps2 * v * v);
    return base * wr * lor(f);
  };
  /* fenetre de temps (phase stationnaire) : debut tau(fLo), plus tard max tau sur [fLo, fCut] */
  /* bas de la rampe : le plus haut de 0.9 fLo .. 0.5 fLo tel que (duree de la rampe) x (largeur) >= 20 (rampe adiabatique) */
  let fBas = RAMPE * fLo;
  for (let r = 0.9; r > RAMPE; r -= 0.05) if ((tauF(fLo) - tauF(r * fLo)) * (1 - r) * fLo >= RAMPE_TB) { fBas = r * fLo; break; }
  const tDebut = tauF(fBas); let tPlusTard = tDebut;
  for (let i = 0; i <= 400; i++) { const t = tauF(fBas * puissance(fCut / fBas, i / 400)); if (t > tPlusTard) tPlusTard = t; }
  const tauRing = 1 / (PI * sigma), etendue = tPlusTard - tDebut;
  if (!(etendue > 0 && Number.isFinite(etendue))) return null;
  const avant = 0.05 * etendue + 20 * tauRing, apres = 0.1 * etendue + 80 * tauRing;
  const fs = 2.5 * fCut; let N = 1024; while (N < (avant + etendue + apres) * fs) N <<= 1;
  if (N > N_MAX) return null;
  const dt = 1 / fs, df = fs / N, t0 = avant - tDebut;
  /* spectre a frequences positives -> z(t) = 2 df sum_k h(f_k) e^{2 pi i f_k t} */
  const re = new Float64Array(N), im = new Float64Array(N);
  const k0 = Math.ceil(fBas / df), k1 = Math.min(N - 1, Math.floor(fCut / df));
  for (let k = k0; k <= k1; k++) {
    const f = k * df; let A = ampF(f);
    if (f < fLo) { const s = sinD(PI_2 * (f - fBas) / (fLo - fBas)); A *= s * s; }
    const phase = ramener(-(DEUX_PI * f * t0 + psiF(f))); /* h(f) = A e^{-i Psi} */
    re[k] = 2 * df * A * cosD(phase); im[k] = 2 * df * A * sinD(phase);
  }
  fftInverse(re, im);
  /* debut dessine : temps de phase stationnaire de fLo ; pic : |z| maximal ; fin : |z| < 1e-3 du pic, au plus 12 / (pi sigma) apres le pic */
  const iDebut = Math.max(1, Math.round((t0 + tauF(fLo)) / dt));
  let iPic = iDebut, aPic = 0;
  const amp = new Float64Array(N);
  for (let j = 0; j < N; j++) amp[j] = Math.sqrt(re[j] * re[j] + im[j] * im[j]);
  for (let j = iDebut; j < N - 1; j++) if (amp[j] > aPic) { aPic = amp[j]; iPic = j; }
  let iFin = iPic; const iMax = Math.min(N - 2, iPic + Math.ceil(FIN_TAU * tauRing / dt)); while (iFin < iMax && amp[iFin] > SEUIL_FIN * aPic) iFin++;
  if (!(aPic > 0) || iFin - iPic < 4 || iPic - iDebut < 4) return null;
  /* phase deroulee sur [iDebut - 1, iFin + 1] */
  const j0 = iDebut - 1, L = iFin + 2 - j0, phi = new Float64Array(L);
  phi[0] = atan2D(im[j0], re[j0]);
  for (let j = 1; j < L; j++) {
    const a = j0 + j, b = a - 1;
    phi[j] = phi[j - 1] + atan2D(im[a] * re[b] - re[a] * im[b], re[a] * re[b] + im[a] * im[b]);
  }
  const fInst = (j) => (phi[j - j0 + 1] - phi[j - j0 - 1]) / (2 * DEUX_PI * dt);
  /* echantillonnage : 3/4 des points a pas de phase egaux jusqu au pic, 1/4 a pas de temps egaux ensuite */
  const ci = cosD(P.inclinaison * RAD), fp = (1 + ci * ci) / 2, D = 4, brut = new Float64Array(n * D);
  const nR = Math.max(1, Math.round(n / 4)), nI = n - nR;
  const ecrire = (i, x) => { /* x = position fractionnaire d echantillon */
    const j = Math.min(iFin, Math.max(iDebut, Math.floor(x))), u = Math.min(1, Math.max(0, x - j));
    const A = amp[j] + u * (amp[j + 1] - amp[j]), p = phi[j - j0] + u * (phi[j + 1 - j0] - phi[j - j0]);
    const fr = fInst(j) + u * (fInst(Math.min(iFin, j + 1)) - fInst(j)), o = i * D;
    brut[o] = (x - iPic) * dt; brut[o + 1] = A * fp * cosD(ramener(p)) * 1e21; brut[o + 2] = A * ci * sinD(ramener(p)) * 1e21; brut[o + 3] = fr;
  };
  const pD = phi[iDebut - j0], pP = phi[iPic - j0];
  let j = iDebut;
  for (let i = 0; i < nI; i++) {
    const cible = nI > 1 ? pD + (pP - pD) * i / (nI - 1) : pP;
    while (j < iPic && phi[j + 1 - j0] < cible) j++;
    const a = phi[j - j0], b = phi[j + 1 - j0];
    ecrire(i, j + (b > a ? Math.min(1, Math.max(0, (cible - a) / (b - a))) : 0));
  }
  for (let k = 1; k <= nR; k++) ecrire(nI + k - 1, iPic + (iFin - iPic) * k / nR);
  /* frequence mesuree de la sonnerie : moyenne de f instantanee la ou |z| est entre 30 % et 3 % du pic, apres le pic */
  let sF = 0, cF = 0;
  for (let jj = iPic + 1; jj < iFin; jj++) if (amp[jj] < 0.3 * aPic && amp[jj] > 0.03 * aPic) { sF += fInst(jj); cF++; }
  /* verification phase stationnaire au debut de spirale : |z| et f instantanee contre 2 A(f) sqrt(fdot) a f = 1.5 fLo */
  const fV = 1.5 * fLo, jV = Math.round((t0 + tauF(fV)) / dt), fdotV = DEUX_PI / psi2F(fV);
  const spa = (jV > iDebut && jV < iPic) ? { f: fV, ampMesure: amp[jV], ampPhaseStationnaire: 2 * ampF(fV) * Math.sqrt(fdotV), fMesure: fInst(jV) } : null;
  /* limite newtonienne mesuree sur la phase codee : fdot = 2 pi / Psi'' par difference seconde finie a f = 0.01 Hz */
  const hN = 1e-3 * F_NEWTON, d2 = (psiF(F_NEWTON + hN) - 2 * psiF(F_NEWTON) + psiF(F_NEWTON - hN)) / (hN * hN);
  const Mc = M * puissance(eta, 0.6), newton = 96 / 5 * puissance(PI, 8 / 3) * puissance(Mc, 5 / 3) * puissance(F_NEWTON, 11 / 3);
  const rest = resteAligne(P.m1, P.m2, P.chi1, P.chi2), qn = qnm220(rest.chi), MfSec = rest.Mf * M;
  const fQnm = qn.MfOmega / (DEUX_PI * MfSec), tauQnm = 2 * qn.Q / (qn.MfOmega / MfSec);
  return { brut, invariants: {
    masseChirp: { mesure: ms * puissance(eta, 0.6), observee: ms * puissance(eta, 0.6) * (1 + P.z), unite: 'masses solaires (source)' },
    spins: { eta, chiEffectif: chi, horsCalibration: Math.abs(chi) > 0.85 || Math.max(P.m1, P.m2) / Math.min(P.m1, P.m2) > 10 || piM * fLo / PI < 1e-3, definition: 'chi = (m1 chi1 + m2 chi2) / M (PhenomB)' },
    phenomB: { fMerg, fRing, sigma, fCut, fDepartEffectif: fLo, psi: psi.slice(), unite: 'Hz (detecteur)', source: 'Ajith et al. 2011, PRL 106 241101, arXiv:0909.2867, Table I' },
    resteFinal: { masse: ms * rest.Mf, spin: rest.chi, energieRayonnee: ms * rest.Erad, unite: 'masses solaires (source), spin sans dimension', source: 'spin : Hofmann, Barausse & Rezzolla 2016 (arXiv:1605.01938, nM = 1, nJ = 2) ; masse : Barausse, Morozova & Rezzolla 2012 (arXiv:1206.3803)' },
    ringdown: { frequence: fQnm, tempsAmortissement: tauQnm * 1e3, qualite: qn.Q, MfOmega: qn.MfOmega, fRingPhenomB: fRing, rapportPhenomBSurQnm: fRing / fQnm, frequenceMesuree: cF ? sF / cF : NaN, unite: 'Hz (detecteur), ms', source: 'Berti, Cardoso & Will 2006, Table 8, sur le reste HBR/BMR' },
    signal: { cycles: (pP - pD) / DEUX_PI, duree: (iPic - iDebut) * dt, fDebut: fLo, fPic: fInst(iPic), fFinDessin: fInst(iFin), strainMax: aPic, unite: 'cycles d onde (de fDepart au pic), s, Hz, sans dimension' },
    phaseStationnaire: spa,
    limiteNewton: { f: F_NEWTON, mesure: DEUX_PI / d2, formule: newton, ecart: Math.abs(DEUX_PI / d2 - newton) / newton, unite: 'Hz/s' },
    fft: { N, fs, df, dt },
  } };
}

// ---------- catalogue ----------
export const SYSTEMES = Object.freeze([
  { id: 'fusionTrousNoirs', nom: 'Spinning black hole merger (IMRPhenomB)', science: 'Gravitational waves', D: 4,
    params: { m1: 36, m2: 29, chi1: 0, chi2: 0, z: 0.09, distance: 410, inclinaison: 0, fDepart: 20 },
    bornes: { m1: [5, 100], m2: [5, 100], chi1: [-0.9, 0.9], chi2: [-0.9, 0.9], z: [0, 1], distance: [10, 5000], inclinaison: [0, 180], fDepart: [10, 40] },
    phrase: 'The gravitational-wave signal of two black holes with spins aligned or anti-aligned with the orbit (source-frame masses in solar masses, spins chi1 and chi2 from -0.9 to 0.9, redshift z, distance in Mpc, tilt in degrees, starting frequency in Hz), from IMRPhenomB (Ajith et al. 2011): a phenomenological inspiral-merger-ringdown model fitted to numerical relativity, turned into a time signal by an exact inverse Fourier transform; remnant spin from Hofmann, Barausse & Rezzolla 2016, remnant mass from Barausse, Morozova & Rezzolla 2012, l = m = 2 ringing from Berti 2006. It is a phenomenological model fitted to numerical relativity, not a numerical-relativity simulation; no precession, mass ratio held at 10 or less. Drawn as time from the peak (s), h+ and hx (x 1e21, no detector response) and wave frequency (Hz).' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
const parId = (id) => { const s = SYSTEMES.find((x) => x.id === id); if (!s) throw new Error('systeme inconnu: ' + id); return s; };

/** params bornes : non fini -> defaut ; hors bornes -> ramene ; rapport de masses ramene a 10 au plus (domaine de PhenomB) */
function borner(id, params) {
  const s = parId(id), P = {};
  for (const k of Object.keys(s.params)) {
    let v = Number(params && params[k]); if (!Number.isFinite(v)) v = s.params[k];
    const [a, b] = s.bornes[k]; v = Math.min(b, Math.max(a, v));
    P[k] = v;
  }
  if (P.m1 > 10 * P.m2) P.m2 = P.m1 / 10; else if (P.m2 > 10 * P.m1) P.m1 = P.m2 / 10;
  return P;
}

export function reglagesPhysique(id, params = {}) {
  const s = parId(id), P = borner(id, params);
  return Object.keys(s.params).map((k) => ({ chemin: 'params.' + k, nom: k, min: s.bornes[k][0], max: s.bornes[k][1], valeur: P[k] }));
}

const UNITE = 'sans objet (signal deterministe)';
export function simuler(id, params = {}, { n = 1500 } = {}) {
  const s = parId(id), P = borner(id, params);
  n = Math.max(2, Math.floor(n));
  const echec = (raison) => ({ params: P, D: s.D, n, bornee: false, echappeA: -1, raison, brut: null, lyapunov: NaN, uniteLyapunov: UNITE, points: null, invariants: null });
  const r = fusionTrousNoirs(P, n);
  if (!r) return echec('modele hors domaine (frequences de transition non ordonnees ou fenetre trop longue)');
  for (let i = 0; i < r.brut.length; i++) if (!Number.isFinite(r.brut[i])) return echec('NaN');
  return { params: P, D: s.D, n, bornee: true, brut: r.brut, lyapunov: null, uniteLyapunov: UNITE, points: null, invariants: r.invariants };
}
