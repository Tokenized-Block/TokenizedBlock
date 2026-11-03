// tam-ondes.js -- TAM, ondes, lumiere et son, chaque systeme une simulation honnete comparee a une formule EXACTE.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-biologie.js : SYSTEMES, ENTIERS, COLONNES, SOURCES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun hasard.
// DETERMINISME : aucune fonction transcendante native. sin/cos = ceux du moteur ; atan ici avec + - * / et Math.sqrt.
// REGLE DU PROJET : aucune valeur publiee sans source lue. Ici AUCUNE : l indice de refraction est un CURSEUR (rien n affirme celui de
//   l eau) ; vitesse de l onde c = 1 ; chaque formule comparee est derivee dans le commentaire de sa section ; SOURCES est vide expres.
// Les systemes :
//   arcEnCiel    : des rayons dans une goutte (Snell en vecteurs, une ou deux reflexions) ; deviation minimale = formule de Descartes.
//   cordeVibrante: une corde pincee ; schema au nombre de Courant 1, EXACT pour l equation des ondes : retour a la forme de depart apres
//                  une periode, harmoniques de la corde pincee (sin(n pi a) / n^2), harmoniques absentes aux noeuds.
//   effetDoppler : les fronts d onde d une source en mouvement ; longueurs d onde (c - v) T devant et (c + v) T derriere, cone de Mach
//                  sin(theta) = 1 / M au-dela du son.
import { sinD, cosD } from './tam-moteur.js';

const PI = Math.PI;

export const SOURCES = Object.freeze({});

/* atan avec + - * / et sqrt (meme methode que tam-theories-3.js) */
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
const asinD = (x) => atan2D(x, Math.sqrt(Math.max(0, 1 - x * x)));
function decouper(n, images) { const d = []; for (let k = 0; k < images; k++) d.push(Math.floor(k * n / images)); return d; }
function filmDe(debuts, n) {
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}

