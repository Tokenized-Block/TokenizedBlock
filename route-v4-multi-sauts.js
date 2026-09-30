/* TROIS SAUTS SUR UNISWAP V4, EN UNE TRANSACTION — ET NOTRE FRAIS EN ETH.
 *
 * ⛔⛔ LE PROBLEME MESURE (2026-09-30). Cinq blocks sont cotes en OUSD et ils TRADENT : OHUSD fait
 *   169 737 $ / 24 h et 1 371 trades. Notre porte leur donne une PUCE D ACHAT
 *   (`ADMIS_SANS_FRAIS`), donc l app PROMET un achat — et derriere il n y a rien a construire :
 *     `planAchatEthAction` resout chaque pool sur la factory AERODROME, et OUSD n y a ZERO pool
 *     (mesure sur les NEUF espacements declares, avec temoins : USDC/WETH 3, AAPLc/USDC 2).
 *   Preuve du bout en bout : AAPLc + sa pool Aerodrome va jusqu au BOUT du routage (refuse
 *   seulement sur « not enough ETH in this wallet »), OHUSD est refuse a la PREMIERE etape
 *   (« a whole pool address is required », car `poolAdr` est `null`).
 *   ⇒ Un bouton qui promet ce que le chemin ne peut pas tenir est pire qu un bouton absent.
 *
 * ✅ ET LA ROUTE EXISTE, SUR L AUTRE JAMBE : la profondeur d OUSD est sur UNISWAP V4 —
 *   OUSD/USDC poolId 0xdf5bde0fc414fcd1f803c9d1b52ebbb4db5982d8dca5316ae06b467e06fc429a,
 *   fee 100, tickSpacing 1, tick -1 => 1 USDC = 0,999999 OUSD, ~10 M$. Et ETH/USDC a QUATRE pools
 *   V4 sur nos cles mesurees. Tout tient donc dans UNE factory, donc en UN appel.
 *
 * ⛔⛔⛔ CE MODULE N INVENTE AUCUN OCTET, ET C EST DELIBERE. Je ne recite jamais un selecteur ni un
 *   code d action de memoire. Tout vient du depot :
 *     · `ACTIONS_V4` et `paramsAction` : `pool.js:459-466`
 *     · le chainage par OPEN_DELTA : `pool.js:473` — « `montant` 0 = OPEN_DELTA : le routeur prend
 *       TOUT le credit de la devise d entree (V4Router, lu a la source) »
 *     · et le MOTIF COMPLET existe deja EN PRODUCTION a DEUX sauts : `routeViaTblock`
 *       (`echange.js`) fait SETTLE(ETH) -> TAKE(ETH, frais) -> swap chaine -> TAKE_ALL.
 *   Passer de deux a trois sauts, c est ajouter UN swap chaine. Rien d autre.
 *
 * ⛔ LE FRAIS RESTE EN ETH, A LA TETE. C est le choix de `routeViaTblock` et il est motive par une
 *   mesure : `a6cf` detient deja SEPT jetons sans marche. Un frais preleve sur la SORTIE nous
 *   paierait en blocks invendables. Ici on retient l ETH AVANT le premier swap : ce qu on encaisse
 *   est liquide, et le montant est EXACT parce qu il est connu avant tout prix.
 */

