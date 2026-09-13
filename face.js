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
import { chaineA } from './index-blocks.js';
import { ORBITES, FACETTES, MATIERES, ORNEMENTS } from './apparence.js';

/* ⛔⛔ CATALOGUE DE CREATE ELARGI (Phil, 2026-09-13 : « personnalisation pousse au max »), SANS TOUCHER
 *    AU TIRAGE. Les listes d `apparence.js` restent GELEES : elles derivent la face de chaque block qui
 *    n en a pas grave une (changer leur longueur changerait le modulo, donc la tete de TOUS ces blocks),
 *    et un test les compare aux menus de `index.html`. Les nouvelles valeurs sont AJOUTEES A LA FIN :
 *    l indice de chaque valeur ancienne ne bouge pas. */
export const ORBITES_CREATE = [...ORBITES, 'vortex', 'pluie', 'constellation', 'halo', 'escalier', 'ellipse'];
export const FACETTES_CREATE = [...FACETTES, 'coeur', 'lune', 'soleil', 'oeil', 'couronne', 'infini', 'goutte', 'diamant'];
export const MATIERES_CREATE = [...MATIERES, 'or', 'holo', 'nuit', 'acide', 'ombre', 'rose'];
export const ORNEMENTS_CREATE = [...ORNEMENTS, 'cercles', 'losanges', 'fleurs', 'eclairs', 'lignes', 'cadre',
  'ondes', 'pixels', 'coeurs', 'lunes', 'soleils', 'couronnes'];

/** Bornes EXACTES des curseurs de Create — un test les compare a app.html.
 * ⚠️ Elargies le 2026-09-13 (division 5→8, eclats 6→12, ecart 4→8) : les anciennes valeurs restent
 *    toutes valides, donc toute face deja gravee reste lisible. */
export const BORNES = {
  teinte: [0, 360], accent: [0, 360], division: [1, 8], eclats: [0, 12], ecart: [0, 8],
};
/** ⛔ CHAMPS OPTIONNELS : les faces gravees AVANT leur ajout ne les portent pas, et doivent rester
 *  valides. Absent ⇒ le dessin d avant, au pixel pres. */
export const OPTIONNELS = { saturation: [20, 100] };
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
  return v.etat === 'OK' ? { etat: 'LU', face: v.face } : { etat: 'INVALIDE', pourquoi: v.pourquoi };
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
