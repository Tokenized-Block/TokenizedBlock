/* banc-duels-live-fork-20261018.mjs — le flux DUELS de bout en bout, sur un FORK de Base, contre le contrat BlockDuels LIVE
 * (l adresse de duels-deploiement.js : rien n est deploye ici), deux wallets anvil, chaque appel construit par les PLANNERS PURS de
 * l app (duels-plan-app.js : planCreate / planJoin / planSettle / planCancel / planRefund) -- jamais encode a la main -- et relu par les
 * lecteurs de l app (duels-plan.js : lireCreated / lireJoined / lireSettled / lireRefunded / lireCancelled ; duels-plan-app.js :
 * lireEvenementsDuel / lireDuels / etatDuel / actionsDuel = la partie PURE de lireDuelsSrv de serveur-web.js).
 * Usage : "C:\Users\VolKov\.foundry\bin\anvil.exe" --fork-url https://mainnet.base.org --port 9641 --chain-id 8453
 *         puis node banc-duels-live-fork-20261018.mjs [http://127.0.0.1:9641]      (un port DEDIE : aucun autre banc ne partage ce fork)
 * DEROULE (vraies transactions sur le fork ; les wallets A, B, TIERS sont les comptes anvil ; RIEN n est signe ni envoye sur Base) :
 *   0. le fork est Base (8453), le contrat LIVE a du code, ses immuables relus = la fiche (USDC, DEV_WALLET, REWARD_POOL), tokenOk(USDC) ;
 *      chaque selecteur et chaque topic des planners / lecteurs est PRESENT dans le bytecode LIVE ; les deux jumeaux (duels-plan.js,
 *      duels-plan-app.js) encodent les MEMES octets.
 *   1. USDC reel aux wallets : un detenteur riche du fork est impersonne (delta mesure au wei).
 *   2. un duel GAGNE (mise 5,000001 USDC : la poussiere va au dev) : A cree, B rejoint (guess different sur chaque trait), 2 blocs mines,
 *      settle par un TIERS ; gagnant +90 % du pot, pot commun +7 %, dev +3 % + poussiere, perdant +0, contrat -pot -- au wei, contre
 *      partage() de l app ET splitOf() du contrat LIVE. Le hash n est pas choisi : une egalite est verifiee et rejouee (8 essais max).
 *   3. une EGALITE (meme guess) : Settled(winner 0, payout 0) + Refunded(stake, stake), les deux mises rendues, 0 au pot commun, 0 au dev.
 *   4. un CANCEL avant join : cancel par B refuse (NotCreator), cancel par A rend la mise ; Cancelled lu.
 *   5. un duel REJOINT laisse 257 blocs : refundExpired refuse dans la fenetre, settle refuse apres (TooLate), refundExpired par un TIERS
 *      rend les DEUX mises.
 *   6. (bonus) un duel JAMAIS rejoint, expire : refundExpired rend la mise au createur.
 *   7. les logs du fork relus comme le serveur (filtreLogsDuels -> eth_getLogs -> lireDuels -> etatDuel) : chaque duel classe.
 *   8. balanceOf(contrat) revenu a sa valeur de depart : rien n est retenu.
 * NE PROUVE PAS : un vrai wallet qui signe, la page dans un navigateur, lireDuelsSrv lui-meme (il vit dans serveur-web.js avec son etat et
 *   son rpcServeur : seule sa partie pure est rejouee ici), ni le comportement du noeud Base de production (blockhash, getLogs). */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { selecteur, topic } from './keccak.js';
