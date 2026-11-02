// tam-theories-3.js -- TAM, six autres theories classiques, chacune une simulation honnete comparee a une formule EXACTE.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-theories-2.js : SYSTEMES, ENTIERS, COLONNES, SOURCES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null : aucun systeme ici n est une trajectoire chaotique mesuree), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun generateur aleatoire natif (graines : mulberry32).
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux du moteur ; atan ici avec + - * / et Math.sqrt
//   (deux reductions de demi-angle puis serie entiere) ; Math.sqrt/round/floor/ceil/abs/min/max seulement (IEEE exacts).
// REGLE DU PROJET : aucune valeur publiee sans source lue. Ici AUCUNE : tout est sans dimension (k = m = g = omega0 = 1), chaque
//   formule comparee est derivee dans le commentaire de sa section, chaque constante est CALCULEE ; SOURCES est vide expres.
//   La constante de Feigenbaum n est PAS ecrite : les points de doublement r1..r4 sont MESURES, r1 = 3 et r2 = 1 + sqrt 6 (derivables)
//   sont compares, les rapports (r2 - r1)/(r3 - r2) et (r3 - r2)/(r4 - r3) sont rendus comme mesures seulement.
// Les six systemes :
//   rutherford      : particules alpha sur un noyau de Coulomb fixe, eventail de parametres d impact, angle de deviation exact.
//   logistique      : diagramme de bifurcation de x -> r x (1 - x), doublements de periode mesures, point fixe et 2-cycle exacts.
//   chaleur         : equation de la chaleur 1D (schema explicite stable), variance sigma0^2 + 2 D t, chaleur totale conservee.
//   oscillateurForce: oscillateur amorti force, amplitude et phase du regime permanent, pic de resonance sqrt(omega0^2 - 2 gamma^2).
//   brachistochrone : perle sans frottement sur une cycloide, une droite et un arc de cercle entre les memes points.
//   galton          : planche de Galton, histogramme contre la loi binomiale, moyenne 0, variance L/4.
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = Math.PI, DEUX_PI = 2 * Math.PI;

// ---------- constantes d entree : aucune (unites sans dimension) ----------
export const SOURCES = Object.freeze({});

// ---------- arithmetique deterministe ----------
/* atan avec + - * / et sqrt : atan x = pi/2 - atan(1/x) (x > 1), puis deux fois atan x = 2 atan(x / (1 + sqrt(1 + x^2))),
   |x| <= tan(pi/16) < 0.2, serie sum (-1)^k x^(2k+1)/(2k+1) sur 30 termes (reste < 0.2^61) */
function atanD(x) {
  if (!(x - x === 0)) return x === Infinity ? PI / 2 : x === -Infinity ? -PI / 2 : NaN;
  if (x < 0) return -atanD(-x);
  if (x > 1) return PI / 2 - atanD(1 / x);
  let y = x / (1 + Math.sqrt(1 + x * x)); y = y / (1 + Math.sqrt(1 + y * y));
  const y2 = y * y; let t = y, s = 0;
  for (let k = 0; k < 30; k++) { s += t / (2 * k + 1); t *= -y2; }
  return 4 * s;
}
function atan2D(y, x) {
  if (x > 0) return atanD(y / x);
  if (x < 0) return atanD(y / x) + (y >= 0 ? PI : -PI);
  return y > 0 ? PI / 2 : y < 0 ? -PI / 2 : 0;
}
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* suivi d invariants point par point : { debut, fin, derive, min, max } (meme definition que tam-theories-2.js) */
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
/* ligne du pas i (0..n-1) quand on enregistre n lignes sur S pas */
const pasDeLigne = (i, n, S) => (n === 1 ? 0 : Math.round(i * S / (n - 1)));
/* l image f d un film de `images` images parmi F objets (premier et dernier toujours montres) */
const objetDImage = (f, images, F) => (images === 1 ? 0 : Math.round(f * (F - 1) / (images - 1)));

