/* test-rolls-en-attente-20261018.mjs - UN ROLL PAYE A TOUJOURS UN CHEMIN DE SETTLE DANS L APP (revue adverse 2026-10-18, 3 defauts HAUTS :
 *   flux arrete avant le settle, suite d envois qui ne lisait qu un roll, commande « roll » du chat qui renvoyait a un bouton inexistant).
 * AFFIRME : (1) rolls-en-attente.js (pur) : depuis des logs Rolled / Settled / Expired, les rolls DE CE JOUEUR encore en attente, avec
 *   settleableUntil = cible + 256 et l etat TROP_TOT / REGLABLE / PERDU face a la tete ; un autre joueur, un autre contrat, un doublon : ignores ;
 *   le filtre eth_getLogs met le joueur en topic2 ; les fenetres font 2 000 blocs au plus et couvrent tout ;
 *   (2) app.html : la carte Game porte #rollsRegler (cache), verifierRollsEnAttente lit les logs depuis rolls.bloc par fenetresLogs avec
 *   filtreLogsJoueur, reglerRollsEnAttente signe UN planSettleMany pour TOUS les reglables et lit les Settled ; les perdus sont dits ;
 *   (3) declencheurs : ouverture du Game, fin de rollPaye ET d autoRoll (finally : reussi ou arrete), toutes les 20 s onglet visible ;
 *   (4) la commande « roll » du chat finit par suivreRollsEnAttente et ne renvoie plus a « Roll for real » ni a un settle « from the Game tab »
 *   inexistant ; (5) serveur : le module est SERVI et /api/tirage sert rolls.bloc.
 * NE PROUVE PAS : un settle reel sur la chaine (aucun wallet ici) ni le rendu. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const A = await import('./rolls-en-attente.js');
const C = '0x0c5b490196f06db40ab8af68ecb2313029460fe9', J = '0x' + 'ab'.repeat(20), K = '0x' + 'cd'.repeat(20);
const w = (x) => BigInt(x).toString(16).padStart(64, '0'), t = (a) => '0x' + a.slice(2).padStart(64, '0');
const rolled = (id, joueur, cible, c = C) => ({ address: c, transactionHash: '0x' + w(id), logIndex: '0x0', topics: [A.TOPIC_ROLLED, '0x' + w(id), t(joueur)], data: '0x' + [0, 1, 2, 3, 4, cible, 0, 250000, 250000].map(w).join('') });
const settled = (id, joueur, score, payout) => ({ address: C, transactionHash: '0x' + w(1000 + id), logIndex: '0x0', topics: [A.TOPIC_SETTLED, '0x' + w(id), t(joueur)], data: '0x' + ['0x' + '77'.repeat(32), 0, 1, 2, 3, 4, score, payout, 0].map(w).join('') });
const expired = (id, joueur) => ({ address: C, transactionHash: '0x' + w(2000 + id), logIndex: '0x0', topics: [A.TOPIC_EXPIRED, '0x' + w(id), t(joueur)], data: '0x' });
/* (1) */
const tete = 10000;
const logs = [rolled(1, J, 9900), rolled(1, J, 9900), rolled(2, J, 9950), settled(2, J, 3, 0), rolled(3, J, 9000), expired(3, J), rolled(4, J, 9990), rolled(5, J, 10005),
  rolled(6, J, 9000), rolled(7, K, 9990), rolled(8, J, 9990, '0x' + '99'.repeat(20))];
