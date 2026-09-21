/* comparer-frais.js — PROUVER UN CHANGEMENT, pas seulement un montant.
 *
 * ⛔⛔ CE QUE CE MODULE REFUSE DE FAIRE, ET C EST SA RAISON D ETRE : attribuer un ecart a une cause
 *     qui n a pas encore agi. Le hook V6 est deploye depuis le bloc 51586920, mais il n a AUCUN
 *     marche. Une comparaison « avant / apres le deploiement » mesurerait donc un ecart entierement
 *     produit par le V1 et le V2 — et le presenterait comme l effet du V6. C est la faute la plus
 *     facile a commettre et la plus difficile a voir.
 *     => `verdict` vaut PAS_DE_CAUSE tant qu aucun marche n a tourne sur le hook compare.
 *
 * ⛔ DEUX FENETRES DE LONGUEURS DIFFERENTES NE SE COMPARENT PAS BRUTES. On normalise par jour, et on
 *    le DIT dans la borne. Comparer 14 jours a 3 jours sans le dire multiplierait tout par 4,7.
 *
 * ⛔ UNE FENETRE INCOMPLETE INVALIDE LA COMPARAISON, elle ne la rend pas « prudente ». Un cote qui a
 *    rate des lectures a un total PLANCHER : l ecart calcule contre un plancher n a pas de sens, dans
 *    un sens comme dans l autre. => verdict INCOMPARABLE.
 *
 * ⛔ ET « ZERO APRES » N EST PAS « CA A BAISSE » : sans activite du tout, il n y a rien a comparer.
 */

export const VERDICTS = Object.freeze([
  'COMPARABLE',      /* les deux cotes sont complets et il y a de l activite : l ecart a un sens */
  'INCOMPARABLE',    /* au moins un cote est incomplet : l ecart n a pas de sens */
  'PAS_DE_CAUSE',    /* la cause supposee n a produit aucune activite : on ne lui attribue rien */
  'PAS_DE_BASE',     /* la fenetre AVANT est vide : il n y a pas de reference */
  'AUCUNE_ACTIVITE', /* les deux fenetres sont vides */
]);

export const ETH_NATIF = '0x0000000000000000000000000000000000000000';

/** Par jour, a partir d un total et d un nombre de blocs. ⛔ Base a 2 s le bloc : 43200 blocs/jour. */
export const BLOCS_PAR_JOUR = 43200;

const jours = (blocs) => blocs / BLOCS_PAR_JOUR;

/**
 * Agrege un scan en chiffres comparables.
 * @param {{evenements:Array, complet:boolean}} scan  sortie de `scanFrais`
 * @param {number} blocs                              largeur de la fenetre, en blocs
 * @param {Set<string>} aNous                         nos adresses, en minuscules
 * @param {Map<string,string>} payeurParTx            tx -> payeur (deja lu), facultatif
 */
export function agreger({ scan, blocs, aNous = new Set(), payeurParTx = new Map() }) {
  const d = jours(blocs);
  let ethWallet = 0n, evenements = 0, externes = 0, ethExternes = 0n;
  const payeursExternes = new Set();
  const hooks = new Map();
  for (const e of scan.evenements || []) {
    evenements++;
    hooks.set(e.hook, (hooks.get(e.hook) || 0) + 1);
    if (e.devise === ETH_NATIF) ethWallet += e.montant;
    const payeur = payeurParTx.get(e.tx);
    /* ⛔ UN PAYEUR INCONNU N EST PAS UN EXTERNE. Le ranger d office parmi les inconnus gonflerait
     *    la part externe — exactement le chiffre qu on a envie de voir monter. */
    if (payeur && !aNous.has(payeur)) {
      externes++;
      payeursExternes.add(payeur);
      if (e.devise === ETH_NATIF) ethExternes += e.montant;
    }
  }
  return {
    complet: !!scan.complet,
    blocs, jours: d,
    evenements,
    evenementsParJour: d > 0 ? evenements / d : null,
    ethWallet,
    ethParJour: d > 0 ? Number(ethWallet) / 1e18 / d : null,
    externes,
    payeursExternesDistincts: payeursExternes.size,
    ethExternes,
    partExternePourCent: ethWallet > 0n ? Number(ethExternes * 1000n / ethWallet) / 10 : null,
    parHook: [...hooks.entries()].map(([nom, n]) => ({ hook: nom, n })),
  };
}

