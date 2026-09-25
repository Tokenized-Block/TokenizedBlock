/* mesure-sorties-mise-en-vie.mjs — PAR OU SORT-ON QUAND LA MISE EN VIE ECHOUE ?
 *
 * ⛔⛔ CE QUI A DECLENCHE CETTE MESURE. L entonnoir de PRODUCTION dit `cree` = 6 et `vivant` = 2 :
 *     deux blocks sur trois ne prennent jamais vie. Et `vie_echec` n apparait meme pas dans les
 *     totaux — donc les quatre perdus n ont laisse AUCUNE trace. On sait qu ils meurent ; on ne
 *     sait pas de quoi.
 *
 * ⛔ CE QUE CETTE SONDE FAIT : elle recense les points de SORTIE de la chaine de mise en vie
 *   (chaque `vieAutoArreter()`, qui n est appele que pour arreter le parcours) et dit, pour chacun,
 *   s il compte quelque chose. Un chemin d echec qui ne compte rien est un angle mort permanent :
 *   il ne produira jamais de chiffre, donc jamais de correction.
 *
 * ⛔ CE QU ELLE NE PEUT PAS FAIRE : dire lequel de ces chemins est emprunte en vrai. Ca, seuls des
 *   compteurs en production le diront — c est precisement ce qui manque, et c est le but.
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const lignes = html.split('\n');

/* ⛔ commentaires retires du cote LU : ce depot cite ses defauts corriges en clair. */
const nu = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');

