/* RENDRE UN JETON ORDINAIRE « BLOCKABLE » — le dimensionnement, et ce qu il N EST PAS.
 *
 * ⛔⛔ LA CONTRAINTE QUI DECIDE DE TOUT : notre B20 n a NI MINTER NI ADMIN, et `supply == cap`
 *   au mint (mesure : 3 roles absents, `grantRole` refuse, `burn` refuse, 0 `RoleGranted`
 *   depuis le mint). On ne peut donc PAS frapper du B20 contre un depot.
 *   ⇒ UN WRAPPER 1:1 ADOSSE EST IMPOSSIBLE. Ce module ne pretend pas le contraire.
 *
 * CE QUI EST POSSIBLE, ET C EST LE MONTAGE DES GROS BLOCKS : frapper le B20 UNE SEULE FOIS
 * avec une supply choisie, mettre le tout dans une pool appairee au jeton source, et laisser
 * la POOL faire l echange. La pool est le « wrapper » — au sens d un marche, pas d une garantie.
 *
 * ⛔⛔⛔ LA PHRASE QU ON NE PEUT PAS NE PAS DIRE : un B20 cree ainsi est une REPRESENTATION,
 *   pas une CREANCE. Personne ne le rachete, rien ne l adosse, et son prix peut s ecarter du
 *   jeton source des la premiere transaction. L appeler « wrapper » ou « adosse » serait faux.
 *   `avertissementNonAdosse()` existe pour que cette phrase ne puisse pas etre oubliee.
 *
 * ⛔ Un prix AFFICHE est un DIVISEUR, pas une valeur : sur MUc, « 1 100 $ » designait 308
 *   unites. On travaille donc en unites entieres et en decimales explicites, jamais en flottant
 *   sur des montants.
 */

/** Bornes de bon sens sur les decimales ERC-20. Hors de la, on refuse au lieu de calculer. */
export const DECIMALES_MIN = 0;
export const DECIMALES_MAX = 36;

/** Les etats rendus par `dimensionner`. Aucun autre n est produit. */
export const ETATS = Object.freeze(['OK', 'REFUSE']);

/** Ce que le montage N EST PAS. ⛔ Cette phrase est du produit, pas du confort. */
export function avertissementNonAdosse() {
  return 'This block is a representation, not a claim: nothing backs it, no one redeems it, '
    + 'and its price can drift from the source token from the first trade onward.';
}

function estEntierPositif(x) {
  return typeof x === 'bigint' && x > 0n;
}
function decimalesValides(d) {
  return Number.isInteger(d) && d >= DECIMALES_MIN && d <= DECIMALES_MAX;
}

/**
 * Quelle supply frapper pour le B20, a partir du jeton source.
 *
 * `ratio` exprime combien d unites de B20 pour UNE unite du jeton source, sous forme de
 * fraction ENTIERE { haut, bas } — jamais un flottant, pour qu aucune division ne se perde.
 * Le cas de parite est { haut: 1n, bas: 1n }.
 *
 * Rend { etat, supplyB20, pourquoi } et REFUSE toute entree qui ferait un calcul muet.
 */
export function dimensionner({ supplySource, decimalesSource, decimalesB20 = 18, ratio = { haut: 1n, bas: 1n } } = {}) {
  if (!estEntierPositif(supplySource)) {
    return { etat: 'REFUSE', supplyB20: null, pourquoi: 'SUPPLY_SOURCE_INVALIDE' };
  }
  if (!decimalesValides(decimalesSource) || !decimalesValides(decimalesB20)) {
    return { etat: 'REFUSE', supplyB20: null, pourquoi: 'DECIMALES_HORS_BORNES' };
  }
  if (!ratio || !estEntierPositif(ratio.haut) || !estEntierPositif(ratio.bas)) {
    return { etat: 'REFUSE', supplyB20: null, pourquoi: 'RATIO_INVALIDE' };
  }
  /* On passe par les unites ENTIERES du jeton source, puis on re-echelonne vers les
   * decimales du B20. ⛔ L ordre compte : multiplier AVANT de diviser, sinon une division
   * entiere intermediaire jette la precision sans rien dire. */
  let x = supplySource * ratio.haut;
  if (decimalesB20 >= decimalesSource) x *= 10n ** BigInt(decimalesB20 - decimalesSource);
  else x /= 10n ** BigInt(decimalesSource - decimalesB20);
  const supplyB20 = x / ratio.bas;
  if (supplyB20 <= 0n) {
    /* ⛔ Un arrondi vers zero est un REFUS, pas un resultat : une supply nulle ne se frappe pas. */
    return { etat: 'REFUSE', supplyB20: null, pourquoi: 'ARRONDI_A_ZERO' };
  }
  return { etat: 'OK', supplyB20, pourquoi: null };
}

/**
 * Le prix initial a donner a la pool pour que les FDV coincident au depart.
 * Rend une fraction ENTIERE { haut, bas } — un prix rendu en flottant serait un diviseur
 * deguise en valeur, exactement le piege de MUc.
 *
 * fdvSource = supplySource * prixSource  ⇒  prixB20 = fdvSource / supplyB20
 * On ne divise pas : on rend la fraction, et l appelant l applique ou il faut.
 */
