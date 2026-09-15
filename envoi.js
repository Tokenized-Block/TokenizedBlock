// envoi.js — faire signer un envoi par le wallet de l utilisateur. Cette page ne signe JAMAIS.
// ================================================================================================
// ⛔⛔ CE MODULE PREPARE, LE WALLET SIGNE, L UTILISATEUR DECIDE. Aucune cle n est detenue, aucune
//    n est demandee. `eth_sendTransaction` ouvre le wallet de l utilisateur, qui AFFICHE ce qu il
//    va signer ; rien ne part sans son geste. C est la propriete que ce produit vend depuis le
//    premier jour, et elle ne se donne pas « juste pour ce bouton ».
//
// ⛔ POURQUOI UN MODULE ET PAS UNE COPIE D `envoyerTx`. La fonction d envoi de `index.html` SIGNE
//    ET PAIE ; la regle interdit d y toucher. La recopier dans la nouvelle coque aurait cree le
//    jumeau qui diverge — le defaut exact qui a coute quatre approbations parties sur Sepolia :
//    la garde de chaine existait dans un ecran et pas dans l autre. Ce module reprend la MEME
//    discipline, ecrite une fois, testee, et surveillee par la regle 8.
//
// ⚠️ CE QUE CE MODULE NE FAIT PAS : il ne choisit ni le montant, ni le destinataire, ni le jeton. Il
//    refuse ce qui est mal forme et ne corrige rien — une saisie « reparee » en silence est une
//    saisie qu on n a pas faite.
import { selecteur } from './pool.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const ADRESSE = /^0x[0-9a-fA-F]{40}$/;
const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Le calldata d un `transfer(address,uint256)`.
 * ⛔ REFUSE, NE REPARE PAS. Une adresse mal formee ou un montant hors bornes leve une erreur : un
 *    encodeur qui tronquerait ou completerait enverrait des fonds a une adresse que personne n a
 *    tapee.
 */
export function encodeTransfer(destinataire, montant) {
  if (!ADRESSE.test(String(destinataire || ''))) throw new Error('destination is not an address');
  if (typeof montant !== 'bigint' || montant < 0n || montant > MAX_UINT256) {
    throw new Error('amount must be a bigint within uint256');
  }
  return '0x' + selecteur('transfer(address,uint256)')
    + destinataire.slice(2).toLowerCase().padStart(64, '0')
    + montant.toString(16).padStart(64, '0');
}

/**
 * L utilisateur a-t-il dit non ?
 * ⛔ REPRIS A L IDENTIQUE de `index.html` (code EIP-1193 4001 + les formulations des wallets). Un
 *    refus n est pas une panne : il ne se reessaie pas et ne se gronde pas.
 */
export function estRefusUtilisateur(e) {
  return !!(e && (e.code === 4001 || /user (rejected|denied)|reject(ed)? the request/i.test(String(e.message || e))));
}

/**
 * Le wallet est-il sur la chaine ET le compte que la page a prepares ?
 *
 * ⛔⛔ LE COMPTE EST RELU MEME QUAND LA CHAINE EST LA BONNE. Avant 2026-09-07, la garde de
 *    `index.html` rendait `true` des que la chaine collait, sans relire `eth_accounts` : un
 *    changement de compte entre la preparation et la signature laissait partir un envoi prepare
 *    pour une autre identite. Meme lecon ici, des la premiere version.
 * ⛔ UNE LECTURE IMPOSSIBLE REFUSE. « Je n ai pas pu verifier » ne vaut jamais « c est bon ».
 */
export async function gardeChaineEtCompte({ eth, chaineAttendue, compteAttendu }) {
  let id;
  try { id = parseInt(await eth.request({ method: 'eth_chainId' }), 16); }
  catch (e) { return { ok: false, etat: 'CHAINE_ILLISIBLE', pourquoi: 'could not read your wallet network — nothing was sent' }; }
  if (id !== chaineAttendue) {
    return { ok: false, etat: 'MAUVAISE_CHAINE', chaineWallet: id,
      pourquoi: 'your wallet is on chain ' + id + ', this page prepared chain ' + chaineAttendue + ' — nothing was sent' };
  }
  let a = null;
  try { const accs = await eth.request({ method: 'eth_accounts' }); a = (accs && accs[0]) || null; }
  catch (e) { return { ok: false, etat: 'COMPTE_ILLISIBLE', pourquoi: 'could not read your wallet account — nothing was sent' }; }
  if (!a || !compteAttendu || a.toLowerCase() !== String(compteAttendu).toLowerCase()) {
    return { ok: false, etat: 'AUTRE_COMPTE', compteWallet: a,
      pourquoi: 'your wallet account is not the one this page prepared for — nothing was sent' };
  }
  return { ok: true, etat: 'OK' };
}

