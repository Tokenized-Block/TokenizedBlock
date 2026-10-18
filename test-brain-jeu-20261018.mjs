/* test-brain-jeu-20261018.mjs — « Let the brain play » (brain-jeu.js) : UNE proposition, dans le budget et les limites, SETTLE d abord,
 * rien sans autorisation. Les appels sont ceux des modules d encodage (blockrolls-plan, missions-plan, blockskins), compares octet pour octet.
 * Mutants (copie a cote de la source, effacee apres) : budget contourne, depense ignoree, solde non lu traite comme suffisant, settle pas en
 * premier, autorisation absente prise pour un oui, plafond de skin retire, limite horaire decalee d un. Chacun DOIT faire rougir son assertion. */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import * as J from './brain-jeu.js';
import { planRoll, planRollAvecPass, planSettle, planSettleMany } from './blockrolls-plan.js';
import { planPoster, planReclamer } from './missions-plan.js';
import { appelApprouver, appelAcheter, appelEncherir, appelRegler, BLOCKSKINS } from './blockskins.js';
import { planCreate, planJoin, planSettle as planSettleDuel, planRefund as planRefundDuel } from './duels-plan-app.js';

let n = 0;
const vu = (c, m) => { if (!c) { console.error('KO ' + m); process.exit(1); } n++; };

const W = '0x' + '1'.repeat(40), AUTRE = '0x' + '2'.repeat(40), C = '0x' + 'c'.repeat(40), MC = '0x' + 'd'.repeat(40);
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', BLOCK = '0x' + 'b'.repeat(40), PM = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const T = 1760800000, GUESS = [1, 2, 3, 0, 1];
const regles = (x = {}) => ({ rolls: true, maxRollsPerHour: 3, settle: true, missions: true, postMissions: true, skins: true, maxSkinBidUsdc: '5000000', ...x });
const skin = (x) => ({ tokenId: 7n, detenteur: AUTRE, block: BLOCK, recette: null, enVente: true, enchere: false, devise: USDC, prix: 2000000n, fin: 0, encherisseur: '0x' + '0'.repeat(40), offre: 0n, ...x });
const base = (x = {}) => ({
  authorized: true, wallet: W, now: T, budgetUsdc: '10000000', spentUsdc: '0', balanceUsdc: '50000000', rules: regles(), history: [], seen: [],
  rolls: { contract: C, usdc: USDC, rollPrice: '500000', guess: GUESS, pass: null, pot: '3000000', block: 1000, pending: [] },
  missions: null, skins: null, ...x,
});
const memes = (a, b) => a.length === b.length && a.every((c, i) => c.to === String(b[i].to).toLowerCase() && c.data === b[i].data && c.value === (b[i].value || '0x0'));

