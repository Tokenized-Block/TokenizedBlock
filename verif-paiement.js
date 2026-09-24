/* verif-paiement.js — UN PAIEMENT EST UNE TRANSACTION, PAS UNE CASE COCHEE.
 *
 * ⛔⛔ CE QU IL Y AVAIT AVANT, ET POURQUOI C ETAIT INDEFENDABLE. Le bouton « Mark pay recognized »
 *     appelait `recordPay({ proposeId, asset: 'ETH' })` — sans montant, sans hash, sans
 *     destinataire — et l evenement ecrit portait `signeParUtilisateur: true`. Autrement dit :
 *     l application affirmait qu un paiement avait eu lieu alors que RIEN n avait ete verifie, et
 *     qu aucun centime n avait bouge. Le seul controle existant testait la FORME du hash quand il
 *     etait fourni (64 hex), et il n etait jamais fourni.
 *
 * ⛔⛔ LA REGLE QUI GOUVERNE CE FICHIER : UN EVENEMENT N EST PAS UNE TRANSACTION. N importe quel
 *     contrat peut emettre un `Transfer` nommant qui il veut ; deux faux ont deja ete pris pour
 *     vrais dans ce projet. On ne croit donc jamais un log seul : on va chercher la TRANSACTION,
 *     et on verifie que `tx.from` est bien celui qui pretend avoir paye.
 *
 * ⛔ AUCUNE SIGNATURE, AUCUNE CLE : tout ici est en LECTURE. C est precisement ce qui rend ce rail
 *   constructible et prouvable sans geste humain.
 *
 * ⛔⛔ LA BORNE QU IL FAUT DIRE AVANT QUE QUELQU UN NE S APPUIE DESSUS : verifier depuis le
 *     NAVIGATEUR prouve qu un paiement existe, mais n ouvre aucun droit. Le registre local se vide,
 *     se modifie, se fabrique. Une reconnaissance cote client est un CONFORT d interface — jamais
 *     un titre a un service payant. Pour qu un paiement donne droit a quelque chose, c est le
 *     SERVEUR qui doit verifier, avec ce meme module.
 */

/** Les seuls actifs que ce verificateur sait suivre. ⛔ Un actif non liste est REFUSE, pas devine. */
export const ACTIFS_PAIEMENT = Object.freeze(['ETH', 'USDC']);

/* ⛔ L USDC de Base, adresse ENTIERE. Un log `Transfer` n est croyable que s il vient du VRAI
 *   contrat : n importe qui peut deployer un jeton nomme « USDC » et emettre les memes evenements. */
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SIG_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/* ⛔ Une transaction incluse peut encore etre reorganisee. Douze blocs sur Base (~24 s) est un
 *   compromis assume, pas une certitude : il est NOMME dans la reponse pour que personne ne le
 *   prenne pour une finalite. */
export const CONFIRMATIONS_MIN = 12;

const ADR = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const motAdr = (h) => '0x' + String(h).slice(-40).toLowerCase();

/**
 * Verifie qu une transaction a REELLEMENT paye `destinataire`.
 *
 * @param {object} o
 * @param {(m:string,p:any[])=>Promise<any>} o.rpc  lecteur JSON-RPC (injecte : testable)
 * @param {string} o.txHash        le hash a verifier
 * @param {string} o.payeur        qui pretend avoir paye — compare a tx.from
 * @param {string} o.destinataire  qui doit avoir recu
 * @param {string} o.actif         'ETH' ou 'USDC'
 * @param {bigint} o.montantMin    le minimum attendu, en unites de l actif
 * @returns {Promise<{etat:string, pourquoi?:string, ...}>}
 *   PAYE · INSUFFISANT · MAUVAIS_PAYEUR · MAUVAIS_DESTINATAIRE · ECHOUEE · TROP_RECENTE ·
 *   INTROUVABLE · REFUSE · NON_MESURE
 */
