// test-tam-biologie-20261103.mjs -- banc de tam-biologie.js (sciences de la vie, vue non frappable) + mutants sur COPIES.
// Lancer : node test-tam-biologie-20261103.mjs
// Le banc a le droit a Math.exp/log : ses references sont calculees independamment du module
//   (Jukes-Cantor par Math.exp ; moments du dogme central re-derives ICI des propensites des 4 reactions et resolus pas a pas,
//   sans lire la formule du module).
// REFERENCES : aucune valeur publiee ; chaque formule est recalculee ici depuis sa definition.
// Chaque verification tourne aux defauts ET a chaque extreme de curseur (un a un, tous min, tous max).
// Tolerances annoncees (mesurees le 2026-11-03, sonde de 30 graines par reglage, puis marge) :
//   formules recalculees a 1e-12 relatif ; ecarts statistiques |z| < 5 a chaque extreme (pire mesure 4.2 sur 270 tirages) ;
//   etalonnage : sur 20 graines aux defauts l ecart-type des z doit tomber dans [0.5, 1.7] (mesure 0.6..1.4 ; un sigma faux d un
//   facteur 2 ou plus en sort).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-biologie.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const IDS = ['adnMutations', 'dogmeCentral', 'deriveGenetique', 'enzyme'];

// ---------- references independantes (Math autorise ici) ----------
const pJC = (mu, t) => 0.75 * (1 - Math.exp(-4 * mu * t / 3));
/* game112 : esperance EXACTE de l heterozygotie par la chaine de Markov de Wright-Fisher (matrice binomiale), sans la formule :
 *   distribution du compte apres t generations, puis E[2 p (1 - p)] */
function hetMarkov(N2, c0, t) {
  const binom = (n, k) => { let c = 1; for (let j = 1; j <= k; j++) c *= (n - k + j) / j; return c; };
  let d = new Float64Array(N2 + 1); d[c0] = 1;
  for (let g = 0; g < t; g++) { const e = new Float64Array(N2 + 1);
    for (let i = 0; i <= N2; i++) { if (!d[i]) continue; const q = i / N2; for (let j = 0; j <= N2; j++) e[j] += d[i] * binom(N2, j) * Math.pow(q, j) * Math.pow(1 - q, N2 - j); }
    d = e; }
  let h = 0; for (let i = 0; i <= N2; i++) h += d[i] * 2 * (i / N2) * (1 - i / N2); return h;
}
/* moments stationnaires du reseau gene -> ARN -> proteine (gamma = 1), derives des propensites :
 *   m+ : k, m- : m, p+ : kp m, p- : gp p. d<f>/dt = sum_r a_r (f(x + v_r) - f(x)).
 *   f = m      : k - <m> = 0
 *   f = p      : kp <m> - gp <p> = 0
 *   f = m^2    : k (2<m> + 1) + (-2<m^2> + <m>) = 0
 *   f = m p    : k <p> + kp <m^2> - <mp> - gp <mp> = 0
 *   f = p^2    : kp (2<mp> + <m>) + gp (-2<p^2> + <p>) = 0 */
