/* test-semaine-pot-20261018b.mjs — PLUS DE TIRAGE DU JOUR : LE TICKET DU JOUR = 1 ENTREE AU POT DE LA SEMAINE, DIT PAREIL PARTOUT.
 * Decision de Phil (2026-10-18) : « fini ca, on a tirage weekend et roll deja en place » — le tirage du jour (un gagnant tire par le bloc E,
 *   paye rien) est RETIRE de ce qui est presente. Reste : le ticket du jour = 1 entree au pot de la SEMAINE (TicketPot, dernier jour UTC de la
 *   semaine, parts ponderees par entrees), le Week pass +3, le niveau du brain +1/+2, et les Rolls payes.
 * AFFIRME :
 *  (1) serveur (source) : la regle de /api/tirage dit « Today's ticket = 1 entry in this week's reward pot », le partage par entrees apres la
 *      cloture de la semaine, « no daily winner and no monthly prize », et ne parle plus de gagnant du jour, de Face of the Day ni de « no prize
 *      yet » ; les champs lus par d autres (veille, jour, semaine, mois, ticketpot) restent dans le corps ;
 *  (2) etatJeuAgent (MCP tblock_game_state, execute) : semaine = { id, entrees, pot LU (reste, ou potAtClose une fois ferme), regle } ; plus de
 *      gagnant du jour ni de veille ; pot non servi -> null (jamais 0) ; entreesSemaine du wallet ;
 *  (3) les trois voix disent la MEME phrase : l onglet Game (peindreTirage), la commande game du brain (bcCommandeGame), le MCP (jeu-agent) ;
 *  (4) la carte Game : plus de bloc « hier » (#faceJour), tuile 02 = le pot de la semaine, Earn = tes entrees et le pot de la semaine.
 * ⛔ NE PROUVE PAS : une lecture reelle du pot de la semaine sur Base, ni un partage reel (Phil signe les parts lui-meme). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const srv = lire('serveur-web.js'), app = lire('app.html');
const PHRASE = /Today\\'s ticket = 1 entry in this week\\'s reward pot/;

/* (1) la regle du serveur */
const ct = srv.slice(srv.indexOf('function corpsTirage()'), srv.indexOf('/* ══ LE NIVEAU D UN WALLET'));
ok(ct.length > 2000, 'corpsTirage est decoupe (' + ct.length + ' caracteres)');
const regle = ct.slice(ct.indexOf("regle: 'A day counts"));
ok(PHRASE.test(regle) && /after the week closes \(UTC\) it is shared by entries/.test(regle) && /There is no daily winner and no monthly prize/.test(regle), 'regle : 1 entree au pot de la semaine, partage par entrees apres la cloture, ni gagnant du jour ni prix du mois');
ok(!/day\\'s winner|Face of the Day|no prize yet|practice season|day\\'s draw|month\\'s draws?/i.test(regle), 'regle : plus de gagnant du jour, de Face of the Day, de « no prize yet », de tirage du jour ou du mois');
ok(/veille, rolls, ticketpot: ticketpotJson\(\),/.test(ct) && /jour: \{ id: j\.id/.test(ct) && /semaine: \{ id: s\.id/.test(ct) && /mois: \{ id: mo\.id/.test(ct), 'le corps garde veille / jour / semaine / mois / ticketpot (d autres lecteurs les lisent)');

/* (2) le MCP, execute */
const J = await import(pathToFileURL(path.join(ICI, 'jeu-agent.js')).href + '?v=' + Math.random());
const W = '0x' + '1a'.repeat(20), JOUR = 'J2026-10-23';
const base = { ok: true, mode: 'SHADOW', pot: 0, seuilVolumeUsd: 10, rolls: { contrat: null }, regle: 'r',
  veille: { id: 'J2026-10-22', etat: 'REVELEE', blocE: 9, gagnant: W, tickets: [W] },
  jour: { id: JOUR, fin: '2026-10-24T00:00:00.000Z', tickets: [W], wallets: [{ adresse: W, volumeUsd: 11, ticket: true }], passes: [] },
  semaine: { id: 'S42', fin: '2026-10-26T00:00:00.000Z', entrees: [{ adresse: W }, { adresse: W }, { adresse: '0x' + '2b'.repeat(20) }], n: 3 }, mois: { entrees: [{ adresse: W }] } };
const avecPot = J.etatJeuAgent({ tirage: { ...base, ticketpot: { contrat: '0x' + '3c'.repeat(20), semaine: { jourId: 'J2026-10-25', ferme: false, reste: '4200000', potAtClose: '0' } } }, wallet: W });
ok(avecPot.ok && avecPot.semaine && avecPot.semaine.entrees === 3 && avecPot.semaine.pot && avecPot.semaine.pot.usdc === '4200000' && avecPot.semaine.pot.jourId === 'J2026-10-25' && avecPot.semaine.pot.ferme === false,
  'MCP : semaine = 3 entrees, pot LU 4200000 (reste, pas encore ferme) sur J2026-10-25');
ok(/today's ticket = 1 entry in this week's reward pot; the pot is shared by entries after the week closes \(UTC\)/.test(avecPot.semaine.regle), 'MCP : la meme regle, en clair');
ok(!('veille' in avecPot) && !JSON.stringify(avecPot).includes('gagnant') && !('pot' in avecPot.jour), 'MCP : plus de veille ni de gagnant du jour, plus de « pot: 0 » du jour');
ok(avecPot.moi && avecPot.moi.entreesSemaine === 2, 'MCP : les entrees de CE wallet cette semaine (2)');
const ferme = J.etatJeuAgent({ tirage: { ...base, ticketpot: { contrat: '0x' + '3c'.repeat(20), semaine: { jourId: 'J2026-10-25', ferme: true, reste: '100', potAtClose: '5000000' } } } });
ok(ferme.semaine.pot.usdc === '5000000' && ferme.semaine.pot.ferme === true, 'MCP : semaine fermee -> le pot FIGE (potAtClose), pas le reste');
const sansPot = J.etatJeuAgent({ tirage: { ...base, ticketpot: null } });
ok(sansPot.ok && sansPot.semaine.pot === null, 'MCP : pot de la semaine non servi -> null (jamais 0)');

/* (3) la meme phrase dans les trois voix */
const pt = app.slice(app.indexOf('async function peindreTirage()'), app.indexOf('async function peindreDernierBlock()'));
const g = app.slice(app.indexOf('async function bcCommandeGame('), app.indexOf('async function bcCommandeRoll('));
ok(PHRASE.test(pt) && /the pot is shared by entries after the week closes \(UTC\)/.test(pt), 'onglet Game : la phrase');
ok(PHRASE.test(g) && /the pot is shared by entries after the week closes \(UTC\)/.test(g), 'commande game du brain : la phrase');
ok(!/today\\'s draw|ticket draw|no prize yet/i.test(g.replace(/\/\*[\s\S]*?\*\//g, '')), 'commande game : plus de tirage du jour');

/* (4) la carte Game */
const tir = app.slice(app.indexOf('<div class="carte" id="tirCarte">'), app.indexOf('<div class="carte" id="brainJeuCarte">')).replace(/<!--[\s\S]*?-->/g, '');
ok(tir.length > 1000 && !/faceJour|Face of the Day|today's draw/i.test(tir), 'carte Game : plus de bloc « hier » (#faceJour), plus de « today\'s draw »');
ok(/Add to this week's pot/.test(tir) && !/today's pot/i.test(tir), 'carte Game : le fund vise le pot de la semaine');
ok(/<b>02 · THE WEEK'S POT<\/b>/.test(app) && !/THE DAILY DRAW/.test(app), 'How it works : tuile 02 = le pot de la semaine');
const earn = app.slice(app.indexOf("if (!t || t.ok !== true || !t.semaine) throw new Error('non lu');"),app.indexOf("const j = await fetch('/api/missions'"));
ok(earn.length > 50 && /t\.semaine\.entrees/.test(earn) && /the pot was not read just now/.test(earn) && !/Yesterday|month/i.test(earn), 'Earn : tes entrees de la semaine et le pot (ou « not read ») — plus de tirage d hier ni de mois');

console.log(n + ' assertions, ' + ko + ' KO — NE PROUVE PAS une lecture reelle du pot de la semaine ni un partage reel');
if (ko) process.exitCode = 1;
