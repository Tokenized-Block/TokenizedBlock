// test-photo-gravee.mjs — UNE IMAGE GRAVEE NE SE RETIRE JAMAIS. CE QUI Y ENTRE EST DONC FERME.
//
// ⛔⛔ CE QUI MANQUAIT AVANT LE 2026-09-22 : `face.js` ne connaissait AUCUN champ `photo`. Une image
//     posee sur une face de cube etait donc LOCALE et PERDUE — le block ne la gravait jamais, et
//     rien ne le disait. L utilisateur croyait avoir tokenise son image ; il avait decore un
//     navigateur.
//
// ⛔ CE QUE LE PLAFOND COUTE, MESURE SUR LA VRAIE CHAINE (eth_estimateGas, 0,006 gwei) :
//       sans image          374 376 gas
//       ~1 Ko de base64   1 399 998 gas   (+$0,017)
//       ~4 Ko             4 318 079 gas   (+$0,065)
//       ~16 Ko           15 990 403 gas   (+$0,256)
//     Seize kilo-octets demandent SEIZE MILLIONS de gas. Le plafond de 4 Ko n est donc pas une
//     precaution, c est une mesure — et ce test existe pour qu on ne le remonte pas sans refaire
//     la mesure.
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

/* ══ 1. LA COMPATIBILITE D ABORD — c est ce qui casserait le plus de monde ═══════════════════
 * ⛔ Toute face gravee AVANT aujourd hui n a pas de champ `photo`. Si elle devenait invalide, des
 *    blocks deja nes cesseraient d etre lisibles, et rien ne pourrait les reparer. */
eq(validerFace(BASE).etat, 'OK', 'une face SANS photo reste valide — les blocks deja graves d abord');
ok(validerFace(BASE).face.photo === undefined,
  'et elle ne se voit pas attribuer une photo vide, qui changerait son dessin');

/* ══ 2. CE QUI EST ACCEPTE ══════════════════════════════════════════════════════════════════ */
const bon = validerFace({ ...BASE, photo: png(200) });
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
  const r = validerFace({ ...BASE, photo: valeur });
  eq(r.etat, 'INVALIDE', 'REFUSE : ' + pourquoi + ' — valeur : ' + JSON.stringify(valeur).slice(0, 48));
}
for (const mauvaisType of [42, true, null, {}, []]) {
  eq(validerFace({ ...BASE, photo: mauvaisType }).etat, 'INVALIDE',
    'un ' + (mauvaisType === null ? 'null' : typeof mauvaisType) + ' n est pas une image');
}

/* ══ 4. LE PLAFOND EST EXACT, PAS APPROXIMATIF ══════════════════════════════════════════════
 * ⛔ On teste LES DEUX COTES de la borne. Un plafond teste d un seul cote peut etre decale d un
 *    caractere sans que rien ne le dise — et le prochain a le lire croirait qu il vaut autre chose. */
eq(PHOTO_MAX, 4096, 'le plafond vaut 4096 caracteres — le chiffre MESURE, pas un chiffre rond choisi');
const pile = 'data:image/png;base64,' + 'A'.repeat(PHOTO_MAX - 'data:image/png;base64,'.length);
eq(pile.length, PHOTO_MAX, 'temoin de construction : la chaine fait exactement le plafond');
eq(validerFace({ ...BASE, photo: pile }).etat, 'OK', 'exactement au plafond : accepte');
eq(validerFace({ ...BASE, photo: pile + 'A' }).etat, 'INVALIDE', 'un caractere au-dessus : refuse');

/* ══ 5. LE TEMOIN — sans lui, un validateur qui dirait OUI a tout passerait aussi ════════════ */
{
  const r = validerFace({ ...BASE, photo: png(PHOTO_MAX * 2) });
  eq(r.etat, 'INVALIDE', 'temoin : une image deux fois trop grosse EST refusee');
  ok(/over the 4096 cap/.test(r.pourquoi),
    'et le refus dit le plafond, pour que celui qui le lit sache quoi corriger');
}

console.log('test-photo-gravee : ' + n + ' assertions, plafond ' + PHOTO_MAX + ' caracteres, OK');
