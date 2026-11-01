// tam-grandes-questions-2.js -- TAM, sept grandes questions d espace et de physique, calculees honnetement.
//
// VUE SEULEMENT : rien ici ne se frappe. Meme forme de sortie que tam-physique.js#simuler :
//   { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne), lyapunov (null ici : aucun systeme n est chaotique),
//     uniteLyapunov, points: null, invariants, nuage?, film?: { images, parImage } }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun tirage non seme (mulberry32 a graine). sin/cos/ln = ceux du moteur,
//   exp/atan locaux en + - * / (et racine carree, exacte en IEEE-754).
// Unites SI sauf mention (UA, annee julienne, rayons et luminosites solaires).
//
// PROVENANCE DES NOMBRES : chaque constante porte l URL lue le 2026-11-01 et la valeur telle qu ecrite la-bas.
//   REGLE : aucun nombre "de memoire" ; une valeur introuvable dans une source lue est retiree (le banc le verifie).
//   Les references bibliographiques des formules (Foucault 1851, Hawking 1975, Lamb, Green...) ne sont pas des
//   valeurs numeriques du calcul et n ont pas ete relues.
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = 3.141592653589793, DEUX_PI = 6.283185307179586, LN2 = 0.6931471805599453, LN10 = 2.302585092994046;
const DEG = PI / 180;

function expD(x) { /* e^x avec + - * / seulement (meme esprit que sinD/lnD du moteur) */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* arctangente : reduction |x| <= 1, deux demi-angles (|x| <= tan(pi/16)), puis serie de Taylor */
function atanD(x) {
  if (x !== x) return NaN;
  if (x === Infinity) return PI / 2;
  if (x === -Infinity) return -PI / 2;
  let signe = 1; if (x < 0) { signe = -1; x = -x; }
  let inverse = false; if (x > 1) { x = 1 / x; inverse = true; }
  x = x / (1 + Math.sqrt(1 + x * x)); x = x / (1 + Math.sqrt(1 + x * x));
  const x2 = x * x; let t = x, s = 0;
  for (let k = 1; k <= 33; k += 2) { s += t / k; t *= -x2; }
  let r = 4 * s; if (inverse) r = PI / 2 - r;
  return signe * r;
}
function atan2D(y, x) {
  if (x > 0) return atanD(y / x);
  if (x < 0) return y >= 0 ? atanD(y / x) + PI : atanD(y / x) - PI;
  return y > 0 ? PI / 2 : y < 0 ? -PI / 2 : 0;
}
const asinD = (s) => atan2D(s, Math.sqrt(Math.max(0, 1 - s * s)));
const log10D = (x) => lnD(x) / LN10;
const pow10 = (x) => expD(x * LN10);
const sinhD = (x) => (expD(x) - expD(-x)) / 2;
const coshD = (x) => (expD(x) + expD(-x)) / 2;
function puissance(x, k) { let p = 1; for (let i = 0; i < k; i++) p *= x; return p; } /* k entier >= 0 */

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

// ---------- constantes ----------
// NIST CODATA, lu le 2026-11-01 (https://physics.nist.gov/cgi-bin/cuu/Value?c | ?hbar | ?k | ?sigma) :
//   "299 792 458 m s -1 (exact)", "1.054 571 817... x 10 -34 J s (exact)", "1.380 649 x 10 -23 J K -1 (exact)",
//   "5.670 374 419... x 10 -8 W m -2 K -4 (exact)" (les "..." de NIST : chiffres suivants non affiches, non ajoutes ici).
const C = 299792458, HBAR = 1.054571817e-34, K_B = 1.380649e-23, SIGMA = 5.670374419e-8;
// https://physics.nist.gov/cgi-bin/cuu/Value?bg : "6.674 30 x 10 -11 m 3 kg -1 s -2", "Standard uncertainty
//   0.000 15 x 10 -11", "Relative standard uncertainty 2.2 x 10 -5".
const G_N = 6.67430e-11;
// IAU 2015 Resolution B3, https://ar5iv.labs.arxiv.org/html/1510.07674 (Mamajek et al.) : "R_sun^N = 6.957 x 10^8 m",
//   "L_sun^N = 3.828 x 10^26 W", "T_eff,sun^N = 5772 K", "(GM)_sun^N = 1.327 124 4 x 10^20 m^3 s^-2" ; meilleure
//   estimate (CBE) "T_eff,sun = 5772.0 (+- 0.8) K".
const GM_SOLEIL_SI = 1.3271244e20, M_SOLEIL = GM_SOLEIL_SI / G_N, R_SOLEIL_KM = 6.957e8 / 1000, T_SOLEIL = 5772;
const T_SOLEIL_INC = 0.8;
// NASA Earth Fact Sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html : "Volumetric mean radius (km) 6371.000".
const R_TERRE_KM = 6371.000;
// https://physics.nist.gov/cgi-bin/cuu/Value?gn : "standard acceleration of gravity 9.806 65 m s -2 (exact)".
const G_TERRE = 9.80665;
// https://en.wikipedia.org/w/index.php?title=Earth%27s_rotation&action=raw : "angular speed of Earth's rotation in
//   inertial space is (7.292 115 0 +- 0.000 000 1) e-5 radians per SI second".
const OMEGA_TERRE = 7.2921150e-5;
// https://en.wikipedia.org/w/index.php?title=Astronomical_unit&action=raw : "defined as 149597870700 metres" (IAU 2012) ;
//   https://en.wikipedia.org/w/index.php?title=Julian_year_(astronomy)&action=raw : "exactly 365.25 days of 86400 SI seconds".
const UA_KM = 149597870700 / 1000, AN_S = 365.25 * 86400, KMS_EN_UA_AN = AN_S / UA_KM;
// https://en.wikipedia.org/w/index.php?title=Gaussian_gravitational_constant&action=raw : "k = 0.01720209895 rad/day"
//   (IAU 1938/1976 : "the value 0.017202098950000") ; GM_soleil en UA^3/j^2 = k^2.
const K_GAUSS = 0.01720209895;
// Pole galactique nord (J2000) et longitude galactique du pole celeste nord, recopies d astropy :
//   https://raw.githubusercontent.com/astropy/astropy/main/astropy/coordinates/builtin_frames/galactic.py :
//   "_ngp_J2000 = FK5(ra=192.8594812065348 * u.degree, dec=27.12825118085622 * u.degree)",
//   "_lon0_J2000 = Angle(122.9319185680026, u.degree)" (astropy cite Reid & Brunthaler 2004 et une auto-coherence FK5/FK4).
const ALPHA_PNG = 192.8594812065348, DELTA_PNG = 27.12825118085622, L_PCN = 122.9319185680026;
// Obliquite J2000 : https://en.wikipedia.org/w/index.php?title=Axial_tilt&action=raw, Astronomical Almanac 2010 p. B52 :
//   "epsilon = 23 deg 26' 21.406'' - 46.836769'' T - ..." ; on garde le terme constant (T = 0 en J2000).
const OBLIQUITE = (23 * 3600 + 26 * 60 + 21.406) / 3600;
// Dipole du CMB, Planck 2018 results I, https://ar5iv.labs.arxiv.org/html/1807.06205 : "v = (369.82 +- 0.11) km s^-1" ;
//   table "Sun-CMB 369.82 +- 0.11, l = 264.021 +- 0.011, b = 48.253 +- 0.005" (deg).
const CMB_V = 369.82, CMB_L = 264.021, CMB_B = 48.253;
// Rotation galactique : Reid et al. 2019, https://arxiv.org/abs/1910.03357 (resume) : "the circular rotation speed at the
//   Sun's position, To = 236 +/- 7 km/s" ; la meme table de Planck 2018 I (ci-dessus) donne "LSR-GC 239 +- 5" vers l = 90.
//   Direction prise (l, b) = (90, 0). Le mouvement particulier du Soleil, Schoenrich et al. 2010,
//   https://arxiv.org/abs/0912.3693 : "(U,V,W)_sun = (11.1 +/- 0.74, 12.24 +/- 0.47, 7.25 +/-0.37) km/s", est IGNORE.
const V_GALAXIE = 236;
// Fixsen 2009, https://arxiv.org/abs/0911.1955 (resume) : "cosmic microwave background temperature of 2.72548 +/- 0.00057 K".
const T_CMB = 2.72548;
// profondeur au rivage (le modele d eau peu profonde n est plus valable plus pres) : choix, pas une mesure
const H_COTE = 10;

// ---------- 1 : pendule de Foucault ----------
// Petites oscillations dans le repere local tournant (x = est, y = nord), seule la composante verticale de la rotation
//   compte : x'' = 2 W y' - w0^2 x ; y'' = -2 W x' - w0^2 y, W = Omega sin(latitude), w0^2 = g / L.
//   (Foucault 1851, Comptes rendus 32, 135 ; equations de tout manuel de mecanique, ex. Landau & Lifshitz vol. 1, par. 39.)
// Le systeme est lineaire a coefficients constants : on avance avec exp(h A) calcule par serie de Taylor (sans formule
//   de precession nulle part) ; la precession est MESUREE sur les pointes (maxima de r) : pente de l angle du plan.
function expMatrice4(A, h) {
  const S = new Float64Array(16), T = new Float64Array(16), U = new Float64Array(16);
  for (let i = 0; i < 4; i++) { S[i * 5] = 1; T[i * 5] = 1; }
  for (let k = 1; k <= 24; k++) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let m = 0; m < 4; m++) s += T[i * 4 + m] * A[m * 4 + j]; U[i * 4 + j] = s * h / k; }
    T.set(U); for (let i = 0; i < 16; i++) S[i] += T[i];
  }
  return S;
}
function penduleFoucault(P, n) {
  const phi = P.latitude * DEG, w0 = Math.sqrt(G_TERRE / P.longueur), w2 = w0 * w0, T0 = DEUX_PI / w0;
  const omz = OMEGA_TERRE * sinD(phi);
  const A = Float64Array.from([0, 0, 1, 0, 0, 0, 0, 1, -w2, 0, 0, 2 * omz, 0, -w2, -2 * omz, 0]);
  const duree = P.heures * 3600, pas = Math.ceil(duree / (T0 / 50)), h = duree / pas, M = expMatrice4(A, h);
  let x = P.amplitude, y = 0, vx = 0, vy = 0, rrP = 0, prec = 0;
  const pT = [0], pX = [x], pY = [y], pA = [0];
  const E0 = w2 * x * x / 2; let dE = 0, E = E0;
  for (let s = 1; s <= pas; s++) {
    const nx = M[0] * x + M[1] * y + M[2] * vx + M[3] * vy, ny = M[4] * x + M[5] * y + M[6] * vx + M[7] * vy;
    const nvx = M[8] * x + M[9] * y + M[10] * vx + M[11] * vy, nvy = M[12] * x + M[13] * y + M[14] * vx + M[15] * vy;
    x = nx; y = ny; vx = nvx; vy = nvy;
    const rr = x * vx + y * vy;
    if (rrP > 0 && rr <= 0) { /* pointe : r passe par un maximum ; angle de la DROITE du plan (modulo pi), deroule */
      let a = x !== 0 ? atanD(y / x) : PI / 2;
      while (a - prec > PI / 2) a -= PI;
      while (a - prec < -PI / 2) a += PI;
      prec = a; pT.push(s * h); pX.push(x); pY.push(y); pA.push(a);
    }
    rrP = rr;
    E = (vx * vx + vy * vy + w2 * (x * x + y * y)) / 2; /* Coriolis ne travaille pas : E est conservee exactement */
    const d = Math.abs(E - E0); if (d > dE) dE = d;
  }
  /* pente des moindres carres de l angle du plan en fonction du temps */
  const N = pT.length; let mt = 0, ma = 0;
  for (let i = 0; i < N; i++) { mt += pT[i]; ma += pA[i]; }
  mt /= N; ma /= N; let sxy = 0, sxx = 0;
  for (let i = 0; i < N; i++) { sxy += (pT[i] - mt) * (pA[i] - ma); sxx += (pT[i] - mt) * (pT[i] - mt); }
  const mesure = sxx > 0 ? sxy / sxx * 3600 / DEG : 0; /* degres par heure, negatif = sens horaire vu d en haut */
  const formule = -OMEGA_TERRE * sinD(phi) * 3600 / DEG;
  const brut = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = n > 1 ? Math.round(i * (N - 1) / (n - 1)) : 0;
    brut[3 * i] = pX[j]; brut[3 * i + 1] = pY[j]; brut[3 * i + 2] = pT[j] / 3600;
  }
  return { brut, uniteLyapunov: 'sans objet (oscillateur lineaire)', invariants: {
    precession: { mesure, formule, ecart: Math.abs(formule) > 1e-12 ? Math.abs(mesure - formule) / Math.abs(formule) : Math.abs(mesure),
      tourCompletHeures: Math.abs(mesure) > 1e-9 ? 360 / Math.abs(mesure) : null, pointes: N,
      unite: 'degree per hour (negative = clockwise seen from above)' },
    periodeOscillation: { secondes: T0 },
    energie: { debut: E0, fin: E, derive: dE / E0 },
  } };
}

