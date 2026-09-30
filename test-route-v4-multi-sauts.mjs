/* Ce que cette route rend possible, et les pieges precis qu elle refuse.
 *
 * ⭐ LA ROUTE PRIORITAIRE DE PHIL EST PROUVEE COTABLE, par un devis REEL sur la chaine (2026-10-01) :
 *       100 OUSD -> 99,987552 USDC -> 328 166 unites NVDAc
 *   Deux sauts, Uniswap V4, fee 100 / tickSpacing 1, poolIds resolus sur la chaine :
 *       USDC/OUSD   0xdf5bde0fc414fcd1f803c9d1b52ebbb4db5982d8dca5316ae06b467e06fc429a
 *       USDC/NVDAc  0x73429136d60ad9fb734c9e51db90bf30acbebdb78a7b029053ba8fefd89d78a1
 *
 * ⛔⛔ ET LA BORNE, QUI VOYAGE AVEC : UNE ACTION SUR QUINZE. `USDC/<action>` en V4 = 1/15 (NVDAc),
 *   `ETH/<action>` en V4 = 0/15, `ETH/<block cote en action>` par le lecteur canonique = 0/6.
 *   Les 14 autres sont sur AERODROME, ou OUSD n a rien : il faudrait un lot atomique de DEUX
 *   routeurs, que 40,5 % des wallets mesures ne tiennent pas.
 *
 * ⛔ CE FICHIER TESTE L ASSEMBLAGE, PAS LA CHAINE. Il ne prouve pas qu un swap aboutisse : ca
 *   demande un banc de fork, et `fork-rig-trois-conditions` rappelle qu un banc peut etre VERT sur
 *   une transaction `status 0x0`. Ce qui est tenu ici : la forme, les refus, et le frais.
 */
import { strict as assert } from 'node:assert';
import { SAUTS_MIN, SAUTS_MAX, ETATS, BPS_MAX, ETH_NATIF, departDuSaut, arriveeDuSaut,
  chaineTient, fraisEtNet, actionsMultiSauts, routePrete, phraseRouteV4 } from './route-v4-multi-sauts.js';
/* ⛔ LES CODES VIENNENT DE `pool.js`, LA SEULE SOURCE. Les recopier ici ferait divergier deux
 *   tables, et le test validerait sa propre copie. */
import { ACTIONS_V4, paramsAction } from './pool.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const OUSD = '0xB2000000000000000000002fEb517dFeC7415344';
const NVDA = '0xb20000000000000000000078ee7ce2fe4908108c';
const FEE = '0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4';
const CENT_OUSD = 100000000n; /* 100 OUSD, 6 decimales — le montant du devis mesure */

/* Les cles MESUREES, `currency0 < currency1` comme V4 l exige. */
const cleUsdcOusd = { currency0: USDC, currency1: OUSD, fee: 100, tickSpacing: 1, hooks: ETH_NATIF };
const cleUsdcNvda = { currency0: NVDA, currency1: USDC, fee: 100, tickSpacing: 1, hooks: ETH_NATIF };
const cleEthUsdc = { currency0: ETH_NATIF, currency1: USDC, fee: 500, tickSpacing: 10, hooks: ETH_NATIF };

/* ⭐ LA ROUTE PRIORITAIRE : OUSD -> USDC -> NVDAc. */
const OUSD_VERS_NVDA = [
  { cle: cleUsdcOusd, zeroForOne: false }, /* OUSD -> USDC (OUSD est currency1) */
  { cle: cleUsdcNvda, zeroForOne: false }, /* USDC -> NVDAc (USDC est currency1) */
];
const base = { sauts: OUSD_VERS_NVDA, entree: OUSD, sortie: NVDA, montant: CENT_OUSD,
  minSortie: 300000n, bps: 50n, beneficiaireFrais: FEE, actionsV4: ACTIONS_V4, paramsAction };
const r = (sur) => actionsMultiSauts({ ...base, ...sur });

cas('✅ TEMOIN POSITIF : la route MESUREE OUSD -> USDC -> NVDAc s assemble', () => {
  const x = r({});
  assert.equal(x.etat, 'OK', 'la base doit etre OK : ' + x.pourquoi);
  assert.ok(routePrete(x));
  assert.equal(x.sauts, 2);
});

