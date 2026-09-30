/* test-une-route-une-factory.mjs — UN SEUL `exactInput` NE TRAVERSE PAS DEUX FACTORIES.
 *
 * ⛔⛔ LE DEFAUT QUE CE FICHIER EXISTE POUR TENIR. `planEthVersAction` fabrique du calldata
 *   AERODROME (`calldataExactInputCL`, `ROUTEUR_AERODROME_CL`). L invariant « toutes ces pools sont
 *   Aerodrome » etait VRAI mais IMPLICITE : il ne tenait qu a la discipline de l appelant.
 *   Un invariant implicite n est pas une garde.
 *
 * ⛔⛔ ET IL Y A DE QUOI SE TROMPER, C EST MESURE (2026-09-30) : OUSD/USDC porte ~10 M$ AU PAIR
 *   (Uniswap V4, poolId 0xdf5bde0f…, fee 100, ts 1, tick -1) et ZERO pool Aerodrome CL sur les NEUF
 *   espacements que la factory declare. Un routeur qui prend « la pool la plus profonde » JAMBE PAR
 *   JAMBE composerait WETH/USDC sur Aerodrome (3 pools mesurees) puis USDC/OUSD sur V4 : chaque
 *   jambe existe, toutes les pools sont reelles, ET L APPEL REVERTE. Le piege a l air correct.
 *
 * ⛔⛔⛔ ET CE FICHIER TIENT AUSSI LA MOITIE INVERSE, qui m a mordu : exiger la famille sur les
 *   routes DIRECTES faisait REFUSER TOUT LE PLAN pour une seule directe douteuse, alors que la
 *   route par le pivot marchait. C est `fail-closed sur une affordance efface le produit` — le
 *   motif qui a fait tomber les puces d achat de 13 a 2 EN PROD.
 *   ⇒ DEUX REGIMES : sur les jambes OBLIGATOIRES la famille est EXIGEE ; sur les directes, qui
 *     sont un bonus, elle FILTRE. Les deux moities se testent ici, parce qu une seule des deux
 *     rendrait le fichier vert sur la mauvaise.
 */
import { strict as assert } from 'node:assert';
import { planEthVersAction } from './plan-eth-block.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

/* Fixtures MESUREES sur la chaine : les trois pools USDC/WETH que la factory Aerodrome CL rend. */
const PIVOTS = [
  { pool: '0x4e392fbfe4d0557c82d2f97f02ec39daa31516dd', tickSpacing: 1, fee: 80, wethEst0: true,
    famille: 'aerodrome', sqrtPriceX96: '4101408828941892267032113' },
];
const MUc = '0xb200000000000000000000fd2f87532b90095211';
const TE = '0x3c573bdd88008c94f025e5023212f28e5f39744c';
const ACTION = { pool: '0x17e1beb2cd65493da73ed4bbbc7becaaa0f91c73', tickSpacing: 10, fee: 500,
  actionEst0: false, famille: 'aerodrome', sqrtPriceX96: '24238673428508397000179791066' };
const POOL_BLOCK = { pool: '0x8d6ad9946b9220e666690e77ce49f933e1ff15c9', tickSpacing: 80, fee: 10000,
  blockEst0: true, famille: 'aerodrome', sqrtPriceX96: '396113904605052806495' };
const base = { action: MUc, montantWei: 10n ** 16n, poolAction: ACTION, poolsPivot: PIVOTS,
  recipient: '0x041e9e88288c0c62b8549c50a759a74a1a65b6b7',
  deadline: 1790626059n, maintenant: 1790625759n };

const plan = (sur) => planEthVersAction({ ...base, ...sur });

cas('✅ TEMOIN POSITIF : tout Aerodrome, le plan est PRET', () => {
  /* ⛔ SANS CE TEMOIN, chaque REFUS ci-dessous pourrait venir d autre chose que de la famille. */
  assert.equal(plan({}).etat, 'PRET', 'la base doit etre PRET, sinon rien en dessous n est interpretable');
});

console.log('les jambes OBLIGATOIRES : la famille est EXIGEE');
cas('⛔ pool d action sans famille -> REFUSE', () => {
  const r = plan({ poolAction: { ...ACTION, famille: undefined } });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /market family it was proven on/i);
});
cas('⛔ un pivot sans famille -> REFUSE', () => {
  const r = plan({ poolsPivot: [{ ...PIVOTS[0], famille: undefined }] });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /market family it was proven on/i);
});
cas('⛔ la pool du 3e saut sans famille -> REFUSE', () => {
  const r = plan({ block: TE, poolBlock: { ...POOL_BLOCK, famille: undefined } });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /market family it was proven on/i);
});
/* ⛔ UNE CHAINE VIDE N EST PAS UNE FAMILLE. Sans ce cas, `famille: ''` passerait la garde. */
cas('⛔ une famille en chaine VIDE ne passe pas', () => {
  assert.equal(plan({ poolAction: { ...ACTION, famille: '' } }).etat, 'REFUSE');
});
/* ⛔ NI UN NOM QUI N EN EST PAS UN : un `dexId` d agregateur n est pas une provenance prouvee. */
cas('⛔ une famille non-chaine (nombre, objet, true) ne passe pas', () => {
  for (const f of [1, true, {}, null, ['aerodrome']]) {
    assert.equal(plan({ poolAction: { ...ACTION, famille: f } }).etat, 'REFUSE',
      'famille = ' + JSON.stringify(f) + ' a passe la garde');
  }
});

