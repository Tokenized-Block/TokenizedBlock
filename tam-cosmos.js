// tam-cosmos.js -- TAM, la vue COSMOS : un catalogue de cas celebres et VERIFIABLES (trous noirs, etoiles, orbites, cosmologie).
//
// VUE SEULEMENT : rien ici ne se frappe. API et sortie identiques a tam-physique.js : SYSTEMES, simuler(id, params, { n }),
//   reglagesPhysique(id, params) ; simuler -> { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne), lyapunov,
//   uniteLyapunov, points: null, invariants, nuage? }.
// Chaque systeme porte au moins une verification chiffree contre une valeur connue (banc test-tam-cosmos-20261101.mjs).
// Pur et deterministe : aucun DOM, reseau, horloge, Math.random ; aucune fonction transcendante native (sin/cos/ln du moteur,
//   exp/atan/asinh/puissances ecrits ici avec + - * / et Math.sqrt).
// Pas de doublon avec tam-astro.js (systeme solaire, S2, spirale d ondes gravitationnelles, amas, Sedov-Taylor, collision).
// Invariants : { debut, fin, derive, min, max } (derive = ecart MAX a la valeur de depart, relatif si |debut| > 1e-9)
//   ou { mesure, formule, ... } (mesure = calcule par la simulation, formule = valeur theorique ou publiee).
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = 3.141592653589793, DEUX_PI = 6.283185307179586, PI_2 = 1.5707963267948966, LN2 = 0.6931471805599453;
const RAD = PI / 180, D0 = 1e-8, ANGLE_OR = 2.399963229728653;
const T_SOLEIL = 4.925490947641267e-6;           // G Msol / c^3 en secondes (valeur nominale IAU 2015)
const K_GAUSS = 0.01720209895;                   // constante de Gauss (rad/jour) : G Msol = k^2 UA^3 / jour^2
const G_KPC = 4.30091e-6;                        // G en kpc (km/s)^2 / Msol
const KMS_KPC_EN_RAD_MA = 1.0227121650537077e-3; // 1 km/s/kpc en radian par million d annees
const HUBBLE_GA = 977.792221;                    // 1 / (1 km/s/Mpc) en milliards d annees

