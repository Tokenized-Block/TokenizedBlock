/* test-rolls-risques-textes-20261024.mjs — AUDIT ROLLS-DUELS (2026-10-24), deux constats [medium] dont la parade est le TEXTE (contrat deploye,
 *   immuable) :
 *   (3) « ni retrait » est faux pour BlockRolls : le createur de UNIT peut monter les gains (setRules, BlockRolls.sol:193-200) puis jouer
 *       (PoC forge contracts/test/AuditRollsDuels20261024.t.sol test_V_SetRulesDrain : 15 rolls, pot 50e6 -> 0, createur +46 250 000 brut).
 *   (4) le tirage du pot du jour des pass peut etre RE-ARME : un acheteur qui n est pas designe se tait, attend 256 blocs, refait closeDay
 *       (BlockRolls.sol:261-288 ; PoC test_V_DayPotGrind : 4 acheteurs, tire au 5e essai, 20e6 brut = tout le pot).
 * EXECUTE frais-risques.js rendre() (la page publique Fees & risks) avec des regles LUES fausses exprès, et rolls-en-attente.js
 *   phraseFenetreTirage ; lit deployer-blockrolls.html ; et verifie app.html (fonction du texte, rejouee sur une copie MUTEE).
 * AFFIRME : la page ne dit plus « no owner, no withdrawal » ; elle dit QUI peut changer les gains (le wallet lu par unitCreator(), ou « not
 *   read »), le plafond (MAX_PRIZE lu), qu un changement ne vaut que pour les rolls d apres, et que rien n empeche ce wallet de monter les gains
 *   puis de jouer — la structure, jamais une intention ; les gains et l esperance suivent les regles LUES (version dite) et, non lues, sont dits
 *   « set at deployment » ; le risque du re-armement est liste ; la carte du pass dit la fenetre et « anyone can draw » pour FERMER / ATTENDRE
 *   / TIRER, rien sinon ; la page de deploiement ne dit plus « Nobody can take the pots » ni « cannot touch the pots ».
 * Modules remplacables (FRAIS_RISQUES_MODULE, ROLLS_ATTENTE_MODULE). ⛔ PORTABLE : process.exitCode.
 * NE PROUVE PAS : le rendu navigateur ; l intention de quiconque (le texte n en dit rien, expres). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(ICI, f)).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const F = await imp(process.env.FRAIS_RISQUES_MODULE || 'frais-risques.js');
const RA = await imp(process.env.ROLLS_ATTENTE_MODULE || 'rolls-en-attente.js');
const texte = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
const CR = '0x' + 'c0'.repeat(20);
/* des regles LUES volontairement differentes de la fiche (5/3/1/0.5, min 2) : la page doit dire CELLES-CI */
const live = { mode: 'SHADOW', rolls: { contrat: F.CHIFFRES.rolls.adresse, prizes: ['7000000', '4000000', '2000000', '1000000'], minScore: 3, pot: '250000', potLu: '2026-10-24T12:00:00.000Z',
  regles: { version: 2, createur: CR, maxPrize: '1000000000', lu: '2026-10-24T12:00:00.000Z' } } };
const nonLu = { mode: 'SHADOW', rolls: { contrat: F.CHIFFRES.rolls.adresse, prizes: null, minScore: null, regles: null, pot: null } };
const pLive = texte(F.rendre(F.CHIFFRES, live)), pNon = texte(F.rendre(F.CHIFFRES, nonLu)), pNull = texte(F.rendre(F.CHIFFRES, null));

console.log('— (3) qui peut changer les gains');
ok([pLive, pNon, pNull].every((p) => !/no owner, no withdrawal/i.test(p) && !/nobody can (take|withdraw)/i.test(p)), 'la page ne dit plus « no owner, no withdrawal » (ni « nobody can take »), regles lues ou non');
ok(/Who can change the roll prizes\. One wallet can: the UNIT creator, as the contract reads it from the TokenizedBlock hook \( 0xc0c0…c0c0 , read by our server\)/.test(pLive), 'regles lues : le wallet du createur de UNIT (lu par unitCreator()) est nomme, avec son lien');
ok(/It can set each prize up to 1000 USDC and the minimum score from 2 to 5; a change applies only to rolls made after it\./.test(pLive), 'le plafond MAX_PRIZE LU (1000 USDC), le score minimum 2..5, et « seulement les rolls d apres »');
ok(/Nothing in the contract stops that wallet from raising the prizes and then rolling itself, so the roll pot is not out of its reach\./.test(pLive), 'la structure : rien n empeche ce wallet de monter les gains puis de jouer (aucune intention dite)');
ok(/\(not read just now\)\. It can set each prize up to a cap fixed in the contract \(not read just now\)/.test(pNon) && /\(not read just now\)\. It can set each prize up to a cap fixed in the contract/.test(pNull), 'non lus : « not read just now », aucune adresse ni plafond invente');
ok(!/\b(scam|rug|steal|thief|malicious|fraud)\w*/i.test(pLive + pNon), 'aucun mot d accusation');
ok(/Roll prizes 2 USDC – 7 USDC Traits in common with the block's face, out of 5: 3 → 2 USDC, 4 → 4 USDC, 5 → 7 USDC; fewer than 3 → nothing\./.test(pLive) && /\(rules version 2\)/.test(pLive),
  'regles lues : les gains LUS (min 3 : pas de palier 2), avec la version');
