// source-visite.js — D OU VIENNENT LES VISITES ? Categorie FERMEE, jamais une URL.
// ================================================================================================
// ⛔⛔ LE TROU MESURE LE 2026-09-29, ET C EST LE PLUS GROS DE L APP. 384 visites en 11 jours, et
//     AUCUNE trace de leur origine : ni `Referer` cote serveur, ni `document.referrer` cote client,
//     ni `utm_`, ni rien dans les logs Railway (verifie : le serveur n imprime que les etapes).
//     ⇒ On ne peut pas savoir quelle source amene des gens qui CLIQUENT. Tant que c est vrai,
//       travailler la conversion est du tir a l aveugle : on optimise un entonnoir sans savoir qui
//       on y met. Le taux clic/visite est passe de 16,73 % a 0,87 % et je n ai pas pu dire si c etait
//       une regression du bouton ou la fin de nos propres tests — faute de cette donnee.
//
// ⛔⛔ CE MODULE NE STOCKE NI URL, NI CHEMIN, NI PARAMETRE, NI IDENTIFIANT. Il rend UNE categorie
//     d une liste FERMEE. C est la meme discipline que `causes-echec.js` : un nom hors liste serait
//     jete en silence par `/api/etape`, donc la liste est la SEULE source, et un test la confronte
//     a `ETAPES_ENTONNOIR`.
//   ⛔ POURQUOI PAS LE REFERRER ENTIER : un referrer porte des chemins et des parametres — donc
//     potentiellement un identifiant de conversation, un profil, une recherche. Le HOTE seul
//     suffirait deja a repondre a la question, et meme lui est reduit a une categorie : on ne garde
//     que ce qui sert la decision, pas ce qu on pourrait garder.
//   ⚠️ CE QUE CA NE DIRA JAMAIS : qui est venu. Aucune personne n est distinguable de ce compteur —
//     c est un total par jour et par categorie, exactement comme le reste de l entonnoir.
//
// ⚠️ BORNE DURE, ET ELLE EST GRANDE : `document.referrer` est VIDE dans beaucoup de cas legitimes —
//    lien copie-colle, application mobile, client de messagerie, `rel="noreferrer"`, navigation
//    privee stricte, redirection HTTPS -> HTTP. Donc `src_direct` veut dire « aucun referrer lu »,
//    PAS « la personne a tape l adresse ». Ne jamais lire cette ligne comme du trafic direct.

/** ⛔ LISTE FERMEE. Ajouter une categorie ici EXIGE de l ajouter a `ETAPES_ENTONNOIR` : sinon
 *  `/api/etape` la jette sans rien dire et la ligne vaut 0 pour toujours — un zero qui ne peut pas
 *  monter, indiscernable d une source qui n amene personne. `test-source-visite.mjs` echoue si les
 *  deux listes divergent. */
export const SOURCES = Object.freeze([
  'src_direct',    // aucun referrer lisible — voir la borne ci-dessus, ce n est PAS « direct »
  'src_x',         // x.com / twitter.com / t.co
  'src_farcaster', // warpcast / farcaster
  'src_telegram',
  'src_discord',
  'src_reddit',
  'src_recherche', // google / bing / duckduckgo / brave / ecosia…
  'src_github',
  'src_base',      // base.org / basescan / coinbase — l ecosysteme lui-meme
  'src_interne',   // un de nos propres hotes : ce n est PAS une acquisition
  'src_autre',     // hote lu, mais hors des familles ci-dessus
]);

/* ⛔ LES MOTIFS PORTENT SUR L HOTE SEUL, et ils sont ancres a la FIN (`$`) ou sur un point : sans
 *   ancrage, `x.com` matcherait `x.com.attaquant.net`. Un classement par `includes` est une porte
 *   ouverte a la falsification de source par n importe qui qui poste un lien. */
const FAMILLES = [
  ['src_x', /(^|\.)(x\.com|twitter\.com|t\.co)$/],
  ['src_farcaster', /(^|\.)(warpcast\.com|farcaster\.xyz)$/],
  ['src_telegram', /(^|\.)(t\.me|telegram\.org|telegram\.me)$/],
  ['src_discord', /(^|\.)(discord\.com|discord\.gg|discordapp\.com)$/],
  ['src_reddit', /(^|\.)(reddit\.com|redd\.it)$/],
  ['src_recherche', /(^|\.)(google\.[a-z.]{2,6}|bing\.com|duckduckgo\.com|search\.brave\.com|ecosia\.org|qwant\.com|yandex\.[a-z.]{2,6})$/],
  ['src_github', /(^|\.)(github\.com|github\.io)$/],
  ['src_base', /(^|\.)(base\.org|basescan\.org|coinbase\.com|blockscout\.com)$/],
];

/** ⛔ NOS PROPRES HOTES : une navigation interne n est PAS une acquisition, et la compter comme telle
 *  gonflerait la source la plus facile a produire — nous-memes. */
const NOTRES = /(^|\.)(tokenizedblock\.space|tokenized-block\.github\.io|localhost)$/;

/**
 * Rend UNE categorie de `SOURCES` pour un referrer donne.
 * ⛔ TOTALE : toute entree rend une categorie, jamais `null` ni une exception. Un referrer illisible
 *   tombe dans `src_direct`, parce que « je n ai pas pu lire » et « il n y en avait pas » sont
 *   indiscernables ICI — et qu inventer une troisieme ligne pour ca donnerait un chiffre que
 *   personne ne saurait interpreter. La borne du fichier le DIT, a defaut de pouvoir le mesurer.
 * @param {string} referrer  la valeur brute de `document.referrer`, ou n importe quoi
 * @returns {string} un element de `SOURCES`
 */
export function categorieSource(referrer) {
  const brut = typeof referrer === 'string' ? referrer.trim() : '';
  if (!brut) return 'src_direct';
  let hote;
  try { hote = new URL(brut).hostname.toLowerCase(); } catch (_) { return 'src_direct'; }
  if (!hote) return 'src_direct';
  if (NOTRES.test(hote)) return 'src_interne';
  for (const [nom, motif] of FAMILLES) if (motif.test(hote)) return nom;
  return 'src_autre';
}
