// geste-envoi.js — QUEL GESTE D ENVOI TOURNE VRAIMENT ? LE COMPTER AVANT D EN PARLER.
// ================================================================================================
// ⛔⛔ POURQUOI CE FICHIER EXISTE. Phil, 2026-09-30 : « le send frag, c est ce qui se fait le plus
//     sur notre app ». Le « send frag » est le GM — l app le dit elle-meme : « A GM is a real
//     transfer: a fragment of a block you hold, sent to someone ».
//   ⛔ OR RIEN NE LE COMPTE. Mesure du meme jour : aucun nom `gm_*` dans `ETAPES_ENTONNOIR`, et
//     aucune des 36 etapes actives ne concerne un envoi. Donc « c est ce qui se fait le plus » est
//     une CROYANCE, pas une mesure — exactement comme « zero achat » l etait avant qu on instrumente
//     le chemin d achat, ou il s est avere qu il y avait eu 2 achats reels.
//   ⇒ On compte d abord. La question « peut-on y prendre 0,1 % ? » ne se pose qu apres, et elle ne
//     se tranche pas ici : prelever sur un GESTE OFFERT entre deux personnes est une decision
//     produit, pas un detail technique.
//
// ⛔ TROIS GESTES PARTAGENT LE MEME PANNEAU D ENVOI, et c est justement pour ca qu il faut les
//   distinguer : sans ca on saurait qu il y a des envois, pas lequel domine — donc rien d utile.
//
// ⚠️ BORNE : ces compteurs disent ce que l ECRAN declenche, jamais ce qui aboutit on-chain. Un
//    `envoi_ok` veut dire « notre code a vu un CONFIRME », pas « les jetons sont arrives ».

/** ⛔ FERMEE. Un geste hors liste rendrait un nom que `/api/etape` jetterait EN SILENCE. */
export const GESTES = Object.freeze(['gm', 'message', 'send']);

/** ⛔ FERMEE AUSSI, et confrontee a `ETAPES_ENTONNOIR` par le test : un nom absent de la liste
 *  blanche vaudrait 0 pour toujours, indiscernable d un geste que personne ne fait. */
export const ETAPES_ENVOI = Object.freeze([
  'gm_clic', 'gm_refus_wallet', 'gm_refus_solde',
  'message_clic', 'message_refus_wallet', 'message_refus_solde',
  'envoi_clic', 'envoi_refus_wallet', 'envoi_refus_solde',
  'envoi_sign_propos', 'envoi_ok', 'envoi_sign_refus',
]);

/* ⛔ LE PREFIXE PAR GESTE : `send` est le geste generique, et son prefixe est `envoi` parce que la
 *   liste blanche parle deja francais pour les noms internes. Une table EXPLICITE, pas une
 *   concatenation : `send` + '_clic' aurait donne `send_clic`, absent de la liste, jete en silence. */
const PREFIXE = Object.freeze({ gm: 'gm', message: 'message', send: 'envoi' });

/**
 * Rend le nom d etape pour un geste et un moment, ou `null` si le couple n existe pas.
 * ⛔ `null` PLUTOT QU UN NOM INVENTE : emettre un nom hors liste blanche ne leverait aucune erreur
 *   et vaudrait 0 pour toujours. Mieux vaut ne rien compter que compter dans le vide.
 * @param {string} geste   l un de `GESTES`
 * @param {string} moment  'clic' | 'refus_wallet' | 'refus_solde' | 'sign_propos' | 'ok' | 'sign_refus'
 */
export function etapeDuGeste(geste, moment) {
  const g = typeof geste === 'string' ? geste.toLowerCase() : '';
  const m = typeof moment === 'string' ? moment.toLowerCase() : '';
  /* ⛔ LES MOMENTS D ISSUE SONT PARTAGES : l envoi lui-meme est le meme code pour les trois gestes,
   *   donc `sign_propos`, `ok` et `sign_refus` ne se declinent pas par geste. Les decliner
   *   multiplierait les noms sans rien apprendre, et chaque nom en plus est un nom a maintenir
   *   dans deux listes. */
  if (['sign_propos', 'ok', 'sign_refus'].includes(m)) {
    const nom = 'envoi_' + m;
    return ETAPES_ENVOI.includes(nom) ? nom : null;
  }
  const p = PREFIXE[g];
  if (!p) return null;
  const nom = p + '_' + m;
  return ETAPES_ENVOI.includes(nom) ? nom : null;
}
