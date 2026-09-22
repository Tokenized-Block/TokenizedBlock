// retirer-fond.js — RENDRE LE FOND D UNE IMAGE TRANSPARENT, SANS ENVOYER L IMAGE NULLE PART.
// ================================================================================================
// ⛔⛔ POURQUOI CE MODULE EXISTE (Phil, 2026-09-22 : « une image avec le fond deja retire pour plus
//     de facilite »). Une photo posee sur une face de cube garde son rectangle de fond, et le cube
//     ressemble alors a un cadre photo colle sur un jouet. Retirer le fond est ce qui fait qu une
//     image APPARTIENT au block au lieu d etre posee dessus.
//
// ⛔ AUCUN SERVICE TIERS, ET CE N EST PAS UN CHOIX D ESTHETE. L image part dans le `contractURI` :
//    elle est GRAVEE et personne ne peut plus la retirer. L envoyer a un service de detourage
//    voudrait dire confier a un tiers une image que son auteur va rendre publique et permanente,
//    sans savoir ce qu il en garde. Tout se fait donc dans le navigateur, sur un canvas.
//
// ⛔ L ALGORITHME EST NOMME, PAS MAGIQUE : remplissage par diffusion depuis les BORDS. On part de
//    tous les pixels du contour, et on efface de voisin en voisin tant que la couleur reste proche
//    de celle echantillonnee. C est exactement ce qui marche sur un fond uni ou degrade doux — une
//    photo de studio, un logo, un rendu 3D — et exactement ce qui ECHOUE sur une photo de rue.
//    ⇒ Le module rend donc TOUJOURS combien de pixels il a effaces, pour que l app puisse dire
//      « ca n a pas marche » au lieu de livrer une image trouee sans rien signaler.
//
// ⛔ PUR ET TESTABLE : il prend et rend des donnees de pixels brutes (`Uint8ClampedArray` RGBA).
//    Aucun DOM, aucun canvas ici — c est l appelant qui fournit les pixels. Trois regressions sont
//    deja parties en production sur le chemin de Create ; ce qui peut etre teste hors navigateur
//    l est.

/** Distance de couleur, en carre, sur les trois canaux. ⛔ On ne prend PAS la racine : comparer des
 *  carres a un seuil au carre donne le meme ordre et evite une racine par pixel voisin. */
function ecart2(p, i, r, v, b) {
  const dr = p[i] - r, dv = p[i + 1] - v, db = p[i + 2] - b;
  return dr * dr + dv * dv + db * db;
}

/**
 * La couleur du fond, echantillonnee sur les QUATRE COINS.
 * ⛔ POURQUOI LES COINS ET PAS UN SEUL PIXEL : un seul coin peut tomber sur une ombre, un filigrane
 *    ou un pixel mort, et tout le detourage suivrait cette erreur. On prend la MEDIANE des quatre
 *    par canal : il faut que deux coins mentent dans le meme sens pour la deplacer.
 * ⛔ Rend `null` si les quatre coins ne sont pas d accord entre eux — au-dela de `seuilAccord`, il
 *    n y a pas de « couleur de fond », et affirmer le contraire produirait un trou au hasard.
 */
