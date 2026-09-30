/* test-refus-partiel-se-dit.mjs — UN REFUS PARTIEL DOIT SE DIRE, ET NE PAS EFFACER DE BLOCKS.
 *
 * ⛔⛔⛔ LE DEFAUT, TROUVE PAR UN AUDIT ADVERSARIAL LE 2026-09-30 ET CONFIRME PAR DEUX SCEPTIQUES.
 *   `serveur-web.js` ne leve QUE si TOUS les lots DexScreener echouent :
 *       if (!lotsOk && lotsKo) throw …
 *   Un refus PARTIEL publie donc la liste amputee, avec `lotsMarche {ok, ko}`. Chaque lot porte 30
 *   adresses ⇒ un seul lot refuse sur 38 retire jusqu a 30 blocks VIVANTS.
 *   Et rien ne le disait :
 *     · le compteur « N blocks with a live market » et le volume 24 h etaient publies comme un
 *       RECENSEMENT, alors qu ils sont un PLANCHER ;
 *     · l avertissement existait HUIT LIGNES PLUS HAUT, mais derriere un `||`. Comme `+` lie plus
 *       fort, l ensemble vaut `(liste) || (repli)` : des qu UNE ligne s affiche, il est injoignable.
 *       La phrase qui disait la verite etait ecrite et inatteignable DANS LE CAS QUI COMPTE.
 *     · pire, l elagage de la map 3D retirait tout cube absent de cette meme liste, sous la seule
 *       garde `size >= 20` — et 200 moins 30 passe cette garde sans broncher. Des blocks a marche
 *       vivant disparaissaient de la carte parce qu on n avait pas PU les lire.
 *   ⇒ « Retire faute d avoir PU regarder » n est pas « retire parce qu il n a pas de marche ».
 *     C est `absence de preuve contre defaut de regarder`, et ca pourrait etre l autre moitie des
 *     « blocks disparus » signales par Phil.
 *
 * ⛔ CE QUE CE TEST NE FAIT PAS : il ne simule pas un refus reel (il faudrait un faux DexScreener).
 *   Il tient les DEUX surfaces dans le code servi. La verification vivante demande un lot refuse,
 *   qui ne s est pas produit ce soir : mesure en production, `lotsMarche {ok: 38, ko: 0}`.
 */
import { readFileSync } from 'node:fs';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}

const sansCom = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const htmlNu = sansCom(html);
const srvNu = sansCom(srv);

console.log('le serveur transporte bien le compte des refus');
ok('`lotsMarche` est publie avec ok ET ko', /lotsMarche: \{ ok: lotsOk, ko: lotsKo/.test(srvNu),
  (srvNu.match(/lotsMarche:.{0,50}/) || [null])[0]);
/* ⛔ ET IL NE LEVE QUE SUR L ECHEC TOTAL — c est la cause meme du defaut, donc on la tient : si ce
 *   `if` changeait pour lever sur un refus PARTIEL, tout l onglet tomberait sur un seul lot rate. */
ok('il ne leve QUE si TOUS les lots echouent (un partiel ne tue pas l onglet)',
  /if \(!lotsOk && lotsKo\)/.test(srvNu));

console.log('');
console.log('⛔⛔ LA NOTE TOUJOURS VISIBLE PORTE LE SIGNAL');
/* ⛔ C EST LA SEULE SURFACE QUI MARCHE : la liste peut etre longue, le repli `||` injoignable. */
ok('la note lit `lotsMarche.ko`', /d\.lotsMarche && d\.lotsMarche\.ko\)? \|\| 0/.test(htmlNu)
  || /const koLots = \(d\.lotsMarche && d\.lotsMarche\.ko\)/.test(htmlNu),
  (htmlNu.match(/const koLots.{0,60}/) || [null])[0]);
ok('⛔ elle dit que le compte est un PLANCHER', /are a FLOOR/.test(htmlNu));
ok('⛔ et elle chiffre combien de blocks peuvent manquer', /koLots \* 30/.test(htmlNu),
  (htmlNu.match(/.{0,30}koLots \* 30.{0,30}/) || [null])[0]);
