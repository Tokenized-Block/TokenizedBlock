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
import { enVolBorne, LECTURES_EN_VOL_MAX } from './lectures-en-vol.js';

/** Les etats rendus. ⛔ Aucun autre n est produit. */
export const ETATS = Object.freeze(['PRET', 'APPROBATIONS', 'REFUSE', 'NON_MESURE']);

/** ⛔ Les NEUF espacements declares par la factory Aerodrome CL, pas les cinq que j avais sondes
 *   une fois — cette sous-mesure avait rendu 49,8 % du volume invisible. */
export const ESPACEMENTS_CL = Object.freeze([1, 10, 50, 80, 100, 150, 200, 500, 2000]);
/** Une pool choisie alors qu une autre profondeur n a pas ete lue doit detenir au moins ce multiple du montant qui entre dans le saut. */
export const PROFONDEUR_MIN_FOIS = 100n;

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
export async function poolAerodromeDe({ rpc, a, b, espacements = ESPACEMENTS_CL, montantEntree = null } = {}) {
  if (!ADR.test(String(a || '')) || !ADR.test(String(b || ''))) {
    return { etat: 'REFUSE', pourquoi: 'both tokens must be whole addresses' };
  }
  /* ⛔⛔ 2026-10-03 (mesure, 37 actions x 9 espacements) : cette fonction rendait la PREMIERE pool trouvee, en partant de
   *   l espacement 1. MUc, PLTRc et AMZNc ont une pool VIDE a 1 (0 $ d USDC) et leur vraie pool a 10 (360 k$, 588 k$,
   *   1,19 M$) : le franchissement calculait son minimum sur une pool vide. On parcourt donc TOUS les espacements et on
   *   garde la plus PROFONDE, mesuree par le solde du jeton d entree `a` que la pool detient (balanceOf). Une seule pool
   *   trouvee : comportement d avant. Plusieurs et AUCUNE profondeur lue : NON_MESURE — jamais un choix au hasard. */
  /* ⛔ 2026-10-04 — LES NEUF ESPACEMENTS SE LISENT ENSEMBLE (au plus `LECTURES_EN_VOL_MAX` a la fois), PLUS EN FILE.
   *   MESURE (fork, compter-lectures-plan-20261004.mjs) : USDC > NVDAc faisait 13 lectures et NVDAc > ETH 27, une seule en vol —
   *   dont 9 `getPool` par saut, tous lus de toute facon (on garde la plus profonde, pas la premiere) et dont aucun ne depend
   *   d un autre. Chaque espacement fait sa file a lui : `getPool`, puis la profondeur SI une pool est rendue.
   *   Le resultat est celui d avant : `trouvees` est rangee dans l ORDRE DES ESPACEMENTS (a profondeur egale la premiere gagne,
   *   comme avant), `essayes` et `refus` comptent pareil, et seul un `getPool` qui leve est un refus.
   *   ⛔ Rien n est garde en memoire : une pool plus profonde peut naitre demain a un autre espacement. */
  const demandes = [];
  for (const ts of espacements) {
    const c = calldataGetPool({ tokenA: a, tokenB: b, tickSpacing: ts });
    if (c.etat !== 'PRET') continue;
    demandes.push({ ts, c });
  }
  const essayes = demandes.length;
  let refus = 0;
  const issues = await enVolBorne(demandes, async ({ ts, c }) => {
    const r = await appel(rpc, c.to, c.data);
    const adresse = '0x' + String(r).slice(-40);
    if (nulle(adresse)) return null;
    let prof = null;
    /* (keccak.selecteur rend DEJA le prefixe 0x) */
    try { prof = BigInt(String(await appel(rpc, a, selecteur('balanceOf(address)') + adresse.slice(2).toLowerCase().padStart(64, '0')))); }
    catch (_) { prof = null; }
    return { adresse, ts, prof };
  }, LECTURES_EN_VOL_MAX);
  const trouvees = [];
  for (const x of issues) {
    if (!x.ok) { refus += 1; continue; }
    if (x.valeur) trouvees.push(x.valeur);
  }
  if (trouvees.length) {
    /* ⛔ 2026-10-10 (QA de Phil, NVDAc > ETH : « hop 2 (0x833589 to 0x420000): 3 pools found but the depth of 1 could not be
     *   read ») : UNE profondeur illisible bloquait toute la route alors que les autres etaient LUES. Deux regles, sans rouvrir le
     *   defaut AMZNc ci-dessus :
     *   (1) chaque profondeur ratee est RELUE une fois (une lecture ratee sous charge est le plus souvent passagere) ;
     *   (2) si elle reste illisible, la plus profonde des LUES n est prise que si l appelant donne le montant qui ENTRE dans ce saut
     *       et que cette pool detient au moins PROFONDEUR_MIN_FOIS fois ce montant du jeton d entree. Une pool vide ou fine (le cas
     *       AMZNc : 0 $) ne passe jamais. Le resultat DIT combien de profondeurs n ont pas ete lues (`profondeursNonLues`).
     *   Sans montant : comportement d avant (NON_MESURE nomme). */
    if (trouvees.length > 1) for (const x of trouvees) {
      if (x.prof !== null) continue;
      try { x.prof = BigInt(String(await appel(rpc, a, selecteur('balanceOf(address)') + x.adresse.slice(2).toLowerCase().padStart(64, '0')))); }
      catch (_) { x.prof = null; }
    }
    const lues = trouvees.filter((x) => x.prof !== null);
    if (trouvees.length > 1 && !lues.length) {
      return { etat: 'NON_MESURE', essayes, refus,
        pourquoi: trouvees.length + ' pools were found but none of their depths could be read, so which one is real is unknown' };
    }
    /* ⛔⛔ 2026-10-10 (serie complete, sous charge) : AMZNc a choisi 0x22cf… — sa pool VIDE a l espacement 1 — parce que la
     *   profondeur de sa vraie pool (0xd03b…, ~1,19 M$) n avait pas ete lue : « la plus profonde des LUES » est un choix au hasard
     *   des qu une profondeur manque. Plusieurs pools et pas toutes lues : NON_MESURE, nomme. Une seule pool : inchange. */
    const nonLues = trouvees.length - lues.length;
    let mEntree = null;
    try { mEntree = montantEntree === null || montantEntree === undefined ? null : BigInt(montantEntree); } catch (_) { mEntree = null; }
    if (trouvees.length > 1 && nonLues > 0 && lues.length && mEntree !== null && mEntree > 0n) {
      const meilleure = lues.reduce((m, x) => (x.prof > m.prof ? x : m));
      if (meilleure.prof >= mEntree * PROFONDEUR_MIN_FOIS) {
        let t0p = null;
        try { t0p = '0x' + String(await appel(rpc, meilleure.adresse, selecteur('token0()'))).slice(-40); } catch (_) { t0p = null; }
        if (!t0p || !ADR.test(t0p)) {
          return { etat: 'NON_MESURE', pourquoi: 'the pool was found but token0() could not be read, '
            + 'so the swap direction is unknown — and a direction is never guessed' };
        }
        return { etat: 'PRET', pool: bas(meilleure.adresse), tickSpacing: meilleure.ts, token0: bas(t0p),
          entreeEst0: bas(t0p) === bas(a), essayes, refus, trouvees: trouvees.length,
          profondeur: String(meilleure.prof), profondeursNonLues: nonLues };
      }
    }
    if (trouvees.length > 1 && lues.length < trouvees.length) {
      return { etat: 'NON_MESURE', essayes, refus,
        pourquoi: trouvees.length + ' pools were found but the depth of ' + (trouvees.length - lues.length)
          + ' could not be read, so the deepest one is unknown — a pool is never picked on a partial comparison' };
    }
    const choisie = lues.length ? lues.reduce((m, x) => (x.prof > m.prof ? x : m)) : trouvees[0];
    /* ⛔ LE SENS, LU SUR LA POOL. */
    let t0 = null;
    try { t0 = '0x' + String(await appel(rpc, choisie.adresse, selecteur('token0()'))).slice(-40); }
    catch (_) { t0 = null; }
    if (!t0 || !ADR.test(t0)) {
      return { etat: 'NON_MESURE', pourquoi: 'the pool was found but token0() could not be read, '
        + 'so the swap direction is unknown — and a direction is never guessed' };
    }
    return { etat: 'PRET', pool: bas(choisie.adresse), tickSpacing: choisie.ts, token0: bas(t0),
      entreeEst0: bas(t0) === bas(a), essayes, refus, trouvees: trouvees.length,
      profondeur: choisie.prof === null ? null : String(choisie.prof) };
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
