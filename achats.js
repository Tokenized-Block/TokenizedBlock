// achats.js — qui a achete quel block, a quel prix. Lu sur la chaine, jamais devine.
// ================================================================================================
// ⛔ CE MODULE NOURRIT UN ECRAN QUI NOMME DES GENS. « Cette adresse a achete ce block a ce prix »
//    est une affirmation publique sur quelqu un. Chaque maillon doit donc etre PROUVE ou AVOUE :
//    un montant lu en flottant, un signe inverse ou un routeur pris pour l acheteur produiraient
//    une liste d apparence parfaite et fausse de bout en bout. Rien ici ne signe, rien n envoie.
//
// ⛔ QUATRE PIECES, QUATRE PIEGES :
//    1. `decoderSwap`      — int128 et int24 en complement a deux. Un montant negatif lu en non
//                            signe devient ~3,4e38 : pas une erreur, un chiffre absurde a l ecran.
//    2. `achatDepuisSwap`  — le SIGNE dit qui paie. Se tromper de convention transforme chaque
//                            achat en vente, et la liste reste parfaitement plausible.
//    3. `acheteurReel`     — `sender` du Swap est le ROUTEUR. L acheteur est `tx.from`, lu dans la
//                            transaction. UN EVENEMENT N EST PAS UNE TRANSACTION.
//    4. `listerAchats`     — fenetres <= 2000 blocs ; une fenetre RATEE n est pas une fenetre VIDE.
//
// ⛔⛔ LA CONVENTION DE SIGNE, ET D OU VIENT SA PREUVE.
//    En v4, amount0/amount1 du Swap sont vus du SWAPPER : NEGATIF = ce qu il VERSE a la pool,
//    POSITIF = ce qu il en RECOIT. (C est l inverse de v3, ou le signe etait vu de la pool — c est
//    exactement le genre de souvenir qu on ne recopie pas.)
//    PREUVE MESUREE le 2026-09-11, une lecture `eth_getTransactionReceipt` sur mainnet.base.org,
//    sur la transaction de swap deja consignee dans `verifie-swap-passe.mjs` (constante HASH) :
//      · le log Swap est emis par le PoolManager que nomme index.html (reseau 8453, `poolm`), et
//        son topics[1] vaut `poolId(cleDePool(WETH, BLOCK0))` — c est bien NOTRE pool ;
//      · amount1 (le block, currency1) = −200 436 811 106 541, et le recu contient un Transfer du
//        block TRADER -> PoolManager de 200 436 811 106 541 exactement : NEGATIF = VERSE ;
//      · amount0 (WETH, currency0) = +199 701 564 772, et le recu contient un Transfer WETH
//        PoolManager -> TRADER de 199 701 564 772 exactement : POSITIF = RECU.
//    Deux temoins independants (l evenement de la pool, les Transfer des jetons), les deux signes
//    observes, egalite a l unite. Cette fixture est rejouee dans `test-achats.mjs`.
//    ⚠️ CE QUE CETTE PREUVE NE COUVRE PAS : une pool en ETH NATIF (aucun Transfer a recouper), un
//       swap « exact output ». Un seul swap observe, dans un seul sens (une vente). La convention
//       est la meme pour les deux sens — c est un signe par jeton — mais un ACHAT reel n a pas
//       encore ete recoupe de la meme facon.
//
// ⛔⛔ LES POOLS A HOOK : CE QUI A CHANGE LE 2026-09-20. Cette entete disait « une pool a HOOK prend
//    sa part par delta (le Swap dit alors ce que la POOL a echange, pas forcement ce que le trader a
//    paye) », et l app en avait tire une regle trop large : ne RIEN classer sur une pool a hook.
//    Mesure du jour en prod : 118 pools sur 118 portent un hook, donc AUCUN echange n etait classe —
//    « Feed » et « Kill » affichaient 0 pendant que « Swap » affichait 1 306.
//    Ce que dit la SOURCE d Uniswap v4 (lu, pas suppose) :
//      v4-core/src/PoolManager.sol:240 — « event is emitted before the afterSwap call to ensure
//      events are always emitted in order ».
//    Donc l evenement porte le delta du trader AVANT la part du hook. Un hook REDUIT un montant
//    recu de quelques pourcents ; il ne lui change PAS son signe.
//    ⇒ LE SENS (acheter / vendre) EST PROUVE, hook ou pas : c est `sensDuSwap`.
//    ⇒ LE MONTANT du cote non specifie est celui d AVANT le frais du marche. L appelant doit le dire
//      (`fraisMarche` dans fil-live.js) au lieu de se taire — se taire etait la vraie perte.
//
// ⚠️ LE CHAMP `fee` DU SWAP N EST PAS LE `fee` DE LA POOLKEY. Sur la meme transaction, le Swap
//    portait un fee DIFFERENT de celui de la cle qui a donne le bon poolId. On le rend tel quel,
//    et on ne s en sert JAMAIS pour reconstruire une cle : la cle se prend dans `cleDePool`.
import { topic } from './keccak.js';
import { poolId } from './pool.js';
import { FENETRE_MAX } from './index-blocks.js';
import { formaterUnites } from './montants.js';

