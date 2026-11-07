// tam-biologie.js -- TAM, sciences de la vie (ADN, ARN, genes), chacune une simulation honnete comparee a une formule EXACTE.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-theories-3.js : SYSTEMES, ENTIERS, COLONNES, SOURCES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun generateur aleatoire natif (graines : mulberry32).
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux du moteur ; e^(-x) ici par demi-reductions + serie + carres
//   (+ - * / seulement) ; Math.sqrt/round/floor/abs/min/max seulement (IEEE exacts).
// REGLE DU PROJET : aucune valeur publiee sans source lue. game213 : SEULE la table du code genetique (SOURCES.codeStandard, NCBI) ; sinon AUCUNE : les taux sont sans dimension (temps en duree de vie d un ARN
//   messager pour le dogme central, en unites arbitraires pour les mutations), chaque formule comparee est derivee dans le commentaire
//   de sa section ; SOURCES est vide expres. L helice est DESSINEE (10 bases par tour, pas a l echelle) : aucune geometrie publiee n est
//   affirmee.
// Les systemes :
//   adnMutations : une sequence d ADN qui mute au hasard (modele de Jukes-Cantor), fraction de sites differents 3/4 (1 - e^(-4 mu t / 3)).
//   dogmeCentral : gene -> ARN messager -> proteine, une molecule a la fois (Gillespie) ; moyennes, bruits (Fano) et covariance exacts.
//   deriveGenetique : derive genetique (Wright-Fisher) ; moyenne conservee, heterozygotie H0 (1 - 1/2N)^t exacte, fixation p0.
//   enzyme       : cinetique de Michaelis-Menten (4 especes integrees) ; conservations temoins, loi de vitesse APPROCHEE.
//   mendel       : croisement de deux doubles heterozygotes ; 9:3:3:1, 1:2:1 exacts, liaison par le taux de recombinaison r.
//   neurone      : neurone integre-et-tire ; periode t_ref + tau ln(I/(I - 1)) exacte, muet sous le courant seuil 1.
import { sinD, cosD, lnD } from './tam-moteur.js';

const DEUX_PI = 2 * Math.PI;

// ---------- constantes d entree : aucune (unites sans dimension) ----------
/* game213 : PREMIERE valeur publiee du module (Phil : « ajoute biologie, chimie... le codex doit etre giga complet ») : la table du code
 *   genetique standard, lue par Grok Bot (codex 19) sur NCBI, transcrite case par case de son tableau (ordre des bases U, C, A, G ;
 *   premiere base = paquet de 16, deuxieme = paquet de 4, troisieme = dans le paquet). « * » = stop. Le banc exige valeur = texte lu. */
