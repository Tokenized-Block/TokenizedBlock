/* test-tirage-jour-pass-20261018.mjs - LE POT DU JOUR DES PASS SE TIRE DEPUIS L APP (revue adverse 2026-10-18, MOYEN : l app promettait un
 *   tirage apres minuit, et rien n appelait closeDay / drawDay).
 * AFFIRME : (1) pur : tirageJourDu suit les refus du contrat — jour pas fini, aucun acheteur, deja tire -> AUCUN ; ouvert -> FERMER ; arme et
 *   bloc cible pas passe -> ATTENDRE ; dans la fenetre de 256 blocs -> TIRER ; fenetre passee -> FERMER (re-armer) ; illisible -> NON_LU ;
 *   lireDayPot decode (pot, targetBlock, state) et refuse un etat hors 0..2 ; (2) selecteurs buyerCount(uint32) et dayPots(uint32) = ABI
 *   compilee (si l artefact forge est present) ; (3) app : #jourTirerJour (cache) dans la carte Game, peindreTirageJourPass lit buyerCount +
 *   dayPots d HIER (jour UTC du contrat), montre le bouton seulement pour FERMER / TIRER ; tirerJourPass signe planCloseDay puis planDrawDay
 *   (fenetre respectee : planDrawDay recoit cible et tete), lit DayDrawn ; relu a l ouverture du Game et toutes les 20 s ; le texte du pass ne
 *   promet plus un tirage que personne n appelle.
 * NE PROUVE PAS : un tirage reel. */
