/* test-tweet-affiche.mjs — LE POST GRAVE EST MONTRE, AVEC SA RESERVE.
 *
 * ⛔⛔ LE DEFAUT (Phil, 2026-09-23 : « je vois pas le block associe au post sur X »).
 *     `face.js` VALIDE le champ `tweet` et le STOCKE, Create l ECRIT dans la face gravee, et le
 *     lien part sur la chaine avec le block. Rien ne le relisait jamais pour l afficher.
 *     ⇒ Une valeur ECRITE SUR LA CHAINE PUIS JAMAIS RENDUE est un defaut : elle a coute du gas et
 *       n informe personne. C est le jumeau de « une valeur LUE puis JETEE ».
 *
 * ⛔ CE QUE CE TEST EXIGE, ET POURQUOI CHAQUE POINT :
 *    · le lien est REVALIDE a l affichage, a la forme canonique EXACTE. Il a deja ete valide a la
 *      gravure, mais il peut revenir du stockage local d une autre version, et
 *      `javascript://x.com/jack/status/20` passe un controle d HOTE. La garde appartient la ou le
 *      lien devient CLIQUABLE — `ssrf-guard-must-run-per-hop` ;
 *    · la reserve voyage AVEC le lien : on n a jamais ouvert ce post. Le montrer sans le dire
 *      fabriquerait une association qu on n a pas mesuree ;
 *    · une face illisible ne montre RIEN — elle n invente pas de lien.
 * ⛔ CE QU IL NE PROUVE PAS : que le post existe ni qu il appartienne au createur. Personne ici ne
 *    le verifie, et c est precisement ce que la phrase affichee reconnait.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('la page porte l element qui recoit le lien, et il demarre CACHE', () => {
  /* ⛔⛔ CE CAS EPINGLAIT LA BALISE EXACTE (`<p class="note" …>`). Le jour ou l element a du porter
   *     des boutons, il est devenu un `<div>` — et le test a accuse sa DISPARITION alors qu il
   *     etait la. Une garde qui verifie la forme plutot que la propriete casse a chaque evolution
   *     legitime, et on finit par la desactiver. On verifie donc ce qui COMPTE : l element existe,
   *     et il demarre cache — sinon un reste du block precedent resterait a l ecran. */
  assert.match(html, /id="pTweet"/, 'l element #pTweet a disparu : le lien grave redeviendrait invisible');
  const i = html.indexOf('id="pTweet"');
  const balise = html.slice(html.lastIndexOf('<', i), html.indexOf('>', i) + 1);
  assert.match(balise, /\bhidden\b/,
    'l element #pTweet ne demarre plus cache : le post du block precedent resterait visible');
});

const d = html.indexOf("const elTweet = $('#pTweet');");
assert.ok(d > 0, 'le rendu du post grave est introuvable');
/* ⛔⛔ FENETRE BORNEE PAR LE CODE, PAS PAR UN NOMBRE. Elle valait 1 800 caracteres en dur ; le jour
 *     ou le rendu a gagne un commentaire, `catch (_)` est tombe DEHORS et le test a accuse son
 *     absence — une garde qui rate sa cible par cadrage, pas par defaut du code. Un nombre choisi
 *     a la main se perime au premier ajout. On s arrete a la fin reelle du bloc. */
const finBloc = html.indexOf('await dormir(', d);
const src = html.slice(d, finBloc > d ? finBloc : d + 4000);
assert.ok(src.length > 800 && src.length < 8000,
  'extraction du rendu suspecte (' + src.length + ' car.) : le test lirait autre chose');

v('le lien est relu depuis la FACE, pas reconstruit', () => {
  assert.match(src, /faceConnue\(adr\)/, 'le rendu ne lit plus la face gravee');
  assert.match(src, /f\.tweet/, 'le champ grave n est plus lu');
});

