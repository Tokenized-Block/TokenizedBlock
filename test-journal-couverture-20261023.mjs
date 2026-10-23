/* test-journal-couverture-20261023.mjs — LE JOURNAL DU JOUR COUVRE LA JOURNEE, ET LIT LES DUELS ET LES MISSIONS.
 *
 * MESURE PROD 2026-10-18 19:14 UTC (le defaut corrige) : couvertureDepuis = 52 771 652, couvreLaJournee = false, alors qu un roll paye avait
 *   eu lieu au bloc 52 771 493 le meme jour UTC ; et sources.duels = null alors que BlockDuels est LIVE (duels-deploiement.js a une adresse).
 *
 * AFFIRME :
 *   (A) module pur journal-jeu.js :
 *       - tempsDeBloc MESURE (null sans mesure, jamais « 2 s ») ; profondeurJournee = une journee au temps mesure (2 s et 200 ms) ;
 *       - premierBlocDuJour trouve le PREMIER bloc dont l horodatage >= minuit UTC (compare a un balayage lineaire), y compris quand le
 *         temps de bloc donne est 10 x trop lent (Denim) et quand plusieurs blocs partagent la meme seconde ; tete avant minuit -> tete + 1 ;
 *         au-dela de la borne ou horodatage illisible -> null (jamais devine) ;
 *       - journeeCouverte vrai SEULEMENT si bas <= premier bloc <= haut ;
 *       - duels (BlockDuels) et missions (BlockMissionsV3) decodes en textes courts ; l egalite (Settled + Refunded meme tx) = UNE ligne ;
 *         un log d une autre adresse est ignore ; un mot d adresse mal encode est illisible ; sans jeton connu, aucun montant ;
 *       - les signatures lues sont EXACTEMENT celles des sources contracts/src/BlockDuels.sol et BlockMissionsV3.sol.
 *   (B) l endpoint, vrai serveur local (serveur-web.js) branche a un FAUX noeud dont minuit UTC est ~20 000 blocs sous la tete :
 *       - noeud qui sert toute profondeur : premierBlocDuJour = celui du balayage, couvertureDepuis = lui, couvreLaJournee true, le roll
 *         paye de 20 000 blocs plus bas EST dans le journal (le defaut du 18/10), celui de la veille non ; duels et missions y arrivent ;
 *       - noeud qui REFUSE l archive sous -10 000 blocs : couvreLaJournee false, `rattrapage` dit le refus, le direct est lu quand meme,
 *         le roll profond n est pas invente.
 *   (D) mutants sur COPIES (module copie dans un dossier temporaire) : chacun DOIT rougir.
 * NE PROUVE PAS : de vrais logs mainnet de duels ou de missions (aucun lu ici), la tenue d un vrai noeud a 200 ms/bloc, le rendu.
 * ⛔ PORTABLE : process.exitCode, jamais process.exit. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (!c) { ko++; console.error('KO ' + m); } };
const { topic } = await import(pathToFileURL(path.join(ICI, 'keccak.js')).href);
const { BLOCKROLLS_DEPLOIEMENT } = await import(pathToFileURL(path.join(ICI, 'blockrolls-deploiement.js')).href);
const { DUELS_DEPLOIEMENT } = await import(pathToFileURL(path.join(ICI, 'duels-deploiement.js')).href);
const { MISSIONS_DEPLOIEMENT } = await import(pathToFileURL(path.join(ICI, 'missions-deploiement.js')).href);

const ROLLS = String(BLOCKROLLS_DEPLOIEMENT.adresse).toLowerCase();
const DUELS = String(DUELS_DEPLOIEMENT.adresse).toLowerCase(), MISSIONS = String(MISSIONS_DEPLOIEMENT.adresse).toLowerCase();
const AUTRE = '0x' + 'de'.repeat(20), USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', BLOC = '0xb2000000000000000000007afa7ed748b0874f27';
const W1 = '0x' + '12'.repeat(19) + 'ab', W2 = '0x' + '34'.repeat(20), W3 = '0x' + '56'.repeat(20);
const tA = (a) => '0x' + '0'.repeat(24) + a.slice(2);
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const hx = (k) => '0x' + k.toString(16);
const txh = (k) => '0x' + k.toString(16).padStart(64, '0');
const DEV = { [USDC]: { sym: 'USDC', dec: 6 } };
const TD = {
  created: topic('Created(uint256,address,address,uint256,uint8[5],uint64)'), joined: topic('Joined(uint256,address,uint8[5],uint256)'),
  settled: topic('Settled(uint256,bytes32,uint8,uint8,address,uint256)'), cancelled: topic('Cancelled(uint256)'), refunded: topic('Refunded(uint256,uint256,uint256)'),
};
const TM = {
  posted: topic('TaskPosted(uint256,address,address,address,uint256,uint32,uint64,bytes32)'), claimed: topic('TaskClaimed(uint256,address,bytes32,uint256,uint256,uint256,uint256)'),
  closed: topic('TaskClosed(uint256,uint256,bool)'),
};
const TROLLED = topic('Rolled(uint256,address,uint8[5],uint256,bool,uint256,uint256)');
const G = [1, 2, 3, 4, 5].map(u).join('');

/** les logs de duels et de missions autour d un bloc `b0` (k = base des hash de tx) */
function logsDuelsMissions(b0, k = 100) {
  return [
    /* duel #3 : W1 l ouvre a 1.00 USDC, W2 l accepte (cible b0+3), W2 gagne 1.80 USDC */
    { address: DUELS, topics: [TD.created, '0x' + u(3), tA(W1)], data: '0x' + u(USDC) + u(1000000) + G + u(1792900000), blockNumber: hx(b0), logIndex: '0x0', transactionHash: txh(k + 1) },
    { address: DUELS, topics: [TD.joined, '0x' + u(3), tA(W2)], data: '0x' + G + u(b0 + 3), blockNumber: hx(b0 + 1), logIndex: '0x0', transactionHash: txh(k + 2) },
    { address: DUELS, topics: [TD.settled, '0x' + u(3)], data: '0x' + u(0xabc) + u(1) + u(3) + u(W2) + u(1800000), blockNumber: hx(b0 + 4), logIndex: '0x0', transactionHash: txh(k + 3) },
    /* duel #4 : egalite -> Settled (gagnant 0) + Refunded dans la MEME tx : une ligne */
    { address: DUELS, topics: [TD.settled, '0x' + u(4)], data: '0x' + u(0xdef) + u(2) + u(2) + u(0) + u(0), blockNumber: hx(b0 + 5), logIndex: '0x0', transactionHash: txh(k + 4) },
    { address: DUELS, topics: [TD.refunded, '0x' + u(4)], data: '0x' + u(1000000) + u(1000000), blockNumber: hx(b0 + 5), logIndex: '0x1', transactionHash: txh(k + 4) },
    /* duel #5 rembourse seul ; duel #6 annule */
    { address: DUELS, topics: [TD.refunded, '0x' + u(5)], data: '0x' + u(1000000) + u(0), blockNumber: hx(b0 + 6), logIndex: '0x0', transactionHash: txh(k + 5) },
    { address: DUELS, topics: [TD.cancelled, '0x' + u(6)], data: '0x', blockNumber: hx(b0 + 6), logIndex: '0x1', transactionHash: txh(k + 6) },
    /* mission #2 : W3 la poste, 3 x 1.00 USDC ; W1 la fait, +0.90 USDC ; puis annulee */
    { address: MISSIONS, topics: [TM.posted, '0x' + u(2), tA(BLOC), tA(W3)], data: '0x' + u(USDC) + u(1000000) + u(3) + u(1792900000) + u(0x77), blockNumber: hx(b0 + 7), logIndex: '0x0', transactionHash: txh(k + 7) },
    { address: MISSIONS, topics: [TM.claimed, '0x' + u(2), tA(W1), '0x' + u(0x99)], data: '0x' + u(900000) + u(70000) + u(30000) + u(0), blockNumber: hx(b0 + 8), logIndex: '0x0', transactionHash: txh(k + 8) },
    { address: MISSIONS, topics: [TM.closed, '0x' + u(2)], data: '0x' + u(1100000) + u(1), blockNumber: hx(b0 + 9), logIndex: '0x0', transactionHash: txh(k + 9) },
    /* mission #7 : jeton de recompense inconnu (le block) -> aucun montant invente */
    { address: MISSIONS, topics: [TM.posted, '0x' + u(7), tA(BLOC), tA(W3)], data: '0x' + u(BLOC) + u(5n * 10n ** 18n) + u(1) + u(1792900000) + u(0x78), blockNumber: hx(b0 + 9), logIndex: '0x1', transactionHash: txh(k + 10) },
    /* ⛔ les MEMES evenements emis par d AUTRES adresses : ignores */
    { address: AUTRE, topics: [TD.created, '0x' + u(9), tA(W3)], data: '0x' + u(USDC) + u(1000000) + G + u(1792900000), blockNumber: hx(b0 + 10), logIndex: '0x0', transactionHash: txh(k + 11) },
    { address: AUTRE, topics: [TM.posted, '0x' + u(9), tA(BLOC), tA(W3)], data: '0x' + u(USDC) + u(1000000) + u(3) + u(1792900000) + u(0x79), blockNumber: hx(b0 + 10), logIndex: '0x1', transactionHash: txh(k + 12) },
    /* ⛔ un duel cree par la MISSION (mauvais contrat pour ce topic) : ignore */
    { address: MISSIONS, topics: [TD.created, '0x' + u(10), tA(W3)], data: '0x' + u(USDC) + u(1000000) + G + u(1792900000), blockNumber: hx(b0 + 10), logIndex: '0x2', transactionHash: txh(k + 13) },
    /* ⛔ un gagnant mal encode (octets hauts non nuls) : illisible */
    { address: DUELS, topics: [TD.settled, '0x' + u(11)], data: '0x' + u(0x1) + u(1) + u(3) + 'ff'.repeat(12) + W2.slice(2) + u(5), blockNumber: hx(b0 + 11), logIndex: '0x0', transactionHash: txh(k + 14) },
  ];
}

