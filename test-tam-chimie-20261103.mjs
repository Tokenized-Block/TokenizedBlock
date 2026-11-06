// test-tam-chimie-20261103.mjs -- banc de tam-chimie.js (chimie, vue non frappable) + mutants sur COPIES.
// Lancer : node test-tam-chimie-20261103.mjs
// Le banc a le droit a Math.exp/log : ses references sont calculees independamment du module
//   (Bateman et equilibre par Math.exp ; pour le brusselator, la jacobienne est recalculee par DIFFERENCES FINIES du champ de vitesses
//   au point fixe, ses valeurs propres resolues ici — sans lire la formule tr/2 du module).
// REFERENCES : aucune valeur publiee ; chaque formule est recalculee ici depuis sa definition.
// Chaque verification tourne aux defauts ET a chaque extreme de curseur (un a un, tous min, tous max).
// Tolerances annoncees (mesurees le 2026-11-03, sonde de 40 graines par reglage, puis marge) :
//   formules recalculees a 1e-12 relatif ; |z| < 5 (pire mesure 3.4) ; etalonnage : ecart-type des z sur 20 graines dans [0.5, 1.7]
//   (mesure 0.88..1.18) ; brusselator : point fixe a 1e-6 relatif, periode lineaire a 1e-3 (mesure < 1e-5), taux d amortissement a 3 %
//   (moindres carres sur ln d : mesure 0.2..1.5 %, biais de l ellipticite de la spirale) hors cas degenere (signale approche).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-chimie.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const IDS = ['reactionsChaine', 'equilibreChimique', 'brusselator', 'gazParfait', 'carnot', 'titrageAcideFaible'];

