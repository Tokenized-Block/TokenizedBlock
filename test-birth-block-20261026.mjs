// test-birth-block-20261026 — game59 1(a): the inspector's birth block comes from the holders replay, never from a guess.
//   The holders replay (/api/holders, serveur-web.js#holdersCorps) replays every Transfer of a block from its BIRTH: its
//   `naissance` is the block of the first Transfer from the zero address. That is the birth block.
//   A. inspect-block.js#birthBlockFrom(reply) -> that block number, or null (failed reply, missing / non-integer field).
//   B. inspectBlock: birthBlock is "read" with the holders-replay source when the reply holds it, "not read" otherwise —
//      never taken from the creation tx, the market index or a constant.
//   C. app.html: peindreHolders keeps the reply per address; bvInspectSources hands it to the inspector.
//   D. serveur-web.js#holdersCorps: every successful reply carries `naissance` (null while unknown), the "replay running"
//      reply included — it used to drop it, so a client could not learn a birth the server already knew.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const I = await import(new URL('inspect-block.js', DIR));
const app = read('app.html'), server = read('serveur-web.js');
const fnOf = (src, name) => { const i = src.indexOf('function ' + name + '('); ok(i >= 0, name + ' found'); return src.slice(i, i + src.slice(i).search(/\n\}/)); };
const ADR = '0xb2000000000000000000007afa7ed748b0874f27';
const field = (m, k) => m.sections.flatMap((s) => s.fields).find((f) => f.key === k);

/* A */
ok(typeof I.birthBlockFrom === 'function', 'A: inspect-block.js exports birthBlockFrom');
ok(I.birthBlockFrom({ ok: true, etat: 'NON_LU', naissance: 52694118 }) === 52694118, 'A: the replay\'s birth');
for (const bad of [null, {}, { ok: false, naissance: 52694118 }, { ok: true, naissance: null }, { ok: true, naissance: '52694118' }, { ok: true, naissance: 0 }, { ok: true, naissance: 1.5 }])
  ok(I.birthBlockFrom(bad) === null, 'A: no birth from ' + JSON.stringify(bad));
/* B */
{
  const m = I.inspectBlock({ address: ADR, holders: { ok: true, etat: 'NON_LU', naissance: 52694118 } });
  const f = field(m, 'birthBlock');
  ok(f.status === 'read' && f.value === 52694118 && /holders replay/.test(f.source), 'B: birth block read, from the holders replay');
  ok(/52694118/.test(I.fieldText(f)), 'B: shown as read: ' + I.fieldText(f));
  const none = field(I.inspectBlock({ address: ADR, creator: { createur: '0x' + '11'.repeat(20), tx: '0x' + 'ab'.repeat(32) }, market: { creeLe: '2026-10-01' } }), 'birthBlock');
  ok(none.status === I.NOT_READ && none.value === null, 'B: without a replay reply -> not read (no guess from the creation tx or the index)');
  ok(field(I.inspectBlock({ address: ADR, holders: { ok: true, etat: 'NON_LU', naissance: null } }), 'birthBlock').status === I.NOT_READ, 'B: replay without a birth yet -> not read');
}
/* C */
{
  const f = fnOf(app, 'peindreHolders');
  ok(/holdersReplies\.set\(String\(adr\)\.toLowerCase\(\), j\)/.test(f), 'C: the holders reply is kept per address');
  ok(/holders: holdersReplies\.get\(a\) \|\| null/.test(fnOf(app, 'bvInspectSources')), 'C: the inspector gets it');
}
/* D */
{
  const f = fnOf(server, 'holdersCorps');
  const replies = f.match(/JSON\.stringify\(\{ ok: true,[^]*?\}\);/g) || [];
  ok(replies.length >= 7, 'D: the successful replies are found (' + replies.length + ')');
  for (const r of replies) ok(/naissance/.test(r), 'D: carries naissance: ' + r.slice(0, 90).replace(/\s+/g, ' '));
}
console.log('test-birth-block-20261026: ' + count + ' assertions, OK');