async function serieA(M, nom) {
  /* temps de bloc et profondeur */
  ok(M.tempsDeBloc(2000, 0, 1000) === 2 && M.tempsDeBloc(200, 0, 1000) === 0.2, nom + ' : tempsDeBloc mesure (2 s, 200 ms)');
  ok(M.tempsDeBloc(5, 5, 1) === null && M.tempsDeBloc(null, 0, 10) === null && M.tempsDeBloc(10, 0, 0) === null, nom + ' : sans mesure -> null (jamais 2 s par defaut)');
  ok(M.profondeurJournee(2) === 45960 && M.profondeurJournee(0.2) === 454200 && M.profondeurJournee(0) === null && M.profondeurJournee(NaN) === null,
    nom + ' : profondeurJournee = une journee + 5 % + 600 (2 s : ' + M.profondeurJournee(2) + ', 200 ms : ' + M.profondeurJournee(0.2) + ')');
  /* premier bloc du jour, compare a un balayage lineaire */
  const balayage = (tsDe, de, a, cible) => { for (let b = de; b <= a; b++) if (tsDe(b) >= cible) return b; return null; };
  const TETE = 5000000, NOW = 1792800000;
  const cas = [
    ['2 s/bloc, minuit a ~20 000 blocs', (b) => NOW - (TETE - b) * 2, NOW - 40000, 2],
    ['200 ms reels, mesure donnee 2 s (10 x trop lente)', (b) => NOW - Math.floor((TETE - b) * 0.2), NOW - 7000, 2],
    ['200 ms, 5 blocs par seconde (meme horodatage)', (b) => NOW - Math.floor((TETE - b) * 0.2), NOW - 3333, 0.2],
    ['minuit sur un bloc exact', (b) => NOW - (TETE - b) * 2, NOW - 40000 + 1, 2],
  ];
  for (const [quoi, tsDe, cible, s] of cas) {
    const attendu = balayage(tsDe, TETE - 60000, TETE, cible);
    const r = await M.premierBlocDuJour(async (b) => tsDe(b), { tete: TETE, cibleS: cible, sParBloc: s, profondeurMax: M.profondeurJournee(s) * 2 });
    ok(r && r.bloc === attendu && r.lectures < 80, nom + ' : premierBlocDuJour (' + quoi + ') -> ' + (r && r.bloc) + ' attendu ' + attendu + ' en ' + (r && r.lectures) + ' lectures');
  }
  const ts2 = (b) => NOW - (TETE - b) * 2;
  const avant = await M.premierBlocDuJour(async (b) => ts2(b), { tete: TETE, cibleS: NOW + 5, sParBloc: 2, profondeurMax: 50000 });
  ok(avant && avant.bloc === TETE + 1, nom + ' : la tete est avant minuit -> tete + 1 (le premier bloc du jour n existe pas encore)');
  ok((await M.premierBlocDuJour(async (b) => ts2(b), { tete: TETE, cibleS: NOW - 200000, sParBloc: 2, profondeurMax: 50000 })) === null, nom + ' : au-dela de la borne -> null');
  ok((await M.premierBlocDuJour(async (b) => (b < TETE - 3 ? null : ts2(b)), { tete: TETE, cibleS: NOW - 14, sParBloc: 2, profondeurMax: 50000 })) === null, nom + ' : un horodatage illisible -> null');
  ok((await M.premierBlocDuJour(async () => null, { tete: TETE, cibleS: NOW, sParBloc: 2, profondeurMax: 50000 })) === null, nom + ' : tete illisible -> null');
  /* couverture */
  ok(M.journeeCouverte({ premierBloc: 100, basCouvert: 100, hautCouvert: 150 }) === true && M.journeeCouverte({ premierBloc: 100, basCouvert: 90, hautCouvert: 100 }) === true, nom + ' : bas <= premier <= haut -> couverte');
  ok(M.journeeCouverte({ premierBloc: 100, basCouvert: 101, hautCouvert: 150 }) === false, nom + ' : bas apres le premier bloc -> pas couverte');
  ok(M.journeeCouverte({ premierBloc: 100, basCouvert: 50, hautCouvert: 99 }) === false, nom + ' : premier bloc pas encore lu -> pas couverte');
  ok(M.journeeCouverte({ premierBloc: null, basCouvert: 50, hautCouvert: 99 }) === false, nom + ' : premier bloc inconnu -> pas couverte');
  /* duels et missions */
  const B0 = 1000, horo = (b) => 1792300000 + b;
  const r = M.lireEvenementsJeu(logsDuelsMissions(B0), { rolls: ROLLS, duels: DUELS, missions: MISSIONS }, { horodatage: horo, devises: DEV });
  const txt = r.evenements.map((e) => e.text);
  const attendus = [
    '0x1212…12ab opened duel #3 for 1.00 USDC', '0x3434…3434 accepted duel #3 · block 1,003 decides', 'duel #3: 0x3434…3434 won 1.80 USDC · 1/5 vs 3/5',
    'duel #4: a tie · 2/5 each · both stakes refunded', 'duel #5 refunded in full', 'duel #6 was cancelled',
    'mission #2 posted · 3 × 1.00 USDC', '0x1212…12ab completed mission #2 · +0.90 USDC', 'mission #2 was cancelled', 'mission #7 posted · 1 completion',
  ];
  ok(JSON.stringify(txt) === JSON.stringify(attendus), nom + ' : duels + missions en textes courts, dans l ordre de la chaine — lus : ' + JSON.stringify(txt));
  ok(r.evenements.filter((e) => e.duelId === '4').length === 1, nom + ' : l egalite (Settled + Refunded, meme tx) fait UNE ligne');
  ok(!r.evenements.some((e) => [txh(111), txh(112), txh(113), txh(114)].includes(e.tx)), nom + ' : autre adresse / mauvais contrat / gagnant mal encode -> ignores');
  ok(r.illisibles >= 1, nom + ' : le gagnant mal encode est compte illisible (' + r.illisibles + ')');
  const ev3 = r.evenements.find((e) => e.duel === 'settled' && e.duelId === '3');
  ok(ev3 && ev3.kind === 'duel' && ev3.wallet === W2, nom + ' : le Settled gagnant porte le wallet du gagnant');
  ok(r.evenements.find((e) => e.mission === 'posted' && e.missionId === '2').wallet === W3 && r.evenements.find((e) => e.mission === 'claimed').wallet === W1, nom + ' : mission postee -> son createur, faite -> celui qui l a faite');
  ok(r.jetons.some(([k, v]) => k === 'd:3' && v === USDC) && r.jetons.some(([k, v]) => k === 'm:2' && v === USDC), nom + ' : les jetons des duels / missions lus sont rendus au serveur');
  /* sans le Created (hors fenetre) : pas de montant ; avec le jeton deja connu (ctx.jetons) : le montant */
  const sansC = M.lireEvenementsJeu(logsDuelsMissions(B0).slice(2, 3), { duels: DUELS }, { horodatage: horo, devises: DEV });
  ok(sansC.evenements.length === 1 && sansC.evenements[0].text === 'duel #3: 0x3434…3434 won · 1/5 vs 3/5', nom + ' : Settled sans jeton connu -> aucun montant (' + (sansC.evenements[0] && sansC.evenements[0].text) + ')');
  const avecJ = M.lireEvenementsJeu(logsDuelsMissions(B0).slice(2, 3), { duels: DUELS }, { horodatage: horo, devises: DEV, jetons: new Map([['d:3', USDC]]) });
  ok(avecJ.evenements[0] && avecJ.evenements[0].text === 'duel #3: 0x3434…3434 won 1.80 USDC · 1/5 vs 3/5', nom + ' : Settled avec le jeton deja lu -> le montant');
  /* sans adresse de duels ni de missions : rien de duels ni de missions */
  const rien = M.lireEvenementsJeu(logsDuelsMissions(B0), { rolls: ROLLS }, { horodatage: horo, devises: DEV });
  ok(rien.evenements.length === 0, nom + ' : sans adresse de duels / missions, aucun de leurs logs n est lu');
  /* fusion : les genres duel / mission sont acceptes */
  ok(M.fusionnerJournal([], r.evenements, {}).length === r.evenements.length, nom + ' : fusionnerJournal accepte duel et mission');
  /* parite des signatures avec les sources Solidity */
  const evenementsSol = (f) => {
    const s = fs.readFileSync(path.join(ICI, 'contracts', 'src', f), 'utf8');
    return [...s.matchAll(/event\s+(\w+)\s*\(([^)]*)\)\s*;/g)].map(([, nomE, args]) => nomE + '(' + args.split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean).join(',') + ')');
  };
  const solD = evenementsSol('BlockDuels.sol'), solM = evenementsSol('BlockMissionsV3.sol');
  ok(M.EVS_DUELS_JOURNAL.length === 5 && M.EVS_DUELS_JOURNAL.every((s) => solD.includes(s)), nom + ' : les 5 evenements de duel lus sont ceux de BlockDuels.sol (' + M.EVS_DUELS_JOURNAL.filter((s) => !solD.includes(s)).join(' ; ') + ')');
  ok([M.EV_TASK_POSTED, M.EV_TASK_CLAIMED, M.EV_TASK_CLOSED].every((s) => solM.includes(s)), nom + ' : les 3 evenements de mission lus sont ceux de BlockMissionsV3.sol');
  ok(M.TOPICS_DUELS.length + M.TOPICS_MISSIONS.length + M.TOPICS_ROLLS.length + M.TOPICS_SKINS.length === 15, nom + ' : 15 topics en OU (la forme sondee sur publicnode le 2026-10-23)');
}

