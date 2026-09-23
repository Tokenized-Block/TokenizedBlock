// test-tweet-grave.mjs — UN LIEN GRAVE NE SE RETIRE JAMAIS. CE QUI Y ENTRE EST DONC FERME.
//
// ⛔⛔ CE QUI SERAIT LE PIRE DEFAUT ICI : laisser croire qu on a VERIFIE quelque chose. Le module
//     n appelle personne — c est tout l interet de l idee de Phil (« sans besoin d api ») — donc il
//     ne sait ni si le post existe, ni qui l a ecrit. Graver une reference en la presentant comme
//     une preuve mentirait a tous les lecteurs du block a la fois, et le lien est permanent.
//
// ⛔ CHAQUE CAS CONSTRUIT SON ENTREE A LA MAIN. Un test qui fabriquerait ses liens depuis le module
//    teste ne prouverait que sa propre coherence.
import assert from 'node:assert/strict';
import { lireLienX, phraseTweet, ETATS_TWEET, LIEN_MAX } from './tweet-grave.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

/* ══ 1. LA SECURITE AVANT LE CONFORT ═════════════════════════════════════════════════════════
 * ⛔ Un lien grave peut etre CLIQUE par n importe qui, pour toujours. `new URL()` accepte
 *    `javascript:` et `data:` sans broncher : le protocole doit etre verifie explicitement. */
/* ⛔⛔ LES TROIS PREMIERS CAS NE SUFFISAIENT PAS, ET UNE MUTATION L A MONTRE. En retirant le
 *     controle de PROTOCOLE du module, le test restait VERT : `javascript:alert(1)` a un hostname
 *     vide, donc le controle d HOTE l attrapait de toute facon. La garde de protocole ne gardait
 *     rien de ce qui etait teste.
 *     ⇒ `javascript://x.com/jack/status/20` a pour hostname `x.com`. Il PASSE le controle d hote,
 *       il a la bonne forme de chemin — et sans le controle de protocole il serait grave, donc
 *       clicable a vie dans le contractURI de quelqu un.
 *     C est le cas qui rend la garde de protocole necessaire, et il manquait. */
for (const mauvais of [
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'javascript:void(fetch("https://exemple"))',
  'javascript://x.com/jack/status/20',
  'data://x.com/jack/status/20',
  'vbscript://x.com/jack/status/20',
]) {
  const r = lireLienX(mauvais);
  ok(r.etat !== 'OK', '⛔ REFUSE, et c est le cas qui compte le plus : ' + mauvais.slice(0, 34)
    + ' — un lien grave est clicable a vie');
  eq(r.canonique, null, 'et rien de gravable n en sort');
}

/* ══ 2. CE QUI EST ACCEPTE, ET LA NORMALISATION ══════════════════════════════════════════════
 * ⛔ DEUX LIENS DU MEME POST DOIVENT DONNER LA MEME GRAVURE. Sinon le meme post produirait deux
 *    blocks differents selon qui a copie le lien — et les parametres `?s=20&t=…` sont des
 *    identifiants de PARTAGE : ils changent d une personne a l autre. */
const ATTENDU = 'https://x.com/jack/status/20';
for (const variante of [
  'https://x.com/jack/status/20',
  'https://twitter.com/jack/status/20',
  'https://mobile.twitter.com/jack/status/20',
  'https://www.x.com/jack/status/20',
  'https://x.com/jack/status/20?s=20&t=abcdef',
  'https://x.com/jack/status/20/',
  'x.com/jack/status/20',
  '  https://x.com/jack/status/20  ',
  'https://x.com/jack/statuses/20',
]) {
  const r = lireLienX(variante);
  eq(r.etat, 'OK', 'accepte : ' + variante.trim());
  eq(r.canonique, ATTENDU, '⇒ et TOUTES ces formes donnent la MEME gravure — sinon le meme post '
    + 'ferait deux blocks : ' + variante.trim());
}
{
  const r = lireLienX('https://x.com/jack/status/20?s=20&t=abcdef');
  ok(!/[?&]/.test(r.canonique),
    '⛔ les parametres de partage ne sont PAS graves : ils identifient QUI a partage, pas le post');
}

/* ══ 3. TROIS REFUS DIFFERENTS, TROIS MESSAGES DIFFERENTS ════════════════════════════════════
 * ⛔ Un booleen unique ferait dire « lien invalide » a quelqu un qui a colle son PROFIL. Il
 *    chercherait la faute dans le lien au lieu de chercher un post. */
const REFUS = [
  ['', 'VIDE'],
  ['   ', 'VIDE'],
  ['pas une url du tout !!', 'PAS_UNE_URL'],
  ['https://facebook.com/jack/status/20', 'PAS_X'],
  ['https://x-fake.com/jack/status/20', 'PAS_X'],
  ['https://x.com/jack', 'PAS_UN_POST'],
  ['https://x.com/search?q=base', 'PAS_UN_POST'],
  ['https://x.com/jack/status/abc', 'PAS_UN_POST'],
  ['https://x.com/jack/status/', 'PAS_UN_POST'],
  ['https://x.com/jack/status/12/extra', 'PAS_UN_POST'],
];
/* ⛔⛔ « https://x.com/jack/status/123 » A ETE RETIRE DE CETTE LISTE, ET C EST LE MODULE QUI AVAIT
 *     TORT. Il exigeait au moins 5 chiffres, « parce qu un identifiant est long ». Or le tout
 *     PREMIER post de la plateforme porte l identifiant `20` : la regle rejetait des posts
 *     authentiques, et leur auteur aurait cherche la faute dans son lien.
 *     ⇒ Une borne inventee par intuition sur la forme d une donnee qu on ne controle pas se
 *       retourne contre les cas reels. Le test a attrape ca avant l utilisateur. */
