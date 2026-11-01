// tam-sciences.js -- TAM, la vue SCIENCES : fractales, nombre d or, mecanique quantique, calcules honnetement.
//
// VUE SEULEMENT : rien ici ne se frappe (le contrat deploye n accepte que les familles 1..16 de tam-moteur.js).
// API identique a tam-physique.js (la vue la reutilise) : SYSTEMES, simuler(id, params, { n }), reglagesPhysique(id, params).
// Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne), lyapunov: null, uniteLyapunov,
//   points: null, invariants, nuage? } ; D = 3 partout (la vue 3-D les dessine sans changement).
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun Math.random (tirages : mulberry32 a graine fixe ou parametre).
//   sin/cos/ln = ceux du moteur (+ - * / et sqrt seulement) ; exp = expD ci-dessous (meme esprit).
// Lyapunov : null partout. Les fractales sont des ensembles (pas des trajectoires) ; les systemes quantiques evoluent
//   lineairement (unitaire) : il n y a pas de chaos a mesurer.
// Honnetete : chaque invariant compare une MESURE faite sur les points produits a une valeur THEORIQUE connue ;
//   la mesure n est jamais recopiee de la formule.
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = 3.141592653589793, DEUX_PI = 6.283185307179586, LN2 = 0.6931471805599453;
const PHI = (1 + Math.sqrt(5)) / 2;
const ANGLE_OR = DEUX_PI / (PHI * PHI); // 360/phi^2 = 137.5077... degres, en radians

function expD(x) { /* e^x avec + - * / seulement (copie de tam-physique.js) */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* moindres carres : pente de y en x */
function pente(xs, ys) {
  const m = xs.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < m; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
  return (m * sxy - sx * sy) / (m * sxx - sx * sx);
}
/* dimension boite : N(2^-k) boites occupees pour k = kMin..kMax, pente de ln N contre k ln 2.
   cadre absent -> cube englobant de l echantillon (cote = plus grande etendue) ; cadre = { lo, cote } impose. */
function dimensionBoite(brut, n, D, axes, kMin, kMax, cadre = null) {
  const A = axes.length, lo = new Float64Array(A); let cote = 0;
  if (cadre) { lo.fill(cadre.lo); cote = cadre.cote; }
  else for (let a = 0; a < A; a++) {
    let mi = Infinity, ma = -Infinity;
    for (let i = 0; i < n; i++) { const v = brut[i * D + axes[a]]; if (v < mi) mi = v; if (v > ma) ma = v; }
    lo[a] = mi; if (ma - mi > cote) cote = ma - mi;
  }
  if (!(cote > 0)) return { mesure: NaN, comptes: [], echelles: [kMin, kMax] };
  const xs = [], ys = [], comptes = [];
  for (let k = kMin; k <= kMax; k++) {
    const G = 2 ** k, vu = new Set();
    for (let i = 0; i < n; i++) {
      let cle = 0;
      for (let a = 0; a < A; a++) {
        let q = Math.floor((brut[i * D + axes[a]] - lo[a]) / cote * G);
        if (q < 0) q = 0; else if (q >= G) q = G - 1;
        cle = cle * G + q;
      }
      vu.add(cle);
    }
    comptes.push(vu.size); xs.push(k * LN2); ys.push(lnD(vu.size));
  }
  return { mesure: pente(xs, ys), comptes, echelles: [kMin, kMax] };
}
/* repertoire de directions quasi uniformes sur la sphere (spirale de Fibonacci) */
function directionFibonacci(i, m, o) {
  const z = 1 - 2 * (i + 0.5) / m, r = Math.sqrt(Math.max(0, 1 - z * z)), t = i * ANGLE_OR;
  o[0] = r * cosD(t); o[1] = r * sinD(t); o[2] = z;
}

// ---------- 1 : bord de l ensemble de Mandelbrot ----------
// grille G x G de c (centres de pixels) ; temps d echappement avec rayon 2 (|z|^2 > 4) ; interieur = pas echappe en maxIter.
// Bande de bord = pixels qui s echappent ET touchent un pixel interieur (4-voisins) ; z = ln(temps d echappement).
const AIRE_MANDELBROT = 1.50659177; // estimation publiee (Forstemann 2012, +-0.00000008) ; la valeur exacte est inconnue
function mandelbrot(c, n) {
  const it = c.maxIter, G = Math.min(400, Math.floor(Math.sqrt(3.2e7 / it))), demi = 1.5 / c.zoom, pg = 2 * demi / G;
  const x0 = c.cx - demi, y0 = c.cy - demi, esc = new Int32Array(G * G);
  let interieur = 0;
  for (let j = 0; j < G; j++) {
    const ci = y0 + (j + 0.5) * pg;
    for (let i = 0; i < G; i++) {
      const cr = x0 + (i + 0.5) * pg; let zr = 0, zi = 0, k = 0;
      for (; k < it; k++) {
        const t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t;
        if (zr * zr + zi * zi > 4) break;
      }
      if (k >= it) interieur++; else esc[j * G + i] = k + 1;
    }
  }
  const bord = [], autres = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const p = j * G + i; if (!esc[p]) continue;
    const touche = (i > 0 && !esc[p - 1]) || (i < G - 1 && !esc[p + 1]) || (j > 0 && !esc[p - G]) || (j < G - 1 && !esc[p + G]);
    (touche ? bord : autres).push(p);
  }
  let choix;
  if (bord.length >= n) { choix = new Array(n); for (let i = 0; i < n; i++) choix[i] = bord[Math.floor(i * bord.length / n)]; }
  else {
    autres.sort((a, b) => esc[b] - esc[a] || a - b);
    const tous = bord.concat(autres);
    if (!tous.length) for (let p = 0; p < G * G; p++) tous.push(p); // vue entierement interieure
    choix = new Array(n); for (let i = 0; i < n; i++) choix[i] = tous[i < tous.length ? i : i % tous.length];
  }
  const brut = new Float64Array(n * 3), temps = [];
  for (let i = 0; i < n; i++) {
    const p = choix[i], k = esc[p] || it;
    brut[3 * i] = x0 + (p % G + 0.5) * pg; brut[3 * i + 1] = y0 + (Math.floor(p / G) + 0.5) * pg; brut[3 * i + 2] = lnD(k); temps.push(k);
  }
  temps.sort((a, b) => a - b);
  const vueComplete = x0 <= -2.05 && x0 + 2 * demi >= 0.5 && y0 <= -1.15 && y0 + 2 * demi >= 1.15;
  const aire = interieur * pg * pg;
  return { brut, invariants: {
    /* aire = pixels interieurs x aire d un pixel ; comparee a la reference seulement si la vue contient tout l ensemble */
    aire: { mesure: aire, reference: vueComplete ? AIRE_MANDELBROT : null, ecart: vueComplete ? Math.abs(aire - AIRE_MANDELBROT) / AIRE_MANDELBROT : null, pixels: G * G, maxIter: it },
    bord: { pixelsDeBord: bord.length, echappementMin: temps[0], echappementMedian: temps[n >> 1], echappementMax: temps[n - 1] },
    dimensionBoite: { ...dimensionBoite(brut, n, 3, [0, 1], 2, 5), theorieBord: 2,
      note: 'box count of a finite pixel sample: it stays below the boundary Hausdorff dimension 2 (Shishikura)' },
  } };
}

