/* test-duels-plan-20261018.mjs - LES APPELS NON SIGNES DE BlockDuels SONT CEUX QUE LE CONTRAT COMPILE ATTEND.
 * AFFIRME : (1) selecteurs create/join/settle/cancel/refundExpired/claim et lectures = methodIdentifiers de l artefact forge, topics
 *   Created/Joined/Settled/Refunded/Cancelled = ABI compilee, et l ordre du getter duels(id) = celui de l ABI ;
 *   (2) approve EXACT de la mise (jamais infini), au JETON du duel, pour le contrat, puis create / join encodes mot a mot ;
 *   (3) refus AVANT la signature, aux memes bornes que le contrat : mise < 100000 ou > uint96, expiration hors 600 s .. 7 j, guess hors
 *   bornes (6/10/19/9/8), jeton non admis, rejoindre son propre duel, un duel pas ouvert / expire, une mise ou un jeton differents ;
 *   (4) fenetre : cible -> TROP_TOT, cible+1..cible+256 -> REGLABLE, cible+257 -> REMBOURSABLE (les bornes de settle()/refundExpired()) ;
 *   (5) partage = splitOf du contrat (90 / 7 / reste au dev ; somme exacte ; poussiere au dev, valeurs epinglees par forge) ;
 *   (6) decodage Created / Joined / Settled (gain et egalite) / Refunded / Cancelled d un log, et du retour de duels(id) ;
 *   (7) la face et le score = ceux de blockrolls-plan.js (MEME module, pas une copie).
 * L acceptation reelle par le contrat (vrai USDC de Base sur un fork) est prouvee par banc-duels-fork-20261018.mjs.
 * DUELS_PLAN=chemin : rejoue ce test contre une COPIE mutee (muter-duels-plan) ; par defaut ./duels-plan.js. */
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { selecteur, topic } from './keccak.js';
import * as BR from './blockrolls-plan.js';
const CIBLE = process.env.DUELS_PLAN ? pathToFileURL(path.resolve(process.env.DUELS_PLAN)).href : './duels-plan.js';
const P = await import(CIBLE);
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const A = (h) => '0x' + h.repeat(20);
const C = A('cc'), USDC = A('83'), NVDA = A('4e'), MOI = A('a1'), LUI = A('b2');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const APPROVE = '0x095ea7b3';

/* (1) */
const ART = new URL('./contracts/out/BlockDuels.sol/BlockDuels.json', import.meta.url);
vu(existsSync(ART), 'artefact forge BlockDuels present (sinon la parite des selecteurs ne serait pas verifiee)');
const art = JSON.parse(readFileSync(ART, 'utf8'));
for (const s of [P.SIG_CREATE, P.SIG_JOIN, P.SIG_SETTLE, P.SIG_CANCEL, P.SIG_REFUND, P.SIG_CLAIM, P.SIG_TOKEN_OK, P.SIG_DUELS, P.SIG_NEXT_ID, P.SIG_OWED, P.SIG_SETTLEABLE_UNTIL, P.SIG_SPLIT_OF])
  vu(art.methodIdentifiers[s] === selecteur(s).slice(2), 'selecteur ' + s + ' = ABI compilee');
const sigEv = (nom) => { const e = art.abi.find((x) => x.type === 'event' && x.name === nom); return e ? nom + '(' + e.inputs.map((i) => i.type).join(',') + ')' : null; };
vu(sigEv('Created') === P.EV_CREATED && sigEv('Joined') === P.EV_JOINED && sigEv('Settled') === P.EV_SETTLED && sigEv('Refunded') === P.EV_REFUNDED && sigEv('Cancelled') === P.EV_CANCELLED && sigEv('Owed') === P.EV_OWED,
  'signatures Created/Joined/Settled/Refunded/Cancelled/Owed = ABI compilee');
