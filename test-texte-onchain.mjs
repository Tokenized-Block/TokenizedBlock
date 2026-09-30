/* Ce que ce test tient, et le vrai cas qui l a rendu necessaire.
 *
 * Des blocks REELS de Base s affichaient « å°çç¶­å°¼ » : leurs octets lus en Latin-1, pas leurs
 * noms. ⚠️ EN ASCII PUR les deux decodages sont IDENTIQUES — donc tout test ecrit avec des
 * symboles latins serait passe au vert sur le code casse. Les cas non-ASCII sont ici les plus
 * importants, pas les plus exotiques.
 */
import {
  INVISIBLES, MAX_ECRAN, PART_REMPLACEMENT_MAX,
  decoderChaineAbi, decoderMotFixe, nettoyerPourEcran, symboleDepuisReponse,
} from './texte-onchain.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}

/* Construit une reponse ABI dynamique a partir d un vrai texte. */
const hexDe = (s) => [...new TextEncoder().encode(s)].map((o) => o.toString(16).padStart(2, '0')).join('');
function reponseAbi(s) {
  const d = hexDe(s);
  const n32 = (x) => BigInt(x).toString(16).padStart(64, '0');
  const octets = d.length / 2;
  const bourre = d + '0'.repeat((64 - (d.length % 64)) % 64);
  return '0x' + n32(32) + n32(octets) + bourre;
}
function reponseMotFixe(s) {
  const d = hexDe(s);
  return '0x' + (d + '0'.repeat(64 - d.length)).slice(0, 64);
}

console.log('decoderChaineAbi — le cas ASCII (ou le bug etait INVISIBLE)');
ok('un symbole latin passe', decoderChaineAbi(reponseAbi('TBLOCK')) === 'TBLOCK');
ok('un nom avec espace passe', decoderChaineAbi(reponseAbi('Tokenized Block')) === 'Tokenized Block');

console.log('decoderChaineAbi — LE CAS QUI PROUVE LA CORRECTION');
/* ⛔ 3 octets par caractere : un decodage octet-par-octet rendrait 9 caracteres de charabia. */
ok('le chinois revient INTACT (et pas en 9 caracteres)', (() => {
  const s = '小维尼';
  const r = decoderChaineAbi(reponseAbi(s));
  return r === s && [...r].length === 3;
})(), decoderChaineAbi(reponseAbi('小维尼')));
ok('les accents reviennent intacts', decoderChaineAbi(reponseAbi('Café')) === 'Café');
ok('un emoji (hors BMP) revient intact', (() => {
  const s = '🐸PEPE';
  return decoderChaineAbi(reponseAbi(s)) === s;
})(), decoderChaineAbi(reponseAbi('🐸PEPE')));
/* Temoin de non-regression du BUG : le Latin-1 aurait rendu ceci. */
ok('le resultat n est PAS la forme Latin-1 du meme texte', (() => {
  const s = '小维尼';
  const latin1 = [...new TextEncoder().encode(s)].map((o) => String.fromCharCode(o)).join('');
  return decoderChaineAbi(reponseAbi(s)) !== latin1 && latin1.length === 9;
})());

console.log('decoderChaineAbi — les refus (jamais de charabia rendu)');
ok('vide -> null', decoderChaineAbi('') === null);
ok('null -> null', decoderChaineAbi(null) === null);
ok('trop court -> null', decoderChaineAbi('0x1234') === null);
/* ⛔ UNE LONGUEUR ANNONCEE PLUS GRANDE QUE LES OCTETS EST UN MENSONGE : on refuse. */
ok('longueur annoncee > octets fournis -> null', (() => {
  const n32 = (x) => BigInt(x).toString(16).padStart(64, '0');
  return decoderChaineAbi('0x' + n32(32) + n32(99) + '41'.repeat(4)) === null;
})());
ok('longueur 0 -> null', (() => {
  const n32 = (x) => BigInt(x).toString(16).padStart(64, '0');
  return decoderChaineAbi('0x' + n32(32) + n32(0)) === null;
})());
ok('offset AUTRE que 32 -> null (on ne lit pas au hasard)', (() => {
  const n32 = (x) => BigInt(x).toString(16).padStart(64, '0');
  return decoderChaineAbi('0x' + n32(64) + n32(4) + '41414141'.padEnd(64, '0')) === null;
})());
ok('hexa illisible -> null', decoderChaineAbi('0x' + 'zz'.repeat(64)) === null);

console.log('decoderMotFixe — les vieux jetons bytes32');
ok('un mot fixe latin se lit', decoderMotFixe(reponseMotFixe('MKR')) === 'MKR');
ok('il s ARRETE au premier octet nul', decoderMotFixe(reponseMotFixe('AB')) === 'AB');
ok('un mot fixe non-ASCII revient intact', decoderMotFixe(reponseMotFixe('Café')) === 'Café');
ok('un mot tout nul -> null', decoderMotFixe('0x' + '00'.repeat(32)) === null);
ok('vide -> null', decoderMotFixe('') === null);

