// tam-mecanique.js -- TAM, mecanique, chaque systeme une simulation honnete comparee a une formule EXACTE.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-biologie.js : SYSTEMES, ENTIERS, COLONNES, SOURCES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun hasard.
// DETERMINISME : aucune fonction transcendante native. sin = celui du moteur ; atan ici avec + - * / et Math.sqrt.
// REGLE DU PROJET : aucune valeur publiee sans source lue. Ici AUCUNE : masses et raideurs sans dimension ; chaque formule comparee est
//   derivee dans le commentaire de sa section ; SOURCES est vide expres. (pi n est ECRIT nulle part comme chiffres : il est compare via
//   la formule du nombre de chocs, et Math.PI sert seulement d angle.)
// Les systemes :
//   billardPi    : deux blocs et un mur, chocs elastiques ; nombre de chocs = ceil(pi / theta) - 1, theta = atan(sqrt(m/M)) ; pour
//                  M/m = 100^k il ecrit les k+1 premiers chiffres de pi.
//   modesNormaux : une chaine de N masses et ressorts ; pulsations exactes 2 sin(j pi / (2 (N + 1))) ; un mode excite seul le reste.
//   paraboleTir  : tirs depuis une hauteur h ; meilleur angle atan(1 / sqrt(1 + 2 h)), portee sqrt(1 + 2 h), parabole de surete.
import { sinD, cosD } from './tam-moteur.js';

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
function decouper(n, images) { const d = []; for (let k = 0; k < images; k++) d.push(Math.floor(k * n / images)); return d; }
function filmDe(debuts, n) {
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}

// ---------- 1 : le billard qui compte pi ----------
// Petit bloc m = 1 entre un mur (x = 0) et un gros bloc M = 100^k qui arrive vers la gauche a la vitesse 1. Chocs elastiques (energie et
//   quantite de mouvement conservees) entre blocs, rebond parfait au mur. Simulation par EVENEMENTS (aucun pas de temps) : on applique
//   les chocs dans l ordre jusqu a ce que plus aucun ne puisse arriver (gros bloc qui s eloigne plus vite que le petit).
// Exact (derive ici) : en coordonnees (sqrt(M) V, sqrt(m) v) l energie est un CERCLE ; un choc entre blocs est une reflexion par rapport a
//   une droite inclinee de theta = atan(sqrt(m/M)), un choc au mur change le signe de v : deux reflexions = une rotation de 2 theta.
//   On s arrete quand l angle total depasse pi : nombre de chocs = ceil(pi / theta) - 1. Pour M/m = 100^k, theta ~ 10^-k et ce nombre
//   ecrit les k + 1 premiers chiffres de pi.
// Dessin : l etat apres chaque choc dans le plan (sqrt(M) V, sqrt(m) v) : des points SUR le cercle de l energie (echantillonnes s ils sont
//   plus nombreux que les lignes) ; 3e colonne : numero du choc.
function billardPi(P, n) {
  const k = P.chiffres, M = 100 ** k, m = 1, sM = Math.sqrt(M);
  let V = -1, v = 0, chocs = 0, pireE = 0;
  const etats = [[sM * V, v, 0]], E0 = M * V * V + m * v * v;
  /* banc du 03/11 : un choc qui ne conserve pas l energie peut ne jamais finir (le banc a tourne sans fin sur un mutant) : plafond 2 000 000
   *   chocs, au-dela le compte est rendu NON conclu (le vrai maximum ici est 314159) */
  let plafond = false;
  for (;;) {
    if (chocs >= 2000000) { plafond = true; break; }
    if (V < v) { /* le gros rattrape le petit (ou le petit fonce vers lui) : choc entre blocs */
      const V2 = ((M - m) * V + 2 * m * v) / (M + m), v2 = ((m - M) * v + 2 * M * V) / (M + m); V = V2; v = v2;
    } else if (v < 0) v = -v; /* le petit va vers le mur */
    else break;
    chocs++; pireE = Math.max(pireE, Math.abs(M * V * V + m * v * v - E0) / E0);
    if (etats.length < 200000) etats.push([sM * V, v, chocs]);
  }
  const theta = atanD(Math.sqrt(m / M)), formule = Math.ceil(PI / theta) - 1;
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const e = etats[Math.floor(l * etats.length / n)], o = 3 * l; brut[o] = e[0]; brut[o + 1] = e[1]; brut[o + 2] = e[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (chocs elastiques)', invariants: {
    chocs: { mesure: plafond ? NaN : chocs, ...(plafond ? { absente: 'more than 2 000 000 collisions: stopped' } : {}), formule, rapportMasses: M, angle: theta, note: 'number of collisions counted event by event against ceil(pi / theta) - 1, theta = atan(sqrt(m / M)) : for a mass ratio 100^k it spells the first k + 1 digits of pi' },
    energie: { debut: E0, fin: M * V * V + m * v * v, derive: pireE * E0, note: 'kinetic energy, the same after every collision (witness ; the states sit on one circle)' } } };
}