// ---------- 2 : Mandelbulb (puissance p entiere, formule de White-Nylander), surface par rayons ----------
// v -> v^p + c en coordonnees spheriques ; les puissances de (cos t + i sin t) et (cos f + i sin f) se font par produits
// complexes (aucun appel trigonometrique). Interieur = |v| <= 2 apres maxIter iterations.
function dedansBulbe(x, y, z, p, it) {
  let vx = 0, vy = 0, vz = 0;
  for (let k = 0; k < it; k++) {
    const r2 = vx * vx + vy * vy + vz * vz;
    if (r2 > 4) return false;
    let nx = 0, ny = 0, nz = 0;
    if (r2 > 0) {
      const r = Math.sqrt(r2), rho = Math.sqrt(vx * vx + vy * vy);
      const ar = vz / r, ai = rho / r, br = rho > 0 ? vx / rho : 1, bi = rho > 0 ? vy / rho : 0;
      let tr = 1, ti = 0, ur = 1, ui = 0, rp = 1;
      for (let j = 0; j < p; j++) {
        const t1 = tr * ar - ti * ai; ti = tr * ai + ti * ar; tr = t1;
        const u1 = ur * br - ui * bi; ui = ur * bi + ui * br; ur = u1;
        rp *= r;
      }
      nx = rp * ti * ur; ny = rp * ti * ui; nz = rp * tr;
    }
    vx = nx + x; vy = ny + y; vz = nz + z;
  }
  return vx * vx + vy * vy + vz * vz <= 4;
}
const BULBE_R = 2, BULBE_PAS = 64, BULBE_BISSECTIONS = 22;
/* marche de l exterieur (r = 2 : tout c au-dela s echappe) vers l origine (interieure), puis bissection : surface la plus externe */
function rayonBulbe(dx, dy, dz, p, it) {
  const h = BULBE_R / BULBE_PAS; let lo = 0, hi = h;
  for (let j = 1; j <= BULBE_PAS; j++) { const t = BULBE_R - j * h; if (j === BULBE_PAS || dedansBulbe(t * dx, t * dy, t * dz, p, it)) { lo = t; hi = t + h; break; } }
  for (let b = 0; b < BULBE_BISSECTIONS; b++) { const m = (lo + hi) / 2; if (dedansBulbe(m * dx, m * dy, m * dz, p, it)) lo = m; else hi = m; }
  return { r: (lo + hi) / 2, largeur: hi - lo };
}
function mandelbulb(c, n) {
  const p = c.puissance, it = c.maxIter, brut = new Float64Array(n * 3), d = [0, 0, 0];
  let rmin = Infinity, rmax = 0, somme = 0, largeur = 0;
  for (let i = 0; i < n; i++) {
    directionFibonacci(i, n, d);
    const R = rayonBulbe(d[0], d[1], d[2], p, it);
    brut[3 * i] = R.r * d[0]; brut[3 * i + 1] = R.r * d[1]; brut[3 * i + 2] = R.r * d[2];
    if (R.r < rmin) rmin = R.r; if (R.r > rmax) rmax = R.r; somme += R.r; if (R.largeur > largeur) largeur = R.largeur;
  }
  /* symetrie : la carte commute avec la rotation d angle 2 pi/(p-1) autour de z (R^p = R) -> meme rayon de surface */
  const M = 64, a = DEUX_PI / (p - 1), ca = cosD(a), sa = sinD(a); let accord = 0, ecartMax = 0; const e = [];
  for (let i = 0; i < M; i++) {
    directionFibonacci(i, M, d);
    const r1 = rayonBulbe(d[0], d[1], d[2], p, it).r, r2 = rayonBulbe(ca * d[0] - sa * d[1], sa * d[0] + ca * d[1], d[2], p, it).r, x = Math.abs(r1 - r2);
    e.push(x); if (x <= 1e-4) accord++; if (x > ecartMax) ecartMax = x;
  }
  e.sort((u, v) => u - v);
  return { brut, invariants: {
    rayonSurface: { min: rmin, max: rmax, moyen: somme / n, encadrement: largeur },
    symetrie: { ordre: p - 1, directions: M, accord: accord / M, ecartMedian: e[M >> 1], ecartMax },
    dimensionBoite: { ...dimensionBoite(brut, n, 3, [0, 1, 2], 2, 4), note: 'box count of the sampled outer surface (one point per ray), not of the whole set' },
  } };
}