function momentsRef(k, kp, gp) {
  const m = k, p = kp * m / gp, m2 = (k * (2 * m + 1) + m) / 2, mp = (k * p + kp * m2) / (1 + gp), p2 = (kp * (2 * mp + m) + gp * p) / (2 * gp);
  return { m, fanoM: (m2 - m * m) / m, p, fanoP: (p2 - p * p) / p, cov: mp - m * p };
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

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const cache = new Map(), S = (id, p = {}) => { const k = id + JSON.stringify(p); if (!cache.has(k)) cache.set(k, T.simuler(id, p)); return cache.get(k); };
  const sys = (id) => T.SYSTEMES.find((s) => s.id === id);
  // 1. forme, bornes, determinisme
  ok('SYSTEMES gele, 2 systemes, SOURCES vide, COLONNES couvre chaque colonne, ENTIERS par systeme', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES)); assert.deepEqual(T.SYSTEMES.map((s) => s.id), IDS); assert.ok(Object.isFrozen(T.SYSTEMES[0].params));
    assert.equal(Object.keys(T.SOURCES).length, 0); assert.deepEqual(Object.keys(T.ENTIERS), IDS);
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
  // 2. ADN qui mute
  for (const p of extremes(sys('adnMutations'))) ok(`adnMutations ${JSON.stringify(p)} : 3/4 (1 - e^(-4 mu t/3)) a chaque image, distance, substitutions, composition, double helice complementaire`, () => {
    const R = S('adnMutations', p), P = R.params, I = R.invariants, Dif = I.differences, se = Dif.serie, b = R.brut, L = P.bases;
    se.t.forEach((t, f) => { const q = pJC(P.taux, t); assert.ok(Math.abs(se.formule[f] - q) <= 1e-12 * Math.max(q, 1e-300) + 1e-300, 'formule ' + f); assert.ok(Math.abs(se.sigma[f] - Math.sqrt(q * (1 - q) / L)) <= 1e-12 * (se.sigma[f] + 1e-300)); });
    assert.equal(se.mesure[0], 0, 'image 0 = l ancetre'); assert.equal(se.t[se.t.length - 1], P.duree);
    assert.ok(Math.abs(z(Dif)) < 5, 'differences z ' + z(Dif));
    const Su = I.substitutions; assert.ok(Math.abs(Su.formule - P.taux * P.duree) < 1e-12 * Su.formule && Math.abs(z(Su)) < 5, 'substitutions z ' + z(Su)); assert.ok(Su.mesure >= Dif.mesure, 'chaque site different a subi au moins un changement');
    const Co = I.composition; assert.ok(Co.mesure >= 0 && Co.mesure < 3 + 5 * Math.sqrt(6), 'chi2 ' + Co.mesure); assert.ok(Math.abs(Co.baseA + Co.baseC + Co.baseG + Co.baseT - 1) < 1e-12);
    const Di = I.distance, fT = Dif.formule;
    if (Dif.mesure >= 0.75) assert.ok(Number.isNaN(Di.mesure) && typeof Di.absente === 'string');
    else { assert.ok(Math.abs(Di.mesure + 0.75 * Math.log(1 - 4 * Dif.mesure / 3)) < 1e-12 * (1 + Di.mesure), 'distance relue');
      if (0.75 - fT < 3 * Dif.sigma) assert.equal(Di.comparable, false); else { assert.ok(!('comparable' in Di)); assert.ok(Math.abs(z(Di)) < 5, 'distance z ' + z(Di)); } }
    for (let f = 0; f < R.film.images; f++) { const d0 = R.film.debuts[f], c = R.film.tailles[f];
      for (let r = 0; r < c; r++) { const o = 5 * (d0 + r); assert.ok(Math.abs(Math.hypot(b[o], b[o + 1]) - 3) < 1e-12 && b[o + 4] === se.t[f] && [0, 1, 2, 3].includes(b[o + 3]));
        if (r % 2) { assert.equal(b[o + 3] + b[o - 2], 3, 'brin 2 = complement (A-T, C-G)'); assert.equal(b[o + 2], b[o - 3], 'paire au meme niveau'); } } }
    return `p ${Dif.mesure.toFixed(4)} / ${fT.toFixed(4)} (z ${z(Dif).toFixed(2)}), subs z ${z(Su).toFixed(2)}, chi2 ${Co.mesure.toFixed(2)}`;
  });
  // 3. dogme central
  for (const p of extremes(sys('dogmeCentral'))) ok(`dogmeCentral ${JSON.stringify(p)} : moyennes, Fano, covariance = moments re-derives des propensites ; |z| < 5 ; dessin entier`, () => {
    const R = S('dogmeCentral', p), P = R.params, I = R.invariants, M = momentsRef(P.transcription, P.traduction, P.degradation), b = R.brut;
    const paires = [['arnMoyen', M.m], ['bruitArn', M.fanoM], ['proteineMoyenne', M.p], ['bruitProteine', M.fanoP], ['covariance', M.cov]];
    for (const [k, ref] of paires) { const v = I[k]; assert.ok(Math.abs(v.formule - ref) <= 1e-12 * Math.abs(ref), k + ' formule ' + v.formule + ' ref ' + ref); assert.ok(v.sigma > 0 && Math.abs(z(v)) < 5, k + ' z ' + z(v)); }
    for (let i = 0; i < R.n; i++) { const o = 3 * i; assert.ok(Number.isInteger(b[o + 1]) && b[o + 1] >= 0 && Number.isInteger(b[o + 2]) && b[o + 2] >= 0); if (i) assert.ok(b[o] > b[o - 3]); }
    assert.equal(b[0], 0); assert.ok(Math.abs(b[3 * (R.n - 1)] - 30) < 1e-9);
    return paires.map(([k]) => k + ' z ' + z(I[k]).toFixed(2)).join(', ');
  });
  // 3b. derive genetique (game112)
  ok('deriveGenetique : la loi H_t = H0 (1 - 1/2N)^t du module = esperance EXACTE de la chaine de Markov (2N = 4..10, t = 1..15)', () => {
    let pire = 0; for (const N2 of [4, 6, 10]) for (const c0 of [1, Math.floor(N2 / 2)]) for (let t = 1; t <= 15; t++) { const H0 = 2 * (c0 / N2) * (1 - c0 / N2), f = H0 * Math.pow(1 - 1 / N2, t), m = hetMarkov(N2, c0, t); pire = Math.max(pire, Math.abs(m - f)); }
    assert.ok(pire < 1e-12, 'pire ' + pire); return 'pire ecart ' + pire.toExponential(1);
  });
  for (const p of extremes(sys('deriveGenetique'))) ok(`deriveGenetique ${JSON.stringify(p)} : moyenne p0, heterozygotie H0 (1-1/2N)^t, fixation, trajectoires absorbees`, () => {
    const R = S('deriveGenetique', p), P = R.params, I = R.invariants, N2 = 2 * P.individus, p0 = Math.round(P.partDepart * N2) / N2, lt = Math.pow(1 - 1 / N2, P.generations), b = R.brut;
    const F = I.frequenceMoyenne; assert.ok(Math.abs(F.formule - p0) < 1e-15 && Math.abs(F.sigma - Math.sqrt(p0 * (1 - p0) * (1 - lt) / P.populations)) < 1e-12 * F.sigma && Math.abs(z(F)) < 5, 'moyenne z ' + z(F));
    const H = I.heterozygotie; assert.ok(Math.abs(H.formule - 2 * p0 * (1 - p0) * lt) <= 1e-12 * H.formule + 1e-300, 'H formule');
    if ('sigma' in H) assert.ok(Math.abs(z(H)) < 5, 'H z ' + z(H)); else assert.equal(H.mesure, 0, 'sans sigma : toutes fixees, H mesure 0');
    const X = I.fixation; if (X.fixees === 0) assert.ok(Number.isNaN(X.mesure) && typeof X.absente === 'string'); else if (X.fixees < 0.99) assert.equal(X.comparable, false); else assert.ok(Math.abs(z(X)) < 5, 'fixation z ' + z(X));
    for (let f = 0; f < R.film.images; f++) { const d0 = R.film.debuts[f], c = R.film.tailles[f]; let fixe = null;
      for (let r = 0; r < c; r++) { const o = 3 * (d0 + r), q = b[o + 1]; assert.ok(Number.isInteger(b[o]) && b[o] >= 0 && b[o] <= P.generations && b[o + 2] === f + 1 && Number.isInteger(Math.round(q * N2)) && Math.abs(q * N2 - Math.round(q * N2)) < 1e-9 && q >= 0 && q <= 1);
        if (fixe !== null) assert.equal(q, fixe, 'une population fixee le reste'); if (q === 0 || q === 1) fixe = q; } }
    return `p ${F.mesure.toFixed(4)} (z ${z(F).toFixed(2)}), H ${H.mesure.toFixed(4)}/${H.formule.toFixed(4)}${'sigma' in H ? ' (z ' + z(H).toFixed(2) + ')' : ''}, fixees ${X.fixees}`;
  });
  // 3c. enzyme (game112)
  for (const p of extremes(sys('enzyme'))) ok(`enzyme ${JSON.stringify(p)} : E + C = E0 et S + C + P = S0 (temoins), loi de vitesse a moins de eps, chemin monotone`, () => {
    const R = S('enzyme', p), P = R.params, I = R.invariants, b = R.brut, Km = P.dissociation + P.catalyse, eps = P.enzyme / (P.substrat + Km);
    assert.ok(I.enzymeTotale.derive < 1e-13 * P.enzyme + 1e-15, 'E ' + I.enzymeTotale.derive); assert.ok(I.matiereTotale.derive < 1e-12 * P.substrat, 'S ' + I.matiereTotale.derive);
    const V = I.vitesseReaction; assert.ok(Math.abs(V.eps - eps) < 1e-15 && Math.abs(V.Km - Km) < 1e-15 && Math.abs(V.Vmax - P.catalyse * P.enzyme) < 1e-15);
    assert.ok(Math.abs(V.formule - V.Vmax * V.substratMi / (Km + V.substratMi)) < 1e-12 * V.formule && Math.abs(V.substratMi - P.substrat / 2) < 0.01 * P.substrat, 'mi-parcours');
    const rel = Math.abs(V.mesure / V.formule - 1); assert.ok(rel <= eps, 'ecart ' + rel + ' > eps ' + eps); assert.ok(typeof V.approchee === 'string');
    for (let i = 1; i < R.n; i++) { const o = 3 * i; assert.ok(b[o] <= b[o - 3] + 1e-12 && b[o + 1] >= b[o - 2] - 1e-12 && b[o + 2] >= -1e-12, 'ligne ' + i); }
    assert.ok(I.produitFinal.partConvertie > 0.8, 'conversion ' + I.produitFinal.partConvertie);
    return `ecart ${rel.toExponential(1)} (eps ${eps.toPrecision(2)}), derives ${I.enzymeTotale.derive.toExponential(1)} / ${I.matiereTotale.derive.toExponential(1)}`;
  });
  // 4. etalonnage des sigmas : sur 20 graines, les z ont un ecart-type ~ 1 (un sigma faux d un facteur 2 en sort)
  ok('etalonnage : 20 graines aux defauts, ecart-type des z dans [0.5, 1.7] (differences, substitutions, Fano proteine, covariance, derive : moyenne et heterozygotie)', () => {
    const zs = { differences: [], substitutions: [], bruitProteine: [], covariance: [], frequenceMoyenne: [], heterozygotie: [] };
    for (let g = 1; g <= 20; g++) { const a = T.simuler('adnMutations', { graine: g }).invariants, d = T.simuler('dogmeCentral', { graine: g }).invariants;
      zs.differences.push(z(a.differences)); zs.substitutions.push(z(a.substitutions)); zs.bruitProteine.push(z(d.bruitProteine)); zs.covariance.push(z(d.covariance));
      const w = T.simuler('deriveGenetique', { graine: g }).invariants; zs.frequenceMoyenne.push(z(w.frequenceMoyenne)); zs.heterozygotie.push(z(w.heterozygotie)); }
    const out = [];
    for (const [k, v] of Object.entries(zs)) { const m = v.reduce((a, x) => a + x, 0) / v.length, sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
      assert.ok(sd >= 0.5 && sd <= 1.7 && Math.abs(m) < 1.2, k + ' moy ' + m + ' sd ' + sd); out.push(`${k} ${m.toFixed(2)}/${sd.toFixed(2)}`); }
    return out.join(', ');
  });
  ok('bornage : hors bornes ramene, NaN -> defaut, entiers arrondis ; reglagesPhysique', () => {
    /* le bornage est verifie AVANT de simuler hors bornes : sans lui un taux negatif donnerait des attentes negatives (boucle sans fin —
     *   c est ce qui a bloque la 1re version de ce banc sur le mutant « bornage retire ») */
    assert.equal(T.reglagesPhysique('adnMutations', { taux: -1 })[1].valeur, 0.05, 'taux negatif ramene');
    assert.deepEqual(T.simuler('adnMutations', { bases: 10.4, taux: -1, duree: NaN, graine: 2.6 }, { n: 20 }).params, { bases: 200, taux: 0.05, duree: 4, graine: 3 });
    const r = T.reglagesPhysique('dogmeCentral', { degradation: 9 });
    assert.deepEqual(r.map((x) => x.chemin), ['params.transcription', 'params.traduction', 'params.degradation', 'params.graine']); assert.equal(r[2].valeur, 1);
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
const marque = new RegExp(['de m' + 'emoire', 'from m' + 'emory', 'de t' + 'ete', 'a sour' + 'cer', 'unsour' + 'ced', 'non sour' + 'ce', 'TO' + 'DO'].join('|'), 'i');
const marques = [src, moi].flatMap((t, i) => t.split(/\r?\n/).map((l, j) => [i ? 'test' : 'module', j + 1, l]).filter(([, , l]) => marque.test(l)));
assertions++; if (marques.length) ech.push({ nom: 'valeur marquee sans source lue', det: marques.map(([f, j]) => f + ':' + j).join(',') });
console.log(`${marques.length ? 'ECHEC ' : 'OK    '}aucune valeur marquee sans source lue (module + banc)`);

console.log('\nTEMPS simuler(id) a n = 1500, defauts et chaque extreme de curseur :');
for (const s of T.SYSTEMES) { let pire = 0, ou = ''; for (const p of extremes(s)) { const a = performance.now(); T.simuler(s.id, p); const t = performance.now() - a; if (t > pire) { pire = t; ou = JSON.stringify(p); } } console.log(`  ${s.id} : pire ${pire.toFixed(0)} ms (${ou})`); }

const MUTANTS = [
  ['ADN : taux d uniformisation mu au lieu de 4 mu / 3', 'lam = 4 * mu / 3', 'lam = mu'],
  ['ADN : chaque tirage compte comme une substitution', 'if (nb !== b) subs++;', 'subs++;'],
  ['ADN : brin 2 identique au brin 1 (pas de complement)', 'brut[o + 3] = brin ? 3 - b : b;', 'brut[o + 3] = b;'],
  ['ADN : e^(-x) a 2 termes', 'for (let j = 1; j <= 30; j++) { t *= -x / j; s += t; }', 'for (let j = 1; j <= 2; j++) { t *= -x / j; s += t; }'],
  ['dogme : Fano proteine 1 + kp / gp', 'formule: 1 + kp / (1 + gp), sigma: sig(3)', 'formule: 1 + kp / gp, sigma: sig(3)'],
  ['dogme : covariance kp k / gp', 'const cov = kp * k / (1 + gp);', 'const cov = kp * k / gp;'],
  ['dogme : jackknife sans le facteur (B - 1)', 'Math.sqrt(s * (DOGME_BLOCS - 1) / DOGME_BLOCS)', 'Math.sqrt(s / DOGME_BLOCS)'],
  ['dogme : traduction a kp sans l ARN (propensite fausse)', 'a3 = kp * m,', 'a3 = kp,'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['derive : 1 - 1/N au lieu de 1 - 1/(2N)', 'lam = 1 - 1 / N2, lG', 'lam = 1 - 1 / P.individus, lG'],
  ['derive : tirage biaise (+0.01)', 'for (let j = 0; j < N2; j++) if (rng() < q) x++;', 'for (let j = 0; j < N2; j++) if (rng() < q + 0.01) x++;'],
  ['derive : sigma de la moyenne 3 fois trop petit', 'sigma: Math.sqrt(p0e * (1 - p0e) * (1 - lG) / R)', 'sigma: Math.sqrt(p0e * (1 - p0e) * (1 - lG) / R) / 3'],
  ['enzyme : produit forme a 0.99 kcat C (matiere perdue)', 'd[3] = c; };', 'd[3] = 0.99 * c; };'],
  ['enzyme : Km sans kcat', 'Km = (km1 + k2) / k1,', 'Km = km1 / k1,'],
  ['Math.random injecte (ADN)', 'lam = 4 * mu / 3, rng = mulberry32(P.graine)', 'lam = 4 * mu / 3, rng = Math.random'],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-biologie-mutants-'));
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
console.log(`test-tam-biologie-20261103 : ${assertions} assertions OK`);
