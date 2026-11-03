// tam-biologie.js -- TAM, sciences de la vie (ADN, ARN, genes), chacune une simulation honnete comparee a une formule EXACTE.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-theories-3.js : SYSTEMES, ENTIERS, COLONNES, SOURCES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun generateur aleatoire natif (graines : mulberry32).
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux du moteur ; e^(-x) ici par demi-reductions + serie + carres
//   (+ - * / seulement) ; Math.sqrt/round/floor/abs/min/max seulement (IEEE exacts).
// REGLE DU PROJET : aucune valeur publiee sans source lue. Ici AUCUNE : les taux sont sans dimension (temps en duree de vie d un ARN
//   messager pour le dogme central, en unites arbitraires pour les mutations), chaque formule comparee est derivee dans le commentaire
//   de sa section ; SOURCES est vide expres. L helice est DESSINEE (10 bases par tour, pas a l echelle) : aucune geometrie publiee n est
//   affirmee.
// Les systemes :
//   adnMutations : une sequence d ADN qui mute au hasard (modele de Jukes-Cantor), fraction de sites differents 3/4 (1 - e^(-4 mu t / 3)).
//   dogmeCentral : gene -> ARN messager -> proteine, une molecule a la fois (Gillespie) ; moyennes, bruits (Fano) et covariance exacts.
//   deriveGenetique : derive genetique (Wright-Fisher) ; moyenne conservee, heterozygotie H0 (1 - 1/2N)^t exacte, fixation p0.
//   enzyme       : cinetique de Michaelis-Menten (4 especes integrees) ; conservations temoins, loi de vitesse APPROCHEE.
import { sinD, cosD, lnD } from './tam-moteur.js';

const DEUX_PI = 2 * Math.PI;

// ---------- constantes d entree : aucune (unites sans dimension) ----------
export const SOURCES = Object.freeze({});

// ---------- arithmetique deterministe ----------
/* e^(-x), x >= 0 : x divise par 2 jusqu a x <= 1/2 (m fois, exact en binaire), serie a 30 termes (reste < 0.5^31/31!), puis m carres */
function expNegD(x) {
  if (!(x >= 0)) return NaN;
  if (x === Infinity) return 0;
  let m = 0; while (x > 0.5) { x /= 2; m++; }
  let s = 1, t = 1; for (let j = 1; j <= 30; j++) { t *= -x / j; s += t; }
  for (let i = 0; i < m; i++) s *= s;
  return s;
}
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* attente exponentielle de taux L : -ln(U)/L avec U dans (0, 1] (1 - rng() n est jamais 0) */
const attente = (rng, L) => -lnD(1 - rng()) / L;
function decouper(n, images) { const d = []; for (let k = 0; k < images; k++) d.push(Math.floor(k * n / images)); return d; }
function filmDe(debuts, n) {
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}

