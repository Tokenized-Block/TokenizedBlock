/* LIRE UN TEXTE ECRIT PAR N IMPORTE QUI, ET L AFFICHER SANS SE FAIRE PIEGER.
 *
 * ⛔⛔ LE DEFAUT REPARE ICI EST DOUBLE, ET LE SECOND EST PIRE QUE LE PREMIER.
 *
 * 1. LE LATIN-1. `String.fromCharCode(octet)` fait « un octet = un caractere ». Un `string`
 *    Solidity est de l UTF-8, ou un caractere chinois pese TROIS octets. Des blocks REELS de
 *    Base s affichaient « å°çç¶­å°¼ » dans la galerie — leurs octets, pas leurs noms.
 *    ⚠️ EN ASCII PUR LES DEUX CHEMINS SONT IDENTIQUES, et c est pour ca que ca a survecu a
 *    tous les essais : le defaut n existait que sur les blocks DES AUTRES.
 *
 * 2. LE FILTRE QUI EFFACAIT LE RESTE. Le code repare portait aussi
 *      `s.replace(/[^\x20-\x7e]/g, '')`
 *    — donc meme AVEC un decodage correct, tout ce qui n est pas de l ASCII disparaissait.
 *    Un nom japonais ne devenait pas du charabia : il devenait VIDE. Reparer le decodage sans
 *    toucher a ce filtre n aurait rien change a l ecran, et on aurait cru avoir corrige.
 *
 * ⛔⛔⛔ MAIS ON N OUVRE PAS EN GRAND POUR AUTANT. Ces textes sont graves par n importe qui.
 *    Ouvrir tout l Unicode laisserait passer des caracteres INVISIBLES et des OVERRIDES
 *    BIDIRECTIONNELS : U+202E retourne l affichage, donc un symbole peut se lire a l ecran
 *    autrement qu il n est ecrit sur la chaine. Un nom qui ment sur lui-meme, dans une app ou
 *    les gens achetent, n est pas un detail cosmetique.
 *    ⇒ On retire ce qui SE CACHE ou RETOURNE ; on garde ce qui SE LIT.
 */

/** Ce qu on refuse d afficher, et pourquoi chaque classe est la. */
export const INVISIBLES = Object.freeze([
  '\\u0000-\\u001F', '\\u007F-\\u009F',   /* commandes C0/C1 : rien a montrer */
  '\\u200B-\\u200F',                       /* largeur nulle + marques de direction */
  '\\u202A-\\u202E',                       /* plongees et OVERRIDES bidirectionnels */
  '\\u2060-\\u2064', '\\u2066-\\u2069',    /* jointures invisibles + isolats */
  '\\uFEFF',                               /* BOM au milieu d un texte */
]);
const RE_INVISIBLES = new RegExp('[' + INVISIBLES.join('') + ']', 'g');

/** Longueur d affichage par defaut. Un symbole plus long deborde partout. */
export const MAX_ECRAN = 12;

/** Au-dela de cette part de caracteres de remplacement, le texte n est pas lisible. */
export const PART_REMPLACEMENT_MAX = 0.34;

/**
 * Decode une chaine ABI dynamique (le retour de `name()` / `symbol()`), en UTF-8.
 * ⛔ REND null PLUTOT QUE DU CHARABIA : afficher `0x4f4b0000…` a la place d un symbole donne
 *   l impression d un bug DU JETON alors que c est notre lecture qui a echoue.
 */
export function decoderChaineAbi(hex) {
  const b = String(hex || '').replace(/^0x/, '');
  if (b.length < 128) return null;
  let off, n;
  try {
    off = Number(BigInt('0x' + b.slice(0, 64)));
    n = Number(BigInt('0x' + b.slice(64, 128)));
  } catch (_) { return null; }
  /* Un offset autre que 32 n est pas la forme simple qu on sait lire — on le dit en rendant
   * null, au lieu de lire a un endroit choisi au hasard. */
  if (off !== 32) return null;
  if (!Number.isInteger(n) || n <= 0 || n > 1024) return null;
  if (b.length < 128 + n * 2) return null;   /* longueur ANNONCEE plus grande que les octets */
  return octetsEnTexte(b.slice(128, 128 + n * 2));
}

/**
 * Decode un mot fixe `bytes32` (les vieux jetons qui rendent `symbol()` ainsi), en UTF-8.
 * S arrete au premier octet nul, comme le remplissage a droite l impose.
 */
export function decoderMotFixe(hex) {
  const b = String(hex || '').replace(/^0x/, '');
  if (b.length < 2) return null;
  let fin = 0;
  const max = Math.min(32, Math.floor(b.length / 2));
  while (fin < max) {
    const o = parseInt(b.slice(fin * 2, fin * 2 + 2), 16);
    if (!Number.isFinite(o) || o === 0) break;
    fin += 1;
  }
  if (!fin) return null;
  return octetsEnTexte(b.slice(0, fin * 2));
}

/** Des octets hexa vers du texte UTF-8. ⛔ Decodage NON STRICT : des octets invalides
 *  deviennent U+FFFD plutot que de lever — planter sur le nom d un inconnu masquerait
 *  toute la galerie. La part de U+FFFD est jugee ensuite par `nettoyerPourEcran`. */
function octetsEnTexte(hexOctets) {
  const paires = hexOctets.match(/.{2}/g);
  if (!paires || !paires.length) return null;
  const oct = new Uint8Array(paires.length);
  for (let i = 0; i < paires.length; i += 1) {
    const v = parseInt(paires[i], 16);
    if (!Number.isFinite(v)) return null;
    oct[i] = v;
  }
  try { return new TextDecoder('utf-8').decode(oct); } catch (_) { return null; }
}

/**
 * Prepare un texte on-chain pour l ecran.
 * Rend null quand il ne reste rien de lisible — un vide se dit, il ne se devine pas.
 *
 * ⛔ On RETIRE les invisibles et les overrides, on GARDE les lettres du monde entier.
 * ⛔ Et si le decodage a surtout produit des U+FFFD, on rend null : afficher « ��� » ferait
 *   accuser le jeton alors que c est la lecture qui a echoue.
 */
export function nettoyerPourEcran(texte, max = MAX_ECRAN) {
  if (typeof texte !== 'string') return null;
  const sansInvisibles = texte.replace(RE_INVISIBLES, '');
  const coupe = sansInvisibles.trim();
  if (!coupe) return null;
  const remplacements = (coupe.match(/�/g) || []).length;
  if (remplacements && remplacements / [...coupe].length > PART_REMPLACEMENT_MAX) return null;
  if (!Number.isInteger(max) || max <= 0) return null;
  /* ⛔ ON COUPE PAR POINTS DE CODE, PAS PAR UNITES : `slice` sur une chaine JS peut casser
   *   une paire de substitution en deux moities et produire un caractere de remplacement
   *   a l ecran — on aurait repare le decodage pour le recasser a l affichage. */
  const points = [...coupe];
  return points.length > max ? points.slice(0, max).join('') : coupe;
}

/** Le chemin complet, tel que les ecrans l utilisent : ABI dynamique, sinon mot fixe. */
export function symboleDepuisReponse(hex, max = MAX_ECRAN) {
  const dyn = decoderChaineAbi(hex);
  if (dyn !== null) {
    const p = nettoyerPourEcran(dyn, max);
    if (p) return p;
  }
  const fixe = decoderMotFixe(hex);
  if (fixe !== null) {
    const p = nettoyerPourEcran(fixe, max);
    if (p) return p;
  }
  return null;
}
