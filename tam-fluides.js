// tam-fluides.js -- TAM, la vue MECANIQUE DES FLUIDES : modeles reduits de fluides, simules honnetement.
//
// VUE SEULEMENT : rien ici ne se frappe (le contrat deploye n accepte que les familles 1..16 de tam-moteur.js).
// Meme forme que tam-physique.js#simuler : { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov, uniteLyapunov, points: null, invariants } -> la vue 3-D les dessine sans changement.
// AUCUN de ces systemes ne resout Navier-Stokes : ce sont des modeles inviscides 2-D (tourbillons ponctuels, Euler 2-D)
//   ou des champs de vitesse ANALYTIQUES prescrits dans lesquels on advecte un traceur passif (le traceur ne reagit pas
//   sur l ecoulement). Chaque phrase le dit.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun Math.random (rien d aleatoire ici). sin/cos/ln = ceux du moteur.
// derive = ecart MAX (sur tous les points stockes) a la valeur de depart, relatif si |debut| > 1e-9, absolu sinon.
// Lyapunov : Benettin a deux trajectoires (ecart 1e-8, renormalise a chaque point stocke), mesure, jamais ecrit a la main ;
//   sur un temps fini un systeme integrable donne un petit nombre positif (cisaillement ~ ln(t)/t), pas 0 exact.
// Divergence : differences centrees d ordre 4 (pas DELTA) sur la fonction vitesse ELLE-MEME, au point du traceur,
//   a chaque point stocke : une vitesse fausse (signe, facteur) se voit, ce n est pas une identite ecrite a la main.
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = 3.141592653589793, DEUX_PI = 6.283185307179586, LN2 = 0.6931471805599453;
const D0 = 1e-8, BORNE = 1e3, MICRO_MAX = 4e6, DELTA = 2e-4;

