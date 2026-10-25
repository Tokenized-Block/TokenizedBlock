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
 *   directement sur le contrat (l app ne peut pas l empecher).
 * ROUND 4 (2026-10-24, decision du lead) : un regleur ne suffit pas sur BlockDuels v1 -> la PORTE (regleurCouvre, duelsOuverts, brain) est
 *   FERMEE sur ce contrat quel que soit le regleur ; les gardes de sante sont testees via regleurLitLesDuels (gardees pour un v2). */
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
/* revue fix2 porte D1 : l heure est PASSEE (duels-plan-app.js n a pas d horloge) ; ici l horloge du banc */ const couvre = (e, c = DC) => essai(() => D.regleurCouvre(e, c, Date.now()));
/* round 4 : les gardes de SANTE (regleurLitLesDuels, gardees pour un v2) sont testees a part ; la PORTE (regleurCouvre) est FERMEE sur BlockDuels v1 */ const lit = (e, c = DC) => essai(() => D.regleurLitLesDuels(e, c, Date.now()));
ok(typeof D.regleurCouvre === 'function' && couvre({ etat: 'OFF', pourquoi: 'SLOTS_KEEPER_KEY is not set', adresse: null }) === false, 'regleur OFF (la forme de /sante aujourd hui) : ne couvre pas les duels');
ok(couvre({ etat: 'ON', adresse: B, contrat: AUTRE_C }) === false && couvre({ etat: 'ON', contrats: [] }) === false, 'regleur ON des slots seulement (aucun contrats[] qui nomme les duels) : ne couvre pas');
/* 2026-10-24 (revue rolls-duels-ui, 2e tour) : la forme est celle que slots-regleur.js etat() PUBLIE — contrats = { slots, duels: { contrat,
 *   configure, ... }, rolls } ; le tableau de la 1re version n est publie par aucun regleur et ne compte plus. Le VRAI etat() est execute dans
 *   test-duels-gate-fix2-20261024.mjs (creerRegleur sur un faux noeud). */
/* revue fix2 porte D1 (2026-10-24) : contrats.duels porte aussi la sante de la lecture des duels — lu (ISO, la derniere REUSSIE) et
 *   erreurLecture (null) ; par defaut ici une lecture fraiche (maintenant), intervalle du regleur 10 s */
const reel = (duels, etat = 'ON') => ({ etat, intervalleMs: 10000, contrats: { slots: { contrat: AUTRE_C }, duels: duels && typeof duels === 'object' ? { lu: new Date().toISOString(), erreurLecture: null, ...duels } : duels, rolls: { contrat: null, configure: false } } });
ok(lit(reel({ contrat: DC, configure: true, suivis: 0 })) === true && lit(reel({ contrat: DC.toUpperCase().replace('0X', '0x'), configure: true })) === true,
  'sante : regleur ON dont contrats.duels nomme CE contrat, configure, lu il y a moins de 3 tours : lit les duels');
ok(couvre(reel({ contrat: DC, configure: true, suivis: 0 })) === false && couvre(reel({ contrat: DC.toUpperCase().replace('0X', '0x'), configure: true })) === false && couvre(reel({ contrat: AUTRE_C, configure: true }), AUTRE_C) === false,
  'round 4 : la MEME sante parfaite ne couvre PAS BlockDuels v1 (DUELS_REGLEUR_SUFFIT false), ni un contrat non declare : porte fermee');
ok(D.DUELS_REGLEUR_SUFFIT && D.DUELS_REGLEUR_SUFFIT[DC] === false && Object.isFrozen(D.DUELS_REGLEUR_SUFFIT) && D.regleurSuffit(DC) === false && D.duelsFermesParContrat(DC.toUpperCase().replace('0X', '0x')) === true && D.duelsFermesParContrat(AUTRE_C) === false,
  'DUELS_REGLEUR_SUFFIT : BlockDuels v1 declare false (gele) ; un contrat non declare n est pas suffisant mais pas non plus declare ferme');
ok(lit(reel({ contrat: DC, configure: true, lu: null })) === false && lit(reel({ contrat: DC, configure: true, lu: new Date(Date.now() - 30000).toISOString() })) === false
  && lit(reel({ contrat: DC, configure: true, erreurLecture: '429 Too Many Requests' })) === false && lit(reel({ contrat: DC, configure: true, erreurLecture: undefined })) === false,
  'jamais lu, lu il y a 3 tours (30 s), derniere lecture en erreur, erreurLecture absente (un regleur plus ancien) : ne couvre pas');
