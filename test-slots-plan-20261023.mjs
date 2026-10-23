/* test-slots-plan-20261023.mjs — LES APPELS NON SIGNES DE BlockSlots SONT CEUX QUE LE CONTRAT COMPILE ATTEND.
 * AFFIRME : (1) selecteurs spin/settle/settleMany/expire/fund/pot/pointsOf/wonOf/prizes/spins/settleableUntil = methodIdentifiers de
 *   l artefact forge (si present), et les signatures Spun / Settled / Expired = l ABI compilee ; (2) planSpins : UN approve EXACT de
 *   N x prix (jamais infini) au jeton USDC pour le contrat + N spin(), N <= 10, prix 0 refuse ; (3) fenetre v2 : cible..cible+2 ->
 *   TROP_TOT, cible+3..cible+256 -> REGLABLE, cible+257 -> PERDU ; settle refuse hors fenetre ; settleMany encode un uint256[] ; (4) decodage :
 *   Spun et Settled d un recu (les 3 hashes, les 3 faces, les points, le gain, le cumul du wallet), spins(id), prizes() ; (5) Denim : 256 blocs = 512 s
 *   a 2 s, 51,2 s a 200 ms ; (6) MUTANT : l approve d UN seul spin pour un lot -> l assertion de l approve exact ROUGIT. */
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import * as S from './slots-plan.js';
import { selecteur, topic } from './keccak.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const A = (h) => '0x' + h.repeat(20);
const C = A('cc'), USDC = A('83');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');

/* (1) */
const ART = new URL('./contracts/out/BlockSlots.sol/BlockSlots.json', import.meta.url);
if (existsSync(ART)) {
  const art = JSON.parse(readFileSync(ART, 'utf8'));
  const ids = art.methodIdentifiers;
  for (const s of [S.SIG_SPIN, S.SIG_SETTLE, S.SIG_SETTLE_MANY, S.SIG_EXPIRE, S.SIG_FUND, S.SIG_POT, S.SIG_POINTS_OF, S.SIG_WON_OF, S.SIG_PRIZES, S.SIG_SPINS, S.SIG_SETTLEABLE_UNTIL]) vu(ids[s] === selecteur(s).slice(2), 'selecteur ' + s + ' = ABI compilee');
  const typ = (i) => (i.type === 'tuple' ? '(' + i.components.map(typ).join(',') + ')' : i.type);
  const sigEv = (nom) => { const e = art.abi.find((x) => x.type === 'event' && x.name === nom); return nom + '(' + e.inputs.map(typ).join(',') + ')'; };
  vu(sigEv('Spun') === S.EV_SPUN && sigEv('Settled') === S.EV_SETTLED && sigEv('Expired') === S.EV_EXPIRED, 'signatures Spun / Settled / Expired = ABI compilee');
} else console.log('  (artefact forge absent : parite selecteurs NON verifiee ici)');

/* (2) */
const un = S.planSpin({ contrat: C, usdc: USDC, spinPrice: 500000n });
vu(un.etat === 'PRET' && un.appels.length === 2 && un.appels[0].to === USDC && un.appels[0].data === '0x095ea7b3' + mot(C) + mot(500000) && un.appels[1].to === C && un.appels[1].data === selecteur(S.SIG_SPIN), 'un spin : approve EXACT 0,50 USDC au contrat, puis spin()');
const lot = S.planSpins({ contrat: C, usdc: USDC, n: 10, spinPrice: 500000n });
vu(lot.etat === 'PRET' && lot.appels.length === 11 && lot.prix === '5000000' && lot.appels[0].data === '0x095ea7b3' + mot(C) + mot(5000000), '10 spins : UN approve EXACT de 10 x 0,50 = 5 USDC');
vu(lot.appels.slice(1).every((a) => a.to === C && a.data === selecteur(S.SIG_SPIN)), '10 spins : dix spin()');
vu(S.planSpins({ contrat: C, usdc: USDC, n: 11, spinPrice: 500000n }).etat === 'REFUSE' && S.planSpins({ contrat: C, usdc: USDC, n: 0, spinPrice: 500000n }).etat === 'REFUSE' && S.planSpins({ contrat: C, usdc: USDC, n: 1.5, spinPrice: 500000n }).etat === 'REFUSE', '11, 0 ou 1,5 spin : refuse');
vu(S.planSpins({ contrat: C, usdc: USDC, n: 1, spinPrice: 0 }).etat === 'REFUSE', 'prix 0 : refuse');
vu(S.planSpins({ contrat: 'pas une adresse', usdc: USDC, n: 1, spinPrice: 1 }).etat === 'REFUSE', 'contrat illisible : refuse');
vu(!/f{64}/.test(lot.appels[0].data), 'jamais d approbation infinie');