function expD(x) { /* e^x avec + - * / seulement (meme esprit que sinD/lnD du moteur) */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
function tanhD(x) { if (x > 20) return 1; if (x < -20) return -1; const e = expD(2 * x); return (e - 1) / (e + 1); }
function sinhD(x) { const e = expD(x); return (e - 1 / e) / 2; }
/* RK4 a tampons propres ; f(y, d, c) ecrit la derivee (d est remis a zero par f si elle accumule) */
function fabriquerRK4(m, f) {
  const k1 = new Float64Array(m), k2 = new Float64Array(m), k3 = new Float64Array(m), k4 = new Float64Array(m), t = new Float64Array(m);
  return (y, c, h) => {
    f(y, k1, c); for (let i = 0; i < m; i++) t[i] = y[i] + 0.5 * h * k1[i];
    f(t, k2, c); for (let i = 0; i < m; i++) t[i] = y[i] + 0.5 * h * k2[i];
    f(t, k3, c); for (let i = 0; i < m; i++) t[i] = y[i] + h * k3[i];
    f(t, k4, c); for (let i = 0; i < m; i++) y[i] += h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  };
}
/* div u = du/dx + dv/dy, differences centrees d ordre 4 sur vel(x, y, t, c, o) */
function divergence(vel, x, y, t, c) {
  const o = [0, 0], d = DELTA, p = (xx, yy, k) => { o[0] = 0; o[1] = 0; vel(xx, yy, t, c, o); return o[k]; };
  const dudx = (-p(x + 2 * d, y, 0) + 8 * p(x + d, y, 0) - 8 * p(x - d, y, 0) + p(x - 2 * d, y, 0)) / (12 * d);
  const dvdy = (-p(x, y + 2 * d, 1) + 8 * p(x, y + d, 1) - 8 * p(x, y - d, 1) + p(x, y - 2 * d, 1)) / (12 * d);
  return dudx + dvdy;
}
/* traceur passif : etat [x, y, t], derivee = vitesse prescrite ; phase de Lyapunov = (x, y) */
function traceur(vel) {
  const o = [0, 0];
  return fabriquerRK4(3, (y, d, c) => { o[0] = 0; o[1] = 0; vel(y[0], y[1], y[2], c, o); d[0] = o[0]; d[1] = o[1]; d[2] = 1; });
}
const grilleFixe = (h0) => (c, n) => { const pas = Math.ceil(c.duree / (n - 1) / h0); return { h: c.duree / ((n - 1) * pas), pas, duree: c.duree }; };

// ---------- 1 : tourbillons ponctuels de Kirchhoff (Euler 2-D inviscide, hamiltonien) ----------
// dx_i/dt = -(1/2pi) sum_j G_j (y_i - y_j)/r_ij^2, dy_i/dt = (1/2pi) sum_j G_j (x_i - x_j)/r_ij^2.
// H = -(1/4pi) sum_{i != j} G_i G_j ln r_ij ; impulsions P = sum G_i (x_i, y_i), I = sum G_i (x_i^2 + y_i^2).
// Circulations bornees POSITIVES : avec des signes meles un dipole part a l infini ou deux tourbillons s effondrent.
const POS0 = [[2, 0], [-1.2, 1.6], [-1.0, -1.8], [0.5, 0.7]];
function vitessesTourbillons(y, d, c) {
  const N = c.nombre, G = c.G; d.fill(0);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const dx = y[2 * i] - y[2 * j], dy = y[2 * i + 1] - y[2 * j + 1], k = 1 / (DEUX_PI * (dx * dx + dy * dy));
    d[2 * i] += -G[j] * dy * k; d[2 * i + 1] += G[j] * dx * k;
    d[2 * j] += G[i] * dy * k; d[2 * j + 1] += -G[i] * dx * k;
  }
}
function distanceMinTourbillons(y, N) {
  let m = Infinity;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const dx = y[2 * i] - y[2 * j], dy = y[2 * i + 1] - y[2 * j + 1], r2 = dx * dx + dy * dy; if (r2 < m) m = r2; }
  return Math.sqrt(m);
}
const H0V = 0.05, RSV = 0.5;
function tourbillonsPonctuels() {
  let rk4 = null, m = 0;
  return {
    prep: (p) => { const c = { ...p, G: [p.G1, p.G2, p.G3, p.G4].slice(0, p.nombre) }; m = 2 * p.nombre; rk4 = fabriquerRK4(m, vitessesTourbillons); return c; },
    S: (c) => 2 * c.nombre, phase: (c) => 2 * c.nombre, D: (c) => 2 * c.nombre,
    init: (c) => { const y = new Float64Array(2 * c.nombre); for (let i = 0; i < c.nombre; i++) { y[2 * i] = POS0[i][0]; y[2 * i + 1] = POS0[i][1]; } return y; },
    grille: grilleFixe(H0V),
    /* rencontre serree : pas local ~ r^2 (periode de rotation d une paire ~ 2 pi^2 r^2 / G) */
    pasMax: (y, c) => { const r = distanceMinTourbillons(y, c.nombre); if (r >= RSV) return H0V; const x = r / RSV; return H0V * x * x; },
    avance: (y, c, h) => rk4(y, c, h),
    hors: (y, c) => { if (distanceMinTourbillons(y, c.nombre) < 1e-4) return 'collision'; for (let i = 0; i < y.length; i++) if (!(Math.abs(y[i]) <= BORNE)) return 'echappe'; return null; },
    sortie: (y, o, i, c) => { for (let k = 0; k < 2 * c.nombre; k++) o[i + k] = y[k]; },
    invariants: (y, c) => {
      const N = c.nombre, G = c.G; let H = 0, Px = 0, Py = 0, I = 0;
      for (let i = 0; i < N; i++) {
        const x = y[2 * i], z = y[2 * i + 1]; Px += G[i] * x; Py += G[i] * z; I += G[i] * (x * x + z * z);
        for (let j = i + 1; j < N; j++) { const dx = x - y[2 * j], dy = z - y[2 * j + 1]; H -= G[i] * G[j] * lnD(dx * dx + dy * dy) / (4 * PI); }
      }
      return { hamiltonien: H, impulsionX: Px, impulsionY: Py, impulsionAngulaire: I };
    },
    uniteLyapunov: 'par unite de temps',
  };
}

