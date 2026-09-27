/* route-multi-sauts.js — TROUVER UN CHEMIN D UN ACTIF A UN BLOCK, ET DIRE CE QU IL VAUT.
 *
 * ⛔⛔ POURQUOI CE MODULE EXISTE. Mesure du 2026-09-27 : notre echange in-app est Uniswap v4 et un
 *     SEUL saut. Un block dont le marche est cote en USDC sur Aerodrome est donc inatteignable
 *     depuis l ETH — parcours mesure sur MUc : clic « Buy », 62 secondes d attente, puis l ecran
 *     propose de creer un AUTRE block.
 *     Le concurrent thestonks.exchange resout exactement ca et le dit sur sa page :
 *         « ETH in or out converts through AMZNc's own Aerodrome pool inside the same transaction »
 *         « ETH route : Aerodrome (ETH -> USDC -> quote) · $2.08M »
 *     Route reelle mesuree chez nous pour RDDTc :
 *         ETH  -> USDC   PancakeSwap  0x72AB388E…2D38   4 872 535 $
 *         USDC -> RDDTc  Aerodrome    0x2C0009a9…Cbc20     15 186 $
 *
 * ⛔⛔ LA REGLE CENTRALE, ET ELLE EST CONTRE-INTUITIVE : UNE ROUTE NE VAUT QUE SA JAMBE LA PLUS
 *     MINCE. Ici 15 186 $, pas 4 872 535 $. Publier la profondeur du plus gros saut — ou pire, la
 *     somme — donnerait un chiffre vrai pour un saut et faux pour le trajet, juste avant que
 *     quelqu un engage de l argent dessus. Le minimum est la seule grandeur qui decrit le trajet.
 *
 * ⛔ CE MODULE NE SIGNE RIEN, NE CONSTRUIT AUCUN CALLDATA ET NE DEPLACE AUCUN FONDS. Il PLANIFIE :
 *   il dit s il existe un chemin, par ou il passe, et ce que chaque jambe porte. La transaction
 *   reste a construire ailleurs, et c est un wallet humain qui l execute.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un echange aboutisse. Une route trouvee est une route POSSIBLE
 *   d apres les pools qu on lui a donnees. Le glissement, les frais de chaque saut et l etat reel
 *   au moment du bloc ne sont pas simules ici.
 */

/** Nombre maximal de sauts. ⛔ PAS UN REGLAGE DE CONFORT : chaque saut ajoute des frais, du
 *  glissement et une pool de plus qui peut etre vide au moment du trade. Trois sauts, c est deja
 *  trois occasions d echouer pour un seul clic. Au-dela, un utilisateur ne peut plus juger ce qu il
 *  signe — et nous non plus. */
export const SAUTS_MAX = 3;

const ADR = /^0x[0-9a-fA-F]{40}$/;
/* ⛔⛔ UNE POOL UNISWAP v4 N A PAS D ADRESSE : elle est identifiee par un `poolId` de 32 octets, et
 *     son etat vit dans le `PoolManager`. Ma premiere version n acceptait que des adresses de
 *     contrat — elle jetait donc EN SILENCE toutes les pools v4.
 *     CE QUE CA COUTAIT, MESURE : sur 45 blocks et 10 actions, le graphe ne contenait que 10 pools
 *     (les pools CL des actions) et AUCUN block n atteignait une action. Les 81 paires « routables »
 *     etaient des actions entre elles, via USDC. Autrement dit, le routeur excluait exactement la
 *     famille ou vivent nos blocks.
 *   ⇒ Les deux formes sont acceptees, et le TYPE voyage avec la jambe : celui qui construira la
 *     transaction doit savoir s il parle au `PoolManager` v4 ou a une pool v3/CL — ce ne sont pas
 *     les memes appels, et confondre les deux echouerait a l execution, pas ici. */
const POOL_ID_V4 = /^0x[0-9a-fA-F]{64}$/;
const familleDePool = (p) => (ADR.test(String(p || '')) ? 'cl' : (POOL_ID_V4.test(String(p || '')) ? 'v4' : null));
const bas = (a) => String(a || '').toLowerCase();

/**
 * @param {object} o
 * @param {string} o.depuis   l actif qu on paie (ETH natif : adresse nulle acceptee)
 * @param {string} o.vers     le block qu on veut
 * @param {object[]} o.marches  pools connues : { pool, dexId, a, b, liquiditeUsd }
 *        ⛔ `a` et `b` sont les DEUX cotes, sans notion de base/quote : une pool s emprunte dans
 *          les deux sens, et forcer un sens ici ferait rater la moitie des routes.
 * @param {number} [o.liqMin]  profondeur minimale exigee de CHAQUE jambe
 * @param {number} [o.sautsMax]
 * @returns {{etat:string, sauts?:object[], profondeurUsd?:number, goulot?:object, pourquoi?:string}}
 */