// ---------- 1 : une sequence d ADN qui mute (Jukes-Cantor) ----------
// Chaque site change de base au taux mu, vers chacune des 3 autres bases au taux mu/3. Equivalent EXACT (uniformisation) : au taux
//   lambda = 4 mu / 3 le site TIRE une base uniforme parmi les 4 (elle-meme comprise : 1 fois sur 4 rien ne change, d ou le taux de
//   vraie substitution 3/4 lambda = mu). Apres le premier tirage le site est uniforme et independant de l ancetre, donc
//   P(site different de l ancetre a t) = (1 - e^(-lambda t)) * 3/4 = 3/4 (1 - e^(-4 mu t / 3)).   [Jukes-Cantor, derive ici]
// Les L sites sont independants : la fraction mesuree p a l ecart-type sqrt(p (1 - p) / L) (binomiale, exact).
// Distance relue : d = -3/4 ln(1 - 4 p / 3) inverse la formule, donc d -> mu t ; sigma par la methode delta sqrt(p(1-p)/L) / (1 - 4p/3)
//   (approchee : developpement au premier ordre). Quand p >= 3/4 la distance n existe pas (saturation) : on le DIT.
// Substitutions comptees (tirages qui changent vraiment la base) par site : Poisson de moyenne mu t, sigma sqrt(mu t / L).
//   Elles depassent les differences : plusieurs coups au meme site s effacent (c est ce que la distance corrige).
// Composition : a l equilibre chaque base vaut 1/4 ; le chi2 des 4 comptes a 3 degres de liberte, moyenne 3, ecart-type sqrt 6.
// Dessin : un film de 8 instants ; chaque image montre le debut de la sequence en double helice (brin 2 = complement, A-T, C-G),
//   10 paires par tour, hauteur ramenee a 6 rayons (dessinee, pas a l echelle).
const ADN_IMAGES = 8, ADN_PAR_TOUR = 10, ADN_RAYON = 3, ADN_SILLON = 0.75 * Math.PI;
function adnMutations(P, n) {
  const L = P.bases, mu = P.taux, T = P.duree, lam = 4 * mu / 3, rng = mulberry32(P.graine);
  const images = Math.min(ADN_IMAGES, n), ts = Array.from({ length: images }, (_, f) => (images === 1 ? T : f * T / (images - 1)));
  const anc = new Uint8Array(L), etat = Array.from({ length: images }, () => new Uint8Array(L));
  let subs = 0;
  for (let i = 0; i < L; i++) anc[i] = Math.floor(rng() * 4);
  for (let i = 0; i < L; i++) {
    let b = anc[i], t = attente(rng, lam);
    for (let f = 0; f < images; f++) {
      while (t <= ts[f]) { const nb = Math.floor(rng() * 4); if (nb !== b) subs++; b = nb; t += attente(rng, lam); }
      etat[f][i] = b;
    }
  }
  const pDe = (t) => 0.75 * (1 - expNegD(lam * t));
  const serie = { t: [], mesure: [], formule: [], sigma: [] };
  let pire = 0;
  for (let f = 0; f < images; f++) {
    let d = 0; for (let i = 0; i < L; i++) if (etat[f][i] !== anc[i]) d++;
    const p = pDe(ts[f]), s = Math.sqrt(p * (1 - p) / L), m = d / L;
    serie.t.push(ts[f]); serie.mesure.push(m); serie.formule.push(p); serie.sigma.push(s);
    if (s > 0) pire = Math.max(pire, Math.abs(m - p) / s);
  }
  const pT = serie.mesure[images - 1], fT = serie.formule[images - 1], sT = serie.sigma[images - 1];
  /* sonde du 03/11 : a mu t = 10 la formule elle-meme vaut 3/4 a 2e-6 pres ; sigma(d) explose (z ~ 0 vide de sens) : non compare */
  const presque = 0.75 - fT < 3 * sT;
  const sature = pT >= 0.75, dist = sature ? NaN : -0.75 * lnD(1 - 4 * pT / 3), sD = sT / (1 - 4 * fT / 3);
  const comptes = [0, 0, 0, 0]; for (let i = 0; i < L; i++) comptes[etat[images - 1][i]]++;
  let chi2 = 0; for (const c of comptes) chi2 += (c - L / 4) * (c - L / 4) / (L / 4);
  /* brut : image f = c lignes = paires de bases du debut de la sequence, brin 1 puis brin 2 */
  const debuts = images === 1 ? [0] : decouper(n, images), film = filmDe(debuts, n), brut = new Float64Array(n * 5);
  for (let f = 0; f < images; f++) {
    const d0 = film.debuts[f], c = film.tailles[f], paires = Math.max(1, Math.ceil(c / 2)), h = 6 * ADN_RAYON / paires;
    for (let r = 0; r < c; r++) {
      const j = Math.floor(r / 2) % L, brin = r % 2, a = DEUX_PI * j / ADN_PAR_TOUR + brin * ADN_SILLON, b = etat[f][j], o = 5 * (d0 + r);
      brut[o] = ADN_RAYON * cosD(a); brut[o + 1] = ADN_RAYON * sinD(a); brut[o + 2] = j * h; brut[o + 3] = brin ? 3 - b : b; brut[o + 4] = ts[f];
    }
  }
  return { D: 5, brut, film, nuage: true, unite: 'sans objet (processus aleatoire, non chaotique)', invariants: {
    differences: { mesure: pT, formule: fT, sigma: sT, sites: L, t: T, serie, pireEcartSigma: pire,
      note: 'fraction of sites that differ from the ancestor against 3/4 (1 - e^(-4 mu t / 3)) (Jukes-Cantor), binomial sigma sqrt(p(1-p)/L) ; every frame is in the series' },
    distance: { mesure: dist, formule: mu * T, sigma: sD, ...(sature ? { absente: 'the sequences are saturated: 3/4 of the sites differ, the distance cannot be read back' } : {}),
      ...(presque && !sature ? { comparable: false, pasCompare: 'the sequences are nearly saturated, the read-back distance is too uncertain' } : {}),
      approchee: 'its sigma is the first-order (delta-method) one',
      note: 'distance read back from the differences, -3/4 ln(1 - 4p/3), against the true mu t ; it corrects for several hits on the same site' },
    substitutions: { mesure: subs / L, formule: mu * T, sigma: Math.sqrt(mu * T / L), differences: pT,
      note: 'real base changes per site (Poisson, mean mu t) ; more than the differences once sites are hit twice' },
    composition: { mesure: chi2, formule: 3, sigma: Math.sqrt(6), baseA: comptes[0] / L, baseC: comptes[1] / L, baseG: comptes[2] / L, baseT: comptes[3] / L,
      note: 'chi-square of the four base counts against 1/4 each (3 degrees of freedom : mean 3, sigma sqrt 6)' } } };
}

