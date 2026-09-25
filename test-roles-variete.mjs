/* test-roles-variete.mjs — DES INTELLIGENCES DIFFERENTES, PAS DES ETIQUETTES DIFFERENTES.
 *
 * ⛔⛔ CE QUI A ETE DEMANDE (Phil, 2026-09-25) : « une grande variete de blocks avec des
 *     intelligences differentes ». Ce fichier garde la condition qui rend cette phrase VRAIE —
 *     un role de plus doit peser sur le reseau, pas seulement porter un nom de plus.
 *
 * ⛔⛔ ET LE PIEGE MORTEL DE CE FICHIER-LA : `METIERS_DERIVES = METIERS.slice(0, 5)` et le tirage
 *     fait `% METIERS_DERIVES.length`. Ajouter un role AU MILIEU du tableau, ou elargir la tranche
 *     derivee, REATTRIBUERAIT EN SILENCE le metier de tous les blocks qui n en ont jamais choisi
 *     un : un block changerait de personnage sans que personne ne l ait decide, et son cerveau
 *     rejouerait faux. L ordre de ce tableau est porteur — c est une donnee, pas une presentation.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que les neuf roles soient interessants, ni que quelqu un les
 *   choisisse. Il prouve qu ils sont DISTINCTS pour le reseau et qu aucun n est muet a l ecran.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { METIERS, METIERS_DERIVES, SENSIBILITES, sensibiliteDe } from './metiers.js';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('⛔⛔ les CINQ metiers derives de l adresse n ont pas bouge', () => {
  /* ⛔⛔ LE CAS LE PLUS IMPORTANT DU FICHIER. Si cette tranche change, chaque block sans role choisi
   *     devient un autre personnage — silencieusement, chez tout le monde, d un deploiement a
   *     l autre. C est une reecriture d identite, pas un changement d affichage. */
  assert.equal(METIERS_DERIVES.length, 5,
    'la tranche derivee compte ' + METIERS_DERIVES.length + ' metiers : le modulo du tirage change, '
    + 'donc le metier de TOUS les blocks qui n en ont jamais choisi un est reattribue');
  assert.deepEqual(METIERS_DERIVES.map((m) => m.cle),
    ['GARDIEN', 'MOMENTUM', 'ECLAIREUR', 'HERAUT', 'COMPTABLE'],
    'l ordre des cinq premiers metiers a change : meme a nombre egal, chaque block derive bascule '
    + 'sur un autre role');
});

v('⛔ tout metier a une sensibilite declaree', () => {
  /* ⛔ Sans entree dans `SENSIBILITES`, `sensibiliteDe` rend le NEUTRE : le role existerait a
   *   l ecran et ne changerait rien au reseau — exactement le decor qu on refuse. */
  const muets = METIERS.filter((m) => !(m.cle in SENSIBILITES)).map((m) => m.cle);
  assert.deepEqual(muets, [],
    'ces metiers ne pesent rien sur le cerveau, ils ne sont qu une etiquette : ' + muets.join(', '));
});

v('⛔⛔ deux metiers ne peuvent pas avoir la MEME sensibilite', () => {
  /* ⛔⛔ Deux profils identiques, c est un seul role sous deux noms : le choix serait un faux choix.
   *   ⛔ `COMPTABLE` est la seule exception legitime — il EST le neutre, et il le dit
   *     (« nothing more than the others »). Une exception nommee, pas un trou. */
  const vus = new Map();
  for (const m of METIERS) {
    if (m.cle === 'COMPTABLE') continue;
    const signature = JSON.stringify(sensibiliteDe(m.cle));
    if (vus.has(signature)) {
      assert.fail('« ' + m.titre + ' » et « ' + vus.get(signature)
        + ' » pesent EXACTEMENT pareil : deux noms pour une seule intelligence');
    }
    vus.set(signature, m.titre);
  }
  const neutre = JSON.stringify(sensibiliteDe('COMPTABLE'));
  for (const m of METIERS) {
    if (m.cle === 'COMPTABLE') continue;
    assert.notEqual(JSON.stringify(sensibiliteDe(m.cle)), neutre,
      '« ' + m.titre +' » est neutre : il ne se distingue pas d un block sans role');
  }
});

v('⛔ chaque metier dit ce qu il fait, ce qu il regarde et ce qu il ne fait JAMAIS', () => {
  /* ⛔ Phil, 2026-09-17 : « tu dis la meme chose et pas le vrai role, tu expliques pas ». Un role
   *   sans ses trois lignes redevient une etiquette. Et le `jamais` est le plus important des
   *   trois : c est la limite que le block ne franchira pas tout seul. */
  for (const m of METIERS) {
    for (const champ of ['titre', 'fait', 'regarde', 'jamais']) {
      assert.ok(typeof m[champ] === 'string' && m[champ].trim().length > 3,
        'le metier ' + m.cle + ' n a pas de « ' + champ + ' » utilisable');
    }
    assert.match(m.jamais, /never/i,
      'le metier ' + m.cle + ' ne dit pas ce qu il ne fera JAMAIS : c est la phrase qui borne '
      + 'ce qu un block peut faire sans qu on le lui demande');
  }
});

v('⛔ l ecran sait dire ce que CHAQUE metier pese', () => {
  /* ⛔⛔ `SENS_ROLE[cle] || 'what it reads'` : un metier absent de cette table tombe dans un repli
   *     vague. On ne peut pas choisir en connaissance de cause une intelligence qui ne sait pas
   *     dire ce qu elle regarde — et le repli rend le defaut INVISIBLE, ce qui est le pire cas. */
  const i = html.indexOf('const SENS_ROLE = {');
  assert.ok(i > 0, 'la table des sensibilites lisibles a disparu de l ecran');
  const table = html.slice(i, html.indexOf('};', i));
  const absents = METIERS.filter((m) => !new RegExp('\\b' + m.cle + '\\s*:').test(table)).map((m) => m.cle);
  assert.deepEqual(absents, [],
    'absents de SENS_ROLE, donc decrits par un repli vague a l ecran : ' + absents.join(', '));
});

v('⛔ les deux ajouts comblent bien un capteur qui n etait DOMINANT chez personne', () => {
  /* ⛔⛔ LA JUSTIFICATION, GARDEE COMME LE RESTE. Ils n ont ete ajoutes que parce qu un trou etait
   *     mesurable : `achat` n etait dominant nulle part (le Sentinel couvre `vente` a 2,5 sans
   *     miroir), et `taille` plafonnait a 1,5 chez un role qui regarde les AUTRES blocks. Si un
   *     jour ces deux-la cessent de dominer leur capteur, ils redeviennent des doublons. */
  assert.ok(sensibiliteDe('CHASSEUR').achat >= 2.5,
    'le Hunter ne domine plus sur les achats : il ne se distingue plus du Momentum');
  assert.ok(sensibiliteDe('GRIMPEUR').taille >= 2.5,
    'le Climber ne domine plus sur la taille : il ne se distingue plus du Scout');
  assert.equal(sensibiliteDe('CHASSEUR').achat, sensibiliteDe('SENTINELLE').vente,
    'le Hunter et le Sentinel ne sont plus symetriques : c est cette symetrie qui rend les deux '
    + 'lectures comparables');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok roles-variete — ' + n + ' cas · ' + METIERS.length + ' metiers, '
  + METIERS_DERIVES.length + ' derives (inchanges), tous distincts pour le reseau.');
console.log('⚠️ NE PROUVE PAS que ces roles soient interessants ni choisis : seulement qu ils sont');
console.log('   DISTINCTS pour le cerveau et qu aucun n est muet a l ecran.');