import * as APP from './duels-plan-app.js';
import * as P from './duels-plan.js';
import { DUELS_DEPLOIEMENT as D } from './duels-deploiement.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9641';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exit(1); }
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return !!c; };
const rpc = async (method, params = []) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + r.error.message);
  return r.result;
};
const bas = (x) => String(x || '').toLowerCase();
const adrMot = (a) => bas(a).slice(2).padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const appel = async (to, sig, args = '') => String(await rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']));
const lireU = async (to, sig, args = '') => BigInt(await appel(to, sig, args));
const lireAdr = async (to, sig) => bas('0x' + (await appel(to, sig)).slice(-40));
const usd = (x) => (Number(x) / 1e6).toFixed(6);
async function recu(h) {
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
/* envoie un appel TEL QUE le planner l a construit (to, data) : rien n est reencode ici */
const envoyer = async (de, appelPlan, gas = 600000) => recu(await rpc('eth_sendTransaction', [{ from: de, to: appelPlan.to, data: appelPlan.data, gas: hex(gas) }]));
const bloc = async () => parseInt(await rpc('eth_blockNumber'), 16);
const ts = async () => parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);

/* 0. le fork, le contrat LIVE, les immuables, la parite planners <-> bytecode LIVE */
const C = bas(D.adresse), USDC = bas(D.constructeur.usdc), DEV = bas(D.constructeur.devWallet), POOL = bas(D.constructeur.rewardPool);
const chaine = parseInt(await rpc('eth_chainId'), 16), teteDepart = await bloc();
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + teteDepart + ' · contrat LIVE ' + C + ' (fiche : bloc ' + D.bloc + ')');
if (!ok(chaine === 8453, 'le fork est Base (8453)')) process.exit(1);
if (!ok(teteDepart > D.bloc, 'la tete du fork (' + teteDepart + ') est apres le bloc de deploiement de la fiche (' + D.bloc + ')')) process.exit(1);
const code = bas(await rpc('eth_getCode', [C, 'latest']));
if (!ok(code.length > 2, 'le contrat LIVE a du code (' + (code.length - 2) / 2 + ' octets de runtime)')) process.exit(1);
ok(C === '0x6b7647b326a635c0902eaed41ab0b41746b9602c' && USDC === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' && POOL === '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b' && DEV === '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4',
  'la fiche porte les adresses attendues (contrat, USDC, rewardPool, devWallet)');
ok((await lireAdr(C, 'USDC()')) === USDC && (await lireAdr(C, 'DEV_WALLET()')) === DEV && (await lireAdr(C, 'REWARD_POOL()')) === POOL, 'immuables RELUS sur le contrat LIVE = la fiche : USDC, DEV_WALLET, REWARD_POOL');
ok((await lireU(C, P.SIG_TOKEN_OK, adrMot(USDC))) === 1n, 'tokenOk(USDC) = vrai sur le LIVE');
const nextIdDepart = await lireU(C, P.SIG_NEXT_ID);
console.log('  nextId LIVE au depart : ' + nextIdDepart + ' (' + (nextIdDepart - 1n) + ' duel(s) deja crees sur Base)');
/* chaque selecteur de fonction utilise par les planners / le banc, et chaque topic d evenement lu, est dans le bytecode LIVE */
const sigs = [APP.SIG_CREATE, APP.SIG_JOIN, APP.SIG_CANCEL, APP.SIG_SETTLE, APP.SIG_REFUND, APP.SIG_NEXT_ID, APP.SIG_CLAIM, APP.SIG_OWED, P.SIG_TOKEN_OK, P.SIG_DUELS, P.SIG_SPLIT_OF, P.SIG_SETTLEABLE_UNTIL];
const selAbsents = sigs.filter((s) => !code.includes(selecteur(s).slice(2)));
ok(selAbsents.length === 0, sigs.length + ' selecteurs des planners presents dans le bytecode LIVE' + (selAbsents.length ? ' -- ABSENTS : ' + selAbsents.join(', ') : ''));
const evs = [P.EV_CREATED, P.EV_JOINED, P.EV_SETTLED, P.EV_REFUNDED, P.EV_CANCELLED, P.EV_OWED];
const topAbsents = evs.filter((e) => !code.includes(topic(e).slice(2)));
ok(topAbsents.length === 0, evs.length + ' topics des lecteurs (duels-plan.js) presents dans le bytecode LIVE' + (topAbsents.length ? ' -- ABSENTS : ' + topAbsents.join(', ') : ''));
/* les variantes TOLEREES par duels-plan-app.js : lesquelles sont celles du LIVE ? (une seule par evenement doit l etre) */
const variantesLive = (l) => l.filter((e) => code.includes(topic(e).slice(2)));
ok(variantesLive(APP.EVS_CREATED).join() === P.EV_CREATED && variantesLive(APP.EVS_JOINED).join() === P.EV_JOINED && variantesLive(APP.EVS_SETTLED).join() === P.EV_SETTLED && variantesLive(APP.EVS_REFUNDED).join() === P.EV_REFUNDED && variantesLive(APP.EVS_CANCELLED).join() === P.EV_CANCELLED,
  'duels-plan-app.js : exactement UNE variante par evenement est celle du LIVE, et c est la premiere de chaque liste (= duels-plan.js)');
