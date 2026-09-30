/* banc-plan-trois-sauts-fork.mjs — LE PLAN QUE L APP APPELLERA, EXECUTE SUR UN FORK.
 *
 * ⛔⛔⛔ CE BANC N EST PAS UN DOUBLON DE `banc-trois-sauts-fork.mjs`, ET LA DIFFERENCE EST TOUT.
 *      Celui-la prouvait que MON calldata, assemble a la main dans le banc, aboutit. Celui-ci
 *      prouve que le calldata rendu par `planEthVersAction` — LE MODULE QUE L ECRAN APPELLE —
 *      aboutit. Entre les deux il y a le choix du pivot, le minimum garanti, l ordre des sauts, le
 *      montage a frais : tout ce qui peut diverger entre « ca marche » et « notre code marche ».
 *
 * ⛔⛔ ET IL PASSE LA VALEUR EN ETH, SANS WRAP NI APPROVE — c est le chemin reel du visiteur. Le
 *     routeur enveloppe WETH9 lui-meme quand `msg.value` couvre le montant. Prouve a DEUX sauts le
 *     2026-09-29 ; ce banc le prouve a TROIS.
 *
 * ⛔⛔⛔ LES CONDITIONS, SEPAREES :
 *      0. CONTROLE NEGATIF — la meme route SANS beneficiaire de frais laisse a6cf INCHANGE
 *      1. le recu porte `status` = 0x1
 *      2. l acheteur recoit AU MOINS le minimum que le plan a garanti
 *      3. a6cf recoit EXACTEMENT 10 bps de la sortie totale
 *      4. TEMOIN NEGATIF — la MEME transaction SANS `value` doit ECHOUER (sinon ce n est pas
 *         l ETH envoye qui paie, et la preuve ne porte pas sur ce qu on croit)
 *
 * ⛔ RIEN N EST SIGNE SUR MAINNET : fork local `base-anvil`, compte USURPE. Aucune cle touchee.
 * ⚠️ BORNE : un fork prouve la MECANIQUE a un etat forke. Pas qu un visiteur passe, pas un revenu.
 *
 * Usage : RPC_FORK=http://127.0.0.1:8547 node banc-plan-trois-sauts-fork.mjs
 */
import { planEthVersAction, WETH_BASE } from './plan-eth-block.js';
import { FEE_WALLET } from './frais-creation.js';
import { ESPACEMENTS_RETOMBEE } from './espacements-cl.js';
import { FACTORY_AERODROME_CL } from './calldata-aerodrome.js';
import { selecteur as selPrefixe } from './keccak.js';

const sel = (s) => selPrefixe(s).replace(/^0x/, '');
const BPS_DECIDES = 10n;            /* ⛔ ECRIT ICI, PAS IMPORTE : sinon le banc est d accord avec toute derive */
const FORK = process.env.RPC_FORK || 'http://127.0.0.1:8545';

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const MUc = '0xb200000000000000000000fd2f87532b90095211';
const TE = '0x3c573bdd88008c94f025e5023212f28e5f39744c';
const ACHETEUR = '0x00000000000000000000000000000000000fa2ce';
const ENTREE = 10n ** 17n;          /* 0,1 ETH */

let id = 0;
async function rpc(m, p, url = FORK) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
  const j = await r.json();
  if (j.error) throw new Error(m + ' : ' + JSON.stringify(j.error));
  return j.result;
}
const mot32 = (a) => '0'.repeat(24) + String(a).replace(/^0x/, '').toLowerCase();
const nb32 = (v) => BigInt(v).toString(16).padStart(64, '0');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
/** ⛔ `"0x"` est un ZERO, pas un echec. `BigInt('0x')` leve. */
const lire = async (to, data) => { const v = await rpc('eth_call', [{ to, data }, 'latest']); return (!v || v === '0x') ? null : v; };
const solde = async (j, q) => { const v = await lire(j, '0x' + sel('balanceOf(address)') + mot32(q)); return v === null ? 0n : BigInt(v); };

let tete = null;
for (let i = 0; i < 40 && tete === null; i += 1) { try { tete = BigInt(await rpc('eth_blockNumber', [])); } catch (_) { await pause(500); } }
if (tete === null) { console.log('⛔ le fork ne repond pas sur ' + FORK + ' — NON MESURE'); process.exit(1); }
console.log('fork ' + FORK + ' au bloc ' + tete + (process.env.RPC_FORK ? '  (RPC_FORK lu)' : '  (defaut)'));

/* ⛔ TEMOIN : ce fork sait-il lire un B20 ? `anvil` standard rend `OpcodeNotFound`. Sans ce
 *   controle, un rouge plus bas se lirait « la route ne marche pas » au lieu de « ce fork ne sait
 *   pas lire l actif ». */