const sorties = [];
for (let i = 0; i < lignes.length; i++) {
  if (!/vieAutoArreter\s*\(/.test(nu(lignes[i]))) continue;
  /* ⛔ FENETRE BORNEE ET SYMETRIQUE : un `etape()` peut preceder ou suivre l arret. Trop large, on
   *   attribuerait a une sortie le compteur de la sortie voisine — c est le piege du contexte qui
   *   m a deja donne trois faux aujourd hui. Six lignes de chaque cote, et on le dit. */
  const bas = Math.max(0, i - 6), haut = Math.min(lignes.length, i + 7);
  const autour = nu(lignes.slice(bas, haut).join('\n'));
  const m = /etape\(\s*'([a-z0-9_]+)'\s*\)/.exec(autour);
  const texte = /setEtat|textContent|innerHTML/.test(autour);
  sorties.push({ ligne: i + 1, compteur: m ? m[1] : null, parleALUtilisateur: texte,
    extrait: lignes[i].trim().slice(0, 90) });
}

/* ⛔⛔ LA SONDE A DU ETRE CORRIGEE LE JOUR MEME, ET C EST INSTRUCTIF. Sa premiere version cherchait
 *     un `etape()` A COTE de chaque sortie. C etait juste tant que chaque sortie devait compter
 *     elle-meme. Mais le correctif a deplace la mesure DANS l entonnoir `vieAutoArreter()` — et la
 *     sonde, inchangee, s est mise a annoncer « 21 sorties muettes » alors que les 21 comptaient
 *     desormais toutes. Une sonde qui alarme a tort finit par etre ignoree, et le jour ou elle a
 *     raison personne ne la lit.
 *   ⇒ Une sonde mesure une CONCEPTION ; quand la conception change, elle se corrige ou elle ment. */
const source = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const iEnt = nu(source).indexOf('function vieAutoArreter(');
const entonnoir = iEnt > 0 ? nu(source).slice(iEnt, nu(source).indexOf('\n}', iEnt) + 2) : '';
const entonnoirCompte = /etape\(\s*'vie_ko_/.test(entonnoir);

/* ⛔⛔⛔ CETTE SONDE A VERDI SUR UN TROU, pendant des jours. Elle declarait « couverte » toute sortie
 *      des que `vieAutoArreter()` CONTENAIT un appel au compteur — sans jamais verifier que cet
 *      appel puisse TOURNER. Or le 2026-09-25 on a trouve que `signerEtapeLancement(etape)` masquait
 *      la fonction `etape()` par son propre parametre : l appel levait `TypeError`, le parcours
 *      mourait en silence, et cette sonde affichait « ✅ couverte » juste a cote.
 *      Elle lisait la PRESENCE d une ligne, pas son EXECUTION — `guards-measured-transport-not-
 *      execution`, dans l instrument meme qui devait nous prevenir.
 *    ⛔ ON VERIFIE DONC L OMBRAGE : si une fonction declare un identifiant `etape` (parametre ou
 *      variable locale), tout appel au compteur dans sa portee est inappelable. Une sonde aveugle a
 *      ca ne mesure rien de ce qui compte. */
const ombres = [];
for (const m of nu(source).matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/g)) {
  const params = m[2].split(',').map((s) => s.trim().split(/[=:\s]/)[0]);
  if (params.includes('etape')) ombres.push(m[1] + '() — parametre nomme `etape`');
}
/* ⛔⛔ ET MA PREMIERE VERSION DE CE CONTROLE A SUR-ACCUSE, immediatement : elle signalait
 *     `preparerEchange()` et `peindrePlan()` pour un `const etape = plan.etapes[0]` de BLOC, qui ne
 *     masque rien hors de son `if`. Deux faux positifs — et l un des deux sur la fonction ou je
 *     venais d ajouter onze compteurs, ce qui m a fait croire une seconde que je les avais tues.
 *   ⛔ UNE SONDE QUI CRIE A TORT DESARME CELLE QUI CRIERA A RAISON. On ne signale donc une variable
 *     locale que si un appel au compteur tombe REELLEMENT dans sa portee de bloc. */
for (const m of nu(source).matchAll(/\b(?:const|let|var)\s+etape\s*=/g)) {
  const src = nu(source);
  let prof = 0, fin = m.index;
  for (let i = m.index; i < src.length && i < m.index + 6000; i++) {
    const c = src[i];
    if (c === '{') prof++;
    else if (c === '}') { if (prof === 0) { fin = i; break; } prof--; }
  }
  const portee = src.slice(m.index, fin);
  if (!/\betape\(\s*['"]/.test(portee)) continue; /* masque, mais rien a masquer : inoffensif */
  const avant = src.slice(0, m.index);
  const f = [...avant.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)].pop();
  ombres.push((f ? f[1] + '()' : '(portee inconnue)') + ' — variable locale `etape` ENTOURANT un appel');
}

console.log('═══ SORTIES DE LA CHAINE DE MISE EN VIE ═══\n');
console.log(sorties.length + ' point(s) d arret trouve(s)');
console.log(entonnoirCompte
  ? '✅ l entonnoir `vieAutoArreter()` compte lui-meme : toute sortie qui passe par lui est mesuree\n'
  : '⛔ l entonnoir `vieAutoArreter()` ne compte RIEN : chaque sortie doit compter elle-meme\n');

/* ⛔⛔ L OMBRAGE PASSE AVANT TOUT LE RESTE : tant qu un identifiant `etape` existe en portee, le
 *     compteur y est inappelable et TOUT ce que cette sonde affiche ensuite est faux. */
if (ombres.length) {
  console.log('⛔⛔ ' + ombres.length + ' ENDROIT(S) MASQUENT LE COMPTEUR `etape()` :');
  for (const o of ombres) console.log('     · ' + o);
  console.log('   Un appel au compteur dans ces portees leve TypeError — et il le fait en SILENCE');
  console.log('   si l appelant est en `void …`. Tout « ✅ couverte » ci-dessous est alors faux.');
  console.log('   C est exactement ce qui s est produit le 2026-09-25, et que cette sonde n a pas vu.\n');
  process.exitCode = 1;
} else {
  console.log('✅ aucun identifiant `etape` ne masque le compteur : les appels peuvent aboutir.\n');
}

/* une sortie est couverte si elle compte elle-meme, OU si l entonnoir compte pour elle */
const comptees = sorties.filter((s) => s.compteur || entonnoirCompte);
const muettes = sorties.filter((s) => !s.compteur && !entonnoirCompte);

if (comptees.length) {
  console.log('✅ ' + comptees.length + ' sortie(s) couverte(s) :');
  for (const s of comptees) {
    console.log('   ligne ' + String(s.ligne).padStart(5) + '  ->  '
      + (s.compteur ? s.compteur : 'comptee par l entonnoir (etape atteinte)'));
  }
}
console.log('');
if (muettes.length) {
  console.log('⛔ ' + muettes.length + ' sortie(s) MUETTE(S) — elles arretent le parcours sans rien compter :');
  for (const s of muettes) {
    console.log('   ligne ' + String(s.ligne).padStart(5)
      + (s.parleALUtilisateur ? '  (un texte s affiche)' : '  (RIEN ne s affiche non plus)'));
  }
  console.log('');
  console.log('   ⇒ Chacune de ces sorties est un angle mort PERMANENT : le block ne prend pas vie,');
  console.log('     et aucun chiffre ne le dira jamais. C est pour ca que `cree`=6 / `vivant`=2');
  console.log('     s accompagne d un `vie_echec` ABSENT des totaux : les quatre perdus sont sortis');
  console.log('     par des portes qui ne comptent pas.');
}

const sansTexte = sorties.filter((s) => !s.parleALUtilisateur);
if (sansTexte.length) {
  console.log('\n⚠️ ' + sansTexte.length + ' sortie(s) n affichent apparemment RIEN a l utilisateur.');
  console.log('   ⛔ « apparemment » : la fenetre de lecture fait 13 lignes. Un message ecrit plus');
  console.log('     loin ne serait pas vu par cette sonde. A verifier une par une avant de conclure.');
}

console.log('\n── ce que cette sonde ne dit pas ──');
console.log('⛔ Lequel de ces chemins est reellement emprunte. Seuls des compteurs en production le');
console.log('   diront — et c est exactement ce qui manque aujourd hui.');
/* ⛔⛔ CETTE LIGNE ECRASAIT UN ROUGE DEJA POSE. Une affectation `=` en fin de fichier remettait le
 *     code de sortie a 0 des qu il n y avait pas de sortie muette — y compris quand l ombrage du
 *     compteur venait d etre detecte vingt lignes plus haut. La sonde CRIAIT et sortait en 0 : tout
 *     lanceur qui lit le code de sortie (le mien le fait) l aurait ignoree.
 *   ⛔ UN ROUGE NE SE RETIRE PAS, IL S AJOUTE. Chaque verdict peut poser le rouge, aucun ne peut
 *     l enlever — sinon l ordre des verifications decide de ce qu on voit, et personne ne le relit. */
if (muettes.length) process.exitCode = 1;
