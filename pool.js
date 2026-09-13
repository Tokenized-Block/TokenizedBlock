// pool.js — encoder la sequence de mise en liquidite d un block dans une pool Uniswap v4.
// ================================================================================================
// ⛔ MEME DISCIPLINE QUE POUR LA CREATION : ces octets sont compares OCTET POUR OCTET a ceux que
//    `base-forge` produit pour les memes parametres (`test-pool.mjs`, reference lue dans
//    l artefact de simulation contre l ETAT REEL de Base Sepolia). Un encodage « qui a l air bon »
//    ne se detecte pas seul : il reverte APRES le gaz, sur un message qui ne parle pas d encodage.
//
// ⛔ ET LA SEQUENCE COMPTE AUTANT QUE LES OCTETS. Six transactions, dans cet ordre :
//    1. initialize            — cree la pool si elle n existe pas
//    2. approve(B20 -> Permit2)
//    3. approve(quote -> Permit2)
//    4. permit2.approve(B20, PositionManager)
//    5. permit2.approve(quote, PositionManager)
//    6. modifyLiquidities     — mint de la position
//    ⚠️ v4 REGLE PAR PERMIT2 : approuver le PositionManager ne suffit PAS. Il faut les DEUX
//       autorisations par jeton. Un seul des deux gestes et le mint reverte sur une erreur qui ne
//       parle jamais d autorisation.
import { keccak256 } from './keccak.js';

const enc = new TextEncoder();
const hexDe = (o) => [...o].map((b) => b.toString(16).padStart(2, '0')).join('');
export function selecteur(sig) { return hexDe(keccak256(enc.encode(sig))).slice(0, 8); }

const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
/** ⛔ Un entier SIGNE se complete a deux sur 32 octets. Un tick negatif encode en non signe
 *  designerait une autre borne — et le revert ne parlerait pas de signe. */
const motSigne = (v) => { const b = BigInt(v); return (b < 0n ? (1n << 256n) + b : b).toString(16).padStart(64, '0'); };
const motAdr = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const dyn = (h) => { const n = h.length / 2; return mot(n) + h + '00'.repeat((32 - (n % 32)) % 32); };

/** PoolKey est une struct STATIQUE : ses 5 champs s inlinent, sans offset. */
const cleInline = (k) => motAdr(k.currency0) + motAdr(k.currency1) + mot(k.fee) + motSigne(k.tickSpacing) + motAdr(k.hooks);

/**
 * `initializePool` SUR LE PositionManager, et `multicall` pour tout faire en UNE transaction.
 * ================================================================================================
 * ⛔ POURQUOI CA COMPTE. Un portefeuille n a qu un seul `to` par transaction : creer la pool
 *    (PoolManager) puis y placer la supply (PositionManager) demandait donc DEUX signatures. Entre
 *    les deux, l utilisateur peut fermer l onglet, refuser, ou se tromper de reseau — et il reste
 *    alors une pool creee et VIDE que rien ne rattrape.
 * ⛔ EUX FONT TOUT EN UNE TRANSACTION parce qu ils ont un contrat qui orchestre (13 681 octets).
 *    Le PositionManager d Uniswap sait deja le faire : il expose `initializePool` ET `multicall`.
 *    Selecteurs releves dans le bytecode SERVI, avec temoin positif (`modifyLiquidities`, dont on
 *    sait qu il marche) et temoin negatif (une signature inventee, absente) — sans quoi quatre
 *    octets se rencontrent par hasard dans 24 Ko et tous les resultats seraient du bruit.
 * ⚠️ ET UN SELECTEUR PRESENT NE PROUVE RIEN DE PLUS QUE SA PRESENCE : ni ce que la fonction fait,
 *    ni qui peut l appeler. C est la simulation qui tranche, pas cette liste.
 */
export function encodeInitializePool(cle, sqrtPriceX96) {
  return '0x' + selecteur('initializePool((address,address,uint24,int24,address),uint160)')
    + cleInline(cle) + mot(sqrtPriceX96);
}

/**
 * `multicall(bytes[])` : plusieurs appels au MEME contrat, dans une seule transaction.
 * ⛔ L ORDRE EST LE SENS. `[initializePool, modifyLiquidities]` cree puis remplit ; l inverse
 *    tenterait de remplir une pool qui n existe pas encore, et le revert ne parlerait pas d ordre.
 * ⚠️ `multicall` est ATOMIQUE : si le mint echoue, l initialize est annule avec lui. C est
 *    precisement ce qui rend l enchainement sur : plus d etat intermediaire ou une pool vide
 *    survit a un echec.
 */
export function encodeMulticall(appels) {
  const elements = appels.map((a) => dyn(a.replace(/^0x/, '')));
  let curseur = BigInt(32 * elements.length);
  const offsets = elements.map((e) => { const o = mot(curseur); curseur += BigInt(e.length / 2); return o; });
  return '0x' + selecteur('multicall(bytes[])') + mot(0x20)
    + mot(elements.length) + offsets.join('') + elements.join('');
}

export function encodeInitialize(cle, sqrtPriceX96) {
  return '0x' + selecteur('initialize((address,address,uint24,int24,address),uint160)')
    + cleInline(cle) + mot(sqrtPriceX96);
}

/**
 * COLLECTE les frais d une position et les envoie a une adresse CHOISIE.
 * ================================================================================================
 * ⛔ CE QUE CA REGLE. La tokenomics designe une adresse pour les frais ; en Uniswap v4 les frais
 *    reviennent au PROPRIETAIRE de la position. J avais d abord conclu qu il fallait TRANSFERER
 *    le NFT — reponse dangereuse : qui detient le NFT peut aussi retirer toute la liquidite.
 *    `TAKE_PAIR` prend un DESTINATAIRE : on collecte vers qui on veut en gardant la position.
 *
 * ⛔ LES DEUX CONSTANTES SONT MESUREES, PAS LUES. `sonde-actions-v4.mjs` a demande au
 *    PositionManager lesquelles il accepte (`UnsupportedAction(uint256)` nomme ce qu il refuse) ;
 *    `Actions.sol` a donne les noms ; les deux concordent la ou c est verifiable — MINT_POSITION
 *    0x02 et SETTLE_PAIR 0x0d sont celles du mint qui a REUSSI, TAKE_ALL 0x0f et TAKE_PORTION
 *    0x10 sont refusees des deux cotes. Une constante d action fausse n echoue pas proprement :
 *    elle EXECUTE UNE AUTRE ACTION.
 *
 * ⛔ LA LIQUIDITE RETIREE EST ZERO, ET C EST TOUTE LA DIFFERENCE entre collecter les frais et
 *    fermer la position. `DECREASE_LIQUIDITY` a zero ne touche pas au capital : elle ne fait
 *    remonter que ce qui s est accumule. Le test asserte ce zero dans les OCTETS, pas dans
 *    l intention.
 *
 * ⚠️ ORDRE NON COSMETIQUE : decroitre PUIS prendre. Prendre d abord ne prendrait rien.
 */
