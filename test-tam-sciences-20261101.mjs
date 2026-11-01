// test-tam-sciences-20261101.mjs -- banc de tam-sciences.js (vue SCIENCES, non frappable) + mutants sur COPIES.
// Lancer : node test-tam-sciences-20261101.mjs
// Tolerances annoncees (mesurees le 2026-11-01, puis marge) :
//   spirale : rapport par quart de tour a 1e-9 de phi ; Bloch : derive de |s| < 1e-9, Rabi a 1 % de sqrt(rabi^2 + delta^2) ;
//   oscillateur : Ehrenfest a 1 % (x et p), energie < 1e-3 ; fentes : interfrange a 5 % de lambda L / d ;
//   tetraedre de Sierpinski : dimension boite a 0.15 de 2 ; Mandelbrot : aire a 3 % de 1.50659177 ;
//   phyllotaxie : coefficient de variation du plus proche voisin < 0.05 a l angle d or, > 0.08 a 137 degres ;
//   boite : plans nodaux = (n-1)+(m-1)+(k-1) exactement, energie a 1e-3 de pi^2 (n^2+m^2+k^2)/2.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-sciences.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const PHI = (1 + Math.sqrt(5)) / 2;

/* temps d echappement de Mandelbrot recalcule ICI, independamment du module (rayon 2) */
function echappement(cr, ci, it) {
  let zr = 0, zi = 0;
  for (let k = 0; k < it; k++) { const t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t; if (zr * zr + zi * zi > 4) return k + 1; }
  return Infinity; // pas echappe : interieur
}

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const sim = (id, p, o) => T.simuler(id, p, o);
  // 1. forme et bornes, chaque systeme aux defauts
  ok('SYSTEMES gele, 9 systemes, ids attendus', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES)); assert.equal(T.SYSTEMES.length, 9); assert.ok(Object.isFrozen(T.SYSTEMES[0].params));
    assert.deepEqual(T.SYSTEMES.map((s) => s.id), ['mandelbrot', 'mandelbulb', 'spiraleOr', 'phyllotaxieOr', 'ifs3d', 'bloch', 'paquetOscillateur', 'fentesYoung', 'boiteQuantique']);
  });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, brut n*D fini, points null, lyapunov null`, () => {
      const r = sim(s.id);
      assert.equal(r.bornee, true, r.raison); assert.equal(r.D, 3); assert.equal(s.D, 3); assert.equal(r.n, 1500);
      assert.equal(r.brut.length, 1500 * 3); assert.ok(r.brut.every(Number.isFinite)); assert.equal(r.points, null);
      assert.equal(r.lyapunov, null); assert.ok(typeof r.uniteLyapunov === 'string');
      assert.equal(!!r.nuage, !!s.nuage);
      assert.ok(typeof s.phrase === 'string' && s.phrase.length > 40 && s.nom && s.science);
      assert.ok(!/infinit/i.test(s.phrase), 'phrase dit infini');
    });
    ok(`${s.id} : determinisme (octets identiques)`, () => assert.ok(octets(sim(s.id).brut).equals(octets(sim(s.id).brut))));
  }
  // 2. Mandelbrot
  const mb = sim('mandelbrot');
  ok('mandelbrot : aire interieure a 3 % de 1.50659177', () => {
    const A = mb.invariants.aire; assert.ok(A.reference && A.ecart < 0.03, `${A.mesure}`); return `${A.mesure.toFixed(4)} (${(100 * A.ecart).toFixed(2)} %)`;
  });
  ok('mandelbrot : chaque point = c qui s echappe (rayon 2, recalcule ici) au temps ln-stocke', () => {
    const b = mb.brut, it = mb.params.maxIter; let faux = 0;
    for (let i = 0; i < mb.n; i++) { const k = echappement(b[3 * i], b[3 * i + 1], it); if (!(k <= it) || Math.abs(Math.log(k) - b[3 * i + 2]) > 1e-9) faux++; }
    assert.equal(faux, 0, `${faux} points faux`);
  });
  ok('mandelbrot : bande de bord (>= 500 pixels de bord, mediane d echappement >= 20)', () => {
    const B = mb.invariants.bord; assert.ok(B.pixelsDeBord >= 500 && B.echappementMedian >= 20, JSON.stringify(B)); return `${B.pixelsDeBord} pixels, mediane ${B.echappementMedian}`;
  });
  ok('mandelbrot : dimension boite rapportee, finie, dans ]1, 2]', () => { const d = mb.invariants.dimensionBoite.mesure; assert.ok(d > 1 && d <= 2, String(d)); return d.toFixed(3) + ' (theorie du bord 2)'; });
  ok('mandelbrot zoom 50 sur -0.745+0.113i : vue partielle -> pas de reference d aire', () => { const r = sim('mandelbrot', { cx: -0.745, cy: 0.113, zoom: 50 }); assert.equal(r.bornee, true); assert.equal(r.invariants.aire.reference, null); });
  // 3. Mandelbulb
  for (const p of [8, 3]) ok(`mandelbulb puissance ${p} : encadrement < 1e-7, symetrie d ordre p-1 >= 90 %`, () => {
    const I = sim('mandelbulb', { puissance: p }).invariants;
    assert.ok(I.rayonSurface.encadrement < 1e-7); assert.equal(I.symetrie.ordre, p - 1); assert.ok(I.symetrie.accord >= 0.9, String(I.symetrie.accord));
    assert.ok(I.rayonSurface.min > 0.2 && I.rayonSurface.max < 2);
    return `r ${I.rayonSurface.min.toFixed(3)}..${I.rayonSurface.max.toFixed(3)}, accord ${I.symetrie.accord}`;
  });
  // 4. spirale d or
  for (const tours of [1, 3, 6]) ok(`spiraleOr tours ${tours} : rapport par quart de tour a 1e-9 de phi`, () => {
    const I = sim('spiraleOr', { tours }).invariants; assert.ok(I.rapportQuartDeTour.ecart < 1e-9, String(I.rapportQuartDeTour.mesure));
    return I.rapportQuartDeTour.ecart.toExponential(2);
  });
  ok('spiraleOr : F(K)/F(K-1) a 1e-3 de phi (carres de Fibonacci)', () => { const I = sim('spiraleOr').invariants.rapportFibonacci; assert.ok(I.ecart < 1e-3); return I.mesure.toFixed(6); });
  // 5. phyllotaxie
  ok('phyllotaxieOr : angle d or 137.5078 deg, CV plus proche voisin < 0.05', () => {
    const I = sim('phyllotaxieOr').invariants; assert.ok(Math.abs(I.angle.degres - 360 / (PHI * PHI)) < 1e-9);
    assert.ok(I.plusProcheVoisin.coefVariation < 0.05, String(I.plusProcheVoisin.coefVariation)); return I.plusProcheVoisin.coefVariation.toFixed(4);
  });
  ok('phyllotaxieOr a 137 deg (decalage -0.5078) : CV > 0.08 et > 3x l angle d or (rayons)', () => {
    const a = sim('phyllotaxieOr').invariants.plusProcheVoisin.coefVariation, b = sim('phyllotaxieOr', { decalage: 137 - 360 / (PHI * PHI) }).invariants.plusProcheVoisin.coefVariation;
    assert.ok(b > 0.08 && b > 3 * a, `${b} vs ${a}`); return `${b.toFixed(4)} vs ${a.toFixed(4)}`;
  });
  // 6. Sierpinski
  for (const graine of [1, 2, 3]) ok(`ifs3d graine ${graine} : dimension boite a 0.15 de ln4/ln2 = 2`, () => {
    const I = sim('ifs3d', { graine }).invariants.dimensionBoite; assert.ok(Math.abs(I.mesure - 2) < 0.15 && Math.abs(I.theorie - 2) < 1e-12, String(I.mesure)); return I.mesure.toFixed(4);
  });
  // 7. Bloch
  for (const p of [{}, { delta: 2, rabi: 3, duree: 40 }, { delta: -4, rabi: 0.5, duree: 60 }, { delta: 5, rabi: 5, duree: 200 }]) ok(`bloch ${JSON.stringify(p)} : |s| derive < 1e-9, Rabi a 1 %`, () => {
    const I = sim('bloch', p).invariants;
    assert.ok(I.normeBloch.derive < 1e-9, String(I.normeBloch.derive)); assert.ok(I.frequenceRabi.oscillations >= 2 && I.frequenceRabi.ecart < 0.01, JSON.stringify(I.frequenceRabi));
    assert.ok(Math.abs(I.transfertMax.mesure - I.transfertMax.theorie) < 1e-3, JSON.stringify(I.transfertMax));
    return `derive ${I.normeBloch.derive.toExponential(1)}, W ${I.frequenceRabi.mesure.toFixed(6)} vs ${I.frequenceRabi.theorie.toFixed(6)}`;
  });
  // 8. oscillateur
  for (const p of [{}, { largeur: 2, omega: 0.5, x0: 4, periodes: 6 }, { largeur: 0.5, omega: 2, x0: 1 }, { periodes: 20 }, { largeur: 0.5, omega: 2, x0: 4, periodes: 20 }]) ok(`paquetOscillateur ${JSON.stringify(p)} : Ehrenfest a 1 %, energie < 1e-3`, () => {
    const I = sim('paquetOscillateur', p).invariants;
    assert.ok(I.ehrenfest.ecartX < 0.01 && I.ehrenfest.ecartP < 0.01, JSON.stringify(I.ehrenfest));
    assert.ok(I.energie.derive < 1e-3 && I.energie.ecartTheorie < 1e-3, JSON.stringify(I.energie)); assert.ok(I.largeur.ecart < 0.01, String(I.largeur.ecart));
    return `x ${I.ehrenfest.ecartX.toExponential(1)} p ${I.ehrenfest.ecartP.toExponential(1)} E ${I.energie.derive.toExponential(1)}`;
  });
  // 9. fentes
  for (const p of [{}, { d: 0.5, a: 0.02, lambda: 400 }, { d: 0.1, a: 0.05, lambda: 700, graine: 9 }]) ok(`fentesYoung ${JSON.stringify(p)} : interfrange a 5 % de lambda L/d`, () => {
    const I = sim('fentesYoung', p).invariants.interfrange; assert.ok(I.ecart < 0.05, `${I.mesure} vs ${I.theorie}`); return `${I.mesure.toFixed(4)} vs ${I.theorie.toFixed(4)} mm`;
  });
  ok('fentesYoung : autre graine -> autres impacts', () => assert.ok(!octets(sim('fentesYoung', { graine: 2 }).brut).equals(octets(sim('fentesYoung').brut))));
  // 10. boite
  for (const p of [{}, { n: 1, m: 1, k: 1 }, { n: 5, m: 5, k: 5 }, { n: 4, m: 2, k: 5, graine: 3 }]) ok(`boiteQuantique ${JSON.stringify(p)} : plans nodaux exacts, energie a 1e-3`, () => {
    const I = sim('boiteQuantique', p).invariants;
    assert.equal(I.plansNodaux.mesure, I.plansNodaux.theorie, JSON.stringify(I.plansNodaux)); assert.ok(I.energie.ecart < 1e-3, JSON.stringify(I.energie));
    return `${I.plansNodaux.mesure} plans, E ${I.energie.mesure.toFixed(3)} vs ${I.energie.theorie.toFixed(3)}`;
  });
  // 11. bornage
  ok('bornage : hors bornes ramene, NaN -> defaut, entiers arrondis, a <= d/2', () => {
    assert.deepEqual(sim('mandelbrot', { cx: 9, cy: NaN, zoom: 0, maxIter: 1e9 }, { n: 50 }).params, { cx: 1, cy: 0, zoom: 1, maxIter: 1000 });
    assert.deepEqual(sim('boiteQuantique', { n: 7.6, m: 0, k: 'x', graine: 4.4 }, { n: 50 }).params, { n: 5, m: 1, k: 1, graine: 4 });
    assert.deepEqual(sim('fentesYoung', { d: 0.1, a: 0.1 }, { n: 50 }).params, { d: 0.1, a: 0.05, lambda: 550, graine: 1 });
    assert.deepEqual(sim('mandelbulb', { puissance: 99, maxIter: -3 }, { n: 20 }).params, { puissance: 12, maxIter: 4 });
  });
  ok('reglagesPhysique : forme reglagesDe, valeur bornee', () => {
    const r = T.reglagesPhysique('bloch', { rabi: 1e9 });
    assert.deepEqual(r.map((x) => x.chemin), ['params.delta', 'params.rabi', 'params.duree']);
    assert.deepEqual(r[1], { chemin: 'params.rabi', nom: 'rabi', min: 0.1, max: 5, valeur: 5 });
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
  ['angle d or remplace par 137 degres', 'const ANGLE_OR = DEUX_PI / (PHI * PHI);', 'const ANGLE_OR = DEUX_PI * 137 / 360;'],
  ['Bloch : pas d Euler non unitaire', 'function pasBloch(p, c) {',
    'function pasBloch(p, c) { { const h = c.h, d = c.delta / 2, o = c.rabi / 2, ar = p[0], ai = p[1], br = p[2], bi = p[3];'
    + ' const hr = d * ar + o * br, hi = d * ai + o * bi, gr = o * ar - d * br, gi = o * ai - d * bi;'
    + ' p[0] = ar + h * hi; p[1] = ai - h * hr; p[2] = br + h * gi; p[3] = bi - h * gr; return; }'],
  ['fentes : cos^2(2 pi d x / lambda L)', 'PI * c.d * x / c.lL', '2 * PI * c.d * x / c.lL'],
  ['Mandelbrot : rayon d echappement 1', 'if (zr * zr + zi * zi > 4) break;', 'if (zr * zr + zi * zi > 1) break;'],
  ['oscillateur : potentiel omega^2 x^2 / 4', 'const V = 0.5 * c.omega * c.omega * x * x;', 'const V = 0.25 * c.omega * c.omega * x * x;'],
  ['Sierpinski : 3 sommets au lieu de 4', 'SOMMETS[Math.floor(alea() * 4)]', 'SOMMETS[Math.floor(alea() * 3)]'],
  ['spirale : croissance 1.6 au lieu de phi', 'const B_OR = 2 * lnD(PHI) / PI;', 'const B_OR = 2 * lnD(1.6) / PI;'],
  ['boite : densite sin^2((q+1) pi x)', 'sinD(q * PI * x)', 'sinD((q + 1) * PI * x)'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['Math.random injecte (fentes)', 'X = 3 * k.lL / c.a, alea = mulberry32(c.graine >>> 0)', 'X = 3 * k.lL / c.a, alea = Math.random'],
];
const brut = readFileSync(SOURCE, 'utf8'), moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-sciences-mutants-'));
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
console.log(`test-tam-sciences-20261101 : ${assertions} assertions OK`);
