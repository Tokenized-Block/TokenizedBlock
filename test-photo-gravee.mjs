// test-photo-gravee.mjs — UNE IMAGE GRAVEE NE SE RETIRE JAMAIS. CE QUI Y ENTRE EST DONC FERME.
//
// ⛔⛔ CE QUI MANQUAIT AVANT LE 2026-09-22 : `face.js` ne connaissait AUCUN champ `photo`. Une image
//     posee sur une face de cube etait donc LOCALE et PERDUE — le block ne la gravait jamais, et
//     rien ne le disait. L utilisateur croyait avoir tokenise son image ; il avait decore un
//     navigateur.
//
// ⛔ CE QUE L IMAGE COUTE, MESURE SUR LA VRAIE CHAINE (eth_estimateGas, 0,006 gwei, 2026-09-22) :
//       sans image          374 376 gas
//       ~1 Ko de base64   1 399 998 gas   (+$0,017)
//       ~4 Ko             4 318 079 gas   (+$0,065)
//       ~16 Ko           15 990 403 gas   (+$0,256)
//
// ⛔⛔ ET LE PLAFOND NE VIENT PAS DE CETTE MESURE-LA, mais de `photo.js`, qui avait deja trouve le
//     MUR : 12 Ko de fichier passent, 13 Ko sont REFUSES par le precompile B20 — et le refus
//     persiste en offrant cent millions de gas. Ce n est donc pas un plafond d estimation, c est
//     une limite intrinseque, et aucun reglage cote app ne la deplacera.
//     J avais d abord ecrit un `PHOTO_MAX = 4096` de mon cru dans `face.js`, en ignorant celui qui
//     existait. Il aurait plafonne les images au cinquieme de ce que la chaine accepte. Le nombre
//     est desormais IMPORTE de `photo.js`, jamais recopie.
//
// ⛔ CE QUE CE FICHIER NE PEUT PAS FAIRE : verifier que les octets sont vraiment un PNG valide. Il
//    verifie la FORME de l URI et sa taille. Un base64 bien forme mais corrompu passerait — c est
//    la borne, et elle est dite.
import assert from 'node:assert/strict';
import { validerFace, PHOTO_MAX, FACETTES_CREATE } from './face.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const BASE = {
  teinte: 265, accent: 300, saturation: 95, division: 3, eclats: 3, ecart: 2,
  orbite: 'sillage', facette: FACETTES_CREATE[0], matiere: 'plein', ornement: 'aucun',
};
const png = (n) => 'data:image/png;base64,' + 'A'.repeat(n);
/* ⛔⛔ UNE PHOTO SANS `photoOu` EST DESORMAIS INVALIDE, et ce test l a signale des que la regle
 *     est entree — c est exactement son travail. La raison est structurelle : sans savoir SUR
 *     QUELLE FACE l image est posee, la meme face gravee se dessinerait differemment selon le
 *     defaut de la version qui la lit. C est le bug du 2026-09-12 (« l image ne reste pas, elle
 *     change ») qui reviendrait par une autre porte. Les cas ci-dessous passent donc les DEUX. */
const avecOu = (p, ou = 'haut') => ({ photo: p, photoOu: ou });

/* ══ 1. LA COMPATIBILITE D ABORD — c est ce qui casserait le plus de monde ═══════════════════
 * ⛔ Toute face gravee AVANT aujourd hui n a pas de champ `photo`. Si elle devenait invalide, des
 *    blocks deja nes cesseraient d etre lisibles, et rien ne pourrait les reparer. */
eq(validerFace(BASE).etat, 'OK', 'une face SANS photo reste valide — les blocks deja graves d abord');
ok(validerFace(BASE).face.photo === undefined,
  'et elle ne se voit pas attribuer une photo vide, qui changerait son dessin');

/* ══ 2. CE QUI EST ACCEPTE ══════════════════════════════════════════════════════════════════ */
const bon = validerFace({ ...BASE, ...avecOu(png(200)) });
eq(bon.etat, 'OK', 'un PNG inline de taille raisonnable est accepte');
eq(bon.face.photo, png(200), 'et il est rendu tel quel, sans reecriture');

