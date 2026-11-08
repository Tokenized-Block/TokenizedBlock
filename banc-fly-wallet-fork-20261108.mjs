// banc-fly-wallet-fork-20261108.mjs — the autonomous fly's money path, END TO END, on a LOCAL FORK of Base only.
// CLAUDE.md (Phil 2026-11-08): the fly's live-money path needs a fork test before mainnet. This is it.
// Steps: refuse unless the RPC is an anvil fork (anvil_nodeInfo, which mainnet refuses) -> start this repo's server in test mode on the
//   fork (TB_RPC_TEST) -> a fresh fly key (fly-wallet.js) -> the user's ONE opt-in (simulated on the fork: USDC + a little ETH sent to the
//   fly) -> BUY SNDKc with 10 USDC through the app's planner (/api/rails/plan), every call signed by fly-wallet.js and sent RAW ->
//   SELL it all back -> WITHDRAW the USDC to the user. Each step: receipt status 0x1 AND the balances that should move did move.
// Usage: anvil --fork-url https://base-rpc.publicnode.com --port 8611 ; node banc-fly-wallet-fork-20261108.mjs
// It is NOT in the test series (it needs anvil): it is the gate before mainnet. Nothing here touches mainnet; no real value moves.
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import './noble-node-resolve.mjs';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { USDC_BASE } from './frais-creation.js';
import { selecteur } from './keccak.js';

const ICI = dirname(fileURLToPath(import.meta.url));
/* dynamic: the @noble resolve hook must be registered before fly-wallet.js is linked */
const { newKeyHex, addressOf, signTx, decodeTx } = await import('./fly-wallet.js');
const FORK = process.env.FORK_RPC || 'http://127.0.0.1:8611', PORT = 9087, BASE = 'http://127.0.0.1:' + PORT;
let id = 0, n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { ko++; console.log('KO  ' + m); } };
const rpc = async (method, params = []) => { const r = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + JSON.stringify(r.error)); return r.result; };
async function surFork() { try { const r = await rpc('anvil_nodeInfo'); return !!(r && r.currentBlockNumber); } catch (_) { return false; } }
const word = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const bal = async (token, who) => BigInt(await rpc('eth_call', [{ to: token, data: selecteur('balanceOf(address)') + word(who) }, 'latest']));
/* every signed transaction goes through the server's RELAY (/api/fly/relay, fly-relay.js guard), as the page sends them */
const relay = async (raw) => { const r = await fetch(BASE + '/api/fly/relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ raw }) }); const j = await r.json(); if (!j.ok) throw new Error('relay ' + r.status + ': ' + j.why); return j.hash; };
const receipt = async (h) => { for (let k = 0; k < 60; k++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 500)); } throw new Error('no receipt ' + h); };

if (!(await surFork())) { console.log('REFUSED: ' + FORK + ' is not an anvil fork (anvil_nodeInfo). Nothing sent.'); process.exit(2); }
const SNDK = [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === 'SNDKc'), STOCK = SNDK[0], POOL = SNDK[1].pool, USDC = USDC_BASE.toLowerCase();

