// banc-contest-deploy-fork-20261109.mjs — FORK ONLY (base-anvil, FORK_URL, default http://127.0.0.1:8657). Sends the EXACT generated
// deployment data (block-contest-deploiement.js) from Grok's wallet impersonated on the fork, then reads every parameter back and does one
// owner funding with real TBLOCK. Refuses to run on a node that does not answer anvil_* methods.
import { CONTEST_DEPLOIEMENT as D } from './block-contest-deploiement.js';
import { selecteur } from './keccak.js';
import { DEVISES_7030 } from './hook-7030-descripteur.js';
const FORK = process.env.FORK_URL || 'http://127.0.0.1:8657';
const FROM = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', HOLDER = '0x37eb9b7ce0b51fe12fbf092026e001918128580a';
let ok = 0, ko = 0; const t = (n, c, x = '') => { if (c) { ok++; console.log('ok ', n); } else { ko++; console.log('RED', n, x); } };
const rpc = async (m, p) => { const j = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }).then((x) => x.json()); if (j.error) throw new Error(m + ' ' + JSON.stringify(j.error)); return j.result; };
const mine = async (h) => { let r = null; for (let k = 0; k < 40 && !r; k++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) { await rpc('evm_mine', []).catch(() => null); await new Promise((o) => setTimeout(o, 400)); } } return r; };
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const call = async (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const num = async (to, sig, args = '') => BigInt(await call(to, sig, args));
const adr = async (to, sig) => '0x' + (await call(to, sig)).slice(-40);
try { await rpc('anvil_nodeInfo', []); } catch (_) { console.log('not an anvil fork: refusing to run'); process.exit(2); }
await rpc('anvil_impersonateAccount', [FROM]);
await rpc('anvil_setBalance', [FROM, '0x' + (10n ** 17n).toString(16)]);
const r = await mine(await rpc('eth_sendTransaction', [{ from: FROM, data: D.creation, gas: '0x' + (9_000_000).toString(16) }]));
t('the generated data deploys (status 1)', r && r.status === '0x1', JSON.stringify(r && r.status));
const c = r.contractAddress, C = D.config;
console.log('deployed on fork at', c, 'gas used', BigInt(r.gasUsed).toString());
t('TBLOCK()', (await adr(c, 'TBLOCK()')) === C.tblock.toLowerCase());
t('HOOK()', (await adr(c, 'HOOK()')) === C.hook.toLowerCase());
t('GENESIS()', (await num(c, 'GENESIS()')) === BigInt(C.genesis));
t('VOTE_PRICE / ENTRY_FEE', (await num(c, 'VOTE_PRICE()')) === BigInt(C.votePrice) && (await num(c, 'ENTRY_FEE()')) === BigInt(C.entryFee));
t('BURN_BPS 10000, SPLIT 10000/0/0', (await num(c, 'BURN_BPS()')) === 10000n && (await num(c, 'SPLIT1()')) === 10000n && (await num(c, 'SPLIT2()')) === 0n && (await num(c, 'SPLIT3()')) === 0n);
t('MIN_VOTES 3, MIN_VOTERS 3, MIN_QUALIFIED_ENTRIES 2', (await num(c, 'MIN_VOTES()')) === 3n && (await num(c, 'MIN_VOTERS()')) === 3n && (await num(c, 'MIN_QUALIFIED_ENTRIES()')) === 2n);
t('MAX_POT 862,000 TBLOCK', (await num(c, 'MAX_POT()')) === BigInt(C.maxPot));
let pairs = 0; for (const a of DEVISES_7030) if ((await num(c, 'isPairCurrency(address)', w(a))) === 1n) pairs++;
t('all 62 pair currencies registered', pairs === 62, String(pairs));
t('TBLOCK itself is not a pair currency', (await num(c, 'isPairCurrency(address)', w(C.tblock))) === 0n);
// one owner funding of round 0 with real TBLOCK (impersonated holder on the fork)
await rpc('anvil_impersonateAccount', [HOLDER]);
await rpc('anvil_setBalance', [HOLDER, '0x' + (10n ** 17n).toString(16)]);
const amt = BigInt(C.maxPot);
const ha = await mine(await rpc('eth_sendTransaction', [{ from: HOLDER, to: C.tblock, data: selecteur('approve(address,uint256)') + w(c) + w(amt), gas: '0x30d40' }]));
const hf = await mine(await rpc('eth_sendTransaction', [{ from: HOLDER, to: c, data: selecteur('fund(uint256,uint256)') + w(0) + w(amt), gas: '0x' + (600000).toString(16) }]));
t('approve + fund(0, 862,000 TBLOCK) succeed', ha && ha.status === '0x1' && hf && hf.status === '0x1');
t('round 0 is full (fundRoom 0) and liabilities = 862,000', (await num(c, 'fundRoom(uint256)', w(0))) === 0n && (await num(c, 'liabilities()')) === amt);
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
process.exitCode = ko ? 1 : 0;
