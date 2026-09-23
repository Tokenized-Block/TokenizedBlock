// face.js — la face GRAVEE d un block, relue depuis ses metadonnees. Pas celle qu on devine.
// ================================================================================================
// ⛔⛔ BUG TROUVE PAR LE PREMIER TEST DE PHIL (2026-09-12) : « l image de base creee ne reste pas, elle
//    change ». Cause : Create GRAVE la face choisie dans `contractURI` (champ `face`), mais la map et
//    le profil redessinaient chaque block depuis son ADRESSE (`apparenceDepuisAdresse`). Le block
//    qu on venait de dessiner apparaissait donc avec une autre tete — l ecran contredisait ce que la
//    chaine portait.
//    ⇒ Ordre de verite : la face lue dans les metadonnees du block ; A DEFAUT, la face derivee de son
//      adresse. Jamais l inverse.
//
// ⛔ LA FACE LUE EST VALIDEE CHAMP PAR CHAMP. Des metadonnees sont ecrites par n importe qui : une
//    teinte a 9999 ou une orbite inventee ne doit ni casser le dessin ni passer pour valide. Hors
//    bornes ⇒ INVALIDE, et on retombe sur l adresse en le disant.
//
// ⚠️ CE QUE CE MODULE NE LIT PAS : les metadonnees hebergees ailleurs (ipfs://, https://). Seules les
//    `data:application/json` se lisent sans reseau tiers — c est ce que Create grave. Les autres
//    rendent AUTRE_SOURCE, jamais une face inventee.
import { selecteur } from './pool.js';
import { PHOTO_MAX } from './photo.js';
/* ⛔ UNE SEULE SOURCE POUR LA BORNE DU LIEN X : la recopier ici la ferait diverger du module qui
 *    l a derivee de la FORME (handle 15 + identifiant 25). */
import { LIEN_MAX as TWEET_MAX } from './tweet-grave.js';
import { chaineA } from './index-blocks.js';
import { ORBITES, FACETTES, MATIERES, ORNEMENTS } from './apparence.js';

/* ⛔⛔ CATALOGUE DE CREATE ELARGI (Phil, 2026-09-13 : « personnalisation pousse au max »), SANS TOUCHER
 *    AU TIRAGE. Les listes d `apparence.js` restent GELEES : elles derivent la face de chaque block qui
 *    n en a pas grave une (changer leur longueur changerait le modulo, donc la tete de TOUS ces blocks),
 *    et un test les compare aux menus de `index.html`. Les nouvelles valeurs sont AJOUTEES A LA FIN :
 *    l indice de chaque valeur ancienne ne bouge pas. */
/* ⛔⛔ ELARGISSEMENT DU 2026-09-21 (Phil : « ajoute bcp de possibilite »). VINGT-DEUX motifs de
 *     plus, et la raison pour laquelle ce ne sont PAS des emoji est ecrite ici une fois pour toutes :
 *     un emoji est un GLYPHE DE POLICE. Le meme block s afficherait differemment sur iOS, Android et
 *     Windows — trois dessins pour une seule face, alors que la face est GRAVEE et que personne ne
 *     peut la changer ensuite. Embarquer une police d emoji poserait en plus une question de licence,
 *     et le fichier porte deja la reponse : « une licence mal lue serait la seule erreur irreversible
 *     du projet ». Les sujets sont donc ceux des emoji — fusee, flamme, chat, fantome — mais chacun
 *     est TRACE en SVG dans logo.js, sans un seul octet importe.
 * ⛔ AJOUTES A LA FIN, TOUJOURS. Les listes d apparence.js restent gelees : leur longueur sert de
 *    modulo pour deriver la face de tout block qui n en a pas grave une. Inserer au milieu changerait
 *    la tete de blocks deja nes. */
export const ORBITES_CREATE = [...ORBITES, 'vortex', 'pluie', 'constellation', 'halo', 'escalier', 'ellipse',
  'anneaux', 'comete', 'grappe', 'arc', 'nuee', 'pyramide'];
