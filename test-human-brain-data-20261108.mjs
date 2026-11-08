// test-human-brain-data-20261108.mjs -- banc de human-brain-data.js (cablage HCP, couplages, voies nommees, paquets d emotions) + mutants sur COPIES.
// References : comptes refaits par mes scripts du scratchpad (derive-wiring-all.cjs sur le csv, derive-func.cjs, ref-wiring4.cjs), autre code que le module.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = dirname(fileURLToPath(import.meta.url)), SOURCE = join(ICI, 'human-brain-data.js');
const src = readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');

// seeds per printed category, from ref-wiring4.cjs (my reference, not the module)
const SEEDS = {"Anger experience":"L_insula L_lateralorbitofrontal L_parsopercularis L_temporalpole","Anger perception":"L_parsopercularis R_entorhinal R_rostralmiddlefrontal R_lateraloccipital R_fusiform R_superiorfrontal","Disgust experience":"Lamyg Ramyg L_entorhinal R_lateralorbitofrontal L_fusiform","Disgust perception":"R_lateralorbitofrontal R_insula L_caudalanteriorcingulate R_caudalanteriorcingulate L_parsopercularis R_parsopercularis R_lateraloccipital R_fusiform","Fear experience":"PAG R_lateraloccipital R_fusiform L_middletemporal","Fear perception":"Lamyg L_entorhinal R_entorhinal Lhippo R_middletemporal","Happiness experience":"L_lateraloccipital","Sadness experience":"L_entorhinal L_superiorfrontal R_superiorfrontal R_middletemporal Rput PAG","Experience of emotion":"R_lateralorbitofrontal","Perception of emotion":"L_superiorfrontal R_superiorfrontal L_caudalanteriorcingulate R_caudalanteriorcingulate Rhippo L_parsopercularis R_lateraloccipital R_fusiform","High arousal emotions":"Ramyg R_lateralorbitofrontal PAG","Unpleasant emotions":"L_lateraloccipital","Shame and embarrassment":"L_insula L_parsorbitalis L_caudalanteriorcingulate L_superiorfrontal R_parstriangularis R_precentral Lthal","Guilt":"L_insula L_parsorbitalis L_superiortemporal L_inferiorparietal","Maternal love":"VTA_L Rthal SN_L Lput R_superiorfrontal R_superiortemporal R_middletemporal Rput Lamyg","Passionate love":"VTA_L VTA_R","Empathy for pain":"L_insula L_parsopercularis L_precentral L_caudalanteriorcingulate R_caudalanteriorcingulate L_superiorfrontal R_superiorfrontal L_supramarginal R_insula R_supramarginal R_lateraloccipital R_caudalmiddlefrontal R_superiorparietal","Gratitude (single study, 23 people)":"L_rostralanteriorcingulate R_rostralanteriorcingulate R_medialorbitofrontal L_medialorbitofrontal L_superiorfrontal R_superiorfrontal","Surprise faces (single study, 15 people)":"L_lateraloccipital L_superiorfrontal L_postcentral Rput Rpal R_lateraloccipital R_pericalcarine R_postcentral R_parahippocampal Ramyg R_precentral","Regret (single study, 24 people)":"L_medialorbitofrontal L_rostralanteriorcingulate R_rostralanteriorcingulate L_superiorfrontal R_superiorfrontal R_posteriorcingulate R_middletemporal Lamyg L_temporalpole Lhippo Rhippo","Curiosity (single study, 19 people)":"R_insula L_insula R_caudalanteriorcingulate L_caudalanteriorcingulate R_parsopercularis R_frontalpole L_lingual R_lingual L_lateraloccipital L_posteriorcingulate R_posteriorcingulate","Compassion meditation (single study, 30 people)":"L_precuneus R_precuneus R_supramarginal L_inferiorparietal R_inferiorparietal L_insula R_insula L_bankssts R_bankssts L_superiortemporal R_superiortemporal R_superiorparietal L_posteriorcingulate R_posteriorcingulate R_middletemporal L_parahippocampal R_parahippocampal L_fusiform R_fusiform Cerebellum R_caudalanteriorcingulate R_superiorfrontal R_caudalmiddlefrontal"};
const PACKS_REF = { basic: ['Anger experience', 'Anger perception', 'Disgust experience', 'Disgust perception', 'Fear experience', 'Fear perception', 'Happiness experience', 'Sadness experience'],
  affect: ['Experience of emotion', 'Perception of emotion', 'High arousal emotions', 'Unpleasant emotions'], social: ['Shame and embarrassment', 'Guilt', 'Regret (single study, 24 people)', 'Gratitude (single study, 23 people)'],
  love: ['Maternal love', 'Passionate love'], empathy: ['Empathy for pain', 'Compassion meditation (single study, 30 people)'], curiosity: ['Surprise faces (single study, 15 people)', 'Curiosity (single study, 19 people)'] };

