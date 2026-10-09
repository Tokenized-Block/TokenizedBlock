/**
 * ⛔⛔ UN REPLI POUR LES `eth_getLogs` DU SCAN DES CREATIONS — 2026-10-09, mesure a l appui.
 *
 * Symptome (Phil, capture du 2026-10-09) : « t as plus de blocks affiches sur la map ». La Map ne pose,
 * apres elagage, que les blocks de `/api/trending` ; ce jour-la la prod en rendait 39 lignes, dont 26
 * actions de l emetteur et 13 blocks — la plus recente paire datait du 2026-10-06 14:37 UTC.
 *
 * Cause mesuree : `mainnet.base.org` repond `429 « request limit reached »` a TOUT `eth_getLogs` (meme
 * 10 blocs), pendant qu il sert `eth_blockNumber`, `eth_getCode`, `eth_getBalance` ; son jumeau
 * `developer-access-mainnet.base.org` repond `503`. Ce sont les DEUX seuls noeuds de `rpcServeur`.
 * Le scan des creations rendait donc `fenetresRatees: 40` (≈ 80 000 blocs, ≈ 44 h) et n avancait plus :
 * aucun block ne d apres le 2026-10-07 n entrait dans l index, donc jamais dans le classement, donc
 * jamais sur la Map. Sur les seuls ~10 000 derniers blocs, 23 blocks avaient un marche passant le
 * filtre du classement (liquidite >= 500 $, volume 24 h > 0) — 0 sur 23 etaient servis.
 *
 * Le repli : si le lecteur principal JETTE sur un `eth_getLogs`, on demande au(x) noeud(s) de repli.
 *   ⛔ SEULEMENT `eth_getLogs` : les autres methodes passent deja par le principal.
 *   ⛔ SEULEMENT UN TABLEAU EST UNE REPONSE. Un repli qui rendrait autre chose (null, objet, `0x`)
 *     est une ERREUR, jamais « aucune creation » — une liste vide inventee se confondrait avec une
 *     fenetre calme, et c est exactement la faute que le pin de la factory (app.html) redoutait.
 *   ⛔ L ERREUR DU PRINCIPAL N EST PAS AVALEE : si tous les replis echouent aussi, c est elle qui part,
 *     et la fenetre reste « ratee » chez `listerCreations` — nommee, jamais vide.
 *   ⚠️ CE QUE LE REPLI NE FAIT PAS : l archive. publicnode sert un getLogs a -6 000 blocs et repond
 *     `403 « Archive requests require a personal token »` des -9 000 (mesure du 2026-10-09). Une
 *     fenetre plus profonde reste donc ratee — et le dit. Le scan incremental (toutes les 5 min, ~150
 *     blocs) est, lui, toujours dans la profondeur servie.
 */
export function avecRepliLogs(principal, replis) {
  const liste = Array.isArray(replis) ? replis.filter((f) => typeof f === 'function') : [];
  return async function rpcAvecRepli(methode, params) {
    try {
      return await principal(methode, params);
    } catch (e) {
      if (methode !== 'eth_getLogs' || !liste.length) throw e;
      for (const repli of liste) {
        try {
          const r = await repli(methode, params);
          if (Array.isArray(r)) return r;
        } catch (_) { /* repli suivant */ }
      }
      throw e;
    }
  };
}

/** Un lecteur JSON-RPC minimal sur UNE url (pas de rotation : la liste des replis l ordonne). */
export function lecteurUrl(url, { delai = 15000, fetchImpl = globalThis.fetch } = {}) {
  let id = 0;
  return async function lire(methode, params) {
    const r = await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(delai),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: methode, params }) });
    const j = await r.json();
    if (!j || j.error || j.result === undefined) {
      throw new Error(String((j && j.error && j.error.message) || ('HTTP ' + r.status)).slice(0, 120));
    }
    return j.result;
  };
}