// ---------- 2 : le dogme central, gene -> ARN messager -> proteine (Gillespie) ----------
// Reactions (temps en duree de vie moyenne d un ARN messager, gamma = 1) : gene -> gene + ARN au taux k ; ARN -> rien au taux m ;
//   ARN -> ARN + proteine au taux kp m ; proteine -> rien au taux gp p. Algorithme de Gillespie EXACT (une reaction a la fois).
// Le reseau est LINEAIRE : les equations des moments se ferment exactement. A l etat stationnaire :
//   <m> = k ; Var m = <m> (Poisson exacte, Fano 1) ;
//   <p> = kp <m> / gp ;
//   d<mp>/dt = 0  ->  Cov(m, p) = kp Var m / (1 + gp) = kp k / (1 + gp) ;
//   d<p^2>/dt = 0 ->  Var p = <p> + kp Cov(m, p) / gp, donc Fano p = Var p / <p> = 1 + kp / (1 + gp)   (bruit des salves de traduction).
// Mesure : moyennes ponderees par le temps passe dans chaque etat, apres un rodage de 20 temps de relaxation (20 / min(1, gp)).
// Incertitude MESUREE, pas supposee : la duree mesuree est coupee en 20 blocs ; jackknife (on retire un bloc a la fois) sur chaque
//   grandeur, sigma = sqrt(19/20 sum (x_(-b) - moyenne)^2). Blocs >= 5 temps de relaxation de la proteine : peu correles.
/* sonde du 03/11 (30 graines par reglage) : a gp = 0.05 des blocs de 100 temps (5 relaxations) donnaient des z d ecart-type 1.41 —
 *   sigma sous-estime par la correlation entre blocs ; la duree est portee a 200 / gp (blocs de 10 relaxations) quand gp < 0.1 */
