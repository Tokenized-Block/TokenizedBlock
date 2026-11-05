// test-denim-textes-20261105.mjs — LES PAGES DE DEPLOIEMENT NE DISENT PLUS « about 8.5 minutes today » POUR LA FENETRE DE 256 BLOCS.
// AFFIRME (lecture des pages, texte SOURCE : aucun text-transform sur ces <li>) : deployer-blockrolls / deployer-duels / deployer-duels-v2
//   disent ~51 s a 200 ms (Denim) d abord, 8,5 min seulement comme « les blocs de 2 s d avant », et le chiffre 51 est 256 x 0,2 (calcule ici).
//   Mutant : l ancienne phrase remise -> rouge. NE PROUVE PAS : le rendu ; ni la date d activation reelle de Denim (« targeted »).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n++; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8');
const PAGES = ['deployer-blockrolls.html', 'deployer-duels.html', 'deployer-duels-v2.html'];
const PHRASE = "about 51 seconds at Base's 200 ms blocks (Denim, mainnet targeted for 2026-11-05 18:00 UTC; it was about 8.5 minutes at the earlier 2-second blocks)";
const banc = (txt) => txt.includes(PHRASE) && !/8\.5 minutes today/.test(txt) && !/once Base moves to 200 ms blocks/.test(txt);
vu(Math.round(256 * 0.2) === 51 && Math.round((256 * 2) / 60 * 10) / 10 === 8.5, '51 s = 256 x 0,2 s ; 8,5 min = 256 x 2 s');
for (const p of PAGES) vu(banc(lire(p)), p + ' : la fenetre dite a 200 ms, 8,5 min au passe');
const mutant = lire('deployer-blockrolls.html').replace(PHRASE, 'about 8.5 minutes today, about 51 seconds once Base moves to 200 ms blocks (Denim)');
vu(!banc(mutant), 'mutant TUE — ancienne phrase remise');
console.log('ok denim-textes — ' + n + ' assertions, 1/1 mutant tue');
