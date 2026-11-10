// banc-tblock-holder-fork-20261109.mjs — FORK ONLY (base-anvil, FORK_URL, default http://127.0.0.1:8657). game327: the holder plan (fraisBps 0,
// exactly what rails-api passes when estHolderTblock is true) for a USDC -> TBLOCK buy, built by the planner against the fork and executed
// from the dev wallet impersonated on the fork. Asserts: TBLOCK received >= plan minimum, the fee wallet receives NOTHING. Refuses non-anvil.
import { planRouteTblock } from './tblock-route.js';
const FORK = process.env.FORK_URL || 'http://127.0.0.1:8657';
const W = '0x37eb9b7ce0b51fe12fbf092026e001918128580a', USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', TB = '0xb200000000000000000000ba9bf8330307f8830e', FEE = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
let ok = 0, ko = 0; const t = (n, c, x = '') => { if (c) { ok++; console.log('ok ', n); } else { ko++; console.log('RED', n, x); } };
const rpc = async (m, p) => { const j = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }).then((x) => x.json()); if (j.error) { const e = new Error(m + ' ' + JSON.stringify(j.error)); e.data = j.error.data; throw e; } return j.result; };
const bal = async (t2, w) => BigInt(await rpc('eth_call', [{ to: t2, data: '0x70a08231' + w.slice(2).padStart(64, '0') }, 'latest']));
try { await rpc('anvil_nodeInfo', []); } catch (_) { console.log('not an anvil fork: refusing to run'); process.exit(2); }
await rpc('anvil_impersonateAccount', [W]); await rpc('anvil_setBalance', [W, '0x' + (10n ** 17n).toString(16)]);
const usdcHeld = await bal(USDC, W);
const amt = usdcHeld >= 2_000_000n ? 2_000_000n : usdcHeld;
t('the holder has USDC on the fork to buy with', amt > 0n, usdcHeld.toString());
const p = await planRouteTblock({ rpc, compte: W, de: USDC, vers: TB, montant: amt, fraisBps: 0n });
console.log('plan', p.etat, p.pourquoi || '', 'fee bps', p.resume && p.resume.fraisBps, 'calls', (p.appels || []).length);
t('holder plan PRET at 0 bps', p.etat === 'PRET' && Number(p.resume.fraisBps) === 0);
const u0 = await bal(USDC, W), t0 = await bal(TB, W), f0 = await bal(USDC, FEE);
let allOk = true;
for (const c of p.appels || []) {
  const h = await rpc('eth_sendTransaction', [{ from: W, to: c.to, data: c.data, value: c.value || '0x0', gas: '0x' + (1500000).toString(16) }]);
  let r = null; for (let k = 0; k < 40 && !r; k++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) { await rpc('evm_mine', []).catch(() => null); await new Promise((o) => setTimeout(o, 400)); } }
  if (!r || r.status !== '0x1') { allOk = false; console.log('tx failed', c.to); break; }
}
t('every call succeeds', allOk);
const u1 = await bal(USDC, W), t1 = await bal(TB, W), f1 = await bal(USDC, FEE);
console.log('USDC paid', (u0 - u1).toString(), '| TBLOCK received', ((t1 - t0) / 10n ** 18n).toString(), '| fee wallet delta', (f1 - f0).toString());
t('paid exactly the amount', u0 - u1 === amt);
t('received at least the plan minimum', t1 - t0 >= BigInt(p.resume.recoitAuMoins));
t('NO interface fee taken', f1 === f0);
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
process.exitCode = ko ? 1 : 0;
