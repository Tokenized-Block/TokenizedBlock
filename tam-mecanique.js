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
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = Math.PI, LN2 = lnD(2);

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

// ---------- 8 : le corps noir (loi de Planck) ----------
// Sans dimension : longueur d onde lambda en unites de h c / (k T0), temperature T en unites de T0 ; aucune constante publiee.
// Loi de Planck (la courbe elle-meme) : B(lambda, T) = 1 / (lambda^5 (e^(1 / (lambda T)) - 1)), a un facteur 2 h c^2 pres.
// Mesure (pas de formule finale) : pour chaque temperature, le sommet de la courbe est CHERCHE (grille logarithmique puis section
//   doree) et l aire sous la courbe est INTEGREE (Simpson sur ln lambda, de 1e-3 a 1e3).
// Exact (derive ici) : en posant x = 1 / (lambda T), l aire vaut T^4 integrale x^3 / (e^x - 1) dx = T^4 pi^4 / 15 (Stefan-Boltzmann) ;
//   le sommet annule d/dlambda : x = 5 (1 - e^-x), resolu par Newton, d ou lambda_max T = 1 / x5 (Wien), le meme pour tous.
// Dessin : B contre lambda pour chaque temperature (vue de face) ; 3e colonne : numero de la courbe (0 = la plus froide).
const CN_LMIN = 0.01, CN_LMAX = 1;
function expD(x) { /* e^x avec + - * / seulement (copie de tam-physique.js) */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
const planck = (l, T) => { const x = 1 / (l * T); return x > 700 ? 0 : 1 / (l ** 5 * (expD(x) - 1)); };
function corpsNoir(P, n) {
  const C = P.courbes, temps = [];
  for (let j = 0; j < C; j++) temps.push(expD(j / (C - 1) * lnD(P.rapport)));
  /* Wien : Newton sur F(x) = x - 5 + 5 e^-x depuis 5 */
  let x5 = 5; for (let i = 0; i < 60; i++) { const e = expD(-x5), d = (x5 - 5 + 5 * e) / (1 - 5 * e); x5 -= d; if (Math.abs(d) < 1e-16) break; }
  const stefan = PI ** 4 / 15, M = 6000, s0 = lnD(1e-3), s1 = lnD(1e3), hs = (s1 - s0) / M;
  const res = temps.map((T) => {
    let aire = 0, iMax = 0, fMax = -1;
    for (let i = 0; i <= M; i++) { const l = expD(s0 + i * hs), f = planck(l, T); aire += (i === 0 || i === M ? 1 : i % 2 ? 4 : 2) * f * l; if (f > fMax) { fMax = f; iMax = i; } }
    aire *= hs / 3;
    let a = expD(s0 + (iMax - 1) * hs), b = expD(s0 + (iMax + 1) * hs); const g = (Math.sqrt(5) - 1) / 2;
    for (let k = 0; k < 200 && b - a > 1e-15 * b; k++) { const c = b - g * (b - a), d = a + g * (b - a); if (planck(c, T) > planck(d, T)) b = d; else a = c; }
    const lm = (a + b) / 2;
    return { T, aire, lm, pic: planck(lm, T) };
  });
  const brut = new Float64Array(n * 3), par = Math.floor(n / C); let l = 0;
  for (let j = 0; j < C; j++) { const nb = j === C - 1 ? n - l : par; for (let q = 0; q < nb && l < n; q++) { const la = nb === 1 ? CN_LMIN : CN_LMIN + q * (CN_LMAX - CN_LMIN) / (nb - 1), o = 3 * l++; brut[o] = la; brut[o + 1] = planck(la, temps[j]); brut[o + 2] = j; } }
  let pireW = 0, pireS = 0; for (const r of res) { pireW = Math.max(pireW, Math.abs(r.lm * r.T * x5 - 1)); pireS = Math.max(pireS, Math.abs(r.aire / (r.T ** 4 * stefan) - 1)); }
  const froid = res[0], chaud = res[C - 1];
  return { D: 3, brut, nuage: true, unite: 'sans objet (rayonnement thermique)', invariants: {
    picWien: { mesure: pireW, formule: 0, x5, note: 'worst relative gap, over every temperature, between the peak searched on the curve (lambda_max T) and 1 / x5, x5 the root of x = 5 (1 - e^-x)' },
    picFroid: { mesure: froid.lm, formule: 1 / x5, hauteurPic: froid.pic, note: 'peak wavelength of the coolest body (T = 1) against 1 / x5 (Wien)' },
    aireStefan: { mesure: pireS, formule: 0, note: 'worst relative gap, over every temperature, between the area integrated under the curve and T^4 pi^4 / 15 (Stefan-Boltzmann)' },
    puissanceChaude: { mesure: chaud.aire / froid.aire, formule: (chaud.T / froid.T) ** 4, note: 'power of the hottest body over the coolest, against the ratio of temperatures to the fourth power' } } };
}

// ---------- 9 : le reseau de N fentes ----------
// N fentes fines, espacees de d (curseur d / lambda), eclairees de face ; on regarde au loin dans la direction theta (s = sin theta).
// Mesure (pas de formule) : l onde recue est la SOMME des N ondes, fente par fente (phaseurs cos + i sin du dephasage j phi,
//   phi = 2 pi (d / lambda) s) ; intensite |somme|^2 / N^2. Sur une grille fine de phi entre deux ordres (0 < phi < 2 pi), on COMPTE
//   les creux et les bosses de la courbe sommee.
// Exact (derive ici) : la somme geometrique donne I / N^2 = sin^2(N phi / 2) / (N^2 sin^2(phi / 2)) ; maxima principaux (= 1) quand
//   d sin theta = m lambda ; entre deux, N - 1 zeros (phi = 2 pi q / N) et N - 2 maxima secondaires.
// Dessin : I / N^2 contre sin theta pour 2 fentes (Young), un nombre moyen et N fentes (vue de face) ; 3e colonne : le nombre de fentes.
function reseauFentes(P, n) {
  const N = P.fentes, r = P.espacement, G = 20000;
  const Ns = [...new Set([2, Math.round((2 + N) / 2), N])];
  const somme = (k, s) => { const ph = 2 * PI * r * s; let re = 0, im = 0; for (let j = 0; j < k; j++) { re += cosD(j * ph); im += sinD(j * ph); } return (re * re + im * im) / (k * k); };
  const formule = (k, s) => { const ph = 2 * PI * r * s, d = sinD(ph / 2); if (Math.abs(d) < 1e-6) return 1; const u = sinD(k * ph / 2) / (k * d); return u * u; };
  const comptes = Ns.map((k) => {
    let creux = 0, bosses = 0, a = somme(k, 1 / (G * r)), b = somme(k, 2 / (G * r));
    for (let i = 3; i < G; i++) { const c = somme(k, i / (G * r)); if (b < a && b < c) creux++; if (b > a && b > c) bosses++; a = b; b = c; }
    return { k, creux, bosses };
  });
  const brut = new Float64Array(n * 3), par = Math.floor(n / Ns.length); let l = 0, pireC = 0;
  for (let c = 0; c < Ns.length; c++) { const k = Ns[c], nb = c === Ns.length - 1 ? n - l : par; for (let q = 0; q < nb && l < n; q++) { const s = nb === 1 ? 0 : -1 + 2 * q / (nb - 1), o = 3 * l++, v = somme(k, s); brut[o] = s; brut[o + 1] = v; brut[o + 2] = k; pireC = Math.max(pireC, Math.abs(v - formule(k, s))); } }
  let pireM = 0, ordres = 0; for (let m = -Math.floor(r); m <= Math.floor(r); m++) { ordres++; for (const k of Ns) pireM = Math.max(pireM, Math.abs(somme(k, m / r) - 1)); }
  const cN = comptes[comptes.length - 1]; let pireN = 0; for (const c of comptes) pireN = Math.max(pireN, Math.abs(c.creux - (c.k - 1)), Math.abs(c.bosses - (c.k - 2)));
  return { D: 3, brut, nuage: true, unite: 'sans objet (optique ondulatoire)', invariants: {
    courbeFentes: { mesure: pireC, formule: 0, note: 'worst gap, over every point drawn, between the wave summed slit by slit and sin^2(N phi / 2) / (N^2 sin^2(phi / 2))' },
    maximaPrincipaux: { mesure: pireM, formule: 0, ordres, note: 'worst gap from 1 of the summed intensity where d sin theta = m lambda, for every order m seen and every curve' },
    minimaEntre: { mesure: cN.creux, formule: N - 1, note: 'dark fringes counted between two orders on the summed curve, N slits, against N - 1' },
    secondaires: { mesure: cN.bosses, formule: N - 2, note: 'small bright fringes counted between two orders on the summed curve, N slits, against N - 2' },
    comptesCourbes: { mesure: pireN, formule: 0, note: 'worst miscount (dark or small bright fringes) over the three curves drawn' } } };
}

// ---------- 10 : la refraction par le chemin le plus rapide (Fermat) et la fenetre de Snell ----------
// Une source S sous l eau (indice n, curseur) a la profondeur 1 ; la surface est y = 0 ; des cibles T dans l air sur un demi-cercle de
//   rayon 3 (vitesse 1 dans l air, 1/n dans l eau).
// Mesure (la loi de Snell n est ecrite nulle part dans le calcul) : pour chaque cible, le point de passage P sur la surface est CHERCHE
//   par section doree comme celui qui rend le trajet S -> P -> T le plus COURT EN TEMPS (principe de Fermat) ; le temps dans l air est
//   recrit sans perte, sqrt(u^2 + h^2) = u + h^2 / (sqrt(u^2 + h^2) + u), pour qu une cible tres lointaine reste mesurable.
// Exact (derive ici) : le temps est minimal quand n sin(theta eau) = sin(theta air) (Snell) ; une cible a l horizon (theta air -> 90 degres)
//   est vue sous theta eau -> asin(1 / n) : tout le ciel tient dans ce cone, la fenetre de Snell ; au-dela, aucun chemin ne sort, la
//   lumiere est reflechie en entier (les 4 rayons reflechis sont dessines par symetrie, pas mesures).
// Dessin : chaque rayon S -> P -> T (vue de face) ; 3e colonne : numero du rayon (les reflechis apres les sortants).
const SN_R = 3, SN_REFLECHIS = 4;
function passageFermat(n, X, h) {
  /* X >= 0 : P dans [0, X] ; temps reduit (la constante X retiree) */
  const t = (p) => { const u = X - p; return n * Math.sqrt(p * p + 1) - p + h * h / (Math.sqrt(u * u + h * h) + u); };
  let a = 0, b = X; const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 400 && b - a > 1e-15 * (1 + a); k++) { const c = b - g * (b - a), d = a + g * (b - a); if (t(c) < t(d)) b = d; else a = c; }
  return (a + b) / 2;
}
function refractionSnell(P, n) {
  const N = P.indice, K = P.rayons, rayons = [];
  let pireSnell = 0, maxEau = 0;
  for (let k = 0; k < K; k++) {
    const al = (-85 + 170 * k / (K - 1)) * PI / 180, X = SN_R * sinD(al), h = SN_R * cosD(al), sg = X < 0 ? -1 : 1, p = sg * passageFermat(N, sg * X, h);
    const sinEau = p / Math.sqrt(p * p + 1), u = X - p, sinAir = u / Math.sqrt(u * u + h * h);
    pireSnell = Math.max(pireSnell, Math.abs(N * sinEau - sinAir)); maxEau = Math.max(maxEau, Math.abs(atanD(p)));
    rayons.push([[0, -1], [p, 0], [X, h]]);
  }
  /* la cible a l horizon : a 1e6 de distance, hauteur 1 */
  const pH = passageFermat(N, 1e6, 1), fenetre = atanD(pH) * 180 / PI, crit = atanD(1 / Math.sqrt(N * N - 1));
  /* game135 (mesure de l echelle : pres de l angle critique un reflechi touche la surface a x = tan theta, jusqu a 16 pour n = 1.05, et
   *   ecrasait le dessin 6.8 x 2.1) : les reflechis, alternes gauche / droite, sont dessines dans le cadre |x| <= SN_R, y = -|x - q| / q */
  for (let j = 0; j < SN_REFLECHIS; j++) { const th = crit + (PI / 2 - crit) * (j + 1) / (SN_REFLECHIS + 1) * 0.9, q = sinD(th) / cosD(th); rayons.push({ q, sg: j % 2 ? -1 : 1 }); }
  const brut = new Float64Array(n * 3), R = rayons.length, par = Math.floor(n / R); let l = 0;
  for (let r = 0; r < R && l < n; r++) { const ray = rayons[r], m = r === R - 1 ? n - l : par, m1 = Math.floor(m / 2);
    if (!Array.isArray(ray)) { const xMax = Math.min(2 * ray.q, SN_R); for (let q = 0; q < m && l < n; q++) { const o = 3 * l++, x = m <= 1 ? 0 : xMax * q / (m - 1); brut[o] = ray.sg * x; brut[o + 1] = -Math.abs(x - ray.q) / ray.q; brut[o + 2] = r; } continue; }
    const [A, B, C] = ray;
    for (let q = 0; q < m && l < n; q++) { const o = 3 * l++, [U, V, f] = q < m1 ? [A, B, m1 <= 0 ? 0 : q / m1] : [B, C, m - m1 <= 1 ? 1 : (q - m1) / (m - m1 - 1)]; brut[o] = U[0] + f * (V[0] - U[0]); brut[o + 1] = U[1] + f * (V[1] - U[1]); brut[o + 2] = r; } }
  return { D: 3, brut, nuage: true, unite: 'sans objet (optique geometrique)', invariants: {
    snellFermat: { mesure: pireSnell, formule: 0, rayons: K, note: 'worst gap, over every ray, between n sin(angle in water) and sin(angle in air) for the crossing point found as the FASTEST path (Fermat)' },
    fenetreSnell: { mesure: fenetre, formule: crit * 180 / PI, note: 'angle in water (degrees) of the fastest path to a target on the horizon (1e6 away) against asin(1 / n): the whole sky fits in this cone' },
    angleMaxEau: { mesure: maxEau * 180 / PI, formule: crit * 180 / PI, note: 'largest angle in water (degrees) among the rays drawn: always inside the window (below asin(1 / n))' } } };
}