export function planifierRoute({ depuis, vers, marches, liqMin = 500, sautsMax = SAUTS_MAX } = {}) {
  if (!ADR.test(String(depuis || ''))) return { etat: 'REFUSE', pourquoi: 'a whole source address is required' };
  if (!ADR.test(String(vers || ''))) return { etat: 'REFUSE', pourquoi: 'a whole destination address is required' };
  /* ⛔⛔ UNE LISTE VIDE EST UNE ERREUR D APPEL, PAS UNE ABSENCE DE ROUTE, et mon propre test l a
   *     exige contre moi. « on ne m a rien donne » et « il n existe pas de chemin » sont deux
   *     choses : la premiere est un cablage casse chez nous, la seconde un fait de marche. Les
   *     confondre ferait lire un bug comme une propriete du marche, et personne n irait chercher. */
  if (!Array.isArray(marches) || !marches.length) {
    return { etat: 'REFUSE', pourquoi: 'no pools were provided to route through' };
  }
  const d = bas(depuis), v = bas(vers);
  if (d === v) return { etat: 'REFUSE', pourquoi: 'source and destination are the same asset' };

  /* ⛔ ON NE GARDE QUE DES POOLS UTILISABLES, ET ON LE FAIT AVANT DE CHERCHER. Une pool sous le
   *   seuil n est pas une arete « un peu moins bonne » : c est une arete qui fera echouer le trade.
   *   La laisser entrer produirait des routes qui ont l air de marcher. */
  const aretes = new Map();
  for (const m of marches) {
    if (!m || !ADR.test(String(m.a || '')) || !ADR.test(String(m.b || ''))) continue;
    /* ⛔ LE TYPE DE POOL EST DEDUIT DE LA FORME DE SON IDENTIFIANT, pas suppose : 40 hex = une pool
     *   v3/CL qui EST son contrat, 64 hex = un `poolId` Uniswap v4 adresse par le PoolManager.
     *   Tout le reste est refuse — un identifiant qu on ne sait pas classer ferait echouer la
     *   transaction bien plus loin, sans rien pour remonter jusqu ici. */
    const famille = familleDePool(m.pool);
    if (!famille) continue;
    const liq = Number(m.liquiditeUsd);
    if (!Number.isFinite(liq) || liq < liqMin) continue;
    const A = bas(m.a), B = bas(m.b);
    if (A === B) continue;
    for (const [x, y] of [[A, B], [B, A]]) {
      if (!aretes.has(x)) aretes.set(x, []);
      aretes.get(x).push({ vers: y, pool: bas(m.pool), famille,
        dex: String(m.dexId || '?').slice(0, 20), liquiditeUsd: liq });
    }
  }
  if (!aretes.has(d)) return { etat: 'SANS_ROUTE', pourquoi: 'nothing pairs with the asset you are paying with' };

  /* ⛔⛔ PARCOURS EN LARGEUR, PAS EN PROFONDEUR : on veut la route la plus COURTE d abord, parce que
   *     chaque saut coute des frais et du glissement. Une route a deux sauts plus profonde reste
   *     preferable a une route a trois sauts, et la largeur la trouve en premier par construction.
   *   ⛔ ET A EGALITE DE LONGUEUR, ON GARDE LA PLUS PROFONDE — c est-a-dire celle dont le GOULOT est
   *     le plus large. Sans ce depart, on rendrait la premiere route trouvee, qui n a aucune raison
   *     d etre la meilleure. */
  let meilleure = null;
  const file = [{ actif: d, sauts: [], vus: new Set([d]) }];
  while (file.length) {
    const cur = file.shift();
    if (meilleure && cur.sauts.length >= meilleure.sauts.length) continue;
    for (const a of (aretes.get(cur.actif) || [])) {
      /* ⛔ ON NE REPASSE PAS PAR UN ACTIF DEJA TRAVERSE : un cycle rallonge la route sans jamais
       *   l ameliorer, et une file non bornee sur un graphe de milliers de pools ne rend jamais. */
      if (cur.vus.has(a.vers)) continue;
      const sauts = [...cur.sauts, { de: cur.actif, vers: a.vers, pool: a.pool, famille: a.famille, dex: a.dex, liquiditeUsd: a.liquiditeUsd }];
      if (a.vers === v) {
        const goulot = sauts.reduce((p, s) => (s.liquiditeUsd < p.liquiditeUsd ? s : p), sauts[0]);
        const cand = { sauts, goulot, profondeurUsd: goulot.liquiditeUsd };
        /* plus court d abord ; a longueur egale, le goulot le plus large */
        if (!meilleure || sauts.length < meilleure.sauts.length
          || (sauts.length === meilleure.sauts.length && cand.profondeurUsd > meilleure.profondeurUsd)) {
          meilleure = cand;
        }
        continue;
      }
      if (sauts.length >= sautsMax) continue;
      file.push({ actif: a.vers, sauts, vus: new Set([...cur.vus, a.vers]) });
    }
  }
  if (!meilleure) {
    return { etat: 'SANS_ROUTE',
      pourquoi: 'no path of ' + sautsMax + ' hops or fewer, through pools deep enough to be usable' };
  }
  return {
    etat: 'TROUVEE',
    sauts: meilleure.sauts,
    /* ⛔⛔ LA PROFONDEUR DE LA ROUTE EST CELLE DE SA JAMBE LA PLUS MINCE. Jamais la plus grosse,
     *     jamais la somme : un trajet ne fait pas passer plus que son goulot, et annoncer autre
     *     chose serait un chiffre vrai pour un saut et faux pour le trajet. */
    profondeurUsd: meilleure.profondeurUsd,
    goulot: meilleure.goulot,
  };
}

/** Une phrase pour l ecran. ⛔ ELLE NOMME LE GOULOT, pas la plus grosse jambe : c est lui qui
 *  decide de ce qui passe, et le cacher rendrait la route plus large qu elle n est. */
export function phraseRoute(r) {
  if (!r || r.etat !== 'TROUVEE') return null;
  const chemin = r.sauts.map((s) => s.dex).join(' → ');
  return r.sauts.length + (r.sauts.length > 1 ? ' hops' : ' hop') + ' · ' + chemin
    + ' · depth is the thinnest leg: $' + Math.round(r.profondeurUsd).toLocaleString('en-US');
}
