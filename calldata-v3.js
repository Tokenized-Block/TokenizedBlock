/* calldata-v3.js — LA JAMBE UNISWAP v3, PAR LE ROUTEUR QU ON DEPLOIE DEJA.
 *
 * ⛔⛔ CE MODULE NE SIGNE RIEN ET N ENVOIE RIEN. Il rend `{ to, data, value }`. Un wallet humain
 *     execute. Aucun reseau, aucune horloge : tout ce qui varie entre par parametre, pour que le
 *     module soit rejouable a l octet. Une garde de ce fichier le verifie.
 *
 * ⛔⛔ POURQUOI IL EXISTE, ET POURQUOI IL EST LE MOINS CHER DES TROIS CHEMINS. Mesure du 2026-09-27
 *     sur les 156 blocks de /api/trending a >= 500 $ :
 *         141 blocks  pool Uniswap v4   -> notre calldata les sert deja
 *           3 blocks  pool Uniswap v3   ->  82 565 $, LE ROUTEUR Y ARRIVE, notre calldata non
 *          12 blocks  pool Aerodrome    -> 12,10 M$, franchissement de familles necessaire
 *     Les trois blocks v3 mesures : Micron 0xb200000000000000000000fd2f87532b90095211 (44 029 $),
 *     Amazon 0xb200000000000000000000d9192b6b456483c2e8 (7 942 $), SpaceX
 *     0xb2000000000000000000007b9fcbd005511acbd5 (26 313 $) — tous cotes en USDC.
 *   ⇒ Cette jambe bat l autre sur trois axes : UNE seule transaction, AUCUN contrat, et elle marche
 *     pour TOUS les wallets — y compris les EOA, la ou le lot atomique exige un smart wallet.
 *     Et c est une brique PARTAGEE : la jambe 1 d un franchissement est justement un swap Uniswap.
 *
 * ⛔⛔ TOUT CE QUI SUIT EST MESURE SUR LA CHAINE, RIEN N EST RECITE.
 *   Le routeur declare `execute(bytes,bytes[])` 0x24856bc3 et `execute(bytes,bytes[],uint256)`
 *   0x3593564c — selecteurs lus dans son bytecode (19 499 octets), methode validee par deux temoins
 *   positifs presents (factory Uniswap v3 0x33128a8f…, PoolManager v4 0x498581ff…) et 0/6 signatures
 *   inventees trouvees par hasard.
 *
 *   L OCTET DE COMMANDE D UN SWAP v3 EXACT-IN EST `0x00`, et il est mesure par CROISEMENT :
 *   present dans les DIX transactions ou le routeur etait le `sender` d un `Swap` v3, et ABSENT du
 *   temoin sans swap v3. ⛔ Temoin supplementaire : `0x10` — que notre `pool.js` utilise deja comme
 *   swap v4 — NE ressort PAS comme candidat, donc la methode ne designe pas n importe quoi.
 *
 *   LA DISPOSITION DE SON INPUT est decodee sur une transaction REUSSIE (`status 0x1`), 548 octets,
 *   0x924856e262744415ea93aaf2782faa04e639330874d1fbe6b851bdb3c2f13bfe :
 *       (address recipient, uint256 amountIn, uint256 amountOutMinimum, bytes path, bool payerIsUser)
 *   ⛔ ET LA STRUCTURE SE REFERME SUR ELLE-MEME, c est ca qui la prouve : l offset vers `path` valait
 *     160, soit EXACTEMENT les cinq mots de tete. Le path faisait 66 octets = 20 + 3 + 20 + 3 + 20,
 *     reconstruit octet par octet en 0xf308…3d67 / fee 0x000bb8 / WETH / fee 0x000bb8 / USDC.
 *   ⛔ LE `fee` TIENT SUR TROIS OCTETS (`uint24`), PAS SUR UN `tickSpacing`. C est la difference
 *     exacte avec Aerodrome Slipstream, ou le meme champ est un `int24 tickSpacing` — confondre les
 *     deux designerait une pool inexistante.
 *
 * ⚠️ CE QUE CE MODULE NE PROUVE PAS : qu un swap aboutisse. Le glissement, la profondeur au bloc et
 *   les frais de chaque saut ne sont pas simules. Un `fee` qui ne correspond a aucune pool fait
 *   reverter a l execution, pas ici.
 */

/* ⛔ UNE SEULE DEFINITION DES HELPERS D ENCODAGE, IMPORTEE. Les recopier ici ferait une deuxieme
 *   copie de `dyn` — celle qui remplit a 32 octets — alors que `pool.js` porte DEJA deux corrections
 *   d offset payees en production. Une copie plus faible rejouerait ces bugs en silence. */
import { selecteur, mot, motAdr, dyn } from './pool.js';

