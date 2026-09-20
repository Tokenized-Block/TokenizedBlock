/* regle-snapshot.js — QUEL bloc est photographie pour une periode de recompense.
 *
 * ⛔⛔ LA PROPRIETE QU ON ACHETE, ET LA SEULE : personne ne peut savoir a l avance quel bloc sera
 *    photographie, et TOUT LE MONDE peut le recalculer apres coup. Sans la premiere moitie, il suffit
 *    d acheter juste avant la photo puis de revendre : la recompense paierait exactement le
 *    comportement qu elle est censee decourager. Sans la seconde, c est « faites-nous confiance ».
 *
 * ⛔ LE TIRAGE DESIGNE UN BLOC DEJA PASSE. La graine est prise a la FIN de la periode et designe un
 *    bloc A L INTERIEUR de la periode, donc deja mine. Quand le resultat est connu, il est trop tard
 *    pour agir : c est ce qui rend le flash-buy inutile.
 *    ⚠️ Un tirage qui designerait un bloc FUTUR laisserait une fenetre pour acheter entre la
 *       revelation et la photo. C est l erreur a ne pas faire, et elle est facile a faire.
 *
 * ⛔ LA GRAINE EST prevRandao (champ `mixHash`), PAS LE BLOCKHASH. Mesure du 2026-09-20 sur Base :
 *    les blocs 51570374 et 51570375 portent le MEME mixHash, et il change environ tous les 6 blocs —
 *    soit un slot L1 de 12 s pour des blocs L2 de 2 s. Autrement dit, il vient du beacon L1 : le
 *    sequenceur de Base ne le fabrique pas, alors qu il fabrique le blockhash.
 *    ⚠️ CE QUI RESTE VRAI QUAND MEME, et qui doit etre dit : un proposeur L1 peut, au prix de sauter
 *       son tour, influencer le RANDAO. C est l hypothese de tout systeme bati sur RANDAO. On ne
 *       pretend pas a mieux.
 *    ⚠️ ET COMME mixHash NE CHANGE QUE TOUS LES ~6 BLOCS : choisir `fin` a l avance et publiquement
 *       ne donne AUCUN avantage, puisque le tirage porte sur le passe. Mais deux periodes qui
 *       finiraient dans le meme slot L1 partageraient leur graine — d ou `grainesDistinctes`.
 */

export const ETATS_SNAPSHOT = Object.freeze(['TIRE', 'GRAINE_ABSENTE', 'PERIODE_INVALIDE']);

const GRAINE_NULLE = '0x' + '0'.repeat(64);

/**
 * Tire le bloc a photographier pour une periode [debut, fin].
 *
 * @param {object} e
 * @param {number} e.debut   premier bloc de la periode (inclus)
 * @param {number} e.fin     dernier bloc de la periode (inclus) — c est de LUI qu on prend la graine
 * @param {string} e.graine  le `mixHash` du bloc `fin`, lu sur la chaine
 * @returns {{etat:string, cible:number|null, pourquoi?:string, taille?:number}}
 */
export function blocDeSnapshot({ debut, fin, graine }) {
  if (!Number.isInteger(debut) || !Number.isInteger(fin) || debut < 0 || fin < debut) {
    return { etat: 'PERIODE_INVALIDE', cible: null,
      pourquoi: 'a period needs whole blocks with fin >= debut (got ' + debut + ' → ' + fin + ')' };
  }
  /* ⛔ UNE GRAINE ABSENTE OU NULLE ANNULE LA PERIODE, ELLE NE SE REMPLACE PAS. Retomber en silence
   *    sur le blockhash rendrait le tirage grindable par le sequenceur sans que personne ne le voie —
   *    une degradation invisible est pire qu un refus. */
  if (typeof graine !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(graine) || graine === GRAINE_NULLE) {
    return { etat: 'GRAINE_ABSENTE', cible: null,
      pourquoi: 'block ' + fin + ' carries no usable prevRandao — this period is void, not guessed' };
  }
  const taille = BigInt(fin - debut + 1);
  const cible = debut + Number(BigInt(graine) % taille);
  return { etat: 'TIRE', cible, taille: Number(taille) };
}

/**
 * Rejoue le tirage a partir de ce qu on peut relire sur la chaine, et dit s il CONCORDE.
 * ⛔ C est la fonction qu un tiers utilise pour nous contredire. Elle ne doit donc rien recalculer
 *    autrement que `blocDeSnapshot` : elle l APPELLE, elle n en fait pas une copie.
 */
export function verifierTirage({ debut, fin, graine, ciblePretendue }) {
  const r = blocDeSnapshot({ debut, fin, graine });
  if (r.etat !== 'TIRE') return { ...r, concorde: false };
  return { ...r, concorde: r.cible === ciblePretendue };
}

/**
 * Deux periodes qui finissent dans le meme slot L1 partagent leur graine (mesure : mixHash change
 * environ tous les 6 blocs sur Base). Rendre des graines identiques serait un tirage rejouable.
 * ⛔ On ne corrige pas en silence : on NOMME les doublons pour que l appelant decale une periode.
 */
export function grainesDistinctes(periodes) {
  const vues = new Map();
  const doublons = [];
  for (const p of periodes || []) {
    const g = String(p && p.graine || '').toLowerCase();
    if (!g) continue;
    if (vues.has(g)) doublons.push({ graine: g, fins: [vues.get(g), p.fin] });
    else vues.set(g, p.fin);
  }
  return { ok: doublons.length === 0, doublons };
}
