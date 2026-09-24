/* test-flux-create-reste.mjs — ON NE DEPLACE PLUS QUELQU UN AU MILIEU DE SON GESTE.
 *
 * ⛔⛔ LE TROU LE PLUS CHER DE L APP, mesure en production : `cree` = 6, `vivant` = 2. Deux blocks
 *     crees sur trois ne prennent jamais vie. Phil a decrit le symptome sans avoir vu les
 *     compteurs : « il t emene au profil […] et l user est perdu car il fait 1 action et se
 *     retrouve a chercher ».
 *     La cause tenait en UNE ligne : `lireProfil` appelait `allerA('mien')` — lire un profil
 *     DEPLACAIT forcement quelqu un. Or la mise en vie a besoin des donnees du profil : elle
 *     teleportait donc l utilisateur hors de Create, au milieu de son geste, vers un ecran qui
 *     n avait encore rien a lui montrer.
 *
 * ⛔ CE QUE CE TEST GARDE, ET POURQUOI CHAQUE MOITIE COMPTE :
 *    · rester dans Create sans refleter la progression = un ecran MUET pendant quatre signatures,
 *      pire que la teleportation ;
 *    · refleter sans gerer l echec = le panneau garde son texte de SUCCES pendant que la vie a
 *      echoue ailleurs, dans un panneau invisible — un echec silencieux, PIRE que le defaut initial.
 *    Les trois vont ensemble ou aucune ne vaut.
 *
 * ⛔ CE QU IL NE PROUVE PAS : que l utilisateur comprend. Ca, seul un vrai parcours le dira.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const src = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ')
  .replace(/<!--[\s\S]*?-->/g, ' ');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('lire un profil et naviguer sont deux choses separees', () => {
  /* ⛔ `garde-sur-element-absent-toujours-fausse` : si le parametre disparait, l option passee par
   *    l appelant serait ignoree EN SILENCE et la teleportation reviendrait sans rien casser. */
  assert.match(src, /function lireProfil\([^)]*opts/,
    'lireProfil ne prend plus d options : la navigation redevient obligatoire');
  assert.match(src, /if \(!\(opts && opts\.sansNaviguer\)\) allerA\('mien'\)/,
    "la navigation n est plus conditionnelle dans lireProfil");
});

v('⛔ le parcours lance depuis Create NE navigue PAS au depart', () => {
  const i = src.indexOf('const goLaunch = ');
  assert.ok(i > 0, 'goLaunch introuvable : ce test ne garde plus rien');
  const g = src.slice(i, i + 2200);
  assert.match(g, /ouvrirProfil\([^)]*\{\s*sansNaviguer:\s*true\s*\}/,
    'goLaunch redeplace l utilisateur vers le profil au DEBUT du parcours');
});

v('⛔ la progression est REFLETEE dans Create — sinon l ecran est muet', () => {
  /* ⛔⛔ `#plProgression`, `#plEtat` et `#plActions` vivent dans `section#v-mien`, et le CSS fait
   *     `.volet{display:none}`. Tout ce que la mise en vie raconte est donc INVISIBLE depuis
   *     Create. Garder quelqu un la sans miroir le laisserait devant rien pendant quatre
   *     signatures. */
  const i = src.indexOf('function majProgressionVie(');
  assert.ok(i > 0, 'majProgressionVie introuvable');
  const mp = src.slice(i, src.indexOf('\n}', i) + 2);
  assert.match(mp, /miroirVieDansCreate/, 'la progression n est plus refletee dans Create');
  assert.match(mp, /cVieProgression/, 'la destination du miroir a disparu');
});

v('le miroir ne s allume QUE pour un parcours lance depuis Create', () => {
  /* ⛔ Sans cette condition, on ecrirait dans le panneau de creation de quelqu un qui n a rien
   *   demande — par exemple pendant une mise en vie lancee depuis un profil. */
  assert.match(src, /let miroirVieDansCreate = false/,
    'le drapeau du miroir ne demarre plus a faux : il ecrirait par defaut');
  const i = src.indexOf('function majProgressionVie(');
  const mp = src.slice(i, src.indexOf('\n}', i) + 2);
  assert.match(mp, /if \(miroirVieDansCreate\)/, 'le miroir n est plus conditionnel');
});