console.log('la lecture des sens, DANS la cle');
cas('depart et arrivee sont LUS, jamais supposes', () => {
  assert.equal(departDuSaut(OUSD_VERS_NVDA[0]).toLowerCase(), OUSD.toLowerCase());
  assert.equal(arriveeDuSaut(OUSD_VERS_NVDA[0]).toLowerCase(), USDC.toLowerCase());
  assert.equal(arriveeDuSaut(OUSD_VERS_NVDA[1]).toLowerCase(), NVDA.toLowerCase());
});
cas('un saut illisible rend null, jamais une devise inventee', () => {
  assert.equal(departDuSaut(null), null);
  assert.equal(departDuSaut({ cle: cleUsdcOusd }), null, 'sans direction, on ne devine pas');
  assert.equal(arriveeDuSaut({ cle: { currency0: USDC }, zeroForOne: true }), null);
});

console.log('');
console.log('⛔⛔ LE CHEMIN DOIT CHAINER');
cas('la route mesuree chaine', () => { assert.equal(chaineTient(OUSD_VERS_NVDA).ok, true); });
/* ⛔ LE PIEGE : deux sauts CHACUN valide, mais qui ne se touchent pas. Les pools sont reelles, le
 *   chemin ne l est pas, et l appel reverte APRES signature. */
cas('⛔ deux sauts qui ne se touchent pas -> REFUSE, et le refus NOMME les deux devises', () => {
  const casse = [{ cle: cleUsdcOusd, zeroForOne: false }, { cle: cleEthUsdc, zeroForOne: true }];
  const c = chaineTient(casse);
  assert.equal(c.ok, false);
  assert.match(c.pourquoi, /does not chain/i);
  const x = r({ sauts: casse, entree: OUSD, sortie: USDC });
  assert.equal(x.etat, 'REFUSE');
  assert.match(x.pourquoi, /does not chain/i);
});
cas('une route a TROIS sauts qui chaine est acceptee', () => {
  const trois = [
    { cle: cleEthUsdc, zeroForOne: true },   /* ETH  -> USDC */
    { cle: cleUsdcOusd, zeroForOne: true },  /* USDC -> OUSD */
    { cle: cleUsdcOusd, zeroForOne: false }, /* OUSD -> USDC */
  ];
  assert.equal(chaineTient(trois).ok, true);
  const x = r({ sauts: trois, entree: ETH_NATIF, sortie: USDC, montant: 10n ** 16n });
  assert.equal(x.etat, 'OK', x.pourquoi);
  assert.equal(x.sauts, 3);
});

console.log('');
console.log('la forme de la route');
cas('la tete est le premier saut, et elle ne passe PAS par `actions`', () => {
  const x = r({});
  assert.equal(x.cle, cleUsdcOusd);
  assert.equal(x.zeroForOne, false);
  /* ⛔ `encodeV4Swap` encode la tete a part (code 06 implicite) : la remettre dans `actions`
   *   ferait DEUX premiers swaps. Deux sauts => UN seul swap chaine. */
  assert.equal(x.actions.filter((a) => a.code === ACTIONS_V4.SWAP_EXACT_IN_SINGLE).length, 1);
});
cas('l ordre est SETTLE, TAKE, swaps chaines, TAKE_ALL', () => {
  assert.deepEqual(r({}).actions.map((a) => a.code),
    [ACTIONS_V4.SETTLE, ACTIONS_V4.TAKE, ACTIONS_V4.SWAP_EXACT_IN_SINGLE, ACTIONS_V4.TAKE_ALL]);
});
cas('⛔⛔ les sauts chaines ont montant 0 (OPEN_DELTA) et sortieMin 0', () => {
  for (const a of r({}).actions.filter((x) => x.code === ACTIONS_V4.SWAP_EXACT_IN_SINGLE)) {
    assert.equal(a.params, '__SWAP__');
    assert.equal(a.swap.montant, 0n);
    assert.equal(a.swap.sortieMin, 0n);
  }
});
cas('⛔ le premier swap part du NET, pas du total', () => {
  const x = r({});
  assert.equal(x.montantTete, CENT_OUSD - x.frais);
});

