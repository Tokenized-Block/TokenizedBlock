// cerveau-echange.js — LE BLOCK SAIT QUAND IL EST SUR LE POINT DE DISPARAITRE DE L INDEX.
// ================================================================================================
// ⛔⛔ DEMANDE DE PHIL (2026-09-22) : « fais le cerveau qui echange tout seul une fois par jour ».
//     CE MODULE FAIT LA MOITIE QUI LUI REVIENT : il DECIDE, tout seul, une fois par jour. Il ne
//     signe pas, et il ne peut pas — `test-cerveau-ne-signe-pas.mjs` decouvre automatiquement tout
//     `*cerveau*.js` du dossier et refuserait une cle, un `eval`, un `fetch`, un `sendTransaction`.
//     Ce fichier est donc sous la garde depuis la seconde ou il a ete cree.
//
// ⛔ CE QUE LA SEPARATION COUTE, DIT FRANCHEMENT : le block ne devient pas actif sans que personne
//    ne fasse rien. Il RECLAME, tous les jours, au bon moment, avec la raison chiffree. Un vrai
//    « tout seul » de bout en bout demanderait une cle chaude par block — ce qui rend le produit
//    custodial et retire exactement la propriete qu il vend. Ce n est pas un choix technique, c est
//    la regle du jeu ecrite dans `cerveau.js` : « il ne trade pas ».
//
// ⛔⛔ SUR QUOI LA DECISION S APPUIE, ET C EST MESURE, PAS SUPPOSE (2026-09-22,
//     `ce-qui-garde-liste.mjs`, 5 804 jetons B20 nes en 14 j sur Base) :
//       · 20 jetons listes sur 306. TOUS ont bouge. Silence median 4,7 h, MAXIMUM 23,2 h.
//         ⇒ aucun marche liste n est muet depuis plus de 24 h.
//       · actifs < 24 h avec au moins 3 transferts : 20 listes sur 20, aucune exception.
//       · les 2 seuls actifs non listes ont exactement 2 transferts — le mint et la mise en pool :
//         ils ont BOUGE sans jamais avoir ete ECHANGES.
//
// ⛔ CE QUE LA MESURE NE DIT PAS, ET QUE CE MODULE NE DIRA DONC JAMAIS : que faire un echange
//    REMET dans l index. « Echanger garde la place » et « avoir la place amene des echanges »
//    produisent exactement le meme tableau ; un instantane ne les separe pas. Le panel
//    (`panel-indexation.json`) tranchera. Jusque-la, le block RAPPORTE ce qui a ete observe et ne
//    promet aucun effet. Une phrase qui promettrait le retour serait une promesse invendable.
//
// ⛔ AUCUNE PROMESSE DE PRIX, AUCUN CONSEIL. Le block dit qu il va sortir d un annuaire, pas que
//    son jeton va monter. C est la meme regle que `journal-cerveau.js`.
//
// ⛔ PUR : aucune lecture reseau, aucun DOM, aucune horloge. Tous les faits ENTRENT. Un module qui
//    irait chercher l heure ou la chaine lui-meme deviendrait sa propre source, et plus personne ne
//    pourrait recalculer ce qu il a decide — ce qui casserait la regle n°2 de Phil (2026-09-13) :
//    le cerveau est une fonction PURE, verifiable par n importe qui.

/** La borne mesuree : aucun marche liste n etait muet depuis plus que ca. */
export const SILENCE_MAX_MESURE_H = 23.2;

/** En dessous de ce nombre de transferts, le jeton a BOUGE sans avoir ete ECHANGE.
 * ⛔ 3 ET PAS 2 : les deux seuls actifs non listes de la mesure ont exactement 2 transferts — le
 *    mint et la mise en pool. C est la frontiere entre « a bouge » et « a ete echange ».
 * ⚠️ ET CETTE COUPURE A ETE CHOISIE APRES AVOIR VU LES DONNEES. Elle n est pas arbitraire, mais
 *    une coupure post hoc ne se valide pas sur les donnees qui l ont suggeree : c est la prochaine
 *    execution du panel, sur d autres jetons, qui la testera vraiment. En attendant elle est
 *    ECRITE ICI comme une hypothese, pas comme un fait. */
export const TRANSFERTS_MIN_ECHANGE = 3;