// ---------- 2 : le vrai trajet de la Terre ----------
// Orbite de Kepler (RK4, UA et annees juliennes, GM = k^2) dans le plan de l ecliptique, plus la vitesse constante du
//   Soleil : rotation galactique (defaut) ou vitesse par rapport au CMB (cmb = 1). La direction galactique est
//   convertie en ecliptique avec les constantes ci-dessus : l angle a l ecliptique est CALCULE, pas recopie.
function versEcliptique(l, b) {
  const lr = l * DEG, br = b * DEG, aG = ALPHA_PNG * DEG, dG = DELTA_PNG * DEG, lN = L_PCN * DEG;
  const sd = sinD(dG) * sinD(br) + cosD(dG) * cosD(br) * cosD(lN - lr);
  const S = cosD(br) * sinD(lN - lr), Cc = cosD(dG) * sinD(br) - sinD(dG) * cosD(br) * cosD(lN - lr);
  const xq = Cc * cosD(aG) - S * sinD(aG), yq = Cc * sinD(aG) + S * cosD(aG), zq = sd, e = OBLIQUITE * DEG;
  return [xq, yq * cosD(e) + zq * sinD(e), -yq * sinD(e) + zq * cosD(e)];
}
function mouvementTerre(P, n) {
  const kk = K_GAUSS * 365.25, GM = kk * kk, e = P.excentricite, rp = 1 - e, vp = Math.sqrt(GM * (1 + e) / rp);
  const l = P.cmb ? CMB_L : 90, b = P.cmb ? CMB_B : 0, vkms = P.cmb ? CMB_V : P.vitesse;
  const u = versEcliptique(l, b), V = vkms * KMS_EN_UA_AN, Vx = V * u[0], Vy = V * u[1], Vz = V * u[2];
  const f = (s, d) => { const r2 = s[0] * s[0] + s[1] * s[1], ir3 = 1 / (r2 * Math.sqrt(r2)); d[0] = s[2]; d[1] = s[3]; d[2] = -GM * s[0] * ir3; d[3] = -GM * s[1] * ir3; };
  const rk4 = fabriquerRK4(4, f), y = Float64Array.from([rp, 0, 0, vp]);
  const dt = P.annees / (n - 1 || 1), pas = Math.ceil(dt / 0.001), h = dt / pas;
  const energie = (s) => (s[2] * s[2] + s[3] * s[3]) / 2 - GM / Math.sqrt(s[0] * s[0] + s[1] * s[1]);
  const E0 = energie(y); let dE = 0, rmin = rp, rmax = rp, t = 0, vmin = Infinity, vmax = -Infinity;
  const passages = [], posPassage = [];
  const brut = new Float64Array(n * 4);
  const noter = (i) => {
    brut[4 * i] = y[0] + Vx * t; brut[4 * i + 1] = y[1] + Vy * t; brut[4 * i + 2] = Vz * t; brut[4 * i + 3] = t;
    const wx = y[2] + Vx, wy = y[3] + Vy, v = Math.sqrt(wx * wx + wy * wy + Vz * Vz) / KMS_EN_UA_AN;
    if (v < vmin) vmin = v; if (v > vmax) vmax = v;
  };
  noter(0);
  for (let i = 1; i < n; i++) {
    for (let s = 0; s < pas; s++) {
      const xP = y[0], yP = y[1];
      rk4(y, h); t += h;
      if (yP < 0 && y[1] >= 0 && y[0] > 0) { const a = -yP / (y[1] - yP); passages.push(t - h + a * h); posPassage.push([xP + a * (y[0] - xP), yP + a * (y[1] - yP)]); }
      const r = Math.sqrt(y[0] * y[0] + y[1] * y[1]); if (r < rmin) rmin = r; if (r > rmax) rmax = r;
      const d = Math.abs(energie(y) - E0); if (d > dE) dE = d;
    }
    t = i * dt; noter(i);
  }
  const periodes = passages.map((p, k) => p - (k ? passages[k - 1] : 0));
  const periode = periodes.length ? periodes.reduce((a, c) => a + c, 0) / periodes.length : NaN, pF = DEUX_PI / Math.sqrt(GM);
  let pasMesure = NaN;
  if (passages.length) { const tc = passages[0], q = posPassage[0], dx = q[0] - rp + Vx * tc, dy = q[1] + Vy * tc, dz = Vz * tc; pasMesure = Math.sqrt(dx * dx + dy * dy + dz * dz); }
  return { brut, uniteLyapunov: 'sans objet (orbite de Kepler)', invariants: {
    periode: { mesure: periode, formule: pF, ecart: Math.abs(periode - pF) / pF, orbites: periodes.length, unite: 'Julian year' },
    demiGrandAxe: { mesure: (rmin + rmax) / 2, formule: 1, ecart: Math.abs((rmin + rmax) / 2 - 1), unite: 'au' },
    pasHelice: { mesure: pasMesure, formule: V * periode, parAn: V, ecart: Math.abs(pasMesure - V * periode) / (V * periode), unite: 'au per orbit' },
    vitesseSoleil: { kms: vkms, reference: P.cmb ? 'CMB dipole (Planck 2018)' : 'Galactic rotation' },
    inclinaison: { degres: asinD(u[2]) / DEG, note: 'angle between the Sun velocity and the ecliptic plane, computed from J2000 frame constants' },
    vitesseTerre: { minKms: vmin, maxKms: vmax },
    energie: { debut: E0, fin: energie(y), derive: dE / Math.abs(E0) },
  } };
}