console.log('');
console.log('⛔⛔ LE PIEGE : chaque jambe existe, sur DEUX factories');
cas('un pivot Uniswap V4 + une action Aerodrome -> REFUSE, et le refus NOMME les deux', () => {
  const r = plan({ poolsPivot: [{ ...PIVOTS[0], famille: 'uniswap-v4' }] });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /mixes/i);
  assert.match(r.pourquoi, /aerodrome/);
  assert.match(r.pourquoi, /uniswap-v4/);
  /* ⛔ ET IL DIT QUE L APPEL REVERTERAIT : « impossible » se lirait comme une panne de l app. */
  assert.match(r.pourquoi, /would revert/i);
});
cas('le 3e saut sur une autre factory -> REFUSE aussi', () => {
  const r = plan({ block: TE, poolBlock: { ...POOL_BLOCK, famille: 'uniswap-v4' } });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /mixes/i);
});
cas('⛔ TOUT sur une autre factory -> REFUSE, et le refus dit OU aller', () => {
  /* ⛔ Une route coherente mais ailleurs n est PAS un melange : le message doit le distinguer,
   *   sinon l ecran dirait « pas achetable » alors que la profondeur est bien reelle ailleurs. */
  const r = plan({ poolAction: { ...ACTION, famille: 'uniswap-v4' },
    poolsPivot: [{ ...PIVOTS[0], famille: 'uniswap-v4' }] });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /is on uniswap-v4/i);
  assert.match(r.pourquoi, /Universal Router/i);
  /* ⛔ ET CE N EST PAS LE MESSAGE DE MELANGE : deux causes, deux phrases. */
  assert.ok(!/mixes/i.test(r.pourquoi), 'une route coherente ailleurs ne doit pas se dire « melangee »');
});

console.log('');
console.log('⛔⛔⛔ LES DIRECTES : elles FILTRENT, elles ne TUENT PAS le plan');
const directe = (famille) => ([{ pool: '0x20e5fad2661ee9eb0c04824524030af31943b62d', tickSpacing: 50,
  fee: 500, wethEst0: true, famille, sqrtPriceX96: '790000000000000000000000000000' }]);
cas('⛔ une directe d une AUTRE factory ne fait PAS refuser le plan', () => {
  const r = plan({ poolsDirectes: directe('uniswap-v4') });
  assert.equal(r.etat, 'PRET', 'une directe ecartee ne doit pas tuer l achat');
});
/* ⛔⛔ MA PREMIERE VERSION DE CES DEUX CAS COMPARAIT `plan.data`, UN CHAMP QUI N EXISTE PAS : les
 *   deux valaient `undefined`, l assertion passait trivialement, et elle etait VERTE ET CREUSE.
 *   C est le TEMOIN INVERSE qui l a attrapee, pas moi — une assertion « rien n a change » est
 *   toujours vraie quand on compare deux absences.
 * ✅ LE VRAI DISCRIMINANT EST `via` : 'PIVOT' ou 'DIRECT'. Le plan le NOMME, et c est exactement
 *   la question posee — quelle route a gagne le devis. */
cas('⛔ une directe hors factory n est PAS CHOISIE, meme au meilleur prix', () => {
  /* ⛔ C EST LA MOITIE QUI COMPTE. Ce `sqrtPriceX96` est volontairement tres favorable : retenue,
   *   la directe GAGNERAIT le devis. Le plan doit donc rester sur le pivot. */
  const avec = plan({ poolsDirectes: directe('uniswap-v4') });
  assert.equal(avec.etat, 'PRET');
  assert.equal(avec.via, 'PIVOT', 'une directe hors factory a gagne le devis — elle a ete empruntee');
});
cas('✅ TEMOIN INVERSE : une directe AERODROME tres favorable, elle, EST empruntee', () => {
  /* ⛔ SANS CE TEMOIN, l assertion precedente passerait meme si les directes etaient TOUTES
   *   ignorees — et la garde ne prouverait rien du tout. C est lui qui a revele que je comparais
   *   un champ inexistant. */
  const avec = plan({ poolsDirectes: directe('aerodrome') });
  assert.equal(avec.etat, 'PRET');
  assert.equal(avec.via, 'DIRECT',
    'une directe Aerodrome au meilleur prix n a pas ete choisie : le test ne discrimine pas');
});
cas('⛔ une directe sans famille est IGNOREE, pas fatale', () => {
  assert.equal(plan({ poolsDirectes: directe(undefined) }).etat, 'PRET');
});
cas('⛔ et elle n est pas empruntee non plus', () => {
  assert.equal(plan({ poolsDirectes: directe(undefined) }).via, 'PIVOT');
});
cas('⛔ une directe mal formee reste IGNOREE meme avec la bonne famille', () => {
  /* ⛔ Le contrat d origine de `poolsDirectes` : mal formee = ignoree, jamais fatale. La famille
   *   ne doit pas l avoir remplace. */
  const r = plan({ poolsDirectes: [{ pool: '0xabc', tickSpacing: 50, fee: 500, wethEst0: true,
    famille: 'aerodrome', sqrtPriceX96: '790000000000000000000000000000' }] });
  assert.equal(r.etat, 'PRET');
  assert.equal(r.via, 'PIVOT');
});

console.log('');
console.log(n + ' cas, 0 KO');