/**
 * Compare deux agregats, et REFUSE quand la comparaison n a pas de sens.
 *
 * @param {object} e
 * @param {object} e.avant            agregat de la fenetre AVANT
 * @param {object} e.apres            agregat de la fenetre APRES
 * @param {string} e.cause            nom de la cause supposee (ex : 'V6')
 * @param {number} e.activiteCause    nombre d evenements produits par la cause dans la fenetre APRES
 */
export function comparer({ avant, apres, cause, activiteCause }) {
  const commun = { cause, activiteCause, avant, apres };
  /* ⛔ L ORDRE DES REFUS EST LA REGLE. « incomparable » passe AVANT « pas de cause » : si les
   *    donnees ne valent rien, savoir que la cause n a pas agi n apporte rien non plus. */
  /* ⛔⛔ LE REFUS DOIT NOMMER LE COTE *ET* LA CAUSE. Premiere version : « au moins une des deux
   *     fenetres a des lectures ratees » — dit alors que les DEUX scans etaient complets et que le
   *     vrai probleme etait un drapeau absent du fichier de reference. Un refus juste avec une
   *     explication fausse envoie chercher au mauvais endroit, et on lui fait confiance.
   * ⛔ « mesure incomplete » accuse le noeud ; « completude inconnue » nous accuse nous. */
  const etat = (x) => (x.complet === true ? 'ok' : (x.complet === false ? 'incomplet' : 'inconnu'));
  const eAvant = etat(avant), eApres = etat(apres);
  if (eAvant !== 'ok' || eApres !== 'ok') {
    const parts = [];
    if (eAvant !== 'ok') parts.push('AVANT : ' + (eAvant === 'incomplet'
      ? 'des lectures ont ete refusees par le noeud, son total est un PLANCHER'
      : 'la completude n a pas ete enregistree — c est notre fichier qui est en cause, pas la chaine'));
    if (eApres !== 'ok') parts.push('APRES : ' + (eApres === 'incomplet'
      ? 'des lectures ont ete refusees par le noeud, son total est un PLANCHER'
      : 'la completude n a pas ete enregistree — c est notre fichier qui est en cause, pas la chaine'));
    return { ...commun, verdict: 'INCOMPARABLE', etatAvant: eAvant, etatApres: eApres,
      pourquoi: parts.join(' · ') + '. Un ecart calcule la-dessus ne veut rien dire.' };
  }
  if (!avant.evenements && !apres.evenements) {
    return { ...commun, verdict: 'AUCUNE_ACTIVITE',
      pourquoi: 'aucun encaissement dans l une ni dans l autre fenetre' };
  }
  if (!avant.evenements) {
    return { ...commun, verdict: 'PAS_DE_BASE',
      pourquoi: 'la fenetre AVANT est vide : il n y a aucune reference a laquelle comparer' };
  }
  if (!activiteCause) {
    return { ...commun, verdict: 'PAS_DE_CAUSE',
      pourquoi: cause + ' n a produit AUCUN encaissement sur la fenetre APRES. Tout ecart observe '
        + 'vient donc d ailleurs, et ne peut pas lui etre attribue.' };
  }
  const dEvenements = apres.evenementsParJour - avant.evenementsParJour;
  const dEth = apres.ethParJour - avant.ethParJour;
  const dExterne = (apres.partExternePourCent ?? 0) - (avant.partExternePourCent ?? 0);
  return {
    ...commun, verdict: 'COMPARABLE',
    evenementsParJour: { avant: avant.evenementsParJour, apres: apres.evenementsParJour, ecart: dEvenements },
    ethParJour: { avant: avant.ethParJour, apres: apres.ethParJour, ecart: dEth },
    partExternePourCent: { avant: avant.partExternePourCent, apres: apres.partExternePourCent, ecart: dExterne },
    borne: 'Les deux fenetres sont ramenees au JOUR avant comparaison : ' + avant.jours.toFixed(2)
      + ' j contre ' + apres.jours.toFixed(2) + ' j. Un ecart ne prouve pas une cause — il montre '
      + 'seulement que les deux periodes different, et ' + cause + ' n est qu une des choses qui ont '
      + 'change entre elles.',
  };
}
