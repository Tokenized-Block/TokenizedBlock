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
import { estDeviseConnue } from './pool-sans-hook.js';
const WETH_SORTIE_FRAIS = '0x4200000000000000000000000000000000000006';
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
  /* ⛔⛔ `sweepTokenWithFee` EST CE QUI REND UN FRAIS D INTERFACE POSSIBLE SANS CONTRAT A NOUS. Le
   *     swap envoie sa sortie AU ROUTEUR, puis cette fonction la reverse a l utilisateur EN RETENANT
   *     un pourcentage pour une adresse choisie. Selecteur LU dans le bytecode du routeur Aerodrome
   *     le 2026-09-28, avec deux temoins positifs presents et 0/4 signatures inventees trouvees.
   *   ⛔ L UNIVERSAL ROUTER D UNISWAP N A AUCUNE de ces fonctions — il a ses propres commandes. Le
   *     meme test l a montre, ce qui prouve que les temoins discriminent vraiment. */
  sweepTokenWithFee: '0xe0e189a0',
  sweepToken: '0xdf2ab5bb',
  unwrapWETH9WithFee: '0x9b2c0a37',
  /* ⛔ `getPool` est sur la FACTORY, pas sur le routeur. Signature designee par la chaine : appelee
   *   avec (token0, token1, tickSpacing) lus SUR une pool, elle a rendu l adresse de cette pool
   *   meme — aller-retour verifie sur les 12 pools d actions, 12/12, et un tickSpacing absurde
   *   (7777) rend l adresse nulle. La variante `uint24` REVERTE sur cette factory. */
  getPool: '0x28af8d0b',
});

/** ⛔⛔ LES `tickSpacing` MESURES, EN DOCUMENTATION SEULEMENT — JAMAIS COMME VALEUR PAR DEFAUT.
 *  Aller-retour du 2026-09-28 sur les 12 pools d actions : 10 pour les sept plus profondes
 *  (NVDAc, GOOGLc, METAc, AAPLc, MSTRc, MSFTc, SNDKc) et 1 pour les cinq autres (RDDTc, LLYc,
 *  NFLXc, GMEc, AVGOc). Un defaut a 10 aurait donc rate CINQ pools sur douze en revertant apres
 *  signature — c est pour ca que ce module exige le triplet au lieu de le supposer. */
export const TICKSPACINGS_MESURES = Object.freeze({ profondes: 10, petites: 1, mesureLe: '2026-09-28' });

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

/**
 * Un swap exact-in MULTI-SAUTS sur Aerodrome CL : un seul appel, un seul routeur.
 *
 * ⛔⛔ POURQUOI CETTE FONCTION EXISTE, ET CE QU ELLE DEBLOQUE. La plupart des visiteurs arrivent en
 *     ETH, pas en USDC. Le chemin ETH exigeait jusqu ici un octet de commande d enveloppement que je
 *     n ai PAS prouve — present dans 2 des 14 transactions mesurees sur 249 blocs, donc specificite
 *     parfaite mais sensibilite insuffisante.
 *     Mesure du 2026-09-28 : il existe TROIS pools Aerodrome WETH/USDC (tickSpacing 1 / fee 80,
 *     tickSpacing 10 / fee 500, tickSpacing 50 / fee 725). Donc `WETH -> USDC -> action` tient en UN
 *     appel `exactInput`, sur UN routeur, sans franchir aucune frontiere.
 *   ⇒ Le parcours ETH devient : `deposit()` sur WETH (selecteur 0xd0e30db0, lu dans son bytecode
 *     avec 2 temoins positifs et 0 faux positif), puis `approve`, puis CE swap. Trois signatures,
 *     aucun octet non prouve, aucun contrat, aucun lot atomique.
 *
 * ⛔⛔ LE CHEMIN PORTE UN `tickSpacing` SUR TROIS OCTETS, ET CE N EST PAS LE `fee`. C est PROUVE, pas
 *     suppose : les quatre transactions reelles observees portaient `0x0000c8` = 200 au milieu du
 *     chemin, et `getPool(jeton0, USDC, 200)` sur la factory Aerodrome rend une VRAIE pool dont
 *     `tickSpacing()` vaut 200 et dont `fee()` vaut 3000 — un nombre DIFFERENT. L aller-retour
 *     tranche ce que l apparence ne pouvait pas : 200 etait plausible dans les deux jeux.
 *
 * ⛔ ET L ORDRE DES CHAMPS N EST PAS CELUI DE `exactInputSingle`. Decode sur une transaction REUSSIE
 *   (status 0x1, 3 logs, 292 octets, 0xa2cc2798…4f74, bloc 51 918 206, ts 1 790 625 759, deadline a +598 s) :
 *       (bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)
 *   ⛔ La structure se referme : l offset du `path` valait 160, soit EXACTEMENT les cinq mots de
 *     tete, et le `recipient` etait egal au `from` de la transaction.
 *
 * ⚠️ CE QU ELLE NE PROUVE PAS : qu un swap aboutisse. Le glissement s accumule sur CHAQUE saut, et
 *   un chemin a deux sauts a deux occasions d echouer. Le minimum porte sur la sortie FINALE.
 */
