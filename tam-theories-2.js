// tam-theories-2.js -- TAM, six theories classiques absentes des autres vues, chacune une simulation honnete comparee a une formule EXACTE.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-vide-quantique.js : SYSTEMES, ENTIERS, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null : aucun systeme ici n est une trajectoire chaotique), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun generateur aleatoire natif (graines : mulberry32).
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux du moteur ; exp ici avec + - * / ;
//   Math.sqrt/round/floor/ceil/abs/min/max seulement (IEEE exacts).
// REGLE DU PROJET : aucune valeur publiee sans source lue. Ici AUCUNE : tout est sans dimension, chaque constante est CALCULEE
//   depuis sa definition (Tc d Onsager = 2/ln(1 + sqrt 2), Si(pi) par quadrature, integrale elliptique par moyenne arithmetico-
//   geometrique), chaque formule comparee est rappelee ou derivee dans le commentaire de sa section ; SOURCES est vide expres.
// Les six systemes :
//   ising2D                  : modele d Ising 2D (J = k = 1), Monte-Carlo de Metropolis, contre Onsager (aimantation, energie).
//   lotkaVolterra            : proies-predateurs, RK4, H conserve, moyennes exactes sur une periode, periode pres du point fixe.
//   epidemieSIR              : epidemie SIR, taille finale (equation implicite exacte) et pic de I (formule fermee).
//   lentilleGravitationnelle : lentille ponctuelle (unites du rayon d Einstein), tir inverse de rayons, images et amplification.
//   kuramoto                 : N oscillateurs de phase, frequences lorentziennes, parametre d ordre contre Ott-Antonsen.
//   gibbsFourier             : sommes partielles de Fourier d un creneau, depassement de Gibbs (2/pi) Si(pi), erreur L2 (Parseval).
// COLONNES DE brut (chaque colonne est standardisee seule par le moteur) : voir COLONNES plus bas, qui dit pour chaque systeme
//   quelles colonnes sont des longueurs de meme nature et lesquelles sont une autre grandeur (temps, valeur, etiquette).
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = Math.PI, DEUX_PI = 2 * Math.PI, LN2 = lnD(2);

// ---------- constantes d entree : aucune (unites sans dimension) ----------
export const SOURCES = Object.freeze({});

// ---------- arithmetique deterministe ----------
function expD(x) { /* e^x avec + - * / seulement (meme fonction que tam-vide-quantique.js) */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
const sinhD = (x) => (expD(x) - expD(-x)) / 2;
const coshD = (x) => (expD(x) + expD(-x)) / 2;
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* suivi d invariants point par point : { debut, fin, derive, min, max } (meme definition que tam-vide-quantique.js) */
function suiveur() {
  const inv = {};
  return {
    noter(v) {
      for (const k of Object.keys(v)) {
        const x = v[k], I = inv[k] || (inv[k] = { debut: x, fin: x, ecart: 0, min: x, max: x });
        I.fin = x; if (x < I.min) I.min = x; if (x > I.max) I.max = x;
        const d = Math.abs(x - I.debut); if (d > I.ecart || !(d === d)) I.ecart = d;
      }
    },
    fini() {
      const o = {};
      for (const k of Object.keys(inv)) { const I = inv[k]; o[k] = { debut: I.debut, fin: I.fin, derive: Math.abs(I.debut) > 1e-9 ? I.ecart / Math.abs(I.debut) : I.ecart, min: I.min, max: I.max }; }
      return o;
    },
  };
}
function decouper(n, images) { const d = []; for (let k = 0; k < images; k++) d.push(Math.floor(k * n / images)); return d; }
function filmDe(debuts, n) {
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}
/* ligne du pas i (0..n-1) quand on enregistre n lignes sur S pas */
const pasDeLigne = (i, n, S) => (n === 1 ? 0 : Math.round(i * S / (n - 1)));
/* moyenne et ecart type de la moyenne par blocs (echantillons correles en temps) */
function blocs(v, nb) {
  const m = Math.floor(v.length / nb), moy = []; let tot = 0;
  for (let b = 0; b < nb; b++) { let s = 0; for (let i = b * m; i < (b + 1) * m; i++) s += v[i]; moy.push(s / m); tot += s / m; }
  const mu = tot / nb; let q = 0; for (const x of moy) q += (x - mu) * (x - mu);
  return { moyenne: mu, sigma: Math.sqrt(q / (nb - 1) / nb), blocs: nb, parBloc: m };
}

// ---------- 1 : modele d Ising 2D, reseau L x L periodique, J = k = 1 ----------
// H = - sum_<ij> s_i s_j. Onsager (exact, reseau infini) : point critique sinh(2/Tc) = 1, donc Tc = 2/asinh(1) = 2/ln(1 + sqrt 2) ;
//   aimantation spontanee M(T) = (1 - sinh(2/T)^-4)^(1/8) pour T < Tc, 0 au-dessus (formule de Yang) ;
//   energie par spin u(T) = -coth(2/T) [1 + (2/pi)(2 tanh^2(2/T) - 1) K(k)], k = 2 sinh(2/T)/cosh^2(2/T), K = integrale elliptique
//   complete de premiere espece, calculee ici par K(k) = pi / (2 AGM(1, sqrt(1 - k^2))) (au point critique le terme K s annule).
// Simulation : Metropolis en damier, poids e^{-4/T}, e^{-8/T} pretabules. DEUX tirages : (a) le DESSIN part d un desordre total
//   (trempe) et montre les domaines apres `balayages` balayages ; (b) la MESURE part de l ordre (+1 partout), 150 balayages de mise
//   a l equilibre puis 300 mesures, erreur par 10 blocs. Reseau fini : u n est compare que loin de Tc (|T - Tc| > 0.1 Tc), M seulement
//   pour T < 0.9 Tc, ou la longueur de correlation est petite devant L ; au-dessus de Tc un reseau fini garde <|m|> ~ 1/L, pas 0
//   (le banc verifie L <|m|> a peu pres constant).
const TC_ISING = 2 / lnD(1 + Math.SQRT2);
function aimantationOnsager(T) {
  if (!(T < TC_ISING)) return 0;
  const s = sinhD(2 / T), s2 = s * s, x = 1 - 1 / (s2 * s2);
  return x > 0 ? Math.sqrt(Math.sqrt(Math.sqrt(x))) : 0;
}
function agm(a, b) { for (let i = 0; i < 60 && Math.abs(a - b) > 1e-15 * a; i++) { const m = (a + b) / 2; b = Math.sqrt(a * b); a = m; } return (a + b) / 2; }
const ellipK = (k) => PI / (2 * agm(1, Math.sqrt(1 - k * k)));
function energieOnsager(T) {
  const K = 1 / T, c = coshD(2 * K), s = sinhD(2 * K), th = s / c, k = 2 * s / (c * c), q = 1 - k * k;
  const terme = q > 0 ? (2 / PI) * (2 * th * th - 1) * ellipK(k) : 0;
  return -(c / s) * (1 + terme);
}
const MESURE_ISING = { equilibre: 150, mesures: 300, blocs: 10 };
function ising2D(P, n) {
  const L = P.L, N = L * L, T = P.T, w4 = expD(-4 / T), w8 = expD(-8 / T);
  const balayer = (s, alea) => {
    for (let par = 0; par < 2; par++) for (let y = 0; y < L; y++) {
      const yl = y * L, yh = (y === 0 ? L - 1 : y - 1) * L, yb = (y === L - 1 ? 0 : y + 1) * L;
      for (let x = (y + par) & 1; x < L; x += 2) {
        const i = yl + x, h = s[yl + (x === 0 ? L - 1 : x - 1)] + s[yl + (x === L - 1 ? 0 : x + 1)] + s[yh + x] + s[yb + x], dE = 2 * s[i] * h;
        if (dE <= 0 || alea() < (dE === 4 ? w4 : w8)) s[i] = -s[i];
      }
    }
  };
  /* (a) dessin : trempe depuis le desordre */
  const alea = mulberry32(P.graine >>> 0), s = new Int8Array(N);
  for (let i = 0; i < N; i++) s[i] = alea() < 0.5 ? 1 : -1;
  for (let b = 0; b < P.balayages; b++) balayer(s, alea);
  /* aimantation locale : moyenne sur le carre 5 x 5 centre (periodique) */
  const R = 2, brut = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const k = Math.min(N - 1, Math.floor((i + 0.5) * N / n)), x = k % L, y = (k - x) / L; let m = 0;
    for (let dy = -R; dy <= R; dy++) { const yy = ((y + dy) % L + L) % L; for (let dx = -R; dx <= R; dx++) m += s[yy * L + ((x + dx) % L + L) % L]; }
    const o = 4 * i; brut[o] = x; brut[o + 1] = y; brut[o + 2] = m / ((2 * R + 1) * (2 * R + 1)); brut[o + 3] = s[k];
  }
  let mDessin = 0; for (let i = 0; i < N; i++) mDessin += s[i];
  /* (b) mesure : depart ordonne, flux aleatoire distinct */
  const alea2 = mulberry32((P.graine ^ 0x9E3779B9) >>> 0), t = new Int8Array(N).fill(1), am = [], en = [];
  for (let b = 0; b < MESURE_ISING.equilibre; b++) balayer(t, alea2);
  for (let b = 0; b < MESURE_ISING.mesures; b++) {
    balayer(t, alea2); let m = 0, e = 0;
    for (let y = 0; y < L; y++) { const yl = y * L, yb = (y === L - 1 ? 0 : y + 1) * L; for (let x = 0; x < L; x++) { const v = t[yl + x]; m += v; e -= v * (t[yl + (x === L - 1 ? 0 : x + 1)] + t[yb + x]); } }
    am.push(Math.abs(m) / N); en.push(e / N);
  }
  const A = blocs(am, MESURE_ISING.blocs), E = blocs(en, MESURE_ISING.blocs), comparable = Math.abs(T - TC_ISING) > 0.1 * TC_ISING, sousTc = T < 0.9 * TC_ISING;
  return { D: 4, brut, nuage: true, unite: 'sans objet (configuration de spins apres Monte-Carlo, pas une trajectoire)', invariants: {
    critique: { Tc: TC_ISING, sinh2surTc: sinhD(2 / TC_ISING), note: 'Onsager critical temperature from sinh(2/Tc) = 1, i.e. Tc = 2/ln(1 + sqrt 2), computed (J = k = 1)' },
    aimantation: { mesure: A.moyenne, sigma: A.sigma, formule: aimantationOnsager(T), comparable: sousTc, T, L, LfoisM: L * A.moyenne,
      note: 'mean |magnetisation| per spin from an ordered start (150 equilibration + 300 measured sweeps, error from 10 blocks) against Onsager-Yang M(T) = (1 - sinh(2/T)^-4)^(1/8) ; compared only for T < 0.9 Tc. Above Tc the exact value is 0 but a finite lattice keeps |m| of order 1/L (L |m| roughly constant), so no equality is claimed there' },
    energie: { mesure: E.moyenne, sigma: E.sigma, formule: energieOnsager(T), comparable,
      note: 'energy per spin against Onsager u(T) = -coth(2/T)[1 + (2/pi)(2 tanh^2(2/T) - 1) K(k)], K from the arithmetic-geometric mean' },
    dessin: { balayages: P.balayages, aimantationFinale: mDessin / N, note: 'the drawing is a quench from total disorder : domains coarsen and may stay stuck in stripes at low T, which is why the measurement uses a separate ordered start' } } };
}