export const FACETTES_CREATE = [...FACETTES, 'coeur', 'lune', 'soleil', 'oeil', 'couronne', 'infini', 'goutte', 'diamant',
  'fusee', 'flamme', 'crane', 'planete', 'fantome', 'robot', 'chat', 'fleur', 'feuille', 'montagne',
  'nuage', 'note', 'horloge', 'ampoule', 'engrenage', 'bouclier', 'epee', 'de', 'cube', 'trefle',
  'ancre', 'champignon', 'papillon', 'pique',
  /* ⛔ DEUXIEME SERIE, 2026-09-22. Phil a valide la premiere a l ecran (« nice j aime bien ») et
   *    demande d y mettre les emoji d Apple. REFUSE, et la raison tient en une ligne : leurs dessins
   *    sont une oeuvre PROPRIETAIRE, et les copier les graverait dans une image on-chain
   *    IRREVERSIBLE — le seul risque que ce fichier interdit depuis le debut. Les SUJETS, eux, ne
   *    s appartiennent a personne : ce sont ceux que tout le monde attend d un jeu d emoji, et
   *    chaque trace reste le notre, en SVG, sans un octet importe. */
  'pouce', 'main', 'poing', 'bouche', 'alien', 'ovni', 'atome', 'adn', 'cadeau', 'ballon',
  'bombe', 'cadenas', 'enveloppe', 'casque', 'camera', 'livre', 'crayon', 'manette', 'avion',
  'voiture', 'bateau', 'maison', 'arbre', 'cactus', 'poisson', 'oiseau', 'abeille', 'patte',
  'trophee', 'medaille', 'foot', 'guitare', 'baguette', 'potion', 'tornade', 'volcan', 'terre',
  'flocon', 'pomme', 'cerise', 'pizza', 'glace', 'cafe', 'arcenciel',
  /* ⛔ LES 29 SILHOUETTES NOTO (Apache-2.0, licence lue — voir NOTICE.md et logo.js). Vingt autres
   *    ont ete ecartees APRES les avoir regardees : aplatis en une couleur, les visages rendent
   *    tous le meme disque. Ce qui est garde ici a ete VU et se lit. */
  'singe', 'licorne', 'dragon', 'pingouin', 'hibou', 'renard', 'baleine', 'poulpe', 'crabe',
  'scarabee', 'dinosaure', 'cerveau', 'muscle', 'priere', 'applaudir', 'feu', 'eclipse',
  'cerisier', 'trefle4', 'palmier', 'volant', 'aimant', 'boussole', 'telescope', 'loupe',
  'cle2', 'sablier', 'satellite', 'mappemonde'];
export const MATIERES_CREATE = [...MATIERES, 'or', 'holo', 'nuit', 'acide', 'ombre', 'rose',
  'lave', 'jade', 'argent', 'ambre', 'abysse', 'menthe'];
export const ORNEMENTS_CREATE = [...ORNEMENTS, 'cercles', 'losanges', 'fleurs', 'eclairs', 'lignes', 'cadre',
  'ondes', 'pixels', 'coeurs', 'lunes', 'soleils', 'couronnes',
  'bulles', 'plumes', 'flocons', 'triangles', 'anneaux', 'graines'];

/** Bornes EXACTES des curseurs de Create — un test les compare a app.html.
 * ⚠️ Elargies le 2026-09-13 (division 5→8, eclats 6→12, ecart 4→8) : les anciennes valeurs restent
 *    toutes valides, donc toute face deja gravee reste lisible. */
export const BORNES = {
  teinte: [0, 360], accent: [0, 360], division: [1, 8], eclats: [0, 12], ecart: [0, 8],
};
/** ⛔ CHAMPS OPTIONNELS : les faces gravees AVANT leur ajout ne les portent pas, et doivent rester
 *  valides. Absent ⇒ le dessin d avant, au pixel pres. */
export const OPTIONNELS = { saturation: [20, 100] };