const DOGME_DUREE_MIN = 2000, DOGME_BLOCS = 20, DOGME_FENETRE = 30;
function dogmeCentral(P, n) {
  const k = P.transcription, kp = P.traduction, gp = P.degradation, rng = mulberry32(P.graine);
  const DOGME_DUREE = Math.max(DOGME_DUREE_MIN, 200 / gp), rodage = 20 / Math.min(1, gp), T = rodage + DOGME_DUREE, Tb = DOGME_DUREE / DOGME_BLOCS;
  /* sommes par bloc : temps, m, m^2, p, p^2, m p */
  const S = Array.from({ length: DOGME_BLOCS }, () => new Float64Array(6));
  const t0dessin = T - DOGME_FENETRE, brut = new Float64Array(n * 3);
  let m = Math.round(k), p = Math.round(k * kp / gp), t = 0, ligne = 0, evenements = 0;
  const accumuler = (a, b) => { /* l etat (m, p) tient de a a b */
    if (b <= rodage) return;
    a = Math.max(a, rodage);
    while (a < b) {
      const blk = Math.min(DOGME_BLOCS - 1, Math.floor((a - rodage) / Tb)), fin = Math.min(b, rodage + (blk + 1) * Tb), dt = fin - a, s = S[blk];
      s[0] += dt; s[1] += m * dt; s[2] += m * m * dt; s[3] += p * dt; s[4] += p * p * dt; s[5] += m * p * dt;
      a = fin > a ? fin : b;
    }
  };
  /* ligne l du dessin = etat a l instant t0dessin + l W/(n-1) ; l etat courant vaut sur [a, b) */
  const tl = (l) => l * DOGME_FENETRE / (n - 1);
  const dessiner = (b) => { while (ligne < n && t0dessin + tl(ligne) < b) { const o = 3 * ligne; brut[o] = tl(ligne); brut[o + 1] = m; brut[o + 2] = p; ligne++; } };
  while (t < T) {
    const a1 = k, a2 = m, a3 = kp * m, a4 = gp * p, a0 = a1 + a2 + a3 + a4;
    const tn = Math.min(T, t + attente(rng, a0));
    accumuler(t, tn); dessiner(tn);
    t = tn; if (t >= T) break;
    const u = rng() * a0;
    if (u < a1) m++; else if (u < a1 + a2) m--; else if (u < a1 + a2 + a3) p++; else p--;
    evenements++;
  }
  while (ligne < n) { const o = 3 * ligne; brut[o] = tl(ligne); brut[o + 1] = m; brut[o + 2] = p; ligne++; }
  /* estimateurs sur un ensemble de blocs (masque = bloc retire, -1 = aucun) */
  const est = (sauf) => {
    const z = new Float64Array(6); for (let b = 0; b < DOGME_BLOCS; b++) if (b !== sauf) for (let j = 0; j < 6; j++) z[j] += S[b][j];
    const Mm = z[1] / z[0], Mp = z[3] / z[0], Vm = z[2] / z[0] - Mm * Mm, Vp = z[4] / z[0] - Mp * Mp, C = z[5] / z[0] - Mm * Mp;
    return [Mm, Vm / Mm, Mp, Vp / Mp, C];
  };
  const tout = est(-1), jk = Array.from({ length: DOGME_BLOCS }, (_, b) => est(b));
  const sig = (j) => { let mo = 0; for (const x of jk) mo += x[j]; mo /= DOGME_BLOCS; let s = 0; for (const x of jk) s += (x[j] - mo) * (x[j] - mo); return Math.sqrt(s * (DOGME_BLOCS - 1) / DOGME_BLOCS); };
  const cov = kp * k / (1 + gp);
  const note = 'time-weighted average after ' + rodage + ' time units of warm-up ; sigma from a jackknife over ' + DOGME_BLOCS + ' time blocks (measured, not assumed)';
  return { D: 3, brut, unite: 'sans objet (processus aleatoire, non chaotique)', invariants: {
    arnMoyen: { mesure: tout[0], formule: k, sigma: sig(0), note: 'mean number of mRNA against k (transcription rate / decay rate) ; ' + note },
    bruitArn: { mesure: tout[1], formule: 1, sigma: sig(1), note: 'Fano factor of mRNA (variance / mean) against 1 : mRNA counts are exactly Poisson ; ' + note },
    proteineMoyenne: { mesure: tout[2], formule: k * kp / gp, sigma: sig(2), note: 'mean number of proteins against k kp / gp ; ' + note },
    bruitProteine: { mesure: tout[3], formule: 1 + kp / (1 + gp), sigma: sig(3), note: 'Fano factor of proteins against 1 + kp / (1 + gp) : each mRNA makes proteins in bursts ; ' + note },
    covariance: { mesure: tout[4], formule: cov, sigma: sig(4), note: 'covariance of mRNA and protein counts against kp k / (1 + gp) ; ' + note },
    simulation: { evenements, duree: DOGME_DUREE, rodage, blocs: DOGME_BLOCS, fenetreDessin: DOGME_FENETRE,
      note: 'exact stochastic simulation (Gillespie), one reaction at a time ; the drawing is the last ' + DOGME_FENETRE + ' time units' } } };
}

