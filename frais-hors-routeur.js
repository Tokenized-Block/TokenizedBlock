/* PRENDRE NOTRE PART QUAND LE ROUTEUR NE SAIT PAS LA PRENDRE.
 *
 * ⛔⛔ LE PROBLEME MESURE (2026-09-30) : 15 blocks sont cotes contre une action tokenisee —
 *   1 786 522 $ de volume sur 24 h — et ils sont TOUS sur Uniswap. Or `sweepTokenWithFee`, qui
 *   porte notre retenue DANS le swap, n existe que sur le routeur Aerodrome. Sur ces 15-la, la
 *   porte rendait donc `ADMIS_SANS_FRAIS` : achetables, mais ne payant rien.
 *
 * ✅ CE QUI REND LA CHOSE POSSIBLE : le banc de fork a prouve 3/3 que notre part tombe avec un
 *   `transfer` ORDINAIRE, place a cote du swap — donc agnostique du routeur.
 *
 * ⛔⛔⛔ MAIS LE COMMENTAIRE DE `plan-eth-block.js` PORTE L OBJECTION, ET ELLE EST JUSTE :
 *     « les deux appels dans la MEME transaction, donc l utilisateur ne peut pas prendre le swap
 *       sans la retenue — contrairement a un transfert separe QU IL POURRAIT REFUSER. »
 *   Un `transfer` separe n est honnete QUE s il est indissociable du swap. Ca demande un lot
 *   ATOMIQUE, et l atomicite n est PAS acquise : `wallet_sendCalls` est une RPC de WALLET, et la
 *   mesure du jour donne 22 « oui » pour 15 « non » — une PART IMPORTANTE des wallets ne tiennent pas.
 *
 *   ⛔⛔⛔ CE CHIFFRE A ETE CITE COMME « 40,5 % » DANS CINQ MODULES, ET CE N EST PAS UN TAUX.
 *     Relecture de l entonnoir SERVI le 2026-10-01, par jour, sur `capacite_lot_oui` /
 *     `capacite_lot_non` :
 *         2026-09-29   oui  9   non 15   ->  62,5 % sans lot
 *         2026-09-30   oui 13   non  3   ->  18,8 % sans lot
 *         cumul        oui 22   non 18   ->  45,0 %
 *     Les DEUX SEULS JOURS mesures se CONTREDISENT, avec n=24 et n=16. On ne peut pas trancher
 *     entre le bruit d echantillon et un vrai changement, et annoncer « 40,5 % » comme une
 *     propriete du parc de wallets est une precision que la donnee ne porte pas. Un chiffre qui
 *     PORTE UNE DECISION doit porter sa borne, sinon il devient une constante de folklore que
 *     personne ne reverifie.
 *   ⇒ CE QUI RESTE VRAI ET SUFFIT A LA DECISION : une part IMPORTANTE des wallets ne groupe pas —
 *     assez pour qu un chemin qui EXIGE le lot ne puisse pas etre le seul propose. Le refus
 *     fail-closed ci-dessous ne depend PAS du chiffre exact, seulement du fait qu il n est pas
 *     negligeable. C est pour ca qu il tient malgre l incertitude.
 *   ⚠️ ET LE COMPTEUR MESURE CE QUE LE WALLET *DECLARE* via `wallet_getCapabilities`, pas ce qu il
 *     SAIT faire : la lecon `tip 20260922-ib-batch` dit que des wallets repondent mal et groupent
 *     quand meme. Le vrai taux d echec A L USAGE est donc AU PLUS celui-la, probablement moins.
 *
 *   ⇒ SANS ATOMICITE PROUVEE, ON NE PREND RIEN. Un frais qu on ajoute en esperant que la personne
 *     signe les deux appels serait un frais qu on pourrait perdre, ou pire, qu elle subirait
 *     sans le swap. Fail-closed.
 *
 * ⛔⛔ ET LA PART SE PREND SUR LE MINIMUM GARANTI, JAMAIS SUR LA SORTIE REELLE. Dans un lot, tous
 *   les appels sont construits AVANT la signature : la sortie n est pas encore connue. Mesure du
 *   banc : 9,7 bps pris sur 10 vises. On encaisse MOINS, jamais plus — prendre 0,1 % d un chiffre
 *   inconnu reviendrait a depasser le taux affiche des que le marche bouge du bon cote.
 */

export const FORMES = Object.freeze(['ROUTEUR', 'TRANSFERT_SEPARE', 'AUCUNE']);