// ---------- 2 : les modes propres d une chaine de ressorts ----------
// N masses m = 1 reliees par N + 1 ressorts k = 1, extremites fixes : x_i'' = x_(i+1) - 2 x_i + x_(i-1). Exact (derive ici) : modes
//   x_i = sin(i j pi / (N + 1)) cos(omega_j t), omega_j = 2 sin(j pi / (2 (N + 1))), j = 1..N. On lance le mode j SEUL (forme exacte,
//   au repos) : la chaine y reste et oscille a omega_j. Integration de Verlet (symplectique) au pas h = 0.01.
// Mesures : periode lue aux passages par zero de l amplitude projetee sur le mode, contre 2 pi / omega_j (l ecart du schema est
//   O((omega h)^2), environ 1e-5) ; part de l energie restee dans le mode j (temoin, 1 a l arrondi pres en lineaire).
// Dessin : un film de 8 instants sur une periode ; chaque image = les N masses (numero, deplacement) ; 3e colonne : le temps.
const MODES_IMAGES = 8;
function modesNormaux(P, n) {
  const N = P.masses, j = Math.min(P.mode, N), h = 0.01, om = 2 * sinD(j * PI / (2 * (N + 1))), Tth = 2 * PI / om, tot = 6 * Tth, pas = Math.round(tot / h);
  const forme = Array.from({ length: N }, (_, i) => sinD((i + 1) * j * PI / (N + 1)));
  let x = forme.slice(), vit = new Array(N).fill(0);
  const acc = (xx) => xx.map((xi, i) => (i + 1 < N ? xx[i + 1] : 0) - 2 * xi + (i > 0 ? xx[i - 1] : 0));
  let a = acc(x);
  const norme = forme.reduce((s, f) => s + f * f, 0), proj = (xx) => xx.reduce((s, xi, i) => s + xi * forme[i], 0) / norme;
  const energieMode = (xx, vv) => { /* energie dans le mode j : (q'^2 + omega^2 q^2) / 2 avec q, q' projetes */ const q = proj(xx), qp = proj(vv); return (qp * qp + om * om * q * q) / 2 * norme; };
  const energieTot = (xx, vv) => { let e = 0; for (let i = 0; i < N; i++) e += vv[i] * vv[i] / 2; for (let i = 0; i <= N; i++) { const d = (i < N ? xx[i] : 0) - (i > 0 ? xx[i - 1] : 0); e += d * d / 2; } return e; };
  const images = Math.min(MODES_IMAGES, n), film = filmDe(decouper(n, images), n), brut = new Float64Array(n * 3);
  const instant = (f) => (images === 1 ? 0 : Math.round(f * (Tth / h) / (images - 1)));
  const ecrire = (f, st) => { const d0 = film.debuts[f], c = film.tailles[f]; for (let r = 0; r < c; r++) { const i = c === 1 ? 0 : Math.round(r * (N + 1) / (c - 1)), o = 3 * (d0 + r); brut[o] = i; brut[o + 1] = i === 0 || i === N + 1 ? 0 : x[i - 1]; brut[o + 2] = st * h; } };
  let f = 0; while (f < images && instant(f) === 0) { ecrire(f, 0); f++; }
  let qAvant = proj(x), passages = [], pireFuite = 0;
  const E0 = energieTot(x, vit);
  for (let st = 1; st <= pas; st++) {
    vit = vit.map((vi, i) => vi + h / 2 * a[i]); x = x.map((xi, i) => xi + h * vit[i]); a = acc(x); vit = vit.map((vi, i) => vi + h / 2 * a[i]);
    const q = proj(x); if (qAvant > 0 && q <= 0) passages.push((st - 1 + qAvant / (qAvant - q)) * h); qAvant = q;
    if (st % 50 === 0) pireFuite = Math.max(pireFuite, Math.abs(1 - energieMode(x, vit) / energieTot(x, vit)));
    while (f < images && instant(f) === st) { ecrire(f, st); f++; }
  }
  const Tm = passages.length >= 2 ? (passages[passages.length - 1] - passages[0]) / (passages.length - 1) : NaN;
  return { D: 3, brut, film, unite: 'sans objet (oscillations lineaires)', invariants: {
    periodeMode: { mesure: Tm, formule: Tth, mode: j, masses: N, pulsation: om, note: 'period of mode j measured on its downward zero crossings against 2 pi / omega_j, omega_j = 2 sin(j pi / (2 (N + 1))) (the Verlet step adds about (omega h)^2 / 24)' },
    resteDansLeMode: { mesure: pireFuite, formule: 0, note: 'largest share of the energy found OUTSIDE mode j during the run (witness : a linear chain keeps its modes apart)' },
    energie: { debut: E0, fin: energieTot(x, vit), derive: Math.abs(energieTot(x, vit) - E0), note: 'total energy (Verlet keeps it within a small bounded wobble)' } } };
}