const S = (valeur, unite, url, lu) => Object.freeze({ valeur, unite, url, lu });
export const SOURCES = Object.freeze({
  // https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi#SG1 : « 1. The Standard Code », ligne AAs (T affiche U ici)
  /* game228 : Hodgkin et Huxley 1952 (J. Physiol. 117), table 3 p. 520, constantes CHOISIES pour le calcul, convention ORIGINALE
   *   (V = deplacement depuis le repos, depolarisation NEGATIVE), lues par Grok Bot (codex 19). Le module convertit lui-meme : E = -65 - V. */
  // https://www.its.caltech.edu/~jkenny/nb250c/papers/Hodgkin-1952e.pdf : table 3, C_M = 1 microF/cm2
  /* game229 : Kleiber 1932 (Hilgardia 6(11)), table 1 p. 317 : masse moyenne (kg) et chaleur basale (kcal par 24 h et par animal) de huit
   *   animaux, valeurs PUBLIEES (pas calculees par M^(3/4)), lues par Grok Bot (codex 19). Format nom:kg:kcal. */
  // https://pdodds.w3.uvm.edu/files/papers/others/1932/kleiber1932a.pdf : table 1, lignes 1, 4, 6, 7, 9, 10, 11, 13
  kleiber1932: S('Steer:679:8274 Man:64.1:1632 Sheep:45.6:1219.9 MaleDog:15.5:525 Hen:1.96:106 Pigeon:0.300:30.8 MaleRat:0.226:25.5 RingDove:0.150:19.5', 'kg et kcal/24 h', 'https://pdodds.w3.uvm.edu/files/papers/others/1932/kleiber1932a.pdf', 'Steer:679:8274 Man:64.1:1632 Sheep:45.6:1219.9 MaleDog:15.5:525 Hen:1.96:106 Pigeon:0.300:30.8 MaleRat:0.226:25.5 RingDove:0.150:19.5'),
  hhCm: S(1, 'microF/cm2', 'https://www.its.caltech.edu/~jkenny/nb250c/papers/Hodgkin-1952e.pdf', '1'),
  // meme table : gNa = 120, gK = 36, gL = 0.3 (mmho/cm2 = mS/cm2)
  hhGNa: S(120, 'mS/cm2', 'https://www.its.caltech.edu/~jkenny/nb250c/papers/Hodgkin-1952e.pdf', '120'),
  hhGK: S(36, 'mS/cm2', 'https://www.its.caltech.edu/~jkenny/nb250c/papers/Hodgkin-1952e.pdf', '36'),
  hhGL: S(0.3, 'mS/cm2', 'https://www.its.caltech.edu/~jkenny/nb250c/papers/Hodgkin-1952e.pdf', '0.3'),
  // meme table : V_Na = -115, V_K = +12, V_L = -10.613 mV (convention originale, depolarisation negative)
  hhVNa: S(-115, 'mV', 'https://www.its.caltech.edu/~jkenny/nb250c/papers/Hodgkin-1952e.pdf', '-115'),
  hhVK: S(12, 'mV', 'https://www.its.caltech.edu/~jkenny/nb250c/papers/Hodgkin-1952e.pdf', '12'),
  hhVL: S(-10.613, 'mV', 'https://www.its.caltech.edu/~jkenny/nb250c/papers/Hodgkin-1952e.pdf', '-10.613'),
  codeStandard: S('FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', 'acides amines (une lettre), * = stop', 'https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi#SG1', 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG'),
});

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
  const t0dessin = T - DOGME_FENETRE, mT = new Float64Array(n), pT = new Float64Array(n);
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
  const dessiner = (b) => { while (ligne < n && t0dessin + tl(ligne) < b) { mT[ligne] = m; pT[ligne] = p; ligne++; } };
  while (t < T) {
    const a1 = k, a2 = m, a3 = kp * m, a4 = gp * p, a0 = a1 + a2 + a3 + a4;
    const tn = Math.min(T, t + attente(rng, a0));
    accumuler(t, tn); dessiner(tn);
    t = tn; if (t >= T) break;
    const u = rng() * a0;
    if (u < a1) m++; else if (u < a1 + a2) m--; else if (u < a1 + a2 + a3) p++; else p--;
    evenements++;
  }
  while (ligne < n) { mT[ligne] = m; pT[ligne] = p; ligne++; }
  /* game116 (Phil : « pour biologie et chimie on comprend mal les exemples ») : trois grandeurs en 3-D faisaient un gribouillis ; DEUX courbes
   *   sur un meme graphique, chaque compte divise par sa moyenne EXACTE (k et k kp / gp) : les deux tremblent autour de 1, et on voit
   *   que la proteine, plus nombreuse, tremble relativement moins. Image 1 = ARN messager, image 2 = proteine (vue de face). */
  const images = Math.min(2, n), film = filmDe(decouper(n, images), n), brut = new Float64Array(n * 3), moy = [k, k * kp / gp];
  for (let f = 0; f < images; f++) { const d0 = film.debuts[f], c = film.tailles[f], src = f ? pT : mT;
    for (let r = 0; r < c; r++) { const l = c === 1 ? n - 1 : Math.round(r * (n - 1) / (c - 1)), o = 3 * (d0 + r); brut[o] = tl(l); brut[o + 1] = src[l] / moy[f]; brut[o + 2] = f; } }
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
  /* game116 : PAS un film (une image a la fois) : les courbes se comparent ENSEMBLE ; nuage de points, chaque courbe = ses lignes dans courbes */
  return { D: 3, brut, courbes: film, nuage: true, unite: 'sans objet (processus aleatoire, non chaotique)', invariants: {
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
  /* game116 : T fixe sur l enzyme de REFERENCE 0.1 (pas sur E0) : en parts contre le temps standardise, une duree proportionnelle a 1/E0
   *   rendait le curseur « enzyme » invisible (banc : 0.0009) ; ainsi peu d enzyme = reaction encore en cours a la fin, beaucoup = finie tot */
  const Km = (km1 + k2) / k1, Vmax = k2 * E0, T = (S0 + 5 * Km) / (k2 * 0.1), h0 = Math.min(0.5 / (k1 * (S0 + E0) + km1 + k2), T / 2000);
  const pas = Math.ceil(T / h0), h = T / pas;
  const f = (y, d) => { const [S, E, C] = y, a = k1 * E * S, b = km1 * C, c = k2 * C; d[0] = -a + b; d[1] = -a + b + c; d[2] = a - b - c; d[3] = c; };
  let y = [S0, E0, 0, 0];
  const k = [0, 1, 2, 3].map(() => new Float64Array(4)), tmp = new Float64Array(4), sT = new Float64Array(n), pT = new Float64Array(n), cT = new Float64Array(n), tT = new Float64Array(n);
  let pireE = 0, pireS = 0, ligne = 0, vMi = NaN, sMi = NaN;
  const ecrire = (st) => { while (ligne < n && Math.round(ligne * pas / (n - 1)) === st) { tT[ligne] = st * h; sT[ligne] = y[0]; pT[ligne] = y[3]; cT[ligne] = y[2]; ligne++; } };
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
  /* game116 (Phil : « pour biologie et chimie on comprend mal les exemples ») : un chemin en 3-D (S, P, C) se lisait mal ; TROIS courbes de PARTS
   *   sur un meme graphique : S / S0 (le substrat qui reste), P / S0 (le produit fait), C / E0 (la part de l enzyme occupee) — toutes
   *   entre 0 et 1, donc lisibles ensemble (C est E0 / S0 fois plus petit que S et P en quantite). Vue de face. */
  const images = Math.min(3, n), film = filmDe(decouper(n, images), n), brut = new Float64Array(n * 3);
  for (let f = 0; f < images; f++) { const d0 = film.debuts[f], c = film.tailles[f], src = [sT, pT, cT][f], ech = f === 2 ? E0 : S0;
    for (let r = 0; r < c; r++) { const l = c === 1 ? n - 1 : Math.round(r * (n - 1) / (c - 1)), o = 3 * (d0 + r); brut[o] = tT[l]; brut[o + 1] = src[l] / ech; brut[o + 2] = f; } }
  /* game116 : PAS un film (une image a la fois) : les courbes se comparent ENSEMBLE ; nuage de points, chaque courbe = ses lignes dans courbes */
  return { D: 3, brut, courbes: film, nuage: true, unite: 'sans objet (cinetique chimique, non chaotique)', invariants: {
    enzymeTotale: { debut: E0, fin: y[1] + y[2], derive: pireE, note: 'free enzyme + bound enzyme = E0 at every step (witness : all four species are integrated)' },
    matiereTotale: { debut: S0, fin: y[0] + y[2] + y[3], derive: pireS, note: 'substrate + complex + product = S0 at every step (witness)' },
    vitesseReaction: { mesure: vMi, formule: vF, eps, Km, Vmax, substratMi: sMi,
      approchee: 'Michaelis-Menten assumes the enzyme-substrate complex settles at once; its error scale here is E0 / (S0 + Km) = ' + eps.toPrecision(2),
      note: 'rate of product formation when half the substrate is used, against Vmax S / (Km + S)' },
    produitFinal: { partConvertie: y[3] / S0, tFin: T, note: 'share of the substrate turned into product by the end of the run ; measured only' } } };
}

// ---------- 5 : les lois de Mendel (croisement de deux doubles heterozygotes AB/ab x AB/ab) ----------
// Chaque parent donne un gamete : AB ou ab avec la probabilite (1 - r)/2 chacun, Ab ou aB avec r/2 (r = taux de recombinaison entre
//   les deux genes ; r = 1/2 : genes independants). Un descendant = deux gametes tires independamment. Exact (derive ici) :
//   genotype du gene A : AA : Aa : aa = 1/4 : 1/2 : 1/4 (chaque parent donne A une fois sur deux, quel que soit r) ;
//   P(aabb) = ((1 - r)/2)^2 = (1 - r)^2 / 4 ; P(A_bb) = P(aaB_) = P(bb) - P(aabb) = 1/4 - (1 - r)^2/4 ;
//   P(A_B_) = 1 - 2 P(A_bb) - P(aabb) = (2 + (1 - r)^2)/4. A r = 1/2 : 9 : 3 : 3 : 1 (sur 16).
//   Les N descendants sont independants : comptes multinomiaux, part de chaque phenotype binomiale (sigma exact), chi2 a 3 ddl.
//   r relu depuis la part aabb : r = 1 - 2 sqrt(p) (sigma par la methode delta, APPROCHEE).
// Dessin : chaque descendant est un point de la grille de ses genotypes (copies de A, copies de B), etale dans sa case (dessine).
function mendel(P, n) {
  const N = P.descendants, r = P.recombinaison, rng = mulberry32(P.graine);
  const gamete = () => { const u = rng(); return u < (1 - r) / 2 ? [1, 1] : u < 1 - r ? [0, 0] : u < 1 - r / 2 ? [1, 0] : [0, 1]; };
  const gA = new Uint8Array(N), gB = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const g1 = gamete(), g2 = gamete(); gA[i] = g1[0] + g2[0]; gB[i] = g1[1] + g2[1]; }
  let AB = 0, Abb = 0, aaB = 0, aabb = 0, Aa = 0;
  for (let i = 0; i < N; i++) { const a = gA[i] > 0, b = gB[i] > 0; if (a && b) AB++; else if (a) Abb++; else if (b) aaB++; else aabb++; if (gA[i] === 1) Aa++; }
  const q = (1 - r) * (1 - r) / 4, pAB = (2 + (1 - r) * (1 - r)) / 4, pAbb = 0.25 - q, att = [pAB, pAbb, pAbb, q], obs = [AB, Abb, aaB, aabb];
  let chi2 = 0, ddl = 0; for (let k = 0; k < 4; k++) if (att[k] > 0) { chi2 += (obs[k] - N * att[k]) * (obs[k] - N * att[k]) / (N * att[k]); ddl++; }
  ddl -= 1;
  const bin = (p) => Math.sqrt(p * (1 - p) / N), pa = aabb / N, rLu = 1 - 2 * Math.sqrt(pa), sR = q > 0 ? bin(q) / Math.sqrt(q) : NaN;
  const brut = new Float64Array(n * 3), place = mulberry32(P.graine ^ 0x27d4eb2d);
  for (let l = 0; l < n; l++) { const i = Math.floor(l * N / n), o = 3 * l; brut[o] = gA[i] + 0.7 * (place() - 0.5); brut[o + 1] = gB[i] + 0.7 * (place() - 0.5); brut[o + 2] = i + 1; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (genetique, aleatoire)', invariants: {
    dominants: { mesure: AB / N, formule: pAB, sigma: bin(pAB), descendants: N, note: 'share showing both dominant traits (A_B_) against (2 + (1 - r)^2)/4 : 9/16 for independent genes ; binomial sigma' },
    recessifs: { mesure: pa, formule: q, sigma: bin(q), note: 'share with both recessive traits (aabb) against (1 - r)^2 / 4 : 1/16 for independent genes' },
    heterozygotes: { mesure: Aa / N, formule: 0.5, sigma: bin(0.5), note: 'share of Aa among the offspring against 1/2 (the 1 : 2 : 1 law), whatever the linkage' },
    /* r = 0 : A_bb et aaB_ sont impossibles (probabilite 0) : 1 degre de liberte seulement, moyenne ddl, sigma sqrt(2 ddl) */
    phenotypes: { mesure: chi2, formule: ddl, sigma: Math.sqrt(2 * ddl), dominantsDeux: AB, dominantA: Abb, dominantB: aaB, recessifsDeux: aabb,
      note: 'chi-square of the four trait counts against the exact proportions (' + ddl + ' degrees of freedom : mean ' + ddl + ')' },
    recombinaisonLue: { mesure: aabb ? rLu : NaN, formule: r, sigma: sR, ...(aabb ? {} : { absente: 'no aabb offspring in this cross' }),
      approchee: 'read back from the aabb share, r = 1 - 2 sqrt(p), first-order sigma', note: 'recombination rate read back from the offspring against the one set' } } };
}

