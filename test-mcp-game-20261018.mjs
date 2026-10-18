/* test-mcp-game-20261018.mjs — LE GAME PAR LE MCP DU BRAIN : 12 outils (7 + 5), lecture seule, appels NON SIGNES, REFUSE sans contrat.
 *
 * A. HORS RESEAU — jeu-agent.js avec un faux rpc : le guess par defaut = SHA-256(wallet|jour) -> apparenceDepuisAdresse -> guessDepuisApparence
 *    (recalcule ICI, a part) et la derivation est celle de app.html (adresseTicket, lue dans la source) ; sans pass : UN approve EXACT de N x prix
 *    + N roll ; avec pass actif : N rollWithPass, aucun approve ; 11 rolls refuses ; guess hors bornes refuse ; SANS CONTRAT : REFUSE, 0 appel ;
 *    settle : settleableUntil lu par roll -> TROP_TOT / REGLABLE / PERDU / PAS_EN_ATTENTE, settleMany sur les REGLABLES seuls ; mission : sans
 *    contrat REFUSE (PAS_OUVERT), cle sur un hook tiers REFUSE, cle sur notre hook -> approve EXACT du budget + postTask ; etat du jeu.
 * B. HORS RESEAU — mcp-tblock.js : tools/list = 12, les 5 du Game en lecture seule ; arguments invalides REFUSES SANS APPELER l outil
 *    (rolls 11 / 0, guess a 4 traits, rollIds non numeriques, wallet tronque) ; un REFUSE est une reponse (isError false).
 * C. SERVEUR (faux noeud local, fiche BlockRolls sans adresse) : tools/call des 5 outils de bout en bout — l etat du jeu se lit, les 3 plans
 *    sont REFUSES avec l etat et AUCUN appel, le tableau est PAS_OUVERT ; GET /api/tirage garde sa forme (meme corps que l outil).
 * ⛔ BORNE : aucun roll reel (contrat non deploye) ; aucune signature ; le banc fork (banc-blockrolls-fork-20261017.mjs) prouve l acceptation.
 * ⛔ PORTABLE : process.exitCode, jamais process.exit. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href + '?v=' + Math.random());
const J = await imp('jeu-agent.js'), M = await imp('mcp-tblock.js'), P = await imp('blockrolls-plan.js');
const { apparenceDepuisAdresse } = await imp('apparence.js');
const { guessDepuisApparence } = await imp('rolls-jeu.js');
const { selecteur } = await imp('keccak.js');
const { HOOK_7030 } = await imp('tokenomics.js');
const { poolId } = await imp('pool.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const A = (h) => '0x' + h.repeat(20);
const W = A('a1'), C = A('cc'), USDC = A('83'), BLOC = '0xb2000000000000000000000d8ce462e99ee7a47b', PM = A('49'), MIS = A('77');
const JOUR = 'J2026-10-18';

console.log('— A. jeu-agent.js (hors reseau)');
/* le guess par defaut, recalcule a part : SHA-256(wallet|jour), 20 octets, apparence, guess */
const adrAttendue = '0x' + createHash('sha256').update(W + '|' + JOUR).digest('hex').slice(0, 40);
const gAttendu = guessDepuisApparence(apparenceDepuisAdresse(adrAttendue));
ok(J.adresseTicket(W, JOUR) === adrAttendue && JSON.stringify(J.guessDuTicket(W, JOUR)) === JSON.stringify(gAttendu) && Array.isArray(gAttendu) && gAttendu.length === 5,
  'guess par defaut = SHA-256(wallet|jour) -> apparenceDepuisAdresse -> guessDepuisApparence (' + gAttendu.join(',') + ')');
ok(J.adresseTicket(W.toUpperCase().replace('0X', '0x'), JOUR) === adrAttendue && J.adresseTicket('0x12', JOUR) === null && J.adresseTicket(W, '2026-10-18') === null, 'wallet en majuscules : meme ticket ; wallet tronque ou jour mal forme : null');
const appHtml = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8');
ok(/crypto\.subtle\.digest\('SHA-256', new TextEncoder\(\)\.encode\(moiBas \+ '\|' \+ jourId\)\)/.test(appHtml) && /\[\.\.\.h\.slice\(0, 20\)\]/.test(appHtml)
  && /const jourDeApp = \(ms\) => 'J' \+ new Date\(Math\.floor\(ms \/ 86400000\) \* 86400000\)\.toISOString\(\)\.slice\(0, 10\);/.test(appHtml),
  'la derivation de l app (adresseTicket : SHA-256(wallet|jour), 20 octets ; jour = J + date UTC) est celle que jeu-agent recalcule');
