/* recompense-actions.js — UNE RECOMPENSE EN ACTION TOKENISEE pour les swappers / detenteurs.
 *
 * ⛔⛔ DESACTIVEE PAR DEFAUT (`RECOMPENSE_ACTIONS_ACTIVE = false`). Aucun appelant de l app ne
 *   l importe aujourd hui. Demande de Raksha 2026-10-01 23:24 / 23:25 : design + implementation
 *   derriere un drapeau, FINANCEE PAR UN COFFRE SEPARE — jamais en rognant les 0,09 % nets de a6cf,
 *   sauf l option C-bis, presentee EXPLICITEMENT avec ses chiffres et jamais selectionnee ici.
 *
 * LES OPTIONS (les chiffres sont dans le rapport, §8) :
 *   A  « remise swapper en action » : coffre separe, taux 3 bps du notionnel, payee dans l action
 *      appariee, DIFFEREE de 24 h (annulee si le wallet renverse le swap entre-temps).
 *   B  « detenteur » : budget hebdomadaire fixe du coffre, reparti au prorata des soldes de block
 *      tenus sur 7 jours (minimum des instantanes), paye dans l action appariee du block.
 *   C  « surcharge coffre » : +1 bp paye par le swapper au coffre DANS la meme tx (2e part de
 *      PAY_PORTION au meme noeud) ; a6cf garde 9 bps nets. C-bis (rognage : a6cf 8 + coffre 1) est
 *      LISTEE pour comparaison et REFUSEE par `partsFraisPourOption` sauf drapeau explicite.
 *
 * ⛔ ANTI-FARMING (toutes options) :
 *   1. taille minimale (notionnel en $ mesure, pas declare) ;
 *   2. delai de grace par wallet entre deux recompenses ;
 *   3. AUCUNE recompense sur un aller-retour : la recompense A est DIFFEREE et ANNULEE si le meme
 *      wallet fait le swap inverse sur la meme action dans la fenetre ; B prend le MINIMUM des
 *      instantanes (un solde gonfle 1 h ne compte pas) ;
 *   4. plafond par wallet et par jour, et plafond global du coffre par jour ;
 *   5. le taux est BORNE : une recompense ne depasse jamais le frais d interface d une jambe, donc un
 *      aller-retour paie toujours 2 x 9 bps + les frais LP + l impact pour gagner au plus 1 x taux.
 *   6. a6cf, le coffre et le routeur ne sont jamais beneficiaires.
 */
import { ADRESSES, FRAIS_BPS, estAdresse } from './multipool.js';

export const RECOMPENSE_ACTIONS_ACTIVE = false;
const bas = (a) => String(a || '').toLowerCase();

export const OPTIONS = Object.freeze({
  A: Object.freeze({ nom: 'remise swapper differee', tauxBps: 3n, minUsd: 100, delaiGraceS: 3600, fenetreAnnulationS: 86400, plafondWalletJourUsd: 5, plafondCoffreJourUsd: 200, finance: 'coffre separe' }),
  B: Object.freeze({ nom: 'detenteur hebdomadaire', budgetSemaineUsd: 500, minSoldeUsd: 50, dureeMinJours: 7, plafondWalletSemaineUsd: 25, finance: 'coffre separe' }),
  C: Object.freeze({ nom: 'surcharge coffre 1 bp', surchargeBps: 1n, finance: 'swapper (+1 bp), a6cf garde 9 bps nets' }),
  'C-bis': Object.freeze({ nom: 'rognage 1 bp', rognageBps: 1n, finance: 'pris sur le frais : a6cf 8 bps nets — CONTRAIRE a la regle 0,09 % net, option de comparaison seulement' }),
});
/* ⛔ borne 5 : une option A dont le taux depasserait le frais d une jambe est un bug de config */
if (OPTIONS.A.tauxBps > FRAIS_BPS) throw new Error('recompense A > frais d une jambe : farming rentable');

