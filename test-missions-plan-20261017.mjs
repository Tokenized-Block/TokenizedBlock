/* test-missions-plan-20261017.mjs - LES APPELS NON SIGNES DES MISSIONS SONT CEUX QUE LE CONTRAT COMPILE ATTEND.
 * AFFIRME : (1) les selecteurs postTask/claim = methodIdentifiers de l artefact forge (si present) ; (2) budget = (R + R*bonus/1e4)*maxDone
 *   comme _escrow, et l approve est EXACT (jamais infini) ; (3) les refus statiques de _checkPost sont dits AVANT la signature ;
 *   (4) claim : 4 + 32*7 tete, offset 0xe0, longueur 65, signature recopiee octet pour octet ; tickSpacing negatif en complement a deux.
 * L acceptation reelle par le contrat est prouvee par banc-missions-anvil-20261017.mjs (claim status 1). */
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { planPoster, planReclamer, budgetMission, SIG_POST, SIG_CLAIM } from './missions-plan.js';
import { selecteur } from './keccak.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const A = (h) => '0x' + h.repeat(20);
const C = A('cc'), BLK = A('b2'), AMZ = A('a7'), HOOK = A('70'), CIBLE = A('49');
const cle = { currency0: AMZ, currency1: BLK, fee: 0, tickSpacing: 200, hooks: HOOK };
const params = { rewardToken: BLK, reward: '10000000000000000000', maxDone: 3, perWallet: 1, expiry: 2000, target: CIBLE, topic0: '0x' + 'ab'.repeat(32), descHash: '0x' + 'cd'.repeat(32) };
const hold = { minBlock: '50', minPaired: 0, bonusMinBlock: '100', bonusBps: 1000, window: 86400 };
/* (1) */
const ART = new URL('./contracts/out/BlockMissionsV3.sol/BlockMissionsV3.json', import.meta.url);
if (existsSync(ART)) {
  const ids = JSON.parse(readFileSync(ART, 'utf8')).methodIdentifiers;
  vu(ids[SIG_POST] === selecteur(SIG_POST).slice(2) && ids[SIG_CLAIM] === selecteur(SIG_CLAIM).slice(2), 'selecteurs = l ABI compilee');
} else console.log('  (artefact forge absent : parite selecteurs NON verifiee ici)');
/* (2) */
vu(budgetMission(params, hold) === 33n * 10n ** 18n, 'budget = (10 + 1) x 3 = 33');
const p = planPoster({ contrat: C, cle, params, hold, maintenant: 1000 });
vu(p.etat === 'PRET' && p.appels[0].to === BLK && p.appels[0].data === '0x095ea7b3' + C.slice(2).padStart(64, '0') + (33n * 10n ** 18n).toString(16).padStart(64, '0'), 'approve EXACT du budget, au jeton de recompense');
vu(p.appels[1].to === C && p.appels[1].data.length === 2 + 8 + 64 * 18, 'postTask : 18 mots statiques');
/* (3) */
const refus = (h2, p2) => planPoster({ contrat: C, cle, params: { ...params, ...p2 }, hold: { ...hold, ...h2 }, maintenant: 1000 });
vu(refus({ minBlock: '0' }).etat === 'REFUSE', 'minBlock 0 refuse');
vu(refus({ window: 3600 }).etat === 'REFUSE' && refus({ window: 8 * 86400 }).etat === 'REFUSE', 'fenetre hors 24 h..7 j refusee');
vu(refus({ bonusBps: 0 }).etat === 'REFUSE' && refus({ bonusMinBlock: '10' }).etat === 'REFUSE', 'bonus sans palier / palier sous le minimum refuses');
vu(refus({}, { reward: '999' }).etat === 'REFUSE' && refus({}, { expiry: 999 }).etat === 'REFUSE' && refus({}, { expiry: 1000 + 31 * 86400 }).etat === 'REFUSE', 'recompense < 1000, fin passee, fin > 30 j refusees');
vu(refus({}, { target: BLK }).etat === 'REFUSE', 'cible = jeton de recompense refusee');
/* (4) */
const neg = planPoster({ contrat: C, cle: { ...cle, tickSpacing: -1 }, params, hold, maintenant: 1000 });
vu(neg.appels[1].data.slice(10 + 64 * 3, 10 + 64 * 4) === 'f'.repeat(64), 'tickSpacing -1 = complement a deux sur 256 bits');
const sig = '0x' + '11'.repeat(32) + '22'.repeat(32) + '1b';
const r = planReclamer({ contrat: C, taskId: 7, txHash: '0x' + '77'.repeat(32), held: { heldBlock: '70', heldPaired: '0', windowEnd: 123, deadline: 456 }, signature: sig }).appels[0];
const mots = r.data.slice(10).match(/.{64}/g);
vu(r.data.slice(0, 10) === selecteur(SIG_CLAIM) && mots.length === 7 + 1 + 3 && BigInt('0x' + mots[6]) === 224n && BigInt('0x' + mots[7]) === 65n, 'claim : tete 7 mots, offset 0xe0, longueur 65');
vu((mots[8] + mots[9] + mots[10]).startsWith(sig.slice(2)) && (mots[8] + mots[9] + mots[10]).length === 192, 'signature recopiee octet pour octet, completee a 96 octets');
assert.throws(() => planReclamer({ contrat: C, taskId: 7, txHash: '0x' + '77'.repeat(32), held: { heldBlock: 1, heldPaired: 0, windowEnd: 1, deadline: 1 }, signature: '0x1234' }));
n += 1;
console.log('ok missions-plan - ' + n + ' assertions');