ok(!code.includes(selecteur('admitted(address)').slice(2)) && !code.includes(selecteur('tokens(address)').slice(2)) && code.includes(selecteur('tokenOk(address)').slice(2)) && APP.SIGS_ADMIS[0] === 'tokenOk(address)',
  'le getter d admission du LIVE est tokenOk(address) : le PREMIER essaye par duels-plan-app.js (SIGS_ADMIS)');

/* 1. les wallets anvil et l USDC reel */
const comptes = (await rpc('eth_accounts')).map(bas);
if (!ok(comptes.length >= 3, 'anvil expose au moins 3 comptes (' + comptes.length + ')')) process.exit(1);
const [A, B, TIERS] = comptes;
const solde = (qui, jeton = USDC) => lireU(jeton, 'balanceOf(address)', adrMot(qui));
const pools = [...POOLS_ACTIONS_AERODROME.values()].map((t) => t.pool).filter(Boolean);
let source = null;
for (const p of pools) { if ((await solde(p)) >= 100_000_000n) { source = bas(p); break; } }
if (!ok(!!source, 'un detenteur USDC du fork tient >= 100 USDC (source ' + source + ')')) process.exit(1);
await rpc('anvil_impersonateAccount', [source]);
await rpc('anvil_setBalance', [source, hex(10n ** 18n)]);
const avantFonds = [await solde(A), await solde(B)];
for (const w of [A, B]) await envoyer(source, { to: USDC, data: selecteur('transfer(address,uint256)') + adrMot(w) + mot(30_000_000n) });
await rpc('anvil_stopImpersonatingAccount', [source]);
ok((await solde(A)) - avantFonds[0] === 30_000_000n && (await solde(B)) - avantFonds[1] === 30_000_000n, '30 USDC reels de plus a A (' + A + ') et B (' + B + ') -- deltas au wei ; soldes de depart ' + usd(avantFonds[0]) + ' / ' + usd(avantFonds[1]));
const cDepart = await solde(C);
console.log('  balanceOf(contrat LIVE) au depart : ' + usd(cDepart) + ' USDC');

/* ------------------------------------------------------------------ les gestes de l app */
const lireDuelChaine = async (id) => P.lireDuel(await appel(C, P.SIG_DUELS, mot(id)));
/* les duels relus COMME LE SERVEUR : filtreLogsDuels -> eth_getLogs -> lireDuels (la partie pure de lireDuelsSrv) */
async function duelsServeur() {
  const tete = await bloc();
  const filtre = APP.filtreLogsDuels({ contrat: C, de: teteDepart + 1, a: tete });
  const logs = await rpc('eth_getLogs', [filtre]);
  return { ...APP.lireDuels({ logs, contrat: C }), tete, nLogs: logs.length };
}
const parties = async () => ({ a: await solde(A), b: await solde(B), pool: await solde(POOL), dev: await solde(DEV), c: await solde(C), tiers: await solde(TIERS) });
const MISE = 5_000_001n; /* impaire : la poussiere d arrondi doit aller au dev */
const TAILLES = APP.TAILLES;
let compteurJumeaux = 0;
const memesOctets = (p1, p2) => p1.etat === 'PRET' && p2.etat === 'PRET' && p1.appels.length === p2.appels.length && p1.appels.every((x, i) => x.to === p2.appels[i].to && x.data === p2.appels[i].data);

