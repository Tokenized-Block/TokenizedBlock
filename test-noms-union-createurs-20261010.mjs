/* test-noms-union-createurs-20261010.mjs - IB022 introuvable par son nom alors que le serveur le connait (mesure prod 2026-10-10,
 * x-ms-monitor : /api/chercher?q=IB022 -> ABSENT, « nomsLus 2 951 / blocksConnus 2 951 » ; /api/voix/<IB022> rend son createur et
 * /api/blocks-de le liste : il est dans l index des CREATEURS, 14 928 entrees, pas dans `blocksConnus`).
 * EXECUTE `adressesANommer`, `creerIndexNoms` et `chercherNom` (recherche-noms.js, TB_NOMS = ancienne version pour le ROUGE) avec un
 * lecteur simule. AFFIRME : (1) l union garde l ordre des sources (nos blocks d abord), sans doublon, en minuscules, adresses entieres
 * seulement ; (2) TEMOIN : nommer `blocksConnus` seul laisse IB022 ABSENT ; nommer l union le rend TROUVE ; (3) le serveur passe
 * bien les TROIS sources a l index et dit `aNommer` dans la couverture (lecture du texte de serveur-web.js : le cablage ne s execute
 * pas sans demarrer le serveur).
 * NE PROUVE PAS : le temps de remplissage en prod (~2 h estime a 120 adresses/min), ni que chaque nom se lise sur la chaine.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const mod = await import(process.env.TB_NOMS || new URL('./recherche-noms.js', import.meta.url).href);
const { creerIndexNoms, chercherNom, SEL_NOM, SEL_SYM } = mod;
assert.equal(typeof mod.adressesANommer, 'function', 'adressesANommer absente de recherche-noms.js');
const { adressesANommer } = mod;
let n = 0;

/* adresses copiees de pool-sans-hook.js:182 (IB022) et /api/nos-blocks (prod) ; les autres sont fabriquees pour le test */
const IB022 = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const NOS = '0xb200000000000000000000ab549fa65ad4edae3f';
const AUTRE = '0x' + 'c1'.repeat(20);

const l = adressesANommer(new Set([NOS]), new Set([AUTRE, NOS]), new Map([[IB022.toUpperCase().replace('0X', '0x'), 'x'], ['pas-une-adresse', 'y']]).keys());
assert.deepEqual(l, [NOS, AUTRE, IB022], JSON.stringify(l)); n++;

/* lecteur simule : name()/symbol() encodes en ABI string */
const abiTexte = (s) => { const h = Buffer.from(s, 'utf8').toString('hex'); return '0x' + (32).toString(16).padStart(64, '0') + s.length.toString(16).padStart(64, '0') + h.padEnd(64, '0'); };
const NOMS = { [IB022]: ['IB022', 'IB022'], [NOS]: ['ab549f', 'AB5'], [AUTRE]: ['Autre', 'AUT'] };
const lire = async (a, sel) => { const x = NOMS[a]; if (!x) throw new Error('inconnu'); return abiTexte(sel === SEL_NOM ? x[0] : sel === SEL_SYM ? x[1] : ''); };

const avant = creerIndexNoms({ lire });
await avant.remplir([NOS, AUTRE], 120);
assert.equal(chercherNom('IB022', avant.entrees()).etat, 'ABSENT', 'TEMOIN : blocksConnus seul devait laisser IB022 ABSENT'); n++;

const apres = creerIndexNoms({ lire });
await apres.remplir(adressesANommer([NOS], [AUTRE], new Map([[IB022, '0x6acc']]).keys()), 120);
const r = chercherNom('IB022', apres.entrees());
assert.equal(r.etat, 'TROUVE', JSON.stringify(r)); assert.equal(r.adr, IB022); n++;

const srv = readFileSync(process.env.TB_SRV || new URL('./serveur-web.js', import.meta.url), 'utf8');
assert.match(srv, /adressesANommer\(nosBlocksEtat\.blocks, blocksConnus, createurParBlock\.keys\(\)\)/, 'le serveur ne nomme pas les trois sources');
assert.match(srv, /couverture: \{ nomsLus: indexNoms\.taille\(\), aNommer: aNommerTaille,/, 'la couverture ne dit pas aNommer');
assert.doesNotMatch(srv, /indexNoms\.remplir\(\[\.\.\.blocksConnus\]/, 'l ancien remplissage sur blocksConnus seul est encore la'); n++;

console.log('ok noms-union-createurs ' + n + '/4 - IB022 (index des createurs) devient trouvable ; NE PROUVE PAS le temps de remplissage en prod');
