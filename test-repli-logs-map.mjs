/* test-repli-logs-map.mjs — LA MAP NE SE VIDE PLUS QUAND base.org REFUSE LES getLogs (2026-10-09).
 *
 * Mesure du 2026-10-09 : `mainnet.base.org` -> 429 « request limit reached » sur TOUT eth_getLogs ;
 * `developer-access-mainnet.base.org` -> 503. `/api/trending` de prod : fenetresRatees 40, 39 lignes
 * (26 actions emetteur, 13 blocks), paire la plus recente 2026-10-06. Dans le navigateur : 0 block
 * `.nous` sur la Map apres 305 s, `/api/nos-blocks` en servant 4.
 *
 * Deux gardes :
 *   A. `avecRepliLogs` (serveur) : un getLogs refuse par le principal est redemande au repli ; seul un
 *      TABLEAU est une reponse ; l erreur du principal ressort si tout echoue ; les autres methodes ne
 *      partent jamais au repli. Et le scan des creations de `lireTrending` l utilise.
 *      ⛔ SAUF un refus de BUDGET du noeud d archive (dernier repli de rpcServeur) : il est NOMME en tete de
 *      l erreur, le message du principal suit (A10/A11).
 *   B. `charger()` (app.html) pose nos blocks AVANT et INDEPENDAMMENT du balayage de la factory.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { avecRepliLogs } from './repli-logs.js';
import { listerCreations, FACTORY, TOPIC_CREATED } from './index-blocks.js';

let n = 0;
const cas = async (titre, f) => { n++; try { await f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const refus = () => { throw new Error('request limit reached'); };

await cas('A1 getLogs refuse par le principal -> le repli repond', async () => {
  const rpc = avecRepliLogs(async () => refus(), [async () => [{ x: 1 }]]);
  assert.deepEqual(await rpc('eth_getLogs', [{}]), [{ x: 1 }]);
});

await cas('A2 le principal qui repond n appelle JAMAIS le repli', async () => {
  let appels = 0;
  const rpc = avecRepliLogs(async () => ['p'], [async () => { appels++; return ['r']; }]);
  assert.deepEqual(await rpc('eth_getLogs', [{}]), ['p']);
  assert.equal(appels, 0);
});

await cas('A3 une autre methode ne part pas au repli : l erreur du principal ressort', async () => {
  let appels = 0;
  const rpc = avecRepliLogs(async () => refus(), [async () => { appels++; return '0x1'; }]);
  await assert.rejects(rpc('eth_call', [{}]), /request limit reached/);
  assert.equal(appels, 0);
});

await cas('A4 un repli qui ne rend pas un tableau n est PAS « aucune creation »', async () => {
  for (const faux of [null, undefined, '0x', {}, 0]) {
    const rpc = avecRepliLogs(async () => refus(), [async () => faux]);
    await assert.rejects(rpc('eth_getLogs', [{}]), /request limit reached/, 'repli ' + JSON.stringify(faux));
  }
});

await cas('A5 repli qui jette -> repli suivant ; tous jettent -> erreur du PRINCIPAL', async () => {
  const ok = avecRepliLogs(async () => refus(), [async () => { throw new Error('403 archive'); }, async () => ['b']]);
  assert.deepEqual(await ok('eth_getLogs', [{}]), ['b']);
  const ko = avecRepliLogs(async () => refus(), [async () => { throw new Error('403 archive'); }]);
  await assert.rejects(ko('eth_getLogs', [{}]), /request limit reached/);
});

await cas('A6 bout a bout : listerCreations sur un principal qui refuse TOUT getLogs', async () => {
  /* un log de creation minimal, decodable : topics[1] = jeton (CREATE2 0xb2…) */
  const jeton = '0xb2' + '1'.repeat(38);
  const log = { address: FACTORY, topics: [TOPIC_CREATED, '0x' + '0'.repeat(24) + jeton.slice(2), '0x' + '0'.repeat(64)], data: '0x',
    blockNumber: '0x64', transactionHash: '0x' + 'a'.repeat(64), logIndex: '0x0' };
  const principal = async (m) => { if (m === 'eth_blockNumber') return '0x64'; return refus(); };
  const sans = await listerCreations({ rpc: principal, blocs: 50, fin: 100 });
  assert.equal(sans.creations.length, 0);
  assert.ok(sans.fenetresRatees.length > 0, 'sans repli la fenetre doit etre RATEE, pas vide');
  const avec = await listerCreations({ rpc: avecRepliLogs(principal, [async () => [log]]), blocs: 50, fin: 100 });
  assert.equal(avec.fenetresRatees.length, 0);
  assert.ok(avec.creations.length >= 1, 'le repli a repondu mais aucune creation n est sortie : ' + JSON.stringify(avec.creations));
});

