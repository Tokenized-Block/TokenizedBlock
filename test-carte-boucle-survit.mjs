/* test-carte-boucle-survit.mjs — UNE EXCEPTION NE DOIT PAS TUER LA CARTE POUR TOUJOURS.
 *
 * ⛔⛔⛔ CE QUI A ETE SIGNALE, capture a l appui (Phil, 2026-09-25) : des cubes COLLES aux bords du
 *      viewport, certains a moitie hors de l ecran, pendant que les autres semblaient normaux.
 *
 *      MECANISME, etabli en lisant le code (et non mesure dans un navigateur — voir plus bas) :
 *          if (moteur3d && …) { moteur3d.image(t); }
 *          anim = requestAnimationFrame(pas);      <-- DERNIERE instruction, aucun try/catch
 *      Si `image()` jette une seule fois, la replanification n est jamais atteinte : la boucle
 *      s arrete definitivement. Et `anim` garde son ANCIEN identifiant, donc truthy — les trois
 *      relances du fichier (`if (!anim) animer()`) deviennent des coups dans le vide.
 *      Tous les cubes restent alors figes a leur derniere position peinte : la plupart au milieu,
 *      ceux qui passaient pres du bord COLLES au bord. Et un cube jamais peint se pose au coin
 *      haut-gauche (`.mapEnv.a3d .bloc` vaut `left:0; top:0`).
 *
 * ⛔⛔ ET LE DEPOT SAVAIT DEJA QUE `image()` PEUT JETER : son jumeau dans `soleilsSurLaMap` est sous
 *     try/catch depuis longtemps. C est le chemin CHAUD — celui qui tourne 30 fois par seconde —
 *     qui ne l etait pas. `single-and-batch-twins-diverge` : on protege la copie qu on relit.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que c etait bien la cause des cubes de la capture. Le panneau
 *   navigateur etait replie pendant l enquete (`innerWidth` = 0), donc aucune mesure de geometrie
 *   n etait possible. Deux candidates tenaient : cette boucle morte, ou un noeud orphelin. J ai
 *   verifie en production qu il n y avait NI doublon d adresse, NI noeud detache, NI NaN dans les
 *   styles — ce qui affaiblit la seconde sans l eliminer. Ce fichier garde le mecanisme, pas le
 *   diagnostic.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

const i = html.indexOf('function animer()');
assert.ok(i > 0, 'animer() est introuvable : ce test ne garde plus rien');
const f = html.slice(i, html.indexOf('\n}', i));

v('⛔⛔⛔ la replanification passe AVANT la peinture', () => {
  /* ⛔⛔⛔ LE CAS CENTRAL. Peindre puis replanifier, c est parier que la peinture ne jette jamais —
   *      et le prix du pari est une carte morte jusqu au rechargement. */
  /* ⛔ ON COMPARE DES POSITIONS, PAS DEUX LIGNES COLLEES : ma premiere version exigeait les deux
   *   instructions adjacentes et rougissait des qu un commentaire s intercalait — un test qui tombe
   *   pour une raison qui n est pas la sienne apprend a etre ignore. */
  const iPeint = f.indexOf('moteur3d.image(t)');
  assert.ok(iPeint > 0, 'la peinture a disparu de la boucle');
  /* la replanification qui compte est celle du corps de `pas`, pas le demarrage en fin de fonction */
  const iRaf = f.indexOf('anim = requestAnimationFrame(pas);', f.indexOf('const t = performance.now()'));
  assert.ok(iRaf > 0 && iRaf < iPeint,
    'la prochaine image n est plus demandee AVANT de peindre : une exception dans image() '
    + 'arreterait la boucle definitivement, et `anim` restant truthy, aucune relance ne repartirait');
});

v('⛔ la peinture est sous try/catch', () => {
  assert.match(f, /try \{ moteur3d\.image\(t\); \}\s*\n?\s*catch/,
    'moteur3d.image() n est plus protege dans la boucle chaude');
});