// ---------- 2 : Lotka-Volterra, dx/dt = a x - b x y, dy/dt = d x y - c y ----------
// Ici a = b = d = 1 (ils ne fixent que les unites du temps, des proies et des predateurs) ; c = taux de mort des predateurs / a.
// Point fixe (x*, y*) = (c/d, a/b). Integrale premiere : H = d x - c ln x + b y - a ln y (dH/dt = 0 exactement).
// Moyennes EXACTES sur une periode (toute amplitude) : d(ln y)/dt = d x - c, integree sur une periode -> <x> = c/d ; de meme <y> = a/b.
// Periode : pres du point fixe la linearisation donne omega = sqrt(a c), T0 = 2 pi / sqrt(a c) ; elle s allonge avec l amplitude
//   (pas de formule fermee, comparee seulement aux petites amplitudes). Depart (x*(1 + amplitude), y*), sur la droite y = y*.
// game107 (Phil : « d autres variables ») : SATURATION des proies s = 1/K (place limitee), dx/dt = a x (1 - s x) - b x y.
//   Point fixe (c/d, (a/b)(1 - s c/d)) ; s <= 0.2 et c <= 4 gardent y* > 0 (les predateurs survivent). Avec a = b = d = 1,
//   H = x - c ln x + y - y* ln y n est plus conservee :
//   dH/dt = (x - c)(1 - s x - y) + (y - y*)(x - c) = (x - c)(1 - y* - s x) = -s (x - c)^2 EXACTEMENT (1 - y* = s c).
//   Bilan exact : H(0) - H(T) = s * integrale (x - c)^2 dt (mesure contre trapezes). Moyennes sur des cycles ENTIERS (entre deux
//   passages montants en y = y*) : <x> = c exactement (d ln y/dt = x - c), <y> = y* - (ln x(fin) - ln x(debut))/T exactement
//   (d ln x/dt = 1 - s x - y). Lineaire : trace -s c, determinant c (1 - s c) : spirale amortie au taux s c / 2, pulsation
//   sqrt(c (1 - s c) - (s c)^2 / 4) — approchees (vraies pres du point fixe). s = 0 : tout est exactement le modele d avant.
function lotkaVolterra(P, n) {
  const a = 1, b = 1, d = 1, c = P.c, s = P.saturation, xs = c / d, ys = (a / b) * (1 - s * xs), T0 = DEUX_PI / Math.sqrt(a * c), h = T0 / 2000;
  const H = (x, y) => d * x - c * lnD(x) + b * y - a * (s ? ys : 1) * lnD(y);
  const pas = (u) => {
    const f = s ? (x, y) => [a * x * (1 - s * x) - b * x * y, d * x * y - c * y] : (x, y) => [a * x - b * x * y, d * x * y - c * y];
    const [k1x, k1y] = f(u[0], u[1]), [k2x, k2y] = f(u[0] + h / 2 * k1x, u[1] + h / 2 * k1y);
    const [k3x, k3y] = f(u[0] + h / 2 * k2x, u[1] + h / 2 * k2y), [k4x, k4y] = f(u[0] + h * k3x, u[1] + h * k3y);
    u[0] += h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); u[1] += h / 6 * (k1y + 2 * k2y + 2 * k3y + k4y);
  };
  const depart = () => [xs * (1 + P.amplitude), ys];
  /* passe 1 : periode reelle (premier retour sur y = y* en montant) */
  let u = depart(), st = 0, Tr = NaN;
  while (st < 200000) { const y0 = u[1]; pas(u); st++; if (y0 < ys && u[1] >= ys) { Tr = (st - 1 + (ys - y0) / (u[1] - y0)) * h; break; } }
  /* game107 : amortie, la spirale revient toujours (pulsation reelle sur tout le domaine : s c <= 0.8) ; garde-fou si jamais non */
  const S = Math.ceil(P.periodes * (Number.isFinite(Tr) ? Tr : T0) / h);
  /* passe 2 : trajectoire dessinee, evenements, integrales de x et y (trapezes) */
  u = depart();
  const brut = new Float64Array(n * 3), suivi = suiveur(), H0 = H(u[0], u[1]), evts = [0], Ix = [0], Iy = [0], Xe = [u[0]];
  let ix = 0, iy = 0, idiss = 0, ligne = 0;
  const ecrire = (s) => { while (ligne < n && pasDeLigne(ligne, n, S) === s) { const o = 3 * ligne; brut[o] = u[0]; brut[o + 1] = u[1]; brut[o + 2] = s * h; ligne++; } };
  ecrire(0);
  for (let st = 1; st <= S; st++) {
    const x0 = u[0], y0 = u[1]; pas(u);
    if (y0 < ys && u[1] >= ys) { const f = (ys - y0) / (u[1] - y0); evts.push((st - 1 + f) * h); Ix.push(ix + h * f * (x0 + (x0 + f * (u[0] - x0))) / 2); Iy.push(iy + h * f * (y0 + ys) / 2); Xe.push(x0 + f * (u[0] - x0)); }
    ix += h * (x0 + u[0]) / 2; iy += h * (y0 + u[1]) / 2;
    if (s) idiss += h * ((x0 - xs) * (x0 - xs) + (u[0] - xs) * (u[0] - xs)) / 2;
    if (st % 20 === 0 || st === S) suivi.noter({ H: H(u[0], u[1]) });
    ecrire(st);
  }
  const k = evts.length - 1, Tm = k > 0 ? evts[k] / k : NaN, inv = suivi.fini();
  if (!s) {
    inv.H.note = 'H = d x - c ln x + b y - a ln y, conserved exactly by the equations ; drift = integration error';
    inv.periode = { mesure: Tm, formulePetiteAmplitude: T0, ecart: Math.abs(Tm - T0) / T0, cycles: k, amplitude: P.amplitude,
      note: 'period from returns to y = y* ; 2 pi / sqrt(a c) is exact only near the fixed point, the period grows with the amplitude' };
    inv.moyennes = { x: k > 0 ? Ix[k] / evts[k] : NaN, xFormule: xs, y: k > 0 ? Iy[k] / evts[k] : NaN, yFormule: ys,
      note: 'time averages over whole cycles equal the fixed point (c/d, a/b) exactly, at any amplitude' };
  } else {
    const tr = s * c, det = c * (1 - s * c), w2 = det - tr * tr / 4, Td = w2 > 0 ? DEUX_PI / Math.sqrt(w2) : NaN;
    /* son nom a l ecran etait « Conserved H » : elle ne l est plus, elle change de cle. Vu a l ecran : la ligne generique d une
     *   derive ecrit « from min to max » = « from 1.98 to 2.27 », une HAUSSE a la lecture — on donne debut puis fin, dans l ordre */
    delete inv.H;
    inv.Hdecroit = { debut: H0, fin: H(u[0], u[1]), note: 'H = x - c ln x + y - y* ln y : no longer conserved, it can only go down (dH/dt = -s (x - c)^2)' };
    inv.dissipation = { mesure: H0 - H(u[0], u[1]), formule: s * idiss,
      note: 'how much H has gone down, against s times the integral of (x - c)^2 over the run (exact balance, trapezoid integral)' };
    inv.moyennes = { x: k > 0 ? Ix[k] / evts[k] : NaN, xFormule: xs, y: k > 0 ? Iy[k] / evts[k] : NaN, yFormule: k > 0 ? ys - (lnD(Xe[k]) - lnD(Xe[0])) / evts[k] : NaN,
      note: 'over whole cycles (returns to y = y*) the prey average is exactly c and the predator average exactly y* - (ln x_end - ln x_start)/T, even while the spiral shrinks' };
    /* l amortissement : distances au point fixe a deux retours successifs, contre le taux lineaire s c / 2 (approche).
     *   Sonde (s 0.2, c 4, amplitude 3 : / 25 par cycle) : apres 10 cycles la distance touche l arrondi (1e-12) et le taux lu devenait
     *   du bruit (0.337 pour 0.4) — on prend les deux DERNIERS retours encore a plus de 1e-6 x* du point fixe */
    let j = k; while (j >= 2 && !(Math.abs(Xe[j] - xs) > 1e-6 * xs)) j--;
    const taux = j >= 2 ? lnD(Math.abs(Xe[j - 1] - xs) / Math.abs(Xe[j] - xs)) / (evts[j] - evts[j - 1]) : NaN;
    inv.amortissement = { mesure: taux, formule: tr / 2, approchee: 'linearised near the rest point; measured on the last two returns still clear of rounding', retours: [j - 1, j], unite: 'par unite de temps' };
    inv.periode = { mesure: j >= 2 ? evts[j] - evts[j - 1] : NaN, formule: Td, approchee: 'linearised damped period, exact only close to the rest point', cycles: k };
  }
  inv.constantes = s ? { a, b, d, c, s, H0, pointFixe: [xs, ys] } : { a, b, d, c, H0 };
  return { D: 3, brut, invariants: inv, unite: s ? 'sans objet (spirale amortie vers le point fixe, non chaotique)' : 'sans objet (cycle conservatif, non chaotique)' };
}

