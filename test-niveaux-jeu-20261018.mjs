/* test-niveaux-jeu-20261018.mjs — LES NIVEAUX DU BRAIN : XP DE GESTES VERIFIES SEULEMENT, ET UN PERK REEL (le tirage de la semaine).
 * AFFIRME (EXECUTE) :
 *  (A) tables epinglees (XP par action, seuils L1..L10, perks L3 +1 / L6 +2, plafond 2) ; niveauDe aux bornes (9/10, 29/30, 309/310, 5110) ;
 *      action inconnue / « practice » / compte illisible -> 0 XP ;
 *  (B) actionsDesLogs : Rolled PAYE -> roll, Rolled sur pass -> rien, Settled -> settle, PassBought -> pass_semaine, SkinMinted -> skin (minter),
 *      Sold -> skin (acheteur), TaskClaimed -> mission SEULEMENT si la source missions est ouverte ; un log d une AUTRE adresse avec le meme
 *      topic, un log mal forme, l adresse zero : ignores ; signatures d evenements = celles des sources Solidity ;
 *      crediterActions idempotent (les memes logs deux fois = memes compteurs) ; les rolls practice ({t, bloc, score}) ne creditent rien ;
 *  (C) joursTicketParWallet : jours <= aujourd hui seulement (un pass futur ne compte pas) ;
 *  (D) entreesPeriode(bonusNiveau) : plafond 2, pas d entree de jour -> pas de bonus (une entree BONUS Week pass ne qualifie pas), adresse
 *      illisible ignoree ; bonusNiveauxSemaine ne donne qu aux wallets L3+ ayant une entree de jour ;
 *  (E) TicketPot attesterSemaine : memes plafonds (bonus Week pass <= 3, bonus niveau <= 2, sans entree de jour : rien ; une entree bonus deja
 *      dans `entrees` ne compte pas deux fois) ; parite : poids paye = entrees publiees par entreesPeriode pour chaque wallet avec un jour ;
 *  (F) SERVEUR REEL sur un faux noeud : /api/jeu/niveau valide strictement (400/405), rend xp/level/next/perk ; les logs d une autre adresse
 *      ne creditent rien ; /api/tirage ajoute NIVEAU-1 au wallet L3 qui a une entree cette semaine, rien au L3 sans entree, rien au L1 ;
 *  (G) app : tuile « Its brain » et carte du brain peignent « Lv N · xp/next » (caches par defaut), la ligne du perk n apparait que si
 *      appliesThisWeek ; commande « level » analysee et routee ; aucun envoi dans bcCommandeLevel.
 * NE PROUVE PAS : de vrais logs de la chaine (voir le rapport : mesure separee), le rendu au navigateur, un claim TicketPot on-chain. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { XP_PAR_ACTION, NIVEAUX_XP, PERKS_NIVEAU, BONUS_NIVEAU_MAX, TOPICS_XP, EV_SKIN_MINTED, EV_SKIN_SOLD, EV_TASK_CLAIMED, xpDe, niveauDe, entreesBonusNiveau,
  actionsDesLogs, crediterActions, joursTicketParWallet, niveauWallet, bonusNiveauxSemaine } from './niveaux-jeu.js';
import { entreesPeriode, joursEntre, saisonDe, jourDe, JOUR_MS, BONUS_PASS_SEMAINE } from './tirage-saison.js';
import { EV_ROLLED, EV_SETTLED, EV_PASS_BOUGHT } from './blockrolls-plan.js';
import { attesterSemaine } from './ticketpot-attestation.js';
import { analyserCommande, PRECOMMANDES } from './commandes-panel.js';
import { adresseDe } from './signeur-secp256k1.js';
import { selecteur } from './keccak.js';
import * as P from './ticketpot-plan.js';
import { BLOCKROLLS_DEPLOIEMENT } from './blockrolls-deploiement.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const m32 = (v) => BigInt(v).toString(16).padStart(64, '0'), a32 = (x) => String(x).slice(2).toLowerCase().padStart(64, '0');
const W = '0x' + '1a'.repeat(20), V = '0x' + '2b'.repeat(20), U = '0x' + '3c'.repeat(20), X = '0x' + '4d'.repeat(20);
const ROLLS = '0x' + 'aa'.repeat(20), SKINS = '0x' + 'bb'.repeat(20), MISS = '0x' + 'cc'.repeat(20), AUTRE = '0x' + 'dd'.repeat(20);
let li = 0;
const tx = (k) => '0x' + m32(k);
const log = (address, topics, mots, k = li) => ({ address, topics, data: '0x' + mots.map(m32).join(''), transactionHash: tx(1000 + k), logIndex: '0x' + (li++).toString(16), blockNumber: '0x10' });
const rolled = (adr, joueur, avecPass) => log(adr, [TOPICS_XP.rolled, '0x' + m32(li + 1), '0x' + a32(joueur)], [1, 2, 3, 4, 5, 999, avecPass ? 1 : 0, 400000, 100000]);
const settled = (adr, joueur) => log(adr, [TOPICS_XP.settled, '0x' + m32(li + 1), '0x' + a32(joueur)], [0xabc, 1, 2, 3, 4, 5, 3, 0, 0]);
const pass = (adr, joueur) => log(adr, [TOPICS_XP.pass, '0x' + a32(joueur), '0x' + m32(20744)], [10, 1, 10000000, 0]);
const mint = (adr, minter) => log(adr, [TOPICS_XP.skinMinted, '0x' + m32(7), '0x' + a32(minter), '0x' + a32(AUTRE)], [12345]);
const vendu = (adr, vendeur, acheteur) => log(adr, [TOPICS_XP.skinSold, '0x' + m32(7), '0x' + a32(vendeur), '0x' + a32(acheteur)], [0, 1000000, 100000]);
const tache = (adr, qui) => log(adr, [TOPICS_XP.taskClaimed, '0x' + m32(3), '0x' + a32(qui), '0x' + 'ee'.repeat(32)], [1, 2, 3, 4]);

console.log('— A. tables et bornes');
ok(JSON.stringify(XP_PAR_ACTION) === JSON.stringify({ jour_ticket: 3, roll: 1, settle: 1, pass_semaine: 5, skin: 5, mission: 3 }), 'XP par action : jour_ticket 3, roll 1, settle 1, pass_semaine 5, skin 5, mission 3');
ok(JSON.stringify(NIVEAUX_XP) === JSON.stringify([0, 10, 30, 70, 150, 310, 630, 1270, 2550, 5110]) && NIVEAUX_XP.every((x, i) => i === 0 || x > NIVEAUX_XP[i - 1]), 'seuils L1 0 · L2 10 · L3 30 · L4 70 · L5 150 · L6 310 … L10 5110, strictement croissants');
ok(JSON.stringify(PERKS_NIVEAU) === JSON.stringify([{ niveau: 3, entrees: 1 }, { niveau: 6, entrees: 2 }]) && BONUS_NIVEAU_MAX === 2, 'perks : L3 +1, L6 +2, plafond 2');
const bornes = [[0, 1, 0, 10], [9, 1, 0, 10], [10, 2, 10, 30], [29, 2, 10, 30], [30, 3, 30, 70], [69, 3, 30, 70], [70, 4, 70, 150], [309, 5, 150, 310], [310, 6, 310, 630], [5109, 9, 2550, 5110], [5110, 10, 5110, null], [10 ** 9, 10, 5110, null]];
for (const [x, lv, base, next] of bornes) { const r = niveauDe(x); ok(r.level === lv && r.base === base && r.next === next && r.xp === x, 'niveauDe(' + x + ') = L' + lv + ' (base ' + base + ', next ' + next + ') — lu L' + r.level); }
ok(niveauDe(-5).level === 1 && niveauDe(NaN).xp === 0 && niveauDe('40').xp === 0 && niveauDe(2.5).xp === 0, 'xp illisible (negatif, NaN, texte, decimal) -> 0, L1');
ok(xpDe({ practice: 50, foo: 9, roll: 2, settle: 1 }) === 3, 'action inconnue (practice, foo) : 0 XP — 2 rolls + 1 settle = 3');
ok(xpDe({ roll: 1.5, settle: -2, skin: '3', jour_ticket: 2 }) === 6 && xpDe(null) === 0 && xpDe('x') === 0, 'compte non entier / negatif / texte ignore ; null -> 0');
ok([0, 1, 2, 3, 4, 5, 6, 7, 10, 99].map(entreesBonusNiveau).join() === '0,0,0,1,1,1,2,2,2,2' && entreesBonusNiveau(NaN) === 0, 'entreesBonusNiveau : 0 sous L3, 1 de L3 a L5, 2 des L6, jamais plus de 2');

console.log('— B. logs -> actions');
const src = fs.readFileSync(path.join(ICI, 'contracts/src/BlockRolls.sol'), 'utf8') + fs.readFileSync(path.join(ICI, 'contracts/src/BlockSkins.sol'), 'utf8') + fs.readFileSync(path.join(ICI, 'contracts/src/BlockMissionsV3.sol'), 'utf8');
const sigSol = (nom) => { const mm = new RegExp('event ' + nom + '\\(([^)]*)\\)').exec(src); return mm ? nom + '(' + mm[1].split(',').map((p) => p.trim().split(/\s+/)[0]).join(',') + ')' : null; };
for (const [nom, sig] of [['Rolled', EV_ROLLED], ['Settled', EV_SETTLED], ['PassBought', EV_PASS_BOUGHT], ['SkinMinted', EV_SKIN_MINTED], ['Sold', EV_SKIN_SOLD], ['TaskClaimed', EV_TASK_CLAIMED]]) ok(sigSol(nom) === sig, 'signature ' + nom + ' = source Solidity (' + sig + ')');
const sources = { rolls: ROLLS, skins: SKINS, missions: null };
const lots = [rolled(ROLLS, W, false), rolled(ROLLS, W, false), rolled(ROLLS, W, true), settled(ROLLS, W), pass(ROLLS, V), mint(SKINS, U), vendu(SKINS, U, V),
  rolled(AUTRE, X, false), settled(AUTRE, X), mint(AUTRE, X), rolled(SKINS, X, false), mint(ROLLS, X), tache(MISS, X),
  { ...rolled(ROLLS, X, false), data: '0x' + m32(1) }, { ...settled(ROLLS, X), transactionHash: '0x12' }, rolled(ROLLS, '0x' + '0'.repeat(40), false), { ...pass(ROLLS, X), logIndex: 'zz' }];
const acts = actionsDesLogs(lots, sources);
const resume = acts.map((x) => x.wallet.slice(2, 4) + ':' + x.action).join(',');
ok(resume === '1a:roll,1a:roll,1a:settle,2b:pass_semaine,3c:skin,2b:skin', 'actions verifiees seulement : 2 rolls payes + settle (W), pass (V), mint (U), achat (V) — lu ' + resume);
ok(!acts.some((x) => x.wallet === X), 'TEMOIN : une autre adresse (meme topic), un topic d une autre source, missions fermee, un log mal forme, l adresse zero : AUCUNE action pour X');
ok(new Set(acts.map((x) => x.cle)).size === acts.length && acts.every((x) => /^0x[0-9a-f]{64}:\d+$/.test(x.cle)), 'une cle unique tx:logIndex par action');
ok(actionsDesLogs([tache(MISS, X)], { ...sources, missions: MISS }).map((x) => x.action).join() === 'mission', 'crochet missions : TaskClaimed -> mission des que la source est ouverte (adresse notee)');
const e1 = crediterActions({}, acts), e2 = crediterActions(e1, actionsDesLogs(lots, sources));
ok(JSON.stringify(e1.xp) === JSON.stringify(e2.xp) && e1.xp[W].roll === 2 && e1.xp[W].settle === 1 && e1.xp[V].skin === 1 && e1.xp[V].pass_semaine === 1 && e1.xp[U].skin === 1, 'crediterActions : les memes logs relus ne recomptent rien (idempotent)');
const practice = [{ t: Date.now(), bloc: 123, score: 5 }, { t: Date.now(), bloc: 124, score: 4 }];
ok(actionsDesLogs(practice, sources).length === 0 && JSON.stringify(crediterActions({}, practice).xp) === '{}', 'rolls PRACTICE (/api/jeu/rolls : sans wallet) : aucune action, aucun XP');
ok(JSON.stringify(crediterActions({}, [{ cle: 'k', wallet: W, action: 'practice' }, { cle: 'j', wallet: W, action: 'jour_ticket' }]).xp) === '{}', 'action hors table ou jour_ticket pousse en log : refuse (les jours viennent du registre des tickets)');

console.log('— C. jours avec ticket');
const auj = jourDe(Date.UTC(2026, 9, 18, 12)).id, hier = jourDe(Date.UTC(2026, 9, 17, 12)).id, demain = jourDe(Date.UTC(2026, 9, 19, 12)).id;
const jours = { [hier]: { [W]: { usd: 12, hashes: ['0x' + '01'.repeat(32)] }, [V]: { usd: 3, hashes: ['0x' + '02'.repeat(32)] } }, [auj]: { [W]: { usd: 10, hashes: ['0x' + '03'.repeat(32)] } } };
const jt = joursTicketParWallet(jours, { [U]: [auj, demain], [W]: [demain] }, auj, 10);
ok(jt[W] === 2 && jt[U] === 1 && !(V in jt), 'jours avec ticket : W 2 (hier + aujourd hui ; pass de demain pas compte), U 1 (pass d aujourd hui, pas demain), V 0 (3 $ < 10 $)');
const nvW = niveauWallet({ compteurs: e1.xp[W], joursTicket: 9 });
ok(nvW.xp === 30 && nvW.level === 3 && nvW.next === 70 && nvW.perk.entrees === 1 && nvW.detail.jour_ticket === 9 && nvW.detail.roll === 2, 'niveauWallet : 9 jours x3 + 2 rolls + 1 settle = 30 XP -> L3, perk +1');
ok(niveauWallet({ compteurs: { jour_ticket: 500, practice: 99 }, joursTicket: 0 }).xp === 0, 'un jour_ticket glisse dans les compteurs ne compte pas (seul le registre des tickets le donne)');

console.log('— D. entreesPeriode(bonusNiveau)');
const ids = [hier, auj];
const base = entreesPeriode(jours, ids, 10, {});
const avec = entreesPeriode(jours, ids, 10, {}, {}, { [W]: 5, [V]: 2, '0x12': 1, [U]: 1.5 });
ok(avec.filter((e) => e.adresse === W && e.niveau).length === BONUS_NIVEAU_MAX && avec.filter((e) => e.adresse === W && e.niveau).map((e) => e.jour).join() === 'NIVEAU-1,NIVEAU-2', 'bonus de niveau plafonne a 2 (5 demande -> NIVEAU-1, NIVEAU-2)');
ok(!avec.some((e) => e.adresse === V && e.niveau) && avec.length === base.length + 2, 'V sans entree de jour : pas de bonus ; adresse ou nombre illisible ignore');
const avecPass = entreesPeriode({}, ids, 10, {}, { [X]: 3 }, { [X]: 2 });
ok(avecPass.length === 3 && !avecPass.some((e) => e.niveau), 'une entree BONUS Week pass ne qualifie PAS pour le bonus de niveau');
ok(JSON.stringify(entreesPeriode(jours, ids, 10, {}, {}, {})) === JSON.stringify(base) && JSON.stringify(entreesPeriode(jours, ids, 10, {})) === JSON.stringify(base), 'sans bonus de niveau : inchange');
const niveaux = { [W]: 3, [V]: 7, [U]: 6, [X]: 1 };
const bn = bonusNiveauxSemaine([...base, { adresse: U, jour: 'BONUS-1', bonus: true }, { adresse: X, jour: auj }], (a) => niveaux[a] || 1);
ok(JSON.stringify(bn) === JSON.stringify({ [W]: 1 }), 'bonusNiveauxSemaine : W (L3, entree) +1 ; V (L7, pas d entree) rien ; U (L6, entree BONUS seulement) rien ; X (L1) rien — lu ' + JSON.stringify(bn));

console.log('— E. TicketPot attesterSemaine : memes plafonds');
const CLE = '0x' + (0xA11CEn).toString(16).padStart(64, '0'), VERIF = adresseDe(CLE).toLowerCase(), CONTRAT = '0x' + 'ce'.repeat(20), DAY = 20744;
const sel = (s) => selecteur(s).slice(2);
const io = (pot) => ({ chaineId: 8453, contrat: CONTRAT, cle: CLE, maintenant: P.dayEnd(DAY) + 120, rpc: async (meth, p) => {
  if (meth === 'eth_chainId') return '0x2105';
  const s = p[0].data.slice(2, 10);
  if (s === sel(P.SIG_VERIFIER)) return '0x' + a32(VERIF);
  if (s === sel(P.SIG_PAUSED)) return '0x' + m32(0);
  if (s === sel(P.SIG_CLOSED)) return '0x' + m32(1);
  if (s === sel(P.SIG_POT_AT_CLOSE) || s === sel(P.SIG_DAY_POT)) return '0x' + m32(pot);
  if (s === sel(P.SIG_TICKET_OF)) return '0x' + m32(0);
  throw new Error('inattendu');
} });
const sem = joursEntre(saisonDe(Date.UTC(2026, 9, 14)).debut, saisonDe(Date.UTC(2026, 9, 14)).fin);
const jS = { [sem[0]]: { [W]: { usd: 10, hashes: [] }, [V]: { usd: 10, hashes: [] } }, [sem[1]]: { [W]: { usd: 10, hashes: [] } } };
const bonusPass = { [V]: 3 }, bonusNv = { [W]: 2, [X]: 2 };
const pub = entreesPeriode(jS, sem, 10, {}, bonusPass, bonusNv);
const jourSeul = pub.filter((e) => !e.bonus);
const rs = await attesterSemaine(io(14_000_000n), { day: DAY, entrees: jourSeul, bonus: bonusPass, bonusNiveau: bonusNv });
const compte = (a) => pub.filter((e) => e.adresse === a).length;
ok(rs.ok === true && rs.parWallet[W] === compte(W) && rs.parWallet[V] === compte(V) && rs.total === pub.length && !(X in rs.parWallet), 'parite : poids payes = entrees publiees (W ' + compte(W) + ', V ' + compte(V) + ', total ' + pub.length + ') ; X (bonus sans entree) : ni entree ni part');
ok(rs.attestations.find((x) => x.wallet === W).amount === String(14_000_000n * BigInt(compte(W)) / BigInt(pub.length)), 'le bonus de niveau entre dans la part : pot x ' + compte(W) + '/' + pub.length + ' pour W');
const rTrop = await attesterSemaine(io(14_000_000n), { day: DAY, entrees: jourSeul, bonus: { [V]: 99 }, bonusNiveau: { [W]: 99, [W.toUpperCase().replace('0X', '0x')]: 99 } });
ok(rTrop.parWallet[W] === 2 + BONUS_NIVEAU_MAX && rTrop.parWallet[V] === 1 + BONUS_PASS_SEMAINE, 'plafonds : bonus niveau 99 -> 2 (meme en double casse), bonus pass 99 -> 3 (W ' + rTrop.parWallet[W] + ', V ' + rTrop.parWallet[V] + ')');
const rDouble = await attesterSemaine(io(14_000_000n), { day: DAY, entrees: pub, bonus: bonusPass, bonusNiveau: bonusNv });
ok(rDouble.total === rs.total && rDouble.parWallet[W] === rs.parWallet[W], 'les entrees BONUS/NIVEAU deja dans `entrees` ne comptent pas deux fois');
const rSans = await attesterSemaine(io(14_000_000n), { day: DAY, entrees: [], bonusNiveau: { [W]: 2 } });
ok(rSans.ok === false, 'aucune entree de jour : le bonus de niveau seul ne cree aucune part');

console.log('— F. serveur reel, faux noeud');
const TETE = 52_775_000;
const RLOGS = [rolled(BLOCKROLLS_DEPLOIEMENT.adresse, W, false), rolled(BLOCKROLLS_DEPLOIEMENT.adresse, W, false), rolled(BLOCKROLLS_DEPLOIEMENT.adresse, W, true), settled(BLOCKROLLS_DEPLOIEMENT.adresse, W), rolled(AUTRE, V, false), settled(AUTRE, V)]
  .map((l) => ({ ...l, address: String(l.address).toLowerCase(), blockNumber: '0x' + (BLOCKROLLS_DEPLOIEMENT.bloc + 5).toString(16) }));
let logsServis = 0;
const noeud = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let id = 1, meth = '', params = []; try { const j = JSON.parse(b); id = j.id; meth = j.method; params = j.params || []; } catch (_) {}
    let result = null;
    if (meth === 'eth_blockNumber') result = '0x' + TETE.toString(16);
    else if (meth === 'eth_getLogs') {
      const f = params[0] || {}, de = parseInt(f.fromBlock, 16), a = parseInt(f.toBlock, 16), b0 = BLOCKROLLS_DEPLOIEMENT.bloc + 5;
      /* le faux noeud ne filtre PAS par adresse : il rend aussi les logs d AUTRE — le serveur doit les ecarter lui-meme */
      result = String(f.address || '').toLowerCase() === BLOCKROLLS_DEPLOIEMENT.adresse.toLowerCase() && de <= b0 && b0 <= a ? RLOGS : [];
      if (result.length) logsServis += 1;
    } else if (meth === 'eth_getBlockByNumber') result = { number: '0x' + TETE.toString(16), hash: '0x' + 'ab'.repeat(32), timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16) };
    else if (meth === 'eth_chainId') result = '0x2105';
    else result = '0x';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  });
});
await new Promise((o) => noeud.listen(0, '127.0.0.1', o));
const u = 'http://127.0.0.1:' + noeud.address().port;
const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-niveaux-'));
/* le registre : W 9 jours avec ticket (dont aujourd hui : une entree cette semaine) ; V 10 jours, tous AVANT cette semaine ; U 1 jour aujourd hui */
const now = Date.now(), sNow = saisonDe(now), jR = {};
const poser = (j, a) => { jR[j] = { ...(jR[j] || {}), [a]: { usd: 12, hashes: ['0x' + m32(Object.keys(jR).length * 100 + a.charCodeAt(3))] } }; };
for (let k = 0; k < 9; k++) poser(jourDe(now - k * JOUR_MS).id, W);
for (let k = 1; k <= 10; k++) poser(jourDe(sNow.debut - k * JOUR_MS).id, V);
poser(jourDe(now).id, U);
fs.writeFileSync(path.join(vol, 'revenu.json'), JSON.stringify({ depuis: new Date().toISOString(), externe: {}, interne: {}, parJour: {}, tentatives: {}, vus: {}, registre: {}, jours: jR, passes: { [W]: [jourDe(now + JOUR_MS).id, jourDe(now + 2 * JOUR_MS).id] } }));
const port = 30000 + Math.floor(Math.random() * 15000);
const enfant = spawn(process.execPath, [path.join(ICI, 'serveur-web.js')], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: u, BASE_RPC_LECTURE: u, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '', TB_REPLIS: '0', RPC_ARCHIVE: '', BASE_RPC_ARCHIVE: '' } });
let stderr = ''; enfant.stdout.on('data', () => {}); enfant.stderr.on('data', (c) => { stderr += c; });
const srv = 'http://127.0.0.1:' + port;
let demarre = false;
for (let i = 0; i < 120 && !demarre; i += 1) { try { demarre = (await fetch(srv + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await new Promise((o) => setTimeout(o, 500)); } }
ok(demarre, 'serveur demarre (port ' + port + ')' + (demarre ? '' : ' — ' + stderr.slice(0, 300)));
if (demarre) {
  const st = async (q, o) => (await fetch(srv + '/api/jeu/niveau' + q, o)).status;
  const mauvais = ['', '?wallet=0x12', '?wallet=' + W + '0', '?wallet=' + W + '&x=1', '?wallet=' + W + '&wallet=' + V, '?wallet=%20' + W, '?wallet=' + W.slice(2), '?wallet=0x' + 'g'.repeat(40), '?w=' + W];
  const codes = []; for (const q of mauvais) codes.push(await st(q));
  ok(codes.every((c) => c === 400), 'validation stricte : vide, tronquee, 41 hex, parametre en plus, wallet double, espace, sans 0x, non hex, autre nom -> 400 (lus ' + codes.join(',') + ')');
  ok(await st('?wallet=' + X, { method: 'POST' }) === 405, 'POST -> 405');
  /* la premiere lecture XP part 20 s apres le demarrage : on attend que le faux noeud ait servi les logs, puis que le cache (30 s) les montre */
  for (let i = 0; i < 90 && logsServis === 0; i += 1) await new Promise((o) => setTimeout(o, 1000));
  ok(logsServis > 0, 'le serveur a lu les logs de BlockRolls (fenetre bornee depuis son bloc de deploiement)');
  let jw = null;
  for (let i = 0; i < 45; i += 1) { jw = await (await fetch(srv + '/api/jeu/niveau?wallet=' + W.toUpperCase().replace('0X', '0x'))).json(); if (jw && jw.xp === 30) break; await new Promise((o) => setTimeout(o, 2000)); }
  ok(jw && jw.ok === true && jw.wallet === W && jw.xp === 30 && jw.level === 3 && jw.next === 70 && jw.detail.jour_ticket === 9 && jw.detail.roll === 2 && jw.detail.settle === 1,
    'W : 9 jours (pass futurs exclus) x3 + 2 rolls payes (pas celui sur pass) + 1 settle = 30 XP -> L3, next 70 — lu ' + JSON.stringify(jw && { xp: jw.xp, level: jw.level, detail: jw.detail }));
  ok(jw && jw.perk && jw.perk.entries === 1 && jw.perk.appliesThisWeek === true && jw.perk.practice === true && jw.perk.week === sNow.id, 'W : perk +1, applique cette semaine (practice)');
  const jv = await (await fetch(srv + '/api/jeu/niveau?wallet=' + V)).json(), ju = await (await fetch(srv + '/api/jeu/niveau?wallet=' + U)).json();
  ok(jv.level === 3 && jv.xp === 30 && jv.perk.entries === 1 && jv.perk.appliesThisWeek === false && jv.detail.roll === 0 && jv.detail.settle === 0, 'V : L3 mais aucune entree cette semaine -> perk NON applique ; les logs d une AUTRE adresse ne lui donnent rien');
  ok(ju.level === 1 && ju.xp === 3 && ju.perk.entries === 0 && ju.perk.appliesThisWeek === false, 'U : 1 jour -> 3 XP, L1, pas de perk');
  const tir = await (await fetch(srv + '/api/tirage')).json();
  const eW = tir.semaine.entrees.filter((e) => e.adresse === W), eV = tir.semaine.entrees.filter((e) => e.adresse === V), eU = tir.semaine.entrees.filter((e) => e.adresse === U);
  ok(eW.filter((e) => e.niveau).map((e) => e.jour).join() === 'NIVEAU-1' && JSON.stringify(tir.semaine.bonusNiveau) === JSON.stringify({ [W]: 1 }), '/api/tirage : W recoit NIVEAU-1 dans la semaine (bonusNiveau ' + JSON.stringify(tir.semaine.bonusNiveau) + ')');
  ok(eV.length === 0 && !eU.some((e) => e.niveau) && !(tir.mois.entrees || []).some((e) => e.niveau), 'V (pas d entree) : rien ; U (L1) : pas de bonus ; le MOIS ne recoit pas le bonus de niveau');
  ok(jw.couverture && jw.couverture.luJusqua.rolls >= BLOCKROLLS_DEPLOIEMENT.bloc + 5 && jw.couverture.trous.some((t) => t.source === 'skins'), 'couverture rendue : rolls lu depuis son deploiement ; skins plus vieux que la fenetre publique -> TROU note, pas invente');
}
enfant.kill(); noeud.close();
try { fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {}

console.log('— G. app et commande');
const app = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
ok(/<b>Its brain<\/b><i id="jbBrain">Off<\/i><span id="jbBrainTxt">let it play for you<\/span><em id="jbNiveau" hidden><\/em><\/button>/.test(app), 'tuile « Its brain » : un #jbNiveau cache par defaut');
ok(/<p class="note" id="bjNiveau"[^>]*hidden><\/p>/.test(app) && /<p class="note" id="jourNiveau"[^>]*hidden><\/p>/.test(app), 'carte du brain (#bjNiveau) et ligne du perk (#jourNiveau) : cachees et vides par defaut (aucun texte permanent)');
ok(/\.jeuJeu em:not\(\[hidden\]\)\{display:block/.test(app), 'le CSS de la tuile ne force pas l affichage d un element hidden');
const pn = app.slice(app.indexOf('async function peindreNiveau('), app.indexOf('async function peindreTirage('));
ok(/const texteNiveau = \(j\) => 'Lv ' \+ j\.level \+ ' · ' \+ j\.xp \+ \(Number\.isInteger\(j\.next\) \? '\/' \+ j\.next/.test(app), 'texte « Lv N · xp/next » depuis la reponse servie');
ok(/if \(!j \|\| !c \|\| String\(c\)\.toLowerCase\(\) !== moiBas\) \{ cacher\(\); return; \}/.test(pn) && /perk\.hidden = !on;/.test(pn) && /j\.perk\.appliesThisWeek === true/.test(pn), 'peindreNiveau : sans wallet / lecture ratee / wallet change -> tout cache ; perk montre SEULEMENT si appliesThisWeek');
ok(/void peindreNiveau\(null\); return; \}/.test(app) && /void peindreNiveau\(moiBas\);/.test(app.slice(app.indexOf('async function peindreTirage('), app.indexOf('async function adresseTicket('))), 'peindreTirage appelle peindreNiveau (avec et sans wallet)');
ok(analyserCommande('level').ok && analyserCommande('Level').commande.type === 'level' && analyserCommande('xp').commande.type === 'level' && !analyserCommande('level 3').ok, 'commande « level » (et lvl / xp) analysee ; « level 3 » refusee');
ok(PRECOMMANDES.some((p) => p.cle === 'level' && analyserCommande(p.modele).ok), 'pre-commande Level : son modele est accepte');
ok(/if \(c\.type === 'level'\) \{ void bcCommandeLevel\(\); return true; \}/.test(app) && app.split('async function bcCommandeLevel(').length === 2, 'route level -> bcCommandeLevel (definie une fois)');
const bl = app.slice(app.indexOf('async function bcCommandeLevel('), app.indexOf('async function bcCommandeGame('));
ok(!/envoyerDepuisWallet|envoyerLotAtomique|envoyerAppels|eth_sendTransaction|wallet_sendCalls|bcSigner|requestSubmit/.test(bl) && /lireNiveau\(moiBas\)/.test(bl), 'bcCommandeLevel lit /api/jeu/niveau et n envoie rien');
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
