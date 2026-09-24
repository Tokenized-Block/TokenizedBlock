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

console.log('═══ SORTIES DE LA CHAINE DE MISE EN VIE ═══\n');
console.log(sorties.length + ' point(s) d arret trouve(s)');
console.log(entonnoirCompte
  ? '✅ l entonnoir `vieAutoArreter()` compte lui-meme : toute sortie qui passe par lui est mesuree\n'
  : '⛔ l entonnoir `vieAutoArreter()` ne compte RIEN : chaque sortie doit compter elle-meme\n');

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
process.exitCode = muettes.length ? 1 : 0;
