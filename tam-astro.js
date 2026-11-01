// tam-astro.js -- TAM, la vue ASTRO : les etoiles, les planetes et les trous noirs de NOTRE espace, simules honnetement.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-physique.js : SYSTEMES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (nombre | null), uniteLyapunov, points: null, invariants, nuage? } -> la vue 3-D la dessine sans changement.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun Math.random (graines : mulberry32).
// DETERMINISME : aucune fonction transcendante native (la norme JS ne fixe pas leurs bits). sin/cos/ln = ceux du moteur ;
//   exp, atan, atan2, puissance = ici avec + - * / et Math.sqrt/round/floor/abs (IEEE exacts). Puissances entieres = produits.
// Invariants : { debut, fin, derive, min, max } (suivis point par point, derive = ecart MAX relatif si |debut| > 1e-9)
//   ou { mesure, formule, ecart, ... } (une grandeur MESUREE sur la simulation contre la valeur de la physique connue).
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = 3.141592653589793, DEUX_PI = 6.283185307179586, PI_2 = 1.5707963267948966;
const LN2 = 0.6931471805599453, LN10 = 2.302585092994046;
const RAD = PI / 180, ARCMIN = 10800 / PI;
const ANGLE_OR = 2.399963229728653, NOMBRE_OR = 0.6180339887498949;
const D0 = 1e-8;