const codeMUc = await rpc('eth_getCode', [MUc, 'latest']);
if (codeMUc !== '0xef') { console.log('⛔ eth_getCode(MUc) = ' + String(codeMUc).slice(0, 14) + ' au lieu de 0xef : il faut `base-anvil`. NON MESURE'); process.exit(1); }
console.log('temoin B20 : eth_getCode(MUc) == 0xef');

/* ── les pools, par ALLER-RETOUR sur la factory, avec liquidite > 0 exigee ─────────────────── */
async function pool(a, b, nom) {
  for (const ts of ESPACEMENTS_RETOMBEE) {
    let p = null;
    try { const r = await lire(FACTORY_AERODROME_CL, '0x28af8d0b' + mot32(a) + mot32(b) + nb32(ts)); p = r ? '0x' + r.slice(-40) : null; } catch (_) { p = null; }
    if (!p || /^0x0+$/.test(p)) continue;
    const tsP = await lire(p, '0xd0c93a7c');
    if (tsP === null || Number(BigInt(tsP)) !== ts) continue;      /* ⛔ aller-retour */
    const lq = await lire(p, '0x1a686502');
    if (lq === null || BigInt(lq) === 0n) continue;                /* ⛔ exister ≠ echangeable */
    const s0 = await lire(p, '0x3850c7bd');
    const fee = await lire(p, '0xddca3f43');
    const t0 = await lire(p, '0x0dfe1681');
    if (s0 === null || fee === null || t0 === null) continue;
    const r = { pool: p, tickSpacing: ts, fee: Number(BigInt(fee)),
      sqrtPriceX96: BigInt('0x' + s0.slice(2, 66)).toString(), token0: '0x' + t0.slice(-40) };
    console.log('  ' + nom.padEnd(15) + 'ts=' + String(ts).padEnd(5) + p + '  fee=' + r.fee);
    return r;
  }
  console.log('  ' + nom.padEnd(15) + '⛔ AUCUNE POOL VIVANTE');
  return null;
}
console.log('les pools, par aller-retour sur la factory :');
const pPivot = await pool(WETH_BASE, USDC, 'WETH/USDC');
const pAction = await pool(USDC, MUc, 'USDC/MUc');
const pBlock = await pool(MUc, TE, 'MUc/TE');
if (!pPivot || !pAction || !pBlock) { console.log('⛔ une pool manque : NON MESURE'); process.exit(2); }