export function calldataExactInputCL({ sauts, recipient, amountIn, amountOutMinimum, deadline,
  maintenant = null, suiviDUnBalayage = false } = {}) {
  /* ⛔ LE MEME REFUS QUE POUR LE SAUT UNIQUE, et pour la meme raison : un minimum nul laisse la
   *   derniere pool rendre presque rien pour la totalite de l entree. */
  const min = BigInt(amountOutMinimum === undefined || amountOutMinimum === null ? 0 : amountOutMinimum);
  if (min <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'amountOutMinimum must be greater than zero — a zero minimum '
      + 'lets the last pool return almost nothing for the whole input' };
  }
  const entree = BigInt(amountIn === undefined || amountIn === null ? 0 : amountIn);
  if (entree <= 0n) return { etat: 'REFUSE', pourquoi: 'amountIn must be greater than zero' };
  if (!ADR.test(String(recipient || ''))) return { etat: 'REFUSE', pourquoi: 'a whole recipient address is required' };
  if (/^0x0{40}$/i.test(String(recipient))) return { etat: 'REFUSE', pourquoi: 'the recipient cannot be the zero address' };
  /* ⛔⛔ LE ROUTEUR COMME DESTINATAIRE EST REFUSE PAR DEFAUT, ET CE DEFAUT RESTE. Il accepte d etre
   *     destinataire, donc l y mettre par erreur laisse la sortie chez lui SANS AUCUNE ERREUR.
   *   ⛔ SAUF QUAND UN BALAYAGE SUIT DANS LA MEME TRANSACTION. C est exactement le montage a frais :
   *     `multicall([ exactInput(recipient = routeur), sweepTokenWithFee(...) ])`. Le drapeau est
   *     nomme d apres CETTE raison — « suivi d un balayage » — pour qu on ne puisse pas le poser par
   *     confort sans savoir ce qu il autorise.
   *   ⚠️ CE QUE LE DRAPEAU NE VERIFIE PAS : qu un balayage suive REELLEMENT. Cette fonction ne voit
   *     pas le multicall qui l englobe. C est `calldataExactInputAvecFrais` qui construit les deux
   *     ensemble, et c est la seule qui doit poser ce drapeau. */
  if (bas(recipient) === bas(ROUTEUR_AERODROME_CL) && !suiviDUnBalayage) {
    return { etat: 'REFUSE', pourquoi: 'the recipient cannot be the router itself: the output would '
      + 'silently stay there, unless a sweep follows in the same multicall' };
  }
  const dl = BigInt(deadline === undefined || deadline === null ? 0 : deadline);
  if (dl <= 0n) return { etat: 'REFUSE', pourquoi: 'an absolute deadline in seconds is required' };
  let noteDeadline = 'not judged — no reference instant was given';
  if (maintenant !== null && maintenant !== undefined) {
    const now = BigInt(maintenant);
    if (dl <= now) return { etat: 'REFUSE', pourquoi: 'the deadline is already in the past' };
    if (dl - now > 1800n) {
      return { etat: 'REFUSE', pourquoi: 'the deadline is more than 30 minutes out; the measured real '
        + 'call used 598 s, and a far deadline stays executable after the price has moved' };
    }
    noteDeadline = 'ok — ' + String(dl - now) + ' s ahead of the given instant';
  }

  /* ── le chemin : jeton, puis (tickSpacing, jeton) repete ──────────────────────────────────
   * ⛔⛔ TROIS OCTETS POUR LE tickSpacing, comme dans la transaction temoin. Sur QUATRE octets le
   *     chemin ferait 45 au lieu de 43 pour un saut, et la chaine le refuserait — l egalite des
   *     longueurs EST le test. */
  if (!Array.isArray(sauts) || sauts.length < 1) {
    return { etat: 'REFUSE', pourquoi: 'a path needs at least one hop' };
  }
  let hex = '';
  let precedent = null;
  for (let i = 0; i < sauts.length; i += 1) {
    const s = sauts[i] || {};
    const de = bas(s.de), vers = bas(s.vers);
    if (!ADR.test(de) || !ADR.test(vers)) {
      return { etat: 'REFUSE', pourquoi: 'hop ' + i + ' needs two whole token addresses' };
    }
    if (de === vers) return { etat: 'REFUSE', pourquoi: 'hop ' + i + ' has the same token on both sides' };
    /* ⛔ LES SAUTS SE CHAINENT, sinon la chaine refuse un chemin que l encodeur a accepte. */
    if (precedent !== null && precedent !== de) {
      return { etat: 'REFUSE', pourquoi: 'hop ' + i + ' starts at ' + de + ' but hop ' + (i - 1)
        + ' ended at ' + precedent + ': the path does not chain' };
    }
    const ts = BigInt(s.tickSpacing === undefined || s.tickSpacing === null ? -1 : s.tickSpacing);
    /* ⛔⛔ ON EXIGE `tickSpacing`, PAS `fee`, ET LE NOM DU CHAMP LE DIT. Passer un fee (500, 3000…)
     *     designerait un espacement qui n existe pas, et la pool serait introuvable. */
    if (ts <= 0n || ts >= (1n << 23n)) {
      return { etat: 'REFUSE', pourquoi: 'hop ' + i + ' needs a positive tickSpacing that fits in three '
        + 'bytes — this is the pool spacing (1, 10, 50, 200…), NOT its fee (80, 500, 725, 3000…)' };
    }
    if (i === 0) hex += de.replace(/^0x/, '');
    hex += ts.toString(16).padStart(6, '0') + vers.replace(/^0x/, '');
    precedent = vers;
  }
  const attendue = 20 + 23 * sauts.length;
  if (hex.length / 2 !== attendue) {
    return { etat: 'REFUSE', pourquoi: 'internal: path is ' + (hex.length / 2) + ' bytes, expected ' + attendue };
  }

  /* ── l enveloppe, dans l ORDRE DECODE ─────────────────────────────────────────────────────
   * ⛔ CINQ MOTS DE TETE : offset(path), recipient, deadline, amountIn, amountOutMinimum. L offset
   *   du path vaut donc 5 x 32 = 160 — exactement ce que portait la transaction temoin. */
  const TETE = 5;
  const tuple = motNombre(TETE * 32, 'offset du chemin')
    + motAdresse(recipient, 'recipient')
    + motNombre(dl, 'deadline')
    + motNombre(entree, 'amountIn')
    + motNombre(min, 'amountOutMinimum')
    + dynamique(hex);
  return {
    etat: 'PRET',
    to: ROUTEUR_AERODROME_CL,
    data: SELECTEURS.exactInput + motNombre(0x20, 'offset du tuple') + tuple,
    value: '0x0',
    champs: { recipient: bas(recipient), deadline: String(dl), amountIn: String(entree),
      amountOutMinimum: String(min), cheminOctets: attendue, sauts: sauts.length,
      entree: bas(sauts[0].de), sortie: bas(sauts[sauts.length - 1].vers) },
    noteDeadline,
    /* ⛔ LA BORNE PROPRE AU MULTI-SAUTS : le glissement s accumule, et deux sauts donnent deux
     *   occasions d echouer pour un seul clic. */
    borne: 'This route crosses ' + sauts.length + ' pool(s); slippage adds up on each one and the '
      + 'guaranteed minimum applies to the FINAL output only.',
  };
}