const idx = (nom) => art.abi.find((x) => x.type === 'event' && x.name === nom).inputs.map((i) => (i.indexed ? 'I' : '-')).join('');
vu(idx('Created') === 'II----' && idx('Joined') === 'II--' && idx('Settled') === 'I-----' && idx('Refunded') === 'I--', 'indexes : Created (id, creator), Joined (id, joiner), Settled (id), Refunded (id) -- comme le decodeur les lit');
const getter = art.abi.find((x) => x.type === 'function' && x.name === 'duels').outputs.map((o) => o.name + ':' + o.type).join(',');
vu(getter === P.CHAMPS_DUEL.map(([k, t]) => k + ':' + t).join(','), 'duels(id) rend ' + P.CHAMPS_DUEL.length + ' mots dans l ordre de CHAMPS_DUEL (' + getter + ')');
const ctor = art.abi.find((x) => x.type === 'constructor').inputs.map((i) => i.name + ':' + i.type).join(',');
vu(ctor === 'usdc:address,devWallet:address,rewardPool:address,guardian:address', 'constructeur (usdc, devWallet, rewardPool, guardian) : 4 adresses');
const sol = readFileSync(new URL('./contracts/src/BlockDuels.sol', import.meta.url), 'utf8');
const cst = (k) => BigInt((sol.match(new RegExp('constant ' + k + ' = ([^;]+);')) || ['', 'NaN'])[1].replace(/_/g, '').replace('7 days', '604800').replace('type(uint96).max', String(2n ** 96n - 1n)));
vu(cst('MIN_STAKE') === P.MIN_STAKE && cst('MAX_STAKE') === P.MAX_STAKE && cst('MIN_EXPIRY') === BigInt(P.MIN_EXPIRY) && cst('MAX_EXPIRY') === BigInt(P.MAX_EXPIRY)
  && cst('WINNER_BPS') === P.WINNER_BPS && cst('POOL_BPS') === P.POOL_BPS && cst('SETTLE_WINDOW') === BigInt(P.FENETRE) && cst('TARGET_DELAY') === BigInt(P.DELAI_CIBLE),
  'les bornes du module = les constantes du contrat (mise, expiration, 90 / 7, 256, +2)');

/* (2) */
const g = [5, 9, 18, 8, 7];
const c = P.planCreer({ contrat: C, jeton: USDC, mise: 5000000n, guess: g, expireDans: 3600 });
vu(c.etat === 'PRET' && c.appels.length === 2, 'creer : 2 appels');
vu(c.appels[0].to === USDC && c.appels[0].data === APPROVE + mot(C) + mot(5000000), 'creer : approve EXACT 5 USDC, au jeton, pour le contrat');
vu(c.appels[1].to === C && c.appels[1].data === selecteur(P.SIG_CREATE) + mot(USDC) + mot(5000000) + g.map(mot).join('') + mot(3600), 'create(token, stake, guess[5], expiresIn) : 8 mots statiques');
const cA = P.planCreer({ contrat: C, jeton: NVDA, mise: '2000000000000000000', guess: [0, 0, 0, 0, 0], expireDans: 600, admis: true });
vu(cA.etat === 'PRET' && cA.appels[0].to === NVDA && cA.appels[0].data.endsWith(mot(2n * 10n ** 18n)) && cA.appels[1].data.slice(10, 74) === mot(NVDA), 'creer en action tokenisee admise : approve au jeton de l action, montant brut 18 decimales');
const j = P.planRejoindre({ contrat: C, id: 7, guess: [1, 2, 3, 4, 5], wallet: LUI, duel: { creator: MOI, status: 1, expiresAt: 5000, token: USDC, stake: 5000000n }, maintenant: 4999 });
vu(j.etat === 'PRET' && j.appels.length === 2 && j.appels[0].to === USDC && j.appels[0].data === APPROVE + mot(C) + mot(5000000), 'rejoindre : approve EXACT de la mise LUE sur le duel, au jeton du duel');
vu(j.appels[1].to === C && j.appels[1].data === selecteur(P.SIG_JOIN) + mot(7) + [1, 2, 3, 4, 5].map(mot).join(''), 'join(id, guess[5]) : 6 mots statiques');
vu(P.planSettle({ contrat: C, id: 7 }).appels[0].data === selecteur(P.SIG_SETTLE) + mot(7)
  && P.planCancel({ contrat: C, id: 7 }).appels[0].data === selecteur(P.SIG_CANCEL) + mot(7)
  && P.planRefundExpired({ contrat: C, id: 7 }).appels[0].data === selecteur(P.SIG_REFUND) + mot(7), 'settle / cancel / refundExpired : un appel, l id');
vu(P.planClaim({ contrat: C, jeton: USDC, vers: LUI }).appels[0].data === selecteur(P.SIG_CLAIM) + mot(USDC) + mot(LUI), 'claim(token, to) encode');
vu([c, j].every((p) => p.appels.every((a) => !/f{64}/.test(a.data))), 'jamais d approbation infinie');

