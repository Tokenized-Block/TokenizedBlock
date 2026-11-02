// tam-invisible.js -- TAM, la vue INVISIBLE : des phenomenes qu on ne connait que par leur formule, dessines EXACTEMENT par elle.
//
// VUE SEULEMENT : rien ici ne se frappe (le contrat deploye n accepte que les familles 1..16 de tam-moteur.js).
// API et forme identiques a tam-physique.js : SYSTEMES (gele), simuler(id, params, { n }) -> { params, D, n, bornee,
//   brut (Float64Array n*D, ligne par ligne), lyapunov, uniteLyapunov, points: null, invariants, nuage? }, reglagesPhysique(id, params).
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun Math.random (tirages = mulberry32 a graine). sin/cos/ln = ceux du moteur ;
//   exp / atan / asin / acos = ici avec + - * / et Math.sqrt (IEEE exacts) : memes octets sur tout moteur JS.
// Chaque systeme met dans invariants une MESURE prise sur ce qui est dessine (ou sur un calcul independant) a cote de la FORMULE :
//   { mesure, formule, ... } ou { debut, fin, derive, min, max } (derive = ecart max a debut, relatif si |debut| > 1e-9).
// Lyapunov : null partout. Ces systemes sont des formules fermees, des equations lineaires (Schrodinger) ou des tirages au hasard ;
//   un exposant de divergence n y a pas de sens (ou ne mesurerait que le generateur pseudo-aleatoire).
// Non duplique : tam-astro.js (systeme solaire, S2, spirale d ondes gravitationnelles, amas, supernova, galaxies) et tam-cosmos.js
//   (lentille, Kerr, trou de ver, Lagrange, Hulse-Taylor, courbes de rotation, Friedmann, Halley, TRAPPIST-1, disque).
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = 3.141592653589793, DEUX_PI = 6.283185307179586, PI_2 = 1.5707963267948966, LN2 = 0.6931471805599453;

