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
const acosD = (x) => PI / 2 - atanD(x / Math.sqrt(Math.max(1e-300, 1 - x * x)));
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

// ---------- 4 : le pendule a grande amplitude ----------
// theta'' = -sin(theta) (g / L = 1), lache au repos a theta0. RK4 au pas 0.001 ; periode lue aux passages descendants de theta par 0.
// Exact (Gauss, derive de l integrale elliptique complete K) : T = 2 pi / AGM(1, cos(theta0 / 2)), AGM = moyenne arithmetico-geometrique
//   (a, b) -> ((a + b)/2, sqrt(a b)) jusqu a egalite : racines carrees seulement, deterministe. Petites oscillations : 2 pi (APPROCHE,
//   affichee a cote : l ecart grandit avec l amplitude et diverge vers 180 degres).
// Dessin : un film de 6 amplitudes (theta0 / 6 ... theta0) : la courbe de phase (theta, theta') de chacune, emboitees ; 3e colonne : temps.
const PENDULE_IMAGES = 6;
function agm(a, b) { for (let i = 0; i < 60 && Math.abs(a - b) > 1e-16 * a; i++) { const m = (a + b) / 2; b = Math.sqrt(a * b); a = m; } return (a + b) / 2; }
function penduleAmplitude(P, n) {
  const th0 = P.lacher * PI / 180, h = 0.001, images = Math.min(PENDULE_IMAGES, n), film = filmDe(decouper(n, images), n), brut = new Float64Array(n * 3);
  const res = [];
  for (let f = 0; f < images; f++) {
    const a0 = images === 1 ? th0 : th0 * (f + 1) / images, Tth = 2 * PI / agm(1, cosD(a0 / 2)), tot = 3 * Tth, pas = Math.round(tot / h);
    /* banc du 03/11 : un mutant (AGM de cos theta0) donnait a 90 degres une periode de 1e19 et 1e22 pas (le banc a tourne sans fin) : une
     *   periode non finie ou au-dela de 500 n est pas integree, elle est rendue non mesuree */
    if (!(Number.isFinite(Tth) && Tth > 0 && Tth < 500)) { const d0 = film.debuts[f], c = film.tailles[f]; for (let r = 0; r < c; r++) { const o = 3 * (d0 + r); brut[o] = a0; brut[o + 1] = 0; brut[o + 2] = 0; } res.push({ a0, Tth, Tm: NaN, Emax: 0 }); continue; }
    let th = a0, w = 0, avant = th, passages = [], Emax = 0; const E0 = -cosD(a0);
    const d0 = film.debuts[f], c = film.tailles[f]; let ligne = 0;
    const ecrire = (st) => { while (ligne < c && Math.round(ligne * Math.round(Tth / h) / (c - 1 || 1)) === st) { const o = 3 * (d0 + ligne); brut[o] = th; brut[o + 1] = w; brut[o + 2] = st * h; ligne++; } };
    ecrire(0);
    for (let st = 1; st <= pas; st++) {
      const k1t = w, k1w = -sinD(th), k2t = w + h / 2 * k1w, k2w = -sinD(th + h / 2 * k1t), k3t = w + h / 2 * k2w, k3w = -sinD(th + h / 2 * k2t), k4t = w + h * k3w, k4w = -sinD(th + h * k3t);
      th += h / 6 * (k1t + 2 * k2t + 2 * k3t + k4t); w += h / 6 * (k1w + 2 * k2w + 2 * k3w + k4w);
      if (avant > 0 && th <= 0) passages.push((st - 1 + avant / (avant - th)) * h); avant = th;
      Emax = Math.max(Emax, Math.abs(w * w / 2 - cosD(th) - E0));
      ecrire(st);
    }
    while (ligne < c) { const o = 3 * (d0 + ligne); brut[o] = th; brut[o + 1] = w; brut[o + 2] = pas * h; ligne++; }
    const Tm = passages.length >= 2 ? (passages[passages.length - 1] - passages[0]) / (passages.length - 1) : NaN;
    res.push({ a0, Tth, Tm, Emax });
  }
  const m = res[res.length - 1]; let pire = 0; for (const r of res) pire = Math.max(pire, Math.abs(r.Tm / r.Tth - 1));
  return { D: 3, brut, film, unite: 'sans objet (pendule non lineaire)', invariants: {
    periode: { mesure: m.Tm, formule: m.Tth, petitesOscillations: 2 * PI, amplitudeDegres: P.lacher, note: 'period at theta0 measured on the swings against 2 pi / AGM(1, cos(theta0/2)) (exact, Gauss) ; the small-swing value 2 pi is shown beside it' },
    periodesFilm: { pireEcartRelatif: pire, amplitudes: res.length, note: 'worst relative gap over the ' + res.length + ' amplitudes drawn (theta0/6 ... theta0)' },
    energie: { debut: -cosD(th0), fin: -cosD(th0), derive: m.Emax, note: 'energy theta\'^2/2 - cos(theta), the same along the swing (witness ; RK4 drift)' } } };
}

