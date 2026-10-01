/* BANC SUR FORK : UN PORTEUR D USDC ACHETE UNE ACTION TOKENISEE EN **UNE** TRANSACTION.
 *
 * ⭐ CE QUE CE BANC PROUVE, ET QUI MANQUAIT. Le rail `plan-aerodrome-segment.js` a ete livre avec
 *   40 assertions unitaires et 10/10 mutations, mais AUCUNE preuve d execution. Un module teste
 *   hors reseau prouve ses decisions, pas que la chaine accepte son calldata.
 *
 * ⛔⛔ POURQUOI CE RAIL COMPTE : mesure du 2026-10-01, depuis USDC, avant lui — 236/245 marches
 *   offerts mais seulement 23,1 % du VOLUME. Les neuf manquants (AAPLc, METAc, GOOGLc, AMZNc,
 *   SNDKc...) portaient 76,9 %. Un payeur en USDC ne pouvait acheter AUCUNE des actions qui font
 *   l argent.
 *
 * ⛔⛔⛔ TROIS CONDITIONS DE VALIDITE, parce qu un banc de ce depot a deja ete VERT sur une tx
 *   `status 0x0` :
 *     1. un VRAI fork de Base — chainId 8453 ET du code a une adresse connue ;
 *     2. CHAQUE transaction porte `status === '0x1'`, et un recu non lu n est PAS un succes :
 *        on attend en boucle plutot que de conclure sur un `null` ;
 *     3. les SOLDES bougent dans le bon sens et du bon montant. Un `status 0x1` sur un appel qui ne
 *        fait rien est un succes vide.
 *   Si une seule manque, le banc ECHOUE. Il ne rend jamais « probablement bon ».
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un humain cliquera, ni que la pool cotera a une autre taille.
 */
import { planAerodromeSegment } from './plan-aerodrome-segment.js';
import { FEE_WALLET } from './frais-creation.js';
import { FRAIS_INTERFACE_BPS_CL } from './calldata-aerodrome.js';
import { selecteur } from './keccak.js';

const PORT = process.env.PORT_FORK || '8548';
const URL = 'http://127.0.0.1:' + PORT;

/* ⛔ ADRESSES LUES DANS LE DEPOT OU SUR /api/trending, jamais de memoire. */
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const AAPLC = '0xb200000000000000000000c2e324d24d7eecd1fb';
/* ⛔ Un detenteur d USDC a impersonner : le PoolManager v4 en detient, comme pour le banc OUSD. */
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const ACHETEUR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const CENT_USDC = 100000000n; /* USDC a SIX decimales — lues, pas supposees */

let n = 0, ko = 0;
const ok = (nom, cond, vu) => {
  n += 1;
  if (cond) { console.log('  ok  ' + nom); return true; }
  ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '   vu: ' + vu));
  return false;
};
const dors = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0;
async function appel(methode, params = []) {
  const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: methode, params }) });
  const j = await r.json();
  if (j.error) throw new Error(methode + ' : ' + j.error.message);
  return j.result;
}
const rpc = (m, p) => appel(m, p);
const pad = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
async function solde(jeton, qui) {
  const r = await appel('eth_call', [{ to: jeton, data: '0x70a08231' + pad(qui) }, 'latest']);
  try { return BigInt(r); } catch (_) { return 0n; }
}
/* ⛔ UN RECU LU UNE FOIS PEUT RENDRE `null` ALORS QUE LA TX A REUSSI : on attend, on ne conclut pas
 *   sur une absence de reponse. Ce defaut a deja produit un faux KO dans ce depot. */
async function recu(hash) {
  for (let i = 0; i < 40; i += 1) {
    const r = await appel('eth_getTransactionReceipt', [hash]);
    if (r) return r;
    await dors(200);
  }
  return null;
}

console.log('=== BANC AERODROME : USDC -> AAPLc, UN SEGMENT, UNE TRANSACTION ===');
console.log('fork ' + URL);

const chainId = parseInt(await appel('eth_chainId'), 16);
if (!ok('1. le fork est bien Base (chainId 8453)', chainId === 8453, chainId)) process.exit(1);
const codeA = await appel('eth_getCode', [AAPLC, 'latest']);
/* ⛔ `0xef` EST LE MARQUEUR B20 : un controle « il y a du code » calibre sur des contrats ordinaires
 *   refuserait precisement la classe de jetons dont ce depot vit. Deja paye ce matin. */
if (!ok('1b. AAPLc porte du code (B20 = 0xef, un octet)',
  !!codeA && codeA !== '0x', String(codeA).slice(0, 10))) process.exit(1);
console.log('  bloc du fork : ' + parseInt(await appel('eth_blockNumber'), 16));

