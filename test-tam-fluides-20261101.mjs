// test-tam-fluides-20261101.mjs -- banc de tam-fluides.js (vue MECANIQUE DES FLUIDES, non frappable) + mutants sur COPIES.
// Lancer : node test-tam-fluides-20261101.mjs
// Tolerances annoncees (mesurees le 2026-11-01, puis marge) :
//   tourbillons : derive H < 1e-8 (relatif ; mesure ~1e-11 a 4, ~1e-15 a 3), impulsions < 1e-9 ;
//   divergence des champs analytiques (differences centrees ordre 4, pas 2e-4) < 1e-9 (mesure ~1e-12 a 4e-11) ;
//   Karman : somme Biot-Savart directe (80 002 termes) a 1 % de Lamb U = (G/2a) tanh(pi h/a) (mesure ~1e-5),
//     formule fermee vs somme directe < 1e-3, psi du repere mobile conserve < 1e-7 ;
//   double gyre stationnaire (eps = 0) depuis la separatrice : lambda a 1 % de pi^2 A (point selle (1, 0)) ;
//   Lyapunov : seulement des rapports MESURES (4 tourbillons ~0.026 vs 3 ~0.003 a duree 1000 ; integrable = decroit en ln(t)/t).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-fluides.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const PI = Math.PI;

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const sim = (id, p, o) => T.simuler(id, p, o);
  // 1. forme et bornes, chaque systeme aux defauts
  ok('SYSTEMES gele, 4 systemes, science Fluid mechanics', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES)); assert.equal(T.SYSTEMES.length, 4); assert.ok(Object.isFrozen(T.SYSTEMES[0].params));
    assert.ok(T.SYSTEMES.every((s) => s.science === 'Fluid mechanics' && !/solv\w* (the )?Navier/i.test(s.phrase)));
  });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, brut n*D fini, points null`, () => {
      const r = sim(s.id);
      assert.equal(r.bornee, true, r.raison); assert.equal(r.D, s.D); assert.equal(r.n, 1500);
      assert.equal(r.brut.length, 1500 * s.D); assert.ok(r.brut.every(Number.isFinite)); assert.equal(r.points, null);
      assert.ok(Number.isFinite(r.lyapunov)); assert.ok(typeof s.phrase === 'string' && s.phrase.length > 40 && s.nom);
    });
    ok(`${s.id} : determinisme (octets identiques)`, () => assert.ok(octets(sim(s.id).brut).equals(octets(sim(s.id).brut))));
  }
  ok('tourbillons nombre 3 : D = 6, brut 1500*6', () => { const r = sim('tourbillonsPonctuels', { nombre: 3 }); assert.equal(r.D, 6); assert.equal(r.brut.length, 9000); });
  // 2. tourbillons ponctuels : invariants hamiltoniens
  for (const p of [{}, { nombre: 3 }, { G1: 2, G4: 0.5 }, { nombre: 3, G2: 3 }]) ok(`tourbillons ${JSON.stringify(p)} : derive H < 1e-8, impulsions < 1e-9`, () => {
    const I = sim('tourbillonsPonctuels', p).invariants;
    assert.ok(I.hamiltonien.derive < 1e-8, String(I.hamiltonien.derive));
    for (const k of ['impulsionX', 'impulsionY', 'impulsionAngulaire']) assert.ok(I[k].derive < 1e-9, k + ' ' + I[k].derive);
    return 'H ' + I.hamiltonien.derive.toExponential(2) + ' I ' + I.impulsionAngulaire.derive.toExponential(2);
  });
  const l4 = sim('tourbillonsPonctuels').lyapunov, l3 = sim('tourbillonsPonctuels', { nombre: 3 }).lyapunov;
  const l4b = sim('tourbillonsPonctuels', { duree: 500 }).lyapunov, l3b = sim('tourbillonsPonctuels', { nombre: 3, duree: 500 }).lyapunov;
  ok('tourbillons duree 1000 : lambda(4) > 0.015 et > 5x lambda(3)', () => { assert.ok(l4 > 0.015 && l4 > 5 * l3, `${l4} ${l3}`); return `${l4.toFixed(4)} vs ${l3.toFixed(4)}`; });
  ok('tourbillons : lambda(3) decroit 500 -> 1000 (integrable), lambda(4) ne decroit pas (chaos)', () => {
    assert.ok(l3 < 0.75 * l3b, `${l3b} -> ${l3}`); assert.ok(l4 > 0.9 * l4b, `${l4b} -> ${l4}`);
    return `3 : ${l3b.toFixed(4)} -> ${l3.toFixed(4)} ; 4 : ${l4b.toFixed(4)} -> ${l4.toFixed(4)}`;
  });
  // 3. double gyre
  ok('doubleGyre : divergence < 1e-9, traceur dans [0,2] x [0,1]', () => {
    const I = sim('doubleGyre').invariants; assert.ok(I.divergence.max < 1e-9, String(I.divergence.max)); assert.equal(I.domaine.dedans, true);
    return I.divergence.max.toExponential(2);
  });
  ok('doubleGyre eps 0, depart sur la separatrice x = 1 : lambda a 1 % de pi^2 A (selle (1, 0))', () => {
    const r = sim('doubleGyre', { eps: 0, duree: 300 }), th = PI * PI * 0.1, e = Math.abs(r.lyapunov - th) / th;
    assert.ok(e < 0.01, `${r.lyapunov} vs ${th}`); return `${r.lyapunov.toFixed(4)} vs ${th.toFixed(4)} (${(100 * e).toFixed(2)} %)`;
  });
  ok('doubleGyre duree 300 : chaotique (defaut) > 4x stationnaire depuis (0.3, 0.3)', () => {
    const a = sim('doubleGyre', { duree: 300 }).lyapunov, b = sim('doubleGyre', { eps: 0, x0: 0.3, y0: 0.3, duree: 300 }).lyapunov;
    assert.ok(a > 0.05 && a > 4 * b, `${a} ${b}`); return `${a.toFixed(4)} vs ${b.toFixed(4)}`;
  });
  // 4. Karman
  /* tolerances [div, psi'] : strictes au defaut et pour une allee faible ; le cas fort (G = 3, traceur qui frole un
     tourbillon a r ~ 0.1) perd en precision (mesure div ~9e-10, psi' ~1e-6) -> tolerances 1e-8 / 1e-5, annoncees */
  for (const [p, tDiv, tPsi] of [[{}, 1e-9, 1e-7], [{ rapport: 0.15, gamma: 0.5 }, 1e-9, 1e-7], [{ rapport: 0.6, gamma: 3 }, 1e-8, 1e-5]]) ok(`karman ${JSON.stringify(p)} : somme directe a 1 % de Lamb, formule fermee < 1e-3, div < ${tDiv}, psi' < ${tPsi}`, () => {
    const r = sim('karman', p); assert.equal(r.bornee, true, r.raison); const I = r.invariants;
    assert.ok(I.vitesseAllee.ecart < 0.01, `${I.vitesseAllee.sommeDirecte} vs ${I.vitesseAllee.lamb}`);
    assert.ok(Math.abs(I.vitesseAllee.transverse) < 1e-9);
    assert.ok(I.formuleFermee.ecartMaxRelatif < 1e-3, String(I.formuleFermee.ecartMaxRelatif));
    assert.ok(I.divergence.max < tDiv, String(I.divergence.max));
    assert.ok(I.psiRepereMobile.derive < tPsi, String(I.psiRepereMobile.derive));
    return `U ${I.vitesseAllee.sommeDirecte.toFixed(6)} vs ${I.vitesseAllee.lamb.toFixed(6)} (${I.vitesseAllee.ecart.toExponential(1)}) psi' ${I.psiRepereMobile.derive.toExponential(1)}`;
  });
  ok('karman : Lamb = (G/2a) tanh(pi h/a) recalcule ici ; h/a = 0.2805 marginal (sinh = 1)', () => {
    const I = sim('karman').invariants; assert.ok(Math.abs(I.vitesseAllee.lamb - 0.5 * Math.tanh(PI * 0.2805)) < 1e-12);
    assert.ok(Math.abs(I.stabilite.rapportKarman - Math.asinh(1) / PI) < 1e-12); assert.equal(I.stabilite.stableLineaire, true);
    return I.stabilite.sinhPiHsurA.toFixed(5);
  });
  ok('karman (stationnaire dans le repere mobile) : lambda decroit 20 -> 60 (pas de chaos)', () => {
    const a = sim('karman').lyapunov, b = sim('karman', { duree: 60 }).lyapunov; assert.ok(b < 0.5 * a, `${a} ${b}`); return `${a.toFixed(3)} -> ${b.toFixed(3)}`;
  });
  // 5. Rayleigh-Benard
  ok('rayleighBenard B = 0 : 0 passage de frontiere, 1 cellule, psi conserve < 1e-6, div < 1e-9', () => {
    const I = sim('rayleighBenard', { B: 0 }).invariants;
    assert.equal(I.transport.passagesDeFrontiere, 0); assert.equal(I.transport.cellulesVisitees, 1);
    assert.ok(I.psiRepereOscillant.derive < 1e-6, String(I.psiRepereOscillant.derive)); assert.ok(I.divergence.max < 1e-9);
    return I.psiRepereOscillant.derive.toExponential(2);
  });
  ok('rayleighBenard defaut (B = 0.1) : transport entre rouleaux, z dans [0,1], div < 1e-9', () => {
    const I = sim('rayleighBenard').invariants;
    assert.ok(I.transport.passagesDeFrontiere > 5 && I.transport.cellulesVisitees > 2); assert.equal(I.domaine.dedans, true);
    assert.ok(I.divergence.max < 1e-9, String(I.divergence.max));
    return `${I.transport.passagesDeFrontiere} passages, ${I.transport.cellulesVisitees} cellules`;
  });
  ok('rayleighBenard duree 600 : lambda(B 0.1) > 0.1 et > 10x lambda(B 0)', () => {
    const a = sim('rayleighBenard', { duree: 600 }).lyapunov, b = sim('rayleighBenard', { B: 0, duree: 600 }).lyapunov;
    assert.ok(a > 0.1 && a > 10 * b, `${a} ${b}`); return `${a.toFixed(4)} vs ${b.toFixed(4)}`;
  });
  // 6. bornage
  ok('bornage : hors bornes ramene, NaN -> defaut, nombre arrondi', () => {
    assert.deepEqual(sim('tourbillonsPonctuels', { nombre: 3.6, G1: -5, G2: 99, G3: NaN, duree: 1e9 }, { n: 50 }).params, { nombre: 4, G1: 0.25, G2: 3, G3: 1, G4: 1, duree: 2000 });
    assert.deepEqual(sim('karman', { gamma: 'x', rapport: 0, x0: 9, y0: -9, duree: 1 }, { n: 50 }).params, { gamma: 1, rapport: 0.1, x0: 0.5, y0: -0.8, duree: 2 });
    assert.deepEqual(sim('doubleGyre', { A: 1, eps: -1 }, { n: 50 }).params, { A: 0.3, eps: 0, periode: 10, x0: 1, y0: 0.3, duree: 100 });
  });
  ok('reglagesPhysique : forme reglagesDe, valeur bornee', () => {
    const r = T.reglagesPhysique('rayleighBenard', { B: 9 });
    assert.deepEqual(r.map((x) => x.chemin), ['params.A', 'params.B', 'params.omega', 'params.x0', 'params.z0', 'params.duree']);
    assert.deepEqual(r[1], { chemin: 'params.B', nom: 'B', min: 0, max: 0.4, valeur: 0.4 });
  });
  ok('systeme inconnu : exception', () => assert.throws(() => sim('navierStokes')));
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
  console.log(`  ${s.id.padEnd(22)} ${ms.toFixed(1)} ms`);
  assertions++; if (!(ms < 300)) ech.push({ nom: 'temps ' + s.id + ' < 300 ms', det: ms.toFixed(1) });
}

