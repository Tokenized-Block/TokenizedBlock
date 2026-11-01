// tam-quantique.js -- TAM, la vue QUANTIQUE : huit systemes de mecanique quantique, calcules par leur formule
//   (developpement exact sur les etats propres, quadrature, ou application de Floquet exacte) puis tires en NUAGES.
//
// VUE SEULEMENT : rien ici ne se frappe (le contrat deploye n accepte que les familles 1..16 de tam-moteur.js).
// Sortie de simuler() = la forme de tam-physique.js#simuler : { params, D, n, bornee, nuage, brut (Float64Array n*D, ligne par
//   ligne), lyapunov: null, uniteLyapunov, points: null, invariants } -> la vue 3-D les dessine sans changement.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun Math.random (mulberry32 a graine). sin/cos/ln = ceux du moteur,
//   exp = expD ci-dessous (meme fonction que tam-physique.js) : octets identiques d un moteur JS a l autre.
// Unites : hbar = m = 1 partout (et L = 1, omega = 1, e = 1 la ou il le faut).
// Invariants : chaque verification = { debut: valeur theorique, fin: valeur mesuree, derive: ecart, ... } ;
//   un nuage n est JAMAIS une trajectoire : ce sont des tirages de |psi|^2 (ou de probabilites quantiques).
// Ce qui DEJA existe ailleurs n est pas refait ici : orbitales de l hydrogene, spin de Bloch/Rabi, paquet dans un puits
//   harmonique, fentes d Young, boite 3-D (tam-sciences / tam-physique) ; effet tunnel et superposition 1s+2p (tam-invisible).
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = 3.141592653589793, DEUX_PI = 6.283185307179586, LN2 = 0.6931471805599453;
const S2 = 0.7071067811865476, PI_M14 = 0.7511255444649425; // 1/sqrt(2), pi^(-1/4)
const NUAGE = 'sans objet (nuage de probabilite, pas une trajectoire)';

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
/* gaussienne centree reduite (Box-Muller, lnD/cosD du moteur) */
function gauss(alea) { let u = alea(); if (u < 1e-300) u = 1e-300; return Math.sqrt(-2 * lnD(u)) * cosD(DEUX_PI * alea()); }
/* premier indice i de cum[o..o+m) tel que cum[o+i] > u * total (cum croissante, cum[o+m-1] = total) */
function tirerIndice(cum, o, m, u) {
  const cible = u * cum[o + m - 1]; let lo = 0, hi = m - 1;
  while (lo < hi) { const mi = (lo + hi) >> 1; if (cum[o + mi] <= cible) lo = mi + 1; else hi = mi; }
  return lo;
}

// ---------- 1 : tapis de Talbot (puits infini 1-D, paquet gaussien, developpement exact) ----------
// phi_k(x) = sqrt(2/L) sin(k pi x / L), E_k = (hbar k pi / L)^2 / (2 m). E_k T_rev / hbar = 2 pi k^2 -> retour complet ;
// a T_rev/2 la phase vaut (-1)^k et (-1)^k phi_k(x) = -phi_k(L - x) : image miroir exacte.
// Grille de points milieux : les sinus discrets (DST-II) sont orthogonaux, la projection est exacte sur la grille.
const TALBOT = Object.freeze({ L: 1, MASSE: 1, HBAR: 1, K: 100, NX: 400, NT: 128 });
function tapisTalbot(c, n) {
  const { L, MASSE, HBAR, K, NX, NT } = TALBOT, alea = mulberry32(c.graine >>> 0);
  const tRev = 4 * MASSE * L * L / (PI * HBAR);
  const dx = L / NX, s2L = Math.sqrt(2 / L);
  const p0r = new Float64Array(NX), p0i = new Float64Array(NX);
  let q = 0;
  for (let j = 0; j < NX; j++) {
    const x = (j + 0.5) * dx, d = x - c.x0 * L, g = expD(-d * d / (4 * c.sigma * c.sigma));
    p0r[j] = g * cosD(c.k0 * x); p0i[j] = g * sinD(c.k0 * x); q += g * g * dx;
  }
  q = 1 / Math.sqrt(q); for (let j = 0; j < NX; j++) { p0r[j] *= q; p0i[j] *= q; }
  /* modes sur la grille, recurrence de Tchebychev sin((k+1) u) = 2 cos u sin(k u) - sin((k-1) u) */
  const phi = new Float64Array(K * NX);
  for (let j = 0; j < NX; j++) {
    const u = PI * (j + 0.5) / NX, c2 = 2 * cosD(u); let a = 0, b = sinD(u);
    for (let k = 0; k < K; k++) { phi[k * NX + j] = s2L * b; const s = c2 * b - a; a = b; b = s; }
  }
  const cr = new Float64Array(K), ci = new Float64Array(K), E = new Float64Array(K); let poids = 0;
  for (let k = 0; k < K; k++) {
    let sr = 0, si = 0; const o = k * NX;
    for (let j = 0; j < NX; j++) { sr += phi[o + j] * p0r[j]; si += phi[o + j] * p0i[j]; }
    cr[k] = sr * dx; ci[k] = si * dx; poids += cr[k] * cr[k] + ci[k] * ci[k];
    const kn = (k + 1) * PI * HBAR / L; E[k] = kn * kn / (2 * MASSE);
  }
  const er = new Float64Array(NX), ei = new Float64Array(NX), ar = new Float64Array(K), ai = new Float64Array(K);
  const etat = (t) => { /* psi(x_j, t) = sum_k c_k e^{-i E_k t / hbar} phi_k(x_j) */
    for (let k = 0; k < K; k++) { const ph = E[k] * t / HBAR, cc = cosD(ph), ss = sinD(ph); ar[k] = cr[k] * cc + ci[k] * ss; ai[k] = ci[k] * cc - cr[k] * ss; }
    er.fill(0); ei.fill(0);
    for (let k = 0; k < K; k++) {
      const a = ar[k], b = ai[k], o = k * NX; if (a * a + b * b < 1e-30) continue;
      for (let j = 0; j < NX; j++) { er[j] += a * phi[o + j]; ei[j] += b * phi[o + j]; }
    }
  };
  /* |<psi0 | psi(t)>|^2 (miroir : psi0 lu en L - x) */
  const recouvrement = (miroir) => {
    let sr = 0, si = 0;
    for (let j = 0; j < NX; j++) { const jj = miroir ? NX - 1 - j : j, ur = p0r[jj], ui = p0i[jj]; sr += ur * er[j] + ui * ei[j]; si += ur * ei[j] - ui * er[j]; }
    sr *= dx; si *= dx; return sr * sr + si * si;
  };
  const cum = new Float64Array(NT * NX), dens = new Float64Array(NT * NX), tR = new Float64Array(NT); let normeEcart = 0;
  for (let r = 0; r < NT; r++) {
    const t = c.duree * tRev * r / (NT - 1); tR[r] = t; etat(t);
    let s = 0; const o = r * NX;
    for (let j = 0; j < NX; j++) { const v = er[j] * er[j] + ei[j] * ei[j]; dens[o + j] = v; s += v; cum[o + j] = s; }
    normeEcart = Math.max(normeEcart, Math.abs(s * dx - poids));
  }
  etat(tRev); const R1 = recouvrement(false);
  etat(tRev / 2); const R2 = recouvrement(true), R2d = recouvrement(false);
  etat(tRev / 4); const R4 = recouvrement(false);
  const brut = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = Math.min(NT - 1, Math.floor(alea() * NT)), j = tirerIndice(cum, r * NX, NX, alea());
    brut[3 * i] = (j + alea()) * dx; brut[3 * i + 1] = tR[r] / tRev; brut[3 * i + 2] = dens[r * NX + j];
  }
  return { brut, invariants: {
    revivalComplete: { debut: 1, fin: R1, derive: Math.abs(1 - R1), temps: tRev, formule: '4 m L^2 / (pi hbar)' },
    revivalMiroir: { debut: 1, fin: R2, derive: Math.abs(1 - R2), temps: tRev / 2, recouvrementDirect: R2d },
    quartDeRevival: { fin: R4, temps: tRev / 4 },
    poidsModes: { debut: 1, fin: poids, derive: Math.abs(1 - poids), modes: K },
    norme: { debut: poids, derive: normeEcart },
  } };
}

