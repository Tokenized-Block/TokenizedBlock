/* fenetre-scan.js — quelle tranche de chaine lire au prochain tour, pour une couverture qui doit
 * REMONTER jusqu a un plancher tout en restant a jour a l avant.
 *
 * ⛔⛔ CE FICHIER EXISTE A CAUSE D UNE FAMINE MESUREE (2026-09-20). La premiere version testait
 *    « jusqua < fin » AVANT la remontee. Base produit un bloc toutes les 2 secondes, donc cette
 *    condition est TOUJOURS vraie : la branche « rattraper l avant » gagnait a chaque tour et la
 *    remontee n a jamais demarre. Observe en local : `depuis` fige a 51528250 pendant 300 s, douze
 *    tours d affilee, sans la moindre erreur.
 *    ⚠️ UNE PRIORITE QUI DEPEND D UNE CONDITION TOUJOURS VRAIE N EST PAS UNE PRIORITE, C EST UNE FAMINE.
 *
 * ⛔ L ORDRE EST LA REGLE, ET IL EST ICI POUR POUVOIR ETRE TESTE :
 *      1. rien lu encore      -> un premier morceau, colle a la tete
 *      2. decroche de plus d un morceau -> on rattrape l avant (sinon on ne rattrapera jamais)
 *      3. il reste a remonter -> on remonte d un morceau
 *      4. un petit retard a l avant -> on le comble
 *      5. plus rien           -> null
 */

/**
 * @param {object} e
 * @param {number} e.fin      tete de chaine
 * @param {number|null} e.depuis  bas de la plage deja couverte (null = rien lu)
 * @param {number|null} e.jusqua  haut de la plage deja couverte (null = rien lu)
 * @param {number} e.plancher le bloc sous lequel il est inutile de descendre
 * @param {number} e.pas      taille d un morceau
 * @returns {{deBloc:number, aBloc:number, sens:'PREMIER'|'AVANT'|'ARRIERE'}|null}
 */
export function prochaineFenetre({ fin, depuis, jusqua, plancher, pas }) {
  if (!Number.isFinite(fin) || !Number.isFinite(plancher) || !Number.isFinite(pas) || pas < 1) return null;
  if (jusqua === null || jusqua === undefined || depuis === null || depuis === undefined) {
    return { deBloc: Math.max(plancher, fin - pas + 1), aBloc: fin, sens: 'PREMIER' };
  }
  const retard = fin - jusqua;
  /* ⛔ On ne rattrape l avant EN PRIORITE que si on a vraiment decroche. Le seuil est ce qui empeche
   *    la remontee d etre affamee par l avancee naturelle de la chaine. */
  if (retard > pas) return { deBloc: jusqua + 1, aBloc: fin, sens: 'AVANT' };
  if (depuis > plancher) {
    const aBloc = depuis - 1;
    return { deBloc: Math.max(plancher, aBloc - pas + 1), aBloc, sens: 'ARRIERE' };
  }
  if (retard > 0) return { deBloc: jusqua + 1, aBloc: fin, sens: 'AVANT' };
  return null;
}
