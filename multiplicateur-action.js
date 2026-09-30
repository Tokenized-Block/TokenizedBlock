// multiplicateur-action.js — LE SOLDE BRUT N EST PAS TOUJOURS L EQUIVALENT-ACTION. LE DIRE.
// ================================================================================================
// ⛔⛔ CE QUE L EMETTEUR DECLARE, LU SUR SON PROPRE SITE LE 2026-09-30 (coinbase.com/tokenize, FAQ) :
//     « dividends and splits [are handled] through an ONCHAIN MULTIPLIER rather than by changing
//      your token balance. Your raw token count stays the same while the multiplier scales. »
//     Ces actions sont emises par Coinbase, en B20 sur Base, sous Regulation S.
//
// ⛔⛔ ET C EST DEJA VRAI CHEZ NOUS. Mesure du 2026-09-30, `multiplier()` lu sur les 14 actions de
//     `paires.js`, 14/14 lues, 0 non lue :
//         GOOGLc  1 000 377 118 676 784 179  = 1,000377x
//         METAc   1 000 313 792 289 598 084  = 1,000314x
//         les 12 autres                        1,000000x
//     EXACTEMENT DEUX — et le registre de l emetteur affiche un onglet « SPLIT 2 ». Corroboration
//     que je n avais pas cherchee.
//
// ⛔⛔⛔ CE MODULE NE RECALCULE RIEN, ET C EST UNE DECISION, PAS UNE PARESSE. J ai mesure que
//      `multiplier()` EXISTE et ce qu il vaut ; je n ai PAS lu comment il entre dans le calcul
//      officiel de l equivalent-action. Multiplier le solde par ce facteur serait inventer une
//      formule et l afficher comme un fait — exactement le genre de chiffre que ce projet refuse de
//      publier. On DIT que le compte brut n est plus l equivalent-action, et de combien le
//      multiplicateur s ecarte. Nommer son ignorance vaut mieux qu un chiffre faux presente comme sur.
//
// ⚠️ AUJOURD HUI L ECART EST DE 0,03 % : negligeable. LE MECANISME, LUI, NE L EST PAS — un split 4:1
//    porterait le multiplicateur a 4,0 et tout affichage derive du solde serait faux de 300 %, EN
//    SILENCE. Ce module existe pour que ce jour-la l ecran le dise au lieu de mentir.
//
// ⚠️ CE QUE CE MODULE NE COUVRE PAS : les prix. Ils viennent du PRIX DE POOL, pas du solde, et
//    restent donc justes quoi qu il arrive au multiplicateur.

/** ⛔ SELECTEUR CALCULE PAR KECCAK sur `multiplier()`, pas recite — et verifie en vivant : un nom
 *  invente REVERTE sur ces memes jetons, donc la sonde discrimine. */
export const SELECTEUR_MULTIPLIER = '0x1b3ed722';

/** La valeur neutre : 1,0 en 18 decimales. */
export const MULTIPLICATEUR_NEUTRE = 1000000000000000000n;

/** ⛔ FERMEE : un etat hors liste serait un trou de decision. */
export const ETATS_MULTIPLICATEUR = Object.freeze(['NEUTRE', 'DERIVE', 'NON_MESURE']);

/**
 * Classe un multiplicateur brut.
 * ⛔ TOTALE : toute entree rend un etat, jamais une exception. Un multiplicateur illisible est
 *   `NON_MESURE` — JAMAIS `NEUTRE`. Traiter l illisible comme neutre ferait taire l avertissement
 *   exactement quand on ne sait pas, c est-a-dire au pire moment.
 * @param {bigint|string|null} brut  la valeur rendue par `multiplier()`
 * @returns {{etat:string, facteur:(bigint|null), ecartBps:(bigint|null), pourquoi:string}}
 */
export function etatMultiplicateur(brut) {
  let v = null;
  if (typeof brut === 'bigint') v = brut;
  else if (typeof brut === 'string' && /^0x[0-9a-fA-F]+$/.test(brut)) { try { v = BigInt(brut); } catch (_) { v = null; } }
  else if (typeof brut === 'number' && Number.isSafeInteger(brut) && brut >= 0) v = BigInt(brut);
  if (v === null) {
    return { etat: 'NON_MESURE', facteur: null, ecartBps: null,
      pourquoi: 'the multiplier could not be read — the raw balance may not be the share equivalent' };
  }
  if (v === MULTIPLICATEUR_NEUTRE) {
    return { etat: 'NEUTRE', facteur: v, ecartBps: 0n,
      pourquoi: 'no dividend or split has moved this one yet' };
  }
  /* ⛔ L ECART EST SIGNE ET EN BPS : un multiplicateur SOUS 1 existe aussi (regroupement d actions),
   *   et l afficher en valeur absolue cacherait le sens du mouvement. */
  const ecart = ((v - MULTIPLICATEUR_NEUTRE) * 10000n) / MULTIPLICATEUR_NEUTRE;
  return { etat: 'DERIVE', facteur: v, ecartBps: ecart,
    pourquoi: 'a dividend or split has moved this token: the raw count is no longer the share equivalent' };
}

/**
 * La phrase a montrer a cote d une quantite.
 * ⛔ RIEN N EST DIT QUAND IL N Y A RIEN A DIRE : un avertissement permanent devient invisible, et
 *   celui-ci doit rester lisible le jour d un vrai split. `NEUTRE` rend une chaine VIDE.
 */
export function phraseMultiplicateur(r, symbole = 'this token') {
  if (!r || !ETATS_MULTIPLICATEUR.includes(r.etat)) return '';
  if (r.etat === 'NEUTRE') return '';
  if (r.etat === 'NON_MESURE') {
    return ' — we could not read ' + symbole + '’s dividend multiplier, so this raw count may not '
      + 'equal your share entitlement.';
  }
  const signe = r.ecartBps >= 0n ? '+' : '';
  return ' — heads up: ' + symbole + ' carries a dividend/split multiplier (' + signe + r.ecartBps
    + ' bps), so this raw count is not your share entitlement. The issuer scales it off-chain; we '
    + 'show what the chain holds.';
}