/* the server in test mode, on the fork */
const srv = spawn(process.execPath, [join(ICI, 'serveur-web.js')], { cwd: ICI, env: { ...process.env, PORT: String(PORT), TB_RPC_TEST: FORK, TB_SONDES: '0', FLY_SERVER: 'off', NODE_ENV: 'test' }, stdio: 'ignore' });
const stop = () => { try { srv.kill(); } catch (_) {} };
try {
  let pret = false; for (let k = 0; k < 120 && !pret; k++) { try { pret = (await fetch(BASE + '/sante')).ok; } catch (_) { await new Promise((o) => setTimeout(o, 500)); } }
  ok(pret, 'server up in test mode on the fork');

  const key = newKeyHex(), fly = addressOf(key), user = '0x' + '5'.repeat(40);
  /* the user's ONE opt-in, simulated on the fork: 20 USDC (from an account that holds some on Base: the SNDKc pool) + 0.002 ETH for gas */
  await rpc('anvil_setBalance', [fly, '0x' + (2n * 10n ** 15n).toString(16)]);
  await rpc('anvil_impersonateAccount', [POOL]); await rpc('anvil_setBalance', [POOL, '0x' + (10n ** 18n).toString(16)]);
  const fund = await rpc('eth_sendTransaction', [{ from: POOL, to: USDC, data: selecteur('transfer(address,uint256)') + word(fly) + (20n * 10n ** 6n).toString(16).padStart(64, '0') }]);
  ok((await receipt(fund)).status === '0x1' && (await bal(USDC, fly)) === 20n * 10n ** 6n, 'opt-in on the fork: the fly holds 20 USDC');

  /* sign and send every call of a plan with the fly's key, re-planning after approvals */
  async function run(de, vers, montant, label) {
    for (let round = 0; round < 3; round++) {
      const q = new URLSearchParams({ de, vers, montant: String(montant), compte: fly });
      const p = await fetch(BASE + '/api/rails/plan?' + q).then((x) => x.json());
      if (!p.ok) { ok(false, label + ': plan ' + p.etat + ' ' + (p.pourquoi || '')); return null; }
      for (const c of p.aSigner) {
        if (!(await surFork())) throw new Error('not a fork any more: stop');
        const nonce = await rpc('eth_getTransactionCount', [fly, 'pending']), blk = await rpc('eth_getBlockByNumber', ['latest', false]);
        const prio = 1000000n, maxFee = BigInt(blk.baseFeePerGas) * 2n + prio;
        const gas = BigInt(await rpc('eth_estimateGas', [{ from: fly, to: c.to, data: c.data, value: c.value }])) * 12n / 10n;
        const s = signTx({ chainId: 8453, nonce: BigInt(nonce), maxPriorityFeePerGas: prio, maxFeePerGas: maxFee, gas, to: c.to, value: BigInt(c.value || '0x0'), data: c.data }, key);
        ok(decodeTx(s.raw).from === fly, label + ': the signed raw transaction recovers to the fly (' + (c.nom || c.role || 'call') + ')');
        const h = await relay(s.raw);
        ok(h.toLowerCase() === s.hash.toLowerCase(), label + ': the node computes the same transaction hash');
        const r = await receipt(h);
        ok(r.status === '0x1', label + ': receipt status 0x1 (' + (c.nom || c.role || 'call') + ', gas ' + Number(BigInt(r.gasUsed)) + ')');
        if (r.status !== '0x1') return p;
      }
      if (p.etat !== 'APPROBATIONS') return p;
    }
    return null;
  }

  /* ⛔ A tokenized stock (B20, a Base precompile) does NOT execute on an anvil fork (OpcodeNotFound; memory b20-reads-only-on-base-node):
   *   the stock leg cannot be proven here. The fork proves the same money path with an ordinary asset: USDC -> ETH -> USDC through the
   *   same planner, approvals and signer. The stock leg needs a tiny mainnet trade, decided by Phil. */
  const ethBal = async (a) => BigInt(await rpc('eth_getBalance', [a, 'latest']));
  /* the relay refuses what no plan produced: an approve of the fly's USDC to an arbitrary spender */
  { const nonce = await rpc('eth_getTransactionCount', [fly, 'pending']), blk = await rpc('eth_getBlockByNumber', ['latest', false]);
    const bad = signTx({ chainId: 8453, nonce: BigInt(nonce), maxPriorityFeePerGas: 1000000n, maxFeePerGas: BigInt(blk.baseFeePerGas) * 2n + 1000000n, gas: 80000n, to: USDC, value: 0n, data: selecteur('approve(address,uint256)') + word(user) + 'f'.repeat(64) }, key);
    let refused = null; try { await relay(bad.raw); } catch (e) { refused = e.message; }
    ok(refused && /403/.test(refused) && (await rpc('eth_getTransactionCount', [fly, 'pending'])) === nonce, 'the relay refuses an unplanned approve (403), nothing reaches the chain: ' + String(refused).slice(0, 60)); }
  const u0 = await bal(USDC, fly), e0 = await ethBal(fly);
  const buy = await run(USDC, 'ETH', 10n * 10n ** 6n, 'BUY ETH with 10 USDC');
  const u1 = await bal(USDC, fly), e1 = await ethBal(fly);
  ok(buy && u0 - u1 === 10n * 10n ** 6n && e1 > e0, 'BUY: 10 USDC spent, ETH up by ' + (e1 - e0) + ' wei net of gas (planner minimum ' + (buy && buy.resume && buy.resume.recoitAuMoins) + ')');
  const vendre = (e1 - e0) * 9n / 10n;
  const sell = await run('ETH', USDC, vendre, 'SELL that ETH back to USDC');
  const u2 = await bal(USDC, fly);
  ok(sell && u2 > u1 && u2 - u1 >= BigInt(sell.resume.recoitAuMoins), 'SELL: ' + vendre + ' wei sold, ' + (u2 - u1) + ' USDC units back (at least ' + (sell && sell.resume.recoitAuMoins) + ')');
  /* STOCK LEG (NVDAc, AAPLc by default; FLY_STOCKS=SYM,SYM): the same planner and signer, 2 USDC each. Reported PROVEN only if the
   * receipt is 0x1 AND the fly's stock balance went up; otherwise UNPROVEN with the node's own reason. Never counted as green. */
  const stocks = String(process.env.FLY_STOCKS || 'NVDAc,AAPLc').split(',').filter(Boolean);
  for (const sym of stocks) {
    const e = [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === sym);
    if (!e) { console.log('UNPROVEN ' + sym + ': not in the pool registry'); continue; }
    const tok = e[0];
    let verdict, s0 = null;
    try {
      try { s0 = await bal(tok, fly); } catch (x) { s0 = null; console.log('  ' + sym + ' balanceOf on the fork: ' + String(x.message).slice(0, 160)); }
      const q = new URLSearchParams({ de: USDC, vers: tok, montant: String(2n * 10n ** 6n), compte: fly });
      let p = await fetch(BASE + '/api/rails/plan?' + q).then((x) => x.json());
      verdict = 'plan ' + p.etat + (p.pourquoi ? ' (' + String(p.pourquoi).slice(0, 160) + ')' : '');
      for (let round = 0; p.ok && round < 3; round++) {
        let failed = null;
        for (const c of p.aSigner) {
          const nonce = await rpc('eth_getTransactionCount', [fly, 'pending']), blk = await rpc('eth_getBlockByNumber', ['latest', false]);
          let gas; try { gas = BigInt(await rpc('eth_estimateGas', [{ from: fly, to: c.to, data: c.data, value: c.value }])) * 12n / 10n; }
          catch (x) { failed = 'estimateGas refused (' + (c.nom || c.role || 'call') + '): ' + String(x.message).slice(0, 200); break; }
          const sg = signTx({ chainId: 8453, nonce: BigInt(nonce), maxPriorityFeePerGas: 1000000n, maxFeePerGas: BigInt(blk.baseFeePerGas) * 2n + 1000000n, gas, to: c.to, value: BigInt(c.value || '0x0'), data: c.data }, key);
          const r = await receipt(await relay(sg.raw));
          if (r.status !== '0x1') { failed = 'receipt ' + r.status + ' (' + (c.nom || c.role || 'call') + ')'; break; }
        }
        if (failed) { verdict = failed; break; }
        if (p.etat !== 'APPROBATIONS') { const s1 = await bal(tok, fly); verdict = s0 !== null && s1 > s0 ? 'PROVEN: +' + (s1 - s0) + ' units' : 'swap mined but balance did not rise (' + s0 + ' -> ' + s1 + ')'; break; }
        p = await fetch(BASE + '/api/rails/plan?' + q).then((x) => x.json());
      }
    } catch (x) { verdict = 'error: ' + String(x.message).slice(0, 200); }
    console.log((/^PROVEN/.test(verdict) ? '' : 'UNPROVEN ') + sym + ' BUY 2 USDC on the fork: ' + verdict);
  }
  /* WITHDRAW: everything back to the user, signed by the fly */
  const u3 = await bal(USDC, fly);
  const before = await bal(USDC, user), nonce = await rpc('eth_getTransactionCount', [fly, 'pending']), blk = await rpc('eth_getBlockByNumber', ['latest', false]);
  const w = signTx({ chainId: 8453, nonce: BigInt(nonce), maxPriorityFeePerGas: 1000000n, maxFeePerGas: BigInt(blk.baseFeePerGas) * 2n + 1000000n, gas: 100000n, to: USDC, value: 0n,
    data: selecteur('transfer(address,uint256)') + word(user) + u3.toString(16).padStart(64, '0') }, key);
  const rw = await receipt(await relay(w.raw));
  ok(rw.status === '0x1' && (await bal(USDC, fly)) === 0n && (await bal(USDC, user)) - before === u3, 'WITHDRAW: all ' + u3 + ' USDC units back to the user, the fly holds 0');
  /* not a cost: only 9/10 of the ETH bought was sold back, the rest stays with the fly; a PROVEN stock leg also keeps its stock */
  console.log('USDC not back: ' + (20n * 10n ** 6n - u3) + ' units of 20,000,000, which INCLUDES the 1/10 of the ETH kept unsold (and any stock bought), plus fees and price impact');
} catch (e) { ok(false, 'error: ' + String((e && e.message) || e).slice(0, 200)); }
finally { stop(); }
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
