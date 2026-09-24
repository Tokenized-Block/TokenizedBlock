/* test-verif-paiement.mjs — ON NE RECONNAIT UN PAIEMENT QUE SI LA CHAINE LE MONTRE.
 *
 * ⛔⛔ CE QUE CE MODULE REMPLACE. Le bouton « Mark pay recognized » ecrivait un evenement
 *     `signeParUtilisateur: true` SANS hash, SANS montant, SANS destinataire. L app affirmait
 *     qu un paiement avait eu lieu alors que rien n avait bouge. Ce fichier existe pour que cette
 *     affirmation ne puisse plus etre faite sans preuve.
 *
 * ⛔ LA CHAINE EST INJECTEE : chaque mode d echec est donc exercable, y compris ceux qu on ne
 *   verrait jamais en production avant qu ils ne coutent cher (tx qui reverte, log falsifie,
 *   panne de lecture). Un verificateur dont on ne peut pas tester les refus n est pas un
 *   verificateur.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que le rail encaisse. Aucun appel reel, 0 $ verifie sur Base.
 *    Il prouve que la LOGIQUE refuse tout ce qui n est pas un paiement demontre.
 */
import { strict as assert } from 'node:assert';
import { verifierPaiement, USDC_BASE, CONFIRMATIONS_MIN, ACTIFS_PAIEMENT } from './verif-paiement.js';

let n = 0;
const v = (nom, fn) => { fn(); n++; };
const va = async (nom, fn) => { await fn(); n++; };

const PAYEUR = '0x1111111111111111111111111111111111111111';
const SINK = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const HASH = '0x' + 'a'.repeat(64);
const SIG_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const mot = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
const hex = (n) => '0x' + BigInt(n).toString(16);

/* une chaine simulee : on decrit ce que le noeud repond, et rien d autre */
function chaine({ tx, recu, tete = 1000 }) {
  return async (m) => {
    if (m === 'eth_getTransactionByHash') return tx;
    if (m === 'eth_getTransactionReceipt') return recu;
    if (m === 'eth_blockNumber') return hex(tete);
    throw new Error('methode non simulee : ' + m);
  };
}
const txEth = (over = {}) => ({ from: PAYEUR, to: SINK, value: hex(1000n), ...over });
const recuOk = (over = {}) => ({ status: '0x1', blockNumber: hex(900), logs: [], ...over });

/* ───────── ce qui est refuse avant meme de lire la chaine ───────── */

await va('sans lecteur de chaine, on REFUSE au lieu de supposer', async () => {
  const r = await verifierPaiement({ txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'ETH', montantMin: 1n });
  assert.equal(r.etat, 'REFUSE');
});

await va('un hash absent ou tronque est refuse', async () => {
  /* ⛔ `never-complete-a-hash` : on exige les 64 hex entiers, on ne complete jamais. */
  for (const mauvais of [undefined, null, '', '0x', '0xabc', '0x' + 'a'.repeat(63), '0x' + 'a'.repeat(65), 'pas-un-hash']) {
    const r = await verifierPaiement({ rpc: chaine({ tx: txEth(), recu: recuOk() }),
      txHash: mauvais, payeur: PAYEUR, destinataire: SINK, actif: 'ETH', montantMin: 1n });
    assert.equal(r.etat, 'REFUSE', 'hash accepte : ' + String(mauvais));
  }
});

await va('⛔ un montant de ZERO n est pas un paiement', async () => {
  /* ⛔⛔ C EST LITTERALEMENT CE QUE FAISAIT L ANCIEN CHEMIN : reconnaitre un paiement sans montant.
   *     `Number(null) === 0` et un `montantMin` de 0 rendraient VRAI n importe quelle transaction. */
  for (const zero of [0n, 0, '0', -5n]) {
    const r = await verifierPaiement({ rpc: chaine({ tx: txEth(), recu: recuOk() }),
      txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'ETH', montantMin: zero });
    assert.equal(r.etat, 'REFUSE', 'montant ' + String(zero) + ' accepte');
    assert.match(r.pourquoi, /zero is not a payment|not a whole number/i);
  }
});