ok(lit({ etat: 'ON', contrats: [DC] }) === false && lit({ etat: 'ON', contrats: [{ contrat: DC, etat: 'ON' }] }) === false && lit(reel({ contrat: DC, configure: false })) === false
  && lit(reel({ contrat: DC, configure: 'true' })) === false && lit(reel(null)) === false && lit(reel({ contrat: null, configure: true })) === false,
  'tableau (forme jamais publiee), duels non configures, configure en texte, contrat null : ne couvre pas');
ok(lit(reel({ contrat: DC, configure: true }, 'ARRETE')) === false && lit(reel({ contrat: DC, configure: true }, 'OFF')) === false && lit(reel({ contrat: DC, configure: true }, 'DEGRADE')) === false && lit(reel({ contrat: AUTRE_C, configure: true })) === false && lit(reel({ contrat: DC, configure: true }), '0x12') === false && lit(null) === false,
  'arrete (globalement ou pour ce contrat), DEGRADE (tete gelee), autre contrat, contrat mal forme, pas d etat : ne lit pas');
const ouv = (j) => essai(() => D.duelsOuverts(j));
ok(typeof D.duelsOuverts === 'function' && ouv({ regleur: { regleDuels: true } }) === true && ouv({ regleur: { regleDuels: false } }) === false && ouv({ regleur: { regleDuels: 'true' } }) === false && ouv({}) === false && ouv(null) === false,
  'duelsOuverts : true SEULEMENT si /api/duels dit regleDuels === true');
ok(ouv({ contrat: DC, regleur: { regleDuels: true } }) === false && ouv({ contrat: DC.toUpperCase().replace('0X', '0x'), regleur: { regleDuels: true } }) === false && ouv({ contrat: AUTRE_C, regleur: { regleDuels: true } }) === true,
  'round 4 : BlockDuels v1 (declare false) reste FERME meme si une reponse dit regleDuels true ; un contrat non declare suit la reponse');