/** ⛔ CALCULE par keccak.js depuis la signature, JAMAIS recite. Un topic faux ne plante pas : le
 *  noeud rend une liste VIDE, qu on lirait « personne n a achete ». */
export const SIGNATURE_SWAP = 'Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)';
export const TOPIC_SWAP = topic(SIGNATURE_SWAP);

const DEUX_256 = 1n << 256n;
const RE_MOT = /^[0-9a-f]{64}$/;
const RE_ADRESSE = /^0x[0-9a-f]{40}$/;
const RE_HASH32 = /^0x[0-9a-f]{64}$/;

/**
 * Lit un mot ABI de 32 octets comme un entier SIGNE de `bits` bits.
 * ⛔ STRICT, PAS TOLERANT. L ABI etend le signe sur les 256 bits : un int128 negatif arrive avec
 *    ses 128 bits de tete a 1. On lit donc le mot entier en int256, PUIS on exige qu il tienne dans
 *    int`bits`. Un mot qui ne tient pas n est pas « a peu pres » un int128 : c est un log mal forme,
 *    et masquer les bits de tete le transformerait en un montant plausible et faux.
 */
function signeStrict(mot, bits) {
  const v = BigInt('0x' + mot);
  const s = v >= (DEUX_256 >> 1n) ? v - DEUX_256 : v;
  const borne = 1n << BigInt(bits - 1);
  if (s < -borne || s >= borne) throw new Error('mot hors de int' + bits);
  return s;
}

/** Idem pour un entier NON signe : un uint160 dont les bits de tete sont a 1 est un log mal forme. */
function nonSigneStrict(mot, bits) {
  const v = BigInt('0x' + mot);
  if (v >= (1n << BigInt(bits))) throw new Error('mot hors de uint' + bits);
  return v;
}

const dormirParDefaut = (ms) => new Promise((r) => setTimeout(r, ms));

/** Quantite hex JSON-RPC -> Number, ou null. Un numero de bloc tient large dans 2^53. */
const numeroOuNull = (h) => (typeof h === 'string' && /^0x[0-9a-fA-F]+$/.test(h) ? parseInt(h, 16) : null);

/**
 * Decode un log `Swap` du PoolManager Uniswap v4.
 *   Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1,
 *        uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)
 * Rend `null` si ce n est PAS un Swap (topic0 different) — le decoder de force produirait des
 * montants de fantaisie a partir d octets qui n en sont pas.
 * ⛔ Rend `{ erreur }` si c EST un Swap mais qu il est mal forme : un log illisible se DIT, il ne se
 *    confond ni avec « pas un swap » ni avec un swap valide.
 * ⚠️ `sender` est le contrat qui a appele le PoolManager — en pratique le ROUTEUR. Ce n est PAS
 *    l acheteur ; voir `acheteurReel`.
 */