// ---------- arithmetique deterministe ----------
function expD(x) { /* e^x avec + - * / seulement (meme fonction que tam-physique.js) */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
function atanD(x) { /* meme fonction que tam-formule.js */
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
const puissance = (x, p) => (x === 0 ? 0 : expD(p * lnD(x)));   // x > 0
function racineCubique(x) { /* exp(ln x / 3) puis deux pas de Newton */
  if (x === 0) return 0;
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  let y = expD(lnD(x) / 3);
  for (let i = 0; i < 2; i++) y -= (y * y * y - x) / (3 * y * y);
  return s * y;
}
const asinhD = (x) => (x < 0 ? -1 : 1) * lnD(Math.abs(x) + Math.sqrt(1 + x * x));
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* RK4 a tampons propres ; f(y, d, c) ecrit la derivee (meme forme que tam-physique.js) */
function fabriquerRK4(m, f) {
  const k1 = new Float64Array(m), k2 = new Float64Array(m), k3 = new Float64Array(m), k4 = new Float64Array(m), t = new Float64Array(m);
  return (y, c, h) => {
    f(y, k1, c); for (let i = 0; i < m; i++) t[i] = y[i] + 0.5 * h * k1[i];
    f(t, k2, c); for (let i = 0; i < m; i++) t[i] = y[i] + 0.5 * h * k2[i];
    f(t, k3, c); for (let i = 0; i < m; i++) t[i] = y[i] + h * k3[i];
    f(t, k4, c); for (let i = 0; i < m; i++) y[i] += h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  };
}
/* suivi d invariants point par point : { debut, fin, derive, min, max } */
function suivi() {
  const I = {};
  return {
    noter(v) {
      for (const k of Object.keys(v)) {
        const x = v[k], e = I[k] || (I[k] = { debut: x, fin: x, ecart: 0, min: x, max: x });
        e.fin = x; if (x < e.min) e.min = x; if (x > e.max) e.max = x;
        const d = Math.abs(x - e.debut); if (d > e.ecart || !(d === d)) e.ecart = d;
      }
    },
    sortir(out = {}) {
      for (const k of Object.keys(I)) { const e = I[k]; out[k] = { debut: e.debut, fin: e.fin, derive: Math.abs(e.debut) > 1e-9 ? e.ecart / Math.abs(e.debut) : e.ecart, min: e.min, max: e.max }; }
      return out;
    },
  };
}
/* minimum d une fonction unimodale sur [a, b] (section doree) */
function minDore(f, a, b, tol = 1e-12) {
  const g = 0.6180339887498949; let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < 300 && b - a > tol * (1 + Math.abs(a) + Math.abs(b)); i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}
function bissection(f, a, b, iter = 200) {
  let fa = f(a);
  for (let i = 0; i < iter; i++) { const m = (a + b) / 2, fm = f(m); if (m === a || m === b) break; if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m; }
  return (a + b) / 2;
}
/* anomalie excentrique : E - e sin E = M (Newton) */
function kepler(M, e) {
  let E = M + e * sinD(M);
  for (let i = 0; i < 50; i++) { const d = (E - e * sinD(E) - M) / (1 - e * cosD(E)); E -= d; if (Math.abs(d) < 1e-15) break; }
  return E;
}

// ======================================================================================================
// 1. lumiereTrouNoir : geodesiques nulles autour d un trou noir de Schwarzschild (G = c = M = 1)
//    Binet : u'' + u = 3 M u^2, u = 1/r, variable = phi. Depart a l infini (u = 0, u' = 1/b).
//    Sphere de photons r = 3M, parametre critique b_c = 3 sqrt(3) M. Premiere integrale : u'^2 + u^2 - 2 M u^3 = 1/b^2.
// ======================================================================================================
const M_TN = 1, R_VUE = 30;
const pasPhoton = fabriquerRK4(2, (y, d) => { d[0] = y[1]; d[1] = 3 * M_TN * y[0] * y[0] - y[0]; });
/* un photon depuis l infini : issue (capture / echappe / piege), phi final, u max, etat d entree dans la vue r = R_VUE */
function photon(b, h, phiMax) {
  const y = new Float64Array([0, 1 / b]), uv = 1 / R_VUE; let phi = 0, umax = 0, entree = null, sortieVue = NaN;
  for (;;) {
    const up = y[0], pp = phi;
    pasPhoton(y, null, h); phi += h;
    if (y[0] > umax) umax = y[0];
    if (!entree && y[0] >= uv) entree = { u: y[0], w: y[1], phi };
    if (entree && y[1] < 0 && up >= uv && y[0] < uv) sortieVue = pp + h * (up - uv) / (up - y[0]);
    if (y[0] >= 0.5 / M_TN) return { issue: 'capture', phiFin: phi, umax, entree, sortieVue: phi };
    if (y[1] < 0 && y[0] <= 0) return { issue: 'echappe', phiFin: pp + h * up / (up - y[0]), umax, entree, sortieVue };
    if (phi > phiMax) return { issue: 'piege', phiFin: phi, umax, entree, sortieVue: phi };
  }
}
function simLumiere(P, n) {
  const D = 12, brut = new Float64Array(n * D), inv = {}, S = suivi();
  const bs = [P.b1, P.b2, P.b3, P.b4], fins = [];
  for (let k = 0; k < 4; k++) {
    const b = bs[k], ev = photon(b, 0.002, 300);
    const y = new Float64Array([ev.entree.u, ev.entree.w]); let phi = ev.entree.phi;
    const fin = ev.sortieVue === ev.sortieVue ? ev.sortieVue : ev.phiFin, etendue = Math.max(fin - phi, 1e-9);
    const sous = Math.max(1, Math.ceil(etendue / (n - 1) / 0.002)), h = etendue / ((n - 1) * sous);
    const noter = (i) => {
      const u = y[0], r = 1 / u, o = i * D + 3 * k;
      brut[o] = r * cosD(phi); brut[o + 1] = r * sinD(phi); brut[o + 2] = phi;
      S.noter({ ['integraleRayon' + (k + 1)]: b * b * (y[1] * y[1] + u * u - 2 * M_TN * u * u * u) });
    };
    noter(0);
    for (let i = 1; i < n; i++) {
      for (let s = 0; s < sous; s++) { if (y[0] < 0.5 / M_TN && y[0] > 1e-3) pasPhoton(y, null, h); phi += h; }
      noter(i);
    }
    inv['rayon' + (k + 1)] = { b, issue: ev.issue, rMin: 1 / ev.umax, tours: ev.phiFin / DEUX_PI,
      deviation: ev.issue === 'echappe' ? ev.phiFin - PI : null, deviationFaibleChamp: 4 * M_TN / b, unite: 'radian' };
    /* fin du trace de CE rayon (colonnes 3k..3k+2) : capture = derniere ligne a l horizon ; escape = derniere ligne sur le
       bord de la vue r = 30M en sortant ; piege (tourne encore a phi = 300) = pas de fin */
    fins.push(ev.issue === 'capture' ? { rayon: k + 1, evenement: 'capture', indice: n - 1, t: fin, unite: 'phi balaye (radian)' }
      : ev.issue === 'echappe' ? { rayon: k + 1, evenement: 'escape', indice: n - 1, t: fin, unite: 'phi balaye (radian)' }
        : { rayon: k + 1, evenement: null, indice: null, t: null });
  }
  /* b critique MESURE : bissection sur l issue (capture / echappe) */
  const echappe = (b) => photon(b, 0.004, 300).issue === 'echappe';
  let lo = 4, hi = 7;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (echappe(m)) hi = m; else lo = m; }
  const bc = (lo + hi) / 2, rasant = photon(bc * (1 + 1e-6), 0.002, 300);
  inv.bCritique = { mesure: bc, formule: 3 * Math.sqrt(3) * M_TN, unite: 'M' };
  inv.spherePhotons = { mesure: 1 / rasant.umax, formule: 3 * M_TN, tours: rasant.phiFin / DEUX_PI, unite: 'M (r minimal d un rayon a b = 1.000001 b_c)' };
  /* champ faible (rayons hors de la vue) : deviation mesuree vs 4M/b (Einstein 1915) */
  inv.champFaible = [200, 1000].map((b) => { const ev = photon(b, 0.002, 300), d = ev.phiFin - PI; return { b, mesure: d, formule: 4 * M_TN / b, ecart: Math.abs(d - 4 * M_TN / b) / (4 * M_TN / b) }; });
  S.sortir(inv);
  return { D, brut, invariants: inv, lyapunov: null, uniteLyapunov: 'sans objet (rayons integrables)', fin: fins };
}

// ======================================================================================================
// 2. kerr : particule test autour d un trou noir en ROTATION (Kerr, Boyer-Lindquist, G = c = M = 1)
//    Hamiltonien H = (1/2) g^{mu nu} p_mu p_nu = -1/2 (temps propre), forme separee de Carter :
//    2 Sigma H = -P^2/Delta + Delta p_r^2 + (L/sin - a E sin)^2 + p_theta^2, P = (r^2 + a^2) E - a L.
//    E et L_z exacts par construction ; H et la constante de Carter Q sont suivis.
// ======================================================================================================
function kerrDerivees(y, d, c) {
  const a = c.a, E = c.E, Lz = c.Lz;
  const r = y[1], th = y[2], pr = y[4], pth = y[5];
  const s = sinD(th), co = cosD(th), s2 = s * s, a2 = a * a, r2 = r * r;
  const Sig = r2 + a2 * co * co, Del = r2 - 2 * r + a2, ra = r2 + a2, Pp = ra * E - a * Lz, T = Lz / s - a * E * s;
  const F = -Pp * Pp / Del + Del * pr * pr, G = T * T + pth * pth;
  d[0] = (ra * Pp / Del + a * (Lz - a * E * s2)) / Sig;
  d[1] = Del * pr / Sig;
  d[2] = pth / Sig;
  d[3] = (a * Pp / Del + Lz / s2 - a * E) / Sig;
  const dDel = 2 * r - 2, Fp = -4 * r * E * Pp / Del + Pp * Pp * dDel / (Del * Del) + dDel * pr * pr, Gp = 2 * T * (-Lz * co / s2 - a * E * co);
  d[4] = -Fp / (2 * Sig) + (F + G) * r / (Sig * Sig);
  d[5] = -Gp / (2 * Sig) - (F + G) * a2 * co * s / (Sig * Sig);
}
const pasKerr = fabriquerRK4(6, kerrDerivees);
function kerrH(y, c) {
  const a = c.a, r = y[1], s = sinD(y[2]), co = cosD(y[2]), Sig = r * r + a * a * co * co, Del = r * r - 2 * r + a * a;
  const Pp = (r * r + a * a) * c.E - a * c.Lz, T = c.Lz / s - a * c.E * s;
  return (-Pp * Pp / Del + Del * y[4] * y[4] + T * T + y[5] * y[5]) / (2 * Sig);
}
/* orbite circulaire equatoriale (Bardeen-Press-Teukolsky 1972) ; sens = +1 prograde, -1 retrograde ; null si aucune */
function circulaireKerr(r, a, sens) {
  const q = Math.sqrt(r), r32 = r * q, den2 = r32 - 3 * q + 2 * sens * a;
  if (!(den2 > 0)) return null;
  const den = Math.sqrt(r32) * Math.sqrt(den2);
  return { E: (r32 - 2 * q + sens * a) / den, L: sens * (r * r - 2 * sens * a * q + a * a) / den };
}
function iscoBardeen(a, sens) {
  const Z1 = 1 + racineCubique(1 - a * a) * (racineCubique(1 + a) + racineCubique(1 - a)), Z2 = Math.sqrt(3 * a * a + Z1 * Z1);
  return 3 + Z2 - sens * Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2));
}
/* ISCO MESURE : minimum de l energie des orbites circulaires E(r) (balayage puis section doree) */
function iscoMesure(a, sens) {
  const E = (r) => { const o = circulaireKerr(r, a, sens); return o && o.E > 0 ? o.E : Infinity; };
  let best = Infinity, rb = NaN;
  for (let r = 1.01; r <= 30; r += 0.01) { const v = E(r); if (v < best) { best = v; rb = r; } }
  return minDore(E, rb - 0.02, rb + 0.02);
}
function simKerr(P, n) {
  const a = P.a, i = P.inclinaison * RAD, sens = P.inclinaison <= 90 ? 1 : -1, r0 = P.r0, rp = 1 + Math.sqrt(1 - a * a);
  const circ = circulaireKerr(r0, a, sens);
  const inv = { isco: { mesure: iscoMesure(a, sens), formule: iscoBardeen(a, sens), sens: sens > 0 ? 'prograde' : 'retrograde', unite: 'M' } };
  if (!circ || r0 <= rp * 1.05) return { bornee: false, raison: 'pas d orbite circulaire a ce rayon (sous l orbite des photons)', invariants: inv, uniteLyapunov: 'sans objet' };
  const L = Math.abs(circ.L), Lz = L * cosD(i), pth = -L * sinD(i), pr = -P.poussee;
  /* E resout H = -1/2 en theta = pi/2 : A E^2 + B E + C = 0 */
  const r2 = r0 * r0, a2 = a * a, Del = r2 - 2 * r0 + a2, ra = r2 + a2;
  const A = -ra * ra / Del + a2, B = 2 * a * ra * Lz / Del - 2 * a * Lz, C = -a2 * Lz * Lz / Del + Lz * Lz + Del * pr * pr + pth * pth + r2;
  const dis = Math.sqrt(B * B - 4 * A * C), E = Math.max((-B + dis) / (2 * A), (-B - dis) / (2 * A));
  const c = { a, E, Lz };
  const periode = DEUX_PI * r0 * Math.sqrt(r0), etapes = Math.ceil(P.tours * 2000), sous0 = Math.max(1, Math.ceil(etapes / (n - 1)));
  const h0 = P.tours * periode / ((n - 1) * sous0), D = 3;
  /* une integration de duree propre totale `total` (pas <= h0) ; rend le trajet, ou l evenement (capture / escape) et le
     temps propre du dernier etat sain avant lui */
  const courir = (total) => {
    const sous = Math.max(1, Math.ceil(total / (n - 1) / h0 - 1e-9)), h = total / ((n - 1) * sous);
    const y = new Float64Array([0, r0, PI_2, 0, pr, pth]), brut = new Float64Array(n * D), S = suivi(), noeuds = [];
    const carter = () => { const s = sinD(y[2]), co = cosD(y[2]); return y[5] * y[5] + co * co * (a2 * (1 - E * E) + Lz * Lz / (s * s)); };
    const noter = (k) => {
      const R = Math.sqrt(y[1] * y[1] + a2), s = sinD(y[2]), o = k * D;
      brut[o] = R * s * cosD(y[3]); brut[o + 1] = R * s * sinD(y[3]); brut[o + 2] = y[1] * cosD(y[2]);
      S.noter({ hamiltonien: kerrH(y, c), carter: carter() });
    };
    noter(0);
    let tc = 0;
    for (let k = 1; k < n; k++) {
      for (let st = 0; st < sous; st++) {
        const cp = cosD(y[2]), fp = y[3];
        pasKerr(y, c, h);
        const cn = cosD(y[2]);
        if (cp < 0 && cn >= 0) noeuds.push(fp + (y[3] - fp) * (-cp) / (cn - cp));
        if (!(y[1] > rp * 1.01 + 0.01)) return { evenement: 'capture', tAvant: tc, k, raison: 'capture (horizon r+ = ' + rp.toFixed(4) + ' M franchi)' };
        if (y[1] > 1e3) return { evenement: 'escape', tAvant: tc, k, raison: 'echappe (r > 1000 M)' };
        tc += h;
      }
      noter(k);
    }
    return { brut, S, noeuds, y, total };
  };
  /* FIN PHYSIQUE : le trajet est rejoue jusqu au dernier etat sain, n lignes uniformes en temps propre, ligne n-1 = l evenement */
  let run = courir(P.tours * periode), fin = null, raisonFin = null;
  for (let essai = 0; essai < 6 && run.evenement; essai++) {
    fin = run.evenement; raisonFin = run.raison;
    if (!(run.tAvant > 0)) return { bornee: false, echappeA: run.k, raison: run.raison, invariants: inv, uniteLyapunov: 'sans objet' };
    run = courir(run.tAvant);
  }
  if (run.evenement) return { bornee: false, echappeA: run.k, raison: run.raison, invariants: inv, uniteLyapunov: 'sans objet' };
  const { brut, S, noeuds, y } = run;
  const dn = []; for (let k = 1; k < noeuds.length; k++) dn.push(noeuds[k] - noeuds[k - 1] - DEUX_PI * sens);
  const m15 = 1 / (r0 * Math.sqrt(r0));
  inv.noeuds = { mesure: dn.length ? dn.reduce((p, q) => p + q, 0) / dn.length : NaN,
    formule: sens > 0 ? DEUX_PI * (1 / Math.sqrt(1 - 4 * a * m15 + 3 * a2 / r2) - 1) : DEUX_PI * (1 - 1 / Math.sqrt(1 + 4 * a * m15 + 3 * a2 / r2)),
    faibleChamp: 4 * PI * a * m15, passages: noeuds.length, unite: 'radian par oscillation verticale (> 0 = dans le sens de la rotation du trou)' };
  inv.energie = { E, Lz, rHorizon: rp };
  S.sortir(inv);
  const out = { D, brut, invariants: inv, lyapunov: null, uniteLyapunov: 'sans objet (geodesiques de Kerr integrables)' };
  /* fin.t = temps COORDONNE t du dernier etat sain ; fin.tempsPropre = la duree propre dessinee ; fin.r = son rayon */
  if (fin) { out.raison = raisonFin; out.fin = { evenement: fin, indice: n - 1, t: y[0], tempsPropre: run.total, r: y[1] }; }
  return out;
}