// ---------- 2 : etats propres de l oscillateur harmonique ----------
// u_n(xi) = H_n(xi) e^{-xi^2/2} / sqrt(2^n n! sqrt(pi)) par la recurrence de Hermite NORMALISEE
//   u_{k+1} = sqrt(2/(k+1)) xi u_k - sqrt(k/(k+1)) u_{k-1}  (= H_{k+1} = 2 xi H_k - 2 k H_{k-1}, sans debordement).
// psi_n(x) = (m omega / hbar)^{1/4} u_n(sqrt(m omega / hbar) x) ; <x^2> = (n + 1/2) hbar / (m omega).
function hermiteNorme(N, xi) {
  let p0 = PI_M14 * expD(-xi * xi / 2); if (N === 0) return p0;
  let p1 = Math.sqrt(2) * xi * p0;
  for (let k = 1; k < N; k++) { const p2 = Math.sqrt(2 / (k + 1)) * xi * p1 - Math.sqrt(k / (k + 1)) * p0; p0 = p1; p1 = p2; }
  return p1;
}
function oscillateurEtats(c, n) {
  const HBAR = 1, MASSE = 1, N = c.n, w = c.omega, alea = mulberry32(c.graine >>> 0);
  const s = Math.sqrt(MASSE * w / HBAR), f = Math.sqrt(s);
  const psi = (x) => f * hermiteNorme(N, s * x);
  const X = (Math.sqrt(2 * N + 1) + 6) / s, NQ = 4001, h = 2 * X / (NQ - 1);
  let norme = 0, x2 = 0, rmax = 0, noeuds = 0, signe = 0, amax = 0;
  const tab = new Float64Array(NQ);
  for (let i = 0; i < NQ; i++) { const v = psi(-X + i * h); tab[i] = v; if (Math.abs(v) > amax) amax = Math.abs(v); }
  for (let i = 0; i < NQ; i++) {
    const x = -X + i * h, v = tab[i], r = v * v, wq = i === 0 || i === NQ - 1 ? 0.5 : 1;
    norme += wq * r * h; x2 += wq * r * x * x * h; if (r > rmax) rmax = r;
    if (Math.abs(v) > 1e-10 * amax) { const sg = v > 0 ? 1 : -1; if (signe && sg !== signe) noeuds++; signe = sg; }
  }
  const borne = rmax * 1.02, brut = new Float64Array(n * 3); let tirages = 0, depasse = 0, x2e = 0;
  for (let i = 0; i < n; i++) {
    let x, u, v;
    for (;;) { tirages++; x = -X + 2 * X * alea(); v = psi(x); const r = v * v; if (r > borne) depasse++; u = borne * alea(); if (u < r) break; }
    brut[3 * i] = x; brut[3 * i + 1] = u; brut[3 * i + 2] = v; x2e += x * x;
  }
  const theorie = (N + 0.5) * HBAR / (MASSE * w);
  return { brut, invariants: {
    normalisation: { debut: 1, fin: norme, derive: Math.abs(norme - 1) },
    x2Quadrature: { debut: theorie, fin: x2, derive: Math.abs(x2 - theorie) / theorie },
    x2Echantillon: { debut: theorie, fin: x2e / n, derive: Math.abs(x2e / n - theorie) / theorie },
    noeuds: { debut: N, fin: noeuds, derive: Math.abs(noeuds - N) },
    echantillonnage: { tirages, depassementsDuMax: depasse },
  } };
}

