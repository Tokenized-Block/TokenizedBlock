/* test-routes-elargies.mjs — UNE ROUTE DIRECTE NE GAGNE QUE SI ELLE REND PLUS.
 *
 * ⛔⛔ D OU CA VIENT. Aerodrome, 2026-09-29 22:00 : « New tokenized stocks have landed on
 *     Aerodrome — Emissions are live ». Mesure du lendemain : 18 pools d actions tokenisees sur 33
 *     ont une GAUGE, et elles portent 16 070 637 $ de liquidite et 80 610 517 $ de volume 24 h —
 *     99,9 % du marche. Parmi elles, `GOOGLc/WETH`, `NVDAc/WETH` et `SPCXc/WETH` : des pools
 *     WETH <-> action DIRECTES, donc un saut de moins que le chemin WETH -> USDC -> action.
 *
 * ⛔⛔⛔ ET LE PIEGE QUE CE FICHIER EXISTE POUR FERMER : « MOINS DE SAUTS » N EST PAS « PLUS DE
 *      SORTIE ». `GOOGLc/WETH` fait 78 349 $ de liquidite contre 1 782 500 $ pour `GOOGLc/USDC` —
 *      VINGT-TROIS FOIS plus mince. Un saut de moins avec 23 fois moins de profondeur peut rendre
 *      MOINS. On ne choisit donc jamais par la FORME de la route : on cote les deux et on garde la
 *      meilleure SORTIE. C est un devis, pas un pari.
 *
 * ⚠️ BORNE : ce fichier est PUR et cote au prix SPOT. Le spot ignore la profondeur — c est pourquoi
 *    le devis reste un devis, et pourquoi la tolerance existe.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planEthVersAction, WETH_BASE } from './plan-eth-block.js';

let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

const MUc = '0xb200000000000000000000fd2f87532b90095211';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
/* ⛔ Fixtures MESUREES sur la chaine le 2026-09-30. */
/* ⛔ `famille: 'aerodrome'` est FACTUEL : `0x4e392fbf…` est la pool USDC/WETH que la factory
 *   Aerodrome CL rend a l espacement 1 (re-mesure du 2026-09-30 au soir). */
const PIVOT = { pool: '0x4e392fbfe4d0557c82d2f97f02ec39daa31516dd', tickSpacing: 1, fee: 80,
  wethEst0: true, famille: 'aerodrome', sqrtPriceX96: '4101408828941892267032113' };
const ACTION = { pool: '0x17e1beb2cd65493da73ed4bbbc7becaaa0f91c73', tickSpacing: 10, fee: 500,
  actionEst0: false, famille: 'aerodrome', sqrtPriceX96: '24238673428508397000179791066' };
const base = { action: MUc, montantWei: 10n ** 16n, poolAction: ACTION, poolsPivot: [PIVOT],
  recipient: '0x041e9e88288c0c62b8549c50a759a74a1a65b6b7',
  deadline: 1790626059n, maintenant: 1790625759n };

/* Une directe qui rend BEAUCOUP (prix volontairement favorable) et une qui rend PEU. */
/* ⛔⛔ LA ROUTE DIRECTE PORTE SA FAMILLE AUSSI, et c est le cas que ma premiere garde OUBLIAIT :
 *   elle listait la pool d action, les pivots et la pool de block, et laissait passer les directes
 *   — pourtant cotees, et susceptibles de GAGNER le devis. Garde vraie, mauvaise moitie. */
const directe = (sqrt) => ([{ pool: '0x20e5fad2661ee9eb0c04824524030af31943b62d', tickSpacing: 50,
  fee: 500, wethEst0: true, famille: 'aerodrome', sqrtPriceX96: sqrt }]);
const FAVORABLE = directe('790000000000000000000000000000');
const DEFAVORABLE = directe('7900000000000000000');

cas('⛔⛔⛔ SANS ROUTE DIRECTE, LE PLAN NE CHANGE PAS D UN OCTET', () => {
  /* ⛔⛔ LA GARDE CENTRALE. Elargir les routes ne doit rien changer a ceux qui n ont rien demande. */
  const a = planEthVersAction(base);
  const b = planEthVersAction({ ...base, poolsDirectes: null });
  const c = planEthVersAction({ ...base, poolsDirectes: [] });
  assert.equal(a.etat, 'PRET', a.pourquoi);
  assert.equal(a.appels[0].data, b.appels[0].data, '`poolsDirectes: null` a change le calldata');
  assert.equal(a.appels[0].data, c.appels[0].data, '`poolsDirectes: []` a change le calldata');
  assert.equal(a.via, 'PIVOT');
  assert.equal(a.chemin.sauts, 2);
});

cas('⛔⛔⛔ UNE DIRECTE QUI REND MOINS EST ECARTEE — ET LE PLAN RESTE IDENTIQUE', () => {
  /* ⛔⛔ LE CAS QUI COUTE DE L ARGENT. Si la route directe gagnait parce qu elle est plus COURTE,
   *     on servirait moins de jetons au visiteur pour le meme ETH, sur une pool 23 fois plus
   *     mince — et personne ne le verrait, puisque la transaction reussirait. */
  const nu = planEthVersAction(base);
  const avec = planEthVersAction({ ...base, poolsDirectes: DEFAVORABLE });
  assert.equal(avec.etat, 'PRET', avec.pourquoi);
  assert.equal(avec.via, 'PIVOT', 'une route directe DEFAVORABLE a ete retenue : on choisit par la forme');
  assert.equal(avec.chemin.sauts, 2);
  assert.equal(avec.appels[0].data, nu.appels[0].data,
    'le calldata differe alors que la directe devait etre ecartee');
  assert.equal(String(avec.sortieAttendue), String(nu.sortieAttendue));
});

