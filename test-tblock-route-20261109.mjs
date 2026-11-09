// test-tblock-route-20261109.mjs — the PURE parts of tblock-route.js (buy / sell TBLOCK) and its wiring in rails-api.js, on a SCRIPTED rpc.
// ⚠️ DOES NOT PROVE that a trade goes through: the rpc is scripted. banc-tblock-route-fork-20261109.mjs proves it on a fork of Base.
import * as TR from './tblock-route.js';
import { planRail } from './rails-api.js';
import { TBLOCK, WTCOIN, TBLOCK_POOL, poolIdOfKey } from './tblock-hold.js';
import { FEE_WALLET, USDC_BASE } from './frais-creation.js';
import { FACTORY_AERODROME_CL, FRAIS_INTERFACE_BPS_CL } from './calldata-aerodrome.js';
import { QUOTEUR_AERODROME_CL } from './rolls-en-action.js';
import { FACTORY_AERO_NOUVELLE, ROUTEUR_AERO_NOUVEAU } from './liquidite-actions.js';
import { selecteur } from './keccak.js';

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); };
const bas = (x) => String(x || '').toLowerCase();
const USDC = bas(USDC_BASE), T = bas(TBLOCK), W = bas(WTCOIN), ETH = TR.ETH;
const COMPTE = '0x' + '5'.repeat(40);
const w = (x) => BigInt(x).toString(16).padStart(64, '0');

/* ── the pinned key ── */
{
  const v = TR.verifierCleTblock();
  ok(v.ok === true, 'the pinned TBLOCK key hashes to the pinned poolId ' + TBLOCK_POOL.poolId.slice(0, 12) + '…');
  ok(v.ok && !(v.flags & TR.HOOK_FLAG_BEFORE_SWAP) && v.prendSurSortie === true, 'its hook has no beforeSwap, and afterSwap + afterSwapReturnDelta (takes on the output)');
  ok(TR.verifierCleTblock({ ...TR.TBLOCK_KEY, fee: 500 }).ok === false, 'MUTANT: another fee on the same pair is refused (poolId differs)');
  ok(TR.verifierCleTblock({ ...TR.TBLOCK_KEY, hooks: '0x0000000000000000000000000000000000000000' }).ok === false, 'MUTANT: the same pair without the hook is refused');
  const bs = (BigInt(TR.TBLOCK_KEY.hooks) | TR.HOOK_FLAG_BEFORE_SWAP).toString(16).padStart(40, '0');
  /* the flag check ISOLATED from the poolId check: the mutant key is compared with its own poolId */
  const kbs = { ...TR.TBLOCK_KEY, hooks: '0x' + bs };
  const vbs = TR.verifierCleTblock(kbs, poolIdOfKey(kbs));
  ok(vbs.ok === false && /beforeSwap/.test(vbs.pourquoi || ''), 'MUTANT: a hook address carrying the beforeSwap bit is refused by the flag check itself');
  ok(poolIdOfKey(TR.TBLOCK_KEY) === TBLOCK_POOL.poolId, 'poolIdOfKey(TBLOCK_KEY) is the poolId served by tblock-hold.js');
}

/* ── which pairs this route serves ── */
ok(TR.routeTblockDe(USDC, T) === 'USDC>TBLOCK' && TR.routeTblockDe(ETH, T) === 'ETH>TBLOCK' && TR.routeTblockDe(T, USDC) === 'TBLOCK>USDC', 'routeTblockDe: USDC>TBLOCK, ETH>TBLOCK, TBLOCK>USDC');
ok(TR.routeTblockDe(T, ETH) === null && TR.routeTblockDe(W, T) === null && TR.routeTblockDe(USDC, '0xb200000000000000000000df3ffcd9be89b3843c') === null,
  'routeTblockDe: TBLOCK>ETH, wtCOIN>TBLOCK and another block (TBGAS) are NOT served here');

/* ── the v4 call ── */
{
  const dl = 1900000000;
  const b = TR.calldataSwapTblock({ entree: W, montant: 1000n, min: 900n, deadline: dl });
  const s = TR.calldataSwapTblock({ entree: T, montant: 1000n, min: 900n, deadline: dl });
  ok(b.to === TR.UNIVERSAL_ROUTER && b.data.startsWith(selecteur('execute(bytes,bytes[],uint256)')), 'v4 leg: an execute() call to the Universal Router 0x6ff5…9b43');
  ok(b.zeroForOne === true && b.sortie === T && s.zeroForOne === false && s.sortie === W, 'v4 leg: wtCOIN in = zeroForOne (currency0), TBLOCK in = oneForZero');
  const k = TR.TBLOCK_KEY;
  const cle = w(BigInt(k.currency0)) + w(BigInt(k.currency1)) + w(k.fee) + w(k.tickSpacing) + w(BigInt(k.hooks));
  ok(b.data.includes(cle) && s.data.includes(cle), 'v4 leg: the calldata carries EXACTLY the pinned key (currency0, currency1, 3000, 60, hook)');
  ok(b.data.includes('060c0f'), 'v4 leg: actions SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL — no TAKE to anyone else (no app fee on this leg)');
  ok(!b.data.toLowerCase().includes(FEE_WALLET.slice(2).toLowerCase()), 'v4 leg: the fee wallet appears nowhere in the v4 call');
  let jete = false; try { TR.calldataSwapTblock({ entree: USDC, montant: 1n, min: 1n, deadline: dl }); } catch (_) { jete = true; }
  ok(jete, 'v4 leg: an input that is not a currency of the key throws');
}

