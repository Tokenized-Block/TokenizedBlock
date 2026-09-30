/* espacements-cl.js — LES ESPACEMENTS DE TICK, DEMANDES A LA FACTORY AU LIEU D ETRE DEVINES.
 *
 * ⛔⛔⛔ LE BUG QUE CE MODULE FERME, ET IL A COUTE DES JOURS. `ESPACEMENTS_ALTERNATIVE` etait une
 *      liste ECRITE A LA MAIN : `[1, 10, 50, 100, 200, 2000]`. La factory Aerodrome CL en declare
 *      NEUF — `1, 50, 100, 200, 2000, 500, 10, 80, 150`. Trois manquaient : **80, 150, 500**.
 *      Consequence mesuree le 2026-09-30 sur les 13 blocks cotes en action avec une pool CL :
 *        · dans notre liste  : 4 pools
 *        · HORS de la liste  : 9 pools, dont TE/MUc a tickSpacing **80** et 107 505 $ de volume 24 h
 *      Autrement dit : la moitie du volume de cette categorie etait INTROUVABLE, et l ecran en
 *      concluait « pas de pool » — un refus qui ressemblait a un fait de la chaine.
 *
 * ⛔⛔ ET LA LECON, PLUS LARGE QUE CE BUG : une liste blanche sans garde de derive DERIVE. Elle
 *     n avait aucun tort le jour ou elle a ete ecrite ; la factory a simplement active de nouveaux
 *     espacements depuis. On ne la corrige donc pas en y ajoutant 80, 150 et 500 — on la remplace
 *     par une LECTURE de la source qui decide.
 *
 * ⛔ LA RETOMBEE EXISTE MAIS ELLE SE NOMME. Si la factory ne repond pas, on retombe sur la liste
 *   ecrite — et l etat dit `RETOMBEE`, jamais `OK`. Une retombee qui se fait passer pour une
 *   lecture est le motif n°1 de ce depot : un retour neutre qui avale une panne.
 *
 * ⚠️ BORNE : ce module lit QUELS espacements la factory autorise. Il ne dit pas qu une pool existe
 *    a un espacement donne, ni qu elle porte de la liquidite. C est l aller-retour sur la factory,
 *    puis `liquidity() > 0`, qui le disent — et sur USDC/PLTRc une pool EXISTE a ts=1 avec
 *    `liquidity = 0` : exister n est pas etre echangeable.
 */

/** `tickSpacings()` sur la factory Aerodrome CL. ⛔ Selecteur CALCULE puis verifie contre la chaine
 *  le 2026-09-30 (la reponse porte 9 valeurs) ; `allTickSpacings()` REVERTE — temoin negatif. */
export const SELECTEUR_TICKSPACINGS = '0x9cbbbe86';

/* ⛔⛔ LA RETOMBEE, ET ELLE EST DELIBEREMENT LA LISTE COMPLETE MESUREE, pas l ancienne liste de six.
 *     Garder les six aurait fait de la retombee une panne silencieuse identique au bug d origine.
 *   ⚠️ C est une PHOTO du 2026-09-30. Elle vieillira ; c est pour ca qu elle est la retombee et non
 *     la source. `etatEspacements` dit toujours laquelle des deux a servi. */
export const ESPACEMENTS_RETOMBEE = Object.freeze([1, 10, 50, 80, 100, 150, 200, 500, 2000]);

export const ETATS_ESPACEMENTS = Object.freeze(['OK', 'RETOMBEE', 'NON_MESURE']);

/** Borne haute d un int24 positif. Un espacement au-dela ne tient pas dans les trois octets du
 *  chemin de swap — il serait encode tronque, et la pool serait introuvable. */
const MAX_INT24 = (1 << 23) - 1;

/**
 * Decode la reponse ABI de `tickSpacings()` — `int24[]` : offset, longueur, puis les valeurs.
 * ⛔ REFUSE plutot que de rendre une liste partielle : une liste tronquee se lirait comme
 *   « la factory n autorise que ca », ce qui est exactement l erreur qu on repare.
 * @returns {{etat:string, espacements:number[], pourquoi?:string}}
 */