/* ⛔⛔ MA PREMIERE VERSION DEFINISSAIT ICI SON PROPRE `PHOTO_MAX = 4096`, ET C ETAIT UN DEFAUT.
 *     `photo.js` porte deja LE plafond du projet, mesure bien plus finement que le mien :
 *        0 Ko ->    350 515 gas   ·   5 Ko ->  6 847 635 gas
 *       12 Ko -> 15 921 140 gas ✅ ·  13 Ko -> REFUSE, « out of gas: gas exhausted during
 *                                             precompiled contract execution »
 *     Et le meme essai a 13 Ko en offrant CENT MILLIONS de gas echoue a l identique : c est une
 *     limite INTRINSEQUE du precompile B20, pas un plafond d estimation du noeud. 712 gas par octet
 *     ajoute, pas 16, parce que le precompile STOCKE l URI.
 *     Ma constante valait 4096, la sienne 19257. J aurais donc plafonne les images au cinquieme de
 *     ce que la chaine accepte, sans que rien ne le signale : deux constantes du meme nom dans la
 *     meme app, et c est la plus faible qui aurait gagne ici.
 *
 * ⛔ CE QUE CE PLAFOND BORNE, ET CE QU IL NE BORNE PAS. Le `PHOTO_MAX` de `photo.js` mesure l URI
 *    COMPLET — le `contractURI` entier. Le champ `photo` d une face n en est qu une PARTIE, et il
 *    subit encore une inflation base64 quand le JSON est encode. Le controle de `validerFace` est
 *    donc un refus GROSSIER, qui arrete l absurde tot ; le budget exact se calcule avec
 *    `budgetSurFace()` dans le parcours de Create, qui seul connait la taille du reste du JSON.
 *    ⛔ Confondre ces deux grandeurs est l erreur que `photo.js` documente lui-meme, et elle avait
 *       coute la moitie de la qualite d image : les deux sont des nombres d octets, seul le SENS
 *       differe, et aucune garde ne peut le voir. */
export { PHOTO_MAX } from './photo.js';
export const LISTES = { orbite: ORBITES_CREATE, facette: FACETTES_CREATE, matiere: MATIERES_CREATE, ornement: ORNEMENTS_CREATE };

/** Le nombre de faces que Create peut graver — publie, jamais le mot « unique ». */
export function combinaisonsCreate() {
  const [smin, smax] = OPTIONNELS.saturation;
  return 361 * 361 * 8 * 13 * 9 * (smax - smin + 1) * ORBITES_CREATE.length * FACETTES_CREATE.length
    * MATIERES_CREATE.length * ORNEMENTS_CREATE.length;
}

/**
 * Valide un objet `face`.
 * ⛔ TOUS LES CHAMPS OU RIEN : une face a moitie lue dessinerait un melange que personne n a choisi.
 */
