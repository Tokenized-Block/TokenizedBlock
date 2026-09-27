/* routage.js — DIRE POURQUOI UN MARCHE N EST PAS ECHANGEABLE ICI, AU LIEU DE MASQUER LE BOUTON.
 *
 * ⛔⛔ POURQUOI CE MODULE EXISTE. La garde precedente etait juste mais muette : elle cachait Buy des
 *     que la pool la plus liquide n etait pas une pool Uniswap v4, en disant « on a pool this app
 *     cannot route through yet ». Mesure du 2026-09-27 : cette phrase melange DEUX causes tres
 *     differentes, et l une des deux est bon marche a corriger.
 *
 * ⛔⛔ LA MESURE QUI A SEPARE LES DEUX CAUSES — bytecode du router 0x6ff5693b…99b43 (19 499 octets),
 *     recherche des immutables, avec deux temoins POSITIFS presents et un temoin NEGATIF absent :
 *         PoolManager v4        0x498581ff…  PRESENTE
 *         factory Uniswap v3    0x33128a8f…  PRESENTE
 *         factory Aerodrome CL  0xf8f2eb49…  ABSENTE
 *     ⇒ Le router qu on utilise DEJA sait parler a Uniswap v3 ET v4 dans la meme transaction. Il ne
 *       peut PAS adresser une pool Aerodrome — un router v3 derive l adresse de la pool depuis SA
 *       factory, et celle d Aerodrome n est pas la sienne.
 *
 * ⛔ DONC IL Y A TROIS CAS, PAS DEUX, et les confondre coute une occasion :
 *     - pool Uniswap v4    : notre calldata la sert deja.                      141 blocks mesures
 *     - pool Uniswap v3    : LE ROUTER L ATTEINT, notre calldata ne sait pas
 *                            encore ecrire la commande v3.                       3 blocks,  78 284 $
 *     - pool ailleurs      : franchissement de familles necessaire.             12 blocks, 12 166 295 $
 *   (repartition mesuree sur les 156 blocks de /api/trending a >= 500 $ de liquidite)
 *
 * ⛔ CE MODULE NE SIGNE RIEN, NE CONSTRUIT AUCUN CALLDATA, N APPELLE AUCUN RESEAU. Il CLASSE un
 *   marche deja lu et rend une phrase. C est tout, et c est voulu : le classement doit pouvoir etre
 *   teste sans wallet et sans chaine.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un echange aboutisse. `IN_APP` dit « notre chemin couvre cette
 *   famille de pool », pas « ce swap passera » — le glissement, la profondeur et l etat au bloc
 *   sont ailleurs.
 * ⚠️ SA BORNE, DITE EN CLAIR : il classe sur la pool la PLUS LIQUIDE, celle que le serveur a lue.
 *   Un block peut avoir en plus une pool d une autre famille, plus mince. Et la famille change avec
 *   le marche : MUc a ete vu sur Aerodrome, puis Uniswap v4, puis Uniswap v3 en trois jours.
 */

/** ⛔ LES QUATRE VERDICTS SONT EXHAUSTIFS ET DISJOINTS : tout marche tombe dans exactement un.
 *  Un cinquieme etat « on ne sait pas » serait un trou ou le silence reviendrait. */
export const VERDICTS_ROUTAGE = Object.freeze(['SANS_MARCHE', 'IN_APP', 'CALLDATA_MANQUANT', 'FRANCHISSEMENT']);

/** ⛔ « NOTRE ROUTER ATTEINT CE DEX » — PROUVE PAR LE BYTECODE, PAS SUPPOSE. Uniquement Uniswap :
 *  aerodrome, pancakeswap, sushiswap… ont chacun leur factory, absente de ce router. */
const DEX_DU_ROUTER = /^uniswap$/i;

/**
 * @param {object} m
 * @param {boolean} m.aMarche   un marche a-t-il ete lu pour ce block ?
 * @param {string}  [m.dex]     le dexId rendu par l index (dexscreener), ex. 'uniswap', 'aerodrome'
 * @param {?string} [m.poolAdr] ⛔ LE DISCRIMINANT DE FAMILLE, et il est indirect : une ADRESSE de
 *        contrat (40 hex) quand la pool est v3/CL — une pool v3 EST son contrat — et `null` quand
 *        c est un `poolId` Uniswap v4, puisqu une pool v4 n a pas d adresse et vit dans le
 *        PoolManager. C est le meme champ qui declenche la lecture CL ailleurs : un seul
 *        discriminant pour les deux usages, sinon ils derivent.
 * @returns {{verdict:string, dex:?string, famille:?string, achetableIci:boolean}}
 */
export function verdictRoutage({ aMarche, dex = null, poolAdr = null } = {}) {
  if (!aMarche) return { verdict: 'SANS_MARCHE', dex: null, famille: null, achetableIci: false };
  const d = String(dex || '').trim() || null;
  /* ⛔ UNE ADRESSE VIDE OU MAL FORMEE NE COMPTE PAS COMME UNE POOL v3. `Boolean('')` serait faux
   *   par accident ; on exige la forme, sinon un champ vide basculerait le verdict en silence. */
  const estV3 = /^0x[0-9a-fA-F]{40}$/.test(String(poolAdr || ''));
  const famille = estV3 ? 'v3' : 'v4';
  if (!d || !DEX_DU_ROUTER.test(d)) {
    /* ⛔ ON CLASSE SUR LE DEX AVANT LA FAMILLE, et c est l inverse de mon premier jet. J avais
     *   classe sur le jeton de cotation : la pool NVIDIA/USDC est cotee en USDC et vit sur
     *   AERODROME — « cotee en USDC » ne dit RIEN de l atteignabilite. Le DEX la dit. */
    return { verdict: 'FRANCHISSEMENT', dex: d, famille, achetableIci: false };
  }
  if (estV3) return { verdict: 'CALLDATA_MANQUANT', dex: d, famille, achetableIci: false };
  return { verdict: 'IN_APP', dex: d, famille, achetableIci: true };
}

/** Une phrase pour l ecran, en anglais comme le reste de l app.
 * ⛔ ELLE NOMME LA CAUSE, PAS L ECHEC. « cannot route through yet » ne distingue pas un manque chez
 *   nous d une frontiere technique — et le premier est bon marche a lever, donc le dire compte.
 * ⛔ ET ELLE NE PROMET AUCUNE DATE : « not built yet » est un fait, « coming soon » serait une dette. */
export function phraseRoutage(v) {
  if (!v) return null;
  const ou = v.dex ? ' on ' + String(v.dex).replace(/[^a-z0-9 .-]/gi, '').slice(0, 18) : '';
  if (v.verdict === 'SANS_MARCHE') return null;
  if (v.verdict === 'IN_APP') return null;
  if (v.verdict === 'CALLDATA_MANQUANT') {
    return 'This block trades' + ou + ' in a v3 pool. The router this app already uses can reach it — '
      + 'our swap builder only writes v4 calls so far, so Buy and Sell are not offered here yet. '
      + 'The price above is our own read of that pool.';
  }
  return 'This block trades' + ou + ', whose pools our router cannot address at all — a swap would have '
    + 'to cross two different pool families in one transaction, which is not built yet. '
    + 'The price above is our own read of that pool.';
}