// ---------- 3 : spirale d or + carres de Fibonacci ----------
// r(theta) = r_fin * phi^(2 (theta - theta_fin)/pi) : facteur phi par quart de tour, exactement (spirale logarithmique).
// Carres de Fibonacci (cotes entiers 1, 1, 2, 3, 5...) poses en tournant (droite, haut, gauche, bas) ; pole = point fixe de
// la similitude qui envoie le dernier carre sur l avant-dernier (echelle F(K-2)/F(K-1), rotation -90 degres).
const B_OR = 2 * lnD(PHI) / PI;
function spiraleOr(c, n) {
  const K = 4 * c.tours + 1, F = [1, 1];
  while (F.length < K) F.push(F[F.length - 1] + F[F.length - 2]);
  const carres = [[0, 0, 1]]; let x0 = 0, y0 = 0, x1 = 1, y1 = 1;
  for (let k = 1; k < K; k++) {
    const s = F[k], dir = k % 4;
    if (dir === 1) { carres.push([x1, y0, s]); x1 += s; }
    else if (dir === 2) { carres.push([x0, y1, s]); y1 += s; }
    else if (dir === 3) { carres.push([x0 - s, y0, s]); x0 -= s; }
    else { carres.push([x0, y0 - s, s]); y0 -= s; }
  }
  const centre = (q) => [q[0] + q[2] / 2, q[1] + q[2] / 2];
  const cA = centre(carres[K - 1]), cB = centre(carres[K - 2]), e = F[K - 2] / F[K - 1];
  /* a = e * (-i) ; b = cB - a cA ; pole = b / (1 - a) */
  const ar = 0, ai = -e, br = cB[0] - (ar * cA[0] - ai * cA[1]), bi = cB[1] - (ar * cA[1] + ai * cA[0]);
  const dr = 1 - ar, di = -ai, dd = dr * dr + di * di, px = (br * dr + bi * di) / dd, py = (bi * dr - br * di) / dd;
  const dernier = carres[K - 1]; let qx = 0, qy = 0, qm = -1;
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const X = dernier[0] + u * dernier[2] - px, Y = dernier[1] + v * dernier[2] - py, m = X * X + Y * Y; if (m > qm) { qm = m; qx = X; qy = Y; } }
  const echelle = 1 / Math.sqrt(qm); qx *= echelle; qy *= echelle;
  const nc = Math.min(4 * K, Math.max(0, n - 2)), ns = n - nc, tMax = DEUX_PI * c.tours, brut = new Float64Array(n * 3);
  for (let i = 0; i < ns; i++) {
    const t = tMax * i / (ns - 1), u = t - tMax, s = expD(u * B_OR), cu = cosD(u), su = sinD(u);
    brut[3 * i] = s * (qx * cu - qy * su); brut[3 * i + 1] = s * (qx * su + qy * cu); brut[3 * i + 2] = c.hauteur * t / DEUX_PI;
  }
  for (let j = 0; j < nc; j++) {
    const k = K - 1 - (j >> 2), q = carres[k], [u, v] = [[0, 0], [1, 0], [1, 1], [0, 1]][j & 3], o = 3 * (ns + j);
    brut[o] = (q[0] + u * q[2] - px) * echelle; brut[o + 1] = (q[1] + v * q[2] - py) * echelle;
    brut[o + 2] = c.hauteur * Math.max(0, c.tours - (K - 1 - k) / 4);
  }
  /* mesure : pente de ln r contre theta sur les points STOCKES de la spirale (r relu dans brut) -> rapport par quart de tour */
  const xs = [], ys = [];
  for (let i = 0; i < ns; i++) { const X = brut[3 * i], Y = brut[3 * i + 1]; xs.push(tMax * i / (ns - 1)); ys.push(lnD(Math.sqrt(X * X + Y * Y))); }
  const b = pente(xs, ys), rapport = expD(b * PI / 2);
  let residu = 0; for (let i = 0; i < ns; i++) { const x = Math.abs(ys[i] - (ys[ns - 1] + b * (xs[i] - xs[ns - 1]))); if (x > residu) residu = x; }
  const rf = F[K - 1] / F[K - 2];
  return { brut, invariants: {
    rapportQuartDeTour: { mesure: rapport, theorie: PHI, ecart: Math.abs(rapport - PHI), residuLog: residu, points: ns },
    rapportFibonacci: { mesure: rf, theorie: PHI, ecart: Math.abs(rf - PHI), carres: K, note: 'integer Fibonacci squares only approach the golden rectangle' },
  } };
}

