/* test-soleils-reprise.mjs — UNE MAP VIDE NE DOIT PAS LE RESTER, ET ELLE DOIT LE DIRE.
 *
 * ⛔⛔⛔ LE DEFAUT, LU DANS LE CODE LE 2026-09-30. Sur un demarrage a froid, `/api/trending` rend
 *      une charge PLACEHOLDER : `{ ok: true, lignes: [], enCours: true }` — le serveur DIT que son
 *      scan tourne. Le client faisait `if (!d.lignes.length) return` : il abandonnait EN SILENCE.
 *      Pas de reprise, pas de message, un univers vide sans explication, et seul un rechargement
 *      manuel pouvait le reparer.
 *      Le demarrage n a que DEUX occasions de reussir (`soleilsSurLaMap()` puis
 *      `charger().then(...)`) : si le scan dure plus longtemps que `charger()`, les deux tombent
 *      sur le placeholder et la map reste vide POUR TOUJOURS.
 *
 * ⛔⛔ ET CE CAS A ETE AGGRAVE LE MEME JOUR : la garde de forme du cache disque rejette le cache
 *     des qu un champ est ajoute a la charge. Chaque deploiement de ce genre fait donc demarrer le
 *     serveur SANS cache — donc en placeholder. Quatre fois ce jour-la. Une garde juste peut
 *     creuser un trou ailleurs, et c est pour ca que ce fichier existe.
 *
 * ⛔ LA REPRISE DOIT ETRE BORNEE. Sans borne, un serveur durablement muet ferait tourner une
 *   boucle de fetch dans le navigateur de quelqu un, pour rien — on aurait echange un ecran vide
 *   contre une batterie vide.
 *
 * ⚠️ BORNE : ce fichier lit le CODE. Il ne prouve pas qu un navigateur reprenne vraiment, ni que
 *    le serveur finisse son scan.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';

const brut = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const html = sansCommentaires(brut, { minRetire: 5000 });
const srv = sansCommentaires(readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8'), { minRetire: 3000 });
let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

cas('⛔⛔⛔ LE SERVEUR REND BIEN UNE CHARGE VIDE QUAND SON SCAN TOURNE', () => {
  /* ⛔⛔ SANS CE CAS, LE RESTE DU FICHIER GARDE UN PROBLEME IMAGINAIRE. C est la premisse :
   *     si le serveur ne rendait jamais de charge vide, aucune reprise ne serait necessaire. */
  assert.match(srv, /lignes: \[\]/, 'le placeholder ne rend plus une liste vide : la premisse a change');
  assert.match(srv, /enCours: true/, 'le serveur ne signale plus que son scan tourne');
  assert.match(srv, /return Promise\.resolve\(trendingPlaceholder\(\)\);/,
    'le placeholder n est plus servi : verifier si ce fichier a encore un objet');
});

cas('⛔⛔⛔ LE CLIENT REPREND AU LIEU D ABANDONNER EN SILENCE', () => {
  assert.match(html, /async function soleilsSurLaMap\(essai = 0\)/,
    'la fonction ne porte pas de compteur d essai : elle ne peut pas reprendre');
  assert.match(html, /soleilsSurLaMap\(essai \+ 1\)/, 'aucune reprise n est programmee');
  assert.match(html, /const REPRISES_SOLEILS = (\d+);/, 'la borne de reprise est introuvable');
});

cas('⛔⛔⛔ LA REPRISE S ARRETE — UNE BOUCLE SANS BORNE VIDE UNE BATTERIE', () => {
  /* ⛔⛔ LA GARDE LA PLUS IMPORTANTE DU FICHIER. Une reprise infinie remplacerait un ecran vide
   *     par un navigateur qui martele le serveur pour rien, chez quelqu un d autre. */
  assert.match(html, /essai < REPRISES_SOLEILS/, 'la reprise n est bornee par rien');
  const m = /const REPRISES_SOLEILS = (\d+);/.exec(html);
  const k = Number(m[1]);
  assert.ok(k >= 1 && k <= 10, 'la borne vaut ' + k + ' : hors de tout bon sens');
  /* ⛔ ET LE DELAI CROIT : marteler toutes les 100 ms serait une borne sur le NOMBRE sans borne
   *   sur la CHARGE. */
  assert.match(html, /1500 \* \(essai \+ 1\)/, 'le delai de reprise ne croit pas');
});

