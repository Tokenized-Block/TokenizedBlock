/* test-cle-v4-connue-20261011.mjs - UNE CLE V4 DEJA RESOLUE PAR /api/cle SERT A /api/prix-usd, SANS REBALAYER L ARCHIVE.
 * Diagnostic Grok (2026-10-11 00:17) : /api/prix-usd = 880 appels d archive le 10/10, tous dans cleV4DuPoolId (59 fenetres de 2 000
 *   blocs, ~54 au-dela de publicnode -> archive) pour reconstruire une PoolKey. clesPool (le cache de /api/cle, par jeton) porte deja
 *   des cles completes avec leur poolId, sorties de decoderInitialize - jamais consultees ici.
 * EXECUTE cleV4Connue (cle-v4-connue.js) sur une VRAIE cle mesuree (LOGS_INITIALIZE_MESURES, decodee par decoderInitialize).
 * AFFIRME : la cle d un poolId connu est rendue ; une entree dont un champ a ete altere (le poolId ne se recalcule plus) n est JAMAIS
 *   rendue ; poolId inconnu ou sources vides -> null ; cleV4DuPoolId (serveur-web.js) consulte clesPool AVANT de lire la tete.
 * NE PROUVE PAS : le gain en appels d archive (a mesurer en prod apres la remise a zero du budget, 00:00 UTC).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { cleV4Connue } from './cle-v4-connue.js';
import { decoderInitialize } from './pools-du-jeton.js';
import { LOGS_INITIALIZE_MESURES } from './cles-v4-mesurees.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const p = LOGS_INITIALIZE_MESURES.map(decoderInitialize).find((x) => x && !x.erreur && x.cle && x.poolId);
vu(!!p, 'temoin : aucune cle mesuree decodable dans le depot');
const entree = { poolId: p.poolId, ...p.cle, bloc: p.bloc };
const autre = { poolId: '0x' + 'ab'.repeat(32), currency0: p.cle.currency0, currency1: p.cle.currency1, fee: 3000, tickSpacing: 60, hooks: '0x' + '0'.repeat(40) };
const c = cleV4Connue(p.poolId, [autre, entree]);
vu(c && c.currency0 === p.cle.currency0 && c.currency1 === p.cle.currency1 && c.fee === p.cle.fee && c.tickSpacing === p.cle.tickSpacing && c.hooks === p.cle.hooks,
  'la cle connue n est pas rendue : ' + JSON.stringify(c));
vu(cleV4Connue(p.poolId.toUpperCase().replace('0X', '0x'), [entree]) !== null, 'la casse du poolId empeche la recherche');
vu(cleV4Connue(p.poolId, [{ ...entree, fee: entree.fee + 1 }]) === null, 'une entree alteree (poolId qui ne se recalcule pas) est rendue');
vu(cleV4Connue(p.poolId, [{ ...entree, hooks: '0x' + '1'.repeat(40) }]) === null, 'hooks alteres : rendue quand meme');
vu(cleV4Connue('0x' + 'cd'.repeat(32), [entree]) === null && cleV4Connue(p.poolId, []) === null && cleV4Connue(p.poolId, null) === null, 'poolId inconnu ou sources vides : une cle est inventee');
vu(cleV4Connue(p.poolId, [null, { poolId: p.poolId }, entree]) !== null, 'une entree incomplete casse la recherche');
/* cablage : AVANT la lecture de la tete (donc avant tout eth_getLogs) */
const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const i = src.indexOf('async function cleV4DuPoolId(id)');
const corps = src.slice(i, src.indexOf("rpcServeur('eth_blockNumber'", i));
vu(i > 0 && /cleV4Connue\(k, /.test(corps) && /clesPool\.values\(\)/.test(corps), 'cleV4DuPoolId ne consulte pas clesPool avant de balayer');
console.log('ok cle-v4-connue - ' + n + ' assertions ; NE PROUVE PAS le gain en archive (mesure prod apres 00:00 UTC)');