/* la forme EXACTE que /api/duels sert aujourd hui (regleur OFF) : un duel OUVERT d un autre wallet n offre PAS Accept */
const T = 1761300000;
const servi = { ok: true, etat: 'LU', contrat: DC, regleur: { etat: 'OFF', adresse: null, regleDuels: false }, tete: 1000, duels: [] };
const ouvert = { id: '1', creator: A, token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', stake: 1000000n, guessA: [1, 1, 1, 1, 1], expiresAt: T + 3600, joiner: null, guessB: null, targetBlock: null, settled: null, cancelled: false, refunded: false };
const offre = (d, moi, tete, j = servi, t = T) => essai(() => D.actionsDuel(d, moi, tete, t, D.duelsOuverts ? D.duelsOuverts(j) : undefined).join());
ok(offre(ouvert, B, 1000) === '', 'regleur OFF : un duel OUVERT d un autre wallet n offre RIEN (pas de JOIN — le defaut de l audit)');
ok(offre(ouvert, B, 1000, { ...servi, regleur: { etat: 'ON', adresse: B, regleDuels: true } }) === '' && offre(ouvert, B, 1000, { ...servi, contrat: AUTRE_C, regleur: { etat: 'ON', adresse: B, regleDuels: true } }) === 'JOIN',
  'round 4 : BlockDuels v1, meme avec regleDuels true : pas de JOIN ; un contrat non declare ouvert par le serveur : JOIN');
ok(offre(ouvert, A, 1000) === 'CANCEL', 'regleur OFF : le createur garde Cancel (sa mise revient)');
const pris = { ...ouvert, joiner: B, guessB: [2, 2, 2, 2, 2], targetBlock: 990 };
ok(offre(pris, null, 1000) === 'SETTLE' && offre(pris, null, 990 + 256) === 'SETTLE' && offre(pris, null, 990 + 257) === 'REFUND' && offre(ouvert, B, 1000, servi, T + 3601) === 'REFUND',
  'regleur OFF : un duel en jeu garde Settle (dans la fenetre) puis Refund ; un defi expire garde Refund');
ok(essai(() => D.actionsDuel(ouvert, B, 1000, T).join()) === '', 'actionsDuel sans 5e argument : ferme par defaut (jamais JOIN)');
ok(typeof D.PHRASE_DUELS_FERMES === 'string' && D.PHRASE_DUELS_FERMES.length <= 160 && /^New duels are closed/.test(D.PHRASE_DUELS_FERMES) && /in this contract/.test(D.PHRASE_DUELS_FERMES) && /joins and loses/.test(D.PHRASE_DUELS_FERMES) && /full refund/.test(D.PHRASE_DUELS_FERMES) && /Settle and Refund/.test(D.PHRASE_DUELS_FERMES) && !/settler|once|until|soon/i.test(D.PHRASE_DUELS_FERMES) && !/[éèàçù]/.test(D.PHRASE_DUELS_FERMES),
  'la phrase (anglais, <= 160 car.) dit que les duels sont FERMES, pourquoi, et que Settle / Refund restent (round 4 : plus de promesse d ouverture) : « ' + D.PHRASE_DUELS_FERMES + ' »');

console.log('— B. brain-jeu.js (execute)');
const W = '0x' + '1'.repeat(40), USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const etatBrain = (duels) => ({ authorized: true, wallet: W, now: T, budgetUsdc: '10000000', spentUsdc: '0', balanceUsdc: '50000000', history: [], seen: [],
  rules: { rolls: false, settle: false, missions: false, postMissions: false, skins: false, maxSkinBidUsdc: '0', duels: true, maxDuelStakeUsdc: '2000000', pot: false, potDailyUsdc: '0' },
  rolls: null, missions: null, skins: null, duels, pot: null });
const dBrain = { ...ouvert, creator: '0x' + '2'.repeat(40) };
const brainDe = (x) => essai(() => J.prochaineProposition(etatBrain({ contract: DC, usdc: USDC, guess: [0, 1, 2, 3, 4], expiresIn: 3600, block: 1000, list: [dBrain], ...x })));
const pF = brainDe({ open: false }), pA = brainDe({}), pO = brainDe({ open: true });
ok(pF && pA && !['DUEL_JOIN', 'DUEL_CREATE'].includes(pF.kind) && !['DUEL_JOIN', 'DUEL_CREATE'].includes(pA.kind) && /new duels are closed/.test(pF.why) && /joins and loses/.test(pF.why), 'duels fermes (open false ou absent) : ni DUEL_JOIN ni DUEL_CREATE ; le pourquoi : ' + (pF && String(pF.why).slice(0, 90)));
ok(pO && !['DUEL_JOIN', 'DUEL_CREATE'].includes(pO.kind) && /new duels are closed/.test(pO.why), 'round 4 : BlockDuels v1 avec open true (reponse perimee ou fausse) : ni DUEL_JOIN ni DUEL_CREATE (' + (pO && pO.kind) + ')');
const pO2 = brainDe({ open: true, contract: AUTRE_C });
/* round 4 : sur un contrat NON declare, c est open seul qui ferme (absent / false / « true » en texte) — sinon la garde de open ne serait
 *   jamais jugee, la constante de v1 fermant tout */
const pX = [undefined, false, 'true'].map((o) => brainDe({ open: o, contract: AUTRE_C }));
ok(pX.every((p) => p && !['DUEL_JOIN', 'DUEL_CREATE'].includes(p.kind) && /new duels are closed/.test(p.why)), 'contrat non declare, open absent / false / « true » : ni DUEL_JOIN ni DUEL_CREATE (' + pX.map((p) => p && p.kind).join(',') + ')');
ok(pO2 && pO2.kind === 'DUEL_JOIN', 'un contrat non declare ouvert (open true) : DUEL_JOIN propose (' + (pO2 && pO2.kind) + ') — le brain ne ferme que le contrat DECLARE');
const pS = essai(() => J.prochaineProposition(etatBrain({ contract: DC, usdc: USDC, guess: [0, 1, 2, 3, 4], expiresIn: 3600, block: 1000, open: false, list: [{ ...pris, creator: W, targetBlock: 995 }] })));
ok(pS && pS.kind === 'DUEL_SETTLE', 'duels fermes : son duel reglable reste propose (DUEL_SETTLE)');

console.log('— C. app.html / serveur-web.js (texte, chaque garde mutee doit rougir)');
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const checksApp = {
  /* 2026-10-25 (R5 Grok) : ligneDuel et actionDuel prennent aussi la marge du Settle (margeBlocs / margeD) — textes suivis */
  ligneRecoitOuverts: (t) => /async function ligneDuel\(d, moi, tete, maintenant, ouverts = false, margeBlocs = undefined\)/.test(t) && /const acts = Duels\.actionsDuel\(d, moi, tete, maintenant, ouverts, margeBlocs\);/.test(t),
  carteGardee: (t) => { const p = entre(t, 'async function peindreDuels()', 'async function peindreDusDuels(');
    return /const ouv = Duels\.duelsOuverts\(j\);/.test(p) && /if \(fo\) fo\.hidden = !ouv;/.test(p) && /\$\('#duelDefier'\)\.hidden = !c \|\| !ouv;/.test(p)
      && /lignes\.push\(await ligneDuel\(d, moi, tete, maintenant, ouv, margeD\)\)/.test(p) && /etat\.textContent = \(!ouv \? Duels\.PHRASE_DUELS_FERMES/.test(p); },
  relitAvantEnvoi: (t) => /if \(!Duels\.actionsDuel\(d, moi, tete, maintenant, Duels\.duelsOuverts\(j\), margeD\)\.includes\(action\)\)/.test(entre(t, 'async function actionDuel(', 'async function defierDuel(')),
  defiRefuse: (t) => { const a = entre(t, 'async function defierDuel(', "$('#duelsListe').addEventListener"); const i = a.indexOf('if (!Duels.duelsOuverts(j)) { dit(Duels.PHRASE_DUELS_FERMES'), k = a.indexOf('Duels.planCreate('); return i > 0 && k > i; },
  brainOuvert: (t) => /list: duelsDe\(jd\), open: Duels\.duelsOuverts\(jd\) \}/.test(t),
  chatListe: (t) => { const a = entre(t, 'async function bcCommandeDuel(', 'async function bcAccepterDuel('); const i = a.indexOf('if (!Duels.duelsOuverts(j)) {'), r = a.indexOf('return;', i), k = a.indexOf("'Open a challenge'"); return i > 0 && r > i && k > r; },
  chatAccepte: (t) => { const a = entre(t, 'async function bcAccepterDuel(', '/* ══ LE BRAIN OS'); const i = a.indexOf("if (!Duels.duelsOuverts(j)) { bcEtape(m, Duels.PHRASE_DUELS_FERMES"), k = a.indexOf('Duels.planJoin('); return i > 0 && k > i; },
};
const checksSrv = {
  routeServie: (t) => { const a = entre(t, "if (chemin === '/api/duels')", '/* ══ BLOCK MISSIONS'); return /const regleur = \{ etat: eReg\.etat, adresse: eReg\.adresse \|\| null, regleDuels: regleurCouvre\(eReg, contrat, Date\.now\(\)\) \};/.test(a) && /rewardPool: adrOk\(k\.rewardPool\), regles, regleur \};/.test(a); },
};
const mutants = [
  ['ligneRecoitOuverts', APP, 'const acts = Duels.actionsDuel(d, moi, tete, maintenant, ouverts, margeBlocs);', 'const acts = Duels.actionsDuel(d, moi, tete, maintenant, true, margeBlocs);'],
  ['carteGardee', APP, 'if (fo) fo.hidden = !ouv;', 'if (fo) fo.hidden = false;'],
  ['carteGardee', APP, "$('#duelDefier').hidden = !c || !ouv;", "$('#duelDefier').hidden = !c;"],
  ['relitAvantEnvoi', APP, 'if (!Duels.actionsDuel(d, moi, tete, maintenant, Duels.duelsOuverts(j), margeD).includes(action))', 'if (!Duels.actionsDuel(d, moi, tete, maintenant, true, margeD).includes(action))'],
  ['defiRefuse', APP, "if (!Duels.duelsOuverts(j)) { dit(Duels.PHRASE_DUELS_FERMES + ' Nothing was asked.'); void peindreDuels(); return; }", ''],
  ['brainOuvert', APP, 'list: duelsDe(jd), open: Duels.duelsOuverts(jd) }', 'list: duelsDe(jd), open: true }'],
  ['chatListe', APP, 'if (!Duels.duelsOuverts(j)) {\n    bcEtape(m, Duels.PHRASE_DUELS_FERMES);', 'if (false) {\n    bcEtape(m, Duels.PHRASE_DUELS_FERMES);'],
  ['chatAccepte', APP, "if (!Duels.duelsOuverts(j)) { bcEtape(m, Duels.PHRASE_DUELS_FERMES + ' Nothing is proposed.', 'non'); return; }", ''],
  ['routeServie', SRV, 'regleDuels: regleurCouvre(eReg, contrat, Date.now()) };', 'regleDuels: eReg.etat === \'ON\' };'],
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
