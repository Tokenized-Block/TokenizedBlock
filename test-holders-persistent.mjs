/* test-holders-persistent.mjs — LE REJEU DES DETENTEURS SURVIT A UN REDEMARRAGE.
 *
 * ⛔⛔ CE QUE PHIL A VU, 2026-09-25 : « Reading every transfer of this block from its birth… (7) ».
 *     Le rejeu coute ~42 lectures et des dizaines de secondes PAR BLOCK — et `holdersCache` etait
 *     un `new Map()` en memoire pure. Chaque redeploiement l effacait, et il y en a eu HUIT ce
 *     jour-la : tout visiteur retombait donc sur un rejeu a froid, indefiniment.
 *     Le magasin existait deja. Il etait juste volatil, et le commentaire du fichier l assumait
 *     (« un redeploiement le vide ») sans que personne ne mesure ce que ca coutait a l ecran.
 *
 * ⛔ CE TEST N EST PAS STRUCTUREL : il ECRIT un fichier de cache, relance le module dans un
 *   processus NEUF, et verifie que l etat revient. Lire le source aurait prouve que les lignes
 *   existent, pas qu un redemarrage les utilise — et c est exactement la difference qui compte.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que le rejeu lui-meme est juste. Il garde la PERSISTANCE, pas
 *   la comptabilite des soldes, qui a ses propres gardes.
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { strict as assert } from 'node:assert';

let n = 0;
const v = async (nom, fn) => { await fn(); n++; };

const JETON = '0xb20000000000000000000016d09cd53724fc0601';
const dossier = mkdtempSync(join(tmpdir(), 'tb-holders-'));
const fichier = join(dossier, 'holders-cache.json');

/** Lance un bout de code dans un processus NEUF, avec le volume pointe sur notre dossier. */
function dansUnProcessusNeuf(code) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    env: { ...process.env, RAILWAY_VOLUME_MOUNT_PATH: dossier, PORT: '8791', PORT_TEST: '8791' },
    encoding: 'utf8', timeout: 60000,
  });
  return { sortie: (r.stdout || '') + (r.stderr || ''), code: r.status };
}

