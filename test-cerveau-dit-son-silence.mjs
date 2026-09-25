/* test-cerveau-dit-son-silence.mjs — UNE BANDE VIDE DOIT DIRE POURQUOI ELLE EST VIDE.
 *
 * ⛔⛔ CE QUI A DECLENCHE CE FICHIER. Capture de Phil, 2026-09-25, onglet Brain : « 6 ticks »,
 *     « 0 spikes since open », « 0 / 128 firing now », et un rectangle NOIR. Il a lu « bug ».
 *     MESURE (cerveau.js rejoue hors navigateur sur 30 adresses, marche non lu, nourriture non
 *     lue) : le premier neurone franchit son seuil entre le 7e et le 10e battement, mediane 8 —
 *     soit 4 a 6 secondes apres la selection. Au 6e battement, la bande est donc HONNETEMENT vide.
 *     Les huit champs de la capture ont ete reproduits a l identique par ce rejeu.
 *
 * ⛔⛔ LE DEFAUT N ETAIT PAS LE DESSIN, C ETAIT LE SILENCE. « en train de se charger », « mort » et
 *     « le canvas a casse » donnaient exactement le MEME ecran. Trois etats, une seule image,
 *     aucune facon de les distinguer — y compris pour nous en deboguant.
 *   ⇒ On ne dessine toujours AUCUN pixel qui n ait tire. On nomme l etat.
 *
 * ⛔ ET UN VRAI DEFAUT DE PLOMBERIE A ETE TROUVE AU PASSAGE : la nourriture LUE puis JETEE.
 *   Verifie en production le meme jour : `#bNourriture` affichait « Food not read yet ».
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que le reseau se reveille plus vite. Il garde ce que l ecran
 *   DIT, pas ce que le modele fait. Le modele n a pas ete touche — `cerveau.js` est fige par
 *   `VERSION_CERVEAU`, gravee a la creation : en changer les parametres ferait rejouer faux tous
 *   les blocks deja graves.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const cerveau = readFileSync(new URL('./cerveau.js', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('⛔⛔ la nourriture lue atteint le RESEAU, pas seulement le journal', () => {
  /* ⛔⛔ LE CAS CENTRAL, et c est le seul defaut fonctionnel de ce lot. Pour un block absent de
   *     `habitants` — cas NORMAL, le selecteur sert aussi les blocks vus par le Live — la lecture
   *     etait rangee dans `brainNourriture`, lue par le journal et l instantane, et jetee avant le
   *     reseau. « une valeur lue puis jetee est un defaut ». */
  assert.match(html, /const nBrain = h && h\.nourriture \? h\.nourriture/,
    'la nourriture de repli n est plus resolue avant le pas du reseau');
  assert.match(html, /entreesCerveau\(vc\.vie, h \? h\.vieAvant : null, nBrain,/,
    'le reseau recoit de nouveau `h ? h.nourriture : null` : une lecture reussie repart a la poubelle');
});

v('⛔ l ecran lit la MEME source que le reseau', () => {
  /* ⛔ Sinon `#bNourriture` annonce « Food not read yet » sur une lecture REUSSIE, et « pas encore
   *   lu » devient indiscernable de « lu puis perdu » — les deux etats les plus faciles a
   *   confondre, et ceux qui appellent les reparations les plus opposees. */
  assert.match(html, /const n = nBrain;/,
    'l affichage de la nourriture a repris une source differente de celle du reseau');
});

v('⛔⛔ une bande vide nomme son etat — et les trois cas sont distincts', () => {
  /* ⛔⛔ Trois etats donnaient une seule image. Il faut trois phrases, pas une de plus honnete. */
  const i = html.indexOf("const noteR = $('#bRasterNote');");
  assert.ok(i > 0, 'la note du raster n est plus pilotee : la bande redevient muette');
  const bloc = html.slice(i, i + 1400);
  assert.match(bloc, /phase === 'MORT'/, 'le cas « block mort » n est plus distingue');
  assert.match(bloc, /brainTotal === 0/, 'le cas « rien n a encore tire » n est plus distingue');
  assert.match(bloc, /Nothing has fired yet/, 'l etat de charge ne se dit plus');
  assert.match(bloc, /not because it failed to draw/,
    'la phrase ne leve plus l ambiguite avec un defaut d affichage — c est pourtant ce que Phil a lu');
});

v('⛔ la note du raster existe dans le HTML avec son id', () => {
  assert.match(html, /id="bRasterNote"/,
    'l element de la note a disparu : le code ci-dessus ecrirait dans le vide');
});

v('⛔⛔ la promesse « the beat below is real » attend d avoir tire', () => {
  /* ⛔⛔ C est la phrase EXACTE que Phil avait sous les yeux, au-dessus d une bande vide. Une
   *     promesse affichee avant la mesure est un mensonge a retardement : elle devient vraie deux
   *     secondes plus tard, mais elle etait fausse au moment ou on l a lue. */
  const i = html.indexOf('const aTire = ');
  assert.ok(i > 0, 'la garde de la promesse a disparu');
  const bloc = html.slice(i, i + 900);
  assert.match(bloc, /traceProfil\.some/,
    'la promesse se juge sur le battement courant : elle clignotera une fois sur deux');
  assert.match(bloc, /aTire\s*\n?\s*\?\s*'Market unread[\s\S]{0,200}beat below is real/,
    'la promesse n est plus conditionnee a ce que quelque chose ait tire');
  assert.match(bloc, /No neuron has fired yet either/,
    'le cas « rien n a tire » n a plus sa propre phrase');
});

v('⛔ le modele n a PAS ete touche', () => {
  /* ⛔⛔ `VERSION_CERVEAU` est gravee a la creation de chaque block. Changer un parametre du reseau
   *     pour raccourcir la charge SANS changer ce nom ferait rejouer faux tous les blocks deja
   *     graves — on aurait repare un ecran en falsifiant un historique. Le correctif est donc
   *     entierement dans la couche d affichage, et ce cas l exige. */
  assert.match(cerveau, /VERSION_CERVEAU\s*=\s*'tblock-fly-brain\/3'/,
    'la version du cerveau a change : verifier que c est voulu et que les blocks graves rejouent juste');
  assert.match(cerveau, /reposSansMarche/,
    'le parametre de repos sans marche a disparu de cerveau.js');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok cerveau-dit-son-silence — ' + n + ' cas : la nourriture lue atteint le reseau, et');
console.log('   une bande vide dit si elle charge, si le block est mort, ou si elle a tire.');
console.log('⚠️ NE PROUVE PAS que le reseau se reveille plus vite : le modele n a pas ete touche.');
console.log('   Mesure : premier spike au 7e-10e battement sans marche ni nourriture.');
