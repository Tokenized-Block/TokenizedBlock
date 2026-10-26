// test-brain-space-20261026 — game57 #4b (b): INSIDE the brain is the continuation of the 3D map.
//   A. map3d.js exposes ITS camera as pure functions (rotateCam, projectCam, camFocal, easeCam, skyStars) and uses them itself:
//      the map and the brain view project with THE SAME engine (same numbers, bit for bit).
//   B. vision-dedans.js: projeterNeurones goes through projectCam; panCam (move), mapPose (the map's camera heading),
//      flightPose (map -> inside fly, or back; reduced motion = a cut), spaceScene (neurons, inputs, REAL neighbours) changes no
//      value: "not read" stays "not read", a neighbour stays "not read by its neurons".
//   C. app.html: opening = a fly from the map's camera; Back to map = a fly back then close (a cut with reduced motion);
//      Take control = free space (orbit, zoom, pan) on the snapshot; painting writes nothing.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const M = await import(new URL('map3d.js', DIR));
const V = await import(new URL('vision-dedans.js', DIR));
const map3d = read('map3d.js'), app = read('app.html');

/* A */
for (const k of ['rotateCam', 'projectCam', 'camFocal', 'easeCam', 'skyStars']) ok(typeof M[k] === 'function', 'A: map3d exports ' + k);
{
  const cam = { yaw: 0.65, pitch: -0.42, dist: 5000, ox: 3, oy: -2 }, L = 1200, H = 700;
  /* map3d.js#projeter's formula, copied as it was */
  const ref = (x, y, z) => { const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp, zc = z2 + cam.dist;
    if (zc < 40) return null; const f = 0.5 * Math.max(L, H); return { sx: L / 2 + cam.ox + x1 * f / zc, sy: H / 2 + cam.oy + y2 * f / zc, zc, z2, k: f / zc }; };
  for (const p of [[100, -200, 300], [-2500, 800, -900], [0, 0, -4990]]) ok(JSON.stringify(M.projectCam(cam, ...p, L, H)) === JSON.stringify(ref(...p)), 'A: projectCam = the map projection ' + p);
  ok(M.camFocal(1200, 700) === 600, 'A: focal = 0.5 x max(L, H)');
  const s1 = M.skyStars(), s2 = M.skyStars();
  ok(s1.length === 260 && JSON.stringify(s1) === JSON.stringify(s2), 'A: the same sky, fixed seed');
  const e = M.easeCam({ yaw: 0, pitch: 0, dist: 10, ox: 0, oy: 0 }, { yaw: 1, pitch: 0, dist: 0, ox: 0, oy: 0 }, 0.14);
  ok(Math.abs(e.yaw - 0.14) < 1e-12 && Math.abs(e.dist - 8.6) < 1e-12, 'A: easeCam = the map smoothing (q = 0.14)');
}
ok(/function tourner\(x, y, z\) \{ return rotateCam\(cam, x, y, z\); \}/.test(map3d), 'A: the map rotates with rotateCam');
ok(/function projeter\(x, y, z, L, H\) \{ return projectCam\(cam, x, y, z, L, H, 40\); \}/.test(map3d), 'A: the map projects with projectCam');
ok(/const ETOILES = skyStars\(\);/.test(map3d), 'A: the map draws the sky from skyStars');
ok(/camera: \(\) => \(\{ yaw: cam\.yaw, pitch: cam\.pitch \}\)/.test(map3d), 'A: the engine reports its heading (read-only)');

