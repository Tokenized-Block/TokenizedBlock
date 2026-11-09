/* banc-tblock-route-fork-20261109.mjs — BUY and SELL TBLOCK through the app's own planner (GET /api/rails/plan), on a LOCAL FORK only.
 *
 * Steps: refuse unless the node is anvil on chain 8453 (ouvrirFork) -> evm_snapshot -> start THIS repo's server in test mode on the fork
 *   (TB_RPC_TEST, network guard preloaded) -> a fresh account funded on the fork (ETH by anvil_setBalance, USDC by an impersonated
 *   transfer from an Aerodrome stock pool, as financer() does) -> for each route: ask the server for the plan, send its calls IN ORDER
 *   from the impersonated account, read every balance that should move.
 * ASSERTS, per route: plan PRET + atomique; every call status 0x1; received >= the plan's minimum; the interface fee reached the fee
 *   wallet 0xa6cf… EXACTLY as the plan states (buy: the stated amount; sell: floor(out x bps / 10000) of the USDC out); nothing left in
 *   the Aerodrome router or the Universal Router (USDC, wtCOIN, TBLOCK, ETH); 0x…dEaD received the hook's cut.
 *   NEGATIVE WITNESS: the v4 leg alone (before the Aerodrome leg) reverts — the batch only makes sense atomic.
 * MEASURES: the all-in cost of a $5 buy and of the round trip, against the on-chain mid price read BEFORE the trades (tblock-hold.js).
 * DOES NOT PROVE: an EIP-5792 batch from a real wallet (calls go one by one from the same account, in the same order), nor mainnet.
 * Usage: FOUNDRY_BASE=true base-anvil --base --fork-url https://mainnet.base.org --port 8658 ; node banc-tblock-route-fork-20261109.mjs [http://127.0.0.1:8658]
 * Nothing here touches mainnet; no real value moves; everything is undone by evm_revert at the end. */
import { lecteurFork, ouvrirFork, demarrerServeur, financer, compteNeuf, solde, ETH, USDC, FRAIS, pause } from './outils-essai-fork.mjs';
import { TBLOCK, WTCOIN, tblockUsdAt } from './tblock-hold.js';
import { DEAD, UNIVERSAL_ROUTER, POOL_WTCOIN_USDC } from './tblock-route.js';
import { ROUTEUR_AERO_NOUVEAU } from './liquidite-actions.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8658';
const T = TBLOCK.toLowerCase(), W = WTCOIN.toLowerCase();
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) ko += 1; console.log((c ? 'ok  ' : 'KO  ') + m); return c; };
const fmt = (x, d) => (Number(x) / 10 ** d).toLocaleString('en-US', { maximumFractionDigits: 8 });

