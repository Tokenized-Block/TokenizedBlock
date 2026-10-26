// test-space-labels-20261026 — game57 #4c (b): the Inside view's labels no longer pile up into an unreadable cluster.
//   A. vision-inside.js#placeLabels(items, { max, focus }): at most `max` labels; no two placed boxes overlap; the hovered /
//      pinned / aimed item (focus) is ALWAYS labelled, even if far or overlapping; then the nearest to the camera first;
//      it places the given labels only (no text is made up).
//   B. app.html#bvPaint3D: labels go through placeLabels (6 at most), nothing is written for every input any more;
//      the hovered object is tracked on pointer move.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const V = await import(new URL('vision-inside.js', DIR));
const app = read('app.html');
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/* A */
ok(typeof V.placeLabels === 'function', 'A: vision-inside.js exports placeLabels');
{
  /* the cluster: 40 labels crammed around the centre, like the fly-in */
  const items = Array.from({ length: 40 }, (_, i) => ({ id: 'input:' + i, text: 'label ' + i, near: (i * 37) % 11,
    box: { x: 380 + ((i * 13) % 30), y: 280 + ((i * 7) % 20), w: 70, h: 24 } }));
  items.push({ id: 'neuron:99', text: 'Neuron #99', near: -5, box: { x: 390, y: 285, w: 60, h: 12 } });
  for (const max of [1, 3, 6]) for (const focus of [[], ['neuron:99'], ['input:5', 'neuron:99']]) {
    const placed = V.placeLabels(items, { max, focus });
    ok(placed.length <= max, 'A: at most ' + max + ' labels (focus ' + focus.join(',') + ')');
    let clean = true;
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) if (overlap(placed[i].box, placed[j].box)) clean = false;
    ok(clean, 'A: no two placed labels overlap (max ' + max + ', focus ' + focus.join(',') + ')');
    if (focus.length) ok(placed[0].id === focus[0], 'A: the hovered item is always labelled, first (max ' + max + ')');
    ok(placed.every((p) => items.includes(p)), 'A: only the given labels, untouched');
  }
  /* spread out labels: the nearest to the camera win */
  const far = Array.from({ length: 10 }, (_, i) => ({ id: 'n' + i, near: i, box: { x: i * 100, y: 0, w: 80, h: 20 } }));
  const p6 = V.placeLabels(far, { max: 6 });
  ok(p6.length === 6 && p6.map((p) => p.id).join() === 'n9,n8,n7,n6,n5,n4', 'A: the nearest first');
  ok(V.placeLabels([], { max: 6, focus: ['x'] }).length === 0 && V.placeLabels(null).length === 0, 'A: nothing to place -> nothing');
}
/* B */
{
  const i = app.indexOf('function bvPaint3D('); ok(i > 0, 'B: bvPaint3D found');
  const fn = app.slice(i, i + app.slice(i).search(/\n\}/));
  ok(/placeLabels\(labelItems, \{ max: BV_LABELS_MAX, focus: bvLabelFocus\(aimPoints, L, H\) \}\)/.test(fn), 'B: labels are placed by placeLabels');
  ok(/const BV_LABELS_MAX = 6;/.test(app), 'B: 6 labels at most');
  ok(!fn.includes('ctx.fillText(String(o.label).slice(0, 18), q.x'), 'B: no label written for every input any more');
  ok(/import \{[^}]*placeLabels[^}]*\} from '\.\/vision-inside\.js';/.test(app), 'B: app imports placeLabels');
  const j = app.indexOf('function bvLabelFocus('); ok(j > 0, 'B: bvLabelFocus found');
  const f2 = app.slice(j, j + app.slice(j).search(/\n\}/));
  ok(/vision\.hover/.test(f2) && /vision\.pinned/.test(f2) && /aimedAt\(/.test(f2), 'B: focus = hovered, pinned, aimed');
  ok(/cv\.addEventListener\('pointermove', [^\n]*vision\.hover/.test(app), 'B: the hovered object is tracked');
}
console.log('test-space-labels-20261026: ' + count + ' assertions, OK');