// ---------- 3 et 7 : table d etoiles reelles ----------
// T (K), R (R_soleil), L (L_soleil), recopies le 2026-11-01 de l infobox Wikipedia de chaque etoile (wikitext brut,
//   https://en.wikipedia.org/w/index.php?title=<page>&action=raw), qui cite l article primaire nomme ci-dessous.
//   Les articles primaires eux-memes n ont PAS ete relus ; certains (2026) sont des preprints.
// sT, sR, sL = incertitude RELATIVE donnee par la source (cote le plus large si asymetrique) ; null = la source n en
//   donne pas. Controle L = 4 pi R^2 sigma T^4 : tolerance = 3 sigma propagees (2 sR, 4 sT, sL en quadrature) si les
//   trois sont donnees, sinon 30 % SUPPOSES (pas une mesure). Les ecarts hors tolerance sont PUBLIES, pas caches.
// RETIREES faute de source lisible : Deneb (rayon "117 +14/-19" sans reference dans l infobox), Canopus (rayon vide),
//   Spica A (T, R, L sans reference dans l infobox).
const WIKI = 'https://en.wikipedia.org/w/index.php?action=raw&title=';
const ETOILES = Object.freeze([
  // IAU 2015 B3 (ci-dessus) : soleil nominal ; T CBE 5772.0 +- 0.8 K ; R et L nominaux exacts par definition.
  { nom: 'Sun', T: T_SOLEIL, sT: T_SOLEIL_INC / T_SOLEIL, R: 1, sR: 0, L: 1, sL: 0, sp: true, src: 'https://ar5iv.labs.arxiv.org/html/1510.07674' },
  // Sirius : "radius = {{val|1.7144|0.0090}}", "luminosity = {{val|24.74|0.70}}" (Bond et al. 2017, ApJ 840, 70) ;
  //   "temperature = {{val|9,845|64}}" (Davis et al., PASA 28, 58).
  { nom: 'Sirius A', T: 9845, sT: 64 / 9845, R: 1.7144, sR: 0.0090 / 1.7144, L: 24.74, sL: 0.70 / 24.74, sp: true, src: WIKI + 'Sirius' },
  // Sirius : "radius2 = {{val|0.008098|0.6|s=%}}", "luminosity2 = {{val|0.02448|1.3|s=%}}", "temperature2 = {{val|25369|46}}" (Bond 2017).
  { nom: 'Sirius B', T: 25369, sT: 46 / 25369, R: 0.008098, sR: 0.006, L: 0.02448, sL: 0.013, sp: false, src: WIKI + 'Sirius' },
  // Vega (rotateur rapide, Monnier et al. 2012, ApJ 761, L3) : "radius = 2.726 +- 0.006 (equatorial), 2.418 +- 0.008 (polar)",
  //   "luminosity = 47.2 +- 0.2", "temperature = 10070 +- 90 (polar), 8910 +- 130 (equatorial)". Pas de T ni de R uniques :
  //   on prend la MOYENNE pole / equateur (choix d ici), donc aucune incertitude source -> 30 %.
  { nom: 'Vega', T: (10070 + 8910) / 2, sT: null, R: (2.726 + 2.418) / 2, sR: null, L: 47.2, sL: null, sp: true, src: WIKI + 'Vega' },
  // Betelgeuse : "radius = ~640 (Mittag 2023) - {{val|764|116|62}} (Joyce et al. 2020, ApJ 902, 63)",
  //   "luminosity = ~65,000 (Mittag) - {{val|87,100|20,500|11,200}} (Joyce 2020)", "temperature = {{val|3779|38}}" (Borisov 2023).
  //   Rayon TRES incertain : la source elle-meme donne une fourchette ~640 a 764 (+116 / -62).
  { nom: 'Betelgeuse', T: 3779, sT: 38 / 3779, R: 764, sR: 116 / 764, L: 87100, sL: 20500 / 87100, sp: false, src: WIKI + 'Betelgeuse' },
  // Rigel A : "radius = {{val|74.1|6.1|7.3}}" (Baines et al., 2018AJ....155...30B), "temperature = {{val|12100|150}}"
  //   (Przybilla et al. 2010, A&A 517, A38), "luminosity_bolometric = {{val|120000|25000|21000}}" (Moravveji et al. 2012, ApJ 747, 108).
  { nom: 'Rigel', T: 12100, sT: 150 / 12100, R: 74.1, sR: 7.3 / 74.1, L: 120000, sL: 25000 / 120000, sp: false, src: WIKI + 'Rigel' },
  // Antares A : "radius = 680 (Ohnaka et al. 2013, A&A 555, A24) (varies by 19%) (Pecaut 2012)",
  //   "luminosity = {{val|75,900|53,000|31,200}}" (Pecaut & Mamajek 2012, ApJ 746, 154), "temperature = {{val|3,660|120}}" (Ohnaka 2013).
  //   sR = la variation de 19 % citee (faute d incertitude de mesure donnee).
  { nom: 'Antares', T: 3660, sT: 120 / 3660, R: 680, sR: 0.19, L: 75900, sL: 53000 / 75900, sp: false, src: WIKI + 'Antares' },
  // Proxima : "radius = {{val|0.162|0.004}}", "temperature = {{val|2833|49}}" (Anugu et al. 2026, arXiv 2610.33373, preprint) ;
  //   "luminosity_bolometric = 0.001567 +- 0.000020" (Pineda et al. 2021, 2021ApJ...918...40P).
  { nom: 'Proxima Centauri', T: 2833, sT: 49 / 2833, R: 0.162, sR: 0.004 / 0.162, L: 0.001567, sL: 0.000020 / 0.001567, sp: true, src: WIKI + 'Proxima_Centauri' },
  // Polaris Aa : "radius = {{val|46.27|0.42}}" (Evans et al. 2024, ApJ 971, 190), "temperature = 6015" (Usenko & Klochkova 2008,
  //   MNRAS 387, L1), "luminosity_bolometric = 1,260" (Fadeyev 2015, MNRAS 449, 1011). Trois articles, distances differentes.
  { nom: 'Polaris', T: 6015, sT: null, R: 46.27, sR: 0.42 / 46.27, L: 1260, sL: null, sp: false, src: WIKI + 'Polaris' },
  // Arcturus : "radius = {{val|25.4|0.2}}", "temperature = {{val|4286|30}}" (Ramirez & Allende Prieto 2011, ApJ 743, 135) ;
  //   "luminosity = 170" (Schroder & Cuntz 2007, A&A 465, 593).
  { nom: 'Arcturus', T: 4286, sT: 30 / 4286, R: 25.4, sR: 0.2 / 25.4, L: 170, sL: null, sp: false, src: WIKI + 'Arcturus' },
  // UY Scuti : "radius = 909", "luminosity = 124,000", "temperature = 3,550" (Healy et al. 2024, MNRAS 529, 3630), sans
  //   incertitude dans l infobox ; rayon TRES incertain (il depend de la distance, "{{val|1800|164|137}} pc", Bailer-Jones 2021).
  { nom: 'UY Scuti', T: 3550, sT: null, R: 909, sR: null, L: 124000, sL: null, sp: false, src: WIKI + 'UY_Scuti' },
  // Aldebaran A : "radius = {{val|45.1|0.1}}" (Hatzes et al. 2015, A&A 580, A31), "luminosity = {{val|439|17}}" (Heiter et al. 2015,
  //   A&A 582, A49), "temperature = {{val|3,900|50}}" (Strassmeier et al. 2018, A&A 612, A45).
  { nom: 'Aldebaran', T: 3900, sT: 50 / 3900, R: 45.1, sR: 0.1 / 45.1, L: 439, sL: 17 / 439, sp: false, src: WIKI + 'Aldebaran' },
  // Alpha Centauri : "radius = {{Val|1.223|0.001}}", "temperature = {{val|5748|29}}", "radius2 = {{Val|0.864|0.001}}",
  //   "temperature2 = {{val|5154|26}}" (Ebrahimkutty et al. 2026, arXiv, preprint) ; "luminosity = {{Val|1.5059|0.0019}}",
  //   "luminosity2 = {{Val|0.4981|0.0007}}" (Akeson et al. 2021, AJ 162, 14).
  { nom: 'Alpha Centauri A', T: 5748, sT: 29 / 5748, R: 1.223, sR: 0.001 / 1.223, L: 1.5059, sL: 0.0019 / 1.5059, sp: true, src: WIKI + 'Alpha_Centauri' },
  { nom: 'Alpha Centauri B', T: 5154, sT: 26 / 5154, R: 0.864, sR: 0.001 / 0.864, L: 0.4981, sL: 0.0007 / 0.4981, sp: true, src: WIKI + 'Alpha_Centauri' },
  // Procyon : "radius = {{val|2.043|0.009}}", "luminosity = {{val|7.049|0.064}}", "temperature = {{val|6582|5}}" (Soubiran et al.
  //   2024, A&A 682, A145) ; "radius2 = {{val|0.01234|0.00032}}", "temperature2 = {{val|7740|50}}" (Provencal et al. 2002,
  //   ApJ 568, 324), "luminosity2 = 0.00049" (Giammichele et al. 2012, ApJS 199, 29).
  { nom: 'Procyon A', T: 6582, sT: 5 / 6582, R: 2.043, sR: 0.009 / 2.043, L: 7.049, sL: 0.064 / 7.049, sp: false, src: WIKI + 'Procyon' },
  { nom: 'Procyon B', T: 7740, sT: 50 / 7740, R: 0.01234, sR: 0.00032 / 0.01234, L: 0.00049, sL: null, sp: false, src: WIKI + 'Procyon' },
  // Altair (rotateur rapide) : "radius = 2.008 +- 0.006 (equatorial), 1.565 +- 0.014 (polar)", "temperature = 6,780 (equatorial),
  //   8,621 (polar)" (Bouchaud et al. 2020, A&A 633, A78) ; "luminosity = 10.6" (Peterson et al. 2006, ApJ 636, 1087).
  //   Moyenne pole / equateur comme pour Vega -> 30 %.
  { nom: 'Altair', T: (6780 + 8621) / 2, sT: null, R: (2.008 + 1.565) / 2, sR: null, L: 10.6, sL: null, sp: true, src: WIKI + 'Altair' },
  // Barnard : "radius = {{Val|0.187|0.001}}", "luminosity_bolometric = 0.00340 +- 0.00006" (Pineda et al. 2021) ;
  //   "temperature = {{Val|3195|28}}" (Gonzalez Hernandez et al. 2024, A&A 690, A79).
  { nom: 'Barnard\'s Star', T: 3195, sT: 28 / 3195, R: 0.187, sR: 0.001 / 0.187, L: 0.00340, sL: 0.00006 / 0.00340, sp: true, src: WIKI + 'Barnard%27s_Star' },
  // Capella Aa : "radius = 11.98 +- 0.57", "temperature = 4,970 +- 50", "luminosity_bolometric = 78.7 +- 4.2" (section
  //   referencee "torres15" : Torres et al. 2015, ApJ 807, 26).
  { nom: 'Capella Aa', T: 4970, sT: 50 / 4970, R: 11.98, sR: 0.57 / 11.98, L: 78.7, sL: 4.2 / 78.7, sp: false, src: WIKI + 'Capella' },
  // Pollux : "radius = 8.97 +- 0.03" (Baines et al. 2025, AJ 169, 293), "luminosity = 38.4 +- 0.3", "temperature = 4,810 +- 14"
  //   (Soubiran et al. 2024).
  { nom: 'Pollux', T: 4810, sT: 14 / 4810, R: 8.97, sR: 0.03 / 8.97, L: 38.4, sL: 0.3 / 38.4, sp: false, src: WIKI + 'Pollux_(star)' },
  // VY CMa : "radius = {{val|1,420|120}}", "luminosity = {{val|270,000|40,000}}", "temperature = {{val|3,490|90}}"
  //   (Wittkowski et al. 2012, A&A 540, L12) ; l infobox cite aussi L = 178,000 (Davies & Beasor 2020).
  { nom: 'VY Canis Majoris', T: 3490, sT: 90 / 3490, R: 1420, sR: 120 / 1420, L: 270000, sL: 40000 / 270000, sp: false, src: WIKI + 'VY_Canis_Majoris' },
  // TRAPPIST-1 : "radius = 0.1191 +- 0.0011" (Lim et al. 2026), "temperature = {{val|2325|13}}" (Picos et al. 2026),
  //   "luminosity_bolometric = {{val|5.66e-4|0.22}}" (Davoudi et al. 2024, ApJL 970, L4) : 0.22 lu comme 0.22e-4.
  { nom: 'TRAPPIST-1', T: 2325, sT: 13 / 2325, R: 0.1191, sR: 0.0011 / 0.1191, L: 5.66e-4, sL: 0.22 / 5.66, sp: true, src: WIKI + 'TRAPPIST-1' },
  // Fomalhaut : "radius = {{val|1.842|0.019}}", "luminosity = {{val|16.63|0.48}}", "temperature = 8,590" (Mamajek 2012, ApJL 754, L20).
  { nom: 'Fomalhaut', T: 8590, sT: null, R: 1.842, sR: 0.019 / 1.842, L: 16.63, sL: 0.48 / 16.63, sp: true, src: WIKI + 'Fomalhaut' },
  // Epsilon Eridani : "radius = {{val|0.742|0.004}}", "luminosity = {{val|0.326|0.007}}" (Soubiran et al. 2024) ;
  //   "temperature = {{val|5085|24}}" (Sun et al. 2026, ApJS 284, 57).
  { nom: 'Epsilon Eridani', T: 5085, sT: 24 / 5085, R: 0.742, sR: 0.004 / 0.742, L: 0.326, sL: 0.007 / 0.326, sp: true, src: WIKI + 'Epsilon_Eridani' },
  // Tau Ceti : "radius = {{val|0.801|0.008}}", "luminosity = {{val|0.48|0.02}}", "temperature = {{val|5382|52}}"
  //   (Ibanez Bustos et al. 2026, A&A, doi 10.1051/0004-6361/202661193).
  { nom: 'Tau Ceti', T: 5382, sT: 52 / 5382, R: 0.801, sR: 0.008 / 0.801, L: 0.48, sL: 0.02 / 0.48, sp: true, src: WIKI + 'Tau_Ceti' },
  // 61 Cygni A : "radius = {{val|0.667|0.005}}", "luminosity = {{val|0.150|0.004}}", "temperature = {{val|4398|34}}" (Soubiran 2024).
  { nom: '61 Cygni A', T: 4398, sT: 34 / 4398, R: 0.667, sR: 0.005 / 0.667, L: 0.150, sL: 0.004 / 0.150, sp: true, src: WIKI + '61_Cygni' },
  // R136a1 : "luminosity = {{val|7240000|700000|1080000}}", "radius = {{val|42.7|1.6|0.9}}", "temperature = {{val|46,000|1,300|2,400}}"
  //   (Brands et al. 2022, A&A 663, A36).
  { nom: 'R136a1', T: 46000, sT: 2400 / 46000, R: 42.7, sR: 1.6 / 42.7, L: 7240000, sL: 1080000 / 7240000, sp: false, src: WIKI + 'R136a1' },
].map((e) => Object.freeze({ ...e })));
const parNom = (nom) => ETOILES.find((e) => e.nom === nom);

