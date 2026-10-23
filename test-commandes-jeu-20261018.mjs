/* test-commandes-jeu-20261018.mjs — LES COMMANDES DU GAME SONT CABLEES DANS LE PANNEAU, ET AUCUNE NE SIGNE D ELLE-MEME.
 *
 * Lecture de la SOURCE de app.html (le cablage : test-module-app-compile prouve la syntaxe, un navigateur prouve l execution) :
 *  (1) bcExecuterTexte route chaque nouvelle commande — game, roll, post_task — vers sa fonction, et ces fonctions existent UNE fois ;
 *  (2) AUCUNE de ces fonctions n envoie : pas d envoyerDepuisWallet, envoyerLotAtomique, envoyerAppels, eth_sendTransaction, wallet_sendCalls,
 *      requestSubmit ; la SEULE voie de signature est bcSigner (le chemin existant du panneau, le wallet de la personne), et elle n est
 *      atteinte que par un BOUTON de la carte (« Sign in your wallet ») — jamais au fil de la commande ;
 *  (3) roll sans contrat = le roll PRACTICE de l onglet Game (roll()), avec contrat + wallet = planRolls (approve EXACT de N x prix) ou
 *      planRollsAvecPass, derriere bcAvecWallet ; le guess = une face NEUVE au hasard par roll (Phil 2026-10-18), comme les boutons du Game ;
 *  (4) game lit /api/tirage et /api/jeu/rolls, lit le pot sur le contrat SEULEMENT s il est servi, et dit « practice » sinon ;
 *  (5) post task pre-remplit #mfReward / #mfMax / #mfHold, ouvre le formulaire (Game) et n appelle NI planPoster NI submit ;
 *  (6) planRolls est importe de blockrolls-plan.js ; les puces game / roll / post task sont peintes par la boucle PRECOMMANDES existante.
 * ⛔ NE PROUVE PAS : qu un clic signe quoi que ce soit (aucun wallet ici), ni le rendu — voir la verification navigateur du rapport. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
const i0 = html.indexOf('async function bcExecuterTexte('), i1 = html.indexOf('/* ── LE TICKET DE L ONGLET TRADE (2026-10-04)');
ok(i0 > 0 && i1 > i0, 'la tranche du gestionnaire de commandes est trouvee (bcExecuterTexte … le ticket du Trade)');
const H = html.slice(i0, i1);
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = sansCommentaires(H);
const compte = (re, s = html) => (s.match(re) || []).length;

/* (1) le routage */
ok(/if \(c\.type === 'game'\) \{ void bcCommandeGame\(\); return true; \}/.test(H), 'route : game -> bcCommandeGame');
ok(/if \(c\.type === 'roll'\) \{ void bcCommandeRoll\(c\.n\); return true; \}/.test(H), 'route : roll -> bcCommandeRoll(n)');
ok(/if \(c\.type === 'post_task'\) \{ bcCommandePostTask\(c\); return true; \}/.test(H), 'route : post_task -> bcCommandePostTask');
for (const f of ['bcCommandeGame', 'bcCommandeRoll', 'bcCommandePostTask']) ok(compte(new RegExp('function ' + f + '\\(', 'g')) === 1, f + ' est definie UNE fois dans app.html');
/* decoupe par les NOMS des trois fonctions (dans cet ordre), jamais par une fin de ligne : test-tests-portables refuse les ancres de position */
const iG = code.indexOf('async function bcCommandeGame('), iR = code.indexOf('async function bcCommandeRoll('), iT = code.indexOf('function bcCommandePostTask(');
ok(iG > 0 && iR > iG && iT > iR, 'les trois fonctions se suivent dans la tranche : game, roll, post task');
const G = code.slice(iG, iR), R = code.slice(iR, iT), T = code.slice(iT);
ok(G.length > 300 && R.length > 300 && T.length > 200, 'les trois corps sont decoupes (' + G.length + ' / ' + R.length + ' / ' + T.length + ' caracteres)');

