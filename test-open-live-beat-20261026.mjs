// test-open-live-beat-20261026 — game57 #4d: the brain view OPENS ON THE LIVE BEAT (the number Live, the Control panel and the
//   Brain tab show, page-brains.js#displayedBeat), and follows live. It used to start a replay 24 beats back: "Beat 93" in
//   the window while Live said 140.
//   A. Opening a brain at beat 140 with 64 recorded beats: the opening statement of ouvrirVision puts the view on the latest
//      beat, following live, no replay running; the header reads "Beat 140".
//   B. vision-inside.js#beatHeader: live = "Beat M"; replay = "Replay: beat N · live M" (never mistaken for live);
//      Take control = "Snapshot of beat N".
//   C. app.html: the header = beatHeader(... live = displayedBeat(pageBrains, ...)); the overlay copies vision.beatText;
//      Play at live starts the replay of the recorded beats (explicit action only); the timer repaints while following live.
//   D. page-brains.js: an optional onBeat listener hears each REAL step once; a failing listener never stops a beat; the view
//      repaints its header on a beat of the address it shows.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const V = await import(new URL('vision-inside.js', DIR));
const { beatText } = await import(new URL('page-brains.js', DIR));
const app = read('app.html');
const fnOf = (name) => { const i = app.indexOf('function ' + name + '('); ok(i > 0, name + ' found'); return app.slice(i, i + app.slice(i).search(/\n\}/)); };

/* A: run ouvrirVision's real opening statements on a brain at beat 140 with 64 recorded beats */
{
  const open = fnOf('ouvrirVision');
  const line = open.split('\n').find((l) => /^\s*vision\.i = /.test(l));
  ok(!!line, 'A: the opening position statement is found');
  const histo = Array.from({ length: 64 }, (_, k) => ({ tick: 77 + k, indices: [] }));
  const vision = { jouer: true, suivre: true, i: -1 };
  new Function('vision', 'n', 'BATTEMENTS_SIM', 'bvReduit', line)(vision, histo.length, 24, () => false);
  const shown = histo[vision.suivre ? histo.length - 1 : vision.i];
  const replaying = !vision.suivre && vision.i < histo.length - 1;
  const header = typeof V.beatHeader === 'function'
    ? V.beatHeader({ shownTick: shown.tick, liveTick: 140, replaying, fmt: beatText })
    : 'Beat ' + beatText(shown.tick);
  ok(header === 'Beat 140', 'A: opening at beat 140 with 64 recorded beats shows "Beat 140" (got "' + header + '")');
  ok(vision.suivre === true && vision.i === 63, 'A: it follows live from the latest beat');
  ok(/vision\.jouer = false;/.test(line), 'A: no replay runs on opening');
}
/* B */
ok(typeof V.beatHeader === 'function', 'B: vision-inside.js exports beatHeader');
{
  const f = beatText;
  ok(V.beatHeader({ shownTick: 140, liveTick: 140, replaying: false, fmt: f }) === 'Beat 140', 'B: live');
  ok(V.beatHeader({ shownTick: 93, liveTick: 1140, replaying: true, fmt: f }) === 'Replay: beat 93 · live 1,140', 'B: replay names both');
  ok(V.beatHeader({ snapshotTick: 123, shownTick: 93, liveTick: 140, replaying: true, fmt: f }) === 'Snapshot of beat 123', 'B: Take control');
  ok(V.beatHeader({ shownTick: 139, liveTick: 140, replaying: false, fmt: f }) === 'Beat 140', 'B: following = the live number, never the shown copy');
  ok(V.beatHeader({ shownTick: null, liveTick: null, replaying: false, fmt: f }) === '—', 'B: nothing read -> a dash');
  ok(V.beatHeader({ shownTick: 93, liveTick: null, replaying: true, fmt: f }) === 'Replay: beat 93 · live —', 'B: replay without a live number says so');
}
/* C */
{
  ok(/const liveBeat = displayedBeat\(pageBrains, cible\.adr, dernier\);/.test(app), 'C: the live number is item 6\'s helper');
  ok(/vision\.beatText = beatHeader\(\{ snapshotTick: vision\.control \? vision\.control\.snap\.tick : null, shownTick: beatNumber\(vuShown\), liveTick: liveBeat, replaying, fmt: beatText \}\);/.test(app), 'C: the header is beatHeader');
  ok(/\$\('#bvNumber'\)\.textContent = vision\.beatText;/.test(app), 'C: #bvNumber shows it');
  ok(/describeTarget\(hit\.obj, vision\.inspectSrc, vision\.inspectModel, bvShownBeat\(\)\)/.test(fnOf('bvPaintAim')), 'C: the overlay copies it');
  ok(/if \(vision\.jouer && vision\.suivre\) \{ (vision\.i = 0|bvPinAt\(0\)); vision\.suivre = false; \}/.test(app), 'C: Play at live = replay the recorded beats (explicit)');
  ok(/if \(\(vision\.jouer \|\| vision\.suivre\) && !vision\.control\) peindreVision\(\);/.test(fnOf('bvRestartTimer')), 'C: following live repaints');
}
/* D: the header moves WITH the live beat (measured: header 146 while Live said 148 — the view repainted on its own 1.5 s timer).
 *    The shared registry tells the page when an address really beats; the view repaints its header on that beat. */
{
  const { createPageBrains } = await import(new URL('page-brains.js', DIR));
  const heard = [];
  const reg = createPageBrains({ create: () => ({ t: 0 }), onBeat: (adr, tick) => heard.push(adr + ':' + tick) });
  const stepFn = (e) => ({ etat: { t: e.t + 1 }, vu: { tick: e.t + 1 } });
  const A = '0x' + 'ab'.repeat(20);
  reg.step(A, null, stepFn, 1); reg.step(A, null, stepFn, 1); reg.step(A, null, stepFn, 2);
  ok(heard.join() === A + ':1,' + A + ':2', 'D: the registry announces each real beat once (not the repeat of a cycle): ' + heard.join());
  const quiet = createPageBrains({ create: () => ({ t: 0 }), onBeat: () => { throw new Error('a listener failing'); } });
  ok(quiet.step(A, null, stepFn, 1).vu.tick === 1, 'D: a failing listener never stops a beat');
  ok(/const pageBrains = createPageBrains\(\{ create: \(a\) => cerveauAvecMemoire\(a\), onBeat: \(adr\) => bvOnSharedBeat\(adr\) \}\);/.test(app), 'D: the page listens to its beats');
  const f = fnOf('bvOnSharedBeat');
  /* measured in the browser: ~200 addresses beat per page cycle; the first OTHER address used to take the one repaint slot */
  const guard = f.split('\n').find((l) => /bvBeatRepaint\) return;/.test(l)) || '';
  ok(/vision\.adr/.test(guard), 'D: only a beat of the shown address takes the repaint slot (got: ' + guard.trim() + ')');
  ok(/vision\.control/.test(f) && /peindreVision\(\)/.test(f) && /visionCible\(\)/.test(f), 'D: not in control -> repaint the view of THAT address');
  /* measured: while replaying, "live 109" stayed while Live said 111 — the live number moves during a replay too */
  ok(!/!vision\.suivre/.test(f), 'D: a replay\'s "live M" follows the live beat too (no repaint only while following)');
  ok(/bvPaintAim\(vision\.aimPoints \|\| \[\], /.test(fnOf('peindreVision')), 'D: the overlay is repainted with the header, not one frame later');
}
console.log('test-open-live-beat-20261026: ' + count + ' assertions, OK');
