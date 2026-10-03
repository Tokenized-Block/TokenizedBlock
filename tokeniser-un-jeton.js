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
 * ⛔⛔⛔ CE CHEMIN PEUT FABRIQUER UN SOSIE D ACTION TOKENISEE. IL DOIT REFUSER.
 *
 * Lire n importe quel ERC-20 et en faire un block qui porte SON symbole, c est du NOMMAGE,
 * pas de la tokenisation : rien n adosse le block. Le danger est donc precis — un block
 * « AAPL » sans adossement, pose a cote du `AAPLc` REEL de l emetteur (Coinbase, actions
 * emises sous Regulation S, qui detient le sous-jacent), se lit comme la meme chose.
 * Quelqu un achèterait un sosie en croyant acheter l action.
 *
 * ⇒ On refuse la collision de symbole, y compris la forme SUFFIXEE de l emetteur (`AAPL`
 *   contre `AAPLc`) et l inverse, en ignorant la casse et les espaces.
 *
 * ⛔ `symbolesEmetteur` est OBLIGATOIRE : sans la liste, on rend NON_VERIFIABLE et
 *   l appelant doit refuser. Une liste vide ferait passer TOUT symbole — une garde sur une
 *   liste absente est toujours fausse, et celle-la protegerait exactement rien.
 */
export const VERDICTS_COLLISION = Object.freeze(['LIBRE', 'COLLISION', 'NON_VERIFIABLE']);

export function collisionAvecEmetteur(symbole, symbolesEmetteur) {
  const s = String(symbole || '').trim().toLowerCase();
  if (!s) return { verdict: 'NON_VERIFIABLE', pourquoi: 'SYMBOLE_VIDE', contre: null };
  if (!Array.isArray(symbolesEmetteur) || !symbolesEmetteur.length) {
    return { verdict: 'NON_VERIFIABLE', pourquoi: 'LISTE_EMETTEUR_ABSENTE', contre: null };
  }
  for (const brut of symbolesEmetteur) {
    const e = String(brut || '').trim().toLowerCase();
    if (!e) continue;
    /* Egalite franche, et les deux sens du suffixe d une lettre de l emetteur. */
    if (s === e) return { verdict: 'COLLISION', pourquoi: 'EGAL', contre: brut };
    if (e.length === s.length + 1 && e.startsWith(s)) {
      return { verdict: 'COLLISION', pourquoi: 'SUFFIXE_EMETTEUR', contre: brut };
    }
    if (s.length === e.length + 1 && s.startsWith(e)) {
      return { verdict: 'COLLISION', pourquoi: 'SUFFIXE_AJOUTE', contre: brut };
    }
  }
  return { verdict: 'LIBRE', pourquoi: null, contre: null };
}

/** ⛔ La phrase DOIT nommer le jeton reel, sinon le refus passe pour un bug. */
export function phraseCollision(c) {
  if (!c || !VERDICTS_COLLISION.includes(c.verdict)) return 'Name check: not run.';
  if (c.verdict === 'NON_VERIFIABLE') {
    return 'Cannot check that symbol against the issued stocks (' + (c.pourquoi || 'unknown')
      + ') — refusing to fill it in.';
  }
  if (c.verdict === 'COLLISION') {
    return 'That symbol clashes with ' + c.contre + ', a real issued stock. A block named like it '
      + 'would back nothing, so this page will not fill it in.';
  }
  return '';
}

/**
 * ⛔⛔⛔ LA SUPPLY DU BLOCK N EST PAS CHOISISSABLE, ET J AI FAILLI CABLER LE CONTRAIRE.
 *
 * `dimensionner()` ci-dessus est de l arithmetique juste, mais le chemin de creation vivant
 * NE L UTILISE PAS : « Router strips any cap/mint and force-appends sealed 1B » (app.html).
 * Le CreateRouter FORCE 1 milliard a 18 decimales. Brancher `dimensionner` sur cet ecran
 * aurait affiche une supply que la transaction ignore — une valeur LUE PUIS JETEE.
 *
 * ⇒ Ce qui s adapte vraiment, c est LE PRIX INITIAL DE LA POOL, pas la supply. Cette
 *   fonction l exige donc explicitement : `supplyScellee` est OBLIGATOIRE, et un appelant
 *   qui l oublie recoit un REFUS au lieu d un plan qui suppose ce qu il veut.
 *
 * Rend `pariteExacte` : vrai quand la supply source, ramenee aux decimales du block, EGALE
 * la supply scellee. Pour ce cas-la seulement, « 1 pour 1 » peut s ecrire a l ecran.
 */