export function encodeCollecteFrais({ tokenId, currency0, currency1, versQui, deadline }) {
  const actions = '01' + '11';                    // DECREASE_LIQUIDITY, TAKE_PAIR
  /* params[0] : (tokenId, liquidite=0, min0=0, min1=0, hookData) — 5 mots + les octets vides */
  const p0 = mot(tokenId) + mot(0) + mot(0) + mot(0) + mot(0xa0) + mot(0);
  /* params[1] : (currency0, currency1, destinataire) */
  const p1 = motAdr(currency0) + motAdr(currency1) + motAdr(versQui);

  const elements = [dyn(p0), dyn(p1)];
  let curseur = BigInt(32 * elements.length);
  const offsets = elements.map((e) => { const o = mot(curseur); curseur += BigInt(e.length / 2); return o; });
  const tableau = mot(elements.length) + offsets.join('') + elements.join('');

  const blocActions = dyn(actions);
  const unlock = mot(0x40) + mot(0x40 + blocActions.length / 2) + blocActions + tableau;
  return '0x' + selecteur('modifyLiquidities(bytes,uint256)') + mot(0x40) + mot(deadline) + dyn(unlock);
}

export function encodeApprove(spender, montant) {
  return '0x' + selecteur('approve(address,uint256)') + motAdr(spender) + mot(montant);
}

export function encodePermit2Approve(jeton, spender, montant, expiration) {
  return '0x' + selecteur('approve(address,address,uint160,uint48)')
    + motAdr(jeton) + motAdr(spender) + mot(montant) + mot(expiration);
}

/**
 * modifyLiquidities(bytes unlockData, uint256 deadline)
 *   unlockData = abi.encode(bytes actions, bytes[] params)
 *   params[0]  = (PoolKey, int24, int24, uint256, uint128, uint128, address, bytes)
 *   params[1]  = (Currency, Currency)
 * ⛔ MINT_POSITION = 0x02 et SETTLE_PAIR = 0x0d, relus dans Uniswap/v4-periphery Actions.sol.
 *    Une constante d action fausse ne plante pas proprement : elle execute UNE AUTRE action.
 */
export function encodeMintPosition({ cle, tickBas, tickHaut, liquidite, max0, max1, proprietaire, deadline }) {
  const actions = '020d';                        // MINT_POSITION, SETTLE_PAIR

  /* params[0] : 12 mots de tete (5 pour la PoolKey inline + 6 champs + 1 offset), puis hookData. */
  const p0 = cleInline(cle) + motSigne(tickBas) + motSigne(tickHaut) + mot(liquidite)
    + mot(max0) + mot(max1) + motAdr(proprietaire) + mot(0x180) + mot(0);
  const p1 = motAdr(cle.currency0) + motAdr(cle.currency1);

  const elements = [dyn(p0), dyn(p1)];
  let curseur = BigInt(32 * elements.length);
  const offsets = elements.map((e) => { const o = mot(curseur); curseur += BigInt(e.length / 2); return o; });
  const tableau = mot(elements.length) + offsets.join('') + elements.join('');

  const blocActions = dyn(actions);
  const unlock = mot(0x40) + mot(0x40 + blocActions.length / 2) + blocActions + tableau;

  return '0x' + selecteur('modifyLiquidities(bytes,uint256)') + mot(0x40) + mot(deadline) + dyn(unlock);
}

/**
 * Retirer une position : modifyLiquidities avec [BURN_POSITION 0x03, TAKE_PAIR 0x11] (Actions.sol, lus a la source).
 * BURN = (uint256 tokenId, uint128 amount0Min, uint128 amount1Min, bytes hookData) ; TAKE_PAIR = (currency0, currency1,
 * recipient). BURN ramene la liquidite a zero s il en reste (PositionManager.handleAction).
 * ⛔ Des minimums, pas zero : un retrait a minimum nul accepterait n importe quel prix au moment du retrait.
 */
export function encodeRetraitPosition({ tokenId, min0, min1, cle, destinataire, deadline }) {
  const p0 = mot(tokenId) + mot(min0) + mot(min1) + mot(0x80) + mot(0);
  const p1 = motAdr(cle.currency0) + motAdr(cle.currency1) + motAdr(destinataire);
  const elements = [dyn(p0), dyn(p1)];
  let curseur = BigInt(32 * elements.length);
  const offsets = elements.map((e) => { const o = mot(curseur); curseur += BigInt(e.length / 2); return o; });
  const tableau = mot(elements.length) + offsets.join('') + elements.join('');
  const blocActions = dyn('0311');
  const unlock = mot(0x40) + mot(0x40 + blocActions.length / 2) + blocActions + tableau;
  return '0x' + selecteur('modifyLiquidities(bytes,uint256)') + mot(0x40) + mot(deadline) + dyn(unlock);
}

/**
 * Decode `getPoolAndPositionInfo(tokenId)` : PoolKey (5 mots) puis PositionInfo (1 mot).
 * ⛔ Disposition lue dans PositionInfoLibrary.sol : bits 0-7 hasSubscriber, 8-31 tickLower, 32-55 tickUpper (signes),
 *    200 bits hauts = poolId tronque.
 */
export function decoderPoolEtPosition(retour) {
  const h = String(retour || '').replace(/^0x/, '');
  if (h.length < 64 * 6) return null;
  const w = (i) => h.slice(64 * i, 64 * (i + 1));
  const adr = (s) => '0x' + s.slice(24);
  const signe = (v, bits) => { const m = 1n << BigInt(bits); const x = v & (m - 1n); return Number(x >= m / 2n ? x - m : x); };
  const info = BigInt('0x' + w(5));
  return {
    cle: { currency0: adr(w(0)), currency1: adr(w(1)), fee: Number(BigInt('0x' + w(2))), tickSpacing: signe(BigInt('0x' + w(3)), 24), hooks: adr(w(4)) },
    tickLower: signe(info >> 8n, 24), tickUpper: signe(info >> 32n, 24), abonne: (info & 0xffn) !== 0n,
  };
}