// ======================================================================================================
// 3. trouDeVer : trou de ver d Ellis (Morris-Thorne, sans masse) : ds^2 = -dt^2 + dl^2 + (l^2 + b0^2) dOmega^2
//    Rayons lumineux equatoriaux, parametre d impact b : l'' = b^2 l / (l^2 + b0^2)^2, phi' = b / (l^2 + b0^2).
//    Premiere integrale l'^2 + b^2/(l^2 + b0^2) = 1 ; traverse si b < b0 ; sinon rebrousse en |l| = sqrt(b^2 - b0^2).
//    Plongement : r = sqrt(l^2 + b0^2), z = b0 asinh(l / b0).
// ======================================================================================================
const pasVer = fabriquerRK4(3, (y, d, c) => { const q = y[0] * y[0] + c.b0 * c.b0; d[0] = y[1]; d[1] = c.b * c.b * y[0] / (q * q); d[2] = c.b / q; });
function rayonVer(b, b0, l0, n, brut, D, col, S, nom) {
  const c = { b, b0 }, v0 = Math.sqrt(1 - b * b / (l0 * l0 + b0 * b0));
  /* passe 1 : duree jusqu a |l| >= l0 */
  const y = new Float64Array([-l0, v0, 0]); let t = 0, lmin = Infinity, traverse = false; const h0 = 0.005;
  while (t < 200 * l0) {
    pasVer(y, c, h0); t += h0; if (Math.abs(y[0]) < lmin) lmin = Math.abs(y[0]); if (y[0] > 0) traverse = true;
    if (y[0] >= l0 || (y[0] <= -l0 && y[1] < 0)) break;
  }
  const duree = t, sous = Math.max(1, Math.ceil(duree / (n - 1) / h0)), h = duree / ((n - 1) * sous);
  y[0] = -l0; y[1] = v0; y[2] = 0;
  const noter = (i) => {
    const l = y[0], r = Math.sqrt(l * l + b0 * b0), o = i * D + col;
    brut[o] = r * cosD(y[2]); brut[o + 1] = r * sinD(y[2]); brut[o + 2] = b0 * asinhD(l / b0);
    S.noter({ [nom]: y[1] * y[1] + b * b / (l * l + b0 * b0) });
  };
  noter(0);
  for (let i = 1; i < n; i++) { for (let s = 0; s < sous; s++) pasVer(y, c, h); noter(i); }
  return { b, issue: traverse ? 'traverse la gorge' : 'rebrousse', lMin: lmin, lMinFormule: b > b0 ? Math.sqrt(b * b - b0 * b0) : 0, deviationTotale: y[2] };
}
function simTrouDeVer(P, n) {
  const D = 6, brut = new Float64Array(n * D), S = suivi(), inv = {};
  inv.rayon1 = rayonVer(P.b1, P.b0, P.l0, n, brut, D, 0, S, 'integraleRayon1');
  inv.rayon2 = rayonVer(P.b2, P.b0, P.l0, n, brut, D, 3, S, 'integraleRayon2');
  inv.gorge = { b0: P.b0, critere: 'traverse si b < b0' };
  S.sortir(inv);
  return { D, brut, invariants: inv, lyapunov: null, uniteLyapunov: 'sans objet (rayons integrables)' };
}
function simTrouDeVerSurface(P, n) {
  const D = 3, brut = new Float64Array(n * D), b0 = P.b0, l0 = P.l0;
  for (let i = 0; i < n; i++) {
    const l = -l0 + 2 * l0 * (i + 0.5) / n, r = Math.sqrt(l * l + b0 * b0), ph = i * ANGLE_OR;
    brut[3 * i] = r * cosD(ph); brut[3 * i + 1] = r * sinD(ph); brut[3 * i + 2] = b0 * asinhD(l / b0);
  }
  /* isometrie du plongement : (dr/dl)^2 + (dz/dl)^2 = 1, par differences finies */
  let pire = 0; const e = 1e-4;
  for (let k = 0; k <= 400; k++) {
    const l = -l0 + 2 * l0 * k / 400, rr = (x) => Math.sqrt(x * x + b0 * b0), zz = (x) => b0 * asinhD(x / b0);
    const dr = (rr(l + e) - rr(l - e)) / (2 * e), dz = (zz(l + e) - zz(l - e)) / (2 * e);
    pire = Math.max(pire, Math.abs(dr * dr + dz * dz - 1));
  }
  return { D, brut, invariants: { isometrie: { mesure: pire, formule: 0, unite: 'max |(dr/dl)^2 + (dz/dl)^2 - 1|' }, gorge: { rayon: b0 } },
    lyapunov: null, uniteLyapunov: 'sans objet (surface, pas une trajectoire)' };
}

