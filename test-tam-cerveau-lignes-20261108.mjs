// test-tam-cerveau-lignes-20261108.mjs -- the wired human brain of TAM: its lines are drawn between its DRAWN points, and its legend says
// exactly what is drawn, with the numbers of the subject itself.
// Why (Phil, production screenshot 2026-11-08): the lines formed a block on the right while the region points lay on the left. A STOPPED
//   work is drawn from its STORED view (tam-onglet.js positionsBrutes -> S.stocke), possibly made by an older version of the subject, while
//   the lines were recomputed from the current coordinates in their own frame. Now each brain line names the two points it joins (ia, ib) and
//   is drawn between the screen positions actually used for those points.
// What it PROVES, on the REAL modules (imported): 1. segmentsIndexes / dessinerSegmentsIndexes (tam-vue.js): validation, and every line from
//   exactly the given screen positions of its two points. 2. The STORED path reproduced: a stored view made by a DIFFERENT layout; the old
//   coordinate path puts the lines away from the drawn points, the indexed path exactly on them. 3. tam-onglet.js draws indexed segments from
//   projSx / projSy (text check of the call: the tab needs a DOM). 4. Every number and region name of the legend equals the subject's invariants,
//   for every pack and emotion, in both networks. 5. Mutants on COPIES of tam-vue.js, tam-onglet.js and tam-legendes.js: all must be killed.
// What it does NOT prove: the pixels (looked at in a browser, see the report).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as TS from './tam-science.js';
import * as T from './tam-maths.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const enregistreur = () => { const appels = [], g = {}; for (const f of ['beginPath', 'moveTo', 'lineTo', 'stroke']) g[f] = (...a) => appels.push([f, ...a]);
  return { g: new Proxy(g, { set(o, p, v) { appels.push(['set', p, v]); o[p] = v; return true; } }), appels }; };
const PACKS = [8, 4, 4, 2, 2, 2];