// ---------- 1 : l arc-en-ciel ----------
// Goutte spherique de rayon 1 (coupe plane), rayons paralleles arrivant de la gauche (direction +x) a la hauteur b (0 < b < 1).
// Trace VECTORIEL : refraction de Snell (n1 sin i = n2 sin r, forme vectorielle t = eta d + (eta cos i - cos t) N), reflexions internes
//   (d - 2 (d.N) N), refraction de sortie. La deviation est l angle entre la direction d entree et celle de sortie (mesure).
// Exact (Descartes, derive ici) : avec k reflexions internes, D(i) = pi k + 2 i - 2 (k + 1) r (sin i = n sin r) ; dD/di = 0 donne
//   cos^2 i* = (n^2 - 1) / (k (k + 2)), soit (n^2 - 1)/3 pour l arc primaire (k = 1) et (n^2 - 1)/8 pour le secondaire (k = 2).
//   Mesure : minimum de la deviation tracee sur 4000 rayons (le minimum est plat : erreur quadratique du pas).
// Dessin : le contour de la goutte puis 15 rayons (k = 1), chacun echantillonne le long de son chemin (entree, reflexion, sortie, puis
//   1.2 au-dela) : un nuage.
function tracer(b, nIdx, k) {
  /* entree au point (-sqrt(1 - b^2), b), direction d = (1, 0) */
  let p = [-Math.sqrt(1 - b * b), b], d = [1, 0];
  const chemin = [[-2, b], p.slice()];
  /* sonde du 03/11 : l angle entre entree et sortie se REPLIE au-dela de 180 degres (n = 1.9 : 129.6 au lieu de 178.5) ; on suit la
   *   rotation TOTALE : a chaque evenement la direction tourne dans le meme sens (horaire pour b > 0), deroulee dans ]-2 pi, 0] */
  let phi = 0, rot = 0; const tourner = (dd) => { const a2 = atan2D(dd[1], dd[0]); let dl = a2 - phi; while (dl > 1e-12) dl -= 2 * PI; while (dl <= -2 * PI) dl += 2 * PI; rot -= dl; phi = a2; };
  const refr = (dd, N, eta) => { const ci = -(dd[0] * N[0] + dd[1] * N[1]), s2 = eta * eta * (1 - ci * ci); if (s2 > 1) return null; const ct = Math.sqrt(1 - s2); return [eta * dd[0] + (eta * ci - ct) * N[0], eta * dd[1] + (eta * ci - ct) * N[1]]; };
  d = refr(d, [p[0], p[1]], 1 / nIdx); if (!d) return null; tourner(d);
  for (let r = 0; r <= k; r++) {
    /* prochaine sortie de la sphere : p + s d avec |p + s d| = 1, s = -2 p.d (p sur le cercle) */
    const s = -2 * (p[0] * d[0] + p[1] * d[1]); p = [p[0] + s * d[0], p[1] + s * d[1]]; chemin.push(p.slice());
    const N = [-p[0], -p[1]]; /* normale interieure */
    if (r < k) { const dn = d[0] * N[0] + d[1] * N[1]; d = [d[0] - 2 * dn * N[0], d[1] - 2 * dn * N[1]]; tourner(d); }
    else { d = refr(d, N, nIdx); if (!d) return null; tourner(d); } /* N interieure = face au rayon qui sort */
  }
  chemin.push([p[0] + 1.2 * d[0], p[1] + 1.2 * d[1]]);
  return { chemin, deviation: rot };
}
function arcEnCiel(P, n) {
  const nIdx = P.indice, M = 4000, mins = {}, brut = new Float64Array(n * 3);
  for (const k of [1, 2]) {
    let best = Infinity, bBest = NaN;
    for (let j = 1; j < M; j++) { const b = j / M, t = tracer(b, nIdx, k); if (!t) continue; const D = t.deviation; if (D < best) { best = D; bBest = b; } }
    const ci = Math.sqrt((nIdx * nIdx - 1) / (k * (k + 2))), si = Math.sqrt(1 - ci * ci), i = atan2D(si, ci), r = asinD(si / nIdx);
    mins[k] = { mesure: best, formule: PI * k + 2 * i - 2 * (k + 1) * r, bMin: bBest };
  }
  /* game121 (vu a l ecran : 41 rayons x ~36 points, l oeil reliait les rayons VOISINS — des colonnes en travers) : 15 rayons denses, et
   *   le contour de la goutte (premier « chemin », 3e colonne 0) */
  const R = 15, chemins = [Array.from({ length: 73 }, (_, q) => [cosD(2 * PI * q / 72), sinD(2 * PI * q / 72)])];
  for (let j = 0; j < R; j++) { const t = tracer((j + 0.5) / R, nIdx, 1); if (t) chemins.push(t.chemin); }
  /* echantillonnage regulier le long de chaque chemin ; 3e colonne = hauteur d entree b (etiquette) */
  const parRayon = Math.max(2, Math.floor(n / chemins.length));
  let l = 0;
  for (let c = 0; c < chemins.length && l < n; c++) { const ch = chemins[c], seg = [], tot = []; let L = 0;
    for (let s = 1; s < ch.length; s++) { const dl = Math.sqrt((ch[s][0] - ch[s - 1][0]) ** 2 + (ch[s][1] - ch[s - 1][1]) ** 2); seg.push(dl); L += dl; tot.push(L); }
    const nb = c === chemins.length - 1 ? n - l : parRayon;
    for (let q = 0; q < nb && l < n; q++) { const u = nb === 1 ? 0 : q * L / (nb - 1); let s = 0; while (s < seg.length - 1 && tot[s] < u) s++;
      const u0 = s ? tot[s - 1] : 0, f = seg[s] > 0 ? (u - u0) / seg[s] : 0, a = ch[s], b2 = ch[s + 1], o = 3 * l;
      brut[o] = a[0] + f * (b2[0] - a[0]); brut[o + 1] = a[1] + f * (b2[1] - a[1]); brut[o + 2] = c === 0 ? 0 : ch[0][1]; l++; } }
  const deg = 180 / PI;
  return { D: 3, brut, nuage: true, unite: 'sans objet (optique geometrique)', invariants: {
    arcPrimaire: { mesure: mins[1].mesure * deg, formule: mins[1].formule * deg, hauteur: mins[1].bMin, indice: nIdx, rayons: M,
      note: 'smallest deviation (degrees) of rays with one reflection inside the drop, traced ray by ray, against Descartes: cos^2 i = (n^2 - 1)/3 ; the rainbow sits at 180 minus it' },
    arcSecondaire: { mesure: mins[2].mesure * deg, formule: mins[2].formule * deg, hauteur: mins[2].bMin,
      note: 'the same with two reflections (the second, fainter bow): cos^2 i = (n^2 - 1)/8' } } };
}

