// test-tam-theories-3-20261102.mjs -- banc de tam-theories-3.js (six autres theories classiques, vue non frappable) + mutants sur COPIES.
// Lancer : node test-tam-theories-3-20261102.mjs
// Le banc a le droit a Math.sin/cos/exp/atan/hypot : ses references sont calculees independamment du module
//   (angle de Rutherford par Math.atan, 2-cycle par la formule du second degre, periodes du diagramme par iteration brute,
//   oscillateur par la solution analytique COMPLETE (transitoire compris), arc du brachistochrone par quadrature en substitution
//   u^2, loi binomiale par produit de fractions).
// REFERENCES : aucune valeur publiee ; chaque formule est recalculee ici depuis sa definition. La constante de Feigenbaum n est ecrite
//   ni dans le module ni ici : les rapports mesures sont seulement affiches.
// Chaque verification tourne aux defauts ET a chaque extreme de curseur (un a un, tous min, tous max).
// Tolerances annoncees (mesurees le 2026-11-02 sur defauts + extremes, puis marge) :
//   rutherford : angle a 2e-7 rad (mesure 2.8e-8 au pire, domine par R0 fini), r_min a 1e-5 relatif (echantillonne aux pas, mesure 2.7e-6),
//     energie < 1e-10 (mesure 5.1e-12), moment cinetique < 1e-9 ;
//   logistique : r1, r2 a 1e-9 (mesure 0 a l arrondi pres), r3 et r4 encadres par iteration brute a +- 1e-3 et +- 2e-4, point fixe et
//     2-cycle a 1e-12 ;
//   chaleur : variance a 1e-12 relatif (identite exacte du schema, mesure 1.9e-15), chaleur < 1e-13 (mesure 3e-15), pic gaussien a
//     0.2 (s0/s)^2 + 0.5 dx^2/s^2 (mesure 7.7e-3 au coin D 0.05, duree 0.1, largeur 0.1, sous sa borne), bord a >= 8 sigma ;
//   oscillateurForce : amplitude et phase a 1e-6 relatif (mesure 3.6e-9), chaque point dessine = solution analytique a 1e-6 (1 + A)
//     (mesure 2.4e-7), resonance a 1e-5 (mesure 3e-9) ;
//   brachistochrone : cycloide a 1e-7 relatif (mesure 2.4e-8), ordre de convergence 2 +- 0.1 (mesure 2.0002), droite a 1e-12,
//     arc = quadrature a 1e-6 ;
//   galton : moyenne et variance a 4.5 sigma, chi2 < ddl + 5 sqrt(2 ddl), pire case < 4.5 sigma (mesure 2.76).
// MARGE FINE (dite, pas cachee) : le curseur D de chaleur change le dessin de ~0.05 a son max (seuil 0.05 du banc) ; deterministe.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-theories-3.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const IDS = ['rutherford', 'logistique', 'chaleur', 'oscillateurForce', 'brachistochrone', 'galton'];