// ---------- 1 : diffusion de Rutherford, noyau fixe, force repulsive k r / r^3 (k = m = 1) ----------
// Energie E = v_inf^2 / 2, moment cinetique L = b v_inf. Orbite hyperbolique ; deviation entre les asymptotes :
//   tan(theta/2) = k / (2 E b), soit b = (k / (2E)) cot(theta/2) (Rutherford). Distance minimale : r_min = d/2 + sqrt(d^2/4 + b^2),
//   d = k / E (de E = L^2/(2 r^2) + k/r au point le plus proche).
// Simulation : depart a r = R0 = 2000 (bMax + k/E) sur la droite y = b, vitesse +x de module v0 = sqrt(2 (E - k/R0)) (energie totale E
//   exacte) ; le b de la formule est le b ASYMPTOTIQUE de cet etat, b_eff = L / sqrt(2E) = b v0 / sqrt(2E) (calcule, pas suppose).
//   RK4 a pas variable dt = eta min(r / v, sqrt(r^3 / k)) ; arret quand la particule repasse r = R0 en s eloignant ; angle mesure =
//   direction de la vitesse finale (atan2). A R0 fini la direction differe de l asymptote d environ k b / (E R0^2) : negligeable ici.
const RUTH_ETA = 0.004, RUTH_R0 = 2000; /* mesure 02/11 : l ecart d angle suit 1/R0^2 (R0 1000 -> 1.1e-7, 2000 -> 2.8e-8) ; eta 0.004 coute 2 fois moins que 0.002 pour le meme angle */
const deviationRutherford = (E, b, k = 1) => 2 * atanD(k / (2 * E * b));
const rMinRutherford = (E, b, k = 1) => { const d = k / E; return d / 2 + Math.sqrt(d * d / 4 + b * b); };
function rutherford(P, n) {
  const k = 1, E = P.E, F = P.rayons, bMax = P.bMax, R0 = RUTH_R0 * (bMax + k / E), W = 2.5 * (bMax + k / E);
  const images = Math.min(F, n), debuts = decouper(n, images), film = filmDe(debuts, n), brut = new Float64Array(n * 4);
  const dessine = new Map(); for (let f = 0; f < images; f++) dessine.set(objetDImage(f, images, F), f);
  const serie = { b: [], bEff: [], mesure: [], formule: [], rMin: [], rMinFormule: [], pas: [] };
  let pireDev = 0, pireRmin = 0, pireE = null, pireL = null;
  for (let j = 0; j < F; j++) {
    const b = bMax * (j + 1) / F, v0 = Math.sqrt(2 * (E - k / R0));
    let x = -Math.sqrt(R0 * R0 - b * b), y = b, vx = v0, vy = 0, t = 0;
    const acc = (px, py) => { const r2 = px * px + py * py, r = Math.sqrt(r2), c = k / (r2 * r); return [c * px, c * py]; };
    const suivi = suiveur(), L0 = x * vy - y * vx, E0 = (vx * vx + vy * vy) / 2 + k / Math.sqrt(x * x + y * y);
    suivi.noter({ energie: E0, momentCinetique: L0 });
    const garde = dessine.has(j), T = [], X = [], Y = [];
    let rMin = Infinity, sorti = false, st = 0, tEntree = NaN;
    while (st < 400000) {
      const r = Math.sqrt(x * x + y * y), v = Math.sqrt(vx * vx + vy * vy), h = RUTH_ETA * Math.min(r / v, Math.sqrt(r * r * r / k));
      const [a1x, a1y] = acc(x, y);
      const x2 = x + h / 2 * vx, y2 = y + h / 2 * vy, u2 = vx + h / 2 * a1x, w2 = vy + h / 2 * a1y, [a2x, a2y] = acc(x2, y2);
      const x3 = x + h / 2 * u2, y3 = y + h / 2 * w2, u3 = vx + h / 2 * a2x, w3 = vy + h / 2 * a2y, [a3x, a3y] = acc(x3, y3);
      const x4 = x + h * u3, y4 = y + h * w3, u4 = vx + h * a3x, w4 = vy + h * a3y, [a4x, a4y] = acc(x4, y4);
      x += h / 6 * (vx + 2 * u2 + 2 * u3 + u4); y += h / 6 * (vy + 2 * w2 + 2 * w3 + w4);
      vx += h / 6 * (a1x + 2 * a2x + 2 * a3x + a4x); vy += h / 6 * (a1y + 2 * a2y + 2 * a3y + a4y);
      t += h; st++;
      const rn = Math.sqrt(x * x + y * y); if (rn < rMin) rMin = rn;
      if (st % 10 === 0) suivi.noter({ energie: (vx * vx + vy * vy) / 2 + k / rn, momentCinetique: x * vy - y * vx });
      if (garde && Math.abs(x) <= W && Math.abs(y) <= W) { if (!(tEntree === tEntree)) tEntree = t; T.push(t - tEntree); X.push(x); Y.push(y); }
      if (x * vx + y * vy > 0) sorti = true;
      if (sorti && rn >= R0) break;
    }
    suivi.noter({ energie: (vx * vx + vy * vy) / 2 + k / Math.sqrt(x * x + y * y), momentCinetique: x * vy - y * vx });
    const inv = suivi.fini(), bEff = Math.abs(L0) / Math.sqrt(2 * E0), th = atan2D(vy, vx), thF = deviationRutherford(E0, bEff, k), rmF = rMinRutherford(E0, bEff, k);
    serie.b.push(b); serie.bEff.push(bEff); serie.mesure.push(th); serie.formule.push(thF); serie.rMin.push(rMin); serie.rMinFormule.push(rmF); serie.pas.push(st);
    pireDev = Math.max(pireDev, Math.abs(th - thF)); pireRmin = Math.max(pireRmin, Math.abs(rMin - rmF) / rmF);
    if (!pireE || inv.energie.derive > pireE.derive) pireE = inv.energie;
    if (!pireL || inv.momentCinetique.derive > pireL.derive) pireL = inv.momentCinetique;
    if (garde) {
      const f = dessine.get(j), d0 = film.debuts[f], c = film.tailles[f], M = T.length, tFin = M ? T[M - 1] : 0;
      let q = 0;
      for (let r = 0; r < c; r++) {
        const tt = c === 1 ? 0 : tFin * r / (c - 1), o = 4 * (d0 + r);
        while (q + 1 < M - 1 && T[q + 1] < tt) q++;
        let px = M ? X[0] : -W, py = M ? Y[0] : b;
        if (M > 1) { const q1 = Math.min(M - 1, q + 1), s = T[q1] > T[q] ? Math.min(1, Math.max(0, (tt - T[q]) / (T[q1] - T[q]))) : 0; px = X[q] + s * (X[q1] - X[q]); py = Y[q] + s * (Y[q1] - Y[q]); }
        brut[o] = px; brut[o + 1] = py; brut[o + 2] = b; brut[o + 3] = tt;
      }
    }
  }
  pireE.note = 'total energy v^2/2 + k/r, exactly conserved by the equations ; worst trajectory of the fan, drift = integration error';
  pireL.note = 'angular momentum x v_y - y v_x, exactly conserved by a central force ; worst trajectory of the fan';
  return { D: 4, brut, film, unite: 'sans objet (orbites hyperboliques, non chaotiques)', invariants: {
    deviation: { mesure: serie.mesure[0], formule: serie.formule[0], b: serie.bEff[0], pireEcart: pireDev, E, rayons: F, serie,
      note: 'deflection angle (radians) of the closest trajectory, from the final velocity direction, against Rutherford tan(theta/2) = k/(2 E b), i.e. b = (k/(2E)) cot(theta/2), with b the asymptotic impact parameter of the start ; pireEcart = worst over the fan' },
    distanceMin: { mesure: serie.rMin[0], formule: serie.rMinFormule[0], pireEcartRelatif: pireRmin,
      note: 'closest approach (sampled at the integration steps) against r_min = d/2 + sqrt(d^2/4 + b^2), d = k/E' },
    energie: pireE, momentCinetique: pireL,
    depart: { R0, fenetre: W, eta: RUTH_ETA, note: 'start and stop at r = R0 ; only the part inside |x|, |y| <= fenetre is drawn' } } };
}