/* L de Stefan-Boltzmann en unites solaires : L / Lsun = (R / Rsun)^2 (T / Tsun)^4 (le soleil nominal fixe l echelle) */
const luminositeSB = (T, R) => R * R * puissance(T / T_SOLEIL, 4);
/* tolerance du controle : 3 sigma propagees si T, R et L ont une incertitude source, sinon 30 % supposes */
function toleranceSB(e) {
  if (e.sT === null || e.sR === null || e.sL === null) return { tolerance: 0.3, base: '30 % assumed (the source gives no uncertainty for every quantity)' };
  const s = Math.sqrt(4 * e.sR * e.sR + 16 * e.sT * e.sT + e.sL * e.sL);
  return { tolerance: 3 * s, base: '3 sigma, propagated from the source uncertainties' };
}

function etoilesHR(P, n) {
  const S = ETOILES.length, brut = new Float64Array(n * 3);
  const details = [], hors = []; let pire = null;
  for (const e of ETOILES) {
    const r = luminositeSB(e.T, e.R) / e.L, { tolerance: tol, base } = toleranceSB(e), d = Math.abs(r - 1), ok = d <= tol;
    details.push({ nom: e.nom, rapport: r, tolerance: tol, base, dansTolerance: ok, source: e.src });
    if (!ok) hors.push(e.nom);
    if (!pire || d / tol > pire.d / pire.tol) pire = { nom: e.nom, d, tol };
  }
  const lum = (e) => e.L;
  /* sequence principale : droite des moindres carres log L = a + b log T sur les etoiles marquees sp */
  const sp = ETOILES.filter((e) => e.sp); let mx = 0, my = 0;
  for (const e of sp) { mx += log10D(e.T); my += log10D(lum(e)); }
  mx /= sp.length; my /= sp.length; let sxy = 0, sxx = 0, tmin = Infinity, tmax = -Infinity;
  for (const e of sp) { const a = log10D(e.T) - mx; sxy += a * (log10D(lum(e)) - my); sxx += a * a; tmin = Math.min(tmin, log10D(e.T)); tmax = Math.max(tmax, log10D(e.T)); }
  const pente = sxy / sxx, ord = my - pente * mx, lTs = log10D(T_SOLEIL);
  for (let i = 0; i < n; i++) {
    let lt, ll, lr;
    if (i < S) { const e = ETOILES[i]; lt = log10D(e.T); ll = log10D(lum(e)); lr = log10D(e.R); }
    else { const m = n - S, s = m > 1 ? (i - S) / (m - 1) : 0.5; lt = tmin + (tmax - tmin) * s; ll = ord + pente * lt; lr = (ll - 4 * (lt - lTs)) / 2; }
    brut[3 * i] = lt; brut[3 * i + 1] = ll; brut[3 * i + 2] = lr;
  }
  return { brut, invariants: {
    stefanBoltzmann: { verifiees: details.length, horsTolerance: hors, pire: pire && pire.nom, pireEcart: pire && pire.d, pireTolerance: pire && pire.tol, details,
      note: 'stars outside tolerance are kept and reported: their T, R and L come from different papers and distances' },
    soleil: { T: T_SOLEIL, L: luminositeSB(T_SOLEIL, 1), R: 1 },
    sequencePrincipale: { pente, ordonnee: ord, etoiles: sp.length, note: 'least-squares line log L = a + b log T through the main-sequence stars of the table' },
    etoiles: { noms: ETOILES.map((e) => e.nom), lignes: Math.min(n, S), colonnes: 'log10 T (K), log10 L (Lsun), log10 R (Rsun)' },
  } };
}