/* ── l autorisation et le wallet ── */
vu(J.prochaineProposition(base({ authorized: false })).kind === 'NONE', 'authorized false : NONE');
vu(J.prochaineProposition(base({ authorized: undefined })).kind === 'NONE', 'authorized absent : NONE (jamais un oui par defaut)');
vu(J.prochaineProposition(base({ authorized: 'yes' })).kind === 'NONE', 'authorized « yes » (texte) : NONE — seul true autorise');
vu(J.prochaineProposition(base({ wallet: null })).kind === 'NONE' && J.prochaineProposition(base({ wallet: '0x12' })).kind === 'NONE', 'sans wallet entier : NONE');
vu(J.prochaineProposition(base({ now: undefined })).kind === 'NONE', 'sans instant : NONE (le module n a pas d horloge)');
vu(J.prochaineProposition(base({ authorized: false, rolls: { ...base().rolls, pending: [{ rollId: 4, targetBlock: 990 }] } })).kind === 'NONE', 'non autorise : pas meme un SETTLE');
vu(!/Date\.now|Math\.random|fetch\(|localStorage/.test(readFileSync(new URL('./brain-jeu.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')), 'source : ni horloge, ni hasard, ni reseau, ni stockage');

/* ── ROLL paye : les appels de planRoll, le cout = le prix ── */
const r1 = J.prochaineProposition(base());
vu(r1.kind === 'ROLL' && r1.costUsdc === '500000', 'roll paye propose, cout 0.5 USDC');
vu(memes(r1.calls, planRoll({ contrat: C, usdc: USDC, guess: GUESS, rollPrice: 500000n }).appels), 'ROLL : appels = planRoll (approve EXACT + roll), octet pour octet');
vu(r1.calls.every((c) => typeof c.nom === 'string' && c.nom.length > 3), 'chaque appel porte un nom (affiche par bcSigner)');
vu(JSON.stringify(J.prochaineProposition(base())) === JSON.stringify(r1), 'deterministe : meme etat -> meme proposition');
/* pass actif : 0 USDC, rollWithPass */
const pass = { rollsLeft: 4, expiresAt: T + 600 };
const r2 = J.prochaineProposition(base({ rolls: { ...base().rolls, pass } }));
vu(r2.kind === 'ROLL' && r2.costUsdc === '0' && memes(r2.calls, planRollAvecPass({ contrat: C, guess: GUESS, pass, maintenant: T }).appels), 'pass actif : roll sur pass, 0 USDC');
vu(J.prochaineProposition(base({ rolls: { ...base().rolls, pass: { rollsLeft: 4, expiresAt: T - 1 } } })).costUsdc === '500000', 'pass expire : roll paye');
/* budget */
vu(J.prochaineProposition(base({ budgetUsdc: '400000' })).kind === 'NONE', 'budget 0.4 < prix 0.5 : NONE');
const budgetDit = J.prochaineProposition(base({ budgetUsdc: '400000' })).why;
vu(/budget/.test(budgetDit), 'le refus dit « budget » : ' + budgetDit.slice(0, 90));
vu(J.prochaineProposition(base({ budgetUsdc: '10000000', spentUsdc: '9600000' })).kind === 'NONE', 'reste 0.4 apres 9.6 depenses : NONE');
vu(J.prochaineProposition(base({ budgetUsdc: '10000000', spentUsdc: '9500000' })).kind === 'ROLL', 'reste exactement 0.5 : ROLL (borne incluse)');
vu(J.prochaineProposition(base({ spentUsdc: '20000000' })).kind === 'NONE', 'depense au-dela du budget : NONE (jamais de reste negatif)');
vu(J.prochaineProposition(base({ balanceUsdc: null })).kind === 'NONE', 'solde USDC non lu : aucun roll paye');
vu(J.prochaineProposition(base({ balanceUsdc: '499999' })).kind === 'NONE', 'solde 0.499999 < 0.5 : NONE');
vu(J.prochaineProposition(base({ balanceUsdc: null, rolls: { ...base().rolls, pass } })).kind === 'ROLL', 'solde non lu mais pass actif : roll sur pass (rien a payer)');
/* limite horaire */
const hist = (k, dt = 60) => Array.from({ length: k }, (_, i) => ({ t: T - dt * (i + 1), kind: 'ROLL' }));
vu(J.prochaineProposition(base({ history: hist(2) })).kind === 'ROLL', '2 rolls dans l heure, limite 3 : ROLL');
vu(J.prochaineProposition(base({ history: hist(3) })).kind === 'NONE', '3 rolls dans l heure, limite 3 : NONE');
vu(J.prochaineProposition(base({ history: hist(3, 1300) })).kind === 'ROLL', '3 rolls dont 1 il y a plus d une heure : ROLL');
vu(J.prochaineProposition(base({ rules: regles({ maxRollsPerHour: 0 }) })).kind === 'NONE', 'limite 0 : jamais de roll');
vu(J.normaliserRegles({ maxRollsPerHour: 9999 }).maxRollsPerHour === J.MAX_ROLLS_HEURE && J.normaliserRegles({ maxRollsPerHour: -1 }).maxRollsPerHour === 0, 'limite bornee 0..60');
vu(J.prochaineProposition(base({ rules: regles({ rolls: false }) })).kind === 'NONE', 'regle rolls off : pas de roll');
vu(J.prochaineProposition(base({ rules: { ...regles(), rolls: 'true' } })).kind === 'NONE', 'rolls « true » (texte) : off — un drapeau n est vrai que s il vaut true');
vu(J.prochaineProposition(base({ rolls: { ...base().rolls, guess: [9, 9, 9, 9, 9] } })).kind === 'NONE', 'guess hors bornes : pas de roll');

/* ── SETTLE toujours en premier ── */
const pend = [{ rollId: 12, targetBlock: 995 }];
const s1 = J.prochaineProposition(base({ rolls: { ...base().rolls, pending: pend } }));
vu(s1.kind === 'SETTLE' && s1.costUsdc === '0' && memes(s1.calls, planSettle({ contrat: C, rollId: 12, targetBlock: 995, blocActuel: 1000 }).appels), 'roll reglable : SETTLE (planSettle), avant le roll possible');
const pend2 = [{ rollId: 12, targetBlock: 995 }, { rollId: 13, targetBlock: 760 }, { rollId: 14, targetBlock: 999 }];
const s2 = J.prochaineProposition(base({ rolls: { ...base().rolls, pending: pend2 } }));
vu(s2.kind === 'SETTLE' && memes(s2.calls, planSettleMany({ contrat: C, rollIds: ['13', '12', '14'] }).appels), 'plusieurs reglables : settleMany, le plus pres de sa fin d abord');
vu(J.prochaineProposition(base({ rolls: { ...base().rolls, pending: [{ rollId: 1, targetBlock: 1000 }] } })).kind === 'ROLL', 'cible pas encore passee : pas de SETTLE (trop tot), le roll suit');
vu(J.prochaineProposition(base({ rolls: { ...base().rolls, pending: [{ rollId: 1, targetBlock: 700 }] } })).kind === 'ROLL', 'au-dela de 256 blocs : perdu, pas de SETTLE');
vu(J.prochaineProposition(base({ budgetUsdc: '0', balanceUsdc: '0', rolls: { ...base().rolls, pending: pend } })).kind === 'SETTLE', 'budget et solde a 0 : le SETTLE reste propose (il ne coute rien)');
vu(J.prochaineProposition(base({ rules: regles({ settle: false }), rolls: { ...base().rolls, pending: pend } })).kind === 'ROLL', 'regle settle off : pas de SETTLE');
const avecTout = base({ rolls: { ...base().rolls, pending: pend }, skins: { list: [skin({})], block: BLOCK, usdc: USDC },
  missions: { contract: MC, usdc: USDC, claimable: [{ id: 3, txHash: '0x' + 'e'.repeat(64), held: { heldBlock: 1, heldPaired: 0, windowEnd: T + 10, deadline: T + 99 }, signature: '0x' + 'ab'.repeat(65) }], post: null, mineOpen: 0 } });
vu(J.prochaineProposition(avecTout).kind === 'SETTLE', 'mission, skin et roll possibles en meme temps : SETTLE gagne');

/* ── TAKE_MISSION ── */
const sansSettle = { ...avecTout, rolls: { ...avecTout.rolls, pending: [] } };
const m1 = J.prochaineProposition(sansSettle);
vu(m1.kind === 'TAKE_MISSION' && m1.costUsdc === '0' && memes(m1.calls, planReclamer({ contrat: MC, taskId: 3, txHash: '0x' + 'e'.repeat(64), held: sansSettle.missions.claimable[0].held, signature: '0x' + 'ab'.repeat(65) }).appels), 'attestation en main : TAKE_MISSION = planReclamer');
vu(J.prochaineProposition({ ...sansSettle, seen: ['MISSION:3'] }).kind === 'ROLL', 'mission deja proposee : pas deux fois');
vu(J.prochaineProposition({ ...sansSettle, rules: regles({ missions: false }) }).kind === 'ROLL', 'regle missions off : pas de reclamation');
vu(J.prochaineProposition({ ...sansSettle, missions: { ...sansSettle.missions, claimable: [{ id: 5, txHash: '0x' + 'e'.repeat(64), held: sansSettle.missions.claimable[0].held, signature: '0x12' }] } }).kind === 'ROLL', 'signature mal formee : pas de claim (planReclamer refuse), le roll suit');

/* ── SKINS : achat / offre, jamais au-dessus du plafond ── */
const sk = (list, x = {}) => base({ rules: regles({ rolls: false, ...x }), skins: { list, block: BLOCK, usdc: USDC } });
const b1 = J.prochaineProposition(sk([skin({})]));
vu(b1.kind === 'BUY_SKIN' && b1.costUsdc === '2000000' && memes(b1.calls, [appelApprouver(USDC, 2000000n), appelAcheter(7n, USDC, 2000000n)]), 'skin a 2 USDC, plafond 5 : BUY_SKIN = approve EXACT + buy');
vu(b1.calls[1].to === String(BLOCKSKINS).toLowerCase(), 'l achat vise le contrat BlockSkins actif');
vu(J.prochaineProposition(sk([skin({ prix: 6000000n })])).kind === 'NONE', 'skin a 6 USDC, plafond 5 : NONE');
vu(J.prochaineProposition(sk([skin({ prix: 5000000n })])).kind === 'BUY_SKIN', 'skin a 5 USDC, plafond 5 : BUY (borne incluse)');
vu(J.prochaineProposition(sk([skin({})], { maxSkinBidUsdc: '0' })).kind === 'NONE', 'plafond 0 : aucune skin');
vu(J.prochaineProposition({ ...sk([skin({})]), budgetUsdc: '1000000' }).kind === 'NONE', 'budget 1 < prix 2 : NONE (le plafond est aussi le budget)');
vu(J.prochaineProposition({ ...sk([skin({})]), balanceUsdc: null }).kind === 'NONE', 'solde non lu : aucune skin');
vu(J.prochaineProposition(sk([skin({ devise: '0x' + '0'.repeat(40) })])).kind === 'NONE', 'skin en ETH : hors budget USDC, NONE');
vu(J.prochaineProposition(sk([skin({ block: '0x' + '9'.repeat(40) })])).kind === 'NONE', 'skin d un autre block : NONE (le brain regarde SON block)');
vu(J.prochaineProposition(sk([skin({ detenteur: W })])).kind === 'NONE', 'sa propre annonce : NONE');
vu(J.prochaineProposition({ ...sk([skin({})]), seen: ['SKIN:7'] }).kind === 'NONE', 'skin deja proposee : pas deux fois');
const ench = skin({ enchere: true, prix: 1000000n, fin: T + 3600, encherisseur: AUTRE, offre: 3000000n });
const b2 = J.prochaineProposition(sk([ench]));
vu(b2.kind === 'BID_SKIN' && b2.costUsdc === '3150000' && memes(b2.calls, [appelApprouver(USDC, 3150000n), appelEncherir(7n, USDC, 3150000n)]), 'enchere a 3 USDC : offre minimale 3.15 (+5 %), approve EXACT + bid');
vu(J.prochaineProposition(sk([skin({ enchere: true, prix: 1000000n, fin: T + 3600, encherisseur: AUTRE, offre: 4900000n })])).kind === 'NONE', 'offre minimale 5.145 > plafond 5 : NONE');
const fin = skin({ enchere: true, fin: T - 1, encherisseur: W, offre: 3000000n });
const s3 = J.prochaineProposition(sk([fin], { maxSkinBidUsdc: '0' }));
vu(s3.kind === 'SETTLE' && memes(s3.calls, [appelRegler(7n)]) && s3.costUsdc === '0', 'enchere finie gagnee par moi : SETTLE skin, meme a plafond 0');
vu(J.prochaineProposition(sk([skin({})], { skins: false })).kind === 'NONE', 'regle skins off : rien');
/* revue adverse 2026-10-18 : le brain a MISE sur la skin 7 (seen 'SKIN:7') ; l enchere finie doit QUAND MEME etre proposee au reglement,
 *   sous sa propre cle — et un reglement deja propose ne revient pas */
const s4 = J.prochaineProposition({ ...sk([fin], { maxSkinBidUsdc: '0' }), seen: ['SKIN:7'] });
vu(s4.kind === 'SETTLE' && s4.cle === 'SKINREG:7' && memes(s4.calls, [appelRegler(7n)]), 'mise deja faite (SKIN:7) : le reglement de la meme enchere reste propose (cle SKINREG:7)');
vu(J.prochaineProposition({ ...sk([fin], { maxSkinBidUsdc: '0' }), seen: ['SKIN:7', 'SKINREG:7'] }).kind !== 'SETTLE', 'reglement deja propose : pas deux fois');

/* ── POST_MISSION ── */
const post = {
  cle: { currency0: USDC, currency1: BLOCK, fee: 0, tickSpacing: 200, hooks: '0x32f3f572dd17625bab9035789c953e1d001864cc' },
  params: { rewardToken: USDC, reward: '1000000', maxDone: 3, perWallet: 1, expiry: T + 7 * 86400, target: PM, topic0: '0x' + '1'.repeat(64), descHash: '0x' + '2'.repeat(64), topic1: '0x' + '3'.repeat(64) },
  hold: { minBlock: '1000', minPaired: 0, bonusMinBlock: 0, bonusBps: 0, window: 86400 }, poolManager: PM,
};
const pm = (x = {}, m = {}) => base({ rules: regles({ rolls: false, ...x }), missions: { contract: MC, usdc: USDC, claimable: [], post, mineOpen: 0, ...m } });
const p1 = J.prochaineProposition(pm());
vu(p1.kind === 'POST_MISSION' && p1.costUsdc === '3000000' && memes(p1.calls, planPoster({ contrat: MC, cle: post.cle, params: post.params, hold: post.hold, maintenant: T, poolManager: PM }).appels), 'POST_MISSION : planPoster, cout = sequestre 3 x 1 USDC');
vu(J.prochaineProposition({ ...pm(), budgetUsdc: '2999999' }).kind === 'NONE', 'sequestre 3 > budget 2.999999 : NONE');
vu(J.prochaineProposition({ ...pm(), balanceUsdc: null }).kind === 'NONE', 'solde non lu : pas de mission postee');
vu(J.prochaineProposition(pm({}, { mineOpen: 1 })).kind === 'NONE', 'une de ses missions est ouverte : pas une deuxieme');
vu(J.prochaineProposition(pm({}, { post: { ...post, params: { ...post.params, rewardToken: BLOCK } } })).kind === 'NONE', 'recompense hors USDC : NONE (le budget est en USDC)');
vu(J.prochaineProposition(pm({ postMissions: false })).kind === 'NONE', 'regle post off : rien');
vu(J.prochaineProposition({ ...pm(), seen: [p1.cle] }).kind === 'NONE', 'mission deja proposee : pas deux fois');
vu(J.prochaineProposition(pm({}, { post: { ...post, params: { ...post.params, expiry: T - 1 } } })).kind === 'NONE', 'mission refusee par planPoster (expiree) : NONE');
vu(J.prochaineProposition(base({ rules: regles({ rolls: false, skins: false, missions: false, postMissions: false }) })).kind === 'NONE', 'aucune regle : NONE');
vu(J.KINDS.join() === 'ROLL,SETTLE,TAKE_MISSION,POST_MISSION,BID_SKIN,BUY_SKIN,DUEL_CREATE,DUEL_JOIN,DUEL_SETTLE,NONE', 'les dix genres (les trois des duels compris)');

/* ── DUELS (2026-10-18) : USDC seulement, jamais au-dessus de maxDuelStakeUsdc / du reste du budget / du solde lu ; settle d abord ── */
const DC = '0x' + 'e'.repeat(40), NVDA = '0x' + '7'.repeat(40), FACE = [0, 1, 2, 3, 4];
const duel = (x = {}) => ({ id: '5', creator: AUTRE, token: USDC, stake: 1000000n, guessA: [1, 1, 1, 1, 1], expiresAt: T + 1800, blocCree: 900, joiner: null, guessB: null, targetBlock: null, settled: null, cancelled: false, refunded: false, ...x });
const du = (list, rx = {}, x = {}) => base({ rules: regles({ rolls: false, skins: false, missions: false, postMissions: false, duels: true, maxDuelStakeUsdc: '2000000', ...rx }),
  duels: { contract: DC, usdc: USDC, guess: FACE, expiresIn: 3600, block: 1000, list }, ...x });
const dj = J.prochaineProposition(du([duel()]));
vu(dj.kind === 'DUEL_JOIN' && dj.costUsdc === '1000000' && dj.cle === 'DUEL_JOIN:5' && memes(dj.calls, planJoin({ contrat: DC, duel: duel(), guess: FACE, moi: W, maintenant: T }).appels), 'duel ouvert a 1 USDC, plafond 2 : DUEL_JOIN = planJoin (approve EXACT + join), cout 1 USDC');
vu(/1\.8 USDC/.test(dj.why) && /90 %/.test(dj.why) && /7 %/.test(dj.why) && /3 %/.test(dj.why) && /tie refunds both/i.test(dj.why), 'le pourquoi dit le gain (1.8 = 90 % de 2), 7 % / 3 % et l egalite : ' + dj.why.slice(0, 80));
vu(J.prochaineProposition(du([duel({ stake: 2000000n })])).kind === 'DUEL_JOIN', 'mise = plafond : JOIN (borne incluse)');
const dc = J.prochaineProposition(du([duel({ stake: 3000000n })]));
vu(dc.kind === 'DUEL_CREATE' && dc.costUsdc === '2000000' && memes(dc.calls, planCreate({ contrat: DC, token: USDC, stake: 2000000n, guess: FACE, expiresIn: 3600 }).appels), 'mise 3 > plafond 2 : pas de JOIN ; DUEL_CREATE a 2 USDC (planCreate, approve EXACT)');
vu(J.prochaineProposition(du([duel({ token: NVDA })])).kind === 'DUEL_CREATE', 'duel en action (pas USDC) : pas de JOIN (le budget est en USDC) ; le brain en ouvre un en USDC');
vu(J.prochaineProposition(du([duel({ expiresAt: T + 30 })])).kind === 'DUEL_CREATE', 'duel qui expire dans 30 s : pas de JOIN (il revertirait apres la signature)');
vu(J.prochaineProposition({ ...du([duel()]), seen: ['DUEL_JOIN:5'] }).kind === 'DUEL_CREATE', 'duel deja propose : pas deux fois');
vu(J.prochaineProposition(du([duel({ creator: W })])).kind === 'NONE', 'son propre duel ouvert : ni JOIN ni un deuxieme CREATE');
vu(J.prochaineProposition(du([duel({ joiner: '0x' + '3'.repeat(40), guessB: FACE, targetBlock: 999 })])).kind === 'DUEL_CREATE', 'duel deja pris par un autre : pas de JOIN');
const dPlusCher = J.prochaineProposition(du([duel({ id: '8', stake: 1500000n }), duel({ id: '9', stake: 1000000n }), duel({ id: '4', stake: 1000000n })]));
vu(dPlusCher.kind === 'DUEL_JOIN' && dPlusCher.cle === 'DUEL_JOIN:4', 'plusieurs prenables : le moins cher, puis le plus ancien (#4)');
vu(J.prochaineProposition(du([duel()], {}, { budgetUsdc: '900000' })).kind === 'NONE' && /budget/.test(J.prochaineProposition(du([duel()], {}, { budgetUsdc: '900000' })).why), 'mise 1 > budget 0.9 : NONE, le refus dit « budget »');
vu(J.prochaineProposition(du([duel()], {}, { spentUsdc: '9500000' })).kind === 'NONE', 'reste 0.5 apres 9.5 depenses : NONE (ni join a 1, ni create a 2)');
vu(J.prochaineProposition(du([duel()], {}, { balanceUsdc: null })).kind === 'NONE', 'solde non lu : aucun duel paye');
vu(J.prochaineProposition(du([duel({ stake: 2000000n })], {}, { balanceUsdc: '1500000' })).kind === 'NONE', 'solde 1.5 < mise 2 : NONE');
vu(J.prochaineProposition(du([duel()], { maxDuelStakeUsdc: '0' })).kind === 'NONE' && J.prochaineProposition(du([duel()], { maxDuelStakeUsdc: '99999' })).kind === 'NONE', 'plafond 0 ou sous le minimum du contrat : aucun duel');
vu(J.prochaineProposition(du([duel()], { duels: false })).kind === 'NONE' && J.prochaineProposition(du([duel()], { duels: 'true' })).kind === 'NONE', 'regle duels off (ou « true » en texte) : rien');
vu(J.prochaineProposition({ ...du([duel()]), duels: { ...du([duel()]).duels, guess: [9, 9, 9, 9, 9] } }).kind === 'NONE', 'face hors bornes : aucun duel');
const hDuel = (dt) => [{ t: T - dt, kind: 'DUEL_CREATE' }];
vu(J.prochaineProposition(du([], {}, { history: hDuel(600) })).kind === 'NONE', 'un CREATE il y a 10 min : pas un deuxieme (un par heure)');
vu(J.prochaineProposition(du([], {}, { history: hDuel(3700) })).kind === 'DUEL_CREATE', 'un CREATE il y a plus d une heure : CREATE');
vu(J.prochaineProposition(du([], {}, { history: hDuel(600) })).kind === 'NONE' && J.prochaineProposition(du([duel()], {}, { history: hDuel(600) })).kind === 'DUEL_JOIN', 'la limite horaire porte sur CREATE, pas sur JOIN');
/* SETTLE des duels : 0 USDC, avant tout paiement, seulement les siens */
const pris = (x = {}) => duel({ creator: W, joiner: AUTRE, guessB: [2, 2, 2, 2, 2], targetBlock: 995, ...x });
const ds = J.prochaineProposition(du([pris()], {}, { budgetUsdc: '0', balanceUsdc: '0' }));
vu(ds.kind === 'DUEL_SETTLE' && ds.costUsdc === '0' && ds.cle === 'DUEL_SETTLE:5' && memes(ds.calls, planSettleDuel({ contrat: DC, id: '5', targetBlock: 995, blocActuel: 1000 }).appels), 'son duel reglable : DUEL_SETTLE = planSettle, 0 USDC, meme a budget et solde 0');
vu(J.prochaineProposition(du([pris({ creator: AUTRE, joiner: W })])).kind === 'DUEL_SETTLE', 'duel ou il est le joueur B : DUEL_SETTLE aussi');
const dr = J.prochaineProposition(du([pris({ targetBlock: 700 })]));
vu(dr.kind === 'DUEL_SETTLE' && memes(dr.calls, planRefundDuel({ contrat: DC, id: '5' }).appels) && /both stakes/.test(dr.why), 'fenetre de 256 blocs passee : refundExpired (les deux mises), jamais un duel coince');
const de = J.prochaineProposition(du([duel({ creator: W, expiresAt: T - 1 })]));
vu(de.kind === 'DUEL_SETTLE' && memes(de.calls, planRefundDuel({ contrat: DC, id: '5' }).appels), 'son duel jamais pris et expire : refundExpired (sa mise revient)');
vu(J.prochaineProposition(du([pris({ targetBlock: 1000 })])).kind !== 'DUEL_SETTLE', 'cible pas encore passee : pas de settle (trop tot)');
vu(J.prochaineProposition(du([pris({ creator: AUTRE, joiner: '0x' + '3'.repeat(40) })], { maxDuelStakeUsdc: '0' })).kind === 'NONE', 'le duel reglable de deux AUTRES wallets : le brain ne le propose pas');
vu(J.prochaineProposition({ ...du([pris()], { maxDuelStakeUsdc: '0' }), seen: ['DUEL_SETTLE:5'] }).kind === 'NONE', 'un settle deja signe (cle vue) : pas re-propose (la liste servie retarde)');
vu(J.prochaineProposition(du([pris({ id: '6', targetBlock: 760 }), pris({ id: '7', targetBlock: 995 })])).cle === 'DUEL_SETTLE:6', 'deux reglables : le plus pres de sa fin d abord (#6)');
vu(J.prochaineProposition(du([pris({ id: '6', targetBlock: 700 }), pris({ id: '7', targetBlock: 995 })])).cle === 'DUEL_SETTLE:7', 'un reglable passe avant un remboursement (le remboursement ne se perd pas)');
const tout = du([pris()], { rolls: true }, { rolls: { ...base().rolls, pending: pend } });
vu(J.prochaineProposition(tout).kind === 'SETTLE', 'roll reglable ET duel reglable : le roll d abord (lui se PERD a 256 blocs, le duel se rembourse)');
vu(J.prochaineProposition(du([pris()], { rolls: true }, { rolls: base().rolls })).kind === 'DUEL_SETTLE', 'duel reglable et roll possible : DUEL_SETTLE avant le roll paye');
vu(J.prochaineProposition(du([duel()], { rolls: true }, { rolls: base().rolls })).kind === 'ROLL', 'roll possible et duel prenable : le roll passe d abord (ordre fixe), le duel au tour suivant');
vu(J.prochaineProposition(du([duel()], {}, { duels: null })).kind === 'NONE' && /duels were not read/.test(J.prochaineProposition(du([duel()], {}, { duels: null })).why), 'duels non lus : NONE, dit');
/* propriete : sur une grille de mises / budgets / soldes, un duel propose ne coute JAMAIS plus que le plafond, le reste, le solde */
{
  let mal = 0, vus2 = 0;
  for (const s of [100000n, 999999n, 1000000n, 2000000n, 2000001n, 5000000n]) for (const b of ['0', '1000000', '2000000', '9000000']) for (const so of ['0', '999999', '2000000', '9000000']) for (const mx of ['99999', '1000000', '2000000']) {
    const p = J.prochaineProposition(du([duel({ stake: s })], { maxDuelStakeUsdc: mx }, { budgetUsdc: b, balanceUsdc: so }));
    if (p.kind === 'DUEL_JOIN' || p.kind === 'DUEL_CREATE') { vus2++; const c = BigInt(p.costUsdc); if (c > BigInt(mx) || c > BigInt(b) || c > BigInt(so) || c < 100000n) mal++; }
  }
  vu(vus2 > 10 && mal === 0, 'grille de 288 etats : ' + vus2 + ' duels proposes, 0 au-dessus du plafond / du budget / du solde');
}

/* ── MUTANTS ── */
const srcUrl = new URL('./brain-jeu.js', import.meta.url);
const src = readFileSync(srcUrl, 'utf8').replace(/\r\n/g, '\n');
async function mutant(nom, de, vers, rougit) {
  vu(src.split(de).length === 2, 'mutant ' + nom + ' : le motif existe une fois');
  const url = new URL('./brain-jeu.mutant-' + process.pid + '-' + n + '.js', import.meta.url);
  writeFileSync(url, vers === null ? de.reduce((s, [a, b]) => s.replace(a, b), src) : src.replace(de, vers));
  try { const M = await import(url.href); vu(rougit(M) === true, 'MUTANT ' + nom + ' : l assertion ROUGIT'); }
  finally { try { unlinkSync(url); } catch (_) {} }
}
await mutant('budget contourne', 'else if (prix > reste)', 'else if (false)', (M) => M.prochaineProposition(base({ budgetUsdc: '400000' })).kind === 'ROLL');
await mutant('depense ignoree', 'const reste = budget > depense ? budget - depense : 0n;', 'const reste = budget;', (M) => M.prochaineProposition(base({ spentUsdc: '9600000' })).kind === 'ROLL');
await mutant('solde non lu = suffisant', 'const payable = solde === null ? 0n : min(reste, solde);', 'const payable = solde === null ? reste : min(reste, solde);', (M) => M.prochaineProposition({ ...pm(), balanceUsdc: null }).kind === 'POST_MISSION');
await mutant('settle pas en premier', 'if (regles.settle && R && R.block', 'if (regles.settle && !regles.rolls && R && R.block', (M) => M.prochaineProposition(base({ rolls: { ...base().rolls, pending: pend } })).kind === 'ROLL');
await mutant('autorisation absente = oui', "if (e.authorized !== true) return rien(", "if (e.authorized === false) return rien(", (M) => M.prochaineProposition(base({ authorized: undefined })).kind === 'ROLL');
await mutant('limite horaire decalee', 'if (faits >= regles.maxRollsPerHour)', 'if (faits > regles.maxRollsPerHour)', (M) => M.prochaineProposition(base({ history: hist(3) })).kind === 'ROLL');
/* le plafond de skin a DEUX gardes (propositionSkin bornee, puis la verification ici) : il faut retirer les deux pour le franchir */
{
  const a = 'const plafondSkin = min(regles.maxSkinBidUsdc, payable);', b = 'm <= regles.maxSkinBidUsdc && ';
  vu(src.split(a).length === 2 && src.split(b).length === 2, 'mutant plafond : les deux motifs existent une fois');
  const url = new URL('./brain-jeu.mutant-' + process.pid + '-plafond.js', import.meta.url);
  writeFileSync(url, src.replace(a, 'const plafondSkin = payable;').replace(b, ''));
  try { const M = await import(url.href); vu(M.prochaineProposition(sk([skin({ prix: 6000000n })])).kind === 'BUY_SKIN', 'MUTANT plafond retire : la skin a 6 > 5 serait proposee — l assertion « NONE » ROUGIT'); }
  finally { try { unlinkSync(url); } catch (_) {} }
  const url2 = new URL('./brain-jeu.mutant-' + process.pid + '-plafond1.js', import.meta.url);
  writeFileSync(url2, src.replace(b, ''));
  try { const M = await import(url2.href); vu(M.prochaineProposition(sk([skin({ prix: 6000000n })])).kind === 'NONE', 'une seule garde retiree : la premiere tient encore (defense en profondeur)'); }
  finally { try { unlinkSync(url2); } catch (_) {} }
}
/* ── MUTANTS DES DUELS : chaque garde retiree DOIT faire rougir son assertion ── */
await mutant('plafond de duel retire', 'if (m > plafondDuel) {', 'if (false) {', (M) => M.prochaineProposition(du([duel({ stake: 3000000n })])).kind === 'DUEL_JOIN');
await mutant('solde de duel ignore', 'if (m > solde) {', 'if (false) {', (M) => M.prochaineProposition(du([duel({ stake: 2000000n })], {}, { balanceUsdc: '1500000' })).kind === 'DUEL_JOIN');
await mutant('budget de duel ignore', 'if (m > reste) {', 'if (false) {', (M) => M.prochaineProposition(du([duel()], {}, { budgetUsdc: '900000' })).kind === 'DUEL_JOIN');
await mutant('jeton non USDC accepte', "bas(d.token) === usdcD && !vus.has('DUEL_JOIN:'", "true && !vus.has('DUEL_JOIN:'", (M) => M.prochaineProposition(du([duel({ token: NVDA })])).kind === 'DUEL_JOIN');
await mutant('un CREATE par heure retire', 'else if (crees > 0)', 'else if (false)', (M) => M.prochaineProposition(du([], {}, { history: hDuel(600) })).kind === 'DUEL_CREATE');
await mutant('son duel ouvert ignore', 'if (ouvertsMiens > 0)', 'if (false)', (M) => M.prochaineProposition(du([duel({ creator: W })])).kind === 'DUEL_CREATE');
await mutant('settle de duel deja signe re-propose', "&& !vus.has('DUEL_SETTLE:' + d.id))", '&& true)', (M) => M.prochaineProposition({ ...du([pris()], { maxDuelStakeUsdc: '0' }), seen: ['DUEL_SETTLE:5'] }).kind === 'DUEL_SETTLE');
await mutant('settle de duel apres le roll', "if (regles.duels && D) {\n    const miens", "if (regles.duels && D && !regles.rolls) {\n    const miens", (M) => M.prochaineProposition(du([pris()], { rolls: true }, { rolls: base().rolls })).kind === 'ROLL');
await mutant('drapeau duels « true » texte accepte', 'duels: x.duels === true,', 'duels: !!x.duels,', (M) => M.prochaineProposition(du([duel()], { duels: 'true' })).kind === 'DUEL_JOIN');
/* le join de SON propre duel a DEUX gardes (le filtre ici, puis planJoin) : il faut retirer les deux pour le franchir */
{
  const a = "bas(d.creator) !== moi && bas(d.token) === usdcD";
  vu(src.split(a).length === 2, 'mutant propre duel : le motif existe une fois');
  const url = new URL('./brain-jeu.mutant-' + process.pid + '-propre.js', import.meta.url);
  writeFileSync(url, src.replace(a, 'bas(d.token) === usdcD'));
  try { const M = await import(url.href); vu(M.prochaineProposition(du([duel({ creator: W })])).kind === 'NONE', 'filtre « pas le sien » retire : planJoin refuse encore (defense en profondeur), NONE'); }
  finally { try { unlinkSync(url); } catch (_) {} }
}
console.log('ok brain-jeu - ' + n + ' assertions');
