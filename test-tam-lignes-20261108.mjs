// test-tam-lignes-20261108.mjs -- the OPTIONAL line channel of TAM (Phil 2026-11-08: "add lines to TAM, not only points").
// Run: node test-tam-lignes-20261108.mjs
// What it PROVES, on the REAL modules (imported, not read as text):
//   1. tam-vue.js#projeterSegments puts a line end exactly where the same raw row lands as a POINT (projeterVivant, the drawing path of the
//      points), with the hidden planes turning (t != 0), a layer switched off, D = 3 and D = 5 ; a line end OUTSIDE the cloud follows an
//      independent re-implementation of the transform (column scale, Givens cascade, frame of the POINTS alone).
//   2. segmentsValides drops non-finite ends, clamps w to 0..1, defaults w = 1, class 0 ; no segments / D = 2 -> null (nothing drawn).
//   3. paquetsSegments + dessinerSegments: ONE stroke per (class, weight bucket), every line drawn once, through the camera given, opacity
//      rising with the weight, depth 0 in the front view ; null -> no canvas call at all.
//   4. The subjects: only the six that carry lines return segments (every other tam-maths subject: none, so it is drawn exactly as before) ;
//      each set of lines is the object itself (the 1,190 measured connections between region points, weights = the measured strengths ; the
//      edges of the solids ; the roads of the Steiner network and their lengths ; the 2^n unit segments of the dragon ; the coloured edges of
//      K_n ; the parent -> child links of the Calkin-Wilf tree).
//   5. Mutants on COPIES of tam-vue.js and tam-maths.js: all must be killed.
// What it does NOT prove: the pixels (a browser) ; tam-onglet.js is checked as text only for the call order (lines under the points).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as TS from './tam-science.js';
import * as HB from './human-brain-data.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const AVEC_LIGNES = ['emotionWiringHCP', 'solidesPlatoniques', 'fermatSteiner', 'courbeDragon', 'ramseyR33', 'calkinWilf'];

