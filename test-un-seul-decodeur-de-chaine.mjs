/* LA GARDE QUI ETAIT REVENDIQUEE MAIS N EXISTAIT PAS.
 *
 * `index-blocks.js` annonce : « La regle 12 de verifie-coherence.mjs interdit qu un troisieme
 * [decodeur] apparaisse. » ⛔ CE FICHIER N EXISTE NULLE PART dans l arbre — cherche sur tout
 * `veilleIA` le 2026-09-30, introuvable. La regle etait donc une PHRASE, pas un garde-fou :
 * exactement `presence-dun-nom-nest-pas-son-usage`. Ce test la rend reelle.
 *
 * CE QU ELLE PROTEGE : un `String.fromCharCode` par octet decode du LATIN-1. Un `string`
 * Solidity est de l UTF-8, ou un caractere chinois pese TROIS octets. Des blocks REELS de Base
 * s affichaient « å°çç¶­å°¼ » dans la galerie — leurs octets, pas leurs noms.
 * ⚠️ ET EN ASCII PUR LES DEUX CHEMINS SONT IDENTIQUES : c est pour ca que le defaut a survecu
 *    a tous les essais. Un test de comportement sur des noms ASCII ne l aurait jamais vu ;
 *    seule une garde STRUCTURELLE l attrape.
 */
import { readFileSync, readdirSync } from 'node:fs';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}

/* Les fichiers du produit — pas les tests, pas les bancs, pas les mesures. */
/* 2026-10-04 : le paquet TIERS embarque (`mcp-ext-apps-2.0.3.bundle.js`, verifie par son sha256 au demarrage du serveur) n est pas
 *   du code du produit : il ne decode aucun texte lu sur la chaine, et on ne le modifie pas. La sonde le signalait (1 site, « fichier
 *   non gele ») depuis son arrivee — ROUGE que je n avais pas vu, faute d avoir relance la serie complete apres l avoir embarque. */
const tous = readdirSync('.').filter((f) => /\.(js|html)$/.test(f)
  && !/^test-/.test(f) && !/^banc-/.test(f) && !/^mesure-/.test(f) && !/^verifie-/.test(f) && !/^mcp-ext-apps-.*\.bundle\.js$/.test(f));

/* ⛔⛔ MON PREMIER JET DE CE TEST FAISAIT LA FAUTE QU IL DENONCE : il comptait les MENTIONS
 *   de `String.fromCharCode`, donc aussi les COMMENTAIRES qui expliquent le bug, et il
 *   comptait comme defaut le `btoa(String.fromCharCode(...new TextEncoder().encode(s)))`
 *   d index.html, qui est un ENCODAGE base64 correct. `presence-dun-nom-nest-pas-son-usage`,
 *   applique a ma propre sonde. On vise donc le MOTIF DU DEFAUT :
 *     un octet lu en hexa (`parseInt(..., 16)`) transforme en caractere.
 *   C est exactement ca qui rend du LATIN-1 ; le reste ne decode rien.
 */
function sitesDeDecodageNaif(src) {
  const lignes = String(src).split('\n');
  const sites = [];
  for (let i = 0; i < lignes.length; i += 1) {
    const l = lignes[i];
    /* Les lignes de commentaire ne decodent rien. */
    const nue = l.trim();
    if (nue.startsWith('*') || nue.startsWith('//') || nue.startsWith('/*') || nue.startsWith('<!--')) continue;
    if (!/String\.fromCharCode/.test(l)) continue;
    /* L ENCODAGE base64 est correct et ne doit pas compter. */
    if (/TextEncoder/.test(l)) continue;
    /* Le defaut : un octet hexa devenu caractere, sur cette ligne ou juste avant. */
    const voisin = (lignes[i - 1] || '') + l;
    /* ⛔ `[^)]*` NE TRAVERSE PAS une parenthese interne : sur
     *   `parseInt(b.slice(a, b), 16)` il echouait, et ma sonde ne voyait plus que 1 site
     *   sur 3. Une sonde trop stricte rend un « c est propre » aussi faux qu une trop large. */
    if (/parseInt\s*\(.*,\s*16\s*\)/.test(voisin) || /fromCharCode\(\s*c\s*\)/.test(l)) {
      sites.push(i + 1);
    }
  }
  return sites;
}

