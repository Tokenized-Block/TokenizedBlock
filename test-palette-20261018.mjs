/* test-palette-20261018.mjs — LA PALETTE Ctrl+K DU PANNEAU DE COMMANDE.
 *
 * A. palette.js (pur, hors reseau) : le filtre flou (nom + mots), le classement (le score d abord, l usage ensuite, l ordre enfin), la
 *    requete vide (les plus utilisees), l usage garde en localStorage SANS jamais lever (stockage absent, qui leve, ou corrompu),
 *    borne ; le deplacement clavier (bouclage).
 * B. LA MEME TABLE : la liste des commandes de la palette et le dispatcher du Chat (analyserCommande) lisent COMMANDES. Preuve par une
 *    table AMPUTEE (la commande disparait des deux) et une table ETENDUE (elle apparait dans les deux) ; chaque ligne de la palette est
 *    une phrase que SON entree reconnait.
 * C. app.html : la palette ENVOIE par le formulaire du Chat (le meme gestionnaire submit, aucun second chemin), ecrit les modeles a
 *    ajuster dans le champ ; onglets lus dans la barre (.navB), jeux lus dans les tuiles du Game ; Ctrl/Cmd+K, « / » hors d un champ,
 *    bouton dans l en-tete ; role=dialog, aria-activedescendant, Echap, focus rendu ; feuille pleine largeur a 375 px ; rien ne signe.
 * D. MUTANTS sur des COPIES (palette.js et commandes-panel.js) : chacun doit rougir.
 * ⛔ BORNE : rien ici ne prouve le rendu ni le clavier dans un vrai navigateur — c est le role de la verification navigateur. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };

async function jeu(dir, dire) {
  const P = await imp('palette.js', dir);
  const C = await imp('commandes-panel.js', dir);
  /* une liste comme celle que l app construit : commandes (de la table), onglets, jeux */
  const cmds = P.entreesCommandes(C.COMMANDES);
  const onglets = P.entreesOnglets([{ volet: 'map', nom: 'Map' }, { volet: 'trade', nom: 'Market' }, { volet: 'missions', nom: 'Game' }, { volet: 'wallet', nom: 'Wallet' }]);
  const jeux = P.entreesJeu([
    { jeu: 'tirCarte', focus: 'jourRoll', nom: 'Roll', mots: 'the next block decides' },
    { jeu: 'tirCarte', focus: 'jourPass', nom: 'Week pass', mots: 'a ticket every day' },
    { jeu: 'brainJeuCarte', focus: 'bjJouer', nom: 'Let the brain play', mots: 'its brain let it play for you' },
    { jeu: 'skinCarte', focus: '', nom: 'Skins', mots: 'for sale' },
  ]);
  const tout = [...cmds, ...onglets, ...jeux];
  const ids = (l) => l.map((e) => e.id);
  const premier = (q, u = {}) => (P.filtrerPalette(tout, q, u)[0] || {}).nom;

  /* ── A. le filtre ── */
  dire(P.normaliser('  Rôll  ×5 ') === 'roll x5', 'A normaliser : casse, accents, « × » -> x, espaces reduits');
  dire(P.scoreFlou('wal', 'wallet') > P.scoreFlou('wal', 'swap all') && P.scoreFlou('wal', 'swap all') > 0, 'A un debut de mot bat une sous-suite');
  dire(P.scoreFlou('zq', 'wallet') === 0 && P.scoreFlou('', 'wallet') === 0, 'A aucune correspondance = 0 (et une requete vide ne note rien)');
  dire(P.scoreFlou('wlt', 'wallet') > 0, 'A flou : une sous-suite (« wlt ») trouve « wallet »');
  dire(premier('roll') === 'Roll', 'A « roll » : la ligne « Roll » en tete (nom exact)');
  dire(premier('wk pass') === 'Week pass', 'A « wk pass » : « Week pass » (flou, mot par mot)');
  dire(premier('let the brain play') === 'Let the brain play', 'A « let the brain play » : la tuile du Game');
  dire(premier('wallet') === 'Wallet', 'A « wallet » : l onglet');
  dire(premier('transfer') === 'Send', 'A « transfer » : trouve par ses MOTS (Send)');
  dire(P.filtrerPalette(tout, 'qqqzzz', {}).length === 0, 'A une requete sans rapport : liste vide (rien d invente)');
  /* le score passe avant l usage : « roll » tape, Roll exact reste devant Roll ×10 meme tres utilise */
  const r10 = cmds.find((e) => e.modele === 'roll x10');
  dire(premier('roll', { [r10.id]: 50 }) === 'Roll', 'A le score passe AVANT l usage (Roll devant Roll ×10 utilise 50 fois)');
  /* a score egal, l usage departage */
  const sk = jeux.find((e) => e.nom === 'Skins'), wp = jeux.find((e) => e.nom === 'Week pass');
  dire(P.filtrerPalette([wp, sk], 's', { [sk.id]: 3 })[0] === sk || P.scoreFlou('s', 'skins') > P.scoreFlou('s', 'week pass'), 'A a score egal ou superieur, l usage departage');
  /* ── la requete vide : les plus utilisees d abord, puis l ordre de la liste, borne ── */
  const vide0 = P.filtrerPalette(tout, '', {});
  dire(vide0.length === Math.min(tout.length, P.MAX_VIDE) && vide0[0] === tout[0], 'A requete vide sans usage : l ordre de la liste, ' + P.MAX_VIDE + ' lignes au plus');
  const vide1 = P.filtrerPalette(tout, '   ', { [sk.id]: 2, [wp.id]: 5 });
  dire(vide1[0] === wp && vide1[1] === sk && vide1[2] === tout[0], 'A requete vide : les plus utilisees en tete (5 puis 2), puis l ordre');
  /* ── l usage ── */
  let u = P.noterUsage({}, 'cmd:roll'); u = P.noterUsage(u, 'cmd:roll'); u = P.noterUsage(u, 'tab:map');
  dire(u['cmd:roll'] === 2 && u['tab:map'] === 1, 'A noterUsage compte');
  let gros = {}; for (let i = 0; i < 200; i++) gros = P.noterUsage(gros, 'x:' + i);
  dire(Object.keys(gros).length <= P.USAGES_MAX, 'A l usage est BORNE (' + Object.keys(gros).length + ' cles <= ' + P.USAGES_MAX + ')');
  const leve = { getItem() { throw new Error('bloque'); }, setItem() { throw new Error('bloque'); } };
  let sansLever = true; let lu = null;
  try { lu = P.lireUsages(leve); P.ecrireUsages(leve, { a: 1 }); P.ecrireUsages(null, { a: 1 }); } catch (_) { sansLever = false; }
  dire(sansLever && lu && Object.keys(lu).length === 0 && Object.keys(P.lireUsages(null)).length === 0, 'A stockage qui LEVE ou absent : {} et rien ne leve (navigation privee)');
  const memo = new Map(); const st = { getItem: (k) => (memo.has(k) ? memo.get(k) : null), setItem: (k, v) => memo.set(k, String(v)) };
  P.ecrireUsages(st, { 'cmd:roll': 3 });
  dire(P.lireUsages(st)['cmd:roll'] === 3, 'A ecrire puis relire : 3');
  memo.set(P.CLE_USAGES, '{"cmd:roll":-4,"tab:map":"9","ok:x":2,"__proto__":7}');
  const l2 = P.lireUsages(st);
  dire(l2['ok:x'] === 2 && !('cmd:roll' in l2) && !('tab:map' in l2) && !Object.prototype.hasOwnProperty.call(l2, '__proto__'), 'A stockage corrompu : seules les valeurs entieres >= 0 sont gardees');
  memo.set(P.CLE_USAGES, 'pas du json');
  dire(Object.keys(P.lireUsages(st)).length === 0, 'A JSON illisible : {}');
  /* ── le clavier ── */
  dire(P.deplacer(0, -1, 5) === 4 && P.deplacer(4, 1, 5) === 0 && P.deplacer(2, 1, 5) === 3 && P.deplacer(0, 1, 0) === -1, 'A fleches : la selection boucle (haut sur la 1re = la derniere), liste vide = -1');

  /* ── B. la MEME table ── */
  const types = new Set();
  let toutesReconnues = true;
  for (const e of cmds) {
    const entree = C.COMMANDES.find((c) => c.cle === e.cle);
    const r = entree && entree.lire(e.modele.replace(/\s+/g, ' ').trim());
    if (!r) toutesReconnues = false;
    const a = C.analyserCommande(e.modele);
    if (!e.ecrire && !(a.ok === true)) toutesReconnues = false;
    if (a.ok) types.add(a.commande.type);
  }
  dire(toutesReconnues, 'B chaque ligne de commande de la palette est une phrase que SON entree de la table reconnait ; une ligne envoyee telle quelle est ACCEPTEE par le dispatcher');
  dire(C.COMMANDES.every((c) => cmds.some((e) => e.cle === c.cle)) && cmds.every((e) => C.COMMANDES.some((c) => c.cle === e.cle)), 'B chaque entree de la table a sa ligne dans la palette, et aucune ligne n en vient d ailleurs (' + C.COMMANDES.length + ' entrees, ' + cmds.length + ' lignes)');
  dire(['help', 'tasks', 'game', 'roll', 'show', 'swap'].every((t) => types.has(t)), 'B les types envoyes couvrent help, tasks, game, roll, show, swap');
  const ampute = C.COMMANDES.filter((c) => c.cle !== 'game');
  dire(C.creerAnalyseur(ampute)('game').ok === false && !P.entreesCommandes(ampute).some((e) => e.modele === 'game') && C.analyserCommande('game').ok === true,
    'B table AMPUTEE de « game » : le dispatcher ne la comprend plus ET la palette ne la liste plus');
  const zz = { cle: 'zz', lire: (t) => (t === 'zz' ? { ok: true, commande: { type: 'zz' } } : null), palette: [{ nom: 'Zz test', modele: 'zz', mots: '' }] };
  const etendue = [...C.COMMANDES, zz];
  dire(C.creerAnalyseur(etendue)('zz').ok === true && P.entreesCommandes(etendue).some((e) => e.modele === 'zz') && C.analyserCommande('zz').ok === false,
    'B table ETENDUE : la nouvelle commande est comprise ET listee, sans rien ecrire d autre');
  /* 2026-10-18 (Brain OS) : « safety <token> » et « explain <hash> » ECRIVENT aussi leur modele (un block, un hash — jamais choisis par nous) */
  dire(cmds.filter((e) => e.ecrire).every((e) => ['post_task', 'select', 'buy', 'sell', 'swap', 'send', 'safety', 'explain'].includes(e.cle))
    && ['post_task', 'select', 'buy', 'sell', 'swap', 'send', 'safety', 'explain'].every((k) => cmds.some((e) => e.cle === k && e.ecrire)),
    'B les commandes a montant / block / adresse ECRIVENT leur modele (a ajuster) ; elles ne partent jamais avec un montant choisi par nous');
  dire(new Set(ids(tout)).size === tout.length, 'B les identifiants de la liste sont uniques (' + tout.length + ')');
  return { P, C };
}

