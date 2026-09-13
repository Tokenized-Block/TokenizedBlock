// nourriture.js — ce qui NOURRIT un block, lu sur la chaine : GM (transferts), messages, nouveaux
// detenteurs — et sa MORT, selon les regles de Phil du 2026-09-13 (DECISIONS-regles-du-jeu).
// ================================================================================================
// ⛔⛔ LA TX DE CREATION N EST PAS DE LA NOURRITURE. Mesure du 2026-09-13 sur 62 blocks mainnet : compter
//    tous les transferts donnait « 50 actifs » ; hors tx de creation, ils etaient 13. La distribution
//    initiale d un launcher n est pas un GM.
// ⛔⛔ « CREATEUR A ZERO » NE TUE QUE SI LE CREATEUR A DETENU. Meme mesure : 43 createurs a zero, dont 40
//    n avaient JAMAIS recu leur block (launcher tiers). Appliquer la regle telle quelle tuait ~40 blocks
//    a tort. Regle precisee et CONFIRMEE par Phil le 2026-09-13 : mort = a detenu, puis zero.
// ⛔ « NON LU » N EST NI VIVANT NI MORT. Une fenetre ratee, un createur hors fenetre, un solde illisible
//    rendent `mort: null` — jamais `true`. Mourir sur une panne reseau serait mentir sur le block de
//    quelqu un d autre.
// ⚠️ BORNE : tout est lu dans UNE fenetre de blocs (`blocs`). Un block plus ancien que la fenetre a une
//    nourriture recente, pas une histoire ; et sa mort reste `null` si sa creation est hors fenetre.
import { listerTransfers, createurDuJeton, selecteur } from './index-blocks.js';
import { lireMemo } from './messages.js';

const ZERO = '0x0000000000000000000000000000000000000000';
const MORTE = '0x000000000000000000000000000000000000dead';
export const ETATS_NOURRITURE = ['LUE', 'NON_LUE'];

/**
 * @returns {Promise<{etat:'LUE'|'NON_LUE', gm:number, messages:number, messagesLus:number,
 *   detenteurs:number, mort:boolean|null, pourquoiMort:string|null, pourquoi:string|null}>}
 */
export async function nourritureDuBlock({ rpc, jeton, blocs = 8000, fin = null, messagesMax = 6, creation = null }) {
  const vide = { gm: 0, messages: 0, messagesLus: 0, detenteurs: 0, mort: null, pourquoiMort: null };
  const adr = String(jeton || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(adr)) return { etat: 'NON_LUE', ...vide, pourquoi: 'not an address' };

  let t;
  try { t = await listerTransfers({ rpc, token: adr, blocs, fin }); }
  catch (e) { return { etat: 'NON_LUE', ...vide, pourquoi: 'transfers unread: ' + e.message }; }
  /* ⛔ UNE FENETRE RATEE REND TOUT NON LU : un compte partiel sous-estimerait la nourriture et, pire,
   * pourrait rater le transfert qui prouve que le createur a detenu. */
  if (t.fenetresRatees.length) {
    return { etat: 'NON_LUE', ...vide, pourquoi: t.fenetresRatees.length + ' log window(s) failed' };
  }

  let c = creation;
  if (!c) {
    try { c = await createurDuJeton({ rpc, token: adr, blocs, fin }); }
    catch (e) { c = { createur: null, tx: null, raison: e.message }; }
  }
  const createur = c && c.createur ? String(c.createur).toLowerCase() : null;
  const txCreation = c && c.tx ? String(c.tx).toLowerCase() : null;

  const hors = t.transfers.filter((x) => x.from.toLowerCase() !== ZERO
    && (!txCreation || String(x.tx).toLowerCase() !== txCreation));
  const txs = [...new Set(hors.map((x) => String(x.tx).toLowerCase()))];
  const detenteurs = new Set(hors.map((x) => x.to.toLowerCase())
    .filter((a) => a !== ZERO && a !== MORTE && a !== createur)).size;

  /* Messages : borne a `messagesMax` transactions relues — le compte dit combien ont ete regardees. */
  let messages = 0, messagesLus = 0;
  for (const h of txs.slice(0, messagesMax)) {
    try {
      const tx = await rpc('eth_getTransactionByHash', [h]);
      messagesLus++;
      if (tx && String(tx.to || '').toLowerCase() === adr && lireMemo(tx.input).etat === 'LU') messages++;
    } catch { /* non relue : ni comptee comme message, ni comme lue */ }
  }

  let mort = null, pourquoiMort = null;
  if (!createur) {
    pourquoiMort = 'creation not found in the window — death not judged';
  } else if (!t.transfers.some((x) => x.to.toLowerCase() === createur)) {
    pourquoiMort = 'the creator never held this block in the window — the death rule does not apply';
  } else {
    try {
      const b = await rpc('eth_call', [{ to: adr, data: '0x' + selecteur('balanceOf(address)')
        + createur.slice(2).padStart(64, '0') }, 'latest']);
      const v = BigInt(b);
      mort = v === 0n;
      pourquoiMort = mort ? 'its creator held it, and now holds none' : null;
    } catch (e) {
      pourquoiMort = 'creator balance unread — death not judged';
    }
  }
  return { etat: 'LUE', gm: txs.length, messages, messagesLus, detenteurs, mort, pourquoiMort, pourquoi: null };
}