/* ⭐⭐ LA ROUTE PRIORITAIRE DE PHIL — « OUSD -> action tokenisee Coinbase » — EST PROUVEE COTABLE,
 *   par un devis REEL et pas par l existence des pools (2026-10-01) :
 *       100 OUSD -> 99,987552 USDC -> 328 166 unites NVDAc
 *   Les deux sauts sur Uniswap V4, fee 100 / tickSpacing 1 :
 *       USDC/OUSD   poolId 0xdf5bde0fc414fcd1f803c9d1b52ebbb4db5982d8dca5316ae06b467e06fc429a
 *       USDC/NVDAc  poolId 0x73429136d60ad9fb734c9e51db90bf30acbebdb78a7b029053ba8fefd89d78a1
 *   Une seule factory, donc UN seul appel. Et NVDAc est le block n°1 de l app (12 475 229 $ / 24 h).
 *
 * ⛔⛔⛔ ET LA BORNE EST SERREE : UNE ACTION SUR QUINZE. La carte, mesuree, 0 non mesuree :
 *     · USDC/<action> en V4  : 1 sur 15 (NVDAc seule)
 *     · ETH/<action>  en V4  : 0 sur 15
 *     · ETH/<block cote en action> en V4, par le lecteur CANONIQUE `vieDuBlock` (14 cles,
 *       9 hooks distincts, refus NOMME) : 0 sur 6
 *   Les 14 autres actions et la plupart des blocks vivent sur AERODROME, ou OUSD n a RIEN. Le
 *   multi-pool atteint donc plus de choses, mais JAMAIS a travers deux factories en un appel : il
 *   faudrait un lot atomique de deux routeurs, que 40,5 % des wallets mesures ne tiennent pas.
 *   ⇒ CE MODULE NE SERT PAS LES 14, et il ne doit pas se lire comme s il les servait.
 *
 * ⛔⛔ DEUX FAUTES DE METHODE A MOI EN CHEMIN, retirees a voix haute :
 *   1. j ai d abord teste la SEULE colonne `USDC/<action>` et conclu « 1 sur 15 » comme si ca
 *      parlait de l atteignabilite — `convergence sur une colonne ne prouve qu une colonne`, deja
 *      en memoire. Phil l a vu avant moi. La colonne ETH a ensuite rendu 0 sur 15 ;
 *   2. j ai sonde les pools de blocks avec `hooks: 0x0` — le defaut de `cleDePool`. Or NOS blocks
 *      SONT hookes, et le hook entre dans le `poolId` : aucune de mes cles ne POUVAIT les trouver.
 *      Mon « 0/10 » n etait pas un fait sur la chaine, c etait une cecite. Refait avec
 *      `vieDuBlock`, qui couvre 9 hooks — et qui existait deja : j ecrivais une copie plus faible
 *      d un helper canonique. */

/** Les bornes du nombre de sauts. ⛔ Plus de sauts = plus d occasions d echouer pour UN seul clic. */
export const SAUTS_MIN = 2;
export const SAUTS_MAX = 4;

/** Les etats rendus. Aucun autre n est produit. */
export const ETATS = Object.freeze(['OK', 'REFUSE']);

/** ⛔ Un taux au-dela de ca n est pas un taux d interface, c est une saisie. */
export const BPS_MAX = 500n;

/** L ETH natif en V4 : l adresse zero. ⛔ Pas WETH — V4 manipule l ETH natif. */
export const ETH_NATIF = '0x0000000000000000000000000000000000000000';

const ADR = /^0x[0-9a-fA-F]{40}$/;

function estCle(c) {
  return !!c && typeof c === 'object'
    && ADR.test(String(c.currency0 || '')) && ADR.test(String(c.currency1 || ''));
}
function bas(a) { return String(a || '').toLowerCase(); }
function entier(x) {
  if (typeof x === 'bigint') return x;
  if (typeof x === 'number' && Number.isInteger(x)) return BigInt(x);
  return null;
}

/** La devise d ou PART un saut, LUE dans sa cle et sa direction — jamais supposee. */
export function departDuSaut(s) {
  if (!estCle(s && s.cle) || typeof s.zeroForOne !== 'boolean') return null;
  return s.zeroForOne ? s.cle.currency0 : s.cle.currency1;
}
/** La devise ou ARRIVE un saut. */
export function arriveeDuSaut(s) {
  if (!estCle(s && s.cle) || typeof s.zeroForOne !== 'boolean') return null;
  return s.zeroForOne ? s.cle.currency1 : s.cle.currency0;
}

/**
 * LA CHAINE DES SAUTS SE TIENT-ELLE ? Chaque saut doit partir de la ou le precedent ARRIVE.
 * ⛔⛔ SANS CETTE VERIFICATION, une liste de sauts « chacun valide » composerait un chemin qui ne
 *   chaine pas : le second swap prendrait le credit d une devise que le premier n a JAMAIS
 *   produite, et l appel reverterait APRES signature, gas paye. Les pools sont reelles, le chemin
 *   ne l est pas — le meme piege que le melange de factories, un cran plus bas.
 */
