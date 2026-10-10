/* test-pools-actions-aerodrome-20261003.mjs — LA TABLE DES POOLS AERODROME DES ACTIONS EST VRAIE, ET LE MARKET S EN SERT.
 * A. avecPoolAction (hors reseau). B. TEMOIN ON-CHAIN : getPool(USDC, action, tickSpacing) sur la factory Aerodrome rend
 *    EXACTEMENT l adresse de la table, pour les 12 (une lecture ratee = KO nomme, jamais un vert). C. cablage app.html.
 * D. les vraies lignes de /api/trending : quelles actions gagnent un Buy grace a la table. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const T = await imp('pools-actions-aerodrome.js');
const { calldataGetPool } = await imp('calldata-aerodrome.js');
const { verdictRoutage } = await imp('routage.js');
const { ACTIONS_COINBASE } = await imp('paires.js');
const { USDC_BASE } = await imp('frais-creation.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const bas = (a) => String(a || '').toLowerCase();

/* A */
const MSTR = ACTIONS_COINBASE.find((a) => a.symbole === 'MSTRc').adr;
const l = { adr: MSTR, sym: 'MSTRc', dex: 'uniswap', poolAdr: null, prixUsd: 1, liquiditeUsd: 3000 };
const r = T.avecPoolAction(l);
ok(r.dex === 'aerodrome' && r.poolAdr === T.POOLS_ACTIONS_AERODROME.get(bas(MSTR)).pool && r.prixUsd === 1 && r.liquiditeUsd === 3000 && r.dexAffiche === 'uniswap',
  'MSTRc (ligne DexScreener = pool v4 d un meme) -> sa pool Aerodrome mesuree ; prix/liquidite affiches inchanges');
ok(T.avecPoolAction({ adr: '0x' + '1'.repeat(40), dex: 'uniswap' }).dex === 'uniswap', 'un jeton hors table : ligne inchangee');
const nv = T.POOLS_ACTIONS_AERODROME.get('0xb20000000000000000000078ee7ce2fe4908108c');
const lnv = { adr: '0xb20000000000000000000078ee7ce2fe4908108c', dex: 'aerodrome', poolAdr: nv.pool };
ok(T.avecPoolAction(lnv) === lnv, 'deja sur la bonne pool : meme objet, rien de recopie');
/* 2026-10-09 : 12 -> 24 — le lot @base du jour (pools tickSpacing 1 a ~25 000 USDC ; onze mesurees vides a 20:45 UTC,
 *   approvisionnees a 21:08 UTC). SEc et SONYc DEHORS : achat PRET qui reverte sur fork (« Too little received »). */
/* 2026-10-10 : 24 -> 25 — SONYc entre (pool remesuree : achat, revente et paiement d un block executes sur fork, bloc 52 432 772) ; SEc reste dehors. */
ok(T.POOLS_ACTIONS_AERODROME.size === 25 && [...T.POOLS_ACTIONS_AERODROME.values()].every((x) => x.usdcMesure >= 500 && /^0x[0-9a-f]{40}$/.test(x.pool)),
  '25 lignes, toutes >= 500 $ d USDC mesures, adresses bien formees');
const TS1 = [...T.POOLS_ACTIONS_AERODROME.values()].filter((x) => x.tickSpacing === 1).map((x) => x.symbole).sort().join(' ');
ok(TS1 === 'ARMc BIDUc BILIc HSAIc INFYc NIOc NVOc PDDc SAPc SKHYc SONYc VALEc WRDc', 'les douze du 2026-10-09 et SONYc (2026-10-10) portent tickSpacing 1 (jamais 10 suppose) : ' + TS1);
ok(![...T.POOLS_ACTIONS_AERODROME.values()].some((x) => x.symbole === 'SEc')
  && !ACTIONS_COINBASE.some((a) => a.symbole === 'SEc'), 'SEc absente (table ET registre) : son achat reverte sur fork (le 09 et encore le 10, bloc 52 432 772)');
ok([...T.POOLS_ACTIONS_AERODROME.values()].some((x) => x.symbole === 'SONYc') && ACTIONS_COINBASE.some((a) => a.symbole === 'SONYc'),
  'SONYc presente (table ET registre) : achat, revente et paiement d un block executes sur fork le 2026-10-10');
ok([...T.POOLS_ACTIONS_AERODROME.keys()].every((a) => ACTIONS_COINBASE.some((x) => bas(x.adr) === a)), 'chaque cle est une action du registre');

/* B */
const lire = async (to, data) => {
  for (let e = 0; e < 6; e += 1) {
    try { const j = await fetch('https://mainnet.base.org', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }) }).then((x) => x.json());
      if (j.result) return j.result; } catch (_) {}
    await new Promise((o) => setTimeout(o, 800 * (e + 1)));
  }
  return null;
};
let confirmees = 0; const ecarts = [];
for (const [adr, x] of T.POOLS_ACTIONS_AERODROME) {
  const c = calldataGetPool({ tokenA: USDC_BASE, tokenB: adr, tickSpacing: x.tickSpacing });
  const res = c.etat === 'PRET' ? await lire(c.to, c.data) : null;
  if (res && bas('0x' + res.slice(-40)) === x.pool) confirmees += 1; else ecarts.push(x.symbole + ':' + (res ? '0x' + res.slice(-40) : 'NON_LU'));
}
ok(confirmees === T.POOLS_ACTIONS_AERODROME.size, 'factory Aerodrome : getPool rend l adresse de la table pour ' + confirmees + '/' + T.POOLS_ACTIONS_AERODROME.size + (ecarts.length ? ' — ecarts ' + ecarts.join(' ') : ''));

/* C */
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
ok(/marcheParAdr\.set\(String\(l\.adr\)\.toLowerCase\(\), avecPoolAction\(l\)\);/.test(html), 'fiche / carte : marcheParAdr recoit la pool de l action');
ok(/const lA = avecPoolAction\(l\);[^\n]*\n\s+const vR = verdictRoutage\(\{ aMarche: true, dex: lA\.dex, poolAdr: lA\.poolAdr \}\);/.test(html), 'Market : le verdict du Buy lit la pool de l action');

/* D */
try {
  const tr = await fetch('https://tokenizedblock.space/api/trending', { headers: { 'x-ms-monitor': '1' } }).then((x) => x.json());
  const rows = Array.isArray(tr) ? tr : Object.values(tr).find(Array.isArray);
  const achetable = (row) => { const v = verdictRoutage({ aMarche: true, dex: row.dex, poolAdr: row.poolAdr }); return (row.liquiditeUsd || 0) >= 500 && (v.achetableEnEth || v.achetableEnUsdc); };
  const avant = rows.filter(achetable).map((x) => x.sym), apres = rows.map(T.avecPoolAction).filter(achetable).map((x) => x.sym);
  const gagnees = apres.filter((s) => !avant.includes(s));
  console.log('    Buy (actions hors v4) avant ' + avant.length + ' · apres ' + apres.length + ' · gagnees : ' + (gagnees.join(' ') || 'aucune'));
  ok(apres.length >= avant.length && avant.every((s) => apres.includes(s)), 'la table n enleve aucun Buy existant');
} catch (e) { ok(false, 'trending illisible — NON MESURE'); }
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