export function validerFace(f) {
  if (!f || typeof f !== 'object') return { etat: 'INVALIDE', pourquoi: 'no face object' };
  const propre = {};
  for (const [cle, [min, max]] of Object.entries(BORNES)) {
    const v = f[cle];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      return { etat: 'INVALIDE', pourquoi: cle + ' must be an integer between ' + min + ' and ' + max };
    }
    propre[cle] = v;
  }
  for (const [cle, [min, max]] of Object.entries(OPTIONNELS)) {
    if (f[cle] === undefined) continue;
    const v = f[cle];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      return { etat: 'INVALIDE', pourquoi: cle + ' must be an integer between ' + min + ' and ' + max };
    }
    propre[cle] = v;
  }
  for (const [cle, liste] of Object.entries(LISTES)) {
    if (!liste.includes(f[cle])) return { etat: 'INVALIDE', pourquoi: cle + ' is not a known value' };
    propre[cle] = f[cle];
  }
  /* ⛔⛔ LA PHOTO GRAVEE — AJOUTEE LE 2026-09-22, ET MESUREE AVANT D ETRE AJOUTEE. Avant ca, une
   *     image posee sur une face etait LOCALE ET PERDUE : `face.js` ne connaissait aucun champ
   *     `photo`, donc le block ne la gravait jamais. La mettre ici la fait entrer dans le
   *     `contractURI`, donc dans le calldata de creation — et le calldata se paie.
   *
   * ⛔ LE PLAFOND VIENT D UNE MESURE, PAS D UN GOUT. `eth_estimateGas` sur la vraie chaine, le
   *    2026-09-22 a 0,006 gwei :
   *      sans image          374 376 gas
   *      ~1 Ko de base64   1 399 998 gas   (+$0,017)
   *      ~4 Ko             4 318 079 gas   (+$0,065)
   *      ~16 Ko           15 990 403 gas   (+$0,256)
   *    Seize kilo-octets demandent SEIZE MILLIONS de gas : une transaction enorme, que beaucoup de
   *    wallets refuseraient d estimer et qui echouerait au moindre changement de conditions. Le
   *    plafond est donc pose a 4 Ko de base64 — soit un PNG transparent de 64x64, exactement la
   *    taille utile sur une face de cube.
   * ⛔ CE QUE CE CHIFFRE N EST PAS : le cout final. `estimateGas` sur Base ne facture pas la part
   *    L1 du calldata comme une vraie transaction. Les valeurs ci-dessus sont un PLANCHER.
   *
   * ⛔ ET C EST IRREVERSIBLE : une image gravee ne se retire plus, jamais. C est pourquoi le format
   *    est ferme a `data:image/png;base64,` — pas de `https://`, pas d `ipfs://`, pas de SVG.
   *      · une URL distante pourrait changer de contenu, ou mourir : la face ne serait plus la face ;
   *      · un SVG peut porter du script et des references externes. Dans une image que personne ne
   *        peut plus retirer, c est la seule erreur qu on ne pourrait pas corriger.
   * ⛔ CHAMP OPTIONNEL : une face gravee AVANT aujourd hui n en a pas, et reste valide. */
  if (f.photo !== undefined) {
    if (typeof f.photo !== 'string') {
      return { etat: 'INVALIDE', pourquoi: 'photo must be a string' };
    }
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(f.photo)) {
      return { etat: 'INVALIDE',
        pourquoi: 'photo must be an inline data:image/png;base64 — a remote URL could change or '
          + 'die, and an SVG can carry script; neither belongs in an image nobody can remove' };
    }
    if (f.photo.length > PHOTO_MAX) {
      return { etat: 'INVALIDE',
        pourquoi: 'photo is ' + f.photo.length + ' characters, over the ' + PHOTO_MAX
          + ' cap. Measured on chain: 12 Ko of file passes, 13 Ko is refused by the B20 precompile.' };
    }
    propre.photo = f.photo;
    /* ⛔⛔ SUR QUELLE FACE — GRAVE AVEC LA PHOTO, JAMAIS DEDUIT. Sans ce champ, la meme face
     *     gravee se dessinerait sur une face differente selon le defaut de la version qui la lit :
     *     le block changerait de tete d un appareil a l autre, et c est exactement le bug du
     *     2026-09-12 que ce fichier existe pour avoir corrige.
     * ⛔ LISTE FERMEE, et `aucune` en fait partie : une photo gravee avec `photoOu: 'aucune'` est
     *    un choix legitime — l image voyage dans les metadonnees sans etre posee sur le cube. */
    const OU = ['aucune', 'haut', 'gauche', 'droite'];
    if (!OU.includes(f.photoOu)) {
      return { etat: 'INVALIDE',
        pourquoi: 'photoOu must be one of ' + OU.join(', ') + ' — a face carrying a photo has to '
          + 'say which side it sits on, or the same engraved face would draw differently elsewhere' };
    }
    propre.photoOu = f.photoOu;
  } else if (f.photoOu !== undefined) {
    /* ⛔ UN `photoOu` SANS PHOTO EST UN DEFAUT, PAS UN DETAIL : il annonce une image a un lecteur
     *    qui n en trouvera pas. On refuse, au lieu de l ignorer en silence. */
    return { etat: 'INVALIDE', pourquoi: 'photoOu was given without a photo' };
  }

  /* ══ LE POST X GRAVE (idee de Phil, 2026-09-23) ═══════════════════════════════════════════
   * ⛔⛔ CE QUI EST GRAVE EST UNE REFERENCE, PAS UNE PREUVE. Rien ici n ouvre le lien : ni le
   *     module qui le lit, ni ce validateur. On ne sait donc PAS si le post existe, ni qui l a
   *     ecrit. Le block dit « je renvoie a ce post-la » — jamais « ce post est a moi ».
   *     C est tout l interet de l idee (« sans besoin d api ») et c est aussi sa borne.
   * ⛔ ON N ACCEPTE QUE LA FORME CANONIQUE `https://x.com/<handle>/status/<id>` : pas de
   *    `twitter.com`, pas de `?s=20`, pas de sous-domaine mobile. La normalisation se fait AVANT,
   *    dans `tweet-grave.js` ; ici on refuse tout ce qui n est pas DEJA canonique, pour que deux
   *    liens du meme post ne puissent jamais produire deux gravures differentes.
   * ⛔ LA FORME EST UNE LISTE FERMEE : handle en `[A-Za-z0-9_]`, identifiant en chiffres. Un
   *    `javascript:` ou un `data:` ne peut pas la satisfaire — et un lien grave reste clicable
   *    pour toujours, dans le contractURI de quelqu un. */
  if (f.tweet !== undefined) {
    if (typeof f.tweet !== 'string') {
      return { etat: 'INVALIDE', pourquoi: 'tweet must be a string' };
    }
    if (f.tweet.length > TWEET_MAX) {
      return { etat: 'INVALIDE',
        pourquoi: 'tweet link is ' + f.tweet.length + ' characters, over the ' + TWEET_MAX + ' cap' };
    }
    if (!/^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{1,25}$/.test(f.tweet)) {
      return { etat: 'INVALIDE',
        pourquoi: 'tweet must be a canonical https://x.com/<handle>/status/<id> link — anything '
          + 'else could differ between two people sharing the same post, or carry a payload' };
    }
    propre.tweet = f.tweet;
  }
  return { etat: 'OK', face: propre };
}

