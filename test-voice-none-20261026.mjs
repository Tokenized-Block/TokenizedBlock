// test-voice-none-20261026 — game59 4: Inspect said "not read" for Bio, Tone and Topics even when the page HAD read the block's
//   voice and the server answered that there is none (GET /api/voix/<adr> -> { ok: true, voix: null }, measured for UNIT and
//   AAPLc on 2026-10-26). A voice read as empty is a fact: "none — its creator has not written its voice".
//   A. inspect-block.js: voice null + voiceRead true -> read, the words; voice null + voiceRead not true -> not read (unchanged);
//      a real voice is shown as before.
//   B. app.html#bvInspectSources gives voiceRead from voixConnues (filled only by real /api/voix replies).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const I = await import(new URL('inspect-block.js', DIR));
const app = read('app.html');
const ADR = '0xb2000000000000000000007afa7ed748b0874f27';
const field = (m, k) => m.sections.flatMap((s) => s.fields.map((f) => ({ ...f, id: s.key + '.' + f.key }))).find((f) => f.id === k);
/* A */
{
  const none = I.inspectBlock({ address: ADR, voice: null, voiceRead: true });
  for (const k of ['personality.bio', 'personality.tone', 'personality.topics']) {
    const f = field(none, k);
    ok(f && f.status === 'read', 'A: ' + k + ' read as empty -> read (got ' + (f && f.status) + ')');
    ok(I.fieldText(f) === 'none — its creator has not written its voice (/api/voix: voix null)', 'A: ' + k + ' says so (got "' + I.fieldText(f) + '")');
  }
  const unread = I.inspectBlock({ address: ADR, voice: null });
  ok(field(unread, 'personality.bio').status === 'not read', 'A: never read -> not read');
  const real = I.inspectBlock({ address: ADR, voice: { bio: 'I keep time.', ton: 'calm', sujets: ['clocks'] }, voiceRead: true });
  ok(I.fieldText(field(real, 'personality.bio')) === 'I keep time.' && I.fieldText(field(real, 'personality.topics')) === 'clocks', 'A: a real voice as before');
}
/* B */
{
  const i = app.indexOf('function bvInspectSources('); ok(i > 0, 'B: bvInspectSources found');
  const fn = app.slice(i, i + app.slice(i).search(/\n\}/));
  ok(/voiceRead: voixConnues\.has\(a\)/.test(fn), 'B: voiceRead comes from the voices the page really read');
}
console.log('test-voice-none-20261026: ' + count + ' assertions, OK');