// ---------- 3 : fonction de Wigner d un chat de Schrodinger (deux etats coherents) ----------
// psi(x) = N [g(x - q0) + e^{i phase} g(x + q0)], g(u) = pi^{-1/4} e^{-u^2/2}, N^2 = 1 / (2 (1 + cos(phase) e^{-q0^2})).
// W(x, p) = (1/pi) int psi*(x + y) psi(x - y) e^{2 i p y} dy, quadrature des trapezes (pas 0.1 : integrande gaussien).
const WIG_H = 0.1;
function wignerChat(c, n) {
  const q = c.q0, cph = cosD(c.phase), sph = sinD(c.phase), alea = mulberry32(c.graine >>> 0);
  const Nn = Math.sqrt(1 / (2 * (1 + cph * expD(-q * q))));
  const psi = (x, o, k) => {
    const a = PI_M14 * expD(-(x - q) * (x - q) / 2), b = PI_M14 * expD(-(x + q) * (x + q) / 2);
    o[k] = Nn * (a + cph * b); o[k + 1] = Nn * sph * b;
  };
  const H = WIG_H, M = Math.ceil((q + 6) / H), NY = 2 * M + 1;
  const fr = new Float64Array(2 * NY), fl = new Float64Array(2 * NY);
  const integrer = (p) => { /* fr[j] = psi(x + y_j), fl[j] = psi(x - y_j), y_j = (j - M) H */
    const cw = cosD(2 * p * H), sw = sinD(2 * p * H); let er = cosD(-2 * p * M * H), ei = sinD(-2 * p * M * H), s = 0;
    for (let j = 0; j < NY; j++) {
      const ar = fr[2 * j], ai = -fr[2 * j + 1], br = fl[2 * j], bi = fl[2 * j + 1];
      const zr = ar * br - ai * bi, zi = ar * bi + ai * br; s += zr * er - zi * ei;
      const t = er * cw - ei * sw; ei = er * sw + ei * cw; er = t;
    }
    return s * H / PI;
  };
  /* table de psi aux multiples de H (grille alignee : x = i H, x +- y_j retombent sur la table) */
  const XG = q + 5, IX = Math.ceil(XG / H), KT = IX + M + 2, tab = new Float64Array(2 * (2 * KT + 1));
  for (let k = -KT; k <= KT; k++) psi(k * H, tab, 2 * (k + KT));
  const remplirGrille = (i) => {
    for (let j = 0; j < NY; j++) {
      const a = 2 * (i + (j - M) + KT), b = 2 * (i - (j - M) + KT);
      fr[2 * j] = tab[a]; fr[2 * j + 1] = tab[a + 1]; fl[2 * j] = tab[b]; fl[2 * j + 1] = tab[b + 1];
    }
  };
  /* integrale totale, marges en p (= |psi(x)|^2), minimum : grille dx = dp = 0.2, p dans [-6, 6] */
  const DX = 2, DP = 0.2, NP = 61; let total = 0, ecartMarge = 0, minW = Infinity, xMin = 0, pMin = 0;
  for (let i = -IX - (IX % 2); i <= IX; i += DX) {
    remplirGrille(i); let marge = 0;
    for (let kp = 0; kp < NP; kp++) { const p = -6 + kp * DP, W = integrer(p); marge += W * DP; if (W < minW) { minW = W; xMin = i * H; pMin = p; } }
    const a = 2 * (i + KT), rho = tab[a] * tab[a] + tab[a + 1] * tab[a + 1];
    ecartMarge = Math.max(ecartMarge, Math.abs(marge - rho)); total += marge * DX * H;
  }
  const brut = new Float64Array(n * 3), XC = q + 3, PC = 3.5;
  for (let i = 0; i < n; i++) {
    const x = -XC + 2 * XC * alea(), p = -PC + 2 * PC * alea();
    for (let j = 0; j < NY; j++) { psi(x + (j - M) * H, fr, 2 * j); psi(x - (j - M) * H, fl, 2 * j); }
    const W = integrer(p); brut[3 * i] = x; brut[3 * i + 1] = p; brut[3 * i + 2] = W;
    if (W < minW) { minW = W; xMin = x; pMin = p; }
  }
  return { brut, invariants: {
    integrale: { debut: 1, fin: total, derive: Math.abs(total - 1) },
    marges: { debut: 0, fin: ecartMarge, derive: ecartMarge, sens: 'max |int W dp - |psi(x)|^2|' },
    negativite: { fin: minW, x: xMin, p: pMin, negative: minW < 0 },
  } };
}