// ---------- 6 : un neurone qui s allume (integre-et-tire) ----------
// tau dv/dt = -v + I (potentiel sans dimension, repos 0, seuil 1). A v = 1 : une impulsion, v revient a 0 et reste muet t_ref.
//   Exact : si I <= 1, v -> I sans jamais atteindre le seuil (aucune impulsion) ; si I > 1, de 0 a 1 en tau ln(I / (I - 1)), donc
//   periode T = t_ref + tau ln(I / (I - 1)), frequence 1/T (la courbe frequence-courant du neurone).
// Simulation : RK4 au pas tau/400, passage du seuil interpole lineairement dans le pas (erreur O(h^2)).
// Dessin : un film de 7 courants I_k = I (0.4 + 0.2 k) (le courant choisi = l image 4) : la trace v(t) de chacun.
const LIF_COURANTS = 7;
function neurone(P, n) {
  const I0 = P.courant, tau = P.tau, tref = P.refractaire, h = tau / 400, Tsim = 8 * (tref + tau) + 4 * tau;
  const images = Math.min(LIF_COURANTS, n), Ik = Array.from({ length: images }, (_, k) => (images === 1 ? I0 : I0 * (0.4 + 1.2 * k / (images - 1))));
  const debuts = decouper(n, images), film = filmDe(debuts, n), brut = new Float64Array(n * 3);
  const res = Ik.map((I, f) => {
    const pas = Math.round(Tsim / h), d0 = film.debuts[f], c = film.tailles[f], tirs = [];
    let v = 0, muet = 0, ligne = 0;
    const g = (x) => (-x + I) / tau;
    const ecrire = (st) => { while (ligne < c && Math.round(ligne * pas / (c - 1 || 1)) === st) { const o = 3 * (d0 + ligne); brut[o] = st * h; brut[o + 1] = v; brut[o + 2] = I; ligne++; } };
    ecrire(0);
    /* sonde du 03/11 : la 1re version arrondissait la fin du refractaire au pas et perdait le temps apres une impulsion (periodes
     *   = multiples de h, 1.3 contre 1.2986) : chaque pas est maintenant un BUDGET de temps, refractaire et impulsion tombent ou ils tombent */
    let tc0 = 0;
    for (let st = 1; st <= pas; st++) {
      let reste = h, t = (st - 1) * h;
      while (reste > 0) {
        if (muet > 0) { const u = Math.min(muet, reste); muet -= u; reste -= u; t += u; continue; }
        const k1 = g(v), k2 = g(v + reste / 2 * k1), k3 = g(v + reste / 2 * k2), k4 = g(v + reste * k3), vn = v + reste / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
        if (vn >= 1) { const u = reste * (1 - v) / (vn - v); tc0 = t + u; tirs.push(tc0); v = 0; muet = tref; reste -= u; t = tc0; if (tref === 0 && reste < 1e-12 * h) reste = 0; }
        else { v = vn; reste = 0; }
      }
      ecrire(st);
    }
    while (ligne < c) { const o = 3 * (d0 + ligne); brut[o] = Tsim; brut[o + 1] = v; brut[o + 2] = I; ligne++; }
    const Tth = I > 1 ? tref + tau * lnD(I / (I - 1)) : NaN;
    const Tm = tirs.length >= 2 ? (tirs[tirs.length - 1] - tirs[0]) / (tirs.length - 1) : NaN;
    return { I, Tth, Tm, tirs: tirs.length, vFin: v };
  });
  const k0 = images === 1 ? 0 : Math.round(0.5 * (images - 1)), m = res[k0];
  let pire = 0, compares = 0; for (const x of res) if (Number.isFinite(x.Tm) && Number.isFinite(x.Tth)) { pire = Math.max(pire, Math.abs(x.Tm / x.Tth - 1)); compares++; }
  const muets = res.filter((x) => x.I <= 1);
  let pireRepos = 0, muetsQuiTirent = 0; for (const x of muets) { pireRepos = Math.max(pireRepos, Math.abs(x.vFin - x.I)); muetsQuiTirent += x.tirs; }
  return { D: 3, brut, film, unite: 'sans objet (neurone modele, non chaotique)', invariants: {
    periode: { mesure: m.Tm, formule: m.Tth, impulsions: m.tirs, courant: m.I,
      ...(m.I > 1 ? (Number.isFinite(m.Tm) ? {} : { absente: 'fewer than 2 spikes in the run' }) : { absente: 'the current is below the threshold current 1: the neuron never fires' }),
      note: 'time between spikes against t_ref + tau ln(I / (I - 1)) (exact for this model)' },
    courbeFI: { courants: images, compares, pireEcartRelatif: pire, courantSeuil: 1,
      note: 'the ' + images + ' frames sweep the current from 0.4 I to 1.6 I ; every firing one is compared with the exact period (worst relative gap shown) ; below I = 1 none fires' },
    ...(muets.length ? { repos: { courantsMuets: muets.length, impulsionsSousSeuil: muetsQuiTirent, pireEcart: pireRepos, note: 'below the threshold current the potential settles at v = I without firing (worst gap at the end of the run)' } } : {}) } };
}