// ======================================================================================================
// 4. pointsLagrange : probleme restreint circulaire des trois corps (repere tournant, distance = masse totale = 1,
//    periode du secondaire = 2 pi). mu = m2 / (m1 + m2). Primaires en (-mu, 0, 0) et (1 - mu, 0, 0).
//    Constante de Jacobi C = x^2 + y^2 + 2(1 - mu)/r1 + 2 mu/r2 - v^2.
// ======================================================================================================
const MU_LAGRANGE = [9.5388e-4, 0.012150585]; // Soleil-Jupiter, Terre-Lune
function lagrangeDerivees(y, d, c) {
  const mu = c.mu, x = y[0], yy = y[1], z = y[2], dx1 = x + mu, dx2 = x - 1 + mu;
  const r1s = dx1 * dx1 + yy * yy + z * z, r2s = dx2 * dx2 + yy * yy + z * z;
  const k1 = (1 - mu) / (r1s * Math.sqrt(r1s)), k2 = mu / (r2s * Math.sqrt(r2s));
  d[0] = y[3]; d[1] = y[4]; d[2] = y[5];
  d[3] = 2 * y[4] + x - k1 * dx1 - k2 * dx2;
  d[4] = -2 * y[3] + yy - (k1 + k2) * yy;
  d[5] = -(k1 + k2) * z;
}
const pasLagrange = fabriquerRK4(6, lagrangeDerivees);
const distances = (y, mu) => {
  const a = y[0] + mu, b = y[0] - 1 + mu, q = y[1] * y[1] + y[2] * y[2];
  return [Math.sqrt(a * a + q), Math.sqrt(b * b + q)];
};
function jacobi(y, mu) { const [r1, r2] = distances(y, mu); return y[0] * y[0] + y[1] * y[1] + 2 * (1 - mu) / r1 + 2 * mu / r2 - (y[3] * y[3] + y[4] * y[4] + y[5] * y[5]); }
function pointsColineaires(mu) {
  const g = (x) => { const a = x + mu, b = x - 1 + mu; return x - (1 - mu) * a / Math.abs(a * a * a) - mu * b / Math.abs(b * b * b); };
  return { L1: bissection(g, -mu + 1e-12, 1 - mu - 1e-12), L2: bissection(g, 1 - mu + 1e-12, 2), L3: bissection(g, -2, -mu - 1e-12) };
}
function simLagrange(P, n) {
  const mu = MU_LAGRANGE[P.monde], c = { mu }, col = pointsColineaires(mu), L4 = [0.5 - mu, Math.sqrt(3) / 2];
  const y = new Float64Array(6);
  if (P.orbite === 0) { y[0] = L4[0] * (1 + P.ecart); y[1] = L4[1] * (1 + P.ecart); }
  else { const r = 1 + P.ecart; y[0] = -r; y[4] = r - Math.sqrt((1 - mu) / r); }
  y[2] = P.z0;
  const y0 = Float64Array.from(y), D = 3, base = 0.01;
  /* FINS PHYSIQUES (escape : |x| + |y| + |z| >= 10 ; impact : collision avec un primaire) : dessinees SANS rejeu (game84, voir
     courirLagrange) — le trajet calcule jusqu a la fin, puis le point de la fin fige jusqu a la ligne n-1 */
  const run = courirLagrange(P.duree);
  if (run.echec) return { bornee: false, echappeA: run.k, raison: run.raison, uniteLyapunov: 'par unite de temps' };
  const { brut, S, somme, amin, amax, tours, dmin, duree } = run;
  const inv = {
    L1: { mesure: col.L1 }, L2: { mesure: col.L2 }, L3: { mesure: col.L3 },
    L4: { x: L4[0], y: L4[1], distanceAuPrimaire: Math.sqrt((L4[0] + mu) * (L4[0] + mu) + L4[1] * L4[1]), distanceAuSecondaire: Math.sqrt((L4[0] - 1 + mu) * (L4[0] - 1 + mu) + L4[1] * L4[1]) },
    rayonDeHill: { formule: racineCubique(mu / 3) },
    angleAuSecondaire: { min: amin / RAD, max: amax / RAD, passagesParZero: tours, unite: 'degre, vu du barycentre, secondaire a 0',
      forme: tours > 0 ? 'circulation' : amax < PI ? 'tetard autour de L4' : amin > PI ? 'tetard autour de L5' : 'fer a cheval' },
    distanceMinAuSecondaire: { mesure: dmin },
    mu,
  };
  S.sortir(inv);
  const out = { D, brut, invariants: inv, lyapunov: somme / duree, uniteLyapunov: 'par unite de temps (2 pi = une periode du secondaire)' };
  if (run.impact) { out.raison = run.impact.raison; out.fin = { evenement: run.impact.evenement, indice: run.impact.k, t: duree, note: 'rows after the end repeat its point' }; }
  return out;

  function courirLagrange(duree) {
  const y = Float64Array.from(y0), brut = new Float64Array(n * D), S = suivi(), sous = Math.max(1, Math.ceil(duree / (n - 1) / base)), h = duree / ((n - 1) * sous);
  /* temoin de Benettin : ecart initial D0 dans une direction fixe non uniforme */
  const e = Float64Array.from(y), ec = new Float64Array(6);
  { let q = 0; const dep = []; for (let j = 0; j < 6; j++) { dep.push(1 + 0.37 * ((j * 5) % 7)); q += dep[j] * dep[j]; } q = D0 / Math.sqrt(q); for (let j = 0; j < 6; j++) e[j] += dep[j] * q; }
  let somme = 0, amin = Infinity, amax = -Infinity, aPrec = NaN, tours = 0, dmin = Infinity, tc = 0;
  const angle = () => { let t = atan2D(y[1], y[0]); if (t < 0) t += DEUX_PI; return t; };
  const noter = (k) => {
    const o = k * D; brut[o] = y[0]; brut[o + 1] = y[1]; brut[o + 2] = y[2];
    S.noter({ jacobi: jacobi(y, mu) });
    const t = angle(); if (aPrec === aPrec && Math.abs(t - aPrec) > PI) tours++; aPrec = t;
    if (t < amin) amin = t; if (t > amax) amax = t;
  };
  noter(0);
  for (let k = 1; k < n; k++) {
    for (let st = 0; st < sous; st++) {
      let reste = h;
      while (reste > 0) {
        const [r1, r2] = distances(y, mu); if (r2 < dmin) dmin = r2;
        const f = Math.min(1, r1 / 0.05, r2 / 0.05), pm = base * f * Math.sqrt(f), q = Math.ceil(reste / pm - 1e-9), hk = q <= 1 ? reste : reste / q;
        pasLagrange(y, c, hk); pasLagrange(e, c, hk); reste = q <= 1 ? 0 : reste - hk;
        const [s1, s2] = distances(y, mu);
        /* une FIN (impact, sortie de la zone) n est PAS rejouee (vu au banc : pres d une rencontre serree le rejeu a un autre pas suit
         *   une AUTRE trajectoire chaotique — 57 « escape » sur 72 finissaient loin du bord, les impacts loin du corps) : les lignes deja
         *   calculees restent, les suivantes = le point de la fin */
        const sortie = !(Math.abs(y[0]) + Math.abs(y[1]) + Math.abs(y[2]) < 10), choc = s2 < 1e-4 || s1 < 1e-3;
        if (choc || sortie) {
          for (let j = k; j < n; j++) { brut[j * D] = y[0]; brut[j * D + 1] = y[1]; brut[j * D + 2] = y[2]; }
          return { brut, S, somme, amin, amax, tours, dmin, duree: Math.max(tc + hk, 1e-9),
            impact: { k, evenement: choc ? 'impact' : 'escape', raison: choc ? (s2 < 1e-4 ? 'collision avec le secondaire' : 'collision avec le primaire') : 'echappe' } };
        }
        tc += hk;
      }
    }
    let d2 = 0; for (let j = 0; j < 6; j++) { ec[j] = e[j] - y[j]; d2 += ec[j] * ec[j]; }
    const d = Math.sqrt(d2);
    if (d > 0) { somme += lnD(d / D0); for (let j = 0; j < 6; j++) e[j] = y[j] + ec[j] * D0 / d; }
    noter(k);
  }
  return { brut, S, somme, amin, amax, tours, dmin, duree };
  }
}