ok(JSON.stringify(J.lireGuess('0,4,5,7,2')) === '[0,4,5,7,2]' && J.lireGuess('0,4,5,7') === null && J.lireGuess('a,b,c,d,e') === null, 'lireGuess : 5 entiers, sinon null');
/* un faux rpc : pass lu sur le contrat, tete, settleableUntil */
let lectures = 0;
const rpcFaux = ({ pass = [0, 0], tete = 1000, until = {} } = {}) => async (m, p) => {
  lectures += 1;
  if (m === 'eth_blockNumber') return '0x' + tete.toString(16);
  if (m === 'eth_call') {
    const d = String(p[0].data).slice(2, 10);
    if (d === selecteur('passes(address)').slice(2)) return '0x' + mot(pass[0]) + mot(pass[1]);
    if (d === selecteur(P.SIG_SETTLEABLE_UNTIL).slice(2)) { const id = BigInt('0x' + String(p[0].data).slice(10)); return '0x' + mot(until[String(id)] ?? 0); }
    return '0x';
  }
  throw new Error('unexpected ' + m);
};
const base = { rpc: rpcFaux(), contrat: C, usdc: USDC, wallet: W, jourId: JOUR, rollPrice: 500000n, passRolls: 30, maintenant: 1000 };
const r1 = await J.planRollAgent(base);
ok(r1.ok && r1.etat === 'PRET' && r1.voie === 'PAID' && r1.n === 1 && r1.aSigner.length === 2 && r1.guessDefaut === true && JSON.stringify(r1.guess) === JSON.stringify(gAttendu)
  && r1.aSigner[0].to === USDC && r1.aSigner[0].data === '0x095ea7b3' + mot(C) + mot(500000) && r1.aSigner[1].data === selecteur(P.SIG_ROLL) + gAttendu.map(mot).join(''),
  'roll x1 sans pass : approve EXACT 0,50 USDC + roll(guess du ticket), 2 appels');
const r10 = await J.planRollAgent({ ...base, rolls: '10' });
ok(r10.ok && r10.n === 10 && r10.aSigner.length === 11 && r10.prixTotal === '5000000' && r10.aSigner[0].data.endsWith(mot(5000000)) && r10.aSigner.slice(1).every((a) => a.to === C && a.data.startsWith(selecteur(P.SIG_ROLL))),
  'roll x10 : UN approve EXACT de 5 USDC + 10 roll(guess) — 11 appels pour un wallet_sendCalls');
ok((await J.planRollAgent({ ...base, rolls: '11' })).etat === 'REFUSE' && (await J.planRollAgent({ ...base, rolls: 0 })).etat === 'REFUSE' && (await J.planRollAgent({ ...base, rolls: 11 })).aSigner.length === 0, '11 rolls / 0 roll : REFUSE, aucun appel');
const rg = await J.planRollAgent({ ...base, guess: [1, 2, 3, 4, 5], rolls: 2 });
ok(rg.ok && rg.guessDefaut === false && rg.aSigner.length === 3 && rg.aSigner[1].data === selecteur(P.SIG_ROLL) + [1, 2, 3, 4, 5].map(mot).join('') && rg.traits.facet === 3, 'guess explicite : employe tel quel, nomme par trait');
ok((await J.planRollAgent({ ...base, guess: [0, 0, 19, 0, 0] })).etat === 'REFUSE' && /facet/.test((await J.planRollAgent({ ...base, guess: [0, 0, 19, 0, 0] })).pourquoi), 'guess hors bornes : REFUSE, le trait nomme');
const rp = await J.planRollAgent({ ...base, rpc: rpcFaux({ pass: [7, 2000] }), rolls: '5' });
ok(rp.ok && rp.voie === 'PASS' && rp.aSigner.length === 5 && rp.prixTotal === '0' && rp.pass.actif === true && rp.pass.rollsLeft === 7 && rp.aSigner.every((a) => a.data.startsWith(selecteur(P.SIG_ROLL_PASS))),
  'pass ACTIF (7 restants, non expire) : 5 rollWithPass, AUCUN approve, prix 0');