function suite(D) {
  const res = [], ok = (nom, f) => { try { const d = f(); res.push({ nom, ok: true, d }); } catch (e) { res.push({ nom, ok: false, d: e.message.slice(0, 300) }); } };
  const ids = D.REGIONS.map((r) => r.id), N = 82;
  ok('regions : 89, ids uniques, 68 cortex + 14 sous-cortex + 7 profonds, noms et gloses', () => {
    assert.equal(D.REGIONS.length, 89); assert.equal(new Set(ids).size, 89);
    assert.deepEqual(['cortex', 'subcortex', 'deep'].map((k) => D.REGIONS.filter((r) => r.kind === k).length), [68, 14, 7]);
    assert.ok(D.REGIONS.slice(0, 68).every((r) => /^[LR]_/.test(r.id)) && D.REGIONS.slice(68, 82).every((r) => /^[LR][a-z]+$/.test(r.id)));
    assert.ok(D.REGIONS.every((r) => r.name.length > 3 && r.plain.endsWith('(our gloss)') && ['L', 'R', 'mid'].includes(r.side)));
    assert.equal(ids[0], 'L_bankssts'); assert.equal(ids[81], 'Rthal'); assert.equal(ids.indexOf('Lamyg'), 69);
  });
  ok('cablage : 1190 paires i<j sans doublon, poids dans [0.14292, 12.615], 441 >= 8, un seul reseau', () => {
    assert.equal(D.WIRING.length, 1190);
    assert.ok(D.WIRING.every(([i, j, w]) => Number.isInteger(i) && Number.isInteger(j) && i < j && j < N && w >= 0.14292 && w <= 12.615));
    assert.equal(new Set(D.WIRING.map(([i, j]) => i + '-' + j)).size, 1190);
    assert.equal(Math.min(...D.WIRING.map((e) => e[2])), 0.14292); assert.equal(Math.max(...D.WIRING.map((e) => e[2])), 12.615);
    assert.equal(D.WIRING.filter((e) => e[2] >= 8).length, 441);
    const p = ids.slice(0, N).map((_, k) => k), f = (x) => (p[x] === x ? x : (p[x] = f(p[x]))); D.WIRING.forEach(([i, j]) => { p[f(i)] = f(j); });
    assert.equal(new Set(p.map((_, k) => f(k))).size, 1);
    assert.equal((D.WIRING.reduce((a, e) => a + e[2], 0) / 1190).toFixed(3), '7.069');
  });
  ok('couplages : 1190 paires >= 0.28764, max 1.4272, 468 aussi cablees, 10 regions sans partenaire', () => {
    assert.equal(D.FUNCTION.length, 1190); assert.ok(D.FUNCTION.every(([i, j, r]) => i < j && j < N && r >= 0.28764 && r <= 1.4272));
    assert.equal(new Set(D.FUNCTION.map(([i, j]) => i + '-' + j)).size, 1190);
    const w = new Set(D.WIRING.map(([i, j]) => i + '-' + j)); assert.equal(D.FUNCTION.filter(([i, j]) => w.has(i + '-' + j)).length, 468);
    const deg = ids.slice(0, N).map(() => 0); D.FUNCTION.forEach(([i, j]) => { deg[i]++; deg[j]++; });
    assert.equal(ids.slice(0, N).filter((_, k) => !deg[k]).join(' '), 'L_entorhinal L_temporalpole R_entorhinal R_temporalpole Laccumb Lamyg Lpal Raccumb Ramyg Rpal');
    assert.equal((D.FUNCTION.reduce((a, e) => a + e[2], 0) / 1190).toFixed(3), '0.453');
  });
  ok('voies nommees : 35, chacune touche une partie profonde, chaque partie profonde atteinte, source connue', () => {
    assert.equal(D.DEEP_LINKS.length, 35); const keys = D.SOURCES.map((s) => s.key);
    assert.ok(D.DEEP_LINKS.every(([i, j, s]) => i >= N && i < 89 && j >= 0 && j < 89 && keys.includes(s)));
    for (let k = N; k < 89; k++) assert.ok(D.DEEP_LINKS.some(([i, j]) => i === k || j === k), ids[k] + ' sans voie');
    assert.deepEqual(['mfb', 'sn', 'pag'].map((s) => D.DEEP_LINKS.filter((l) => l[2] === s).length), [6, 24, 5]);
  });
  ok('comptes declares = comptes refaits', () => {
    const K = D.COUNTS; assert.deepEqual([K.regions, K.hcpRegions, K.cortical, K.subcortical, K.deep, K.wiringNonzero, K.wiringStrong, K.functionKept, K.overlap, K.deepLinks, K.subjects], [89, 82, 68, 14, 7, 1190, 441, 1190, 468, 35, 207]);
  });
  ok('paquets : 6, 22 emotions, regions = reference, partagees = refaites ici, sources completes', () => {
    assert.deepEqual(D.PACKS.map((p) => p.id), Object.keys(PACKS_REF));
    for (const p of D.PACKS) {
      assert.deepEqual(p.emotions.map((e) => e.printedName), PACKS_REF[p.id]);
      const regs = p.emotions.map((e) => (SEEDS[e.printedName] ? SEEDS[e.printedName].split(' ') : []));
      p.emotions.forEach((e, k) => {
        assert.equal(e.regions.join(' '), regs[k].join(' '), e.name);
        assert.deepEqual(e.shared, regs[k].filter((r) => regs.some((o, q) => q !== k && o.includes(r))), e.name + ' partage');
        assert.ok(e.regions.every((r) => ids.includes(r)));
        assert.ok(e.source.short && e.source.cite && e.source.doi && e.source.n && ['meta-analysis', 'single study'].includes(e.source.design) && e.source.year > 2000, e.name + ' source');
        assert.ok(e.measured.length > 20 && e.ours.length > 20);
      });
    }
    assert.equal(D.PACKS.reduce((a, p) => a + p.emotions.length, 0), 22);
  });
  ok('sans region : la claustrum droite et le tronc cerebral seulement', () => { assert.equal(D.UNMAPPED.join(', '), 'Right claustrum, Brain stem L/R'); });
  ok('constat honnete : 36 des 64 regions servent deux familles ou plus, 28 une seule ; amygdale gauche 4', () => {
    assert.equal(D.SHARED.shared + ' of ' + D.SHARED.mapped + ' / ' + D.SHARED.single, '36 of 64 / 28');
    assert.equal(D.SHARED.families.Lamyg.join(', '), 'disgust, fear, regret, maternal love');
    assert.equal(D.SHARED.families.L_insula.length, 6);
  });
  ok('positions : les 82 regions prennent l anatomie reelle (null ici), les 7 parties profondes un pic lu (MNI, mm) ou notre placement dit', () => {
    assert.equal(D.POS3D.length, 89); assert.ok(D.POS3D.slice(0, N).every((p) => p === null));
    /* references : Shih et al. 2022 Tables 2-3, Lindquist et al. 2012 Table 1, van Elk et al. 2019 Table 4 (lues), SN_R miroir, hypothalamus place */
    assert.deepEqual(D.POS3D.slice(N), [[-2, -14, -10], [2, -22, -16], [-8, -24, -14], [8, -24, -14], [0, -38, -10], [0, -6, -10], [-32, -66, -32]]);
    assert.deepEqual(Object.keys(D.POS3D_SOURCE), ids.slice(N));
    assert.ok(D.POS3D_SOURCE.SN_R.startsWith('our placement') && D.POS3D_SOURCE.Hypothal.startsWith('our placement') && ['VTA_L', 'VTA_R', 'SN_L', 'PAG', 'Cerebellum'].every((k) => /\d{4} .*Table \d/.test(D.POS3D_SOURCE[k])));
  });
  ok('selection : bornes et paquet', () => {
    const s = D.selectEmotion({ packWiring: 9, emotionWiring: 0, compareWiring: 9 }); assert.equal(s.pack.id, 'curiosity'); assert.equal(s.emotion.id, 'surprise'); assert.equal(s.other.id, 'curiosity'); assert.equal(D.selectEmotion({ packWiring: 5, emotionWiring: 9, compareWiring: 9 }).other, null);
    assert.equal(D.selectEmotion({}).emotion.id, 'angerExperience'); assert.equal(D.selectEmotion({ packWiring: 0, emotionWiring: 5, compareWiring: 6 }).other, null);
  });
  ok('414 parcelles (game317) : reseaux, paires, couplages, centroides, regle de la majorite', () => {
    /* references : derive-400.cjs (mon script sur les csv : 6117 paires de 0.015276 a 11.649 ; 83061 couplages positifs, 2430 negatifs, coupure 0.35914 ; 1472 communes) */
    assert.equal(D.REGIONS_400.length, 414); const nets = {}; D.REGIONS_400.slice(0, 400).forEach((r) => { nets[r.network] = (nets[r.network] || 0) + 1; });
    assert.deepEqual(nets, { Vis: 61, SomMot: 77, DorsAttn: 46, SalVentAttn: 47, Limbic: 26, Cont: 52, Default: 91 });
    assert.deepEqual(D.REGIONS_400.slice(400).map((r) => r.id), ids.slice(68, 82));
    assert.ok(D.WIRING_400.length === 6117 && D.WIRING_400.every(([i, j, w]) => i < j && j < 414 && w > 0) && new Set(D.WIRING_400.map(([i, j]) => i + '-' + j)).size === 6117);
    assert.equal(Math.min(...D.WIRING_400.map((e) => e[2])), 0.015276); assert.equal(Math.max(...D.WIRING_400.map((e) => e[2])), 11.649);
    assert.ok(D.FUNCTION_400.length === 6117 && D.FUNCTION_400.every(([i, j, r]) => i < j && j < 414 && r >= 0.35914 && r <= 1.3384) && new Set(D.FUNCTION_400.map(([i, j]) => i + '-' + j)).size === 6117);
    const w4 = new Set(D.WIRING_400.map(([i, j]) => i + '-' + j)); assert.equal(D.FUNCTION_400.filter(([i, j]) => w4.has(i + '-' + j)).length, 1472);
    assert.deepEqual([D.COUNTS_400.functionPositive, D.COUNTS_400.functionNegative, D.COUNTS_400.overlap], [83061, 2430, 1472]);
    assert.ok(D.CENTROIDS_400.length === 414 && D.CENTROIDS_400.every((c) => c.length === 3 && c.every(Number.isFinite)));
    assert.equal(new Set(D.DK_OF_400.slice(0, 400)).size, 64); assert.deepEqual(D.lostAt400(ids.slice(0, 68)), ['L_parsorbitalis', 'L_frontalpole', 'L_transversetemporal', 'R_parsorbitalis']);
    assert.deepEqual([D.parcelFor('Laccumb'), D.parcelFor('L_frontalpole'), D.parcelsOf(['Lamyg']).join(',')], [400, -1, '401']);
    const big = D.parcelFor('L_insula'); assert.ok(D.DK_OF_400[big] === 'L_insula' && D.DK_OF_400.every((d, q) => d !== 'L_insula' || D.VERTICES_400[q] <= D.VERTICES_400[big]), 'largest parcel');
  });
  ok('theories (game318) : cinq ordres, etapes, regions existantes, sources lues', () => {
    assert.deepEqual(D.THEORIES.map((t) => t.id), ['data', 'jamesLange', 'cannonBard', 'schachterSinger', 'constructionist']);
    assert.deepEqual(D.THEORIES.map((t) => t.stages.map((x) => x.step).join(',')), ['0,10,20', '0,4,8', '0,1', '0,5,10', '0,3']);
    assert.ok(D.THEORIES.slice(1).every((t) => t.name.startsWith('THEORY: ') && t.statement.length > 40 && D.SOURCES.some((x) => x.key === t.source)));
    assert.ok(D.THEORIES.every((t) => t.stages.every((x) => ['emotion', 'emotion+body', 'shared'].includes(x.regions) || (Array.isArray(x.regions) && x.regions.every((r) => ids.includes(r))))));
    assert.deepEqual(D.THEORIES[1].stages[0].regions, ['Hypothal', 'PAG']); assert.equal(D.THEORIES[3].stages[1].regions.length, 14);
  });
  ok('pur : ni DOM, ni hasard, ni import', () => { assert.ok(!/\bdocument\.|\bwindow\.|Math\.random|^import\b/m.test(src.replace(/^\/\/.*$/gm, ''))); });
  return res;
}