// ---------- 2 : double gyre periodique (Shadden, Lekien, Marsden 2005), traceur passif ----------
// psi = A sin(pi f(x,t)) sin(pi y), f = eps sin(w t) x^2 + (1 - 2 eps sin(w t)) x ; u = -dpsi/dy, v = dpsi/dx.
// Domaine [0,2] x [0,1] invariant (u = 0 en x = 0 et 2, v = 0 en y = 0 et 1).
function velGyre(x, y, t, c, o) {
  const s = sinD(c.omega * t), a = c.eps * s, b = 1 - 2 * c.eps * s, f = a * x * x + b * x, df = 2 * a * x + b;
  o[0] += -PI * c.A * sinD(PI * f) * cosD(PI * y);
  o[1] += PI * c.A * cosD(PI * f) * sinD(PI * y) * df;
}
function domaine() { return { div: 0, xmin: Infinity, xmax: -Infinity, ymin: Infinity, ymax: -Infinity }; }
function noterDomaine(a, vel, y, c) {
  const v = Math.abs(divergence(vel, y[0], y[1], y[2], c)); if (v > a.div || !(v === v)) a.div = v;
  if (y[0] < a.xmin) a.xmin = y[0]; if (y[0] > a.xmax) a.xmax = y[0]; if (y[1] < a.ymin) a.ymin = y[1]; if (y[1] > a.ymax) a.ymax = y[1];
}
/* z = t remis a l echelle (la vue 3-D devient une colonne lisible) ; le temps brut final est garde */
function echelleTemps(r, s) { const n = r.n, D = r.D, tFin = r.brut[(n - 1) * D + 2]; r.invariants.tempsFinal = { debut: 0, fin: tFin, derive: 0 }; for (let i = 0; i < n; i++) r.brut[i * D + 2] *= s; }
function doubleGyre() {
  const rk4 = traceur(velGyre);
  return {
    S: 3, phase: 2, D: 3,
    prep: (p) => ({ ...p, omega: DEUX_PI / p.periode }),
    init: (c) => Float64Array.from([c.x0, c.y0, 0]),
    grille: grilleFixe(0.01),
    avance: (y, c, h) => rk4(y, c, h),
    hors: (y) => (!(y[0] >= -0.01 && y[0] <= 2.01 && y[1] >= -0.01 && y[1] <= 1.01) ? 'sorti du domaine [0,2] x [0,1]' : null),
    sortie: (y, o, i) => { o[i] = y[0]; o[i + 1] = y[1]; o[i + 2] = y[2]; },
    invariants: () => ({}),
    suivi: domaine, noterSuivi: (a, y, c) => noterDomaine(a, velGyre, y, c),
    finir: (r, c, a) => {
      r.invariants.divergence = { max: a.div, theorie: 0, pas: DELTA };
      r.invariants.domaine = { xmin: a.xmin, xmax: a.xmax, ymin: a.ymin, ymax: a.ymax, dedans: a.xmin >= 0 && a.xmax <= 2 && a.ymin >= 0 && a.ymax <= 1 };
      echelleTemps(r, 2 / c.duree);
    },
    uniteLyapunov: 'par unite de temps',
  };
}