/* ── FINANCER L ACHETEUR EN USDC ───────────────────────────────────────────────────────────── */
await appel('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 18n).toString(16)]);
await appel('anvil_impersonateAccount', [PM]);
await appel('anvil_setBalance', [PM, '0x' + (10n ** 18n).toString(16)]);
const hFin = await appel('eth_sendTransaction', [{ from: PM, to: USDC,
  data: '0x' + selecteur('transfer(address,uint256)').replace(/^0x/, '') + pad(ACHETEUR) + mot(CENT_USDC) }]);
const rFin = await recu(hFin);
const usdcAcheteur = await solde(USDC, ACHETEUR);
if (!ok('2. l acheteur detient 100 USDC', rFin && rFin.status === '0x1' && usdcAcheteur >= CENT_USDC,
  String(usdcAcheteur))) process.exit(1);

/* ── LE PLAN ───────────────────────────────────────────────────────────────────────────────── */
const plan = await planAerodromeSegment({ rpc,
  chemin: [{ de: USDC.toLowerCase(), vers: AAPLC, famille: 'aerodrome' }],
  devise: USDC, block: AAPLC, montant: CENT_USDC, compte: ACHETEUR,
  beneficiaireFrais: FEE_WALLET, toleranceBps: 500n });
if (!ok('3. le plan est PRET', plan.etat === 'PRET',
  plan.etat + ' ' + String(plan.pourquoi || '').slice(0, 130))) {
  console.log(''); console.log(n + ' assertions, ' + ko + ' KO'); process.exit(1);
}
console.log('     ' + plan.resume.sauts + ' saut, frais ' + plan.resume.fraisBps + ' bps, '
  + 'minimum acheteur ' + plan.resume.recoitAuMoins + ' (pools ' + plan.resume.minPools + ')');
ok('3b. DEUX appels : approbation puis swap', plan.appels.length === 2, plan.appels.length);
ok('3c. il n EXIGE PAS l atomicite', plan.exigeAtomique === false);
/* ⛔ LES OCTETS, PAS LE RESUME : un plan peut annoncer un frais que son calldata ne prend pas. */
ok('3d. FEE_WALLET est NOMME dans le calldata du swap',
  String(plan.appels[1].data).toLowerCase().includes(String(FEE_WALLET).replace(/^0x/, '').toLowerCase()));
ok('3e. et le taux est celui du module', plan.resume.fraisBps === FRAIS_INTERFACE_BPS_CL);

/* ── EXECUTION ─────────────────────────────────────────────────────────────────────────────── */
const avU = await solde(USDC, ACHETEUR);
const avA = await solde(AAPLC, ACHETEUR);
const avFrais = await solde(AAPLC, FEE_WALLET);

await appel('anvil_impersonateAccount', [ACHETEUR]);
let tous = true;
for (const [i, a] of plan.appels.entries()) {
  let h;
  try { h = await appel('eth_sendTransaction', [{ from: ACHETEUR, to: a.to, data: a.data, value: a.value || '0x0' }]); }
  catch (e) { ok('4.' + (i + 1) + ' ' + a.role, false, String(e.message).slice(0, 130)); tous = false; break; }
  const r = await recu(h);
  if (!ok('4.' + (i + 1) + ' ' + a.role + ' (status 0x1)', !!r && r.status === '0x1',
    r ? r.status : 'recu non lu')) { tous = false; break; }
}

const apU = await solde(USDC, ACHETEUR);
const apA = await solde(AAPLC, ACHETEUR);
const apFrais = await solde(AAPLC, FEE_WALLET);
console.log('');
console.log('=== LES SOLDES ===');
console.log('  acheteur USDC   ' + avU + ' -> ' + apU);
console.log('  acheteur AAPLc  ' + avA + ' -> ' + apA);
console.log('  a6cf     AAPLc  ' + avFrais + ' -> ' + apFrais);
console.log('');
if (tous) {
  ok('5. l acheteur a DEPENSE exactement 100 USDC', avU - apU === CENT_USDC, avU - apU);
  ok('6. l acheteur a RECU de l AAPLc', apA > avA, apA - avA);
  ok('7. a6cf a ete paye, EN AAPLc', apFrais > avFrais, apFrais - avFrais);
  /* ⛔⛔ LE MONTANT EXACT, PAS « POSITIF ». Un frais positif mais faux passerait une assertion
   *   « > 0 » sans qu on le voie. La retenue vaut 10 bps de la sortie TOTALE, arrondis vers le bas. */
  const recu2 = apA - avA, pris = apFrais - avFrais, totalSortie = recu2 + pris;
  const attendu = (totalSortie * FRAIS_INTERFACE_BPS_CL) / 10000n;
  ok('7b. et il vaut EXACTEMENT 0,1 % de la sortie, au wei', pris === attendu,
    pris + ' vs ' + attendu);
  ok('8. l acheteur recoit au moins ce que le plan annoncait',
    recu2 >= BigInt(plan.resume.recoitAuMoins), recu2 + ' >= ' + plan.resume.recoitAuMoins);
} else {
  console.log('  ⛔ un appel a echoue : les conditions de solde ne sont PAS evaluees.');
  console.log('     Les declarer « non testees » est honnete ; les declarer vertes serait faux.');
}
console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