// ---------- 3 : derive genetique (Wright-Fisher) ----------
// R populations independantes de N individus diploides (2N copies d un gene, deux variantes). Chaque generation tire ses 2N copies
//   au hasard parmi celles de la generation d avant : compte' ~ Binomiale(2N, p), p = compte / 2N (tirage copie par copie).
// Exact, derive ici : E[p'] = p (martingale), donc E[p_t] = p0 ;
//   E[2 p'(1 - p')] = 2 (p - E[p'^2]) = 2 (p - p^2 - p(1 - p)/(2N)) = (1 - 1/(2N)) 2 p (1 - p) : l heterozygotie attendue decroit
//   EXACTEMENT comme H_t = H0 (1 - 1/(2N))^t ; et Var p_t = p0 (1 - p0) - E[p(1-p)] = p0 (1 - p0) (1 - (1 - 1/(2N))^t).
// Mesures sur les R populations : moyenne de p (sigma exact sqrt(Var p_t / R)), moyenne de 2p(1-p) (sigma = ecart-type mesure / sqrt R).
// Fixation : une population finit toujours fixee (p = 0 ou 1) ; P(fixee a 1, un jour) = p0 (martingale bornee). A la generation G
//   seules les populations deja fixees comptent : compare seulement quand >= 99 % le sont (sinon on le DIT).
// Dessin : un film, une image par population (les 12 premieres), frequence de la variante au fil des generations.
const WF_DESSINEES = 12;
function deriveGenetique(P, n) {
  const N2 = 2 * P.individus, p0 = P.partDepart, G = P.generations, R = P.populations, rng = mulberry32(P.graine);
  const K = Math.min(WF_DESSINEES, R, n), traj = Array.from({ length: K }, () => new Float64Array(G + 1));
  const c = new Int32Array(R), c0 = Math.round(p0 * N2), p0e = c0 / N2;
  c.fill(c0); for (let k = 0; k < K; k++) traj[k][0] = p0e;
  for (let g = 1; g <= G; g++) {
    for (let r = 0; r < R; r++) {
      const q = c[r] / N2; if (q === 0 || q === 1) continue;
      let x = 0; for (let j = 0; j < N2; j++) if (rng() < q) x++;
      c[r] = x;
    }
    for (let k = 0; k < K; k++) traj[k][g] = c[k] / N2;
  }
  let sp = 0, sh = 0, sh2 = 0, a1 = 0, a0 = 0;
  for (let r = 0; r < R; r++) { const q = c[r] / N2, h = 2 * q * (1 - q); sp += q; sh += h; sh2 += h * h; if (q === 1) a1++; if (q === 0) a0++; }
  const mp = sp / R, mh = sh / R, sdh = Math.sqrt(Math.max(0, sh2 / R - mh * mh) * R / (R - 1));
  const lam = 1 - 1 / N2, lG = lam ** G, H0 = 2 * p0e * (1 - p0e), fix = (a0 + a1) / R;
  const debuts = decouper(n, K), film = filmDe(debuts, n), brut = new Float64Array(n * 3);
  for (let f = 0; f < K; f++) { const d0 = film.debuts[f], t = film.tailles[f];
    for (let r = 0; r < t; r++) { const g = t === 1 ? G : Math.round(r * G / (t - 1)), o = 3 * (d0 + r); brut[o] = g; brut[o + 1] = traj[f][g]; brut[o + 2] = f + 1; } }
  return { D: 3, brut, film, unite: 'sans objet (processus aleatoire, non chaotique)', invariants: {
    frequenceMoyenne: { mesure: mp, formule: p0e, sigma: Math.sqrt(p0e * (1 - p0e) * (1 - lG) / R), populations: R,
      note: 'mean variant frequency over the populations against its start p0 : drift has no direction (exact), sigma from the exact variance p0 (1 - p0)(1 - (1 - 1/2N)^t)' },
    /* sonde du 03/11 : toutes les populations fixees -> ecart-type mesure 0 -> z infini ; pas de sigma alors (mesure 0 exacte) */
    heterozygotie: { mesure: mh, formule: H0 * lG, ...(sdh > 0 ? { sigma: sdh / Math.sqrt(R) } : {}), debut: H0, generations: G,
      note: 'mean heterozygosity 2p(1-p) against H0 (1 - 1/2N)^t (exact) ; sigma = measured spread / sqrt(populations)' },
    fixation: { mesure: (a0 + a1) ? a1 / (a0 + a1) : NaN, formule: p0e, sigma: (a0 + a1) ? Math.sqrt(p0e * (1 - p0e) / (a0 + a1)) : NaN, fixees: fix,
      ...((a0 + a1) === 0 ? { absente: 'no population has fixed yet' } : fix < 0.99 ? { comparable: false, pasCompare: 'only ' + Math.round(fix * 100) + ' % of the populations have fixed; the others may still go either way' } : {}),
      note: 'share of fixed populations where the variant won, against p0 (the chance a variant eventually wins equals its start frequency)' } } };
}

