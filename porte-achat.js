/* porte-achat.js — QUI MERITE UNE PUCE D ACHAT, ET POURQUOI. Module PUR, aucun reseau.
 *
 * ⛔⛔ CE QUE CE MODULE REMPLACE, ET LA MESURE QUI L A DECIDE. La porte etait `liq >= 10000` sur la
 *     TVL rendue par dexscreener. Mesure du 2026-09-28 en lisant `liquidity()` AU TICK COURANT :
 *
 *       pool    TVL          L au tick     100 USDC    l ancienne porte disait
 *       BEc     10 072 $     3,09e9         385 bps    ADMISE
 *       MUc      9 728 $     7,23e10          8 bps    refusee
 *       HIMSc    9 265 $     8,16e9         418 bps    refusee
 *       AVGOc    9 252 $     2,38e9         418 bps    refusee
 *       NVDAc 2 349 408 $    2,10e14          0 bps    ADMISE
 *
 *     Elle admettait donc la pool a 3,85 % et refusait celle a 0,08 % — 48 fois mieux. En
 *     liquidite concentree, toute la liquidite peut etre LOIN du prix courant : la TVL ne dit pas
 *     le glissement, et le classement s inverse. La garde etait VRAIE et son critere le mauvais.
 *
 * ⛔ DEUX CONDITIONS, decision de Phil du 2026-09-28 : le glissement a une taille de reference ET
 *   la famille du routeur. La seconde n est pas une preference esthetique : notre frais de 0,1 %
 *   passe par `sweepTokenWithFee`, qui n existe QUE sur le routeur Aerodrome. Un actif hors
 *   Aerodrome est achetable ailleurs et ne nous rapporte rien — le pousser avec une puce serait
 *   travailler gratuitement. Le glissement seul aurait admis MUc (8 bps, Uniswap, 0 revenu) et
 *   ejecte BEc ; les deux conditions ensemble disent non aux deux, pour des raisons DIFFERENTES,
 *   et le verdict le nomme.
 *
 * ⛔⛔ TROIS ETATS, JAMAIS DEUX. `NON_MESURE` n est pas `REFUSE` : une pool dont on ne sait pas lire
 *     la liquidite n est pas une pool mauvaise, et confondre notre aveuglement avec son verdict est
 *     exactement la faute qui a deja fait publier « aucune preuve » pour « je n ai pas regarde ».
 */

/** Les verdicts, exhaustifs et disjoints. Un appelant qui en oublie un se trahit sur ce tableau.
 *
 * ⛔⛔ `ADMIS_SANS_FRAIS` EXISTE PARCE QUE REFUSER ETAIT LA MAUVAISE REPONSE. Premiere version :
 *     hors Aerodrome = pas de puce. Decision de Phil du 2026-09-29, apres avoir vu le chiffre :
 *     « accepte si ca passe via Uniswap, MUc on va pas le condamner ». Il a raison — MUc glisse de
 *     8 bps, quarante-huit fois mieux que BEc, et le chemin USDC sait servir la famille `v3`
 *     (`REGLAGES_FAMILLE` dans `echange-v3.js`, verifie avant d ecrire ceci : ce n est donc pas un
 *     cul-de-sac). Priver l utilisateur d un bon marche parce qu IL ne nous paie pas serait faire
 *     passer notre interet avant le sien.
 *   ⛔ MAIS ON LE DIT. Un actif admis qui ne porte pas notre retenue est admis EN LE DISANT :
 *     `sweepTokenWithFee` n existe que sur le routeur Aerodrome, donc ces achats ne rapportent
 *     rien. Le taire serait annoncer un revenu qui n arrive pas — et c est precisement la faute
 *     corrigee la veille sur le chemin ETH. */
export const VERDICTS_PORTE = Object.freeze(['ADMIS', 'ADMIS_SANS_FRAIS', 'GLISSEMENT_TROP_FORT', 'NON_MESURE']);

/* ⛔ NOS CHIFFRES, ET ILS SONT A NOUS — aucune limite de contrat ne les impose. Ils sont donc
 *   exportes pour qu un test puisse les citer au lieu de les recopier, et commentes pour qu on
 *   sache quoi bouger. 300 bps = 3 % de glissement sur un achat de reference de 100 USDC. */
export const GLISSEMENT_MAX_BPS = 300n;
export const TAILLE_REFERENCE_USDC = 100000000n;   /* 100 USDC, 6 decimales */

const Q96 = 2n ** 96n;

/** Un entier non negatif, ou `null`. ⛔ `null` et `0n` ne se confondent pas ici : 0 est une valeur. */
function entier(v) {
  if (typeof v === 'bigint') return v >= 0n ? v : null;
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? BigInt(v) : null;
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  return null;
}

/** Le glissement de prix d un achat, en bps, calcule DANS le tick courant.
 *
 * ⛔⛔ CE QU IL SUPPOSE, ET QUI LE REND OPTIMISTE : il ne traverse aucune borne de liquidite. Un
 *     achat qui franchit un tick initialise coute PLUS. Ce chiffre est donc un PLANCHER de
 *     glissement, jamais un plafond — et une porte batie dessus est plus permissive qu elle
 *     n en a l air. C est dit ici parce qu un plancher pris pour un plafond est la facon la plus
 *     simple de se croire prudent.
 * ⛔ DEUX FORMULES, ET LE SENS DECIDE LAQUELLE. Se tromper de sens rend un chiffre PLAUSIBLE et
 *   FAUX, donc publiable sans le voir.
 * @returns {{etat:'OK',bps:bigint}|{etat:'NON_MESURE',pourquoi:string}}
 */