await rpc('anvil_impersonateAccount', [ACHETEUR]);
await rpc('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 19n).toString(16)]);

async function envoyer(appel, quoi, avecValeur = true) {
  const tx = { from: ACHETEUR, to: appel.to, data: appel.data, gas: '0x' + (8_000_000).toString(16) };
  if (avecValeur) tx.value = appel.value;
  let h;
  try { h = await rpc('eth_sendTransaction', [tx]); }
  catch (e) { console.log('  ' + quoi + ' : REFUSEE avant minage — ' + String(e.message).slice(0, 110)); return { status: '0x0' }; }
  let recu = null;
  for (let i = 0; i < 60 && recu === null; i += 1) { recu = await rpc('eth_getTransactionReceipt', [h]); if (recu === null) await pause(250); }
  if (recu === null) { console.log('  ' + quoi + ' : AUCUN RECU — NON MESURE'); return { status: null }; }
  console.log('  ' + quoi + ' : status ' + recu.status + '  gas ' + Number(BigInt(recu.gasUsed || '0x0')));
  return recu;
}

/* ⛔⛔⛔ LA DEADLINE SE CALCULE SUR L HEURE QUI ESTAMPILLERA LA TRANSACTION, PAS SUR LE DERNIER BLOC
 *      MINE — ET CE BANC A RENDU ROUGE POUR CETTE SEULE RAISON. Anvil estampille un nouveau bloc a
 *      l heure REELLE ; si le fork est reste inactif, le dernier bloc mine peut avoir des dizaines
 *      de minutes de retard. La transaction naissait alors DEJA PERIMEE, et le routeur revertait
 *      dans son modificateur `checkDeadline` — AVANT tout swap, d ou un gas de 26 760 anormalement
 *      bas. J ai d abord accuse la PROFONDEUR des pools ; la mesure a dit 60 bps d impact a 0,1 ETH,
 *      soit cinq fois moins que la tolerance. Le rouge etait un fait sur MON BANC, pas sur la route.
 *    ⛔ EN PRODUCTION CE PIEGE N EXISTE PAS : l horloge du navigateur et celle de la chaine sont
 *      proches. C est un artefact de fork, et c est pour ca qu il faut le nommer ici. */
const tsBloc = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const tsReel = BigInt(Math.floor(Date.now() / 1000));
const maintenant = tsBloc > tsReel ? tsBloc : tsReel;
if (tsReel - tsBloc > 60n) {
  console.log('⚠️ le dernier bloc mine a ' + (tsReel - tsBloc) + ' s de retard sur l heure reelle — '
    + 'la deadline est calee sur l heure REELLE, sinon la tx naitrait perimee');
}
const commun = {
  action: MUc, block: TE, montantWei: ENTREE, recipient: ACHETEUR,
  deadline: maintenant + 600n, maintenant, toleranceBps: 300,
  poolsPivot: [{ ...pPivot, wethEst0: pPivot.token0.toLowerCase() === WETH_BASE.toLowerCase() }],
  poolAction: { ...pAction, actionEst0: pAction.token0.toLowerCase() === MUc.toLowerCase() },
  poolBlock: { ...pBlock, blockEst0: pBlock.token0.toLowerCase() === TE.toLowerCase() },
};

/* ── 0. CONTROLE NEGATIF : la meme route SANS beneficiaire ─────────────────────────────────── */
console.log('\nCONTROLE NEGATIF — meme plan, SANS beneficiaire de frais :');
const nu = planEthVersAction(commun);
if (nu.etat !== 'PRET') { console.log('⛔ le plan nu est refuse : ' + nu.pourquoi); process.exit(2); }
console.log('  chemin : ' + nu.chemin.cheminOctets + ' octets · ' + nu.chemin.sauts + ' sauts · minimum ' + nu.minSortie);
const a6cfAvantTemoin = await solde(TE, FEE_WALLET);
const rNu = await envoyer(nu.appels[0], 'plan nu, 3 sauts');
const temoinInchange = (await solde(TE, FEE_WALLET)) === a6cfAvantTemoin;
console.log('  a6cf en TE inchange ? ' + (temoinInchange ? '✓ OUI' : '⛔ NON — toute mesure plus bas est nulle'));

/* ── 1. LA MESURE : le plan AVEC frais ─────────────────────────────────────────────────────── */
console.log('\nLA MESURE — le plan que l ecran appellera, AVEC les 0,1 % :');
const plan = planEthVersAction({ ...commun, beneficiaireFrais: FEE_WALLET });
if (plan.etat !== 'PRET') { console.log('⛔ le plan a frais est refuse : ' + plan.pourquoi); process.exit(2); }
console.log('  chemin : ' + plan.chemin.cheminOctets + ' octets · ' + plan.chemin.sauts + ' sauts');
console.log('  minimum garanti par le plan : ' + plan.minSortie + ' unites de TE');
const a6cfAvant = await solde(TE, FEE_WALLET);
const achAvant = await solde(TE, ACHETEUR);
const recu = await envoyer(plan.appels[0], 'plan a frais, 3 sauts');
const partA6cf = (await solde(TE, FEE_WALLET)) - a6cfAvant;
const partAch = (await solde(TE, ACHETEUR)) - achAvant;
const total = partA6cf + partAch;
const attendu = total * BPS_DECIDES / 10000n;
console.log('  sortie totale : ' + total);
console.log('  acheteur      : ' + partAch);
console.log('  a6cf          : ' + partA6cf + '   (attendu ' + attendu + ')');

/* ── 2. TEMOIN NEGATIF : la MEME transaction SANS `value` doit ECHOUER ─────────────────────── */
console.log('\nTEMOIN NEGATIF — la MEME transaction SANS `value` :');
const sansValeur = await envoyer(plan.appels[0], 'meme calldata, sans ETH', false);
const temoinEchoue = sansValeur.status === '0x0';
console.log('  ' + (temoinEchoue ? '✓ elle ECHOUE — c est donc bien l ETH envoye qui paie'
  : '⛔ elle REUSSIT : la preuve ne porte pas sur ce qu on croit'));

console.log('\n' + '═'.repeat(92));
const c = [
  [temoinInchange, 'CONTROLE NEGATIF : a6cf inchange sans beneficiaire'],
  [recu.status === '0x1', 'CONDITION 1 : status 0x1'],
  [total > 0n && partAch >= BigInt(plan.minSortie), 'CONDITION 2 : l acheteur recoit AU MOINS le minimum garanti'],
  [total > 0n && partA6cf === attendu, 'CONDITION 3 : a6cf recoit EXACTEMENT ' + BPS_DECIDES + ' bps'],
  [temoinEchoue, 'TEMOIN NEGATIF : sans `value`, la transaction echoue'],
];
for (const [ok, t] of c) console.log((ok ? '✓ ' : '✗ ') + t);
const tout = c.every(([ok]) => ok);
console.log('═'.repeat(92));
console.log(tout ? '⭐ LE PLAN QUE L ECRAN APPELLERA TIENT A TROIS SAUTS — sur un fork, a cet etat.'
  : '⛔ LE PLAN N EST PAS PROUVE. Ne rien cabler sur cette base.');
console.log('⚠️ NE PROUVE PAS qu un visiteur passe, ni qu un centime soit encaisse. a6cf n a recu');
console.log('   AUCUN jeton d action sur mainnet.');
process.exit(tout ? 0 : 1);
