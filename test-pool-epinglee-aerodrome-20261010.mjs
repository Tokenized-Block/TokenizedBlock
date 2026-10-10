/* test-pool-epinglee-aerodrome-20261010.mjs - revue adverse de Claude, point 2 (3f8a9c9) : une action de la table MESUREE se traite
 *   sur SA pool mesuree (pools-actions-aerodrome.js), jamais sur « la plus profonde lue ». Lecteur RPC FICTIF, hors reseau.
 *   Cas adverse : 1 000 USDC -> AMZNc ; la profondeur de la vraie pool (ts 10) ne se lit pas ; une pool TIERCE (ts 1) detient
 *   100x l entree a un prix 10^6 pire. Avant : PRET sur la tierce, minimum ~1/1 000 000 du juste. Apres : vraie pool, juste minimum. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selecteur } from './keccak.js';
import { calldataGetPool } from './calldata-aerodrome.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { USDC_BASE } from './frais-creation.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); };
const bas = (x) => String(x).toLowerCase();
const USDC = bas(USDC_BASE);
const [AMZ, INFO] = [...POOLS_ACTIONS_AERODROME].find(([, v]) => v.symbole === 'AMZNc');
const VRAIE = bas(INFO.pool), TIERCE = '0x22cf000000000000000000000000000000000001', AUTRE = '0x9999000000000000000000000000000000000009';
const MONTANT = 1000n * 10n ** 6n;
const Q96 = 2n ** 96n, S_VRAI = 65950n * Q96, S_TIERS = S_VRAI / 1000n; /* prix 10^6 pire */
const SEL_BAL = selecteur('balanceOf(address)'), SEL_T0 = selecteur('token0()'), SEL_S0 = selecteur('slot0()');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
function lecteur({ vraieProf = 'jamais', getPoolVraie = VRAIE, getPoolLeve = false } = {}) {
  const gp = new Map();
  for (const ts of [1, 10, 50, 100, 200, 2000]) {
    /* la fabrique rend la meme pool dans les deux ordres de jetons */
    for (const [ta, tb] of [[USDC, AMZ], [AMZ, USDC]]) {
      const c = calldataGetPool({ tokenA: ta, tokenB: tb, tickSpacing: ts }); if (c.etat !== 'PRET') continue;
      gp.set(c.data, ts === 10 ? getPoolVraie : (ts === 1 ? TIERCE : '0x' + '0'.repeat(40)));
    }
  }
  const vus = [];
  const rpc = async (m, params) => {
    /* 2026-10-10 (e0b346d) : le segment simule son plan - la simulation passe ici, seul le CHOIX DE POOL est juge */
    if (m === 'eth_simulateV1') return [{ calls: params[0].blockStateCalls[0].calls.map(() => ({ status: '0x1' })) }];
    if (m !== 'eth_call') return '0x1';
    const { to, data } = params[0];
    if (gp.has(data)) { if (getPoolLeve && gp.get(data) === getPoolVraie) throw new Error('429'); return '0x' + mot(gp.get(data)); }
    if (String(data).startsWith(SEL_BAL)) {
      const pool = '0x' + String(data).slice(-40);
      if (pool === VRAIE) { if (vraieProf === 'jamais') throw new Error('429'); return '0x' + mot(vraieProf); }
      if (pool === TIERCE) return '0x' + mot(MONTANT * 100n);
      return '0x' + mot(0);
    }
    if (data === SEL_T0) return '0x' + mot(USDC);
    if (data === SEL_S0) { vus.push(bas(to)); return '0x' + mot(bas(to) === TIERCE ? S_TIERS : S_VRAI) + mot(0).repeat(5); }
    return '0x' + mot(0);
  };
  rpc.vus = vus;
  return rpc;
}
const plan = async (mod, opts) => {
  const rpc = lecteur(opts);
  const r = await mod.planAerodromeSegment({ rpc, chemin: [{ de: USDC, vers: AMZ, famille: 'aerodrome' }], devise: USDC, block: AMZ, montant: MONTANT,
    compte: '0x00000000000000000000000000000000c0ffee77', beneficiaireFrais: '0x00000000000000000000000000000000000fee01', maintenant: 1900000000000 });
  return { r, vus: rpc.vus };
};
const juste = MONTANT * S_VRAI * S_VRAI / (Q96 * Q96);
const S = await import('./plan-aerodrome-segment.js');
const F = await import('./plan-franchissement.js');
/* 1. CAS ADVERSE */
let x = await plan(S, {});
const minA = x.r.resume ? BigInt(x.r.resume.recoitAuMoins) : 0n;
ok(x.r.etat === 'PRET' && x.vus.every((p) => p === VRAIE) && minA * 10n > juste * 9n,
  '1 adverse : pool tierce 100x a prix 10^6 pire, vraie profondeur illisible -> la VRAIE pool, minimum ' + minA + ' / juste ' + juste + ' (' + x.r.etat + ')');
