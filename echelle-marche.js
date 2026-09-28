/* echelle-marche.js — L ECHELLE DES MARCHES QU ON SUIT, ET LA PHRASE QUI DIT A QUI ELLE EST.
 *
 * ⛔⛔ CE MODULE EXISTE POUR UNE RAISON DE VERITE, PAS DE STRUCTURE. Le chiffre qu il calcule —
 *     des dizaines de millions de dollars de volume sur 24 h — N EST PAS NOTRE VOLUME. C est ce qui
 *     passe sur des marches que notre index SUIT, ouverts par n importe qui sur Base. Affiche sans
 *     ce libelle, ce serait le mensonge le plus rentable de l ecran : il ferait passer l activite
 *     d autrui pour la notre.
 *   ⇒ La somme et la PHRASE sont produites ENSEMBLE, par la meme fonction. On ne peut pas prendre
 *     le nombre sans sa qualification, parce que c est exactement ce qui arriverait sinon.
 *
 * ⛔ CE QUI EST SEPARE, ET RESTE SEPARE. Phil a fait retirer le 2026-09-23 la carte de nos chiffres
 *   d EXPLOITATION (visites, blocks crees ici, echanges faits) — « retire, c est donnee privee ».
 *   Ce module ne les touche pas et n y a pas acces : il ne lit que des lignes de marche publiques,
 *   deja affichees bloc par bloc dans le meme onglet.
 *
 * ⛔ AUCUN RESEAU, AUCUNE HORLOGE : on recoit les lignes deja lues. Une garde le verifie.
 * ⚠️ CE QU IL NE PROUVE PAS : que ces marches soient tous les marches. L index ne voit que les
 *   blocks dont un marche est LISIBLE ; les autres existent et ne sont pas comptes. La phrase le dit.
 */

/** Seuil de liquidite en dessous duquel une ligne ne compte pas comme un marche.
 * ⛔ PAS UN REGLAGE DE CONFORT : une pool a quelques dollars fait du « volume » qui ne se traduit par
 *   aucun echange tenable. La compter gonflerait le total avec du bruit, et gonfler un chiffre qu on
 *   presente comme une echelle serait de la vente. */
export const LIQ_MIN_ECHELLE_USD = 500;

const nb = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };

/**
 * @param {object[]} lignes  les lignes de marche deja lues ({ liquiditeUsd, volume24hUsd, trades24h, dex })
 * @returns {{etat:string, blocks?:number, volume24hUsd?:number, liquiditeUsd?:number,
 *            trades24h?:number, parDex?:object[], phrase?:string, pourquoi?:string}}
 */
export function echelleDesMarches(lignes) {
  /* ⛔⛔ « ON N A RIEN RECU » N EST PAS « IL N Y A RIEN ». Rendre des zeros ici afficherait 0 $ de
   *     volume pendant que l index charge — un zero de panne, indiscernable d un zero de marche
   *     mort. On rend un etat distinct, et l ecran dit « en cours de lecture ». */
  if (!Array.isArray(lignes) || !lignes.length) {
    return { etat: 'NON_LU', pourquoi: 'no market lines were given yet' };
  }
  const gardees = lignes.filter((l) => l && nb(l.liquiditeUsd) >= LIQ_MIN_ECHELLE_USD);
  if (!gardees.length) {
    return { etat: 'AUCUN_MARCHE', pourquoi: 'no line reaches the liquidity floor' };
  }
  const volume24hUsd = gardees.reduce((a, l) => a + nb(l.volume24hUsd), 0);
  const liquiditeUsd = gardees.reduce((a, l) => a + nb(l.liquiditeUsd), 0);
  const trades24h = gardees.reduce((a, l) => a + nb(l.trades24h), 0);

  /* ⛔ LA REPARTITION PAR DEX EST DANS LE MEME CALCUL, parce que c est elle qui rend le total
   *   verifiable : un lecteur peut retrouver ou vit cet argent au lieu de nous croire. */
  const parDexMap = new Map();
  for (const l of gardees) {
    const d = String((l && l.dex) || '?').slice(0, 20);
    const e = parDexMap.get(d) || { dex: d, blocks: 0, liquiditeUsd: 0, volume24hUsd: 0 };
    e.blocks += 1; e.liquiditeUsd += nb(l.liquiditeUsd); e.volume24hUsd += nb(l.volume24hUsd);
    parDexMap.set(d, e);
  }
  const parDex = [...parDexMap.values()].sort((a, b) => b.liquiditeUsd - a.liquiditeUsd);

  return {
    etat: 'LU',
    blocks: gardees.length,
    /* ⛔ ON DIT AUSSI COMBIEN ON A ECARTE. Un total sans son rebut laisse croire qu on a tout compte. */
    ecartees: lignes.length - gardees.length,
    volume24hUsd, liquiditeUsd, trades24h, parDex,
    phrase: phraseEchelle({ blocks: gardees.length, ecartees: lignes.length - gardees.length }),
  };
}

/** La phrase qui dit A QUI est ce volume.
 * ⛔⛔ ELLE EST OBLIGATOIRE ET ELLE EST RENDUE AVEC LES NOMBRES. Sans elle, le total se lit comme le
 *     notre. Elle nomme trois choses : que ces marches sont ouverts par n importe qui, que le
 *     chiffre vient d un index public, et que les blocks sans marche lisible ne sont pas comptes. */
export function phraseEchelle({ blocks, ecartees } = {}) {
  return 'Across the ' + Number(blocks || 0).toLocaleString('en-US') + ' blocks whose market this app '
    + 'can read. These markets are opened by anyone on Base — this is not our volume, and none of it '
    + 'is our revenue. Figures come from a public index'
    + (ecartees ? ', and ' + Number(ecartees).toLocaleString('en-US') + ' thinner line(s) were left out' : '')
    + '. Blocks with no readable market are not counted here.';
}
