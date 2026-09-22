// panel-indexation.js — COMPARER DEUX PHOTOS DU MEME GROUPE DE JETONS.
// ================================================================================================
// ⛔⛔ POURQUOI CETTE FONCTION VIT DANS SON PROPRE FICHIER. Elle etait d abord ecrite au milieu de
//     `ce-qui-garde-liste.mjs`, qui balaie la chaine des qu on l importe : un test qui aurait voulu
//     la verifier aurait lance quinze minutes de RPC. Une fonction qu on ne peut pas importer sans
//     declencher une mesure ne se teste pas — elle se prie.
//
// ⛔⛔ ET C EST LA SEULE PARTIE DE CE PROJET QUI NE S EXECUTE JAMAIS LE JOUR OU ON L ECRIT. Elle
//     dort jusqu a la DEUXIEME execution — dans une semaine, dans un mois. Si elle est cassee, on
//     l apprendrait a ce moment-la : c est-a-dire apres avoir attendu tout ce temps pour la donnee
//     qu elle doit produire, et l attente serait a refaire depuis zero.
//     Une fonction qui ne tourne pas aujourd hui doit etre prouvee aujourd hui.
//
// ⛔ CE QU ELLE NE FAIT PAS : juger POURQUOI un jeton a change d etat. Elle dit QUI a bouge. Le
//    reste est le travail de l instrument qui l appelle, avec les donnees on-chain a cote.

/**
 * @param {Array<{jeton:string, etat:string}>} avant  le panel precedent
 * @param {Array<{jeton:string, etat:string}>} apres  le panel du jour
 * @returns {{revus:number, perdus:Array, gagnes:Array}}
 *
 * ⛔ LES JETONS ABSENTS D UN DES DEUX COTES SONT IGNORES, JAMAIS COMPTES COMME UN CHANGEMENT. Un
 *    jeton qui n etait pas dans le panel precedent n a rien « gagne » : on ne l avait pas regarde.
 *    Confondre « apparu dans l echantillon » avec « a gagne sa place » fabriquerait des mouvements
 *    a chaque tirage, et le bruit de l echantillonnage se lirait comme un resultat.
 *
 * ⛔ `revus` EST RENDU, ET C EST LUI QUI EMPECHE LE PIRE MALENTENDU. Sans lui, « 0 perdu, 0 gagne »
 *    se lit « rien n a bouge » — alors que ca peut vouloir dire « aucun jeton en commun », qui est
 *    l exact contraire d un resultat. C est le meme defaut que le compteur de couverture d une
 *    garde : ne rien trouver et ne rien inspecter doivent se distinguer.
 *
 * ⛔ UN ETAT INCONNU DU COUPLE (CONNU/INCONNU) NE COMPTE NI D UN COTE NI DE L AUTRE : « ILLISIBLE »
 *    est une panne de lecture, pas un mouvement. Le classer comme une perte ferait baisser la
 *    presence a chaque incident reseau, et l incident ressemblerait a une decouverte.
 */
export function comparerPanels(avant, apres) {
  const parAvant = new Map((avant || []).map((x) => [x.jeton, x]));
  const perdus = [], gagnes = [];
  let revus = 0;
  for (const x of apres || []) {
    const a = parAvant.get(x.jeton);
    if (!a) continue;
    revus++;
    if (a.etat === 'CONNU' && x.etat === 'INCONNU') perdus.push(x);
    else if (a.etat === 'INCONNU' && x.etat === 'CONNU') gagnes.push(x);
  }
  return { revus, perdus, gagnes };
}
