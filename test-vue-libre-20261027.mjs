// test-vue-libre-20261027.mjs — owner 2026-10-27: "let us roam inside the box even when the brain is live".
// The camera the viewer moves survives every live beat; gestures are never gated on pause / snapshot; Reset view puts it back;
// neighbours are the Map's own blocks (dessinMap), a pinned one stops spinning. Mutants run on COPIES (VL_APP).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const DIR = new URL('./', import.meta.url);
const app = readFileSync(process.env.VL_APP || new URL('app.html', DIR), 'utf8').replace(/\r\n/g, '\n');
const VI = await import(new URL('vision-inside.js', DIR));
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const fn = (name, end) => { const a = app.indexOf('function ' + name + '('); assert.ok(a >= 0, 'missing ' + name); return app.slice(a, end ? app.indexOf(end, a) : app.indexOf('\n}\n', a) + 2); };

/* 1. pure: a gesture moves the viewer's camera from the pose shown; nothing else */
const from = { yaw: 0, pitch: 0, dist: 0.35 };
const c1 = VI.navGesture(null, from, { dx: 50, dy: 20 });
ok(c1.yaw === 0.5 && Math.abs(c1.pitch - 0.2) < 1e-12 && c1.dist === 0.35 && from.yaw === 0, 'drag orbits from the pose shown, the pose is not touched');
ok(VI.navGesture(c1, from, { dz: 1 }).dist > c1.dist && VI.navGesture(c1, from, { dz: -1 }).dist < c1.dist, 'wheel / pinch flies');
const c2 = VI.navGesture(c1, from, { dx: 10, dy: -5, pan: true });
ok(c2.ox === 10 && c2.oy === -5 && c2.yaw === c1.yaw, 'pan moves, keeps the angle');
ok(Number.isFinite(VI.navGesture(null, null, { dx: NaN, dz: NaN }).yaw), 'NaN gesture -> no NaN camera');

/* 2. behaviour of the page's currentCam: once moved, a live beat (any flight / pose state) shows the viewer's camera */
const cc = fn('currentCam');
const currentCam = new Function('vision', 'bvReduit', 'cameraPose', 'flightPose', 'FLIGHT_MS', 'mapPose', 'performance', cc + '\nreturn currentCam;')(
  null, () => false, VI.cameraPose, VI.flightPose, VI.FLIGHT_MS, VI.mapPose, { now: () => 5000 });
const mk = (vision) => new Function('vision', 'bvReduit', 'cameraPose', 'flightPose', 'FLIGHT_MS', 'mapPose', 'performance', cc + '\nreturn currentCam;')(
  vision, () => false, VI.cameraPose, VI.flightPose, VI.FLIGHT_MS, VI.mapPose, { now: () => 5000 });
void currentCam;
const vis = { vue: 'dedans', nav: c2, flight: 4000, flightFrom: VI.mapPose(null), control: null, backFlight: null };
ok(mk(vis)(5000) === c2, 'live: the camera shown is the one the viewer left');
ok(mk({ ...vis, nav: null })(5000) !== c2, 'not moved: the pose of the view');

/* 3. no live-beat path touches it: peindreVision, the beat timer, bvAdvance, bvPaint3D */
for (const [n, e] of [['peindreVision', '/* ══ THE 3D SCENE'], ['bvRestartTimer'], ['bvAdvance'], ['bvPaint3D', 'function bvStartLoop(']]) ok(!/vision\.nav\s*=/.test(fn(n, e)), n + ' never resets the viewer camera');
const resets = (app.match(/vision\.nav\s*=\s*(null|navGesture)/g) || []).length;
ok(resets === 4, 'vision.nav is set in exactly 4 places: gesture, Reset view, opening, view change (' + resets + ')');
ok(/vision\.nav = null/.test(fn('bvResetView')) && /\$\('#bvResetView'\)\.addEventListener\('click', bvResetView\)/.test(app) && /id="bvResetView"/.test(app), 'Reset view exists and is wired');

