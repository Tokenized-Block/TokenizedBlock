// tam-maths.js -- TAM, mathematiques du hasard et des nombres, chaque systeme une simulation honnete comparee a une formule EXACTE.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-biologie.js : SYSTEMES, ENTIERS, COLONNES, SOURCES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun generateur aleatoire natif (graines : mulberry32).
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux du moteur.
// REGLE DU PROJET : aucune valeur publiee sans source lue. Ici AUCUNE : le nombre de jours d une annee est un CURSEUR (365 par defaut,
//   rien n est affirme) ; chaque formule comparee est derivee dans le commentaire de sa section ; SOURCES est vide expres.
// Les systemes :
//   marcheAleatoire : marches au hasard sur une grille ; <r^2> = n et Var r^2 = n^2 - n EXACTS.
//   aiguilleBuffon  : aiguilles jetees sur un parquet ; P(croise) = 2 l / (pi d) exact, pi relu (approche).
//   anniversaires   : groupes de k personnes ; P(deux partagent un jour) = 1 - prod (1 - i/D) exact.
//   spiraleUlam     : les nombres premiers sur la spirale d Ulam ; leur nombre compare a li(N) et N / ln N (approches : theoreme
//                     des nombres premiers).
import { sinD, cosD, lnD } from './tam-moteur.js';

/* atan avec + - * / et sqrt (meme methode que tam-theories-3.js) */
function atanD(x) { if (!(x - x === 0)) return x === Infinity ? Math.PI / 2 : x === -Infinity ? -Math.PI / 2 : NaN; if (x < 0) return -atanD(-x); if (x > 1) return Math.PI / 2 - atanD(1 / x);
  let y = x / (1 + Math.sqrt(1 + x * x)); y = y / (1 + Math.sqrt(1 + y * y)); const y2 = y * y; let t = y, s = 0; for (let k = 0; k < 30; k++) { s += t / (2 * k + 1); t *= -y2; } return 4 * s; }
function atan2D(y, x) { if (x > 0) return atanD(y / x); if (x < 0) return atanD(y / x) + (y >= 0 ? Math.PI : -Math.PI); return y > 0 ? Math.PI / 2 : y < 0 ? -Math.PI / 2 : 0; }

const PI = Math.PI;

export const SOURCES = Object.freeze({});

function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* e^u, u >= 0 : u divise par 2 jusqu a <= 1/2, serie a 30 termes, puis carres (+ - * / seulement) */
function expPosD(u) { let m = 0; while (u > 0.5) { u /= 2; m++; } let s = 1, t = 1; for (let j = 1; j <= 30; j++) { t *= u / j; s += t; } for (let i = 0; i < m; i++) s *= s; return s; }
function decouper(n, images) { const d = []; for (let k = 0; k < images; k++) d.push(Math.floor(k * n / images)); return d; }
function filmDe(debuts, n) {
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}

// ---------- 1 : marche au hasard sur une grille ----------
// Chaque pas : un des 4 voisins, au hasard. Pas e_i unitaires independants, E[e_i . e_j] = 0 (i != j). Exact (derive ici) :
//   r^2 = sum_i sum_j e_i . e_j, donc E[r^2] = n (seuls les termes i = j restent).
//   E[r^4] = sum E[(e_i.e_j)(e_k.e_l)] : termes (i = j, k = l) -> n^2 ; (i != j, {k, l} = {i, j}) -> 2 n (n - 1) E[(e_i.e_j)^2] = n (n - 1)
//   (e_i.e_j vaut 1, -1, 0, 0 avec la meme chance : carre moyen 1/2). Donc Var r^2 = 2 n^2 - n - n^2 = n^2 - n, exact.
//   Moyenne sur M marcheurs : sigma = sqrt((n^2 - n)/M). Et E[x] = 0, Var x = n/2 : sigma sqrt(n / (2 M)).
// Dessin : un film, une image par marcheur (les 12 premiers) : son chemin (x, y) pas a pas.
const MARCHE_DESSINES = 12;
function marcheAleatoire(P, n) {
  const M = P.marcheurs, N = P.pas, rng = mulberry32(P.graine), K = Math.min(MARCHE_DESSINES, M, n);
  const debuts = decouper(n, K), film = filmDe(debuts, n), brut = new Float64Array(n * 3);
  let s2 = 0, sx = 0;
  /* banc du 03/11 : les 12 premiers marcheurs ne dependaient pas de M (curseur « walkers » muet) : on dessine le marcheur floor(f M / K) */
  const quiDessine = new Int32Array(M).fill(-1); for (let f = 0; f < K; f++) quiDessine[Math.floor(f * M / K)] = f;
  for (let w = 0; w < M; w++) {
    let x = 0, y = 0;
    const fi = quiDessine[w], dessine = fi >= 0, d0 = dessine ? film.debuts[fi] : 0, c = dessine ? film.tailles[fi] : 0;
    let ligne = 0;
    const ecrire = (st) => { while (ligne < c && Math.round(ligne * N / (c - 1 || 1)) === st) { const o = 3 * (d0 + ligne); brut[o] = x; brut[o + 1] = y; brut[o + 2] = st; ligne++; } };
    if (dessine) ecrire(0);
    for (let st = 1; st <= N; st++) {
      const u = Math.floor(rng() * 4); if (u === 0) x++; else if (u === 1) x--; else if (u === 2) y++; else y--;
      if (dessine) ecrire(st);
    }
    s2 += x * x + y * y; sx += x;
  }
  return { D: 3, brut, film, unite: 'sans objet (hasard, non chaotique)', invariants: {
    carreDistance: { mesure: s2 / M, formule: N, sigma: Math.sqrt((N * N - N) / M), marcheurs: M, pas: N,
      note: 'mean squared distance from the start after n steps against n (exact) ; sigma from the exact variance n^2 - n' },
    centre: { mesure: sx / M, formule: 0, sigma: Math.sqrt(N / (2 * M)), note: 'mean x position against 0 : no preferred direction (exact), sigma sqrt(n / 2M)' } } };
}

