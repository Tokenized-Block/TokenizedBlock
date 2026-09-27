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
/* ⛔⛔ CE CAS A ETE RETOURNE DEUX FOIS LE MEME JOUR, ET L HISTORIQUE RESTE ECRIT ICI POUR QU IL NE
 *     SOIT JAMAIS LU COMME UNE ERREUR A CORRIGER. C est Phil qui tranche, pas le test :
 *       1. cube A COTE — « le users cube a cote que tu peux faire bouger » ;
 *       2. cube RETIRE — capture, cube barre en rouge, « glow up la sphere et retirer le block » ;
 *       3. cube REMIS, CERVEAU DEDANS — « remets le cube et a l interieur le brain en 3d ».
 *   ⇒ Le test suit la decision PRODUIT et en garde la trace. Sans ca, le prochain lecteur verrait
 *     un aller-retour inexplicable et « nettoierait » l un des deux.
 *
 * ⛔⛔ ET CE QU IL TIENT VRAIMENT N EST PAS « le cube existe » : c est L ORDRE DE DESSIN. Un cube
 *     peint entierement avant ou apres la sphere donnerait une sphere POSEE devant ou CACHEE
 *     derriere — jamais CONTENUE. Le contenant se prouve par l entrelacement, pas par la presence. */
v('⛔ le cube contient la sphere : arriere AVANT, avant APRES', () => {
  assert.ok(/function aretesDuCube\(/.test(nu), 'le cube du block a disparu');
  const i = nu.indexOf('const aretesCube = aretesDuCube(');
  assert.notEqual(i, -1, 'les aretes du cube ne sont plus calculees dans le dessin');
  const jSphere = nu.indexOf('aretes.sort((a, b) => a.z - b.z)');
  const jArriere = nu.indexOf('if (f.z < 0) traitCube(');
  const jAvant = nu.indexOf('if (f.z >= 0) traitCube(');
  assert.notEqual(jArriere, -1, 'la moitie ARRIERE du cube n est plus dessinee');
  assert.notEqual(jAvant, -1, 'la moitie AVANT du cube n est plus dessinee');
  /* ⛔ L ORDRE DANS LE SOURCE EST L ORDRE DE PEINTURE : arriere < sphere < avant. Si quelqu un
   *   deplace une de ces lignes, la sphere cesse d etre dedans SANS qu aucune autre garde bronche. */
  assert.ok(jArriere < jSphere, 'la moitie arriere du cube se peint APRES la sphere : elle la masquerait');
  assert.ok(jAvant > jSphere, 'la moitie avant du cube se peint AVANT la sphere : rien ne passerait devant');
});

v('⛔⛔ on peut zoomer ET revenir — un zoom sans retour enferme', () => {
  /* ⛔⛔ `passive: false` EST LE PIEGE DE CE GESTE. Sans lui le navigateur refuse
   *     `preventDefault()` sur la molette : le cerveau zoomerait ET la page defilerait sous lui.
   *     Un zoom qui marche sur une page qui s enfuit est intenable a l usage, et ca se lit tres
   *     bien dans le code sans se voir. */
  assert.ok(/'wheel'[\s\S]{0,220}\{ passive: false \}/.test(nu),
    'la molette n est plus en `passive: false` : zoomer ferait defiler la page sous le cerveau');
  /* ⛔ LE PINCEMENT COMPTE AUTANT : ce panneau se regarde surtout au telephone, et un zoom reserve
   *   a la souris n existerait pas pour la moitie des visiteurs. */
  assert.ok(/pointerType !== 'touch'/.test(nu), 'le pincement a disparu : plus de zoom au telephone');
  /* ⛔⛔ ET UNE SORTIE DE SECOURS. Quelqu un perdu au fond du cerveau n a aucun moyen de revenir —
   *     fermer le volet ne remet pas le zoom. Un zoom sans retour est une impasse. */
  assert.ok(/'dblclick'/.test(nu), 'plus de retour a la vue d origine : on peut rester enferme dedans');
  /* ⛔ BORNE DES DEUX COTES : une seule borne laisse une des deux impasses ouverte. */
  assert.ok(/BW_ZOOM_MIN/.test(nu) && /BW_ZOOM_MAX/.test(nu), 'le zoom n est plus borne des deux cotes');
});

v('⛔⛔ viser un neurone : un clic dans le VIDE ne doit pas en trouver un', () => {
  /* ⛔⛔ LE PIEGE DE CE GESTE : « le plus proche » existe TOUJOURS. Une recherche du minimum sans
   *     seuil ne peut JAMAIS rendre « rien » — donc un clic n importe ou dans le vide designerait
   *     un neurone a l autre bout de la toile, et l anneau apparaitrait loin du doigt. C est un
   *     faux positif GARANTI, pas un cas rare. */
  assert.ok(/d2min <= TOLERANCE \* TOLERANCE/.test(nu),
    'la recherche du neurone le plus proche n a plus de seuil : un clic dans le vide en trouverait un');
  /* ⛔ ET LES COORDONNEES DOIVENT ETRE CELLES DE LA TOILE, pas de la page : la toile est mise a
   *   l echelle par le CSS, et confondre les deux fait viser de plus en plus a cote en s eloignant
   *   du centre — une erreur qui grandit au lieu de sauter aux yeux. */
  assert.ok(/c\.width \/ box\.width/.test(nu) && /c\.height \/ box\.height/.test(nu),
    'le clic ne convertit plus vers les coordonnees de la toile : la visee deriverait sur les bords');
  /* ⛔ UN GLISSEMENT N EST PAS UN CLIC : tourner la sphere se termine par un relachement qui
   *   ressemble a un clic, et selectionnerait un neurone a chaque rotation. */
  assert.ok(/> 4\) \{ depart = null; return; \}/.test(nu),
    'une rotation qui se termine selectionne un neurone : le glissement n est plus distingue du clic');
});

