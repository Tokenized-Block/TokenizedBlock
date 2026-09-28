/* ce-que-le-seuil-achete.mjs — LE SEUIL DE 10 000 $ PROTEGE-T-IL DE QUELQUE CHOSE DE MESURABLE ?
 *
 * LA DECISION EN JEU : `/api/prix-usd` exige `liq >= 10000`. BEc passe avec 10 072 $ ; AVGOc
 * (9 252 $), HIMSc (9 265 $) et MUc (9 728 $) sont refusees, donc n ont ni prix ni puce, donc
 * aucun chemin d achat, donc ne rapportent rien. L ecart est de 272 a 748 $ sur un chiffre ROND
 * que nous avons choisi.
 *
 * ⛔⛔ CE QUE LE SEUIL PORTE VRAIMENT : il porte sur la TVL rendue par dexscreener, pas sur le
 *     glissement d un achat. Or en liquidite concentree, la TVL ne dit PAS le glissement : toute
 *     la liquidite peut etre loin du prix courant. Comparer deux pools par leur TVL peut donc
 *     classer a l envers. C est mesurable : on lit `liquidity()` AU TICK COURANT et on calcule.
 * ⛔ TROIS ETATS : OK / REVERT / NON_MESURE. Une pool illisible n est pas une pool mauvaise.
 * ⛔ LECTURE SEULE.
 */
import { selecteur as selPrefixe } from './keccak.js';
const sel = (s) => selPrefixe(s).replace(/^0x/, '');
const RPC = 'https://mainnet.base.org';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

const POOLS = [
  ['BEc   (10 072 $, ADMISE)', '0x1914226edda7e7970949c7e1c8f491f13cae2468'],
  ['MUc   ( 9 728 $, refusee)', '0x8fac72f692b6fa8ebc54806563883fb3265130aa'],
  ['HIMSc ( 9 265 $, refusee)', '0xcecb091bda2e31db239fe7fdb9edffd2c9d9fb05'],
  ['AVGOc ( 9 252 $, refusee)', '0x1f4a5e3112ae53ca2864c89d5c0aef85282b4c62'],
  ['NVDAc (2 349 408 $, ADMISE)', '0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9'],
];
const MONTANTS = [100_000_000n, 1_000_000_000n];   /* 100 et 1 000 USDC, 6 decimales */

let id = 0;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function appel(m, p) {
  for (let e = 0; e < 6; e += 1) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
    const j = await r.json().catch(() => null);
    if (j && j.result !== undefined) return { etat: 'OK', res: j.result };
    if (j && j.error && /rate limit|too many/i.test(String(j.error.message || ''))) { await dormir(700 * (e + 1)); continue; }
    if (j && j.error) return { etat: 'REVERT', pourquoi: String(j.error.message).slice(0, 70) };
  }
  return { etat: 'NON_MESURE' };
}
const Q96 = 2n ** 96n;

console.log('pool                          L au tick courant        impact 100 USDC   impact 1 000 USDC');
for (const [nom, pool] of POOLS) {
  const s0 = await appel('eth_call', [{ to: pool, data: '0x' + sel('slot0()') }, 'latest']);
  const lq = await appel('eth_call', [{ to: pool, data: '0x' + sel('liquidity()') }, 'latest']);
  const t0 = await appel('eth_call', [{ to: pool, data: '0x' + sel('token0()') }, 'latest']);
  if (s0.etat !== 'OK' || lq.etat !== 'OK' || t0.etat !== 'OK') {
    console.log(nom.padEnd(30) + 'NON MESUREE (' + [s0.etat, lq.etat, t0.etat].join('/') + ')');
    continue;
  }
  const sqrtP = BigInt('0x' + String(s0.res).slice(2, 66));
  const L = BigInt(lq.res);
  const usdcEst0 = ('0x' + String(t0.res).slice(26)).toLowerCase() === USDC;
  const impacts = MONTANTS.map((dIn) => {
    if (L === 0n) return 'L=0';
    /* ⛔ DEUX FORMULES, ET LE SENS DECIDE LAQUELLE. Se tromper de sens rendrait un impact
     *   plausible et faux -- exactement le genre de chiffre qu on publierait sans le voir. */
    let sqrtNew;
    if (usdcEst0) sqrtNew = (L * sqrtP) / (L + (dIn * sqrtP) / Q96);          /* token0 entre */
    else sqrtNew = sqrtP + (dIn * Q96) / L;                                    /* token1 entre */
    /* impact de prix = |1 - (sqrtNew/sqrtP)^2|, en bps */
    const r2 = (sqrtNew * sqrtNew * 1000000n) / (sqrtP * sqrtP);
    const bps = r2 > 1000000n ? (r2 - 1000000n) / 100n : (1000000n - r2) / 100n;
    return bps + ' bps';
  });
  console.log(nom.padEnd(30) + String(L).padEnd(24) + String(impacts[0]).padStart(12) + String(impacts[1]).padStart(20)
    + '   ' + (usdcEst0 ? 'USDC=token0' : 'USDC=token1'));
}
console.log('\n⛔ CE QUE CE CALCUL SUPPOSE, ET QUI PEUT LE RENDRE OPTIMISTE : il reste DANS LE TICK');
console.log('courant. Un achat qui traverse une borne de liquidite coute plus. Le chiffre est donc');
console.log('un PLANCHER de glissement, jamais un plafond.');
