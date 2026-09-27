/* test-map-nan-et-rotation.mjs — UN NaN NE DOIT PAS FAIRE DISPARAITRE UN BLOCK EN SILENCE.
 *
 * ⛔⛔ LE BUG, ET IL ETAIT REEL. `placer()` ne posait que `vz`. Or la derive fait
 *     `h.wx += h.vx * vit`, et `vx`/`vy` sont ecrits par le CERVEAU, pas par la map. Un block
 *     dessine AVANT son premier battement faisait donc `undefined * vit` = NaN.
 *
 * ⛔⛔ ET LE NaN TRAVERSE TOUTES LES BORNES, PARCE QU IL EST FAUX DES DEUX COTES DE CHAQUE
 *     COMPARAISON :
 *       · `Math.abs(NaN) > SX - m`  est FAUX  -> aucun rebond ne le rattrape ;
 *       · `p.zc < S * 0.12`         est FAUX  -> rien ne le masque non plus.
 *     Le block disparait sans erreur, sans trace, sans qu une seule garde bronche. C est
 *     exactement le motif « un NaN echoue OUVERT ».
 *
 * ⛔ LA PREUVE QUE QUELQU UN L AVAIT DEJA CROISE : la ligne de derive ecrivait `(h.vz || 0)` pour
 *   la profondeur, et RIEN pour `vx`/`vy`. Un correctif applique a UN SEUL des trois jumeaux.
 *
 * ⛔⛔ ET LE PIRE : LE NaN S AUTO-ENTRETIENT. Le cerveau recalcule sa direction avec
 *     `Math.atan2(h.vy, h.vx)` ; `Math.atan2(NaN, NaN)` rend encore NaN. Un block casse une fois
 *     reste casse POUR TOUTE LA SESSION. Reparer `placer()` ne suffisait donc pas : il fallait
 *     aussi pouvoir RAMENER un block deja perdu, et garder l autre bout dans `app.html`.
 *
 * ⚠️ CE QUE CE TEST NE PROUVE PAS : le rendu. Il lit le source et rejoue l arithmetique de la
 *   derive ; il ne peint rien. Que la map bouge a l ecran a ete regarde en navigateur.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

let n = 0;
const v = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

const map = readFileSync(new URL('./map3d.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

/* ── 1. le NaN traverse vraiment les bornes : on le REJOUE, on ne le suppose pas ────────────── */
v('⛔⛔ un NaN passe a travers le rebond ET a travers le masquage', () => {
  /* ⛔ CE CAS EST LA POUR QUE PERSONNE N AIT A ME CROIRE SUR PAROLE. Si un jour `Math.abs(NaN) > x`
   *   rendait vrai, la garde deviendrait inutile et ce test le dirait. */
  const SX = 3200, m = 40;
  assert.equal(Math.abs(NaN) > SX - m, false, 'le rebond attraperait un NaN — la garde serait inutile');
  assert.equal(NaN < 0.12, false, 'le masquage attraperait un NaN');
  /* et une position NaN ne revient jamais par l arithmetique seule */
  let wx = NaN;
  for (let i = 0; i < 50; i++) wx += 0.1;
  assert.ok(Number.isNaN(wx), 'un NaN se resorbe tout seul : ce test ne defend plus rien');
});

/* ── 2. `placer()` pose les TROIS vitesses, plus la rotation ────────────────────────────────── */
v('⛔ `placer()` pose vx, vy ET vz — pas un seul des trois jumeaux', () => {
  const i = map.indexOf('function placer(h)');
  assert.notEqual(i, -1, '`placer` a disparu de map3d.js');
  const corps = map.slice(i, map.indexOf('\n  }', i));
  for (const cle of ['h.vx =', 'h.vy =', 'h.vz =']) {
    assert.ok(corps.includes(cle), '`placer()` ne pose pas ' + cle + ' : la derive rendrait NaN');
  }
  
});

