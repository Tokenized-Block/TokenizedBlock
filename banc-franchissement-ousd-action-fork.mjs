/* BANC SUR FORK : UN PORTEUR D OUSD ACHETE UNE ACTION TOKENISEE — et NOUS PAIE DEUX FOIS.
 *
 * ⭐ LA MISSION DE PHIL (2026-10-01) : « open OUSD a tt les action tokenized et creer le rails avec
 *   des fees sur chaque transaction pour le dev ».
 *
 * ⛔⛔ CE QUE CE BANC DOIT PROUVER, ET QUI N A JAMAIS ETE PROUVE : que le franchissement
 *   OUSD -> USDC (Uniswap V4) -> AAPLc (Aerodrome CL) S EXECUTE, et que le wallet de frais encaisse
 *   sur LES DEUX jambes. La jambe 2 ne payait RIEN jusqu a aujourd hui, et c est elle qui porte
 *   96,4 % du volume (mesure du 2026-10-01 : 11 marches Aerodrome, 83 728 918 $ / 24 h).
 *
 * ⛔⛔⛔ TROIS CONDITIONS DE VALIDITE, PARCE QU UN BANC A DEJA ETE **VERT SUR UNE TX `status 0x0`** :
 *     1. le fork doit etre un VRAI fork de Base (chainId 8453 ET du code a une adresse connue) ;
 *     2. CHAQUE transaction doit porter `status === '0x1'` — un recu non lu n est PAS un succes,
 *        on attend en boucle plutot que de conclure sur un `null` ;
 *     3. les SOLDES doivent bouger dans le bon sens et du bon montant. Un `status 0x1` sur un
 *        appel qui ne fait rien est un succes vide.
 *   ⇒ Si une seule des trois manque, le banc ECHOUE. Il ne rend jamais « probablement bon ».
 *
 * ⚠️ CE QUE CE BANC NE PROUVE PAS, et il faut le lire avant de citer son resultat :
 *   · il envoie les trois appels SEQUENTIELLEMENT. Anvil ne simule pas EIP-5792. L atomicite reelle
 *     reste NON PROUVEE ici — or sans elle, la jambe 1 peut passer seule et l acheteur se retrouve
 *     avec du USDC au lieu de son action. C est pour ca que `peutEtreAssemblee` rend
 *     `exigeAtomique: true` et que l ecran devra refuser aux wallets qui ne groupent pas.
 *   · un fork prouve que le calldata s execute. Il ne prouve pas qu un humain cliquera.
 */
import { planEchangeMultiSauts } from './echange.js';
import { planifierFranchissement, calldataGetPool, FACTORY_AERODROME_CL, FRAIS_INTERFACE_BPS_CL }
  from './calldata-aerodrome.js';
import { franchissementDepuisChemin } from './franchissement-depuis-chemin.js';
import { FEE_WALLET } from './frais-creation.js';
import { selecteur } from './keccak.js';

const PORT = process.env.PORT_FORK || '8548';
const URL = 'http://127.0.0.1:' + PORT;

/* ⛔ ADRESSES LUES DANS LE DEPOT OU SUR /api/trending, JAMAIS DE MEMOIRE. */
const OUSD = '0xB2000000000000000000002fEb517dFeC7415344';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const AAPLC = '0xb200000000000000000000c2e324d24d7eecd1fb'; /* /api/trending, quote USDC, dex aerodrome */
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b';   /* PoolManager v4 — detient l OUSD */
const ACHETEUR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const CENT_OUSD = 100000000n; /* OUSD a SIX decimales — LUES, pas supposees */
/* La cle de la pool OUSD/USDC, LUE en direct sur /api/prix-usd (ageFaitsMs 0) le 2026-10-01. */
const CLE_OUSD_USDC = { currency0: USDC.toLowerCase(), currency1: OUSD.toLowerCase(),
  fee: 100, tickSpacing: 1, hooks: '0x0000000000000000000000000000000000000000' };

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
/* ⛔ UN RECU LU UNE FOIS PEUT RENDRE `null` ALORS QUE LA TX A REUSSI. On attend, on ne conclut pas
 *   sur une absence de reponse — c est le defaut qui a deja produit un faux KO ici. */
async function recu(hash) {
  for (let i = 0; i < 40; i += 1) {
    const r = await appel('eth_getTransactionReceipt', [hash]);
    if (r) return r;
    await dors(200);
  }
  return null;
}

console.log('=== BANC FRANCHISSEMENT : OUSD -> USDC (v4) -> AAPLc (Aerodrome) ===');
console.log('fork ' + URL);

