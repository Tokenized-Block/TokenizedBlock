/* test-ticketpot-plan-20261018.mjs - LES APPELS NON SIGNES DE TicketPot SONT CEUX QUE LE CONTRAT COMPILE ATTEND, ET LE DIGEST JS EST LE SIEN.
 * AFFIRME : (1) selecteurs = methodIdentifiers de l artefact forge (si present), topics = l ABI compilee, bytes20 en 3e position du claim,
 *   aucune fonction de retrait, runtime < 8 Ko ; (2) le digest JS = les pins que contracts/test/TicketPot.t.sol verifie contre claimDigest()
 *   (domaine 0x1ff3..., digest 0x80fb...) ; (3) approve EXACT + fund, jour futur / ferme refuses ; close : owner des la fin, tiers 12 h apres ;
 *   (4) claim encode (offset 0xc0, longueur 65, bytes20 aligne a GAUCHE) et ses refus AVANT la signature du wallet ; (5) rollover refuse
 *   avant la grace ; (6) partDuJour = floor(pot / n) ; jours ; (7) decodeurs.
 * L acceptation reelle par le contrat (vrai USDC de Base sur un fork) est prouvee par banc-ticketpot-fork-20261018.mjs. */
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import * as P from './ticketpot-plan.js';
import { selecteur, topic } from './keccak.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const A = (h) => '0x' + h.repeat(20);
const C = A('cc'), USDC = A('83'), W = A('a1'), T = '0x0102030405060708090a0b0c0d0e0f1011121314';
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');

/* (1) */
const ART = new URL('./contracts/out/TicketPot.sol/TicketPot.json', import.meta.url);
if (existsSync(ART)) {
  const art = JSON.parse(readFileSync(ART, 'utf8'));
  const ids = art.methodIdentifiers;
  for (const s of [P.SIG_FUND, P.SIG_CLOSE, P.SIG_CLAIM, P.SIG_ROLLOVER, P.SIG_ABSORB, P.SIG_DAY_POT, P.SIG_POT_AT_CLOSE, P.SIG_CLOSED, P.SIG_PAID, P.SIG_TICKET_OF, P.SIG_CLAIMED,
    P.SIG_VERIFIER, P.SIG_PAUSED, P.SIG_TOTAL_POTS, P.SIG_CLAIM_DIGEST, P.SIG_DOMAIN, P.SIG_CLAIMABLE_UNTIL]) vu(ids[s] === selecteur(s).slice(2), 'selecteur ' + s + ' = ABI compilee');
  const sigEv = (nom) => { const e = art.abi.find((x) => x.type === 'event' && x.name === nom); return nom + '(' + e.inputs.map((i) => i.type).join(',') + ')'; };
  vu(sigEv('Funded') === P.EV_FUNDED && sigEv('Closed') === P.EV_CLOSED && sigEv('Claimed') === P.EV_CLAIMED && sigEv('RolledOver') === P.EV_ROLLED_OVER, 'signatures Funded/Closed/Claimed/RolledOver = ABI compilee');
  const cl = art.abi.find((x) => x.type === 'function' && x.name === 'claim');
  vu(cl.inputs.map((i) => i.type).join() === 'uint32,address,bytes20,uint256,uint64,bytes' && cl.inputs.map((i) => i.name).join() === 'day,wallet,ticket,amount,deadline,sig', 'claim : (day, wallet, ticket bytes20, amount, deadline, sig) dans cet ordre');
  const ev = art.abi.find((x) => x.type === 'event' && x.name === 'Claimed');
  vu(ev.inputs[0].indexed && ev.inputs[1].indexed && !ev.inputs[2].indexed && ev.inputs[2].type === 'bytes20', 'Claimed : (day, wallet) INDEXES, le ticket en clair dans data');
  const ctor = art.abi.find((x) => x.type === 'constructor');
  vu(ctor.inputs.map((i) => i.type).join() === 'address,address,address' && ctor.inputs.map((i) => i.name).join() === 'usdc,verifier_,guardian_', 'constructeur (usdc, verifier, guardian) : 3 mots statiques');
  const runtime = (art.deployedBytecode.object.length - 2) / 2;
  vu(runtime < 8192, 'runtime ' + runtime + ' octets < 8 Ko');
  vu(!art.abi.some((x) => x.type === 'function' && /withdraw|sweep|rescue|recover/i.test(x.name)), 'aucune fonction de retrait dans l ABI');
} else console.log('  (artefact forge absent : parite selecteurs NON verifiee ici)');

