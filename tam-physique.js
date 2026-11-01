// tam-physique.js -- TAM, la vue PHYSIQUE : de vrais systemes physiques/mathematiques, simules honnetement.
//
// VUE SEULEMENT : rien ici ne se frappe (le contrat deploye n accepte que les familles 1..16 de tam-moteur.js).
// Sortie de simuler() = la forme de tam-moteur.js#generer : { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov, uniteLyapunov, points: null } + invariants { nom: { debut, fin, derive, min, max } } -> la vue 3-D (tam-vue.js
//   standardiser, couches, series) les dessine sans changement.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun Math.random (hydrogene : mulberry32 a graine). sin/cos/ln = ceux du moteur.
// Unites sans dimension : G = c = M = 1 (relativite), q/m = 1 (plasma), g = l = m = 1 (pendule), a0 = 1 (hydrogene).
// derive = ecart MAX (sur tous les points stockes) a la valeur de depart, relatif si |debut| > 1e-9, absolu sinon.
// Lyapunov : Benettin a deux trajectoires (ecart 1e-8, renormalise a chaque point stocke), mesure, jamais ecrit a la main ;
//   sur un temps fini un systeme integrable donne un petit nombre positif (cisaillement lineaire ~ ln(t)/t), pas 0 exact.
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = 3.141592653589793, DEUX_PI = 6.283185307179586, LN2 = 0.6931471805599453;
const D0 = 1e-8, BORNE = 1e3, MICRO_MAX = 4e6;

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
/* RK4 a tampons propres ; f(y, d, c) ecrit la derivee */
function fabriquerRK4(m, f) {
  const k1 = new Float64Array(m), k2 = new Float64Array(m), k3 = new Float64Array(m), k4 = new Float64Array(m), t = new Float64Array(m);
  return (y, c, h) => {
    f(y, k1, c); for (let i = 0; i < m; i++) t[i] = y[i] + 0.5 * h * k1[i];
    f(t, k2, c); for (let i = 0; i < m; i++) t[i] = y[i] + 0.5 * h * k2[i];
    f(t, k3, c); for (let i = 0; i < m; i++) t[i] = y[i] + h * k3[i];
    f(t, k4, c); for (let i = 0; i < m; i++) y[i] += h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  };
}
/* rotation de Boris : v (a l offset o) tourne autour de b = (bx, by, bz) (deja divise par gamma en relativite) ; |v| exact */
function tournerBoris(v, o, bx, by, bz, h) {
  const tx = bx * h / 2, ty = by * h / 2, tz = bz * h / 2, s = 2 / (1 + tx * tx + ty * ty + tz * tz);
  const a = v[o], b = v[o + 1], c = v[o + 2];
  const px = a + (b * tz - c * ty), py = b + (c * tx - a * tz), pz = c + (a * ty - b * tx);
  v[o] = a + (py * tz - pz * ty) * s; v[o + 1] = b + (pz * tx - px * tz) * s; v[o + 2] = c + (px * ty - py * tx) * s;
}