// ---------- arithmetique deterministe ----------
function expD(x) { /* e^x avec + - * / seulement (meme fonction que tam-physique.js) */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
function atanD(x) { /* copie de tam-formule.js : reduction |x| > 1, trois demi-angles, serie de Taylor */
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
function atan2D(y, x) {
  if (y !== y || x !== x) return NaN;
  if (x > 0) return atanD(y / x);
  if (x < 0) return y >= 0 ? atanD(y / x) + PI : atanD(y / x) - PI;
  return y > 0 ? PI_2 : y < 0 ? -PI_2 : 0;
}
const puissance = (x, p) => expD(p * lnD(x)); /* x > 0 */
const ramener = (a) => a - DEUX_PI * Math.round(a / DEUX_PI); /* angle dans [-pi, pi] */
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* suivi d invariants point par point : { debut, fin, derive, min, max } (meme definition que tam-physique.js) */
function suiveur() {
  const inv = {};
  return {
    noter(v) {
      for (const k of Object.keys(v)) {
        const x = v[k], I = inv[k] || (inv[k] = { debut: x, fin: x, ecart: 0, min: x, max: x, somme: 0, compte: 0 });
        I.fin = x; if (x < I.min) I.min = x; if (x > I.max) I.max = x; I.somme += x; I.compte++;
        const d = Math.abs(x - I.debut); if (d > I.ecart || !(d === d)) I.ecart = d;
      }
    },
    fini() {
      const o = {};
      for (const k of Object.keys(inv)) { const I = inv[k]; o[k] = { debut: I.debut, fin: I.fin, derive: Math.abs(I.debut) > 1e-9 ? I.ecart / Math.abs(I.debut) : I.ecart, min: I.min, max: I.max, moyenne: I.somme / I.compte }; }
      return o;
    },
  };
}
/* disposition d un FILM mesuree sur les lignes : debuts[k] = premiere ligne de l image k ; parImage = nombre de lignes par
   image s il est le meme pour toutes, sinon null (alors seules les bornes debuts font foi) */
function filmDe(debuts, n) {
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}
const echec = (P, D, n, i, raison, unite) => ({ params: P, D, n, bornee: false, echappeA: i, raison, brut: null, lyapunov: NaN, uniteLyapunov: unite, points: null, invariants: null });
const fini = (b) => { for (let i = 0; i < b.length; i++) if (!Number.isFinite(b[i])) return false; return true; };
/* RK4 a tampons propres ; f(y, d) ecrit la derivee */
function fabriquerRK4(m, f) {
  const k1 = new Float64Array(m), k2 = new Float64Array(m), k3 = new Float64Array(m), k4 = new Float64Array(m), t = new Float64Array(m);
  return (y, h) => {
    f(y, k1); for (let i = 0; i < m; i++) t[i] = y[i] + 0.5 * h * k1[i];
    f(t, k2); for (let i = 0; i < m; i++) t[i] = y[i] + 0.5 * h * k2[i];
    f(t, k3); for (let i = 0; i < m; i++) t[i] = y[i] + h * k3[i];
    f(t, k4); for (let i = 0; i < m; i++) y[i] += h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  };
}
/* equation de Kepler M = E - e sin E (Newton, nombre d iterations FIXE : memes octets partout) */
function kepler(M, e) {
  let E = e < 0.8 ? M : (M >= 0 ? PI : -PI);
  for (let k = 0; k < 16; k++) E += (M - E + e * sinD(E)) / (1 - e * cosD(E));
  return E;
}

// ---------- 1 : systeme solaire (orbites kepleriennes, elements moyens J2000) ----------
// Source : E. M. Standish & J. G. Williams (1992), JPL Solar System Dynamics, « Approximate Positions of the Planets »,
//   Table 1 (valide 1800-2050), ecliptique et equinoxe moyens J2000. Par planete : a (UA), e, I, L, varpi, Omega (degres),
//   puis leurs taux par siecle julien. « EM Bary » = barycentre Terre-Lune (appele Earth ici).
// Periodes siderales connues (jours) : NASA Planetary Fact Sheet.
const PLANETES = [
  ['Mercury', [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081], 87.969],
  ['Venus', [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418], 224.701],
  ['Earth', [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0], 365.256],
  ['Mars', [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], 686.980],
  ['Jupiter', [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], 4332.589],
  ['Saturn', [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], 10759.22],
  ['Uranus', [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589], 30685.4],
  ['Neptune', [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664], 60189],
];
const JOURS_KEPLER = 365.2568983; /* 2 pi / k (constante de Gauss k = 0.01720209895) : P[jours] = 365.2569 a^1.5 */
/* position heliocentrique ecliptique J2000 (UA) de la planete p a t annees juliennes apres J2000 */
function positionPlanete(p, t, o, i) {
  const b = p[1], r = p[2], T = t / 100;
  const a = b[0] + r[0] * T, e = b[1] + r[1] * T, I = (b[2] + r[2] * T) * RAD, L = (b[3] + r[3] * T) * RAD;
  const vp = (b[4] + r[4] * T) * RAD, Om = (b[5] + r[5] * T) * RAD, w = vp - Om;
  const E = kepler(ramener(L - vp), e);
  const xp = a * (cosD(E) - e), yp = a * Math.sqrt(1 - e * e) * sinD(E);
  const cw = cosD(w), sw = sinD(w), cO = cosD(Om), sO = sinD(Om), cI = cosD(I), sI = sinD(I);
  o[i] = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  o[i + 1] = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  o[i + 2] = sw * sI * xp + cw * sI * yp;
}
/* periode siderale MESUREE : retours de la longitude ecliptique a sa valeur de depart (sens direct seulement),
   balayage fin (P/64) puis bissection sur la position analytique ; periode = t_K / K */
function mesurerPeriode(p, annees) {
  const q = [0, 0, 0], lon = (t) => { positionPlanete(p, t, q, 0); return atan2D(q[1], q[0]); };
  const l0 = lon(0), pas = Math.sqrt(p[1][0] * p[1][0] * p[1][0]) / 64, m = Math.ceil(annees / pas), h = annees / m;
  let L = 0, lp = l0, tK = NaN, K = 0;
  for (let s = 1; s <= m; s++) {
    const t = s * h, l = lon(t), Ln = L + ramener(l - lp);
    if (Ln >= DEUX_PI * (K + 1) && L < DEUX_PI * (K + 1)) {
      const cible = DEUX_PI * (K + 1), Lb = L, lb = lp; let lo = t - h, hi = t;
      for (let k = 0; k < 50; k++) { const mi = (lo + hi) / 2; if (Lb + ramener(lon(mi) - lb) >= cible) hi = mi; else lo = mi; }
      K++; tK = (lo + hi) / 2;
    }
    L = Ln; lp = l;
  }
  return { jours: K ? tK / K * 365.25 : NaN, orbites: K };
}
function systemeSolaire(P, n) {
  const choix = P.groupe ? PLANETES.slice(4, 8) : PLANETES.slice(0, 4), D = 12, brut = new Float64Array(n * D), S = suiveur();
  for (let i = 0; i < n; i++) {
    const t = P.annees * i / (n - 1), v = {};
    for (let k = 0; k < 4; k++) {
      const o = i * D + 3 * k; positionPlanete(choix[k], t, brut, o);
      v['distance' + choix[k][0]] = Math.sqrt(brut[o] * brut[o] + brut[o + 1] * brut[o + 1] + brut[o + 2] * brut[o + 2]);
    }
    S.noter(v);
  }
  const inv = S.fini();
  for (const p of choix) {
    const m = mesurerPeriode(p, P.annees), a = p[1][0], kep = JOURS_KEPLER * a * Math.sqrt(a);
    inv['periode' + p[0]] = { mesure: m.jours, formule: kep, connue: p[3], ecart: Math.abs(m.jours - kep) / kep, ecartConnue: Math.abs(m.jours - p[3]) / p[3], orbites: m.orbites, unite: 'jours (siderale)' };
  }
  return { brut, invariants: inv };
}

// ---------- 2 : l etoile S2 autour de Sagittarius A* ----------
// Orbite publiee : GRAVITY Collaboration (2020), A&A 636, L5, « Detection of the Schwarzschild precession in the orbit of
//   the star S2 near the Galactic centre massive black hole », arXiv:2004.07187.
//   SOURCE LUE (2026-11-01) : https://arxiv.org/html/2004.07187v1 , Appendix E, « Table 1: Best-fit orbit parameters »
//   (elements osculateurs ; omega et t_peri a l epoque du dernier apocentre, 2010). Valeurs COPIEES du tableau (fit error) :
//   f_SP = 1.10 (0.19) ; M = 4.261 (0.012) e6 masses solaires ; R0 = 8246.7 (9.3) pc ; a = 125.058 (0.041) mas ;
//   e = 0.884649 (0.000066) ; i = 134.567 (0.033) deg ; omega = 66.263 (0.031) deg ; Omega = 228.171 (0.031) deg ;
//   P = 16.0455 (0.0013) an ; t_peri = 2018.37900 (0.00016) an. (Le texte adopte R0 = 8249 +- 9 +- 45 pc ; on garde le
//   meilleur ajustement du tableau.) Ces valeurs etaient deja celles du module : la relecture de la source n a rien change.
//   (coherence : a^3 / P^2 = 4.26e6 masses solaires en UA / an, Kepler.)
// Unites : UA, annee julienne, GM = 4 pi^2 M[masses solaires]. Mouvement 1PN d une particule test (jauge harmonique) :
//   a = -GM n / r^2 + GM / (c^2 r^2) [ (4 GM / r - v^2) n + 4 (n.v) v ]  -> precession 6 pi GM / (c^2 a (1 - e^2)) par orbite.
const S2 = Object.freeze({ aMas: 125.058, R0: 8246.7, e: 0.884649, P: 16.0455, i: 134.567, om: 66.263, Om: 228.171, M: 4.261e6, tPeri: 2018.379, fSP: 1.10, fSPerr: 0.19 });
const C_UA_AN = 299792.458 * 31557600 / 149597870.7;
const ETA_S2 = 0.002;
function etoileS2(P, n) {
  const GM = 4 * PI * PI * S2.M, c2 = C_UA_AN * C_UA_AN, a = S2.aMas * 1e-3 * S2.R0, e = S2.e, g = P.rg, rgM = GM / c2;
  const Pk = DEUX_PI * Math.sqrt(a * a * a / GM), duree = P.tours * Pk, sGM = Math.sqrt(GM);
  const f = (y, d) => {
    const x = y[0], yy = y[1], vx = y[2], vy = y[3], r2 = x * x + yy * yy, r = Math.sqrt(r2), v2 = vx * vx + vy * vy, nv = (x * vx + yy * vy) / r;
    const k = GM / (r2 * r); let ax = -k * x, ay = -k * yy;
    if (g) {
      const f = GM / (c2 * r2), A = (4 * GM / r - v2) / r;
      ax += f * (A * x + 4 * nv * vx); ay += f * (A * yy + 4 * nv * vy);
    }
    d[0] = vx; d[1] = vy; d[2] = ax; d[3] = ay;
  };
  const rk4 = fabriquerRK4(4, f);
  /* depart a l apocentre (pericentre selon +x), vitesse newtonienne, sens direct */
  const ra = a * (1 + e), y = Float64Array.from([-ra, 0, 0, -Math.sqrt(GM * (1 - e) / ra)]);
  const lrl = (s) => { const L = s[0] * s[3] - s[1] * s[2], r = Math.sqrt(s[0] * s[0] + s[1] * s[1]); return atan2D(-s[2] * L - GM * s[1] / r, s[3] * L - GM * s[0] / r); };
  const cw = cosD(S2.om * RAD), sw = sinD(S2.om * RAD), cO = cosD(S2.Om * RAD), sO = sinD(S2.Om * RAD), cI = cosD(S2.i * RAD), sI = sinD(S2.i * RAD);
  const invariants = (s) => {
    const r = Math.sqrt(s[0] * s[0] + s[1] * s[1]), v2 = s[2] * s[2] + s[3] * s[3], u = GM / r;
    return {
      energie: v2 / 2 - u + (g ? (0.375 * v2 * v2 + 1.5 * u * v2 + 0.5 * u * u) / c2 : 0),
      momentCinetique: (s[0] * s[3] - s[1] * s[2]) * (1 + (g ? (v2 / 2 + 3 * u) / c2 : 0)),
    };
  };
  const D = 3, brut = new Float64Array(n * D), S = suiveur();
  const sortie = (i) => {
    const x = y[0], yy = y[1], o = i * D;
    brut[o] = (cw * cO - sw * sO * cI) * x + (-sw * cO - cw * sO * cI) * yy;
    brut[o + 1] = (cw * sO + sw * cO * cI) * x + (-sw * sO + cw * cO * cI) * yy;
    brut[o + 2] = sw * sI * x + cw * sI * yy;
    S.noter(invariants(y));
  };
  sortie(0);
  const angles = [lrl(y)], tApo = [0], prec = new Float64Array(4);
  let t = 0, rmin = Infinity, vmax = 0, micro = 0;
  const hOut = duree / (n - 1);
  for (let i = 1; i < n; i++) {
    let reste = hOut;
    while (reste > 0) {
      const r = Math.sqrt(y[0] * y[0] + y[1] * y[1]), pm = ETA_S2 * r * Math.sqrt(r) / sGM;
      const k = Math.ceil(reste / pm - 1e-9), hk = k <= 1 ? reste : reste / k;
      prec.set(y); const rvA = prec[0] * prec[2] + prec[1] * prec[3];
      rk4(y, hk); t += hk; micro++;
      reste = k <= 1 ? 0 : reste - hk;
      const rvB = y[0] * y[2] + y[1] * y[3];
      if (rvA > 0 && rvB <= 0) { /* apocentre franchi : vecteur de Runge-Lenz interpole */
        const fr = rvA / (rvA - rvB), aA = lrl(prec), aB = aA + ramener(lrl(y) - aA);
        angles.push(aA + fr * (aB - aA)); tApo.push(t - hk + fr * hk);
      }
      const rr = Math.sqrt(y[0] * y[0] + y[1] * y[1]), vv = Math.sqrt(y[2] * y[2] + y[3] * y[3]);
      if (rr < rmin) rmin = rr; if (vv > vmax) vmax = vv;
      if (micro > 4e6) return null;
    }
    if (!(Number.isFinite(y[0]) && Number.isFinite(y[2]))) return null;
    sortie(i);
  }
  const dp = []; for (let k = 1; k < angles.length; k++) dp.push(ramener(angles[k] - angles[k - 1]));
  const mesure = dp.length ? dp.reduce((s, x) => s + x, 0) / dp.length * ARCMIN : NaN;
  const formule = g ? 6 * PI * rgM / (a * (1 - e * e)) * ARCMIN : 0, gr = 6 * PI * rgM / (a * (1 - e * e)) * ARCMIN;
  const inv = S.fini();
  inv.precession = { mesure, formule, formuleRG: gr, ecart: formule > 0 ? Math.abs(mesure - formule) / formule : Math.abs(mesure) / gr, orbites: dp.length, unite: 'arcmin par orbite',
    fSP: mesure / gr, fSPmesureGRAVITY: S2.fSP, fSPincertitude: S2.fSPerr, tPeri: S2.tPeri };
  const nP = tApo.length - 1;
  inv.periode = { mesure: nP ? tApo[nP] / nP : NaN, formule: Pk, connue: S2.P, ecart: nP ? Math.abs(tApo[nP] / nP - S2.P) / S2.P : NaN, unite: 'annees' };
  inv.pericentre = { mesure: rmin, formule: a * (1 - e), unite: 'UA' };
  inv.vitesseMax = { mesure: vmax * 149597870.7 / 31557600, fractionDeC: vmax / C_UA_AN, unite: 'km/s' };
  inv.rayonSchwarzschild = { mesure: 2 * rgM, unite: 'UA' };
  return { brut, invariants: inv };
}

// ---------- 3 : binaire de trous noirs qui spirale (emission d ondes gravitationnelles, Peters 1964) ----------
// G = c = M = 1 (M = m1 + m2 ; temps en GM/c^3, distances en GM/c^2). Moyennes orbitales de Peters (1964) :
//   da/dt = -(64/5) eta / (a^3 (1-e^2)^(7/2)) (1 + 73/24 e^2 + 37/96 e^4)
//   de/dt = -(304/15) eta e / (a^4 (1-e^2)^(5/2)) (1 + 121/304 e^2),  eta = m1 m2 / M^2
//   + avance du periastre 1PN moyenne : domega/dt = 3 n / (a (1-e^2)).  Variable independante = anomalie moyenne l (dl/dt = n).
// Arret quand le periastre a (1-e) atteint 6 (orbite circulaire stable la plus interne d une particule test) : la moyenne
//   orbitale n y vaut plus rien (fusion, plongeon), et ce modele s arrete la, honnetement.
const A_FIN = 6, H_L = 0.02;
function bPeters(c) {
  const eta = c.q / ((1 + c.q) * (1 + c.q));
  const f = (y, d) => {
    const a = y[0], e = y[1], s = 1 - e * e, rs = Math.sqrt(s), nm = 1 / (a * Math.sqrt(a)), e2 = e * e;
    const dadt = -(64 / 5) * eta / (a * a * a * s * s * s * rs) * (1 + 73 / 24 * e2 + 37 / 96 * e2 * e2);
    const dedt = -(304 / 15) * eta * e / (a * a * a * a * s * s * rs) * (1 + 121 / 304 * e2);
    d[0] = dadt / nm; d[1] = dedt / nm; d[2] = 3 / (a * s); d[3] = 1; d[4] = 1 / nm;
  };
  return { eta, rk4: fabriquerRK4(5, f) };
}
const constantePeters = (a, e) => a * (1 - e * e) * puissance(e, -12 / 19) * puissance(1 + 121 / 304 * e * e, -870 / 2299);
/* temps de Peters (formule, independante de l integration) entre (a0, e0) et l excentricite finale ef */
function tempsPeters(a0, e0, ef, eta) {
  const beta = 64 / 5 * eta;
  if (e0 < 1e-12) return NaN;
  const c0 = constantePeters(a0, e0), m = 4000, h = (e0 - ef) / m;
  const F = (e) => puissance(e, 29 / 19) * puissance(1 + 121 / 304 * e * e, 1181 / 2299) / ((1 - e * e) * Math.sqrt(1 - e * e));
  let s = F(ef) + F(e0); for (let k = 1; k < m; k++) s += (k % 2 ? 4 : 2) * F(ef + k * h);
  return 12 / 19 * c0 * c0 * c0 * c0 / beta * s * h / 3;
}
function binaireTrouNoir(P, n) {
  const { eta, rk4 } = bPeters(P), rp = (y) => y[0] * (1 - y[1]);
  const ok = (y) => Number.isFinite(y[0]) && Number.isFinite(y[1]) && y[1] >= 0 && y[1] < 0.999 && y[0] > 0;
  /* passe 1 : anomalie moyenne totale jusqu a l arret (dernier pas affine par bissection) */
  let y = Float64Array.from([P.a0, P.e0, 0, 0, 0]), lTot = 0, pas = 0;
  const s = new Float64Array(5);
  for (;;) {
    s.set(y); rk4(y, H_L);
    if (!ok(y)) return null;
    if (rp(y) <= A_FIN) {
      let lo = 0, hi = H_L;
      for (let k = 0; k < 60; k++) { const mi = (lo + hi) / 2; y.set(s); rk4(y, mi); if (rp(y) <= A_FIN) hi = mi; else lo = mi; }
      lTot += hi; break;
    }
    lTot += H_L;
    if (++pas > 2e6) return null;
  }
  /* passe 2 : n points a pas d anomalie moyenne egaux */
  y = Float64Array.from([P.a0, P.e0, 0, 0, 0]);
  const D = 4, brut = new Float64Array(n * D), S = suiveur(), dl = lTot / (n - 1), sous = Math.ceil(dl / H_L), h = dl / sous;
  let croissante = false, ePrec = y[1];
  const noter = (i) => {
    const a = y[0], e = y[1], E = kepler(ramener(y[3]), e), xp = a * (cosD(E) - e), yp = a * Math.sqrt(1 - e * e) * sinD(E), cw = cosD(y[2]), sw = sinD(y[2]);
    const o = i * D; brut[o] = cw * xp - sw * yp; brut[o + 1] = sw * xp + cw * yp; brut[o + 2] = y[4]; brut[o + 3] = e;
    const v = { demiGrandAxe: a, excentricite: e, periastre: a * (1 - e) };
    if (P.e0 > 1e-6) v.constantePeters = constantePeters(a, e);
    S.noter(v);
  };
  noter(0);
  for (let i = 1; i < n; i++) {
    for (let k = 0; k < sous; k++) rk4(y, h);
    if (!ok(y)) return null;
    if (y[1] > ePrec) croissante = true; ePrec = y[1];
    noter(i);
  }
  const tFin = y[4], sc = tFin > 0 ? 2 * P.a0 / tFin : 0;
  for (let i = 0; i < n; i++) brut[i * D + 2] *= sc;
  const inv = S.fini(), beta = 64 / 5 * eta;
  const formule = P.e0 > 1e-6 ? tempsPeters(P.a0, P.e0, y[1], eta) : (P.a0 * P.a0 * P.a0 * P.a0 - y[0] * y[0] * y[0] * y[0]) / (4 * beta);
  inv.tempsFusion = { mesure: tFin, formule, ecart: Math.abs(tFin - formule) / formule, aFinal: y[0], eFinal: y[1], unite: 'GM/c^3 (M = 10 masses solaires : 4.93e-5 s)' };
  inv.excentricite.decroissante = !croissante;
  inv.orbites = { mesure: lTot / DEUX_PI };
  /* FIN connue du modele : le periastre atteint 6 GM/c^2 a la derniere ligne (t en GM/c^3) */
  return { brut, invariants: inv, fin: { evenement: 'periastron-6M', indice: n - 1, t: tFin, periastre: rp(y) } };
}

// ---------- 3b : binaire de trous noirs JUSQU A LA FUSION (signal d ondes gravitationnelles complet, non tournants) ----------
// HONNETE : spirale par les equations post-newtoniennes ; fusion et vibration finale par des formules AJUSTEES publiees ;
//   ce n est PAS de la relativite numerique. Trous noirs sans spin, orbite circulaire, mode l = m = 2 seulement.
// Spirale : TaylorT4 3.5PN, Buonanno, Iyer, Ochsner, Pan & Sathyaprakash (2009), PRD 80, 084043, arXiv:0907.0700,
//   Eq. (6) (lue sur https://arxiv.org/html/0907.0700) : dv/dt = (32/5)(nu/M) v^9 [1 - (743/336 + 11/4 nu) v^2 + 4 pi v^3
//   + (34103/18144 + 13661/2016 nu + 59/18 nu^2) v^4 - (4159/672 + 189/8 nu) pi v^5 + (16447322263/139708800 + 16/3 pi^2
//   - 1712/105 gamma + (451/48 pi^2 - 56198689/217728) nu + 541/896 nu^2 - 5605/2592 nu^3 - 856/105 log(16 v^2)) v^6
//   - (4415/4032 - 358675/6048 nu - 91495/1512 nu^2) pi v^7],  v = (M omega_orb)^(1/3), d phi_orb / dt = v^3 / M.
// Trou noir final : Jimenez-Forteza, Keitel, Husa, Hannam, Khan & Puerrer (2017), PRD 95, 064024, arXiv:1611.00332
//   (lue sur https://arxiv.org/html/1611.00332), sous-espace NON TOURNANT : spin chi_f = L'_orb (S = 0), Eq. (7) :
//   (1.3 a3 eta^3 + 5.24 a2 eta^2 + 2 sqrt(3) eta) / (2.88 a5 eta + 1), Table 1 : a2 = 3.833, a3 = -9.49, a5 = 2.513 ;
//   energie rayonnee E_rad = a4 eta^4 + a3 eta^3 + a2 eta^2 + (1 - 2 sqrt(2)/3) eta, Table 7 : a2 = 0.5610, a3 = -0.847,
//   a4 = 3.145 ; M_f = M (1 - E_rad).
// Mode quasi normal l = m = 2, n = 0 : Berti, Cardoso & Will (2006), PRD 73, 064030, arXiv:gr-qc/0512160 (lue sur
//   https://arxiv.org/html/gr-qc/0512160v2), Eq. (73)-(74) et Table 8 : M_f omega = f1 + f2 (1 - j)^f3, f1 = 1.5251,
//   f2 = -1.1568, f3 = 0.1292 ; Q = q1 + q2 (1 - j)^q3, q1 = 0.7000, q2 = 1.4187, q3 = -0.4990 ; Q = omega tau / 2 (Eq. 1).
// Raccord (choix de CE module, pas une formule publiee) : la spirale T4 est suivie jusqu a x = v^2 = 1/3 (anneau de lumiere
//   d un Schwarzschild de masse M), puis un PONT de frequence quadratique omega(s) = omega_m + (omega_q - omega_m)(2 s - s^2),
//   s dans [0, 1], dont la pente initiale egale celle de T4 (duree 2 (omega_q - omega_m) / omega'_m), amplitude tenue ;
//   puis la sinusoide amortie du mode (omega_q, tau). Phase continue partout. Masses de la SOURCE en masses solaires,
//   observees (detecteur) multipliees par (1 + z) ; distance de luminosite en Mpc (aucune cosmologie calculee ici).
const GMSOL_SI = 1.32712440018e20, C_SI = 299792458, MPC_M = 3.0856775814913673e22, GAMMA_EULER = 0.5772156649015329;
const T_SOL = GMSOL_SI / (C_SI * C_SI * C_SI), L_SOL = GMSOL_SI / (C_SI * C_SI);
const JF_SPIN = Object.freeze({ a2: 3.833, a3: -9.49, a5: 2.513 }), JF_ERAD = Object.freeze({ a2: 0.5610, a3: -0.847, a4: 3.145 });
const BCW_220 = Object.freeze({ f1: 1.5251, f2: -1.1568, f3: 0.1292, q1: 0.7000, q2: 1.4187, q3: -0.4990 });
const V_RACCORD = Math.sqrt(1 / 3), H_PHI = 0.05, F_NEWTON = 0.05;
/* dv/dt en unites de M (G = c = 1), TaylorT4 3.5PN */
function vPointT4(v, nu) {
  const v2 = v * v, v3 = v2 * v, v4 = v2 * v2, v5 = v4 * v, v6 = v3 * v3, v7 = v6 * v, v9 = v6 * v3, P2 = PI * PI, nu2 = nu * nu;
  const b = 1 - (743 / 336 + 11 / 4 * nu) * v2 + 4 * PI * v3 + (34103 / 18144 + 13661 / 2016 * nu + 59 / 18 * nu2) * v4
    - (4159 / 672 + 189 / 8 * nu) * PI * v5
    + (16447322263 / 139708800 + 16 / 3 * P2 - 1712 / 105 * GAMMA_EULER + (451 / 48 * P2 - 56198689 / 217728) * nu + 541 / 896 * nu2 - 5605 / 2592 * nu2 * nu - 856 / 105 * lnD(16 * v2)) * v6
    - (4415 / 4032 - 358675 / 6048 * nu - 91495 / 1512 * nu2) * PI * v7;
  return 32 / 5 * nu * v9 * b;
}
/* trou noir final et mode 220 (masse en unites de la masse totale) */
function resteFusion(nu) {
  const n2 = nu * nu, n3 = n2 * nu, R3 = Math.sqrt(3);
  const chi = (1.3 * JF_SPIN.a3 * n3 + 5.24 * JF_SPIN.a2 * n2 + 2 * R3 * nu) / (2.88 * JF_SPIN.a5 * nu + 1);
  const Erad = JF_ERAD.a4 * n3 * nu + JF_ERAD.a3 * n3 + JF_ERAD.a2 * n2 + (1 - 2 * Math.SQRT2 / 3) * nu;
  const F = BCW_220.f1 + BCW_220.f2 * puissance(1 - chi, BCW_220.f3), Q = BCW_220.q1 + BCW_220.q2 * puissance(1 - chi, BCW_220.q3);
  return { chi, Erad, Mf: 1 - Erad, F, Q, omegaM: F / (1 - Erad), tauM: 2 * Q * (1 - Erad) / F };
}
function binaireFusion(P, n) {
  const ms = P.m1 + P.m2, nu = P.m1 * P.m2 / (ms * ms), Md = ms * (1 + P.z), Ts = Md * T_SOL, MsurD = Md * L_SOL / (P.distance * MPC_M);
  const ci = cosD(P.inclinaison * RAD), fp = (1 + ci * ci) / 2, rest = resteFusion(nu);
  /* integration en phase orbitale phi : y = [v, t] (t en M) */
  const f = (y, d) => { const v = y[0], v3 = v * v * v; d[0] = vPointT4(v, nu) / v3; d[1] = 1 / v3; };
  const rk4 = fabriquerRK4(2, f), s = new Float64Array(2);
  /* limite newtonienne MESUREE sur l integrateur : df/dt a f = 0.05 Hz contre (96/5) pi^(8/3) Mc^(5/3) f^(11/3) */
  const vDe = (fHz) => expD(lnD(PI * Ts * fHz) / 3), fDe = (v) => v * v * v / (PI * Ts);
  const Mc = Ts * puissance(nu, 0.6);
  let yN = Float64Array.from([vDe(F_NEWTON), 0]);
  const fN0 = fDe(yN[0]); for (let k = 0; k < 200; k++) rk4(yN, 10);
  const fN1 = fDe(yN[0]), fNm = (fN0 + fN1) / 2, pente = (fN1 - fN0) / (yN[1] * Ts);
  const newton = 96 / 5 * puissance(PI, 8 / 3) * puissance(Mc, 5 / 3) * puissance(fNm, 11 / 3);
  /* passe 1 : phase orbitale totale jusqu au raccord v = 1/sqrt(3) (dernier pas affine par bissection) */
  const v0 = vDe(P.fDepart);
  if (!(v0 < V_RACCORD)) return null;
  let y = Float64Array.from([v0, 0]), phiTot = 0, pas = 0;
  for (;;) {
    s.set(y); rk4(y, H_PHI);
    if (!(Number.isFinite(y[0]) && y[0] > 0)) return null;
    if (y[0] >= V_RACCORD) {
      let lo = 0, hi = H_PHI;
      for (let k = 0; k < 60; k++) { const mi = (lo + hi) / 2; y.set(s); rk4(y, mi); if (y[0] >= V_RACCORD) hi = mi; else lo = mi; }
      phiTot += hi; break;
    }
    phiTot += H_PHI;
    if (++pas > 4e6) return null;
  }
  const nR = Math.max(1, Math.round(n / 4)), nI = n - nR, D = 4, brut = new Float64Array(n * D);
  let hMax = 0, croissante = true;
  const ecrire = (i, tM, A, phi22, w22) => {
    const o = i * D, hp = A * fp * cosD(ramener(phi22)), hx = A * ci * sinD(ramener(phi22));
    brut[o] = tM * Ts; brut[o + 1] = hp * 1e21; brut[o + 2] = hx * 1e21; brut[o + 3] = w22 / (DEUX_PI * Ts);
    const h = Math.sqrt(hp * hp + hx * hx); if (h > hMax) hMax = h;
  };
  /* passe 2 : nI points a pas de phase egaux */
  y = Float64Array.from([v0, 0]);
  const dphi = nI > 1 ? phiTot / (nI - 1) : 0, sous = nI > 1 ? Math.ceil(dphi / H_PHI) : 0, h = sous ? dphi / sous : 0;
  let fPrec = -Infinity;
  for (let i = 0; i < nI; i++) {
    if (i) for (let k = 0; k < sous; k++) rk4(y, h);
    const v = y[0], w22 = 2 * v * v * v; ecrire(i, y[1], 4 * nu * MsurD * v * v, 2 * i * dphi, w22);
    if (!(w22 > fPrec)) croissante = false; fPrec = w22;
  }
  if (nI === 1) { const k = Math.ceil(phiTot / H_PHI); for (let j = 0; j < k; j++) rk4(y, phiTot / k); }
  if (!(Number.isFinite(y[0]) && Number.isFinite(y[1]))) return null;
  /* raccord : etat au bout de la spirale (v = 1/sqrt(3) a 1e-12 pres apres la passe 2) */
  const vm = y[0], tm = y[1], phim = 2 * phiTot, wm = 2 * vm * vm * vm, wpm = 6 * vm * vm * vPointT4(vm, nu), Am = 4 * nu * MsurD * vm * vm;
  const wq = rest.omegaM, tau = rest.tauM, dw = wq - wm, dur = 2 * dw / wpm, tFin = dur + 10 * tau;
  if (!(dw > 0 && dur > 0)) return null;
  for (let k = 1; k <= nR; k++) {
    const tl = tFin * k / nR; let A = Am, ph, w;
    if (tl <= dur) { const u = tl / dur; w = wm + dw * (2 * u - u * u); ph = phim + dur * (wm * u + dw * (u * u - u * u * u / 3)); }
    else { const tr = tl - dur; w = wq; ph = phim + dur * (wm + 2 * dw / 3) + wq * tr; A = Am * expD(-tr / tau); }
    ecrire(nI + k - 1, tm + tl, A, ph, w);
  }
  /* temps : zero au debut du mode amorti */
  const t0 = (tm + dur) * Ts; for (let i = 0; i < n; i++) brut[i * D] -= t0;
  const Mcs = ms * puissance(nu, 0.6);
  return { brut, invariants: {
    masseChirp: { mesure: Mcs, observee: Mcs * (1 + P.z), unite: 'masses solaires (source)' },
    resteFinal: { masse: ms * rest.Mf, spin: rest.chi, energieRayonnee: ms * rest.Erad, unite: 'masses solaires (source), spin sans dimension', source: 'Jimenez-Forteza 2017 (non tournant)' },
    ringdown: { frequence: wq / (DEUX_PI * Ts), tempsAmortissement: tau * Ts * 1e3, qualite: rest.Q, MfOmega: rest.F, unite: 'Hz (detecteur), ms', source: 'Berti, Cardoso & Will 2006, Table 8' },
    spirale: { croissante, fDepart: fDe(v0), fRaccord: wm / (DEUX_PI * Ts), cycles: phiTot / PI, duree: tm * Ts, pasPhase: h, unite: 'Hz, cycles d onde, s' },
    pont: { duree: dur * Ts, pente: wpm, unite: 's' },
    limiteNewton: { f: fNm, mesure: pente, formule: newton, ecart: Math.abs(pente - newton) / newton, unite: 'Hz/s' },
    strainMax: { mesure: hMax, unite: 'sans dimension (face au detecteur, sans reponse d antenne)' },
  } };
}

// ---------- 4 : amas d etoiles autour d un trou noir central (N corps, Plummer adouci, saute-mouton) ----------
// G = 1, masse stellaire totale = 1, rayon de Plummer b = 1. Trou noir = corps 0 de masse masseTrouNoir (il bouge aussi).
// Conditions initiales : sphere de Plummer (Aarseth, Henon & Wielen 1974) tiree avec mulberry32, vitesses remises a
//   l echelle pour K / |W| = viriel (0.5 = equilibre ; plus petit = l amas tombe). Gravite adoucie : 1 / (r^2 + eps^2)^(1/2).
const EPS = 0.1, EPS2 = EPS * EPS;
function accelerations(x, m, a, N) {
  a.fill(0);
  for (let i = 0; i < N; i++) {
    const xi = x[3 * i], yi = x[3 * i + 1], zi = x[3 * i + 2], mi = m[i];
    for (let j = i + 1; j < N; j++) {
      const dx = x[3 * j] - xi, dy = x[3 * j + 1] - yi, dz = x[3 * j + 2] - zi, r2 = dx * dx + dy * dy + dz * dz + EPS2, inv = 1 / (r2 * Math.sqrt(r2));
      const fj = m[j] * inv, fi = mi * inv;
      a[3 * i] += fj * dx; a[3 * i + 1] += fj * dy; a[3 * i + 2] += fj * dz;
      a[3 * j] -= fi * dx; a[3 * j + 1] -= fi * dy; a[3 * j + 2] -= fi * dz;
    }
  }
}
function energies(x, v, m, N) {
  let K = 0, W = 0; const L = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const o = 3 * i; K += m[i] * (v[o] * v[o] + v[o + 1] * v[o + 1] + v[o + 2] * v[o + 2]) / 2;
    L[0] += m[i] * (x[o + 1] * v[o + 2] - x[o + 2] * v[o + 1]); L[1] += m[i] * (x[o + 2] * v[o] - x[o] * v[o + 2]); L[2] += m[i] * (x[o] * v[o + 1] - x[o + 1] * v[o]);
    for (let j = i + 1; j < N; j++) {
      const dx = x[3 * j] - x[o], dy = x[3 * j + 1] - x[o + 1], dz = x[3 * j + 2] - x[o + 2];
      W -= m[i] * m[j] / Math.sqrt(dx * dx + dy * dy + dz * dz + EPS2);
    }
  }
  return { K, W, L: Math.sqrt(L[0] * L[0] + L[1] * L[1] + L[2] * L[2]) };
}
function amasEtoiles(P, n) {
  const Ne = P.etoiles, N = Ne + 1, m = new Float64Array(N), x = new Float64Array(3 * N), v = new Float64Array(3 * N), alea = mulberry32(P.graine >>> 0);
  m[0] = P.masseTrouNoir; for (let i = 1; i < N; i++) m[i] = 1 / Ne;
  const direction = (o, tab, r) => { const ct = 2 * alea() - 1, st = Math.sqrt(1 - ct * ct), ph = DEUX_PI * alea(); tab[o] = r * st * cosD(ph); tab[o + 1] = r * st * sinD(ph); tab[o + 2] = r * ct; };
  for (let i = 1; i < N; i++) {
    let r = Infinity;
    while (!(r < 8)) { const X = alea(); if (X > 0 && X < 1) r = 1 / Math.sqrt(puissance(X, -2 / 3) - 1); }
    direction(3 * i, x, r);
    let q = 0;
    for (;;) { q = alea(); const w = 1 - q * q, gq = q * q * w * w * w * Math.sqrt(w); if (0.1 * alea() < gq) break; }
    direction(3 * i, v, q * Math.SQRT2 / Math.sqrt(Math.sqrt(1 + r * r)));
  }
  /* centre de masse au repos a l origine, puis K / |W| = viriel */
  let mt = 0; for (let i = 0; i < N; i++) mt += m[i];
  for (let k = 0; k < 3; k++) { let sx = 0, sv = 0; for (let i = 0; i < N; i++) { sx += m[i] * x[3 * i + k]; sv += m[i] * v[3 * i + k]; } for (let i = 0; i < N; i++) { x[3 * i + k] -= sx / mt; v[3 * i + k] -= sv / mt; } }
  { const E = energies(x, v, m, N), f = Math.sqrt(P.viriel * -E.W / E.K); for (let j = 0; j < 3 * N; j++) v[j] *= f; }
  /* saute-mouton KDK a pas fixe (symplectique) ; temoin de Benettin (ecart 1e-8 dans l espace des phases, renormalise) */
  const F = 6 * N, hmax = 0.08 * Math.sqrt(EPS2 * EPS / mt), hOut = P.duree / (n - 1), pas = Math.ceil(hOut / hmax), h = hOut / pas;
  const xe = Float64Array.from(x), ve = Float64Array.from(v), a = new Float64Array(3 * N), ae = new Float64Array(3 * N);
  { let q = 0; const d = new Float64Array(F); for (let j = 0; j < F; j++) { d[j] = 1 + 0.37 * ((j * 5) % 7); q += d[j] * d[j]; } q = D0 / Math.sqrt(q); for (let j = 0; j < 3 * N; j++) { xe[j] += d[j] * q; ve[j] += d[3 * N + j] * q; } }
  const D = 12, brut = new Float64Array(n * D), S = suiveur();
  const noter = (i) => {
    for (let k = 0; k < 12; k++) brut[i * D + k] = x[3 + k]; /* etoiles 1..4 */
    const E = energies(x, v, m, N); S.noter({ energie: E.K + E.W, viriel: 2 * E.K / -E.W, momentCinetique: E.L });
  };
  noter(0);
  accelerations(x, m, a, N); accelerations(xe, m, ae, N);
  let somme = 0;
  for (let i = 1; i < n; i++) {
    for (let s = 0; s < pas; s++) {
      for (let j = 0; j < 3 * N; j++) { v[j] += 0.5 * h * a[j]; x[j] += h * v[j]; ve[j] += 0.5 * h * ae[j]; xe[j] += h * ve[j]; }
      accelerations(x, m, a, N); accelerations(xe, m, ae, N);
      for (let j = 0; j < 3 * N; j++) { v[j] += 0.5 * h * a[j]; ve[j] += 0.5 * h * ae[j]; }
    }
    if (!fini(x) || !fini(v)) return null;
    let d2 = 0; for (let j = 0; j < 3 * N; j++) { const p = xe[j] - x[j], q = ve[j] - v[j]; d2 += p * p + q * q; }
    const d = Math.sqrt(d2);
    if (d > 0) { somme += lnD(d / D0); const f = D0 / d; for (let j = 0; j < 3 * N; j++) { xe[j] = x[j] + (xe[j] - x[j]) * f; ve[j] = v[j] + (ve[j] - v[j]) * f; } accelerations(xe, m, ae, N); }
    noter(i);
  }
  const inv = S.fini();
  inv.pas = { h, pasParPoint: pas, adoucissement: EPS };
  return { brut, invariants: inv, lyapunov: somme / P.duree };
}

// ---------- 5 : reste de supernova (expansion libre puis onde de souffle de Sedov-Taylor) ----------
// cgs. Ejecta de masse Mej a la vitesse v = sqrt(2 E / Mej) (toute l energie cinetique, une seule coquille) : R = v t.
// Sedov-Taylor (gamma = 5/3) : R = xi (E t^2 / rho)^(1/5), xi = 1.15. Raccord lisse R = (R_libre^-4 + R_Sedov^-4)^(-1/4)
//   (le plus petit des deux domine : libre tot, Sedov tard ; croisement quand la masse balayee ~ Mej). rho = 1.4 m_H n.
// Traceurs = points sur le choc avant, directions tirees (mulberry32), a 16 instants log-espaces de annees/1e4 a annees.
const MSOL = 1.989e33, MH = 1.6726e-24, PC = 3.0857e18, AN = 3.15576e7, XI = 1.15, INSTANTS = 16;
function rayonSN(c, t) {
  const Rl = c.v * t, Rs = XI * expD(lnD(c.E * t * t / c.rho) / 5), x = Rl / Rs;
  return Rl / Math.sqrt(Math.sqrt(1 + x * x * x * x));
}
function supernova(P, n) {
  const c = { E: P.energie * 1e51, M: P.masseEjecta * MSOL, rho: 1.4 * MH * P.densite };
  c.v = Math.sqrt(2 * c.E / c.M);
  /* croisement v t = xi (E t^2 / rho)^(1/5)  <=>  t^3 = xi^5 E / (rho v^5) */
  const tCroise = expD(lnD(XI * XI * XI * XI * XI * c.E / (c.rho * c.v * c.v * c.v * c.v * c.v)) / 3);
  const temps = []; for (let k = 0; k < INSTANTS; k++) temps.push(P.annees * expD(-4 * LN10 * (1 - k / (INSTANTS - 1))) * AN);
  const R = temps.map((t) => rayonSN(c, t));
  const D = 4, brut = new Float64Array(n * D), alea = mulberry32(P.graine >>> 0), somme = new Float64Array(INSTANTS), compte = new Float64Array(INSTANTS);
  const debuts = []; let kPrec = -1;
  for (let i = 0; i < n; i++) {
    const k = Math.min(INSTANTS - 1, Math.floor(i * INSTANTS / n)), r = R[k] / PC;
    if (k !== kPrec) { debuts.push(i); kPrec = k; }
    const ct = 2 * alea() - 1, st = Math.sqrt(1 - ct * ct), ph = DEUX_PI * alea(), o = i * D;
    brut[o] = r * st * cosD(ph); brut[o + 1] = r * st * sinD(ph); brut[o + 2] = r * ct; brut[o + 3] = temps[k] / AN;
    somme[k] += Math.sqrt(brut[o] * brut[o] + brut[o + 1] * brut[o + 1] + brut[o + 2] * brut[o + 2]); compte[k]++;
  }
  /* exposants MESURES sur les rayons moyens des traceurs (deux premiers instants / deux derniers) */
  const Rm = (k) => (compte[k] ? somme[k] / compte[k] : NaN), pente = (i, j) => lnD(Rm(j) / Rm(i)) / lnD(temps[j] / temps[i]);
  const tF = P.annees * AN;
  return { brut, invariants: {
    exposantLibre: { mesure: pente(0, 1), formule: 1, temps: [temps[0] / AN, temps[1] / AN], unite: 'd ln R / d ln t' },
    exposantSedov: { mesure: pente(INSTANTS - 2, INSTANTS - 1), formule: 0.4, temps: [temps[INSTANTS - 2] / AN, tF / AN], unite: 'd ln R / d ln t' },
    rayonFinal: { mesure: Rm(INSTANTS - 1), formule: XI * expD(lnD(c.E * tF * tF / c.rho) / 5) / PC, unite: 'parsec' },
    transition: { annees: tCroise / AN, rayonPc: c.v * tCroise / PC, rayonBalayagePc: expD(lnD(3 * c.M / (4 * PI * c.rho)) / 3) / PC, vitesseEjectaKmS: c.v / 1e5 },
  }, film: filmDe(debuts, n) };
}

// ---------- 5b : reste de supernova par HYDRODYNAMIQUE reelle (Lagrange 1-D spherique, von Neumann-Richtmyer) ----------
// Gaz parfait gamma = 5/3, explosion ponctuelle (energie E deposee dans les 2 zones centrales) dans un milieu uniforme froid.
// Schema : grille de Lagrange decalee (vitesses aux noeuds, rho / e / p aux zones), viscosite artificielle de von Neumann-
//   Richtmyer q = rho (C2 du^2 - C1 c du) en compression, predicteur-correcteur en temps ; energie interne mise a jour par le
//   travail EXACTEMENT oppose a celui des forces nodales (forme « compatible ») : l energie totale ne bouge qu a l arrondi.
// Unites internes E = rho0 = 1, temps final 1 ; le probleme est auto-semblable (contre-pression 1e-7 negligeable), donc une
//   seule simulation sert pour tout (E, n, t) : longueur L = (E t^2 / rho)^(1/5), le nuage est mis a l echelle en parsecs.
// Reference EXACTE : Sedov (1959) / Taylor (1950), R = xi (E t^2 / rho)^(1/5) ; xi est CALCULE ici (sedovXi) en integrant les
//   equations auto-semblables depuis le choc fort (U = 2/(g+1), rho = (g+1)/(g-1) rho0, p = 2/(g+1) rho0 R'^2) vers le centre,
//   puis E = 4 pi rho0 delta^2 R^5 / t^2 * integrale lambda^2 (rho u^2 / 2 + p / (g-1)), delta = 2/5.
// Lissage numerique : le choc s etale sur ~3 zones, le pic de densite reste un peu sous 4 (annonce, tolere a 15 %).
const GAMMA_SN = 5 / 3, ZONES_SN = 450, RMAX_SN = 1.4, CFL_SN = 0.3, P0_SN = 1e-7, ZONES_DEPOT = 2;
const CQ2_SN = 2, CQ1_SN = 0.3, INSTANTS_H = 16, T_MIN_H = 0.05;
function sedovXi(g) {
  const del = 0.4, eps = (del - 1) / del, M = 4000, sMin = -9, hs = sMin / M;
  const f = (y, d) => { /* y = [U, ln rho, ln p, integrale] en fonction de s = ln lambda */
    const lam = expD(y[4]), U = y[0], w = U - lam, c2 = g * expD(y[2] - y[1]);
    const Up = (-eps * U * w + 2 * eps * c2 / g + 2 * c2 * U / lam) / (w * w - c2), dO = -(Up + 2 * U / lam) / w, dP = -2 * eps / w + g * dO;
    d[0] = lam * Up; d[1] = lam * dO; d[2] = lam * dP; d[3] = lam * lam * lam * (0.5 * expD(y[1]) * U * U + expD(y[2]) / (g - 1)); d[4] = 1;
  };
  const rk4 = fabriquerRK4(5, f), y = Float64Array.from([2 / (g + 1), lnD((g + 1) / (g - 1)), lnD(2 / (g + 1)), 0, 0]);
  for (let k = 0; k < M; k++) rk4(y, hs);
  return puissance(4 * PI * del * del * -y[3], -0.2);
}
const XI_SEDOV = sedovXi(GAMMA_SN);
function hydroSedov() {
  const N = ZONES_SN, g = GAMMA_SN, gm = g - 1, QPI = 4 * PI;
  const r = new Float64Array(N + 1), u = new Float64Array(N + 1), m = new Float64Array(N), e = new Float64Array(N), mn = new Float64Array(N + 1);
  const rh = new Float64Array(N + 1), uh = new Float64Array(N + 1), un = new Float64Array(N + 1), Pz = new Float64Array(N), Ph = new Float64Array(N);
  const V = (a, b) => QPI / 3 * (b * b * b - a * a * a);
  for (let j = 0; j <= N; j++) r[j] = RMAX_SN * j / N;
  let md = 0;
  for (let z = 0; z < N; z++) { m[z] = V(r[z], r[z + 1]); e[z] = P0_SN / gm; if (z < ZONES_DEPOT) md += m[z]; }
  for (let z = 0; z < ZONES_DEPOT; z++) e[z] += 1 / md;
  for (let j = 1; j < N; j++) mn[j] = 0.5 * (m[j - 1] + m[j]);
  const energie = () => { let s = 0; for (let z = 0; z < N; z++) s += m[z] * e[z]; for (let j = 1; j < N; j++) s += 0.5 * mn[j] * u[j] * u[j]; return s; };
  const pq = (rr, uu, ee, z) => {
    const rho = m[z] / V(rr[z], rr[z + 1]), p = gm * rho * ee, du = uu[z + 1] - uu[z];
    return du < 0 ? p + rho * (CQ2_SN * du * du - CQ1_SN * Math.sqrt(g * gm * ee) * du) : p;
  };
  const temps = []; for (let k = 0; k < INSTANTS_H; k++) temps.push(expD(lnD(T_MIN_H) * (1 - k / (INSTANTS_H - 1))));
  const E0 = energie(), photos = [];
  let t = 0, dtp = Infinity, pas = 0, kS = 0, derive = 0;
  while (kS < INSTANTS_H) {
    let dt = Infinity;
    for (let z = 0; z < N; z++) {
      const du = u[z + 1] - u[z], sv = Math.sqrt(g * gm * e[z]) + (du < 0 ? 2 * CQ2_SN * -du : 0), d = (r[z + 1] - r[z]) / sv;
      if (d < dt) dt = d;
    }
    dt = Math.min(CFL_SN * dt, 1.1 * dtp); dtp = dt;
    const fin = temps[kS] - t <= dt; if (fin) dt = temps[kS] - t;
    /* predicteur : demi-pas */
    for (let z = 0; z < N; z++) Pz[z] = pq(r, u, e[z], z);
    uh[0] = 0; uh[N] = 0;
    for (let j = 1; j < N; j++) uh[j] = u[j] - 0.5 * dt * QPI * r[j] * r[j] * (Pz[j] - Pz[j - 1]) / mn[j];
    for (let j = 0; j <= N; j++) rh[j] = r[j] + 0.5 * dt * u[j];
    for (let z = 0; z < N; z++) Ph[z] = pq(rh, uh, e[z] - Pz[z] * (V(rh[z], rh[z + 1]) - V(r[z], r[z + 1])) / m[z], z);
    /* correcteur : forces et travail au demi-pas, vitesse moyenne (u + u') / 2 */
    un[0] = 0; un[N] = 0;
    for (let j = 1; j < N; j++) un[j] = u[j] - dt * QPI * rh[j] * rh[j] * (Ph[j] - Ph[j - 1]) / mn[j];
    for (let z = 0; z < N; z++) {
      const a = QPI * rh[z] * rh[z] * 0.5 * (u[z] + un[z]), b = QPI * rh[z + 1] * rh[z + 1] * 0.5 * (u[z + 1] + un[z + 1]);
      e[z] -= dt * Ph[z] * (b - a) / m[z];
      if (!(e[z] > 0)) return null;
    }
    for (let j = 0; j <= N; j++) { r[j] += 0.5 * dt * (u[j] + un[j]); u[j] = un[j]; }
    for (let j = 0; j < N; j++) if (!(r[j + 1] > r[j])) return null;
    t = fin ? temps[kS] : t + dt; pas++;
    const dE = Math.abs(energie() - E0) / E0; if (dE > derive || !(dE === dE)) derive = dE;
    if (fin) { const rho = new Float64Array(N); for (let z = 0; z < N; z++) rho[z] = m[z] / V(r[z], r[z + 1]); photos.push({ t, r: Float64Array.from(r), rho, m }); kS++; }
    if (pas > 2e5) return null;
  }
  return { photos, E0, derive, pas };
}
/* choc d une photo : pic de densite, puis premiere zone au-dela sous (1 + pic) / 2, interpolee entre centres de zones */
function chocDe(ph) {
  const rho = ph.rho, r = ph.r, N = rho.length; let zm = 0;
  for (let z = 1; z < N; z++) if (rho[z] > rho[zm]) zm = z;
  const seuil = 0.5 * (1 + rho[zm]); let z = zm;
  while (z < N - 2 && rho[z + 1] >= seuil) z++;
  if (z >= N - 2) return null;
  const ca = 0.5 * (r[z] + r[z + 1]), cb = 0.5 * (r[z + 1] + r[z + 2]), f = (rho[z] - seuil) / (rho[z] - rho[z + 1]);
  return { R: ca + f * (cb - ca), rhoMax: rho[zm], zs: z + 1 };
}
function supernovaHydro(P, n) {
  const H = hydroSedov(); if (!H) return null;
  const chocs = H.photos.map(chocDe); if (chocs.some((c) => !c)) return null;
  const E = P.energie * 1e51, rho0 = 1.4 * MH * P.densite, tF = P.annees * AN, L = expD(lnD(E * tF * tF / rho0) / 5) / PC;
  /* nuage : instant k = floor(i K / n) ; dans l instant, quantiles de masse sur les zones derriere le choc, directions de Fibonacci */
  const K = INSTANTS_H, D = 5, brut = new Float64Array(n * D), debuts = [];
  for (let k = 0; k < K; k++) {
    const i0 = Math.ceil(k * n / K), i1 = Math.ceil((k + 1) * n / K), c = i1 - i0, ph = H.photos[k], zs = chocs[k].zs;
    if (c <= 0) continue;
    debuts.push(i0);
    let mt = 0; for (let z = 0; z <= zs; z++) mt += ph.m[z];
    let z = 0, cum = ph.m[0];
    for (let j = 0; j < c; j++) {
      const q = (j + 0.5) / c * mt; while (cum < q && z < zs) { z++; cum += ph.m[z]; }
      const rr = 0.5 * (ph.r[z] + ph.r[z + 1]) * L, ct = 1 - 2 * (j + 0.5) / c, st = Math.sqrt(1 - ct * ct), phi = ramener(j * ANGLE_OR), o = (i0 + j) * D;
      brut[o] = rr * st * cosD(phi); brut[o + 1] = rr * st * sinD(phi); brut[o + 2] = rr * ct; brut[o + 3] = ph.t * P.annees; brut[o + 4] = ph.rho[z];
    }
  }
  /* mesures : rayon contre Sedov exact (t >= 0.1), saut de densite, exposant par moindres carres de ln R sur ln t (t >= 0.1) */
  let ecMax = 0, sMin = Infinity, sMax = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, k2 = 0;
  for (let k = 0; k < K; k++) {
    const t = H.photos[k].t; if (t < 0.1 - 1e-12) continue;
    const Rs = XI_SEDOV * expD(0.4 * lnD(t)), c = chocs[k], ec = Math.abs(c.R - Rs) / Rs;
    if (ec > ecMax) ecMax = ec; if (c.rhoMax < sMin) sMin = c.rhoMax; if (c.rhoMax > sMax) sMax = c.rhoMax;
    const X = lnD(t), Y = lnD(c.R); sx += X; sy += Y; sxx += X * X; sxy += X * Y; k2++;
  }
  const expo = (k2 * sxy - sx * sy) / (k2 * sxx - sx * sx), cF = chocs[K - 1];
  return { brut, invariants: {
    xiSedov: { mesure: XI_SEDOV, gamma: GAMMA_SN, unite: 'sans dimension (calcule par les equations de Sedov)' },
    rayonChoc: { mesure: cF.R, formule: XI_SEDOV, ecart: Math.abs(cF.R - XI_SEDOV) / XI_SEDOV, ecartMax: ecMax, rayonPc: cF.R * L, unite: 'unites (E t^2 / rho)^(1/5) a t final' },
    sautDensite: { min: sMin, max: sMax, formule: (GAMMA_SN + 1) / (GAMMA_SN - 1), ecart: Math.max(Math.abs(sMin - 4), Math.abs(sMax - 4)) / 4, unite: 'rho max / rho0 (t >= 0.1 t final)' },
    energie: { debut: H.E0, derive: H.derive, unite: 'energie totale (cinetique + interne), derive max relative' },
    exposant: { mesure: expo, formule: 0.4, unite: 'd ln R / d ln t (moindres carres, t >= 0.1 t final)' },
    grille: { zones: ZONES_SN, pas: H.pas, rayonDomaine: RMAX_SN, viscosite: [CQ2_SN, CQ1_SN] },
  }, film: filmDe(debuts, n) };
}

// ---------- 6 : collision de galaxies (Toomre & Toomre 1972, trois corps restreint) ----------
// G = 1, m1 = 1, m2 = rapportMasses, pericentre r_p = 1. Deux noyaux ponctuels sur une parabole (E = 0) ; chaque noyau
//   porte un disque d etoiles TEST (sans masse) sur orbites circulaires, adoucissement eps = 0.05 etoile-noyau.
// Depart a la separation 8 r_p ; position et temps par l equation de Barker (D = tan(f/2), aucune trigonometrie) :
//   r = r_p (1 + D^2), t = sqrt(p^3 / M) (D + D^3 / 3) / 2, p = 2 r_p ; pericentre a t = 0, fin a t = duree.
// Noyaux : Yoshida ordre 4 (symplectique) ; etoiles : saute-mouton KDK avec les noyaux aux bords du pas.
const EPS_G2 = 0.05 * 0.05, R_DEPART = 8, H_G = 0.004;
const CB = 1.2599210498948732, W1 = 1 / (2 - CB), W0 = -CB / (2 - CB);
const YC = [W1 / 2, (W0 + W1) / 2, (W0 + W1) / 2, W1 / 2], YD = [W1, W0, W1];
/* FILM : IMAGES_G instantanes egalement espaces de t0 (separation 8, avant la rencontre) a duree ; chaque image = les memes
   etoiles test (n / images par image). Nombre d images = le plus grand diviseur de n <= 12 laissant >= 2 etoiles par image
   (n = 1500 -> 12 x 125) : toutes les images ont EXACTEMENT le meme nombre de lignes. */
const IMAGES_G = 12;
function imagesFilm(n) { for (let d = Math.min(IMAGES_G, n); d >= 1; d--) if (n % d === 0 && n / d >= 2) return d; return 1; }
function collisionGalaxies(P, nLignes) {
  const images = imagesFilm(nLignes), n = nLignes / images; /* n = etoiles integrees = lignes par image */
  const m1 = 1, m2 = P.rapportMasses, M = m1 + m2, mu = m1 * m2 / M, p = 2;
  const Dd = -Math.sqrt(R_DEPART - 1), q1 = 1 + Dd * Dd, sf = 2 * Dd / q1, cf = (1 - Dd * Dd) / q1, vk = Math.sqrt(M / p);
  const rel = Float64Array.from([1 - Dd * Dd, 2 * Dd, -vk * sf, vk * (cf + 1)]);
  const t0 = Math.sqrt(p * p * p / M) * (Dd + Dd * Dd * Dd / 3) / 2, T = P.duree - t0;
  /* pas par intervalle entre images (le dernier instantane tombe exactement sur duree) */
  const inter = Math.max(1, images - 1), pasImage = Math.ceil(T / inter / H_G), pas = pasImage * inter, h = T / pas;
  const coeurs = new Float64Array(6); /* x1, y1, z1, x2, y2, z2 (repere du centre de masse) */
  const placer = () => { coeurs[0] = -m2 / M * rel[0]; coeurs[1] = -m2 / M * rel[1]; coeurs[3] = m1 / M * rel[0]; coeurs[4] = m1 / M * rel[1]; };
  const energieC = () => { const r = Math.sqrt(rel[0] * rel[0] + rel[1] * rel[1]); return mu * (rel[2] * rel[2] + rel[3] * rel[3]) / 2 - m1 * m2 / r; };
  const yoshida = (hh) => {
    for (let s = 0; s < 4; s++) {
      rel[0] += YC[s] * hh * rel[2]; rel[1] += YC[s] * hh * rel[3];
      if (s < 3) { const r2 = rel[0] * rel[0] + rel[1] * rel[1], k = M / (r2 * Math.sqrt(r2)); rel[2] -= YD[s] * hh * k * rel[0]; rel[3] -= YD[s] * hh * k * rel[1]; }
    }
  };
  /* disques : galaxie 1 = ceil(n/2) etoiles, galaxie 2 = le reste ; rayons 0.2..0.7 r_p (x sqrt(m) pour la 2), angle d or */
  const n1 = Math.ceil(n / 2), x = new Float64Array(3 * n), v = new Float64Array(3 * n), a = new Float64Array(3 * n), rmax = [0.7, 0.7 * Math.sqrt(m2)];
  placer();
  const vc = [-m2 / M * rel[2], -m2 / M * rel[3], m1 / M * rel[2], m1 / M * rel[3]];
  for (let k = 0; k < n; k++) {
    const g = k < n1 ? 0 : 1, j = g ? k - n1 : k, mg = g ? m2 : m1, inc = (g ? P.inclinaison2 : P.inclinaison1) * RAD, ci = cosD(inc), si = sinD(inc);
    const rr = rmax[g] * (0.2 / 0.7 + (1 - 0.2 / 0.7) * ((j * NOMBRE_OR + 0.5) % 1)), th = j * ANGLE_OR, c = cosD(th), s = sinD(th);
    const r2 = rr * rr + EPS_G2, vcirc = Math.sqrt(mg * rr * rr / (r2 * Math.sqrt(r2)));
    const o = 3 * k;
    x[o] = coeurs[3 * g] + rr * c; x[o + 1] = coeurs[3 * g + 1] + rr * s * ci; x[o + 2] = rr * s * si;
    v[o] = vc[2 * g] - vcirc * s; v[o + 1] = vc[2 * g + 1] + vcirc * c * ci; v[o + 2] = vcirc * c * si;
  }
  const forces = () => {
    const X1 = coeurs[0], Y1 = coeurs[1], X2 = coeurs[3], Y2 = coeurs[4];
    for (let o = 0; o < 3 * n; o += 3) {
      const z = x[o + 2], z2 = z * z + EPS_G2;
      const dx = x[o] - X1, dy = x[o + 1] - Y1, r2 = dx * dx + dy * dy + z2, f = m1 / (r2 * Math.sqrt(r2));
      const ex = x[o] - X2, ey = x[o + 1] - Y2, s2 = ex * ex + ey * ey + z2, g = m2 / (s2 * Math.sqrt(s2));
      a[o] = -f * dx - g * ex; a[o + 1] = -f * dy - g * ey; a[o + 2] = -(f + g) * z;
    }
  };
  const S = suiveur(); S.noter({ energieCoeurs: energieC() / (m1 * m2) });
  const brut = new Float64Array(3 * nLignes), tImages = [], coeursImages = [];
  let k = 0;
  const photo = (t) => { brut.set(x, 3 * n * k); tImages.push(t); coeursImages.push([coeurs[0], coeurs[1], coeurs[3], coeurs[4]]); k++; };
  if (images > 1) photo(t0);
  forces();
  let rmin = Infinity, tPeri = NaN, t = t0;
  for (let s = 0; s < pas; s++) {
    for (let j = 0; j < 3 * n; j++) { v[j] += 0.5 * h * a[j]; x[j] += h * v[j]; }
    yoshida(h); placer(); t = t0 + (s + 1) * h;
    const r = Math.sqrt(rel[0] * rel[0] + rel[1] * rel[1]); if (r < rmin) { rmin = r; tPeri = t; }
    forces();
    for (let j = 0; j < 3 * n; j++) v[j] += 0.5 * h * a[j];
    if (s % 64 === 63) S.noter({ energieCoeurs: energieC() / (m1 * m2) });
    if ((s + 1) % pasImage === 0 && k < images) photo(t);
  }
  S.noter({ energieCoeurs: energieC() / (m1 * m2) });
  if (k !== images || !fini(x)) return null;
  /* queues de maree : etoiles a plus de 2 rmax de leur propre noyau a la fin */
  const queue = [0, 0];
  for (let k = 0; k < n; k++) {
    const g = k < n1 ? 0 : 1, o = 3 * k, dx = x[o] - coeurs[3 * g], dy = x[o + 1] - coeurs[3 * g + 1], dz = x[o + 2];
    if (dx * dx + dy * dy + dz * dz > 4 * rmax[g] * rmax[g]) queue[g]++;
  }
  const inv = S.fini();
  inv.pericentre = { mesure: rmin, formule: 1, tempsMesure: tPeri, tempsFormule: 0, pas: h };
  inv.queues = { galaxie1: queue[0] / n1, galaxie2: n - n1 ? queue[1] / (n - n1) : 0, definition: 'fraction a plus de 2 rayons de disque de son noyau (image finale)' };
  inv.film = { temps: tImages, coeurs: coeursImages, unite: 'temps (pericentre a t = 0) ; coeurs [x1, y1, x2, y2] par image (z = 0)' };
  return { brut, invariants: inv, film: filmDe(tImages.map((_, j) => j * n), nLignes) };
}

// ---------- catalogue ----------
const ANNEES_GROUPE1 = 165; /* > periode de Neptune (164.8 ans) */
export const SYSTEMES = Object.freeze([
  { id: 'systemeSolaire', nom: 'Our solar system', science: 'Celestial mechanics', D: 12,
    params: { groupe: 0, annees: 4 }, bornes: { groupe: [0, 1], annees: [0.5, 400] },
    phrase: 'The 8 planets on Keplerian ellipses from the JPL J2000 mean orbital elements and their slow drifts (Standish 1992, valid 1800-2050), heliocentric positions in AU of 4 planets (group 0: Mercury to Mars, group 1: Jupiter to Neptune); no mutual perturbations beyond those mean drifts, no moons.' },
  { id: 'etoileS2', nom: 'Star S2 around our black hole', science: 'General relativity', D: 3,
    params: { tours: 3, rg: 1 }, bornes: { tours: [1, 20], rg: [0, 1] },
    phrase: 'The star S2 orbiting Sagittarius A*, the 4.26-million-solar-mass black hole at the centre of the Milky Way, from the GRAVITY 2020 orbit, integrated with Newtonian gravity plus the first post-Newtonian (Schwarzschild) correction (rg = 0 turns it off); positions in AU, the star is a test particle and the 12-arcminute-per-orbit precession is real but too small to see by eye.' },
  { id: 'binaireTrouNoir', nom: 'Black hole binary inspiral', science: 'Gravitational waves', D: 4,
    params: { q: 1, a0: 20, e0: 0.4 }, bornes: { q: [0.1, 1], a0: [8, 25], e0: [0, 0.9] },
    phrase: 'Two black holes losing orbital energy to gravitational waves with the orbit-averaged Peters (1964) rates plus the mean relativistic periastron advance, in units G = c = total mass = 1; the orbit shrinks and circularises until the periastron reaches 6 GM/c^2, where this averaged model stops (no merger, no full general relativity).' },
  { id: 'amasEtoiles', nom: 'Star cluster around a black hole', science: 'Stellar dynamics', D: 12,
    params: { masseTrouNoir: 1, etoiles: 40, viriel: 0.5, duree: 4, graine: 1 }, bornes: { masseTrouNoir: [0.1, 10], etoiles: [20, 60], viriel: [0.05, 1], duree: [1, 12], graine: [1, 1000000] },
    phrase: 'A Plummer cluster of 20 to 60 equal-mass stars around one massive black hole (masses in units of the total star mass, G = 1), softened Newtonian gravity (softening 0.1) with a leapfrog integrator; the paths of 4 of the stars are drawn, and viriel below 0.5 makes the cluster fall in.' },
  { id: 'supernova', nom: 'Supernova remnant', science: 'Astrophysical gas dynamics', D: 4, nuage: true,
    params: { energie: 1, masseEjecta: 1.4, densite: 1, annees: 40000, graine: 1 }, bornes: { energie: [0.1, 10], masseEjecta: [0.5, 10], densite: [0.01, 10], annees: [1000, 100000], graine: [1, 1000000] },
    phrase: 'The forward shock of a supernova (energy in units of 1e51 erg, ejecta in solar masses, gas density in atoms per cm^3) at 16 moments: free expansion first, then the Sedov-Taylor blast wave R = 1.15 (E t^2 / rho)^(1/5), joined smoothly; positions in parsecs, a spherical analytic model, radiative cooling (which ends the Sedov phase after about 10^4 years) is not modelled.' },
  { id: 'supernovaHydro', nom: 'Supernova blast wave (hydrodynamics)', science: 'Computational gas dynamics', D: 5, nuage: true,
    params: { energie: 1, densite: 1, annees: 10000 }, bornes: { energie: [0.1, 10], densite: [0.01, 10], annees: [1000, 100000] },
    phrase: 'A point explosion (energy in units of 1e51 erg) in uniform gas (atoms per cm^3), computed by real 1-D spherical Lagrangian hydrodynamics (von Neumann-Richtmyer scheme with artificial viscosity, ideal gas gamma 5/3, 450 zones) and checked against the exact Sedov-Taylor solution; the shell is drawn at 16 moments as points spread by mass behind the shock (x, y, z in parsecs, time in years, density / ambient); no ejecta mass, no radiative cooling, spherical symmetry imposed.' },
  { id: 'binaireFusion', nom: 'Black hole merger signal', science: 'Gravitational waves', D: 4,
    params: { m1: 36, m2: 29, z: 0.09, distance: 410, inclinaison: 0, fDepart: 20 }, bornes: { m1: [5, 100], m2: [5, 100], z: [0, 1], distance: [10, 5000], inclinaison: [0, 180], fDepart: [10, 40] },
    phrase: 'The gravitational-wave signal of two non-spinning black holes (source-frame masses in solar masses, redshift z, distance in Mpc, tilt in degrees, starting wave frequency in Hz): inspiral from the 3.5PN TaylorT4 post-Newtonian equation, then merger and ringdown from fitted formulas (remnant mass and spin from Jimenez-Forteza 2017, l = m = 2 ringing from Berti 2006) joined by a simple frequency bridge; not numerical relativity. Drawn as time (s), h+ and hx (x 1e21, no detector response) and wave frequency (Hz).' },
  { id: 'collisionGalaxies', nom: 'Colliding galaxies', science: 'Galactic dynamics', D: 3, nuage: true,
    params: { rapportMasses: 1, inclinaison1: 15, inclinaison2: 60, duree: 4 }, bornes: { rapportMasses: [0.25, 1], inclinaison1: [0, 180], inclinaison2: [0, 180], duree: [0, 10] },
    phrase: 'Two galaxy cores on a parabolic encounter, each carrying a disk of massless test stars (Toomre and Toomre 1972), G = 1, first core mass 1, closest approach 1; disk tilts in degrees (0 = spinning with the orbit, which throws out tidal tails), shown as a film of 12 snapshots of the same stars, evenly spaced from before the encounter (cores 8 apart) to duree time units after closest approach; no dark-matter halo and no star-star gravity.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
const ENTIERS = { systemeSolaire: ['groupe'], etoileS2: ['tours', 'rg'], amasEtoiles: ['etoiles', 'graine'], supernova: ['graine'] };
const parId = (id) => { const s = SYSTEMES.find((x) => x.id === id); if (!s) throw new Error('systeme inconnu: ' + id); return s; };

/** params bornes : non fini -> defaut ; hors bornes -> ramene ; entiers arrondis ; binaire : periastre initial a (1-e) >= 6.5 */
function borner(id, params) {
  const s = parId(id), P = {};
  for (const k of Object.keys(s.params)) {
    let v = Number(params && params[k]); if (!Number.isFinite(v)) v = s.params[k];
    const [a, b] = s.bornes[k]; v = Math.min(b, Math.max(a, v));
    if ((ENTIERS[id] || []).includes(k)) v = Math.round(v);
    P[k] = v;
  }
  if (id === 'binaireTrouNoir') P.e0 = Math.min(P.e0, 1 - 6.5 / P.a0);
  /* systeme solaire : sans annees donnees, la duree par defaut depend du groupe (groupe 1 : 165 ans, Neptune fait un tour) */
  if (id === 'systemeSolaire' && !Number.isFinite(Number(params && params.annees))) P.annees = P.groupe ? ANNEES_GROUPE1 : s.params.annees;
  return P;
}

export function reglagesPhysique(id, params = {}) {
  const s = parId(id), P = borner(id, params);
  return Object.keys(s.params).map((k) => ({ chemin: 'params.' + k, nom: k, min: s.bornes[k][0], max: s.bornes[k][1], valeur: P[k] }));
}

const CALCULS = { systemeSolaire, etoileS2, binaireTrouNoir, amasEtoiles, supernova, supernovaHydro, binaireFusion, collisionGalaxies };
const UNITES = {
  systemeSolaire: 'sans objet (orbites kepleriennes analytiques)', etoileS2: 'sans objet (orbite reguliere)',
  binaireTrouNoir: 'sans objet (equations moyennees)', amasEtoiles: 'par unite de temps N corps',
  supernova: 'sans objet (solution analytique)', supernovaHydro: 'sans objet (hydrodynamique dissipative)',
  binaireFusion: 'sans objet (signal deterministe)', collisionGalaxies: 'sans objet (etoiles test, film d instantanes)',
};
export function simuler(id, params = {}, { n = 1500 } = {}) {
  const s = parId(id), P = borner(id, params);
  n = Math.max(2, Math.floor(n));
  const r = CALCULS[id](P, n);
  if (!r) return echec(P, s.D, n, -1, 'integration interrompue (valeur non finie ou hors domaine)', UNITES[id]);
  if (!fini(r.brut)) return echec(P, s.D, n, -1, 'NaN', UNITES[id]);
  const o = { params: P, D: s.D, n, bornee: true, brut: r.brut, lyapunov: r.lyapunov === undefined ? null : r.lyapunov, uniteLyapunov: UNITES[id], points: null, invariants: r.invariants };
  if (s.nuage) o.nuage = true;
  if (r.film) o.film = r.film;
  if (r.fin) o.fin = r.fin;
  return o;
}