/* (2) le digest : les PINS du test forge (test_PariteDigestAvecLeModuleJs) */
const FIXE = '0x1111111111111111111111111111111111111111';
vu(P.domaineSeparateur(8453, FIXE) === '0x1ff308e3d49e71d485f625a3bb98fb95e7e7ce1089fe71e450d06dac1bdb6b6d', 'domaine EIP-712 (TicketPot, 1, 8453, 0x11..11) = le pin forge');
const J = P.dayDeJourId('J2026-10-18');
vu(J === 20744 && P.claimableUntil(J) === 1792972800, 'J2026-10-18 = jour 20744, claimable jusqu a 1792972800 (les pins forge)');
const d = P.donneesClaim({ chainId: 8453, contrat: FIXE, day: J, wallet: W, ticket: T, amount: 10000000, deadline: P.claimableUntil(J) });
vu(P.digestClaim(d) === '0x80fba4d5aea469691a386204e79b4008f6e9a769fa05e2d7f0f27674e7d092b0', 'digestClaim = claimDigest() du contrat (pin forge)');
const autre = (patch) => P.digestClaim({ ...d, message: { ...d.message, ...(patch.message || {}) }, domain: { ...d.domain, ...(patch.domain || {}) } });
vu([{ message: { day: J + 1 } }, { message: { amount: '1' } }, { message: { wallet: A('b2') } }, { message: { ticket: A('77') } }, { message: { deadline: '1' } }, { domain: { chainId: 1 } }, { domain: { verifyingContract: C } }]
  .every((p) => autre(p) !== P.digestClaim(d)), 'jour, montant, wallet, ticket, echeance, chaine, contrat : chacun change le digest');
vu(d.domain.name === 'TicketPot' && d.domain.version === '1' && d.primaryType === 'Claim' && P.TYPES_CLAIM.Claim.map((x) => x.name + ':' + x.type).join() === 'day:uint32,wallet:address,ticket:bytes20,amount:uint256,deadline:uint64', 'donnees typees : domaine TicketPot/1, Claim(day,wallet,ticket,amount,deadline)');

/* (3) fund / close */
const NOW = P.dayEnd(J) + 3600; /* 2026-10-19 01:00 UTC */
const f = P.planFund({ contrat: C, usdc: USDC, day: J, montant: 10000000n, maintenant: NOW });
vu(f.etat === 'PRET' && f.appels.length === 2 && f.appels[0].to === USDC && f.appels[0].data === '0x095ea7b3' + mot(C) + mot(10000000), 'fund : approve EXACT 10 USDC au contrat');
vu(f.appels[1].to === C && f.appels[1].data === selecteur(P.SIG_FUND) + mot(J) + mot(10000000), 'fund(day, amount) encode');
vu(P.planFund({ contrat: C, usdc: USDC, day: J, montant: 0, maintenant: NOW }).etat === 'REFUSE' && P.planFund({ contrat: C, usdc: USDC, day: J, montant: 'x', maintenant: NOW }).etat === 'REFUSE', 'fund : 0 ou non entier refuse');
vu(P.planFund({ contrat: C, usdc: USDC, day: P.jourDe(NOW) + 1, montant: 1, maintenant: NOW }).etat === 'REFUSE', 'fund : jour futur refuse');
vu(/is closed/.test(P.planFund({ contrat: C, usdc: USDC, day: J, montant: 1, ferme: true, maintenant: NOW }).pourquoi), 'fund : jour ferme refuse (comme DayClosed), le message dit de financer aujourd hui');
vu(P.planClose({ contrat: C, day: J, maintenant: P.dayEnd(J) - 1, owner: true }).etat === 'REFUSE', 'close : jour pas fini refuse');
vu(P.planClose({ contrat: C, day: J, maintenant: P.dayEnd(J), owner: true }).appels[0].data === selecteur(P.SIG_CLOSE) + mot(J), 'close par l owner des la fin du jour : encode');
vu(P.planClose({ contrat: C, day: J, maintenant: P.closableByAnyoneAt(J) - 1 }).etat === 'REFUSE' && P.planClose({ contrat: C, day: J, maintenant: P.closableByAnyoneAt(J) }).etat === 'PRET', 'close par un tiers : 12 h apres la fin du jour (FUNDING_DELAY)');
vu(P.planClose({ contrat: C, day: J, owner: true, ferme: true, maintenant: NOW }).etat === 'REFUSE', 'close : deja ferme refuse');