v('⛔⛔ `bwNeurone` : `null` et `0` sont DEUX choses differentes', () => {
  /* ⛔⛔ LE NEURONE D INDICE 0 EXISTE. Tester `if (bwNeurone)` le traiterait comme « aucun » — il
   *     serait le seul des 128 a ne jamais pouvoir etre choisi, et ca passerait inapercu longtemps.
   *     Toute comparaison doit etre EXPLICITE contre `null`. */
  assert.ok(/bwNeurone === i/.test(nu), 'le neurone choisi n est plus compare par identite a l indice');
  assert.ok(/bwNeurone !== null/.test(nu),
    'le neurone choisi est teste par verite : le neurone 0 serait invisible pour toujours');
  /* ⛔ ET SON ETAT SE LIT EN TOUTES LETTRES : deux couleurs a 2 px de rayon ne se distinguent pas
   *   pour tout le monde. L anneau montre OU il est ; la ligne ecrite dit CE QU IL FAIT. */
  assert.ok(/firing now|quiet on this beat/.test(nu),
    'l etat du neurone choisi n est plus ecrit : la couleur seule ne se lit pas');
});

v('⛔⛔ le block REGARDE n est jamais fige', () => {
  /* ⛔⛔ `.loin` met `animation-play-state: paused` sur le cube ET ses satellites, et remplace le
   *     volume par une face plate. C est juste pour un block lointain — mais le block CENTRE ou
   *     SELECTIONNE est justement celui qu on observe. Phil : « le block ne bouge plus, il reste
   *     fige ». Mesure : le cube du block clique rendait `animationPlayState: "paused"`.
   *   ⛔ LA TAILLE NE SUFFISAIT PAS COMME CRITERE : un block centre peut rester sous 64 px si la
   *     camera est loin ou l ecran etroit. Ce qui decide n est pas sa taille, c est qu on l ait
   *     choisi. */
  const m = readFileSync(new URL('./map3d.js', import.meta.url), 'utf8');
  assert.ok(/const petit = !regarde && h\.t \* k < 64;/.test(m),
    'le block centre ou selectionne peut de nouveau etre classe « loin », donc FIGE');
  assert.ok(/h\.centreFixe \|\| \(h\.el && h\.el\.classList\.contains\('actif'\)\)/.test(m),
    'la definition de « regarde » ne couvre plus les deux cas : centre ET selectionne');
});

v('⛔ la sphere TIENT dans le cube, et son rayon est calcule', () => {
  /* ⛔ UNE GARDE PEUT ETRE CORRECTE PAR ACCIDENT : un rayon ecrit en dur tomberait juste a une
   *   taille de toile et deborderait a une autre. Il doit etre DERIVE du demi-cote du cube. */
  assert.ok(/const r = R \* 0\.\d+;/.test(nu),
    'le rayon de la sphere n est plus derive du cube : elle pourrait en sortir');
  const m = nu.match(/const r = R \* (0\.\d+);/);
  assert.ok(m && Number(m[1]) < 1,
    'le rayon vaut au moins le demi-cote : la sphere toucherait ou traverserait les faces');
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

assert.equal(n, 13, 'compte de cas inattendu : ' + n);
console.log('ok sphere-cablage — ' + n + ' cas.');
console.log('   Sphere deterministe, tri par profondeur, geste au doigt, panneau qui ne dit que des');
console.log('   mesures, et le raster 2D intact.');
console.log('   LE CERVEAU EST DANS LE CUBE, et ce qui le prouve est l ORDRE : aretes arriere, puis');
console.log('   la sphere, puis aretes avant. Le rayon est DERIVE du demi-cote, jamais ecrit en dur.');
console.log('   Le halo d humeur vient de la phase — et NON_LU comme MORT n en recoivent aucun.');
console.log('⚠️ NE PROUVE PAS le rendu : ca a ete mesure en navigateur (77 992 pixels peints,');
console.log('   signature du canvas qui change apres un glissement, 310x233 sans debordement a 375 px).');
