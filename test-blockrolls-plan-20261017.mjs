/* test-blockrolls-plan-20261017.mjs - LES APPELS NON SIGNES DE BlockRolls SONT CEUX QUE LE CONTRAT COMPILE ATTEND.
 * AFFIRME : (1) selecteurs roll/rollWithPass/buyPass/settle/expire/fund = methodIdentifiers de l artefact forge (si present), et les
 *   topics Rolled/Settled = ceux de l ABI compilee ; (2) approve EXACT du prix (jamais infini), au jeton USDC, pour le contrat ;
 *   (3) guess hors bornes refuse AVANT la signature (6/10/19/9/8), pass actif non rachete, roll de pass sans pass refuse ;
 *   (4) fenetre de settle : cible -> TROP_TOT, cible+1..cible+256 -> REGLABLE, cible+257 -> PERDU (les bornes de settle()/expire()) ;
 *   (5) traitsDepuisHash = les epingles de parite ; gainPrevu = (pot * bps) / 1e4 ; (6) decodage Rolled/Settled d un log.
 * L acceptation reelle par le contrat (vrai USDC de Base sur un fork) est prouvee par banc-blockrolls-fork-20261017.mjs. */
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import * as P from './blockrolls-plan.js';
import { selecteur, topic } from './keccak.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const A = (h) => '0x' + h.repeat(20);
const C = A('cc'), USDC = A('83');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');

/* (1) */
const ART = new URL('./contracts/out/BlockRolls.sol/BlockRolls.json', import.meta.url);
if (existsSync(ART)) {
  const art = JSON.parse(readFileSync(ART, 'utf8'));
  const ids = art.methodIdentifiers;
  for (const s of [P.SIG_ROLL, P.SIG_ROLL_PASS, P.SIG_BUY_PASS, P.SIG_SETTLE, P.SIG_EXPIRE, P.SIG_FUND]) vu(ids[s] === selecteur(s).slice(2), 'selecteur ' + s + ' = ABI compilee');
  const sigEv = (nom) => { const e = art.abi.find((x) => x.type === 'event' && x.name === nom); return nom + '(' + e.inputs.map((i) => i.type).join(',') + ')'; };
  vu(sigEv('Rolled') === P.EV_ROLLED && sigEv('Settled') === P.EV_SETTLED, 'signatures Rolled/Settled = ABI compilee');
} else console.log('  (artefact forge absent : parite selecteurs NON verifiee ici)');

/* (2) */
const r = P.planRoll({ contrat: C, usdc: USDC, guess: [5, 9, 18, 8, 7] });
vu(r.etat === 'PRET' && r.appels.length === 2, 'roll : 2 appels');
vu(r.appels[0].to === USDC && r.appels[0].data === '0x095ea7b3' + mot(C) + mot(500000), 'approve EXACT 0,50 USDC au contrat');
vu(r.appels[1].to === C && r.appels[1].data === selecteur(P.SIG_ROLL) + [5, 9, 18, 8, 7].map(mot).join(''), 'roll(uint8[5]) : 5 mots statiques');
const ps = P.planPass({ contrat: C, usdc: USDC });
vu(ps.appels[0].data === '0x095ea7b3' + mot(C) + mot(10000000) && ps.appels[1].data === selecteur(P.SIG_BUY_PASS), 'pass : approve EXACT 10 USDC + buyPass()');
vu(P.planRoll({ contrat: C, usdc: USDC, guess: [0, 0, 0, 0, 0], rollPrice: 1234n }).appels[0].data.endsWith(mot(1234)), 'prix lu sur le contrat respecte');

/* (3) */
vu(P.refusGuess([5, 9, 18, 8, 7]).length === 0, 'maxima valides');
for (let i = 0; i < 5; i++) { const g = [0, 0, 0, 0, 0]; g[i] = P.TAILLES[i]; vu(P.planRoll({ contrat: C, usdc: USDC, guess: g }).etat === 'REFUSE', P.TRAITS[i] + ' = ' + P.TAILLES[i] + ' refuse'); }
vu(P.planRoll({ contrat: C, usdc: USDC, guess: [0, 0, 0, 0] }).etat === 'REFUSE' && P.planRoll({ contrat: C, usdc: USDC, guess: [0, 0, 0, 0, -1] }).etat === 'REFUSE'
  && P.planRoll({ contrat: C, usdc: USDC, guess: [0, 0, 0, 0, 1.5] }).etat === 'REFUSE', '4 traits, negatif, non entier : refuses');
vu(P.planRollAvecPass({ contrat: C, guess: [0, 0, 19, 0, 0] }).etat === 'REFUSE', 'roll de pass : guess hors bornes refuse');
vu(P.planPass({ contrat: C, usdc: USDC, pass: { rollsLeft: 3, expiresAt: 2000 }, maintenant: 1000 }).etat === 'REFUSE', 'pass actif : rachat refuse (comme PassActive)');
vu(P.planPass({ contrat: C, usdc: USDC, pass: { rollsLeft: 0, expiresAt: 2000 }, maintenant: 1000 }).etat === 'PRET'
  && P.planPass({ contrat: C, usdc: USDC, pass: { rollsLeft: 3, expiresAt: 2000 }, maintenant: 2000 }).etat === 'PRET', 'pass epuise ou expire : rachat admis');