// ---------- 4 : phyllotaxie de Vogel sur une sphere (tournesol / pomme de pin) ----------
// point i : z = 1 - 2 (i + 1/2)/n (aires egales), azimut = i * angle ; angle = 360/phi^2 + decalage (degres).
function phyllotaxieOr(c, n) {
  const angle = ANGLE_OR + c.decalage * PI / 180, brut = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const z = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(Math.max(0, 1 - z * z)), t = i * angle;
    brut[3 * i] = r * cosD(t); brut[3 * i + 1] = r * sinD(t); brut[3 * i + 2] = z;
  }
  /* distance au plus proche voisin (O(n^2), exact) : moyenne, coefficient de variation, min/moyenne */
  const nn = new Float64Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dx = brut[3 * i] - brut[3 * j], dy = brut[3 * i + 1] - brut[3 * j + 1], dz = brut[3 * i + 2] - brut[3 * j + 2], d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < nn[i]) nn[i] = d2; if (d2 < nn[j]) nn[j] = d2;
  }
  let s = 0, s2 = 0, mi = Infinity;
  for (let i = 0; i < n; i++) { const d = Math.sqrt(nn[i]); s += d; s2 += d * d; if (d < mi) mi = d; }
  const moy = s / n, cv = Math.sqrt(Math.max(0, s2 / n - moy * moy)) / moy;
  return { brut, invariants: {
    angle: { degres: angle * 180 / PI, angleOrDegres: ANGLE_OR * 180 / PI },
    plusProcheVoisin: { moyenne: moy, coefVariation: cv, minSurMoyenne: mi / moy, note: 'uniformity of nearest-neighbour spacing; spokes from a non-golden angle raise the variation' },
  } };
}

// ---------- 5 : IFS 3-D, tetraedre de Sierpinski (jeu du chaos) ----------
// sommets (0,0,0), (1,1,0), (1,0,1), (0,1,1) : avec rapport 1/2 chaque sous-tetraedre tient dans un sous-cube dyadique,
// donc le comptage de boites dans le cadre [0,1]^3 est aligne sur la structure. Dimension de similitude = ln 4 / ln(1/rapport).
const SOMMETS = [[0, 0, 0], [1, 1, 0], [1, 0, 1], [0, 1, 1]];
function ifs3d(c, n) {
  const alea = mulberry32(c.graine >>> 0), r = c.rapport, brut = new Float64Array(n * 3), x = [0.5, 0.5, 0.5];
  for (let i = -40; i < n; i++) {
    const v = SOMMETS[Math.floor(alea() * 4)];
    for (let k = 0; k < 3; k++) x[k] = v[k] + r * (x[k] - v[k]);
    if (i >= 0) { brut[3 * i] = x[0]; brut[3 * i + 1] = x[1]; brut[3 * i + 2] = x[2]; }
  }
  const theorie = lnD(4) / lnD(1 / r);
  return { brut, invariants: {
    dimensionBoite: { ...dimensionBoite(brut, n, 3, [0, 1, 2], 1, 4, { lo: 0, cote: 1 }), theorie,
      note: 'box count on dyadic cubes of [0,1]^3 at scales 1/2..1/16 (1500 points cannot fill finer scales)' },
  } };
}

