/* banc-v4-multi-sauts-fork.mjs — LA ROUTE MULTI-SAUTS V4 S EXECUTE-T-ELLE VRAIMENT ?
 *
 * ⛔⛔⛔ UN ASSEMBLAGE VERT N EST PAS UN SWAP. `test-route-v4-multi-sauts.mjs` tient la forme, les
 *   refus et le frais (45 cas, 14/14 mutations) — il ne prouve RIEN sur l execution. Ce banc envoie
 *   la transaction sur un fork et lit ce qui s est passe.
 *
 * ⛔⛔ TROIS CONDITIONS, PARCE QU UN BANC PEUT ETRE VERT SUR UNE TRANSACTION `status 0x0`.
 *   C est deja arrive dans ce depot (`fork-rig-trois-conditions`), et l absence de revert ne suffit
 *   donc pas :
 *     1. le recu dit `status: 0x1` ;
 *     2. le solde de l ACHETEUR dans le jeton de SORTIE a REELLEMENT monte, d au moins le minimum
 *        annonce — sinon le TAKE_ALL a pu porter sur autre chose sans que rien ne reverte ;
 *     3. le solde du WALLET DE FRAIS a monte d EXACTEMENT notre part — pas « a peu pres ».
 *   ⛔ Et une quatrieme, muette mais necessaire : le solde de l acheteur dans la devise d ENTREE a
 *     baisse du montant total. Sans elle, un swap qui ne depense rien passerait les trois autres.
 *
 * ⛔ CE BANC NE TOUCHE QUE LE FORK. Port 8548, chainId lu et VERIFIE. Rien n est signe sur le
 *   reseau reel, et il refuse de demarrer si le noeud n est pas un fork local.
 */
import { planEchangeMultiSauts } from './echange.js';
import { cleDePool, poolId, selecteur } from './pool.js';
import { FEE_WALLET } from './frais-creation.js';

const F = process.env.FORK || 'http://127.0.0.1:8548';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const OUSD = '0xB2000000000000000000002fEb517dFeC7415344';
const NVDA = '0xb20000000000000000000078ee7ce2fe4908108c';
const ETH = '0x0000000000000000000000000000000000000000';
const SV = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return true; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + String(vu)));
  return false;
}

async function appel(methode, params) {
  const r = await fetch(F, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: methode, params }) });
  const j = await r.json();
  if (j.error) throw new Error(methode + ' : ' + j.error.message);
  return j.result;
}
/* La forme que `planEchangeMultiSauts` attend : `rpc(methode, params)`. */
const rpc = (methode, params) => appel(methode, params);
const pad = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');

async function solde(jeton, qui) {
  if (String(jeton).toLowerCase() === ETH) return BigInt(await appel('eth_getBalance', [qui, 'latest']));
  const r = await appel('eth_call', [{ to: jeton, data: '0x' + selecteur('balanceOf(address)') + pad(qui) }, 'latest']);
  return BigInt(r);
}
async function slot0Vivante(cle) {
  const r = await appel('eth_call', [{ to: SV, data: '0x' + selecteur('getSlot0(bytes32)') + poolId(cle).slice(2) }, 'latest']);
  return BigInt('0x' + r.slice(2, 66)) > 0n;
}

console.log('=== LE BANC S ACCUSE D ABORD ===');
/* ⛔ UN BANC QUI TOURNERAIT SUR LE RESEAU REEL SERAIT UNE CATASTROPHE : on verifie que c est un
 *   fork LOCAL avant toute chose, et on refuse de continuer sinon. */
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(F)) {
  console.log('  ⛔⛔ ' + F + ' n est pas un noeud local. REFUS de demarrer.');
  process.exit(1);
}
const chainId = await appel('eth_chainId', []);
const tete = parseInt(await appel('eth_blockNumber', []), 16);
ok('le noeud est un fork LOCAL', /127\.0\.0\.1|localhost/.test(F), F);
ok('il forke bien Base (chainId 0x2105)', chainId === '0x2105', chainId);
console.log('  fork au bloc ' + tete);

