/* test-commandes-panel-20261004.mjs — LE PANNEAU DE COMMANDE DANS L APP : la grammaire, le cablage, le widget MCP, les sondes.
 *
 * A. commandes-panel.js (hors reseau) : chaque forme acceptee, chaque refus ; un destinataire tronque n est JAMAIS complete ; les
 *    pre-commandes sont des phrases que la grammaire accepte (celle de « send » est volontairement incomplete et refusee tant que
 *    l adresse manque) ; conversion en unites brutes (trop de decimales = refus, pas d arrondi).
 * B. MUTANTS sur la grammaire.
 * C. app.html : le panneau LIT le snapshot du cerveau de l app (pas une copie) ; widget place entre « Its wiring » et « Its job » ;
 *    pop-up ; texte d agent en textContent ; un envoi propose par un agent exige un clic de plus ; registre avant les blocks du
 *    Market ; la session ne voyage pas dans une URL.
 * D. serveur + MCP : le widget (ressource ui://, MIME lu dans le paquet officiel), le paquet embarque a l empreinte attendue, les
 *    quatre sondes dans /sante, le block de sonde = IB022 du depot.
 * ⛔ BORNE : rien ici ne prouve une signature, ni le rendu du widget dans un vrai client MCP (aucun n est disponible ici). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const A = '0x00000000000000000000000000000000c0ffee77', B = '0xb2000000000000000000000d8ce462e99ee7a47b';

async function jeu(dir, dire) {
  const C = await imp('commandes-panel.js', dir);
  const a = (t) => C.analyserCommande(t);
  const egal = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  dire(egal(a('buy NVDAc with 5 USDC'), { ok: true, commande: { type: 'swap', de: 'USDC', vers: 'NVDAc', montant: '5' } }), 'A buy <B> with <n> <A> : on PAIE A, on recoit B');
  dire(egal(a('  Buy   nvdac  WITH 5,5 usdc '), { ok: true, commande: { type: 'swap', de: 'usdc', vers: 'nvdac', montant: '5.5' } }), 'A espaces, casse, virgule decimale : tolerees');
  dire(egal(a('sell 0.01 AMDc for USDC'), { ok: true, commande: { type: 'swap', de: 'AMDc', vers: 'USDC', montant: '0.01' } }), 'A sell <n> <A> for <B>');
  dire(egal(a('sell 1000 this'), { ok: true, commande: { type: 'swap', de: 'this', vers: null, montant: '1000' } }), 'A sell sans « for » : vers = null (le panneau prend la cote du block)');
  dire(egal(a('swap 1 ETH -> ' + B), { ok: true, commande: { type: 'swap', de: 'ETH', vers: B, montant: '1' } }), 'A swap <n> <A> -> <adresse entiere>');
  dire(egal(a('send 2 ETH to ' + A.toUpperCase().replace('0X', '0x')), { ok: true, commande: { type: 'send', jeton: 'ETH', montant: '2', destinataire: A } }), 'A send : destinataire entier, rendu en minuscules');
  for (const t of ['send 1 USDC to 0x1234', 'send 1 USDC to ' + A.slice(0, 41), 'send 1 USDC to ' + A + 'ff', 'send 1 USDC', 'send USDC to ' + A, 'send 1 USDC to vitalik.eth']) {
    const r = a(t);
    dire(r.ok === false && /whole address/.test(r.pourquoi), 'A send refuse (' + t.slice(0, 34) + '…) : le destinataire n est jamais complete ni devine');
  }
  dire(egal(a('show NVDAc').commande, { type: 'select', jeton: 'NVDAc' }) && egal(a('open ' + B).commande, { type: 'select', jeton: B }), 'A show / open <jeton>');
  dire(egal(a('BRAIN').commande, { type: 'show', tab: 'brain' }) && a('tasks').commande.type === 'tasks' && a('help').commande.type === 'help' && a('?').commande.type === 'help', 'A market|trade|brain|chat, tasks, help');
  for (const t of ['', '   ', 'please buy me some stock', 'buy NVDAc', 'buy NVDAc with USDC', 'swap ETH to USDC', 'sell -5 NVDAc', 'buy NVDAc with 5 USDC and send it to ' + A, 'x'.repeat(201), 'buy NVDAc with 1e3 USDC']) {
    dire(a(t).ok === false, 'A hors grammaire, refuse : ' + JSON.stringify(t.slice(0, 40)));
  }
  dire(C.PRECOMMANDES.length >= 6 && C.PRECOMMANDES.filter((p) => !p.aCompleter).every((p) => a(p.modele).ok === true), 'A chaque pre-commande complete est une phrase que la grammaire ACCEPTE');
  const pS = C.PRECOMMANDES.find((p) => p.cle === 'send');
  dire(pS && pS.aCompleter === true && a(pS.modele).ok === false && a(pS.modele.replace(/0x$/, A)).ok === true, 'A la pre-commande « send » est INCOMPLETE expres : refusee telle quelle, acceptee une fois l adresse collee');
  dire(C.enUnitesBrutes('5,5', 6) === 5500000n && C.enUnitesBrutes('0.01', 8) === 1000000n && C.enUnitesBrutes('1', 18) === 10n ** 18n, 'A unites brutes : 5,5 USDC = 5 500 000 ; 0.01 action (8 decimales) = 1 000 000');
  dire(C.enUnitesBrutes('0.0000001', 6) === null && C.enUnitesBrutes('0', 18) === null && C.enUnitesBrutes('1e3', 18) === null && C.enUnitesBrutes('1', 37) === null, 'A trop de decimales, zero, notation scientifique : null — jamais un arrondi');
  return C;
}
console.log('— A. la grammaire');
await jeu(ICI, ok);

console.log('— B. mutants');
const SRC = fs.readFileSync(path.join(ICI, 'commandes-panel.js'), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-mut-'));
for (const mu of [
  { nom: 'destinataire tronque accepte', de: "const ADRESSE = '(0x[0-9a-fA-F]{40})';", a: "const ADRESSE = '(0x[0-9a-fA-F]{4,40})';" },
  { nom: 'buy inverse (on paierait le jeton voulu)', de: "commande: { type: 'swap', de: m[3], vers: m[1], montant: nombre(m[2]) } };", a: "commande: { type: 'swap', de: m[1], vers: m[3], montant: nombre(m[2]) } };" },
  { nom: 'trop de decimales arrondi au lieu de refuse', de: '  if (f.length > decimales) return null;\n', a: '' },
  { nom: 'phrase libre acceptee', de: "  return { ok: false, pourquoi: 'not understood — type “help” to see the commands' };", a: "  return { ok: true, commande: { type: 'help' } };" },
  { nom: 'montant nul accepte', de: 'return v > 0n ? v : null;', a: 'return v;' },
]) {
  if (SRC.split(mu.de).length !== 2) { ok(false, 'B mutant « ' + mu.nom + ' » : motif introuvable ou multiple'); continue; }
  const dir = fs.mkdtempSync(path.join(tmp, 'm-'));
  fs.writeFileSync(path.join(dir, 'commandes-panel.js'), SRC.replace(mu.de, mu.a));
  let rouges = 0, plante = null;
  try { await jeu(dir, (c) => { if (!c) rouges += 1; }); } catch (e) { plante = String(e && e.message).slice(0, 60); }
  ok(rouges > 0 || plante !== null, 'B mutant « ' + mu.nom + ' » : ROUGE (' + (plante ? 'plante : ' + plante : rouges + ' assertion(s)') + ')');
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

console.log('— C. app.html');
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
ok(/try \{ peindreTasks\(snap\); \} catch \(e\) \{ \/\* tasks \*\/ \}\n\s+try \{ bcPeindre\(snap\); \}/.test(html), 'le panneau est peint par publierSnapshotBrain, avec LE snapshot du cerveau de l app (memes donnees, pas une copie)');
ok(/dessinerRasterSur\(\$\('#bcRaster'\), brainHisto\)/.test(html) && /const svg = dessin\(a, sym \|\| '\?'\);/.test(html), 'meme raster (brainHisto) et meme visage (dessin) que le reste de l app');
ok(!/etatInitial\(|cerveauPas\(/.test(html.slice(html.indexOf('const bc = { session: null'), html.indexOf('(function bcDemarrage()'))), 'TEMOIN : le code du panneau ne fait battre AUCUN cerveau a lui');
const iW = html.indexOf('Its wiring — and what it writes'), iL = html.indexOf('<div class="carte" id="bcLanceur">'), iJ = html.indexOf('<p class="titre">Its job</p>');
ok(iW > 0 && iL > iW && iJ > iL && !/<div class="carte"/.test(html.slice(iL + 40, iJ - 60).replace(/<div class="carte">\s*$/, '')), 'le widget « Control panel » est place entre « Its wiring » et « Its job »');
ok(/<dialog class="bcPop" id="bcPop"/.test(html) && /function bcOuvrirPop\(\) \{/.test(html) && /\$\('#bcOuvrir'\)\.addEventListener\('click', \(\) => bcOuvrirPop\(\)\);/.test(html)
  && /async function bcRecevoir\(c\) \{\n\s+bcOuvrirPop\(\);/.test(html), 'le panneau est un pop-up : ouvert par le widget, et de lui-meme quand un agent propose');
const bcSrc = html.slice(html.indexOf('const bc = { session: null'), html.indexOf('(function bcDemarrage()'));
const innerHtmls = bcSrc.match(/[A-Za-z]+\.innerHTML = [^;]+;/g) || [];
ok(innerHtmls.length === 3 && innerHtmls.every((x) => /innerHTML = svg;/.test(x)), 'les seuls innerHTML du panneau sont NOTRE svg (dessin : avatar, widget, peau) : ' + innerHtmls.length + ' — tout texte d agent ou de chaine passe par textContent');
/* ── les vues (Phil, 2026-10-04) : Trade = en cours + historique + notes du cerveau ; Market = les echanges des AUTRES ; Brain = le cube ── */
ok(/const BC_EN_COURS = \['proposed', 'planned', 'signing', 'sent'\];/.test(bcSrc) && /id="bcEnCours"/.test(html) && /id="bcHistorique"/.test(html) && /id="bcNotesBot"/.test(html),
  'Trade : les operations en cours, l historique, et ce que le cerveau a note');
