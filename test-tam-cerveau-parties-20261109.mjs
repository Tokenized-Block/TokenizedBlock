// test-tam-cerveau-parties-20261109.mjs -- the wired human brain of TAM coloured by PART (Phil 2026-11-09: "the TAM brain is still messy;
// parts of the brain, readable by people who don't understand").
// What it PROVES, on the REAL modules (imported): 1. the subject returns one class per point (pointClasses) into a palette that IS
//   human-brain-parts.js pointPalette() (same names, same colours as the brain map), at 192 settings, with no gap reported. 2. Each class is
//   the right one, recomputed here independently: a node = its region's part (a parcel: its majority region, DK_OF_400); a deep outline dot =
//   the part of the label its vertex carries; a cortex outline dot = the part of the nearest region centre on the same side (OUR rule); a
//   firing dot at a node = that node's part; an impulse dot (one third of the way) = the part of the node it LEFT. 3. The brut is unchanged:
//   sha256 of the 192 bruts = the value measured on 5697736 before this change. 4. The legend's colour key = the palette drawn; other subjects
//   have none. 5. tam-onglet.js draws the points by class with the palette colours on the plain path only (text checks: the tab needs a DOM),
//   and the legend renders the key. 6. Mutants on COPIES of the four modules: all must be killed.
// What it does NOT prove: the pixels (looked at in a browser, desktop and 375 px, see the report), or that the nearest-centre rule draws the
//   true borders (it does not: 334 of the 400 parcel centres get their majority region's part by that rule, measured once, said in the legend).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import * as HB from './human-brain-data.js';
import * as HA from './human-brain-anatomy.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const BRUT_SHA_5697736 = '673a0ec915c6841bb2deb95a6fa1f25bdf8c7239ab59df492da5f6e6baa734ba';
const SETTINGS = []; for (const resolutionWiring of [0, 1]) for (const travelWiring of [0, 1]) for (let packWiring = 0; packWiring < 6; packWiring++) for (const theoryWiring of [0, 4]) for (const compareWiring of [0, 1]) for (const networkWiring of [0, 1])
  SETTINGS.push({ packWiring, emotionWiring: 0, compareWiring, networkWiring, travelWiring, resolutionWiring, theoryWiring });
const N = HB.COUNTS.hcpRegions, ALL = HB.REGIONS.map((r) => r.id), NC = HA.ANATOMY_NAMES.length - 14;

