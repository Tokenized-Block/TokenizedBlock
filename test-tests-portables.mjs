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

    /* ══ SECOND MOTIF, AJOUTE LE 2026-10-02 : LE CHEMIN QUI NE MARCHE QUE SUR POSIX ══════════════
     * ⛔⛔⛔ MESURE DU JOUR : CINQ bancs etaient VERTS dans le conteneur du Grok Bot et MORTS sur la
     *      machine de Raksha — 157 assertions qui ne s executaient pas, dont 102 pour le seul
     *      `test-hook-7030-app-wiring`, c est-a-dire l audit COMPLET du cablage du hook. Son
     *      « audit vert » portait donc sur une box ou ces bancs tournent ; ici ils ne gardaient RIEN.
     *      Deux formes, toutes deux letales :
     *        1. `await import(path.join(ICI, 'x.js'))` -> « On Windows, absolute paths must be valid
     *           file:// URLs ». Correct : `pathToFileURL(...).href`.
     *        2. `new URL('.', import.meta.url).pathname` utilise comme CHEMIN -> rend `/D:/Users/…`
     *           avec un slash en tete, et `readdirSync` le resout contre le lecteur courant :
     *           `ENOENT … scandir 'D:\\D:\\Users\\…'`, lettre de lecteur DOUBLEE.
     *           Correct : `fileURLToPath(new URL('.', import.meta.url))`.
     *   ⛔ MEME FAMILLE QUE LE MOTIF CRLF CI-DESSUS, ET C EST POURQUOI ILS VIVENT DANS LA MEME GARDE :
     *     un banc ne doit dependre NI de la fin de ligne NI du systeme de fichiers de l hote. Dans
     *     les deux cas il ne casse pas, il cesse SILENCIEUSEMENT de couvrir — ou pire, il accuse LE
     *     CODE pour une raison qui n a rien a voir avec lui.
     *   ⚠️ CE QUE CE MOTIF LAISSE PASSER, nomme : un `import()` dont le chemin est construit plus
     *     haut dans une variable qu on ne relit pas ici. On vise l appel, pas le flot de donnees. */
    if (/await\s+import\(\s*(?:path\.)?(?:join|resolve)\(/.test(ligne)) {
      trouves.push({ l: i + 1, quoi: t.slice(0, 70), pourquoi: 'import() d un chemin, pas d une file:// URL' });
    }
    if (/new URL\([^)]*import\.meta\.url\s*\)\s*\.pathname/.test(ligne)) {
      trouves.push({ l: i + 1, quoi: t.slice(0, 70), pourquoi: '.pathname utilise comme chemin de fichier' });
    }
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

/* ⛔⛔ ET LES MEMES DEUX TEMOINS POUR LE MOTIF DES CHEMINS, avec les formes EXACTES mesurees ce jour.
 *    Sans eux, « 0 fautif » ne distinguerait pas « tout est portable » de « le second motif ne
 *    cherche rien » — et c est precisement ce qui vient de se passer pendant des heures. */
const TEMOIN_CHEMIN = "  const E = await import(path.join(ICI, 'echange.js'));\n"
  + "  T: await import(join(d, 'tokenomics.js')),\n"
  + "const ICI = new URL('.', import.meta.url).pathname;";
const vusChemin = suspects(TEMOIN_CHEMIN);
ok('TEMOIN — la sonde attrape les trois formes de chemin non portables mesurees le 2026-10-02',
  vusChemin.length === 3, JSON.stringify(vusChemin.map((x) => x.pourquoi)));
const SAIN_CHEMIN = "  const E = await import(pathToFileURL(path.join(ICI, 'echange.js')).href);\n"
  + "const ICI = fileURLToPath(new URL('.', import.meta.url));\n"
  + "const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');";
ok('TEMOIN NEGATIF — les formes corrigees et `new URL(...)` passe a readFileSync ne sont PAS accusees',
  suspects(SAIN_CHEMIN).length === 0, JSON.stringify(suspects(SAIN_CHEMIN)));

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
const DETTE_CONNUE = 0;  /* 20 -> 19 : test-note-carte-ne-grandit-plus repare le 2026-10-02 ;
                            19 -> 0 : les 19 restants passes a `indexEol(s, /\r?\n.../, de)`, 2026-10-02 */
n += 1;
if (fautifs > DETTE_CONNUE) {
  ko += 1;
  console.log('');
  /* ⛔⛔ CE MESSAGE NE PARLAIT QUE DES FINS DE LIGNE, et la garde surveille desormais DEUX familles.
   *    Le 2026-10-02 il a accuse un defaut de CHEMIN en expliquant un probleme de CRLF : le
   *    signalement etait juste et le remede propose etait hors sujet. « Un chiffre juste mais
   *    illisible n avertit pas » — et une alerte qui propose le mauvais correctif fait perdre plus
   *    de temps qu elle n en gagne. Le remede vient maintenant de la raison MESUREE, par ligne. */
  console.log('  ⛔ ' + fautifs + ' fichiers fautifs, pour une dette connue de ' + DETTE_CONNUE + '.');
  console.log('     Un NOUVEAU banc depend de l HOTE : il sera VERT sur une box et ROUGE ailleurs, ou');
  console.log('     pire, il cessera silencieusement de couvrir en accusant LE CODE.');
  console.log('     Remedes, selon la raison imprimee ci-dessus :');
  console.log('       · « ancre de position »          -> `\\r?\\n` des deux cotes, ou `indexEol()`.');
  console.log('       · « import() d un chemin »       -> `pathToFileURL(chemin).href`.');
  console.log('       · « .pathname comme chemin »     -> `fileURLToPath(new URL(...))`.');
  console.log('     ⛔ Mesure du 2026-10-02 : CINQ bancs etaient verts en conteneur et MORTS sur');
  console.log('        Windows — 157 assertions qui ne s executaient pas, dont 102 pour le seul');
  console.log('        audit du cablage du hook. Un banc qui ne tourne pas ne garde rien.');
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