export function decoderSwap(log) {
  if (!log || !Array.isArray(log.topics) || typeof log.topics[0] !== 'string') return null;
  if (log.topics[0].toLowerCase() !== TOPIC_SWAP) return null;
  const txHash = typeof log.transactionHash === 'string' ? log.transactionHash.toLowerCase() : null;
  const blockNumber = numeroOuNull(log.blockNumber);
  const logIndex = numeroOuNull(log.logIndex);
  const lieu = { txHash, blockNumber, logIndex };
  try {
    const t1 = String(log.topics[1] ?? '').toLowerCase();
    const t2 = String(log.topics[2] ?? '').toLowerCase();
    if (log.topics.length !== 3 || !RE_HASH32.test(t1) || !RE_HASH32.test(t2)) {
      throw new Error('topics inattendus (' + log.topics.length + ')');
    }
    /* ⛔ Une adresse indexee occupe 32 octets dont les 12 premiers sont NULS. S ils ne le sont pas,
     * ce n est pas une adresse — et en garder les 20 derniers octets inventerait un emetteur. */
    if (!/^0x0{24}/.test(t2)) throw new Error('topic sender n est pas une adresse');
    const d = String(log.data ?? '').toLowerCase().replace(/^0x/, '');
    /* ⛔ EXACTEMENT SIX mots : les six champs NON indexes, tous statiques (id et sender sont dans
     * les topics). Plus court, on lirait des mots manquants comme des zeros ; plus long, ce n est
     * pas l evenement qu on croit.
     * ⚠️ La premiere version de ce fichier exigeait HUIT mots — elle comptait les deux champs
     *    indexes — et rejetait donc TOUS les vrais Swap comme illisibles. C est `test-achats.mjs`
     *    qui l a dit, pas la relecture ; la sonde du 2026-09-11, elle, lisait bien six mots. */
    if (d.length !== 6 * 64) throw new Error('data de ' + d.length / 2 + ' octets, 192 attendus');
    const mots = d.match(/.{64}/g);
    if (!mots.every((m) => RE_MOT.test(m))) throw new Error('data non hexadecimale');
    /* ⛔ L ORDRE DES MOTS EST CELUI DE LA SIGNATURE, et un decalage d un mot a deja ete commis ici :
     * « tick apres : 3000 » etait le `fee` (PREUVE-SWAP-2026-09-01.md). Tick = 7e champ = mots[4]. */
    return {
      poolId: t1,
      sender: '0x' + t2.slice(26),
      amount0: signeStrict(mots[0], 128),
      amount1: signeStrict(mots[1], 128),
      sqrtPriceX96: nonSigneStrict(mots[2], 160),
      liquidity: nonSigneStrict(mots[3], 128),
      tick: signeStrict(mots[4], 24),
      fee: nonSigneStrict(mots[5], 24),
      ...lieu,
    };
  } catch (e) {
    return { erreur: e.message, ...lieu };
  }
}

function pgcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
const decimalesValides = (n) => Number.isInteger(n) && n >= 0 && n <= 36;

/**
 * Traduit un Swap decode en ACHAT ou VENTE du block, avec quantites et prix EXACTS.
 * ================================================================================================
 * ⛔ LE SIGNE : NEGATIF = VERSE PAR LE SWAPPER, POSITIF = RECU (preuve en tete de fichier).
 *    ACHAT  : le block SORT de la pool vers le trader (montant block > 0) contre de la devise (< 0).
 *    VENTE  : le block ENTRE dans la pool (montant block < 0) contre de la devise (> 0).
 *    Toute autre combinaison (deux signes egaux, un zero) est INCOHERENTE — jamais classee au
 *    plus probable. Un « achat » devine sur un log bizarre est une affirmation sur quelqu un.
 *
 * ⛔ QUEL MONTANT EST LE BLOCK DEPEND DE L ORDRE DES ADRESSES, PAS DU ROLE : currency0 est la plus
 *    basse (`cleDePool`). La cle est donc exigee, et on verifie qu elle designe bien la pool du
 *    swap (poolId recalcule par `pool.js`) — une cle voisine inverserait silencieusement les roles.
 *
 * ⛔ AUCUN FLOTTANT. Le prix d un block entier en devise entiere est la fraction
 *      quantiteDevise * 10^decJeton / (quantiteBlock * 10^decDevise)
 *    rendue en { num, den } REDUITS. Le texte decimal passe par `formaterUnites` ; il est tronque,
 *    et `prixExact` dit s il l a ete — l ecran doit alors ecrire « ≈ », pas « = ».
 *
 * @param {object} p
 * @param {object} p.swap      sortie de `decoderSwap`
 * @param {object} p.cle       PoolKey { currency0, currency1, fee, tickSpacing, hooks }
 * @param {string} p.jeton     adresse du block
 * @param {number} p.decJeton  decimales du block, LUES sur la chaine
 * @param {number} p.decDevise decimales de la devise, LUES sur la chaine
 * @param {number} [p.chiffresEnPlus]  precision du texte de prix au-dela des decimales de la devise
 */