/**
 * Extrait la face d une URI de metadonnees.
 * @returns {{etat:'LU'|'AUCUNE'|'INVALIDE'|'AUTRE_SOURCE', face?:object, pourquoi?:string}}
 */
export function faceDepuisUri(uri) {
  const u = String(uri || '');
  if (!u) return { etat: 'AUCUNE', pourquoi: 'no metadata URI' };
  if (!/^data:application\/json/i.test(u)) {
    return { etat: 'AUTRE_SOURCE', pourquoi: 'metadata hosted elsewhere (' + u.slice(0, 12) + '…) — not read here' };
  }
  let texte;
  try {
    const virgule = u.indexOf(',');
    if (virgule < 0) return { etat: 'INVALIDE', pourquoi: 'malformed data URI' };
    const entete = u.slice(0, virgule);
    const corps = u.slice(virgule + 1);
    texte = /;base64/i.test(entete)
      ? new TextDecoder().decode(Uint8Array.from(atob(corps), (c) => c.charCodeAt(0)))
      : decodeURIComponent(corps);
  } catch (e) {
    return { etat: 'INVALIDE', pourquoi: 'data URI could not be decoded' };
  }
  let doc;
  try { doc = JSON.parse(texte); } catch (e) { return { etat: 'INVALIDE', pourquoi: 'metadata is not JSON' }; }
  if (!doc || doc.face === undefined) return { etat: 'AUCUNE', pourquoi: 'metadata has no face' };
  const v = validerFace(doc.face);
  if (v.etat !== 'OK') return { etat: 'INVALIDE', pourquoi: v.pourquoi };
  /* ⛔ ROLE (optional, Create 2026-09-15): engraved cle if it matches a known metier; ignored otherwise. */
  const role = typeof doc.role === 'string' && /^[A-Z_]{3,24}$/.test(doc.role) ? doc.role : null;
  return { etat: 'LU', face: v.face, role };
}

/**
 * Relit la face gravee d un block sur la chaine.
 * ⛔ MEME DECODAGE QUE `faits.js` : premier mot = offset, puis `chaineA`. Deux decodeurs de chaine ABI
 *    dans le meme depot finiraient par lire deux textes differents pour la meme reponse.
 * ⛔ UNE LECTURE IMPOSSIBLE REND NON_LUE, jamais AUCUNE : « pas lu » n est pas « pas de face ».
 */
export async function faceDuBlock({ rpc, jeton }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jeton || ''))) return { etat: 'INVALIDE', pourquoi: 'not an address' };
  let r;
  try { r = await rpc('eth_call', [{ to: jeton, data: '0x' + selecteur('contractURI()') }, 'latest']); }
  catch (e) { return { etat: 'NON_LUE', pourquoi: String((e && e.message) || e) }; }
  if (!r || r === '0x') return { etat: 'AUCUNE', pourquoi: 'contractURI() returned nothing' };
  let uri;
  try {
    const hex = String(r).slice(2);
    uri = chaineA(hex, Number(BigInt('0x' + hex.slice(0, 64))));
  } catch (e) {
    return { etat: 'INVALIDE', pourquoi: 'contractURI() is not a readable string' };
  }
  return faceDepuisUri(uri);
}
