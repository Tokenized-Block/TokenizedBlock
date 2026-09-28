/* plan-eth-block.js — ACHETER UNE ACTION TOKENISEE EN ETH, EN TROIS GESTES ET UN SEUL SWAP.
 *
 * ⛔⛔ CE MODULE NE SIGNE RIEN, N ENVOIE RIEN, N APPELLE AUCUN RESEAU. Il recoit DEUX pools deja lues
 *     et rend TROIS appels plus le minimum garanti. Un wallet humain execute, et l appelant doit
 *     simuler le troisieme appel avant de le proposer.
 *
 * ⛔⛔ POURQUOI TROIS GESTES, ET POURQUOI C EST LE MOINS MAUVAIS CHEMIN CONNU.
 *     Une pool v3/CL ne connait que WETH ; l ETH natif n existe que pour Uniswap v4. Le chemin ETH
 *     exigeait donc une commande d ENVELOPPEMENT dans le routeur Uniswap — octet present dans
 *     SEULEMENT 2 des 14 transactions mesurees sur 249 blocs : specificite parfaite, sensibilite
 *     insuffisante, donc NON prouve. Construire dessus serait deviner sur un chemin qui paie.
 *     Mesure du 2026-09-28 : le routeur Aerodrome declare `exactInput` (multi-sauts) et il existe
 *     TROIS pools Aerodrome WETH/USDC. Donc `WETH -> USDC -> action` tient en UN appel.
 *   ⇒ ETH : (1) `deposit()` sur WETH — selecteur 0xd0e30db0, lu dans son bytecode avec deux temoins
 *     positifs et zero faux positif ; (2) `approve` du montant EXACT au routeur Aerodrome — son
 *     bytecode ne contient PAS Permit2, donc allowance directe ; (3) `exactInput` a deux sauts.
 *     Trois signatures, aucun octet suppose, aucun contrat, aucun lot atomique.
 *
 * ⛔⛔ LES TROIS GESTES NE SONT PAS ATOMIQUES, ET CE MODULE LE DIT. Qui s arrete apres le premier
 *     detient du WETH, pas de l ETH et pas d action. Ce n est pas une perte — le WETH se redeconverti
 *     par `withdraw` — mais c est un etat inattendu, et le taire serait la vraie faute. La phrase
 *     `borne` le porte jusqu a l ecran.
 *
 * ⛔ LE MINIMUM TRAVERSE DEUX POOLS, ET CHAQUE POOL PREND SON PROPRE `fee` SUR SON PROPRE SEGMENT.
 *   Deduire les deux frais d un coup sur l entree donnerait un minimum trop haut ; n en deduire
 *   qu un le rendrait trop optimiste. Les deux erreurs se paient, dans des sens opposes.
 * ⛔ TOUT EN ENTIERS, arrondi VERS LE BAS a chaque division : le minimum reste prudent.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un achat aboutisse. Le prix spot ignore la profondeur, et DEUX
 *   sauts donnent DEUX occasions d echouer pour un seul clic. Le minimum porte sur la sortie FINALE.
 */
import { sortieSpot, USDC_BASE, TOLERANCE_MAX_BPS } from './plan-usdc-block.js';
import { calldataExactInputCL, calldataExactInputAvecFrais, calldataApprove,
  ROUTEUR_AERODROME_CL, FRAIS_INTERFACE_BPS_CL, phraseDeRetenue } from './calldata-aerodrome.js';
/** ⛔ Le wallet de frais, LU dans le depot (`frais-creation.js`) et pas recite — un test compare. */
export { FEE_WALLET } from './frais-creation.js';

/** WETH sur Base. ⛔ Lue dans le depot (`echange.js` / `prix-eth.js`), pas recitee — un test compare. */
export const WETH_BASE = '0x4200000000000000000000000000000000000006';
/** ⛔ `deposit()` sur le contrat WETH : selecteur LU dans son bytecode le 2026-09-28, avec deux
 *  temoins positifs (`transfer`, `approve`) presents et deux signatures inventees absentes. */
export const SELECTEUR_DEPOSIT = '0xd0e30db0';

const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (a) => String(a || '').toLowerCase();
const entier = (v) => { try { return BigInt(v); } catch (_) { return null; } };

