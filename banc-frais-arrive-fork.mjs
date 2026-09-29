/* le-frais-arrive-t-il.mjs — LE FRAIS D INTERFACE ARRIVE-T-IL VRAIMENT SUR a6cf ?
 *
 * LE TROU QUE CE BANC COMBLE : le frais est cable, teste, deploye — et vaut ZERO dans les faits,
 * parce qu aucun achat n est jamais passe par ces chemins. « Le calldata est correct » et « le
 * wallet a recu quelque chose » sont deux affirmations differentes.
 *
 * ⛔⛔ TROIS CONDITIONS, PAS UNE. Un banc de fork a deja rendu VERT sur une transaction de statut
 *     `0x0` : le rejeu « marchait » et la transaction avait echoue.
 *       1. le recu porte `status` = 0x1
 *       2. le solde de a6cf en ACTION TOKENISEE augmente
 *       3. l augmentation vaut EXACTEMENT 10 bps de la sortie totale du swap
 * ⛔ CONTROLE NEGATIF OBLIGATOIRE : le MEME achat, sans montage de frais, doit laisser a6cf
 *   INCHANGE. Sans ce controle, une derive quelconque du solde signerait un faux succes.
 * ⛔ RIEN N EST SIGNE SUR MAINNET : tout se passe sur un fork local, avec des comptes usurpes par
 *   `anvil_impersonateAccount`. Aucune cle privee n est touchee.
 */
import { planUsdcVersBlock } from './plan-usdc-block.js';
import { ROUTEUR_AERODROME_CL, FRAIS_INTERFACE_BPS_CL } from './calldata-aerodrome.js';
import { FEE_WALLET } from './frais-creation.js';
import { selecteur as selPrefixe } from './keccak.js';

const sel = (s) => selPrefixe(s).replace(/^0x/, '');

/* ⛔⛔ LE TAUX ATTENDU EST ECRIT ICI, PAS IMPORTE. Calculer l attendu avec
 *     `FRAIS_INTERFACE_BPS_CL` -- la meme constante qui construit le calldata -- rendait ce banc
 *     D ACCORD avec n importe quelle derive : passer la constante a 100 bps aurait laisse les sept
 *     conditions vertes. Une assertion qui prend son attendu dans la chose qu elle mesure ne
 *     mesure rien. 10 bps = 0,1 %, decision de Phil du 2026-09-28, et ce banc la tient CONTRE le
 *     module. */
const BPS_DECIDES = 10n;

const FORK = 'http://127.0.0.1:8545';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const NVDAc = '0xb20000000000000000000078ee7ce2fe4908108c';
const POOL = '0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9';
const TS = 10, FEE = 500;

let id = 0;
async function rpc(method, params, url = FORK) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(method + ' : ' + JSON.stringify(j.error));
  return j.result;
}
const mot32 = (a) => '0'.repeat(24) + String(a).replace(/^0x/, '').toLowerCase();
const balanceOf = async (jeton, qui) => BigInt(await rpc('eth_call', [{ to: jeton, data: '0x' + sel('balanceOf(address)') + mot32(qui) }, 'latest']));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 0. le fork repond-il, et sur quel bloc ? ──────────────────────────────────────────────── */
let tete = null;
for (let i = 0; i < 40 && tete === null; i += 1) {
  try { tete = BigInt(await rpc('eth_blockNumber', [])); } catch (_) { await pause(500); }
}
if (tete === null) { console.log('⛔ le fork ne repond pas sur ' + FORK); process.exit(1); }
console.log('fork au bloc ' + tete);

/* ── 1. le prix VIVANT de la pool, lu sur le fork ──────────────────────────────────────────── */
const slot0 = await rpc('eth_call', [{ to: POOL, data: '0x' + sel('slot0()') }, 'latest']);
const sqrtPriceX96 = BigInt('0x' + slot0.slice(2, 66));
console.log('sqrtPriceX96 lu sur le fork : ' + sqrtPriceX96);