// ---------- 3 : epidemie SIR, fractions s + i + r = 1, temps en unites de 1/gamma ----------
// ds/dt = -R0 s i, di/dt = R0 s i - i, dr/dt = i.
// Pic : di/ds = -1 + 1/(R0 s) -> i + s - ln(s)/R0 constant ; le maximum de i est en s = 1/R0 (si R0 s0 > 1), d ou
//   I_max = i0 + s0 - (1 + ln(R0 s0))/R0 ; sinon I_max = i0 (pas d epidemie).
// Taille finale : ds/dr = -R0 s -> s = s0 e^{-R0 (r - r0)} ; a la fin i = 0, s = 1 - r : r_inf = 1 - s0 e^{-R0 (r_inf - r0)},
//   racine unique dans ]r0 + i0, 1[ (fonction convexe, negative a gauche, positive a droite), resolue par bisection.
const piqueSIR = (R0, s0, i0) => (R0 * s0 > 1 ? i0 + s0 - (1 + lnD(R0 * s0)) / R0 : i0);
function tailleFinaleSIR(R0, s0, r0, i0) {
  let lo = r0 + i0, hi = 1;
  const f = (r) => r - 1 + s0 * expD(-R0 * (r - r0));
  for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// game109 (Phil : « d autres variables ») : l immunite S ESTOMPE, taux xi (par periode infectieuse) : dr/dt = i - xi r, ds/dt = -R0 s i + xi r
//   (SIRS). L epidemie ne finit plus : elle s installe. Equilibre endemique EXACT (R0 > 1) : s* = 1/R0, et s + i + r = 1 avec r* = i*/xi
//   donne i* = (1 - 1/R0) xi / (1 + xi). Lineaire autour (s, i ; r = 1 - s - i) : trace -(R0 i* + xi), determinant R0 i* (1 + xi) :
//   approche amortie au taux (R0 i* + xi)/2 (approche, vraie pres de l equilibre). Le pic de la 1re vague garde la formule SIR, approchee
//   (elle ignore les gueris qui redeviennent sensibles pendant la vague). xi = 0 : exactement le modele d avant (meme pas, memes octets).
function epidemieSIR(P, n) {
  if (P.perteImmunite > 0) return epidemieSIRS(P, n);
  const R0 = P.R0, i0 = P.i0, r0 = P.r0, s0 = 1 - i0 - r0, h = 0.02, CAP = 100000;
  const S = new Float64Array(CAP + 1), I = new Float64Array(CAP + 1), Rr = new Float64Array(CAP + 1);
  S[0] = s0; I[0] = i0; Rr[0] = r0;
  const f = (s, i) => [-R0 * s * i, R0 * s * i - i];
  const suivi = suiveur(), cle = (s, i) => i + s - lnD(s) / R0;
  let st = 0, kPic = 0;
  suivi.noter({ somme: s0 + i0 + r0, premiereIntegrale: cle(s0, i0) });
  while (st < CAP) {
    const s = S[st], i = I[st];
    const [a1, b1] = f(s, i), [a2, b2] = f(s + h / 2 * a1, i + h / 2 * b1), [a3, b3] = f(s + h / 2 * a2, i + h / 2 * b2), [a4, b4] = f(s + h * a3, i + h * b3);
    const ds = h / 6 * (a1 + 2 * a2 + 2 * a3 + a4), di = h / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
    S[st + 1] = s + ds; I[st + 1] = i + di; Rr[st + 1] = Rr[st] - ds - di; st++;
    if (I[st] > I[kPic]) kPic = st;
    if (st % 25 === 0) suivi.noter({ somme: S[st] + I[st] + Rr[st], premiereIntegrale: cle(S[st], I[st]) });
    if (st > kPic + 10 && I[st] < 1e-10) break;
  }
  /* pic : sommet de la parabole par trois pas */
  let picMes = I[kPic];
  if (kPic > 0 && kPic < st) { const y0 = I[kPic - 1], y1 = I[kPic], y2 = I[kPic + 1], q = y0 - 2 * y1 + y2; if (q < 0) picMes = y1 - (y2 - y0) * (y2 - y0) / (8 * q); }
  /* dessin : jusqu a ce que i retombe sous 1e-3 de son maximum */
  let fin = st; for (let k = kPic; k <= st; k++) if (I[k] < 1e-3 * I[kPic]) { fin = k; break; }
  fin = Math.max(fin, 2);
  const brut = new Float64Array(n * 4);
  for (let l = 0; l < n; l++) { const k = pasDeLigne(l, n, fin), o = 4 * l; brut[o] = S[k]; brut[o + 1] = I[k]; brut[o + 2] = Rr[k]; brut[o + 3] = k * h; }
  const inv = suivi.fini(), rInf = tailleFinaleSIR(R0, s0, r0, i0), pic = piqueSIR(R0, s0, i0);
  inv.somme.note = 's + i + r = 1 (exact)'; inv.premiereIntegrale.note = 'i + s - ln(s)/R0, constant along the exact solution';
  inv.tailleFinale = { mesure: 1 - S[st], formule: rInf, ecart: Math.abs(1 - S[st] - rInf), tFin: st * h, iFin: I[st], fini: I[st] < 1e-10,
    note: 'final size against the exact implicit equation r_inf = 1 - s0 exp(-R0 (r_inf - r0)), solved by bisection' };
  inv.pic = { mesure: picMes, formule: pic, ecart: Math.abs(picMes - pic), tPic: kPic * h, sPic: S[kPic], sPicFormule: R0 * s0 > 1 ? 1 / R0 : s0,
    note: 'peak of I against I_max = i0 + s0 - (1 + ln(R0 s0))/R0, reached when s = 1/R0 (no outbreak when R0 s0 <= 1)' };
  inv.depart = { s0, i0, r0, R0, R0s0: R0 * s0 };
  return { D: 4, brut, invariants: inv, unite: 'sans objet (equations deterministes, non chaotiques)' };
}
/* SIRS : pas 0.1 (echelle de temps 1 = periode infectieuse ; RK4), jusqu a l equilibre (distance < 1e-9) ou t = 10 000 */
function epidemieSIRS(P, n) {
  const R0 = P.R0, xi = P.perteImmunite, i0 = P.i0, r0 = P.r0, s0 = 1 - i0 - r0, h = 0.1, CAP = 100000;
  const sE = 1 / R0, iE = (1 - 1 / R0) * xi / (1 + xi), rE = iE / xi;
  const S = new Float64Array(CAP + 1), I = new Float64Array(CAP + 1), Rr = new Float64Array(CAP + 1);
  S[0] = s0; I[0] = i0; Rr[0] = r0;
  /* r est porte explicitement (r' = i - xi r) et s + i + r = 1 sert de TEMOIN (pas d elimination) */
  const f = (s, i, r) => [-R0 * s * i + xi * r, R0 * s * i - i, i - xi * r];
  /* pas d hypot (non garanti identique d un moteur a l autre ; garde du banc) : sqrt d une somme, exact IEEE */
  const suivi = suiveur(), dist = (k) => { const a = S[k] - sE, b = I[k] - iE, c = Rr[k] - rE; return Math.sqrt(a * a + b * b + c * c); };
  let st = 0, kPic = 0, premiereVague = true;
  suivi.noter({ somme: s0 + i0 + r0 });
  while (st < CAP) {
    const s = S[st], i = I[st], r = Rr[st];
    const [a1, b1, c1] = f(s, i, r), [a2, b2, c2] = f(s + h / 2 * a1, i + h / 2 * b1, r + h / 2 * c1);
    const [a3, b3, c3] = f(s + h / 2 * a2, i + h / 2 * b2, r + h / 2 * c2), [a4, b4, c4] = f(s + h * a3, i + h * b3, r + h * c3);
    S[st + 1] = s + h / 6 * (a1 + 2 * a2 + 2 * a3 + a4); I[st + 1] = i + h / 6 * (b1 + 2 * b2 + 2 * b3 + b4); Rr[st + 1] = r + h / 6 * (c1 + 2 * c2 + 2 * c3 + c4); st++;
    /* le pic de la PREMIERE vague : le premier maximum local de i */
    if (premiereVague) { if (I[st] > I[kPic]) kPic = st; else if (I[st] < I[kPic]) premiereVague = false; }
    if (st % 25 === 0) suivi.noter({ somme: S[st] + I[st] + Rr[st] });
    if (dist(st) < 1e-9) break;
  }
  let picMes = I[kPic];
  if (kPic > 0 && kPic < st) { const y0 = I[kPic - 1], y1 = I[kPic], y2 = I[kPic + 1], q = y0 - 2 * y1 + y2; if (q < 0) picMes = y1 - (y2 - y0) * (y2 - y0) / (8 * q); }
  /* dessin : jusqu a ce que la distance a l equilibre tombe sous 1e-3 de la distance de depart (ou toute la course) */
  let fin = st; const d0 = dist(0); for (let k = 0; k <= st; k++) if (dist(k) < 1e-3 * d0) { fin = k; break; }
  fin = Math.max(fin, 2);
  const brut = new Float64Array(n * 4);
  for (let l = 0; l < n; l++) { const k = pasDeLigne(l, n, fin), o = 4 * l; brut[o] = S[k]; brut[o + 1] = I[k]; brut[o + 2] = Rr[k]; brut[o + 3] = k * h; }
  const inv = suivi.fini(), dFin = dist(st), pose = dFin < 1e-6, tr = R0 * iE + xi;
  inv.somme.note = 's + i + r = 1 (exact ; r is integrated on its own, the sum is a witness)';
  inv.equilibre = { mesure: I[st], formule: iE, comparable: pose, ...(pose ? {} : { pasCompare: 'not settled yet when the run stops at t = ' + Math.round(st * h) }), sMesure: S[st], sFormule: sE, rMesure: Rr[st], rFormule: rE, distanceFinale: dFin, tFin: st * h,
    note: 'endemic level: i* = (1 - 1/R0) xi / (1 + xi), s* = 1/R0, r* = i*/xi (exact) ; compared once the run has settled (distance < 1e-6)' };
  /* taux d approche : pente de ln(distance) sur la seconde moitie de la descente au-dessus de 1e-7 */
  let kA = -1, kB = -1; for (let k = 0; k <= st; k++) { const d = dist(k); if (kA < 0 && d < 1e-3) kA = k; if (d < 1e-7) { kB = k; break; } }
  inv.approche = { mesure: kA >= 0 && kB > kA ? lnD(dist(kA) / dist(kB)) / ((kB - kA) * h) : NaN, formule: tr / 2,
    ...(kA >= 0 && kB > kA ? {} : { absente: 'the run never got within 1e-7 of the endemic point' }),
    approchee: 'linearised near the endemic point; measured as the mean slope of ln(distance) from 1e-3 to 1e-7', unite: 'par unite de temps' };
  inv.pic = { mesure: picMes, formule: piqueSIR(R0, s0, i0), tPic: kPic * h, approchee: 'it is the no-waning formula and ignores people losing immunity during the first wave' };
  inv.depart = { s0, i0, r0, R0, xi, R0s0: R0 * s0 };
  return { D: 4, brut, invariants: inv, unite: 'sans objet (equations deterministes, non chaotiques)' };
}

// ---------- 4 : lentille gravitationnelle ponctuelle (unites du rayon d Einstein) ----------
// Equation de la lentille : beta = theta - theta/|theta|^2. Source ponctuelle a u = |beta| : images theta+- = (u +- sqrt(u^2 + 4))/2,
//   amplification totale mu(u) = (u^2 + 2)/(u sqrt(u^2 + 4)), mu+ - mu- = 1.
// Source etendue : disque uniforme de rayon rho centre en (beta, 0). L amplification d une source etendue est la moyenne de mu sur
//   le disque. En polaires autour de la lentille, mu(u) u du = dF avec F(u) = u sqrt(u^2 + 4)/2 (derive), donc par Green
//   mu_disque = (1/(pi rho^2)) contour F(u) dphi, le long du bord ; integrande periodique lisse -> trapezes (convergence rapide).
//   Par image : mu+ - mu- = 1 reste exact pour le disque si l origine est hors du disque (beta > rho).
//   beta = 0 : anneau d Einstein, image = couronne de rayons (sqrt(rho^2 + 4) -+ rho)/2, mu = sqrt(1 + 4/rho^2).
// Mesure : tir inverse, rayons uniformes en aire (strates en (r^2, phi), tirage dans chaque strate graine fixe) sur des secteurs qui
//   contiennent surement les images ; aire touchee / aire de la source = amplification ; images du centre = rayon touche le plus
//   proche du centre de la source, de chaque cote.
const thetaPlus = (u) => (u + Math.sqrt(u * u + 4)) / 2;
const thetaMoinsAbs = (u) => (Math.sqrt(u * u + 4) - u) / 2;
const muPoint = (u) => (u * u + 2) / (u * Math.sqrt(u * u + 4));
function muDisque(beta, rho, M = 4096) {
  let s = 0;
  for (let k = 0; k < M; k++) {
    const al = DEUX_PI * k / M, ca = cosD(al), u2 = beta * beta + rho * rho + 2 * beta * rho * ca;
    if (u2 <= 0) continue;
    const u = Math.sqrt(u2); s += (u * Math.sqrt(u2 + 4) / 2) * rho * (rho + beta * ca) / u2;
  }
  return s * (DEUX_PI / M) / (PI * rho * rho);
}
const RAYONS_LENTILLE = 260;
function lentilleGravitationnelle(P, n) {
  const be = P.beta, rho = P.rho, rho2 = rho * rho, alea = mulberry32(12345), G = RAYONS_LENTILLE;
  /* zones de tir : contiennent les images avec une marge de 10 % en rayon (sinon l aire mesuree serait vraie par construction) */
  const regions = [], m1 = 0.9, m2 = 1.1;
  if (be > rho) {
    const ph = Math.min(PI / 2, (PI / 2) * (rho / be)); /* asin(x) <= (pi/2) x : secteur un peu trop large, jamais trop etroit */
    regions.push({ r1: m1 * thetaPlus(be - rho), r2: m2 * thetaPlus(be + rho), p1: -ph, p2: ph, cote: 1 });
    regions.push({ r1: m1 * thetaMoinsAbs(be + rho), r2: m2 * thetaMoinsAbs(be - rho), p1: PI - ph, p2: PI + ph, cote: -1 });
  } else regions.push({ r1: m1 * thetaMoinsAbs(be + rho), r2: m2 * thetaPlus(be + rho), p1: 0, p2: DEUX_PI, cote: 0 });
  const hx = [], hy = []; let aire = 0, airePlus = 0, aireMoins = 0, rMin = Infinity, rMax = 0, rMinPlus = Infinity, rMaxMoins = 0;
  let meilleur = { 1: [Infinity, 0, 0], '-1': [Infinity, 0, 0] }, espacement = 0;
  const Gr = regions.length === 1 ? G : G / 2, Gp = regions.length === 1 ? G : 2 * G;
  /* erreur d aire : seules les strates coupees par le bord de l image sont aleatoires (variance ~ 1/6 de dA^2 chacune) ;
     B = strates dont l etat differe d une voisine (approximation du nombre de strates coupees) */
  let var2 = 0;
  const etat = new Uint8Array(Gr * Gp);
  for (const R of regions) {
    const q1 = R.r1 * R.r1, q2 = R.r2 * R.r2, dA = (R.p2 - R.p1) * (q2 - q1) / 2 / (Gr * Gp); espacement = Math.max(espacement, Math.sqrt(dA));
    etat.fill(0);
    for (let i = 0; i < Gr; i++) for (let j = 0; j < Gp; j++) {
      const r = Math.sqrt(q1 + (q2 - q1) * (i + alea()) / Gr), p = R.p1 + (R.p2 - R.p1) * (j + alea()) / Gp, x = r * cosD(p), y = r * sinD(p), q = x * x + y * y;
      const bx = x - x / q, by = y - y / q, d2 = (bx - be) * (bx - be) + by * by;
      if (d2 > rho2) continue;
      etat[i * Gp + j] = 1;
      aire += dA; hx.push(x); hy.push(y);
      const rr = Math.sqrt(q); if (rr < rMin) rMin = rr; if (rr > rMax) rMax = rr;
      const cote = R.cote || (x >= 0 ? 1 : -1);
      if (R.cote === 1) { airePlus += dA; if (rr < rMinPlus) rMinPlus = rr; } else if (R.cote === -1) { aireMoins += dA; if (rr > rMaxMoins) rMaxMoins = rr; }
      if (d2 < meilleur[cote][0]) meilleur[cote] = [d2, cote * rr, y];
    }
    let B = 0;
    for (let i = 0; i < Gr; i++) for (let j = 0; j < Gp; j++) { const e = etat[i * Gp + j]; if ((i + 1 < Gr && etat[(i + 1) * Gp + j] !== e) || (j + 1 < Gp && etat[i * Gp + j + 1] !== e)) B++; }
    var2 += B * dA * dA / 6;
  }
  const H = hx.length, brut = new Float64Array(n * 4);
  for (let l = 0; l < n; l++) {
    const k = H ? Math.min(H - 1, Math.floor((l + 0.5) * H / n)) : 0, x = H ? hx[k] : 0, y = H ? hy[k] : 0, q = x * x + y * y || 1, o = 4 * l;
    brut[o] = x; brut[o + 1] = y; brut[o + 2] = x - x / q; brut[o + 3] = y - y / q;
  }
  const aS = PI * rho2, mu = aire / aS, muD = muDisque(be, rho);
  const inv = {
    amplification: { mesure: mu, formuleDisque: muD, ecart: Math.abs(mu - muD) / muD, sigma: Math.sqrt(var2) / aS, formulePoint: be > 0 ? muPoint(be) : Infinity, rayons: regions.length * Gr * Gp, touches: H,
      note: 'image area / source area by inverse ray shooting, against the exact uniform-disk magnification (area mean of (u^2+2)/(u sqrt(u^2+4)), Green contour integral) ; the point-source value is shown for reference' },
    etendue: { rayonMin: rMin, rayonMinFormule: thetaMoinsAbs(be + rho), rayonMax: rMax, rayonMaxFormule: thetaPlus(be + rho), espacement,
      note: 'innermost and outermost image radius : (sqrt((beta+rho)^2+4) -+ (beta+rho))/2' },
    images: { plus: meilleur[1][1], plusFormule: thetaPlus(be), moins: meilleur[-1][1], moinsFormule: -thetaMoinsAbs(be), espacement,
      note: 'image of the source centre on each side (signed radius of the ray landing closest to it) against theta+- = (beta +- sqrt(beta^2 + 4))/2 ; precision about one ray spacing' },
  };
  if (be > rho) inv.parImage = { plus: airePlus / aS, moins: aireMoins / aS, difference: (airePlus - aireMoins) / aS, differenceFormule: 1,
    rayonMinPlus: rMinPlus, rayonMinPlusFormule: thetaPlus(be - rho), rayonMaxMoins: rMaxMoins, rayonMaxMoinsFormule: thetaMoinsAbs(be - rho), note: 'mu+ - mu- = 1 exactly when the lens is outside the source disk' };
  if (be === 0) inv.anneau = { interieur: rMin, interieurFormule: thetaMoinsAbs(rho), exterieur: rMax, exterieurFormule: thetaPlus(rho), mu: mu, muFormule: Math.sqrt(1 + 4 / rho2),
    note: 'source on the axis : the image is an Einstein ring (annulus around radius 1), magnification sqrt(1 + 4/rho^2)' };
  return { D: 4, brut, nuage: true, invariants: inv, unite: 'sans objet (rayons tires sur le plan des images, pas une trajectoire)' };
}

// ---------- 5 : Kuramoto, N oscillateurs de phase, frequences lorentziennes (largeur gamma = 1, centre 0) ----------
// dtheta_i/dt = omega_i + (K/N) sum_j sin(theta_j - theta_i) = omega_i + K Im(Z e^{-i theta_i}), Z = r e^{i psi} = <e^{i theta}>.
// En z_i = e^{i theta_i} : dz/dt = i omega z + (K/2)(Z - conj(Z) z^2) (polynome, aucune trigo). Pas de Strang : rotation exacte
//   e^{i omega h/2} pretabulee, couplage RK4, rotation e^{i omega h/2}, puis |z| = 1 (correction d arrondi).
// Ott-Antonsen (exact pour N infini) : dr/dt = -gamma r + (K/2) r (1 - r^2) -> Kc = 2 gamma, r_inf = sqrt(1 - Kc/K) pour K > Kc, 0 sinon.
// N fini : fluctuations d ordre 1/sqrt(N) ; frequences tirees par quantiles stratifies (u_i = (i + alea)/N, omega = tan(pi(u - 1/2)))
//   ce qui reduit le bruit du tirage. Comparaison sur la moyenne de r(t) entre 0.6 T et T ; pres de Kc la relaxation, de taux K - Kc,
//   est trop lente pour T = 60 : comparaison declaree seulement pour K >= 1.25 Kc ou K <= 0.75 Kc. Pas h = 0.05 : a h = 0.1 l ecart
//   systematique a K = 5 atteignait 2e-3 (mesure le 2026-11-01), a h = 0.05 il tombe sous le bruit de N fini.
const KURAMOTO_T = 60, KURAMOTO_H = 0.05;
const rOttAntonsen = (K, gamma) => (K > 2 * gamma ? Math.sqrt(1 - 2 * gamma / K) : 0);
function kuramoto(P, n) {
  const N = P.N, K = P.K, gamma = 1, h = KURAMOTO_H, S = Math.round(KURAMOTO_T / h), alea = mulberry32(P.graine >>> 0);
  const om = new Float64Array(N), x = new Float64Array(N), y = new Float64Array(N), cr = new Float64Array(N), sr = new Float64Array(N), uq = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const u = (i + 1e-9 + (1 - 2e-9) * alea()) / N, a = PI * (u - 0.5); uq[i] = u; om[i] = gamma * sinD(a) / cosD(a);
    cr[i] = cosD(om[i] * h / 2); sr[i] = sinD(om[i] * h / 2);
  }
  for (let i = 0; i < N; i++) { const t = DEUX_PI * alea(); x[i] = cosD(t); y[i] = sinD(t); }
  /* RK4 du couplage : chaque etage lit (ax, ay) = z + c k_prec, ecrit k dans (dx, dy) et accumule la somme ponderee dans (sx, sy) */
  const tx = new Float64Array(N), ty = new Float64Array(N), dx = new Float64Array(N), dy = new Float64Array(N), sx = new Float64Array(N), sy = new Float64Array(N), g = K / 2;
  const etage = (ax, ay, poids, prochain) => {
    let X = 0, Y = 0; for (let i = 0; i < N; i++) { X += ax[i]; Y += ay[i]; } X /= N; Y /= N;
    for (let i = 0; i < N; i++) {
      const a = ax[i], b = ay[i], d2 = a * a - b * b, p = 2 * a * b, kxi = g * (X - X * d2 - Y * p), kyi = g * (Y - X * p + Y * d2);
      sx[i] += poids * kxi; sy[i] += poids * kyi; dx[i] = x[i] + prochain * kxi; dy[i] = y[i] + prochain * kyi;
    }
  };
  const tourner = () => { for (let i = 0; i < N; i++) { const a = x[i], b = y[i]; x[i] = a * cr[i] - b * sr[i]; y[i] = a * sr[i] + b * cr[i]; } };
  const coupler = () => {
    sx.fill(0); sy.fill(0);
    etage(x, y, 1, h / 2); tx.set(dx); ty.set(dy);
    etage(tx, ty, 2, h / 2); tx.set(dx); ty.set(dy);
    etage(tx, ty, 2, h); tx.set(dx); ty.set(dy);
    etage(tx, ty, 1, 0);
    for (let i = 0; i < N; i++) { x[i] += h / 6 * sx[i]; y[i] += h / 6 * sy[i]; }
  };
  const ordre = () => { let X = 0, Y = 0; for (let i = 0; i < N; i++) { X += x[i]; Y += y[i]; } return Math.sqrt(X * X + Y * Y) / N; };
  const images = Math.min(10, n), debuts = decouper(n, images), film = filmDe(debuts, n), brut = new Float64Array(n * 4);
  let f = 0, normeMax = 0;
  const image = (st) => {
    const d0 = film.debuts[f], c = film.tailles[f];
    for (let r = 0; r < c; r++) { const j = Math.min(N - 1, Math.floor((r + 0.5) * N / c)), o = 4 * (d0 + r); brut[o] = x[j]; brut[o + 1] = y[j]; brut[o + 2] = uq[j] - 0.5; brut[o + 3] = st * h; }
    f++;
  };
  const imageDe = (st) => { while (f < images && (images === 1 ? st === 0 : Math.round(f * S / (images - 1)) === st)) image(st); };
  imageDe(0);
  const serie = { t: [0], r: [ordre()] }; let somme = 0, compte = 0;
  for (let st = 1; st <= S; st++) {
    tourner(); coupler(); tourner();
    for (let i = 0; i < N; i++) { const m = Math.sqrt(x[i] * x[i] + y[i] * y[i]); if (Math.abs(m - 1) > normeMax) normeMax = Math.abs(m - 1); x[i] /= m; y[i] /= m; }
    const r = ordre();
    if (st >= 0.6 * S) { somme += r; compte++; }
    if (st % 20 === 0) { serie.t.push(st * h); serie.r.push(r); }
    imageDe(st);
  }
  const rInf = rOttAntonsen(K, gamma), Kc = 2 * gamma, comparable = K >= 1.25 * Kc || K <= 0.75 * Kc;
  return { D: 4, brut, film, unite: 'sans objet (synchronisation, non chaotique)', invariants: {
    critique: { Kc, gamma, note: 'Kc = 2 gamma for a Lorentzian of half-width gamma (Kuramoto)' },
    ordre: { mesure: somme / compte, formule: rInf, ecart: Math.abs(somme / compte - rInf), comparable, N, K, fenetre: [0.6 * KURAMOTO_T, KURAMOTO_T], serie,
      note: 'time-averaged order parameter r over the last 40 % against Ott-Antonsen r_inf = sqrt(1 - Kc/K) (N -> infinity) ; finite N adds fluctuations of order 1/sqrt(N), compared only away from Kc (relaxation rate K - Kc)' },
    norme: { pireEcart: normeMax, note: '|z| - 1 per step before renormalisation (rounding and splitting error)' } } };
}