// ---------- mutants (copies dans un dossier temporaire ; l import du moteur pointe vers l original) ----------
const MUTANTS = [
  ['tourbillons : signe de Biot-Savart (u du i-eme)', 'd[2 * i] += -G[j] * dy * k;', 'd[2 * i] += G[j] * dy * k;'],
  ['RK4 remplace par Euler', 'return (y, c, h) => {', 'return (y, c, h) => { f(y, k1, c); for (let i = 0; i < m; i++) y[i] += h * k1[i]; return;'],
  ['Lamb sans tanh', 'tanhD(PI * h / a)', '(PI * h / a)'],
  ['Karman : signe de Biot-Savart dans la somme directe', 'u += -Gj * dy / (DEUX_PI * r2)', 'u += Gj * dy / (DEUX_PI * r2)'],
  ['Karman : signe de v dans la formule fermee', 'o[1] += G / (2 * a) * sinD(X) / C;', 'o[1] += -G / (2 * a) * sinD(X) / C;'],
  ['double gyre : facteur df/dx oublie', '* sinD(PI * y) * df;', '* sinD(PI * y);'],
  ['Rayleigh-Benard : signe de w', 'o[1] += -c.A * PI * cosD(PI * xi)', 'o[1] += c.A * PI * cosD(PI * xi)'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
];
const brut = readFileSync(SOURCE, 'utf8'), moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-fluides-mutants-'));
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
console.log(`test-tam-fluides-20261101 : ${assertions} assertions OK`);
