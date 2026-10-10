// avoirs.js - CE QUE DETIENT UN COMPTE PARMI LES ACTIFS DU REGISTRE, LU EN LOT (balanceOf, eth_call 'latest' : jamais l archive).
// 2026-10-10 (test prod Grok, wallet 0x31e0) : l onglet Wallet cachait des avoirs (NVDAc absent, USDC intermittent, « 17 chain
//   window(s) refused »). Il ne lisait EN DIRECT qu ETH et USDC ; une action achetee n y venait que si le balayage des JOURNAUX
//   (fenetres de 120 000 blocs) la retrouvait - et les noeuds refusent ces fenetres. Un solde n a pas besoin d histoire : il se lit.
// MESURE (2026-10-10, 71 actions du registre, un lot JSON-RPC) : publicnode 71/71 en 81 ms ; mainnet.base.org 20/20, mais 71 ->
//   5 lus (« 25/second request limit reached ») ; drpc gratuit refuse tout lot de plus de 3. D ou des lots de 20, et le noeud
//   suivant ne reprend QUE ce qui manque.
// ⛔ TROIS ETATS : un solde lu (>0 rendu, 0 compte), un solde NON LU (jamais pris pour zero : son adresse est rendue a part).
export const SEL_BALANCE_OF = '0x70a08231';
export const SEL_DECIMALS = '0x313ce567';
export const TAILLE_LOT = 20;
const ADR = /^0x[0-9a-f]{40}$/;

/** Le corps d un lot : un eth_call `data` (+ le compte en argument s il y en a un) par jeton, ids id0.. dans l ordre. */
export function corpsLot(compte, jetons, id0 = 1, data = SEL_BALANCE_OF) {
  const arg = compte ? String(compte).toLowerCase().slice(2).padStart(64, '0') : '';
  return jetons.map((adr, i) => ({ jsonrpc: '2.0', id: id0 + i, method: 'eth_call', params: [{ to: adr, data: data + arg }, 'latest'] }));
}

/** Lit une reponse de lot : Map id -> BigInt pour les reponses valides (32 octets). Un `0x`, une erreur, un id absent = NON lu. */
export function lireReponseLot(rep) {
  const lus = new Map();
  if (!Array.isArray(rep)) return lus;
  for (const r of rep) {
    if (!r || typeof r !== 'object' || r.error || typeof r.result !== 'string') continue;
    if (!/^0x[0-9a-fA-F]{64}$/.test(r.result)) continue;
    lus.set(Number(r.id), BigInt(r.result));
  }
  return lus;
}

/** La classe d un envoi groupe pour le compteur /sante.envois : un element refuse pour debit = 'limite'. */
export function classeLot(statut, rep) {
  if (!Array.isArray(rep)) return statut === 429 ? 'limite' : 'erreur';
  if (rep.some((r) => r && r.error && /rate|limit|too many|capacity/i.test(String(r.error.message || '')))) return 'limite';
  return statut >= 200 && statut < 300 && rep.every((r) => r && !r.error && typeof r.result === 'string') ? 'ok' : 'erreur';
}

/** Un eth_call par jeton, en lots de `taille`, noeud par noeud : rend Map adr -> BigInt des seuls LUS.
 *  ⛔ MESURE (serveur local, 2026-10-10) : au demarrage, publicnode est deja limite par nos balayages - 14 actifs sur 76 restaient
 *    non lus en UN passage. `passes` : les SEULS manquants sont relus apres une pause (`attendre`, injectable pour les tests). */
export async function lireEnLot({ compte = null, jetons, data, noeuds, envoyer, taille = TAILLE_LOT, passes = 2, attendre = (ms) => new Promise((ok) => setTimeout(ok, ms)) }) {
  const lus = new Map();
  let manquants = [...jetons];
  for (let p = 0; p < passes && manquants.length; p += 1) {
    if (p > 0) await attendre(1500);
    for (let i = 0; i < manquants.length; i += taille) {
      let reste = manquants.slice(i, i + taille);
      for (const url of noeuds || []) {
        if (!reste.length) break;
        let rep = null;
        try { rep = await envoyer(url, corpsLot(compte, reste, 1, data)); } catch (_) { rep = null; }
        const r = lireReponseLot(rep);
        const encore = [];
        reste.forEach((adr, k) => { if (r.has(k + 1)) lus.set(adr, r.get(k + 1)); else encore.push(adr); });
        reste = encore;
      }
    }
    manquants = manquants.filter((a) => !lus.has(a));
  }
  return lus;
}

/**
 * envoyer(url, corps) -> reponse JSON (tableau) ou jette. noeuds : urls dans l ordre d essai. decimalesConnues : Map adr -> nombre
 *   (cache de l appelant, complete ici pour les jetons DETENUS).
 * Rend { etat: 'LU' | 'PARTIEL' | 'NON_LU', avoirs: [{ adr, solde (chaine decimale, > 0), decimales (nombre ou null) }], zeros, nonLus }.
 */
export async function lireAvoirs({ compte, jetons, noeuds, envoyer, taille = TAILLE_LOT, decimalesConnues = new Map(), passes = 2, attendre }) {
  const qui = String(compte || '').toLowerCase();
  if (!ADR.test(qui)) return { etat: 'NON_LU', pourquoi: 'a whole account address is needed', avoirs: [], zeros: 0, nonLus: [] };
  const liste = [...new Set((jetons || []).map((a) => String(a || '').toLowerCase()).filter((a) => ADR.test(a)))];
  const rythme = { passes, ...(attendre ? { attendre } : {}) };
  const soldes = await lireEnLot({ compte: qui, jetons: liste, data: SEL_BALANCE_OF, noeuds, envoyer, taille, ...rythme });
  const detenus = liste.filter((a) => soldes.has(a) && soldes.get(a) > 0n);
  /* les decimales des seuls jetons DETENUS, une fois : une decimale illisible ou hors bornes reste null (jamais « 18 par defaut ») */
  const aLire = detenus.filter((a) => !decimalesConnues.has(a));
  if (aLire.length) {
    const d = await lireEnLot({ jetons: aLire, data: SEL_DECIMALS, noeuds, envoyer, taille, ...rythme });
    for (const [a, v] of d) if (v <= 36n) decimalesConnues.set(a, Number(v));
  }
  const avoirs = detenus.map((adr) => ({ adr, solde: soldes.get(adr).toString(), decimales: decimalesConnues.has(adr) ? decimalesConnues.get(adr) : null }));
  const nonLus = liste.filter((a) => !soldes.has(a));
  const zeros = liste.length - nonLus.length - detenus.length;
  const etat = nonLus.length === 0 ? 'LU' : nonLus.length === liste.length ? 'NON_LU' : 'PARTIEL';
  return { etat, avoirs, zeros, nonLus };
}