// ---------- 3 : le tir parabolique (et la parabole de surete) ----------
// Projectiles lances a la vitesse v = 1 (g = 1) depuis la hauteur h, sous des angles de 0 a 90 degres. Integration de Verlet au pas 0.001
//   (exacte pour un champ uniforme : l acceleration est constante), passage au sol interpole.
// Exact (derive ici) : portee R(theta) = cos theta (sin theta + sqrt(sin^2 theta + 2 h)) ; son maximum est atteint pour
//   tan theta* = 1 / sqrt(1 + 2 h) (45 degres seulement si h = 0) et vaut R* = sqrt(1 + 2 h). Toutes les trajectoires restent sous la
//   parabole de surete y = h + 1/2 - x^2 / 2 et la touchent chacune en un point (enveloppe de la famille).
// Mesures : angle et portee maximaux sur un balayage de 2001 angles (resolution 0.045 degre) ; plus grand depassement de l enveloppe par
//   un point de trajectoire (doit etre <= 0 a l arrondi pres) et plus petit ecart (le contact).
// Dessin : un eventail de trajectoires (une sur dix des angles dessines) et l enveloppe (3e colonne 0) ; 3e colonne : angle en degres.
function paraboleTir(P, n) {
  const h = P.hauteur, A = P.angles, dt = 0.001, env = (x) => h + 0.5 - x * x / 2;
  const portee = (th) => { let x = 0, y = h, vx = cosD(th), vy = sinD(th), pts = []; for (let s = 0; s < 200000; s++) { pts.push([x, y]); const vy2 = vy - dt; const y2 = y + dt * (vy + vy2) / 2, x2 = x + dt * vx; if (y2 < 0) { const f = y / (y - y2); pts.push([x + f * (x2 - x), 0]); return { R: x + f * (x2 - x), pts }; } x = x2; y = y2; vy = vy2; } return { R: NaN, pts }; };
  let best = -1, thBest = NaN;
  for (let i = 0; i <= 2000; i++) { const th = i * (PI / 2) / 2000, r = portee(th).R; if (r > best) { best = r; thBest = th; } }
  const trajs = []; let depasse = -Infinity, contactMin = Infinity;
  for (let a = 0; a < A; a++) { const th = (a + 0.5) * (PI / 2) / A, t = portee(th); trajs.push({ th, pts: t.pts });
    let cMin = Infinity; for (const [x, y] of t.pts) { const d = y - env(x); if (d > depasse) depasse = d; if (-d < cMin) cMin = -d; } contactMin = Math.min(contactMin, cMin); }
  const thTh = atanD(1 / Math.sqrt(1 + 2 * h)), RTh = Math.sqrt(1 + 2 * h);
  /* dessin : l enveloppe (100 points) puis les trajectoires */
  const brut = new Float64Array(n * 3), nEnv = Math.min(100, Math.floor(n / 4)); let l = 0;
  for (let q = 0; q < nEnv; q++) { const x = q * RTh / (nEnv - 1 || 1), o = 3 * l++; brut[o] = x; brut[o + 1] = env(x); brut[o + 2] = 0; }
  const par = Math.max(2, Math.floor((n - nEnv) / trajs.length));
  for (let a = 0; a < trajs.length && l < n; a++) { const pts = trajs[a].pts, nb = a === trajs.length - 1 ? n - l : par;
    for (let q = 0; q < nb && l < n; q++) { const p = pts[nb === 1 ? 0 : Math.round(q * (pts.length - 1) / (nb - 1))], o = 3 * l++; brut[o] = p[0]; brut[o + 1] = p[1]; brut[o + 2] = trajs[a].th * 180 / PI; } }
  const deg = 180 / PI;
  return { D: 3, brut, nuage: true, unite: 'sans objet (champ uniforme)', invariants: {
    angleOptimal: { mesure: thBest * deg, formule: thTh * deg, resolution: 90 / 2000, hauteurTir: h, note: 'angle (degrees) of the longest throw on a scan of 2001 angles against atan(1 / sqrt(1 + 2 h)) : 45 only when thrown from the ground' },
    porteeMax: { mesure: best, formule: RTh, note: 'longest range against sqrt(1 + 2 h) (v = g = 1)' },
    enveloppe: { mesure: Math.max(0, depasse), formule: 0, contact: contactMin, note: 'largest amount by which any trajectory point rises above the safety parabola y = h + 1/2 - x^2/2 (none: every throw stays under it and touches it once)' } } };
}

