/* volume-rolls.js — CE QU UN JOUEUR DEPENSE DANS LE JEU COMPTE DANS LES 10 $ DU TICKET (Phil 2026-10-18 14:30 : « Auto-roll utilisera le
 * pass… bonne idee, ca fera le volume requis »). PUR : des logs BlockRolls -> des montants USDC par (transaction, joueur).
 *   Rolled(rollId idx, player idx, guess[5], targetBlock, withPass, toPot, toDev) : un roll PAYE depense toPot + toDev (0 si withPass :
 *     le pass est deja compte a son achat) ;
 *   PassBought(player idx, day idx, rollsLeft, expiresAt, paid, dayPotAfter) : depense `paid`.
 * Seuls les logs DU contrat donne comptent (un evenement d un autre contrat n est pas un paiement : regle « un event n est pas une tx »,
 * ici l emetteur EST notre contrat, qui n emet qu apres avoir encaisse). Montants en unites brutes USDC (6 decimales). */
import { topic } from './keccak.js';
import { EV_ROLLED, EV_PASS_BOUGHT } from './blockrolls-plan.js';

const bas = (x) => String(x || '').toLowerCase();
const mots = (data) => (String(data || '').replace(/^0x/, '').match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
const adrDe = (t) => '0x' + bas(t).slice(-40);
export const TOPIC_ROLLED = topic(EV_ROLLED), TOPIC_PASS = topic(EV_PASS_BOUGHT);

/** logs -> [{ tx, joueur, brut }] : un total par (transaction, joueur), dans l ordre d apparition. Log illisible -> ignore (jamais invente). */
export function depensesJeu(logs, contrat) {
  const c = bas(contrat), parCle = new Map();
  for (const l of logs || []) {
    if (bas(l && l.address) !== c || !Array.isArray(l.topics) || !/^0x[0-9a-f]{64}$/i.test(String(l.transactionHash || ''))) continue;
    const t0 = bas(l.topics[0]), m = mots(l.data);
    let joueur = null, brut = 0n;
    if (t0 === TOPIC_ROLLED && l.topics[2] && m.length === 9) { joueur = adrDe(l.topics[2]); brut = m[6] === 1n ? 0n : m[7] + m[8]; }
    else if (t0 === TOPIC_PASS && l.topics[1] && m.length === 4) { joueur = adrDe(l.topics[1]); brut = m[2]; }
    else continue;
    if (!/^0x[0-9a-f]{40}$/.test(joueur) || brut <= 0n) continue;
    const cle = bas(l.transactionHash) + '|' + joueur;
    /* `bloc` : le bloc du log (le serveur credite le JOUR de ce bloc, pas celui du scan) ; null si le log ne le porte pas */
    let bloc = null; try { bloc = l.blockNumber != null ? Number(BigInt(l.blockNumber)) : null; } catch (_) { bloc = null; }
    const e = parCle.get(cle) || { tx: bas(l.transactionHash), joueur, brut: 0n, bloc: Number.isSafeInteger(bloc) ? bloc : null };
    e.brut += brut; parCle.set(cle, e);
  }
  return [...parCle.values()];
}