ok(/\? \{ \.\.\.o, etat: o\.etat === 'sent' \? 'sent' : 'interrupted' \} : o\)/.test(bcSrc), 'une operation « en cours » retrouvee au rechargement devient « left unfinished » (une tx envoyee reste « sent ») — jamais « done »');
ok(/bcOpMaj\(op, 'done', s\.hash\);/.test(bcSrc) && /bcOpMaj\(op, s\.refuse \? 'declined' : s\.diffusee \? 'sent' : 'failed', s\.hash\);/.test(bcSrc) && /if \(!g\.ok\) \{ bcOpMaj\(op, 'refused'\); return; \}/.test(bcSrc),
  'chaque issue est notee : faite (avec son hash), refusee au wallet, envoyee non confirmee, echouee, refusee par le cerveau');
ok(/liveEvts\.filter\(\(e\) => e && \(e\.type === 'ACHAT' \|\| e\.type === 'VENTE'\)\)/.test(bcSrc) && /id="bcAutres"/.test(html) && /id="bcMouvants"/.test(html),
  'Market : les echanges des autres blocks viennent du fil Live de l app (lus sur la chaine), et les plus echanges de l index');
ok(/const src = \$\('#bReseau'\), dst = \$\('#bcReseau'\);/.test(bcSrc) && /cx\.drawImage\(src, 0, 0\);/.test(bcSrc), 'Brain : le cube et ses connexions = le canvas de « Its wiring » RECOPIE (meme dessin), pas un second dessin');
ok(/<button type="button" class="bouton sec" id="bcSkins" disabled aria-disabled="true">Skins — not available yet<\/button>/.test(html) && !/bcSkins'\)\.addEventListener/.test(html) && !/id="bcTaches"/.test(html),
  'Brain : la peau du block et un bouton « Skins » DESACTIVE qui dit qu il ne marche pas encore (aucun prix, aucune date) ; la liste des taches n y est plus');