// ---------- 11 : la desintegration radioactive, atome par atome ----------
// N0 atomes (curseur) ; a chaque pas, CHAQUE atome encore la tire au sort (generateur mulberry32, graine curseur) et se desintegre avec
//   la probabilite p = 1 - 2^(-1 / T) (T = demi-vie en pas, curseur). Rien d autre : pas de loi exponentielle dans la simulation.
// Mesure : le pas ou il reste la moitie des atomes (interpole entre deux pas), et la vie moyenne des atomes (pas de leur desintegration).
// Exact (derive ici) : chaque atome survit a k pas avec la probabilite (1 - p)^k = 2^(-k / T) ; la moitie reste a T ; la duree de vie
//   suit une loi geometrique de moyenne 1 / p. Ecarts STATISTIQUES (un nombre fini d atomes) : sigma(demi-vie) = T / (ln 2 sqrt(N0)),
//   sigma(vie moyenne) = sqrt(1 - p) / (p sqrt(N0)) — les ecarts sont donnes en sigma.
// Dessin : atomes restants contre le temps, comptes (0) et N0 2^(-t / T) (1) (vue de face), jusqu a 5 demi-vies.
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function desintegration(P, n) {
  const N0 = P.atomes, T = P.demiVie, p = 1 - expD(-LN2 / T), alea = mulberry32(0x5eed + 7919 * P.graine), tFin = 5 * T;
  const restants = [N0]; let vivants = N0, somme = 0, k = 0;
  while (vivants > 0 && k < 200 * T) { k++; let d = 0; for (let i = 0; i < vivants; i++) if (alea() < p) d++; vivants -= d; somme += d * k; if (k <= tFin) restants.push(vivants); }
  while (restants.length <= tFin) restants.push(vivants);
  let tDemi = NaN; for (let j = 1; j < restants.length; j++) if (restants[j] <= N0 / 2) { tDemi = j - 1 + (restants[j - 1] - N0 / 2) / (restants[j - 1] - restants[j]); break; }
  const vie = somme / (N0 - vivants), sD = T / (LN2 * Math.sqrt(N0)), sV = Math.sqrt(1 - p) / (p * Math.sqrt(N0));
  const brut = new Float64Array(n * 3), moitie = Math.floor(n / 2);
  for (let l = 0; l < n; l++) { const c = l < moitie ? 0 : 1, q = c ? l - moitie : l, m = c ? n - moitie : moitie, t = m <= 1 ? 0 : tFin * q / (m - 1), o = 3 * l;
    brut[o] = t; brut[o + 1] = c ? N0 * expD(-LN2 * t / T) : restants[Math.floor(t + 1e-9)]; brut[o + 2] = c; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (desintegration, au hasard)', invariants: {
    demiVieMesuree: { mesure: tDemi, formule: T, sigma: sD, ecartSigma: (tDemi - T) / sD, note: 'step at which half the atoms are left (counted, interpolated) against T ; statistical, so the gap is also given in sigma = T / (ln 2 sqrt(N0))' },
    vieMoyenne: { mesure: vie, formule: 1 / p, sigma: sV, ecartSigma: (vie - 1 / p) / sV, note: 'mean number of steps an atom lives (counted) against 1 / p, p = 1 - 2^(-1/T) ; sigma = sqrt(1 - p) / (p sqrt(N0))' },
    resteCinq: { mesure: restants[tFin] / N0, formule: 1 / 32, note: 'share left after five half-lives against 2^-5 = 1/32 (statistical)' } } };
}

