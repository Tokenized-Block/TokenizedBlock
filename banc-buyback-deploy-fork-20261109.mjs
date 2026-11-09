// banc-buyback-deploy-fork-20261109.mjs — FORK ONLY (base-anvil, FORK_URL, default http://127.0.0.1:8657). Sends the EXACT generated
// deployment data (tblock-buyback-deploiement.js) from the keeper wallet impersonated on the fork, then funds it and runs one keeper buyback.
// Nothing is sent to mainnet: refuses to run against a node whose chain id is 8453 unless it answers to anvil_* methods.
import { BUYBACK_DEPLOIEMENT as D } from './tblock-buyback-deploiement.js';
import { selecteur } from './keccak.js';
const FORK = process.env.FORK_URL || 'http://127.0.0.1:8657';
const DEAD = '0x000000000000000000000000000000000000dead', TBLOCK = D.parametres.tblock.toLowerCase(), KEEPER = D.parametres.keeper.toLowerCase();
let ok = 0, ko = 0; const t = (n, c, x = '') => { if (c) { ok++; console.log('ok ', n); } else { ko++; console.log('RED', n, x); } };
const rpc = async (m, p) => { const j = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }).then((x) => x.json()); if (j.error) throw new Error(m + ' ' + JSON.stringify(j.error)); return j.result; };
const mine = async (h) => { let r = null; for (let k = 0; k < 40 && !r; k++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) { await rpc('evm_mine', []).catch(() => null); await new Promise((o) => setTimeout(o, 400)); } } return r; };
const call = (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
// guard: this must be a fork
try { await rpc('anvil_nodeInfo', []); } catch (_) { console.log('not an anvil fork: refusing to run'); process.exit(2); }
await rpc('anvil_impersonateAccount', [KEEPER]);
await rpc('anvil_setBalance', [KEEPER, '0x' + (10n ** 17n).toString(16)]);
const h = await rpc('eth_sendTransaction', [{ from: KEEPER, data: D.creation, gas: '0x' + (6_000_000).toString(16) }]);
const r = await mine(h);
t('the generated data deploys (status 1)', r && r.status === '0x1', JSON.stringify(r && r.status));
const adr = r.contractAddress;
console.log('deployed on fork at', adr, 'gas used', BigInt(r.gasUsed).toString());
const code = await rpc('eth_getCode', [adr, 'latest']);
t('code is there', code && code.length > 2);
const keeperRead = '0x' + (await call(adr, 'KEEPER()')).slice(-40);
t('KEEPER() is Grok\'s wallet', keeperRead === KEEPER, keeperRead);
// fund with a normal call (arms the pot), then the keeper buys
const FUNDER = '0x' + '77'.repeat(20);
await rpc('anvil_setBalance', [FUNDER, '0x' + (10n ** 17n).toString(16)]);
await rpc('anvil_impersonateAccount', [FUNDER]);
const hf = await mine(await rpc('eth_sendTransaction', [{ from: FUNDER, to: adr, value: '0x' + (5n * 10n ** 15n).toString(16), gas: '0x30d40' }]));
t('funding 0.005 ETH by a normal call succeeds', hf && hf.status === '0x1');
const dead0 = BigInt(await call(TBLOCK, 'balanceOf(address)', w(DEAD)));
const hb = await mine(await rpc('eth_sendTransaction', [{ from: KEEPER, to: adr, data: selecteur('buyback(uint256)') + w(2n * 10n ** 15n), gas: '0x' + (1_500_000).toString(16) }]));
t('keeper buyback(0.002 ETH) succeeds', hb && hb.status === '0x1', JSON.stringify(hb && hb.status));
const dead1 = BigInt(await call(TBLOCK, 'balanceOf(address)', w(DEAD)));
console.log('TBLOCK sent to dead by this buyback:', ((dead1 - dead0) / 10n ** 18n).toString());
t('0x…dEaD received TBLOCK', dead1 > dead0);
const left = BigInt(await rpc('eth_getBalance', [adr, 'latest']));
t('the contract kept the rest (0.003 ETH)', left === 3n * 10n ** 15n, left.toString());
const hb2 = await mine(await rpc('eth_sendTransaction', [{ from: KEEPER, to: adr, data: selecteur('buyback(uint256)') + w(2n * 10n ** 15n), gas: '0x' + (1_500_000).toString(16) }]));
t('a second buyback within the cooldown is refused', hb2 && hb2.status === '0x0');
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
process.exitCode = ko ? 1 : 0;
