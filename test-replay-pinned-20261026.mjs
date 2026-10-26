// test-replay-pinned-20261026 — game59 3: a replay is PINNED BY BEAT NUMBER. The brain keeps 64 beats; while a replay runs,
//   new beats push the oldest out and the window slides. The replay used to keep its INDEX (1 of 64), so the beat it showed
//   crept forward on its own. Now it keeps the beat's NUMBER (its tick), and when that beat is pushed out of the window it says
//   so: "beat N left the window", then goes on from the oldest beat still recorded.
//   A. vision-inside.js#replayPosition(histo, pinTick) and #nextPinned(histo, pinTick): pure, by tick.
//   B. app.html: peindreVision places the replay with replayPosition; bvAdvance steps by tick; the slider, Play and the
//      opening set or clear the pin; the "left the window" note is shown in the cursor text.
//   C. app.html's real bvAdvance + peindreVision placement statements, run on a sliding window.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const V = await import(new URL('vision-inside.js', DIR));
const app = read('app.html');
const fnOf = (name) => { const i = app.indexOf('function ' + name + '('); ok(i > 0, name + ' found'); return app.slice(i, i + app.slice(i).search(/\n\}/)); };
const windowAt = (first, n = 64) => Array.from({ length: n }, (_, k) => ({ tick: first + k, indices: [] }));

/* A */
ok(typeof V.replayPosition === 'function' && typeof V.nextPinned === 'function', 'A: vision-inside.js exports replayPosition and nextPinned');
{
  const w1 = windowAt(100), w2 = windowAt(103);
  ok(JSON.stringify(V.replayPosition(w1, 110)) === JSON.stringify({ i: 10, tick: 110, left: null }), 'A: beat 110 is index 10 of the window 100..163');
  ok(JSON.stringify(V.replayPosition(w2, 110)) === JSON.stringify({ i: 7, tick: 110, left: null }), 'A: the window slid by 3: beat 110 is still shown (index 7)');
  ok(JSON.stringify(V.replayPosition(w2, 101)) === JSON.stringify({ i: 0, tick: 103, left: 101 }), 'A: beat 101 left the window -> said, and the oldest beat (103) is shown');
  ok(JSON.stringify(V.replayPosition(w1, null)) === JSON.stringify({ i: 63, tick: 163, left: null }), 'A: no pin -> the latest beat');
  ok(JSON.stringify(V.replayPosition([], 5)) === JSON.stringify({ i: -1, tick: null, left: null }), 'A: no beat -> nothing');
  ok(JSON.stringify(V.nextPinned(w2, 110)) === JSON.stringify({ i: 8, tick: 111, live: false }), 'A: the next beat after 110 is 111, wherever it sits');
  ok(JSON.stringify(V.nextPinned(w2, 165)) === JSON.stringify({ i: 63, tick: 166, live: true }), 'A: the step onto the latest beat reaches live');
  ok(JSON.stringify(V.nextPinned(w2, 101)) === JSON.stringify({ i: 1, tick: 104, live: false }), 'A: a pin that left the window goes on from the oldest');
  ok(V.leftWindowText(101, (n) => String(n)) === 'beat 101 left the window', 'A: the words');
}
/* B */
{
  const pv = fnOf('peindreVision');
  ok(/replayPosition\(histo, vision\.pinTick\)/.test(pv), 'B: peindreVision places the replay by its pinned beat');
  ok(/leftWindowText\(vision\.leftWindow, beatText\)/.test(pv), 'B: the cursor text says which beat left the window');
  ok(/nextPinned\(/.test(fnOf('bvAdvance')), 'B: bvAdvance steps by beat number');
  const slider = app.slice(app.indexOf("$('#bvBattement').addEventListener('input'"), app.indexOf("$('#bvRejouer')"));
  ok(/bvPinAt\(Number\(e\.target\.value\)\)/.test(slider), 'B: the slider pins the beat it points at');
  const play = app.slice(app.indexOf("$('#bvJouer').addEventListener('click'"), app.indexOf("$('#bvBattement').addEventListener('input'"));
  ok(/bvPinAt\(0\)/.test(play), 'B: Play from live pins the oldest beat');
  ok(/vision\.pinTick = null; vision\.leftWindow = null;/.test(fnOf('ouvrirVision')), 'B: opening clears the pin');
  ok(/import \{[^}]*replayPosition[^}]*nextPinned[^}]*leftWindowText[^}]*\} from '\.\/vision-inside\.js';/.test(app), 'B: app imports them');
}
/* C: the real statements, on a window that slides between two paints */
{
  const pv = fnOf('peindreVision');
  const start = pv.indexOf('/* game59 3:'), end = pv.indexOf('curseur.value = ');
  ok(start > 0 && end > start, 'C: the placement block of peindreVision is found');
  const place = pv.slice(start, end);
  const adv = fnOf('bvAdvance');
  const pin = fnOf('bvPinAt');
  const make = () => new Function('vision', 'cible', 'replayPosition', 'nextPinned', '$', 'visionCible',
    pin + '\n}\n' + adv + '\n}\n' + 'return { paint(histo) {' + place + '}, advance: bvAdvance, pinAt: bvPinAt };');
  const vision = { suivre: false, jouer: true, i: 0, pinTick: null, leftWindow: null, control: null };
  let histo = windowAt(100);
  const cible = { get histo() { return histo; } };
  const btn = { textContent: '' };
  const R = make()(vision, cible, V.replayPosition, V.nextPinned, () => btn, () => cible);
  R.pinAt(10); R.paint(histo);
  ok(vision.pinTick === 110 && vision.i === 10, 'C: pinned on beat 110');
  histo = windowAt(103); R.paint(histo);
  ok(vision.pinTick === 110 && vision.i === 7 && vision.leftWindow === null, 'C: the window slid by 3 -> still beat 110 (index 7)');
  R.advance(); R.paint(histo);
  ok(vision.pinTick === 111 && vision.i === 8, 'C: one step -> beat 111');
  vision.pinTick = 101; histo = windowAt(105); R.paint(histo);
  ok(vision.leftWindow === 101 && vision.pinTick === 105 && vision.i === 0, 'C: beat 101 left -> said, the oldest (105) shown');
  vision.pinTick = 167; R.advance();
  ok(vision.suivre === true && vision.jouer === false && vision.pinTick === null, 'C: reaching the latest beat goes back to live');
  vision.suivre = true; vision.leftWindow = 101; R.paint(histo);
  ok(vision.i === 63 && vision.pinTick === null && vision.leftWindow === null, 'C: following live: the latest beat, no pin, no note');
}
console.log('test-replay-pinned-20261026: ' + count + ' assertions, OK');