ok('elle nomme le nombre de lectures refusees sur le total',
  /' of ' \+ totalLots \+ ' market reads refused/.test(htmlNu));
/* ⛔ ET LE COMPTE LUI-MEME PORTE LA MARQUE : « 219+ » se lit autrement que « 219 ». Sans ca, le
 *   chiffre reste lisible comme un total meme avec l avertissement a cote. */
ok('⛔ le compte affiche un « + » quand la liste est incomplete',
  /toutes\.length \+ \(koLots \? '\+' : ''\)/.test(htmlNu),
  (htmlNu.match(/toutes\.length \+ \(koLots.{0,30}/) || [null])[0]);
/* ⛔ ET RIEN N EST DIT QUAND IL N Y A RIEN A DIRE : un avertissement permanent cesse d avertir.
 *   C est `garde presque toujours vraie tue l affordance`, deja paye dans ce depot. */
ok('⛔ et RIEN n est ajoute quand ko vaut 0', /\(koLots \? ' · ⚠️ '/.test(htmlNu),
  (htmlNu.match(/\(koLots \? ' · ⚠️.{0,20}/) || [null])[0]);

console.log('');
console.log('⛔⛔⛔ ON N ELAGUE PAS LA MAP SUR UNE LISTE INCOMPLETE');
ok('le quatrieme garde-fou existe', /const listeIncomplete = Boolean\(d && d\.lotsMarche && d\.lotsMarche\.ko\)/.test(htmlNu),
  (htmlNu.match(/const listeIncomplete.{0,60}/) || [null])[0]);
ok('⛔ et il est BRANCHE sur la condition d elagage',
  /if \(marcheParAdr\.size >= 20 && !listeIncomplete\)/.test(htmlNu),
  (htmlNu.match(/if \(marcheParAdr\.size >= 20.{0,40}/) || [null])[0]);
/* ⛔ LES TROIS GARDE-FOUS D ORIGINE RESTENT : les remplacer par le nouveau serait echanger un trou
 *   contre un autre. Une liste VIDE doit toujours ne rien elaguer, nos blocks doivent rester, et
 *   une vie LUE sur la chaine prime sur un agregateur. */
ok('le garde-fou « liste plausible » est toujours la', /marcheParAdr\.size >= 20/.test(htmlNu));
ok('nos blocks restent toujours', /if \(!h \|\| h\.nous\) continue;/.test(htmlNu));
ok('une vie LUE sur la chaine prime toujours', /if \(h\.etatVie === 'LUE'\) continue;/.test(htmlNu));
/* ⛔ ET L ELAGAGE RESTE ENVELOPPE : un elagage qui echoue laisse la carte INTACTE, jamais a moitie
 *   videe — le pire resultat possible serait une carte vide. */
ok('l elagage reste enveloppe dans un try', /try \{\s*if \(marcheParAdr\.size >= 20/.test(htmlNu));

console.log('');
console.log('⛔ LES TEMOINS : ce test lit-il encore du vrai code ?');
ok('app.html depouille reste volumineux', htmlNu.length > 200000, htmlNu.length);
ok('serveur-web.js depouille reste volumineux', srvNu.length > 50000, srvNu.length);
ok('le depouillage a garde le code de app.html', /const listeIncomplete/.test(htmlNu));
ok('le depouillage a bien retire un commentaire connu',
  !/QUATRIEME GARDE-FOU/.test(htmlNu));
/* ⛔ TEMOIN NEGATIF FRANC : le motif de la condition sait-il voir l ANCIENNE version, sans la
 *   nouvelle garde ? Sans ca, ce test passerait meme si la garde etait retiree. */
ok('le motif sait distinguer l ancienne condition de la nouvelle', (() => {
  const ancienne = 'if (marcheParAdr.size >= 20) {';
  const nouvelle = 'if (marcheParAdr.size >= 20 && !listeIncomplete) {';
  const m = /if \(marcheParAdr\.size >= 20 && !listeIncomplete\)/;
  return !m.test(ancienne) && m.test(nouvelle);
})());

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