// ---------- 4 : marche quantique de Hadamard sur une ligne vs marche aleatoire classique ----------
// piece H : |0> -> (|0> + |1>)/sqrt2, |1> -> (|0> - |1>)/sqrt2 ; |0> va a gauche, |1> a droite ; depart (|0> + i|1>)/sqrt2 en 0.
// ecart-type quantique ~ sqrt(1 - 1/sqrt2) t = 0.5412 t (balistique) ; classique sqrt(t) exactement.
function marcheQuantique(c, n) {
  const T = c.pas, L = 2 * T + 1, alea = mulberry32(c.graine >>> 0);
  let ar = new Float64Array(L), ai = new Float64Array(L), br = new Float64Array(L), bi = new Float64Array(L);
  let nar = new Float64Array(L), nai = new Float64Array(L), nbr = new Float64Array(L), nbi = new Float64Array(L);
  ar[T] = S2; bi[T] = S2;
  let pc = new Float64Array(L), npc = new Float64Array(L); pc[T] = 1;
  const Pq = new Float64Array((T + 1) * L), Pc = new Float64Array((T + 1) * L), cum = new Float64Array((T + 1) * L);
  const sq = new Float64Array(T + 1), sc = new Float64Array(T + 1); let sommeEcart = 0;
  Pq[T] = 1; Pc[T] = 1;
  for (let t = 1; t <= T; t++) {
    nar.fill(0); nai.fill(0); nbr.fill(0); nbi.fill(0); npc.fill(0);
    for (let j = 0; j < L; j++) {
      const a1 = ar[j], a2 = ai[j], b1 = br[j], b2 = bi[j];
      if (a1 === 0 && a2 === 0 && b1 === 0 && b2 === 0 && pc[j] === 0) continue;
      const ur = (a1 + b1) * S2, ui = (a2 + b2) * S2, vr = (a1 - b1) * S2, vi = (a2 - b2) * S2;
      if (j > 0) { nar[j - 1] += ur; nai[j - 1] += ui; npc[j - 1] += pc[j] / 2; }
      if (j < L - 1) { nbr[j + 1] += vr; nbi[j + 1] += vi; npc[j + 1] += pc[j] / 2; }
    }
    [ar, nar] = [nar, ar]; [ai, nai] = [nai, ai]; [br, nbr] = [nbr, br]; [bi, nbi] = [nbi, bi]; [pc, npc] = [npc, pc];
    let s = 0, m1 = 0, m2 = 0, c1 = 0, c2 = 0; const o = t * L;
    for (let j = 0; j < L; j++) {
      const x = j - T, P = ar[j] * ar[j] + ai[j] * ai[j] + br[j] * br[j] + bi[j] * bi[j];
      Pq[o + j] = P; Pc[o + j] = pc[j]; s += P; cum[o + j] = s; m1 += P * x; m2 += P * x * x; c1 += pc[j] * x; c2 += pc[j] * x * x;
    }
    sommeEcart = Math.max(sommeEcart, Math.abs(s - 1));
    sq[t] = Math.sqrt(Math.max(0, m2 / s - (m1 / s) * (m1 / s))); sc[t] = Math.sqrt(Math.max(0, c2 - c1 * c1));
  }
  /* pente par moindres carres de sigma_q(t) sur t dans [T/2, T] ; exposants log-log entre T/2 et T */
  const t2 = Math.floor(T / 2); let St = 0, Ss = 0, Stt = 0, Sts = 0, k = 0;
  for (let t = t2; t <= T; t++) { St += t; Ss += sq[t]; Stt += t * t; Sts += t * sq[t]; k++; }
  const pente = (k * Sts - St * Ss) / (k * Stt - St * St);
  const expQ = lnD(sq[T] / sq[t2]) / lnD(T / t2), expC = lnD(sc[T] / sc[t2]) / lnD(T / t2);
  const limite = Math.sqrt(1 - S2);
  const brut = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = 1 + Math.min(T - 1, Math.floor(alea() * T)), j = tirerIndice(cum, t * L, L, alea());
    brut[4 * i] = j - T; brut[4 * i + 1] = t; brut[4 * i + 2] = Pq[t * L + j]; brut[4 * i + 3] = Pc[t * L + j];
  }
  return { brut, invariants: {
    sommeProbabilites: { debut: 1, derive: sommeEcart },
    penteQuantique: { debut: limite, fin: pente, derive: Math.abs(pente - limite), sens: 'd sigma / d t sur [T/2, T]' },
    exposantQuantique: { debut: 1, fin: expQ, derive: Math.abs(expQ - 1) },
    exposantClassique: { debut: 0.5, fin: expC, derive: Math.abs(expC - 0.5) },
    ecartTypeFinal: { quantique: sq[T], classique: sc[T], racineT: Math.sqrt(T) },
  } };
}

// ---------- 5 : correlations de Bell d une paire singulet, CHSH ----------
// regle quantique : P(resultats opposes | a, b) = cos^2((a - b)/2) -> E(a, b) = -cos(a - b). Tirage SUR UN SEUL ordinateur :
// on reproduit la prediction quantique, ce n est pas une experience de non-localite.
const N_CHSH = 20000;
function bellCHSH(c, n) {
  const alea = mulberry32(c.graine >>> 0);
  const mesurer = (a, b, N) => {
    const cb = cosD((a - b) / 2), pOppose = cb * cb; let s = 0;
    for (let k = 0; k < N; k++) { const A = alea() < 0.5 ? 1 : -1, B = alea() < pOppose ? -A : A; s += A * B; }
    return s / N;
  };
  const brut = new Float64Array(n * 4); let r2 = 0, v2 = 0;
  for (let i = 0; i < n; i++) {
    const a = DEUX_PI * alea(), b = DEUX_PI * alea(), E = mesurer(a, b, c.essais), Eth = -cosD(a - b);
    brut[4 * i] = a; brut[4 * i + 1] = b; brut[4 * i + 2] = E; brut[4 * i + 3] = Eth;
    r2 += (E - Eth) * (E - Eth); v2 += (1 - Eth * Eth) / c.essais;
  }
  const A0 = 0, A1 = PI / 2, B0 = PI / 4, B1 = 3 * PI / 4;
  const S = mesurer(A0, B0, N_CHSH) - mesurer(A0, B1, N_CHSH) + mesurer(A1, B0, N_CHSH) + mesurer(A1, B1, N_CHSH);
  const Sth = -2 * Math.sqrt(2), memeAngle = mesurer(0, 0, 2000);
  return { brut, invariants: {
    chsh: { debut: Sth, fin: S, derive: Math.abs(S - Sth), sigma: Math.sqrt(4 * 0.5 / N_CHSH), bornesLocales: 2, essaisParReglage: N_CHSH },
    memeAngle: { debut: -1, fin: memeAngle, derive: Math.abs(memeAngle + 1) },
    residus: { fin: Math.sqrt(r2 / n), attendu: Math.sqrt(v2 / n), sens: 'rms(E mesure - E formule) vs bruit binomial attendu' },
  } };
}

