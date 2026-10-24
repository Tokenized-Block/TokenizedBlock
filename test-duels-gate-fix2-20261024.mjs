/* test-duels-gate-fix2-20261024.mjs — REVUE rolls-duels-ui (2026-10-24, 2e tour) : les cinq defauts de la revue, chacun prouve en EXECUTANT
 *   le vrai code (jamais un objet ecrit a la main pour la forme du regleur).
 *   A. [integration] duels-plan-app.js regleurCouvre lit la forme REELLE de slots-regleur.js etat() : `contrats` est un OBJET
 *      { slots, duels: { contrat, configure, ... }, rolls }. Le regleur est construit par creerRegleur (cle de TEST publique n 1, jamais une
 *      vraie cle) sur un FAUX noeud (fonction rpc locale) ; aucune signature, aucun envoi. Duels ouverts SEULEMENT si etat ON, contrats.duels
 *      configure et son contrat = celui de la fiche des duels ; OFF, desactive, sans duels, autre contrat, contrat non resolu (chaine
 *      differente), ARRETE (le faux noeud sert une autre chaine) : ferme. Puis la chaine servie : regleDuels -> duelsOuverts -> actionsDuel
 *      (JOIN) -> brain-jeu (DUEL_JOIN). ROUND 4 : ces gardes de sante sont jugees par regleurLitLesDuels ; la porte (regleurCouvre) reste
 *      FERMEE sur BlockDuels v1 meme avec un regleur sain, et la chaine servie ne propose ni JOIN ni DUEL_JOIN.
 *   B. [low] app.html bjRefusAuSigne (extrait, EXECUTE) refuse un DUEL_JOIN / DUEL_CREATE si les duels ne sont pas RELUS ouverts au Sign ;
 *      bjDuelsRelus (extrait, EXECUTE avec un faux lireDuelsServis) : relu ouvert -> true ; relu ferme, relecture ratee (ancienne reponse
 *      rendue) -> false ; le Sign construit `lu` avec lui pour JOIN / CREATE AVANT bjRefusAuSigne.
 *   C. [low, texte] mcp-tblock.js tblock_plan_roll (module importe) : aucun « 3/5 » fige ; dit que les gains et le score minimum sont lus
 *      sur le contrat et que le createur de UNIT peut les changer.
 *   D. [low, texte] app.html passPaye (extrait, EXECUTE avec un faux DOM) : le texte AVANT la signature du pass dit la fenetre du tirage,
 *      que n importe qui peut tirer, qu un tirage manque se re-arme (un acheteur peut recommencer) et porte un lien vers Fees & risks.
 *   E. [cosmetique] deployer-blockrolls.html : la tuile ne s intitule plus « Fixed prizes ».
 * Modules remplacables (COPIES mutees, muter-duels-gate-fix2-20261024.mjs) : DUELS_APP_MODULE, APP_HTML_FILE, MCP_MODULE, DEPLOYER_HTML_FILE.
 * ⛔ PORTABLE : sources lues puis CRLF -> LF ; process.exitCode, jamais process.exit.
 * NE PROUVE PAS : un vrai regleur des duels sur Base ; le rendu dans un navigateur ; un duel joue de bout en bout a deux wallets. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(ICI, f)).href);
const lire = (f) => fs.readFileSync(path.isAbsolute(f) ? f : path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const essai = (f) => { try { return f(); } catch (e) { return 'EXC ' + (e && e.message); } };

const D = await imp(process.env.DUELS_APP_MODULE || 'duels-plan-app.js');
const { creerRegleur } = await imp('slots-regleur.js');
const J = await imp('brain-jeu.js');
const { texteBlocs } = await imp('temps-de-bloc.js');
const { FENETRE: FENETRE_ROLLS } = await imp('blockrolls-plan.js');
const APP = lire(process.env.APP_HTML_FILE || 'app.html');

console.log('— A. regleurCouvre sur le VRAI etat() de slots-regleur.js (faux noeud)');
const CLE_TEST = '0x' + '0'.repeat(63) + '1'; /* la cle de TEST publique n 1 : aucune valeur, rien n est signe ici */
const SLOTS = '0x' + 'c0'.repeat(20), DC = '0x6b7647b326a635c0902eaed41ab0b41746b9602c', RC = '0x' + 'd0'.repeat(20), AUTRE = '0x' + '5'.repeat(40);
const TABLE = ['0', '0', '0', '250000', '750000', '2000000', '3000000', '4000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000'];
const appels = [];
const noeud = (chaine = 8453) => async (methode, params) => {
  appels.push(methode);
  if (methode === 'eth_chainId') return '0x' + chaine.toString(16);
  if (methode === 'eth_blockNumber') return '0x186a0';
  if (methode === 'eth_getLogs') return [];
  if (methode === 'eth_getBlockByNumber') return { number: '0x186a0', timestamp: '0x6553f100', baseFeePerGas: '0xf4240' };
  if (methode === 'eth_call') return '0x' + '0'.repeat(64);
  throw new Error('fake node: ' + methode + ' not served');
};
/* la configuration du serveur (serveur-web.js : duels.contrat est une FONCTION, rolls.contrat une adresse) */
const regleur = (x = {}) => creerRegleur({ cle: CLE_TEST, contrat: SLOTS, chainId: 8453, table: TABLE, blocDeploiement: 99000, rpc: noeud(), journal: () => {},
  duels: { contrat: () => DC, bloc: () => 99000 }, rolls: { contrat: RC }, ...x });
