/* test-retrait-carte-un-seul-chemin.mjs — UN BLOCK QUITTE LA CARTE PAR UNE SEULE PORTE.
 *
 * ⛔⛔ CE QUI A DECLENCHE CE FICHIER. Phil, 2026-09-25 : « je vois beaucoup de cubes disparaitre ».
 *     Mesure en production, au format reel : 184 cubes au chargement, 174 apres le premier
 *     balayage, puis 174 CONSTANT sur 58 secondes. Ce n est PAS une fuite — c est l elagage
 *     demande, il retire une dizaine de blocks sans marche, une seule fois, et il s arrete.
 *     Mais disparaitre d un coup se LIT comme un bug. Un fondu dit « il s en va » plutot que
 *     « quelque chose a casse », pour exactement le meme resultat et sans rien cacher.
 *
 * ⛔⛔ ET ON N A PAS FAIT L AUTRE CHOSE — peindre seulement apres lecture. La lecture prend ~20 s
 *     (c est la duree de l elagage) : la carte serait VIDE pendant vingt secondes a chaque
 *     arrivee. Pour des visiteurs qui repartent vite, c est bien pire que dix cubes qui
 *     s effacent. Le compromis a ete mesure, pas devine.
 *
 * ⛔ CE QUE CE TEST GARDE : qu il n existe qu UN chemin de retrait. Il y en avait deux, chacun
 *   avec sa propre sequence — ajouter un fondu aurait demande de le recopier, et le premier oubli
 *   aurait laisse la moitie des departs brutaux. Un defaut invisible en relecture.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const src = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

const i = src.indexOf('function retirerDeLaCarte(');
assert.ok(i > 0, 'retirerDeLaCarte est introuvable : ce test ne garde plus rien');
const j = src.indexOf('function aSaPlaceSurLaCarte(', i);
const f = src.slice(i, j > i ? j : i + 1400);

v('⛔ AUCUN AUTRE ENDROIT ne retire un block de la carte a la main', () => {
  /* ⛔⛔ LE CAS CENTRAL. Deux chemins paralleles, c est la garantie qu ils divergeront — et celui
   *     qu on regarde le moins est celui qui restera faux. */
  const dehors = src.slice(0, i) + src.slice(j > i ? j : i + 1400);
  assert.doesNotMatch(dehors, /moteur3d\.retirer\(/,
    'un second chemin retire directement du moteur 3D : le fondu ne s appliquera pas la-bas');
  /* ⛔⛔ MA PREMIERE VERSION INTERDISAIT TOUT `habitants.splice`, et elle avait tort : il existe un
   *     `splice` suivi d un `unshift` qui DEPLACE un block en tete de liste. Ce n est pas un
   *     retrait — il ne touche ni au DOM ni au moteur 3D, et l interdire aurait force a contourner
   *     la garde, donc a l affaiblir pour de bon.
   *   ⇒ On interdit les retraits, pas les deplacements : un `splice` doit etre suivi d une
   *     remise en liste, sinon c est une sortie, et une sortie passe par le helper. */
  for (const m of dehors.matchAll(/habitants\.splice\(/g)) {
    const suite = dehors.slice(m.index, m.index + 120);
    assert.match(suite, /habitants\.(unshift|push)\(/,
      'un `habitants.splice` hors du helper n est pas suivi d une remise en liste : c est donc un '
      + 'retrait, et il contournera le fondu.\n   contexte : ' + suite.replace(/\s+/g, ' ').slice(0, 90));
  }
});

v('la logique part TOUT DE SUITE, l image s eteint ensuite', () => {
  /* ⛔ Si `splice` attendait la fin du fondu, du code pourrait compter, viser ou redessiner un
   *   block qui s en va — pendant une demi-seconde, deux verites coexisteraient. */
  const avantLacher = f.slice(0, f.indexOf('const lacher'));
  assert.match(avantLacher, /habitants\.splice\(/,
    'le block reste dans `habitants` pendant le fondu : il serait encore compte et vise');
});

v('le moteur 3D lache EN MEME TEMPS que le DOM, pas avant', () => {
  /* ⛔ Le retirer d abord figerait le cube en pleine course : un cube immobile qui palit se lit
   *   comme un plantage, pas comme un depart. */
  const lacher = f.slice(f.indexOf('const lacher'), f.indexOf('};', f.indexOf('const lacher')));
  assert.match(lacher, /h\.el\.remove\(\)/, 'le DOM n est plus libere');
  assert.match(lacher, /moteur3d\.retirer/, 'le moteur 3D n est plus libere');
  /* ⛔⛔⛔ CE CAS ETAIT VERT SUR DU CODE JAMAIS EXECUTE, et c est moi qui l ai ecrit.
   *      `moteur3d.retirer` N EXISTAIT PAS : `creerMoteur3D` ne l exportait pas, et l appel dans
   *      app.html est garde par `typeof moteur3d.retirer === 'function'`. La garde ci-dessus
   *      cherchait la CHAINE dans la source — elle prouvait que la ligne est ecrite, jamais
   *      qu elle agit. Pendant ce temps, apres chaque retrait, faisceaux, ondes et centre de
   *      l univers gardaient une poignee sur un habitant disparu.
   *    ⇒ ON EXIGE L EXPORT REEL. Une fonction appelee derriere un `typeof` doit exister, sinon la
   *      garde est toujours fausse (`garde-sur-element-absent-toujours-fausse`). */
  const m3 = readFileSync(new URL('./map3d.js', import.meta.url), 'utf8');
  const rendu = m3.slice(m3.lastIndexOf('return {'));
  assert.match(rendu, /\bretirer\s*:/,
    'app.html appelle moteur3d.retirer derriere un typeof, mais map3d.js ne l exporte pas : '
    + 'la branche est MORTE et ce test etait vert sur du code jamais execute');
});

v('⛔⛔ toute fonction appelee derriere un `typeof` du moteur existe vraiment', () => {
  /* ⛔⛔ LA GENERALISATION DU DEFAUT CI-DESSUS. Chaque `typeof moteur3d.X === 'function'` est une
   *     garde qui, si X n existe pas, est TOUJOURS fausse — donc silencieuse, donc invisible en
   *     relecture comme en test. On les verifie toutes d un coup plutot que d attendre la prochaine. */
  const m3 = readFileSync(new URL('./map3d.js', import.meta.url), 'utf8');
  const rendu = m3.slice(m3.lastIndexOf('return {'));
  const manquants = [];
  for (const m of html.matchAll(/typeof moteur3d\.([A-Za-z0-9_$]+) === 'function'/g)) {
    const nom = m[1];
    if (!new RegExp('\\b' + nom + '\\s*[:,]').test(rendu)) manquants.push(nom);
  }
  assert.deepEqual(manquants, [],
    'appelees derriere un typeof mais absentes de map3d.js — ces gardes sont toujours fausses : '
    + manquants.join(', '));
});

v('⛔⛔ le fondu gagne sur le style EN LIGNE du moteur', () => {
  /* ⛔⛔ AUTRE GARDE QUE J AI LIVREE VERTE SUR UN EFFET INVISIBLE. `map3d.js` ecrit
   *     `h.el.style.opacity` en ligne a chaque image ; un style en ligne bat une classe. Le block
   *     gardait donc son opacite et disparaissait D UN COUP — precisement ce que ce fondu devait
   *     corriger. Lire la regle CSS ne disait rien de ce qui se passe a l ecran. */
  const i = html.indexOf('.bloc.sEteint{');
  assert.ok(i > 0, 'la regle d extinction a disparu');
  const regle = html.slice(i, html.indexOf('}', i) + 1);
  assert.match(regle, /opacity:\s*0\s*!important/,
    'le fondu ne porte plus !important : le style en ligne du moteur 3D le neutralise, et '
    + 'le block disparaitra de nouveau d un coup');
  const m3 = readFileSync(new URL('./map3d.js', import.meta.url), 'utf8');
  assert.match(m3, /\.el\.style\.opacity\s*=/,
    'le moteur n ecrit plus l opacite en ligne : si c est voulu, le !important ci-dessus peut '
    + 'partir — mais il faut le verifier, pas le supposer');
});

v('⛔ le fondu ne touche QUE l opacite', () => {
  /* ⛔⛔ Le moteur 3D pilote `transform` sur ces memes elements. Lui disputer la propriete ferait
   *     SAUTER le cube au lieu de l eteindre — on aurait remplace un defaut par un pire. */
  const css = html.slice(html.indexOf('.bloc.sEteint'), html.indexOf('.bloc.sEteint') + 260);
  assert.match(css, /opacity:\s*0/, 'la regle d extinction ne rend plus le block transparent');
  assert.doesNotMatch(css, /transform\s*:/,
    'le fondu touche a `transform` : le moteur 3D la pilote deja, le cube sauterait');
});

v('le reglage « mouvement reduit » est respecte', () => {
  /* ⛔ Quelqu un qui a demande moins d animation ne doit pas en recevoir une de plus, meme douce. */
  assert.match(f, /mouvementReduit/, 'le fondu ignore le reglage systeme de mouvement reduit');
  assert.match(html, /prefers-reduced-motion:reduce\)\{\.bloc\.sEteint\{transition:none\}\}/,
    'la regle CSS ne neutralise plus la transition en mouvement reduit');
});

v('un element deja detache ne fait pas tomber le retrait', () => {
  /* ⛔ Un retrait qui jette laisserait le block VISIBLE et la liste incoherente — a moitie retire
   *   est le seul etat qu on ne veut jamais. */
  assert.match(f, /catch \(_\)/, 'une exception pendant le retrait remonterait');
  assert.match(f, /if \(!h\) return/, 'un habitant nul ferait jeter des la premiere ligne');
});

assert.equal(n, 8, 'compte de cas inattendu : ' + n);
console.log('ok retrait-carte-un-seul-chemin — ' + n + ' cas : une seule porte de sortie, la logique');
console.log('   part d abord, et le fondu ne dispute rien au moteur 3D.');
console.log('⚠️ NE PROUVE PAS que le fondu se voit : ca se regarde dans un navigateur.');