/** L Universal Router, par chaine. ⛔ RECOPIE DE `echange.js`, et un test compare les deux :
 *  deux adresses de routeur qui divergent enverraient de l argent a un contrat different. */
export const ROUTEUR_UNIVERSEL = Object.freeze({ 8453: '0x6ff5693b99212DA76aD316178A184AB56D299b43' });

/** ⛔ MESURE, PAS RECITE : voir l en-tete. `0x00` = swap v3 exact-in, `0x10` = swap v4 (pool.js). */
export const COMMANDE_V3_SWAP_EXACT_IN = '00';

const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (a) => String(a || '').toLowerCase();

/**
 * Le `path` d un swap v3 : jeton, puis (fee, jeton) repete.
 *
 * ⛔⛔ LE `fee` EST UN `uint24` SUR TROIS OCTETS, ET C EST LA OU UNE ERREUR SE PAIE. Mesure :
 *     `000bb8` = 3 000 dans la transaction temoin. Sur Aerodrome le meme emplacement porte un
 *     `int24 tickSpacing` (10 ou 1 selon la pool) — mettre l un pour l autre designe une pool qui
 *     n existe pas, et la transaction reverte APRES la signature.
 * ⚠️ CE QUE CETTE FONCTION NE VERIFIE PAS : que la pool (jetonA, fee, jetonB) existe. Elle encode.
 */
export function encoderChemin(sauts) {
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
    /* ⛔ LES SAUTS DOIVENT SE CHAINER : la sortie de l un est l entree du suivant. Un maillon qui ne
     *   se raccorde pas produirait un `path` accepte par l encodeur et refuse par la chaine. */
    if (precedent !== null && precedent !== de) {
      return { etat: 'REFUSE', pourquoi: 'hop ' + i + ' starts at ' + de + ' but hop ' + (i - 1)
        + ' ended at ' + precedent + ': the path does not chain' };
    }
    const f = BigInt(s.fee === undefined || s.fee === null ? -1 : s.fee);
    /* ⛔ UN `fee` NEGATIF OU HORS uint24 EST REFUSE ICI. Le glisser dans trois octets le tronquerait
     *   en silence — un nombre faux dans une transaction valide, le pire des deux mondes. */
    if (f < 0n || f >= (1n << 24n)) {
      return { etat: 'REFUSE', pourquoi: 'hop ' + i + ' needs a fee that fits in a uint24 (three bytes)' };
    }
    if (i === 0) hex += de.replace(/^0x/, '');
    hex += f.toString(16).padStart(6, '0') + vers.replace(/^0x/, '');
    precedent = vers;
  }
  /* ⛔ LA LONGUEUR EST VERIFIEE, PAS SUPPOSEE : 20 + 23 par saut. Le temoin mesure faisait 66 octets
   *   pour deux sauts (20 + 23 + 23), et cette egalite est la seule chose qui prouve l encodage. */
  const attendue = 20 + 23 * sauts.length;
  if (hex.length / 2 !== attendue) {
    return { etat: 'REFUSE', pourquoi: 'internal: path is ' + (hex.length / 2) + ' bytes, expected ' + attendue };
  }
  return { etat: 'PRET', hex, octets: attendue,
    entree: bas(sauts[0].de), sortie: bas(sauts[sauts.length - 1].vers) };
}

/**
 * Un swap v3 exact-in, en UNE transaction, par l Universal Router.
 *
 * @param {object} p
 * @param {object[]} p.sauts   [{ de, vers, fee }] — au moins un
 * @param {string} p.recipient
 * @param {bigint|string|number} p.amountIn
 * @param {bigint|string|number} p.amountOutMinimum  ⛔ OBLIGATOIRE et > 0
 * @param {bigint|string|number} p.deadline          instant ABSOLU, en secondes
 * @param {boolean} p.payerIsUser  ⛔ EXPLICITE : voir le refus ci-dessous
 * @param {bigint|string|number} [p.maintenant]  instant de reference, pour juger le deadline
 * @param {number} [p.chaine]
 */