// ---------- 3 : allee de von Karman (deux rangees infinies decalees de tourbillons ponctuels), traceur passif ----------
// Rangee haute : +G en (k a + U t, h/2) ; rangee basse : -G en ((k + 1/2) a + U t, -h/2).
// Une rangee : psi = -(G/4pi) ln(cosh(2pi dy/a) - cos(2pi dx/a)) (somme exacte des -(G/2pi) ln r).
// Vitesse propre de l allee (Lamb, Hydrodynamics art. 156) : U = (G / 2a) tanh(pi h / a). Stabilite (Karman) : sinh(pi h/a) = 1, h/a = 0.2805.
// Dans le repere qui suit l allee l ecoulement est STATIONNAIRE : psi' = psi - U y est conserve par le traceur (pas de chaos).
function rangee(x, y, x0, y0, G, a, o) {
  const k = DEUX_PI / a, X = k * (x - x0), Y = k * (y - y0), e = expD(Y), C = (e + 1 / e) / 2 - cosD(X);
  o[0] += -G / (2 * a) * ((e - 1 / e) / 2) / C;
  o[1] += G / (2 * a) * sinD(X) / C;
}
function velKarman(x, y, t, c, o) {
  const xs = c.U * t;
  rangee(x, y, xs, c.h / 2, c.gamma, c.a, o);
  rangee(x, y, xs + c.a / 2, -c.h / 2, -c.gamma, c.a, o);
}
function psiKarman(x, y, t, c) {
  const xs = c.U * t, k = DEUX_PI / c.a, f = (x0, y0) => { const e = expD(k * (y - y0)); return lnD((e + 1 / e) / 2 - cosD(k * (x - x0))); };
  return -c.gamma / (4 * PI) * (f(xs, c.h / 2) - f(xs + c.a / 2, -c.h / 2)) - c.U * y;
}
/* Biot-Savart DIRECT (somme finie +-K) de tous les tourbillons en (xp, yp), sans formule fermee ; saute le point lui-meme */
function vitesseDirecte(c, xp, yp, K) {
  let u = 0, v = 0;
  const ajoute = (xj, yj, Gj) => { const dx = xp - xj, dy = yp - yj, r2 = dx * dx + dy * dy; if (r2 < 1e-24) return; u += -Gj * dy / (DEUX_PI * r2); v += Gj * dx / (DEUX_PI * r2); };
  for (let k = -K; k <= K; k++) ajoute(k * c.a, c.h / 2, c.gamma);
  for (let k = -K - 1; k <= K; k++) ajoute((k + 0.5) * c.a, -c.h / 2, -c.gamma);
  return [u, v];
}
function distanceVortexKarman(x, y, t, c) {
  const xs = c.U * t, a = c.a, r = (x0, y0) => { let dx = x - x0; dx -= Math.round(dx / a) * a; const dy = y - y0; return Math.sqrt(dx * dx + dy * dy); };
  return Math.min(r(xs, c.h / 2), r(xs + a / 2, -c.h / 2));
}
const KDIRECT = 20000;
function karman() {
  const rk4 = traceur(velKarman);
  return {
    S: 3, phase: 2, D: 3,
    prep: (p) => { const a = 1, h = p.rapport * a; return { ...p, a, h, U: p.gamma / (2 * a) * tanhD(PI * h / a) }; },
    init: (c) => Float64Array.from([c.x0, c.y0, 0]),
    grille: grilleFixe(0.002),
    /* pres d un tourbillon : pas local <= 0.05 / (vitesse angulaire locale G / (2 pi r^2)) */
    pasMax: (y, c) => { const r = distanceVortexKarman(y[0], y[1], y[2], c); return Math.min(0.002, 0.05 * DEUX_PI * r * r / c.gamma); },
    avance: (y, c, h) => rk4(y, c, h),
    hors: (y, c) => (distanceVortexKarman(y[0], y[1], y[2], c) < 0.02 ? 'traceur trop pres d un tourbillon (singularite)' : !(Math.abs(y[0]) <= BORNE && Math.abs(y[1]) <= BORNE) ? 'echappe' : null),
    sortie: (y, o, i) => { o[i] = y[0]; o[i + 1] = y[1]; o[i + 2] = y[2]; },
    invariants: (y, c) => ({ psiRepereMobile: psiKarman(y[0], y[1], y[2], c) }),
    suivi: domaine, noterSuivi: (a, y, c) => noterDomaine(a, velKarman, y, c),
    finir: (r, c, a) => {
      r.invariants.divergence = { max: a.div, theorie: 0, pas: DELTA };
      const [ud, vd] = vitesseDirecte(c, 0, c.h / 2, KDIRECT);
      r.invariants.vitesseAllee = { lamb: c.U, sommeDirecte: ud, transverse: vd, ecart: Math.abs(ud - c.U) / Math.abs(c.U), termes: 2 * (2 * KDIRECT + 1), formule: 'U = (G / 2a) tanh(pi h / a)' };
      /* formule fermee de la vitesse (celle qui advecte le traceur) contre la somme directe, en 3 points hors tourbillons */
      let ecartMax = 0;
      for (const [xp, yp] of [[0.25, 0], [0.1, 0.4], [0.7, -0.3]]) {
        const o = [0, 0]; velKarman(xp, yp, 0, c, o); const [u, v] = vitesseDirecte(c, xp, yp, KDIRECT);
        const e = Math.hypot(o[0] - u, o[1] - v) / Math.hypot(u, v); if (e > ecartMax) ecartMax = e;
      }
      r.invariants.formuleFermee = { ecartMaxRelatif: ecartMax, points: 3 };
      const sh = sinhD(PI * c.h / c.a);
      r.invariants.stabilite = { rapport: c.h / c.a, sinhPiHsurA: sh, rapportKarman: lnD(1 + Math.sqrt(2)) / PI, stableLineaire: Math.abs(sh - 1) < 0.01 };
      echelleTemps(r, c.U);
    },
    uniteLyapunov: 'par unite de temps',
  };
}

