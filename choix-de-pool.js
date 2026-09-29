// choix-de-pool.js — CHOISIR LA POOL QUI NOUS PAIE, SANS FAIRE PAYER LE VISITEUR POUR CA.
// ================================================================================================
// ⛔⛔ LA DECISION DE PHIL (2026-09-30) : « preferer Aerodrome pour que le 0,1 % tombe ». Le besoin
//     est mesure : nos 0,1 % vivent dans `sweepTokenWithFee`, une fonction du routeur Aerodrome CL.
//     L Universal Router d Uniswap ne l a PAS (extraction PUSH4 : 11 selecteurs, `execute` present,
//     `0xe0e189a0` ABSENT). Et `poolAdr`, qui decide aujourd hui, designe la pool la PLUS LIQUIDE —
//     donc souvent Uniswap, donc zero frais. Les 138 transactions de Phil du 2026-09-29 sont toutes
//     parties vers l Universal Router : aucune ne pouvait nous payer.
//
// ⛔⛔⛔ MAIS ROUTER VERS UNE POOL MOINS PROFONDE COUTE AU VISITEUR, EN GLISSEMENT. Le faire en
//      silence, ce serait lui prendre plus que notre frais sans le dire — et la regle de ce projet
//      est que rien ne se prend sans etre nomme. D ou la seule regle que je sais defendre :
//
//        ⇒ ON NE DEVIE VERS LA POOL QUI NOUS PAIE QUE SI LE SURCOUT POUR LE VISITEUR
//          RESTE INFERIEUR OU EGAL AU FRAIS QU ON PREND.
//
//      Autrement dit : le detour ne lui coute JAMAIS plus que les 0,1 % qu on encaisse. Au-dela, on
//      le laisse sur la meilleure pool et on ne prend RIEN. Un frais non pris ne blesse personne ;
//      un visiteur qui paie 2 % de glissement pour qu on gagne 0,1 %, si.
//   ⛔ CE SEUIL EST UNE DECISION, PAS UNE MESURE : `MARGE_BPS` vaut le frais lui-meme. Phil peut le
//     changer — c est un nombre, pas une loi de la nature. Il est ecrit ici, en un seul endroit,
//     pour qu on puisse le discuter au lieu de le deduire du code.
//
// ⚠️ CE MODULE NE LIT RIEN ET NE SIGNE RIEN : il DECIDE, a partir de chiffres qu on lui donne. Les
//    lectures vivent chez l appelant, et c est ce qui rend cette decision rejouable et testable.

/** Les verdicts possibles. ⛔ FERMEE : un verdict hors liste serait un trou de decision. */
export const VERDICTS_CHOIX = Object.freeze([
  'AERODROME',        // on devie (ou on y etait deja) : le frais tombera
  'AUTRE_MEILLEURE',  // la pool qui paie coute trop cher au visiteur : on le laisse au mieux, sans frais
  'AERODROME_SEULE',  // il n existe pas d alternative : rien a arbitrer
  'AUTRE_SEULE',      // aucune pool Aerodrome : le frais est impossible, et on le DIT
  'NON_MESURE',       // il manque un chiffre : on ne devie pas sur une supposition
]);

/** ⛔ LA MARGE EST LE FRAIS LUI-MEME : le detour ne peut pas couter plus que ce qu il rapporte. */
export const MARGE_BPS = 10n;

const estEntier = (x) => typeof x === 'bigint' || (typeof x === 'number' && Number.isFinite(x));
const enBig = (x) => (typeof x === 'bigint' ? x : BigInt(Math.round(x)));

/**
 * Choisit entre la pool qui nous paie (Aerodrome CL) et la meilleure pool disponible.
 *
 * @param {object} p
 * @param {{pool:string, glissementBps:(number|bigint)}|null} p.aerodrome  la pool qui porte le frais
 * @param {{pool:string, glissementBps:(number|bigint), famille?:string}|null} p.autre  l autre
 * @param {bigint} [p.margeBps]  surcout maximal accepte pour le visiteur (defaut : le frais)
 * @returns {{verdict:string, pool:(string|null), porteFrais:boolean, surcoutBps:(bigint|null), pourquoi:string}}
 */