export function prixInitialPourFdvEgale({ supplySource, prixSourceNumerateur, prixSourceDenominateur = 1n, supplyB20 } = {}) {
  if (!estEntierPositif(supplySource) || !estEntierPositif(supplyB20)) {
    return { etat: 'REFUSE', prix: null, pourquoi: 'SUPPLY_INVALIDE' };
  }
  if (!estEntierPositif(prixSourceNumerateur) || !estEntierPositif(prixSourceDenominateur)) {
    return { etat: 'REFUSE', prix: null, pourquoi: 'PRIX_SOURCE_INVALIDE' };
  }
  return {
    etat: 'OK',
    prix: { haut: supplySource * prixSourceNumerateur, bas: supplyB20 * prixSourceDenominateur },
    pourquoi: null,
  };
}

/**
 * La parite est-elle exacte, ou y a-t-il une perte d arrondi ?
 * ⛔ Une perte SILENCIEUSE est le defaut a ne pas livrer : l utilisateur verrait « 1:1 »
 *   et recevrait autre chose. On rend l ecart, et il vaut 0n quand c est exact.
 */
export function ecartDeParite({ supplySource, decimalesSource, decimalesB20 = 18, ratio = { haut: 1n, bas: 1n } } = {}) {
  const d = dimensionner({ supplySource, decimalesSource, decimalesB20, ratio });
  if (d.etat !== 'OK') return { etat: 'REFUSE', ecart: null, pourquoi: d.pourquoi };
  /* On refait le chemin INVERSE et on compare a l entree. */
  let retour = d.supplyB20 * ratio.bas;
  if (decimalesB20 >= decimalesSource) retour /= 10n ** BigInt(decimalesB20 - decimalesSource);
  else retour *= 10n ** BigInt(decimalesSource - decimalesB20);
  const attendu = supplySource * ratio.haut;
  const ecart = attendu > retour ? attendu - retour : retour - attendu;
  return { etat: 'OK', ecart, exact: ecart === 0n, pourquoi: null };
}

/**
 * LE FRAIS DE CE CHEMIN — et il est FAIL-CLOSED.
 *
 * ⛔⛔ UN CHEMIN SANS FRAIS NE PEUT PAS ETRE PRODUIT ICI. Si l appelant oublie de passer
 *   le frais d ouverture ou le taux d interface, on rend REFUSE au lieu d un plan gratuit.
 *   C est la lecon de `tblock-create-est-gratuit` : un chemin livre sans sa ligne de frais
 *   reste gratuit pour toujours, et personne ne s en apercoit avant de lire le solde.
 *
 * ⛔ AUCUN MONTANT N EST INVENTE ICI. L appelant passe `fraisOuvertureWei` (0,001 ETH dans
 *   `frais-creation.js`, chiffre MESURE : mediane de 103 marches ouverts par 43 createurs)
 *   et `bpsInterface` (50n, `echange.js`). Ce module ne connait aucun prix par lui-meme.
 */
export function planDeFrais({ fraisOuvertureWei, bpsInterface, beneficiaire } = {}) {
  if (!estEntierPositif(fraisOuvertureWei)) {
    return { etat: 'REFUSE', pourquoi: 'FRAIS_OUVERTURE_ABSENT' };
  }
  if (!estEntierPositif(bpsInterface)) {
    return { etat: 'REFUSE', pourquoi: 'TAUX_INTERFACE_ABSENT' };
  }
  const b = String(beneficiaire || '');
  if (!/^0x[0-9a-fA-F]{40}$/.test(b)) {
    /* ⛔ Un frais sans destinataire valide part dans le vide — et une adresse a moitie
     *   ecrite ne se complete pas. On refuse. */
    return { etat: 'REFUSE', pourquoi: 'BENEFICIAIRE_INVALIDE' };
  }
  return {
    etat: 'OK',
    ouverture: fraisOuvertureWei,
    bps: bpsInterface,
    beneficiaire: b.toLowerCase(),
    pourquoi: null,
  };
}

/** La phrase du frais. ⛔ Elle dit les DEUX lignes : l ouverture une fois, puis le taux. */
export function phraseFraisChemin(p) {
  if (!p || !ETATS.includes(p.etat)) return 'Fees: not computed.';
  if (p.etat === 'REFUSE') {
    return 'No fee line for this path (' + (p.pourquoi || 'unknown') + ') — refusing to build it.';
  }
  return 'One-off market opening fee, then ' + p.bps.toString()
    + ' bps on every in-app trade of this block.';
}

/**
 * La phrase de synthese montree avant signature.
 * ⛔ Elle porte TOUJOURS l avertissement non-adosse, et elle PARLE sur un refus —
 *   seul un succes a le droit d etre muet, et un refus muet passe pour un accord.
 */
export function phraseDimension(d, symboleSource = '?') {
  if (!d || !ETATS.includes(d.etat)) {
    return 'Sizing: not computed.';
  }
  if (d.etat === 'REFUSE') {
    return 'Cannot size this block (' + (d.pourquoi || 'unknown') + ') — nothing to sign.';
  }
  return 'Block supply ' + d.supplyB20.toString() + ' units, sized from ' + symboleSource + '. '
    + avertissementNonAdosse();
}
