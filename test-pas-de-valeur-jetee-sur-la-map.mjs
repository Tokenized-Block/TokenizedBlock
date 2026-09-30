/* test-pas-de-valeur-jetee-sur-la-map.mjs — UNE VALEUR ECRITE QUE PERSONNE NE LIT EST UN DEFAUT,
 * ET UN COMMENTAIRE QUI DECRIT UNE FONCTIONNALITE RETIREE EST PIRE : IL FABRIQUE DES FAUSSES PISTES.
 *
 * ⛔⛔⛔ CE QUI S EST PASSE, LE 2026-09-30. Phil signale « OUSD disparu de la map ». Je mesure dans
 *   Chrome : NVDAc, n°1 de l app a 12 475 229 $ de volume 24 h, est a `opacity 0.6` pendant qu OBC
 *   a 26 $ est a 1. J annonce « la luminosite ne suit pas le volume » comme un DEFAUT.
 *   ⇒ C ETAIT FAUX. L opacite est la PROFONDEUR (`map3d.js` : `1 - 0.6 * loin`, arrondie a 1/20 —
 *     ce qui explique exactement l echelle mesuree 0,50 / 0,55 / 0,60 / 0,65 / 0,70 / 0,75, et le
 *     0,49 qui est `op * 0.75` sur un cube `sansPrix`). NVDAc etait au FOND de la sphere, OBC
 *     devant, et la map tourne. OUSD n avait pas disparu : 80x88 px, dans le viewport, `visible`.
 *   ⇒ ET J AI PRESENTE UNE DECISION PRODUIT DE PHIL COMME UN BUG. Le halo au volume a ete RETIRE a
 *     sa demande (tip 0040 : « pas ca — seulement ceux qui create / swap, pas tous »).
 *
 * ⛔ POURQUOI JE M Y SUIS TROMPE : deux residus se lisaient comme une fonctionnalite vivante.
 *    1. `app.html` CALCULAIT `h.eclat` depuis le volume a chaque rafraichissement — lu par personne.
 *    2. `map3d.js:509` AFFIRMAIT « un block a fort volume (h.eclat 0..1 …) rayonne » — faux depuis
 *       le tip 0040, jamais mis a jour. Et la ligne ~564 declare un `eclat` LOCAL calcule sur l AGE
 *       d un signal : le mot apparait cinq fois dans le fichier et pas une seule n est `h.eclat`.
 *    ⇒ `la presence d un nom n est pas son usage`. Un grep sur « eclat » menait droit a la fausse
 *      conclusion, et c est precisement le chemin que j ai pris.
 *
 * ⛔ CE QUE CE TEST NE FAIT PAS : il ne detecte pas TOUTE valeur jetee de l app. Il tient LE cas
 *   qui a coute une fausse accusation, et les formules qui l expliquent. Il reduit la surface, il
 *   ne la ferme pas.
 */
import { readFileSync } from 'node:fs';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const map = readFileSync(new URL('./map3d.js', import.meta.url), 'utf8');

/* ⛔ LES COMMENTAIRES CITENT LA FAUTE POUR L EXPLIQUER : les compter accuserait la citation au lieu
 *   de la faute. C est l erreur que j ai deja faite ce soir sur « each screen » et sur
 *   « volume est minuscule ». On depouille, et des temoins verifient que le depouillage n a pas
 *   tout mange — sinon tout serait vert pour la mauvaise raison. */
const sansCom = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const htmlNu = sansCom(html);
const mapNu = sansCom(map);

console.log('`h.eclat` ne revient pas sans lecteur');
ok('⛔ app.html n ECRIT plus `h.eclat`', !/\bh\.eclat\s*=/.test(htmlNu),
  (htmlNu.match(/.{0,60}h\.eclat\s*=.{0,40}/) || [null])[0]);
ok('⛔ map3d.js ne LIT pas `h.eclat`', !/\bh\.eclat\b/.test(mapNu),
  (mapNu.match(/.{0,60}h\.eclat.{0,40}/) || [null])[0]);
/* ⛔ ET SI QUELQU UN LE REBRANCHE UN JOUR, LES DEUX MOITIES DOIVENT ARRIVER ENSEMBLE : un ecrivain
 *   sans lecteur est le defaut qu on vient de retirer, un lecteur sans ecrivain rendrait
 *   `undefined` et eteindrait tout en silence. */