/**
 * La sortie d un chemin a deux sauts, EN ENTIERS, chaque pool prenant son propre `fee`.
 * ⛔ EXPORTEE POUR ETRE TESTEE SEULE : c est elle qui borne l argent.
 * @returns {?{intermediaire:bigint, sortie:bigint}}
 */
export function sortieDeuxSauts({ entree, saut1, saut2 }) {
  const e = entier(entree);
  if (e === null || e <= 0n) return null;
  for (const s of [saut1, saut2]) {
    if (!s) return null;
    const f = entier(s.fee), q = entier(s.sqrtPriceX96);
    if (f === null || q === null || f < 0n || f >= 1000000n || q <= 0n) return null;
    if (typeof s.entreeEst0 !== 'boolean') return null;
  }
  /* ⛔ LE FRAIS DU PREMIER SAUT SUR L ENTREE DU PREMIER SAUT, celui du second sur ce que le premier
   *   a REELLEMENT rendu. Les cumuler sur l entree initiale fausserait le second segment. */
  const apres1 = (e * (1000000n - entier(saut1.fee))) / 1000000n;
  if (apres1 <= 0n) return null;
  const intermediaire = sortieSpot({ entree: apres1, sqrtPriceX96: saut1.sqrtPriceX96, entreeEst0: saut1.entreeEst0 });
  if (intermediaire === null || intermediaire <= 0n) return null;
  const apres2 = (intermediaire * (1000000n - entier(saut2.fee))) / 1000000n;
  if (apres2 <= 0n) return null;
  const sortie = sortieSpot({ entree: apres2, sqrtPriceX96: saut2.sqrtPriceX96, entreeEst0: saut2.entreeEst0 });
  if (sortie === null || sortie <= 0n) return null;
  return { intermediaire, sortie };
}

/**
 * Choisir la pool WETH/USDC qui rend le PLUS, parmi celles mesurees.
 *
 * ⛔⛔ ON NE CHOISIT PAS PAR `liquidity()`. C est un uint128 brut : comparable entre pools du MEME
 *     couple, mais ce n est pas une profondeur en dollars et ca ne dit pas ce qu un montant DONNE
 *     ressortira. On calcule la sortie par CHACUNE et on garde la meilleure — c est un devis, pas un
 *     pari. Mesure du 2026-09-28 : trois pools existent (tickSpacing 1 / 10 / 50, fee 80 / 500 / 725).
 * ⚠️ CE QUE CE CHOIX NE FAIT PAS : simuler la profondeur. A prix spot egal, la pool la plus mince
 *   « gagne » alors qu elle glisserait davantage. C est le role de la tolerance, et de la simulation.
 */
export function meilleurePoolPivot({ entree, candidates, saut2 }) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  let meilleure = null;
  for (const c of candidates) {
    if (!c) continue;
    const r = sortieDeuxSauts({ entree, saut1: c, saut2 });
    if (!r) continue;
    if (!meilleure || r.sortie > meilleure.sortie) meilleure = { ...r, pivot: c };
  }
  return meilleure;
}

/**
 * @param {object} p
 * @param {string} p.action          l action tokenisee visee
 * @param {bigint|string} p.montantWei  l ETH a depenser
 * @param {object} p.poolAction      { pool, sqrtPriceX96, fee, tickSpacing, actionEst0 } — LUE
 * @param {object[]} p.poolsPivot    les WETH/USDC candidates, chacune { pool, sqrtPriceX96, fee, tickSpacing, wethEst0 }
 * @param {string} p.recipient
 * @param {bigint|number} p.deadline
 * @param {bigint|number} [p.maintenant]
 * @param {bigint|number} [p.toleranceBps]
 */