// ---------- 12 : les anneaux de Newton ----------
// Une lentille de rayon de courbure R (curseur, metres) posee sur une plaque de verre, lumiere de longueur d onde lambda (curseur, nm),
//   lame d air d0 au centre (curseur, nm). Unites seules (nm, mm, m) : aucune constante publiee.
// Mesure : en chaque point, l onde reflechie par le dessous de la lentille et celle reflechie par la plaque (dephasee de pi a la reflexion
//   sur le verre, et de 2 pi 2 e / lambda par l aller-retour dans la lame d epaisseur e) sont SOMMEES ; e = d0 + la fleche EXACTE de la
//   lentille, R - sqrt(R^2 - r^2). Les anneaux sombres sont CHERCHES sur la courbe (grille fine puis section doree).
// Exact (derive ici) : sombre quand 2 e = m lambda, soit r_m = sqrt(R^2 - (R - (m lambda / 2 - d0))^2) ; pres de l axe (approximation
//   paraxiale) r_m^2 = R (m lambda - 2 d0) : les carres des rayons sont en progression ARITHMETIQUE de pas lambda R.
// Dessin : l intensite reflechie (hauteur) sur le disque de rayon 3 mm (vue de dessus : les anneaux) ; x, y en mm.
const NW_RMAX = 3e-3;
function anneauxNewton(P, n) {
  const R = P.rayonLentille, lam = P.lambda * 1e-9, d0 = P.ecartAir * 1e-9, G = 40000;
  const fleche = (r) => r * r / (R + Math.sqrt(R * R - r * r));
  const I = (r) => { const de = 2 * PI * 2 * (d0 + fleche(r)) / lam, re = 1 - cosD(de), im = -sinD(de); return (re * re + im * im) / 4; };
  const mesures = []; const g = (Math.sqrt(5) - 1) / 2, h = NW_RMAX / G;
  let a = I(h), b = I(2 * h);
  /* game137 (rouge du banc a 750 nm : l anneau m = 12 tombe a 2.999997 mm, dans la DERNIERE case de la grille, sans point au-dela pour
   *   le voir comme un creux) : le balayage deborde de deux pas, seuls les creux a <= 3 mm sont gardes */
  for (let i = 3; i <= G + 2; i++) { const c = I(i * h); if (b < a && b <= c) { let u = (i - 2) * h, v = i * h; for (let k = 0; k < 200 && v - u > 1e-15; k++) { const x = v - g * (v - u), y = u + g * (v - u); if (I(x) < I(y)) v = y; else u = x; } if ((u + v) / 2 <= NW_RMAX) mesures.push((u + v) / 2); } a = b; b = c; }
  const formules = []; for (let m = Math.max(0, Math.ceil(2 * d0 / lam)); ; m++) { const e = m * lam / 2 - d0; if (e < 0) continue; const r = Math.sqrt(Math.max(0, R * R - (R - e) * (R - e))); if (r > NW_RMAX) break; if (r > 2 * h) formules.push({ m, r }); }
  let pire = 0; const k = Math.min(mesures.length, formules.length); for (let j = 0; j < k; j++) pire = Math.max(pire, Math.abs(mesures[j] - formules[j].r) / formules[j].r);
  /* pente de r^2 contre m (moindres carres sur les anneaux mesures) contre lambda R */
  let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let j = 0; j < k; j++) { const x = formules[j].m, y = mesures[j] ** 2; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const pente = k > 1 ? (k * sxy - sx * sy) / (k * sxx - sx * sx) : NaN;
  const brut = new Float64Array(n * 3), dor = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) { const r = NW_RMAX * Math.sqrt((i + 0.5) / n), t = i * dor, o = 3 * i; brut[o] = 1e3 * r * cosD(t); brut[o + 1] = 1e3 * r * sinD(t); brut[o + 2] = I(r); }
  return { D: 3, brut, nuage: true, unite: 'sans objet (interferences)', invariants: {
    anneauxSombres: { mesure: mesures.length, formule: formules.length, note: 'dark rings found on the summed intensity inside 3 mm, against the count of m with 2 e = m lambda' },
    rayonsAnneaux: { mesure: pire, formule: 0, note: 'worst relative gap between each dark ring found and r_m = sqrt(R^2 - (R - (m lambda / 2 - d0))^2) (exact sag of the lens)' },
    penteCarres: { mesure: pente * 1e6, formule: lam * R * 1e6, note: 'slope of r^2 (mm^2) against m on the rings found, against lambda R (paraxial law: the squares of the radii step by lambda R)' } } };
}

// ---------- 13 : deux pendules couples par un ressort ----------
// Petites oscillations, sans dimension : x1'' = -x1 - k (x1 - x2), x2'' = -x2 - k (x2 - x1) ; k = couplage (curseur). Depart x1 = 1,
//   x2 = d (curseur), vitesses nulles. Integration de Verlet (pas h = 0.005), rien d autre.
// Mesure : les deux MODES propres sont lances seuls (x1 = x2 = 1, puis x1 = -x2 = 1) et leur periode est CHRONOMETREE sur les passages
//   par zero (interpoles), moyennee sur plusieurs periodes ; le temps d echange s en deduit, pi / (omega2 - omega1).
// Exact (derive ici) : modes s = x1 + x2 (omega1 = 1) et d = x1 - x2 (omega2 = sqrt(1 + 2 k)) ; x1 = ((1 + d) cos t + (1 - d) cos omega2 t) / 2 :
//   l energie passe du premier pendule au second en pi / (omega2 - omega1) puis revient ; avec d = 0 l echange est total, avec d = 1 nul.
//   Le schema de Verlet a sa propre pulsation exacte (2 / h) asin(omega h / 2) : temoin.
// Dessin : x1 (0) et x2 (1) contre le temps sur un battement complet (vue de face).
const PC_H = 0.005;
function verletDeux(k, x, y, pas, chaque) {
  let u = 0, v = 0, ax = -x - k * (x - y), ay = -y - k * (y - x);
  for (let i = 1; i <= pas; i++) { x += PC_H * u + PC_H * PC_H / 2 * ax; y += PC_H * v + PC_H * PC_H / 2 * ay; const bx = -x - k * (x - y), by = -y - k * (y - x); u += PC_H / 2 * (ax + bx); v += PC_H / 2 * (ay + by); ax = bx; ay = by; if (chaque) chaque(i * PC_H, x, y, u, v); }
}
function periodeMesuree(k, x0, y0, periodes) {
  /* passages par zero montants de x1 (interpoles lineairement) ; periode = ecart moyen entre le 1er et le dernier */
  const T = 2 * PI / Math.sqrt(Math.min(1, 1 + 2 * k)), zeros = []; let tp = 0, xp = x0;
  verletDeux(k, x0, y0, Math.ceil((periodes + 1.5) * T / PC_H), (t, x) => { if (xp < 0 && x >= 0) zeros.push(tp + PC_H * (-xp) / (x - xp)); tp = t; xp = x; });
  return (zeros[zeros.length - 1] - zeros[0]) / (zeros.length - 1);
}
function pendulesCouples(P, n) {
  const k = P.couplage, d = P.depart, w2 = Math.sqrt(1 + 2 * k);
  const T1 = periodeMesuree(k, 1, 1, 20), T2 = periodeMesuree(k, 1, -1, 20), w1m = 2 * PI / T1, w2m = 2 * PI / T2;
  const verlet = (w) => 2 / PC_H * atanD((w * PC_H / 2) / Math.sqrt(1 - (w * PC_H / 2) ** 2));
  const tDessin = 2 * PI / (w2 - 1), pas = Math.ceil(tDessin / PC_H), traj = [[0, 1, d]]; let E0 = NaN, pireE = 0;
  const energie = (x, y, u, v) => (u * u + v * v + x * x + y * y + k * (x - y) ** 2) / 2; E0 = energie(1, d, 0, 0);
  verletDeux(k, 1, d, pas, (t, x, y, u, v) => { traj.push([t, x, y]); pireE = Math.max(pireE, Math.abs(energie(x, y, u, v) - E0)); });
  const brut = new Float64Array(n * 3), moitie = Math.floor(n / 2);
  for (let l = 0; l < n; l++) { const c = l < moitie ? 0 : 1, q = c ? l - moitie : l, m = c ? n - moitie : moitie, j = m <= 1 ? 0 : Math.round(q * (traj.length - 1) / (m - 1)), o = 3 * l; brut[o] = traj[j][0]; brut[o + 1] = traj[j][1 + c]; brut[o + 2] = c; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (oscillateurs couples)', invariants: {
    modeLent: { mesure: T1, formule: 2 * PI, verlet: 2 * PI / verlet(1), note: 'period timed on zero crossings, both pendulums swinging together, against 2 pi (and the exact period of the Verlet scheme)' },
    modeRapide: { mesure: T2, formule: 2 * PI / w2, verlet: 2 * PI / verlet(w2), note: 'period timed, pendulums swinging against each other, against 2 pi / sqrt(1 + 2 k)' },
    tempsEchange: { mesure: PI / (w2m - w1m), formule: PI / (w2 - 1), note: 'time for the energy to pass from one pendulum to the other, from the two timed periods, against pi / (sqrt(1 + 2 k) - 1)' },
    energieCouples: { debut: E0, fin: E0, derive: pireE, note: 'energy of both pendulums and the spring along the drawn run (Verlet keeps it bounded)' } } };
}