// ---------- 2 : l aiguille de Buffon ----------
// Parquet de lattes de largeur d = 1 (droites y = entier), aiguille de longueur l <= 1 jetee au hasard : centre a une hauteur uniforme,
//   angle uniforme. Exact (derive ici) : elle croise une droite si la distance du centre a la droite la plus proche (uniforme sur
//   [0, 1/2]) est <= (l/2) |sin theta| ; P = int_0^pi (l |sin theta| / 2) / (1/2) dtheta / pi = 2 l / pi.
//   N aiguilles independantes : compte binomial, sigma exact. pi relu = 2 l N / croisements (sigma par la methode delta, APPROCHE).
// Dessin : chaque aiguille dessinee = deux lignes (ses deux bouts) ; 3e colonne : 1 si elle croise une droite, 0 sinon.
function aiguilleBuffon(P, n) {
  const N = P.aiguilles, l = P.longueur, rng = mulberry32(P.graine), dessinees = Math.max(1, Math.floor(n / 2)), brut = new Float64Array(n * 3);
  let croise = 0, k = 0;
  for (let i = 0; i < N; i++) {
    const cx = rng() * 10, cy = rng() * 10, th = rng() * PI, dx = 0.5 * l * cosD(th), dy = 0.5 * l * sinD(th);
    const y1 = cy - dy, y2 = cy + dy, c = Math.floor(y1) !== Math.floor(y2) ? 1 : 0;
    croise += c;
    if (k < dessinees && Math.floor(i * dessinees / N) === k) { const o = 6 * k; brut[o] = cx - dx; brut[o + 1] = y1; brut[o + 2] = c; brut[o + 3] = cx + dx; brut[o + 4] = y2; brut[o + 5] = c; k++; }
  }
  if (n % 2) { const o = 3 * (n - 1); brut[o] = brut[o - 3]; brut[o + 1] = brut[o - 2]; brut[o + 2] = brut[o - 1]; }
  const p = 2 * l / PI, ph = croise / N, sP = Math.sqrt(p * (1 - p) / N);
  return { D: 3, brut, nuage: true, unite: 'sans objet (hasard, non chaotique)', invariants: {
    croisements: { mesure: ph, formule: p, sigma: sP, aiguilles: N, note: 'share of needles crossing a line against 2 l / (pi d) (Buffon, exact) ; binomial sigma' },
    piLu: { mesure: croise ? 2 * l / ph : NaN, formule: PI, sigma: PI * sP / p, ...(croise ? {} : { absente: 'no needle crossed a line' }),
      approchee: 'read back as 2 l / share, first-order sigma', note: 'pi read back from the needles against pi' } } };
}

// ---------- 3 : le paradoxe des anniversaires ----------
// Groupes de k personnes, chacune nee un jour uniforme parmi D (curseur, 365 par defaut). Exact (derive ici) :
//   P(tous differents) = prod_{i=0}^{k-1} (1 - i/D), P(au moins un partage) = 1 - ce produit ;
//   nombre moyen de paires nees le meme jour = C(k, 2) / D (chaque paire a la chance 1/D).
//   G groupes independants : part binomiale, sigma exact ; paires : sigma mesure (ecart-type des groupes / sqrt G).
// Dessin : les anniversaires des premiers groupes, en cercle (angle = jour) ; un groupe par rayon ; 3e colonne : numero du groupe.
function anniversaires(P, n) {
  const k = P.personnes, D = P.jours, G = P.groupes, rng = mulberry32(P.graine), brut = new Float64Array(n * 3);
  let partage = 0, sp = 0, sp2 = 0, ligne = 0;
  const vu = new Int32Array(D);
  /* banc du 03/11 : les premiers groupes ne dependaient pas de G (curseur « groups » muet) : on dessine un groupe tous les G / gd */
  const gd = Math.max(1, Math.min(G, Math.ceil(n / k))); let rang = 0;
  for (let g = 0; g < G; g++) {
    vu.fill(0); let paires = 0; const dessine = rang < gd && Math.floor(rang * G / gd) === g;
    for (let i = 0; i < k; i++) { const j = Math.floor(rng() * D); paires += vu[j]; vu[j]++;
      if (dessine && ligne < n) { const a = 2 * PI * j / D, rr = 1 + 0.15 * rang, o = 3 * ligne; brut[o] = rr * cosD(a); brut[o + 1] = rr * sinD(a); brut[o + 2] = g + 1; ligne++; } }
    if (dessine) rang++;
    if (paires) partage++; sp += paires; sp2 += paires * paires;
  }
  while (ligne < n) { const o = 3 * ligne; brut[o] = brut[o - 3]; brut[o + 1] = brut[o - 2]; brut[o + 2] = brut[o - 1]; ligne++; }
  let tousDiff = 1; for (let i = 0; i < k; i++) tousDiff *= 1 - i / D;
  const p = 1 - tousDiff, mp = sp / G, sdp = Math.sqrt(Math.max(0, sp2 / G - mp * mp) * G / (G - 1));
  return { D: 3, brut, nuage: true, unite: 'sans objet (hasard, non chaotique)', invariants: {
    partage: { mesure: partage / G, formule: p, sigma: Math.sqrt(p * (1 - p) / G), groupes: G, personnes: k, jours: D,
      note: 'share of groups where two people share a birthday against 1 - prod (1 - i/D) (exact) ; binomial sigma' },
    paires: { mesure: mp, formule: k * (k - 1) / (2 * D), ...(sdp > 0 ? { sigma: sdp / Math.sqrt(G) } : {}), note: 'mean number of pairs born on the same day against C(k, 2) / D (exact) ; sigma measured' } } };
}

