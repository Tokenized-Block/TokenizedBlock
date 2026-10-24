/* test-duels-ouverture-20261024.mjs — AUDIT ROLLS-DUELS (2026-10-24), constat [high] « option gratuite » : tant que le regleur du SERVEUR ne
 *   regle pas les duels, l app ne propose NI d ouvrir NI de rejoindre un duel. Preuve du defaut (contrat deploye, immuable) : le PoC forge de
 *   l auditeur contracts/test/AuditRollsDuels20261024.t.sol (test_V_DuelCreatorWinBecomesRefund, test_V_DuelEV : 2000 duels, celui qui
 *   rejoint +454 400 000 brut, le createur -568 000 000). Ce banc prouve la PARADE cote app, en EXECUTANT le vrai code :
 *   A. duels-plan-app.js : regleurCouvre (ON ET le contrat nomme dans etat().contrats, sinon non), duelsOuverts (/api/duels.regleur.regleDuels
 *      === true seulement), actionsDuel : JOIN jamais propose quand c est ferme — avec la forme EXACTE servie aujourd hui (regleur OFF) —,
 *      SETTLE / REFUND / CANCEL des duels en jeu toujours proposes ;
 *   B. brain-jeu.js : duels fermes -> ni DUEL_JOIN ni DUEL_CREATE (le pourquoi nomme le regleur), DUEL_SETTLE reste ; ouverts -> JOIN ;
 *   C. app.html / serveur-web.js (fonctions du TEXTE, rejouees sur des copies MUTEES en memoire : chacune doit alors rendre faux) : la carte,
 *      le Challenge, l Accept, le re-controle avant envoi, le brain, la commande « duel » du Chat et la route /api/duels portent la garde.
 * Modules remplacables par variable d environnement (DUELS_APP_MODULE, BRAIN_JEU_MODULE) : muter-rolls-duels-ui-20261024.mjs y pose des
 *   COPIES mutees. ⛔ PORTABLE : process.exitCode, jamais process.exit.
 * NE PROUVE PAS : le rendu dans un navigateur ; un vrai regleur des duels (un autre chantier l ajoute) ; qu un tiers ne rejoigne pas
 *   directement sur le contrat (l app ne peut pas l empecher). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(ICI, f)).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const essai = (f) => { try { return f(); } catch (e) { return false; } };

const D = await imp(process.env.DUELS_APP_MODULE || 'duels-plan-app.js');
const J = await imp(process.env.BRAIN_JEU_MODULE || 'brain-jeu.js');
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html'), SRV = lire('serveur-web.js');

console.log('— A. duels-plan-app.js (execute)');
const DC = '0x6b7647b326a635c0902eaed41ab0b41746b9602c', AUTRE_C = '0x' + '5'.repeat(40);
const A = '0x' + 'a1'.repeat(20), B = '0x' + 'b1'.repeat(20);
const couvre = (e, c = DC) => essai(() => D.regleurCouvre(e, c));
ok(typeof D.regleurCouvre === 'function' && couvre({ etat: 'OFF', pourquoi: 'SLOTS_KEEPER_KEY is not set', adresse: null }) === false, 'regleur OFF (la forme de /sante aujourd hui) : ne couvre pas les duels');
ok(couvre({ etat: 'ON', adresse: B, contrat: AUTRE_C }) === false && couvre({ etat: 'ON', contrats: [] }) === false, 'regleur ON des slots seulement (aucun contrats[] qui nomme les duels) : ne couvre pas');
ok(couvre({ etat: 'ON', contrats: [DC.toUpperCase().replace('0X', '0x')] }) === true && couvre({ etat: 'ON', contrats: [{ contrat: DC, etat: 'ON' }] }) === true && couvre({ etat: 'ON', contrats: [{ contrat: DC }] }) === true,
  'regleur ON qui nomme le contrat des duels (adresse, ou { contrat, etat ON }) : couvre');
ok(couvre({ etat: 'ON', contrats: [{ contrat: DC, etat: 'ARRETE' }] }) === false && couvre({ etat: 'ARRETE', contrats: [DC] }) === false && couvre({ etat: 'ON', contrats: [AUTRE_C] }) === false && couvre({ etat: 'ON', contrats: [DC] }, '0x12') === false && couvre(null) === false,
  'arrete (globalement ou pour ce contrat), autre contrat, contrat mal forme, pas d etat : ne couvre pas');
const ouv = (j) => essai(() => D.duelsOuverts(j));
ok(typeof D.duelsOuverts === 'function' && ouv({ regleur: { regleDuels: true } }) === true && ouv({ regleur: { regleDuels: false } }) === false && ouv({ regleur: { regleDuels: 'true' } }) === false && ouv({}) === false && ouv(null) === false,
  'duelsOuverts : true SEULEMENT si /api/duels dit regleDuels === true');
/* la forme EXACTE que /api/duels sert aujourd hui (regleur OFF) : un duel OUVERT d un autre wallet n offre PAS Accept */
const T = 1761300000;
const servi = { ok: true, etat: 'LU', contrat: DC, regleur: { etat: 'OFF', adresse: null, regleDuels: false }, tete: 1000, duels: [] };
const ouvert = { id: '1', creator: A, token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', stake: 1000000n, guessA: [1, 1, 1, 1, 1], expiresAt: T + 3600, joiner: null, guessB: null, targetBlock: null, settled: null, cancelled: false, refunded: false };
const offre = (d, moi, tete, j = servi, t = T) => essai(() => D.actionsDuel(d, moi, tete, t, D.duelsOuverts ? D.duelsOuverts(j) : undefined).join());
ok(offre(ouvert, B, 1000) === '', 'regleur OFF : un duel OUVERT d un autre wallet n offre RIEN (pas de JOIN — le defaut de l audit)');
ok(offre(ouvert, B, 1000, { ...servi, regleur: { etat: 'ON', adresse: B, regleDuels: true } }) === 'JOIN', 'regleur qui regle les duels : JOIN propose');
ok(offre(ouvert, A, 1000) === 'CANCEL', 'regleur OFF : le createur garde Cancel (sa mise revient)');
const pris = { ...ouvert, joiner: B, guessB: [2, 2, 2, 2, 2], targetBlock: 990 };
ok(offre(pris, null, 1000) === 'SETTLE' && offre(pris, null, 990 + 256) === 'SETTLE' && offre(pris, null, 990 + 257) === 'REFUND' && offre(ouvert, B, 1000, servi, T + 3601) === 'REFUND',
  'regleur OFF : un duel en jeu garde Settle (dans la fenetre) puis Refund ; un defi expire garde Refund');
ok(essai(() => D.actionsDuel(ouvert, B, 1000, T).join()) === '', 'actionsDuel sans 5e argument : ferme par defaut (jamais JOIN)');
ok(typeof D.PHRASE_DUELS_FERMES === 'string' && D.PHRASE_DUELS_FERMES.length <= 160 && /automatic settler/.test(D.PHRASE_DUELS_FERMES) && /joins and loses/.test(D.PHRASE_DUELS_FERMES) && /refund/.test(D.PHRASE_DUELS_FERMES) && !/[éèàçù]/.test(D.PHRASE_DUELS_FERMES),
  'la phrase (anglais, <= 160 car.) dit quand les duels ouvrent et pourquoi : « ' + D.PHRASE_DUELS_FERMES + ' »');

console.log('— B. brain-jeu.js (execute)');
const W = '0x' + '1'.repeat(40), USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const etatBrain = (duels) => ({ authorized: true, wallet: W, now: T, budgetUsdc: '10000000', spentUsdc: '0', balanceUsdc: '50000000', history: [], seen: [],
  rules: { rolls: false, settle: false, missions: false, postMissions: false, skins: false, maxSkinBidUsdc: '0', duels: true, maxDuelStakeUsdc: '2000000', pot: false, potDailyUsdc: '0' },
  rolls: null, missions: null, skins: null, duels, pot: null });
const dBrain = { ...ouvert, creator: '0x' + '2'.repeat(40) };
const brainDe = (x) => essai(() => J.prochaineProposition(etatBrain({ contract: DC, usdc: USDC, guess: [0, 1, 2, 3, 4], expiresIn: 3600, block: 1000, list: [dBrain], ...x })));
const pF = brainDe({ open: false }), pA = brainDe({}), pO = brainDe({ open: true });
ok(pF && pA && !['DUEL_JOIN', 'DUEL_CREATE'].includes(pF.kind) && !['DUEL_JOIN', 'DUEL_CREATE'].includes(pA.kind) && /automatic settler/.test(pF.why), 'duels fermes (open false ou absent) : ni DUEL_JOIN ni DUEL_CREATE ; le pourquoi : ' + (pF && String(pF.why).slice(0, 90)));
ok(pO && pO.kind === 'DUEL_JOIN', 'duels ouverts (open true) : DUEL_JOIN propose (' + (pO && pO.kind) + ')');
const pS = essai(() => J.prochaineProposition(etatBrain({ contract: DC, usdc: USDC, guess: [0, 1, 2, 3, 4], expiresIn: 3600, block: 1000, open: false, list: [{ ...pris, creator: W, targetBlock: 995 }] })));
ok(pS && pS.kind === 'DUEL_SETTLE', 'duels fermes : son duel reglable reste propose (DUEL_SETTLE)');

console.log('— C. app.html / serveur-web.js (texte, chaque garde mutee doit rougir)');
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const checksApp = {
  ligneRecoitOuverts: (t) => /async function ligneDuel\(d, moi, tete, maintenant, ouverts = false\)/.test(t) && /const acts = Duels\.actionsDuel\(d, moi, tete, maintenant, ouverts\);/.test(t),
  carteGardee: (t) => { const p = entre(t, 'async function peindreDuels()', 'async function peindreDusDuels(');
    return /const ouv = Duels\.duelsOuverts\(j\);/.test(p) && /if \(fo\) fo\.hidden = !ouv;/.test(p) && /\$\('#duelDefier'\)\.hidden = !c \|\| !ouv;/.test(p)
      && /lignes\.push\(await ligneDuel\(d, moi, tete, maintenant, ouv\)\)/.test(p) && /etat\.textContent = \(!ouv \? Duels\.PHRASE_DUELS_FERMES/.test(p); },
  relitAvantEnvoi: (t) => /if \(!Duels\.actionsDuel\(d, moi, tete, maintenant, Duels\.duelsOuverts\(j\)\)\.includes\(action\)\)/.test(entre(t, 'async function actionDuel(', 'async function defierDuel(')),
  defiRefuse: (t) => { const a = entre(t, 'async function defierDuel(', "$('#duelsListe').addEventListener"); const i = a.indexOf('if (!Duels.duelsOuverts(j)) { dit(Duels.PHRASE_DUELS_FERMES'), k = a.indexOf('Duels.planCreate('); return i > 0 && k > i; },
  brainOuvert: (t) => /list: duelsDe\(jd\), open: Duels\.duelsOuverts\(jd\) \}/.test(t),
  chatListe: (t) => { const a = entre(t, 'async function bcCommandeDuel(', 'async function bcAccepterDuel('); const i = a.indexOf('if (!Duels.duelsOuverts(j)) {'), r = a.indexOf('return;', i), k = a.indexOf("'Open a challenge'"); return i > 0 && r > i && k > r; },
  chatAccepte: (t) => { const a = entre(t, 'async function bcAccepterDuel(', '/* ══ LE BRAIN OS'); const i = a.indexOf("if (!Duels.duelsOuverts(j)) { bcEtape(m, Duels.PHRASE_DUELS_FERMES"), k = a.indexOf('Duels.planJoin('); return i > 0 && k > i; },
};
const checksSrv = {
  routeServie: (t) => { const a = entre(t, "if (chemin === '/api/duels')", '/* ══ BLOCK MISSIONS'); return /const regleur = \{ etat: eReg\.etat, adresse: eReg\.adresse \|\| null, regleDuels: regleurCouvre\(eReg, contrat\) \};/.test(a) && /rewardPool: adrOk\(k\.rewardPool\), regles, regleur \};/.test(a); },
};
const mutants = [
  ['ligneRecoitOuverts', APP, 'const acts = Duels.actionsDuel(d, moi, tete, maintenant, ouverts);', 'const acts = Duels.actionsDuel(d, moi, tete, maintenant, true);'],
  ['carteGardee', APP, 'if (fo) fo.hidden = !ouv;', 'if (fo) fo.hidden = false;'],
  ['carteGardee', APP, "$('#duelDefier').hidden = !c || !ouv;", "$('#duelDefier').hidden = !c;"],
  ['relitAvantEnvoi', APP, 'if (!Duels.actionsDuel(d, moi, tete, maintenant, Duels.duelsOuverts(j)).includes(action))', 'if (!Duels.actionsDuel(d, moi, tete, maintenant, true).includes(action))'],
  ['defiRefuse', APP, "if (!Duels.duelsOuverts(j)) { dit(Duels.PHRASE_DUELS_FERMES + ' Nothing was asked.'); void peindreDuels(); return; }", ''],
  ['brainOuvert', APP, 'list: duelsDe(jd), open: Duels.duelsOuverts(jd) }', 'list: duelsDe(jd), open: true }'],
  ['chatListe', APP, 'if (!Duels.duelsOuverts(j)) {\n    bcEtape(m, Duels.PHRASE_DUELS_FERMES);', 'if (false) {\n    bcEtape(m, Duels.PHRASE_DUELS_FERMES);'],
  ['chatAccepte', APP, "if (!Duels.duelsOuverts(j)) { bcEtape(m, Duels.PHRASE_DUELS_FERMES + ' Nothing is proposed.', 'non'); return; }", ''],
  ['routeServie', SRV, 'regleDuels: regleurCouvre(eReg, contrat) };', 'regleDuels: eReg.etat === \'ON\' };'],
];
for (const [k, f] of Object.entries(checksApp)) ok(f(APP), 'app.html : ' + k);
for (const [k, f] of Object.entries(checksSrv)) ok(f(SRV), 'serveur-web.js : ' + k);
let tues = 0;
for (const [k, t, de, vers] of mutants) {
  const i = t.indexOf(de); if (i < 0) { ok(false, 'mutant introuvable (' + k + ') : ' + de.slice(0, 60)); continue; }
  const mute = t.slice(0, i) + vers + t.slice(i + de.length);
  if (!(checksApp[k] || checksSrv[k])(mute)) tues++; else ok(false, 'mutant SURVIT (' + k + ') : ' + de.slice(0, 60));
}
ok(tues === mutants.length, 'mutants du texte tues : ' + tues + '/' + mutants.length);
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
