/* test-trous-creations-20261009.mjs — UN TROU DE CREATIONS SE RELIT, ET IL NE RECULE QUE SUR UNE RELECTURE COMPLETE.
 *
 * Contexte : base.org a refuse tout getLogs (~2026-10-07) ; le scan a avance en sautant 52302101 -> 52381409 (35 fenetres) et ne
 * l avait que NOTE, en memoire — perdu au redeploiement. Le noeud d archive (CDP) etant pose, `relireUnTrou` (serveur-web.js) relit
 * le plus ancien trou par 10 000 blocs au plus. Les gardes, EXECUTEES sur la fonction extraite du fichier livre :
 *   A. sans noeud d archive : rien ; une page refusee : le trou ne bouge PAS ; une relecture complete : il recule, les creations
 *      entrent dans blocksConnus, les createurs sont resolus ; fini : il passe dans trousRelus avec ses compteurs.
 *   B. persistance (chargement + sauvegarde) et graine UNIQUE du trou mesure ; publication dans /sante.
 *   A5-A7 (2026-10-09, audit du budget d archive) : budget epuise -> aucune lecture, le trou attend ; un refus de budget est NOMME ;
 *      un createur que `createurDe` ne resout pas est GARDE dans `createursNonResolus` (le trou, lui, recule quand meme). */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
