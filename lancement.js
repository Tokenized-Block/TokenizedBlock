// lancement.js — les parametres d un lancement UNILATERAL, calcules et non devines.
// ================================================================================================
// ⛔ POURQUOI CE MODULE EXISTE. Un lancement sans capital tient a quatre nombres qui doivent etre
//    COHERENTS ENTRE EUX : le prix de depart, le tick correspondant, les deux bornes de la plage.
//    S ils divergent d une unite, la position redevient bilaterale et redemande de l ETH — sans
//    que rien ne le dise avant la signature. On les derive donc TOUS d une seule source, ici.
//
// ⛔⛔ ET LE SENS DE L ARRONDI DECIDE DU REGIME. `tickHaut` doit rester SOUS ou EGAL au tick
//    courant. Aligner vers le haut le placerait au-dessus, et la position exigerait l ETH qu on
//    n a pas. Mesure du 2026-09-06 : sur notre pool, le mauvais sens demandait 249 915 WETH.
//    Ce n est donc pas une precaution de style, c est la difference entre « gratuit » et
//    « impossible ».
//
// ⚠️ CE MODULE NE SIGNE RIEN ET NE LIT PAS LA CHAINE. Il calcule. Le tick COURANT doit lui etre
//    fourni par l appelant, LU dans slot0 — le recalculer depuis le prix introduirait un arrondi
//    la ou la chaine a deja une reponse exacte.

/** La borne basse utilisable pour un espacement donne, alignee vers le HAUT (donc >= MIN_TICK). */
export function tickMinAligne(espacement) {
  const e = Number(espacement);
  if (!Number.isInteger(e) || e <= 0) return null;
  /* -887272 est la borne de Uniswap. On aligne vers le haut : un tick sous la borne est refuse. */
  return Math.ceil(-887272 / e) * e;
}

/** Upper usable tick for a spacing, aligned down (<= MAX_TICK 887272). */
export function tickMaxAligne(espacement) {
  const e = Number(espacement);
  if (!Number.isInteger(e) || e <= 0) return null;
  return Math.floor(887272 / e) * e;
}

/**
 * Le tick correspondant a un prix (jeton1 par jeton0), aligne VERS LE BAS.
 * ⚠️ `Math.log` travaille en flottant : le tick rendu peut differer d une unite du tick exact.
 *    C est sans consequence ICI parce qu on aligne ensuite sur l espacement (60 ou 200), qui
 *    absorbe largement l ecart — mais ce serait faux de s en servir pour un prix au tick pres.
 */
export function tickDepuisPrix(prixNum, prixDen, espacement) {
  const n = Number(prixNum), d = Number(prixDen);
  if (!(n > 0) || !(d > 0)) return null;
  const e = Number(espacement);
  if (!Number.isInteger(e) || e <= 0) return null;
  return Math.floor(Math.log(n / d) / Math.log(1.0001) / e) * e;
}

/**
 * Tous les parametres d un lancement, derives ensemble.
 * @param {bigint} supply         unites ENTIERES de jeton (hors decimales)
 * @param {number} valorisationEth  ce que la supply entiere vaut au depart, en ETH
 * @param {number} espacement     tickSpacing de la pool visee
 * @param {number|null} tickCourant  si la pool existe deja : son tick LU. Sinon null.
 */
export function parametresLancement({ supply, valorisationEth, espacement, tickCourant = null, ecartDecimales = 0 }) {
  const s = BigInt(supply);
  if (s <= 0n) return { etat: 'REFUSE', pourquoi: 'supply must be positive' };
  const v = Number(valorisationEth);
  if (!(v > 0)) return { etat: 'REFUSE', pourquoi: 'valuation must be positive' };
  const tickBas = tickMinAligne(espacement);
  if (tickBas === null) return { etat: 'REFUSE', pourquoi: 'tick spacing must be a positive integer' };

  /* prix = combien de jetons pour 1 unite de devise = supply / valorisation, en UNITES DE BASE :
   * (supply x 10^decBlock) / (valo x 10^decDevise). Avec 18 et 18, l ecart vaut 0 et c est le ratio entier d avant.
   * ⛔ V3 (2026-09-19) : une action Coinbase a 8 decimales -> ecart = 18 - 8 = 10. Sans lui, la plage serait posee a
   *    ~230 000 ticks du prix de depart (le meme genre d erreur de 1e8 que le 2026-09-06). test-decimales-lancement.mjs. */
  const ecart = Number(ecartDecimales);
  if (!Number.isInteger(ecart) || Math.abs(ecart) > 30) return { etat: 'REFUSE', pourquoi: 'decimals gap out of range' };
  const tickPrix = tickDepuisPrix(Number(s) * 10 ** ecart, v, espacement);
  if (tickPrix === null) return { etat: 'REFUSE', pourquoi: 'price out of computable range' };

  /* ⛔ SI LA POOL EXISTE, LE TICK COURANT COMMANDE — pas celui qu on aurait voulu. Utiliser le
   *    tick DESIRE sur une pool deja prixee placerait la plage du mauvais cote du prix reel. */
  const tickHaut = tickCourant === null ? tickPrix
    : Math.min(tickPrix, Math.floor(Number(tickCourant) / Number(espacement)) * Number(espacement));

  if (tickHaut <= tickBas) {
    return { etat: 'REFUSE', pourquoi: 'the range collapses: upper tick ' + tickHaut + ' <= lower ' + tickBas };
  }
  return { etat: 'OK', tickBas, tickHaut, tickPrix,
    /* ⚠️ On rend AUSSI le tick desire quand il differe de celui retenu : sinon l appelant croirait
     *    avoir obtenu le prix demande alors que la pool en impose un autre. */
    prixImpose: tickCourant !== null && tickHaut !== tickPrix,
    espacement: Number(espacement) };
}

/** Documented 2026-09-07: whole-supply ETH below this arms a Launch soft-gate (second confirm).
 *  Not a “correct” price — friction against irreversible dust / sniper freebies.
 *  Practice E2E vals of 1–100 ETH stay one-click Work out → Launch. */
export const VALO_PLANCHER_ETH = 1;

/**
 * Classify a Launch valuation for the too-cheap / sniper soft-gate.
 * Callers already refuse ILLISIBLE (<=0 / non-finite). TROP_BON_MARCHE means: keep Work out,
 * but do not enable Launch until the user ticks an explicit permanent-price / sniper confirm.
 * @param {number|string} valorisationEth
 * @param {number} [plancherEth=VALO_PLANCHER_ETH]
 */
export function classementValoLancement(valorisationEth, plancherEth = VALO_PLANCHER_ETH) {
  const v = Number(valorisationEth);
  const plancher = Number(plancherEth);
  if (!Number.isFinite(v) || !(v > 0)) return { etat: 'ILLISIBLE' };
  if (!Number.isFinite(plancher) || !(plancher > 0)) {
    return { etat: 'ILLISIBLE', pourquoi: 'floor must be a positive number' };
  }
  if (v < plancher) return { etat: 'TROP_BON_MARCHE', plancherEth: plancher, valo: v };
  return { etat: 'OK', plancherEth: plancher, valo: v };
}
