/* LE PLAN COMPLET D UN FRANCHISSEMENT — de la devise d entree jusqu au lot signable.
 *
 * ⭐ LA MISSION DE PHIL (2026-10-01) : « open OUSD a tt les action tokenized et creer le rails avec
 *   des fees sur chaque transaction pour le dev ». Les actions tokenisees vivent sur AERODROME,
 *   OUSD sur UNISWAP V4, et un `exactInput` ne traverse qu une factory. Ce module assemble le
 *   passage, et il est deja PROUVE en execution sur fork : OUSD -> USDC -> AAPLc, 3 appels
 *   `status 0x1`, a6cf paye sur LES DEUX jambes au wei (0,2 % puis 0,1 %).
 *
 * ⛔⛔ CE MODULE LIT, MAIS IL NE DECIDE RIEN TOUT SEUL. La FORME vient de
 *   `franchissement-depuis-chemin.js`, la jambe 1 de `echange.js`, le lot de `calldata-aerodrome.js`.
 *   Il orchestre et il NOMME ce qui rate. `rpc` est injecte : sans ca il serait intestable hors
 *   reseau, et c est exactement le genre de code — celui qui touche l argent — qu on ne peut pas se
 *   permettre de ne tester qu en production.
 *
 * ⛔⛔⛔ L ESPACEMENT DE TICK N EST JAMAIS SUPPOSE. Mesure du 2026-09-28 : `tickSpacing` vaut 10 sur
 *   SEPT pools d actions et 1 sur CINQ autres. Prendre « 10 parce que c est le plus courant »
 *   construirait un calldata vers une pool INEXISTANTE pour cinq actions sur douze, et ca
 *   reverterait APRES la signature — donc apres le gaz de l acheteur. On interroge la factory,
 *   espacement par espacement, et l adresse nulle est un REFUS explicite : c est ce que la factory
 *   rend pour un triplet inconnu, et l accepter serait prendre « cette pool n existe pas » pour une
 *   pool.
 */

import { franchissementDepuisChemin } from './franchissement-depuis-chemin.js';
import { sautsDepuisChemin } from './sauts-depuis-chemin.js';
import { planEchangeMultiSauts, MESSAGE_TROP_PETIT } from './echange.js';
import { planifierFranchissement, calldataGetPool, FRAIS_INTERFACE_BPS_CL } from './calldata-aerodrome.js';
import { sortieSpot } from './plan-usdc-block.js';
import { selecteur } from './keccak.js';
import { indexBlocAJonction, MESSAGE_PAS_ICI } from './pool-sans-hook.js';

/** Les etats rendus. ⛔ Aucun autre n est produit. */
export const ETATS = Object.freeze(['PRET', 'APPROBATIONS', 'REFUSE', 'NON_MESURE']);

/** ⛔ Les NEUF espacements declares par la factory Aerodrome CL, pas les cinq que j avais sondes
 *   une fois — cette sous-mesure avait rendu 49,8 % du volume invisible. */
export const ESPACEMENTS_CL = Object.freeze([1, 10, 50, 80, 100, 150, 200, 500, 2000]);

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-fA-F]{40}$/;
const nulle = (a) => /^0x0{40}$/i.test(String(a || ''));

async function appel(rpc, to, data) {
  return rpc('eth_call', [{ to, data }, 'latest']);
}

/**
 * RESOUDRE LA POOL AERODROME D UNE PAIRE : adresse, espacement, et SENS.
 * ⛔ Le sens vient de `token0()` LU sur la pool, jamais de l ordre des arguments : une pool classe
 *   ses jetons par adresse, et se tromper de sens cote le prix a l envers.
 */
