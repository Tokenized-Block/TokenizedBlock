/* calldata-aerodrome.js — CONSTRUIRE LA JAMBE AERODROME CL, ET REFUSER PLUTOT QUE DEVINER.
 *
 * ⛔⛔ CE MODULE NE SIGNE RIEN ET N ENVOIE RIEN. Il rend des objets `{ to, data, value }`. C est un
 *     wallet humain qui exécute. Aucun appel reseau, aucune horloge lue : tout ce qui varie
 *     (deadline, montants, destinataire) ENTRE par parametre, pour que le module soit rejouable et
 *     testable hors ligne. Une garde de ce fichier le verifie.
 *
 * ⛔⛔ POURQUOI IL EXISTE. Mesure du 2026-09-27 sur le bytecode du router que l app utilise
 *     (0x6ff5693b…99b43) : la factory Uniswap v3 et le PoolManager v4 y sont, la factory Aerodrome
 *     CL n y est PAS. Conclusion mesuree : 144/156 de nos blocks sont servis par ce router, et les
 *     12 restants — EXACTEMENT les 12 actions tokenisees, 12,10 M$ de profondeur — sont hors de sa
 *     portee. Echanger un block contre une ACTION exige donc une deuxieme jambe, sur Aerodrome.
 *
 * ⛔⛔ TOUT CE QUI SUIT A ETE MESURE SUR LA CHAINE, RIEN N EST RECITE.
 *   ROUTER : `0x698cb2b6dd822994581fea6ea4fc755d1363a92f`
 *     - `factory()` rend `0xf8f2eb4940cfe7d13603dddd87f123820fc061ef` = la factory Aerodrome CL
 *     - `WETH9()` rend `0x4200000000000000000000000000000000000006`
 *     - `factoryRegistry()`, `owner()`, `PERMIT2()`, `voter()` : ABSENTES
 *   SELECTEURS lus dans le bytecode (un dispatcher Solidity porte chaque selecteur en PUSH4) :
 *     methode validee par 2 temoins positifs presents (`factory()`, `WETH9()`) et 0/6 signatures
 *     inventees trouvees par hasard.
 *   ORDRE DES CHAMPS decode sur DEUX transactions reelles appelant le router DIRECTEMENT
 *   (0xf1dfb9f1…dea17 et 0xd0b478dd…7d8c, blocs 51 88x xxx), et croise avec l event `Swap` de la
 *   meme tx : `amountIn` egalait au chiffre pres le montant POSITIF du Swap, et `amountOutMinimum`
 *   etait bien <= a la sortie reelle. ⛔ Ce croisement etait INDISPENSABLE : `tokenIn` et `tokenOut`
 *   ont la meme forme, et j avais d abord inverse les deux en supposant que NVDAc etait `token0`.
 *   C est la comparaison des adresses (0x8335… < 0xb200… donc token0 = USDC) qui a tranche.
 *
 * ⚠️ CE QUE CE MODULE NE PROUVE PAS, ET IL FAUT LE LIRE AVANT DE S EN SERVIR :
 *   - qu un swap aboutisse : le glissement, la profondeur au bloc et les frais ne sont pas simules ;
 *   - que `tickSpacing` passe en parametre corresponde a une pool EXISTANTE — une pool absente fait
 *     reverter a l execution, pas ici ;
 *   - que le routeur soit le bon a utiliser pour une paire donnee. Il sert les pools de SA factory.
 */

/* ── adresses mesurees ─────────────────────────────────────────────────────────────────────── */
/** SwapRouter des pools Aerodrome CL. ⛔ `factory()` verifie sur la chaine. */
export const ROUTEUR_AERODROME_CL = '0x698cb2b6dd822994581fea6ea4fc755d1363a92f';
/** ⛔ La factory que ce routeur declare. Publiee ici pour qu une sonde puisse la RE-verifier, pas
 *  pour etre recopiee ailleurs. */
export const FACTORY_AERODROME_CL = '0xf8f2eb4940cfe7d13603dddd87f123820fc061ef';

/** ⛔ SELECTEURS LUS DANS LE BYTECODE DEPLOYE, avec leur signature complete a cote — sans la
 *  signature, un selecteur nu est un nombre magique que personne ne peut re-verifier. */
export const SELECTEURS = Object.freeze({
  /* (tokenIn, tokenOut, tickSpacing, recipient, deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96) */
  exactInputSingle: '0xa026383e',
  exactInput: '0xc04b8d59',
  multicall: '0xac9650d8',
  unwrapWETH9: '0x49404b7c',
  refundETH: '0x12210e8a',
  /* ⛔ `approve` n est PAS sur le routeur : c est le jeton qu on appelle. Selecteur ERC-20 standard,
   *   et une sonde le recalcule depuis `approve(address,uint256)` au lieu de croire cette ligne. */
  approve: '0x095ea7b3',
});

