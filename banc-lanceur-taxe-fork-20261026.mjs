/* banc-lanceur-taxe-fork-20261026.mjs — LES POOLS DU « LANCEUR » (ETH / B20, fee 100, tickSpacing 1, un hook par jeton) : CE QUE NOTRE
 *   ROUTEUR Y FAIT QUAND ELLES ETAIENT VIVANTES, SUR FORK A UN BLOC HISTORIQUE. Lecture de chaine + fork ; rien sur mainnet, aucune cle.
 *
 * POURQUOI : pool-lanceur-taxe.js dit sur la ligne du Market « pool vide, et son hook prend 99,99 % d une revente hors liste ». Le
 *   « vide » se lit aujourd hui (StateView). La TAXE ne peut se montrer qu ou il restait de la liquidite : ce banc forke Base au bloc
 *   ou la pool en avait, et fait, avec un wallet NEUF impersonne :
 *   I.   achat 0,001 ETH -> jeton par le routeur de l app (ROUTEUR[8453]) : octets mines == octets du plan, recu == devis du Quoter,
 *        ETH paye == 0,001 (hors gaz), recu >= minimum (1) ;
 *   II.  revente de TOUT le recu par le meme routeur (approve EXACT -> Permit2 -> routeur) : ETH rendu == devis de vente, et
 *        ETH rendu <= 0,02 % de l ETH paye (la taxe 9999 / 10000 du hook, lue) ; plus aucun jeton ; autorisations revenues a 0.
 *   L etat d AUJOURD HUI (liquidite 0, taxe 9999) est lu sur la chaine par test-pool-lanceur-taxe-20261026.mjs (V), pas ici.
 * Usage : anvil (build base) --base --fork-url https://base.gateway.tenderly.co --fork-block-number <B> --port <P>, puis
 *         node banc-lanceur-taxe-fork-20261026.mjs http://127.0.0.1:<P> <jeton> <hook>
 *   Mesure du 2026-10-26 : ADOF 53056300 (hook 0xe4af54e1…80cc), BaseDay 53081600 (0xb03e31ad…a8c4), replicas 53082000 (0xdaba3638…00cc). */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const P = await imp('pool.js'), E = await imp('echange.js'), L = await imp('lancer-pool.js'), T = await imp('pool-lanceur-taxe.js');
