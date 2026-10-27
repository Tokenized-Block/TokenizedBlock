// test-centre-ciblage-20261027 : the "centre of the universe" draw (every 5 min) no longer yanks the camera off a block the visitor
// targeted (search pick / click), and aiming at the drawn centre aims at the origin it slides to.
// Bound: static reading of app.html + the guard evaluated on its 3 inputs; the camera flight itself is map3d.js (not re-run here).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const app = readFileSync(new URL('app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const nc = app.slice(app.indexOf('function nouveauCentre('), app.indexOf('function peindreCentre('));
assert.ok(/const cible = \(\$\('#cote'\) && \$\('#cote'\)\.classList\.contains\('aFiche'\)\) \|\| habitants\.some\(\(x\) => x && x\.el && x\.el\.classList\.contains\('actif'\)\);/.test(nc), 'the draw reads whether a block is targeted');
assert.ok(/\(parClic \|\| \(!mainRecente && !mouvementReduit && !cible\)\)/.test(nc), 'a targeted block keeps the camera (a click on the draw still moves it)');
const bouge = (parClic, mainRecente, mouvementReduit, cible) => parClic || (!mainRecente && !mouvementReduit && !cible);
assert.equal(bouge(false, false, false, true), false, 'targeted: the timed draw does not move the camera');
assert.equal(bouge(false, false, false, false), true, 'nothing targeted: the draw shows the origin as before');
assert.equal(bouge(true, false, false, true), true, 'the visitor clicked the draw: it moves');
const cs = app.slice(app.indexOf('function centrerSur(h)'), app.indexOf('function centrerSur(h)') + 400);
assert.ok(/if \(h && h === ce && typeof moteur3d\.montrerOrigine === 'function'\) moteur3d\.montrerOrigine\(\); else moteur3d\.centrerSur\(h\);/.test(cs), 'aiming at the drawn centre aims at the origin');
assert.ok(/try \{ ce = centreActuel; \} catch/.test(cs), 'no TDZ throw before the draw exists');
console.log('test-centre-ciblage-20261027: 7 assertions, OK');
