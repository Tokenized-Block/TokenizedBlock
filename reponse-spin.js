/* reponse-spin.js — LE PANNEAU DE REPONSE DU SPIN (Phil 2026-10-24, avec la capture de game35 : « il ne faut pas 2 jeux mais un seul, mets-le
 *   au CENTRE : un clic, un contrat lance, une reponse avec les actions a faire pour les utilisateurs »).
 * Sous le bouton Spin, UN panneau dit, pour LE spin que les rouleaux suivent : (1) envoye — spin #N ; (2) l attente des blocs t, t+1, t+2
 *   (compte en direct), puis les rouleaux qui se posent ; (3) le resultat : les points et le prix de la table du contrat ; (4) L ACTION
 *   SUIVANTE en UNE phrase, avec son bouton dans la meme ligne. Chaque etat que la carte des slots connait (planReglement : ATTENDRE, LOT,
 *   COURT, PERDU, NON_LU ; bilanReglement : PAYE, PLAFONNE, SAUTE, FENETRE, REGLE_AILLEURS, PERDU ; le regleur du serveur ON) donne
 *   EXACTEMENT une phrase d action (une cle). Le bouton suit le PLAN entier (Settle regle tout le lot, Accept un spin court), comme les
 *   boutons de la carte ; la phrase le dit.
 * Pur : aucun reseau, aucun DOM. Les secondes viennent des BLOCS (au temps de bloc mesure, 200 ms sinon), jamais l inverse. */
import { blocsDesFaces, FENETRE, usdcPrecis } from './slots-plan.js';

/** les cles des phrases d action (une par etat) */
export const ACTIONS = Object.freeze({
  REGLER: 'REGLER', ACCEPTER: 'ACCEPTER', ATTENDRE: 'ATTENDRE', ATTENDRE_REGLEUR: 'ATTENDRE_REGLEUR', SANS_PRIX: 'SANS_PRIX', POT_VIDE: 'POT_VIDE',
  PERDU: 'PERDU', PAYE: 'PAYE', PLAFONNE: 'PLAFONNE', REGLE_AILLEURS: 'REGLE_AILLEURS', NON_LU: 'NON_LU', ARRET: 'ARRET', JOUER: 'JOUER',
});
/** des blocs restants en secondes, au temps de bloc mesure (200 ms suppose s il ne l est pas) */
export function secondesTexte(blocs, msParBloc) {
  const ms = Number(msParBloc) > 0 ? Number(msParBloc) : 200;
  const s = (Number(blocs) * ms) / 1000;
  return s < 1 ? 'under 1 s' : Math.round(s) + ' s';
}
const pts = (p) => p + ' point' + (p === 1 ? '' : 's');

/**
 * @param {object} p
 *   moi       : un wallet connecte (sans wallet : aucune etape, aucune action — la ligne d etat dit « Connect a wallet to spin »)
 *   suivi     : { id, t } le spin que les rouleaux suivent (t null : regle ici, ses hashes viennent du recu), ou null
 *   plan      : Slots.planReglement (lignes, lot, courts, perdus) a la tete `tete`, ou null (non lu)
 *   tete      : le dernier bloc lu
 *   posees    : les trois faces de `suivi` sont posees (rouleaux)
 *   regleurOn : le regleur du serveur est allume (/api/slots regleur.etat === 'ON')
 *   msParBloc : le temps de bloc mesure (ms) ou null
 *   bilan     : la ligne de bilanReglement du dernier envoi pour `suivi` (PAYE, PLAFONNE…), ou null
 *   arret     : un paiement en jeton arrete en route est dit sur la ligne d etat (ses boutons y sont)
 *   fmt       : USDC brut -> texte (usdcPrecis par defaut)
 * @returns {{ etapes: [{ cle, texte, etat }], action: { cle, texte, bouton } | null, spin: string | null }}
 *   etat d une etape : 'fait' | 'encours' | 'attente' ; bouton : 'regler' | 'accepter' | null
 */