// ---------- 4 : evaporation de Hawking ----------
// T_H = hbar c^3 / (8 pi G M k_B) (Hawking 1975, Commun. Math. Phys. 43, 199). Puissance = corps noir de T_H sur l aire
//   de l horizon 4 pi r_s^2 (photons seuls, sans facteur de corps gris) ; dM/dt = -P / c^2, integre en RK4 a pas
//   adaptatif. Forme fermee attendue : t = 5120 pi G^2 M^3 / (hbar c^4). Page 1976 (Phys. Rev. D 13, 198) compte les
//   especes emises et les facteurs de corps gris : son prefacteur DIFFERE ; ce n est pas ce qui est calcule ici.
// Eres, Adams & Laughlin 1997 (Rev. Mod. Phys. 69, 337), https://ar5iv.labs.arxiv.org/html/astro-ph/9701131 (eta = log10(t / an)) :
//   "The Stelliferous Era. 6 < eta < 14", "The Degenerate Era. 15 < eta < 37", "The Black Hole Era. 38 < eta < 100",
//   "The Dark Era. eta > 100". (Une version anterieure de ce fichier disait 15-39 et 40-100 : c etait faux.)
const temperatureHawking = (m) => HBAR * C * C * C / (8 * PI * G_N * m * K_B);
function puissanceHawking(m) { const T = temperatureHawking(m), T2 = T * T, rs = 2 * G_N * m / (C * C); return SIGMA * T2 * T2 * 4 * PI * rs * rs; }
const dMdt = (m) => -puissanceHawking(m) / (C * C);
function pasMasse(m, h) {
  const k1 = dMdt(m), k2 = dMdt(m + h * k1 / 2), k3 = dMdt(m + h * k2 / 2), k4 = dMdt(m + h * k3);
  return m + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
}
/* duree de vie MESUREE : integration jusqu a M = 1e-3 M0 (pas = 1 % de M / |dM/dt|), puis queue M / (3 |dM/dt|) */
function dureeMesuree(m0) {
  let m = m0, t = 0;
  while (m > 1e-3 * m0) { const h = 0.01 * m / -dMdt(m); m = pasMasse(m, h); t += h; }
  return t + m / (3 * -dMdt(m));
}
const dureeFormule = (m) => 5120 * PI * G_N * G_N * m * m * m / (HBAR * C * C * C * C);
function evaporationTrouNoir(P, n) {
  const m0 = pow10(P.log10Masse) * M_SOLEIL, T0 = temperatureHawking(m0), tau = dureeMesuree(m0);
  const brut = new Float64Array(n * 4), fin = tau * (1 - 1e-4);
  let m = m0, t = 0;
  for (let i = 0; i < n; i++) {
    const cible = n > 1 ? fin * i / (n - 1) : 0;
    while (t < cible) { const h = Math.min(cible - t, 0.01 * m / -dMdt(m)); m = pasMasse(m, h); t = h === cible - t ? cible : t + h; }
    brut[4 * i] = t / tau; brut[4 * i + 1] = m / m0; brut[4 * i + 2] = log10D(m0 / m); brut[4 * i + 3] = log10D(1 + t / AN_S);
  }
  const tf = dureeFormule(m0), tau2 = dureeMesuree(2 * m0), etaBH = log10D(tau / AN_S);
  const mCmb = HBAR * C * C * C / (8 * PI * G_N * T_CMB * K_B);
  return { brut, uniteLyapunov: 'sans objet (equation monotone)', invariants: {
    temperature: { kelvin: T0, soleilKelvin: temperatureHawking(M_SOLEIL), formule: 'T = hbar c^3 / (8 pi G M k_B)' },
    dureeDeVie: { mesureAns: tau / AN_S, formuleAns: tf / AN_S, ecart: Math.abs(tau - tf) / tf, log10Ans: etaBH,
      formule: 't = 5120 pi G^2 M^3 / (hbar c^4), photons only, no greybody factors' },
    loiM3: { rapport: tau2 / tau, attendu: 8 },
    equilibreCMB: { masseKg: mCmb, masseSoleil: mCmb / M_SOLEIL, note: 'heavier holes are colder than the CMB today and still absorb more than they emit' },
    eres: [
      { nom: 'Stelliferous era', log10AnsDe: 6, log10AnsA: 14 }, { nom: 'Degenerate era', log10AnsDe: 15, log10AnsA: 37 },
      { nom: 'Black hole era', log10AnsDe: 38, log10AnsA: 100 }, { nom: 'Dark era', log10AnsDe: 100, log10AnsA: null },
    ],
    colonnes: 't / lifetime, M / M0, log10(T / T0), log10(1 + t in years)',
  } };
}

