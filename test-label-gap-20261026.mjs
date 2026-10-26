// test-label-gap-20261026 — game59 3: the space view's labels that still READ AS ONE. Measured in Chrome on UNIT's brain
//   (/tmp/pp/labels59.mjs, 700 ms into the fly-in): "Sealed / not fed — and no neuro" centred at x 592.4 and "Read at block /
//   #53127822" centred at x 494.5, 10 px apart on almost the same baseline — one line to the eye, yet their boxes (text width
//   + 6 px) did not overlap, so placeLabels kept both. And from 1.2 s on, 5 of the 6 labels were written OUTSIDE the 720 × 440
//   canvas (x −621, 1341, −205, 925, −7), so only one label was visible.
//   A. vision-inside.js#labelBox(lines, cx, top, widthOf): the box of the drawn text plus a margin (LABEL_PAD_X / _Y), so two
//      labels closer than 2 × the margin overlap; `top` is kept for drawing.
//   B. placeLabels(items, { bounds }): a label not fully inside the canvas is not placed (it would take a place for nothing);
//      the focus rule stays.
//   C. app.html#bvLabelItem builds its box with labelBox and ctx.measureText; bvPaint3D passes the canvas bounds and draws
//      from it.top. Run on the measured case: only one of the two labels is placed.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const V = await import(new URL('vision-inside.js', DIR));
const app = read('app.html');
const fnOf = (name) => { const i = app.indexOf('function ' + name + '('); ok(i > 0, name + ' found'); return app.slice(i, i + app.slice(i).search(/\n\}/)); };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/* the widths Chrome measured (10px system-ui) */
const W = { 'Sealed': 31.1, 'not fed — and no neuro': 112.2, 'Read at block': 63, '#53127822': 52.2, 'Neuron #53': 56.1, 'Life (price × supp': 80, '10.017': 31.3,
  'Previous life': 56.9, 'Share': 26.8, 'Transfers': 43.6, '0': 5.7 };
const widthOf = (s) => { assert.ok(s in W, 'width measured for ' + s); return W[s]; };

/* A */
ok(typeof V.labelBox === 'function' && Number.isFinite(V.LABEL_PAD_X) && Number.isFinite(V.LABEL_PAD_Y), 'A: vision-inside.js exports labelBox and its margins');
const sealed = { id: 'input:scelle', near: 1, top: 148.4, lines: ['Sealed', 'not fed — and no neuro'] };
const block = { id: 'input:bloc', near: 0.9, top: 165.8, lines: ['Read at block', '#53127822'] };
{
  sealed.box = V.labelBox(sealed.lines, 592.4, sealed.top, widthOf); block.box = V.labelBox(block.lines, 494.5, block.top, widthOf);
  ok(V.LABEL_PAD_X >= 6 && V.LABEL_PAD_Y >= 2, 'A: a margin of at least 6 px across, 2 px down (got ' + V.LABEL_PAD_X + ', ' + V.LABEL_PAD_Y + ')');
  ok(Math.abs(sealed.box.w - (112.2 + 2 * V.LABEL_PAD_X)) < 1e-9 && Math.abs(sealed.box.x - (592.4 - 56.1 - V.LABEL_PAD_X)) < 1e-9, 'A: the widest line + the margin, centred');
  ok(sealed.box.y < sealed.top && sealed.box.y + sealed.box.h > sealed.top + 12 + 10, 'A: it covers both lines, with the margin');
  ok(overlap(sealed.box, block.box), 'A: "Sealed / not fed" and "Read at block" 10 px apart now overlap');
  const far = { lines: ['Read at block', '#53127822'] }; far.box = V.labelBox(far.lines, 494.5 - 2 * V.LABEL_PAD_X - 1, block.top, widthOf);
  ok(!overlap(sealed.box, far.box), 'A: further than twice the margin, both fit');
}
/* B */
{
  const B = { w: 720, h: 440 };
  const items = [['neuron:53', ['Neuron #53'], 369.5, 241.6], ['input:vie', ['Life (price × supp', '10.017'], -621.2, -20.7], ['input:scelle', ['Sealed', 'not fed — and no neuro'], 1341.2, -20.7],
    ['input:vieAvant', ['Previous life', '10.017'], -205, 61.1], ['input:part', ['Share', 'not fed — and no neuro'], 925, 61.1], ['input:transferts', ['Transfers', '0'], -6.9, 94.9]]
    .map(([id, lines, cx, top], k) => ({ id, lines, top, near: 6 - k, box: V.labelBox(lines, cx, top, widthOf) }));
  const placed = V.placeLabels(items, { max: 6, focus: [], bounds: B });
  ok(placed.map((p) => p.id).join() === 'neuron:53', 'B: the 5 labels outside the canvas are not placed (got ' + placed.map((p) => p.id).join() + ')');
  ok(V.placeLabels(items, { max: 6, focus: ['input:vie'], bounds: B })[0].id === 'input:vie', 'B: the focus is still always labelled first');
  ok(V.placeLabels(items, { max: 6 }).length === 6, 'B: without bounds, as before');
}
/* C */
{
  const it = fnOf('bvLabelItem');
  ok(/labelBox\(lines, cx, top, \(l\) => ctx\.measureText\(l\)\.width\)/.test(it), 'C: bvLabelItem measures with labelBox');
  const p3 = fnOf('bvPaint3D');
  ok(/placeLabels\(labelItems, \{ max: BV_LABELS_MAX, focus: bvLabelFocus\(aimPoints, L, H\), bounds: \{ w: L, h: H \} \}\)/.test(p3), 'C: the canvas bounds are given');
  ok(/ctx\.fillText\(line, it\.cx, it\.top \+ 10 \+ n \* 12\)/.test(p3), 'C: drawn from it.top (the box has a margin)');
  ok(/import \{[^}]*labelBox[^}]*\} from '\.\/vision-inside\.js';/.test(app), 'C: app imports labelBox');
  const ctx = { font: '', measureText: (s) => ({ width: widthOf(s) }) };
  const list = [];
  const run = new Function('labelBox', 'list', 'ctx', it + '\n}\nbvLabelItem(list, ctx, "input:scelle", ["Sealed", "not fed — and no neuro"], 592.4, 148.4, 1, false);'
    + 'bvLabelItem(list, ctx, "input:bloc", ["Read at block", "#53127822"], 494.5, 165.8, 0.9, true); return list;');
  const got = run(V.labelBox, list, ctx);
  ok(got.length === 2 && got[0].top === 148.4 && got[0].cx === 592.4, 'C: the real bvLabelItem keeps top and cx');
  ok(V.placeLabels(got, { max: 6, bounds: { w: 720, h: 440 } }).length === 1, 'C: on the measured case, one label only');
}
console.log('test-label-gap-20261026: ' + count + ' assertions, OK');