ok(/Roll prizes 0\.50 USDC – 5 USDC .*2 → 0\.50 USDC, 3 → 1 USDC, 4 → 3 USDC, 5 → 5 USDC; fewer than 2 → nothing\..*These are the rules set at deployment: the contract's current rules were not read just now\./.test(pNon), 'non lues : la fiche, DITE comme les regles du deploiement');
const ev = (p) => (/pays back ([\d.]+) USDC on average with a random guess/.exec(p) || [])[1];
ok(ev(pLive) && ev(pNon) && ev(pLive) !== ev(pNon), 'l esperance suit les regles lues (' + ev(pLive) + ') et non la fiche (' + ev(pNon) + ')');

console.log('— (4) le tirage du pass re-armable');
ok(/The day-pass draw can be re-armed\. After a UTC day ends, anyone can close it, which picks a draw block; the draw must then be made within 256 blocks after that block\. If nobody draws in time, the day can be closed again on a new block\. A buyer who sees that the hash does not pick them can wait and close again until it does, unless someone else draws in time\./.test(pNull),
  'Fees & risks : le re-armement (256 blocs, un acheteur peut re-fermer jusqu a etre tire) est liste');
const fen = '256 blocks (51 s at the measured block time)';
const ph = (a) => { try { return RA.phraseFenetreTirage(a, fen); } catch (_) { return null; } };
ok(['FERMER', 'ATTENDRE', 'TIRER'].every((a) => ph(a) === ' It must be drawn within ' + fen + ' after its draw block, or it re-arms on a new block; anyone can draw it with the draw button.'), 'carte du pass : FERMER / ATTENDRE / TIRER disent la fenetre et « anyone can draw »');
ok(['AUCUN', 'NON_LU', undefined].every((a) => ph(a) === '') && (() => { try { return RA.phraseFenetreTirage('TIRER', '') === ''; } catch (_) { return false; } })(), 'rien a tirer, non lu, ou fenetre absente : aucune ligne');

console.log('— textes des pages (copies mutees en memoire)');
const DEP = fs.readFileSync(path.join(ICI, 'deployer-blockrolls.html'), 'utf8').replace(/\r\n/g, '\n');
const APP = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
const checks = {
  deployer: (s) => !/Nobody can take the pots|cannot touch the pots|no way back out of the pot/i.test(s) && /No owner and no withdraw function/.test(s)
    && /nothing stops that wallet from raising the prizes and then rolling itself, so the roll pot is not out of its reach/.test(s),
  cartePass: (s) => { const i = s.indexOf('async function peindreTirageJourPass()'), j = s.indexOf('async function tirerJourPass()', i);
    const a = i > 0 && j > i ? s.slice(i, j) : ''; return /p\.textContent = t \+ phraseFenetreTirage\(d\.action, texteBlocs\(FENETRE_ROLLS, sParBlocApp\)\);/.test(a); },
};
ok(checks.deployer(DEP), 'deployer-blockrolls.html : plus de « Nobody can take the pots » ; pas de fonction de retrait ; ce que peut le createur');
ok(checks.cartePass(APP), 'app.html : la carte du pass ajoute phraseFenetreTirage a chaque ligne peinte');
const mutants = [
  ['deployer', DEP, 'No owner and no withdraw function: the roll pot', 'No owner. Nobody can take the pots: the roll pot'],
  ['deployer', DEP, 'The creator has no withdraw call, but nothing stops that wallet from raising the prizes and then rolling itself, so the roll pot is not out of its reach.', 'The creator cannot touch the pots.'],
  ['cartePass', APP, 'p.textContent = t + phraseFenetreTirage(d.action, texteBlocs(FENETRE_ROLLS, sParBlocApp));', 'p.textContent = t;'],
];
let tues = 0;
for (const [k, s, de, vers] of mutants) {
  const i = s.indexOf(de); if (i < 0) { ok(false, 'mutant introuvable (' + k + ')'); continue; }
  if (!checks[k](s.slice(0, i) + vers + s.slice(i + de.length))) tues++; else ok(false, 'mutant SURVIT (' + k + ')');
}
ok(tues === mutants.length, 'mutants du texte tues : ' + tues + '/' + mutants.length);
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