await va('un actif inconnu est refuse, jamais devine', async () => {
  for (const a of ['BTC', 'EURC', '', 'eth ', null]) {
    const r = await verifierPaiement({ rpc: chaine({ tx: txEth(), recu: recuOk() }),
      txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: a, montantMin: 1n });
    assert.equal(r.etat, 'REFUSE', 'actif accepte : ' + String(a));
  }
  assert.deepEqual([...ACTIFS_PAIEMENT], ['ETH', 'USDC']);
});

/* ───────── ce que la chaine dit ───────── */

await va('une transaction introuvable ne devient jamais un paiement', async () => {
  const r = await verifierPaiement({ rpc: chaine({ tx: null, recu: null }),
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'ETH', montantMin: 1n });
  assert.equal(r.etat, 'INTROUVABLE');
});

await va('⛔⛔ une transaction signee par QUELQU UN D AUTRE n est pas votre paiement', async () => {
  /* ⛔⛔ LE CONTROLE CENTRAL, et la regle qui l impose : UN EVENEMENT N EST PAS UNE TRANSACTION.
   *     N importe qui peut pointer le hash d un paiement fait par un tiers. Seul `tx.from` dit qui
   *     a signe. Sans ce cas, il suffirait de copier le hash de n importe quel virement vers le
   *     wallet de frais pour se faire reconnaitre un paiement. */
  const r = await verifierPaiement({ rpc: chaine({ tx: txEth({ from: '0x' + '9'.repeat(40) }), recu: recuOk() }),
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'ETH', montantMin: 1n });
  assert.equal(r.etat, 'MAUVAIS_PAYEUR');
});

await va('⛔ une transaction qui a REVERTE ne paie rien, meme si son hash existe', async () => {
  /* ⛔⛔ `fork-rig-trois-conditions` : « le hash existe » a deja donne un VERT sur une tx status 0x0.
   *     Une transaction incluse peut avoir echoue ; le hash, lui, existe toujours. */
  const r = await verifierPaiement({ rpc: chaine({ tx: txEth(), recu: recuOk({ status: '0x0' }) }),
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'ETH', montantMin: 1n });
  assert.equal(r.etat, 'ECHOUEE');
});

await va('une transaction trop recente attend, elle n est pas refusee a tort', async () => {
  /* ⛔ TROIS ETATS : payee · pas payee · pas encore sure. Confondre le troisieme avec le deuxieme
   *   ferait refuser un paiement reel. */
  const r = await verifierPaiement({ rpc: chaine({ tx: txEth(), recu: recuOk({ blockNumber: hex(998) }), tete: 1000 }),
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'ETH', montantMin: 1n });
  assert.equal(r.etat, 'TROP_RECENTE');
  assert.ok(r.confirmations < CONFIRMATIONS_MIN);
  assert.notEqual(r.etat, 'INTROUVABLE', 'une tx recente a ete confondue avec une tx inexistante');
});

await va('sans recu, on dit TROP_RECENTE — pas « introuvable »', async () => {
  const r = await verifierPaiement({ rpc: chaine({ tx: txEth(), recu: null }),
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'ETH', montantMin: 1n });
  assert.equal(r.etat, 'TROP_RECENTE');
});

await va('une panne de lecture donne NON_MESURE, jamais un refus de paiement', async () => {
  /* ⛔ `absence-of-evidence-vs-failure-to-look`. Un noeud sature ne doit pas faire perdre son
   *   paiement a quelqu un qui a vraiment paye. */
  const r = await verifierPaiement({ rpc: async () => { throw new Error('socket hang up'); },
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'ETH', montantMin: 1n });
  assert.equal(r.etat, 'NON_MESURE');
  assert.notEqual(r.etat, 'INTROUVABLE');
});

/* ───────── ETH ───────── */

await va('ETH : payer la mauvaise adresse ne compte pas', async () => {
  const r = await verifierPaiement({ rpc: chaine({ tx: txEth({ to: '0x' + '7'.repeat(40) }), recu: recuOk() }),
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'ETH', montantMin: 1n });
  assert.equal(r.etat, 'MAUVAIS_DESTINATAIRE');
});

await va('ETH : payer MOINS que demande est dit, avec les deux montants', async () => {
  const r = await verifierPaiement({ rpc: chaine({ tx: txEth({ value: hex(999n) }), recu: recuOk() }),
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'ETH', montantMin: 1000n });
  assert.equal(r.etat, 'INSUFFISANT');
  assert.equal(r.paye, '999');
  assert.equal(r.attendu, '1000', 'le montant attendu n est pas rendu : impossible de savoir combien il manque');
});

