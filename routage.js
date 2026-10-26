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
/* ⛔⛔ 2026-10-25 — `routeAction` : LE VERDICT DU SERVEUR pour une action PROUVEE hors de la table mesuree (actions-chaine.js : sa pool
 *   sur la factory de notre routeur, cotee a 10 USDC). Quand il REFUSE, il l emporte sur le dexId de l agregateur : une ligne « aerodrome »
 *   dont la pool atteignable cote 4 % sous son prix moyen n a PAS de Buy, et sa raison est celle mesuree (`raisonServie`). Quand il
 *   accepte, `avecPoolAction` a deja pose sa pool : le verdict ci-dessous la classe comme les autres. Absent : rien ne change. */
export function verdictRoutage({ aMarche, dex = null, poolAdr = null, routeAction = null } = {}) {
  if (!aMarche) return { verdict: 'SANS_MARCHE', dex: null, famille: null, achetableIci: false, achetableEnUsdc: false, achetableEnEth: false };
  if (routeAction && routeAction.achetable === false && typeof routeAction.phrase === 'string' && routeAction.phrase) {
    return { verdict: 'FRANCHISSEMENT', dex: String(dex || '').trim() || null, famille: null, achetableIci: false, achetableEnUsdc: false, achetableEnEth: false,
      raisonServie: { code: String(routeAction.code || 'ROUTE_REFUSEE').replace(/[^A-Z_]/g, '').slice(0, 32) || 'ROUTE_REFUSEE', phrase: routeAction.phrase.slice(0, 220) } };
  }
  const d = String(dex || '').trim() || null;
  /* ⛔ UNE ADRESSE VIDE OU MAL FORMEE NE COMPTE PAS COMME UNE POOL v3. `Boolean('')` serait faux
   *   par accident ; on exige la forme, sinon un champ vide basculerait le verdict en silence. */
  const estV3 = /^0x[0-9a-fA-F]{40}$/.test(String(poolAdr || ''));
  const famille = estV3 ? 'v3' : 'v4';
  if (!d || !DEX_DU_ROUTER.test(d)) {
    /* ⛔ ON CLASSE SUR LE DEX AVANT LA FAMILLE, et c est l inverse de mon premier jet. J avais
     *   classe sur le jeton de cotation : la pool NVIDIA/USDC est cotee en USDC et vit sur
     *   AERODROME — « cotee en USDC » ne dit RIEN de l atteignabilite. Le DEX la dit. */
    /* ⛔⛔ AERODROME EST DEVENU ACHETABLE EN USDC LE 2026-09-28, ET LE MOT « FRANCHISSEMENT » EST
     *     DESORMAIS TROMPEUR POUR CE CAS. Mesure : les 12 pools Aerodrome de notre index sont TOUTES
     *     des paires block/USDC, provenance prouvee 12/12 par aller-retour sur leur factory. Donc
     *     `USDC -> action` ne franchit AUCUNE frontiere — c est un swap sur une seule pool, sans
     *     contrat et sans lot atomique, pour TOUS les wallets.
     *     Le franchissement ne reste necessaire que pour `block (v4) <-> action (Aerodrome)`, qui
     *     traverse bien deux familles.
     *   ⛔ LE VERDICT GARDE SON NOM pour ne pas casser ce qui le lit, mais son drapeau change : ce
     *     serait mentir de laisser `achetableEnUsdc` faux alors que le chemin existe et est simule.
     *   ⚠️ ET LA DISTINCTION RESTE : `achetableIci` demeure FAUX, parce que le chemin v4 de l app ne
     *     sait pas parler a une pool Aerodrome — son routeur n a pas cette factory. */
    const surAerodrome = /^aerodrome$/i.test(d);
    /* ⛔⛔ L ACHAT EN ETH N EST OUVERT QUE SUR AERODROME, ET C EST UNE CONTRAINTE DE CHEMIN, PAS UN
     *     CHOIX. Il passe par `exactInput` du routeur Aerodrome : WETH -> USDC -> action, deux sauts
     *     dans UN appel, avec les trois pools WETH/USDC mesurees comme pivot. Une action dont la pool
     *     vit sur UNISWAP v3 n est pas atteignable par ce routeur — sa factory n est pas la sienne —
     *     donc le drapeau reste faux la, meme si l achat en USDC y marche. */
    return { verdict: 'FRANCHISSEMENT', dex: d, famille, achetableIci: false,
      achetableEnUsdc: surAerodrome && estV3, achetableEnEth: surAerodrome && estV3 };
  }
  /* ⛔ ET AILLEURS `achetableEnEth` EST FAUX : voir les deux retours ci-dessous. */
  /* ⛔⛔ DEUX DRAPEAUX DISTINCTS, ET LES CONFONDRE CASSERAIT L UN DES DEUX CHEMINS.
   *     `achetableIci` pilote le bouton Buy du chemin v4, qui exige NOTRE lecture on-chain
   *     (`etatVie === 'LUE'`) : le laisser vrai sur une pool v3 refabriquerait le parcours mesure de
   *     62 secondes finissant par « creez un autre block ».
   *     `achetableEnUsdc` pilote une affordance SEPAREE, branchee sur `echange-v3.js` : la pool v3
   *     est atteignable par le routeur qu on deploie deja, mais seulement en payant en USDC — les
   *     trois pools mesurees sont block/USDC, et un acheteur en ETH aurait besoin d une commande
   *     d enveloppement dont l octet n est PAS prouve (2/14 transactions seulement).
   *   ⇒ Un seul drapeau pour les deux aurait soit tue le v4, soit promis un achat en ETH qu on ne
   *     sait pas construire. */
  if (estV3) return { verdict: 'CALLDATA_MANQUANT', dex: d, famille, achetableIci: false, achetableEnUsdc: true, achetableEnEth: false };
  return { verdict: 'IN_APP', dex: d, famille, achetableIci: true, achetableEnUsdc: false, achetableEnEth: false };
}