const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (a) => String(a || '').toLowerCase();

/* ── encodage ABI, uniquement ce dont on a besoin ──────────────────────────────────────────── */
/** ⛔ UN MOT DE 32 OCTETS, ET ON REFUSE CE QUI NE TIENT PAS. Tronquer silencieusement un nombre
 *  trop grand produirait un montant faux dans une transaction valide — le pire des deux mondes. */
function motNombre(n, nom) {
  const v = BigInt(n);
  if (v < 0n) throw new Error(nom + ' : un nombre negatif ne peut pas etre encode ici');
  if (v >= (1n << 256n)) throw new Error(nom + ' : depasse 256 bits');
  return v.toString(16).padStart(64, '0');
}
function motAdresse(a, nom) {
  if (!ADR.test(String(a || ''))) throw new Error(nom + ' : adresse attendue, recu ' + JSON.stringify(a));
  return bas(a).replace(/^0x/, '').padStart(64, '0');
}
/** ⛔ `int24` SIGNE, EN COMPLEMENT A DEUX SUR 32 OCTETS. Les `tickSpacing` observes sont positifs
 *  (10 sur les pools d actions), mais encoder un negatif comme un positif mettrait un nombre
 *  gigantesque a la place — donc le cas est traite, pas interdit par oubli. */
function motInt24(n, nom) {
  const v = BigInt(n);
  if (v < -(1n << 23n) || v >= (1n << 23n)) throw new Error(nom + ' : hors des bornes d un int24');
  return (v < 0n ? v + (1n << 256n) : v).toString(16).padStart(64, '0');
}

/* ── la jambe Aerodrome ────────────────────────────────────────────────────────────────────── */
/**
 * @param {object} p
 * @param {string} p.tokenIn            le jeton qu on donne
 * @param {string} p.tokenOut          le jeton qu on veut
 * @param {number} p.tickSpacing       ⚠️ celui de la pool VISEE ; 10 sur les pools d actions mesurees
 * @param {string} p.recipient
 * @param {bigint|string|number} p.deadline  ⛔ un instant ABSOLU (secondes), fourni par l appelant
 * @param {bigint|string|number} p.amountIn
 * @param {bigint|string|number} p.amountOutMinimum  ⛔ OBLIGATOIRE et > 0
 * @param {bigint|string|number} [p.maintenant]  l instant de reference, pour juger le deadline
 * @returns {{to:string, data:string, value:string, champs:object}}
 */
