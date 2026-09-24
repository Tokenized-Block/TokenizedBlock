/* poser-cle-cdp.mjs — POSE LA CLE CDP SUR RAILWAY SANS QUE PERSONNE NE LA LISE.
 *
 * usage : node poser-cle-cdp.mjs "<chemin du .env>"
 *
 * ⛔⛔ POURQUOI CE SCRIPT EXISTE PLUTOT QU UNE COMMANDE. La regle de travail est explicite :
 *     « jamais de cle privee / CDP / Stripe, .env compris ». Lire la valeur pour la recopier dans
 *     une commande la ferait apparaitre dans la conversation, dans l historique du terminal, et
 *     dans les journaux de l outil — trois endroits ou elle resterait apres coup. Roter une cle ne
 *     la retire PAS des disques ou elle a traine : c est une lecon deja payee ici.
 *
 * ⇒ LA VALEUR NE SORT JAMAIS DE CE PROCESSUS. Elle est lue depuis le fichier, passee a `railway`
 *   par un ARGUMENT DE PROCESSUS (pas par un shell qui l historiserait), et jamais imprimee.
 *   ⛔ Ce script n affiche QUE des noms de variables et des verdicts. Toute sortie de `railway` est
 *     filtree : si elle contenait la valeur, elle serait masquee avant affichage.
 *
 * ⛔ CE QU IL NE FAIT PAS : il ne verifie pas que la cle est VALIDE chez Coinbase. Il la pose. La
 *   preuve que le rail marche viendra de l appel a /api/onramp/session, pas d ici.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const CHEMIN = process.argv[2];
const SERVICE = 'tokenized-block';
const NOMS = ['CDP_API_KEY_ID', 'CDP_API_KEY_SECRET'];

if (!CHEMIN) {
  console.log('usage : node poser-cle-cdp.mjs "<chemin du .env>"');
  process.exitCode = 2;
} else {
  let brut;
  try { brut = readFileSync(CHEMIN, 'utf8'); }
  catch (e) { console.log('⛔ fichier illisible : ' + String(e.code || e.message)); process.exitCode = 1; }

  if (brut) {
    const valeurs = new Map();
    /* ⛔⛔ LE `\r` EST RETIRE AVANT TOUTE ANALYSE, et l oublier m a coute une fausse mesure.
     *     Le fichier est en CRLF ; `split('\n')` laisse donc un `\r` a la fin de chaque ligne. Or en
     *     JavaScript, `.` ne matche PAS `\r` — c est un terminateur de ligne au meme titre que
     *     `\n`. Le motif `(.*)$` s arretait donc AVANT le `\r`, `$` ne tombait pas juste, et la
     *     ligne entiere etait ignoree.
     *   ⛔ Resultat : le script a annonce « absent ou vide » sur deux variables parfaitement
     *     presentes — c est-a-dire qu il a rendu un VERDICT sur une lecture qui avait echoue. Sans
     *     la contradiction avec une mesure precedente, j aurais conclu que la cle n existait pas. */
    for (const ligne of brut.replace(/\r/g, '').split('\n')) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(ligne);
      if (!m) continue;
      if (!NOMS.includes(m[1])) continue;
      /* ⛔ on enleve guillemets et espaces de bord, sans jamais journaliser le contenu */
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v.length) valeurs.set(m[1], v);
    }

    const manquants = NOMS.filter((n) => !valeurs.has(n));
    if (manquants.length) {
      console.log('⛔ absent(s) ou vide(s) dans ce fichier : ' + manquants.join(', '));
      console.log('   Rien n a ete pose. Aucune valeur n a ete lue ni affichee.');
      process.exitCode = 1;
    } else {
      console.log('✅ les ' + NOMS.length + ' variables sont presentes et non vides (valeurs NON lues ici)');
      const args = ['variables', '--service', SERVICE];
      for (const n of NOMS) args.push('--set', n + '=' + valeurs.get(n));
      console.log('→ railway variables --service ' + SERVICE + ' --set ' + NOMS.join('=… --set ') + '=…');
      /* ⛔ `spawnSync` SANS shell : la valeur est un argument de processus, elle ne traverse aucun
       *   interpreteur et n entre donc dans aucun historique de terminal. */
      /* ⛔⛔ ON VISE LE BINAIRE, PAS LE NOM. Sur Windows, `railway` du PATH est un shim `.ps1`/`.cmd` :
       *   `spawnSync` sans shell ne le resout pas (ENOENT). Et passer par `shell: true` ferait
       *   traverser la VALEUR a un interpreteur, donc potentiellement a un historique — exactement
       *   ce qu on evite. On resout donc l executable reel et on garde `shell: false`.
       * ⛔ Le chemin est surchargeable par RAILWAY_BIN : rien n est code en dur pour une machine. */
      const BIN = process.env.RAILWAY_BIN
        || 'C:\\Users\\VolKov\\AppData\\Roaming\\npm\\node_modules\\@railway\\cli\\bin\\railway.exe';
      const r = spawnSync(BIN, args, { shell: false, encoding: 'utf8' });
      /* ⛔⛔ MASQUAGE DE LA SORTIE, par precaution : si `railway` renvoyait la valeur dans un
       *   message d erreur, elle serait imprimee ici. On la remplace avant tout affichage. */
      const masquer = (s) => {
        let out = String(s || '');
        for (const v of valeurs.values()) if (v) out = out.split(v).join('«valeur masquée»');
        return out.slice(0, 600);
      };
      if (r.error) {
        console.log('⛔ railway n a pas pu etre lance : ' + String(r.error.code || r.error.message));
        console.log('   Verifie que la CLI est installee et que le projet est lie.');
        process.exitCode = 1;
      } else if (r.status !== 0) {
        console.log('⛔ railway a refuse (code ' + r.status + ')');
        console.log(masquer(r.stderr || r.stdout));
        process.exitCode = 1;
      } else {
        console.log('✅ pose sur le service « ' + SERVICE + ' ».');
        console.log(masquer(r.stdout));
        console.log('\n⚠️ CECI NE PROUVE PAS QUE LA CLE EST VALIDE. Ca prouve qu elle est POSEE.');
        console.log('   La preuve viendra de /api/onramp/session : il doit cesser de repondre');
        console.log('   « no CDP credentials ». S il repond autre chose, on lira quoi.');
      }
    }
  }
}