// ---------- arithmetique deterministe (memes fonctions que tam-physique.js / tam-formule.js) ----------
function expD(x) { /* e^x avec + - * / seulement */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
function atanD(x) { /* reduction : |x| > 1 -> pi/2 - atan(1/x) ; trois demi-angles x/(1+sqrt(1+x^2)) ; serie de Taylor */
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
function asinD(x) {
  if (!(x >= -1 && x <= 1)) return NaN;
  if (x === 1) return PI_2;
  if (x === -1) return -PI_2;
  return atanD(x / Math.sqrt((1 - x) * (1 + x)));
}
function acosD(x) { /* 2 atan(sqrt((1-x)/(1+x))) : precis pres de 1, vaut pi en -1 */
  if (!(x >= -1 && x <= 1)) return NaN;
  return 2 * atanD(Math.sqrt((1 - x) / (1 + x)));
}
function cbrtD(x) { if (x === 0) return 0; const s = x < 0 ? -1 : 1; return s * expD(lnD(s * x) / 3); }
function sinhD(x) { const e = expD(x); return (e - 1 / e) / 2; }
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* gaussienne N(0,1) par la methode polaire de Marsaglia (paire ; un ln, pas de sin/cos) */
function gaussiennes(alea) {
  let reserve = 0, plein = false;
  return () => {
    if (plein) { plein = false; return reserve; }
    let u, v, s;
    do { u = 2 * alea() - 1; v = 2 * alea() - 1; s = u * u + v * v; } while (!(s > 0 && s < 1));
    const f = Math.sqrt(-2 * lnD(s) / s);
    reserve = v * f; plein = true; return u * f;
  };
}
/* suivi { debut, fin, derive, min, max } */
function suivi() {
  const o = { debut: NaN, fin: NaN, ecart: 0, min: Infinity, max: -Infinity, vu: false };
  o.noter = (x) => {
    if (!o.vu) { o.debut = x; o.vu = true; }
    o.fin = x; if (x < o.min) o.min = x; if (x > o.max) o.max = x;
    const d = Math.abs(x - o.debut); if (d > o.ecart || !(d === d)) o.ecart = d;
  };
  o.sortir = () => ({ debut: o.debut, fin: o.fin, derive: Math.abs(o.debut) > 1e-9 ? o.ecart / Math.abs(o.debut) : o.ecart, min: o.min, max: o.max });
  return o;
}
const fraction = (i, m) => (m > 1 ? i / (m - 1) : 0);
/* disposition d un FILM mesuree sur les lignes : image(i) = numero d image de la ligne i (croissant) ; debuts[k] = premiere
   ligne de l image k, tailles[k] = ses lignes ; parImage = taille commune si toutes egales, sinon null */
function filmDe(n, image) {
  const debuts = []; let p = -1;
  for (let i = 0; i < n; i++) { const f = image(i); if (f !== p) { debuts.push(i); p = f; } }
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}

// ---------- 1 : onde gravitationnelle sur un anneau de masses libres (jauge TT, ordre lineaire en h) ----------
// Onde le long de z, pulsation 1. Deplacement TT : x' = x + (h+ x + hx y)/2 cos t, y' = y + (hx x - h+ y)/2 cos t.
// La matrice de deformation est symetrique et sans trace : aire multipliee par 1 - (h+^2 + hx^2)/4 cos^2 t (conservee a l ordre 1),
//   etirement principal 1 + h/2 avec h = sqrt(h+^2 + hx^2), axe a (1/2) atan2(hx, h+) : 0/90 deg (+), 45 deg (x).
function deformerTT(x, y, hp, hx, c, o, i) {
  o[i] = x + (hp / 2 * x + hx / 2 * y) * c;
  o[i + 1] = y + (hx / 2 * x - hp / 2 * y) * c;
}
function ondeGravitationnelle(P, n) {
  const N = P.masses, hp = P.hPlus, hx = P.hCroix, T = Math.ceil(n / N), duree = P.cycles * DEUX_PI;
  const brut = new Float64Array(n * 3), q = new Float64Array(2);
  const X = new Float64Array(N), Y = new Float64Array(N);
  for (let j = 0; j < N; j++) { X[j] = cosD(DEUX_PI * j / N); Y[j] = sinD(DEUX_PI * j / N); }
  for (let i = 0; i < n; i++) {
    const j = i % N, k = Math.floor(i / N), t = duree * fraction(k, T);
    deformerTT(X[j], Y[j], hp, hx, cosD(t), brut, 3 * i);
    brut[3 * i + 2] = 2 * t / duree; // z = temps, remis sur [0, 2] (le rayon de l anneau vaut 1)
  }
  /* aire du polygone des N masses, image par image (calcul direct, pas lu dans brut) */
  const A0 = N / 2 * sinD(DEUX_PI / N), aire = suivi(); let ecartAire = 0;
  const ax = new Float64Array(N), ay = new Float64Array(N);
  for (let k = 0; k < T; k++) {
    const c = cosD(duree * fraction(k, T));
    for (let j = 0; j < N; j++) { deformerTT(X[j], Y[j], hp, hx, c, q, 0); ax[j] = q[0]; ay[j] = q[1]; }
    let A = 0; for (let j = 0; j < N; j++) { const l = (j + 1) % N; A += ax[j] * ay[l] - ax[l] * ay[j]; }
    A /= 2 * A0; aire.noter(A); if (Math.abs(A - 1) > ecartAire) ecartAire = Math.abs(A - 1);
  }
  /* etirement a t = 0 : masse la plus eloignee (premiere en cas d egalite a 1e-12 pres) */
  let rmax = -1, jmax = 0;
  for (let j = 0; j < N; j++) { deformerTT(X[j], Y[j], hp, hx, 1, q, 0); const r = Math.sqrt(q[0] * q[0] + q[1] * q[1]); if (r > rmax + 1e-12) { rmax = r; jmax = j; } }
  const h = Math.sqrt(hp * hp + hx * hx);
  return { brut, invariants: {
    aire: aire.sortir(),
    aireOrdre2: { mesure: ecartAire, formule: h * h / 4, note: 'relative area change; second order in h (first order cancels)' },
    etirement: { mesure: rmax, formule: 1 + h / 2, angleDegres: 360 * jmax / N, angleFormuleDegres: h > 0 ? 90 * atan2D(hx, hp) / PI : 0 },
  }, film: filmDe(n, (i) => Math.floor(i / N)) };
}

// ---------- 2 : courbure de l espace-temps, paraboloide de Flamm (tranche spatiale de Schwarzschild plongee) ----------
// z(r) = 2 sqrt(2M (r - 2M)), r >= 2M. Longueur d un meridien = distance radiale PROPRE : int dr / sqrt(1 - 2M/r)
//   = sqrt(r (r - 2M)) + 2M ln((sqrt r + sqrt(r - 2M)) / sqrt(2M)) depuis l horizon. Observateur en chute radiale (cycloide) dessus.
const zFlamm = (r, M) => 2 * Math.sqrt(2 * M * (r - 2 * M));
function etaCycloide(s) { /* resout eta + sin eta = s, 0 <= s < pi (Newton) */
  let e = s / 2;
  for (let k = 0; k < 60; k++) { const f = e + sinD(e) - s, d = 1 + cosD(e); if (!(d > 1e-14)) break; const de = f / d; e -= de; if (Math.abs(de) < 1e-15) break; }
  return e;
}
function courbureEspaceTemps(P, n) {
  const M = P.M, Rmax = P.rmax * M, r0 = Math.min(P.r0, P.rmax) * M;
  const nO = Math.max(1, Math.floor(n / 5)), nS = n - nO, brut = new Float64Array(n * 3);
  const nPhi = Math.max(8, Math.round(Math.sqrt(2 * nS))), nu = Math.max(2, Math.ceil(nS / nPhi)), umax = Math.sqrt(Rmax - 2 * M);
  for (let i = 0; i < nS; i++) {
    const a = i % nPhi, qq = Math.floor(i / nPhi), u = umax * fraction(qq, nu), r = 2 * M + u * u, ph = DEUX_PI * a / nPhi;
    brut[3 * i] = r * cosD(ph); brut[3 * i + 1] = r * sinD(ph); brut[3 * i + 2] = zFlamm(r, M);
  }
  /* observateur lache au repos en r0 : r = r0/2 (1 + cos eta), tau = sqrt(r0^3/8M) (eta + sin eta) ; points a pas de temps PROPRE egaux */
  const A = Math.sqrt(r0 * r0 * r0 / (8 * M)), etaH = acosD(4 * M / r0 - 1), tauH = A * (etaH + sinD(etaH));
  for (let j = 0; j < nO; j++) {
    const e = etaCycloide((etaH + sinD(etaH)) * fraction(j, nO)), r = r0 / 2 * (1 + cosD(e)), i = 3 * (nS + j);
    brut[i] = r; brut[i + 1] = 0; brut[i + 2] = zFlamm(Math.max(r, 2 * M), M);
  }
  /* distance propre : longueur du meridien z(r) en polyligne fine (20000 segments en u = sqrt(r - 2M)) */
  let L = 0; const K = 20000;
  for (let k = 0; k < K; k++) {
    const u1 = umax * k / K, u2 = umax * (k + 1) / K, dr = u2 * u2 - u1 * u1, dz = zFlamm(2 * M + u2 * u2, M) - zFlamm(2 * M + u1 * u1, M);
    L += Math.sqrt(dr * dr + dz * dz);
  }
  const formuleL = Math.sqrt(Rmax * (Rmax - 2 * M)) + 2 * M * lnD((Math.sqrt(Rmax) + Math.sqrt(Rmax - 2 * M)) / Math.sqrt(2 * M));
  let ecartProfil = 0;
  /* forme carree z^2 / 8M = r - 2M (la racine amplifierait l arrondi de r pres de la gorge) */
  for (let i = 0; i < nS; i++) { const x = brut[3 * i], y = brut[3 * i + 1], z = brut[3 * i + 2], d = Math.abs(z * z / (8 * M) - (Math.sqrt(x * x + y * y) - 2 * M)) / Rmax; if (d > ecartProfil) ecartProfil = d; }
  return { brut, invariants: {
    profil: { mesure: ecartProfil, formule: 0, note: 'max |z^2/8M - (r - 2M)| / rmax over the drawn surface' },
    distancePropre: { mesure: L, formule: formuleL, coordonnee: Rmax - 2 * M, de: 2 * M, a: Rmax },
    tempsPropreHorizon: { mesure: tauH, r0, note: 'proper time of the infalling observer from r0 to the horizon: finite' },
  } };
}

// ---------- 3 : chute radiale dans un trou noir de Schwarzschild (M = 1), lachee au repos en r0 ----------
// Cycloide : r = r0/2 (1 + cos eta), tau = sqrt(r0^3/(8M)) (eta + sin eta) ; tau(r = 0) = (pi/2) r0^(3/2) / sqrt(2M).
// Temps de Schwarzschild (MTW 31.10) : t/2M = ln|(q + tan(eta/2)) / (q - tan(eta/2))| + q (eta + (r0/4M)(eta + sin eta)),
//   q = sqrt(r0/2M - 1) : diverge en r = 2M (tan(eta/2) = q). Sous l horizon t n est plus un temps : on le fige a la coupure.
function tSchwarzschild(e, r0, M) {
  const q = Math.sqrt(r0 / (2 * M) - 1), th = sinD(e / 2) / cosD(e / 2);
  return 2 * M * (lnD(Math.abs((q + th) / (q - th))) + q * (e + r0 / (4 * M) * (e + sinD(e))));
}
function chuteTrouNoir(P, n) {
  const M = 1, r0 = P.r0, A = Math.sqrt(r0 * r0 * r0 / (8 * M)), etaH = acosD(4 * M / r0 - 1);
  const tauTotalFormule = PI / 2 * r0 * Math.sqrt(r0) / Math.sqrt(2 * M), coupure = P.coupure * tauTotalFormule;
  const brut = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const e = PI * fraction(i, n), r = r0 / 2 * (1 + cosD(e)), tau = A * (e + sinD(e));
    const t = e < etaH ? tSchwarzschild(e, r0, M) : Infinity;
    brut[3 * i] = r; brut[3 * i + 1] = tau; brut[3 * i + 2] = t < coupure ? t : coupure;
  }
  /* temps propre total, quadrature independante : int_0^r0 dr / sqrt(2M/r - 2M/r0), r = r0 sin^2(th), point milieu */
  const K = 4000; let tau = 0;
  for (let k = 0; k < K; k++) {
    const th = PI_2 * (k + 0.5) / K, s = sinD(th), r = r0 * s * s, drdth = 2 * r0 * s * cosD(th);
    tau += drdth / Math.sqrt(2 * M / r - 2 * M / r0) * PI_2 / K;
  }
  /* temps coordonne de r0 a 4M, quadrature independante : int E dr / ((1 - 2M/r) sqrt(2M/r - 2M/r0)), E = sqrt(1 - 2M/r0) */
  const E = Math.sqrt(1 - 2 * M / r0), r4 = Math.min(4 * M, r0 * 0.999), th4 = asinD(Math.sqrt(r4 / r0)); let t4 = 0;
  for (let k = 0; k < K; k++) {
    const th = th4 + (PI_2 - th4) * (k + 0.5) / K, s = sinD(th), r = r0 * s * s, drdth = 2 * r0 * s * cosD(th);
    t4 += E * drdth / ((1 - 2 * M / r) * Math.sqrt(2 * M / r - 2 * M / r0)) * (PI_2 - th4) / K;
  }
  const etaDe = (r) => acosD(2 * r / r0 - 1);
  const tA = tSchwarzschild(etaDe(2 * M * (1 + 1e-4)), r0, M), tB = tSchwarzschild(etaDe(2 * M * (1 + 1e-8)), r0, M);
  return { brut, invariants: {
    tempsPropreTotal: { mesure: tau, formule: tauTotalFormule, trace: brut[3 * (n - 1) + 1] },
    tempsPropreHorizon: { mesure: A * (etaH + sinD(etaH)), fini: true },
    tempsCoordonne4M: { mesure: t4, formule: tSchwarzschild(etaDe(r4), r0, M), r: r4 },
    divergenceHorizon: { t_1e4: tA, t_1e8: tB, mesure: (tB - tA) / lnD(1e4), formule: 2 * M, note: 't ~ -2M ln(r - 2M): slope per e-fold of (r - 2M)' },
    coupure: { valeur: coupure, note: 't drawn clipped at this value; inside r < 2M it is not a time coordinate and is held at the clip' },
  }, /* FIN connue : la derniere ligne est r = 0 (eta = pi) au temps propre tau total ; l horizon est franchi a la ligne horizon.indice */
  fin: { evenement: 'singularity', indice: n - 1, t: brut[3 * (n - 1) + 1], r: brut[3 * (n - 1)],
    horizon: { indice: (() => { for (let i = 0; i < n; i++) if (brut[3 * i] <= 2 * M) return i; return null; })(), tau: A * (etaH + sinD(etaH)) } } };
}

// ---------- 4 : dilatation du temps (horloges statiques autour d une masse, M = 1, et horloge en mouvement) ----------
// Statique en r : dtau/dt = sqrt(1 - 2M/r). En mouvement (relativite restreinte) : dtau/dt = 1/gamma, gamma = 1/sqrt(1 - v^2).
// Helices : angle = temps coordonne t (le meme pour toutes), hauteur = temps propre tau -> pas de l helice = rythme de l horloge.
const gammaDe = (v) => 1 / Math.sqrt(1 - v * v);
const GM_TERRE = 3.986004418e14, C_SI = 299792458, R_TERRE = 6.371e6, R_GPS = 2.656175e7, JOUR_US = 86400e6;
function dilatationTemps(P, n) {
  const K = P.horloges, M = 1, Rloin = 36, pistes = K + 1, m = Math.ceil(n / pistes), duree = P.tours * DEUX_PI;
  const rayons = [], rythmes = [];
  for (let k = 0; k < K; k++) { const r = P.rmin + (30 - P.rmin) * fraction(k, K); rayons.push(r); rythmes.push(Math.sqrt(1 - 2 * M / r)); }
  rayons.push(Rloin); rythmes.push(1 / gammaDe(P.v));
  const brut = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = Math.min(pistes - 1, Math.floor(i / m)), t = duree * fraction(i - k * m, m);
    brut[3 * i] = rayons[k] * cosD(t); brut[3 * i + 1] = rayons[k] * sinD(t); brut[3 * i + 2] = rythmes[k] * t;
  }
  /* GPS (unites SI) : horloge au sol (rotation de la Terre negligee) contre horloge a bord (orbite circulaire, v = sqrt(GM/r)) */
  const ph = (r) => Math.sqrt(1 - 2 * GM_TERRE / (r * C_SI * C_SI)), v = Math.sqrt(GM_TERRE / R_GPS);
  const rg = (ph(R_GPS) / ph(R_TERRE) - 1) * JOUR_US, rr = (1 / gammaDe(v / C_SI) - 1) * JOUR_US;
  const net = (ph(R_GPS) / gammaDe(v / C_SI) / ph(R_TERRE) - 1) * JOUR_US;
  return { brut, invariants: {
    rythmes: { mesure: rythmes.slice(), formule: rayons.map((r, k) => (k < K ? Math.sqrt(1 - 2 * M / r) : Math.sqrt(1 - P.v * P.v))), rayons, note: 'last clock: moving at v in flat space (drawn far out)' },
    gps: { mesure: { relativiteGenerale: rg, relativiteRestreinte: rr, net },
      formule: { relativiteGenerale: GM_TERRE / (C_SI * C_SI) * (1 / R_TERRE - 1 / R_GPS) * JOUR_US, relativiteRestreinte: -v * v / (2 * C_SI * C_SI) * JOUR_US },
      unite: 'microseconds per day', note: 'first-order formulas; ground clock rotation (~0.1 us/day) and orbit eccentricity ignored' },
  } };
}