// ---------- 7 : Hardy-Weinberg ----------
// Parents : une part p de AA et 1 - p de aa, AUCUN heterozygote (loin de l equilibre). Chaque enfant : deux parents tires au hasard
//   (avec remise), chacun donne un de ses deux alleles au hasard. Exact (derive ici) : chaque allele transmis est A avec la probabilite
//   p (la part de A dans les parents), independamment : AA : Aa : aa = p^2 : 2 p q : q^2 des la PREMIERE generation (q = 1 - p).
//   N enfants independants : parts binomiales, sigma exact ; chi2 a 2 ddl (3 classes, rien d estime).
// Dessin : chaque individu en (copies de A, generation) : parents en bas (0 ou 2 copies), enfants en haut (0, 1 ou 2) ; etalement dessine.
function hardyWeinberg(P, n) {
  const N = P.individus, p = P.partA, rng = mulberry32(P.graine), q = 1 - p, nAA = Math.round(p * N), pe = nAA / N, qe = 1 - pe;
  const parent = (i) => (i < nAA ? 2 : 0);
  const enfants = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const a = parent(Math.floor(rng() * N)), b = parent(Math.floor(rng() * N)); enfants[i] = (a === 2 ? 1 : 0) + (b === 2 ? 1 : 0); }
  const c = [0, 0, 0]; for (let i = 0; i < N; i++) c[enfants[i]]++;
  const att = [qe * qe, 2 * pe * qe, pe * pe];
  let chi2 = 0; for (let k = 0; k < 3; k++) chi2 += (c[k] - N * att[k]) * (c[k] - N * att[k]) / (N * att[k]);
  const bin = (x) => Math.sqrt(x * (1 - x) / N), brut = new Float64Array(n * 3), place = mulberry32(P.graine ^ 0x1b873593), moitie = Math.floor(n / 2);
  for (let l = 0; l < n; l++) { const gen = l < moitie ? 0 : 1, j = gen ? Math.floor((l - moitie) * N / (n - moitie)) : Math.floor(l * N / Math.max(1, moitie)), g = gen ? enfants[j] : parent(j), o = 3 * l;
    brut[o] = g + 0.6 * (place() - 0.5); brut[o + 1] = gen + 0.35 * (place() - 0.5); brut[o + 2] = gen ? j + 1 : -(j + 1); }
  return { D: 3, brut, nuage: true, unite: 'sans objet (genetique, aleatoire)', invariants: {
    heterozygotesHW: { mesure: c[1] / N, formule: 2 * pe * qe, sigma: bin(2 * pe * qe), parents: 0, note: 'share of Aa children against 2 p q, although the parents had NONE (Hardy-Weinberg, exact after one generation)' },
    homozygotesAA: { mesure: c[2] / N, formule: pe * pe, sigma: bin(pe * pe), note: 'share of AA children against p^2' },
    genotypes: { mesure: chi2, formule: 2, sigma: 2, genoAA: c[2], genoAa: c[1], genoaa: c[0], note: 'chi-square of the three genotype counts against p^2 : 2pq : q^2 (2 degrees of freedom : mean 2, sigma 2)' } } };
}