ok(/bcApi\('\/api\/panel\/cerveau', \{ s: bc\.session, cerveau: \{ block: a,/.test(bcSrc), 'cablage direct : le panneau publie l etat du cerveau (humeur, battement, taches acceptees) pour l agent');
ok(/const mB = !h && brainMarche && brainMarche\.adr === String\(brainAdr\)\.toLowerCase\(\) \? brainMarche\.v : null;/.test(html) && /\? marcheProfil\.v : mB;/.test(html),
  'l instantane rapporte le marche dont le cerveau s est NOURRI (block hors carte) — sinon la porte refusait tout echange sur un marche lu');
ok(/id="bcLierCode">claude mcp add --transport http tokenizedblock https:\/\/tokenizedblock\.space\/mcp<\/pre>/.test(html) && /add it as a custom connector/.test(html), 'Agent link : comment brancher Claude (connecteur, Claude Code) ou un autre client, puis la session');
ok(/if \(c\.type === 'say'\) \{ bcMessage\('Your agent', 'agent', c\.text\); return; \}/.test(html) && /bcEl\('div', \{ text: texte \}\)/.test(html), 'un message d agent est pose en texte');
ok(/if \(deLAgent\) bcBoutons\(m, \[\['I checked the address — prepare it', preparer\]/.test(html) && /bcProposerEnvoi\('Your agent', 'agent', \{[^}]+\}, c\.n, true\)/.test(html)
  && /bcProposerEnvoi\('You', '', \{[^}]+\}, null, false\)/.test(html), 'un envoi propose par un AGENT exige un clic de plus que celui de la personne');
ok(/if \(solde < BigInt\(montant\)\)/.test(html) && /if \(destinataire === jeton\.adr\)/.test(html), 'envoi : le solde est relu avant tout, et le jeton lui-meme comme destinataire est refuse');
const iReg = bcSrc.indexOf('const reg = registre.find('), iMk = bcSrc.indexOf('const trouves = [...marcheParAdr.values()]');
ok(iReg > 0 && iMk > iReg && /if \(trouves\.length > 1\) return \{ ok: false/.test(bcSrc), 'symboles : le registre (devises, actions) passe AVANT les blocks du Market ; un symbole porte par plusieurs blocks est refuse');
ok(/tacheAutorisee\('trade_tblock', window\.__TB_BRAIN_SNAPSHOT__ \|\| \{\}\)/.test(bcSrc) && /if \(!g\.ok\) return;/.test(bcSrc), 'un echange qui touche le block passe la porte du cerveau ; refuse = aucun plan');
ok(/fetch\('\/api\/rails\/plan\?de='/.test(bcSrc) && /envoyerDepuisWallet\(\{ eth: window\.ethereum, rpc, chaineAttendue: CHAINE, compte,/.test(bcSrc), 'le plan vient du planificateur du serveur ; la signature passe par le wallet de la personne');
ok(!/[?&]s=' \+|'\?s='/.test(bcSrc) && /bcApi\('\/api\/panel\/commandes', \{ s: bc\.session/.test(bcSrc), 'la session de telecommande voyage dans le CORPS des requetes, jamais dans une URL');
ok(/class="bcComposer"/.test(html) && /class="bcEnvoyer"/.test(html) && /\.bcComposer:focus-within\{/.test(html), 'la barre de commande : un champ et son bouton dans un meme cadre');
const redir = fs.readFileSync(path.join(ICI, 'panel.html'), 'utf8');
ok(/location\.replace\('\/app\.html\?panel=1' \+ location\.hash\);/.test(redir) && redir.length < 1500, 'panel.html conduit les anciens liens vers l app, fragment conserve');

console.log('— D. serveur, MCP, widget, sondes');
const srv = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8').replace(/\r\n/g, '\n');
const M = await imp('mcp-tblock.js');
const hashAttendu = (srv.match(/const WIDGET_BUNDLE_SHA256 = '([0-9a-f]{64})';/) || [])[1];
const hashReel = crypto.createHash('sha256').update(fs.readFileSync(path.join(ICI, 'mcp-ext-apps-2.0.3.bundle.js'))).digest('hex');
ok(!!hashAttendu && hashAttendu === hashReel, 'le paquet ext-apps embarque a l empreinte que le serveur exige (' + hashReel.slice(0, 16) + '…)');
const rq = (method, params, widget = () => '<html>w</html>') => M.traiterMcp({ jsonrpc: '2.0', id: 1, method, params }, { version: 't', widget, outils: {} });
const tl = (await rq('tools/list')).result.tools;
ok(tl.filter((t) => t._meta && t._meta.ui && t._meta.ui.resourceUri === M.WIDGET_URI && t._meta['ui/resourceUri'] === M.WIDGET_URI).map((t) => t.name).join() === 'tblock_panel_open,tblock_panel_state',
  'MCP : tblock_panel_open et tblock_panel_state portent le widget (les deux cles, comme le paquet officiel)');
ok(M.WIDGET_MIME === 'text/html;profile=mcp-app' && (await rq('initialize', {})).result.capabilities.resources, 'MIME du widget = text/html;profile=mcp-app ; la capacite « resources » est annoncee');
const rl = (await rq('resources/list')).result.resources, rr = (await rq('resources/read', { uri: M.WIDGET_URI })).result.contents;
ok(rl.length === 1 && rl[0].uri === M.WIDGET_URI && rr[0].mimeType === M.WIDGET_MIME && rr[0].text === '<html>w</html>', 'resources/list et resources/read rendent le widget');
ok((await rq('resources/read', { uri: 'ui://other' })).error.code === -32002 && (await rq('resources/list', undefined, () => null)).result.resources.length === 0, 'autre URI : -32002 ; serveur sans widget : liste vide (les outils marchent sans lui)');
const cmd = tl.find((t) => t.name === 'tblock_command');
ok(/swap\|send/.test(cmd.inputSchema.properties.type.pattern) && cmd.inputSchema.properties.recipient.pattern === '^0x[0-9a-fA-F]{40}$' && !tl.some((t) => /^tblock_(send|sign|transfer)/.test(t.name)),
  'MCP : swap et send sont des TYPES de tblock_command (des propositions) — il n existe toujours aucun outil qui envoie');
const modele = fs.readFileSync(path.join(ICI, 'mcp-widget-panneau.html'), 'utf8');
ok(modele.includes('/*__EXT_APPS_BUNDLE__*/') && !/<script[^>]+src=/.test(modele) && !/innerHTML/.test(modele) && /app\.openLink\(\{ url \}\)/.test(modele),
  'widget : aucun script distant, aucun innerHTML, le lien du panneau s ouvre par app.openLink');
const poolSansHook = fs.readFileSync(path.join(ICI, 'pool-sans-hook.js'), 'utf8');
const ib = (poolSansHook.match(/'(0xb20+e4b0[0-9a-f]+)', \/\* IB022/i) || [])[1];
ok(!!ib && new RegExp("const BLOCK_SONDE = '" + ib + "';").test(srv), 'le block des sondes est IB022, tel que le depot le porte (' + ib + ')');
ok(/sondes: \{ naissance: naissanceSonde\.etat, marche: autresSondes\.marche, echange: autresSondes\.echange, cerveau: autresSondes\.cerveau, block: BLOCK_SONDE \}/.test(srv)
  && /sonderNaissance\(\)\.then\(sonderLeReste\)/.test(srv), '/sante porte les quatre sondes (naissance, marche, echange, cerveau), rejouees ensemble');
ok(/import \{ vieDuBlock \} from '\.\/marche\.js';/.test(srv) && /import \{ etatInitial as etatInitialCerveau, pas as pasCerveau \} from '\.\/cerveau\.js';/.test(srv) && /tacheAutorisee\('trade_tblock', snap\)/.test(srv),
  'les sondes emploient les modules de l app (marche.js, cerveau.js, brain-tasks.js) — rien de reecrit pour elles');
ok(/'commandes-panel\.js',/.test(srv) && /'caution-createur\.js',/.test(srv), 'les modules importes par app.html sont servis');

console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
