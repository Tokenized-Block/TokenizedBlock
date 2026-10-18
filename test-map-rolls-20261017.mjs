/* test-map-rolls-20261017.mjs — LES ROLLS DU JEU SE VOIENT SUR LA MAP, ET RESTENT HORS DU FIL LIVE (Phil 2026-10-17 23:50).
 *
 * AFFIRME (lecture des sources SERVIES, serveur-web.js et app.html) :
 *   (a) serveur : POST /api/jeu/roll et GET /api/jeu/rolls existent, avec leurs plafonds LUS dans le code (200 gardes, 30 POST/min/IP,
 *       corps <= 256 octets), la forme {bloc, score 0..5} exigee et tout le reste refuse en 400 ; le plafond IP est verifie AVANT de lire
 *       le corps ; aucune identite n est gardee ; rien n est ecrit sur disque ; aucune lecture de chaine.
 *   (b) app : roll() signale le roll APRES avoir calcule le score (POST /api/jeu/roll, corps {bloc, score}) ; la Map relit
 *       /api/jeu/rolls toutes les 10 s et SEULEMENT quand elle est a l ecran (document.hidden + #v-map.on), fait rouler le block UNIT
 *       avec l onde et le pulse DEJA la, ecrit les 5 derniers dans #mapRolls ; et liveEvts n est jamais touche par les rolls.
 *   (c) les mutants : les memes assertions, rejouees sur une copie MUTEE du source (plafond retire, garde de visibilite retiree, POST
 *       retire), DOIVENT rougir. La copie vit en memoire : le disque n est jamais touche, il n y a rien a restaurer.
 *
 * NE PROUVE PAS : que le pulse se VOIT a l ecran (seul un navigateur le dit — mesure du 2026-10-17, serveur local 9097), ni le
 *   comportement HTTP reel des routes (sonde a part, meme soir : 200 / 400 / 429 lus). Une regle lue n est pas une regle executee. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };

/* ── (a) le serveur ─────────────────────────────────────────────────────────────────────────────────────────── */
function verifierServeur(src) {
  const debut = src.indexOf("if (chemin === '/api/jeu/rolls' || chemin === '/api/jeu/roll')");
  assert.ok(debut > 0, 'la route /api/jeu est introuvable');
  const fin = src.indexOf('/* ══ BLOCK MISSIONS', debut);
  assert.ok(fin > debut, 'la route /api/jeu ne precede pas les missions');
  const bloc = src.slice(debut, fin);
  /* les plafonds, LUS dans le code et non recopies */
  const max = /const JEU_ROLLS_MAX = (\d+);/.exec(src), ip = /const JEU_ROLLS_IP_MINUTE = (\d+);/.exec(src), corps = /const JEU_ROLL_CORPS_MAX = (\d+);/.exec(src);
  assert.ok(max && Number(max[1]) === 200, 'JEU_ROLLS_MAX doit valoir 200');
  assert.ok(ip && Number(ip[1]) === 30, 'JEU_ROLLS_IP_MINUTE doit valoir 30');
  assert.ok(corps && Number(corps[1]) === 256, 'JEU_ROLL_CORPS_MAX doit valoir 256');
  /* GET : la liste bornee ; POST seulement pour l ecriture */
  assert.ok(/if \(chemin === '\/api\/jeu\/rolls'\) \{[\s\S]*?req\.method !== 'GET' && req\.method !== 'HEAD'[\s\S]*?rolls: jeuRolls\.slice\(-JEU_ROLLS_MAX\)/.test(bloc), 'GET /api/jeu/rolls rend les JEU_ROLLS_MAX derniers');
  assert.ok(/if \(req\.method !== 'POST'\) \{ rendreJ\(405/.test(bloc), 'POST /api/jeu/roll refuse les autres methodes');
  /* le plafond par IP, AVANT de lire le corps */
  const iIp = bloc.indexOf('if (nJ > JEU_ROLLS_IP_MINUTE)'), iCorps = bloc.indexOf("req.on('data'");
  assert.ok(iIp > 0 && iCorps > iIp, 'le plafond par IP est verifie AVANT la lecture du corps');
  assert.ok(/rendreJ\(429/.test(bloc.slice(iIp, iCorps)), 'le plafond par IP rend 429');
  /* le corps : octets comptes, 400 au-dela ; forme exacte, 400 sinon */
  assert.ok(/octetsJ \+= c\.length/.test(bloc) && /if \(octetsJ > JEU_ROLL_CORPS_MAX\) \{ tropJ = true; rendreJ\(400/.test(bloc), 'un corps trop long rend 400 (octets comptes)');
  assert.ok(/Object\.keys\(j\)\.length === 2/.test(bloc) && /Number\.isSafeInteger\(j\.bloc\) && j\.bloc > 0/.test(bloc) && /j\.score >= 0 && j\.score <= 5/.test(bloc), 'la forme {bloc entier > 0, score 0..5} et rien d autre');
  assert.ok(/if \(!forme\) \{ rendreJ\(400/.test(bloc) && /catch \{ rendreJ\(400, \{ ok: false, pourquoi: 'not JSON' \}\)/.test(bloc), 'tout le reste -> 400');
  /* ce qui est garde : t, bloc, score — et rien d autre ; en memoire, borne */
  assert.ok(/jeuRolls\.push\(\{ t: Date\.now\(\), bloc: j\.bloc, score: j\.score \}\)/.test(bloc), 'seuls t, bloc, score sont gardes');
  assert.ok(/if \(jeuRolls\.length > JEU_ROLLS_MAX\) jeuRolls\.splice\(0, jeuRolls\.length - JEU_ROLLS_MAX\)/.test(bloc), 'la memoire est bornee a JEU_ROLLS_MAX');
  assert.ok(!/ipJ/.test(bloc.slice(bloc.indexOf('jeuRolls.push'))) && !/writeFile|appendFile|ecrire[A-Z]/.test(bloc), 'aucune identite dans l enregistrement, rien sur disque');
  assert.ok(!/rpcServeur|rpcHistoire|rpcRails|fetch\(/.test(bloc), 'aucune lecture de chaine ni appel sortant dans la route');
  /* hors du fil Live : /api/live ne touche pas jeuRolls, et la route jeu ne touche pas le fil */
  assert.ok(!/liveEvts|evenementsLive|\/api\/live/.test(bloc), 'la route jeu ne touche pas le fil Live');
  const horsRoute = src.slice(0, debut) + src.slice(fin), usages = horsRoute.match(/jeuRolls\.(push|slice|splice|length|shift|unshift)/g) || [];
  assert.ok(/const jeuRolls = \[\];/.test(horsRoute) && usages.length === 0, 'jeuRolls n est utilise nulle part hors de sa route (vu ' + usages.length + ' usage(s))');
}
verifierServeur(srv); vu(true, '(a) serveur : routes, plafonds 200 / 30 par min par IP / 256 octets, forme exacte, 400 sinon, memoire seule');

/* ── (b) l app ──────────────────────────────────────────────────────────────────────────────────────────────── */
function verifierApp(h) {
  /* le POST apres le roll : dans roll(), APRES le score */
  const iRoll = h.indexOf('async function roll() {');
  assert.ok(iRoll > 0, 'roll() introuvable');
  const corpsRoll = h.slice(iRoll, h.indexOf('const rollDerniers = [];', iRoll));
  /* 2026-10-18 00:40 (guest retire) : le score n existe qu avec un wallet -> `const s = c ? scoreFaces(` */
  const iScore = corpsRoll.indexOf('const s = c ? scoreFaces('), iSignal = corpsRoll.indexOf('if (s) void signalerRoll(cible, s.score);');
  assert.ok(iScore > 0 && iSignal > iScore, 'roll() signale le roll APRES avoir calcule le score');
  const iSig = h.indexOf('async function signalerRoll(bloc, score) {');
  assert.ok(iSig > 0, 'signalerRoll introuvable');
  const sig = h.slice(iSig, h.indexOf('const jourDeApp', iSig));
  assert.ok(/fetch\('\/api\/jeu\/roll', \{ method: 'POST'/.test(sig) && /body: JSON\.stringify\(\{ bloc, score \}\)/.test(sig), 'signalerRoll fait POST /api/jeu/roll avec {bloc, score}');
  assert.ok(/score < 0 \|\| score > 5\) return false/.test(sig), 'signalerRoll refuse un score hors 0..5 avant d envoyer');
  /* la Map : relecture toutes les 10 s, SEULEMENT visible */
  const iMs = h.indexOf('const ROLLS_MAP_MS = ');
  assert.ok(iMs > 0 && /const ROLLS_MAP_MS = 10000;/.test(h.slice(iMs, iMs + 40)), 'la Map relit toutes les 10 s');
  assert.ok(/setInterval\(\(\) => \{ if \(mapVisible\(\)\) void peindreRollsMap\(\); \}, ROLLS_MAP_MS\);/.test(h), 'le minuteur ne relit que si la Map est visible');
  const iVis = h.indexOf('function mapVisible() {');
  const vis = h.slice(iVis, h.indexOf('}', iVis + 60));
  assert.ok(iVis > 0 && /!document\.hidden/.test(vis) && /getElementById\('v-map'\)/.test(vis) && /classList\.contains\('on'\)/.test(vis), 'mapVisible = page visible ET #v-map.on');
  const iPeindre = h.indexOf('async function peindreRollsMap() {');
  const peindre = h.slice(iPeindre, h.indexOf('setInterval(() => { if (mapVisible())', iPeindre));
  assert.ok(iPeindre > 0 && /^async function peindreRollsMap\(\) \{\r?\n  if \(!mapVisible\(\) \|\| rollsEnCours\) return;/.test(peindre), 'peindreRollsMap sort AVANT tout fetch si la Map n est pas visible');
  assert.ok(peindre.indexOf('if (!mapVisible()') < peindre.indexOf("fetch('/api/jeu/rolls'"), 'la garde precede le fetch');
  /* le dessin : le langage DEJA la (onde + .pulse) sur UNIT, le mot « roll N/5 », la legende */
  const iRouler = h.indexOf('function rouler(h, score) {');
  const rouler = h.slice(iRouler, iRouler + 400);
  assert.ok(iRouler > 0 && /onde\(UNIT_APP, accentVif\(\), 'roll ' \+ score \+ '\/5'\)/.test(rouler), 'l onde du moteur 3D porte le mot « roll N/5 » sur UNIT');
  assert.ok(/h\.el\.classList\.remove\('pulse'\);[\s\S]*?void h\.el\.offsetWidth;[\s\S]*?h\.el\.classList\.add\('pulse'\)/.test(rouler), 'le pulse est celui des echanges lus (.pulse, relance par reflow)');
  assert.ok(/let h = habitantDe\(UNIT_APP\);/.test(peindre), 'le block roule est UNIT, trouve parmi les habitants');
  /* mesure 2026-10-17 : /api/nos-blocks ne sert PAS UNIT — absent de la carte, il y vient (meme geste que poserNosBlocks), sinon le roll est perdu */
  assert.ok(/if \(!h && neufs\.length\) \{[\s\S]*?creerHabitant\(\{ jeton: UNIT_APP, symbole: \(c && c\.symbole\) \|\| 'UNIT', vie: null \}\); if \(!anim\) animer\(\);/.test(peindre), 'UNIT absent de la carte est pose avant de rouler');
  /* Phil 2026-10-18 12:20 : la legende texte est retiree (« pourquoi t as ecrit ca ») — elle reste VIDE ; l onde dit le roll */
  assert.ok(/leg\.textContent = '';/.test(peindre) && !/'Rolls on UNIT: '/.test(peindre), 'la legende reste vide (decision de Phil), l onde porte le roll');
  assert.ok(/<span id="mapRolls" class="mapRolls"><\/span>/.test(h) && /\.mapRolls:empty\{display:none\}/.test(h), '#mapRolls existe dans .mapLeg et disparait vide');
  assert.ok(h.indexOf('<span id="mapRolls"') > h.indexOf('<span id="mapEtat">') && h.indexOf('<span id="mapRolls"') < h.indexOf('<p class="note" id="mapHookedPath"'), '#mapRolls est dans la legende de la Map, apres #mapEtat');
  /* « nouveau » sans comparer deux horloges, historique non rejoue, rafale bornee */
  assert.ok(/maintenant - r\.t <= ecoule/.test(peindre) && /performance\.now\(\)/.test(peindre), 'l age d un roll se mesure avec l horloge du serveur et le temps ecoule ici');
  assert.ok(/neufs\.slice\(-3\)/.test(peindre) && /await dormir\(450\)/.test(peindre), 'au plus 3 pulses par passage, espaces');
  /* en ouvrant la Map : relecture immediate */
  assert.ok(/if \(nom === 'map'\) void peindreRollsMap\(\);/.test(h), 'ouvrir la Map relit les rolls tout de suite');
  /* hors du fil Live */
  assert.ok(!/liveEvts/.test(peindre) && !/liveEvts/.test(rouler) && !/liveEvts/.test(sig), 'les rolls ne touchent jamais liveEvts');
  assert.ok(!/cleEvtLive|lireLive|rafraichirApresEchanges/.test(peindre + sig), 'les rolls ne passent par aucune fonction du fil Live');
}
verifierApp(html); vu(true, '(b) app : POST apres le score ; relecture 10 s seulement Map visible ; onde + pulse sur UNIT ; legende ; hors fil Live');

/* ── (c) les mutants : chaque garde, retiree, DOIT rougir ───────────────────────────────────────────────────── */
function rougit(fn, src, nom) {
  let rouge = false;
  try { fn(src); } catch (_) { rouge = true; }
  assert.ok(rouge, 'MUTANT SURVIVANT : ' + nom + ' — la garde ne voit pas ce defaut');
  n += 1;
}
const muter = (src, de, a, nom) => { assert.ok(src.includes(de), 'ancre du mutant absente : ' + nom); return src.replace(de, a); };
/* serveur */
rougit(verifierServeur, muter(srv, "if (nJ > JEU_ROLLS_IP_MINUTE) { rendreJ(429, { ok: false, pourquoi: 'too many rolls from here: ' + JEU_ROLLS_IP_MINUTE + ' a minute' }); return; }", '', 'm1'), 'm1 serveur : plafond par IP retire');
rougit(verifierServeur, muter(srv, 'const JEU_ROLLS_IP_MINUTE = 30;', 'const JEU_ROLLS_IP_MINUTE = 3000;', 'm2'), 'm2 serveur : plafond par IP a 3000');
rougit(verifierServeur, muter(srv, 'if (octetsJ > JEU_ROLL_CORPS_MAX) { tropJ = true; rendreJ(400', 'if (false) { tropJ = true; rendreJ(400', 'm3'), 'm3 serveur : borne du corps retiree');
rougit(verifierServeur, muter(srv, 'const JEU_ROLL_CORPS_MAX = 256;', 'const JEU_ROLL_CORPS_MAX = 65536;', 'm4'), 'm4 serveur : corps a 64 Ko');
rougit(verifierServeur, muter(srv, 'if (jeuRolls.length > JEU_ROLLS_MAX) jeuRolls.splice(0, jeuRolls.length - JEU_ROLLS_MAX);', '', 'm5'), 'm5 serveur : memoire sans borne');
rougit(verifierServeur, muter(srv, 'jeuRolls.push({ t: Date.now(), bloc: j.bloc, score: j.score });', 'jeuRolls.push({ t: Date.now(), bloc: j.bloc, score: j.score, ip: ipJ });', 'm6'), 'm6 serveur : une identite (IP) gardee');
rougit(verifierServeur, muter(srv, "Number.isSafeInteger(j.bloc) && j.bloc > 0 && Number.isInteger(j.score) && j.score >= 0 && j.score <= 5", "Number.isSafeInteger(j.bloc) && j.bloc > 0 && Number.isInteger(j.score)", 'm7'), 'm7 serveur : score non borne');
/* app */
rougit(verifierApp, muter(html, 'if (s) void signalerRoll(cible, s.score);', '', 'm8'), 'm8 app : le roll n est plus signale');
rougit(verifierApp, muter(html, 'setInterval(() => { if (mapVisible()) void peindreRollsMap(); }, ROLLS_MAP_MS);', 'setInterval(() => { void peindreRollsMap(); }, ROLLS_MAP_MS);', 'm9'), 'm9 app : le minuteur relit sans regarder la visibilite');
/* ⛔ ancres sur UNE ligne : le checkout Windows est en CRLF, un `\n` dans l ancre ne matcherait pas (test-tests-portables) */
rougit(verifierApp, muter(html, 'if (!mapVisible() || rollsEnCours) return;', 'if (rollsEnCours) return;', 'm10'), 'm10 app : peindreRollsMap lit meme Map cachee');
rougit(verifierApp, muter(html, 'return !document.hidden && !!v && v.classList.contains(\'on\');', 'return !!v && v.classList.contains(\'on\');', 'm11'), 'm11 app : mapVisible ignore document.hidden');
rougit(verifierApp, muter(html, 'const ROLLS_MAP_MS = 10000;', 'const ROLLS_MAP_MS = 1000;', 'm12'), 'm12 app : relecture toutes les secondes');
rougit(verifierApp, muter(html, "onde(UNIT_APP, accentVif(), 'roll ' + score + '/5');", '', 'm13'), 'm13 app : plus d onde (le roll ne se voit plus)');
rougit(verifierApp, muter(html, 'if (!h || !neufs.length) return;', "if (!h || !neufs.length) return; liveEvts.push({ type: 'ROLL' });", 'm14'), 'm14 app : un roll pousse dans liveEvts (fil Live)');
rougit(verifierApp, muter(html, "if (nom === 'map') void peindreRollsMap();", '', 'm15'), 'm15 app : ouvrir la Map ne relit plus');
rougit(verifierApp, muter(html, "try { h = creerHabitant({ jeton: UNIT_APP, symbole: (c && c.symbole) || 'UNIT', vie: null }); if (!anim) animer(); } catch (_) { h = null; }", 'h = null;', 'm16'), 'm16 app : UNIT absent de la carte n est plus pose (roll perdu)');
/* ⛔ la copie mutee ne vit qu en memoire : rien n a ete ecrit, rien a restaurer — le disque est relu pour le prouver */
vu(readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8') === srv && readFileSync(new URL('./app.html', import.meta.url), 'utf8') === html, 'les sources sur disque sont intactes apres les mutants');

console.log('ok map-rolls-20261017 — ' + n + ' assertions (2 series + 16 mutants tues + disque intact)');
console.log('   NE PROUVE PAS : le pulse a l ecran ni les codes HTTP reels — mesures a part (navigateur, sonde), voir le rapport du 2026-10-17.');
