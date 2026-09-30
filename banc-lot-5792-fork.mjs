/* banc-lot-5792-fork.mjs — NOTRE 0,1 % PEUT-IL TOMBER SANS `sweepTokenWithFee` ?
 *
 * ⛔⛔⛔ POURQUOI CETTE QUESTION VAUT DE L ARGENT. Mesure du 2026-09-30 : les 56 vrais B20 cotes
 *      dans une de nos actions tokenisees (304 915 $ de volume 24 h) sont TOUS sur Uniswap v4,
 *      AUCUN sur Aerodrome. Or `sweepTokenWithFee` — le seul montage a frais qu on ait prouve —
 *      n existe QUE sur le routeur Aerodrome. Sur ces 56, notre rail actuel ne peut rien prendre.
 *    ⇒ La sortie est un LOT EIP-5792 : plusieurs appels signes ensemble, dont le notre. Mesure
 *      propre (je n ai jamais connecte de wallet) : 22 `capacite_lot_oui` contre 15 `non`, soit
 *      59,5 % des wallets reels.
 *
 * ⛔⛔ CE QUE CE BANC PROUVE, ET CE QU IL NE PROUVE PAS.
 *     IL PROUVE : qu un swap SANS montage de frais, suivi d un TRANSFERT SEPARE, met exactement
 *       10 bps sur a6cf et laisse le reste a l acheteur. Ce montage ne depend d AUCUN routeur —
 *       il marcherait derriere Uniswap, Aerodrome, ou n importe quoi d autre.
 *     IL NE PROUVE PAS l ATOMICITE. `wallet_sendCalls` est une RPC de WALLET, pas de chaine : un
 *       fork ne peut pas la jouer. Les deux appels sont donc envoyes SEQUENTIELLEMENT ici, et
 *       l atomicite reste la promesse du wallet. Dire l inverse serait inventer.
 *
 * ⛔⛔⛔ ET LA CONTRAINTE QUI CHANGE LE PRODUIT : dans un lot, TOUS les appels sont construits
 *      AVANT la signature. On ne connait donc PAS la sortie reelle du swap au moment de fixer
 *      notre part. On la prend sur le MINIMUM GARANTI — connu d avance, et toujours inferieur ou
 *      egal a la sortie reelle. On encaisse donc un peu MOINS. Jamais plus. C est le seul choix
 *      honnete : prendre 0,1 % d un chiffre qu on ne connait pas encore reviendrait a prendre
 *      plus que promis quand le marche bouge du bon cote.
 *
 * ⛔ RIEN N EST SIGNE SUR MAINNET : fork local `base-anvil`, compte usurpe.
 *
 * Usage : RPC_FORK=http://127.0.0.1:8547 node banc-lot-5792-fork.mjs
 */
import { planEthVersAction, WETH_BASE } from './plan-eth-block.js';
import { FEE_WALLET } from './frais-creation.js';
import { ESPACEMENTS_RETOMBEE } from './espacements-cl.js';
import { FACTORY_AERODROME_CL } from './calldata-aerodrome.js';
import { selecteur as selPrefixe } from './keccak.js';

const sel = (s) => selPrefixe(s).replace(/^0x/, '');
/* ⛔ ECRIT ICI, PAS IMPORTE : un banc qui prend son attendu dans la chose qu il mesure ne mesure rien. */
const BPS_DECIDES = 10n;
const FORK = process.env.RPC_FORK || 'http://127.0.0.1:8545';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const MUc = '0xb200000000000000000000fd2f87532b90095211';
const ACHETEUR = '0x00000000000000000000000000000000000fa3ce';
const ENTREE = 10n ** 17n;

let id = 0;
async function rpc(m, p) {
  const r = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
  const j = await r.json();
  if (j.error) throw new Error(m + ' : ' + JSON.stringify(j.error));
  return j.result;
}
const mot32 = (a) => '0'.repeat(24) + String(a).replace(/^0x/, '').toLowerCase();
const nb32 = (v) => BigInt(v).toString(16).padStart(64, '0');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const lire = async (to, data) => { const v = await rpc('eth_call', [{ to, data }, 'latest']); return (!v || v === '0x') ? null : v; };
const solde = async (j, q) => { const v = await lire(j, '0x' + sel('balanceOf(address)') + mot32(q)); return v === null ? 0n : BigInt(v); };

