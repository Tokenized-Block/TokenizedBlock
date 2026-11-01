// test-tam-physique-20261101.mjs -- banc de tam-physique.js (vue PHYSIQUE, non frappable) + mutants sur COPIES.
// Lancer : node test-tam-physique-20261101.mjs
// Tolerances annoncees (mesurees le 2026-11-01, puis marge) :
//   energie Kepler / Schwarzschild < 1e-10 (relatif) ; double pendule < 1e-6 ; huit < 1e-9 ; Boris (champ B pur) < 1e-9 ;
//   E x B relativiste (gamma - E0 x, Boris O(h^2)) < 1e-3 ; precession RG faible champ a 10 % de 6 pi M / (a (1 - e^2)) ;
//   retour du huit apres une periode < 1e-5 ; <r> hydrogene a 5 % de (3n^2 - l(l+1))/2.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-physique.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const sim = (id, p, o) => T.simuler(id, p, o);
  // 1. forme et bornes, chaque systeme aux defauts
  ok('SYSTEMES gele, 7 systemes', () => { assert.ok(Object.isFrozen(T.SYSTEMES)); assert.equal(T.SYSTEMES.length, 7); assert.ok(Object.isFrozen(T.SYSTEMES[0].params)); });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, brut n*D fini, points null`, () => {
      const r = sim(s.id);
      assert.equal(r.bornee, true, r.raison); assert.equal(r.D, s.D); assert.equal(r.n, 1500);
      assert.equal(r.brut.length, 1500 * s.D); assert.ok(r.brut.every(Number.isFinite)); assert.equal(r.points, null);
      assert.ok(typeof s.phrase === 'string' && s.phrase.length > 40 && s.nom && s.science);
    });
    ok(`${s.id} : determinisme (octets identiques)`, () => assert.ok(octets(sim(s.id).brut).equals(octets(sim(s.id).brut))));
  }
  // 2. conservation
  const der = (id, p, k) => sim(id, p).invariants[k].derive;
  ok('kepler : derive energie < 1e-10', () => { const d = der('kepler', {}, 'energie'); assert.ok(d < 1e-10, String(d)); return d.toExponential(2); });
  ok('schwarzschild : derive E < 1e-10', () => { const d = der('schwarzschild', {}, 'E'); assert.ok(d < 1e-10, String(d)); return d.toExponential(2); });
  ok('doublePendule : derive energie < 1e-6', () => { const d = der('doublePendule', {}, 'energie'); assert.ok(d < 1e-6, String(d)); return d.toExponential(2); });
  ok('troisCorps (huit) : derive energie < 1e-9, |P| et |L| < 1e-12', () => {
    const r = sim('troisCorps'); const I = r.invariants;
    assert.ok(I.energie.derive < 1e-9, String(I.energie.derive)); assert.ok(I.quantiteDeMouvement.derive < 1e-12); assert.ok(I.momentCinetique.derive < 1e-12);
    return I.energie.derive.toExponential(2);
  });
  for (const rapport of [0.3, 3]) ok(`tokamak rapport ${rapport} : energie cinetique Boris < 1e-9`, () => { const d = der('tokamak', { rapport }, 'energieCinetique'); assert.ok(d < 1e-9, String(d)); return d.toExponential(2); });
  ok('lorentzRelativiste : derive (gamma - E0 x) < 1e-3, gamma varie', () => {
    const I = sim('lorentzRelativiste').invariants; assert.ok(I.energie.derive < 1e-3, String(I.energie.derive)); assert.ok(I.gamma.max > I.gamma.min * 1.5);
    return I.energie.derive.toExponential(2) + ' gamma ' + I.gamma.min.toFixed(3) + '..' + I.gamma.max.toFixed(3);
  });
  // 3. physique RG
  for (const p of [{ L: 10, r0: 150 }, { L: 12, r0: 300, tours: 10 }]) ok(`schwarzschild ${JSON.stringify(p)} : precession a 10 % de 6 pi M/(a(1-e^2))`, () => {
    const P = sim('schwarzschild', p).invariants.precession;
    assert.ok(P.orbites >= 3); assert.ok(P.ecart < 0.1, `${P.mesure} vs ${P.formule}`);
    return `${P.mesure.toFixed(4)} vs ${P.formule.toFixed(4)} (${(100 * P.ecart).toFixed(1)} %)`;
  });
  ok('schwarzschild champ fort (defaut) : precession > formule faible champ', () => { const P = sim('schwarzschild').invariants.precession; assert.ok(P.mesure > P.formule); return `${P.mesure.toFixed(3)} > ${P.formule.toFixed(3)}`; });
  ok('kepler : precession ~ 0 (< 1e-6 rad/orbite)', () => { const P = sim('kepler', { L: 10, r0: 150 }).invariants.precession; assert.ok(P.orbites >= 3 && Math.abs(P.mesure) < 1e-6, String(P.mesure)); });
  /* 2026-11-01 (demande du proprietaire) : la capture n est plus un refus, c est une FIN dessinee jusqu a l horizon */
  ok('schwarzschild L=3.6 r0=20 : capture = fin dessinee (n lignes, derniere ligne a l horizon)', () => {
    const r = sim('schwarzschild', { L: 3.6, r0: 20 }), n = r.n, b = r.brut;
    assert.equal(r.bornee, true); assert.match(r.raison, /capture/); assert.equal(b.length, n * 3); assert.ok(b.every(Number.isFinite));
    assert.equal(r.fin.evenement, 'capture'); assert.equal(r.fin.indice, n - 1); assert.ok(r.fin.t > 0 && Number.isFinite(r.fin.t));
    const rr = (i) => Math.sqrt(b[3 * i] * b[3 * i] + b[3 * i + 1] * b[3 * i + 1]);
    assert.ok(rr(n - 1) >= 2 && rr(n - 1) < 2.2, String(rr(n - 1))); assert.ok(Math.abs(rr(0) - 20) < 1e-9);
    for (let i = 1; i < n; i++) assert.ok(rr(i) <= rr(i - 1) + 1e-9, 'plongee monotone ' + i);
    return `r final ${rr(n - 1).toFixed(4)}, t ${r.fin.t.toFixed(2)}`;
  });
  ok('schwarzschild defaut (tours 12) : orbite liee, pas de fin', () => { const r = sim('schwarzschild'); assert.equal(r.params.tours, 12); assert.equal(r.fin, undefined); assert.ok(r.invariants.precession.orbites >= 5); });
  /* game82 : une orbite NON LIEE est une fin dessinee (fuite jusqu a 10 r0), plus un refus */
  ok('kepler L=12 r0=6 : non liee -> fin « escape » dessinee jusqu a 10 r0', () => {
    const r = sim('kepler', { L: 12, r0: 6 }); assert.equal(r.bornee, true); assert.equal(r.fin && r.fin.evenement, 'escape');
    const rr = (i) => Math.hypot(r.brut[3 * i], r.brut[3 * i + 1]); assert.ok(rr(r.n - 1) > 55 && rr(r.n - 1) <= 60 * (1 + 1e-9), 'derniere ligne vers 10 r0 : ' + rr(r.n - 1));
    for (let i = 0; i < r.n; i++) assert.ok(rr(i) <= 60 * (1 + 1e-9)); });
  ok('schwarzschild L=7.8 r0=20 : non liee (E >= 1) -> fin « escape »', () => { const r = sim('schwarzschild', { L: 7.8, r0: 20 }); assert.equal(r.bornee, true); assert.equal(r.fin.evenement, 'escape'); });
  ok('tokamak B0=10 : la particule touche la paroi -> fin « hits the wall » dessinee, derniere ligne a la paroi', () => {
    const r = sim('tokamak', { B0: 10 }); assert.equal(r.bornee, true); assert.equal(r.fin && r.fin.evenement, 'hits the wall');
    const i = r.n - 1, R = Math.hypot(r.brut[3 * i], r.brut[3 * i + 1]), d = Math.hypot(R - 1, r.brut[3 * i + 2]); assert.ok(d <= 0.8 + 1e-9 && d > 0.7, 'distance au coeur ' + d); });
  /* le piege : une orbite LIEE tres excentrique depasse 10 r0 (apoastre ~ 492 pour L = 6.2, r0 = 20) — elle n est jamais coupee */
  ok('kepler L=6.2 r0=20 : liee, apoastre > 10 r0, PAS coupee', () => { const r = sim('kepler', { L: 6.2, r0: 20 }); assert.equal(r.bornee, true); assert.ok(!r.fin, 'pas de fin');
    let m = 0; for (let i = 0; i < r.n; i++) m = Math.max(m, Math.hypot(r.brut[3 * i], r.brut[3 * i + 1])); assert.ok(m > 200, 'apoastre ' + m); });
  // 4. huit et chaos
  ok('huit : retour au depart apres une periode (< 1e-5)', () => {
    const r = sim('troisCorps', { duree: T.T_HUIT }), b = r.brut, n = r.n; let d = 0;
    for (let k = 0; k < 9; k++) d = Math.max(d, Math.abs(b[(n - 1) * 9 + k] - b[k]));
    assert.ok(d < 1e-5, String(d)); return d.toExponential(2);
  });
  const l8 = sim('troisCorps', { duree: 200 }), lp = sim('troisCorps', { perturbation: 0.3, duree: 200 });
  ok('huit duree 200 : lambda < 0.06 (stable)', () => { assert.ok(l8.bornee && l8.lyapunov < 0.06, String(l8.lyapunov)); return l8.lyapunov.toFixed(4); });
  ok('perturbation 0.3 duree 200 : lambda > 0.2 et > 5x le huit', () => { assert.ok(lp.bornee && lp.lyapunov > 0.2 && lp.lyapunov > 5 * l8.lyapunov, String(lp.lyapunov)); return lp.lyapunov.toFixed(4); });
  ok('perturbation 0.3 : energie < 1e-5 malgre les rencontres', () => { assert.ok(lp.invariants.energie.derive < 1e-5, String(lp.invariants.energie.derive)); return lp.invariants.energie.derive.toExponential(2); });
  ok('doublePendule defaut : lambda > 0.2 ; petits angles : |lambda| < 0.05', () => {
    const a = sim('doublePendule').lyapunov, b = sim('doublePendule', { theta1: 0.1, theta2: 0.1 }).lyapunov;
    assert.ok(a > 0.2 && Math.abs(b) < 0.05, `${a} ${b}`); return `${a.toFixed(3)} / ${b.toFixed(4)}`;
  });
  ok('kepler : |lambda| < 1e-3', () => { const l = sim('kepler').lyapunov; assert.ok(Math.abs(l) < 1e-3, String(l)); return l.toExponential(2); });
  // 5. tokamak : banane vs passante
  ok('tokamak rapport 0.3 piegee, rapport 3 passante', () => {
    const a = sim('tokamak').invariants.vitesseParallele, b = sim('tokamak', { rapport: 3 }).invariants.vitesseParallele;
    assert.ok(a.rebonds > 0); assert.equal(b.rebonds, 0); return `${a.rebonds} rebonds / ${b.rebonds}`;
  });
  // 6. hydrogene
  for (const p of [{ n: 1, l: 0, m: 0 }, { n: 3, l: 2, m: 1 }, { n: 4, l: 3, m: 3 }]) ok(`hydrogene ${JSON.stringify(p)} : <r> a 5 % de la theorie, nuage`, () => {
    const r = sim('hydrogene', p); assert.equal(r.nuage, true); assert.equal(r.lyapunov, null);
    assert.ok(r.invariants.rayonMoyen.derive < 0.05, String(r.invariants.rayonMoyen.derive)); assert.equal(r.invariants.echantillonnage.depassementsDuMax, 0);
    return `${r.invariants.rayonMoyen.fin.toFixed(3)} vs ${r.invariants.rayonMoyen.debut}`;
  });
  ok('hydrogene : autre graine -> autre nuage', () => assert.ok(!octets(sim('hydrogene', { graine: 2 }).brut).equals(octets(sim('hydrogene').brut))));
  // 7. bornage
  ok('bornage : hors bornes ramene, NaN -> defaut', () => {
    assert.deepEqual(sim('schwarzschild', { L: 100, r0: -5, tours: 1e9 }, { n: 50 }).params, { L: 12, r0: 6, tours: 35 });
    assert.deepEqual(sim('doublePendule', { theta1: NaN, theta2: 'x', duree: 1e6 }, { n: 50 }).params, { theta1: 2, theta2: 2, duree: 160 });
    assert.deepEqual(sim('hydrogene', { n: 2, l: 3, m: -3, graine: 7.6 }, { n: 50 }).params, { n: 2, l: 1, m: -1, graine: 8 });
  });
  ok('reglagesPhysique : forme reglagesDe, valeur bornee', () => {
    const r = T.reglagesPhysique('tokamak', { B0: 1e9 });
    assert.deepEqual(r.map((x) => x.chemin), ['params.B0', 'params.q', 'params.rapport', 'params.duree']);
    assert.deepEqual(r[0], { chemin: 'params.B0', nom: 'B0', min: 10, max: 200, valeur: 200 });
  });
  return res;
}

// ---------- banc ----------
const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
console.log('\nTEMPS simuler(id) a n = 1500 (mediane de 3) :');
for (const s of T.SYSTEMES) {
  const t = []; for (let k = 0; k < 3; k++) { const a = performance.now(); T.simuler(s.id); t.push(performance.now() - a); }
  t.sort((a, b) => a - b); const ms = t[1];
  console.log(`  ${s.id.padEnd(20)} ${ms.toFixed(1)} ms`);
  assertions++; if (!(ms < 300)) ech.push({ nom: 'temps ' + s.id + ' < 300 ms', det: ms.toFixed(1) });
}

// ---------- mutants (copies dans un dossier temporaire ; l import du moteur pointe vers l original) ----------
const MUTANTS = [
  ['terme 3 M u^2 retire (RG -> Newton)', ' + c.rg * 3 * c.M * u * u', ''],
  ['gravite repulsive (signe inverse)', 'a[3 * i + k] += dk * inv; a[3 * j + k] -= dk * inv;', 'a[3 * i + k] -= dk * inv; a[3 * j + k] += dk * inv;'],
  ['Boris remplace par Euler', 'function tournerBoris(v, o, bx, by, bz, h) {',
    'function tournerBoris(v, o, bx, by, bz, h) { { const a = v[o], b = v[o + 1], c = v[o + 2]; v[o] += h * (b * bz - c * by); v[o + 1] += h * (c * bx - a * bz); v[o + 2] += h * (a * by - b * bx); return; }'],
  ['double pendule : signe de alpha2', 'd[3] = (2 * sD', 'd[3] = (-2 * sD'],
  ['hydrogene : exp(-rho) au lieu de exp(-rho/2)', 'expD(-rho / 2)', 'expD(-rho)'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['Math.random injecte', 'alea = mulberry32(c.graine >>> 0)', 'alea = Math.random'],
  ['capture redevient un refus', "evenement: (raison) => (raison.startsWith('capture') ? 'capture' : raison.startsWith('fuite') ? 'escape' : null),", "evenement: (raison) => (raison.startsWith('fuite') ? 'escape' : null),"],
  ['fuite coupee aussi sur une orbite LIEE (critere de distance au lieu de l energie)', 'c.libre && y[0] <= c.uFuite', 'y[0] <= c.uFuite'],
  ['rejeu jusqu APRES l evenement (tAvant -> tc + hk)', 'tAvant: tc,', 'tAvant: tc + hk,'],
];
const brut = readFileSync(SOURCE, 'utf8'), moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-physique-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = brut.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`);
    writeFileSync(f, brut.replace(de, vers).replace("from './tam-moteur.js'", `from '${moteur}'`));
    let r; try { r = suite(await import(pathToFileURL(f).href)); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-physique-20261101 : ${assertions} assertions OK`);