/* ⛔⛔ LES POOLS DOIVENT EXISTER A CETTE HAUTEUR, sinon le banc echoue pour la MAUVAISE raison.
 *   Mesure du 2026-10-01 : sur un fork a 51 955 388, `USDC/OUSD` n etait PAS encore initialisee —
 *   OUSD est ne le 2026-09-30. Un fork trop vieux ne peut pas tester les pools du jour. */
const cleUsdcOusd = cleDePool(USDC, OUSD, { fee: 100, tickSpacing: 1 });
const cleUsdcNvda = cleDePool(NVDA, USDC, { fee: 100, tickSpacing: 1 });
const ousdVivante = await slot0Vivante(cleUsdcOusd);
const nvdaVivante = await slot0Vivante(cleUsdcNvda);
ok('la pool USDC/OUSD est initialisee a cette hauteur', ousdVivante);
ok('la pool USDC/NVDAc est initialisee a cette hauteur', nvdaVivante);
if (!ousdVivante || !nvdaVivante) {
  console.log('');
  console.log('  ⛔⛔ FORK TROP VIEUX POUR CETTE ROUTE. Ce n est pas un echec du code : c est un');
  console.log('     banc qui ne peut pas poser la question. Relancer base-anvil a la tete.');
  console.log('');
  console.log(n + ' assertions, ' + ko + ' KO');
  process.exit(ko ? 1 : 0);
}