// ======================================================================================================
// 5. pulsarHulseTaylor : PSR B1913+16, decroissance de la periode orbitale par ondes gravitationnelles (Peters-Mathews 1963-64)
//    Pb = 0.322997448918 j, e = 0.6171340, mp = 1.438, mc = 1.390 Msol (Weisberg & Huang 2016).
//    dPb/dt = -(192 pi / 5) (2 pi T_sol / Pb)^(5/3) f(e) (1 - e^2)^(-7/2) mp mc M^(-1/3).
// ======================================================================================================
const HT = Object.freeze({ Pb: 0.322997448918 * 86400, e: 0.6171340, mp: 1.438, mc: 1.390, observe: -2.423e-12, predictionPubliee: -2.40263e-12 });
function facteurPeters(e2) { return 1 + 73 / 24 * e2 + 37 / 96 * e2 * e2; }
function pDotPeters(Pb, e, m1, m2) {
  const e2 = e * e, M = m1 + m2, u = 1 - e2;
  return -(192 * PI / 5) * puissance(DEUX_PI * T_SOLEIL / Pb, 5 / 3) * m1 * m2 / racineCubique(M) * facteurPeters(e2) / (u * u * u * Math.sqrt(u));
}
/* Peters 1964 : da/dt, de/dt (a en secondes-lumiere, t en secondes) */
function petersDerivees(y, d, c) {
  const a = y[0], e = y[1], e2 = e * e, u = 1 - e2, b = c.beta;
  d[0] = -(64 / 5) * b / (a * a * a * u * u * u * Math.sqrt(u)) * facteurPeters(e2);
  d[1] = -(304 / 15) * b * e / (a * a * a * a * u * u * Math.sqrt(u)) * (1 + 121 / 304 * e2);
}
const pasPeters = fabriquerRK4(2, petersDerivees);
function simHulseTaylor(P, n) {
  const m1 = HT.mp, m2 = HT.mc, M = m1 + m2, TM = T_SOLEIL * M, c = { beta: T_SOLEIL * T_SOLEIL * T_SOLEIL * m1 * m2 * M };
  const a0 = racineCubique(TM * (HT.Pb / DEUX_PI) * (HT.Pb / DEUX_PI));
  const calc = pDotPeters(HT.Pb, HT.e, m1, m2);
  /* coherence : dP/dt = (3/2) P (da/dt) / a avec le systeme de Peters */
  const d0 = new Float64Array(2); petersDerivees([a0, HT.e], d0, c);
  const pdotEdo = 1.5 * HT.Pb * d0[0] / a0;
  /* integration jusqu a la coalescence (a < a0 / 1000) */
  const T = [0], A = [a0], Ee = [HT.e], y = new Float64Array([a0, HT.e]), dd = new Float64Array(2); let t = 0;
  while (y[0] > a0 * 1e-3 && T.length < 100000) {
    petersDerivees(y, dd, c); const h = 0.002 * y[0] / Math.abs(dd[0]);
    pasPeters(y, c, h); t += h; if (y[1] < 0) y[1] = 0; T.push(t); A.push(y[0]); Ee.push(y[1]);
  }
  const tau = t, AN = 3.15576e7 * 1e6;
  const D = 6, brut = new Float64Array(n * D), inc = 47.2 * RAD, om = 292.54 * RAD, ci = cosD(inc), si = sinD(inc), co = cosD(om), so = sinD(om);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const ti = P.fraction * tau * i / (n - 1);
    while (j < T.length - 2 && T[j + 1] < ti) j++;
    const f = (ti - T[j]) / (T[j + 1] - T[j]), a = A[j] + f * (A[j + 1] - A[j]), e = Ee[j] + f * (Ee[j + 1] - Ee[j]);
    const Ek = kepler(DEUX_PI * P.tours * i / (n - 1), e), px = a * (cosD(Ek) - e), py = a * Math.sqrt(1 - e * e) * sinD(Ek);
    const qx = co * px - so * py, qy = so * px + co * py, X = qx, Y = qy * ci, Z = qy * si, o = i * D;
    brut[o] = -m2 / M * X; brut[o + 1] = -m2 / M * Y; brut[o + 2] = -m2 / M * Z;
    brut[o + 3] = m1 / M * X; brut[o + 4] = m1 / M * Y; brut[o + 5] = m1 / M * Z;
  }
  const inv = {
    derivePeriode: { mesure: calc, formule: HT.predictionPubliee, observe: HT.observe, ecartObserve: Math.abs(calc - HT.observe) / Math.abs(HT.observe),
      ecartPrediction: Math.abs(calc - HT.predictionPubliee) / Math.abs(HT.predictionPubliee), unite: 's/s' },
    coherenceEdo: { mesure: pdotEdo, formule: calc, ecart: Math.abs(pdotEdo - calc) / Math.abs(calc) },
    demiGrandAxe: { mesure: a0, unite: 'seconde-lumiere' },
    coalescence: { mesure: tau / AN, unite: 'millions d annees' },
    affichage: { millionsAnnees: P.fraction * tau / AN, tours: P.tours, note: 'forme de l orbite a des epoques regulieres ; phase orbitale non a l echelle du temps' },
  };
  return { D, brut, invariants: inv, lyapunov: null, uniteLyapunov: 'sans objet (evolution seculaire, pas de chaos)' };
}