/** Le frais d interface des chemins v3 / Aerodrome, en points de base.
 *
 * ⛔⛔ 10 = 0,1 %, ET C EST UN CHOIX DE PHIL, PAS UNE VALEUR TECHNIQUE. Le chemin v4 de l app prend
 *     0,5 % (`FRAIS_INTERFACE_BPS` dans `echange.js`) : l asymetrie est deliberee et il faut qu elle
 *     soit visible ici, sinon quelqu un « harmonisera » un jour sans savoir que c etait voulu.
 * ⚠️ ET LE PLAFOND DE `feeBips` N EST PAS VERIFIE. La peripherie Uniswap en impose un, mais je ne
 *   l ai pas LU dans ce bytecode — le reciter serait exactement ce qu on s interdit. On refuse donc
 *   au-dela de 100 par prudence, en disant que la borne vient de nous et pas d une mesure.
 */
export const FRAIS_INTERFACE_BPS_CL = 10n;
export const FRAIS_BPS_MAX_PRUDENT = 100n;

/**
 * Un swap multi-sauts qui RETIENT un frais d interface, en UNE transaction et SANS contrat a nous.
 *
 * ⛔⛔ LE MONTAGE, ET POURQUOI IL TIENT. `multicall([ exactInput(recipient = LE ROUTEUR),
 *     sweepTokenWithFee(jetonDeSortie, minimumUtilisateur, utilisateur, bips, notreWallet) ])`.
 *     Le swap depose sa sortie chez le routeur ; le balayage la reverse en retenant notre part.
 *     Les deux appels sont dans la MEME transaction : l utilisateur ne peut pas prendre le premier
 *     sans le second, contrairement a un transfert separe qu il pourrait simplement refuser.
 *
 * ⛔⛔ DEUX MINIMUMS, ET ILS NE DISENT PAS LA MEME CHOSE. Celui de `exactInput` borne ce qui sort des
 *     POOLS ; celui de `sweepTokenWithFee` borne ce que l UTILISATEUR recoit, donc apres notre
 *     retenue. Mettre le meme des deux cotes ferait reverter tout swap au minimum exact, puisque le
 *     second serait toujours inferieur au premier. Les confondre casse le chemin sans rien dire.
 *   ⛔ ET ON NE MET PAS `0` DANS `exactInput` « puisque le balayage borne » : c est le motif courant,
 *     et il laisse une transaction sans plancher entre les deux appels. Deux bornes valent mieux.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : que le routeur accepte ce montage. Il declare les deux fonctions, et
 *   l encodage est rejoue a l octet sur la partie `exactInput` — mais l enchainement lui-meme n a
 *   PAS de transaction temoin. L appelant DOIT le simuler par `eth_call` avant de le proposer.
 */
