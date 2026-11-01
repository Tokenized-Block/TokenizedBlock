// tam-vide-quantique.js -- TAM, la vue VIDE QUANTIQUE : quatre principes du vide absents des autres vues, simules honnetement.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-champs-quantiques.js : SYSTEMES, ENTIERS, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null : aucun systeme ici n est une trajectoire chaotique), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun generateur aleatoire natif (graines : mulberry32).
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux du moteur ; exp ici avec + - * / ;
//   Math.sqrt/round/floor/ceil/abs/min/max seulement (IEEE exacts).
// REGLE DU PROJET : aucune valeur publiee sans source lue. Ici AUCUNE : tout est sans dimension (hbar = 1, masse du mode = 1),
//   chaque formule comparee est DERIVEE dans le commentaire de sa section, SOURCES est vide expres.
// Les quatre systemes :
//   videComprime      : vide comprime d un mode (optique quantique), fonction de Wigner gaussienne exacte, rotation libre.
//   casimirDynamique  : effet Casimir dynamique, un mode de cavite module a 2 omega0 cree des photons a partir du vide.
//   higgsVide         : brisure spontanee de symetrie (chapeau mexicain), champ homogene classique amorti.
//   emissionSpontanee : emission spontanee = couplage au vide de N modes discrets (Wigner-Weisskopf), Schrodinger exact (RK4).
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = Math.PI, DEUX_PI = 2 * Math.PI, LN2 = lnD(2), OR = (Math.sqrt(5) - 1) / 2;

// ---------- constantes d entree : aucune (unites sans dimension) ----------
export const SOURCES = Object.freeze({});

