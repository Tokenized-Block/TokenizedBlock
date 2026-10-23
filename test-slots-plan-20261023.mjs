/* test-slots-plan-20261023.mjs — LES APPELS NON SIGNES DE BlockSlots SONT CEUX QUE LE CONTRAT COMPILE ATTEND.
 * AFFIRME : (1) selecteurs spin/settle/settleMany/expire/fund/pot/pointsOf/wonOf/prizes/spins/settleableUntil = methodIdentifiers de
 *   l artefact forge (si present), et les signatures Spun / Settled / Expired = l ABI compilee ; (2) planSpins : UN approve EXACT de
 *   N x prix (jamais infini) au jeton USDC pour le contrat + N spin(), N <= 10, prix 0 refuse ; (3) fenetre v2 : cible..cible+2 ->
 *   TROP_TOT, cible+3..cible+256 -> REGLABLE, cible+257 -> PERDU ; settle refuse hors fenetre ; settleMany encode un uint256[] ; (4) decodage :
 *   Spun et Settled d un recu (les 3 hashes, les 3 faces, les points, le gain, le cumul du wallet), spins(id), prizes() ; (5) Denim : 256 blocs = 512 s
 *   a 2 s, 51,2 s a 200 ms ; (6) MUTANT : l approve d UN seul spin pour un lot -> l assertion de l approve exact ROUGIT ; (7) v3 :
 *   acceptCapped / expire en lot / payDev / Expired, et planReglement + bilanReglement sur les deux spins du verdict (pot 5 et pot 7),
 *   avec deux mutants du plan (le pot qui ne baisse pas, un spin court dans le lot) qui rougissent. */
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
  for (const s of [S.SIG_SPIN, S.SIG_SETTLE, S.SIG_SETTLE_MANY, S.SIG_ACCEPT_CAPPED, S.SIG_EXPIRE, S.SIG_PAY_DEV, S.SIG_FUND, S.SIG_POT, S.SIG_POINTS_OF, S.SIG_WON_OF, S.SIG_PRIZES, S.SIG_SPINS, S.SIG_SETTLEABLE_UNTIL]) vu(ids[s] === selecteur(s).slice(2), 'selecteur ' + s + ' = ABI compilee');
  const typ = (i) => (i.type === 'tuple' ? '(' + i.components.map(typ).join(',') + ')' : i.type);
  const sigEv = (nom) => { const e = art.abi.find((x) => x.type === 'event' && x.name === nom); return nom + '(' + e.inputs.map(typ).join(',') + ')'; };
  vu(sigEv('Spun') === S.EV_SPUN && sigEv('Settled') === S.EV_SETTLED && sigEv('Expired') === S.EV_EXPIRED && sigEv('DevPaid') === S.EV_DEV_PAID, 'signatures Spun / Settled / Expired (v3 : + refund) / DevPaid = ABI compilee');
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