/** ⛔ L ordre des devises est IMPOSE par v4 : currency0 < currency1 PAR ADRESSE. L inverser
 *  designerait une AUTRE pool — qui n existe pas — et le mint reverterait sans parler d ordre. */
export function cleDePool(a, b, { fee = 3000, tickSpacing = 60, hooks = '0x0000000000000000000000000000000000000000' } = {}) {
  const [c0, c1] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return { currency0: c0, currency1: c1, fee, tickSpacing, hooks };
}

export const MAX_UINT256 = (1n << 256n) - 1n;
export const MAX_UINT160 = (1n << 160n) - 1n;
export const MAX_UINT48 = (1n << 48n) - 1n;
export const MAX_UINT128 = (1n << 128n) - 1n;
/** Prix 1:1 en unites BRUTES : sqrt(1) << 96. */
export const PRIX_1_POUR_1 = 79228162514264337593543950336n;
/** ⛔ Bornes alignees sur tickSpacing = 60. Une borne non alignee reverte sans parler d alignement. */
export const TICK_BAS = -887220, TICK_HAUT = 887220;

/** poolId = keccak256(abi.encode(PoolKey)). La PoolKey etant STATIQUE, c est exactement ses 5 mots. */
export function poolId(cle) {
  const h = cleInline(cle);
  return '0x' + hexDe(keccak256(Uint8Array.from(h.match(/../g).map((b) => parseInt(b, 16)))));
}

/** ⛔ Lit l etat REEL avant d agir : une etape deja faite ne doit pas etre refaite, et une etape
 *  manquante ne doit pas etre sautee. `appel` est injecte pour rester testable hors reseau. */
/**
 * Le `L` a poser pour deposer AU PLUS `depot` de devise, marge de securite comprise.
 * ================================================================================================
 * ⛔ POURQUOI CETTE FONCTION EXISTE. Le champ de l app demandait `L` directement — un PARAMETRE
 *    DE COURBE, en unites brutes, sans rapport lisible avec un montant. Pour deposer 0,001176 WETH
 *    il fallait taper 37188385283580172, un nombre que j ai du calculer A LA MAIN et transmettre.
 *    Un champ qu on ne peut pas remplir sans qu un tiers calcule a votre place n est pas un champ.
 *
 * ⛔ ET LA MARGE DE 2 % EST STRUCTURELLE, PAS COSMETIQUE. L app plafonne le mint au besoin + 2 %.
 *    Si le besoin vaut deja 100 % du solde, ce plafond DEPASSE le solde : la borne ne borne plus
 *    rien, et l etape 6 peut reverter avec les jetons deja approuves. J ai failli faire signer
 *    exactement ce L-la ; la marge est desormais dans le calcul, pas dans un conseil oral.
 *
 * ⚠️ RECHERCHE BINAIRE SUR `montantsPourLiquidite`, le helper REEL — pas une formule reecrite ici.
 *    Une inversion analytique divergerait du code qui sera execute au mint, et l ecart ne se
 *    verrait qu apres signature.
 * ⚠️ TROIS REFUS NOMMES : pas de depot, pas de prix, ou depot trop petit pour un L non nul. Un
 *    `L = 0` passerait toutes les gardes de plafond en ne deposant rien.
 */
export function liquiditePourDepot({ depot, sqrtPrix, deviseEst0, margePct = 102n }) {
  const d = BigInt(depot || 0);
  if (d === 0n) return { etat: 'VIDE' };
  if (sqrtPrix === null || sqrtPrix === undefined || BigInt(sqrtPrix) === 0n) return { etat: 'SANS_PRIX' };
  const tient = (L) => {
    const m = montantsPourLiquidite(L, sqrtPrix);
    const besoin = deviseEst0 ? m.montant0 : m.montant1;
    const autre = deviseEst0 ? m.montant1 : m.montant0;
    /* ⛔ LES DEUX COTES DOIVENT ETRE NON NULS, et c est un test qui me l a appris. Sur un depot
     *    minuscule, la recherche trouvait un `L` positif dont le besoin ARRONDIT A ZERO : la
     *    garde du plafond passait (0 <= depot) et la position n aurait rien depose d un cote.
     *    Un `L` accepte qui ne depose rien est pire qu un refus — il a l air d avoir marche. */
    if (besoin === 0n || autre === 0n) return false;
    /* ⛔ C est le PLAFOND que l app posera qui doit tenir dans la poche, pas le besoin nu. */
    return (besoin * margePct) / 100n <= d;
  };
  let bas = 0n, haut = 1n << 140n;
  while (bas < haut) {
    const mil = (bas + haut + 1n) / 2n;
    if (tient(mil)) bas = mil; else haut = mil - 1n;
  }
  if (bas === 0n) return { etat: 'TROP_PETIT' };
  const m = montantsPourLiquidite(bas, sqrtPrix);
  return { etat: 'OK', liquidite: bas,
    besoinDevise: deviseEst0 ? m.montant0 : m.montant1,
    besoinBlock: deviseEst0 ? m.montant1 : m.montant0 };
}

/**
 * POURQUOI le bouton refuse — ou `null` s il ne doit pas refuser.
 * ================================================================================================
 * ⛔⛔ EXTRAIT APRES UNE FAUTE COMMISE DEUX FOIS : corriger UNE MOITIE. L etape 6 (mint) n a pas
 *    de `data` au moment du plan — c est VOULU, son `deadline` se prend sur le bloc courant.
 *    J avais corrige l AFFICHAGE (« CANNOT BUILD » -> « TO DO ») et laisse la decision du BOUTON
 *    sur le meme test `data === undefined`. En conditions reelles, 2026-09-05 : cinq etapes sur
 *    six faites, soldes lus, AUCUN blocage affiche, et le bouton refusait quand meme en renvoyant
 *    vers « the blocker above » — qui n existait pas. Une garde peut etre VRAIE et couvrir la
 *    mauvaise moitie du probleme.
 *
 * ⛔ ET ELLE VIVAIT DANS UNE CHAINE DE `else if` AU MILIEU D UNE FONCTION DE 400 LIGNES,
 *    verifiable seulement a l oeil et seulement en conditions reelles — c est-a-dire chez
 *    l utilisateur. Ici elle est PURE, donc testee, y compris le cas qui a echoue.
 *
 * ⚠️ L ORDRE DES REFUS EST DELIBERE : du plus structurel au plus circonstanciel. Un utilisateur
 *    ne lit que le PREMIER message ; « connecte ton wallet » doit passer avant « pas assez de
 *    solde », parce que sans compte le solde n a meme pas de sens.
 *
 * @param {object|null} suivante  l etape a faire, ou null s il n en reste aucune
 * @param {boolean} besoinsCalcules  les montants exiges par la position sont-ils connus ?
 */
