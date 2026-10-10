/* test-aerodrome-simule-20261010.mjs - PRIORITE Claude (fork base-anvil bloc 52 432 772, prod a690a4b) : 11 actions Aerodrome ts=1
 *   rendaient un achat USDC PRET dont le swap REVERTE (« Too little received ») - planAerodromeSegment rendait PRET sans simulation,
 *   minimum au prix spot. Desormais la sequence EXACTE du plan (approbation + swap) passe par eth_simulateV1 depuis le compte :
 *   un revert = REFUSE « the chain refuses this exact swap », jamais PRET ; une simulation illisible = NON_MESURE.
 *   Lecteur RPC FICTIF (pool ARMc de la table, ts 1), hors reseau. La preuve sur fork est banc-marche-actions-fork-20261004.mjs. */
import { selecteur } from './keccak.js';
import { calldataGetPool } from './calldata-aerodrome.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { USDC_BASE } from './frais-creation.js';
import { planAerodromeSegment } from './plan-aerodrome-segment.js';
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); };
const bas = (x) => String(x).toLowerCase();
const USDC = bas(USDC_BASE);
const [ARM, INFO] = [...POOLS_ACTIONS_AERODROME].find(([, v]) => v.symbole === 'ARMc');
const POOL = bas(INFO.pool), COMPTE = '0x00000000000000000000000000000000c0ffee77';
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const SEL_BAL = selecteur('balanceOf(address)'), SEL_T0 = selecteur('token0()'), SEL_S0 = selecteur('slot0()');
function lecteur(sim) {
  const gp = new Map();
  for (const ts of [1, 10, 50, 80, 100, 150, 200, 500, 2000]) for (const [x, y] of [[USDC, ARM], [ARM, USDC]]) {
    const c = calldataGetPool({ tokenA: x, tokenB: y, tickSpacing: ts }); if (c.etat === 'PRET') gp.set(c.data, ts === INFO.tickSpacing ? POOL : '0x' + '0'.repeat(40));
  }
  const vu = [];
  const rpc = async (m, params) => {
    if (m === 'eth_simulateV1') { vu.push(params[0]); return sim(params[0]); }
    if (m !== 'eth_call') return '0x1';
    const { data } = params[0];
    if (gp.has(data)) return '0x' + mot(gp.get(data));
    if (String(data).startsWith(SEL_BAL)) return '0x' + mot(10n ** 12n);
    if (data === SEL_T0) return '0x' + mot(USDC);
    if (data === SEL_S0) return '0x' + mot(2n ** 96n * 1000000n) + mot(0).repeat(5);
    return '0x' + mot(0);
  };
  rpc.vu = vu;
  return rpc;
}
const plan = (rpc) => planAerodromeSegment({ rpc, chemin: [{ de: USDC, vers: ARM, famille: 'aerodrome' }], devise: USDC, block: ARM, montant: 50n * 10n ** 6n,
  compte: COMPTE, beneficiaireFrais: '0x00000000000000000000000000000000000fee01', maintenant: 1900000000000 });
const OK2 = () => [{ calls: [{ status: '0x1' }, { status: '0x1' }] }];
const REVERT = () => [{ calls: [{ status: '0x1' }, { status: '0x0', error: { message: 'execution reverted: Too little received' } }] }];
/* 1. ADVERSE : le swap reverterait -> REFUSE, jamais PRET */
let r = await plan(lecteur(REVERT));
ok(r.etat === 'REFUSE' && /the chain refuses this exact swap/.test(r.pourquoi) && /Too little received/.test(r.pourquoi), '1 swap qui reverte (Too little received) -> REFUSE nomme (' + r.etat + ' : ' + r.pourquoi + ')');
/* 2. la simulation porte la sequence EXACTE du plan, depuis le compte */
const rp = lecteur(OK2); r = await plan(rp);
const calls = rp.vu[0] && rp.vu[0].blockStateCalls && rp.vu[0].blockStateCalls[0].calls;
ok(r.etat === 'PRET' && Array.isArray(calls) && calls.length === 2 && calls.every((c, i) => bas(c.from) === COMPTE && c.to === r.appels[i].to && c.data === r.appels[i].data),
  '2 simulation OK -> PRET ; elle a porte les 2 appels du plan, tels quels, depuis le compte (' + r.etat + ')');
ok(r.etat === 'PRET' && r.resume.simule === true, '2b le plan le DIT : resume.simule = true');
/* 3. TEMOINS : simulation illisible -> NON_MESURE ; reponse incomplete -> NON_MESURE */
r = await plan(lecteur(() => { throw new Error('method eth_simulateV1 not found'); }));
ok(r.etat === 'NON_MESURE', '3 simulation qui jette -> NON_MESURE, jamais PRET (' + r.etat + ')');
r = await plan(lecteur(() => [{ calls: [{ status: '0x1' }] }]));
ok(r.etat === 'NON_MESURE', '3b reponse pour 1 appel sur 2 -> NON_MESURE (' + r.etat + ')');
/* 4. manque de fonds : dit comme tel (pas « le marche refuse ») */
r = await plan(lecteur(() => [{ calls: [{ status: '0x1' }, { status: '0x0', error: { message: 'execution reverted: STF' } }] }]));
ok(r.etat === 'REFUSE' && r.sansFonds === true && /not enough/.test(r.pourquoi), '4 STF -> REFUSE sansFonds, « not enough ... » (' + r.pourquoi + ')');
/* 5. VENTE (Claude : les ventes de ces actions revertent aussi) - ARMc -> USDC et ARMc -> USDC -> WETH : meme simulation */
const vente = (rpc, chemin, block, eth) => planAerodromeSegment({ rpc, chemin, devise: ARM, block, montant: 5n * 10n ** 16n,
  compte: COMPTE, beneficiaireFrais: '0x00000000000000000000000000000000000fee01', maintenant: 1900000000000, ...(eth ? { sortieEthNatif: true } : {}) });
r = await vente(lecteur(REVERT), [{ de: ARM, vers: USDC, famille: 'aerodrome' }], USDC);
ok(r.etat === 'REFUSE' && /the chain refuses this exact swap/.test(r.pourquoi), '5 vente ARMc -> USDC dont le swap reverte -> REFUSE (' + r.etat + ')');
const rv = lecteur(OK2); r = await vente(rv, [{ de: ARM, vers: USDC, famille: 'aerodrome' }], USDC);
ok(r.etat === 'PRET' && rv.vu.length === 1 && bas(rv.vu[0].blockStateCalls[0].calls[0].to) === ARM, '5b vente simulee OK -> PRET ; l approbation simulee est celle de ARMc (' + r.etat + ')');console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);