/* ── 2. trouver un detenteur d USDC, sur la chaine, sans en inventer un ────────────────────── */
const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
/* ⛔ FENETRE COURTE, ET SUR MAINNET DIRECTEMENT : 400 blocs de transferts USDC font depasser la
 *   taille de reponse du backend (« backend response too large »), et le fork relaie cette erreur.
 *   Ce n est pas un fait de la chaine, c est une limite de transport — a traiter comme telle. */
const MAINNET = 'https://mainnet.base.org';
let logs = [];
for (const largeur of [8n, 24n, 60n]) {
  try {
    logs = await rpc('eth_getLogs', [{ address: USDC, topics: [TOPIC],
      fromBlock: '0x' + (tete - largeur).toString(16), toBlock: '0x' + tete.toString(16) }], MAINNET);
    if (logs.length) break;
  } catch (e) { console.log('  fenetre de ' + largeur + ' blocs refusee : ' + String(e.message).slice(0, 80)); }
}
console.log('transferts USDC examines : ' + logs.length);
const MONTANT = 500_000_000n;           /* 500 USDC, 6 decimales */
let baleine = null;
const vus = new Set();
for (const l of logs.reverse()) {
  const a = '0x' + l.topics[2].slice(26);
  if (vus.has(a) || a === '0x' + '0'.repeat(40)) continue;
  vus.add(a);
  const [solde, code] = await Promise.all([balanceOf(USDC, a), rpc('eth_getCode', [a, 'latest'])]);
  if (solde >= MONTANT * 2n && code === '0x') { baleine = a; console.log('detenteur EOA retenu : ' + a + '  solde ' + solde + ' (6 dec)'); break; }
}
if (!baleine) { console.log('⛔ aucun detenteur EOA d USDC trouve dans la fenetre — NON MESURE, je ne conclus pas'); process.exit(2); }

/* ── 3. usurper, financer le gaz ───────────────────────────────────────────────────────────── */
await rpc('anvil_impersonateAccount', [baleine]);
await rpc('anvil_setBalance', [baleine, '0x' + (10n ** 18n).toString(16)]);

async function envoyer(to, data, quoi) {
  const h = await rpc('eth_sendTransaction', [{ from: baleine, to, data, gas: '0x' + (3_000_000).toString(16) }]);
  /* ⛔ LE RECU N EST PAS IMMEDIAT : `eth_getTransactionReceipt` rend `null` pendant un instant, et
   *   lire `.status` sur `null` fait planter le banc AVANT tout verdict — un banc qui meurt ne
   *   rend pas ROUGE, il ne rend RIEN, ce qui est pire. On attend, avec une borne. */
  let recu = null;
  for (let i = 0; i < 60 && recu === null; i += 1) { recu = await rpc('eth_getTransactionReceipt', [h]); if (recu === null) await pause(250); }
  if (recu === null) { console.log('  ' + quoi + ' : AUCUN RECU apres 15 s — NON MESURE'); return { status: null }; }
  /* ⛔⛔ LE STATUT EST LU, PAS SUPPOSE. Un banc a deja rendu VERT sur un `status 0x0`. */
  console.log('  ' + quoi + ' : status ' + recu.status + (recu.status === '0x1' ? '' : '  <== ECHEC ON-CHAIN'));
  return recu;
}

/* ── 4. le plan, avec frais ────────────────────────────────────────────────────────────────── */
const maintenant = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const plan = planUsdcVersBlock({ block: NVDAc, pool: POOL, sqrtPriceX96, fee: FEE, blockEst0: false,
  montantUsdc: MONTANT, toleranceBps: 300, recipient: baleine, deadline: maintenant + 600n,
  maintenant, famille: 'cl', tickSpacing: TS, beneficiaireFrais: FEE_WALLET });
if (plan.etat !== 'PRET') { console.log('⛔ plan REFUSE : ' + plan.pourquoi); process.exit(1); }
console.log('\nplan : sortie attendue ' + plan.sortieAttendue + ', minUtilisateur ' + plan.minUtilisateur
  + ', fraisBps ' + plan.fraisBps + ', beneficiaire ' + plan.beneficiaireFrais);

