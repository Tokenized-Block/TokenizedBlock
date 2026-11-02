// tam-grandes-questions.js -- TAM, les GRANDES QUESTIONS : phenomenes populaires (espace, physique, maths) calcules honnetement.
//
// VUE SEULEMENT : rien ici ne se frappe. Meme API et meme forme de sortie que tam-physique.js :
//   simuler(id, params, { n }) -> { params, D, n, bornee, brut (Float64Array n*D), lyapunov, uniteLyapunov, points: null,
//   invariants, nuage?, film?: { images, parImage }, fin? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun tirage natif (mulberry32 a graine). sin/cos/ln = ceux du moteur,
//   exp = expD local (+ - * / seulement) : octets identiques d un moteur JS a l autre.
// Aucun systeme ici n est chaotique : lyapunov = null (sans objet), jamais un chiffre invente.
//
// Constantes SI (CODATA 2018, valeurs exactes depuis la redefinition du SI de 2019 pour hbar, c, k) :
//   hbar = 1.054571817e-34 J s, c = 299792458 m/s, k_B = 1.380649e-23 J/K ; G = 6.67430e-11 (CODATA 2018 recommandee).
// au = 149597870700 m exact (IAU 2012 B2) ; pc = 648000/pi au (IAU 2015 B2) ; annee julienne = 365.25 j (IAU).
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = 3.141592653589793, DEUX_PI = 6.283185307179586, LN2 = 0.6931471805599453, LN10 = 2.302585092994046;
const HBAR = 1.054571817e-34, C = 299792458, KB = 1.380649e-23, G = 6.6743e-11;
const AU = 149597870700, PC = 648000 / PI * AU, MPC = 1e6 * PC, ANNEE = 365.25 * 86400, GYR = 1e9 * ANNEE, AL = C * ANNEE;

