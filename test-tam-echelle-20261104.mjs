// test-tam-echelle-20261104.mjs -- banc de l echelle par ETENDUE (game132) + mutants sur COPIES de tam-science.js.
// Lancer : node test-tam-echelle-20261104.mjs
// Prouve : chaque colonne de ECHELLE_ETENDUE couvre exactement sqrt(12) (l etendue d une colonne uniforme), quels que soient les
//   reglages essayes ; les systemes hors table gardent la regle commune (etendue = etendue brute / ecart-type max, recalculee ici).
// Ne prouve PAS : que le dessin est beau ; seulement qu il n est plus etire (vu au navigateur).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-science.js');
const etendueCol = (z, n, D, c) => { let lo = 1 / 0, hi = -1 / 0; for (let i = 0; i < n; i++) { lo = Math.min(lo, z[i * D + c]); hi = Math.max(hi, z[i * D + c]); } return hi - lo; };

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => { let c = false, det = ''; try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; } res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : '')); };
  ok('table : dogmeCentral et circuitRC, colonne 1', () => { assert.deepEqual(JSON.parse(JSON.stringify(T.ECHELLE_ETENDUE)), { dogmeCentral: [1], circuitRC: [1] }); });
  for (const [id, essais] of [['dogmeCentral', [{}, { transcription: 0.5 }, { transcription: 20, traduction: 20 }, { graine: 7 }]], ['circuitRC', [{}, { tau: 0.5 }, { tau: 5 }]]]) for (const p of essais) ok(`${id} ${JSON.stringify(p)} : la colonne 1 couvre sqrt(12), le dessin n est plus etire`, () => {
    const s = T.systeme(id), o = s.mod.simuler(id, p), z = T.standardiserIso(o.brut, o.n, o.D, id), e = etendueCol(z, o.n, o.D, 1);
    assert.ok(Math.abs(e - Math.sqrt(12)) < 1e-9, 'etendue ' + e);
    /* temoin : par l ecart-type, la meme colonne serait plus haute que le temps n est large (le defaut d avant) */
    let m = 0, v = 0; for (let i = 0; i < o.n; i++) m += o.brut[i * o.D + 1]; m /= o.n; for (let i = 0; i < o.n; i++) v += (o.brut[i * o.D + 1] - m) ** 2;
    let lo = 1 / 0, hi = -1 / 0; for (let i = 0; i < o.n; i++) { lo = Math.min(lo, o.brut[i * o.D + 1]); hi = Math.max(hi, o.brut[i * o.D + 1]); }
    return 'par l ecart-type : ' + ((hi - lo) / Math.sqrt(v / o.n)).toFixed(2) + ' ; par l etendue : ' + e.toFixed(2);
  });
  ok('hors table : la regle commune inchangee (enzyme, colonne 1 = etendue / ecart-type max des colonnes non propres)', () => {
    const id = 'enzyme', o = T.systeme(id).mod.simuler(id, {}), n = o.n, D = o.D, propre = new Set(T.ECHELLE_PROPRE[id] || []);
    let sMax = 0; for (let j = 0; j < D; j++) { if (propre.has(j)) continue; let m = 0, v = 0; for (let i = 0; i < n; i++) m += o.brut[i * D + j]; m /= n; for (let i = 0; i < n; i++) v += (o.brut[i * D + j] - m) ** 2; sMax = Math.max(sMax, Math.sqrt(v / n)); }
    for (let j = 0; j < D; j++) { if (propre.has(j)) continue; let lo = 1 / 0, hi = -1 / 0; for (let i = 0; i < n; i++) { lo = Math.min(lo, o.brut[i * D + j]); hi = Math.max(hi, o.brut[i * D + j]); }
      const z = T.standardiserIso(o.brut, n, D, id); assert.ok(Math.abs(etendueCol(z, n, D, j) - (hi - lo) / sMax) < 1e-9, 'colonne ' + j); }
  });
  return res;
}

const T0 = await import(pathToFileURL(SOURCE).href);
const r0 = suite(T0, true), ech = r0.filter((x) => !x.ok);
let assertions = r0.length;
const src = readFileSync(SOURCE, 'utf8');
/* (retire : « colonne etendue comptee dans sMax » — mutant EQUIVALENT aujourd hui : dans les deux systemes de la table, la colonne a
 *   l etendue est la seule colonne non propre, sMax n y sert a rien d autre ; il redeviendra observable si la table s etend) */
const MUTANTS = [
  ['table vide', 'ECHELLE_ETENDUE = Object.freeze({ dogmeCentral: [1], circuitRC: [1] });', 'ECHELLE_ETENDUE = Object.freeze({});'],
  ['etendue ramenee a 3', 'k[j] = hi > lo ? Math.sqrt(12) / (hi - lo) : 0; continue;', 'k[j] = hi > lo ? 3 / (hi - lo) : 0; continue;'],
];
const prefixe = pathToFileURL(ICI).href + '/';
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-echelle-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`);
    writeFileSync(f, src.replace(de, vers).replaceAll("from './", `from '${prefixe}`));
    let r; try { r = suite(await import(pathToFileURL(f).href)); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok); if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-echelle-20261104 : ${assertions} assertions OK`);