/* (3) */
const cr = (o) => P.planCreer({ contrat: C, jeton: USDC, mise: 5000000n, guess: [0, 0, 0, 0, 0], expireDans: 3600, ...o }).etat;
vu(cr({ mise: 99999n }) === 'REFUSE' && cr({ mise: 0 }) === 'REFUSE' && cr({ mise: 100000n }) === 'PRET' && cr({ mise: 2n ** 96n }) === 'REFUSE' && cr({ mise: 2n ** 96n - 1n }) === 'PRET' && cr({ mise: 'x' }) === 'REFUSE' && cr({ mise: -1 }) === 'REFUSE',
  'mise : 99999, 0, 2^96, illisible, negative refuses ; 100000 et 2^96-1 admis (BadStake)');
vu(cr({ expireDans: 599 }) === 'REFUSE' && cr({ expireDans: 604801 }) === 'REFUSE' && cr({ expireDans: 600 }) === 'PRET' && cr({ expireDans: 604800 }) === 'PRET' && cr({ expireDans: 1.5 }) === 'REFUSE',
  'expiration : 599 s et 7 j + 1 refuses, 600 s et 7 j admis (BadExpiry)');
for (let i = 0; i < 5; i++) { const x = [0, 0, 0, 0, 0]; x[i] = BR.TAILLES[i]; vu(cr({ guess: x }) === 'REFUSE', 'creer : ' + BR.TRAITS[i] + ' = ' + BR.TAILLES[i] + ' refuse (BadGuess)'); }
vu(cr({ admis: false }) === 'REFUSE' && cr({ admis: true }) === 'PRET' && cr({ jeton: 'pas une adresse' }) === 'REFUSE', 'creer : jeton non admis (tokenOk lu = false) ou illisible refuse');
const rj = (o, d = {}) => P.planRejoindre({ contrat: C, id: 7, guess: [1, 2, 3, 4, 5], wallet: LUI, duel: { creator: MOI, status: 1, expiresAt: 5000, token: USDC, stake: 5000000n, ...d }, maintenant: 4999, ...o }).etat;
vu(rj({ wallet: MOI }) === 'REFUSE' && rj({ wallet: MOI.toUpperCase().replace('0X', '0x') }) === 'REFUSE', 'rejoindre son PROPRE duel refuse (OwnDuel), casse comprise');
vu(rj({ maintenant: 5000 }) === 'REFUSE' && rj({ maintenant: 4999 }) === 'PRET', 'rejoindre a expiresAt refuse, une seconde avant admis (Expired)');
vu(rj({}, { status: 2 }) === 'REFUSE' && rj({}, { status: 4 }) === 'REFUSE' && rj({}, { status: 0 }) === 'REFUSE', 'rejoindre un duel deja rejoint / annule / inexistant refuse (NotOpen)');
vu(rj({ guess: [6, 0, 0, 0, 0] }) === 'REFUSE' && rj({ admis: false }) === 'REFUSE' && rj({ admis: true }) === 'PRET', 'rejoindre : guess hors bornes refuse ; jeton retire (tokenOk false) refuse');
vu(P.planRejoindre({ contrat: C, id: 7, guess: [1, 2, 3, 4, 5], wallet: LUI }).etat === 'REFUSE', 'rejoindre SANS le duel lu sur la chaine : refuse (la mise et le jeton ne se devinent pas)');

/* (4) */
vu(P.etatReglement(1002, 1002).etat === 'TROP_TOT' && P.etatReglement(1002, 1000).blocsAvant === 3, 'cible : trop tot (3 blocs a attendre depuis le join)');
vu(P.etatReglement(1002, 1003).etat === 'REGLABLE' && P.etatReglement(1002, 1258).etat === 'REGLABLE' && P.etatReglement(1002, 1258).blocsRestants === 0, 'cible+1 .. cible+256 : reglable');
vu(P.etatReglement(1002, 1259).etat === 'REMBOURSABLE', 'cible+257 : remboursable en entier (refundExpired)');
vu(P.planSettle({ contrat: C, id: 3, targetBlock: 1002, blocActuel: 1002 }).etat === 'REFUSE' && P.planSettle({ contrat: C, id: 3, targetBlock: 1002, blocActuel: 1259 }).etat === 'REFUSE'
  && P.planSettle({ contrat: C, id: 3, targetBlock: 1002, blocActuel: 1258 }).etat === 'PRET', 'settle : refuse au bloc cible et apres la fenetre, admis au dernier bloc');