/* ── CONDITION 1 : est-ce un VRAI fork de Base ? ───────────────────────────────────────────── */
const chainId = parseInt(await appel('eth_chainId'), 16);
if (!ok('1. le fork est bien Base (chainId 8453)', chainId === 8453, chainId)) process.exit(1);
const codePM = await appel('eth_getCode', [PM, 'latest']);
if (!ok('1b. le PoolManager v4 porte du code sur ce fork', codePM && codePM.length > 4,
  String(codePM).slice(0, 10))) process.exit(1);
/* ⛔⛔⛔ MA PREMIERE VERSION EXIGEAIT `code.length > 4` ET A REJETE AAPLc, QUI REND `0xef`.
 *   C etait MON garde-fou qui avait tort, et l ironie est complete : `0xef` EST le marqueur B20 —
 *   le bytecode ENTIER d une action tokenisee fait UN SEUL OCTET. Un test « il y a du code » calibre
 *   sur des contrats ordinaires refuse precisement la classe de jetons dont ce depot vit.
 *   ⇒ On accepte donc `0xef` NOMMEMENT, et on ne refuse que le vide (`0x`), qui signifie
 *     « cette adresse n a pas de code sur ce fork » — le seul cas qui invaliderait le banc. */
const codeAction = await appel('eth_getCode', [AAPLC, 'latest']);
const estB20 = String(codeAction).toLowerCase() === '0xef';
if (!ok('1c. AAPLc porte du code sur ce fork (B20 = 0xef, un seul octet)',
  !!codeAction && codeAction !== '0x' && (estB20 || codeAction.length > 4),
  String(codeAction).slice(0, 10))) process.exit(1);
if (estB20) console.log('     AAPLc porte le marqueur B20 `0xef` — attendu pour une action tokenisee');
console.log('  bloc du fork : ' + parseInt(await appel('eth_blockNumber'), 16));