// ---------- 4 : rouleaux de convection de Rayleigh-Benard, frontieres oscillantes (Solomon & Gollub 1988), traceur passif ----------
// psi = A sin(pi (x + B sin(w t))) sin(pi z), parois libres z = 0 et 1 ; u = dpsi/dz, w = -dpsi/dx. Rouleaux de largeur 1.
// B = 0 : rouleaux stationnaires, le traceur reste dans sa cellule (psi conserve). B > 0 : transport chaotique entre rouleaux.
function velRB(x, z, t, c, o) {
  const xi = x + c.B * sinD(c.omega * t);
  o[0] += c.A * PI * sinD(PI * xi) * cosD(PI * z);
  o[1] += -c.A * PI * cosD(PI * xi) * sinD(PI * z);
}
function rayleighBenard() {
  const rk4 = traceur(velRB);
  const cellule = (y, c) => Math.floor(y[0] + c.B * sinD(c.omega * y[2]));
  return {
    S: 3, phase: 2, D: 3,
    prep: (p) => ({ ...p }),
    init: (c) => Float64Array.from([c.x0, c.z0, 0]),
    grille: grilleFixe(0.01),
    avance: (y, c, h) => rk4(y, c, h),
    hors: (y) => (!(y[1] >= -0.01 && y[1] <= 1.01) ? 'sorti de la couche 0 <= z <= 1' : !(Math.abs(y[0]) <= BORNE) ? 'echappe' : null),
    sortie: (y, o, i) => { o[i] = y[0]; o[i + 1] = y[1]; o[i + 2] = y[2]; },
    invariants: (y, c) => ({ psiRepereOscillant: c.A * sinD(PI * (y[0] + c.B * sinD(c.omega * y[2]))) * sinD(PI * y[1]) }),
    /* transport : changements de cellule (frontieres x + B sin(w t) = entier), comptes a chaque micro-pas */
    observateur: (c) => {
      const o = { passages: 0, cellule: null, cellules: new Set() };
      o.avant = () => {};
      o.apres = (y) => { const k = cellule(y, c); if (o.cellule !== null && k !== o.cellule) o.passages++; o.cellule = k; o.cellules.add(k); };
      return o;
    },
    suivi: domaine, noterSuivi: (a, y, c) => noterDomaine(a, velRB, y, c),
    finir: (r, c, a, o) => {
      r.invariants.divergence = { max: a.div, theorie: 0, pas: DELTA };
      r.invariants.domaine = { zmin: a.ymin, zmax: a.ymax, dedans: a.ymin >= 0 && a.ymax <= 1 };
      r.invariants.transport = { passagesDeFrontiere: o.passages, cellulesVisitees: o.cellules.size, deplacementX: a.xmax - a.xmin };
      echelleTemps(r, 2 / c.duree);
    },
    uniteLyapunov: 'par unite de temps',
  };
}

