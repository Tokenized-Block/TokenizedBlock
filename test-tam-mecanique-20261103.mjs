// test-tam-mecanique-20261103.mjs -- banc de tam-mecanique.js (electricite, vue non frappable) + mutants sur COPIES.
// Lancer : node test-tam-mecanique-20261103.mjs
// References independantes : billard, le compte doit egaler floor(pi 10^k) (Math.PI, pas la formule du module) et chaque etat est sur le
//   cercle de l energie ; chaine, periode contre 2 pi / omega_j ET contre la frequence EXACTE du schema de Verlet (2/h) asin(omega h / 2),
//   et chaque image garde la forme sin(i j pi / (N + 1)) du mode.
// Tolerances (mesurees le 2026-11-03) : periode physique 5e-5 (mesure 1.7e-5), Verlet 1e-6, fuite 1e-12 (mesure 1e-15).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-mecanique.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const IDS = ['billardPi', 'modesNormaux'];

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
  ok('SYSTEMES gele, 2 systemes, SOURCES vide, COLONNES couvre chaque colonne', () => {
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
  for (let k = 0; k <= 5; k++) ok(`billardPi chiffres = ${k} : le nombre de chocs ecrit les ${k + 1} premiers chiffres de pi, etats sur le cercle de l energie`, () => {
    const R = S('billardPi', { chiffres: k }), I = R.invariants, b = R.brut, M = 100 ** k;
    assert.equal(I.chocs.mesure, Math.floor(Math.PI * 10 ** k), 'chocs ' + I.chocs.mesure);
    assert.equal(I.chocs.formule, Math.ceil(Math.PI / Math.atan(Math.sqrt(1 / M))) - 1);
    assert.ok(I.energie.derive / I.energie.debut < 1e-9, 'energie ' + I.energie.derive / I.energie.debut);
    for (let i = 0; i < R.n; i++) { const o = 3 * i; assert.ok(Math.abs(Math.hypot(b[o], b[o + 1]) - Math.sqrt(M)) < 1e-6 * Math.sqrt(M), 'sur le cercle ' + i); if (i) assert.ok(b[o + 2] >= b[o - 1]); }
    return I.chocs.mesure + ' chocs';
  });
  for (const p of [...extremes(sys('modesNormaux')), { masses: 3, mode: 2 }, { masses: 10, mode: 7 }]) ok(`modesNormaux ${JSON.stringify(p)} : periode = 2 pi / omega_j (et la frequence exacte de Verlet), la chaine garde la forme du mode`, () => {
    const R = S('modesNormaux', p), N = R.params.masses, j = Math.min(R.params.mode, N), I = R.invariants, b = R.brut, h = 0.01;
    const om = 2 * Math.sin(j * Math.PI / (2 * (N + 1))), Om = 2 / h * Math.asin(om * h / 2);
    assert.ok(Math.abs(I.periodeMode.formule - 2 * Math.PI / om) < 1e-12 * I.periodeMode.formule, 'formule');
    assert.ok(Math.abs(I.periodeMode.mesure / (2 * Math.PI / om) - 1) < 5e-5, 'periode physique');
    assert.ok(Math.abs(I.periodeMode.mesure / (2 * Math.PI / Om) - 1) < 1e-6, 'periode du schema de Verlet ' + (I.periodeMode.mesure / (2 * Math.PI / Om) - 1));
    assert.ok(I.resteDansLeMode.mesure < 1e-12, 'fuite ' + I.resteDansLeMode.mesure);
    for (let f = 0; f < R.film.images; f++) { const d0 = R.film.debuts[f], c = R.film.tailles[f]; let ratio = null;
      for (let r = 0; r < c; r++) { const o = 3 * (d0 + r), i = b[o]; assert.ok(Number.isInteger(i) && i >= 0 && i <= N + 1); const fo = Math.sin(i * j * Math.PI / (N + 1));
        if (i === 0 || i === N + 1) { assert.equal(b[o + 1], 0); continue; } if (Math.abs(fo) > 0.2) { const q = b[o + 1] / fo; if (ratio === null) ratio = q; else assert.ok(Math.abs(q - ratio) < 1e-9, 'forme du mode, image ' + f); } } }
    return 'ecart physique ' + (I.periodeMode.mesure / (2 * Math.PI / om) - 1).toExponential(1) + ', Verlet ' + (I.periodeMode.mesure / (2 * Math.PI / Om) - 1).toExponential(1);
  });
  ok('bornage : hors bornes ramene, entiers arrondis', () => { assert.deepEqual(T.simuler('billardPi', { chiffres: 9 }, { n: 20 }).params, { chiffres: 5 }); assert.deepEqual(T.simuler('modesNormaux', { masses: 2.6, mode: NaN }, { n: 20 }).params, { masses: 3, mode: 2 }); });
  return res;
}

const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
const src = readFileSync(SOURCE, 'utf8');
const interdits = src.match(/Math\.(sin|cos|tan|exp|log|pow|atan2?|asin|acos|hypot|sinh|cosh|tanh|asinh|acosh|cbrt|expm1|log1p|log2|log10|random)\b/g);
assertions++; if (interdits) ech.push({ nom: 'source sans Math transcendante', det: interdits.join(',') });
console.log(`${interdits ? 'ECHEC ' : 'OK    '}source : aucune Math transcendante ni Math.random`);
console.log('\nTEMPS :'); for (const s of T.SYSTEMES) { let pire = 0; for (const p of extremes(s)) { const a = performance.now(); T.simuler(s.id, p); pire = Math.max(pire, performance.now() - a); } console.log(`  ${s.id} : pire ${pire.toFixed(0)} ms`); }

const MUTANTS = [
  ['billard : choc avec 1.999 M', 'v2 = ((m - M) * v + 2 * M * V) / (M + m)', 'v2 = ((m - M) * v + 1.999 * M * V) / (M + m)'],
  ['billard : rebond au mur qui perd 0.1 %', 'else if (v < 0) v = -v;', 'else if (v < 0) v = -0.999 * v;'],
  ['billard : theta = atan(m / M)', 'atanD(Math.sqrt(m / M))', 'atanD(m / M)'],
  ['modes : pulsation avec 2 N au lieu de 2 (N + 1)', 'om = 2 * sinD(j * PI / (2 * (N + 1)))', 'om = 2 * sinD(j * PI / (2 * N))'],
  ['modes : ressort central a 2.01', '- 2 * xi + (i > 0 ? xx[i - 1] : 0)', '- 2.01 * xi + (i > 0 ? xx[i - 1] : 0)'],
  ['modes : forme du mode sur N au lieu de N + 1', 'sinD((i + 1) * j * PI / (N + 1))', 'sinD((i + 1) * j * PI / N)'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-mecanique-mutants-'));
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
console.log(`test-tam-mecanique-20261103 : ${assertions} assertions OK`);