/** Quand le block reclame, en heures de silence.
 * ⛔ 18 H ET PAS 23 : la borne mesuree est a 23,2 h, mais reclamer a 23 h supposerait que l humain
 *    soit devant son ecran dans l heure. Les six heures d avance ne sont pas de la prudence
 *    decorative — elles sont la difference entre une demande qu on peut satisfaire et une demande
 *    qui arrive apres la bascule. */
export const RECLAMER_A_H = 18;

/** Un rappel par jour au maximum. ⛔ Demande explicite de Phil (« une fois par jour »), et c est
 *  aussi la seule facon qu un rappel quotidien ne devienne pas un harcelement a chaque battement —
 *  le cerveau bat toutes les ~90 s. */
export const ECART_MIN_RAPPEL_H = 24;

/** Les etats possibles. ⛔ JAMAIS UN BOOLEEN : « faut-il agir ? oui/non » confondrait « pas encore »
 *  (tout va bien), « deja sorti » (le geste est different), « jamais echange » (il en faut
 *  plusieurs) et « pas mesurable » (ne rien affirmer). Quatre causes, quatre gestes. */
export const ETATS = Object.freeze(['NON_MESURE', 'DEJA_PROPOSE', 'PAS_ENCORE', 'BIENTOT_PERDU',
  'DEJA_PERDU', 'JAMAIS_ECHANGE']);

/**
 * Le block decide s il doit reclamer un echange aujourd hui.
 *
 * @param {object} faits — TOUS lus ailleurs, aucun n est devine ici
 * @param {number|null} faits.silenceH        heures depuis le dernier Transfer on-chain, `null` si aucun
 * @param {number|null} faits.transferts      nombre de Transfer vus dans la fenetre
 * @param {number|null} faits.depuisRappelH   heures depuis le dernier rappel, `null` si jamais
 * @param {boolean|null} faits.listeMaintenant l index le connait-il, `null` si non lu
 * @returns {{etat:string, reclame:boolean, pourquoi:string, texte:string|null, signeParUtilisateur:true}}
 *
 * ⛔ FAIL-CLOSED : une entree qu on ne sait pas lire rend NON_MESURE et ne reclame RIEN. Reclamer
 *    sur une lecture ratee ferait signer un humain pour une raison inventee — c est le seul defaut
 *    ici dont le cout se compte en argent reel.
 * ⛔ `NaN` EST REFUSE EXPLICITEMENT : `NaN < 18` et `NaN > 24` sont tous les deux faux, donc un NaN
 *    traverserait toutes les bornes sans en declencher aucune et sortirait par le dernier `else`.
 */
export function decisionEchange(faits) {
  const f = faits || {};
  const nombreOuNull = (x) => (x === null || x === undefined ? null : (Number.isFinite(x) ? Number(x) : undefined));
  const silenceH = nombreOuNull(f.silenceH);
  const transferts = nombreOuNull(f.transferts);
  const depuisRappelH = nombreOuNull(f.depuisRappelH);

  if (silenceH === undefined || transferts === undefined || depuisRappelH === undefined
    || transferts === null || transferts < 0 || (silenceH !== null && silenceH < 0)) {
    return sortie('NON_MESURE', false,
      'ses faits n ont pas pu etre lus — il ne reclame rien plutot que de reclamer au hasard', null);
  }

  /* ⛔ LE SILENCE PASSE AVANT LE RAPPEL. Un block deja sorti de l index et qui n a jamais rien
   *    demande doit pouvoir parler meme si un rappel est recent — sinon un premier rappel mal
   *    place le tairait pour toujours. Mais un rappel recent bloque bien la repetition. */
  if (depuisRappelH !== null && depuisRappelH < ECART_MIN_RAPPEL_H) {
    return sortie('DEJA_PROPOSE', false,
      'il a deja demande il y a ' + arr(depuisRappelH) + ' h — une fois par jour, pas plus', null);
  }

  if (transferts < TRANSFERTS_MIN_ECHANGE) {
    return sortie('JAMAIS_ECHANGE', true,
      'il a ete cree et mis en marche, mais jamais echange : ' + transferts + ' mouvement(s) en tout. '
      + 'Dans la mesure du 2026-09-22, les deux seuls marches actifs qui restaient inconnus de '
      + 'l index etaient exactement dans ce cas',
      'Your block has moved ' + transferts + ' time(s) — that is its birth, not trading. Every market '
      + 'the public index listed had traded at least three times.');
  }

  if (silenceH === null) {
    return sortie('DEJA_PERDU', true,
      'aucun mouvement dans la fenetre lue — on ne sait pas depuis quand, seulement que c est plus '
      + 'long que la fenetre',
      'Your block has not moved at all in the window we can read. Every market the public index '
      + 'listed had traded within the last day.');
  }

  if (silenceH >= 24) {
    return sortie('DEJA_PERDU', true,
      'muet depuis ' + arr(silenceH) + ' h, au-dela des ' + SILENCE_MAX_MESURE_H
      + ' h qui bornaient les marches listes le 2026-09-22',
      'Your block has been quiet for ' + arr(silenceH) + ' hours. On the day this was measured, no '
      + 'market in the public index had been quiet for more than ' + SILENCE_MAX_MESURE_H + ' hours.');
  }

  if (silenceH >= RECLAMER_A_H) {
    return sortie('BIENTOT_PERDU', true,
      'muet depuis ' + arr(silenceH) + ' h ; la borne mesuree est ' + SILENCE_MAX_MESURE_H + ' h',
      'Your block has been quiet for ' + arr(silenceH) + ' hours. Markets in the public index had all '
      + 'traded within the last day — there are about ' + arr(24 - silenceH) + ' hours left before '
      + 'yours passes that mark.');
  }

  return sortie('PAS_ENCORE', false,
    'muet depuis ' + arr(silenceH) + ' h seulement — rien a demander', null);
}