export async function poolAerodromeDe({ rpc, a, b, espacements = ESPACEMENTS_CL } = {}) {
  if (!ADR.test(String(a || '')) || !ADR.test(String(b || ''))) {
    return { etat: 'REFUSE', pourquoi: 'both tokens must be whole addresses' };
  }
  let essayes = 0, refus = 0;
  for (const ts of espacements) {
    const c = calldataGetPool({ tokenA: a, tokenB: b, tickSpacing: ts });
    if (c.etat !== 'PRET') continue;
    essayes += 1;
    let r;
    try { r = await appel(rpc, c.to, c.data); } catch (_) { refus += 1; continue; }
    const adresse = '0x' + String(r).slice(-40);
    if (nulle(adresse)) continue;
    /* ⛔ LE SENS, LU SUR LA POOL. */
    let t0 = null;
    try { t0 = '0x' + String(await appel(rpc, adresse, selecteur('token0()'))).slice(-40); }
    catch (_) { t0 = null; }
    if (!t0 || !ADR.test(t0)) {
      return { etat: 'NON_MESURE', pourquoi: 'the pool was found but token0() could not be read, '
        + 'so the swap direction is unknown — and a direction is never guessed' };
    }
    return { etat: 'PRET', pool: bas(adresse), tickSpacing: ts, token0: bas(t0),
      entreeEst0: bas(t0) === bas(a), essayes, refus };
  }
  /* ⛔⛔ « AUCUNE POOL TROUVEE » N EST PAS « IL N Y A PAS DE POOL ». On rend le nombre d espacements
   *   essayes ET le nombre de lectures refusees : si des appels ont echoue, le resultat est une
   *   CECITE, pas un verdict. Confondre les deux a deja coute cher ici. */
  if (refus > 0) {
    return { etat: 'NON_MESURE', essayes, refus,
      pourquoi: refus + ' of the ' + essayes + ' tick spacings could not be read, so "no pool" '
        + 'would be our blindness and not a fact about the chain' };
  }
  return { etat: 'REFUSE', essayes, refus,
    pourquoi: 'the factory knows no pool for this pair on any of the ' + essayes
      + ' declared tick spacings' };
}

/**
 * LE PLAN COMPLET.
 *
 * @param {function} p.rpc
 * @param {number}   p.chaine
 * @param {string}   p.compte
 * @param {object[]} p.chemin    [{de, vers, famille}] de `cheminEntre`
 * @param {string}   p.devise    ce qu on paie
 * @param {string}   p.block     ce qu on achete
 * @param {bigint}   p.montant
 * @param {number}   p.decimalesEntree  LUES sur le jeton, jamais 18 par defaut
 * @param {number}   [p.prixUsdEntree]  LU ; sans lui le bareme prend le taux le plus haut
 * @param {function} p.resoudreV4  le resolveur de cles V4, injecte
 * @param {string}   p.beneficiaireFrais
 */
