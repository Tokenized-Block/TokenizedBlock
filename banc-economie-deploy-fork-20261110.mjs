// banc-economie-deploy-fork-20261110.mjs — the EXACT bytes deployer-economie.html sends, deployed on a base-anvil FORK (never mainnet),
// then the app's own call builders (economie.js likeBatch / claimCall) exercised against them with the real TBLOCK.
// Needs base-anvil on FORK_RPC (default http://127.0.0.1:8659). Without it: prints SKIP and exits 0 is NOT a pass: it exits 2.
import { ECONOMIE_DEPLOIEMENT as D } from './economie-deploiement.js';
import * as E from './economie.js';
import { createHash } from 'node:crypto';
const RPC = process.env.FORK_RPC || 'http://127.0.0.1:8659';
let id = 0, ok = 0, ko = 0;
const t = (n, c, x = '') => { if (c) ok++; else { ko++; console.log('RED', n, x); } };
const rpc = async (m, p) => { const j = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) }).then((r) => r.json()); if (j.error) throw new Error(j.error.message); return j.result; };
const DEP = '0x2222222222222222222222222222222222222222', PM = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const BLK = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const send = async (from, to, data) => { const h = await rpc('eth_sendTransaction', [{ from, ...(to ? { to } : {}), data, gas: '0x1c9c380' }]); let r = null; for (let k = 0; k < 60 && !r; k++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await new Promise((o) => setTimeout(o, 500)); } return r; };
const eth = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);

