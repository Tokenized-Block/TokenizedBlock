/* test-pivot-weth-usdc-epingle-20261010.mjs - le saut USDC <-> WETH (route 4 bis, ETH > action, franchissements) se fait sur la pool
 *   MESUREE (plan-franchissement.js POOLS_PIVOTS_AERODROME), jamais sur « la plus profonde lue » ; la branche « profondeur partielle »
 *   de 3f8a9c9 ne choisit plus de pool. Lecteur RPC FICTIF, hors reseau.
 *   Cas adverse : une pool TIERCE USDC/WETH a l espacement 80 (creation permissionless) detient 10 M USDC (plus que la vraie, 6,46 M)
 *   a un prix 1000x pire. Avant : elle gagne, minimum ecrase. Apres : la vraie pool (espacement 50). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selecteur } from './keccak.js';
import { calldataGetPool } from './calldata-aerodrome.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { USDC_BASE } from './frais-creation.js';
import { WETH_BASE } from './plan-eth-block.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); };
const bas = (x) => String(x).toLowerCase();
const USDC = bas(USDC_BASE), WETH = bas(WETH_BASE);
const [NVDA, INFO] = [...POOLS_ACTIONS_AERODROME].find(([, v]) => v.symbole === 'NVDAc');
const P_NVDA = bas(INFO.pool);
const VRAIE = '0x3fe04a59ebd38cf06080a6f60a98d124eb59392a', TIERCE = '0x7777000000000000000000000000000000000080', AUTRE = '0x9999000000000000000000000000000000000050';
const Q96 = 2n ** 96n;
/* WETH = token0 (0x42.. < 0x83..) : prix USDC par WETH ~ 2 400 -> sqrt(2400e6/1e18) * 2^96 */
const S_VRAI = 3880n * Q96 / 1000000n, S_TIERS = S_VRAI * 32n; /* ~1000x moins de WETH par USDC */
const S_NVDA = 52267783314573183670416926724n;
const SEL_BAL = selecteur('balanceOf(address)'), SEL_T0 = selecteur('token0()'), SEL_S0 = selecteur('slot0()');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
function lecteur({ vraieProf = 6457971n * 10n ** 6n, poolTs50 = VRAIE, ts50Leve = false } = {}) {
  const gp = new Map();
  for (const ts of [1, 10, 50, 80, 100, 150, 200, 500, 2000]) {
    for (const [x, y] of [[USDC, WETH], [WETH, USDC]]) {
      const c = calldataGetPool({ tokenA: x, tokenB: y, tickSpacing: ts }); if (c.etat !== 'PRET') continue;
      gp.set(c.data, ts === 50 ? poolTs50 : ts === 80 ? TIERCE : '0x' + '0'.repeat(40));
    }
    for (const [x, y] of [[USDC, NVDA], [NVDA, USDC]]) {
      const c = calldataGetPool({ tokenA: x, tokenB: y, tickSpacing: ts }); if (c.etat !== 'PRET') continue;
      gp.set(c.data, ts === INFO.tickSpacing ? P_NVDA : '0x' + '0'.repeat(40));
    }
  }
  const vus = [];
  const rpc = async (m, params) => {
    /* 2026-10-10 (e0b346d) : le segment simule son plan - ici la simulation passe, seul le CHOIX DE POOL est juge */
    if (m === 'eth_simulateV1') return [{ calls: params[0].blockStateCalls[0].calls.map(() => ({ status: '0x1' })) }];
    if (m !== 'eth_call') return '0x1';
    const { to, data } = params[0];
    if (gp.has(data)) { if (ts50Leve && gp.get(data) === poolTs50) throw new Error('429'); return '0x' + mot(gp.get(data)); }
    if (String(data).startsWith(SEL_BAL)) {
      const pool = '0x' + String(data).slice(-40);
      if (pool === VRAIE) { if (vraieProf === 'jamais') throw new Error('429'); return '0x' + mot(vraieProf); }
      if (pool === TIERCE) return '0x' + mot(10n ** 13n);
      if (pool === P_NVDA) return '0x' + mot(10n ** 12n);
      return '0x' + mot(0);
    }
    if (data === SEL_T0) return '0x' + mot(bas(to) === P_NVDA ? NVDA : WETH);
    if (data === SEL_S0) { vus.push(bas(to)); const s = bas(to) === TIERCE ? S_TIERS : bas(to) === P_NVDA ? S_NVDA : S_VRAI; return '0x' + mot(s) + mot(0).repeat(5); }
    return '0x' + mot(0);
  };
  rpc.vus = vus;
  return rpc;
}
const M_NVDA = 10n ** 18n;
const route4bis = async (S, opts) => {
  const rpc = lecteur(opts);
  const r = await S.planAerodromeSegment({ rpc, chemin: [{ de: NVDA, vers: USDC, famille: 'aerodrome' }, { de: USDC, vers: WETH, famille: 'aerodrome' }],
    devise: NVDA, block: WETH, montant: M_NVDA, compte: '0x00000000000000000000000000000000c0ffee77', beneficiaireFrais: '0x00000000000000000000000000000000000fee01',
    maintenant: 1900000000000, sortieEthNatif: true });
  return { r, vus: rpc.vus, min: r.resume ? BigInt(r.resume.recoitAuMoins) : 0n };
};
const S = await import('./plan-aerodrome-segment.js');
const F = await import('./plan-franchissement.js');
/* juste : NVDAc -> USDC au spot de sa pool (NVDAc = token1, entree = 1 -> sortie = in * Q96^2 / s^2), puis USDC -> WETH (entree = token1) */
const { sortieSpot } = await import('./plan-usdc-block.js');
/* meme sens que le mock : token0 lu = NVDAc sur sa pool, WETH sur le pivot */
const usdc = sortieSpot({ entree: M_NVDA, sqrtPriceX96: S_NVDA, entreeEst0: true }), juste = sortieSpot({ entree: usdc, sqrtPriceX96: S_VRAI, entreeEst0: false });
/* 1. ADVERSE, toutes lectures OK : la tierce plus profonde ne gagne plus */
let x = await route4bis(S, {});
ok(x.r.etat === 'PRET' && !x.vus.includes(TIERCE) && x.min * 10n > juste * 9n && x.min <= juste, '1 adverse (tierce 10 M USDC a prix ~1000x pire) : 4 bis sur la VRAIE pool, minimum ' + x.min + ' / juste ' + juste + ' (' + x.r.etat + ')');
/* 2. ADVERSE, profondeur de la vraie illisible (ancienne branche partielle) */
x = await route4bis(S, { vraieProf: 'jamais' });
ok(x.r.etat === 'PRET' && !x.vus.includes(TIERCE) && x.min * 10n > juste * 9n && x.min <= juste, '2 adverse partiel (vraie profondeur illisible) : vraie pool, minimum ' + x.min + ' (' + x.r.etat + ')');
/* 3. pool directe */
const p3 = await F.poolAerodromeDe({ rpc: lecteur({}), a: USDC, b: WETH, montantEntree: 10n ** 9n });
ok(p3.etat === 'PRET' && p3.pool === VRAIE && p3.tickSpacing === 50 && p3.entreeEst0 === false, '3 USDC -> WETH : pool mesuree ' + p3.pool + ' (ts ' + p3.tickSpacing + ', sens lu)');
/* 4. TEMOINS NEGATIFS */
const p4 = await F.poolAerodromeDe({ rpc: lecteur({ poolTs50: AUTRE }), a: WETH, b: USDC, montantEntree: 10n ** 18n });
ok(p4.etat === 'REFUSE', '4 la fabrique rend une AUTRE pool a l espacement mesure -> REFUSE (' + p4.etat + ')');
const p5 = await F.poolAerodromeDe({ rpc: lecteur({ ts50Leve: true }), a: WETH, b: USDC, montantEntree: 10n ** 18n });
ok(p5.etat === 'NON_MESURE', '5 getPool illisible -> NON_MESURE, jamais la tierce (' + p5.etat + ')');
/* 6. paire NON epinglee, profondeur partielle : plus jamais « la plus profonde lue » */
const X = '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4'; /* 2026-10-10 (actions hors USDC) : cbBTC/USDC est desormais EPINGLE - temoin non epingle = TOSHI */
const gpX = new Map([[1, '0x' + '1'.repeat(40)], [10, '0x' + '2'.repeat(40)]].map(([ts, p]) => [calldataGetPool({ tokenA: USDC, tokenB: X, tickSpacing: ts }).data, p]));
const rpcX = async (m, [{ data }]) => { if (gpX.has(data)) return '0x' + mot(gpX.get(data)); if (String(data).startsWith(SEL_BAL)) { const p = '0x' + String(data).slice(-40); if (p === '0x' + '2'.repeat(40)) throw new Error('429'); return '0x' + mot(10n ** 15n); } if (data === SEL_T0) return '0x' + mot(USDC); return '0x' + mot(0); };
const p6 = await F.poolAerodromeDe({ rpc: rpcX, a: USDC, b: X, montantEntree: 10n ** 6n });
ok(p6.etat === 'NON_MESURE', '6 paire non epinglee, une profondeur illisible : NON_MESURE (la branche partielle ne choisit plus) (' + p6.etat + ')');
/* 7. MUTANT : sans l epingle du pivot, le cas 1 redevient le bug */
const src = fs.readFileSync(path.join(ICI, 'plan-franchissement.js'), 'utf8').replace(/\r\n/g, '\n');
const ancre = 'for (const [k2, v] of POOLS_PIVOTS_AERODROME)';
ok(src.includes(ancre), '7 le mutant trouve son ancre');
if (src.includes(ancre)) {
  const fm = path.join(ICI, '.mutant-pivot-' + process.pid + '.mjs'), fsg = path.join(ICI, '.mutant-pivot-seg-' + process.pid + '.mjs');
  fs.writeFileSync(fm, src.replace(ancre, 'for (const [k2, v] of [])'));
  fs.writeFileSync(fsg, fs.readFileSync(path.join(ICI, 'plan-aerodrome-segment.js'), 'utf8').replace(/from '\.\/plan-franchissement\.js'/g, "from './" + path.basename(fm) + "'"));
  try {
    const y = await route4bis(await import(pathToFileURL(fsg).href), {});
    ok(!(y.r.etat === 'PRET' && y.min * 10n > juste * 9n && y.min <= juste), '7 mutant sans epingle du pivot TUE : ' + y.r.etat + ', minimum ' + y.min + ' (juste/minimum = ' + (y.min > 0n ? juste / y.min : 'inf') + ')');
  } finally { fs.rmSync(fm, { force: true }); fs.rmSync(fsg, { force: true }); }
}
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);