/** ⛔⛔ LA RAISON D UNE LIGNE DU MARKET SANS BUY, TIREE DU MEME VERDICT QUE LE BUY — jamais une phrase fixe.
 *  MESURE 2026-10-23 (prod, DOM de l onglet Market) : ORCLc AVGOc NFLXc DJTc MRNAc n avaient pas de Buy et disaient « its pool cannot
 *  be quoted (empty, or a third-party hook that taxes resale) ». FAUX : leur pool la plus liquide (dexId DexScreener `aero`) a 103 518 $
 *  d USDC (ORCLc), aucun hook — c est une pool CL dont `factory()` rend 0x9cb220581b91b0c83223012fe69688b92ad07a76, et non la factory
 *  0xf8f2…61ef que declare notre routeur Aerodrome (14/14 pools `aero` servies lues au bloc 52 995 302 ; le bytecode du routeur
 *  0x698c…a92f embarque l ancienne factory, pas la nouvelle). Le routeur ne PEUT PAS adresser ces pools : c est la raison, dite.
 *  ⚠️ BORNE : `aero` est le dexId de l agregateur ; la factory est verifiee par le banc test-market-buy-actions-20261003 sur chaque
 *   ligne servie, pas par ce module (il n appelle aucun reseau). Hors `aero`, on nomme le dex et rien de plus : sa profondeur n est
 *   pas mesuree ici, donc la phrase ne dit pas « not empty ».
 *  ⛔ `achetableIci` N ANNULE PAS LA RAISON : sur le Market il n ouvre un Buy que pour une action du registre ; un block v4 sans cle
 *   cotee par le serveur reste NON_COTEE (la phrase d avant, mesuree sur les pools de hooks tiers le 2026-10-18).
 *  @param {object} [o] `liqOk: false` quand la liquidite affichee est sous le seuil du Buy (`liqMin`, en $).
 *  @returns {?{code:'DEX_HORS_ROUTEUR'|'LIQUIDITE_SOUS_SEUIL'|'NON_COTEE', phrase:string}} null seulement si le verdict ouvre un achat
 *   en ETH/USDC et que la liquidite passe : il n y a alors rien a dire, un Buy est rendu. */