// ---------- 14 : la cycloide tautochrone ----------
// Une bille glisse sans frottement sur une cycloide renversee x = a (th + sin th), y = a (1 - cos th) (fond en th = 0), a = g = 1.
//   B billes (curseur) lachees au repos de th0 = lacherHaut i / B (degres), de plus en plus haut.
// Mesure : rien que l equation de Lagrange en th, avec m(th) = (ds/dth)^2 = 2 (1 + cos th) et V = 1 - cos th :
//   th'' = sin th (th'^2 - 1) / (2 (1 + cos th)), integree en RK4 (pas 0.002) ; la periode est CHRONOMETREE sur les passages par le fond
//   (interpoles), l arrivee au fond aussi. Temoin : un pendule sur un CERCLE de rayon 4 (meme courbure au fond) lache de la meme hauteur,
//   meme integrateur.
// Exact (derive ici) : l abscisse curviligne s = 4 sin(th / 2) donne y = s^2 / 8, donc s'' = -s / 4 : oscillation harmonique de periode
//   4 pi QUELLE QUE SOIT la hauteur, et le fond est atteint en pi depuis n importe quel point (Huygens). Le cercle, lui, a la periode
//   4 pi / AGM(1, cos(alpha0 / 2)), cos alpha0 = 1 - h / 4, qui grandit avec la hauteur.
// Dessin : s (distance le long de la courbe depuis le fond) contre le temps, une courbe par bille, sur deux periodes.
const TC_H = 0.002;
function rk4Courbe(acc, q0, duree, chaque) {
  let q = q0, v = 0;
  for (let i = 1, N = Math.ceil(duree / TC_H); i <= N; i++) {
    const k1 = acc(q, v), k2 = acc(q + TC_H / 2 * v, v + TC_H / 2 * k1), k3 = acc(q + TC_H / 2 * (v + TC_H / 2 * k1), v + TC_H / 2 * k2), k4 = acc(q + TC_H * (v + TC_H / 2 * k2), v + TC_H * k3);
    q += TC_H * (v + TC_H / 6 * (k1 + k2 + k3)); v += TC_H / 6 * (k1 + 2 * k2 + 2 * k3 + k4); chaque(i * TC_H, q, v);
  }
}
/* periode = ecart moyen entre passages par le fond (un sur deux = meme sens) ; arrivee = premier passage (interpoles lineairement) */
function chronometrer(acc, q0, periodes, duree) {
  const zeros = []; let tp = 0, qp = q0;
  rk4Courbe(acc, q0, duree, (t, q) => { if ((qp > 0) !== (q > 0)) zeros.push(tp + TC_H * qp / (qp - q)); tp = t; qp = q; });
  const m = Math.min(2 * periodes, zeros.length - 1 - ((zeros.length - 1) % 2));
  return { arrivee: zeros[0], periode: (zeros[m] - zeros[0]) / (m / 2) };
}
const accCycloide = (q, v) => sinD(q) * (v * v - 1) / (2 * (1 + cosD(q))), accCercle = (q) => -sinD(q) / 4;
function tautochrone(P, n) {
  const B = P.billes, haut = P.lacherHaut * PI / 180, T = 4 * PI, billes = [];
  for (let i = 1; i <= B; i++) { const th0 = haut * i / B; billes.push({ th0, ...chronometrer(accCycloide, th0, 5, 5.5 * T) }); }
  const hMax = 1 - cosD(haut), alpha0 = acosD(1 - hMax / 4), cercleF = 4 * PI / agm(1, cosD(alpha0 / 2)), cercle = chronometrer(accCercle, alpha0, 5, 5.5 * cercleF);
  let lo = 1 / 0, hi = -1 / 0, pireBas = 0; for (const b of billes) { lo = Math.min(lo, b.periode); hi = Math.max(hi, b.periode); pireBas = Math.max(pireBas, Math.abs(b.arrivee - PI)); }
  const brut = new Float64Array(n * 3), par = Math.floor(n / B);
  for (let c = 0; c < B; c++) {
    const m = c + 1 < B ? par : n - par * (B - 1), pts = [[0, 4 * sinD(billes[c].th0 / 2)]]; rk4Courbe(accCycloide, billes[c].th0, 2 * T, (t, q) => pts.push([t, 4 * sinD(q / 2)]));
    for (let q = 0; q < m; q++) { const j = m <= 1 ? 0 : Math.round(q * (pts.length - 1) / (m - 1)), o = 3 * (c * par + q); brut[o] = pts[j][0]; brut[o + 1] = pts[j][1]; brut[o + 2] = c + 1; }
  }
  return { D: 3, brut, nuage: true, unite: 'sans objet (a = g = 1)', invariants: {
    periodeIsochrone: { mesure: billes[B - 1].periode, formule: T, note: 'period timed on the bottom crossings for the ball released highest, against 4 pi (the same for every height)' },
    etaleBilles: { mesure: (hi - lo) / T, formule: 0, note: 'spread of the timed periods of all the balls, divided by 4 pi: the cycloid does not care where you let go' },
    arriveeEnBas: { mesure: pireBas, formule: 0, note: 'worst gap between the time each ball takes to first reach the bottom and pi (Huygens: the same from anywhere)' },
    cercleTemoin: { mesure: cercle.periode, formule: cercleF, note: 'witness: a pendulum on a circle of radius 4 (same curvature at the bottom), released from the same height, same integrator: its period grows, 4 pi / AGM(1, cos(alpha0 / 2))' } } };
}

