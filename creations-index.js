// creations-index.js — ce que l index des createurs du SERVEUR couvre deja, et ce qui reste a lire depuis le navigateur.
// ================================================================================================
// ⛔⛔ MESURE DU 2026-10-25 (navigateur integre, 375 px, serveur local de ce depot, wallet en LECTURE SEULE pose par un temoin,
//     localStorage vide, page + Wallet + Bank, 60 s) : 237 requetes JSON-RPC du navigateur vers les noeuds publics, dont 70
//     eth_getLogs ; la Wallet disait « ⚠️ 17 chain window(s) refused by the node » — le chiffre exact du testeur en prod.
//     Cause : `mesCreations` relisait 43 200 blocs de la factory (22 fenetres de 1 999) DEPUIS LE NAVIGATEUR, puis la tx de
//     chaque creation trouvee (56 eth_getTransactionByHash), pour trouver les blocks de CE compte. Les fenetres a plus de
//     ~10 000 blocs sous la tete n ont qu un noeud capable (publicnode refuse l archive) : mainnet.base.org, qui rendait 429,
//     puis etait mis en pause — 17 fenetres sur 22 refusees.
//   ⇒ Or le serveur scanne deja ces creations et retient QUI a cree (`/api/blocks-de`). En prod, le meme jour :
//     couvertureComplete true, 0 trou, 0 createur non resolu. Le navigateur relisait ce que le serveur savait deja.
// ⛔ CE MODULE NE DECIDE QU UNE CHOSE : quelles plages le navigateur doit ENCORE lire. Tout ce que l index ne couvre pas de
//   facon PROUVEE (bornes absentes, trou nomme, liste tronquee, index qui ne remonte pas jusqu au debut de la fenetre) est relu
//   comme avant. Un doute = l ancien comportement, jamais une plage tue. Une fenetre refusee reste « non lue » et se dit.
// ⚠️ CE QU IL NE PROUVE PAS : que l index soit juste. Il le croit sur ses bornes publiees ; le serveur les calcule (serveur-web.js).

/** Au-dela, la liste est tronquee : le navigateur ne peut plus savoir ce qui manque, il relit tout. */
export const INDEX_TROUS_MAX = 40;
export const INDEX_NON_RESOLUS_MAX = 40;

const entier = (x) => Number.isSafeInteger(x) && x >= 0;

/**
 * Cote SERVEUR : les bornes de l index des createurs, telles que le navigateur peut s y fier.
 * `blocsLusJusqua` = tete du scan vers l avant ; `rattrapageDepuis` = curseur du rattrapage vers le passe ;
 * entre les deux, tout a ete lu SAUF les trous nommes (`trous`). `couvertureComplete` = le rattrapage a touche `plancher`.
 */
export function bornesIndex({ blocsLusJusqua, rattrapageDepuis, couvertureComplete, plancher, trous = [], nonResolus = [], faitsDepuis = null }) {
  const lu = entier(blocsLusJusqua) ? blocsLusJusqua : null;
  const depuis = couvertureComplete && entier(plancher) ? plancher : (entier(rattrapageDepuis) ? rattrapageDepuis : null);
  const sains = (Array.isArray(trous) ? trous : []).filter((t) => t && entier(t.de) && entier(t.a) && t.a >= t.de)
    .map((t) => ({ de: t.de, a: t.a }));
  /* seuls les trous recents interessent un navigateur (sa fenetre fait 43 200 blocs) ; les autres restent dans /sante */
  const recents = lu === null ? sains : sains.filter((t) => t.a >= lu - 200000);
  const nr = (Array.isArray(nonResolus) ? nonResolus : []).filter((c) => c && /^0x[0-9a-f]{40}$/.test(String(c.jeton || '')))
    .map((c) => ({ jeton: String(c.jeton), tx: /^0x[0-9a-fA-F]{64}$/.test(String(c.tx || '')) ? c.tx : null }));
  return {
    luJusqua: lu,
    couvertDepuis: depuis,
    trousPlages: recents.slice(0, INDEX_TROUS_MAX),
    trousTronques: recents.length > INDEX_TROUS_MAX,
    nonResolus: nr.slice(0, INDEX_NON_RESOLUS_MAX),
    nonResolusTronques: nr.length > INDEX_NON_RESOLUS_MAX,
    /* ⛔⛔ 2026-10-25 (revue adverse de 2855ce8) : a partir de ce bloc, le serveur garde le SYMBOLE et le BLOC de creation de chaque
     *   creation qu il a lue (`faitsCreation`). En dessous, il ne les a pas : le navigateur relit cette partie de sa fenetre lui-meme,
     *   sinon un block cree aujourd hui s affichait « ? » et perdait sa place (le plus recent d abord). Absent = tout relire. */
    faitsDepuis: entier(faitsDepuis) ? faitsDepuis : null,
  };
}