export function planDepuisJetonAvecSupplyScellee({
  supplySource, decimalesSource, supplyScellee, decimalesB20 = 18,
  prixSourceNumerateur = null, prixSourceDenominateur = 1n,
} = {}) {
  if (!estEntierPositif(supplyScellee)) {
    return { etat: 'REFUSE', pourquoi: 'SUPPLY_SCELLEE_ABSENTE' };
  }
  if (!estEntierPositif(supplySource)) {
    return { etat: 'REFUSE', pourquoi: 'SUPPLY_SOURCE_INVALIDE' };
  }
  if (!decimalesValides(decimalesSource) || !decimalesValides(decimalesB20)) {
    return { etat: 'REFUSE', pourquoi: 'DECIMALES_HORS_BORNES' };
  }
  /* La source ramenee aux decimales du block, pour une comparaison qui a un sens. */
  let ramenee = supplySource;
  if (decimalesB20 >= decimalesSource) ramenee *= 10n ** BigInt(decimalesB20 - decimalesSource);
  else ramenee /= 10n ** BigInt(decimalesSource - decimalesB20);

  let prixInitial = null;
  if (prixSourceNumerateur !== null) {
    const p = prixInitialPourFdvEgale({
      supplySource, prixSourceNumerateur, prixSourceDenominateur, supplyB20: supplyScellee,
    });
    if (p.etat !== 'OK') return { etat: 'REFUSE', pourquoi: p.pourquoi };
    prixInitial = p.prix;
  }
  return {
    etat: 'OK',
    supplyScellee,
    supplySourceRamenee: ramenee,
    pariteExacte: ramenee === supplyScellee,
    prixInitial,
    pourquoi: null,
  };
}

/** Chiffres apres la virgule du ratio affiche. Assez pour distinguer 1,000377 de 1,0 sans bruit. */
export const RATIO_DECIMALES = 6;

/**
 * COMBIEN DE JETONS SOURCE UN BLOCK REPRESENTE-T-IL, EN SUPPLY.
 *
 * ⛔⛔ CE RATIO ETAIT DEJA CALCULE, PUIS JETE. `planDepuisJetonAvecSupplyScellee` rend
 *   `supplySourceRamenee`, et `phrasePlanScelle` ne s en servait que pour un BOOLEEN
 *   (`pariteExacte`) avant d abandonner la grandeur. La phrase disait donc « the opening pool
 *   price carries the difference » sans jamais dire NI LE SENS NI LE FACTEUR — un facteur sans son
 *   montant, la faute exacte qu on vient de corriger sur le frais de naissance. Une valeur LUE
 *   PUIS JETEE est un defaut ; ce depot l a deja paye deux fois (le refus portait l adresse,
 *   `slot0` portait le prix).
 *   ⇒ Trouve par Phil sur l ecran AERO (2026-09-30), et corrige AU GLOBAL : pour tout jeton
 *     source, pas pour un cas.
 *
 * ⛔ EN ENTIERS, JAMAIS EN FLOTTANT. Une supply se compte en 1e27 ; `Number(a)/Number(b)` perd des
 *   chiffres significatifs, et un ratio faux affiche est pire qu un ratio absent — il serait cru.
 *
 * ⛔⛔ ET LE ZERO EST INTERDIT. Un ratio reel mais plus petit que la precision affichee rendrait
 *   « 0 », que le lecteur lirait « ce block ne represente rien ». On distingue donc SOUS_PRECISION
 *   d un vrai zero : la premiere est une limite de l affichage, pas un fait sur le jeton.
 */
