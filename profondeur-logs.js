/* QUEL NOEUD METTRE DEVANT POUR UNE LECTURE D HISTORIQUE PROFOND.
 *
 * ⛔⛔ LE FAIT MESURE (2026-09-30, deux lectures par point, refus STABLES donc politique et non
 *   etranglement) : `base-rpc.publicnode.com` sert un `eth_getLogs` jusqu a -5 000 blocs et le
 *   REFUSE des -10 000 avec « Archive requests require a personal token » (HTTP 403).
 *   `mainnet.base.org` repond, lui : 14/14 sur le meme balayage.
 *
 * CE QUE CA COUTAIT : la lecture de memoire du Brain balaie 60 000 blocs, soit DOUZE FOIS au-dela
 * du seuil. Mesure en production locale : **75 appels HTTP pour 16 fenetres**, 15 des 16 rejouees
 * apres un 403 — la lecture prend 16 a 26 s. Et quand les reprises s epuisent, des fenetres se
 * perdent vraiment : un run a rendu « 13 window(s) could not be read ».
 *
 * ⛔⛔⛔ ON REORDONNE, ON NE RETIRE RIEN. La regle est deja ecrite dans `app.html` pour le plafond
 *   de 9 adresses : « une optimisation qui supprime un repli transforme un ralentissement en
 *   panne ». Si base.org tombe, la rotation doit reprendre comme avant.
 *
 * ⛔ ET LE SEUIL EST UN ENCADREMENT, PAS UNE VALEUR EXACTE. La grille mesuree a un trou entre
 *   5 000 et 10 000. On declenche donc a la derniere profondeur MESUREE COMME SERVIE : au-dela de
 *   5 000, on met devant le noeud qui sait. Pretendre connaitre la valeur exacte affirmerait plus
 *   que la mesure — et un seuil trop haut renverrait le trafic vers le refus.
 */

/** Derniere profondeur MESUREE comme servie par publicnode, en blocs. */
export const PROFONDEUR_SERVIE_MESUREE = 5000;

/** Premiere profondeur MESUREE comme refusee, en blocs. Gardee pour que l ecart soit lisible. */
export const PROFONDEUR_REFUSEE_MESUREE = 10000;

export const ETATS_PROFONDEUR = Object.freeze(['PROFONDE', 'RECENTE', 'INCONNUE']);

/**
 * Cette lecture plonge-t-elle au-dela de ce que le noeud par defaut sert ?
 *
 * ⛔ REND 'INCONNUE' DES QU IL MANQUE QUELQUE CHOSE, et l appelant ne doit alors RIEN
 *   reordonner : router sur une profondeur devinee deplacerait du trafic sans raison, et
 *   pourrait l envoyer vers le noeud qui refuse.
 * ⛔ `tete` doit etre un entier fini. Sans elle, une profondeur n a pas de sens.
 */
export function etatProfondeur(params, tete, seuil = PROFONDEUR_SERVIE_MESUREE) {
  if (!Number.isInteger(tete) || tete <= 0) return { etat: 'INCONNUE', profondeur: null, pourquoi: 'TETE_INCONNUE' };
  if (!Number.isInteger(seuil) || seuil < 0) return { etat: 'INCONNUE', profondeur: null, pourquoi: 'SEUIL_INVALIDE' };
  const f = params && typeof params === 'object' ? params.fromBlock : null;
  if (typeof f !== 'string' || !/^0x[0-9a-fA-F]+$/.test(f)) {
    /* Un `fromBlock` absent ou symbolique (« earliest », « latest ») n est pas une profondeur
     * chiffrable. ⛔ « earliest » est POURTANT le cas le plus profond possible — on le nomme
     * plutot que de le confondre avec une lecture recente. */
    if (f === 'earliest') return { etat: 'PROFONDE', profondeur: tete, pourquoi: 'EARLIEST' };
    return { etat: 'INCONNUE', profondeur: null, pourquoi: 'FROMBLOCK_NON_CHIFFRABLE' };
  }
  const de = parseInt(f, 16);
  if (!Number.isFinite(de) || de < 0) return { etat: 'INCONNUE', profondeur: null, pourquoi: 'FROMBLOCK_ILLISIBLE' };
  /* Une fenetre au-dela de la tete est une erreur d appelant, pas une lecture profonde. */
  if (de > tete) return { etat: 'INCONNUE', profondeur: null, pourquoi: 'FROMBLOCK_AU_DELA_DE_LA_TETE' };
  const profondeur = tete - de;
  return { etat: profondeur > seuil ? 'PROFONDE' : 'RECENTE', profondeur, pourquoi: null };
}

/**
 * L ordre des noeuds pour cette lecture. Rend TOUJOURS les memes noeuds, seul l ordre change.
 *
 * ⛔ GARDE D IMPOSSIBILITE : la liste rendue doit contenir exactement les memes elements que
 *   celle recue. Un reordonnancement qui PERD un noeud serait une panne deguisee en optimisation.
 */
export function ordreNoeuds(noeuds, etat, servant) {
  const base = Array.isArray(noeuds) ? noeuds.filter((u) => typeof u === 'string' && u) : [];
  if (!base.length) return [];
  if (!etat || etat.etat !== 'PROFONDE') return [...base];
  if (typeof servant !== 'string' || !servant) return [...base];
  if (!base.includes(servant)) return [...base];   /* on n INVENTE pas un noeud */
  return [servant, ...base.filter((u) => u !== servant)];
}

/** La phrase du diagnostic, pour une console ou un panneau de mesure — jamais pour l ecran public. */
export function phraseProfondeur(etat) {
  if (!etat || !ETATS_PROFONDEUR.includes(etat.etat)) return 'Depth: not computed.';
  if (etat.etat === 'INCONNUE') {
    return 'Depth unknown (' + (etat.pourquoi || 'unknown') + ') — node order left untouched.';
  }
  if (etat.etat === 'RECENTE') {
    return 'Recent read (' + etat.profondeur + ' blocks back) — default node order.';
  }
  return 'Deep read (' + etat.profondeur + ' blocks back, past the ' + PROFONDEUR_SERVIE_MESUREE
    + ' measured as served) — putting the archive-capable node first.';
}