export function chaineTient(sauts) {
  if (!Array.isArray(sauts) || sauts.length < SAUTS_MIN) return { ok: false, pourquoi: 'too few hops' };
  for (let i = 1; i < sauts.length; i += 1) {
    const avant = arriveeDuSaut(sauts[i - 1]);
    const apres = departDuSaut(sauts[i]);
    if (!avant || !apres) {
      return { ok: false, pourquoi: 'hop ' + (i + 1) + ' or the one before it is unreadable' };
    }
    if (bas(avant) !== bas(apres)) {
      return { ok: false,
        pourquoi: 'hop ' + i + ' ends in ' + avant + ' but hop ' + (i + 1) + ' starts from ' + apres
          + ' — the path does not chain' };
    }
  }
  return { ok: true, pourquoi: null };
}

/**
 * Notre part, et ce qui part reellement dans le premier swap.
 * ⛔ ARRONDI VERS LE BAS : `m * bps / 10000` en entiers tronque, donc on prend un peu MOINS que le
 *   taux affiche. L autre sens depasserait le taux annonce, et un taux depasse est une promesse
 *   rompue.
 */
export function fraisEtNet({ montant, bps } = {}) {
  const m = entier(montant);
  const b = entier(bps);
  if (m === null || m <= 0n) return { etat: 'REFUSE', pourquoi: 'the input amount must be above zero' };
  if (b === null || b < 0n) return { etat: 'REFUSE', pourquoi: 'the fee rate must be zero or more' };
  if (b > BPS_MAX) return { etat: 'REFUSE', pourquoi: 'a fee above ' + BPS_MAX + ' bps is not an interface fee' };
  const frais = (m * b) / 10000n;
  /* ⛔ UN FRAIS QUI MANGE TOUT N EST PAS UN FRAIS. Avec `BPS_MAX` a 500 c est impossible, mais la
   *   garde ne doit pas dependre de cette valeur : elle serait « correcte par accident ». */
  if (frais >= m) return { etat: 'REFUSE', pourquoi: 'the fee would consume the whole amount' };
  return { etat: 'OK', frais, net: m - frais, pourquoi: null };
}

/**
 * LA LISTE D ACTIONS D UNE ROUTE MULTI-SAUTS, PRETE POUR `encodeV4Swap`.
 *
 * @param {object[]} p.sauts  de SAUTS_MIN a SAUTS_MAX sauts `{ cle, zeroForOne }`, dans l ordre.
 * @param {string}   p.entree la devise que l utilisateur PAIE (doit etre le depart du 1er saut).
 * @param {string}   p.sortie ce qu il recoit (doit etre l arrivee du dernier saut).
 * @param {bigint}   p.montant ce qu il envoie, frais COMPRIS.
 * @param {bigint}   p.minSortie le minimum sur la sortie FINALE.
 * @param {bigint}   p.bps       notre taux d interface.
 * @param {string}   p.beneficiaireFrais
 *
 * ⛔⛔ `minSortie` PORTE SUR LA SORTIE FINALE, JAMAIS SUR UN INTERMEDIAIRE. Le meme piege est deja
 *   documente dans `plan-eth-block.js` : promettre une quantite du saut 2 alors que le visiteur
 *   recoit celle du saut 3, ce sont DEUX UNITES DIFFERENTES sous un seul chiffre a l ecran.
 * ⛔⛔ ET LES SAUTS CHAINES ONT `montant: 0n` — OPEN_DELTA. Un montant fixe la-dedans prendrait une
 *   quantite decidee d avance au lieu du credit reel du saut precedent : poussiere dans le routeur,
 *   ou revert. Le 0 n est pas un oubli, c est le mecanisme.
 * ⛔ ET `sortieMin: 0n` sur les intermediaires : borner un intermediaire ferait reverter une route
 *   par ailleurs bonne. Le SEUL minimum qui protege l acheteur est celui du `TAKE_ALL` final.
 */
