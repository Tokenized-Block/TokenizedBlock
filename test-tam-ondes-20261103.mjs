// test-tam-ondes-20261103.mjs -- banc de tam-ondes.js (ondes, lumiere et son, vue non frappable) + mutants sur COPIES.
// Lancer : node test-tam-ondes-20261103.mjs
// References independantes (Math autorise ici) : Descartes par Math.acos/asin ET par une minimisation numerique (section doree) de
//   D(i) = pi k + 2 i - 2 (k + 1) asin(sin i / n) ; harmoniques par Math.sin ; fronts d onde recontroles point par point.
// Tolerances (mesurees le 2026-11-03) : arc a 1e-3 degre (balayage de 4000 rayons : 1e-5 mesure) ; corde : retour et demi-periode
//   < 1e-12 (mesure 1e-14) ; fondamentale a 3 / N^2 (mesure 2.5e-5 a N = 200, soit 1 / N^2) ; Doppler a 1e-12.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-ondes.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const IDS = ['arcEnCiel', 'cordeVibrante', 'effetDoppler', 'lentilleMince'];
const deg = 180 / Math.PI;

const descartes = (n, k) => { const ci = Math.sqrt((n * n - 1) / (k * (k + 2))), i = Math.acos(ci), r = Math.asin(Math.sin(i) / n); return (Math.PI * k + 2 * i - 2 * (k + 1) * r) * deg; };
function descartesNum(n, k) { const D = (i) => Math.PI * k + 2 * i - 2 * (k + 1) * Math.asin(Math.sin(i) / n); let a = 0, b = Math.PI / 2; const g = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 200; it++) { const c = b - g * (b - a), d = a + g * (b - a); if (D(c) < D(d)) b = d; else a = c; } return D((a + b) / 2) * deg; }
function extremes(s) { const ks = Object.keys(s.params), cs = [{}]; for (const k of ks) { cs.push({ [k]: s.bornes[k][0] }); cs.push({ [k]: s.bornes[k][1] }); } cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][0]]))); cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][1]]))); return cs; }
function standardiser(b, n, D, groupes = []) {
  const z = new Float64Array(n * D), moy = [], et = [];
  for (let j = 0; j < D; j++) { let m = 0; for (let i = 0; i < n; i++) m += b[i * D + j]; m /= n; let v = 0; for (let i = 0; i < n; i++) v += (b[i * D + j] - m) ** 2; moy.push(m); et.push(Math.sqrt(v / n)); }
  for (const g of groupes) { const e = Math.sqrt(g.reduce((a, j) => a + et[j] * et[j], 0) / g.length); for (const j of g) et[j] = e; }
  for (let j = 0; j < D; j++) { const s = et[j] > 0 ? 1 / et[j] : 0; for (let i = 0; i < n; i++) z[i * D + j] = (b[i * D + j] - moy[j]) * s; }
  return z;
}
const ecartDessin = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => { let c = false, det = ''; try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; } res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : '')); };
  const cache = new Map(), S = (id, p = {}) => { const k = id + JSON.stringify(p); if (!cache.has(k)) cache.set(k, T.simuler(id, p)); return cache.get(k); };
  const sys = (id) => T.SYSTEMES.find((s) => s.id === id);
  ok('SYSTEMES gele, 4 systemes, SOURCES vide, COLONNES couvre chaque colonne', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES)); assert.deepEqual(T.SYSTEMES.map((s) => s.id), IDS); assert.equal(Object.keys(T.SOURCES).length, 0);
    for (const s of T.SYSTEMES) { const C = T.COLONNES[s.id]; assert.equal(C.colonnes.length, s.D); assert.deepEqual([...C.memeLongueur.flat(), ...C.autres].sort(), [...Array(s.D).keys()]); }
  });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, brut fini, phrase anglaise sans accent`, () => { const r = S(s.id); assert.equal(r.bornee, true, r.raison); assert.equal(r.brut.length, 1500 * s.D); assert.ok(/^A visualisation of /.test(s.phrase) && !/[^\x20-\x7e]/.test(s.phrase + s.nom)); });
    ok(`${s.id} : determinisme`, () => { const a = T.simuler(s.id, {}), b = T.simuler(s.id, {}); assert.ok(octets(a.brut).equals(octets(b.brut))); assert.equal(JSON.stringify(a.invariants), JSON.stringify(b.invariants)); });
    ok(`${s.id} : petits n (2 et 7)`, () => { for (const n of [2, 7]) { const r = T.simuler(s.id, {}, { n }); assert.ok(r.bornee && r.brut.length === n * s.D); } });
    ok(`${s.id} : bornee a chaque extreme`, () => { for (const p of extremes(s)) assert.ok(S(s.id, p).bornee, JSON.stringify(p)); });
    ok(`${s.id} : chaque curseur change le DESSIN`, () => { const C = T.COLONNES[s.id], d0 = S(s.id), z0 = standardiser(d0.brut, d0.n, d0.D, C.memeLongueur), out = [];
      for (const k of Object.keys(s.params)) for (const v of s.bornes[k]) { if (v === s.params[k]) continue; const r = S(s.id, { [k]: v }), e = ecartDessin(z0, standardiser(r.brut, r.n, r.D, C.memeLongueur)); assert.ok(e > 1e-3, k + '=' + v + ' : ' + e); out.push(k + ' ' + e.toFixed(2)); }
      return out.join(' ; '); });
  }
  ok('arc : la formule de Descartes = minimisation numerique de D(i) (n = 1.1..1.9, k = 1, 2)', () => { let pire = 0; for (let n = 1.1; n <= 1.9 + 1e-9; n += 0.1) for (const k of [1, 2]) pire = Math.max(pire, Math.abs(descartes(n, k) - descartesNum(n, k))); assert.ok(pire < 1e-7, String(pire)); return 'pire ' + pire.toExponential(1) + ' degre'; });
  for (const p of [...extremes(sys('arcEnCiel')), { indice: 1.5 }, { indice: 1.7 }]) ok(`arcEnCiel ${JSON.stringify(p)} : deviation minimale tracee = Descartes (primaire et secondaire)`, () => {
    const I = S('arcEnCiel', p).invariants, n = S('arcEnCiel', p).params.indice;
    for (const [k, v] of [[1, I.arcPrimaire], [2, I.arcSecondaire]]) { assert.ok(Math.abs(v.formule - descartes(n, k)) < 1e-9, 'formule k ' + k); assert.ok(Math.abs(v.mesure - v.formule) < 1e-3, 'k ' + k + ' : ' + v.mesure + ' vs ' + v.formule); }
    return `${I.arcPrimaire.mesure.toFixed(4)} / ${I.arcSecondaire.mesure.toFixed(4)} degres`;
  });
  for (const p of [...extremes(sys('cordeVibrante')), { pince: 0.25, cellules: 400 }, { pince: 1 / 3, cellules: 300 }]) ok(`cordeVibrante ${JSON.stringify(p)} : retour exact apres une periode, miroir apres une demi, fondamentale, harmonique au noeud`, () => {
    const R = S('cordeVibrante', p), P = R.params, I = R.invariants, b = R.brut, N = P.cellules, ia = Math.round(P.pince * N), a = ia / N;
    assert.ok(I.retourPeriode.mesure < 1e-12 && I.demiPeriode.mesure < 1e-12, 'retour ' + I.retourPeriode.mesure + ' demi ' + I.demiPeriode.mesure);
    /* d Alembert EXACT : u(x, t) = (f(x - t) + f(x + t)) / 2, f = le triangle prolonge impair et 2-periodique ; au Courant 1 la grille le
     *   reproduit aux noeuds (banc du 03/11 : « retour apres une periode » seul laissait passer un premier pas faux, le schema restant
     *   periodique quelles que soient les donnees) */
    const tri = (x) => (x <= a ? x / a : (1 - x) / (1 - a)), fo = (x) => { let y = ((x % 2) + 2) % 2; return y <= 1 ? tri(y) : -tri(2 - y); };
    let pireDA = 0; for (let i = 0; i < R.n; i++) { const o = 3 * i; pireDA = Math.max(pireDA, Math.abs(b[o + 1] - (fo(b[o] - b[o + 2]) + fo(b[o] + b[o + 2])) / 2)); }
    assert.ok(pireDA < 1e-9, 'd Alembert ' + pireDA);
    assert.ok(I.harmonique1.pireEcart6 < 10 / (N * N), '6 harmoniques ' + I.harmonique1.pireEcart6);
    const ref = 2 * Math.sin(Math.PI * a) / (Math.PI * Math.PI * a * (1 - a)); assert.ok(Math.abs(I.harmonique1.formule - ref) < 1e-12 && Math.abs(I.harmonique1.mesure - ref) < 3 / (N * N), 'fondamentale ' + I.harmonique1.mesure + ' ' + ref);
    let q = 0; for (let m = 2; m <= 12 && !q; m++) if ((m * ia) % N === 0) q = m;
    if (q) { assert.equal(I.harmoniqueNoeud.rang, q); assert.ok(Math.abs(I.harmoniqueNoeud.mesure) < 1e-12, 'noeud ' + I.harmoniqueNoeud.mesure); } else assert.ok(!('harmoniqueNoeud' in I));
    for (let f = 0; f < R.film.images; f++) { const d0 = R.film.debuts[f], c = R.film.tailles[f];
      assert.equal(b[3 * d0], 0); assert.ok(Math.abs(b[3 * (d0 + c - 1)] - 1) < 1e-12); assert.ok(Math.abs(b[3 * d0 + 1]) < 1e-12 && Math.abs(b[3 * (d0 + c - 1) + 1]) < 1e-12, 'extremites fixes');
      for (let r = 0; r < c; r++) { const o = 3 * (d0 + r); assert.ok(Math.abs(b[o + 1]) <= 1 + 1e-12 && b[o + 2] === b[3 * d0 + 2]); } }
    return `retour ${I.retourPeriode.mesure.toExponential(1)}, fondamentale ${(I.harmonique1.mesure - ref).toExponential(1)}${q ? ', harmonique ' + q + ' nulle' : ''}`;
  });
  for (const p of [...extremes(sys('effetDoppler')), { mach: 0.99 }, { mach: 1.5 }]) ok(`effetDoppler ${JSON.stringify(p)} : (c - v) T devant, (c + v) T derriere, sin theta = 1/M, chaque point sur son front`, () => {
    const R = S('effetDoppler', p), M = R.params.mach, I = R.invariants, b = R.brut;
    if (M < 1) { assert.ok(Math.abs(I.devant.mesure - (1 - M)) < 1e-12 && Math.abs(I.derriere.mesure - (1 + M)) < 1e-12 && Math.abs(I.frequenceDevant.mesure * (1 - M) - 1) < 1e-9); assert.ok(!('cone' in I)); }
    else { assert.ok(Math.abs(I.cone.formule - 1 / M) < 1e-15 && Math.abs(I.cone.mesure - 1 / M) < 1e-12 && Math.abs(Math.sin(I.cone.angleDegres / deg) - 1 / M) < 1e-12); assert.ok(!('devant' in I)); }
    for (let i = 0; i < R.n; i++) { const o = 3 * i, tk = b[o + 2]; assert.ok(Number.isInteger(tk) && tk >= 0 && tk < 16); assert.ok(Math.abs(Math.hypot(b[o] - M * tk, b[o + 1]) - (16 - tk)) < 1e-9, 'point ' + i); }
    return M < 1 ? `devant ${I.devant.mesure.toFixed(3)}, derriere ${I.derriere.mesure.toFixed(3)}` : `sin theta ${I.cone.mesure.toFixed(4)} (${I.cone.angleDegres.toFixed(2)} degres)`;
  });
  /* game125 : lentille — di = 1 / (1 - 1/do), grandissement -di/do ; au foyer (|di| > 20) dit « tres loin » ; chaque rayon part de l objet */
  for (const p of [...extremes(sys('lentilleMince')), { distance: 1 }, { distance: 1.04 }, { distance: 0.5 }, { distance: 1.5 }]) ok(`lentilleMince ${JSON.stringify(p)} : conjugaison, grandissement, image virtuelle, au foyer`, () => {
    const R = S('lentilleMince', p), d = R.params.distance, I = R.invariants, b = R.brut, inv = 1 - 1 / d;
    if (Math.abs(inv) < 0.05) { assert.ok(Number.isNaN(I.image.mesure) && typeof I.image.absente === 'string'); }
    else { const di = 1 / inv; assert.ok(Math.abs(I.image.formule - di) < 1e-12 * Math.abs(di) && Math.abs(I.image.mesure - di) < 1e-9 * Math.max(1, Math.abs(di)), 'image ' + I.image.mesure + ' ' + di);
      assert.ok(Math.abs(I.grandissement.mesure + di / d) < 1e-9 * Math.max(1, Math.abs(di / d)) && I.convergence.mesure < 1e-12, 'grandissement'); assert.equal(I.image.virtuelle, di < 0 ? 1 : 0); }
    let departs = 0; for (let i = 0; i < R.n; i++) { const o = 3 * i; if (Math.abs(b[o] + d) < 1e-12 && Math.abs(b[o + 1] - 1) < 1e-12) departs++; } assert.ok(departs >= 9, 'les 9 rayons partent de l objet : ' + departs);
    return Math.abs(inv) < 0.05 ? 'image tres loin (dit)' : 'image ' + I.image.mesure.toFixed(4);
  });
  ok('bornage : hors bornes ramene, NaN -> defaut, entiers arrondis', () => {
    assert.deepEqual(T.simuler('cordeVibrante', { pince: 9, cellules: 10.6 }, { n: 20 }).params, { pince: 0.5, cellules: 40 });
    assert.deepEqual(T.simuler('arcEnCiel', { indice: NaN }, { n: 20 }).params, { indice: 1.33 });
  });
  return res;
}

const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
const src = readFileSync(SOURCE, 'utf8'), moi = readFileSync(fileURLToPath(import.meta.url), 'utf8');
const interdits = src.match(/Math\.(sin|cos|tan|exp|log|pow|atan2?|asin|acos|hypot|sinh|cosh|tanh|asinh|acosh|cbrt|expm1|log1p|log2|log10|random)\b/g);
assertions++; if (interdits) ech.push({ nom: 'source sans Math transcendante', det: interdits.join(',') });
console.log(`${interdits ? 'ECHEC ' : 'OK    '}source : aucune Math transcendante ni Math.random (${interdits ? interdits.join(',') : 'aucune'})`);
const marque = new RegExp(['de m' + 'emoire', 'from m' + 'emory', 'de t' + 'ete', 'a sour' + 'cer', 'unsour' + 'ced', 'non sour' + 'ce', 'TO' + 'DO'].join('|'), 'i');
const marques = [src, moi].flatMap((t, i) => t.split(/\r?\n/).map((l, j) => [i ? 'test' : 'module', j + 1, l]).filter(([, , l]) => marque.test(l)));
assertions++; if (marques.length) ech.push({ nom: 'valeur marquee sans source lue', det: marques.map(([f, j]) => f + ':' + j).join(',') });
console.log('\nTEMPS :'); for (const s of T.SYSTEMES) { let pire = 0; for (const p of extremes(s)) { const a = performance.now(); T.simuler(s.id, p); pire = Math.max(pire, performance.now() - a); } console.log(`  ${s.id} : pire ${pire.toFixed(0)} ms`); }

const MUTANTS = [
  ['arc : refraction d entree a 1.01 / n', 'd = refr(d, [p[0], p[1]], 1 / nIdx);', 'd = refr(d, [p[0], p[1]], 1.01 / nIdx);'],
  ['arc : Descartes avec k (k + 1)', 'const ci = Math.sqrt((nIdx * nIdx - 1) / (k * (k + 2)))', 'const ci = Math.sqrt((nIdx * nIdx - 1) / (k * (k + 1)))'],
  ['arc : reflexion sans le facteur 2', 'd = [d[0] - 2 * dn * N[0], d[1] - 2 * dn * N[1]];', 'd = [d[0] - 1.9 * dn * N[0], d[1] - 1.9 * dn * N[1]];'],
  ['corde : schema amorti (0.999 u^(t-1))', 'nv[i] = cour[i + 1] + cour[i - 1] - prec[i];', 'nv[i] = cour[i + 1] + cour[i - 1] - 0.999 * prec[i];'],
  ['corde : premier pas sans la moyenne des voisins', 'cour[i] = (u0[i + 1] + u0[i - 1]) / 2;', 'cour[i] = u0[i];'],
  ['corde : harmonique en 1/n au lieu de 1/n^2', '(m * m * PI * PI * aa * (1 - aa))', '(m * PI * PI * aa * (1 - aa))'],
  ['doppler : source a 0.9 v', 'xk = v * tk,', 'xk = 0.9 * v * tk,'],
  ['doppler : cone en 1 / M^2', "inv.cone = { mesure: m, formule: 1 / M,", "inv.cone = { mesure: m, formule: 1 / (M * M),"],
  ['lentille : la lentille ne devie que de 0.9 y / f', 's2 = s1 - yl / f;', 's2 = s1 - 0.9 * yl / f;'],
  ['lentille : formule de conjugaison a 1.01', 'loin ? NaN : 1 / inv', 'loin ? NaN : 1.01 / inv'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-ondes-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`);
    writeFileSync(f, src.replace(de, vers).replace("from './tam-moteur.js'", `from '${moteur}'`));
    let r; try { r = suite(await import(pathToFileURL(f).href)); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok); if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-ondes-20261103 : ${assertions} assertions OK`);