/**
 * Le SENS d un swap — acheter ou vendre le block — depuis les SEULS SIGNES des deltas.
 * ================================================================================================
 * ⛔ AUCUNE DECIMALE REQUISE, ET C EST LE POINT. Le sens est prouve par la chaine meme quand on ne
 *    sait pas formater les montants, et meme sur une pool a hook. C est ce qui manquait au fil Live,
 *    ou 1 306 echanges sur 1 306 s affichaient « traded » alors que la chaine dit qui a achete.
 * ⛔ POURQUOI UN HOOK NE CHANGE PAS LE SENS (verifie dans la source, pas suppose) :
 *    v4-core/src/PoolManager.sol:240 — « event is emitted before the afterSwap call ». L evenement
 *    porte le delta du trader AVANT la part du hook. Un hook REDUIT un montant recu ; il ne lui
 *    change pas son signe. Le sens tient donc ; le MONTANT du cote non specifie est celui d avant
 *    le frais du marche, et l appelant doit le dire (`fraisMarche`).
 * ⚠️ CE QU ELLE NE DIT PAS : qui a achete. Le `sender` du log est le ROUTEUR, jamais le trader.
 * @returns {{etat:'ACHAT'|'VENTE'|'SWAP_ILLISIBLE'|'HORS_POOL'|'AUTRE_POOL'|'INCOHERENT',
 *   raison?:string, quantiteBlock?:bigint, quantiteDevise?:bigint, blockEst0?:boolean}}
 */
export function sensDuSwap({ swap, cle, jeton }) {
  if (!swap || swap.erreur || typeof swap.amount0 !== 'bigint' || typeof swap.amount1 !== 'bigint') {
    return { etat: 'SWAP_ILLISIBLE', raison: swap && swap.erreur ? swap.erreur : 'no decoded swap' };
  }
  const c0 = String(cle?.currency0 ?? '').toLowerCase();
  const c1 = String(cle?.currency1 ?? '').toLowerCase();
  const j = String(jeton ?? '').toLowerCase();
  if (!RE_ADRESSE.test(j) || (j !== c0 && j !== c1)) {
    return { etat: 'HORS_POOL', raison: 'the block is neither currency0 nor currency1 of this pool key' };
  }
  let idCle;
  try { idCle = poolId(cle); } catch (e) { return { etat: 'HORS_POOL', raison: 'pool key unusable: ' + e.message }; }
  if (idCle !== swap.poolId) {
    return { etat: 'AUTRE_POOL', raison: 'this swap belongs to another pool than the given key' };
  }
  const blockEst0 = j === c0;
  const montantBlock = blockEst0 ? swap.amount0 : swap.amount1;
  const montantDevise = blockEst0 ? swap.amount1 : swap.amount0;
  let etat;
  if (montantBlock > 0n && montantDevise < 0n) etat = 'ACHAT';
  else if (montantBlock < 0n && montantDevise > 0n) etat = 'VENTE';
  else {
    return { etat: 'INCOHERENT',
      raison: 'block and quote amounts do not have opposite signs — not classified as a buy or a sell' };
  }
  return {
    etat, blockEst0,
    quantiteBlock: montantBlock < 0n ? -montantBlock : montantBlock,
    quantiteDevise: montantDevise < 0n ? -montantDevise : montantDevise,
  };
}

export function achatDepuisSwap({ swap, cle, jeton, decJeton, decDevise, chiffresEnPlus = 18 }) {
  if (!swap || swap.erreur || typeof swap.amount0 !== 'bigint' || typeof swap.amount1 !== 'bigint') {
    return { etat: 'SWAP_ILLISIBLE', raison: swap && swap.erreur ? swap.erreur : 'no decoded swap' };
  }
  if (!decimalesValides(decJeton) || !decimalesValides(decDevise) || !decimalesValides(chiffresEnPlus)) {
    return { etat: 'DECIMALES_INVALIDES', raison: 'decimals must be whole numbers between 0 and 36' };
  }
  /* ⛔ LE SENS VIENT DE `sensDuSwap`, JAMAIS RECALCULE ICI : une copie du meme test finit toujours
   *    par diverger de l original, et c est la copie qui reste affichee. */
  const sens = sensDuSwap({ swap, cle, jeton });
  if (sens.etat !== 'ACHAT' && sens.etat !== 'VENTE') return sens;
  const { etat, quantiteBlock, quantiteDevise, blockEst0 } = sens;
  /* La devise est le cote qui n est PAS le block — relu depuis la cle, jamais devine. */
  const deviseAdr = blockEst0 ? String(cle.currency1).toLowerCase() : String(cle.currency0).toLowerCase();

  const num0 = quantiteDevise * 10n ** BigInt(decJeton);
  const den0 = quantiteBlock * 10n ** BigInt(decDevise);
  const g = pgcd(num0, den0);
  /* Le texte : unites brutes de devise par block entier, avec `chiffresEnPlus` chiffres de plus
   * pour qu un block tres bon marche ne s affiche pas « 0 ». */
  const echelle = 10n ** BigInt(chiffresEnPlus);
  const brutPrix = (quantiteDevise * 10n ** BigInt(decJeton) * echelle) / quantiteBlock;
  const reste = (quantiteDevise * 10n ** BigInt(decJeton) * echelle) % quantiteBlock;
  return {
    etat,
    quantiteBlock,
    quantiteDevise,
    quantiteBlockTexte: formaterUnites(quantiteBlock, decJeton),
    quantiteDeviseTexte: formaterUnites(quantiteDevise, decDevise),
    prix: { num: num0 / g, den: den0 / g },
    prixTexte: formaterUnites(brutPrix, decDevise + chiffresEnPlus),
    prixExact: reste === 0n,
    devise: deviseAdr,
    /* ⛔ NOMME « routeur », PAS « acheteur ». C est le contrat qui a appele la pool. */
    routeur: swap.sender,
    txHash: swap.txHash,
    blockNumber: swap.blockNumber,
    logIndex: swap.logIndex,
  };
}