export function actionsMultiSauts({ sauts, entree, sortie, montant, minSortie, bps,
  beneficiaireFrais, actionsV4, paramsAction } = {}) {
  if (!actionsV4 || !paramsAction) {
    /* ⛔ LES CODES VIENNENT DU DEPOT, PAS D ICI. Ce module ne les recopie pas : il les RECOIT, pour
     *   qu une divergence entre deux tables soit impossible. `pool.js` est la seule source. */
    return { etat: 'REFUSE', pourquoi: 'the V4 action table must be passed in, never restated here' };
  }
  if (!Array.isArray(sauts) || sauts.length < SAUTS_MIN || sauts.length > SAUTS_MAX) {
    return { etat: 'REFUSE',
      pourquoi: 'between ' + SAUTS_MIN + ' and ' + SAUTS_MAX + ' hops are required for this route' };
  }
  for (const [i, s] of sauts.entries()) {
    if (!estCle(s && s.cle)) {
      return { etat: 'REFUSE', pourquoi: 'hop ' + (i + 1) + ' has no readable pool key' };
    }
    if (typeof s.zeroForOne !== 'boolean') {
      return { etat: 'REFUSE', pourquoi: 'hop ' + (i + 1) + ' needs its direction READ from the pool, not guessed' };
    }
  }
  /* ⛔⛔ LE CHEMIN DOIT CHAINER. Des sauts « chacun valide » peuvent composer un chemin qui ne
   *   chaine pas : le 2e swap prendrait le credit d une devise que le 1er n a jamais produite, et
   *   l appel reverterait APRES signature. */
  const ch = chaineTient(sauts);
  if (!ch.ok) return { etat: 'REFUSE', pourquoi: ch.pourquoi };

  if (!ADR.test(String(entree || ''))) return { etat: 'REFUSE', pourquoi: 'a whole input currency is required' };
  if (!ADR.test(String(sortie || ''))) return { etat: 'REFUSE', pourquoi: 'a whole output address is required' };
  /* ⛔⛔ L ENTREE DECLAREE DOIT ETRE CELLE DU CHEMIN. Un `SETTLE` sur une devise que la premiere
   *   pool n attend pas reverte apres signature ; et si l appelant croit en payer une autre,
   *   l ecran annonce le mauvais debit. */
  if (bas(entree) !== bas(departDuSaut(sauts[0]))) {
    return { etat: 'REFUSE',
      pourquoi: 'the declared input is not where the first hop starts (' + departDuSaut(sauts[0]) + ')' };
  }
  /* ⛔⛔ ET LA SORTIE DOIT ETRE L ARRIVEE DU DERNIER SAUT. Un `TAKE_ALL` sur un jeton que la route ne
   *   produit pas rendrait ZERO a l acheteur SANS QUE RIEN NE REVERTE — le defaut le plus cher. */
  if (bas(sortie) !== bas(arriveeDuSaut(sauts[sauts.length - 1]))) {
    return { etat: 'REFUSE',
      pourquoi: 'the output is not where the last hop ends (' + arriveeDuSaut(sauts[sauts.length - 1]) + ')' };
  }
  const mn = entier(minSortie);
  if (mn === null || mn <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'a positive minimum on the FINAL output is required' };
  }
  const f = fraisEtNet({ montant, bps });
  if (f.etat !== 'OK') return { etat: 'REFUSE', pourquoi: f.pourquoi };
  const m = entier(montant);
  /* ⛔ UN FRAIS SANS BENEFICIAIRE EST UN FRAIS PERDU. On refuse plutot que de le laisser au
   *   routeur : ce depot a deja mesure un frais qui n arrivait JAMAIS. */
  if (f.frais > 0n && !ADR.test(String(beneficiaireFrais || ''))) {
    return { etat: 'REFUSE', pourquoi: 'a whole fee recipient is required as soon as the fee is above zero' };
  }
  const enEth = bas(entree) === ETH_NATIF;

  const actions = [
    /* ⛔ SETTLE PORTE LE MONTANT TOTAL, frais compris : c est ce que l utilisateur envoie.
     *   `payeurEstUtilisateur = true` : le routeur tire de son wallet — ETH natif par msg.value,
     *   ou le jeton par Permit2, et les autorisations sont l affaire de `finaliser`. */
    { code: actionsV4.SETTLE, params: paramsAction.settle(entree, m, true) },
    /* ⛔ NOTRE PART, DANS LA DEVISE D ENTREE, AVANT LE PREMIER SWAP. Montant EXACT, connu sans
     *   aucun prix — donc insensible au glissement. */
    ...(f.frais > 0n
      ? [{ code: actionsV4.TAKE, params: paramsAction.take(entree, beneficiaireFrais, f.frais) }]
      : []),
    /* ⛔ LES SAUTS 2..N SONT CHAINES : `montant: 0n` = OPEN_DELTA, `sortieMin: 0n` = pas de borne
     *   intermediaire. Le saut 1 est la TETE — `encodeV4Swap` l encode a part. */
    ...sauts.slice(1).map((s) => ({ code: actionsV4.SWAP_EXACT_IN_SINGLE, params: '__SWAP__',
      swap: { cle: s.cle, zeroForOne: s.zeroForOne, montant: 0n, sortieMin: 0n } })),
    { code: actionsV4.TAKE_ALL, params: paramsAction.takeAll(sortie, mn) },
  ];
  return {
    etat: 'OK',
    actions,
    /* La tete du swap, telle que `encodeV4Swap` l attend : elle ne passe PAS par `actions`. */
    cle: sauts[0].cle,
    zeroForOne: sauts[0].zeroForOne,
    /* ⛔ LE PREMIER SWAP PART DU NET : le frais a deja ete retenu par le TAKE. */
    montantTete: f.net,
    /* ⛔⛔ `valeur` EST L ETH A JOINDRE A LA TRANSACTION, et elle vaut 0 quand l entree est un
     *   JETON. Envoyer de l ETH sur une route qui n en consomme pas le laisserait au routeur. */
    valeur: enEth ? m : 0n,
    entree,
    sortie,
    sauts: sauts.length,
    frais: f.frais,
    /* ⛔ ON NOMME LA DEVISE DU FRAIS, ON NE LA JUGE PAS : `assertFraisInterfaceA6cf` (`echange.js`)
     *   tient ce verrou, et lui seul — il n admet ETH, USDC, ou une devise dont l appelant a LU le
     *   prix. Deux regles pour la meme question divergeraient. */
    fraisDevise: enEth ? 'ETH' : 'pair',
    devise: enEth ? null : bas(entree),
    pourquoi: null,
  };
}