const arr = (x) => Math.round(x * 10) / 10;

/**
 * Convertit « dernier bloc vu » en « heures de silence ».
 * ⛔ CETTE CONVERSION EST ICI, ET PAS DANS L ECRAN, PARCE QUE L ECRAN NE SE TESTE PAS. Trois
 *    regressions sont deja parties en production par le chemin de Create ; ce qui peut vivre dans
 *    un module pur y vit, et la colle ne fait plus que passer des valeurs.
 * ⛔ REND `null` DANS TOUS LES CAS DOUTEUX, jamais un nombre : `cerveau-echange` traite `null`
 *    comme « aucun mouvement dans la fenetre », qui est un etat nomme. Un nombre faux, lui,
 *    traverserait les bornes et ferait reclamer un echange sans raison.
 * ⛔ UN `dernierBloc` PLUS GRAND QUE `blocFin` REND `null` ET PAS UN NEGATIF : ca veut dire que les
 *    deux nombres viennent de lectures differentes, donc qu on ne sait pas. Un silence negatif
 *    passerait pour « tres recent » et endormirait le block exactement quand il ne faut pas.
 */
export function silenceDepuisBlocs({ dernierBloc, blocFin, blocsParJour = 43200 }) {
  if (!Number.isFinite(dernierBloc) || !Number.isFinite(blocFin)) return null;
  if (!Number.isFinite(blocsParJour) || blocsParJour <= 0) return null;
  if (dernierBloc > blocFin) return null;
  return ((blocFin - dernierBloc) * 24) / blocsParJour;
}

/** ⛔ CHAQUE SORTIE PORTE `signeParUtilisateur: true`, comme tout ce que le cerveau propose. Ce
 *  n est pas decoratif : `test-cerveau-ne-signe-pas.mjs` refuse qu une proposition existe sans. */
function sortie(etat, reclame, pourquoi, texte) {
  return { etat, reclame, pourquoi, texte, signeParUtilisateur: true };
}

/**
 * Ce que le block demande, en clair, quand il reclame.
 * ⛔ IL DECRIT UN GESTE, IL NE LE PREPARE PAS. Aucun montant, aucune adresse, aucun calldata : ce
 *    module ne sait rien de la pool et n a pas a le savoir. Ce qui se signe se construit sur le
 *    chemin de Launch, ou l humain voit ce qu il signe.
 * ⛔ ET IL NE PROMET PAS LE RETOUR DANS L INDEX. La mesure dit ce que les marches listes avaient en
 *    commun ; elle ne dit pas qu echanger y ramene. Le sens de la fleche n est pas tranche.
 */
export function phraseDemande(d) {
  if (!d || !d.reclame || !d.texte) return null;
  return d.texte + ' Trading it yourself is one way to change that — we measured what listed markets '
    + 'had in common, not that trading puts a market back.';
}