console.log('');
console.log('⛔⛔ L ETH JOINT A LA TRANSACTION');
cas('entree en JETON -> valeur 0 (envoyer de l ETH le laisserait au routeur)', () => {
  assert.equal(r({}).valeur, 0n);
  assert.equal(r({}).fraisDevise, 'pair');
  assert.equal(r({}).devise, OUSD.toLowerCase());
});
cas('entree en ETH natif -> valeur = le montant total, et fraisDevise ETH', () => {
  const x = r({ sauts: [{ cle: cleEthUsdc, zeroForOne: true }, { cle: cleUsdcNvda, zeroForOne: false }],
    entree: ETH_NATIF, sortie: NVDA, montant: 10n ** 16n });
  assert.equal(x.etat, 'OK', x.pourquoi);
  assert.equal(x.valeur, 10n ** 16n);
  assert.equal(x.fraisDevise, 'ETH');
  assert.equal(x.devise, null);
});

console.log('');
console.log('⛔ LE FRAIS : DANS LA DEVISE D ENTREE, A LA TETE, ET EXACT');
cas('il est pris sur la devise d ENTREE, jamais sur la sortie', () => {
  const x = r({});
  assert.equal(x.actions.find((a) => a.code === ACTIONS_V4.TAKE).params,
    paramsAction.take(OUSD, FEE, x.frais));
});
cas('50 bps sur 100 OUSD = 500 000 (6 decimales), arrondi vers le BAS', () => {
  assert.equal(r({}).frais, (CENT_OUSD * 50n) / 10000n);
});
cas('⛔ l arrondi va VERS LE BAS (on prend MOINS que le taux affiche)', () => {
  const f = fraisEtNet({ montant: 7n, bps: 10n });
  assert.equal(f.etat, 'OK');
  assert.equal(f.frais, 0n);
  assert.equal(f.net, 7n);
});
cas('⛔ bps 0 -> AUCUN TAKE, et la route reste valide', () => {
  const x = r({ bps: 0n });
  assert.equal(x.etat, 'OK');
  assert.equal(x.frais, 0n);
  assert.equal(x.actions.filter((a) => a.code === ACTIONS_V4.TAKE).length, 0);
});
cas('⛔ un frais sans beneficiaire -> REFUSE (un frais perdu est un frais mesure a 0)', () => {
  assert.equal(r({ beneficiaireFrais: null }).etat, 'REFUSE');
  assert.equal(r({ beneficiaireFrais: '0xabc' }).etat, 'REFUSE');
});
cas('✅ mais bps 0 SANS beneficiaire est valide : il n y a rien a verser', () => {
  assert.equal(r({ bps: 0n, beneficiaireFrais: null }).etat, 'OK');
});
cas('⛔ un taux au-dela de BPS_MAX -> REFUSE, et la borne elle-meme passe', () => {
  assert.equal(r({ bps: BPS_MAX + 1n }).etat, 'REFUSE');
  assert.equal(r({ bps: BPS_MAX }).etat, 'OK');
});
cas('⛔ un taux negatif -> REFUSE', () => { assert.equal(r({ bps: -1n }).etat, 'REFUSE'); });
/* ⛔ LA GARDE « LE FRAIS MANGE TOUT » NE DOIT PAS DEPENDRE DE BPS_MAX : elle serait correcte par
 *   accident. On l eprouve directement sur `fraisEtNet`, hors de la borne. */
cas('⛔ un frais qui consomme TOUT est refuse, independamment de BPS_MAX', () => {
  assert.equal(fraisEtNet({ montant: 100n, bps: 10000n }).etat, 'REFUSE');
});

console.log('');
console.log('⛔⛔ ENTREE ET SORTIE DOIVENT ETRE CELLES DU CHEMIN');
cas('⛔ une entree qui n est pas le depart du 1er saut -> REFUSE', () => {
  const x = r({ entree: USDC });
  assert.equal(x.etat, 'REFUSE');
  assert.match(x.pourquoi, /not where the first hop starts/i);
});
/* ⛔⛔ LE PIEGE DES DEUX UNITES : une sortie qui n est pas l arrivee du DERNIER saut rendrait ZERO
 *   a l acheteur SANS QUE RIEN NE REVERTE. C est le defaut le plus cher de la liste.
 *   ⛔ Et c est le SENS qui compte, pas l appartenance : une version plus laxiste acceptait « une
 *     devise du dernier saut », donc aussi celle que la route CONSOMME. */