// ---------- references independantes (Math autorise ici) ----------
const aRef = (k1, t) => Math.exp(-k1 * t);
const bRef = (k1, k2, t) => (Math.abs(k1 - k2) < 1e-12 ? k1 * t * Math.exp(-k1 * t) : k1 / (k2 - k1) * (Math.exp(-k1 * t) - Math.exp(-k2 * t)));
/* jacobienne du brusselator par differences finies centrees au point fixe, puis la plus grande partie reelle des valeurs propres */
function tauxRef(A, B) {
  const f = (x, y) => [A - (B + 1) * x + x * x * y, B * x - x * x * y], xs = A, ys = B / A, e = 1e-6;
  const fx1 = f(xs + e, ys), fx0 = f(xs - e, ys), fy1 = f(xs, ys + e), fy0 = f(xs, ys - e);
  const J = [[(fx1[0] - fx0[0]) / (2 * e), (fy1[0] - fy0[0]) / (2 * e)], [(fx1[1] - fx0[1]) / (2 * e), (fy1[1] - fy0[1]) / (2 * e)]];
  const tr = J[0][0] + J[1][1], det = J[0][0] * J[1][1] - J[0][1] * J[1][0], disc = tr * tr - 4 * det;
  return disc < 0 ? { re: tr / 2, omega: Math.sqrt(-disc) / 2 } : { re: (tr + Math.sqrt(disc)) / 2, omega: NaN };
}
function standardiser(b, n, D, groupes = []) {
  const z = new Float64Array(n * D), moy = [], et = [];
  for (let j = 0; j < D; j++) { let m = 0; for (let i = 0; i < n; i++) m += b[i * D + j]; m /= n; let v = 0; for (let i = 0; i < n; i++) v += (b[i * D + j] - m) ** 2; moy.push(m); et.push(Math.sqrt(v / n)); }
  for (const g of groupes) { const e = Math.sqrt(g.reduce((a, j) => a + et[j] * et[j], 0) / g.length); for (const j of g) et[j] = e; }
  for (let j = 0; j < D; j++) { const s = et[j] > 0 ? 1 / et[j] : 0; for (let i = 0; i < n; i++) z[i * D + j] = (b[i * D + j] - moy[j]) * s; }
  return z;
}
const ecartDessin = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };
function extremes(s) {
  const ks = Object.keys(s.params), cs = [{}];
  for (const k of ks) { cs.push({ [k]: s.bornes[k][0] }); cs.push({ [k]: s.bornes[k][1] }); }
  cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][0]]))); cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][1]])));
  return cs;
}
const z = (v) => (v.mesure - v.formule) / v.sigma;
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const cache = new Map(), S = (id, p = {}) => { const k = id + JSON.stringify(p); if (!cache.has(k)) cache.set(k, T.simuler(id, p)); return cache.get(k); };
  const sys = (id) => T.SYSTEMES.find((s) => s.id === id);
  ok('SYSTEMES gele, SOURCES = texte lu + https, COLONNES couvre chaque colonne, ENTIERS par systeme', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES)); assert.deepEqual(T.SYSTEMES.map((s) => s.id), IDS); assert.deepEqual(Object.keys(T.SOURCES), ['pKaAcetique', 'Kw']); for (const v of Object.values(T.SOURCES)) assert.ok(v.valeur === Number(v.lu) && /^https:\/\//.test(v.url), JSON.stringify(v)); assert.deepEqual(Object.keys(T.ENTIERS), IDS);
    for (const s of T.SYSTEMES) { const C = T.COLONNES[s.id]; assert.equal(C.colonnes.length, s.D); assert.deepEqual([...C.memeLongueur.flat(), ...C.autres].sort(), [...Array(s.D).keys()]);
      for (const k of T.ENTIERS[s.id]) assert.ok(Number.isInteger(s.params[k]) && Number.isInteger(s.bornes[k][0]) && Number.isInteger(s.bornes[k][1]), k); }
  });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, brut n*D fini, lyapunov null, phrase anglaise sans accent`, () => {
      const r = S(s.id); assert.equal(r.bornee, true, r.raison); assert.equal(r.D, s.D); assert.equal(r.brut.length, 1500 * s.D);
      assert.equal(r.lyapunov, null); assert.ok(/^A visualisation of /.test(s.phrase) && !/[^\x20-\x7e]/.test(s.phrase + s.nom));
    });
    ok(`${s.id} : determinisme (octets identiques, invariants identiques)`, () => {
      const a = T.simuler(s.id, {}), b = T.simuler(s.id, {}); assert.ok(octets(a.brut).equals(octets(b.brut))); assert.equal(JSON.stringify(a.invariants), JSON.stringify(b.invariants));
    });
    ok(`${s.id} : petits n (2 et 7) bornes et finis`, () => { for (const n of [2, 7]) { const r = T.simuler(s.id, {}, { n }); assert.ok(r.bornee && r.brut.length === n * s.D); } });
    ok(`${s.id} : bornee a chaque extreme de curseur (un a un, tous min, tous max)`, () => { const e = extremes(s); for (const p of e) assert.ok(S(s.id, p).bornee, JSON.stringify(p)); return e.length + ' reglages'; });
    ok(`${s.id} : chaque curseur change le DESSIN (standardise), min et max`, () => {
      const C = T.COLONNES[s.id], d0 = S(s.id), z0 = standardiser(d0.brut, d0.n, d0.D, C.memeLongueur), out = [];
      for (const k of Object.keys(s.params)) for (const v of s.bornes[k]) { if (v === s.params[k]) continue; const r = S(s.id, { [k]: v }), e = ecartDessin(z0, standardiser(r.brut, r.n, r.D, C.memeLongueur)); assert.ok(e > 1e-3, k + '=' + v + ' : ' + e); out.push(k + ' ' + e.toFixed(2)); }
      return out.join(' ; ');
    });
  }
  for (const p of extremes(sys('reactionsChaine'))) ok(`reactionsChaine ${JSON.stringify(p)} : Bateman exact, pic t*, binomiale, parts monotones`, () => {
    const R = S('reactionsChaine', p), P = R.params, I = R.invariants, b = R.brut, k1 = P.k1, k2 = P.k2, N = P.molecules;
    const ts = Math.abs(k1 - k2) < 1e-12 ? 1 / k1 : Math.log(k1 / k2) / (k1 - k2);
    const Pk = I.picB; assert.ok(rel(Pk.tPic, ts) < 1e-12, 't* ' + Pk.tPic + ' ' + ts); assert.ok(rel(Pk.formule, bRef(k1, k2, ts)) < 1e-12, 'b(t*)');
    const h = 1e-5; assert.ok(bRef(k1, k2, ts) >= bRef(k1, k2, ts - h) && bRef(k1, k2, ts) >= bRef(k1, k2, ts + h), 't* est bien le maximum de b');
    assert.ok(rel(Pk.sigma, Math.sqrt(Pk.formule * (1 - Pk.formule) / N)) < 1e-12);
    assert.ok(rel(I.resteA.formule, Math.exp(-1)) < 1e-12 && rel(I.partA.formule, aRef(k1, ts)) < 1e-12);
    for (const k of ['picB', 'resteA', 'partA']) assert.ok(Math.abs(z(I[k])) < 5, k + ' z ' + z(I[k]));
    const Tf = 5 * (1 / k1 + 1 / k2); assert.equal(R.courbes.images, 3);
    /* game116 : trois courbes (A, B, C) ; A part de 1 et descend, C part de 0 et monte, chacune de t = 0 a T */
    for (let f = 0; f < 3; f++) { const d0 = R.courbes.debuts[f], c = R.courbes.tailles[f]; assert.equal(b[3 * d0], 0); assert.ok(rel(b[3 * (d0 + c - 1)], Tf) < 1e-12); assert.equal(b[3 * d0 + 1], f === 0 ? 1 : 0);
      for (let q = 0; q < c; q++) { const o = 3 * (d0 + q); assert.ok(b[o + 1] >= 0 && b[o + 1] <= 1 && b[o + 2] === f && Math.abs(b[o + 1] * N - Math.round(b[o + 1] * N)) < 1e-9); if (q) { assert.ok(b[o] > b[o - 3]); if (f === 0) assert.ok(b[o + 1] <= b[o - 2], 'A decroit'); if (f === 2) assert.ok(b[o + 1] >= b[o - 2], 'C croit'); } } }

    return `picB ${Pk.mesure.toFixed(4)}/${Pk.formule.toFixed(4)} z ${z(Pk).toFixed(2)}, t* ${ts.toFixed(3)}`;
  });
  for (const p of extremes(sys('equilibreChimique'))) ok(`equilibreChimique ${JSON.stringify(p)} : pi (1 - e^(-(kf+kb)t)), relaxation, K = kf/kb, puits`, () => {
    const R = S('equilibreChimique', p), P = R.params, I = R.invariants, b = R.brut, r = P.kf + P.kb, pi = P.kf / r, T8 = 8 / r;
    const pT = pi * (1 - Math.exp(-r * T8)), pTau = pi * (1 - Math.exp(-1));
    assert.ok(rel(I.partB.formule, pT) < 1e-12 && rel(I.relaxation.formule, pTau) < 1e-12 && rel(I.constante.formule, P.kf / P.kb) < 1e-12);
    assert.ok(Math.abs(z(I.partB)) < 5, 'partB z ' + z(I.partB)); assert.ok(Math.abs(z(I.relaxation)) < 5, 'relaxation z ' + z(I.relaxation));
    const K = I.constante; if (P.molecules * (1 - pi) < 30) assert.equal(K.comparable, false); else if (Number.isFinite(K.mesure)) assert.ok(Math.abs(z(K)) < 5, 'K z ' + z(K));
    for (let f = 0; f < R.film.images; f++) { const d0 = R.film.debuts[f], c = R.film.tailles[f], t = f * T8 / (R.film.images - 1);
      for (let q = 0; q < c; q++) { const o = 3 * (d0 + q); assert.ok(Math.min(Math.hypot(b[o] + 1.5, b[o + 1]), Math.hypot(b[o] - 1.5, b[o + 1])) <= 0.6 + 1e-12 && rel(b[o + 2] + 1e-300, t + 1e-300) < 1e-12); } }
    let a0 = 0; { const c = R.film.tailles[0]; for (let q = 0; q < c; q++) if (b[3 * q] < 0) a0++; assert.equal(a0, c, 'au depart toutes les molecules sont A'); }
    return `partB ${I.partB.mesure.toFixed(4)}/${pT.toFixed(4)} z ${z(I.partB).toFixed(2)}, K ${Number.isFinite(K.mesure) ? K.mesure.toFixed(3) : '-'}/${K.formule.toFixed(3)}`;
  });
  for (const p of extremes(sys('brusselator'))) ok(`brusselator ${JSON.stringify(p)} : point fixe, seuil 1 + A^2, taux et periode = jacobienne par differences finies`, () => {
    const R = S('brusselator', p), P = R.params, I = R.invariants, A = P.A, B = 1 + A * A + P.ecartSeuil, ref = tauxRef(A, B);
    assert.ok(rel(I.seuil.seuilHopf, 1 + A * A) < 1e-15 && rel(I.seuil.bValeur, B) < 1e-15); assert.equal(I.seuil.oscille, P.ecartSeuil < 0 ? 0 : 1);
    const pf = Math.hypot(A, B / A); assert.ok(rel(I.pointFixe.formule, pf) < 1e-12);
    /* cas degenere (deux taux egaux, signale approche par le module) : la reference passe par sqrt(discriminant ~ 0), qui amplifie l erreur
     *   des differences finies (mesure 2.3e-6) : tolerance 1e-4 la seulement */
    assert.ok(Math.abs(I.amortissement.formule - ref.re) < (typeof I.amortissement.approchee === 'string' ? 1e-4 : 1e-6) * (1 + Math.abs(ref.re)), 'taux formule ' + I.amortissement.formule + ' ref ' + ref.re);
    if (P.ecartSeuil < 0) {
      assert.ok(rel(I.pointFixe.mesure, pf) < 1e-6, 'point fixe ' + I.pointFixe.mesure);
      if (typeof I.amortissement.approchee !== 'string') assert.ok(rel(I.amortissement.mesure, ref.re) < 0.03, 'taux ' + I.amortissement.mesure + ' ref ' + ref.re);
      if (Number.isFinite(ref.omega)) assert.ok(rel(I.periode.mesure, 2 * Math.PI / ref.omega) < 1e-3, 'periode ' + I.periode.mesure + ' ref ' + 2 * Math.PI / ref.omega);
      else assert.ok(Number.isNaN(I.periode.mesure) && typeof I.periode.absente === 'string');
    } else {
      assert.ok(Number.isNaN(I.pointFixe.mesure) && typeof I.pointFixe.absente === 'string'); assert.ok(I.seuil.amplitude > 0.05, 'un cycle existe : amplitude ' + I.seuil.amplitude);
      assert.ok(typeof I.periode.approchee === 'string' || typeof I.periode.absente === 'string');
    }
    return `taux ${Number.isFinite(I.amortissement.mesure) ? I.amortissement.mesure.toFixed(4) : '-'} / ref ${ref.re.toFixed(4)}, periode ${Number.isFinite(I.periode.mesure) ? I.periode.mesure.toFixed(4) : '-'}, amplitude ${I.seuil.amplitude.toPrecision(3)}`;
  });
  // game118 : gaz parfait
  for (const p of extremes(sys('gazParfait'))) ok(`gazParfait ${JSON.stringify(p)} : pression comptee choc par choc sous sa borne, P A = N T, vitesse moyenne sqrt(pi T / 2), molecules dans la boite`, () => {
    const R = S('gazParfait', p), P = R.params, I = R.invariants, b = R.brut, L = 10, Pe = I.pressionEchantillon;
    assert.ok(Math.abs(Pe.mesure - Pe.formule) <= Pe.borneEcart + 1e-12, 'ecart ' + Math.abs(Pe.mesure - Pe.formule) + ' borne ' + Pe.borneEcart);
    assert.ok(rel(I.gazParfait.formule, P.molecules * P.temperature / (L * L)) < 1e-12 && rel(I.gazParfait.sigma, Math.sqrt(2 * P.molecules) * P.temperature / (L * L)) < 1e-12 && Math.abs(z(I.gazParfait)) < 5, 'gaz z ' + z(I.gazParfait));
    assert.ok(rel(I.vitesseMoyenne.formule, Math.sqrt(Math.PI * P.temperature / 2)) < 1e-12 && Math.abs(z(I.vitesseMoyenne)) < 5, 'v z ' + z(I.vitesseMoyenne));
    for (let i = 0; i < R.n; i++) { const o = 3 * i; assert.ok(b[o] >= -1e-9 && b[o] <= L + 1e-9 && b[o + 1] >= -1e-9 && b[o + 1] <= L + 1e-9 && b[o + 2] >= 0, 'dans la boite'); }
    return `P ${Pe.mesure.toFixed(4)} / gaz ${I.gazParfait.formule.toFixed(4)} z ${z(I.gazParfait).toFixed(2)}, ecart ${Math.abs(Pe.mesure - Pe.formule).toExponential(1)} <= ${Pe.borneEcart.toExponential(1)}`;
  });
  /* game125 : Carnot — references : 1 - 1/Th et (Th - 1) ln r par Math.log ; chaque point du cycle a P V = T entre 1 et Th */
  for (const p of [...extremes(sys('carnot')), { liberte: 5 }, { liberte: 4, chaude: 3, detente: 3 }]) ok(`carnot ${JSON.stringify(p)} : rendement 1 - Tc/Th quel que soit f, travail (Th - Tc) ln r, P V = T`, () => {
    const R = S('carnot', p), P = R.params, I = R.invariants, b = R.brut;
    assert.ok(Math.abs(I.rendement.formule - (1 - 1 / P.chaude)) < 1e-12 && Math.abs(I.rendement.mesure / I.rendement.formule - 1) < 1e-6, 'rendement ' + I.rendement.mesure);
    assert.ok(Math.abs(I.travail.formule - (P.chaude - 1) * Math.log(P.detente)) < 1e-12 && Math.abs(I.travail.mesure / I.travail.formule - 1) < 1e-6, 'travail ' + I.travail.mesure);
    for (let i = 0; i < R.n; i++) { const o = 3 * i, T = b[o] * b[o + 1]; assert.ok(T >= 1 - 1e-9 && T <= P.chaude + 1e-9 && [0, 1, 2, 3].includes(b[o + 2]), 'point ' + i); }
    return 'rendement ' + I.rendement.mesure.toFixed(8);
  });
  /* game214 : titrage - reference INDEPENDANTE : Newton sur h (Math.pow, Math.log autorises ici), pas une dichotomie sur le pH ;
   *   valeurs de Grok Bot (codex 19) pour Ca = Cb = 0.1, 10 mL : pH 2.880876, 4.756457, 8.727538, 12.301030 (calcul de modele) */
  const titRef = (Ca, Cb, x) => { const Va = 10, Vb = x * Ca * Va / Cb, Ct = Ca * Va / (Va + Vb), Na = Cb * Vb / (Va + Vb), Ka = Math.pow(10, -4.756), Kw = 1e-14;
    let h = 1e-7; for (let i = 0; i < 200; i++) { const f = h + Na - Ct * Ka / (Ka + h) - Kw / h, d = 1 + Ct * Ka / ((Ka + h) * (Ka + h)) + Kw / (h * h); let hn = h - f / d; if (hn <= 0) hn = h / 10; h = hn; } return -Math.log10(h); };
  ok('titrageAcideFaible : Newton = quatre pH de Grok Bot (Ca = Cb = 0.1)', () => { assert.equal([0, 0.5, 1, 1.5].map((x) => titRef(0.1, 0.1, x).toFixed(6)).join(' '), '2.880876 4.756457 8.727538 12.301030'); return 'ok'; });
  for (const p of [...extremes(sys('titrageAcideFaible')), { acide: 0.02, base: 0.3 }]) ok(`titrageAcideFaible ${JSON.stringify(p)} : charge, monotonie, demi-equivalence, pH de reference, temoin`, () => {
    const R = S('titrageAcideFaible', p), I = R.invariants, Ca = R.params.acide, Cb = R.params.base;
    assert.ok(I.titrageAcideFaible.mesure === 0 && I.titrageAcideFaible.quatrePoints === [0, 0.5, 1, 1.5].map((x) => titRef(Ca, Cb, x).toFixed(6)).join(' ') && I.temoin.mesure > 7.5, JSON.stringify(I));
    return 'equivalence pH ' + I.temoin.mesure.toFixed(4);
  });
  ok('etalonnage : 20 graines aux defauts, ecart-type des z dans [0.5, 1.7] (pic de B, part de B, relaxation, gaz, vitesse moyenne)', () => {
    const zs = { picB: [], partB: [], relaxation: [], gaz: [], vitesse: [] };
    for (let g = 1; g <= 20; g++) { const a = T.simuler('reactionsChaine', { graine: g }).invariants, e = T.simuler('equilibreChimique', { graine: g }).invariants; zs.picB.push(z(a.picB)); zs.partB.push(z(e.partB)); zs.relaxation.push(z(e.relaxation));
      /* game118 : un biais de 10 % sur les vitesses ne fait que ~2 sigma sur UN tirage : la moyenne des z sur 20 graines le voit */
      const gz = T.simuler('gazParfait', { graine: g }).invariants; zs.gaz.push(z(gz.gazParfait)); zs.vitesse.push(z(gz.vitesseMoyenne)); }
    const out = []; for (const [k, v] of Object.entries(zs)) { const m = v.reduce((a, x) => a + x, 0) / v.length, sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); assert.ok(sd >= 0.5 && sd <= 1.7 && Math.abs(m) < 1.2, k + ' ' + m + ' ' + sd); out.push(`${k} ${m.toFixed(2)}/${sd.toFixed(2)}`); }
    return out.join(', ');
  });
  ok('bornage : hors bornes ramene (verifie AVANT de simuler hors bornes), NaN -> defaut, entiers arrondis', () => {
    assert.equal(T.reglagesPhysique('reactionsChaine', { k1: -1 })[1].valeur, 0.2, 'taux negatif ramene');
    assert.deepEqual(T.simuler('reactionsChaine', { molecules: 10.4, k1: -1, k2: NaN, graine: 2.6 }, { n: 20 }).params, { molecules: 100, k1: 0.2, k2: 0.5, graine: 3 });
    assert.deepEqual(T.reglagesPhysique('brusselator', { ecartSeuil: 99 }).map((x) => x.valeur), [1, 3]);
  });
  return res;
}

const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
const src = readFileSync(SOURCE, 'utf8'), moi = readFileSync(fileURLToPath(import.meta.url), 'utf8');
const interdits = src.match(/Math\.(sin|cos|tan|exp|log|pow|atan2?|asin|acos|hypot|sinh|cosh|tanh|asinh|acosh|cbrt|expm1|log1p|log2|log10|random)\b/g);
assertions++; if (interdits) ech.push({ nom: 'source sans Math transcendante', det: interdits.join(',') });
console.log(`${interdits ? 'ECHEC ' : 'OK    '}source : aucune Math.sin/cos/exp/log/pow/atan/... ni Math.random`);
const marque = new RegExp(['de m' + 'emoire', 'from m' + 'emory', 'de t' + 'ete', 'a sour' + 'cer', 'unsour' + 'ced', 'non sour' + 'ce', 'TO' + 'DO'].join('|'), 'i');
const marques = [src, moi].flatMap((t, i) => t.split(/\r?\n/).map((l, j) => [i ? 'test' : 'module', j + 1, l]).filter(([, , l]) => marque.test(l)));
assertions++; if (marques.length) ech.push({ nom: 'valeur marquee sans source lue', det: marques.map(([f, j]) => f + ':' + j).join(',') });
console.log(`${marques.length ? 'ECHEC ' : 'OK    '}aucune valeur marquee sans source lue (module + banc)`);
console.log('\nTEMPS simuler(id) a n = 1500, defauts et chaque extreme de curseur :');
for (const s of T.SYSTEMES) { let pire = 0, ou = ''; for (const p of extremes(s)) { const a = performance.now(); T.simuler(s.id, p); const t = performance.now() - a; if (t > pire) { pire = t; ou = JSON.stringify(p); } } console.log(`  ${s.id} : pire ${pire.toFixed(0)} ms (${ou})`); }

const MUTANTS = [
  ['chaine : b(t) avec k2 au numerateur', 'k1 / (k2 - k1) * (expNegD(k1 * t) - expNegD(k2 * t))', 'k2 / (k2 - k1) * (expNegD(k1 * t) - expNegD(k2 * t))'],
  ['chaine : t* de signe faux', '(lnD(k1) - lnD(k2)) / (k1 - k2)', '(lnD(k2) - lnD(k1)) / (k1 - k2)'],
  ['chaine : B -> C au taux k1', 't2[i] = t1[i] + attente(rng, k2);', 't2[i] = t1[i] + attente(rng, k1);'],
  ['equilibre : pi = kb / (kf + kb)', 'pi = kf / r,', 'pi = kb / r,'],
  ['equilibre : sauts aux taux inverses', 't += attente(rng, e ? kb : kf);', 't += attente(rng, e ? kf : kb);'],
  ['brusselator : seuil A^2 au lieu de 1 + A^2', 'Bc = 1 + A * A;', 'Bc = A * A;'],
  ['brusselator : y consomme a 1.01 x^2 y', 'B * x - x * x * y]', 'B * x - 1.01 * x * x * y]'],
  ['brusselator : taux = trace au lieu de trace / 2', 'const reLam = complexes ? tr / 2 :', 'const reLam = complexes ? tr :'],
  ['gaz : un choc ne transmet que |vx|', 'impulsion += 2 * Math.abs(vx[i]) * chocs;', 'impulsion += Math.abs(vx[i]) * chocs;'],
  ['gaz : vitesses tirees trop larges (Box-Muller a -2.4 ln u)', 'Math.sqrt(-2 * lnD(u))', 'Math.sqrt(-2.4 * lnD(u))'],
  ['carnot : cycle mal ferme (V4 x 1.1)', 'V4 = 1 * puiss(Th / Tc)', 'V4 = 1.1 * puiss(Th / Tc)'],
  ['carnot : chaleur recue a Th + 0.01', 'Qh = Th * lr', 'Qh = (Th + 0.01) * lr'],
  ['titrage : Kw oublie', 'return h + Na - Ct * Ka / (Ka + h) - Kw / h; };', 'return h + Na - Ct * Ka / (Ka + h); };'],
  ['titrage : Ka = 10^(-pKa) en log decimal oublie', 'Ka = expNegD(SOURCES.pKaAcetique.valeur * lnD(10))', 'Ka = expNegD(SOURCES.pKaAcetique.valeur)'],
  ['titrage : dichotomie inversee', 'if (f(m) > 0) lo = m; else hi = m; }', 'if (f(m) > 0) hi = m; else lo = m; }'],
  ['titrage : temoin a mi-equivalence', 'equiv = phDe(Veq).pH,', 'equiv = phDe(Veq / 2).pH,'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['Math.random injecte (chaine)', 'rng = mulberry32(P.graine), T = 5', 'rng = Math.random, T = 5'],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-chimie-mutants-'));
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
console.log(`test-tam-chimie-20261103 : ${assertions} assertions OK`);
