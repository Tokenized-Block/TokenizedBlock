// test-tam-quantique-20261101.mjs -- banc de tam-quantique.js (vue QUANTIQUE, non frappable) + mutants sur COPIES.
// Lancer : node test-tam-quantique-20261101.mjs
// Tolerances annoncees (valeurs connues, puis marge) :
//   Talbot : recouvrement a T_rev = 4 m L^2/(pi hbar) > 0.999, miroir a T_rev/2 > 0.999, T_rev/4 < 0.9 (non trivial) ;
//   oscillateur : norme et <x^2> = (n + 1/2)/(m omega) a 1e-6 (quadrature), echantillon a 15 % (~4 sigma a n = 1500),
//     noeuds = n exactement, psi = formule de Hermite independante (H_n non normalise, n!) a 1e-9 ;
//   Wigner : int W = 1 a 1e-6, marges = |psi|^2 a 1e-6, min W < 0, W = formule analytique a 1e-6 ;
//   marche : somme = 1 a 1e-12, pente sigma/t a 0.01 de sqrt(1 - 1/sqrt2) = 0.5412, exposant quantique 1 a 0.02, classique 0.5 a 0.02 ;
//   Bell : S = -2 sqrt2 a 0.05 (= 5 sigma, sigma = sqrt(4 * 0.5 / 20000) = 0.01), |S| > 2, E(a, a) = -1 exactement,
//     residus rms / bruit binomial attendu dans [0.85, 1.15] ;
//   rotor (K = 5, hbar_eff = 1, 200 coups) : rapport classique dans [1.9, 2.8] (7/3 lineaire), quantique < 1.3, quantique/classique < 0.2 ;
//   Landau : norme 1e-6, <r^2> = 2 (n + 1) l_B^2 a 1e-6 (melange 0), rayon sqrt(2n+1) l_B a 1e-6, pulsation de <x>(t) = omega_c a 1e-4 ;
//   Stern-Gerlach : fraction haute a 4 sigma binomial de cos^2(theta/2).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-quantique.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const IDS = ['tapisTalbot', 'oscillateurEtats', 'wigner', 'marcheQuantique', 'bellCHSH', 'rotorPulse', 'niveauxLandau', 'sternGerlach'];