/* 4. gestures are never gated on pause / snapshot */
const g = app.slice(app.indexOf('(function bvCameraGestures()'), app.indexOf("$('#bvJouer').addEventListener"));
const pd = g.slice(g.indexOf("addEventListener('pointerdown'"), g.indexOf("addEventListener('pointermove'"));
const wh = g.slice(g.indexOf("addEventListener('wheel'"));
ok(!/vision\.(control|jouer|suivre)/.test(pd) && !/vision\.(control|jouer|suivre)/.test(wh.split('\n')[0]), 'pointerdown and wheel are not gated on pause / snapshot');
ok(/if \(!vision\.control\) \{ bvNavGesture\(\{ dx, dy, dz \}\); return; \}/.test(fn('bvControlGesture')) && /if \(!vision\.control\) \{ bvNavGesture\(\{ dx, dy, pan: true \}\); return; \}/.test(fn('bvPanControl')), 'outside a snapshot, a gesture moves the live camera');
ok(!/vision\.jouer\s*=|vision\.suivre\s*=/.test(fn('bvNavGesture')), 'a gesture never pauses or stops following live');
ok(/touches\.size === 2/.test(g) && /\(pinch - d\) \/ 40/.test(g) && /bvPanControl\(mx - prev\.x, my - prev\.y\)/.test(g), 'two fingers: pinch flies, drag moves');
ok(/if \(moved > 6\) \{ moved = 0; return; \}/.test(g), 'the end of a drag is not a click (the pin stays)');
ok(/#bv3d\{[^}]*touch-action:none/.test(app), 'touch-action none on the canvas only');

/* 5. neighbours = the Map's own block; a pinned one stops spinning; "not read" kept */
const nb = fn('bvNeighbourBlock');
ok(/dessinMap\(o\.adr, o\.sym\)/.test(nb) && /el\.className = 'bloc bvNb'/.test(nb) && /dataset\.block = o\.adr/.test(nb) && /poserMesSkins\(\)/.test(nb), 'the Map\'s cube, skin by the Map\'s owner rule');
ok(/classList\.toggle\('fige', vision\.pinned === 'neighbour:' \+ o\.adr\)/.test(nb) && /\.bvNb\.fige \.c3r[^{]*\{animation-play-state:paused\}/.test(app), 'pinned neighbour = spin paused');
ok(/' · not read'/.test(nb), 'the "not read" tag stays');
ok(/vision\.pinned = hit && hit\.id !== vision\.pinned \? hit\.id : null/.test(g), 'click again releases');
ok(/@media \(prefers-reduced-motion: reduce\)\{\.c3r,\.c3o\{animation:none\}\}/.test(readFileSync(new URL('cube3d.js', DIR), 'utf8')), 'reduced motion: the Map cube stays still');

console.log('test-vue-libre-20261027: ' + count + ' checks OK');

if (!process.env.VL_APP) {
  const me = fileURLToPath(import.meta.url), here = fileURLToPath(DIR);
  const mutants = [
    ['mut-vl-beat-reset.tmp.html', app.replace("  vision.c = c; vision.vu = vuShown;", "  vision.nav = null; vision.c = c; vision.vu = vuShown;")],
    ['mut-vl-pause-gate.tmp.html', app.replace("  cv.addEventListener('pointerdown', (e) => {\n", "  cv.addEventListener('pointerdown', (e) => {\n    if (!vision.control) return;\n")],
    ['mut-vl-wheel-gate.tmp.html', app.replace("cv.addEventListener('wheel', (e) => { e.preventDefault();", "cv.addEventListener('wheel', (e) => { if (vision.jouer) return; e.preventDefault();")],
    ['mut-vl-currentcam.tmp.html', app.replace('  if (vision.nav) return vision.nav;\n', '')],
    ['mut-vl-nofige.tmp.html', app.replace("el.classList.toggle('fige', vision.pinned === 'neighbour:' + o.adr);", '')],
  ];
  let dead = 0;
  for (const [file, body] of mutants) {
    if (body === app) { console.log('  MUTANT NOT APPLIED: ' + file); continue; }
    const path = here + file; writeFileSync(path, body);
    try { const r = spawnSync(process.execPath, [me], { env: { ...process.env, VL_APP: path }, encoding: 'utf8' }); if (r.status !== 0) dead++; else console.log('  MUTANT SURVIVED: ' + file); }
    finally { rmSync(path, { force: true }); }
  }
  console.log('mutants killed: ' + dead + '/' + mutants.length);
  assert.equal(dead, mutants.length, 'every mutant dies');
}