function expD(x) { /* e^x avec + - * / seulement (copie de tam-physique.js) */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
const powD = (a, b) => (a === 0 ? 0 : expD(b * lnD(a)));
function racineCubique(x) { /* Newton, depart par expD/lnD ; x > 0 */
  if (!(x > 0)) return 0;
  let y = expD(lnD(x) / 3);
  for (let i = 0; i < 4; i++) y = y - (y * y * y - x) / (3 * y * y);
  return y;
}
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* Box-Muller (lnD, cosD, sinD) : rend une fonction qui donne des normales N(0,1) */
function normales(alea) {
  let garde = null;
  return () => {
    if (garde !== null) { const g = garde; garde = null; return g; }
    let u = alea(); while (u <= 0) u = alea();
    const r = Math.sqrt(-2 * lnD(u)), t = DEUX_PI * alea();
    garde = r * sinD(t); return r * cosD(t);
  };
}
const SANS_LYAP = 'sans objet (systeme non chaotique : aucun exposant de Lyapunov n est mesure)';

// ======================= 1. vide quantique : effet Casimir =======================
// Casimir (1948), Proc. K. Ned. Akad. Wet. 51, 793 : F/A = pi^2 hbar c / (240 d^4) entre deux plaques parfaitement conductrices.
// MESURE (pas la formule recopiee) : somme des modes electromagnetiques entre les plaques, coupure exponentielle e^{-lambda w},
//   moins le continuum (l integrale = le meme volume de vide hors des plaques). Par unite d aire :
//   E/A = (hbar c / 2 pi) [ sum' h(k_n) - (d/pi) int h ],  h(k) = int_k^inf w^2 e^{-lambda w} dw,  k_n = n pi / d
//   (2 polarisations pour n >= 1, 1 pour n = 0 = la demi-ponderation de sum'). La pression dE/dd se derive TERME A TERME :
//   dE/dd = (hbar c / 2 pi) [ (1/d) sum_{n>=1} k_n^3 e^{-lambda k_n} - 6 / (pi lambda^4) ] ; puis Richardson en lambda (erreur ~ lambda^2).
function pressionModes(d, lam) {
  const kap = PI / d; let s = 0;
  for (let n = 1; ; n++) { const k = n * kap; s += k * k * k * expD(-lam * k); if (lam * k > 70) break; }
  return HBAR * C / DEUX_PI * (s / d - 6 / (PI * lam * lam * lam * lam));
}
function pressionCasimir(d) { const l = 0.04 * d; return (4 * pressionModes(d, l / 2) - pressionModes(d, l)) / 3; }
const formuleCasimir = (d) => PI * PI * HBAR * C / (240 * d * d * d * d);
function videQuantique(P, n) {
  const d = P.d * 1e-6, M = P.modes, alea = mulberry32(P.graine >>> 0), brut = new Float64Array(n * 3);
  /* vue : colonnes [x / d (plaques en 0 et 1), nombre d onde k d / pi, champ] ; dedans : modes entiers seulement ; dehors : tout k */
  const dedans = Math.floor(0.6 * n);
  for (let i = 0; i < n; i++) {
    let x, k, f;
    if (i < dedans) { k = 1 + (i % M); x = alea(); f = sinD(k * PI * x); }
    else { k = 0.3 + (M + 0.2) * alea(); const cote = alea() < 0.5; x = cote ? -alea() : 1 + alea(); f = sinD(k * PI * x + DEUX_PI * alea()); }
    brut[3 * i] = x; brut[3 * i + 1] = k; brut[3 * i + 2] = 0.4 * f;
  }
  const mesure = pressionCasimir(d), formule = formuleCasimir(d), double = pressionCasimir(2 * d);
  return { brut, invariants: {
    pression: { mesure, formule, ecart: Math.abs(mesure - formule) / formule, d, unite: 'Pa (attractive)' },
    loiEnPuissance: { rapportD_2D: mesure / double, attendu: 16 },
    energie: { formule: -PI * PI * HBAR * C / (720 * d * d * d), unite: 'J/m^2' },
    modesDessines: { dedans: M, note: 'inside: only k = n pi / d fits; outside: any k' },
  } };
}

// ======================= 2. big rip : energie noire fantome (w < -1) =======================
// Univers plat, matiere + energie noire d equation d etat w constante, sans radiation :
//   H(a)^2 = H0^2 [ Om a^-3 + (1 - Om) a^{-3(1+w)} ]. Avec w < -1, a -> infini en un temps fini.
// Caldwell, Kamionkowski & Weinberg (2003), PRL 91, 071301, eq. (2) : t_rip - t0 ~ (2/3) |1+w|^-1 H0^-1 (1 - Om)^-1/2
//   (approximation qui neglige la matiere ; ici l integrale complete est MESUREE et comparee).
// Integration en u = ln a : dt = du / H. Au-dela de u_tot la matiere est negligeable (< 1e-12) : queue analytique exacte.
const KM_MPC_GYR = MPC / 1000 / GYR; // 1 / (1 km/s/Mpc) en Gyr (~977.8)
function simpson(f, a, b, m) { const h = (b - a) / m; let s = f(a) + f(b); for (let i = 1; i < m; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return s * h / 3; }
function bigRip(P, n) {
  const eps = -(1 + P.w), Om = P.Om, OL = 1 - Om, tH = KM_MPC_GYR / P.H0;
  const f = (u) => 1 / Math.sqrt(Om * expD(-3 * u) + OL * expD(3 * eps * u));
  const formule = 2 / (3 * eps * Math.sqrt(OL)) * tH;
  /* age aujourd hui : int_0^1 da / (a E) avec a = s^2 -> 2 s^2 / sqrt(Om + OL s^{6 + 6 eps}) */
  const t0 = tH * simpson((s) => (s === 0 ? 0 : 2 * s * s / Math.sqrt(Om + OL * powD(s, 6 + 6 * eps))), 0, 1, 2000);
  const queue = (U) => expD(-1.5 * eps * U) / (1.5 * eps * Math.sqrt(OL));
  const Utot = 12; /* matiere / fantome < 0.43 e^{-36} a u = 12 : la queue fantome pure est exacte a 1e-15 pres */
  const mesure = tH * (simpson(f, 0, Utot, 4800) + queue(Utot));
  /* traces : K galaxies (positions comobiles x0 tirees dans une tranche), m instants chacune, du present a 0.1 % du temps restant */
  const K = Math.max(1, Math.min(12, Math.floor(n / 2))), m = Math.max(1, Math.floor(n / K));
  const Ufin = lnD(1e3) / (1.5 * eps); // queue(Ufin) ~ 1e-3 du temps total (forme fantome pure)
  const tU = new Float64Array(m); let cum = 0;
  for (let j = 1; j < m; j++) {
    const a = Ufin * (j - 1) / (m - 1), b = Ufin * j / (m - 1), sub = 2 * Math.ceil((b - a) / 0.02);
    cum += simpson(f, a, b, sub); tU[j] = cum * tH;
  }
  const alea = mulberry32(P.graine >>> 0), brut = new Float64Array(n * 3);
  for (let g = 0; g < K; g++) {
    const ph = DEUX_PI * (g + 0.6 * alea()) / K, r0 = 0.3 + 0.7 * alea(), x0 = r0 * cosD(ph), y0 = r0 * sinD(ph);
    for (let j = 0; j < m; j++) {
      const i = g * m + j, u = Ufin * j / Math.max(1, m - 1), e = 1 + u / LN10; // echelle LOG : 1 + log10 a
      brut[3 * i] = x0 * e; brut[3 * i + 1] = y0 * e; brut[3 * i + 2] = tU[j];
    }
  }
  for (let i = K * m; i < n; i++) for (let k = 0; k < 3; k++) brut[3 * i + k] = brut[3 * (K * m - 1) + k];
  return { brut, tRip: t0 + mesure, invariants: {
    tempsAvantRip: { mesure, formule, ecart: Math.abs(mesure - formule) / formule, unite: 'Gyr after today', approchee: 'it neglects matter; the measured value integrates the full history' },
    ageAujourdhui: { valeur: t0, unite: 'Gyr' },
    dernierInstantDessine: { avantRip: mesure - tU[m - 1], log10a: Ufin / LN10, unite: 'Gyr' },
  } };
}

// ======================= 3. faux vide : nucleation de bulles de vrai vide =======================
// Coleman (1977) PRD 15, 2929 ; Coleman & De Luccia (1980) PRD 21, 3305 : bulle en paroi mince, la paroi suit l hyperboloide
//   R(t)^2 - c^2 (t - t_n)^2 = R0^2  ->  vitesse de paroi -> c. Ici c = 1, boite periodique de cote 1.
// Fraction de vrai vide : Kolmogorov (1937), Johnson-Mehl (1939), Avrami (1939-41) : f = 1 - exp(-X),
//   X = Gamma (4 pi / 3) c^3 t^4 / 4 (R0 -> 0) ; X exact avec R0 calcule aussi (Simpson).
// Taux de nucleation Gamma ILLUSTRATIF (par unite de volume et de temps de la boite) : aucune prediction pour notre univers.
const X_FIN = 4; // le film va jusqu a f = 1 - e^-4 = 98 %
function fauxVide(P, n) {
  const Ga = P.taux, R0 = P.R0, T = Math.sqrt(Math.sqrt(3 * X_FIN / (PI * Ga))), alea = mulberry32(P.graine >>> 0);
  const B = []; // bulles acceptees { x, y, z, t }
  const dist2 = (b, x, y, z) => { let dx = x - b.x, dy = y - b.y, dz = z - b.z; dx -= Math.round(dx); dy -= Math.round(dy); dz -= Math.round(dz); return dx * dx + dy * dy + dz * dz; };
  const rayon2 = (b, t) => R0 * R0 + (t - b.t) * (t - b.t);
  let t = 0, tentatives = 0;
  for (;;) {
    let u = alea(); while (u <= 0) u = alea();
    t -= lnD(u) / Ga; if (t > T) break; tentatives++;
    const x = alea(), y = alea(), z = alea();
    let couvert = false;
    for (let j = 0; j < B.length && !couvert; j++) if (dist2(B[j], x, y, z) < rayon2(B[j], t)) couvert = true;
    if (!couvert) B.push({ x, y, z, t }); /* nucleation seulement dans le FAUX vide */
  }
  /* instant ou un point devient vrai vide : min_j t_j + sqrt(r^2 - R0^2) */
  const tCouvre = (x, y, z) => { let m = Infinity; for (const b of B) { const r2 = dist2(b, x, y, z), v = b.t + (r2 > R0 * R0 ? Math.sqrt(r2 - R0 * R0) : 0); if (v < m) m = v; } return m; };
  const NS = 6000, sondes = new Float64Array(NS);
  for (let i = 0; i < NS; i++) sondes[i] = tCouvre(alea(), alea(), alea());
  const temps = [], mesure = [], avrami = [], avramiR0 = [];
  const XR0 = (tt) => Ga * simpson((s) => { const r2 = R0 * R0 + s * s; return 4 * PI / 3 * r2 * Math.sqrt(r2); }, 0, tt, 200);
  for (let k = 1; k <= 10; k++) {
    const tk = T * k / 10; let c = 0; for (let i = 0; i < NS; i++) if (sondes[i] <= tk) c++;
    temps.push(tk); mesure.push(c / NS); avrami.push(1 - expD(-(4 * PI / 3) * Ga * tk * tk * tk * tk / 4)); avramiR0.push(1 - expD(-XR0(tk)));
  }
  /* film : une tranche z = 0.5, les memes points a chaque instant ; 3e colonne = 1 si vrai vide */
  const images = Math.min(12, n), parImage = Math.floor(n / images), brut = new Float64Array(n * 3);
  const px = new Float64Array(parImage), py = new Float64Array(parImage), pt = new Float64Array(parImage);
  for (let i = 0; i < parImage; i++) { px[i] = alea(); py[i] = alea(); pt[i] = tCouvre(px[i], py[i], 0.5); }
  for (let k = 0; k < images; k++) {
    const tk = T * (k + 1) / images;
    for (let i = 0; i < parImage; i++) { const r = k * parImage + i; brut[3 * r] = px[i]; brut[3 * r + 1] = py[i]; brut[3 * r + 2] = pt[i] <= tk ? 0.3 : 0; }
  }
  for (let r = images * parImage; r < n; r++) for (let k = 0; k < 3; k++) brut[3 * r + k] = brut[3 * (images * parImage - 1) + k];
  let vMin = 1;
  for (const b of B) { const s = T - b.t; if (s > T / 2) { const v = s / Math.sqrt(R0 * R0 + s * s); if (v < vMin) vMin = v; } }
  const vAncienne = B.length ? (T - B[0].t) / Math.sqrt(R0 * R0 + (T - B[0].t) * (T - B[0].t)) : NaN;
  let ecartMax = 0; for (let k = 0; k < 10; k++) ecartMax = Math.max(ecartMax, Math.abs(mesure[k] - avramiR0[k]));
  return { brut, film: { images, parImage }, invariants: {
    fractionVraiVide: { temps, mesure, avrami, avramiR0, ecartMax, sondes: NS },
    vitesseParoi: { plusAncienne: vAncienne, minBullesAgees: vMin, unite: 'c' },
    bulles: { acceptees: B.length, tirages: tentatives, dureeT: T },
  } };
}

// ======================= 4. centre de la Terre : modele PREM =======================
// Densite PREM : Dziewonski & Anderson (1981), PEPI 25, 297, table 1 ; polynomes en x = r / 6371 km, g/cm^3.
// Coefficients COPIES (lus le 2026-11-01) de la transcription PREM du generateur GENIE, fonction Density(r), x = r / rE :
//   https://raw.githubusercontent.com/GENIE-MC/Generator/master/src/Framework/Utils/PREM.cxx
//   lu : 13.0885 - 8.8381x^2 | 12.5815 - 1.2638x - 3.6426x^2 - 5.5281x^3 | 7.9565 - 6.4761x + 5.5283x^2 - 3.0807x^3 |
//   5.3197 - 1.4836x | 11.2494 - 8.0298x | 7.1089 - 3.8045x | 2.691 + 0.6924x | 2.90 | 2.60 | 1.02 : identiques couche par couche.
//   Le manteau inferieur (3480-5701 km) a un seul polynome.
// Gravite interieure : g(r) = G M(r) / r^2, M(r) integre EXACTEMENT (polynomes). Tunnel selon un diametre, sans air ni rotation :
//   x'' = -g(|x|) signe(x), RK4. Reference : Klotz (2015), Am. J. Phys. 83, 231 : PREM 38 min 11 s, densite uniforme 42 min 12 s (aller simple).
const R_TERRE = 6371e3;
const PREM = Object.freeze([ // [rayon haut en km, a, b, c, d]
  [1221.5, 13.0885, 0, -8.8381, 0], [3480, 12.5815, -1.2638, -3.6426, -5.5281], [5701, 7.9565, -6.4761, 5.5283, -3.0807],
  [5771, 5.3197, -1.4836, 0, 0], [5971, 11.2494, -8.0298, 0, 0], [6151, 7.1089, -3.8045, 0, 0], [6346.6, 2.691, 0.6924, 0, 0],
  [6356, 2.9, 0, 0, 0], [6368, 2.6, 0, 0, 0], [6371, 1.02, 0, 0, 0],
].map(Object.freeze));
/* masse (kg) sous x = r / R : 4 pi R^3 rho_unite int x^2 (a + b x + c x^2 + d x^3) */
const primitive = (L, x) => x * x * x * (L[1] / 3 + x * (L[2] / 4 + x * (L[3] / 5 + x * L[4] / 6)));
const MASSES_CUM = (() => { const m = [0]; let bas = 0; for (const L of PREM) { const h = L[0] / 6371; m.push(m[m.length - 1] + 4 * PI * R_TERRE * R_TERRE * R_TERRE * 1000 * (primitive(L, h) - primitive(L, bas))); bas = h; } return m; })();
function massePREM(r) {
  const x = Math.min(1, r / R_TERRE); let bas = 0;
  for (let i = 0; i < PREM.length; i++) {
    const L = PREM[i], h = L[0] / 6371;
    if (x <= h || i === PREM.length - 1) return MASSES_CUM[i] + 4 * PI * R_TERRE * R_TERRE * R_TERRE * 1000 * (primitive(L, x) - primitive(L, bas));
    bas = h;
  }
  return MASSES_CUM[PREM.length];
}
const M_TERRE = MASSES_CUM[PREM.length];
const gPREM = (r) => (r <= 0 ? 0 : G * massePREM(r) / (r * r));
const gUniforme = (r) => G * M_TERRE * Math.min(r, R_TERRE) / (R_TERRE * R_TERRE * R_TERRE);
function chute(gf, h, duree, rows) { /* RK4 ; rows : null (mesure du demi-trajet) ou { n, pas, sortie } */
  let x = R_TERRE, v = 0, t = 0;
  const acc = (p) => -gf(Math.abs(p)) * (p > 0 ? 1 : p < 0 ? -1 : 0);
  const pas = (hh) => {
    const a1 = acc(x), x2 = x + 0.5 * hh * v, v2 = v + 0.5 * hh * a1, a2 = acc(x2), x3 = x + 0.5 * hh * v2, v3 = v + 0.5 * hh * a2, a3 = acc(x3);
    const x4 = x + hh * v3, v4 = v + hh * a3, a4 = acc(x4);
    x += hh / 6 * (v + 2 * v2 + 2 * v3 + v4); v += hh / 6 * (a1 + 2 * a2 + 2 * a3 + a4); t += hh;
  };
  if (!rows) { /* temps jusqu a l arret de l autre cote : v passe de < 0 a >= 0 */
    for (;;) { const vA = v, tA = t; pas(h); if (vA < 0 && v >= 0) return tA + h * (-vA) / (v - vA); if (t > 1e5) return NaN; }
  }
  rows.sortie(0, x, v, t);
  for (let i = 1; i < rows.n; i++) { for (let k = 0; k < rows.pas; k++) pas(h); rows.sortie(i, x, v, t); }
  return t;
}
function centreTerre(P, n) {
  const gf = P.uniforme ? gUniforme : gPREM;
  const demiPREM = chute(gPREM, 0.5, 0, null), demiUni = chute(gUniforme, 0.5, 0, null), demi = P.uniforme ? demiUni : demiPREM;
  const duree = P.traversees * demi, pas = Math.max(1, Math.ceil(duree / Math.max(1, n - 1) / 1)), h = duree / (Math.max(1, n - 1) * pas);
  const brut = new Float64Array(n * 4);
  chute(gf, h, duree, { n, pas, sortie: (i, x, v, t) => { brut[4 * i] = x / R_TERRE; brut[4 * i + 1] = v / 1000; brut[4 * i + 2] = t / 60; brut[4 * i + 3] = gf(Math.abs(x)); } });
  let gMax = 0, rMax = 0; for (let r = 1; r <= 6371; r++) { const g = gPREM(r * 1000); if (g > gMax) { gMax = g; rMax = r; } }
  const formuleUni = PI * Math.sqrt(R_TERRE * R_TERRE * R_TERRE / (G * M_TERRE));
  return { brut, invariants: {
    gSurface: { valeur: gPREM(R_TERRE), unite: 'm/s^2' }, masse: { valeur: M_TERRE, unite: 'kg' },
    gMax: { valeur: gMax, rayonKm: rMax, unite: 'm/s^2' }, gCentre: { valeur: gPREM(1) },
    traverseePREM: { mesure: demiPREM / 60, klotz2015: 38 + 11 / 60, unite: 'min (one way, surface to surface)' },
    traverseeUniforme: { mesure: demiUni / 60, formule: formuleUni / 60, periode: 2 * formuleUni / 60, unite: 'min' },
  } };
}

// ======================= 5. vers Mars : transfert de Hohmann =======================
// Hohmann (1925), « Die Erreichbarkeit der Himmelskorper ». Orbites circulaires coplanaires a = 1 et a_cible (Mars 1.524 au).
// GM du Soleil : constante de Gauss k = 0.01720209895 au^{3/2} / jour (IAU 1976, definie) ; mu = k^2 au^3 / jour^2.
// Transfert : a_t = (r1 + r2) / 2, duree = pi sqrt(a_t^3 / mu) ; phase de depart = pi - n2 * duree ; synodique = 2 pi / |n1 - n2|.
// MESURE : la duree est aussi INTEGREE (RK4, deux corps) du perihelie jusqu au passage en angle pi.
const K_GAUSS = 0.01720209895, MU_S = K_GAUSS * K_GAUSS;
function versMars(P, n) {
  const r1 = 1, r2 = P.aCible, at = (r1 + r2) / 2, e = (r2 - r1) / (r2 + r1);
  const formule = PI * Math.sqrt(at * at * at / MU_S), n1 = Math.sqrt(MU_S / (r1 * r1 * r1)), n2 = Math.sqrt(MU_S / (r2 * r2 * r2)), nt = Math.sqrt(MU_S / (at * at * at));
  /* integration : depart au perihelie r1 avec la vitesse vis-viva */
  const y = [r1, 0, 0, Math.sqrt(MU_S * (2 / r1 - 1 / at))], h = 0.05;
  const der = (s) => { const r2_ = s[0] * s[0] + s[1] * s[1], ir3 = 1 / (r2_ * Math.sqrt(r2_)); return [s[2], s[3], -MU_S * s[0] * ir3, -MU_S * s[1] * ir3]; };
  let t = 0, mesure = NaN;
  for (let it = 0; it < 4e5; it++) {
    const k1 = der(y), a = y.map((v, i) => v + 0.5 * h * k1[i]), k2 = der(a), b = y.map((v, i) => v + 0.5 * h * k2[i]), k3 = der(b), c = y.map((v, i) => v + h * k3[i]), k4 = der(c);
    const yA = y[1];
    for (let i = 0; i < 4; i++) y[i] += h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    if (yA > 0 && y[1] <= 0 && y[0] < 0) { mesure = t + h * yA / (yA - y[1]); break; }
    t += h;
  }
  const phase = PI - n2 * formule, synodique = DEUX_PI / Math.abs(n1 - n2);
  /* film : 3 corps par image [vaisseau, Terre, Mars], colonnes [x au, y au, t jours] ; vaisseau par l equation de Kepler (Newton) */
  const images = Math.max(1, Math.floor(n / 3)), brut = new Float64Array(n * 3);
  for (let k = 0; k < images; k++) {
    const tk = formule * k / Math.max(1, images - 1), M = nt * tk; let E = M;
    for (let it = 0; it < 30; it++) E -= (E - e * sinD(E) - M) / (1 - e * cosD(E));
    const pos = [[at * (cosD(E) - e), at * Math.sqrt(1 - e * e) * sinD(E)], [r1 * cosD(n1 * tk), r1 * sinD(n1 * tk)], [r2 * cosD(phase + n2 * tk), r2 * sinD(phase + n2 * tk)]];
    for (let j = 0; j < 3; j++) { const r = 3 * k + j; if (r >= n) break; brut[3 * r] = pos[j][0]; brut[3 * r + 1] = pos[j][1]; brut[3 * r + 2] = tk; }
  }
  for (let r = 3 * images; r < n; r++) for (let k = 0; k < 3; k++) brut[3 * r + k] = brut[3 * (r - 1) + k];
  const kms = AU / 86400 / 1000, vE = Math.sqrt(MU_S / r1), vM = Math.sqrt(MU_S / r2);
  return { brut, film: images > 1 ? { images, parImage: 3 } : undefined, invariants: {
    dureeTransfert: { mesure, formule, ecart: Math.abs(mesure - formule) / formule, unite: 'days' },
    periodeSynodique: { valeur: synodique, unite: 'days' },
    anglePhase: { valeur: phase * 180 / PI, unite: 'deg (target ahead of Earth at launch)' },
    deltaV: { depart: kms * (Math.sqrt(MU_S * (2 / r1 - 1 / at)) - vE), arrivee: kms * (vM - Math.sqrt(MU_S * (2 / r2 - 1 / at))), unite: 'km/s (heliocentric, no planet gravity)' },
    ellipse: { a: at, e },
  } };
}

// ======================= 6. zero absolu : condensation de Bose-Einstein =======================
// Gaz de Bose IDEAL dans un piege harmonique isotrope 3-D de frequence omega, N atomes.
// Bagnato, Pritchard & Kleppner (1987), PRA 35, 4354 : k Tc = hbar omega (N / zeta(3))^{1/3}, N0/N = 1 - (T/Tc)^3 (limite N -> infini).
// MESURE : statistique de Bose EXACTE sur les niveaux discrets E_n = n hbar omega (degenerescence (n+1)(n+2)/2, origine au fondamental) :
//   N = sum_n g_n / (e^{y + n x} - 1), x = hbar omega / kT, y = -ln z resolu par bissection ; N0 = 1 / (e^y - 1).
// Nuage : atomes du condensat ~ |psi0|^2 (gaussienne sigma = a_ho / sqrt 2) ; atomes thermiques = densite SEMI-CLASSIQUE de Bose
//   n(r) ~ sum_j z^j / j^3 * gaussienne(sigma^2 = (kT / hbar omega) a_ho^2 / j) (developpement de f = sum_j z^j e^{-j beta H}).
// Unite de longueur : a_ho = sqrt(hbar / m omega) (la masse de l atome n entre pas dans Tc).
function zeta3() { let s = 0; const K = 1000; for (let k = K; k >= 1; k--) s += 1 / (k * k * k); return s + 1 / (2 * K * K) - 1 / (2 * K * K * K) + 1 / (4 * K * K * K * K); }
const ZETA3 = zeta3();
function boseExact(N, kT_hw) {
  const x = 1 / kT_hw, nMax = Math.ceil(60 / x) + 2, en = new Float64Array(nMax + 1), gn = new Float64Array(nMax + 1);
  for (let k = 0; k <= nMax; k++) { en[k] = expD(k * x); gn[k] = (k + 1) * (k + 2) / 2; }
  const total = (y) => {
    const ey = expD(y), e0 = y < 1e-4 ? y + y * y / 2 + y * y * y / 6 : ey - 1;
    let s = 1 / e0; for (let k = 1; k <= nMax; k++) s += gn[k] / (en[k] * ey - 1);
    return { s, n0: 1 / e0 };
  };
  let lo = lnD(1e-16), hi = lnD(80);
  for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2; if (total(expD(mid)).s > N) lo = mid; else hi = mid; }
  const y = expD((lo + hi) / 2), r = total(y);
  return { n0: r.n0, z: expD(-y), y };
}
function zeroAbsolu(P, n) {
  const N = P.atomes, w = DEUX_PI * P.frequence, t = P.T, kTc_hw = racineCubique(N / ZETA3), kT_hw = t * kTc_hw;
  const ex = boseExact(N, kT_hw), f0 = ex.n0 / N, formule = t < 1 ? 1 - t * t * t : 0;
  const Tc = HBAR * w / KB * kTc_hw;
  /* melange thermique : poids z^j / j^3, j <= J */
  const J = 4000, cum = new Float64Array(J + 1); let zj = 1;
  for (let j = 1; j <= J; j++) { zj *= ex.z; cum[j] = cum[j - 1] + zj / (j * j * j); }
  const alea = mulberry32(P.graine >>> 0), gauss = normales(alea), brut = new Float64Array(n * 3);
  let dansCondensat = 0;
  for (let i = 0; i < n; i++) {
    let s;
    if (alea() < f0) { s = Math.SQRT1_2; dansCondensat++; }
    else {
      const u = alea() * cum[J]; let a = 1, b = J; while (a < b) { const m = (a + b) >> 1; if (cum[m] < u) a = m + 1; else b = m; }
      s = Math.sqrt(kT_hw / a);
    }
    brut[3 * i] = s * gauss(); brut[3 * i + 1] = s * gauss(); brut[3 * i + 2] = s * gauss();
  }
  return { brut, invariants: {
    fractionCondensat: { mesure: f0, formule, ecart: Math.abs(f0 - formule), echantillon: dansCondensat / n, atomes: N },
    temperatureCritique: { kTc_sur_hbarOmega: kTc_hw, Tc_nK: Tc * 1e9, T_nK: t * Tc * 1e9 },
    rayons: { condensat: Math.SQRT1_2, thermique: Math.sqrt(kT_hw), unite: 'a_ho = sqrt(hbar / m omega)' },
    fugacite: { z: ex.z, zeta3: ZETA3 },
  } };
}

// ======================= 7. taille de l univers observable =======================
// LambdaCDM plat, parametres Planck 2018 VI (A&A 641, A6, 2020 ; arXiv:1807.06209), Table 2, colonne TT,TE,EE+lowE+lensing,
//   lue le 2026-11-01 sur https://ar5iv.labs.arxiv.org/html/1807.06209 : H0 = 67.36 +- 0.54, Omega_m = 0.3153 +- 0.0073,
//   Age = 13.797 +- 0.023 Gyr (la colonne +BAO donne 13.787 +- 0.020, H0 67.66 +- 0.42 ; non utilisee ici).
// Radiation : T_CMB = 2.7255 K (Fixsen 2009, ApJ 707, 916) ; neutrinos sans masse, N_eff = 3.046 (Mangano et al. 2005) :
//   Omega_r = Omega_gamma (1 + 7/8 (4/11)^{4/3} N_eff), Omega_gamma = rho_gamma / rho_crit calcule depuis hbar, c, k, G.
//   Simplification : le neutrino massif de 0.06 eV de Planck est ignore.
// Distance comobile D_C(a) = (c / H0) int_a^1 da' / sqrt(Or + Om a' + OL a'^4) ; horizon = D_C(0) ; a = s^2 (integrand lisse).
function cosmoTable(P) {
  const H = P.H0 * 1000 / MPC, rhoC = 3 * H * H / (8 * PI * G); // kg/m^3
  const kT = KB * 2.7255, rhoGam = PI * PI / 15 * kT * kT * kT * kT / (HBAR * HBAR * HBAR * C * C * C * C * C);
  const Or = rhoGam / rhoC * (1 + 7 / 8 * powD(4 / 11, 4 / 3) * 3.046), Om = P.Om, OL = 1 - Om - Or;
  const fD = (s) => 2 * s / Math.sqrt(Or + Om * s * s + OL * s * s * s * s * s * s * s * s);
  const fT = (s) => 2 * s * s * s / Math.sqrt(Or + Om * s * s + OL * s * s * s * s * s * s * s * s);
  const NS = 4000, S = new Float64Array(NS + 1), DC = new Float64Array(NS + 1), TL = new Float64Array(NS + 1);
  for (let i = 0; i <= NS; i++) S[i] = i / NS;
  for (let i = NS - 1; i >= 0; i--) {
    const a = S[i], b = S[i + 1], m = (a + b) / 2, h = b - a;
    DC[i] = DC[i + 1] + h / 6 * (fD(a) + 4 * fD(m) + fD(b)); TL[i] = TL[i + 1] + h / 6 * (fT(a) + 4 * fT(m) + fT(b));
  }
  const dH = C / 1000 / P.H0, tH = KM_MPC_GYR / P.H0; // Mpc, Gyr
  const dc = (aa) => dH * simpson(fD, Math.sqrt(aa), 1, 2000);
  return { S, DC, TL, dH, tH, Or, OL, dc, NS };
}
function tailleUnivers(P, n) {
  const T = cosmoTable(P), horizon = T.DC[0] * T.dH, age = T.TL[0] * T.tH, dcZ1 = T.dc(0.5), dcCMB = T.dc(1 / 1091);
  /* galaxies dans une tranche (disque) jusqu a la surface de derniere diffusion z = 1090, densite uniforme par aire ;
     colonnes [x Gpc, y Gpc, temps de regard en arriere Gyr] -> le cone de lumiere ; 10 % des points = le bord (horizon) */
  const alea = mulberry32(P.graine >>> 0), brut = new Float64Array(n * 3), nH = Math.floor(n / 10);
  const versS = (dMpc) => { const q = dMpc / T.dH; let a = 0, b = T.NS; while (b - a > 1) { const m = (a + b) >> 1; if (T.DC[m] > q) a = m; else b = m; } const fr = (T.DC[a] - q) / (T.DC[a] - T.DC[b] || 1); return a + fr; };
  for (let i = 0; i < n; i++) {
    const bord = i < nH, d = bord ? horizon : dcCMB * Math.sqrt(alea()), ph = DEUX_PI * alea();
    /* game82 (audit) : au bord, d / dH depasse DC[0] d un arrondi -> j = -1e-16 -> TL[-1] -> NaN (H0 50-58, 14 positions sur 401) ; j borne */
    const j = Math.min(T.NS, Math.max(0, versS(d))), j0 = Math.min(T.NS - 1, Math.floor(j)), fr = j - j0, tl = (T.TL[j0] + fr * (T.TL[j0 + 1] - T.TL[j0]));
    brut[3 * i] = d / 1000 * cosD(ph); brut[3 * i + 1] = d / 1000 * sinD(ph); brut[3 * i + 2] = (T.TL[0] - tl) * T.tH;
  }
  return { brut, invariants: {
    rayonObservable: { Gpc: horizon / 1000, Gal: horizon * MPC / AL / 1e9, unite: 'comoving' },
    distanceZ1: { Gpc: dcZ1 / 1000 }, distanceCMB: { Gpc: dcCMB / 1000, z: 1090 },
    age: { Gyr: age }, densites: { Om: P.Om, OL: T.OL, Or: T.Or },
  } };
}

// ======================= 8. le nombre pi, trois chemins =======================
// Leibniz (1674) / Madhava : pi = 4 sum (-1)^k / (2k+1) ; erreur apres N termes ~ 1/N (reste alterne : 4 / (4N) au premier ordre).
// Machin (1706) : pi = 16 arctan(1/5) - 4 arctan(1/239), chaque arctan par sa serie de Taylor (K termes).
// Monte-Carlo : quart de disque, 4 * (points dedans) / N ; ecart-type sqrt(pi (4 - pi) / N) (loi binomiale).
function arctanSerie(x, K) { let s = 0, p = x; const x2 = x * x; for (let k = 0; k < K; k++) { s += (k % 2 ? -p : p) / (2 * k + 1); p *= x2; } return s; }
const machin = (K) => 16 * arctanSerie(1 / 5, K) - 4 * arctanSerie(1 / 239, K);
function nombrePi(P, n) {
  const NL = P.termesLeibniz; let sl = 0; const courbeL = [];
  for (let k = 0, prochain = 1; k < NL; k++) { sl += (k % 2 ? -4 : 4) / (2 * k + 1); if (k + 1 === prochain || k + 1 === NL) { courbeL.push([k + 1, Math.abs(sl - PI)]); prochain *= 2; } }
  const courbeM = []; let pour1e12 = null;
  for (let K = 1; K <= 14; K++) { const e = Math.abs(machin(K) - PI); courbeM.push([K, e]); if (pour1e12 === null && e < 1e-12) pour1e12 = K; }
  const alea = mulberry32(P.graine >>> 0), brut = new Float64Array(n * 3), courbeMC = []; let dedans = 0;
  for (let i = 0; i < n; i++) {
    const x = alea(), y = alea(); if (x * x + y * y <= 1) dedans++;
    const err = Math.abs(4 * dedans / (i + 1) - PI);
    brut[3 * i] = x; brut[3 * i + 1] = y; brut[3 * i + 2] = err;
    if (((i + 1) & i) === 0 || i === n - 1) courbeMC.push([i + 1, err]);
  }
  const mc = 4 * dedans / n, eM = Math.abs(machin(P.termesMachin) - PI);
  return { brut, invariants: {
    /* game82 (Phil : « les donnees reelles ») : la valeur de reference de toutes les erreurs ci-dessous (pi en double precision) */
    reference: { pi: PI },
    leibniz: { valeur: sl, erreur: Math.abs(sl - PI), NfoisErreur: NL * Math.abs(sl - PI), termes: NL },
    machin: { valeur: machin(P.termesMachin), erreur: eM, termes: P.termesMachin, termesPour1e12: pour1e12 },
    monteCarlo: { estimation: mc, erreur: Math.abs(mc - PI), points: n, ecartTypeAttendu: Math.sqrt(PI * (4 - PI) / n) },
    courbes: { leibniz: courbeL, machin: courbeM, monteCarlo: courbeMC, unite: '[terms or points, |error|]' },
  } };
}

// ======================= 9. calendrier cosmique =======================
// L histoire de l univers ramenee a une annee (age -> 365 jours ; annee non bissextile, minuit du 31 decembre = aujourd hui).
// Ages publies (annees avant aujourd hui), chacun COPIE d une page lue le 2026-11-01 (URL et texte lu en commentaire).
//   Un nombre : annees avant aujourd hui. { apresBigBang: x } : x annees apres le Big Bang (reste avant aujourd hui quel que soit ageUnivers).
const EVENEMENTS = Object.freeze([
  ['Big Bang', null], // = ageUnivers ; defaut 13.797 Gyr = Planck 2018 VI Table 2, TT,TE,EE+lowE+lensing (voir section 7)
  ['First stars', { apresBigBang: 0.3e9 }], // milieu de « between 250 and 350 million years after the beginning of the Universe »
  //   (https://www.sci.news/astronomy/first-generation-stars-big-bang-09796.html, resume de Laporte et al. 2021, MNRAS 505, 3336 ;
  //   l abstract primaire https://arxiv.org/abs/2104.08168 ne donne que « formed earlier than a redshift z~10 ») : incertain, depend des modeles
  ['Milky Way disk begins', 13.0e9], // Xiang & Rix (2022), Nature, doi 10.1038/s41586-022-04496-5, https://arxiv.org/abs/2203.12110 :
  //   « the formation of the Galactic old (thick) disk started 13 Gyr ago »
  ['Sun forms', 4567.30e6], // Connelly et al. (2012), Science 338, 651, doi 10.1126/science.1226919 (Europe PMC, PMID 23118187) :
  //   « CAIs define a brief formation interval corresponding to an age of 4567.30 +- 0.16 million years »
  ['Earth forms', 4.54e9], // USGS, https://pubs.usgs.gov/gip/geotime/age.html : « 4.54 billion years », « uncertainty of less than 1 percent »
  ['First life (Strelley Pool stromatolites)', 3430e6], // Allwood et al. (2006), Nature 441, 714, doi 10.1038/nature04764 (Europe PMC) :
  //   « The 3,430-million-year-old Strelley Pool Chert » ; des traces plus anciennes sont proposees mais contestees
  ['First dinosaurs', 230e6], // Martinez et al. (2011), Science 331, 206, doi 10.1126/science.1198467 (Europe PMC) :
  //   « Some 230 million years ago in the Late Triassic (mid Carnian) »
  ['Non-avian dinosaurs extinct', 66.038e6], // impact de Chicxulub « 66,038,000 years ago » (communique Renne et al. 2013,
  //   https://phys.org/news/2013-02-precise-dates-comet-asteroid-impact.html) ; l abstract (Science 339, 684, doi 10.1126/science.1230492,
  //   Europe PMC) : extinction et impact synchrones « to within 32,000 years »
  ['Homo sapiens', 315e3], // Richter et al. (2017), Nature 546, 293, PMID 28593967 (efetch NCBI) : Jebel Irhoud
  //   « at 315 +- 34 thousand years ago » ; repris par Hublin et al. (2017), Nature 546, 289, PMID 28593953
].map(Object.freeze));
const MOIS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], JOURS_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function dateDe(jour) { /* jour reel dans [0, 365] depuis le 1er janvier 00:00 */
  let j = Math.min(364.99999, Math.max(0, jour)), m = 0; while (j >= JOURS_MOIS[m]) { j -= JOURS_MOIS[m]; m++; }
  const d = Math.floor(j), mn = Math.floor((j - d) * 1440), hh = Math.floor(mn / 60), mm = mn % 60;
  return MOIS[m] + ' ' + (d + 1) + ' ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
function calendrierCosmique(P, n) {
  const A = P.ageUnivers * 1e9, ev = EVENEMENTS.map(([nom, age]) => {
    const a = age === null ? A : typeof age === 'object' ? A - age.apresBigBang : age, jour = 365 * (1 - a / A);
    return { nom, ageAnnees: a, jour, date: dateDe(jour), minutesAvantMinuit: a / A * 365 * 1440 };
  });
  /* spirale : un tour par mois, rayon qui croit avec l annee ; chaque evenement = une colonne de points (z de 0 a 1) */
  const parEv = Math.max(1, Math.floor(n / 4 / ev.length)), nEv = Math.min(n, parEv * ev.length), nS = n - nEv, brut = new Float64Array(n * 3);
  const pos = (f, i, z) => { const ang = DEUX_PI * 12 * f, r = 1 + 2 * f; brut[3 * i] = r * cosD(ang); brut[3 * i + 1] = r * sinD(ang); brut[3 * i + 2] = z; };
  for (let i = 0; i < nS; i++) pos(nS > 1 ? i / (nS - 1) : 0, i, 0);
  for (let k = 0; k < nEv; k++) { const e = ev[Math.floor(k / parEv) % ev.length], q = (k % parEv + 1) / parEv; pos(e.jour / 365, nS + k, q); }
  const hum = ev[ev.length - 1], sol = ev[3];
  return { brut, invariants: {
    evenements: ev,
    humains: { minutesAvantMinuit: hum.minutesAvantMinuit, date: hum.date },
    soleil: { jour: sol.jour, date: sol.date },
    echelle: { anneesParSeconde: A / (365 * 86400), unite: 'years of cosmic history per calendar second' },
  } };
}

// ---------- catalogue ----------
const MOTEURS = { videQuantique, bigRip, fauxVide, centreTerre, versMars, zeroAbsolu, tailleUnivers, nombrePi, calendrierCosmique };
export const SYSTEMES = Object.freeze([
  { id: 'videQuantique', nom: 'The quantum vacuum (Casimir effect)', science: 'Quantum field theory', D: 3, nuage: true,
    params: { d: 1, modes: 8, graine: 1 }, bornes: { d: [0.05, 20], modes: [2, 24], graine: [1, 1000000] },
    phrase: 'The Casimir pressure between two ideal, perfectly conducting parallel plates d micrometres apart, measured by summing the allowed electromagnetic standing-wave modes minus the free vacuum (smooth cutoff, extrapolated to zero); real plates of finite conductivity and temperature feel somewhat less.' },
  { id: 'bigRip', nom: 'The Big Rip', science: 'Cosmology', D: 3, nuage: true,
    params: { w: -1.5, Om: 0.3, H0: 70, graine: 1 }, bornes: { w: [-2, -1.01], Om: [0.05, 0.5], H0: [50, 90], graine: [1, 1000000] },
    phrase: 'A flat universe of matter plus phantom dark energy with a constant equation of state w < -1, whose Friedmann equation is integrated until the scale factor diverges at a finite time; galaxies are comoving test points drawn on a logarithmic scale, and the tearing apart of bound objects is not simulated.' },
  { id: 'fauxVide', nom: 'False vacuum decay', science: 'Quantum field theory / cosmology', D: 3,
    params: { taux: 400, R0: 0.005, graine: 1 }, bornes: { taux: [100, 5000], R0: [0.001, 0.02], graine: [1, 1000000] },
    phrase: 'Thin-wall bubbles of true vacuum nucleate at random in a periodic box and their walls expand at nearly the speed of light, with an illustrative nucleation rate that is not a prediction for our universe; shown as a film of one slice, checked against the Kolmogorov-Johnson-Mehl-Avrami formula.' },
  { id: 'centreTerre', nom: 'A fall through the Earth', science: 'Geophysics', D: 4,
    params: { traversees: 2, uniforme: 0 }, bornes: { traversees: [1, 6], uniforme: [0, 1] },
    phrase: 'Gravity inside the Earth from the layered PREM density model (Dziewonski and Anderson 1981) and a fall along a straight tunnel through the centre, with no air, no rotation and no heat; uniforme = 1 swaps in a constant-density Earth of the same mass.' },
  { id: 'versMars', nom: 'Getting to Mars', science: 'Orbital mechanics', D: 3,
    params: { aCible: 1.524 }, bornes: { aCible: [1.1, 5.2] },
    phrase: 'A Hohmann transfer ellipse from Earth\'s orbit to a target orbit, both taken as circular and in one plane around the Sun alone; the real Mars orbit is eccentric and tilted and planets\' own gravity is ignored, so real trips differ by weeks.' },
  { id: 'zeroAbsolu', nom: 'Near absolute zero (Bose-Einstein condensate)', science: 'Quantum statistical physics', D: 3, nuage: true,
    params: { T: 0.6, atomes: 1000000, frequence: 100, graine: 1 }, bornes: { T: [0.2, 2], atomes: [1000, 10000000], frequence: [10, 1000], graine: [1, 1000000] },
    phrase: 'Sampled positions of the atoms of an ideal, non-interacting Bose gas in a 3-D harmonic trap at temperature T/Tc, a sharp condensate peak inside a wider thermal cloud, with the condensed fraction computed from exact Bose statistics on the trap levels; real atoms interact, which widens the condensate.' },
  { id: 'tailleUnivers', nom: 'How big is the observable universe', science: 'Cosmology', D: 3, nuage: true,
    params: { H0: 67.36, Om: 0.3153, graine: 1 }, bornes: { H0: [50, 80], Om: [0.05, 0.6], graine: [1, 1000000] },
    phrase: 'Comoving distances in a flat Lambda-CDM universe with Planck 2018 parameters, points placed in one slice at their present-day distance and lifted by how long ago their light left, out to the edge of the observable universe; massless neutrinos and a smooth universe are assumed.' },
  { id: 'nombrePi', nom: 'Three roads to pi', science: 'Mathematics', D: 3, nuage: true,
    params: { termesLeibniz: 1000, termesMachin: 10, graine: 1 }, bornes: { termesLeibniz: [1, 100000], termesMachin: [1, 14], graine: [1, 1000000] },
    phrase: 'Pi computed three ways, the Leibniz series, Machin\'s arctangent formula and seeded random points in a quarter circle (shown, lifted by the running error of the estimate); all in double precision, so no method can go below about 1e-15.' },
  { id: 'calendrierCosmique', nom: 'The cosmic calendar', science: 'Cosmology / Earth history', D: 3, nuage: true,
    params: { ageUnivers: 13.797 }, bornes: { ageUnivers: [13.5, 14] },
    phrase: 'The history of the universe squeezed into one year, one turn of the spiral per month, with key events placed by their published ages; ages of the first stars and first life are uncertain by hundreds of millions of years.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { videQuantique: ['modes', 'graine'], bigRip: ['graine'], fauxVide: ['graine'], centreTerre: ['traversees', 'uniforme'],
  zeroAbsolu: ['atomes', 'graine'], tailleUnivers: ['graine'], nombrePi: ['termesLeibniz', 'termesMachin', 'graine'] };
const parId = (id) => { const s = SYSTEMES.find((x) => x.id === id); if (!s) throw new Error('systeme inconnu: ' + id); return s; };

/** params bornes : non fini -> defaut ; hors bornes -> ramene ; entiers arrondis */
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
  const r = MOTEURS[id](P, n);
  for (let i = 0; i < r.brut.length; i++) if (!Number.isFinite(r.brut[i])) return { params: P, D: s.D, n, bornee: false, raison: 'valeur non finie', brut: null, lyapunov: null, uniteLyapunov: SANS_LYAP, points: null, invariants: null };
  const o = { params: P, D: s.D, n, bornee: true, brut: r.brut, lyapunov: null, uniteLyapunov: SANS_LYAP, points: null, invariants: r.invariants };
  if (s.nuage) o.nuage = true;
  if (r.film) o.film = r.film;
  if (id === 'bigRip') { o.raison = 'scale factor diverges (big rip)'; o.fin = { evenement: 'big rip', indice: n - 1, t: r.tRip }; }
  return o;
}