// ---------- colonnes de brut ----------
// ---------- game213 : le code genetique (idee et table : codex Grok Bot 19 ; NCBI « The Genetic Codes », table 1, lue par Grok) ----------
// 64 codons -> 20 acides amines + stop (SOURCES.codeStandard). MESURE ici : 61 codons de sens + 3 stops, 21 classes ; pour chaque codon de
//   sens et chacune de ses 9 mutations ponctuelles, la part qui garde le MEME acide amine (synonyme), par position du codon : la troisieme
//   position encaisse presque tout, la deuxieme rien (0 exactement).
// Temoin : un ARN messager tire (graine) lu avec un DECALAGE d une base : presque tous les acides amines changent, bien plus qu avec une
//   mutation ponctuelle.
// Dessin (vue de face) : chaque codon du messager tire (rang / L, part de ses 9 mutations qui sont synonymes) ; etiquette = acide amine (0..20).
function codeGenetique(P, n) {
  const T = SOURCES.codeStandard.valeur, L = P.longueur, rng = mulberry32(P.graine), idx = (a, b, c) => 16 * a + 4 * b + c;
  const classes = new Map(); for (const x of T) classes.set(x, (classes.get(x) || 0) + 1);
  const syn = [0, 0, 0], tot = [0, 0, 0], partSyn = new Array(64).fill(0);
  for (let i = 0; i < 64; i++) { if (T[i] === '*') continue; const bs = [i >> 4, (i >> 2) & 3, i & 3]; let s = 0;
    for (let p = 0; p < 3; p++) for (let v = 0; v < 4; v++) { if (v === bs[p]) continue; const m = bs.slice(); m[p] = v; tot[p]++; if (T[idx(m[0], m[1], m[2])] === T[i]) { syn[p]++; s++; } }
    partSyn[i] = s / 9; }
  const bases = Array.from({ length: 3 * L + 1 }, () => Math.floor(rng() * 4));
  let memes = 0; for (let k = 0; k + 1 < L; k++) if (T[idx(bases[3 * k], bases[3 * k + 1], bases[3 * k + 2])] === T[idx(bases[3 * k + 1], bases[3 * k + 2], bases[3 * k + 3])]) memes++;
  const lettres = [...classes.keys()].sort(), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const k = Math.floor(l * L / n), c = idx(bases[3 * k], bases[3 * k + 1], bases[3 * k + 2]), o = 3 * l; brut[o] = (k + 1) / L; brut[o + 1] = partSyn[c]; brut[o + 2] = lettres.indexOf(T[c]); }
  const parPos = syn.map((x, p) => x / tot[p]), global = (syn[0] + syn[1] + syn[2]) / (tot[0] + tot[1] + tot[2]);
  return { D: 3, brut, nuage: true, unite: 'codons', invariants: {
    codeGenetique: { mesure: (classes.size === 21 && classes.get('*') === 3 ? 0 : 1) + (parPos[2] > parPos[0] && parPos[0] > parPos[1] ? 0 : 1), formule: 0,
      degenerescence: lettres.map((x) => x + ':' + classes.get(x)).join(' '), synonymesParPosition: parPos.map((x) => x.toFixed(4)).join(' '), synonymesGlobal: global,
      note: 'table must give 21 classes with 3 stops, and synonymous point mutations must rank third position > first > second' },
    temoin: { mesure: memes / (L - 1), formule: global, note: 'witness: reading the same messenger shifted by one base keeps far fewer amino acids than a point mutation does' } } };
}

