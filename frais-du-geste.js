// frais-du-geste.js — LES 0,1 % SUR UN GM : VISIBLES, OU PAS PRIS DU TOUT.
// ================================================================================================
// ⛔⛔ LE CHOIX DE PHIL (2026-09-30), ENTRE LES DEUX SEULS MONTAGES POSSIBLES :
//     · retenir sur le montant envoye  -> le destinataire recoit MOINS que ce que l expediteur a
//       choisi. Preleve en douce sur un cadeau entre deux personnes. ⛔ REFUSE.
//     · un SECOND TRANSFERT vers notre wallet -> le destinataire recoit EXACTEMENT ce qui est
//       affiche, et notre part est une ligne separee, visible avant signature. ✅ C est celui-ci.
//   ⇒ Ce module calcule cette seconde ligne. Il ne touche JAMAIS au montant destine a l ami.
//
// ⛔⛔⛔ LA GARDE QUI COMPTE LE PLUS : UN FRAIS QUI TOMBE A ZERO N EST PAS UN FRAIS DE ZERO, C EST
//      UN GESTE SANS FRAIS. Le montant par defaut d un GM est « 1 unite ». Sur un jeton a 8
//      decimales, 1 unite = 100 000 000, donc 0,1 % = 100 000 : ca passe. Mais sur un envoi minuscule
//      (ou un jeton a 0 decimale), 0,1 % s arrondit a ZERO. Ajouter alors une seconde transaction
//      de montant nul ferait payer du GAZ a quelqu un pour nous envoyer RIEN. On ne l ajoute pas, et
//      l ecran le dit.
//
// ⛔ AUCUNE DIVISION FLOTTANTE. Tout est en `BigInt` : un `Number` sur des montants a 18 decimales
//   perd de la precision bien avant le dernier chiffre, et un frais faux d un wei est un frais faux.
//
// ⚠️ CE QUE CE MODULE NE FAIT PAS : il ne decide pas SI on prend un frais sur ce geste. Il calcule
//    ce qu il vaudrait. L appelant decide, et l ecran l annonce — sinon ce serait exactement le
//    prelevement silencieux qu on vient de refuser.

/** 0,1 % — decision de Phil du 2026-09-28, la meme que sur les achats. */
export const FRAIS_GESTE_BPS = 10n;

/** ⛔ FERMEE : un etat hors liste serait un trou de decision. */
export const ETATS_FRAIS = Object.freeze(['AVEC_FRAIS', 'TROP_PETIT', 'SANS_FRAIS', 'NON_MESURE']);

/**
 * Ce que le geste coute en plus, si on prend le frais.
 * ⛔ TOTALE : toute entree rend un etat, jamais une exception. Un montant illisible rend
 *   `NON_MESURE` — et surtout PAS un frais de zero qu on pourrait croire calcule.
 *
 * @param {object} p
 * @param {bigint|string|number} p.montant  ce que l expediteur envoie a son ami, en unites brutes
 * @param {bigint} [p.bps]                  le taux, en points de base
 * @param {boolean} [p.actif]               false ⇒ on ne prend rien, et on le dit
 * @returns {{etat:string, frais:(bigint|null), pourAmi:(bigint|null), pourquoi:string}}
 */
export function fraisDuGeste({ montant, bps = FRAIS_GESTE_BPS, actif = true } = {}) {
  let m = null;
  if (typeof montant === 'bigint') m = montant;
  else if (typeof montant === 'string' && /^\d+$/.test(montant.trim())) m = BigInt(montant.trim());
  else if (typeof montant === 'number' && Number.isSafeInteger(montant) && montant >= 0) m = BigInt(montant);
  if (m === null || m < 0n) {
    return { etat: 'NON_MESURE', frais: null, pourAmi: null,
      pourquoi: 'the amount could not be read, so no fee can be computed from it' };
  }
  if (!actif) {
    return { etat: 'SANS_FRAIS', frais: 0n, pourAmi: m,
      pourquoi: 'no fee is taken on this gesture' };
  }
  /* ⛔ DIVISION ENTIERE, DONC ARRONDIE VERS LE BAS : on prend moins plutot que plus. Arrondir vers
   *   le haut prendrait un wei de trop a chaque envoi, et « un wei » repete est un choix, pas un
   *   arrondi. */
  const frais = (m * bps) / 10000n;
  if (frais === 0n) {
    /* ⛔⛔ ZERO N EST PAS UN FRAIS. Ajouter une transaction de montant nul ferait payer du gaz pour
     *   nous transferer RIEN — un cout pur pour l expediteur, et pour nous une ligne qui ne
     *   rapporte rien. Le geste part SANS frais, et l ecran l annonce. */
    return { etat: 'TROP_PETIT', frais: 0n, pourAmi: m,
      pourquoi: 'this amount is too small for the 0.1% to be worth a second transfer, so none is added' };
  }
  /* ⛔ L AMI RECOIT EXACTEMENT CE QUI EST AFFICHE : le frais s AJOUTE, il ne se retient pas. */
  return { etat: 'AVEC_FRAIS', frais, pourAmi: m,
    pourquoi: 'your friend receives the full amount; the 0.1% is a separate line you sign with it' };
}

/**
 * La phrase a montrer AVANT la signature. ⛔ Jamais vide sur un frais reel : un prelevement non
 * annonce est exactement ce que ce montage existe pour eviter.
 */
/* ⛔⛔ LE NOM EST LONG EXPRES. `phraseFrais` EXISTE DEJA dans `frais-creation.js`, avec une
 *     signature TOTALEMENT differente (`chaine, nomReseau, ethUsd, fraisWei, soldeEth`). Le
 *     compilateur a refuse le doublon — sinon l appel aurait vise la mauvaise fonction en silence,
 *     et l ecran aurait affiche une phrase de frais de CREATION a cote d un cadeau. Deux choses
 *     differentes ne partagent pas un nom. */
export function phraseFraisDuGeste(r, unites) {
  if (!r || !ETATS_FRAIS.includes(r.etat)) return '';
  const u = (v) => (typeof unites === 'function' ? unites(v) : String(v));
  if (r.etat === 'AVEC_FRAIS') {
    return 'Your friend receives ' + u(r.pourAmi) + ' in full. A separate 0.1% line of '
      + u(r.frais) + ' goes to the app — you sign both, and you can see both in your wallet.';
  }
  if (r.etat === 'TROP_PETIT') {
    return 'Too small for the 0.1% to be worth its own transfer, so none is added — your friend '
      + 'receives ' + u(r.pourAmi) + ' and nothing else moves.';
  }
  if (r.etat === 'SANS_FRAIS') return 'No fee on this one — your friend receives ' + u(r.pourAmi) + '.';
  return 'We could not read the amount, so nothing was prepared.';
}
