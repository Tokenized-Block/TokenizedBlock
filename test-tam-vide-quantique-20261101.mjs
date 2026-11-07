// test-tam-vide-quantique-20261101.mjs -- banc de tam-vide-quantique.js (vue VIDE QUANTIQUE, non frappable) + mutants sur COPIES.
// Lancer : node test-tam-vide-quantique-20261101.mjs
// Le banc a le droit a Math.sin/cos/exp/log/sinh/cosh/acosh (il n est pas la vue) : ses references sont calculees independamment du module.
// REFERENCES : aucune valeur publiee (tout est sans dimension, hbar = 1) ; chaque formule est rederivee ou reintegree ici.
// Tolerances annoncees (mesurees le 2026-11-01, puis marge) :
//   videComprime : variances, covariance, photons a 4.5 sigma (tirages), det a 4.5 x 2/sqrt(n) relatif, W exact a 1e-9 ;
//   casimirDynamique : N(t) a 1e-4 relatif d une integration independante des modes classiques, ellipse a 1e-4,
//     ecart a la formule d onde tournante sinh^2(eps omega0 t/2) < 0.6 eps^2 relatif (mesure : 0.36 eps^2), pente a 2e-3 du Floquet exact ;
//   higgsVide : |phi| final a 1e-4 de v, frequence radiale a 5e-4 de sqrt(2 mu^2 - gamma^2/4), courbure tangentielle < 1e-8,
//     vitesse de Goldstone constante a 1e-3, bilan d energie 1e-5, L e^{gamma t} 1e-6 ;
//   emissionSpontanee : taux a 1e-3 de la formule tronquee Gamma/(1 - Gamma/(pi M delta)), a 1.2 c du Fermi nu (c = Gamma/(pi M delta)),
//     courbe P_e(t) a 3.5 c de la formule exacte de l echelle infinie, spectre a 1.0 c, pic de resurgence a 0.1/Gamma.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-vide-quantique.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const IDS = ['videComprime', 'casimirDynamique', 'higgsVide', 'emissionSpontanee'];

