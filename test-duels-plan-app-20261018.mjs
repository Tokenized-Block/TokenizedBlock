/* test-duels-plan-app-20261018.mjs — duels-plan-app.js (les duels cote app) : encodeurs NON SIGNES (approve EXACT + create / join, cancel,
 * settle, refundExpired), partage 90 / 7 / 3 exact, lecture des evenements (et de leurs variantes), etats et « toujours un chemin de retour ».
 * Mutants (copie a cote de la source, effacee apres) : mise minimum retiree, poussiere d arrondi perdue, borne de fenetre decalee, join de son
 * propre duel, approve d un montant different de la mise, guess non verifie a la lecture. Chacun DOIT faire rougir son assertion.
 * NE PROUVE PAS : la parite avec le contrat COMPILE (BlockDuels ecrit en parallele) — selecteurs et topics sont ceux de l interface partagee. */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import * as D from './duels-plan-app.js';
import { selecteur, topic } from './keccak.js';
import { traitsDepuisHash, scoreTraits, TAILLES } from './blockrolls-plan.js';
import { guessDepuisApparence } from './rolls-jeu.js';

let n = 0;
const vu = (c, m) => { if (!c) { console.error('KO ' + m); process.exit(1); } n++; };
const C = '0x' + 'c'.repeat(40), USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', A = '0x' + '1'.repeat(40), B = '0x' + '2'.repeat(40), NVDA = '0x' + '7'.repeat(40);
const G = [1, 2, 3, 4, 5], G2 = [0, 0, 0, 0, 0], T = 1760800000;
const mots = (data, de = 10) => (data.slice(de).match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
const motA = (x) => x.slice(2).padStart(64, '0');
const motU = (v) => BigInt(v).toString(16).padStart(64, '0');

/* ── create : approve EXACT + create(token, stake, guess, expiresIn) ── */
const pc = D.planCreate({ contrat: C, token: USDC, stake: 1000000n, guess: G, expiresIn: 3600 });
vu(pc.etat === 'PRET' && pc.appels.length === 2, 'create : deux appels');
vu(pc.appels[0].to === USDC && pc.appels[0].data.startsWith('0x095ea7b3') && pc.appels[0].data === '0x095ea7b3' + motA(C) + motU(1000000n), 'approve EXACT de la mise au contrat, sur le jeton (selecteur canonique 0x095ea7b3)');
vu(pc.appels[1].to === C && pc.appels[1].data.startsWith(selecteur('create(address,uint256,uint8[5],uint64)')) && pc.appels[1].data.length === 10 + 8 * 64, 'create : selecteur de l interface, 8 mots');
{ const w = mots(pc.appels[1].data); vu(w[0] === BigInt(USDC) && w[1] === 1000000n && w.slice(2, 7).map(Number).join() === G.join() && w[7] === 3600n, 'create : token, mise, guess, expiresIn relus mot pour mot'); }
vu(D.planCreate({ contrat: C, token: USDC, stake: 0n, guess: G, expiresIn: 3600 }).etat === 'REFUSE', 'mise 0 : REFUSE');
vu(D.planCreate({ contrat: C, token: USDC, stake: 99999n, guess: G, expiresIn: 3600 }).etat === 'REFUSE' && D.planCreate({ contrat: C, token: USDC, stake: 100000n, guess: G, expiresIn: 3600 }).etat === 'PRET', 'mise 99 999 refusee, 100 000 acceptee (borne de l interface)');
vu(D.planCreate({ contrat: C, token: USDC, stake: 100000n, guess: G, expiresIn: 599 }).etat === 'REFUSE' && D.planCreate({ contrat: C, token: USDC, stake: 100000n, guess: G, expiresIn: 600 }).etat === 'PRET', 'expiresIn 599 refuse, 600 accepte');
vu(D.planCreate({ contrat: C, token: USDC, stake: 100000n, guess: G, expiresIn: 604800 }).etat === 'PRET' && D.planCreate({ contrat: C, token: USDC, stake: 100000n, guess: G, expiresIn: 604801 }).etat === 'REFUSE', 'expiresIn 7 jours accepte, 7 jours + 1 s refuse');
vu(D.planCreate({ contrat: C, token: USDC, stake: 100000n, guess: [6, 0, 0, 0, 0], expiresIn: 3600 }).etat === 'REFUSE' && D.planCreate({ contrat: C, token: USDC, stake: 100000n, guess: [0, 0, 0, 0], expiresIn: 3600 }).etat === 'REFUSE', 'guess hors bornes ou a 4 traits : REFUSE');
vu(D.planCreate({ contrat: C, token: '0x' + '0'.repeat(40), stake: 100000n, guess: G, expiresIn: 3600 }).etat === 'REFUSE', 'jeton zero : REFUSE');
vu(D.planCreate({ contrat: C, token: NVDA, stake: 5n * 10n ** 17n, guess: G, expiresIn: 3600 }).appels[0].to === NVDA, 'une action : l approve vise l action, pas l USDC');

/* ── join ── */
const ouvert = { id: '7', creator: A, token: NVDA, stake: 250000n, guessA: G, expiresAt: T + 600, joiner: null, settled: null, cancelled: false, refunded: false };
const pj = D.planJoin({ contrat: C, duel: ouvert, guess: G2, moi: B, maintenant: T });
vu(pj.etat === 'PRET' && pj.appels[0].to === NVDA && pj.appels[0].data === '0x095ea7b3' + motA(C) + motU(250000n), 'join : approve EXACT de la MEME mise, sur le jeton DU duel');
vu(pj.appels[1].data === selecteur('join(uint256,uint8[5])') + motU(7) + G2.map(motU).join(''), 'join : selecteur de l interface + id + guess');
vu(D.planJoin({ contrat: C, duel: ouvert, guess: G2, moi: A, maintenant: T }).etat === 'REFUSE', 'join de son propre duel : REFUSE');
vu(D.planJoin({ contrat: C, duel: { ...ouvert, joiner: B }, guess: G2, moi: B, maintenant: T }).etat === 'REFUSE', 'duel deja pris : REFUSE');
vu(D.planJoin({ contrat: C, duel: ouvert, guess: G2, moi: B, maintenant: T + 541 }).etat === 'REFUSE' && D.planJoin({ contrat: C, duel: ouvert, guess: G2, moi: B, maintenant: T + 540 }).etat === 'PRET', 'a moins de 60 s de l expiration : REFUSE ; a 60 s pile : PRET');
vu(D.planJoin({ contrat: C, duel: { ...ouvert, settled: {} }, guess: G2, moi: B, maintenant: T }).etat === 'REFUSE' && D.planJoin({ contrat: C, duel: { ...ouvert, cancelled: true }, guess: G2, moi: B, maintenant: T }).etat === 'REFUSE', 'duel regle ou annule : REFUSE');
vu(D.planJoin({ contrat: C, duel: ouvert, guess: G2, moi: null, maintenant: T }).etat === 'REFUSE', 'sans wallet : REFUSE');
/* cancel / settle / refund */
vu(D.planCancel({ contrat: C, id: 7 }).appels[0].data === selecteur('cancel(uint256)') + motU(7), 'cancel(id)');
vu(D.planRefund({ contrat: C, id: 7 }).appels[0].data === selecteur('refundExpired(uint256)') + motU(7), 'refundExpired(id)');
vu(D.planSettle({ contrat: C, id: 7 }).appels[0].data === selecteur('settle(uint256)') + motU(7), 'settle(id)');
vu(D.planSettle({ contrat: C, id: 7, targetBlock: 100, blocActuel: 100 }).etat === 'REFUSE' && D.planSettle({ contrat: C, id: 7, targetBlock: 100, blocActuel: 101 }).etat === 'PRET'
  && D.planSettle({ contrat: C, id: 7, targetBlock: 100, blocActuel: 356 }).etat === 'PRET' && D.planSettle({ contrat: C, id: 7, targetBlock: 100, blocActuel: 357 }).etat === 'REFUSE', 'settle : refuse a la cible, ouvert de cible+1 a cible+256, refuse a cible+257 (blockhash nul)');

/* ── partage 90 / 7 / 3 : la somme est EXACTE, la poussiere va au dev ── */
const p1 = D.partage(1000000n);
vu(p1.pot === 2000000n && p1.gagnant === 1800000n && p1.pool === 140000n && p1.dev === 60000n, '1 USDC chacun : 1.8 au gagnant, 0.14 au pool, 0.06 au dev');
const p2 = D.partage(100001n);
vu(p2.pot === 200002n && p2.gagnant === 180001n && p2.pool === 14000n && p2.dev === 6001n, 'mise impaire : la poussiere d arrondi va au dev (6001)');
{ let mal = 0; for (let i = 0; i < 2000; i++) { const s = 100000n + BigInt(i) * 7919n * 1000003n; const p = D.partage(s); if (p.gagnant + p.pool + p.dev !== 2n * s || p.dev < (2n * s * 300n) / 10000n) mal++; } vu(mal === 0, '2000 mises : gagnant + pool + dev = pot, le dev jamais sous 3 %'); }
vu(D.partage('x') === null && D.partage(-1n) === null, 'mise illisible : null');

/* ── lecture des evenements ── */
const t0 = (sig) => topic(sig), idT = (i) => '0x' + motU(i), adrT = (x) => '0x' + motA(x);
let li = 0;
const log = (sig, topics, data, bloc = 1000, contrat = C) => ({ address: contrat, topics: [t0(sig), ...topics], data: '0x' + data, blockNumber: '0x' + bloc.toString(16), logIndex: '0x' + (li++).toString(16), transactionHash: '0x' + motU(li) });
const cree = (id, who, tok, stake, g, exp, bloc = 1000, sig = D.EVS_CREATED[0]) => log(sig, [idT(id), adrT(who)], motA(tok) + motU(stake) + g.map(motU).join('') + motU(exp), bloc);
const joint = (id, who, g, cible, sig = D.EVS_JOINED[0]) => log(sig, [idT(id), adrT(who)], g.map(motU).join('') + motU(cible), cible - 2);
const HASH = '0x' + 'ab'.repeat(32);
const regle = (id, sA, sB, win, pay) => log(D.EVS_SETTLED[0], [idT(id)], HASH.slice(2) + motU(sA) + motU(sB) + motA(win) + motU(pay), 1200);
const logs = [cree(1, A, USDC, 1000000, G, T + 3600), joint(1, B, G2, 1102), regle(1, 3, 1, A, 1800000), cree(2, B, NVDA, 300000, G2, T + 600, 1001, D.EVS_CREATED[1]),
  cree(3, A, USDC, 100000, G, T + 900), log(D.EVS_CANCELLED[0], [idT(3)], ''), cree(4, A, USDC, 100000, G, T + 900), log(D.EVS_REFUNDED[1], [idT(4)], ''),
  joint(9, B, G2, 1300) /* orphelin : pas de Created dans la fenetre */, { ...cree(5, A, USDC, 100000, G, T + 900), address: NVDA } /* autre contrat */,
  { ...cree(6, A, USDC, 100000, [9, 0, 0, 0, 0], T + 900) } /* guess hors bornes */, { ...cree(10, A, USDC, 100000, G, T + 900), data: '0x' + motU(1) } /* mauvaise taille */];
const lu = D.lireDuels({ logs: [...logs, logs[0], logs[1]] /* doublons de fenetres */, contrat: C });
vu(lu.duels.size === 4 && [...lu.duels.keys()].sort().join() === '1,2,3,4', 'quatre duels lus (autre contrat, guess hors bornes, mauvaise taille ignores) : ' + [...lu.duels.keys()].join());
vu(lu.orphelins.join() === '9', 'un Joined sans son Created : orphelin, jamais montre');
const d1 = lu.duels.get('1');
vu(d1.creator === A && d1.token === USDC && d1.stake === 1000000n && d1.guessA.join() === G.join() && d1.expiresAt === T + 3600 && d1.joiner === B && d1.guessB.join() === G2.join() && d1.targetBlock === 1102, 'duel #1 : createur, jeton, mise, faces, expiration, adversaire, cible relus');
vu(d1.settled && d1.settled.blockHash === HASH && d1.settled.scoreA === 3 && d1.settled.scoreB === 1 && d1.settled.winner === A && d1.settled.payout === 1800000n, 'Settled : hash, scores, gagnant, gain');
vu(lu.duels.get('2').expiresAt === T + 600 && lu.duels.get('2').token === NVDA, 'variante expiresAt uint256 : lue');
vu(lu.duels.get('3').cancelled === true && lu.duels.get('4').refunded === true, 'Cancelled et Refunded(variante) : lus');
/* winner indexe (4 mots) et token indexe (7 mots) : les deux formes de l interface */
const lv = D.lireDuels({ logs: [log(D.EVS_CREATED[0], [idT(11), adrT(A), adrT(NVDA)], motU(500000) + G.map(motU).join('') + motU(T + 700)), joint(11, B, G2, 1500, D.EVS_JOINED[1]),
  log(D.EVS_SETTLED[0], [idT(11), adrT(B)], HASH.slice(2) + motU(0) + motU(4) + motU(900000))], contrat: C });
const d11 = lv.duels.get('11');
vu(d11 && d11.token === NVDA && d11.stake === 500000n && d11.targetBlock === 1500 && d11.settled.winner === B && d11.settled.scoreB === 4, 'token indexe, targetBlock uint64, winner indexe : lus');
vu(D.lireDuels({ logs: [log('Created(uint256,address,address,uint256,uint8[5],uint32)', [idT(12), adrT(A)], motA(USDC) + motU(1) + G.map(motU).join('') + motU(T))], contrat: C }).duels.size === 0, 'une signature HORS des variantes : ignoree (jamais devinee)');
vu(D.lireEvenementsDuel([log(D.EVS_REFUNDED[0], [idT(4)], motU(100000) + motU(100000))], C)[0].type === 'REFUNDED', 'Refunded(id, toCreator, toJoiner) (la forme du contrat lu) : lu');
vu(D.planClaim({ contrat: C, token: USDC, to: B }).appels[0].data === selecteur('claim(address,address)') + motA(USDC) + motA(B) && D.appelOwed(USDC, B) === selecteur('owed(address,address)') + motA(USDC) + motA(B), 'claim(token, to) et owed(token, compte) : le chemin d un paiement refuse par le jeton');
vu(D.planCreate({ contrat: C, token: USDC, stake: 1n << 96n, guess: G, expiresIn: 3600 }).etat === 'REFUSE' && D.planCreate({ contrat: C, token: USDC, stake: (1n << 96n) - 1n, guess: G, expiresIn: 3600 }).etat === 'PRET', 'mise > uint96 : REFUSE (MAX_STAKE du contrat)');
/* un RECU (join seul : son Created est dans un autre bloc) : lireEvenementsDuel le lit quand meme — l app en tire la cible */
const recu = D.lireEvenementsDuel([{ address: NVDA, topics: ['0x' + motU(1)], data: '0x' }, joint(1, B, G2, 1102)], C);
vu(recu.length === 1 && recu[0].type === 'JOINED' && recu[0].targetBlock === 1102 && recu[0].joiner === B, 'recu de join : JOINED lu (cible 1102), le log de l approve ignore');
const f = D.filtreLogsDuels({ contrat: C, de: 100, a: 2099 });
vu(f.topics.length === 1 && f.topics[0].length === D.TOPICS_DUELS.length && D.TOPICS_DUELS.length <= 10 && f.fromBlock === '0x64' && f.toBlock === '0x833', 'filtre : un seul OU de <= 10 topics (limite des noeuds), fenetre bornee');
vu(D.filtreLogsDuels({ contrat: C, de: 10, a: 9 }) === null && D.filtreLogsDuels({ contrat: 'x', de: 1, a: 2 }) === null, 'fenetre a l envers ou contrat illisible : null');

/* ── etats et actions ── */
const base = { id: '1', creator: A, token: USDC, stake: 100000n, guessA: G, expiresAt: T + 600, joiner: null, guessB: null, targetBlock: null, settled: null, cancelled: false, refunded: false };
const prisD = { ...base, joiner: B, guessB: G2, targetBlock: 1000 };
vu(D.etatDuel(base, 900, T + 599).etat === 'OUVERT' && D.etatDuel(base, 900, T + 600).etat === 'EXPIRE', 'non pris : OUVERT jusqu a expiresAt exclu, EXPIRE a expiresAt');
vu(D.etatDuel(prisD, 1000, T).etat === 'ATTENTE' && D.etatDuel(prisD, 1001, T).etat === 'REGLABLE' && D.etatDuel(prisD, 1001, T).blocsRestants === 255
  && D.etatDuel(prisD, 1256, T).etat === 'REGLABLE' && D.etatDuel(prisD, 1257, T).etat === 'REMBOURSABLE', 'pris : ATTENTE a la cible, REGLABLE cible+1..cible+256, REMBOURSABLE a cible+257');
vu(D.etatDuel({ ...prisD, settled: {} }, 1001, T).etat === 'REGLE' && D.etatDuel({ ...base, cancelled: true }, 1, T).etat === 'ANNULE' && D.etatDuel({ ...base, refunded: true }, 1, T).etat === 'REMBOURSE', 'regle / annule / rembourse : fini');
vu(D.etatDuel(prisD, null, T).etat === 'NON_LU', 'pris, tete inconnue : NON_LU (jamais un etat devine)');
vu(D.actionsDuel(base, A, 900, T).join() === 'CANCEL' && D.actionsDuel(base, B, 900, T).join() === 'JOIN' && D.actionsDuel(base, null, 900, T).length === 0, 'ouvert : le createur annule, un autre accepte, sans wallet rien');
vu(D.actionsDuel(base, B, 900, T + 541).length === 0, 'ouvert a moins d une minute de la fin : pas de JOIN propose');
vu(D.actionsDuel(base, B, 900, T + 600).join() === 'REFUND' && D.actionsDuel(prisD, null, 1001, T).join() === 'SETTLE' && D.actionsDuel(prisD, null, 1257, T).join() === 'REFUND', 'expire : REFUND ; reglable : SETTLE (n importe qui) ; fenetre passee : REFUND');
/* TOUJOURS UN CHEMIN DE RETOUR : a chaque tete de cible-3 a cible+400, un duel pris est soit en ATTENTE (temporaire), soit SETTLE, soit REFUND ;
 *   un duel non pris a toujours CANCEL (createur) ou REFUND (expire) */
{
  let coince = 0;
  for (let h = 997; h <= 1400; h++) { const e = D.etatDuel(prisD, h, T).etat, x = D.actionsDuel(prisD, null, h, T); if (!(e === 'ATTENTE' || x.includes('SETTLE') || x.includes('REFUND'))) coince++; }
  for (let s = T - 10; s <= T + 2000; s += 7) { const x = D.actionsDuel(base, A, 1, s); if (!(x.includes('CANCEL') || x.includes('REFUND'))) coince++; }
  vu(coince === 0, '404 tetes + 288 instants : aucun duel sans chemin de retour');
}

/* ── le resultat relu d un hash (la MEME face que BlockRolls) ── */
const face = traitsDepuisHash(HASH);
const r = D.resultatDuel({ ...prisD, guessA: face, guessB: G2 }, HASH);
vu(r && r.face.join() === face.join() && r.scoreA === 5 && r.scoreB === scoreTraits(G2, face) && r.gagnant === A && r.egalite === false && r.gagnant + '' === A,'resultat : la face du bloc = traitsDepuisHash (BlockRolls) ; 5/5 gagne');
vu(r.auGagnant === 180000n && r.auPool === 14000n && r.auDev === 6000n && r.pot === 200000n && /^0x[0-9a-f]{40}$/.test(r.gagnant), 'resultat : `gagnant` reste une ADRESSE, les montants a part (90/7/3 de 0.2)');
const rEg = D.resultatDuel({ ...prisD, guessA: G2, guessB: G2 }, HASH);
vu(rEg.egalite === true && rEg.gagnant === null, 'memes faces : egalite (les deux sont rembourses, sans frais)');
vu(D.resultatDuel(prisD, '0x12') === null, 'hash illisible : null');
/* la face DESSINEE d un guess montre exactement les 5 traits scores : guessDepuisApparence(apparenceDepuisGuess(g)) === g, sur tout l espace */
{
  let mal = 0, k = 0;
  for (let c = 0; c < TAILLES[0]; c++) for (let o = 0; o < TAILLES[1]; o++) for (let fa = 0; fa < TAILLES[2]; fa += 3) for (let m = 0; m < TAILLES[3]; m += 2) for (let ornement = 0; ornement < TAILLES[4]; ornement++) {
    const g = [c, o, fa, m, ornement]; k++; const back = guessDepuisApparence(D.apparenceDepuisGuess(g)); if (!back || back.join() !== g.join()) mal++;
  }
  vu(k > 10000 && mal === 0, k + ' faces : la face dessinee d un guess redonne le meme guess (aucun trait invente)');
}
vu(D.apparenceDepuisGuess([6, 0, 0, 0, 0]) === null, 'guess hors bornes : pas de dessin');
/* JSON du serveur, aller-retour strict */
const rt = D.duelDepuisJson({ ...D.duelEnJson(d1), creatorBlocks: ['0x' + 'b'.repeat(40), 'pas une adresse'] });
vu(rt && rt.stake === 1000000n && rt.settled.payout === 1800000n && rt.joiner === B && rt.creatorBlocks.length === 1, 'duelEnJson -> duelDepuisJson : meme duel (BigInt rendus), blocks filtres');
vu(D.duelDepuisJson({ ...D.duelEnJson(d1), stake: '1e6' }) === null && D.duelDepuisJson({ ...D.duelEnJson(d1), guessA: [1, 2] }) === null && D.duelDepuisJson({ ...D.duelEnJson(d1), joiner: B, guessB: null }) === null, 'JSON mal forme : null (jamais un duel a moitie lu)');
vu(D.lireBool('0x' + motU(1)) === true && D.lireBool('0x' + motU(0)) === false && D.lireBool('0x' + motU(2)) === null && D.lireBool('0x') === null, 'lireBool : 0/1 seulement, sinon null');
vu(D.SIGS_ADMIS.length >= 3 && D.SIGS_ADMIS.every((s) => /^[a-zA-Z]+\(address\)$/.test(s)), 'les getters d admission essayes : (address) -> bool, liste finie');
vu(!/Date\.now|Math\.random|fetch\(|localStorage/.test(readFileSync(new URL('./duels-plan-app.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')), 'source : ni horloge, ni hasard, ni reseau, ni stockage');

/* ── MUTANTS ── */
const srcUrl = new URL('./duels-plan-app.js', import.meta.url);
const src = readFileSync(srcUrl, 'utf8').replace(/\r\n/g, '\n');
async function mutant(nom, de, vers, rougit) {
  vu(src.split(de).length === 2, 'mutant ' + nom + ' : le motif existe une fois');
  const url = new URL('./duels-plan-app.mutant-' + process.pid + '-' + n + '.js', import.meta.url);
  writeFileSync(url, src.replace(de, vers));
  try { const M = await import(url.href); vu(rougit(M) === true, 'MUTANT ' + nom + ' : l assertion ROUGIT'); }
  finally { try { unlinkSync(url); } catch (_) {} }
}
await mutant('mise minimum retiree', "else if (m < MISE_MIN) r.push(", 'else if (false) r.push(', (M) => M.planCreate({ contrat: C, token: USDC, stake: 99999n, guess: G, expiresIn: 3600 }).etat === 'PRET');
await mutant('poussiere perdue', 'return { pot, gagnant, pool, dev: pot - gagnant - pool };', 'return { pot, gagnant, pool, dev: (pot * 300n) / BPS };', (M) => { const p = M.partage(100001n); return p.gagnant + p.pool + p.dev !== p.pot; });
await mutant('join de son propre duel', "if (bas(d.creator) === bas(moi)) return refuse('this is your own challenge');", '', (M) => M.planJoin({ contrat: C, duel: ouvert, guess: G2, moi: A, maintenant: T }).etat === 'PRET');
await mutant('approve different de la mise', "approuver(d.token, contrat, m, 'approve exactly the same stake", "approuver(d.token, contrat, m + 1n, 'approve exactly the same stake", (M) => M.planJoin({ contrat: C, duel: ouvert, guess: G2, moi: B, maintenant: T }).appels[0].data !== '0x095ea7b3' + motA(C) + motU(250000n));
await mutant('expiration incluse', "return t < Number(d.expiresAt) ? { etat: 'OUVERT'", "return t <= Number(d.expiresAt) ? { etat: 'OUVERT'", (M) => M.etatDuel(base, 900, T + 600).etat === 'OUVERT');
await mutant('guess non verifie a la lecture', "if (!guessOk(guess)) return null;\n    return { type: 'CREATED'", "return { type: 'CREATED'",(M) => M.lireDuels({ logs, contrat: C }).duels.has('6'));
await mutant('marge de join retiree', "if (!Number.isFinite(t) || !(Number(d.expiresAt) - t >= MARGE_JOIN_S))", 'if (!Number.isFinite(t) || !(Number(d.expiresAt) - t > 0))', (M) => M.planJoin({ contrat: C, duel: ouvert, guess: G2, moi: B, maintenant: T + 541 }).etat === 'PRET');
console.log('ok duels-plan-app - ' + n + ' assertions ; NE PROUVE PAS la parite avec le contrat compile (BlockDuels absent de ce depot)');
