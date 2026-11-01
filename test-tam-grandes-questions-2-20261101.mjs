// test-tam-grandes-questions-2-20261101.mjs -- banc de tam-grandes-questions-2.js
// Forme (bornee, finie, n*D, 3 <= D <= 12), determinisme, bornage, scan Math interdit, controles contre des valeurs
// publiees (tolerances explicites), puis MUTANTS sur des COPIES dans un dossier temporaire : chacun doit etre tue.
// Les constantes et la table d etoiles du MODULE sont sourcees (URL lue dans chaque commentaire). Les valeurs de
//   manuel de ce banc (11.3 deg/h, 23.934 h, 6.17e-8 K, 2.1e67 ans, 198 m/s...) sont des controles d ordre de grandeur
//   NON relus dans une source pendant cette passe.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-grandes-questions-2.js');
const mod = await import(pathToFileURL(SOURCE).href);
let N = 0;
const vrai = (c, m) => { assert.ok(c, m); N++; };
const proche = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b} (tol ${tol})`); N++; };
const procheRel = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${m}: ${a} vs ${b} (rel ${tol})`); N++; };

// ---------- controles contre les valeurs publiees (rejoues sur chaque mutant) ----------
function verifierPublie(m, compter = true) {
  const ok = compter ? vrai : (c, msg) => assert.ok(c, msg);
  const pr = compter ? procheRel : (a, b, t, msg) => assert.ok(Math.abs(a - b) <= t * Math.abs(b), `${msg}: ${a} vs ${b}`);
  const pa = compter ? proche : (a, b, t, msg) => assert.ok(Math.abs(a - b) <= t, `${msg}: ${a} vs ${b}`);

  // 1. Foucault : 15 deg/h * sin(latitude) ; Paris 48.85 deg -> ~11.3 deg/h, tour complet ~31.8 h (valeurs de manuel)
  const paris = m.simuler('penduleFoucault', { latitude: 48.85 }).invariants.precession;
  pr(Math.abs(paris.mesure), 11.3, 0.01, 'Foucault Paris 11.3 deg/h');
  pr(paris.tourCompletHeures, 31.8, 0.01, 'Foucault Paris tour 31.8 h');
  pr(Math.abs(paris.mesure), 15 * Math.sin(48.85 * Math.PI / 180), 0.01, 'Foucault 15 sin(phi)');
  ok(paris.mesure < 0, 'Foucault : sens horaire au nord');
  // 15.0411 deg/h = rotation siderale (Omega = 7.292115e-5 rad/s, IERS 2010) : mesure vs formule a 1e-4
  pr(paris.mesure, paris.formule, 1e-4, 'Foucault mesure vs Omega sin(phi)');
  const eq = m.simuler('penduleFoucault', { latitude: 0 }).invariants.precession;
  pa(eq.mesure, 0, 1e-9, 'Foucault equateur : aucune rotation');
  ok(eq.tourCompletHeures === null, 'Foucault equateur : pas de tour complet');
  const pole = m.simuler('penduleFoucault', { latitude: 90, heures: 24 }).invariants.precession;
  pr(pole.tourCompletHeures, 23.934, 0.01, 'Foucault pole : un jour sideral 23.934 h');
  const sud = m.simuler('penduleFoucault', { latitude: -48.85 }).invariants.precession;
  pr(sud.mesure, -paris.mesure, 1e-9, 'Foucault sud : sens inverse');

  // 2. trajet de la Terre : orbite 1 UA, 1 an ; pas d helice = v * 1 an
  const t = m.simuler('mouvementTerre').invariants;
  pr(t.periode.mesure, 1, 1e-4, 'periode 1 an');
  pa(t.demiGrandAxe.mesure, 1, 1e-6, 'demi-grand axe 1 UA');
  pr(t.pasHelice.mesure, t.pasHelice.formule, 1e-6, 'pas d helice = v * periode');
  // 236 km/s : Reid et al. 2019 (https://arxiv.org/abs/1910.03357, "To = 236 +/- 7 km/s")
  pr(t.pasHelice.parAn, 236 * 31557600 / 149597870.7, 1e-9, 'pas par an = 236 km/s * 1 an');
  pr(t.pasHelice.parAn, 49.8, 0.002, 'pas ~49.8 UA par an (et non 7.3)');
  pa(t.inclinaison.degres, 60, 1.5, 'vitesse galactique a ~60 deg de l ecliptique');
  ok(t.vitesseTerre.minKms >= 236 - 30 && t.vitesseTerre.maxKms <= 236 + 30, 'vitesse Terre = 236 +- 30 km/s');
  const cmb = m.simuler('mouvementTerre', { cmb: 1 }).invariants;
  pa(cmb.vitesseSoleil.kms, 369.82, 0.11, 'Planck 2018 : 369.82 +- 0.11 km/s');
  pr(cmb.pasHelice.parAn, 369.82 * 31557600 / 149597870.7, 1e-9, 'pas CMB');

  // 3. HR : Stefan-Boltzmann pour chaque etoile, valeurs SOURCEES, tolerance = 3 sigma propagees des incertitudes
  //    de la source (2 sR, 4 sT, sL en quadrature), ou 30 % SUPPOSES si la source n en donne pas pour T, R et L.
  //    Les ecarts sont publies : exactement Polaris et TRAPPIST-1 sortent (valeurs de trois articles differents).
  const hr = m.simuler('etoilesHR').invariants, sb = hr.stefanBoltzmann;
  ok(sb.verifiees === 27 && hr.etoiles.noms.length === 27, '27 etoiles, toutes verifiees (aucune exclue)');
  for (const nom of ['Deneb', 'Canopus', 'Spica A']) ok(!hr.etoiles.noms.includes(nom), `${nom} retiree (pas de source lisible)`);
  ok(JSON.stringify(sb.horsTolerance) === JSON.stringify(['Polaris', 'TRAPPIST-1']), `hors tolerance publies : ${sb.horsTolerance}`);
  for (const d of sb.details) {
    ok(d.dansTolerance === (Math.abs(d.rapport - 1) <= d.tolerance), `Stefan-Boltzmann ${d.nom} : drapeau coherent`);
    if (d.nom !== 'Polaris' && d.nom !== 'TRAPPIST-1') ok(Math.abs(d.rapport - 1) <= d.tolerance, `Stefan-Boltzmann ${d.nom}: ${d.rapport} (tol ${d.tolerance}, ${d.base})`);
    /* borne 3 : Antares (L +53 000 / 75 900 = 70 %) a une tolerance 3 sigma ~2.4, controle presque vide mais honnete */
    ok(d.tolerance > 0 && d.tolerance <= 3 && /^https:\/\//.test(d.source), `${d.nom} : tolerance finie (${d.tolerance}) et source URL`);
  }
  // recalcul independant (Tsun = 5772 K, IAU 2015 B3) sur trois etoiles de la table, valeurs recopiees de l infobox
  const sbRef = (T, R) => R * R * Math.pow(T / 5772, 4);
  const det = (nom) => sb.details.find((d) => d.nom === nom);
  pr(det('Sirius A').rapport, sbRef(9845, 1.7144) / 24.74, 1e-12, 'Sirius A : R 1.7144, T 9845, L 24.74');
  pr(det('Procyon A').rapport, sbRef(6582, 2.043) / 7.049, 1e-12, 'Procyon A : Soubiran 2024');
  pr(det('Polaris').rapport, sbRef(6015, 46.27) / 1260, 1e-12, 'Polaris : rapport ~2 publie');
  ok(det('Polaris').rapport > 1.9 && det('TRAPPIST-1').rapport < 0.7, 'les deux ecarts sont gros, pas du bruit');
  // Sirius A : tolerance = 3 sqrt((2 sR)^2 + (4 sT)^2 + sL^2) avec les incertitudes de l infobox
  pr(det('Sirius A').tolerance, 3 * Math.sqrt((2 * 0.0090 / 1.7144) ** 2 + (4 * 64 / 9845) ** 2 + (0.70 / 24.74) ** 2), 1e-12, 'Sirius A : tolerance 3 sigma');
  pr(det('UY Scuti').tolerance, 0.3, 0, 'UY Scuti : 30 % supposes (aucune incertitude source)');
  const sol = det('Sun');
  pa(sol.rapport, 1, 1e-12, 'Soleil : 5772 K, 1 Rsun -> 1 Lsun');
  const bhE = m.simuler('evaporationTrouNoir').invariants.eres;
  ok(JSON.stringify(bhE.map((e) => [e.log10AnsDe, e.log10AnsA])) === JSON.stringify([[6, 14], [15, 37], [38, 100], [100, null]]), 'eres Adams & Laughlin 1997 (relues)');

  // 4. Hawking : T(1 Msun) ~ 6.17e-8 K ; duree de vie (photons seuls) ~ 2.1e67 ans ; loi en M^3
  const bh = m.simuler('evaporationTrouNoir').invariants;
  pr(bh.temperature.soleilKelvin, 6.17e-8, 0.01, 'T Hawking 1 Msun');
  pr(bh.dureeDeVie.mesureAns, 2.1e67, 0.03, 'duree de vie 1 Msun ~2.1e67 ans');
  pr(bh.dureeDeVie.mesureAns, bh.dureeDeVie.formuleAns, 1e-6, 'duree mesuree vs 5120 pi G^2 M^3 / (hbar c^4)');
  pr(bh.loiM3.rapport, 8, 1e-6, 'tau(2M) / tau(M) = 8');
  /* game85 (audit) : la 1re ligne a t = 0 mettait log10(1 + t) a 0 contre 65-67 ailleurs -> colonne 3 ecrasee par UN point */
  { const s = m.simuler('evaporationTrouNoir'), n = s.n, c3 = []; for (let i = 0; i < n; i++) c3.push(s.brut[4 * i + 3]); const t = [...c3].sort((a, b) => a - b);
    ok(s.brut[0] > 0 && t[Math.floor(n * 0.01)] - t[0] < 1.5, 'evaporation : pas de point isole en colonne 3 (min ' + t[0].toFixed(2) + ', p1 ' + t[Math.floor(n * 0.01)].toFixed(2) + ')'); }

  // 5. tsunami : c(4 km) ~ 198 m/s = 713 km/h ; 10 000 km a 4 km de fond ~ 14 h ; Green A ~ h^(-1/4)
  const ts = m.simuler('tsunami', { profondeur: 4000, distance: 10100, plateau: 100 }).invariants;
  pr(ts.vitesse.ms, 198, 0.01, 'c = 198 m/s a 4 km');
  pr(ts.vitesse.kmh, 713, 0.01, '713 km/h');
  pr(ts.traversee.oceanMesureH, 14, 0.01, 'traversee 10 000 km ~14 h');
  pr(ts.traversee.oceanMesureH, 1e7 / 713 / 1000 * 1, 0.01, 'traversee = 10 000 km / 713 km/h');
  pr(ts.traversee.plateauMesureS, ts.traversee.plateauFormuleS, 1e-3, 'plateau lineaire : mesure vs integrale exacte');
  pa(ts.loiDeGreen.exposant, -0.25, 1e-9, 'loi de Green exposant -1/4');
  pr(ts.loiDeGreen.amplification, Math.pow(4000 / 10, 0.25), 1e-9, 'amplification (4000/10)^(1/4)');
  ok(ts.snell.derive < 1e-2, 'Snell conserve a 1 %');

  // 6. geometrie : 180 plat, > 180 ferme, < 180 ouvert ; Gauss-Bonnet exces = K * aire
  for (const cote of [0.2, 1.2, 2]) {
    const g = m.simuler('geometrieUnivers', { cote }).invariants;
    pa(g.plat.sommeAnglesDeg, 180, 1e-9, 'plat 180 deg');
    ok(g.sphere.sommeAnglesDeg > 180, 'sphere > 180');
    ok(g.hyperbolique.sommeAnglesDeg < 180, 'hyperbolique < 180');
    for (const k of ['sphere', 'hyperbolique']) {
      ok(g[k].ecartGaussBonnet <= 1e-3 * Math.abs(g[k].exces), `Gauss-Bonnet ${k} cote ${cote}: ${g[k].exces} vs ${g[k].KfoisAire}`);
      pr(g[k].circonference, g[k].circonferenceFormule, 1e-4, `circonference ${k}`);
      pr(g[k].coteMesure, cote, 1e-4, `cote geodesique ${k}`);
    }
  }

  // 7. tailles : rapports exacts a la table, Terre / Soleil = 1 / 109
  const r = m.simuler('tailleEtoiles').invariants;
  for (const c of r.rayons) pr(c.rapportAuSoleil, c.tableRsoleil, 1e-12, `rayon ${c.nom}`);
  pa(r.terreSoleil.inverse, 109, 0.5, 'Soleil = 109 Terres');
}

// ---------- forme, determinisme, temps ----------
const temps = {};
const PIRES = { penduleFoucault: { longueur: 10, heures: 40 }, mouvementTerre: { annees: 20 }, evaporationTrouNoir: { log10Masse: 11 },
  tsunami: { distance: 12000, profondeur: 500, plateau: 300 }, geometrieUnivers: { cote: 2 }, tailleEtoiles: {}, etoilesHR: {} };
vrai(mod.SYSTEMES.length === 7, '7 systemes');
vrai(Object.isFrozen(mod.SYSTEMES), 'SYSTEMES gele');
for (const s of mod.SYSTEMES) {
  vrai(Object.isFrozen(s) && Object.isFrozen(s.params) && Object.isFrozen(s.bornes), `${s.id} gele`);
  vrai(s.D >= 3 && s.D <= 12, `${s.id} 3 <= D <= 12`);
  vrai(typeof s.phrase === 'string' && /^[\x20-\x7e]+$/.test(s.phrase) && s.phrase.endsWith('.') && !/\.\s+[A-Z]/.test(s.phrase), `${s.id} phrase = une phrase ASCII`);
  vrai(!/youtube|channel|video/i.test(s.phrase + s.nom), `${s.id} aucune chaine`);
  for (const [cas, p] of [['defaut', {}], ['pire', PIRES[s.id]]]) {
    const t0 = performance.now(), o = mod.simuler(s.id, p), dt = performance.now() - t0;
    temps[s.id + ' ' + cas] = dt;
    vrai(dt < 300, `${s.id} ${cas} < 300 ms (${dt.toFixed(1)})`);
    vrai(o.bornee === true && o.n === 1500 && o.D === s.D && o.brut instanceof Float64Array && o.brut.length === o.n * o.D, `${s.id} ${cas} forme`);
    vrai(o.brut.every(Number.isFinite), `${s.id} ${cas} fini`);
    vrai(o.points === null && (o.lyapunov === null || typeof o.lyapunov === 'number') && typeof o.uniteLyapunov === 'string', `${s.id} champs`);
    vrai(!!o.nuage === !!s.nuage, `${s.id} nuage`);
    if (o.film) vrai(Number.isInteger(o.film.images) && Number.isInteger(o.film.parImage) && o.film.images > 1 && o.film.images * o.film.parImage <= o.n, `${s.id} film`);
  }
  const a = mod.simuler(s.id), b = mod.simuler(s.id);
  vrai(a.brut.every((v, i) => Object.is(v, b.brut[i])) && JSON.stringify(a.invariants) === JSON.stringify(b.invariants), `${s.id} deterministe`);
  for (const n of [2, 7, 50]) { const o = mod.simuler(s.id, {}, { n }); vrai(o.bornee && o.brut.length === n * s.D, `${s.id} n = ${n}`); }
  // bornage
  for (const k of Object.keys(s.params)) {
    const [lo, hi] = s.bornes[k];
    vrai(mod.simuler(s.id, { [k]: 1e12 }, { n: 20 }).params[k] === hi, `${s.id}.${k} ramene au max`);
    vrai(mod.simuler(s.id, { [k]: -1e12 }, { n: 20 }).params[k] === lo, `${s.id}.${k} ramene au min`);
    vrai(mod.simuler(s.id, { [k]: NaN }, { n: 20 }).params[k] === s.params[k], `${s.id}.${k} NaN -> defaut`);
    const reg = mod.reglagesPhysique(s.id, { [k]: 1e12 }).find((x) => x.nom === k);
    vrai(reg.valeur === hi && reg.min === lo && reg.max === hi && reg.chemin === 'params.' + k, `${s.id}.${k} reglage`);
  }
}
vrai(mod.simuler('mouvementTerre', { cmb: 0.6 }, { n: 20 }).params.cmb === 1, 'cmb arrondi');
vrai(mod.simuler('tailleEtoiles', { jusqua: 3.4 }, { n: 20 }).params.jusqua === 3, 'jusqua arrondi');
assert.throws(() => mod.simuler('inconnu'), /inconnu/); N++;
// film du tsunami : les images avancent dans le temps (colonne 4)
{ const o = mod.simuler('tsunami'), f = o.film; vrai(o.brut[3] === 0 && o.brut[4 * (f.images - 1) * f.parImage + 3] > 14, 'tsunami : film de 0 a l arrivee'); }

// ---------- scan des Math interdits ----------
const src = readFileSync(SOURCE, 'utf8');
vrai(!/Math\.(sin|cos|tan|exp|expm1|log|log10|log2|log1p|pow|atan|atan2|asin|acos|hypot|random|sinh|cosh|tanh|asinh|acosh|atanh|cbrt)\b/.test(src), 'aucun Math interdit');
vrai((src.match(/[\w)\]]\s*\*\*\s*[\w(]/g) || []).join() === '2 ** k', 'seul ** = 2 ** k (expD)');
vrai(!/[^\x00-\x7f]/.test(src), 'source ASCII (commentaires sans accents)');
vrai(!/youtube/i.test(src), 'aucune chaine nommee');
// aucune valeur "de memoire" : le seul marqueur autorise est la ligne de commentaire qui enonce la REGLE
{
  const lignes = src.split('\n').filter((l) => /de\s+m[eé]moire|from\s+memory/i.test(l));
  vrai(lignes.length === 1 && /^\s*\/\/.*REGLE/.test(lignes[0]), `aucun marqueur "de memoire" hors la regle (${lignes.length} ligne(s))`);
  vrai(!/a reverifier|to be checked|unverified value/i.test(src), 'aucune valeur marquee a reverifier');
}