let snap;
try { snap = await rpc('evm_snapshot', []); } catch (e) { console.log('NO FORK at ' + RPC + ': ' + e.message); process.exit(2); }
try {
  t('sha256 of the likes creation matches the file', createHash('sha256').update(D.likes.creation).digest('hex') === D.likes.sha256Creation);
  t('sha256 of the vault init matches the file', createHash('sha256').update(D.vault.init).digest('hex') === D.vault.sha256Init);
  for (const a of [DEP, PM]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0xde0b6b3a7640000']); }
  /* the genesis in the frozen bytes is 2026-11-11 00:00 UTC: put the fork clock after it, the way mainnet will be */
  await rpc('evm_setNextBlockTimestamp', [D.likes.config.genesis + 3600]); await rpc('evm_mine', []);
  const r1 = await send(DEP, null, D.likes.creation);
  t('BlockLikes deploys from the frozen bytes', r1 && r1.status === '0x1', JSON.stringify(r1 && r1.status));
  const likes = r1.contractAddress.toLowerCase();
  const r2 = await send(DEP, null, E.vaultCreation(likes));
  t('TBlockVault deploys from init + the 13 words built by economie.js', r2 && r2.status === '0x1', JSON.stringify(r2 && r2.status));
  const vault = r2.contractAddress.toLowerCase();
  const rd = async (to, sig) => E.word(await eth(to, '0x' + (await import('./keccak.js')).selecteur(sig).slice(2)));
  t('likes TBLOCK immutable', '0x' + (await rd(likes, 'TBLOCK()')).toString(16).padStart(40, '0') === E.TBLOCK);
  t('likes price 86,000 TBLOCK', (await rd(likes, 'LIKE_PRICE()')) === 86000n * 10n ** 18n);
  t('likes hold 2,580,000', (await rd(likes, 'MIN_HOLD()')) === 2580000n * 10n ** 18n);
  t('vault reads THIS likes', '0x' + (await rd(vault, 'LIKES()')).toString(16).padStart(40, '0') === likes);
  t('vault feeds the live contest', '0x' + (await rd(vault, 'CONTEST()')).toString(16).padStart(40, '0') === '0x001ead57218f3ab79e2dcacb05ddfc4574ef177c');
  const hex40 = (n) => '0x' + n.toString(16).padStart(40, '0');
  t('vault DEV = the TBLOCK dev wallet (not the deployer)', hex40(await rd(vault, 'DEV()')) === '0x264496cc303f8dbe49a241ea84cd42be8392bc80' && hex40(await rd(vault, 'DEV()')) !== DEP);
  t('vault DEV2 = Grok wallet', hex40(await rd(vault, 'DEV2()')) === '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b');
  t('economie.js VAULT_DEVS = the two on chain', E.VAULT_DEVS.join() === '0x264496cc303f8dbe49a241ea84cd42be8392bc80,0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b');
  /* step 3: buyback v2 from the frozen init + the 22 words, dest = this vault */
  t('sha256 of the buyback init matches the file', createHash('sha256').update(D.buyback.init).digest('hex') === D.buyback.sha256Init);
  const r3 = await send(DEP, null, E.buybackCreation(vault));
  t('TBlockBuybackV2 deploys from init + the 22 words', r3 && r3.status === '0x1', JSON.stringify(r3 && r3.status));
  const bb = r3.contractAddress.toLowerCase();
  t('buyback DEST = this vault', hex40(await rd(bb, 'DEST()')) === vault);
  t('buyback KEEPER = the v1 keeper', hex40(await rd(bb, 'KEEPER()')) === String(D.buyback.config.keeper).toLowerCase());
  /* a REAL buyback on the fork: fund 0.002 ETH, the keeper calls buyback(0.002 ETH); the vault must receive TBLOCK */
  const KEEP = String(D.buyback.config.keeper).toLowerCase();
  await rpc('anvil_impersonateAccount', [KEEP]); await rpc('anvil_setBalance', [KEEP, '0xde0b6b3a7640000']);
  try { await rpc('eth_call', [{ from: DEP, to: bb, value: '0x71afd498d0000' }, 'latest']); } catch (e) { console.log('fund dry-run reverts:', e.message.slice(0, 200)); }
  console.log('DEP ETH', BigInt(await rpc('eth_getBalance', [DEP, 'latest'])).toString());
  const fund = await rpc('eth_sendTransaction', [{ from: DEP, to: bb, value: '0x71afd498d0000', gas: '0x30d40' }]); // 0.002 ETH
  for (let k = 0; k < 40 && !(await rpc('eth_getTransactionReceipt', [fund])); k++) await new Promise((o) => setTimeout(o, 300));
  const fr = await rpc('eth_getTransactionReceipt', [fund]);
  console.log('fund tx status', fr && fr.status, 'buyback ETH balance', BigInt(await rpc('eth_getBalance', [bb, 'latest'])).toString());
  const v0 = E.word(await eth(E.TBLOCK, '0x' + E.SEL.balanceOf + E.wAddr(vault)));
  const sel = (await import('./keccak.js')).selecteur('buyback(uint256)').slice(2);
  try { await rpc('eth_call', [{ from: KEEP, to: bb, data: '0x' + sel + E.wUint(2000000000000000n) }, 'latest']); }
  catch (e) { console.log('buyback dry-run reverts:', e.message.slice(0, 200)); }
  const rb = await send(KEEP, bb, '0x' + sel + E.wUint(2000000000000000n));
  t('keeper buyback succeeds on the real pools', rb && rb.status === '0x1', JSON.stringify(rb && rb.status));
  const v1 = E.word(await eth(E.TBLOCK, '0x' + E.SEL.balanceOf + E.wAddr(vault)));
  console.log('vault received from one 0.002 ETH buyback:', E.fmt(v1 - v0), 'TBLOCK');
  t('the vault received the TBLOCK bought (> 0)', v1 > v0, String(v1 - v0));
  t('the buyback keeps no TBLOCK', E.word(await eth(E.TBLOCK, '0x' + E.SEL.balanceOf + E.wAddr(bb))) === 0n);
  t('vault claim hold 17,200,000', (await rd(vault, 'MIN_HOLD()')) === 17200000n * 10n ** 18n);
  /* the app's own +1 batch, sent as is (economie.js reads LIKES from the file: patch a copy of the builder's target for the fork) */
  const batch = [{ to: E.TBLOCK, data: '0x' + E.SEL.approve + E.wAddr(likes) + E.wUint(2n * E.LIKE_PRICE) }, { to: likes, data: '0x' + E.SEL.like + E.wAddr(BLK) + E.wUint(2n) }];
  const dead0 = E.word(await eth(E.TBLOCK, '0x' + E.SEL.balanceOf + E.wAddr('0x000000000000000000000000000000000000dead')));
  for (const c of batch) { const r = await send(PM, c.to, c.data); t('like batch call ok ' + c.data.slice(0, 10), r.status === '0x1'); }
  const dead1 = E.word(await eth(E.TBLOCK, '0x' + E.SEL.balanceOf + E.wAddr('0x000000000000000000000000000000000000dead')));
  t('2 likes burned exactly 172,000', dead1 - dead0 === 172000n * 10n ** 18n, String(dead1 - dead0));
  t('counter 2', E.word(await eth(likes, '0x' + E.SEL.likesOf + E.wAddr(BLK))) === 2n);
  t('likeCheck refuses when the hold would drop', !E.likeCheck({ balance: E.LIKE_MIN_HOLD + E.LIKE_PRICE - 1n }).ok && E.likeCheck({ balance: E.LIKE_MIN_HOLD + E.LIKE_PRICE }).ok);
} finally {
  await rpc('evm_revert', [snap]);
}
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
process.exitCode = ko ? 1 : 0;
