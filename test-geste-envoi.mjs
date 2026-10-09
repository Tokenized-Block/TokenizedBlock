/* test-geste-envoi.mjs — SAVOIR QUEL GESTE TOURNE, AVANT DE PARLER DE FRAIS DESSUS.
 *
 * ⛔⛔ POURQUOI. Phil, 2026-09-30 : « le send frag, c est ce qui se fait le plus sur notre app ».
 *     Le « send frag » est le GM, un VRAI transfert d un fragment de block. Or au moment ou il l a
 *     dit, RIEN ne le comptait : aucun nom d envoi dans `ETAPES_ENTONNOIR`, aucune des 36 etapes
 *     actives. « Ce qui se fait le plus » etait une CROYANCE. La meme croyance avait dit « zero
 *     achat » avant qu on instrumente le chemin d achat — ou il s est avere qu il y avait eu
 *     2 achats reels, le 2026-09-22.
 *   ⇒ On compte d abord. La question « peut-on y prendre 0,1 % ? » vient apres, et elle ne se
 *     tranche pas dans un test : prelever sur un geste OFFERT entre deux personnes est une
 *     decision produit.
 *
 * ⚠️ BORNE : ce fichier lit du texte et teste un module pur. Il prouve que les compteurs sont
 *    ECRITS aux bons endroits avec des noms que le serveur accepte — pas qu un visiteur les
 *    declenche, ni qu un envoi aboutisse on-chain.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires, trancheNue } from './outils-test.js';
import { GESTES, ETAPES_ENVOI, etapeDuGeste } from './geste-envoi.js';

const brut = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const serveur = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const html = sansCommentaires(brut, { minRetire: 5000 });
let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

cas('⛔⛔⛔ TOUT NOM D ENVOI EST ACCEPTE PAR LE SERVEUR', () => {
  /* ⛔ Un nom absent de la liste blanche serait jete EN SILENCE par `/api/etape` et vaudrait 0 pour
   *   toujours — indiscernable d un geste que personne ne fait. C est le defaut qui avait deja
   *   perdu 34 noms sur 48 dans ce depot. */
  const bloc = /const ETAPES_ENTONNOIR = \[([\s\S]*?)\];/.exec(serveur);
  assert.ok(bloc, 'ETAPES_ENTONNOIR introuvable : ce controle ne garde rien');
  const blanche = new Set([...bloc[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
  const orphelins = ETAPES_ENVOI.filter((e) => !blanche.has(e));
  assert.deepEqual(orphelins, [], 'noms jetes en silence par le serveur : ' + orphelins.join(', '));
  assert.equal(blanche.has('gm_nom_qui_nexiste_pas'), false, 'le temoin negatif existe vraiment');
  console.log('   ' + ETAPES_ENVOI.length + ' noms d envoi, tous acceptes.');
});

cas('⛔ LES TROIS GESTES SE DISTINGUENT A L INTENTION, et partagent leurs issues', () => {
  /* ⛔ SANS `*_clic` PAR GESTE, on saurait qu il y a des envois mais PAS lequel domine — donc rien
   *   d actionnable, et la question de Phil resterait sans reponse. */
  const clics = GESTES.map((g) => etapeDuGeste(g, 'clic'));
  assert.deepEqual(clics, ['gm_clic', 'message_clic', 'envoi_clic']);
  assert.equal(new Set(clics).size, 3, 'deux gestes partagent un compteur d intention : ils seraient confondus');
  /* ⛔ les issues sont partagees : c est le MEME code qui envoie. */
  for (const g of GESTES) {
    assert.equal(etapeDuGeste(g, 'ok'), 'envoi_ok');
    assert.equal(etapeDuGeste(g, 'sign_refus'), 'envoi_sign_refus');
    assert.equal(etapeDuGeste(g, 'sign_propos'), 'envoi_sign_propos');
  }
});

cas('⛔⛔ UN COUPLE INCONNU REND `null`, JAMAIS UN NOM INVENTE', () => {
  /* ⛔⛔ Emettre un nom hors liste ne leve AUCUNE erreur et vaut 0 pour toujours. Mieux vaut ne rien
   *     compter que compter dans le vide — et c est pour ca que `null` est la bonne reponse.
   *   ⛔ `send` + '_clic' aurait donne `send_clic`, ABSENT de la liste : la table de prefixes est
   *     explicite justement pour ca. */
  for (const [g, m] of [['inconnu', 'clic'], ['gm', 'moment_invente'], ['', ''], [null, null],
    [undefined, 'ok2'], ['send', 'refus_inconnu']]) {
    const r = etapeDuGeste(g, m);
    assert.ok(r === null || ETAPES_ENVOI.includes(r), 'couple (' + g + ',' + m + ') rend « ' + r + ' »');
  }
  assert.equal(etapeDuGeste('inconnu', 'clic'), null);
  assert.equal(etapeDuGeste('gm', 'moment_invente'), null);
  /* ⛔ ET LE PIEGE NOMME : `send` doit donner `envoi_clic`, pas `send_clic`. */
  assert.equal(etapeDuGeste('send', 'clic'), 'envoi_clic');
  assert.equal(ETAPES_ENVOI.includes('send_clic'), false, 'le nom piege existe : la table ne protege plus');
});

cas('⛔⛔ LA PAGE COMPTE L INTENTION DES L OUVERTURE, AVANT LES REFUS', () => {
  /* ⛔ SI LE CLIC ETAIT COMPTE APRES LA GARDE DU WALLET, tous les gestes sans wallet seraient
   *   INVISIBLES — et c est precisement la perte n°1 mesuree ailleurs (41 `wallet_no_provider`
   *   sur 384 visites). L intention doit pouvoir arriver seule. */
  const t = trancheNue(brut, 'function ouvrirEnvoiPour(', 'allerA(\'wallet\')', 'ouvrirEnvoiPour');
  const iClic = t.indexOf("etapeDuGeste(gesteEnvoiCourant, 'clic')");
  const iGarde = t.indexOf('if (!compte)');
  assert.ok(iClic > 0, 'l intention d envoi n est pas comptee');
  assert.ok(iGarde > 0, 'la garde du wallet a disparu');
  assert.ok(iClic < iGarde,
    'le clic est compte APRES la garde du wallet : tout geste sans wallet serait invisible');
  assert.match(t, /refus_wallet/, 'le refus sans wallet n est pas compte');
  assert.match(t, /refus_solde/, 'le refus faute de solde n est pas compte');
});

cas('⛔⛔ L ISSUE N EST COMPTEE QUE SUR UN ETAT CONNU', () => {
  /* ⛔⛔ TROIS ISSUES, JAMAIS DEUX. `EN_ATTENTE`, `ANNULE_SUR_CHAINE` et `ECHEC_ENVOI` ne prouvent
   *     ni le succes ni le refus : les ranger de force d un cote fabriquerait un taux faux. Ils
   *     restent NON COMPTES, comme `messageEnvoi` les laisse « incertains ». */
  /* ⛔⛔ MA PREMIERE VERSION PRENAIT UNE FENETRE DE ±400 CARACTERES et attrapait la table
   *     d AFFICHAGE juste en dessous, qui cite legitimement `EN_ATTENTE` et `ANNULE_SUR_CHAINE`
   *     comme LIBELLES. Elle confondait « le mot apparait a cote » et « cet etat est compte » —
   *     le meme travers qu une fenetre trop large a deja produit trois fois aujourd hui.
   *   ⇒ ON DECOUPE LE BLOC DE COMPTAGE, exactement, entre son debut et la table qui le suit. */
  /* 2026-10-09 : la table des libelles est partie dans MOTS_ISSUE_ENVOI (partagee avec le geste du panneau) ; le bloc de comptage
   *   finit maintenant au `catch` qui le ferme, juste avant la ligne d affichage. */
  const zone = trancheNue(brut, "if (r.etat === 'CONFIRME') { const s = etapeDuGeste",
    "e.className = 'note' + (r.etat === 'CONFIRME'", 'le bloc de comptage de l issue');
  assert.match(zone, /r\.etat === 'CONFIRME'/, 'le succes n est pas conditionne a CONFIRME');
  assert.match(zone, /REFUSE_PAR_UTILISATEUR/, 'le refus delibere n est pas distingue');
  assert.doesNotMatch(zone, /EN_ATTENTE|ANNULE_SUR_CHAINE/,
    'un etat incertain est compte comme une issue : le taux de reussite en serait fausse');
});

cas('⛔ LE GESTE EST RETENU, sinon les issues ne se rattachent a rien', () => {
  assert.match(html, /let gesteEnvoiCourant = 'send'/, 'le geste courant n est pas memorise');
  assert.match(html, /gesteEnvoiCourant = GESTES\.includes\(geste\)/,
    'le geste memorise n est pas valide contre la liste fermee : un geste inconnu s y glisserait');
});

console.log('✓ test-geste-envoi : ' + n + ' cas');
console.log('   GM, message et envoi simple se comptent SEPAREMENT a l intention et partagent leurs');
console.log('   issues. Dans quelques jours l entonnoir dira lequel tourne vraiment.');
console.log('   ⚠️ NE PROUVE PAS qu un visiteur les declenche, ni qu un envoi aboutisse on-chain.');