// ---------- 2 : application logistique x -> r x (1 - x) ----------
// Point fixe x* = 1 - 1/r, multiplicateur f'(x*) = 2 - r : stable pour 1 < r < 3, il perd sa stabilite en r1 = 3 (multiplicateur -1).
// 2-cycle : f(f(x)) = x sans les points fixes donne r^2 x^2 - r (r + 1) x + (r + 1) = 0, x+- = (r + 1 +- sqrt((r + 1)(r - 3))) / (2 r) ;
//   multiplicateur f'(x+) f'(x-) = r^2 (1 - 2x+)(1 - 2x-) = 4 + 2r - r^2 ; il vaut -1 en r^2 - 2r - 5 = 0 : r2 = 1 + sqrt 6.
// MESURE des doublements : pour p = 1, 2, 4, 8, le p-cycle est suivi par continuation (Newton sur f^p(x) = x depuis le point du pas
//   precedent, graine = l attracteur obtenu par iteration), son multiplicateur prod r (1 - 2 x_i) est calcule, et le passage par -1 est
//   encadre puis coupe en deux 60 fois. Aucune des valeurs r1..r4 n est donnee au code ; r1 et r2 sont COMPARES a 3 et 1 + sqrt 6 ;
//   r3, r4 et les rapports d intervalles (qui tendent vers la constante de Feigenbaum) sont rendus comme mesures seulement.
function cycleNewton(r, x, p) {
  for (let it = 0; it < 60; it++) {
    let y = x, d = 1;
    for (let i = 0; i < p; i++) { d *= r * (1 - 2 * y); y = r * y * (1 - y); }
    const dx = (y - x) / (d - 1); x -= dx;
    if (Math.abs(dx) < 1e-15) break;
  }
  let y = x, d = 1; for (let i = 0; i < p; i++) { d *= r * (1 - 2 * y); y = r * y * (1 - y); }
  return { x, lambda: d };
}
function mesurerDoublements() {
  const rs = [], pas = [];
  for (let k = 1; k <= 4; k++) {
    const p = 2 ** (k - 1), ecart = k === 1 ? 1 : k === 2 ? rs[0] - 1 : rs[k - 2] - rs[k - 3];
    let r = k === 1 ? 2 : rs[k - 2] + ecart / 20;
    const dr = ecart / 400;
    let x = 0.5; for (let i = 0; i < 60000; i++) x = r * x * (1 - x);
    let c = cycleNewton(r, x, p), lo = r, xlo = c.x, hi = NaN, st = 0;
    while (st < 4000) {
      const rn = lo + dr, cn = cycleNewton(rn, xlo, p); st++;
      if (cn.lambda < -1) { hi = rn; break; }
      lo = rn; xlo = cn.x;
    }
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, cm = cycleNewton(m, xlo, p); if (cm.lambda > -1) { lo = m; xlo = cm.x; } else hi = m; }
    rs.push((lo + hi) / 2); pas.push(st);
  }
  return { r: rs, pas };
}
const DOUBLEMENTS = mesurerDoublements();
const deuxCycleHaut = (r) => (r + 1 + Math.sqrt((r + 1) * (r - 3))) / (2 * r);
const deuxCycleBas = (r) => (r + 1 - Math.sqrt((r + 1) * (r - 3))) / (2 * r);
const LOGI_TRANSITOIRE = 1000;
function logistique(P, n) {
  const m = P.points, C = Math.max(1, Math.floor(n / m)), alea = mulberry32(20261102), brut = new Float64Array(n * 3);
  let pireFixe = 0, colFixe = 0, pireDeux = 0, colDeux = 0;
  for (let c = 0; c < C; c++) {
    const r = C === 1 ? P.rMin : P.rMin + (P.rMax - P.rMin) * c / (C - 1), l0 = Math.floor(c * n / C), l1 = Math.floor((c + 1) * n / C);
    let x = 0.2 + 0.6 * alea();
    for (let i = 0; i < LOGI_TRANSITOIRE; i++) x = r * x * (1 - x);
    const fixe = r >= 1.1 && r <= 2.9, deux = r >= 3.05 && r <= 3.4;
    for (let l = l0; l < l1; l++) {
      const y = r * x * (1 - x), o = 3 * l; brut[o] = r; brut[o + 1] = x; brut[o + 2] = y;
      if (fixe) pireFixe = Math.max(pireFixe, Math.abs(x - (1 - 1 / r)));
      if (deux) pireDeux = Math.max(pireDeux, Math.min(Math.abs(x - deuxCycleHaut(r)), Math.abs(x - deuxCycleBas(r))));
      x = y;
    }
    if (fixe) colFixe++; if (deux) colDeux++;
  }
  /* temoins hors diagramme : r = 2.5 (point fixe) et r = 3.2 (2-cycle), memes iterations */
  let xf = 0.3; for (let i = 0; i < LOGI_TRANSITOIRE; i++) xf = 2.5 * xf * (1 - xf);
  let x2 = 0.3; for (let i = 0; i < 2 * LOGI_TRANSITOIRE; i++) x2 = 3.2 * x2 * (1 - x2);
  const x2h = Math.max(x2, 3.2 * x2 * (1 - x2));
  const [r1, r2, r3, r4] = DOUBLEMENTS.r;
  return { D: 3, brut, nuage: true, unite: 'sans objet (diagramme de bifurcation : un nuage d etats limites, pas une trajectoire)', invariants: {
    doublement1: { mesure: r1, formule: 3, ecart: Math.abs(r1 - 3),
      note: 'first period doubling, measured where the multiplier of the fixed point (computed along the branch) crosses -1, against r1 = 3 (multiplier 2 - r)' },
    doublement2: { mesure: r2, formule: 1 + Math.sqrt(6), ecart: Math.abs(r2 - 1 - Math.sqrt(6)),
      note: 'second period doubling, measured on the 2-cycle multiplier, against r2 = 1 + sqrt 6 (multiplier 4 + 2r - r^2 = -1)' },
    feigenbaum: { r3, r4, rapport1: (r2 - r1) / (r3 - r2), rapport2: (r3 - r2) / (r4 - r3), pas: DOUBLEMENTS.pas,
      note: 'r3 and r4 (onset of the 8- and 16-cycles) and the ratios of successive intervals are MEASUREMENTS only : the ratios tend to the Feigenbaum constant, which is not written in the code' },
    pointFixe: { mesure: xf, formule: 1 - 1 / 2.5, r: 2.5, iterations: LOGI_TRANSITOIRE, note: 'orbit after 1000 iterations at r = 2.5 against the fixed point x* = 1 - 1/r' },
    deuxCycle: { mesure: x2h, formule: deuxCycleHaut(3.2), r: 3.2, note: 'upper point of the attracting 2-cycle at r = 3.2 against (r + 1 + sqrt((r + 1)(r - 3)))/(2r)' },
    diagramme: { colonnes: C, parColonne: m, transitoire: LOGI_TRANSITOIRE, colonnesPointFixe: colFixe, pireEcartPointFixe: pireFixe, colonnesDeuxCycle: colDeux, pireEcartDeuxCycle: pireDeux,
      note: 'drawn columns with 1.1 <= r <= 2.9 are checked against 1 - 1/r, those with 3.05 <= r <= 3.4 against the exact 2-cycle' } } };
}