console.log('nettoyerPourEcran — on retire ce qui SE CACHE');
/* ⛔ L OVERRIDE BIDIRECTIONNEL : un nom qui se lit a l envers de ce qui est grave. */
ok('U+202E (override droite-a-gauche) est RETIRE', (() => {
  const r = nettoyerPourEcran('AB‮CD');
  return r === 'ABCD' && !/‮/.test(r);
})(), nettoyerPourEcran('AB‮CD'));
ok('U+202A..U+202D sont retires', nettoyerPourEcran('A‪B‫C‬D‭E') === 'ABCDE');
ok('les isolats U+2066..U+2069 sont retires', nettoyerPourEcran('A⁦B⁩C') === 'ABC');
ok('la largeur nulle U+200B est retiree', nettoyerPourEcran('A​B') === 'AB');
ok('le jointeur U+200D est retire', nettoyerPourEcran('A‍B') === 'AB');
ok('le BOM au milieu est retire', nettoyerPourEcran('A﻿B') === 'AB');
ok('les commandes C0 sont retirees', nettoyerPourEcran('A\u0001\u0007B') === 'AB');
ok('les commandes C1 sont retirees', nettoyerPourEcran('A\u0085B') === 'AB');

console.log('nettoyerPourEcran — on GARDE ce qui SE LIT');
/* ⛔ LE FILTRE D ORIGINE EFFACAIT TOUT CECI : le nom ne devenait pas faux, il devenait VIDE. */
ok('le chinois est GARDE', nettoyerPourEcran('小维尼') === '小维尼');
ok('les accents sont GARDES', nettoyerPourEcran('Café') === 'Café');
ok('le cyrillique est GARDE', nettoyerPourEcran('Привет') === 'Привет');
ok('un emoji est GARDE', nettoyerPourEcran('🐸') === '🐸');

console.log('nettoyerPourEcran — les vides et les coupes');
ok('non-chaine -> null', nettoyerPourEcran(42) === null);
ok('null -> null', nettoyerPourEcran(null) === null);
ok('chaine vide -> null', nettoyerPourEcran('') === null);
ok('QUE des invisibles -> null (rien de lisible)', nettoyerPourEcran('​‮﻿') === null);
ok('que des espaces -> null', nettoyerPourEcran('   ') === null);
ok('coupe a MAX_ECRAN', nettoyerPourEcran('A'.repeat(40)).length === MAX_ECRAN);
ok('max invalide -> null', nettoyerPourEcran('ABC', 0) === null);
/* ⛔ COUPER PAR POINTS DE CODE : une paire de substitution coupee en deux produirait un
 *   caractere de remplacement — on aurait repare le decodage pour le recasser a l ecran. */
ok('la coupe ne CASSE PAS une paire de substitution', (() => {
  const s = '🐸'.repeat(20);
  const r = nettoyerPourEcran(s, 3);
  return r === '🐸🐸🐸' && !/�/.test(r) && [...r].length === 3;
})(), nettoyerPourEcran('🐸'.repeat(20), 3));
ok('compte en POINTS DE CODE, pas en unites', [...nettoyerPourEcran('🐸'.repeat(20), 5)].length === 5);

console.log('nettoyerPourEcran — le charabia se refuse au lieu de s afficher');
ok('majorite de U+FFFD -> null', nettoyerPourEcran('���A') === null,
  nettoyerPourEcran('���A'));
ok('UN seul U+FFFD dans un texte lisible reste accepte',
  nettoyerPourEcran('ABCDEFGH�') === 'ABCDEFGH�');
ok('le seuil est une constante exportee', PART_REMPLACEMENT_MAX > 0 && PART_REMPLACEMENT_MAX < 1);
ok('les classes invisibles sont gelees', Object.isFrozen(INVISIBLES));

console.log('symboleDepuisReponse — le chemin complet');
ok('une reponse dynamique donne le symbole', symboleDepuisReponse(reponseAbi('TBLOCK')) === 'TBLOCK');
ok('une reponse bytes32 RETOMBE sur le mot fixe', symboleDepuisReponse(reponseMotFixe('MKR')) === 'MKR');
ok('non-ASCII de bout en bout', symboleDepuisReponse(reponseAbi('小维尼')) === '小维尼');
/* ⛔ Un override glisse dans un symbole ne doit pas atteindre l ecran. */
ok('un override dans un symbole est retire de bout en bout',
  symboleDepuisReponse(reponseAbi('AB‮CD')) === 'ABCD');
ok('une reponse vide -> null', symboleDepuisReponse('0x') === null);
ok('une reponse illisible -> null', symboleDepuisReponse('0x00') === null);
ok('coupe a la longueur demandee', symboleDepuisReponse(reponseAbi('ABCDEFGHIJKLMNOP'), 4) === 'ABCD');

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