const rf = (duel, o = {}) => P.planRefundExpired({ contrat: C, id: 3, duel, maintenant: 5000, blocActuel: 1259, ...o }).etat;
vu(rf({ status: 2, targetBlock: 1002 }) === 'PRET' && rf({ status: 2, targetBlock: 1002 }, { blocActuel: 1258 }) === 'REFUSE', 'refundExpired d un duel rejoint : refuse tant qu il est reglable, admis a cible+257');
vu(rf({ status: 1, expiresAt: 5000 }) === 'PRET' && rf({ status: 1, expiresAt: 5001 }) === 'REFUSE' && rf({ status: 3 }) === 'REFUSE' && rf({ status: 4 }) === 'REFUSE', 'refundExpired d un duel ouvert : admis a expiresAt, refuse avant ; regle ou annule refuse');
vu(P.planCancel({ contrat: C, id: 3, wallet: LUI, duel: { creator: MOI, status: 1 } }).etat === 'REFUSE' && P.planCancel({ contrat: C, id: 3, wallet: MOI, duel: { creator: MOI, status: 2 } }).etat === 'REFUSE'
  && P.planCancel({ contrat: C, id: 3, wallet: MOI, duel: { creator: MOI, status: 1 } }).etat === 'PRET', 'cancel : seul le createur, avant le join');
vu(P.etatDuel({ status: 1, expiresAt: 5000 }, { maintenant: 4999, blocActuel: 1 }) === 'OUVERT' && P.etatDuel({ status: 1, expiresAt: 5000 }, { maintenant: 5000, blocActuel: 1 }) === 'EXPIRE'
  && P.etatDuel({ status: 2, targetBlock: 1002 }, { maintenant: 0, blocActuel: 1002 }) === 'TROP_TOT' && P.etatDuel({ status: 2, targetBlock: 1002 }, { maintenant: 0, blocActuel: 1003 }) === 'REGLABLE'
  && P.etatDuel({ status: 2, targetBlock: 1002 }, { maintenant: 0, blocActuel: 1259 }) === 'REMBOURSABLE' && P.etatDuel({ status: 3 }, {}) === 'REGLE' && P.etatDuel({ status: 4 }, {}) === 'ANNULE' && P.etatDuel({ status: 5 }, {}) === 'REMBOURSE',
  'etatDuel : OUVERT / EXPIRE / TROP_TOT / REGLABLE / REMBOURSABLE / REGLE / ANNULE / REMBOURSE');

/* (5) */
const s1 = P.partage(100001n);
vu(s1.pot === 200002n && s1.gagnant === 180001n && s1.pool === 14000n && s1.dev === 6001n, 'partage(100001) = splitOf epingle par forge : 180001 / 14000 / 6001 (poussiere au dev)');
const s2 = P.partage(5000000n);
vu(s2.gagnant === 9000000n && s2.pool === 700000n && s2.dev === 300000n, 'partage(5 USDC) : 9 / 0,70 / 0,30 USDC');
for (const st of [100000n, 123457n, 999999999n, 2n ** 96n - 1n, 7n * 10n ** 17n + 3n]) { const s = P.partage(st); vu(s.gagnant + s.pool + s.dev === 2n * st && s.dev >= (2n * st * 300n) / 10000n, 'partage(' + st + ') : somme = pot exactement, dev >= 3 %'); }