// ---------- 3 : equation de la chaleur 1D, du/dt = D d2u/dx2, bords sans flux ----------
// Schema explicite u_i += (D dt/dx^2)(u_{i+1} - 2 u_i + u_{i-1}), stable pour D dt/dx^2 <= 1/2 (ici 0.4 au plus).
// Bords sans flux (miroir) : la somme des u_i est conservee EXACTEMENT par le schema (somme telescopique).
// Variance : sum x_i^2 (u_{i+1} - 2u_i + u_{i-1}) = sum u_i ((x_i + dx)^2 + (x_i - dx)^2 - 2 x_i^2) = 2 dx^2 sum u_i, donc a chaque pas
//   la variance croit de 2 D dt EXACTEMENT (schema discret, tant que la chaleur ne touche pas les bords) : sigma^2(t) = sigma0^2 + 2 D t,
//   comme pour l equation continue. Impulsion initiale : creneau de m cellules (m impair), sigma0^2 = dx^2 (m^2 - 1)/12 (exact, discret).
//   Barre FIXE de demi-largeur 9 (la chaleur s etale sur la meme barre : D et la duree changent ce qu on voit) ; bornes choisies pour
//   que 8 sigma(T) <= 9 au pire (w = 1.5, D = 0.5, duree = 1 : sigma = 1.09) : le bord reste froid. Le DESSIN montre le milieu |x| <= 3
//   (mesure 02/11 : la barre entiere, presque partout froide, rendait les curseurs D et largeur presque muets apres standardisation).
// Pic : la solution tend vers une gaussienne, u_max -> Q / sqrt(2 pi sigma^2) ; ce n est exact qu a la limite sigma0 << sigma(t)
//   (comparaison declaree seulement pour sigma0^2 <= 0.1 sigma^2(T)).
const CHALEUR_CELLULES = 851, CHALEUR_IMAGES = 8, CHALEUR_DEMI = 9, CHALEUR_FENETRE = 3;
function chaleur(P, n) {
  const Dc = P.D, T = P.duree, w = P.largeur, M = CHALEUR_CELLULES, c0 = (M - 1) / 2;
  const X = CHALEUR_DEMI, dx = X / c0;
  const h = Math.max(0, Math.round(w / (2 * dx))), m = 2 * h + 1, sigma0 = dx * dx * (m * m - 1) / 12;
  const S = Math.ceil(T * Dc / (0.4 * dx * dx)), dt = T / S, q = Dc * dt / (dx * dx);
  let u = new Float64Array(M), v = new Float64Array(M);
  for (let i = c0 - h; i <= c0 + h; i++) u[i] = 1 / (m * dx);
  const xs = (i) => (i - c0) * dx, iw = Math.round(CHALEUR_FENETRE / dx);
  const moments = (a) => { let Q = 0, m1 = 0, m2 = 0, mx = 0; for (let i = 0; i < M; i++) { const z = a[i], xi = xs(i); Q += z; m1 += z * xi; m2 += z * xi * xi; if (z > mx) mx = z; } Q *= dx; m1 *= dx; m2 *= dx; return { Q, moy: m1 / Q, v: m2 / Q - (m1 / Q) * (m1 / Q), max: mx }; };
  const images = Math.min(CHALEUR_IMAGES, n), debuts = decouper(n, images), film = filmDe(debuts, n), brut = new Float64Array(n * 3);
  const suivi = suiveur(), serie = { t: [], variance: [], formule: [] };
  let f = 0;
  const image = (st) => {
    const d0 = film.debuts[f], c = film.tailles[f];
    for (let r = 0; r < c; r++) { const i = c === 1 ? c0 : c0 - iw + Math.round(r * 2 * iw / (c - 1)), o = 3 * (d0 + r); brut[o] = xs(i); brut[o + 1] = st * dt; brut[o + 2] = u[i]; }
    const mo = moments(u); serie.t.push(st * dt); serie.variance.push(mo.v); serie.formule.push(sigma0 + 2 * Dc * st * dt);
    f++;
  };
  const imageDe = (st) => { while (f < images && (images === 1 ? st === S : Math.round(f * S / (images - 1)) === st)) image(st); };
  suivi.noter({ chaleur: moments(u).Q });
  imageDe(0);
  for (let st = 1; st <= S; st++) {
    for (let i = 0; i < M; i++) { const g = i === 0 ? u[0] : u[i - 1], d = i === M - 1 ? u[M - 1] : u[i + 1]; v[i] = u[i] + q * (d - 2 * u[i] + g); }
    const tmp = u; u = v; v = tmp;
    if (st % 25 === 0 || st === S) suivi.noter({ chaleur: moments(u).Q });
    imageDe(st);
  }
  const fin = moments(u), sT = sigma0 + 2 * Dc * T, inv = suivi.fini();
  inv.chaleur.note = 'total heat sum u dx with no-flux walls : conserved exactly by the scheme (telescoping sum), drift = rounding';
  return { D: 3, brut, film, unite: 'sans objet (diffusion, non chaotique)', invariants: {
    variance: { mesure: fin.v, formule: sT, ecart: Math.abs(fin.v - sT) / sT, sigma0carre: sigma0, D: Dc, t: T, serie,
      note: 'spread of the heat (second moment) against sigma^2(t) = sigma0^2 + 2 D t, which the explicit scheme obeys exactly while the walls stay cold ; sigma0^2 = dx^2 (m^2 - 1)/12 for the initial block of m cells' },
    chaleur: inv.chaleur,
    centre: { mesure: fin.moy, formule: 0, note: 'centre of the heat stays at x = 0 (symmetric start)' },
    pic: { mesure: fin.max, formule: fin.Q / Math.sqrt(DEUX_PI * sT), comparable: sigma0 <= 0.1 * sT, rapportSigma0: sigma0 / sT,
      note: 'peak temperature against the Gaussian limit Q / sqrt(2 pi sigma^2(t)) ; exact only when the start is much narrower than the spread, compared only for sigma0^2 <= 0.1 sigma^2' },
    grille: { cellules: M, dx, dt, pas: S, nombreDeFourier: q, cellulesInitiales: m, demiLargeur: X, margeSigma: X / Math.sqrt(sT), fenetreDessin: iw * dx, note: 'explicit scheme, D dt/dx^2 <= 0.4 < 1/2 (stable)' } } };
}