// ---------- 5 : les phases de la Lune ----------
// Une sphere vue depuis la Terre (direction e = (0, 0, 1)), eclairee par le Soleil dans la direction s = (sin phi, 0, cos phi) : phi = angle
//   de phase (0 = pleine lune, 180 = nouvelle lune). Un point n de la sphere est VU si n.e > 0 et ECLAIRE si n.s > 0 (geometrie seule).
// Exact (derive ici) : la part eclairee du disque vu vaut (1 + cos phi) / 2 (aire projetee entre le limbe et le terminateur, une demi-ellipse).
// Mesure : on compte les points d une grille fine du disque (1001 x 1001) dont le point de sphere est eclaire, sur ceux du disque.
// Dessin : un film de 8 phases (phi de 0 a 180 degres, ou jusqu a phi) : les points ECLAIRES du disque ; 3e colonne : la phase en degres.
const LUNE_IMAGES = 8;
function phasesLune(P, n) {
  const phiMax = P.anglePhase * PI / 180, images = Math.min(LUNE_IMAGES, n), film = filmDe(decouper(n, images), n), brut = new Float64Array(n * 3);
  const part = (phi) => { const sx = sinD(phi), sz = cosD(phi), G = 1001; let tot = 0, lit = 0;
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) { const x = -1 + 2 * (i + 0.5) / G, y = -1 + 2 * (j + 0.5) / G, r2 = x * x + y * y; if (r2 >= 1) continue; tot++; if (x * sx + Math.sqrt(1 - r2) * sz > 0) lit++; }
    return lit / tot; };
  const mesure = part(phiMax), formule = Math.max(0, (1 + cosD(phiMax)) / 2); /* cos 180 = -1 + arrondi : jamais une part negative */
  for (let f = 0; f < images; f++) { const phi = images === 1 ? phiMax : f * phiMax / (images - 1), /* banc du 03/11 : les images allaient TOUJOURS de 0 a 180 (curseur muet) : de la pleine lune a la phase choisie */ sx = sinD(phi), sz = cosD(phi), d0 = film.debuts[f], c = film.tailles[f];
    /* points eclaires : on parcourt une spirale reguliere du disque et on garde les eclaires ; si trop peu, on les repete */
    const pts = []; const M = 4000; for (let q = 0; q < M; q++) { const r = Math.sqrt((q + 0.5) / M), a = q * 2.399963229728653, x = r * cosD(a), y = r * sinD(a); if (x * sx + Math.sqrt(Math.max(0, 1 - r * r)) * sz > 0) pts.push([x, y]); }
    for (let r = 0; r < c; r++) { const p = pts.length ? pts[Math.floor(r * pts.length / c)] : [0, 0], o = 3 * (d0 + r); brut[o] = p[0]; brut[o + 1] = p[1]; brut[o + 2] = phi * 180 / PI; } }
  return { D: 3, brut, film, nuage: true, unite: 'sans objet (geometrie)', invariants: {
    partEclairee: { mesure, formule, phaseDegres: P.anglePhase, note: 'share of the visible disc that is lit, counted on a 1001 x 1001 grid from 3-D geometry (seen if n.e > 0, lit if n.s > 0), against (1 + cos phi) / 2 ; the grid adds a gap of about 1e-3' } } };
}

