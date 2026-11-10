// test-relais-rpc-20261110.mjs — relais-rpc.js (pure) + its wiring in serveur-web.js and app.html. No network.
// Proves: the relay reads only (no send, no account method, no unbounded logs scan, no full blocks); the server takes the keyed node from
// the environment only, caps it per day and per IP, returns a node error as a revert WITH its data; the page calls the relay ONLY after
// every public node refused, never for the pinned B20 factory, and throws a relayed revert as a revert. The module is served.
// Does NOT prove: the relay answering in production (see the live probe after deploy), nor the keyed node's daily budget being enough.
import { readFileSync } from 'node:fs';
import * as R from './relais-rpc.js';
let ok = 0, ko = 0;
const t = (n, c, x = '') => { if (c) ok++; else { ko++; console.log('RED', n, x); } };
const A = '0x' + 'ab'.repeat(20), H = '0x' + 'cd'.repeat(32);

t('eth_call accepted', R.validerRelais({ method: 'eth_call', params: [{ to: A, data: '0x70a08231' }, 'latest'] }).ok);
t('eth_blockNumber accepted', R.validerRelais({ method: 'eth_blockNumber', params: [] }).ok);
t('receipt accepted', R.validerRelais({ method: 'eth_getTransactionReceipt', params: [H] }).ok);
t('logs 2000 blocks, 9 addresses accepted', R.validerRelais({ method: 'eth_getLogs', params: [{ fromBlock: '0x0', toBlock: '0x7d0', address: Array(9).fill(A) }] }).ok);
for (const m of ['eth_sendRawTransaction', 'eth_sendTransaction', 'eth_sign', 'personal_sign', 'eth_accounts', 'debug_traceTransaction', 'anvil_setBalance', 'eth_simulateV1'])
  t('refused: ' + m, !R.validerRelais({ method: m, params: [] }).ok);
t('refused: logs 2001 blocks', !R.validerRelais({ method: 'eth_getLogs', params: [{ fromBlock: '0x0', toBlock: '0x7d1', address: A }] }).ok);
t('refused: logs 10 addresses', !R.validerRelais({ method: 'eth_getLogs', params: [{ fromBlock: '0x0', toBlock: '0x1', address: Array(10).fill(A) }] }).ok);
t('refused: logs without address', !R.validerRelais({ method: 'eth_getLogs', params: [{ fromBlock: '0x0', toBlock: '0x1' }] }).ok);
t('refused: logs with "latest" range', !R.validerRelais({ method: 'eth_getLogs', params: [{ fromBlock: '0x0', toBlock: 'latest', address: A }] }).ok);
t('refused: full blocks', !R.validerRelais({ method: 'eth_getBlockByNumber', params: ['latest', true] }).ok);
t('refused: a call to a non-address', !R.validerRelais({ method: 'eth_call', params: [{ to: 'evil', data: '0x' }, 'latest'] }).ok);
t('refused: no body', !R.validerRelais(null).ok && !R.validerRelais('x').ok);

const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const h = srv.slice(srv.indexOf("if (chemin === '/api/rpc') {"), srv.indexOf("if (chemin === '/api/tblock/vault-buy') {"));
t('server route exists, POST only, validated', /if \(req\.method !== 'POST'\)/.test(h) && /const v = validerRelais\(b\);/.test(h));
t('per IP: 60 a minute', /if \(nIpP > 60\)/.test(h));
t('the keyed node is capped per day', /RELAIS\.cles < RELAIS_MAX_JOUR/.test(h) && /RELAIS_MAX_JOUR = [^;]+: 20000;/.test(srv));
t('the keyed node comes from the environment only, https, no credentials', /process\.env\.BASE_RPC_RELAIS/.test(srv) && /x\.protocol === 'https:' && !x\.username && !x\.password/.test(srv.slice(srv.indexOf('const RELAIS_CLE'))));
t('a node error is returned as a revert with its data', /error: \{ message: String\(j\.error\.message \|\| 'error'\), data: j\.error\.data, revert: true \}/.test(h));
t('a rate-limited node is skipped, not returned', /if \(r\.status === 429\) \{ derniere = 'rate limited'; continue; \}/.test(h));
t('/sante names the keyed node by host only', /noeudCle: RELAIS_CLE \? libelleNoeud\(RELAIS_CLE\) : null/.test(srv));
t('module is served', /'relais-rpc\.js'/.test(srv));

const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const fin = app.slice(app.indexOf('async function rpcReseau('), app.indexOf("throw derniere || new Error('RPC unreachable on all nodes');") + 60);
const relais = fin.indexOf("fetch('/api/rpc'"), boucle = fin.lastIndexOf('if (!saute) echoues.add(url);');
t('the page imports the relayed methods from the same module', /import \{ RELAIS_METHODES \} from '\.\/relais-rpc\.js';/.test(app));
t('the page asks the relay only AFTER the public-node loop', relais > 0 && boucle > 0 && relais > boucle);
t('never for the pinned B20 factory', /RELAIS_METHODES\.has\(methode\) && !viseFactory\)/.test(fin));
t('a relayed revert is thrown as a revert with data', /if \(jr && jr\.error && jr\.error\.revert\) \{ const e = new Error\(jr\.error\.message\); e\.data = jr\.error\.data; throw e; \}/.test(fin));
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
