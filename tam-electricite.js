// tam-electricite.js -- TAM, electricite, chaque systeme une simulation honnete comparee a une formule EXACTE.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-biologie.js : SYSTEMES, ENTIERS, COLONNES, SOURCES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun hasard.
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux du moteur ; atan et e^(-x) ici avec + - * / et Math.sqrt.
// REGLE DU PROJET : aucune valeur publiee sans source lue. Ici AUCUNE : charges, resistance et capacite sans dimension ; chaque formule
//   comparee est derivee dans le commentaire de sa section ; SOURCES est vide expres.
// Les systemes :
//   lignesChamp : lignes de champ de deux charges (en 2-D) ; angle d arrivee q1 theta = |q2| phi (flux), part qui s echappe 1 - |q2|/q1.
//   circuitRC   : un condensateur charge puis decharge a travers une resistance ; 1 - e^(-t/tau), demi-temps tau ln 2, et la resistance
//                 dissipe EXACTEMENT l energie que le condensateur garde (la moitie de ce que la pile fournit), quelle que soit R.
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = Math.PI;

export const SOURCES = Object.freeze({});

function atanD(x) {
  if (!(x - x === 0)) return x === Infinity ? PI / 2 : x === -Infinity ? -PI / 2 : NaN;
  if (x < 0) return -atanD(-x);
  if (x > 1) return PI / 2 - atanD(1 / x);
  let y = x / (1 + Math.sqrt(1 + x * x)); y = y / (1 + Math.sqrt(1 + y * y));
  const y2 = y * y; let t = y, s = 0;
  for (let k = 0; k < 30; k++) { s += t / (2 * k + 1); t *= -y2; }
  return 4 * s;
}
function atan2D(y, x) { if (x > 0) return atanD(y / x); if (x < 0) return atanD(y / x) + (y >= 0 ? PI : -PI); return y > 0 ? PI / 2 : y < 0 ? -PI / 2 : 0; }
function expNegD(x) { if (!(x >= 0)) return NaN; let m = 0; while (x > 0.5) { x /= 2; m++; } let s = 1, t = 1; for (let j = 1; j <= 30; j++) { t *= -x / j; s += t; } for (let i = 0; i < m; i++) s *= s; return s; }

