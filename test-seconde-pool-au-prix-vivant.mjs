/* test-seconde-pool-au-prix-vivant.mjs — UN PASSAGE DE LIQUIDITE, PAS UNE FUITE.
 *
 * ⛔⛔ LA THESE DE PHIL (2026-09-27) : « on est une nouvelle forme de passage de liquidite ». Un
 *     block paire a DEUX actifs differents est un pont : pool(action1, block) puis
 *     pool(block, action2). La mecanique EXISTE deja et rien ne s y oppose — verifie.
 *
 * ⛔⛔ MAIS LA MESURE A TROUVE CE QUI EN FAIT UNE FUITE, ET C EST UN SEUL DEFAUT.
 *     Les seules ecritures de `#plValo` etaient : la constante de 10 ETH, sa conversion en devise,
 *     un parametre d URL, et la frappe. Le prix VIVANT du marche deja ouvert n etait JAMAIS lu.
 *     La seconde pool s ouvrait donc a un prix SANS RAPPORT avec la premiere.
 *   ⇒ Chiffre obtenu en rejouant les fonctions du depot, sur une premiere pool montee x20 :
 *     476 $ de profit d arbitrage pour 162 $ engages, pris sur l ETH verrouille de la premiere
 *     pool. Et le createur ne peut ni retirer, ni collecter, ni reequilibrer : sa position part a
 *     `0x…dEaD`. Il n a AUCUN moyen de se defendre.
 *   ⇒ Ouvrir la seconde pool au prix DEJA CONSTATE du block ferme l ecart. C est le changement
 *     minimal qui transforme la fuite en passage.
 *
 * ⚠️ CE QUE CE TEST NE PROUVE PAS : qu un arbitragiste ne trouve pas un autre chemin. Il prouve que
 *   le prix de depart de la seconde pool n est plus tire d une constante sans rapport.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

let n = 0;
const v = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

v('⛔⛔ le prix de depart vient du MARCHE DEJA LU, pas d une constante', () => {
  assert.ok(/const fdv = mk && Number\(mk\.fdvUsd\);/.test(app),
    'la valeur de depart ne lit plus le marche deja constate du block');
  assert.ok(/\$\('#plValo'\)\.value = String\(Number\(valoDuMarche\.toPrecision\(3\)\)\)/.test(app),
    'la valeur mesuree n est plus posee dans le champ');
});

v('⛔ la conversion couvre les TROIS familles de devise', () => {
  /* ⛔ `fdvUsd` est en DOLLARS ; le champ demande la valeur DANS LA DEVISE CHOISIE. Sans conversion
   *   on melangerait des unites — 12 000 lu comme 12 000 ETH au lieu de 12 000 $. C est exactement
   *   le genre d erreur qui a l air d un chiffre raisonnable et ouvre une pool a 4 000 fois le bon
   *   prix. */
  const i = app.indexOf('let valoDuMarche = null;');
  assert.notEqual(i, -1, 'le calcul du prix de depart a disparu');
  const bloc = app.slice(i, i + 1400);
  assert.ok(/d === 'USDC'/.test(bloc), 'le cas USDC (deja en dollars) n est plus traite');
  assert.ok(/fdv \/ ethUsd/.test(bloc), 'le cas ETH ne convertit plus par le prix de l ETH');
  assert.ok(/prixUsdDeviseLus\.get\(String\(d\)\)/.test(bloc),
    'les devises tierces (actions tokenisees) ne sont plus converties');
});

v('⛔⛔ sans prix lisible, on RETOMBE sur le comportement d avant', () => {
  /* ⛔⛔ UNE VALEUR INVENTEE SERAIT PIRE QUE LA CONSTANTE, parce qu elle aurait l air mesuree. Si
   *     le marche n est pas lu, ou si le prix de la devise manque, on ne devine pas : on reprend
   *     exactement l ancien chemin. */
  const i = app.indexOf('let valoDuMarche = null;');
  const bloc = app.slice(i, i + 1800);
  assert.ok(/} else if \(d === 'ETH' \|\| d === 'TBLOCK'\) \{ \$\('#plValo'\)\.value = String\(VALO_DEFAUT_ETH\)/.test(bloc),
    'le repli vers l ancien defaut a disparu : une absence de prix pourrait laisser le champ vide ou faux');
  assert.ok(/catch \(_\) \{ valoDuMarche = null; \}/.test(bloc),
    'une lecture qui jette ne retombe plus sur `null` : le champ pourrait porter une valeur douteuse');
});

v('⛔ rien de ce que l utilisateur a tape n est ecrase', () => {
  /* ⛔ UN DEFAUT SE PROPOSE, IL NE S IMPOSE PAS. Tout ce bloc vit dans `if (valoParDefaut)`, et
   *   `valoParDefaut` passe a false des la premiere frappe. */
  const i = app.indexOf('let valoDuMarche = null;');
  const avant = app.slice(Math.max(0, i - 2200), i);
  assert.ok(/if \(valoParDefaut\) \{/.test(avant),
    'le prix de depart mesure sort du garde `valoParDefaut` : il ecraserait la saisie de l utilisateur');
  assert.ok(/\$\('#plValo'\)\.addEventListener\('input', \(\) => \{ valoParDefaut = false; \}\)/.test(app),
    'la frappe ne desactive plus le defaut : la valeur de l utilisateur serait remplacee');
});

v('⛔ trois chiffres significatifs — pas quinze decimales de fausse precision', () => {
  /* ⛔ Une valeur qui bouge a chaque echange ne merite pas quinze decimales : les afficher ferait
   *   croire a une exactitude que le marche n a pas. */
  assert.ok(/toPrecision\(3\)/.test(app), 'la precision affichee n est plus bornee');
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok seconde-pool-au-prix-vivant — ' + n + ' cas.');
console.log('   La seconde pool part du prix DEJA CONSTATE du block, converti dans la devise');
console.log('   choisie — au lieu d une constante de 10 ETH sans rapport avec la premiere pool.');
console.log('⚠️ NE PROUVE PAS qu aucun arbitrage ne reste possible : il prouve que le prix de depart');
console.log('   n est plus tire d une constante etrangere au marche du block.');