export async function verifierPaiement({ rpc, txHash, payeur, destinataire, actif, montantMin } = {}) {
  /* ── ce qu on refuse AVANT de toucher au reseau ─────────────────────────────────────────── */
  if (typeof rpc !== 'function') return { etat: 'REFUSE', pourquoi: 'no chain reader provided' };
  if (!HASH.test(String(txHash || ''))) {
    return { etat: 'REFUSE', pourquoi: 'a whole transaction hash is required — nothing is taken on trust' };
  }
  if (!ADR.test(String(payeur || ''))) return { etat: 'REFUSE', pourquoi: 'a whole payer address is required' };
  if (!ADR.test(String(destinataire || ''))) return { etat: 'REFUSE', pourquoi: 'a whole recipient address is required' };
  const act = String(actif || '').toUpperCase();
  if (!ACTIFS_PAIEMENT.includes(act)) {
    return { etat: 'REFUSE', pourquoi: 'asset must be one of ' + ACTIFS_PAIEMENT.join(', ') };
  }
  /* ⛔ `montantMin` doit etre un BigInt POSITIF. Accepter 0 reconnaitrait un paiement de zero —
   *   exactement ce que faisait l ancien chemin. */
  let min;
  try { min = BigInt(montantMin); } catch (_) { return { etat: 'REFUSE', pourquoi: 'amount expected is not a whole number' }; }
  if (min <= 0n) return { etat: 'REFUSE', pourquoi: 'a payment of zero is not a payment' };

  const bas = String(payeur).toLowerCase(), dest = String(destinataire).toLowerCase();

  /* ── la transaction elle-meme ───────────────────────────────────────────────────────────── */
  let tx, recu, tete;
  try {
    tx = await rpc('eth_getTransactionByHash', [txHash]);
    recu = await rpc('eth_getTransactionReceipt', [txHash]);
    tete = await rpc('eth_blockNumber', []);
  } catch (e) {
    /* ⛔ `absence-of-evidence-vs-failure-to-look` : une panne de lecture n est PAS un paiement
     *   absent. Les confondre refuserait un paiement reel, ou pire, en accepterait un faux le jour
     *   ou la logique serait inversee. */
    return { etat: 'NON_MESURE', pourquoi: 'the chain could not be read: ' + String((e && e.message) || e).slice(0, 120) };
  }
  if (!tx) return { etat: 'INTROUVABLE', pourquoi: 'no transaction with this hash — it may not exist, or not be mined yet' };
  if (!recu) return { etat: 'TROP_RECENTE', pourquoi: 'this transaction has no receipt yet — not confirmed' };

  /* ⛔⛔ LE CONTROLE QUI COMPTE LE PLUS : `tx.from`. C est la SEULE chose qui prouve qui a signe.
   *     Un log peut nommer n importe qui ; la transaction, non. */
  if (String(tx.from || '').toLowerCase() !== bas) {
    return { etat: 'MAUVAIS_PAYEUR',
      pourquoi: 'this transaction was signed by someone else — a transfer you did not send is not your payment' };
  }
  /* ⛔ Une transaction INCLUSE peut avoir echoue. `status` 0x0 = revert : rien n a bouge, et le
   *   hash existe quand meme. C est le piege qui a deja donne un VERT sur une tx `status 0x0`. */
  if (String(recu.status).toLowerCase() !== '0x1') {
    return { etat: 'ECHOUEE', pourquoi: 'this transaction reverted on chain — nothing moved' };
  }
  const nBloc = Number(BigInt(recu.blockNumber || '0x0'));
  const nTete = Number(BigInt(tete || '0x0'));
  const conf = nTete - nBloc + 1;
  if (!Number.isFinite(conf) || conf < CONFIRMATIONS_MIN) {
    return { etat: 'TROP_RECENTE', confirmations: Math.max(0, conf),
      pourquoi: 'only ' + Math.max(0, conf) + ' confirmation(s) — ' + CONFIRMATIONS_MIN + ' are required' };
  }

  /* ── le montant, par actif ──────────────────────────────────────────────────────────────── */
  if (act === 'ETH') {
    /* ⛔ Pour de l ETH natif, le destinataire est `tx.to` et le montant est `tx.value`. Un ETH
     *   envoye a un CONTRAT qui le reexpedie n est PAS couvert ici : on refuse plutot que de
     *   deviner un chemin interne qu on ne sait pas lire sans API de trace. */
    if (String(tx.to || '').toLowerCase() !== dest) {
      return { etat: 'MAUVAIS_DESTINATAIRE', pourquoi: 'this transaction did not pay the expected address' };
    }
    const val = BigInt(tx.value || '0x0');
    if (val < min) {
      return { etat: 'INSUFFISANT', paye: val.toString(), attendu: min.toString(),
        pourquoi: 'paid less than the amount expected' };
    }
    return { etat: 'PAYE', actif: act, paye: val.toString(), attendu: min.toString(),
      confirmations: conf, bloc: nBloc, de: bas, a: dest,
      reserve: 'verified by reading the chain: this hash, this signer, this amount. '
        + CONFIRMATIONS_MIN + ' confirmations is a choice, not finality.' };
  }

  /* USDC : le mouvement est un log `Transfer`, et il n est croyable que s il vient du VRAI contrat */
  const logs = Array.isArray(recu.logs) ? recu.logs : [];
  let recu_ = 0n, vuDuBonContrat = false;
  for (const l of logs) {
    if (String(l.address || '').toLowerCase() !== USDC_BASE.toLowerCase()) continue;
    vuDuBonContrat = true;
    const t = Array.isArray(l.topics) ? l.topics : [];
    if (t.length < 3 || String(t[0]).toLowerCase() !== SIG_TRANSFER) continue;
    if (motAdr(t[2]) !== dest) continue;
    /* ⛔ on n exige PAS que topics[1] soit le payeur : un paiement peut transiter par un contrat
     *   que l utilisateur a appele. Ce qui est exige, c est que LUI ait signe la transaction —
     *   deja verifie plus haut par `tx.from`. */
    try { recu_ += BigInt(l.data && l.data !== '0x' ? l.data : '0x0'); } catch (_) { /* log illisible : ignore */ }
  }
  if (!vuDuBonContrat) {
    return { etat: 'MAUVAIS_DESTINATAIRE',
      pourquoi: 'no USDC movement in this transaction — a token that merely calls itself USDC does not count' };
  }
  if (recu_ < min) {
    return { etat: 'INSUFFISANT', paye: recu_.toString(), attendu: min.toString(),
      pourquoi: 'less USDC reached the expected address than the amount expected' };
  }
  return { etat: 'PAYE', actif: act, paye: recu_.toString(), attendu: min.toString(),
    confirmations: conf, bloc: nBloc, de: bas, a: dest,
    reserve: 'verified by reading the chain: this hash, this signer, this USDC contract, this amount. '
      + CONFIRMATIONS_MIN + ' confirmations is a choice, not finality.' };
}