v('⛔ les vitesses viennent de l ADRESSE, pas du hasard', () => {
  /* ⛔ Deux personnes qui ouvrent la meme map doivent voir le meme univers bouger pareil. Un
   *   `Math.random()` sur la vitesse rendrait deux ecrans incomparables des la premiere seconde —
   *   et rendrait ce comportement impossible a reproduire dans un rapport de bug. */
  const i = map.indexOf('function placer(h)');
  const corps = map.slice(i, map.indexOf('\n  }', i));
  assert.ok(/parseInt\(a\.slice\(/.test(corps), 'les vitesses ne derivent plus de l adresse');
});

/* ── 3. un block DEJA casse doit revenir ────────────────────────────────────────────────────── */
v('⛔⛔ une POSITION saine n est JAMAIS jetee parce qu une VITESSE manque', () => {
  /* ⛔⛔ CE CAS EXISTE PARCE QUE MA REPARATION A CASSE LA MAP, ET QUE PHIL L A VU AVANT MOI.
   *     Premiere version de `saine()` : des qu UN champ n etait pas fini, elle appelait `placer(h)`
   *     EN ENTIER — donc elle redonnait une position ALEATOIRE. Or au premier rendu, `vx`/`vy` d un
   *     block dont le cerveau n a pas encore battu sont absents. Resultat : au chargement, le block
   *     CENTRE sautait hors du centre. « bug au lancement de la map, apparait pas au centre ».
   *   ⇒ UNE REPARATION QUI EN FAIT TROP EST UNE PANNE. Position et vitesse sont deux champs
   *     differents, avec deux causes differentes : on repare champ par champ. */
  const i = map.indexOf('function saine(h)');
  assert.notEqual(i, -1, 'le rattrapage a disparu');
  const corps = map.slice(i, map.indexOf('\n  }', i));
  assert.ok(/if \(!posOk\) \{ placer\(h\); return false; \}/.test(corps),
    'le replacement complet n est plus reserve au cas ou la POSITION est cassee');
  /* ⛔ ET LA BRANCHE « position bonne, vitesse absente » doit reparer SANS replacer : si `placer(`
   *   apparait apres le test de position, on rejette une position saine. */
  /* ⛔ ON COUPE A LA FIN DE LA LIGNE, PAS A UN DECALAGE EN CARACTERES. Ma premiere version faisait
   *   `indexOf(...) + 12`, ce qui retombait AU MILIEU de `if (!posOk) { placer(h); ... }` : le test
   *   accusait donc le correctif lui-meme. Un decalage en dur se decale des que la ligne change. */
  const finLigne = corps.indexOf('\n', corps.indexOf('if (!posOk)'));
  const apres = corps.slice(finLigne);
  assert.ok(!/placer\(h\)/.test(apres),
    'une position SAINE est encore jetee quand une vitesse manque : le block centre sauterait');
  assert.ok(/if \(!Number\.isFinite\(h\.vx\)\) h\.vx =/.test(corps),
    'les vitesses manquantes ne sont plus reparees une par une');
});

v('⛔⛔ un block deja NaN est REPLACE, pas abandonne', () => {
  /* ⛔ C EST LA MOITIE QU ON OUBLIE. Corriger `placer()` protege les futurs ; ca ne ramene pas
   *   celui qui est deja perdu — et il l est pour toute la session, puisque le cerveau recalcule
   *   son angle a partir de la valeur cassee. */
  assert.ok(/function saine\(h\)/.test(map), 'le rattrapage des blocks NaN a disparu');
  const i = map.indexOf('function saine(h)');
  const corps = map.slice(i, map.indexOf('\n  }', i));
  assert.ok(/Number\.isFinite\(h\.vx\)/.test(corps) && /Number\.isFinite\(h\.wx\)/.test(corps),
    'le rattrapage ne verifie pas a la fois la position ET la vitesse');
  assert.ok(/placer\(h\)/.test(corps), 'le rattrapage ne replace pas le block : il le laisse perdu');
  assert.ok(/\n      saine\(h\);/.test(map), '`saine` n est pas appelee dans la boucle d image');
});

/* ── 4. l autre bout : le cerveau ────────────────────────────────────────────────────────────── */
v('⛔⛔ le cerveau ne fabrique plus un angle a partir de rien', () => {
  /* ⛔ LA GARDE DOIT VIVRE AUX DEUX BOUTS. La map pose maintenant des vitesses au placement, mais
   *   un cerveau peut battre AVANT elle. Ne garder que le cote map laisserait la porte ouverte la
   *   ou le probleme a commence. */
  assert.ok(/Number\.isFinite\(h\.vx\) && Number\.isFinite\(h\.vy\)/.test(app),
    'le cerveau calcule encore `Math.atan2` sans verifier que les vitesses existent');
  assert.ok(/oriente \? Math\.atan2\(h\.vy, h\.vx\) : 0/.test(app),
    'aucun angle de repli quand la direction n existe pas encore');
});

/* ── 5. la rotation respecte le mouvement reduit ────────────────────────────────────────────── */
v('⛔⛔ le seuil de VOLUME doit etre ATTEIGNABLE — sinon il eteint tout en silence', () => {
  /* ⛔⛔ CE CAS EXISTE PARCE QU UN SEUIL INATTEIGNABLE A ETEINT TOUTE LA GALAXIE. Mesure en
   *     production (1280x900) : 58 blocks visibles, taille MEDIANE 20 px, MAXIMUM 58 px, et ZERO
   *     au-dessus des 64 px que `.loin` exigeait. Les 58 etaient donc des IMAGES PLATES.
   *     Une regle dont la condition n est JAMAIS remplie n est pas un arbitrage : c est un
   *     interrupteur eteint, et rien ne le signale.
   *   ⇒ Le seuil de volume doit rester AU NIVEAU du plancher de taille, sinon on retombe dedans :
   *     tous les blocks sont pousses a PX_MIN, et un seuil au-dessus les exclut tous. */
  const mVol = map.match(/PX_VOLUME = (\d+)/);
  const mPlancher = map.match(/const PX_MIN = (\d+);/);
  assert.ok(mVol && mPlancher, 'le seuil de volume ou le plancher de taille a disparu');
  /* ⛔⛔ CETTE ASSERTION A ETE RETOURNEE, ET C EST MOI QUI AVAIS LA REGLE A L ENVERS.
   *     J exigeais PX_VOLUME <= PX_MIN, en croyant garantir que le seuil soit atteignable. C etait
   *     FAUX et ca a coute cher : le plancher epingle presque tous les blocks a PX_MIN (mesure :
   *     p25 = mediane = p75 = 20). Donc avec PX_VOLUME <= PX_MIN, c est le PLANCHER qui fait passer
   *     TOUT LE MONDE en 3D d un coup — 49 blocks sur 58, ~300 elements composes en continu.
   *     Phil : « ca rame de trop maintenant ».
   *   ⇒ L INVARIANT CORRECT EST L INVERSE : PX_MIN < PX_VOLUME. Le plancher rend les lointains
   *     LISIBLES, il ne doit jamais les rendre VOLUMINEUX. C est la seule facon que la PROXIMITE
   *     decide du passage en 3D — le comportement demande : loin = 2D, proche = 3D qui tourne.
   *   ⛔ LES DEUX ERREURS ONT LA MEME FORME : un seuil qui ne depend plus de ce qu il est cense
   *     mesurer. A 64 px il ne se declenchait jamais ; sous le plancher il se declenchait toujours. */
  assert.ok(Number(mPlancher[1]) < Number(mVol[1]),
    'PX_MIN (' + mPlancher[1] + ') n est plus STRICTEMENT sous PX_VOLUME (' + mVol[1] + ') : le '
    + 'plancher pousserait tous les blocks en 3D d un coup, la proximite ne deciderait plus rien, '
    + 'et la map ramerait — c est exactement ce qui est arrive le 2026-09-27');
});

v('⛔⛔ VOLUME et SATELLITES ont des seuils SEPARES — deux couts, deux regles', () => {
  /* ⛔⛔ L ANCIEN SEUIL UNIQUE MELANGEAIT DEUX DEPENSES SANS RAPPORT : le volume (6 faces composees
   *     par le navigateur) et les satellites (des elements en plus, en orbite). Les couper ensemble
   *     revenait a payer le prix du plus cher pour economiser sur les deux.
   *   ⛔ C est la MEME erreur que j ai commise ce matin en reutilisant `petit` pour la rotation :
   *     une regle juste, appliquee a deux questions qui n ont pas le meme cout. */
  assert.ok(/PX_SATELLITES = (\d+)/.test(map), 'le seuil propre aux satellites a disparu');
  const mSat = map.match(/PX_SATELLITES = (\d+)/), mVol = map.match(/PX_VOLUME = (\d+)/);
  assert.ok(Number(mSat[1]) > Number(mVol[1]),
    'les satellites ne sont plus plus exigeants que le volume : le seuil ne borne plus la depense');
  assert.ok(/classList\.toggle\('sobre', sobre\)/.test(map),
    'la classe intermediaire n est plus posee : volume et satellites retomberaient sur un seul seuil');
  /* ⛔ ET LE CSS DOIT LA TENIR : une classe posee que personne ne style ne borne rien — le depot a
   *   deja eu `.loin` sans regle CSS dans app.html, et ca n economisait rien. */
  const cube = readFileSync(new URL('./cube3d.js', import.meta.url), 'utf8');
  assert.ok(/\.bloc\.sobre \.c3m\{display:none\}/.test(cube),
    'la classe `sobre` n a aucune regle CSS : elle serait posee sans rien couper');
});

v('⛔⛔ le block au CENTRE tourne plus large — mais JAMAIS en tour complet', () => {
  /* ⛔⛔ LE TOUR COMPLET A DEJA ETE ESSAYE ET REJETE TROIS FOIS, et c est ecrit dans cube3d.js
   *     au-dessus de --c3amp : passe 90 degres, une face vue par la tranche devient un TRAIT et le
   *     cube se lit comme un parallelogramme. Refaire ce qui a ete refuse trois fois serait le
   *     contraire d ecouter — ce test existe pour empecher la rechute.
   *   ⇒ Le block regarde tourne PLUS LARGE (34 degres au lieu de 14), sur ses trois axes, et reste
   *     loin des 90 degres ou la forme se casse. */
  const cube = readFileSync(new URL('./cube3d.js', import.meta.url), 'utf8');
  const m = cube.match(/\.bloc\.centre\{--c3amp:(\d+)deg\}/);
  assert.ok(m, 'le block au centre n a plus son amplitude propre : il tournerait comme les autres');
  const amp = Number(m[1]);
  const base = Number((cube.match(/--c3amp:(\d+)deg/) || [])[1]);
  assert.ok(amp > base, 'l amplitude du centre (' + amp + ') ne depasse plus celle des autres (' + base + ')');
  assert.ok(amp < 90,
    'amplitude de ' + amp + ' degres : passe 90, une face vue par la tranche devient un TRAIT — '
    + 'le tour complet a deja ete rejete TROIS fois, ne pas le remettre');
  /* ⛔ ET SES SATELLITES TOURNENT : c est la seconde moitie de la « double rotation » demandee. */
  assert.ok(/\.bloc\.centre \.c3m\{display:block\}/.test(cube),
    'le block au centre peut perdre ses satellites : la double rotation ne serait qu une rotation');
  assert.ok(/classList\.toggle\('centre', centre\)/.test(map),
    'la classe `centre` n est plus posee : la regle CSS ne s appliquerait a personne');
});

v('⛔ le plancher de taille est BORNE dans sa hausse', () => {
  /* ⛔ SANS BORNE, un block tres lointain bondirait a la taille d un proche et MENTIRAIT sur sa
   *   distance. Le plancher rend lisible ; il ne doit pas rendre faux. */
  assert.ok(/Math\.min\(PX_MIN \/ h\.t, k \* 2\.5\)/.test(map),
    'la hausse du plancher n est plus bornee : un block lointain pourrait passer pour un proche');
});

v('⛔⛔ AUCUNE transformation 3D dans map3d.js — elle APLATIRAIT le vrai cube', () => {
  /* ⛔⛔ CE CAS EXISTE PARCE QUE J AI CASSE LA MAP LE 2026-09-27, ET QUE PHIL L A VU AVANT MOI.
   *     Pour repondre a « les cubes doivent flotter en X Y Z », j ai pose un
   *     `perspective(420px) rotateX/rotateY/rotateZ` sur le dessin de chaque tuile. DEUX erreurs
   *     dans un seul geste :
   *       1. LE SYSTEME EXISTAIT DEJA, EN MIEUX : `cube3d.js` rend un VRAI cube CSS 3D — six
   *          faces, `transform-style: preserve-3d`, et jusqu a DEUX SATELLITES en orbite, animes
   *          par le compositeur. J ai ecrit un jumeau plus faible sans l avoir cherche.
   *       2. ET LE JUMEAU A CASSE L ORIGINAL : une `perspective()` sur un ANCETRE aplatit tout le
   *          contexte 3D descendant. Le cube s ecrasait en parallelogramme cisaille et les
   *          satellites perdaient leur orbite — « ca te cree des bugs visuels comme ca ».
   *   ⇒ LA LECON N EST PAS « le CSS 3D est delicat » : c est CHERCHER CE QUI EXISTE AVANT
   *     D AJOUTER. `cube3d.js` porte le mot « satellite » a huit endroits. Un grep suffisait.
   *   ⛔ CE TEST NE PROTEGE PAS UN GOUT, IL PROTEGE UN CONTEXTE 3D : toute transformation 3D
   *     reintroduite ici reproduirait exactement la meme casse. */
  /* ⛔⛔ ON DEPOUILLE LES COMMENTAIRES D ABORD, ET CE TEST ME L A APPRIS SUR LUI-MEME : sa premiere
   *     version a accuse map3d.js parce que MON PROPRE COMMENTAIRE cite le code retire
   *     (« perspective(420px) rotateX/Y/Z ») pour expliquer pourquoi il ne doit pas revenir. Une
   *     sonde textuelle qui lit la DOCUMENTATION d un defaut et l accuse transforme l honnetete du
   *     code en source de faux positifs — et une sonde qui crie sur le correctif desarme celle qui
   *     criera sur la regression. Le depot avait deja cette regle ailleurs ; elle vaut ici aussi. */
  const codeNu = map.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  for (const interdit of ['perspective(', 'rotateX(', 'rotateY(', 'rotate3d(']) {
    assert.ok(!codeNu.includes(interdit),
      'map3d.js contient « ' + interdit + ' » : une transformation 3D sur la tuile APLATIT le cube '
      + 'de cube3d.js et tue ses satellites. La rotation des blocks appartient a cube3d.js.');
  }
  /* ⛔ ET LE VRAI SYSTEME DOIT TOUJOURS ETRE BRANCHE : le retrait ne doit pas avoir emporte la
   *   source du volume en meme temps que ma copie. */
  assert.ok(/cube3dHtml\(/.test(app), 'le vrai cube 3D n est plus appele : la map perdrait son volume');
});

v('⛔ la tuile porte toujours sa POSITION — le retrait ne doit pas l avoir emportee', () => {
  /* ⛔⛔ EN RETIRANT MA ROTATION J AI D ABORD SUPPRIME LA LIGNE DE POSITION AVEC ELLE : sans elle
   *     aucun block ne se place, et la map serait vide. Un retrait trop large est un defaut comme
   *     un autre — ce cas le rendrait visible immediatement. */
  assert.ok(/h\.el\.style\.transform = 'translate\(/.test(map),
    'la tuile ne porte plus sa transformation de position : aucun block ne se placerait');
  assert.ok(/scale\(' \+ k\.toFixed\(3\) \+ '\)/.test(map),
    'la tuile ne porte plus son echelle : la perspective serait perdue');
});

assert.equal(n, 12, 'compte de cas inattendu : ' + n);
console.log('ok map-nan-et-rotation — ' + n + ' cas.');
console.log('   Le NaN est REJOUE, pas suppose : il passe bien a travers le rebond ET le masquage.');
console.log('   Les trois vitesses sont posees, un block deja casse est RAMENE, et la garde tient');
console.log('   AUX DEUX BOUTS — map et cerveau.');
console.log('   Et AUCUNE transformation 3D ne peut revenir dans map3d.js : elle aplatirait le vrai');
console.log('   cube de cube3d.js et tuerait ses satellites — c est la regression du 2026-09-27.');
console.log('⚠️ NE PROUVE PAS le rendu : ce test lit le source et rejoue l arithmetique, il ne');
console.log('   peint rien. Que la map bouge se regarde en navigateur.');