let tete = null;
for (let i = 0; i < 40 && tete === null; i += 1) { try { tete = BigInt(await rpc('eth_blockNumber', [])); } catch (_) { await pause(500); } }
if (tete === null) { console.log('⛔ le fork ne repond pas sur ' + FORK + ' — NON MESURE'); process.exit(1); }
console.log('fork ' + FORK + ' au bloc ' + tete);
const codeMUc = await rpc('eth_getCode', [MUc, 'latest']);
if (codeMUc !== '0xef') { console.log('⛔ ce fork ne sait pas lire un B20 (il faut `base-anvil`) — NON MESURE'); process.exit(1); }
console.log('temoin B20 : eth_getCode(MUc) == 0xef');

async function pool(a, b, nom) {
  for (const ts of ESPACEMENTS_RETOMBEE) {
    let p = null;
    try { const r = await lire(FACTORY_AERODROME_CL, '0x28af8d0b' + mot32(a) + mot32(b) + nb32(ts)); p = r ? '0x' + r.slice(-40) : null; } catch (_) { p = null; }
    if (!p || /^0x0+$/.test(p)) continue;
    const t = await lire(p, '0xd0c93a7c');
    if (t === null || Number(BigInt(t)) !== ts) continue;
    const l = await lire(p, '0x1a686502');
    if (l === null || BigInt(l) === 0n) continue;          /* ⛔ exister n est pas etre echangeable */
    const s0 = await lire(p, '0x3850c7bd'); const fee = await lire(p, '0xddca3f43'); const t0 = await lire(p, '0x0dfe1681');
    if (s0 === null || fee === null || t0 === null) continue;
    console.log('  ' + nom.padEnd(14) + 'ts=' + String(ts).padEnd(5) + p);
    return { pool: p, tickSpacing: ts, fee: Number(BigInt(fee)),
      sqrtPriceX96: BigInt('0x' + s0.slice(2, 66)).toString(), token0: '0x' + t0.slice(-40) };
  }
  console.log('  ' + nom.padEnd(14) + '⛔ AUCUNE POOL VIVANTE');
  return null;
}
console.log('les pools, par aller-retour sur la factory :');
const pPivot = await pool(WETH_BASE, USDC, 'WETH/USDC');
const pAction = await pool(USDC, MUc, 'USDC/MUc');
if (!pPivot || !pAction) { console.log('⛔ une pool manque — NON MESURE'); process.exit(2); }

