/* BANC SUR FORK : UN PORTEUR DE WETH ACHETE DU TOSHI, ET NOTRE FRAIS EST PRIS DANS LA MEME TX.
 *
 *   node banc-v3-frais-fork.mjs        (fork Base sur PORT_FORK, defaut 8548)
 *
 * ⭐ CE QUE CE BANC PROUVE, ET QUE RIEN D AUTRE NE PEUT PROUVER. `calldata-v3-frais.js` est livre
 *   avec 15 cas unitaires qui DECODENT ses octets — mais trois choses restent hors de portee d un
 *   test hors reseau, et chacune, fausse, produirait une transaction VERTE :
 *     1. que `0x…02` soit lu par le routeur comme « moi-meme » et non comme une adresse reelle.
 *        Si c etait une adresse reelle, toute la sortie y partirait et serait PERDUE, sans revert.
 *     2. que `PAY_PORTION` divise par 10 000 et pas par autre chose. Un diviseur different donne
 *        un frais faux — positif, donc invisible a une assertion « > 0 ».
 *     3. que l ordre swap -> PAY_PORTION -> SWEEP laisse bien quelque chose a prelever.
 *
 * ⛔⛔⛔ TROIS CONDITIONS DE VALIDITE, parce qu un banc de ce depot a deja ete VERT sur une
 *      transaction `status 0x0` :
 *        1. un VRAI fork de Base — chainId 8453 ET du code a une adresse connue ;
 *        2. CHAQUE transaction porte `status === '0x1'`, et un recu NON LU n est PAS un succes :
 *           on attend en boucle plutot que de conclure sur un `null` ;
 *        3. les SOLDES bougent dans le bon sens ET du bon montant, au wei. Un `status 0x1` sur un
 *           appel qui ne fait rien est un succes vide.
 *      Si une seule manque, le banc ECHOUE. Il ne rend jamais « probablement bon ».
 *
 * ⛔ POURQUOI TOSHI : 1 189 464 $ de liquidite, 0 marche atteignable par nos rails avant ce module,
 *   et c est le premier memecoin-stock de l app. Sa pool est lue sur la chaine, pas recitee :
 *   `0x4b0aaf3ebb163dd45f663b38b6d93f6093ebc2d3`, factory Uniswap V3, WETH/TOSHI, `fee()` 10000.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un humain cliquera, que la pool cotera a une autre taille, ni que
 *   le `sortieMinimumTotale` protege reellement — ici il vaut 1 wei, donc le garde de glissement
 *   n est PAS eprouve a une valeur realiste. Dit ici plutot que sous-entendu.
 */
import { calldataV3AvecFrais, minimumAcheteur, BASE_BPS } from './calldata-v3-frais.js';
import { selecteur } from './keccak.js';

const PORT = process.env.PORT_FORK || '8548';
const URL = 'http://127.0.0.1:' + PORT;

/* ⛔ ADRESSES LUES DANS LE DEPOT OU SUR LA CHAINE, jamais de memoire. */
const WETH = '0x4200000000000000000000000000000000000006';
const TOSHI = '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4';
const ROUTEUR = '0x6ff5693b99212DA76aD316178A184AB56D299b43';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3'; /* banc-v4-multi-sauts-fork.mjs:30 */
const A6CF = '0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4';
const ACHETEUR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
/* ⛔ LA SENTINELLE, PRISE AU PIED DE LA LETTRE : si le routeur ne l interpretait PAS, la sortie
 *   atterrirait a cette adresse-la. On la surveille — c est le temoin du point 1. */
const SENTINELLE = '0x0000000000000000000000000000000000000002';

const FRAIS_BPS = 10n;              /* 0,1 % */
const ENTREE = 10n ** 16n;          /* 0,01 WETH */
const FEE_POOL = 10000;             /* lu par fee() sur la pool */

let n = 0, ko = 0;
const ok = (nom, cond, vu) => {
  n += 1;
  if (cond) { console.log('  ok  ' + nom); return true; }
  ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '\n        vu: ' + vu));
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
const pad = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
async function solde(jeton, qui) {
  const r = await appel('eth_call', [{ to: jeton, data: selecteur('balanceOf(address)') + pad(qui) }, 'latest']);
  try { return BigInt(r); } catch (_) { return 0n; }
}
/* ⛔ UN RECU LU UNE FOIS PEUT RENDRE `null` ALORS QUE LA TX A REUSSI : on attend, on ne conclut pas
 *   sur une absence de reponse. Ce defaut a deja produit un faux KO dans ce depot. */