// ---------- 2 : une corde vibrante ----------
// Corde de longueur 1, extremites fixes, vitesse c = 1, N cellules (dx = 1/N), pas dt = dx : nombre de Courant 1. A ce nombre le schema
//   u_i^(t+1) = u_(i+1)^t + u_(i-1)^t - u_i^(t-1) est EXACT pour l equation des ondes (il reproduit la solution de d Alembert aux noeuds
//   de la grille). Depart : pincee au point a (triangle de hauteur 1), au repos : u^1 = (u_(i+1)^0 + u_(i-1)^0) / 2 (exact au repos).
//   Exact : periode 2 L / c = 2 N pas ; apres une periode la corde reprend EXACTEMENT sa forme (mesure : pire ecart, arrondi).
//   Harmoniques : coefficient n de la serie en sinus du triangle (continu) b_n = 2 sin(n pi a) / (n^2 pi^2 a (1 - a)) ; ceux de la corde
//   DISCRETE sont lus par transformee en sinus et compares (APPROCHE : discretisation, O(1/N^2)). Pincee en a = p/q, l harmonique q est
//   nulle (noeud au point pince) : mesuree exactement a l arrondi pres quand a N est entier.
// Dessin : un film de 8 instants sur une demi-periode ; chaque image = la forme de la corde (x, u) ; 3e colonne : le temps.
const CORDE_IMAGES = 8;
function cordeVibrante(P, n) {
  const N = P.cellules, a = P.pince, ia = Math.round(a * N), aa = ia / N, pas = 2 * N;
  const u0 = new Float64Array(N + 1); for (let i = 0; i <= N; i++) u0[i] = i <= ia ? i / ia : (N - i) / (N - ia);
  let prec = u0.slice(), cour = new Float64Array(N + 1); for (let i = 1; i < N; i++) cour[i] = (u0[i + 1] + u0[i - 1]) / 2;
  const images = Math.min(CORDE_IMAGES, n), film = filmDe(decouper(n, images), n), brut = new Float64Array(n * 3);
  const instantImage = (f) => (images === 1 ? 0 : Math.round(f * N / (images - 1))); /* 0 .. N (une demi-periode) */
  const ecrireImage = (f, u, st) => { const d0 = film.debuts[f], c = film.tailles[f]; for (let r = 0; r < c; r++) { const i = c === 1 ? 0 : Math.round(r * N / (c - 1)), o = 3 * (d0 + r); brut[o] = i / N; brut[o + 1] = u[i]; brut[o + 2] = st / N; } };
  let f = 0; while (f < images && instantImage(f) === 0) { ecrireImage(f, u0, 0); f++; }
  let pireDemi = 0;
  for (let st = 1; st <= pas; st++) {
    if (st > 1) { const nv = new Float64Array(N + 1); for (let i = 1; i < N; i++) nv[i] = cour[i + 1] + cour[i - 1] - prec[i]; prec = cour; cour = nv; }
    while (f < images && instantImage(f) === st) { ecrireImage(f, cour, st); f++; }
    if (st === N) for (let i = 0; i <= N; i++) pireDemi = Math.max(pireDemi, Math.abs(cour[i] + u0[N - i])); /* demi-periode : u(x) = -u0(L - x) */
  }
  let pire = 0; for (let i = 0; i <= N; i++) pire = Math.max(pire, Math.abs(cour[i] - u0[i]));
  /* transformee en sinus discrete de la forme de depart : b_m = (2/N) sum u0_i sin(m pi i / N) */
  const bm = (m) => { let s = 0; for (let i = 1; i < N; i++) s += u0[i] * sinD(m * PI * i / N); return 2 * s / N; };
  const bth = (m) => 2 * sinD(m * PI * aa) / (m * m * PI * PI * aa * (1 - aa));
  let pireH = 0; for (let m = 1; m <= 6; m++) pireH = Math.max(pireH, Math.abs(bm(m) - bth(m)));
  /* harmonique au noeud : le plus petit q tel que q * aa soit entier (q <= 12), si il existe */
  let q = 0; for (let m = 2; m <= 12 && !q; m++) if (Math.abs(m * ia - Math.round(m * ia / N) * N) === 0) q = m;
  return { D: 3, brut, film, unite: 'sans objet (ondes, non chaotique)', invariants: {
    retourPeriode: { mesure: pire, formule: 0, pas, cellules: N, note: 'largest gap between the string after one period 2L/c and its starting shape (the Courant-1 scheme is exact: only rounding is left)' },
    demiPeriode: { mesure: pireDemi, formule: 0, note: 'after half a period the shape is the start turned upside down and mirrored, u(x) = -u0(L - x) (exact)' },
    harmonique1: { mesure: bm(1), formule: bth(1), pireEcart6: pireH, approchee: 'the formula is for a continuous string; the grid of ' + N + ' cells differs by O(1/N^2)',
      note: 'weight of the fundamental in the plucked shape against 2 sin(pi a) / (pi^2 a (1 - a))' },
    ...(q ? { harmoniqueNoeud: { mesure: bm(q), formule: 0, rang: q, note: 'plucked at a = ' + ia + '/' + N + ' : harmonic ' + q + ' has a node there and is not excited at all' } } : {}) } };
}