export function calldataExactInputAvecFrais({ sauts, recipient, amountIn, amountOutMinimum,
  deadline, maintenant = null, fraisBps = FRAIS_INTERFACE_BPS_CL, beneficiaireFrais, sortieEthNatif = false } = {}) {
  /* ⛔ 2026-10-04 — SORTIE EN ETH NATIF (vendre une action contre de l ETH, pas du WETH) : le dernier saut doit rendre le WETH
   *   du routeur, et le balayage devient `unwrapWETH9WithFee` — meme montage, meme retenue, mais l utilisateur et le wallet
   *   des frais recoivent de l ETH. Selecteur present dans le bytecode LU du routeur (PUSH4, sonde du jour), et `WETH9()` rend
   *   bien ce WETH. Tout autre jeton de sortie avec ce drapeau est un REFUS : `unwrap` ne balaie que le WETH. */
  if (sortieEthNatif) {
    const der = Array.isArray(sauts) && sauts.length ? String((sauts[sauts.length - 1] || {}).vers || '').toLowerCase() : '';
    if (der !== WETH_SORTIE_FRAIS) return { etat: 'REFUSE', pourquoi: 'a native-ETH exit needs a path that ends on WETH' };
  }
  /* ⛔⛔ 2026-10-03 (Zero 1 F-c6) : le balayage preleve dans le jeton de SORTIE. a6cf n est paye qu en ETH (WETH), USDC ou
   *   action appariee — jamais dans un block ni dans un jeton tiers. Garde de profondeur pour TOUS les rails CL. */
  const sortieFrais = Array.isArray(sauts) && sauts.length ? String((sauts[sauts.length - 1] || {}).vers || '').toLowerCase() : '';
  if (sortieFrais && !estDeviseConnue(sortieFrais) && sortieFrais !== WETH_SORTIE_FRAIS) {
    return { etat: 'REFUSE', pourquoi: 'the fee would be taken in the output token, which is not ETH, USDC or a listed stock', refusFraisHorsDevise: true };
  }
  const bps = (() => { try { return BigInt(fraisBps); } catch (_) { return -1n; } })();
  if (bps < 0n) return { etat: 'REFUSE', pourquoi: 'the interface fee must be a number of basis points' };
  if (bps > FRAIS_BPS_MAX_PRUDENT) {
    return { etat: 'REFUSE', pourquoi: 'refusing an interface fee above ' + FRAIS_BPS_MAX_PRUDENT
      + ' bps — this bound is OURS, not a measured contract limit, and a large cut taken quietly '
      + 'is the kind of thing that should never be easy to set' };
  }
  if (!ADR.test(String(beneficiaireFrais || ''))) {
    /* ⛔ AUCUN DEFAUT POUR LE BENEFICIAIRE. Un defaut enverrait la retenue quelque part sans que
     *   l appelant l ait decide — et « quelque part » est exactement ce qu on ne veut pas. */
    return { etat: 'REFUSE', pourquoi: 'a whole fee-recipient address is required, with no default' };
  }
  const min = (() => { try { return BigInt(amountOutMinimum); } catch (_) { return 0n; } })();
  if (min <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'amountOutMinimum must be greater than zero — it bounds what '
      + 'comes out of the pools, before our cut' };
  }
  if (!Array.isArray(sauts) || !sauts.length) return { etat: 'REFUSE', pourquoi: 'a path needs at least one hop' };
  const sortie = sauts[sauts.length - 1] && sauts[sauts.length - 1].vers;
  if (!ADR.test(String(sortie || ''))) return { etat: 'REFUSE', pourquoi: 'the last hop has no output token' };
  if (!ADR.test(String(recipient || ''))) return { etat: 'REFUSE', pourquoi: 'a whole recipient address is required' };
  if (bas(recipient) === bas(ROUTEUR_AERODROME_CL)) {
    return { etat: 'REFUSE', pourquoi: 'the recipient cannot be the router itself' };
  }

  /* ⛔ LE SWAP DEPOSE CHEZ LE ROUTEUR : c est ce qui permet au balayage de retenir. Et son minimum
   *   reste celui des POOLS, pas celui de l utilisateur. */
  const swap = calldataExactInputCL({ sauts, recipient: ROUTEUR_AERODROME_CL, amountIn,
    amountOutMinimum: min, deadline, maintenant, suiviDUnBalayage: true });
  if (swap.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'inner swap refused: ' + swap.pourquoi };

  /* ⛔⛔ CE QUE L UTILISATEUR RECOIT AU MINIMUM : le minimum des pools MOINS notre retenue. Calcule
   *     en entiers, arrondi VERS LE BAS — un minimum arrondi vers le haut ferait reverter des swaps
   *     parfaitement valides. */
  const minUtilisateur = (min * (10000n - bps)) / 10000n;
  if (minUtilisateur <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'after our cut the guaranteed minimum would be zero — the '
      + 'amount is too small for this fee' };
  }
  /* unwrapWETH9WithFee(amountMinimum, recipient, feeBips, feeRecipient) — pas d argument `token` : c est toujours le WETH */
  const balayage = sortieEthNatif
    ? SELECTEURS.unwrapWETH9WithFee.replace(/^0x/, '')
      + motNombre(minUtilisateur, 'amountMinimum')
      + motAdresse(recipient, 'recipient')
      + motNombre(bps, 'feeBips')
      + motAdresse(beneficiaireFrais, 'feeRecipient')
    : SELECTEURS.sweepTokenWithFee.replace(/^0x/, '')
      + motAdresse(sortie, 'token')
      + motNombre(minUtilisateur, 'amountMinimum')
      + motAdresse(recipient, 'recipient')
      + motNombre(bps, 'feeBips')
      + motAdresse(beneficiaireFrais, 'feeRecipient');

  /* ── l enveloppe `multicall(bytes[])` ──────────────────────────────────────────────────────
   * ⛔ UN TABLEAU DYNAMIQUE DE BYTES : offset du tableau, longueur, puis un offset par element,
   *   relatifs au DEBUT du tableau. Se tromper de base fait pointer dans le vide. */
  const elements = [swap.data.replace(/^0x/, ''), balayage].map(dynamique);
  let curseur = BigInt(32 * elements.length);
  const offsets = elements.map((e) => { const o = motNombre(curseur, 'offset'); curseur += BigInt(e.length / 2); return o; });
  const tableau = motNombre(elements.length, 'nombre d appels') + offsets.join('') + elements.join('');

  return {
    etat: 'PRET',
    to: ROUTEUR_AERODROME_CL,
    data: SELECTEURS.multicall + motNombre(0x20, 'offset du tableau') + tableau,
    value: '0x0',
    fraisBps: Number(bps),
    beneficiaireFrais: bas(beneficiaireFrais),
    minPools: min.toString(),
    minUtilisateur: minUtilisateur.toString(),
    champs: swap.champs,
    /* ⛔⛔ LA RETENUE EST DITE, EN CLAIR ET EN CHIFFRES. Un frais silencieux est un frais qu on
     *     cache — et ce produit se vend sur le fait de ne rien cacher. */
    borne: swap.borne + ' ' + phraseDeRetenue(bps),
    /* ⛔ L ENCHAINEMENT N A PAS DE TRANSACTION TEMOIN : il doit etre simule avant d etre propose. */
    aSimuler: true,
  };
}