export function decodeEspacements(hex) {
  /* ⛔ `"0x"` est un retour VIDE, pas une panne — mais pour une liste attendue, vide = illisible. */
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]*$/.test(hex) || hex.length <= 2) {
    return { etat: 'NON_MESURE', espacements: [], pourquoi: 'empty or non-hex response' };
  }
  const b = hex.slice(2);
  if (b.length % 64 !== 0) {
    return { etat: 'NON_MESURE', espacements: [], pourquoi: 'response is not a whole number of 32-byte words' };
  }
  const mots = b.length / 64;
  if (mots < 2) return { etat: 'NON_MESURE', espacements: [], pourquoi: 'response too short to hold offset + length' };
  const mot = (i) => b.slice(i * 64, (i + 1) * 64);
  let offset; let longueur;
  try { offset = Number(BigInt('0x' + mot(0))); longueur = Number(BigInt('0x' + mot(1))); } catch (_) {
    return { etat: 'NON_MESURE', espacements: [], pourquoi: 'offset or length is not a number' };
  }
  /* ⛔ L OFFSET EST VERIFIE, PAS SUPPOSE : un tableau dynamique le porte a 0x20. Un autre offset
   *   voudrait dire qu on decode autre chose que ce qu on croit. */
  if (offset !== 32) {
    return { etat: 'NON_MESURE', espacements: [], pourquoi: 'dynamic array offset is ' + offset + ', expected 32' };
  }
  /* ⛔⛔ LA LONGUEUR DECLAREE DOIT CORRESPONDRE AUX MOTS PRESENTS. Une reponse coupee en transport
   *     donnerait une liste PLUS COURTE que la verite — le bug d origine, en plus sournois. */
  if (longueur < 0 || longueur !== mots - 2) {
    return { etat: 'NON_MESURE', espacements: [],
      pourquoi: 'declared length ' + longueur + ' does not match the ' + (mots - 2) + ' words present' };
  }
  if (longueur === 0) {
    return { etat: 'NON_MESURE', espacements: [], pourquoi: 'the factory declared zero tick spacings, which cannot be true' };
  }
  const vus = new Set();
  for (let i = 0; i < longueur; i += 1) {
    const m = mot(2 + i);
    /* ⛔ int24 SIGNE : un mot rempli de `f` est un NEGATIF. Un espacement negatif n a aucun sens et
     *   `Number(BigInt(...))` en ferait un nombre enorme accepte en silence. */
    if (/^f{40,}/i.test(m)) {
      return { etat: 'NON_MESURE', espacements: [], pourquoi: 'entry ' + i + ' is negative, which is not a tick spacing' };
    }
    let v;
    try { v = Number(BigInt('0x' + m)); } catch (_) {
      return { etat: 'NON_MESURE', espacements: [], pourquoi: 'entry ' + i + ' is not a number' };
    }
    if (!Number.isInteger(v) || v <= 0 || v > MAX_INT24) {
      return { etat: 'NON_MESURE', espacements: [],
        pourquoi: 'entry ' + i + ' is ' + v + ', outside the positive int24 range a swap path can encode' };
    }
    vus.add(v);
  }
  /* ⛔ TRI CROISSANT : l ordre de la factory est celui des activations, pas une preference. Un ordre
   *   stable rend les journaux et les tests comparables d un passage a l autre. */
  return { etat: 'OK', espacements: [...vus].sort((x, y) => x - y) };
}

/**
 * Lit les espacements sur la factory, et retombe sur la photo si la lecture echoue.
 * @param {(to:string,data:string)=>Promise<string|null>} appel — `eth_call` deja borne par l appelant
 * @param {string} factory
 * @returns {Promise<{etat:string, espacements:number[], pourquoi?:string}>}
 */
export async function lireEspacements(appel, factory) {
  let brut = null;
  try { brut = await appel(factory, SELECTEUR_TICKSPACINGS); } catch (e) { brut = null; }
  const d = decodeEspacements(brut);
  if (d.etat === 'OK') return d;
  /* ⛔ LA RETOMBEE NE SE DEGUISE PAS EN LECTURE. L etat le dit, et la raison de l echec est gardee :
   *   sans elle, on ne saurait pas distinguer « la factory est muette » de « son format a change ». */
  return { etat: 'RETOMBEE', espacements: [...ESPACEMENTS_RETOMBEE],
    pourquoi: 'factory read failed (' + (d.pourquoi || 'no reason') + '); using the 2026-09-30 snapshot' };
}

/** Phrase pour un journal. ⛔ Rend '' sur `OK` : un avertissement permanent devient invisible.
 * ⛔⛔ MAIS `null` N EST PAS `OK`, ET LES CONFONDRE EST LE MOTIF N°1 DE CE DEPOT. La premiere
 *     version de cette fonction commencait par `if (!r || r.etat === 'OK') return ''` : un appelant
 *     qui n avait RIEN mesure obtenait le meme silence qu une lecture reussie. Le test l a attrapee.
 *     Un absent doit PARLER ; seul un succes a le droit de se taire. */
export function phraseEspacements(r) {
  if (!r || typeof r !== 'object') return 'tick spacings not read — unknown';
  if (r.etat === 'OK') return '';
  if (r.etat === 'RETOMBEE') return 'tick spacings from the 2026-09-30 snapshot, not the factory — ' + (r.pourquoi || '');
  return 'tick spacings not read — ' + ((r && r.pourquoi) || 'unknown');
}