// ---------- 15 : la chainette (une chaine de maillons pendue) ----------
// N maillons rigides de longueur l, un poids egal a chaque joint, accroches en (-1, 0) et (1, 0) ; longueur totale = rapport x portee.
// Mesure : la forme est CHERCHEE en descendant l energie potentielle (somme des hauteurs des joints) le long des contraintes de longueur :
//   pas de gradient projete sur l espace tangent (multiplicateurs par un systeme tridiagonal), puis correction de Newton qui remet chaque
//   maillon a sa longueur ; pas adaptatif (accepte si l energie baisse). Aucune forme supposee : depart en V.
// Exact (derive ici) : la tension horizontale H est la meme partout et chaque joint ajoute le meme poids w a la tension verticale, donc
//   les pentes des maillons sont en progression ARITHMETIQUE : tan phi_i = c (i - (N + 1) / 2), c = w / H, c fixe par sum l cos phi_i = 2.
//   Quand N grandit la chaine tend vers la chainette y = a cosh(x / a) - a cosh(1 / a), 2 a sinh(1 / a) = longueur (pas la parabole).
// Dessin : les maillons trouves (0) et la chainette continue (1), x et y a la meme echelle.
function chainette(P, n) {
  const N = P.maillons, Lt = 2 * P.rapport, l = Lt / N, M = N - 1;
  /* depart en V (milieu horizontal si N impair), deja a la bonne longueur */
  const x = new Float64Array(N + 1), y = new Float64Array(N + 1), h = Math.floor(N / 2);
  { const ca = N % 2 ? (2 / l - 1) / (N - 1) : 2 / (N * l), sa = Math.sqrt(1 - ca * ca); x[0] = -1;
    for (let i = 1; i <= N; i++) { const s = i <= h ? -1 : i > N - h ? 1 : 0; x[i] = x[i - 1] + (s ? l * ca : l); y[i] = y[i - 1] + s * l * sa; } x[N] = 1; y[N] = 0; }
  const dx = new Float64Array(N + 1), dy = new Float64Array(N + 1), a = new Float64Array(N + 1), b = new Float64Array(N + 1), r = new Float64Array(N + 1), mu = new Float64Array(N + 1);
  const liens = () => { for (let i = 1; i <= N; i++) { dx[i] = x[i] - x[i - 1]; dy[i] = y[i] - y[i - 1]; } };
  /* (J J^T) mu = r, tridiagonale : diag 4 |d_i|^2 (x 2 si les deux bouts bougent), hors diag -4 d_i . d_(i+1) */
  const resoudre = () => { for (let i = 1; i <= N; i++) { a[i] = 4 * (dx[i] * dx[i] + dy[i] * dy[i]) * ((i > 1) + (i < N)); b[i] = i < N ? -4 * (dx[i] * dx[i + 1] + dy[i] * dy[i + 1]) : 0; }
    const c = new Float64Array(N + 1), e = new Float64Array(N + 1); for (let i = 1; i <= N; i++) { const m = a[i] - (i > 1 ? b[i - 1] * c[i - 1] : 0); c[i] = b[i] / m; e[i] = (r[i] - (i > 1 ? b[i - 1] * e[i - 1] : 0)) / m; }
    for (let i = N; i >= 1; i--) mu[i] = e[i] - (i < N ? c[i] * mu[i + 1] : 0); };
  /* J^T mu sur le joint j (1..N-1) : 2 d_j mu_j - 2 d_(j+1) mu_(j+1) */
  const corriger = () => { for (let k = 0; k < 30; k++) { liens(); let pire = 0; for (let i = 1; i <= N; i++) { r[i] = dx[i] * dx[i] + dy[i] * dy[i] - l * l; pire = Math.max(pire, Math.abs(r[i])); } if (pire < 1e-15) return true; resoudre();
    for (let j = 1; j < N; j++) { x[j] -= 2 * (dx[j] * mu[j] - dx[j + 1] * mu[j + 1]); y[j] -= 2 * (dy[j] * mu[j] - dy[j + 1] * mu[j + 1]); } } return false; };
  const energie = () => { let s = 0; for (let j = 1; j < N; j++) s += y[j]; return s; };
  const gx = new Float64Array(N + 1), gy = new Float64Array(N + 1), sx = new Float64Array(N + 1), sy = new Float64Array(N + 1);
  let pas = 0.1 * l, U = energie(), iter = 0, gNorme = Infinity;
  for (; iter < 200000; iter++) {
    liens(); for (let i = 1; i <= N; i++) r[i] = 2 * dy[i] * ((i < N) - (i > 1)); resoudre();
    gNorme = 0; for (let j = 1; j < N; j++) { gx[j] = -2 * (dx[j] * mu[j] - dx[j + 1] * mu[j + 1]); gy[j] = 1 - 2 * (dy[j] * mu[j] - dy[j + 1] * mu[j + 1]); gNorme = Math.max(gNorme, Math.abs(gx[j]), Math.abs(gy[j])); }
    if (gNorme < 1e-13) break;
    sx.set(x); sy.set(y); for (let j = 1; j < N; j++) { x[j] -= pas * gx[j]; y[j] -= pas * gy[j]; }
    if (corriger() && energie() < U) { U = energie(); pas *= 1.3; } else { x.set(sx); y.set(sy); pas /= 2; if (pas < 1e-18) break; }
  }
  /* exact discret : c par dichotomie sur sum cos phi_i = 2 / l */
  const kk = (i) => i - (N + 1) / 2, somme = (c) => { let s = 0; for (let i = 1; i <= N; i++) s += 1 / Math.sqrt(1 + c * c * kk(i) * kk(i)); return s; };
  let lo = 0, hi = 1; while (somme(hi) > 2 / l) hi *= 2; for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (somme(m) > 2 / l) lo = m; else hi = m; }
  const c = (lo + hi) / 2, ex = [-1], ey = [0]; for (let i = 1; i <= N; i++) { const q = 1 / Math.sqrt(1 + c * c * kk(i) * kk(i)); ex.push(ex[i - 1] + l * q); ey.push(ey[i - 1] + l * c * kk(i) * q); }
  let pire = 0; for (let j = 0; j <= N; j++) pire = Math.max(pire, Math.abs(x[j] - ex[j]), Math.abs(y[j] - ey[j]));
  /* pente des maillons trouves contre leur rang (moindres carres) */
  liens(); let s1 = 0, s2 = 0; for (let i = 1; i <= N; i++) { s1 += kk(i) * dy[i] / dx[i]; s2 += kk(i) * kk(i); }
  const fleche = N % 2 ? -(y[h] + y[h + 1]) / 2 : -y[h], flecheEx = N % 2 ? -(ey[h] + ey[h + 1]) / 2 : -ey[h];
  /* chainette continue : 2 a sinh(1 / a) = Lt par dichotomie sur u = 1 / a (sinh u / u croissant) */
  const sh = (u) => (expD(u) - expD(-u)) / 2, ch = (u) => (expD(u) + expD(-u)) / 2;
  let ul = 1e-9, uh = 1; while (sh(uh) / uh < Lt / 2) uh *= 2; for (let k = 0; k < 200; k++) { const m = (ul + uh) / 2; if (sh(m) / m < Lt / 2) ul = m; else uh = m; }
  const A = 2 / (ul + uh), flecheCont = A * ch(1 / A) - A;
  /* temoin : la parabole y = k (x^2 - 1) de meme longueur, sqrt(1 + 4 k^2) + asinh(2 k) / (2 k) = longueur (k par dichotomie) */
  const longParab = (k) => Math.sqrt(1 + 4 * k * k) + lnD(2 * k + Math.sqrt(4 * k * k + 1)) / (2 * k);
  let kl = 1e-9, kh = 1; while (longParab(kh) < Lt) kh *= 2; for (let k = 0; k < 200; k++) { const m = (kl + kh) / 2; if (longParab(m) < Lt) kl = m; else kh = m; }
  const flecheParab = (kl + kh) / 2;
  const brut = new Float64Array(n * 3), moitie = Math.floor(n / 2);
  for (let q = 0; q < moitie; q++) { const s = moitie <= 1 ? 0 : q * N / (moitie - 1), i = Math.min(N - 1, Math.floor(s)), f = s - i, o = 3 * q; brut[o] = x[i] + f * (x[i + 1] - x[i]); brut[o + 1] = y[i] + f * (y[i + 1] - y[i]); brut[o + 2] = 0; }
  for (let q = 0; q < n - moitie; q++) { const m = n - moitie, X = m <= 1 ? 0 : -1 + 2 * q / (m - 1), o = 3 * (moitie + q); brut[o] = X; brut[o + 1] = A * ch(X / A) - A * ch(1 / A); brut[o + 2] = 1; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (portee 2)', invariants: {
    formeMaillons: { mesure: pire, formule: 0, note: 'worst gap between each joint found by lowering the energy and the exact chain whose link slopes step evenly, tan phi_i = c (i - (N + 1) / 2)' },
    pentesEgales: { mesure: s1 / s2, formule: c, note: 'step c between the slopes of neighbouring links, fitted on the links found, against the c that makes the links span 2' },
    flecheChaine: { mesure: fleche, formule: flecheEx, note: 'sag at the middle of the chain found, against the exact chain of N links' },
    limiteContinue: { maillons: fleche, chainette: flecheCont, parabole: flecheParab, note: 'sag of the chain of links against the continuous catenary a cosh(x / a) of the same length (closer as links are added), and against a parabola of the same length (the witness)' },
    recherche: { descentes: iter, forceRestante: gNorme, note: 'steps of the energy descent and the largest force left along the chain at the end' } } };
}

// ---------- 16 : l echelle qui glisse contre un mur ----------
// Une echelle (barre homogene, longueur 1, masse 1, g = 1) appuyee contre un mur, sans frottement au mur ni au sol, lachee au repos a
//   l angle theta0 du mur (curseur, degres). Tant qu elle touche les deux, theta suffit : T = theta'^2 / 6, V = cos theta / 2, d ou
//   theta'' = (3 / 2) sin theta, integre en RK4 (pas 0.001).
// Mesure : la poussee du mur est la SEULE force horizontale, donc elle vaut la derivee seconde de x du centre, x = sin(theta) / 2 :
//   elle est lue par DIFFERENCES FINIES sur les positions simulees ; le haut quitte le mur quand elle s annule (passage interpole).
// Exact (derive ici) : x'' = (3 / 4) sin theta (3 cos theta - 2 cos theta0), nul pour cos theta = (2 / 3) cos theta0 : le haut quitte le mur
//   aux DEUX TIERS de sa hauteur de depart, quel que soit l angle. Temps : theta'^2 = 3 (cos theta0 - cos theta), et avec
//   cos theta = cos theta0 - u^2, t = integrale de 2 du / (sqrt(3) sin theta) de 0 a sqrt(cos theta0 / 3) (Simpson, sans singularite).
// Temoin : si le haut etait TENU au mur jusqu au sol, la poussee deviendrait une traction (negative) ; son minimum est mesure pareil.
// Dessin : l echelle a K instants entre le lacher et le decollage (x, y, temps), et la trace de son milieu (un quart de cercle).
const EC_H = 0.001;
function echelleGlisse(P, n) {
  const th0 = P.depart * PI / 180, c0 = cosD(th0), K = P.images;
  /* RK4 sur theta jusqu a theta = 89.9 degres (le haut tenu au mur au-dela du decollage : le temoin) */
  const ts = [0], th = [th0]; let q = th0, v = 0; const acc = (x) => 1.5 * sinD(x), fin = 89.9 * PI / 180;
  for (let i = 1; q < fin && i < 2e6; i++) { const k1 = acc(q), k2 = acc(q + EC_H / 2 * v), k3 = acc(q + EC_H / 2 * (v + EC_H / 2 * k1)), k4 = acc(q + EC_H * (v + EC_H / 2 * k2));
    q += EC_H * (v + EC_H / 6 * (k1 + k2 + k3)); v += EC_H / 6 * (k1 + 2 * k2 + 2 * k3 + k4); ts.push(i * EC_H); th.push(q); }
  /* poussee du mur = x'' par differences centrees ; decollage au premier passage par zero */
  const X = th.map((a) => sinD(a) / 2), F = (i) => (X[i + 1] - 2 * X[i] + X[i - 1]) / (EC_H * EC_H);
  let tDec = NaN, thDec = NaN, mini = Infinity, fp = F(1);
  for (let i = 2; i < X.length - 1; i++) { const f = F(i); mini = Math.min(mini, f); if (Number.isNaN(tDec) && fp > 0 && f <= 0) { const s = fp / (fp - f); tDec = ts[i - 1] + s * EC_H; thDec = th[i - 1] + s * (th[i] - th[i - 1]); } fp = f; }
  /* exact : temps par Simpson en u, minimum de la poussee tenue par grille fine puis section doree */
  const us = Math.sqrt(c0 / 3), M = 2000, g = (u) => 2 / (Math.sqrt(3) * Math.sqrt(1 - (c0 - u * u) ** 2));
  let simp = 0; for (let i = 0; i <= M; i++) simp += (i === 0 || i === M ? 1 : i % 2 ? 4 : 2) * g(us * i / M); const tEx = simp * us / M / 3;
  /* la poussee exacte aux MEMES angles simules (son minimum est au bout, vers 90 degres : comparer au meme theta) */
  const pousse = (a) => 0.75 * sinD(a) * (3 * cosD(a) - 2 * c0); let fm = Infinity; for (let i = 2; i < X.length - 1; i++) fm = Math.min(fm, pousse(th[i]));
  /* dessin : K images de l echelle avant le decollage, puis la trace du milieu */
  const brut = new Float64Array(n * 3), nE = Math.floor(n * 2 / 3), parI = Math.floor(nE / K), iDec = Math.min(th.length - 1, Math.floor(tDec / EC_H));
  for (let k = 0; k < K; k++) { const j = Math.round(k * iDec / (K - 1)), a = th[j], m = k + 1 < K ? parI : nE - parI * (K - 1);
    for (let p = 0; p < m; p++) { const s = m <= 1 ? 0 : p / (m - 1), o = 3 * (k * parI + p); brut[o] = s * sinD(a); brut[o + 1] = (1 - s) * cosD(a); brut[o + 2] = ts[j]; } }
  for (let p = 0; p < n - nE; p++) { const j = Math.round(p * iDec / Math.max(1, n - nE - 1)), o = 3 * (nE + p); brut[o] = sinD(th[j]) / 2; brut[o + 1] = cosD(th[j]) / 2; brut[o + 2] = ts[j]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (longueur 1, g = 1)', invariants: {
    hauteurDecollage: { mesure: cosD(thDec) / c0, formule: 2 / 3, note: 'height of the top when the wall push, read from the simulated positions, falls to zero, as a share of its starting height, against 2/3' },
    tempsDecollage: { mesure: tDec, formule: tEx, note: 'time from release until the top leaves the wall, against the integral of d theta / sqrt(3 (cos theta0 - cos theta))' },
    murTenu: { mesure: mini, formule: fm, note: 'witness: if the top were held on the wall all the way down, the smallest wall force read the same way, against (3/4) sin theta (3 cos theta - 2 cos theta0) at its minimum: negative, a pull the wall cannot give' } } };
}