export function raisonDeBloquer({ suivante, compte, manque, soldeInconnu, besoinsCalcules }) {
  if (!suivante) return 'Every step is done';
  /* ⛔ UNE ETAPE DIFFEREE SE JUGE SUR SES DEPENDANCES, pas sur un champ qu on a choisi de ne pas
   * remplir. Sans cette distinction on refuse pour toujours (le defaut d origine) ou on accepte
   * pour toujours (le correctif naif) — les deux sont faux. */
  const inconstructible = suivante.mint
    ? !besoinsCalcules
    : (suivante.data === null || suivante.data === undefined);
  if (inconstructible) return 'Cannot build "' + suivante.nom + '" — read the reason above';
  if (!compte) return 'Connect your wallet first (button below)';
  if (manque) return 'Not enough balance for that liquidity';
  /* ⛔ FERMER SUR L INCONNU, et le DIRE autrement que « pas assez » : signer sans savoir si le
   * solde suffit, c est decouvrir le refus apres avoir paye. Le message donne le geste — relire,
   * pas corriger. */
  if (soldeInconnu) return 'Your balances could not be read — click "Read the six steps" again';
  return null;
}

/**
 * Transforme une reponse JSON-RPC en valeur, ou en exception MARQUEE.
 * ⛔ UNE SEULE DEFINITION, parce que la page ET la sonde mainnet en ont besoin. En ecrire une
 *    copie dans chacune ferait diverger le jugement « refus » / « panne » entre ce qui est
 *    montre a l utilisateur et ce qui est mesure — le jumeau qui diverge, deja vu ici.
 * ⚠️ `code === 3` est le code d erreur d execution mesure sur `mainnet.base.org` le 2026-09-04
 *    (`execution reverted: ...`, dans une reponse HTTP 200). La limite de debit rend -32016 dans
 *    un HTTP 429. Le code discrimine donc les deux, et il est lisible sans le statut HTTP — que
 *    l `appelBrut` de la page ne remonte pas.
 */
export function valeurOuRefus(j) {
  if (!j || !j.error) return j ? j.result : j;
  const e = new Error(j.error.message + (j.error.data ? ' (' + j.error.data + ')' : ''));
  if (j.error.code === 3) e.refusChaine = true;
  throw e;
}

/**
 * ESSAIE une etape par `eth_call` AVANT d ouvrir le wallet.
 * ================================================================================================
 * ⛔ POURQUOI. Mesure du 2026-09-04 sur Base mainnet : un `eth_call` sur `initialize` d une pool
 *    FRAICHE execute le meme code, au meme etat, avec le meme `from` — sans signature, sans
 *    ecriture, sans frais. Le PoolManager a repondu `0x65316` (tick 414 486) et l etat n avait pas
 *    bouge. La classe « nos octets sont mal formes » est donc eliminable AVANT le geste humain,
 *    et le refus, s il vient, arrive gratuitement au lieu d arriver apres une transaction payee.
 *
 * ⛔ TROIS ETATS, JAMAIS DEUX. `ACCEPTE` / `REFUSE` / `NON_MESURE`. Un essai non fait n est pas un
 *    essai reussi : sans wallet connecte on ne peut pas prendre `from` — et lire avec l adresse
 *    de substitution repondrait sur QUELQU UN D AUTRE, la faute exacte deja commise sur les
 *    soldes. Une etape sans calldata (le mint, construit au moment de signer) est NON_MESURE
 *    aussi, pas verte.
 *
 * ⚠️ CE QU IL NE PROUVE PAS. (1) L etat peut changer entre l essai et la transaction — un `eth_call`
 *     est une photo. (2) `initialize` accepte n importe quel prix dans les bornes : un prix absurde
 *     passerait ici. (3) Il ne dit rien du gas. Un ACCEPTE reduit le risque, il ne l annule pas.
 *
 * ⚠️ ET IL NE S APPLIQUE QU A L ETAPE SUIVANTE. Essayer les six enchainerait des reverts LEGITIMES
 *     — l etape 6 depend d approbations que l etape 4 n a pas encore posees — et un refus legitime
 *     affiche comme un defaut ferait fuir sur une pool qui va tres bien.
 *
 * @param {Function} appelBrut  (tx) => Promise<hex>, leve sur revert. Injecte, donc testable.
 */
export async function essaiEtape({ appelBrut, de, etape }) {
  if (!etape) return { etat: 'NON_MESURE', pourquoi: 'no step left to try' };
  if (!de) return { etat: 'NON_MESURE', pourquoi: 'connect a wallet — trying from someone else would answer about them' };
  if (etape.data === null || etape.data === undefined) {
    return { etat: 'NON_MESURE', pourquoi: 'this step has no calldata yet' };
  }
  const tx = { from: de, to: etape.to, data: etape.data };
  /* ⚠️ `value` compte : l etape 0 (wrap) reverte sans elle. On ne la met que si elle existe —
   * un `value` a zero sur un appel qui n en attend pas est inoffensif, mais un `undefined`
   * serialise en JSON casse certains noeuds. */
  if (etape.valeur) tx.value = etape.valeur;
  try {
    const r = await appelBrut(tx);
    return { etat: 'ACCEPTE', retour: r };
  } catch (e) {
    const cause = e && e.message ? e.message : String(e);
    /* ⛔⛔ UNE PANNE DE TRANSPORT N EST PAS UN REFUS DE LA CHAINE, et les confondre FERME LE
     *    BOUTON sur un hoquet reseau. Trouve en exercant la sonde mainnet : deux etapes
     *    parfaitement valides ont ete rapportees « REFUSE — over rate limit ». Le premier jet de
     *    ce helper traitait toute exception comme un refus.
     * MESURE du 2026-09-04 sur `mainnet.base.org`, la forme EXACTE des deux :
     *    refus chaine  -> HTTP 200, {code: 3, message: 'execution reverted: ...'}
     *    limite debit  -> HTTP 429, {code: -32016, message: 'over rate limit'}
     *    Un refus de la chaine arrive donc dans une reponse HTTP REUSSIE. C est a l adaptateur,
     *    qui voit le statut et le code, de le dire — pas a nous de le deviner d apres un texte.
     * ⛔ ET LE DEFAUT EST FAIL-SAFE. Sans marque, on rend NON_MESURE : une erreur inconnue ne
     *    ferme pas le bouton a tort, et n ouvre rien non plus. Elle avoue qu on ne sait pas. */
    if (e && e.refusChaine === true) return { etat: 'REFUSE', pourquoi: cause };
    return { etat: 'NON_MESURE', pourquoi: 'could not ask the chain — ' + cause };
  }
}