v('⛔ quand le cache local est muet, on DEMANDE A LA CHAINE', () => {
  /* ⛔⛔ LE DEFAUT QUE CE CAS EMPECHE DE REVENIR, mesure le 2026-09-24. Le rendu ne lisait que
   *     `faceConnue()` — la memoire de CE navigateur, remplie uniquement quand c est lui qui a cree
   *     le block. Ouvert depuis une autre machine, ou apres un vidage, un post pourtant grave
   *     devenait invisible. Verifie sur un block reel : `/api/face/0xb2…a042` rend bien son post,
   *     et l ecran n affichait rien.
   *   ⛔ ET LE PIRE ETAIT LA PHRASE D A COTE : « it cannot be changed » est une affirmation sur la
   *     CHAINE, appuyee sur une valeur lue dans un cache local. On ne peut pas promettre
   *     l immuabilite a partir d une source mutable. */
  assert.match(src, /faceDeLaChaine\(adr\)/,
    'le rendu ne consulte plus la chaine quand le cache est muet : un post grave sur une autre '
    + 'machine redevient invisible, sous une phrase qui promet qu il ne peut pas changer');
  assert.match(html, /async function faceDeLaChaine\(/,
    'la lecture on-chain de la face a disparu');
  assert.match(html, /'\/api\/face\/'/,
    'plus aucune lecture de la route qui resout la face sur la chaine');
});

v('le lien est REVALIDE a la forme canonique avant de devenir cliquable', () => {
  assert.match(src, /\^https:\\\/\\\/x\\\.com\\\/\[A-Za-z0-9_\]\{1,15\}\\\/status\\\/\\d\{1,25\}\$/,
    'la revalidation a disparu : un javascript: deguise passerait un controle d hote');
});

v('le lien s ouvre sans donner la main a la page cible', () => {
  assert.match(src, /a\.rel = 'noopener noreferrer';/, 'rel noopener a disparu');
  assert.match(src, /a\.target = '_blank';/, 'le post remplacerait l app dans l onglet');
});

v('la reserve est affichee AVEC le lien, jamais separee', () => {
  /* ⛔⛔ CE CAS EPINGLAIT LA PHRASE EXACTE « We never opened it ». Reformuler la reserve — la
   *     raccourcir, la deplacer sous les boutons — le faisait rougir alors que la reserve etait
   *     toujours la, et toujours vraie. Un test qui verrouille des MOTS empeche d ameliorer un
   *     texte ; il doit verrouiller ce que le texte AFFIRME.
   *   ⇒ On exige les trois choses qu on ne peut pas prouver et qu il faut donc dire :
   *     on n a pas ouvert le post · on n etablit pas a qui il appartient · la gravure est definitive. */
  /* ⛔⛔ CE CAS A ETE RETOURNE LE 2026-09-25, ET C EST LE POINT LE PLUS IMPORTANT DU FICHIER.
   *     Il exigeait la phrase « we have not opened it ». Elle etait vraie tant qu on affichait un
   *     LIEN. Depuis qu on affiche le CONTENU — demande a X par notre serveur — elle est FAUSSE.
   *     Garder un texte rassurant qui ne decrit plus ce qu on fait serait pire que l ancien
   *     silence : c est precisement le genre de phrase qu on ne relit jamais.
   *   ⇒ On INTERDIT desormais cette affirmation, et on exige celle qui reste vraie : la gravure
   *     prouve le LIEN, jamais l appartenance. */
  const rendu = html.slice(html.indexOf('async function peindrePostGrave('),
    html.indexOf('function allerTokeniserUnPost('));
  assert.ok(rendu.length > 800, 'le rendu du post est introuvable : ce test ne garde plus rien');
  assert.doesNotMatch(rendu + src, /we have not opened it|we never opened it/i,
    'la page affirme encore ne pas avoir ouvert le post, alors qu elle en affiche le contenu');
  assert.match(rendu, /never who the post belongs to/i,
    'la reserve sur l APPARTENANCE a disparu : montrer le contenu fabriquerait une association '
    + 'qu on n a jamais mesuree');
  assert.match(rendu, /fetched by us/i,
    'on ne dit plus que c est NOUS qui sommes alles chercher ce contenu');
  assert.match(src, /cannot be changed/, 'le caractere definitif de la gravure n est plus dit');
});

v('⛔ les deux boutons existent, et celui qui cree mene au bon champ', () => {
  /* Phil, 2026-09-24 : « un bouton creer le post tokenize et un bouton voir celui du block ».
   * ⛔ Le bouton de creation reutilise le chemin DEJA cable pour `#tkGo` : un jumeau recopie se
   *   serait desynchronise au premier changement de champ (`canonical-helper-weaker-copy`). */
  assert.match(src, /See the post on X/, 'le bouton qui ouvre le post a disparu');
  assert.match(src, /Tokenize a post/, 'le bouton qui lance la creation a disparu');
  assert.match(src, /allerTokeniserUnPost\(\)/,
    'le bouton de creation ne passe plus par le chemin commun : il pourrait mener nulle part');
  assert.match(html, /function allerTokeniserUnPost\(\)[\s\S]{0,400}cTweetLien/,
    'le chemin commun ne vise plus le champ du lien dans Create');
});

v('sans post, on le DIT et on explique que ca ne se rattrape pas', () => {
  /* ⛔ Vrai et verifie dans le depot : aucun chemin d ecriture du contractURI n existe apres la
   *   creation. Le dire evite a quelqu un de chercher un bouton « ajouter un post » qui ne peut
   *   pas exister — et l absence de ce bouton cesse de ressembler a un oubli. */
  assert.match(src, /No post engraved on this block/,
    'un block sans post n affiche plus rien : l utilisateur ne sait pas si on a regarde');
  assert.match(src, /can only be engraved when a block is created/i,
    'on ne dit plus qu un post ne peut pas etre ajoute apres coup');
});

v('une face illisible ne montre RIEN', () => {
  /* ⛔ `neutral-return-swallows-failure` a l envers : un `catch` qui laisserait l element visible
   *    afficherait un lien d un autre block, ou un reste du precedent. */
  assert.match(src, /elTweet\.innerHTML = '';/, 'l element n est plus vide avant chaque rendu');
  assert.match(src, /elTweet\.hidden = true;/, 'l element n est plus cache avant chaque rendu');
  assert.match(src, /catch \(_\)/, 'une face illisible ferait planter le rendu du profil');
});

/* ⛔⛔ ET LE MARQUEUR 🟦 EST PARTI DE NOS CREATIONS (Phil, 2026-09-23 : « retire les carres bleus
 *     de nos creations »). Il datait du 2026-09-13. Quatre endroits le posaient : l etiquette de
 *     la map, les puces par palier, le nom dans le fil Live, et la ligne des preuves.
 *     ⚠️ MA PREMIERE RECHERCHE EN A RATE UN : mon extrait coupait les lignes a 110 caracteres, et
 *        `l.nous ? '🟦 '` vivait au-dela. Retrouve par un balayage ligne par ligne, sans fenetre —
 *        troisieme fois aujourd hui qu une fenetre de contexte me cache un resultat.
 *     ⛔ CE QUI RESTE ET QUI FAIT LE TRAVAIL : `h.nous` et la classe CSS `nous`. Le classement en
 *       tete ne dependait PAS de l emoji — rien ne relisait le marqueur. */
v('aucun marqueur 🟦 sur nos creations', () => {
  const ecran = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(ecran.length < html.length, 'depouillement sans effet — temoin casse');
  assert.doesNotMatch(ecran, /l\.nous \? '🟦/, 'le marqueur est revenu dans le fil Live');
  assert.doesNotMatch(ecran, /estANous\([^)]*\) \? '🟦/, 'le marqueur est revenu sur les noms');
  assert.doesNotMatch(ecran, /startsWith\('🟦'\)/, 'le marqueur est revenu sur l etiquette de la map');
  assert.doesNotMatch(ecran, /\+ '🟦 ' \+ enTexte/, 'le marqueur est revenu sur les puces par palier');
});

v('la distinction « nos blocks » survit dans les DONNEES', () => {
  /* ⛔ On retire un SIGNE, pas une distinction. Si `h.nous` partait avec l emoji, nos blocks
   *    perdraient leur place en tete — c est deja arrive une fois, SANS ERREUR. */
  assert.match(html, /h\.nous = true;/, 'la marque « a nous » a disparu des donnees');
  assert.match(html, /classList\.add\('nous'\)/, 'la classe CSS qui met en avant a disparu');
});

assert.equal(n, 11, 'compte de cas inattendu : ' + n);
console.log('ok tweet-affiche — ' + n + ' cas : le post grave est montre, les carres bleus sont partis');