/* ── FINANCER L ACHETEUR EN OUSD ───────────────────────────────────────────────────────────── */
await appel('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 18n).toString(16)]);
await appel('anvil_impersonateAccount', [PM]);
await appel('anvil_setBalance', [PM, '0x' + (10n ** 18n).toString(16)]);
const hFin = await appel('eth_sendTransaction', [{ from: PM, to: OUSD,
  data: '0x' + selecteur('transfer(address,uint256)').replace(/^0x/, '') + pad(ACHETEUR) + mot(CENT_OUSD) }]);
const rFin = await recu(hFin);
const ousdAcheteur = await solde(OUSD, ACHETEUR);
if (!ok('2. l acheteur detient 100 OUSD', rFin && rFin.status === '0x1' && ousdAcheteur >= CENT_OUSD,
  String(ousdAcheteur))) process.exit(1);

/* ── LA FORME DU FRANCHISSEMENT, DECIDEE PAR LE MODULE SERVI ───────────────────────────────── */
const chemin = [
  { de: OUSD.toLowerCase(), vers: USDC.toLowerCase(), famille: 'uniswap-v4' },
  { de: USDC.toLowerCase(), vers: AAPLC, famille: 'aerodrome' },
];
const forme = franchissementDepuisChemin({ chemin });
if (!ok('3. la forme est reconnue comme un franchissement', forme.etat === 'OK',
  forme.pourquoi)) process.exit(1);
ok('3b. le pivot est USDC', forme.pivot === USDC.toLowerCase(), forme.pivot);
ok('3c. la destination est AAPLc', forme.action === AAPLC, forme.action);

/* ── RESOUDRE LA POOL AERODROME : ON NE SUPPOSE PAS LE tickSpacing ─────────────────────────── */
/* ⛔⛔ MESURE DU 2026-09-28 : `tickSpacing` vaut 10 sur SEPT pools d actions et 1 sur CINQ autres.
 *   Prendre 10 « parce que c est le plus courant » construirait un calldata vers une pool
 *   INEXISTANTE pour cinq actions sur douze, et ca reverterait APRES la signature. On interroge
 *   donc la factory, espacement par espacement, et on prend le premier qui rend une adresse. */
const ESPACEMENTS = [1, 10, 50, 80, 100, 150, 200, 500, 2000];
let poolAero = null, tsAero = null;
for (const ts of ESPACEMENTS) {
  const c = calldataGetPool({ tokenA: USDC, tokenB: AAPLC, tickSpacing: ts });
  if (c.etat !== 'PRET') continue;
  let r;
  try { r = await appel('eth_call', [{ to: c.to, data: c.data }, 'latest']); } catch (_) { continue; }
  const a = '0x' + String(r).slice(-40);
  if (/^0x0{40}$/i.test(a)) continue;
  poolAero = a; tsAero = ts; break;
}
if (!ok('4. la pool USDC/AAPLc est RESOLUE sur la factory (pas supposee)', !!poolAero,
  'aucune des ' + ESPACEMENTS.length + ' espacements')) process.exit(1);
console.log('     pool ' + poolAero + '   tickSpacing ' + tsAero);

/* ── JAMBE 1 : OUSD -> USDC en Uniswap V4, avec le bareme degressif ────────────────────────── */
const sauts1 = [{ cle: CLE_OUSD_USDC,
  /* ⛔ DIRECTION DERIVEE, JAMAIS SUPPOSEE : on paie OUSD, donc zeroForOne vaut vrai seulement si
   *   OUSD est currency0. Ici currency0 est USDC, donc c est FAUX — et le coder `true` en dur
   *   ferait partir le swap a l envers. C est exactement le defaut corrige ce matin. */
  zeroForOne: CLE_OUSD_USDC.currency0.toLowerCase() === OUSD.toLowerCase() }];
const p1 = await planEchangeMultiSauts({ rpc, chaine: 8453, compte: ACHETEUR, sauts: sauts1,
  entree: OUSD, sortie: USDC, montant: CENT_OUSD, toleranceBps: 500n,
  fraisDevisesOk: new Set([OUSD.toLowerCase()]), decimalesEntree: 6, prixUsdEntree: 1 });
console.log('     jambe 1 : ' + p1.etat + (p1.pourquoi ? '  « ' + String(p1.pourquoi).slice(0, 110) + ' »' : ''));
if (p1.etat === 'APPROBATIONS') {
  await appel('anvil_impersonateAccount', [ACHETEUR]);
  for (const e of p1.etapes) {
    const h = await appel('eth_sendTransaction', [{ from: ACHETEUR, to: e.to, data: e.data, value: e.value }]);
    const r = await recu(h);
    ok('5. autorisation « ' + e.nom + ' »', r && r.status === '0x1', r && r.status);
  }
}
const p1b = p1.etat === 'APPROBATIONS'
  ? await planEchangeMultiSauts({ rpc, chaine: 8453, compte: ACHETEUR, sauts: sauts1,
    entree: OUSD, sortie: USDC, montant: CENT_OUSD, toleranceBps: 500n,
    fraisDevisesOk: new Set([OUSD.toLowerCase()]), decimalesEntree: 6, prixUsdEntree: 1 })
  : p1;
if (!ok('6. la jambe 1 est PRETE', p1b.etat === 'PRET',
  p1b.etat + ' ' + String(p1b.pourquoi || '').slice(0, 110))) {
  console.log(''); console.log(n + ' assertions, ' + ko + ' KO'); process.exit(1);
}
const minUsdc = BigInt(p1b.resume.recoitAuMoins);
console.log('     jambe 1 garantit au moins ' + minUsdc + ' unites USDC, frais '
  + p1b.resume.frais + ' (' + p1b.resume.fraisDevise + ', ' + p1b.resume.fraisBps + ' bps)');

/* ── LE LOT : jambe 1 + approve(USDC) + jambe 2 AVEC FRAIS ─────────────────────────────────── */
const horloge = BigInt(Math.floor(Date.now() / 1000));
const lot = planifierFranchissement({
  jambe1: { to: p1b.tx.to, data: p1b.tx.data, value: p1b.tx.value },
  pivot: USDC, action: AAPLC, tickSpacing: tsAero, recipient: ACHETEUR,
  deadline: horloge + 1200n, maintenant: horloge,
  minSortie1: minUsdc, entree2: minUsdc,
  /* ⛔ `minSortie2` est le minimum des POOLS, AVANT notre retenue. On le met bas pour que le banc
   *   teste le CHEMIN et pas la profondeur du marche du jour — mais il doit rester assez grand
   *   pour que `minUtilisateur` soit non nul apres 10 bps, sinon le constructeur refuse. */
  minSortie2: 100000n,
  poolResolue: poolAero,
  beneficiaireFrais: FEE_WALLET,
});
if (!ok('7. le lot est PRET', lot.etat === 'PRET', String(lot.pourquoi || '').slice(0, 130))) {
  console.log(''); console.log(n + ' assertions, ' + ko + ' KO'); process.exit(1);
}
ok('7b. le lot porte TROIS appels', lot.appels.length === 3, lot.appels.length);
ok('7c. le lot EXIGE l atomicite', lot.exigeAtomique === true);
/* ⛔⛔ LE FRAIS DE LA JAMBE 2 EST VERIFIE DANS LES OCTETS, pas dans le resume. */
ok('7d. le beneficiaire est NOMME dans le calldata de la jambe 2',
  String(lot.appels[2].data).toLowerCase().includes(String(FEE_WALLET).replace(/^0x/, '').toLowerCase()));
ok('7e. et le taux de la jambe 2 est celui du module',
  BigInt(lot.fraisBps) === FRAIS_INTERFACE_BPS_CL, lot.fraisBps);

/* ── EXECUTION : les trois appels, DANS L ORDRE ────────────────────────────────────────────── */
const avOusd = await solde(OUSD, ACHETEUR);
const avAapl = await solde(AAPLC, ACHETEUR);
const avFraisOusd = await solde(OUSD, FEE_WALLET);
const avFraisAapl = await solde(AAPLC, FEE_WALLET);

await appel('anvil_impersonateAccount', [ACHETEUR]);
let tousPasses = true;
for (const [i, a] of lot.appels.entries()) {
  let h;
  try {
    h = await appel('eth_sendTransaction', [{ from: ACHETEUR, to: a.to, data: a.data, value: a.value || '0x0' }]);
  } catch (e) {
    ok('8.' + (i + 1) + ' ' + a.role, false, String(e.message).slice(0, 120));
    tousPasses = false; break;
  }
  const r = await recu(h);
  /* ⛔⛔ UN RECU NON LU N EST PAS UN SUCCES, ET `status 0x0` NON PLUS. Un banc de ce depot a deja
   *   ete VERT sur une tx `status 0x0` : la condition est explicite ici. */
  if (!ok('8.' + (i + 1) + ' ' + a.role + ' (status 0x1)', !!r && r.status === '0x1',
    r ? r.status : 'recu non lu')) { tousPasses = false; break; }
}

const apOusd = await solde(OUSD, ACHETEUR);
const apAapl = await solde(AAPLC, ACHETEUR);
const apFraisOusd = await solde(OUSD, FEE_WALLET);
const apFraisAapl = await solde(AAPLC, FEE_WALLET);

console.log('');
console.log('=== CONDITION 3 : LES SOLDES ONT-ILS BOUGE ? ===');
console.log('  acheteur OUSD  ' + avOusd + ' -> ' + apOusd);
console.log('  acheteur AAPLc ' + avAapl + ' -> ' + apAapl);
console.log('  a6cf     OUSD  ' + avFraisOusd + ' -> ' + apFraisOusd);
console.log('  a6cf     AAPLc ' + avFraisAapl + ' -> ' + apFraisAapl);
console.log('');

if (tousPasses) {
  ok('9. l acheteur a DEPENSE exactement 100 OUSD', avOusd - apOusd === CENT_OUSD, avOusd - apOusd);
  ok('10. l acheteur a RECU de l AAPLc', apAapl > avAapl, apAapl - avAapl);
  /* ⭐⭐ LES DEUX LIGNES QUI PORTENT LA MISSION DE PHIL : un frais SUR CHAQUE TRANSACTION. */
  ok('11. a6cf a ete paye sur la JAMBE 1 (en OUSD)', apFraisOusd > avFraisOusd, apFraisOusd - avFraisOusd);
  ok('12. a6cf a ete paye sur la JAMBE 2 (en AAPLc)', apFraisAapl > avFraisAapl, apFraisAapl - avFraisAapl);
  /* ⛔ ET LE MONTANT DE LA JAMBE 1 EST EXACT, pas « positif » : 0,2 % de 100 OUSD = 200 000 unites
   *   (bareme degressif, palier bas, prix lu a 1 $). Un frais positif mais faux passerait une
   *   assertion « > 0 » sans qu on le voie. */
  ok('11b. et le frais de la jambe 1 vaut EXACTEMENT ce que le plan annonce',
    apFraisOusd - avFraisOusd === BigInt(p1b.resume.frais), (apFraisOusd - avFraisOusd) + ' vs ' + p1b.resume.frais);
} else {
  console.log('  ⛔ un appel a echoue : les conditions de solde ne sont PAS evaluees.');
  console.log('     Les declarer « non testees » est honnete ; les declarer vertes serait faux.');
}

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
console.log('⚠️ NON PROUVE ICI : l ATOMICITE. Les trois appels sont envoyes sequentiellement parce');
console.log('   qu Anvil ne simule pas EIP-5792. Sans atomicite reelle, la jambe 1 peut passer seule');
console.log('   et l acheteur garde du USDC au lieu de son action — d ou `exigeAtomique: true`.');
process.exit(ko ? 1 : 0);
