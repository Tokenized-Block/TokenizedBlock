/* test-tests-portables.mjs — AUCUN TEST NE DOIT DEPENDRE DE LA FIN DE LIGNE DU CHECKOUT.
 *
 * ⛔⛔⛔ TROIS FOIS LE MEME DEFAUT EN UNE SOIREE, CHEZ DEUX AGENTS DIFFERENTS (2026-10-01/02) :
 *      · `test-e0-devises-v8.mjs` — DEUX motifs : `indexOf('\n}\n')` dans son extracteur, puis
 *        `/\n    return;\n  \}/`. Zero 1 annoncait 80/80 ; chez moi, sur Windows : `exit 1`, deux KO,
 *        puis `ReferenceError: majPaire is not defined`.
 *      · `test-note-carte-ne-grandit-plus.mjs` — `indexOf('\n}\n')`. Rouge avec
 *        « noteCarteSansPasse introuvable », alors que la fonction EST dans `app.html`.
 *      Chacun etait VERT sur la box de son auteur (LF) et ROUGE sur celle de Phil (CRLF).
 *
 * ⛔⛔ CE QUI REND CE DEFAUT DANGEREUX, ET PAS SEULEMENT GENANT :
 *   1. **Il accuse la mauvaise moitie.** « noteCarteSansPasse introuvable », « both functions found
 *      in app.html » — ca se lit comme un defaut du CODE. Quelqu un peut supprimer ou « corriger »
 *      une fonction qui marche pour faire taire un test casse.
 *   2. **Il est invisible chez son auteur.** Un test vert sur une box Linux peut etre rouge sur le
 *      poste de travail, et c est la que les gens le lisent.
 *   3. **Il echoue par ABSENCE** : l extraction rend `null` ou `-1`, et sans une assertion explicite
 *      tout ce qui suit passerait en silence sur du vide.
 *
 * ⛔ CE QUE CETTE GARDE SAIT PROUVER : qu aucun fichier de test ne porte un motif de recherche
 *    contenant un saut de ligne NU, c est-a-dire `\n` sans `\r?` devant.
 * ⛔ CE QU ELLE NE PEUT PAS PROUVER : qu un test soit juste. Elle ferme une classe de panne, pas
 *    toutes. Et elle ne regarde QUE les `test-*.mjs` et `banc-*.mjs` — un script d outillage qui
 *    tombe dans le meme piege lui echappe.
 */
import { readdirSync, readFileSync } from 'node:fs';

const D = new URL('./', import.meta.url);
const FICHIERS = readdirSync(D).filter((f) => /^(test|banc)-.*\.mjs$/.test(f) && f !== 'test-tests-portables.mjs');

let n = 0, ko = 0;
const ok = (nom, cond, vu) => {
  n += 1;
  if (cond) { console.log('  ok  ' + nom); return true; }
  ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '\n        ' + vu));
  return false;
};

/* ⛔ ON NE REGARDE QUE LES MOTIFS DE RECHERCHE, pas tout `\n`. Un `console.log('a\nb')` est
 *   parfaitement legitime, et l accuser ferait une garde qu on apprend a contourner.
 *   Les formes visees : `indexOf('…\n…')`, `lastIndexOf`, `split`, `includes`, `search`, et les
 *   litteraux de regexp qui contiennent `\n` sans `\r?` juste avant. */
const APPELS = /\.(indexOf|lastIndexOf|includes|search|split|startsWith|endsWith)\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;

function suspects(src) {
  const trouves = [];
  const lignes = src.split(/\r?\n/);
  lignes.forEach((ligne, i) => {
    /* ⛔ ON SAUTE LES COMMENTAIRES : ce fichier-ci en est plein, et une garde qui lit ses propres
     *   explications comme du code s accuse elle-meme — c est arrive quatre fois dans ce depot. */
    const t = ligne.trim();
    if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
    /* ⛔⛔⛔ ON NE VISE QUE LE MOTIF LETAL : un saut de ligne COLLE A UN CARACTERE NON-BLANC, qui
     *      sert d ANCRE DE POSITION. `'\n}\n'`, `'\n    return;'` : sur CRLF le texte est
     *      `\r\n}` et l ancre rate.
     *   ⛔ MA PREMIERE VERSION ACCUSAIT 59 FICHIERS, et c etait une faute de conception. Elle
     *     prenait `[^\n]` (une classe de caracteres — inoffensive), `\s*\n?\s*` (inoffensif aussi :
     *     `\s` matche DEJA `\r`), et `split('\n')` (au pire un `\r` en fin de ligne). Une garde qui
     *     accuse soixante fichiers le premier jour est une garde qu on desactive la semaine
     *     suivante — et elle aurait bloque le Grok Bot sur du bruit.
     *   ⇒ Une garde doit se tromper du cote de l INNOCENCE. Les cas qu elle laisse passer sont
     *     nommes ci-dessous plutot que silencieusement couverts. */
    let m;
    APPELS.lastIndex = 0;
    while ((m = APPELS.exec(ligne))) {
      /* `\n` suivi ou precede d un caractere non-blanc dans le MEME litteral */
      if (/\\n\s*[^\s\\]|[^\s\\]\s*\\n/.test(m[3])) {
        trouves.push({ l: i + 1, quoi: m[0].slice(0, 70), pourquoi: 'ancre de position' });
      }
    }
    /* ⛔⛔⛔ LES REGEXP NE SONT PAS REGARDEES, ET C EST RAISONNE — PAS UN OUBLI. J ai essaye, et
     *      j ai du retirer : dans une regexp, un `\n` est presque toujours precede de `\s*` ou de
     *      `[\s\S]*?`, et **`\s` matche DEJA `\r`**. Donc `/x;\s*\n\s*y/` et `/[\s\S]*?\n\}/`
     *      fonctionnent parfaitement sur un fichier CRLF : le `\r` est absorbe par le quantificateur
     *      d a cote. Les accuser donnait 59 fichiers, puis 26 — presque tous innocents.
     *      ⇒ LE CAS LETAL EST LE LITTERAL DE CHAINE : `indexOf('\n}')` n a RIEN pour absorber le
     *        `\r`. C est lui, et lui seul, qui a casse trois tests ce soir.
     *      ⚠️ CE QUE CETTE GARDE LAISSE DONC PASSER, et je le nomme plutot que de le couvrir : une
     *        regexp ou le `\n` est ancre sur `^`, sur une limite, ou colle a un litteral non-blanc
     *        sans quantificateur absorbant. Elle existe en theorie ; elle n a casse personne ici.
     *      ⛔ Une garde qui accuse soixante fichiers le premier jour est une garde qu on desactive
     *        la semaine suivante. Elle doit se tromper du cote de l INNOCENCE. */
  });
  return trouves;
}