/* LES SITES CONNUS, MESURES le 2026-09-30 — et leur nombre est GELE. Un quatrieme fait
 * echouer ce test, ce qui est tout son objet.
 * ⛔ Ces trois-la existaient AVANT ce test ; il les constate, il ne les absout pas. */
const SITES_GELES = new Map([
  /* ⛔⛔ C ETAIT 3, C EST MAINTENANT 0 — les trois ont ete REPARES le 2026-09-30, pas geles.
   *   Deux vivaient dans `texteAbi` (chaine dynamique + mot fixe bytes32), le troisieme dans la
   *   liste des blocks qu on DETIENT, c est-a-dire precisement la ou le nom d un inconnu
   *   s affiche a quelqu un. Tous passent desormais par `texte-onchain.js`.
   *   ⚠️ Ce zero n est pas « il n y en a jamais eu » : c est « il n y en a plus ». Le gel a
   *     garde sa valeur — il empeche le quatrieme, et il a compte les trois avant leur mort. */
  ['app.html', 0],
  /* ⛔⛔ CE QUI N EST PAS DANS CETTE LISTE, ET POURQUOI — j avais gele DEUX fichiers de trop,
   *   sur mon souvenir au lieu de la mesure. Le gel se lit maintenant sur la sonde :
   *   · `index-blocks.js` : sa seule mention vit dans le COMMENTAIRE qui raconte le bug.
   *     Son code passe par TextDecoder. Mesure : 0 site.
   *   · `marche.js` : sa ligne filtre l ASCII imprimable (`o >= 32 && o < 127`) sur un
   *     symbole — elle ne convertit pas un octet hexa. Mesure : 0 site.
   *   · `index.html` : un `btoa(fromCharCode(...TextEncoder))`, donc un ENCODAGE base64
   *     correct, plus un commentaire. Mesure : 0 site. */
]);

const trouves = new Map();
for (const f of tous) {
  let src;
  try { src = readFileSync(f, 'utf8'); } catch (_) { continue; }
  const s = sitesDeDecodageNaif(src);
  if (s.length) trouves.set(f, s);
}

console.log('fichiers du produit scannes : ' + tous.length);
console.log('fichiers avec un decodage octet-par-octet REEL : ' + trouves.size);
for (const [f, s] of trouves) {
  const gele = SITES_GELES.get(f);
  console.log('  ' + String(s.length).padStart(2) + ' site(s)  ' + f.padEnd(18)
    + 'lignes ' + s.join(', ')
    + (gele === undefined ? '   ⛔ FICHIER NON GELE' : (s.length === gele ? '   (gele a ' + gele + ')' : '   ⛔ ' + gele + ' attendus')));
}
console.log('');

/* ⛔ LE TEMOIN D IMPOSSIBILITE : si le scan ne trouve RIEN, il ne prouve rien — ce serait
 *   le scan qui est casse, pas le code qui est propre. On sait qu il existe des copies. */
console.log('temoin du scan — une sonde qui ne trouve rien ne prouve rien');
/* ⛔⛔ LE TEMOIN A DU CHANGER DE FORME, ET C EST IMPORTANT. Il disait « le scan trouve au
 *   moins un site, sinon c est LUI qui est casse » — un temoin valable tant qu il RESTAIT des
 *   sites. Maintenant qu il n y en a plus aucun, ce temoin serait ROUGE POUR LA BONNE RAISON,
 *   et le garder aurait pousse a le desactiver — donc a perdre la garde entiere.
 *   ⇒ Le temoin porte desormais sur des textes FABRIQUES : la sonde doit attraper le motif
 *     quand on le lui donne, et ne pas l attraper sur un commentaire ou un encodage. Ca se
 *     verifie sans dependre de l etat du depot. */
ok('sur une ENTREE FABRIQUEE, la sonde attrape bien le motif (sinon elle est cassee)', (() => {
  const mauvais = 's += String.fromCharCode(parseInt(b.slice(i * 2, i * 2 + 2), 16));';
  return sitesDeDecodageNaif(mauvais).length === 1;
})());
/* ⛔ TEMOIN NEGATIF : un commentaire ne doit PAS compter, sinon le compte derive a chaque
 *   fois que quelqu un explique le bug — et j en ai ecrit deux moi-meme aujourd hui. */