// ---------- 5 : effet tunnel (Schrodinger 1-D, hbar = m = 1), Fourier a pas fractionnes (Strang), FFT maison ----------
// psi(x, 0) = (2 pi s^2)^(-1/4) exp(-(x - x0)^2 / (4 s^2)) exp(i k0 x), barriere V0 sur [0, a) (a = nombre de cellules * dx).
// Plan wave : E < V0 : T = 1 / (1 + V0^2 sinh^2(kappa a) / (4 E (V0 - E))) ; E > V0 : sin^2(k2 a) et (E - V0).
function fabriquerFFT(N) {
  let lg = 0; while ((1 << lg) < N) lg++;
  const rev = new Uint32Array(N), cs = new Float64Array(N / 2), sn = new Float64Array(N / 2);
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < lg; b++) if (i & (1 << b)) r |= 1 << (lg - 1 - b); rev[i] = r; }
  for (let k = 0; k < N / 2; k++) { cs[k] = cosD(DEUX_PI * k / N); sn[k] = -sinD(DEUX_PI * k / N); }
  return (re, im, inverse) => {
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= N; len <<= 1) {
      const half = len >> 1, pas = N / len;
      for (let i = 0; i < N; i += len) for (let j = 0; j < half; j++) {
        const wr = cs[j * pas], wi = inverse ? -sn[j * pas] : sn[j * pas], a = i + j, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
    if (inverse) for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
  };
}
function transmission(E, V0, a) {
  if (!(E > 0)) return 0;
  if (V0 === 0) return 1;
  if (Math.abs(E - V0) < 1e-12) return 1 / (1 + V0 * a * a / 2);
  if (E < V0) { const s = sinhD(Math.sqrt(2 * (V0 - E)) * a); return 1 / (1 + V0 * V0 * s * s / (4 * E * (V0 - E))); }
  const s = sinD(Math.sqrt(2 * (E - V0)) * a); return 1 / (1 + V0 * V0 * s * s / (4 * E * (E - V0)));
}
function effetTunnel(P, n) {
  /* game82 (audit : k0 = 0.6 -> 962 ms au certificat, 3 000 pas) : le pas cinetique est exact en split-step, l erreur de decoupage
   *   croit avec k0 x dt -> dt = 0.06 / k0 garde k0 x dt constant : 1 500 pas pour tout k0 de [0.6, 2.5], precision mesuree au banc */
  const NX = 1024, L = 300, dx = L / NX, sig = 8, x0 = -45, k0 = P.k0, V0 = P.V0, F = 25, dt = 0.06 / k0;
  const cellules = Math.max(1, Math.round(P.largeur / dx)), aEff = cellules * dx, j0 = NX / 2;
  const tFin = 90 / k0, pasParImage = Math.ceil(tFin / dt / (F - 1)), h = tFin / (pasParImage * (F - 1));
  const re = new Float64Array(NX), im = new Float64Array(NX), V = new Float64Array(NX), fft = fabriquerFFT(NX);
  for (let j = 0; j < NX; j++) V[j] = j >= j0 && j < j0 + cellules ? V0 : 0;
  const norme = 1 / Math.sqrt(Math.sqrt(2 * PI * sig * sig));
  for (let j = 0; j < NX; j++) { const x = -L / 2 + j * dx, g = norme * expD(-(x - x0) * (x - x0) / (4 * sig * sig)); re[j] = g * cosD(k0 * x); im[j] = g * sinD(k0 * x); }
  { let s = 0; for (let j = 0; j < NX; j++) s += re[j] * re[j] + im[j] * im[j]; s = 1 / Math.sqrt(s * dx); for (let j = 0; j < NX; j++) { re[j] *= s; im[j] *= s; } }
  /* T moyen sur le spectre REEL du paquet discret (|phi(k)|^2 de la FFT initiale, k > 0) */
  const kj = new Float64Array(NX);
  for (let j = 0; j < NX; j++) kj[j] = DEUX_PI / L * (j < NX / 2 ? j : j - NX);
  let Tpaquet = 0;
  { const fr = Float64Array.from(re), fi = Float64Array.from(im); fft(fr, fi, false); let w = 0;
    for (let j = 0; j < NX; j++) if (kj[j] > 0) { const p = fr[j] * fr[j] + fi[j] * fi[j]; w += p; Tpaquet += p * transmission(kj[j] * kj[j] / 2, V0, aEff); }
    Tpaquet /= w; }
  /* phases precalculees : potentiel (demi-pas) et cinetique (pas entier) */
  const pVr = new Float64Array(NX), pVi = new Float64Array(NX), pKr = new Float64Array(NX), pKi = new Float64Array(NX);
  for (let j = 0; j < NX; j++) { const a = -V[j] * h / 2; pVr[j] = cosD(a); pVi[j] = sinD(a); const b = -kj[j] * kj[j] * h / 2; pKr[j] = cosD(b); pKi[j] = sinD(b); }
  const mul = (pr, pi) => { for (let j = 0; j < NX; j++) { const a = re[j], b = im[j]; re[j] = a * pr[j] - b * pi[j]; im[j] = a * pi[j] + b * pr[j]; } };
  const images = [], prob = suivi();
  const photo = () => { const d = new Float64Array(NX); let s = 0; for (let j = 0; j < NX; j++) { d[j] = re[j] * re[j] + im[j] * im[j]; s += d[j]; } prob.noter(s * dx); images.push(d); };
  photo();
  for (let f = 1; f < F; f++) {
    for (let s = 0; s < pasParImage; s++) { mul(pVr, pVi); fft(re, im, false); mul(pKr, pKi); fft(re, im, true); mul(pVr, pVi); }
    photo();
  }
  const fin = images[F - 1]; let T = 0, R = 0;
  for (let j = 0; j < NX; j++) { if (j >= j0 + cellules) T += fin[j]; else if (j < j0) R += fin[j]; }
  T *= dx; R *= dx;
  const brut = new Float64Array(n * 3), m = Math.ceil(n / F);
  for (let i = 0; i < n; i++) {
    const f = Math.min(F - 1, Math.floor(i / m)), g = Math.floor((i - f * m) * NX / m);
    brut[3 * i] = -L / 2 + g * dx; brut[3 * i + 1] = tFin * f / (F - 1); brut[3 * i + 2] = images[f][g];
  }
  const E = k0 * k0 / 2;
  return { brut, invariants: {
    probabiliteTotale: prob.sortir(),
    transmission: { mesure: T, formule: transmission(E, V0, aEff), paquet: Tpaquet, reflexion: R, energie: E, V0, largeurEffective: aEff,
      note: 'formule = plane wave at the central energy k0^2/2; paquet = T(E) averaged over the packet\'s own momentum spectrum' },
    grille: { points: NX, longueur: L, dx, dt: h, pas: pasParImage * (F - 1), duree: tFin },
  }, film: filmDe(n, (i) => Math.min(F - 1, Math.floor(i / m))),
  /* FIN connue : a t = tFin (derniere image) le paquet est scinde en une part transmise (au-dela de la barriere) et une
     part reflechie (avant elle) ; reste = probabilite encore sur la barriere */
  fin: { evenement: 'split', indice: n - 1, t: tFin, transmis: T, reflechi: R, reste: 1 - T - R } };
}