/* Un compte de test, finance par le fork. ⛔ Clé de test d anvil, publique et sans valeur. */
const ACHETEUR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
console.log('');
console.log('=== PREPARATION : donner a l acheteur de l ETH, puis de l OUSD ===');
await appel('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 18n).toString(16)]);
ok('l acheteur a 1 ETH', (await solde(ETH, ACHETEUR)) === 10n ** 18n);

/* ⛔ L OUSD NE S INVENTE PAS : on le prend a un detenteur reel, par impersonation sur le fork.
 *   Ecrire directement dans le storage demanderait de DEVINER le slot du mapping — et je ne
 *   devine pas une structure de stockage. Le PoolManager detient l OUSD de la pool. */
const POOL_MANAGER = (await appel('eth_call', [{ to: SV, data: '0x' + selecteur('poolManager()') }, 'latest']).catch(() => null));
const detenteur = POOL_MANAGER ? '0x' + String(POOL_MANAGER).slice(26) : null;
console.log('  PoolManager lu via StateView : ' + (detenteur || 'illisible'));
const CENT_OUSD = 100000000n; /* 100 OUSD, 6 decimales */
let ousdPret = false;
if (detenteur && /^0x[0-9a-f]{40}$/i.test(detenteur)) {
  await appel('anvil_impersonateAccount', [detenteur]);
  await appel('anvil_setBalance', [detenteur, '0x' + (10n ** 18n).toString(16)]);
  const soldeDet = await solde(OUSD, detenteur);
  console.log('  OUSD detenu par le PoolManager : ' + soldeDet);
  if (soldeDet >= CENT_OUSD) {
    try {
      const tx = await appel('eth_sendTransaction', [{ from: detenteur, to: OUSD,
        data: '0x' + selecteur('transfer(address,uint256)') + pad(ACHETEUR) + mot(CENT_OUSD) }]);
      const rec = await appel('eth_getTransactionReceipt', [tx]);
      ousdPret = rec && rec.status === '0x1';
      /* ⛔ UN TRANSFERT QUI « PASSE » SANS DEPLACER RIEN NE COMPTE PAS : on relit le solde. */
      const recu = await solde(OUSD, ACHETEUR);
      ok('l acheteur a recu 100 OUSD', recu >= CENT_OUSD, recu);
      ousdPret = ousdPret && recu >= CENT_OUSD;
    } catch (e) { console.log('  ⛔ le transfert a echoue : ' + String(e.message).slice(0, 90)); }
  } else {
    console.log('  ⛔ le PoolManager n en detient pas assez');
  }
}
if (!ousdPret) {
  console.log('');
  console.log('  ⛔⛔ JE N AI PAS SU FINANCER L ACHETEUR EN OUSD. Ce n est pas « la route echoue » :');
  console.log('     c est « le banc n a pas su poser la question ». Je ne rends pas un vert la-dessus.');
  console.log('');
  console.log(n + ' assertions, ' + ko + ' KO');
  process.exit(1);
}

console.log('');
console.log('=== LA ROUTE : OUSD -> USDC -> NVDAc, construite par echange.js ===');
/* ⛔⛔ LA DIRECTION SE DEDUIT DE LA CLE, ELLE NE S ECRIT PAS A LA MAIN. Premiere version de ce
 *   banc : `zeroForOne: false` sur le 2e saut — FAUX, parce que `cleDePool` TRIE les devises et
 *   place USDC en `currency0` (0x8335… < 0xb200…). La garde de chainage de
 *   `route-v4-multi-sauts.js` l a attrapee avant toute transaction, en NOMMANT les deux devises :
 *   « hop 1 ends in 0x8335… but hop 2 starts from 0xb200… — the path does not chain ».
 *   ⇒ Elle a fait exactement ce pour quoi elle existe, et sur MA faute. Et elle a du meme coup
 *     revele que mon TEST ecrivait ses cles a la main dans un ordre que `cleDePool` ne produit
 *     jamais : le test validait sa propre fiction. */
const versCurrency1 = (cle, depuis) => String(cle.currency0).toLowerCase() === String(depuis).toLowerCase();
const SAUTS = [
  { cle: cleUsdcOusd, zeroForOne: versCurrency1(cleUsdcOusd, OUSD) },
  { cle: cleUsdcNvda, zeroForOne: versCurrency1(cleUsdcNvda, USDC) },
];
/* ⛔ `fraisDevisesOk` : le verrou `assertFraisInterfaceA6cf` n admet une devise de frais que si
 *   l APPELANT a LU son prix. OUSD est au pair avec 10 M$, et notre API en sert le prix. */
const plan = await planEchangeMultiSauts({ rpc, chaine: 8453, compte: ACHETEUR, sauts: SAUTS,
  entree: OUSD, sortie: NVDA, montant: CENT_OUSD, toleranceBps: 300n,
  fraisDevisesOk: new Set([OUSD.toLowerCase()]) });
console.log('  etat : ' + plan.etat + (plan.pourquoi ? '   « ' + String(plan.pourquoi).slice(0, 130) + ' »' : ''));
if (plan.etat === 'APPROBATIONS') {
  console.log('  ' + plan.etapes.length + ' autorisation(s) a passer d abord — on les execute sur le fork');
  await appel('anvil_impersonateAccount', [ACHETEUR]);
  for (const e of plan.etapes) {
    const tx = await appel('eth_sendTransaction', [{ from: ACHETEUR, to: e.to, data: e.data, value: e.value }]);
    const rec = await appel('eth_getTransactionReceipt', [tx]);
    ok('autorisation « ' + e.nom + ' » status 0x1', rec && rec.status === '0x1', rec && rec.status);
  }
  const plan2 = await planEchangeMultiSauts({ rpc, chaine: 8453, compte: ACHETEUR, sauts: SAUTS,
    entree: OUSD, sortie: NVDA, montant: CENT_OUSD, toleranceBps: 300n,
    fraisDevisesOk: new Set([OUSD.toLowerCase()]) });
  console.log('  apres autorisations : ' + plan2.etat
    + (plan2.pourquoi ? '   « ' + String(plan2.pourquoi).slice(0, 130) + ' »' : ''));
  Object.assign(plan, plan2);
}
if (!ok('le plan est PRET', plan.etat === 'PRET', plan.etat + ' ' + String(plan.pourquoi || '').slice(0, 120))) {
  console.log('');
  console.log(n + ' assertions, ' + ko + ' KO');
  process.exit(1);
}
console.log('  frais annonce : ' + plan.resume.frais + ' (' + plan.resume.fraisDevise + ')');
console.log('  recoit au moins : ' + plan.resume.recoitAuMoins + ' unites NVDAc');

console.log('');
console.log('=== LES TROIS CONDITIONS, PLUS CELLE DE LA DEPENSE ===');
const avantNvda = await solde(NVDA, ACHETEUR);
const avantOusd = await solde(OUSD, ACHETEUR);
const avantFrais = await solde(OUSD, FEE_WALLET);
await appel('anvil_impersonateAccount', [ACHETEUR]);
const hash = await appel('eth_sendTransaction', [{ from: ACHETEUR, to: plan.tx.to,
  data: plan.tx.data, value: plan.tx.value }]);
/* ⛔⛔ LE RECU PEUT ETRE `null` LE TEMPS QUE LE FORK MINE, ET MA PREMIERE VERSION LE LISAIT UNE
 *   SEULE FOIS. Resultat : « status: null » et un KO, alors que les soldes avaient BOUGE — donc
 *   que la transaction avait REUSSI. C est l inverse exact du piege `fork-rig-trois-conditions`
 *   (vert sur un `status 0x0`), et c est tout aussi faux : une sonde qui ne sait pas LIRE le statut
 *   ne peut rien affirmer dessus, ni le succes ni l echec.
 *   ⛔ ON ATTEND DONC LE RECU, et un recu qui n arrive jamais est un NON_MESURE nomme — pas un
 *     echec, et surtout pas un succes deduit des soldes. */
let recu = null;
for (let i = 0; i < 20 && !recu; i += 1) {
  recu = await appel('eth_getTransactionReceipt', [hash]);
  if (!recu) await new Promise((r) => setTimeout(r, 250));
}
/* ⛔ CONDITION 1 : le recu, pas l absence d exception. */
if (!recu) {
  ok('1. le recu de la transaction a ete LU', false, 'aucun recu apres 20 essais — NON MESURE');
} else {
  ok('1. la transaction a REUSSI (status 0x1)', recu.status === '0x1', recu.status);
  console.log('     gas utilise : ' + parseInt(recu.gasUsed, 16) + '   bloc ' + parseInt(recu.blockNumber, 16));
}
const apresNvda = await solde(NVDA, ACHETEUR);
const apresOusd = await solde(OUSD, ACHETEUR);
const apresFrais = await solde(OUSD, FEE_WALLET);
const gagne = apresNvda - avantNvda;
const depense = avantOusd - apresOusd;
const encaisse = apresFrais - avantFrais;
console.log('  NVDAc  acheteur : ' + avantNvda + ' -> ' + apresNvda + '   (+' + gagne + ')');
console.log('  OUSD   acheteur : ' + avantOusd + ' -> ' + apresOusd + '   (-' + depense + ')');
console.log('  OUSD   a6cf     : ' + avantFrais + ' -> ' + apresFrais + '   (+' + encaisse + ')');
/* ⛔ CONDITION 2 : le solde de SORTIE a monte, d au moins le minimum ANNONCE. */
ok('2. l acheteur a REELLEMENT recu du NVDAc', gagne > 0n, gagne);
ok('2b. et au moins le minimum annonce', gagne >= plan.resume.recoitAuMoins,
  gagne + ' < ' + plan.resume.recoitAuMoins);
/* ⛔ CONDITION 3 : notre part, EXACTE. « A peu pres » ne compte pas. */
ok('3. a6cf a encaisse EXACTEMENT notre part', encaisse === plan.resume.frais,
  encaisse + ' != ' + plan.resume.frais);
/* ⛔ LA QUATRIEME, MUETTE MAIS NECESSAIRE : sans elle, un swap qui ne depense rien passerait. */
ok('4. l acheteur a bien DEPENSE le montant total', depense === CENT_OUSD, depense);

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
