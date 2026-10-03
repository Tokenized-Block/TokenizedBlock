/* test-mcp-naissance-20261004.mjs — LE MCP, LA NAISSANCE PLANIFIEE POUR UN AGENT, ET LA SORTIE DU MINIMUM DU CREATEUR.
 *
 * A. HORS RESEAU — mcp-tblock.js (le protocole) : initialize negocie la version, 4 outils avec schema, notification sans reponse,
 *    lot refuse, methode / outil inconnus, arguments invalides REFUSES SANS APPELER l outil, REFUSE = une reponse (isError false),
 *    NON_MESURE et « occupe » = isError true.
 * B. HORS RESEAU — naissance-api.js : les refus AVANT toute lecture (0 lecture, compte), la liste des paires, l URI gravee porte
 *    le marqueur que le hook relit ; caution-createur.js : selecteurs par keccak, encodage, phases (ACTIF, SORTIE_DEMANDEE,
 *    RETIRABLE, RETIRE, SOUS_LE_MINIMUM, AUCUN, NON_MESURE), qui peut signer quoi.
 * C. SERVEUR (faux noeud local) : POST /mcp de bout en bout (initialize, tools/list, tools/call), GET 405, OPTIONS + CORS,
 *    notification 202, JSON casse 400 ; /api/naissance/* ; /sante porte la sonde. Un noeud muet ne produit JAMAIS un plan.
 * D. TEMOIN MAINNET (lecture seule) : une naissance ETH planifiee et SIMULEE contre le hook deploye = PRET, 5 appels dans l ordre,
 *    0,001 ETH de frais exactement, inscription a 4 arguments ; wallet vide = REFUSE « fonds manquants » avec le plan ; MUTANT : un
 *    createPaid a 0,001 (donc 0,0013 de frais) est REFUSE par la regle absolue.
 * ⛔ BORNE : D prouve le plan et sa simulation au bloc lu, pas une execution (banc-naissance-7030-fork-20261003.mjs). Aucun envoi.
 * ⛔ PORTABLE : process.exitCode, jamais process.exit. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
const M = await imp('mcp-tblock.js'), N = await imp('naissance-api.js'), C = await imp('caution-createur.js');
const { selecteur, poolId } = await imp('pool.js');
const F = await imp('frais-creation.js'), T = await imp('tokenomics.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const VIDE = '0x00000000000000000000000000000000c0ffee77', ETH = '0x' + '0'.repeat(40);

console.log('— A. le protocole (hors reseau)');
let appelsOutil = 0;
const deps = { version: 'test', outils: {
  tblock_pairs: async () => ({ ok: true, etat: 'PRET', paires: [] }),
  tblock_plan_birth: async (a) => { appelsOutil += 1; return a.name === 'refus' ? { ok: false, etat: 'REFUSE', pourquoi: 'no' } : a.name === 'muet' ? { ok: false, etat: 'NON_MESURE', pourquoi: 'x' } : { ok: true, etat: 'PRET', vu: a }; },
  tblock_plan_swap: async () => { const e = new Error('busy'); e.occupe = true; throw e; },
  tblock_creator_minimum: async () => { throw new Error('boom'); } } };
const rq = (method, params, id = 1) => M.traiterMcp({ jsonrpc: '2.0', id, method, params }, deps);
const ini = await rq('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } });
ok(ini.result.protocolVersion === '2025-03-26' && ini.result.capabilities.tools && ini.result.serverInfo.name === 'tokenizedblock' && /UNSIGNED/.test(ini.result.instructions),
  'initialize : rend la version demandee quand il la connait, annonce les outils, et dit « UNSIGNED »');
ok((await rq('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion === M.MCP_VERSIONS[0], 'version inconnue : il rend la sienne (' + M.MCP_VERSIONS[0] + ')');
const tl = await rq('tools/list');
ok(tl.result.tools.length === 4 && tl.result.tools.every((o) => o.name && o.description && o.inputSchema && o.inputSchema.type === 'object' && o.annotations.readOnlyHint === true),
  'tools/list : 4 outils, chacun decrit, schema objet, annonce en lecture seule — ' + tl.result.tools.map((o) => o.name).join(' '));
ok(await M.traiterMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps) === null, 'une notification ne recoit rien');
ok((await M.traiterMcp([{ jsonrpc: '2.0', id: 1, method: 'ping' }], deps)).error.code === -32600, 'un lot est refuse (-32600)');
ok((await M.traiterMcp({ id: 1, method: 'ping' }, deps)).error.code === -32600 && JSON.stringify((await rq('ping')).result) === '{}', 'pas du JSON-RPC 2.0 : -32600 ; ping : {}');
ok((await rq('resources/list')).error.code === -32601, 'methode inconnue : -32601');
ok((await rq('tools/call', { name: 'tblock_send', arguments: {} })).error.code === -32602, 'outil inconnu : -32602 (il n existe AUCUN outil qui envoie)');
const bon = await rq('tools/call', { name: 'tblock_plan_birth', arguments: { name: 'A', symbol: 'a', account: VIDE } });
ok(bon.result.isError === false && bon.result.structuredContent.etat === 'PRET' && JSON.parse(bon.result.content[0].text).etat === 'PRET' && appelsOutil === 1,
  'appel valide : le corps en structuredContent ET en texte, isError false');
appelsOutil = 0;
for (const [args, quoi] of [[{ name: 'A', symbol: 'a' }, 'account manquant'], [{ name: 'A', symbol: 'a', account: '0x1234' }, 'adresse tronquee'],
  [{ name: 'A', symbol: 'a', account: VIDE, extra: 'x' }, 'argument inconnu'], [{ name: 'A', symbol: 'a', account: VIDE, pair: 'usdc' }, 'paire qui n est ni ETH ni une adresse'],
  [{ name: 'x'.repeat(33), symbol: 'a', account: VIDE }, 'nom de 33 caracteres'], [{ name: 5, symbol: 'a', account: VIDE }, 'nom non texte'], ['oops', 'arguments non objet']]) {
  const r = await rq('tools/call', { name: 'tblock_plan_birth', arguments: args });
  ok(r.result && r.result.isError === true && r.result.structuredContent.etat === 'REFUSE', 'arguments invalides (' + quoi + ') : refuse, isError true — ' + r.result.structuredContent.pourquoi);
}
ok(appelsOutil === 0, 'TEMOIN : aucun de ces refus n a appele l outil (' + appelsOutil + ')');
ok((await rq('tools/call', { name: 'tblock_plan_swap', arguments: { from: 'ETH', to: VIDE, amount: '0', account: VIDE } })).result.isError === true, 'montant 0 : refuse par le schema');
const ref = await rq('tools/call', { name: 'tblock_plan_birth', arguments: { name: 'refus', symbol: 'a', account: VIDE } });
ok(ref.result.isError === false && ref.result.structuredContent.etat === 'REFUSE', 'un REFUSE du planificateur est une REPONSE : isError false, la raison lisible');
ok((await rq('tools/call', { name: 'tblock_plan_birth', arguments: { name: 'muet', symbol: 'a', account: VIDE } })).result.isError === true, 'NON_MESURE : isError true');
const occ = await rq('tools/call', { name: 'tblock_plan_swap', arguments: { from: 'ETH', to: VIDE, amount: '1', account: VIDE } });
ok(occ.result.isError === true && /busy/.test(occ.result.structuredContent.pourquoi), 'budget depasse : isError true, « busy »');
const boom = await rq('tools/call', { name: 'tblock_creator_minimum', arguments: { block: VIDE } });
ok(boom.result.isError === true && boom.result.structuredContent.etat === 'NON_MESURE', 'un outil qui leve : NON_MESURE, jamais une exception JSON-RPC');

console.log('— B. naissance-api + caution-createur (hors reseau)');
let lectures = 0;
const sansReseau = async () => { lectures += 1; throw new Error('no network in part B'); };
const pn = (q) => N.planNaissance({ nom: 'Bloc', symbole: 'blc', compte: VIDE, sel: 's', ...q }, { rpc: sansReseau, prixUsd: sansReseau });
for (const [q, motif] of [[{ nom: '' }, /needs a name/], [{ symbole: ' ' }, /needs a symbol/], [{ nom: 'é'.repeat(17) }, /over 32 bytes/], [{ compte: '0x12' }, /whole address/],
  [{ compte: F.FEE_WALLET }, /fee wallet cannot/], [{ paire: 'usdc' }, /ETH or the whole address/], [{ paire: '0x' + '7'.repeat(40) }, /not offered at creation/], [{ sel: 'x'.repeat(65) }, /salt is over/]]) {
  const r = await pn(q);
  ok(r.etat === 'REFUSE' && motif.test(r.pourquoi) && r.aSigner.length === 0, 'refus avant lecture : ' + r.pourquoi);
}
ok((await N.planNaissance({ nom: 'B', symbole: 'b', compte: VIDE }, { rpc: sansReseau, prixUsd: sansReseau })).etat === 'REFUSE', 'sans sel et sans generateur : refuse');
ok(lectures === 0, 'TEMOIN : aucun de ces refus n a touche le reseau (' + lectures + ' lecture)');
const sourd = await N.planNaissance({ nom: 'B', symbole: 'b', compte: VIDE, sel: 's' }, { rpc: sansReseau, prixUsd: sansReseau });
ok(sourd.etat === 'NON_MESURE' && sourd.aSigner.length === 0, 'reseau muet : NON_MESURE, aucun appel rendu (jamais un plan invente)');
const paires = N.pairesDeNaissance();
ok(paires[0].adr === ETH && paires[0].symbole === 'ETH' && paires.length === 63 && paires.filter((p) => p.type === 'ACTION').length === 58 && new Set(paires.map((p) => p.adr)).size === 63,
  'paires de naissance : ETH en tete, 63 sans doublon, dont 58 actions');
const uri = N.uriNaissance({ nom: 'Bloc', symbole: 'BLC', adresse: '0xb2' + '0'.repeat(30) + 'abcdef12', paire: paires[1] });
ok(uri.startsWith('data:application/json,') && uri.includes('%22face%22%3A%7B') && new TextEncoder().encode(uri).length <= N.URI_MAX_OCTETS && /face%2F0xb2/.test(uri),
  'URI gravee : JSON encode, porte le marqueur du hook (%22face%22%3A%7B), image = notre /face/<adresse>.png, ' + new TextEncoder().encode(uri).length + ' octets');
/* caution-createur */
const H = T.HOOK_7030, BLOC = '0xb2000000000000000000000000000000000000aa';
const cle = C.cleMarcheCreateur({ bloc: BLOC, devise: ETH, hook: H });
ok(cle.currency0 === ETH && cle.currency1 === BLOC && cle.fee === 0 && cle.tickSpacing === 200 && cle.hooks === H, 'cle du marche : devise/block tries, frais 0, espacement 200, hooks = le hook');
const aD = C.appelDemanderRetrait({ hook: H, cle }), aR = C.appelRetirerCaution({ hook: H, cle });
ok(aD.data.startsWith('0x' + selecteur(C.SIG_DEMANDER_RETRAIT)) && aR.data.startsWith('0x' + selecteur(C.SIG_RETIRER_CAUTION)) && aD.data.length === 10 + 5 * 64 && aD.value === '0x0' && aD.to === H
  && aD.data.slice(10) === aR.data.slice(10) && aD.data.slice(10 + 64 + 24, 10 + 128) === BLOC.slice(2), 'appels de sortie : selecteur par keccak + les 5 mots de la cle, valeur 0, vers le hook');
