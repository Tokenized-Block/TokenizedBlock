/* test-plan-eth-trois-sauts.mjs — ACHETER EN ETH UN BLOCK COTE EN ACTION TOKENISEE, EN UNE TX.
 *
 * ⛔⛔ LE TROU QUE CE CHEMIN FERME : 123 blocks sont cotes dans une de nos actions tokenisees
 *     (DGUY/AMZNc, TE/MUc, LAPTOP/AAPLc…). Un visiteur qui tient de l ETH ne pouvait PAS les
 *     acheter : le chemin bati s arretait a WETH -> USDC -> action. Le bouton Buy etait MASQUE —
 *     honnete, et pas une solution. Il faut un TROISIEME saut : WETH -> USDC -> action -> block.
 *
 * ⛔⛔⛔ LA GARDE LA PLUS IMPORTANTE DE CE FICHIER N EST PAS SUR LE TROISIEME SAUT : c est que SANS
 *      `block`, le plan rende EXACTEMENT ce qu il rendait avant, OCTET POUR OCTET. Etendre un
 *      chemin qui porte de l argent ne doit rien changer a ceux qui n ont rien demande — et un
 *      calldata « presque pareil » est un calldata different.
 *
 * ⛔ LES FIXTURES SONT MESUREES SUR LA CHAINE le 2026-09-30, jamais inventees :
 *     USDC/MUc  0x17e1…1c73  sqrt 24238673428508397000179791066  fee 500    ts 10  token0 USDC
 *     MUc/TE    0x8d6a…15c9  sqrt 396113904605052806495          fee 10000  ts 80  token0 TE
 *   ⚠️ ET REGARDER CES DEUX-LA COTE A COTE : `fee` 10000 pour un `tickSpacing` 80. Un facteur 125.
 *     Passer l un pour l autre designerait une pool qui n existe pas.
 *
 * ⚠️ BORNE : ce fichier est PUR. Il ne prouve pas qu un achat aboutisse. Le prix spot ignore la
 *    PROFONDEUR, et TROIS sauts donnent TROIS occasions d echouer pour un seul clic.
 */
import assert from 'node:assert/strict';
import { planEthVersAction, sortieNSauts, sortieDeuxSauts, meilleurePoolPivot, WETH_BASE } from './plan-eth-block.js';
import { FEE_WALLET } from './frais-creation.js';

let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

/* ⛔ Pivots WETH/USDC : RECOPIES de `test-plan-eth-block.mjs`, qui les tient a jour.
 * ⛔ `famille: 'aerodrome'` est FACTUEL, pas un champ ajoute pour faire passer le test : ces trois
 *   adresses sont celles que `getPool` de la factory Aerodrome CL rend pour USDC/WETH aux
 *   espacements 10, 50 et 1 — re-mesure du 2026-09-30 au soir, sur les NEUF espacements declares. */
const PIVOTS = [
  { pool: '0x493e74eda2720e127baccc1a19b2d567bc14ab43', tickSpacing: 10, fee: 500, wethEst0: true,
    famille: 'aerodrome', sqrtPriceX96: '4102067387922704494368960' },
  { pool: '0x3fe04a59ebd38cf06080a6f60a98d124eb59392a', tickSpacing: 50, fee: 550, wethEst0: true,
    famille: 'aerodrome', sqrtPriceX96: '4101598917909346791088713' },
  { pool: '0x4e392fbfe4d0557c82d2f97f02ec39daa31516dd', tickSpacing: 1, fee: 80, wethEst0: true,
    famille: 'aerodrome', sqrtPriceX96: '4101408828941892267032113' },
];
const MUc = '0xb200000000000000000000fd2f87532b90095211';
const TE = '0x3c573bdd88008c94f025e5023212f28e5f39744c';
/* ⛔ `actionEst0: false` — token0 de la pool est USDC, MESURE. L inverser echangerait le sens du
 *   swap et rendrait un devis a l envers, sans aucune erreur. */
const POOL_ACTION = { pool: '0x17e1beb2cd65493da73ed4bbbc7becaaa0f91c73', tickSpacing: 10, fee: 500,
  actionEst0: false, famille: 'aerodrome', sqrtPriceX96: '24238673428508397000179791066' };
/* ⛔ `blockEst0: true` — token0 de la pool est TE (le block), MESURE. */
const POOL_BLOCK = { pool: '0x8d6ad9946b9220e666690e77ce49f933e1ff15c9', tickSpacing: 80, fee: 10000,
  blockEst0: true, famille: 'aerodrome', sqrtPriceX96: '396113904605052806495' };