async function creer(qui, guess, expiresIn = 3600, mise = MISE) {
  const pl = APP.planCreate({ contrat: C, token: USDC, stake: mise, guess, expiresIn });
  if (pl.etat !== 'PRET') throw new Error('planCreate ' + pl.pourquoi);
  const pj = P.planCreer({ contrat: C, jeton: USDC, mise, guess, expireDans: expiresIn, admis: (await lireU(C, P.SIG_TOKEN_OK, adrMot(USDC))) === 1n });
  if (memesOctets(pl, pj)) compteurJumeaux += 1; else throw new Error('planCreate (app) et planCreer (duels-plan) n encodent pas les memes octets');
  let r = null;
  for (const ap of pl.appels) { r = await envoyer(qui, ap); if (r.status !== '0x1') throw new Error('creer: status ' + r.status + ' sur ' + ap.quoi); }
  const ev = P.lireCreated(r.logs, C), evApp = APP.lireEvenementsDuel(r.logs, C).find((x) => x.type === 'CREATED');
  if (!ev || !evApp || ev.id.toString() !== evApp.id) throw new Error('Created illisible');
  return { ...ev, recu: r, evApp };
}
async function rejoindre(qui, id, guess) {
  /* l app lit le duel par /api/duels (lireDuels sur les logs), jamais par le getter : on fait pareil */
  const { duels } = await duelsServeur();
  const d = duels.get(String(id));
  if (!d) throw new Error('duel #' + id + ' absent des logs relus');
  const pl = APP.planJoin({ contrat: C, duel: d, guess, moi: qui, maintenant: await ts() });
  if (pl.etat !== 'PRET') throw new Error('planJoin ' + pl.pourquoi);
  const pj = P.planRejoindre({ contrat: C, id, guess, wallet: qui, duel: await lireDuelChaine(id), admis: true, maintenant: await ts() });
  if (memesOctets(pl, pj)) compteurJumeaux += 1; else throw new Error('planJoin (app) et planRejoindre (duels-plan) n encodent pas les memes octets');
  let r = null;
  for (const ap of pl.appels) { r = await envoyer(qui, ap); if (r.status !== '0x1') throw new Error('rejoindre: status ' + r.status + ' sur ' + ap.quoi); }
  const ev = P.lireJoined(r.logs, C);
  if (!ev) throw new Error('Joined illisible');
  return { ...ev, recu: r };
}
const settle = (id, targetBlock = null, blocActuel = null) => { const p = APP.planSettle({ contrat: C, id, targetBlock, blocActuel }); const q = P.planSettle({ contrat: C, id, targetBlock, blocActuel }); if (p.etat === 'PRET' && memesOctets(p, q)) compteurJumeaux += 1; return p; };
const refund = (id) => { const p = APP.planRefund({ contrat: C, id }); const q = P.planRefundExpired({ contrat: C, id }); if (memesOctets(p, q)) compteurJumeaux += 1; return p; };
const cancel = (id) => { const p = APP.planCancel({ contrat: C, id }); const q = P.planCancel({ contrat: C, id }); if (memesOctets(p, q)) compteurJumeaux += 1; return p; };
const ids = { gagne: null, egalite: null, annule: null, expire: null, jamaisRejoint: null };

