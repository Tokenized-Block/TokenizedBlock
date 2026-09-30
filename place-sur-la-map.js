/* QUI A SA PLACE SUR LA MAP QUAND ELLE EST PLEINE.
 *
 * ⛔⛔⛔ LE DEFAUT MESURE (2026-09-30, production, signale par Phil qui ne les voyait plus) :
 *   la map pose d abord les creations des dernieres 24 h — 461 ce jour-la — puis ajoute les
 *   blocks du marche sous la condition `habitants.length < 450`. Le plafond etait donc DEJA
 *   atteint, et les 15 actions tokenisees n entraient jamais. NVDAc, n°1 du classement a
 *   4 346 212 $, etait INVISIBLE sur la carte pendant que 461 blocks tout neufs, presque tous
 *   sans marche lisible, occupaient toute la place.
 *
 * ⇒ CE N EST PAS UN OUBLI, C EST UNE INVERSION DE PRIORITE : le plafond protegeait la fluidite,
 *   mais il servait « premier arrive, premier servi » — et les premiers arrives sont les plus
 *   recents, pas les plus importants.
 *
 * ⛔ ON NE SUPPRIME PAS LE PLAFOND. Une map sans limite, c est la fluidite qui tombe pour tout le
 *   monde ; « une optimisation qui supprime un repli transforme un ralentissement en panne » vaut
 *   dans les deux sens. On RESERVE une place a ceux qui ont un marche, et leur nombre est BORNE
 *   par le serveur (216 lignes cotees ce jour-la), donc la reserve ne peut pas exploser.
 */

/**
 * ⛔⛔ PLUS DE PLAFOND (Phil, 2026-09-30 : « au max pas de plafond sur la maps »).
 *
 * L ancien valait 450, et c est lui qui rendait NVDAc invisible. Phil a tranche : tous les
 * blocks entrent. `null` veut dire « aucune limite », et c est ECRIT comme tel plutot que
 * cache derriere un tres grand nombre — un `999999` se lit comme une limite qu on a le droit
 * de baisser, un `null` se lit comme une decision.
 *
 * ⚠️ CE QUE CA COUTE, ET IL FAUT LE MESURER, PAS LE SUPPOSER : le serveur suivait 1 068 blocks
 *   le jour de la decision, et ce nombre monte. La limite protegeait la fluidite sur telephone.
 *   Si un jour la map rame, la reponse n est PAS de remettre un « premier arrive, premier
 *   servi » — c est ce reglage-la qui effaçait les plus gros. Il faudrait alors une limite qui
 *   trie par importance, et `placePourLeBlock` sait deja le faire : repasser `plafond` a un
 *   nombre suffit, la reserve aux cotes reprend son role.
 */
export const PLAFOND_MAP = null;

/** Ce qu on accepte EN PLUS, et seulement pour des blocks qui ont un marche lisible.
 *  ⛔ Sans plafond, ce nombre ne sert plus — il reste parce que le jour ou une limite revient,
 *    c est lui qui empeche de refaire la faute d origine. */
export const RESERVE_COTES = 260;

export const VERDICTS = Object.freeze(['POSER', 'REFUSER']);

/**
 * Ce block a-t-il un marche lisible ? C est ce qui lui donne droit a la reserve.
 * ⛔ UN CHIFFRE ABSENT N EST PAS UN ZERO : sans FDV ni volume lus, on ne le declare pas cote —
 *   sinon la reserve accueillerait tout, et ne reserverait plus rien.
 */
export function aUnMarche(ligne) {
  if (!ligne || typeof ligne !== 'object') return false;
  const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  return n(ligne.fdvUsd) > 0 || n(ligne.volume24hUsd) > 0 || n(ligne.liquiditeUsd) > 0;
}

/**
 * Faut-il poser ce block ?
 *
 * ⛔ DEUX PLAFONDS, ET LE SECOND NE S OUVRE QU AUX COTES. Un block sans marche ne passe jamais
 *   au-dela du premier : la reserve existe pour les gros, pas pour agrandir la map.
 */
export function placePourLeBlock({ dejaPoses, ligne, plafond = PLAFOND_MAP, reserve = RESERVE_COTES }) {
  const n = Number(dejaPoses);
  if (!Number.isFinite(n) || n < 0) return { verdict: 'REFUSER', pourquoi: 'COMPTE_INVALIDE' };
  /* ⛔ `null` = AUCUNE LIMITE (decision de Phil). Tout le monde entre, coté ou non — c est le
   *   contraire exact du reglage qui effaçait NVDAc. On le traite AVANT les autres gardes :
   *   sans plafond, un compte valide suffit. */
  if (plafond === null) return { verdict: 'POSER', pourquoi: 'SANS_PLAFOND' };
  if (!Number.isInteger(plafond) || plafond < 0) return { verdict: 'REFUSER', pourquoi: 'PLAFOND_INVALIDE' };
  if (!Number.isInteger(reserve) || reserve < 0) return { verdict: 'REFUSER', pourquoi: 'RESERVE_INVALIDE' };
  if (n < plafond) return { verdict: 'POSER', pourquoi: 'SOUS_LE_PLAFOND' };
  if (aUnMarche(ligne) && n < plafond + reserve) {
    return { verdict: 'POSER', pourquoi: 'RESERVE_AUX_COTES' };
  }
  return { verdict: 'REFUSER', pourquoi: aUnMarche(ligne) ? 'RESERVE_PLEINE' : 'PLAFOND_ATTEINT' };
}

/** La phrase du refus, pour une note de mesure — jamais pour l ecran public. */
export function phrasePlace(v) {
  if (!v || !VERDICTS.includes(v.verdict)) return 'Map slot: not computed.';
  if (v.verdict === 'POSER') {
    if (v.pourquoi === 'SANS_PLAFOND') return 'Placed — the map takes every block.';
    return v.pourquoi === 'RESERVE_AUX_COTES'
      ? 'Placed using the slots kept for blocks that have a readable market.'
      : 'Placed — the map is below its cap.';
  }
  return v.pourquoi === 'PLAFOND_ATTEINT'
    ? 'Not placed: the map is full and this block has no readable market.'
    : 'Not placed: even the reserved slots are full.';
}