// ---------- 4 : une enzyme au travail (Michaelis-Menten) ----------
// E + S <-> C -> E + P, taux k1 = 1 (fixe : unite de temps), k-1 et kcat reglables. Les QUATRE especes sont integrees (RK4) sans
//   eliminer d equation : E + C = E0 et S + C + P = S0 sont alors des TEMOINS (RK4 conserve exactement les invariants lineaires,
//   derive = arrondi).
// Loi de vitesse (APPROCHEE, etat quasi stationnaire) : dP/dt = Vmax S / (Km + S), Vmax = kcat E0, Km = (k-1 + kcat)/k1.
//   Elle vaut quand eps = E0 / (S0 + Km) << 1 (le complexe s equilibre vite) ; comparee a mi-parcours (S = S0/2), eps est affiche.
// (sonde du 03/11 : 636 ms au coin S0 50, E0 0.05, kcat 0.2 -> kcat borne a 0.5 et pas 0.5 / taux le plus rapide)
// Duree : T = (S0 + 5 Km) / Vmax (S consomme presque entierement) ; pas h = min(0.5 / (k1 (S0 + E0) + k-1 + kcat), T / 2000).
function enzyme(P, n) {
  const S0 = P.substrat, E0 = P.enzyme, km1 = P.dissociation, k2 = P.catalyse, k1 = 1;
  const Km = (km1 + k2) / k1, Vmax = k2 * E0, T = (S0 + 5 * Km) / Vmax, h0 = Math.min(0.5 / (k1 * (S0 + E0) + km1 + k2), T / 2000);
  const pas = Math.ceil(T / h0), h = T / pas;
  const f = (y, d) => { const [S, E, C] = y, a = k1 * E * S, b = km1 * C, c = k2 * C; d[0] = -a + b; d[1] = -a + b + c; d[2] = a - b - c; d[3] = c; };
  let y = [S0, E0, 0, 0];
  const k = [0, 1, 2, 3].map(() => new Float64Array(4)), tmp = new Float64Array(4), brut = new Float64Array(n * 3);
  let pireE = 0, pireS = 0, ligne = 0, vMi = NaN, sMi = NaN;
  const ecrire = (st) => { while (ligne < n && Math.round(ligne * pas / (n - 1)) === st) { const o = 3 * ligne; brut[o] = y[0]; brut[o + 1] = y[3]; brut[o + 2] = y[2]; ligne++; } };
  ecrire(0);
  for (let st = 1; st <= pas; st++) {
    const avant = y[0];
    f(y, k[0]); for (let i = 0; i < 4; i++) tmp[i] = y[i] + h / 2 * k[0][i];
    f(tmp, k[1]); for (let i = 0; i < 4; i++) tmp[i] = y[i] + h / 2 * k[1][i];
    f(tmp, k[2]); for (let i = 0; i < 4; i++) tmp[i] = y[i] + h * k[2][i];
    f(tmp, k[3]); y = y.map((v, i) => v + h / 6 * (k[0][i] + 2 * k[1][i] + 2 * k[2][i] + k[3][i]));
    pireE = Math.max(pireE, Math.abs(y[1] + y[2] - E0)); pireS = Math.max(pireS, Math.abs(y[0] + y[2] + y[3] - S0)); /* derives ABSOLUES : l ecran les rapporte a debut */
    if (avant > S0 / 2 && y[0] <= S0 / 2) { sMi = y[0]; vMi = k2 * y[2]; }
    ecrire(st);
  }
  const eps = E0 / (S0 + Km), vF = Vmax * sMi / (Km + sMi);
  return { D: 3, brut, unite: 'sans objet (cinetique chimique, non chaotique)', invariants: {
    enzymeTotale: { debut: E0, fin: y[1] + y[2], derive: pireE, note: 'free enzyme + bound enzyme = E0 at every step (witness : all four species are integrated)' },
    matiereTotale: { debut: S0, fin: y[0] + y[2] + y[3], derive: pireS, note: 'substrate + complex + product = S0 at every step (witness)' },
    vitesseReaction: { mesure: vMi, formule: vF, eps, Km, Vmax, substratMi: sMi,
      approchee: 'Michaelis-Menten assumes the enzyme-substrate complex settles at once; its error scale here is E0 / (S0 + Km) = ' + eps.toPrecision(2),
      note: 'rate of product formation when half the substrate is used, against Vmax S / (Km + S)' },
    produitFinal: { partConvertie: y[3] / S0, tFin: T, note: 'share of the substrate turned into product by the end of the run ; measured only' } } };
}

