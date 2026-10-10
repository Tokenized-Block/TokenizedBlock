/* test-rails-simulation-noeuds-20261010.mjs - les plans des rails (planRail) recoivent un rpc qui envoie eth_simulateV1 aux noeuds
 * qui l executent. e0b346d (Grok) simule chaque plan Aerodrome ; planRail recevait rpcRails, qui ne garde pour sa liste large QUE
 * eth_call et passe le reste a rpcServeur (RPC_LIST : base.org en 429 frequent, developer-access au DNS mort - mesure prod du jour).
 * AFFIRME (texte de serveur-web.js : le cablage ne s execute pas sans demarrer le serveur) : (1) les DEUX appels de planRail
 *   (faireRail du MCP, /api/rails/plan) passent rpcNaissance ; (2) rpcNaissance envoie eth_simulateV1 a RPC_SIMULATION et le reste a
 *   rpcRails ; (3) RPC_SIMULATION = base.org, publicnode, drpc (les trois executent eth_simulateV1 depuis une page, mesure du jour) ;
 *   (4) aucun planRail ne reste sur rpcRails. NE PROUVE PAS la disponibilite des noeuds en prod.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const appels = srv.match(/planRail\(demande, \{ rpc: (\w+),/g) || [];
assert.equal(appels.length, 2, 'deux appels de planRail attendus, lus : ' + appels.length);
assert.ok(appels.every((a) => a.includes('rpc: rpcNaissance,')), 'un planRail ne passe pas rpcNaissance : ' + appels.join(' | '));
assert.match(srv, /async function rpcNaissance\(methode, params\) \{\r?\n  if \(methode !== 'eth_simulateV1'\) return rpcRails\(methode, params\);/, 'rpcNaissance ne route plus eth_simulateV1 a part');
assert.match(srv, /const RPC_SIMULATION = ESSAI_SRV\.actif \? \[ESSAI_SRV\.rpc\] : \['https:\/\/mainnet\.base\.org', 'https:\/\/base-rpc\.publicnode\.com', 'https:\/\/base\.drpc\.org'\];/, 'RPC_SIMULATION a change');
assert.doesNotMatch(srv, /planRail\([^)]*rpc: rpcRails/, 'un planRail est encore sur rpcRails');
console.log('ok rails-simulation-noeuds - les 2 planRail simulent sur RPC_SIMULATION ; NE PROUVE PAS la disponibilite des noeuds en prod');