/* 2. un duel GAGNE (le hash n est pas choisi : les egalites sont verifiees et rejouees) */
const splitLive = await appel(C, P.SIG_SPLIT_OF, mot(MISE));
const [spW, spP, spD] = (splitLive.slice(2).match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
const sp = APP.partage(MISE);
ok(spW === sp.gagnant && spP === sp.pool && spD === sp.dev && sp.gagnant + sp.pool + sp.dev === 2n * MISE && sp.dev === 300_001n,
  'splitOf(' + MISE + ') LIVE = partage() de l app : gagnant ' + sp.gagnant + ' · pot commun ' + sp.pool + ' · dev ' + sp.dev + ' (3 % + 1 wei de poussiere), somme = pot');
let gagne = null, essais = 0;
while (!gagne && essais < 8) {
  essais += 1;
  const gA = TAILLES.map((t, i) => (essais * 7 + i * 3) % t), gB = gA.map((x, i) => (x + 1) % TAILLES[i]);
  const cr = await creer(A, gA);
  /* l etat vu par l app AVANT le join : OUVERT, actions = JOIN pour B, CANCEL pour A */
  const s0 = await duelsServeur();
  const d0 = s0.duels.get(cr.id.toString()), t0 = await ts();
  /* un duel ouvert est prenable par N IMPORTE QUEL autre wallet (B ou un tiers) ; le createur, lui, ne peut que l annuler */
  if (essais === 1) ok(d0 && APP.etatDuel(d0, s0.tete, t0).etat === 'OUVERT' && APP.actionsDuel(d0, B, s0.tete, t0, true).join() === 'JOIN' && APP.actionsDuel(d0, A, s0.tete, t0).join() === 'CANCEL' && APP.actionsDuel(d0, TIERS, s0.tete, t0, true).join() === 'JOIN' && APP.actionsDuel(d0, TIERS, s0.tete, t0).join() === '' && APP.actionsDuel(d0, null, s0.tete, t0, true).join() === '',
    'duel #' + cr.id + ' relu comme le serveur : OUVERT ; B -> JOIN, un tiers -> JOIN, A (createur) -> CANCEL, sans wallet -> rien');
  const jo = await rejoindre(B, cr.id, gB);
  const d1 = await lireDuelChaine(cr.id);
  if (essais === 1) {
    ok(cr.id === nextIdDepart && cr.creator === A && cr.stake === MISE && cr.guess.join() === gA.join() && bas(cr.token) === USDC && cr.evApp.stake === MISE && cr.evApp.guessA.join() === gA.join(),
      'Created lu par lireCreated (duels-plan) ET decoderLogDuel (app) : id ' + cr.id + ' = nextId du LIVE, createur A, mise ' + MISE + ', guess ' + gA.join(','));
    ok(jo.joiner === B && jo.guess.join() === gB.join() && jo.targetBlock === BigInt(d1.targetBlock) && d1.targetBlock === parseInt(jo.recu.blockNumber, 16) + 2 && d1.status === 2 && bas(d1.joiner) === B && (await solde(C)) - cDepart === 2n * MISE,
      'Joined lu par lireJoined : B, guess ' + gB.join(',') + ', cible = bloc du join + 2 (' + jo.targetBlock + ') ; duels(id) : Joined ; le contrat tient 2 x mise de plus');
    const s1 = await duelsServeur(), e1 = APP.etatDuel(s1.duels.get(cr.id.toString()), s1.tete, await ts());
    /* tete = bloc du join (N), cible = N + 2, settle passe au bloc N + 3 : il manque 3 blocs (N+1, N+2, N+3), comme le dit planSettle */
    ok(e1.etat === 'ATTENTE' && e1.blocsAvant === 3 && /wait 3 more block/.test(APP.planSettle({ contrat: C, id: cr.id, targetBlock: d1.targetBlock, blocActuel: s1.tete }).pourquoi), 'relu comme le serveur juste apres le join (tete = bloc du join) : ATTENTE, 3 blocs avant que settle passe ; planSettle dit « wait 3 more block(s) »');
    ok(settle(cr.id, d1.targetBlock, (await bloc()) + 1).etat === 'REFUSE', 'planSettle refuse avant la cible (TROP_TOT)');
    const tropTot = await envoyer(TIERS, P.planSettle({ contrat: C, id: cr.id }).appels[0]);
    ok(tropTot.status === '0x0', 'settle envoye quand meme avant la cible : status 0 (TooEarly)');
  }
  await rpc('anvil_mine', ['0x2']);
  const h = bas((await rpc('eth_getBlockByNumber', [hex(d1.targetBlock), false])).hash);
  const att = P.scoresDuel(h, gA, gB);
  const s2 = await duelsServeur(), e2 = APP.etatDuel(s2.duels.get(cr.id.toString()), s2.tete, await ts());
  if (essais === 1) ok(e2.etat === 'REGLABLE' && APP.actionsDuel(s2.duels.get(cr.id.toString()), TIERS, s2.tete, await ts()).join() === 'SETTLE', 'relu comme le serveur apres 2 blocs : REGLABLE, action SETTLE (meme pour un tiers)');
  const av = await parties();
  const pl = settle(cr.id, d1.targetBlock, (await bloc()) + 1);
  if (!ok(pl.etat === 'PRET', 'planSettle PRET dans la fenetre')) break;
  const r = await envoyer(TIERS, pl.appels[0]);
  const S = P.lireSettled(r.logs, C), Sapp = APP.lireEvenementsDuel(r.logs, C).find((x) => x.type === 'SETTLED');
  const ap = await parties();
  ok(r.status === '0x1' && S && Sapp && S.blockHash === h && Sapp.blockHash === h && S.scoreA === att.scoreA && S.scoreB === att.scoreB && Sapp.scoreA === att.scoreA && Sapp.scoreB === att.scoreB,
    'essai ' + essais + ' (gaz ' + BigInt(r.gasUsed) + ') : Settled porte le hash du bloc cible LU sur le fork ; scores ' + (S && S.scoreA) + ' / ' + (S && S.scoreB) + ' = ceux de l app (face ' + att.face.join(',') + ')');
  if (att.gagnant === 'EGALITE') {
    ok(S.egalite && ap.a - av.a === MISE && ap.b - av.b === MISE && ap.pool === av.pool && ap.dev === av.dev && av.c - ap.c === 2n * MISE, 'essai ' + essais + ' : egalite ' + S.scoreA + '-' + S.scoreB + ' (hash non choisi) : les deux mises rendues, aucun frais ; on rejoue');
    continue;
  }
  gagne = { id: cr.id, w: att.gagnant === 'A' ? A : B, S, Sapp, av, ap, r, d: s2.duels.get(cr.id.toString()) };
}
if (ok(!!gagne, 'un duel gagne obtenu en ' + essais + ' essai(s) (hash non choisi)')) {
  const { w, S, Sapp, av, ap, r, d } = gagne;
  ids.gagne = gagne.id;
  const g = w === A ? 'a' : 'b', perdant = g === 'a' ? 'b' : 'a';
  ok(bas(S.winner) === w && S.payout === sp.gagnant && bas(Sapp.winner) === w && Sapp.payout === sp.gagnant, 'Settled : gagnant ' + (w === A ? 'A' : 'B') + ', payout ' + sp.gagnant + ' (90 % du pot ' + 2n * MISE + ')');
  ok(ap[g] - av[g] === sp.gagnant && ap[perdant] === av[perdant] && ap.pool - av.pool === sp.pool && ap.dev - av.dev === sp.dev && av.c - ap.c === 2n * MISE && ap.tiers === av.tiers,
    'soldes USDC REELS au wei : gagnant +' + usd(ap[g] - av[g]) + ' · perdant +0 · rewardPool +' + usd(ap.pool - av.pool) + ' · dev +' + usd(ap.dev - av.dev) + ' (poussiere incluse) · contrat -' + usd(av.c - ap.c) + ' · tiers +0');
  const res = APP.resultatDuel(d, S.blockHash);
  ok(res && res.gagnant === w && res.auGagnant === sp.gagnant && res.auPool === sp.pool && res.auDev === sp.dev && !res.egalite, 'resultatDuel (app) sur le hash du Settled : meme gagnant, memes montants');
  const re = await envoyer(TIERS, settle(gagne.id).appels[0]);
  ok(re.status === '0x0', 'settle une 2e fois : status 0 (NotJoined)');
  ok((await lireDuelChaine(gagne.id)).status === 3, 'duels(id) LIVE : statut Settled (3)');
  ok(parseInt(r.blockNumber, 16) > 0 && APP.lireEvenementsDuel(r.logs, C).length === 1, 'un settle gagne emet exactement 1 evenement de duel (Settled)');
}

/* 3. une EGALITE garantie : le meme guess des deux cotes */
{
  const g = [3, 4, 5, 6, 7];
  const cr = await creer(A, g);
  await rejoindre(B, cr.id, g);
  const d = await lireDuelChaine(cr.id);
  await rpc('anvil_mine', ['0x2']);
  const av = await parties();
  const r = await envoyer(TIERS, settle(cr.id, d.targetBlock, (await bloc()) + 1).appels[0]);
  const S = P.lireSettled(r.logs, C), R = P.lireRefunded(r.logs, C), evApp = APP.lireEvenementsDuel(r.logs, C).map((x) => x.type);
  const ap = await parties();
  ok(r.status === '0x1' && S && S.egalite && S.winner === null && S.payout === 0n && S.scoreA === S.scoreB && R && R.toCreator === MISE && R.toJoiner === MISE && evApp.join() === 'SETTLED,REFUNDED',
    'egalite (duel #' + cr.id + ', cible ' + d.targetBlock + ', ' + (S && S.scoreA) + '-' + (S && S.scoreB) + ') : Settled winner 0, payout 0, Refunded(' + MISE + ', ' + MISE + ') ; l app lit SETTLED puis REFUNDED');
  ok(ap.a - av.a === MISE && ap.b - av.b === MISE && ap.pool === av.pool && ap.dev === av.dev && av.c - ap.c === 2n * MISE, 'soldes au wei : A +mise, B +mise, rewardPool +0, dev +0, contrat -2 x mise');
  ids.egalite = cr.id;
}

/* 4. un CANCEL avant join */
{
  const cr = await creer(A, [1, 2, 3, 4, 5]);
  const parB = await envoyer(B, cancel(cr.id).appels[0]);
  ok(parB.status === '0x0', 'cancel par B (pas le createur) : status 0 (NotCreator)');
  ok(P.planCancel({ contrat: C, id: cr.id, duel: await lireDuelChaine(cr.id), wallet: B }).etat === 'REFUSE', 'duels-plan.js planCancel avec duel + wallet refuse B avant la signature');
  const av = await parties();
  const r = await envoyer(A, cancel(cr.id).appels[0]);
  const Cc = P.lireCancelled(r.logs, C), evApp = APP.lireEvenementsDuel(r.logs, C);
  const ap = await parties();
  ok(r.status === '0x1' && Cc && Cc.id === cr.id && evApp.length === 1 && evApp[0].type === 'CANCELLED' && evApp[0].id === cr.id.toString(), 'cancel par A (gaz ' + BigInt(r.gasUsed) + ') : Cancelled lu par lireCancelled et par l app');
  ok(ap.a - av.a === MISE && ap.b === av.b && ap.pool === av.pool && ap.dev === av.dev && av.c - ap.c === MISE && (await lireDuelChaine(cr.id)).status === 4, 'la mise revient a A au wei ; statut Cancelled (4)');
  const apres = await envoyer(B, APP.planJoin({ contrat: C, duel: { ...(await duelsServeur()).duels.get(cr.id.toString()), cancelled: false }, guess: [0, 0, 0, 0, 0], moi: B, maintenant: await ts() }).appels[1]);
  ok(apres.status === '0x0', 'join apres cancel (forcage du planner) : status 0 (NotOpen)');
  ids.annule = cr.id;
}

/* 5. un duel REJOINT laisse 257 blocs : refundExpired par un TIERS */
{
  const cr = await creer(A, [0, 0, 0, 0, 0]);
  const jo = await rejoindre(B, cr.id, [1, 1, 1, 1, 1]);
  const t = Number(jo.targetBlock);
  ok((await envoyer(TIERS, refund(cr.id).appels[0])).status === '0x0', 'refundExpired pendant la fenetre : status 0 (NotRefundable)');
  ok(P.planRefundExpired({ contrat: C, id: cr.id, duel: await lireDuelChaine(cr.id), blocActuel: (await bloc()) + 1 }).etat === 'REFUSE', 'duels-plan.js planRefundExpired refuse aussi avant la signature');
  await rpc('anvil_mine', [hex(t + 257 - (await bloc()))]);
  const b = await bloc();
  const s = await duelsServeur(), e = APP.etatDuel(s.duels.get(cr.id.toString()), s.tete, await ts());
  ok(b === t + 257 && e.etat === 'REMBOURSABLE' && APP.actionsDuel(s.duels.get(cr.id.toString()), TIERS, s.tete, await ts()).join() === 'REFUND', 'tete ' + b + ' = cible ' + t + ' + 257 : relu comme le serveur -> REMBOURSABLE, action REFUND');
  ok(settle(cr.id, t, b + 1).etat === 'REFUSE', 'planSettle refuse hors fenetre (PERDU -> refund)');
  ok((await envoyer(TIERS, P.planSettle({ contrat: C, id: cr.id }).appels[0])).status === '0x0', 'settle envoye quand meme hors fenetre : status 0 (TooLate)');
  const av = await parties();
  const r = await envoyer(TIERS, refund(cr.id).appels[0]);
  const R = P.lireRefunded(r.logs, C), evApp = APP.lireEvenementsDuel(r.logs, C);
  const ap = await parties();
  ok(r.status === '0x1' && R && R.toCreator === MISE && R.toJoiner === MISE && evApp.length === 1 && evApp[0].type === 'REFUNDED' && (await lireDuelChaine(cr.id)).status === 5, 'refundExpired par un TIERS (gaz ' + BigInt(r.gasUsed) + ') : Refunded(mise, mise), statut Refunded (5)');
  ok(ap.a - av.a === MISE && ap.b - av.b === MISE && ap.pool === av.pool && ap.dev === av.dev && av.c - ap.c === 2n * MISE && ap.tiers === av.tiers, 'soldes au wei : A +mise, B +mise, rewardPool +0, dev +0, tiers +0 -- aucun fonds bloque');
  ids.expire = cr.id;
}

/* 6. (bonus) un duel JAMAIS rejoint, expire (601 s) */
{
  const cr = await creer(A, [2, 2, 2, 2, 2], 600);
  await rpc('evm_increaseTime', [601]);
  await rpc('evm_mine', []);
  const s = await duelsServeur(), e = APP.etatDuel(s.duels.get(cr.id.toString()), s.tete, await ts());
  ok(e.etat === 'EXPIRE' && APP.actionsDuel(s.duels.get(cr.id.toString()), B, s.tete, await ts()).join() === 'REFUND', 'jamais rejoint, 601 s apres : relu comme le serveur -> EXPIRE, action REFUND');
  ok(APP.planJoin({ contrat: C, duel: s.duels.get(cr.id.toString()), guess: [1, 1, 1, 1, 1], moi: B, maintenant: await ts() }).etat === 'REFUSE', 'planJoin refuse un duel expire');
  const a0 = await solde(A);
  const r = await envoyer(TIERS, refund(cr.id).appels[0]);
  const R = P.lireRefunded(r.logs, C);
  ok(r.status === '0x1' && R && R.toCreator === MISE && R.toJoiner === 0n && (await solde(A)) - a0 === MISE, 'refundExpired par un tiers rend la mise au createur : Refunded(mise, 0)');
  ids.jamaisRejoint = cr.id;
}

/* 7. tout relu comme le serveur : chaque duel classe, aucun orphelin */
{
  const s = await duelsServeur(), t = await ts();
  const cl = (id) => APP.etatDuel(s.duels.get(String(id)), s.tete, t).etat;
  const nCrees = Number((await lireU(C, P.SIG_NEXT_ID)) - nextIdDepart);
  ok(s.duels.size === nCrees && s.orphelins.length === 0, 'eth_getLogs (filtreLogsDuels, ' + s.nLogs + ' logs) -> lireDuels : ' + s.duels.size + ' duels = nextId(fin) - nextId(depart) = ' + nCrees + ' ; 0 orphelin');
  ok(cl(ids.gagne) === 'REGLE' && cl(ids.egalite) === 'REGLE' && cl(ids.annule) === 'ANNULE' && cl(ids.expire) === 'REMBOURSE' && cl(ids.jamaisRejoint) === 'REMBOURSE',
    'classement final (etatDuel = etatDuelSrv) : #' + ids.gagne + ' REGLE · #' + ids.egalite + ' REGLE (egalite : settled + refunded) · #' + ids.annule + ' ANNULE · #' + ids.expire + ' REMBOURSE · #' + ids.jamaisRejoint + ' REMBOURSE');
  const finis = [...s.duels.values()].filter((d) => APP.FINIS.includes(APP.etatDuel(d, s.tete, t).etat)).length;
  ok(finis === s.duels.size, 'tous les ' + s.duels.size + ' duels sont FINIS pour /api/duels (aucun « vivant » qui resterait affiche)');
  const json = [...s.duels.values()].map((d) => APP.duelDepuisJson(JSON.parse(JSON.stringify(APP.duelEnJson(d)))));
  ok(json.every(Boolean) && json.every((d, i) => d.stake === [...s.duels.values()][i].stake), 'duelEnJson -> JSON -> duelDepuisJson : les ' + json.length + ' duels survivent au trajet serveur -> app (mise au wei)');
  ok(compteurJumeaux >= 12, 'les deux jumeaux (duels-plan-app.js / duels-plan.js) ont encode les MEMES octets ' + compteurJumeaux + ' fois (create, join, settle, cancel, refund)');
}

/* 8. rien n est retenu */
ok((await solde(C)) === cDepart, 'balanceOf(contrat LIVE) revenu a sa valeur de depart (' + usd(cDepart) + ' USDC) : rien n est retenu par ce banc');
console.log((ko ? 'ECHEC ' : 'ok ') + 'banc-duels-live-fork - ' + n + ' assertions, ' + ko + ' KO ; fork Base ' + URL_FORK + ', contrat LIVE ' + C + ', rien de signe sur mainnet');
process.exit(ko ? 1 : 0);
