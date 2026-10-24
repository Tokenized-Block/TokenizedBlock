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
  PERDU: 'PERDU', PAYE: 'PAYE', PLAFONNE: 'PLAFONNE', REGLE_AILLEURS: 'REGLE_AILLEURS', NON_LU: 'NON_LU', ARRET: 'ARRET', JOUER: 'JOUER', POSE: 'POSE',
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
  /* 2026-10-24 (revue 3) : un AUTRE spin vivant a cote du spin suivi (un ancien reglable, un recent en attente) : chaque ligne nomme son spin */
  const nomme = !!id && lignes.some((l) => String(l.id) !== id && l.decision !== 'PERDU');
  const pre = nomme ? 'Spin #' + id + ': ' : '';
  const rien = 'Nothing to do' + (nomme ? ' for spin #' + id : '') + ': ';
  /* ⛔ 2026-10-24 (revue 3, defaut 1) : un resultat a dire (des points, un prix, un paiement) tant que la 3e face n est pas posee = AUCUN prix
   *   n est dit, ni dans les etapes ni dans l action : « Landing… » seulement */
  const aUnPrix = (!!ligne && Number.isInteger(ligne.points)) || (!!b && (b.issue === 'PAYE' || b.issue === 'PLAFONNE' || (b.issue === 'REGLE_AILLEURS' && Number.isInteger(b.points))));
  const enVol = !!id && !posees && aUnPrix;

  /* LES ETAPES du spin suivi */
  const etapes = [];
  if (id) {
    etapes.push({ cle: 'envoye', texte: 'Sent — spin #' + id, etat: 'fait' });
    const t = suivi.t === null || suivi.t === undefined ? null : Number(suivi.t);
    if (t !== null && Number.isSafeInteger(t)) {
      const ns = blocsDesFaces(t), liste = ns.map((x) => x.toLocaleString('en-US')).join(', ');
      const dans = Number.isSafeInteger(Number(tete)) ? Math.max(0, Math.min(3, Number(tete) - t + 1)) : 0;
      if (dans < 3) etapes.push({ cle: 'blocs', texte: pre + 'Waiting for blocks ' + liste + ' — ' + dans + ' of 3 in', etat: 'encours' });
      else if (!posees) etapes.push({ cle: 'blocs', texte: pre + 'Blocks ' + liste + ' are in — the reels are landing', etat: 'encours' });
      else etapes.push({ cle: 'blocs', texte: pre + 'Blocks ' + liste + ' drew your three faces', etat: 'fait' });
    } else etapes.push(enVol ? { cle: 'blocs', texte: pre + 'Its three blocks are in — the reels are landing', etat: 'encours' } : { cle: 'blocs', texte: pre + 'Its three blocks drew your faces', etat: 'fait' });
    let res = null;
    if (enVol) res = null;
    else if (b && (b.issue === 'PAYE' || b.issue === 'PLAFONNE')) res = { texte: pts(b.points) + ' → ' + (b.paie > 0n ? fmt(b.paie) + ' USDC paid to you' + (b.manque > 0n ? ' (' + fmt(b.manque) + ' short of the ' + fmt(b.prix) + ' prize)' : '') : 'no prize'), etat: 'fait' };
    else if (b && b.issue === 'REGLE_AILLEURS') res = { texte: regleAilleurs(b, fmt), etat: 'fait' };
    else if (ligne && Number.isInteger(ligne.points) && posees) res = { texte: pts(ligne.points) + ' → ' + (ligne.prix > 0n ? 'prize ' + fmt(ligne.prix) + ' USDC (the contract\'s table)' + (ligne.decision === 'COURT' ? '; the pot pays ' + fmt(ligne.paie) + ' now' : '') : 'no prize'), etat: 'fait' };
    else if (ligne && ligne.decision === 'PERDU') res = { texte: 'Not settled in time — lost', etat: 'fait' };
    etapes.push(res ? { cle: 'resultat', etat: res.etat, texte: pre + res.texte } : { cle: 'resultat', texte: pre + 'Result: points per trait and the prize', etat: 'attente' });
  }

  /* L ACTION SUIVANTE : le plan entier d abord (les boutons de la carte le suivent), puis le spin suivi, puis le bilan */
  const action = (cle, texte, bouton = null) => ({ etapes, action: { cle, texte, bouton }, spin: id });
  if (arret) return action(ACTIONS.ARRET, 'Your token payment stopped part-way: the line below says what went through, with its buttons.');
  if (enVol) return action(ACTIONS.POSE, 'Landing…');
  const lot = lignes.filter((l) => l.decision === 'LOT');
  const somme = lot.reduce((s, l) => s + l.paie, 0n);
  /* le lot nomme ses spins des qu il n est pas EXACTEMENT le spin suivi */
  const seul = lot.length === 1 && String(lot[0].id) === id;
  const leLot = lot.length === 1 ? 'spin #' + lot[0].id : 'spins ' + lot.map((l) => '#' + l.id).join(', ');
  if (lot.length && somme > 0n) {
    const reste = Math.min(...lot.map((l) => l.blocsRestants));
    return action(ACTIONS.REGLER, (seul ? 'Settle now' : 'Settle ' + leLot + ' now') + ' — ' + secondesTexte(reste, msParBloc) + ' left: ' + fmt(somme) + ' USDC'
      + (regleurOn ? '. The server\'s keeper also settles ' + (lot.length > 1 ? 'them' : 'it') + ' on its own.' : '.'), 'regler');
  }
  const court = lot.length ? null : lignes.find((l) => l.decision === 'COURT' && l.paie > 0n) || null;
  if (court) return action(ACTIONS.ACCEPTER, 'Accept what the pot holds: ' + fmt(court.paie) + ' USDC for spin #' + court.id + ' (' + fmt(court.manque) + ' short) — ' + secondesTexte(court.blocsRestants, msParBloc) + ' left.', 'accepter');
  if (ligne && ligne.decision === 'ATTENDRE') return regleurOn
    ? action(ACTIONS.ATTENDRE_REGLEUR, 'Nothing to do: the server\'s keeper settles ' + (nomme ? 'spin #' + id : 'it') + ' once its blocks are in.')
    : action(ACTIONS.ATTENDRE, 'Nothing to do yet' + (nomme ? ' for spin #' + id : '') + ': Settle opens once its 3 blocks are in (' + ligne.blocsAvant + ' to go).');
  if (lot.length) return action(ACTIONS.SANS_PRIX, 'Nothing to do: no prize' + (seul ? '' : ' for ' + leLot) + '. Settle only adds ' + (lot.length > 1 ? 'their' : 'its') + ' points.', 'regler');
  const vide = lignes.find((l) => l.decision === 'COURT');
  if (vide) return action(ACTIONS.POT_VIDE, 'Nothing to do now: the pot is empty — wait for it to grow (' + (String(vide.id) !== id || nomme ? 'spin #' + vide.id + ', ' : '') + secondesTexte(vide.blocsRestants, msParBloc) + ' left).');
  /* un spin perdu : celui suivi, ou (aucun spin suivi : les rouleaux ne montrent pas un spin sans faces) le premier perdu de la liste */
  const perdu = ligne && ligne.decision === 'PERDU' ? ligne : !ligne && !b ? lignes.find((l) => l.decision === 'PERDU') || null : null;
  if (perdu || (b && (b.issue === 'FENETRE' || b.issue === 'PERDU'))) return action(ACTIONS.PERDU, 'Lost: the ' + FENETRE + '-block window of spin #' + (perdu ? perdu.id : b.id) + ' closed.');
  if (b && b.issue === 'PAYE') return b.paie > 0n ? action(ACTIONS.PAYE, rien + fmt(b.paie) + ' USDC is in your wallet.') : action(ACTIONS.SANS_PRIX, rien + 'no prize.');
  if (b && b.issue === 'PLAFONNE') return action(ACTIONS.PLAFONNE, rien + 'the pot paid ' + fmt(b.paie) + ' USDC to your wallet.');
  /* 2026-10-24 (revue 3, defaut 2) : regle par une AUTRE transaction (le regleur du serveur, ou n importe qui) : dit, avec ce qu il a paye s il est lu */
  if (b && b.issue === 'REGLE_AILLEURS') return action(ACTIONS.REGLE_AILLEURS, rien + 'another transaction settled it (the server\'s keeper, or anyone)'
    + (typeof b.paie === 'bigint' ? ' — ' + (b.paie > 0n ? fmt(b.paie) + ' USDC went to your wallet.' : 'no prize.') : '; any prize went to you.'));
  if ((ligne && ligne.decision === 'NON_LU') || (b && b.issue === 'NON_LU')) return action(ACTIONS.NON_LU, (nomme ? 'The result of spin #' + id : 'Its result') + ' was not read just now — this panel reads it again in a few seconds.');
  return action(ACTIONS.JOUER, 'Spin: the next three Base blocks draw your three faces.');
}
/* le resultat d un spin regle AILLEURS : ce qu il a paye, et d ou vient le chiffre (son evenement Settled, ou recalcule de ses faces) */
function regleAilleurs(b, fmt) {
  const source = b.source === 'evenement' ? 'read from its Settled event' : 'computed from its faces and the contract\'s table; its Settled event was not read';
  if (typeof b.paie === 'bigint' && Number.isInteger(b.points)) return 'Settled — ' + (b.paie > 0n ? fmt(b.paie) + ' USDC paid to you' : 'no prize') + ' (' + pts(b.points) + '; ' + source + ')';
  if (Number.isInteger(b.points) && typeof b.prix === 'bigint') return 'Settled — ' + pts(b.points) + ', prize ' + fmt(b.prix) + ' USDC; the amount paid was not read';
  return 'Settled by another transaction — its result was not read';
}
/** le panneau en HTML (les textes sont echappes) : la liste des etapes */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function etapesHtml(etapes) {
  return (etapes || []).map((e, i) => '<li data-etat="' + esc(e.etat) + '" data-cle="' + esc(e.cle) + '"><b>' + (i + 1) + '</b> ' + esc(e.texte) + '</li>').join('');
}