// ---------- arithmetique deterministe ----------
function expD(x) { /* e^x avec + - * / seulement (meme fonction que tam-champs-quantiques.js) */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
const sinhD = (x) => (expD(x) - expD(-x)) / 2;
const coshD = (x) => (expD(x) + expD(-x)) / 2;
const asinhD = (y) => lnD(y + Math.sqrt(y * y + 1));
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* gaussienne N(0,1) par Box-Muller (lnD, cosD du moteur) */
function gaussien(alea) { const u = 1 - alea(), v = alea(); return Math.sqrt(-2 * lnD(u)) * cosD(DEUX_PI * v); }
/* suivi d invariants point par point : { debut, fin, derive, min, max } (meme definition que tam-champs-quantiques.js) */
function suiveur() {
  const inv = {};
  return {
    noter(v) {
      for (const k of Object.keys(v)) {
        const x = v[k], I = inv[k] || (inv[k] = { debut: x, fin: x, ecart: 0, min: x, max: x });
        I.fin = x; if (x < I.min) I.min = x; if (x > I.max) I.max = x;
        const d = Math.abs(x - I.debut); if (d > I.ecart || !(d === d)) I.ecart = d;
      }
    },
    fini() {
      const o = {};
      for (const k of Object.keys(inv)) { const I = inv[k]; o[k] = { debut: I.debut, fin: I.fin, derive: Math.abs(I.debut) > 1e-9 ? I.ecart / Math.abs(I.debut) : I.ecart, min: I.min, max: I.max }; }
      return o;
    },
  };
}
function decouper(n, images) { const d = []; for (let k = 0; k < images; k++) d.push(Math.floor(k * n / images)); return d; }
function filmDe(debuts, n) {
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}
/* regression lineaire y = a + b x ; rend b */
function pente(xs, ys) {
  const n = xs.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}
/* ligne du pas i (0..n-1) quand on enregistre n lignes sur S pas */
const pasDeLigne = (i, n, S) => (n === 1 ? 0 : Math.round(i * S / (n - 1)));

// ---------- 1 : vide comprime (un mode, x = (a + a^+)/sqrt 2, p = (a - a^+)/(i sqrt 2), hbar = 1) ----------
// Vide : W(x, p) = (1/pi) e^{-(x^2 + p^2)}, Var x = Var p = 1/2.
// S(xi), xi = r e^{i theta} agit sur (x, p) par la matrice symplectique M = R(theta/2) diag(e^-r, e^r) R(-theta/2) (symetrique) ;
//   Sigma = M (I/2) M^T = (1/2) R(theta/2) diag(e^-2r, e^2r) R(theta/2)^T, d ou
//   Var x = (cosh 2r - sinh 2r cos theta)/2, Var p = (cosh 2r + sinh 2r cos theta)/2, Cov = -(sinh 2r sin theta)/2,
//   det Sigma = (cosh^2 2r - sinh^2 2r)/4 = 1/4 (incertitude minimale de Robertson-Schrodinger), <n> = (Var x + Var p - 1)/2 = sinh^2 r.
// Evolution libre H = omega (a^+ a + 1/2) : rotation rigide de l espace des phases d angle omega t,
//   donc theta(t) = theta - 2 omega t (la variance revient avec la periode pi/omega).
const varX = (r, th) => 0.5 * (coshD(2 * r) - sinhD(2 * r) * cosD(th));
const varP = (r, th) => 0.5 * (coshD(2 * r) + sinhD(2 * r) * cosD(th));
const covXP = (r, th) => -0.5 * sinhD(2 * r) * sinD(th);
const photonsComprime = (r) => sinhD(r) * sinhD(r);
function videComprime(P, n) {
  const r = P.r, th = P.theta, w = P.omega, alea = mulberry32(P.graine >>> 0);
  const em = expD(-r), ep = expD(r), c = cosD(th / 2), s = sinD(th / 2);
  const M00 = c * c * em + s * s * ep, M01 = c * s * (em - ep), M11 = s * s * em + c * c * ep;
  const brut = new Float64Array(n * 4), rv = Math.sqrt(0.5);
  let sxx = 0, spp = 0, sxp = 0, rotX = 0, rotP = 0;
  for (let i = 0; i < n; i++) {
    const a = rv * gaussien(alea), b = rv * gaussien(alea); /* tirage du vide */
    const z0 = M00 * a + M01 * b, z1 = M01 * a + M11 * b; /* comprime, a t = 0 */
    sxx += z0 * z0; spp += z1 * z1; sxp += z0 * z1;
    const t = n === 1 ? 0 : P.duree * i / (n - 1), ang = w * t, ca = cosD(ang), sa = sinD(ang);
    const x = z0 * ca + z1 * sa, p = -z0 * sa + z1 * ca;
    const o = 4 * i; brut[o] = x; brut[o + 1] = p; brut[o + 2] = t; brut[o + 3] = expD(-(a * a + b * b)) / PI;
    rotX += x * x / varX(r, th - 2 * w * t); rotP += p * p / varP(r, th - 2 * w * t);
  }
  const mx = sxx / n, mp = spp / n, mxp = sxp / n, Vx = varX(r, th), Vp = varP(r, th), C = covXP(r, th);
  const sdV = (v) => v * Math.sqrt(2 / n);
  return { D: 4, brut, nuage: true, unite: 'sans objet (tirages independants d une distribution de Wigner, pas une trajectoire)', invariants: {
    variances: { x: { mesure: mx, formule: Vx, sigma: sdV(Vx) }, p: { mesure: mp, formule: Vp, sigma: sdV(Vp) },
      xp: { mesure: mxp, formule: C, sigma: Math.sqrt((Vx * Vp + C * C) / n) }, vide: 0.5, unite: 'hbar = 1 (vide : 1/2)' },
    incertitude: { produit: Math.sqrt(mx * mp), produitFormule: Math.sqrt(Vx * Vp), determinant: mx * mp - mxp * mxp, determinantFormule: Vx * Vp - C * C,
      minimum: 0.25, note: 'Delta x Delta p = 1/2 when theta = 0 ; det Sigma = 1/4 for every theta (minimum uncertainty kept)' },
    photons: { mesure: (mx + mp - 1) / 2, formule: photonsComprime(r), sigma: 0.5 * Math.sqrt(2 * (Vx * Vx + Vp * Vp + 2 * C * C) / n) },
    rotation: { x2SurVarX: rotX / n, p2SurVarP: rotP / n, attendu: 1, sigma: Math.sqrt(2 / n), periodeVariance: PI / w,
      note: 'each point is rotated by omega t ; the variance pattern repeats with period pi/omega (squeeze angle theta - 2 omega t)' },
    echantillons: n } };
}

// ---------- 2 : effet Casimir dynamique (un mode, frequence modulee, creation parametrique depuis le vide) ----------
// H = p^2/2 + omega(t)^2 x^2/2, omega(t) = omega0 (1 + eps sin 2 omega0 t). H quadratique : les operateurs de Heisenberg sont
//   lineaires, (x, p)(t) = Phi(t) (x, p)(0), Phi = [[u1, u2], [u1', u2']] fait de deux fonctions de mode classiques u'' = -omega(t)^2 u
//   (u1(0) = 1, u1'(0) = 0 ; u2(0) = 0, u2'(0) = 1) : c est la forme de Bogoliubov. Depuis le vide Sigma0 = diag(1/(2 omega0), omega0/2),
//   Sigma(t) = Phi Sigma0 Phi^T EXACTEMENT ; det Phi = wronskien = 1 (donc det Sigma = 1/4 garde).
// Photons (par rapport au mode statique omega0) : N = (P + omega0^2 X)/(2 omega0) - 1/2, X = Sigma_xx, P = Sigma_pp.
// Ellipse dessinee : z = Phi w, w sur l ellipse 1-sigma du vide ; elle est donc exacte meme tres comprimee (aucune soustraction XP - C^2).
// Formule comparee (derivee ici, onde tournante, ordre eps) : V = eps omega0^2 sin(2 omega0 t) x^2, x = (a + a^+)/sqrt(2 omega0)
//   -> en representation d interaction, termes resonants V_RWA = (i eps omega0 / 4)(a^+2 - a^2) = generateur de S(xi), |xi| = eps omega0 t / 2,
//   donc N(t) = sinh^2(eps omega0 t / 2). Termes contrarotatifs et eps^2 negliges ; aux periodes entieres l ecart mesure sur r
//   est d ordre eps^2 (environ 0.36 eps^2 relatif, mesure le 2026-11-01), le banc le borne a 0.6 eps^2.
const PAS_C = 400;
const photonsRWA = (eps, w0, t) => { const s = sinhD(eps * w0 * t / 2); return s * s; };
const tauxRWA = (eps, w0) => eps * w0 / 2;
function casimirDynamique(P, n) {
  const e = P.eps, w0 = P.omega0, h = DEUX_PI / (w0 * PAS_C), S = P.periodes * PAS_C;
  const w2 = (t) => { const w = w0 * (1 + e * sinD(2 * w0 * t)); return w * w; };
  const a0 = 1 / (2 * w0), b0 = w0 / 2, sa = Math.sqrt(a0), sb = Math.sqrt(b0);
  /* u = [u1, u1', u2, u2'] ; RK4 de u'' = -omega(t)^2 u (les deux solutions avancent ensemble) */
  const u = Float64Array.from([1, 0, 0, 1]);
  const XPC = () => [u[0] * u[0] * a0 + u[2] * u[2] * b0, u[1] * u[1] * a0 + u[3] * u[3] * b0, u[0] * u[1] * a0 + u[2] * u[3] * b0];
  const nombre = (X, Pp) => (Pp + w0 * w0 * X) / (2 * w0) - 0.5;
  const brut = new Float64Array(n * 4), suivi = suiveur(), serie = { t: [], mesure: [], formule: [], rMesure: [] };
  let ligne = 0;
  const ecrire = (st) => {
    while (ligne < n && pasDeLigne(ligne, n, S) === st) {
      const ph = DEUX_PI * ((ligne * OR) % 1), wx = sa * cosD(ph), wp = sb * sinD(ph), [X, Pp] = XPC(), o = 4 * ligne;
      brut[o] = u[0] * wx + u[2] * wp; brut[o + 1] = u[1] * wx + u[3] * wp; brut[o + 2] = st * h; brut[o + 3] = nombre(X, Pp);
      ligne++;
    }
  };
  ecrire(0);
  for (let st = 0; st < S; st++) {
    const t = st * h, q1 = w2(t), q2 = w2(t + h / 2), q3 = w2(t + h);
    for (let j = 0; j < 4; j += 2) {
      const y = u[j], v = u[j + 1];
      const k1y = v, k1v = -q1 * y;
      const k2y = v + h / 2 * k1v, k2v = -q2 * (y + h / 2 * k1y);
      const k3y = v + h / 2 * k2v, k3v = -q2 * (y + h / 2 * k2y);
      const k4y = v + h * k3v, k4v = -q3 * (y + h * k3y);
      u[j] = y + h / 6 * (k1y + 2 * k2y + 2 * k3y + k4y); u[j + 1] = v + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
    }
    const s1 = st + 1;
    if (s1 % PAS_C === 0) { /* periode entiere du mode : omega(t) = omega0 exactement */
      const tt = s1 * h, [X, Pp] = XPC(), N = nombre(X, Pp);
      suivi.noter({ wronskien: u[0] * u[3] - u[2] * u[1] });
      serie.t.push(tt); serie.mesure.push(N); serie.formule.push(photonsRWA(e, w0, tt)); serie.rMesure.push(asinhD(Math.sqrt(Math.max(0, N))));
    }
    ecrire(s1);
  }
  const k0 = Math.floor(serie.t.length / 2), rate = pente(serie.t.slice(k0), serie.rMesure.slice(k0));
  const kf = serie.t.length - 1, tf = serie.t[kf], rf = serie.rMesure[kf], rth = tauxRWA(e, w0) * tf;
  const inv = suivi.fini();
  inv.photons = { mesure: serie.mesure[kf], formule: serie.formule[kf], t: tf, serie,
    note: 'N measured from the exact Heisenberg (Bogoliubov) evolution of the vacuum ; formula N = sinh^2(eps omega0 t / 2) is the rotating-wave approximation (it neglects terms of order eps^2)' };
  inv.compression = { mesure: rf, formule: rth, ecart: Math.abs(rf - rth) / rth, unite: 'squeeze parameter r = asinh(sqrt N)' };
  inv.croissance = { mesure: rate, formule: tauxRWA(e, w0), ecart: Math.abs(rate - tauxRWA(e, w0)) / tauxRWA(e, w0), fenetre: [serie.t[k0], tf],
    unite: 'dr/dt in units of omega0 (slope over the second half)' };
  return { D: 4, brut, invariants: inv, unite: 'sans objet (evolution exacte d un oscillateur quantique module)' };
}

// ---------- 3 : vide de Higgs (chapeau mexicain), champ complexe homogene, classique, amorti ----------
// L = |dphi/dt|^2 - V, V = -mu^2 |phi|^2 + lambda |phi|^4 ; equation : phi'' = mu^2 phi - 2 lambda |phi|^2 phi - gamma phi'.
// Minimum : dV/d|phi|^2 = -mu^2 + 2 lambda |phi|^2 = 0 -> v = mu / sqrt(2 lambda).
// Radial : rho'' = mu^2 rho - 2 lambda rho^3 (+ L^2/rho^3) ; derivee en v : mu^2 - 6 lambda v^2 = -2 mu^2 -> m_H^2 = 2 mu^2,
//   avec amortissement : omega_d = sqrt(2 mu^2 - gamma^2/4). Angulaire : V ne depend que de |phi| -> aucune force de rappel
//   (mode de Goldstone sans masse) et d(rho^2 theta')/dt = -gamma rho^2 theta' exactement : L(t) e^{gamma t} = L(0).
const vevHiggs = (mu, lam) => mu / Math.sqrt(2 * lam);
const masse2Higgs = (mu) => 2 * mu * mu;
const omegaAmorti = (mu, g) => Math.sqrt(masse2Higgs(mu) - g * g / 4);
function higgsVide(P, n) {
  const mu = P.mu, mu2 = mu * mu, lam = P.lambda, g = P.gamma, v = vevHiggs(mu, lam), alea = mulberry32(P.graine >>> 0);
  const V = (a, b) => { const q = a * a + b * b; return -mu2 * q + lam * q * q; };
  /* y = [phi1, phi2, phi1', phi2', energie dissipee] */
  const deriv = (y, d, gg) => {
    const q = y[0] * y[0] + y[1] * y[1], f = mu2 - 2 * lam * q;
    d[0] = y[2]; d[1] = y[3]; d[2] = f * y[0] - gg * y[2]; d[3] = f * y[1] - gg * y[3]; d[4] = 2 * gg * (y[2] * y[2] + y[3] * y[3]);
  };
  const k1 = new Float64Array(5), k2 = new Float64Array(5), k3 = new Float64Array(5), k4 = new Float64Array(5), tmp = new Float64Array(5);
  const rk4 = (y, hh, gg) => {
    deriv(y, k1, gg); for (let i = 0; i < 5; i++) tmp[i] = y[i] + 0.5 * hh * k1[i];
    deriv(tmp, k2, gg); for (let i = 0; i < 5; i++) tmp[i] = y[i] + 0.5 * hh * k2[i];
    deriv(tmp, k3, gg); for (let i = 0; i < 5; i++) tmp[i] = y[i] + hh * k3[i];
    deriv(tmp, k4, gg); for (let i = 0; i < 5; i++) y[i] += hh / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  };
  const energie = (y) => y[2] * y[2] + y[3] * y[3] + V(y[0], y[1]);
  const moment = (y) => y[0] * y[3] - y[1] * y[2];
  /* depart pres du sommet : petite fluctuation (graine) de la position et de la vitesse */
  const a0 = DEUX_PI * alea(), a1 = DEUX_PI * alea(), r0 = 0.02 * v, u0 = 0.1 * mu * v;
  const y = Float64Array.from([r0 * cosD(a0), r0 * sinD(a0), u0 * cosD(a1), u0 * sinD(a1), 0]);
  const T = 20 / g + 60 / mu, S = Math.ceil(T * mu / 0.02), h = T / S;
  const brut = new Float64Array(n * 4), suivi = suiveur(), E0 = energie(y), L0 = moment(y);
  let ligne = 0;
  const ecrire = (st) => { while (ligne < n && pasDeLigne(ligne, n, S) === st) { const o = 4 * ligne; brut[o] = y[0]; brut[o + 1] = y[1]; brut[o + 2] = V(y[0], y[1]); brut[o + 3] = st * h; ligne++; } };
  ecrire(0);
  /* passages de rho - v par zero, avec l amplitude de chaque demi-oscillation */
  let prec = Math.sqrt(y[0] * y[0] + y[1] * y[1]) - v, amp = 0; const passages = [], amps = [];
  for (let st = 1; st <= S; st++) {
    rk4(y, h, g);
    const d = Math.sqrt(y[0] * y[0] + y[1] * y[1]) - v;
    if ((prec < 0 && d >= 0) || (prec > 0 && d <= 0)) { passages.push((st - 1 + prec / (prec - d)) * h); amps.push(amp); amp = 0; }
    if (Math.abs(d) > amp) amp = Math.abs(d);
    prec = d;
    /* L e^{gamma t} : suivi tant que e^{gamma t} < e^10 (au-dela, l arrondi de L, devenu minuscule, serait amplifie) */
    if (st % 50 === 0) { suivi.noter({ bilanEnergie: energie(y) + y[4] }); if (g * st * h < 10) suivi.noter({ momentAngulaireCorrige: moment(y) * expD(g * st * h) }); }
    ecrire(st);
  }
  amps.push(amp); /* amps[i] = amplitude de la demi-oscillation AVANT le passage i ; amps[i+1] = apres */
  const dans = (a) => a < 0.02 * v && a > 1e-8 * v;
  let i0 = -1, i1 = -1;
  for (let i = 0; i < passages.length; i++) if (dans(amps[i]) && dans(amps[i + 1])) { if (i0 < 0) i0 = i; i1 = i; }
  if (i0 >= 0 && (i1 - i0) % 2 === 1) i1--;
  const wMes = i0 >= 0 && i1 > i0 ? PI * (i1 - i0) / (passages[i1] - passages[i0]) : NaN, wTh = omegaAmorti(mu, g);
  const rhoFin = Math.sqrt(y[0] * y[0] + y[1] * y[1]);
  /* mode de Goldstone : depart SUR le cercle, petite vitesse tangentielle, sans frottement */
  const ug = 0.01 * mu * v, yg = Float64Array.from([v, 0, 0, ug, 0]), Tg = 20 * DEUX_PI / Math.sqrt(masse2Higgs(mu)), Sg = Math.ceil(Tg * mu / 0.02), hg = Tg / Sg;
  let wgMin = Infinity, wgMax = -Infinity, rgMax = 0;
  for (let st = 1; st <= Sg; st++) {
    rk4(yg, hg, 0);
    const q = yg[0] * yg[0] + yg[1] * yg[1], wg = moment(yg) / q, dr = Math.abs(Math.sqrt(q) - v);
    if (wg < wgMin) wgMin = wg; if (wg > wgMax) wgMax = wg; if (dr > rgMax) rgMax = dr;
  }
  /* courbures du potentiel au vide (differences finies) : radiale et le long du cercle */
  const ef = 1e-3 * v, df = 1e-3;
  const m2r = (V(v + ef, 0) - 2 * V(v, 0) + V(v - ef, 0)) / (2 * ef * ef);
  const m2t = (V(v * cosD(df), v * sinD(df)) - 2 * V(v, 0) + V(v * cosD(df), -v * sinD(df))) / (2 * (v * df) * (v * df));
  const inv = suivi.fini();
  inv.vide = { mesure: rhoFin, formule: v, ecart: Math.abs(rhoFin - v) / v, Vmin: V(v, 0), VminFormule: -mu2 * mu2 / (4 * lam), unite: '|phi| (dimensionless field)' };
  inv.frequenceRadiale = { mesure: wMes, formule: wTh, ecart: Math.abs(wMes - wTh) / wTh, mH: Math.sqrt(masse2Higgs(mu)), passages: i1 - i0 + 1,
    note: 'damped radial (Higgs) oscillation, omega_d = sqrt(2 mu^2 - gamma^2/4), measured from zero crossings of |phi| - v at small amplitude' };
  inv.courbure = { radiale: m2r, radialeFormule: masse2Higgs(mu), tangentielle: m2t, tangentielleFormule: 0,
    note: '(1/2) d^2V at the vacuum : radial = m_H^2 = 2 mu^2 ; along the circle = 0 (Goldstone, massless)' };
  inv.goldstone = { vitesseAngulaireMin: wgMin, vitesseAngulaireMax: wgMax, formule: ug / v, ecartRadialMax: rgMax / v, duree: Tg,
    note: 'started on the circle with a small sideways push and no friction : it keeps sliding along the valley at constant angular speed, no restoring force' };
  return { D: 4, brut, invariants: inv, unite: 'sans objet (champ classique homogene, amorti)' };
}

// ---------- 4 : emission spontanee (Wigner-Weisskopf), un atome a deux niveaux et N modes du vide ----------
// Repere tournant a la frequence atomique, un quantum : i c_e' = g sum_k c_k, i c_k' = Delta_k c_k + g c_e, Delta_k = k delta, |k| <= M.
// Echelle infinie (derivee ici) : c_e(s) = 1/(s + g^2 sum_k 1/(s + i k delta)) et sum_k 1/(s + i k delta) = (pi/delta) coth(pi s/delta) ;
//   coth = 1 + 2 sum_m e^{-m s T_H}, T_H = 2 pi/delta. D ou, exactement : c_e = e^{-Gamma t/2} pour t < T_H, Gamma = 2 pi g^2/delta
//   (regle d or de Fermi), et c_e = e^{-Gamma t/2} - Gamma (t - T_H) e^{-Gamma (t - T_H)/2} pour T_H < t < 2 T_H (resurgence).
//   Spectre emis (t < T_H) : |c_k|^2 = g^2 (1 - 2 e^{-Gamma t/2} cos(Delta_k t) + e^{-Gamma t}) / (Delta_k^2 + Gamma^2/4).
// Ici N = 2M + 1 modes seulement (echelle tronquee) : il manque g^2 sum_{|k|>M} 1/(s + i k delta) = g^2 sum_{k>M} 2s/(s^2 + k^2 delta^2)
//   ~ 2 g^2 s/(delta^2 M) pour |s| << M delta, d ou le pole s (1 - Gamma/(pi M delta)) = -Gamma/2 : taux Gamma/(1 - Gamma/(pi M delta))
//   au premier ordre (formule tronquee, comparee aussi). L ecart des courbes aux formules exactes est mesure et borne par le banc.
const tauxFermi = (g, delta) => DEUX_PI * g * g / delta;
const tauxTronque = (G, M, delta) => G / (1 - G / (PI * M * delta));
const ampliEchelle = (G, TH, t) => (t < TH ? expD(-G * t / 2) : expD(-G * t / 2) - G * (t - TH) * expD(-G * (t - TH) / 2));
function emissionSpontanee(P, n) {
  const d = P.espacement, g = P.rapport * d, M = Math.floor(P.modes / 2), N = 2 * M + 1, G = tauxFermi(g, d), TH = DEUX_PI / d;
  const T = 1.9 * TH, S = Math.ceil(T / (0.25 / (M * d))), h = T / S, K = N + 1;
  const det = new Float64Array(K); for (let k = 1; k < K; k++) det[k] = (k - 1 - M) * d;
  const re = new Float64Array(K), im = new Float64Array(K); re[0] = 1;
  const kr = [0, 1, 2, 3].map(() => new Float64Array(K)), ki = [0, 1, 2, 3].map(() => new Float64Array(K)), tr = new Float64Array(K), ti = new Float64Array(K);
  /* dc/dt = -i H c */
  const deriv = (a, b, dr, di) => {
    let sr = 0, si = 0; for (let k = 1; k < K; k++) { sr += a[k]; si += b[k]; }
    dr[0] = g * si; di[0] = -g * sr;
    for (let k = 1; k < K; k++) { const hr = det[k] * a[k] + g * a[0], hi = det[k] * b[k] + g * b[0]; dr[k] = hi; di[k] = -hr; }
  };
  const pas = () => {
    deriv(re, im, kr[0], ki[0]); for (let k = 0; k < K; k++) { tr[k] = re[k] + 0.5 * h * kr[0][k]; ti[k] = im[k] + 0.5 * h * ki[0][k]; }
    deriv(tr, ti, kr[1], ki[1]); for (let k = 0; k < K; k++) { tr[k] = re[k] + 0.5 * h * kr[1][k]; ti[k] = im[k] + 0.5 * h * ki[1][k]; }
    deriv(tr, ti, kr[2], ki[2]); for (let k = 0; k < K; k++) { tr[k] = re[k] + h * kr[2][k]; ti[k] = im[k] + h * ki[2][k]; }
    deriv(tr, ti, kr[3], ki[3]);
    for (let k = 0; k < K; k++) { re[k] += h / 6 * (kr[0][k] + 2 * kr[1][k] + 2 * kr[2][k] + kr[3][k]); im[k] += h / 6 * (ki[0][k] + 2 * ki[1][k] + 2 * ki[2][k] + ki[3][k]); }
  };
  const images = Math.min(16, n), debuts = decouper(n, images), film = filmDe(debuts, n), brut = new Float64Array(n * 4), suivi = suiveur();
  const Pe = new Float64Array(S + 1); Pe[0] = 1;
  const g2 = g * g, pic = g2 / (G * G / 4); let pireSpectre = 0, framesSpectre = 0;
  let f = 0;
  const image = (st) => {
    const t = st * h, d0 = film.debuts[f], c = film.tailles[f], pe = re[0] * re[0] + im[0] * im[0];
    for (let r = 0; r < c; r++) { const j = 1 + Math.floor(r * N / c), o = (d0 + r) * 4; brut[o] = det[j]; brut[o + 1] = t; brut[o + 2] = re[j] * re[j] + im[j] * im[j]; brut[o + 3] = pe; }
    if (t > 0 && t < 0.95 * TH) {
      framesSpectre++; const eg = expD(-G * t / 2);
      for (let k = 1; k < K; k++) {
        const th = g2 * (1 - 2 * eg * cosD(det[k] * t) + eg * eg) / (det[k] * det[k] + G * G / 4);
        const e = Math.abs(re[k] * re[k] + im[k] * im[k] - th) / pic; if (e > pireSpectre) pireSpectre = e;
      }
    }
    f++;
  };
  const imageDe = (st) => { while (f < images && (images === 1 ? st === 0 : Math.round(f * S / (images - 1)) === st)) image(st); };
  imageDe(0);
  for (let st = 1; st <= S; st++) {
    pas();
    Pe[st] = re[0] * re[0] + im[0] * im[0];
    if (st % 25 === 0 || st === S) { let s = 0; for (let k = 0; k < K; k++) s += re[k] * re[k] + im[k] * im[k]; suivi.noter({ norme: s }); }
    imageDe(st);
  }
  /* courbe entiere contre la formule exacte de l echelle infinie ; taux par ajustement de ln P_e sur ]0.05, 0.9[ T_H */
  let pire = 0; const ts = [], ls = [], serie = { t: [], mesure: [], formule: [] }, chaque = Math.max(1, Math.floor(S / 400));
  let tPic = 0, vPic = -1, tPicF = 0, vPicF = -1;
  for (let st = 0; st <= S; st++) {
    const t = st * h, a = ampliEchelle(G, TH, t), pf = a * a, e = Math.abs(Pe[st] - pf); if (e > pire) pire = e;
    if (t > 0.05 * TH && t < 0.9 * TH && Pe[st] > 1e-6) { ts.push(t); ls.push(lnD(Pe[st])); }
    if (t > TH) { if (Pe[st] > vPic) { vPic = Pe[st]; tPic = t; } if (pf > vPicF) { vPicF = pf; tPicF = t; } }
    if (st % chaque === 0) { serie.t.push(t); serie.mesure.push(Pe[st]); serie.formule.push(pf); }
  }
  const Gmes = -pente(ts, ls), inv = suivi.fini(), Gt = tauxTronque(G, M, d);
  inv.taux = { mesure: Gmes, formule: G, ecart: Math.abs(Gmes - G) / G, formuleTronquee: Gt, ecartTronque: Math.abs(Gmes - Gt) / Gt, correctionTroncature: G / (PI * M * d),
    points: ts.length, unite: '1/time (time in units where delta is the mode spacing)',
    note: 'Fermi golden rule Gamma = 2 pi g^2 / delta, fitted on ln P_e over 0.05 to 0.9 of the recurrence time ; the ladder is cut at |k| <= M, which raises the rate by 1/(1 - Gamma/(pi M delta)) to first order' };
  inv.courbe = { pireEcart: pire, serie, note: 'P_e(t) against the exact infinite-ladder formula, 0 to 1.9 T_H' };
  inv.resurgence = { tempsHeisenberg: TH, picMesure: tPic, picFormule: tPicF, valeurMesure: vPic, valeurFormule: vPicF,
    note: 'the emitted photon is a finite set of modes : all phases realign at T_H = 2 pi / delta and the atom is re-excited (peak about 2/Gamma after T_H)' };
  inv.spectre = { pireEcartRelatif: framesSpectre ? pireSpectre : NaN, images: framesSpectre, pic: pic,
    note: 'mode populations against the Lorentzian build-up formula, frames before T_H, error relative to the line peak 4 g^2 / Gamma^2' };
  inv.modes = { N, M, g, espacement: d, largeurBande: N * d, GammaFoisTH: G * TH };
  return { D: 4, brut, film, invariants: inv, unite: 'sans objet (equation de Schrodinger exacte a un quantum, film des populations)' };
}

// ---------- catalogue ----------
const QFT = 'Quantum field theory';
export const SYSTEMES = Object.freeze([
  { id: 'videComprime', nom: 'Squeezed vacuum', science: QFT, D: 4, nuage: true, params: { r: 0.8, theta: 0, omega: 1, duree: 6, graine: 1 },
    bornes: { r: [0, 1.5], theta: [-3.1, 3.1], omega: [0.5, 2], duree: [1, 20], graine: [1, 1000000] },
    phrase: 'A visualisation of the formula for the squeezed vacuum of one light mode (hbar = 1, dimensionless quadratures): points drawn at random from its exact Gaussian Wigner function, one quadrature noise squeezed below the vacuum value 1/2 while the other grows, and the ellipse turning freely in phase space; each point is an independent sample, not a motion.' },
  { id: 'casimirDynamique', nom: 'Photons from a shaken cavity (dynamical Casimir effect)', science: QFT, D: 4, params: { eps: 0.02, omega0: 1, periodes: 30 },
    bornes: { eps: [0.005, 0.05], omega0: [0.5, 2], periodes: [10, 40] },
    phrase: 'A visualisation of one cavity mode whose frequency is modulated at twice its own frequency, as if a mirror vibrated (dimensionless units, hbar = 1, a single mode only): the exact quantum second moments grow from the vacuum and photons appear from nothing, compared with the rotating-wave formula N = sinh^2(eps omega0 t / 2).' },
  { id: 'higgsVide', nom: 'Choosing a vacuum (the Higgs Mexican hat)', science: QFT, D: 4, params: { mu: 1, lambda: 0.5, gamma: 0.1, graine: 1 },
    bornes: { mu: [0.5, 2], lambda: [0.1, 2], gamma: [0.02, 0.5], graine: [1, 1000000] },
    phrase: 'A visualisation of spontaneous symmetry breaking with the potential V = -mu^2 |phi|^2 + lambda |phi|^4 (dimensionless): one uniform complex field, treated classically with friction, rolls off the unstable top in a direction picked by a tiny random nudge and settles on the circle of minima, oscillating radially at the Higgs frequency while nothing pulls it back along the circle.' },
  { id: 'emissionSpontanee', nom: 'An atom decaying into the vacuum (spontaneous emission)', science: QFT, D: 4, params: { rapport: 0.5, espacement: 0.1, modes: 201 },
    bornes: { rapport: [0.3, 1], espacement: [0.05, 0.2], modes: [101, 251] },
    phrase: 'A visualisation of the Wigner-Weisskopf picture of spontaneous emission: one excited two-level atom coupled equally to a finite ladder of evenly spaced empty modes (dimensionless, one quantum, exact Schrodinger equation): it decays at the Fermi golden-rule rate while a Lorentzian line builds up, then is re-excited when the finite set of modes rephases.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { videComprime: ['graine'], casimirDynamique: ['periodes'], higgsVide: ['graine'], emissionSpontanee: ['modes'] };
const FONCTIONS = { videComprime, casimirDynamique, higgsVide, emissionSpontanee };
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
  const r = FONCTIONS[id](P, n);
  let fini = true; for (let i = 0; i < r.brut.length; i++) if (!Number.isFinite(r.brut[i])) { fini = false; break; }
  if (!fini) return { params: P, D: r.D, n, bornee: false, raison: 'NaN', brut: null, lyapunov: NaN, uniteLyapunov: r.unite, points: null, invariants: null };
  const o = { params: P, D: r.D, n, bornee: true, brut: r.brut, lyapunov: null, uniteLyapunov: r.unite, points: null, invariants: r.invariants };
  if (s.nuage || r.nuage) o.nuage = true;
  if (r.film) o.film = r.film;
  return o;
}