export function calldataExactInputSingleCL(p = {}) {
  const { tokenIn, tokenOut, tickSpacing, recipient, deadline, amountIn, amountOutMinimum,
    maintenant = null, sqrtPriceLimitX96 = 0 } = p;

  /* ⛔⛔ LE REFUS LE PLUS IMPORTANT DE CE FICHIER : `amountOutMinimum` DOIT ETRE > 0.
   *     Un minimum a zero autorise la pool a rendre 1 wei pour n importe quel montant d entree —
   *     c est un cadeau ouvert a quiconque regarde la mempool. Beaucoup d exemples publics mettent 0
   *     « pour tester » ; ce module refuse, parce qu un defaut confortable finit toujours en prod. */
  const min = BigInt(amountOutMinimum === undefined || amountOutMinimum === null ? 0 : amountOutMinimum);
  if (min <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'amountOutMinimum must be greater than zero — a zero minimum '
      + 'lets the pool return almost nothing for the whole input' };
  }
  const entree = BigInt(amountIn === undefined || amountIn === null ? 0 : amountIn);
  if (entree <= 0n) return { etat: 'REFUSE', pourquoi: 'amountIn must be greater than zero' };
  if (!ADR.test(String(tokenIn || '')) || !ADR.test(String(tokenOut || ''))) {
    return { etat: 'REFUSE', pourquoi: 'tokenIn and tokenOut must both be whole addresses' };
  }
  /* ⛔ MEME JETON DES DEUX COTES : aucune pool ne l accepte, et le refus doit venir d ici plutot que
   *   d un revert illisible trente secondes plus tard. */
  if (bas(tokenIn) === bas(tokenOut)) {
    return { etat: 'REFUSE', pourquoi: 'tokenIn and tokenOut are the same asset' };
  }
  if (!ADR.test(String(recipient || ''))) {
    return { etat: 'REFUSE', pourquoi: 'a whole recipient address is required' };
  }
  /* ⛔ LE DESTINATAIRE N EST JAMAIS L ADRESSE NULLE NI LE ROUTEUR LUI-MEME : les deux font perdre
   *   les jetons sans erreur. Le second est un piege reel — le routeur accepte d etre destinataire
   *   pour chainer des sauts, et l oublier envoie la sortie nulle part. */
  if (/^0x0{40}$/i.test(String(recipient))) {
    return { etat: 'REFUSE', pourquoi: 'the recipient cannot be the zero address' };
  }
  const ts = BigInt(tickSpacing === undefined || tickSpacing === null ? 0 : tickSpacing);
  if (ts <= 0n) return { etat: 'REFUSE', pourquoi: 'tickSpacing must be a positive pool spacing' };

  const dl = BigInt(deadline === undefined || deadline === null ? 0 : deadline);
  if (dl <= 0n) return { etat: 'REFUSE', pourquoi: 'an absolute deadline in seconds is required' };
  /* ⛔ LE DEADLINE EST JUGE CONTRE UN INSTANT FOURNI, JAMAIS CONTRE L HORLOGE DE CE MODULE. Lire
   *   l heure ici rendrait le module non rejouable, et une sonde ne pourrait plus le tester.
   *   ⚠️ Si `maintenant` n est pas fourni, on N INVENTE PAS de jugement : on encode et on le DIT. */
  let noteDeadline = 'not judged — no reference instant was given';
  if (maintenant !== null && maintenant !== undefined) {
    const now = BigInt(maintenant);
    if (dl <= now) return { etat: 'REFUSE', pourquoi: 'the deadline is already in the past' };
    /* ⛔ 30 MINUTES : les deux transactions reelles mesurees portaient des deadlines de +85 s et
     *   +598 s. Un deadline tres lointain laisse la transaction executable longtemps apres que le
     *   prix a bouge — c est exactement ce qu attend un observateur de la mempool. */
    if (dl - now > 1800n) {
      return { etat: 'REFUSE', pourquoi: 'the deadline is more than 30 minutes out; measured real '
        + 'calls used 85 s and 598 s, and a far deadline stays executable after the price has moved' };
    }
    noteDeadline = 'ok — ' + String(dl - now) + ' s ahead of the given instant';
  }

  const data = SELECTEURS.exactInputSingle
    + motAdresse(tokenIn, 'tokenIn')
    + motAdresse(tokenOut, 'tokenOut')
    + motInt24(ts, 'tickSpacing')
    + motAdresse(recipient, 'recipient')
    + motNombre(dl, 'deadline')
    + motNombre(entree, 'amountIn')
    + motNombre(min, 'amountOutMinimum')
    + motNombre(sqrtPriceLimitX96, 'sqrtPriceLimitX96');

  return {
    etat: 'PRET',
    to: ROUTEUR_AERODROME_CL,
    data,
    /* ⛔ AUCUN ETHER : cette jambe echange deux ERC-20. Envoyer de la valeur ici la laisserait sur
     *   le routeur sans que rien ne le signale. */
    value: '0x0',
    champs: { tokenIn: bas(tokenIn), tokenOut: bas(tokenOut), tickSpacing: Number(ts),
      recipient: bas(recipient), deadline: String(dl), amountIn: String(entree),
      amountOutMinimum: String(min), sqrtPriceLimitX96: String(sqrtPriceLimitX96) },
    noteDeadline,
  };
}

/** L autorisation ERC-20 du jeton d entree vers le routeur.
 * ⛔ MONTANT EXACT, JAMAIS ILLIMITE. Une autorisation infinie survit a la transaction et laisse le
 *   routeur — ou tout defaut futur du routeur — reprendre des jetons plus tard. Le confort d une
 *   seule signature ne vaut pas une autorisation permanente sur le solde entier. */
export function calldataApprove({ token, montant, beneficiaire = ROUTEUR_AERODROME_CL } = {}) {
  if (!ADR.test(String(token || ''))) return { etat: 'REFUSE', pourquoi: 'a whole token address is required' };
  if (!ADR.test(String(beneficiaire || ''))) return { etat: 'REFUSE', pourquoi: 'a whole spender address is required' };
  const m = BigInt(montant === undefined || montant === null ? 0 : montant);
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'the approved amount must be greater than zero' };
  /* ⛔ LE PLAFOND DE L UINT256 EST REFUSE EXPLICITEMENT, pour que « approbation infinie » soit un
   *   refus nomme et pas un oubli. */
  if (m === (1n << 256n) - 1n) {
    return { etat: 'REFUSE', pourquoi: 'an unlimited approval is refused: approve the exact amount, '
      + 'otherwise the allowance outlives this transaction' };
  }
  return { etat: 'PRET', to: bas(token), data: SELECTEURS.approve
    + motAdresse(beneficiaire, 'spender') + motNombre(m, 'amount'), value: '0x0' };
}