/**
 * Faire signer un envoi par le wallet, puis relire la chaine au lieu de supposer.
 *
 * ⛔ L ORDRE EST LA SECURITE : adresse valide → garde chaine ET compte → estimation du gas → envoi
 *    avec une limite EXPLICITE → recu relu. Sauter l estimation laisse le wallet plafonner et
 *    tomber en panne de gas sur la chaine — deja paye dans ce depot avant la PR #7.
 * ⛔ UN ENVOI ACCEPTE N EST PAS UN ENVOI REUSSI. On attend le recu ; un `status` different de 0x1
 *    est un echec, et « gasUsed == limite » se dit comme une panne de gas probable.
 *
 * @returns {Promise<{etat: string, hash?: string, gaz?: bigint, horsGaz?: boolean, pourquoi?: string}>}
 */
export async function envoyerDepuisWallet({ eth, rpc, chaineAttendue, compte, to, data = '0x',
  value = '0x0', attendre = true, delai = 2000, essais = 30 }) {
  if (!ADRESSE.test(String(to || ''))) {
    return { etat: 'DESTINATION_INVALIDE', pourquoi: 'the destination is not an address — nothing was sent' };
  }
  const garde = await gardeChaineEtCompte({ eth, chaineAttendue, compteAttendu: compte });
  if (!garde.ok) return { etat: garde.etat, pourquoi: garde.pourquoi };

  /* tip 2345: HARD BUG for "works for us, not others" — box Rabby still opens Sign when
   * node estimateGas/sim fails; old app returned ESTIMATION_IMPOSSIBLE and never opened the wallet.
   * Prefer estimate; on failure use a ceiling so the USER wallet decides (same as smoke path). */
  let estimation;
  let estimateFallback = false;
  try { estimation = BigInt(await rpc('eth_estimateGas', [{ from: compte, to, data, value }])); }
  catch (e) {
    estimateFallback = true;
    const dataStr = String(data || '0x').toLowerCase();
    const plainEth = dataStr === '0x' || dataStr === '0x0';
    const createPaid = dataStr.startsWith('0x1d03fb54');
    if (plainEth) estimation = 65000n;
    else if (createPaid) estimation = 450000n; /* measured ~305k createPaid Base */
    else estimation = 900000n; /* v4 swap / Launch ceiling */
  }
  const gaz = estimation * 125n / 100n;

  let hash;
  try {
    hash = await eth.request({ method: 'eth_sendTransaction',
      params: [{ from: compte, to, value, data, gas: '0x' + gaz.toString(16) }] });
  } catch (e) {
    if (estRefusUtilisateur(e)) return { etat: 'REFUSE_PAR_UTILISATEUR', pourquoi: 'you declined in your wallet — nothing was sent' };
    return { etat: 'ECHEC_ENVOI', pourquoi: 'the send failed — check your wallet before retrying. ' + String((e && e.message) || e) };
  }
  if (!attendre) return { etat: 'ENVOYE', hash, gaz };

  let recu = null;
  for (let i = 0; i < essais; i++) {
    await pause(delai);
    recu = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null);
    if (recu) break;
  }
  if (!recu) return { etat: 'EN_ATTENTE', hash, gaz, pourquoi: 'sent, not confirmed yet — do not resend' };
  if (recu.status !== '0x1') {
    const utilise = recu.gasUsed != null ? BigInt(recu.gasUsed) : null;
    return { etat: 'ANNULE_SUR_CHAINE', hash, gaz, horsGaz: utilise !== null && utilise === gaz,
      pourquoi: 'the transaction reverted on chain' };
  }
  return { etat: 'CONFIRME', hash, gaz };
}