// ---------- 6 : phenomene de Gibbs, sommes partielles d un creneau f(x) = signe(sin x) ----------
// S_N(x) = (4/pi) sum_{k=1..N} sin((2k-1) x)/(2k-1). S_N'(x) = (2/pi) sin(2 N x)/sin x : premier maximum en x = pi/(2N) EXACTEMENT.
// S_N(pi/(2N)) = (2/pi) * (regle du point milieu, pas pi/N, de sin(t)/t sur [0, pi]) -> G = (2/pi) Si(pi), Si(pi) calcule par Simpson.
//   Erreur du point milieu : (h^2/24)(f'(pi) - f'(0)) avec f'(pi) = -1/pi, f'(0) = 0, h = pi/N -> S_N max = G + 1/(12 N^2) + O(N^-4).
// Erreur L2 (Parseval) : E^2 = int_{-pi}^{pi} (f - S_N)^2 = 2 pi - (16/pi) sum_{k<=N} 1/(2k-1)^2, et sum_{k>N} 1/(2k-1)^2 ~ 1/(4N),
//   d ou E^2 ~ 4/(pi N) : c est l erreur QUADRATIQUE qui decroit en 1/N ; la norme E elle-meme decroit en N^(-1/2) (a cause du saut).
function siPi(M = 2000) { /* Si(pi) = int_0^pi sin(t)/t dt, Simpson, M pair */
  const h = PI / M, g = (t) => (t === 0 ? 1 : sinD(t) / t); let s = g(0) + g(PI);
  for (let k = 1; k < M; k++) s += (k % 2 ? 4 : 2) * g(k * h);
  return s * h / 3;
}
const GIBBS = (2 / PI) * siPi();
/* sin((2k+1)x) = 2 cos(2x) sin((2k-1)x) - sin((2k-3)x) : un seul sinD et un cosD par point */
const sommeFourier = (N, x) => {
  const c2 = 2 * cosD(2 * x); let a = -sinD(x), b = -a, s = 0;
  for (let k = 1; k <= N; k++) { s += b / (2 * k - 1); const c = c2 * b - a; a = b; b = c; }
  return 4 * s / PI;
};
const erreurL2Parseval = (N) => { let s = 0; for (let k = 1; k <= N; k++) s += 1 / ((2 * k - 1) * (2 * k - 1)); return DEUX_PI - 16 * s / PI; };
function maxPremierLobe(N) { /* recherche sur ]0, pi/N[ sans supposer la position, puis sommet de parabole */
  const M = 400, h = (PI / N) / M; let kb = 1, vb = -Infinity; const v = new Float64Array(M + 1);
  for (let k = 1; k < M; k++) { v[k] = sommeFourier(N, k * h); if (v[k] > vb) { vb = v[k]; kb = k; } }
  if (kb > 1 && kb < M - 1) { const y0 = v[kb - 1], y1 = v[kb], y2 = v[kb + 1], q = y0 - 2 * y1 + y2; if (q < 0) return { x: (kb + (y0 - y2) / (2 * q)) * h, v: y1 - (y2 - y0) * (y2 - y0) / (8 * q) }; }
  return { x: kb * h, v: vb };
}
function erreurL2Mesuree(N, M = Math.max(4000, 400 * N)) { /* 2 * int_0^pi (1 - S_N)^2, point milieu (f = 1 et S_N lisse sur ]0, pi[) */
  const h = PI / M; let s = 0; for (let k = 0; k < M; k++) { const e = 1 - sommeFourier(N, (k + 0.5) * h); s += e * e; }
  return 2 * s * h;
}
function gibbsFourier(P, n) {
  const N = P.N, w = P.fenetre, images = Math.min(8, N, n), debuts = decouper(n, images), film = filmDe(debuts, n), brut = new Float64Array(n * 4);
  const Ns = []; for (let f = 0; f < images; f++) Ns.push(images === 1 ? N : 1 + Math.round((N - 1) * f / (images - 1)));
  for (let f = 0; f < images; f++) {
    const d0 = film.debuts[f], c = film.tailles[f], Nk = Ns[f];
    for (let r = 0; r < c; r++) {
      const x = c === 1 ? 0 : -w + 2 * w * r / (c - 1), sN = sommeFourier(Nk, x), fx = x > 0 ? 1 : x < 0 ? -1 : 0, o = 4 * (d0 + r);
      brut[o] = x; brut[o + 1] = sN; brut[o + 2] = fx - sN; brut[o + 3] = Nk;
    }
  }
  const serie = { N: [], depassement: [], position: [], N2ecart: [], E2: [], E2Parseval: [], NE2: [] };
  const vus = [...new Set([...Ns, N])].sort((a, b) => a - b);
  for (const Nk of vus) {
    const m = maxPremierLobe(Nk), e2 = erreurL2Mesuree(Nk);
    serie.N.push(Nk); serie.depassement.push(m.v); serie.position.push(m.x); serie.N2ecart.push(Nk * Nk * (m.v - GIBBS));
    serie.E2.push(e2); serie.E2Parseval.push(erreurL2Parseval(Nk)); serie.NE2.push(Nk * e2);
  }
  const k = serie.N.length - 1;
  return { D: 4, brut, film, unite: 'sans objet (sommes partielles, pas une dynamique)', invariants: {
    gibbs: { SiPi: siPi(), formule: GIBBS, depassementRelatif: (GIBBS - 1) / 2, mesure: serie.depassement[k], N, ecart: serie.depassement[k] - GIBBS, ecartFormule: 1 / (12 * N * N),
      position: serie.position[k], positionFormule: PI / (2 * N), serie,
      note: 'highest value of S_N next to the jump against the Gibbs limit (2/pi) Si(pi), Si(pi) integrated numerically ; the excess decays like 1/(12 N^2) and never vanishes : the overshoot moves closer to the jump instead (x = pi/(2N))' },
    erreurL2: { mesure: serie.E2[k], formule: serie.E2Parseval[k], ecart: Math.abs(serie.E2[k] - serie.E2Parseval[k]) / serie.E2Parseval[k], NE2: serie.NE2[k], limiteNE2: 4 / PI,
      note: 'squared L2 error int (f - S_N)^2 over one period against Parseval 2 pi - (16/pi) sum 1/(2k-1)^2 ; N E^2 -> 4/pi, so the squared error decays like 1/N and the L2 norm like N^(-1/2)' } } };
}

