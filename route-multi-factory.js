/* QUELLE FACTORY PEUT PORTER CETTE ROUTE — ET POURQUOI IL N Y EN A QU UNE A LA FOIS.
 *
 * ⛔⛔ LA CONTRAINTE N EST PAS LA PROFONDEUR, C EST LA FACTORY. Un seul `exactInput` ne traverse
 *   que les pools de SA factory. C est la frontiere ecrite dans `plan-eth-block.js` : sur 123
 *   blocks cotes dans une action tokenisee, seuls 13 ont leur pool sur Aerodrome CL et passent
 *   par ce chemin ; les 110 autres sont REFUSES plutot que de construire un appel qui reverterait.
 *
 * ⛔⛔ ET LA PROFONDEUR SEULE TROMPE. Mesure du 2026-09-30 sur OUSD :
 *     OUSD/USDC  10 M$ de liquidite, AU PAIR (tick -1)  ... mais 0 pool Aerodrome CL sur les NEUF
 *                espacements declares, et une pool Uniswap V4 (fee 100, ts 1).
 *     AAPLc/USDC 2 pools Aerodrome CL      <- une action tokenisee, elle, en a
 *   Un routeur qui choisit « la pool la plus profonde » jambe par jambe composerait donc une route
 *   qui melange deux factories : chaque jambe existe, et l appel reverte. Le piege est qu il a
 *   l air correct — toutes les pools sont reelles.
 *
 * ⇒ LA REGLE : UNE ROUTE EST VIABLE SI, ET SEULEMENT SI, UNE SEULE FACTORY PORTE TOUTES SES
 *   JAMBES. On ne cherche pas la meilleure pool par jambe ; on cherche la meilleure FACTORY
 *   COMPLETE. Et on refuse quand aucune ne l est.
 *
 * ⛔ CE MODULE NE LIT RIEN. Il decide sur des pools DEJA MESUREES par l appelant. Melanger la
 *   lecture et la decision rendrait le refus indistinguable d une lecture ratee — et ce depot a
 *   deja paye « un retour neutre qui avale un echec ».
 */

/** Les familles de marche que nos calldata savent construire. ⛔ Rien d autre n est routable. */
export const FAMILLES = Object.freeze(['aerodrome', 'uniswap-v4']);

/** Les etats rendus. Aucun autre n est produit. */
export const ETATS = Object.freeze(['OK', 'REFUSE']);

function estJambe(j) {
  return !!j && typeof j === 'object' && typeof j.de === 'string' && j.de !== ''
    && typeof j.vers === 'string' && j.vers !== '';
}

/**
 * Parmi les factories, laquelle porte TOUTES les jambes ?
 *
 * @param {object[]} jambes  [{ de, vers }] dans l ordre du chemin, au moins une.
 * @param {object} poolsParFamille  { aerodrome: [{de,vers,...}], 'uniswap-v4': [...] } — MESURE.
 *
 * ⛔ UNE FAMILLE INCONNUE N EST PAS UNE FAMILLE VIDE : elle est ignoree ET nommee dans
 *   `ignorees`. La taire ferait lire « aucune factory ne porte la route » alors qu on n aurait
 *   simplement pas su lire celle-la.
 * ⛔ ET L ORDRE DE PREFERENCE EST CELUI DE `FAMILLES`, pas l ordre des cles de l objet : deux
 *   appelants qui construisent le meme objet differemment obtiendraient sinon deux routes
 *   differentes pour les memes pools.
 */
export function factoryPourLaRoute(jambes, poolsParFamille) {
  if (!Array.isArray(jambes) || jambes.length === 0 || !jambes.every(estJambe)) {
    return { etat: 'REFUSE', famille: null, pourquoi: 'the route has no readable legs',
      manquantes: null, ignorees: [] };
  }
  const src = (poolsParFamille && typeof poolsParFamille === 'object') ? poolsParFamille : {};
  const ignorees = Object.keys(src).filter((k) => !FAMILLES.includes(k));

  const memeJambe = (a, b) => {
    const p = String(a.de).toLowerCase(), q = String(a.vers).toLowerCase();
    const r = String(b.de).toLowerCase(), s = String(b.vers).toLowerCase();
    /* ⛔ UNE POOL N A PAS DE SENS : la pool A/B sert A->B ET B->A. Exiger l ordre ferait refuser
     *   une route franchissable, et ce refus-la coute un achat. */
    return (p === r && q === s) || (p === s && q === r);
  };

  const parFamille = [];
  for (const f of FAMILLES) {
    const pools = Array.isArray(src[f]) ? src[f].filter(estJambe) : [];
    const manquantes = jambes.filter((j) => !pools.some((p) => memeJambe(j, p)));
    parFamille.push({ famille: f, manquantes, couvertes: jambes.length - manquantes.length });
  }
  const completes = parFamille.filter((x) => x.manquantes.length === 0);
  if (completes.length) {
    /* ⛔ L ORDRE DE `FAMILLES` TRANCHE, et il est stable — jamais l ordre des cles recues. */
    return { etat: 'OK', famille: completes[0].famille, manquantes: [], ignorees,
      pourquoi: 'this factory carries every leg of the route' };
  }
  /* ⛔ ON REND LA MEILLEURE TENTATIVE ET SES MANQUES, pas un refus nu : l ecran doit pouvoir dire
   *   QUELLE jambe manque, sinon « impossible » se lit comme « cassé ». */
  const meilleure = parFamille.reduce((a, b) => (b.couvertes > a.couvertes ? b : a), parFamille[0]);
  return { etat: 'REFUSE', famille: null, manquantes: meilleure.manquantes, ignorees,
    pourquoi: 'no single factory carries every leg — a swap cannot cross factories in one call' };
}

/**
 * La route est-elle franchissable en UN appel ?
 * ⛔ Jamais « presque » : une route incomplete est une route qui reverte.
 */
export function routeFranchissable(r) {
  return !!r && r.etat === 'OK' && typeof r.famille === 'string' && FAMILLES.includes(r.famille);
}

/**
 * La phrase montree. ⛔ LE REFUS PARLE, ET IL NOMME LA JAMBE QUI MANQUE.
 *   « This block cannot be bought here » sans raison se lit comme une panne de l app. Avec la
 *   jambe nommee, le lecteur sait que c est le marche qui manque, pas nous.
 */
export function phraseRoute(r, noms = {}) {
  if (!r || !ETATS.includes(r.etat)) return 'Route: not computed.';
  const nom = (a) => noms[String(a).toLowerCase()] || (String(a).slice(0, 6) + '…' + String(a).slice(-4));
  if (r.etat === 'OK') {
    return 'This trade goes through ' + r.famille + ' in a single call.';
  }
  if (!Array.isArray(r.manquantes) || !r.manquantes.length) {
    return 'This trade cannot be routed here (' + (r.pourquoi || 'unknown') + ').';
  }
  const listees = r.manquantes.map((j) => nom(j.de) + '/' + nom(j.vers)).join(', ');
  return 'This trade cannot be made in one call: no single market has ' + listees
    + '. The pools exist on different venues, and one swap cannot cross them.';
}