/* (7) v3 (2e verdict adverse 2026-10-23) : acceptCapped, expire en lot, Expired, et le plan du Settle spin par spin */
vu(S.planAccepter({ contrat: C, spinId: 2, minimum: 2000000n }).appels[0].data === selecteur(S.SIG_ACCEPT_CAPPED) + mot(2) + mot(2000000), 'acceptCapped(2, 2 USDC) encode, le minimum vu en 2e argument');
const em = S.planExpireMany({ contrat: C, spinIds: [3, 5] });
vu(em.etat === 'PRET' && em.appels.length === 2 && em.appels[1].data === selecteur(S.SIG_EXPIRE) + mot(5) && S.planExpireMany({ contrat: C, spinIds: Array.from({ length: 11 }, (_, i) => i + 1) }).etat === 'REFUSE', 'expire en lot : un appel par spin, 10 au plus');
vu(S.planPayDev({ contrat: C }).appels[0].data === selecteur(S.SIG_PAY_DEV), 'payDev() encode');
const logE = { address: C, topics: [topic(S.EV_EXPIRED), '0x' + mot(3), '0x' + mot(A('a1'))], data: '0x' + mot(250000) };
const ex = S.lireExpiredTous([logE, { ...logE, address: A('dd') }], C);
vu(ex.length === 1 && ex[0].spinId === 3n && ex[0].player === A('a1') && ex[0].refund === 250000n, 'Expired decode (le remboursement), un autre contrat ignore');
vu(S.usdcPrecis(127862n) === '0.127862' && S.usdcPrecis(5000000n) === '5.00' && S.usdcPrecis(250000n) === '0.25' && S.usdcPrecis(0n) === '0.00' && S.usdcPrecis(4876544n) === '4.876544', 'usdcPrecis : exact, sans arrondi');
vu(S.bpsArrondi(210562n, 1000000n) === 2106 && S.bpsArrondi(74689n, 1000000n) === 747 && S.bpsArrondi(5n, 100000n) === 1 && S.bpsArrondi(4n, 100000n) === 0, 'bpsArrondi : au plus proche, demi vers le haut');
const pr = S.partsDuSpin(500001, 5000);
vu(pr.toPot === 250000n && pr.refund === 250001n, 'partsDuSpin : toPot arrondi bas, le reste rendable');
vu(JSON.stringify(S.trancheSpun({ scanne: null, tete: 5000, blocDeploiement: 100 })) === JSON.stringify({ de: 4002, jusqua: 5000 }) && S.trancheSpun({ scanne: 5000, tete: 5000 }) === null
  && JSON.stringify(S.trancheSpun({ scanne: 5000, tete: 5003 })) === JSON.stringify({ de: 4993, jusqua: 5003 }) && JSON.stringify(S.trancheSpun({ scanne: 1000, tete: 5000 })) === JSON.stringify({ de: 4002, jusqua: 5000 }), 'trancheSpun : 999 blocs au plus, puis les blocs nouveaux + 8 de recouvrement');
{
  /* le verdict : le MEME joueur, deux spins a 8 points (5 USDC chacun), un pot de 5 USDC */
  const T = ['0', '0', '0', '250000', '750000', '2000000', '3000000', '4000000', ...Array(8).fill('5000000')];
  const f8 = (p) => ({ points: p, faces: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]] });
  const pl = S.planReglement({ spins: [{ id: '2', t: 1012, ...f8(8) }, { id: '1', t: 1002, ...f8(8) }], pot: 5000000n, table: T, tete: 1015, refund: 250000n });
  vu(JSON.stringify(pl.lot) === '["1"]' && pl.lignes[0].decision === 'LOT' && pl.lignes[0].paie === 5000000n && pl.lignes[1].decision === 'COURT' && pl.lignes[1].paie === 0n && pl.lignes[1].manque === 5000000n && pl.potApres === 0n,
    'plan : dans l ordre du contrat, #1 paye en entier, #2 COURT (0 paye, 5 manquent) — le pot baisse spin apres spin');
  vu(S.phraseAvant(pl.lignes[1], 250000n) === 'Spin #2: 8 points → prize 5.00 USDC, but the pot holds 0.00 USDC after the spins above: 5.00 USDC short. Settle leaves it out. Wait for the pot to grow, or let its window pass: after block 1268 its 0.25 USDC refund can be claimed.', 'phrase avant : le manque de #2, en toutes lettres');
  const pl7 = S.planReglement({ spins: [{ id: '1', t: 1002, ...f8(8) }, { id: '2', t: 1012, ...f8(8) }], pot: 7000000n, table: T, tete: 1015, refund: 250000n });
  vu(pl7.lignes[1].decision === 'COURT' && pl7.lignes[1].paie === 2000000n && pl7.lignes[1].manque === 3000000n && pl7.lignes[1].apresLot === true, 'pot 7 : #2 touchera au moins 2 (3 manquent), apres le lot');
  const p0 = S.planReglement({ spins: [{ id: '4', t: 1002, ...f8(0) }, { id: '5', t: 1014, faces: null }, { id: '6', t: 1010, ...f8(8) }, { id: '7', t: 700, faces: null }], pot: 9000000n, table: T, tete: 1015, refund: 250000n });
  vu(p0.lignes.map((l) => l.decision).join() === 'MIEUX_REMBOURSE,ATTENDRE,LOT,REMBOURSABLE' && JSON.stringify(p0.remboursables) === '["7"]', 'plan : perdant hors du lot, trop tot, paye, fenetre passee');
  vu(S.planReglement({ spins: [{ id: '1', t: 1002, ...f8(8) }], pot: null, table: T, tete: 1015, refund: 250000n }).lignes[0].decision === 'NON_LU', 'pot non lu : rien n est envoye pour un spin payant');
  const bl = S.bilanReglement({ envoyes: [{ id: '1', t: 1002, prix: 5000000n }, { id: '2', t: 1012, prix: 5000000n }, { id: '3', t: 1002, prix: 5000000n }], settled: [{ spinId: 1n, points: 8, payout: 3000000n }], statuts: new Map([['2', 1], ['3', 1]]), tete: 1260, table: T });
  vu(bl[0].issue === 'PLAFONNE' && bl[0].manque === 2000000n && bl[1].issue === 'SAUTE' && bl[2].issue === 'FENETRE', 'bilan : plafonne (2 manquent), saute (fenetre ouverte), fenetre passee');
  vu(S.phraseApres(bl[0], 250000n) === 'Spin #1: 8 points, prize 5.00 USDC; the pot paid 3.00 USDC — 2.00 USDC short.' && /window closed before your settle was included — not settled; claim its 0\.25 USDC refund\./.test(S.phraseApres(bl[2], 250000n)), 'phrase apres : le manque, et la fenetre passee');
}

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
  /* v3 : le plan qui compte chaque prix contre le pot ENTIER (le defaut 1 du verdict) */
  const T = ['0', '0', '0', '250000', '750000', '2000000', '3000000', '4000000', ...Array(8).fill('5000000')];
  const f8 = { points: 8, faces: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]] };
  for (const [nom, de2, vers2] of [['le pot ne baisse pas spin apres spin', 'reste -= prix; return', 'return'], ['un spin court part dans le lot', "return { ...l, decision: 'COURT' };", "return { ...l, decision: 'LOT', paie: prix, manque: 0n };"]]) {
    vu(src.split(de2).length === 2, 'mutant plan « ' + nom + ' » : ancre unique');
    const u2 = new URL('./slots-plan.mutant-' + process.pid + '-' + n + '.js', import.meta.url);
    writeFileSync(u2, src.replace(de2, () => vers2));
    try {
      const M = await import(u2.href);
      const pl = M.planReglement({ spins: [{ id: '1', t: 1002, ...f8 }, { id: '2', t: 1012, ...f8 }], pot: 5000000n, table: T, tete: 1015, refund: 250000n });
      vu(JSON.stringify(pl.lot) !== '["1"]', 'MUTANT plan « ' + nom + ' » : le lot du verdict ROUGIT');
    } finally { try { unlinkSync(u2); } catch (_) {} }
  }
}
console.log('ok slots-plan - ' + n + ' assertions');
