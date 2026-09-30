/* LIRE LE PASSE D UNE ADRESSE SANS SE FAIRE MENTIR PAR LE NOEUD.
 *
 * Deux defauts distincts ont ete rencontres le 2026-09-30, et ce module tient les deux.
 *
 * 1. UN NOEUD NON-ARCHIVE REND SOUVENT L ETAT COURANT POUR UNE HAUTEUR PASSEE, SANS
 *    ERREUR. La serie est alors parfaitement PLATE — et « plat » se lit « stable » alors
 *    que ca veut dire « aveugle ». D ou `verdictArchive` : on interroge d abord une
 *    adresse dont la valeur DOIT avoir bouge ; si elle ne bouge pas, l instrument est
 *    casse, pas la chaine. C est un zero par impossibilite.
 *
 * 2. COMPARER UN CHIFFRE ARRONDI A UNE VALEUR EXACTE FAIT RATER UNE EGALITE VRAIE.
 *    Ma sonde a conclu « chiffre non retrouve » en comparant le littéral 0,002293010000
 *    a la valeur reelle 0,002293009705 : 295 wei d ecart, verdict inverse. Une garde
 *    arithmetiquement juste qui teste la mauvaise chose. D ou `memeChiffreArrondi`.
 */

export const VERDICTS_ARCHIVE = Object.freeze(['OK', 'ETAT_COURANT_SEUL', 'INSUFFISANT']);

/**
 * Le noeud sait-il repondre dans le passe ?
 * `serie` = les valeurs lues pour une adresse TEMOIN dont la valeur doit avoir change.
 * Les trous sont passes en null et ne comptent pas.
 *
 * - INSUFFISANT       : moins de 2 valeurs lues -> on ne peut rien affirmer.
 * - ETAT_COURANT_SEUL : toutes identiques alors qu elles devraient differer -> le noeud
 *                       rend l etat courant. Toute serie mesuree avec lui est NULLE.
 * - OK                : au moins deux valeurs distinctes -> l archive repond.
 */
export function verdictArchive(serie) {
  const lues = (Array.isArray(serie) ? serie : []).filter((x) => x !== null && x !== undefined);
  if (lues.length < 2) {
    return { verdict: 'INSUFFISANT', lues: lues.length, distincts: new Set(lues.map(String)).size };
  }
  const distincts = new Set(lues.map(String)).size;
  if (distincts === 1) return { verdict: 'ETAT_COURANT_SEUL', lues: lues.length, distincts };
  return { verdict: 'OK', lues: lues.length, distincts };
}

/** Une serie n a de sens que si le temoin est OK. ⛔ Jamais « presque OK ». */
export function serieExploitable(v) {
  return !!v && v.verdict === 'OK';
}

/**
 * Deux valeurs entieres representent-elles le MEME chiffre une fois arrondi a
 * `decimales` apres la virgule d une unite de `parUnite` ?
 * Pense pour comparer un wei exact a un montant en ETH note arrondi.
 * ⛔ Rend false sur toute entree non comparable — jamais « vrai par defaut ».
 */
export function memeChiffreArrondi(a, b, decimales = 9, parUnite = 10n ** 18n) {
  if (typeof a !== 'bigint' || typeof b !== 'bigint') return false;
  if (!Number.isInteger(decimales) || decimales < 0 || decimales > 18) return false;
  if (typeof parUnite !== 'bigint' || parUnite <= 0n) return false;
  /* Le pas = la plus petite difference VISIBLE a cette precision. */
  const pas = parUnite / 10n ** BigInt(decimales);
  if (pas <= 0n) return a === b;
  const ecart = a > b ? a - b : b - a;
  return ecart < pas;
}

/**
 * La phrase du verdict. ⛔ Un verdict non-OK doit PARLER : seul un succes a le droit
 * d etre muet, et un instrument aveugle qui se tait passe pour un instrument d accord.
 */
export function phraseArchive(v) {
  if (!v || !VERDICTS_ARCHIVE.includes(v.verdict)) {
    return 'Archive witness: not run.';
  }
  if (v.verdict === 'INSUFFISANT') {
    return 'Archive witness INCONCLUSIVE — only ' + v.lues + ' height(s) read. Nothing can be concluded.';
  }
  if (v.verdict === 'ETAT_COURANT_SEUL') {
    return 'Archive witness FAILED — one single value across ' + v.lues
      + ' heights on an address that must have changed. The node is serving CURRENT state; '
      + 'any series measured with it is void.';
  }
  return 'Archive witness OK — ' + v.distincts + ' distinct values across ' + v.lues + ' heights.';
}