const RECIPIENT = '0x041e9e88288c0c62b8549c50a759a74a1a65b6b7';
const MAINTENANT = 1790625759n;
const DEADLINE = MAINTENANT + 300n;
const UN_ETH = 10n ** 18n;
const deuxSauts = { action: MUc, montantWei: UN_ETH, poolAction: POOL_ACTION, poolsPivot: PIVOTS,
  recipient: RECIPIENT, deadline: DEADLINE, maintenant: MAINTENANT };
const troisSauts = { ...deuxSauts, block: TE, poolBlock: POOL_BLOCK };

cas('⛔⛔⛔ SANS `block`, LE PLAN NE CHANGE PAS D UN OCTET', () => {
  /* ⛔⛔ LA GARDE CENTRALE. Si ce cas tombe, la generalisation a change le calldata de TOUS les
   *     achats d actions qui marchent deja — sans que personne l ait demande. */
  const a = planEthVersAction(deuxSauts);
  const b = planEthVersAction({ ...deuxSauts, block: null, poolBlock: null });
  assert.equal(a.etat, 'PRET', a.pourquoi);
  assert.equal(a.appels[0].data, b.appels[0].data, 'passer `block: null` a change le calldata');
  assert.equal(a.appels[0].value, b.appels[0].value);
  /* ⛔⛔ CETTE ASSERTION ETAIT MORTE, ET JE L AI ATTRAPEE. Elle disait
   *     `a.chemin ? a.chemin.sauts : 2` alors que `chemin` n existait pas : elle retombait sur `2`
   *     et passait QUOI QU IL ARRIVE. Une assertion qui ne peut pas rougir rassure sans mesurer,
   *     ce qui est pire que pas d assertion du tout. Le champ existe maintenant, et on l EXIGE. */
  assert.ok(a.chemin, 'le plan ne dit pas son chemin : rien ne peut le verifier');
  assert.equal(a.chemin.sauts, 2, 'le chemin a deux sauts en compte ' + a.chemin.sauts);
  assert.equal(a.chemin.cheminOctets, 66, '20 + 23x2 = 66 octets attendus');
  assert.equal(a.chemin.sortie, MUc.toLowerCase(), 'le chemin a deux sauts ne finit pas sur l action');
  assert.deepEqual(a.chemin.via, ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913']);
});

cas('⛔⛔⛔ AVEC `block`, LE CHEMIN FAIT TROIS SAUTS ET FINIT SUR LE BLOCK', () => {
  const p = planEthVersAction(troisSauts);
  assert.equal(p.etat, 'PRET', p.pourquoi);
  /* ⛔ LE CALLDATA DIFFERE, sinon le troisieme saut ne serait nulle part. */
  const d2 = planEthVersAction(deuxSauts).appels[0].data;
  assert.notEqual(p.appels[0].data, d2, 'le calldata a trois sauts est IDENTIQUE a celui a deux');
  /* ⛔⛔ L ADRESSE DU BLOCK EST DANS LE CHEMIN, et l espacement 80 avec elle (0x000050).
   *     Sans ce controle, un chemin qui s arrete a l action passerait pour un chemin vers le block. */
  const sansPrefixe = TE.slice(2).toLowerCase();
  assert.ok(p.appels[0].data.toLowerCase().includes(sansPrefixe),
    'l adresse du block n est pas dans le calldata : la route ne va pas jusqu a lui');
  assert.ok(p.appels[0].data.toLowerCase().includes('000050' + sansPrefixe),
    'l espacement du dernier saut n est pas 80 (0x000050) juste avant le block');
  /* ⛔ `fee` 10000 NE DOIT PAS apparaitre comme espacement : ce serait 0x002710. */
  assert.ok(!p.appels[0].data.toLowerCase().includes('002710' + sansPrefixe),
    'le `fee` (10000) a ete encode a la place du `tickSpacing` (80) — la pool serait introuvable');
});

cas('⛔⛔⛔ LE MINIMUM GARANTI PORTE SUR LE BLOCK, PAS SUR L ACTION', () => {
  /* ⛔⛔ SI LE DEVIS S ARRETAIT A L ACTION, l ecran promettrait une quantite de MUc alors que le
   *     visiteur recoit du TE. Deux unites differentes derriere un seul chiffre — et la
   *     transaction reverterait, parce que le minimum passe au routeur porte sur la sortie FINALE.
   *   ⛔ On le prouve par un ORDRE DE GRANDEUR, pas par une egalite : la sortie a trois sauts n a
   *     aucune raison d egaler celle a deux. */
  const p3 = planEthVersAction(troisSauts);
  const p2 = planEthVersAction(deuxSauts);
  assert.ok(p3.minSortie > 0n, 'le minimum a trois sauts est nul');
  assert.notEqual(String(p3.minSortie), String(p2.minSortie),
    'le minimum a trois sauts EGALE celui a deux : le troisieme saut n est pas entre dans le devis');
  /* ⛔ Et il vaut bien ce que le calcul general rend, a la tolerance pres. */
  const brut = sortieNSauts({ entree: UN_ETH, sauts: [
    { sqrtPriceX96: PIVOTS[2].sqrtPriceX96, fee: PIVOTS[2].fee, entreeEst0: true },
    { sqrtPriceX96: POOL_ACTION.sqrtPriceX96, fee: POOL_ACTION.fee, entreeEst0: true },
    { sqrtPriceX96: POOL_BLOCK.sqrtPriceX96, fee: POOL_BLOCK.fee, entreeEst0: false },
  ] });
  assert.ok(brut && brut.etapes.length === 3, 'le calcul a trois sauts ne rend pas trois etapes');
});

cas('⛔⛔ LE PIVOT EST CHOISI SUR CE QUE LE VISITEUR RECOIT, PAS SUR CE QU IL TRAVERSE', () => {
  /* ⛔⛔ Choisir le pivot sur la sortie en ACTION optimiserait une etape intermediaire. Deux pivots
   *     qui donnent la meme quantite d action peuvent donner des quantites de BLOCK differentes. */
  const suite = [
    { sqrtPriceX96: POOL_ACTION.sqrtPriceX96, fee: POOL_ACTION.fee, entreeEst0: true },
    { sqrtPriceX96: POOL_BLOCK.sqrtPriceX96, fee: POOL_BLOCK.fee, entreeEst0: false },
  ];
  const candidats = PIVOTS.map((p) => ({ ...p, entreeEst0: p.wethEst0 }));
  const r = meilleurePoolPivot({ entree: UN_ETH, candidates: candidats, sautsApres: suite });
  assert.ok(r && r.sortie > 0n, 'aucun pivot ne rend de sortie sur trois sauts');
  assert.equal(r.etapes.length, 3, 'le devis ne traverse pas les trois sauts');
  /* ⛔ AUCUN AUTRE PIVOT NE FAIT MIEUX — sinon « meilleure » ne veut rien dire. */
  for (const c of candidats) {
    const s = sortieNSauts({ entree: UN_ETH, sauts: [c, ...suite] });
    if (s) assert.ok(s.sortie <= r.sortie, 'un pivot rend PLUS que celui retenu : le choix est faux');
  }
});

cas('⛔ `sortieDeuxSauts` RESTE EXACTEMENT CE QU ELLE ETAIT', () => {
  /* ⛔ Elle est devenue une enveloppe sur `sortieNSauts`. Sa forme de retour et ses refus ne
   *   doivent pas bouger : ses appelants ne demandaient rien. */
  const s1 = { sqrtPriceX96: PIVOTS[0].sqrtPriceX96, fee: PIVOTS[0].fee, entreeEst0: true };
  const s2 = { sqrtPriceX96: POOL_ACTION.sqrtPriceX96, fee: POOL_ACTION.fee, entreeEst0: true };
  const a = sortieDeuxSauts({ entree: UN_ETH, saut1: s1, saut2: s2 });
  const b = sortieNSauts({ entree: UN_ETH, sauts: [s1, s2] });
  assert.equal(String(a.sortie), String(b.sortie));
  assert.equal(String(a.intermediaire), String(b.etapes[0]));
  for (const mauvais of [null, undefined, 0, -1n]) {
    assert.equal(sortieDeuxSauts({ entree: mauvais, saut1: s1, saut2: s2 }), null);
    assert.equal(sortieNSauts({ entree: mauvais, sauts: [s1, s2] }), null);
  }
  assert.equal(sortieNSauts({ entree: UN_ETH, sauts: [] }), null, 'un chemin vide a rendu une sortie');
  assert.equal(sortieNSauts({ entree: UN_ETH, sauts: [s1, null] }), null, 'un saut nul a ete ignore');
});

cas('⛔⛔ UNE POOL DE BLOCK NON LUE EST REFUSEE, JAMAIS DEVINEE', () => {
  const refus = (o, motif) => {
    const p = planEthVersAction({ ...troisSauts, ...o });
    assert.equal(p.etat, 'REFUSE', 'accepte alors que : ' + motif);
    return p.pourquoi;
  };
  assert.match(refus({ poolBlock: null }, 'aucune pool de block'), /resolved on chain/i);
  assert.match(refus({ poolBlock: { ...POOL_BLOCK, pool: '0xabc' } }, 'adresse de pool tronquee'), /resolved on chain/i);
  /* ⛔ `blockEst0` DOIT ETRE LU : sans lui on ne sait pas dans quel sens le swap va, et un sens
   *   inverse rend un devis a l envers SANS erreur. */
  assert.match(refus({ poolBlock: { ...POOL_BLOCK, blockEst0: undefined } }, 'sens non lu'), /blockEst0/);
  assert.match(refus({ poolBlock: { ...POOL_BLOCK, tickSpacing: 0 } }, 'espacement nul'), /tickSpacing/);
  assert.match(refus({ block: '0x1234' }, 'adresse de block tronquee'), /whole block address/i);
  /* ⛔⛔ UN BLOCK QUI SERAIT L ACTION, L USDC OU WETH ferait un chemin qui NE CHAINE PAS. */
  assert.match(refus({ block: MUc }, 'block == action'), /cannot be the quote action/i);
  assert.match(refus({ block: WETH_BASE }, 'block == WETH'), /cannot be WETH/i);
  assert.match(refus({ block: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' }, 'block == USDC'),
    /cannot be the pivot currency/i);
  /* ⛔ Et donner `poolBlock` SANS `block` ne doit pas passer en silence pour un plan a deux sauts. */
  const p = planEthVersAction({ ...deuxSauts, poolBlock: POOL_BLOCK });
  assert.equal(p.etat, 'REFUSE', 'une pool de block sans block a ete ignoree au lieu d etre refusee');
});

cas('⛔⛔ LE FRAIS DE 0,1 % SURVIT AU TROISIEME SAUT', () => {
  /* ⛔⛔ C est la raison d etre de ce chemin : le montage `multicall([exactInput, sweepTokenWithFee])`
   *     doit porter jusqu au bout. Un troisieme saut qui ferait retomber sur le swap NU nous
   *     ferait servir du volume gratuitement. */
  const avec = planEthVersAction({ ...troisSauts, beneficiaireFrais: FEE_WALLET });
  assert.equal(avec.etat, 'PRET', avec.pourquoi);
  assert.ok(avec.appels[0].data.toLowerCase().startsWith('0xac9650d8'),
    'le calldata a trois sauts n est pas un `multicall` : le frais ne peut pas etre preleve');
  assert.ok(avec.appels[0].data.toLowerCase().includes('e0e189a0'),
    '`sweepTokenWithFee` est absent du multicall a trois sauts');
  assert.ok(avec.appels[0].data.toLowerCase().includes(FEE_WALLET.slice(2).toLowerCase()),
    'le wallet de frais n est pas dans le calldata');
  /* ⛔ SANS BENEFICIAIRE, PAS DE MONTAGE — un frais qui s applique « par defaut » est un frais cache. */
  const sans = planEthVersAction(troisSauts);
  assert.ok(!sans.appels[0].data.toLowerCase().startsWith('0xac9650d8'),
    'un multicall a frais est construit SANS beneficiaire : le frais serait invisible');
});

cas('⛔ LA VALEUR PART SUR L APPEL, ET IL N Y EN A QU UN', () => {
  const p = planEthVersAction(troisSauts);
  assert.equal(p.appels.length, 1, 'le chemin a trois sauts demande plus d une transaction');
  assert.equal(p.appels[0].value, '0x' + UN_ETH.toString(16), 'l ETH ne part pas avec l appel');
});

console.log('✓ test-plan-eth-trois-sauts : ' + n + ' cas');
console.log('   WETH -> USDC -> action -> block en UNE transaction, minimum sur la sortie FINALE,');
console.log('   pivot choisi sur ce que le visiteur RECOIT, et les 0,1 % survivent au 3e saut.');
console.log('   ⚠️ NE PROUVE PAS qu un achat aboutisse : le prix spot ignore la profondeur, et');
console.log('   TROIS sauts donnent TROIS occasions d echouer pour un seul clic.');