v('⛔ on montre le profil SEULEMENT quand le block est vivant', () => {
  /* Phil : « quand le block est sur le marche, affiche le profil ». Avant, la navigation avait
   * lieu au DEBUT — vers un ecran qui n avait rien a montrer. */
  const i = src.indexOf("etape('vivant')");
  assert.ok(i > 0, 'le point de reussite est introuvable');
  const succes = src.slice(i, i + 900);
  assert.match(succes, /allerA\('mien'\)/,
    'le profil ne s ouvre plus a la reussite : l utilisateur resterait dans Create sans voir son block');
  assert.match(succes, /miroirVieDansCreate/,
    'la navigation de fin n est plus conditionnee au parcours venu de Create');
});

v('⛔ UN ECHEC NE LAISSE PAS L ECRAN FIGE', () => {
  /* ⛔⛔ LE RISQUE NOMME PAR L ENQUETE, et le seul qui pourrait rendre ce correctif PIRE que le
   *     defaut : en gardant l utilisateur dans Create, le panneau garderait son texte de SUCCES
   *     pendant que la mise en vie a echoue dans un panneau qu il ne voit pas. Il attendrait
   *     quelque chose qui ne viendra jamais. */
  const i = src.indexOf('function vieAutoArreter(');
  assert.ok(i > 0, 'vieAutoArreter introuvable');
  /* ⛔ BORNE A LA FONCTION SUIVANTE, pas a `\n}\n` : retirer les commentaires remplace chaque bloc
   *   multi-ligne par UN espace, donc supprime ses sauts de ligne — une ancre qui compte sur la
   *   mise en page du source devient fausse des qu on nettoie le source. */
  const j = src.indexOf('function ', i + 10);
  const va = src.slice(i, j > i ? j : i + 1200);
  assert.ok(va.length > 200 && va.length < 2500, 'extraction de vieAutoArreter suspecte (' + va.length + ')');
  assert.match(va, /miroirVieDansCreate/,
    "l echec ne dit plus rien dans Create : l utilisateur attendrait devant un texte de succes");
  assert.match(va, /not alive yet|stopped at step/i,
    "le message d echec ne dit plus que le block n est pas vivant");
});

v('⛔ « x402 » ne s affiche plus : nous n implementons pas ce protocole', () => {
  /* ⛔⛔ Mesure du 2026-09-24 : aucune reponse HTTP 402, aucun en-tete X-PAYMENT, aucun
   *     facilitateur, aucune primitive EIP-3009, aucune liaison paiement↔ressource. Ce qu on fait
   *     — lire une transaction ordinaire sur la chaine — est defendable ; emprunter le nom d un
   *     standard qu on n implemente pas ne l est pas.
   *   ⛔ FENETRE SOUPLE, pas 70 caracteres de chaque cote : ma premiere sonde exigeait un contexte
   *     large sur la MEME ligne et a rendu « 0 occurrence » sur un texte bien present. Quatrieme
   *     fois aujourd hui qu une fenetre de contexte me fait rater une correspondance. */
  const visible = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const trouve = [...visible.matchAll(/(?:^|>)[^<>]{0,200}/g)]
    .map((m) => m[0]).filter((t) => /x402/i.test(t));
  assert.deepEqual(trouve.map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 80)), [],
    'le nom « x402 » est affiche a l utilisateur alors que le protocole n est pas implemente');
});

assert.equal(n, 7, 'compte de cas inattendu : ' + n);
console.log('ok flux-create-reste — ' + n + ' cas : on reste dans Create, la progression suit,');
console.log('   l echec parle, et le profil ne s ouvre qu une fois le block vivant.');
console.log('⚠️ NE PROUVE PAS que l utilisateur comprend : seul un vrai parcours le dira. Les');
console.log('   compteurs vie_ko_etape* le diront dans quelques jours.');
