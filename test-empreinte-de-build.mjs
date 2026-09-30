/* test-empreinte-de-build.mjs — UNE EMPREINTE QU ON NE PEUT PAS LIRE AVEUGLE LA SONDE.
 *
 * ⛔⛔⛔ POURQUOI CE FICHIER EXISTE. Le 2026-09-30 j ai estampille un build
 *   `20260930-famille-exigee-directes-filtrees` — 41 caracteres. La regex du serveur plafonne a 40 :
 *       serveur-web.js  /data-build="([0-9A-Za-z_-]{6,40})"/
 *   Elle n a donc PAS matche, `/sante` a rendu `"build": null`, et j ai verifie un deploiement
 *   contre `null` sans m en apercevoir tout de suite. Une empreinte ILLISIBLE aveugle la sonde de
 *   deploiement EXACTEMENT comme une empreinte REUTILISEE : dans les deux cas on ne sait plus si
 *   ce qui tourne en prod est ce qu on a pousse.
 *   ⛔ ET CA NE FAIT PLANTER RIEN. Aucune erreur, aucune page cassee : juste un `null` la ou on
 *     attend une preuve. C est le genre de defaut qu on ne trouve qu en LISANT la reponse.
 *
 * ⛔ CE QUE CE TEST NE FAIT PAS : il ne verifie pas que l empreinte a CHANGE depuis le dernier
 *   deploiement — ca demanderait un etat que ce depot ne garde pas. Il verifie qu elle est
 *   LISIBLE. Reutiliser une empreinte identique reste possible, et reste interdit.
 */
import { readFileSync } from 'node:fs';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');

/* ⛔ LA REGLE SE LIT DANS LE SERVEUR, ELLE NE SE RECOPIE PAS ICI. Une borne ecrite en double
 *   divergerait le jour ou l une des deux bouge — et ce test deviendrait un faux temoin. */
const mBorne = /data-build="\(\[0-9A-Za-z_-\]\{(\d+),(\d+)\}\)"/.exec(srv);
ok('la borne du serveur est lisible dans son code', !!mBorne, mBorne && mBorne[0]);
if (!mBorne) { console.log(''); console.log(n + ' assertions, ' + ko + ' KO'); process.exit(1); }
const MIN = Number(mBorne[1]), MAX = Number(mBorne[2]);
console.log('  borne LUE dans serveur-web.js : ' + MIN + '..' + MAX + ' caracteres');

/* L attribut tel qu il est ecrit dans la page — hors commentaires HTML, qui citent la faute. */
const htmlNu = html.replace(/<!--[\s\S]*?-->/g, ' ');
const mAttr = /data-build="([^"]*)"/.exec(htmlNu);
ok('app.html porte un attribut data-build', !!mAttr);
const emp = mAttr ? mAttr[1] : '';
console.log('  empreinte : "' + emp + '"  (' + emp.length + ' caracteres)');

ok('⛔ elle ne depasse PAS la borne du serveur', emp.length <= MAX, emp.length + ' > ' + MAX);
ok('⛔ elle atteint le minimum', emp.length >= MIN, emp.length + ' < ' + MIN);
ok('⛔ elle ne contient QUE des caracteres que la regex accepte',
  /^[0-9A-Za-z_-]+$/.test(emp), emp);
/* ⛔ LA VRAIE ASSERTION : rejouer la regex DU SERVEUR sur le fichier SERVI. Tester la longueur ne
 *   suffit pas — un caractere hors classe passerait les bornes et casserait quand meme le match. */
const rejeu = new RegExp('data-build="([0-9A-Za-z_-]{' + MIN + ',' + MAX + '})"').exec(htmlNu);
ok('⛔⛔ la regex DU SERVEUR matche reellement sur app.html', !!rejeu, 'aucun match');
ok('et elle en extrait exactement notre empreinte', rejeu && rejeu[1] === emp,
  rejeu ? rejeu[1] : null);

/* ⛔ LE TEXTE VISIBLE DOIT DIRE LA MEME CHOSE QUE L ATTRIBUT. Deux empreintes differentes sur le
 *   meme ecran, et on ne sait plus laquelle croire. */
const mCode = /data-build="[^"]*"[^>]*>Build <code>([^<]*)<\/code>/.exec(htmlNu);
ok('le texte affiche porte la MEME empreinte que l attribut',
  mCode && mCode[1] === emp, mCode ? mCode[1] : 'non trouve');

console.log('');
console.log('⛔ LES TEMOINS : ce test sait-il voir une empreinte trop longue ?');
/* ⛔⛔ SANS CES TEMOINS, un `htmlNu` vide ou une regex cassee rendrait tout vert pour la mauvaise
 *   raison. On rejoue la faute REELLE de ce soir et on verifie qu elle est bien REFUSEE. */
const FAUTIVE = '20260930-famille-exigee-directes-filtrees';
ok('la faute reelle de ce soir faisait bien 41 caracteres', FAUTIVE.length === 41, FAUTIVE.length);
ok('⛔ et la regex du serveur la REFUSE',
  !new RegExp('data-build="([0-9A-Za-z_-]{' + MIN + ',' + MAX + '})"')
    .test('data-build="' + FAUTIVE + '"'));
ok('✅ alors qu elle accepte celle qu on a mise',
  new RegExp('data-build="([0-9A-Za-z_-]{' + MIN + ',' + MAX + '})"')
    .test('data-build="' + emp + '"'));
/* ⛔ TEMOIN NEGATIF FRANC : un caractere hors classe doit etre refuse meme a bonne longueur. */
ok('⛔ un point dans l empreinte serait refuse',
  !new RegExp('data-build="([0-9A-Za-z_-]{' + MIN + ',' + MAX + '})"')
    .test('data-build="20260930.famille"'));
ok('le depouillage n a pas vide app.html', htmlNu.length > 200000, htmlNu.length);

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
