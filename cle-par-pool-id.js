// cle-par-pool-id.js - LA CLE V4 D UN BLOCK, LUE SUR LA CHAINE A PARTIR DU poolId QUE LE FIL DE MARCHE VOIT DEJA.
//
// ⛔⛔ MESURE (prod 20261025-game46, /api/trending, 194 lignes) : 153 lignes SANS cle de pool connue du serveur, 0 achetable.
//   ADOF (0xb200000000000000000000d83f3b67055baa2938) : /api/rails/plan REFUSE depuis ETH comme depuis USDC, « no initialized pool
//   among the 15 keys read » ; /api/cle : NON_LU « not a list » / « no Initialize found in the last 39960 blocks ».
//   CAUSE : la cle se cherchait par PROFONDEUR (10 fenetres de 999 blocs pour un plan, 40 pour /api/cle), en remontant depuis la
//   tete. Une pool nee il y a plus de ~5 h (10 fenetres, 2 s par bloc mesures le 2026-10-25 : 100 000 blocs = 200 000 s) n est pas
//   dans la fenetre d un plan ; au-dela de ~9 000 blocs, seul le noeud d archive sert les logs.
//   OR DexScreener rend deja, pour une pool v4, son poolId (`pairAddress`, 66 caracteres) et sa date (`pairCreatedAt`).
// ⇒ CE MODULE : de la DATE, le bloc (lu sur la chaine : horodatage de la tete puis d un bloc estime, corrige par secante) ; puis UN
//   eth_getLogs sur le PoolManager, filtre par le topic Initialize ET ce poolId, sur une fenetre etroite autour de ce bloc.
// ⛔ LA DATE ET LE poolId SONT DES INDICES D UN AGREGATEUR, PAS DES PREUVES. La preuve est le log : decoderInitialize exige que le
//   poolId se RECALCULE depuis la cle (keccak) ; la cle doit contenir le jeton demande ; le log doit venir du PoolManager. Un indice
//   faux ne peut rendre qu une absence pres de sa date, jamais une cle fausse.
// ⛔ TROIS ETATS, JAMAIS DEUX : LUE (la cle) ; ABSENTE_PRES_DE_LA_DATE (fenetre LUE, aucun Initialize de ce poolId : ce n est PAS
//   « ce block n a pas de pool », seulement « pas pres de cette date ») ; NON_LUE (une lecture refusee ou une reponse qui n est pas
//   une liste / pas un bloc : rien n est affirme). Plus HORS_JETON (log trouve, mais la cle ne contient pas ce jeton : refusee).
// Lecture seule. Ne signe rien, n envoie rien.
import { decoderInitialize } from './pools-du-jeton.js';

export const PM_V4_BASE = '0x498581ff718922c3f8e6a244956af099b2652b2b';
export const TOPIC_INITIALIZE_V4 = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
/** demi-largeur de la fenetre autour du bloc estime : 999 blocs de part et d autre (~33 min a 2 s), un seul getLogs */
export const MARGE_BLOCS = 999;
const ADR = /^0x[0-9a-f]{40}$/;
const ID = /^0x[0-9a-f]{64}$/;
const bas = (x) => String(x || '').toLowerCase();
const hex = (n) => '0x' + n.toString(16);

/** l horodatage (s) d un bloc, lu ; leve si la reponse n est pas un bloc */
async function horodatage(rpc, n) {
  const b = await rpc('eth_getBlockByNumber', [hex(n), false]);
  const t = b && typeof b.timestamp === 'string' ? parseInt(b.timestamp, 16) : NaN;
  if (!Number.isSafeInteger(t) || t <= 0) throw new Error('block ' + n + ' not read');
  return t;
}

/**
 * Le bloc d une date, LU : horodatage de la tete, puis d un bloc estime ; l ecart restant est corrige par la pente mesuree entre les
 * deux (secante), au plus `essais` fois. Rend { etat: 'LU', bloc, ecartS } ou { etat: 'NON_LU', pourquoi }.
 */
export async function blocDeDate({ rpc, tsS, tete, essais = 3 } = {}) {
  if (typeof rpc !== 'function' || !Number.isSafeInteger(tsS) || tsS <= 0 || !Number.isSafeInteger(tete) || tete <= 0) {
    return { etat: 'NON_LU', pourquoi: 'date or chain head missing' };
  }
  try {
    const tTete = await horodatage(rpc, tete);
    if (tsS > tTete) return { etat: 'NON_LU', pourquoi: 'the date is after the chain head' };
    /* premiere estimation : 2 s par bloc (Base, mesure 2026-10-25) ; ensuite la pente LUE */
    let a = { n: tete, t: tTete };
    let n = Math.max(1, tete - Math.round((tTete - tsS) / 2));
    for (let i = 0; i < essais; i += 1) {
      const t = await horodatage(rpc, n);
      if (Math.abs(t - tsS) <= 2) return { etat: 'LU', bloc: n, ecartS: t - tsS };
      const pente = (a.t - t) / (a.n - n || 1);
      const suivant = Math.max(1, Math.min(tete, Math.round(n + (tsS - t) / (pente > 0 ? pente : 2))));
      a = { n, t };
      if (suivant === n) return { etat: 'LU', bloc: n, ecartS: t - tsS };
      n = suivant;
    }
    const t = await horodatage(rpc, n);
    return { etat: 'LU', bloc: n, ecartS: t - tsS };
  } catch (e) {
    return { etat: 'NON_LU', pourquoi: String((e && e.message) || e).slice(0, 120) };
  }
}

