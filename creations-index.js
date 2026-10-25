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
export function bornesIndex({ blocsLusJusqua, rattrapageDepuis, couvertureComplete, plancher, trous = [], nonResolus = [] }) {
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
  };
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
  const brutes = [];
  if (lu < tete) brutes.push({ de: Math.max(debut, lu + 1), a: tete });
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