ok((await J.planRollAgent({ ...base, rpc: rpcFaux({ pass: [7, 2000] }), rolls: '8' })).etat === 'REFUSE', 'pass actif, 8 demandes pour 7 restants : tout le lot refuse');
const rpe = await J.planRollAgent({ ...base, rpc: rpcFaux({ pass: [7, 999] }) });
ok(rpe.voie === 'PAID' && rpe.pass.actif === false && rpe.aSigner.length === 2, 'pass EXPIRE : on paie (approve + roll), le pass dit inactif');
lectures = 0;
const rs = await J.planRollAgent({ ...base, contrat: null });
ok(rs.ok === false && rs.etat === 'REFUSE' && rs.jeu === 'PRACTICE' && rs.aSigner.length === 0 && /practice/.test(rs.pourquoi) && lectures === 0, 'SANS CONTRAT : REFUSE avec l etat (PRACTICE), 0 appel, 0 lecture de chaine');
ok((await J.planRollAgent({ ...base, wallet: '0x12' })).etat === 'REFUSE', 'wallet tronque : REFUSE');
/* settle */
const until = { 3: 1002 + 256, 4: 1300 + 256, 5: 500 + 256, 6: 0 };
const st = await J.planSettleAgent({ rpc: rpcFaux({ tete: 1100, until }), contrat: C, rollIds: '3,4,5,6' });
const parId = Object.fromEntries(st.rolls.map((r) => [r.id, r]));
ok(st.ok && st.blocActuel === 1100 && parId[3].etat === 'REGLABLE' && parId[4].etat === 'TROP_TOT' && parId[4].blocsAvant === 201 && parId[5].etat === 'PERDU' && parId[6].etat === 'PAS_EN_ATTENTE'
  && st.reglables.join() === '3' && st.aSigner.length === 1 && st.aSigner[0].data === selecteur(P.SIG_SETTLE_MANY) + mot(32) + mot(1) + mot(3),
  'settle : settleableUntil lu par roll -> REGLABLE / TROP_TOT (201 blocs) / PERDU / PAS_EN_ATTENTE ; settleMany sur le seul REGLABLE');
ok((await J.planSettleAgent({ rpc: rpcFaux({ tete: 1100, until }), contrat: C, rollIds: '4,5' })).etat === 'REFUSE' && (await J.planSettleAgent({ rpc: rpcFaux(), contrat: C, rollIds: 'x' })).etat === 'REFUSE'
  && (await J.planSettleAgent({ rpc: rpcFaux(), contrat: null, rollIds: '3' })).etat === 'REFUSE', 'rien de reglable / ids non numeriques / sans contrat : REFUSE, aucun appel');
ok((await J.planSettleAgent({ rpc: async () => { throw new Error('down'); }, contrat: C, rollIds: '3' })).etat === 'NON_MESURE', 'tete illisible : NON_MESURE (jamais un plan sur une tete inventee)');
/* mission */
const cleN = { currency0: '0x' + '0'.repeat(40), currency1: BLOC, fee: 0, tickSpacing: 200, hooks: HOOK_7030 };
const cleT = { ...cleN, hooks: A('ee') };
/* le contrat exige une recompense >= 1000 unites brutes (refusPoster) : 100 000 x 10 = budget 1 000 000 */
const tk = J.planTaskAgent({ contrat: MIS, block: BLOC, reward: '100000', maxDone: '10', hold: '5', cles: [cleT, cleN], poolManager: PM, maintenant: 1000 });
ok(tk.ok && tk.etat === 'PRET' && tk.budget === '1000000' && tk.aSigner.length === 2 && tk.aSigner[0].to === BLOC && tk.aSigner[0].data === '0x095ea7b3' + mot(MIS) + mot(1000000)
  && tk.aSigner[1].to === MIS && tk.mission.pool === poolId(cleN) && tk.mission.perWallet === 1 && tk.mission.windowS === 86400,
  'mission : approve EXACT du budget (100 000 x 10) au jeton du block + postTask ; pool = celle de NOTRE hook (la cle tierce ignoree)');
