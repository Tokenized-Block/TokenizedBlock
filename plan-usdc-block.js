/* plan-usdc-block.js — ACHETER UN BLOCK AVEC DES USDC, SUR UNE POOL UNISWAP v3.
 *
 * ⛔⛔ CE MODULE NE SIGNE RIEN, N ENVOIE RIEN, N APPELLE AUCUN RESEAU. Il recoit une pool DEJA LUE et
 *     rend un appel `{ to, data, value }` plus le minimum de sortie. Un wallet humain execute, et
 *     l appelant DOIT simuler la transaction par `eth_call` avant de la montrer — ce module calcule,
 *     il ne garantit pas.
 *
 * ⛔⛔ POURQUOI IL EXISTE. Trois de nos blocks vivent sur une pool Uniswap v3, tous cotes en USDC :
 *       Micron  0xb200000000000000000000fd2f87532b90095211  pool 0x8fAc72F6…30aA   44 029 $
 *       Amazon  0xb200000000000000000000d9192b6b456483c2e8  pool 0x7F030e5f…91C7    7 942 $
 *       SpaceX  0xb2000000000000000000007b9fcbd005511acbd5  pool 0x127a12FC…0431   26 313 $
 *     Le routeur qu on deploie DEJA les atteint (factory Uniswap v3 dans son bytecode), mais notre
 *     constructeur n ecrivait que du v4. `calldata-v3.js` a comble ca, rejoue a l octet.
 *   ⛔ ET LE `fee` DE CES TROIS POOLS EST 10000, PAS 3000. Mesure du 2026-09-28, lue sur chaque pool
 *     par `fee()`. Ma transaction temoin utilisait 3000 : reutiliser ce chiffre aurait fait reverter
 *     les trois APRES signature. Ce module EXIGE donc le `fee` lu, il n en propose aucun par defaut.
 *
 * ⛔⛔ AUCUN FLOTTANT DANS LE CALCUL DU MINIMUM. `prixDepuisSqrt` rend un `Number`, commode a
 *     afficher et inapte a borner de l argent. On calcule en entiers depuis `sqrtPriceX96` :
 *         entree en token0  ->  sortie = entree x s^2 / 2^192
 *         entree en token1  ->  sortie = entree x 2^192 / s^2
 *     L arrondi va VERS LE BAS a chaque division, donc le minimum reste prudent et jamais optimiste.
 *   ⛔ ET LES FRAIS SE PRELEVENT SUR L ENTREE, pas sur la sortie. Les appliquer du mauvais cote
 *     donnerait un minimum trop haut et ferait reverter des swaps parfaitement valides.
 *
 * ⚠️ CE QUE CE MODULE NE PROUVE PAS, ET C EST IMPORTANT : le prix spot n est PAS une simulation de
 *   profondeur. La sortie calculee ici est celle d un echange infinitesimal ; un montant qui mord
 *   dans la pool sortira MOINS. C est exactement a ca que sert la tolerance — et c est pourquoi
 *   l appelant doit simuler la transaction exacte avant de la proposer.
 */
import { calldataV3ExactIn } from './calldata-v3.js';

/** USDC sur Base. ⛔ Lue dans `prix-eth.js`, pas recitee — un test compare les deux. */
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

/** ⛔ PLAFOND DE TOLERANCE : 10 %. Au-dela, le « minimum » ne borne plus rien et l echange devient
 *  un cadeau a qui regarde la mempool. Ce n est pas un reglage de confort. */
export const TOLERANCE_MAX_BPS = 1000n;
const Q192 = 1n << 192n;

const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (a) => String(a || '').toLowerCase();
const entier = (v) => { try { const x = BigInt(v); return x; } catch (_) { return null; } };

/**
 * La sortie d un swap exact-in, EN ENTIERS, depuis le prix spot.
 * ⛔ SEPAREE ET EXPORTEE POUR ETRE TESTEE SEULE : c est le calcul qui borne l argent.
 * @returns {?bigint} unites de base du jeton de sortie, arrondi VERS LE BAS
 */
export function sortieSpot({ entree, sqrtPriceX96, entreeEst0 }) {
  const e = entier(entree), s = entier(sqrtPriceX96);
  if (e === null || s === null || e <= 0n || s <= 0n) return null;
  /* ⛔ `s * s` peut depasser 2^192 : on reste en BigInt, aucune conversion en Number. */
  return entreeEst0 ? (e * s * s) / Q192 : (e * Q192) / (s * s);
}

/**
 * @param {object} p
 * @param {string} p.block            l adresse du block qu on achete
 * @param {string} p.pool             la pool v3, deja resolue
 * @param {string|bigint} p.sqrtPriceX96  LU sur la pool
 * @param {number} p.fee              ⛔ LU sur la pool, jamais suppose
 * @param {boolean} p.blockEst0       LU sur la pool (`token0() === block`)
 * @param {string|bigint} p.montantUsdc  unites de base (USDC a 6 decimales)
 * @param {bigint|number} p.toleranceBps
 * @param {string} p.recipient
 * @param {bigint|number} p.deadline
 * @param {bigint|number} [p.maintenant]
 * @param {string} [p.devise]         par defaut USDC sur Base
 */
