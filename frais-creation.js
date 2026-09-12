// frais-creation.js — le frais FIXE de creation, une seule source pour les deux ecrans.
// ================================================================================================
// ⛔⛔ CE MODULE NE DECIDE RIEN : il RECOPIE ce que l ancien ecran applique deja depuis des semaines
//    (`index.html`, `REAL_CREATE_SERVICE_FEE_WEI` et `FEE_WALLET`). Phil a tranche « option 2 :
//    frais de creation fixe » — c etait deja la regle en place, et deux chiffres differents pour le
//    meme frais sur deux ecrans serait pire que pas de frais du tout.
//    ⇒ `test-frais-creation.mjs` LIT `index.html` et echoue si les valeurs divergent. C est la garde
//      qui remplace la promesse « je penserai a les garder alignees ».
//
// ⛔ LE FRAIS EST UN TRANSFERT SEPARE, VISIBLE, SIGNE PAR L UTILISATEUR. On ne peut pas le glisser
//    dans l appel a la factory : `createB20` refuse toute valeur (`NonPayable()`). Donc deux gestes,
//    et l ecran doit le dire AVANT — une deuxieme signature surprise se lit comme un piege.
//
// ⛔ FAIL-CLOSED : si le transfert du frais echoue ou est refuse, la creation n est PAS envoyee.
//    L inverse — creer puis rater le frais — donnerait un block gratuit et un ecran qui ment.
//
// ⚠️ CE QUE CE MODULE NE FAIT PAS : il n envoie rien, ne signe rien, et ne connait pas le wallet.

/** ⛔ ADRESSE RECOPIEE DE `index.html` (const FEE_WALLET), jamais de memoire. */
export const FEE_WALLET = '0x37eb9b7ce0b51fe12fbf092026e001918128580a';

/** 0,00005 ETH — ce que l ANCIEN ecran applique. Garde ici pour que le test le surveille. */
export const FRAIS_HERITE_WEI = 50000000000000n;
/* Ancien nom garde pour ne casser aucun appelant. */
export const FRAIS_REEL_WEI = FRAIS_HERITE_WEI;

/**
 * ⛔⛔ LE FRAIS DE CETTE APP EST EN DOLLARS, PAS EN ETH. Decision de Phil, 2026-09-12 : « 1 dollar
 *    pour 1 Tokenized Block au tout debut ». Un frais fixe en ETH change de prix tous les jours sans
 *    que personne ne l ait decide — a 2 500 $/ETH, 0,00005 ETH valait 0,12 $, pas 1 $.
 * ⚠️ LES DEUX ECRANS DIVERGENT DONC VOLONTAIREMENT, et le test le sait : il verifie que l ancien
 *    montant n a pas bouge, il n exige plus qu il soit egal a celui-ci.
 * ⛔ LA CONVERSION DEMANDE UN PRIX LU (`prix-eth.js`, mediane de plusieurs pools). Sans prix fiable,
 *    la creation est REFUSEE — on ne prend pas d argent reel sur un prix suppose.
 */
export const FRAIS_USD = 1;

/**
 * ⛔⛔ LE FRAIS SE PAIE EN USDC, ET C EST PHIL QUI A EU RAISON (2026-09-12) : « fais la mesure en
 *    USDC alors, plus simple ». Un dollar en ETH demandait un prix lu sur plusieurs pools, un refus
 *    quand elles se contredisaient, un arrondi d affichage et un piege a zero. Un dollar en USDC vaut
 *    1 000 000 unites, exactement, toujours — aucune lecture, aucune supposition, aucun arrondi.
 * ⚠️ CE QUE CA COUTE : il faut detenir de l USDC sur Base. L ecran le verifie et le DIT avant.
 */
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const USDC_DECIMALES = 6;
export const FRAIS_USDC_UNITES = 1000000n;

/** ⛔ Les chaines ou un frais est du. Ailleurs — testnet — il vaut ZERO, et l ecran le dit. */
export const CHAINES_PAYANTES = [8453];

/**
 * Le frais du sur cette chaine, en wei.
 * ⛔ UNE CHAINE INCONNUE NE PAIE PAS. Reclamer un frais sur un reseau qu on ne connait pas
 *    prendrait de l argent reel pour un geste qu on n a pas mesure.
 */
export function fraisCreationWei(chaine) {
  return CHAINES_PAYANTES.includes(Number(chaine)) ? FRAIS_HERITE_WEI : 0n;
}

/** Le frais du en DOLLARS sur cette chaine. ⛔ Zero ailleurs que sur les chaines payantes. */
export function fraisCreationUsd(chaine) {
  return CHAINES_PAYANTES.includes(Number(chaine)) ? FRAIS_USD : 0;
}

/**
 * La phrase a afficher AVANT de creer : combien, a qui, et en combien de signatures.
 * ⛔ ELLE DIT LE NOMBRE DE SIGNATURES. C est l information qui manque toujours, et celle qui fait
 *    croire a une panne quand le wallet se rouvre une deuxieme fois.
 */
/**
 * @param {bigint|null} soldeUsdc  le solde USDC LU du compte, ou null s il n a pas ete lu
 */
export function phraseFrais(chaine, nomReseau, soldeUsdc = null) {
  const usd = fraisCreationUsd(chaine);
  if (usd === 0) {
    return 'No creation fee on ' + (nomReseau || 'this network') + ' — testnet blocks are free. '
      + 'One signature: the creation itself.';
  }
  const base = 'Creation fee: ' + usd + ' USDC, sent as its own visible transfer BEFORE the creation: '
    + 'two signatures, in that order — and if the fee is declined or fails, the block is NOT created.';
  /* ⛔ « PAS LU » N EST PAS « PAS ASSEZ ». On ne dit « il t en manque » que si on a VU le solde. */
  if (soldeUsdc === null || soldeUsdc === undefined) return base;
  if (BigInt(soldeUsdc) < FRAIS_USDC_UNITES) {
    return base + ' ⚠️ Your USDC balance on this network is below ' + usd + ' USDC, so creation cannot start.';
  }
  return base;
}

/**
 * L affichage arrondi a `n` decimales — pour lire, pas pour payer.
 * ⛔ IL NE SERT JAMAIS A CONSTRUIRE UNE TRANSACTION : le montant envoye reste le wei exact.
 */
export function arrondiAffichage(wei, n = 6) {
  const t = formaterEthCourt(wei);
  const [ent, frac = ''] = t.split('.');
  if (!frac) return ent;
  const coupe = frac.slice(0, n).replace(/0+$/, '');
  /* ⛔ UN MONTANT NON NUL NE S AFFICHE JAMAIS « 0 ». Sous la precision affichee, on dit « < 0.000001 »
   * plutot qu un zero qui ferait croire a la gratuite. */
  if (!coupe) return ent === '0' && BigInt(wei) > 0n ? '<0.' + '0'.repeat(n - 1) + '1' : ent;
  return ent + '.' + coupe;
}

/** ⛔ Un affichage EXACT, sans virgule flottante : 50000000000000 wei = 0.00005 ETH, pas 5e-5. */
export function formaterEthCourt(wei) {
  const s = BigInt(wei).toString().padStart(19, '0');
  const ent = s.slice(0, s.length - 18);
  const frac = s.slice(s.length - 18).replace(/0+$/, '');
  return frac === '' ? ent : ent + '.' + frac;
}