// ---------- references independantes (Math autorise ici) ----------
const fLog = (r, x) => r * x * (1 - x);
/* periode de l attracteur par iteration brute (aucun Newton, aucun multiplicateur) */
function periodeBrute(r, it = 200000) {
  let x = 0.5; for (let i = 0; i < it; i++) x = fLog(r, x);
  for (const p of [1, 2, 4, 8, 16, 32]) { let y = x; for (let i = 0; i < p; i++) y = fLog(r, y); if (Math.abs(y - x) < 1e-9) return p; }
  return Infinity;
}
/* 2-cycle : racines de r^2 x^2 - r (r + 1) x + (r + 1) = 0 (f(f(x)) = x sans les points fixes) */
const deuxCycleRef = (r) => { const A = r * r, B = -r * (r + 1), C = r + 1, d = Math.sqrt(B * B - 4 * A * C); return [(-B + d) / (2 * A), (-B - d) / (2 * A)]; };
/* oscillateur : solution analytique complete x(t) depuis (x0, v0), omega0 = 1, gamma <= 1 */
function oscExact(g, w, F0, x0, v0) {
  const D2 = (1 - w * w) ** 2 + (2 * g * w) ** 2, a = F0 * (1 - w * w) / D2, b = F0 * 2 * g * w / D2; /* x_p = a cos wt + b sin wt */
  const c1 = x0 - a, vh0 = v0 - b * w;
  if (g < 1) { const wd = Math.sqrt(1 - g * g), c2 = (vh0 + g * c1) / wd;
    return { x: (t) => a * Math.cos(w * t) + b * Math.sin(w * t) + Math.exp(-g * t) * (c1 * Math.cos(wd * t) + c2 * Math.sin(wd * t)),
      v: (t) => -a * w * Math.sin(w * t) + b * w * Math.cos(w * t) + Math.exp(-g * t) * ((-g * c1 + wd * c2) * Math.cos(wd * t) + (-g * c2 - wd * c1) * Math.sin(wd * t)), A: Math.hypot(a, b) }; }
  const c2 = vh0 + c1; /* amortissement critique : e^{-t} (c1 + c2 t) */
  return { x: (t) => a * Math.cos(w * t) + b * Math.sin(w * t) + Math.exp(-t) * (c1 + c2 * t), v: (t) => -a * w * Math.sin(w * t) + b * w * Math.cos(w * t) + Math.exp(-t) * (c2 - c1 - c2 * t), A: Math.hypot(a, b) };
}
/* arc de cercle tangent a la verticale : t = int_pi^phiB R / sqrt(-2 g R sin phi) dphi, phi = pi + u^2 (singularite retiree), Simpson */
function tempsArc(R, phiB, M = 20000) {
  const U = Math.sqrt(phiB - Math.PI), h = U / M, f = (u) => (u === 0 ? 2 * R / Math.sqrt(2 * R) : 2 * u * R / Math.sqrt(2 * R * Math.sin(u * u)));
  let s = f(0) + f(U); for (let k = 1; k < M; k++) s += (k % 2 ? 4 : 2) * f(k * h);
  return s * h / 3;
}
function binomRef(L) { const p = []; for (let k = 0; k <= L; k++) { let c = 1; for (let j = 1; j <= k; j++) c *= (L - k + j) / j; p.push(c / 2 ** L); } return p; }
/* game105 : la reference a penchant q, calculee autrement (Math.pow, coefficient par produit) */
function binomRefQ(L, q) { const p = []; for (let k = 0; k <= L; k++) { let c = 1; for (let j = 1; j <= k; j++) c *= (L - k + j) / j; p.push(c * Math.pow(q, k) * Math.pow(1 - q, L - k)); } return p; }
/* standardisation par colonne et par groupe de longueurs de meme nature (meme definition que le banc de tam-theories-2) */
function standardiser(b, n, D, groupes = []) {
  const z = new Float64Array(n * D), moy = [], et = [];
  for (let j = 0; j < D; j++) { let m = 0; for (let i = 0; i < n; i++) m += b[i * D + j]; m /= n; let v = 0; for (let i = 0; i < n; i++) v += (b[i * D + j] - m) ** 2; moy.push(m); et.push(Math.sqrt(v / n)); }
  for (const g of groupes) { const e = Math.sqrt(g.reduce((a, j) => a + et[j] * et[j], 0) / g.length); for (const j of g) et[j] = e; }
  for (let j = 0; j < D; j++) { const s = et[j] > 0 ? 1 / et[j] : 0; for (let i = 0; i < n; i++) z[i * D + j] = (b[i * D + j] - moy[j]) * s; }
  return z;
}
const ecartDessin = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };
/* les reglages d extremes : defauts, chaque curseur a chaque borne, tous min, tous max */
function extremes(s) {
  const ks = Object.keys(s.params), cs = [{}];
  for (const k of ks) { cs.push({ [k]: s.bornes[k][0] }); cs.push({ [k]: s.bornes[k][1] }); }
  cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][0]]))); cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][1]])));
  return cs;
}

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const sim = (id, p, o) => T.simuler(id, p, o);
  const cache = new Map(), S = (id, p = {}) => { const k = id + JSON.stringify(p); if (!cache.has(k)) cache.set(k, sim(id, p)); return cache.get(k); };
  const sys = (id) => T.SYSTEMES.find((s) => s.id === id);
  // 1. forme, bornes, determinisme
  ok('SYSTEMES gele, 6 systemes (ids attendus), SOURCES vide (aucune valeur publiee), COLONNES couvre chaque colonne, ENTIERS par systeme', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES)); assert.deepEqual(T.SYSTEMES.map((s) => s.id), IDS); assert.ok(Object.isFrozen(T.SYSTEMES[0].params));
    assert.equal(Object.keys(T.SOURCES).length, 0); assert.deepEqual(Object.keys(T.ENTIERS), IDS);
    for (const s of T.SYSTEMES) { const C = T.COLONNES[s.id]; assert.equal(C.colonnes.length, s.D); const vus = [...C.memeLongueur.flat(), ...C.autres].sort(); assert.deepEqual(vus, [...Array(s.D).keys()]);
      for (const k of T.ENTIERS[s.id]) assert.ok(Number.isInteger(s.params[k]) && Number.isInteger(s.bornes[k][0]) && Number.isInteger(s.bornes[k][1]), k); }
  });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, brut n*D fini, points null, lyapunov null, phrase anglaise`, () => {
      const r = S(s.id);
      assert.equal(r.bornee, true, r.raison); assert.equal(r.D, s.D); assert.equal(r.n, 1500);
      assert.equal(r.brut.length, 1500 * s.D); assert.ok(r.brut.every(Number.isFinite)); assert.equal(r.points, null); assert.equal(r.lyapunov, null);
      assert.ok(typeof r.uniteLyapunov === 'string' && r.uniteLyapunov.length > 5);
      if (r.film) { assert.equal(r.film.tailles.reduce((a, b) => a + b, 0), 1500); assert.equal(r.film.images, r.film.debuts.length); assert.ok(r.film.images >= 2); }
      assert.ok(typeof s.phrase === 'string' && s.phrase.length > 80 && /visualisation/.test(s.phrase) && s.nom && s.science);
      assert.ok(/^[\x20-\x7e]*$/.test(s.phrase + s.nom + s.science + T.COLONNES[s.id].colonnes.join('')), 'ASCII anglais');
      /* la page affiche "Check:" depuis le PREMIER invariant { mesure, formule } : il doit exister et etre fini */
      const premier = Object.values(r.invariants).find((v) => v && typeof v === 'object' && 'mesure' in v && 'formule' in v);
      assert.ok(premier && Number.isFinite(premier.mesure) && Number.isFinite(premier.formule), 'premier invariant compare');
    });
    ok(`${s.id} : determinisme (octets identiques, invariants identiques)`, () => { const a = sim(s.id); assert.ok(octets(a.brut).equals(octets(S(s.id).brut))); assert.equal(JSON.stringify(a.invariants), JSON.stringify(S(s.id).invariants)); });
    ok(`${s.id} : petits n (2 et 7) bornes et finis`, () => { for (const n of [2, 7]) { const r = sim(s.id, {}, { n }); assert.equal(r.bornee, true); assert.equal(r.brut.length, n * s.D); assert.ok(r.brut.every(Number.isFinite)); } });
    ok(`${s.id} : bornee a chaque extreme de curseur (un a un, tous min, tous max)`, () => {
      const cs = extremes(s);
      for (const p of cs) { const r = S(s.id, p); assert.equal(r.bornee, true, JSON.stringify(p)); assert.ok(r.brut.every(Number.isFinite), JSON.stringify(p)); }
      return cs.length + ' reglages';
    });
    ok(`${s.id} : chaque curseur change le DESSIN (standardise par colonne et par groupe de meme longueur), min/defaut/max`, () => {
      const groupes = T.COLONNES[s.id].memeLongueur, d0 = S(s.id), dets = [];
      for (const k of Object.keys(s.params)) {
        const m = [];
        for (const v of s.bornes[k]) { const ref = v === s.params[k] ? S(s.id, { [k]: s.bornes[k][0] === v ? s.bornes[k][1] : s.bornes[k][0] }) : d0, r = S(s.id, { [k]: v });
          m.push(ecartDessin(standardiser(ref.brut, ref.n, ref.D), standardiser(r.brut, r.n, r.D)), ecartDessin(standardiser(ref.brut, ref.n, ref.D, groupes), standardiser(r.brut, r.n, r.D, groupes))); }
        const pire = Math.min(...m); assert.ok(pire > 0.05, `${k} : ${m.map((x) => x.toFixed(3)).join(' ')}`);
        dets.push(`${k} ${m.map((x) => x.toFixed(2)).join('/')}`);
      }
      return dets.join(' ; ');
    });
  }
  // 2. rutherford
  for (const p of extremes(sys('rutherford'))) ok(`rutherford ${JSON.stringify(p)} : angle mesure = 2 atan(k/(2 E b_eff)) (Math.atan), r_min exact, E et L conserves, trace hors du noyau`, () => {
    const R = S('rutherford', p), P = R.params, I = R.invariants, D = I.deviation, se = D.serie, R0 = I.depart.R0, F = P.rayons;
    assert.equal(se.b.length, F); assert.ok(Math.abs(R0 - 2000 * (P.bMax + 1 / P.E)) < 1e-9);
    let pire = 0, pireR = 0;
    for (let j = 0; j < F; j++) {
      const b = P.bMax * (j + 1) / F, bEff = b * Math.sqrt(2 * (P.E - 1 / R0)) / Math.sqrt(2 * P.E), th = 2 * Math.atan(1 / (2 * P.E * bEff)), rm = 1 / (2 * P.E) + Math.sqrt(1 / (4 * P.E * P.E) + bEff * bEff);
      assert.ok(Math.abs(se.b[j] - b) < 1e-15 && Math.abs(se.bEff[j] - bEff) < 1e-12 * b, 'b_eff ' + j);
      assert.ok(Math.abs(se.formule[j] - th) < 1e-12, `formule ${j} ${se.formule[j]} vs ${th}`);
      const u = 1 / (2 * P.E * bEff); assert.ok(Math.abs(Math.cos(se.mesure[j]) - (1 - u * u) / (1 + u * u)) < 2e-7, 'cos theta algebrique ' + j);
      pire = Math.max(pire, Math.abs(se.mesure[j] - th));
      assert.ok(Math.abs(se.rMinFormule[j] - rm) < 1e-12 * rm && se.rMin[j] >= rm * (1 - 1e-12), 'r_min ' + j); pireR = Math.max(pireR, (se.rMin[j] - rm) / rm);
      if (j) assert.ok(se.mesure[j] < se.mesure[j - 1], 'deviation decroit avec b');
    }
    assert.ok(pire < 2e-7, 'angle ' + pire); assert.ok(pireR < 1e-5, 'r_min ' + pireR); assert.ok(Math.abs(D.pireEcart - pire) < 1e-15);
    assert.ok(I.energie.derive < 1e-10 && Math.abs(I.energie.debut - P.E) < 1e-12, 'E ' + I.energie.derive); assert.ok(I.momentCinetique.derive < 1e-9, 'L ' + I.momentCinetique.derive);
    const b = R.brut, W = I.depart.fenetre, rmin0 = se.rMinFormule.reduce((a, x) => Math.min(a, x), Infinity);
    for (let f = 0; f < R.film.images; f++) { const d0 = R.film.debuts[f], c = R.film.tailles[f];
      for (let r = 0; r < c; r++) { const o = 4 * (d0 + r); assert.ok(Math.abs(b[o]) <= W + 1e-9 && Math.abs(b[o + 1]) <= W + 1e-9 && Math.hypot(b[o], b[o + 1]) >= rmin0 * (1 - 1e-4), 'point ' + f + ' ' + r); assert.ok(b[o + 2] === b[4 * d0 + 2]); if (r) assert.ok(b[o + 3] >= b[o - 1]); } }
    return `theta ${D.mesure.toFixed(9)}/${D.formule.toFixed(9)}, pire ${pire.toExponential(2)} rad, r_min ${pireR.toExponential(1)}, E ${I.energie.derive.toExponential(1)}`;
  });
  // 3. logistique
  ok('logistique : doublements MESURES r1 = 3 et r2 = 1 + sqrt 6 a 1e-9 ; r3, r4 encadres par iteration brute (periodes 4|8 et 8|16)', () => {
    const F = S('logistique').invariants, r1 = F.doublement1.mesure, r2 = F.doublement2.mesure, { r3, r4 } = F.feigenbaum;
    assert.equal(F.doublement1.formule, 3); assert.ok(Math.abs(F.doublement2.formule - (1 + Math.sqrt(6))) < 1e-15);
    assert.ok(Math.abs(r1 - 3) < 1e-9 && Math.abs(r2 - 1 - Math.sqrt(6)) < 1e-9, `${r1} ${r2}`);
    assert.ok(r1 < r2 && r2 < r3 && r3 < r4 && r4 < 4);
    assert.equal(periodeBrute(r1 - 1e-2), 1); assert.equal(periodeBrute(r1 + 1e-2), 2); assert.equal(periodeBrute(r2 - 1e-3), 2); assert.equal(periodeBrute(r2 + 1e-3), 4);
    assert.equal(periodeBrute(r3 - 1e-3), 4); assert.equal(periodeBrute(r3 + 1e-3), 8); assert.equal(periodeBrute(r4 - 2e-4), 8); assert.equal(periodeBrute(r4 + 2e-4), 16);
    const q1 = F.feigenbaum.rapport1, q2 = F.feigenbaum.rapport2;
    assert.ok(Math.abs(q1 - (r2 - r1) / (r3 - r2)) < 1e-12 && Math.abs(q2 - (r3 - r2) / (r4 - r3)) < 1e-12 && q1 > 1 && q2 > 1);
    return `r1 ${r1} r2 ${r2} r3 ${r3.toFixed(9)} r4 ${r4.toFixed(9)} ; rapports MESURES ${q1.toFixed(4)} ${q2.toFixed(4)} (constante non ecrite)`;
  });
  for (const p of extremes(sys('logistique'))) ok(`logistique ${JSON.stringify(p)} : chaque ligne x_{n+1} = r x_n (1 - x_n), colonnes de r reguliers, point fixe 1 - 1/r et 2-cycle exacts`, () => {
    const R = S('logistique', p), P = R.params, I = R.invariants, b = R.brut, Dg = I.diagramme, C = Math.max(1, Math.floor(1500 / P.points));
    assert.equal(Dg.colonnes, C); assert.equal(Dg.parColonne, P.points);
    let pf = 0, p2 = 0, nf = 0, n2 = 0, rPrec = -1;
    for (let c = 0; c < C; c++) {
      const l0 = Math.floor(c * 1500 / C), l1 = Math.floor((c + 1) * 1500 / C), r = b[3 * l0];
      assert.ok(Math.abs(r - (C === 1 ? P.rMin : P.rMin + (P.rMax - P.rMin) * c / (C - 1))) < 1e-12 && r > rPrec); rPrec = r;
      for (let l = l0; l < l1; l++) { const o = 3 * l; assert.equal(b[o], r); assert.ok(b[o + 2] === fLog(r, b[o + 1]) && b[o + 1] >= 0 && b[o + 1] <= 1); if (l > l0) assert.equal(b[o + 1], b[o - 1]);
        if (r >= 1.1 && r <= 2.9) pf = Math.max(pf, Math.abs(b[o + 1] - (1 - 1 / r)));
        if (r >= 3.05 && r <= 3.4) { const [h, q] = deuxCycleRef(r); p2 = Math.max(p2, Math.min(Math.abs(b[o + 1] - h), Math.abs(b[o + 1] - q))); } }
      if (r >= 1.1 && r <= 2.9) nf++; if (r >= 3.05 && r <= 3.4) n2++;
    }
    assert.equal(Dg.colonnesPointFixe, nf); assert.equal(Dg.colonnesDeuxCycle, n2);
    assert.ok(pf < 1e-12 && p2 < 1e-12 && Math.abs(Dg.pireEcartPointFixe - pf) < 1e-15 && Math.abs(Dg.pireEcartDeuxCycle - p2) < 1e-15, `${pf} ${p2}`);
    const [h] = deuxCycleRef(3.2); assert.ok(Math.abs(fLog(3.2, fLog(3.2, h)) - h) < 1e-14);
    assert.ok(Math.abs(I.pointFixe.formule - 0.6) < 1e-15 && Math.abs(I.pointFixe.mesure - 0.6) < 1e-12 && Math.abs(I.deuxCycle.formule - h) < 1e-14 && Math.abs(I.deuxCycle.mesure - h) < 1e-12);
    return `${C} colonnes, point fixe ${nf} colonnes (${pf.toExponential(1)}), 2-cycle ${n2} colonnes (${p2.toExponential(1)})`;
  });
  // 4. chaleur
  for (const p of extremes(sys('chaleur'))) ok(`chaleur ${JSON.stringify(p)} : variance = sigma0^2 + 2 D t a chaque image (identite du schema), chaleur conservee, stable, pic gaussien`, () => {
    const R = S('chaleur', p), P = R.params, I = R.invariants, V = I.variance, G = I.grille, b = R.brut;
    const s0 = G.dx * G.dx * (G.cellulesInitiales ** 2 - 1) / 12, sT = s0 + 2 * P.D * P.duree;
    assert.ok(Math.abs(V.sigma0carre - s0) < 1e-15 * (1 + s0) && Math.abs(V.formule - sT) < 1e-12 * sT, 'formule');
    assert.ok(G.cellulesInitiales % 2 === 1 && Math.abs(G.cellulesInitiales * G.dx - P.largeur) <= 2 * G.dx + 1e-12 && G.cellulesInitiales >= 5, 'creneau ~ largeur'); assert.ok(G.margeSigma >= 8 && Math.abs(G.margeSigma - G.demiLargeur / Math.sqrt(sT)) < 1e-12, 'bord froid');
    assert.ok(G.nombreDeFourier <= 0.4 + 1e-12 && Math.abs(G.dt * G.pas - P.duree) < 1e-12 * P.duree && Math.abs(G.nombreDeFourier - P.D * G.dt / G.dx ** 2) < 1e-12, 'stabilite');
    assert.ok(V.ecart < 1e-12, 'variance ' + V.ecart);
    V.serie.t.forEach((t, k) => { assert.ok(Math.abs(V.serie.formule[k] - (s0 + 2 * P.D * t)) < 1e-12 * sT && Math.abs(V.serie.variance[k] - V.serie.formule[k]) < 1e-12 * sT, 'image ' + k); });
    assert.ok(I.chaleur.derive < 1e-13 && Math.abs(I.chaleur.debut - 1) < 1e-12, 'chaleur ' + I.chaleur.derive); assert.ok(Math.abs(I.centre.mesure) < 1e-12);
    const ratio = s0 / sT, P_ = I.pic; assert.equal(P_.comparable, ratio <= 0.1);
    if (P_.comparable) { assert.ok(Math.abs(P_.formule - 1 / Math.sqrt(2 * Math.PI * sT)) < 1e-12 / Math.sqrt(sT)); const e = Math.abs(P_.mesure / P_.formule - 1); assert.ok(e < 0.2 * ratio * ratio + 0.5 * G.dx * G.dx / sT, `pic ${e} (ratio ${ratio}, dx^2/s^2 ${G.dx * G.dx / sT})`); }
    for (let f = 0; f < R.film.images; f++) { const d0 = R.film.debuts[f], c = R.film.tailles[f];
      for (let r = 0; r < c; r++) { const o = 3 * (d0 + r); assert.ok(b[o + 2] >= 0 && b[o + 1] === b[3 * d0 + 1] && Math.abs(b[o]) <= G.fenetreDessin + 1e-9 && Math.abs(G.fenetreDessin - 3) <= G.dx); if (r) assert.ok(b[o] > b[o - 3]); }
      if (f) assert.ok(b[3 * d0 + 1] > b[3 * R.film.debuts[f - 1] + 1]); }
    assert.equal(b[1], 0); assert.ok(Math.abs(b[3 * 1499 + 1] - P.duree) < 1e-12);
    return `var ${V.mesure.toFixed(6)}/${V.formule.toFixed(6)} (${V.ecart.toExponential(1)}), chaleur ${I.chaleur.derive.toExponential(1)}, pic ${P_.comparable ? Math.abs(P_.mesure / P_.formule - 1).toExponential(1) : 'non compare'}`;
  });
  ok('chaleur : la variance initiale du creneau discret vaut w^2/12 (continu) a moins de deux cellules', () => {
    const G = S('chaleur').invariants.grille, w = S('chaleur').params.largeur; assert.ok(Math.abs(Math.sqrt(12 * S('chaleur').invariants.variance.sigma0carre) - w) < 2 * G.dx);
  });
  // 5. oscillateurForce
  for (const p of extremes(sys('oscillateurForce'))) ok(`oscillateurForce ${JSON.stringify(p)} : chaque point dessine = solution analytique (transitoire compris), amplitude et phase exactes, resonance sqrt(1 - 2 gamma^2)`, () => {
    const R = S('oscillateurForce', p), P = R.params, I = R.invariants, A = I.amplitude, b = R.brut, X = oscExact(P.gamma, P.omega, 1, P.x0, 0);
    assert.ok(Math.abs(A.formule - X.A) < 1e-12 * X.A, 'formule A'); assert.ok(A.ecart < 1e-6 && A.stabilite < 1e-6, `A ${A.ecart} ${A.stabilite}`);
    const D2 = (1 - P.omega ** 2) ** 2 + (2 * P.gamma * P.omega) ** 2, Ph = I.phase;
    assert.ok(Math.abs(Ph.formuleCos - (1 - P.omega ** 2) / D2) < 1e-12 && Math.abs(Ph.formuleSin - 2 * P.gamma * P.omega / D2) < 1e-12);
    assert.ok(Math.abs(Ph.mesureCos - Ph.formuleCos) < 1e-6 * X.A && Math.abs(Ph.mesureSin - Ph.formuleSin) < 1e-6 * X.A, 'phase');
    let pire = 0; for (let l = 0; l < R.n; l++) { const o = 3 * l, t = b[o + 2]; pire = Math.max(pire, Math.abs(b[o] - X.x(t)), Math.abs(b[o + 1] - X.v(t)) / Math.max(1, P.omega)); if (l) assert.ok(t > b[o - 1]); }
    assert.ok(pire < 1e-6 * (1 + X.A), 'trace ' + pire); assert.ok(b[0] === P.x0 && b[1] === 0 && b[2] === 0); assert.equal(I.regime.pasParPeriode, 200 * Math.max(1, Math.ceil(1 / P.omega)));
    const Z = I.resonance;
    if (2 * P.gamma ** 2 < 0.72) { const wr = Math.sqrt(1 - 2 * P.gamma ** 2); assert.ok(Math.abs(Z.formule - wr) < 1e-15 && Math.abs(Z.mesure - wr) < 1e-5 && !Z.bord, `resonance ${Z.mesure} vs ${wr}`);
      const Ap = 1 / (2 * P.gamma * Math.sqrt(1 - P.gamma ** 2)); assert.ok(Math.abs(Z.amplitudePicFormule - Ap) < 1e-12 * Ap && Math.abs(Z.amplitudePic / Ap - 1) < 1e-6, 'A du pic'); }
    else assert.equal(Z.existe, false);
    return `A ${A.mesure.toFixed(7)}/${A.formule.toFixed(7)} (${A.ecart.toExponential(1)}), trace ${pire.toExponential(1)}${Z.mesure !== undefined ? ', omega_r ' + Z.mesure.toFixed(8) + '/' + Z.formule.toFixed(8) : ''}`;
  });
  // 6. brachistochrone
  for (const p of extremes(sys('brachistochrone'))) ok(`brachistochrone ${JSON.stringify(p)} : cycloide = sqrt(a/g) theta_B, droite exacte, arc = quadrature, la cycloide gagne, points sur leurs courbes`, () => {
    const R = S('brachistochrone', p), P = R.params, I = R.invariants, C = I.cycloide, b = R.brut, th = C.thetaB, a = C.a;
    assert.ok(Math.abs((th - Math.sin(th)) / (1 - Math.cos(th)) - P.X / P.Y) < 1e-10 * (P.X / P.Y) && Math.abs(a * (1 - Math.cos(th)) - P.Y) < 1e-12, 'cycloide par B');
    assert.ok(Math.abs(C.formule - Math.sqrt(a) * th) < 1e-12 && C.ecart < 1e-7, 'cycloide ' + C.ecart);
    assert.ok(Math.abs(C.ordre - 2) < 0.1, 'ordre ' + C.ordre);
    const Tl = Math.sqrt(2 * (P.X ** 2 + P.Y ** 2) / P.Y); assert.ok(Math.abs(I.droite.formule - Tl) < 1e-12 * Tl && I.droite.ecart < 1e-12, 'droite');
    const Rr = (P.X ** 2 + P.Y ** 2) / (2 * P.X), ta = tempsArc(Rr, I.arc.phiB);
    assert.ok(Math.abs(I.arc.rayon - Rr) < 1e-12 && Math.abs(Rr + Rr * Math.cos(I.arc.phiB) - P.X) < 1e-9 && Math.abs(Rr * Math.sin(I.arc.phiB) + P.Y) < 1e-9, 'arc par B');
    assert.ok(Math.abs(I.arc.mesure - ta) < 1e-6 * ta, `arc ${I.arc.mesure} vs ${ta}`);
    assert.equal(I.course.gagnant, 'cycloid'); assert.ok(C.mesure < I.droite.mesure && C.mesure < I.arc.mesure);
    const F = R.film; assert.equal(F.images, 3);
    for (let f = 0; f < 3; f++) { const d0 = F.debuts[f], c = F.tailles[f], T = I.course.temps[f];
      for (let r = 0; r < c; r++) { const o = 3 * (d0 + r), x = b[o], y = b[o + 1];
        assert.ok(y <= 1e-15, 'sous le depart'); if (r) assert.ok(b[o + 2] > b[o - 1]);
        if (f === 1) assert.ok(Math.abs(y + P.Y / P.X * x) < 1e-12 * (1 + P.Y));
        if (f === 2) assert.ok(Math.abs(Math.hypot(x - Rr, y) - Rr) < 1e-6 * Rr);
        if (f === 0) { /* sur la cycloide : y = -a (1 - cos th(x)), th(x) par bisection en Math */ let lo = 0, hi = th; for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (a * (m - Math.sin(m)) < x) lo = m; else hi = m; } assert.ok(Math.abs(y + a * (1 - Math.cos((lo + hi) / 2))) < 1e-6 * a, 'cycloide ' + r); } }
      assert.ok(Math.abs(b[3 * (d0 + c - 1) + 2] - T) < 1e-12 * T && Math.abs(b[3 * (d0 + c - 1)] - P.X) < 1e-9 && Math.abs(b[3 * (d0 + c - 1) + 1] + P.Y) < 1e-9, 'arrivee en B'); }
    return `cycloid ${C.mesure.toFixed(8)}/${C.formule.toFixed(8)} (${C.ecart.toExponential(1)}, ordre ${C.ordre.toFixed(3)}), line ${I.droite.mesure.toFixed(6)}, arc ${I.arc.mesure.toFixed(6)}/${ta.toFixed(6)}`;
  });
  // 7. galton
  for (const p of [...extremes(sys('galton')), { graine: 2 }, { graine: 3, billes: 5000 }, { graine: 4, rangees: 30, billes: 100 }, { penchant: 0.25, graine: 5 }, { penchant: 0.8, rangees: 7, graine: 6 }]) ok(`galton ${JSON.stringify(p)} : binomiale exacte B(L, q), moyenne L (q - 1/2) et variance L q (1 - q) a 4.5 sigma, chi2, chemins a pas de 1/2, tas sous les cases`, () => {
    const R = S('galton', p), P = R.params, I = R.invariants, Bn = I.binomiale, L = P.rangees, N = P.billes, q = P.penchant, pq = q * (1 - q), b = R.brut;
    const pr = q === 0.5 ? binomRef(L) : binomRefQ(L, q), kc = q === 0.5 ? Math.floor(L / 2) : Math.floor((L + 1) * q);
    Bn.probabilites.forEach((x, k) => assert.ok(Math.abs(x - pr[k]) < 1e-15, 'p ' + k));
    /* la case de reference est bien la plus probable (le mode) */
    assert.ok(pr.every((x) => x <= pr[kc] + 1e-15), 'mode ' + kc);
    assert.ok(Math.abs(Bn.frequences.reduce((a, x) => a + x, 0) - 1) < 1e-12 && Math.abs(Bn.formule - pr[kc]) < 1e-15 && Math.abs(Bn.sigma - Math.sqrt(pr[kc] * (1 - pr[kc]) / N)) < 1e-15);
    const M = I.moyenne, V = I.variance;
    assert.ok(Math.abs(M.sigma - Math.sqrt(L * pq / N)) < 1e-15 && Math.abs(V.sigma - Math.sqrt(L * pq * (1 + (2 * L - 6) * pq) / N)) < 1e-15 && Math.abs(V.formule - L * pq) < 1e-12 && Math.abs(M.formule - L * (q - 0.5)) < 1e-12);
    if (q === 0.5) assert.ok(Math.abs(V.sigma - Math.sqrt(L * (L - 1) / (8 * N))) < 1e-15 && V.formule === L / 4 && M.formule === 0, 'sans penchant : les formules d avant');
    let s1 = 0, s2 = 0; Bn.frequences.forEach((fq, k) => { s1 += fq * (k - L / 2); s2 += fq * (k - L / 2) ** 2; });
    assert.ok(Math.abs(M.mesure - s1) < 1e-12 && Math.abs(V.mesure - (s2 - s1 * s1)) < 1e-9, 'moments = histogramme');
    assert.ok(Math.abs(M.mesure - M.formule) < 4.5 * M.sigma && Math.abs(V.mesure - V.formule) < 4.5 * V.sigma, `moyenne ${M.mesure} +- ${M.sigma}, variance ${V.mesure} +- ${V.sigma}`);
    assert.ok(Bn.chi2 < Bn.ddl + 5 * Math.sqrt(2 * Math.max(1, Bn.ddl)) && Bn.pireEcartSigma < 4.5, `chi2 ${Bn.chi2} ddl ${Bn.ddl} pire ${Bn.pireEcartSigma}`);
    const B = I.dessin.chemins; assert.equal(B, Math.min(N, Math.floor(750 / (L + 1))));
    for (let c = 0; c < B; c++) for (let j = 0; j <= L; j++) { const o = 3 * (c * (L + 1) + j); assert.ok(b[o + 1] === -j && b[o + 2] === c); if (j) assert.ok(Math.abs(Math.abs(b[o] - b[o - 3]) - 0.5) < 1e-15); else assert.equal(b[o], 0); }
    for (let r = B * (L + 1); r < R.n; r++) { const o = 3 * r; assert.ok(b[o + 1] < -(L + 1) && b[o + 1] >= -(2 * L + 1) && Number.isInteger(b[o] + L / 2) && Math.abs(b[o]) <= L / 2); }
    /* game97 : la pile MONTE depuis le fond — dans une meme case, une bille arrivee plus tard (indice plus grand) est plus HAUTE */
    { const haut = new Map(); for (let r = B * (L + 1); r < R.n; r++) { const o = 3 * r, avant = haut.get(b[o]);
        if (avant && b[o + 2] > avant[0]) assert.ok(b[o + 1] > avant[1], 'la pile monte (case ' + b[o] + ')');
        if (!avant || b[o + 2] > avant[0]) haut.set(b[o], [b[o + 2], b[o + 1]]); } }
    return `mean ${M.mesure.toFixed(4)} (+-${M.sigma.toFixed(4)}), var ${V.mesure.toFixed(4)}/${V.formule.toFixed(4)} (+-${V.sigma.toFixed(4)}), chi2 ${Bn.chi2.toFixed(1)}/${Bn.ddl}, pire ${Bn.pireEcartSigma.toFixed(2)} sigma`;
  });
  /* game105 : le sigma de la VARIANCE (4e moment central de la binomiale) contre la dispersion reelle sur 120 graines, a q = 0.2 */
  ok('galton penchant 0.2 : sigma de la variance derive = dispersion mesuree sur 120 graines (a 25 %)', () => {
    const vs = []; let sig = 0;
    for (let g = 1; g <= 120; g++) { const V = S('galton', { penchant: 0.2, rangees: 10, billes: 300, graine: g }).invariants.variance; vs.push(V.mesure); sig = V.sigma; }
    const m = vs.reduce((a, x) => a + x, 0) / vs.length, sd = Math.sqrt(vs.reduce((a, x) => a + (x - m) ** 2, 0) / (vs.length - 1));
    assert.ok(Math.abs(sd / sig - 1) < 0.25, `dispersion ${sd} contre sigma ${sig}`);
    return `ratio ${(sd / sig).toFixed(3)}`;
  });
  ok('galton : sans penchant, les octets sont ceux d avant (rejeu des oeuvres)', () => {
    /* q = 0.5 doit donner EXACTEMENT 2^-L par case et le meme tirage : on compare au calcul d avant game105, c / 2^L */
    const a = S('galton'), L = a.params.rangees, c = [1]; for (let k = 1; k <= L; k++) c.push(c[k - 1] * (L - k + 1) / k);
    const pr = c.map((x) => x / 2 ** L);
    assert.ok(a.invariants.binomiale.probabilites.every((x, k) => x === pr[k]), 'probabilites identiques au bit pres');
    assert.ok(S('galton', { penchant: 0.5 }).brut.every((x, i) => x === a.brut[i]));
  });
  ok('galton : la graine change le tirage, pas la loi', () => { const a = S('galton'), c = S('galton', { graine: 2 }); assert.ok(!octets(a.brut).equals(octets(c.brut))); assert.deepEqual(a.invariants.binomiale.probabilites, c.invariants.binomiale.probabilites); });
  // 8. bornage
  ok('bornage : hors bornes ramene, NaN -> defaut, entiers arrondis', () => {
    assert.deepEqual(sim('rutherford', { E: 9, bMax: 'x', rayons: 7.6 }, { n: 50 }).params, { E: 4, bMax: 2, rayons: 8 });
    assert.deepEqual(sim('logistique', { rMin: 0, rMax: 5, points: 9.4 }, { n: 50 }).params, { rMin: 1, rMax: 4, points: 9 });
    assert.deepEqual(sim('galton', { billes: 99999, rangees: 3.5, graine: NaN }, { n: 50 }).params, { billes: 5000, rangees: 4, penchant: 0.5, graine: 1 });
    assert.equal(sim('galton', { penchant: 2 }, { n: 50 }).params.penchant, 0.9);
    assert.deepEqual(sim('chaleur', { D: -1, duree: Infinity, largeur: null }, { n: 50 }).params, { D: 0.05, duree: 1, largeur: 0.1 });
  });
  ok('reglagesPhysique : forme, valeur bornee', () => {
    const r = T.reglagesPhysique('oscillateurForce', { omega: 99 });
    assert.deepEqual(r.map((x) => x.chemin), ['params.gamma', 'params.omega', 'params.x0']);
    assert.deepEqual(r[1], { chemin: 'params.omega', nom: 'omega', min: 0.2, max: 3, valeur: 3 });
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
/* la constante de Feigenbaum n est ecrite nulle part (ni module ni banc) : motif assemble pour ne pas se trouver lui-meme */
const feig = new RegExp(['4\\.6' + '69', '4\\.66' + '92', '2\\.50' + '29'].join('|'));
assertions++; if (feig.test(src) || feig.test(moi)) ech.push({ nom: 'constante de Feigenbaum ecrite', det: '' });
console.log(`${feig.test(src) ? 'ECHEC ' : 'OK    '}constante de Feigenbaum absente du module (mesuree, jamais ecrite)`);
/* aucune valeur marquee comme sans source lue (motif assemble pour ne pas se trouver lui-meme) */
const marque = new RegExp(['de m' + 'emoire', 'from m' + 'emory', 'de t' + 'ete', 'a sour' + 'cer', 'unsour' + 'ced', 'non sour' + 'ce', 'TO' + 'DO'].join('|'), 'i');
const marques = [src, moi].flatMap((t, i) => t.split(/\r?\n/).map((l, j) => [i ? 'test' : 'module', j + 1, l]).filter(([, , l]) => marque.test(l)));
assertions++; if (marques.length) ech.push({ nom: 'valeur marquee sans source lue', det: marques.map(([f, j]) => f + ':' + j).join(',') });
console.log(`${marques.length ? 'ECHEC ' : 'OK    '}aucune valeur marquee sans source lue (module + banc)`);

console.log('\nTEMPS simuler(id) a n = 1500 (mediane de 3), defauts et chaque extreme de curseur :');
let pireTemps = 0, pireOu = '';
for (const s of T.SYSTEMES) {
  let pire = 0, ou = '';
  for (const p of extremes(s)) {
    const t = []; for (let k = 0; k < 3; k++) { const a = performance.now(); T.simuler(s.id, p); t.push(performance.now() - a); }
    t.sort((a, b) => a - b); if (t[1] > pire) { pire = t[1]; ou = JSON.stringify(p); }
  }
  console.log(`  ${s.id.padEnd(18)} pire ${pire.toFixed(1)} ms  ${ou}`);
  if (pire > pireTemps) { pireTemps = pire; pireOu = s.id + ' ' + ou; }
  assertions++; if (!(pire < 150)) ech.push({ nom: 'temps ' + s.id + ' < 150 ms', det: pire.toFixed(1) + ' ' + ou });
}
console.log(`  pire de tous : ${pireTemps.toFixed(1)} ms (${pireOu})`);

// ---------- mutants (copies dans un dossier temporaire ; l import du moteur pointe vers l original ; fins de ligne gardees) ----------
const MUTANTS = [
  ['Rutherford : force attractive', 'c = k / (r2 * r); return [c * px, c * py];', 'c = -k / (r2 * r); return [c * px, c * py];'],
  ['Rutherford : tan(theta/2) = k/(E b) (facteur 2 perdu)', 'const deviationRutherford = (E, b, k = 1) => 2 * atanD(k / (2 * E * b));', 'const deviationRutherford = (E, b, k = 1) => 2 * atanD(k / (E * b));'],
  ['Rutherford : b de depart au lieu du b asymptotique', 'bEff = Math.abs(L0) / Math.sqrt(2 * E0)', 'bEff = b'],
  ['Rutherford : RK4 mal pondere sur la position', 'x += h / 6 * (vx + 2 * u2 + 2 * u3 + u4)', 'x += h / 6 * (vx + u2 + 3 * u3 + u4)'],
  ['Rutherford : r_min avec d^2/2', 'return d / 2 + Math.sqrt(d * d / 4 + b * b);', 'return d / 2 + Math.sqrt(d * d / 2 + b * b);'],
  ['atan : une seule reduction comptee (2 s au lieu de 4 s)', 'return 4 * s;', 'return 2 * s;'],
  ['logistique : multiplicateur r (1 - x) au lieu de r (1 - 2x)', 'let y = x, d = 1; for (let i = 0; i < p; i++) { d *= r * (1 - 2 * y);', 'let y = x, d = 1; for (let i = 0; i < p; i++) { d *= r * (1 - y);'],
  ['logistique : bisection sur -0.9 au lieu de -1', 'if (cm.lambda > -1) { lo = m;', 'if (cm.lambda > -0.9) { lo = m;'],
  ['logistique : 2-cycle avec (r - 2)', 'const deuxCycleHaut = (r) => (r + 1 + Math.sqrt((r + 1) * (r - 3))) / (2 * r);', 'const deuxCycleHaut = (r) => (r + 1 + Math.sqrt((r + 1) * (r - 2))) / (2 * r);'],
  ['logistique : point fixe 1 - 1/(r + 0.01) dans le diagramme', 'Math.abs(x - (1 - 1 / r))', 'Math.abs(x - (1 - 1 / (r + 0.01)))'],
  ['logistique : application r x (1 - x^2) dans le diagramme', 'const y = r * x * (1 - x), o = 3 * l;', 'const y = r * x * (1 - x * x), o = 3 * l;'],
  ['chaleur : laplacien -2.01 u', '(d - 2 * u[i] + g)', '(d - 2.01 * u[i] + g)'],
  ['chaleur : sigma0^2 = dx^2 m^2/12', 'sigma0 = dx * dx * (m * m - 1) / 12', 'sigma0 = dx * dx * (m * m) / 12'],
  ['chaleur : sigma^2 = sigma0^2 + D t', 'const fin = moments(u), sT = sigma0 + 2 * Dc * T', 'const fin = moments(u), sT = sigma0 + Dc * T'],
  ['chaleur : pas instable (D dt/dx^2 = 0.6)', 'Math.ceil(T * Dc / (0.4 * dx * dx))', 'Math.ceil(T * Dc / (0.6 * dx * dx))'],
  ['oscillateur : amplitude avec (gamma omega)^2', '(2 * gamma * w) * (2 * gamma * w));', '(gamma * w) * (gamma * w));'],
  ['oscillateur : amortissement gamma au lieu de 2 gamma', '-px - 2 * gamma * pv', '-px - gamma * pv'],
  ['oscillateur : resonance sqrt(1 - gamma^2)', 'Math.sqrt(w0 * w0 - 2 * gamma * gamma) : 0', 'Math.sqrt(w0 * w0 - gamma * gamma) : 0'],
  ['oscillateur : forcage du 2e etage RK4 au mauvais instant', 'acc(x + h / 2 * k1x, v + h / 2 * k1v, j + 1)', 'acc(x + h / 2 * k1x, v + h / 2 * k1v, j + 2)'],
  ['brachistochrone : T = sqrt(2a/g) theta', 'Math.sqrt(a / G_BRACHI) * thB', 'Math.sqrt(2 * a / G_BRACHI) * thB'],
  ['brachistochrone : vitesse sqrt(1.9 g h)', 'Math.max(0, -2 * G_BRACHI * py[k + 1])', 'Math.max(0, -1.9 * G_BRACHI * py[k + 1])'],
  ['brachistochrone : equation de theta_B avec 1 + cos', '(m - sinD(m)) / (1 - cosD(m))', '(m - sinD(m)) / (1 + cosD(m))'],
  ['galton : piece biaisee (+0.02 sur le penchant)', 'if (alea() < q) k++;', 'if (alea() < q + 0.02) k++;'],
  ['galton : binomiale (L - k)/k', 'c.push(c[k - 1] * (L - k + 1) / k)', 'c.push(c[k - 1] * (L - k) / k)'],
  ['galton : sigma de la variance sans le 4e moment', 'Math.sqrt(L * pq * (1 + (2 * L - 6) * pq) / N)', 'Math.sqrt(L * pq * (1 + (2 * L - 2) * pq) / N)'],
  ['galton : la case de reference reste la centrale avec penchant', 'Math.min(L, Math.floor((L + 1) * q))', 'Math.floor(L / 2)'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['Math.random injecte (galton)', 'alea = mulberry32(P.graine >>> 0), nChemins', 'alea = Math.random, nChemins'],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-theories-3-mutants-'));
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
console.log(`test-tam-theories-3-20261102 : ${assertions} assertions OK`);