// ---------- 1 et 2 : orbite autour d une masse (forme de Binet, variable independante = phi) ----------
// u = 1/r. RG (Schwarzschild, plan equatorial, geodesique de genre temps) : u'' + u = M/L^2 + 3 M u^2.
// Newton : u'' + u = M/L^2 (ellipse fermee). Etat [u, w = u', phi, t] ; t = temps coordonne (RG) / temps (Newton).
const M = 1;
function orbite(rg) {
  const f = (y, d, c) => {
    const u = y[0], r = 1 / u;
    d[0] = y[1];
    d[1] = c.M / (c.L * c.L) - u + c.rg * 3 * c.M * u * u;
    d[2] = 1;
    d[3] = c.rg ? c.E * r * r / (c.L * (1 - 2 * c.M * u)) : r * r / c.L;
  };
  const rk4 = fabriquerRK4(4, f);
  return {
    S: 4, phase: 2, D: 3,
    prep: (p) => {
      const u0 = 1 / p.r0;
      return { ...p, M, rg: rg ? 1 : 0, E: Math.sqrt((1 - 2 * M * u0) * (1 + p.L * p.L * u0 * u0)) };
    },
    init: (c) => Float64Array.from([1 / c.r0, 0, 0, 0]),
    grille: (c, n) => { const tot = c.tours * DEUX_PI, pas = Math.ceil(tot / (n - 1) / 0.004); return { h: tot / ((n - 1) * pas), pas, duree: tot }; },
    avance: (y, c, h) => rk4(y, c, h),
    hors: (y, c) => (c.rg && y[0] >= 0.5 / c.M ? 'capture (horizon r = 2M franchi)' : y[0] <= 0 ? 'echappe (orbite non liee)' : null),
    /* la capture est une FIN dessinee (trajet jusqu a l horizon) ; l orbite non liee (u -> 0, r infini) reste un refus */
    evenement: (raison) => (raison.startsWith('capture') ? 'capture' : null),
    temps: (y) => y[3], /* fin.t = temps coordonne du dernier etat sain avant l horizon */
    sortie: (y, o, i) => { const r = 1 / y[0]; o[i] = r * cosD(y[2]); o[i + 1] = r * sinD(y[2]); o[i + 2] = y[3]; },
    invariants: (y, c) => {
      const u = y[0], w = y[1], L2 = c.L * c.L;
      return c.rg ? { E: Math.sqrt(L2 * w * w + (1 - 2 * c.M * u) * (1 + L2 * u * u)), L: c.L }
        : { energie: L2 * w * w / 2 + L2 * u * u / 2 - c.M * u, L: c.L };
    },
    /* periastres = maxima de u : w passe de + a - ; phi interpole lineairement */
    observateur: () => {
      const o = { peri: [], umin: Infinity, umax: -Infinity, wP: 0, phiP: 0 };
      o.avant = (y) => { o.wP = y[1]; o.phiP = y[2]; };
      o.apres = (y) => {
        if (y[0] > o.umax) o.umax = y[0]; if (y[0] < o.umin) o.umin = y[0];
        if (o.wP > 0 && y[1] <= 0) o.peri.push(o.phiP + (y[2] - o.phiP) * o.wP / (o.wP - y[1]));
      };
      return o;
    },
    finir: (r, c, o) => {
      const rmin = 1 / o.umax, rmax = 1 / o.umin, semiLatus = 2 * rmin * rmax / (rmin + rmax);
      const dp = []; for (let k = 1; k < o.peri.length; k++) dp.push(o.peri[k] - o.peri[k - 1] - DEUX_PI);
      const mesure = dp.length ? dp.reduce((a, b) => a + b, 0) / dp.length : NaN;
      const formule = c.rg ? 6 * PI * c.M / semiLatus : 0;
      r.invariants.precession = { mesure, formule, ecart: formule > 0 ? Math.abs(mesure - formule) / formule : Math.abs(mesure), orbites: dp.length,
        rmin, rmax, a: (rmin + rmax) / 2, e: (rmax - rmin) / (rmax + rmin), unite: 'radian par orbite' };
      /* z = t remis a l echelle du rayon (la vue 3-D devient une helice lisible) ; le temps brut final est garde */
      const n = r.n, tFin = r.brut[(n - 1) * 3 + 2], s = tFin > 0 ? 2 * rmax / tFin : 0;
      r.invariants.tempsFinal = { debut: 0, fin: tFin, derive: 0 };
      for (let i = 0; i < n; i++) r.brut[i * 3 + 2] *= s;
    },
    uniteLyapunov: 'par radian d orbite',
  };
}

