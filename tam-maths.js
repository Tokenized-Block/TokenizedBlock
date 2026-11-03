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

export const COLONNES = Object.freeze({
  marcheAleatoire: { colonnes: ['x (grid steps)', 'y (grid steps)', 'step number'], memeLongueur: [[0, 1]], autres: [2] },
  aiguilleBuffon: { colonnes: ['x (floor widths)', 'y (floor widths; lines at whole numbers)', 'crosses a line (1) or not (0)'], memeLongueur: [[0, 1]], autres: [2] },
  anniversaires: { colonnes: ['x (birthday as an angle round the circle, one ring per group)', 'y (same)', 'group number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  spiraleUlam: { colonnes: ['x on the Ulam spiral', 'y on the Ulam spiral', 'the prime itself'], memeLongueur: [[0, 1]], autres: [2] },
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
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { marcheAleatoire: ['marcheurs', 'pas', 'graine'], aiguilleBuffon: ['aiguilles', 'graine'], anniversaires: ['personnes', 'jours', 'groupes', 'graine'], spiraleUlam: ['jusqua'], pascalSierpinski: ['lignes'] };
const FONCTIONS = { marcheAleatoire, aiguilleBuffon, anniversaires, spiraleUlam, pascalSierpinski };
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