cas('⛔ une sortie qui n est pas l arrivee du dernier saut -> REFUSE', () => {
  const x = r({ sortie: USDC });
  assert.equal(x.etat, 'REFUSE');
  assert.match(x.pourquoi, /not where the last hop ends/i);
});
cas('⛔ une adresse tronquee -> REFUSE', () => {
  assert.equal(r({ sortie: '0xb2000000' }).etat, 'REFUSE');
  assert.equal(r({ entree: '0xb2' }).etat, 'REFUSE');
});

console.log('');
console.log('⛔⛔ LE MINIMUM PORTE SUR LA SORTIE FINALE');
cas('le TAKE_ALL final porte la sortie ET le minimum', () => {
  const ta = r({}).actions.at(-1);
  assert.equal(ta.code, ACTIONS_V4.TAKE_ALL);
  assert.equal(ta.params, paramsAction.takeAll(NVDA, 300000n));
});
cas('⛔ un minimum absent, nul ou negatif -> REFUSE', () => {
  for (const v of [undefined, null, 0n, -1n, '1000', 1.5]) {
    assert.equal(r({ minSortie: v }).etat, 'REFUSE', 'minSortie = ' + String(v) + ' a passe');
  }
});

console.log('');
console.log('⛔ LES ENTREES ABSURDES REFUSENT AU LIEU DE SUPPOSER');
cas('moins que SAUTS_MIN -> REFUSE', () => {
  assert.equal(r({ sauts: [OUSD_VERS_NVDA[0]] }).etat, 'REFUSE');
  assert.equal(r({ sauts: [] }).etat, 'REFUSE');
  assert.equal(r({ sauts: null }).etat, 'REFUSE');
});
/* ⛔⛔ MA PREMIERE VERSION DE CE CAS ETAIT VIDE, ET C EST LE BANC DE MUTATION QUI L A DIT (M11 :
 *   « les bornes du nombre de sauts ne tiennent plus » s est ECHAPPEE). Je passais
 *   `SAUTS_MAX + 1` sauts IDENTIQUES — or des sauts identiques ne CHAINENT pas, donc
 *   `chaineTient` les refusait avant que la borne ne soit lue. Le test passait pour la mauvaise
 *   raison, et supprimer la borne ne le faisait pas rougir.
 *   ⇒ IL FAUT UNE ROUTE TROP LONGUE QUI CHAINE, pour que SEULE la borne puisse la refuser. */