let n = 0; const ech = [];
const D0 = await import(pathToFileURL(SOURCE).href);
for (const r of suite(D0)) { n++; console.log((r.ok ? 'OK    ' : 'ECHEC ') + r.nom + (r.d ? '  ' + r.d : '')); if (!r.ok) ech.push(r); }
const MUTANTS = [
  ['cablage : une paire en trop', "export const WIRING = Object.freeze('", "export const WIRING = Object.freeze('0:1:9 "],
  ['couplages : seuil a la paire suivante', "export const FUNCTION = Object.freeze('", "export const FUNCTION = Object.freeze('0:2:0.2876 "],
  ['voies : indice decale', 'return Object.freeze([DEEP_IDS.indexOf(a), DEEP_IDS.indexOf(b), s]);', 'return Object.freeze([DEEP_IDS.indexOf(a), DEEP_IDS.indexOf(b) - 1, s]);'],
  ['paquets : partage sans exclure soi-meme', 'shared: Object.freeze(all[k].filter((r) => all.some((o, q) => q !== k && o.includes(r)))),', 'shared: Object.freeze(all[k].filter((r) => all.some((o, q) => o.includes(r)))),'],
  ['paquets : regions en double', 'const regionsOf = (printed) => [...new Set(printed.flatMap((a) => MAPPING[a] || []))];', 'const regionsOf = (printed) => printed.flatMap((a) => MAPPING[a] || []);'],
  ['constat : une seule famille suffit', 'shared = mapped.filter((r) => by[r].size >= 2);', 'shared = mapped.filter((r) => by[r].size >= 1);'],
  ['constat : resumes comptes', 'PACKS.filter((p) => !p.summary).forEach', 'PACKS.forEach'],
  ['sans region : filtre inverse', '.filter((a) => !(MAPPING[a] || []).length))]);', '.filter((a) => (MAPPING[a] || []).length))]);'],
  ['positions : pic de l aire tegmentale gauche faux', 'VTA_L: [-2, -14, -10]', 'VTA_L: [-2, -14, -20]'],
  ['positions : les 82 regions sur une position inventee', '(a < COUNTS.hcpRegions ? null :', '(a < COUNTS.hcpRegions ? [0, 0, 0] :'],
  /* (les sous-corticales par la region majoritaire : mutant equivalent, leur region majoritaire est elles-memes) */
  ['414 : sous-corticales oubliees', '(k < 400 ? want.has(DK_OF_400[k]) : want.has(r.id))', '(k < 400 ? want.has(DK_OF_400[k]) : false)'],
  ['414 : la plus petite parcelle pour une voie', 'VERTICES_400[q] > VERTICES_400[best]', 'VERTICES_400[q] < VERTICES_400[best]'],
  ['414 : perdues inversees', 'return regionIds.filter((r) => !have.has(r) &&', 'return regionIds.filter((r) => have.has(r) &&'],
  ['theories : le corps de James-Lange senti plus tard', "{ step: 4, regions: ['L_insula', 'R_insula']", "{ step: 6, regions: ['L_insula', 'R_insula']"],
  ['selection : comparaison decalee', 'other: ck && ck - 1 !== ek ? pack.emotions[ck - 1] : null', 'other: ck && ck !== ek ? pack.emotions[ck % pack.emotions.length] : null'],
  ['correspondance : amygdale gauche perdue', '"L. amygdala":["Lamyg"]', '"L. amygdala":[]'],
];
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'hbd-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`); writeFileSync(f, src.replace(de, () => vers));
    let r; try { r = suite(await import(pathToFileURL(f).href)); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok); if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges[0].nom : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
n++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', d: tues + '/' + MUTANTS.length });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.d || '')); process.exit(1); }
console.log(`test-human-brain-data-20261108 : ${n} assertions OK`);
