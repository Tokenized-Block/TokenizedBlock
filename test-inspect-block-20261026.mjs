// test-inspect-block-20261026 — game57 #4b (d), Phil 17:55: from inside the brain the user is OMNISCIENT about the block.
//   inspect-block.js (pure) builds ONE inspect model from what the page really holds: identity, personality, full state, what it
//   perceives, what it has done, its expectations. Every field is either a real value with its source, "not read" (the app has a
//   source but holds no value), or "no source" (the app has no data source for it). Nothing is ever synthesized.
//   A. full sources -> every field present, values passed through unchanged, status "read".
//   B. no sources -> no value anywhere, only "not read" / "no source"; no zero or default appears.
//   C. partial sources -> exactly the missing ones are "not read"; a state of another beat is not shown as this beat's.
//   D. aimedAt: what the camera looks at (nearest to the screen centre, within a radius), or nothing.
//   E. describeTarget: a neuron's real potential and trace, an input's real value and source, a neighbour "not read by its neurons".
//   F. app.html: the Inspect book + an overlay on what the camera looks at, painted from inspect-block.js; served by serveur-web.js.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
let I = null;
try { I = await import(new URL('inspect-block.js', DIR)); } catch (e) { I = null; }
ok(!!I && typeof I.inspectBlock === 'function', 'inspect-block.js exports inspectBlock');
const { inspectBlock, FIELDS, aimedAt, describeTarget, NOT_READ, NO_SOURCE } = I;

const ADR = '0xb200000000000000000000c2e324d24d7eecd1fb';
const neurones = Array.from({ length: 128 }, (_, n) => ({ n, capteur: n < 16, potentiel: n / 200, trace: n / 1000, lueur: n / 128, retenu: false }));
const vu = { tick: 141, phase: 'CURIEUX', spikes: 9, indices: [3, 17, 40], virage: 0.153, vitesse: 0.25, memoire: 0.31 };
const FULL = {
  address: ADR, symbol: 'AAPLc',
  market: { nom: 'Apple Inc.', sym: 'AAPLc', quoteSym: 'USDC', creeLe: '2026-09-02T10:00:00Z', prixUsd: 262.1, liquiditeUsd: 12000, dex: 'uniswap-v4' },
  creator: { createur: '0x' + '11'.repeat(20), tx: '0x' + 'ab'.repeat(32) },
  voice: { bio: 'I follow Apple.', ton: 'joueur', sujets: ['earnings'] },
  vu, histo: [{ ...vu, tick: 139, phase: 'CALME', spikes: 4 }, { ...vu, tick: 140, spikes: 6 }, vu],
  internals: { tick: 141, neurones, resume: { min: 0, max: 0.635, moyenne: 0.3175 } },
  champ: { entrees: [{ cle: 'vie', libelle: 'Life', lu: true, texte: '608,061', source: 'its market' }, { cle: 'vieAvant', libelle: 'Previous life', lu: false, texte: 'not read', source: 'the previous read' }],
    sensations: { total: 0.42 } },
  why: { mood: 'curious', strongest: { label: 'Transfers', value: 2742, contribution: 0.2 } },
  onMap: true, neighbours: [{ adr: '0x' + '22'.repeat(20), sym: 'SUIT', phase: 'CALME', distance: 410 }],
  journal: [{ tick: 120, texte: 'I feel transfers again.', genre: 'SENT' }], spoken: [{ texte: 'Hello SUIT', heure: '17:40:01' }],
};
const byKey = (m) => Object.fromEntries(m.sections.flatMap((s) => s.fields.map((f) => [s.key + '.' + f.key, f])));
/* the field list Phil asked for */
const WANTED = ['identity.name', 'identity.symbol', 'identity.pairedWith', 'identity.creator', 'identity.creationTx', 'identity.createdAt', 'identity.birthBlock',
  'personality.bio', 'personality.tone', 'personality.topics',
  'state.neurons', 'state.sensors', 'state.mood', 'state.why', 'state.steering', 'state.speed', 'state.memory',
  'perceives.inputs', 'perceives.neighboursRead', 'perceives.neighboursNearby', 'perceives.market',
  'done.recentBeats', 'done.thoughts', 'done.spoken', 'expectations.next'];