eq(lireLienX('https://x.com/jack/status/20').etat, 'OK',
  'un identifiant COURT est valide — le premier post de la plateforme porte l identifiant 20');
for (const [lien, attendu] of REFUS) {
  const r = lireLienX(lien);
  eq(r.etat, attendu, '« ' + (lien || '(vide)').slice(0, 42) + ' » ⇒ ' + attendu);
  ok(ETATS_TWEET.includes(r.etat), 'et l etat est dans la liste declaree');
}
/* ⛔ UN HOTE QUI *CONTIENT* « x.com » N EST PAS x.com. `x-fake.com` et `evil.com/x.com` doivent
 *    tomber — une comparaison par `includes` les laisserait passer. */
for (const usurpation of ['https://notx.com/jack/status/20', 'https://x.com.evil.net/jack/status/20',
  'https://evil.net/x.com/jack/status/20']) {
  eq(lireLienX(usurpation).etat !== 'OK', true, '⛔ usurpation d hote refusee : ' + usurpation.slice(0, 40));
}

/* ══ 4. CE QUE LA PHRASE N A PAS LE DROIT DE DIRE ════════════════════════════════════════════
 * ⛔⛔ LE MODULE N APPELLE PERSONNE. Il ne sait pas si le post existe ni a qui il est. Toute phrase
 *     qui suggere une verification est un mensonge, et il part dans le contractURI. */
{
  const bon = lireLienX('https://x.com/jack/status/20');
  const p = phraseTweet(bon);
  ok(p, 'un lien valide produit bien une phrase');
  ok(!/verified|verify|owned|proof|authentic|confirmed/i.test(p),
    '⛔ AUCUNE promesse de verification : on n a ouvert aucun lien — « ' + p.slice(0, 70) + ' »');
  ok(/did not open|does not|not check|nothing here checks/i.test(p),
    'et la phrase dit EXPLICITEMENT ce qu on n a pas fait');
  ok(/cannot be changed|permanent|forever/i.test(p),
    'et elle rappelle que c est definitif — parce que ca l est');
  ok(p.includes('20') && p.includes('jack'),
    'elle nomme le post et le compte, pour que le lecteur reconnaisse ce qu il grave');
}
eq(phraseTweet(null), null, 'aucune entree ⇒ aucune phrase fabriquee');
{
  const r = lireLienX('https://x.com/jack');
  const p = phraseTweet(r);
  ok(p && /not a link to a post/i.test(p), 'un refus explique QUOI corriger : « ' + p + ' »');
}

/* ══ 5. LA BORNE DE TAILLE EST DERIVEE DE LA FORME, PAS RONDE ════════════════════════════════
 * ⛔ Le lien part dans le contractURI, qui est plafonne par le precompile B20. Un lien canonique
 *    ne peut pas depasser `https://x.com/` + 15 + `/status/` + 25 = 63 caracteres. */
{
  const max = 'https://x.com/' + 'a'.repeat(15) + '/status/' + '9'.repeat(25);
  eq(max.length, 62, 'temoin de construction : le plus long lien canonique possible fait 62 caracteres');
  ok(LIEN_MAX >= max.length, 'la borne (' + LIEN_MAX + ') couvre le pire cas (' + max.length + ')');
  ok(LIEN_MAX < 256, 'et elle reste petite : chaque octet grave se paie au precompile');
  const r = lireLienX(max);
  eq(r.etat, 'OK', 'et ce pire cas est bien accepte');
  ok(r.canonique.length <= LIEN_MAX, 'sa gravure tient dans la borne');
}

/* ══ 6. LES ENTREES DEGENEREES NE JETTENT PAS ════════════════════════════════════════════════ */
for (const mauvais of [null, undefined, 42, {}, [], true]) {
  const r = lireLienX(mauvais);
  ok(ETATS_TWEET.includes(r.etat), 'un ' + typeof mauvais + ' rend un etat nomme, sans exception');
  eq(r.canonique, null, 'et rien de gravable');
}

/* ══ 7. LE TEMOIN — sans lui, une fonction qui refuserait TOUT passerait la section 3 ════════ */
{
  const oui = ['https://x.com/a/status/12345', 'https://twitter.com/BASE/status/1234567890123456789'];
  const non = ['https://x.com/a', '', 'javascript:1'];
  eq(oui.filter((l) => lireLienX(l).etat === 'OK').length, 2, 'temoin : les deux liens valides SONT acceptes');
  eq(non.filter((l) => lireLienX(l).etat === 'OK').length, 0, 'temoin : et les trois autres sont refuses');
  ok(new Set([...oui, ...non].map((l) => lireLienX(l).etat)).size >= 3,
    'temoin : au moins trois etats distincts sont atteints — une fonction a une seule reponse '
    + 'passerait les assertions une par une sans rien distinguer');
}

console.log('test-tweet-grave : ' + n + ' assertions, OK');