// ---------- 6 : superposition quantique (1s + 2p_z)/sqrt(2) de l hydrogene (unites atomiques) ----------
// |psi(t)|^2 = (psi1^2 + psi2^2 + 2 psi1 psi2 cos(dE t)) / 2, dE = E2 - E1 = -1/8 + 1/2 = 3/8 ; periode du battement 2 pi / dE.
// <z>(t) = <1s|z|2p_z> cos(dE t), <1s|z|2p_z> = 128 sqrt(2) / 243. Tirage exact : proposition q = (psi1^2 + psi2^2)/2 (melange
//   de deux lois connues), acceptation (1 + g cos(dE t)) / 2, g = 2 psi1 psi2 / (psi1^2 + psi2^2) dans [-1, 1].
const E1 = -1 / 2, E2 = -1 / 8, AMPLITUDE_Z = 128 * Math.sqrt(2) / 243;
function tirerProposition(alea, o) {
  let r, c;
  if (alea() < 0.5) { r = -0.5 * lnD((1 - alea()) * (1 - alea()) * (1 - alea())); c = 2 * alea() - 1; }
  else { let p = 1; for (let k = 0; k < 5; k++) p *= 1 - alea(); r = -lnD(p); c = cbrtD(2 * alea() - 1); }
  const ph = DEUX_PI * alea(), s = Math.sqrt(Math.max(0, 1 - c * c));
  const p1 = expD(-r) / Math.sqrt(PI), p2 = r * expD(-r / 2) * c / (4 * Math.sqrt(2 * PI)), den = p1 * p1 + p2 * p2;
  o.x = r * s * cosD(ph); o.y = r * s * sinD(ph); o.z = r * c; o.g = den > 0 ? 2 * p1 * p2 / den : 0;
}
function superpositionQuantique(P, n) {
  const dE = E2 - E1, Tb = DEUX_PI / dE, F = P.images, m = Math.ceil(n / F), duree = P.periodes * Tb;
  const alea = mulberry32(P.graine >>> 0), o = {}, brut = new Float64Array(n * 3);
  let tirages = 0;
  for (let i = 0; i < n; i++) {
    const f = Math.min(F - 1, Math.floor(i / m)), t = duree * f / F, c = cosD(dE * t);
    for (;;) { tirages++; tirerProposition(alea, o); if (2 * alea() < 1 + o.g * c) break; }
    brut[3 * i] = o.x; brut[3 * i + 1] = o.z; brut[3 * i + 2] = 4 * t / Tb; // (x, z, temps) : nuage projete sur le plan x-z, etale dans le temps
  }
  /* centroide <z>(t) par poids d importance sur un echantillon a part (memes tirages a tout t) : (S0 + c S1) / (1 + c W1) */
  const NM = 20000, b = mulberry32((P.graine ^ 0x9E3779B9) >>> 0); let S0 = 0, S1 = 0, W1 = 0;
  for (let k = 0; k < NM; k++) { tirerProposition(b, o); S0 += o.z; S1 += o.g * o.z; W1 += o.g; }
  S0 /= NM; S1 /= NM; W1 /= NM;
  const centroide = (t) => { const c = cosD(dE * t); return (S0 + c * S1) / (1 + c * W1); };
  /* periode mesuree : montees successives de <z>(t) - milieu sur 3 periodes, interpolation lineaire */
  const G = 6000, tMax = 3 * Tb, val = new Float64Array(G + 1); let lo = Infinity, hi = -Infinity;
  for (let g = 0; g <= G; g++) { val[g] = centroide(tMax * g / G); if (val[g] < lo) lo = val[g]; if (val[g] > hi) hi = val[g]; }
  const mi = (lo + hi) / 2, montees = [];
  for (let g = 1; g <= G; g++) { const a = val[g - 1] - mi, c = val[g] - mi; if (a < 0 && c >= 0) montees.push(tMax * (g - 1 + a / (a - c)) / G); }
  const periode = montees.length >= 2 ? (montees[montees.length - 1] - montees[0]) / (montees.length - 1) : NaN;
  return { brut, invariants: {
    periodeBattement: { mesure: periode, formule: DEUX_PI / (3 / 8), montees: montees.length, unite: 'atomic units of time (2.42e-17 s)' },
    amplitudeCentroide: { mesure: (hi - lo) / 2, formule: AMPLITUDE_Z, echantillons: NM, unite: 'Bohr radii' },
    centroideMoyen: { mesure: S0, formule: 0 },
    echantillonnage: { tirages, acceptes: n },
  }, film: filmDe(n, (i) => Math.min(F - 1, Math.floor(i / m))) };
}