await cas('A8 lecteurUrl : une erreur JSON-RPC (403 archive) ou un HTTP en echec JETTE, jamais un tableau vide', async () => {
  const { lecteurUrl } = await import('./repli-logs.js');
  const repond = (corps, status = 200) => async () => ({ status, json: async () => corps });
  await assert.rejects(lecteurUrl('http://x', { fetchImpl: repond({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Archive requests require a personal token' } }, 403) })('eth_getLogs', [{}]), /Archive/);
  await assert.rejects(lecteurUrl('http://x', { fetchImpl: repond({ jsonrpc: '2.0', id: 1 }) })('eth_getLogs', [{}]));
  assert.deepEqual(await lecteurUrl('http://x', { fetchImpl: repond({ jsonrpc: '2.0', id: 1, result: [] }) })('eth_getLogs', [{}]), []);
  /* bout a bout : un repli qui refuse l archive laisse la fenetre RATEE */
  const rpc = avecRepliLogs(async () => refus(), [lecteurUrl('http://x', { fetchImpl: repond({ jsonrpc: '2.0', id: 1, error: { message: '403 archive' } }, 403) })]);
  await assert.rejects(rpc('eth_getLogs', [{}]), /request limit reached/);
});

/* ⛔⛔ 2026-10-09 — LE REFUS DE BUDGET D UN REPLI ETAIT AVALE. Le noeud d archive est le DERNIER repli de rpcServeur ; budget du
 *   jour epuise, il refuse sans appel (« archive node daily budget reached »). Ce refus tombait dans le `catch` du repli et c est
 *   l erreur du PRINCIPAL (base.org) qui sortait : un refus certain jusqu a 00 h UTC se lisait comme un debit passager. */
const BUDGET = 'archive node daily budget reached (10000 calls)';
await cas('A10 un repli refuse par le BUDGET d archive : l erreur NOMME le budget en tete, et garde le message du principal', async () => {
  const p = new Error('request limit reached');
  const rpc = avecRepliLogs(async () => { throw p; }, [async () => { throw new Error('403 archive'); }, async () => { throw new Error(BUDGET); }]);
  const e = await rpc('eth_getLogs', [{}]).then(() => null, (x) => x);
  assert.ok(e instanceof Error, 'un refus partout doit JETER une erreur');
  assert.ok(e.message.startsWith(BUDGET), 'le budget doit ouvrir le message (un journal tronque le garde) : ' + e.message);
  assert.match(e.message, /request limit reached/, 'le message du principal a disparu');
  assert.equal(e.cause, p, 'l erreur du principal doit rester accrochee (cause)');
  /* le budget d un repli place AVANT un autre repli qui echoue aussi est nomme de meme */
  const avant = avecRepliLogs(async () => refus(), [async () => { throw new Error(BUDGET); }, async () => { throw new Error('403 archive'); }]);
  await assert.rejects(avant('eth_getLogs', [{}]), (x) => x instanceof Error && x.message.startsWith(BUDGET));
});

await cas('A11 le reste NE BOUGE PAS : sans refus de budget, l erreur du principal ELLE-MEME ; un repli qui sert gagne ; les autres methodes ne partent pas', async () => {
  const p = new Error('request limit reached');
  const ko = avecRepliLogs(async () => { throw p; }, [async () => { throw new Error('403 archive'); }, async () => null]);
  await assert.rejects(ko('eth_getLogs', [{}]), (e) => e === p);
  const ok = avecRepliLogs(async () => refus(), [async () => { throw new Error(BUDGET); }, async () => ['b']]);
  assert.deepEqual(await ok('eth_getLogs', [{}]), ['b'], 'un refus de budget ne doit pas empecher le repli suivant de servir');
  let appels = 0;
  const autre = avecRepliLogs(async () => { throw p; }, [async () => { appels++; throw new Error(BUDGET); }]);
  await assert.rejects(autre('eth_call', [{}]), (e) => e === p);
  assert.equal(appels, 0);
});

const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = srv.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
await cas('A7 le scan des creations de lireTrending passe par le repli', async () => {
  assert.match(nu, /const rpcScanCreations = avecRepliLogs\(rpcServeur, ESSAI_SRV\.actif \|\| REPLIS_PUBLICS_COUPES \? \[\] : \[lecteurUrl\('https:\/\/base-rpc\.publicnode\.com'\)\]\)/);
  /* TB_REPLIS=0 coupe tout repli public (bancs a faux noeud) — jamais pose en prod */
  assert.match(nu, /const REPLIS_PUBLICS_COUPES = process\.env\.TB_REPLIS === '0';/);
  assert.match(nu, /const cr = await listerCreations\(\{ rpc: rpcScanCreations, blocs, fin \}\)/,
    'lireTrending scanne encore sur rpcServeur seul : base.org refuse, l index se fige');
});

await cas('A9 un scan qui avance par-dessus des fenetres refusees NOTE le saut (rendu par /sante)', async () => {
  assert.match(nu, /trousCreations\.push\(\{ de: blocsLusJusqua === null \? fin - blocs : blocsLusJusqua, a: fin, fenetres: cr\.fenetresRatees\.length/);
  assert.match(nu, /trousCreations: trousCreations\.slice\(-10\)/);
});

const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
await cas('B2 navigateur : les getLogs de la factory ont publicnode en repli APRES base.org ; les eth_call de la factory restent epingles', async () => {
  assert.match(app, /const REPLI_LOGS_FACTORY = 'https:\/\/base-rpc\.publicnode\.com';/);
  assert.match(app, /\? \[RESEAUX\[CHAINE\]\.b20Rpc \|\| RESEAUX\[CHAINE\]\.rpc, \.\.\.\(methode === 'eth_getLogs' && CHAINE === 8453/);
});
await cas('B3 navigateur : un getLogs a plus de 9 adresses refuse partout est relu en lots de 9 ; un lot en echec fait echouer le tout', async () => {
  assert.match(app, /if \(methode === 'eth_getLogs' && multiAdresses\) \{\s+const adrs = filtreLogs\.address, lots = \[\];\s+for \(let i = 0; i < adrs\.length; i \+= ADRESSES_MAX_PUBLICNODE\) lots\.push/);
  assert.match(app, /const r = await rpc\('eth_getLogs', \[\{ \.\.\.filtreLogs, address: lot \}\]\);\s+if \(!Array\.isArray\(r\)\) throw/);
  /* la branche est APRES la boucle des noeuds (repli), jamais avant : le chemin normal reste inchange */
  const iBoucle = app.indexOf('for (let i = 0; i < noeuds.length; i++) {'), iLots = app.indexOf("if (methode === 'eth_getLogs' && multiAdresses) {");
  assert.ok(iBoucle > 0 && iLots > iBoucle);
});
await cas('B1 charger() pose nos blocks AVANT le balayage de la factory', async () => {
  const i = app.indexOf('async function charger() {');
  assert.ok(i > 0);
  const fin = /\r?\n\}\r?\n/.exec(app.slice(i));
  assert.ok(fin, 'fin de charger() introuvable');
  const corps = app.slice(i, i + fin.index);
  const sansCom = corps.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const iPose = sansCom.indexOf('await poserNosBlocks(');
  const iScan = sansCom.indexOf('await listerCreations(');
  assert.ok(iPose > 0, 'charger() ne pose plus nos blocks independamment de la lecture de la factory');
  assert.ok(iScan > 0 && iPose < iScan, 'nos blocks sont poses APRES le balayage : une lecture ratee les efface encore');
  /* et pas dans le meme `try` que le balayage : il doit etre dans sa propre tache, non attendue */
  assert.match(sansCom, /\n[ \t]*void \(async \(\) => \{[\s\S]{0,300}await poserNosBlocks\(/,
    'la tache qui pose nos blocks n est plus une instruction inconditionnelle de charger()');
  /* la tete lue est TRANSMISE (le mutant `poserNosBlocks(0)` survivait) ; non lue -> null, jamais 0 */
  assert.match(sansCom, /await poserNosBlocks\(Number\.isSafeInteger\(tete\) \? tete : null\)/);
  assert.match(app, /if \(!servi && Number\.isSafeInteger\(fin\) && fin > 0\) \{/, 'le repli on-chain part sur une tete non lue');
});
await cas('C1 la sauvegarde disque du trending garde TOUS les blocks a paire, et compte ce qu elle coupe', async () => {
  const i = srv.indexOf('const ADRS_DISQUE_MAX = 5000;');
  const j = srv.indexOf('const payload = JSON.stringify({', i);
  assert.ok(i > 0 && j > i, 'bloc de sauvegarde introuvable');
  const corps = srv.slice(i, j);
  const garder = new Function('parsed', 'blocksConnus', 'console', corps + '\n; return gardes;');
  const adr = (k) => '0x' + k.toString(16).padStart(40, '0');
  const connus = new Set(Array.from({ length: 6000 }, (_, k) => adr(k + 1)));
  /* deux blocks ANCIENS (inseres en premier) avec une paire : la vieille regle `slice(-N)` les coupait */
  const lignes = [{ adr: adr(1).toUpperCase().replace('0X', '0x') }, { adr: adr(2) }, { adr: '0x' + 'f'.repeat(40) }];
  const journal = [];
  const g = garder({ lignes }, connus, { log: (m) => journal.push(m) });
  assert.equal(g.length, 5000);
  assert.ok(g.includes(adr(1)) && g.includes(adr(2)), 'un block ancien AVEC paire a ete coupe');
  assert.ok(!g.includes('0x' + 'f'.repeat(40)), 'une ligne inconnue de blocksConnus est entree dans la sauvegarde');
  assert.ok(g.includes(adr(6000)), 'le plus recent sans paire doit rester');
  assert.equal(new Set(g).size, g.length, 'doublon');
  assert.match(journal.join(' '), /keeps 5000\/6000 known blocks \(2 with a pair, all kept\) — 1000 oldest without a pair dropped/);
  const petit = garder({ lignes: [] }, new Set([adr(1), adr(2)]), { log: (m) => journal.push('X ' + m) });
  assert.deepEqual(petit, [adr(1), adr(2)]);
  assert.ok(!journal.some((m) => m.startsWith('X ')), 'rien n est coupe : le journal ne doit rien dire');
});

console.log('✓ ' + n + ' cas — repli getLogs du scan + nos blocks poses sans dependre de la factory');