// ---------- references independantes (Math autorise ici) ----------
/* vide comprime : covariance a l instant t (angle theta - 2 omega t) */
const sigmaComprime = (r, th) => [0.5 * (Math.cosh(2 * r) - Math.sinh(2 * r) * Math.cos(th)), 0.5 * (Math.cosh(2 * r) + Math.sinh(2 * r) * Math.cos(th)), -0.5 * Math.sinh(2 * r) * Math.sin(th)];
/* Casimir dynamique : deux solutions classiques u'' = -omega(t)^2 u, Sigma(t) = Phi Sigma0 Phi^T ; rend X, P, C a chaque pas */
function casimirRef(eps, w0, pasParPeriode, S) {
  const h = 2 * Math.PI / (w0 * pasParPeriode), w2 = (t) => (w0 * (1 + eps * Math.sin(2 * w0 * t))) ** 2;
  const f = (t, y) => [y[1], -w2(t) * y[0], y[3], -w2(t) * y[2]];
  let y = [1, 0, 0, 1]; const X = new Float64Array(S + 1), P = new Float64Array(S + 1), C = new Float64Array(S + 1), U = new Float64Array(4 * (S + 1)), phi = [];
  const noter = (s) => { const a = 1 / (2 * w0), b = w0 / 2; X[s] = y[0] ** 2 * a + y[2] ** 2 * b; P[s] = y[1] ** 2 * a + y[3] ** 2 * b; C[s] = y[0] * y[1] * a + y[2] * y[3] * b; U.set(y, 4 * s); };
  noter(0);
  for (let s = 0; s < S; s++) {
    const t = s * h, k1 = f(t, y), k2 = f(t + h / 2, y.map((v, i) => v + h / 2 * k1[i])), k3 = f(t + h / 2, y.map((v, i) => v + h / 2 * k2[i])), k4 = f(t + h, y.map((v, i) => v + h * k3[i]));
    y = y.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    noter(s + 1); if (s + 1 === pasParPeriode / 2) phi.push(...y);
  }
  const tr = phi[0] + phi[3], mu = Math.abs(tr) > 2 ? Math.acosh(Math.abs(tr) / 2) / (Math.PI / w0) : 0; /* periode de la modulation pi/omega0 */
  return { h, X, P, C, U, mu, N: (s) => (P[s] + w0 * w0 * X[s]) / (2 * w0) - 0.5 };
}
/* emission spontanee : echelle infinie, exacte sur [0, 2 T_H[ */
const ceEchelle = (G, TH, t) => Math.exp(-G * t / 2) - (t > TH ? G * (t - TH) * Math.exp(-G * (t - TH) / 2) : 0);

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const sim = (id, p, o) => T.simuler(id, p, o);
  const cache = new Map(), S = (id, p = {}) => { const k = id + JSON.stringify(p); if (!cache.has(k)) cache.set(k, sim(id, p)); return cache.get(k); };
  // 1. forme, bornes, determinisme
  ok('SYSTEMES gele, 4 systemes (ids attendus), science QFT, SOURCES vide (aucune valeur publiee)', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES)); assert.deepEqual(T.SYSTEMES.map((s) => s.id), IDS); assert.ok(Object.isFrozen(T.SYSTEMES[0].params));
    assert.ok(T.SYSTEMES.every((s) => s.science === 'Quantum field theory')); assert.equal(Object.keys(T.SOURCES).length, 0);
  });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, brut n*D fini, D = 4, points null, lyapunov null, phrase anglaise`, () => {
      const r = S(s.id);
      assert.equal(r.bornee, true, r.raison); assert.equal(r.D, s.D); assert.equal(r.D, 4); assert.equal(r.n, 1500);
      assert.equal(r.brut.length, 1500 * s.D); assert.ok(r.brut.every(Number.isFinite)); assert.equal(r.points, null); assert.equal(r.lyapunov, null);
      assert.ok(typeof r.uniteLyapunov === 'string' && r.uniteLyapunov.length > 5);
      if (r.film) { assert.equal(r.film.tailles.reduce((a, b) => a + b, 0), 1500); assert.equal(r.film.images, r.film.debuts.length); }
      assert.ok(typeof s.phrase === 'string' && s.phrase.length > 80 && /visualisation/.test(s.phrase) && s.nom);
    });
    ok(`${s.id} : determinisme (octets identiques)`, () => assert.ok(octets(sim(s.id).brut).equals(octets(S(s.id).brut))));
    ok(`${s.id} : petits n (2 et 7) bornes et finis`, () => { for (const n of [2, 7]) { const r = sim(s.id, {}, { n }); assert.equal(r.bornee, true); assert.equal(r.brut.length, n * s.D); assert.ok(r.brut.every(Number.isFinite)); } });
    ok(`${s.id} : bornee a chaque extreme de curseur (un a un, tous min, tous max)`, () => {
      const ks = Object.keys(s.params), cs = [];
      for (const k of ks) { cs.push({ [k]: s.bornes[k][0] }); cs.push({ [k]: s.bornes[k][1] }); }
      cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][0]]))); cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][1]])));
      for (const p of cs) { const r = S(s.id, p); assert.equal(r.bornee, true, JSON.stringify(p)); assert.ok(r.brut.every(Number.isFinite), JSON.stringify(p)); }
      return cs.length + ' reglages';
    });
  }
  // 2. videComprime
  for (const p of [{}, { r: 1.2, theta: 1, omega: 1.5, graine: 7 }, { r: 0 }]) ok(`videComprime ${JSON.stringify(p)} : moments a t = 0 (points ramenes par -omega t) = formules a 4.5 sigma, det = 1/4, <n> = sinh^2 r`, () => {
    const R = S('videComprime', p), P = R.params, b = R.brut, n = R.n, I = R.invariants, [Vx, Vp, C] = sigmaComprime(P.r, P.theta);
    let sx = 0, sp = 0, sxp = 0;
    for (let i = 0; i < n; i++) { const x = b[4 * i], q = b[4 * i + 1], a = P.omega * b[4 * i + 2], z0 = x * Math.cos(a) - q * Math.sin(a), z1 = x * Math.sin(a) + q * Math.cos(a); sx += z0 * z0; sp += z1 * z1; sxp += z0 * z1; }
    const mx = sx / n, mp = sp / n, mxp = sxp / n;
    for (const [m, v, sg] of [[mx, Vx, Vx * Math.sqrt(2 / n)], [mp, Vp, Vp * Math.sqrt(2 / n)], [mxp, C, Math.sqrt((Vx * Vp + C * C) / n)]]) assert.ok(Math.abs(m - v) < 4.5 * sg, `${m} vs ${v} +- ${sg}`);
    assert.ok(Math.abs(I.variances.x.formule - Vx) < 1e-12 && Math.abs(I.variances.p.formule - Vp) < 1e-12 && Math.abs(I.variances.xp.formule - C) < 1e-12);
    assert.ok(Math.abs(I.variances.x.mesure - mx) < 1e-9 * Vp && Math.abs(I.variances.p.mesure - mp) < 1e-9 * Vp, 'mesure du module = mesure du banc');
    const D = mx * mp - mxp * mxp; assert.ok(Math.abs(D - 0.25) < 4.5 * 2 / Math.sqrt(n) * 0.25, String(D)); assert.ok(Math.abs(I.incertitude.determinantFormule - 0.25) < 1e-12);
    const nn = (mx + mp - 1) / 2, sn = 0.5 * Math.sqrt(2 * (Vx * Vx + Vp * Vp + 2 * C * C) / n), nth = Math.sinh(P.r) ** 2;
    assert.ok(Math.abs(nn - nth) < 4.5 * sn, `<n> ${nn} vs ${nth}`); assert.ok(Math.abs(I.photons.formule - nth) < 1e-12 * Math.max(1, nth));
    if (P.theta === 0) { assert.ok(Math.abs(Vx - Math.exp(-2 * P.r) / 2) < 1e-12 && Math.abs(I.incertitude.produitFormule - 0.5) < 1e-12); }
    if (P.r > 0.5 && P.theta === 0) assert.ok(mx < 0.5 - 4.5 * Vx * Math.sqrt(2 / n), 'Var x mesuree sous le bruit du vide 1/2');
    return `Var x ${mx.toFixed(4)}/${Vx.toFixed(4)}, Var p ${mp.toFixed(4)}/${Vp.toFixed(4)}, det ${D.toFixed(4)}, <n> ${nn.toFixed(4)}/${nth.toFixed(4)}`;
  });
  for (const p of [{}, { r: 1.2, theta: 1, omega: 1.5, graine: 7 }, { r: 1.5, omega: 2, duree: 20 }]) ok(`videComprime ${JSON.stringify(p)} : evolution (angle theta - 2 omega t), x^2/Var x(t) moyen = 1 a 4.5 sigma, W(x,p,t) exact (1e-9)`, () => {
    const R = S('videComprime', p), P = R.params, b = R.brut, n = R.n, I = R.invariants; let ax = 0, ap = 0, pireW = 0;
    for (let i = 0; i < n; i++) {
      const x = b[4 * i], q = b[4 * i + 1], t = b[4 * i + 2], [Vx, Vp, C] = sigmaComprime(P.r, P.theta - 2 * P.omega * t);
      ax += x * x / Vx; ap += q * q / Vp;
      const D = Vx * Vp - C * C, Q = (Vp * x * x - 2 * C * x * q + Vx * q * q) / D, W = Math.exp(-Q / 2) / (2 * Math.PI * Math.sqrt(D));
      pireW = Math.max(pireW, Math.abs(b[4 * i + 3] - W) / (1 / Math.PI));
      if (i > 0) assert.ok(t > b[4 * (i - 1) + 2]);
    }
    const sg = Math.sqrt(2 / n);
    assert.ok(Math.abs(ax / n - 1) < 4.5 * sg && Math.abs(ap / n - 1) < 4.5 * sg, `${ax / n} ${ap / n}`);
    assert.ok(Math.abs(I.rotation.x2SurVarX - ax / n) < 1e-9 && Math.abs(I.rotation.p2SurVarP - ap / n) < 1e-9, 'rotation du module');
    assert.ok(pireW < 1e-9, String(pireW)); assert.ok(Math.abs(I.rotation.periodeVariance - Math.PI / P.omega) < 1e-12);
    return `<x^2/Vx(t)> ${(ax / n).toFixed(4)}, <p^2/Vp(t)> ${(ap / n).toFixed(4)}, W ${pireW.toExponential(1)}`;
  });
  // 3. casimirDynamique
  for (const p of [{}, { eps: 0.05, omega0: 1.5, periodes: 40 }, { eps: 0.005, omega0: 0.5, periodes: 10 }]) ok(`casimirDynamique ${JSON.stringify(p)} : N(t) = modes classiques independants (1e-4), ellipse 1-sigma exacte, det = 1/4, onde tournante a 0.6 eps^2, pente = Floquet (2e-3)`, () => {
    const R = S('casimirDynamique', p), P = R.params, I = R.invariants, b = R.brut, n = R.n, Sx = P.periodes * 400, ref = casimirRef(P.eps, P.omega0, 400, Sx);
    const se = I.photons.serie; let pire = 0;
    se.t.forEach((t, k) => { const s = Math.round(t / ref.h); assert.equal(s, (k + 1) * 400); const N = ref.N(s); pire = Math.max(pire, Math.abs(se.mesure[k] - N) / (N + 0.5));
      const f = Math.sinh(P.eps * P.omega0 * t / 2) ** 2; assert.ok(Math.abs(se.formule[k] - f) < 1e-12 * Math.max(1, f)); });
    assert.ok(pire < 1e-4, 'N ' + pire);
    let pireE = 0, pireN = 0;
    /* ellipse : w = Phi^-1 z (det Phi = 1) doit tomber sur l ellipse 1-sigma du vide w_x^2 2 omega0 + w_p^2 2/omega0 = 1 */
    for (let i = 0; i < n; i++) {
      const s = Math.round(b[4 * i + 2] / ref.h), [u1, v1, u2, v2] = ref.U.subarray(4 * s, 4 * s + 4), x = b[4 * i], q = b[4 * i + 1];
      const wx = v2 * x - u2 * q, wp = -v1 * x + u1 * q;
      pireE = Math.max(pireE, Math.abs(wx * wx * 2 * P.omega0 + wp * wp * 2 / P.omega0 - 1)); pireN = Math.max(pireN, Math.abs(b[4 * i + 3] - ref.N(s)) / (ref.N(s) + 0.5));
    }
    assert.ok(pireE < 1e-4 && pireN < 1e-4, `ellipse ${pireE}, N ${pireN}`);
    assert.ok(I.wronskien.derive < 1e-6 && Math.abs(I.wronskien.debut - 1) < 1e-6, String(I.wronskien.derive));
    const e2 = P.eps * P.eps;
    assert.ok(Math.abs(I.compression.formule - P.eps * P.omega0 * I.photons.t / 2) < 1e-12 * I.compression.formule);
    assert.ok(I.compression.ecart < 0.6 * e2, `r ${I.compression.ecart} vs eps^2 ${e2}`); assert.ok(I.croissance.ecart < 0.6 * e2, `taux ${I.croissance.ecart}`);
    assert.ok(Math.abs(I.croissance.formule - P.eps * P.omega0 / 2) < 1e-15);
    assert.ok(Math.abs(I.croissance.mesure - ref.mu) < 2e-3 * ref.mu, `pente ${I.croissance.mesure} vs Floquet ${ref.mu}`);
    assert.ok(se.mesure[se.mesure.length - 1] > se.mesure[0] && se.mesure[0] > 0, 'photons crees depuis le vide');
    return `N(${I.photons.t.toFixed(1)}) ${I.photons.mesure.toPrecision(5)} vs sinh^2 ${I.photons.formule.toPrecision(5)}, r ecart ${I.compression.ecart.toExponential(2)} (eps^2 ${e2.toExponential(1)}), pente ${I.croissance.mesure.toPrecision(6)} Floquet ${ref.mu.toPrecision(6)} RWA ${(P.eps * P.omega0 / 2).toPrecision(6)}, ellipse ${pireE.toExponential(1)}`;
  });
  // 4. higgsVide
  for (const p of [{}, { mu: 2, lambda: 2, gamma: 0.5, graine: 9 }, { mu: 0.5, lambda: 0.1, gamma: 0.02 }]) ok(`higgsVide ${JSON.stringify(p)} : |phi| -> v = mu/sqrt(2 lambda), omega radial = sqrt(2 mu^2 - gamma^2/4), Goldstone sans masse, bilans`, () => {
    const R = S('higgsVide', p), P = R.params, I = R.invariants, b = R.brut, n = R.n, v = P.mu / Math.sqrt(2 * P.lambda), wd = Math.sqrt(2 * P.mu ** 2 - P.gamma ** 2 / 4);
    assert.ok(Math.abs(I.vide.formule - v) < 1e-12 * v && I.vide.ecart < 1e-4, String(I.vide.ecart));
    assert.ok(Math.abs(I.vide.Vmin - (-(P.mu ** 4) / (4 * P.lambda))) < 1e-12 && Math.abs(I.vide.VminFormule - I.vide.Vmin) < 1e-12);
    assert.ok(Math.abs(I.frequenceRadiale.formule - wd) < 1e-12 * wd && I.frequenceRadiale.ecart < 5e-4 && I.frequenceRadiale.passages >= 10, `${I.frequenceRadiale.mesure} vs ${wd}`);
    assert.ok(Math.abs(I.frequenceRadiale.mH - Math.SQRT2 * P.mu) < 1e-12);
    assert.ok(Math.abs(I.courbure.radiale - 2 * P.mu ** 2) < 1e-5 * P.mu ** 2 && Math.abs(I.courbure.tangentielle) < 1e-8 * P.mu ** 2, `${I.courbure.radiale} ${I.courbure.tangentielle}`);
    const g = I.goldstone; assert.ok(Math.abs(g.formule - 0.01 * P.mu) < 1e-12 && (g.vitesseAngulaireMax - g.vitesseAngulaireMin) < 1e-3 * g.formule && g.vitesseAngulaireMin > 0.99 * g.formule && g.ecartRadialMax < 1e-3, JSON.stringify(g));
    assert.ok(I.bilanEnergie.derive < 1e-5, String(I.bilanEnergie.derive)); assert.ok(I.momentAngulaireCorrige.derive < 1e-6, String(I.momentAngulaireCorrige.derive));
    for (let i = 0; i < n; i += 7) { const q = b[4 * i] ** 2 + b[4 * i + 1] ** 2; assert.ok(Math.abs(b[4 * i + 2] - (-(P.mu ** 2) * q + P.lambda * q * q)) < 1e-12 * Math.max(1, P.mu ** 4 / P.lambda)); }
    assert.ok(Math.abs(Math.hypot(b[0], b[1]) - 0.02 * v) < 1e-12 * v && Math.abs(Math.hypot(b[4 * (n - 1)], b[4 * (n - 1) + 1]) - v) < 1e-3 * v);
    return `|phi| ${I.vide.mesure.toPrecision(7)}/${v.toPrecision(7)}, omega ${I.frequenceRadiale.mesure.toPrecision(7)}/${wd.toPrecision(7)} (${I.frequenceRadiale.passages} passages), m2 radial ${I.courbure.radiale.toPrecision(7)}, tangentiel ${I.courbure.tangentielle}`;
  });
  ok('higgsVide : la direction du vide depend de la graine (symetrie brisee spontanement), |phi| final identique', () => {
    const a = S('higgsVide', { graine: 1 }).brut, c = S('higgsVide', { graine: 2 }).brut, k = 4 * 1499;
    assert.ok(Math.hypot(a[k] - c[k], a[k + 1] - c[k + 1]) > 0.1); assert.ok(Math.abs(Math.hypot(a[k], a[k + 1]) - Math.hypot(c[k], c[k + 1])) < 1e-3);
  });
  // 5. emissionSpontanee
  for (const p of [{}, { rapport: 1, espacement: 0.2, modes: 251 }, { rapport: 0.3, espacement: 0.05, modes: 101 }]) ok(`emissionSpontanee ${JSON.stringify(p)} : taux = Fermi 2 pi g^2/delta (troncature comprise), P_e(t) = formule exacte de l echelle, resurgence a T_H, spectre lorentzien`, () => {
    const R = S('emissionSpontanee', p), P = R.params, I = R.invariants, d = P.espacement, g = P.rapport * d, M = Math.floor(P.modes / 2), G = 2 * Math.PI * g * g / d, TH = 2 * Math.PI / d, c = G / (Math.PI * M * d);
    assert.ok(Math.abs(I.taux.formule - G) < 1e-12 * G && Math.abs(I.taux.formuleTronquee - G / (1 - c)) < 1e-12 * G);
    assert.ok(I.taux.ecartTronque < 1e-3, `tronque ${I.taux.ecartTronque}`); assert.ok(I.taux.ecart < 1.2 * c, `Fermi ${I.taux.ecart} vs c ${c}`);
    const se = I.courbe.serie; let pire = 0;
    se.t.forEach((t, k) => { const f = ceEchelle(G, TH, t) ** 2; assert.ok(Math.abs(se.formule[k] - f) < 1e-12); pire = Math.max(pire, Math.abs(se.mesure[k] - f)); });
    assert.ok(pire < 3.5 * c && I.courbe.pireEcart < 3.5 * c && I.courbe.pireEcart >= pire, `courbe ${I.courbe.pireEcart} vs c ${c}`);
    const z = I.resurgence; assert.ok(Math.abs(z.tempsHeisenberg - TH) < 1e-12 * TH && z.picMesure > TH && Math.abs(z.picMesure - z.picFormule) * G < 0.1 && Math.abs(z.valeurMesure - z.valeurFormule) < 3.5 * c, JSON.stringify(z));
    let creux = 1; se.t.forEach((t, k) => { if (t > 0.5 * TH && t < TH) creux = Math.min(creux, se.mesure[k]); });
    assert.ok(creux < 0.2 && z.valeurMesure > 0.3, `creux ${creux}, resurgence ${z.valeurMesure}`);
    assert.ok(I.spectre.images >= 3 && I.spectre.pireEcartRelatif < 1.0 * c && Math.abs(I.spectre.pic - 4 * g * g / (G * G)) < 1e-12 * I.spectre.pic, String(I.spectre.pireEcartRelatif));
    assert.ok(I.norme.derive < 2e-4, String(I.norme.derive)); assert.equal(I.modes.N, 2 * M + 1);
    const b = R.brut; for (let i = 0; i < R.n; i += 11) { const k = b[4 * i] / d; assert.ok(Math.abs(k - Math.round(k)) < 1e-9 && Math.abs(k) <= M); }
    return `Gamma ${I.taux.mesure.toPrecision(6)} vs Fermi ${G.toPrecision(6)} (tronque ${(G / (1 - c)).toPrecision(6)}), courbe ${I.courbe.pireEcart.toExponential(2)} (c ${c.toExponential(2)}), pic ${z.picMesure.toFixed(2)}/${z.picFormule.toFixed(2)} P ${z.valeurMesure.toFixed(4)}/${z.valeurFormule.toFixed(4)}, spectre ${I.spectre.pireEcartRelatif.toExponential(2)}`;
  });
  // 6. bornage
  ok('bornage : hors bornes ramene, NaN -> defaut, entiers arrondis', () => {
    assert.deepEqual(sim('casimirDynamique', { eps: 9, omega0: NaN, periodes: 12.6 }, { n: 50 }).params, { eps: 0.05, omega0: 1, periodes: 13 });
    assert.deepEqual(sim('emissionSpontanee', { rapport: -1, espacement: 'x', modes: 1000.2 }, { n: 50 }).params, { rapport: 0.3, espacement: 0.1, modes: 251 });
    assert.deepEqual(sim('higgsVide', { mu: 100, lambda: 0, gamma: Infinity, graine: 3.6 }, { n: 50 }).params, { mu: 2, lambda: 0.1, gamma: 0.1, graine: 4 });
    assert.deepEqual(sim('videComprime', { r: 7, theta: -9 }, { n: 50 }).params, { r: 1.5, theta: -3.1, omega: 1, duree: 6, graine: 1 });
  });
  ok('reglagesPhysique : forme, valeur bornee', () => {
    const r = T.reglagesPhysique('higgsVide', { mu: 99 });
    assert.deepEqual(r.map((x) => x.chemin), ['params.mu', 'params.lambda', 'params.gamma', 'params.graine']);
    assert.deepEqual(r[0], { chemin: 'params.mu', nom: 'mu', min: 0.5, max: 2, valeur: 2 });
  });
  return res;
}

// ---------- banc ----------
const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
const src = readFileSync(SOURCE, 'utf8'), moi = readFileSync(fileURLToPath(import.meta.url), 'utf8');
/* source : aucune fonction Math transcendante, aucun Math.random */
const interdits = src.match(/Math\.(sin|cos|tan|exp|log|pow|atan2?|asin|acos|hypot|sinh|cosh|tanh|asinh|acosh|cbrt|expm1|log1p|log2|log10|random)\b/g);
assertions++; if (interdits) ech.push({ nom: 'source sans Math transcendante', det: interdits.join(',') });
console.log(`${interdits ? 'ECHEC ' : 'OK    '}source : aucune Math.sin/cos/exp/log/pow/atan/... ni Math.random`);
/* aucune valeur marquee comme sans source lue (motif assemble pour ne pas se trouver lui-meme) */
const marque = new RegExp(['de m' + 'emoire', 'from m' + 'emory', 'de t' + 'ete', 'a sour' + 'cer', 'unsour' + 'ced', 'non sour' + 'ce', 'TO' + 'DO'].join('|'), 'i');
const marques = [src, moi].flatMap((t, i) => t.split('\n').map((l, j) => [i ? 'test' : 'module', j + 1, l]).filter(([, , l]) => marque.test(l)));
assertions++; if (marques.length) ech.push({ nom: 'valeur marquee sans source lue', det: marques.map(([f, j]) => f + ':' + j).join(',') });
console.log(`${marques.length ? 'ECHEC ' : 'OK    '}aucune valeur marquee sans source lue (module + banc)`);

/* 07/11 : minimum de 5 au lieu de la mediane de 3 : sur cette machine effetTunnel allait de 213 a 608 ms d un appel a l autre (mediane 321), le
 *   meme code rougissait ou non selon le moment. Le minimum mesure le cout propre ; un calcul double reste rouge (325-391 ms, preuve a part). */
console.log('\nTEMPS simuler(id) a n = 1500 (minimum de 5), defauts et chaque extreme de curseur :');
let pireTemps = 0, pireOu = '';
for (const s of T.SYSTEMES) {
  const ks = Object.keys(s.params), cs = [{}];
  for (const k of ks) { cs.push({ [k]: s.bornes[k][0] }); cs.push({ [k]: s.bornes[k][1] }); }
  cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][0]]))); cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][1]])));
  let pire = 0, ou = '';
  for (const p of cs) {
    const t = []; for (let k = 0; k < 5; k++) { const a = performance.now(); T.simuler(s.id, p); t.push(performance.now() - a); }
    t.sort((a, b) => a - b); if (t[0] > pire) { pire = t[0]; ou = JSON.stringify(p); }
  }
  console.log(`  ${s.id.padEnd(20)} pire ${pire.toFixed(1)} ms  ${ou}`);
  if (pire > pireTemps) { pireTemps = pire; pireOu = s.id + ' ' + ou; }
  assertions++; if (!(pire < 150)) ech.push({ nom: 'temps ' + s.id + ' < 150 ms', det: pire.toFixed(1) + ' ' + ou });
}
console.log(`  pire de tous : ${pireTemps.toFixed(1)} ms (${pireOu})`);

// ---------- mutants (copies dans un dossier temporaire ; l import du moteur pointe vers l original) ----------
const MUTANTS = [
  ['comprime : signe de l angle (M01 inverse)', 'M01 = c * s * (em - ep)', 'M01 = c * s * (ep - em)'],
  ['comprime : Var x avec r au lieu de 2r', '0.5 * (coshD(2 * r) - sinhD(2 * r) * cosD(th))', '0.5 * (coshD(r) - sinhD(r) * cosD(th))'],
  ['comprime : <n> = sinh(2r) sinh(r)', 'const photonsComprime = (r) => sinhD(r) * sinhD(r);', 'const photonsComprime = (r) => sinhD(2 * r) * sinhD(r);'],
  ['comprime : rotation des points a 2 omega', 'ang = w * t,', 'ang = 2 * w * t,'],
  ['comprime : angle de la variance theta - omega t', 'rotX += x * x / varX(r, th - 2 * w * t)', 'rotX += x * x / varX(r, th - w * t)'],
  ['Casimir : modulation a omega0 (hors resonance)', 'e * sinD(2 * w0 * t)', 'e * sinD(w0 * t)'],
  ['Casimir : onde tournante eps omega0 t (sans /2)', 'sinhD(eps * w0 * t / 2)', 'sinhD(eps * w0 * t)'],
  ['Casimir : depart hors du vide (u2 = 2)', 'const u = Float64Array.from([1, 0, 0, 1]);', 'const u = Float64Array.from([1, 0, 0, 2]);'],
  ['Casimir : ellipse dessinee avec la variance au lieu de l ecart type', 'wp = sb * sinD(ph)', 'wp = b0 * sinD(ph)'],
  ['Higgs : force mu^2 - lambda |phi|^2', 'f = mu2 - 2 * lam * q', 'f = mu2 - lam * q'],
  ['Higgs : m_H^2 = mu^2', 'const masse2Higgs = (mu) => 2 * mu * mu;', 'const masse2Higgs = (mu) => mu * mu;'],
  ['Higgs : frottement anisotrope', 'd[3] = f * y[1] - gg * y[3]', 'd[3] = f * y[1] - 2 * gg * y[3]'],
  ['Higgs : potentiel non symetrique (phi1^4 + phi2^4)', 'const V = (a, b) => { const q = a * a + b * b; return -mu2 * q + lam * q * q; };', 'const V = (a, b) => { const q = a * a + b * b; return -mu2 * q + lam * (q * q - 2 * a * a * b * b); };'],
  ['emission : Gamma = pi g^2/delta', 'const tauxFermi = (g, delta) => DEUX_PI * g * g / delta;', 'const tauxFermi = (g, delta) => PI * g * g / delta;'],
  ['emission : couplage non hermitien', 'dr[0] = g * si; di[0] = -g * sr;', 'dr[0] = 0.5 * g * si; di[0] = -0.5 * g * sr;'],
  ['emission : espacement des modes x 1.05', 'det[k] = (k - 1 - M) * d;', 'det[k] = (k - 1 - M) * d * 1.05;'],
  ['emission : resurgence Gamma/2', '- G * (t - TH) * expD(-G * (t - TH) / 2)', '- 0.5 * G * (t - TH) * expD(-G * (t - TH) / 2)'],
  ['emission : correction de troncature retiree', 'const tauxTronque = (G, M, delta) => G / (1 - G / (PI * M * delta));', 'const tauxTronque = (G, M, delta) => G;'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['Math.random injecte', 'w = P.omega, alea = mulberry32(P.graine >>> 0);', 'w = P.omega, alea = Math.random;'],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-vide-quantique-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`);
    writeFileSync(f, src.replace(de, vers).replace("from './tam-moteur.js'", `from '${moteur}'`));
    let r; try { r = suite(await import(pathToFileURL(f).href)); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-vide-quantique-20261101 : ${assertions} assertions OK`);