/* (4) claim */
const SIG = '0x' + 'ab'.repeat(64) + '1b';
const apres = P.dayEnd(J) + 120, dl = P.claimableUntil(J);
const base = { contrat: C, day: J, wallet: W, ticket: T, amount: 10000000, deadline: dl, signature: SIG, maintenant: apres };
const c = P.planClaim(base);
vu(c.etat === 'PRET' && c.appels.length === 1 && c.appels[0].to === C, 'claim : un appel');
vu(c.appels[0].data === selecteur(P.SIG_CLAIM) + mot(J) + mot(W) + T.slice(2) + '0'.repeat(24) + mot(10000000) + mot(dl) + mot(0xc0) + mot(65) + 'ab'.repeat(64) + '1b' + '0'.repeat(62),
  'claim encode : 5 mots, bytes20 aligne a GAUCHE, offset 0xc0, longueur 65, signature sur 3 mots');
vu((c.appels[0].data.length - 10) / 64 === 10, '10 mots au total (5 statiques + offset + longueur + 3 pour 65 octets)');
vu(P.planClaim({ ...base, maintenant: P.dayEnd(J) - 1 }).etat === 'REFUSE', 'claim : jour pas fini refuse');
vu(/not closed yet/.test(P.planClaim({ ...base, ferme: false }).pourquoi) && P.planClaim({ ...base, ferme: true }).etat === 'PRET', 'claim : jour lu NON ferme refuse (comme NotClosed) ; ferme admis');
vu(/already received/.test(P.planClaim({ ...base, dejaPaye: true }).pourquoi), 'claim : wallet deja paye refuse (comme AlreadyClaimed)');
vu(P.planClaim({ ...base, deadline: apres - 1 }).etat === 'REFUSE', 'claim : echeance passee refusee');
vu(P.planClaim({ ...base, deadline: dl + 1 }).etat === 'REFUSE', 'claim : echeance au-dela de la grace refusee');
vu(P.planClaim({ ...base, amount: 0 }).etat === 'REFUSE', 'claim : montant 0 refuse');
vu(P.planClaim({ ...base, wallet: A('00') }).etat === 'REFUSE' && P.planClaim({ ...base, ticket: A('00') }).etat === 'REFUSE', 'claim : wallet ou ticket nul refuse');
vu(P.planClaim({ ...base, signature: '0x' + 'ab'.repeat(64) }).etat === 'REFUSE', 'claim : signature de 64 octets refusee');

/* (5) rollover */
vu(P.planRollover({ contrat: C, day: J, maintenant: dl }).etat === 'REFUSE' && P.planRollover({ contrat: C, day: J, maintenant: dl + 1 }).appels[0].data === selecteur(P.SIG_ROLLOVER) + mot(J), 'rollover : refuse jusqu a la derniere seconde de la grace, encode apres');
vu(P.planAbsorb({ contrat: C }).appels[0].data === selecteur(P.SIG_ABSORB), 'absorb encode');

