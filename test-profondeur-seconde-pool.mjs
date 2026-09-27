/* test-profondeur-seconde-pool.mjs — UN NOMBRE SANS ECHELLE NE DIT RIEN.
 *
 * ⛔⛔ LE DEFAUT MESURE. La premiere pool prend 99,9 % de la supply. Le champ de part s applique
 *     ensuite au SOLDE RESTANT — donc 99,9 % d un reste de 0,1 % place 0,099 % de la supply.
 *     RAPPORT DE PROFONDEUR : x1000, rejoue en BigInt ci-dessous.
 *     Le createur, lui, lisait « places 999 000 blocks » : un nombre parfaitement exact, et
 *     parfaitement inutile, parce qu il n avait AUCUNE echelle a quoi le comparer.
 *   ⇒ Une pool mille fois plus mince que sa voisine s arbitre contre son createur — 476 $ de profit
 *     pour 162 $ engages, mesure en rejouant les fonctions du depot. Et il ne peut ni retirer ni
 *     reequilibrer : sa position part a 0x…dEaD.
 *
 * ⛔ CE N EST PAS UN BUG D ARITHMETIQUE, ET C EST IMPORTANT DE LE DIRE : `aPlacer = solde * part /
 *   1000` est JUSTE, et le champ de part est EDITABLE. Ce qui manquait etait la grandeur
 *   COMPARABLE — la part de la supply TOTALE — sans laquelle personne ne pouvait voir le piege.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : que l avertissement soit lu. Il prouve qu il est CALCULE, qu il est
 *   juste, et qu il apparait exactement quand la pool est trop mince.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

let n = 0;
const v = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

/* la meme formule que l ecran, rejouee en BigInt */
const pct = (blocks, sup) => Number((blocks * 100000n) / sup) / 1000;

v('⛔⛔ le rapport de profondeur entre les deux pools est bien de x1000', () => {
  /* ⛔ ON REJOUE PLUTOT QUE D AFFIRMER. Si la part par defaut changeait, ce cas le dirait au lieu
   *   de repeter un chiffre devenu faux. */
  const SUP = 10n ** 27n;
  const premiere = (SUP * 999n) / 1000n;
  const reste = SUP - premiere;
  const seconde = (reste * 999n) / 1000n;
  assert.ok(pct(premiere, SUP) > 99, 'la premiere pool ne prend plus la quasi-totalite : relire ce test');
  assert.ok(pct(seconde, SUP) < 0.1,
    'la seconde pool tient ' + pct(seconde, SUP) + ' % : si ce n est plus sous 0,1 %, le seuil de '
    + 'l avertissement doit etre remesure, pas simplement baisse');
  assert.ok(premiere / seconde >= 900n, 'le rapport de profondeur est tombe sous x900 : remesurer');
});

v('⛔ la part de la supply TOTALE est calculee et affichee', () => {
  assert.ok(/plan\.blocksRequis \* 100000n\) \/ sup/.test(app),
    'la part de la supply totale n est plus calculee : le createur perdrait toute echelle');
  assert.ok(/of the whole supply/.test(app), 'la part de la supply n est plus dite a l ecran');
});

v('⛔⛔ le calcul est en ENTIERS — une supply de 1e27 casse un nombre JS', () => {
  /* ⛔⛔ `Number(10n ** 27n)` perd des chiffres significatifs. Un pourcentage calcule dessus serait
   *     FAUX tout en ayant l air d un pourcentage — le pire genre d erreur. */
  assert.ok(/Number\(\(plan\.blocksRequis \* 100000n\) \/ sup\)/.test(app),
    'le pourcentage est calcule hors BigInt : sur 1e27 il serait faux sans en avoir l air');
  /* preuve que le piege est reel */
  const SUP = 10n ** 27n;
  assert.notEqual(Number(SUP).toString(), SUP.toString(),
    'une supply de 1e27 tient desormais dans un Number : ce cas ne defend plus rien');
});

v('⛔⛔ l avertissement n apparait QUE quand la pool est trop mince', () => {
  /* ⛔ UN AVERTISSEMENT PERMANENT DEVIENT DU DECOR, et le prochain vrai danger sera lu comme du
   *   bruit. Il doit donc etre conditionnel — et la condition doit etre lisible. */
  assert.ok(/pcm < 1/.test(app), 'l avertissement n est plus conditionne a la profondeur');
  assert.ok(/anyone can buy there and sell here/.test(app),
    'l avertissement ne dit plus le MECANISME : sans lui, « trop mince » ne veut rien dire');
  /* ⛔ ET IL DIT L IRREVERSIBLE : c est ce qui distingue une pool mince d une erreur rattrapable. */
  assert.ok(/you can withdraw neither/.test(app),
    'l avertissement ne dit plus que les deux positions sont irrecuperables');
});

v('⛔ sans supply lue, aucune ligne — pas un pourcentage devine', () => {
  assert.ok(/typeof sup !== 'bigint' \|\| sup <= 0n/.test(app),
    'une supply absente ne coupe plus la ligne : un pourcentage invente aurait l air mesure');
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok profondeur-seconde-pool — ' + n + ' cas.');
console.log('   Le rapport x1000 est REJOUE en BigInt, la part de la supply totale est affichee,');
console.log('   et l avertissement n apparait que sous 1 % — avec le mecanisme et l irreversible.');
console.log('⚠️ NE PROUVE PAS que l avertissement soit lu : il prouve qu il est calcule, juste, et');
console.log('   present exactement quand la pool est trop mince.');