// ---------- 3 : trois corps (Newton, masses egales, G = m = 1), Yoshida ordre 4 symplectique ----------
const CB = 1.2599210498948732, W1 = 1 / (2 - CB), W0 = -CB / (2 - CB);
const YC = [W1 / 2, (W0 + W1) / 2, (W0 + W1) / 2, W1 / 2], YD = [W1, W0, W1];
function acceleration(y, a) {
  a.fill(0);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    let r2 = 0; const dd = [0, 0, 0];
    for (let k = 0; k < 3; k++) { dd[k] = y[3 * j + k] - y[3 * i + k]; r2 += dd[k] * dd[k]; }
    const inv = 1 / (r2 * Math.sqrt(r2));
    for (let k = 0; k < 3; k++) { const dk = dd[k]; a[3 * i + k] += dk * inv; a[3 * j + k] -= dk * inv; }
  }
}
function distanceMin(y) {
  let m = Infinity;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    let r2 = 0; for (let k = 0; k < 3; k++) { const v = y[3 * j + k] - y[3 * i + k]; r2 += v * v; }
    if (r2 < m) m = r2;
  }
  return Math.sqrt(m);
}
const RS = 0.6; // en dessous de cette distance mutuelle, le pas se raffine
const T8 = 6.32591398; // periode du huit (Chenciner-Montgomery 2000, conditions de Simo)
function troisCorps() {
  const a = new Float64Array(9);
  return {
    S: 18, phase: 18, D: 9,
    prep: (p) => ({ ...p }),
    init: (c) => {
      const y = new Float64Array(18), d = c.perturbation;
      y.set([0.97000436 + d, -0.24308753, d, -0.97000436, 0.24308753, -d, 0, 0, 0], 0);
      y.set([0.466203685, 0.43236573, 0, 0.466203685, 0.43236573, 0, -0.93240737, -0.86473146, 0], 9);
      return y;
    },
    grille: (c, n) => { const pas = Math.ceil(c.duree / (n - 1) / 0.002); return { h: c.duree / ((n - 1) * pas), pas, duree: c.duree }; },
    /* rencontre serree : pas local ~ r^1.5 (temps de chute libre), meme decoupage pour la trajectoire temoin */
    pasMax: (y) => { const r = distanceMin(y); if (r >= RS) return 0.002; const x = r / RS; return 0.002 * x * Math.sqrt(x); },
    avance: (y, c, h) => {
      for (let s = 0; s < 4; s++) {
        for (let i = 0; i < 9; i++) y[i] += YC[s] * h * y[9 + i];
        if (s < 3) { acceleration(y, a); for (let i = 0; i < 9; i++) y[9 + i] += YD[s] * h * a[i]; }
      }
    },
    hors: (y) => { if (distanceMin(y) < 1e-5) return 'collision'; for (let i = 0; i < 9; i++) if (!(Math.abs(y[i]) <= BORNE)) return 'echappe'; return null; },
    sortie: (y, o, i) => { for (let k = 0; k < 9; k++) o[i + k] = y[k]; },
    /* Lyapunov : retire le deplacement et la vitesse du centre de masse (invariance galileenne : un ecart qui croit
       lineairement pour TOUTE orbite, et qui donnait le meme lambda quelle que soit la perturbation) */
    neutre: (dl) => { for (let o = 0; o < 18; o += 9) for (let k = 0; k < 3; k++) { const m = (dl[o + k] + dl[o + 3 + k] + dl[o + 6 + k]) / 3; dl[o + k] -= m; dl[o + 3 + k] -= m; dl[o + 6 + k] -= m; } },
    invariants: (y) => {
      let K = 0, U = 0; const P = [0, 0, 0], L = [0, 0, 0];
      for (let b = 0; b < 3; b++) {
        const x = y.subarray(3 * b, 3 * b + 3), v = y.subarray(9 + 3 * b, 12 + 3 * b);
        K += (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) / 2;
        for (let k = 0; k < 3; k++) P[k] += v[k];
        L[0] += x[1] * v[2] - x[2] * v[1]; L[1] += x[2] * v[0] - x[0] * v[2]; L[2] += x[0] * v[1] - x[1] * v[0];
      }
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        let r2 = 0; for (let k = 0; k < 3; k++) { const v = y[3 * j + k] - y[3 * i + k]; r2 += v * v; }
        U -= 1 / Math.sqrt(r2);
      }
      return { energie: K + U, quantiteDeMouvement: Math.sqrt(P[0] * P[0] + P[1] * P[1] + P[2] * P[2]), momentCinetique: Math.sqrt(L[0] * L[0] + L[1] * L[1] + L[2] * L[2]) };
    },
    uniteLyapunov: 'par unite de temps',
  };
}