// ---------- 3 : effet Doppler et cone de Mach ----------
// Source se deplacant a la vitesse v = M c (c = 1) le long de x, emettant un front d onde a chaque periode T0 = 1. A l instant
//   d observation t, le front emis a t_k depuis x_k = v t_k est un cercle de rayon c (t - t_k). Exact (derive ici) :
//   devant la source, deux fronts voisins sont separes de (c - v) T0 ; derriere, de (c + v) T0 : frequence percue c / (c - v) devant.
//   Si M > 1 la source depasse ses fronts : leur enveloppe est un cone de demi-angle theta, sin theta = 1 / M.
//   Mesures : ecarts relus sur les cercles construits (axe +x et -x), et pour M > 1 la plus grande valeur de r_k / d_k (distance du centre
//   a la source), qui vaut sin theta pour chaque front.
// Dessin : les fronts (points sur chaque cercle) a l instant t = 16 T0 ; 3e colonne : l instant d emission (etiquette). Vue de face.
const DOPPLER_FRONTS = 16;
function effetDoppler(P, n) {
  const M = P.mach, v = M, t = DOPPLER_FRONTS, K = DOPPLER_FRONTS, brut = new Float64Array(n * 3), xs = v * t;
  const fronts = []; for (let k = 0; k < K; k++) { const tk = k, xk = v * tk, rk = t - tk; fronts.push({ tk, xk, rk }); }
  const par = Math.max(1, Math.floor(n / K)); let l = 0;
  for (let k = 0; k < K && l < n; k++) { const F = fronts[k], nb = k === K - 1 ? n - l : par;
    for (let q = 0; q < nb && l < n; q++) { const a = 2 * PI * q / nb, o = 3 * l; brut[o] = F.xk + F.rk * cosD(a); brut[o + 1] = F.rk * sinD(a); brut[o + 2] = F.tk; l++; } }
  const inv = {};
  if (M < 1) {
    let ecDev = 0, ecDer = 0; for (let k = 0; k + 1 < K; k++) { ecDev += (fronts[k].xk + fronts[k].rk) - (fronts[k + 1].xk + fronts[k + 1].rk); ecDer += (fronts[k + 1].xk - fronts[k + 1].rk) - (fronts[k].xk - fronts[k].rk); }
    inv.devant = { mesure: ecDev / (K - 1), formule: 1 - v, note: 'spacing of the wavefronts ahead of the source against (c - v) T0 : squeezed, a higher pitch' };
    inv.derriere = { mesure: ecDer / (K - 1), formule: 1 + v, note: 'spacing behind the source against (c + v) T0 : stretched, a lower pitch' };
    inv.frequenceDevant = { mesure: 1 / (ecDev / (K - 1)), formule: 1 / (1 - v), note: 'frequency heard ahead, as a multiple of the one emitted, against 1 / (1 - M)' };
  } else {
    let m = 0; for (const F of fronts) { const d = xs - F.xk; if (d > 0) m = Math.max(m, F.rk / d); }
    inv.cone = { mesure: m, formule: 1 / M, angleDegres: asinD(Math.min(1, 1 / M)) * 180 / PI, note: 'sine of the half-angle of the Mach cone (the fronts\' envelope) against 1 / M' };
  }
  inv.source = { mach: M, fronts: K, note: M < 1 ? 'slower than the waves: the fronts stay nested' : M === 1 ? 'exactly at the speed of the waves: the fronts pile up in front' : 'faster than the waves: a shock cone (sonic boom)' };
  return { D: 3, brut, nuage: true, unite: 'sans objet (ondes, non chaotique)', invariants: inv };
}

