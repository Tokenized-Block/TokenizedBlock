/* test-brain-marche-hors-carte.mjs — UN BLOCK HORS CARTE A DROIT A SON MARCHE.
 *
 * ⛔⛔⛔ MESURE EN PRODUCTION, 2026-09-25 : le selecteur du Brain proposait 379 blocks, dont
 *      CENT QUATRE-VINGTS marques « Market not read » — et parmi eux CENT SOIXANTE-DEUX qui ne
 *      sont sur AUCUNE carte, donc qu aucun lecteur ne lit jamais. C est le « pas de brain reel
 *      pour les nouveaux » signale par Phil, chiffre.
 *
 *      DEUX DEFAUTS SUPERPOSES, tous deux du meme genre :
 *        1. `choisirBrain` LIT le marche du block selectionne, puis ne garde le resultat que s il
 *           vaut `LUE`. Un `NON_TROUVEE` — « on a cherche, il n y a pas de pool », un FAIT mesure
 *           sur un block pas encore lance — etait JETE. Le cerveau restait donc « market unread »
 *           pour toujours, au lieu de dire « endormi, pas encore de marche ».
 *        2. `battreBrain` passait `(null, null)` a `viePourCerveau` des que le block n etait pas
 *           sur la carte. Et la garde du dernier bon relevé (15 min) teste `etatVie === 'NON_LUE'` :
 *           avec `null` elle est TOUJOURS FAUSSE. Ecrite pour le cas ou l habitant existe, elle ne
 *           pouvait pas servir a ceux qui en avaient le plus besoin.
 *
 * ⛔⛔ ET C EST UN CORRECTIF A MOITIE LIVRE, LE MIEN, LE MEME JOUR. `brainNourriture` a ete ajoute
 *     le matin pour exactement ce probleme cote NOURRITURE, avec un commentaire disant qu une
 *     lecture reussie doit atteindre le reseau. La moitie MARCHE n a pas ete faite.
 *     `single-and-batch-twins-diverge` : c est le jumeau qu on ne relit pas qui reste faux.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que les 162 blocks sans lecteur seront lus. Ils ne le sont
 *   qu a la selection, ou en ouvrant leur profil. Donner un lecteur a tous est un autre chantier,
 *   avec un cout RPC a mesurer — ici on garantit seulement que ce qui EST lu n est plus jete.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const cerveau = readFileSync(new URL('./cerveau.js', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('⛔⛔⛔ le marche lu hors carte est GARDE, quel que soit son etat', () => {
  /* ⛔⛔⛔ LE CAS CENTRAL. `marche.etat === 'LUE'` comme condition de conservation, c etait jeter
   *      les deux etats qui disent quelque chose de vrai sur un block endormi. */
  assert.match(html, /brainMarche = \{ adr: String\(adr\)\.toLowerCase\(\), v: marche \}/,
    'la lecture de marche d un block hors carte n est plus conservee');
  const i = html.indexOf('brainMarche = { adr:');
  const avant = html.slice(Math.max(0, i - 400), i);
  assert.doesNotMatch(avant, /\} else if \(marche && marche\.etat === 'LUE'\) \{/,
    'la branche ne retient de nouveau que LUE : NON_TROUVEE et NON_LUE repartent a la poubelle');
});

v('⛔ « pas de pool » et « lecture ratee » restent DISTINCTS', () => {
  /* ⛔⛔ Les transmettre tous les deux ne sert a rien si on les aplatit en route. `NON_TROUVEE` doit
   *     rendre un block DORMANT (endormi, pas de marche) et `NON_LUE` doit rester « illisible » —
   *     ce sont deux reparations opposees : lancer le block, ou reparer le reseau. */
  assert.match(html, /marche\.etat === 'LUE' \? marche\.vie : null, marche\.etat/,
    'l etat mesure n est plus transmis tel quel');
  assert.match(cerveau, /nonLu: !aMarche && \(etatVie === 'NON_LUE' \|\| etatVie === 'LUE'\)/,
    'la regle qui distingue « illisible » de « pas de marche » a change dans cerveau.js : '
    + 'verifier qu un block sans pool ne se dit plus « market unread »');
});

v('⛔⛔ la garde du dernier bon relevé accepte « aucune lecture en main »', () => {
  /* ⛔⛔ Elle etait toujours fausse pour les blocks hors carte : l appelant passait `null` et le
   *     test exigeait `'NON_LUE'`. Le relevé dormait en memoire sans jamais etre rendu. */
  assert.match(html, /const sansLecture = etatVie === null \|\| etatVie === undefined;/,
    'le cas « aucune lecture en main » n est plus reconnu');
  assert.match(html, /if \(k && \(sansLecture \|\| etatVie === 'NON_LUE'/,
    'la garde des 15 minutes ne couvre plus le cas sans lecture : elle redevient inatteignable '
    + 'pour les blocks hors carte');
});

v('⛔ le consommateur va chercher le marche hors carte', () => {
  assert.match(html, /const mB = brainMarche && brainMarche\.adr === String\(brainAdr/,
    'battreBrain ne consulte plus le marche conserve : la lecture reste inutilisee');
  assert.match(html, /h \? h\.etatVie : \(mB \? mB\.etat : null\)/,
    'on repasse `null` des que le block n est pas sur la carte — le defaut d origine');
});

v('⛔ le jumeau NOURRITURE est toujours cable, lui aussi', () => {
  /* ⛔ C est la paire qui compte : c est parce qu une moitie avait ete faite et pas l autre que le
   *   defaut a survecu une journee entiere. On les garde ensemble, sinon la prochaine divergence
   *   passera aussi inapercue. */
  assert.match(html, /brainNourriture = \{ adr: String\(adr\)\.toLowerCase\(\), n \}/,
    'la conservation de la nourriture hors carte a disparu');
  assert.match(html, /const nBrain = h && h\.nourriture \? h\.nourriture/,
    'la nourriture conservee n atteint plus le reseau');
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok brain-marche-hors-carte — ' + n + ' cas : le marche lu hors carte est garde, son');
console.log('   etat transmis tel quel, et le dernier bon releve est enfin atteignable.');
console.log('⚠️ NE PROUVE PAS que les 162 blocks sans lecteur seront lus : ils ne le sont qu a la');
console.log('   selection ou en ouvrant leur profil. Leur donner un lecteur est un autre chantier.');