// ---------- valeurs publiees ----------
verifierPublie(mod);

// ---------- mutants sur COPIES ----------
const MUTANTS = [
  ['evaporation : la 1re ligne revient a t = 0 (point isole en colonne 3)', 'const cible = fin * (i + 1) / n;', 'const cible = n > 1 ? fin * i / (n - 1) : 0;'],
  ['Foucault sin -> cos', 'const omz = OMEGA_TERRE * sinD(phi);', 'const omz = OMEGA_TERRE * cosD(phi);'],
  ['Stefan-Boltzmann T^4 -> T^3', 'puissance(T / T_SOLEIL, 4)', 'puissance(T / T_SOLEIL, 3)'],
  ['Hawking 8 pi -> 4 pi', '/ (8 * PI * G_N * m * K_B)', '/ (4 * PI * G_N * m * K_B)'],
  ['tsunami sqrt(g h) -> g h', 'return Math.sqrt(G_TERRE * h);', 'return (G_TERRE * h);'],
  ['Gauss-Bonnet signe de K', 'const K_HYP = -1;', 'const K_HYP = 1;'],
  ['Green h^(-1/4) -> h^(-1/2)', 'P.amplitude * Math.sqrt(c0 / vitesseOnde(H_COTE))', 'P.amplitude * (c0 / vitesseOnde(H_COTE))'],
  ['Hawking aire horizon r_s = GM/c^2', 'rs = 2 * G_N * m / (C * C)', 'rs = G_N * m / (C * C)'],
  ['helice sans vitesse du Soleil', 'dx = q[0] - rp + Vx * tc', 'dx = q[0] - rp'],
  ['tolerance SB sans le facteur 2 sur R', 'Math.sqrt(4 * e.sR * e.sR', 'Math.sqrt(e.sR * e.sR'],
  ['ecart SB cache (tout dans la tolerance)', 'ok = d <= tol;', 'ok = true;'],
];
const tmp = mkdtempSync(join(tmpdir(), 'tam-gq2-'));
const urlMoteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const base = src.replace("from './tam-moteur.js'", `from '${urlMoteur}'`);
let tues = 0;
try {
  writeFileSync(join(tmp, 'temoin.mjs'), base);
  verifierPublie(await import(pathToFileURL(join(tmp, 'temoin.mjs')).href), false); /* la copie non mutee passe */
  N++;
  for (const [k, [nom, de, vers]] of MUTANTS.entries()) {
    vrai(base.split(de).length === 2, `mutant ${nom} : cible unique`);
    const f = join(tmp, `mutant-${k}.mjs`);
    writeFileSync(f, base.replace(de, vers));
    let tue = false;
    try { verifierPublie(await import(pathToFileURL(f).href), false); } catch { tue = true; }
    if (tue) tues++; else console.log('MUTANT SURVIVANT :', nom);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }

console.log('temps (ms) : ' + Object.entries(temps).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', '));
console.log(`test-tam-grandes-questions-2-20261101 : ${N} assertions OK`);
console.log(`MUTANTS : ${tues}/${MUTANTS.length} tues`);
assert.equal(tues, MUTANTS.length);