// ---------- game228 : le neurone de Hodgkin et Huxley (idee et valeurs : codex Grok Bot 19 ; constantes de 1952 : SOURCES) ----------
// Potentiel absolu moderne v (mV), repos a -65 mV ; E_i = -65 - V_i depuis la convention ORIGINALE (E_Na = +50, E_K = -77, E_L = -54.387).
//   C dv/dt = I - gNa m^3 h (v - E_Na) - gK n^4 (v - E_K) - gL (v - E_L) ; dx/dt = alpha_x (1 - x) - beta_x x pour x = m, n, h (taux a 6.3 C,
//   formes modernes du codex ; singularites amovibles alpha_m(-40) = 1, alpha_n(-55) = 0.1 traitees par leur limite). RK4, pas 0.02 ms, 50 ms (repos : 10 ms ; temoin : 25 ms) ; le banc recompte les pics au pas 0.005 ms.
// MESURE : (1) sans courant, la membrane reste a -65 mV a 0.5 mV pres et les portes a leurs valeurs d equilibre ; (2) chaque potentiel
//   d action depasse 0 mV puis redescend sous -60 mV ; (3) avec le courant du curseur, le nombre de pics est compte.
// Temoin : le piege de convention : recopier les potentiels de 1952 SANS changer le signe (E = -65 + V_i) donne un neurone qui ne tire jamais.
// Dessin (vue de face) : (t / 50 ms, (v + 80) / 130) ; etiquette = porte m (activation du sodium).
function hodgkinHuxley(P, n) {
  const ex = (x) => (x <= 0 ? expNegD(-x) : 1 / expNegD(x)), C = SOURCES.hhCm.valeur, gNa = SOURCES.hhGNa.valeur, gK = SOURCES.hhGK.valeur, gL = SOURCES.hhGL.valeur;
  const am = (v) => (Math.abs(v + 40) < 1e-9 ? 1 : 0.1 * (v + 40) / (1 - ex(-(v + 40) / 10))), bm = (v) => 4 * ex(-(v + 65) / 18);
  const an = (v) => (Math.abs(v + 55) < 1e-9 ? 0.1 : 0.01 * (v + 55) / (1 - ex(-(v + 55) / 10))), bn = (v) => 0.125 * ex(-(v + 65) / 80);
  const ah = (v) => 0.07 * ex(-(v + 65) / 20), bh = (v) => 1 / (1 + ex(-(v + 35) / 10));
  const simule = (I, signe, nbPas) => { const EN = -65 + signe * SOURCES.hhVNa.valeur, EK = -65 + signe * SOURCES.hhVK.valeur, EL = -65 + signe * SOURCES.hhVL.valeur;
    const f = ([v, m, nn, h]) => [(I - gNa * m * m * m * h * (v - EN) - gK * nn * nn * nn * nn * (v - EK) - gL * (v - EL)) / C, am(v) * (1 - m) - bm(v) * m, an(v) * (1 - nn) - bn(v) * nn, ah(v) * (1 - h) - bh(v) * h];
    let y = [-65, am(-65) / (am(-65) + bm(-65)), an(-65) / (an(-65) + bn(-65)), ah(-65) / (ah(-65) + bh(-65))]; const dt = 0.02, trace = [[0, y[0], y[1]]];
    let pics = 0, haut = false;
    for (let k = 1; k <= nbPas; k++) { const a = f(y), b = f(y.map((x, i) => x + dt * a[i] / 2)), c = f(y.map((x, i) => x + dt * b[i] / 2)), d = f(y.map((x, i) => x + dt * c[i])); y = y.map((x, i) => x + dt * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6);
      if (!haut && y[0] > 0) { haut = true; pics++; } else if (haut && y[0] < -60) haut = false; if (k % 2 === 0) trace.push([k * dt, y[0], y[1]]); }
    return { pics, trace, final: y }; };
  const repos = simule(0, -1, 500), actif = simule(P.courantHH, -1, 2500), piege = simule(P.courantHH, 1, 1250);
  let derive = 0; for (const [, v] of repos.trace) derive = Math.max(derive, Math.abs(v + 65));
  const ecarts = (derive < 0.5 ? 0 : 1);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [t, v, m] = actif.trace[Math.floor(l * actif.trace.length / n)], o = 3 * l; brut[o] = t / 50; brut[o + 1] = (v + 80) / 130; brut[o + 2] = m; }
  return { D: 3, brut, nuage: true, unite: 'mV', invariants: {
    hodgkinHuxley: { mesure: ecarts, formule: 0, ENa: -65 - SOURCES.hhVNa.valeur, EK: -65 - SOURCES.hhVK.valeur, EL: -65 - SOURCES.hhVL.valeur, deriveRepos: derive, pics: actif.pics,
      portesRepos: [am(-65) / (am(-65) + bm(-65)), an(-65) / (an(-65) + bn(-65)), ah(-65) / (ah(-65) + bh(-65))].map((x) => x.toFixed(9)).join(' '), note: 'membrane with no input current drifting more than 0.5 mV from -65 mV' },
    temoin: { mesure: piege.pics, formule: actif.pics, note: 'witness: copying the 1952 potentials without flipping their sign gives a neuron that never fires' } } };
}

// ---------- game229 : la loi de Kleiber (idee et donnees : codex Grok Bot 19 ; table de 1932 : SOURCES) ----------
// Metabolisme de base B (chaleur par jour) contre masse M de huit animaux, de la tourterelle (150 g) au boeuf (679 kg). Loi d echelle
//   B = c M^k. Exact ici : droite des moindres carres de log10 B contre log10 M -> exposant k MESURE (0.727 sur ces huit animaux, R2 0.99927),
//   ni 1 (proportionnel a la masse) ni 2/3 (a la surface) ; Kleiber ecrit W^(3/4) : 3/4 n est pas affirme ici comme loi universelle.
// MESURE : k a moins de 0.05 de 3/4 et R2 au-dessus de 0.99. Le curseur trace la droite d exposant choisi (ordonnee ajustee aux donnees).
// Temoin : la depense PAR KILO n est pas la meme : la tourterelle brule 130 kcal par kg et par jour, le boeuf 12.2, soit 10.7 fois moins.
// Dessin (vue de face) : (log10 M, log10 B) normalises ; etiquette = 0 animal mesure, 1 droite de l exposant du curseur.
function loiKleiber(P, n) {
  const d = SOURCES.kleiber1932.valeur.split(' ').map((x) => { const [nom, m, b] = x.split(':'); return [nom, Number(m), Number(b)]; }), lg = (x) => lnD(x) / lnD(10);
  const xs = d.map((r) => lg(r[1])), ys = d.map((r) => lg(r[2])), mx = xs.reduce((a, b) => a + b, 0) / d.length, my = ys.reduce((a, b) => a + b, 0) / d.length;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < d.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); syy += (ys[i] - my) * (ys[i] - my); }
  const k = sxy / sxx, r2 = sxy * sxy / (sxx * syy), ecarts = (Math.abs(k - 0.75) < 0.05 ? 0 : 1) + (r2 > 0.99 ? 0 : 1);
  const kT = P.exposantTest, origine = my - kT * mx, xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const pts = d.map((_, i) => [xs[i], ys[i], 0]); for (let j = 0; j <= 60; j++) { const x = xmin + (xmax - xmin) * j / 60; pts.push([x, origine + kT * x, 1]); }
  const parKg = d.map((r) => r[2] / r[1]), petit = d.reduce((a, b) => (b[1] < a[1] ? b : a)), gros = d.reduce((a, b) => (b[1] > a[1] ? b : a));
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [kx, ky, ke] = pts[l % pts.length], o = 3 * l; brut[o] = (kx - xmin) / (xmax - xmin); brut[o + 1] = (ky - ymin) / (ymax - ymin); brut[o + 2] = ke; }
  return { D: 3, brut, nuage: true, unite: 'kcal/24 h', invariants: {
    loiKleiber: { mesure: ecarts, formule: 0, exposant: k, r2, parKgExtremes: (petit[2] / petit[1]).toFixed(1) + ' / ' + (gros[2] / gros[1]).toFixed(2), note: 'fitted exponent more than 0.05 from 3/4, or R2 below 0.99 on the eight animals of the 1932 table' },
    temoin: { mesure: (petit[2] / petit[1]) / (gros[2] / gros[1]), formule: 1, note: 'witness: metabolism per kilogram is not the same for all animals: the ring dove burns about 10.7 times more per kg than the steer' } } };
}