await rpc('anvil_impersonateAccount', [ACHETEUR]);
await rpc('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 19n).toString(16)]);

async function envoyer(to, data, quoi, value) {
  const tx = { from: ACHETEUR, to, data, gas: '0x' + (8_000_000).toString(16) };
  if (value !== undefined) tx.value = '0x' + BigInt(value).toString(16);
  let h;
  try { h = await rpc('eth_sendTransaction', [tx]); }
  catch (e) { console.log('  ' + quoi + ' : REFUSEE avant minage — ' + String(e.message).slice(0, 100)); return { status: '0x0' }; }
  let recu = null;
  for (let i = 0; i < 60 && recu === null; i += 1) { recu = await rpc('eth_getTransactionReceipt', [h]); if (recu === null) await pause(250); }
  if (recu === null) { console.log('  ' + quoi + ' : AUCUN RECU — NON MESURE'); return { status: null }; }
  console.log('  ' + quoi + ' : status ' + recu.status + '  gas ' + Number(BigInt(recu.gasUsed || '0x0')));
  return recu;
}

/* ⛔ deadline sur l HEURE REELLE : anvil estampille a l heure reelle, et un fork inactif ferait
 *   naitre une transaction DEJA PERIMEE — ce banc-la a deja rendu un faux rouge aujourd hui. */
const tsBloc = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const tsReel = BigInt(Math.floor(Date.now() / 1000));
const maintenant = tsBloc > tsReel ? tsBloc : tsReel;

/* ── LE PLAN, SANS AUCUN MONTAGE DE FRAIS ─────────────────────────────────────────────────── */
const plan = planEthVersAction({
  action: MUc, montantWei: ENTREE, recipient: ACHETEUR,
  deadline: maintenant + 600n, maintenant, toleranceBps: 300,
  poolsPivot: [{ ...pPivot, wethEst0: pPivot.token0.toLowerCase() === WETH_BASE.toLowerCase() }],
  poolAction: { ...pAction, actionEst0: pAction.token0.toLowerCase() === MUc },
  /* ⛔ PAS DE `beneficiaireFrais` : on veut le swap NU, comme sur un routeur qui n a pas
   *   `sweepTokenWithFee`. C est tout l objet du banc. */
});
if (plan.etat !== 'PRET') { console.log('⛔ plan refuse : ' + plan.pourquoi); process.exit(2); }
const minGaranti = BigInt(plan.minSortie);
/* ⛔⛔ NOTRE PART SE CALCULE SUR LE MINIMUM GARANTI, PAS SUR LA SORTIE REELLE — parce que dans un
 *     lot, tous les appels sont construits AVANT la signature et la sortie n est pas encore connue. */
const notrePart = minGaranti * BPS_DECIDES / 10000n;
console.log('\nLE LOT, construit AVANT toute signature :');
console.log('  appel 1 : swap nu, minimum garanti ' + minGaranti);
console.log('  appel 2 : transfert de ' + notrePart + ' (10 bps du MINIMUM) vers a6cf');
if (notrePart <= 0n) { console.log('⛔ notre part tombe a zero : aucun lot a construire'); process.exit(2); }

const a6cfAvant = await solde(MUc, FEE_WALLET);
const achAvant = await solde(MUc, ACHETEUR);
const r1 = await envoyer(plan.appels[0].to, plan.appels[0].data, 'appel 1 — swap nu', ENTREE);
const apresSwap = await solde(MUc, ACHETEUR);
const sortieReelle = apresSwap - achAvant;
console.log('  sortie REELLE du swap : ' + sortieReelle);
/* ⛔ LE SECOND APPEL EST UN `transfer` ORDINAIRE : aucune fonction de routeur, donc il marche
 *   derriere N IMPORTE QUEL routeur. C est exactement ce qu on veut prouver. */
const r2 = await envoyer(MUc, '0x' + sel('transfer(address,uint256)') + mot32(FEE_WALLET) + nb32(notrePart),
  'appel 2 — notre 0,1 %');
const a6cfApres = await solde(MUc, FEE_WALLET);
const achApres = await solde(MUc, ACHETEUR);
const recuA6cf = a6cfApres - a6cfAvant;
const gardeAcheteur = achApres - achAvant;

console.log('\n' + '═'.repeat(92));
const c = [
  [r1.status === '0x1', 'CONDITION 1 : le swap nu aboutit (status 0x1)'],
  [r2.status === '0x1', 'CONDITION 2 : le transfert de notre part aboutit'],
  [recuA6cf === notrePart, 'CONDITION 3 : a6cf recoit EXACTEMENT notre part (' + notrePart + ')'],
  [sortieReelle > 0n && recuA6cf * 10000n / sortieReelle <= BPS_DECIDES,
    'CONDITION 4 : on ne prend JAMAIS PLUS que ' + BPS_DECIDES + ' bps de la sortie reelle'],
  [gardeAcheteur === sortieReelle - notrePart, 'CONDITION 5 : l acheteur garde tout le reste'],
];
for (const [ok, t] of c) console.log((ok ? '✓ ' : '✗ ') + t);
const tout = c.every(([ok]) => ok);
if (sortieReelle > 0n) {
  const bpsReels = Number(recuA6cf * 100000n / sortieReelle) / 10;
  console.log('   -> part reellement prise : ' + bpsReels + ' bps sur ' + BPS_DECIDES + ' vises '
    + '(le manque vient du minimum garanti, et il est VOULU)');
}
console.log('═'.repeat(92));
console.log(tout
  ? '⭐ LE 0,1 % TOMBE SANS `sweepTokenWithFee` — donc derriere N IMPORTE QUEL routeur.'
  : '⛔ LE MONTAGE N EST PAS PROUVE. Ne rien cabler sur cette base.');
console.log('⚠️ CE BANC NE PROUVE PAS L ATOMICITE : `wallet_sendCalls` est une RPC de WALLET, pas de');
console.log('   chaine. Les deux appels sont envoyes SEQUENTIELLEMENT ici. L atomicite reste la');
console.log('   promesse du wallet — et 40,5 % des wallets mesures ne la tiennent pas.');
console.log('⚠️ ET IL NE PROUVE RIEN SUR UNISWAP v4 : le swap teste est Aerodrome. Ce qui est prouve,');
console.log('   c est que NOTRE PART ne depend pas du routeur. Le swap v4, lui, reste a construire.');
process.exit(tout ? 0 : 1);
