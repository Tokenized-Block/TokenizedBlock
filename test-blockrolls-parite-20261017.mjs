/* test-blockrolls-parite-20261017.mjs — LA FACE QUE BlockRolls CALCULE ON-CHAIN = CELLE QUE L APP AFFICHE (face-du-jour.js).
 * AFFIRME : (1) les valeurs epinglees dans contracts/test/BlockRolls.t.sol (test_PariteFaceDuJour, verifiees par forge contre le contrat
 *   COMPILE) sont recalculees ici avec les modules de l app (faceRevelee -> apparenceDepuisAdresse, bandeTeinte) et sont egales trait par
 *   trait ; (2) au moins 5 hashes, dont les bords de teinte (330..359 -> bande 0, et 360 -> bande 0) ; (3) les tailles de listes du contrat
 *   (BANDS 6, ORBITS 10, FACETS 19, MATERIALS 9, ORNAMENTS 8) = celles de l app — une option ajoutee au menu sans le contrat rougit ici.
 * La boucle est fermee : forge dit contrat == epingle, ce test dit app == epingle. Ne prouve PAS Base (voir banc-blockrolls-fork). */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { faceRevelee, bandeTeinte, BANDES } from './face-du-jour.js';
import { ORBITES, FACETTES, MATIERES, ORNEMENTS } from './apparence.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const sol = readFileSync(new URL('./contracts/test/BlockRolls.t.sol', import.meta.url), 'utf8');
const src = readFileSync(new URL('./contracts/src/BlockRolls.sol', import.meta.url), 'utf8');

/* (3) tailles des listes */
const taille = (nom) => Number((new RegExp('uint8 public constant ' + nom + ' = (\\d+);').exec(src) || [])[1]);
vu(taille('BANDS') === BANDES.length && taille('ORBITS') === ORBITES.length && taille('FACETS') === FACETTES.length
  && taille('MATERIALS') === MATIERES.length && taille('ORNAMENTS') === ORNEMENTS.length, 'tailles des listes : contrat = app (6/10/19/9/8)');

/* (1) les epingles */
const corps = (/function test_PariteFaceDuJour\(\)[^{]*\{([\s\S]*?)\n    \}/.exec(sol) || [])[1] || '';
const pins = [...corps.matchAll(/_parite\((0x[0-9a-f]{64}),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/g)]
  .map((m) => ({ h: m[1], v: m.slice(2).map(Number) }));
vu(pins.length >= 5, 'au moins 5 hashes epingles (' + pins.length + ')');
for (const { h, v } of pins) {
  const f = faceRevelee(h);
  const js = [BANDES.indexOf(bandeTeinte(f.teinte)), ORBITES.indexOf(f.orbite), FACETTES.indexOf(f.facette), MATIERES.indexOf(f.matiere), ORNEMENTS.indexOf(f.ornement), f.teinte];
  vu(js.every((x) => x >= 0) && JSON.stringify(js) === JSON.stringify(v), 'parite ' + h.slice(0, 12) + '… app ' + JSON.stringify(js) + ' = contrat ' + JSON.stringify(v));
}
/* (2) les bords de teinte sont couverts */
vu(pins.some((p) => p.v[5] === 360 && p.v[0] === 0), 'teinte 360 -> bande 0 (red) couverte');
vu(pins.some((p) => p.v[5] >= 330 && p.v[5] < 360 && p.v[0] === 0), 'teinte 330..359 -> bande 0 couverte');
/* temoin : le test sait rougir — une epingle faussee n est PAS egale */
const f0 = faceRevelee(pins[0].h);
vu(ORBITES.indexOf(f0.orbite) !== (pins[0].v[1] + 1) % 10, 'temoin : une orbite decalee de 1 serait vue');
console.log('ok blockrolls-parite - ' + n + ' assertions');
