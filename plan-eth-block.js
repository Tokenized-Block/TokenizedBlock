/* plan-eth-block.js — ACHETER UNE ACTION TOKENISEE EN ETH, EN UNE SEULE TRANSACTION.
 *
 * ⛔⛔ CE MODULE NE SIGNE RIEN, N ENVOIE RIEN, N APPELLE AUCUN RESEAU. Il recoit DEUX pools deja
 *     lues et rend UN appel plus le minimum garanti. Un wallet humain execute, et l appelant doit
 *     le simuler avant de le proposer.
 *
 * ⛔⛔ CE MODULE A RENDU TROIS APPELS JUSQU AU 2026-09-29, ET L EN-TETE LE DEFENDAIT. Il expliquait
 *     qu une pool v3/CL ne connait que WETH, donc qu il fallait (1) `deposit()` sur WETH,
 *     (2) `approve` au routeur, (3) `exactInput`. Le raisonnement etait juste sur les pools et FAUX
 *     sur le routeur : il n avait jamais ete verifie que le ROUTEUR sait recevoir de l ETH.
 *   ⇒ MESURE DU 2026-09-29. Le routeur Aerodrome CL declare `WETH9()` et rend EXACTEMENT le WETH de
 *     Base ; `refundETH()` est dans son bytecode — une fonction qui n a de sens que s il RECOIT de
 *     l ETH. Comme le SwapRouter d Uniswap v3 dont Slipstream est un fork, son chemin de paiement
 *     enveloppe WETH9 quand `msg.value` couvre le montant. Ni enveloppement ni approbation.
 *   ⇒ ET CE N EST PAS DEDUIT D UN SELECTEUR : prouve sur fork Base. UNE transaction avec `value`,
 *     sans wrap ni approve : `status 0x1` (gas 477 355), l acheteur recoit 116 276 823 unites, le
 *     wallet de frais recoit EXACTEMENT 116 393 = 10 bps. TEMOIN NEGATIF : la MEME transaction
 *     SANS `value` rend `status 0x0` — c est donc bien l ETH envoye qui paie.
 *
 * ⛔⛔ L ACHAT EST DONC ATOMIQUE, ET CE MODULE LE DIT. Il aboutit, ou il ne se passe rien : plus de
 *     WETH immobilise, plus d allowance pendante, plus d etat intermediaire a expliquer. L en-tete
 *     precedent annoncait l inverse, et une borne fausse fait renoncer des gens pour un danger qui
 *     n existe plus. La phrase `borne` porte la version vraie jusqu a l ecran.
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

  /* ── l appel unique, et les deux pieces de rechange ────────────────────────────────────────
   * ⛔ CE BLOC S APPELAIT « les trois appels » ET IMPOSAIT UN ORDRE — envelopper, autoriser,
   *   echanger. L ordre n a plus d objet : il n y a qu une transaction. Les deux calldata
   *   d enveloppement et d approbation restent construits pour `appelsHeritage`, qui n est branche
   *   nulle part (verifie) et qu il faudrait donc brancher, pas seulement garder. */
  /* ⛔⛔ CET ARTEFACT NE PEUT PLUS OPPOSER SON VETO AU PLAN VIVANT, ET C ETAIT UN VRAI DEFAUT.
   *     `appro` n est consomme QUE par `appelsHeritage`, qui n est branche nulle part — mais son
   *     echec rendait `REFUSE: approval refused: …` et TUAIT le plan a une transaction. Le visiteur
   *     aurait lu un refus d approbation sur un chemin qui n en demande AUCUNE. Non atteignable
   *     avec les entrees d aujourd hui, mais le veto etait reel, et une garde qui peut refuser pour
   *     une raison inexistante finit par refuser.
   *   ⛔ ON NE LE SUPPRIME PAS POUR AUTANT : s il echoue, la piece de rechange est simplement
   *     absente, et on le DIT dans le plan (`pourquoiPasDHeritage`) au lieu de le taire. */
  const appro = calldataApprove({ token: WETH_BASE, montant: m, beneficiaire: ROUTEUR_AERODROME_CL });
  const heritagePossible = appro.etat === 'PRET';
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
    /* ── ⛔⛔ UNE SEULE TRANSACTION, ET C EST MESURE ─────────────────────────────────────────────
     *     CE QUE CA REMPLACE : trois transactions NON ATOMIQUES — `deposit()` sur WETH, `approve`
     *     au routeur, puis le swap. La friction maximale pour un premier achat, et c etait
     *     precisement le chemin qu un revenant du rail fiat devait emprunter, puisque l onramp lui
     *     vend de l ETH. Mesure du 2026-09-29 : `onramp_retour_block` = 8, `achat_ok` inexistant.
     *   ⛔ POURQUOI C EST POSSIBLE, LU SUR LA CHAINE : le routeur declare `WETH9()` et rend
     *     EXACTEMENT le WETH de Base, et `refundETH()` est dans son bytecode — une fonction qui n a
     *     de sens que s il RECOIT de l ETH. Comme dans le SwapRouter d Uniswap v3 dont Slipstream
     *     est un fork, son chemin de paiement enveloppe WETH9 quand `msg.value` couvre le montant.
     *     Ni wrap ni approve ne sont donc necessaires.
     *   ⛔⛔ ET CE N EST PAS DEDUIT D UN SELECTEUR : prouve sur fork Base, quatre conditions —
     *     recu `status 0x1` (gas 477 355), l acheteur recoit 116 276 823 unites, a6cf recoit
     *     EXACTEMENT 116 393 = 10 bps, et TEMOIN NEGATIF : la MEME transaction SANS `value` rend
     *     `status 0x0`. C est donc bien l ETH envoye qui paie, et non un reste quelconque.
     *   ⛔ PAS DE `refundETH()` DANS LE MULTICALL : `exactInput` est un exact-IN, il consomme tout
     *     `amountIn`, donc il n y a aucun surplus a rendre. L ajouter changerait le calldata que je
     *     viens de prouver — et il faudrait le reprouver. On garde EXACTEMENT ce qui a ete mesure.
     *   ⛔ LA VALEUR PART SUR CET APPEL, et c est le seul : le routeur l enveloppe lui-meme. */
    appels: [
      { nom: 'Buy this block with your ETH, in one transaction', to: swap.to, data: swap.data,
        value: '0x' + m.toString(16), role: 'swap' },
    ],
    /* ⛔⛔ CE CHAMP N EST BRANCHE NULLE PART, ET JE LE DIS PLUTOT QUE DE LE LAISSER CROIRE. Mon
     *     premier commentaire annonçait qu « un wallet qui refuserait la valeur pourrait retomber
     *     dessus » : c est FAUX. Verifie par recherche dans tout le depot le 2026-09-29 —
     *     `appelsHeritage` n est lu que par son propre test. Rien dans l app ni dans les lecteurs
     *     ne s en sert. Un nom present n est pas un usage.
     *   ⛔ POURQUOI IL RESTE QUAND MEME : les trois gestes sont la seule sortie connue si un wallet
     *     refusait la valeur sur un `multicall`, et jeter un chemin verifie pour cause de
     *     non-usage se paie le jour ou on en a besoin. Mais tant que personne ne le lit, c est une
     *     PIECE DE RECHANGE, pas une porte de secours — et l appeler « secours » serait une
     *     sur-vente. Le brancher est une decision, pas un detail. */
    appelsHeritage: heritagePossible ? [
      { nom: 'Wrap your ETH into WETH', to: bas(WETH_BASE), data: SELECTEUR_DEPOSIT,
        value: '0x' + m.toString(16), role: 'wrap' },
      { nom: 'Allow the Aerodrome router to move exactly this WETH', to: appro.to, data: appro.data,
        value: '0x0', role: 'approve' },
      { nom: 'Swap WETH to USDC to this block, in one call', to: swap.to, data: swap.data,
        value: '0x0', role: 'swap' },
    ] : null,
    /* ⛔ ET SI LA PIECE DE RECHANGE N A PAS PU ETRE CONSTRUITE, ON DIT POURQUOI. Rendre `null` sans
     *   raison ferait chercher un bug ; rendre la raison permet de decider. */
    pourquoiPasDHeritage: heritagePossible ? null : ('approval calldata refused: ' + appro.pourquoi),
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
    /* ⛔⛔ CETTE BORNE DISAIT « Three steps, and they are NOT one transaction ». C EST DEVENU FAUX
     *     le 2026-09-29, et une borne fausse est pire qu aucune borne : elle fait renoncer des gens
     *     pour un danger qui n existe plus. Le routeur enveloppe l ETH lui-meme — prouve sur fork,
     *     temoin negatif inclus — donc l achat est ATOMIQUE : il aboutit ou il ne se passe rien.
     *   ⛔ CE QUI RESTE VRAI, ET QUI DOIT RESTER DIT : deux pools traversees, donc deux fois du
     *     glissement, et un prix qui vient des pools MAINTENANT et non d une simulation de
     *     profondeur. */
    borne: 'One transaction: it either completes or nothing happens — your ETH is wrapped by the '
      + 'router itself. The swap crosses two pools, slippage adds up on each, and the guaranteed '
      + 'minimum applies to the final block only. The figures come from the pool prices right now, '
      + 'not from a depth simulation.'
      + (avecFrais ? ' ' + phraseDeRetenue(fraisBps) : ''),
    aSimuler: true,
  };
}