const avantA6cf = await balanceOf(NVDAc, FEE_WALLET);
const avantUser = await balanceOf(NVDAc, baleine);
console.log('a6cf avant : ' + avantA6cf + '   acheteur avant : ' + avantUser);

console.log('\n--- achat AVEC frais ---');
await envoyer(USDC, '0x' + sel('approve(address,uint256)') + mot32(ROUTEUR_AERODROME_CL) + MONTANT.toString(16).padStart(64, '0'), 'approve');
const appel = plan.appel || plan;
const recu = await envoyer(appel.to, appel.data, 'multicall(exactInput + sweepTokenWithFee)');

const apresA6cf = await balanceOf(NVDAc, FEE_WALLET);
const apresUser = await balanceOf(NVDAc, baleine);
const deltaA6cf = apresA6cf - avantA6cf;
const deltaUser = apresUser - avantUser;
console.log('a6cf apres : ' + apresA6cf + '   delta ' + deltaA6cf);
console.log('acheteur   : ' + apresUser + '   delta ' + deltaUser);

const sortieTotale = deltaA6cf + deltaUser;
const attendu = (sortieTotale * BPS_DECIDES) / 10000n;
console.log('\nsortie totale du swap : ' + sortieTotale);
console.log('10 bps de cette sortie : ' + attendu);

/* ── 5. contrôle négatif : le MEME achat SANS frais ────────────────────────────────────────── */
console.log('\n--- controle NEGATIF : meme achat, SANS montage de frais ---');
const maint2 = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const slot0b = await rpc('eth_call', [{ to: POOL, data: '0x' + sel('slot0()') }, 'latest']);
const planNu = planUsdcVersBlock({ block: NVDAc, pool: POOL, sqrtPriceX96: BigInt('0x' + slot0b.slice(2, 66)),
  fee: FEE, blockEst0: false, montantUsdc: MONTANT, toleranceBps: 300, recipient: baleine,
  deadline: maint2 + 600n, maintenant: maint2, famille: 'cl', tickSpacing: TS,
  beneficiaireFrais: null });
if (planNu.etat !== 'PRET') { console.log('⛔ plan nu REFUSE : ' + planNu.pourquoi); process.exit(1); }
console.log('plan nu : fraisBps ' + planNu.fraisBps + ', beneficiaire ' + planNu.beneficiaireFrais);
const avantNu = await balanceOf(NVDAc, FEE_WALLET);
await envoyer(USDC, '0x' + sel('approve(address,uint256)') + mot32(ROUTEUR_AERODROME_CL) + MONTANT.toString(16).padStart(64, '0'), 'approve');
const appelNu = planNu.appel || planNu;
const recuNu = await envoyer(appelNu.to, appelNu.data, 'exactInputSingle nu');
const deltaNu = (await balanceOf(NVDAc, FEE_WALLET)) - avantNu;
console.log('delta a6cf sans frais : ' + deltaNu);

/* ── 6. LE CHEMIN ETH, UNE SEULE TRANSACTION, SUR LE MEME BANC ────────────────────────────────
 * ⛔ LE MEME BANC, PAS UN SECOND SCRIPT : deux bancs jumeaux divergent, et le correctif d un
 *   chemin rate l autre. Une seule liste de verdicts, un seul controle negatif par chemin.
 * ⛔ CE TITRE DISAIT « TROIS APPELS » jusqu au 2026-09-29 : le routeur enveloppe l ETH lui-meme,
 *   donc le plan ne rend plus qu un appel. Un libelle perime dans un INSTRUMENT est de la
 *   desinformation lente — il survit plus longtemps qu un bug. */