// ======================================================================================================
// 6. courbeRotation : vitesse circulaire d une galaxie type Voie lactee (modele illustratif, pas un ajustement)
//    disque Miyamoto-Nagai (a = 3, b = 0.28 kpc) + bulbe Hernquist (a = 0.6 kpc) + halo NFW (rho0, rs).
//    v_NFW^2 = 4 pi G rho0 rs^3 [ln(1 + x) - x/(1 + x)] / r, x = r/rs.
// ======================================================================================================
const MN_A = 3, MN_B = 0.28, HQ_A = 0.6;
const v2Visible = (r, P) => G_KPC * P.Mdisque * r * r / puissance(r * r + (MN_A + MN_B) * (MN_A + MN_B), 1.5) + G_KPC * P.Mbulbe * r / ((r + HQ_A) * (r + HQ_A));
const v2Halo = (r, P) => { const x = r / P.rs; return 4 * PI * G_KPC * P.rho0 * P.rs * P.rs * P.rs * (lnD(1 + x) - x / (1 + x)) / r; };
function simCourbe(P, n) {
  const D = 4, brut = new Float64Array(n * D), r0 = 0.5;
  for (let i = 0; i < n; i++) {
    const r = r0 + (P.rmax - r0) * i / (n - 1), vv = Math.sqrt(v2Visible(r, P)), vt = Math.sqrt(v2Visible(r, P) + v2Halo(r, P));
    const ph = (i % 4) * PI_2 + vt / r * KMS_KPC_EN_RAD_MA * P.tempsMa, o = i * D;
    brut[o] = r * cosD(ph); brut[o + 1] = r * sinD(ph); brut[o + 2] = vt; brut[o + 3] = vv;
  }
  const rho = (r) => { const x = r / P.rs; return P.rho0 / (x * (1 + x) * (1 + x)); };
  let simpson = 0; const N = 2000, hh = P.rs / N;
  for (let k = 0; k <= N; k++) { const r = k * hh, w = k === 0 || k === N ? 1 : k % 2 ? 4 : 2; simpson += w * (r === 0 ? 0 : 4 * PI * r * r * rho(r)); }
  simpson *= hh / 3;
  const vt = (r) => Math.sqrt(v2Visible(r, P) + v2Halo(r, P)), vv = (r) => Math.sqrt(v2Visible(r, P));
  const inv = {
    vitesseMaxHalo: { mesure: P.rho0 > 0 ? minDore((r) => -v2Halo(r, P), 0.1 * P.rs, 10 * P.rs) / P.rs : NaN, formule: 2.16258, unite: 'r_max / r_s' },
    vitesseHaloEnRs: { mesure: Math.sqrt(v2Halo(P.rs, P)), formule: Math.sqrt(4 * PI * G_KPC * P.rho0 * P.rs * P.rs * (LN2 - 0.5)), unite: 'km/s' },
    masseHaloEnRs: { mesure: simpson, formule: 4 * PI * P.rho0 * P.rs * P.rs * P.rs * (LN2 - 0.5), unite: 'Msol (Simpson sur la densite NFW)' },
    platitude: { avecHalo: vt(30) / vt(10), visibleSeul: vv(30) / vv(10), unite: 'v(30 kpc) / v(10 kpc)' },
    chuteKepler: { mesure: vv(2 * P.rmax) / vv(P.rmax), formule: Math.sqrt(0.5), unite: 'v_visible(2 rmax) / v_visible(rmax)' },
    vitesseA8kpc: { avecHalo: vt(8.2), visibleSeul: vv(8.2), unite: 'km/s (sortie du modele, pas une mesure)' },
  };
  return { D, brut, invariants: inv, lyapunov: null, uniteLyapunov: 'sans objet (orbites circulaires, nuage d etoiles)' };
}

// ======================================================================================================
// 7. expansionUnivers : Friedmann, univers plat LambdaCDM sans rayonnement : H(a) = H0 sqrt(Om a^-3 + OL), OL = 1 - Om.
//    On integre t(ln a) (dt/dln a = 1/H) ; positions physiques des galaxies x(t) = a(t) x0 (comobiles fixes, 1 Gpc).
// ======================================================================================================
function simExpansion(P, n) {
  const H0 = P.H0 / HUBBLE_GA, Om = P.Om, OL = 1 - Om;
  const H = (a) => H0 * Math.sqrt(Om / (a * a * a) + OL);
  const dx = 0.002, x0 = -14, a0 = expD(x0);
  const X = [x0], T = [2 / (3 * H0 * Math.sqrt(Om)) * a0 * Math.sqrt(a0)];
  const f = (x) => 1 / H(expD(x));
  let k = 0, age = NaN;
  while (k < 20000) {
    const x = x0 + k * dx, t = T[k];
    const t1 = t + dx / 6 * (f(x) + 4 * f(x + dx / 2) + f(x + dx));
    k++; X.push(x0 + k * dx); T.push(t1);
    if (k === 7000) age = t1;
    if (k >= 7000 && t1 > P.finGa) break;
  }
  /* transition deceleration -> acceleration MESUREE : minimum de da/dt par differences finies sur la table */
  let best = Infinity, ib = -1;
  for (let i = 1; i < X.length - 1; i++) { const v = (expD(X[i + 1]) - expD(X[i - 1])) / (T[i + 1] - T[i - 1]); if (v < best) { best = v; ib = i; } }
  let zt = NaN;
  if (ib > 1 && ib < X.length - 2) {
    const v = (i) => (expD(X[i + 1]) - expD(X[i - 1])) / (T[i + 1] - T[i - 1]), vm = v(ib - 1), v0 = v(ib), vp = v(ib + 1);
    const dec = 0.5 * (vm - vp) / (vm - 2 * v0 + vp); zt = 1 / expD(X[ib] + dec * dx) - 1;
  }
  const s3 = 1 / Math.sqrt(3), G = [[s3, s3, s3], [s3, -s3, -s3], [-s3, s3, -s3], [-s3, -s3, s3]];
  const D = 12, brut = new Float64Array(n * D); let j = 0;
  for (let i = 0; i < n; i++) {
    const t = P.finGa * i / (n - 1); let a;
    if (t <= T[0]) a = puissance(1.5 * H0 * Math.sqrt(Om) * t, 2 / 3);
    else { while (j < T.length - 2 && T[j + 1] < t) j++; const g = (t - T[j]) / (T[j + 1] - T[j]); a = expD(X[j] + g * (X[j + 1] - X[j])); }
    for (let q = 0; q < 4; q++) for (let c = 0; c < 3; c++) brut[i * D + 3 * q + c] = a * G[q][c];
  }
  const inv = {
    ageUnivers: { mesure: age, formule: OL > 0 ? 2 / (3 * H0 * Math.sqrt(OL)) * asinhD(Math.sqrt(OL / Om)) : 2 / (3 * H0), reference: 13.8, unite: 'milliards d annees' },
    transitionAcceleration: { mesure: zt, formule: OL > 0 ? racineCubique(2 * OL / Om) - 1 : NaN, unite: 'decalage vers le rouge z' },
    facteurEchelleFinal: { mesure: brut[(n - 1) * D] / s3, a: 'a(finGa)' },
  };
  return { D, brut, invariants: inv, lyapunov: null, uniteLyapunov: 'sans objet (equation de Friedmann, pas de chaos)' };
}

// ======================================================================================================
// 8. cometeHalley : 1P/Halley autour du Soleil seul (deux corps, Newton). a = 17.834 UA, e = 0.96714, i = 162.26 deg,
//    Omega = 58.42 deg, omega = 111.33 deg (JPL). Temps regularise dt = r ds (Sundman), RK4. G Msol = (k * 365.25)^2 UA^3/an^2.
// ======================================================================================================
const HALLEY = Object.freeze({ a: 17.834, e: 0.96714, i: 162.26, Om: 58.42, om: 111.33, periodePubliee: 75.32, perihelePublie: 0.586 });
function simHalley(P, n) {
  const GM = (K_GAUSS * 365.25) * (K_GAUSS * 365.25), a = HALLEY.a, e = HALLEY.e, q = a * (1 - e), vp = Math.sqrt(GM * (1 + e) / q);
  const ci = cosD(HALLEY.i * RAD), si = sinD(HALLEY.i * RAD), cO = cosD(HALLEY.Om * RAD), sO = sinD(HALLEY.Om * RAD), cw = cosD(HALLEY.om * RAD), sw = sinD(HALLEY.om * RAD);
  const rot = (px, py) => [(cO * cw - sO * sw * ci) * px + (-cO * sw - sO * cw * ci) * py, (sO * cw + cO * sw * ci) * px + (-sO * sw + cO * cw * ci) * py, sw * si * px + cw * si * py];
  const p0 = rot(q, 0), v0 = rot(0, vp);
  const y = new Float64Array([p0[0], p0[1], p0[2], v0[0], v0[1], v0[2], 0]);
  const pas = fabriquerRK4(7, (s, d) => {
    const r = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]), k = GM / (r * r);
    d[0] = r * s[3]; d[1] = r * s[4]; d[2] = r * s[5]; d[3] = -k * s[0]; d[4] = -k * s[1]; d[5] = -k * s[2]; d[6] = r;
  });
  const Stot = P.tours * DEUX_PI * Math.sqrt(a / GM), sous = Math.max(1, Math.ceil(P.tours * 4000 / (n - 1))), h = Stot / ((n - 1) * sous);
  const D = 6, brut = new Float64Array(n * D), S = suivi(), wT = Math.sqrt(GM), peri = [0];
  let rmin = Infinity;
  const noter = (k) => {
    const o = k * D, r = Math.sqrt(y[0] * y[0] + y[1] * y[1] + y[2] * y[2]);
    brut[o] = y[0]; brut[o + 1] = y[1]; brut[o + 2] = y[2]; brut[o + 3] = cosD(wT * y[6]); brut[o + 4] = sinD(wT * y[6]); brut[o + 5] = 0;
    S.noter({ energie: (y[3] * y[3] + y[4] * y[4] + y[5] * y[5]) / 2 - GM / r, momentCinetiqueZ: y[0] * y[4] - y[1] * y[3] });
  };
  noter(0);
  let rvP = 0, tP = 0;
  for (let k = 1; k < n; k++) {
    for (let st = 0; st < sous; st++) {
      pas(y, null, h);
      const r = Math.sqrt(y[0] * y[0] + y[1] * y[1] + y[2] * y[2]), rv = y[0] * y[3] + y[1] * y[4] + y[2] * y[5];
      if (r < rmin) rmin = r;
      if (rvP < 0 && rv >= 0) peri.push(tP + (y[6] - tP) * (-rvP) / (rv - rvP));
      rvP = rv; tP = y[6];
    }
    noter(k);
  }
  const dp = []; for (let k = 1; k < peri.length; k++) dp.push(peri[k] - peri[k - 1]);
  const inv = {
    periode: { mesure: dp.length ? dp.reduce((s, x) => s + x, 0) / dp.length : NaN, formule: DEUX_PI * a * Math.sqrt(a) / Math.sqrt(GM), publiee: HALLEY.periodePubliee, passages: peri.length, unite: 'an' },
    perihelie: { mesure: rmin, formule: q, publie: HALLEY.perihelePublie, unite: 'UA' },
  };
  S.sortir(inv);
  return { D, brut, invariants: inv, lyapunov: null, uniteLyapunov: 'sans objet (deux corps, integrable)' };
}