/**
 * Evalue UN swap execute pour l option A.
 *   swap      : { wallet, action, sens: 'ACHAT'|'VENTE' (de l action ou du block apparie), notionnelUsd, ts, tx }
 *   historique: swaps EXECUTES du meme wallet (memes champs), et `recompenses` deja accordees
 *   prixActionUsd, decimalesAction : MESURES par l appelant (devis on-chain)
 * Rend { etat: 'DESACTIVE'|'REFUSE'|'EN_ATTENTE', pourquoi, montantUsd, montantUnites, payableApres }.
 * ⛔ 'EN_ATTENTE' : rien n est payable avant `payableApres` ; `confirmer` revalide a ce moment-la.
 */
export function evaluerA({ swap, historique = [], recompenses = [], prixActionUsd, decimalesAction, coffre, actif = RECOMPENSE_ACTIONS_ACTIVE, option = OPTIONS.A }) {
  if (!actif) return { etat: 'DESACTIVE', pourquoi: 'reward flag is off' };
  const w = bas(swap && swap.wallet);
  if (!estAdresse(w)) return { etat: 'REFUSE', pourquoi: 'no wallet' };
  if ([ADRESSES.FEE_WALLET, ADRESSES.ROUTEUR, bas(coffre)].includes(w)) return { etat: 'REFUSE', pourquoi: 'fee wallet, router and vault never earn rewards' };
  if (!(Number(swap.notionnelUsd) >= option.minUsd)) return { etat: 'REFUSE', pourquoi: 'below the minimum size of $' + option.minUsd };
  if (!(prixActionUsd > 0) || !Number.isInteger(decimalesAction)) return { etat: 'REFUSE', pourquoi: 'the stock price was not measured' };
  const derniere = recompenses.filter((r) => bas(r.wallet) === w).sort((x, y) => y.ts - x.ts)[0];
  if (derniere && swap.ts - derniere.ts < option.delaiGraceS) return { etat: 'REFUSE', pourquoi: 'cooldown: last reward ' + (swap.ts - derniere.ts) + ' s ago' };
  const jour = Math.floor(swap.ts / 86400);
  const dejaWallet = recompenses.filter((r) => bas(r.wallet) === w && Math.floor(r.ts / 86400) === jour).reduce((s, r) => s + r.montantUsd, 0);
  const dejaCoffre = recompenses.filter((r) => Math.floor(r.ts / 86400) === jour).reduce((s, r) => s + r.montantUsd, 0);
  /* ⛔ anti-aller-retour, cote PASSE : si ce swap renverse un swap recent, il n est pas eligible */
  const inverse = historique.find((h) => bas(h.wallet) === w && bas(h.action) === bas(swap.action) && h.sens !== swap.sens && swap.ts - h.ts >= 0 && swap.ts - h.ts < option.fenetreAnnulationS);
  if (inverse) return { etat: 'REFUSE', pourquoi: 'this swap reverses ' + (inverse.tx || 'a swap') + ' within the window: round trips earn nothing' };
  let usd = Number(swap.notionnelUsd) * Number(option.tauxBps) / 10000;
  usd = Math.min(usd, option.plafondWalletJourUsd - dejaWallet, option.plafondCoffreJourUsd - dejaCoffre);
  if (!(usd > 0)) return { etat: 'REFUSE', pourquoi: 'daily cap reached' };
  const unites = BigInt(Math.floor((usd / prixActionUsd) * 10 ** Math.min(decimalesAction, 12))) * 10n ** BigInt(Math.max(decimalesAction - 12, 0));
  if (unites <= 0n) return { etat: 'REFUSE', pourquoi: 'reward rounds to zero' };
  return { etat: 'EN_ATTENTE', montantUsd: +usd.toFixed(6), montantUnites: unites, payableApres: swap.ts + option.fenetreAnnulationS, action: bas(swap.action), wallet: w, sens: swap.sens };
}