// ---------- colonnes de brut ----------
export const COLONNES = Object.freeze({
  adnMutations: { colonnes: ['x (drawn double helix, not to scale)', 'y (same)', 'position along the sequence (drawn)', 'base (0 = A, 1 = C, 2 = G, 3 = T)', 'time t'], memeLongueur: [[0, 1, 2]], autres: [3, 4] },
  dogmeCentral: { colonnes: ['time t (mRNA lifetimes, last 30)', 'number of mRNA molecules', 'number of protein molecules'], memeLongueur: [], autres: [0, 1, 2] },
  deriveGenetique: { colonnes: ['generation', 'share of the variant in the population (0..1)', 'population number (label)'], memeLongueur: [], autres: [0, 1, 2] },
  enzyme: { colonnes: ['substrate S', 'product P (same units)', 'enzyme-substrate complex C'], memeLongueur: [[0, 1]], autres: [2] },
});

// ---------- catalogue ----------
export const SYSTEMES = Object.freeze([
  { id: 'adnMutations', nom: 'DNA that mutates (Jukes-Cantor model)', science: 'Molecular evolution', D: 5, nuage: true, params: { bases: 1000, taux: 0.25, duree: 4, graine: 1 },
    bornes: { bases: [200, 3000], taux: [0.05, 1], duree: [1, 10], graine: [1, 1000000] },
    phrase: 'A visualisation of a DNA sequence copied again and again with random mistakes (the Jukes-Cantor model): every base changes at rate mu to one of the three others, drawn as a double helix frame by frame. The fraction of sites that differ from the ancestor is compared with the exact 3/4 (1 - e^(-4 mu t / 3)); it saturates at 3/4 because sites get hit twice, which the distance -3/4 ln(1 - 4p/3) corrects. A finite sequence, so the agreement is statistical; the helix is drawn, not to scale.' },
  { id: 'dogmeCentral', nom: 'Gene to RNA to protein (the central dogma, one molecule at a time)', science: 'Molecular biology', D: 3, params: { transcription: 4, traduction: 5, degradation: 0.2, graine: 1 },
    bornes: { transcription: [0.5, 20], traduction: [0.5, 20], degradation: [0.05, 1], graine: [1, 1000000] },
    phrase: 'A visualisation of gene expression molecule by molecule (exact Gillespie simulation, time in mRNA lifetimes): a gene is copied into messenger RNA at rate k, each mRNA is translated into proteins at rate kp and both are broken down. The mean counts k and k kp / gp, the Poisson noise of the mRNA (Fano factor 1), the burst noise of the protein (Fano 1 + kp / (1 + gp)) and their covariance are compared with exact formulas, with uncertainties measured on the run itself.' },
  { id: 'deriveGenetique', nom: 'Genes drifting by chance (Wright-Fisher genetic drift)', science: 'Population genetics', D: 3, params: { individus: 50, partDepart: 0.5, generations: 100, populations: 100, graine: 1 },
    bornes: { individus: [10, 200], partDepart: [0.05, 0.95], generations: [10, 400], populations: [20, 200], graine: [1, 1000000] },
    phrase: 'A visualisation of genetic drift (the Wright-Fisher model): many small populations, each generation copying its genes at random from the one before, one frame per population. Variants wander up and down by pure chance until one is lost and the other fixed; on average nothing moves (the mean share stays p0, exact), the variety 2p(1 - p) fades exactly as H0 (1 - 1/2N)^t, and a variant ends up winning with probability p0. A finite number of populations, so the agreement is statistical.' },
  { id: 'enzyme', nom: 'An enzyme at work (Michaelis-Menten kinetics)', science: 'Biochemistry', D: 3, params: { substrat: 10, enzyme: 0.1, dissociation: 1, catalyse: 1 },
    bornes: { substrat: [1, 50], enzyme: [0.05, 1], dissociation: [0.1, 5], catalyse: [0.5, 5] },
    phrase: 'A visualisation of an enzyme turning substrate into product, E + S <-> C -> E + P, integrated step by step with all four species: total enzyme and total matter stay constant (witnesses). The rate of product formation is compared with the Michaelis-Menten law Vmax S / (Km + S), an approximation whose error scale E0 / (S0 + Km) is shown: add a lot of enzyme and the law visibly fails.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { adnMutations: ['bases', 'graine'], dogmeCentral: ['graine'], deriveGenetique: ['individus', 'generations', 'populations', 'graine'], enzyme: [] };
const FONCTIONS = { adnMutations, dogmeCentral, deriveGenetique, enzyme };
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