/** La route est-elle constructible ? ⛔ Jamais « presque ». */
export function routePrete(r) {
  return !!r && r.etat === 'OK' && Array.isArray(r.actions) && r.actions.length >= 3;
}

/**
 * La phrase montree avant signature.
 * ⛔ ELLE DIT LE NOMBRE DE SAUTS. « N sauts = N occasions d echouer pour un seul clic », et le
 *   glissement s accumule — c est ecrit dans `plan-eth-block.js` et ca reste vrai ici.
 * ⛔ ET LE CAS SANS FRAIS PARLE : « rien » se dit.
 */
export function phraseRouteV4(r, symboles = {}) {
  if (!r || !ETATS.includes(r.etat)) return 'Route: not computed.';
  if (r.etat === 'REFUSE') {
    return 'This trade cannot be built (' + (r.pourquoi || 'unknown') + ') — nothing to sign.';
  }
  const de = symboles.entree || (r.fraisDevise === 'ETH' ? 'ETH' : 'the token you pay');
  const vers = symboles.sortie || 'the block';
  const part = r.frais > 0n
    ? 'This app keeps ' + r.frais + ' of ' + de + ', taken before the first swap.'
    : 'This app keeps nothing on this trade.';
  return 'One transaction, ' + r.sauts + ' hops: ' + de + ' to ' + vers + '. ' + part
    + ' ' + r.sauts + ' hops are ' + r.sauts + ' chances to fail for one click, and the guaranteed '
    + 'minimum covers what you receive — not the tokens in between.';
}
