// test-tam-electricite-20261103.mjs -- banc de tam-electricite.js (electricite, vue non frappable) + mutants sur COPIES.
// Lancer : node test-tam-electricite-20261103.mjs
// References independantes : compte attendu des lignes echappees recalcule ici ; pour q2 = -1 chaque ligne doit etre un CERCLE par les
//   deux charges (2-D), verifie point par point sans lire l integration ; RC par Math.exp / Math.log.
// Tolerances (mesurees le 2026-11-03) : angle d arrivee < 0.2 degre (mesure 0.005..0.085), cercle < 1e-3, RC a 1e-4 (pas 0.005).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-electricite.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const IDS = ['lignesChamp', 'circuitRC'];

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
  for (const p of [...extremes(sys('lignesChamp')), { charge: -0.5 }, { charge: -0.8 }]) ok(`lignesChamp ${JSON.stringify(p)} : lignes echappees = compte attendu, angle d arrivee = flux`, () => {
    const R = S('lignesChamp', p), q = R.params.charge, I = R.invariants, b = R.brut;
    let att = 0; for (let k = 0; k < 24; k++) { const th = (k + 0.5) * Math.PI / 12, ta = th > Math.PI ? 2 * Math.PI - th : th; if (ta > Math.PI * Math.abs(q)) att++; }
    assert.equal(I.echappees.formule, att); assert.equal(I.echappees.mesure, att, 'echappees ' + I.echappees.mesure + ' attendu ' + att); assert.equal(I.echappees.nonConclues, 0);
    assert.equal(I.angleArrivee.lignesArrivees, 24 - att); assert.ok(I.angleArrivee.mesure < 0.2, 'angle ' + I.angleArrivee.mesure);
    for (let i = 0; i < R.n; i++) { const o = 3 * i; assert.ok(Number.isInteger(b[o + 2]) && b[o + 2] >= 1 && b[o + 2] <= 24); }
    return 'echappees ' + att + ', pire angle ' + I.angleArrivee.mesure.toFixed(3) + ' degre';
  });
  ok('lignesChamp q2 = -1 : chaque ligne est un CERCLE par les deux charges (2-D, reference independante de l integration)', () => {
    const R = S('lignesChamp', { charge: -1 }), b = R.brut, cs = new Map();
    for (let i = 0; i < R.n; i++) { const o = 3 * i, x = b[o], y = b[o + 1]; if (Math.abs(y) < 0.05) continue; const c = (x * x + y * y - 1) / (2 * y), k = b[o + 2]; if (!cs.has(k)) cs.set(k, []); cs.get(k).push(c); }
    let pire = 0; for (const v of cs.values()) { const m = v.reduce((a, x) => a + x, 0) / v.length; for (const c of v) pire = Math.max(pire, Math.abs(c - m) / (1 + Math.abs(m))); }
    assert.ok(cs.size >= 20 && pire < 1e-3, 'ecart au cercle ' + pire + ' sur ' + cs.size + ' lignes'); return 'pire ' + pire.toExponential(1) + ' sur ' + cs.size + ' lignes';
  });
  for (const p of [...extremes(sys('circuitRC')), { tau: 0.5 }, { tau: 2 }]) ok(`circuitRC ${JSON.stringify(p)} : 1 - 1/e, ln 2, energies (pile = C V, perdue = C V - C V^2/2), courbes`, () => {
    const R = S('circuitRC', p), tau = R.params.tau, I = R.invariants, b = R.brut, VT = 1 - Math.exp(-6 / tau);
    assert.ok(Math.abs(I.tensionTau.mesure - (1 - Math.exp(-1))) < 1e-8 && Math.abs(I.demiCharge.mesure - Math.log(2)) < 1e-4, 'tau, ln 2');
    assert.ok(Math.abs(I.energieFournie.formule - VT) < 1e-8 && Math.abs(I.energieFournie.mesure / VT - 1) < 1e-4, 'pile');
    assert.ok(Math.abs(I.energiePerdue.formule - (VT - VT * VT / 2)) < 1e-8 && Math.abs(I.energiePerdue.mesure / I.energiePerdue.formule - 1) < 1e-4, 'perdue');
    for (let i = 0; i < R.n; i++) { const o = 3 * i; assert.ok(b[o] >= 0 && b[o] <= 12 + 1e-9 && Math.abs(b[o + 1]) <= 1 + 1e-9 && (b[o + 2] === 0 || b[o + 2] === 1)); if (b[o + 2] === 0) assert.ok(b[o + 1] >= -1e-12); }
    return 'perdue ' + I.energiePerdue.mesure.toFixed(5) + ' / gardee ' + I.energiePerdue.gardee.toFixed(5);
  });
  ok('bornage : hors bornes ramene, NaN -> defaut', () => { assert.deepEqual(T.simuler('lignesChamp', { charge: 5 }, { n: 20 }).params, { charge: -0.25 }); assert.deepEqual(T.simuler('circuitRC', { tau: NaN }, { n: 20 }).params, { tau: 1 }); });
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
  ['champ : q2 de signe oppose dans le champ', 'ax / a2 + q2 * bx / b2', 'ax / a2 - q2 * bx / b2'],
  ['champ : arrivee q1 theta x |q2| au lieu de / |q2|', 'formule: thAbs / Math.abs(q2)', 'formule: thAbs * Math.abs(q2)'],
  ['champ : depart a 0.02 (le biais du 03/11)', 'EPS = 0.001, FIN', 'EPS = 0.02, FIN'],
  ['RC : constante de temps 1.05 tau', 'f = (v) => (Vs - v) / tau', 'f = (v) => (Vs - v) / (1.05 * tau)'],
  ['RC : chaleur sans le facteur R', 'dissipee += h * tau * (I(st - 1) ** 2 + I(st) ** 2) / 2;', 'dissipee += h * (I(st - 1) ** 2 + I(st) ** 2) / 2;'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-electricite-mutants-'));
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
console.log(`test-tam-electricite-20261103 : ${assertions} assertions OK`);