// ---------- 4 : une lentille mince ----------
// Lentille mince de focale f = 1 en x = 0 ; objet ponctuel a la distance do (curseur) et a la hauteur 1, a gauche. 9 rayons partent de
//   l objet vers des hauteurs de -1 a 1 sur la lentille ; regle de la lentille (paraxiale) : la pente change de -y/f a la traversee.
// Exact (derive ici) : tous les rayons repassent par un meme point, l image, a di = 1 / (1/f - 1/do) (relation de conjugaison), hauteur
//   -di/do (grandissement). Si do < f, di < 0 : les rayons divergent, leurs prolongements se coupent DEVANT la lentille (image virtuelle).
// Mesures : point de croisement des rayons par moindres carres (aucune formule dedans) ; plus grand ecart d un rayon a ce point.
// Dessin : les rayons (points le long de chacun) et leurs prolongements en arriere si l image est virtuelle ; 3e colonne : numero du rayon.
function lentilleMince(P, n) {
  const f = 1, dO = P.distance, x0 = -dO, y0 = 1, R = 9, rayons = [];
  for (let k = 0; k < R; k++) { const yl = -1 + 2 * k / (R - 1), s1 = (yl - y0) / dO, s2 = s1 - yl / f; rayons.push({ yl, s1, s2 }); }
  /* point commun : minimise sum (y - yl - s2 x)^2 sur (x, y) : droites y = yl + s2 x apres la lentille (prolongees si besoin) */
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (const r of rayons) { const nn = Math.sqrt(1 + r.s2 * r.s2), nx = -r.s2 / nn, ny = 1 / nn, c = r.yl / nn; a11 += nx * nx; a12 += nx * ny; a22 += ny * ny; b1 += nx * c; b2 += ny * c; }
  const det = a11 * a22 - a12 * a12, xi = (b1 * a22 - b2 * a12) / det, yi = (a11 * b2 - a12 * b1) / det;
  let pire = 0; for (const r of rayons) pire = Math.max(pire, Math.abs(yi - r.yl - r.s2 * xi) / Math.sqrt(1 + r.s2 * r.s2));
  /* sonde du 03/11 : objet AU foyer (do = f, dans la plage du curseur) : image a l infini, le run sortait en NaN ; tout pres, image a 1e6
   *   (dessin ecrase, moindres carres imprecis) -> au-dela de |di| = 20, l image est dite tres lointaine, et le dessin s arrete a x = 8 */
  const inv = 1 / f - 1 / dO, loin = Math.abs(inv) < 0.05, di = loin ? NaN : 1 / inv, virtuelle = !loin && di < 0, xFin = virtuelle || loin ? 3 : Math.min(8, Math.max(3, di + 1));
  const brut = new Float64Array(n * 3), par = Math.max(4, Math.floor(n / R)); let l = 0;
  for (let k = 0; k < R && l < n; k++) { const r = rayons[k], nb = k === R - 1 ? n - l : par;
    for (let q = 0; q < nb && l < n; q++) { const u = q / (nb - 1 || 1); let x, y;
      if (virtuelle && u > 0.75) { x = xi + (0 - xi) * (u - 0.75) / 0.25; y = r.yl + r.s2 * x; } /* prolongement en arriere jusqu a l image virtuelle */
      else { const w = virtuelle ? u / 0.75 : u, x1 = x0 + (xFin - x0) * w; x = x1; y = x1 <= 0 ? y0 + r.s1 * (x1 - x0) : r.yl + r.s2 * x1; }
      const o = 3 * l++; brut[o] = x; brut[o + 1] = y; brut[o + 2] = k + 1; } }
  const tropLoin = loin ? { absente: 'the object is at (or very near) the focal point: the rays leave almost parallel and meet very far away (|di| > 20)' } : {};
  return { D: 3, brut, nuage: true, unite: 'sans objet (optique paraxiale)', invariants: {
    image: { mesure: loin ? NaN : xi, formule: di, ...tropLoin, virtuelle: virtuelle ? 1 : 0, note: 'where the rays (or their backward extensions) meet, found by least squares, against 1 / (1/f - 1/do)' },
    grandissement: { mesure: loin ? NaN : yi / y0, formule: -di / dO, ...tropLoin, note: 'image height over object height against -di / do' },
    convergence: { mesure: loin ? NaN : pire, formule: 0, ...tropLoin, note: 'largest distance from a ray to the common point (they all pass through it)' } } };
}