/** A l echeance : la recompense est ANNULEE si le wallet a renverse le swap dans la fenetre. */
export function confirmerA({ attente, historiqueApres = [], maintenant, option = OPTIONS.A }) {
  if (!attente || attente.etat !== 'EN_ATTENTE') return { etat: 'REFUSE', pourquoi: 'nothing pending' };
  if (maintenant < attente.payableApres) return { etat: 'EN_ATTENTE', pourquoi: 'window still open' };
  const debut = attente.payableApres - option.fenetreAnnulationS;
  const renverse = historiqueApres.find((h) => bas(h.wallet) === attente.wallet && bas(h.action) === attente.action && h.ts >= debut && h.ts < attente.payableApres && h.sens !== attente.sens);
  if (renverse) return { etat: 'ANNULEE', pourquoi: 'the wallet reversed the swap inside the window (' + (renverse.tx || '') + ')' };
  return { etat: 'PAYABLE', montantUnites: attente.montantUnites, action: attente.action, wallet: attente.wallet };
}

/**
 * Option B : repartition d un budget fixe au prorata du MINIMUM des instantanes de solde.
 *   instantanes : Map wallet -> [soldeUsd...] (au moins dureeMinJours instantanes)
 */
export function repartirB({ instantanes, actif = RECOMPENSE_ACTIONS_ACTIVE, option = OPTIONS.B, exclus = [] }) {
  if (!actif) return { etat: 'DESACTIVE', parts: [] };
  const ex = new Set([ADRESSES.FEE_WALLET, ADRESSES.ROUTEUR, ...exclus.map(bas)]);
  const base = [];
  for (const [w, s] of instantanes) {
    if (ex.has(bas(w)) || !Array.isArray(s) || s.length < option.dureeMinJours) continue;
    const m = Math.min(...s);
    if (m >= option.minSoldeUsd) base.push([bas(w), m]);
  }
  const tot = base.reduce((x, [, m]) => x + m, 0);
  if (!tot) return { etat: 'OK', parts: [] };
  const parts = base.map(([w, m]) => [w, Math.min(option.budgetSemaineUsd * m / tot, option.plafondWalletSemaineUsd)]);
  return { etat: 'OK', parts, distribueUsd: parts.reduce((x, [, u]) => x + u, 0) };
}

/** Option C : les parts de PAY_PORTION. C garde a6cf a 9 nets ; C-bis exige `accepterRognage`. */
export function partsFraisPourOption(nom, coffre, { accepterRognage = false } = {}) {
  if (nom === 'C') {
    if (!estAdresse(coffre)) return null;
    return [{ qui: ADRESSES.FEE_WALLET, bps: FRAIS_BPS }, { qui: bas(coffre), bps: OPTIONS.C.surchargeBps }];
  }
  if (nom === 'C-bis') {
    if (!accepterRognage || !estAdresse(coffre)) return null; /* ⛔ contraire a « 0,09 % net » */
    return [{ qui: ADRESSES.FEE_WALLET, bps: FRAIS_BPS - OPTIONS['C-bis'].rognageBps }, { qui: bas(coffre), bps: OPTIONS['C-bis'].rognageBps }];
  }
  return [{ qui: ADRESSES.FEE_WALLET, bps: FRAIS_BPS }];
}

/** Le paiement : un `transfer` ERC-20 de l action, ENVOYE PAR LE COFFRE (jamais par a6cf). */
export function calldataPaiement({ action, destinataire, montant }) {
  if (!estAdresse(action) || !estAdresse(destinataire) || BigInt(montant) <= 0n) return null;
  if (bas(destinataire) === ADRESSES.FEE_WALLET) return null;
  return { to: bas(action), data: '0xa9059cbb' + bas(destinataire).slice(2).padStart(64, '0') + BigInt(montant).toString(16).padStart(64, '0') };
}
