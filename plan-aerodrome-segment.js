/* UN SEGMENT AERODROME, DE BOUT EN BOUT, EN **UNE** TRANSACTION — et avec notre frais.
 *
 * ⭐⭐ POURQUOI CE MODULE EXISTE, ET POURQUOI J AVAIS RENONCE A L ECRIRE IL Y A DEUX HEURES.
 *   Mesure du 2026-10-01, sur toutes les paires (devise d entree x block) de 60 marches :
 *       un segment Uniswap V4 deja offert   88,3 %
 *       franchissement deja offert          10,5 %
 *       debloquable par CE module            1,2 %
 *   ⇒ J ai conclu « 1,2 %, ca ne vaut pas un module » et je suis passe a autre chose.
 *   ⛔⛔⛔ CETTE MESURE REPONDAIT A LA MAUVAISE QUESTION. Re-mesure depuis les DEUX devises que les
 *     gens detiennent reellement, sur les 245 marches servis :
 *         depuis OUSD   245/245 offerts   100 % du volume
 *         depuis USDC   236/245 offerts   ... 23,1 % du volume
 *     Les NEUF non batis depuis USDC sont AAPLc, METAc, GOOGLc, AMZNc, SNDKc et les autres actions
 *     tokenisees — et ils portent 76,9 % du volume. Un payeur en USDC, le cas le plus banal, ne
 *     pouvait acheter AUCUNE des actions qui font l argent.
 *   ⇒ « 1,2 % des paires » et « 76,9 % du volume depuis USDC » decrivent le MEME trou. Moyenner sur
 *     des paires que personne ne fait avait noye le seul chemin que tout le monde prend.
 *
 * ⛔ POURQUOI USDC ECHOUE LA OU OUSD REUSSIT : `OUSD -> USDC -> action` traverse DEUX factories,
 *   donc c est un franchissement, et il est bati. `USDC -> action` tient sur Aerodrome SEUL —
 *   un segment unique, que l assembleur V4 ne sait pas construire. Le plus simple etait le trou.
 *
 * ⭐ ET C EST LE MEILLEUR RAPPORT GAIN/RISQUE QUI RESTE : un segment unique tient en UNE
 *   transaction. Pas de lot, donc AUCUN risque d atomicite — contrairement au franchissement, ou
 *   une part importante des wallets ne peut pas grouper.
 *
 * ⛔⛔ LE FRAIS EST PORTE PAR `sweepTokenWithFee`, le SEUL endroit ou ce depot sait retenir sur
 *   Aerodrome : le swap depose chez le routeur, puis le balayage envoie le minimum a l acheteur et
 *   notre part au beneficiaire. Aucun defaut de beneficiaire : sans adresse, on REFUSE.
 */

import { segmenterParFactory } from './pont-de-liquidite.js';
import { calldataExactInputAvecFrais, calldataApprove, FRAIS_INTERFACE_BPS_CL }
  from './calldata-aerodrome.js';
import { poolAerodromeDe } from './plan-franchissement.js';
import { sortieSpot } from './plan-usdc-block.js';
import { selecteur } from './keccak.js';
import { indexBlocAJonction, MESSAGE_PAS_ICI } from './pool-sans-hook.js';

/** Les etats rendus. ⛔ Aucun autre. */
export const ETATS = Object.freeze(['PRET', 'REFUSE', 'NON_MESURE']);

/** ⛔ La meme borne que les autres rails : au-dela, chaque saut est une occasion d echouer. */
export const SAUTS_MAX = 4;

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-fA-F]{40}$/;

/**
 * @param {function} p.rpc
 * @param {object[]} p.chemin  [{de, vers, famille}] — DOIT etre un seul segment `aerodrome`
 * @param {string}   p.devise  ce qu on paie
 * @param {string}   p.block   ce qu on achete
 * @param {bigint}   p.montant
 * @param {string}   p.compte  le destinataire
 * @param {string}   p.beneficiaireFrais
 */