/* (6) */
const logC = { address: C, topics: [topic(P.EV_CREATED), '0x' + mot(7), '0x' + mot(MOI)], data: '0x' + [mot(USDC), mot(5000000), ...g.map(mot), mot(1700010000)].join('') };
const Cr = P.lireCreated([logC], C);
vu(Cr && Cr.id === 7n && Cr.creator === MOI && Cr.token === USDC && Cr.stake === 5000000n && Cr.guess.join() === g.join() && Cr.expiresAt === 1700010000, 'Created decode');
const logJ = { address: C, topics: [topic(P.EV_JOINED), '0x' + mot(7), '0x' + mot(LUI)], data: '0x' + [1, 2, 3, 4, 5, 1002].map(mot).join('') };
const Jo = P.lireJoined([logJ], C);
vu(Jo && Jo.id === 7n && Jo.joiner === LUI && Jo.guess.join() === '1,2,3,4,5' && Jo.targetBlock === 1002n, 'Joined decode');
const H = '0x' + 'ab'.repeat(32);
const logS = { address: C, topics: [topic(P.EV_SETTLED), '0x' + mot(7)], data: '0x' + mot(H) + mot(4) + mot(2) + mot(MOI) + mot(9000000) };
const Se = P.lireSettled([logS], C);
vu(Se && Se.id === 7n && Se.blockHash === H && Se.scoreA === 4 && Se.scoreB === 2 && Se.winner === MOI && Se.payout === 9000000n && Se.egalite === false, 'Settled decode (gain)');
const logT = { address: C, topics: [topic(P.EV_SETTLED), '0x' + mot(8)], data: '0x' + mot(H) + mot(3) + mot(3) + mot(0) + mot(0) };
vu(P.lireSettled([logT], C).egalite === true && P.lireSettled([logT], C).winner === null, 'Settled decode (egalite : winner null, egalite true)');
const logR = { address: C, topics: [topic(P.EV_REFUNDED), '0x' + mot(8)], data: '0x' + mot(5000000) + mot(5000000) };
vu(P.lireRefunded([logR], C).toCreator === 5000000n && P.lireRefunded([logR], C).toJoiner === 5000000n, 'Refunded decode');
vu(P.lireCancelled([{ address: C, topics: [topic(P.EV_CANCELLED), '0x' + mot(9)], data: '0x' }], C).id === 9n, 'Cancelled decode');
vu(P.lireSettled([{ ...logS, address: A('dd') }], C) === null && P.lireCreated([logJ], C) === null && P.lireJoined([{ ...logJ, data: '0x' + mot(1) }], C) === null, 'un log d un autre contrat, d un autre evenement ou tronque : null');
const retour = '0x' + [mot(MOI), mot(1700010000), mot(2), mot(BR_pack([5, 9, 18, 8, 7])), mot(LUI), mot(1002), mot(BR_pack([0, 0, 0, 0, 0])), mot(USDC), mot(5000000)].join('');
const D = P.lireDuel(retour);
vu(D && D.creator === MOI && D.expiresAt === 1700010000 && D.status === 2 && D.statut === 'Joined' && D.guessA.join() === '5,9,18,8,7' && D.joiner === LUI && D.targetBlock === 1002 && D.guessB.join() === '0,0,0,0,0' && D.token === USDC && D.stake === 5000000n,
  'lireDuel : le retour de duels(id) decode (guess deballes comme le contrat _unpack)');
vu(P.lireDuel('0x' + mot(1)) === null, 'retour tronque : null');

/* (7) */
vu(P.traitsDepuisHash === BR.traitsDepuisHash && P.scoreTraits === BR.scoreTraits && P.refusGuess === BR.refusGuess, 'face, score et bornes du guess = blockrolls-plan.js (le MEME module)');
vu(JSON.stringify(P.traitsDepuisHash('0x494a1264ca7b526bafe16d03fdb088252af07d5ece0f3e9a5e02cdef14e9968c')) === '[0,4,5,7,2]', 'face = epingle de parite (teinte 360)');
const sc = P.scoresDuel('0x494a1264ca7b526bafe16d03fdb088252af07d5ece0f3e9a5e02cdef14e9968c', [0, 4, 5, 7, 3], [0, 4, 0, 0, 0]);
vu(sc && sc.scoreA === 4 && sc.scoreB === 2 && sc.gagnant === 'A' && P.scoresDuel('0x494a1264ca7b526bafe16d03fdb088252af07d5ece0f3e9a5e02cdef14e9968c', [0, 0, 0, 0, 0], [0, 1, 1, 1, 1]).gagnant === 'EGALITE', 'scoresDuel : A 4 contre B 2 -> A ; 1 contre 1 -> EGALITE');

function BR_pack(x) { return (x[0] << 16) | (x[1] << 12) | (x[2] << 7) | (x[3] << 3) | x[4]; }
console.log('ok duels-plan - ' + n + ' assertions' + (process.env.DUELS_PLAN ? ' (contre ' + process.env.DUELS_PLAN + ')' : ''));
