/* test-sphere-cablage.mjs — LA SPHERE EST UNE SPHERE, ET LE PANNEAU NE DIT QUE DES MESURES.
 *
 * ⛔⛔ CE QUI L A DEMANDE (Phil, 2026-09-26) : « la sphere tu vas la faire ronde en 3d et decrire ce
 *     qui se passe avec les neurons sur le cote, garde cote 2d comme avant » puis « le cube c est
 *     le users cube a cote que tu peux faire bouger ».
 *
 * ⛔ POURQUOI CE N ETAIT PAS QU UNE QUESTION DE GOUT. Le dessin plat posait les 128 neurones sur un
 *   ANNEAU : les 8 liens de chacun traversaient tous le meme disque, et le reseau devenait un noeud
 *   de fils ou rien ne se distinguait. Ce n est pas la projection qui fait la 3D, c est LE TRI PAR
 *   PROFONDEUR : sans lui un lien du fond se dessine par-dessus un lien de l avant et la sphere
 *   s aplatit — on retrouve exactement ce qu on voulait defaire.
 *
 * ⛔ ET LE PANNEAU EST LE VRAI RISQUE. Une ligne inventee a cote d une mesure est un mensonge place
 *   au pire endroit possible. Chaque ligne affichee doit venir du battement que le module vient de
 *   rendre — jamais d un calcul fait dans l ecran.
 *
 * ⚠️ CE QUE CE TEST NE PROUVE PAS : que ca soit beau, ni que la sphere tourne a l ecran. Ca a ete
 *   mesure dans un navigateur (77 992 pixels peints, signature du canvas qui CHANGE apres un
 *   glissement, toile 310x233 sans debordement a 375 px, panneau passe dessous) — mais une mesure
 *   de navigateur ne tient pas dans une suite Node. Ce test garde la STRUCTURE.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const brut = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const nu = brut.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('⛔⛔ les neurones sont sur une SPHERE, et toujours la meme', () => {
  assert.ok(/function posSphere\(n\)/.test(nu), 'la repartition spherique a disparu');
  /* ⛔ FIBONACCI, PAS UN TIRAGE ALEATOIRE. Deux visites du meme block doivent montrer la MEME
   *   sphere : sinon « same wiring and same facts replay the same beat », ecrit sous le dessin,
   *   devient faux a l ecran. */
  assert.ok(/Math\.PI \* \(3 - Math\.sqrt\(5\)\)/.test(nu),
    'la repartition n est plus deterministe : la sphere changerait a chaque visite du meme block');
  assert.ok(!/posSphere[\s\S]{0,400}Math\.random/.test(nu),
    'du hasard est entre dans la position des neurones');
  /* ⛔ L ORDRE DES INDICES EST CONSERVE : le neurone i reste le neurone i, sinon les liens — qui
   *   pointent par indice — designeraient d autres neurones. */
  assert.ok(/const pos = bwSphere\.map\(\(v\) => bwProjeter\(v, cx, cy, r\)\);/.test(nu),
    'la projection ne suit plus l ordre des neurones');
});

v('⛔⛔ le tri par profondeur existe — c est lui qui fait la 3D', () => {
  assert.ok(/aretes\.sort\(\(a, b\) => a\.z - b\.z\)/.test(nu),
    'les liens ne sont plus tries du fond vers l avant : la sphere s aplatirait et on retrouverait '
    + 'le noeud de fils du dessin plat');
  assert.ok(/ordre = pos\.map\(\(p, i\) => i\)\.sort\(\(a, b\) => pos\[a\]\[2\] - pos\[b\]\[2\]\)/.test(nu),
    'les neurones ne sont plus tries par profondeur');
  /* ⛔ ET LA PROFONDEUR SE VOIT : sans variation d opacite, un tri correct reste invisible. */
  assert.ok(/const prof = \(e\.z \+ 1\) \/ 2;/.test(nu),
    'la profondeur ne module plus l opacite des liens : le tri ne se verrait pas');
});

