/* UN CHEMIN A DEUX MONDES -> LES PIECES D UN FRANCHISSEMENT. Decider, sans rien lire.
 *
 * ⭐ LA MISSION DE PHIL (2026-10-01) : « open OUSD a tt les action tokenized et creer le rails avec
 *   des fees sur chaque transaction pour le dev ».
 *   ⇒ Les actions tokenisees vivent sur AERODROME ; OUSD vit sur UNISWAP V4. Un seul `exactInput`
 *     ne traverse QU UNE factory, donc le chemin OUSD -> USDC -> AAPLc a DEUX segments et demande
 *     DEUX appels — qu on envoie en UN LOT ATOMIQUE pour que l acheteur ne se retrouve jamais avec
 *     le pivot au lieu de ce qu il voulait.
 *   ⇒ MESURE DU 2026-10-01 QUI DIT POURQUOI CA COMPTE, sur nos 249 lignes servies :
 *         aerodrome    11 marches    83 728 918 $ de volume 24 h    96,4 %
 *         uniswap     238 marches     3 133 376 $ de volume 24 h     3,6 %
 *     Le rail une-transaction deja livre atteint 237 marches... qui portent 3,6 % du volume. Ces
 *     ONZE-la sont l argent, et ce sont exactement ceux qui demandent ce franchissement.
 *
 * ⛔⛔ CE MODULE NE LIT RIEN, NE COTE RIEN, NE SIGNE RIEN. Il prend un chemin DEJA mesure et rend
 *   les pieces : le sous-chemin de la jambe 1, le pivot, et l actif d arrivee. La resolution de la
 *   pool Aerodrome (`getPool`) et la construction de la jambe 1 restent chez l appelant, parce
 *   qu elles demandent le reseau — et melanger decision et lecture rendrait un refus indistinguable
 *   d une lecture ratee.
 *
 * ⛔⛔⛔ LA FORME EXIGEE EST STRICTE, ET C EST VOLONTAIRE : exactement DEUX segments, le premier
 *   `uniswap-v4`, le second `aerodrome`. Pas « au moins deux ». Pas « dans n importe quel ordre ».
 *   Raison : `planifierFranchissement` bati le lot [jambe1, approve(pivot), jambe2 Aerodrome]. Une
 *   forme differente — trois segments, ou Aerodrome en premier — produirait un lot dont l ordre des
 *   approbations est faux, et ca reverterait APRES la signature, donc apres le gaz. Accepter large
 *   ici serait reporter le refus sur la chaine, aux frais de l acheteur.
 * ⛔ ET ON REFUSE EN DISANT LA FORME QU ON A VUE, pas juste « forme invalide » : un refus qui ne
 *   nomme pas ce qu il a trouve envoie chercher au mauvais endroit.
 */

import { segmenterParFactory } from './pont-de-liquidite.js';

/** Les etats rendus. ⛔ Aucun autre. */
export const ETATS = Object.freeze(['OK', 'REFUSE']);

/** ⛔ L ORDRE EXIGE, ecrit une seule fois pour que le code et le message ne puissent pas diverger. */
export const FORME_EXIGEE = Object.freeze(['uniswap-v4', 'aerodrome']);

const bas = (x) => String(x || '').toLowerCase();

/**
 * @param {object[]} p.chemin  [{ de, vers, famille }] venu de `cheminEntre`
 * @returns {{etat, jambe1, pivot, action, formeVue, pourquoi}}
 *   `jambe1` est le SOUS-CHEMIN du premier segment — a passer tel quel a l assembleur V4.
 *   `pivot`  est le jeton charniere : la sortie du segment 1, l entree du segment 2.
 *   `action` est l actif d arrivee.
 */