/** Au-dela, la liste des creations servies est tronquee : la Map relit sa fenetre entiere. */
export const CREATIONS_SERVIES_MAX = 8000;

/**
 * Cote SERVEUR : les faits gardes d une creation lue par un scan de la factory (bloc + symbole), pour /api/blocks-de et
 * /api/creations-recentes. `faits` = Map jeton -> { bloc, symbole }. Rend le nombre de creations notees.
 */
export function noterFaitsCreations(faits, creations) {
  let n = 0;
  for (const c of creations || []) {
    const j = String((c && c.jeton) || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(j) || !entier(c.bloc)) continue;
    /* `decimales` et `nom` aussi : la Map les passe a `creationsLues`, ou le fil Live lit les decimales d un montant (sans elles :
     *   « amount not read ») et la recherche lit le nom — le log de creation les porte, comme quand le navigateur le lisait. */
    faits.set(j, { bloc: c.bloc, symbole: typeof c.symbole === 'string' && c.symbole ? c.symbole.slice(0, 32) : null,
      decimales: Number.isInteger(c.decimales) && c.decimales >= 0 && c.decimales <= 255 ? c.decimales : null,
      nom: typeof c.nom === 'string' && c.nom ? c.nom.slice(0, 48) : null });
    n++;
  }
  return n;
}

/** Tri « le plus recent d abord » : bloc decroissant, les entrees sans bloc a la fin, dans leur ordre (stable). */
export function plusRecentesDabord(liste) {
  return (liste || []).map((c, i) => ({ c, i })).sort((x, y) => {
    const a = entier(x.c && x.c.bloc) ? x.c.bloc : -1, b = entier(y.c && y.c.bloc) ? y.c.bloc : -1;
    return b - a || x.i - y.i;
  }).map((x) => x.c);
}

/**
 * Cote NAVIGATEUR : pour la fenetre [tete - blocs, tete], les plages a lire soi-meme.
 * Rend { mode: 'INDEX', plages, aResoudre, blocsIci } ou { mode: 'CHAINE', plages: [fenetre entiere], pourquoi }.
 * `aResoudre` = les creations que le serveur n a pas pu attribuer : le navigateur lit leur tx, comme avant.
 */
export function planCreations({ index, tete, blocs }) {
  const debut = Math.max(0, tete - blocs);
  const chaine = (pourquoi) => ({ mode: 'CHAINE', plages: [{ de: debut, a: tete }], aResoudre: [], blocsIci: tete - debut + 1, pourquoi });
  if (!entier(tete) || !entier(blocs)) return chaine('chain head not read');
  if (!index || index.ok !== true) return chaine('server index not read');
  const lu = index.luJusqua, depuis = index.couvertDepuis;
  if (!entier(lu) || !entier(depuis)) return chaine('server index bounds not served');
  if (depuis > debut) return chaine('server index does not reach back to block ' + debut);
  if (index.trousTronques !== false || index.nonResolusTronques !== false
    || !Array.isArray(index.trousPlages) || !Array.isArray(index.nonResolus)) return chaine('server index gaps not fully listed');
  const faitsDepuis = index.faitsDepuis;
  if (!entier(faitsDepuis)) return chaine('server index does not serve creation details');
  const brutes = [];
  if (lu < tete) brutes.push({ de: Math.max(debut, lu + 1), a: tete });
  /* sous `faitsDepuis` le serveur n a ni symbole ni bloc de creation : cette partie de la fenetre est relue ici */
  if (faitsDepuis > debut) brutes.push({ de: debut, a: Math.min(tete, faitsDepuis - 1) });
  for (const t of index.trousPlages) {
    if (!t || !entier(t.de) || !entier(t.a)) return chaine('server index gap malformed');
    const de = Math.max(t.de, debut), a = Math.min(t.a, tete);
    if (a >= de) brutes.push({ de, a });
  }
  brutes.sort((x, y) => x.de - y.de);
  const plages = [];
  for (const p of brutes) {
    const der = plages[plages.length - 1];
    if (der && p.de <= der.a + 1) der.a = Math.max(der.a, p.a); else plages.push({ ...p });
  }
  const blocsIci = plages.reduce((s, p) => s + (p.a - p.de + 1), 0);
  if (blocsIci >= tete - debut + 1) return chaine('server index covers none of the window');
  const aResoudre = index.nonResolus.filter((c) => c && /^0x[0-9a-fA-F]{40}$/.test(String(c.jeton || '')) && c.tx)
    .map((c) => ({ jeton: String(c.jeton).toLowerCase(), tx: c.tx, depuisIndex: true }));
  /* un non resolu SANS tx ne peut pas etre attribue ici non plus : on relit la fenetre entiere, comme avant */
  if (aResoudre.length !== index.nonResolus.length) return chaine('an unresolved creation carries no transaction');
  return { mode: 'INDEX', plages, aResoudre, blocsIci };
}