/* ⛔⛔ CE CAS A ETE RETOURNE LE 2026-09-26, ET C EST VOLONTAIRE. Il exigeait la PRESENCE du cube —
 *     Phil l avait demande : « le cube c est le users cube a cote que tu peux faire bouger ». Il a
 *     ensuite demande son RETRAIT, capture a l appui : cube barre en rouge, fleche vers la sphere,
 *     « glow up la sphere et retirer le block ».
 *   ⇒ Un test vert qui exige une chose retiree tient la MAUVAISE MOITIE : il serait passe rouge au
 *     retrait, et on l aurait « repare » en le supprimant, sans trace. On le RETOURNE : il exige
 *     desormais l ABSENCE. Un retour du cube sera donc un CHOIX — quelqu un devra retoucher ce
 *     test — et jamais une rechute silencieuse. */
v('⛔ le cube est RETIRE, et son retour serait un choix explicite', () => {
  assert.ok(!/function dessinerCubeDuBlock\(/.test(nu),
    'le cube du block est revenu : si c est voulu, ce test doit etre retourne AVEC la raison');
  assert.ok(!/dessinerCubeDuBlock\(/.test(nu), 'le cube est encore appele quelque part');
  /* ⛔ ET LA LEGENDE NE DOIT PLUS LE NOMMER : une legende qui designe un objet absent fait chercher
   *   au visiteur quelque chose qui n existe pas. C est Phil qui l a vu sur sa capture, pas moi. */
  assert.ok(!/the cube is the block/.test(nu),
    'la legende parle encore du cube alors qu il n est plus dessine');
});

/* ⛔ CE QUE LE CERVEAU RESSENT DOIT ETRE DERIVE D UNE VALEUR REELLE, JAMAIS DECORATIF. */
v('⛔ le halo d humeur vient de la PHASE, et `NON_LU` n en recoit AUCUN', () => {
  assert.ok(/TEINTE_HUMEUR/.test(nu), 'le halo d humeur a disparu');
  const i = nu.indexOf('const TEINTE_HUMEUR');
  const table = nu.slice(i, nu.indexOf('}', i));
  /* ⛔⛔ LE CAS QUI COMPTE : peindre une humeur sur un marche ILLISIBLE inventerait un sentiment.
   *     Le cerveau le dit lui-meme : « no mood is judged until it is ». `MORT` non plus — on ne
   *     fait pas briller un mort. */
  assert.ok(!/NON_LU/.test(table), '`NON_LU` recoit une teinte : on peindrait une humeur non jugee');
  assert.ok(!/MORT/.test(table), '`MORT` recoit une teinte : on ferait briller un mort');
  assert.ok(/CURIEUX|EXCITE|INQUIET/.test(table), 'aucune phase reelle n est mappee');
});

v('⛔ le biais des ailes ne peut pas produire un NaN', () => {
  /* ⛔ UN NaN TRAVERSE TOUTES LES BORNES : `Math.min(1, NaN)` rend NaN, et le halo se dessinerait
   *   hors du canvas sans que rien ne le signale. Deux ailes a zero doivent donner exactement 0. */
  assert.ok(/somme > 0 && Number\.isFinite\(gz\) && Number\.isFinite\(dz\)/.test(nu),
    'le biais des ailes ne se garde pas contre un denominateur nul ou une valeur absente');
});

v('⛔ on peut la tourner au doigt, et l auto ne reprend pas la main', () => {
  assert.ok(/pointerdown/.test(nu) && /pointermove/.test(nu),
    'la rotation n est plus branchee sur les pointer events : le doigt ne tournerait rien');
  /* ⛔ SANS `touch-action:none`, le doigt fait DEFILER LA PAGE au lieu de tourner — et c est en
   *   telephone que ce depot se mesure. */
  /* ⛔⛔ CETTE ASSERTION LISAIT LE FICHIER BRUT — donc SON PROPRE COMMENTAIRE, qui cite
   *     `touch-action:none` pour expliquer a quoi il sert. Une mutation qui RETIRAIT la regle CSS
   *     laissait la garde verte, parce qu elle retrouvait le mot dans la phrase qui en parle.
   *     C est la quatrieme fois de la journee qu une sonde de ce depot accuse ou absout sa propre
   *     documentation : ici on lit la version DEPOUILLEE, comme partout ailleurs. */
  /* ⛔⛔ ET ELLE TENAIT LA MAUVAISE MOITIE. `touch-action:none` existe AUSSI sur `.mapEnv.a3d`, la
   *     carte 3D — un autre element, un autre ecran. Chercher la propriete n importe ou verdissait
   *     donc meme en la retirant de NOTRE toile. Une mutation l a montre : elle a frappe la regle de
   *     la carte, la garde n a rien dit, et j ai failli conclure qu elle etait inerte.
   *   ⇒ On asserte sur LA REGLE `.bwToile`, pas sur la presence du mot quelque part. */
  assert.ok(/\.bwToile\{[^}]*touch-action:none/.test(nu),
    'la toile du cablage n a plus `touch-action:none` : sur telephone le geste ferait defiler la '
    + 'page au lieu de tourner la sphere (attention : la carte 3D en a un, lui — il ne compte pas)');
  assert.ok(/setPointerCapture/.test(nu),
    'le geste n est plus capture : la sphere se figerait des que le doigt sort de la toile');
  /* ⛔ L AUTO S ARRETE ET NE REPREND PAS : reprendre la main sur un objet que l utilisateur vient
   *   d orienter, c est lui dire que son geste ne compte pas. */
  assert.ok(/bwVue\.auto = false;/.test(nu), 'la rotation automatique ne s arrete plus au premier geste');
  assert.ok(!/bwVue\.auto = true;/.test(nu), 'quelque chose relance la rotation automatique apres un geste');
  /* ⛔ ET ELLE NE TOURNE PAS POUR PERSONNE : onglet cache ou volet inactif, on ne redessine pas. */
  assert.ok(/if \(document\.hidden\) return;/.test(nu),
    'la boucle tourne meme quand l onglet est cache : du calcul pour personne');
});

v('⛔⛔ le panneau ne dit QUE des chiffres du battement', () => {
  const i = nu.indexOf('function dessinerReseauDit(');
  assert.ok(i > 0, 'le panneau lateral a disparu');
  const corps = nu.slice(i, nu.indexOf('\n}', i));
  /* Chaque valeur doit venir de `vu` (ou du cablage), jamais d un calcul local. */
  for (const champ of ['vu.spikes', 'vu.gauche_hz', 'vu.droite_hz', 'vu.virage', 'vu.memoire', 'vu.phase']) {
    assert.ok(corps.includes(champ), 'le panneau ne lit plus ' + champ + ' : une ligne serait inventee');
  }
  /* ⛔ UN SILENCE SE DIT. Un panneau vide se lirait comme une panne. */
  assert.ok(/No neuron fired on this beat — the network is quiet, not broken\./.test(nu),
    'le cas « aucun neurone n a tire » n est plus nomme : un panneau vide passerait pour une panne');
  /* ⛔ ET LE DERNIER BATTEMENT EST RETENU : sans lui, tourner la sphere entre deux battements
   *   eteindrait tous les neurones et on croirait le cerveau arrete parce qu on a bouge la souris. */
  assert.ok(/brainDernierVu = r\.vu;/.test(nu),
    'le dernier battement n est plus retenu : tourner la sphere eteindrait tout');
});

v('⛔ le raster 2D des battements n a pas ete touche', () => {
  /* Phil : « garde cote 2d comme avant ». */
  assert.ok(/function dessinerRaster\(/.test(nu), 'le raster 2D a disparu');
  assert.ok(/dessinerRaster\(\);/.test(nu), 'le raster n est plus dessine a chaque battement');
});

assert.equal(n, 8, 'compte de cas inattendu : ' + n);
console.log('ok sphere-cablage — ' + n + ' cas.');
console.log('   Sphere deterministe, tri par profondeur, geste au doigt, panneau qui ne dit que des');
console.log('   mesures, et le raster 2D intact. Le CUBE A ETE RETIRE : ce test exige maintenant son');
console.log('   ABSENCE, pour qu un retour soit un choix et pas une rechute.');
console.log('   Le halo d humeur est derive de la phase — et NON_LU comme MORT n en recoivent aucun.');
console.log('⚠️ NE PROUVE PAS le rendu : ca a ete mesure en navigateur (77 992 pixels peints,');
console.log('   signature du canvas qui change apres un glissement, 310x233 sans debordement a 375 px).');