/* independent reference of the view transform (written from the spec in tam-vue.js, not imported) */
function refVue(rows, pts, m, k, D, actives, angles, t) {
  const tourne = (x) => { const v = []; for (let j = 0; j < D; j++) v.push(actives && actives[j] === false ? 0 : (x[j] - m[j]) * k[j]);
    for (let q = D - 4; q >= 0; q--) { const th = (angles[q] ?? 0) + t * (1 + 0.17 * q), a = v[q], b = v[q + 3]; v[q] = Math.cos(th) * a - Math.sin(th) * b; v[q + 3] = Math.sin(th) * a + Math.cos(th) * b; }
    return [v[0], v[1], v[2]]; };
  const P = pts.map(tourne), lo = [0, 1, 2].map((c) => Math.min(...P.map((p) => p[c]))), hi = [0, 1, 2].map((c) => Math.max(...P.map((p) => p[c])));
  const r = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
  return rows.map((x) => tourne(x).map((v, c) => (v - (lo[c] + hi[c]) / 2) / r));
}
function nuageSynth(n, D, graine) { let s = graine >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rows = []; for (let i = 0; i < n; i++) { const r = []; for (let j = 0; j < D; j++) r.push((j + 1) * (rnd() - 0.4) + 0.3 * j); rows.push(r); } return rows; }
const aplatir = (rows, D) => { const b = new Float64Array(rows.length * D); rows.forEach((r, i) => r.forEach((v, j) => { b[i * D + j] = v; })); return b; };
function ctxEnregistreur() {
  const appels = []; const g = { appels };
  for (const f of ['beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'arc', 'fillRect']) g[f] = (...a) => appels.push([f, ...a]);
  return new Proxy(g, { set(o, p, v) { appels.push(['set', p, v]); o[p] = v; return true; } });
}

function suite(V, T, complet = true) {
  const res = [];
  const ok = (nom, f) => { let c = false, det = ''; try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = String(e && e.message || e).split('\n')[0]; } res.push({ nom, ok: c, det }); };

  /* 1. same transform as the points */
  for (const [D, actives, t, angles] of [[3, null, 0, []], [5, null, 0.7, [0.4, 1.3]], [5, [true, true, false, true, true], 1.9, [2.1, 0.2]], [3, [true, false, true], 0, []]]) {
    ok(`projection D=${D} t=${t} actives=${actives ? actives.join('') : 'all'} : line ends = the points they join ; outside ends = the reference`, () => {
      const n = 300, rows = nuageSynth(n, D, 7 + D), brut = aplatir(rows, D), { m, k } = TS.echelleIso(brut, n, D, 'synthetic'), z = TS.standardiserIso(brut, n, D, 'synthetic');
      const pos = V.projeterVivant({ z, n, D, actives, angles, t });
      const paires = [[0, 1], [5, 200], [299, 17], [42, 43]], loin = [rows[3].map((v) => 3 * v + 2), rows[9].map((v) => -2 * v - 1)];
      const segs = [...paires.map(([i, j], r) => ({ a: rows[i], b: rows[j], w: [0.2, 0.5, 0.9, 1][r], c: [0, 1, 2, 3][r] })), { a: loin[0], b: loin[1], w: 0.4, c: 5 }];
      const sv = V.projeterSegments({ segments: segs, m, k, z, n, D, actives, angles, t });
      assert.ok(sv && sv.q === segs.length, 'q');
      assert.deepEqual([...sv.classes], [0, 1, 2, 3, 5], 'classes kept'); assert.deepEqual([...sv.poids].map((w) => Math.round(w * 100)), [20, 50, 90, 100, 40], 'weights kept');
      let pire = 0;
      paires.forEach(([i, j], r) => { for (let c = 0; c < 3; c++) { pire = Math.max(pire, Math.abs(sv.xyz[6 * r + c] - pos[3 * i + c]), Math.abs(sv.xyz[6 * r + 3 + c] - pos[3 * j + c])); } });
      assert.ok(pire < 1e-9, 'ends vs points ' + pire);
      const ref = refVue(loin, rows, m, k, D, actives, angles, t); let pireRef = 0;
      for (let e = 0; e < 2; e++) for (let c = 0; c < 3; c++) pireRef = Math.max(pireRef, Math.abs(sv.xyz[6 * paires.length + 3 * e + c] - ref[e][c]));
      assert.ok(pireRef < 1e-9, 'outside ends vs reference ' + pireRef);
      /* the outside line really is outside the cloud (otherwise the frame test would prove nothing) */
      assert.ok(Math.max(...[0, 1, 2].map((c) => Math.abs(ref[0][c]))) > 1.2, 'outside ' + ref[0]);
      return 'worst ' + pire.toExponential(1) + ' / ' + pireRef.toExponential(1);
    });
  }
  ok('projection : the real brain, every line end on its region point (as drawn)', () => {
    const o = T.simuler('emotionWiringHCP', {}), D = o.D, n = o.n, { m, k } = TS.echelleIso(o.brut, n, D, 'emotionWiringHCP'), z = TS.standardiserIso(o.brut, n, D, 'emotionWiringHCP');
    const pos = V.projeterVivant({ z, n, D, actives: null, angles: [], t: 0 }), sv = V.projeterSegments({ segments: o.segments, m, k, z, n, D, actives: null, angles: [], t: 0 });
    const ou = new Map(); for (let i = 0; i < 89; i++) ou.set(o.brut[3 * i] + ',' + o.brut[3 * i + 1], i); /* 82 regions, then the 7 deep parts (game315) */
    let pire = 0;
    o.segments.forEach((s, r) => { const ia = s.ia ?? ou.get(s.a[0] + ',' + s.a[1]), ib = s.ib ?? ou.get(s.b[0] + ',' + s.b[1]); /* game316: two mirror regions can share (y, z) : the line names its points */
      for (let c = 0; c < 3; c++) pire = Math.max(pire, Math.abs(sv.xyz[6 * r + c] - pos[3 * ia + c]), Math.abs(sv.xyz[6 * r + 3 + c] - pos[3 * ib + c])); });
    assert.ok(sv.q === 1225 && pire < 1e-9, sv.q + ' ' + pire);
    return '1225 lines, worst ' + pire.toExponential(1);
  });

  /* 2. validation */
  ok('segmentsValides : non-finite dropped, w clamped, defaults, bad class -> 0', () => {
    const v = V.segmentsValides([{ a: [0, 0, 0], b: [1, 1, 1] }, { a: [0, NaN, 0], b: [1, 1, 1] }, { a: [0, 0], b: [1, 1, 1] }, null, { a: [0, 0, 0], b: [1, 1, Infinity] },
      { a: [0, 0, 0], b: [1, 1, 1], w: 7, c: 2 }, { a: [0, 0, 0], b: [1, 1, 1], w: -3, c: 99 }, { a: [0, 0, 0], b: [1, 1, 1], w: 'x', c: 1.5 }], 3);
    assert.deepEqual(v.map((s) => [s.w, s.c]), [[1, 0], [1, 2], [0, 0], [1, 0]]);
    assert.equal(V.segmentsValides(Array.from({ length: V.SEGMENTS_MAX + 5 }, () => ({ a: [0, 0, 0], b: [1, 0, 0] })), 3).length, V.SEGMENTS_MAX);
  });
  ok('projeterSegments : no segments, empty, all invalid, or D = 2 -> null (nothing drawn)', () => {
    const n = 50, rows = nuageSynth(n, 3, 3), brut = aplatir(rows, 3), { m, k } = TS.echelleIso(brut, n, 3, 'x'), z = TS.standardiserIso(brut, n, 3, 'x');
    for (const segments of [undefined, null, [], [{ a: [NaN, 0, 0], b: [0, 0, 0] }]]) assert.equal(V.projeterSegments({ segments, m, k, z, n, D: 3 }), null);
    const b2 = aplatir(nuageSynth(n, 2, 4), 2), e2 = TS.echelleIso(b2, n, 2, 'x');
    assert.equal(V.projeterSegments({ segments: [{ a: [0, 0], b: [1, 1] }], m: e2.m, k: e2.k, z: TS.standardiserIso(b2, n, 2, 'x'), n, D: 2 }), null);
  });

  /* 3. buckets and the drawing calls */
  ok('paquetsSegments : one group per (class, weight bucket), every line once, opacity rising with the weight', () => {
    const sv = { q: 9, xyz: new Float64Array(54), poids: Float32Array.from([0, 0.1, 0.3, 0.5, 0.74, 0.76, 1, 1, 0.99]), classes: Uint8Array.from([0, 0, 0, 1, 1, 1, 2, 2, 0]) };
    const P = V.paquetsSegments(sv), vus = P.flatMap((p) => p.indices).sort((a, b) => a - b);
    assert.deepEqual(vus, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(new Set(P.map((p) => p.classe + ':' + p.paquet)).size, P.length);
    assert.deepEqual(P.map((p) => p.classe + ':' + p.paquet).sort(), ['0:0', '0:1', '0:3', '1:2', '1:3', '2:3'].sort());
    for (const p of P) { assert.equal(p.couleur, V.COULEURS_SEGMENTS[p.classe]); for (const r of p.indices) assert.equal(p.paquet, Math.min(3, Math.floor(sv.poids[r] * 4))); }
    const a = (b) => P.find((p) => p.paquet === b).alpha; assert.ok(a(0) < a(1) && a(1) < a(3), 'alpha');
    assert.deepEqual(V.paquetsSegments(null), []);
  });
  ok('dessinerSegments : one stroke per group, each line once through the camera given, depth 0 in the front view, null -> no call', () => {
    const o = T.simuler('emotionWiringHCP', {}), D = 3, n = o.n, { m, k } = TS.echelleIso(o.brut, n, D, 'emotionWiringHCP'), z = TS.standardiserIso(o.brut, n, D, 'emotionWiringHCP');
    const sv = V.projeterSegments({ segments: o.segments, m, k, z, n, D, actives: null, angles: [], t: 0 }), P = V.paquetsSegments(sv);
    for (const aplati of [false, true]) {
      const g = ctxEnregistreur(), zs = [], ecran = (x, y, zz) => { zs.push(zz); return { sx: 100 + x * 2, sy: 50 + y * 3 }; };
      const traits = V.dessinerSegments(g, sv, ecran, { sc: 10, dpr: 2, aplati });
      const strokes = g.appels.filter((c) => c[0] === 'stroke').length, moves = g.appels.filter((c) => c[0] === 'moveTo'), lines = g.appels.filter((c) => c[0] === 'lineTo');
      assert.ok(traits === 1225 && strokes === P.length && moves.length === 1225 && lines.length === 1225, traits + ' ' + strokes + '/' + P.length);
      /* the r-th line of the first group goes from ecran(a) to ecran(b) */
      const r0 = P[0].indices[0]; assert.deepEqual(moves[0].slice(1), [100 + sv.xyz[6 * r0] * 10 * 2, 50 - sv.xyz[6 * r0 + 1] * 10 * 3]);
      assert.deepEqual(lines[0].slice(1), [100 + sv.xyz[6 * r0 + 3] * 10 * 2, 50 - sv.xyz[6 * r0 + 4] * 10 * 3]);
      if (aplati) assert.ok(zs.every((v) => v === 0), 'front view: depth 0'); else assert.ok(zs.some((v) => v !== 0), '3-D: depth kept');
      const alphas = g.appels.filter((c) => c[0] === 'set' && c[1] === 'globalAlpha').map((c) => c[2]);
      assert.deepEqual(alphas.slice(0, P.length), P.map((p) => p.alpha)); assert.equal(alphas[alphas.length - 1], 1);
    }
    const g0 = ctxEnregistreur(); assert.equal(V.dessinerSegments(g0, null, () => ({ sx: 0, sy: 0 })), 0); assert.equal(g0.appels.length, 0, 'no call');
    return P.length + ' strokes for 1225 lines';
  });

  /* 4. the subjects */
  /* the full sweep (153 subjects) runs once, not under every mutant (the mutants are aimed at the line code) */
  if (complet) ok('subjects : only the six with lines return segments ; every other tam-maths subject none (drawn as before)', () => {
    const avec = [];
    for (const s of T.SYSTEMES) { const o = T.simuler(s.id, {}, { n: 300 }); if (o.segments !== undefined) avec.push(s.id); }
    assert.deepEqual(avec.sort(), [...AVEC_LIGNES].sort());
    return T.SYSTEMES.length + ' subjects, ' + avec.length + ' with lines';
  });
  ok('emotionWiringHCP : 1,190 measured lines between region points (weights = measured strengths, 441 at w >= 8) and 35 violet named pathways, every pack and emotion', () => {
    for (let pk = 0; pk <= 5; pk++) for (let ek = 0; ek < [8, 4, 4, 2, 2, 2][pk]; ek++) for (const tr of [0, 1]) {
      const o = T.simuler('emotionWiringHCP', { packWiring: pk, emotionWiring: ek, travelWiring: tr }), reg = new Set();
      for (let i = 0; i < 82; i++) reg.add(o.brut[3 * i] + ',' + o.brut[3 * i + 1]);
      const meas = o.segments.filter((x) => x.c === 0), named = o.segments.filter((x) => x.c === 5);
      assert.ok(reg.size === 82 && meas.length === 1190 && named.length === 35 && meas.every((x) => reg.has(x.a[0] + ',' + x.a[1]) && reg.has(x.b[0] + ',' + x.b[1]) && x.w >= 0 && x.w <= 1), 'pack ' + pk + ' emotion ' + ek);
      assert.equal(meas.filter((x) => x.w >= (8 - 0.14292) / (12.615 - 0.14292) - 1e-12).length, 441);
    }
    { const o4 = T.simuler('emotionWiringHCP', { resolutionWiring: 1 }); assert.ok(o4.segments.filter((x) => x.c === 0).length === 6117 && o4.segments.every((x) => Number.isInteger(x.ia) && Number.isInteger(x.ib)), '414: 6117 lines'); }
    /* the weight of each line = the measured edge read here from human-brain-data.js (not from the subject's own parse) */
    const o = T.simuler('emotionWiringHCP', {}), meas = o.segments.filter((x) => x.c === 0);
    assert.ok(meas.every((x, r) => Math.abs(x.w - (HB.WIRING[r][2] - 0.14292) / (12.615 - 0.14292)) < 1e-12), 'w = measured');
  });
  ok('solidesPlatoniques : the edges (6, 12, 12, 30, 30), equal lengths, ends on the circumsphere', () => {
    const out = [];
    for (let s = 0; s <= 4; s++) { const o = T.simuler('solidesPlatoniques', { solide: s }), L = o.segments.map((g) => Math.hypot(g.a[0] - g.b[0], g.a[1] - g.b[1], g.a[2] - g.b[2]));
      const R = o.segments.flatMap((g) => [Math.hypot(...g.a), Math.hypot(...g.b)]);
      assert.ok(o.segments.length === [6, 12, 12, 30, 30][s] && o.segments.length === o.invariants.euler.aretes, 'count ' + s);
      assert.ok(Math.max(...L) - Math.min(...L) < 1e-12 && Math.max(...R) - Math.min(...R) < 1e-12, 'lengths ' + s);
      out.push(o.segments.length); }
    return out.join(' ');
  });
  ok('fermatSteiner : green roads = the shortest network found (length), faint roads = the other shape', () => {
    for (const largeur of [0.6, 1, 1.3, 1.7]) {
      const o = T.simuler('fermatSteiner', { largeur }), len = (c) => o.segments.filter((g) => g.c === c).reduce((u, g) => u + Math.hypot(g.a[0] - g.b[0], g.a[1] - g.b[1]), 0);
      assert.ok(o.segments.length === 10 && Math.abs(len(4) - o.invariants.longueur.mesure) < 1e-12 && Math.abs(len(0) - o.invariants.plusLongs.autreForme) < 1e-12, 'L ' + largeur);
      assert.ok(o.segments.every((g) => (g.c === 4 ? g.w === 1 && g.a[2] === 0 : g.w < 1 && g.a[2] === 1)), 'classes ' + largeur);
    }
  });
  ok('courbeDragon : 2^n unit segments, chained end to start, none travelled twice', () => {
    for (const plis of [3, 8, 15]) {
      const o = T.simuler('courbeDragon', { plis }), S = o.segments, vu = new Set();
      assert.equal(S.length, 2 ** plis);
      S.forEach((g, q) => { assert.equal(Math.abs(g.a[0] - g.b[0]) + Math.abs(g.a[1] - g.b[1]), 1); if (q) assert.ok(S[q - 1].b[0] === g.a[0] && S[q - 1].b[1] === g.a[1], 'chain');
        const cle = Math.min(g.a[0], g.b[0]) + ',' + Math.min(g.a[1], g.b[1]) + ',' + (g.a[0] !== g.b[0] ? 'h' : 'v'); assert.ok(!vu.has(cle), 'twice'); vu.add(cle); });
    }
  });
  ok('ramseyR33 : the n(n-1)/2 edges of K_n, each in the colour of its points (red 0, blue 1, triangle 2)', () => {
    for (const [K, graine] of [[3, 1], [5, 7], [6, 1], [6, 99]]) {
      const o = T.simuler('ramseyR33', { sommetsK: K, graine });
      assert.equal(o.segments.length, K * (K - 1) / 2);
      /* each brut point lies on one segment: same label as that segment's colour - 1 */
      for (let l = 0; l < o.n; l += 37) { const x = o.brut[3 * l], y = o.brut[3 * l + 1], lab = o.brut[3 * l + 2];
        const sur = o.segments.find((g) => { const ux = g.b[0] - g.a[0], uy = g.b[1] - g.a[1], vx = x - g.a[0], vy = y - g.a[1], L2 = ux * ux + uy * uy, tt = (ux * vx + uy * vy) / L2;
          return tt >= -1e-9 && tt <= 1 + 1e-9 && Math.abs(ux * vy - uy * vx) / Math.sqrt(L2) < 1e-9 && g.a[2] === lab; });
        assert.ok(sur && sur.c === lab + 1, 'point ' + l + ' K ' + K); }
      if (K === 6) assert.equal(o.segments.filter((g) => g.c === 3).length, 3, 'one triangle');
    }
  });
  ok('calkinWilf : 2^D - 2 parent -> child links, one level down, children of a/b are a/(a+b) left and (a+b)/b right', () => {
    for (const niveaux of [5, 9, 14]) {
      const o = T.simuler('calkinWilf', { niveaux }), S = o.segments;
      assert.equal(S.length, 2 ** niveaux - 2);
      assert.ok(S.every((g) => Math.abs(g.b[1] - (g.a[1] - 1 / niveaux)) < 1e-12), 'one level down');
      /* the left child of a fraction is < 1 (label 0), the right child > 1 (label 1) */
      for (let i = 0; i < S.length; i += 2) assert.ok(S[i].b[2] === 0 && S[i + 1].b[2] === 1 && S[i].a[0] === S[i + 1].a[0] && S[i].b[0] < S[i + 1].b[0], 'children ' + i);
    }
  });
  return res;
}

const V = await import('./tam-vue.js'), T = await import('./tam-maths.js');
const res = suite(V, T), ech = res.filter((x) => !x.ok);
for (const r of res) console.log((r.ok ? 'OK    ' : 'ECHEC ') + r.nom + (r.det ? '  ' + r.det : ''));
let assertions = res.length;

/* tam-onglet.js (DOM, not importable here): the lines are drawn BEFORE the points loop, through `projeter` (the camera of the points) */
{ const o = readFileSync(join(ICI, 'tam-onglet.js'), 'utf8').replace(/\r\n/g, '\n'), iL = o.indexOf('V.dessinerSegments(g, sv, projeter, { sc, dpr, aplati: aplati() })'), iP = o.indexOf('const film = filmDe();\n    if (film) {');
  assertions++; if (!(iL > 0 && iP > iL)) ech.push({ nom: 'tam-onglet : lines drawn under the points, same camera', det: iL + ' ' + iP }); else console.log('OK    tam-onglet : lines drawn under the points, same camera'); }

/* mutants on COPIES (relative imports rewritten to the real files) */
const MUT_VUE = [
  ['vue : segments ignored', 'const S = segmentsValides(segments, D), q = S.length;', 'const S = [], q = 0;'],
  ['vue : column scale skipped', 'zc[(n + 2 * r) * D + j] = (S[r].a[j] - m[j]) * k[j];', 'zc[(n + 2 * r) * D + j] = S[r].a[j];'],
  ['vue : own frame instead of the points frame', 'for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const v = pr[3 * i + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }\n  const r0', 'for (let i = 0; i < n + 2 * q; i++) for (let c = 0; c < 3; c++) { const v = pr[3 * i + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }\n  const r0'],
  ['vue : hidden planes not turned for lines', 'const pr = projeterVivant({ z: zc, n: n + 2 * q, D, actives, angles, t });', 'const pr = projeterVivant({ z: zc, n: n + 2 * q, D, actives, angles, t: 0 });'],
  ['vue : layers ignored for lines', 'const pr = projeterVivant({ z: zc, n: n + 2 * q, D, actives, angles, t });', 'const pr = projeterVivant({ z: zc, n: n + 2 * q, D, actives: null, angles, t });'],
  ['vue : weights ignored', 'poids[r] = S[r].w;', 'poids[r] = 1;'],
  ['vue : classes ignored', 'poids[r] = S[r].w; classes[r] = S[r].c;', 'poids[r] = S[r].w; classes[r] = 0;'],
  ['vue : w not clamped', 'w: Number.isFinite(w) ? Math.max(0, Math.min(1, w)) : 1', 'w: Number.isFinite(w) ? w : 1'],
  ['vue : non-finite end kept', 'fini = Number.isFinite(s.a[j]) && Number.isFinite(s.b[j]);', 'fini = true;'],
  ['vue : one stroke per line', 'g.moveTo(u.sx, u.sy); g.lineTo(v.sx, v.sy); traits++;', 'g.moveTo(u.sx, u.sy); g.lineTo(v.sx, v.sy); g.stroke(); g.beginPath(); traits++;'],
  ['vue : depth kept in the front view', 'aplati ? 0 : X[o + 2] * sc', 'X[o + 2] * sc'],
  ['vue : y not flipped like the points', 'u = ecran(X[o] * sc, -X[o + 1] * sc,', 'u = ecran(X[o] * sc, X[o + 1] * sc,'],
  ['vue : alpha flat', 'alpha: 0.05 + 0.13 * g.paquet', 'alpha: 0.3'],
];
const MUT_MATHS = [
  ['maths : simuler drops segments', 'if (Array.isArray(r.segments) && r.segments.length) o.segments = r.segments;', ''],
  ['maths : brain lines weight flat', 'w: (e.w - lo) / (hi - lo), c: 0,', 'w: 0.5, c: 0,'],
  ['maths : brain lines off their regions', 'const segments = use.map((e) => ({ a: P3[e.i].slice(),', 'const segments = use.map((e) => ({ a: P3[e.i].map((v) => v + 0.01),'],
  ['maths : solid misses an edge', 'const segments = aretes.map(([i, j])', 'const segments = aretes.slice(1).map(([i, j])'],
  ['maths : Steiner colours swapped', 'w: 1, c: 4 }))', 'w: 1, c: 0 }))'],
  ['maths : dragon misses its last segment', 'for (let q = 0; q < segs; q++) segments.push', 'for (let q = 0; q < segs - 1; q++) segments.push'],
  ['maths : Ramsey one colour', 'c: lab + 1 }));', 'c: 1 }));'],
  ['maths : Calkin-Wilf child to itself', 'segments.push({ a: noeud(i), b: noeud(c) })', 'segments.push({ a: noeud(i), b: noeud(i) })'],
];
const absolu = (src) => src.replace(/from '\.\/([^']+)'/g, (_, f) => `from '${pathToFileURL(join(ICI, f)).href}'`);
const srcV = readFileSync(join(ICI, 'tam-vue.js'), 'utf8').replace(/\r\n/g, '\n'), srcM = readFileSync(join(ICI, 'tam-maths.js'), 'utf8').replace(/\r\n/g, '\n');
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-lignes-mutants-'));
let tues = 0; const total = MUT_VUE.length + MUT_MATHS.length;
console.log('\nMUTANTS :');
try {
  let i = 0;
  for (const [liste, src, cible] of [[MUT_VUE, srcV, 'vue'], [MUT_MATHS, srcM, 'maths']]) for (const [nom, de, vers] of liste) {
    i++; const k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i} ${nom} : NOT APPLIED (pattern found ${k} times) -> SURVIVES`); continue; }
    const f = join(dossier, `mutant-${i}.mjs`); writeFileSync(f, absolu(src.replace(de, () => vers)));
    let r; try { const mod = await import(pathToFileURL(f).href); r = cible === 'vue' ? suite(mod, T, false) : suite(V, mod, false); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok); if (rouges.length) tues++;
    console.log(`  M${i} ${nom} : ${rouges.length ? 'KILLED' : 'SURVIVES'} (${rouges.length} red${rouges.length ? ', e.g. ' + rouges.slice(0, 2).map((x) => x.nom.slice(0, 60)).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== total) ech.push({ nom: 'mutants', det: `${tues}/${total}` });
console.log(`\nMUTANTS : ${tues}/${total} killed`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-lignes-20261108 : ${assertions} assertions OK`);