console.log('— A/B. palette.js et la table');
await jeu(ICI, ok);

console.log('— C. app.html');
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
const serveur = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
const i0 = html.indexOf('/* ══ LA PALETTE'), i1 = html.indexOf('/* ══ FIN DE LA PALETTE');
const pal = i0 > 0 && i1 > i0 ? html.slice(i0, i1) : '';
ok(pal.length > 2000, 'le code de la palette est trouve dans app.html (' + pal.length + ' caracteres) — sinon les gardes ci-dessous ne regarderaient rien');
ok(/import \{[^}]*\bCOMMANDES\b[^}]*\} from '\.\/commandes-panel\.js';/.test(html) && /from '\.\/palette\.js';/.test(html), 'app.html importe COMMANDES (commandes-panel.js) et palette.js');
ok(/'palette\.js'/.test(serveur.slice(serveur.indexOf('const SERVIS'), serveur.indexOf('];', serveur.indexOf('const SERVIS')))), 'palette.js est SERVI (absent de SERVIS = 404 = app morte)');
ok(/entreesCommandes\(COMMANDES\)/.test(pal), 'la liste des commandes est construite sur COMMANDES — la table du dispatcher');
ok(/querySelectorAll\('\.navIn \.navB\[data-volet\]'\)/.test(pal) && /allerA\(e\.volet\)/.test(pal), 'les onglets sont LUS dans la barre (.navB) et ouverts par allerA');
ok(/querySelectorAll\('\.jeuBandeau \[data-jeu\]'\)/.test(pal) && /allerA\('missions'\)/.test(pal) && /\.click\(\)/.test(pal), 'les jeux sont LUS dans les tuiles du Game et ouverts par LA tuile (meme geste : defile + focus)');
/* ⛔ un seul chemin : la palette ENVOIE par le formulaire du Chat, jamais bcExecuterTexte en direct */
ok(/requestSubmit\(\)/.test(pal) && !/bcExecuterTexte\(/.test(pal), 'une commande envoyee passe par LE formulaire du Chat (requestSubmit : le meme gestionnaire submit) — aucun appel direct a bcExecuterTexte');
ok(/bcEcrireModele\(/.test(pal) && /function bcEcrireModele\(/.test(html) && /b\.addEventListener\('click', \(\) => \{\n[^\n]*\n\s+if \(p\.cle === 'tasks'\)[^\n]*\n\s+bcEcrireModele\(p\);/.test(html),
  'un modele a ajuster s ecrit par bcEcrireModele — la MEME fonction que les pre-commandes du Chat');
ok(!/bcSigner|sendCalls|eth_sendTransaction|wallet_/.test(pal), 'RIEN NE SIGNE dans la palette : aucune signature, aucun envoi de transaction');
ok(/\(e\.ctrlKey \|\| e\.metaKey\)/.test(pal) && /toLowerCase\(\) === 'k'/.test(pal), 'Ctrl+K et Cmd+K ouvrent la palette');
ok(/e\.key === '\/'/.test(pal) && /palChampActif\(/.test(pal) && /function palChampActif\(/.test(pal) && /isContentEditable/.test(pal), '« / » ouvre la palette SEULEMENT hors d un champ (input, textarea, select, contenteditable)');
ok(/id="bcPaletteBtn"/.test(html) && /\$\('#bcPaletteBtn'\)\.addEventListener\('click'/.test(pal), 'un bouton dans l en-tete du panneau ouvre la palette');
const dlg = (html.match(/<dialog[^>]*id="palette"[\s\S]*?<\/dialog>/) || [''])[0];
ok(/aria-label="Commands"/.test(dlg) && /role="combobox"/.test(dlg) && /aria-controls="palListe"/.test(dlg) && /role="listbox"/.test(dlg) && /id="palListe"/.test(dlg), 'la palette : dialog nomme, champ combobox qui controle une listbox');
ok(/setAttribute\('aria-activedescendant'/.test(pal) && /role', 'option'|'role', 'option'/.test(pal) && /aria-selected/.test(pal), 'aria-activedescendant suit la selection ; chaque ligne est une option (aria-selected)');
ok(/\.showModal\(\)/.test(pal) && /addEventListener\('close'/.test(pal) && /palAvant\.focus\(\)/.test(pal), 'showModal (focus piege, Echap ferme nativement) ; a la fermeture le focus revient ou il etait');
ok(/'ArrowDown'/.test(pal) && /'ArrowUp'/.test(pal) && /'Enter'/.test(pal), 'clavier : fleches haut / bas, Entree');
ok(/'Tab'/.test(pal), 'Tab reste dans la palette (focus piege)');
ok(/@media \(max-width:600px\)\{dialog\.palette\{[^}]*width:100%/.test(html), 'a 375 px : une feuille pleine largeur');
const css = (html.match(/dialog\.palette\{[^}]*\}/) || [''])[0];
ok(/var\(--fond2\)|rgb\(var\(--fondRgb\)/.test(css) && /var\(--texte\)/.test(css) && !/#[0-9a-fA-F]{3,6}\b/.test(css), 'la palette prend les tokens du theme (aucune couleur en dur)');
ok(/lireUsages\(palStock\(\)\)/.test(pal) && /function palStock\(\) \{ try \{ return localStorage; \} catch/.test(pal), 'l usage vient du localStorage, lu en try/catch');
ok(!/class="note[^"]*"[^>]*>[^<]{30,}/.test(dlg), 'aucun texte d explication permanent dans la palette');
ok(/dialog\.bcPop\.bcReduit #bcPaletteBtn/.test(html), 'panneau replie : le bouton se cache avec la recherche (il revient au depliage)');

console.log('— D. mutants (sur des copies)');
const SRC_P = fs.readFileSync(path.join(ICI, 'palette.js'), 'utf8').replace(/\r\n/g, '\n');
const SRC_C = fs.readFileSync(path.join(ICI, 'commandes-panel.js'), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pal-mut-'));
const MUTANTS = [
  { f: 'palette.js', nom: 'flou coupe (sous-suite refusee)', de: '  return sousSuite(q, t);\n', a: '  return 0;\n' },
  { f: 'palette.js', nom: 'requete vide sans l usage', de: '    .sort((x, y) => (usages[y.e.id] || 0) - (usages[x.e.id] || 0) || x.i - y.i)', a: '    .sort((x, y) => x.i - y.i)' },
  { f: 'palette.js', nom: 'l usage avant le score', de: '.sort((x, y) => y.s - x.s || (usages[y.e.id] || 0) - (usages[x.e.id] || 0) || x.i - y.i)', a: '.sort((x, y) => (usages[y.e.id] || 0) - (usages[x.e.id] || 0) || y.s - x.s || x.i - y.i)' },
  { f: 'palette.js', nom: 'lireUsages sans try/catch', de: '  try { brut = stockage ? stockage.getItem(CLE_USAGES) : null; } catch (_) { brut = null; }', a: '  brut = stockage ? stockage.getItem(CLE_USAGES) : null;' },
  { f: 'palette.js', nom: 'usage non borne', de: '  while (cles.length > USAGES_MAX)', a: '  while (false)' },
  { f: 'palette.js', nom: 'fleches sans bouclage', de: '  return ((i + d) % n + n) % n;', a: '  return Math.max(0, Math.min(n - 1, i + d));' },
  { f: 'palette.js', nom: 'mots ignores (nom seul)', de: '    const sm = scoreFlou(mot, e.motsN);', a: '    const sm = 0;' },
  { f: 'palette.js', nom: 'la palette ignore la table recue (liste en dur)', de: '  for (const c of table) {', a: '  for (const c of [{ cle: \'help\', palette: [{ nom: \'Help\', modele: \'help\' }] }]) {' },
  { f: 'palette.js', nom: 'tout s envoie (ecrire perdu)', de: 'ecrire: l.ecrire === true', a: 'ecrire: false' },
  { f: 'commandes-panel.js', nom: 'le dispatcher ignore la table recue', de: '    for (const c of table) { const r = c.lire(t); if (r) return r; }', a: '    for (const c of COMMANDES) { const r = c.lire(t); if (r) return r; }' },
  { f: 'commandes-panel.js', nom: 'une commande comprise hors table', de: '    if (t.length > 200) return { ok: false, pourquoi: \'that is too long for a command\' };\n', a: '    if (t.length > 200) return { ok: false, pourquoi: \'that is too long for a command\' };\n    if (t === \'zz\') return { ok: true, commande: { type: \'zz\' } };\n' },
];
for (const mu of MUTANTS) {
  const src = mu.f === 'palette.js' ? SRC_P : SRC_C;
  if (src.split(mu.de).length !== 2) { ok(false, 'D mutant « ' + mu.nom + ' » : motif introuvable ou multiple'); continue; }
  const dir = fs.mkdtempSync(path.join(tmp, 'm-'));
  fs.writeFileSync(path.join(dir, 'palette.js'), mu.f === 'palette.js' ? SRC_P.replace(mu.de, () => mu.a) : SRC_P);
  fs.writeFileSync(path.join(dir, 'commandes-panel.js'), mu.f === 'commandes-panel.js' ? SRC_C.replace(mu.de, () => mu.a) : SRC_C);
  let rouges = 0, plante = null;
  try { await jeu(dir, (c) => { if (!c) rouges += 1; }); } catch (e) { plante = String(e && e.message).slice(0, 60); }
  ok(rouges > 0 || plante !== null, 'D mutant « ' + mu.nom + ' » : ROUGE (' + (plante ? 'plante : ' + plante : rouges + ' assertion(s)') + ')');
}
/* temoin : la copie NON mutee est verte (sinon tout mutant « rougirait » pour une autre raison) */
{
  const dir = fs.mkdtempSync(path.join(tmp, 't-'));
  fs.writeFileSync(path.join(dir, 'palette.js'), SRC_P); fs.writeFileSync(path.join(dir, 'commandes-panel.js'), SRC_C);
  let rouges = 0; await jeu(dir, (c) => { if (!c) rouges += 1; });
  ok(rouges === 0, 'D temoin : les copies NON mutees sont vertes (0 rouge)');
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