/* (2) aucune commande ne signe d elle-meme */
const ENVOIS = /envoyerDepuisWallet\(|envoyerLotAtomique\(|envoyerAppels\(|eth_sendTransaction|wallet_sendCalls|eth_signTypedData|personal_sign|requestSubmit\(|dispatchEvent\(new Event\('submit'/;
ok(!ENVOIS.test(G) && !ENVOIS.test(R) && !ENVOIS.test(T), 'TEMOIN : aucun envoi direct (envoyerDepuisWallet / envoyerLotAtomique / envoyerAppels / eth_sendTransaction / wallet_sendCalls / submit) dans les trois commandes');
ok(compte(/bcSigner\(/g, G + T) === 0 && compte(/bcSigner\(/g, R) === 1, 'la SEULE signature est bcSigner, dans roll seulement (' + compte(/bcSigner\(/g, R) + ')');
const iBouton = R.indexOf("bcBoutons(m, [['Sign in your wallet', async () => {"), iSigner = R.indexOf('bcSigner(');
ok(iBouton > 0 && iSigner > iBouton && /\['Dismiss', \(\) => bcEtape\(m, 'Dismissed — nothing was sent\.'\), true\]/.test(R), 'bcSigner n est atteint que par le bouton « Sign in your wallet » ; « Dismiss » n envoie rien');
ok(/const s = await bcSigner\(m, plan\.appels\.map\(\(a\) => \(\{ \.\.\.a, nom: a\.quoi \}\)\), null\);/.test(R), 'bcSigner recoit LES appels du plan, ligne null (aucun signalement de frais : ce n est pas un echange)');
ok(/plan\.etat !== 'PRET'/.test(R) && /Not planned: /.test(R), 'un plan non PRET est dit et n est pas propose a la signature');

/* (3) roll : practice sans contrat, plan avec contrat */
ok(/if \(!rollsCfg\) \{/.test(R) && /await roll\(\);/.test(R) && R.indexOf('await roll();') < R.indexOf('bcAvecWallet'), 'sans contrat servi (rollsCfg null) : le roll PRACTICE de l onglet Game (roll()), avant toute question de wallet');
ok(/if \(!\(await bcAvecWallet\(m, \(\) => bcCommandeRoll\(n\)\)\)\) return;/.test(R), 'avec contrat : le wallet est exige (bcAvecWallet), la commande se rejoue une fois connecte');
ok(/planRolls\(\{ contrat, usdc: USDC_BASE, guesses, rollPrice: BigInt\(rollsCfg\.prixRoll\) \}\)/.test(R) && /planRollsAvecPass\(\{ contrat, guesses, pass, passRolls: rollsCfg\.passRolls \}\)/.test(R) && /const avecPass = passActif\(pass\)/.test(R),
  'le plan : planRolls (approve EXACT de N x prix servi) sans pass, planRollsAvecPass avec un pass ACTIF lu sur le contrat');
/* Phil 2026-10-18 : le guess n est plus le ticket — chaque roll tire une face NEUVE au hasard (comme les boutons du Game) */
ok(/faces = Array\.from\(\{ length: n \}, \(\) => tirerFaceDeRoll\(\)\);/.test(R) && !/adresseTicket\(/.test(R), 'le guess = une face neuve au hasard par roll (tirerFaceDeRoll), plus le ticket');
ok(/const avecPass = passActif\(pass\), guesses = faces\.map\(\(x\) => x\.guess\);/.test(R), 'N guesses = N faces neuves (n vient de la grammaire, deja bornee a 10)');
ok(/for \(const a of plan\.appels\) bcEtape\(m, a\.quoi\);/.test(R), 'chaque appel du plan est montre AVANT la signature');
ok(/rollDerniers\.slice\(0, n\)/.test(R) && /practice, no prize/.test(R), 'practice : le cumul des N rolls (meilleur, total) est dit, « no prize »');

/* (4) game */
ok(/fetch\('\/api\/tirage'/.test(G) && /fetch\('\/api\/jeu\/rolls'/.test(G), 'game lit /api/tirage et /api/jeu/rolls');
const iRc = G.indexOf('const rc = t.rolls && t.rolls.contrat ? t.rolls : null;'), iPot = G.indexOf("appelPot()");
ok(iRc > 0 && iPot > iRc && /if \(rc\) \{/.test(G) && /Pot: none yet — practice rolls are free/.test(G), 'le pot est lu sur le contrat SEULEMENT s il est servi ; sinon « none yet, practice »');
ok(/Tickets today: ' \+ tickets\.length/.test(G) && /Your ticket: held/.test(G) && /Connect a wallet to see your ticket\./.test(G) && /Last rolls shown on the map/.test(G) && /since the server restarted \(paid rolls are on chain\)/.test(G) && !/No roll yet today/.test(G) && /Your last rolls: /.test(G),
  'game dit : tickets du jour, ton ticket (ou « connect »), les derniers rolls (tous, et les tiens)');
ok(/The game could not be read just now\./.test(G) && /Recent rolls could not be read\./.test(G), 'une lecture ratee est DITE, jamais remplacee par un chiffre');
/* 2026-10-18 (Phil : « fini ca, on a tirage weekend et roll ») : game dit la MEME regle que l onglet Game — plus de tirage du jour */
ok(/Today\\'s ticket = 1 entry in this week\\'s reward pot; the pot is shared by entries after the week closes \(UTC\)\./.test(G) && !/today\\'s draw|ticket draw|no prize yet/i.test(G),
  'game : « 1 entry in this week\'s reward pot », plus aucun tirage du jour ni « no prize yet »');
ok(/this week\\'s pot: ' \+ \(ps \? usdcTexte\(ps\.ferme \? ps\.potAtClose : ps\.reste\) \+ ' USDC' : '\(not read\)'\)/.test(G), 'game : le pot de la semaine LU par le serveur, sinon « (not read) »');

/* (5) post task */
ok(/\$\('#mfReward'\)\.value = c\.reward; \$\('#mfMax'\)\.value = String\(c\.players\); \$\('#mfHold'\)\.value = c\.hold;/.test(T), 'post task pre-remplit reward / players / hold');
ok(/allerA\('missions'\);/.test(T) && /f\.hidden = false;/.test(T) && /mesBlocksPourMission\(\)/.test(T) && /const f = \$\('#missionForm'\);/.test(T), 'post task ouvre l onglet Game et le formulaire, et lit les blocks du wallet');
ok(!/planPoster|postTask|'#mfPoster'/.test(T), 'post task n appelle NI planPoster NI le bouton « Post it » : la personne poste depuis le formulaire');
ok(/Nothing is posted by this command\./.test(T), 'la carte le dit : rien n est poste par la commande');
ok(/id="mfReward"/.test(html) && /id="mfMax"/.test(html) && /id="mfHold"/.test(html) && /id="missionForm"/.test(html), 'les champs vises existent dans le formulaire Post-a-task');

/* (6) import et puces */
ok(/import \{ planRoll, planRolls, planPass, planRollAvecPass, planRollsAvecPass, planSettle, planSettleMany,/.test(html), 'planRolls est importe de blockrolls-plan.js (la meme fonction que le MCP)');
ok(/for \(const p of PRECOMMANDES\) \{/.test(html) && /if \(p\.cle === 'tasks'\) continue;/.test(html) && !/p\.cle === 'game'|p\.cle === 'roll'|p\.cle === 'post_task'/.test(html),
  'les puces game / roll / post task passent par la boucle PRECOMMANDES existante (aucun cas special : elles ECRIVENT le modele dans le champ)');

console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
