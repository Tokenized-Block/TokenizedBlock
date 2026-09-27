/* mesure-aerodrome-accepte-t-il-un-hook.mjs — PEUT-ON METTRE NOTRE HOOK SUR AERODROME ?
 *
 * ⛔⛔ LA DEMANDE DE PHIL (2026-09-27) : « mets notre hook sur Aerodrome aussi ». Elle vient d une
 *     mesure juste : 6 blocks sur Aerodrome font 77 531 $ de volume CHACUN, contre 6 974 $ pour les
 *     130 d Uniswap — onze fois plus.
 *   ⛔ MAIS UN « HOOK » EST UN OBJET UNIQUEMENT UNISWAP v4 : un contrat que le `PoolManager` de v4
 *     appelle PENDANT le swap. Si Aerodrome n est pas un v4, la question n est pas « combien de
 *     travail » mais « ca n existe pas ». On demande donc a la pool ELLE-MEME de quelle famille
 *     elle est, au lieu de le supposer.
 *
 * ⇒ COMMENT ON TRANCHE : chaque famille d AMM expose des fonctions qui lui sont propres. Une pool
 *   qui repond a `stable()` est un Solidly ; une qui repond a `slot0()` + `tickSpacing()` est un
 *   v3 ; le `PoolManager` de v4 repond a `extsload`. Un REFUS est une reponse, pas un vide.
 *
 * ⚠️ LECTURE SEULE. Aucune signature.
 */
import { selecteur } from './keccak.js';
const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
/* la pool Aerodrome la plus profonde de tout le jeu B20 : MUc/USDC, 210 081 $ */
const POOL = '0x17e1bEB2cD65493Da73ed4BbbC7BEcAAa0F91C73';
const sel = (s) => { const x = selecteur(s); return x.startsWith('0x') ? x : '0x' + x; };
const rpc = async (m, p) => {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) });
  return r.json();
};
const call = async (to, data) => { const j = await rpc('eth_call', [{ to, data }, 'latest']); return j.error ? { ko: j.error.message } : { ok: j.result }; };

console.log('═══ AERODROME ACCEPTE-T-IL UN HOOK UNISWAP v4 ? ═══\n');
const code = await rpc('eth_getCode', [POOL, 'latest']);
console.log('  pool     : ' + POOL + '  (MUc/USDC, la plus profonde des B20)');
console.log('  bytecode : ' + ((String(code.result).length - 2) / 2) + ' octets\n');

const FAMILLES = [
  ['Solidly / Velodrome / Aerodrome', 'stable()'],
  ['Solidly (reserves)', 'getReserves()'],
  ['Uniswap v3 / Aerodrome CL', 'slot0()'],
  ['Uniswap v3 / CL', 'tickSpacing()'],
  ['Uniswap v4 — PoolManager', 'extsload(bytes32)'],
  ['Uniswap v4 — surface de hook', 'getHookPermissions()'],
];
const repond = [];
for (const [fam, sig] of FAMILLES) {
  const r = await call(POOL, sel(sig));
  const ok = !r.ko;
  if (ok) repond.push(fam);
  console.log('  ' + fam.padEnd(34) + sig.padEnd(24) + (ok ? '✅ REPOND' : '⛔ ' + String(r.ko).slice(0, 30)));
  await new Promise((x) => setTimeout(x, 170));
}

console.log('\n── VERDICT ──');
const v4 = repond.some((f) => f.startsWith('Uniswap v4'));
if (v4) {
  console.log('  ⚠️ Cette pool repond a une surface v4 : relire AVANT de conclure quoi que ce soit.');
} else {
  console.log('  ⛔⛔ AUCUNE SURFACE UNISWAP v4. Un hook v4 est un contrat que le `PoolManager` de v4');
  console.log('    appelle pendant le swap ; sans PoolManager v4, il n y a RIEN qui puisse appeler');
  console.log('    notre hook. Ce n est pas une question de travail : le point d accroche n existe');
  console.log('    pas sur cette pool.');
  console.log('  ⇒ Familles reconnues ici : ' + (repond.length ? repond.join(', ') : 'aucune'));
}
console.log('\n⛔ CE QUE CETTE SONDE NE DIT PAS : qu on ne puisse pas prendre de frais sur Aerodrome.');
console.log('   Elle dit que le mecanisme « hook » n y a pas de prise. Prendre un frais DANS notre');
console.log('   propre transaction d interface est une autre question, et elle reste ouverte.');