const MOI = '0x' + 'a1'.repeat(20);
const hookFaux = ({ qui = MOI, retraitDes = 0, depose = 500n, minimum = 500n, casse = false } = {}) => async (m, p) => {
  if (casse) throw new Error('rpc down');
  const d = p[0].data.slice(2, 10);
  if (d === selecteur('createurs(bytes32)')) return '0x' + w(BigInt(qui)) + w(retraitDes) + w(1);
  if (d === selecteur('caution(bytes32)')) return '0x' + w(depose);
  if (d === selecteur('minimumCaution(bytes32)')) return '0x' + w(minimum);
  if (d === selecteur('DELAI_RETRAIT()')) return '0x' + w(604800);
  return '0x';
};
const lireEtat = (o, t = 1000) => C.etatCautionCreateur({ rpc: hookFaux(o), hook: H, cle, maintenantSec: t });
const actif = await lireEtat();
ok(actif.etat === 'LUE' && actif.phase === 'ACTIF' && actif.partActive === true && actif.createur === MOI && actif.delaiSec === 604800, 'depose >= minimum, aucune demande : ACTIF, la part coule');
const dem = await lireEtat({ retraitDes: 5000 }, 1000);
ok(dem.phase === 'SORTIE_DEMANDEE' && dem.partActive === false && dem.secondesRestantes === 4000, 'demande posee, echeance future : SORTIE_DEMANDEE, part ARRETEE, 4000 s restantes');
const pret = await lireEtat({ retraitDes: 5000 }, 5000);
ok(pret.phase === 'RETIRABLE' && pret.secondesRestantes === 0, 'a l echeance exacte : RETIRABLE (le contrat compare block.timestamp < retraitDes)');
ok((await lireEtat({ retraitDes: 5000, depose: 0n }, 9000)).phase === 'RETIRE', 'depot a 0 apres une demande : RETIRE');
const sous = await lireEtat({ depose: 499n });
ok(sous.phase === 'SOUS_LE_MINIMUM' && sous.partActive === false, 'depot sous le minimum : la part ne coule pas');
ok((await lireEtat({ qui: ETH })).etat === 'AUCUN' && (await lireEtat({ casse: true })).etat === 'NON_MESURE', 'aucun createur : AUCUN ; lecture ratee : NON_MESURE (jamais « rien a reprendre »)');
const sD = C.sortieCautionPour({ etat: actif, compte: MOI.toUpperCase().replace('0X', '0x'), hook: H, cle });
ok(sD.etape === 'DEMANDER' && sD.appel.data === aD.data, 'le createur, phase ACTIF : l appel est demanderRetrait');
ok(C.sortieCautionPour({ etat: pret, compte: MOI, hook: H, cle }).appel.data === aR.data, 'le createur, phase RETIRABLE : l appel est retirerCaution');
ok(C.sortieCautionPour({ etat: actif, compte: VIDE, hook: H, cle }).appel === null && C.sortieCautionPour({ etat: dem, compte: MOI, hook: H, cle }).appel === null,
  'un autre wallet : aucun appel ; pendant l attente : aucun appel (RetraitPasPret evite)');

