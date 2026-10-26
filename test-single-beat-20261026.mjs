// test-single-beat-20261026 — game57 #6 (Grok Super QA game56): ONE beat number everywhere.
//   UNIT panel 43–139 vs ~3000 in Live, METAc panel BEAT 2 then 249215: each view read the `tick` of ITS copy of the brain.
//   A. page-brains.js: displayedBeat(registry, adr, fallback) = the tick of THE page instance; beatText = ONE format.
//   B. app.html: panel (#bcTick, Beat row), Brain tab (#bTick), Brain window (#bvNumber), Live tile: all through beatText,
//      the panel through displayedBeat(pageBrains, …).
//   C. relative ranks (a "what if" replay step) are no longer called "beat": it is not the beat number.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const D = new URL('./', import.meta.url);
const read = (f) => readFileSync(new URL(f, D), 'utf8').replace(/\r\n/g, '\n');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

const M = await import(new URL('page-brains.js', D));
ok(typeof M.displayedBeat === 'function' && typeof M.beatText === 'function', 'A: displayedBeat and beatText exported');
const { createPageBrains, displayedBeat, beatText } = M;
ok(beatText(249215) === '249,215' && beatText(92) === '92' && beatText(0) === '0', 'A: one format');
ok(beatText(null) === '—' && beatText(2.5) === '—' && beatText(undefined) === '—' && beatText('92') === '—', 'A: no beat = —');
const UNIT = '0x' + 'a1'.repeat(20);
const reg = createPageBrains({ create: () => ({ tick: 91 }) });
const step = (e) => ({ etat: { tick: e.tick + 1 }, vu: { tick: e.tick + 1, phase: 'CALME', spikes: 3 } });
reg.step(UNIT, {}, step, 1, { source: 'carte' });
ok(displayedBeat(reg, UNIT.toUpperCase().replace('0X', '0x'), { tick: 43 }) === 92, 'A: the panel shows THE instance\'s beat (92), not its copy (43)');
ok(displayedBeat(reg, '0x' + 'b2'.repeat(20), { tick: 43 }) === 43, 'A: no instance on the page -> the fallback (snapshot)');
ok(displayedBeat(reg, '0x' + 'b2'.repeat(20), { tick: null }) === null && displayedBeat(null, UNIT, null) === null, 'A: nothing -> null');

const app = read('app.html');
ok(/import \{ createPageBrains, displayedBeat, beatText(, [A-Za-z]+)* \} from '\.\/page-brains\.js';/.test(app), 'B: import');
ok(app.includes("$('#bcTick').textContent = beatText(displayedBeat(pageBrains, a, snap));"), 'B: #bcTick');
ok(app.includes("t.push(['Beat', beatText(displayedBeat(pageBrains, a, snap))]);"), 'B: the panel\'s Beat row');
ok(app.includes("$('#bTick').textContent = beatText(r.vu.tick);"), 'B: #bTick');
ok(app.includes("liveTick: liveBeat, replaying, fmt: beatText })") && app.includes('const liveBeat = displayedBeat(pageBrains, cible.adr, dernier);'), 'B: #bvNumber (game57 #4d: the live beat, via the helper)');
ok(app.includes("pied.textContent = 'beat ' + beatText(e.tick) + ' · '"), 'B: Live tile');
ok(!/\$\('#bcTick'\)\.textContent = snap\.tick/.test(app) && !/t\.push\(\['Beat', snap\.tick/.test(app), 'B: no copy tick left in the panel');

ok(!app.includes("'on beat ' + e.battement") && app.includes("'on replay step ' + e.battement"), 'C: talk — a replay step, not a beat');
ok(!app.includes("differs from beat ' + (s.premierEcart + 1)") && app.includes("differs from replay step ' + (s.premierEcart + 1)"), 'C: what if — same');
console.log('test-single-beat-20261026 : ' + n + ' assertions, OK');
