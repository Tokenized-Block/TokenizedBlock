/* post-grave.js — LE POST GRAVE, RECONSTITUE CHEZ NOUS, SANS SCRIPT TIERS.
 *
 * ⛔⛔ CE QUE CE MODULE CHANGE, ET IL FAUT LE DIRE AVANT TOUT LE RESTE. Jusqu ici l app affichait un
 *     LIEN vers le post et se tenait a cette phrase : « We have not opened it ». C etait vrai. Si
 *     on affiche maintenant le CONTENU, cette phrase devient fausse : on l a ouvert. La reserve
 *     doit donc changer en meme temps que l affichage, sinon on garde un texte rassurant qui ne
 *     decrit plus ce qu on fait.
 *   ⇒ La nouvelle reserve dit exactement ce qu on sait : voici ce que X publie pour ce lien, nous
 *     l avons demande a X, et ca ne prouve toujours PAS que le post appartient a qui a grave le
 *     block. La gravure prouve le LIEN, jamais l appartenance.
 *
 * ⛔ AUCUN SCRIPT TIERS DANS LA PAGE. Le widget officiel de X chargerait `platform.twitter.com` chez
 *   chaque visiteur : un script externe, du pistage, et une dependance qui peut tomber ou changer
 *   sans prevenir. Trois refus d integration ont deja ete essuyes ici pour cette raison exacte —
 *   un appel reseau tiers dans la page. On demande donc a X depuis NOTRE serveur, une fois, et on
 *   redessine avec nos propres balises.
 *
 * ⛔ ON N INJECTE JAMAIS LEUR HTML. L oEmbed rend un `<blockquote>` avec des `<a>` dedans. Le
 *   recopier dans la page serait une porte ouverte : on en extrait le TEXTE, et le client
 *   reconstruit la carte avec des noeuds qu il cree lui-meme.
 */

/* ⛔ La forme canonique, la meme que celle exigee a la gravure. Un lien qui n a pas cette forme
 *   n est pas interroge du tout : on ne laisse pas une chaine arbitraire choisir ce qu on appelle. */
export const LIEN_X = /^https:\/\/x\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})$/;

/** L hote est FIXE. Le lien ne voyage qu en parametre — il ne choisit jamais la destination. */
export const HOTE_OEMBED = 'https://publish.twitter.com/oembed';

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/**
 * Extrait le texte lisible du `<p>` de l oEmbed. PUR : aucune lecture reseau.
 * ⛔ On borne au PREMIER `<p>…</p>` : le blockquote peut contenir autre chose (une ligne d auteur,
 *   une date) qu on ne veut pas melanger au message.
 */
export function texteDuPost(html) {
  if (typeof html !== 'string' || !html) return null;
  const m = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (!m) return null;
  const sansBalises = m[1]
    /* ⛔ `<br>` devient un vrai retour a la ligne : sans ca, deux phrases se collent et le message
     *   change de sens sans qu on s en apercoive. */
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const decode = sansBalises.replace(/&(#?\w+);/g, (tout, e) => {
    if (Object.prototype.hasOwnProperty.call(ENTITES, e)) return ENTITES[e];
    if (/^#\d+$/.test(e)) {
      const n = Number(e.slice(1));
      /* ⛔ borne : un point de code hors plage ferait jeter String.fromCodePoint */
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : tout;
    }
    return tout;
  });
  const propre = decode.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return propre || null;
}

/**
 * Demande a X ce qu il publie pour ce lien.
 * @returns {Promise<{etat:string, auteur?:string, auteurLien?:string, texte?:string, pourquoi?:string}>}
 *   LU · INTROUVABLE (supprime, prive, ou jamais existe) · NON_MESURE (on n a pas pu demander)
 * ⛔⛔ TROIS ETATS, JAMAIS DEUX. « introuvable » et « je n ai pas pu demander » appellent des
 *     phrases opposees a l ecran : la premiere informe sur le POST, la seconde sur NOUS. Les
 *     confondre ferait dire « ce post n existe pas » a cause d une panne de reseau — une
 *     accusation gratuite sur le block de quelqu un.
 */
export async function lirePostPublie({ lien, fetchImpl = null, delaiMs = 6000 } = {}) {
  const l = String(lien || '');
  if (!LIEN_X.test(l)) return { etat: 'NON_MESURE', pourquoi: 'not a canonical post link' };
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return { etat: 'NON_MESURE', pourquoi: 'no fetch available' };
  /* `omit_script` : on ne veut surtout pas leur script. `dnt` : on demande a X de ne pas pister. */
  const url = HOTE_OEMBED + '?omit_script=1&dnt=true&url=' + encodeURIComponent(l);
  let r;
  try {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), delaiMs);
    r = await f(url, { signal: stop.signal, headers: { accept: 'application/json' } });
    clearTimeout(t);
  } catch (e) {
    return { etat: 'NON_MESURE', pourquoi: 'could not ask X: ' + String((e && e.message) || e).slice(0, 80) };
  }
  /* ⛔ 404 et 403 veulent dire quelque chose sur le POST (supprime, compte protege) ; tout le reste
   *   veut dire quelque chose sur NOUS ou sur X. On ne melange pas. */
  if (r.status === 404 || r.status === 403) {
    return { etat: 'INTROUVABLE', pourquoi: 'X does not serve this post publicly (deleted, private, or never existed)' };
  }
  if (!r.ok) return { etat: 'NON_MESURE', pourquoi: 'X answered HTTP ' + r.status };
  let j;
  try { j = await r.json(); } catch (_) { return { etat: 'NON_MESURE', pourquoi: 'X answered something unreadable' }; }
  const texte = texteDuPost(j && j.html);
  if (!texte) return { etat: 'NON_MESURE', pourquoi: 'no readable text in what X returned' };
  const auteur = typeof j.author_name === 'string' ? j.author_name.slice(0, 80) : null;
  const auteurLien = typeof j.author_url === 'string' && /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/.test(j.author_url)
    ? j.author_url : null;
  return { etat: 'LU', auteur, auteurLien, texte: texte.slice(0, 600), lien: l };
}