export function franchissementDepuisChemin({ chemin } = {}) {
  if (!Array.isArray(chemin) || !chemin.length) {
    return { etat: 'REFUSE', jambe1: null, pivot: null, action: null, formeVue: [],
      pourquoi: 'no path to split' };
  }
  const segments = segmenterParFactory(chemin);
  const formeVue = segments.map((s) => s.famille);
  const refus = (pourquoi) => ({ etat: 'REFUSE', jambe1: null, pivot: null, action: null,
    formeVue, pourquoi });

  if (segments.length !== FORME_EXIGEE.length) {
    return refus('this crossing builds exactly ' + FORME_EXIGEE.length + ' segments ('
      + FORME_EXIGEE.join(' then ') + ') and this path has ' + segments.length + ' ('
      + (formeVue.join(' then ') || 'none') + ')');
  }
  for (const [i, attendue] of FORME_EXIGEE.entries()) {
    if (formeVue[i] !== attendue) {
      return refus('segment ' + (i + 1) + ' must run on ' + attendue + ' and runs on '
        + formeVue[i] + ' — the batch order would be wrong, and that reverts after the signature');
    }
  }
  const seg1 = segments[0], seg2 = segments[1];
  /* ⛔⛔ LE SEGMENT AERODROME DOIT TENIR EN UN SEUL SAUT. `planifierFranchissement` bati sa jambe 2
   *   avec UN `exactInputSingle` (un `tickSpacing`, une pool). Un segment Aerodrome a deux sauts
   *   demanderait un chemin encode et DEUX pools resolues — ce n est pas ce que l assembleur fait,
   *   et lui passer deux sauts construirait un appel vers une pool qui n est pas celle du chemin. */
  if (seg2.sauts.length !== 1) {
    return refus('the aerodrome segment must be a single hop and has ' + seg2.sauts.length
      + ' — the builder takes one tickSpacing and one pool');
  }
  const pivot = bas(seg1.sauts[seg1.sauts.length - 1].vers);
  const action = bas(seg2.sauts[0].vers);
  /* ⛔ LA CHARNIERE DOIT ETRE LA MEME DES DEUX COTES. `cheminEntre` la garantit, mais un appelant
   *   peut passer un chemin bricole : le verifier ici coute une ligne, et ne pas le verifier
   *   produirait un lot qui approuve un jeton et en depense un autre. */
  if (bas(seg2.sauts[0].de) !== pivot) {
    return refus('the two segments do not meet on the same token: segment 1 ends on ' + pivot
      + ' and segment 2 starts on ' + bas(seg2.sauts[0].de));
  }
  if (pivot === action) {
    return refus('the pivot and the destination are the same token');
  }
  return {
    etat: 'OK',
    /* ⛔ LE SOUS-CHEMIN, PAS UNE PAIRE. La jambe 1 peut faire plusieurs sauts V4 (OUSD -> USDC, ou
     *   OUSD -> USDC -> ETH), et l assembleur V4 les prend tous. Rendre seulement « de » et « vers »
     *   perdrait les sauts du milieu et construirait une route qui n existe pas. */
    jambe1: seg1.sauts.map((s) => ({ de: bas(s.de), vers: bas(s.vers), famille: s.famille })),
    pivot,
    action,
    tickSpacingDuSaut: typeof seg2.sauts[0].tickSpacing === 'number' ? seg2.sauts[0].tickSpacing : null,
    formeVue,
    pourquoi: null,
  };
}

/**
 * LA PHRASE DU FRANCHISSEMENT. ⛔ Elle dit UN LOT et DEUX frais, parce que c est la verite.
 *
 * ⛔⛔ DEUX APPELS QUI SWAPPENT = DEUX RETENUES. La jambe 1 paie le bareme degressif sur ce qu on
 *   depense, la jambe 2 paie 0,1 % sur ce qui sort. Annoncer « 0,1 % » tout court serait annoncer
 *   la moitie de ce qu on prend. Phil a demande « des fees sur chaque transaction » : alors chaque
 *   transaction le DIT.
 * ⛔ ET « UNE SIGNATURE » N EST PAS « UNE TRANSACTION ». Le lot atomique groupe TROIS appels sous
 *   une signature quand le wallet le sait ; il reste trois appels on-chain. Dire « une transaction »
 *   serait plus vendeur et faux.
 */
export function phraseFranchissement(r, symboles = {}) {
  if (!r || !ETATS.includes(r.etat)) return 'Crossing: not computed.';
  if (r.etat === 'REFUSE') return 'No crossing: ' + (r.pourquoi || 'unknown') + '.';
  const p = symboles[r.pivot] || 'the bridge asset';
  const a = symboles[r.action] || 'the asset';
  return 'This route crosses two venues: Uniswap to ' + p + ', then Aerodrome to ' + a
    + '. Your wallet can sign them together when it supports batching — three calls, one signature. '
    + 'Each swap carries its own fee.';
}