export async function etatPool({ appel, cle, jetons, proprietaire, posm, permit2, stateView }) {
  const motAdr2 = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  const lire = async (to, data) => { try { return await appel(to, data); } catch (e) { return { err: e.message }; } };

  const slot0 = await lire(stateView, '0x' + selecteur('getSlot0(bytes32)') + poolId(cle).slice(2));
  /* ⛔ sqrtPriceX96 == 0 signifie « pool non initialisee ». Une LECTURE ECHOUEE ne signifie PAS
   * cela — elle veut dire qu on ne sait pas, et les deux appellent des gestes differents. */
  const sqrtPrix = slot0 && slot0.err ? null : BigInt('0x' + String(slot0).slice(2, 66));
  const initialisee = sqrtPrix === null ? null : sqrtPrix !== 0n;

  const permissions = {};
  for (const j of jetons) {
    const a = await lire(j, '0x' + selecteur('allowance(address,address)') + motAdr2(proprietaire) + motAdr2(permit2));
    const p = await lire(permit2, '0x' + selecteur('allowance(address,address,address)')
      + motAdr2(proprietaire) + motAdr2(j) + motAdr2(posm));
    permissions[j.toLowerCase()] = {
      versPermit2: a && a.err ? { err: a.err } : BigInt(a),
      /* permit2.allowance rend (uint160 amount, uint48 expiration, uint48 nonce) : le montant est
       * le PREMIER mot, l expiration le deuxieme. Une autorisation EXPIREE vaut zero. */
      versPosm: p && p.err ? { err: p.err } : BigInt('0x' + String(p).slice(2, 66)),
      expiration: p && p.err ? null : BigInt('0x' + String(p).slice(66, 130)),
    };
  }
  /* ⛔ ON REND LE PRIX REEL, PAS SEULEMENT « initialisee ». Il etait LU puis JETE : on n en
   * gardait qu un booleen. Or si la pool a ete initialisee par QUELQU UN D AUTRE, le mint se
   * fera a SON prix, pas a celui qu on affiche — et avec `max0/max1 = MAX_UINT128` il n existait
   * aucune borne. Mesure du 2026-09-04 : a un prix 10x deplace, le mint prend 3,16 fois plus de
   * devise que prevu. L information etait la ; la perdre suffisait a rendre la garde impossible.
   * ⚠️ `null` = non mesure. `0n` = non initialisee. Les deux ne se confondent pas. */
  return { initialisee, sqrtPrix, permissions };
}

/* ══ SWAP ══════════════════════════════════════════════════════════════════════════════════════
 * ⛔ CONSTANTES LUES A LA SOURCE (Uniswap/v4-periphery Actions.sol, universal-router Commands.sol),
 *    jamais recitees : SWAP_EXACT_IN_SINGLE 0x06 · SETTLE_ALL 0x0c · TAKE_ALL 0x0f · V4_SWAP 0x10.
 *    Recoupement utile : le meme fichier donne MINT_POSITION 0x02 et SETTLE_PAIR 0x0d, qui sont
 *    exactement ceux que la sequence de pool employait deja.
 *
 * ⛔ ET UNE INCERTITUDE QU ON NE TRANCHE PAS DE MEMOIRE. La struct ExactInputSingleParams de la
 *    branche `main` porte un champ `minHopPriceX36` entre `amountOutMinimum` et `hookData`. Le
 *    routeur DEPLOYE peut dater d avant. La source dit ce qui est ECRIT, pas ce qui TOURNE.
 *    ⇒ on encode les DEUX formes, et l appelant demande a la CHAINE laquelle elle accepte, par
 *      eth_call, avant de faire signer quoi que ce soit. */
export const AVEC_MINHOP = true, SANS_MINHOP = false;

export function encodeSwapExactInSingle({ cle, zeroForOne, montant, sortieMin, deadline, forme }) {
  /* ⛔ DEUX CORRECTIONS TROUVEES PAR BISSECTION SUR LA CHAINE, et elles se MASQUAIENT l une l autre.
   * 1. ExactInputSingleParams contient `bytes hookData` : c est une struct DYNAMIQUE, donc
   *    `abi.encode` la fait PRECEDER d un mot d offset. Il manquait.
   * 2. L offset de hookData compte TOUS les mots de tete, Y COMPRIS SON PROPRE MOT :
   *    PoolKey(5) + zeroForOne + amountIn + amountOutMinimum = 8 champs -> offset 0x120, pas 0x100.
   * ⚠️ Corriger UNE SEULE des deux ne changeait RIEN : le revert restait vide et identique. C est
   *    pourquoi quatre essais successifs semblaient dire la meme chose alors qu ils disaient
   *    seulement « il reste au moins une faute ».
   * ⚠️ Le Quoter, lui, marchait : QuoteExactSingleParams n a que 7 champs avant hookData, donc son
   *    offset 0x100 etait juste. Le meme nombre, correct ici, faux la-bas. */
  const champs = forme === AVEC_MINHOP ? 9 : 8;
  const tete = mot(0x20) + cleInline(cle) + mot(zeroForOne ? 1 : 0) + mot(montant) + mot(sortieMin)
    + (forme === AVEC_MINHOP ? mot(0) : '')
    + mot((champs + 1) * 32) + mot(0);

  const entree = zeroForOne ? cle.currency0 : cle.currency1;
  const sortie = zeroForOne ? cle.currency1 : cle.currency0;
  const elements = [dyn(tete), dyn(motAdr(entree) + mot(montant)), dyn(motAdr(sortie) + mot(sortieMin))];
  let curseur = BigInt(32 * elements.length);
  const offsets = elements.map((e) => { const o = mot(curseur); curseur += BigInt(e.length / 2); return o; });
  const tableau = mot(elements.length) + offsets.join('') + elements.join('');

  const actions = dyn('060c0f');
  const input0 = dyn(mot(0x40) + mot(0x40 + actions.length / 2) + actions + tableau);
  const commands = dyn('10');
  const offCommands = 0x60n, offInputs = offCommands + BigInt(commands.length / 2);
  return '0x' + selecteur('execute(bytes,bytes[],uint256)')
    + mot(offCommands) + mot(offInputs) + mot(deadline) + commands + mot(1) + mot(0x20) + input0;
}