/**
 * L acheteur AFFICHE : `tx.from`, lu dans la transaction. Jamais `sender` du Swap.
 * ================================================================================================
 * ⛔ UN EVENEMENT N EST PAS UNE TRANSACTION. `sender` est le routeur ; l afficher comme acheteur
 *    attribuerait tous les achats de l app a un seul contrat. Seule la transaction dit qui a signe.
 * ⛔ DEUX ETATS, ET LE SECOND NE PORTE AUCUNE ADRESSE. Transaction illisible -> NON_LU, avec la
 *    raison. On ne rend PAS `sender` « a defaut » : une adresse de repli est une adresse devinee.
 * ⚠️ CE QUE `tx.from` NE DIT PAS : avec un portefeuille a abstraction de compte (ERC-4337),
 *    `tx.from` est le BUNDLER qui a soumis la transaction, pas le proprietaire du portefeuille.
 *    L ecran doit donc dire « signed by », pas « owned by ».
 * ⚠️ On reessaie les PANNES (exceptions : limite de debit, reseau) — pas une reponse « introuvable »,
 *    qui est stable. Meme doctrine que `createurDe` dans index-blocks.js.
 */
export async function acheteurReel({ rpc, txHash, essais = 3, attente = 350 }) {
  const h = String(txHash ?? '').toLowerCase();
  if (!RE_HASH32.test(h)) return { etat: 'NON_LU', raison: 'no valid transaction hash' };
  if (typeof rpc !== 'function') return { etat: 'NON_LU', raison: 'no RPC to read the transaction' };
  let derniere = null;
  for (let n = 0; n < essais; n++) {
    try {
      const t = await rpc('eth_getTransactionByHash', [h]);
      if (!t) return { etat: 'NON_LU', raison: 'transaction not found: not measured, not absent' };
      /* ⛔ Un noeud qui repond sur une AUTRE transaction ne nous apprend rien sur celle-ci. */
      if (typeof t.hash === 'string' && t.hash.toLowerCase() !== h) {
        return { etat: 'NON_LU', raison: 'the node answered about another transaction' };
      }
      const de = String(t.from ?? '').toLowerCase();
      if (!RE_ADRESSE.test(de)) return { etat: 'NON_LU', raison: 'transaction has no readable from' };
      return { etat: 'LU', acheteur: de };
    } catch (e) {
      derniere = e && e.message ? e.message : String(e);
      if (n < essais - 1 && attente > 0) await new Promise((r) => setTimeout(r, attente * (2 ** n)));
    }
  }
  return { etat: 'NON_LU', raison: derniere + ' (after ' + essais + ' tries)' };
}

