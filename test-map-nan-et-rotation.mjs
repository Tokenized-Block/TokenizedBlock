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
  assert.ok(corps.includes('h.spin'), '`placer()` ne pose pas la rotation propre du cube');
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
v('⛔ la rotation propre s arrete si l utilisateur a demande moins de mouvement', () => {
  /* ⛔ UN EFFET « VIVANT » IMPOSE A QUELQU UN QUI A DIT NON EST UN DEFAUT, pas une touche de vie.
   *   `mouvementReduit` existe deja dans ce module : on l honore au lieu d ajouter un effet qui
   *   l ignore. */
  assert.ok(/!mouvementReduit && h\.t \* k >= 14 && Number\.isFinite\(h\.spin\)/.test(map),
    'la rotation propre ignore `mouvementReduit`, ou son seuil de taille a change sans raison ecrite');
});

v('⛔⛔ la rotation va sur le CUBE seul — le nom doit rester droit', () => {
  /* ⛔⛔ DEFAUT VU PAR PHIL SUR SA CAPTURE, PAS PAR MOI. J avais mis la rotation dans la
   *     transformation de `.bloc` — qui contient le dessin ET l etiquette du nom. Tous les noms
   *     penchaient avec les cubes, illisibles : « garde les noms droits, juste les cubes qui
   *     flottent ».
   *   ⇒ Un effet juste peut etre applique au mauvais NOEUD de l arbre. Le conteneur porte la
   *     POSITION ; seul le dessin porte la ROTATION. */
  assert.ok(!/scale\('[^']*'\) \+ tourne|\)' \+ tourne;/.test(map),
    'la rotation est de nouveau collee a la tuile : les noms pencheraient avec les cubes');
  assert.ok(/h\._svg\.style\.transform = tourne/.test(map),
    'la rotation n est plus posee sur le dessin seul');
  /* ⛔ UN SVG TOURNE AUTOUR DE SON COIN (0 0) PAR DEFAUT, pas de son centre : sans origine
   *   explicite il partirait en orbite au lieu de pivoter sur lui-meme. */
  assert.ok(/transformOrigin = '50% 50%'/.test(map),
    'l origine de rotation du dessin n est pas posee : le cube partirait en orbite');
  /* ⛔ ET LE SVG EST RETENU UNE FOIS : le rechercher a chaque image pour ~170 blocks a 60 i/s
   *   ferait 10 000 recherches par seconde pour un resultat invariant. */
  assert.ok(/h\._svg === undefined/.test(map),
    'le dessin est recherche a chaque image au lieu d etre retenu une fois');
});

v('⛔⛔ le seuil de rotation N EST PAS `petit` — cette garde couvrait la mauvaise moitie', () => {
  /* ⛔⛔ CE CAS EXISTE PARCE QUE JE ME SUIS TROMPE, ET QUE LA MESURE L A DIT. La rotation etait
   *     gardee par `!petit` (moins de 64 px), « pour ne pas inventer un second seuil ». Mesure en
   *     production juste apres : 63 blocks visibles, UN SEUL tournait — la taille MEDIANE est de
   *     20 px, donc presque tout est « petit ». La garde etait VRAIE et couvrait la MAUVAISE
   *     MOITIE.
   *   ⇒ `petit` coupe les SATELLITES, qui coutent cher. Une rotation est une valeur de plus dans
   *     une transformation deja ecrite a chaque image. Deux couts differents, deux seuils. */
  assert.ok(!/!mouvementReduit && !petit/.test(map),
    'la rotation est de nouveau gardee par `petit` : un seul cube sur soixante tournerait');
  /* ⛔ ET LE SEUIL PROPRE DOIT RESTER SOUS LE PLANCHER DE TAILLE, sinon il ne garde rien du tout —
   *   une garde qui ne peut jamais etre fausse ne borne rien. */
  const mSeuil = map.match(/h\.t \* k >= (\d+)/);
  const mPlancher = map.match(/const PX_MIN = (\d+);/);
  assert.ok(mSeuil && mPlancher, 'le seuil de rotation ou le plancher de taille a disparu');
  assert.ok(Number(mSeuil[1]) < Number(mPlancher[1]),
    'le seuil de rotation est au-dessus du plancher de taille : il couperait des blocks visibles');
});