export async function planAerodromeSegment({ rpc, chemin, devise, block, montant, compte,
  beneficiaireFrais, toleranceBps = 100n, maintenant = Date.now(),
  fraisBps = FRAIS_INTERFACE_BPS_CL } = {}) {
  if (!Array.isArray(chemin) || !chemin.length) {
    return { etat: 'REFUSE', etape: 'forme', pourquoi: 'no path to build' };
  }
  const segments = segmenterParFactory(chemin);
  /* ⛔⛔ UN SEUL SEGMENT AERODROME, EXIGE ICI AUSSI. `peutEtreAssemblee` le verifie en amont, mais
   *   un module qui construit du calldata ne doit pas dependre d un controle fait ailleurs : un
   *   appelant futur l oublierait, et le revert arriverait chez l utilisateur apres sa signature. */
  if (segments.length !== 1 || segments[0].famille !== 'aerodrome') {
    return { etat: 'REFUSE', etape: 'forme',
      pourquoi: 'this builder takes exactly one aerodrome segment and this path is '
        + (segments.map((s) => s.famille).join(' then ') || 'empty') };
  }
  if (chemin.length > SAUTS_MAX) {
    return { etat: 'REFUSE', etape: 'forme',
      pourquoi: 'a route of ' + chemin.length + ' hops is longer than the ' + SAUTS_MAX + ' we build' };
  }
  if (!ADR.test(String(devise || '')) || !ADR.test(String(block || ''))) {
    return { etat: 'REFUSE', etape: 'forme', pourquoi: 'both ends must be whole addresses' };
  }
  if (bas(chemin[0].de) !== bas(devise)) {
    return { etat: 'REFUSE', etape: 'forme',
      pourquoi: 'the path starts on ' + bas(chemin[0].de) + ' but we are paying ' + bas(devise) };
  }
  /* ⛔⛔ LE CHEMIN DOIT ARRIVER SUR CE QU ON CROIT ACHETER. Sans ce controle on batirait un swap qui
   *   achete autre chose que ce que l ecran annonce — et RIEN ne reverterait. */
  if (bas(chemin[chemin.length - 1].vers) !== bas(block)) {
    return { etat: 'REFUSE', etape: 'forme',
      pourquoi: 'the path ends on ' + bas(chemin[chemin.length - 1].vers)
        + ' but we are buying ' + bas(block) };
  }
  /* ⛔⛔ 2026-10-02 (porte de livraison) : UN BLOCK ENTRE DEUX SAUTS AERODROME est une jonction : ses deux pools sont
   *   Aerodrome, sans hook TB (regle du fondateur). Refus avant toute lecture. */
  if (indexBlocAJonction(chemin.slice(1).map((s) => s.de)) >= 0) {
    return { etat: 'REFUSE', etape: 'forme', pourquoi: MESSAGE_PAS_ICI, refusBlocJonction: true };
  }
  /* ⛔⛔ 2026-10-02 (verdict C2) : AUCUN BLOCK TB SUR UNE POOL SANS HOOK TB — Aerodrome n en a pas. Un block au DEBUT ou a la
   *   FIN du segment Aerodrome est refuse comme a une jonction. */
  if (indexBlocAJonction([chemin[0].de, chemin[chemin.length - 1].vers]) >= 0) {
    return { etat: 'REFUSE', etape: 'forme', pourquoi: MESSAGE_PAS_ICI, refusBlocSansHookTb: true };
  }
  let m;
  try { m = BigInt(montant); } catch (_) { m = 0n; }
  if (m <= 0n) return { etat: 'REFUSE', etape: 'forme', pourquoi: 'the amount must be above zero' };

  /* ── CHAQUE SAUT : SA POOL, SON ESPACEMENT, SON SENS ───────────────────────────────────────
   * ⛔⛔⛔ L ESPACEMENT N EST JAMAIS SUPPOSE. Mesure du 2026-09-28 : il vaut 10 sur SEPT pools
   *   d actions et 1 sur CINQ autres. Prendre « 10 parce que c est le plus courant » construirait
   *   un calldata vers une pool INEXISTANTE pour cinq actions sur douze. */
  const sauts = [];
  let courant = m;
  for (const [i, s] of chemin.entries()) {
    const p = await poolAerodromeDe({ rpc, a: s.de, b: s.vers });
    if (p.etat !== 'PRET') {
      return { etat: p.etat === 'NON_MESURE' ? 'NON_MESURE' : 'REFUSE', etape: 'hop ' + (i + 1),
        pourquoi: 'hop ' + (i + 1) + ' (' + bas(s.de).slice(0, 8) + ' to ' + bas(s.vers).slice(0, 8)
          + '): ' + p.pourquoi };
    }
    sauts.push({ de: bas(s.de), vers: bas(s.vers), tickSpacing: p.tickSpacing });
    /* ⛔ LE MINIMUM SE CHAINE PAR LE PRIX SPOT DE CHAQUE POOL. C est une ESTIMATION, pas un devis :
     *   elle ignore la profondeur, donc la sortie reelle sera INFERIEURE sur un gros montant. On lui
     *   applique la tolerance, et on NOMME sa nature dans le resume. */
    let sqrt = null;
    try {
      const s0 = await rpc('eth_call', [{ to: p.pool, data: selecteur('slot0()') }, 'latest']);
      sqrt = BigInt('0x' + String(s0).slice(2, 66));
    } catch (_) { sqrt = null; }
    if (sqrt === null || sqrt <= 0n) {
      return { etat: 'NON_MESURE', etape: 'hop ' + (i + 1),
        pourquoi: 'hop ' + (i + 1) + ': the pool price could not be read, so no honest minimum can be set' };
    }
    const suivant = sortieSpot({ entree: courant, sqrtPriceX96: sqrt, entreeEst0: p.entreeEst0 });
    if (suivant === null || suivant <= 0n) {
      return { etat: 'REFUSE', etape: 'hop ' + (i + 1),
        pourquoi: 'hop ' + (i + 1) + ' returns nothing for this size at its current price' };
    }
    courant = suivant;
  }

  const tol = BigInt(toleranceBps);
  const minPools = (courant * (10000n - tol)) / 10000n;
  if (minPools <= 0n) {
    return { etat: 'REFUSE', etape: 'minimum', pourquoi: 'the amount is too small for this route' };
  }

  /* ── LE SWAP, AVEC NOTRE RETENUE ───────────────────────────────────────────────────────────── */
  const swap = calldataExactInputAvecFrais({
    sauts, recipient: compte, amountIn: m, amountOutMinimum: minPools,
    deadline: BigInt(Math.floor(maintenant / 1000) + 1200),
    maintenant: BigInt(Math.floor(maintenant / 1000)),
    fraisBps, beneficiaireFrais,
  });
  if (swap.etat !== 'PRET') {
    return { etat: 'REFUSE', etape: 'swap', pourquoi: swap.pourquoi };
  }
  /* ⛔ L AUTORISATION PORTE LE MONTANT EXACT, jamais l infini : une allowance illimitee sur un
   *   routeur est un risque qu on ne fait pas courir pour economiser une signature. */
  const appro = calldataApprove({ token: devise, montant: m });
  if (appro.etat !== 'PRET') {
    return { etat: 'REFUSE', etape: 'approbation', pourquoi: appro.pourquoi };
  }

  return {
    etat: 'PRET',
    /* ⛔⛔ DEUX APPELS, ET LE SECOND SEUL FAIT LE SWAP. Contrairement au franchissement, ils ne
     *   DOIVENT PAS etre atomiques : une approbation qui passe seule ne coute que du gaz et ne
     *   laisse l acheteur avec rien d inattendu. On ne reclame donc PAS de lot — et c est ce qui
     *   rend ce rail accessible aux wallets qui ne groupent pas. */
    appels: [
      { to: appro.to, data: appro.data, value: '0x0', role: 'approve the input for the Aerodrome router' },
      { to: swap.to, data: swap.data, value: '0x0', role: 'swap on Aerodrome, fee taken on the way out' },
    ],
    exigeAtomique: false,
    resume: {
      paye: m,
      payeDevise: bas(devise),
      recoitAuMoins: BigInt(swap.minUtilisateur),
      recoitDevise: bas(block),
      fraisBps: BigInt(swap.fraisBps),
      beneficiaireFrais: swap.beneficiaireFrais,
      minPools: BigInt(swap.minPools),
      sauts: sauts.length,
      /* ⚠️ NOMME, parce qu un minimum derive d un prix spot n est pas un devis : il ignore la
       *   profondeur du carnet, et l annoncer comme une cotation serait une promesse qu on ne tient
       *   pas sur un gros montant. */
      minimumParPrixSpot: true,
      retenue: swap.borne,
    },
    pourquoi: null,
  };
}