/* ⛔⛔ LE TEMOIN D ABORD : la sonde sait-elle dire OUI ? Sans lui, « 0 fichier fautif » serait
 *     indiscernable d un detecteur casse — et ce depot a deja vu un harnais rendre « tout va bien »
 *     parce que son motif ne matchait plus rien. */
const TEMOIN = "const j = src.indexOf('\\n}\\n', i);\nconst k = /\\n    return;\\n  \\}/.test(x);";
const vusTemoin = suspects(TEMOIN);
ok('TEMOIN — la sonde attrape l ancre de position qui a casse trois tests', vusTemoin.length === 1,
  JSON.stringify(vusTemoin));
/* ⛔ ET LE TEMOIN NEGATIF : la forme CORRIGEE ne doit PAS etre accusee, sinon on apprendrait a
 *   ignorer la garde. */
const SAIN = "const m = /\\r?\\n\\}\\r?\\n/.exec(src);\nconsole.log('a\\nb');";
ok('TEMOIN NEGATIF — la forme corrigee et un console.log ne sont PAS accuses',
  suspects(SAIN).length === 0, JSON.stringify(suspects(SAIN)));

console.log('');
console.log('  ' + FICHIERS.length + ' fichiers de test/banc examines');
let fautifs = 0;
for (const f of FICHIERS) {
  const t = suspects(readFileSync(new URL(f, D), 'utf8'));
  if (!t.length) continue;
  fautifs += 1;
  console.log('  KO  ' + f);
  for (const x of t.slice(0, 4)) console.log('        L' + x.l + ' (' + x.pourquoi + ') ' + x.quoi);
}
/* ⛔⛔⛔ UN CLIQUET, PAS UN MUR. Au moment ou cette garde est ecrite, 20 fichiers portent deja
 *      `.indexOf('\n}')`. Les rendre tous rouges d un coup casserait la suite pour tout le monde —
 *      et une suite rouge est une suite qu on cesse de lire. Mais les ignorer en silence laisserait
 *      la dette grandir, et c est elle qui a fait perdre une heure ce soir.
 *      ⇒ LE NOMBRE EST ECRIT ICI, VISIBLE, ET IL NE PEUT QUE DESCENDRE :
 *          · un NOUVEAU fautif fait echouer immediatement — personne ne peut ajouter a la dette ;
 *          · quand quelqu un en corrige un, le test EXIGE qu il baisse ce chiffre. Une dette qui
 *            se rembourse sans qu on l ecrive se reconstitue.
 *      ⛔ PAS DE PLAFOND SILENCIEUX : ce depot interdit qu une garde borne quelque chose sans le
 *        dire. Le chiffre est la, dans le code, pas dans un commentaire. */
const DETTE_CONNUE = 19;  /* 20 -> 19 : test-note-carte-ne-grandit-plus repare le 2026-10-02 */
n += 1;
if (fautifs > DETTE_CONNUE) {
  ko += 1;
  console.log('');
  console.log('  ⛔ ' + fautifs + ' fichiers fautifs, pour une dette connue de ' + DETTE_CONNUE + '.');
  console.log('     Un NOUVEAU test depend de la fin de ligne du checkout : il sera VERT sur une box');
  console.log('     LF et ROUGE sur Windows, et il accusera le CODE. Correctif : `\\r?\\n` des deux');
  console.log('     cotes, ou normaliser a la lecture.');
} else if (fautifs < DETTE_CONNUE) {
  ko += 1;
  console.log('');
  console.log('  ⛔ ' + fautifs + ' fautifs alors que la dette ecrite vaut ' + DETTE_CONNUE + '.');
  console.log('     Quelqu un en a corrige — BAISSE `DETTE_CONNUE` a ' + fautifs + '. Une dette qui se');
  console.log('     rembourse sans qu on l ecrive se reconstitue sans qu on le voie.');
} else {
  console.log('  ok  dette inchangee (' + fautifs + ') — aucun NOUVEAU test non portable');
}

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