ok(/at least 1000/.test(J.planTaskAgent({ contrat: MIS, block: BLOC, reward: '100', maxDone: '10', hold: '5', cles: [cleN], poolManager: PM }).pourquoi), 'reward 100 : REFUSE par la regle du contrat (>= 1000 unites brutes), dite avant la signature');
ok(J.planTaskAgent({ contrat: MIS, block: BLOC, reward: '100000', maxDone: '10', hold: '5', cles: [cleT], poolManager: PM }).etat === 'REFUSE', 'seule une cle sur un hook tiers : REFUSE (une mission nomme une pool de notre hook)');
const tkNo = J.planTaskAgent({ contrat: null, block: BLOC, reward: '100000', maxDone: '10', hold: '5', cles: [cleN], poolManager: PM });
ok(tkNo.etat === 'REFUSE' && tkNo.tableau === 'PAS_OUVERT' && tkNo.aSigner.length === 0, 'sans contrat de missions : REFUSE, tableau PAS_OUVERT, 0 appel');
ok(J.planTaskAgent({ contrat: MIS, block: BLOC, reward: '0', maxDone: '10', hold: '5', cles: [cleN], poolManager: PM }).etat === 'REFUSE'
  && J.planTaskAgent({ contrat: MIS, block: BLOC, reward: '100000', maxDone: '10001', hold: '5', cles: [cleN], poolManager: PM }).etat === 'REFUSE', 'reward 0 / 10001 joueurs : REFUSE');
/* etat du jeu */
const tirage = { ok: true, mode: 'SHADOW', pot: 0, seuilVolumeUsd: 10, rolls: { contrat: null, prixRoll: '500000', prixPass: '10000000', passRolls: 30, prizes: ['5000000', '5000000', '5000000'], minScore: 3 },
  apercu: { bloc: 5, hash: '0x' + 'ab'.repeat(32) }, veille: { id: 'J2026-10-17', etat: 'EN_ATTENTE', blocE: null, gagnant: null, tickets: [] },
  jour: { id: JOUR, fin: '2026-10-19T00:00:00.000Z', tickets: [W], wallets: [{ adresse: W, volumeUsd: 12.5, ticket: true }], passes: [] }, semaine: { entrees: [{ adresse: W, jour: JOUR }] }, mois: { entrees: [{ adresse: W, jour: JOUR }, { adresse: W, jour: 'J2026-10-11' }] } };
const ej = J.etatJeuAgent({ tirage, wallet: W, rollsRecents: [{ t: 1, bloc: 9, score: 3 }], pot: null });
ok(ej.ok && ej.jour.tickets === 1 && ej.rolls.jeu === 'PRACTICE' && ej.rolls.rollsMax === 10 && ej.moi.ticket === true && ej.moi.volumeUsd === 12.5 && JSON.stringify(ej.moi.guess) === JSON.stringify(gAttendu)
  && ej.moi.entreesSemaine === 1 && ej.moi.entreesMois === 2 && ej.rollsRecents.length === 1 && ej.apercu.bloc === 5, 'etat du jeu : tickets, mode PRACTICE, mon ticket (volume, guess, entrees), rolls recents');
ok(J.etatJeuAgent({ tirage }).moi === null && J.etatJeuAgent({ tirage: null }).etat === 'NON_MESURE' && J.etatJeuAgent({ tirage: { ...tirage, rolls: { ...tirage.rolls, contrat: C } }, pot: 123n }).rolls.pot === '123',
  'sans wallet : moi = null ; tirage illisible : NON_MESURE ; contrat servi : PAID avec le pot lu');

console.log('— B. le protocole (hors reseau)');
let appels = 0;
const deps = { version: 'test', outils: Object.fromEntries(['tblock_game_state', 'tblock_plan_roll', 'tblock_plan_settle', 'tblock_plan_task', 'tblock_missions'].map((k) => [k, async (a) => { appels += 1; return { ok: true, etat: 'PRET', vu: a }; }])) };
const rq = (method, params, id = 1) => M.traiterMcp({ jsonrpc: '2.0', id, method, params }, deps);
const tl = (await rq('tools/list')).result.tools;
const jeu = tl.filter((t) => ['tblock_game_state', 'tblock_plan_roll', 'tblock_plan_settle', 'tblock_plan_task', 'tblock_missions'].includes(t.name));
ok(tl.length === 12 && jeu.length === 5 && jeu.every((t) => t.annotations.readOnlyHint === true && t.description && t.inputSchema.type === 'object'), 'tools/list : 12 outils, les 5 du Game en lecture seule');
ok(/0\.50 USDC/.test(tl.find((t) => t.name === 'tblock_plan_roll').description) && /10/.test(tl.find((t) => t.name === 'tblock_plan_roll').inputSchema.properties.rolls.pattern) && /0\.50 USDC a roll, up to 10/.test(M.MCP_INSTRUCTIONS),
  'la doc exposee dit 0,50 USDC par roll et 10 au plus (description, schema, instructions)');