const ecrit = /\bh\.eclat\s*=/.test(htmlNu);
const lit = /\bh\.eclat\b/.test(mapNu);
ok('⛔⛔ ecrivain et lecteur vont PAR PAIRE (aucun, ou les deux)', ecrit === lit,
  { ecrit, lit });

console.log('');
console.log('le `max` qui ne servait qu a lui est parti aussi');
/* ⛔ Un `Math.max` sur toutes les lignes a chaque rafraichissement, pour une valeur jetee. Et
 *   j avais ecrit « `max` reste utilise plus bas » AVANT de verifier : c etait faux. */
ok('⛔ le `const max` de la passe soleils n existe plus',
  !/const max = Math\.max\(\.\.\.d\.lignes/.test(htmlNu),
  (htmlNu.match(/const max = Math\.max\(\.\.\.d\.lignes.{0,50}/) || [null])[0]);

console.log('');
console.log('l opacite reste documentee pour ce qu elle EST : la profondeur');
/* ⛔ SI CETTE FORMULE CHANGE SANS QUE SON SENS SOIT REECRIT, le prochain lecteur refera mon erreur.
 *   On tient donc la formule ELLE-MEME, pas un commentaire a son sujet. */
ok('la formule de profondeur est bien dans map3d.js',
  /1 - 0\.6 \* loin/.test(mapNu), (mapNu.match(/.{0,30}0\.6 \* loin.{0,30}/) || [null])[0]);
ok('et elle est quantifiee a 1/20 (d ou l echelle 0,05 mesuree)',
  /\* 20\) \/ 20/.test(mapNu), (mapNu.match(/.{0,40}\* 20\) \/ 20.{0,20}/) || [null])[0]);
/* ⛔ ET LE 0,49 MESURE EST EXPLIQUE PAR CE FACTEUR, pas par un mystere. */
ok('le facteur `sansPrix` qui donne le 0,49 mesure est la',
  /sansPrix'\) \? op \* 0\.75/.test(mapNu), (mapNu.match(/.{0,30}op \* 0\.75.{0,20}/) || [null])[0]);

console.log('');
console.log('la lumiere vient du SIGNAL, et la decision de Phil est ecrite');
ok('seul `vif` alimente le halo', /const e = vif \* 0\.7;/.test(mapNu),
  (mapNu.match(/.{0,20}const e = vif.{0,20}/) || [null])[0]);
/* ⛔ LA DECISION PRODUIT DOIT RESTER TRACEE : sans elle, quelqu un « reparera » l absence de halo
 *   au volume en la remettant — et refera exactement ce que Phil a demande de retirer. */
ok('⛔ le tip 0040 est cite dans map3d.js', /tip 0040/.test(map));
ok('et il dit POURQUOI (create / swap, pas tous)', /create \/ swap, pas tous/.test(map));
/* ⛔ ET LA FAUSSE PISTE NE DOIT PAS ETRE RESSERVIE TELLE QUELLE. Le commentaire du tip 0037 est
 *   conserve, mais comme une CITATION retiree — jamais comme une description du present. */
ok('⛔ le commentaire menteur est marque comme RETIRE',
  /DECRIVAIT UNE FONCTIONNALITE RETIREE/.test(map));

console.log('');
console.log('⛔ LES TEMOINS : ce test lit-il encore du vrai code ?');
/* ⛔⛔ Un depouillage trop gourmand, ou un fichier vide, rendrait tous les « n existe plus »
 *   verts pour la mauvaise raison. C est la faute que j ai faite deux fois ce soir. */
ok('app.html depouille reste volumineux', htmlNu.length > 200000, htmlNu.length);
ok('map3d.js depouille reste volumineux', mapNu.length > 10000, mapNu.length);
ok('le depouillage a garde le code de map3d.js', /const e = vif/.test(mapNu));
ok('le depouillage a bien retire un commentaire connu de map3d.js',
  !/DECRIVAIT UNE FONCTIONNALITE RETIREE/.test(mapNu));
/* ⛔ TEMOIN NEGATIF FRANC : le motif doit savoir trouver quand la chose EST la. */
ok('le motif `h.eclat =` sait matcher quand l ecriture existe',
  /\bh\.eclat\s*=/.test('if (h) h.eclat = 0.5;'));
ok('le motif du `const max` sait matcher quand il existe',
  /const max = Math\.max\(\.\.\.d\.lignes/.test('const max = Math.max(...d.lignes.map((l) => 1), 1);'));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