const i = src.indexOf('async function relireUnTrou() {');
const fin = /\r?\n\}\r?\n/.exec(src.slice(i));
assert.ok(i > 0 && fin, 'relireUnTrou introuvable');
const corps = src.slice(i, i + fin.index + fin[0].length);
let n = 0;
const cas = async (titre, f) => { n++; try { await f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const BUDGET = 'archive node daily budget reached (10000 calls)';

/* les deux juges du budget, extraits tels que livres (meme extraction que test-rattrapage-budget-20261009.mjs) */
const iJ = src.indexOf('const RE_BUDGET_ARCHIVE'), jJ = src.indexOf('/* ⛔⛔ 2026-10-09 (mesure en prod, noeud d archive pose)', iJ);
assert.ok(iJ > 0 && jJ > iJ, 'juges du budget introuvables');
const { refusDeBudget } = new Function('RPC_ARCHIVE', 'archiveCompte', 'ARCHIVE_MAX_JOUR', src.slice(iJ, jJ) + '\n; return { archiveEpuisee, refusDeBudget };')('https://a.example/x', {}, 10);
/* garderNonResolu extraite telle que livree ; absente du code d avant -> doublure muette, pour que les cas d avant tournent encore */
const iG = src.indexOf('function garderNonResolu(c) {');
const fG = iG < 0 ? null : /\r?\n\}\r?\n/.exec(src.slice(iG));
const srcGarde = iG < 0 ? null : src.slice(iG, iG + fG.index + fG[0].length);
const monterGarde = (createurParBlock, liste) => (srcGarde
  ? new Function('createurParBlock', 'createursNonResolus', 'CREATEURS_NON_RESOLUS_MAX', 'console', 'let createursNonResolusJetes = 0;\n' + srcGarde + '\n; return garderNonResolu;')(createurParBlock, liste, 5000, { log: () => {} })
  : () => {});

function monter({ archive = 'https://archive.example/x', trous = [], lister, epuise = false, createur = (tx) => '0x' + tx.slice(2, 42) }) {
  const etat = { blocksConnus: new Set(), createurParBlock: new Map(), trousCreations: trous, trousRelus: [], appels: [], nonResolus: [] };
  const f = new Function('RPC_ARCHIVE', 'trousCreations', 'trousRelus', 'blocksConnus', 'createurParBlock', 'listerCreations', 'rpcHistoire', 'createurDe', 'rpcServeur',
    'archiveEpuisee', 'refusDeBudget', 'garderNonResolu',
    corps + '\n; return relireUnTrou;')(archive, etat.trousCreations, etat.trousRelus, etat.blocksConnus, etat.createurParBlock,
    async (o) => { etat.appels.push(o); return lister(o); }, () => {}, async ({ tx }) => ({ createur: createur(tx) }), () => {},
    () => epuise, refusDeBudget, monterGarde(etat.createurParBlock, etat.nonResolus));
  return { f, etat };
}
const jeton = (k) => '0xb2' + String(k).padStart(38, '0');
const tx = (k) => '0x' + 'c'.repeat(40 - String(k).length) + k + 'd'.repeat(24);

await cas('A1 sans noeud d archive : aucune lecture', async () => {
  const { f, etat } = monter({ archive: null, trous: [{ de: 100, a: 200 }], lister: () => { throw new Error('ne doit pas lire'); } });
  assert.equal(await f(), null);
  assert.equal(etat.appels.length, 0);
});
await cas('A2 une page refusee : le trou ne bouge pas, rien n entre', async () => {
  const { f, etat } = monter({ trous: [{ de: 1000, a: 50000 }], lister: () => ({ creations: [{ jeton: jeton(1), tx: tx(1) }], fenetresRatees: [{ quoi: 'x' }] }) });
  const r = await f();
  assert.equal(r.ratees, 1);
  assert.deepEqual(etat.trousCreations[0], { de: 1000, a: 50000 }, 'le trou a recule sur une lecture partielle');
  assert.equal(etat.blocksConnus.size, 0);
});
await cas('A3 relecture complete : au plus 10 000 blocs, le trou recule, creations + createurs', async () => {
  const { f, etat } = monter({ trous: [{ de: 1000, a: 50000 }], lister: () => ({ creations: [{ jeton: jeton(1), tx: tx(1) }, { jeton: jeton(2), tx: tx(2) }], fenetresRatees: [] }) });
  const r = await f();
  assert.equal(etat.appels[0].fin, 11000); assert.equal(etat.appels[0].blocs, 10000);
  assert.equal(etat.trousCreations[0].de, 11000);
  assert.equal(r.creations, 2); assert.equal(r.nouvelles, 2);
  assert.ok(etat.blocksConnus.has(jeton(1)) && etat.blocksConnus.has(jeton(2)));
  assert.equal(etat.createurParBlock.size, 2);
});
await cas('A4 fin du trou : il passe dans trousRelus avec ses compteurs ; un block deja connu n est pas « nouveau »', async () => {
  const { f, etat } = monter({ trous: [{ de: 1000, a: 5000 }], lister: () => ({ creations: [{ jeton: jeton(3), tx: tx(3) }], fenetresRatees: [] }) });
  etat.blocksConnus.add(jeton(3));
  const r = await f();
  assert.equal(etat.appels[0].fin, 5000, 'la derniere tranche ne depasse pas le trou');
  assert.equal(etat.trousCreations.length, 0);
  assert.equal(etat.trousRelus.length, 1);
  assert.equal(etat.trousRelus[0].relues, 1); assert.equal(etat.trousRelus[0].nouvelles, 0); assert.ok(etat.trousRelus[0].fini);
  assert.equal(r.nouvelles, 0);
});
await cas('A5 budget d archive epuise : AUCUNE lecture (le refus est certain), le trou reste en tete, intact', async () => {
  const { f, etat } = monter({ epuise: true, trous: [{ de: 1000, a: 50000 }], lister: () => { throw new Error('ne doit pas lire'); } });
  assert.equal(await f(), null);
  assert.equal(etat.appels.length, 0, 'relireUnTrou a appele le noeud d archive avec un budget epuise');
  assert.deepEqual(etat.trousCreations, [{ de: 1000, a: 50000 }]);
});
await cas('A6 pages refusees par le BUDGET : le refus est nomme (budget: true) ; un refus du noeud, non ; le trou ne bouge pas', async () => {
  const a = monter({ trous: [{ de: 1000, a: 50000 }], lister: () => ({ creations: [], fenetresRatees: [{ de: 1, a: 2, cause: BUDGET }, { de: 3, a: 4, cause: BUDGET }] }) });
  const ra = await a.f();
  assert.equal(ra.ratees, 2); assert.equal(ra.budget, true, 'un refus de budget se lit comme une panne du noeud');
  assert.deepEqual(a.etat.trousCreations[0], { de: 1000, a: 50000 });
  const b = monter({ trous: [{ de: 1000, a: 50000 }], lister: () => ({ creations: [], fenetresRatees: [{ de: 1, a: 2, cause: BUDGET }, { de: 3, a: 4, cause: 'HTTP 503' }] }) });
  assert.equal((await b.f()).budget, false, 'un refus du noeud melange doit compter comme refus du noeud');
  assert.match(nu, /\(rt\.budget \? ', archive budget' : ''\)/, 'le refus de budget de la relecture n est pas dit dans le journal');
});
await cas('A7 createur NON resolu (createurDe -> null) : garde { jeton, tx } dans createursNonResolus ; le resolu est indexe ; le trou recule', async () => {
  const { f, etat } = monter({ trous: [{ de: 1000, a: 50000 }], createur: (t) => (t === tx(2) ? null : '0x' + t.slice(2, 42)),
    lister: () => ({ creations: [{ jeton: jeton(1), tx: tx(1) }, { jeton: jeton(2), tx: tx(2) }], fenetresRatees: [] }) });
  await f();
  assert.equal(etat.trousCreations[0].de, 11000);
  assert.ok(etat.createurParBlock.has(jeton(1)) && !etat.createurParBlock.has(jeton(2)));
  assert.deepEqual(etat.nonResolus, [{ jeton: jeton(2), tx: tx(2) }], 'le block non resolu est perdu : le trou a recule sans lui');
});

await cas('B1 persistance, graine unique, /sante', async () => {
  /* 2026-10-09 : `slice(-50)` jetait [0] (le trou en relecture) -> la file est bornee a 200 par `bornerTrousCreations`, qui fond sans jeter */
  assert.match(nu, /trousCreations: trousCreations\.slice\(0, TROUS_CREATIONS_MAX\), trousRelus: trousRelus\.slice\(-50\), trouSeme20261009,/);
  assert.match(nu, /for \(const t of \(Array\.isArray\(x\.trousCreations\) \? x\.trousCreations : \[\]\)\) if \(trouSain\(t\)\) trousCreations\.push\(t\);/);
  assert.match(nu, /if \(x\.trouSeme20261009 === true\) trouSeme20261009 = true;/);
  assert.match(nu, /if \(RPC_ARCHIVE && !trouSeme20261009\) \{ trousCreations\.unshift\(\{ \.\.\.TROU_MESURE_20261009 \}\); trouSeme20261009 = true; \}/);
  assert.match(nu, /const TROU_MESURE_20261009 = Object\.freeze\(\{ de: 52302101, a: 52381409,/);
  assert.match(nu, /trousRelus: trousRelus\.slice\(-10\)/);
});
await cas('B2 l histoire profonde va DIRECTEMENT au noeud d archive (mesure : la chaine base.org 429 -> publicnode 403 figeait tout)', async () => {
  assert.match(nu, /async function rpcHistoire\(methode, params\) \{\s+if \(RPC_ARCHIVE && methode === 'eth_getLogs'\) \{ if \(!archiveDirect\) archiveDirect = lecteurArchive\('histoire'\); return archiveDirect\(methode, params\); \}\s+return rpcServeur\(methode, params\);/);
  assert.match(nu, /const r = await listerCreations\(\{ rpc: rpcHistoire, blocs: haut - t\.de, fin: haut \}\);/);
  assert.match(nu, /const lecteur = tete - haut > PROFONDEUR_PUBLICNODE \? rpcHistoire : rpcServeur;/);
  assert.match(nu, /if \(!Array\.isArray\(logs\)\) throw new Error\('not a list'\);/);
});

await cas('B3 index des createurs : plafond 100 000 COMPTE, relecture unique si l ancien plafond (5 000) a coupe, 100 000 blocs/passe avec archive', async () => {
  assert.match(nu, /const CREATEURS_DISQUE_MAX = 100000;/);
  assert.ok(!/createurParBlock\.entries\(\)\]\.slice\(-5000\)/.test(nu), 'l ancien plafond de 5 000 est encore la');
  assert.match(nu, /else if \(\(x\.createurs \|\| \[\]\)\.length >= 5000\) \{ rattrapageDepuis = null; createursRelecture20261009 = true;/);
  assert.match(nu, /createursRelecture20261009,/);
  assert.match(nu, /const bas = Math\.max\(PREMIER_BLOCK_TB, haut - \(RPC_ARCHIVE \? 100000 : 10000\)\);/);
  assert.match(nu, /listerCreations\(\{ rpc: RPC_ARCHIVE \? rpcHistoire : rpcServeur, blocs: haut - bas, fin: haut \}\)/);
});

console.log('✓ ' + n + ' cas — les trous de creations se relisent, et ne reculent que sur une relecture complete');