ok(!tl.some((t) => /^tblock_(send|sign|transfer|roll_now|settle_now)/.test(t.name)), 'il n existe toujours AUCUN outil qui envoie ou signe');
appels = 0;
for (const [nom, args, quoi] of [['tblock_plan_roll', { wallet: W, rolls: '11' }, 'rolls 11'], ['tblock_plan_roll', { wallet: W, rolls: '0' }, 'rolls 0'], ['tblock_plan_roll', { wallet: W, guess: '0,0,0,0' }, 'guess a 4 traits'],
  ['tblock_plan_roll', { wallet: '0x12' }, 'wallet tronque'], ['tblock_plan_roll', {}, 'wallet manquant'], ['tblock_plan_settle', { rollIds: 'a' }, 'rollIds non numeriques'], ['tblock_plan_settle', {}, 'rollIds manquant'],
  ['tblock_plan_task', { block: BLOC, reward: '0', maxDone: '1', hold: '1' }, 'reward 0'], ['tblock_plan_task', { block: BLOC, reward: '1', maxDone: '100000', hold: '1' }, 'maxDone 100000'], ['tblock_game_state', { wallet: 'moi' }, 'wallet non adresse'], ['tblock_missions', { x: '1' }, 'argument inconnu']]) {
  const r = await rq('tools/call', { name: nom, arguments: args });
  ok(r.result && r.result.isError === true && r.result.structuredContent.etat === 'REFUSE', nom + ' (' + quoi + ') : refuse par le schema — ' + r.result.structuredContent.pourquoi);
}
ok(appels === 0, 'TEMOIN : aucun de ces refus n a appele l outil (' + appels + ')');
const bon = await rq('tools/call', { name: 'tblock_plan_roll', arguments: { wallet: W, rolls: '10', guess: '0,4,5,7,2' } });
ok(bon.result.isError === false && bon.result.structuredContent.vu.rolls === '10' && appels === 1, 'arguments valides (rolls 10, guess 5 traits) : l outil est appele');
ok((await rq('tools/call', { name: 'tblock_game_state', arguments: {} })).result.isError === false && (await rq('tools/call', { name: 'tblock_missions', arguments: {} })).result.isError === false, 'tblock_game_state / tblock_missions sans argument : appeles');

console.log('— C. serveur, faux noeud local');
const noeud = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let id = 1, m = ''; try { const j = JSON.parse(b); id = j.id; m = j.method; } catch (_) {}
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result: m === 'eth_blockNumber' ? '0x100000' : m === 'eth_getLogs' ? [] : m === 'eth_getBlockByNumber' ? { number: '0x100000', hash: '0x' + 'ab'.repeat(32), timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16) } : '0x' + '0'.repeat(64) }));
  });
});
await new Promise((o) => noeud.listen(0, '127.0.0.1', o));
const u = 'http://127.0.0.1:' + noeud.address().port;
const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-mcp-game-'));
/* 30000..44999 : hors des plages EXCLUES de Windows (netsh excludedportrange : 26367-26991, 27426-27525, 50000-50059) — un port tire dedans
 *   fait EACCES au listen, un faux rouge (mesure 2026-10-18 avec le tirage 20000..39999 de test-mcp-naissance) */