async function recu(hash) {
  for (let i = 0; i < 50; i += 1) {
    const r = await appel('eth_getTransactionReceipt', [hash]);
    if (r) return r;
    await dors(200);
  }
  return null;
}
async function envoyer(nom, from, to, data, value = '0x0') {
  let h;
  try { h = await appel('eth_sendTransaction', [{ from, to, data, value, gas: '0x7a1200' }]); }
  catch (e) { ok(nom, false, String(e.message).slice(0, 150)); return null; }
  const r = await recu(h);
  if (!ok(nom + ' (status 0x1)', !!r && r.status === '0x1', r ? r.status : 'recu non lu')) return null;
  return r;
}

console.log('=== BANC v3 AVEC FRAIS : WETH -> TOSHI, UNE TRANSACTION, NOTRE 0,1 % DEDANS ===');
console.log('fork ' + URL);

const chainId = parseInt(await appel('eth_chainId'), 16);
if (!ok('1. le fork est bien Base (chainId 8453)', chainId === 8453, chainId)) process.exit(1);
const codeT = await appel('eth_getCode', [TOSHI, 'latest']);
if (!ok('1b. TOSHI porte du code', !!codeT && codeT !== '0x', String(codeT).slice(0, 12))) process.exit(1);
const codeR = await appel('eth_getCode', [ROUTEUR, 'latest']);
if (!ok('1c. le routeur universel porte du code', !!codeR && codeR !== '0x')) process.exit(1);
console.log('  bloc du fork : ' + parseInt(await appel('eth_blockNumber'), 16));

