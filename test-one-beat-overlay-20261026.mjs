// test-one-beat-overlay-20261026 — game57 #4c (a): ONE beat number in the brain view.
//   The overlay (what the camera looks at) used to show the LATEST recorded beat (src.vu = last of histo) while the header
//   (#bvNumber) shows the beat on screen (replay cursor, or the Take control snapshot): "Beat 123" vs "Beat: 138".
//   A. describeTarget(obj, src, model, shown): the neuron's values and its beat line come from the SHOWN beat; the beat text is
//      the header's text, character for character; potential/trace only when the internals are of that same beat.
//   B. without a shown beat: no beat line at all (never a second counter).
//   C. app.html: the header text is kept in vision.beatText and the overlay is given exactly that; Take control says
//      "Snapshot of beat N" with N = the snapshot's beat, in the header and the overlay.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const { describeTarget, NOT_READ } = await import(new URL('inspect-block.js', DIR));
const app = read('app.html');

const latest = { tick: 138, indices: [40], phase: 'CURIEUX' };
const shownVu = { tick: 123, indices: [7], phase: 'CALME' };
const src = { vu: latest, internals: { tick: 138, neurones: Array.from({ length: 128 }, (_, n) => ({ potentiel: n / 100, trace: 0.5 })) } };
/* A */
{
  const d = describeTarget({ kind: 'neuron', n: 40 }, src, null, { vu: shownVu, beatText: 'Beat 123' });
  const beatLines = d.lines.filter((l) => l.label !== 'Fired this beat' && (/beat/i.test(l.label) || /beat/i.test(l.value)));
  const fired = d.lines.find((l) => l.label === 'Fired this beat');
  ok(beatLines.length === 1 && beatLines[0].value === 'Beat 123', 'A: the overlay shows the header beat ("Beat 123"), not the latest recorded (138)');
  ok(fired && fired.value === 'no', 'A: "fired" is read from the shown beat (#40 fired on 138, not on 123)');
  ok(!d.lines.some((l) => l.label === 'Potential') && /Back to live/.test(d.lines.find((l) => l.label === 'Potential & memory').value), 'A: potential of another beat is not passed off as this one');
  const d7 = describeTarget({ kind: 'neuron', n: 7 }, src, null, { vu: shownVu, beatText: 'Beat 123' });
  ok(d7.lines.find((l) => l.label === 'Fired this beat').value === 'yes', 'A: #7 fired on the shown beat');
  const same = describeTarget({ kind: 'neuron', n: 40 }, src, null, { vu: latest, beatText: 'Beat 138' });
  ok(same.lines.find((l) => l.label === 'Potential').value === '0.4', 'A: on the latest beat, its real potential');
  const snap = describeTarget({ kind: 'neuron', n: 7 }, src, null, { vu: { tick: 140, indices: [7] }, beatText: 'Snapshot of beat 140' });
  ok(snap.lines.some((l) => l.value === 'Snapshot of beat 140'), 'A: Take control: "Snapshot of beat N"');
}
/* B */
{
  const d = describeTarget({ kind: 'neuron', n: 40 }, src, null);
  ok(!d.lines.some((l) => /beat/i.test(l.label) && l.label !== 'Fired this beat') && !d.lines.some((l) => /^\d+$/.test(l.value)), 'B: no shown beat -> no beat line');
}
/* C */
{
  const i = app.indexOf('function bvPaintAim('); ok(i > 0, 'C: bvPaintAim found');
  const fn = app.slice(i, i + app.slice(i).search(/\n\}/));
  ok(/describeTarget\(hit\.obj, vision\.inspectSrc, vision\.inspectModel, bvShownBeat\(\)\)/.test(fn), 'C: the overlay is given the shown beat');
  ok(/vision\.beatText/.test(app.slice(app.indexOf('function bvShownBeat('), app.indexOf('function bvShownBeat(') + 600)) && app.indexOf('function bvShownBeat(') > 0, 'C: bvShownBeat found and uses vision.beatText');
  ok(/\$\('#bvNumber'\)\.textContent = vision\.beatText;/.test(app), 'C: the header shows vision.beatText');
  ok(/vision\.beatText = beatHeader\(\{ snapshotTick: vision\.control \? vision\.control\.snap\.tick : null,/.test(app), 'C: Take control = "Snapshot of beat N" (game57 #4d: via beatHeader)');
  ok(app.includes('fmt: beatText })'), 'C: one format (item 6)');
  ok(/const key = d \? hit\.id \+ '\|' \+ d\.lines/.test(fn), 'C: the overlay repaints when its beat changes');
}
console.log('test-one-beat-overlay-20261026: ' + count + ' assertions, OK');