// ---------- colonnes de brut : meme nature (longueurs comparables entre elles) ou autre grandeur ----------
export const COLONNES = Object.freeze({
  ising2D: { colonnes: ['x (lattice column)', 'y (lattice row)', 'local magnetisation (5 x 5 mean, -1..1)', 'spin (+1 or -1)'], memeLongueur: [[0, 1]], autres: [2, 3] },
  lotkaVolterra: { colonnes: ['prey density x', 'predator density y', 'time t'], memeLongueur: [[0, 1]], autres: [2] },
  epidemieSIR: { colonnes: ['susceptible fraction s', 'infected fraction i', 'recovered fraction r', 'time t (1/gamma)'], memeLongueur: [[0, 1, 2]], autres: [3] },
  lentilleGravitationnelle: { colonnes: ['image-plane theta_x', 'image-plane theta_y', 'source-plane beta_x', 'source-plane beta_y'], memeLongueur: [[0, 1, 2, 3]], autres: [] },
  kuramoto: { colonnes: ['cos theta (unit circle)', 'sin theta (unit circle)', 'natural-frequency quantile u - 1/2', 'time t (1/gamma)'], memeLongueur: [[0, 1]], autres: [2, 3] },
  gibbsFourier: { colonnes: ['x (angle)', 'partial sum S_N(x)', 'error f(x) - S_N(x)', 'number of terms N (label)'], memeLongueur: [[1, 2]], autres: [0, 3] },
});