const rpc = lecteurFork(URL_FORK);
const session = await ouvrirFork(rpc);
console.log('fork ' + URL_FORK + ' · ' + session.client + ' · block ' + session.tete);
let srv = null;
try {
  srv = await demarrerServeur({ rpcEssai: URL_FORK });
  ok(true, 'server up in test mode on the fork (' + srv.url + ')');
  const compte = compteNeuf('7b10');
  await financer(rpc, compte, { ethWei: 10n ** 18n, usdc: 20n * 10n ** 6n });
  await rpc('anvil_impersonateAccount', [compte]);
  ok((await solde(rpc, USDC, compte)) === 20n * 10n ** 6n, 'test account ' + compte + ' holds 20 USDC on the fork');

  /* the mid price BEFORE any trade: TBLOCK/wtCOIN from the v4 pool, wtCOIN/USDC as the median of three CL pools */
  const lire = (to, data, bloc) => rpc('eth_call', [{ to, data }, bloc === undefined || bloc === null ? 'latest' : '0x' + Number(bloc).toString(16)]);
  const prix = await tblockUsdAt({ lire, bloc: session.tete });
  ok(prix.usd > 0 && prix.wtcoinUsd > 0, 'mid price before trading: 1 TBLOCK = $' + prix.usd.toPrecision(6) + ', 1 wtCOIN = $' + prix.wtcoinUsd.toFixed(4)
    + ' (' + prix.wtcoinReads + ' wtCOIN/USDC pools)');
  const usdDe = (jeton, brut) => (jeton === T ? Number(brut) / 1e18 * prix.usd : jeton === W ? Number(brut) / 1e18 * prix.wtcoinUsd
    : jeton === USDC ? Number(brut) / 1e6 : null);

  const jetons = [USDC, W, T, ETH];
  const qui = { compte, frais: FRAIS, dead: DEAD, ur: UNIVERSAL_ROUTER, aero: ROUTEUR_AERO_NOUVEAU };
  const photo = async () => { const p = {}; for (const [k, a] of Object.entries(qui)) { p[k] = {}; for (const j of jetons) p[k][j] = await solde(rpc, j, a); } return p; };
  const delta = (a, b) => { const d = {}; for (const k of Object.keys(a)) { d[k] = {}; for (const j of jetons) d[k][j] = b[k][j] - a[k][j]; } return d; };
  let plansDemandes = 0;
  const plan = async (de, vers, montant) => {
    /* the server allows 4 plans per IP per minute: the bench waits rather than read a 429 as a refusal */
    if (plansDemandes && plansDemandes % 4 === 0) { console.log('    (waiting 61 s: the server allows 4 plans per minute per IP)'); await pause(61000); }
    plansDemandes += 1;
    const q = new URLSearchParams({ de, vers, montant: String(montant), compte });
    return fetch(srv.url + '/api/rails/plan?' + q).then((r) => r.json());
  };
  const envoyer = async (c) => {
    let gas = 3000000n;
    try { gas = BigInt(await rpc('eth_estimateGas', [{ from: compte, to: c.to, data: c.data, value: c.value }])) * 13n / 10n; } catch (_) { /* sent anyway to read its status */ }
    const h = await rpc('eth_sendTransaction', [{ from: compte, to: c.to, data: c.data, value: c.value, gas: '0x' + gas.toString(16) }]);
    for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { status: r.status, gas: BigInt(r.gasUsed), cout: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || '0x0') }; await pause(100); }
    throw new Error('receipt never came');
  };
  /* one route, end to end */
  async function route(nom, de, vers, montant, { temoinNegatif = false } = {}) {
    const p = await plan(de, vers, montant);
    if (!ok(p.ok && p.etat === 'PRET' && p.via === 'planRouteTblock', nom + ': plan ' + p.etat + ' via ' + p.via + (p.pourquoi ? ' — ' + p.pourquoi : ''))) return null;
    ok(p.atomique === true, nom + ': the plan demands an atomic batch');
    const r = p.resume;
    console.log('    resume: pays ' + r.paye + ' of ' + r.payeDevise + ', fraisBps ' + r.fraisBps + (r.fraisMontant ? ' (' + r.fraisMontant + ' ' + r.fraisDevise + ')' : '')
      + ', receives at least ' + r.recoitAuMoins + ' of ' + r.recoitDevise + ' (quote ' + r.devis + '), pivot wtCOIN quote ' + r.devisPivot + ' / spent ' + r.pivotAuMoins);
    console.log('    calls: ' + p.aSigner.map((c) => c.role).join(' | '));
    if (temoinNegatif) {
      /* the v4 leg alone, before the Aerodrome leg: the account has no wtCOIN and no Permit2 allowance -> must revert */
      const v4 = p.aSigner.find((c) => /Uniswap v4/.test(c.role || ''));
      let revert = false; try { await rpc('eth_call', [{ from: compte, to: v4.to, data: v4.data, value: v4.value }, 'latest']); } catch (_) { revert = true; }
      ok(revert, nom + ': NEGATIVE WITNESS — the v4 leg alone reverts (the batch only makes sense atomic)');
    }
    const avant = await photo();
    let gas = 0n, cout = 0n; const st = [];
    for (const c of p.aSigner) { const x = await envoyer(c); st.push(x.status); gas += x.gas; cout += x.cout; if (x.status !== '0x1') break; }
    if (!ok(st.length === p.aSigner.length && st.every((s) => s === '0x1'), nom + ': ' + st.length + '/' + p.aSigner.length + ' calls status 0x1 (gas ' + gas + ')')) return null;
    const d = delta(avant, await photo());
    d.compte[ETH] += cout; /* the account's ETH move without the gas it paid */
    const recu = d.compte[r.recoitDevise === ETH ? ETH : r.recoitDevise.toLowerCase()];
    ok(recu >= BigInt(r.recoitAuMoins), nom + ': received ' + recu + ' >= minimum ' + r.recoitAuMoins + ' (' + (Number(recu - BigInt(r.recoitAuMoins)) / Number(r.recoitAuMoins) * 100).toFixed(3) + ' % above)');
    for (const k of ['ur', 'aero']) for (const j of jetons) ok(d[k][j] === 0n, nom + ': nothing left in the ' + (k === 'ur' ? 'Universal Router' : 'Aerodrome router') + ' (' + (j === ETH ? 'ETH' : j === USDC ? 'USDC' : j === W ? 'wtCOIN' : 'TBLOCK') + ' delta ' + d[k][j] + ')');
    ok(d.dead[T] > 0n || d.dead[W] > 0n, nom + ': 0x…dEaD received the hook cut (TBLOCK +' + d.dead[T] + ', wtCOIN +' + d.dead[W] + ')');
    return { p, r, d, gas };
  }

  /* ── 1. BUY TBLOCK with 5 USDC ── */
  const ach = await route('BUY 5 USDC -> TBLOCK', USDC, T, 5000000n, { temoinNegatif: true });
  if (ach) {
    const { r, d } = ach;
    ok(d.frais[USDC] === BigInt(r.fraisMontant) && BigInt(r.fraisMontant) === 5000000n * BigInt(r.fraisBps) / 10000n,
      'BUY USDC: the fee wallet received exactly ' + d.frais[USDC] + ' USDC units = stated ' + r.fraisMontant + ' (' + r.fraisBps + ' bps of 5 USDC)');
    ok(d.frais[T] === 0n && d.frais[W] === 0n, 'BUY USDC: no fee taken in TBLOCK or wtCOIN');
    ok(d.compte[USDC] === -5000000n, 'BUY USDC: the account paid exactly 5 USDC');
    const resteW = d.compte[W];
    ok(resteW >= 0n && resteW <= BigInt(r.restePivot) * 2n + 1n, 'BUY USDC: wtCOIN left in the wallet ' + resteW + ' (stated expected ' + r.restePivot + ')');
    const valT = usdDe(T, d.compte[T]), valW = usdDe(W, resteW);
    console.log('    MEASURED $5 buy: ' + fmt(d.compte[T], 18) + ' TBLOCK = $' + valT.toFixed(4) + ' at mid + wtCOIN left $' + valW.toFixed(4)
      + ' -> all-in cost ' + ((1 - (valT + valW) / 5) * 100).toFixed(3) + ' % (counting the wtCOIN left), ' + ((1 - valT / 5) * 100).toFixed(3) + ' % (TBLOCK only); gas ' + ach.gas);

    /* ── 2. SELL all of it back to USDC ── */
    const ven = await route('SELL TBLOCK -> USDC', T, USDC, d.compte[T]);
    if (ven) {
      const { r: r2, d: d2 } = ven;
      const sortie = d2.compte[USDC] + d2.frais[USDC];
      ok(d2.frais[USDC] === sortie * BigInt(r2.fraisBps) / 10000n && d2.frais[USDC] > 0n,
        'SELL: the fee wallet received ' + d2.frais[USDC] + ' USDC units = ' + r2.fraisBps + ' bps of the ' + sortie + ' out of the pool (sweepTokenWithFee, as stated)');
      ok(d2.frais[T] === 0n && d2.frais[W] === 0n, 'SELL: no fee taken in TBLOCK or wtCOIN');
      ok(d2.compte[T] === -d.compte[T], 'SELL: the account sold exactly the TBLOCK it bought');
      const resteW2 = d2.compte[W];
      const back = Number(d2.compte[USDC]) / 1e6, restes = usdDe(W, resteW + resteW2);
      console.log('    MEASURED round trip: 5 USDC -> ' + back.toFixed(6) + ' USDC back + wtCOIN left in the wallet $' + restes.toFixed(4)
        + ' -> round-trip cost ' + ((1 - (back + restes) / 5) * 100).toFixed(3) + ' % (counting the wtCOIN left), ' + ((1 - back / 5) * 100).toFixed(3) + ' % (USDC only); gas ' + (ach.gas + ven.gas));
    }
  }

  /* ── 3. BUY TBLOCK with about $5 of ETH ── */
  const ethUsd = await (async () => { /* ETH/USDC at the mid price of the pinned WETH/USDC pool (slot0; token0 = WETH) */
    const s = await rpc('eth_call', [{ to: '0x4a7af46bc8abc00048c6c7920a1488daf568366c', data: '0x3850c7bd' }, 'latest']);
    const x = Number(BigInt(s.slice(0, 66))) / 2 ** 96; return x * x * 1e12; })();
  const wei5 = BigInt(Math.round(5 / ethUsd * 1e18));
  const eth = await route('BUY ~$5 ETH -> TBLOCK', 'ETH', T, wei5);
  if (eth) {
    const { r, d } = eth;
    ok(d.frais[ETH] === BigInt(r.fraisMontant) && BigInt(r.fraisMontant) === wei5 * BigInt(r.fraisBps) / 10000n,
      'BUY ETH: the fee wallet received exactly ' + d.frais[ETH] + ' wei = stated ' + r.fraisMontant + ' (' + r.fraisBps + ' bps)');
    ok(d.frais[USDC] === 0n && d.frais[T] === 0n && d.frais[W] === 0n, 'BUY ETH: one fee only, in ETH');
    ok(d.compte[ETH] === -wei5, 'BUY ETH: the account paid exactly ' + wei5 + ' wei (gas apart)');
    const valT = usdDe(T, d.compte[T]), valW = usdDe(W, d.compte[W]), paid = Number(wei5) / 1e18 * ethUsd;
    console.log('    MEASURED $' + paid.toFixed(4) + ' ETH buy (ETH at $' + ethUsd.toFixed(2) + ' from the WETH/USDC pool mid): ' + fmt(d.compte[T], 18) + ' TBLOCK = $' + valT.toFixed(4)
      + ' + wtCOIN left $' + valW.toFixed(4) + ' -> all-in cost ' + ((1 - (valT + valW) / paid) * 100).toFixed(3) + ' %; gas ' + eth.gas);
  }
} catch (e) {
  ok(false, 'bench stopped: ' + String((e && e.message) || e).slice(0, 300));
} finally {
  if (srv) { const o = srv.origines(); console.log('server network: joined ' + JSON.stringify(o.joints) + ', blocked ' + o.bloques.length); await srv.arreter(); }
  console.log('evm_revert: ' + await session.rendre());
}
console.log('\n' + (n - ko) + '/' + n + ' ok' + (ko ? ' — ' + ko + ' KO' : ''));
process.exit(ko ? 1 : 0);