export const COLONNES = Object.freeze({
  loiKleiber: { colonnes: ['log10 body mass (scaled)', 'log10 basal metabolism (scaled)', 'measured animal 0, line of the chosen exponent 1 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  hodgkinHuxley: { colonnes: ['time / 50 ms', '(membrane potential + 80 mV) / 130', 'sodium gate m (label)'], memeLongueur: [], autres: [0, 1, 2] },
  codeGenetique: { colonnes: ['codon rank / L', 'share of its 9 point mutations that keep the amino acid', 'amino acid (label, 20 = stop)'], memeLongueur: [], autres: [0, 1, 2] },
  adnMutations: { colonnes: ['x (drawn double helix, not to scale)', 'y (same)', 'position along the sequence (drawn)', 'base (0 = A, 1 = C, 2 = G, 3 = T)', 'time t'], memeLongueur: [[0, 1, 2]], autres: [3, 4] },
  dogmeCentral: { colonnes: ['time t (mRNA lifetimes, last 30)', 'count divided by its exact mean (1 = the mean)', 'which molecule (0 = mRNA, 1 = protein)'], memeLongueur: [], autres: [0, 1, 2] },
  deriveGenetique: { colonnes: ['generation', 'share of the variant in the population (0..1)', 'population number (label)'], memeLongueur: [], autres: [0, 1, 2] },
  enzyme: { colonnes: ['time t', 'share: substrate left S/S0, product made P/S0, enzyme busy C/E0', 'which curve (0 = substrate, 1 = product, 2 = busy enzyme)'], memeLongueur: [], autres: [0, 1, 2] },
  mendel: { colonnes: ['copies of the dominant allele A (0, 1, 2; spread inside its cell is drawn)', 'copies of the dominant allele B (same)', 'offspring number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  hardyWeinberg: { colonnes: ['copies of allele A (0, 1, 2; spread drawn)', 'generation (0 = parents, 1 = children; spread drawn)', 'individual number (label; parents negative)'], memeLongueur: [], autres: [0, 1, 2] },
  neurone: { colonnes: ['time t', 'membrane potential v (rest 0, threshold 1)', 'input current I of this frame (label)'], memeLongueur: [], autres: [0, 1, 2] },
});

// ---------- catalogue ----------
export const SYSTEMES = Object.freeze([
  { id: 'adnMutations', nom: 'DNA that mutates (Jukes-Cantor model)', science: 'Molecular evolution', D: 5, nuage: true, params: { bases: 1000, taux: 0.25, duree: 4, graine: 1 },
    bornes: { bases: [200, 3000], taux: [0.05, 1], duree: [1, 10], graine: [1, 1000000] },
    phrase: 'A visualisation of a DNA sequence copied again and again with random mistakes (the Jukes-Cantor model): every base changes at rate mu to one of the three others, drawn as a double helix frame by frame. The fraction of sites that differ from the ancestor is compared with the exact 3/4 (1 - e^(-4 mu t / 3)); it saturates at 3/4 because sites get hit twice, which the distance -3/4 ln(1 - 4p/3) corrects. A finite sequence, so the agreement is statistical; the helix is drawn, not to scale.' },
  { id: 'dogmeCentral', nom: 'Gene to RNA to protein (the central dogma, one molecule at a time)', science: 'Molecular biology', D: 3, params: { transcription: 10, traduction: 5, degradation: 0.2, graine: 1 }, /* game117 : k = 10 par defaut (bruit relatif de l ARN 1/sqrt 10 au lieu de 1/2 : le graphique n est plus ecrase en hauteur) */
    bornes: { transcription: [0.5, 20], traduction: [0.5, 20], degradation: [0.05, 1], graine: [1, 1000000] },
    phrase: 'A visualisation of gene expression molecule by molecule (exact Gillespie simulation, time in mRNA lifetimes): a gene is copied into messenger RNA at rate k, each mRNA is translated into proteins at rate kp and both are broken down. The mean counts k and k kp / gp, the Poisson noise of the mRNA (Fano factor 1), the burst noise of the protein (Fano 1 + kp / (1 + gp)) and their covariance are compared with exact formulas, with uncertainties measured on the run itself.' },
  { id: 'deriveGenetique', nom: 'Genes drifting by chance (Wright-Fisher genetic drift)', science: 'Population genetics', D: 3, params: { individus: 50, partDepart: 0.5, generations: 100, populations: 100, graine: 1 },
    bornes: { individus: [10, 200], partDepart: [0.05, 0.95], generations: [10, 400], populations: [20, 200], graine: [1, 1000000] },
    phrase: 'A visualisation of genetic drift (the Wright-Fisher model): many small populations, each generation copying its genes at random from the one before, one frame per population. Variants wander up and down by pure chance until one is lost and the other fixed; on average nothing moves (the mean share stays p0, exact), the variety 2p(1 - p) fades exactly as H0 (1 - 1/2N)^t, and a variant ends up winning with probability p0. A finite number of populations, so the agreement is statistical.' },
  { id: 'enzyme', nom: 'An enzyme at work (Michaelis-Menten kinetics)', science: 'Biochemistry', D: 3, params: { substrat: 10, enzyme: 0.1, dissociation: 1, catalyse: 1 },
    bornes: { substrat: [1, 50], enzyme: [0.05, 1], dissociation: [0.1, 5], catalyse: [0.5, 5] },
    phrase: 'A visualisation of an enzyme turning substrate into product, E + S <-> C -> E + P, integrated step by step with all four species: total enzyme and total matter stay constant (witnesses). The rate of product formation is compared with the Michaelis-Menten law Vmax S / (Km + S), an approximation whose error scale E0 / (S0 + Km) is shown: add a lot of enzyme and the law visibly fails.' },
  { id: 'mendel', nom: 'The laws of Mendel (a cross of two double hybrids)', science: 'Genetics', D: 3, nuage: true, params: { descendants: 1600, recombinaison: 0.5, graine: 1 },
    bornes: { descendants: [100, 5000], recombinaison: [0, 0.5], graine: [1, 1000000] },
    phrase: 'A visualisation of the laws of Mendel: two parents carrying both forms of two genes have offspring, each a random pair of gametes, drawn on the grid of their genotypes. With independent genes the traits come out 9 : 3 : 3 : 1 and each gene 1 : 2 : 1 (exact); bring the genes closer on the chromosome (recombination rate r below 1/2) and the double-recessive share becomes (1 - r)^2 / 4. A finite number of offspring, so the agreement is statistical.' },
  { id: 'neurone', nom: 'A neuron that fires (integrate-and-fire)', science: 'Neuroscience', D: 3, params: { courant: 1.5, tau: 1, refractaire: 0.2 },
    bornes: { courant: [0.5, 4], tau: [0.5, 3], refractaire: [0, 2] },
    phrase: 'A visualisation of the integrate-and-fire neuron, one frame per input current from 0.4 to 1.6 times the one chosen: the membrane potential charges up, fires at the threshold, resets and stays silent for a refractory time. Above the threshold current the time between spikes is compared with the exact t_ref + tau ln(I / (I - 1)); below it the neuron never fires and settles at v = I.' },
  { id: 'hardyWeinberg', nom: 'Hardy-Weinberg (one generation of random mating)', science: 'Population genetics', D: 3, nuage: true, params: { individus: 1000, partA: 0.3, graine: 1 },
    bornes: { individus: [100, 5000], partA: [0.05, 0.95], graine: [1, 1000000] },
    phrase: 'A visualisation of the Hardy-Weinberg law: parents that are all AA or aa (no mixed Aa at all) mate at random once. Their children come out AA : Aa : aa in the exact proportions p^2 : 2 p q : q^2 in a single generation, mixed carriers included. Parents drawn below, children above; a finite number of children, so the agreement is statistical.' },
  { id: 'codeGenetique', nom: 'The genetic code (codons to amino acids)', science: 'Molecular biology', D: 3, nuage: true, params: { longueur: 600, graine: 1 },
    bornes: { longueur: [100, 3000], graine: [1, 1000000] },
    phrase: 'A visualisation of the standard genetic code (NCBI table 1): 64 three-letter codons spell 20 amino acids and a stop. For every codon, each of its 9 single-letter mutations is checked: the third letter forgives most of them, the second none at all. Reading a messenger one letter off changes almost every amino acid: that is the witness.' },
  { id: 'hodgkinHuxley', nom: 'A nerve impulse (Hodgkin-Huxley model, 1952)', science: 'Neuroscience', D: 3, nuage: true, params: { courantHH: 10 },
    bornes: { courantHH: [0, 40] },
    phrase: 'A visualisation of the Hodgkin-Huxley model of the squid giant axon (1952), with the constants of their paper: sodium and potassium channels open and close, and a strong enough current makes the membrane fire spikes. With no current it rests at -65 mV. Copying the 1952 potentials without flipping their sign gives a neuron that never fires: that is the witness.' },
  { id: 'loiKleiber', nom: "Kleiber's law (metabolism and body size, 1932 data)", science: 'Physiology', D: 3, nuage: true, params: { exposantTest: 0.75 },
    bornes: { exposantTest: [0.5, 1] },
    phrase: "A visualisation of Kleiber's law with his own 1932 measurements of eight animals, from a dove to a steer: basal metabolism grows like body mass to a power near 3/4 (0.727 on these eight). Try other powers with the slider. A small animal burns far more energy per kilogram than a large one: the dove about 10.7 times the steer. That is the witness." },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { adnMutations: ['bases', 'graine'], dogmeCentral: ['graine'], deriveGenetique: ['individus', 'generations', 'populations', 'graine'], enzyme: [], mendel: ['descendants', 'graine'], neurone: [], hardyWeinberg: ['individus', 'graine'], codeGenetique: ['longueur', 'graine'], hodgkinHuxley: [], loiKleiber: [] };
const FONCTIONS = { loiKleiber, hodgkinHuxley, codeGenetique, adnMutations, dogmeCentral, deriveGenetique, enzyme, mendel, neurone, hardyWeinberg };
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
  if (r.courbes) o.courbes = r.courbes;
  return o;
}
