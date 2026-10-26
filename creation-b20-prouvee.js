/* ══ 2026-10-26 — LE BLOC DE CREATION D UN BLOCK DU ROUTEUR, PROUVE PAR CE PROCESSUS SUR SON RECU ═══════════════════════════════════════
 * ⛔ MESURE PROD (game54, /api/blocks-routeur, x-ms-monitor) : UNIT (0xb2000000000000000000007afa7ed748b0874f27) est dans l index du
 *   routeur avec sa tx de creation, mais cet index est REPRIS du volume (reprise [51354834, 53113737]) : serveur-web.js n appelle
 *   noterCreationsLues que sur un scan fait dans ce processus. creationsLuesIci ne connaissait donc pas UNIT, et /api/holders cherchait
 *   sa naissance depuis PREMIER_BLOCK_TB.
 * ⛔ LA REGLE DE creationsLuesIci NE CHANGE PAS : le bloc de la reprise n est JAMAIS pris tel quel. Seule la TX vient de la reprise ;
 *   le BLOC est celui du RECU relu ici : statut 0x1, le recu est bien celui de cette tx, et il porte un log B20Created EMIS PAR LA FACTORY
 *   (address == FACTORY) dont topic1 est ce jeton. Un log du meme evenement emis par un autre contrat ne prouve rien (meme frontiere que
 *   prouverAction, actions-chaine.js). Pas de condition sur tx.from : un block du routeur est cree par n importe qui.
 * ⛔ Rien de lu, ou une reponse incomplete : NON_MESURE (rien n est note, le plancher comme avant, retente plus tard). Pur : `rpc` injecte. */
import { FACTORY, TOPIC_CREATED } from './index-blocks.js';

const ADR = /^0x[0-9a-f]{40}$/, TX = /^0x[0-9a-f]{64}$/;
const bas = (x) => String(x || '').toLowerCase();
const court = (e) => String((e && e.message) || e).slice(0, 120);

/**
 * @param {{ rpc:(m:string,p:any[])=>Promise<any>, adr:string, tx:string }} p
 * @returns {Promise<{etat:'PROUVE'|'REFUSE'|'NON_MESURE', adr:string, tx?:string, bloc?:number, code?:string, pourquoi?:string}>}
 */
export async function prouverCreationB20({ rpc, adr, tx }) {
  const a = bas(adr), t = bas(tx);
  if (!ADR.test(a)) return { etat: 'REFUSE', adr: a, code: 'ADRESSE', pourquoi: 'not a whole address' };
  if (!TX.test(t)) return { etat: 'NON_MESURE', adr: a, code: 'SANS_TX', pourquoi: 'its creation transaction is not known' };
  let recu;
  try { recu = await rpc('eth_getTransactionReceipt', [t]); } catch (e) { return { etat: 'NON_MESURE', adr: a, tx: t, code: 'RECU_NON_LU', pourquoi: 'creation receipt not read: ' + court(e) }; }
  if (!recu || typeof recu !== 'object') return { etat: 'NON_MESURE', adr: a, tx: t, code: 'RECU_NON_LU', pourquoi: 'no receipt answered (not measured)' };
  if (bas(recu.transactionHash) !== t) return { etat: 'NON_MESURE', adr: a, tx: t, code: 'RECU_AUTRE', pourquoi: 'the receipt answered is for another transaction' };
  if (bas(recu.status) === '0x0') return { etat: 'REFUSE', adr: a, tx: t, code: 'TX_ECHOUEE', pourquoi: 'the creation transaction failed (status 0x0)' };
  if (bas(recu.status) !== '0x1' || !Array.isArray(recu.logs)) return { etat: 'NON_MESURE', adr: a, tx: t, code: 'RECU_INCOMPLET', pourquoi: 'the receipt has no readable status or logs' };
  const sujet = '0x' + a.slice(2).padStart(64, '0');
  const log = recu.logs.find((l) => l && bas(l.address) === FACTORY && Array.isArray(l.topics) && bas(l.topics[0]) === TOPIC_CREATED && bas(l.topics[1]) === sujet);
  if (!log) return { etat: 'REFUSE', adr: a, tx: t, code: 'SANS_LOG_FACTORY', pourquoi: 'that transaction holds no B20Created log from the B20 factory for this token' };
  const bloc = parseInt(String(recu.blockNumber || ''), 16);
  if (!Number.isSafeInteger(bloc) || bloc <= 0) return { etat: 'NON_MESURE', adr: a, tx: t, code: 'BLOC_ILLISIBLE', pourquoi: 'the receipt has no readable block number' };
  return { etat: 'PROUVE', adr: a, tx: t, bloc };
}
