// messagerie-blocks.js — la messagerie ENTRE BLOCKS, payee en TBLOCK, en UNE signature, sans contrat et sans custodie.
// ================================================================================================
// ⛔ DECISION DE PHIL (2026-09-14) : « TBLOCK fixe -> wallet de frais ». Design recommande par le workflow verifie :
//    un message = TBLOCK.transfer(FEE_WALLET, FRAIS_MESSAGE) dont le message on-chain porte l en-tete
//        tbx1 de=<block qui parle> a=<block qui recoit> <texte>
//    Un seul appel : il se fait en entier ou pas du tout. Personne ne detient les fonds de personne.
// ⛔⛔ CE QUE LE LECTEUR EXIGE, ET POURQUOI (chaque regle vient d un risque mesure) :
//    · le transfert va au wallet de frais, d au moins FRAIS_MESSAGE (sinon un transfert de 0 GRATUIT — mesure : accepte
//      sans solde — ferait « parler » n importe quel block) ;
//    · tx.to = TBLOCK et tx.from = l emetteur du log (un evenement n est pas une transaction) ;
//    · l emetteur n est PAS le wallet de frais (sinon sa cle s envoie des messages « payes » pour du gas seulement) ;
//    · l en-tete se lit, et nomme deux ADRESSES entieres.
// ⛔ « de=X » EST UNE DECLARATION DU SIGNATAIRE : l ecran dit « wallet W, parlant comme X », jamais « X a dit ». L app
//    exige a l envoi que W detienne X ; un script peut s en passer, le lecteur l affiche donc toujours avec W.
// ⛔ CE N EST PAS UN BUYBACK : le frais deplace du TBLOCK vers le wallet de frais. Aucune promesse de prix.
// ⚠️ Un wallet smart-contract (4337) signe via un bundler : tx.from != emetteur, le message serait PAYE et ILLISIBLE.
//    L envoi le refuse avant la signature (code de compte lu). Un EOA delegue 7702 (code 0xef0100…) signe en direct : accepte.
import { encodeTransferAvecMemo, lireMemo, validerMemo } from './messages.js';
import { TBLOCK } from './tokenomics.js';
import { FEE_WALLET } from './frais-creation.js';
import { selecteur } from './pool.js';
import { listerTransfers } from './index-blocks.js';

/** ⛔ Montant FIXE choisi pour la mise en service (1 000 TBLOCK) : parametre nomme, a ajuster par decision de Phil. */
export const FRAIS_MESSAGE_TBLOCK = 1000n * 10n ** 18n;
export const PREFIXE_MESSAGE_BLOCK = 'tbx1 ';
export const ETATS_MESSAGE_BLOCK = ['LU', 'AUTRE', 'ILLISIBLE'];
export const ETATS_ENVOI_MESSAGE = ['PRET', 'REFUSE', 'NON_MESURE'];
const ADR = /^0x[0-9a-fA-F]{40}$/;
const pad = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');

/** L en-tete + le texte, verifie par la garde des messages (256 octets au total). */
export function encoderMessageBlock({ de, a, texte }) {
  if (!ADR.test(String(de || '')) || !ADR.test(String(a || ''))) return { etat: 'REFUSE', pourquoi: 'both blocks must be whole addresses' };
  if (String(de).toLowerCase() === String(a).toLowerCase()) return { etat: 'REFUSE', pourquoi: 'a block writes to another block' };
  const t = String(texte ?? '').trim();
  if (!t) return { etat: 'REFUSE', pourquoi: 'write something' };
  const v = validerMemo(PREFIXE_MESSAGE_BLOCK + 'de=' + String(de).toLowerCase() + ' a=' + String(a).toLowerCase() + ' ' + t);
  if (v.etat !== 'OK') return { etat: 'REFUSE', pourquoi: v.pourquoi || 'message refused' };
  return { etat: 'OK', memo: v.texte };
}

/** Relit un message : `AUTRE` pour tout message qui n est pas de la messagerie entre blocks. */
export function lireMessageBlock(texte) {
  const s = String(texte ?? '');
  if (!s.startsWith(PREFIXE_MESSAGE_BLOCK)) return { etat: 'AUTRE' };
  const m = s.match(/^tbx1 de=(0x[0-9a-f]{40}) a=(0x[0-9a-f]{40}) ([\s\S]+)$/);
  if (!m || m[1] === m[2]) return { etat: 'ILLISIBLE', pourquoi: 'block message header malformed' };
  return { etat: 'LU', de: m[1], a: m[2], texte: m[3] };
}

/**
 * Prepare l envoi d un message paye. Rien n est signe ici.
 * @param {{ rpc: Function, compte: string, de: string, a: string, texte: string, detientDe: boolean|null }} o
 *   `detientDe` : le solde du block `de` lu par l app (true/false), null si non lu.
 */