/* (6) parts et jours */
vu(P.partDuJour(10000000n, 3) === 3333333n && P.partDuJour(10000000n, 1) === 10000000n && P.partDuJour(2n, 3) === 0n && P.partDuJour(0n, 3) === 0n && P.partDuJour(5n, 0) === 0n, 'partDuJour = floor(pot / n) ; 0 si pot < n, pot vide ou aucun ticket');
vu(P.jourDe(1700006400) === 19676 && P.jourDe(1700006399) === 19675 && P.dayEnd(19676) === 1700092800 && P.claimableUntil(19676) === 1700092800 + 7 * 86400 && P.closableByAnyoneAt(19676) === 1700092800 + 12 * 3600, 'jourDe / dayEnd / claimableUntil / closableByAnyoneAt = le contrat');
vu(P.jourIdDeDay(20744) === 'J2026-10-18' && P.dayDeJourId('J2026-10-18') === 20744 && P.dayDeJourId('2026-10-18') === null && P.dayDeJourId('J2026-13-45') === null, 'jourIdDeDay <-> dayDeJourId (l id de tirage-saison.js), ids faux -> null');
for (let k = 0; k < 400; k += 37) vu(P.dayDeJourId(P.jourIdDeDay(20000 + k)) === 20000 + k, 'aller-retour jour ' + (20000 + k));

/* (7) decodeurs */
const lf = { address: C, topics: [topic(P.EV_FUNDED), '0x' + mot(J), '0x' + mot(A('fe'))], data: '0x' + mot(10000000) + mot(12000000) };
const F = P.lireFunded([lf], C);
vu(F && F.day === J && F.from === A('fe') && F.amount === 10000000n && F.potAfter === 12000000n, 'Funded decode');
const lk = { address: C, topics: [topic(P.EV_CLOSED), '0x' + mot(J)], data: '0x' + mot(12000000) + mot(A('0e')) };
const K = P.lireClosed([lk], C);
vu(K && K.day === J && K.pot === 12000000n && K.by === A('0e'), 'Closed decode : le pot fige');
const lc = { address: C, topics: [topic(P.EV_CLAIMED), '0x' + mot(J), '0x' + mot(W)], data: '0x' + T.slice(2) + '0'.repeat(24) + mot(4000000) + mot(8000000) + mot(A('b0')) };
const Cl = P.lireClaimed([lc], C);
vu(Cl && Cl.day === J && Cl.wallet === W && Cl.ticket === T && Cl.amount === 4000000n && Cl.potLeft === 8000000n && Cl.by === A('b0'), 'Claimed decode : le ticket (bytes20 a gauche), la part, le reste, l appelant');
vu(P.lireClaimedTous([lc, { ...lc, topics: [topic(P.EV_CLAIMED), '0x' + mot(J), '0x' + mot(A('b2'))] }, lf], C).map((x) => x.wallet).join() === [W, A('b2')].join(), 'lireClaimedTous : un Claimed par holder, Funded ignore');
const lr = { address: C, topics: [topic(P.EV_ROLLED_OVER), '0x' + mot(J), '0x' + mot(J + 8)], data: '0x' + mot(2000000) + mot(5000000) };
const R = P.lireRolledOver([lr], C);
vu(R && R.fromDay === J && R.toDay === J + 8 && R.amount === 2000000n && R.potAfter === 5000000n, 'RolledOver decode');
vu(P.lireClaimed([{ ...lc, address: A('dd') }], C) === null && P.lireClaimed([lf], C) === null && P.lireFunded([], C) === null, 'un log d un autre contrat ou d un autre evenement est ignore');
console.log('ok ticketpot-plan - ' + n + ' assertions');