// ======================================================================================================
// 9. trappist1 : les sept planetes de TRAPPIST-1, orbites circulaires coplanaires kepleriennes (aucune interaction)
//    Periodes (jours, Agol et al. 2021) ; M* = 0.0898 Msol ; a^3 = M* k^2 P^2 / (4 pi^2).
// ======================================================================================================
const TRAPPIST = Object.freeze({ noms: ['b', 'c', 'd', 'e', 'f', 'g', 'h'], periodes: [1.510826, 2.421937, 4.049219, 6.101013, 9.207540, 12.352446, 18.772866], masse: 0.0898,
  resonances: [[8, 5], [5, 3], [3, 2], [3, 2], [4, 3], [3, 2]], laplace: [[2, 3], [1, 2], [2, 3], [1, 2], [1, 1]] });
function simTrappist(P, n) {
  const Pd = TRAPPIST.periodes, ax = Pd.map((p) => racineCubique(TRAPPIST.masse * K_GAUSS * K_GAUSS * p * p / (4 * PI * PI)));
  const D = 8, brut = new Float64Array(n * D);
  for (let i = 0; i < n; i++) {
    const t = P.jours * i / (n - 1);
    for (let k = 0; k < 4; k++) { const p = P.premiere + k, ph = DEUX_PI * t / Pd[p]; brut[i * D + 2 * k] = ax[p] * cosD(ph); brut[i * D + 2 * k + 1] = ax[p] * sinD(ph); }
  }
  const rapports = TRAPPIST.resonances.map(([p, q], k) => { const m = Pd[k + 1] / Pd[k]; return { paire: TRAPPIST.noms[k + 1] + '/' + TRAPPIST.noms[k], mesure: m, formule: p / q, ecart: Math.abs(m - p / q) / (p / q) }; });
  const laplace = TRAPPIST.laplace.map(([p, q], k) => ({ triplet: TRAPPIST.noms.slice(k, k + 3).join(''), p, q, residu: p / Pd[k] - (p + q) / Pd[k + 1] + q / Pd[k + 2], unite: '1/jour' }));
  const inv = {
    rapportsDePeriodes: rapports, relationsDeLaplace: laplace,
    demiGrandsAxes: { mesure: ax, unite: 'UA' },
    planetes: TRAPPIST.noms.slice(P.premiere, P.premiere + 4).join(','),
    note: 'rapports et relations calcules sur les periodes publiees ; positions kepleriennes circulaires, phases initiales arbitraires',
  };
  return { D, brut, invariants: inv, lyapunov: null, uniteLyapunov: 'sans objet (mouvement circulaire uniforme)' };
}

// ======================================================================================================
// 10. disqueAccretion : particules test d un disque mince autour d un trou noir de Schwarzschild (G = c = M = 1)
//     Omega = sqrt(M / r^3) (exact pour les orbites circulaires en temps coordonne) ; bord interne = ISCO = 6M.
//     Derive visqueuse simplifiee : dr/dt = -3 nu / (2 r) (nu constant) => r^2 = r_i^2 - 3 nu t ; une particule qui atteint
//     l ISCO est retiree et reinjectee au bord externe (disque stationnaire). Epaisseur H/r = 0.02 (dispersion tiree a graine).
// ======================================================================================================
const ISCO_S = 6;
function simDisque(P, n) {
  const alea = mulberry32(P.graine >>> 0), R2 = P.rext * P.rext, I2 = ISCO_S * ISCO_S, L = R2 - I2, k = 4 / (3 * P.nu);
  const D = 4, brut = new Float64Array(n * D); let rmin = Infinity, vmax = 0, recycles = 0;
  const q4 = (s) => Math.sqrt(Math.sqrt(s)); // s^(1/4) = sqrt(r)
  for (let i = 0; i < n; i++) {
    const ri2 = I2 + L * alea(), phi0 = DEUX_PI * alea(), dz = alea() - 0.5;
    let s = ri2 - 3 * P.nu * P.temps, ph;
    if (s >= I2) ph = phi0 + k * (q4(ri2) - q4(s));
    else {
      const w = Math.ceil((I2 - s) / L); s += w * L; recycles++;
      ph = phi0 + k * ((q4(ri2) - Math.sqrt(ISCO_S)) + (w - 1) * (Math.sqrt(P.rext) - Math.sqrt(ISCO_S)) + (Math.sqrt(P.rext) - q4(s)));
    }
    const r = Math.sqrt(s), v = Math.sqrt(1 / (r - 2)), o = i * D;
    brut[o] = r * cosD(ph); brut[o + 1] = r * sinD(ph); brut[o + 2] = 0.04 * r * dz; brut[o + 3] = v;
    if (r < rmin) rmin = r; if (v > vmax) vmax = v;
  }
  const Ecirc = (r) => (1 - 2 / r) / Math.sqrt(1 - 3 / r), isco = minDore(Ecirc, 3.5, 50);
  const inv = {
    isco: { mesure: isco, formule: 6, unite: 'M (minimum de l energie des orbites circulaires)' },
    rendement: { mesure: 1 - Ecirc(isco), formule: 1 - Math.sqrt(8 / 9), unite: 'fraction de mc^2 liberee jusqu a l ISCO' },
    vitesseIsco: { mesure: vmax, formule: 0.5, unite: 'c (observateur statique local)' },
    frequenceIsco: { mesure: 1 / (DEUX_PI * isco * Math.sqrt(isco) * T_SOLEIL * P.masse), unite: 'Hz (orbitale, pour masse Msol)' },
    rayonMin: { mesure: rmin }, recycles: { mesure: recycles },
  };
  return { D, brut, invariants: inv, lyapunov: null, uniteLyapunov: 'sans objet (nuage de particules, mouvement regulier)' };
}