// ---------- 4 : tokamak (une particule test, Boris non relativiste, champ analytique fixe) ----------
// R0 = 1. B = B0 R0/R [ e_phi + (r/(q R0)) e_theta ], r = distance a l axe magnetique : div B = 0 exactement ; q ~ facteur de securite.
function champTokamak(x, y, z, c, b) {
  const R = Math.sqrt(x * x + y * y), Bphi = c.B0 / R, BR = -c.B0 * z / (c.q * R), BZ = c.B0 * (R - 1) / (c.q * R);
  b[0] = BR * x / R - Bphi * y / R; b[1] = BR * y / R + Bphi * x / R; b[2] = BZ;
}
function tokamak() {
  const b = [0, 0, 0];
  return {
    S: 6, phase: 6, D: 3,
    prep: (p) => ({ ...p, r0: 0.2 }),
    init: (c) => {
      const y = new Float64Array(6); y[0] = 1 + c.r0;
      champTokamak(y[0], 0, 0, c, b);
      const nb = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]), bx = b[0] / nb, by = b[1] / nb, bz = b[2] / nb;
      let ex = -bz * bx, ey = -bz * by, ez = 1 - bz * bz; const ne = Math.sqrt(ex * ex + ey * ey + ez * ez); ex /= ne; ey /= ne; ez /= ne;
      const cp = 1 / Math.sqrt(1 + c.rapport * c.rapport), cl = c.rapport * cp; // |v| = 1, v_par / v_perp = rapport
      y[3] = cl * bx + cp * ex; y[4] = cl * by + cp * ey; y[5] = cl * bz + cp * ez;
      return y;
    },
    grille: (c, n) => { const pas = Math.ceil(c.duree / (n - 1) / (0.1 / c.B0)); return { h: c.duree / ((n - 1) * pas), pas, duree: c.duree }; },
    avance: (y, c, h) => {
      champTokamak(y[0], y[1], y[2], c, b);
      tournerBoris(y, 3, b[0], b[1], b[2], h);
      y[0] += h * y[3]; y[1] += h * y[4]; y[2] += h * y[5];
    },
    hors: (y) => { const R = Math.sqrt(y[0] * y[0] + y[1] * y[1]), r = Math.sqrt((R - 1) * (R - 1) + y[2] * y[2]); return r > 0.8 ? 'perdue (touche la paroi r = 0.8)' : null; },
    sortie: (y, o, i) => { o[i] = y[0]; o[i + 1] = y[1]; o[i + 2] = y[2]; },
    invariants: (y, c) => {
      champTokamak(y[0], y[1], y[2], c, b);
      const B = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]), v2 = y[3] * y[3] + y[4] * y[4] + y[5] * y[5];
      const vp = (y[3] * b[0] + y[4] * b[1] + y[5] * b[2]) / B;
      return { energieCinetique: v2 / 2, momentMagnetique: (v2 - vp * vp) / (2 * B) };
    },
    /* rebonds = changements de signe de v_parallele : > 0 -> orbite piegee (banane), 0 -> passante */
    observateur: (c) => {
      const o = { rebonds: 0, signe: 0, c };
      o.avant = () => {};
      o.apres = (y) => {
        champTokamak(y[0], y[1], y[2], c, b);
        const s = y[3] * b[0] + y[4] * b[1] + y[5] * b[2] > 0 ? 1 : -1;
        if (o.signe && s !== o.signe) o.rebonds++; o.signe = s;
      };
      return o;
    },
    finir: (r, c, o) => { r.invariants.vitesseParallele = { rebonds: o.rebonds, orbite: o.rebonds > 0 ? 'piegee (banane)' : 'passante' }; },
    uniteLyapunov: 'par unite de temps',
  };
}