export function calldataV3ExactIn({ sauts, recipient, amountIn, amountOutMinimum, deadline,
  payerIsUser, maintenant = null, chaine = 8453 } = {}) {
  const R = ROUTEUR_UNIVERSEL[Number(chaine)];
  if (!R) return { etat: 'REFUSE', pourquoi: 'no Universal Router measured on this network' };

  /* ⛔⛔ LE REFUS LE PLUS IMPORTANT : `amountOutMinimum` DOIT ETRE > 0. Un minimum a zero autorise la
   *     pool a rendre presque rien pour la totalite de l entree — un cadeau ouvert a quiconque
   *     regarde la mempool. Beaucoup d exemples publics mettent 0 « pour tester ». */
  const min = BigInt(amountOutMinimum === undefined || amountOutMinimum === null ? 0 : amountOutMinimum);
  if (min <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'amountOutMinimum must be greater than zero — a zero minimum '
      + 'lets the pool return almost nothing for the whole input' };
  }
  const entree = BigInt(amountIn === undefined || amountIn === null ? 0 : amountIn);
  if (entree <= 0n) return { etat: 'REFUSE', pourquoi: 'amountIn must be greater than zero' };

  if (!ADR.test(String(recipient || ''))) {
    return { etat: 'REFUSE', pourquoi: 'a whole recipient address is required' };
  }
  if (/^0x0{40}$/i.test(String(recipient))) {
    return { etat: 'REFUSE', pourquoi: 'the recipient cannot be the zero address' };
  }
  /* ⛔⛔ LE ROUTEUR COMME DESTINATAIRE EST UN PIEGE REEL, PAS THEORIQUE : il accepte d etre
   *     destinataire pour chainer des commandes, donc l y mettre par erreur laisse la sortie chez
   *     lui sans aucune erreur. On refuse, et on le nomme. */
  if (bas(recipient) === bas(R)) {
    return { etat: 'REFUSE', pourquoi: 'the recipient cannot be the router itself: it accepts being '
      + 'the recipient to chain commands, so the output would silently stay there' };
  }

  /* ⛔⛔ `payerIsUser` EST EXIGE EXPLICITEMENT, SANS DEFAUT. `false` veut dire « paie depuis le solde
   *     du routeur » — correct au milieu d une chaine de commandes, FAUX pour un swap d utilisateur,
   *     et l erreur ne produit pas un revert parlant. Un defaut confortable ici finirait en prod. */
  if (typeof payerIsUser !== 'boolean') {
    return { etat: 'REFUSE', pourquoi: 'payerIsUser must be given explicitly: false means "pay from '
      + 'the router balance", which is right mid-chain and wrong for a user swap' };
  }

  const dl = BigInt(deadline === undefined || deadline === null ? 0 : deadline);
  if (dl <= 0n) return { etat: 'REFUSE', pourquoi: 'an absolute deadline in seconds is required' };
  /* ⛔ LE DEADLINE EST JUGE CONTRE UN INSTANT FOURNI, jamais contre l horloge de ce module : lire
   *   l heure ici rendrait le rejeu a l octet impossible, et c est lui qui prouve tout le reste. */
  let noteDeadline = 'not judged — no reference instant was given';
  if (maintenant !== null && maintenant !== undefined) {
    const now = BigInt(maintenant);
    if (dl <= now) return { etat: 'REFUSE', pourquoi: 'the deadline is already in the past' };
    if (dl - now > 1800n) {
      return { etat: 'REFUSE', pourquoi: 'the deadline is more than 30 minutes out; a far deadline '
        + 'stays executable long after the price has moved' };
    }
    noteDeadline = 'ok — ' + String(dl - now) + ' s ahead of the given instant';
  }

  const chemin = encoderChemin(sauts);
  if (chemin.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'path refused: ' + chemin.pourquoi };

  /* ── l input du swap, dans l ordre DECODE sur la transaction temoin ──
   * ⛔ Les cinq mots de tete, puis le `path` en zone dynamique. L offset vaut 5 x 32 = 160, et c est
   *   exactement ce que la transaction reelle portait — l egalite est la preuve. */
  const TETE = 5;
  const input0 = motAdr(recipient) + mot(entree) + mot(min) + mot(TETE * 32)
    + mot(payerIsUser ? 1 : 0) + dyn(chemin.hex);

  /* ── l enveloppe `execute(bytes,bytes[],uint256)`, la MEME que `pool.js` ──
   * ⛔ offCommands = 0x60 : trois mots de tete (offset, offset, deadline). offInputs suit la zone
   *   des commandes. Ces deux nombres sont exactement ceux de la transaction temoin. */
  const commands = dyn(COMMANDE_V3_SWAP_EXACT_IN);
  const offCommands = 0x60n;
  const offInputs = offCommands + BigInt(commands.length / 2);
  const data = '0x' + selecteur('execute(bytes,bytes[],uint256)')
    + mot(offCommands) + mot(offInputs) + mot(dl)
    + commands
    + mot(1) + mot(0x20) + dyn(input0);

  return {
    etat: 'PRET',
    to: R,
    data,
    /* ⛔ AUCUN ETHER : cette jambe echange deux ERC-20. Un swap qui PART de l ETH natif demanderait
     *   une commande d enveloppement en plus, et ce module ne la construit pas — il le dit plutot
     *   que de laisser croire qu il la couvre. */
    value: '0x0',
    champs: { recipient: bas(recipient), amountIn: String(entree), amountOutMinimum: String(min),
      deadline: String(dl), payerIsUser, cheminOctets: chemin.octets,
      entree: chemin.entree, sortie: chemin.sortie, sauts: sauts.length },
    noteDeadline,
  };
}