const port = 30000 + Math.floor(Math.random() * 15000);
const enfant = spawn(process.execPath, [path.join(ICI, 'serveur-web.js')], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: u, BASE_RPC_LECTURE: u, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '', TB_REPLIS: '0' } });
let stderr = ''; enfant.stdout.on('data', () => {}); enfant.stderr.on('data', (c) => { stderr += c; });
const srv = 'http://127.0.0.1:' + port;
const mcp = async (name, args) => {
  const r = await fetch(srv + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'x-ms-monitor': '1' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }), signal: AbortSignal.timeout(60000) });
  return (await r.json()).result;
};
let demarre = false;
for (let i = 0; i < 120 && !demarre; i += 1) { try { demarre = (await fetch(srv + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await new Promise((o) => setTimeout(o, 500)); } }
ok(demarre, 'serveur demarre (port ' + port + ')' + (demarre ? '' : ' — ' + stderr.slice(0, 300)));
if (demarre) {
  const { BLOCKROLLS_DEPLOIEMENT } = await imp('blockrolls-deploiement.js');
  const { MISSIONS_DEPLOIEMENT } = await imp('missions-deploiement.js');
  const tir = await (await fetch(srv + '/api/tirage')).json();
  ok(tir.ok === true && tir.jour && Array.isArray(tir.jour.tickets) && tir.rolls && 'contrat' in tir.rolls && tir.semaine && tir.mois && typeof tir.regle === 'string', 'GET /api/tirage garde sa forme (ok, jour.tickets, rolls.contrat, semaine, mois, regle)');
  const gs = await mcp('tblock_game_state', {});
  const sc = gs.structuredContent;
  ok(gs.isError === false && sc.etat === 'PRET' && sc.jour.id === tir.jour.id && sc.jour.tickets === tir.jour.tickets.length && sc.rolls.contrat === tir.rolls.contrat && Array.isArray(sc.rollsRecents) && sc.moi === null,
    'tblock_game_state : le MEME corps que /api/tirage (jour, tickets, contrat ' + String(sc.rolls.contrat) + '), rolls recents, moi = null sans wallet');
  const gw = (await mcp('tblock_game_state', { wallet: W })).structuredContent;
  ok(gw.moi && gw.moi.wallet === W && gw.moi.ticket === false && Array.isArray(gw.moi.guess) && gw.moi.guess.length === 5, 'tblock_game_state avec wallet : ticket (absent), guess du ticket du jour en 5 traits');
  if (BLOCKROLLS_DEPLOIEMENT.adresse) ok(true, '(fiche BlockRolls SIGNEE : les refus « sans contrat » ne s appliquent plus — ' + BLOCKROLLS_DEPLOIEMENT.adresse + ')');
  else {
    const pr = await mcp('tblock_plan_roll', { wallet: W, rolls: '10' });
    ok(pr.isError === false && pr.structuredContent.etat === 'REFUSE' && pr.structuredContent.jeu === 'PRACTICE' && pr.structuredContent.aSigner.length === 0, 'tblock_plan_roll sans contrat servi : REFUSE (PRACTICE), AUCUN appel — isError false (une reponse)');
    const ps = await mcp('tblock_plan_settle', { rollIds: '1,2' });
    ok(ps.isError === false && ps.structuredContent.etat === 'REFUSE' && ps.structuredContent.aSigner.length === 0, 'tblock_plan_settle sans contrat servi : REFUSE, AUCUN appel');
  }
  if (MISSIONS_DEPLOIEMENT.adresse) ok(true, '(tableau des missions DEPLOYE : PAS_OUVERT ne s applique plus)');
  else {
    const pt = await mcp('tblock_plan_task', { block: BLOC, reward: '100', maxDone: '10', hold: '5' });
    ok(pt.isError === false && pt.structuredContent.etat === 'REFUSE' && pt.structuredContent.tableau === 'PAS_OUVERT' && pt.structuredContent.aSigner.length === 0, 'tblock_plan_task sans contrat : REFUSE, PAS_OUVERT, AUCUN appel');
    const tm = await mcp('tblock_missions', {});
    ok(tm.isError === false && tm.structuredContent.etat === 'REFUSE' && tm.structuredContent.tableau === 'PAS_OUVERT', 'tblock_missions sans contrat : REFUSE, PAS_OUVERT (comme /api/missions)');
  }
  ok((await (await fetch(srv + '/jeu-agent.js')).text()).length > 0 && (await fetch(srv + '/jeu-agent.js')).status === 404, 'jeu-agent.js est un module SERVEUR : non servi (404) — rien a ajouter a SERVIS');
}
enfant.kill(); noeud.close();
try { fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {}
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