/* 2. meme toutes lectures OK, une tierce plus profonde (2 M) ne bat plus la vraie (1,19 M) */
const p2 = await F.poolAerodromeDe({ rpc: lecteur({ vraieProf: 1190000n * 10n ** 6n }), a: USDC, b: AMZ, montantEntree: MONTANT });
ok(p2.etat === 'PRET' && p2.pool === VRAIE && p2.tickSpacing === INFO.tickSpacing && p2.poolMesuree === true, '2 cause racine : la tierce (100 000 USDC) ne gagne pas, pool mesuree ' + p2.pool);
/* 3. temoins negatifs : la fabrique ne confirme pas -> jamais un repli sur une autre pool */
const p3 = await F.poolAerodromeDe({ rpc: lecteur({ getPoolVraie: AUTRE }), a: USDC, b: AMZ, montantEntree: MONTANT });
ok(p3.etat === 'REFUSE', '3 la fabrique rend une AUTRE pool a l espacement mesure -> REFUSE (' + p3.etat + ')');
const p4 = await F.poolAerodromeDe({ rpc: lecteur({ getPoolLeve: true }), a: USDC, b: AMZ, montantEntree: MONTANT });
ok(p4.etat === 'NON_MESURE', '4 getPool illisible -> NON_MESURE, jamais la tierce (' + p4.etat + ')');
/* 5. sens inverse (vente AMZNc -> USDC) : meme pool */
const p5 = await F.poolAerodromeDe({ rpc: lecteur({}), a: AMZ, b: USDC, montantEntree: 10n ** 18n });
ok(p5.etat === 'PRET' && p5.pool === VRAIE && p5.entreeEst0 === false, '5 vente AMZNc -> USDC : pool mesuree, sens lu (entreeEst0 false)');
/* 6. MUTANT : sans l epingle, le cas adverse redevient le bug (PRET sur la tierce, minimum ecrase) */
const src = fs.readFileSync(path.join(ICI, 'plan-franchissement.js'), 'utf8').replace(/\r\n/g, '\n');
const ancre = 'const epingle = pairePingleeOuPivot(a, b);'; /* 4 bis : l epingle couvre aussi le pivot USDC/WETH */
ok(src.includes(ancre), '6 le mutant trouve son ancre');
const fm = path.join(ICI, '.mutant-epingle-' + process.pid + '.mjs');
const fs2 = path.join(ICI, '.mutant-epingle-seg-' + process.pid + '.mjs');
fs.writeFileSync(fm, src.replace(ancre, 'const epingle = null;'));
fs.writeFileSync(fs2, fs.readFileSync(path.join(ICI, 'plan-aerodrome-segment.js'), 'utf8').replace(/from '\.\/plan-franchissement\.js'/g, "from './" + path.basename(fm) + "'"));
try {
  const M = await import(pathToFileURL(fs2).href);
  const y = await plan(M, {});
  const minM = y.r.resume ? BigInt(y.r.resume.recoitAuMoins) : 0n;
  ok(!(y.r.etat === 'PRET' && minM * 10n > juste * 9n), '6 mutant sans epingle TUE : ' + y.r.etat + ', minimum ' + minM + ' (juste/minimum = ' + (minM > 0n ? juste / minM : 'inf') + ')');
} finally { fs.rmSync(fm, { force: true }); fs.rmSync(fs2, { force: true }); }
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);