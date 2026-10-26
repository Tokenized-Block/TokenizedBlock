// test-single-beat-20261026 — game57 #6 (Grok Super QA game56) : UN numero de battement partout.
//   UNIT panneau 43–139 vs ~3000 dans Live, METAc panneau BEAT 2 puis 249215 : chaque vue lisait le `tick` de SA copie du cerveau.
//   A. page-brains.js : displayedBeat(registre, adr, repli) = le tick de L instance de la page ; beatText = UN format.
//   B. app.html : panneau (#bcTick, ligne Beat), onglet Brain (#bTick), fenetre Brain (#bvNumber), tuile Live : tous par beatText,
//      le panneau par displayedBeat(pageBrains, …).
//   C. les rangs relatifs (pas d un rejeu « what if ») ne s appellent plus « beat » : ce n est pas le numero du battement.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const D = new URL('./', import.meta.url);
const lire = (f) => readFileSync(new URL(f, D), 'utf8').replace(/\r\n/g, '\n');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

const M = await import(new URL('page-brains.js', D));
ok(typeof M.displayedBeat === 'function' && typeof M.beatText === 'function', 'A: displayedBeat et beatText exportes');
const { createPageBrains, displayedBeat, beatText } = M;
ok(beatText(249215) === '249,215' && beatText(92) === '92' && beatText(0) === '0', 'A: un format');
ok(beatText(null) === '—' && beatText(2.5) === '—' && beatText(undefined) === '—' && beatText('92') === '—', 'A: pas de battement = —');
const UNIT = '0x' + 'a1'.repeat(20);
const reg = createPageBrains({ creer: () => ({ tick: 91 }) });
const pas = (e) => ({ etat: { tick: e.tick + 1 }, vu: { tick: e.tick + 1, phase: 'CALME', spikes: 3 } });
reg.battre(UNIT, {}, pas, 1, { source: 'carte' });
ok(displayedBeat(reg, UNIT.toUpperCase().replace('0X', '0x'), { tick: 43 }) === 92, 'A: le panneau montre le battement de L instance (92), pas sa copie (43)');
ok(displayedBeat(reg, '0x' + 'b2'.repeat(20), { tick: 43 }) === 43, 'A: aucune instance sur la page -> le repli (instantane)');
ok(displayedBeat(reg, '0x' + 'b2'.repeat(20), { tick: null }) === null && displayedBeat(null, UNIT, null) === null, 'A: rien -> null');

const app = lire('app.html');
ok(/import \{ createPageBrains, displayedBeat, beatText(, [A-Za-z]+)* \} from '\.\/page-brains\.js';/.test(app), 'B: import');
ok(app.includes("$('#bcTick').textContent = beatText(displayedBeat(pageBrains, a, snap));"), 'B: #bcTick');
ok(app.includes("t.push(['Beat', beatText(displayedBeat(pageBrains, a, snap))]);"), 'B: ligne Beat du panneau');
ok(app.includes("$('#bTick').textContent = beatText(r.vu.tick);"), 'B: #bTick');
ok(app.includes("'Beat ' + beatText(beatNumber(vuMontre))"), 'B: #bvNumber');
ok(app.includes("pied.textContent = 'beat ' + beatText(e.tick) + ' · '"), 'B: tuile Live');
ok(!/\$\('#bcTick'\)\.textContent = snap\.tick/.test(app) && !/t\.push\(\['Beat', snap\.tick/.test(app), 'B: plus de tick de copie dans le panneau');

ok(!app.includes("'on beat ' + e.battement") && app.includes("'on replay step ' + e.battement"), 'C: parler — un pas de rejeu, pas un beat');
ok(!app.includes("differs from beat ' + (s.premierEcart + 1)") && app.includes("differs from replay step ' + (s.premierEcart + 1)"), 'C: what if — idem');
console.log('test-single-beat-20261026 : ' + n + ' assertions, OK');