console.log('\n--- chemin ETH -> USDC -> NVDAc, une seule transaction ---');
const WETH = '0x4200000000000000000000000000000000000006';
const POOLS_PIVOT_ADR = [
  '0x493e74eda2720e127baccc1a19b2d567bc14ab43',
  '0x3fe04a59ebd38cf06080a6f60a98d124eb59392a',
  '0x4e392fbfe4d0557c82d2f97f02ec39daa31516dd',
];
/* ⛔ TOUT EST LU SUR LE FORK : prix, tickSpacing, fee, et le SENS (token0). Reprendre ces valeurs
 *   d une fixture les ferait vieillir en silence — et `fee` n est PAS `tickSpacing`. */
const pivots = [];
const pivotsIllisibles = [];
for (const p of POOLS_PIVOT_ADR) {
  try {
    const s0 = await rpc('eth_call', [{ to: p, data: '0x' + sel('slot0()') }, 'latest']);
    const t0 = '0x' + (await rpc('eth_call', [{ to: p, data: '0x' + sel('token0()') }, 'latest'])).slice(26);
    const ts = Number(BigInt(await rpc('eth_call', [{ to: p, data: '0x' + sel('tickSpacing()') }, 'latest'])));
    const fe = Number(BigInt(await rpc('eth_call', [{ to: p, data: '0x' + sel('fee()') }, 'latest'])));
    pivots.push({ pool: p, tickSpacing: ts, fee: fe, wethEst0: t0.toLowerCase() === WETH.toLowerCase(),
      sqrtPriceX96: BigInt('0x' + s0.slice(2, 66)) });
    console.log('  pivot ' + p + '  ts ' + ts + '  fee ' + fe + '  wethEst0 ' + (t0.toLowerCase() === WETH.toLowerCase()));
  } catch (e) { pivotsIllisibles.push([p, String(e.message).slice(0, 60)]); }
}
/* ⛔ NE PAS TAIRE UN PIVOT SAUTE : « le meilleur de trois » devient « le meilleur de deux ». */
if (pivotsIllisibles.length) for (const [p, m] of pivotsIllisibles) console.log('  ⛔ pivot NON MESURE : ' + p + ' — ' + m);

const { planEthVersAction } = await import('./plan-eth-block.js');
const UN_DIXIEME_ETH = 10n ** 17n;
const maint3 = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const s0act = await rpc('eth_call', [{ to: POOL, data: '0x' + sel('slot0()') }, 'latest']);
const planEth = planEthVersAction({ action: NVDAc, montantWei: UN_DIXIEME_ETH,
  poolAction: { pool: POOL, tickSpacing: TS, fee: FEE, actionEst0: false, sqrtPriceX96: BigInt('0x' + s0act.slice(2, 66)) },
  poolsPivot: pivots, recipient: baleine, deadline: maint3 + 600n, maintenant: maint3,
  toleranceBps: 300, beneficiaireFrais: FEE_WALLET });
let cEth1 = false, cEth2 = false, cEth3 = false, deltaEth = 0n, attenduEth = 0n, pivotsCompares = 0;
if (planEth.etat !== 'PRET') {
  console.log('⛔ plan ETH REFUSE : ' + planEth.pourquoi);
} else {
  pivotsCompares = planEth.pivotsCompares;
  console.log('  pivots compares : ' + pivotsCompares + ' / ' + POOLS_PIVOT_ADR.length
    + '   sortie attendue ' + planEth.sortieAttendue + '   minUtilisateur ' + planEth.minUtilisateur);
  await rpc('anvil_setBalance', [baleine, '0x' + (10n ** 18n).toString(16)]);
  const avantA = await balanceOf(NVDAc, FEE_WALLET);
  const avantU = await balanceOf(NVDAc, baleine);
  let dernier = { status: null };
  for (const a of planEth.appels) {
    const h = await rpc('eth_sendTransaction', [{ from: baleine, to: a.to, data: a.data,
      value: a.value && a.value !== '0x0' ? a.value : undefined, gas: '0x' + (3_000_000).toString(16) }]);
    let r = null;
    for (let i = 0; i < 60 && r === null; i += 1) { r = await rpc('eth_getTransactionReceipt', [h]); if (r === null) await pause(250); }
    console.log('  ' + a.role + ' : status ' + (r === null ? 'AUCUN RECU' : r.status));
    dernier = r || { status: null };
    if (!r || r.status !== '0x1') break;
  }
  deltaEth = (await balanceOf(NVDAc, FEE_WALLET)) - avantA;
  const deltaUEth = (await balanceOf(NVDAc, baleine)) - avantU;
  const totalEth = deltaEth + deltaUEth;
  attenduEth = (totalEth * BPS_DECIDES) / 10000n;
  console.log('  a6cf delta ' + deltaEth + '   acheteur delta ' + deltaUEth + '   sortie totale ' + totalEth);
  console.log('  10 bps de cette sortie : ' + attenduEth);
  cEth1 = dernier.status === '0x1';
  cEth2 = deltaEth > 0n;
  cEth3 = deltaEth === attenduEth && attenduEth > 0n;
}