v('⛔⛔ l angle AVANCE avec le temps — un cube tourne ne tourne pas', () => {
  /* ⛔⛔ J AI FAILLI CRIER VICTOIRE SUR DU STATIQUE. Mesure en production : 67 blocks sur 67
   *     portaient bien un `rotate(...)`. Mais les angles etaient IDENTIQUES a 1,5 s d intervalle.
   *     « Un cube TOURNE » et « un cube QUI TOURNE » sont deux choses differentes, et le compteur
   *     « combien en portent un » ne distingue pas les deux : UNE SORTIE CONSTANTE N EST PAS UNE
   *     MESURE.
   *   ⛔ LA CAUSE ETAIT MON INSTRUMENT, PAS LE CODE : le panneau du navigateur repondait
   *     `document.hidden === true`, ce qui suspend `requestAnimationFrame`. Le depot le DOCUMENTE
   *     deja — « l animation s arrete quand l onglet est cache ». Je ne pouvais donc rien voir
   *     bouger, et j ai failli en conclure que rien ne bougeait.
   *   ⇒ Ce cas verifie ce qui EST verifiable sans navigateur : que l angle depend du TEMPS. Il ne
   *     prouve pas que ca tourne a l ecran — seul un onglet visible le montrerait. */
  assert.ok(/maintenant \* h\.spin/.test(map),
    'l angle ne depend plus du temps : les cubes seraient tournes une fois, puis figes');
  /* on rejoue la formule : deux instants differents doivent donner trois angles differents */
  /* ⛔⛔ CETTE FORMULE EST UNE COPIE DE CELLE DU CODE, ET UNE COPIE PEUT DIVERGER EN SILENCE : le
   *     test resterait vert en mesurant une formule que plus personne n execute. On ANCRE donc les
   *     constantes sur la source — si quelqu un change le rythme dans `map3d.js` sans toucher ici,
   *     ce test tombe au lieu de mentir. */
  const mMul = map.match(/maintenant \* h\.spin \* ([\d.]+)\)/);
  assert.ok(mMul, 'le multiplicateur de phase a disparu de la source');
  assert.equal(mMul[1], '0.012',
    'la source utilise ' + mMul[1] + ' et ce test rejoue 0.012 : la copie a diverge');
  const axes = (maintenant, spin0, spin) => {
    const b = (spin0 + maintenant * spin * 0.012) * (Math.PI / 180);
    return [9 * Math.sin(b), 12 * Math.sin(b * 0.61 + 1.1), 5 * Math.sin(b * 0.37 + 2.3)];
  };
  const a = axes(1000, 180, 1.6), b = axes(2000, 180, 1.6);
  assert.notEqual(a.map((x) => x.toFixed(2)).join(), b.map((x) => x.toFixed(2)).join(),
    'les trois axes rendent la meme chose a une seconde d ecart : le cube serait fige');
  /* ⛔ ET LE MOUVEMENT DU PLUS LENT DOIT SE VOIR : une derive indiscernable de l immobilite ne vaut
   *   pas mieux que pas de mouvement du tout. On mesure le plus grand pas sur une seconde. */
  const lent = Math.max(...axes(2000, 0, 1.6).map((x, i) => Math.abs(x - axes(1000, 0, 1.6)[i])));
  assert.ok(lent >= 0.5, 'le cube le plus lent bouge de ' + lent.toFixed(2)
    + ' deg/s : indiscernable de l immobilite');
});

v('⛔⛔ il flotte en X, Y ET Z — un seul axe ne fait pas du volume', () => {
  /* ⛔⛔ Phil : « il flotte en X Y Z ». Ma premiere version posait un `rotate(Ndeg)` PLAT : une
   *     toupie vue de face, pas un objet qui derive dans l espace.
   *   ⛔ LA PERSPECTIVE EST OBLIGATOIRE : sans elle, `rotateX`/`rotateY` ne font que COMPRESSER le
   *     dessin — une deformation, pas une profondeur. */
  for (const axe of ['rotateX(', 'rotateY(', 'rotateZ(']) {
    assert.ok(map.includes(axe), 'le flottement a perdu son axe ' + axe.replace('rotate', '').replace('(', ''));
  }
  assert.ok(/perspective\(\d+px\)/.test(map),
    'pas de perspective : les rotations 3D ne feraient qu aplatir le dessin');
  /* ⛔⛔ ET LES AMPLITUDES RESTENT PETITES, PARCE QUE LE DESSIN EST PLAT. Un SVG isometrique pousse
   *     au-dela de ~20 deg se trahit : il s aplatit en trait au passage des 90 deg. C est une
   *     limite du support, pas un reglage de gout — si quelqu un monte ces valeurs, ce test doit
   *     l arreter et lui dire pourquoi. */
  const amp = [...map.matchAll(/const a[xyz] = (\d+) \* Math\.sin/g)].map((m) => Number(m[1]));
  assert.equal(amp.length, 3, 'les trois amplitudes du flottement ne sont plus lisibles');
  assert.ok(Math.max(...amp) <= 20,
    'amplitude de ' + Math.max(...amp) + ' deg : un dessin PLAT pousse si loin se lit comme une '
    + 'feuille qui tourne, pas comme un cube qui flotte');
  /* ⛔ TROIS PERIODES DIFFERENTES : un seul rythme ramenerait les trois axes ensemble au point de
   *   depart, et le mouvement se lirait comme une boucle. */
  const per = [...map.matchAll(/Math\.sin\(b \* ([\d.]+)/g)].map((m) => m[1]);
  assert.equal(new Set(per).size, per.length, 'deux axes partagent la meme periode : ca bouclerait');
});

v('⛔ le plancher de taille est BORNE dans sa hausse', () => {
  /* ⛔ SANS BORNE, un block tres lointain bondirait a la taille d un proche et MENTIRAIT sur sa
   *   distance. Le plancher rend lisible ; il ne doit pas rendre faux. */
  assert.ok(/Math\.min\(PX_MIN \/ h\.t, k \* 2\.5\)/.test(map),
    'la hausse du plancher n est plus bornee : un block lointain pourrait passer pour un proche');
});

assert.equal(n, 11, 'compte de cas inattendu : ' + n);
console.log('ok map-nan-et-rotation — ' + n + ' cas.');
console.log('   Le NaN est REJOUE, pas suppose : il passe bien a travers le rebond ET le masquage.');
console.log('   Les trois vitesses sont posees, un block deja casse est RAMENE, et la garde tient');
console.log('   AUX DEUX BOUTS — map et cerveau.');
console.log('⚠️ NE PROUVE PAS le rendu : ce test lit le source et rejoue l arithmetique, il ne');
console.log('   peint rien. Que la map bouge se regarde en navigateur.');