/* ⛔ 2026-10-26 `o.refusServi` : la cause LUE SUR LA CHAINE par le serveur (pool-lanceur-taxe.js : liquidite en cours 0, taxe de revente
 *   du hook), servie sur la ligne (`l.achatRefus`). Elle passe AVANT le seuil DexScreener : la lecture de chaine (StateView, hook) est le
 *   fait du moment ; le chiffre de liquidite de l agregateur peut dater. Seuls les codes de ce module sont admis (une phrase d ailleurs ne
 *   passe pas). */
export const CODES_REFUS_SERVI = Object.freeze(['POOL_VIDE', 'POOL_VIDE_TAXE_REVENTE', 'TAXE_REVENTE']);
export function raisonSansBuy(v, o = {}) {
  const rs = o.refusServi;
  if (rs && CODES_REFUS_SERVI.includes(rs.code) && typeof rs.phrase === 'string' && rs.phrase && !(v && (v.achetableEnEth || v.achetableEnUsdc))) {
    return { code: rs.code, phrase: rs.phrase.slice(0, 220) };
  }
  if (o.liqOk === false) {
    const seuil = Number.isFinite(Number(o.liqMin)) ? Math.round(Number(o.liqMin)) : 500;
    return { code: 'LIQUIDITE_SOUS_SEUIL', phrase: 'No buy: less than $' + seuil + ' of liquidity on its market (DexScreener figure).' };
  }
  if (v && (v.achetableEnEth || v.achetableEnUsdc)) return null;
  if (v && v.raisonServie && v.raisonServie.phrase) return { code: v.raisonServie.code, phrase: v.raisonServie.phrase };
  if (v && v.verdict === 'FRANCHISSEMENT') {
    const d = String(v.dex || '').replace(/[^a-z0-9 .-]/gi, '').slice(0, 18);
    /* ⚠️ « newer pool factory » et pas « Aerodrome » : `aero` est l etiquette de DexScreener ; que 0x9cb2… soit la factory officielle
     *   d Aerodrome N EST PAS prouve ici — seule l est sa difference avec celle de notre routeur. */
    const ou = /^aero$/i.test(d) ? 'a newer pool factory ("aero")' : (d || 'a market');
    return { code: 'DEX_HORS_ROUTEUR', phrase: 'No buy here: its deepest pool is on ' + ou + ', which the router this app uses cannot address.' };
  }
  return { code: 'NON_COTEE', phrase: 'No buy: its pool cannot be quoted (empty, or a third-party hook that taxes resale).' };
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
    /* ⛔⛔ CETTE PHRASE A CHANGE LE 2026-09-28 : elle disait « Buy and Sell are not offered here yet ».
     *     Ce n est plus vrai — `echange-v3.js` construit et SIMULE l achat sur ces pools. Mais il le
     *     fait en USDC seulement : les trois pools mesurees sont block/USDC, et un achat en ETH
     *     exigerait une commande d enveloppement dont l octet n est PAS prouve (present dans 2 des
     *     14 transactions avec ETH). Dire « achetable » sans dire « en USDC » promettrait un chemin
     *     qu on ne sait pas construire. */
    return 'This block trades' + ou + ' in a v3 pool, priced in USDC. You can buy it here with USDC — '
      + 'not with ETH yet, because that route needs a step we have not verified. '
      + 'The price above is our own read of that pool.';
  }
  /* ⛔⛔ CETTE PHRASE A CHANGE LE 2026-09-28, ET L ANCIENNE ETAIT DEVENUE FAUSSE. Elle disait « a swap
   *     would have to cross two different pool families, which is not built yet ». Mesure : les 12
   *     pools Aerodrome sont TOUTES des paires block/USDC ⇒ `USDC -> action` ne franchit RIEN, et
   *     c est construit et simule. Ce qui reste hors de portee est l achat en ETH, qui exigerait le
   *     franchissement — et lui n est pas fait. */
  if (v.achetableEnUsdc) {
    return 'This block trades' + ou + ', priced in USDC. You can buy it here with USDC — not with ETH '
      + 'yet, because that route would have to cross two different pool families in one transaction. '
      + 'The price above is our own read of that pool.';
  }
  return 'This block trades' + ou + ', whose pools our router cannot address at all — a swap would have '
    + 'to cross two different pool families in one transaction, which is not built yet. '
    + 'The price above is our own read of that pool.';
}