// ---------- 5 : double pendule (m = l = g = 1), RK4 ----------
function doublePendule() {
  const f = (y, d) => {
    const t1 = y[0], t2 = y[1], w1 = y[2], w2 = y[3], D = t1 - t2, sD = sinD(D), cD = cosD(D), den = 3 - cosD(2 * D);
    d[0] = w1; d[1] = w2;
    d[2] = (-3 * sinD(t1) - sinD(t1 - 2 * t2) - 2 * sD * (w2 * w2 + w1 * w1 * cD)) / den;
    d[3] = (2 * sD * (2 * w1 * w1 + 2 * cosD(t1) + w2 * w2 * cD)) / den;
  };
  const rk4 = fabriquerRK4(4, f);
  return {
    S: 4, phase: 4, D: 4,
    prep: (p) => ({ ...p }),
    init: (c) => Float64Array.from([c.theta1, c.theta2, 0, 0]),
    grille: (c, n) => { const pas = Math.ceil(c.duree / (n - 1) / 0.004); return { h: c.duree / ((n - 1) * pas), pas, duree: c.duree }; },
    avance: (y, c, h) => rk4(y, c, h),
    hors: () => null,
    /* [x, y] du bout du 2e bras, puis omega2, omega1 (la vue 3-D = trajet du bout souleve par omega2 ; omega1 = dimension cachee) */
    sortie: (y, o, i) => { const x1 = sinD(y[0]), y1 = -cosD(y[0]); o[i] = x1 + sinD(y[1]); o[i + 1] = y1 - cosD(y[1]); o[i + 2] = y[3]; o[i + 3] = y[2]; },
    invariants: (y) => {
      const D = y[0] - y[1];
      return { energie: y[2] * y[2] + y[3] * y[3] / 2 + y[2] * y[3] * cosD(D) - 2 * cosD(y[0]) - cosD(y[1]) };
    },
    uniteLyapunov: 'par unite de temps',
  };
}

// ---------- 6 : relativite restreinte, charge dans E x B croises (Boris relativiste, c = q = m = 1) ----------
// E = (E0, 0, 0), B = (0, 0, 1). Invariants exacts du continu : gamma - E0 x (energie, E statique) ; Boris les suit a O(h^2).
function lorentzRelativiste() {
  return {
    S: 6, phase: 6, D: 3,
    prep: (p) => ({ ...p, E0: p.rapport, B0: 1 }),
    init: (c) => Float64Array.from([0, 0, 0, 0, c.u0, c.uz]),
    grille: (c, n) => { const pas = Math.ceil(c.duree / (n - 1) / 0.002); return { h: c.duree / ((n - 1) * pas), pas, duree: c.duree }; },
    avance: (y, c, h) => {
      y[3] += c.E0 * h / 2;
      const g = Math.sqrt(1 + y[3] * y[3] + y[4] * y[4] + y[5] * y[5]);
      tournerBoris(y, 3, 0, 0, c.B0 / g, h);
      y[3] += c.E0 * h / 2;
      const g2 = Math.sqrt(1 + y[3] * y[3] + y[4] * y[4] + y[5] * y[5]);
      y[0] += h * y[3] / g2; y[1] += h * y[4] / g2; y[2] += h * y[5] / g2;
    },
    hors: (y) => { for (let i = 0; i < 3; i++) if (!(Math.abs(y[i]) <= BORNE)) return 'echappe'; return null; },
    sortie: (y, o, i) => { o[i] = y[0]; o[i + 1] = y[1]; o[i + 2] = y[2]; },
    invariants: (y, c) => { const g = Math.sqrt(1 + y[3] * y[3] + y[4] * y[4] + y[5] * y[5]); return { energie: g - c.E0 * y[0], gamma: g }; },
    uniteLyapunov: 'par unite de temps',
  };
}