// ---------- 7 : champ dipolaire terrestre et particule piegee (ceintures de Van Allen), unites : rayon terrestre = 1, q/m = 1 ----------
// Moment dipolaire selon -z : B = B0 (-3 z x, -3 z y, r^2 - 3 z^2) / r^5. Ligne de champ : r = L cos^2(lambda).
// Miroir (invariant mu = v_perp^2 / 2B) : cos^6(lm) / sqrt(1 + 3 sin^2(lm)) = sin^2(alpha0). Boris non relativiste, pas fixe.
function champDipole(x, y, z, B0, b) {
  const r2 = x * x + y * y + z * z, r = Math.sqrt(r2), k = B0 / (r2 * r2 * r);
  b[0] = -3 * z * x * k; b[1] = -3 * z * y * k; b[2] = (r2 - 3 * z * z) * k;
}
function tournerBoris(v, bx, by, bz, h) {
  const tx = bx * h / 2, ty = by * h / 2, tz = bz * h / 2, s = 2 / (1 + tx * tx + ty * ty + tz * tz);
  const a = v[0], b = v[1], c = v[2];
  const px = a + (b * tz - c * ty), py = b + (c * tx - a * tz), pz = c + (a * ty - b * tx);
  v[0] = a + (py * tz - pz * ty) * s; v[1] = b + (pz * tx - px * tz) * s; v[2] = c + (px * ty - py * tx) * s;
}
function latitudeMiroir(alpha) {
  const s2 = sinD(alpha) * sinD(alpha); let a = 0, b = PI_2;
  for (let k = 0; k < 200; k++) { const l = (a + b) / 2, c = cosD(l), s = sinD(l), f = c * c * c * c * c * c - s2 * Math.sqrt(1 + 3 * s * s); if (f > 0) a = l; else b = l; }
  return (a + b) / 2;
}
function champDipolaire(P, n) {
  const B0 = P.B0, L0 = P.L0, alpha = P.pitch * PI / 180, LIGNES = [2, 3, 4, 5, 6];
  const nL = Math.max(10, Math.floor(0.3 * n)), nP = Math.max(2, n - nL), brut = new Float64Array(n * 3), b = [0, 0, 0];
  /* lignes de champ dans le plan x-z, des deux cotes, de la surface (r = 1) a la surface */
  const nLignes = 2 * LIGNES.length, mL = Math.ceil(nL / nLignes);
  for (let i = 0; i < Math.min(nL, n); i++) {
    const q = Math.min(nLignes - 1, Math.floor(i / mL)), L = LIGNES[q >> 1], cote = q & 1 ? -1 : 1, lmax = acosD(1 / Math.sqrt(L));
    const l = -lmax + 2 * lmax * fraction(i - q * mL, mL), c = cosD(l), r = L * c * c;
    brut[3 * i] = cote * r * c; brut[3 * i + 1] = 0; brut[3 * i + 2] = r * sinD(l);
  }
  /* tangente analytique de r = L cos^2(l) contre la direction de B (meme fonction que le pousseur) */
  let ecartLigne = 0;
  for (const L of LIGNES) {
    const lmax = acosD(1 / Math.sqrt(L));
    for (let k = 0; k <= 2000; k++) {
      const l = -lmax + 2 * lmax * k / 2000, c = cosD(l), s = sinD(l);
      const x = L * c * c * c, z = L * c * c * s, tx = -3 * L * c * c * s, tz = L * (c * c * c - 2 * c * s * s);
      champDipole(x, 0, z, B0, b);
      const sinA = Math.abs(tx * b[2] - tz * b[0]) / (Math.sqrt(tx * tx + tz * tz) * Math.sqrt(b[0] * b[0] + b[2] * b[2]));
      if (sinA > ecartLigne) ecartLigne = sinA;
    }
  }
  /* particule : |v| = 1, angle d attaque alpha a l equateur, centre-guide en L0 (depart decale d un rayon de giration) */
  const Beq = B0 / (L0 * L0 * L0), rho = sinD(alpha) / Beq, v = [0, sinD(alpha), cosD(alpha)];
  let x = L0 - rho, y = 0, z = 0;
  const Omax = Beq / (sinD(alpha) * sinD(alpha)) * 1.2, hBrut = 0.15 / Omax;
  const pas = Math.max(1, Math.ceil(P.duree / hBrut / (nP - 1))), h = P.duree / (pas * (nP - 1));
  const energie = suivi(), mu = suivi(); let latN = -Infinity, latS = Infinity, rebonds = 0, signe = 1;
  const noter = (i) => {
    brut[3 * i] = x; brut[3 * i + 1] = y; brut[3 * i + 2] = z;
    champDipole(x, y, z, B0, b);
    const Bm = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]), v2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2], vp = (v[0] * b[0] + v[1] * b[1] + v[2] * b[2]) / Bm;
    energie.noter(v2 / 2); mu.noter((v2 - vp * vp) / (2 * Bm));
  };
  noter(nL);
  for (let i = nL + 1; i < n; i++) {
    for (let s = 0; s < pas; s++) {
      champDipole(x, y, z, B0, b); tournerBoris(v, b[0], b[1], b[2], h);
      x += h * v[0]; y += h * v[1]; z += h * v[2];
      const lat = asinD(z / Math.sqrt(x * x + y * y + z * z)); if (lat > latN) latN = lat; if (lat < latS) latS = lat;
      champDipole(x, y, z, B0, b); const sg = v[0] * b[0] + v[1] * b[1] + v[2] * b[2] > 0 ? 1 : -1; if (sg !== signe) { rebonds++; signe = sg; }
    }
    noter(i);
  }
  const lm = latitudeMiroir(alpha);
  return { brut, invariants: {
    ligneDeChamp: { mesure: ecartLigne, formule: 0, note: 'max |sin| of the angle between the tangent of r = L cos^2(lat) and B' },
    energie: energie.sortir(), momentMagnetique: mu.sortir(),
    miroirs: { nord: latN, sud: -latS, formule: lm, symetrie: Math.abs(latN + latS), rebonds, unite: 'radian of magnetic latitude' },
    deriveLongitude: { degres: 180 / PI * atan2D(y, x), note: 'gradient-curvature drift around the Earth (positive charge drifts westward)' },
    giration: { rayonEquateur: rho, rapportL: rho / L0 },
  } };
}