// ---------- catalogue ----------
export const SYSTEMES = Object.freeze([
  { id: 'lumiereTrouNoir', nom: 'Light bending around a black hole', science: 'General relativity', D: 12,
    params: { b1: 4, b2: 5.2, b3: 7, b4: 15 }, bornes: { b1: [1, 25], b2: [1, 25], b3: [1, 25], b4: [1, 25] },
    phrase: 'Four light rays (null geodesics) from infinity with impact parameters b1..b4 around a non-rotating black hole (G = c = M = 1), integrated in the orbit equation u\'\' + u = 3Mu^2 and drawn inside r = 30M, lifted by their swept angle; rays below b = 3 sqrt(3) M are captured, just above it they circle the photon sphere r = 3M.' },
  { id: 'kerr', nom: 'Orbit around a spinning black hole', science: 'General relativity', D: 3,
    params: { a: 0.9, r0: 10, inclinaison: 10, tours: 8, poussee: 0 }, bornes: { a: [0, 0.99], r0: [2, 40], inclinaison: [0, 180], tours: [2, 30], poussee: [0, 0.05] },
    phrase: 'A test particle on a timelike geodesic of a rotating (Kerr) black hole with spin a/M, started from the equatorial circular-orbit angular momentum tilted by an inclination (above 90 deg = retrograde), integrated from Carter\'s separated Hamiltonian in Boyer-Lindquist coordinates (G = c = M = 1); frame dragging makes the orbital plane precess, no radiation or self-force.' },
  { id: 'trouDeVer', nom: 'Light through a wormhole', science: 'General relativity (theoretical)', D: 6,
    params: { b0: 1, b1: 0.6, b2: 1.6, l0: 8 }, bornes: { b0: [0.2, 3], b1: [0, 5], b2: [0, 5], l0: [6, 20] },
    phrase: 'Two light rays in the Ellis (Morris-Thorne) traversable-wormhole metric with throat radius b0, drawn on its embedding surface: a purely theoretical solution that would need exotic negative-energy matter and has never been observed; rays with impact parameter below b0 pass through the throat, the others turn back.' },
  { id: 'trouDeVerSurface', nom: 'Wormhole embedding surface', science: 'General relativity (theoretical)', D: 3, nuage: true,
    params: { b0: 1, l0: 8 }, bornes: { b0: [0.2, 3], l0: [2, 20] },
    phrase: 'Points on the embedding diagram of the equatorial slice of an Ellis wormhole (r = sqrt(l^2 + b0^2), z = b0 asinh(l / b0)), a picture of the spatial geometry of a hypothetical, never-observed object, not of anything moving.' },
  { id: 'pointsLagrange', nom: 'Trojans and Lagrange points', science: 'Celestial mechanics', D: 3,
    params: { monde: 0, orbite: 0, ecart: 0.01, z0: 0, duree: 500 }, bornes: { monde: [0, 1], orbite: [0, 1], ecart: [0.001, 0.05], z0: [0, 0.1], duree: [20, 3000] },
    phrase: 'A massless body in the circular restricted three-body problem (rotating frame, unit distance and total mass, mass ratio 9.5388e-4 for Sun-Jupiter or 0.012150585 for Earth-Moon), started near L4 (tadpole) or opposite the planet (horseshoe); no other planets, no eccentricity of the primaries.' },
  { id: 'pulsarHulseTaylor', nom: 'Hulse-Taylor binary pulsar', science: 'Gravitational waves', D: 6,
    params: { fraction: 0.999, tours: 12 }, bornes: { fraction: [0.05, 0.999], tours: [3, 40] },
    phrase: 'The orbital decay of PSR B1913+16 from the quadrupole gravitational-wave formulas of Peters and Mathews with the published period, eccentricity and masses (1.438 and 1.390 solar masses); the drawn orbit is HUGELY accelerated: its shape is shown at even epochs up to the computed merger time while the orbital phase is not to scale.' },
  { id: 'courbeRotation', nom: 'Galaxy rotation curve', science: 'Galactic dynamics', D: 4, nuage: true,
    params: { Mdisque: 6.8e10, Mbulbe: 1e10, rho0: 1.1e7, rs: 16, rmax: 30, tempsMa: 250 }, bornes: { Mdisque: [1e10, 2e11], Mbulbe: [0, 5e10], rho0: [0, 5e7], rs: [2, 50], rmax: [10, 60], tempsMa: [0, 2000] },
    phrase: 'Stars on circular orbits in an illustrative Milky-Way-like model (Miyamoto-Nagai disk plus Hernquist bulge plus an NFW dark-matter halo, masses in solar masses, kpc, km/s), sheared by differential rotation after tempsMa million years; columns 3 and 4 are the circular speed with and without the halo; a model, not a fit to data.' },
  { id: 'expansionUnivers', nom: 'Expanding universe', science: 'Cosmology', D: 12,
    params: { H0: 67.4, Om: 0.315, finGa: 30 }, bornes: { H0: [50, 90], Om: [0.05, 1], finGa: [5, 60] },
    phrase: 'The scale factor a(t) of a flat Lambda-CDM universe (Planck 2018 defaults H0 = 67.4 km/s/Mpc, matter 0.315, dark energy 1 - matter, radiation neglected) integrated from the Friedmann equation, carrying four galaxies at fixed comoving positions 1 Gpc from us; rows are evenly spaced in time from the Big Bang.' },
  { id: 'cometeHalley', nom: 'Halley\'s comet', science: 'Celestial mechanics', D: 6,
    params: { tours: 2 }, bornes: { tours: [1, 20] },
    phrase: 'Comet 1P/Halley on its published orbit (a = 17.834 AU, e = 0.96714, inclination 162.26 deg, retrograde) around the Sun alone, Newtonian two-body problem integrated in regularised time from perihelion, with Earth on a circular 1 AU orbit for scale; no planetary perturbations or outgassing, which shift the real period by a few years.' },
  { id: 'trappist1', nom: 'TRAPPIST-1 planets', science: 'Exoplanets', D: 8,
    params: { premiere: 0, jours: 40 }, bornes: { premiere: [0, 3], jours: [2, 60] },
    phrase: 'Four consecutive planets of TRAPPIST-1 (starting at b, c, d or e) on circular coplanar Keplerian orbits from the published periods and a 0.0898 solar-mass star, positions in AU with arbitrary starting phases; the planets do not pull on each other here, so the measured transit-timing variations are not reproduced.' },
  { id: 'disqueAccretion', nom: 'Black hole accretion disk', science: 'Astrophysics', D: 4, nuage: true,
    params: { masse: 10, nu: 0.05, temps: 2000, rext: 30, graine: 1 }, bornes: { masse: [3, 1e10], nu: [0.001, 1], temps: [0, 1e5], rext: [8, 100], graine: [1, 1000000] },
    phrase: 'Test particles of a thin disk around a non-rotating black hole (G = c = M = 1) on circular Keplerian orbits with an inner edge at the innermost stable circular orbit r = 6M, drifting inward with a constant-viscosity prescription dr/dt = -3 nu / (2r) and re-injected at the outer edge when they reach it; column 4 is the orbital speed seen by a static observer; no gas pressure, radiation or magnetic fields.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { pointsLagrange: ['monde', 'orbite'], trappist1: ['premiere'], disqueAccretion: ['graine'] };
const SIMS = { lumiereTrouNoir: simLumiere, kerr: simKerr, trouDeVer: simTrouDeVer, trouDeVerSurface: simTrouDeVerSurface, pointsLagrange: simLagrange,
  pulsarHulseTaylor: simHulseTaylor, courbeRotation: simCourbe, expansionUnivers: simExpansion, cometeHalley: simHalley, trappist1: simTrappist, disqueAccretion: simDisque };
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
  const r = SIMS[id](P, n);
  const echec = (raison, i = null) => ({ params: P, D: s.D, n, bornee: false, echappeA: i, raison, brut: null, lyapunov: NaN, uniteLyapunov: r.uniteLyapunov, points: null, invariants: r.invariants || null });
  if (r.bornee === false) return echec(r.raison, r.echappeA ?? null);
  for (let i = 0; i < r.brut.length; i++) if (!Number.isFinite(r.brut[i])) return echec('NaN', Math.floor(i / s.D));
  const out = { params: P, D: s.D, n, bornee: true, brut: r.brut, lyapunov: r.lyapunov === undefined ? null : r.lyapunov, uniteLyapunov: r.uniteLyapunov, points: null, invariants: r.invariants };
  if (s.nuage) out.nuage = true;
  if (r.fin) out.fin = r.fin;
  if (r.raison) out.raison = r.raison;
  return out;
}