/* references independantes (le banc a le droit a Math.exp : il n est pas la vue) */
function hermiteBrut(n, x) { if (n === 0) return 1; let a = 1, b = 2 * x; for (let k = 1; k < n; k++) { const c = 2 * x * b - 2 * k * a; a = b; b = c; } return b; }
function psiOsc(n, w, x) { let f = 1; for (let k = 2; k <= n; k++) f *= k; const s = Math.sqrt(w); return Math.sqrt(s / (2 ** n * f * Math.sqrt(Math.PI))) * hermiteBrut(n, s * x) * Math.exp(-w * x * x / 2); }
function wignerAnalytique(q, ph, x, p) {
  const N2 = 1 / (2 * (1 + Math.cos(ph) * Math.exp(-q * q)));
  return N2 / Math.PI * (Math.exp(-((x - q) ** 2) - p * p) + Math.exp(-((x + q) ** 2) - p * p) + 2 * Math.exp(-x * x - p * p) * Math.cos(2 * q * p + ph));
}

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const sim = (id, p, o) => T.simuler(id, p, o);
  const I = (id, p) => sim(id, p).invariants;
  // 1. forme, bornes, determinisme
  ok('SYSTEMES gele, 8 systemes, ids attendus', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES)); assert.deepEqual(T.SYSTEMES.map((s) => s.id), IDS);
    for (const s of T.SYSTEMES) { assert.ok(Object.isFrozen(s) && Object.isFrozen(s.params) && Object.isFrozen(s.bornes)); assert.equal(s.science, 'Quantum mechanics'); }
  });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, brut n*D fini, 3 <= D <= 12, lyapunov null, nuage`, () => {
      const r = sim(s.id);
      assert.equal(r.bornee, true); assert.equal(r.D, s.D); assert.ok(s.D >= 3 && s.D <= 12); assert.equal(r.n, 1500);
      assert.ok(r.brut instanceof Float64Array); assert.equal(r.brut.length, 1500 * s.D); assert.ok(r.brut.every(Number.isFinite));
      assert.equal(r.points, null); assert.equal(r.lyapunov, null); assert.equal(r.nuage, true); assert.equal(typeof r.uniteLyapunov, 'string');
      assert.ok(typeof s.phrase === 'string' && s.phrase.length > 60 && /visualisation of the formula/i.test(s.phrase) && s.nom);
    });
    ok(`${s.id} : determinisme (octets identiques), autre graine -> autre nuage`, () => {
      assert.ok(octets(sim(s.id).brut).equals(octets(sim(s.id).brut)));
      assert.ok(!octets(sim(s.id, { graine: 2 }).brut).equals(octets(sim(s.id).brut)));
    });
    ok(`${s.id} : n = 7 -> brut 7*D`, () => { const r = sim(s.id, {}, { n: 7 }); assert.equal(r.brut.length, 7 * s.D); });
  }
  // 2. Talbot
  ok('talbot : T_rev = 4 m L^2/(pi hbar), recouvrement > 0.999', () => {
    const v = I('tapisTalbot').revivalComplete; assert.ok(Math.abs(v.temps - 4 / Math.PI) < 1e-12, String(v.temps)); assert.ok(v.fin > 0.999, String(v.fin));
    return `T = ${v.temps.toFixed(6)}, recouvrement ${v.fin.toFixed(12)}`;
  });
  for (const p of [{}, { k0: 25, x0: 0.6, sigma: 0.02 }]) ok(`talbot ${JSON.stringify(p)} : miroir a T/2 > 0.999, direct < 0.01, T/4 < 0.9`, () => {
    const v = I('tapisTalbot', p); assert.ok(v.revivalMiroir.fin > 0.999, String(v.revivalMiroir.fin)); assert.ok(v.revivalMiroir.recouvrementDirect < 0.01);
    assert.ok(v.quartDeRevival.fin < 0.9, String(v.quartDeRevival.fin)); assert.ok(v.poidsModes.derive < 1e-6 && v.norme.derive < 1e-9);
    assert.ok(v.revivalComplete.fin > 0.999);
    return `miroir ${v.revivalMiroir.fin.toFixed(10)} T/4 ${v.quartDeRevival.fin.toFixed(4)}`;
  });
  ok('talbot : axe t dans [0, duree], x dans [0, 1]', () => {
    const r = sim('tapisTalbot', { duree: 0.5 }); let tm = 0, xm = 0, xn = 1;
    for (let i = 0; i < r.n; i++) { tm = Math.max(tm, r.brut[3 * i + 1]); xm = Math.max(xm, r.brut[3 * i]); xn = Math.min(xn, r.brut[3 * i]); }
    assert.ok(tm <= 0.5 + 1e-12 && tm > 0.45 && xn >= 0 && xm <= 1);
  });
  // 3. oscillateur
  for (const p of [{ n: 0 }, { n: 4 }, { n: 7, omega: 0.5 }, { n: 12, omega: 2 }]) ok(`oscillateur ${JSON.stringify(p)} : norme, <x^2> = (n+1/2)/omega, noeuds = n`, () => {
    const v = I('oscillateurEtats', p), nn = p.n, w = p.omega || 1;
    assert.ok(v.normalisation.derive < 1e-6, String(v.normalisation.fin)); assert.ok(Math.abs(v.x2Quadrature.fin - (nn + 0.5) / w) < 1e-6 * (nn + 0.5) / w, String(v.x2Quadrature.fin));
    assert.equal(v.noeuds.fin, nn); assert.ok(v.x2Echantillon.derive < 0.15, String(v.x2Echantillon.derive)); assert.equal(v.echantillonnage.depassementsDuMax, 0);
    return `<x^2> ${v.x2Quadrature.fin.toFixed(9)} (ech. ${v.x2Echantillon.fin.toFixed(3)}), noeuds ${v.noeuds.fin}`;
  });
  ok('oscillateur n = 9 : psi(x) du nuage = formule de Hermite independante (1e-9)', () => {
    const r = sim('oscillateurEtats', { n: 9, omega: 1.3 }); let e = 0;
    for (let i = 0; i < r.n; i++) e = Math.max(e, Math.abs(r.brut[3 * i + 2] - psiOsc(9, 1.3, r.brut[3 * i])));
    assert.ok(e < 1e-9, String(e)); return e.toExponential(2);
  });
  // 4. Wigner
  for (const p of [{}, { q0: 1, phase: Math.PI / 2 }, { q0: 4, phase: 2 }]) ok(`wigner ${JSON.stringify(p)} : int W = 1, marges = |psi|^2, min W < 0, W = formule`, () => {
    const r = sim('wigner', p), v = r.invariants, q = r.params.q0, ph = r.params.phase;
    assert.ok(v.integrale.derive < 1e-6, String(v.integrale.fin)); assert.ok(v.marges.derive < 1e-6, String(v.marges.fin));
    assert.ok(v.negativite.fin < 0 && v.negativite.negative === true, String(v.negativite.fin));
    let e = 0; for (let i = 0; i < r.n; i++) e = Math.max(e, Math.abs(r.brut[3 * i + 2] - wignerAnalytique(q, ph, r.brut[3 * i], r.brut[3 * i + 1])));
    assert.ok(e < 1e-6, String(e));
    return `int ${v.integrale.fin.toFixed(9)} minW ${v.negativite.fin.toFixed(4)} ecart formule ${e.toExponential(1)}`;
  });
  // 5. marche quantique
  for (const pas of [100, 200, 400]) ok(`marche ${pas} pas : somme 1, pente ~ 0.5412, exposants 1 (quantique) / 0.5 (classique)`, () => {
    const v = I('marcheQuantique', { pas });
    assert.ok(v.sommeProbabilites.derive < 1e-12); assert.ok(Math.abs(v.penteQuantique.fin - 0.5412) < 0.01, String(v.penteQuantique.fin));
    assert.ok(Math.abs(v.exposantQuantique.fin - 1) < 0.02, String(v.exposantQuantique.fin)); assert.ok(Math.abs(v.exposantClassique.fin - 0.5) < 0.02, String(v.exposantClassique.fin));
    assert.ok(Math.abs(v.ecartTypeFinal.classique - Math.sqrt(pas)) < 1e-9);
    return `pente ${v.penteQuantique.fin.toFixed(4)} exp ${v.exposantQuantique.fin.toFixed(4)} / ${v.exposantClassique.fin.toFixed(4)}`;
  });
  ok('marche : colonne P quantique = probabilite au point tire, parite x = t', () => {
    const r = sim('marcheQuantique'); for (let i = 0; i < r.n; i++) { assert.ok(r.brut[4 * i + 2] > 0); assert.equal(((r.brut[4 * i] - r.brut[4 * i + 1]) % 2 + 2) % 2, 0); }
  });
  // 6. Bell
  for (const g of [1, 7]) ok(`bell graine ${g} : S = -2 sqrt2 a 0.05, |S| > 2, E(a, a) = -1`, () => {
    const v = I('bellCHSH', { graine: g });
    assert.ok(Math.abs(v.chsh.fin + 2 * Math.SQRT2) < 0.05, String(v.chsh.fin)); assert.ok(Math.abs(v.chsh.fin) > 2); assert.equal(v.memeAngle.fin, -1);
    const k = v.residus.fin / v.residus.attendu; assert.ok(k > 0.85 && k < 1.15, String(k));
    return `S = ${v.chsh.fin.toFixed(4)} (theorie ${(-2 * Math.SQRT2).toFixed(4)}), residus ${k.toFixed(3)} x bruit`;
  });
  // 7. rotor
  ok('rotor K = 5, hbar_eff = 1 : classique diffuse (rapport ~ 7/3), quantique sature (localisation)', () => {
    const v = I('rotorPulse'); assert.equal(v.reglage.K, 5); assert.equal(v.reglage.hbar, 1);
    assert.ok(v.rapportClassique.fin > 1.9 && v.rapportClassique.fin < 2.8, String(v.rapportClassique.fin));
    assert.ok(v.rapportQuantique.fin < 1.3, String(v.rapportQuantique.fin)); assert.ok(v.quantiqueSurClassique.fin < 0.2, String(v.quantiqueSurClassique.fin));
    assert.ok(v.norme.derive < 1e-10 && v.bordImpulsion.fin < 1e-10);
    assert.ok(v.diffusionClassique.fin > 0.6 * 12.5 && v.diffusionClassique.fin < 1.4 * 12.5, String(v.diffusionClassique.fin));
    return `rapports ${v.rapportClassique.fin.toFixed(3)} / ${v.rapportQuantique.fin.toFixed(3)}, <p^2> final ${v.p2Final.classique.toFixed(0)} vs ${v.p2Final.quantique.toFixed(1)}, D ${v.diffusionClassique.fin.toFixed(2)}`;
  });
  // 8. Landau
  for (const p of [{ n: 0, melange: 0 }, { n: 3, melange: 0, B: 2 }, { n: 8, melange: 0, B: 0.5 }]) ok(`landau ${JSON.stringify(p)} : <r^2> = 2(n+1) l_B^2, anneau sqrt(2n+1) l_B`, () => {
    const v = I('niveauxLandau', p), l2 = 1 / (p.B || 1);
    assert.ok(v.normalisation.derive < 1e-6); assert.ok(Math.abs(v.r2Quadrature.fin - 2 * (p.n + 1) * l2) < 1e-6 * 2 * (p.n + 1) * l2, String(v.r2Quadrature.fin));
    assert.ok(Math.abs(v.rayonAnneau.fin - Math.sqrt((2 * p.n + 1) * l2)) < 1e-6, String(v.rayonAnneau.fin));
    assert.ok(v.r2Echantillon.derive < 0.1, String(v.r2Echantillon.derive)); assert.equal(v.echantillonnage.depassementsDuMax, 0);
    assert.equal(v.ecartEnergie.fin, null); assert.ok(v.centreMoyen.fin < 1e-6);
    return `<r^2> ${v.r2Quadrature.fin.toFixed(8)}, rayon ${v.rayonAnneau.fin.toFixed(6)}`;
  });
  for (const p of [{}, { n: 2, melange: 0.5, B: 2.5, periodes: 4 }]) ok(`landau ${JSON.stringify(p)} : pulsation de <x>(t) = omega_c (ecart hbar omega_c)`, () => {
    const v = I('niveauxLandau', p), wc = p.B || 1;
    assert.ok(v.ecartEnergie.fin !== null && Math.abs(v.ecartEnergie.fin - wc) < 1e-4 * wc, String(v.ecartEnergie.fin)); assert.ok(v.centreMoyen.fin > 0.1);
    return `hbar omega mesure ${v.ecartEnergie.fin.toFixed(8)} vs ${wc}`;
  });
  // 9. Stern-Gerlach
  for (const theta of [2 * Math.PI / 3, 1, Math.PI / 2]) ok(`stern-gerlach theta ${theta.toFixed(3)} : fraction haute = cos^2(theta/2) a 4 sigma`, () => {
    const v = I('sternGerlach', { theta }), p = Math.cos(theta / 2) ** 2, sg = Math.sqrt(p * (1 - p) / 1500);
    assert.ok(Math.abs(v.fractionHaut.debut - p) < 1e-12); assert.ok(Math.abs(v.fractionHaut.fin - p) < 4 * sg, `${v.fractionHaut.fin} vs ${p}`);
    assert.ok(Math.abs(v.fractionEcran.fin - p) < 4 * v.fractionEcran.sigma + 1e-12); assert.ok(v.separation.fin > 5);
    return `${v.fractionHaut.fin.toFixed(4)} vs ${p.toFixed(4)} (sigma ${sg.toFixed(4)})`;
  });
  ok('stern-gerlach theta 0 -> tout en haut, theta pi -> tout en bas', () => {
    assert.equal(I('sternGerlach', { theta: 0 }).fractionHaut.fin, 1); assert.equal(I('sternGerlach', { theta: Math.PI }).fractionHaut.fin, 0);
  });
  // 10. bornage
  ok('bornage : hors bornes ramene, NaN -> defaut, entiers arrondis', () => {
    assert.deepEqual(sim('oscillateurEtats', { n: 20.7, omega: 'x', graine: 3.4 }, { n: 20 }).params, { n: 12, omega: 1, graine: 3 });
    assert.deepEqual(sim('oscillateurEtats', { n: 3.6 }, { n: 20 }).params.n, 4);
    assert.deepEqual(sim('tapisTalbot', { k0: 1e9, x0: -1, sigma: 1, duree: NaN }, { n: 20 }).params, { k0: 40, x0: 0.25, sigma: 0.04, duree: 1, graine: 1 });
    assert.deepEqual(sim('marcheQuantique', { pas: 1e6 }, { n: 20 }).params.pas, 400);
    assert.deepEqual(sim('rotorPulse', { coups: 1e6 }, { n: 20 }).params.coups, 600);
    assert.deepEqual(sim('niveauxLandau', { n: -4, melange: 7, B: 0, periodes: 2.5 }, { n: 20 }).params, { n: 0, melange: 1, B: 0.5, periodes: 3, graine: 1 });
    assert.deepEqual(sim('sternGerlach', { theta: 9 }, { n: 20 }).params.theta, Math.PI);
  });
  ok('reglagesPhysique : forme reglagesDe, valeur bornee', () => {
    const r = T.reglagesPhysique('rotorPulse', { K: 1e9 });
    assert.deepEqual(r.map((x) => x.chemin), ['params.K', 'params.hbar', 'params.coups', 'params.graine']);
    assert.deepEqual(r[0], { chemin: 'params.K', nom: 'K', min: 2, max: 10, valeur: 10 });
  });
  ok('systeme inconnu -> erreur', () => assert.throws(() => sim('nimporte')));
  return res;
}

// ---------- banc ----------
const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
// source : aucune fonction Math transcendante (non determinee d un moteur a l autre), aucun Math.random
const src = readFileSync(SOURCE, 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
const interdits = src.match(/Math\.(sin|cos|tan|exp|log|pow|atan2?|asin|acos|hypot|sinh|cosh|tanh|cbrt|expm1|log1p|log2|log10|random)\b/g);
assertions++; if (interdits) ech.push({ nom: 'source sans Math transcendante', det: interdits.join(',') });
console.log(`${interdits ? 'ECHEC ' : 'OK    '}source : aucune Math.sin/cos/exp/log/pow/atan/... ni Math.random`);

/* 07/11 : minimum de 5 au lieu de la mediane de 3 : sur cette machine effetTunnel allait de 213 a 608 ms d un appel a l autre (mediane 321), le
 *   meme code rougissait ou non selon le moment. Le minimum mesure le cout propre ; un calcul double reste rouge (325-391 ms, preuve a part). */
console.log('\nTEMPS simuler(id) a n = 1500 (minimum de 5) :');
/* 2026-11-01 : maxima releves (rotor coups 400 -> 600, marche pas 200 -> 400) : le pire cas suit la nouvelle borne */
const CHER = { wigner: { q0: 4 }, rotorPulse: { coups: 600, K: 10 }, bellCHSH: { essais: 2000 }, niveauxLandau: { n: 8, periodes: 6, melange: 0.5 }, marcheQuantique: { pas: 400 }, oscillateurEtats: { n: 12 } };
for (const s of T.SYSTEMES) {
  for (const [lib, p] of [['defaut', {}], ...(CHER[s.id] ? [['pire  ', CHER[s.id]]] : [])]) {
    const t = []; for (let k = 0; k < 5; k++) { const a = performance.now(); T.simuler(s.id, p); t.push(performance.now() - a); }
    t.sort((a, b) => a - b); const ms = t[0];
    console.log(`  ${s.id.padEnd(18)} ${lib} ${ms.toFixed(1)} ms`);
    assertions++; if (!(ms < 300)) ech.push({ nom: `temps ${s.id} ${lib} < 300 ms`, det: ms.toFixed(1) });
  }
}

// ---------- mutants (copies dans un dossier temporaire ; l import du moteur pointe vers l original) ----------
const MUTANTS = [
  ['talbot : temps de revival 2 m L^2/(pi hbar)', 'const tRev = 4 * MASSE * L * L / (PI * HBAR);', 'const tRev = 2 * MASSE * L * L / (PI * HBAR);'],
  ['hermite : signe de la recurrence', '- Math.sqrt(k / (k + 1)) * p0', '+ Math.sqrt(k / (k + 1)) * p0'],
  ['marche : piece de Hadamard -> piece classique equitable', 'const ur = (a1 + b1) * S2, ui = (a2 + b2) * S2, vr = (a1 - b1) * S2, vi = (a2 - b2) * S2;',
    'const q = Math.sqrt((a1 * a1 + a2 * a2 + b1 * b1 + b2 * b2) / 2), ur = q, ui = 0, vr = q, vi = 0;'],
  ['bell : correlation singulet +cos', 'pOppose = cb * cb', 'pOppose = 1 - cb * cb'],
  ['stern-gerlach : cos au lieu de cos^2', 'pHaut = ch * ch', 'pHaut = ch'],
  ['landau : l_B = hbar/(eB) au lieu de sqrt', 'Math.sqrt(HBAR / (CHARGE * c.B))', '(HBAR / (CHARGE * c.B))'],
  ['rotor : evolution libre quantique omise', 'lr[j] = cosD(ph); li[j] = -sinD(ph);', 'lr[j] = 1; li[j] = 0;'],
  ['wigner : conjugaison oubliee', 'ai = -fr[2 * j + 1]', 'ai = fr[2 * j + 1]'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['Math.random injecte', 'const alea = mulberry32(c.graine >>> 0), ch = cosD', 'const alea = Math.random, ch = cosD'],
];
const brut = readFileSync(SOURCE, 'utf8'), moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-quantique-mutants-'));
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
console.log(`test-tam-quantique-20261101 : ${assertions} assertions OK`);
