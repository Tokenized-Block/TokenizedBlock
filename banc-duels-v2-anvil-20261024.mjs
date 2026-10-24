/* banc-duels-v2-anvil-20261024.mjs — BLOCKDUELSV2 DE BOUT EN BOUT sur un anvil LOCAL (chaine 8453 SIMULEE, aucun noeud de Base), avec les
 * OCTETS EXACTS de la fiche duels-v2-deploiement.js (ceux que Phil signera) et les CLES DE TEST PUBLIQUES d anvil (comptes deverrouilles).
 * DEROULE :
 *   0. gardes : URL locale, client « anvil », AUCUN code a l adresse USDC de la fiche (sur Base il y en a : ce ne serait pas un anvil vierge).
 *   1. un jeton de test (V2Jeton, 6 decimales, mint libre) est POSE a l adresse USDC de la fiche (anvil_setCode) : le constructeur exige du
 *      code a cette adresse ; les adresses dev / pot commun / gardien de la fiche restent celles de la fiche (aucune cle n est necessaire).
 *   2. la creation de la fiche, telle quelle ; noter-deploiement-duelsv2 (lireChaine + noter, les MEMES fonctions que sa CLI) l inscrit dans
 *      une COPIE temporaire de la fiche (jamais celle du depot).
 *   3. des duels joues par les planners de l app (duels-v2-plan.js) : gain du joueur regle, perte du joueur SILENCIEUX (defaut au createur
 *      par un tiers), egalite reglee (remboursee), egalite NON reglee (createur), gain du joueur NON regle (createur). Chaque solde est compare
 *      au partage attendu (resultatDuel / splitOf). settleDefault simule avant la fin de la fenetre : revert ; settle apres : revert.
 *   4. le lecteur du serveur (duels-v2-serveur.js) contre l anvil : chaque duel classe comme le contrat le dit ; le brain propose
 *      DUEL_SETTLE_DEFAULT pour un duel laisse apres sa fenetre, et ses appels passent ; conservation : solde du contrat == mises vivantes.
 * Usage : "%USERPROFILE%\.foundry\bin\anvil.exe" --port 9671 --chain-id 8453   puis   node banc-duels-v2-anvil-20261024.mjs [http://127.0.0.1:9671]
 * NE PROUVE PAS : Base mainnet (USDC reel, sequenceur, temps de bloc reel), un vrai wallet, la page de deploiement dans un navigateur. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { selecteur } from './keccak.js';
import * as V2 from './duels-v2-plan.js';
import * as S from './duels-v2-serveur.js';
import * as J from './brain-jeu.js';
import { enteteVersMesure, sParBlocMesure } from './temps-de-bloc.js';
import { noter, lireChaine } from './contracts/noter-deploiement-duelsv2.mjs';
import { DUELS_V2_DEPLOIEMENT as FICHE } from './duels-v2-deploiement.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const URL_ANVIL = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9671';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_ANVIL)) { console.log('KO anvil must be a local http address: nothing is sent'); process.exit(1); }
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return !!c; };
const rpc = async (method, params = []) => {
  const r = await fetch(URL_ANVIL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(method + ': ' + r.error.message); e.data = r.error.data; throw e; }
  return r.result;
};
const bas = (x) => String(x || '').toLowerCase();
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const adrMot = (a) => bas(a).slice(2).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
async function recu(h) { for (let i = 0; i < 200; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 25)); } throw new Error('no receipt ' + h); }
const envoyer = async (de, a) => { const h = await rpc('eth_sendTransaction', [{ from: de, to: a.to, data: a.data, gas: hex(900000) }]); const r = await recu(h); if (r.status !== '0x1') throw new Error('status ' + r.status + ' : ' + (a.quoi || a.data.slice(0, 10))); return r; };
const simule = async (de, a) => { try { await rpc('eth_call', [{ from: de, to: a.to, data: a.data }, 'latest']); return 'OK'; } catch (e) { return String(e.data || e.message); } };
const tete = async () => parseInt(await rpc('eth_blockNumber'), 16);
const ts = async () => parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
const lireArt = (p) => JSON.parse(fs.readFileSync(path.join(ICI, 'contracts/out', p), 'utf8'));

/* ═══ 0. gardes */
const client = String(await rpc('web3_clientVersion'));
const USDC = bas(FICHE.constructeur.usdc), DEVW = bas(FICHE.constructeur.devWallet), POOL = bas(FICHE.constructeur.rewardPool);
const chaine = parseInt(await rpc('eth_chainId'), 16);
if (!ok(/^anvil\//i.test(client) && chaine === 8453 && (await rpc('eth_getCode', [USDC, 'latest'])) === '0x', 'anvil LOCAL (' + client.split(' ')[0] + '), chaine 8453 simulee, aucun code a l adresse USDC de la fiche : rien de Base ici')) process.exit(1);
ok(FICHE.pret === true && FICHE.adresse === null && FICHE.bloc === null && crypto.createHash('sha256').update(Buffer.from(FICHE.creation.slice(2), 'hex')).digest('hex') === FICHE.sha256Creation,
  'fiche du depot : prete, adresse/bloc null, sha256 ' + FICHE.sha256Creation.slice(0, 16) + '… recalcule (' + FICHE.octetsCreation + ' octets)');
const [DEPLOYEUR, A, B, TIERS] = (await rpc('eth_accounts')).map(bas);

/* ═══ 1. le jeton de test a l adresse USDC */
await rpc('anvil_setCode', [USDC, lireArt('DuelsV2Jetons.sol/V2Jeton.json').deployedBytecode.object]);
for (const w of [A, B]) await envoyer(DEPLOYEUR, { to: USDC, data: selecteur('mint(address,uint256)') + adrMot(w) + mot(1_000_000_000_000n) });
const solde = async (w) => BigInt(await rpc('eth_call', [{ to: USDC, data: selecteur('balanceOf(address)') + adrMot(w) }, 'latest']));

/* ═══ 2. la creation EXACTE de la fiche, puis noter (sur une copie) */
const hDep = await rpc('eth_sendTransaction', [{ from: DEPLOYEUR, data: FICHE.creation, gas: hex(6_000_000) }]);
const rDep = await recu(hDep);
ok(rDep.status === '0x1' && /^0x[0-9a-f]{40}$/.test(bas(rDep.contractAddress)), 'la creation de la fiche passe telle quelle (status 0x1, contrat ' + bas(rDep.contractAddress) + ', gas ' + parseInt(rDep.gasUsed, 16) + ')');
const C = bas(rDep.contractAddress);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'duelsv2-noter-'));
try {
  const copie = path.join(tmp, 'duels-v2-deploiement.js');
  const texte = fs.readFileSync(path.join(ICI, 'duels-v2-deploiement.js'), 'utf8');
  fs.writeFileSync(copie, texte);
  const lu = await lireChaine(rpc, hDep, FICHE);
  ok(lu.tx && bas(lu.tx.input) === bas(FICHE.creation) && lu.tx.to === null && bas(lu.tx.chainId) === '0x2105', 'la tx relue : input == creation OCTET POUR OCTET, sans `to`, chainId 0x2105');
  ok(Object.entries(lu.relectures).every(([sig, v]) => v === bas(FICHE.constructeur[{ 'USDC()': 'usdc', 'DEV_WALLET()': 'devWallet', 'REWARD_POOL()': 'rewardPool', 'GUARDIAN()': 'guardian' }[sig]])) && lu.usdcAdmis === true && lu.nextId === '1'
    && lu.constantes['WINNER_BPS()'] === '9000' && lu.constantes['POOL_BPS()'] === '700' && lu.constantes['SETTLE_WINDOW()'] === '256', 'relectures = fiche (4 adresses), tokenOk(USDC), nextId 1, 9000 / 700 bps, fenetre 256');
  const v = noter({ fiche: FICHE, texte, ...lu });
  ok(v.ok === true && v.adresse === C && v.bloc === parseInt(rDep.blockNumber, 16), 'noter-deploiement-duelsv2 : INSCRIT adresse + bloc (sur la copie) — ' + (v.pourquoi || v.adresse));
  fs.writeFileSync(copie, v.texte);
  const { DUELS_V2_DEPLOIEMENT: F2 } = await import(pathToFileURL(copie).href);
  ok(S.contratDeFicheV2(F2) === C && S.contratDeFicheV2(FICHE) === null, 'la copie notee ouvre v2 (contratDeFicheV2), la fiche du depot non (adresse null)');
  const faux = noter({ fiche: FICHE, texte, ...lu, tx: { ...lu.tx, input: FICHE.creation.slice(0, -2) + '00' } });
  ok(faux.ok === false, 'un octet different dans l input : noter REFUSE (' + faux.pourquoi + ')');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

/* ═══ 3. le temps de bloc mesure sur les en-tetes (anvil_mine a 2 s / bloc), puis les duels */
await rpc('anvil_mine', [hex(300), hex(2)]);
const haut = enteteVersMesure(await rpc('eth_getBlockByNumber', ['latest', false]));
const basE = enteteVersMesure(await rpc('eth_getBlockByNumber', [hex(haut.bloc - 300), false]));
const sParBloc = sParBlocMesure({ haut, bas: basE });
ok(sParBloc === 2 && V2.phraseAvantJoin(sParBloc) === 'Settle within about 512 s after the result block (256 blocks at the measured block time) or the creator wins by default.', 'temps de bloc MESURE sur deux en-tetes : ' + sParBloc + ' s -> la ligne dite avant chaque join (512 s)');
const MISE = 1_000_000n, P = V2.partage(MISE);
const creer = async (guess) => { const p = V2.planCreate({ contrat: C, token: USDC, stake: MISE, guess, expiresIn: 3600 }); let r; for (const a of p.appels) r = await envoyer(A, a); return V2.lireEvenementsDuel(r.logs, C).find((x) => x.type === 'CREATED').id; };
const rejoindre = async (id, guess) => {
  const d = { id, creator: A, token: USDC, stake: MISE, expiresAt: (await ts()) + 3000, joiner: null };
  const p = V2.planJoin({ contrat: C, duel: d, guess, moi: B, maintenant: await ts(), sParBloc });
  if (p.etat !== 'PRET' || p.avertissement !== V2.phraseAvantJoin(sParBloc)) throw new Error('join not planned: ' + p.pourquoi);
  let r; for (const a of p.appels) r = await envoyer(B, a);
  return V2.lireEvenementsDuel(r.logs, C).find((x) => x.type === 'JOINED').targetBlock;
};
const resultat = async (id, guessA, guessB, t) => V2.resultatDuel({ creator: A, joiner: B, stake: MISE, guessA, guessB }, (await rpc('eth_getBlockByNumber', [hex(t), false])).hash);
const vus = { gagneRegle: null, gagneOublie: null, perduMuet: null, egaliteReglee: null, egaliteOubliee: null };
const lignes = [];
for (let k = 0; k < 60 && Object.values(vus).some((x) => x === null); k += 1) {
  const gA = [k % 6, (k * 3) % 10, (k * 7) % 19, (k * 5) % 9, (k * 3) % 8], gB = [(k + 2) % 6, (k * 7 + 1) % 10, (k * 11 + 3) % 19, (k + 4) % 9, (k * 5 + 1) % 8];
  const id = await creer(gA), t = await rejoindre(id, gB);
  await rpc('anvil_mine', ['0x3']);
  const r = await resultat(id, gA, gB, t);
  const genre = r.egalite ? 'egalite' : r.gagnant === B ? 'gagne' : 'perdu';
  const strat = genre === 'perdu' ? (vus.perduMuet === null ? 'perduMuet' : null)
    : genre === 'gagne' ? (vus.gagneRegle === null ? 'gagneRegle' : vus.gagneOublie === null ? 'gagneOublie' : null)
      : (vus.egaliteReglee === null ? 'egaliteReglee' : vus.egaliteOubliee === null ? 'egaliteOubliee' : null);
  const s0 = { A: await solde(A), B: await solde(B), pool: await solde(POOL), dev: await solde(DEVW) };
  const regle = strat === 'gagneRegle' || strat === 'egaliteReglee' || (!strat && genre !== 'perdu');
  if (regle) {
    /* dans la fenetre : settleDefault revert (WindowOpen) ; le joueur regle le vrai resultat */
    const pdTot = await simule(TIERS, { to: C, data: selecteur('settleDefault(uint256)') + mot(id) });
    if (!lignes.some((l) => l.windowOpen)) lignes.push({ windowOpen: pdTot.slice(0, 10) });
    const p = V2.planSettle({ contrat: C, id, targetBlock: t, blocActuel: await tete() });
    await envoyer(B, p.appels[0]);
  } else {
    /* le joueur se tait (ou est hors ligne) : 257 blocs, puis un TIERS envoie le defaut */
    await rpc('anvil_mine', [hex(257)]);
    const pTard = await simule(TIERS, { to: C, data: selecteur('settle(uint256)') + mot(id) });
    if (!lignes.some((l) => l.tooLate)) lignes.push({ tooLate: pTard !== 'OK' ? pTard.slice(0, 10) : null });
    const p = V2.planSettleDefault({ contrat: C, id, targetBlock: t, blocActuel: await tete() });
    if (p.etat !== 'PRET') throw new Error('default not planned: ' + p.pourquoi);
    const rr = await envoyer(TIERS, p.appels[0]);
    const dw = V2.lireEvenementsDuel(rr.logs, C).find((x) => x.type === 'DEFAULT_WON');
    if (!dw || dw.winner !== A || dw.payout !== P.gagnant) throw new Error('DefaultWon not read back as a creator win');
  }
  const s1 = { A: await solde(A), B: await solde(B), pool: await solde(POOL), dev: await solde(DEVW) };
  const d = { A: s1.A - s0.A, B: s1.B - s0.B, pool: s1.pool - s0.pool, dev: s1.dev - s0.dev };
  const attendu = regle ? (r.egalite ? { A: MISE, B: MISE, pool: 0n, dev: 0n } : r.gagnant === B ? { A: 0n, B: P.gagnant, pool: P.pool, dev: P.dev } : { A: P.gagnant, B: 0n, pool: P.pool, dev: P.dev })
    : { A: P.gagnant, B: 0n, pool: P.pool, dev: P.dev };
  const juste = d.A === attendu.A && d.B === attendu.B && d.pool === attendu.pool && d.dev === attendu.dev;
  if (strat) { vus[strat] = { id, juste, d, genre, scores: r.scoreA + '/' + r.scoreB }; }
  if (!juste) ok(false, 'duel #' + id + ' (' + genre + (regle ? ', regle' : ', defaut') + ') : soldes ' + JSON.stringify(Object.fromEntries(Object.entries(d).map(([a, b]) => [a, String(b)]))) + ' attendus ' + JSON.stringify(Object.fromEntries(Object.entries(attendu).map(([a, b]) => [a, String(b)]))));
}
const decrire = { gagneRegle: 'le joueur GAGNE et regle : +90 % au joueur, 7 % pot commun, 3 % dev', gagneOublie: 'le joueur gagne mais ne regle PAS (hors ligne) : le createur gagne par defaut (90 %)',
  perduMuet: 'le joueur PERD et se tait : un tiers envoie le defaut, le createur touche 90 % — exactement ce qu un settle honnete aurait paye',
  egaliteReglee: 'egalite reglee dans la fenetre : les deux mises rendues, aucun frais', egaliteOubliee: 'egalite NON reglee : le createur gagne par defaut (90 %)' };
for (const [k, v] of Object.entries(vus)) ok(v && v.juste, k + ' — ' + decrire[k] + (v ? ' (duel #' + v.id + ', scores ' + v.scores + ', joueur ' + String(v.d.B) + ', createur ' + String(v.d.A) + ')' : ' — JAMAIS OBTENU en 60 duels'));
const wo = lignes.find((l) => 'windowOpen' in l), tl = lignes.find((l) => 'tooLate' in l);
ok(wo && wo.windowOpen === selecteur('WindowOpen()'), 'settleDefault DANS la fenetre (simule) : revert WindowOpen() (' + (wo && wo.windowOpen) + ')');
ok(tl && tl.tooLate === selecteur('TooLate()'), 'settle APRES la fenetre (simule) : revert TooLate() (' + (tl && tl.tooLate) + ')');

/* ═══ 4. le lecteur du serveur, le brain, la conservation */
const idLaisse = await creer([1, 2, 3, 4, 5]); const tL = await rejoindre(idLaisse, [5, 4, 3, 2, 1]);
await rpc('anvil_mine', [hex(300)]);
const idOuvert = await creer([0, 0, 0, 0, 0]);
const L = S.creerLecteurDuelsV2({ rpc, contrat: C, intervalleMs: 0 });
await L.lire(true);
const st = L.etat(), maintenant = await ts();
const classe = (id) => V2.etatDuel(st.cache.get(String(id)).duel, st.tete, maintenant).etat;
ok(st.erreur === null && st.nextId === Number(idOuvert) + 1 && st.cache.size === Number(idOuvert), 'lecteur v2 contre l anvil : ' + st.cache.size + ' duels lus par l etat, aucune erreur');
ok([vus.gagneRegle, vus.egaliteReglee].every((v) => classe(v.id) === 'REGLE') && [vus.gagneOublie, vus.perduMuet, vus.egaliteOubliee].every((v) => classe(v.id) === 'GAGNE_DEFAUT')
  && classe(idLaisse) === 'DEFAULT_CREATOR' && classe(idOuvert) === 'OUVERT', 'classes comme le contrat : regles REGLE, defauts GAGNE_DEFAUT, le laisse DEFAULT_CREATOR, le neuf OUVERT');
const dDef = st.cache.get(String(vus.perduMuet.id)).duel;
ok(dDef.defaulted && dDef.defaulted.winner === A && dDef.defaulted.payout === P.gagnant, 'un defaut lu : gagnant = createur, gain = splitOf (' + P.gagnant + ')');
const liste = [...st.cache.values()].map((e) => V2.duelDepuisJson(JSON.parse(JSON.stringify(V2.duelEnJson(e.duel)))));
const prop = J.prochaineProposition({ authorized: true, wallet: TIERS, now: maintenant, budgetUsdc: '0', spentUsdc: '0', balanceUsdc: '0', rules: { rolls: false, settle: false, duels: true, maxDuelStakeUsdc: '0' }, history: [], seen: [],
  duels: { contract: C, usdc: USDC, guess: [0, 0, 0, 0, 0], expiresIn: 3600, block: await tete(), list: liste, open: true, version: 2, sParBloc } });
ok(prop.kind === 'DUEL_SETTLE_DEFAULT' && prop.cle === 'DUEL_SETTLE:' + idLaisse && prop.costUsdc === '0', 'le brain d un TIERS (budget 0) propose DUEL_SETTLE_DEFAULT pour #' + idLaisse + ' (cible ' + tL + ')');
const a0 = await solde(A);
for (const a of prop.calls) await envoyer(TIERS, a);
ok((await solde(A)) - a0 === P.gagnant, 'les appels du brain passent : le createur (hors ligne) touche ' + P.gagnant + ' par defaut');
await L.lire(true);
const vivants = [...L.etat().cache.values()].map((e) => e.duel).filter((d) => !d.settled && !d.cancelled && !d.refunded && !d.defaulted);
const mises = vivants.reduce((s, d) => s + (d.joiner ? 2n : 1n) * BigInt(d.stake), 0n);
const sC = await solde(C);
ok(sC === mises && vivants.length === 1, 'conservation : solde du contrat ' + sC + ' == mises vivantes ' + mises + ' (' + vivants.length + ' duel ouvert)');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; anvil LOCAL, cles de test publiques ; NE PROUVE PAS Base mainnet');
if (ko) process.exitCode = 1;