export function planUsdcVersBlock({ block, pool, sqrtPriceX96, fee, blockEst0, montantUsdc,
  toleranceBps = 100, recipient, deadline, maintenant = null, devise = USDC_BASE } = {}) {
  if (!ADR.test(String(block || ''))) return { etat: 'REFUSE', pourquoi: 'a whole block address is required' };
  if (!ADR.test(String(devise || ''))) return { etat: 'REFUSE', pourquoi: 'a whole quote-currency address is required' };
  if (bas(block) === bas(devise)) return { etat: 'REFUSE', pourquoi: 'the block and the currency are the same asset' };
  /* ⛔ LA POOL EST EXIGEE MEME SI ELLE N ENTRE PAS DANS LE CALLDATA. Elle prouve que l appelant a
   *   RESOLU la pool au lieu de supposer qu elle existe — c est la lecon du `tickSpacing`, ou un
   *   defaut aurait vise une pool inexistante pour cinq actions sur douze. */
  if (!ADR.test(String(pool || ''))) {
    return { etat: 'REFUSE', pourquoi: 'the pool must be resolved on chain first, not assumed' };
  }
  if (typeof blockEst0 !== 'boolean') {
    /* ⛔ LE SENS NE SE DEVINE PAS. `blockEst0` decide de quel cote la division tombe ; se tromper
     *   rend un prix qui est exactement son propre inverse — plausible, et faux d un facteur enorme. */
    return { etat: 'REFUSE', pourquoi: 'blockEst0 must be read from the pool (token0() === block)' };
  }

  /* ⛔⛔ LE `fee` EST EXIGE ET BORNE. Les trois pools mesurees sont a 10000 ; aucune valeur par
   *     defaut n est proposee, parce qu un defaut a 3000 aurait rate les trois. */
  const f = entier(fee);
  if (f === null || f <= 0n || f >= 1000000n) {
    return { etat: 'REFUSE', pourquoi: 'fee must be read from the pool and be a uint24 under 1000000 '
      + '(the three measured block pools are 10000, not 3000)' };
  }
  const m = entier(montantUsdc);
  if (m === null || m <= 0n) return { etat: 'REFUSE', pourquoi: 'the USDC amount must be above zero' };
  const tol = entier(toleranceBps);
  if (tol === null || tol < 0n) return { etat: 'REFUSE', pourquoi: 'tolerance must not be negative' };
  if (tol > TOLERANCE_MAX_BPS) {
    return { etat: 'REFUSE', pourquoi: 'tolerance above ' + TOLERANCE_MAX_BPS + ' bps stops bounding '
      + 'anything: the minimum would let the swap return almost nothing' };
  }
  const s = entier(sqrtPriceX96);
  if (s === null || s <= 0n) return { etat: 'REFUSE', pourquoi: 'sqrtPriceX96 must be read from the pool' };

  /* ── les frais se prelevent sur l ENTREE ────────────────────────────────────────────────── */
  const entreeApresFrais = (m * (1000000n - f)) / 1000000n;
  if (entreeApresFrais <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'the amount is so small that the pool fee consumes all of it' };
  }
  /* ⛔ L ENTREE EST LA DEVISE : elle est `token0` exactement quand le block ne l est pas. */
  const sortieAttendue = sortieSpot({ entree: entreeApresFrais, sqrtPriceX96: s, entreeEst0: !blockEst0 });
  if (sortieAttendue === null || sortieAttendue <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'the spot price gives no output for this amount — too small, '
      + 'or the pool price is unusable' };
  }
  const minSortie = (sortieAttendue * (10000n - tol)) / 10000n;
  /* ⛔⛔ UN MINIMUM A ZERO EST REFUSE ICI AUSSI, et pas seulement plus bas. Sur un tres petit
   *     montant, la tolerance peut faire tomber le minimum a zero : `calldata-v3.js` refuserait,
   *     mais avec un message sur le minimum au lieu du montant. On nomme la vraie cause. */
  if (minSortie <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'after the pool fee and your tolerance, the guaranteed minimum '
      + 'would be zero — raise the amount' };
  }

  const appel = calldataV3ExactIn({
    sauts: [{ de: devise, vers: block, fee: Number(f) }],
    recipient, amountIn: m, amountOutMinimum: minSortie, deadline,
    /* ⛔⛔ `payerIsUser: true` : les USDC viennent du PORTEFEUILLE, tires par le routeur a travers
     *     Permit2. `false` voudrait dire « paie depuis le solde du routeur », correct au milieu d une
     *     chaine de commandes et faux ici — et l erreur ne produit pas de revert parlant.
     *   ⇒ CE `true` A UNE CONSEQUENCE : deux autorisations Permit2 sont necessaires avant l envoi.
     *     `echange.js` les construit deja et les MESURE (`jetonPaye`) ; on ne les reecrit pas. */
    payerIsUser: true,
    maintenant,
  });
  if (appel.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'calldata refused: ' + appel.pourquoi };

  return {
    etat: 'PRET',
    appel: { to: appel.to, data: appel.data, value: appel.value },
    /* ⛔ LE JETON PAYE EST RENDU EXPLICITEMENT : c est lui qu il faut autoriser a Permit2, et le
     *   confondre avec le block autoriserait le mauvais actif. */
    jetonPaye: bas(devise),
    montantUsdc: m.toString(),
    fee: Number(f),
    sortieAttendue: sortieAttendue.toString(),
    minSortie: minSortie.toString(),
    toleranceBps: Number(tol),
    pool: bas(pool),
    /* ⛔⛔ LA BORNE VOYAGE AVEC LE PLAN, en anglais, prete pour l ecran. Un chiffre de sortie sans
     *     cette phrase se lirait comme une promesse. */
    borne: 'This output comes from the pool price right now, not from a depth simulation: a larger '
      + 'amount will get less. The guaranteed minimum is what the transaction enforces.',
    /* ⛔ ET ON DIT QU IL RESTE UNE ETAPE : ce module ne simule pas. */
    aSimuler: true,
  };
}