// ---------- 4 : oscillateur amorti force, x'' + 2 gamma x' + omega0^2 x = F0 cos(omega t), omega0 = 1 ----------
// Regime permanent : x = A cos(omega t - phi), A = F0 / sqrt((omega0^2 - omega^2)^2 + (2 gamma omega)^2),
//   A cos(phi) = F0 (omega0^2 - omega^2)/Delta^2, A sin(phi) = 2 gamma omega F0/Delta^2 (Delta^2 = le denominateur au carre).
//   Aux instants t_k = 2 pi k/omega : x = A cos phi, v/omega = A sin phi, donc A = sqrt(x^2 + (v/omega)^2) mesure.
// Resonance d amplitude : dA/domega = 0 en omega_r = sqrt(omega0^2 - 2 gamma^2) (existe si gamma < omega0/sqrt 2).
// F0 = 1 : le systeme est LINEAIRE, F0 ne ferait que changer l echelle (curseur muet) ; le curseur x0 = deplacement de depart (v0 = 0).
// Simulation : RK4, K = 200 ceil(1/omega) pas par periode de forcage (au moins 200 par periode propre 2 pi : mesure 02/11, a 200 pas
//   par periode de FORCAGE et omega = 0.2 le transitoire s ecartait de 3e-5 de la solution analytique) ; cos aux demi-pas pretabule
//   (la phase du forcage revient tous les K pas) ;
//   transitoire ~ e^{-gamma t}(1 + gamma t) : on attend ln(1e12)/gamma, puis 10 periodes. Le pic est cherche SANS supposer sa position :
//   13 frequences regulieres sur [max(0.05, 1 - 4 gamma), 1 + 2 gamma], puis section doree (30 pas) autour de la meilleure.
const OSC_PAS = 200, OSC_F0 = 1, TABLES_COS = new Map();
const pasParPeriode = (w) => OSC_PAS * Math.max(1, Math.ceil(1 / w));
function tableCos(K) { if (!TABLES_COS.has(K)) TABLES_COS.set(K, Array.from({ length: 2 * K }, (_, j) => cosD(DEUX_PI * j / (2 * K)))); return TABLES_COS.get(K); }
const amplitudeForcee = (F0, gamma, w, w0 = 1) => F0 / Math.sqrt((w0 * w0 - w * w) * (w0 * w0 - w * w) + (2 * gamma * w) * (2 * gamma * w));
const omegaResonance = (gamma, w0 = 1) => (2 * gamma * gamma < w0 * w0 ? Math.sqrt(w0 * w0 - 2 * gamma * gamma) : 0);
function periodesOsc(gamma, w) { return Math.ceil(lnD(1e12) / gamma / (DEUX_PI / w)) + 10; }
/* integre `periodes` periodes depuis (x0, v0) ; appel(s, x, v) a chaque pas si fourni ; rend l etat final et le min/max de A sur la derniere periode */
function integrerOsc(F0, gamma, w, periodes, x0, v0, appel) {
  const K = pasParPeriode(w), h = DEUX_PI / w / K, S = periodes * K, N = 2 * K, COS = tableCos(K);
  let x = x0, v = v0, aMin = Infinity, aMax = 0;
  const acc = (px, pv, j) => -px - 2 * gamma * pv + F0 * COS[j % N];
  if (appel) appel(0, x, v);
  for (let s = 0; s < S; s++) {
    const j = 2 * (s % K);
    const k1x = v, k1v = acc(x, v, j);
    const k2x = v + h / 2 * k1v, k2v = acc(x + h / 2 * k1x, v + h / 2 * k1v, j + 1);
    const k3x = v + h / 2 * k2v, k3v = acc(x + h / 2 * k2x, v + h / 2 * k2v, j + 1);
    const k4x = v + h * k3v, k4v = acc(x + h * k3x, v + h * k3v, j + 2);
    x += h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); v += h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
    if (s >= S - K) { const a = Math.sqrt(x * x + (v / w) * (v / w)); if (a < aMin) aMin = a; if (a > aMax) aMax = a; }
    if (appel) appel(s + 1, x, v);
  }
  return { x, v, A: Math.sqrt(x * x + (v / w) * (v / w)), aMin, aMax, S, h, K };
}
function chercherResonance(F0, gamma) {
  const lo = Math.max(0.05, 1 - 4 * gamma), hi = 1 + 2 * gamma, G = 13, amp = (w) => integrerOsc(F0, gamma, w, periodesOsc(gamma, w), 0, 0).A;
  let kb = 0, vb = -Infinity; const ws = [];
  for (let k = 0; k < G; k++) { const w = lo + (hi - lo) * k / (G - 1), a = amp(w); ws.push(w); if (a > vb) { vb = a; kb = k; } }
  let a = ws[Math.max(0, kb - 1)], b = ws[Math.min(G - 1, kb + 1)];
  const phi = (Math.sqrt(5) - 1) / 2; let c = b - phi * (b - a), d = a + phi * (b - a), fc = amp(c), fd = amp(d), evals = G + 2;
  for (let i = 0; i < 30; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = amp(c); } else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = amp(d); }
    evals++;
  }
  return { omega: (a + b) / 2, amplitude: Math.max(fc, fd), bord: kb === 0 || kb === G - 1, evals, plage: [lo, hi] };
}
const OSC_DESSIN = 8; /* mesure 02/11 : 30 periodes noyaient le transitoire (curseur x0 presque muet), 8 le montrent */
function oscillateurForce(P, n) {
  const g = P.gamma, w = P.omega, F0 = OSC_F0, x0 = P.x0, K = pasParPeriode(w), Pt = periodesOsc(g, w), Sd = Math.min(Pt, OSC_DESSIN) * K, brut = new Float64Array(n * 3);
  const h = DEUX_PI / w / K; let ligne = 0;
  const R = integrerOsc(F0, g, w, Pt, x0, 0, (s, x, v) => { while (ligne < n && s <= Sd && pasDeLigne(ligne, n, Sd) === s) { const o = 3 * ligne; brut[o] = x; brut[o + 1] = v; brut[o + 2] = s * h; ligne++; } });
  const A = amplitudeForcee(F0, g, w), D2 = (1 - w * w) * (1 - w * w) + (2 * g * w) * (2 * g * w);
  const inv = {
    amplitude: { mesure: R.A, formule: A, ecart: Math.abs(R.A - A) / A, stabilite: (R.aMax - R.aMin) / A, periodes: Pt,
      note: 'steady-state amplitude sqrt(x^2 + (v/omega)^2) after the transient has died, against A = F0 / sqrt((omega0^2 - omega^2)^2 + (2 gamma omega)^2)' },
    phase: { mesureCos: R.x, formuleCos: F0 * (1 - w * w) / D2, mesureSin: R.v / w, formuleSin: F0 * 2 * g * w / D2,
      note: 'at whole drive periods x = A cos(phi) and v/omega = A sin(phi), against F0 (omega0^2 - omega^2)/Delta^2 and 2 gamma omega F0/Delta^2' },
  };
  if (2 * g * g < 0.72) {
    const Rz = chercherResonance(F0, g), wr = omegaResonance(g);
    inv.resonance = { mesure: Rz.omega, formule: wr, ecart: Math.abs(Rz.omega - wr), amplitudePic: Rz.amplitude, amplitudePicFormule: amplitudeForcee(F0, g, wr), evaluations: Rz.evals, plage: Rz.plage, bord: Rz.bord,
      note: 'drive frequency of the largest steady amplitude, found by a 13-point sweep and a golden-section search (each point a full simulation), against omega_r = sqrt(omega0^2 - 2 gamma^2)' };
  } else inv.resonance = { existe: false, formule: omegaResonance(g), note: 'for gamma close to or above omega0/sqrt 2 the amplitude peak sits at (or near) omega = 0 : not searched' };
  inv.regime = { gamma: g, omega: w, F0, x0, periodesTransitoire: Pt - 10, periodesDessinees: Sd / K, pasParPeriode: K, pas: R.S, note: 'start from x = x0, v = 0 ; the drawing shows the first ' + (Sd / K) + ' drive periods' };
  return { D: 3, brut, invariants: inv, unite: 'sans objet (oscillateur lineaire, non chaotique)' };
}