/* ── le franchissement : deux jambes, un seul geste ────────────────────────────────────────── */
/**
 * Assemble la liste d appels d un franchissement « block (Uniswap) -> pivot -> action (Aerodrome) ».
 *
 * ⛔⛔ LE PIEGE CENTRAL, ET IL N A PAS DE SOLUTION PROPRE : dans un lot EIP-5792, l appel 2 ne peut
 *     PAS connaitre ce que l appel 1 a produit — le calldata est fige avant l envoi. On passe donc
 *     en entree de l appel 2 le MINIMUM GARANTI de l appel 1, et le surplus reste au wallet sous
 *     forme de poussiere. ⛔ Passer davantage ferait piocher dans le solde existant de l utilisateur,
 *     ou reverter : les deux sont pires que de la poussiere, et le second au moins echoue proprement.
 *   ⇒ CE MODULE IMPOSE `entree2 <= minSortie1`, et refuse sinon. Ce n est pas une preference.
 *
 * ⚠️ CE QU IL NE FAIT PAS : il ne construit PAS la jambe Uniswap. Celle-la existe deja dans
 *   `echange.js` et la dupliquer ici ferait deux constructeurs pour un seul chemin, qui derivent.
 *   L appelant passe la jambe 1 deja construite.
 */
export function planifierFranchissement({ jambe1 = null, pivot, action, tickSpacing, recipient,
  deadline, minSortie1, minSortie2, maintenant = null, entree2 = null } = {}) {
  if (!jambe1 || !ADR.test(String(jambe1.to || '')) || typeof jambe1.data !== 'string' || !jambe1.data) {
    return { etat: 'REFUSE', pourquoi: 'leg 1 must be an already-built call { to, data }' };
  }
  const min1 = BigInt(minSortie1 === undefined || minSortie1 === null ? 0 : minSortie1);
  if (min1 <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'leg 1 must carry a guaranteed minimum output: without it '
      + 'leg 2 has no honest input amount' };
  }
  const e2 = entree2 === null || entree2 === undefined ? min1 : BigInt(entree2);
  /* ⛔⛔ L INVARIANT. Il est teste, et une mutation qui l enleve doit casser. */
  if (e2 > min1) {
    return { etat: 'REFUSE', pourquoi: 'leg 2 would spend more than leg 1 is guaranteed to produce ('
      + e2 + ' > ' + min1 + '): the batch would either revert or reach into the wallet balance' };
  }
  if (e2 <= 0n) return { etat: 'REFUSE', pourquoi: 'leg 2 input must be greater than zero' };

  const appro = calldataApprove({ token: pivot, montant: e2 });
  if (appro.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'approval refused: ' + appro.pourquoi };
  const jambe2 = calldataExactInputSingleCL({ tokenIn: pivot, tokenOut: action, tickSpacing,
    recipient, deadline, amountIn: e2, amountOutMinimum: minSortie2, maintenant });
  if (jambe2.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'leg 2 refused: ' + jambe2.pourquoi };

  return {
    etat: 'PRET',
    appels: [
      { to: jambe1.to, data: jambe1.data, value: jambe1.value || '0x0', role: 'leg 1 — Uniswap' },
      { to: appro.to, data: appro.data, value: '0x0', role: 'approve the pivot for the Aerodrome router' },
      { to: jambe2.to, data: jambe2.data, value: '0x0', role: 'leg 2 — Aerodrome CL' },
    ],
    /* ⛔ LA POUSSIERE EST ANNONCEE, PAS CACHEE : c est le prix du lot, et l ecran doit pouvoir le
     *   dire avant qu on signe. On ne connait pas son montant (il depend de la sortie reelle de la
     *   jambe 1), seulement sa NATURE — et on le formule ainsi plutot que d inventer un chiffre. */
    poussiere: 'whatever leg 1 produces above ' + min1 + ' stays in the wallet as the pivot asset',
    /* ⛔ ET LE LOT EXIGE L ATOMICITE : sans elle, la jambe 1 peut passer seule et l utilisateur se
     *   retrouve avec le pivot au lieu de ce qu il voulait. L appelant doit le demander au wallet. */
    exigeAtomique: true,
  };
}
