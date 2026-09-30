// outils-test.js — LES OUTILS QUE TOUT TEST QUI LIT DU SOURCE DOIT UTILISER.
// ================================================================================================
// ⛔⛔⛔ POURQUOI CE FICHIER EXISTE : QUATRE FOIS EN UNE SEULE JOURNEE (2026-09-30), une garde a
//      rougi sur du code PARFAITEMENT CORRECT parce qu elle cherchait une chaine que MON PROPRE
//      COMMENTAIRE citait. Le motif est toujours le meme et il ne vient pas de l inattention :
//      dans ce depot, les commentaires CITENT le texte qu ils expliquent — c est meme leur qualite.
//      Un `indexOf` ou un `match` sur la source brute trouve donc la documentation avant le code.
//        · `MAX_UINT256` trouve dans un commentaire qui documentait son REFUS ;
//        · `i === r.appels.length - 1` mute dans le commentaire, pas dans le code ;
//        · `vie_ko_etape` accuse comme orphelin alors qu il est CONSTRUIT ;
//        · « $64.9M traded in 24h » trouve dans le commentaire qui cite l ANCIENNE copie.
//
//   ⛔ « FAIRE ATTENTION » N A PAS MARCHE, ET NE MARCHERA PAS. Ma propre memoire le dit :
//     connaitre la regle ne suffit pas, seul un CONTROLE EXTERNE protege. L outil vit donc ICI,
//     en un seul endroit, et chaque test qui lit du source l importe au lieu de le reecrire.
//
// ⚠️ CE QUE CES OUTILS NE FONT PAS : ils ne comprennent pas JavaScript. `sansCommentaires` retire
//    les blocs `/* */` et les lignes `//`, rien de plus. Une chaine de caracteres qui CONTIENT
//    `/*` serait mutilee. Aucun de nos fichiers n en a aujourd hui, et le temoin ci-dessous le
//    verifie a chaque appel plutot que de l esperer.

/**
 * Rend le source prive de ses commentaires, pour qu une garde cherche le CODE et pas sa doc.
 * ⛔ IL S ACCUSE LUI-MEME : si le depouillement n a presque rien retire, c est qu il ne marche pas
 *   sur ce fichier — et une garde batie dessus ne prouverait rien. On LEVE alors, au lieu de rendre
 *   un resultat qui passerait pour vrai.
 * @param {string} src
 * @param {{minRetire?: number}} [opts]  combien d octets doivent AU MOINS avoir ete retires
 */
export function sansCommentaires(src, { minRetire = 200 } = {}) {
  if (typeof src !== 'string' || !src.length) throw new Error('sansCommentaires : source vide');
  const nu = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  if (src.length - nu.length < minRetire) {
    throw new Error('sansCommentaires : seulement ' + (src.length - nu.length) + ' octets retires ('
      + src.length + ' -> ' + nu.length + ') — le depouillement ne fonctionne pas sur ce fichier, '
      + 'donc toute garde batie dessus ne prouverait rien');
  }
  return nu;
}

/**
 * Rend la tranche de source entre deux reperes, DEPOUILLEE de ses commentaires.
 * ⛔ C est la forme qu il faut utiliser pour isoler une fonction : chercher les reperes dans le
 *   source NU evite que le repere soit trouve dans un commentaire qui le cite.
 * @returns {string} la tranche, jamais vide — on leve si les reperes manquent ou sont inverses
 */
export function trancheNue(src, debut, fin, quoi = 'cette tranche') {
  const nu = sansCommentaires(src);
  const d = nu.indexOf(debut);
  if (d < 0) throw new Error(quoi + ' : repere de debut introuvable dans le code depouille (' + debut + ')');
  const f = nu.indexOf(fin, d + debut.length);
  if (f < 0) throw new Error(quoi + ' : repere de fin introuvable apres le debut (' + fin + ')');
  const t = nu.slice(d, f);
  if (t.length < 50) throw new Error(quoi + ' : tranche suspecte, ' + t.length + ' caracteres');
  return t;
}