export function ratioParBlock(p) {
  if (!p || p.etat !== 'OK') return { etat: 'REFUSE', texte: null, pourquoi: 'no plan' };
  const haut = p.supplySourceRamenee;
  const bas = p.supplyScellee;
  if (!estEntierPositif(haut) || !estEntierPositif(bas)) {
    return { etat: 'REFUSE', texte: null, pourquoi: 'supplies unreadable' };
  }
  const entier = haut / bas;
  const reste = haut % bas;
  const echelle = 10n ** BigInt(RATIO_DECIMALES);
  const frac = (reste * echelle) / bas;
  if (entier === 0n && frac === 0n) {
    /* ⛔ Le ratio est > 0 (les deux supplies sont > 0) mais invisible a cette precision. */
    return { etat: 'SOUS_PRECISION', texte: null,
      pourquoi: 'the ratio is smaller than ' + (1 / Number(echelle)) };
  }
  const fracTexte = frac.toString().padStart(RATIO_DECIMALES, '0').replace(/0+$/, '');
  /* ⛔⛔ `exact` VEUT DIRE « L AFFICHAGE EST EXACT », PAS « LE RATIO EST UN ENTIER ». Ma premiere
   *   version testait `reste === 0n` : un ratio de 1,2 — exact a 6 decimales — sortait donc marque
   *   approximatif, et l ecran affichait « ~1.2 ». Un « ~ » qui ment dans ce sens apprend au
   *   lecteur a l ignorer, et il l ignorera le jour ou il compte vraiment (AERO : 1,988034890229…
   *   coupe a 1,988034). Le vrai test est : le decimal affiche reconstitue-t-il `haut` ?
   *   ⇒ Trouve en LISANT la sortie rendue, pas en relisant le code. */
  const exact = (reste * echelle) % bas === 0n;
  return { etat: 'OK', texte: entier.toString() + (fracTexte ? '.' + fracTexte : ''),
    exact, pourquoi: null };
}

/**
 * La phrase du plan. ⛔ Elle ne dit « 1 for 1 » QUE si la parite est exacte, et elle dit
 * TOUJOURS que la supply est fixee — sinon le lecteur croirait l avoir choisie.
 *
 * ⛔⛔ LE RATIO SE DIT EN SUPPLY, ET LE VERBE EST LE MEME DANS LES DEUX BRANCHES : « one block
 *   stands for ». C est delibere. La branche a parite exacte disait deja « one block stands for one
 *   token » ; garder le meme verbe fait que seul LE NOMBRE change, et empeche le cas non-exact de
 *   se lire comme une promesse d une autre nature. ⛔ Et « stands for » n est pas « is backed by » :
 *   `avertissementNonAdosse()` suit IMMEDIATEMENT cette phrase partout ou elle est montree, et dit
 *   que rien n adosse et que personne ne rachete. Un ratio de SUPPLY n est pas un ancrage de PRIX,
 *   et la phrase le dit en nommant la supply.
 */