/* B */
for (const k of ['panCam', 'mapPose', 'flightPose', 'spaceScene']) ok(typeof V[k] === 'function', 'B: vision-dedans exports ' + k);
{
  const cam = { yaw: 0.3, pitch: -0.2, dist: 0.9, ox: 12, oy: -4 };
  const p = V.projeterNeurones([[0.1, 0.2, 0.3]], cam, 400, 300)[0], q = M.projectCam(cam, 0.1, 0.2, 0.3, 400, 300, 0.05);
  ok(p && q && p.x === q.sx && p.y === q.sy, 'B: neurons are projected by the map engine');
  const t = V.panCam(V.camLibre(), 30, -20);
  ok(t.ox === 30 && t.oy === -20 && t.dist === V.camLibre().dist && t.yaw === 0, 'B: panCam moves, does not rotate');
  ok(V.panCam(V.camLibre(), 9999, -9999).ox === 600 && V.panCam(V.camLibre(), 9999, -9999).oy === -600, 'B: pan is bounded');
  const mp = V.mapPose({ yaw: 1.1, pitch: -0.42 });
  ok(mp.yaw === 1.1 && mp.pitch === -0.42 && mp.dist > 4, 'B: the start pose = the map heading, from afar');
  ok(V.mapPose(null).dist > 4 && Number.isFinite(V.mapPose(null).yaw), 'B: without a map, an outside pose');
  const from = V.mapPose({ yaw: 1.1, pitch: -0.42 }), to = { yaw: 0, pitch: 0, dist: 0.35, ox: 0, oy: 0 };
  ok(JSON.stringify(V.flightPose(from, to, 0, false)) === JSON.stringify(from) && JSON.stringify(V.flightPose(from, to, 1, false)) === JSON.stringify(to), 'B: flightPose goes from the map to inside');
  ok(V.flightPose(from, to, 0.5, false).dist < from.dist && V.flightPose(from, to, 0.5, false).dist > to.dist, 'B: mid-flight, in between');
  ok(JSON.stringify(V.flightPose(from, to, 0, true)) === JSON.stringify(to), 'B: reduced motion = a cut, no flight');
  const pos = Array.from({ length: 128 }, (_, i) => [Math.cos(i), Math.sin(i), 0.1]);
  const inputs = [{ key: 'vie', label: 'Life', read: true, text: '10.017' }, { key: 'gm', label: 'Transfers', read: false, text: 'not read yet' }];
  const neighbours = [{ adr: '0x' + 'ab'.repeat(20), sym: 'X', x: 2, y: 0, z: 1, lu: false }];
  const s = V.spaceScene({ pos, inputs, neighbours });
  ok(s.filter((o) => o.kind === 'neuron').length === 128 && s.filter((o) => o.kind === 'input').length === 2 && s.filter((o) => o.kind === 'neighbour').length === 1, 'B: neurons, inputs, neighbours in one space');
  const g = s.find((o) => o.key === 'gm'), v = s.find((o) => o.kind === 'neighbour');
  ok(g.read === false && g.text === 'not read yet', 'B: an unread input stays "not read yet"');
  ok(v.read === false && v.note === 'not read by its neurons' && v.x === 2, 'B: a real neighbour, in its place, never said to be read');
  ok(s.filter((o) => o.kind === 'input').every((o) => Math.hypot(o.x, o.y, o.z) > 1.2), 'B: inputs outside the neuron sphere');
  ok(V.spaceScene({}).length === 0, 'B: nothing given, nothing drawn');
}

/* C */
const extract = (header) => { const i = app.indexOf(header); ok(i > 0, 'extraction found: ' + header); const f = /\n\}/.exec(app.slice(i)); return app.slice(i, i + f.index + 2); };
const back = extract('function bvBackToMap() {');
for (const reduced of [true, false]) {
  let closed = 0; const vision = { controle: null, vue: 'dedans' };
  const f = new Function('vision', '$', 'bvReduit', 'performance', 'currentCam', 'mapPose', 'moteur3d', back + '\nbvBackToMap(); return vision;');
  const out = f(vision, (s) => (s === '#bvPop' ? { close: () => { closed++; } } : {}), () => reduced, { now: () => 1000 }, () => ({ yaw: 0, pitch: 0, dist: 0.35, ox: 0, oy: 0 }), V.mapPose, { camera: () => ({ yaw: 0.7, pitch: -0.4 }) });
  if (reduced) ok(closed === 1 && !out.backFlight, 'C: Back to map with reduced motion: the window closes, no flight');
  else ok(closed === 0 && out.backFlight && out.backFlight.t0 === 1000 && out.backFlight.to.yaw === 0.7, 'C: Back to map: a flight back to the map heading, then close');
}
const paint = extract('function bvPeindre3D(t) {');
ok(/BV_STARS/.test(paint) && /spaceScene\(/.test(paint), 'C: painting = the map sky + the scene (neurons, inputs, neighbours)');
ok(!/fetch\(|localStorage\.setItem|rpc\(|eth_|sendTransaction|signer/.test(paint), 'C: painting writes nothing and reads nothing from the network');
ok(/const BV_STARS = skyStars\(\);/.test(app), 'C: the sky comes from map3d.js#skyStars');
const open = extract('function ouvrirVision(source) {');
ok(/vision\.flightFrom = mapPose\(moteur3d && typeof moteur3d\.camera === 'function' \? moteur3d\.camera\(\) : null\);/.test(open) && /vision\.vue = 'dedans';/.test(open), 'C: on open, the flight starts at the map camera and goes inside');
const pan = extract('function bvPanControl(dx, dy) {');
ok(/panCam\(vision\.controle\.cam, dx, dy\)/.test(pan) && /if \(!vision\.controle\) return;/.test(pan), 'C: pan only in Take control (local snapshot)');
ok(/e\.button === 2 \|\| e\.shiftKey/.test(app), 'C: right button or Shift = pan, like the map');
ok(/id="bvBackToMap"/.test(app), 'C: the Back to map button');
console.log('test-brain-space-20261026: ' + count + ' assertions, OK');