// ---------- 5 : brachistochrone, perle sans frottement sous g = 1, de A = (0, 0) a B = (X, -Y) ----------
// Cycloide par A et B : x = a (theta - sin theta), y = -a (1 - cos theta) ; theta_B racine de (theta - sin)/(1 - cos) = X/Y sur ]0, 2 pi[
//   (fonction croissante : bisection), a = Y/(1 - cos theta_B). Le long de la cycloide d theta/dt = sqrt(g/a) exactement, donc
//   T_cycloide = sqrt(a/g) theta_B. Droite : acceleration g Y/L, L = sqrt(X^2 + Y^2) : T_droite = sqrt(2 (X^2 + Y^2)/(g Y)).
// Arc de cercle tangent a la verticale en A (centre (R, 0), R = (X^2 + Y^2)/(2X)) : aucune forme fermee elementaire (elliptique),
//   temps MESURE seulement. La cycloide est la plus rapide de toutes les courbes (theoreme) : le banc verifie qu elle bat les deux autres.
// Simulation : chaque courbe est une piste de N plans inclines (N = 3000 cordes) ; sur un plan, acceleration constante g dh/l, temps
//   exact 2 l/(v0 + v1) avec v1^2 = v0^2 + 2 g dh (Galilee) ; la convergence en N est mesuree (N et N/2).
const BRACHI_N = 3000, G_BRACHI = 1;
function thetaCycloide(rapport) {
  let lo = 1e-12, hi = DEUX_PI - 1e-12;
  for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2, f = (m - sinD(m)) / (1 - cosD(m)); if (f < rapport) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function piste(courbe, N) { /* sommets de la piste, temps cumules, vitesses */
  const px = new Float64Array(N + 1), py = new Float64Array(N + 1), t = new Float64Array(N + 1), vv = new Float64Array(N + 1);
  for (let k = 0; k <= N; k++) { const [x, y] = courbe(k / N); px[k] = x; py[k] = y; }
  px[0] = 0; py[0] = 0;
  for (let k = 0; k < N; k++) {
    const dxk = px[k + 1] - px[k], dyk = py[k + 1] - py[k], l = Math.sqrt(dxk * dxk + dyk * dyk), v1 = Math.sqrt(Math.max(0, -2 * G_BRACHI * py[k + 1]));
    vv[k + 1] = v1; t[k + 1] = t[k] + (l > 0 ? 2 * l / (vv[k] + v1) : 0);
  }
  return { px, py, t, vv, N };
}
function positionPiste(pi, tt) {
  const { px, py, t, vv, N } = pi;
  let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= tt) lo = m; else hi = m; }
  const k = Math.min(lo, N - 1), dxk = px[k + 1] - px[k], dyk = py[k + 1] - py[k], l = Math.sqrt(dxk * dxk + dyk * dyk), tau = Math.min(t[k + 1] - t[k], Math.max(0, tt - t[k]));
  if (!(l > 0)) return [px[k], py[k]];
  const a = G_BRACHI * (-dyk) / l, s = Math.min(l, vv[k] * tau + a * tau * tau / 2);
  return [px[k] + s / l * dxk, py[k] + s / l * dyk];
}
function brachistochrone(P, n) {
  const X = P.X, Y = P.Y, thB = thetaCycloide(X / Y), a = Y / (1 - cosD(thB)), R = (X * X + Y * Y) / (2 * X);
  let phB = atan2D(-Y, X - R); if (phB < 0) phB += DEUX_PI;
  const courbes = [
    (s) => { const th = s * thB; return [a * (th - sinD(th)), -a * (1 - cosD(th))]; },
    (s) => [s * X, -s * Y],
    (s) => { const ph = PI + s * (phB - PI); return [R + R * cosD(ph), R * sinD(ph)]; },
  ];
  const noms = ['cycloid', 'straight line', 'circular arc'];
  const pistes = courbes.map((c) => piste(c, BRACHI_N)), demi = piste(courbes[0], BRACHI_N / 2);
  const Tm = pistes.map((p) => p.t[BRACHI_N]), Tc = Math.sqrt(a / G_BRACHI) * thB, Tl = Math.sqrt(2 * (X * X + Y * Y) / (G_BRACHI * Y));
  const images = Math.min(3, n), debuts = decouper(n, images), film = filmDe(debuts, n), brut = new Float64Array(n * 3);
  for (let f = 0; f < images; f++) {
    const p = pistes[f], d0 = film.debuts[f], c = film.tailles[f], tF = p.t[BRACHI_N];
    for (let r = 0; r < c; r++) { const tt = c === 1 ? 0 : tF * r / (c - 1), [x, y] = positionPiste(p, tt), o = 3 * (d0 + r); brut[o] = x; brut[o + 1] = y; brut[o + 2] = tt; }
  }
  const eN = Math.abs(Tm[0] - Tc), e2 = Math.abs(demi.t[BRACHI_N / 2] - Tc);
  return { D: 3, brut, film, unite: 'sans objet (glissement sans frottement, non chaotique)', invariants: {
    cycloide: { mesure: Tm[0], formule: Tc, ecart: eN / Tc, thetaB: thB, a, erreurN: eN, erreurDemiN: e2, ordre: e2 > 0 && eN > 0 ? lnD(e2 / eN) / lnD(2) : NaN,
      note: 'descent time along the cycloid (bead on a track of ' + BRACHI_N + ' inclined planes) against T = sqrt(a/g) theta_B ; the error shrinks with the number of planes (erreurN vs erreurDemiN)' },
    droite: { mesure: Tm[1], formule: Tl, ecart: Math.abs(Tm[1] - Tl) / Tl, note: 'straight line : constant acceleration g Y/L, T = sqrt(2 (X^2 + Y^2)/(g Y)) ; exact for any number of planes' },
    arc: { mesure: Tm[2], rayon: R, phiB: phB, note: 'circular arc leaving A vertically : time measured only (an elliptic integral, no elementary closed form)' },
    course: { temps: Tm, noms, gagnant: noms[Tm.indexOf(Math.min(...Tm))], gainSurDroite: Tl / Tc,
      note: 'the cycloid is the fastest of all curves joining A and B (brachistochrone theorem) ; frames : cycloid, line, arc' },
    extremites: { A: [0, 0], B: [X, -Y], g: G_BRACHI } } };
}