/**
 * Sous quelle forme notre part peut-elle etre prise, pour ce marche et ce wallet ?
 *
 * ⛔ `lotAtomique` doit valoir `true` FRANCHEMENT. `undefined`, `null`, une chaine « true » ou un
 *   lecteur qui n a pas encore mesure ne suffisent pas : l atomicite se PROUVE, elle ne se
 *   suppose pas. Le doute profite a l utilisateur.
 */
export function formeDuFrais({ familleProuvee, lotAtomique } = {}) {
  if (familleProuvee === 'aerodrome') {
    return { forme: 'ROUTEUR', pourquoi: 'the router carries the fee inside the swap' };
  }
  /* ⛔⛔ DEFAUT TROUVE PAR MON PROPRE TEST, ET IL ETAIT GRAVE : sans cette garde, une famille
   *   JAMAIS LUE + un lot atomique donnaient TRANSFERT_SEPARE. On aurait preleve sur un marche
   *   dont on ignore tout — une ignorance traitee comme une permission. Le nom de la famille
   *   doit etre CONNU avant qu on touche a quoi que ce soit. */
  const familleLue = typeof familleProuvee === 'string' && familleProuvee.trim() !== '';
  if (!familleLue) {
    return { forme: 'AUCUNE', pourquoi: 'the market family was never read' };
  }
  if (lotAtomique === true) {
    return { forme: 'TRANSFERT_SEPARE',
      pourquoi: 'this wallet proves atomic batching, so the transfer cannot be separated from the swap' };
  }
  return { forme: 'AUCUNE',
    pourquoi: familleProuvee === undefined || familleProuvee === null
      ? 'the market family was never read'
      : 'this market is off the fee-carrying router, and this wallet has not proven atomic batching' };
}

/** Notre part peut-elle etre prise du tout ? ⛔ Jamais « presque ». */
export function fraisPossible(f) {
  return !!f && (f.forme === 'ROUTEUR' || f.forme === 'TRANSFERT_SEPARE');
}

/**
 * La part, calculee sur le MINIMUM GARANTI.
 *
 * ⛔ ARRONDI VERS LE BAS, DELIBEREMENT : `minimum * bps / 10000` en entiers tronque, donc on
 *   prend toujours un peu MOINS que le taux affiche. C est le sens qu on veut — l autre sens
 *   ferait depasser le taux annonce, et un taux depasse est une promesse rompue.
 * ⛔ REND 0n PLUTOT QUE DE LEVER sur une entree absurde : un plan sans frais reste un plan
 *   valide, alors qu une exception ici tuerait l achat entier.
 */
export function partSurMinimumGaranti({ minimumGaranti, bps } = {}) {
  if (typeof minimumGaranti !== 'bigint' || minimumGaranti <= 0n) return 0n;
  let b;
  try { b = BigInt(bps); } catch (_) { return 0n; }
  if (b <= 0n) return 0n;
  /* ⛔ Un taux au-dela de 100 % n est pas un taux : on refuse plutot que de tout prendre. */
  if (b > 10000n) return 0n;
  return (minimumGaranti * b) / 10000n;
}

/**
 * Ce que l acheteur recevra AU MINIMUM, une fois notre part retiree.
 * ⛔ CETTE VALEUR EXISTE POUR ETRE AFFICHEE. Annoncer un minimum garanti sans en retirer notre
 *   part afficherait un chiffre que l acheteur ne verra jamais — le genre d ecart qu on decouvre
 *   apres coup, et qui coute la confiance.
 */
export function minimumPourLAcheteur({ minimumGaranti, bps } = {}) {
  if (typeof minimumGaranti !== 'bigint' || minimumGaranti <= 0n) return 0n;
  const part = partSurMinimumGaranti({ minimumGaranti, bps });
  return minimumGaranti - part;
}

/** La phrase montree avant signature. ⛔ Un cas sans frais PARLE aussi : « rien » se dit. */
export function phraseFormeDuFrais(f, bps) {
  if (!f || !FORMES.includes(f.forme)) return 'Fee: not computed.';
  if (f.forme === 'AUCUNE') {
    return 'This app takes nothing on this trade — ' + f.pourquoi + '.';
  }
  const taux = Number(bps) / 100;
  if (f.forme === 'ROUTEUR') {
    return taux + '% goes to this app, taken inside the swap itself.';
  }
  return taux + '% goes to this app, as a second call signed together with the swap — '
    + 'computed on the minimum you are guaranteed, so it is never more than ' + taux + '%.';
}