/**
 * La cle d une pool v4 par son poolId, cherchee autour de la date donnee par l agregateur.
 * @param {{ rpc:Function, rpcLogs?:Function, poolId:string, jeton:string, creeLeMs:number, tete:number, marge?:number }} o
 *   rpc : lecteur (blocs) ; rpcLogs : lecteur des logs (par defaut rpc) — celui du serveur sait ne pas envoyer une fenetre profonde
 *   quand le budget d archive est epuise (et leve : NON_LUE).
 * @returns {Promise<{etat:'LUE', cle:object, poolId:string, bloc:number} | {etat:'ABSENTE_PRES_DE_LA_DATE', depuis:number, jusqua:number,
 *   poolId:string} | {etat:'HORS_JETON', poolId:string, pourquoi:string} | {etat:'NON_LUE', poolId:string, pourquoi:string}>}
 */
export async function clePoolParId({ rpc, rpcLogs = null, poolId, jeton, creeLeMs, tete, marge = MARGE_BLOCS } = {}) {
  const id = bas(poolId), j = bas(jeton);
  const nonLue = (pourquoi) => ({ etat: 'NON_LUE', poolId: id, pourquoi });
  if (!ID.test(id)) return nonLue('not a v4 poolId');
  if (!ADR.test(j)) return nonLue('not a token address');
  const ms = Number(creeLeMs);
  if (!Number.isFinite(ms) || ms <= 0) return nonLue('no creation date for this pool');
  const d = await blocDeDate({ rpc, tsS: Math.floor(ms / 1000), tete });
  if (d.etat !== 'LU') return nonLue('creation block not read: ' + d.pourquoi);
  const depuis = Math.max(1, d.bloc - marge), jusqua = Math.min(tete, d.bloc + marge);
  let logs;
  try {
    logs = await (typeof rpcLogs === 'function' ? rpcLogs : rpc)('eth_getLogs', [{ address: PM_V4_BASE, topics: [TOPIC_INITIALIZE_V4, id], fromBlock: hex(depuis), toBlock: hex(jusqua) }]);
  } catch (e) { return nonLue('Initialize window ' + depuis + '..' + jusqua + ' not read: ' + String((e && e.message) || e).slice(0, 100)); }
  /* ⛔ SEULE UNE LISTE EST UNE REPONSE : null, '0x', un objet sont un refus, pas une fenetre vide */
  if (!Array.isArray(logs)) return nonLue('Initialize window ' + depuis + '..' + jusqua + ' not read: not a list');
  for (const l of logs) {
    if (bas(l && l.address) !== PM_V4_BASE) continue; /* un log d un autre contrat ne prouve rien */
    const p = decoderInitialize(l);
    if (!p || p.erreur || !p.cle || bas(p.poolId) !== id) continue;
    if (bas(p.cle.currency0) !== j && bas(p.cle.currency1) !== j) {
      return { etat: 'HORS_JETON', poolId: id, pourquoi: 'this poolId is a pool of ' + p.cle.currency0 + ' / ' + p.cle.currency1 + ', not of this token' };
    }
    return { etat: 'LUE', poolId: id, bloc: p.bloc, cle: { poolId: id, currency0: bas(p.cle.currency0), currency1: bas(p.cle.currency1), fee: p.cle.fee, tickSpacing: p.cle.tickSpacing, hooks: bas(p.cle.hooks), bloc: p.bloc } };
  }
  return { etat: 'ABSENTE_PRES_DE_LA_DATE', poolId: id, depuis, jusqua };
}

/**
 * Les indices (poolId v4, date) que DexScreener rend pour les jetons suivis : `pairAddress` de 66 caracteres sur une paire Base dont
 * le jeton est la base ou la cotation. Pur. Rend Map jeton -> [{ poolId, creeLeMs }] (dedoublonne, au plus `parJeton` par jeton,
 * la plus liquide d abord).
 */
export function indicesPoolIdDepuisPaires(paires, suivis = null, parJeton = 3) {
  const out = new Map();
  const garde = suivis ? new Set([...suivis].map(bas)) : null;
  const liste = (Array.isArray(paires) ? paires : []).filter((p) => p && bas(p.chainId) === 'base' && ID.test(bas(p.pairAddress)))
    .sort((a, b) => (Number(b && b.liquidity && b.liquidity.usd) || 0) - (Number(a && a.liquidity && a.liquidity.usd) || 0));
  for (const p of liste) {
    const ms = Number(p.pairCreatedAt);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    for (const t of [bas(p.baseToken && p.baseToken.address), bas(p.quoteToken && p.quoteToken.address)]) {
      if (!ADR.test(t) || (garde && !garde.has(t))) continue;
      const l = out.get(t) || [];
      if (l.length >= parJeton || l.some((x) => x.poolId === bas(p.pairAddress))) continue;
      l.push({ poolId: bas(p.pairAddress), creeLeMs: ms });
      out.set(t, l);
    }
  }
  return out;
}