export function glissementBps({ sqrtPriceX96, liquidite, entree, entreeEst0 } = {}) {
  const s = entier(sqrtPriceX96);
  const L = entier(liquidite);
  const dIn = entier(entree);
  if (s === null || s === 0n) return { etat: 'NON_MESURE', pourquoi: 'no sqrtPriceX96 read on this pool' };
  if (L === null) return { etat: 'NON_MESURE', pourquoi: 'no liquidity read on this pool' };
  /* ⛔ `L == 0` N EST PAS « GLISSEMENT INFINI » : c est une pool sans liquidite au tick courant,
   *   donc un achat y est impossible, pas cher. On le nomme au lieu de rendre un grand nombre. */
  if (L === 0n) return { etat: 'NON_MESURE', pourquoi: 'zero liquidity at the current tick — a buy cannot fill here' };
  if (dIn === null || dIn === 0n) return { etat: 'NON_MESURE', pourquoi: 'a reference size above zero is required' };
  if (typeof entreeEst0 !== 'boolean') {
    /* ⛔ AUCUN DEFAUT SUR LE SENS. Un `false` implicite donnerait un chiffre faux d un facteur
     *   enorme sans jamais lever la main. */
    return { etat: 'NON_MESURE', pourquoi: 'which side goes in must be stated explicitly' };
  }
  let sNew;
  if (entreeEst0) {
    const bas = L + (dIn * s) / Q96;
    if (bas === 0n) return { etat: 'NON_MESURE', pourquoi: 'degenerate denominator' };
    sNew = (L * s) / bas;
  } else {
    sNew = s + (dIn * Q96) / L;
  }
  /* rapport des prix = (sNew/s)^2, porte a 1e6 pour rester entier ; 1e6 <-> 10 000 bps */
  const r2 = (sNew * sNew * 1000000n) / (s * s);
  const bps = r2 > 1000000n ? (r2 - 1000000n) / 100n : (1000000n - r2) / 100n;
  return { etat: 'OK', bps };
}

/** La porte : deux conditions, et le verdict dit LAQUELLE a ferme.
 *
 * ⛔ `familleProuvee` doit venir d un aller-retour sur la factory Aerodrome, jamais du `dexId` d un
 *   agregateur : un nom rendu par un tiers n est pas une preuve de provenance, et c est sur cette
 *   distinction que repose tout le reste du module de routage.
 * @returns {{verdict:string, bps:bigint|null, pourquoi:string}}
 */
export function porteDAchat({ glissement, familleProuvee, glissementMaxBps = GLISSEMENT_MAX_BPS } = {}) {
  const max = entier(glissementMaxBps);
  if (max === null || max === 0n) {
    return { verdict: 'NON_MESURE', bps: null, pourquoi: 'a positive slippage bound is required' };
  }
  if (!glissement || glissement.etat !== 'OK') {
    return { verdict: 'NON_MESURE', bps: null,
      pourquoi: (glissement && glissement.pourquoi) || 'slippage was never computed' };
  }
  /* ⛔⛔ L ORDRE DES DEUX TESTS EST DELIBERE ET IL CHANGE CE QU ON APPREND. On mesure le glissement
   *     D ABORD, donc un actif hors Aerodrome dont le glissement est bon rend `PAS_AERODROME` et
   *     non `GLISSEMENT_TROP_FORT` : le verdict nomme la vraie raison. MUc en est le cas exact —
   *     8 bps, excellente, mais sur Uniswap. Inverser l ordre l aurait fait passer pour illiquide. */
  if (glissement.bps > max) {
    return { verdict: 'GLISSEMENT_TROP_FORT', bps: glissement.bps,
      pourquoi: 'a ' + glissement.bps + ' bps price impact on the reference buy, above our ' + max + ' bps bound' };
  }
  if (familleProuvee !== 'aerodrome') {
    /* ⛔⛔ ADMIS, ET LA PHRASE DIT QU IL NE NOUS PAIE PAS. Ce n est pas une note interne : elle
     *     remonte a l ecran, parce qu un marche qu on pousse sans en tirer de frais doit etre
     *     distingue de ceux qui en portent — sinon un jour on comptera un revenu sur des achats
     *     qui n en produisent aucun. */
    return { verdict: 'ADMIS_SANS_FRAIS', bps: glissement.bps,
      pourquoi: glissement.bps + ' bps on the reference buy, but this market is not on the Aerodrome '
        + 'router: it is buyable here and this app takes no 0.10% on it' };
  }
  return { verdict: 'ADMIS', bps: glissement.bps,
    pourquoi: glissement.bps + ' bps on the reference buy, on Aerodrome' };
}

/** Vrai pour les deux verdicts admis — un bon marche merite sa puce, qu il nous paie ou non.
 * ⛔ Nomme a part pour qu aucun appelant n ecrive `verdict !== 'NON_MESURE'` : il admettrait
 *   `GLISSEMENT_TROP_FORT`, et une porte qui s ouvre sur notre ignorance est une porte ouverte. */
export function meriteUnePuce(r) {
  return !!r && (r.verdict === 'ADMIS' || r.verdict === 'ADMIS_SANS_FRAIS');
}

/** Vrai seulement quand l achat porte NOTRE retenue de 0,1 %.
 * ⛔⛔ SEPARE DE `meriteUnePuce` A DESSEIN. Les confondre ferait l une des deux fautes : soit
 *     refuser un bon marche parce qu il ne nous paie pas, soit compter un revenu sur des achats
 *     qui n en produisent aucun. Deux questions, deux fonctions. */
export function porteNotreFrais(r) {
  return !!r && r.verdict === 'ADMIS';
}