v('⛔ l erreur se DIT, une fois, et se compte', () => {
  /* ⛔⛔ Un catch muet a 30 images par seconde recreerait le defaut sous une autre forme : une carte
   *     a moitie morte que personne ne voit mourir. On dit la premiere, on compte toutes. */
  assert.match(f, /imagesRatees\+\+/, 'les images ratees ne sont plus comptees');
  assert.match(f, /if \(imagesRatees === 1\) console\.error/,
    'la premiere erreur ne se dit plus — ou elle se repete 30 fois par seconde');
  assert.match(f, /map\.dataset\.imagesRatees/,
    'le compteur n est plus lisible de l exterieur : une sonde ne pourra pas l exiger a zero');
});

v('⛔⛔ un habitant est INSCRIT avant d etre pose', () => {
  /* ⛔⛔ Entre `map.appendChild(el)` et `habitants.push(h)`, l element est dans le DOM sans exister
   *     pour le moteur : rien ne le re-projette, rien ne le cache, et surtout RIEN NE PEUT LE
   *     RETIRER — `retirerDeLaCarte` part de `habitants.indexOf`. Un orphelin est definitif. */
  const d = html.indexOf('function creerHabitant(');
  assert.ok(d > 0, 'creerHabitant est introuvable');
  const corps = html.slice(d, html.indexOf('function retirerDeLaCarte(', d));
  const iPush = corps.indexOf('habitants.push(h)');
  const iPlacer = corps.indexOf('moteur3d.placer(h)');
  assert.ok(iPush > 0 && iPlacer > 0, 'inscription ou pose introuvable dans creerHabitant');
  assert.ok(iPush < iPlacer,
    'l element est pose avant d etre inscrit : si la pose jette, personne ne le retirera jamais '
    + 'et personne ne le re-projettera — il restera fige a l ecran');
});

v('⛔ la pose elle-meme ne peut pas faire tomber la creation', () => {
  const d = html.indexOf('function creerHabitant(');
  const corps = html.slice(d, html.indexOf('function retirerDeLaCarte(', d));
  assert.match(corps, /try \{ if \(moteur3d\) moteur3d\.placer\(h\); \}\s*\n?\s*catch/,
    'la pose n est plus protegee : une exception laisserait la fonction sans rendre l habitant');
});

v('⛔ le heros de Create ne colle QUE compacte', () => {
  /* ⛔⛔ Phil a redemande que le block suive au scroll. La version d avant collait le heros ENTIER —
   *     484 px a 375 px de large, 60 % de l ecran — et recouvrait « Name », « Symbol » et « Image
   *     file » : 11 textes caches a 900 px de defilement, mesure le 2026-09-23. C est pour ca qu il
   *     etait passe en statique. On rend le suivi sur la forme COMPACTE (~70 px) uniquement : la
   *     demande est satisfaite sans rejouer le mur. */
  const etendu = html.slice(html.indexOf('.creaSticky.creaHeros{'), html.indexOf('.creaSticky.creaHeros{') + 120);
  assert.match(etendu, /position:static/,
    'le heros pleine taille colle de nouveau : il recouvrira les champs qu on remplit');
  const compacte = html.slice(html.indexOf('.creaHeros.compacte{'), html.indexOf('.creaHeros.compacte{') + 160);
  assert.match(compacte, /position:sticky/,
    'la forme compacte ne colle plus : le block ne suit plus au scroll');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok carte-boucle-survit — ' + n + ' cas : la boucle se replanifie avant de peindre, les');
console.log('   images ratees se comptent, et un habitant est inscrit avant d etre pose.');
console.log('⚠️ NE PROUVE PAS que c etait la cause des cubes colles : le panneau navigateur etait');
console.log('   replie, donc aucune geometrie n a pu etre mesuree. Ce test garde le mecanisme.');