export function fondEchantillonne(pixels, largeur, hauteur, seuilAccord = 60) {
  if (!pixels || largeur < 2 || hauteur < 2) return null;
  const coin = (x, y) => {
    const i = (y * largeur + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  };
  const coins = [coin(0, 0), coin(largeur - 1, 0), coin(0, hauteur - 1), coin(largeur - 1, hauteur - 1)];
  const median = (xs) => { const t = [...xs].sort((a, b) => a - b); return Math.round((t[1] + t[2]) / 2); };
  const r = median(coins.map((c) => c[0]));
  const v = median(coins.map((c) => c[1]));
  const b = median(coins.map((c) => c[2]));
  /* ⛔ LE DESACCORD EST UN REFUS, PAS UNE MOYENNE. Quatre coins de couleurs differentes veulent
   *    dire que l image n a pas de fond uni — un detourage y mangerait le sujet. */
  const s2 = seuilAccord * seuilAccord;
  for (const c of coins) {
    const d = (c[0] - r) ** 2 + (c[1] - v) ** 2 + (c[2] - b) ** 2;
    if (d > s2 * 3) return null;
  }
  return { r, v, b };
}

/**
 * Efface le fond par diffusion depuis les bords.
 * @param {Uint8ClampedArray} pixels RGBA, modifie EN PLACE
 * @param {number} largeur
 * @param {number} hauteur
 * @param {{r:number,v:number,b:number}} fond couleur echantillonnee
 * @param {number} tolerance distance de couleur acceptee (0-255 par canal)
 * @returns {{effaces:number, total:number, part:number}}
 *
 * ⛔ DIFFUSION DEPUIS LES BORDS, PAS UN SIMPLE SEUIL SUR TOUTE L IMAGE. Un seuil global effacerait
 *    aussi les pixels blancs A L INTERIEUR du sujet — les yeux, un reflet, une dent. La diffusion
 *    n atteint que ce qui est RELIE au bord, donc le fond, et laisse l interieur intact.
 * ⛔ PILE EXPLICITE, PAS DE RECURSION : une image de 512x512 ferait 262 144 appels imbriques et
 *    ferait sauter la pile du navigateur. La boucle, elle, tient quelle que soit la taille.
 */
export function effacerFond(pixels, largeur, hauteur, fond, tolerance = 32) {
  const total = largeur * hauteur;
  if (!pixels || !fond || total <= 0) return { effaces: 0, total: Math.max(0, total), part: 0 };
  const t2 = tolerance * tolerance * 3;
  const vu = new Uint8Array(total);
  const pile = [];
  /* les quatre bords entrent dans la pile : le fond est ce qui touche le contour */
  for (let x = 0; x < largeur; x++) { pile.push(x); pile.push((hauteur - 1) * largeur + x); }
  for (let y = 0; y < hauteur; y++) { pile.push(y * largeur); pile.push(y * largeur + largeur - 1); }
  let effaces = 0;
  while (pile.length) {
    const p = pile.pop();
    if (vu[p]) continue;
    vu[p] = 1;
    const i = p * 4;
    /* ⛔ UN PIXEL DEJA TRANSPARENT COMPTE COMME DU FOND et propage : une image dont le fond a
     *    DEJA ete retire ailleurs doit traverser ce module sans etre abimee — c est exactement le
     *    cas que Phil demande de rendre facile. */
    if (pixels[i + 3] !== 0 && ecart2(pixels, i, fond.r, fond.v, fond.b) > t2) continue;
    if (pixels[i + 3] !== 0) { pixels[i + 3] = 0; effaces++; }
    const x = p % largeur, y = (p - x) / largeur;
    if (x > 0) pile.push(p - 1);
    if (x < largeur - 1) pile.push(p + 1);
    if (y > 0) pile.push(p - largeur);
    if (y < hauteur - 1) pile.push(p + largeur);
  }
  return { effaces, total, part: effaces / total };
}

/**
 * Le verdict sur un detourage. QUATRE etats — jamais un booleen.
 * ⛔ UN BOOLEEN MENTIRAIT ICI, exactement comme dans `photo.js`. « false » confondrait « pas de
 *    fond uni » (l utilisateur peut choisir une autre image), « ca a mange le sujet » (il peut
 *    baisser la tolerance) et « rien n a bouge » (le fond etait deja transparent, tout va bien).
 *    Trois causes, trois gestes — et le quatrieme etat dit qu on a reussi.
 * ⛔ FAIL-CLOSED : une entree qu on ne sait pas lire rend NON_MESURE, jamais RETIRE.
 */
export function verdictFond({ fond, effaces, total }) {
  if (!Number.isInteger(effaces) || !Number.isInteger(total) || total <= 0) {
    return { etat: 'NON_MESURE', pourquoi: 'the pixels could not be read' };
  }
  if (!fond) {
    return { etat: 'PAS_DE_FOND_UNI',
      pourquoi: 'the four corners do not agree on a colour, so there is no background to remove — '
        + 'the image is kept as it is' };
  }
  const part = effaces / total;
  if (part === 0) {
    return { etat: 'DEJA_TRANSPARENT', part,
      pourquoi: 'nothing needed removing — the background was already transparent' };
  }
  /* ⛔ LE SEUIL HAUT EST UNE GARDE, PAS UNE COQUETTERIE : au-dela de 92 %, ce qui a ete efface
   *    n est plus un fond, c est l image. Livrer ca sans rien dire donnerait un cube vide. */
  if (part > 0.92) {
    return { etat: 'TROP_EFFACE', part,
      pourquoi: Math.round(part * 100) + ' % of the image was removed — that is the subject, not a '
        + 'background. Try a lower tolerance, or an image with a plainer background.' };
  }
  return { etat: 'RETIRE', part,
    pourquoi: Math.round(part * 100) + ' % of the image was background' };
}