const [FORK, JETON, HOOK] = process.argv.slice(2);
if (!/^https?:/.test(FORK || '') || !/^0x[0-9a-fA-F]{40}$/.test(JETON || '') || !/^0x[0-9a-fA-F]{40}$/.test(HOOK || '')) { console.log('usage: <fork-url> <jeton> <hook>'); process.exit(2); }
let n = 0, ko = 0, id = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); return c; };
const brut = async (method, params) => (await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })).json();
const rpc = async (m, p) => { const x = await brut(m, p); if (x.error) throw new Error(m + ' ' + JSON.stringify(x.error).slice(0, 200)); return x.result; };
const UR = E.ROUTEUR[8453], Q = E.QUOTEUR[8453], PERMIT2 = L.PERMIT2, SV = L.V4_ADRESSES[8453].stateView, ETH = '0x0000000000000000000000000000000000000000';
const cle = { currency0: ETH, currency1: JETON.toLowerCase(), fee: 100, tickSpacing: 1, hooks: HOOK.toLowerCase() };
ok(parseInt(await rpc('eth_chainId', []), 16) === 8453, 'le fork est Base');
const blk = await rpc('eth_getBlockByNumber', ['latest', false]);
const moi = '0xc0ffee' + Date.now().toString(16).padStart(34, '0'); /* wallet neuf, jamais vu par le hook ni par sa liste */
await rpc('anvil_setBalance', [moi, '0x' + (10n ** 18n).toString(16)]);
await rpc('anvil_impersonateAccount', [moi]);
const deadline = BigInt(parseInt(blk.timestamp, 16) + 3600);
const appel = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const cause = await T.lireCauseRefusPool({ appel, stateView: SV, cle, poolId: P.poolId(cle) });
console.log('bloc ' + parseInt(blk.number, 16) + ' · poolId ' + P.poolId(cle) + ' · liquidite ' + cause.liquidite + ' · taxBps ' + cause.taxBps + '/' + cause.denom);
if (!ok(cause.liquidite > 0n, 'la pool a de la liquidite a ce bloc (sinon ce banc ne prouve rien)')) { console.log(`\n${n - ko}/${n} ok, ${ko} KO`); process.exit(1); }
ok(T.tauxTaxe(cause) === 99.99, 'taxe lue sur le hook : ' + T.tauxTaxe(cause) + ' %');
const solEth = async () => BigInt(await rpc('eth_getBalance', [moi, 'latest']));
const solJ = async () => BigInt(await appel(JETON, '0x70a08231' + P.motAdr(moi)));
const devis = async (zf, m) => BigInt((await appel(Q, P.encodeQuote({ cle, zeroForOne: zf, montant: m }))).slice(0, 66));
async function envoyer(to, data, value = 0n) {
  const h = await rpc('eth_sendTransaction', [{ from: moi, to, data, value: '0x' + value.toString(16), gas: '0x1c9c380' }]);
  let rc = null; for (let i = 0; i < 300 && !rc; i++) { rc = await rpc('eth_getTransactionReceipt', [h]); if (!rc) await new Promise((s) => setTimeout(s, 100)); }
  return { rc, tx: await rpc('eth_getTransactionByHash', [h]), gaz: BigInt(rc.gasUsed) * BigInt(rc.effectiveGasPrice) };
}
/* I. achat */
const m = 10n ** 15n;
const qA = await devis(true, m);
const dataA = P.encodeSwapExactInSingle({ cle, zeroForOne: true, montant: m, sortieMin: 1n, deadline, forme: P.AVEC_MINHOP });
const e0 = await solEth(), j0 = await solJ();
const a = await envoyer(UR, dataA, m);
const recu = (await solJ()) - j0, paye = e0 - (await solEth()) - a.gaz;
ok(a.rc.status === '0x1', 'achat mine (status 1)');
ok(a.tx.to.toLowerCase() === UR.toLowerCase() && a.tx.input === dataA && BigInt(a.tx.value) === m, 'octets mines == octets du plan (to, data, value)');
ok(recu === qA && recu >= 1n, 'recu == devis du Quoter : ' + recu);
ok(paye === m, 'ETH paye == 0,001 hors gaz : ' + paye);
/* II. revente */
const qV = await devis(false, recu);
const a1 = await envoyer(JETON, P.encodeApprove(PERMIT2, recu));
const a2 = await envoyer(PERMIT2, P.encodePermit2Approve(JETON, UR, recu, deadline));
const e1 = await solEth();
const dataV = P.encodeSwapExactInSingle({ cle, zeroForOne: false, montant: recu, sortieMin: 1n, deadline, forme: P.AVEC_MINHOP });
const v = await envoyer(UR, dataV, 0n);
const rendu = (await solEth()) - e1 + v.gaz;
ok(a1.rc.status === '0x1' && a2.rc.status === '0x1' && v.rc.status === '0x1', 'approve exact, Permit2, revente : mines');
ok(v.tx.input === dataV, 'octets de la revente == octets du plan');
ok(rendu === qV, 'ETH rendu == devis de vente : ' + rendu + ' wei');
ok(rendu * 10000n <= m * 2n, 'ETH rendu <= 0,02 % de l ETH paye : ' + (Number(rendu) * 100 / Number(m)).toFixed(4) + ' %');
ok((await solJ()) === 0n, 'plus aucun jeton');
const alw = BigInt(await appel(JETON, '0xdd62ed3e' + P.motAdr(moi) + P.motAdr(PERMIT2)));
const p2 = BigInt((await appel(PERMIT2, '0x927da105' + P.motAdr(moi) + P.motAdr(JETON) + P.motAdr(UR))).slice(0, 66));
ok(alw === 0n && p2 === 0n, 'autorisations revenues a 0 (jeton -> Permit2 : ' + alw + ', Permit2 -> routeur : ' + p2 + ')');
console.log(`\n${n - ko}/${n} ok, ${ko} KO`);
process.exit(ko ? 1 : 0);
