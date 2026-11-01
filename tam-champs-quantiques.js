// tam-champs-quantiques.js -- TAM, la vue CHAMPS QUANTIQUES : champs libres, vide quantique, interactions, simules honnetement.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-physique.js : SYSTEMES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null : aucun systeme ici n est une trajectoire chaotique), uniteLyapunov, points: null, invariants, nuage?,
//   film?: { images, parImage, debuts, tailles } }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun generateur aleatoire natif (graines : mulberry32).
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux du moteur ; exp ici avec + - * / ;
//   Math.sqrt/round/floor/abs/min/max seulement (IEEE exacts). FFT radix 2 maison (twiddles par sinD/cosD).
// REGLE DU PROJET : aucune valeur publiee sans source lue. Chaque constante d entree est dans SOURCES avec l URL lue le
//   2026-11-01 et la valeur telle que lue (champ lu) ; le banc relit lu et exige l egalite exacte avec valeur.
// Unites : naturelles (hbar = c = 1) sauf mention ; les conversions SI passent par les constantes CODATA de SOURCES.
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = Math.PI, DEUX_PI = 2 * Math.PI, LN2 = lnD(2), LN10 = lnD(10);

// ---------- constantes d entree, lues le 2026-11-01 (URL + valeur telle que lue) ----------
const S = (valeur, unite, url, lu) => Object.freeze({ valeur, unite, url, lu });
export const SOURCES = Object.freeze({
  // https://physics.nist.gov/cgi-bin/cuu/Value?alphinv : 137.035 999 177(21) (CODATA 2022)
  alphaInverse: S(137.035999177, '', 'https://physics.nist.gov/cgi-bin/cuu/Value?alphinv', '137.035 999 177(21)'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?hbar : 1.054 571 817... x 10-34 J s (exact)
  hbar: S(1.054571817e-34, 'J s', 'https://physics.nist.gov/cgi-bin/cuu/Value?hbar', '1.054 571 817 x 10^-34'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?c : 299 792 458 m s^-1 (exact)
  c: S(299792458, 'm/s', 'https://physics.nist.gov/cgi-bin/cuu/Value?c', '299 792 458'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?k : 1.380 649 x 10^-23 J K^-1 (exact)
  kB: S(1.380649e-23, 'J/K', 'https://physics.nist.gov/cgi-bin/cuu/Value?k', '1.380 649 x 10^-23'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?e : 1.602 176 634 x 10^-19 C (exact)
  e: S(1.602176634e-19, 'C', 'https://physics.nist.gov/cgi-bin/cuu/Value?e', '1.602 176 634 x 10^-19'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?me : 9.109 383 7139 x 10^-31 kg
  me: S(9.1093837139e-31, 'kg', 'https://physics.nist.gov/cgi-bin/cuu/Value?me', '9.109 383 7139 x 10^-31'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?mec2mev : 0.510 998 950 69(16) MeV
  meMeV: S(0.51099895069, 'MeV', 'https://physics.nist.gov/cgi-bin/cuu/Value?mec2mev', '0.510 998 950 69(16)'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?mmuc2mev : 105.658 3755(23) MeV
  mmuMeV: S(105.6583755, 'MeV', 'https://physics.nist.gov/cgi-bin/cuu/Value?mmuc2mev', '105.658 3755(23)'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?mtauc2mev : 1776.86(12) MeV
  mtauMeV: S(1776.86, 'MeV', 'https://physics.nist.gov/cgi-bin/cuu/Value?mtauc2mev', '1776.86(12)'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?ryd : 10 973 731.568 157(12) m^-1
  rydberg: S(10973731.568157, 'm^-1', 'https://physics.nist.gov/cgi-bin/cuu/Value?ryd', '10 973 731.568 157(12)'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?mpsme : 1836.152 673 426(32)
  mpSurMe: S(1836.152673426, '', 'https://physics.nist.gov/cgi-bin/cuu/Value?mpsme', '1836.152 673 426(32)'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?re : 2.817 940 3205(13) x 10^-15 m
  rayonElectron: S(2.8179403205e-15, 'm', 'https://physics.nist.gov/cgi-bin/cuu/Value?re', '2.817 940 3205(13) x 10^-15'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?ecomwl : 2.426 310 235 38(76) x 10^-12 m
  lambdaCompton: S(2.42631023538e-12, 'm', 'https://physics.nist.gov/cgi-bin/cuu/Value?ecomwl', '2.426 310 235 38(76) x 10^-12'),
  // https://pdglive.lbl.gov/Particle.action?node=S044 : "91.1879 +-0.0020 GeV"
  MZ: S(91.1879, 'GeV', 'https://pdglive.lbl.gov/Particle.action?node=S044&init=0', '91.1879'),
  // https://arxiv.org/abs/2203.08271 (lu sur ar5iv) : PDG 2022 world average "alpha_S(m_Z^2) = 0.1179 +- 0.0009"
  alphaSMZ: S(0.1179, '', 'https://ar5iv.arxiv.org/html/2203.08271', '0.1179'),
  // Barnes, Godfrey, Swanson, hep-ph/0505002, Eq. (1) : (alpha_s, b, m_c, sigma) = (0.5461, 0.1425 GeV^2, 1.4794 GeV, 1.0946 GeV)
  bgsAlphaS: S(0.5461, '', 'https://ar5iv.arxiv.org/html/hep-ph/0505002', '0.5461'),
  bgsB: S(0.1425, 'GeV^2', 'https://ar5iv.arxiv.org/html/hep-ph/0505002', '0.1425'),
  bgsMc: S(1.4794, 'GeV', 'https://ar5iv.arxiv.org/html/hep-ph/0505002', '1.4794'),
  bgsSigma: S(1.0946, 'GeV', 'https://ar5iv.arxiv.org/html/hep-ph/0505002', '1.0946'),
  // https://pdglive.lbl.gov/Particle.action?node=S032 : D0 "1864.84 +-0.04 MeV" (seuil de cassure de la corde = 2 m_D)
  mD0MeV: S(1864.84, 'MeV', 'https://pdglive.lbl.gov/Particle.action?node=S032&init=0', '1864.84'),
});
const V_ = (k) => SOURCES[k].valeur;
/* constantes derivees (calculees, pas tapees) */
const ALPHA = 1 / V_('alphaInverse');
const HBARC_GEV_FM = V_('hbar') * V_('c') / (V_('e') * 1e9) / 1e-15; // hbar c en GeV fm

// ---------- arithmetique deterministe ----------
function expD(x) { /* e^x avec + - * / seulement (meme fonction que tam-physique.js) */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* gaussienne N(0,1) par Box-Muller (lnD, cosD du moteur) */
function gaussien(alea) { const u = 1 - alea(), v = alea(); return Math.sqrt(-2 * lnD(u)) * cosD(DEUX_PI * v); }
/* suivi d invariants point par point : { debut, fin, derive, min, max } (meme definition que tam-physique.js) */
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
/* film : debuts[k] = premiere ligne de l image k (meme forme que tam-astro.js#filmDe) */
function decouper(n, images) { const d = []; for (let k = 0; k < images; k++) d.push(Math.floor(k * n / images)); return d; }
function filmDe(debuts, n) {
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}
/* FFT radix 2 en place, non normalisee ; signe -1 = sum x_j e^{-i k j}, +1 = inverse */
const TWID = new Map();
function fft(re, im, signe) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  let tw = TWID.get(N);
  if (!tw) { tw = { c: new Float64Array(N / 2), s: new Float64Array(N / 2) }; for (let k = 0; k < N / 2; k++) { tw.c[k] = cosD(DEUX_PI * k / N); tw.s[k] = sinD(DEUX_PI * k / N); } TWID.set(N, tw); }
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1, pas = N / len;
    for (let i = 0; i < N; i += len) for (let k = 0; k < half; k++) {
      const wr = tw.c[k * pas], wi = signe * tw.s[k * pas], a = i + k, b = a + half;
      const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
      re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
    }
  }
}
/* regression lineaire y = a + b x ; rend b */
function pente(xs, ys) {
  const n = xs.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

// ---------- reseau : relation de dispersion d un champ de Klein-Gordon discretise (pas a = 1) ----------
// omega^2 = m^2 + (2/a sin(k a/2))^2 : laplacien a 3 points.
const kLat = (k) => 2 * sinD(k / 2);
const omegaLat = (k, m) => Math.sqrt(m * m + kLat(k) * kLat(k));

// ---------- 1 : champ libre (Klein-Gordon, reseau 1-D periodique, saute-mouton symplectique) ----------
const N1 = 256, H1 = 0.02;
function champLibre(P, n) {
  const N = N1, h = H1, m = P.m, m2 = m * m, x0 = N / 4, s = P.largeur;
  const f = new Float64Array(N), p = new Float64Array(N), F = new Float64Array(N);
  const force = () => { for (let j = 0; j < N; j++) { const g = f[j === 0 ? N - 1 : j - 1], d = f[j === N - 1 ? 0 : j + 1]; F[j] = g + d - 2 * f[j] - m2 * f[j]; } };
  const energie = () => { let E = 0; for (let j = 0; j < N; j++) { const d = f[j === N - 1 ? 0 : j + 1] - f[j]; E += 0.5 * p[j] * p[j] + 0.5 * d * d + 0.5 * m2 * f[j] * f[j]; } return E; };
  const pasSM = () => { for (let j = 0; j < N; j++) p[j] += 0.5 * h * F[j]; for (let j = 0; j < N; j++) f[j] += h * p[j]; force(); for (let j = 0; j < N; j++) p[j] += 0.5 * h * F[j]; };
  /* paquet a frequences positives seulement : phi = sum c_k cos(k(x-x0)), pi = sum c_k omega_k sin(k(x-x0)) -> part vers +x */
  const cs = [], ks = [], ws = []; let somme = 0;
  for (let j = 1; j < N / 2; j++) { const k = DEUX_PI * j / N, d = (k - P.k0) * s; if (d * d / 2 > 40) continue; const c = expD(-d * d / 2); cs.push(c); ks.push(k); ws.push(omegaLat(k, m)); somme += c; }
  for (let i = 0; i < N; i++) { let a = 0, b = 0; for (let q = 0; q < cs.length; q++) { const ph = ks[q] * (i - x0); a += cs[q] * cosD(ph); b += cs[q] * ws[q] * sinD(ph); } f[i] = a / somme; p[i] = b / somme; }
  force();
  const total = Math.max(1, Math.round(P.duree / h)), images = Math.min(12, n), debuts = decouper(n, images), film = filmDe(debuts, n);
  const brut = new Float64Array(n * 3), suivi = suiveur();
  let cPrev = x0; const ts = [], cs2 = [], largeurs = [];
  const centre = () => {
    let se = 0, sx = 0, sxx = 0;
    for (let j = 0; j < N; j++) {
      const g = f[j === 0 ? N - 1 : j - 1], d = f[j === N - 1 ? 0 : j + 1];
      const e = 0.5 * p[j] * p[j] + 0.25 * ((d - f[j]) * (d - f[j]) + (f[j] - g) * (f[j] - g)) + 0.5 * m2 * f[j] * f[j];
      let x = j - cPrev; x -= N * Math.round(x / N); se += e; sx += e * x; sxx += e * x * x;
    }
    const mu = sx / se; cPrev += mu; return Math.sqrt(Math.max(0, sxx / se - mu * mu));
  };
  let k = 0;
  const image = (st) => {
    const t = st * h, d0 = film.debuts[k], c = film.tailles[k];
    for (let r = 0; r < c; r++) { const j = Math.floor(r * N / c), o = (d0 + r) * 3; brut[o] = j; brut[o + 1] = t; brut[o + 2] = f[j]; }
    k++;
  };
  for (let st = 0; st <= total; st++) {
    if (st > 0) pasSM();
    if (st % 10 === 0) { suivi.noter({ energie: energie() }); const w = centre(); ts.push(st * h); cs2.push(cPrev); largeurs.push(w); }
    while (k < images && (images === 1 ? st === 0 : Math.round(k * total / (images - 1)) === st)) image(st);
  }
  /* dispersion : UN mode du reseau phi_j = cos(k_s j), pi = 0 ; omega mesure par les passages a zero de phi_0(t) */
  const js = Math.max(1, Math.min(N / 2 - 1, Math.round(P.k0 * N / DEUX_PI))), kS = DEUX_PI * js / N;
  for (let j = 0; j < N; j++) { f[j] = cosD(kS * j); p[j] = 0; }
  force();
  let prec = f[0], tPrem = null, tDern = null, passages = 0;
  const pasMode = Math.round(60 / h);
  for (let st = 1; st <= pasMode; st++) {
    pasSM(); const v = f[0];
    if ((prec > 0 && v <= 0) || (prec < 0 && v >= 0)) { const t = (st - 1 + prec / (prec - v)) * h; if (tPrem === null) tPrem = t; tDern = t; passages++; }
    prec = v;
  }
  const wMes = PI * (passages - 1) / (tDern - tPrem), wTh = omegaLat(kS, m);
  const vMes = pente(ts, cs2), wk0 = omegaLat(P.k0, m), vTh = kLat(P.k0) * cosD(P.k0 / 2) / wk0;
  const inv = suivi.fini();
  inv.dispersion = { mesure: wMes, formule: wTh, ecart: Math.abs(wMes - wTh) / wTh, k: kS, passages, unite: 'omega en 1/a (a = 1, c = 1)' };
  inv.vitesseGroupe = { mesure: vMes, formule: vTh, ecart: Math.abs(vMes - vTh) / vTh, unite: 'c' };
  inv.largeurPaquet = { debut: largeurs[0], fin: largeurs[largeurs.length - 1], unite: 'a (ecart type de la densite d energie)' };
  return { D: 3, brut, invariants: inv, film, unite: 'sans objet (champ lineaire, film d instantanes)' };
}

// ---------- 2 : vide quantique d un champ libre (etat fondamental gaussien exact du reseau) ----------
// phi_k = (1/sqrt N) sum_j phi_j e^{-ikj} ; H = sum_k (|pi_k|^2 + omega_k^2 |phi_k|^2)/2 ; fondamental : <|phi_k|^2> = 1/(2 omega_k).
const N2 = 64;
const varianceMode = (w) => 1 / (2 * w);
function fluctuationsVide(P, n) {
  const N = N2, m = P.m, S = P.echantillons, alea = mulberry32(P.graine >>> 0), rN = 1 / Math.sqrt(N), M = N / 2;
  const w = new Float64Array(N), v = new Float64Array(N);
  for (let j = 0; j < N; j++) { w[j] = omegaLat(DEUX_PI * j / N, m); v[j] = varianceMode(w[j]); }
  const re = new Float64Array(N), im = new Float64Array(N), x = new Float64Array(N);
  const acc = new Float64Array(M + 1), acc2 = new Float64Array(M + 1), cor = new Float64Array(M + 1), cor2 = new Float64Array(M + 1);
  const images = Math.min(12, n), debuts = decouper(n, images), film = filmDe(debuts, n), brut = new Float64Array(n * 3);
  for (let s = 0; s < S; s++) {
    re.fill(0); im.fill(0);
    for (let j = 0; j <= M; j++) {
      if (j === 0 || j === M) { re[j] = Math.sqrt(v[j]) * gaussien(alea); continue; }
      const sd = Math.sqrt(v[j] / 2); re[j] = sd * gaussien(alea); im[j] = sd * gaussien(alea); re[N - j] = re[j]; im[N - j] = -im[j];
    }
    fft(re, im, 1);
    for (let j = 0; j < N; j++) x[j] = re[j] * rN;
    if (s < images) { const d0 = film.debuts[s], c = film.tailles[s]; for (let r = 0; r < c; r++) { const j = Math.floor(r * N / c), o = (d0 + r) * 3; brut[o] = j; brut[o + 1] = s; brut[o + 2] = x[j]; } }
    /* mesure : retour dans l espace des modes a partir de la configuration reelle */
    for (let j = 0; j < N; j++) { re[j] = x[j]; im[j] = 0; }
    fft(re, im, -1);
    for (let j = 0; j <= M; j++) { const q = (re[j] * re[j] + im[j] * im[j]) / N; acc[j] += q; acc2[j] += q * q; }
    for (let r = 0; r <= M; r++) { let c = 0; for (let j = 0; j < N; j++) c += x[j] * x[(j + r) % N]; c /= N; cor[r] += c; cor2[r] += c * c; }
  }
  const modes = { k: [], mesure: [], theorie: [], erreur: [], pireEcartSigma: 0 }, correlation = { r: [], mesure: [], erreur: [], theorie: [] };
  for (let j = 0; j <= M; j++) {
    const mu = acc[j] / S, sd = Math.sqrt(Math.max(0, acc2[j] / S - mu * mu) / S);
    modes.k.push(DEUX_PI * j / N); modes.mesure.push(mu); modes.theorie.push(v[j]); modes.erreur.push(sd);
    const z = Math.abs(mu - v[j]) / sd; if (z > modes.pireEcartSigma) modes.pireEcartSigma = z;
  }
  for (let r = 0; r <= M; r++) {
    let th = 0; for (let j = 0; j < N; j++) th += cosD(DEUX_PI * j * r / N) * v[j]; th /= N;
    const mu = cor[r] / S; correlation.r.push(r); correlation.mesure.push(mu); correlation.theorie.push(th);
    correlation.erreur.push(Math.sqrt(Math.max(0, cor2[r] / S - mu * mu) / S));
  }
  return { D: 3, brut, film, unite: 'sans objet (echantillons independants d une loi de probabilite, pas un mouvement)', invariants: {
    variancesModes: modes, correlation, echantillons: S, normalisation: 'phi_k = (1/sqrt N) sum_j phi_j e^{-ikj}, a = 1, hbar = c = 1' } };
}

// ---------- 3 : deux champs classiques couples (phi condensat oscillant, chi), resonance parametrique ----------
// V = m^2 phi^2 / 2 + g^2 phi^2 chi^2 / 2 (forme de Kofman-Linde-Starobinsky, hep-ph/9704452, terme -1/2 g^2 phi^2 chi^2 du lagrangien).
// Mathieu (KLS, Minkowski) : chi_k'' + (A_k - 2q cos 2z) chi_k = 0, A_k = k^2/m^2 + 2q, q = g^2 Phi^2/(4 m^2), z = m t ;
// premiere bande pour q << 1 : k^2 ~ m^2 (1 - 2q +- q). Sur le reseau, k^2 -> kappa^2 = (2/a sin(k a/2))^2.
const N3 = 256, A3 = 0.5, H3 = 0.02, MESURE3 = 25;
function interactionChamps(P, n) {
  const N = N3, a = A3, h = H3, m2 = 1, g2 = P.g * P.g, a2 = 1 / (a * a), alea = mulberry32(P.graine >>> 0);
  const q = g2 * P.Phi * P.Phi / 4;
  const f = new Float64Array(N).fill(P.Phi), pf = new Float64Array(N), x = new Float64Array(N), px = new Float64Array(N);
  for (let j = 0; j < N; j++) { x[j] = 1e-6 * gaussien(alea); px[j] = 1e-6 * gaussien(alea); }
  const Ff = new Float64Array(N), Fx = new Float64Array(N);
  const force = () => {
    for (let j = 0; j < N; j++) {
      const jg = j === 0 ? N - 1 : j - 1, jd = j === N - 1 ? 0 : j + 1;
      Ff[j] = (f[jg] + f[jd] - 2 * f[j]) * a2 - m2 * f[j] - g2 * x[j] * x[j] * f[j];
      Fx[j] = (x[jg] + x[jd] - 2 * x[j]) * a2 - g2 * f[j] * f[j] * x[j];
    }
  };
  const energies = () => {
    let ef = 0, ex = 0, ei = 0;
    for (let j = 0; j < N; j++) {
      const jd = j === N - 1 ? 0 : j + 1, df = f[jd] - f[j], dx = x[jd] - x[j];
      ef += 0.5 * pf[j] * pf[j] + 0.5 * df * df * a2 + 0.5 * m2 * f[j] * f[j];
      ex += 0.5 * px[j] * px[j] + 0.5 * dx * dx * a2;
      ei += 0.5 * g2 * f[j] * f[j] * x[j] * x[j];
    }
    return { phi: ef * a, chi: ex * a, inter: ei * a, total: (ef + ex + ei) * a };
  };
  force();
  const total = Math.max(1, Math.round(P.duree / h)), images = Math.min(12, n), debuts = decouper(n, images), film = filmDe(debuts, n);
  const brut = new Float64Array(n * 4), suivi = suiveur(), M = N / 2;
  const kap2 = new Float64Array(M + 1); for (let j = 0; j <= M; j++) { const kk = kLat(DEUX_PI * j / N) / a; kap2[j] = kk * kk; } /* k_j a = 2 pi j / N */
  const re = new Float64Array(N), im = new Float64Array(N), re2 = new Float64Array(N), im2 = new Float64Array(N);
  const tMes = [], hist = []; for (let j = 0; j <= M; j++) hist.push([]);
  let tLin = null; const serie = { t: [], phi: [], chi: [], inter: [] };
  let k = 0;
  for (let st = 0; st <= total; st++) {
    if (st > 0) {
      for (let j = 0; j < N; j++) { pf[j] += 0.5 * h * Ff[j]; px[j] += 0.5 * h * Fx[j]; }
      for (let j = 0; j < N; j++) { f[j] += h * pf[j]; x[j] += h * px[j]; }
      force();
      for (let j = 0; j < N; j++) { pf[j] += 0.5 * h * Ff[j]; px[j] += 0.5 * h * Fx[j]; }
    }
    if (st % MESURE3 === 0) {
      const E = energies(), t = st * h; suivi.noter({ energieTotale: E.total, fractionInteraction: E.inter / E.total });
      if (st % (4 * MESURE3) === 0) { serie.t.push(t); serie.phi.push(E.phi); serie.chi.push(E.chi); serie.inter.push(E.inter); }
      let v2 = 0; for (let j = 0; j < N; j++) v2 += x[j] * x[j]; v2 /= N;
      if (tLin === null && v2 > 1e-6) tLin = t;
      if (tLin === null) {
        for (let j = 0; j < N; j++) { re[j] = x[j]; im[j] = 0; re2[j] = px[j]; im2[j] = 0; }
        fft(re, im, -1); fft(re2, im2, -1);
        tMes.push(t);
        for (let j = 0; j <= M; j++) { const P2 = re[j] * re[j] + im[j] * im[j] + (re2[j] * re2[j] + im2[j] * im2[j]) / (kap2[j] + 2 * q); hist[j].push(0.5 * lnD(P2)); }
      }
    }
    while (k < images && (images === 1 ? st === 0 : Math.round(k * total / (images - 1)) === st)) {
      const d0 = film.debuts[k], c = film.tailles[k], t = st * h;
      for (let r = 0; r < c; r++) { const j = Math.floor(r * N / c), o = (d0 + r) * 4; brut[o] = j * a; brut[o + 1] = t; brut[o + 2] = f[j]; brut[o + 3] = x[j]; }
      k++;
    }
  }
  /* taux de croissance par mode : pente de ln|chi_k| sur [15, t_lin] (regime lineaire, chi_rms < 1e-3) */
  const i0 = tMes.findIndex((t) => t >= 15), taux = [];
  let jMax = 1, muMax = -Infinity;
  for (let j = 1; j < M; j++) {
    const mu = i0 >= 0 && tMes.length - i0 >= 8 ? pente(tMes.slice(i0), hist[j].slice(i0)) : NaN; taux.push(mu);
    if (mu > muMax) { muMax = mu; jMax = j; }
  }
  const E = energies(), inv = suivi.fini();
  inv.resonance = { q, A: kap2[jMax] + 2 * q, kappa2Max: kap2[jMax], kMax: DEUX_PI * jMax / (N * a), jMax, tauxMax: muMax,
    bandeKLS: [1 - 3 * q, 1 - q], tauxKLS: q / 2, fenetre: [tMes[i0], tMes[tMes.length - 1]], tLineaire: tLin, taux, kappa2: Array.from(kap2),
    unite: 'kappa^2 en m^2, taux en m (croissance de |chi_k| ~ e^{taux t})' };
  inv.transfert = { fractionChiFin: E.chi / E.total, fractionInteractionFin: E.inter / E.total, serie };
  return { D: 4, brut, film, invariants: inv, unite: 'sans objet (champ classique sur reseau, film d instantanes)' };
}

// ---------- 4 : effet Schwinger (paires e+ e- dans un champ electrique constant) ----------
// Taux par unite de volume (Schwinger 1951, Phys. Rev. 82, 664 ; forme lue sur https://en.wikipedia.org/wiki/Schwinger_effect) :
//   Gamma = (eE)^2 / (4 pi^3 hbar^2 c) sum_n n^-2 exp(-n pi m^2 c^3 / (hbar e E)) ; unites naturelles, m = 1 : eE = E/E_crit.
// E_crit = m_e^2 c^3 / (e hbar) (forme lue sur https://en.wikipedia.org/wiki/Schwinger_limit), calcule ici avec CODATA.
function tauxSchwinger(eps) {
  let s = 0;
  for (let k = 1; k <= 400; k++) { const t = expD(-k * PI / eps) / (k * k); s += t; if (t < 1e-18 * s) break; }
  return eps * eps / (4 * PI * PI * PI) * s;
}
const L4 = 20;
function paireSchwinger(P, n) {
  const eps = P.champ, Np = P.paires, T = P.duree, h = 0.002, part = 2 * Np;
  const me = V_('me'), c = V_('c'), hb = V_('hbar'), e = V_('e');
  const Ecrit = me * me * c * c * c / (e * hb), G = tauxSchwinger(eps);
  const inv0 = (me * c * c / hb) * (me * c / hb) * (me * c / hb) * (me * c / hb); // (temps Compton)^-1 (longueur Compton)^-3
  const brut = new Float64Array(n * 4), debuts = decouper(n, Math.min(part, n)), film = filmDe(debuts, n);
  let vmax = 0, hyp = 0, sep = 0;
  for (let ip = 0; ip < debuts.length; ip++) {
    const paire = ip >> 1, signe = ip % 2 === 0 ? -1 : 1; // electron (charge -1) vers -x, positron vers +x (E selon +x)
    const a2 = mulberry32(((P.graine >>> 0) * 7919 + paire * 104729) >>> 0); a2();
    const x0 = L4 * (a2() - 0.5), y0 = L4 * (a2() - 0.5), z0 = L4 * (a2() - 0.5), t0 = 0.5 * T * a2();
    let x = x0 + signe / eps, pM = 0, t = t0; /* nait au repos a la separation 2m/(eE) (bilan d energie de l instanton) */
    const d0 = film.debuts[ip], cnt = film.tailles[ip];
    const f = (pp) => pp / Math.sqrt(1 + pp * pp);
    for (let r = 0; r < cnt; r++) {
      const tc = cnt === 1 ? t0 : t0 + (T - t0) * r / (cnt - 1);
      while (t < tc - 1e-12) {
        const hk = Math.min(h, tc - t), dp = signe * eps; /* RK4 sur (x, p) : dp/dt = q E, dx/dt = p / sqrt(1 + p^2) */
        const k1 = f(pM), k2 = f(pM + 0.5 * hk * dp), k4 = f(pM + hk * dp);
        x += hk / 6 * (k1 + 4 * k2 + k4); pM += hk * dp; t += hk;
      }
      const o = (d0 + r) * 4; brut[o] = x; brut[o + 1] = y0; brut[o + 2] = z0; brut[o + 3] = t;
      const v = Math.abs(f(pM)); if (v > vmax) vmax = v;
      const dh = Math.abs((x - x0) * (x - x0) - (t - t0) * (t - t0) - 1 / (eps * eps)) * eps * eps; if (dh > hyp) hyp = dh;
      if (r === cnt - 1) sep = Math.max(sep, 2 * Math.abs(x - x0));
    }
  }
  return { D: 4, brut, film, unite: 'sans objet (lignes d univers deterministes, force de Lorentz)', invariants: {
    taux: { naturel: G, SI: G * inv0, champCritique: Ecrit, champSI: eps * Ecrit, unite: 'paires par (longueur Compton)^3 par temps Compton ; SI : paires m^-3 s^-1' },
    attendu: { paires: G * L4 * L4 * L4 * T, dessinees: Np, volume: L4 * L4 * L4, duree: T, note: 'paires dessinees = echantillon illustratif ; attendu = Gamma V T' },
    vitesseMax: { fin: vmax, unite: 'c' }, hyperbole: { derive: hyp, note: '(x - x0)^2 - (t - t0)^2 = (m/eE)^2 sur chaque ligne d univers' },
    separationMax: { fin: sep, unite: 'longueur Compton' } } };
}

// ---------- 5 : effet Unruh ----------
// T = hbar a / (2 pi c k_B) (forme lue sur https://en.wikipedia.org/wiki/Unruh_effect), constantes CODATA de SOURCES.
const temperatureUnruh = (a, hbar, c, kB) => hbar * a / (2 * PI * c * kB);
/* zeta(s) par somme directe + queue d Euler-Maclaurin (s entier >= 2) */
function zetaD(s) {
  const K = 1000; let z = 0;
  const puiss = (k, p) => { let r = 1; for (let i = 0; i < p; i++) r *= k; return r; };
  for (let k = 1; k <= K; k++) z += 1 / puiss(k, s);
  return z + 1 / ((s - 1) * puiss(K, s - 1)) - 0.5 / puiss(K, s) + s / (12 * puiss(K, s + 1));
}
function effetUnruh(P, n) {
  const T = temperatureUnruh(1, 1, 1, 1); /* unites ou a = c = hbar = k_B = 1 : la figure est universelle en c^2/a */
  const aSI = expD(P.log10a * LN10), TSI = temperatureUnruh(aSI, V_('hbar'), V_('c'), V_('kB')), T1 = temperatureUnruh(1, V_('hbar'), V_('c'), V_('kB'));
  const alea = mulberry32(P.graine >>> 0), brut = new Float64Array(n * 4), suivi = suiveur();
  /* ligne d univers a acceleration propre constante : du^t/dtau = a u^x, du^x/dtau = a u^t, integree (RK4) depuis tau = 0 */
  const etats = new Float64Array(n * 4), taus = new Float64Array(n);
  for (let i = 0; i < n; i++) taus[i] = n === 1 ? 0 : -P.tauMax + 2 * P.tauMax * i / (n - 1);
  const deriv = (y, d) => { d[0] = y[2]; d[1] = y[3]; d[2] = y[3]; d[3] = y[2]; }; // [t, x, ut, ux], a = 1
  const k1 = new Float64Array(4), k2 = new Float64Array(4), k3 = new Float64Array(4), k4 = new Float64Array(4), tmp = new Float64Array(4);
  const rk4 = (y, hh) => {
    deriv(y, k1); for (let i = 0; i < 4; i++) tmp[i] = y[i] + 0.5 * hh * k1[i];
    deriv(tmp, k2); for (let i = 0; i < 4; i++) tmp[i] = y[i] + 0.5 * hh * k2[i];
    deriv(tmp, k3); for (let i = 0; i < 4; i++) tmp[i] = y[i] + hh * k3[i];
    deriv(tmp, k4); for (let i = 0; i < 4; i++) y[i] += hh / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  };
  for (const sens of [1, -1]) {
    const y = Float64Array.from([0, 1, 1, 0]); let tau = 0;
    const ordre = []; for (let i = 0; i < n; i++) if (sens > 0 ? taus[i] >= 0 : taus[i] < 0) ordre.push(i);
    if (sens < 0) ordre.reverse();
    for (const i of ordre) {
      while (Math.abs(taus[i] - tau) > 1e-12) { const hh = sens * Math.min(1e-3, Math.abs(taus[i] - tau)); rk4(y, hh); tau += hh; }
      etats.set(y, 4 * i);
    }
  }
  let hyp = 0, norme = 0, accMax = 0;
  for (let i = 0; i < n; i++) {
    const t = etats[4 * i], x = etats[4 * i + 1], ut = etats[4 * i + 2], ux = etats[4 * i + 3];
    hyp = Math.max(hyp, Math.abs(x * x - t * t - 1)); norme = Math.max(norme, Math.abs(ut * ut - ux * ux - 1));
    /* acceleration propre : |du/dtau| (metrique -+), du/dtau donne par l equation du mouvement evaluee sur l etat integre */
    const at = ux, ax = ut; accMax = Math.max(accMax, Math.abs(Math.sqrt(ax * ax - at * at) - 1));
  }
  /* quanta du bain thermique vus par l observateur : energie tiree selon omega^2 / (e^{omega/T} - 1) (bain de Planck, 3+1 d) */
  const fx = (u) => (u < 1e-12 ? 0 : u * u / (expD(u) - 1));
  let fmax = 0; for (let i = 1; i <= 4000; i++) { const v = fx(40 * i / 4000); if (v > fmax) fmax = v; } fmax *= 1.02;
  let somme = 0, depasse = 0;
  for (let i = 0; i < n; i++) {
    let u; for (;;) { u = 40 * alea(); const v = fx(u); if (v > fmax) depasse++; if (alea() * fmax < v) break; }
    const w = u * T; somme += w;
    const o = 4 * i; brut[o] = etats[4 * i + 1]; brut[o + 1] = etats[4 * i]; brut[o + 2] = w; brut[o + 3] = taus[i];
  }
  suivi.noter({ temperatureNaturelle: T });
  const z3 = zetaD(3), z4 = zetaD(4), inv = suivi.fini();
  inv.temperature = { naturelle: T, SI: TSI, accelerationSI: aSI, pourUnMetreParSeconde2: T1, unite: 'naturelle : T en a hbar/(c k_B) ; SI : kelvin' };
  inv.energieMoyenne = { mesure: somme / n, theorie: 3 * z4 / z3 * T, depassementsDuMax: depasse, unite: 'hbar a / c' };
  inv.hyperbole = { derive: hyp, note: 'x^2 - t^2 = (c^2/a)^2' }; inv.normeVitesse = { derive: norme }; inv.accelerationPropre = { derive: accMax };
  return { D: 4, brut, invariants: inv, nuage: true, unite: 'sans objet (ligne d univers exacte et tirages thermiques)' };
}

// ---------- 6 : constante de couplage courante (QED a une boucle, leptons ; QCD a une boucle) ----------
// Polarisation du vide a une boucle d un fermion de masse m, Q^2 > 0 (genre espace), forme fermee de
// (2 alpha/pi) int_0^1 x(1-x) ln(1 + Q^2 x(1-x)/m^2) dx (le banc la recompare a l integrale numerique) ;
// limite Q >> m : (alpha/3pi)(ln(Q^2/m^2) - 5/3), comparee a la colonne une boucle de Steinhauser (hep-ph/9803313, Table 1).
// QCD : beta(alpha_s) = -(11 - 2 n_f/3) alpha_s^2/(2 pi) (lu sur https://en.wikipedia.org/wiki/Beta_function_(physics)).
function piFermion(Q, m) {
  const r = 4 * m * m / (Q * Q);
  if (r > 1e6) return ALPHA * Q * Q / (15 * PI * m * m); /* developpement Q << m de l integrale : (2 alpha/pi)(Q^2/m^2)/30 */
  const b = Math.sqrt(1 + r);
  /* (b + 1)/(b - 1) = (b + 1)^2 / r : evite la soustraction b - 1 (catastrophique pour Q >> m) */
  return ALPHA / (3 * PI) * (-5 / 3 + r + (1 - r / 2) * b * lnD((b + 1) * (b + 1) / r));
}
const LEPTONS_GEV = () => [V_('meMeV') / 1000, V_('mmuMeV') / 1000, V_('mtauMeV') / 1000];
function couplageCourant(P, n) {
  const ml = LEPTONS_GEV(), MZ = V_('MZ'), aS = V_('alphaSMZ'), nf = 5, b0 = 11 - 2 * nf / 3;
  const n0 = Math.max(1, Math.floor(n / 2)), n1 = n - n0, brut = new Float64Array(n * 3);
  const invAlpha = (Q) => { let d = 0; for (const m of ml) d += piFermion(Q, m); return (1 - d) / ALPHA; };
  const alphaS = (Q) => 1 / (1 / aS + b0 / DEUX_PI * lnD(Q / MZ));
  for (let i = 0; i < n0; i++) {
    const l = n0 === 1 ? P.log10Qmax : P.log10Qmin + (P.log10Qmax - P.log10Qmin) * i / (n0 - 1), Q = expD(l * LN10);
    brut[3 * i] = l; brut[3 * i + 1] = invAlpha(Q); brut[3 * i + 2] = 0;
  }
  const lmin = lnD(3) / LN10;
  for (let i = 0; i < n1; i++) {
    const l = n1 === 1 ? P.log10Qmax : lmin + (P.log10Qmax - lmin) * i / (n1 - 1), Q = expD(l * LN10), o = 3 * (n0 + i);
    brut[o] = l; brut[o + 1] = 1 / alphaS(Q); brut[o + 2] = 1;
  }
  let dMZ = 0; for (const m of ml) dMZ += ALPHA / (3 * PI) * (lnD(MZ * MZ / (m * m)) - 5 / 3);
  let dEsp = 0; for (const m of ml) dEsp += piFermion(MZ, m);
  return { D: 3, brut, film: filmDe([0, n0].slice(0, n1 > 0 ? 2 : 1), n), unite: 'sans objet (courbes)', invariants: {
    deltaAlphaLeptonsMZ: { uneBoucle: dMZ, genreEspace: dEsp, MZ, note: 'Q >> m : (alpha/3pi) sum_l (ln(MZ^2/m_l^2) - 5/3) ; hadrons NON calcules' },
    inverseAlpha: { Q0: invAlpha(expD(P.log10Qmin * LN10)), MZleptons: (1 - dMZ) / ALPHA, alpha0Inverse: 1 / ALPHA },
    alphaS: { MZ: alphaS(MZ), Q10: alphaS(10), Q1000: alphaS(1000), b0, nf, note: 'une boucle, n_f = 5 fixe, Q >= 3 GeV' },
    images: 'image 0 : (log10 Q/GeV, 1/alpha_QED, 0) ; image 1 : (log10 Q/GeV, 1/alpha_s, 1)' } };
}

// ---------- 7 : diffusion Compton (section efficace de Klein-Nishina) ----------
// dsigma/dOmega = (r_e^2/2) P^2 (P + 1/P - sin^2 theta), P = lambda/lambda' = 1/(1 + eps(1 - cos theta)), eps = E/(m_e c^2)
// (forme lue sur https://en.wikipedia.org/wiki/Klein%E2%80%93Nishina_formula) ; r_e et lambda_C : CODATA.
function kn(c, eps) { const P = 1 / (1 + eps * (1 - c)); return P * P * (P + 1 / P - (1 - c * c)); }
function rapportP(c, eps) { return 1 / (1 + eps * (1 - c)); }
function comptonKleinNishina(P, n) {
  const eps = P.energie, re = V_('rayonElectron'), lc = V_('lambdaCompton'), alea = mulberry32(P.graine >>> 0);
  const K = 2000; let I = 0, Iav = 0, fmax = 0;
  for (let i = 0; i <= K; i++) { const c = -1 + 2 * i / K, v = kn(c, eps), w = i === 0 || i === K ? 1 : i % 2 ? 4 : 2; I += w * v; if (v > fmax) fmax = v; }
  I *= 2 / K / 3;
  for (let i = 0; i <= K; i++) { const c = i / K, v = kn(c, eps), w = i === 0 || i === K ? 1 : i % 2 ? 4 : 2; Iav += w * v; }
  Iav *= 1 / K / 3; fmax *= 1.02;
  const brut = new Float64Array(n * 4), lambda = lc / eps; let avant = 0, pire = 0, depasse = 0;
  for (let i = 0; i < n; i++) {
    let c; for (;;) { c = -1 + 2 * alea(); const v = kn(c, eps); if (v > fmax) depasse++; if (alea() * fmax < v) break; }
    const ph = DEUX_PI * alea(), s = Math.sqrt(1 - c * c), Pr = rapportP(c, eps);
    const lp = lambda / Pr, d = Math.abs((lp - lambda) - lc * (1 - c)) / lc; if (d > pire) pire = d;
    if (c > 0) avant++;
    const o = 4 * i; brut[o] = s * cosD(ph); brut[o + 1] = s * sinD(ph); brut[o + 2] = c; brut[o + 3] = Pr;
  }
  return { D: 4, brut, nuage: true, unite: 'sans objet (tirages de directions de diffusion)', invariants: {
    sectionEfficace: { mesure: PI * re * re * I, thomson: 8 * PI * re * re / 3, unite: 'm^2' },
    decalageCompton: { pireEcart: pire, lambda, unite: 'ecart relatif a lambda_C (1 - cos theta)' },
    avant: { fraction: avant / n, theorie: Iav / I, sigma: Math.sqrt(Math.max(1e-12, Iav / I * (1 - Iav / I)) / n) },
    echantillonnage: { depassementsDuMax: depasse } } };
}

// ---------- 8 : atomes (orbitales hydrogenoides a charge effective de Slater, remplissage de Madelung) ----------
// Regles de Slater lues sur https://en.wikipedia.org/wiki/Slater%27s_rules : 0.35 par autre electron du meme groupe (0.30 en 1s) ;
//   [ns, np] : 0.85 par electron de nombre quantique n-1, 1.00 par electron de n-2 ou moins ; [nd] : 1.00 par electron plus proche.
// Raies : 1/lambda = R Z^2 (1/n1^2 - 1/n2^2), R_H = R_inf / (1 + m_e/m_p) pour Z = 1 (vide), R_inf pour Z > 1 (noyau infini).
const RYDBERG = V_('rydberg'); /* R_inf, SOURCES.rydberg (https://physics.nist.gov/cgi-bin/cuu/Value?ryd, 10 973 731.568 157(12) m^-1) */
const SOUS_COUCHES = [[1, 0, 2], [2, 0, 2], [2, 1, 6], [3, 0, 2], [3, 1, 6], [4, 0, 2], [3, 2, 10], [4, 1, 6]]; // ordre de Madelung jusqu a Z = 36
const GROUPES = ['1s', '2sp', '3sp', '3d', '4sp'];
const groupeDe = (nn, l) => (l === 2 ? nn + 'd' : nn === 1 ? '1s' : nn + 'sp');
function configuration(Z) {
  const conf = []; let reste = Z;
  for (const [nn, l, cap] of SOUS_COUCHES) { if (reste <= 0) break; const k = Math.min(cap, reste); conf.push({ n: nn, l, k }); reste -= k; }
  return conf;
}
function slater(Z) {
  const conf = configuration(Z), compte = {}, parN = {};
  for (const s of conf) { const g = groupeDe(s.n, s.l); compte[g] = (compte[g] || 0) + s.k; parN[s.n] = (parN[s.n] || 0) + s.k; }
  const zeff = {};
  for (const g of Object.keys(compte)) {
    const nn = Number(g[0]), autres = compte[g] - 1; let s;
    if (g === '1s') s = 0.30 * autres;
    else if (g.endsWith('sp')) { s = 0.35 * autres + 0.85 * (parN[nn - 1] || 0); for (let k = 1; k <= nn - 2; k++) s += 1.00 * (parN[k] || 0); }
    else { s = 0.35 * autres; for (const g2 of GROUPES) { if (g2 === g) break; s += 1.00 * (compte[g2] || 0); } }
    zeff[g] = { ecran: s, Zeff: Z - s };
  }
  return { conf, zeff };
}
function laguerre(k, al, x) { if (k === 0) return 1; let a = 1, b = 1 + al - x; for (let j = 1; j < k; j++) { const c = ((2 * j + 1 + al - x) * b - (j + al) * a) / (j + 1); a = b; b = c; } return b; }
function legendre2(l, m, x) { /* (P_l^m(x))^2, m >= 0 (copie de tam-physique.js) */
  let pmm = 1; for (let i = 1; i <= m; i++) pmm *= (2 * i - 1);
  const w = 1 - x * x; let pw = 1; for (let i = 0; i < m; i++) pw *= w;
  if (l === m) return pmm * pmm * pw;
  let a = pmm, b = x * (2 * m + 1) * pmm;
  for (let ll = m + 2; ll <= l; ll++) { const c = (x * (2 * ll - 1) * b - (ll + m - 1) * a) / (ll - m); a = b; b = c; }
  return b * b * pw;
}
function raies(Z) {
  const R = Z === 1 ? RYDBERG / (1 + 1 / V_('mpSurMe')) : RYDBERG, l = (n1, n2) => 1e9 / (R * Z * Z * (1 / (n1 * n1) - 1 / (n2 * n2)));
  const lyman = [], balmer = []; for (let k = 2; k <= 6; k++) lyman.push(l(1, k)); for (let k = 3; k <= 7; k++) balmer.push(l(2, k));
  return { lymanAlpha: lyman[0], balmerAlpha: balmer[0], lyman, balmer, unite: 'nm (vide)', R };
}
function atomes(P, n) {
  const Z = P.Z, { conf, zeff } = slater(Z), alea = mulberry32(P.graine >>> 0);
  const electrons = [];
  for (const s of conf) { const ms = [0]; for (let q = 1; q <= s.l; q++) ms.push(q, -q); for (let e = 0; e < s.k; e++) electrons.push({ n: s.n, l: s.l, m: Math.abs(ms[e % (2 * s.l + 1)]), g: groupeDe(s.n, s.l) }); }
  const debuts = decouper(n, Math.min(electrons.length, n)), film = filmDe(debuts, n), brut = new Float64Array(n * 4);
  const maxi = new Map(), stats = {};
  for (let ie = 0; ie < debuts.length; ie++) {
    const el = electrons[ie], N = el.n, l = el.l, Ze = zeff[el.g].Zeff, Rmax = N * (6 * N + 10), cle = N + ',' + l + ',' + el.m;
    const radial = (r) => { const rho = 2 * r / N; let p = 1; for (let i = 0; i < l; i++) p *= rho; const R = p * expD(-rho / 2) * laguerre(N - l - 1, 2 * l + 1, rho); return r * r * R * R; };
    if (!maxi.has(cle)) { let pr = 0, pa = 0; for (let i = 0; i <= 2000; i++) { const v = radial(Rmax * i / 2000); if (v > pr) pr = v; } for (let i = 0; i <= 2000; i++) { const v = legendre2(l, el.m, -1 + i / 1000); if (v > pa) pa = v; } maxi.set(cle, [pr * 1.02, pa * 1.02]); }
    const [pr, pa] = maxi.get(cle), cle2 = N + '' + 'spdf'[l], st = stats[cle2] || (stats[cle2] = { somme: 0, compte: 0, theorie: (3 * N * N - l * (l + 1)) / (2 * Ze), Zeff: Ze });
    for (let r = 0; r < film.tailles[ie]; r++) {
      let rr, x;
      for (;;) { rr = Rmax * alea(); if (alea() * pr < radial(rr)) break; }
      for (;;) { x = -1 + 2 * alea(); if (alea() * pa < legendre2(l, el.m, x)) break; }
      const ph = DEUX_PI * alea(), s = Math.sqrt(1 - x * x), R = rr / Ze, o = (film.debuts[ie] + r) * 4;
      brut[o] = R * s * cosD(ph); brut[o + 1] = R * s * sinD(ph); brut[o + 2] = R * x; brut[o + 3] = N + l / 10;
      st.somme += R; st.compte++;
    }
  }
  const rayons = {}; for (const k of Object.keys(stats)) { const s = stats[k]; rayons[k] = { mesure: s.somme / s.compte, theorie: s.theorie, Zeff: s.Zeff, points: s.compte }; }
  return { D: 4, brut, film, nuage: true, unite: 'sans objet (nuage de probabilite, pas des trajectoires)', invariants: {
    slater: zeff, configuration: conf.map((s) => s.n + 'spdf'[s.l] + s.k).join(' '), rayonsMoyens: rayons, raies: raies(Z),
    note: 'rayons en rayons de Bohr ; quatrieme colonne = n + l/10 de l electron' } };
}

// ---------- 9 : quarks (charmonium, potentiel de Cornell, corde de couleur et sa cassure) ----------
// Barnes, Godfrey, Swanson (hep-ph/0505002) Eq. (1) : V = -(4/3) alpha_s / r + b r + (32 pi alpha_s / (9 m_c^2)) delta_sigma(r) S_c.S_cbar,
//   delta_sigma(r) = (sigma/sqrt(pi))^3 e^{-sigma^2 r^2} ; S.S = 1/4 (triplet, J/psi et psi(2S)). Hamiltonien NR, mu = m_c/2.
const coulomb = (r, as) => -(4 / 3) * as / r;
function quarks(P, n) {
  const as = V_('bgsAlphaS'), b = V_('bgsB'), mc = V_('bgsMc'), sg = V_('bgsSigma'), mu = mc / 2;
  const hf = 32 * PI * as / (9 * mc * mc) * (sg / Math.sqrt(PI)) * (sg / Math.sqrt(PI)) * (sg / Math.sqrt(PI)) * 0.25;
  const Vc = (r) => coulomb(r, as) + b * r;
  const Rmax = 25, NG = 5000, h = Rmax / NG, Vg = new Float64Array(NG + 1);
  for (let i = 1; i <= NG; i++) { const r = i * h; Vg[i] = Vc(r) + hf * expD(-sg * sg * r * r); }
  /* Numerov pour u'' = 2 mu (V - E) u, u(0) = 0 ; rend le nombre de noeuds */
  const noeuds = (E) => {
    let u0 = 0, u1 = h, nds = 0; const c = h * h / 12;
    let k0 = 0, k1 = 2 * mu * (Vg[1] - E);
    for (let i = 1; i < NG; i++) {
      const k2 = 2 * mu * (Vg[i + 1] - E), u2 = (2 * u1 * (1 + 5 * c * k1) - u0 * (1 - c * k0)) / (1 - c * k2);
      if ((u2 < 0 && u1 > 0) || (u2 > 0 && u1 < 0)) nds++;
      u0 = u1; u1 = u2; k0 = k1; k1 = k2;
      if (Math.abs(u1) > 1e250) break;
    }
    return nds;
  };
  const etat = (nu) => { let lo = -2, hi = 4; for (let it = 0; it < 64; it++) { const mid = 0.5 * (lo + hi); if (noeuds(mid) > nu) hi = mid; else lo = mid; } return 0.5 * (lo + hi); };
  const M1 = (2 * mc + etat(0)) * 1000, M2 = (2 * mc + etat(1)) * 1000;
  /* cassure : la corde (energie statique 2 m_c + V(r)) atteint deux mesons D (2 m_D0) */
  const seuil = 2 * V_('mD0MeV') / 1000 - 2 * mc; let lo = 0.5, hi = 30;
  for (let it = 0; it < 80; it++) { const mid = 0.5 * (lo + hi); if (Vc(mid) > seuil) hi = mid; else lo = mid; }
  const rb = 0.5 * (lo + hi), rbFm = rb * HBARC_GEV_FM, penteLongue = (Vc(24) - Vc(20)) / 4;
  /* film : la paire s ecarte de 0.2 fm a la cassure ; la corde = nuage le long de l axe (largeur 0.15 fm ILLUSTRATIVE, non calculee) */
  const K = P.images, debuts = decouper(n, Math.min(K + 1, n)), film = filmDe(debuts, n), brut = new Float64Array(n * 4), alea = mulberry32(P.graine >>> 0), w = 0.15;
  for (let k = 0; k < debuts.length; k++) {
    const casse = k === K, rf = casse ? rbFm : 0.2 + (rbFm - 0.2) * k / Math.max(1, K - 1), E = casse ? seuil : Vc(rf / HBARC_GEV_FM);
    for (let r = 0; r < film.tailles[k]; r++) {
      let x = rf * (alea() - 0.5);
      if (casse) { const L = 0.3; x = alea() < 0.5 ? -rf / 2 - 0.3 + L * alea() : rf / 2 + 0.3 - L * alea(); }
      const o = (film.debuts[k] + r) * 4; brut[o] = x; brut[o + 1] = w * gaussien(alea); brut[o + 2] = w * gaussien(alea); brut[o + 3] = E;
    }
  }
  return { D: 4, brut, film, unite: 'sans objet (modele de potentiel, film de la corde)', invariants: {
    spectre: { JPsi: M1, psi2S: M2, ecart: M2 - M1, unite: 'MeV', modele: 'BGS NR (hep-ph/0505002), hyperfin dans le hamiltonien' },
    cassure: { rayonFm: rbFm, rayonGeV: rb, energie: Vc(rb), seuil, sousSeuil2S: M2 / 1000 < 2 * V_('mD0MeV') / 1000 },
    penteLongue: { mesure: penteLongue, b, unite: 'GeV^2 (dV/dr entre 4 et 5 fm)' }, hbarcGeVfm: HBARC_GEV_FM,
    note: 'x en fm ; quatrieme colonne = energie de la corde V(r) en GeV ; image finale = apres cassure (deux mesons)' } };
}

// ---------- catalogue ----------
const QFT = 'Quantum field theory';
export const SYSTEMES = Object.freeze([
  { id: 'champLibre', nom: 'Free quantum field: a wave packet', science: QFT, D: 3, params: { m: 0.5, k0: 1.2, largeur: 10, duree: 80 }, bornes: { m: [0.1, 2], k0: [0.2, 2.5], largeur: [4, 16], duree: [20, 100] },
    phrase: 'A visualisation of the equations of a free Klein-Gordon field on a periodic 1-D lattice of 256 sites (lattice spacing 1, natural units), treated as a classical field and stepped with a symplectic leapfrog: a localised wave packet travels at its group velocity and spreads, shown as a film of field snapshots.' },
  { id: 'fluctuationsVide', nom: 'The quantum vacuum of a free field', science: QFT, D: 3, params: { m: 0.3, echantillons: 3000, graine: 1 }, bornes: { m: [0.05, 2], echantillons: [500, 6000], graine: [1, 1000000] },
    phrase: 'A visualisation of the exact Gaussian ground state of a free scalar field on a 64-site periodic lattice (natural units, each mode variance 1/(2 omega_k)): every frame is an independent random sample of the vacuum probability distribution, not motion of the field.' },
  { id: 'interactionChamps', nom: 'Two interacting fields (preheating)', science: QFT, D: 4, params: { g: 1, Phi: 1, duree: 160, graine: 1 }, bornes: { g: [0.8, 1.4], Phi: [0.8, 1.2], duree: [60, 240], graine: [1, 1000000] },
    phrase: 'A visualisation of the classical-field approximation of a quantum process: an oscillating phi condensate coupled to a second field chi through g^2 phi^2 chi^2 / 2 on a 1-D lattice (natural units, phi mass 1) pumps energy into chi by parametric resonance in the Mathieu instability band.' },
  { id: 'paireSchwinger', nom: 'Pairs torn out of the vacuum (Schwinger effect)', science: QFT, D: 4, params: { champ: 0.5, paires: 40, duree: 10, graine: 1 }, bornes: { champ: [0.05, 3], paires: [5, 150], duree: [2, 30], graine: [1, 1000000] },
    phrase: 'A visualisation of the one-loop Schwinger rate for electron-positron pair creation in a constant electric field (field in units of the critical field m^2 c^3/(e hbar), natural units): the pairs drawn are an illustrative sample, each pair appears at rest and its two particles are pushed apart along exact relativistic Lorentz-force worldlines.' },
  { id: 'effetUnruh', nom: 'An accelerated observer sees a warm vacuum (Unruh effect)', science: QFT, D: 4, nuage: true, params: { log10a: 0, tauMax: 3, graine: 1 }, bornes: { log10a: [0, 22], tauMax: [1, 5], graine: [1, 1000000] },
    phrase: 'A visualisation of the Unruh formula T = hbar a / (2 pi c k_B): the hyperbolic worldline of constant proper acceleration (units c = a = 1) carrying quanta drawn from the thermal Planck spectrum the accelerated observer would detect; the temperature for the chosen acceleration is computed in kelvin from CODATA constants.' },
  { id: 'couplageCourant', nom: 'Running coupling constants', science: QFT, D: 3, params: { log10Qmin: -4, log10Qmax: 3 }, bornes: { log10Qmin: [-4.5, -1], log10Qmax: [2, 4] },
    phrase: 'A visualisation of the one-loop perturbative running of the electromagnetic coupling from the vacuum polarisation of the three charged leptons (hadrons not computed), and of the strong coupling at one loop with five flavours from its measured value at the Z mass, against the momentum scale Q in GeV.' },
  { id: 'comptonKleinNishina', nom: 'A photon scattering off an electron (Compton)', science: QFT, D: 4, nuage: true, params: { energie: 0.5, graine: 1 }, bornes: { energie: [0.001, 20], graine: [1, 1000000] },
    phrase: 'A visualisation of the lowest-order QED (Klein-Nishina) cross-section for unpolarised photons scattering off a free electron at rest: scattering directions sampled on the unit sphere for a photon energy given in units of the electron rest energy, the fourth column being the energy fraction kept.' },
  { id: 'atomes', nom: 'Electron clouds of atoms', science: QFT, D: 4, nuage: true, params: { Z: 26, graine: 1 }, bornes: { Z: [1, 36], graine: [1, 1000000] },
    phrase: 'A visualisation of hydrogen-like (one-electron) orbitals filled shell by shell in Madelung order up to krypton, each with an effective nuclear charge from Slater\'s screening rules, which is only an approximation of multi-electron atoms; the emission lines come from the Rydberg formula with the CODATA Rydberg constant.' },
  { id: 'quarks', nom: 'Quark confinement and string breaking', science: QFT, D: 4, params: { images: 10, graine: 1 }, bornes: { images: [4, 20], graine: [1, 1000000] },
    phrase: 'A visualisation of a phenomenological potential model of QCD, not lattice QCD: a charm quark and antiquark bound by the Cornell potential (Coulomb plus linear string, parameters of Barnes, Godfrey and Swanson 2005), the charmonium levels solved from the radial Schrodinger equation, and the colour string drawn as an illustrative cloud until it breaks into two D mesons.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
const ENTIERS = { fluctuationsVide: ['echantillons', 'graine'], interactionChamps: ['graine'], paireSchwinger: ['paires', 'graine'], effetUnruh: ['graine'],
  comptonKleinNishina: ['graine'], atomes: ['Z', 'graine'], quarks: ['images', 'graine'] };
const FONCTIONS = { champLibre, fluctuationsVide, interactionChamps, paireSchwinger, effetUnruh, couplageCourant, comptonKleinNishina, atomes, quarks };
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