/* ══ SWAP AVEC ACTIONS PARAMETRABLES (2026-09-13 : frais d interface 0,5 %) ═══════════════════════════════
 * ⛔ CODES ET DISPOSITIONS LUS DANS v4-periphery (lib de tblock-hook) : Actions.sol — SETTLE 0x0b, SETTLE_ALL 0x0c,
 *    TAKE 0x0e, TAKE_ALL 0x0f, TAKE_PORTION 0x10 ; V4Router.handleAction + CalldataDecoder — SETTLE =
 *    (currency, amount, payerIsUser), TAKE et TAKE_PORTION = (currency, recipient, amount|bips),
 *    SETTLE_ALL / TAKE_ALL = (currency, uint256). Un test prouve que `encodeV4Swap` avec [SETTLE_ALL, TAKE_ALL]
 *    rend EXACTEMENT les octets de `encodeSwapExactInSingle` : les deux ne peuvent pas diverger en silence. */
export const ACTIONS_V4 = Object.freeze({ SWAP_EXACT_IN_SINGLE: '06', SETTLE: '0b', SETTLE_ALL: '0c', TAKE: '0e', TAKE_ALL: '0f', TAKE_PORTION: '10' });
export const paramsAction = Object.freeze({
  settle: (devise, montant, payeurEstUtilisateur) => motAdr(devise) + mot(montant) + mot(payeurEstUtilisateur ? 1 : 0),
  settleAll: (devise, max) => motAdr(devise) + mot(max),
  take: (devise, destinataire, montant) => motAdr(devise) + motAdr(destinataire) + mot(montant),
  takeAll: (devise, min) => motAdr(devise) + mot(min),
  takePortion: (devise, destinataire, bips) => motAdr(devise) + motAdr(destinataire) + mot(bips),
});

/**
 * Un swap exact-in sur UNE pool, suivi des actions donnees (`[{ code, params }]`), via l Universal Router.
 * ⛔ Meme en-tete de swap que `encodeSwapExactInSingle` (voir ses deux corrections d offset, gardees ici).
 */
/** Les parametres d un SWAP_EXACT_IN_SINGLE (0x06), utilisables comme action suivante (buyback automatique).
 *  ⛔ `montant` 0 = OPEN_DELTA : le routeur prend TOUT le credit de la devise d entree (V4Router, lu a la source). */
export function paramsSwapExactInSingle({ cle, zeroForOne, montant, sortieMin, forme }) {
  const champs = forme === AVEC_MINHOP ? 9 : 8;
  return mot(0x20) + cleInline(cle) + mot(zeroForOne ? 1 : 0) + mot(montant) + mot(sortieMin)
    + (forme === AVEC_MINHOP ? mot(0) : '')
    + mot((champs + 1) * 32) + mot(0);
}

export function encodeV4Swap({ cle, zeroForOne, montant, sortieMin, deadline, forme, actions }) {
  const tete = paramsSwapExactInSingle({ cle, zeroForOne, montant, sortieMin, forme });
  const elements = [dyn(tete), ...actions.map((a) => dyn(a.params))];
  let curseur = BigInt(32 * elements.length);
  const offsets = elements.map((e) => { const o = mot(curseur); curseur += BigInt(e.length / 2); return o; });
  const tableau = mot(elements.length) + offsets.join('') + elements.join('');
  const codes = dyn('06' + actions.map((a) => a.code).join(''));
  const input0 = dyn(mot(0x40) + mot(0x40 + codes.length / 2) + codes + tableau);
  const commands = dyn('10');
  const offCommands = 0x60n, offInputs = offCommands + BigInt(commands.length / 2);
  return '0x' + selecteur('execute(bytes,bytes[],uint256)')
    + mot(offCommands) + mot(offInputs) + mot(deadline) + commands + mot(1) + mot(0x20) + input0;
}

/** Quote read-only : ne signe rien, ne coute rien. */
export function encodeQuote({ cle, zeroForOne, montant }) {
  return '0x' + selecteur('quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))')
    + mot(0x20) + cleInline(cle) + mot(zeroForOne ? 1 : 0) + mot(montant) + mot(0x100) + mot(0);
}

/**
 * ⛔ DEMANDE A LA CHAINE quelle forme de struct le routeur accepte, par eth_call, AVANT toute
 *    signature. Rend la forme acceptee, ou null avec la cause — jamais une supposition.
 * ⚠️ Un eth_call qui reverte pour une AUTRE raison (autorisation manquante, solde) fait echouer
 *    les deux formes a l identique : dans ce cas on rend `null` et on le DIT, au lieu de choisir
 *    au hasard celle qui « semble » bonne.
 */
function estErreurTransportRpc(msg, code) {
  const s = String(msg || '');
  if (code === -32016 || code === 429) return true;
  return /rate limit|over rate limit|429|timeout|throttl|ECONNRESET|Failed to fetch|HTTP 429/i.test(s);
}