function suite(V, L, ongletSrc) {
  const res = [], ok = (nom, f) => { try { const d = f(); res.push({ nom, ok: true, d }); } catch (e) { res.push({ nom, ok: false, d: (e && e.message || String(e)).slice(0, 300) }); } };
  ok('segmentsIndexes : null without ia/ib, out-of-range pairs dropped, w clamped, class checked', () => {
    assert.equal(V.segmentsIndexes([{ a: [0, 0, 0], b: [1, 1, 1] }], 5), null);
    assert.equal(V.segmentsIndexes([{ ia: 0, ib: 1 }, { ia: 1 }], 5), null);
    assert.equal(V.segmentsIndexes([], 5), null);
    const si = V.segmentsIndexes([{ ia: 0, ib: 1, w: 7, c: 5 }, { ia: 2, ib: 9 }, { ia: -1, ib: 1 }, { ia: 3, ib: 4, w: -2, c: 99 }], 5);
    assert.deepEqual([si.q, [...si.ia], [...si.ib], [...si.poids], [...si.classes]], [2, [0, 3], [1, 4], [1, 0], [5, 0]]);
  });
  ok('dessinerSegmentsIndexes : every line from exactly the screen positions of its two points, NaN points skipped', () => {
    const si = V.segmentsIndexes([{ ia: 0, ib: 1, w: 0.9 }, { ia: 1, ib: 2, w: 0.1 }, { ia: 2, ib: 3 }], 4);
    const sx = [10, 20, 30, NaN], sy = [1, 2, 3, 4], { g, appels } = enregistreur();
    assert.equal(V.dessinerSegmentsIndexes(g, si, sx, sy, { dpr: 2 }), 2);
    const seg = []; let cur = null; for (const c of appels) { if (c[0] === 'moveTo') cur = [c[1], c[2]]; if (c[0] === 'lineTo') seg.push([...cur, c[1], c[2]].join(',')); }
    assert.deepEqual(seg.sort(), ['10,1,20,2', '20,2,30,3'].sort());
  });
  ok('the STORED path : a stored view from another layout ; coordinate lines miss the drawn points, indexed lines land on them', () => {
    const o = T.simuler('emotionWiringHCP', {}), n = o.n, D = o.D;
    /* the drawn points of a STOPPED work = its stored view: here made by a different layout (mirrored and shifted), as an older version would */
    const stocke = new Float32Array(n * 3); for (let i = 0; i < n; i++) { stocke[3 * i] = 0.7 - o.brut[3 * i] * 0.5; stocke[3 * i + 1] = o.brut[3 * i + 1] * 0.5 - 0.3; stocke[3 * i + 2] = 0; }
    const ecran = (x, y) => ({ sx: 400 + 300 * x, sy: 300 + 300 * y }), sx = new Float64Array(n), sy = new Float64Array(n);
    for (let i = 0; i < n; i++) { const u = ecran(stocke[3 * i], -stocke[3 * i + 1]); sx[i] = u.sx; sy[i] = u.sy; }
    /* old path: lines from the CURRENT coordinates, through their own frame */
    const { m, k } = TS.echelleIso(o.brut, n, D, 'emotionWiringHCP'), z = TS.standardiserIso(o.brut, n, D, 'emotionWiringHCP');
    const sv = V.projeterSegments({ segments: o.segments, m, k, z, n, D, actives: null, angles: [], t: 0 });
    let loin = 0; for (let r = 0; r < sv.q; r++) { const u = ecran(sv.xyz[6 * r], -sv.xyz[6 * r + 1]), ia = o.segments[r].ia; loin = Math.max(loin, Math.hypot(u.sx - sx[ia], u.sy - sy[ia])); }
    assert.ok(loin > 20, 'the old path must miss the stored points (it did in production): ' + loin.toFixed(1) + ' px');
    /* new path: from the drawn positions */
    const si = V.segmentsIndexes(o.segments, n), { g, appels } = enregistreur(); V.dessinerSegmentsIndexes(g, si, sx, sy, { dpr: 1 });
    const fins = new Set(); for (let i = 0; i < n; i++) fins.add(sx[i] + ',' + sy[i]);
    const coups = appels.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo');
    assert.ok(si.q === o.segments.length && coups.length === 2 * si.q && coups.every((c) => fins.has(c[1] + ',' + c[2])), 'every end on a drawn point');
    return 'old path up to ' + loin.toFixed(0) + ' px away ; ' + si.q + ' indexed lines on the drawn points';
  });
  ok('tam-onglet.js : indexed segments are drawn from projSx / projSy (the drawn points), before the coordinate fallback', () => {
    assert.ok(/const si = indexables\(\) \? V\.segmentsIndexes\(S\.o\.segments, S\.n\) : null;\s*if \(si\) racine\.dataset\.segments = String\(V\.dessinerSegmentsIndexes\(g, si, projSx, projSy, \{ dpr \}\)\);\s*else \{ const sv = segmentsScene\(\);/.test(ongletSrc), 'call order');
    const iP = ongletSrc.indexOf('projSx[i] = u ? u.sx : NaN'), iS = ongletSrc.indexOf('V.dessinerSegmentsIndexes(g, si, projSx, projSy');
    assert.ok(iP > 0 && iS > iP, 'the lines use the screen positions computed for the points just before');
    assert.ok(/function indexables\(\) \{ const o = S\.o; return !!\(S\.science && o && Array\.isArray\(o\.segments\) && o\.segments\.length && o\.brut && !S\.corps && !\(S\.P && S\.P\.melange\) && !filmDe\(\)\); \}/.test(ongletSrc), 'guard');
  });
  ok('legend = invariants : every number and region name, every pack and emotion, both networks', () => {
    let vus = 0;
    for (let pk = 0; pk < 6; pk++) for (let ek = 0; ek < PACKS[pk]; ek++) for (const nw of [0, 1]) {
      const p = { packWiring: pk, emotionWiring: ek, networkWiring: nw }, o = T.simuler('emotionWiringHCP', p), C = o.invariants.emotionWiringHCP, l = L.legende('emotionWiringHCP', o.params);
      const nReg = Number(C.regionsWiring.split(':')[0].split(' ')[0]), nShared = Number(C.sharedInPackWiring.split(':')[0]);
      assert.equal(l.titre, 'Wired brain: ' + C.emotionShownWiring);
      assert.ok(l.enUnePhrase.startsWith(C.emotionShownWiring + ' (' + C.packShownWiring + '): ' + nReg + ' regions reported by '), l.enUnePhrase);
      assert.ok(l.enUnePhrase.includes('; ' + nShared + ' of them also reported'), 'shared count');
      assert.ok(l.enUnePhrase.includes('(' + C.sourceWiring.split(', ').slice(1).join(', ') + ')'), 'source design and size');
      const names = nReg ? C.regionsWiring.split(': ')[1].toLowerCase() : 'none among these parts';
      assert.ok(l.aRegarder[0].startsWith('Its regions (our mapping of the areas its source prints): ' + names + '.'), 'names');
      const sharedNames = nShared ? C.sharedInPackWiring.split(': ')[1].toLowerCase() : 'none';
      assert.ok(l.aRegarder[0].includes('Shared within this pack: ' + sharedNames), 'shared names');
      const [nLinks, kind] = C.shownWiring.match(/^(\d+) (connections|couplings)/).slice(1), [nPath, nDeep] = C.pathwaysWiring.match(/^(\d+) named pathways, (\d+) parts/).slice(1);
      assert.ok(l.aRegarder[1].includes(Number(nLinks).toLocaleString('en-US') + (kind === 'couplings' ? ' strongest couplings at rest' : ' connections measured by tractography')), 'links ' + nLinks);
      assert.ok(l.aRegarder[1].includes(' plus ' + nPath + ' violet pathways') && l.aRegarder[1].includes('the ' + nDeep + ' deep parts') && l.aRegarder[1].includes(' in 207 adults'), 'pathways, deep parts, adults');
      const nRegions = Number(C.positionsWiring.match(/for (\d+) regions/)[1]), nOurs = Number(C.positionsWiring.match(/(\d+) placed by us/)[1]);
      assert.ok(l.aRegarder[1].includes('the ' + nRegions + ' regions at their real places (fsaverage5 surface)') && l.aRegarder[2].includes('the places of ' + nOurs + ' deep parts'), 'places');
      const [a, b, c] = C.sharedWiring.match(/^(\d+) of (\d+) \((\d+) serve one\)$/).slice(1);
      assert.ok(l.aRegarder[2].endsWith('Over all packs ' + a + ' of ' + b + ' mapped regions serve two or more emotions, ' + c + ' serve one.'), 'overall');
      vus++;
    }
    return vus + ' legends checked';
  });
  ok('legend colours = what is drawn : classes 0 (grey-blue) and 5 (violet) only, the brain sentence, not the generic column one', () => {
    const o = T.simuler('emotionWiringHCP', {}), l = L.legende('emotionWiringHCP', o.params);
    const cls = new Set(o.segments.map((s) => s.c));
    assert.deepStrictEqual([...cls].sort(), [0, 5], 'segment classes');
    assert.strictEqual(V.COULEURS_SEGMENTS[0], '#a9b8d8'); assert.strictEqual(V.COULEURS_SEGMENTS[5], '#c58cff');
    assert.ok(l.couleurs.startsWith('Lines: grey-blue = a measured link (fainter = weaker), violet = a pathway named in studies.'), l.couleurs.slice(0, 80));
    assert.ok(!/column that is farthest/.test(l.couleurs), 'generic sentence gone');
    assert.ok(/farthest from its own average/.test(L.legende('bodyMapsNummenmaa', {}).couleurs), 'other subjects keep the generic sentence');
    return 'ok';
  });
  ok('legend = invariants at 414 parcels and in THEORY mode (game317, game318)', () => {
    let vus = 0;
    for (let pk = 0; pk < 6; pk++) for (let ek = 0; ek < PACKS[pk]; ek++) for (const th of [0, 1, 4]) {
      const p = { packWiring: pk, emotionWiring: ek, resolutionWiring: 1, theoryWiring: th }, o = T.simuler('emotionWiringHCP', p), C = o.invariants.emotionWiringHCP, l = L.legende('emotionWiringHCP', o.params);
      const [nLinks] = C.shownWiring.match(/^(\d+) connections/).slice(1), [nPath] = C.pathwaysWiring.match(/^(\d+) named pathways/).slice(1), nParts = Number(C.positionsWiring.match(/for (\d+) parcels/)[1]);
      assert.ok(l.aRegarder[1].includes(Number(nLinks).toLocaleString('en-US') + ' connections measured by tractography') && l.aRegarder[1].includes(' plus ' + nPath + ' violet pathways') && l.aRegarder[1].includes('the ' + nParts + ' parcels'), l.aRegarder[1]);
      const lost = C.lostWiring === 'none' ? 0 : C.lostWiring.split(' ').length; assert.equal(l.aRegarder[1].includes('none for ' + lost + ' of its regions'), lost > 0, 'lost ' + lost);
      assert.equal(l.enUnePhrase.includes(C.theoryShownWiring + ', not data: '), th > 0, 'theory said');
      vus++;
    }
    return vus + ' legends checked at 414';
  });
  return res;
}

let n = 0; const ech = [];
const V0 = await import('./tam-vue.js'), L0 = await import('./tam-legendes.js'), O0 = readFileSync(join(ICI, 'tam-onglet.js'), 'utf8').replace(/\r\n/g, '\n');
for (const r of suite(V0, L0, O0)) { n++; console.log((r.ok ? 'OK    ' : 'ECHEC ') + r.nom + (r.d ? '  ' + r.d : '')); if (!r.ok) ech.push(r); }
const MUT = [
  ['tam-vue.js', 'indexes ignored : always null', 'if (!s || !Number.isInteger(s.ia) || !Number.isInteger(s.ib)) return null;', 'return null;'],
  ['tam-vue.js', 'out-of-range kept', 'if (ia.length >= SEGMENTS_MAX || s.ia < 0 || s.ib < 0 || s.ia >= n || s.ib >= n) continue;', 'if (ia.length >= SEGMENTS_MAX) continue;'],
  ['tam-vue.js', 'line drawn to the first end twice', 'g.moveTo(sx[a], sy[a]); g.lineTo(sx[b], sy[b]); traits++;', 'g.moveTo(sx[a], sy[a]); g.lineTo(sx[a], sy[a]); traits++;'],
  ['tam-vue.js', 'NaN points drawn', "if (!Number.isFinite(sx[a]) || !Number.isFinite(sy[a]) || !Number.isFinite(sx[b]) || !Number.isFinite(sy[b])) continue;", ''],
  ['tam-onglet.js', 'tab back to the coordinate path', 'const si = indexables() ? V.segmentsIndexes(S.o.segments, S.n) : null;', 'const si = null;'],
  ['tam-onglet.js', 'tab draws from its own projection', 'V.dessinerSegmentsIndexes(g, si, projSx, projSy, { dpr })', 'V.dessinerSegmentsIndexes(g, si, projSy, projSx, { dpr })'],
  ['tam-legendes.js', 'legend: adults hard-coded wrong', "' in ' + K.subjects + ' adults, opacity = strength", "' in 205 adults, opacity = strength"],
  ['tam-legendes.js', 'legend: shared names from the regions', "'. Shared within this pack: ' + (e.shared.length ? e.shared.map(nm)", "'. Shared within this pack: ' + (e.shared.length ? e.regions.map(nm)"],
  ['tam-legendes.js', 'legend: own colour sentence ignored', 'const couleurs = (e.couleurs ? val0(e.couleurs, params) : ', 'const couleurs = (false ? val0(e.couleurs, params) : '],
  ['tam-legendes.js', 'legend: always the wiring',"const net = Math.round(Number(P.networkWiring)) === 1,", 'const net = false,'],
];
const absolu = (src) => src.replace(/from '\.\/([^']+)'/g, (_, f) => `from '${pathToFileURL(join(ICI, f)).href}'`);
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-cerveau-lignes-mut-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUT.length; i++) {
    const [f, nom, de, vers] = MUT[i], src = readFileSync(join(ICI, f), 'utf8').replace(/\r\n/g, '\n'), k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NOT APPLIED (pattern found ${k} times) -> SURVIVES`); continue; }
    const mut = src.replace(de, () => vers); let r;
    try {
      if (f === 'tam-onglet.js') r = suite(V0, L0, mut);
      else { const p = join(dossier, `m${i + 1}-${f.replace('.js', '.mjs')}`); writeFileSync(p, absolu(mut)); const M = await import(pathToFileURL(p).href); r = f === 'tam-vue.js' ? suite(M, L0, O0) : suite(V0, M, O0); }
    } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok); if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'KILLED' : 'SURVIVES'} (${rouges.length} red${rouges.length ? ', e.g. ' + rouges[0].nom.slice(0, 70) : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
n++; if (tues !== MUT.length) ech.push({ nom: 'mutants', d: tues + '/' + MUT.length });
console.log(`\nMUTANTS : ${tues}/${MUT.length} killed`);

/* 09/11: the brut was the first 1,500 points, cycled: 18 of 48 settings made more (up to 7,448) and the firing events, which come last,
 *  were cut without a word. Now every place, then the events, all of them or EVENLY sampled to fit 3,500 points: TamArt's MAX_DATA is
 *  16,384 bytes (measured below with the real encoder, tam-science.rejouerScience, at every setting). */
const SC = await import('./tam-science.js');
function pointsSuite(TM) {
  const out = [], ok2 = (nom, f) => { try { out.push({ nom, ok: true, d: f() }); } catch (e) { out.push({ nom, ok: false, d: (e && e.message || String(e)).slice(0, 300) }); } };
  ok2('every place kept, events all or evenly sampled, n <= 3,500 : brut = n x 3, no gap', () => {
    let vus = 0, plusDe1500 = 0, echant = 0, max = 0;
    for (const resolutionWiring of [0, 1]) for (const travelWiring of [0, 1]) for (let packWiring = 0; packWiring < 6; packWiring++) for (const theoryWiring of [0, 4]) for (const compareWiring of [0, 1]) {
      const o = TM.simuler('emotionWiringHCP', { packWiring, emotionWiring: 0, compareWiring, networkWiring: 0, travelWiring, resolutionWiring, theoryWiring }), C = o.invariants.emotionWiringHCP;
      const m = C.drawnWiring.match(/^(\d+) points: (\d+) places, (\d+) of (\d+) firing events( \(evenly sampled\))?$/); assert.ok(m, C.drawnWiring);
      const [x, fixed, kept, events] = m.slice(1, 5).map(Number);
      assert.ok(x === fixed + kept && o.n === x && o.brut.length === 3 * x && x <= 3500 && kept === Math.min(events, 3500 - fixed) && kept > 0 && !!m[5] === (kept < events),
        JSON.stringify({ resolutionWiring, travelWiring, packWiring, theoryWiring, compareWiring, n: o.n, d: C.drawnWiring }));
      assert.equal(C.mesure, 0, 'gaps');
      vus++; if (x > 1500) plusDe1500++; if (kept < events) echant++; max = Math.max(max, x);
    }
    assert.ok(plusDe1500 > 0 && echant > 0, 'some settings above 1,500 points, some sampled');
    return vus + ' settings, ' + plusDe1500 + ' above 1,500, ' + echant + ' sampled, max ' + max;
  });
  ok2('sampleEvenly : first kept, spread over the whole run, all when it fits', () => {
    assert.deepEqual(TM.sampleEvenly(10, 5), [0, 2, 4, 6, 8]); assert.deepEqual(TM.sampleEvenly(3, 5), [0, 1, 2]); assert.deepEqual(TM.sampleEvenly(7, 0), []);
    const k = TM.sampleEvenly(6311, 1430); assert.ok(k.length === 1430 && k[0] === 0 && k[k.length - 1] > 6311 - 6311 / 1430 - 1 && k.every((v, j) => j === 0 || v > k[j - 1]));
  });
  ok2('outline = the real surfaces, denser : 1281 cortex and 304 deep-structure points', () => {
    const C = TM.simuler('emotionWiringHCP', {}).invariants.emotionWiringHCP; assert.equal(C.silhouetteWiring, '1281 cortex and 304 deep-structure points'); return C.drawnWiring;
  });
  return out;
}
/* the minted bytes, with the REAL encoder, at every setting (not under mutation: tam-science imports the real tam-maths) */
{ let maxO = 0, vus = 0;
  for (const resolutionWiring of [0, 1]) for (const travelWiring of [0, 1]) for (let packWiring = 0; packWiring < 6; packWiring++) for (const theoryWiring of [0, 4]) for (const compareWiring of [0, 1]) {
    const P = SC.paramsScience('emotionWiringHCP', { packWiring, emotionWiring: 0, compareWiring, networkWiring: 0, travelWiring, resolutionWiring, theoryWiring }, { minteur: '0x' + 'ab'.repeat(20) });
    const r = SC.rejouerScience(JSON.parse(JSON.stringify(P))); maxO = Math.max(maxO, r.octets.length); vus++;
  }
  n++; const bon = maxO <= 16384; console.log((bon ? 'OK    ' : 'ECHEC ') + 'minted bytes <= MAX_DATA (16,384) at every setting  ' + vus + ' settings, max ' + maxO + ' bytes');
  if (!bon) ech.push({ nom: 'MAX_DATA', d: maxO }); }
const MATHS = readFileSync(join(ICI, 'tam-maths.js'), 'utf8').replace(/\r\n/g, '\n');
for (const r of pointsSuite(T)) { n++; console.log((r.ok ? 'OK    ' : 'ECHEC ') + r.nom + (r.d ? '  ' + r.d : '')); if (!r.ok) ech.push(r); }
const MUT_MATHS = [
  ['budget lifted (12,000)', 'WIRING_POINTS_MAX = 3500;', 'WIRING_POINTS_MAX = 12000;'],
  ['events cut at the end again', 'return Array.from({ length: k }, (_, j) => Math.floor(j * total / k));', 'return Array.from({ length: k }, (_, j) => j);'],
  ['places cut to fit', 'const keptIdx = sampleEvenly(events, Math.max(0, WIRING_POINTS_MAX - fixedPts))', 'const keptIdx = sampleEvenly(events, Math.max(1, WIRING_POINTS_MAX - fixedPts - 400))'],
  ['simuler ignores the subject\'s own n', 'if (Number.isSafeInteger(r.n) && r.n >= 2 && r.brut && r.brut.length === r.n * r.D) n = r.n;', ''],
];
const dossierM = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-cerveau-points-mut-'));
let tuesM = 0;
try {
  for (let i = 0; i < MUT_MATHS.length; i++) {
    const [nom, de, vers] = MUT_MATHS[i], k = MATHS.split(de).length - 1;
    if (k !== 1) { console.log(`  P${i + 1} ${nom} : NOT APPLIED (pattern found ${k} times) -> SURVIVES`); continue; }
    const p = join(dossierM, `p${i + 1}-tam-maths.mjs`); writeFileSync(p, absolu(MATHS.replace(de, () => vers)));
    let r; try { r = pointsSuite(await import(pathToFileURL(p).href)); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok); if (rouges.length) tuesM++;
    console.log(`  P${i + 1} ${nom} : ${rouges.length ? 'KILLED' : 'SURVIVES'} (${rouges.length} red${rouges.length ? ', e.g. ' + rouges[0].d.slice(0, 90) : ''})`);
  }
} finally { rmSync(dossierM, { recursive: true, force: true }); }
n++; if (tuesM !== MUT_MATHS.length) ech.push({ nom: 'point mutants', d: tuesM + '/' + MUT_MATHS.length });
console.log(`POINT MUTANTS : ${tuesM}/${MUT_MATHS.length} killed`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.d || '')); process.exit(1); }
console.log(`test-tam-cerveau-lignes-20261108 : ${n} assertions OK`);