const r = A.rollsEnAttente({ logs, contrat: C, joueur: J, tete });
vu(r.enAttente.map((x) => Number(x.rollId)).join() === '1,4,5,6', 'en attente : 1, 4, 5, 6 (2 regle, 3 expire, 7 autre joueur, 8 autre contrat ; doublon de 1 compte une fois) - lu ' + r.enAttente.map((x) => x.rollId).join());
vu(r.reglables.map((x) => Number(x.rollId)).join() === '1,4' && r.tropTot.map((x) => Number(x.rollId)).join() === '5' && r.perdus.map((x) => Number(x.rollId)).join() === '6', 'REGLABLE 1 et 4, TROP_TOT 5, PERDU 6');
vu(r.enAttente.find((x) => x.rollId === 1n).settleableUntil === 9900 + 256 && r.reglables.find((x) => x.rollId === 1n).blocsRestants === 9900 + 256 - tete, 'settleableUntil = cible + 256, blocs restants exacts');
vu(r.regles.length === 1 && r.regles[0].score === 3 && r.regles[0].payout === 0n, 'les Settled du joueur sont rendus (score, gain)');
vu(A.rollsEnAttente({ logs, contrat: C, joueur: J, tete: NaN }).enAttente.every((x) => x.etat === 'NON_LU'), 'tete illisible : etat NON_LU, jamais devine');
const f = A.filtreLogsJoueur({ contrat: C, joueur: J, de: 52770558, a: 52772557 });
vu(f.address === C && f.fromBlock === '0x' + (52770558).toString(16) && f.topics[1] === null && f.topics[2] === t(J) && f.topics[0].length === 3, 'filtre : contrat, fenetre, topic2 = joueur, 3 evenements');
vu(A.filtreLogsJoueur({ contrat: C, joueur: 'x', de: 1, a: 2 }) === null, 'joueur invalide : aucun filtre');
const fen = A.fenetresLogs(100, 4500);
vu(fen.length === 3 && fen[0][0] === 100 && fen[0][1] === 2099 && fen[2][1] === 4500 && fen.every(([x, y]) => y - x + 1 <= 2000) && fen.every((p, i) => i === 0 || p[0] === fen[i - 1][1] + 1), 'fenetres de 2 000 blocs, contigues, couvrent tout');
vu(A.fenetresLogs(5, 4).length === 0, 'plage vide : aucune fenetre');
/* (2) */
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const c0 = app.indexOf('id="tirCarte"'), c1 = app.indexOf('id="missionsCarte"');
vu(/<button[^>]*\bid="rollsRegler"[^>]*\bhidden\b/.test(app.slice(c0, c1)), 'la carte Game porte le bouton de settle, cache par defaut');
const iV = app.indexOf('async function verifierRollsEnAttente('), iR = app.indexOf('async function reglerRollsEnAttente(');
vu(iV > 0 && iR > iV && app.split('async function verifierRollsEnAttente(').length === 2, 'verifierRollsEnAttente defini une fois');
const V = app.slice(iV, iR), R = app.slice(iR, app.indexOf('async function suivreRollsEnAttente('));
vu(/rollsCfg\.bloc/.test(V) && /fenetresLogs\(de, tete\)/.test(V) && /filtreLogsJoueur\(\{ contrat, joueur: moi/.test(V) && /rpc\('eth_getLogs'/.test(V) && /rollsEnAttente\(\{ logs:/.test(V), 'verifier : logs depuis le bloc servi, fenetres de 2 000, filtre joueur, module pur');
vu(/bt\.hidden = n === 0;/.test(V) && /'Settle ' \+ n \+ ' pending roll'/.test(V) && /lost: the 256-block window passed/.test(V), 'bouton « Settle N pending rolls » seulement s il y a des reglables ; les perdus sont DITS');
vu(/planSettleMany\(\{ contrat: rollsCfg\.contrat, rollIds: r\.reglables\.map\(\(x\) => x\.rollId\) \}\)/.test(R) && /envoyerAppels\(ps\.appels, c\)/.test(R) && /lireSettledTous\(lus\.logs/.test(R) && /montrerSettled\(/.test(R), 'regler : UN settleMany pour tous les reglables, Settled lus, faces et scores montres');
vu(/\$\('#rollsRegler'\)\.addEventListener\('click', \(\) => \{ void reglerRollsEnAttente\(\); \}\);/.test(app), 'le bouton est cable');
/* (3) */
const rp = app.slice(app.indexOf('async function rollPaye()'), app.indexOf('async function passPaye()'));
vu(/\} finally \{[^}]*void verifierRollsEnAttente\(\); \}/.test(rp), 'rollPaye : le regleur relit en fin de flux (finally : reussi OU arrete)');
const ar = app.slice(app.indexOf('async function autoRoll()'), app.indexOf('async function autoRollLot('));
vu(/\} finally \{[^}]*void verifierRollsEnAttente\(\); \}/.test(ar), 'autoRoll : idem');
vu(/if \(nom === 'missions'\) \{[^\n]*verifierRollsEnAttente\(\)/.test(app), 'ouverture du Game : relu');
vu(/setInterval\(\(\) => \{ const v = document\.getElementById\('v-missions'\); if \(!document\.hidden && v && v\.classList\.contains\('on'\)\) \{ void verifierRollsEnAttente\(\);[^\n]*\}, 20000\);/.test(app), 'toutes les 20 s, onglet Game visible');
/* (4) */
const ch = app.slice(app.indexOf('async function bcCommandeRoll('), app.indexOf('function bcCommandePostTask('));
vu(/void suivreRollsEnAttente\(m\);/.test(ch), 'la commande roll du chat finit par le regleur');
vu(!/Roll for real|Settle from the Game tab|settle it from the explorer|settle from the explorer/.test(ch + rp + ar), 'plus aucun renvoi a un controle inexistant');
vu(!/settle it from the explorer|settle from the explorer/.test(app), 'ni ailleurs dans l app');
/* (5) */
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const servis = srv.slice(srv.indexOf('const SERVIS = ['), srv.indexOf('const SERVIS_EN_ESSAI_SEULEMENT'));
vu(servis.includes("'rolls-en-attente.js'"), 'rolls-en-attente.js est SERVI (absent = 404 = page morte)');
vu(/bloc: contratRolls && Number\.isSafeInteger\(BLOCKROLLS_DEPLOIEMENT\.bloc\) \? BLOCKROLLS_DEPLOIEMENT\.bloc : null/.test(srv), '/api/tirage sert le bloc de deploiement (lu dans la fiche)');
console.log('ok rolls-en-attente - ' + n + ' assertions ; NE PROUVE PAS un settle reel');