export function choisirPool({ aerodrome = null, autre = null, margeBps = MARGE_BPS } = {}) {
  const gA = aerodrome && estEntier(aerodrome.glissementBps) ? enBig(aerodrome.glissementBps) : null;
  const gB = autre && estEntier(autre.glissementBps) ? enBig(autre.glissementBps) : null;
  const aA = aerodrome && typeof aerodrome.pool === 'string' ? aerodrome.pool : null;
  const aB = autre && typeof autre.pool === 'string' ? autre.pool : null;

  /* ⛔ AUCUNE POOL CONNUE : ce n est pas « pas de frais », c est « on ne sait pas ». */
  if (!aA && !aB) {
    return { verdict: 'NON_MESURE', pool: null, porteFrais: false, surcoutBps: null,
      pourquoi: 'no pool was resolved on either side' };
  }
  /* ⛔ UNE SEULE POOL : rien a arbitrer, et on nomme laquelle c est. */
  if (aA && !aB) {
    if (gA === null) {
      return { verdict: 'NON_MESURE', pool: null, porteFrais: false, surcoutBps: null,
        pourquoi: 'the Aerodrome pool was found but its slippage could not be read' };
    }
    return { verdict: 'AERODROME_SEULE', pool: aA, porteFrais: true, surcoutBps: 0n,
      pourquoi: 'this market only exists on Aerodrome' };
  }
  if (!aA && aB) {
    return { verdict: 'AUTRE_SEULE', pool: aB, porteFrais: false, surcoutBps: null,
      pourquoi: 'there is no Aerodrome pool for this block, so no fee can be taken on this route' };
  }
  /* ⛔⛔ DEUX POOLS : IL FAUT LES DEUX GLISSEMENTS. Devier sans savoir ce que ca coute au visiteur
   *     serait exactement le silence qu on refuse. Un chiffre manquant ⇒ on NE DEVIE PAS. */
  if (gA === null || gB === null) {
    return { verdict: 'NON_MESURE', pool: aB, porteFrais: false, surcoutBps: null,
      pourquoi: 'both pools exist but one slippage could not be read, so the detour cost is unknown' };
  }
  const surcout = gA - gB;
  /* ⛔ `<= marge` ET PAS `< marge` : un surcout EGAL au frais est le cas limite accepte, et il est
   *   nomme. Une inegalite stricte ici rejetterait le cas exactement a la frontiere sans raison. */
  if (surcout <= margeBps) {
    return { verdict: 'AERODROME', pool: aA, porteFrais: true, surcoutBps: surcout,
      pourquoi: surcout <= 0n
        ? 'the Aerodrome pool is at least as good for you, and it pays the creator'
        : 'the Aerodrome pool costs you ' + surcout + ' bps more, which is within the '
          + margeBps + ' bps fee itself' };
  }
  /* ⛔⛔ LE CAS QUI PROTEGE LE VISITEUR : on renonce au frais plutot que de lui faire payer le
   *     detour. Un frais non pris ne blesse personne. */
  return { verdict: 'AUTRE_MEILLEURE', pool: aB, porteFrais: false, surcoutBps: surcout,
    pourquoi: 'routing to the pool that pays the creator would cost you ' + surcout
      + ' bps more than the best pool, which is above the ' + margeBps + ' bps fee — so we do not '
      + 'do it, and we take nothing' };
}

/** La phrase a montrer, pour que le choix ne soit jamais silencieux. */
export function phraseDuChoix(r) {
  if (!r || !VERDICTS_CHOIX.includes(r.verdict)) return 'Route unknown — nothing was chosen.';
  if (r.verdict === 'AERODROME') {
    return r.surcoutBps !== null && r.surcoutBps > 0n
      ? 'Routed through the pool that pays this block’s creator: it costs you ' + r.surcoutBps
        + ' bps more than the deepest pool, never more than the 0.1% fee itself.'
      : 'Routed through the pool that pays this block’s creator, at no extra cost to you.';
  }
  if (r.verdict === 'AERODROME_SEULE') return 'This market only exists on Aerodrome.';
  if (r.verdict === 'AUTRE_MEILLEURE') {
    return 'Kept you on the deepest pool: the one that pays the creator would have cost you '
      + r.surcoutBps + ' bps more, so no fee is taken here.';
  }
  if (r.verdict === 'AUTRE_SEULE') return 'This block has no Aerodrome pool, so no fee is taken here.';
  return 'We could not compare the two routes, so we did not move you off the deepest pool.';
}
