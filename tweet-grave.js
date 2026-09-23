// tweet-grave.js — TOKENISER UN POST X EN LE GRAVANT, SANS APPELER PERSONNE.
// ================================================================================================
// ⛔⛔ IDEE DE PHIL (2026-09-23) : « dans l onglet create on peut ajouter le lien X d un tweet pour
//     tokeniser du contenu web2 — X est parfait comme exemple a utiliser SANS BESOIN D API ».
//     Elle marche parce que l URL d un post porte DEJA tout ce qui l identifie :
//         https://x.com/<handle>/status/<id>
//     L identifiant numerique et le handle sont dans la chaine. Aucune requete, aucune cle, aucun
//     service tiers : on lit l URL, on la met en forme, on la grave.
//
// ⛔⛔ CE QUE CE MODULE NE PEUT PAS FAIRE, ET C EST ECRIT AVANT TOUT LE RESTE : il ne verifie PAS
//     que le post existe, ni qui l a ecrit, ni qu il dit ce que le createur pretend. Ca demanderait
//     un appel reseau, donc une API — exactement ce que l idee evite.
//     ⇒ Ce qui est grave est une REFERENCE, pas une preuve. Le block dit « je renvoie a ce
//       post-la » ; il ne dit pas « ce post est a moi ».
//     ⛔ AUCUNE PHRASE DE CE MODULE NE DOIT CONTENIR « verified », « owned » NI « proof ». Un test
//        le verifie. Le jour ou quelqu un lit « verified » a cote d un lien grave, on a menti a
//        tous ses lecteurs a la fois, et c est irreversible : le lien est dans le contractURI.
//
// ⛔ PUR : aucune lecture reseau, aucun DOM. Il prend une chaine et rend un verdict.

/** Les hotes acceptes. ⛔ `twitter.com` reste accepte parce que des millions de liens existent
 *  encore sous ce nom et pointent au meme endroit ; on NORMALISE vers `x.com` pour que deux liens
 *  du meme post donnent la meme gravure — sinon le meme post produirait deux blocks differents. */
const HOTES = ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com', 'm.twitter.com'];

/** Les etats possibles. ⛔ JAMAIS UN BOOLEEN : « pas un lien X », « pas un lien de POST » (un
 *  profil, une recherche) et « rien saisi » appellent trois messages differents. Un `false` unique
 *  ferait dire « ce lien est invalide » a quelqu un qui a colle son profil — il chercherait la
 *  faute dans le lien au lieu de chercher un post. */
export const ETATS_TWEET = Object.freeze(['VIDE', 'PAS_UNE_URL', 'PAS_X', 'PAS_UN_POST', 'OK']);

/**
 * Lit un lien X et rend ce qu on peut en graver.
 * @param {string} lien
 * @returns {{etat:string, pourquoi:string, handle:string|null, id:string|null, canonique:string|null}}
 *
 * ⛔ ON N UTILISE PAS `new URL()` SEUL POUR DECIDER : il accepte `javascript:` et `data:` sans
 *    broncher. Le protocole est verifie explicitement — une URL gravee peut etre cliquee par
 *    n importe qui, et un `javascript:` grave serait definitif.
 */
export function lireLienX(lien) {
  const brut = typeof lien === 'string' ? lien.trim() : '';
  if (!brut) return sortie('VIDE', 'no link given');
  let u;
  try { u = new URL(brut.includes('://') ? brut : 'https://' + brut); }
  catch (_) { return sortie('PAS_UNE_URL', 'that is not a web address'); }
  /* ⛔ LE PROTOCOLE D ABORD. `javascript:`, `data:` et consorts ne sont pas des liens, ce sont des
   *    charges utiles. Gravees, elles seraient permanentes. */
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return sortie('PAS_UNE_URL', 'only https links can be engraved');
  }
  const hote = String(u.hostname || '').toLowerCase();
  if (!HOTES.includes(hote)) return sortie('PAS_X', 'that link is not on x.com');
  /* ⛔ LE CHEMIN D UN POST EST `/<handle>/status/<id>`. Un profil (`/<handle>`) ou une recherche
   *    n en est pas un, et le dire precisement evite de faire chercher au mauvais endroit. */
  /* ⛔⛔ `\d{1,25}` ET PAS `\d{5,25}` : j avais mis un minimum de 5 chiffres « parce qu un
   *     identifiant est long ». Mon propre test l a pris en defaut — le tout PREMIER post de la
   *     plateforme porte l identifiant `20`, et les posts de 2006-2007 tiennent en deux ou trois
   *     chiffres. La regle rejetait donc des posts authentiques, et son auteur aurait cherche la
   *     faute dans son lien.
   *     ⇒ Une borne inventee par intuition sur la FORME d une donnee qu on ne controle pas se
   *       retourne contre les cas reels. La longueur maximale, elle, est bornee par le calldata —
   *       celle-la est mesuree. */
  const m = String(u.pathname || '').match(/^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25})\/?$/);
  if (!m) return sortie('PAS_UN_POST', 'that is an x.com link, but not a link to a post');
  const handle = m[1];
  const id = m[2];
  /* ⛔ LA FORME CANONIQUE LAISSE TOMBER TOUT LE RESTE — `?s=20`, `&t=…`, les sous-domaines mobiles.
   *    Ces parametres sont des identifiants de PARTAGE : ils changent d une personne a l autre pour
   *    le meme post. Les graver ferait de deux liens du meme post deux blocks differents, et
   *    porterait dans le contractURI une trace de qui a partage quoi. */
  return {
    etat: 'OK',
    pourquoi: 'post ' + id + ' by @' + handle,
    handle,
    id,
    canonique: 'https://x.com/' + handle + '/status/' + id,
  };
}

function sortie(etat, pourquoi) {
  return { etat, pourquoi, handle: null, id: null, canonique: null };
}

/**
 * La phrase montree a l utilisateur avant qu il grave.
 * ⛔ ELLE DIT CE QU ON NE SAIT PAS. « on n a pas verifie que ce post existe ni qu il est a vous »
 *    n est pas une precaution juridique : c est la seule chose vraie qu on puisse dire sans appeler
 *    X. La taire laisserait croire a une verification qui n a pas eu lieu.
 * ⛔ ET ELLE RAPPELLE QUE C EST DEFINITIF, parce que ca l est : le lien part dans le contractURI.
 */
export function phraseTweet(v) {
  if (!v || v.etat !== 'OK') {
    return v && v.pourquoi ? v.pourquoi.charAt(0).toUpperCase() + v.pourquoi.slice(1) + '.' : null;
  }
  return 'Post ' + v.id + ' by @' + v.handle + ' will be engraved with the block. '
    + 'We did not open the link — nothing here checks that the post exists or that it is yours. '
    + 'It cannot be changed afterwards.';
}

/** Le plus long lien gravable. ⛔ Derive de la FORME, pas d un chiffre rond : le handle fait au plus
 *  15 caracteres et l identifiant au plus 25 chiffres, donc `https://x.com/` + 15 + `/status/` +
 *  25 = 63. On garde une marge et on borne a 96 pour qu un changement de forme chez X ne fasse pas
 *  exploser le calldata sans qu on s en apercoive. */
export const LIEN_MAX = 96;
