/* LA GARDE CONTRE UN ABSOLU QUI REVIENT, ET CONTRE UN JUMEAU QUI NE SUIT PAS.
 *
 * ⛔⛔⛔ POURQUOI CE FICHIER EXISTE. Le 2026-09-30, la phrase vivante de `tokeniser-un-jeton.js`
 *   promettait « EVERY screen shows the exact rate of the pool you are trading in ». Mesure :
 *   `libelleFrais` est appele sur TROIS ecrans d `app.html`. Trois n est pas « tous », et je ne
 *   sais pas prouver l absolu — la phrase a donc ete corrigee pour nommer l ecran de marche.
 *   ⛔⛔ ET SON JUMEAU STATIQUE A SURVECU A LA CORRECTION : l aide de l onglet disait « EACH screen
 *     shows the exact rate » — la meme affirmation, d autres mots, non corrigee. Deux copies d une
 *     promesse, une seule reparee. C est le motif « le jumeau diverge », deja paye dans ce depot.
 *   ⇒ Connaitre la regle n a pas suffi : je l avais ecrite le matin et je l ai enfreinte l apres-midi
 *     dans le fichier d a cote. Seul un controle EXTERNE protege. Le voici.
 *
 * ⛔ CE QUE CETTE GARDE NE SAIT PAS FAIRE, et il faut le dire : elle cherche des FORMULATIONS. Un
 *   absolu ecrit autrement (« on all screens », « partout ») lui echapperait. Elle reduit la
 *   surface, elle ne la ferme pas. Une garde dont on ne connait pas la borne se lit comme une
 *   preuve — celle-ci porte la sienne.
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
const mod = readFileSync(new URL('./tokeniser-un-jeton.js', import.meta.url), 'utf8');

/* ⛔ LES COMMENTAIRES CITENT LA FAUTE POUR L EXPLIQUER — les compter serait s accuser de la citation
 *   plutot que de la faute. On retire donc les commentaires HTML et JS avant de chercher.
 *   ⛔ Et cette decoupe est elle-meme un risque : si elle retirait TROP, la garde deviendrait
 *     toujours verte. Les temoins en bas de fichier verifient qu elle voit encore quelque chose. */
function sansCommentaires(s) {
  return s
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const htmlNu = sansCommentaires(html);
const modNu = sansCommentaires(mod);

console.log('l absolu non prouve ne revient pas');
/* Les deux formulations qui ont REELLEMENT existe ici, dans les deux fichiers. */
for (const [nom, motif] of [
  ['« every screen »', /every\s+screen/i],
  ['« each screen »', /each\s+screen/i],
  ['« all screens »', /all\s+screens/i],
  ['« on every screen »', /on\s+every\s+screen/i],
]) {
  ok(nom + ' absent de app.html', !motif.test(htmlNu),
    (htmlNu.match(motif) || [null])[0]);
  ok(nom + ' absent de tokeniser-un-jeton.js', !motif.test(modNu),
    (modNu.match(motif) || [null])[0]);
}

console.log('');
console.log('et la formulation MESUREE est bien la, des DEUX cotes');
/* ⛔ L ABSENCE DE L ABSOLU NE SUFFIT PAS : supprimer la phrase entiere passerait les assertions
 *   ci-dessus. On exige donc aussi que le remplacant soit present — sinon la garde protegerait
 *   un ecran devenu muet. */
ok('app.html nomme « the market screen »', /the market screen shows the exact rate/i.test(htmlNu));
ok('tokeniser-un-jeton.js nomme « the market screen »',
  /the market screen shows the exact rate/i.test(modNu));

console.log('');
console.log('le frais porte son MONTANT des deux cotes, et le MEME nom');
/* ⛔ « One-off market opening fee » n avait aucun montant alors que l aide annonçait 0.001 ETH :
 *   deux noms, un seul chiffre, et c est l ecran de signature qui cachait le prix. */
ok('app.html dit « Birth fee » ET 0.001 ETH', /Birth fee/i.test(htmlNu) && /0\.001 ETH/.test(htmlNu));
ok('tokeniser-un-jeton.js dit « Birth fee »', /Birth fee/i.test(modNu));
ok('⛔ et plus « One-off market opening fee » nulle part',
  !/One-off market opening fee/i.test(modNu) && !/One-off market opening fee/i.test(htmlNu));
/* ⛔ LE MONTANT N EST PAS RECOPIE DANS LE MODULE : un chiffre en dur dans une phrase pourrit quand
 *   la constante bouge, EN SILENCE, sur l ecran de signature. */
ok('⛔ le module ne RECOPIE pas « 0.001 » dans une phrase',
  !/'[^']*0\.001[^']*'/.test(modNu), (modNu.match(/'[^']*0\.001[^']*'/) || [null])[0]);

console.log('');
console.log('« Read <symbole> » ne revient pas comme un ordre');
ok('app.html ne construit plus « Read  + symbole »', !/'Read '\s*\+/.test(htmlNu),
  (htmlNu.match(/'Read '\s*\+/) || [null])[0]);
ok('et il dit « Source token: »', /Source token: /.test(htmlNu));

console.log('');
console.log('le ratio de supply est dit des DEUX cotes');
ok('le module porte « by supply »', /by supply/i.test(modNu));
ok('l aide statique dit que le ratio est montre avant signature',
  /shows that ratio before you sign/i.test(htmlNu));

console.log('');
console.log('⛔ LES TEMOINS : cette garde voit-elle encore quelque chose ?');
/* ⛔⛔ UNE GARDE QUI NE LIT RIEN PASSE TOUT. Si `sansCommentaires` retirait trop, ou si un fichier
 *   etait vide, tous les « absent » ci-dessus seraient verts pour la mauvaise raison. */
ok('app.html depouille reste volumineux', htmlNu.length > 200000, htmlNu.length);
ok('le module depouille reste volumineux', modNu.length > 3000, modNu.length);
/* ⛔ ET LE DECOUPAGE NE DOIT PAS AVOIR MANGE LE CODE : une chaine connue doit survivre. */
ok('le depouillage a garde le code de app.html', /Source token: /.test(htmlNu));
ok('le depouillage a garde le code du module', /phrasePlanScelle/.test(modNu));
/* ⛔ ET IL DOIT AVOIR RETIRE LES COMMENTAIRES, sinon les citations de la faute la feraient echouer. */
ok('le depouillage a bien retire un commentaire connu de app.html',
  !/CETTE LIGNE DISAIT LA SUPPLY FIXE/.test(htmlNu));
ok('le depouillage a bien retire un commentaire connu du module',
  !/NI LE SENS NI LE FACTEUR/.test(modNu));
/* ⛔ TEMOIN NEGATIF FRANC : le motif doit savoir trouver quand la chose EST la. */
ok('le motif « every screen » sait matcher quand la phrase existe',
  /every\s+screen/i.test('this shows on every screen, promise'));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