// ---------- 6 : spin 1/2 dans un champ (Rabi / Larmor), evolution unitaire EXACTE ----------
// referentiel tournant, hbar = 1 : H = (delta/2) sigma_z + (rabi/2) sigma_x. U(h) = cos(W h/2) - i sin(W h/2) (n . sigma),
// W = sqrt(rabi^2 + delta^2), n = (rabi, 0, delta)/W. Etat psi = (a, b) complexe ; vecteur de Bloch = (<sx>, <sy>, <sz>).
function pasBloch(p, c) {
  const ar = p[0], ai = p[1], br = p[2], bi = p[3], C = c.uc, S = c.us, X = c.nx, Z = c.nz;
  /* a' = (C - i S Z) a - i S X b ; b' = -i S X a + (C + i S Z) b */
  p[0] = C * ar + S * Z * ai + S * X * bi; p[1] = C * ai - S * Z * ar - S * X * br;
  p[2] = C * br - S * Z * bi + S * X * ai; p[3] = C * bi + S * Z * br - S * X * ar;
}
function bloch(c, n) {
  const W = Math.sqrt(c.rabi * c.rabi + c.delta * c.delta), h = c.duree / (n - 1);
  const k = { h, delta: c.delta, rabi: c.rabi, uc: cosD(W * h / 2), us: sinD(W * h / 2), nx: c.rabi / W, nz: c.delta / W };
  const p = Float64Array.from([1, 0, 0, 0]), brut = new Float64Array(n * 3);
  let derive = 0, zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (i > 0) pasBloch(p, k);
    /* <sx> = 2 Re(a* b), <sy> = 2 Im(a* b), <sz> = |a|^2 - |b|^2 */
    const sx = 2 * (p[0] * p[2] + p[1] * p[3]), sy = 2 * (p[0] * p[3] - p[1] * p[2]), sz = p[0] * p[0] + p[1] * p[1] - p[2] * p[2] - p[3] * p[3];
    brut[3 * i] = sx; brut[3 * i + 1] = sy; brut[3 * i + 2] = sz;
    const d = Math.abs(Math.sqrt(sx * sx + sy * sy + sz * sz) - 1); if (d > derive) derive = d;
    if (sz < zmin) zmin = sz; if (sz > zmax) zmax = sz;
  }
  /* frequence de Rabi mesuree : passages montants de <sz> par son niveau moyen (min+max)/2, interpoles lineairement */
  const niveau = (zmin + zmax) / 2, passages = [];
  for (let i = 1; i < n; i++) { const a = brut[3 * i - 1] - niveau, b = brut[3 * i + 2] - niveau; if (a < 0 && b >= 0) passages.push((i - 1 + a / (a - b)) * h); }
  const m = passages.length, mesure = m >= 2 ? DEUX_PI * (m - 1) / (passages[m - 1] - passages[0]) : NaN;
  const transfert = (1 - zmin) / 2, transfertTheorie = c.rabi * c.rabi / (W * W);
  return { brut, invariants: {
    normeBloch: { debut: 1, derive, note: '|Bloch vector| = 1 for a pure state; exact unitary steps keep it to rounding' },
    frequenceRabi: { mesure, theorie: W, ecart: Math.abs(mesure - W) / W, oscillations: m - 1, unite: 'radian par unite de temps' },
    transfertMax: { mesure: transfert, theorie: transfertTheorie, note: 'theory is reached only if the run lasts half a Rabi period' },
  } };
}

// ---------- 7 : paquet gaussien dans un oscillateur harmonique, SPLIT-STEP FFT (Strang) sur une grille ----------
// hbar = m = 1, V = omega^2 x^2 / 2. psi(0) gaussien centre x0, largeur sigma0 = largeur / sqrt(2 omega) (largeur 1 = etat
// coherent, sinon comprime), <p>(0) = 0. Un pas : e^{-i V dt/2} F^-1 e^{-i k^2 dt/2} F e^{-i V dt/2}. Rien n est pris de la
// solution exacte : elle ne sert qu a la comparaison (Ehrenfest : <x>(t) = x0 cos(omega t)).
function fabriquerFFT(N) {
  const rev = new Uint32Array(N); let bits = 0; while ((1 << bits) < N) bits++;
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; }
  const cs = new Float64Array(N / 2), sn = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) { cs[k] = cosD(DEUX_PI * k / N); sn[k] = -sinD(DEUX_PI * k / N); }
  return (re, im, inverse) => {
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let taille = 2; taille <= N; taille *= 2) {
      const demi = taille / 2, saut = N / taille;
      for (let i = 0; i < N; i += taille) for (let j = 0; j < demi; j++) {
        const wr = cs[j * saut], wi = inverse ? -sn[j * saut] : sn[j * saut], a = i + j, b = a + demi;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
    if (inverse) for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
  };
}
function paquetOscillateur(c, n) {
  const w = c.omega, s0 = c.largeur / Math.sqrt(2 * w), sMax = Math.max(s0, 1 / (2 * s0 * w));
  const L = 2 * (c.x0 + 7 * sMax), pMax = w * c.x0 + 7 * Math.max(1 / (2 * s0), s0 * w);
  let N = 64; while (N < 2.5 * L * pMax / PI && N < 1024) N *= 2;
  const dx = L / N, T = c.periodes * DEUX_PI / w, pas = Math.ceil(T / (n - 1) / 0.01), dt = T / ((n - 1) * pas);
  const X = new Float64Array(N), Kv = new Float64Array(N), vr = new Float64Array(N), vi = new Float64Array(N), kr = new Float64Array(N), ki = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    const x = -L / 2 + j * dx; X[j] = x;
    const V = 0.5 * c.omega * c.omega * x * x;
    vr[j] = cosD(V * dt / 2); vi[j] = -sinD(V * dt / 2);
    const k = DEUX_PI * (j < N / 2 ? j : j - N) / L; Kv[j] = k;
    kr[j] = cosD(k * k * dt / 2); ki[j] = -sinD(k * k * dt / 2);
  }
  const fft = fabriquerFFT(N), re = new Float64Array(N), im = new Float64Array(N), fr = new Float64Array(N), fi = new Float64Array(N);
  { let q = 0; for (let j = 0; j < N; j++) { const u = X[j] - c.x0; re[j] = expD(-u * u / (4 * s0 * s0)); q += re[j] * re[j] * dx; } q = 1 / Math.sqrt(q); for (let j = 0; j < N; j++) re[j] *= q; }
  const phase = (ar, ai, br, bi) => { for (let j = 0; j < N; j++) { const a = ar[j], b = ai[j]; ar[j] = a * br[j] - b * bi[j]; ai[j] = a * bi[j] + b * br[j]; } };
  const brut = new Float64Array(n * 3), E = new Float64Array(n);
  let ex = 0, ep = 0, el = 0;
  const amplX = Math.max(c.x0, s0), amplP = Math.max(w * c.x0, 1 / (2 * s0));
  for (let i = 0; i < n; i++) {
    if (i > 0) for (let s = 0; s < pas; s++) { phase(re, im, vr, vi); fft(re, im, false); phase(re, im, kr, ki); fft(re, im, true); phase(re, im, vr, vi); }
    let m0 = 0, m1 = 0, m2 = 0;
    for (let j = 0; j < N; j++) { const d = re[j] * re[j] + im[j] * im[j]; m0 += d; m1 += d * X[j]; m2 += d * X[j] * X[j]; }
    fr.set(re); fi.set(im); fft(fr, fi, false);
    let q0 = 0, q1 = 0, q2 = 0;
    for (let j = 0; j < N; j++) { const d = fr[j] * fr[j] + fi[j] * fi[j]; q0 += d; q1 += d * Kv[j]; q2 += d * Kv[j] * Kv[j]; }
    const mx = m1 / m0, x2 = m2 / m0, mp = q1 / q0, p2 = q2 / q0, sx = Math.sqrt(Math.max(0, x2 - mx * mx)), t = i * pas * dt;
    brut[3 * i] = mx; brut[3 * i + 1] = mp; brut[3 * i + 2] = sx;
    E[i] = p2 / 2 + w * w * x2 / 2;
    const cw = cosD(w * t), sw = sinD(w * t);
    ex = Math.max(ex, Math.abs(mx - c.x0 * cw) / amplX); ep = Math.max(ep, Math.abs(mp + w * c.x0 * sw) / amplP);
    const sth = Math.sqrt(s0 * s0 * cw * cw + sw * sw / (4 * s0 * s0 * w * w)); el = Math.max(el, Math.abs(sx - sth) / sth);
  }
  let dE = 0; for (let i = 0; i < n; i++) dE = Math.max(dE, Math.abs(E[i] - E[0]) / E[0]);
  const Eth = 1 / (8 * s0 * s0) + w * w * s0 * s0 / 2 + w * w * c.x0 * c.x0 / 2;
  return { brut, invariants: {
    ehrenfest: { ecartX: ex, ecartP: ep, note: 'max |<x> - x0 cos wt| / max(x0, sigma0), same for <p> vs -w x0 sin wt' },
    energie: { debut: E[0], fin: E[n - 1], derive: dE, theorie: Eth, ecartTheorie: Math.abs(E[0] - Eth) / Eth },
    largeur: { ecart: el, note: 'sigma_x(t) vs sqrt(s0^2 cos^2 + sin^2 / (4 s0^2 w^2))' },
    grille: { points: N, longueur: L, dt, pasParPoint: pas },
  } };
}

