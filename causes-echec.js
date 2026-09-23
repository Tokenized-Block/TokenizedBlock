/* causes-echec.js — POURQUOI UNE CREATION A ECHOUE, EN CATEGORIES FERMEES.
 *
 * ⛔⛔ LE PROBLEME QUE CE FICHIER RESOUD, MESURE LE 2026-09-23 EN PRODUCTION.
 *     L entonnoir affichait `cree` = 6 et `cree_echec` = 8 : plus d une tentative de creation sur
 *     deux echoue. Mais le « 8 » est ININTERPRETABLE, parce que la cause etait affichee a l ecran
 *     puis jetee. Or `envoyerDepuisWallet` distingue des situations qui n ont RIEN a voir :
 *       · REFUSE_PAR_UTILISATEUR — quelqu un a dit non dans son wallet. Normal. Sain, meme.
 *       · ANNULE_SUR_CHAINE      — la transaction a REVERTE : le visiteur a paye du gas pour rien.
 *       · MAUVAISE_CHAINE        — il est sur le mauvais reseau. Reparable par l interface.
 *     Huit refus polis et huit reverts appellent des reponses opposees. Sans la cause, le chiffre
 *     ne dit pas quoi faire — il dit seulement de s inquieter.
 *
 * ⛔ CATEGORIES FERMEES, ET C EST LA TOUTE L IDEE. La tentation etait `etape('cree_ko_' + rc.etat)`.
 *   Mauvais pour deux raisons : la cardinalite devient non bornee (un etat inconnu invente un nom
 *   de compteur), et surtout ces noms inconnus seraient rejetes par la liste blanche du serveur —
 *   EN SILENCE. On retomberait exactement dans le defaut qu on vient de corriger.
 *
 * ⛔ ANONYME PAR CONSTRUCTION. On rend une categorie parmi une liste courte et fixe. Jamais le
 *   message d erreur, jamais une adresse, jamais un hash : rien qui puisse identifier quelqu un.
 */

/** Les seules categories qui existent. ⛔ Toute autre valeur est un defaut de programmation. */
export const CAUSES = Object.freeze([
  'refus',      // la personne a decline dans son wallet — ce n est PAS un echec du produit
  'revert',     // la transaction est passee on-chain et a echoue : gas paye pour rien
  'envoi',      // l envoi n a jamais abouti (provider, reseau, wallet)
  'reseau',     // mauvaise chaine, ou chaine illisible
  'compte',     // mauvais compte, ou compte illisible
  'attente',    // envoyee, pas encore confirmee — pas un echec, un inconnu
  'autre',      // etat non classe : volontairement visible, pour qu on le remarque
]);

/* ⛔ La table est explicite et exhaustive sur les etats connus de `envoi.js`. Une table plutot
 *   qu une cascade de `if` : on voit d un coup d oeil ce qui manque quand `envoi.js` bouge. */
const TABLE = Object.freeze({
  REFUSE_PAR_UTILISATEUR: 'refus',
  ANNULE_SUR_CHAINE: 'revert',
  ECHEC_ENVOI: 'envoi',
  DESTINATION_INVALIDE: 'envoi',
  MAUVAISE_CHAINE: 'reseau',
  CHAINE_ILLISIBLE: 'reseau',
  AUTRE_COMPTE: 'compte',
  COMPTE_ILLISIBLE: 'compte',
  EN_ATTENTE: 'attente',
  REFUSE: 'autre',
});

/**
 * @param {string} etat l etat rendu par la couche d envoi
 * @returns {string} une categorie de CAUSES, toujours
 */
export function causeEchec(etat) {
  /* ⛔ FAIL-CLOSED VERS 'autre', JAMAIS VERS 'refus'. Si un etat inconnu tombait dans « refus », on
   *   lirait un bug du produit comme une decision de l utilisateur — et on ne le corrigerait
   *   jamais. La categorie par defaut doit etre celle qui DERANGE. */
  if (typeof etat !== 'string' || !etat) return 'autre';
  const c = TABLE[etat.toUpperCase()];
  return c || 'autre';
}

/** Le nom d etape correspondant, tel que le serveur doit le connaitre. */
export function etapeEchec(etat) { return 'cree_ko_' + causeEchec(etat); }

/** Tous les noms d etape possibles — la liste blanche du serveur doit les contenir TOUS. */
export const ETAPES_ECHEC = Object.freeze(CAUSES.map((c) => 'cree_ko_' + c));