/* revue fix2 porte D1 : l heure est PASSEE (duels-plan-app.js n a pas d horloge) ; le regleur de ce banc a l horloge reelle */ const couvre = (e, c = DC) => essai(() => D.regleurCouvre(e, c, Date.now()));
/* round 4 (decision du lead) : la PORTE est fermee sur BlockDuels v1 ; les gardes de SANTE (regleurLitLesDuels, gardees pour un v2) sont
 *   jugees a part, sur le meme vrai etat() */
const lit = (e, c = DC) => essai(() => D.regleurLitLesDuels(e, c, Date.now()));
/* revue fix2 porte D1 (2026-10-24) : couvrir exige aussi une lecture des duels REUSSIE et fraiche — le regleur ON fait donc UN tour sur le
 *   faux noeud (getLogs -> [], rien a regler) avant d etre juge ; un regleur qui n a jamais lu les duels ne couvre pas */
const rOn = regleur();
const eAvantLecture = rOn.etat();
await rOn.tour();
const eOn = rOn.etat();
ok(couvre(eAvantLecture) === false && eAvantLecture.contrats.duels.lu === null, 'regleur ON qui n a encore lu aucun duel (lu null) : ne couvre pas');
ok(eOn.etat === 'ON' && eOn.contrats && !Array.isArray(eOn.contrats) && eOn.contrats.duels && eOn.contrats.duels.contrat === DC && eOn.contrats.duels.configure === true,
  'temoin : le vrai etat() publie contrats comme un OBJET, contrats.duels = { contrat: ' + (eOn.contrats && eOn.contrats.duels && eOn.contrats.duels.contrat) + ', configure: ' + (eOn.contrats && eOn.contrats.duels && eOn.contrats.duels.configure) + ' }');
ok(lit(eOn) === true, 'sante : regleur ON qui regle CE contrat de duels (forme reelle) : lit les duels (' + lit(eOn) + ')');
ok(couvre(eOn) === false, 'round 4 : ce MEME regleur sain ne couvre PAS BlockDuels v1 (un regleur ne ferme pas l option) : porte fermee (' + couvre(eOn) + ')');
ok(lit(eOn, DC.toUpperCase().replace('0X', '0x')) === true && couvre(eOn, DC.toUpperCase().replace('0X', '0x')) === false, 'adresse de la fiche en casse mixte : lit, porte fermee');
ok(lit(eOn, AUTRE) === false && couvre(eOn, AUTRE) === false, 'regleur ON, autre contrat de duels que celui qu il regle : ne lit pas, ne couvre pas');
ok(lit(eOn, '0x12') === false && lit(eOn, null) === false && couvre(eOn, '0x12') === false, 'contrat de la fiche mal forme ou absent : ne couvre pas');
const eSansDuels = regleur({ duels: null }).etat();
ok(eSansDuels.etat === 'ON' && eSansDuels.contrats.duels.configure === false && couvre(eSansDuels) === false, 'regleur ON des slots et rolls, duels NON configures : ne couvre pas');
const eNonResolu = regleur({ duels: { contrat: () => null } }).etat();
ok(eNonResolu.etat === 'ON' && eNonResolu.contrats.duels.configure === true && eNonResolu.contrats.duels.contrat === null && couvre(eNonResolu) === false,
  'duels configures mais contrat non resolu (fiche sur une autre chaine : contratDuelsKeeper() = null) : ne couvre pas');