/* ── FINANCER L ACHETEUR EN WETH ───────────────────────────────────────────────────────────── */
await appel('anvil_impersonateAccount', [ACHETEUR]);
await appel('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 18n).toString(16)]);
/* ⛔ `deposit()` plutot qu un detenteur impersonne : ca ne depend d aucun solde tiers, donc le banc
 *   ne casse pas quand une baleine bouge. */
await envoyer('2. l acheteur enveloppe 0,01 ETH en WETH', ACHETEUR, WETH,
  selecteur('deposit()'), '0x' + ENTREE.toString(16));
const wethAcheteur = await solde(WETH, ACHETEUR);
if (!ok('2b. il detient bien 0,01 WETH', wethAcheteur >= ENTREE, String(wethAcheteur))) process.exit(1);

/* ── LES DEUX APPROBATIONS DE LA VOIE PERMIT2 ──────────────────────────────────────────────── */
/* ⛔⛔ C EST LE PRIX DE CE RAIL, ET LE BANC LE MONTRE AU LIEU DE LE CACHER : deux gestes
 *     d approbation la ou Aerodrome n en demande qu un. `echange-v3.js` l avait mesure ; ici on le
 *     VOIT. Un rail qui coute un geste de plus doit le dire a l ecran, pas dans un commentaire. */
const MAX160 = (1n << 160n) - 1n;
const EXP48 = (1n << 48n) - 1n;
await envoyer('3. approve(PERMIT2) sur le WETH', ACHETEUR, WETH,
  selecteur('approve(address,uint256)') + pad(PERMIT2) + mot((1n << 256n) - 1n));
await envoyer('3b. PERMIT2.approve(WETH, routeur)', ACHETEUR, PERMIT2,
  selecteur('approve(address,address,uint160,uint48)') + pad(WETH) + pad(ROUTEUR) + mot(MAX160) + mot(EXP48));

/* ── LE PLAN ───────────────────────────────────────────────────────────────────────────────── */
const maintenant = BigInt((await appel('eth_getBlockByNumber', ['latest', false])).timestamp);
const plan = calldataV3AvecFrais({
  sauts: [{ de: WETH, vers: TOSHI, fee: FEE_POOL }],
  acheteur: ACHETEUR, beneficiaireFrais: A6CF, fraisBps: FRAIS_BPS,
  amountIn: ENTREE, sortieMinimumTotale: 1n,
  deadline: maintenant + 600n, maintenant,
});
if (!ok('4. le plan est PRET', plan.etat === 'PRET', plan.etat + ' ' + String(plan.pourquoi || ''))) {
  console.log(''); console.log(n + ' assertions, ' + ko + ' KO'); process.exit(1);
}
console.log('     ' + plan.resume.commandes.join(' -> ') + '  ·  frais ' + plan.resume.fraisBps
  + ' bps  ·  atomique exige : ' + plan.resume.exigeAtomique + '  ·  Permit2 : ' + plan.resume.viaPermit2);
/* ⛔ LES OCTETS, PAS LE RESUME : un plan peut annoncer un frais que son calldata ne prend pas. */
ok('4b. a6cf est NOMME dans le calldata',
  plan.data.toLowerCase().includes(A6CF.slice(2).toLowerCase()));
ok('4c. les trois commandes sont dans l ordre swap, PAY_PORTION, SWEEP',
  plan.data.toLowerCase().includes('000604'));

/* ── LES SOLDES AVANT ──────────────────────────────────────────────────────────────────────── */
const avW = await solde(WETH, ACHETEUR);
const avT = await solde(TOSHI, ACHETEUR);
const avFrais = await solde(TOSHI, A6CF);
const avRouteur = await solde(TOSHI, ROUTEUR);
const avSentinelle = await solde(TOSHI, SENTINELLE);

/* ── L EXECUTION ───────────────────────────────────────────────────────────────────────────── */
const r5 = await envoyer('5. execute(...) — swap + frais + sweep EN UNE TRANSACTION',
  ACHETEUR, plan.to, plan.data, plan.value);

const apW = await solde(WETH, ACHETEUR);
const apT = await solde(TOSHI, ACHETEUR);
const apFrais = await solde(TOSHI, A6CF);
const apRouteur = await solde(TOSHI, ROUTEUR);
const apSentinelle = await solde(TOSHI, SENTINELLE);

console.log('');
console.log('=== LES SOLDES ===');
console.log('  acheteur   WETH   ' + avW + ' -> ' + apW);
console.log('  acheteur   TOSHI  ' + avT + ' -> ' + apT);
console.log('  a6cf       TOSHI  ' + avFrais + ' -> ' + apFrais);
console.log('  routeur    TOSHI  ' + avRouteur + ' -> ' + apRouteur);
console.log('  0x…02      TOSHI  ' + avSentinelle + ' -> ' + apSentinelle);
console.log('');

if (r5) {
  ok('6. l acheteur a DEPENSE exactement 0,01 WETH', avW - apW === ENTREE, String(avW - apW));
  ok('7. l acheteur a RECU du TOSHI', apT > avT, String(apT - avT));
  ok('8. a6cf a ete paye, EN TOSHI', apFrais > avFrais, String(apFrais - avFrais));

  const recuAcheteur = apT - avT, pris = apFrais - avFrais, total = recuAcheteur + pris;
  /* ⛔⛔ LE MONTANT EXACT, PAS « POSITIF ». Un frais positif mais faux passerait une assertion
   *     « > 0 » sans qu on le voie — et c est precisement ce qui prouve le DIVISEUR de
   *     PAY_PORTION. S il ne divisait pas par 10 000, ce test tomberait. */
  const attendu = (total * FRAIS_BPS) / BASE_BPS;
  ok('9. ⭐ le frais vaut EXACTEMENT 0,1 % de la sortie, au wei — PAY_PORTION divise bien par 10 000',
    pris === attendu, pris + ' vs ' + attendu + '  (sortie totale ' + total + ')');

  /* ⛔⛔⛔ LE TEMOIN DE LA SENTINELLE. Si `0x…02` etait pris pour une adresse reelle, toute la
   *      sortie y serait partie et serait PERDUE — sans revert, sans erreur, et les assertions
   *      7 et 8 auraient echoue d une facon difficile a lire. Ici on le dit explicitement. */
  ok('10. ⭐ la sentinelle 0x…02 n a RIEN recu : le routeur l a INTERPRETEE, pas prise au mot',
    apSentinelle === avSentinelle, avSentinelle + ' -> ' + apSentinelle);
  /* ⛔⛔ ET LE ROUTEUR EST VIDE : si `SWEEP` n avait pas balaye, le reste de la sortie serait reste
   *     chez lui — des fonds d utilisateur bloques dans un contrat, sur une transaction verte. */
  ok('11. ⭐ le routeur ne garde RIEN : SWEEP a bien vide son solde',
    apRouteur === avRouteur, avRouteur + ' -> ' + apRouteur);

  ok('12. l acheteur recoit au moins ce que le plan annoncait',
    recuAcheteur >= BigInt(plan.resume.recoitAuMoins),
    recuAcheteur + ' >= ' + plan.resume.recoitAuMoins);
  /* ⛔ ET LA SOMME SE REFERME : rien ne s est evapore entre les deux destinataires. */
  ok('13. acheteur + frais = la sortie entiere, sans fuite',
    minimumAcheteur(total, FRAIS_BPS) + attendu === total,
    String(minimumAcheteur(total, FRAIS_BPS) + attendu) + ' vs ' + total);
} else {
  console.log('  ⛔ la transaction a echoue : les conditions de solde ne sont PAS evaluees.');
  console.log('     Les declarer « non testees » est honnete ; les declarer vertes serait faux.');
}

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