// ---------- 4 : les nombres premiers sur la spirale d Ulam ----------
// Crible d Eratosthene jusqu a N ; chaque entier place sur la spirale carree (1 au centre). On dessine les premiers.
// Compte EXACT pi(N) (crible) compare a deux formules APPROCHEES du theoreme des nombres premiers : N / ln N (sous-estime) et
//   Li(N) = int_2^N dt / ln t (integree en u = ln t, voir plus bas). Ecart relatif mesure, affiche.
// Ecart moyen entre premiers voisins pres de N : mesure, compare a ln N (approche).
function spiraleUlam(P, n) {
  const N = P.jusqua, crible = new Uint8Array(N + 1);
  crible[0] = 1; crible[1] = 1;
  for (let i = 2; i * i <= N; i++) if (!crible[i]) for (let j = i * i; j <= N; j += i) crible[j] = 1;
  const premiers = []; for (let i = 2; i <= N; i++) if (!crible[i]) premiers.push(i);
  /* position de m sur la spirale carree : anneau k = ceil((sqrt m - 1)/2), cote 2k, depart du coin bas-droit */
  const pos = (m) => { if (m === 1) return [0, 0]; const k = Math.ceil((Math.sqrt(m) - 1) / 2), t = 2 * k, mx = (t + 1) * (t + 1);
    let d = mx - m; if (d < t) return [k - d, -k]; d -= t; if (d < t) return [-k, -k + d]; d -= t; if (d < t) return [-k + d, k]; d -= t; return [k, k - d]; };
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const p = premiers[Math.floor(l * premiers.length / n)], [x, y] = pos(p), o = 3 * l; brut[o] = x; brut[o + 1] = y; brut[o + 2] = p; }
  /* Li(N) = int_{ln 2}^{ln N} e^u / u du (t = e^u) : integrande lisse, Simpson sur 20 000 intervalles. Banc du 03/11 : Simpson en t au
   *   pas 2 ratait la forte courbure de 1/ln t pres de 2 (1.8e-5 relatif a N = 40 000) */
  const M = 20000, u0 = lnD(2), u1 = lnD(N), h = (u1 - u0) / M, fu = (u) => expPosD(u) / u; let s = fu(u0) + fu(u1);
  for (let i = 1; i < M; i++) s += (i % 2 ? 4 : 2) * fu(u0 + i * h);
  const Li = s * h / 3, pN = premiers.length;
  const q = Math.max(1, Math.floor(pN / 10)); let ecarts = 0; for (let i = pN - q; i < pN; i++) ecarts += premiers[i] - premiers[i - 1];
  const gap = ecarts / q, lnN = lnD(N);
  return { D: 3, brut, nuage: true, unite: 'sans objet (arithmetique)', invariants: {
    compteLi: { mesure: pN, formule: Li, ecartRelatif: (pN - Li) / Li, jusqua: N,
      approchee: 'the prime number theorem: Li(N) = integral from 2 to N of dt / ln t is the best simple estimate, not an exact count',
      note: 'number of primes up to N (exact, by the sieve) against Li(N)' },
    compteLn: { mesure: pN, formule: N / lnN, ecartRelatif: (pN - N / lnN) / (N / lnN),
      approchee: 'N / ln N, the first form of the prime number theorem: it undercounts', note: 'number of primes up to N against N / ln N' },
    ecartMoyen: { mesure: gap, formule: lnN, approchee: 'the average gap near N grows like ln N', note: 'mean gap between consecutive primes in the last tenth, against ln N' } } };
}

// ---------- 5 : le triangle de Pascal modulo 2 (Sierpinski) ----------
// Lignes 0 a R - 1 construites par ADDITION (chaque nombre = somme des deux au-dessus), gardees modulo 2 : seuls les impairs comptent.
// Exact (derive ici, Lucas / Glaisher) : C(n, k) est impair si et seulement si les 1 de k sont parmi ceux de n en binaire, donc la ligne n
//   contient 2^(nombre de 1 de n) impairs ; et les 2^m premieres lignes en contiennent (1 + 2)^m = 3^m (chaque chiffre binaire de n vaut
//   0 ou 1 : somme des 2^(chiffres) = produit des (1 + 2)). Le dessin est le triangle de Sierpinski, de dimension ln 3 / ln 2 (non mesuree).
// Mesures : pire ecart, sur toutes les lignes, entre le compte d impairs (par addition) et 2^(popcount n) ; total des 2^m premieres
//   lignes (m = plus grande puissance de 2 <= R) contre 3^m.
// Dessin : chaque impair en (k - n/2, -n) ; 3e colonne : n (etiquette). Echantillonne si plus d impairs que de lignes.
function pascalSierpinski(P, n) {
  const R = P.lignes, impairs = []; let ligne = new Uint8Array(1); ligne[0] = 1;
  let pire = 0, cumul = 0, m = 0; while (2 ** (m + 1) <= R) m++;
  let total2m = 0;
  for (let r = 0; r < R; r++) {
    let c = 0; for (let k = 0; k <= r; k++) if (ligne[k]) { c++; impairs.push([k - r / 2, -r, r]); }
    let pc = 0, x = r; while (x) { pc += x & 1; x >>>= 1; }
    pire = Math.max(pire, Math.abs(c - 2 ** pc)); cumul += c; if (r === 2 ** m - 1) total2m = cumul;
    const suiv = new Uint8Array(r + 2); suiv[0] = 1; suiv[r + 1] = 1; for (let k = 1; k <= r; k++) suiv[k] = (ligne[k - 1] + ligne[k]) & 1; ligne = suiv;
  }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const p = impairs[Math.floor(l * impairs.length / n)], o = 3 * l; brut[o] = p[0]; brut[o + 1] = p[1]; brut[o + 2] = p[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (arithmetique)', invariants: {
    impairsParLigne: { mesure: pire, formule: 0, lignes: R, note: 'worst gap, over every row, between the number of odd entries (built by addition) and 2^(number of 1s of n in binary) (Glaisher, exact)' },
    impairsTotal: { mesure: total2m, formule: 3 ** m, puissance: m, impairs: cumul, note: 'odd entries in the first 2^m rows against 3^m (exact)' } } };
}