// ---------- 6 : planche de Galton, L rangees de clous, N billes ----------
// Chaque bille rebondit L fois a gauche ou a droite (pile ou face, mulberry32), un demi-intervalle a chaque fois : la position finale
//   x = k - L/2 (k = nombre de rebonds a droite) suit la loi binomiale P(k) = C(L, k)/2^L (coefficients exacts par recurrence entiere).
//   Moyenne 0, variance L/4 (somme de L pas +-1/2 independants). Erreurs attendues : moyenne sqrt(L/(4N)) ;
//   variance de l estimateur (mu4 - sigma^4)/N, mu4 = (3 L^2 - 2 L)/16, d ou sigma_var = sqrt(L (L - 1)/(8 N)).
// Histogramme : chi2 = sum (O - E)^2 / E sur les cases de E >= 5 (queues regroupees), ddl = cases - 1 ; et le pire ecart d une case
//   en unites de sqrt(N p (1 - p)).
// Dessin (nuage) : les chemins des premieres billes (x, -rangee), puis le tas des N billes sous les cases, hauteur = rang d arrivee
//   dans sa case, mise a l echelle de la plus haute pile (L rangees).
function binomiale(L) { const c = [1]; for (let k = 1; k <= L; k++) c.push(c[k - 1] * (L - k + 1) / k); const d = 2 ** L; return c.map((x) => x / d); }
function galton(P, n) {
  const N = P.billes, L = P.rangees, alea = mulberry32(P.graine >>> 0), nChemins = Math.floor(n / 2), B = Math.min(N, Math.floor(nChemins / (L + 1)));
  const ks = new Int32Array(N), rangs = new Int32Array(N), compte = new Int32Array(L + 1), brut = new Float64Array(n * 3);
  let ligne = 0;
  for (let b = 0; b < N; b++) {
    let k = 0;
    if (b < B) { brut[3 * ligne] = 0; brut[3 * ligne + 1] = 0; brut[3 * ligne + 2] = b; ligne++; }
    for (let j = 1; j <= L; j++) {
      if (alea() < 0.5) k++;
      if (b < B) { const o = 3 * ligne; brut[o] = k - j / 2; brut[o + 1] = -j; brut[o + 2] = b; ligne++; }
    }
    ks[b] = k; rangs[b] = compte[k]; compte[k]++;
  }
  let hMax = 0; for (let k = 0; k <= L; k++) hMax = Math.max(hMax, compte[k]);
  const reste = n - ligne;
  for (let r = 0; r < reste; r++) {
    const b = Math.min(N - 1, Math.floor((r + 0.5) * N / reste)), o = 3 * (ligne + r);
    brut[o] = ks[b] - L / 2; brut[o + 1] = -(L + 1) - L * (rangs[b] + 0.5) / hMax; brut[o + 2] = b;
  }
  const p = binomiale(L);
  let s1 = 0, s2 = 0; for (let b = 0; b < N; b++) { const x = ks[b] - L / 2; s1 += x; s2 += x * x; }
  const moy = s1 / N, vr = s2 / N - moy * moy;
  /* chi2 sur les cases E >= 5, queues regroupees de chaque cote */
  const cases = []; let accO = 0, accE = 0;
  for (let k = 0; k <= L; k++) { accO += compte[k]; accE += N * p[k]; if (accE >= 5) { cases.push([accO, accE]); accO = 0; accE = 0; } }
  if (accE > 0) { if (cases.length) { cases[cases.length - 1][0] += accO; cases[cases.length - 1][1] += accE; } else cases.push([accO, accE]); }
  let chi2 = 0; for (const [O, E] of cases) chi2 += (O - E) * (O - E) / E;
  let pire = 0; for (let k = 0; k <= L; k++) { const E = N * p[k], s = Math.sqrt(E * (1 - p[k])); if (s > 0) pire = Math.max(pire, Math.abs(compte[k] - E) / s); }
  const kc = Math.floor(L / 2);
  return { D: 3, brut, nuage: true, unite: 'sans objet (billes tirees au hasard, pas une trajectoire)', invariants: {
    binomiale: { mesure: compte[kc] / N, formule: p[kc], caseCentrale: kc - L / 2, chi2, ddl: cases.length - 1, pireEcartSigma: pire, frequences: Array.from(compte, (c) => c / N), probabilites: p,
      note: 'fraction of balls in the central bin against C(L, k)/2^L ; chi2 over bins with at least 5 expected balls, and the worst bin deviation in units of sqrt(N p (1 - p))' },
    moyenne: { mesure: moy, formule: 0, sigma: Math.sqrt(L / (4 * N)), note: 'mean landing position (in peg spacings) against 0' },
    variance: { mesure: vr, formule: L / 4, sigma: Math.sqrt(L * (L - 1) / (8 * N)), note: 'variance of the landing position against L/4 (L independent steps of +-1/2)' },
    dessin: { chemins: B, billes: N, pileMax: hMax, note: 'first the paths of the first balls, then every ball stacked in its bin' } } };
}