/**
 * Cote NAVIGATEUR : lit les plages d un plan (`planCreations`) avec le vrai `listerCreations`. Rend la forme de `listerCreations`
 * ({ creations, fenetre, fenetresRatees }) sur la fenetre ENTIERE annoncee, plus `parIndex`. Une plage refusee reste dans
 * `fenetresRatees` : non lue, jamais vide.
 */
export async function lirePlages({ rpc, listerCreations, plan, tete, blocs }) {
  const r = { creations: [], fenetre: { de: Math.max(0, tete - blocs), a: tete }, fenetresRatees: [],
    parIndex: { plages: plan.plages.length, blocsIci: plan.blocsIci } };
  for (const p of plan.plages) {
    const x = await listerCreations({ rpc, blocs: p.a - p.de, fin: p.a });
    r.creations.push(...(x.creations || []));
    r.fenetresRatees.push(...(x.fenetresRatees || []));
  }
  return r;
}

/**
 * ⛔⛔ LA MAP (2026-10-25, mesure : son propre balayage de 43 200 blocs de la factory, 22 getLogs depuis le navigateur, etait la
 *   premiere charge restante sur mainnet.base.org — le seul noeud public qui sert les fenetres a plus de ~10 000 blocs).
 *   Les creations que le serveur a deja lues (`/api/creations-recentes`, memes bornes que /api/blocks-de) viennent de lui ; le
 *   navigateur ne lit que ce que ces bornes ne couvrent pas. Index absent, ancien, tronque, troue sans liste : la fenetre entiere,
 *   EXACTEMENT comme avant. Rend la forme de `listerCreations`, du plus recent au plus ancien.
 * ⚠️ NE PROUVE PAS que l index soit juste : il est cru sur ses bornes publiees (test-creations-index-serveur-20261025 les
 *   verifie contre ce que le vrai serveur a reellement lu).
 */
export async function creationsDeLaCarte({ rpc, fetch, listerCreations, blocs = 43200 }) {
  const tete = parseInt(await rpc('eth_blockNumber', []), 16);
  if (!entier(tete)) return listerCreations({ rpc, blocs });
  const debut = Math.max(0, tete - blocs);
  let index = null;
  try {
    const rep = await fetch('/api/creations-recentes?depuis=' + debut, { cache: 'no-store' });
    index = rep && rep.ok ? await rep.json() : null;
  } catch (_) { index = null; }
  const plan = planCreations({ index, tete, blocs });
  const servies = plan.mode === 'INDEX' && index && index.tronque === false && Array.isArray(index.creations) ? index.creations : null;
  if (!servies) {
    const r = await listerCreations({ rpc, blocs, fin: tete });
    return { ...r, parIndex: null, pourquoi: plan.mode === 'INDEX' ? 'server creations not served' : plan.pourquoi };
  }
  const r = await lirePlages({ rpc, listerCreations, plan, tete, blocs });
  const relue = (b) => plan.plages.some((p) => b >= p.de && b <= p.a);
  const vus = new Set(r.creations.map((c) => String(c.jeton || '').toLowerCase()));
  let duServeur = 0;
  for (const c of servies) {
    const j = String((c && c.jeton) || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(j) || !entier(c.bloc) || c.bloc < debut || c.bloc > tete || relue(c.bloc) || vus.has(j)) continue;
    vus.add(j);
    r.creations.push({ jeton: j, symbole: typeof c.symbole === 'string' ? c.symbole : null, nom: typeof c.nom === 'string' ? c.nom : null,
      decimales: Number.isInteger(c.decimales) ? c.decimales : null, bloc: c.bloc, depuisIndex: true });
    duServeur++;
  }
  r.creations = plusRecentesDabord(r.creations);
  r.parIndex.duServeur = duServeur;
  return r;
}