/* ── VERDICT : les conditions, chacune nommee ──────────────────────────────────────────────── */
const c1 = recu.status === '0x1';
const c2 = deltaA6cf > 0n;
const c3 = deltaA6cf === attendu;
const c4 = deltaNu === 0n;
console.log('\n=== VERDICT ===');
console.log((c1 ? 'OK  ' : 'ROUGE ') + '1. la transaction avec frais a un statut 0x1');
console.log((c2 ? 'OK  ' : 'ROUGE ') + '2. le solde de a6cf en NVDAc a AUGMENTE (' + deltaA6cf + ')');
console.log((c3 ? 'OK  ' : 'ROUGE ') + '3. l augmentation vaut exactement 10 bps de la sortie (' + attendu + ')');
console.log((c4 ? 'OK  ' : 'ROUGE ') + '4. CONTROLE NEGATIF : sans frais, a6cf reste inchange (' + deltaNu + ')');
/* ⛔ CE LIBELLE DISAIT « le dernier des TROIS appels », et c est devenu faux le 2026-09-29 : le
 *   chemin ETH tient en UNE transaction depuis que le routeur enveloppe l ETH lui-meme. Un label
 *   faux dans un instrument est de la desinformation lente — il survit plus longtemps qu un bug. */
console.log((cEth1 ? 'OK  ' : 'ROUGE ') + '5. CHEMIN ETH : la transaction unique a un statut 0x1');
console.log((cEth2 ? 'OK  ' : 'ROUGE ') + '6. CHEMIN ETH : le solde de a6cf a AUGMENTE (' + deltaEth + ')');
console.log((cEth3 ? 'OK  ' : 'ROUGE ') + '7. CHEMIN ETH : l augmentation vaut exactement 10 bps (' + attenduEth + ')');
const tout = c1 && c2 && c3 && c4 && cEth1 && cEth2 && cEth3;
console.log('\n' + (tout ? 'LE FRAIS ARRIVE, SUR LES DEUX CHEMINS.' : 'LE FRAIS N EST PAS PROUVE SUR LES DEUX CHEMINS.'));
/* ⛔ COMBIEN DE PIVOTS ONT REELLEMENT ETE COMPARES : sans ce chiffre, « le meilleur » est une
 *   affirmation, et un pivot saute en silence reduit le devis sans qu on le sache. */
console.log('pivots compares sur le chemin ETH : ' + pivotsCompares + ' / ' + POOLS_PIVOT_ADR.length);
/* ⛔ LA BORNE : prouve sur un FORK, a un bloc, avec une pool et un montant. Ne prouve pas qu un
 *   utilisateur reel ira jusqu au bout, ni que la pool aura de la profondeur a un autre montant. */
console.log('\nborne : prouve sur un fork, a UN bloc, UNE pool, UN montant (' + MONTANT + ' USDC-6dec).');
console.log('Ne prouve ni la profondeur a un autre montant, ni qu un utilisateur reel ira au bout.');
process.exit(tout ? 0 : 1);