await va('ETH : un paiement reel est reconnu, avec sa reserve', async () => {
  const r = await verifierPaiement({ rpc: chaine({ tx: txEth({ value: hex(1500n) }), recu: recuOk() }),
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'ETH', montantMin: 1000n });
  assert.equal(r.etat, 'PAYE');
  assert.equal(r.paye, '1500');
  assert.ok(r.confirmations >= CONFIRMATIONS_MIN);
  /* ⛔ la reserve voyage avec le verdict : 12 confirmations est un CHOIX, pas une finalite. */
  assert.match(r.reserve, /not finality/i, 'le verdict ne dit plus que le seuil est un choix');
});

/* ───────── USDC ───────── */

const logUsdc = (de, a, montant, contrat = USDC_BASE) => ({
  address: contrat, topics: [SIG_TRANSFER, mot(de), mot(a)], data: hex(montant),
});

await va('⛔⛔ TEMOIN NEGATIF : un jeton qui IMITE USDC ne compte pas', async () => {
  /* ⛔⛔ LE CAS QUI PROTEGE LE PLUS D ARGENT. N importe qui peut deployer un contrat nomme « USDC »
   *     et emettre exactement les memes `Transfer`. Sans ce cas, un faux jeton sans valeur
   *     passerait pour un paiement — et c est gratuit a fabriquer. */
  const faux = '0x' + 'f'.repeat(40);
  const r = await verifierPaiement({
    rpc: chaine({ tx: txEth({ to: faux, value: '0x0' }), recu: recuOk({ logs: [logUsdc(PAYEUR, SINK, 1_000_000n, faux)] }) }),
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'USDC', montantMin: 1n });
  assert.equal(r.etat, 'MAUVAIS_DESTINATAIRE');
  assert.match(r.pourquoi, /merely calls itself USDC/i);
});

await va('USDC : un transfert vers quelqu un d autre ne compte pas', async () => {
  const autre = '0x' + '8'.repeat(40);
  const r = await verifierPaiement({
    rpc: chaine({ tx: txEth({ value: '0x0' }), recu: recuOk({ logs: [logUsdc(PAYEUR, autre, 5_000_000n)] }) }),
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'USDC', montantMin: 1n });
  assert.equal(r.etat, 'INSUFFISANT', 'un transfert vers un tiers a ete compte comme paiement');
  assert.equal(r.paye, '0');
});

await va('USDC : plusieurs transferts vers le destinataire s ADDITIONNENT', async () => {
  /* ⛔ Une transaction peut payer en plusieurs mouvements. Ne lire que le premier sous-compterait
   *   et refuserait un paiement complet. */
  const r = await verifierPaiement({
    rpc: chaine({ tx: txEth({ value: '0x0' }),
      recu: recuOk({ logs: [logUsdc(PAYEUR, SINK, 400_000n), logUsdc(PAYEUR, SINK, 600_000n)] }) }),
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'USDC', montantMin: 1_000_000n });
  assert.equal(r.etat, 'PAYE');
  assert.equal(r.paye, '1000000');
});

await va('USDC : un paiement passe par un contrat reste valable si c est LUI qui a signe', async () => {
  /* ⛔ On n exige pas que l expediteur du log soit le payeur : un paiement peut transiter par un
   *   contrat qu il a appele. Ce qui est exige, c est qu il ait signe la TRANSACTION — deja
   *   verifie par tx.from. Exiger les deux refuserait des paiements parfaitement reels. */
  const routeur = '0x' + '5'.repeat(40);
  const r = await verifierPaiement({
    rpc: chaine({ tx: txEth({ to: routeur, value: '0x0' }),
      recu: recuOk({ logs: [logUsdc(routeur, SINK, 2_000_000n)] }) }),
    txHash: HASH, payeur: PAYEUR, destinataire: SINK, actif: 'USDC', montantMin: 1_000_000n });
  assert.equal(r.etat, 'PAYE');
});

assert.equal(n, 17, 'compte de cas inattendu : ' + n);
console.log('ok verif-paiement — ' + n + ' cas : tx.from verifie, revert refuse, faux USDC refuse,');
console.log('   panne distinguee d un non-paiement, montants additionnes.');
console.log('⚠️ NE PROUVE PAS que le rail encaisse : aucun appel reel, 0 $ verifie sur Base.');