cas('⛔⛔⛔ L ATTENTE EST BORNEE — LE VRAI CAS N EST PAS LA CHARGE VIDE, C EST LA REQUETE QUI PEND', () => {
  /* ⛔⛔⛔ MESURE AU NAVIGATEUR SUR UN SERVEUR FROID, 2026-09-30 : les deux premiers
   *      `/api/trending` ont mis **44 SECONDES** (4 465 ms -> 48 371 ms). Le serveur porte pourtant
   *      `NEVER hang HTTP on cold scan` et rend un placeholder — mais le scan RPC monopolise la
   *      boucle d evenements de Node et la reponse attend. Pendant ces 44 s, AUCUNE reprise ne
   *      pouvait demarrer : ma premiere version bornait le NOMBRE d essais sans borner l ATTENTE,
   *      donc elle corrigeait un cas qui n arrive presque jamais.
   *    ⇒ Apres correction, mesure du meme ecran : 8 appels, chacun coupe a ~4 000 ms, message
   *      VISIBLE (« … (3/6)… ») et 24 cubes. */
  assert.match(html, /const ATTENTE_SOLEILS_MS = (\d+);/, 'aucune borne sur l attente : un fetch qui pend bloque tout');
  const ms = Number(/const ATTENTE_SOLEILS_MS = (\d+);/.exec(html)[1]);
  assert.ok(ms >= 1000 && ms <= 10000, 'l attente vaut ' + ms + ' ms : trop courte ou sans effet');
  assert.match(html, /new AbortController\(\)/, 'le fetch n est pas interruptible : la borne ne borne rien');
  assert.match(html, /ctrl\.abort\(\)/, 'le minuteur n interrompt rien');
  assert.match(html, /finally \{ if \(minuteur\) clearTimeout\(minuteur\); \}/,
    'le minuteur n est pas annule : il abort-erait une requete deja revenue');
  /* ⛔⛔ ET L ABANDON DOIT DECLENCHER UNE REPRISE, PAS ETRE AVALE. Le `catch` de cette fonction
   *     disait « pas de soleils cette fois : la map reste lisible sans » — or une map SANS soleils
   *     ET SANS blocks n est pas lisible, c est un ecran vide. */
  assert.match(html, /if \(!habitants\.length && essai < REPRISES_SOLEILS\) \{/,
    'un fetch interrompu ne declenche aucune reprise : l erreur est avalee');
});

cas('⛔⛔ UNE SEULE CHAINE DE REPRISE, PAS DEUX', () => {
  /* ⛔⛔ `soleilsSurLaMap()` est appele DEUX fois au demarrage (tout de suite, puis apres
   *     `charger()`). Ma premiere version lancait donc DEUX chaines paralleles — la trace reseau
   *     l a montre : les reprises partaient PAR PAIRES (49,8 s · 53,9 s · 58,4 s · 64,4 s, deux
   *     requetes a chaque fois). Deux fois plus de charge sur un serveur deja occupe a scanner,
   *     pour exactement la meme information. */
  assert.match(html, /let repriseSoleilsEnCours = false;/, 'rien ne marque qu une chaine de reprise tourne');
  assert.match(html, /if \(essai > 0 && !repriseSoleilsEnCours\) return;/,
    'une seconde chaine de reprise peut demarrer en parallele');
});

cas('⛔⛔ ON NE REPREND PAS SUR UNE REPONSE MAL FORMEE', () => {
  /* ⛔⛔ Une charge cassee ne se reparera pas toute seule : la marteler serait du bruit, et le
   *     visiteur attendrait 22 secondes pour rien. On ne reprend que sur un VIDE bien forme. */
  assert.match(html, /const reparable = Boolean\(d && d\.ok === true && Array\.isArray\(d\.lignes\)\);/,
    'la reprise ne distingue pas une charge vide d une charge cassee');
  assert.match(html, /if \(reparable && essai < REPRISES_SOLEILS\)/,
    'la reprise ne depend pas de ce que la reponse soit reparable');
});

cas('⛔⛔⛔ UN ECRAN VIDE N EST JAMAIS MUET', () => {
  /* ⛔⛔ « Rien » se lit comme « casse ». Un visiteur devant un univers vide part ; un visiteur
   *     qui lit une phrase attend. Et quand on renonce, on nomme QUI a lache — nous, pas la chaine :
   *     « ca ne marche pas » envoie chercher un defaut chez soi. */
  assert.match(html, /Reading the markets — the map fills as they come in/,
    'pendant la reprise, l ecran ne dit rien');
  assert.match(html, /that is us, not the chain/,
    'quand on renonce, l ecran ne dit pas qui a lache');
  /* ⛔ ET ON N ECRASE PAS LA NOTE SI DES CUBES SONT DEJA LA : un message d attente par-dessus une
   *   map vivante serait un mensonge. */
  assert.match(html, /if \(habitants\.length\) return;/,
    'la note peut ecraser un ecran qui a deja des cubes');
});

cas('⛔⛔⛔ LA PHRASE VA LA OU ELLE SE VOIT A 375 px — PAS DANS UN VOLET MASQUE', () => {
  /* ⛔⛔⛔ CE CAS EXISTE PARCE QUE J AI FAIT LA FAUTE, ET QUE LE TEST PRECEDENT ETAIT VERT PENDANT
   *      CE TEMPS. Ma premiere version n ecrivait que dans `#mapNote`, qui vit dans `.cote` — un
   *      volet MASQUE a 375 px. Mesure au navigateur : `visible: false`, largeur 0. La phrase
   *      partait dans le vide sur tout telephone, c est-a-dire exactement la ou un univers vide
   *      fait partir les gens. Un test qui verifie la PRESENCE d un message sans verifier OU il
   *      atterrit garde une illusion.
   *    ⛔ MEME FAUTE QUE `message-juste-dans-un-volet-masque` : 25 taps sur 7 sessions, deja payes.
   *    ⚠️ ET CE FICHIER NE PEUT PAS MESURER LA VISIBILITE — il lit du texte. Ce qu il TIENT, c est
   *      que la phrase part dans DEUX cibles dont une est hors du volet lateral. La visibilite,
   *      elle, se mesure au navigateur, et elle l a ete. */
  assert.match(html, /for \(const id of \['#mapNote', '#mapCentre'\]\)/,
    'la phrase ne vise pas `#mapCentre` : elle resterait invisible sur telephone');
  /* ⛔ `#mapCentre` DOIT VIVRE HORS DE `.cote`. S il y entrait un jour, les deux cibles seraient
   *   masquees ensemble et cette garde deviendrait decorative. */
  const iCentre = html.indexOf('id="mapCentre"');
  const iCote = html.indexOf('class="cote');
  assert.ok(iCentre > 0, '`#mapCentre` a disparu de la page');
  assert.ok(iCote < 0 || iCentre < iCote,
    '`#mapCentre` est passe APRES le volet lateral : verifier qu il n y est pas entre');
});

cas('⛔⛔⛔ LE PREMIER ECRAN PARLE — LES DIX SECONDES ORDINAIRES, PAS SEULEMENT LE CAS RARE', () => {
  /* ⛔⛔⛔ MESURE EN PRODUCTION, 375 px, 2026-09-30 : s=4 : 0 bloc · s=7 : 0 bloc · s=10 : 183
   *      blocs. Dix secondes d ecran noir pendant lesquelles `#mapCentre` est VIDE. Ma reprise ne
   *      couvrait PAS ce cas : elle ne parle que si `/api/trending` echoue ou pend, or en
   *      production il REUSSIT. Je corrigeais un cas rare (44 s sur un fork froid) en laissant le
   *      cas ORDINAIRE entier.
   *    ⛔ Un ecran noir muet se lit « casse », et personne ne donne dix secondes a une page qui ne
   *      dit rien. */
  assert.match(html, /function direPremierEcran\(txt\)/, 'rien ne parle avant le premier bloc');
  assert.match(html, /direPremierEcran\('Reading the chain/,
    'le premier ecran ne dit pas qu une lecture est en cours');
  /* ⛔⛔ ET IL COMPTE `.bloc`, PAS `[data-adr]`. Ce dernier designe les puces du Feed et les cartes
   *     My blocks — JAMAIS les cubes de la map. Il rendait 0 pendant que 184 cubes etaient poses
   *     et visibles, et j ai bati un diagnostic entier dessus. Compter la mauvaise chose donne un
   *     chiffre qui a l air juste. */
  assert.match(html, /if \(document\.querySelectorAll\('\.bloc'\)\.length\) return;/,
    'le premier ecran ne verifie pas les VRAIS cubes de la map');
  assert.ok(!/querySelectorAll\('\[data-adr\]'\)\.length\) return;/.test(html),
    'le mauvais selecteur est revenu : `[data-adr]` ne compte pas les cubes de la map');
});

console.log('✓ test-soleils-reprise : ' + n + ' cas');
console.log('   Une map vide reprend — 5 fois, delai croissant, 22,5 s au plus — et elle le DIT.');
console.log('   Elle ne reprend pas sur une charge cassee, et n ecrase pas un ecran deja peuple.');
console.log('   ⚠️ NE PROUVE PAS qu un navigateur reprenne vraiment, ni que le scan aboutisse.');