ok('un commentaire qui NOMME fromCharCode ne compte pas', (() => {
  const faux = ' * un String.fromCharCode(parseInt(x, 16)) rend du Latin-1';
  return sitesDeDecodageNaif(faux).length === 0;
})());
/* ⛔ TEMOIN NEGATIF : l encodage base64 est correct et ne doit pas compter. */
ok('btoa(fromCharCode(...TextEncoder)) ne compte pas (c est un ENCODAGE)', (() => {
  const bon = 'const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));';
  return sitesDeDecodageNaif(bon).length === 0;
})());
/* ⛔ TEMOIN POSITIF : le vrai motif DOIT etre attrape, y compris avec une parenthese interne. */
ok('le motif REEL est attrape malgre une parenthese interne', (() => {
  const mauvais = 's += String.fromCharCode(parseInt(b.slice(i * 2, i * 2 + 2), 16));';
  return sitesDeDecodageNaif(mauvais).length === 1;
})(), sitesDeDecodageNaif('s += String.fromCharCode(parseInt(b.slice(i * 2, i * 2 + 2), 16));'));

console.log('aucun fichier NON GELE, et aucun compte qui derive');
const nonGeles = [...trouves.keys()].filter((f) => !SITES_GELES.has(f));
ok('aucun fichier hors gel ne decode octet par octet', nonGeles.length === 0, nonGeles);
for (const [f, n] of SITES_GELES) {
  const vu = (trouves.get(f) || []).length;
  ok(f + ' : ' + n + ' site(s), pas un de plus', vu === n, { attendu: n, vu });
}

console.log('les decodeurs canoniques utilisent bien TextDecoder');
for (const f of ['index-blocks.js', 'reclamation.js']) {
  const src = readFileSync(f, 'utf8');
  ok(f + ' passe par TextDecoder (UTF-8), pas par du Latin-1 seul', /new TextDecoder/.test(src));
}

/* ⛔ ET LE DECODEUR EST REUTILISE, PAS RECOPIE : le chemin « block depuis un jeton » doit
 *   IMPORTER `decoderChaine`, pas s en ecrire un. */
console.log('le nouveau chemin REUTILISE le decodeur canonique');
const appSrc = readFileSync('app.html', 'utf8');
ok('app.html importe le module canonique texte-onchain.js',
  /import\s*\{[^}]*symboleDepuisReponse[^}]*\}\s*from\s*'\.\/texte-onchain\.js'/.test(appSrc));
/* ⛔ CETTE ASSERTION COMPTAIT LES MENTIONS, PAS LES USAGES — elle rendait 5 en incluant mes
 *   propres commentaires. On compte les SITES, comme la sonde. Et le compte attendu vient du
 *   GEL, pas d un chiffre reecrit a la main a chaque fois. */
ok('app.html n a AUCUN site de decodage naif', sitesDeDecodageNaif(appSrc).length === 0,
  sitesDeDecodageNaif(appSrc));
/* ⛔ LES TROIS SITES REPARES PASSENT TOUS PAR LE MODULE, et on le verifie NOMMEMENT : un
 *   `texteAbi` reecrit a la main redeviendrait un quatrieme decodeur sans que le compte bouge,
 *   puisqu il pourrait eviter le motif exact que la sonde cherche. */
ok('texteAbi delegue au module canonique',
  /function texteAbi\(hex\)\s*\{\s*return symboleDepuisReponse\(hex\)/.test(appSrc));
ok('lireJetonSource passe par symboleDepuisReponse', /symboleDepuisReponse\(rSym\)/.test(appSrc)
  && /symboleDepuisReponse\(rNom, 32\)/.test(appSrc));
ok('la liste des blocks detenus passe par le module', /label = symboleDepuisReponse\(h\)/.test(appSrc));
/* ⛔ ET `decoderChaine` NE DOIT PLUS ETRE IMPORTE ICI : un nom importe sans usage est
 *   exactement `presence-dun-nom-nest-pas-son-usage`, et il ferait croire a un second chemin. */
ok('decoderChaine n est PLUS importe dans app.html',
  !/import\s*\{[^}]*decoderChaine[^}]*\}\s*from\s*'\.\/reclamation\.js'/.test(appSrc));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
