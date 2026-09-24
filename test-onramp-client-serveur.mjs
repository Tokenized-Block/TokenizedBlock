/* test-onramp-client-serveur.mjs — LA REQUETE QUE LE CLIENT CONSTRUIT EST-ELLE ACCEPTEE ?
 *
 * ⛔⛔ CE TEST EXISTE A CAUSE D UN DEFAUT QUE J AI LIVRE MOI-MEME, LE 2026-09-23.
 *     J avais ecrit les deux moities du rail fiat et teste chacune a fond : 22 cas cote serveur
 *     (fail-closed, mutations rouges), l ecouteur verifie attache EN PRODUCTION. Les deux moities
 *     etaient justes. Elles ne se parlaient pas : le client n envoyait pas `montant`, que le
 *     serveur exigeait. Resultat, 400 a chaque clic, repli systematique sur le lien public —
 *     un rail entierement mort, pendant une journee, avec des tests verts.
 *
 * ⛔⛔ ET VOICI POURQUOI MA VERIFICATION NE L A PAS VU, parce que c est ca qu il faut retenir.
 *     J avais clique le bouton en production et regarde le compteur d entonnoir monter. Il montait.
 *     Mais le chemin de REPLI incremente lui aussi — `onramp_session_repli`. J observais donc que
 *     l ecouteur PARTAIT, jamais que le rail ABOUTISSAIT. Un temoin qui s allume dans les deux cas
 *     ne distingue rien. (`guards-measured-transport-not-execution`.)
 *
 * ⇒ CE QUE CE TEST FAIT, ET QU AUCUN AUTRE NE FAISAIT : il extrait de app.html l URL REELLEMENT
 *   construite par le client, et la passe au validateur REEL du serveur. Les deux cotes ne sont
 *   plus juges separement.
 *
 * ⛔ CE QU IL NE PROUVE PAS : que Coinbase accepte quoi que ce soit, ni que le clic fonctionne dans
 *    un navigateur. Il prouve que les deux moities s accordent — rien de plus, et c est deja ce qui
 *    manquait.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { validerDemande } from './onramp-session.js';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ On lit le code SANS ses commentaires : ce depot documente ses defauts corriges en clair, et un
 *   motif naif retrouverait l ancienne URL citee dans un commentaire plutot que celle du code. */
const src = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');

/* l appel reel, tel qu il est ecrit : fetch('/api/onramp/session?...' + ... ) */
const i = src.indexOf("'/api/onramp/session?");
v('le client appelle bien la route — sinon ce test ne garde rien', () => {
  /* ⛔ `garde-sur-element-absent-toujours-fausse` : si l appel disparait, tout ce qui suit serait
   *    vide et le test passerait au VERT en n ayant rien verifie. */
  assert.ok(i > 0, "aucun appel a /api/onramp/session dans app.html : le rail n a plus d appelant");
});

/* On reconstruit les parametres que le client pose, en lisant l expression jusqu a la parenthese
 * fermante du fetch. Les morceaux litteraux suffisent : ce sont eux qui portent les noms. */
const extrait = src.slice(i, i + 400);
const nomsPoses = new Set([...extrait.matchAll(/[?&]([a-zA-Z]+)=/g)].map((m) => m[1]));

v('les parametres posés par le client sont lisibles', () => {
  assert.ok(nomsPoses.size >= 1, 'aucun parametre lu dans l appel : extraction suspecte');
  assert.ok(nomsPoses.has('adresse'), "le client n envoie pas `adresse` — la route ne saurait pas ou envoyer les fonds");
});

/* ⛔⛔ LE CAS CENTRAL. On fabrique la demande EXACTEMENT comme la route la fabrique a partir de
 *     l URL du client — `URLSearchParams.get` rend `null` pour un parametre absent — puis on la
 *     passe au validateur REEL. S il refuse, le rail est mort, quel que soit l etat des tests
 *     de chaque cote. */
v('⛔ la demande que le client construit est ACCEPTEE par le validateur du serveur', () => {
  const q = new Map();
  q.set('adresse', '0x' + 'a'.repeat(40));
  if (nomsPoses.has('actif')) q.set('actif', 'ETH');
  if (nomsPoses.has('montant')) q.set('montant', '20');
  const get = (k) => (q.has(k) ? q.get(k) : null); /* comme URLSearchParams sur un param absent */

  const r = validerDemande({ adresse: get('adresse'), actif: get('actif'), montantFiat: get('montant') });
  assert.equal(r.etat, 'OK',
    'le serveur REFUSE la requete que le client envoie : « ' + r.pourquoi + ' ».\n'
    + '   parametres posés par le client : ' + [...nomsPoses].join(', ') + '\n'
    + '   ⇒ chaque clic rendra 400 et retombera sur le lien public. Le rail est MORT, et les tests\n'
    + '     de chaque moitie resteront verts : c est exactement le defaut du 2026-09-23.');
});

v('un montant absent est accepté et ne pré-remplit rien', () => {
  /* ⛔ Le montant est un CONFORT (`presetFiatAmount` est facultatif chez CDP), jamais une
   *    condition. L avoir rendu obligatoire est ce qui avait tue le rail. */
  const r = validerDemande({ adresse: '0x' + 'a'.repeat(40) });
  assert.equal(r.etat, 'OK');
  assert.equal(r.montantFiat, null, 'un montant absent doit rester null, pas devenir 0');
});

v('un montant PRESENT mais blanc reste refusé', () => {
  /* ⛔ Absent et vide ne sont pas la meme chose : `null` = pas de preference, `''` = champ soumis
   *    blanc, donc defaut de l appelant. Les confondre ferait passer `Number('') === 0` pour un
   *    montant de zero dollar. */
  const r = validerDemande({ adresse: '0x' + 'a'.repeat(40), montantFiat: '' });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /blank/i);
});

v('les bornes tiennent toujours quand un montant EST donné', () => {
  const adr = '0x' + 'a'.repeat(40);
  assert.equal(validerDemande({ adresse: adr, montantFiat: 1 }).etat, 'REFUSE');
  assert.equal(validerDemande({ adresse: adr, montantFiat: 99999 }).etat, 'REFUSE');
  assert.equal(validerDemande({ adresse: adr, montantFiat: 20 }).etat, 'OK');
});

v('⛔ le repli et le succès ne comptent PAS la même étape', () => {
  /* ⛔⛔ LA GARDE QUI MANQUAIT LE PLUS. Si les deux chemins incrementaient le meme compteur, on ne
   *     pourrait jamais distinguer « le rail marche » de « le rail retombe sur le lien public » —
   *     et c est precisement en confondant les deux que j ai declare vert un rail mort. */
  assert.match(src, /onramp_session_ok/, "l etape de SUCCES a disparu : plus moyen de voir si le rail aboutit");
  assert.match(src, /onramp_session_repli/, "l etape de REPLI a disparu : un echec deviendrait invisible");
  assert.notEqual('onramp_session_ok', 'onramp_session_repli');
});

assert.equal(n, 7, 'compte de cas inattendu : ' + n);
console.log('ok onramp-client-serveur — ' + n + ' cas : le client parle et le serveur repond oui.');
console.log('   parametres envoyes par le client : ' + [...nomsPoses].join(', '));
console.log('⚠️ NE PROUVE PAS que Coinbase accepte, ni que le clic marche dans un navigateur.');