// ---------- 1 : lignes de champ de deux charges (2-D) ----------
// Charges lineiques (le champ en 2-D decroit en 1/r) : q1 = +1 en (-1, 0), q2 = q < 0 en (+1, 0). E = sum q_i (r - r_i) / |r - r_i|^2.
// Une ligne part de q1 sous l angle theta (mesure depuis la direction de q2) ; si elle finit sur q2, elle y arrive sous l angle phi (mesure
//   depuis la direction de q1). Exact (derive ici) : le flux de q1 dans le coin [-theta, theta] vaut q1 2 theta / (2 pi) ; il traverse
//   le tube borne par les deux lignes symetriques et entre dans q2 par le coin [-phi, phi] : |q2| 2 phi / (2 pi). Donc q1 theta = |q2| phi.
//   Si |q2| < q1, les lignes de theta > pi |q2| / q1 n ont plus de place sur q2 : elles partent a l infini. Part qui s echappe : 1 - |q2| / q1.
// Trace : direction unitaire E/|E|, RK4 a pas adapte (0.2 x la distance a la charge la plus proche, au plus 0.01 x |r|/2), depart a
//   0.001 de q1 ; arret a 0.001 de q2 (angle lu la), au-dela de |r| = 120 (echappee) ou apres 20000 pas (non conclu, dit).
// Dessin : 24 lignes, points le long de chacune dans le disque |r| <= 4 ; 3e colonne : numero de la ligne (etiquette). Vue de face.
const LIGNES = 24;
function lignesChamp(P, n) {
  const q2 = P.charge, x1 = -1, x2 = 1, EPS = 0.001, FIN = 0.001, LOIN = 120; /* depart a 0.001 : a 0.02 le champ de q2 deviait deja le depart (biais ~ eps/d = 0.5 deg) */
  const champ = (x, y) => { const ax = x - x1, ay = y, bx = x - x2, by = y, a2 = ax * ax + ay * ay, b2 = bx * bx + by * by; return [ax / a2 + q2 * bx / b2, ay / a2 + q2 * by / b2]; };
  const dir = (x, y) => { const [ex, ey] = champ(x, y), m = Math.sqrt(ex * ex + ey * ey); return [ex / m, ey / m]; };
  const traces = [], arrivees = []; let echappees = 0, nonConclues = 0;
  for (let k = 0; k < LIGNES; k++) {
    const th = (k + 0.5) * 2 * PI / LIGNES; /* depuis +x (vers q2) */
    let x = x1 + EPS * cosD(th), y = EPS * sinD(th); const pts = [[x1, 0], [x, y]]; let fin = null;
    /* sonde du 03/11 : pas fixe 0.01, arret a 0.02 de q2 et echappee a |r| = 14 classaient « echappees » deux lignes du dipole q2 = -1
     *   (en 2-D ses lignes sont des cercles par les deux charges : rayon 1 / sin 7.5 deg = 7.7) et lisaient l angle trop loin (1.2 deg) :
     *   pas adapte (petit pres de q2, grand au loin), arret a 0.002, echappee au-dela de 120 */
    for (let s = 0; s < 20000; s++) {
      const d1 = Math.sqrt((x - x1) * (x - x1) + y * y), d2 = Math.sqrt((x - x2) * (x - x2) + y * y), h = Math.min(0.01 * Math.max(1, Math.sqrt(x * x + y * y) / 2), 0.2 * d1, 0.2 * d2);
      const [a1, b1] = dir(x, y), [a2, b2] = dir(x + h / 2 * a1, y + h / 2 * b1), [a3, b3] = dir(x + h / 2 * a2, y + h / 2 * b2), [a4, b4] = dir(x + h * a3, y + h * b3);
      x += h / 6 * (a1 + 2 * a2 + 2 * a3 + a4); y += h / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
      /* vu a l ecran (03/11) : les lignes echappees, dessinees jusqu a |r| = 120, ecrasaient les deux charges au centre ; on TRACE jusqu a
       *   120 (pour classer) mais on ne DESSINE que |r| <= 4 */
      if (x * x + y * y <= 16) pts.push([x, y]);
      if ((x - x2) * (x - x2) + y * y < FIN * FIN) { fin = 'q2'; break; }
      if (x * x + y * y > LOIN * LOIN) { fin = 'infini'; break; }
    }
    const thAbs = th > PI ? 2 * PI - th : th;
    if (fin === 'q2') { const phi = atan2D(Math.abs(y), -(x - x2)); /* depuis la direction de q1 (-x) */ arrivees.push({ theta: thAbs, phi, formule: thAbs / Math.abs(q2) }); pts.push([x2, 0]); }
    else if (fin === 'infini') echappees++; else nonConclues++;
    traces.push(pts);
  }
  let pire = 0; for (const a of arrivees) pire = Math.max(pire, Math.abs(a.phi - a.formule));
  const brut = new Float64Array(n * 3), par = Math.max(2, Math.floor(n / LIGNES)); let l = 0;
  for (let k = 0; k < traces.length && l < n; k++) { const pts = traces[k], nb = k === traces.length - 1 ? n - l : par;
    for (let q = 0; q < nb && l < n; q++) { const p = pts[nb === 1 ? 0 : Math.round(q * (pts.length - 1) / (nb - 1))], o = 3 * l; brut[o] = p[0]; brut[o + 1] = p[1]; brut[o + 2] = k + 1; l++; } }
  /* compte ATTENDU de lignes echappees parmi les 24 : celles dont |theta| > pi |q2| / q1 */
  let attendues = 0; for (let k = 0; k < LIGNES; k++) { const th = (k + 0.5) * 2 * PI / LIGNES, ta = th > PI ? 2 * PI - th : th; if (ta > PI * Math.abs(q2)) attendues++; }
  const deg = 180 / PI, partTh = Math.max(0, 1 - Math.abs(q2));
  return { D: 3, brut, nuage: true, unite: 'sans objet (electrostatique)', invariants: {
    angleArrivee: { mesure: pire * deg, formule: 0, lignesArrivees: arrivees.length, note: 'worst gap (degrees) between the arrival angle phi of each line on q2 and q1 theta / |q2| (flux through the tube between symmetric lines; exact in 2-D) ; the line is stopped 0.02 from q2, which leaves a small gap' },
    echappees: { mesure: echappees, formule: attendues, lignes: LIGNES, partContinue: partTh, nonConclues, note: 'number of the ' + LIGNES + ' lines from q1 that escape to infinity against the count expected from |theta| > pi |q2| / q1 ; for a continuous fan the share is 1 - |q2| / q1' } } };
}