// ---------- 6 : rotor pulse quantique vs application standard classique ----------
// H = p^2/2 + K cos(theta) sum_n delta(t - n). Classique : p += K sin(theta), theta += p. Quantique (hbar effectif) :
// psi(theta) *= e^{-i (K/hbar) cos theta}, puis c_m *= e^{-i hbar m^2 / 2} en impulsion (p = hbar m), FFT exacte a N etats.
const ROTOR_N = 1024, ROTOR_M = 2000;
function fabriquerFFT(N) {
  let lg = 0; while ((1 << lg) < N) lg++;
  const rev = new Uint32Array(N);
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < lg; b++) if (i & (1 << b)) r |= 1 << (lg - 1 - b); rev[i] = r; }
  const cs = new Float64Array(N / 2), sn = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) { cs[k] = cosD(DEUX_PI * k / N); sn[k] = sinD(DEUX_PI * k / N); }
  return (re, im, signe) => {
    for (let i = 0; i < N; i++) { const r = rev[i]; if (r > i) { let t = re[i]; re[i] = re[r]; re[r] = t; t = im[i]; im[i] = im[r]; im[r] = t; } }
    for (let len = 2; len <= N; len <<= 1) {
      const half = len >> 1, pas = N / len;
      for (let i = 0; i < N; i += len) for (let j = 0; j < half; j++) {
        const wr = cs[j * pas], wi = signe * sn[j * pas], a = i + j, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  };
}
function rotorPulse(c, n) {
  const N = ROTOR_N, M = ROTOR_M, K = c.K, hb = c.hbar, T = c.coups, k = K / hb, alea = mulberry32(c.graine >>> 0);
  const fft = fabriquerFFT(N), mDe = (j) => (j < N / 2 ? j : j - N);
  const re = new Float64Array(N).fill(1), im = new Float64Array(N);
  const kr = new Float64Array(N), ki = new Float64Array(N), lr = new Float64Array(N), li = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    const v = k * cosD(DEUX_PI * j / N); kr[j] = cosD(v); ki[j] = -sinD(v);
    const m = mDe(j), ph = hb * m * m / 2; lr[j] = cosD(ph); li[j] = -sinD(ph);
  }
  const cumQ = new Float64Array((T + 1) * N), p2q = new Float64Array(T + 1), p2c = new Float64Array(T + 1);
  for (let j = 0; j < N; j++) cumQ[j] = 1; // t = 0 : m = 0 avec probabilite 1
  let normeEcart = 0, bord = 0;
  for (let t = 1; t <= T; t++) {
    for (let j = 0; j < N; j++) { const a = re[j], b = im[j]; re[j] = a * kr[j] - b * ki[j]; im[j] = a * ki[j] + b * kr[j]; }
    fft(re, im, -1);
    let s = 0, m2 = 0, bo = 0; const o = t * N;
    for (let j = 0; j < N; j++) {
      const a = re[j] / N, b = im[j] / N; re[j] = a * lr[j] - b * li[j]; im[j] = a * li[j] + b * lr[j];
      const P = a * a + b * b, m = mDe(j); s += P; cumQ[o + j] = s; m2 += P * m * m; if (Math.abs(m) > N / 2 - 64) bo += P;
    }
    p2q[t] = hb * hb * m2; normeEcart = Math.max(normeEcart, Math.abs(s - 1)); bord = Math.max(bord, bo);
    fft(re, im, 1);
  }
  /* ensemble classique : theta uniforme, p = 0 */
  const th = new Float64Array(M), p = new Float64Array(M), histP = new Float64Array((T + 1) * M), histT = new Float64Array((T + 1) * M);
  for (let i = 0; i < M; i++) { th[i] = DEUX_PI * alea(); histT[i] = th[i]; }
  for (let t = 1; t <= T; t++) {
    let s = 0; const o = t * M;
    for (let i = 0; i < M; i++) {
      p[i] += K * sinD(th[i]); th[i] += p[i]; th[i] -= DEUX_PI * Math.floor(th[i] / DEUX_PI);
      histP[o + i] = p[i]; histT[o + i] = th[i]; s += p[i] * p[i];
    }
    p2c[t] = s / M;
  }
  const moy = (v, a, b) => { let s = 0; for (let t = a; t <= b; t++) s += v[t]; return s / (b - a + 1); };
  const q1 = Math.floor(T / 4), q2 = Math.floor(T / 2), q3 = Math.floor(3 * T / 4);
  const rQ = moy(p2q, q3, T) / moy(p2q, q1, q2), rC = moy(p2c, q3, T) / moy(p2c, q1, q2);
  let St = 0, Sp = 0, Stt = 0, Stp = 0; for (let t = 1; t <= T; t++) { St += t; Sp += p2c[t]; Stt += t * t; Stp += t * p2c[t]; }
  const D = (T * Stp - St * Sp) / (T * Stt - St * St);
  const brut = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = 1 + Math.min(T - 1, Math.floor(alea() * T)), j = tirerIndice(cumQ, t * N, N, alea()), ic = Math.min(M - 1, Math.floor(alea() * M));
    brut[4 * i] = t; brut[4 * i + 1] = hb * mDe(j); brut[4 * i + 2] = histP[t * M + ic]; brut[4 * i + 3] = histT[t * M + ic];
  }
  return { brut, invariants: {
    rapportQuantique: { debut: 1, fin: rQ, sens: '<p^2> moyen sur [3T/4, T] / sur [T/4, T/2] ; 1 = sature (localise)' },
    rapportClassique: { debut: 7 / 3, fin: rC, sens: 'meme rapport ; 7/3 pour une croissance lineaire' },
    diffusionClassique: { debut: K * K / 2, fin: D, sens: 'pente de <p^2>(t) ; K^2/2 = approximation quasi lineaire' },
    quantiqueSurClassique: { fin: moy(p2q, q3, T) / moy(p2c, q3, T) },
    p2Final: { quantique: p2q[T], classique: p2c[T] },
    norme: { debut: 1, derive: normeEcart },
    bordImpulsion: { fin: bord, sens: 'probabilite max a |m| > N/2 - 64 (troncature)' },
    reglage: { K, hbar: hb, kSurHbar: k, etats: N, particulesClassiques: M },
  } };
}