console.log('— A. module pur');
/* ⛔ verdict 2026-10-23 (defaut 2) : sur 53010ed ce banc PLANTAIT (« M.tempsDeBloc is not a function ») sans rien compter ; une
 *   exception de la serie A est desormais un KO compte, pour qu un rouge sur la base se lise en chiffres. */
try { await serieA(await import(pathToFileURL(path.join(ICI, 'journal-jeu.js')).href + '?v=c'), 'A'); } catch (e) { ok(false, 'A : la serie a leve ' + String((e && e.message) || e).slice(0, 160)); }

console.log('— D. mutants du module (copies)');
const srcJ = fs.readFileSync(path.join(ICI, 'journal-jeu.js'), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-journal-couv-mut-'));
const versOriginaux = (s) => s.replace(/from '\.\/([^']+)'/g, (_, f) => "from '" + pathToFileURL(path.join(ICI, f)).href + "'");
const MUTANTS = [
  ['adresse des duels jamais verifiee', [['const deDuels = duels !== null && adr === duels && TOPICS_DUELS.includes(t0);', 'const deDuels = duels !== null && TOPICS_DUELS.includes(t0);'], ['const d = decoderLogDuel(l, duels);', 'const d = decoderLogDuel(l, l.address);']]],
  ['adresse des missions jamais verifiee', [['const deMissions = missions !== null && adr === missions && TOPICS_MISSIONS.includes(t0);', 'const deMissions = missions !== null && TOPICS_MISSIONS.includes(t0);']]],
  ['recul sans doublement (Denim)', [['    recul *= 2;\n', '    recul += 0;\n']]],
  ['dichotomie rend lo', [['return { bloc: hi, lectures };', 'return { bloc: lo, lectures };']]],
  ['couverture sans le haut', [['return basCouvert <= premierBloc && premierBloc <= hautCouvert;', 'return basCouvert <= premierBloc;']]],
  ['egalite en deux lignes', [["if (regleesParTx.has(tx + ':' + d.id)) continue;", '']]],
  ['temps de bloc suppose 2 s', [['|| tsHaut <= tsBas) return null;', '|| tsHaut <= tsBas) return 2;']]],
  ['gagnant 0 pris pour un wallet', [['const w = bas(d.winner) === ZERO ? null : bas(d.winner);', 'const w = bas(d.winner);']]],
  ['gagnant mal encode accepte', [['|| m[3] >> 160n !== 0n) { illisibles++; continue; }', ') { illisibles++; continue; }']]],
  ['montant de mission sans devise connue', [["(r ? ' × ' + r : (m[2] === 1n ? ' completion' : ' completions'))", "' × ' + montantTexte(m[1], 6) + ' USDC'"]]],
];
let k = 0;
for (const [nom, remplacements] of MUTANTS) {
  let s = srcJ.replace(/\r\n/g, '\n'), ancre = true;
  for (const [de, a] of remplacements) { if (!s.includes(de)) ancre = false; s = s.replace(de, a); }
  if (!ancre) { ok(false, 'ancre du mutant absente : ' + nom); continue; }
  const f = path.join(tmp, 'journal-jeu-m' + (++k) + '.js');
  fs.writeFileSync(f, versOriginaux(s));
  const avant = ko, avantN = n, err = console.error;
  console.error = () => {};
  try { await serieA(await import(pathToFileURL(f).href), 'mutant ' + k); } catch (_) { ko++; }
  console.error = err;
  const rouge = ko > avant;
  ko = avant; n = avantN;
  ok(rouge, 'MUTANT SURVIVANT : ' + nom);
}
fs.rmSync(tmp, { recursive: true, force: true });
ok(fs.readFileSync(path.join(ICI, 'journal-jeu.js'), 'utf8') === srcJ, 'le module sur disque est intact apres les mutants');