/* (3) */
vu(S.etatReglement(1002, 1002).etat === 'TROP_TOT' && S.etatReglement(1002, 1004).etat === 'TROP_TOT' && S.etatReglement(1002, 1005).etat === 'REGLABLE' && S.etatReglement(1002, 1258).etat === 'REGLABLE' && S.etatReglement(1002, 1259).etat === 'PERDU', 'fenetre v2 : cible..cible+2 trop tot, cible+3..cible+256 reglable, cible+257 perdu');
vu(S.planSettle({ contrat: C, spinId: 3, targetBlock: 1002, blocActuel: 1004 }).etat === 'REFUSE' && S.planSettle({ contrat: C, spinId: 3, targetBlock: 1002, blocActuel: 1259 }).etat === 'REFUSE', 'settle hors fenetre refuse (cible + 2, cible + 257)');
vu(S.planSettle({ contrat: C, spinId: 3, targetBlock: 1002, blocActuel: 1005 }).appels[0].data === selecteur(S.SIG_SETTLE) + mot(3), 'settle(3) encode');
vu(S.planSettleMany({ contrat: C, spinIds: [4, 9] }).appels[0].data === selecteur(S.SIG_SETTLE_MANY) + mot(32) + mot(2) + mot(4) + mot(9) && S.planSettleMany({ contrat: C, spinIds: [] }).etat === 'REFUSE', 'settleMany([4, 9]) encode ; vide refuse');
vu(S.planExpire({ contrat: C, spinId: 7 }).appels[0].data === selecteur(S.SIG_EXPIRE) + mot(7), 'expire(7)');
vu(S.planFund({ contrat: C, usdc: USDC, montant: 0 }).etat === 'REFUSE' && S.planFund({ contrat: C, usdc: USDC, montant: 9 }).appels[0].data === '0x095ea7b3' + mot(C) + mot(9) && S.planFund({ contrat: C, usdc: USDC, montant: 9 }).appels[1].data === selecteur(S.SIG_FUND) + mot(9), 'fund : 0 refuse ; approve EXACT + fund');
vu(S.appelPointsDe(A('a1')) === selecteur(S.SIG_POINTS_OF) + mot(A('a1')) && S.appelSpin(5) === selecteur(S.SIG_SPINS) + mot(5), 'lectures pointsOf / spins encodees');

/* (4) */
const logS = { address: C, topics: [topic(S.EV_SPUN), '0x' + mot(12), '0x' + mot(A('a1'))], data: '0x' + [1002, 250000, 250000].map(mot).join('') };
const sp = S.lireSpunTous([logS, { ...logS, address: A('dd') }], C);
vu(sp.length === 1 && sp[0].spinId === 12n && sp[0].player === A('a1') && sp[0].targetBlock === 1002 && sp[0].toPot === 250000n, 'Spun decode (et le meme log d un AUTRE contrat est ignore)');
const faces = [[1, 2, 3, 4, 5], [1, 2, 0, 4, 6], [1, 9, 3, 0, 7]];
const H3 = ['ab', 'cd', 'ef'].map((x) => '0x' + x.repeat(32));
const logT = { address: C, topics: [topic(S.EV_SETTLED), '0x' + mot(12), '0x' + mot(A('a1'))], data: '0x' + H3.map(mot).join('') + faces.flat().map(mot).join('') + [6, 5000000, 1234, 40].map(mot).join('') };
const st = S.lireSettledTous([logT], C);
vu(st.length === 1 && JSON.stringify(st[0].blockHashes) === JSON.stringify(H3) && JSON.stringify(st[0].faces) === JSON.stringify(faces) && st[0].points === 6 && st[0].payout === 5000000n && st[0].potAfter === 1234n && st[0].playerPoints === 40n, 'Settled decode : les 3 hashes (un par bloc), 3 faces, points, gain, pot apres, cumul du wallet');
vu(S.points(faces) === 6, 'les points recalcules sur les faces du log = ceux du log (brelan + brelan... ici 3 + 1 + 1 + 1 = 6)');
vu(S.lireSettledTous([{ ...logT, data: logT.data.slice(0, -64) }], C).length === 0, 'Settled tronque : ignore');
const spin = S.lireSpin('0x' + mot(A('a1')) + mot(1002) + mot(1));
vu(spin && spin.player === A('a1') && spin.targetBlock === 1002 && spin.status === 1 && S.lireSpin('0x') === null, 'spins(id) decode');
const pz = S.lirePrizes('0x' + Array.from({ length: 16 }, (_, k) => mot(k * 10)).join(''));
vu(pz && pz.length === 16 && pz[15] === 150n && S.lirePrizes('0x' + mot(1)) === null, 'prizes() decode (16 mots)');

/* (5) */
vu(S.secondesFenetre(2000) === 512 && S.secondesFenetre(200) === 51.2, 'Denim : 256 blocs = 512 s a 2 s/bloc, 51,2 s a 200 ms/bloc');

/* (6) MUTANT : l approve ne couvre qu UN spin */
{
  const srcUrl = new URL('./slots-plan.js', import.meta.url);
  const src = readFileSync(srcUrl, 'utf8').replace(/\r\n/g, '\n');
  const de = 'const total = BigInt(spinPrice) * BigInt(k);';
  vu(src.split(de).length === 2, 'mutant planSpins : le motif de l approve total existe une fois');
  const mutUrl = new URL('./slots-plan.mutant-' + process.pid + '.js', import.meta.url);
  writeFileSync(mutUrl, src.replace(de, 'const total = BigInt(spinPrice);'));
  try {
    const M = await import(mutUrl.href);
    const lm = M.planSpins({ contrat: C, usdc: USDC, n: 10, spinPrice: 500000n });
    vu(lm.appels[0].data !== '0x095ea7b3' + mot(C) + mot(5000000), 'MUTANT approve d un seul spin : l assertion « approve EXACT de N x prix » ROUGIT');
  } finally { try { unlinkSync(mutUrl); } catch (_) {} }
}
console.log('ok slots-plan - ' + n + ' assertions');
