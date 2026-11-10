/* banc-reprise-wtcoin-fork-20261110.mjs — game339: RESUME a step 1 that stopped between its legs (Grok's live test 2026-11-10: calls 1-2
 * of 4 confirmed, the wallet stopped at call 3). Reproduced on a LOCAL FORK through the app's own server:
 *   an ETH-only account sends ONLY calls 1-2 of the keep-plan (ETH -> wtCOIN, approve wtCOIN -> Permit2) and stops;
 *   then GET /api/tblock/vault-buy?reprise=1&wt=<its wtCOIN> plans leg 2 alone; its calls are sent in order.
 * ASSERTS: the resume plan is PRET with NO ETH value on any call and no app fee; every call status 0x1; the account's wtCOIN goes to the
 *   dust left by rounding (< the dust floor); it receives >= the plan's TBLOCK minimum; its ETH only pays gas during the resume.
 *   NEGATIVE WITNESS: a resume asked for more wtCOIN than the wallet holds is REFUSED with a sentence.
 * DOES NOT PROVE: a real wallet, nor mainnet. Usage: node banc-reprise-wtcoin-fork-20261110.mjs [http://127.0.0.1:8659]. evm_revert at the end. */
import { lecteurFork, ouvrirFork, demarrerServeur, financer, compteNeuf, solde, ETH, USDC, FRAIS, pause } from './outils-essai-fork.mjs';
import { TBLOCK, WTCOIN } from './tblock-hold.js';
import * as TIP from './create-vault-tip.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8659';
const T = TBLOCK.toLowerCase(), W = WTCOIN.toLowerCase();
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) ko += 1; console.log((c ? 'ok  ' : 'KO  ') + m); return c; };
const rpc = lecteurFork(URL_FORK);
const session = await ouvrirFork(rpc);
let srv = null;
const envoyer = async (compte, c) => {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: compte, to: c.to, data: c.data, value: c.value }])) * 13n / 10n; } catch (_) { /* sent anyway */ }
  const h = await rpc('eth_sendTransaction', [{ from: compte, to: c.to, data: c.data, value: c.value, gas: '0x' + gas.toString(16) }]);
  let r = null; for (let i = 0; i < 100 && !r; i += 1) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await pause(200); }
  return r;
};
try {
  srv = await demarrerServeur({ rpcEssai: URL_FORK });
  const compte = compteNeuf('7b40');
  await financer(rpc, compte, { ethWei: 10n ** 17n, usdc: 0n });
  await rpc('anvil_impersonateAccount', [compte]);
  /* Grok's state: the keep-plan's first two calls only */
  const p = await fetch(srv.url + '/api/tblock/vault-buy?garder=1&compte=' + compte + '&eth=881295044928760').then((r) => r.json());
  if (!ok(p.ok && p.appels.length === 4, 'keep-plan PRET with 4 calls (as Rabby showed)')) throw new Error('no plan');
  for (const c of p.appels.slice(0, 2)) { const r = await envoyer(compte, c); ok(r && r.status === '0x1', 'status 1 (before the stop): ' + c.role); }
  const wt = await solde(rpc, W, compte), t0 = await solde(rpc, T, compte);
  ok(wt > 0n && t0 === 0n, 'stopped state: ' + wt + ' wtCOIN, 0 TBLOCK (like 0x31e0 after nonce 149)');
  /* negative witness first */
  const pv = await fetch(srv.url + '/api/tblock/vault-buy?reprise=1&compte=' + compte + '&wt=' + (wt * 2n)).then((r) => r.json());
  ok(pv.etat === 'REFUSE' && /less wtCOIN/.test(pv.pourquoi || ''), 'a resume above the wallet balance is refused: ' + pv.pourquoi);
  const pr = await fetch(srv.url + '/api/tblock/vault-buy?reprise=1&compte=' + compte + '&wt=' + wt).then((r) => r.json());
  if (!ok(pr.ok && pr.etat === 'PRET', 'resume plan ' + pr.etat + (pr.pourquoi ? ' — ' + pr.pourquoi : ''))) throw new Error('no resume plan');
  ok(pr.appels.every((c) => BigInt(c.value || '0x0') === 0n), 'no call of the resume carries ETH');
  ok(String(pr.resume.fraisBps) === '0' && pr.resume.reprise === true, 'no app fee, marked as a resume');
  console.log('    calls: ' + pr.appels.map((c) => c.role).join(' | '));
  const e0 = await solde(rpc, ETH, compte), f0 = await solde(rpc, ETH, FRAIS), f0u = await solde(rpc, USDC, FRAIS);
  for (const c of pr.appels) { const r = await envoyer(compte, c); ok(r && r.status === '0x1', 'status 1: ' + c.role); }
  const t1 = await solde(rpc, T, compte), w1 = await solde(rpc, W, compte), e1 = await solde(rpc, ETH, compte);
  ok(t1 >= BigInt(pr.resume.recoitAuMoins), 'TBLOCK received >= the resume minimum: ' + t1 + ' >= ' + pr.resume.recoitAuMoins);
  ok(w1 < TIP.WTCOIN_RESUME_MIN, 'the wtCOIN is spent (left: ' + w1 + ', under the dust floor)');
  ok(e0 - e1 < 10n ** 15n, 'the resume cost only gas in ETH: ' + (e0 - e1) + ' wei');
  ok((await solde(rpc, ETH, FRAIS)) === f0 && (await solde(rpc, USDC, FRAIS)) === f0u, 'no app fee reached the fee wallet');
} catch (e) { ok(false, 'bench stopped: ' + String((e && e.message) || e).slice(0, 200)); }
finally {
  if (srv) await srv.arreter();
  await session.rendre();
}
console.log((ko === 0 ? 'GREEN ' : 'RED ') + (n - ko) + '/' + n);
process.exit(ko === 0 ? 0 : 1);