export async function formeAcceptee({ appelBrut, ur, de, cle, zeroForOne, montant, deadline, value }) {
  /* ⛔ `value` : achat en ETH natif. Sans msg.value, SETTLE_ALL reverte et les DEUX formes
   *    echouent a l identique — on croirait alors a une mauvaise encoding, pas a ETH manquant. */
  /* ⛔ TRANSPORT ≠ ENCODING (2026-09-08 Real Sell): both shapes returned « over rate limit »
   *    → UI painted BOTH SHAPES REJECTED. Buy had just proven an encoding works. Retry once
   *    after a short pause; if still only transport, mark transport:true so the page says
   *    RETRY not REJECTED. */
  const causes = {};
  let transportOnly = true;
  for (let tour = 0; tour < 2; tour++) {
    if (tour) await new Promise((r) => setTimeout(r, 1200));
    Object.keys(causes).forEach((k) => delete causes[k]);
    transportOnly = true;
    for (const forme of [AVEC_MINHOP, SANS_MINHOP]) {
      const data = encodeSwapExactInSingle({ cle, zeroForOne, montant, sortieMin: 0n, deadline, forme });
      const tx = { from: de, to: ur, data };
      if (value) tx.value = value;
      const r = await appelBrut(tx);
      if (!r.error) return { forme, causes, transport: false };
      const msg = (r.error.message || '') + (r.error.data ? ' data=' + r.error.data : '');
      causes[forme ? 'avecMinHop' : 'sansMinHop'] = msg;
      if (!estErreurTransportRpc(msg, r.error.code)) transportOnly = false;
    }
    if (!transportOnly) break;
  }
  return { forme: null, causes, transport: transportOnly };
}

/**
 * Racine carree entiere d un BigInt (methode de Newton).
 * ⛔ PAS DE FLOTTANT ICI. `Math.sqrt` sur un nombre au-dela de 2^53 perd des bits, et le
 *    resultat sert a fixer le prix d une pool — une valeur qu on n a pas le droit de reviser.
 */
export function isqrt(n) {
  if (n < 0n) throw new Error('isqrt d un negatif');
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}

/**
 * sqrtPriceX96 pour un prix EXPRIME EN JETONS ENTIERS, decimales comprises.
 *
 * ⛔ NE PAS UTILISER `PRIX_1_POUR_1` SUR UNE PAIRE DONT LES DECIMALES DIFFERENT. Cette constante
 *    vaut 2^96, soit un ratio 1:1 d UNITES DE BASE. Mesure du 2026-09-04 : avec une devise a 6
 *    decimales (USDC) face a un block a 18, elle signifie 1 USDC = 1 000 000 000 000 blocks —
 *    une supply de 1e9 y vaudrait 0,001 USDC, et n importe qui racheterait tout le token pour un
 *    dixieme de centime. Le prix d une pool ne se reinitialise pas.
 *
 * @param {object} p
 * @param {bigint} p.prixNum  numerateur du prix : combien d unites de DEVISE pour…
 * @param {bigint} p.prixDen  …`prixDen` jetons entiers de BLOCK. (une fraction, donc exacte)
 * @param {number} p.decDevise  decimales de la devise, LUES sur la chaine
 * @param {number} p.decBlock   decimales du block
 * @param {boolean} p.deviseEst0  la devise est-elle currency0 (adresse la plus basse) ?
 */
export function sqrtPriceDepuisPrix({ prixNum, prixDen, decDevise, decBlock, deviseEst0 }) {
  const n = BigInt(prixNum), d = BigInt(prixDen);
  if (n <= 0n || d <= 0n) throw new Error('prix nul ou negatif');
  /* Le pool raisonne en UNITES DE BASE : ratio = currency1 / currency0.
   * devise = currency0 -> 1 unite de devise vaut (d/n) blocks, corrige des decimales. */
  const eB = 10n ** BigInt(decBlock), eD = 10n ** BigInt(decDevise);
  const num = deviseEst0 ? d * eB : n * eD;
  const den = deviseEst0 ? n * eD : d * eB;
  /* sqrt(num/den) * 2^96 = sqrt(num * 2^192 / den) — tout en entiers. */
  return isqrt((num << 192n) / den);
}

/**
 * L INVERSE : combien d unites de DEVISE vaut UN jeton entier de block, depuis le sqrtPriceX96 lu.
 *
 * ⛔ ECRIT COMME L INVERSE EXACT DE `sqrtPriceDepuisPrix`, ET TESTE PAR ALLER-RETOUR. C est cette
 *    fonction-la dont la convention d arguments m avait fait publier un sqrtPrice faux de 1e8 le
 *    2026-09-06 : le tick voisin tombait juste, et la colonne d a cote etait fausse. Le seul test
 *    qui aurait attrape ca est l aller-retour, parce qu il ne peut pas se tromper dans le meme
 *    sens deux fois.
 *
 * ⚠️ REND UN `number`, ET C EST ASSUME : c est un prix D AFFICHAGE, pour une capitalisation lisible.
 *    ⛔ NE JAMAIS s en servir pour construire une calldata — les montants signes se calculent en
 *    BigInt, exactement, par `sqrtPriceDepuisPrix` et `montantsPosition`.
 *
 * @param {bigint} sqrtPriceX96  lu dans slot0
 * @param {number} decDevise     decimales de la devise, LUES
 * @param {number} decBlock      decimales du block, LUES
 * @param {boolean} deviseEst0   la devise est-elle currency0 ?
 * @returns {number|null} null si l entree n est pas exploitable — jamais 0, qui se lirait « gratuit »
 */
export function prixDepuisSqrt({ sqrtPriceX96, decDevise, decBlock, deviseEst0 }) {
  let s;
  try { s = BigInt(sqrtPriceX96); } catch { return null; }
  if (s <= 0n) return null;
  if (!Number.isInteger(decDevise) || !Number.isInteger(decBlock)) return null;
  if (decDevise < 0 || decBlock < 0 || decDevise > 36 || decBlock > 36) return null;
  /* ratio d UNITES DE BASE currency1/currency0 = (s / 2^96)^2.
   * ⚠️ On divise AVANT de convertir : (s^2 << 64) / 2^192 garde 64 bits de fraction, la ou
   *    `Number(s*s)` deborderait le double sur des prix ordinaires. */
  const Q192 = 1n << 192n;
  const ratioFix = (s * s * (1n << 64n)) / Q192;      /* ratio en virgule fixe 64 bits */
  const ratio = Number(ratioFix) / Number(1n << 64n); /* unites de base : c1 par c0 */
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const eB = 10 ** decBlock, eD = 10 ** decDevise;
  /* devise = currency0 : 1 unite de base de devise -> `ratio` unites de base de block.
   *   1 block entier = eB unites de base -> eB / ratio unites de base de devise -> / eD entiers. */
  const prix = deviseEst0 ? (eB / ratio) / eD : (ratio * eB) / eD;
  return Number.isFinite(prix) && prix > 0 ? prix : null;
}