export async function planMessagePaye({ rpc, compte, de, a, texte, detientDe = null }) {
  if (!ADR.test(String(compte || ''))) return { etat: 'REFUSE', pourquoi: 'connect your wallet first' };
  if (String(compte).toLowerCase() === FEE_WALLET.toLowerCase()) return { etat: 'REFUSE', pourquoi: 'BaseAPP Holders fee path cannot send paid messages to itself' };
  const enc = encoderMessageBlock({ de, a, texte });
  if (enc.etat !== 'OK') return enc;
  if (detientDe === false) return { etat: 'REFUSE', pourquoi: 'you hold none of the block you speak as' };
  if (detientDe !== true) return { etat: 'NON_MESURE', pourquoi: 'your balance of the block you speak as was not read' };
  const lire = rpc;
  let code, solde;
  try {
    code = String(await lire('eth_getCode', [compte, 'latest']));
    solde = BigInt(String(await lire('eth_call', [{ to: TBLOCK, data: '0x' + selecteur('balanceOf(address)') + pad(compte) }, 'latest'])).slice(0, 66));
  } catch (e) {
    return { etat: 'NON_MESURE', pourquoi: 'your account or TBLOCK balance could not be read' };
  }
  /* 0x = EOA ; 0xef0100 + adresse = EOA delegue (EIP-7702), qui signe lui-meme la transaction */
  if (code !== '0x' && !/^0xef0100[0-9a-f]{40}$/i.test(code)) {
    return { etat: 'REFUSE', pourquoi: 'smart-contract wallets are not supported yet: the fee would be paid but the message could not be read back' };
  }
  if (solde < FRAIS_MESSAGE_TBLOCK) return { etat: 'REFUSE', pourquoi: 'not enough TBLOCK for the message fee', manque: FRAIS_MESSAGE_TBLOCK - solde };
  return { etat: 'PRET', pourquoi: null, frais: FRAIS_MESSAGE_TBLOCK,
    tx: { to: TBLOCK, data: encodeTransferAvecMemo(FEE_WALLET, FRAIS_MESSAGE_TBLOCK, enc.memo), value: '0x0' } };
}

/**
 * Filtre PUR : garde un transfert comme message paye seulement si toutes les regles tiennent.
 * @param {{from:string, to:string, value:bigint, tx:string, bloc?:number}} t  le log Transfer (de TBLOCK)
 * @param {{from:string, to:string, input:string}|null} tx  la transaction lue
 */
export function messageDepuisTransfert(t, tx) {
  if (!t || !tx) return { etat: 'REJETE', pourquoi: 'transaction not read' };
  if (String(t.to).toLowerCase() !== FEE_WALLET.toLowerCase()) return { etat: 'REJETE', pourquoi: 'not sent as Fees for BaseAPP Holders' };
  if (typeof t.value !== 'bigint' || t.value < FRAIS_MESSAGE_TBLOCK) return { etat: 'REJETE', pourquoi: 'below the message fee' };
  if (String(t.from).toLowerCase() === FEE_WALLET.toLowerCase()) return { etat: 'REJETE', pourquoi: 'sent by the BaseAPP Holders fee path itself' };
  if (String(tx.to).toLowerCase() !== TBLOCK.toLowerCase()) return { etat: 'NON_LISIBLE', pourquoi: 'not a direct TBLOCK transfer (smart wallet or relay)' };
  if (String(tx.from).toLowerCase() !== String(t.from).toLowerCase()) return { etat: 'REJETE', pourquoi: 'the signer is not the sender of the transfer' };
  const m = lireMemo(tx.input);
  if (m.etat !== 'LU') return { etat: 'REJETE', pourquoi: 'no message in the transaction' };
  const mb = lireMessageBlock(m.texte);
  if (mb.etat !== 'LU') return { etat: 'REJETE', pourquoi: mb.pourquoi || 'not a block message' };
  return { etat: 'MESSAGE', signataire: String(tx.from).toLowerCase(), de: mb.de, a: mb.a, texte: mb.texte, frais: t.value, tx: t.tx, bloc: t.bloc ?? null };
}

/** Les messages payes des derniers `blocs` blocs, groupes par paire de blocks. Les fenetres ratees sont rendues. */
export async function lireConversations({ rpc, blocs = 20000, fin = null, pause = 350 }) {
  const lire = rpc;
  const r = await listerTransfers({ rpc: lire, token: TBLOCK, blocs, fin, toAddr: FEE_WALLET });
  const messages = [], compteurs = { rejetes: 0, nonLisibles: 0, sousFrais: 0 };
  for (const t of r.transfers || []) {
    if (typeof t.value !== 'bigint' || t.value < FRAIS_MESSAGE_TBLOCK) { compteurs.sousFrais++; continue; }
    let tx = null;
    try { tx = await lire('eth_getTransactionByHash', [t.tx]); } catch (e) { tx = null; }
    if (pause > 0) await new Promise((ok) => setTimeout(ok, pause));
    const x = messageDepuisTransfert(t, tx);
    if (x.etat === 'MESSAGE') messages.push(x);
    else if (x.etat === 'NON_LISIBLE') compteurs.nonLisibles++;
    else compteurs.rejetes++;
  }
  const paires = new Map();
  for (const m of messages) {
    const cle = [m.de, m.a].sort().join('|');
    if (!paires.has(cle)) paires.set(cle, []);
    paires.get(cle).push(m);
  }
  return { messages, paires, compteurs, fenetresRatees: r.fenetresRatees || [] };
}
