// prix-eth.js — le prix d 1 ETH en dollars, LU sur plusieurs pools, jamais sur une seule.
// ================================================================================================
// ⛔⛔ MESURE DU 2026-09-12, ET C EST TOUTE LA RAISON DE CE MODULE. Les pools Uniswap v4 ETH/USDC de
//    Base rendent des prix qui NE S ACCORDENT PAS : 2 536, 2 533, 2 526… mais aussi 2 453, 2 357,
//    2 053 et 1 004 sur des pools peu profondes ou endormies. Prendre « la » pool aurait donne un
//    frais faux avec un chiffre parfaitement vrai — la forme d erreur la plus difficile a voir.
//    ⇒ On lit PLUSIEURS cles, on prend la MEDIANE, et on REFUSE si elles divergent trop.
//
// ⛔ FAIL-CLOSED : sans prix fiable, on ne convertit pas. Un frais « en dollars » calcule sur un
//    prix invente prendrait de l argent reel sur une supposition.
//
// ⚠️ CE QUE CE MODULE NE PROUVE PAS : que la mediane soit LE prix du marche. Elle est le prix
//    median des pools qu on a su lire, a l instant ou on les a lues — et l appelant doit le dire.
import { selecteur } from './keccak.js';
import { cleDePool, poolId, prixDepuisSqrt } from './pool.js';

/** USDC sur Base — recopie de `DEVISES` dans index.html, jamais de memoire. */
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
/** ETH natif, tel que Uniswap v4 le designe dans une PoolKey. */
export const ETH_NATIF = '0x0000000000000000000000000000000000000000';
export const DECIMALES_USDC = 6;

/**
 * Les cles MESUREES comme initialisees le 2026-09-12 sur Base (sonde en lecture seule).
 * ⛔ On garde celles du groupe qui s accorde ; les pools a 1 004 et 2 053 existent aussi, et c est
 *    precisement pour ca qu on prend une mediane et un ecart plutot qu une pool preferee.
 */
export const CLES_PRIX = [
  { fee: 3000, tickSpacing: 60 },
  { fee: 100, tickSpacing: 1 },
  { fee: 10000, tickSpacing: 200 },
  { fee: 500, tickSpacing: 10 },
];

/** ⛔ Au-dela de cet ecart relatif entre la plus basse et la plus haute, on ne tranche pas. */
export const ECART_MAX = 0.05;
/** ⛔ Moins de trois lectures, pas de mediane : deux valeurs n ont pas de milieu credible. */
export const LECTURES_MIN = 3;

/** La mediane d une liste de nombres finis strictement positifs. Rend `null` si la liste est vide. */
export function mediane(valeurs) {
  const v = (Array.isArray(valeurs) ? valeurs : [])
    .filter((x) => typeof x === 'number' && Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** L ecart relatif entre la plus petite et la plus grande valeur. */
export function ecartRelatif(valeurs) {
  const v = (Array.isArray(valeurs) ? valeurs : []).filter((x) => typeof x === 'number' && Number.isFinite(x) && x > 0);
  if (v.length < 2) return null;
  const min = Math.min(...v), max = Math.max(...v);
  return (max - min) / min;
}

/**
 * Lit le prix d 1 ETH en USDC sur plusieurs pools et rend la mediane — ou un refus motive.
 * @returns {Promise<{etat:'LU'|'NON_LU'|'DESACCORD', usd:number|null, lectures:number, ecart:number|null, pourquoi:string|null}>}
 */
export async function prixEthUsd({ rpc, stateView, cles = CLES_PRIX, pause = 0 }) {
  if (!stateView) return { etat: 'NON_LU', usd: null, lectures: 0, ecart: null, pourquoi: 'no StateView on this network' };
  const sel = selecteur('getSlot0(bytes32)');
  const prix = [];
  for (const k of cles) {
    /* ⛔ LE PARAMETRE S APPELAIT `r`, COMME LA VARIABLE DECLAREE JUSTE DESSOUS : la regle 7 l a vu.
     * Deux `r` dans le meme bloc, l un lu avant l autre, c est le genre de ligne qu on relit trois
     * fois — et un jour on en deplace une. */
    if (pause) await new Promise((ok) => setTimeout(ok, pause));
    let r = null;
    try {
      const cle = cleDePool(ETH_NATIF, USDC_BASE, k);
      r = await rpc('eth_call', [{ to: stateView, data: sel + poolId(cle).slice(2) }, 'latest']);
      if (!r || r === '0x') continue;
      const sqrt = BigInt('0x' + r.slice(2, 66));
      if (sqrt === 0n) continue;
      /* ⛔ L USDC est en 6 decimales et l ETH en 18 : oublier ce decalage donne un prix a 1e12 pres. */
      const deviseEst0 = String(cle.currency0).toLowerCase() === ETH_NATIF;
      const p = prixDepuisSqrt({ sqrtPriceX96: sqrt, decDevise: DECIMALES_USDC, decBlock: 18, deviseEst0: !deviseEst0 });
      if (typeof p === 'number' && Number.isFinite(p) && p > 0) prix.push(p);
    } catch (e) { /* une cle illisible n est pas un prix faux : on l ignore et on le compte */ }
  }
  if (prix.length < LECTURES_MIN) {
    return { etat: 'NON_LU', usd: null, lectures: prix.length, ecart: null,
      pourquoi: 'only ' + prix.length + ' pool(s) answered — ' + LECTURES_MIN + ' are needed to agree on a price' };
  }
  const ecart = ecartRelatif(prix);
  if (ecart > ECART_MAX) {
    /* ⛔ DESACCORD N EST PAS PANNE, et ce n est pas un prix non plus. On le NOMME. */
    return { etat: 'DESACCORD', usd: null, lectures: prix.length, ecart,
      pourquoi: 'the pools disagree by ' + Math.round(ecart * 1000) / 10 + ' % — refusing to pick one' };
  }
  return { etat: 'LU', usd: mediane(prix), lectures: prix.length, ecart, pourquoi: null };
}

/**
 * Combien de wei valent `dollars`, au prix donne.
 * ⛔ ENTIERS JUSQU AU BOUT : on passe par 1e18 en BigInt apres avoir arrondi le prix au centime, pour
 *    ne pas laisser un flottant decider du dernier wei.
 */
export function weiPourDollars(dollars, ethUsd) {
  if (typeof dollars !== 'number' || !Number.isFinite(dollars) || dollars <= 0) return null;
  if (typeof ethUsd !== 'number' || !Number.isFinite(ethUsd) || ethUsd <= 0) return null;
  const cents = BigInt(Math.round(dollars * 100));
  const prixCents = BigInt(Math.round(ethUsd * 100));
  return (cents * 10n ** 18n) / prixCents;
}