// ---------- catalogue ----------
const INTERNES = { tourbillonsPonctuels: tourbillonsPonctuels(), doubleGyre: doubleGyre(), karman: karman(), rayleighBenard: rayleighBenard() };
const SCI = 'Fluid mechanics';
export const SYSTEMES = Object.freeze([
  { id: 'tourbillonsPonctuels', nom: 'Point vortices', science: SCI, D: 8,
    params: { nombre: 4, G1: 1, G2: 1, G3: 1, G4: 1, duree: 1000 },
    bornes: { nombre: [3, 4], G1: [0.25, 3], G2: [0.25, 3], G3: [0.25, 3], G4: [0.25, 3], duree: [100, 3000] },
    phrase: 'Kirchhoff point vortices in the plane: inviscid 2-D Euler flow with all vorticity in 3 or 4 points of positive circulation (D = 2 x number); 3 vortices are integrable, 4 are generically chaotic; no viscosity, no vortex cores.' },
  { id: 'doubleGyre', nom: 'Double gyre', science: SCI, D: 3,
    params: { A: 0.1, eps: 0.25, periode: 10, x0: 1.0, y0: 0.3, duree: 100 },
    bornes: { A: [0.02, 0.3], eps: [0, 0.5], periode: [2, 40], x0: [0.02, 1.98], y0: [0.02, 0.98], duree: [10, 400] },
    phrase: 'A passive tracer in the prescribed, time-periodic double-gyre velocity field of Shadden, Lekien and Marsden (2005): chaotic advection in a kinematic 2-D model, not a solution of the Navier-Stokes equations; shown as x, y and time.' },
  { id: 'karman', nom: 'Von Karman vortex street', science: SCI, D: 3,
    params: { gamma: 1, rapport: 0.2805, x0: 0, y0: 0.25, duree: 20 },
    bornes: { gamma: [0.2, 5], rapport: [0.1, 1], x0: [-0.5, 0.5], y0: [-0.8, 0.8], duree: [2, 25] },
    phrase: 'A passive tracer in an idealised von Karman street: two staggered infinite rows of inviscid point vortices drifting at Lamb\'s speed (Gamma / 2a) tanh(pi h / a); no cylinder, no viscosity, no vortex shedding is computed.' },
  { id: 'rayleighBenard', nom: 'Convection rolls', science: SCI, D: 3,
    params: { A: 0.3, B: 0.1, omega: 2, x0: 0.05, z0: 0.5, duree: 200 },
    bornes: { A: [0.05, 1], B: [0, 0.4], omega: [0.2, 10], x0: [0, 1], z0: [0.02, 0.98], duree: [20, 200] },
    phrase: 'A passive tracer in prescribed Rayleigh-Benard convection rolls (stream function A sin(pi x) sin(pi z), free-slip walls) whose boundaries oscillate sideways, after Solomon and Gollub (1988); a kinematic model, no heat equation is solved.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
const ENTIERS = { tourbillonsPonctuels: ['nombre'] };
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

const val = (x, c) => (typeof x === 'function' ? x(c) : x);
export function simuler(id, params = {}, { n = 1500 } = {}) {
  const P = borner(id, params);
  n = Math.max(2, Math.floor(n));
  const S = INTERNES[id], c = S.prep(P), y = S.init(c), D = val(S.D, c), F = val(S.phase, c), { h, pas, duree } = S.grille(c, n);
  /* ecart initial du temoin : direction fixe non uniforme, norme D0 */
  const e = Float64Array.from(y), ecart = new Float64Array(F), dep = new Float64Array(F);
  for (let j = 0; j < F; j++) dep[j] = 1 + 0.37 * ((j * 5) % 7);
  { let q = 0; for (let j = 0; j < F; j++) q += dep[j] * dep[j]; q = D0 / Math.sqrt(q); for (let j = 0; j < F; j++) { dep[j] *= q; e[j] += dep[j]; } }
  const brut = new Float64Array(n * D), inv = {}, obs = S.observateur ? S.observateur(c) : null, acc = S.suivi ? S.suivi() : null;
  const noter = (i) => {
    S.sortie(y, brut, i * D, c);
    if (acc) S.noterSuivi(acc, y, c);
    const v = S.invariants(y, c);
    for (const k of Object.keys(v)) {
      const x = v[k], I = inv[k] || (inv[k] = { debut: x, fin: x, ecart: 0, min: x, max: x });
      I.fin = x; if (x < I.min) I.min = x; if (x > I.max) I.max = x;
      const d = Math.abs(x - I.debut); if (d > I.ecart || !(d === d)) I.ecart = d;
    }
  };
  const echec = (i, raison) => ({ params: P, D, n, bornee: false, echappeA: i, raison, brut: null, lyapunov: NaN, uniteLyapunov: S.uniteLyapunov, points: null, invariants: null });
  if (obs) obs.apres(y);
  noter(0);
  let somme = 0, micro = 0;
  for (let i = 1; i < n; i++) {
    for (let st = 0; st < pas; st++) {
      let reste = h;
      while (reste > 0) {
        const pm = S.pasMax ? S.pasMax(y, c) : h, k = Math.ceil(reste / pm - 1e-9), hk = k <= 1 ? reste : reste / k;
        if (obs) obs.avant(y); S.avance(y, c, hk); S.avance(e, c, hk); if (obs) obs.apres(y);
        reste = k <= 1 ? 0 : reste - hk;
        if (++micro > MICRO_MAX) return echec(i, 'rencontre trop serree (pas local epuise)');
        const raison = S.hors(y, c);
        if (raison) return echec(i, raison);
      }
    }
    for (let j = 0; j < y.length; j++) if (!Number.isFinite(y[j])) return echec(i, 'NaN');
    for (let j = 0; j < F; j++) ecart[j] = e[j] - y[j];
    let d2 = 0; for (let j = 0; j < F; j++) d2 += ecart[j] * ecart[j];
    const d = Math.sqrt(d2);
    if (d > 0) { somme += lnD(d / D0); for (let j = 0; j < F; j++) e[j] = y[j] + ecart[j] * D0 / d; }
    else for (let j = 0; j < F; j++) e[j] = y[j] + dep[j];
    for (let j = F; j < y.length; j++) e[j] = y[j];
    noter(i);
  }
  const invariants = {};
  for (const k of Object.keys(inv)) { const I = inv[k]; invariants[k] = { debut: I.debut, fin: I.fin, derive: Math.abs(I.debut) > 1e-9 ? I.ecart / Math.abs(I.debut) : I.ecart, min: I.min, max: I.max }; }
  const r = { params: P, D, n, bornee: true, brut, lyapunov: somme / duree, uniteLyapunov: S.uniteLyapunov, points: null, invariants };
  if (S.finir) S.finir(r, c, acc, obs);
  return r;
}
