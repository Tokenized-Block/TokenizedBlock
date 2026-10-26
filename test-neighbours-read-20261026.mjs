// test-neighbours-read-20261026 — game59 1(b) + 1(c): the inspector says what its neurons REALLY read of its neighbours, and
//   why it has no expectations.
//   A. inspect-block.js#neighboursReadFrom(facts, neighbours): from the EXACT facts given to pas() on the newest beat, the
//      neighbours that appear in that input vector (an address as a key or a value). Today's vector (cerveau.js#courant: vie,
//      vieAvant, gm, messages, detenteurs, ...) holds none -> { read: [], keys: [...] } and the text "none read this beat".
//      No facts -> null ("not read"). A neighbour that is only NEAR (the map) is never counted as read.
//   B. inspectBlock: perceives.neighboursRead is read from the input vector, with that source; describeTarget on a neighbour
//      says "no — none read this beat" from the same facts.
//   C. expectations.next stays "no source", and its note names the missing field from the REAL brain state keys
//      (no prediction field; memoire is a trace of past firing).
//   D. app.html: bvInspectSources passes the exact facts and the brain state keys.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const I = await import(new URL('inspect-block.js', DIR));
const { etatInitial } = await import(new URL('cerveau.js', DIR));
const app = read('app.html');
const ADR = '0xb200000000000000000000c2e324d24d7eecd1fb', N1 = '0x' + '22'.repeat(20), N2 = '0x' + '33'.repeat(20);
const field = (m, k) => m.sections.flatMap((s) => s.fields).find((f) => f.key === k);
const FACTS = { vie: 608061763183, vieAvant: null, gm: 2845, messages: 0, detenteurs: 496, mort: false, etatVie: 'LUE', gmAvant: 2840,
  messagesAvant: 0, detenteursAvant: 495, achats: 0, ventes: 0, role: 'eclaireur', reveil: false, bloc: 53122410 };
const NEAR = [{ adr: N1, sym: 'SUIT', distance: 410 }, { adr: N2, sym: 'NIOc', distance: 900 }];

/* A */
ok(typeof I.neighboursReadFrom === 'function', 'A: inspect-block.js exports neighboursReadFrom');
{
  const r = I.neighboursReadFrom(FACTS, NEAR);
  ok(r && Array.isArray(r.read) && r.read.length === 0, 'A: today\'s input vector reads no neighbour');
  ok(r.keys.join() === Object.keys(FACTS).join(), 'A: the keys are the real input vector');
  ok(I.neighboursReadFrom(null, NEAR) === null, 'A: no facts -> not read');
  const hypothetical = I.neighboursReadFrom({ ...FACTS, from: N2.toUpperCase().replace('0X', '0x') }, NEAR);
  ok(hypothetical.read.length === 1 && hypothetical.read[0].adr === N2 && hypothetical.read[0].key === 'from', 'A: a neighbour inside the vector would be listed, with its key');
}
/* B */
{
  const m = I.inspectBlock({ address: ADR, facts: FACTS, onMap: true, neighbours: NEAR });
  const f = field(m, 'neighboursRead');
  ok(f.status === 'read' && /input vector/.test(f.source), 'B: neighbours read = read from its input vector');
  ok(/none read this beat/.test(I.fieldText(f)), 'B: "none read this beat": ' + I.fieldText(f));
  ok(field(I.inspectBlock({ address: ADR }), 'neighboursRead').status === I.NOT_READ, 'B: no facts -> not read');
  const d = I.describeTarget({ kind: 'neighbour', adr: N1, sym: 'SUIT' }, { facts: FACTS }, m);
  ok(d.lines.some((l) => l.label === 'Read by its neurons' && /none read this beat/.test(l.value)), 'B: the overlay says the same');
}
/* C */
{
  const keys = Object.keys(etatInitial(ADR));
  const f = field(I.inspectBlock({ address: ADR, stateKeys: keys }), 'next');
  ok(f.status === I.NO_SOURCE, 'C: expectations stay no source');
  ok(/no prediction field/.test(f.note) && keys.every((k) => f.note.includes(k)) && /memoire/.test(f.note), 'C: the note names the real state fields: ' + f.note);
}
/* D */
{
  const i = app.indexOf('function bvInspectSources('); ok(i > 0, 'D: bvInspectSources found');
  const fn = app.slice(i, i + app.slice(i).search(/\n\}/));
  ok(/facts: target\.faits \|\| null/.test(fn) && /stateKeys: target\.etat \? Object\.keys\(target\.etat\) : null/.test(fn), 'D: the exact facts and the state keys are passed');
}
console.log('test-neighbours-read-20261026: ' + count + ' assertions, OK');
