/* test-causes-echec.mjs — UN REFUS N EST PAS UN REVERT, ET LE COMPTEUR DOIT LE SAVOIR.
 *
 * ⛔⛔ CE QUE CE TEST PROTEGE. L entonnoir de production disait `cree` = 6, `cree_echec` = 8 sans
 *     jamais dire POURQUOI. Huit personnes qui declinent poliment dans leur wallet et huit
 *     transactions qui revertent en brulant du gas donnent le MEME chiffre et appellent des
 *     reponses opposees. La categorie est ce qui rend le nombre actionnable.
 *
 * ⛔ CE TEST NE PROUVE PAS que les causes observees en production seront justes — il prouve que la
 *    TRADUCTION etat -> categorie est fermee, exhaustive et fail-closed du bon cote.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { causeEchec, etapeEchec, CAUSES, ETAPES_ECHEC } from './causes-echec.js';

let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('les etats qui comptent sont classes SEPAREMENT', () => {
  /* ⛔⛔ LE CAS CENTRAL : ces deux-la ne doivent JAMAIS tomber dans le meme seau. */
  assert.equal(causeEchec('REFUSE_PAR_UTILISATEUR'), 'refus');
  assert.equal(causeEchec('ANNULE_SUR_CHAINE'), 'revert');
  assert.notEqual(causeEchec('REFUSE_PAR_UTILISATEUR'), causeEchec('ANNULE_SUR_CHAINE'),
    'un refus poli et une transaction qui reverte comptent pareil : le chiffre redevient muet');
});

v('chaque etat connu tombe dans une categorie de la liste', () => {
  for (const e of ['REFUSE_PAR_UTILISATEUR', 'ANNULE_SUR_CHAINE', 'ECHEC_ENVOI',
    'DESTINATION_INVALIDE', 'MAUVAISE_CHAINE', 'CHAINE_ILLISIBLE', 'AUTRE_COMPTE',
    'COMPTE_ILLISIBLE', 'EN_ATTENTE', 'REFUSE']) {
    assert.ok(CAUSES.includes(causeEchec(e)), e + ' rend une categorie hors liste');
  }
});

v('⛔ un etat INCONNU tombe dans « autre », jamais dans « refus »', () => {
  /* ⛔⛔ LE CHOIX QUI DECIDE DE TOUT. Par defaut vers « refus », un bug du produit se lirait comme
   *     une decision de l utilisateur — donc comme rien a corriger, donc jamais corrige. La
   *     categorie par defaut doit etre celle qui DERANGE. */
  for (const inconnu of ['UN_ETAT_QUI_N_EXISTE_PAS', 'ok', 'ERREUR_FUTURE', '', null, undefined, 42, {}]) {
    const c = causeEchec(inconnu);
    assert.equal(c, 'autre', 'etat inconnu (' + String(inconnu) + ') classe en « ' + c + ' »');
    assert.notEqual(c, 'refus', 'un etat inconnu passe pour une decision de l utilisateur');
  }
});

v('la casse de l etat ne change pas la categorie', () => {
  assert.equal(causeEchec('annule_sur_chaine'), 'revert');
  assert.equal(causeEchec('Refuse_Par_Utilisateur'), 'refus');
});

v('les noms d etape sont bornes, en minuscules, sans surprise', () => {
  /* ⛔ Un nom construit qui sortirait de `[a-z0-9_]` serait rejete par /api/etape — en silence. */
  assert.equal(ETAPES_ECHEC.length, CAUSES.length);
  for (const e of ETAPES_ECHEC) {
    assert.match(e, /^cree_ko_[a-z]+$/, 'nom d etape hors format : ' + e);
  }
  assert.equal(etapeEchec('ANNULE_SUR_CHAINE'), 'cree_ko_revert');
  assert.equal(etapeEchec('rien-de-connu'), 'cree_ko_autre');
});

v('⛔ TOUS les noms d etape sont sur la liste blanche du serveur', () => {
  /* ⛔⛔ Sans ce cas, on aurait une classification parfaite dont AUCUNE valeur n arrive au
   *     compteur — le defaut des 34 etapes, reproduit a l identique le jour meme ou on le corrige. */
  const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');
  const m = /const ETAPES_ENTONNOIR = \[([\s\S]*?)\]/.exec(srv);
  assert.ok(m, 'liste blanche introuvable — rien affirme');
  const blanches = new Set(m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter((s) => /^[a-z0-9_]+$/.test(s)));
  const absents = ETAPES_ECHEC.filter((e) => !blanches.has(e));
  assert.deepEqual(absents, [], absents.length + ' cause(s) de rejet ne seront JAMAIS comptees : '
    + absents.join(', '));
});

v('⛔ AUCUN etat de envoi.js n est oublie par la table', () => {
  /* ⛔⛔ LA GARDE QUI SURVIT AU TEMPS. `envoi.js` gagnera de nouveaux etats. Sans ce cas, ils
   *     tomberaient tous dans « autre » sans que personne le remarque, et la categorisation se
   *     deliterait doucement jusqu a ne plus rien apprendre. Le test echoue le jour ou l etat
   *     apparait, pas six mois plus tard. */
  const envoi = readFileSync(new URL('./envoi.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');
  const etats = new Set([...envoi.matchAll(/etat:\s*'([A-Z_]+)'/g)].map((x) => x[1]));
  /* ⛔ ceux-la ne sont pas des echecs : les exclure explicitement, un par un, plutot que par un
   *   motif — un motif engloberait un jour un vrai echec sans qu on s en apercoive. */
  const succes = new Set(['OK', 'CONFIRME', 'ENVOYE', 'ENVOYE_AA']);
  assert.ok(etats.size >= 10, 'seulement ' + etats.size + ' etats lus dans envoi.js : lecture suspecte');
  const nonClasses = [...etats].filter((e) => !succes.has(e) && causeEchec(e) === 'autre'
    && e !== 'REFUSE').sort();
  assert.deepEqual(nonClasses, [], nonClasses.length + ' etat(s) de envoi.js tombent dans « autre » '
    + 'sans etre classes : ' + nonClasses.join(', ') + '\n   ⇒ les ajouter a TABLE dans causes-echec.js.');
});

assert.equal(n, 7, 'compte de cas inattendu : ' + n);
console.log('ok causes-echec — ' + n + ' cas : ' + CAUSES.length + ' categories fermees, refus ≠ revert,');
console.log('   inconnu -> « autre », et les ' + ETAPES_ECHEC.length + ' noms sont sur la liste blanche.');