// ---------- 7 : niveaux de Landau (jauge symetrique) ----------
// phi_k(x, y) = C_k ((x - i y)/l)^k e^{-r^2/(4 l^2)} / l, C_k = 1/sqrt(2 pi 2^k k!) : niveau k, centre-guide au repos (|0>).
// l_B = sqrt(hbar/(e B)), omega_c = e B / m, E_k = hbar omega_c (k + 1/2). <r^2> = l^2 (2k + 1) [cyclotron] + l^2 [centre-guide].
// melange : psi = sqrt(1-m) phi_n + sqrt(m) phi_{n+1} e^{-i (E_{n+1}-E_n) t / hbar} -> <x>, <y> tournent a omega_c.
function niveauxLandau(c, n) {
  const HBAR = 1, MASSE = 1, CHARGE = 1, wc = CHARGE * c.B / MASSE, lB = Math.sqrt(HBAR / (CHARGE * c.B));
  const energie = (k) => HBAR * wc * (k + 0.5), N = c.n, a = Math.sqrt(1 - c.melange), b = Math.sqrt(c.melange);
  const Ck = (k) => { let f = DEUX_PI; for (let i = 1; i <= k; i++) f *= 2 * i; return 1 / Math.sqrt(f); };
  const C0 = Ck(N), C1 = Ck(N + 1), dE = energie(N + 1) - energie(N), alea = mulberry32(c.graine >>> 0);
  const amplitudes = (x, y, o) => {
    const ur = x / lB, ui = -y / lB; let pr = 1, pi = 0;
    for (let k = 0; k < N; k++) { const t = pr * ur - pi * ui; pi = pr * ui + pi * ur; pr = t; }
    const g = expD(-(x * x + y * y) / (4 * lB * lB)) / lB, qr = pr * ur - pi * ui, qi = pr * ui + pi * ur;
    o[0] = a * C0 * g * pr; o[1] = a * C0 * g * pi; o[2] = b * C1 * g * qr; o[3] = b * C1 * g * qi;
  };
  const densite = (A, o, cr, ci) => { const zr = A[o] + A[o + 2] * cr - A[o + 3] * ci, zi = A[o + 1] + A[o + 2] * ci + A[o + 3] * cr; return zr * zr + zi * zi; };
  /* grille uniforme (somme de Riemann, spectralement exacte pour ces gaussiennes) */
  const R = lB * (Math.sqrt(2 * (N + 2)) + 5), NG = 101, h = 2 * R / (NG - 1), A = new Float64Array(NG * NG * 4), tmp = new Float64Array(4);
  for (let iy = 0; iy < NG; iy++) for (let ix = 0; ix < NG; ix++) { amplitudes(-R + ix * h, -R + iy * h, tmp); A.set(tmp, 4 * (iy * NG + ix)); }
  let norme = 0, r2 = 0;
  for (let iy = 0; iy < NG; iy++) for (let ix = 0; ix < NG; ix++) {
    const x = -R + ix * h, y = -R + iy * h, d = densite(A, 4 * (iy * NG + ix), 1, 0) * h * h; norme += d; r2 += d * (x * x + y * y);
  }
  r2 /= norme;
  /* <x>(t) sur 'periodes' periodes, 40 instants par periode ; periode mesuree par les zeros (interpolation lineaire) */
  const tTot = c.periodes * DEUX_PI / wc, NT = 40 * c.periodes + 1; let zeros = [], xPrec = 0, tPrec = 0, rayonCentre = 0;
  for (let it = 0; it < NT; it++) {
    const t = tTot * it / (NT - 1), cr = cosD(dE * t / HBAR), ci = -sinD(dE * t / HBAR); let mx = 0, my = 0;
    for (let iy = 0; iy < NG; iy++) for (let ix = 0; ix < NG; ix++) { const d = densite(A, 4 * (iy * NG + ix), cr, ci); mx += d * (-R + ix * h); my += d * (-R + iy * h); }
    mx *= h * h / norme; my *= h * h / norme; rayonCentre = Math.max(rayonCentre, Math.sqrt(mx * mx + my * my));
    if (it > 0 && ((xPrec < 0 && mx >= 0) || (xPrec > 0 && mx <= 0))) zeros.push(tPrec + (t - tPrec) * xPrec / (xPrec - mx));
    xPrec = mx; tPrec = t;
  }
  let omegaMes = null;
  if (a * b > 1e-6 && zeros.length >= 2) omegaMes = DEUX_PI / (2 * (zeros[zeros.length - 1] - zeros[0]) / (zeros.length - 1));
  /* tirage : t uniforme, puis (x, y) par rejet sous l enveloppe radiale (|a phi_n| + |b phi_{n+1}|)^2 */
  let env = 0; for (let i = 0; i <= 2000; i++) { const r = R * Math.SQRT2 * i / 2000, u = r / lB; let pw = 1; for (let k = 0; k < N; k++) pw *= u; const g = expD(-u * u / 4) / lB; const v = (a * C0 * pw + b * C1 * pw * u) * g; if (v * v > env) env = v * v; }
  env *= 1.02;
  const brut = new Float64Array(n * 3); let tirages = 0, depasse = 0, r2e = 0;
  for (let i = 0; i < n; i++) {
    const t = tTot * alea(), cr = cosD(dE * t / HBAR), ci = -sinD(dE * t / HBAR); let x, y;
    for (;;) { tirages++; x = -R + 2 * R * alea(); y = -R + 2 * R * alea(); amplitudes(x, y, tmp); const d = densite(tmp, 0, cr, ci); if (d > env) depasse++; if (alea() * env < d) break; }
    brut[3 * i] = x; brut[3 * i + 1] = y; brut[3 * i + 2] = t * wc / DEUX_PI; r2e += x * x + y * y;
  }
  const r2th = lB * lB * ((1 - c.melange) * 2 * (N + 1) + c.melange * 2 * (N + 2));
  const rayon = Math.sqrt(Math.max(0, r2 - lB * lB)), rayonTh = Math.sqrt(2 * N + 1) * lB;
  return { brut, invariants: {
    normalisation: { debut: 1, fin: norme, derive: Math.abs(norme - 1) },
    r2Quadrature: { debut: r2th, fin: r2, derive: Math.abs(r2 - r2th) / r2th },
    r2Echantillon: { debut: r2th, fin: r2e / n, derive: Math.abs(r2e / n - r2th) / r2th },
    rayonAnneau: { debut: rayonTh, fin: rayon, derive: Math.abs(rayon - rayonTh) / rayonTh, sens: 'sqrt(<r^2> - l_B^2), niveau n seul (melange 0)' },
    ecartEnergie: { debut: HBAR * wc, fin: omegaMes === null ? null : HBAR * omegaMes, derive: omegaMes === null ? null : Math.abs(omegaMes - wc) / wc, zeros: zeros.length, sens: 'hbar x pulsation mesuree de <x>(t)' },
    centreMoyen: { fin: rayonCentre, sens: 'max |<r>(t)|' },
    echantillonnage: { tirages, depassementsDuMax: depasse },
    longueurMagnetique: { fin: lB },
  } };
}

