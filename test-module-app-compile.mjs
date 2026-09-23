/* test-module-app-compile.mjs — LE JS DANS app.html COMPILE-T-IL SEULEMENT ?
 *
 * ⛔⛔ POURQUOI CETTE PORTE EXISTE. `app.html` fait ~820 Ko et contient un seul gros
 *     `<script type="module">`. Une erreur de syntaxe dedans ne casse PAS le serveur, ne casse pas
 *     le deploiement, ne fait rougir aucun test : elle casse la PAGE, en silence, chez le visiteur.
 *     Un accent grave mal place a deja tue `cube3d.js` deux fois en une journee — la seconde a
 *     l interieur du commentaire qui interdisait les accents graves.
 *
 * ⛔ CE QUE CETTE PORTE NE VOIT PAS, et il faut le savoir pour ne pas s y fier seul :
 *    · un import manquant (le parseur s en moque, l execution non) ;
 *    · une fonction appelee mais jamais definie ;
 *    · tout ce qui n echoue qu a l execution.
 *    Elle attrape la classe d erreurs la plus bete et la plus frequente, rien de plus. Un vert ici
 *    ne veut PAS dire « la page marche » — seul un navigateur le dit.
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ On prend TOUS les blocs `type="module"`, pas seulement le premier : ma premiere idee etait
 *   `indexOf`, et elle aurait laisse un deuxieme module non verifie — le motif
 *   `search-tool-glob-halves-the-sweep` applique a une porte de syntaxe. */
const blocs = [...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1]);

v('au moins un module est trouve — sinon la porte ne garde rien', () => {
  /* ⛔⛔ `garde-sur-element-absent-toujours-fausse`. Si le motif casse, `blocs` est vide, la boucle
   *     ne tourne pas, et le test passe au VERT en n ayant rien verifie. C est le mode d echec le
   *     plus dangereux d une porte : reussir en ne regardant pas. */
  assert.ok(blocs.length >= 1, 'aucun <script type="module"> trouve dans app.html');
  const total = blocs.reduce((a, b) => a + b.length, 0);
  assert.ok(total > 100_000, 'seulement ' + total + ' caracteres de module extraits : extraction suspecte');
});

v('chaque module passe l analyse syntaxique de node', () => {
  blocs.forEach((code, i) => {
    const f = join(tmpdir(), 'tb-module-' + i + '-' + process.pid + '.mjs');
    try {
      writeFileSync(f, code, 'utf8');
      try {
        execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
      } catch (e) {
        const sortie = String((e.stderr && e.stderr.toString()) || e.message).slice(0, 600);
        assert.fail('module #' + (i + 1) + ' d app.html ne compile pas — la page serait BLANCHE '
          + 'en production :\n' + sortie);
      }
    } finally {
      /* ⛔ le fichier temporaire part meme si l assertion a echoue */
      try { rmSync(f, { force: true }); } catch (_) {}
    }
  });
});

assert.equal(n, 2, 'compte de cas inattendu : ' + n);
console.log('ok module-app-compile — ' + n + ' cas : ' + blocs.length + ' module(s), '
  + blocs.reduce((a, b) => a + b.length, 0).toLocaleString('fr-FR') + ' caracteres compiles.');
console.log('⚠️ NE PROUVE PAS que la page marche : ni import manquant, ni appel a une fonction');
console.log('   inexistante, ni aucune erreur d execution ne sont vus ici.');