// ---------- 7 : hydrogene, NUAGE de probabilite |psi_nlm|^2 (pas une trajectoire) ----------
// |psi|^2 = |R_nl(r)|^2 |Y_lm(theta)|^2 se separe : r tire selon r^2 R^2, cos(theta) selon (P_l^|m|)^2, phi uniforme (|Y_lm|^2 ne depend pas de phi).
function laguerre(k, al, x) { if (k === 0) return 1; let a = 1, b = 1 + al - x; for (let j = 1; j < k; j++) { const c = ((2 * j + 1 + al - x) * b - (j + al) * a) / (j + 1); a = b; b = c; } return b; }
function legendre2(l, m, x) { /* (P_l^m(x))^2, m >= 0 */
  let pmm = 1; for (let i = 1; i <= m; i++) pmm *= (2 * i - 1);
  const w = 1 - x * x; let pw = 1; for (let i = 0; i < m; i++) pw *= w;
  if (l === m) return pmm * pmm * pw;
  let a = pmm, b = x * (2 * m + 1) * pmm;
  for (let ll = m + 2; ll <= l; ll++) { const c = (x * (2 * ll - 1) * b - (ll + m - 1) * a) / (ll - m); a = b; b = c; }
  return b * b * pw;
}
function hydrogene(c, n) {
  const N = c.n, l = c.l, m = Math.abs(c.m), alea = mulberry32(c.graine >>> 0), Rmax = N * (6 * N + 10);
  const radial = (r) => { const rho = 2 * r / N; let p = 1; for (let i = 0; i < l; i++) p *= rho; const R = p * expD(-rho / 2) * laguerre(N - l - 1, 2 * l + 1, rho); return r * r * R * R; };
  let pr = 0, pa = 0;
  for (let i = 0; i <= 4000; i++) { const v = radial(Rmax * i / 4000); if (v > pr) pr = v; }
  for (let i = 0; i <= 4000; i++) { const v = legendre2(l, m, -1 + 2 * i / 4000); if (v > pa) pa = v; }
  pr *= 1.02; pa *= 1.02;
  const brut = new Float64Array(n * 3); let somme = 0, depasse = 0, tirages = 0;
  for (let i = 0; i < n; i++) {
    let r, x;
    for (;;) { tirages++; r = Rmax * alea(); const v = radial(r); if (v > pr) depasse++; if (alea() * pr < v) break; }
    for (;;) { tirages++; x = -1 + 2 * alea(); const v = legendre2(l, m, x); if (v > pa) depasse++; if (alea() * pa < v) break; }
    const ph = DEUX_PI * alea(), s = Math.sqrt(1 - x * x);
    brut[3 * i] = r * s * cosD(ph); brut[3 * i + 1] = r * s * sinD(ph); brut[3 * i + 2] = r * x; somme += r;
  }
  const theorie = (3 * N * N - l * (l + 1)) / 2, mesure = somme / n;
  return { brut, invariants: {
    /* debut = valeur theorique <r> = (3n^2 - l(l+1))/2, fin = moyenne mesuree sur le nuage */
    rayonMoyen: { debut: theorie, fin: mesure, derive: Math.abs(mesure - theorie) / theorie },
    echantillonnage: { tirages, depassementsDuMax: depasse, rayonMax: Rmax },
  } };
}