/* ── a scripted chain: pinned pools, price 1:1 at mid, quotes 1 % under, every simulated call status 0x1 ── */
const QUOTER_CODE = '0x' + 'aa'.repeat(800) + [1, 2, 3].map(() => FACTORY_AERODROME_CL.slice(2).toLowerCase() + 'bb'.repeat(10)).join('');
function chaine({ getPool = null, sim = 'ok', solde = 10n ** 30n, appelsVus = [] } = {}) {
  return async (method, params) => {
    appelsVus.push(method);
    if (method === 'eth_getBalance') return '0x' + solde.toString(16);
    if (method === 'eth_getCode') return QUOTER_CODE;
    if (method === 'eth_simulateV1') {
      if (sim === 'throw') throw new Error('timeout');
      if (sim === 'funds') throw new Error('Insufficient funds for gas * price + value');
      const calls = params[0].blockStateCalls[0].calls;
      return [{ calls: calls.map((_, i) => (sim === 'revert' && i === calls.length - 1 ? { status: '0x0', error: { message: 'execution reverted' } } : { status: '0x1', gasUsed: '0x5208' })) }];
    }
    if (method !== 'eth_call') throw new Error('unexpected ' + method);
    const { to, data } = params[0];
    const t = bas(to), d = bas(data);
    if (t === bas(FACTORY_AERO_NOUVELLE)) {
      if (getPool) return getPool(d);
      const a = '0x' + d.slice(34, 74), b = '0x' + d.slice(98, 138);
      const p = [TR.POOL_WTCOIN_USDC, TR.POOL_WETH_USDC].find((x) => new Set([a, b]).has(x.a) && new Set([a, b]).has(x.b));
      return '0x' + (p ? p.pool.slice(2) : '').padStart(64, '0');
    }
    if (d.startsWith(selecteur('slot0()'))) return '0x' + w(1n << 96n) + w(0);
    if (d.startsWith(selecteur('balanceOf(address)'))) return '0x' + w(solde);
    if (t === bas(QUOTEUR_AERODROME_CL)) { const m = BigInt('0x' + d.slice(138, 202)); return '0x' + w(m * 99n / 100n) + w(0) + w(0) + w(0); }
    if (t === TR.QUOTER_V4) { const m = BigInt('0x' + d.slice(10 + 64 * 7, 10 + 64 * 8)); return '0x' + w(m * 20n) + w(0); }
    throw new Error('unexpected call to ' + t);
  };
}
const NOW = Date.UTC(2026, 10, 9, 12);
{
  const p = await TR.planRouteTblock({ rpc: chaine(), compte: COMPTE, de: USDC, vers: T, montant: 5_000_000n, maintenant: NOW });
  ok(p.etat === 'PRET' && p.exigeAtomique === true, 'USDC>TBLOCK on the scripted chain: PRET, atomic');
  const r = p.resume || {};
  ok(BigInt(r.fraisBps) === FRAIS_INTERFACE_BPS_CL && BigInt(r.fraisMontant) === 5000n && BigInt(r.montantEchange) === 4_995_000n, 'USDC>TBLOCK: 10 bps = 5000 units of USDC taken at the entry, 4,995,000 swapped');
  const q1 = 4_995_000n * 99n / 100n, min1 = q1 * 99n / 100n, q2 = min1 * 20n;
  ok(BigInt(r.devisPivot) === q1 && BigInt(r.pivotAuMoins) === min1 && BigInt(r.devis) === q2 && BigInt(r.recoitAuMoins) === q2 * 99n / 100n,
    'USDC>TBLOCK: leg 2 spends leg 1’s minimum, the TBLOCK minimum is its quote minus the 1 % tolerance');
  ok(BigInt(r.restePivot) === q1 - min1, 'USDC>TBLOCK: the expected wtCOIN remainder is stated (quote - minimum)');
  const roles = p.appels.map((c) => c.role);
  ok(roles.length === 6 && /interface fee in USDC/.test(roles[5]) && /Uniswap v4/.test(roles[4]), 'USDC>TBLOCK: 6 calls, the v4 swap fifth, the fee LAST');
  ok(p.appels[5].to === USDC && p.appels[5].data.includes(FEE_WALLET.slice(2).toLowerCase()) && p.appels[5].data.endsWith(w(5000n)), 'USDC>TBLOCK: the fee call is USDC.transfer(fee wallet, 5000)');
  ok(p.appels[1].to === ROUTEUR_AERO_NOUVEAU && p.appels[1].data.includes(TR.POOL_WTCOIN_USDC.tickSpacing.toString(16).padStart(64, '0')), 'USDC>TBLOCK: the Aerodrome swap goes to the newer router at ts 200');
  ok(p.appels[0].data.endsWith(w(4_995_000n)), 'USDC>TBLOCK: the USDC approval is EXACTLY the swapped amount');
  const wa = (a) => bas(a).slice(2).padStart(64, '0');
  ok(p.appels[4].data.includes(wa(W) + w(min1)) && p.appels[4].data.includes(wa(T) + w(q2 * 99n / 100n)),
    'USDC>TBLOCK: the v4 call settles EXACTLY leg 1’s minimum of wtCOIN and takes at least the stated TBLOCK minimum');
  ok(p.appels[2].data.endsWith(w(min1)) && p.appels[2].to === W, 'USDC>TBLOCK: the wtCOIN approval to Permit2 is EXACTLY leg 1’s minimum');
  const p0 = await TR.planRouteTblock({ rpc: chaine(), compte: COMPTE, de: USDC, vers: T, montant: 5_000_000n, maintenant: NOW, fraisBps: 0n });
  ok(p0.etat === 'PRET' && p0.appels.length === 5 && !p0.appels.some((c) => /fee/.test(c.role)) && BigInt(p0.resume.fraisMontant) === 0n, 'fraisBps 0 (holder): no fee call, nothing taken');
  const pk = await TR.planRouteTblock({ rpc: chaine(), compte: COMPTE, de: USDC, vers: T, montant: 5_000_000n, maintenant: NOW, fraisBps: 101n });
  ok(pk.etat === 'REFUSE', 'fraisBps above 100 is refused');
  const pd = await TR.planRouteTblock({ rpc: chaine(), compte: COMPTE, de: USDC, vers: T, montant: 999n, maintenant: NOW });
  ok(pd.etat === 'REFUSE', 'dust (fee rounds to 0) is refused');
}
{
  const p = await TR.planRouteTblock({ rpc: chaine(), compte: COMPTE, de: ETH, vers: T, montant: 10n ** 15n, maintenant: NOW });
  ok(p.etat === 'PRET', 'ETH>TBLOCK: PRET');
  const fee = 10n ** 15n * 10n / 10000n, sw = 10n ** 15n - fee;
  ok(p.appels[0].value === '0x' + sw.toString(16) && p.appels[0].data.startsWith('0xc04b8d59') && p.appels[0].to === ROUTEUR_AERO_NOUVEAU,
    'ETH>TBLOCK: ONE exactInput on the newer router, value = amount - fee (the router wraps the ETH)');
  const last = p.appels[p.appels.length - 1];
  ok(last.to === bas(FEE_WALLET) && last.value === '0x' + fee.toString(16) && last.data === '0x', 'ETH>TBLOCK: the fee is a plain ETH transfer of 10 bps to the fee wallet, last');
  ok(BigInt(p.resume.devisPivot) === sw * 99n / 100n * 99n / 100n, 'ETH>TBLOCK: quoted hop by hop (WETH>USDC, then USDC>wtCOIN)');
}
{
  const p = await TR.planRouteTblock({ rpc: chaine(), compte: COMPTE, de: T, vers: USDC, montant: 10n ** 24n, maintenant: NOW });
  ok(p.etat === 'PRET' && p.exigeAtomique === true, 'TBLOCK>USDC: PRET, atomic');
  const roles = p.appels.map((c) => c.role);
  ok(roles.length === 5 && /Uniswap v4/.test(roles[2]) && /interface fee in USDC on the way out/.test(roles[4]), 'TBLOCK>USDC: Permit2 x2, v4, approve, Aerodrome with the fee on the way out');
  ok(p.appels[4].data.startsWith('0xac9650d8') && p.appels[4].data.includes('e0e189a0'), 'TBLOCK>USDC: multicall(exactInputSingle, sweepTokenWithFee) — the fee in USDC');
  const q1 = 10n ** 24n * 20n, min1 = q1 * 99n / 100n, q2 = min1 * 99n / 100n, minPools = q2 * 99n / 100n;
  ok(BigInt(p.resume.recoitAuMoins) === minPools * 9990n / 10000n, 'TBLOCK>USDC: the user minimum is the pools minimum minus the 10 bps fee');
  const p0 = await TR.planRouteTblock({ rpc: chaine(), compte: COMPTE, de: T, vers: USDC, montant: 10n ** 24n, maintenant: NOW, fraisBps: 0 });
  ok(p0.etat === 'PRET' && p0.appels[4].data.startsWith('0xa026383e') && !p0.appels[4].data.includes(FEE_WALLET.slice(2).toLowerCase()), 'TBLOCK>USDC fraisBps 0: a plain exactInputSingle, the fee wallet absent');
}
/* ── refusals and blindness are told apart ── */
{
  const autre = await TR.planRouteTblock({ rpc: chaine({ getPool: () => '0x' + w(BigInt('0x' + '1'.repeat(40))) }), compte: COMPTE, de: USDC, vers: T, montant: 5_000_000n, maintenant: NOW });
  ok(autre.etat === 'REFUSE' && /pinned pool/.test(autre.pourquoi), 'the factory returns another pool: REFUSE, nothing built on it');
  const aveugle = await TR.planRouteTblock({ rpc: chaine({ getPool: () => { throw new Error('429 too many requests'); } }), compte: COMPTE, de: USDC, vers: T, montant: 5_000_000n, maintenant: NOW });
  ok(aveugle.etat === 'NON_MESURE', 'getPool not read (429): NON_MESURE, not a refusal');
  ok((await TR.planRouteTblock({ rpc: chaine({ sim: 'revert' }), compte: COMPTE, de: USDC, vers: T, montant: 5_000_000n, maintenant: NOW })).etat === 'REFUSE', 'a simulated call reverts: REFUSE');
  ok((await TR.planRouteTblock({ rpc: chaine({ sim: 'throw' }), compte: COMPTE, de: USDC, vers: T, montant: 5_000_000n, maintenant: NOW })).etat === 'NON_MESURE', 'the simulation is not answered: NON_MESURE');
  ok((await TR.planRouteTblock({ rpc: chaine({ sim: 'funds' }), compte: COMPTE, de: ETH, vers: T, montant: 10n ** 15n, maintenant: NOW })).sansFonds === true, 'not enough ETH for the simulation: REFUSE sansFonds');
  const pauvre = await TR.planRouteTblock({ rpc: chaine({ solde: 1n }), compte: COMPTE, de: USDC, vers: T, montant: 5_000_000n, maintenant: NOW });
  ok(pauvre.etat === 'REFUSE' && pauvre.sansFonds === true, 'a wallet holding less than the amount: REFUSE with a plain sentence');
}
/* ── the rails API routes these three pairs here, and only these ── */
{
  const r = await planRail({ de: USDC, vers: T, montant: '5000000', compte: COMPTE }, { rpc: chaine(), maintenant: NOW });
  ok(r.ok && r.etat === 'PRET' && r.via === 'planRouteTblock' && r.atomique === true && r.aSigner.length === 6, 'planRail USDC>TBLOCK: PRET via planRouteTblock, atomique, 6 calls to sign');
  ok(r.resume && r.resume.fraisBps === '10' && /^\d+$/.test(r.resume.recoitAuMoins), 'planRail: resume.fraisBps and recoitAuMoins are served (JSON strings)');
  const e = await planRail({ de: 'ETH', vers: T, montant: String(10n ** 15n), compte: COMPTE }, { rpc: chaine(), maintenant: NOW });
  ok(e.etat === 'PRET' && e.via === 'planRouteTblock' && e.aSigner[0].value !== '0x0', 'planRail ETH>TBLOCK: PRET via planRouteTblock, the ETH sent as value');
  const s = await planRail({ de: T, vers: USDC, montant: String(10n ** 24n), compte: COMPTE }, { rpc: chaine(), maintenant: NOW });
  ok(s.etat === 'PRET' && s.via === 'planRouteTblock', 'planRail TBLOCK>USDC: PRET via planRouteTblock');
  const vus = [];
  const x = await planRail({ de: T, vers: 'ETH', montant: String(10n ** 24n), compte: COMPTE }, { rpc: chaine({ appelsVus: vus }), maintenant: NOW }).catch((er) => ({ via: 'threw ' + er.message }));
  ok(x.via !== 'planRouteTblock', 'planRail TBLOCK>ETH is NOT routed here (the generic router keeps its own verdict: ' + (x.etat || x.via) + ')');
}

if (ko) { console.log('FAIL test-tblock-route-20261109 · ' + (n - ko) + ' ok, ' + ko + ' KO'); process.exit(1); }
console.log('ALL PASS test-tblock-route-20261109 · ' + n + ' assertions');