// ---------- 6 : les cinq solides de Platon ----------
// Sommets (phi = (1 + sqrt 5)/2) : tetraedre (1,1,1) et ses 3 voisins a signes pairs ; cube (+-1,+-1,+-1) ; octaedre (+-1,0,0) et
//   permutations ; dodecaedre (+-1,+-1,+-1) et (0, +-1/phi, +-phi) permutes circulairement ; icosaedre (0, +-1, +-phi) permutes.
// Aretes = paires de sommets a la plus petite distance ; FACES retrouvees par la geometrie seule : un triplet de sommets definit un plan,
//   c est une face si tous les autres sommets sont du meme cote (plans dedoublonnes par leur normale). Rien n est tire d une table.
// Exact (Euler, Schlafli) : V - E + F = 2 ; chaque face a p cotes, chaque sommet q aretes : E = V q / 2 = F p / 2 ; angle diedre
//   sin(theta / 2) = cos(pi / q) / sin(pi / p). Mesures : V - E + F compte, angle entre normales de deux faces voisines.
// Dessin : les aretes (points regulierement espaces) en 3-D ; 3e... (D = 3 : x, y, z). La vue tourne.
const NOMS_SOLIDES = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron'];
function sommetsSolide(k) {
  const ph = (1 + Math.sqrt(5)) / 2, cyc = (a) => [a, [a[1], a[2], a[0]], [a[2], a[0], a[1]]], S = [];
  const signes = (v) => { const out = [[]]; for (const c of v) { const nv = []; for (const o of out) { nv.push([...o, c]); if (c !== 0) nv.push([...o, -c]); } out.splice(0, out.length, ...nv); } return out; };
  if (k === 0) return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  if (k === 1) return signes([1, 1, 1]);
  if (k === 2) return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  if (k === 3) { S.push(...signes([1, 1, 1])); for (const v of signes([0, 1 / ph, ph])) S.push(...cyc(v)); return S; }
  for (const v of signes([0, 1, ph])) S.push(...cyc(v)); return S;
}
function solidesPlatoniques(P, n) {
  const k = P.solide, V = sommetsSolide(k), nv = V.length, d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  let dmin = Infinity; for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) dmin = Math.min(dmin, d2(V[i], V[j]));
  const aretes = []; for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) if (Math.abs(d2(V[i], V[j]) - dmin) < 1e-9 * dmin) aretes.push([i, j]);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const faces = [];
  for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) for (let m = j + 1; m < nv; m++) {
    let nrm = cross(sub(V[j], V[i]), sub(V[m], V[i])); const L = Math.sqrt(dot(nrm, nrm)); if (L < 1e-9) continue; nrm = nrm.map((c) => c / L);
    const c0 = dot(nrm, V[i]); let pos = 0, neg = 0, sur = 0; for (const p of V) { const s = dot(nrm, p) - c0; if (s > 1e-9) pos++; else if (s < -1e-9) neg++; else sur++; }
    if (pos && neg) continue; if (pos) { nrm = nrm.map((c) => -c); }
    if (!faces.some((f) => dot(f.n, nrm) > 1 - 1e-9)) faces.push({ n: nrm, sommets: sur });
  }
  const p = faces.length ? faces[0].sommets : 0, q = nv ? (2 * aretes.length) / nv : 0;
  /* angle diedre mesure : entre les normales de deux faces partageant une arete (les 2 faces dont la normale est la plus proche) */
  let cmax = -1; for (let a = 0; a < faces.length; a++) for (let b = a + 1; b < faces.length; b++) cmax = Math.max(cmax, dot(faces[a].n, faces[b].n));
  const diedre = PI - atan2D(Math.sqrt(Math.max(0, 1 - cmax * cmax)), cmax), sTh = cosD(PI / q) / sinD(PI / p), diedreTh = 2 * atan2D(sTh, Math.sqrt(Math.max(0, 1 - sTh * sTh)));
  let pireR = 0; const R0 = Math.sqrt(d2(V[0], [0, 0, 0])); for (const v of V) pireR = Math.max(pireR, Math.abs(Math.sqrt(d2(v, [0, 0, 0])) - R0));
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const t = l * aretes.length / n, e = aretes[Math.floor(t)], f = t - Math.floor(t), a = V[e[0]], b = V[e[1]], o = 3 * l; brut[o] = a[0] + f * (b[0] - a[0]); brut[o + 1] = a[1] + f * (b[1] - a[1]); brut[o + 2] = a[2] + f * (b[2] - a[2]); }
  const deg = 180 / PI;
  /* vu a l ecran (03/11) : trace en CHEMIN, la fin d une arete etait reliee au debut de la suivante (cordes parasites) et la scene affichait
   *   « start / end » : un nuage de points denses le long des aretes */
  return { D: 3, brut, nuage: true, unite: 'sans objet (geometrie)', invariants: {
    euler: { mesure: nv - aretes.length + faces.length, formule: 2, sommets: nv, aretes: aretes.length, faces: faces.length, note: NOMS_SOLIDES[k] + ' : vertices - edges + faces, all three COUNTED from the geometry, against Euler\'s 2' },
    schlafli: { mesure: aretes.length, formule: faces.length * p / 2, cotesParFace: p, aretesParSommet: q, note: 'edges against F p / 2 (each face has p sides, each edge borders 2 faces) ; the solid is {p, q} in Schlafli\'s notation' },
    diedre: { mesure: diedre * deg, formule: diedreTh * deg, note: 'angle between two neighbouring faces (degrees) measured from their normals against sin(theta / 2) = cos(pi / q) / sin(pi / p)' },
    surSphere: { debut: R0, fin: R0, derive: pireR, note: 'every vertex is at the same distance from the centre (witness)' } } };
}

// ---------- 7 : le probleme de Monty Hall ----------
// n portes, une voiture au hasard, le joueur en choisit une, l animateur ouvre une porte perdante parmi les AUTRES (au hasard s il en a
//   plusieurs). Exact (derive ici) : garder gagne 1/n ; changer pour une des n - 2 autres portes fermees, au hasard, gagne
//   ((n - 1)/n) x 1/(n - 2) = (n - 1)/(n (n - 2)) (2/3 pour 3 portes). G parties pour chaque strategie, avec les MEMES tirages :
//   parts binomiales, sigma exact.
// Dessin : deux courbes (vue de face) : la part gagnee cumulee au fil des parties, en gardant (0) et en changeant (1).
function montyHall(P, n) {
  const N = P.portes, G = P.parties, rng = mulberry32(P.graine);
  let gGarde = 0, gChange = 0; const cG = new Float64Array(G), cC = new Float64Array(G);
  for (let g = 0; g < G; g++) {
    const voiture = Math.floor(rng() * N), choix = Math.floor(rng() * N);
    const perdantes = []; for (let d = 0; d < N; d++) if (d !== choix && d !== voiture) perdantes.push(d);
    const ouverte = perdantes[Math.floor(rng() * perdantes.length)];
    const autres = []; for (let d = 0; d < N; d++) if (d !== choix && d !== ouverte) autres.push(d);
    const nouveau = autres[Math.floor(rng() * autres.length)];
    if (choix === voiture) gGarde++; if (nouveau === voiture) gChange++;
    cG[g] = gGarde / (g + 1); cC[g] = gChange / (g + 1);
  }
  const pG = 1 / N, pC = (N - 1) / (N * (N - 2)), brut = new Float64Array(n * 3), moitie = Math.floor(n / 2);
  for (let l = 0; l < n; l++) { const c = l < moitie ? 0 : 1, k = c ? l - moitie : l, m = c ? n - moitie : moitie, g = m === 1 ? G - 1 : Math.round(k * (G - 1) / (m - 1)), o = 3 * l; brut[o] = g + 1; brut[o + 1] = c ? cC[g] : cG[g]; brut[o + 2] = c; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (hasard)', invariants: {
    changer: { mesure: gChange / G, formule: pC, sigma: Math.sqrt(pC * (1 - pC) / G), parties: G, portes: N, note: 'share of games won by switching against (n - 1)/(n (n - 2)) : 2/3 with 3 doors ; binomial sigma' },
    garder: { mesure: gGarde / G, formule: pG, sigma: Math.sqrt(pG * (1 - pG) / G), note: 'share of games won by sticking against 1/n' } } };
}

