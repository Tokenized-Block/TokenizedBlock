// test-panel-indexation.mjs — PROUVER AUJOURD HUI UNE FONCTION QUI NE TOURNERA QUE DANS UN MOIS.
//
// ⛔⛔ POURQUOI CE FICHIER EXISTE. `comparerPanels` est la seule piece de la mesure d indexation qui
//     ne s execute PAS au premier passage : elle dort jusqu a la deuxieme execution de
//     `ce-qui-garde-liste.mjs`. Si elle est cassee, on l apprendrait a ce moment-la — apres avoir
//     attendu une semaine ou un mois pour la donnee qu elle doit produire, et l attente serait a
//     refaire depuis zero. Le cout d un defaut ici ne se paie pas en minutes, il se paie en delai.
//
// ⛔ CHAQUE CAS CONSTRUIT SES DEUX PANELS A LA MAIN. Un test qui fabriquerait son entree depuis le
//    module teste ne prouverait rien d autre que sa propre coherence.
import assert from 'node:assert/strict';
import { comparerPanels } from './panel-indexation.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const j = (x) => '0xb20' + String(x).padStart(37, '0');

/* ══ 1. LE MOUVEMENT QUE TOUT CE DISPOSITIF EXISTE POUR VOIR ════════════════════════════════
 * ⛔ Une PERTE de place est la seule chose qui prouverait un retrait. Si ce cas ne passait pas,
 *    tout le panel serait un fichier qu on ecrit pour rien. */
{
  const avant = [{ jeton: j(1), etat: 'CONNU' }, { jeton: j(2), etat: 'CONNU' }];
  const apres = [{ jeton: j(1), etat: 'INCONNU', silenceH: 51 }, { jeton: j(2), etat: 'CONNU', silenceH: 2 }];
  const r = comparerPanels(avant, apres);
  eq(r.revus, 2, 'les deux jetons sont revus');
  eq(r.perdus.length, 1, 'celui qui etait CONNU et ne l est plus a PERDU sa place');
  eq(r.perdus[0].jeton, j(1), 'et c est bien le bon jeton qui est nomme');
  eq(r.perdus[0].silenceH, 51, 'la donnee du jour voyage avec lui — sans elle, « perdu » sans cause');
  eq(r.gagnes.length, 0, 'et personne n a gagne');
}

/* ══ 2. LE SENS INVERSE ═════════════════════════════════════════════════════════════════════ */
{
  const r = comparerPanels([{ jeton: j(3), etat: 'INCONNU' }], [{ jeton: j(3), etat: 'CONNU', silenceH: 1 }]);
  eq(r.gagnes.length, 1, 'INCONNU -> CONNU est un GAIN');
  eq(r.perdus.length, 0, 'et ce n est pas compte comme une perte');
}

/* ══ 3. UN JETON ABSENT D UN DES DEUX COTES N EST PAS UN MOUVEMENT ══════════════════════════
 * ⛔ C EST LE DEFAUT LE PLUS FACILE A COMMETTRE ICI. L echantillon est tire a chaque execution :
 *    des jetons entrent et sortent du tirage sans que RIEN ne leur soit arrive. Les compter
 *    ferait lire le bruit de l echantillonnage comme des gains et des pertes, a chaque fois. */
{
  const avant = [{ jeton: j(4), etat: 'CONNU' }];
  const apres = [{ jeton: j(5), etat: 'CONNU', silenceH: 3 }];
  const r = comparerPanels(avant, apres);
  eq(r.revus, 0, 'aucun jeton en commun ⇒ AUCUN revu');
  eq(r.perdus.length, 0, "celui qui a disparu du tirage n a rien perdu : on ne l a pas regarde");
  eq(r.gagnes.length, 0, "celui qui apparait n a rien gagne : il n etait pas observe avant");
}
/* ⛔ ET `revus` DOIT PERMETTRE DE DISTINGUER CE CAS DE « rien n a bouge ». Les deux rendent
 *    0 perdu / 0 gagne, et ils veulent dire l exact contraire. */
{
  const rien = comparerPanels([{ jeton: j(6), etat: 'CONNU' }], [{ jeton: j(6), etat: 'CONNU', silenceH: 1 }]);
  const vide = comparerPanels([{ jeton: j(7), etat: 'CONNU' }], [{ jeton: j(8), etat: 'CONNU', silenceH: 1 }]);
  eq(rien.perdus.length + rien.gagnes.length, 0, 'stable : 0 mouvement');
  eq(vide.perdus.length + vide.gagnes.length, 0, 'disjoint : 0 mouvement AUSSI');
  ok(rien.revus !== vide.revus,
    "⛔ et SEUL `revus` les separe — 1 contre 0. Sans lui, « rien n a bouge » et « rien n a ete "
    + 'regarde » rendraient exactement le meme resultat, et le second se lirait comme le premier');
}

