/* boutique-block.js -- LE « BLOCK MARCHAND » : l URL d une boutique Shopify (qui accepte l USDC) gravee dans le contractURI a la
 * naissance, puis RELUE et montree sur la page du block. Pur : servi a la page ET importe par naissance-api.js.
 *
 * POURQUOI (Phil, 2026-11-04) : « create a block via Shopify = MERCHANT BLOCK : the creator signs the birth as today, and their
 *   Shopify store URL (store that accepts USDC) is engraved in the block's contractURI at birth ».
 * ⛔ CE QUE LA CLE GRAVEE DIT, ET NE DIT PAS : `shopify_store` est une DECLARATION du createur. Rien ici ne prouve que la boutique
 *   est la sienne ni qu elle accepte l USDC (Shopify n expose pas ce reglage publiquement, rien n a ete lu). La page le dit.
 * ⛔ UN TEXTE GRAVE PAR N IMPORTE QUI : la page RE-VALIDE la valeur lue avec CETTE fonction (un contractURI peut etre ecrit par un
 *   autre chemin que le notre). Regles, toutes en REFUS (jamais « nettoyer puis accepter ») :
 *   - texte <= 200 caracteres, sans aucun caractere invisible ni override bidirectionnel (les classes de texte-onchain.js
 *     INVISIBLES, importees : une seule liste), ASCII imprimable seulement (un domaine international arrive en punycode `xn--` :
 *     REFUSE, homographes) ;
 *   - https seulement (donc ni javascript:, ni data:, ni http:) ; ni identifiants, ni port, ni IP litterale ; un point dans l hote ;
 *   - on ne garde que origine + chemin : la requete et le fragment sont retires (ni pistage ni charge gravee pour toujours).
 *   Un hote `<nom>.myshopify.com` est marque `myshopify:true` ; un domaine propre tape par le createur est accepte tel quel.
 * ⚠ Les echappements unicode sont dans texte-onchain.js sous forme de TEXTE (« \\u202E ») : aucun caractere invisible n est
 *   ecrit dans ce fichier source. */
import { INVISIBLES } from './texte-onchain.js';

export const CLE_BOUTIQUE = 'shopify_store';
export const MAX_URL_BOUTIQUE = 200;
const INVISIBLE = new RegExp('[' + INVISIBLES.join('') + ']');
const ASCII_IMPRIMABLE = /^[\x21-\x7E]+$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** { ok:true, url, hote, myshopify } ou { ok:false, pourquoi } */
export function validerUrlBoutique(texte) {
  if (typeof texte !== 'string') return { ok: false, pourquoi: 'not a text' };
  const t = texte.trim();
  if (!t) return { ok: false, pourquoi: 'empty' };
  if (t.length > MAX_URL_BOUTIQUE) return { ok: false, pourquoi: 'longer than ' + MAX_URL_BOUTIQUE + ' characters' };
  if (INVISIBLE.test(t)) return { ok: false, pourquoi: 'hidden or direction-changing characters' };
  if (!ASCII_IMPRIMABLE.test(t)) return { ok: false, pourquoi: 'only plain ASCII characters (an international domain is refused here)' };
  let u;
  try { u = new URL(t); } catch (_) { return { ok: false, pourquoi: 'not a URL' }; }
  if (u.protocol !== 'https:') return { ok: false, pourquoi: 'https only' };
  if (u.username || u.password) return { ok: false, pourquoi: 'no credentials in the URL' };
  if (u.port) return { ok: false, pourquoi: 'no port' };
  const hote = u.hostname.toLowerCase();
  if (hote.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hote)) return { ok: false, pourquoi: 'a domain, not an IP address' };
  const labels = hote.split('.');
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return { ok: false, pourquoi: 'not a valid domain' };
  if (labels.some((l) => l.startsWith('xn--'))) return { ok: false, pourquoi: 'international (punycode) domains are refused' };
  if (/^\d+$/.test(labels[labels.length - 1])) return { ok: false, pourquoi: 'not a valid domain' };
  const url = 'https://' + hote + (u.pathname === '/' ? '/' : u.pathname);
  if (url.length > MAX_URL_BOUTIQUE) return { ok: false, pourquoi: 'longer than ' + MAX_URL_BOUTIQUE + ' characters' };
  return { ok: true, url, hote, myshopify: hote.endsWith('.myshopify.com') && labels.length === 3 };
}

/** le morceau a fusionner dans la meta gravee : {} sans boutique, { shopify_store: { url, currency, declared_by } } sinon ;
 *  JETTE si le texte est refuse (la naissance ne part pas avec une boutique invalide en silence) */
export function champBoutique(texte) {
  if (texte === undefined || texte === null || String(texte).trim() === '') return {};
  const v = validerUrlBoutique(String(texte));
  if (!v.ok) throw new Error('Shopify store URL refused: ' + v.pourquoi);
  return { [CLE_BOUTIQUE]: { url: v.url, currency: 'USDC', declared_by: 'creator' } };
}

/** lit la boutique d une meta deja DECODEE (objet JSON du contractURI) : la re-valide ; null si absente ou refusee */
export function boutiqueDepuisMeta(meta) {
  const s = meta && typeof meta === 'object' ? meta[CLE_BOUTIQUE] : null;
  const brut = s && typeof s === 'object' ? s.url : null;
  if (typeof brut !== 'string') return null;
  const v = validerUrlBoutique(brut);
  return v.ok ? v : null;
}

export const TEXTE_LIEN_BOUTIQUE = "Pay this block's shop in USDC (Shopify)";
export const NOTE_LIEN_BOUTIQUE = 'Declared by the block creator at birth; TokenizedBlock did not check the shop.';