const eAutre = regleur({ duels: { contrat: () => AUTRE } }).etat();
ok(couvre(eAutre) === false, 'regleur qui regle un AUTRE contrat de duels : ne couvre pas celui de la fiche');
const eOff = regleur({ cle: null }).etat();
ok(eOff.etat === 'OFF' && couvre(eOff) === false, 'sans SLOTS_KEEPER_KEY (la forme de /sante en prod aujourd hui) : OFF, ne couvre pas');
ok(couvre(regleur({ desactive: 'trial mode (ESSAI)' }).etat()) === false, 'regleur desactive (mode essai) : ne couvre pas');
/* ARRETE : le faux noeud sert la chaine 1 ; le premier tour arrete le regleur (rien n est signe) */
const rArr = regleur({ rpc: noeud(1) });
appels.length = 0;
await rArr.tour();
const eArr = rArr.etat();
/* le stimulus : ARRETE seul doit fermer — meme avec une lecture des duels fraiche et sans erreur greffee (celle du regleur sain) */
const eArrLu = { ...eArr, contrats: { ...eArr.contrats, duels: { ...eArr.contrats.duels, lu: eOn.contrats.duels.lu, erreurLecture: null } } };
const avant = lit({ ...eArrLu, etat: 'ON' });
ok(appels.includes('eth_chainId') && avant === true && eArr.etat === 'ARRETE' && lit(eArr) === false && lit(eArrLu) === false && couvre(eArr) === false,
  'stimulus prouve (eth_chainId lu : ' + appels.join(',') + ') : la meme forme ON + lecture fraiche couvre ' + avant + ' ; noeud d une autre chaine -> ' + eArr.etat + ', ne couvre plus (meme lecture fraiche greffee)');
/* un tour sur la BONNE chaine (faux noeud, rien a regler) : le regleur reste ON et couvre toujours */
const rOk = regleur();
appels.length = 0;
const tr = await rOk.tour();
ok(appels.includes('eth_chainId') && appels.includes('eth_blockNumber') && rOk.etat().etat === 'ON' && lit(rOk.etat()) === true && couvre(rOk.etat()) === false,
  'un tour sur la bonne chaine (' + (tr && tr.pourquoi) + ') : toujours ON, lit les duels ; porte fermee (round 4)');