export function phrasePlanScelle(p, symboleSource) {
  if (!p || !ETATS.includes(p.etat)) return 'Plan: not computed.';
  if (p.etat === 'REFUSE') {
    return 'Cannot plan this block (' + (p.pourquoi || 'unknown') + ') — nothing to sign.';
  }
  const base = 'Every block is minted at a fixed 1 billion supply — you do not choose it. ';
  /* ⛔ Le symbole est OPTIONNEL et n est jamais invente : sans lui on dit « source token ». */
  const nom = (typeof symboleSource === 'string' && symboleSource.trim() !== '')
    ? symboleSource.trim() : 'source token';
  if (p.pariteExacte) {
    return base + 'This token has the same supply, so one block stands for one ' + nom + '.';
  }
  const r = ratioParBlock(p);
  if (r.etat === 'OK') {
    return base + 'This token has a different supply: one block stands for '
      + (r.exact ? '' : '~') + r.texte + ' ' + nom
      + ' by supply, and the opening pool price carries that difference.';
  }
  /* ⛔ LE CAS MUET PARLE. Si le ratio n est pas calculable ou tombe sous la precision, on le DIT
   *   au lieu de revenir a l ancienne phrase vague — sinon on aurait reintroduit le defaut pour
   *   les cas rares, c est-a-dire exactement la ou personne ne regarde. */
  return base + 'This token has a different supply, so the opening pool price carries the '
    + 'difference. The exact ratio is not shown here ('
    + (r.etat === 'SOUS_PRECISION' ? 'it is smaller than this screen can display' : (r.pourquoi || 'not computed'))
    + ').';
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

/**
 * La phrase du frais.
 *
 * ⛔⛔⛔ CETTE PHRASE SOUS-EVALUAIT LE COUT D UN FACTEUR SIX, ET C EST MOI QUI L AI ECRITE.
 *   Elle disait « then 50 bps on every in-app trade » — 0,5 %, notre taux d INTERFACE. Mais sur
 *   un block lance avec notre hook, c est le HOOK qui prend, et il prend 300 bps :
 *     app.html:7268  `const HOOK_PREVU_FRAIS_BPS = 300;`
 *     app.html:7289  « sur nos pools, l interface ne s ajoute plus au hook : TOTAL 3 % »
 *   L ecran de marche affiche donc « Fee 3% » pendant que cet ecran-ci annonçait 0,5 %. Deux
 *   chiffres pour le meme geste, et c est le plus petit qui etait mis en avant. Annoncer moins
 *   que le vrai prix est exactement ce que la regle anti-hype interdit.
 *   ⇒ Trouve par Zero 1 (2026-09-30), verifie dans le code avant correction.
 *
 * ⛔ ET ON NE PROMET PLUS UN TAUX UNIQUE : le frais depend du marche ou le block finit. Sur nos
 *   pools hookees c est 3 % ; ailleurs, le marche fixe le sien et l ecran le lit pool par pool
 *   (`libelleFrais`). Une phrase qui donne UN chiffre pour TOUS les cas est fausse des qu il y a
 *   plus d un cas — et il y en a plus d un.
 *
 * ⛔⛔ ET TROIS DEFAUTS DE PLUS, TROUVES PAR PHIL SUR L ECRAN AERO (2026-09-30).
 *
 * 1. « One-off market opening fee. » N AVAIT AUCUN MONTANT. Et l onglet d a cote, `app.html:1834`,
 *    ecrit « the same 0.001 ETH Birth fee as any block ». Donc DEUX NOMS et UN SEUL CHIFFRE pour
 *    un seul geste — et c est l ecran qui fait SIGNER qui cachait le montant. Un facteur sans son
 *    montant est une sur-vente : c est exactement le cas que la regle anti-hype vise.
 *    ⇒ Le montant est desormais un ARGUMENT. Recopier « 0,001 ETH » dans la chaine ferait pourrir
 *      la phrase le jour ou `FRAIS_OUVERTURE_WEI` bouge — en silence, sur l ecran de signature.
 *      Et le nom est aligne sur « Birth fee », celui que l autre ecran emploie deja.
 *
 * 2. « EVERY screen shows the exact rate » ETAIT UN ABSOLU NON PROUVE. Mesure : `libelleFrais` est
 *    appele sur TROIS ecrans (`app.html` 8479, 10326, 10433). Trois n est pas « tous », et je ne
 *    sais pas prouver l absolu — donc je ne l ecris pas. La phrase nomme l ecran de marche, ou la
 *    mesure tient.
 *
 * 3. ⛔ SANS MONTANT LU, ON NE SE TAIT PAS. Une ligne de frais sans chiffre se lit comme « c est
 *    negligeable ». Elle DIT que le montant n a pas ete lu, et renvoie a l ecran qui le porte :
 *    un manque VISIBLE, jamais un manque silencieux.
 */
export function phraseFraisChemin(p, fraisOuvertureWei) {
  if (!p || !ETATS.includes(p.etat)) return 'Fees: not computed.';
  if (p.etat === 'REFUSE') {
    return 'No fee line for this path (' + (p.pourquoi || 'unknown') + ') — refusing to build it.';
  }
  const suite = ' Trading it then costs whatever its market charges — a block opened here carries a '
    + '3% market fee, and the market screen shows the exact rate of the pool you are trading in.';
  if (typeof fraisOuvertureWei !== 'bigint' || fraisOuvertureWei <= 0n) {
    return 'Birth fee: amount not read on this screen — check it in Create before you sign.' + suite;
  }
  return 'Birth fee ' + formaterEthExact(fraisOuvertureWei) + ' ETH, when you sign in Create.' + suite;
}

/**
 * Le wei en ETH lisible, SANS virgule flottante.
 * ⛔ `Number(wei) / 1e18` perd des chiffres des que le montant grossit, et un frais affiche faux
 *   est pire qu un frais non affiche. On decoupe en entiers, et on ote les zeros de QUEUE
 *   seulement — jamais un chiffre significatif.
 */
function formaterEthExact(wei) {
  const s = wei.toString().padStart(19, '0');
  const entier = s.slice(0, s.length - 18).replace(/^0+(?=\d)/, '');
  const frac = s.slice(s.length - 18).replace(/0+$/, '');
  return frac === '' ? entier : entier + '.' + frac;
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