/* ══ 3. CE QUI EST REFUSE, ET POURQUOI — chaque refus porte sa raison ═══════════════════════ */
const refus = [
  ['https://exemple.com/a.png', 'une URL distante peut changer de contenu ou mourir : la face ne '
    + 'serait plus la face, et personne ne pourrait la corriger'],
  ['data:image/svg+xml;base64,QQ==', 'un SVG peut porter du script et des references externes — '
    + 'dans une image irretirable, c est la seule erreur non corrigeable'],
  ['ipfs://Qm123', 'un CID depend d une passerelle tierce pour etre lu'],
  ['data:image/png;base64,<script>alert(1)</script>', 'du base64 invalide n est pas du base64'],
  ['data:image/jpeg;base64,QQ==', 'un seul format accepte, pour que le rendu soit previsible'],
  ['', 'une chaine vide n est pas une image'],
];
for (const [valeur, pourquoi] of refus) {
  const r = validerFace({ ...BASE, ...avecOu(valeur) });
  eq(r.etat, 'INVALIDE', 'REFUSE : ' + pourquoi + ' — valeur : ' + JSON.stringify(valeur).slice(0, 48));
}
for (const mauvaisType of [42, true, null, {}, []]) {
  eq(validerFace({ ...BASE, ...avecOu(mauvaisType) }).etat, 'INVALIDE',
    'un ' + (mauvaisType === null ? 'null' : typeof mauvaisType) + ' n est pas une image');
}

/* ══ 4. LE PLAFOND EST EXACT, PAS APPROXIMATIF ══════════════════════════════════════════════
 * ⛔ On teste LES DEUX COTES de la borne. Un plafond teste d un seul cote peut etre decale d un
 *    caractere sans que rien ne le dise — et le prochain a le lire croirait qu il vaut autre chose. */
/* ⛔⛔ CETTE ASSERTION A DIT 4096 PENDANT UNE HEURE, ET ELLE AVAIT RAISON DE ROUGIR ENSUITE.
 *     J avais defini dans `face.js` un `PHOTO_MAX = 4096` de mon cru, en ignorant que `photo.js`
 *     portait deja LE plafond du projet — mesure plus finement, jusqu au mur exact :
 *       12 Ko de fichier passent (15 921 140 gas), 13 Ko sont REFUSES par le precompile B20, et le
 *       refus persiste en offrant cent millions de gas. Ce n est pas une estimation, c est un mur.
 *     Deux constantes du meme nom dans la meme app : la plus faible aurait gagne dans `validerFace`,
 *     et les images auraient ete plafonnees au cinquieme de ce que la chaine accepte.
 * ⛔ Le nombre est donc importe, plus jamais recopie — et il est verifie ici POUR QU UNE BAISSE
 *    SILENCIEUSE soit impossible : si quelqu un le change, ce test l oblige a venir lire la mesure. */
eq(PHOTO_MAX, 19257,
  'le plafond est celui de photo.js (19257), derive du mur mesure — jamais un chiffre local');
const pile = 'data:image/png;base64,' + 'A'.repeat(PHOTO_MAX - 'data:image/png;base64,'.length);
eq(pile.length, PHOTO_MAX, 'temoin de construction : la chaine fait exactement le plafond');
eq(validerFace({ ...BASE, ...avecOu(pile) }).etat, 'OK', 'exactement au plafond : accepte');
eq(validerFace({ ...BASE, ...avecOu(pile + 'A') }).etat, 'INVALIDE', 'un caractere au-dessus : refuse');

/* ══ 5. LE TEMOIN — sans lui, un validateur qui dirait OUI a tout passerait aussi ════════════ */
{
  const r = validerFace({ ...BASE, ...avecOu(png(PHOTO_MAX * 2)) });
  eq(r.etat, 'INVALIDE', 'temoin : une image deux fois trop grosse EST refusee');
  ok(new RegExp('over the ' + PHOTO_MAX + ' cap').test(r.pourquoi),
    'et le refus dit le plafond, pour que celui qui le lit sache quoi corriger');
}

/* ══ 6. SUR QUELLE FACE — les deux champs vont ENSEMBLE ═════════════════════════════ */
for (const ou of ['aucune', 'haut', 'gauche', 'droite']) {
  eq(validerFace({ ...BASE, photo: png(100), photoOu: ou }).etat, 'OK',
    'photoOu = ' + ou + ' est accepte — `aucune` compris : une image peut voyager dans les '
    + 'metadonnees sans etre posee sur le cube');
}
eq(validerFace({ ...BASE, photo: png(100) }).etat, 'INVALIDE',
  'une photo SANS photoOu est refusee — sinon la meme face se dessinerait ailleurs selon le lecteur');
eq(validerFace({ ...BASE, photo: png(100), photoOu: 'arriere' }).etat, 'INVALIDE',
  'une face qui n existe pas est refusee, pas silencieusement ramenee a un defaut');
eq(validerFace({ ...BASE, photoOu: 'haut' }).etat, 'INVALIDE',
  'un photoOu SANS photo est refuse : il annonce une image a un lecteur qui n en trouvera pas');
{
  const r = validerFace({ ...BASE, photo: png(100), photoOu: 'gauche' });
  eq(r.face.photoOu, 'gauche', 'et la face rendue porte bien la position, pour etre gravee avec');
}

console.log('test-photo-gravee : ' + n + ' assertions, plafond ' + PHOTO_MAX + ' caracteres, OK');