// ---------- 8 : fentes de Young, impacts tires de |psi|^2 en champ lointain ----------
// I(x) = cos^2(pi d x/(lambda L)) sinc^2(pi a x/(lambda L)), x en mm, d et a en mm, lambda en nm, L = 1 m (Fraunhofer).
// Chaque point = un impact (une particule a la fois) ; y uniforme le long des fentes (modele 1-D) ; z = ordre d arrivee.
function intensiteFentes(x, c) {
  const u = PI * c.d * x / c.lL, v = PI * c.a * x / c.lL;
  const s = v === 0 ? 1 : sinD(v) / v, k = cosD(u);
  return k * k * s * s;
}
function fentesYoung(c, n) {
  const k = { ...c, lL: c.lambda * 1e-3 }, X = 3 * k.lL / c.a, alea = mulberry32(c.graine >>> 0), brut = new Float64Array(n * 3);
  const B = 512, larg = 2 * X / B, h = new Float64Array(B); let tirages = 0;
  for (let i = 0; i < n; i++) {
    let x; for (;;) { tirages++; x = -X + 2 * X * alea(); if (alea() < intensiteFentes(x, k)) break; }
    brut[3 * i] = x; brut[3 * i + 1] = -5 + 10 * alea(); brut[3 * i + 2] = X * i / (n - 1);
    h[Math.min(B - 1, Math.floor((x + X) / larg))]++;
  }
  /* frequence spatiale des franges : pic de |sum h_b e^{2 pi i f x_b}|^2 pour f au-dela de l enveloppe (f > 1.05 a/(lambda L)),
     jusqu a Nyquist des cases ; affine par parabole. Interfrange mesure = 1/f. */
  const fMin = 1.05 * c.a / k.lL, fMax = B / (4 * X), df = 1 / (16 * X), S = [];
  for (let f = fMin; f <= fMax; f += df) {
    const x0 = -X + larg / 2; let er = cosD(DEUX_PI * f * x0), ei = sinD(DEUX_PI * f * x0); const rr = cosD(DEUX_PI * f * larg), ri = sinD(DEUX_PI * f * larg);
    let sr = 0, si = 0;
    for (let b = 0; b < B; b++) { sr += h[b] * er; si += h[b] * ei; const t = er * rr - ei * ri; ei = er * ri + ei * rr; er = t; }
    S.push(sr * sr + si * si);
  }
  let j = 0; for (let i = 1; i < S.length; i++) if (S[i] > S[j]) j = i;
  let dj = 0; if (j > 0 && j < S.length - 1) { const a = S[j - 1], b = S[j], g = S[j + 1], q = a - 2 * b + g; if (q < 0) dj = 0.5 * (a - g) / q; }
  const f = fMin + (j + dj) * df, mesure = 1 / f, theorie = k.lL / c.d;
  return { brut, invariants: {
    interfrange: { mesure, theorie, ecart: Math.abs(mesure - theorie) / theorie, unite: 'mm' },
    echantillonnage: { tirages, fenetre: X, cases: B },
  } };
}

