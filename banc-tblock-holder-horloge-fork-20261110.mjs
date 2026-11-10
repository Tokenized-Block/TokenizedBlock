/* banc-tblock-holder-horloge-fork-20261110.mjs — FORK ONLY. The holder (0 bps) TBLOCK buys, USDC and ETH, on a fork whose CLOCK RUNS AHEAD of
 *   the server's (evm_increaseTime 2000 s, as another bench on a shared fork does). Before the 2026-11-10 fix the plan's deadline came
 *   from the server clock: on such a fork the Aerodrome call reverts with empty data and nothing is debited. Asserts per buy: plan PRET at
 *   0 bps, every call status 0x1, TBLOCK >= plan minimum, the fee wallet +0 (USDC and ETH). Everything undone by evm_revert.
 * Usage: node banc-tblock-holder-horloge-fork-20261110.mjs [http://127.0.0.1:8658] */
import { lecteurFork, ouvrirFork, financer, solde, ETH, USDC, FRAIS } from './outils-essai-fork.mjs';
import { planRouteTblock } from './tblock-route.js';
import { TBLOCK } from './tblock-hold.js';
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8658';
const W = '0x37eb9b7ce0b51fe12fbf092026e001918128580a', T = TBLOCK.toLowerCase();
let n = 0, ko = 0; const ok = (c, m) => { n++; if (!c) ko++; console.log((c ? 'ok  ' : 'KO  ') + m); };
const rpc = lecteurFork(URL_FORK);
const s = await ouvrirFork(rpc);
try {
  await financer(rpc, W, { ethWei: 10n ** 17n, usdc: 2_000_000n }); await rpc('anvil_impersonateAccount', [W]);
  await rpc('evm_increaseTime', [2000]); await rpc('evm_mine', []);
  const b = await rpc('eth_getBlockByNumber', ['latest', false]);
  ok(parseInt(b.timestamp, 16) - Math.floor(Date.now() / 1000) > 600, 'fork clock is ' + (parseInt(b.timestamp, 16) - Math.floor(Date.now() / 1000)) + ' s ahead of the server clock (more than the 600 s deadline window)');
  for (const [nom, de, m] of [['USDC 2 -> TBLOCK', USDC, 2_000_000n], ['ETH 0.001 -> TBLOCK', ETH, 10n ** 15n]]) {
    const p = await planRouteTblock({ rpc, compte: W, de, vers: T, montant: m, fraisBps: 0n });
    ok(p.etat === 'PRET' && BigInt(p.resume.fraisBps) === 0n, nom + ' (holder, 0 bps): plan ' + p.etat + ' ' + (p.pourquoi || '') + ' · ' + (p.appels || []).length + ' calls');
    if (p.etat !== 'PRET') continue;
    const av = { t: await solde(rpc, T, W), fu: await solde(rpc, USDC, FRAIS), fe: await solde(rpc, ETH, FRAIS) };
    const st = [];
    for (const c of p.appels) {
      const h = await rpc('eth_sendTransaction', [{ from: W, to: c.to, data: c.data, value: c.value, gas: '0x16e360' }]);
      let r = null; for (let k = 0; k < 50 && !r; k++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await new Promise((o) => setTimeout(o, 100)); }
      st.push(r.status); if (r.status !== '0x1') { console.log('    reverted: ' + c.role); break; }
    }
    ok(st.length === p.appels.length && st.every((x) => x === '0x1'), nom + ': ' + st.filter((x) => x === '0x1').length + '/' + p.appels.length + ' calls status 0x1');
    const recu = (await solde(rpc, T, W)) - av.t;
    ok(recu >= BigInt(p.resume.recoitAuMoins), nom + ': received ' + recu + ' TBLOCK units >= minimum ' + p.resume.recoitAuMoins);
    const dfu = (await solde(rpc, USDC, FRAIS)) - av.fu, dfe = (await solde(rpc, ETH, FRAIS)) - av.fe;
    ok(dfu === 0n && dfe === 0n, nom + ': fee wallet +' + dfu + ' USDC units, +' + dfe + ' wei');
  }
} catch (e) { ok(false, 'stopped: ' + String(e.message || e).slice(0, 200)); }
finally { console.log('evm_revert: ' + await s.rendre()); }
console.log((n - ko) + '/' + n + ' ok'); process.exit(ko ? 1 : 0);
