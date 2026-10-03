/* test-panel-sessions-20261004.mjs — LA TELECOMMANDE : un agent PROPOSE, le panneau lit, rend compte, et rien d autre.
 * A. forme des commandes : chaque type accepte/refuse, champs inconnus refuses, texte borne et nettoye (controle, bidi), montants
 *    en unites brutes, adresses entieres. La liste des taches = le catalogue du cerveau (brain-tasks.js), a l identique.
 * B. le registre : ouvrir / proposer / lire / rendre compte, numeros croissants, une commande par seconde, session inconnue,
 *    expiration a 2 h, plafonds (500 sessions, 100 commandes gardees), « panneau ouvert » seulement si le panneau a lu < 15 s.
 * C. MUTANTS : champ inconnu accepte, cadence retiree, expiration retiree, texte non nettoye — chacun doit rougir.
 * D. SERVEUR (faux noeud) : les 5 routes en POST JSON, GET = 405, l identifiant jamais dans une URL, et le MCP de bout en bout
 *    (tblock_panel_open -> tblock_command -> le panneau lit -> rend compte -> tblock_panel_state).
 * ⛔ BORNE : ce banc prouve la FILE et sa forme. Il ne prouve pas le panneau (navigateur) ni une signature. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const B = '0xb2' + '0'.repeat(30) + 'ABCDEF12', A = '0x' + 'a1'.repeat(20), TX = '0x' + 'cd'.repeat(32);

async function jeu(dir, dire) {
  const P = await imp('panel-sessions.js', dir);
  const v = P.validerCommande;
  dire(v({ type: 'select', block: B }).commande.block === B.toLowerCase(), 'A select : adresse normalisee en minuscules');
  dire(!v({ type: 'select', block: B.slice(0, 20) }).ok && !v({ type: 'select' }).ok, 'A select : adresse tronquee ou absente refusee');
  dire(v({ type: 'show', tab: 'brain' }).ok && !v({ type: 'show', tab: 'wallet' }).ok, 'A show : market, trade, brain, chat — rien d autre');
  const t = v({ type: 'trade', side: 'buy', block: B, amount: '1000000000000000', with: 'eth' });
  dire(t.ok && t.commande.with === 'ETH' && t.commande.amount === '1000000000000000', 'A trade : buy, montant en unites brutes, « eth » -> ETH');
  dire(!v({ type: 'trade', side: 'hold', block: B, amount: '1' }).ok && !v({ type: 'trade', side: 'buy', block: B, amount: '0.5' }).ok
    && !v({ type: 'trade', side: 'buy', block: B, amount: '0' }).ok && !v({ type: 'trade', side: 'sell', block: B, amount: '1', with: 'usdc' }).ok,
    'A trade : cote inconnu, montant decimal, montant 0, devise par symbole — refuses');
  dire(!v({ type: 'trade', side: 'buy', block: B, amount: '1', to: A }).ok && !v({ type: 'say', text: 'x', html: '<b>' }).ok, 'A champ inconnu (ex. un destinataire) : refuse');
  dire(v({ type: 'task', task: 'trade_tblock', block: B }).ok && !v({ type: 'task', task: 'send_funds', block: B }).ok, 'A task : une tache du catalogue du cerveau, rien d autre');
  const b = v({ type: 'birth', name: '  Mon  Block ', symbol: 'mbk' });
  dire(b.ok && b.commande.name === 'Mon Block' && b.commande.symbol === 'MBK' && b.commande.pair === 'ETH', 'A birth : nom nettoye, symbole en majuscules, paire ETH par defaut');
  dire(!v({ type: 'birth', name: 'é'.repeat(17), symbol: 'x' }).ok && !v({ type: 'birth', name: 'x' }).ok, 'A birth : plus de 32 octets, ou sans symbole — refuse');
  const s = v({ type: 'say', text: 'bonjour' + String.fromCodePoint(0x202e) + String.fromCodePoint(0) + ' <script>alert(1)</script>' + String.fromCodePoint(10) + 'x'.repeat(600) });
  dire(s.ok && s.commande.text.length === 500 && Array.from(s.commande.text).every((ch) => ch.codePointAt(0) > 31 && ch.codePointAt(0) !== 0x202e), 'A say : 500 caracteres au plus, caracteres de controle et de sens d ecriture retires');
  dire(!v({ type: 'say', text: '   ' }).ok && !v({ type: 'sign' }).ok && !v(null).ok && !v([]).ok, 'A say vide, type inconnu (« sign »), null, tableau — refuses');
  const e = P.validerEvenement;
  dire(e({ type: 'signed', ref: 3, tx: TX, account: A }).ok && !e({ type: 'signed', tx: '0x12' }).ok && !e({ type: 'paid' }).ok && !e({ type: 'note', ref: 0 }).ok,
    'A evenement : type connu, hash entier, reference >= 1');

  let maintenant = 1000000, k = 0;
  const R = P.creerRegistrePanel({ horloge: () => maintenant, tirerId: () => (++k).toString(16).padStart(32, '0') });
  const o = R.ouvrir({ block: B });
  dire(o.ok && /^[0-9a-f]{32}$/.test(o.session) && R.taille() === 1, 'B ouvrir : une session, identifiant de 32 hex');
  dire(!R.ouvrir({ block: '0x12' }).ok, 'B ouvrir : block tronque refuse');
  const p1 = R.pousser(o.session, { type: 'say', text: 'un' });
  dire(p1.ok && p1.n === 1 && p1.panneauOuvert === false, 'B proposer : numero 1 ; aucun panneau n a encore lu -> panneauOuvert faux');
  const vite = R.pousser(o.session, { type: 'say', text: 'deux' });
  dire(!vite.ok && vite.tropVite === true, 'B une commande par seconde : la 2e, dans la meme seconde, est refusee');
  maintenant += 1000;
  dire(R.pousser(o.session, { type: 'say', text: 'deux' }).n === 2, 'B une seconde plus tard : numero 2');
  dire(!R.pousser('f'.repeat(32), { type: 'say', text: 'x' }).ok && R.pousser('f'.repeat(32), { type: 'say', text: 'x' }).inconnue === true && !R.pousser('zz', { type: 'say', text: 'x' }).ok,
    'B session inconnue ou mal formee : refusee, sans rien creer');
  maintenant += 1000;
  dire(!R.pousser(o.session, { type: 'sign', tx: TX }).ok && R.lireCommandes(o.session, 0).commandes.length === 2, 'B une commande invalide n entre pas dans la file');
  const l = R.lireCommandes(o.session, 1);
  dire(l.ok && l.commandes.length === 1 && l.commandes[0].n === 2 && l.commandes[0].text === 'deux' && l.block === B.toLowerCase() && l.dernier === 2, 'B le panneau lit « apres 1 » : la commande 2 seule');
  maintenant += 1000;
  dire(R.pousser(o.session, { type: 'show', tab: 'trade' }).panneauOuvert === true, 'B apres une lecture du panneau (< 15 s) : panneauOuvert vrai');
  dire(R.noter(o.session, { type: 'verdict', ref: 3, etat: 'ok', text: 'brain accepts' }).m === 1 && R.noter(o.session, { type: 'signed', ref: 3, tx: TX, account: A }).m === 2
    && !R.noter(o.session, { type: 'signed', tx: 'nope' }).ok, 'B le panneau rend compte : evenements numerotes ; un evenement mal forme est refuse');
  const ev = R.lireEvenements(o.session, 1);
  dire(ev.ok && ev.evenements.length === 1 && ev.evenements[0].tx === TX && ev.commandesEnvoyees === 3 && ev.panneauOuvert === true, 'B l agent lit « apres 1 » : la signature (hash), 3 commandes envoyees');
  maintenant += 16000;
  dire(R.lireEvenements(o.session).panneauOuvert === false, 'B 16 s sans lecture du panneau : panneauOuvert redevient faux');
  for (let i = 0; i < 120; i += 1) { maintenant += 1000; R.pousser(o.session, { type: 'say', text: 'm' + i }); }
  const plein = R.lireCommandes(o.session, 0);
  dire(plein.commandes.length === P.PANEL_MAX_FILE && plein.commandes[0].n === plein.dernier - P.PANEL_MAX_FILE + 1, 'B file bornee : les ' + P.PANEL_MAX_FILE + ' dernieres commandes seulement');
  maintenant += P.PANEL_TTL_MS + 1;
  dire(!R.lireCommandes(o.session, 0).ok && R.taille() === 0, 'B 2 h sans activite : la session a expire et n existe plus');
  let dernierOuvert = null; for (let i = 0; i < P.PANEL_MAX_SESSIONS + 3; i += 1) dernierOuvert = R.ouvrir();
  dire(R.taille() === P.PANEL_MAX_SESSIONS && dernierOuvert.ok === false, 'B plafond : ' + P.PANEL_MAX_SESSIONS + ' sessions, la suivante est refusee');
  return P;
}

console.log('— A/B. forme et registre');
const P = await jeu(ICI, ok);
const BT = await imp('brain-tasks.js');
ok(JSON.stringify([...P.TACHES_PANEL].sort()) === JSON.stringify(BT.ONCHAIN_TASKS.map((t) => t.id).sort()), 'la liste des taches du panneau = le catalogue du cerveau (ONCHAIN_TASKS), a l identique');
const src0 = fs.readFileSync(path.join(ICI, 'panel-sessions.js'), 'utf8');
ok(!/eth_sendTransaction|fetch\(|rpc\(|import /.test(src0.replace(/\/\*[\s\S]*?\*\//g, '')), 'TEMOIN : le module n importe rien, ne lit pas le reseau, n envoie rien (une file en memoire)');

console.log('— C. mutants');
const MUTANTS = [
  { nom: 'champ inconnu accepte', de: "Object.keys(c).every((k) => liste.includes(k)) ? null : 'unknown field in this command'", a: 'null' },
  { nom: 'cadence retiree', de: 'if (t - s.derniere < PANEL_INTERVALLE_MS) return', a: 'if (false) return' },
  { nom: 'expiration retiree', de: 'if (horloge() - s.vu > PANEL_TTL_MS) { sessions.delete(String(id)); return null; }', a: '' },
  { nom: 'texte non nettoye', de: "(caractereInterdit(ch.codePointAt(0)) ? ' ' : ch)", a: 'ch' },
  { nom: 'commande invalide gardee', de: '      if (!v.ok) return v;\n      const t = horloge();\n      if (t - s.derniere', a: '      const t = horloge();\n      if (t - s.derniere' },
  { nom: 'plafond de sessions retire', de: 'if (sessions.size >= PANEL_MAX_SESSIONS) return', a: 'if (false) return' },
];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-mut-'));
for (const mu of MUTANTS) {
  const dir = fs.mkdtempSync(path.join(tmp, 'm-'));
  const src = src0.replace(/\r\n/g, '\n');
  if (src.split(mu.de).length !== 2) { ok(false, 'C mutant « ' + mu.nom + ' » : motif introuvable ou multiple'); continue; }
  fs.writeFileSync(path.join(dir, 'panel-sessions.js'), src.replace(mu.de, mu.a));
  let rouges = 0, plante = null;
  try { await jeu(dir, (c) => { if (!c) rouges += 1; }); } catch (e) { plante = String(e && e.message).slice(0, 60); }
  ok(rouges > 0 || plante !== null, 'C mutant « ' + mu.nom + ' » : ROUGE (' + (plante ? 'plante : ' + plante : rouges + ' assertion(s)') + ')');
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

console.log('— D. serveur, faux noeud local');
const noeud = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
  let id = 1, m = ''; try { const j = JSON.parse(b); id = j.id; m = j.method; } catch (_) {}
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', id, result: m === 'eth_blockNumber' ? '0x100000' : m === 'eth_getLogs' ? [] : '0x' + '0'.repeat(64) })); }); });
await new Promise((o) => noeud.listen(0, '127.0.0.1', o));
const u = 'http://127.0.0.1:' + noeud.address().port;
const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-panel-vol-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const enfant = spawn(process.execPath, [path.join(ICI, 'serveur-web.js')], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: u, BASE_RPC_LECTURE: u, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '' } });
let stderr = ''; enfant.stdout.on('data', () => {}); enfant.stderr.on('data', (c) => { stderr += c; });
const base = 'http://127.0.0.1:' + port;
const post = async (chemin, corps) => { const r = await fetch(base + chemin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps), signal: AbortSignal.timeout(30000) }); return { code: r.status, corps: await r.json().catch(() => null) }; };
const mcp = async (name, args, id = 1) => (await post('/mcp', { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })).corps.result;
let demarre = false;
for (let i = 0; i < 120 && !demarre; i += 1) { try { demarre = (await fetch(base + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await new Promise((o) => setTimeout(o, 500)); } }
ok(demarre, 'serveur demarre (port ' + port + ')' + (demarre ? '' : ' — ' + stderr.slice(0, 300)));
if (demarre) {
  ok((await fetch(base + '/api/panel/etat')).status === 405, 'GET sur une route de panneau : 405 (la session ne voyage jamais dans une URL)');
  const ouv = await mcp('tblock_panel_open', { block: B });
  const S = ouv.structuredContent.session;
  ok(ouv.isError === false && /^[0-9a-f]{32}$/.test(S) && ouv.structuredContent.url === 'https://tokenizedblock.space/panel.html#s=' + S + '&b=' + B.toLowerCase(),
    'MCP tblock_panel_open : une session, et le lien du panneau avec la session DANS LE FRAGMENT (' + ouv.structuredContent.url.slice(0, 48) + '…)');
  const c1 = await mcp('tblock_command', { session: S, type: 'trade', side: 'buy', block: B, amount: '1000000000000000', with: 'ETH' });
  ok(c1.isError === false && c1.structuredContent.n === 1 && c1.structuredContent.panneauOuvert === false && /no panel is open/.test(c1.structuredContent.suite),
    'MCP tblock_command (trade) : mise en file n° 1, et l agent apprend qu aucun panneau n est ouvert');
  const lu = await post('/api/panel/commandes', { s: S, depuis: 0 });
  ok(lu.code === 200 && lu.corps.commandes.length === 1 && lu.corps.commandes[0].type === 'trade' && lu.corps.commandes[0].side === 'buy' && lu.corps.block === B.toLowerCase(),
    'le panneau lit sa file : la proposition d achat y est, telle que validee');
  ok((await mcp('tblock_command', { session: S, type: 'task', task: 'send_funds', block: B })).structuredContent.etat === 'REFUSE', 'MCP : une tache hors catalogue est REFUSEE (aucun moyen de demander un envoi)');
  await new Promise((o) => setTimeout(o, 1100));
  ok((await mcp('tblock_command', { session: S, type: 'say', text: 'hello panel' })).structuredContent.panneauOuvert === true, 'apres la lecture du panneau : panneauOuvert vrai');
  ok((await post('/api/panel/evenement', { s: S, evenement: { type: 'verdict', ref: 1, etat: 'refused', text: 'needs market LUE + living phase' } })).corps.m === 1
    && (await post('/api/panel/evenement', { s: S, evenement: { type: 'declined', ref: 1 } })).corps.m === 2, 'le panneau rend compte : verdict du cerveau, puis refus de l humain');
  const st = await mcp('tblock_panel_state', { session: S });
  ok(st.isError === false && st.structuredContent.evenements.map((e) => e.type).join() === 'verdict,declined' && st.structuredContent.commandesEnvoyees === 2 && st.structuredContent.panneauOuvert === true,
    'MCP tblock_panel_state : l agent lit le verdict et le refus, dans l ordre');
  ok((await mcp('tblock_panel_state', { session: S, since: '1' })).structuredContent.evenements.length === 1, 'since = 1 : seulement la suite');
  ok((await post('/api/panel/commande', { s: 'f'.repeat(32), commande: { type: 'say', text: 'x' } })).code === 404 && (await mcp('tblock_command', { session: 'f'.repeat(32), type: 'say', text: 'x' })).structuredContent.etat === 'REFUSE',
    'session inconnue : 404 en HTTP, REFUSE en MCP');
  ok((await post('/api/panel/ouvrir', {})).corps.ok === true && (await post('/api/panel/nimporte', {})).code === 404, 'le panneau peut ouvrir sa propre session ; route inconnue : 404');
  const tl = (await post('/mcp', { jsonrpc: '2.0', id: 9, method: 'tools/list' })).corps.result.tools;
  ok(tl.length === 7 && ['tblock_panel_open', 'tblock_command', 'tblock_panel_state'].every((x) => tl.some((t) => t.name === x)) && !tl.some((t) => /send|sign|transfer/i.test(t.name)),
    'tools/list : 7 outils, dont les 3 de la telecommande — et aucun qui envoie ou signe');
}
enfant.kill(); noeud.close();
try { fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {}

console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