// ---------- 2 : un circuit RC ----------
// Pile de tension 1, resistance R, condensateur C = 1 (constante de temps tau = R C = R). Charge de t = 0 a 6, puis decharge (pile
//   court-circuitee) de 6 a 12. RK4 au pas min(0.005, tau / 200) sur dV/dt = (Vs - V) / tau.
// Exact (derive ici) : charge V = 1 - e^(-t/tau) ; demi-charge en tau ln 2 ; courant I = (Vs - V) / R.
//   Energie pendant la charge (0 -> T) : la pile fournit int Vs I dt = C V(T) ; le condensateur garde C V(T)^2 / 2 ; la resistance dissipe
//   int R I^2 dt = C V(T) - C V(T)^2 / 2. Pour une charge complete (V(T) -> 1) : pile 1, condensateur 1/2, resistance 1/2 — la MOITIE
//   est perdue, quelle que soit R. Mesures : integrales par trapezes sur la trajectoire RK4, compare a ces formules au V(T) mesure.
// Dessin : deux courbes (vue de face) : la tension V / 1 et le courant R I / 1 (tous deux entre -1 et 1) ; 3e colonne : 0 = V, 1 = R I.
function circuitRC(P, n) {
  /* banc du 03/11 : en t / tau le dessin etait le MEME pour tout tau (curseur muet, invariance d echelle) : temps ABSOLU, charge de 0 a 6
   *   puis decharge de 6 a 12 ; avec un grand tau la charge n est pas finie a t = 6, et le partage d energie le montre */
  const tau = P.tau, T1 = 6, T = 12, pas = Math.round(T / Math.min(0.005, tau / 200)), h = T / pas, mi = Math.round(T1 / h);
  let V = 0; const Vt = new Float64Array(pas + 1); Vt[0] = 0;
  for (let st = 1; st <= pas; st++) { const Vs = st <= mi ? 1 : 0, f = (v) => (Vs - v) / tau, k1 = f(V), k2 = f(V + h / 2 * k1), k3 = f(V + h / 2 * k2), k4 = f(V + h * k3); V += h / 6 * (k1 + 2 * k2 + 2 * k3 + k4); Vt[st] = V; }
  const I = (st) => ((st <= mi ? 1 : 0) - Vt[st]) / tau; /* courant (R = tau, C = 1) ; au pas mi la pile est encore branchee */
  let fournie = 0, dissipee = 0; for (let st = 1; st <= mi; st++) { fournie += h * (I(st - 1) + I(st)) / 2; dissipee += h * tau * (I(st - 1) ** 2 + I(st) ** 2) / 2; }
  const VT = Vt[mi], gardee = VT * VT / 2;
  let tDemi = NaN; for (let st = 1; st <= mi; st++) if (Vt[st - 1] < 0.5 && Vt[st] >= 0.5) { tDemi = (st - 1 + (0.5 - Vt[st - 1]) / (Vt[st] - Vt[st - 1])) * h; break; }
  const iTau = Math.round(tau / h);
  const images = Math.min(2, n), debuts = [0, Math.floor(n / 2)].slice(0, images), brut = new Float64Array(n * 3);
  for (let f = 0; f < images; f++) { const d0 = debuts[f], c = (f + 1 < images ? debuts[f + 1] : n) - d0;
    for (let r = 0; r < c; r++) { const st = c === 1 ? 0 : Math.round(r * pas / (c - 1)), o = 3 * (d0 + r); brut[o] = st * h; brut[o + 1] = f ? tau * I(st) : Vt[st]; brut[o + 2] = f; } }
  return { D: 3, brut, nuage: true, courbes: { images, debuts, tailles: debuts.map((d, k) => (k + 1 < images ? debuts[k + 1] : n) - d) }, unite: 'sans objet (circuit lineaire)', invariants: {
    tensionTau: { mesure: Vt[iTau], formule: 1 - expNegD(1), note: 'voltage after one time constant against 1 - 1/e' },
    demiCharge: { mesure: tDemi / tau, formule: lnD(2), note: 'time to half charge, in units of tau, against ln 2' },
    energieFournie: { mesure: fournie, formule: VT, note: 'energy given by the battery during the charge against C V(T) (with V(T) measured)' },
    energiePerdue: { mesure: dissipee, formule: VT - gardee, gardee, note: 'energy turned into heat in the resistor against C V - C V^2/2 : the same as the energy kept in the capacitor for a full charge, whatever R' } } };
}

export const COLONNES = Object.freeze({
  lignesChamp: { colonnes: ['x (charges at -1 and +1)', 'y', 'field line number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  circuitRC: { colonnes: ['time t (charge until 6, then discharge)', 'voltage V (curve 0) or R times current (curve 1)', 'which curve (0 = voltage, 1 = current)'], memeLongueur: [], autres: [0, 1, 2] },
});

export const SYSTEMES = Object.freeze([
  { id: 'lignesChamp', nom: 'Field lines of two charges', science: 'Electrostatics', D: 3, nuage: true, params: { charge: -1 },
    bornes: { charge: [-3, -0.25] },
    phrase: 'A visualisation of the electric field lines leaving a positive charge (left) and ending on a negative one (right), traced step by step along the field (in 2-D). Each line arrives at the angle set by the flux, q1 theta = |q2| phi, exactly; if the negative charge is weaker, a share 1 - |q2|/q1 of the lines has nowhere to land and escapes to infinity.' },
  { id: 'circuitRC', nom: 'Charging a capacitor (RC circuit)', science: 'Electricity', D: 3, nuage: true, params: { tau: 1 },
    bornes: { tau: [0.2, 5] },
    phrase: 'A visualisation of a capacitor charged by a battery through a resistor, then discharged: the voltage climbs as 1 - e^(-t/tau) and the current dies away. A surprise checked on the run: the resistor turns into heat exactly as much energy as the capacitor keeps, half of what the battery gives, whatever the resistance.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { lignesChamp: [], circuitRC: [] };
const FONCTIONS = { lignesChamp, circuitRC };
const parId = (id) => { const s = SYSTEMES.find((x) => x.id === id); if (!s) throw new Error('systeme inconnu: ' + id); return s; };

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
  if (r.courbes) o.courbes = r.courbes;
  return o;
}