// ---------- 5 : tsunami ----------
// Ondes longues en eau peu profonde : c = sqrt(g h) (Lamb 1932, Hydrodynamics, par. 170). Rayons (x, y, theta) sur un
//   fond qui ne depend que de x : ocean de profondeur constante puis plateau continental lineaire jusqu a H_COTE ;
//   refraction : d theta / dt = sin(theta) dc/dx (Snell : sin(theta) / c conserve). Amplitude = conservation du flux
//   d energie E c sur un rayon -> A proportionnel a c^(-1/2) = h^(-1/4) (loi de Green, 1838). IGNORE : dispersion,
//   etalement geometrique, frottement, deferlement, non-linearite.
function vitesseOnde(h) { return Math.sqrt(G_TERRE * h); }
function tsunami(P, n) {
  const h0 = P.profondeur, L = P.distance * 1000, W = P.plateau * 1000, xs = L - W, c0 = vitesseOnde(h0);
  const prof = (x) => (x <= xs ? h0 : x >= L ? H_COTE : h0 + (H_COTE - h0) * (x - xs) / W);
  const dcdx = (x) => (x <= xs || x >= L ? 0 : G_TERRE * ((H_COTE - h0) / W) / (2 * vitesseOnde(prof(x))));
  const f = (s, d) => { const c = vitesseOnde(prof(s[0])); d[0] = c * cosD(s[2]); d[1] = c * sinD(s[2]); d[2] = sinD(s[2]) * dcdx(s[0]); };
  const rk4 = fabriquerRK4(3, f);
  /* pas du film : au large (c constant, RK4 exact) la moitie du temps restant jusqu au plateau (>= 1 s, pour franchir
     le coude du fond en petit pas) ; sur le plateau assez court pour que c varie de < 2 % par pas */
  const hMax = (x) => (x <= xs ? Math.min(600, Math.max(1, 0.5 * (xs - x) / c0)) : Math.min(60, Math.max(0.5, 0.02 / -dcdx(x))));
  const tProfond = xs / c0, tPlateau = 2 * W / (Math.sqrt(G_TERRE) * (Math.sqrt(h0) + Math.sqrt(H_COTE))), tTotal = tProfond + tPlateau;
  /* rayon central (theta = 0), pas fins : temps de traversee MESURES (interpolation lineaire au franchissement) */
  const yc = Float64Array.from([0, 0, 0]); let t = 0, tXs = NaN, tL = NaN;
  while (t < 3 * tTotal && !(tL === tL)) {
    const xP = yc[0], hk = xP > xs - 20000 ? 1 : 10;
    rk4(yc, hk); t += hk;
    if (xP < xs && yc[0] >= xs) tXs = t - hk + hk * (xs - xP) / (yc[0] - xP);
    if (xP < L && yc[0] >= L) tL = t - hk + hk * (L - xP) / (yc[0] - xP);
  }
  /* film : F images, m rayons par image, x et y en km, amplitude en m, temps en heures */
  const F = Math.min(24, n), m = Math.max(1, Math.floor(n / F)), ouverture = 60 * DEG, brut = new Float64Array(n * 4);
  let snell = 0;
  for (let j = 0; j < m; j++) {
    const th0 = m > 1 ? -ouverture + 2 * ouverture * j / (m - 1) : 0, s = Float64Array.from([0, 0, th0]), p0 = sinD(th0) / c0;
    let tr = 0, gele = false;
    for (let k = 0; k < F; k++) {
      const cible = F > 1 ? tTotal * k / (F - 1) : 0;
      while (!gele && tr < cible) {
        const xP = s[0], yP = s[1], hk = Math.min(cible - tr, hMax(xP));
        rk4(s, hk); tr = hk === cible - tr ? cible : tr + hk;
        if (s[0] >= L) { const a = (L - xP) / (s[0] - xP); s[0] = L; s[1] = yP + a * (s[1] - yP); gele = true; }
        else { const dp = Math.abs(sinD(s[2]) / vitesseOnde(prof(s[0])) - p0) * c0; if (dp > snell) snell = dp; }
      }
      const o = 4 * (k * m + j);
      brut[o] = s[0] / 1000; brut[o + 1] = s[1] / 1000; brut[o + 2] = P.amplitude * Math.sqrt(c0 / vitesseOnde(prof(s[0]))); brut[o + 3] = cible / 3600;
    }
  }
  for (let i = F * m; i < n; i++) for (let q = 0; q < 4; q++) brut[4 * i + q] = brut[4 * ((F - 1) * m + (i - F * m) % m) + q];
  const aC = P.amplitude * Math.sqrt(c0 / vitesseOnde(H_COTE));
  return { brut, film: { images: F, parImage: m }, uniteLyapunov: 'sans objet (front d onde)', invariants: {
    vitesse: { profondeurM: h0, ms: c0, kmh: c0 * 3.6, formule: 'c = sqrt(g h)' },
    traversee: { oceanMesureH: tXs / 3600, oceanFormuleH: tProfond / 3600, plateauMesureS: tL - tXs, plateauFormuleS: tPlateau, totalMesureH: tL / 3600 },
    loiDeGreen: { exposant: lnD(aC / P.amplitude) / lnD(H_COTE / h0), publie: -0.25, amplification: aC / P.amplitude, amplitudeCoteM: aC },
    snell: { derive: snell, note: 'max change of c0 sin(theta) / c along every ray' },
    colonnes: 'x (km), y (km), amplitude (m), time (h)',
  } };
}