const CINQ_QUI_CHAINENT = [
  { cle: cleEthUsdc, zeroForOne: true },   /* ETH  -> USDC */
  { cle: cleUsdcOusd, zeroForOne: true },  /* USDC -> OUSD */
  { cle: cleUsdcOusd, zeroForOne: false }, /* OUSD -> USDC */
  { cle: cleUsdcOusd, zeroForOne: true },  /* USDC -> OUSD */
  { cle: cleUsdcOusd, zeroForOne: false }, /* OUSD -> USDC */
];
cas('✅ TEMOIN : cette route de 5 sauts CHAINE bien (sinon le cas suivant serait vide)', () => {
  assert.equal(CINQ_QUI_CHAINENT.length, SAUTS_MAX + 1);
  assert.equal(chaineTient(CINQ_QUI_CHAINENT).ok, true,
    'si elle ne chainait pas, la borne ne serait jamais exercee');
});
cas('⛔ plus que SAUTS_MAX -> REFUSE, et c est la BORNE qui refuse', () => {
  const x = r({ sauts: CINQ_QUI_CHAINENT, entree: ETH_NATIF, sortie: USDC, montant: 10n ** 16n });
  assert.equal(x.etat, 'REFUSE');
  assert.match(x.pourquoi, /hops are required/i, 'refuse, mais pas par la borne');
});
cas('✅ et SAUTS_MAX pile passe (la borne elle-meme n exclut pas)', () => {
  const x = r({ sauts: CINQ_QUI_CHAINENT.slice(0, SAUTS_MAX), entree: ETH_NATIF,
    sortie: OUSD, montant: 10n ** 16n });
  assert.equal(x.etat, 'OK', x.pourquoi);
  assert.equal(x.sauts, SAUTS_MAX);
});
cas('⛔ une direction NON LUE -> REFUSE (jamais devinee)', () => {
  for (const d of [undefined, null, 1, 'true', 0]) {
    const x = r({ sauts: [{ cle: cleUsdcOusd, zeroForOne: d }, OUSD_VERS_NVDA[1]] });
    assert.equal(x.etat, 'REFUSE', 'zeroForOne = ' + String(d) + ' a passe');
    assert.match(x.pourquoi, /READ from the pool/i);
  }
});
cas('⛔ une cle illisible -> REFUSE, en NOMMANT le saut', () => {
  const x = r({ sauts: [OUSD_VERS_NVDA[0], { cle: { currency0: USDC }, zeroForOne: true }] });
  assert.equal(x.etat, 'REFUSE');
  assert.match(x.pourquoi, /hop 2/);
});
cas('⛔ un montant nul ou absent -> REFUSE', () => {
  for (const v of [0n, -1n, undefined, null, '1000']) {
    assert.equal(r({ montant: v }).etat, 'REFUSE', 'montant = ' + String(v) + ' a passe');
  }
});
/* ⛔⛔ LA TABLE D ACTIONS NE SE RECOPIE PAS DANS CE MODULE : il la RECOIT. L oublier doit REFUSER,
 *   pas produire des codes `undefined` qui donneraient un calldata muet et faux. */
cas('⛔ sans la table d actions -> REFUSE', () => {
  assert.equal(actionsMultiSauts({ ...base, actionsV4: null }).etat, 'REFUSE');
  assert.equal(actionsMultiSauts({ ...base, paramsAction: undefined }).etat, 'REFUSE');
});
cas('⛔ sans argument du tout -> REFUSE', () => { assert.equal(actionsMultiSauts().etat, 'REFUSE'); });
cas('⛔ une route refusee n est JAMAIS prete', () => {
  assert.equal(routePrete(r({ sortie: USDC })), false);
  assert.equal(routePrete(null), false);
  assert.equal(routePrete({ etat: 'OK' }), false, 'un objet sans actions ne doit pas passer');
});

console.log('');
console.log('la phrase : elle dit les sauts, et le cas sans frais PARLE');
cas('elle dit le NOMBRE de sauts et les deux bouts', () => {
  const s = phraseRouteV4(r({}), { entree: 'OUSD', sortie: 'NVDAc' });
  assert.match(s, /2 hops/);
  assert.match(s, /OUSD/);
  assert.match(s, /NVDAc/);
});
cas('⛔ elle dit que le minimum couvre la SORTIE, pas les jetons du milieu', () => {
  assert.match(phraseRouteV4(r({})), /not the tokens in between/i);
});
cas('⛔ elle avertit que N sauts = N occasions d echouer', () => {
  assert.match(phraseRouteV4(r({})), /2 chances to fail/i);
});
cas('elle dit ce qu on garde, avec le montant', () => {
  assert.match(phraseRouteV4(r({})), new RegExp(String(r({}).frais)));
});
cas('⛔ et le cas SANS frais parle aussi', () => {
  assert.match(phraseRouteV4(r({ bps: 0n })), /keeps nothing/i);
});
cas('un refus PARLE et dit pourquoi', () => {
  assert.match(phraseRouteV4(r({ sortie: USDC })), /nothing to sign/i);
});
cas('null PARLE', () => { assert.ok(phraseRouteV4(null).length > 0); });

console.log('');
console.log('les constantes');
cas('ETATS est gelee, et les bornes de sauts sont 2..4', () => {
  assert.ok(Object.isFrozen(ETATS));
  assert.equal(SAUTS_MIN, 2);
  assert.equal(SAUTS_MAX, 4);
});
cas('⛔ ETH_NATIF est l adresse ZERO, pas WETH', () => {
  assert.equal(ETH_NATIF, '0x0000000000000000000000000000000000000000');
});

console.log('');
console.log(n + ' cas, 0 KO');