function suite(T, H, L, onglet) {
  const out = [], ok = (nom, f) => { try { out.push({ nom, ok: true, d: f() }); } catch (e) { out.push({ nom, ok: false, d: String(e && e.message || e).slice(0, 300) }); } };
  /* independent reference: the part index of an id, straight from PARTS */
  const partIdx = (id) => { const s = String(id), base = /^[LR]_/.test(s) ? s.slice(2) : s; return H.PARTS.findIndex((p) => p.members.includes(base) || p.members.includes(s)); };
  ok('the palette is human-brain-parts PARTS: 12 parts, same ids, names and colours as the brain map', () => {
    const pal = H.pointPalette();
    assert.equal(pal.length, 12);
    assert.deepEqual(pal.map((p) => [p.id, p.name, p.color, p.knownFor]), H.PARTS.map((p) => [p.id, p.name, p.color, p.knownFor]));
    assert.equal(H.partIndexOf('L_insula'), 5); assert.equal(H.partIndexOf('Cerebellum'), 11); assert.equal(H.partIndexOf('nothing'), -1);
    for (const id of ALL) assert.equal(H.partIndexOf(id), partIdx(id), id);
    return pal.map((p) => p.id).join(' ');
  });
  ok('192 settings: one class per point, every class in the palette, palette = pointPalette(), no gap; the brut is the one of 5697736', () => {
    const h = createHash('sha256'), pal = H.pointPalette(); let vus = 0;
    for (const p of SETTINGS) {
      const o = T.simuler('emotionWiringHCP', p);
      assert.ok(o.pointClasses && o.pointClasses.length === o.n, 'one class per point');
      assert.ok(o.pointClasses.every((c) => c < o.pointPalette.length), 'class in palette');
      assert.deepEqual(o.pointPalette.map((x) => x.color + x.name), pal.map((x) => x.color + x.name));
      assert.equal(o.invariants.emotionWiringHCP.mesure, 0, 'gaps ' + JSON.stringify(p));
      h.update(Buffer.from(o.brut.buffer, o.brut.byteOffset, o.brut.byteLength)); vus++;
    }
    assert.equal(h.digest('hex'), BRUT_SHA_5697736, 'the brut changed');
    return vus + ' settings, brut sha256 unchanged';
  });
  ok('every class is the right one (nodes, deep parts, outline, firing and impulse dots), recomputed independently, 82 regions and 414 parcels', () => {
    let vus = 0, impulses = 0, cortexOut = 0;
    for (const p of SETTINGS.filter((s) => s.networkWiring === 0 && s.theoryWiring === 0 && s.packWiring < 3)) {
      const o = T.simuler('emotionWiringHCP', p), res = p.resolutionWiring === 1, NR = res ? 414 : N, cls = o.pointClasses, b = o.brut;
      const nodeId = (a) => (a < NR ? (res ? (a < 400 ? HB.DK_OF_400[a] : HB.REGIONS_400[a].id) : ALL[a]) : ALL[N + a - NR]);
      const XYZ = (a) => (a < NR ? (res ? HB.CENTROIDS_400[a] : HA.CENTROIDS[a]) : HB.POS3D[N + a - NR]), P3 = Array.from({ length: NR + ALL.length - N }, (_, a) => { const [x, y, z] = XYZ(a); return [y / 100, z / 100, x / 100]; });
      const want = P3.map((_, a) => partIdx(nodeId(a)));
      assert.ok(want.every((c) => c >= 0), 'every node has a part');
      for (let a = 0; a < P3.length; a++) assert.equal(cls[a], want[a], 'node ' + a + ' ' + nodeId(a));
      /* outline: cortex then deep, in the subject's order and steps */
      let k = P3.length;
      for (let v = 0; v < HA.CORTEX.length / 3; v += 8, k++) {
        const left = v < HA.CORTEX.length / 6, x = HA.CORTEX[3 * v], y = HA.CORTEX[3 * v + 1], z = HA.CORTEX[3 * v + 2];
        let best = -1, dm = Infinity; for (let r = 0; r < NC; r++) { if ((r < NC / 2) !== left) continue; const [cx, cy, cz] = HA.CENTROIDS[r], d = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2; if (d < dm) { dm = d; best = r; } }
        assert.equal(cls[k], partIdx(HA.ANATOMY_NAMES[best]), 'cortex outline ' + v); cortexOut++;
      }
      for (let v = 0; v < HA.DEEP.length / 4; v += 20, k++) assert.equal(cls[k], partIdx(HA.ANATOMY_NAMES[HA.DEEP[4 * v + 3]]), 'deep outline ' + v);
      /* every later dot: at a node -> that node's part; else an impulse a + (b - a) / 3 -> the part of a */
      const key = (x, y, z) => [x, y, z].map((v) => Math.round(v * 1e7)).join(','), at = new Map(); P3.forEach((q, a) => { if (!at.has(key(...q))) at.set(key(...q), []); at.get(key(...q)).push(a); });
      for (; k < o.n; k++) {
        const q = [b[3 * k], b[3 * k + 1], b[3 * k + 2]], here = at.get(key(...q));
        if (here) { assert.ok(here.some((a) => want[a] === cls[k]), 'dot ' + k + ' at a node, other part'); continue; }
        const src = P3.findIndex((pa, a) => want[a] === cls[k] && at.has(key(...pa.map((v, c) => 3 * q[c] - 2 * v))));
        assert.ok(src >= 0, 'impulse dot ' + k + ': no node of its class one third of the way'); impulses++;
      }
      vus++;
    }
    assert.ok(impulses > 0, 'impulse dots were checked');
    return vus + ' settings, ' + impulses + ' impulse dots, ' + cortexOut + ' cortex outline dots';
  });
  ok('the legend key = the palette drawn; other subjects have none; the colour sentence names parts, not directions', () => {
    const o = T.simuler('emotionWiringHCP', {}), l = L.legende('emotionWiringHCP', o.params);
    assert.deepEqual(l.pointColours.map((x) => [x.name, x.color]), o.pointPalette.map((x) => [x.name, x.color]));
    assert.ok(/every other dot wears the colour of the brain part it belongs to \(key below\)/.test(l.couleurs), l.couleurs);
    assert.ok(/nearest region centre on the same side: our approximation/.test(l.couleurs), 'the approximation is said');
    assert.ok(!/a position, not a function/.test(l.couleurs), 'direction sentence gone');
    assert.equal(L.legende('bodyMapsNummenmaa', {}).pointColours, null);
    assert.equal(T.simuler('bodyMapsNummenmaa', {}).pointClasses, undefined);
  });
  ok('tam-onglet.js: points by class on the plain path, palette colours, direction loop off; the legend draws the key', () => {
    assert.ok(onglet.includes("if (!S.science || !o || !o.pointClasses || o.pointClasses.length !== S.n || !Array.isArray(o.pointPalette) || !o.pointPalette.length || S.corps || (S.P && S.P.melange) || filmDe()) return null;"), 'guard');
    assert.ok(onglet.includes('return { classes: o.pointClasses, palette: o.pointPalette };'), 'returns the subject classes');
    assert.ok(onglet.includes('const pc = corps || film ? null : classesPoints();'), 'pc');
    assert.ok(onglet.includes('g.beginPath(); g.strokeStyle = g.shadowColor = pc.palette[c].color;'), 'palette colour');
    assert.ok(onglet.includes('for (let i = 0; i < n; i++) if (pc.classes[i] === c && Number.isFinite(projSx[i]))'), 'each point in its class');
    assert.ok(onglet.includes('for (let i = 1; i < (corps || film || pc ? 0 : n); i++)'), 'direction loop off when classes');
    assert.ok(onglet.indexOf('const pc = corps || film ? null : classesPoints();') > onglet.indexOf('projSx[i] = u ? u.sx : NaN'), 'after the projection');
    assert.ok(onglet.includes("el('i', { class: 'tamPastille', style: 'background:' + p.color })"), 'key swatch = the part colour');
    assert.ok(onglet.includes('...(parts ? [] : [el(\'i\', { class: \'tamPastille\', style: \'background:\' + V.couleurDim(j) })])'), 'no column swatch with a key');
    assert.ok(/\.\.\.cle,/.test(onglet), 'key rendered');
  });
  return out;
}

