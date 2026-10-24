/* test-jeu-choix-20261018.mjs - LE BANDEAU DU GAME EST UN MENU DE CHOIX (Phil 2026-10-18 : « facilite de choix », « ameliore l ux »).
 * AFFIRME (lecture de app.html) : (1) six tuiles, dans l ordre Roll, Ticket, Week pass, Its brain, Skins, Missions, chacune vers une carte
 *   qui EXISTE ; (2) les prix des tuiles viennent de la fiche servie (rollsCfg), jamais tapes ; un score deja peint n est pas ecrase ;
 *   (3) la tuile du brain dit On/Off et la depense, peinte par bjPeindre ; (4) un clic amene a la carte et ne donne le focus qu a un
 *   bouton VISIBLE ; (5) aucune tuile ne porte un prix en dur.
 * NE PROUVE PAS : le rendu (verifie au navigateur). */
import { readFileSync } from 'node:fs';
let n = 0;
const vu = (c, m) => { if (!c) { console.error('KO ' + m); process.exit(1); } n++; };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const b0 = app.indexOf('<div class="jeuBandeau"'), b1 = app.indexOf('</div>', b0);
const band = app.slice(b0, b1);
const tuiles = [...band.matchAll(/<button[^>]*data-jeu="([^"]+)"[^>]*><b>([^<]+)<\/b>/g)].map((m) => [m[1], m[2]]);
/* 2026-10-18 : + Duels, 7e tuile, CACHEE tant que /api/duels ne sert pas de contrat */
/* 2026-10-23 : + Slots, 8e tuile, CACHEE tant que /api/slots ne sert pas de contrat (data-slots="1" -> 4 colonnes, 2 sur telephone) */
vu(JSON.stringify(tuiles.map((t) => t[1])) === JSON.stringify(['Roll', 'Ticket', 'Week pass', 'Its brain', 'Skins', 'Missions', 'Duels', 'Slots']), 'huit choix dans l ordre (lus : ' + tuiles.map((t) => t[1]).join(', ') + ')');
/* 2026-10-24 (UN JEU A LA FOIS) : « 2 colonnes sur telephone » est remplace par UNE rangee qui defile de cote (<= 600 px) — ce banc
 *   affirmait l ancienne grille ; il affirme la rangee (le selecteur [data-slots="1"] repete dans le media, sinon 4 colonnes a 375 px) */
vu(/<button[^>]*data-jeu="slotsCarte"[^>]*\bhidden\b/.test(band) && /if \(bd\) bd\.dataset\.slots = on \? '1' : '0';/.test(app) && /\.jeuBandeau\[data-slots="1"\]\{grid-template-columns:repeat\(4,/.test(app)
  && /@media \(max-width:600px\)\{\n  \.jeuBandeau,\.jeuBandeau\[data-n="7"\],\.jeuBandeau\[data-slots="1"\]\{display:flex;overflow-x:auto;/.test(app), 'Slots : tuile cachee sans contrat ; avec elle 4 colonnes, une rangee qui defile sur telephone');
vu(/<button[^>]*data-jeu="duelsCarte"[^>]*\bhidden\b/.test(band) && /bd\.dataset\.n = on \? '7' : '6';/.test(app) && /\.jeuBandeau\[data-n="7"\]\{grid-template-columns:repeat\(4,/.test(app), 'Duels : tuile cachee sans contrat ; 7 tuiles -> 4 colonnes');
for (const [carte, nom] of tuiles) vu(app.split('id="' + carte + '"').length === 2, nom + ' mene a #' + carte + ' qui existe une fois');
for (const f of [...band.matchAll(/data-focus="([^"]+)"/g)].map((m) => m[1])) vu(app.split('id="' + f + '"').length >= 2, 'focus vers #' + f + ' qui existe');
vu(!/\d+(\.\d+)? USDC/.test(band.replace(/<!--[\s\S]*?-->/g, '')), 'aucun prix tape dans les tuiles');
const pb = app.slice(app.indexOf('function poserBoutonsRolls('), app.indexOf('async function envoyerAppels('));
vu(/jb\('jbPass', usdcTexte\(rollsCfg\.prixPass\) \+ ' USDC'\)/.test(pb) && /rollsCfg\.passRolls \+ ' rolls'/.test(pb), 'tuile Week pass : prix et rolls de la fiche servie');
vu(/if \(\$\('#jbRoll'\) && \$\('#jbRoll'\)\.textContent === '⚄'\) jb\('jbRollTxt', usdcTexte\(rollsCfg\.prixRoll\)/.test(pb), 'tuile Roll : prix servi, sans ecraser un score deja peint');
vu(/jb\('jbBrain', on \? 'On' : 'Off'\)/.test(app.slice(app.indexOf('function bjPeindre('), app.indexOf('function bjAllumer('))), 'tuile du brain : On/Off peint par bjPeindre');
/* 2026-10-24 (UN JEU A LA FOIS) : le clic ne fait plus que DEFILER — il passe par montrerJeu (la carte choisie d abord) ; la garde
 *   « focus seulement sur un bouton visible » vit dans montrerJeu. Le comportement est EXECUTE par test-jeu-focus-20261024. */
const choix = app.slice(app.indexOf('function montrerJeu('), app.indexOf('/* ══ FIN DU CHOIX DU JEU */'));
vu(/for \(const b of jeuTuiles\(\)\) b\.addEventListener\('click', \(\) => \{ montrerJeu\(b\.getAttribute\('data-jeu'\), b\.getAttribute\('data-focus'\)/.test(choix)
  && /scrollIntoView/.test(choix) && /const visible = !!el && !el\.hidden && el\.offsetParent !== null;/.test(choix), 'clic : montrerJeu (la carte choisie, puis amenee) ; focus seulement sur un bouton visible');
/* 2026-10-18 : /app.html#game (ou #missions) ouvrait la Map */
vu(/if \(\['game', 'missions'\]\.includes\(\(location\.hash \|\| ''\)\.replace\(\/\^#\/, ''\)\.split\('\?'\)\[0\]\)\) \{\n  setTimeout\(\(\) => allerA\('missions'\), 0\);/.test(app) && /if \(h === 'game' \|\| h === 'missions'\) allerA\('missions'\);/.test(app), 'lien #game / #missions : ouvre l onglet Game (au chargement et au changement)');
/* revue adverse 2026-10-18 (MOYEN) : suite arretee apres des envois confirmes */
const pnc = app.slice(app.indexOf('function phraseNonConfirme('), app.indexOf('function montrerSettled('));
vu(/if \(r && Array\.isArray\(r\.hashes\) && r\.hashes\.length\) return 'Stopped after '/.test(pnc) && pnc.indexOf('Stopped after') < pnc.indexOf("return prefixe + ': ' + String"), 'une suite arretee apres des envois confirmes ne dit pas « Not rolled »');
console.log('ok jeu-choix - ' + n + ' assertions ; NE PROUVE PAS le rendu');