// ---------- 17 : la perle sur un cerceau qui tourne ----------
// Une perle glisse sur un cerceau vertical de rayon R qui tourne autour de son axe vertical a la vitesse omega ; g = R = 1 (omega en
//   unites de sqrt(g / R)). Angle theta depuis le bas : theta'' = sin theta (omega^2 cos theta - 1) - gamma theta' (gamma = frottement,
//   curseur). K vitesses de 0 a omegaMax (curseurs) ; pour chacune la perle part de theta = +-0.4 et est integree en RK4 (pas 0.05 ; l equilibre est un point fixe exact du schema, le pas ne le deplace pas)
//   jusqu a l arret.
// Mesure : l angle ou la perle S ARRETE, lu a la fin de la simulation. Les vitesses a moins de 0.05 du seuil (|omega^2 - 1| < 0.05) se
//   posent trop lentement (ralentissement critique) : elles sont dessinees mais pas comptees, et leur nombre est donne.
// Exact (derive ici) : equilibres sin theta = 0 ou cos theta = 1 / omega^2. Sous omega = 1 le fond est le seul stable ; au-dessus il
//   devient instable et la perle monte a theta = acos(1 / omega^2), d un cote ou de l autre (bifurcation en fourche).
// Dessin : theta(t) pour chaque vitesse, en 3-D (omega, theta, t) : les trajectoires se posent sur la fourche.
const PE_H = 0.05;
function perleCerceau(P, n) {
  const K = P.vitesses, W = P.omegaMax, g = P.frottement, res = [];
  for (let k = 1; k <= K; k++) {
    const w = W * k / K, w2 = w * w, acc = (q, v) => sinD(q) * (w2 * cosD(q) - 1) - g * v;
    let q = k % 2 ? 0.4 : -0.4, v = 0, t = 0; const traj = [[0, q]];
    /* plafond 40000 pas (t = 2000) : seules les vitesses pres du seuil, non comptees, l atteignent */
    let pose = false;
    for (let i = 1; i <= 40000; i++) {
      const k1 = acc(q, v), k2 = acc(q + PE_H / 2 * v, v + PE_H / 2 * k1), k3 = acc(q + PE_H / 2 * (v + PE_H / 2 * k1), v + PE_H / 2 * k2), k4 = acc(q + PE_H * (v + PE_H / 2 * k2), v + PE_H * k3);
      q += PE_H * (v + PE_H / 6 * (k1 + k2 + k3)); v += PE_H / 6 * (k1 + 2 * k2 + 2 * k3 + k4); t = i * PE_H;
      if (i % 10 === 0 && t <= 60) traj.push([t, q]);
      if (Math.abs(v) < 1e-11 && Math.abs(acc(q, 0)) < 1e-11) { pose = true; break; }
    }
    res.push({ w, q, t, traj, pose, compte: Math.abs(w2 - 1) >= 0.05 });
  }
  let pireHaut = 0, pireBas = 0, nHaut = 0, nBas = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
  for (const r of res) { if (!r.compte) continue;
    if (r.w > 1) { const ex = acosD(1 / (r.w * r.w)); pireHaut = Math.max(pireHaut, Math.abs(Math.abs(r.q) - ex)); nHaut++; const X = 1 / (r.w * r.w), Y = cosD(r.q); sx += X; sy += Y; sxx += X * X; sxy += X * Y; m++; }
    else { pireBas = Math.max(pireBas, Math.abs(r.q)); nBas++; } }
  const pente = m > 1 ? (m * sxy - sx * sy) / (m * sxx - sx * sx) : NaN;
  const brut = new Float64Array(n * 3), par = Math.floor(n / K);
  for (let c = 0; c < K; c++) { const tr = res[c].traj, mm = c + 1 < K ? par : n - par * (K - 1);
    for (let p = 0; p < mm; p++) { const j = mm <= 1 ? 0 : Math.round(p * (tr.length - 1) / (mm - 1)), o = 3 * (c * par + p); brut[o] = res[c].w; brut[o + 1] = tr[j][1]; brut[o + 2] = tr[j][0]; } }
  return { D: 3, brut, nuage: true, unite: 'sans objet (g = R = 1)', invariants: {
    angleMonte: { mesure: pireHaut, formule: 0, note: 'above the threshold: worst gap between the angle where the bead came to rest and acos(1 / omega^2) (radians)' },
    fondStable: { mesure: pireBas, formule: 0, note: 'below the threshold: largest angle where the bead came to rest (the bottom is the only stable place)' },
    penteCosinus: { mesure: pente, formule: 1, note: 'slope of cos(rest angle) against 1 / omega^2 over the spins above the threshold: g / R = 1' },
    vitessesComptees: { auDessus: nHaut, auDessous: nBas, presDuSeuil: res.length - nHaut - nBas, nonPosees: res.filter((r) => r.compte && !r.pose).length, note: 'spins counted above and below the threshold, and those within 0.05 of it in omega^2, drawn but not counted (they settle too slowly) ; counted spins that did not come to rest within t = 2000 (should be 0)' } } };
}