let n = 0; const ech = [];
const imp = (f) => import(pathToFileURL(join(ICI, f)).href);
const T0 = await imp('tam-maths.js'), H0 = await imp('human-brain-parts.js'), L0 = await imp('tam-legendes.js'), O0 = readFileSync(join(ICI, 'tam-onglet.js'), 'utf8').replace(/\r\n/g, '\n');
for (const r of suite(T0, H0, L0, O0)) { n++; console.log((r.ok ? 'OK    ' : 'ECHEC ') + r.nom + (r.d ? '  ' + r.d : '')); if (!r.ok) ech.push(r); }

const MUT = [
  ['tam-maths.js', 'parcels coloured by the 82-region index', 'partIndexOf(a < NR ? (res ? HB.REGIONS_400[a].dk || HB.REGIONS_400[a].id : all[a]) : all[N + a - NR])', 'partIndexOf(a < NR ? (res ? (all[a] || all[0]) : all[a]) : all[N + a - NR])'],
  ['tam-maths.js', 'impulse dot wears the part it reaches', 'pts.push(P3[a].map((v, c) => v + (P3[b][c] - v) / 3)); cls.push(nodeClass(a));', 'pts.push(P3[a].map((v, c) => v + (P3[b][c] - v) / 3)); cls.push(nodeClass(b));'],
  ['tam-maths.js', 'deep outline label ignored', 'cls.push(partIndexOf(HA.ANATOMY_NAMES[HA.DEEP[4 * v + 3]]));', 'cls.push(partIndexOf(HA.ANATOMY_NAMES[NC]));'],
  ['tam-maths.js', 'cortex outline on the wrong side', 'HA.CORTEX[3 * v + 2], v < half));', 'HA.CORTEX[3 * v + 2], v >= half));'],
  ['tam-maths.js', 'classes not following the sampling', 'pointClasses[k] = Math.max(0, cls[src]);', 'pointClasses[k] = Math.max(0, cls[k]);'],
  ['tam-maths.js', 'simuler drops the classes', 'o.pointClasses = r.pointClasses; o.pointPalette = r.pointPalette;', ''],
  ['tam-maths.js', 'seed second dot loses its class', 'if (isSeed.has(a)) { pts.push(P3[a].slice()); cls.push(nodeClass(a)); }', 'if (isSeed.has(a)) { pts.push(P3[a].slice()); }'],
  ['human-brain-parts.js', 'palette colour shifted', '.map((p) => Object.freeze({ id: p.id, name: p.name, color: p.color, knownFor: p.knownFor }))', '.map((p, k, A) => Object.freeze({ id: p.id, name: p.name, color: A[(k + 1) % A.length].color, knownFor: p.knownFor }))'],
  ['human-brain-parts.js', 'partIndexOf off by one', 'PARTS.findIndex((p) => p.id === pid); }', 'PARTS.findIndex((p) => p.id === pid) + 1; }'],
  ['tam-legendes.js', 'legend key dropped', 'pointColours: e.pointColours ? Object.freeze(val(e.pointColours).slice()) : null,', 'pointColours: null,'],
  ['tam-legendes.js', 'legend back to directions', "every other dot wears the colour of the brain part it belongs to (key below).", "every other dot takes the colour of its direction: a position, not a function."],
  ['tam-onglet.js', 'tab ignores the classes', 'return { classes: o.pointClasses, palette: o.pointPalette };', 'return null;'],
  ['tam-onglet.js', 'tab colours classes by direction', 'g.beginPath(); g.strokeStyle = g.shadowColor = pc.palette[c].color;', 'g.beginPath(); g.strokeStyle = g.shadowColor = V.couleurDim(c);'],
  ['tam-onglet.js', 'direction dots drawn over the classes', 'for (let i = 1; i < (corps || film || pc ? 0 : n); i++)', 'for (let i = 1; i < (corps || film ? 0 : n); i++)'],
  ['tam-onglet.js', 'classes under a blend', '|| S.corps || (S.P && S.P.melange) || filmDe()) return null;\n    return { classes', '|| S.corps || filmDe()) return null;\n    return { classes'],
  ['tam-onglet.js', 'key swatch by column colour', "el('i', { class: 'tamPastille', style: 'background:' + p.color })", "el('i', { class: 'tamPastille', style: 'background:' + V.couleurDim(0) })"],
];
const absolu = (src) => src.replace(/from '\.\/([^']+)'/g, (_, f) => `from '${pathToFileURL(join(ICI, f)).href}'`);
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-cerveau-parties-mut-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUT.length; i++) {
    const [f, nom, de, vers] = MUT[i], src = readFileSync(join(ICI, f), 'utf8').replace(/\r\n/g, '\n'), k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NOT APPLIED (pattern found ${k} times) -> SURVIVES`); continue; }
    const mut = src.replace(de, () => vers); let r;
    try {
      if (f === 'tam-onglet.js') r = suite(T0, H0, L0, mut);
      else {
        const p = join(dossier, `m${i + 1}-${f.replace('.js', '.mjs')}`); writeFileSync(p, absolu(mut)); const M = await import(pathToFileURL(p).href);
        /* a mutated human-brain-parts.js must reach tam-maths and tam-legendes too: copies importing the mutant */
        if (f === 'human-brain-parts.js') {
          const via = (g) => { const q = join(dossier, `m${i + 1}-${g.replace('.js', '.mjs')}`); writeFileSync(q, absolu(readFileSync(join(ICI, g), 'utf8')).split(pathToFileURL(join(ICI, 'human-brain-parts.js')).href).join(pathToFileURL(p).href)); return import(pathToFileURL(q).href); };
          r = suite(await via('tam-maths.js'), M, await via('tam-legendes.js'), O0);
        } else r = f === 'tam-maths.js' ? suite(M, H0, L0, O0) : suite(T0, H0, M, O0);
      }
    } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok); if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'KILLED' : 'SURVIVES'} (${rouges.length} red${rouges.length ? ', e.g. ' + rouges[0].nom.slice(0, 70) : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
n++; if (tues !== MUT.length) ech.push({ nom: 'mutants', d: tues + '/' + MUT.length });
console.log(`\nMUTANTS : ${tues}/${MUT.length} killed`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.d || '')); process.exit(1); }
console.log(`test-tam-cerveau-parties-20261109 : ${n} assertions OK`);