export function planEthVersAction({ action, montantWei, poolAction, poolsPivot,
  recipient, deadline, maintenant = null, toleranceBps = 100, devise = USDC_BASE,
  fraisBps = FRAIS_INTERFACE_BPS_CL, beneficiaireFrais = null } = {}) {
  if (!ADR.test(String(action || ''))) return { etat: 'REFUSE', pourquoi: 'a whole action address is required' };
  if (bas(action) === bas(devise) || bas(action) === bas(WETH_BASE)) {
    return { etat: 'REFUSE', pourquoi: 'the action cannot be the pivot currency or WETH itself' };
  }
  const m = entier(montantWei);
  if (m === null || m <= 0n) return { etat: 'REFUSE', pourquoi: 'the ETH amount must be above zero' };
  if (!ADR.test(String(recipient || ''))) return { etat: 'REFUSE', pourquoi: 'a whole recipient address is required' };
  const tol = entier(toleranceBps);
  if (tol === null || tol < 0n) return { etat: 'REFUSE', pourquoi: 'tolerance must not be negative' };
  if (tol > TOLERANCE_MAX_BPS) {
    return { etat: 'REFUSE', pourquoi: 'tolerance above ' + TOLERANCE_MAX_BPS + ' bps stops bounding anything' };
  }
  if (!poolAction || !ADR.test(String(poolAction.pool || ''))) {
    return { etat: 'REFUSE', pourquoi: 'the action pool must be resolved on chain first, not assumed' };
  }
  /* ⛔ LE SENS ET L ESPACEMENT SONT LUS, PAS DEDUITS. `tickSpacing` n est PAS le `fee` : mesure du
   *   2026-09-28, ts 10 -> fee 500 et ts 1 -> fee 100, un rapport de 50 a 100. */
  if (typeof poolAction.actionEst0 !== 'boolean') {
    return { etat: 'REFUSE', pourquoi: 'actionEst0 must be read from the pool (token0() === action)' };
  }
  const tsAction = entier(poolAction.tickSpacing);
  if (tsAction === null || tsAction <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'the action pool needs its tickSpacing read from the pool, '
      + 'which is NOT its fee' };
  }
  if (!Array.isArray(poolsPivot) || !poolsPivot.length) {
    return { etat: 'REFUSE', pourquoi: 'no WETH/USDC pivot pool was given — three were measured, '
      + 'and the best of them is chosen by quoting, not by raw liquidity' };
  }

  /* ── le devis : on interroge CHAQUE pivot et on garde la meilleure sortie ─────────────────── */
  const saut2 = { sqrtPriceX96: poolAction.sqrtPriceX96, fee: poolAction.fee,
    /* l entree du second saut est l USDC : il est `token0` exactement quand l action ne l est pas */
    entreeEst0: !poolAction.actionEst0 };
  const candidates = poolsPivot.map((p) => (p && ADR.test(String(p.pool || '')) && typeof p.wethEst0 === 'boolean'
    ? { ...p, sqrtPriceX96: p.sqrtPriceX96, fee: p.fee, entreeEst0: p.wethEst0 } : null)).filter(Boolean);
  if (!candidates.length) {
    return { etat: 'REFUSE', pourquoi: 'every pivot pool was missing its address, its price or its side' };
  }
  const devis = meilleurePoolPivot({ entree: m, candidates, saut2 });
  if (!devis) {
    return { etat: 'REFUSE', pourquoi: 'no pivot pool gives an output for this amount — too small, '
      + 'or a pool price is unusable' };
  }
  const minSortie = (devis.sortie * (10000n - tol)) / 10000n;
  if (minSortie <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'after both pool fees and your tolerance, the guaranteed '
      + 'minimum would be zero — raise the amount' };
  }
  const tsPivot = entier(devis.pivot.tickSpacing);
  if (tsPivot === null || tsPivot <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'the chosen pivot pool has no usable tickSpacing' };
  }

  /* ── les trois appels ──────────────────────────────────────────────────────────────────────
   * ⛔ ORDRE IMPOSE : envelopper, autoriser, echanger. Autoriser avant d avoir du WETH passerait
   *   quand meme (une allowance ne verifie pas le solde), mais echanger avant d autoriser echoue —
   *   et le message parlerait du marche au lieu de l approbation. */
  const appro = calldataApprove({ token: WETH_BASE, montant: m, beneficiaire: ROUTEUR_AERODROME_CL });
  if (appro.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'approval refused: ' + appro.pourquoi };
  /* ⛔⛔ LE SWAP PORTE LE FRAIS D INTERFACE, ET C EST CE QUI REND CE CHEMIN RENTABLE. Le montage est
   *     `multicall([ exactInput(vers le routeur), sweepTokenWithFee(...) ])` : les deux appels dans
   *     la MEME transaction, donc l utilisateur ne peut pas prendre le swap sans la retenue —
   *     contrairement a un transfert separe qu il pourrait refuser.
   *   ⛔ SANS BENEFICIAIRE, PAS DE FRAIS ET PAS DE MONTAGE : on retombe sur le swap nu. C est
   *     explicite, parce qu un frais qui s applique « par defaut » est un frais qu on cache. */
  const sauts = [
    { de: WETH_BASE, vers: devise, tickSpacing: Number(tsPivot) },
    { de: devise, vers: action, tickSpacing: Number(tsAction) },
  ];
  const avecFrais = ADR.test(String(beneficiaireFrais || '')) && BigInt(fraisBps) > 0n;
  const swap = avecFrais
    ? calldataExactInputAvecFrais({ sauts, recipient, deadline, amountIn: m,
      amountOutMinimum: minSortie, maintenant, fraisBps, beneficiaireFrais })
    : calldataExactInputCL({ sauts, recipient, deadline, amountIn: m, amountOutMinimum: minSortie, maintenant });
  if (swap.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'swap refused: ' + swap.pourquoi };

  return {
    etat: 'PRET',
    appels: [
      /* ⛔ LA VALEUR PART ICI, ET SEULEMENT ICI : `deposit()` prend l ETH en `msg.value`. Les deux
       *   appels suivants echangent des ERC-20 et ne doivent porter aucune valeur. */
      { nom: 'Wrap your ETH into WETH', to: bas(WETH_BASE), data: SELECTEUR_DEPOSIT,
        value: '0x' + m.toString(16), role: 'wrap' },
      { nom: 'Allow the Aerodrome router to move exactly this WETH', to: appro.to, data: appro.data,
        value: '0x0', role: 'approve' },
      { nom: 'Swap WETH to USDC to this block, in one call', to: swap.to, data: swap.data,
        value: '0x0', role: 'swap' },
    ],
    pivot: bas(devis.pivot.pool),
    tickSpacingPivot: Number(tsPivot),
    tickSpacingAction: Number(tsAction),
    montantWei: m.toString(),
    usdcIntermediaire: devis.intermediaire.toString(),
    sortieAttendue: devis.sortie.toString(),
    minSortie: minSortie.toString(),
    /* ⛔ CE QUE L UTILISATEUR RECOIT VRAIMENT, APRES NOTRE RETENUE. Publier le minimum des pools
     *   comme « ce que vous recevez » serait le chiffre juste au mauvais endroit. */
    minUtilisateur: swap.minUtilisateur || minSortie.toString(),
    fraisBps: avecFrais ? Number(fraisBps) : 0,
    beneficiaireFrais: avecFrais ? bas(beneficiaireFrais) : null,
    toleranceBps: Number(tol),
    /* ⛔ COMBIEN DE PIVOTS ONT ETE COMPARES : sans ce chiffre, « la meilleure » est une affirmation. */
    pivotsCompares: candidates.length,
    /* ⛔⛔ LA BORNE PORTE LES TROIS CHOSES QUI PEUVENT SURPRENDRE : la non-atomicite, le glissement
     *     qui s accumule, et NOTRE RETENUE. Les taire serait la vraie faute.
     *   ⛔⛔ LA RETENUE ETAIT APPLIQUEE SANS ETRE DITE ICI — un frais silencieux — parce que cette
     *     borne ecrasait celle du swap. Une mutation l a montre : couper le frais dans ce
     *     planificateur ne cassait aucun test. La phrase vient de `phraseDeRetenue`, donc du MEME
     *     chiffre que le calldata, et elle est VIDE quand il n y a pas de frais. */
    borne: 'Three steps, and they are NOT one transaction: if you stop after the first you hold WETH '
      + 'instead of ETH — it converts back, but it is not what you asked for. The swap crosses two '
      + 'pools, slippage adds up on each, and the guaranteed minimum applies to the final block only. '
      + 'The figures come from the pool prices right now, not from a depth simulation.'
      + (avecFrais ? ' ' + phraseDeRetenue(fraisBps) : ''),
    aSimuler: true,
  };
}