// ---------- 8 : le joint d Apollonius (idee : codex Grok Bot 2026-11-05) ----------
// Un grand cercle (rayon 1, courbure -1 : il CONTIENT les autres), deux cercles de rayons r1 (curseur) et 1 - r1 poses cote a cote sur
//   un diametre ; chaque interstice entre trois cercles tangents recoit le cercle tangent aux trois, puis on recommence dans les trois
//   nouveaux interstices, G generations (curseur).
// Mesure : chaque nouveau cercle est CHERCHE geometriquement : Newton sur (x, y, r) pour que sa distance a chacun des trois centres
//   vaille la somme (ou la difference, avec le grand cercle) des rayons ; aucune formule de courbure n est utilisee pour le construire.
// Exact (Descartes 1643 ; forme complexe : Lagarias, Mallows, Wilks, Amer. Math. Monthly 109 (2002) 338-361) : pour quatre cercles
//   mutuellement tangents, (k1 + k2 + k3 + k4)^2 = 2 (k1^2 + k2^2 + k3^2 + k4^2), donc le cercle de l interstice a
//   k4 = k1 + k2 + k3 + 2 sqrt(k1 k2 + k2 k3 + k3 k1) ; et avec w = k z (z le centre complexe), (sum w)^2 = 2 sum w^2.
//   Nombre de cercles : 2 a la generation 0 (au-dessus et au-dessous du diametre), puis 6 x 3^(g - 1) a la generation g.
// Temoins : avec r1 = 1/2 les courbures sont (-1, 2, 2, 3) et TOUTES les suivantes sont entieres ; la formule sans le facteur 2,
//   k1 + k2 + k3 + sqrt(...), donne autre chose.
// Dessin (vue de face) : des points sur chaque cercle (x, y) et la generation (etiquette).
function tangentInterstice(a, b, c, x0, y0) {
  /* a, b, c : { x, y, k } (k < 0 : le cercle exterieur) ; F_i = |p - c_i| - (r + 1/k_i) ou |p - c_i| - (1/|k_i| - r) */
  const C = [a, b, c]; let x = x0, y = y0, r = 0.2 / Math.max(...C.map((q) => Math.abs(q.k)));
  for (let it = 0; it < 80; it++) {
    const F = [], J = [];
    for (const q of C) { const dx = x - q.x, dy = y - q.y, d = Math.sqrt(dx * dx + dy * dy); if (q.k < 0) { F.push(d + r - 1 / -q.k); J.push([dx / d, dy / d, 1]); } else { F.push(d - r - 1 / q.k); J.push([dx / d, dy / d, -1]); } }
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(J), s = [0, 1, 2].map((j) => det(J.map((row, i) => row.map((v, jj) => (jj === j ? -F[i] : v)))) / D);
    x += s[0]; y += s[1]; r += s[2];
    if (Math.abs(s[0]) + Math.abs(s[1]) + Math.abs(s[2]) < 1e-15 * (1 + Math.abs(x) + Math.abs(y))) break;
  }
  return { x, y, k: 1 / r };
}
function apollonius(P, n) {
  const r1 = P.premier, G = P.generations, O = { x: 0, y: 0, k: -1, g: 0 }, A = { x: -1 + r1, y: 0, k: 1 / r1, g: 0 }, B = { x: r1, y: 0, k: 1 / (1 - r1), g: 0 };
  /* game148 (r1 = 0.37 : pour (O, A, B) le radicande vaut exactement 0, l arrondi le rendait negatif -> NaN) : radicande borne a 0 */
  const rad = (p, q, s) => Math.sqrt(Math.max(0, p * q + q * s + s * p)), descartes = (p, q, s) => p + q + s + 2 * rad(p, q, s), contact = (u, v) => { if (v.k < 0) [u, v] = [v, u]; const dx = v.x - u.x, dy = v.y - u.y, d = Math.sqrt(dx * dx + dy * dy), ru = 1 / Math.abs(u.k); return [u.x + dx / d * ru, u.y + dy / d * ru]; };
  const tous = [O, A, B], parGen = new Array(G + 1).fill(0); let pireK = 0, pireZ = 0, pireEntier = 0, manques = 0, distincts = 0;
  const noter = (p, q, s, d) => { const ex = descartes(p.k, q.k, s.k); pireK = Math.max(pireK, Math.abs(d.k - ex) / ex); /* temoin : formule sans le facteur 2 ; seuls comptent les interstices ou elle differe (radicande non nul : pas (O, A, B)) */
    if (rad(p.k, q.k, s.k) > 1e-9 * ex) { distincts++; if (Math.abs(d.k - (p.k + q.k + s.k + rad(p.k, q.k, s.k))) / d.k > 1e-6) manques++; }
    /* Descartes complexe : w = k z ; (sum w)^2 - 2 sum w^2, rapporte a sum |w|^2 */
    let sr = 0, si = 0, qr = 0, qi = 0, n2 = 0; for (const c of [p, q, s, d]) { const wr = c.k * c.x, wi = c.k * c.y; sr += wr; si += wi; qr += wr * wr - wi * wi; qi += 2 * wr * wi; n2 += wr * wr + wi * wi; }
    pireZ = Math.max(pireZ, Math.sqrt((sr * sr - si * si - 2 * qr) ** 2 + (2 * sr * si - 2 * qi) ** 2) / Math.max(n2, 1)); pireEntier = Math.max(pireEntier, Math.abs(d.k - Math.round(d.k))); };
  /* generation 0 : les deux interstices (O, A, B), au-dessus et au-dessous du diametre */
  let file = [];
  for (const sgn of [1, -1]) { const d = tangentInterstice(O, A, B, -1 + 2 * r1, sgn * 0.5); d.g = 0; tous.push(d); parGen[0]++; noter(O, A, B, d); file.push([O, A, d], [A, B, d], [B, O, d]); }
  for (let g = 1; g <= G; g++) { const suite = [];
    for (const [a, b, c] of file) { const pts = [contact(a, b), contact(b, c), contact(c, a)], d = tangentInterstice(a, b, c, (pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3);
      d.g = g; tous.push(d); parGen[g]++; noter(a, b, c, d); suite.push([a, b, d], [b, c, d], [c, a, d]); }
    file = suite; }
  /* dessin : n points repartis sur les cercles, au prorata de la racine du rayon (les petits restent visibles) */
  const poids = tous.map((c) => Math.sqrt(1 / Math.abs(c.k))), total = poids.reduce((u, v) => u + v, 0), brut = new Float64Array(n * 3); let o = 0;
  for (let i = 0; i < tous.length && o < n; i++) { const c = tous[i], m = i === tous.length - 1 ? n - o : Math.max(1, Math.min(n - o, Math.round(n * poids[i] / total))), R = 1 / Math.abs(c.k);
    for (let j = 0; j < m && o < n; j++, o++) { const t = 2 * PI * j / m; brut[3 * o] = c.x + R * cosD(t); brut[3 * o + 1] = c.y + R * sinD(t); brut[3 * o + 2] = i < 3 ? -1 : c.g; } }
  for (; o < n; o++) { brut[3 * o] = 1; brut[3 * o + 1] = 0; brut[3 * o + 2] = -1; }
  const attendu = [2]; for (let g = 1; g <= G; g++) attendu.push(6 * 3 ** (g - 1));
  return { D: 3, brut, nuage: true, unite: 'sans objet (grand cercle de rayon 1)', invariants: {
    courbures: { mesure: pireK, formule: 0, cercles: tous.length - 1, note: 'worst relative gap between the curvature of each circle FOUND geometrically (Newton on the tangency distances) and Descartes k4 = k1 + k2 + k3 + 2 sqrt(k1 k2 + k2 k3 + k3 k1)' },
    centresComplexes: { mesure: pireZ, formule: 0, note: 'worst residual of the complex Descartes theorem (sum k z)^2 = 2 sum (k z)^2 on the centres found (Lagarias, Mallows, Wilks 2002)' },
    cerclesParGeneration: { mesure: parGen.join(' '), formule: attendu.join(' '), note: 'circles found at each generation, against 2 then 6 x 3^(g - 1)' },
    entiers: { ecartEntier: pireEntier, sansFacteur2: manques, comparables: distincts, note: 'witnesses: with r1 = 1/2 every curvature is a whole number (largest distance to one) ; the formula without the factor 2 misses that many of the circles where it differs at all (all of them)' } } };
}

// ---------- 9 : le tas de sable abelien (idee : codex Grok Bot 2026-11-05) ----------
// Une grille c x c ; une case qui porte 4 grains ou plus s eboule : elle en donne un a chacun de ses 4 voisins (au bord, les grains qui
//   sortent tombent dans le puits). On recommence tant qu une case a 4 grains : le tas finit STABLE (0 a 3 grains par case).
// Exact (derive ici) : si u_i est le nombre d eboulements de la case i, chaque case a perdu 4 u_i et recu la somme des u de ses voisins,
//   donc depart - fin = Delta u, Delta le Laplacien reduit (4 sur la diagonale, -1 entre voisins) : identite ENTIERE, a 0 pres.
//   Abelien : l ordre des eboulements ne change ni le tas final ni les u (on stabilise deux fois, pile puis file, et on compare).
//   Recurrentes (Dhar, Phys. Rev. Lett. 64 (1990) 1613, reference du codex de Grok) : les tas stables qu on retrouve en ajoutant des grains
//   sans fin ; leur nombre = det Delta (theoreme matrice-arbre). On les COMPTE un par un, tous les 4^4 et 4^9 tas des grilles 2 x 2 et 3 x 3,
//   par le test de Dhar (un tas est recurrent si on peut bruler toutes ses cases : une case brule quand elle a au moins autant de grains
//   que de voisins pas encore brules), et det Delta est calcule a part, en entiers exacts (elimination de Bareiss, BigInt).
//   Identite du groupe des tas recurrents : e = (6 - (6)°)°, ou ° = stabiliser et 6 = six grains partout ; on verifie (e + e)° = e et
//   (e + r)° = r pour un tas recurrent r tire au hasard. Temoin : le tas vide n est pas recurrent (le test de Dhar le refuse).
// Dessin (vue de face) : l identite e sur la grille c x c, case par case (x, y) et son nombre de grains (etiquette 0 a 3).
function voisinsGrille(c) { const N = c * c, V = new Int32Array(4 * N).fill(-1); for (let i = 0; i < N; i++) { const x = i % c, y = (i - x) / c; let k = 0; if (x > 0) V[4 * i + k++] = i - 1; if (x < c - 1) V[4 * i + k++] = i + 1; if (y > 0) V[4 * i + k++] = i - c; if (y < c - 1) V[4 * i + k++] = i + c; } return V; }
/* stabilise h en place, renvoie les eboulements u ; lifo : pile, sinon file (anneau : chaque case au plus une fois en attente) */
function stabiliser(h, V, lifo) { const N = h.length, u = new Int32Array(N), att = new Int32Array(N + 1), dans = new Uint8Array(N); let a = 0, b = 0, m = 0;
  const met = (i) => { if (!dans[i]) { dans[i] = 1; att[b] = i; b = (b + 1) % (N + 1); m++; } };
  for (let i = 0; i < N; i++) if (h[i] >= 4) met(i);
  while (m) { let i; if (lifo) { b = (b + N) % (N + 1); i = att[b]; } else { i = att[a]; a = (a + 1) % (N + 1); } m--; dans[i] = 0;
    const q = h[i] >> 2; if (!q) continue; h[i] -= 4 * q; u[i] += q; for (let k = 4 * i; k < 4 * i + 4; k++) { const j = V[k]; if (j < 0) break; h[j] += q; if (h[j] >= 4) met(j); } }
  return u; }
function brule(h, V, br, nv) { const N = h.length; br.fill(0); for (let i = 0; i < N; i++) { let c = 0; for (let k = 4 * i; k < 4 * i + 4 && V[k] >= 0; k++) c++; nv[i] = c; }
  let n = 0, chg = true; while (chg) { chg = false; for (let i = 0; i < N; i++) if (!br[i] && h[i] >= nv[i]) { br[i] = 1; n++; chg = true; for (let k = 4 * i; k < 4 * i + 4; k++) { const j = V[k]; if (j < 0) break; nv[j]--; } } }
  return n === N; }
function compterRecurrentes(c) { const N = c * c, V = voisinsGrille(c), h = new Int32Array(N), br = new Uint8Array(N), nv = new Int32Array(N); let r = 0;
  for (let m = 0; m < 4 ** N; m++) { let t = m; for (let i = 0; i < N; i++) { h[i] = t & 3; t >>= 2; } if (brule(h, V, br, nv)) r++; } return r; }
function detLaplacien(c) { const N = c * c, V = voisinsGrille(c), M = []; for (let i = 0; i < N; i++) { const l = new Array(N).fill(0n); l[i] = 4n; for (let k = 4 * i; k < 4 * i + 4 && V[k] >= 0; k++) l[V[k]] = -1n; M.push(l); }
  let prec = 1n; for (let k = 0; k < N - 1; k++) { for (let i = k + 1; i < N; i++) for (let j = k + 1; j < N; j++) M[i][j] = (M[i][j] * M[k][k] - M[i][k] * M[k][j]) / prec; prec = M[k][k]; } return M[N - 1][N - 1]; }
function tasDeSable(P, n) {
  /* banc game150 : un curseur « graine » ne changeait PAS le dessin (il ne servait qu aux controles) : retire, hasard fixe par le cote */
  const c = P.cote, N = c * c, V = voisinsGrille(c), rng = mulberry32(c), br = new Uint8Array(N), nv = new Int32Array(N);
  /* identite : e = (6 - (6)°)° */
  const s = new Int32Array(N).fill(6); stabiliser(s, V, true); const e = new Int32Array(N); for (let i = 0; i < N; i++) e[i] = 6 - s[i]; stabiliser(e, V, true);
  const ee = new Int32Array(N); for (let i = 0; i < N; i++) ee[i] = 2 * e[i]; stabiliser(ee, V, true);
  /* r recurrent au hasard : (3 + hasard 0..3)° ; puis (e + r)° */
  const r = new Int32Array(N); for (let i = 0; i < N; i++) r[i] = 3 + Math.floor(rng() * 4); stabiliser(r, V, true);
  const er = new Int32Array(N); for (let i = 0; i < N; i++) er[i] = e[i] + r[i]; stabiliser(er, V, true);
  let dEE = 0, dER = 0; for (let i = 0; i < N; i++) { if (ee[i] !== e[i]) dEE++; if (er[i] !== r[i]) dER++; }
  const eRec = brule(e, V, br, nv), vide = brule(new Int32Array(N), V, br, nv);
  /* abelien : un tas au hasard (0 a 7 grains par case), stabilise par pile puis par file ; depart - fin = Delta u */
  const h0 = new Int32Array(N); for (let i = 0; i < N; i++) h0[i] = Math.floor(rng() * 8);
  const h1 = h0.slice(), h2 = h0.slice(), u1 = stabiliser(h1, V, true), u2 = stabiliser(h2, V, false);
  let dH = 0, dU = 0, residu = 0, ebs = 0; for (let i = 0; i < N; i++) { if (h1[i] !== h2[i]) dH++; if (u1[i] !== u2[i]) dU++; ebs += u1[i]; let lap = 4 * u1[i]; for (let k = 4 * i; k < 4 * i + 4 && V[k] >= 0; k++) lap -= u1[V[k]]; residu = Math.max(residu, Math.abs(h0[i] - h1[i] - lap)); }
  const comptes = [compterRecurrentes(2), compterRecurrentes(3)], dets = [detLaplacien(2), detLaplacien(3)];
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = Math.floor(l * N / n), o = 3 * l; brut[o] = i % c; brut[o + 1] = (i - (i % c)) / c; brut[o + 2] = e[i]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (grains)', invariants: {
    recurrentes: { mesure: comptes.join(' '), formule: dets.join(' '), grandes: [4, 5].map((k) => String(detLaplacien(k))).join(' '), note: 'recurrent piles COUNTED one by one by the burning test of Dhar, on the 2 x 2 and 3 x 3 grids (every one of the 4^4 and 4^9 stable piles), against det of the reduced Laplacian in exact integers (Dhar 1990) ; det for 4 x 4 and 5 x 5 also given' },
    identite: { eePlusE: dEE, ePlusR: dER, recurrente: eRec, videRecurrent: vide, note: 'e = (6 - (6)°)° on the drawn grid : cells where (e + e)° differs from e, cells where (e + r)° differs from r for a random recurrent r (both 0) ; e passes the burning test, the empty pile does not (witness)' },
    abelien: { mesure: residu, formule: 0, tasDifferents: dH, eboulementsDifferents: dU, eboulements: ebs, note: 'a random pile toppled twice, as a stack and as a queue : cells where the final piles differ, cells where the topple counts differ (both 0) ; and the largest gap in start - end = Delta u, exact in whole numbers' } } };
}