/* la chaine servie : /api/duels compose { etat, adresse, regleDuels: regleurCouvre(eReg, contrat, Date.now()) } (serveur-web.js) */
const servi = (e) => ({ ok: true, contrat: DC, regleur: { etat: e.etat, adresse: e.adresse || null, regleDuels: D.regleurCouvre(e, DC, Date.now()) } });
const T = 1761300000, A = '0x' + 'a1'.repeat(20), B = '0x' + 'b1'.repeat(20);
const ouvert = { id: '1', creator: A, token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', stake: 1000000n, guessA: [1, 1, 1, 1, 1], expiresAt: T + 3600, joiner: null, guessB: null, targetBlock: null, settled: null, cancelled: false, refunded: false };
const offre = (e) => essai(() => D.actionsDuel(ouvert, B, 1000, T, D.duelsOuverts(servi(e))).join());
ok(offre(eOn) === '' && offre(eOff) === '' && offre(eArr) === '', 'round 4 : servi -> duelsOuverts -> actionsDuel : AUCUN JOIN, regleur ON des duels, OFF ou ARRETE');
const W = '0x' + '1'.repeat(40), USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const brain = (e) => essai(() => J.prochaineProposition({ authorized: true, wallet: W, now: T, budgetUsdc: '10000000', spentUsdc: '0', balanceUsdc: '50000000', history: [], seen: [],
  rules: { rolls: false, settle: false, missions: false, postMissions: false, skins: false, maxSkinBidUsdc: '0', duels: true, maxDuelStakeUsdc: '2000000', pot: false, potDailyUsdc: '0' },
  rolls: null, missions: null, skins: null, pot: null,
  duels: { contract: DC, usdc: USDC, guess: [0, 1, 2, 3, 4], expiresIn: 3600, block: 1000, list: [{ ...ouvert, creator: '0x' + '2'.repeat(40) }], open: D.duelsOuverts(servi(e)) } }));
const bOn = brain(eOn), bOff = brain(eOff);
ok(bOn && !['DUEL_JOIN', 'DUEL_CREATE'].includes(bOn.kind) && bOff && !['DUEL_JOIN', 'DUEL_CREATE'].includes(bOff.kind), 'round 4 : brain-jeu : ni DUEL_JOIN ni DUEL_CREATE, regleur ON des duels (' + (bOn && bOn.kind) + ') ou OFF (' + (bOff && bOff.kind) + ')');

console.log('— B. app.html : le Sign du brain relit duelsOuverts (bjRefusAuSigne + bjDuelsRelus, EXECUTES)');
const sansCom = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const rs = sansCom(APP.slice(APP.indexOf('function bjRefusAuSigne('), APP.indexOf('function bjSauver(')));
const refusAuSigne = new Function('bj', 'bjVol', 'compte', 'usdcTexte', 'Duels', rs + '\nreturn bjRefusAuSigne;');
const etatBj = { on: true, budget: '10000000', depense: '0', maxH: 6, maxDuel: '1000000', duels: true, history: [] };
const refus = (p, lu) => essai(() => refusAuSigne(etatBj, { carte: 3 }, W, (v) => String(v), D)(3, p, W, lu));
const join = { kind: 'DUEL_JOIN', costUsdc: '1000000' }, cree = { kind: 'DUEL_CREATE', costUsdc: '1000000' }, regle = { kind: 'DUEL_SETTLE', costUsdc: '0' };
ok(refus(join, { duelsOuverts: true }) === null && refus(cree, { duelsOuverts: true }) === null, 'au Sign : JOIN / CREATE avec les duels RELUS ouverts : passe (null)');
for (const [nom, lu] of [['relus fermes', { duelsOuverts: false }], ['non relus (lu vide)', {}], ['sans lu', undefined], ['« true » en texte', { duelsOuverts: 'true' }]]) {
  const rj = refus(join, lu), rc = refus(cree, lu);
  ok(typeof rj === 'string' && /new duels are closed/.test(rj) && /nothing was sent/.test(rj) && typeof rc === 'string' && /new duels are closed/.test(rc),'au Sign : JOIN / CREATE, duels ' + nom + ' -> REFUSE : « ' + String(rj).slice(0, 110) + ' »');
}
ok(refus(regle, {}) === null, 'au Sign : DUEL_SETTLE ne depend pas de l ouverture (un duel en jeu se regle toujours)');
const iRel = APP.indexOf('async function bjDuelsRelus('), finRel = APP.indexOf('async function bjDayPot(', iRel);
const srcRel = iRel > 0 && finRel > iRel ? sansCom(APP.slice(iRel, finRel)) : '';
ok(srcRel.length > 0, 'bjDuelsRelus existe dans app.html');
const relus = async (reponse, avance) => {
  if (!srcRel) return 'ABSENT';
  const duelsCfg = { j: { ok: true, regleur: { regleDuels: true } }, lu: 1 };
  const lireDuelsServis = async (force) => { if (force !== true) return 'PAS FORCE'; if (avance) { duelsCfg.j = reponse; duelsCfg.lu = Date.now(); } return duelsCfg.j; };
  try { return await new Function('lireDuelsServis', 'duelsCfg', 'Duels', srcRel + '\nreturn bjDuelsRelus;')(lireDuelsServis, duelsCfg, D)(); } catch (e) { return 'EXC ' + e.message; }
};
ok(await relus({ ok: true, regleur: { regleDuels: true } }, true) === true, 'bjDuelsRelus : /api/duels RELU ouvert -> true');
ok(await relus({ ok: true, regleur: { regleDuels: false } }, true) === false, 'bjDuelsRelus : /api/duels RELU ferme -> false');
ok(await relus(null, false) === false, 'bjDuelsRelus : relecture ratee (lireDuelsServis rend l ANCIENNE reponse ouverte) -> false');
const iSign = APP.indexOf("bcBoutons(m, [['Sign', async () => {"), sign = iSign > 0 ? APP.slice(iSign, APP.indexOf('bjVol.signe = true;', iSign)) : '';
const iLu = sign.indexOf("if (p.kind === 'DUEL_JOIN' || p.kind === 'DUEL_CREATE') lu = { duelsOuverts: await bjDuelsRelus() };"), iRefus = sign.indexOf('const refus = bjRefusAuSigne(id, p, walletCarte, lu);');
ok(iLu > 0 && iRefus > iLu, 'le Sign relit les duels (bjDuelsRelus) pour JOIN / CREATE AVANT bjRefusAuSigne, avant tout envoi');

console.log('— C. mcp-tblock.js tblock_plan_roll (module importe)');
const M = await imp(process.env.MCP_MODULE || 'mcp-tblock.js');
const pr = (M.OUTILS || []).find((t) => t.name === 'tblock_plan_roll');
const desc = pr ? String(pr.description) : '';
ok(pr && !/3\/5/.test(desc) && !/fixed prize/i.test(desc), 'tblock_plan_roll : plus de « fixed prize from 3/5 »');
ok(/prizes and the minimum (winning )?score are read live from the (BlockRolls )?contract/i.test(desc) && /UNIT creator/.test(desc) && /tblock_game_state/.test(desc),
  'tblock_plan_roll : gains et score minimum lus sur le contrat (tblock_game_state), changeables par le createur de UNIT');
ok(!/[éèàçù]/.test(desc) && desc.length < 1400, 'description en anglais, bornee (' + desc.length + ' car.)');

console.log('— D. app.html passPaye : le texte avant la signature du pass (EXECUTE, faux DOM)');
class El {
  constructor(tag = 'p') { this.tag = tag; this.hidden = true; this.disabled = false; this.enfants = []; this.className = ''; this.href = ''; this._t = ''; }
  set textContent(t) { this._t = String(t); this.enfants = []; }
  get textContent() { return this._t + this.enfants.map((x) => (typeof x === 'string' ? x : x.textContent)).join(''); }
  append(...xs) { this.enfants.push(...xs); }
}
const pp = APP.slice(APP.indexOf('async function passPaye()'), APP.indexOf("$('#jourRollPaye').addEventListener('click'"));
const avantSigne = async (sParBlocApp) => {
  const e = new El(), b = new El('button');
  const doc = { createElement: (t) => new El(t) };
  let vu = null;
  const envoyerAppels = async () => { vu = { texte: e.textContent, liens: e.enfants.filter((x) => x instanceof El && x.tag === 'a') }; return { etat: 'REFUSE' }; };
  const f = new Function('$', 'compte', 'rollsCfg', 'lirePassSur', 'planPass', 'USDC_BASE', 'lirePotRolls', 'usdcTexte', 'envoyerAppels', 'phraseNonConfirme', 'peindreTirageJourPass', 'FENETRE_ROLLS', 'sParBlocApp', 'texteBlocs', 'document',
    pp + '\nreturn passPaye;');
  const passPaye = f((s) => (s === '#rollsEtat' ? e : s === '#jourPass' ? b : null), W, { contrat: RC, prixPass: '10000000', passRolls: 20 }, async () => ({ ok: true, pass: null }),
    () => ({ etat: 'PRET', appels: [{}, {}] }), USDC, async () => 3000000n, (v) => (Number(v) / 1e6).toFixed(2), envoyerAppels, () => 'No pass bought.', () => {}, FENETRE_ROLLS, sParBlocApp, texteBlocs, doc);
  await passPaye();
  return vu;
};
const v1 = await avantSigne(0.2), v2 = await avantSigne(null);
ok(v1 && /anyone can draw/i.test(v1.texte) && v1.texte.includes('within ' + texteBlocs(FENETRE_ROLLS, 0.2)), 'avant le Sign : la fenetre du tirage (' + texteBlocs(FENETRE_ROLLS, 0.2) + ') et « anyone can draw »');
ok(v1 && /re-armed/.test(v1.texte) && /a buyer/.test(v1.texte), 'avant le Sign : un tirage manque se re-arme, un acheteur peut recommencer');
ok(v1 && v1.liens.length === 1 && v1.liens[0].href === 'frais-et-risques.html' && /Fees & risks/.test(v1.liens[0].textContent), 'avant le Sign : un lien vers Fees & risks (frais-et-risques.html)');
ok(v2 && v2.texte.includes('within ' + FENETRE_ROLLS + ' blocks of its draw block') && !/at the measured block time/.test(v2.texte.slice(v2.texte.indexOf('within ' + FENETRE_ROLLS))), 'temps de bloc non mesure : les blocs seulement, rien d invente');
const phrase = v1 ? (v1.texte.match(/[^.]*anyone can draw[^.]*\./i) || [''])[0] : '';
ok(phrase.length > 0 && phrase.length <= 260 && !/[éèàçù]/.test(phrase), 'une phrase courte (' + phrase.length + ' car.) : « ' + phrase.trim() + ' »');
ok(v1 && /Sign 2 steps in your wallet/.test(v1.texte), 'le texte dit toujours le nombre de signatures (Sign 2 steps)');

console.log('— E. deployer-blockrolls.html');
const DEP = lire(process.env.DEPLOYER_HTML_FILE || 'deployer-blockrolls.html');
const tuile = (DEP.match(/<div class="num">02 · THE WIN<\/div><h3>([^<]*)<\/h3>/) || [])[1];
ok(typeof tuile === 'string' && !/fixed/i.test(tuile) && /prizes/i.test(tuile), 'la tuile 02 · THE WIN : « ' + tuile + ' » (plus « Fixed prizes »)');

console.log(JSON.stringify({ banc: 'duels-gate-fix2', assertions: n, ko }));
process.exitCode = ko ? 1 : 0;