// ---------- 8 : onde electromagnetique plane + rayonnement du dipole de Hertz ----------
// Loin d un dipole oscillant (axe z), dans le plan equatorial, l onde est localement plane : k le long de x, E = E0 (0, e sin phi, cos phi),
//   B = (k x E) / c = E0/c (0, -cos phi, e sin phi). Puissance par angle solide du dipole : dP/dOmega ~ sin^2(theta).
// E en V/m (E0 = 1), B en tesla, dessine multiplie par c pour etre visible ; nuage : directions tirees selon sin^2(theta), posees sur r = R sin^2(theta).
function ondeLumiere(P, n) {
  const e = P.ellipticite, nW = 2 * Math.floor(n / 4), nC = n - nW, R = 1.5, X0 = 3, lam = 1, brut = new Float64Array(n * 3);
  let ortho = 0, rap = 0;
  for (let j = 0; j < nW / 2; j++) {
    const x = X0 + P.longueursOnde * lam * fraction(j, nW / 2), ph = DEUX_PI * x / lam;
    const Ex = 0, Ey = e * sinD(ph), Ez = cosD(ph), kx = 1, ky = 0, kz = 0; // k unitaire le long de x
    const Bx = (ky * Ez - kz * Ey) / C_SI, By = (kz * Ex - kx * Ez) / C_SI, Bz = (kx * Ey - ky * Ex) / C_SI; // B = k x E / c
    const i = 6 * j; brut[i] = x; brut[i + 1] = Ey; brut[i + 2] = Ez; brut[i + 3] = x; brut[i + 4] = C_SI * By; brut[i + 5] = C_SI * Bz;
    const nE = Math.sqrt(Ex * Ex + Ey * Ey + Ez * Ez), nB = Math.sqrt(Bx * Bx + By * By + Bz * Bz);
    if (nE > 1e-9) {
      const o = Math.max(Math.abs(Ex * Bx + Ey * By + Ez * Bz) / (nE * nB), Math.abs(Ex * kx + Ey * ky + Ez * kz) / nE, Math.abs(Bx * kx + By * ky + Bz * kz) / nB); if (o > ortho) ortho = o;
      const d = Math.abs(nE / nB / C_SI - 1); if (d > rap) rap = d;
    }
  }
  const alea = mulberry32(P.graine >>> 0); let su2 = 0, tirages = 0;
  for (let k = 0; k < nC; k++) {
    let u; for (;;) { tirages++; u = 2 * alea() - 1; if (alea() < 1 - u * u) break; }
    const ph = DEUX_PI * alea(), s2 = 1 - u * u, s = Math.sqrt(s2), r = R * s2, i = 3 * (nW + k);
    brut[i] = r * s * cosD(ph); brut[i + 1] = r * s * sinD(ph); brut[i + 2] = r * u; su2 += u * u;
  }
  return { brut, invariants: {
    orthogonalite: { mesure: ortho, formule: 0, note: 'max of |E.B|/(|E||B|), |E.k|/|E|, |B.k|/|B|' },
    rapportEB: { mesure: rap, formule: 0, c: C_SI, note: 'max | |E|/(c|B|) - 1 |' },
    /* game100 : un tirage — sigma de la moyenne = sqrt(Var(u^2) / nC), Var(u^2) = E[u^4] - 1/25 = 3/35 - 1/25 = 8/175 sous la loi (1 - u^2) */
    motifDipolaire: { mesure: nC > 0 ? su2 / nC : NaN, formule: 0.2, sigma: nC > 0 ? Math.sqrt(8 / (175 * nC)) : NaN, echantillons: nC, tirages, note: '<cos^2 theta> for a sin^2(theta) pattern is 1/5 (isotropic: 1/3)' },
  } };
}