// ---------- 6 : la duree du jour au fil de l annee ----------
// Une planete a orbite circulaire, axe incline de epsilon (curseur), observateur a la latitude phi (curseur) ; jour 0 = equinoxe.
//   Declinaison du Soleil le jour d : sin delta = sin epsilon sin(2 pi d / 365) (orbite circulaire, mouvement uniforme).
// Mesure (geometrie seule) : chaque jour, la verticale du lieu tourne en 24 h ; on compte les minutes ou elle fait un angle aigu avec la
//   direction du Soleil (Soleil ponctuel, sans refraction), 1440 pas par jour.
// Exact (derive ici) : le Soleil est au-dessus de l horizon tant que l angle horaire |H| < H0 avec cos H0 = -tan phi tan delta ; duree
//   = 24 H0 / pi heures ; si -tan phi tan delta < -1 : jour polaire (24 h), > 1 : nuit polaire (0 h). Aux equinoxes : 12 h partout.
// Dessin : la duree du jour sur l annee (vue de face) ; 3e colonne : 0 = mesure, 1 = formule (deux courbes superposees).
function dureeJour(P, n) {
  const phi = P.latitude * PI / 180, eps = P.inclinaison * PI / 180, J = 365, M = 1440;
  const se = sinD(eps), cp = cosD(phi), sp = sinD(phi);
  const jours = []; let pire = 0;
  for (let d = 0; d < J; d++) {
    const sd = se * sinD(2 * PI * d / J), cd = Math.sqrt(1 - sd * sd);
    let n0 = 0; for (let m = 0; m < M; m++) { const h = 2 * PI * (m + 0.5) / M; if (cp * cosD(h) * cd + sp * sd > 0) n0++; }
    const mes = 24 * n0 / M, x = -(sp / cp) * (sd / cd), th = x <= -1 ? 24 : x >= 1 ? 0 : 24 * acosD(x) / PI;
    pire = Math.max(pire, Math.abs(mes - th)); jours.push([d, mes, th]);
  }
  const brut = new Float64Array(n * 3), moitie = Math.floor(n / 2);
  for (let l = 0; l < n; l++) { const c = l < moitie ? 0 : 1, k = c ? l - moitie : l, m = c ? n - moitie : moitie, j = jours[m === 1 ? 0 : Math.round(k * (J - 1) / (m - 1))], o = 3 * l; brut[o] = j[0]; brut[o + 1] = c ? j[2] : j[1]; brut[o + 2] = c; }
  const solstice = jours[Math.round(J / 4)], equinoxe = jours[0];
  return { D: 3, brut, nuage: true, unite: 'sans objet (geometrie du ciel)', invariants: {
    dureeJours: { mesure: pire * 60, formule: 0, pasMinutes: 1440 / M, jours: J, note: 'worst gap in minutes, over the year, between the daylight counted minute by minute and 24 H0 / pi with cos H0 = -tan(latitude) tan(declination) ; the count has a 1-minute step' },
    equinoxe: { mesure: equinoxe[1], formule: 12, note: 'daylight at the equinox (hours) against 12, at every latitude' },
    solstice: { mesure: solstice[1], formule: solstice[2], note: 'longest daylight (hours) at the June solstice against the formula (24 = midnight sun, 0 = polar night)' } } };
}