export function reponseSpin({ moi, suivi = null, plan = null, tete = null, posees = false, regleurOn = false, msParBloc = null, bilan = null, arret = false, fmt = usdcPrecis } = {}) {
  if (!moi) return { etapes: [], action: null, spin: null };
  const lignes = (plan && plan.lignes) || [];
  const id = suivi ? String(suivi.id) : null;
  const ligne = id ? lignes.find((l) => String(l.id) === id) || null : null;
  const b = bilan && id && String(bilan.id) === id ? bilan : null;

  /* LES ETAPES du spin suivi */
  const etapes = [];
  if (id) {
    etapes.push({ cle: 'envoye', texte: 'Sent — spin #' + id, etat: 'fait' });
    const t = suivi.t === null || suivi.t === undefined ? null : Number(suivi.t);
    if (t !== null && Number.isSafeInteger(t)) {
      const ns = blocsDesFaces(t), liste = ns.map((x) => x.toLocaleString('en-US')).join(', ');
      const dans = Number.isSafeInteger(Number(tete)) ? Math.max(0, Math.min(3, Number(tete) - t + 1)) : 0;
      if (dans < 3) etapes.push({ cle: 'blocs', texte: 'Waiting for blocks ' + liste + ' — ' + dans + ' of 3 in', etat: 'encours' });
      else if (!posees) etapes.push({ cle: 'blocs', texte: 'Blocks ' + liste + ' are in — the reels are landing', etat: 'encours' });
      else etapes.push({ cle: 'blocs', texte: 'Blocks ' + liste + ' drew your three faces', etat: 'fait' });
    } else etapes.push({ cle: 'blocs', texte: 'Its three blocks drew your faces', etat: 'fait' });
    let res = null;
    if (b && (b.issue === 'PAYE' || b.issue === 'PLAFONNE')) res = { texte: pts(b.points) + ' → ' + (b.paie > 0n ? fmt(b.paie) + ' USDC paid to you' + (b.manque > 0n ? ' (' + fmt(b.manque) + ' short of the ' + fmt(b.prix) + ' prize)' : '') : 'no prize'), etat: 'fait' };
    else if (ligne && Number.isInteger(ligne.points) && posees) res = { texte: pts(ligne.points) + ' → ' + (ligne.prix > 0n ? 'prize ' + fmt(ligne.prix) + ' USDC (the contract\'s table)' + (ligne.decision === 'COURT' ? '; the pot pays ' + fmt(ligne.paie) + ' now' : '') : 'no prize'), etat: 'fait' };
    else if (ligne && ligne.decision === 'PERDU') res = { texte: 'Not settled in time — lost', etat: 'fait' };
    etapes.push(res ? { cle: 'resultat', ...res } : { cle: 'resultat', texte: 'Result: points per trait and the prize', etat: 'attente' });
  }

  /* L ACTION SUIVANTE : le plan entier d abord (les boutons de la carte le suivent), puis le spin suivi, puis le bilan */
  const action = (cle, texte, bouton = null) => ({ etapes, action: { cle, texte, bouton }, spin: id });
  if (arret) return action(ACTIONS.ARRET, 'Your token payment stopped part-way: the line below says what went through, with its buttons.');
  const lot = lignes.filter((l) => l.decision === 'LOT');
  const somme = lot.reduce((s, l) => s + l.paie, 0n);
  if (lot.length && somme > 0n) {
    const reste = Math.min(...lot.map((l) => l.blocsRestants));
    return action(ACTIONS.REGLER, 'Settle now — ' + secondesTexte(reste, msParBloc) + ' left' + (lot.length > 1 ? ' for ' + lot.length + ' spins' : '') + ': ' + fmt(somme) + ' USDC'
      + (regleurOn ? '. The server\'s keeper also settles it on its own.' : '.'), 'regler');
  }
  const court = lot.length ? null : lignes.find((l) => l.decision === 'COURT' && l.paie > 0n) || null;
  if (court) return action(ACTIONS.ACCEPTER, 'Accept what the pot holds: ' + fmt(court.paie) + ' USDC for spin #' + court.id + ' (' + fmt(court.manque) + ' short) — ' + secondesTexte(court.blocsRestants, msParBloc) + ' left.', 'accepter');
  if (ligne && ligne.decision === 'ATTENDRE') return regleurOn
    ? action(ACTIONS.ATTENDRE_REGLEUR, 'Nothing to do: the server\'s keeper settles it once its blocks are in.')
    : action(ACTIONS.ATTENDRE, 'Nothing to do yet: Settle opens once its 3 blocks are in (' + ligne.blocsAvant + ' to go).');
  if (lot.length) return action(ACTIONS.SANS_PRIX, 'Nothing to do: no prize. Settle only adds its points.', 'regler');
  const vide = lignes.find((l) => l.decision === 'COURT');
  if (vide) return action(ACTIONS.POT_VIDE, 'Nothing to do now: the pot is empty — wait for it to grow (' + secondesTexte(vide.blocsRestants, msParBloc) + ' left).');
  /* un spin perdu : celui suivi, ou (aucun spin suivi : les rouleaux ne montrent pas un spin sans faces) le premier perdu de la liste */
  const perdu = ligne && ligne.decision === 'PERDU' ? ligne : !ligne && !b ? lignes.find((l) => l.decision === 'PERDU') || null : null;
  if (perdu || (b && (b.issue === 'FENETRE' || b.issue === 'PERDU'))) return action(ACTIONS.PERDU, 'Lost: the ' + FENETRE + '-block window of spin #' + (perdu ? perdu.id : b.id) + ' closed.');
  if (b && b.issue === 'PAYE') return b.paie > 0n ? action(ACTIONS.PAYE, 'Nothing to do: ' + fmt(b.paie) + ' USDC is in your wallet.') : action(ACTIONS.SANS_PRIX, 'Nothing to do: no prize.');
  if (b && b.issue === 'PLAFONNE') return action(ACTIONS.PLAFONNE, 'Nothing to do: the pot paid ' + fmt(b.paie) + ' USDC to your wallet.');
  if (b && b.issue === 'REGLE_AILLEURS') return action(ACTIONS.REGLE_AILLEURS, 'Nothing to do: another transaction settled it; the prize went to you.');
  if ((ligne && ligne.decision === 'NON_LU') || (b && b.issue === 'NON_LU')) return action(ACTIONS.NON_LU, 'Its result was not read just now — this panel reads it again in a few seconds.');
  return action(ACTIONS.JOUER, 'Spin: the next three Base blocks draw your three faces.');
}

/** le panneau en HTML (les textes sont echappes) : la liste des etapes */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function etapesHtml(etapes) {
  return (etapes || []).map((e, i) => '<li data-etat="' + esc(e.etat) + '" data-cle="' + esc(e.cle) + '"><b>' + (i + 1) + '</b> ' + esc(e.texte) + '</li>').join('');
}