export async function planFranchissement({ rpc, chaine, compte, chemin, devise, block, montant,
  decimalesEntree, prixUsdEntree = null, resoudreV4, beneficiaireFrais,
  toleranceBps = 100n, maintenant = Date.now(), espacements = ESPACEMENTS_CL,
  fraisDevisesOk = null } = {}) {
  const forme = franchissementDepuisChemin({ chemin });
  if (forme.etat !== 'OK') {
    return { etat: 'REFUSE', etape: 'forme', pourquoi: forme.pourquoi };
  }
  if (bas(forme.action) !== bas(block)) {
    /* ⛔ LE CHEMIN DOIT ARRIVER SUR CE QU ON CROIT ACHETER. Sans ce controle, on batirait un lot
     *   qui achete autre chose que ce que l ecran annonce — et rien ne reverterait. */
    return { etat: 'REFUSE', etape: 'forme',
      pourquoi: 'the path ends on ' + forme.action + ' but we are buying ' + bas(block) };
  }
  /* ⛔⛔ 2026-10-02 (porte de livraison) : LE PIVOT EST LA JONCTION V4 -> AERODROME. Un block ici est l entree d une pool
   *   Aerodrome sans hook TB (regle du fondateur) ; la jambe 1 le voit comme une SORTIE, sa regle « block intermediaire »
   *   ne le refuse donc pas. Refus avant toute lecture. */
  if (indexBlocAJonction([forme.pivot]) >= 0) {
    return { etat: 'REFUSE', etape: 'forme', pourquoi: MESSAGE_PAS_ICI, refusBlocJonction: true };
  }
  /* ⛔⛔ 2026-10-02 (verdict C2) : AUCUN BLOCK TB SUR UNE POOL SANS HOOK TB — Aerodrome n en a pas. Un block au DEBUT ou a la
   *   FIN du segment Aerodrome est refuse comme a une jonction. */
  if (indexBlocAJonction([forme.action]) >= 0) {
    return { etat: 'REFUSE', etape: 'forme', pourquoi: MESSAGE_PAS_ICI, refusBlocSansHookTb: true };
  }

  /* ── 1. LA POOL AERODROME, RESOLUE ─────────────────────────────────────────────────────── */
  const aero = await poolAerodromeDe({ rpc, a: forme.pivot, b: forme.action, espacements });
  if (aero.etat !== 'PRET') {
    return { etat: aero.etat === 'NON_MESURE' ? 'NON_MESURE' : 'REFUSE', etape: 'pool aerodrome',
      pourquoi: aero.pourquoi };
  }

  /* ── 2. LA JAMBE 1, EN UNISWAP V4, AVEC LE BAREME DEGRESSIF ────────────────────────────── */
  const b = await sautsDepuisChemin({ chemin: forme.jambe1, montant, resoudre: resoudreV4 });
  if (b.etat !== 'OK') {
    return { etat: b.etat === 'NON_MESURE' ? 'NON_MESURE' : 'REFUSE', etape: 'jambe 1',
      pourquoi: b.pourquoi };
  }
  let p1;
  try {
    p1 = await planEchangeMultiSauts({ rpc, chaine, compte, sauts: b.sauts,
      entree: devise, sortie: forme.pivot, montant, toleranceBps, maintenant,
      decimalesEntree, prixUsdEntree, fraisDevisesOk, fraisRouteurAilleurs: true });
  } catch (e) {
    return { etat: 'NON_MESURE', etape: 'jambe 1',
      pourquoi: 'leg 1 could not be planned: ' + String((e && e.message) || e).slice(0, 120) };
  }
  /* ⛔ LES APPROBATIONS REMONTENT TELLES QUELLES : l appelant doit les faire signer AVANT, et
   *   refaire le plan ensuite. Les avaler ici produirait un lot qui reverte sur l allowance. */
  if (p1.etat === 'APPROBATIONS') {
    return { etat: 'APPROBATIONS', etape: 'jambe 1', etapes: p1.etapes, pourquoi: null };
  }
  if (p1.etat !== 'PRET') {
    return { etat: p1.etat === 'NON_MESURE' ? 'NON_MESURE' : 'REFUSE', etape: 'jambe 1',
      pourquoi: p1.pourquoi };
  }
  /* ⛔⛔ 2026-10-02 (Phil : UN frais par swap, C2) : le lot prend a6cf UNE fois, sur UNE jambe — le hook V4 de la jambe 1
   *   s il paie deja a6cf, sinon la jambe CL seule. Avant, routeur V4 (bareme) + sweep CL = deux frais par lot. */
  const parHook = !!(p1.resume && p1.resume.fraisParHook === true);
  const minPivot = BigInt(p1.resume.recoitAuMoins);
  if (minPivot <= 0n) {
    return { etat: 'REFUSE', etape: 'jambe 1',
      pourquoi: 'leg 1 guarantees nothing, so leg 2 has no honest input amount' };
  }

  /* ── 3. LE MINIMUM DE LA JAMBE 2, DERIVE DU PRIX SPOT DE LA POOL ───────────────────────── */
  /* ⛔⛔ `sortieSpot` EST UNE ESTIMATION AU PRIX INSTANTANE, PAS UN DEVIS. Elle ignore la
   *   profondeur : sur un gros montant, la sortie reelle sera INFERIEURE. C est precisement pour ca
   *   qu on lui applique la tolerance — et c est pour ca que le minimum qui en sort est un
   *   MINIMUM, pas une promesse. L annoncer comme « vous recevrez » serait faux. */
  let sqrt = null;
  try {
    const s0 = await appel(rpc, aero.pool, selecteur('slot0()'));
    sqrt = BigInt('0x' + String(s0).slice(2, 66));
  } catch (_) { sqrt = null; }
  if (sqrt === null || sqrt <= 0n) {
    return { etat: 'NON_MESURE', etape: 'jambe 2',
      pourquoi: 'the aerodrome pool price could not be read, so no honest minimum can be set' };
  }
  const brut = sortieSpot({ entree: minPivot, sqrtPriceX96: sqrt, entreeEst0: aero.entreeEst0 });
  if (brut === null || brut <= 0n) {
    return { etat: 'REFUSE', etape: 'jambe 2',
      pourquoi: 'the aerodrome pool returns nothing for this size at its current price' };
  }
  const tol = BigInt(toleranceBps);
  const minPools = (brut * (10000n - tol)) / 10000n;
  if (minPools <= 0n) {
    return { etat: 'REFUSE', etape: 'jambe 2', pourquoi: 'the amount is too small for this pool' };
  }
  /* ⛔ LE FRAIS UNIQUE NE DOIT PAS S ARRONDIR A 0 (meme garde que « fee amount is zero » sur le rail V4). */
  if (!parHook && (minPools * FRAIS_INTERFACE_BPS_CL) / 10000n <= 0n) {
    return { etat: 'REFUSE', etape: 'jambe 2', pourquoi: MESSAGE_TROP_PETIT, refusPoussiere: true };
  }

  /* ── 4. LE LOT ─────────────────────────────────────────────────────────────────────────── */
  const lot = planifierFranchissement({
    jambe1: { to: p1.tx.to, data: p1.tx.data, value: p1.tx.value },
    pivot: forme.pivot, action: forme.action, tickSpacing: aero.tickSpacing,
    recipient: compte, deadline: BigInt(Math.floor(maintenant / 1000) + 1200),
    maintenant: BigInt(Math.floor(maintenant / 1000)),
    minSortie1: minPivot, entree2: minPivot, minSortie2: minPools,
    poolResolue: aero.pool, beneficiaireFrais, sansFrais: parHook,
  });
  if (lot.etat !== 'PRET') {
    return { etat: 'REFUSE', etape: 'lot', pourquoi: lot.pourquoi };
  }
  return {
    etat: 'PRET',
    appels: lot.appels,
    /* ⛔ `exigeAtomique` REMONTE : sans lot atomique, la jambe 1 peut passer seule et l acheteur
     *   garde le PIVOT au lieu de son actif — il a paye un frais pour ce qu il n a pas demande. */
    exigeAtomique: true,
    resume: {
      paye: BigInt(p1.resume.paye),
      payeDevise: devise,
      recoitAuMoins: BigInt(lot.minUtilisateur),
      recoitDevise: forme.action,
      pivot: forme.pivot,
      /* ⛔⛔ UN SEUL FRAIS PAR LOT (2026-10-02) : jambe 1 = hook payeur (routeur 0, CL 0), sinon jambe 2 = CL seule
       *   (routeur 0). `jambesPayantes` le DIT, pour que l ecran et la matrice le lisent au lieu de le deduire. */
      fraisJambe1: BigInt(p1.resume.frais),
      fraisBpsJambe1: BigInt(p1.resume.fraisBps),
      fraisBpsJambe2: BigInt(lot.fraisBps),
      fraisParHook: parHook,
      jambePayante: parHook ? 1 : 2,
      jambesPayantes: (parHook ? 1 : 0) + (BigInt(p1.resume.fraisBps) > 0n ? 1 : 0) + (BigInt(lot.fraisBps) > 0n ? 1 : 0),
      hooksJambe1: b.sauts.map((x) => String((x && x.cle && x.cle.hooks) || '').toLowerCase()),
      /* ⚠️ LE MINIMUM DE LA JAMBE 2 EST DERIVE D UN PRIX SPOT, pas d un devis : il ignore la
       *   profondeur. On le NOMME pour qu aucun ecran ne le presente comme un montant garanti par
       *   une cotation. */
      minimumParPrixSpot: true,
      pool: aero.pool,
      tickSpacing: aero.tickSpacing,
    },
    pourquoi: null,
  };
}
