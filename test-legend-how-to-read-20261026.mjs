// test-legend-how-to-read-20261026 — game57 #4c (c): the brain view's legend is ONE short line; the full explanation moves
//   to a "How to read" book on the shelf (same words, nothing lost).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const app = readFileSync(new URL('app.html', DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const i = app.indexOf("$('#bvLegende').textContent = vision.control"); ok(i > 0, 'the legend line is found');
const expr = app.slice(i, i + app.slice(i).search(/;\r?\n/));
const texts = [...expr.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)].map((m) => m[1]);
ok(texts.length >= 3, 'the legend texts are found (' + texts.length + ')');
ok(!/\+\s*'The light is its mood/.test(expr), 'no second sentence appended to the legend');
for (const t of texts) ok(t.length <= 80, 'legend text is one short line (' + t.length + ' chars): ' + t.slice(0, 40));
ok(/class="bvSpine" role="tab" aria-selected="false" data-book="howto">How to read<\/button>/.test(app), 'a "How to read" book on the shelf');
const b = app.indexOf('data-book="howto" hidden'); ok(b > 0, 'the How to read book is found');
const book = app.slice(b, app.indexOf('</section>', b));
for (const w of ['Lit = fired on this beat', 'faint = its 5 beats before', 'Warm from the front = a buy reached it', 'cold from behind = a sell',
  'shimmer at the sides = a transfer', 'a new speck = a new holder', 'its neurons read none of them', 'The light is its mood',
  'how many neurons fired', 'the horizon tilts with its steering', 'Take control', 'Nothing is sent, nothing is signed', 'right-drag or Shift-drag'])
  ok(book.includes(w), 'How to read keeps: ' + w);
console.log('test-legend-how-to-read-20261026: ' + count + ' assertions, OK');