// ---------- 9 : diagramme d espace-temps (relativite restreinte, c = 1) ----------
// Boost de vitesse v : t' = gamma (t - v x), x' = gamma (x - v t). Invariant : s^2 = t^2 - x^2. Cones de lumiere x = +-t inchanges.
// Jumeaux : l un reste en x = 0 pendant T, l autre va a vJ et revient ; ages T et T sqrt(1 - vJ^2).
function booster(t, x, v, o) { const g = gammaDe(v); o[0] = g * (t - v * x); o[1] = g * (x - v * t); }
function diagrammeEspaceTemps(P, n) {
  const v = P.v, G = P.grille, E = 5, brut = new Float64Array(n * 3), q = [0, 0];
  const nG = Math.floor(n / 2), nC = Math.floor(n / 6), nJ = n - nG - nC;
  let ecartS = 0, ecartC = 0;
  /* reseau : G lignes t = cste et G lignes x = cste dans [-E, E]^2 ; z = s^2 / E */
  const lignes = 2 * G, mG = Math.max(1, Math.ceil(nG / lignes));
  for (let i = 0; i < nG; i++) {
    const l = Math.min(lignes - 1, Math.floor(i / mG)), a = -E + 2 * E * fraction(l % G, G), b = -E + 2 * E * fraction(i - l * mG, mG);
    const t = l < G ? a : b, x = l < G ? b : a;
    booster(t, x, v, q); brut[3 * i] = q[1]; brut[3 * i + 1] = q[0]; brut[3 * i + 2] = (q[0] * q[0] - q[1] * q[1]) / E;
    const d = Math.abs(q[0] * q[0] - q[1] * q[1] - (t * t - x * x)) / Math.max(1, t * t + x * x); if (d > ecartS) ecartS = d;
  }
  for (let k = 0; k < nC; k++) {
    const t = -1.2 * E + 2.4 * E * fraction(k >> 1, (nC + 1) >> 1), x = k & 1 ? -t : t, i = 3 * (nG + k);
    booster(t, x, v, q); brut[i] = q[1]; brut[i + 1] = q[0]; brut[i + 2] = 0;
    const d = Math.abs(Math.abs(q[1]) - Math.abs(q[0])) / Math.max(1, Math.abs(t)); if (d > ecartC) ecartC = d;
  }
  /* jumeaux : lignes d univers dans le repere du sedentaire, puis boostees ; z = temps propre ecoule (somme des segments boostes) */
  const T = P.duree, vJ = P.vJumeau, mJ = Math.max(2, Math.floor(nJ / 2)), age = [0, 0];
  for (let w = 0; w < 2; w++) {
    let tp = 0, xp = 0, tau = 0, tAvant = 0;
    for (let k = 0; k < (w ? nJ - mJ : mJ); k++) {
      const t = T * fraction(k, w ? nJ - mJ : mJ), x = w ? vJ * (t <= T / 2 ? t : T - t) : 0;
      /* demi-tour (t = T/2) entre deux echantillons : ajoute a la somme (sinon la corde coupe le coin et vieillit le voyageur) */
      if (w && k > 0 && tAvant < T / 2 && t > T / 2) { booster(T / 2, vJ * T / 2, v, q); const dt = q[0] - tp, dx = q[1] - xp; tau += Math.sqrt(Math.max(0, dt * dt - dx * dx)); tp = q[0]; xp = q[1]; }
      booster(t, x, v, q);
      if (k > 0) { const dt = q[0] - tp, dx = q[1] - xp; tau += Math.sqrt(Math.max(0, dt * dt - dx * dx)); }
      tp = q[0]; xp = q[1]; tAvant = t;
      const i = 3 * (nG + nC + (w ? mJ : 0) + k); brut[i] = q[1]; brut[i + 1] = q[0]; brut[i + 2] = tau;
    }
    age[w] = tau;
  }
  return { brut, invariants: {
    intervalle: { mesure: ecartS, formule: 0, note: 'max |s\'^2 - s^2| / max(1, t^2 + x^2) over the lattice events' },
    coneLumiere: { mesure: ecartC, formule: 0 },
    jumeaux: { sedentaire: age[0], voyageur: age[1], mesure: age[0] - age[1], formule: T * (1 - Math.sqrt(1 - vJ * vJ)), unite: 'same unit as duree' },
    gamma: { valeur: gammaDe(v) },
  } };
}

// ---------- 10 : mouvement brownien (marche au hasard gaussienne a graine) et loi d Einstein ----------
// Pas gaussien de variance 2 D dt par composante (dt = 1) : <r^2>(t) = 6 D t en 3-D. Vitesses de Maxwell-Boltzmann (m = 1) :
//   composantes N(0, kT), vitesse moyenne sqrt(8 kT / pi).
function mouvementBrownien(P, n) {
  const Np = P.particules, S = P.pas, D = P.D, sd = Math.sqrt(2 * D), gauss = gaussiennes(mulberry32(P.graine >>> 0));
  const lignes = S + 1, montres = Math.min(Np, Math.ceil(n / lignes)), traces = new Float64Array(montres * lignes * 3), msd = new Float64Array(S + 1);
  for (let p = 0; p < Np; p++) {
    let x = 0, y = 0, z = 0;
    for (let s = 1; s <= S; s++) {
      x += sd * gauss(); y += sd * gauss(); z += sd * gauss(); msd[s] += x * x + y * y + z * z;
      if (p < montres) { const i = 3 * (p * lignes + s); traces[i] = x; traces[i + 1] = y; traces[i + 2] = z; }
    }
  }
  let num = 0, den = 0;
  for (let s = 1; s <= S; s++) { msd[s] /= Np; num += s * msd[s]; den += s * s; }
  const Dmesure = num / den / 6;
  const sv = Math.sqrt(P.kT); let somme = 0, somme2 = 0;
  for (let p = 0; p < Np; p++) { const a = sv * gauss(), b = sv * gauss(), c = sv * gauss(), w = a * a + b * b + c * c; somme += Math.sqrt(w); somme2 += w; }
  const brut = new Float64Array(n * 3), tot = montres * lignes;
  for (let i = 0; i < n; i++) { const k = 3 * (i % tot); brut[3 * i] = traces[k]; brut[3 * i + 1] = traces[k + 1]; brut[3 * i + 2] = traces[k + 2]; }
  return { brut, invariants: {
    diffusion: { mesure: Dmesure, formule: D, msdFinal: msd[S], msdFormule: 6 * D * S, particules: Np, note: 'least-squares slope of <r^2>(t) through 0, divided by 6' },
    vitesseMoyenne: { mesure: somme / Np, formule: Math.sqrt(8 * P.kT / PI), quadratique: Math.sqrt(somme2 / Np), quadratiqueFormule: Math.sqrt(3 * P.kT) },
    traces: { particulesDessinees: montres, pointsParTrace: lignes },
  } };
}

// ---------- catalogue ----------
const GEN = { ondeGravitationnelle, courbureEspaceTemps, chuteTrouNoir, dilatationTemps, effetTunnel, superpositionQuantique,
  champDipolaire, ondeLumiere, diagrammeEspaceTemps, mouvementBrownien };