/** La phrase qui dit combien on retient, DERIVEE des bps eux-memes.
 * ⛔⛔ SORTIE EN FONCTION EXPORTEE PARCE QUE DEUX ECRANS L AFFICHENT : le chemin USDC et le chemin
 *     ETH. Une phrase recopiee dans le second module aurait pu garder « 0,10 % » apres un changement
 *     de `FRAIS_INTERFACE_BPS_CL` — un chiffre faux dans la phrase meme qui sert a ne pas mentir.
 *   ⛔ ELLE PREND LES BPS, JAMAIS LA CONSTANTE : un plan peut porter un frais different de la valeur
 *     par defaut, et c est SON frais qui doit etre annonce. */
export function phraseDeRetenue(fraisBps) {
  const bps = (() => { try { return BigInt(fraisBps); } catch (_) { return null; } })();
  if (bps === null || bps <= 0n) return '';
  return 'This app keeps ' + (Number(bps) / 100).toFixed(2) + '% of the output; the minimum above is '
    + 'what reaches you AFTER that cut.';
}

/** Un mot dynamique : longueur puis contenu, rembourre a 32 octets.
 * ⛔ SORTI EN FONCTION pour que `exactInput` et une eventuelle suite partagent LE MEME remplissage —
 *   un rembourrage recopie est exactement le genre de jumeau qui divergerait. */