/**
 * Les Swap de une ou plusieurs pools, par fenetres de blocs, du plus ancien au plus recent.
 * ================================================================================================
 * ⛔ FENETRES DE `FENETRE_MAX` BLOCS AU PLUS, BORNES INCLUSES, SANS CHEVAUCHEMENT. La limite de
 *    mainnet.base.org est mesuree (voir index-blocks.js). On compte ici `a - de + 1 <= FENETRE_MAX`,
 *    la lecture la plus stricte de « 2 000 blocs » : elle tient sous les deux interpretations
 *    possibles de la limite, et deux fenetres voisines ne partagent aucun bloc — un bloc lu deux
 *    fois compterait deux fois le meme achat.
 * ⛔ UNE FENETRE RATEE N EST PAS UNE FENETRE VIDE. Elle va dans `fenetresRatees`, nommee par ses
 *    bornes et sa cause. Une reponse qui n est pas un tableau est une fenetre ratee, pas « zero ».
 * ⛔ LE FILTRE DU NOEUD N EST PAS CRU SUR PAROLE. Un log qui n est pas un Swap, qui ne vient pas du
 *    PoolManager demande, ou d une pool non demandee, va dans `illisibles` — jamais dans `swaps`.
 * ⚠️ `pause` (ms) entre deux fenetres : le noeud public rend 429 sur une rafale.
 *
 * @param {object} p
 * @param {Function} p.rpc          (methode, params) => Promise<resultat> ; leve sur erreur
 * @param {string}   p.poolManager  adresse du PoolManager — PARAMETRE, jamais en dur ici
 * @param {string[]} p.poolIds      identifiants de pool (bytes32) a suivre
 * @param {number}   p.deBloc       premier bloc, inclus
 * @param {number}   p.aBloc        dernier bloc, inclus
 * @param {number}   [p.pause]      attente entre deux fenetres, en ms
 * @param {Function} [p.dormir]     injectable pour les tests
 */
export async function listerAchats({ rpc, poolManager, poolIds, deBloc, aBloc, pause = 0, dormir = null }) {
  /* ⚠️ Nomme par un `const` et pas appele directement : la regle 5 de verifie-coherence ne voit pas
   * un parametre destructure dont le defaut est une fleche, et le signalait comme nom inexistant. */
  const attendre = typeof dormir === 'function' ? dormir : dormirParDefaut;
  const refus = (cause) => ({ swaps: [], illisibles: [], fenetre: null, fenetres: 0,
    fenetresRatees: [{ de: null, a: null, cause }] });
  const pm = String(poolManager ?? '').toLowerCase();
  if (!RE_ADRESSE.test(pm)) return refus('invalid PoolManager address');
  if (!Array.isArray(poolIds) || poolIds.length === 0) return refus('no pool id to follow');
  const ids = poolIds.map((x) => String(x ?? '').toLowerCase());
  if (!ids.every((x) => RE_HASH32.test(x))) return refus('invalid pool id');
  if (!Number.isSafeInteger(deBloc) || !Number.isSafeInteger(aBloc) || deBloc < 0 || aBloc < deBloc) {
    return refus('invalid block range');
  }
  if (typeof rpc !== 'function') return refus('no RPC');
  const suivies = new Set(ids);
  const swaps = [], illisibles = [], fenetresRatees = [];
  let fenetres = 0;
  for (let de = deBloc; de <= aBloc; de += FENETRE_MAX) {
    const a = Math.min(aBloc, de + FENETRE_MAX - 1);
    if (fenetres > 0 && pause > 0) await attendre(pause);
    fenetres++;
    let logs;
    try {
      logs = await rpc('eth_getLogs', [{
        fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16),
        address: pm, topics: [TOPIC_SWAP, ids],
      }]);
    } catch (e) {
      fenetresRatees.push({ de, a, cause: e && e.message ? e.message : String(e) });
      continue;
    }
    if (!Array.isArray(logs)) {
      fenetresRatees.push({ de, a, cause: 'node answer is not a list of logs' });
      continue;
    }
    for (const l of logs) {
      const lieu = { txHash: l?.transactionHash ?? null, blockNumber: numeroOuNull(l?.blockNumber) };
      if (l && l.removed === true) { illisibles.push({ ...lieu, cause: 'log removed by a reorg' }); continue; }
      if (String(l?.address ?? '').toLowerCase() !== pm) {
        illisibles.push({ ...lieu, cause: 'log not emitted by the requested PoolManager' }); continue;
      }
      const s = decoderSwap(l);
      if (s === null) { illisibles.push({ ...lieu, cause: 'not a Swap log' }); continue; }
      if (s.erreur) { illisibles.push({ ...lieu, cause: s.erreur }); continue; }
      if (!suivies.has(s.poolId)) { illisibles.push({ ...lieu, cause: 'Swap of a pool that was not requested' }); continue; }
      swaps.push(s);
    }
  }
  swaps.sort((x, y) => ((x.blockNumber ?? 0) - (y.blockNumber ?? 0)) || ((x.logIndex ?? 0) - (y.logIndex ?? 0)));
  return { swaps, illisibles, fenetre: { de: deBloc, a: aBloc }, fenetres, fenetresRatees };
}
