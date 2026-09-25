/* test-verdict-route-fiat.mjs — LA SONDE DE DEPLOIEMENT SE TROMPAIT DE CAMP.
 *
 * ⛔⛔ CE QUI S EST PASSE, 2026-09-25. `mesure-build-servi.mjs` posait `exitCode = 1` en voyant une
 *     URL Coinbase, parce qu elle avait ete ecrite AVANT que la cle CDP existe : a l epoque, une
 *     telle URL n aurait pas du pouvoir naitre. La cle est posee depuis le 2026-09-24 — cette URL
 *     est devenue la forme meme du succes. La sonde echouait donc a CHAQUE deploiement de l app,
 *     en annoncant un defaut qui etait une reussite.
 *     Une sonde qui hurle toujours n avertit plus jamais : on apprend a ignorer son code de sortie,
 *     et le jour ou elle a raison, plus personne n ecoute.
 *
 * ⛔ POURQUOI UN TEST ET PAS UNE RELECTURE : le verdict ne se voyait qu en production, apres un
 *   deploy — c est-a-dire au pire moment, et jamais deux fois. Il est maintenant une fonction pure,
 *   et ce fichier exerce ses QUATRE issues sur la MEME fonction que la sonde appelle. Pas une copie :
 *   une copie aurait divergé, et c est le defaut n°1 de ce depot (`canonical-helper-weaker-copy`).
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que le rail encaisse. Il juge un verdict, pas un paiement.
 *   Le montant encaisse reste 0 $, et aucune assertion ici ne le fait bouger.
 */
import { strict as assert } from 'node:assert';
import { verdictRouteFiat } from './mesure-build-servi.mjs';

let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* la vraie forme rendue par la production le 2026-09-25, jeton raccourci */
const REEL = '{"ok":true,"pret":true,"url":"https://pay.coinbase.com/buy/select-asset'
  + '?sessionToken=MWYxYjg5YzAtMTM5Ni02M2JjLTgwZTItZDY0YjkwMGFjNmQx&defaultNetwork=base"}';

v('⛔⛔ un sessionToken frais est un SUCCES, pas un defaut', () => {
  /* ⛔⛔ LE CAS QUI A FAIT ECHOUER LA SONDE. C est le seul vert du fichier. */
  const r = verdictRouteFiat(200, REEL);
  assert.equal(r.etat, 'RAIL_VIVANT');
  assert.equal(r.rouge, false, 'la sonde crie de nouveau au loup sur un succes');
});

v('⛔ le vert DIT ce qu il ne prouve pas', () => {
  /* ⛔ Un jeton accepte par Coinbase ne dit rien d un centime encaisse. Si cette phrase disparait,
   *   la sonde devient une publicite : elle annoncerait un rail qui fonctionne la ou elle n a vu
   *   qu une poignee de main. */
  const r = verdictRouteFiat(200, REEL);
  const tout = r.lignes.join(' ');
  assert.match(tout, /NE PROUVE PAS/, 'le vert ne borne plus ce qu il affirme');
  assert.match(tout, /0 \$/, 'le vert ne rappelle plus que le montant encaisse est nul');
});

v('⛔⛔ une URL SANS sessionToken est rouge', () => {
  /* ⛔⛔ Le piege inverse, et il est plausible : un JWT refuse, un repli, un champ vide, et l on
   *   rend une URL Coinbase qui ouvre une page incapable d aboutir. L hote ne prouve rien —
   *   c est le jeton qui porte la session. */
  const r = verdictRouteFiat(200, '{"ok":true,"url":"https://pay.coinbase.com/buy/select-asset"}');
  assert.equal(r.etat, 'URL_SANS_JETON');
  assert.equal(r.rouge, true, 'une URL Coinbase inutilisable passerait pour un rail vivant');
});

v('⛔ un jeton trop court ne suffit pas', () => {
  /* ⛔ `sessionToken=` suivi de rien, ou de trois caracteres, est un champ vide deguise. Le seuil
   *   n est pas cosmetique : sans lui, la garde ci-dessus se contournerait par un `sessionToken=x`. */
  const r = verdictRouteFiat(200, '{"url":"https://pay.coinbase.com/buy?sessionToken=&x=1"}');
  assert.equal(r.etat, 'URL_SANS_JETON', 'un sessionToken vide passe pour un jeton');
});

v('⛔⛔ reclamer la cle CDP est une REGRESSION, plus un etat attendu', () => {
  /* ⛔⛔ C etait le vert de septembre : « sans cle, pas de rail, c est normal ». La cle est posee —
   *   si la route la reclame de nouveau, quelque chose l a effacee ou le deploy est parti ailleurs.
   *   Le meme corps de reponse a change de camp, et c est exactement le piege que ce fichier garde. */
  const r = verdictRouteFiat(200, '{"ok":false,"pourquoi":"CDP_API_KEY_ID is missing"}');
  assert.equal(r.etat, 'CLE_DISPARUE');
  assert.equal(r.rouge, true, 'un rail fiat retombe mort passerait inapercu');
});

v('un 404 reste un build partiel', () => {
  /* ⛔ La page a jour et la route absente : deux choses differentes, et ce cas s est deja produit. */
  const r = verdictRouteFiat(404, 'Not found');
  assert.equal(r.etat, 'ROUTE_ABSENTE');
  assert.equal(r.rouge, true);
});

v('⛔ une reponse inconnue reste INCONNUE — ni vert ni rouge deguise', () => {
  /* ⛔ `neutral-return-swallows-failure` : le motif n°1 de ce depot. On ne veut pas qu un corps
   *   imprevu tombe dans le succes par defaut, ni qu il declenche une fausse alerte. Il se lit. */
  const r = verdictRouteFiat(200, '{"ok":true,"quelquechose":"de neuf"}');
  assert.equal(r.etat, 'INATTENDU');
  assert.equal(r.rouge, false, 'une reponse inconnue ferait echouer un deploiement sain');
  assert.match(r.lignes.join(' '), /aucune conclusion/, 'l issue inconnue ne se declare plus inconnue');
});

v('⛔ le 404 passe AVANT la lecture du corps', () => {
  /* ⛔ `comparator-needs-three-elements` : un 404 dont la page d erreur contiendrait le mot
   *   « CDP_API_KEY_ID » doit rester un build partiel. L ordre des branches est une decision,
   *   pas un hasard — et c est le cas du MILIEU qui la revele. */
  const r = verdictRouteFiat(404, 'Cannot GET /api/onramp/session — CDP_API_KEY_ID');
  assert.equal(r.etat, 'ROUTE_ABSENTE', 'un build partiel serait pris pour une cle disparue');
});

v('importer la sonde ne lance PAS la sonde', () => {
  /* ⛔⛔ Si le corps de sonde tournait a l import, ce fichier declencherait vingt requetes reseau et
   *   heriterait de son `exitCode` — un test qui echoue pour une raison qui n est pas la sienne.
   *   Preuve : on est arrive ici, et process.exitCode n a pas ete touche par l import. */
  assert.ok(process.exitCode === undefined || process.exitCode === 0,
    'l import de la sonde a pose un exitCode : son corps a tourne');
});

assert.equal(n, 9, 'compte de cas inattendu : ' + n);
console.log('ok verdict-route-fiat — ' + n + ' cas : le succes est vert, l URL creuse est rouge,');
console.log('   la cle disparue est une regression, et l inconnu reste inconnu.');
console.log('⚠️ NE PROUVE PAS que le rail encaisse : ce fichier juge un verdict, pas un paiement.');