// ---------- 9 : particule dans une boite cubique (cote 1, parois infinies), nuage |psi_nmk|^2 ----------
// psi = (sqrt 2)^3 sin(n pi x) sin(m pi y) sin(k pi z) ; |psi|^2 se separe : chaque coordonnee tiree selon sin^2(q pi u).
// E = pi^2 (n^2 + m^2 + k^2) / 2 (hbar = masse = cote = 1).
function tirerSin2(q, alea) { for (;;) { const x = alea(), s = sinD(q * PI * x); if (alea() < s * s) return x; } }
/* plans nodaux mesures sur l echantillon : histogramme de 60 cases d une coordonnee, lu avec hysteresis (une vallee = passage
   sous 0.3 x la moyenne APRES un passage au-dessus de 0.8 x la moyenne, refermee par un nouveau passage au-dessus) ; les parois
   sont des zeros de psi mais pas des plans nodaux : la zone basse de depart et celle d arrivee ne comptent pas.
   (Un seuil simple comptait le bruit pres des parois : 4 plans mesures pour 3 a (2,3,1) graine 1, constate le 2026-11-01.) */
function plansNodaux(brut, n, axe) {
  const B = 60, h = new Float64Array(B), bas = 0.3 * n / B, haut = 0.8 * n / B; let vallees = 0, etat = 'paroi';
  for (let i = 0; i < n; i++) h[Math.min(B - 1, Math.floor((brut[3 * i + axe] + 0.5) * B))]++;
  for (let b = 0; b < B; b++) {
    if (etat !== 'haut' && h[b] > haut) { if (etat === 'vallee') vallees++; etat = 'haut'; }
    else if (etat === 'haut' && h[b] < bas) etat = 'vallee';
  }
  return vallees; // une vallee encore ouverte en b = B-1 est la paroi d arrivee : non comptee
}
function boiteQuantique(c, n) {
  const alea = mulberry32(c.graine >>> 0), Q = [c.n, c.m, c.k], brut = new Float64Array(n * 3), el = [];
  const psi1 = (q, u) => sinD(PI * q * u), hd = 1e-3;
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let a = 0; a < 3; a++) {
      const u = tirerSin2(Q[a], alea); brut[3 * i + a] = u - 0.5;
      /* energie locale -(1/2) f''/f par differences centrees : constante si psi est un etat propre */
      const f = psi1(Q[a], u); e += -0.5 * (psi1(Q[a], u + hd) - 2 * f + psi1(Q[a], u - hd)) / (hd * hd) / f;
    }
    el.push(e);
  }
  el.sort((u, v) => u - v);
  const Eth = PI * PI * (c.n * c.n + c.m * c.m + c.k * c.k) / 2, Em = el[n >> 1];
  const nod = [0, 1, 2].map((a) => plansNodaux(brut, n, a));
  return { brut, invariants: {
    plansNodaux: { mesure: nod[0] + nod[1] + nod[2], parAxe: nod, theorie: c.n - 1 + c.m - 1 + c.k - 1 },
    energie: { mesure: Em, theorie: Eth, ecart: Math.abs(Em - Eth) / Eth, sommeCarres: c.n * c.n + c.m * c.m + c.k * c.k,
      note: 'median local energy -(1/2) laplacian(psi)/psi by finite differences at the sampled points' },
  } };
}