// ---------- 7 : la course des objets qui roulent ----------
// Plan incline d angle theta (curseur), longueur 10, g = 1 ; quatre objets lacher ensemble : un bloc (sans rotation, k = 0), une sphere
//   pleine (k = I / (m r^2) = 2/5), un cylindre plein (1/2), un anneau (1). Frottement mu (curseur).
// Dynamique (decidee a chaque pas, pas de formule finale dans la simulation) : pour rouler sans glisser il faut une force de frottement
//   k/(1+k) m g sin theta ; si mu m g cos theta la fournit, l objet roule (a = g sin theta / (1 + k)) ; sinon il glisse
//   (a = g (sin theta - mu cos theta), sa rotation accelere a part). Le bloc glisse toujours (avec frottement s il y en a).
// Exact (derive ici) : en roulement, temps d arrivee sqrt(2 L (1 + k) / (g sin theta)) : l ordre sphere, cylindre, anneau ne depend ni
//   de la masse, ni du rayon, ni de l angle ; seuil de roulement mu_min = k/(1 + k) tan theta. Energie : la hauteur perdue = energie de
//   translation + de rotation + chaleur de glissement (temoin).
// Dessin : distance parcourue contre le temps, quatre courbes (vue de face) ; 3e colonne : 0 bloc, 1 sphere, 2 cylindre, 3 anneau.
const ROULANTS = [['block', 0], ['sphere', 0.4], ['cylinder', 0.5], ['ring', 1]];
function courseRoulante(P, n) {
  const th = P.pente * PI / 180, mu = P.frottement, L = 10, g = 1, h = 0.0005, st = sinD(th), ct = cosD(th);
  const res = ROULANTS.map(([nom, k]) => {
    let x = 0, v = 0, w = 0, t = 0, chaleur = 0; const traj = [[0, 0]];
    while (x < L && t < 1000) {
      let a, alpha;
      const fReq = k / (1 + k) * g * st, fMax = mu * g * ct;
      if (k > 0 && fReq <= fMax + 1e-15) { a = g * st / (1 + k); alpha = a; }
      else { a = g * st - (mu > 0 ? mu * g * ct : 0); if (a < 0) a = 0; alpha = k > 0 ? mu * g * ct / k : 0; }
      if (a <= 0 && v <= 0) break; /* le frottement retient l objet : il ne part pas */
      const v2 = v + a * h, x2 = x + h * (v + v2) / 2;
      /* chaleur de glissement : force mu g cos theta fois la vitesse de glissement v - w, au point milieu du pas (exacte : v - w lineaire) */
      const glisse = a !== alpha || k === 0, chauffe = (dt) => { if (glisse && mu > 0) chaleur += mu * g * ct * Math.abs(v + a * dt / 2 - (w + alpha * dt / 2)) * dt; };
      if (x2 >= L) { const dt = h * (L - x) / (x2 - x); chauffe(dt); v += a * dt; w += alpha * dt; t += dt; x = L; traj.push([t, L]); break; }
      chauffe(h); x = x2; v = v2; w += alpha * h; t += h; if (traj.length < 4000 && Math.round(t / h) % 20 === 0) traj.push([t, x]);
    }
    const Tr = Math.sqrt(2 * L * (1 + k) / (g * st)), aG = g * st - mu * g * ct, Tg = aG > 0 ? Math.sqrt(2 * L / aG) : Infinity;
    const muMin = k / (1 + k) * st / ct, formule = k > 0 && mu >= muMin ? Tr : Tg;
    const E = 0.5 * v * v + 0.5 * k * w * w + chaleur, Epot = g * x * st;
    return { nom, k, T: x >= L ? t : NaN, formule, roule: k > 0 && mu >= muMin, muMin, ecartEnergie: Math.abs(E - Epot), traj };
  });
  const brut = new Float64Array(n * 3), par = Math.floor(n / 4); let l = 0;
  for (let b = 0; b < 4; b++) { const tr = res[b].traj, nb = b === 3 ? n - l : par; for (let q = 0; q < nb && l < n; q++) { const p = tr[nb === 1 ? 0 : Math.round(q * (tr.length - 1) / (nb - 1))], o = 3 * l++; brut[o] = p[0]; brut[o + 1] = p[1]; brut[o + 2] = b; } }
  const inv = {};
  for (const r of res) inv['arrivee' + r.nom[0].toUpperCase() + r.nom.slice(1)] = { mesure: r.T, formule: r.formule, ...(Number.isFinite(r.formule) ? {} : { absente: 'friction holds it: it does not start' }),
    regime: r.roule ? 1 : 0, seuilRoulement: r.muMin, note: r.nom + ' : arrival time against ' + (r.roule ? 'sqrt(2 L (1 + k) / (g sin theta)), rolling (k = ' + r.k + ')' : 'sqrt(2 L / (g (sin theta - mu cos theta))), sliding') };
  let pireE = 0; for (const r of res) pireE = Math.max(pireE, r.ecartEnergie);
  inv.energieRoulants = { debut: g * L * st, fin: g * L * st, derive: pireE, note: 'height lost = kinetic energy (moving + spinning) + heat from sliding, for every body (witness)' };
  return { D: 3, brut, nuage: true, unite: 'sans objet (mecanique du solide)', invariants: inv };
}