// ---------- catalogue ----------
const INTERNES = {
  schwarzschild: orbite(true), kepler: orbite(false), troisCorps: troisCorps(), tokamak: tokamak(),
  doublePendule: doublePendule(), lorentzRelativiste: lorentzRelativiste(),
};
const ORB_P = { L: 4, r0: 20, tours: 6 }, ORB_B = { L: [3.6, 12], r0: [6, 400], tours: [2, 35] };
export const SYSTEMES = Object.freeze([
  { id: 'schwarzschild', nom: 'Orbit around a black hole', science: 'General relativity', D: 3, params: { ...ORB_P, tours: 12 }, bornes: ORB_B,
    phrase: 'A test particle on a timelike geodesic in the equatorial plane of a non-rotating (Schwarzschild) black hole, G = c = M = 1; the orbiting body has no mass of its own, no radiation, no spin.' },
  { id: 'kepler', nom: 'Newtonian orbit', science: 'Newtonian gravity', D: 3, params: ORB_P, bornes: ORB_B,
    phrase: 'The same start as the black-hole orbit under Newton\'s inverse-square gravity: a closed ellipse with no precession, a point mass around a fixed centre.' },
  { id: 'troisCorps', nom: 'Three-body problem', science: 'Newtonian gravity', D: 9, params: { perturbation: 0, duree: 20 }, bornes: { perturbation: [0, 0.5], duree: [2, 200] },
    phrase: 'Three equal point masses under Newtonian gravity (G = m = 1), no softening; perturbation 0 is the Chenciner-Montgomery figure-eight, a nudge breaks it.' },
  { id: 'tokamak', nom: 'Particle in a tokamak field', science: 'Fusion plasma physics', D: 3, params: { B0: 60, q: 2, rapport: 0.3, duree: 100 }, bornes: { B0: [10, 200], q: [1, 5], rapport: [0.05, 5], duree: [10, 600] },
    phrase: 'One charged test particle (non-relativistic Boris pusher) in a fixed analytic tokamak-like field (toroidal 1/R plus poloidal field of safety factor q); not a fusion reactor: no plasma, no collisions, no fusion reactions.' },
  { id: 'doublePendule', nom: 'Double pendulum', science: 'Classical mechanics', D: 4, params: { theta1: 2, theta2: 2, duree: 40 }, bornes: { theta1: [-PI, PI], theta2: [-PI, PI], duree: [5, 160] },
    phrase: 'An ideal frictionless double pendulum with equal unit masses and rods (g = 1), started at rest; shown as the path of the lower bob, lifted by its angular speed.' },
  { id: 'lorentzRelativiste', nom: 'Relativistic charge in crossed fields', science: 'Special relativity', D: 3, params: { rapport: 0.5, u0: 1, uz: 0.2, duree: 120 }, bornes: { rapport: [0, 0.95], u0: [0, 5], uz: [0, 1], duree: [20, 600] },
    phrase: 'One charged particle in uniform crossed electric and magnetic fields (E/B < 1, c = 1), relativistic Boris pusher; it drifts along E x B and gyrates, no radiation reaction.' },
  { id: 'hydrogene', nom: 'Hydrogen electron cloud', science: 'Quantum mechanics', D: 3, nuage: true, params: { n: 3, l: 2, m: 1, graine: 1 }, bornes: { n: [1, 4], l: [0, 3], m: [-3, 3], graine: [1, 1000000] },
    phrase: 'The probability cloud of the electron of hydrogen in the state (n, l, m), sampled from |psi|^2; not a path: the electron has no orbit in quantum mechanics.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
const ENTIERS = { hydrogene: ['n', 'l', 'm', 'graine'] };
const parId = (id) => { const s = SYSTEMES.find((x) => x.id === id); if (!s) throw new Error('systeme inconnu: ' + id); return s; };

/** params bornes : non fini -> defaut ; hors bornes -> ramene ; entiers arrondis ; hydrogene : l <= n-1, |m| <= l */
function borner(id, params) {
  const s = parId(id), P = {};
  for (const k of Object.keys(s.params)) {
    let v = Number(params && params[k]); if (!Number.isFinite(v)) v = s.params[k];
    const [a, b] = s.bornes[k]; v = Math.min(b, Math.max(a, v));
    if ((ENTIERS[id] || []).includes(k)) v = Math.round(v);
    P[k] = v;
  }
  if (id === 'hydrogene') { P.l = Math.min(P.l, P.n - 1); P.m = Math.max(-P.l, Math.min(P.l, P.m)); }
  return P;
}

export function reglagesPhysique(id, params = {}) {
  const s = parId(id), P = borner(id, params);
  return Object.keys(s.params).map((k) => ({ chemin: 'params.' + k, nom: k, min: s.bornes[k][0], max: s.bornes[k][1], valeur: P[k] }));
}

export function simuler(id, params = {}, { n = 1500 } = {}) {
  const s = parId(id), P = borner(id, params);
  n = Math.max(2, Math.floor(n));
  if (id === 'hydrogene') {
    const h = hydrogene(P, n);
    return { params: P, D: 3, n, bornee: true, nuage: true, brut: h.brut, lyapunov: null, uniteLyapunov: 'sans objet (nuage de probabilite, pas une trajectoire)', points: null, invariants: h.invariants };
  }
  const S = INTERNES[id], c = S.prep(P), D = S.D, g0 = S.grille(c, n);
  const echec = (i, raison) => ({ params: P, D, n, bornee: false, echappeA: i, raison, brut: null, lyapunov: NaN, uniteLyapunov: S.uniteLyapunov, points: null, invariants: null });
  let k = integrer(S, c, n, g0);
  /* FIN PHYSIQUE (capture a l horizon) : le trajet est rejoue jusqu au dernier etat sain avant l evenement, sur n lignes
     uniformes dans la variable d integration (phi pour les orbites) ; la derniere ligne (n-1) EST l evenement.
     Le pas de reference reste celui de la grille d origine ; si le rejeu croise plus tot (pas different), on recule encore. */
  let evenement = null, raisonFin = null;
  for (let essai = 0; essai < 6 && k.evenement; essai++) {
    evenement = k.evenement; raisonFin = k.raison;
    const T = k.tAvant;
    if (!(T > 0)) return echec(k.i, k.raison);
    const pas = Math.max(1, Math.ceil(T / (n - 1) / g0.h - 1e-9));
    k = integrer(S, c, n, { h: T / ((n - 1) * pas), pas, duree: T });
  }
  if (k.evenement || k.echec) return echec(k.i, k.raison);
  const r = { params: P, D, n, bornee: true, brut: k.brut, lyapunov: k.somme / k.duree, uniteLyapunov: S.uniteLyapunov, points: null, invariants: k.invariants };
  if (evenement) { r.raison = raisonFin; r.fin = { evenement, indice: n - 1, t: S.temps ? S.temps(k.y) : k.duree }; }
  if (S.finir) S.finir(r, c, k.obs);
  return r;
}

/* une integration complete sur la grille g ; rend { brut, ... } ou { echec } ou { evenement, tAvant } */
function integrer(S, c, n, g) {
  const { h, pas, duree } = g, y = S.init(c), D = S.D, F = S.phase;
  /* ecart initial du temoin : direction fixe non uniforme, privee des modes neutres (S.neutre), norme D0 */
  const e = Float64Array.from(y), ecart = new Float64Array(F), dep = new Float64Array(F);
  for (let j = 0; j < F; j++) dep[j] = 1 + 0.37 * ((j * 5) % 7);
  if (S.neutre) S.neutre(dep);
  { let q = 0; for (let j = 0; j < F; j++) q += dep[j] * dep[j]; q = D0 / Math.sqrt(q); for (let j = 0; j < F; j++) { dep[j] *= q; e[j] += dep[j]; } }
  const brut = new Float64Array(n * D), inv = {}, obs = S.observateur ? S.observateur(c) : null;
  const noter = (i) => {
    S.sortie(y, brut, i * D);
    const v = S.invariants(y, c);
    for (const k of Object.keys(v)) {
      const x = v[k], I = inv[k] || (inv[k] = { debut: x, fin: x, ecart: 0, min: x, max: x });
      I.fin = x; if (x < I.min) I.min = x; if (x > I.max) I.max = x;
      const d = Math.abs(x - I.debut); if (d > I.ecart || !(d === d)) I.ecart = d;
    }
  };
  const echec = (i, raison) => ({ echec: true, i, raison });
  noter(0);
  let somme = 0, micro = 0, tc = 0;
  for (let i = 1; i < n; i++) {
    for (let st = 0; st < pas; st++) {
      /* pas local : pasMax(y) est relu a CHAQUE micro-pas (rencontre serree) ; le temoin suit le meme decoupage */
      let reste = h;
      while (reste > 0) {
        const pm = S.pasMax ? S.pasMax(y, c) : h, k = Math.ceil(reste / pm - 1e-9), hk = k <= 1 ? reste : reste / k;
        if (obs) obs.avant(y); S.avance(y, c, hk); S.avance(e, c, hk); if (obs) obs.apres(y);
        reste = k <= 1 ? 0 : reste - hk;
        if (++micro > MICRO_MAX) return echec(i, 'rencontre trop serree (pas local epuise)');
        const raison = S.hors(y, c);
        if (raison) {
          const ev = S.evenement ? S.evenement(raison) : null;
          return ev ? { evenement: ev, tAvant: tc, i, raison } : echec(i, raison);
        }
        tc += hk;
      }
    }
    for (let j = 0; j < y.length; j++) if (!Number.isFinite(y[j])) return echec(i, 'NaN');
    for (let j = 0; j < F; j++) ecart[j] = e[j] - y[j];
    if (S.neutre) S.neutre(ecart);
    let d2 = 0; for (let j = 0; j < F; j++) d2 += ecart[j] * ecart[j];
    const d = Math.sqrt(d2);
    if (d > 0) { somme += lnD(d / D0); for (let j = 0; j < F; j++) e[j] = y[j] + ecart[j] * D0 / d; }
    else for (let j = 0; j < F; j++) e[j] = y[j] + dep[j];
    for (let j = F; j < y.length; j++) e[j] = y[j];
    noter(i);
  }
  const invariants = {};
  for (const k of Object.keys(inv)) { const I = inv[k]; invariants[k] = { debut: I.debut, fin: I.fin, derive: Math.abs(I.debut) > 1e-9 ? I.ecart / Math.abs(I.debut) : I.ecart, min: I.min, max: I.max }; }
  return { brut, somme, duree, invariants, obs, y };
}

export const T_HUIT = T8;