import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { tirageJourDu, lireDayPot, appelBuyerCount, appelDayPot } from './rolls-en-attente.js';
import { selecteur } from './keccak.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
/* (1) */
const T = (o) => tirageJourDu({ day: 20379, aujourdhui: 20380, buyers: 3, tete: 1000, ...o });
vu(T({ aujourdhui: 20379, dayPot: { pot: 5n, targetBlock: 0, state: 0 } }).action === 'AUCUN', 'jour pas fini : AUCUN');
vu(T({ buyers: 0, dayPot: { pot: 0n, targetBlock: 0, state: 0 } }).action === 'AUCUN', 'aucun acheteur : AUCUN');
vu(T({ dayPot: { pot: 0n, targetBlock: 900, state: 2 } }).action === 'AUCUN', 'deja tire : AUCUN');
vu(T({ dayPot: { pot: 15000000n, targetBlock: 0, state: 0 } }).action === 'FERMER', 'ouvert : FERMER');
vu(T({ dayPot: { pot: 1n, targetBlock: 1000, state: 1 } }).action === 'ATTENDRE' && T({ dayPot: { pot: 1n, targetBlock: 1001, state: 1 } }).blocsAvant === 2, 'arme, cible pas passee : ATTENDRE');
vu(T({ dayPot: { pot: 1n, targetBlock: 999, state: 1 } }).action === 'TIRER' && T({ dayPot: { pot: 1n, targetBlock: 744, state: 1 } }).action === 'TIRER', 'arme, dans les 256 blocs : TIRER (bornes)');
const re = T({ dayPot: { pot: 1n, targetBlock: 743, state: 1 } });
vu(re.action === 'FERMER' && re.rearmer === true, 'fenetre passee : FERMER pour re-armer');
vu(T({ dayPot: null }).action === 'NON_LU' && T({ buyers: null, dayPot: { pot: 0n, targetBlock: 0, state: 0 } }).action === 'NON_LU', 'illisible : NON_LU (jamais « aucun acheteur »)');
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const dp = lireDayPot('0x' + w(15000000) + w(52800000) + w(1));
vu(dp && dp.pot === 15000000n && dp.targetBlock === 52800000 && dp.state === 1, 'lireDayPot decode les 3 mots');
vu(lireDayPot('0x' + w(1) + w(2) + w(3)) === null && lireDayPot('0x') === null, 'etat hors 0..2 ou reponse courte : null');
vu(appelBuyerCount(20379) === selecteur('buyerCount(uint32)') + w(20379) && appelDayPot(20379) === selecteur('dayPots(uint32)') + w(20379), 'appels encodes');
/* (2) */
const ART = new URL('./contracts/out/BlockRolls.sol/BlockRolls.json', import.meta.url);
if (existsSync(ART)) {
  const ids = JSON.parse(readFileSync(ART, 'utf8')).methodIdentifiers;
  vu(ids['buyerCount(uint32)'] === selecteur('buyerCount(uint32)').slice(2) && ids['dayPots(uint32)'] === selecteur('dayPots(uint32)').slice(2), 'selecteurs = ABI compilee');
} else console.log('(artefact forge absent : selecteurs non confrontes a l ABI)');
/* (3) */
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tranche = (debut, fin) => { const i = app.indexOf(debut); assert.ok(i > 0, 'trouve : ' + debut); const j = app.indexOf(fin, i); assert.ok(j > i, 'fin trouvee : ' + fin); return app.slice(i, j); };
const carte = app.slice(app.indexOf('id="tirCarte"'), app.indexOf('id="missionsCarte"'));
vu(/<button[^>]*\bid="jourTirerJour"[^>]*\bhidden\b[^>]*>Close and draw yesterday's pass pot<\/button>/.test(carte), 'le bouton existe dans la carte Game, cache par defaut');
const P = tranche('async function peindreTirageJourPass()', 'async function tirerJourPass()');
vu(/day = aujourdhui - 1/.test(P) && /jourContrat\(Math\.floor\(Date\.now\(\) \/ 1000\)\)/.test(P) && /appelBuyerCount\(day\)/.test(P) && /appelDayPot\(day\)/.test(P) && /tirageJourDu\(/.test(P), 'lit buyerCount et dayPots d HIER (jour UTC comme today() du contrat)');
vu(/bt\.hidden = !\(d\.action === 'FERMER' \|\| d\.action === 'TIRER'\);/.test(P) && /if \(!rollsCfg \|\| !c\) \{ bt\.hidden = true;/.test(P), 'bouton seulement quand il y a quelque chose a faire, et un wallet');
vu(/never to whoever clicks/.test(P), 'dit que le pot va a l acheteur tire, jamais a celui qui clique');
const D = tranche('async function tirerJourPass()', "$('#jourTirerJour').addEventListener");
vu(/planCloseDay\(\{ contrat, day: d\.day \}\)/.test(D) && /planDrawDay\(\{ contrat, day: d\.day, targetBlock: d\.targetBlock, blocActuel: d\.tete \}\)/.test(D) && D.indexOf('planCloseDay') < D.indexOf('planDrawDay'), 'closeDay puis drawDay, fenetre de 256 blocs respectee (cible + tete)');
vu(/lireDayDrawn\(lus\.logs, contrat\)/.test(D) && /envoyerAppels\(pc\.appels, c\)/.test(D) && /envoyerAppels\(pd\.appels, c\)/.test(D), 'deux signatures du wallet, DayDrawn lu');
vu(/\$\('#jourTirerJour'\)\.addEventListener\('click', \(\) => \{ void tirerJourPass\(\); \}\);/.test(app) && /if \(nom === 'missions'\) \{[^\n]*peindreTirageJourPass\(\)/.test(app) && /void peindreTirageJourPass\(\); \} \}, 20000\);/.test(app), 'cable : clic, ouverture du Game, toutes les 20 s');
const pp = tranche('async function passPaye()', "$('#jourRollPaye').addEventListener");
vu(!/drawn by a Base block hash after midnight UTC\.'/.test(pp) && /Close and draw yesterday/.test(pp), 'le texte du pass dit QUI tire et avec quel bouton');
console.log('ok tirage-jour-pass - ' + n + ' assertions ; NE PROUVE PAS un tirage reel');