export const COLONNES = Object.freeze({
  billardPi: { colonnes: ['sqrt(M) times the big block\'s speed', 'sqrt(m) times the small block\'s speed', 'collision number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  modesNormaux: { colonnes: ['mass number along the chain (0 and N + 1 are the fixed ends)', 'displacement', 'time t'], memeLongueur: [], autres: [0, 1, 2] },
  penduleAmplitude: { colonnes: ['angle theta (radians)', 'angular speed', 'time t'], memeLongueur: [], autres: [0, 1, 2] },
  phasesLune: { colonnes: ['x on the Moon\'s disc', 'y on the Moon\'s disc', 'phase angle in degrees (0 = full Moon)'], memeLongueur: [[0, 1]], autres: [2] },
  dureeJour: { colonnes: ['day of the year (0 = equinox)', 'hours of daylight', 'curve (0 = counted minute by minute, 1 = formula)'], memeLongueur: [], autres: [0, 1, 2] },
  courseRoulante: { colonnes: ['time t', 'distance down the slope', 'body (0 block, 1 sphere, 2 cylinder, 3 ring)'], memeLongueur: [], autres: [0, 1, 2] },
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
  { id: 'penduleAmplitude', nom: 'A pendulum swinging high (the exact period)', science: 'Classical mechanics', D: 3, params: { lacher: 120 },
    bornes: { lacher: [5, 175] },
    phrase: 'A visualisation of a pendulum released from ever larger angles, drawn as nested loops of angle against speed. Its period is not 2 pi once the swing is wide: it is exactly 2 pi / AGM(1, cos(theta0 / 2)), the arithmetic-geometric mean of Gauss, and it grows without bound towards 180 degrees.' },
  { id: 'phasesLune', nom: 'The phases of the Moon', science: 'Astronomy', D: 3, nuage: true, params: { anglePhase: 180 },
    bornes: { anglePhase: [10, 180] },
    phrase: 'A visualisation of the Moon\'s phases from full to new: a sphere lit by the Sun, seen from the Earth, frame by frame. Which part looks lit comes from 3-D geometry alone (a point is seen if it faces us, lit if it faces the Sun); counted on a fine grid, the lit share is (1 + cos phi) / 2.' },
  { id: 'dureeJour', nom: 'How long the day lasts through the year', science: 'Astronomy', D: 3, nuage: true, params: { latitude: 50, inclinaison: 25 },
    bornes: { latitude: [-89, 89], inclinaison: [0, 45] },
    phrase: 'A visualisation of the length of daylight through a year on a tilted planet, at the latitude chosen: counted minute by minute from geometry, and drawn with the exact formula cos H0 = -tan(latitude) tan(declination) on top. Twelve hours everywhere at the equinoxes; beyond the polar circle, midnight sun and polar night.' },
  { id: 'courseRoulante', nom: 'The rolling race (sphere, cylinder, ring)', science: 'Classical mechanics', D: 3, nuage: true, params: { pente: 20, frottement: 0.15 },
    bornes: { pente: [5, 60], frottement: [0, 1] },
    phrase: 'A visualisation of four bodies let go together down a slope: a block, a solid sphere, a solid cylinder and a ring. Rolling, they arrive in the exact times sqrt(2 L (1 + k) / (g sin theta)): the sphere beats the cylinder, which beats the ring, whatever their mass or size. Lower the friction below k/(1 + k) tan theta and a body starts to slide instead.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { billardPi: ['chiffres'], modesNormaux: ['masses', 'mode'], paraboleTir: ['angles'], penduleAmplitude: [], phasesLune: [], dureeJour: [], courseRoulante: [] };
const FONCTIONS = { billardPi, modesNormaux, paraboleTir, penduleAmplitude, phasesLune, dureeJour, courseRoulante };
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