try {
  await v('⛔⛔ une passe COMPLETE ecrite sur le volume revient apres redemarrage', async () => {
    /* ⛔⛔ LE CAS CENTRAL : c est ce qui evite a chaque visiteur de repayer ~42 lectures.
     *   ⛔⛔ MA PREMIERE VERSION DE CE CAS NE PROUVAIT RIEN : elle cherchait un marqueur que le test
     *     imprimait LUI-MEME dans tous les cas, donc elle serait restee verte sans aucune
     *     persistance. C est exactement le defaut que je traque depuis ce matin, ecrit de ma main.
     *   ⇒ On demarre le serveur pour de vrai, on interroge la ROUTE, et on exige que la reponse ne
     *     soit PLUS celle du premier passage. Ce message-la (« reading every transfer… ») n est
     *     rendu que par la branche « rien en cache » : le voir disparaitre est la preuve. */
    writeFileSync(fichier, JSON.stringify([[JETON, {
      soldes: [['0x1111111111111111111111111111111111111111', '1000']],
      naissance: 50861088, jusqua: 51000000, ratees: 0, lu: 1758800000000,
    }]]));
    const r = dansUnProcessusNeuf(
      "await import('./serveur-web.js');"
      + "await new Promise((k) => setTimeout(k, 1200));"
      + "const p = Number(process.env.PORT_TEST);"
      + "const t = await fetch('http://127.0.0.1:' + p + '/api/holders/" + JETON + "')"
      + "  .then((x) => x.text()).catch((e) => 'FETCH_KO ' + e.message);"
      + "console.log('REPONSE>>>' + t);"
      + "process.exit(0);");
    assert.match(r.sortie, /REPONSE>>>/,
      'le serveur n a pas repondu apres un demarrage avec cache : ' + r.sortie.slice(0, 400));
    const corps = r.sortie.slice(r.sortie.indexOf('REPONSE>>>') + 10).split('\n')[0];
    assert.doesNotMatch(corps, /reading every transfer of this block from its birth/,
      'le cache du volume n a pas ete relu : la route repart sur un rejeu complet a chaque '
      + 'redemarrage, ce qui est exactement le defaut signale.\n   reponse : ' + corps.slice(0, 200));
    assert.match(corps, /"jeton"\s*:\s*"0xb20/,
      'la route ne rend pas un etat pour ce jeton : ' + corps.slice(0, 200));
  });

  await v('⛔ une passe PARTIELLE n est jamais ressuscitee', () => {
    /* ⛔⛔ Un etat incomplet remis en memoire au demarrage aurait l air d une mesure. On refuse de
     *     le relire, comme on refuse de l ecrire : les deux moities de la meme regle. */
    const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
    const i = src.indexOf('function ecrireHolders()');
    assert.ok(i > 0, 'ecrireHolders a disparu');
    const ecriture = src.slice(i, src.indexOf('\n}', i));
    assert.match(ecriture, /e\.jusqua === null \|\| e\.ratees !== 0\) continue/,
      'l ecriture ne refuse plus les passes partielles');
    const j = src.indexOf('function relireHolders()');
    assert.ok(j > 0, 'la relecture a disparu');
    const relecture = src.slice(j, src.indexOf('\n})();', j));
    assert.match(relecture, /e\.jusqua === null \|\| e\.ratees !== 0\) continue/,
      'la relecture accepte une passe partielle : un etat incomplet reviendrait a chaque demarrage');
  });

  await v('⛔ l adresse est revalidee A LA RELECTURE', () => {
    /* ⛔ Un fichier est une entree comme une autre : le valider a l ecriture ne dit rien de ce
     *   qu on relit. Entre les deux il y a un disque, un redeploiement, et tout ce qui peut y
     *   toucher. */
    const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
    const j = src.indexOf('function relireHolders()');
    const relecture = src.slice(j, src.indexOf('\n})();', j));
    assert.match(relecture, /\^0xb20\[0-9a-f\]\{37\}\$/,
      'la relecture ne revalide plus l adresse du jeton');
  });

  await v('⛔⛔ tout echoue OUVERT : sans volume, le comportement est celui d avant', () => {
    /* ⛔⛔ UN INCIDENT PASSE DE CE DEPOT EST UN VOLUME PLEIN QUI A CORROMPU UNE BASE. Donc ici :
     *     rien ne jette, le fichier est borne, et un echec d ecriture ne doit JAMAIS empecher une
     *     lecture de reussir. Un cache est un confort, jamais une dependance. */
    const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
    const i = src.indexOf('function ecrireHolders()');
    const ecriture = src.slice(i, src.indexOf('\n}', i));
    assert.match(ecriture, /if \(!FICHIER_HOLDERS \|\| holdersEcritureEnCours\) return;/,
      'l ecriture ne sort plus proprement quand il n y a pas de volume');
    assert.match(ecriture, /catch \(err\) \{/, 'une ecriture ratee peut de nouveau remonter');
    assert.match(ecriture, /payload\.length > HOLDERS_FICHIER_MAX_OCTETS\) return/,
      'le fichier n est plus borne : un volume plein redevient possible');
    assert.match(src, /writeFileSync\(FICHIER_HOLDERS \+ '\.tmp', payload\);\s*\n\s*renameSync/,
      'l ecriture n est plus atomique : une coupure laisserait un fichier a moitie ecrit');
  });

  assert.equal(n, 4, 'compte de cas inattendu : ' + n);
  console.log('ok holders-persistent — ' + n + ' cas : le cache survit a un redemarrage, refuse les');
  console.log('   passes partielles dans LES DEUX SENS, et echoue ouvert sans volume.');
  console.log('⚠️ NE PROUVE PAS que le rejeu soit juste : ce test garde la persistance, pas les soldes.');
} finally {
  try { rmSync(dossier, { recursive: true, force: true }); } catch (_) { /* rien */ }
}