// ---------- 6 : geometrie de l univers ----------
// Trois surfaces de courbure constante K = +1, 0, -1 (rayon de courbure 1) : sphere unite, plan, hyperboloide
//   -x0^2 + x1^2 + x2^2 = -1 (modele de Minkowski du plan hyperbolique). Triangle geodesique equilateral de cote a.
//   Angles MESURES a partir des vecteurs tangents ; aire MESUREE par maillage inscrit (48 et 96 subdivisions,
//   extrapolation de Richardson : l erreur du maillage est en 1/N^2) ;
//   Gauss-Bonnet : somme des angles - pi = K * aire (exact pour K constant).
// Planck 2018 results VI, https://ar5iv.labs.arxiv.org/html/1807.06209 (resume) : "The joint constraint with BAO
//   measurements on spatial curvature is consistent with a flat universe, Omega_K = 0.001 +- 0.002" ; le texte (eq. 45b)
//   donne aussi "Omega_K = 0.0007 +- 0.0019 (68 %, TT,TE,EE+lowE+lensing+BAO)".
const K_SPH = 1;
const K_HYP = -1;
const mink = (u, v) => -u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const croix = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const norme = (u) => Math.sqrt(dot(u, u));
const GEOM = {
  sphere: {
    K: K_SPH,
    sommets: (a) => { const s2 = (2 / 3) * (1 - cosD(a)), s = Math.sqrt(s2), c = Math.sqrt(1 - s2); return [0, 1, 2].map((k) => [s * cosD(DEUX_PI * k / 3), s * sinD(DEUX_PI * k / 3), c]); },
    proj: (q) => { const r = norme(q); return [q[0] / r, q[1] / r, q[2] / r]; },
    angle: (A, B, Cc) => { const pa = dot(A, B), pc = dot(A, Cc), tb = [B[0] - pa * A[0], B[1] - pa * A[1], B[2] - pa * A[2]], tc = [Cc[0] - pc * A[0], Cc[1] - pc * A[1], Cc[2] - pc * A[2]]; return atan2D(norme(croix(tb, tc)), dot(tb, tc)); },
    aireTri: (e1, e2) => norme(croix(e1, e2)) / 2,
    longueur: (d) => norme(d),
    cercle: (r, ps) => [sinD(r) * cosD(ps), sinD(r) * sinD(ps), cosD(r)],
    circonference: (r) => DEUX_PI * sinD(r),
    vue: (p) => [p[0] - 3, p[1], p[2] - 1],
  },
  plat: {
    K: 0,
    sommets: (a) => { const s = a / Math.sqrt(3); return [0, 1, 2].map((k) => [s * cosD(DEUX_PI * k / 3), s * sinD(DEUX_PI * k / 3), 0]); },
    proj: (q) => q,
    angle: (A, B, Cc) => { const tb = [B[0] - A[0], B[1] - A[1], 0], tc = [Cc[0] - A[0], Cc[1] - A[1], 0]; return atan2D(norme(croix(tb, tc)), dot(tb, tc)); },
    aireTri: (e1, e2) => norme(croix(e1, e2)) / 2,
    longueur: (d) => norme(d),
    cercle: (r, ps) => [r * cosD(ps), r * sinD(ps), 0],
    circonference: (r) => DEUX_PI * r,
    vue: (p) => [p[0], p[1], 0],
  },
  hyperbolique: { /* points [x0, x1, x2], x0 = coordonnee de genre temps */
    K: K_HYP,
    sommets: (a) => { const s2 = (2 / 3) * (coshD(a) - 1), s = Math.sqrt(s2), c = Math.sqrt(1 + s2); return [0, 1, 2].map((k) => [c, s * cosD(DEUX_PI * k / 3), s * sinD(DEUX_PI * k / 3)]); },
    proj: (q) => { const r = Math.sqrt(-mink(q, q)); return [q[0] / r, q[1] / r, q[2] / r]; },
    angle: (A, B, Cc) => {
      const pb = mink(A, B), pc = mink(A, Cc), tb = [B[0] + pb * A[0], B[1] + pb * A[1], B[2] + pb * A[2]], tc = [Cc[0] + pc * A[0], Cc[1] + pc * A[1], Cc[2] + pc * A[2]];
      const co = mink(tb, tc) / Math.sqrt(mink(tb, tb) * mink(tc, tc)); return atan2D(Math.sqrt(Math.max(0, 1 - co * co)), co);
    },
    aireTri: (e1, e2) => { const a = mink(e1, e1), b = mink(e2, e2), c = mink(e1, e2); return Math.sqrt(Math.max(0, a * b - c * c)) / 2; },
    longueur: (d) => Math.sqrt(Math.max(0, mink(d, d))),
    cercle: (r, ps) => [coshD(r), sinhD(r) * cosD(ps), sinhD(r) * sinD(ps)],
    circonference: (r) => DEUX_PI * sinhD(r),
    vue: (p) => [p[1] + 3, p[2], 1 - p[0]],
  },
};
const lin = (A, B, s) => [A[0] + s * (B[0] - A[0]), A[1] + s * (B[1] - A[1]), A[2] + s * (B[2] - A[2])];
function aireMaillage(g, V, N) {
  const pt = (i, j) => g.proj([V[0][0] + (i / N) * (V[1][0] - V[0][0]) + (j / N) * (V[2][0] - V[0][0]),
    V[0][1] + (i / N) * (V[1][1] - V[0][1]) + (j / N) * (V[2][1] - V[0][1]), V[0][2] + (i / N) * (V[1][2] - V[0][2]) + (j / N) * (V[2][2] - V[0][2])]);
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  let aire = 0;
  for (let i = 0; i < N; i++) for (let j = 0; i + j < N; j++) {
    const p = pt(i, j), q = pt(i + 1, j), r = pt(i, j + 1);
    aire += g.aireTri(sub(q, p), sub(r, p));
    if (i + j + 2 <= N) { const s = pt(i + 1, j + 1); aire += g.aireTri(sub(s, q), sub(r, q)); }
  }
  return aire;
}
function geometrieUnivers(P, n) {
  const a = P.cote, rCercle = a / 2, brut = new Float64Array(n * 4), mesures = {};
  const noms = ['sphere', 'plat', 'hyperbolique'], q = Math.floor(n / 3);
  noms.forEach((nom, gi) => {
    const g = GEOM[nom], V = g.sommets(a);
    const angles = [g.angle(V[0], V[1], V[2]), g.angle(V[1], V[2], V[0]), g.angle(V[2], V[0], V[1])];
    const somme = angles[0] + angles[1] + angles[2], aire = (4 * aireMaillage(g, V, 96) - aireMaillage(g, V, 48)) / 3, exces = somme - PI;
    /* cote mesure : longueur de l arete echantillonnee (geodesique) en 400 cordes */
    let cote = 0, prev = V[0];
    for (let k = 1; k <= 400; k++) { const p = g.proj(lin(V[0], V[1], k / 400)); cote += g.longueur([p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]]); prev = p; }
    let circ = 0, pc = g.cercle(rCercle, 0);
    for (let k = 1; k <= 720; k++) { const p = g.cercle(rCercle, DEUX_PI * k / 720); circ += g.longueur([p[0] - pc[0], p[1] - pc[1], p[2] - pc[2]]); pc = p; }
    mesures[nom] = { K: g.K, sommeAnglesDeg: somme / DEG, exces, aire, KfoisAire: g.K * aire, ecartGaussBonnet: Math.abs(exces - g.K * aire),
      coteMesure: cote, circonference: circ, circonferenceFormule: g.circonference(rCercle) };
    /* nuage : moitie aretes, quart cercle, quart surface (spirale doree autour du pole) */
    const debut = gi * q, m = gi === 2 ? n - 2 * q : q, me = Math.floor(m / 2), mc = Math.floor(m / 4), ms = m - me - mc;
    const parArete = Math.max(1, Math.ceil(me / 3)), rayonVue = a + 0.4;
    for (let k = 0; k < m; k++) {
      let p;
      if (k < me) { const e = k % 3, s = parArete > 1 ? Math.floor(k / 3) / (parArete - 1) : 0; p = g.proj(lin(V[e], V[(e + 1) % 3], s)); }
      else if (k < me + mc) p = g.cercle(rCercle, DEUX_PI * (k - me) / mc);
      else { const u = k - me - mc, r = rayonVue * Math.sqrt((u + 0.5) / ms); p = g.cercle(r, 2.399963229728653 * u); }
      const w = g.vue(p), o = 4 * (debut + k);
      brut[o] = w[0]; brut[o + 1] = w[1]; brut[o + 2] = w[2]; brut[o + 3] = g.K;
    }
  });
  return { brut, invariants: { ...mesures,
    planck2018: { omegaK: 0.001, incertitude: 0.002, note: 'Planck 2018 VI abstract (with BAO): consistent with a flat universe', source: 'https://arxiv.org/abs/1807.06209' },
    colonnes: 'x, y, z (display), curvature sign K' } };
}