/* ══ 4. UNE PANNE DE LECTURE N EST PAS UN MOUVEMENT ═════════════════════════════════════════
 * ⛔ « ILLISIBLE » veut dire que la sonde n a pas repondu. Le compter comme une perte ferait
 *    baisser la presence a chaque incident reseau — et l incident se lirait comme une decouverte. */
{
  const r = comparerPanels([{ jeton: j(9), etat: 'CONNU' }], [{ jeton: j(9), etat: 'ILLISIBLE' }]);
  eq(r.revus, 1, 'le jeton est bien revu');
  eq(r.perdus.length, 0, 'CONNU -> ILLISIBLE n est PAS une perte : c est une panne de lecture');
  eq(r.gagnes.length, 0, 'ni un gain');
}
{
  const r = comparerPanels([{ jeton: j(10), etat: 'ILLISIBLE' }], [{ jeton: j(10), etat: 'CONNU' }]);
  eq(r.gagnes.length, 0, 'ILLISIBLE -> CONNU n est pas un gain : on ignore son etat de depart');
}

/* ══ 5. LES ENTREES DEGENEREES NE JETTENT PAS ═══════════════════════════════════════════════
 * ⛔ Le premier appel reel aura un `avant` inexistant — si ca jetait, la premiere execution
 *    perdrait son propre panel en mourant juste avant de l ecrire. */
for (const [a, b, nom] of [[null, null, 'les deux nuls'], [undefined, [], 'avant absent'],
  [[], undefined, 'apres absent'], [[], [], 'les deux vides']]) {
  const r = comparerPanels(a, b);
  eq(r.revus, 0, nom + ' ⇒ 0 revu, sans exception levee');
  eq(r.perdus.length + r.gagnes.length, 0, nom + ' ⇒ aucun mouvement invente');
}

/* ══ 6. LE TEMOIN — sans lui, une fonction qui rendrait TOUJOURS zero passerait tout ce qui
 *      precede sauf le cas 1. On le redit ici avec un lot, pas un individu. ═════════════════ */
{
  const avant = [], apres = [];
  for (let i = 0; i < 10; i++) {
    avant.push({ jeton: j(100 + i), etat: i < 6 ? 'CONNU' : 'INCONNU' });
    apres.push({ jeton: j(100 + i), etat: i < 3 ? 'CONNU' : 'INCONNU', silenceH: i * 10 });
  }
  const r = comparerPanels(avant, apres);
  eq(r.revus, 10, 'temoin : les dix sont revus');
  eq(r.perdus.length, 3, 'temoin : exactement les trois qui passent de CONNU a INCONNU');
  eq(r.gagnes.length, 0, 'temoin : et aucun gain, qui serait invente');
  ok(r.perdus.every((x) => Number.isFinite(x.silenceH)),
    'temoin : chaque perte porte son silence — un « perdu » sans sa cause ne sert a rien');
}

console.log('test-panel-indexation : ' + n + ' assertions, OK');
