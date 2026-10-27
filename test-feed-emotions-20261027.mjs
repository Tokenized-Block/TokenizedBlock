// test-feed-emotions-20261027 : each Feed line says its block's mood + feeling, read off THAT block's own recorded beats on this page,
// and glows in its mood's colour; a block with no beat shows nothing (never a made-up mood).
// Bound: static reading of app.html + the real pensee-cerveau.js on a fake 16-beat history; the rendering in a browser is not run.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { pensee } from './pensee-cerveau.js';
const app = readFileSync(new URL('app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const fil = app.slice(app.indexOf('function peindreFil('), app.indexOf('function peindreFilAncien('));
assert.ok(/const hF = habitants\.find\(\(x\) => String\(x\.adr\)\.toLowerCase\(\) === String\(l\.token\)\.toLowerCase\(\)\);/.test(fil), 'the line finds ITS block');
assert.ok(/const p = H\.length \? penseeVision\(H, H\.length - 1, \{\}\) : null;/.test(fil), 'its feeling = the reading of its own beats; none without beats');
assert.ok(/data-phase="' \+ enTexte\(ph\) \+ '"/.test(fil) && /\.filEmo\[data-phase="EXCITE"\]/.test(app), 'the line glows by its mood');
assert.ok(/h\.histoCourt = \(h\.histoCourt \|\| \[\]\)\.concat\(\[r\.vu\]\)\.slice\(-16\);/.test(app), 'each block keeps its last 16 beats, once per tick');
const vu = (t) => ({ tick: t, phase: 'CALME', spikes: 4, memoire: 0.1, virage: 0, vitesse: 0.1, delta: 0, nouveaux: { achats: 0, ventes: 0, detenteurs: 0, gm: 0, messages: 0 } });
const H = Array.from({ length: 16 }, (_, i) => vu(i + 1));
const p = pensee(H, 15, {});
assert.ok(p && p.mood && p.reading && typeof p.reading.word === 'string' && p.reading.word.length > 0, 'the real module gives a mood and a feeling (' + (p && p.mood) + ' · ' + (p && p.reading && p.reading.word) + ')');
console.log('test-feed-emotions-20261027: 5 assertions, OK (' + p.mood + ' · ' + p.reading.word + ')');