// ---------- 8 : Stern-Gerlach ----------
// spin prepare a l angle theta (plan xz), mesure selon z : P(haut) = cos^2(theta/2). Chaque atome : resultat tire (regle de Born),
// puis un point de la densite STATIONNAIRE du faisceau : y le long du faisceau (aimant 0..1, vol libre 1..2),
// z centre sur la deviation moyenne (Ehrenfest) de sa composante de spin, largeur gaussienne.
function sternGerlach(c, n) {
  const alea = mulberry32(c.graine >>> 0), ch = cosD(c.theta / 2), pHaut = ch * ch, LM = 1, LE = 2;
  const deviation = (y) => (y <= LM ? c.gradient * y * y / 2 : c.gradient * LM * (y - LM / 2));
  const largeur = (y) => c.largeur * (1 + 0.25 * y);
  const brut = new Float64Array(n * 3); let haut = 0, ecranN = 0, ecranHaut = 0;
  for (let i = 0; i < n; i++) {
    const s = alea() < pHaut ? 1 : -1; if (s > 0) haut++;
    const y = LE * alea(), w = largeur(y), x = w * gauss(alea), z = s * deviation(y) + w * gauss(alea);
    if (y > 0.9 * LE) { ecranN++; if (z > 0) ecranHaut++; }
    brut[3 * i] = x; brut[3 * i + 1] = y; brut[3 * i + 2] = z;
  }
  const f = haut / n, fe = ecranN ? ecranHaut / ecranN : NaN;
  return { brut, invariants: {
    fractionHaut: { debut: pHaut, fin: f, derive: Math.abs(f - pHaut), sigma: Math.sqrt(pHaut * (1 - pHaut) / n) },
    fractionEcran: { debut: pHaut, fin: fe, derive: Math.abs(fe - pHaut), sigma: ecranN ? Math.sqrt(pHaut * (1 - pHaut) / ecranN) : NaN, points: ecranN },
    separation: { fin: 2 * deviation(LE) / largeur(LE), sens: 'distance des deux taches sur l ecran / largeur' },
  } };
}