// ---------- 18 : l effet Dzhanibekov (la raquette qui se retourne) ----------
// Un solide libre, moments d inertie I1 = 1 < I2 (curseur) < I3 = 3, lance autour de l axe du MILIEU : omega = (eps, 1, eps),
//   eps = 10^-p (curseur, p de 4 a 6 : MESURE le 2026-11-04, a p = 9 la demi-periode sortait 63.5 au lieu de 75.4 — pres de la
//   separatrice le temps depend de ln(distance), eps^2 = 1e-18 y est noye par la derive propre du RK4, ~4e-13 : c est le schema qui
//   decidait du retournement, plus le lancer). Rien que les equations d Euler, I1 w1' = (I2 - I3) w2 w3 (et permutations), en RK4 (pas 0.005).
// Mesures : (1) les passages par zero de w2 (le solide se RETOURNE) chronometres, demi-periode moyenne ; (2) au debut, tant que
//   |w1| <= 0.01, le rapport w1'' / w1 (differences finies, moindres carres) : le CARRE du taux d ecartement — juste quel que soit le
//   melange des deux modes e^(+-lambda t) (game143 : la pente de ln |w1| restait polluee par le mode qui decroit, 5e-3 a I2 = 1.3) ; (3) energie et moment cinetique conserves ;
//   (4) temoins : lances pareil autour des axes 1 et 3, l ecart ne grandit pas.
// Exact (derive ici, solution de Jacobi) : avec 2E = sum I w^2, L^2 = sum I^2 w^2, w2 suit un sn de Jacobi : demi-periode 2 K(k) / s,
//   si L^2 > 2 E I2 : s = sqrt((I3 - I2)(L^2 - 2 E I1) / (I1 I2 I3)), k^2 = (I2 - I1)(2 E I3 - L^2) / ((I3 - I2)(L^2 - 2 E I1)) ; sinon
//   les roles de I1 et I3 s echangent. K(k) = pi / (2 AGM(1, sqrt(1 - k^2))). Linearise pres de l axe 2 :
//   lambda = w2 sqrt((I2 - I1)(I3 - I2) / (I1 I3)) ; pres des axes 1 et 3 la meme formule donne un carre negatif : oscillation, stable.
// Dessin : le vecteur rotation dans le repere du solide (w1, w2, w3) sur une periode (il fait le tour de l axe du milieu en passant par
//   les deux poles), puis les deux petites boucles stables autour des axes 1 et 3.
const DZ_H = 0.005;
function dzhanibekov(P, n) {
  const I = [1, P.milieu, 3], eps = expD(-P.ecartPuissance * lnD(10));
  const f = (w) => [(I[1] - I[2]) * w[1] * w[2] / I[0], (I[2] - I[0]) * w[2] * w[0] / I[1], (I[0] - I[1]) * w[0] * w[1] / I[2]];
  const pas = (w) => { const a = f(w), b = f(w.map((x, i) => x + DZ_H / 2 * a[i])), c = f(w.map((x, i) => x + DZ_H / 2 * b[i])), d = f(w.map((x, i) => x + DZ_H * c[i])); return w.map((x, i) => x + DZ_H / 6 * (a[i] + 2 * b[i] + 2 * c[i] + d[i])); };
  const E2 = (w) => I[0] * w[0] ** 2 + I[1] * w[1] ** 2 + I[2] * w[2] ** 2, L2 = (w) => (I[0] * w[0]) ** 2 + (I[1] * w[1]) ** 2 + (I[2] * w[2]) ** 2;
  const w0 = [eps, 1, eps], e = E2(w0), l = L2(w0), [I1, I2, I3] = I;
  /* game143 (eps = 1e-9 : 1 - k^2 ~ eps^2 se perdait dans la soustraction, K infini, boucle sans fin) : k'^2 = 1 - k^2 ecrit EXACTEMENT,
   *   (I3 - I1)(L^2 - 2 E I2) / ((I3 - I2)(L^2 - 2 E I1)) [et symetrique], avec L^2 - 2 E I2 = sum I_i (I_i - I2) w_i^2, sans annulation */
  const d2 = I1 * (I1 - I2) * w0[0] ** 2 + I3 * (I3 - I2) * w0[2] ** 2, haut = d2 > 0;
  const s = haut ? Math.sqrt((I3 - I2) * (l - e * I1) / (I1 * I2 * I3)) : Math.sqrt((I2 - I1) * (e * I3 - l) / (I1 * I2 * I3));
  const kp2 = haut ? (I3 - I1) * d2 / ((I3 - I2) * (l - e * I1)) : (I3 - I1) * -d2 / ((I2 - I1) * (e * I3 - l));
  const demiEx = 2 * (PI / (2 * agm(1, Math.sqrt(kp2)))) / s, lam = Math.sqrt((I2 - I1) * (I3 - I2) / (I1 * I3));
  if (!(demiEx > 0 && demiEx < 1e4)) throw new Error('dzhanibekov : demi-periode hors bornes ' + demiEx);
  /* course principale : 3 demi-periodes et un peu */
  let w = w0, t = 0, pire = { E: 0, L: 0 }, avant = NaN, sAw = 0, sWw = 0; const zeros = [], traj = [w0];
  for (let i = 1, N = Math.ceil(3.3 * demiEx / DZ_H); i <= N; i++) {
    const u = pas(w); t = i * DZ_H;
    if ((w[1] > 0) !== (u[1] > 0)) zeros.push(t - DZ_H + DZ_H * w[1] / (w[1] - u[1]));
    /* w1'' au point w (centre), tant que |w1| <= 0.01 : moindres carres de w1'' = lambda^2 w1 */
    if (i >= 2 && Math.abs(u[0]) <= 0.01 && zeros.length === 0) { const a2 = (u[0] - 2 * w[0] + avant) / (DZ_H * DZ_H); sAw += a2 * w[0]; sWw += w[0] * w[0]; }
    pire.E = Math.max(pire.E, Math.abs(E2(u) / e - 1)); pire.L = Math.max(pire.L, Math.abs(L2(u) / l - 1));
    if (t <= 2 * demiEx) traj.push(u); avant = w[0]; w = u;
  }
  let demi = NaN; if (zeros.length > 1) demi = (zeros[zeros.length - 1] - zeros[0]) / (zeros.length - 1);
  const pente = sWw > 0 && sAw > 0 ? Math.sqrt(sAw / sWw) : NaN;
  /* temoins : autour des axes 1 et 3, meme ecart, meme duree que la course principale */
  const temoin = (ax) => { let v = ax === 0 ? [1, eps, eps] : [eps, eps, 1], pireEcart = 0; const tr = [v];
    for (let i = 1, N = Math.ceil(3.3 * demiEx / DZ_H); i <= N; i++) { v = pas(v); pireEcart = Math.max(pireEcart, Math.sqrt(v.reduce((a, x, j) => a + (j === ax ? 0 : x * x), 0)) / eps); if (i % 20 === 0 && tr.length < 400) tr.push(v); } return { pireEcart, tr }; };
  const t1 = temoin(0), t3 = temoin(2);
  const brut = new Float64Array(n * 3), nP = Math.floor(n * 2 / 3), nT = Math.floor((n - nP) / 2), poser = (tr, debut, m2) => { for (let q = 0; q < m2; q++) { const j = m2 <= 1 ? 0 : Math.round(q * (tr.length - 1) / (m2 - 1)), o = 3 * (debut + q); brut[o] = tr[j][0]; brut[o + 1] = tr[j][1]; brut[o + 2] = tr[j][2]; } };
  poser(traj, 0, nP); poser(t1.tr, nP, nT); poser(t3.tr, nP + nT, n - nP - nT);
  return { D: 3, brut, nuage: true, unite: 'sans objet (I1 = 1, I3 = 3)', invariants: {
    retournement: { mesure: demi, formule: demiEx, note: 'mean time between two turn-overs (sign changes of w2, interpolated), against 2 K(k) / s from the Jacobi solution (K by the AGM)' },
    tauxEcart: { mesure: pente, formule: lam, note: 'growth rate read at the start as sqrt(w1\'\' / w1) (finite differences, least squares while |w1| <= 0.01), against sqrt((I2 - I1)(I3 - I2) / (I1 I3)): how fast a tiny wobble grows' },
    conservation: { energie: pire.E, moment: pire.L, note: 'largest relative drift of the energy and of the squared angular momentum along the run (RK4)' },
    axesStables: { axe1: t1.pireEcart, axe3: t3.pireEcart, retournements: zeros.length, note: 'witness: thrown the same way about the axis of least and of greatest inertia, the largest wobble over the same time, in units of eps (stays small) ; and the turn-overs of the middle axis counted' } } };
}