// ---------- catalogue ----------
export const SYSTEMES = Object.freeze([
  { id: 'ising2D', nom: 'Magnet on a lattice (2D Ising model)', science: 'Statistical physics', D: 4, nuage: true, params: { T: 2.0, L: 48, balayages: 200, graine: 1 },
    bornes: { T: [1.2, 3.5], L: [24, 64], balayages: [20, 400], graine: [1, 1000000] },
    phrase: 'A visualisation of the 2D Ising model (J = k = 1, periodic L x L lattice): spins quenched from total disorder by Metropolis Monte Carlo at temperature T form domains, drawn with their local magnetisation; a separate run from the ordered state measures |magnetisation| and energy against Onsager\'s exact formulas, with Tc = 2/ln(1 + sqrt 2) computed. A finite lattice and finite run, so close to Tc no comparison is claimed.' },
  { id: 'lotkaVolterra', nom: 'Predators and prey (Lotka-Volterra)', science: 'Population dynamics', D: 3, params: { c: 1, amplitude: 1, periodes: 4, saturation: 0 },
    bornes: { c: [0.25, 4], amplitude: [0.05, 3], periodes: [2, 12], saturation: [0, 0.2] },
    phrase: 'A visualisation of the Lotka-Volterra equations (a = b = d = 1 fix the units, c is the predator death rate): the populations cycle forever around the fixed point (c, 1), the quantity H = x - c ln x + y - ln y stays constant, the time averages over a cycle equal the fixed point exactly, and near it the period is 2 pi / sqrt(c). Give the prey a limited space (crowding s = 1/K) and the cycle becomes a spiral that winds into the rest point (c, 1 - s c): H then goes down by exactly s times the integral of (x - c)^2. A deterministic model with no noise.' },
  { id: 'epidemieSIR', nom: 'An epidemic wave (SIR model)', science: 'Epidemiology', D: 4, params: { R0: 2.5, i0: 0.01, r0: 0, perteImmunite: 0 },
    bornes: { R0: [1.2, 6], i0: [0.001, 0.1], r0: [0, 0.6], perteImmunite: [0, 0.2] },
    phrase: 'A visualisation of the SIR model (fractions of a well-mixed population, time in units of the infectious period): the susceptible, infected and recovered fractions over one epidemic wave, with the final size against the exact equation r = 1 - s0 exp(-R0 (r - r0)) and the peak against I_max = i0 + s0 - (1 + ln(R0 s0))/R0. Let immunity fade (rate xi) and the disease never leaves: after damped waves it settles at the exact endemic level i* = (1 - 1/R0) xi / (1 + xi). No contacts structure, no births.' },
  { id: 'lentilleGravitationnelle', nom: 'Gravitational lens (point mass)', science: 'General relativity', D: 4, nuage: true, params: { beta: 0.6, rho: 0.2 },
    bornes: { beta: [0, 2], rho: [0.05, 0.5] },
    phrase: 'A visualisation of the point-mass lens equation beta = theta - theta/|theta|^2 in Einstein-radius units: light rays shot back from the image plane that land on a uniform round source show its two stretched images (an Einstein ring when the source is on the axis); image positions and the magnification are compared with the exact formulas. Thin lens, weak field, no other mass.' },
  { id: 'kuramoto', nom: 'Fireflies falling in step (Kuramoto model)', science: 'Nonlinear dynamics', D: 4, params: { K: 3, N: 600, graine: 1 },
    bornes: { K: [0.5, 5], N: [100, 1000], graine: [1, 1000000] },
    phrase: 'A visualisation of the Kuramoto model: N phase oscillators with Lorentzian natural frequencies (half-width 1) pulled together with strength K; above Kc = 2 a locked group forms and the order parameter settles near the Ott-Antonsen value sqrt(1 - Kc/K), exact only for infinitely many oscillators. Each frame shows the oscillators on the circle, ranked by natural frequency.' },
  { id: 'gibbsFourier', nom: 'Fourier series of a square wave (Gibbs phenomenon)', science: 'Fourier analysis', D: 4, params: { N: 12, fenetre: 3.1 },
    bornes: { N: [2, 60], fenetre: [0.3, 3.1] },
    phrase: 'A visualisation of partial Fourier sums of a square wave, frames adding terms up to N: the sum converges everywhere except that a bump of about 9 % of the jump keeps standing next to it, approaching (2/pi) Si(pi) computed here by numerical integration, while the squared L2 error falls like 1/N (Parseval).' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { ising2D: ['L', 'balayages', 'graine'], lotkaVolterra: [], epidemieSIR: [], lentilleGravitationnelle: [], kuramoto: ['N', 'graine'], gibbsFourier: ['N'] };
const FONCTIONS = { ising2D, lotkaVolterra, epidemieSIR, lentilleGravitationnelle, kuramoto, gibbsFourier };
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