// ---------- colonnes de brut : meme nature (longueurs comparables entre elles) ou autre grandeur ----------
export const COLONNES = Object.freeze({
  rutherford: { colonnes: ['x (units with k = m = 1, nucleus at the origin)', 'y (same units)', 'impact parameter b of this trajectory (label)', 'time since entering the window'], memeLongueur: [[0, 1]], autres: [2, 3] },
  logistique: { colonnes: ['growth rate r', 'state x_n (0..1)', 'next state x_{n+1} (0..1)'], memeLongueur: [[1, 2]], autres: [0] },
  chaleur: { colonnes: ['position x along the bar (middle part, |x| <= 3)', 'time t', 'temperature u'], memeLongueur: [[0]], autres: [1, 2] },
  oscillateurForce: { colonnes: ['displacement x', 'velocity v (units of omega0 = 1)', 'time t'], memeLongueur: [[0, 1]], autres: [2] },
  brachistochrone: { colonnes: ['x (horizontal)', 'y (height, start at 0)', 'time t since release'], memeLongueur: [[0, 1]], autres: [2] },
  galton: { colonnes: ['x (horizontal, peg spacings)', 'height (minus row along a path, then the pile under the bins)', 'ball index (label)'], memeLongueur: [[0, 1]], autres: [2] },
});

// ---------- catalogue ----------
export const SYSTEMES = Object.freeze([
  { id: 'rutherford', nom: 'Alpha particles on a nucleus (Rutherford scattering)', science: 'Nuclear physics', D: 4, params: { E: 1, bMax: 2, rayons: 9 },
    bornes: { E: [0.25, 4], bMax: [0.5, 4], rayons: [3, 15] },
    phrase: 'A visualisation of Rutherford scattering (k = m = 1): a fan of charged particles fired past a fixed nucleus that repels them, one frame per impact parameter b; each is integrated step by step and its deflection angle is compared with the exact b = (k/(2E)) cot(theta/2), with energy and angular momentum conserved. A point nucleus, classical mechanics, no recoil.' },
  { id: 'logistique', nom: 'Order to chaos (logistic map)', science: 'Chaos theory', D: 3, nuage: true, params: { rMin: 2.8, rMax: 4, points: 40 },
    bornes: { rMin: [1, 3.4], rMax: [3.5, 4], points: [8, 60] },
    phrase: 'A visualisation of the bifurcation diagram of the logistic map x -> r x (1 - x): for each growth rate r the states it settles on, a single value, then 2, 4, 8 and finally chaos. The period doublings are measured on the cycle multipliers and compared with the exact r1 = 3 and r2 = 1 + sqrt 6; later doublings and their shrinking ratio are measurements only.' },
  { id: 'chaleur', nom: 'Heat spreading along a bar (heat equation)', science: 'Thermal physics', D: 3, params: { D: 0.25, duree: 1, largeur: 0.6 },
    bornes: { D: [0.05, 0.5], duree: [0.1, 1], largeur: [0.1, 1.5] },
    phrase: 'A visualisation of the 1D heat equation solved by an explicit, stable finite-difference scheme: a narrow block of heat spreads into a bell along a fixed bar, frame by frame, between insulated walls. The total heat stays constant and the spread obeys sigma^2(t) = sigma0^2 + 2 D t exactly; the peak approaches the Gaussian value only once the start is much narrower than the spread.' },
  { id: 'oscillateurForce', nom: 'A driven spring and resonance (damped driven oscillator)', science: 'Classical mechanics', D: 3, params: { gamma: 0.1, omega: 0.8, x0: 1 },
    bornes: { gamma: [0.05, 1], omega: [0.2, 3], x0: [-3, 3] },
    phrase: 'A visualisation of a damped mass on a spring pushed by a periodic force (natural frequency 1, force amplitude 1): released from x0, it forgets its start and settles into a steady swing whose amplitude and phase are compared with the exact formulas, and a frequency sweep finds the resonance peak at sqrt(1 - 2 gamma^2). A linear spring, no friction other than the damping term.' },
  { id: 'brachistochrone', nom: 'The fastest slide (brachistochrone)', science: 'Calculus of variations', D: 3, params: { X: 1.5, Y: 1 },
    bornes: { X: [0.2, 3], Y: [0.3, 2] },
    phrase: 'A visualisation of the brachistochrone problem (g = 1): beads released together slide without friction from the same start to the same end along a cycloid, a straight line and a circular arc, one frame each. The cycloid wins; its time is compared with the exact sqrt(a/g) theta and the line with sqrt(2 L^2/(g Y)), the arc is measured only.' },
  { id: 'galton', nom: 'Balls through pegs (Galton board)', science: 'Probability', D: 3, nuage: true, params: { billes: 2000, rangees: 12, graine: 1 },
    bornes: { billes: [100, 5000], rangees: [4, 30], graine: [1, 1000000] },
    phrase: 'A visualisation of a Galton board: balls fall through rows of pegs, bouncing left or right at random at each one, and pile up into a bell shape. The pile is compared with the exact binomial law C(L, k)/2^L, with mean 0 and variance L/4; a finite number of balls, so the agreement is statistical.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { rutherford: ['rayons'], logistique: ['points'], chaleur: [], oscillateurForce: [], brachistochrone: [], galton: ['billes', 'rangees', 'graine'] };
const FONCTIONS = { rutherford, logistique, chaleur, oscillateurForce, brachistochrone, galton };
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
