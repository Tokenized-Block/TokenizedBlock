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
 *   ⛔⛔ SAUF QUAND UN REPLI REFUSE PAR BUDGET (2026-10-09) : le noeud d archive est le DERNIER repli de
 *     `rpcServeur` (serveur-web.js) et, budget du jour epuise, il refuse sans appel (« archive node daily
 *     budget reached »). Ce refus etait avale ici et c est l erreur de base.org qui sortait : un refus
 *     certain jusqu a 00 h UTC se lisait comme un debit passager, et `refusDeBudget` ne pouvait le voir.
 *     Le budget ouvre donc le message (un journal tronque le garde), celui du principal suit ; l erreur
 *     du principal reste en `cause`. Sans refus de budget, rien ne change : c est elle qui part.
 *   ⚠️ CE QUE LE REPLI NE FAIT PAS : l archive. publicnode sert un getLogs a -6 000 blocs et repond
 *     `403 « Archive requests require a personal token »` des -9 000 (mesure du 2026-10-09). Une
 *     fenetre plus profonde reste donc ratee — et le dit. Le scan incremental (toutes les 5 min, ~150
 *     blocs) est, lui, toujours dans la profondeur servie.
 */
/* ⛔ JUMEAU de RE_BUDGET_ARCHIVE (serveur-web.js) — test-rpc-archive-20261009.mjs D1 les lie bout a bout */
const RE_BUDGET_ARCHIVE = /archive node daily budget reached/;
export function avecRepliLogs(principal, replis) {
  const liste = Array.isArray(replis) ? replis.filter((f) => typeof f === 'function') : [];
  return async function rpcAvecRepli(methode, params) {
    try {
      return await principal(methode, params);
    } catch (e) {
      if (methode !== 'eth_getLogs' || !liste.length) throw e;
      let budget = null;
      for (const repli of liste) {
        try {
          const r = await repli(methode, params);
          if (Array.isArray(r)) return r;
        } catch (x) { /* repli suivant — mais un refus de BUDGET est retenu */
          const m = String((x && x.message) || x);
          if (budget === null && RE_BUDGET_ARCHIVE.test(m)) budget = m;
        }
      }
      if (budget !== null) throw new Error(budget + ' (primary node: ' + String((e && e.message) || e) + ')', { cause: e });
      throw e;
    }
  };
}

/**
 * L ISSUE D UNE REQUETE JSON-RPC ENVOYEE, en quatre classes publiables (2026-10-10, compteurs par hote de serveur-web.js) :
 *   'ok'     un `result` rendu (meme `null` ou `0x` : le noeud a REPONDU — ce qu en fait l appelant est son affaire) ;
 *   'limite' HTTP 429, ou une erreur de debit / de plafond (rate, limit, too many, capacity) ;
 *   'erreur' toute autre reponse (403 archive, 413, 5xx, corps illisible, erreur JSON-RPC) ;
 *   'reseau' rien de recu : coupure, delai depasse (`reseau` vrai — c est l appelant qui sait que fetch a leve).
 * ⛔ Pure, ne leve jamais : un compteur ne doit pas casser une lecture.
 */
export function classeEnvoi(statut, corps, reseau = false) {
  if (reseau) return 'reseau';
  const err = corps && typeof corps === 'object' && corps.error ? String(corps.error.message || '') : '';
  if (statut === 429 || /rate|limit|429|too many|capacity/i.test(err)) return 'limite';
  if (corps && typeof corps === 'object' && !corps.error && corps.result !== undefined && statut >= 200 && statut < 300) return 'ok';
  return 'erreur';
}

/** Un lecteur JSON-RPC minimal sur UNE url (pas de rotation : la liste des replis l ordonne).
 *  `surEnvoi(classe)` (2026-10-10, facultatif) : appele UNE fois par requete reellement envoyee, avec son issue (classeEnvoi).
 *  Sans lui, rien ne change. */
export function lecteurUrl(url, { delai = 15000, fetchImpl = globalThis.fetch, surEnvoi = null } = {}) {
  let id = 0;
  const noter = (c) => { if (typeof surEnvoi === 'function') { try { surEnvoi(c); } catch { /* un compteur ne casse jamais une lecture */ } } };
  return async function lire(methode, params) {
    let r;
    try {
      r = await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(delai),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: methode, params }) });
    } catch (e) { noter('reseau'); throw e; }
    let j;
    try { j = await r.json(); } catch (e) { noter(classeEnvoi(r.status, null, /abort|timeout/i.test(String(e && e.name)))); throw e; }
    noter(classeEnvoi(r.status, j));
    if (!j || j.error || j.result === undefined) {
      throw new Error(String((j && j.error && j.error.message) || ('HTTP ' + r.status)).slice(0, 120));
    }
    return j.result;
  };
}