// ---------- 7 : tailles comparees ----------
const TAILLES = ['Sun', 'Sirius A', 'Arcturus', 'Aldebaran', 'Rigel', 'Antares', 'Betelgeuse', 'UY Scuti'];
function tailleEtoiles(P, n) {
  const corps = [{ nom: 'Earth', R: R_TERRE_KM / R_SOLEIL_KM }, ...TAILLES.map((nm) => ({ nom: nm, R: parNom(nm).R }))].slice(0, P.jusqua);
  const k = corps.length, per = Math.floor(n / k), alea = mulberry32(P.graine >>> 0), brut = new Float64Array(n * 4);
  const rmax = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const c = Math.min(k - 1, Math.floor(i / Math.max(1, per))), R = corps[c].R;
    const z = 2 * alea() - 1, ph = DEUX_PI * alea(), s = Math.sqrt(1 - z * z);
    const x = R * s * cosD(ph), y = R * s * sinD(ph), w = R * z;
    brut[4 * i] = x; brut[4 * i + 1] = y; brut[4 * i + 2] = w; brut[4 * i + 3] = c;
    const r = Math.sqrt(x * x + y * y + w * w); if (r > rmax[c]) rmax[c] = r;
  }
  const iSol = corps.findIndex((c) => c.nom === 'Sun');
  return { brut, invariants: {
    rayons: corps.map((c, i) => ({ nom: c.nom, tableRsoleil: c.R, mesureRsoleil: rmax[i], rapportAuSoleil: iSol >= 0 && rmax[iSol] > 0 ? rmax[i] / rmax[iSol] : null })),
    terreSoleil: { rapport: R_TERRE_KM / R_SOLEIL_KM, inverse: R_SOLEIL_KM / R_TERRE_KM },
    colonnes: 'x, y, z (solar radii), body index',
  } };
}

// ---------- catalogue ----------
const SIMULATEURS = { penduleFoucault, mouvementTerre, etoilesHR, evaporationTrouNoir, tsunami, geometrieUnivers, tailleEtoiles };
export const SYSTEMES = Object.freeze([
  { id: 'penduleFoucault', nom: 'Foucault pendulum', science: 'Classical mechanics', D: 3,
    params: { latitude: 48.85, longueur: 67, heures: 32, amplitude: 3 }, bornes: { latitude: [-90, 90], longueur: [10, 100], heures: [1, 40], amplitude: [0.5, 5] },
    phrase: 'A frictionless small-swing pendulum on the rotating Earth, with only the vertical part of the Coriolis force kept, shown as its turning points over time while the swing plane slowly turns; no air drag, no Earth curvature.' },
  { id: 'mouvementTerre', nom: 'Earth\'s real path through space', science: 'Celestial mechanics', D: 4,
    params: { annees: 6, excentricite: 0.0167, vitesse: V_GALAXIE, cmb: 0 }, bornes: { annees: [2, 20], excentricite: [0, 0.1], vitesse: [200, 260], cmb: [0, 1] },
    phrase: 'A Kepler orbit around the Sun added to the Sun\'s straight-line motion around the Milky Way (or relative to the cosmic microwave background), which turns the yearly circle into a stretched helix; the galactic orbit is treated as straight over these few years and the Moon and planets are left out.' },
  { id: 'etoilesHR', nom: 'Real stars on the Hertzsprung-Russell diagram', science: 'Stellar astrophysics', D: 3, nuage: true,
    params: {}, bornes: {},
    phrase: 'Twenty-seven real stars placed by the temperature, luminosity and radius copied from their Wikipedia infoboxes and the papers those cite (not live data; supergiant radii are very uncertain), plus a straight-line fit through the main-sequence stars, with each star checked against the black-body law L = 4 pi R^2 sigma T^4, which Polaris and TRAPPIST-1 fail because their three values come from different papers.' },
  { id: 'evaporationTrouNoir', nom: 'Black hole evaporation', science: 'Quantum gravity (semi-classical)', D: 4,
    params: { log10Masse: 0 }, bornes: { log10Masse: [-15, 11] },
    phrase: 'The mass of an isolated black hole shrinking as it radiates like a black body at the Hawking temperature through its horizon area (photons only, no greybody factors), integrated to near the end, ignoring the cosmic background that today is hotter than any stellar black hole.' },
  { id: 'tsunami', nom: 'Tsunami crossing an ocean', science: 'Fluid dynamics', D: 4,
    params: { profondeur: 4000, distance: 10100, plateau: 100, amplitude: 0.5 }, bornes: { profondeur: [500, 7000], distance: [500, 12000], plateau: [10, 300], amplitude: [0.1, 2] },
    phrase: 'Rays of a long shallow-water wave moving at sqrt(g h) across a deep ocean onto a sloping shelf, bending by Snell\'s law and growing by Green\'s law as the water gets shallow; no dispersion, spreading loss, friction or breaking.' },
  { id: 'geometrieUnivers', nom: 'Flat, closed or open universe', science: 'Differential geometry and cosmology', D: 4, nuage: true,
    params: { cote: 1.2 }, bornes: { cote: [0.2, 2] },
    phrase: 'The same equilateral triangle and circle drawn on a sphere, a plane and a hyperbolic surface of unit curvature radius, with the angle sums and areas measured numerically; real space is three-dimensional and Planck 2018 finds it flat within its errors.' },
  { id: 'tailleEtoiles', nom: 'How big stars really are', science: 'Stellar astrophysics', D: 4, nuage: true,
    params: { jusqua: 9, graine: 1 }, bornes: { jusqua: [2, 9], graine: [1, 1000000] },
    phrase: 'The Earth, the Sun and seven well-known stars drawn as concentric spheres with their relative radii from the same sourced table, so the smallest ones vanish next to the giants; supergiant radii such as those of Betelgeuse and UY Scuti are very uncertain because they depend on disputed distances.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
const ENTIERS = { mouvementTerre: ['cmb'], tailleEtoiles: ['jusqua', 'graine'] };
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
  n = Number.isFinite(n) ? Math.max(2, Math.floor(n)) : 1500;
  const r = SIMULATEURS[id](P, n);
  let fini = r.brut.length === n * s.D;
  for (let i = 0; fini && i < r.brut.length; i++) if (!Number.isFinite(r.brut[i])) fini = false;
  const o = { params: P, D: s.D, n, bornee: fini, brut: r.brut, lyapunov: null,
    uniteLyapunov: r.uniteLyapunov || 'sans objet (nuage, pas une trajectoire)', points: null, invariants: r.invariants };
  if (s.nuage) o.nuage = true;
  if (r.film) o.film = r.film;
  return o;
}