/* ── B. l endpoint, vrai serveur, faux noeud : minuit UTC ~20 000 blocs sous la tete ── */
console.log('— B. endpoint (serveur local, faux noeud)');
const H = 3000000;
const nowS = Math.floor(Date.now() / 1000), minuitS = Math.floor(nowS / 86400) * 86400;
const sB = Math.max(nowS - minuitS, 30) / 20000; /* secondes par bloc du faux noeud : minuit tombe ~20 000 blocs sous la tete */
const tsB = (b) => nowS - Math.floor((H - b) * sB);
let P = null;
for (let b = H - 30000; b <= H; b++) if (tsB(b) >= minuitS) { P = b; break; }
ok(Number.isSafeInteger(P) && H - P > 15000, 'faux noeud : minuit UTC au bloc ' + P + ' (' + (H - P) + ' sous la tete, ' + sB.toFixed(4) + ' s/bloc)');
function logsNoeud() {
  return [
    /* le roll paye PROFOND du jour (le defaut du 18/10 : sous la borne de 9 000 blocs) */
    { address: ROLLS, topics: [TROLLED, '0x' + u(41), tA(W1)], data: '0x' + G + u(P + 7) + u(0) + u(250000) + u(250000), blockNumber: hx(P + 5), logIndex: '0x0', transactionHash: txh(501) },
    /* un roll de la VEILLE : jamais dans le journal du jour */
    { address: ROLLS, topics: [TROLLED, '0x' + u(40), tA(W2)], data: '0x' + G + u(P) + u(0) + u(250000) + u(250000), blockNumber: hx(P - 3), logIndex: '0x0', transactionHash: txh(500) },
    ...logsDuelsMissions(H - 200, 100),
  ];
}
function fauxNoeud(refuseSous) {
  return http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      let id = 1, m = '', p = []; try { const j = JSON.parse(b); id = j.id; m = j.method; p = j.params || []; } catch (_) {}
      let result = '0x', error = null;
      if (m === 'eth_blockNumber') result = hx(H);
      else if (m === 'eth_getBlockByNumber') { const num = Math.min(H, parseInt(p[0], 16) || H); result = { number: hx(num), hash: '0x' + 'ab'.repeat(32), timestamp: hx(tsB(num)) }; }
      else if (m === 'eth_getLogs') {
        const f = p[0] || {}, lo = parseInt(f.fromBlock, 16), hi = parseInt(f.toBlock, 16);
        if (refuseSous !== null && lo < refuseSous) error = { code: -32602, message: 'Archive requests require a personal token' };
        /* le faux noeud rend les logs de la plage SANS filtrer l adresse (un noeud qui ment) : le module doit les trier */
        else result = Array.isArray(f.address) && f.address.map((x) => String(x).toLowerCase()).includes(DUELS)
          ? logsNoeud().filter((l) => { const bn = parseInt(l.blockNumber, 16); return bn >= lo && bn <= hi; }) : [];
      } else if (m === 'eth_chainId') result = '0x2105';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result }));
    });
  });
}
async function lancer(refuseSous, attendre) {
  const noeud = fauxNoeud(refuseSous);
  await new Promise((o) => noeud.listen(0, '127.0.0.1', o));
  const urlNoeud = 'http://127.0.0.1:' + noeud.address().port;
  const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-journal-couv-'));
  /* un port LIBRE donne par le systeme (un port au hasard tombe parfois dans une plage reservee de Windows : EACCES) */
  const port = await new Promise((o) => { const s = http.createServer(); s.listen(0, '0.0.0.0', () => { const p = s.address().port; s.close(() => o(p)); }); });
  /* TB_JOURNAL_SERVEUR : un serveur MUTE (une COPIE dans ce dossier) pour prouver que B rougit ; par defaut, le vrai */
  const enfant = spawn(process.execPath, [path.join(ICI, process.env.TB_JOURNAL_SERVEUR || 'serveur-web.js')], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: urlNoeud, BASE_RPC_LECTURE: urlNoeud, BASE_RPC_ARCHIVE: '', RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '', TB_REPLIS: '0', TB_JOURNAL_PREMIER_MS: '1000', TB_JOURNAL_TOUR_MS: '1000' } });
  let stderr = ''; enfant.stdout.on('data', () => {}); enfant.stderr.on('data', (c) => { stderr += c; });
  const srv = 'http://127.0.0.1:' + port;
  let demarre = false;
  for (let i = 0; i < 120 && !demarre; i += 1) { try { demarre = (await fetch(srv + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await new Promise((o) => setTimeout(o, 500)); } }
  let j = null;
  if (demarre) {
    for (let i = 0; i < 90; i++) {
      try { j = await (await fetch(srv + '/api/jeu/journal', { signal: AbortSignal.timeout(5000) })).json(); } catch (_) { j = null; }
      if (j && j.ok && attendre(j)) break;
      await new Promise((o) => setTimeout(o, 500));
    }
  }
  enfant.kill(); noeud.close();
  try { fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {}
  return { demarre, j, stderr };
}
const textes = (j) => (j && Array.isArray(j.evenements) ? j.evenements.map((e) => e.text) : []);
/* B1 : le noeud sert toute profondeur */
const b1 = await lancer(null, (j) => j.couvreLaJournee === true && textes(j).some((t) => t.includes('opened duel #3')));
ok(b1.demarre, 'B1 : serveur demarre' + (b1.demarre ? '' : ' — ' + b1.stderr.slice(0, 300)));
if (b1.j) {
  const j = b1.j, t = textes(j);
  ok(j.premierBlocDuJour === P, 'B1 : premierBlocDuJour = ' + j.premierBlocDuJour + ' (balayage : ' + P + ')');
  ok(j.couvreLaJournee === true && j.couvertureDepuis === P, 'B1 : couvreLaJournee true, couvertureDepuis = le premier bloc du jour (lu : ' + j.couvreLaJournee + ', ' + j.couvertureDepuis + ')');
  ok(Math.abs(j.secondesParBloc - sB) < 0.002 && j.profondeurMax >= Math.ceil(86400 / sB), 'B1 : temps de bloc MESURE (' + j.secondesParBloc + ' vs ' + sB.toFixed(4) + '), borne = une journee (' + j.profondeurMax + ')');
  ok(j.evenements.some((e) => e.tx === txh(501) && e.kind === 'roll'), 'B1 : le roll paye ' + (H - P - 5) + ' blocs sous la tete EST dans le journal (le defaut du 18/10)');
  ok(!j.evenements.some((e) => e.tx === txh(500)), 'B1 : le roll de la veille n y est pas');
  ok(['0x1212…12ab opened duel #3 for 1.00 USDC', 'duel #3: 0x3434…3434 won 1.80 USDC · 1/5 vs 3/5', 'mission #2 posted · 3 × 1.00 USDC', '0x1212…12ab completed mission #2 · +0.90 USDC'].every((x) => t.includes(x)),
    'B1 : duels et missions arrivent dans le journal — lus : ' + JSON.stringify(t.slice(0, 14)));
  ok(!j.evenements.some((e) => [txh(111), txh(112), txh(113), txh(114)].includes(e.tx)), 'B1 : les logs d autres adresses rendus par le noeud sont ignores');
  ok(j.sources && j.sources.duels === DUELS && j.sources.missions === MISSIONS && j.rattrapage === null, 'B1 : sources.duels / sources.missions = les adresses des fiches ; aucun rattrapage en echec');
} else ok(false, 'B1 : journal non lu');
/* B2 : le noeud REFUSE l archive sous -10 000 blocs */
const b2 = await lancer(H - 10000, (j) => j.rattrapage !== null && j.rattrapage !== undefined && textes(j).some((t) => t.includes('opened duel #3')));
ok(b2.demarre, 'B2 : serveur demarre' + (b2.demarre ? '' : ' — ' + b2.stderr.slice(0, 300)));
if (b2.j) {
  const j = b2.j;
  ok(j.premierBlocDuJour === P && j.couvreLaJournee === false, 'B2 : premier bloc trouve (' + j.premierBlocDuJour + '), mais couvreLaJournee false (lu : ' + j.couvreLaJournee + ')');
  ok(j.rattrapage && /Archive requests/.test(j.rattrapage.pourquoi) && j.couvertureDepuis > P && j.couvertureDepuis >= H - 10000, 'B2 : le refus est dit (`rattrapage` : ' + JSON.stringify(j.rattrapage) + '), couvertureDepuis ' + j.couvertureDepuis);
  ok(textes(j).includes('0x1212…12ab opened duel #3 for 1.00 USDC'), 'B2 : le direct est lu malgre le refus du rattrapage');
  ok(!j.evenements.some((e) => e.tx === txh(501)), 'B2 : le roll profond non lu n est pas invente');
} else ok(false, 'B2 : journal non lu');

console.log(n + ' assertions, ' + ko + ' KO');
console.log('NE PROUVE PAS : de vrais logs mainnet de duels ou de missions, un vrai noeud a 200 ms/bloc, le rendu a l ecran.');
process.exitCode = ko ? 1 : 0;