export const COLONNES = Object.freeze({
  tasDeSable: { colonnes: ['x (cell)', 'y (cell)', 'grains on the cell (label, 0 to 3)'], memeLongueur: [[0, 1]], autres: [2] },
  apollonius: { colonnes: ['x', 'y', 'generation (label; -1 = the three starting circles)'], memeLongueur: [[0, 1]], autres: [2] },
  marcheAleatoire: { colonnes: ['x (grid steps)', 'y (grid steps)', 'step number'], memeLongueur: [[0, 1]], autres: [2] },
  aiguilleBuffon: { colonnes: ['x (floor widths)', 'y (floor widths; lines at whole numbers)', 'crosses a line (1) or not (0)'], memeLongueur: [[0, 1]], autres: [2] },
  anniversaires: { colonnes: ['x (birthday as an angle round the circle, one ring per group)', 'y (same)', 'group number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  spiraleUlam: { colonnes: ['x on the Ulam spiral', 'y on the Ulam spiral', 'the prime itself'], memeLongueur: [[0, 1]], autres: [2] },
  solidesPlatoniques: { colonnes: ['x', 'y', 'z (the edges of the solid)'], memeLongueur: [[0, 1, 2]], autres: [] },
  montyHall: { colonnes: ['games played', 'share of games won so far', 'strategy (0 = stick, 1 = switch)'], memeLongueur: [], autres: [0, 1, 2] },
  pascalSierpinski: { colonnes: ['position in the row (k - n/2)', 'row (minus n, top to bottom)', 'row number n (label)'], memeLongueur: [[0, 1]], autres: [2] },
});

export const SYSTEMES = Object.freeze([
  { id: 'marcheAleatoire', nom: 'Random walks on a grid', science: 'Probability', D: 3, params: { marcheurs: 500, pas: 200, graine: 1 },
    bornes: { marcheurs: [50, 2000], pas: [10, 1000], graine: [1, 1000000] },
    phrase: 'A visualisation of random walks: walkers step to a random neighbour on a grid, one frame per walker. However wild each path looks, the mean squared distance from the start after n steps is exactly n, with an exact spread n^2 - n; on average nobody drifts anywhere. A finite number of walkers, so the agreement is statistical.' },
  { id: 'aiguilleBuffon', nom: 'Buffon\'s needles (finding pi by throwing needles)', science: 'Geometric probability', D: 3, nuage: true, params: { aiguilles: 2000, longueur: 0.8, graine: 1 },
    bornes: { aiguilles: [100, 20000], longueur: [0.1, 1], graine: [1, 1000000] },
    phrase: 'A visualisation of Buffon\'s needle problem: needles of length l thrown at random on a floor of boards one unit wide. The share that crosses a line is exactly 2 l / pi, so the needles themselves estimate pi. A finite number of needles, so the agreement is statistical.' },
  { id: 'anniversaires', nom: 'The birthday paradox', science: 'Probability', D: 3, nuage: true, params: { personnes: 23, jours: 365, groupes: 2000, graine: 1 },
    bornes: { personnes: [2, 80], jours: [50, 400], groupes: [100, 5000], graine: [1, 1000000] },
    phrase: 'A visualisation of the birthday paradox: groups of k people with random birthdays among D days, drawn round a circle. The chance that two share a birthday is exactly 1 - (1 - 1/D)(1 - 2/D)...(1 - (k - 1)/D), already above one half for 23 people and 365 days, and the mean number of shared pairs is k (k - 1) / (2D). A finite number of groups, so the agreement is statistical.' },
  { id: 'spiraleUlam', nom: 'Primes on the Ulam spiral', science: 'Number theory', D: 3, nuage: true, params: { jusqua: 10000 },
    bornes: { jusqua: [1000, 40000] },
    phrase: 'A visualisation of the prime numbers placed on the Ulam spiral (1 in the middle, the integers winding outwards): they gather along diagonals. The exact count of primes up to N, found by a sieve, is compared with the prime number theorem, Li(N) and N / ln N, which are approximations and say so.' },
  { id: 'pascalSierpinski', nom: 'The triangle of Pascal, odd numbers only (Sierpinski)', science: 'Combinatorics', D: 3, nuage: true, params: { lignes: 128 },
    bornes: { lignes: [8, 512] },
    phrase: 'A visualisation of the triangle of Pascal built row by row by addition, keeping only whether each number is odd: the odd ones draw the Sierpinski triangle. Row n holds exactly 2^(number of 1s in n written in binary) odd numbers, and the first 2^m rows hold exactly 3^m of them.' },
  { id: 'solidesPlatoniques', nom: 'The five Platonic solids', science: 'Geometry', D: 3, nuage: true, params: { solide: 3 },
    bornes: { solide: [0, 4] },
    phrase: 'A visualisation of the five Platonic solids (0 tetrahedron, 1 cube, 2 octahedron, 3 dodecahedron, 4 icosahedron), drawn by their edges in 3-D. Their faces are found from the geometry alone and counted: vertices - edges + faces is always 2 (Euler), and the angle between two faces is the exact sin(theta / 2) = cos(pi / q) / sin(pi / p).' },
  { id: 'montyHall', nom: 'The Monty Hall problem', science: 'Probability', D: 3, nuage: true, params: { portes: 3, parties: 2000, graine: 1 },
    bornes: { portes: [3, 10], parties: [100, 5000], graine: [1, 1000000] },
    phrase: 'A visualisation of the Monty Hall game: a car behind one of n doors, you pick one, the host opens a losing door among the others, and you stick or switch. Played many times with the same draws, the share won by switching settles on (n - 1)/(n (n - 2)), 2/3 with three doors, and sticking on 1/n. A finite number of games, so the agreement is statistical.' },
  { id: 'apollonius', nom: 'Circles inside circles (the gasket of Apollonius)', science: 'Geometry', D: 3, nuage: true, params: { premier: 0.5, generations: 5 },
    bornes: { premier: [0.2, 0.8], generations: [1, 6] },
    phrase: 'A visualisation of the gasket of Apollonius: into every gap between three touching circles goes the circle that touches all three, again and again. Each circle is found by geometry alone, then compared with the theorem of Descartes, (k1 + k2 + k3 + k4)^2 = 2 (k1^2 + k2^2 + k3^2 + k4^2) for their curvatures, and with its complex form for their centres. With two equal starting circles every curvature is a whole number: 2, 3, 6, 11, 14, 15...' },
  { id: 'tasDeSable', nom: 'The abelian sandpile (and its identity)', science: 'Combinatorics', D: 3, nuage: true, params: { cote: 32 },
    bornes: { cote: [8, 40] }, /* MESURE game150 : 205 ms a 48, 110 ms a 40 (n = 1500) */
    phrase: 'A visualisation of the abelian sandpile: a cell holding four grains topples and gives one to each neighbour, grains falling off the edge are lost. The order of the topples never matters. The picture is the identity of the sandpile group on the grid. The stable piles that come back again and again are counted one by one on small grids (192 on 2 x 2, 100352 on 3 x 3) and match the determinant of the grid Laplacian, the number of spanning trees.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { marcheAleatoire: ['marcheurs', 'pas', 'graine'], aiguilleBuffon: ['aiguilles', 'graine'], anniversaires: ['personnes', 'jours', 'groupes', 'graine'], spiraleUlam: ['jusqua'], pascalSierpinski: ['lignes'], solidesPlatoniques: ['solide'], montyHall: ['portes', 'parties', 'graine'], apollonius: ['generations'], tasDeSable: ['cote'] };
const FONCTIONS = { tasDeSable, apollonius, marcheAleatoire, aiguilleBuffon, anniversaires, spiraleUlam, pascalSierpinski, solidesPlatoniques, montyHall };
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