export const COLONNES = Object.freeze({
  dzhanibekov: { colonnes: ['spin about axis 1 (least inertia)', 'spin about axis 2 (the middle one)', 'spin about axis 3 (most inertia)'], memeLongueur: [[0, 1, 2]], autres: [] },
  perleCerceau: { colonnes: ['spin omega (units of sqrt(g / R))', 'angle theta of the bead from the bottom (radians)', 'time t'], memeLongueur: [], autres: [0, 1, 2] },
  echelleGlisse: { colonnes: ['x (the wall is x = 0)', 'height y (the floor is y = 0)', 'time t'], memeLongueur: [[0, 1]], autres: [2] },
  chainette: { colonnes: ['x (the chain hangs from -1 to 1)', 'height y', 'curve (0 = links found, 1 = continuous catenary)'], memeLongueur: [[0, 1]], autres: [2] },
  tautochrone: { colonnes: ['time t', 'distance s along the curve from the bottom', 'ball (label, 1 = released lowest)'], memeLongueur: [], autres: [0, 1, 2] },
  billardPi: { colonnes: ['sqrt(M) times the big block\'s speed', 'sqrt(m) times the small block\'s speed', 'collision number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  modesNormaux: { colonnes: ['mass number along the chain (0 and N + 1 are the fixed ends)', 'displacement', 'time t'], memeLongueur: [], autres: [0, 1, 2] },
  penduleAmplitude: { colonnes: ['angle theta (radians)', 'angular speed', 'time t'], memeLongueur: [], autres: [0, 1, 2] },
  phasesLune: { colonnes: ['x on the Moon\'s disc', 'y on the Moon\'s disc', 'phase angle in degrees (0 = full Moon)'], memeLongueur: [[0, 1]], autres: [2] },
  dureeJour: { colonnes: ['day of the year (0 = equinox)', 'hours of daylight', 'curve (0 = counted minute by minute, 1 = formula)'], memeLongueur: [], autres: [0, 1, 2] },
  courseRoulante: { colonnes: ['time t', 'distance down the slope', 'body (0 block, 1 sphere, 2 cylinder, 3 ring)'], memeLongueur: [], autres: [0, 1, 2] },
  corpsNoir: { colonnes: ['wavelength lambda (units of h c / (k T0))', 'spectral radiance B (Planck)', 'curve (0 = coolest, T = 1)'], memeLongueur: [], autres: [0, 1, 2] },
  reseauFentes: { colonnes: ['sin theta (direction seen)', 'intensity I / N^2', 'number of slits N (label)'], memeLongueur: [], autres: [0, 1, 2] },
  refractionSnell: { colonnes: ['x (the surface is y = 0)', 'height y (water below, air above)', 'ray number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  desintegration: { colonnes: ['time (steps)', 'atoms left', 'curve (0 = counted, 1 = N0 2^(-t/T))'], memeLongueur: [], autres: [0, 1, 2] },
  anneauxNewton: { colonnes: ['x (mm)', 'y (mm)', 'reflected intensity (0 dark, 1 bright)'], memeLongueur: [[0, 1]], autres: [2] },
  pendulesCouples: { colonnes: ['time t', 'swing x', 'pendulum (0 = first, 1 = second)'], memeLongueur: [], autres: [0, 1, 2] },
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
  { id: 'corpsNoir', nom: 'The glow of hot bodies (Planck\'s law)', science: 'Thermal physics', D: 3, nuage: true, params: { courbes: 5, rapport: 2 },
    bornes: { courbes: [2, 8], rapport: [1.2, 3] },
    phrase: 'A visualisation of the light given off by a body at several temperatures, Planck\'s law drawn curve by curve. Searched on each curve, the peak always sits at lambda_max T = 1 / x5 with x5 the root of x = 5 (1 - e^-x) (Wien): hotter glows bluer. Integrated, the area under each curve is T^4 pi^4 / 15 (Stefan-Boltzmann): twice as hot, sixteen times the power.' },
  { id: 'reseauFentes', nom: 'Light through many slits (a diffraction grating)', science: 'Waves', D: 3, nuage: true, params: { fentes: 6, espacement: 2.5 },
    bornes: { fentes: [3, 12], espacement: [1, 5] },
    phrase: 'A visualisation of light through 2 slits, then more, then N: the wave arriving in each direction is summed slit by slit. The bright orders stay where d sin theta = m lambda but grow sharper as slits are added; between two of them the summed curve has exactly N - 1 dark fringes and N - 2 small bright ones, as sin^2(N phi / 2) / (N^2 sin^2(phi / 2)) says.' },
  { id: 'refractionSnell', nom: 'Light bending into water (Fermat and the Snell window)', science: 'Geometric optics', D: 3, nuage: true, params: { indice: 1.33, rayons: 13 },
    bornes: { indice: [1.05, 2.5], rayons: [5, 25] },
    phrase: 'A visualisation of light from a point under water reaching targets in the air. No law of refraction is used: for every target the crossing point is searched as the one giving the FASTEST path (Fermat), and the bend comes out as n sin(water angle) = sin(air angle). Aimed at the horizon, the fastest path leaves at asin(1 / n): the whole sky fits in that cone, the Snell window; steeper rays never get out and are reflected.' },
  { id: 'desintegration', nom: 'Radioactive decay, atom by atom', science: 'Nuclear physics', D: 3, nuage: true, params: { atomes: 1000, demiVie: 20, graine: 1 },
    bornes: { atomes: [200, 5000], demiVie: [5, 50], graine: [0, 99] },
    phrase: 'A visualisation of radioactive decay with nothing but chance: at each step every atom left draws lots and decays with the same small probability. Counted, half the atoms are gone after one half-life, a quarter remain after two: the exponential law appears by itself. The half-life and the mean lifetime measured are compared with the exact values, the gap given in standard deviations because the atoms are finite in number.' },
  { id: 'anneauxNewton', nom: 'Newton\'s rings', science: 'Waves', D: 3, nuage: true, params: { lambda: 550, rayonLentille: 1, ecartAir: 0 },
    bornes: { lambda: [380, 750], rayonLentille: [0.5, 5], ecartAir: [0, 300] },
    phrase: 'A visualisation of the light reflected by a curved lens resting on flat glass: at each point the wave reflected by the lens and the one reflected by the glass below are summed. Dark rings appear wherever the air gap is a whole number of half-wavelengths; searched on the summed light, they sit exactly at sqrt(R^2 - (R - (m lambda / 2 - d0))^2), and their squared radii step by lambda R: redder light, wider rings.' },
  { id: 'pendulesCouples', nom: 'Two pendulums joined by a spring', science: 'Classical mechanics', D: 3, nuage: true, params: { couplage: 0.1, depart: 0 },
    bornes: { couplage: [0.02, 0.5], depart: [-1, 1] },
    phrase: 'A visualisation of two pendulums joined by a weak spring: start one, and its swing slowly passes to the other, then comes back. The two ways they can swing together are timed on their own: periods 2 pi and 2 pi / sqrt(1 + 2 k). The exchange takes exactly pi / (sqrt(1 + 2 k) - 1): the weaker the spring, the slower and the more complete the hand-over.' },
  { id: 'tautochrone', nom: 'The cycloid where every ball arrives together (tautochrone)', science: 'Classical mechanics', D: 3, nuage: true, params: { billes: 5, lacherHaut: 150 },
    bornes: { billes: [2, 8], lacherHaut: [30, 170] },
    phrase: 'A visualisation of balls let go together from different heights on an upside-down cycloid, with nothing but the equation of motion on that curve. Low or high, every ball reaches the bottom at the same moment, t = pi, and swings with the same period 4 pi (Huygens): along the curve the motion is exactly harmonic. A pendulum on a circle of the same bottom curvature, released as high, is timed beside it and falls behind.' },
  { id: 'chainette', nom: 'A hanging chain (the catenary)', science: 'Classical mechanics', D: 3, nuage: true, params: { maillons: 12, rapport: 1.4 },
    bornes: { maillons: [4, 30], rapport: [1.05, 2] },
    phrase: 'A visualisation of a chain of rigid links hanging from two hooks. Its shape is not assumed: it is searched by letting the chain lower its weight as far as the links allow. Found that way, the slopes of the links step up evenly from one link to the next, because each joint adds the same weight to the pull; with more links the chain closes in on the catenary a cosh(x / a), drawn beside it, not on a parabola.' },
  { id: 'echelleGlisse', nom: 'A ladder sliding down a wall', science: 'Classical mechanics', D: 3, nuage: true, params: { depart: 20, images: 8 },
    bornes: { depart: [5, 80], images: [4, 20] },
    phrase: 'A visualisation of a ladder let go against a smooth wall on a smooth floor, drawn at several instants. The push of the wall is read from the motion itself, as the acceleration of the middle of the ladder: it fades, and when it reaches zero the top leaves the wall, always at two thirds of its starting height, whatever the starting angle. Held on the wall any longer, the wall would have to pull.' },
  { id: 'perleCerceau', nom: 'A bead on a spinning hoop (a pitchfork)', science: 'Classical mechanics', D: 3, nuage: true, params: { omegaMax: 2.5, frottement: 0.3, vitesses: 24 },
    bornes: { omegaMax: [1.3, 4], frottement: [0.1, 1], vitesses: [10, 40] },
    phrase: 'A visualisation of a bead sliding on a hoop that spins about its vertical axis, run at many spins and left to settle with a little friction. Spun slowly, the bead always comes back to the bottom. Past one critical spin the bottom stops being stable and the bead climbs, to one side or the other, to the angle where cos theta = g / (omega^2 R): one path splits into two, a pitchfork, and the rest angles found match it.' },
  { id: 'dzhanibekov', nom: 'The tumbling racket (Dzhanibekov effect)', science: 'Classical mechanics', D: 3, nuage: true, params: { milieu: 2, ecartPuissance: 6 },
    bornes: { milieu: [1.3, 2.7], ecartPuissance: [4, 6] },
    phrase: 'A visualisation of a free body spun about the middle of its three axes, with nothing but the equations of Euler. A wobble too small to see grows, and the body turns over, again and again, at the time given by the exact Jacobi solution. Spun about the axis of least or of greatest inertia, the same wobble stays tiny: those two spins are stable, the middle one is not. Drawn is the spin vector seen from the body.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { billardPi: ['chiffres'], modesNormaux: ['masses', 'mode'], paraboleTir: ['angles'], penduleAmplitude: [], phasesLune: [], dureeJour: [], courseRoulante: [], corpsNoir: ['courbes'], reseauFentes: ['fentes'], refractionSnell: ['rayons'], desintegration: ['atomes', 'demiVie', 'graine'], anneauxNewton: [], pendulesCouples: [], tautochrone: ['billes'], chainette: ['maillons'], echelleGlisse: ['images'], perleCerceau: ['vitesses'], dzhanibekov: ['ecartPuissance'] };
const FONCTIONS = { billardPi, modesNormaux, paraboleTir, penduleAmplitude, phasesLune, dureeJour, courseRoulante, corpsNoir, reseauFentes, refractionSnell, desintegration, anneauxNewton, pendulesCouples, tautochrone, chainette, echelleGlisse, perleCerceau, dzhanibekov };
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
