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

const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = srv.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
await cas('A7 le scan des creations de lireTrending passe par le repli', async () => {
  assert.match(nu, /const rpcScanCreations = avecRepliLogs\(rpcServeur, \[lecteurUrl\('https:\/\/base-rpc\.publicnode\.com'\)\]\)/);
  assert.match(nu, /const cr = await listerCreations\(\{ rpc: rpcScanCreations, blocs, fin \}\)/,
    'lireTrending scanne encore sur rpcServeur seul : base.org refuse, l index se fige');
});

const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
await cas('B1 charger() pose nos blocks AVANT le balayage de la factory', async () => {
  const i = app.indexOf('async function charger() {');
  assert.ok(i > 0);
  const corps = app.slice(i, app.indexOf('\n}\n', i));
  const sansCom = corps.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const iPose = sansCom.indexOf('await poserNosBlocks(');
  const iScan = sansCom.indexOf('await listerCreations(');
  assert.ok(iPose > 0, 'charger() ne pose plus nos blocks independamment de la lecture de la factory');
  assert.ok(iScan > 0 && iPose < iScan, 'nos blocks sont poses APRES le balayage : une lecture ratee les efface encore');
  /* et pas dans le meme `try` que le balayage : il doit etre dans sa propre tache, non attendue */
  assert.match(sansCom, /\n[ \t]*void \(async \(\) => \{[\s\S]{0,300}await poserNosBlocks\(/,
    'la tache qui pose nos blocks n est plus une instruction inconditionnelle de charger()');
});

console.log('✓ ' + n + ' cas — repli getLogs du scan + nos blocks poses sans dependre de la factory');