/** sqrtPriceX96 aux bornes de la pleine etendue. ⛔ Valeurs du protocole, pas calculees ici :
 *  TickMath.MIN_SQRT_PRICE et MAX_SQRT_PRICE. Les recalculer introduirait un arrondi la ou
 *  Uniswap utilise des constantes exactes. */
export const SQRT_MIN = 4295128739n;
export const SQRT_MAX = 1461446703485210103287273052203988822378723970342n;

/**
 * Les MONTANTS DE JETONS qu une position pleine etendue exige, pour une liquidite L donnee.
 *
 * ⛔ `L` N EST PAS UN MONTANT DE JETONS, ET LES CONFONDRE COUTE TOUT LE SOLDE.
 *    L app comparait le solde de l utilisateur a `L` directement. A un prix de 1, `amount0` et
 *    `amount1` valent tous deux ≈ L — c est pourquoi la garde semblait juste sur Sepolia, ou la
 *    paire etait a 1:1. Elle etait correcte PAR ACCIDENT.
 *    Mesure du 2026-09-04, au prix 1 block = 1e-5 WETH, pour L = 1e15 :
 *      WETH exige   3 162 277 660 168        soit L x 0,0032
 *      block exige  316 227 766 016 837 933  soit L x 316
 *    L etape d enveloppe aurait donc converti 316 fois trop d ETH — tout le solde, pour rien.
 *
 * ⚠️ Formule standard, position couvrant [Pa, Pb] avec le prix courant DEDANS :
 *      amount0 = L * (√Pb − √P) / (√P · √Pb)      amount1 = L * (√P − √Pa)
 *    en virgule fixe X96. Hors de l intervalle elle ne vaut plus — ici l intervalle est la
 *    pleine etendue, donc le prix y est toujours.
 */
/**
 * Les montants d une position DONT LA PLAGE NE CONTIENT PAS forcement le prix courant.
 * ⛔⛔ C EST CE QUI REND UN LANCEMENT POSSIBLE SANS CAPITAL, et c est mesure : chez openlaunch,
 *    99,99 % de la supply est DANS la pool ; chez nous, 0,00 %. La difference n est pas une
 *    question de moyens — on a amorce DES DEUX COTES, il fallait des blocks ET de l ETH. Une
 *    position placee ENTIEREMENT d un cote du prix ne demande QU UN SEUL jeton : celui que le
 *    createur possede deja, integralement. Les acheteurs apportent l autre.
 *
 * ⛔ `montantsPourLiquidite` LEVE hors plage, et c est correct pour ce qu elle fait — elle n est
 *    pas modifiee. On AJOUTE le cas general plutot que d elargir une fonction dont huit
 *    assertions dependent : elargir une garde pour un nouveau besoin, c est la retirer pour
 *    l ancien.
 *
 * Trois regimes, et le SENS de chacun compte plus que sa formule :
 *   · prix SOUS la plage  -> la position ne contient que le jeton 0. Elle attend que le prix
 *     monte jusqu a elle ; d ici la, elle ne detient rien du jeton 1.
 *   · prix DANS la plage  -> les deux, comme avant.
 *   · prix AU-DESSUS      -> la position ne contient que le jeton 1.
 * ⚠️ QUEL JETON EST « 0 » DEPEND DE L ORDRE DES ADRESSES, PAS DU ROLE. Se tromper de cote
 *    demanderait le jeton qu on n a pas, et l erreur ne se verrait qu au moment de signer.
 */
export function montantsPosition(L, sqrtP, sqrtMin, sqrtMax) {
  const l = BigInt(L), p = BigInt(sqrtP), a = BigInt(sqrtMin), b = BigInt(sqrtMax);
  if (l < 0n) throw new Error('liquidite negative');
  if (a >= b) throw new Error('bornes inversees ou nulles : sqrtMin doit etre < sqrtMax');
  const Q96 = 2n ** 96n;
  /* montant du jeton 0 entre deux bornes : L * Q96 * (hi - lo) / (lo * hi) */
  const m0 = (lo, hi) => (l * Q96 * (hi - lo)) / (lo * hi);
  /* montant du jeton 1 entre deux bornes : L * (hi - lo) / Q96 */
  const m1 = (lo, hi) => (l * (hi - lo)) / Q96;

  if (p <= a) return { montant0: m0(a, b), montant1: 0n, regime: 'SOUS_LA_PLAGE' };
  if (p >= b) return { montant0: 0n, montant1: m1(a, b), regime: 'AU_DESSUS_DE_LA_PLAGE' };
  return { montant0: m0(p, b), montant1: m1(a, p), regime: 'DANS_LA_PLAGE' };
}

/**
 * La liquidite `L` qui deposera EXACTEMENT `montant` d un seul jeton, hors plage.
 * ⛔ ON INVERSE LA FORMULE PLUTOT QUE DE CHERCHER PAR DICHOTOMIE : l inversion est exacte, et
 *    une recherche approcherait par en dessous en laissant des jetons non deposes — sur une
 *    supply entiere, « presque tout » n est pas « tout ».
 * ⚠️ Rend `null` si le cote demande est vide dans ce regime : demander du jeton 1 a une position
 *    qui n en contient pas doit REFUSER, jamais rendre 0 — un L de 0 minterait une position vide.
 */
export function liquiditeUnilaterale({ montant, cote, sqrtMin, sqrtMax }) {
  const m = BigInt(montant), a = BigInt(sqrtMin), b = BigInt(sqrtMax);
  if (m <= 0n) return null;
  if (a >= b) return null;
  const Q96 = 2n ** 96n;
  if (cote === 1) return (m * Q96) / (b - a);
  if (cote === 0) return (m * a * b) / (Q96 * (b - a));
  return null;
}

export function montantsPourLiquidite(L, sqrtP, sqrtMin = SQRT_MIN, sqrtMax = SQRT_MAX) {
  const l = BigInt(L), p = BigInt(sqrtP);
  if (l < 0n) throw new Error('liquidite negative');
  if (p <= sqrtMin || p >= sqrtMax) throw new Error('prix hors des bornes de la pleine etendue');
  const Q96 = 2n ** 96n;
  return {
    montant0: (l * Q96 * (sqrtMax - p)) / (p * sqrtMax),
    montant1: (l * (p - sqrtMin)) / Q96,
  };
}