export const COLONNES = Object.freeze({
  arcEnCiel: { colonnes: ['x (drop of radius 1 at the centre)', 'y (same)', 'height b at which the ray came in (label; 0 = the drop outline)'], memeLongueur: [[0, 1]], autres: [2] },
  cordeVibrante: { colonnes: ['position along the string (0 to 1)', 'displacement u', 'time (in units of L / c)'], memeLongueur: [], autres: [0, 1, 2] },
  lentilleMince: { colonnes: ['x along the axis (lens at 0, focal length 1)', 'height y', 'ray number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  effetDoppler: { colonnes: ['x (wavelengths)', 'y (wavelengths)', 'time the front was sent (label)'], memeLongueur: [[0, 1]], autres: [2] },
});

export const SYSTEMES = Object.freeze([
  { id: 'arcEnCiel', nom: 'Why a rainbow (rays in a raindrop)', science: 'Geometric optics', D: 3, nuage: true, params: { indice: 1.33 },
    bornes: { indice: [1.1, 1.9] },
    phrase: 'A visualisation of light rays entering a round drop, bending (Snell\'s law), bouncing once inside and leaving. Traced ray by ray, they all turn back by at least a smallest angle, and pile up there: that is the rainbow. The smallest deviation is compared with Descartes\' exact result cos^2 i = (n^2 - 1)/3, and the second, fainter bow (two bounces) with (n^2 - 1)/8. The refractive index n is a slider.' },
  { id: 'cordeVibrante', nom: 'A plucked string (the wave equation)', science: 'Waves', D: 3, params: { pince: 0.2, cellules: 200 },
    bornes: { pince: [0.05, 0.5], cellules: [40, 400] },
    phrase: 'A visualisation of a plucked string, frame by frame over half a period, solved by a scheme that is exact for the wave equation (Courant number 1): after one period the string is back in its exact starting shape, after half a period it is upside down and mirrored. Its harmonics follow 2 sin(n pi a)/(n^2 pi^2 a (1 - a)); pluck it in the middle and every even harmonic vanishes.' },
  { id: 'effetDoppler', nom: 'The Doppler effect and the sonic boom', science: 'Waves', D: 3, nuage: true, params: { mach: 0.5 },
    bornes: { mach: [0, 2] },
    phrase: 'A visualisation of the wavefronts sent by a moving source, one per period. Ahead of it they bunch up to (c - v) T, behind they spread to (c + v) T: a higher pitch coming, a lower one going. Faster than the waves (Mach M > 1) the source outruns its own fronts and they gather on a cone with sin(theta) = 1/M: the sonic boom.' },
  { id: 'lentilleMince', nom: 'A thin lens forms an image', science: 'Geometric optics', D: 3, nuage: true, params: { distance: 3 },
    bornes: { distance: [0.3, 6] },
    phrase: 'A visualisation of nine rays leaving a point of an object, crossing a thin lens of focal length 1 and meeting again at the image, exactly where 1/do + 1/di = 1/f puts it, magnified by -di/do. Bring the object inside the focal length and the rays spread out: their backward extensions meet in front of the lens, a virtual image (the magnifying glass).' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { arcEnCiel: [], cordeVibrante: ['cellules'], effetDoppler: [], lentilleMince: [] };
const FONCTIONS = { arcEnCiel, cordeVibrante, effetDoppler, lentilleMince };
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