console.log('— C. serveur, faux noeud local');
const noeud = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let id = 1, m = ''; try { const j = JSON.parse(b); id = j.id; m = j.method; } catch (_) {}
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result: m === 'eth_blockNumber' ? '0x100000' : m === 'eth_getLogs' ? [] : '0x' + '0'.repeat(64) }));
  });
});
await new Promise((o) => noeud.listen(0, '127.0.0.1', o));
const u = 'http://127.0.0.1:' + noeud.address().port;
const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-mcp-vol-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const enfant = spawn(process.execPath, [path.join(ICI, 'serveur-web.js')], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: u, BASE_RPC_LECTURE: u, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '' } });
let stderr = ''; enfant.stdout.on('data', () => {}); enfant.stderr.on('data', (c) => { stderr += c; });
const base = 'http://127.0.0.1:' + port;
const mcp = async (corps, init = {}) => {
  const r = await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-ms-monitor': '1', ...(init.headers || {}) },
    body: typeof corps === 'string' ? corps : JSON.stringify(corps), signal: AbortSignal.timeout(90000) });
  return { code: r.status, cors: r.headers.get('access-control-allow-origin'), type: r.headers.get('content-type'), corps: await r.json().catch(() => null) };
};
let demarre = false;
for (let i = 0; i < 120 && !demarre; i += 1) { try { demarre = (await fetch(base + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await new Promise((o) => setTimeout(o, 500)); } }
ok(demarre, 'serveur demarre (port ' + port + ')' + (demarre ? '' : ' — ' + stderr.slice(0, 300)));
if (demarre) {
  const i1 = await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'banc', version: '1' } } });
  ok(i1.code === 200 && /application\/json/.test(i1.type) && i1.cors === '*' && i1.corps.result.serverInfo.name === 'tokenizedblock' && i1.corps.result.protocolVersion === '2025-06-18',
    'POST /mcp initialize : 200 JSON, CORS ouvert, serverInfo tokenizedblock');
  const n1 = await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  ok(n1.status === 202 && (await n1.text()) === '', 'notification : 202, corps vide');
  ok((await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).corps.result.tools.length === 4, 'tools/list par HTTP : 4 outils');
  const g = await fetch(base + '/mcp'); const o = await fetch(base + '/mcp', { method: 'OPTIONS' });
  ok(g.status === 405 && /POST/.test(g.headers.get('allow') || '') && o.status === 204 && /POST/.test(o.headers.get('access-control-allow-methods') || ''), 'GET /mcp : 405 (pas de flux) ; OPTIONS : 204 + methodes CORS');
  ok((await mcp('{pas du json')).code === 400, 'JSON casse : 400, erreur de parse');
  const tp = await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'tblock_pairs', arguments: {} } });
  ok(tp.corps.result.isError === false && tp.corps.result.structuredContent.paires.length === 63 && tp.corps.result.structuredContent.frais.naissanceEthWei === '1000000000000000'
    && tp.corps.result.structuredContent.paires.every((p) => /^[0-9]+$/.test(p.plancherMinimumCreateur)), 'tools/call tblock_pairs : 63 devises, chacune avec son plancher, frais 0,001 ETH');
  const tb = await mcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'tblock_plan_birth', arguments: { name: 'Banc', symbol: 'bnc', account: VIDE } } });
  ok(tb.corps.result.structuredContent.ok === false && tb.corps.result.structuredContent.aSigner.length === 0 && tb.corps.result.structuredContent.etat !== 'PRET',
    'tools/call tblock_plan_birth sur un noeud vide : ' + tb.corps.result.structuredContent.etat + ', AUCUN appel rendu (jamais un plan invente)');
  const us = await fetch(base + '/api/naissance/plan'); const usJ = await us.json();
  ok(us.status === 400 && /usage/.test(usJ.pourquoi), '/api/naissance/plan sans parametres : 400 et l usage');
  ok((await fetch(base + '/api/naissance/plan?nom=a&symbole=b&compte=' + VIDE, { method: 'POST' })).status === 405, '/api/naissance/plan en POST : 405');
  const pa = await (await fetch(base + '/api/naissance/paires')).json();
  ok(pa.ok === true && pa.paires.length === 63, '/api/naissance/paires : 63');
  ok((await fetch(base + '/api/caution?block=0x12')).status === 400, '/api/caution adresse tronquee : 400');
  const sante = await (await fetch(base + '/sante')).json();
  ok(sante.naissance && sante.naissance.sonde && typeof sante.naissance.sonde.etat === 'string' && sante.naissance.mcp >= 5, '/sante porte la sonde de naissance et le compteur MCP (' + JSON.stringify(sante.naissance).slice(0, 110) + ')');
}
enfant.kill(); noeud.close();
try { fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {}

console.log('— D. temoin mainnet (lecture seule)');
const URLS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.drpc.org'];
let idR = 0;
const rpc = async (method, params) => {
  let d = new Error('no endpoint');
  for (let e = 0; e < 9; e += 1) {
    try {
      const j = await fetch(URLS[e % 3], { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++idR, method, params }) }).then((x) => x.json());
      if (j.result !== undefined && !j.error) return j.result;
      d = new Error(j.error ? j.error.message : 'no result');
      if (j.error && !/rate|limit|busy|capacity|timeout/i.test(j.error.message)) throw d;
    } catch (x) { d = x; if (!/rate|limit|fetch|timeout|abort|busy|capacity/i.test(String(x.message))) throw x; }
    await new Promise((o) => setTimeout(o, 500 * (e + 1)));
  }
  throw d;
};
const { prixEthUsd } = await imp('prix-eth.js');
const { V4_ADRESSES } = await imp('lancer-pool.js');
const prixUsd = async (adr) => { if (adr !== null) return null; const r = await prixEthUsd({ rpc, stateView: V4_ADRESSES[8453].stateView }); return r.etat === 'LU' ? r.usd : null; };
const selD = 'temoin-' + Date.now();
try {
  const p = await N.planNaissance({ nom: 'Temoin', symbole: 'tmn', compte: VIDE, sel: selD }, { rpc, prixUsd, soldeSuppose: 10n ** 17n });
  ok(p.etat === 'PRET' && p.simulation.etat === 'ACCEPTE', 'naissance ETH, solde suppose : PRET — la sequence entiere est ACCEPTEE par la chaine contre le hook deploye (' + (p.pourquoi || 'ok') + ')');
  const roles = (p.aSigner || []).map((c) => c.role).join(',');
  ok(roles === 'create,approve,approve,birth,open', 'ordre des appels : ' + roles);
  ok(p.cout && p.cout.fraisEthWei === '1000000000000000' && p.cout.creationWei === '700000000000000' && p.cout.inscriptionWei === '300000000000000', 'REGLE ABSOLUE : frais = 0,001 ETH exactement (0,0007 + 0,0003)');
  const birth = (p.aSigner || []).find((c) => c.role === 'birth') || { data: '', value: '0x0' };
  ok(birth.data.startsWith('0x8beeda0f') && birth.data.slice(-64) === p.block.sel.slice(2) && bas(birth.to) === bas(T.HOOK_7030), 'inscription : la surcharge a 4 arguments, le sel du block en dernier mot, vers le hook 7030');
  ok(BigInt(birth.value) === 300000000000000n + BigInt(p.cout.minimumCreateur.montant) && p.cout.minimumCreateur.symbole === 'ETH', 'valeur de l inscription = 0,0003 ETH + le minimum du createur (' + p.cout.minimumCreateur.montant + ' wei)');
  ok(BigInt(p.cout.totalEthWei) === (p.aSigner || []).reduce((a, c) => a + BigInt(c.value), 0n), 'cout.totalEthWei = la somme des valeurs des appels (' + p.cout.totalEthWei + ' wei)');
  const vide = await N.planNaissance({ nom: 'Temoin', symbole: 'tmn', compte: VIDE, sel: selD }, { rpc, prixUsd });
  ok(vide.etat === 'REFUSE' && vide.fondsManquants === true && vide.aSigner.length === 5 && /does not hold enough ETH/.test(vide.pourquoi), 'TEMOIN wallet vide : REFUSE, « fonds manquants », le plan sain est rendu pour etre finance');
  const stock = N.pairesDeNaissance().find((x) => x.symbole === 'AMDc');
  const sansPrix = await N.planNaissance({ nom: 'Temoin', symbole: 'tmn', compte: VIDE, sel: selD, paire: stock.adr }, { rpc, prixUsd });
  ok(sansPrix.etat === 'NON_MESURE' && sansPrix.aSigner.length === 0 && /price of AMDc/.test(sansPrix.pourquoi), 'TEMOIN prix d une action non lu : NON_MESURE, aucun minimum invente');
  /* MUTANT : createPaid a 0,001 -> 0,0013 de frais : la regle absolue doit refuser */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-mut-'));
  for (const f of fs.readdirSync(ICI).filter((x) => x.endsWith('.js'))) fs.copyFileSync(path.join(ICI, f), path.join(tmp, f));
  const src = fs.readFileSync(path.join(tmp, 'naissance-api.js'), 'utf8').replace(/\r\n/g, '\n');
  const de = 'const valeurCreate = FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR;';
  ok(src.split(de).length === 2, 'mutant : motif trouve une fois');
  fs.writeFileSync(path.join(tmp, 'naissance-api.js'), src.replace(de, 'const valeurCreate = FRAIS_OUVERTURE_WEI;'));
  const NM = await imp('naissance-api.js', tmp);
  const pm = await NM.planNaissance({ nom: 'Temoin', symbole: 'tmn', compte: VIDE, sel: selD }, { rpc, prixUsd, soldeSuppose: 10n ** 17n });
  ok(pm.etat !== 'PRET' && pm.aSigner.length === 0, 'MUTANT createPaid a 0,001 ETH : ' + pm.etat + ' — ' + pm.pourquoi);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  const cleT = C.cleMarcheCreateur({ bloc: p.block.adresse, devise: ETH, hook: T.HOOK_7030 });
  const et = await C.etatCautionCreateur({ rpc, hook: T.HOOK_7030, cle: cleT });
  ok(et.etat === 'AUCUN' && poolId(cleT).length === 66, 'hook reel, marche qui n existe pas : AUCUN minimum depose (lecture reelle des 4 champs)');
} catch (e) { ok(false, 'D a plante — NON MESURE : ' + String(e && e.message).slice(0, 160)); }
function bas(a) { return String(a || '').toLowerCase(); }

console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