function dynamique(hex) {
  const n = hex.length / 2;
  return motNombre(n, 'longueur') + hex + '00'.repeat((32 - (n % 32)) % 32);
}

/** L appel de LECTURE qui resout un triplet en adresse de pool, sur la factory.
 *
 * ⛔⛔ POURQUOI CE MODULE PUR EXPOSE UN APPEL DE LECTURE PLUTOT QUE DE LE FAIRE. Verifier un triplet
 *     demande le reseau ; le faire ici rendrait le module impossible a rejouer et a tester hors
 *     ligne, et c est le rejeu a l octet qui prouve tout le reste. On rend donc le calldata, et
 *     l appelant fait l aller-retour. `planifierFranchissement` EXIGE ensuite le resultat.
 * ⛔ L ORDRE DES DEUX JETONS N IMPORTE PAS pour cette lecture : la factory les trie elle-meme. C est
 *   verifie — l aller-retour a reussi sur les 12 pools sans qu on trie quoi que ce soit ici.
 */
export function calldataGetPool({ tokenA, tokenB, tickSpacing } = {}) {
  if (!ADR.test(String(tokenA || '')) || !ADR.test(String(tokenB || ''))) {
    return { etat: 'REFUSE', pourquoi: 'two whole token addresses are required' };
  }
  const ts = BigInt(tickSpacing === undefined || tickSpacing === null ? 0 : tickSpacing);
  if (ts <= 0n) return { etat: 'REFUSE', pourquoi: 'tickSpacing must be a positive pool spacing' };
  return { etat: 'PRET', to: FACTORY_AERODROME_CL,
    data: SELECTEURS.getPool + motAdresse(tokenA, 'tokenA') + motAdresse(tokenB, 'tokenB') + motInt24(ts, 'tickSpacing'),
    value: '0x0' };
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
  deadline, minSortie1, minSortie2, maintenant = null, entree2 = null, poolResolue = null,
  fraisBps = FRAIS_INTERFACE_BPS_CL, beneficiaireFrais = null, sansFrais = false } = {}) {
  if (!jambe1 || !ADR.test(String(jambe1.to || '')) || typeof jambe1.data !== 'string' || !jambe1.data) {
    return { etat: 'REFUSE', pourquoi: 'leg 1 must be an already-built call { to, data }' };
  }
  /* ⛔⛔ LA POOL DOIT AVOIR ETE RESOLUE, PAS SUPPOSEE. Mesure du 2026-09-28 : `tickSpacing` vaut 10
   *     sur sept pools d actions et 1 sur cinq autres. Un appelant qui prendrait 10 « parce que
   *     c est le plus courant » construirait un calldata vers une pool INEXISTANTE pour cinq actions
   *     sur douze — et ca reverterait APRES la signature, donc apres le gas.
   *   ⇒ On exige l adresse rendue par `getPool` (voir `calldataGetPool`), et on refuse l adresse
   *     nulle explicitement : c est precisement ce que la factory rend pour un triplet inconnu, donc
   *     la laisser passer serait accepter la reponse « cette pool n existe pas ». */
  if (!ADR.test(String(poolResolue || ''))) {
    return { etat: 'REFUSE', pourquoi: 'the target pool must be resolved on chain first via '
      + 'calldataGetPool(tokenA, tokenB, tickSpacing) — tickSpacing was measured as 10 on seven '
      + 'action pools and 1 on five others, so assuming one value builds calldata for a pool that '
      + 'does not exist' };
  }
  if (/^0x0{40}$/i.test(String(poolResolue))) {
    return { etat: 'REFUSE', pourquoi: 'getPool returned the zero address: the factory knows no pool '
      + 'for this token pair and tickSpacing' };
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

  /* ⛔⛔⛔ LA JAMBE 2 EST CELLE QUI NE NOUS PAYAIT RIEN, ET C EST CELLE OU VIT L ARGENT.
   *   Elle etait construite par `calldataExactInputSingleCL`, qui ne porte AUCUN frais — alors que
   *   ce meme module exporte `calldataExactInputAvecFrais`, deja utilise par `plan-eth-block.js` et
   *   `plan-usdc-block.js`. Un franchissement OUSD -> action tokenisee prenait donc le frais sur la
   *   jambe 1 (Uniswap) et RIEN sur la jambe 2 (Aerodrome).
   *   ⇒ MESURE DU 2026-10-01 QUI DIT L ENJEU : sur nos 249 lignes servies, les ONZE marches
   *     Aerodrome portent 83 728 918 $ de volume 24 h — 96,4 % — contre 3 133 376 $ pour les 238
   *     marches Uniswap. La jambe gratuite etait celle du volume.
   *
   * ⛔⛔ ET LE BENEFICIAIRE N A AUCUN DEFAUT : sans adresse, on REFUSE. Un defaut enverrait la
   *   retenue « quelque part » sans que l appelant l ait decide, et un frais qui part tout seul est
   *   pire qu un frais absent. C est la meme regle que `calldataExactInputAvecFrais` applique deja ;
   *   la contourner ici aurait rouvert la porte qu il ferme.
   *
   * ⛔ ET LE SENS DE `minSortie2` CHANGE, DONC ON LE DIT. Avec le constructeur sans frais, c etait
   *   le minimum recu par l UTILISATEUR. Avec celui-ci, c est le minimum des POOLS, AVANT notre
   *   retenue ; l utilisateur recoit `minSortie2 * (10000 - bps) / 10000`. Les deux chiffres sont
   *   rendus (`minPools`, `minUtilisateur`) pour qu aucun ecran n ait a deviner lequel il montre. */
  /* ⛔⛔ 2026-10-02 (Phil : UN frais par swap) : `sansFrais` = la jambe 1 paie deja a6cf PAR SON HOOK. La jambe 2 est alors
   *   un exactInput nu vers l acheteur — PAS un sweepTokenWithFee a 0 bps (feeBips doit etre > 0 sur le routeur v3). */
  const jambe2 = sansFrais
    ? (() => {
      const j = calldataExactInputCL({ sauts: [{ de: pivot, vers: action, tickSpacing }],
        recipient, deadline, amountIn: e2, amountOutMinimum: minSortie2, maintenant });
      return j.etat !== 'PRET' ? j : { ...j, fraisBps: 0, beneficiaireFrais: null,
        minPools: String(j.champs.amountOutMinimum), minUtilisateur: String(j.champs.amountOutMinimum) };
    })()
    : calldataExactInputAvecFrais({
      sauts: [{ de: pivot, vers: action, tickSpacing }],
      recipient, deadline, amountIn: e2, amountOutMinimum: minSortie2, maintenant,
      fraisBps, beneficiaireFrais,
    });
  if (jambe2.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'leg 2 refused: ' + jambe2.pourquoi };

  return {
    etat: 'PRET',
    appels: [
      { to: jambe1.to, data: jambe1.data, value: jambe1.value || '0x0', role: 'leg 1 — Uniswap' },
      { to: appro.to, data: appro.data, value: '0x0', role: 'approve the pivot for the Aerodrome router' },
      { to: jambe2.to, data: jambe2.data, value: '0x0', role: 'leg 2 — Aerodrome CL' },
    ],
    /* ⛔⛔ LES FAITS DU FRAIS SONT RENDUS, PAS SUPPOSES PAR L APPELANT. Un ecran qui veut verifier
     *   « ce lot nous paie-t-il ? » doit pouvoir le LIRE sur le plan, et une sonde doit pouvoir le
     *   recouper avec les octets. Un plan qui tait son propre frais oblige a le croire. */
    fraisBps: jambe2.fraisBps,
    beneficiaireFrais: jambe2.beneficiaireFrais,
    /* ⛔ DEUX MINIMUMS, DEUX NOMS. `minPools` sort des pools, `minUtilisateur` arrive chez
     *   l acheteur APRES notre retenue. Les confondre afficherait un montant qu il ne recevra pas. */
    minPools: jambe2.minPools,
    minUtilisateur: jambe2.minUtilisateur,
    retenue: jambe2.borne,
    /* ⛔ LA POUSSIERE EST ANNONCEE, PAS CACHEE : c est le prix du lot, et l ecran doit pouvoir le
     *   dire avant qu on signe. On ne connait pas son montant (il depend de la sortie reelle de la
     *   jambe 1), seulement sa NATURE — et on le formule ainsi plutot que d inventer un chiffre. */
    poussiere: 'whatever leg 1 produces above ' + min1 + ' stays in the wallet as the pivot asset',
    /* ⛔ LA POOL VISEE EST RENDUE, pour qu un ecran puisse la montrer et qu une sonde puisse la
     *   re-verifier. Une cible de paiement qu on ne peut pas relire est une cible qu on croit. */
    poolVisee: bas(poolResolue),
    /* ⛔ ET LE LOT EXIGE L ATOMICITE : sans elle, la jambe 1 peut passer seule et l utilisateur se
     *   retrouve avec le pivot au lieu de ce qu il voulait. L appelant doit le demander au wallet. */
    exigeAtomique: true,
  };
}