// ---------- catalogue ----------
const FONCTIONS = { mandelbrot, mandelbulb, spiraleOr, phyllotaxieOr, ifs3d, bloch, paquetOscillateur, fentesYoung, boiteQuantique };
const SANS_LYAP = 'sans objet (ensemble ou nuage, pas une trajectoire)', LIN = 'sans objet (evolution unitaire lineaire : pas de chaos)';
export const SYSTEMES = Object.freeze([
  { id: 'mandelbrot', nom: 'Mandelbrot set boundary', science: 'Fractals', D: 3, nuage: true,
    params: { cx: -0.75, cy: 0, zoom: 1, maxIter: 200 }, bornes: { cx: [-2, 1], cy: [-1.5, 1.5], zoom: [1, 10000], maxIter: [50, 1000] },
    phrase: 'Grid points c just outside the Mandelbrot set (they escape |z| > 2 but touch a pixel that never escaped in maxIter steps), lifted by the log of their escape time; a pixel grid and finite iterations only approximate the true boundary.' },
  { id: 'mandelbulb', nom: 'Mandelbulb surface', science: 'Fractals', D: 3, nuage: true,
    params: { puissance: 8, maxIter: 10 }, bornes: { puissance: [2, 12], maxIter: [4, 20] },
    phrase: 'The outer surface of the White-Nylander Mandelbulb of the chosen power, found by marching rays from radius 2 inward and bisecting; one point per ray, so hidden folds and inner structure are not sampled.' },
  { id: 'spiraleOr', nom: 'Golden spiral', science: 'Golden ratio', D: 3,
    params: { tours: 3, hauteur: 0.5 }, bornes: { tours: [1, 6], hauteur: [0, 2] },
    phrase: 'A logarithmic spiral that grows by exactly phi every quarter turn, lifted into a slow helix, beside the corners of whirling Fibonacci squares whose integer sides only approach the golden ratio.' },
  { id: 'phyllotaxieOr', nom: 'Golden-angle phyllotaxis', science: 'Golden ratio', D: 3, nuage: true,
    params: { decalage: 0 }, bornes: { decalage: [-5, 5] },
    phrase: 'Vogel\'s sunflower model wrapped on a sphere: each new seed turns by 360/phi^2 = 137.508 degrees plus the chosen offset in degrees; a geometric model of packing, not a model of plant growth.' },
  { id: 'ifs3d', nom: 'Sierpinski tetrahedron', science: 'Fractals', D: 3, nuage: true,
    params: { rapport: 0.5, graine: 1 }, bornes: { rapport: [0.35, 0.5], graine: [1, 1000000] },
    phrase: 'The chaos game on four vertices of a tetrahedron (jump the chosen fraction of the way to a random vertex); a finite sample of points from a fractal whose similarity dimension is ln 4 / ln(1/ratio).' },
  { id: 'bloch', nom: 'Spin-1/2 Rabi oscillation', science: 'Quantum mechanics', D: 3,
    params: { delta: 0.5, rabi: 1, duree: 30 }, bornes: { delta: [-5, 5], rabi: [0.1, 5], duree: [5, 100] },
    phrase: 'The Bloch vector (<sx>, <sy>, <sz>) of one spin-1/2 driven by a field in the rotating frame, from the exact 2x2 unitary evolution of the Schrodinger equation; expectation values of a pure state, no decay, no measurement.' },
  { id: 'paquetOscillateur', nom: 'Wavepacket in a harmonic well', science: 'Quantum mechanics', D: 3,
    params: { x0: 2, largeur: 1, omega: 1, periodes: 2 }, bornes: { x0: [0, 4], largeur: [0.5, 2], omega: [0.5, 2], periodes: [1, 6] },
    phrase: 'A Gaussian wavepacket in a 1-D quantum harmonic oscillator evolved by split-step Fourier on a finite periodic grid, drawn as (<x>, <p>, width); width 1 is a coherent state, other widths are squeezed and breathe.' },
  { id: 'fentesYoung', nom: 'Double-slit detections', science: 'Quantum mechanics', D: 3, nuage: true,
    params: { d: 0.25, a: 0.04, lambda: 550, graine: 1 }, bornes: { d: [0.1, 0.5], a: [0.02, 0.1], lambda: [400, 700], graine: [1, 1000000] },
    phrase: 'Single-particle hits on a screen 1 m behind two slits (separation d and width a in mm, wavelength in nm), drawn one by one from the far-field probability cos^2 x sinc^2; the slits are ideal and the spread along y is uniform.' },
  { id: 'boiteQuantique', nom: 'Particle in a box', science: 'Quantum mechanics', D: 3, nuage: true,
    params: { n: 2, m: 3, k: 1, graine: 1 }, bornes: { n: [1, 5], m: [1, 5], k: [1, 5], graine: [1, 1000000] },
    phrase: 'The probability cloud |psi|^2 of a particle in a cubic box with perfectly hard walls in the state (n, m, k), sampled point by point; not a path, and the walls are an idealisation.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
const ENTIERS = { mandelbrot: ['maxIter'], mandelbulb: ['puissance', 'maxIter'], spiraleOr: ['tours'], ifs3d: ['graine'], fentesYoung: ['graine'], boiteQuantique: ['n', 'm', 'k', 'graine'] };
const parId = (id) => { const s = SYSTEMES.find((x) => x.id === id); if (!s) throw new Error('systeme inconnu: ' + id); return s; };

/** params bornes : non fini -> defaut ; hors bornes -> ramene ; entiers arrondis ; fentes : a <= d/2 */
function borner(id, params) {
  const s = parId(id), P = {};
  for (const k of Object.keys(s.params)) {
    let v = Number(params && params[k]); if (!Number.isFinite(v)) v = s.params[k];
    const [a, b] = s.bornes[k]; v = Math.min(b, Math.max(a, v));
    if ((ENTIERS[id] || []).includes(k)) v = Math.round(v);
    P[k] = v;
  }
  if (id === 'fentesYoung') P.a = Math.min(P.a, P.d / 2);
  return P;
}

export function reglagesPhysique(id, params = {}) {
  const s = parId(id), P = borner(id, params);
  return Object.keys(s.params).map((k) => ({ chemin: 'params.' + k, nom: k, min: s.bornes[k][0], max: s.bornes[k][1], valeur: P[k] }));
}

export function simuler(id, params = {}, { n = 1500 } = {}) {
  const s = parId(id), P = borner(id, params);
  n = Math.max(2, Math.floor(n));
  const r = FONCTIONS[id](P, n), fini = r.brut.every(Number.isFinite);
  const o = { params: P, D: s.D, n, bornee: fini, brut: fini ? r.brut : null, lyapunov: null,
    uniteLyapunov: id === 'bloch' || id === 'paquetOscillateur' ? LIN : SANS_LYAP, points: null, invariants: r.invariants };
  if (!fini) o.raison = 'NaN';
  if (s.nuage) o.nuage = true;
  return o;
}