export const COLONNES = Object.freeze({
  billardPi: { colonnes: ['sqrt(M) times the big block\'s speed', 'sqrt(m) times the small block\'s speed', 'collision number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  modesNormaux: { colonnes: ['mass number along the chain (0 and N + 1 are the fixed ends)', 'displacement', 'time t'], memeLongueur: [], autres: [0, 1, 2] },
  paraboleTir: { colonnes: ['distance x', 'height y', 'launch angle in degrees (label ; 0 = the safety parabola)'], memeLongueur: [[0, 1]], autres: [2] },
});

export const SYSTEMES = Object.freeze([
  { id: 'billardPi', nom: 'Colliding blocks that count pi', science: 'Classical mechanics', D: 3, nuage: true, params: { chiffres: 2 },
    bornes: { chiffres: [0, 5] },
    phrase: 'A visualisation of two blocks and a wall: a heavy block (100^k times heavier) slides into a light one, which bounces between it and the wall. Counted event by event, the number of collisions is exactly ceil(pi / theta) - 1 with theta = atan(sqrt(m / M)): 3, 31, 314, 3141... the digits of pi. Each state after a collision is drawn: they all sit on one circle, the circle of the kinetic energy.' },
  { id: 'modesNormaux', nom: 'Normal modes of a chain of springs', science: 'Classical mechanics', D: 3, params: { masses: 6, mode: 2 },
    bornes: { masses: [2, 16], mode: [1, 16] },
    phrase: 'A visualisation of a chain of masses joined by springs, started in one of its normal modes: every mass swings in step, frame by frame over one period, and the chain stays in that mode. The period is compared with the exact 2 pi / omega_j, omega_j = 2 sin(j pi / (2 (N + 1))): higher modes, more nodes, faster.' },
  { id: 'paraboleTir', nom: 'The best angle to throw (projectiles and the safety parabola)', science: 'Classical mechanics', D: 3, nuage: true, params: { hauteur: 0, angles: 18 },
    bornes: { hauteur: [0, 2], angles: [5, 40] },
    phrase: 'A visualisation of stones thrown at the same speed under every angle from a height h. From the ground the longest throw is at 45 degrees; from higher up it is flatter, exactly atan(1 / sqrt(1 + 2 h)), and reaches sqrt(1 + 2 h). Every path stays under one parabola, the safety parabola, and touches it once.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { billardPi: ['chiffres'], modesNormaux: ['masses', 'mode'], paraboleTir: ['angles'] };
const FONCTIONS = { billardPi, modesNormaux, paraboleTir };
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
  return o;
}
