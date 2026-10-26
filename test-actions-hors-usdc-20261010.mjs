/* test-actions-hors-usdc-20261010.mjs - demande de Phil (DIG-actions-hors-USDC-2026-10-10) : une action de la table Aerodrome
 *   s achete et se vend contre WETH, cbBTC, EURC par X -> USDC -> action (et l inverse) en UN exactInput Aerodrome, les pools
 *   X/USDC EPINGLEES (mesurees le 2026-10-10, bloc 52 435 371) et le plan SIMULE. Lecteur RPC FICTIF, hors reseau.
 *   Adverse : une pool TIERCE X/USDC (ts 100) plus profonde a un prix 1000x pire ne doit jamais etre prise. */
import { selecteur } from './keccak.js';
import { calldataGetPool } from './calldata-aerodrome.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { USDC_BASE } from './frais-creation.js';
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); };
const bas = (x) => String(x).toLowerCase();
const USDC = bas(USDC_BASE);
const [AMZ, INFO] = [...POOLS_ACTIONS_AERODROME].find(([, v]) => v.symbole === 'AMZNc');
const X = {
  WETH: { a: '0x4200000000000000000000000000000000000006', pool: '0x3fe04a59ebd38cf06080a6f60a98d124eb59392a', ts: 50, m: 10n ** 17n },
  cbBTC: { a: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', pool: '0x160d7e9d948b16c163332a277b393c288408eb12', ts: 50, m: 10n ** 5n },
  /* 2026-10-26 : EURC BANNI (Phil) — remplace par AUDF, la devise pivot mesuree du jour (plan-franchissement.js, meme mecanisme, 6 dec) */
  AUDF: { a: '0xd2a530170d71a9cfe1651fb468e2b98f7ed7456b', pool: '0x87449c0191ad358d54d15ef7ce34e7bf569eee0c', ts: 10, m: 100n * 10n ** 6n },
};
const EURC_BANNI = '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42';
const TIERCE = '0x7e7e000000000000000000000000000000000100', AUTRE = '0x9999000000000000000000000000000000000009';
const COMPTE = '0x00000000000000000000000000000000c0ffee77';
const Q96 = 2n ** 96n;
const SEL_BAL = selecteur('balanceOf(address)'), SEL_T0 = selecteur('token0()'), SEL_S0 = selecteur('slot0()');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
function lecteur({ x, revert = false, pivotAutre = false } = {}) {
  const gp = new Map();
  for (const ts of [1, 10, 50, 100, 200, 2000]) for (const [ta, tb] of [[USDC, x.a], [x.a, USDC], [USDC, AMZ], [AMZ, USDC]]) {
    const c = calldataGetPool({ tokenA: ta, tokenB: tb, tickSpacing: ts });
    const estX = bas(ta) === x.a || bas(tb) === x.a;
    let p = '0x' + '0'.repeat(40);
    if (estX && ts === x.ts) p = pivotAutre ? AUTRE : x.pool;
    else if (estX && ts === 100) p = TIERCE;
    else if (!estX && ts === INFO.tickSpacing) p = bas(INFO.pool);
    gp.set(c.data, p);
  }
  const vus = [];
  const rpc = async (m, params) => {
    if (m === 'eth_simulateV1') {
      const calls = params[0].blockStateCalls[0].calls;
      rpc.sim = calls;
      return [{ calls: calls.map((_, i) => (revert && i === calls.length - 1 ? { status: '0x0', error: { message: 'execution reverted: Too little received' } } : { status: '0x1' })) }];
    }
    if (m !== 'eth_call') return '0x1';
    const { to, data } = params[0];
    if (gp.has(data)) return '0x' + mot(gp.get(data));
    if (String(data).startsWith(SEL_BAL)) return '0x' + mot(10n ** 30n);
    if (data === SEL_T0) return '0x' + mot(USDC);
    if (data === SEL_S0) { vus.push(bas(to)); return '0x' + mot(bas(to) === TIERCE ? Q96 / 1000n : Q96) + mot(0).repeat(5); }
    return '0x' + mot(0);
  };
  rpc.vus = vus;
  return rpc;
}
const R = await import('./rails-api.js');
const plan = (rpc, de, vers, montant) => R.planRail({ de, vers, montant: String(montant), compte: COMPTE }, { rpc, maintenant: 1900000000000 });
const pools = (x) => new Set([x.pool, bas(INFO.pool)]);
for (const [s, x] of Object.entries(X)) {
  for (const [sens, de, vers, m] of [['achat', x.a, AMZ, x.m], ['vente', AMZ, x.a, 10n ** 17n]]) {
    const rpc = lecteur({ x });
    const r = await plan(rpc, de, vers, m);
    /* ⛔ garde Zero 1 F-c6 (calldata-aerodrome.js) : notre frais n est jamais pris dans un jeton hors ETH/USDC/devise connue/action.
     *   AUDF n y est pas : la VENTE action -> AUDF reste un refus NOMME (comme EURC avant lui) ; l ACHAT paie le frais en action. */
    if (s === 'AUDF' && sens === 'vente') { ok(r.etat === 'REFUSE' && /fee would be taken in the output token/.test(r.pourquoi || ''), 'AUDF vente : refus NOMME (frais jamais pris en AUDF) (' + r.etat + ')'); continue; }
    const res = r && r.resume || {};
    ok(r.etat === 'PRET' && rpc.vus.length > 0 && rpc.vus.every((p) => pools(x).has(p)) && Array.isArray(rpc.sim) && rpc.sim.length === 2,
      s + ' ' + sens + ' : PRET, sur les DEUX pools mesurees seulement (jamais la tierce), plan simule approve + 1 swap (' + r.etat + ' ' + (r.pourquoi || '') + ')');
    ok(bas(res.payeDevise) === bas(de) && bas(res.recoitDevise) === bas(vers), s + ' ' + sens + ' : paie ' + res.payeDevise + ' recoit ' + res.recoitDevise);
    const rv = await plan(lecteur({ x, revert: true }), de, vers, m);
    ok(rv.etat === 'REFUSE' && /refuses this exact swap/.test(rv.pourquoi || ''), s + ' ' + sens + ' : la simulation revert -> REFUSE, jamais PRET (' + rv.etat + ')');
    const ra = await plan(lecteur({ x, pivotAutre: true }), de, vers, m);
    ok(ra.etat !== 'PRET', s + ' ' + sens + ' : la fabrique ne rend plus la pool mesuree X/USDC -> pas PRET (' + ra.etat + ')');
  }
}
/* 2026-10-26 : EURC banni — ni l achat ni la vente d une action contre EURC ne lisent la chaine ; le refus le nomme */
for (const [de, vers] of [[EURC_BANNI, AMZ], [AMZ, EURC_BANNI]]) {
  const rpc = lecteur({ x: X.AUDF });
  let lu = 0; const compte = async (m, p) => { lu += 1; return rpc(m, p); };
  const r = await plan(compte, de, vers, 100n * 10n ** 6n);
  ok(r.etat === 'REFUSE' && /EURC is not offered for now/.test(r.pourquoi || '') && r.aSigner.length === 0 && lu === 0,
    'EURC ' + (de === EURC_BANNI ? 'achat' : 'vente') + ' : REFUSE nomme, 0 lecture, rien a signer (' + r.etat + ', ' + lu + ' lectures)');
}
console.log(n - ko + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