vu(P.planRollAvecPass({ contrat: C, guess: [0, 0, 0, 0, 0], pass: { rollsLeft: 0, expiresAt: 2000 }, maintenant: 1000 }).etat === 'REFUSE'
  && P.planRollAvecPass({ contrat: C, guess: [0, 0, 0, 0, 0], pass: { rollsLeft: 1, expiresAt: 2000 }, maintenant: 2000 }).etat === 'REFUSE', 'pas de roll de pass sans pass actif');
const rp = P.planRollAvecPass({ contrat: C, guess: [1, 2, 3, 4, 5], pass: { rollsLeft: 1, expiresAt: 2000 }, maintenant: 1999 });
vu(rp.etat === 'PRET' && rp.appels.length === 1 && rp.appels[0].data === selecteur(P.SIG_ROLL_PASS) + [1, 2, 3, 4, 5].map(mot).join(''), 'roll de pass : un appel, aucun approve');
vu(P.planFund({ contrat: C, usdc: USDC, montant: 0 }).etat === 'REFUSE' && P.planFund({ contrat: C, usdc: USDC, montant: 7 }).appels[1].data === selecteur(P.SIG_FUND) + mot(7), 'fund : 0 refuse, montant encode');

/* (4) */
vu(P.etatReglement(1002, 1002).etat === 'TROP_TOT' && P.etatReglement(1002, 1000).blocsAvant === 3, 'cible : trop tot (3 blocs a attendre depuis le roll)');
vu(P.etatReglement(1002, 1003).etat === 'REGLABLE' && P.etatReglement(1002, 1258).etat === 'REGLABLE' && P.etatReglement(1002, 1258).blocsRestants === 0, 'cible+1 .. cible+256 : reglable');
vu(P.etatReglement(1002, 1259).etat === 'PERDU', 'cible+257 : perdu');
vu(P.planSettle({ contrat: C, rollId: 3, targetBlock: 1002, blocActuel: 1002 }).etat === 'REFUSE' && P.planSettle({ contrat: C, rollId: 3, targetBlock: 1002, blocActuel: 1259 }).etat === 'REFUSE', 'settle hors fenetre refuse');
vu(P.planSettle({ contrat: C, rollId: 3, targetBlock: 1002, blocActuel: 1003 }).appels[0].data === selecteur(P.SIG_SETTLE) + mot(3)
  && P.planExpire({ contrat: C, rollId: 3 }).appels[0].data === selecteur(P.SIG_EXPIRE) + mot(3), 'settle / expire encodes');

/* (5) */
vu(JSON.stringify(P.traitsDepuisHash('0x494a1264ca7b526bafe16d03fdb088252af07d5ece0f3e9a5e02cdef14e9968c')) === '[0,4,5,7,2]', 'traits = epingle de parite (teinte 360)');
vu(P.traitsDepuisHash('0x12') === null, 'hash illisible : null, jamais un defaut');
vu(P.scoreTraits([0, 4, 5, 7, 2], [0, 4, 5, 7, 3]) === 4, 'score = traits egaux');
vu(P.gainPrevu(100250000n, 5) === 50125000n && P.gainPrevu(100250000n, 4) === 10025000n && P.gainPrevu(100250000n, 3) === 1002500n && P.gainPrevu(100250000n, 2) === 0n, 'gainPrevu = les paliers du test forge');

/* (6) */
const logR = { address: C, topics: [topic(P.EV_ROLLED), '0x' + mot(7), '0x' + mot(A('a1'))], data: '0x' + [1, 2, 3, 4, 5, 1002, 0, 250000, 250000].map(mot).join('') };
const R = P.lireRolled([logR], C);
vu(R && R.rollId === 7n && R.player === A('a1') && R.guess.join() === '1,2,3,4,5' && R.targetBlock === 1002n && R.withPass === false && R.toPot === 250000n, 'Rolled decode');
const H = '0x' + 'ab'.repeat(32);
const logS = { address: C, topics: [topic(P.EV_SETTLED), '0x' + mot(7), '0x' + mot(A('a1'))], data: '0x' + mot(H) + [0, 4, 5, 7, 2, 5, 123, 456].map(mot).join('') };
const S = P.lireSettled([logS], C);
vu(S && S.blockHash === H && S.face.join() === '0,4,5,7,2' && S.score === 5 && S.payout === 123n && S.potAfter === 456n, 'Settled decode');
vu(P.lireSettled([{ ...logS, address: A('dd') }], C) === null, 'un log d un autre contrat est ignore');
console.log('ok blockrolls-plan - ' + n + ' assertions');