const SANS_LYAP = {
  ondeGravitationnelle: 'sans objet (deformation lineaire periodique, formule fermee)',
  courbureEspaceTemps: 'sans objet (surface geometrique, formule fermee)',
  chuteTrouNoir: 'sans objet (geodesique radiale, formule fermee)',
  dilatationTemps: 'sans objet (rythmes constants, formule fermee)',
  effetTunnel: 'sans objet (equation de Schrodinger lineaire : evolution unitaire, pas de chaos)',
  superpositionQuantique: 'sans objet (nuage de probabilite, pas une trajectoire)',
  champDipolaire: 'sans objet (mouvement adiabatique quasi integrable ; non mesure)',
  ondeLumiere: 'sans objet (onde plane et motif, formules fermees)',
  diagrammeEspaceTemps: 'sans objet (transformation lineaire)',
  mouvementBrownien: 'sans objet (processus aleatoire : la divergence ne mesurerait que le generateur)',
};
export const SYSTEMES = Object.freeze([
  { id: 'ondeGravitationnelle', nom: 'Gravitational wave on a ring', science: 'General relativity', D: 3, nuage: true,
    params: { hPlus: 0.3, hCroix: 0, masses: 24, cycles: 2 }, bornes: { hPlus: [0, 0.5], hCroix: [0, 0.5], masses: [8, 64], cycles: [1, 4] },
    phrase: 'A visualisation of the formula for a ring of free test masses hit by a gravitational wave travelling along the axis (TT gauge, linear in h, plus and cross polarisations); h is exaggerated about 10^20 times over real waves, and it is a drawing of the formula, not a photo.' },
  { id: 'courbureEspaceTemps', nom: 'Curved space around a black hole', science: 'General relativity', D: 3, nuage: true,
    params: { M: 1, rmax: 20, r0: 10 }, bornes: { M: [0.5, 2], rmax: [6, 40], r0: [3, 20] },
    phrase: 'A visualisation of Flamm\'s paraboloid z = 2 sqrt(2M(r - 2M)), the embedding of one slice of space around a non-rotating black hole (time and one dimension removed), with an infalling observer drawn on it; it is a drawing of a formula, not a photo of space.' },
  { id: 'chuteTrouNoir', nom: 'Falling into a black hole', science: 'General relativity', D: 3,
    params: { r0: 10, coupure: 3 }, bornes: { r0: [3, 40], coupure: [1.5, 10] },
    phrase: 'A visualisation of the formulas for an observer dropped from rest into a Schwarzschild black hole (G = c = M = 1): radius against the observer\'s own time, which stays finite, and the far-away time, which diverges at the horizon and is clipped; a drawing of formulas, not a photo.' },
  { id: 'dilatationTemps', nom: 'Clocks that tick slower', science: 'Relativity', D: 3, nuage: true,
    params: { horloges: 4, rmin: 3, v: 0.8, tours: 3 }, bornes: { horloges: [2, 6], rmin: [2.5, 10], v: [0, 0.99], tours: [1, 6] },
    phrase: 'A visualisation of time dilation: each helix climbs at its clock\'s rate, sqrt(1 - 2M/r) for clocks held still near a mass and 1/gamma for a clock moving at v; static clocks only (no orbits), and it is a drawing of the formulas, not a photo.' },
  { id: 'effetTunnel', nom: 'Quantum tunnelling', science: 'Quantum mechanics', D: 3, nuage: true,
    params: { k0: 1.2, V0: 1, largeur: 1 }, bornes: { k0: [0.6, 2.5], V0: [0.2, 3], largeur: [0.3, 4] },
    phrase: 'A visualisation of the one-dimensional Schrodinger equation (hbar = m = 1) solved by the split-step Fourier method: a Gaussian wave packet meets a rectangular barrier and part of it leaks through; shown is |psi|^2 against position and time, a drawing of the equation, not a photo.' },
  { id: 'superpositionQuantique', nom: 'Quantum superposition', science: 'Quantum mechanics', D: 3, nuage: true,
    params: { graine: 1, images: 12, periodes: 2 }, bornes: { graine: [1, 1000000], images: [4, 24], periodes: [1, 4] },
    phrase: 'A visualisation of the hydrogen superposition (1s + 2p_z)/sqrt(2): points drawn from |psi(t)|^2 at successive times, projected on the x-z plane and spread along time, so the cloud sloshes up and down at the beat frequency (E2 - E1)/h; a drawing of the formula, not a photo of an atom.' },
  { id: 'champDipolaire', nom: 'Earth\'s magnetic trap', science: 'Space plasma physics', D: 3, nuage: true,
    params: { B0: 1000, L0: 3, pitch: 40, duree: 40 }, bornes: { B0: [200, 2000], L0: [2, 6], pitch: [25, 80], duree: [15, 240] },
    phrase: 'A visualisation of an ideal dipole field (field lines r = L cos^2 latitude) and one charged particle trapped in it like the Van Allen belts, bouncing between mirror points and drifting around; scaled units (Earth radius 1, non-relativistic Boris pusher, no real Earth field), a drawing of formulas, not a photo.' },
  { id: 'ondeLumiere', nom: 'Light as a wave', science: 'Electromagnetism', D: 3, nuage: true,
    params: { ellipticite: 0, longueursOnde: 3, graine: 1 }, bornes: { ellipticite: [-1, 1], longueursOnde: [1, 6], graine: [1, 1000000] },
    phrase: 'A visualisation of an electromagnetic plane wave (E perpendicular to B perpendicular to the direction of travel, |B| = |E|/c, B drawn times c) next to the sin^2(theta) radiation pattern of an oscillating dipole; ellipticity 0 is linear, +-1 circular; a drawing of Maxwell\'s formulas, not a photo.' },
  { id: 'diagrammeEspaceTemps', nom: 'Spacetime diagram', science: 'Special relativity', D: 3, nuage: true,
    params: { v: 0.5, vJumeau: 0.8, duree: 10, grille: 9 }, bornes: { v: [-0.95, 0.95], vJumeau: [0.1, 0.99], duree: [2, 20], grille: [5, 15] },
    phrase: 'A visualisation of the Lorentz transformation (c = 1): a grid of events, the light cone and the twins\' world-lines as seen by an observer moving at v, lifted by the invariant interval t^2 - x^2 (proper time for the twins); instant turn-around, no gravity, a drawing of the formula, not a photo.' },
  { id: 'mouvementBrownien', nom: 'Brownian motion', science: 'Statistical physics', D: 3, nuage: true,
    params: { particules: 2500, pas: 120, D: 0.5, kT: 1, graine: 1 }, bornes: { particules: [500, 4000], pas: [50, 300], D: [0.1, 2], kT: [0.5, 4], graine: [1, 1000000] },
    phrase: 'A visualisation of Brownian motion as a seeded Gaussian random walk (time step 1), whose spread obeys Einstein\'s law <r^2> = 6 D t in three dimensions, with Maxwell-Boltzmann speeds; no real fluid is simulated, it is a drawing of the statistical law, not a photo.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { ondeGravitationnelle: ['masses'], dilatationTemps: ['horloges'], superpositionQuantique: ['graine', 'images'],
  ondeLumiere: ['graine'], diagrammeEspaceTemps: ['grille'], mouvementBrownien: ['particules', 'pas', 'graine'] };
const parId = (id) => { const s = SYSTEMES.find((x) => x.id === id); if (!s) throw new Error('systeme inconnu: ' + id); return s; };

/** params bornes : non fini -> defaut ; hors bornes -> ramene ; entiers arrondis ; masses multiple de 8 ; r0 <= rmax */
function borner(id, params) {
  const s = parId(id), P = {};
  for (const k of Object.keys(s.params)) {
    let v = Number(params && params[k]); if (!Number.isFinite(v)) v = s.params[k];
    const [a, b] = s.bornes[k]; v = Math.min(b, Math.max(a, v));
    if ((ENTIERS[id] || []).includes(k)) v = Math.round(v);
    P[k] = v;
  }
  if (id === 'ondeGravitationnelle') P.masses = 8 * Math.round(P.masses / 8);
  if (id === 'courbureEspaceTemps') P.r0 = Math.min(P.r0, P.rmax);
  return P;
}

export function reglagesPhysique(id, params = {}) {
  const s = parId(id), P = borner(id, params);
  return Object.keys(s.params).map((k) => ({ chemin: 'params.' + k, nom: k, min: s.bornes[k][0], max: s.bornes[k][1], valeur: P[k] }));
}

export function simuler(id, params = {}, { n = 1500 } = {}) {
  const s = parId(id), P = borner(id, params);
  n = Math.max(2, Math.floor(n));
  const g = GEN[id](P, n), D = s.D;
  let fini = g.brut.length === n * D; for (let i = 0; fini && i < g.brut.length; i++) if (!Number.isFinite(g.brut[i])) fini = false;
  const r = { params: P, D, n, bornee: fini, brut: g.brut, lyapunov: null, uniteLyapunov: SANS_LYAP[id], points: null, invariants: g.invariants };
  if (s.nuage) r.nuage = true;
  if (g.film) r.film = g.film;
  if (g.fin) r.fin = g.fin;
  return r;
}