/* A */
{
  const f = byKey(inspectBlock(FULL));
  for (const k of WANTED) ok(!!f[k], 'A: field ' + k + ' exists');
  ok(f['identity.name'].value === 'Apple Inc.' && f['identity.name'].status === 'read' && /market index/.test(f['identity.name'].source), 'A: name, read, with its source');
  ok(f['identity.pairedWith'].value === 'USDC' && f['identity.creator'].value === FULL.creator.createur && f['identity.creationTx'].value === FULL.creator.tx, 'A: pair, creator, creation tx: as read');
  ok(f['personality.bio'].value === 'I follow Apple.' && f['personality.tone'].value === 'joueur', 'A: bio and tone as written by its creator');
  ok(f['state.neurons'].status === 'read' && f['state.neurons'].value.length === 128 && f['state.neurons'].value[40].potentiel === 0.2, 'A: 128 neurons with their real potentials');
  ok(f['state.sensors'].value.potentials.length === 16 && f['state.sensors'].value.current === 0.42, 'A: 16 sensors and the current they received');
  ok(f['state.mood'].value === 'CURIEUX' && f['state.steering'].value === 0.153 && f['state.speed'].value === 0.25, 'A: mood, steering, speed as decided');
  ok(f['state.why'].value.label === 'Transfers', 'A: why = the strongest read input');
  ok(f['state.memory'].value.beats === 3 && f['state.memory'].value.from === 139 && f['state.memory'].value.to === 141 && f['state.memory'].value.trace === 0.31, 'A: memory of the last beats');
  ok(f['perceives.inputs'].value.length === 2 && f['perceives.inputs'].value[1].text === 'not read', 'A: inputs keep their own "not read"');
  ok(f['perceives.neighboursNearby'].value[0].sym === 'SUIT' && f['perceives.market'].value.prixUsd === 262.1, 'A: neighbours nearby and market, as held');
  ok(f['done.recentBeats'].value.length === 3 && f['done.thoughts'].value[0].texte === 'I feel transfers again.' && f['done.spoken'].value[0].texte === 'Hello SUIT', 'A: what it has done');
}
/* B */
{
  const m = inspectBlock({ address: ADR });
  const all = m.sections.flatMap((s) => s.fields);
  ok(all.every((x) => x.value === null), 'B: no value synthesized when nothing is held');
  ok(all.every((x) => x.status === NOT_READ || x.status === NO_SOURCE), 'B: only "not read" or "no source"');
  ok(all.every((x) => (FIELDS.find((d) => d.section + '.' + d.key === m.sections.find((s) => s.fields.includes(x)).key + '.' + x.key).source === null) === (x.status === NO_SOURCE)), 'B: "no source" exactly for the fields the app has no source for');
  ok(m.counts.read === 0 && m.counts.notRead + m.counts.noSource === all.length, 'B: counts');
  const f = byKey(m);
  for (const k of ['identity.birthBlock', 'perceives.neighboursRead', 'expectations.next']) ok(f[k].status === NO_SOURCE && f[k].note, 'B: ' + k + ' says it has no source, and why');
  ok(inspectBlock(null) === null, 'B: no address, no model');
}
/* C */
{
  const f = byKey(inspectBlock({ ...FULL, market: { nom: 'Apple Inc.' }, voice: null, internals: { ...FULL.internals, tick: 140 }, onMap: false }));
  ok(f['identity.name'].status === 'read' && f['identity.pairedWith'].status === NOT_READ && f['identity.pairedWith'].value === null, 'C: no pair in the row -> not read');
  ok(f['personality.bio'].status === NOT_READ && f['personality.tone'].value === null, 'C: no voice loaded -> not read');
  ok(f['state.neurons'].status === NOT_READ && f['state.neurons'].value === null, 'C: a state of another beat is not this beat\'s neurons');
  ok(f['perceives.neighboursNearby'].status === NOT_READ && /not on the map/.test(f['perceives.neighboursNearby'].note), 'C: off the map -> neighbours not read');
  ok(f['perceives.market'].status === NOT_READ, 'C: no price in the row -> market not read');
}
/* D */
{
  const pts = [{ x: 100, y: 100, obj: { kind: 'neuron', n: 1 } }, { x: 205, y: 148, obj: { kind: 'neuron', n: 2 } }, { x: 230, y: 160, obj: { kind: 'input', key: 'vie' } }];
  ok(aimedAt(pts, 400, 300).obj.n === 2, 'D: the object nearest the screen centre');
  ok(aimedAt([{ x: 0, y: 0, obj: {} }], 400, 300) === null && aimedAt([], 400, 300) === null, 'D: nothing near the centre -> nothing aimed at');
}
/* E */
{
  const full = inspectBlock(FULL);
  const n40 = describeTarget({ kind: 'neuron', n: 40 }, FULL, full);
  ok(n40.lines.some((l) => l.label === 'Potential' && l.value === '0.2') && n40.lines.some((l) => l.label === 'Fired this beat' && l.value === 'yes'), 'E: a neuron: real potential, fired');
  const nx = describeTarget({ kind: 'neuron', n: 40 }, { ...FULL, internals: null }, full);
  ok(nx.lines.some((l) => l.label === 'Potential' && l.value === NOT_READ), 'E: no state -> potential not read');
  const inp = describeTarget({ kind: 'input', key: 'vieAvant' }, FULL, full);
  ok(inp.lines.some((l) => l.value === 'not read') && inp.lines.some((l) => l.label === 'Source'), 'E: an input: its value or "not read", and its source');
  const nb = describeTarget({ kind: 'neighbour', adr: '0x' + '22'.repeat(20), sym: 'SUIT' }, FULL, full);
  ok(nb.lines.some((l) => /not read by its neurons/.test(l.value)), 'E: a neighbour is never said to be read');
}
/* F */
const app = read('app.html'), server = read('serveur-web.js');
ok(/import \{ inspectBlock, aimedAt, describeTarget, NOT_READ as INSPECT_NOT_READ \} from '\.\/inspect-block\.js';/.test(app), 'F: app imports inspect-block.js');
ok(server.includes("'inspect-block.js',"), 'F: served by serveur-web.js');
ok(/data-book="inspect"/.test(app) && /id="bvInspect"/.test(app) && /id="bvAim"/.test(app), 'F: the Inspect book and the overlay');
const i = app.indexOf('function bvInspectSources() {'); ok(i > 0, 'extraction found: function bvInspectSources() {');
const src = app.slice(i, i + /\n\}/.exec(app.slice(i)).index + 2);
ok(!/fetch\(|localStorage\.setItem|rpc\(|eth_/.test(src), 'F: the inspect sources are read from what the page holds, nothing is fetched or written');
console.log('test-inspect-block-20261026: ' + count + ' assertions, OK');