// ---------- catalogue ----------
const SCIENCE = 'Quantum mechanics', GR = [1, 1000000];
const INTERNES = { tapisTalbot, oscillateurEtats, wigner: wignerChat, marcheQuantique, bellCHSH, rotorPulse, niveauxLandau, sternGerlach };
export const SYSTEMES = Object.freeze([
  { id: 'tapisTalbot', nom: 'Quantum carpet (Talbot revivals)', science: SCIENCE, D: 3, nuage: true,
    params: { k0: 0, x0: 0.35, sigma: 0.03, duree: 1, graine: 1 }, bornes: { k0: [-40, 40], x0: [0.25, 0.75], sigma: [0.02, 0.04], duree: [0.05, 1], graine: GR },
    phrase: 'A visualisation of the formula |psi(x, t)|^2 for a Gaussian packet in a 1-D infinite well (hbar = m = L = 1), from its exact eigen-expansion: points are drawn from the position probability at each time (x, t, density), not a path; the pattern revives fully at T = 4 m L^2/(pi hbar) and as a mirror image at T/2.' },
  { id: 'oscillateurEtats', nom: 'Harmonic oscillator eigenstates', science: SCIENCE, D: 3, nuage: true,
    params: { n: 4, omega: 1, graine: 1 }, bornes: { n: [0, 12], omega: [0.5, 2], graine: GR },
    phrase: 'A visualisation of the formula |psi_n(x)|^2 for the n-th stationary state of the quantum harmonic oscillator (hbar = m = 1, Hermite recurrence): points fill the area under the probability density, with the signed amplitude as third axis; a stationary state does not move.' },
  { id: 'wigner', nom: 'Wigner function of a cat state', science: SCIENCE, D: 3, nuage: true,
    params: { q0: 2.5, phase: 0, graine: 1 }, bornes: { q0: [0.5, 4], phase: [0, DEUX_PI], graine: GR },
    phrase: 'A visualisation of the formula for the Wigner quasi-probability W(x, p) of a superposition of two coherent states (hbar = m = omega = 1), computed by quadrature at random phase-space points: its negative fringes are quantum interference, not a probability of being anywhere.' },
  { id: 'marcheQuantique', nom: 'Quantum walk vs random walk', science: SCIENCE, D: 4, nuage: true,
    params: { pas: 100, graine: 1 }, bornes: { pas: [20, 400], graine: GR },
    phrase: 'A visualisation of the formula for a discrete-time Hadamard quantum walk on a line: positions are drawn from the probability of finding the walker at x after t steps, shown with the quantum and the classical coin-walk probabilities; the walker has no path between measurements.' },
  { id: 'bellCHSH', nom: 'Bell correlations (CHSH)', science: SCIENCE, D: 4, nuage: true,
    params: { essais: 200, graine: 1 }, bornes: { essais: [50, 2000], graine: GR },
    phrase: 'A visualisation of the formula E(a, b) = -cos(a - b) for a spin singlet: outcomes are sampled on one computer from the quantum joint probabilities, so it reproduces the prediction (CHSH S = -2 sqrt 2, beyond the local bound 2) but is not itself a test of nonlocality.' },
  { id: 'rotorPulse', nom: 'Quantum kicked rotor', science: SCIENCE, D: 4, nuage: true,
    params: { K: 5, hbar: 1, coups: 200, graine: 1 }, bornes: { K: [2, 10], hbar: [0.5, 2], coups: [50, 600], graine: GR },
    phrase: 'A visualisation of the formula for the quantum kicked rotor (exact one-kick map on 1024 momentum states, effective hbar) next to a classical standard-map ensemble: momenta are drawn from the quantum probability and from the classical ensemble; the classical spread keeps growing, the quantum one stops (dynamical localisation).' },
  { id: 'niveauxLandau', nom: 'Landau levels', science: SCIENCE, D: 3, nuage: true,
    params: { n: 1, melange: 0.3, B: 1, periodes: 3, graine: 1 }, bornes: { n: [0, 8], melange: [0, 1], B: [0.5, 3], periodes: [1, 6], graine: GR },
    phrase: 'A visualisation of the formula |psi(x, y, t)|^2 for an electron in a uniform magnetic field (symmetric gauge, hbar = m = e = 1) in a mix of Landau levels n and n + 1: points are drawn from the density over time; only the expectation value circles, at the cyclotron frequency.' },
  { id: 'sternGerlach', nom: 'Stern-Gerlach splitting', science: SCIENCE, D: 3, nuage: true,
    params: { theta: 2 * PI / 3, gradient: 1, largeur: 0.08, graine: 1 }, bornes: { theta: [0, PI], gradient: [0.5, 3], largeur: [0.02, 0.2], graine: GR },
    phrase: 'A visualisation of the formula for spin-1/2 atoms prepared at angle theta and measured along a field gradient: each atom lands in the upper spot with probability cos^2(theta/2), drawn at random, and the beam density follows the mean deflection of each spin component, not individual paths.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { tapisTalbot: ['graine'], oscillateurEtats: ['n', 'graine'], wigner: ['graine'], marcheQuantique: ['pas', 'graine'],
  bellCHSH: ['essais', 'graine'], rotorPulse: ['coups', 'graine'], niveauxLandau: ['n', 'periodes', 'graine'], sternGerlach: ['graine'] };
const parId = (id) => { const s = SYSTEMES.find((x) => x.id === id); if (!s) throw new Error('systeme inconnu: ' + id); return s; };

/** params bornes : non fini -> defaut ; hors bornes -> ramene ; entiers arrondis */
function borner(id, params) {
  const s = parId(id), P = {};
  for (const k of Object.keys(s.params)) {
    let v = Number(params && params[k]); if (!Number.isFinite(v)) v = s.params[k];
    const [a, b] = s.bornes[k]; v = Math.min(b, Math.max(a, v));
    if (ENTIERS[id].includes(k)) v = Math.round(v);
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
  const r = INTERNES[id](P, n);
  return { params: P, D: s.D, n, bornee: true, nuage: true, brut: r.brut, lyapunov: null, uniteLyapunov: NUAGE, points: null, invariants: r.invariants };
}