cas('⛔⛔ UNE DIRECTE QUI REND PLUS EST RETENUE, ET LE CHEMIN PERD UN SAUT', () => {
  const nu = planEthVersAction(base);
  const avec = planEthVersAction({ ...base, poolsDirectes: FAVORABLE });
  assert.equal(avec.etat, 'PRET', avec.pourquoi);
  assert.equal(avec.via, 'DIRECT', 'la route directe FAVORABLE n a pas ete retenue');
  assert.equal(avec.chemin.sauts, 1, 'la route directe garde deux sauts : le pivot est reste dans le chemin');
  assert.equal(avec.chemin.cheminOctets, 43, '20 + 23x1 = 43 octets attendus');
  assert.ok(BigInt(avec.sortieAttendue) > BigInt(nu.sortieAttendue),
    'la route retenue rend MOINS que celle qu elle remplace');
  /* ⛔⛔ ET L USDC N EST PLUS DANS LE CHEMIN. Le laisser ferait un chemin qui NE CHAINE PAS, que la
   *     chaine refuserait avec une erreur illisible, loin de sa cause. */
  assert.deepEqual(avec.chemin.via, [], 'le chemin direct passe encore par un jeton intermediaire');
  assert.ok(!avec.appels[0].data.toLowerCase().includes(USDC.slice(2).toLowerCase()),
    'l USDC est encore dans le calldata d une route DIRECTE');
  assert.ok(avec.appels[0].data.toLowerCase().includes(WETH_BASE.slice(2).toLowerCase()));
  assert.ok(avec.appels[0].data.toLowerCase().includes(MUc.slice(2).toLowerCase()));
});

cas('⛔⛔ LE PLAN NE LEVE JAMAIS SUR UNE ROUTE DIRECTE — IL A DEJA LEVE UNE FOIS', () => {
  /* ⛔⛔⛔ CAS REEL DU 2026-09-30 : `pivot: bas(devis.pivot.pool)` lisait le pivot SANS CONDITION.
   *      Sur une route directe il n y en a pas, donc `devis.pivot` valait `null` et le module
   *      jetait une `TypeError` — pas un `REFUSE` avec une raison, une EXCEPTION au milieu de
   *      l ecran d achat. Un module qui leve tue son appelant. */
  const p = planEthVersAction({ ...base, poolsDirectes: FAVORABLE });
  assert.equal(p.etat, 'PRET');
  assert.equal(p.pivot, '0x20e5fad2661ee9eb0c04824524030af31943b62d',
    'le champ `pivot` ne nomme pas la pool du PREMIER saut de la route retenue');
  assert.equal(p.tickSpacingPivot, 50, 'l espacement du premier saut n est pas celui de la route retenue');
});

cas('⛔ UNE DIRECTE MAL FORMEE EST IGNOREE, PAS ACCEPTEE NI FATALE', () => {
  /* ⛔ Ces entrees viennent d un lecteur de chaine : une lecture partielle ne doit ni faire lever,
   *   ni entrer dans le devis avec un champ manquant. */
  const nu = planEthVersAction(base);
  for (const mauvaise of [
    [{ pool: '0xabc', tickSpacing: 50, fee: 500, wethEst0: true, sqrtPriceX96: '790000000000000000000000000000' }],
    [{ pool: '0x20e5fad2661ee9eb0c04824524030af31943b62d', tickSpacing: 0, fee: 500, wethEst0: true, sqrtPriceX96: '790000000000000000000000000000' }],
    [{ pool: '0x20e5fad2661ee9eb0c04824524030af31943b62d', tickSpacing: 50, fee: 500, sqrtPriceX96: '790000000000000000000000000000' }],
    [null], [undefined], 'pas un tableau', 42,
  ]) {
    const p = planEthVersAction({ ...base, poolsDirectes: mauvaise });
    assert.equal(p.etat, 'PRET', 'une directe mal formee a fait REFUSER tout le plan');
    assert.equal(p.via, 'PIVOT', 'une directe mal formee est entree dans le devis');
    assert.equal(p.appels[0].data, nu.appels[0].data, 'le calldata a bouge sur une directe ignoree');
  }
});

cas('⛔ LE LECTEUR CHERCHE LES DIRECTES, ET LES PASSE AU DEVIS', () => {
  /* ⛔ Le module pur peut etre parfait et le lecteur ne jamais lui donner de candidate :
   *   « la presence d un nom n est pas son usage ». */
  const src = readFileSync(new URL('./echange-eth.js', import.meta.url), 'utf8');
  assert.match(src, /const poolsDirectes = \[\];/, 'le lecteur ne construit aucune liste de routes directes');
  assert.match(src, /pad\(action\) \+ pad\(WETH_BASE\)/, 'le lecteur n interroge pas la factory sur action/WETH');
  assert.match(src, /poolsDirectes \}\);/, 'les routes directes ne sont jamais passees au plan');
  /* ⛔ ET UNE POOL VIDE N EST PAS UNE ROUTE : la meme garde que partout ailleurs ici. */
  assert.match(src, /if \(liqD === 0n\) continue;/, 'une pool directe a liquidite nulle entrerait dans le devis');
});


console.log('✓ test-routes-elargies : ' + n + ' cas');
console.log('   Une route DIRECTE ne gagne que si elle REND PLUS — jamais parce qu elle est plus');
console.log('   courte. GOOGLc/WETH est 23 fois plus mince que GOOGLc/USDC : la forme ne decide rien.');
console.log('   ⚠️ Cote au prix SPOT, qui ignore la profondeur. C est pourquoi la tolerance existe.');
