/* test-recherche-serveur-20261010.mjs - LE SERVEUR TROUVE UN BLOCK PAR SON NOM OU SYMBOLE (re-QA Grok Super : 'No block named "IB022" among the 241
 * read here'). EXECUTE recherche-noms.js (chercherNom, creerIndexNoms) avec un faux noeud ; lit le cablage de serveur-web.js et d app.html.
 * AFFIRME : nom et symbole exacts sans casse ; homonymes = AMBIGU (refus) ; inconnu = ABSENT ; un echec de lecture n est pas retenu ; le fond
 * lit au plus 40 blocks par tour, en eth_call 'latest' ; la route est GET, en cache, et le panneau ne la consulte qu apres un echec local.
 * NE PROUVE PAS : qu IB022 est lu en prod (le fond remplit 40 blocks/min : NON mesure), ni le rendu navigateur.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const mod = await import(process.env.TB_MOD || './recherche-noms.js');
const { chercherNom, creerIndexNoms, SEL_NOM, SEL_SYM } = mod;
const IB = '0xb200000000000000000000e4b0c5fbe9c8df579e', A = '0x' + 'a1'.repeat(20), B = '0x' + 'b1'.repeat(20);
const abiStr = (s) => { const h = Buffer.from(s, 'utf8').toString('hex'); return '0x' + '20'.padStart(64, '0') + (h.length / 2).toString(16).padStart(64, '0') + h.padEnd(Math.ceil(h.length / 64) * 64, '0'); };
let appels = 0;
const noeud = { [IB]: { [SEL_NOM]: 'Smoke IB022', [SEL_SYM]: 'IB022' }, [A]: { [SEL_NOM]: 'Twin', [SEL_SYM]: 'TW1' }, [B]: { [SEL_NOM]: 'Twin', [SEL_SYM]: 'TW2' } };
const idx = creerIndexNoms({ lire: async (a, sel) => { appels++; if (!noeud[a]) throw new Error('HTTP 429'); return abiStr(noeud[a][sel]); } });
const casse = '0x' + 'c1'.repeat(20);
await idx.remplir([IB, A, B, casse], 40, 1e9);
assert.equal(idx.taille(), 3, 'noms lus : ' + idx.taille());
assert.ok(!idx.entrees().some((e) => e.adr === casse), 'un echec de lecture a ete retenu');
const avant = appels; await idx.remplir([IB, A, B, casse], 40, 1e9 + 1000); assert.equal(appels, avant, 'un nom lu (ou un echec recent) relu aussitot');
for (const q of ['IB022', 'ib022', 'Smoke IB022', ' smoke  ib022 ']) { const r = chercherNom(q, idx.entrees()); assert.equal(r.etat, 'TROUVE', q); assert.equal(r.adr, IB); }
const amb = chercherNom('Twin', idx.entrees()); assert.equal(amb.etat, 'AMBIGU'); assert.equal(amb.n, 2);
assert.equal(chercherNom('Nope', idx.entrees()).etat, 'ABSENT');
assert.equal(chercherNom('', idx.entrees()).etat, 'REFUSE');
const borne = creerIndexNoms({ lire: async () => abiStr('X') }); await borne.remplir(Array.from({ length: 100 }, (_, i) => '0x' + String(i).padStart(40, '0')), 40, 1);
assert.equal(borne.taille(), 40, 'le fond lit plus de 40 blocks par tour');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
assert.match(srv, /if \(chemin === '\/api\/chercher'\) \{/);
assert.match(srv, /rpcServeur\('eth_call', \[\{ to: a, data: sel \}, 'latest'\]\)/, 'lecture des noms hors eth_call latest');
/* 2026-10-10 : 120 par tour tant que l index n a pas tout lu. ⛔ 2026-10-10 (fc3e8c5) : la liste est l UNION nos blocks + blocksConnus
 *   + index des createurs (IB022 n etait que dans ce dernier) — voir test-noms-union-createurs-20261010.mjs. */
assert.match(srv, /indexNoms\.remplir\(liste, indexNoms\.taille\(\) < liste\.length \? 120 : 40\)/);
assert.match(srv, /Date\.now\(\) - deja\.t < 30000/, 'route sans cache');
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const iS = app.indexOf('let j = bcResoudre(v);'), iF = app.indexOf("fetch('/api/chercher?q='", iS);
assert.ok(iS > 0 && iF > iS && iF - iS < 1200, 'le panneau ne consulte pas l index du serveur apres un echec local');
console.log('ok recherche-serveur - nom/symbole, homonymes refuses, borne 40/tour, cache ; NE PROUVE PAS le remplissage en prod');