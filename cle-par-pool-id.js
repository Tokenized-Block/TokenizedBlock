// cle-par-pool-id.js - LA CLE V4 D UN BLOCK, LUE SUR LA CHAINE A PARTIR DU poolId QUE LE FIL DE MARCHE VOIT DEJA.
//
// ⛔⛔ MESURE (prod 20261025-game46, /api/trending, 194 lignes) : 153 lignes SANS cle de pool connue du serveur, 0 achetable.
//   ADOF (0xb200000000000000000000d83f3b67055baa2938) : /api/rails/plan REFUSE depuis ETH comme depuis USDC, « no initialized pool
//   among the 15 keys read » ; /api/cle : NON_LU « not a list » / « no Initialize found in the last 39960 blocks ».
//   CAUSE : la cle se cherchait par PROFONDEUR (10 fenetres de 999 blocs pour un plan, 40 pour /api/cle), en remontant depuis la
//   tete. Une pool nee il y a plus de ~5 h (10 fenetres, 2 s par bloc mesures le 2026-10-25 : 100 000 blocs = 200 000 s) n est pas
//   dans la fenetre d un plan ; au-dela de ~9 000 blocs, seul le noeud d archive sert les logs.
//   OR DexScreener rend deja, pour une pool v4, son poolId (`pairAddress`, 66 caracteres) et sa date (`pairCreatedAt`).
// ⇒ CE MODULE : de la DATE, le bloc (lu sur la chaine : horodatage de la tete puis d un bloc estime, encadre puis resserre ; NON_LU
//   si l ecart restant ne tient pas dans la fenetre — 2026-10-26, revue : un temps de bloc qui change 2 s -> 0,2 s rendait un bloc
//   « LU » a 862 500 blocs de la pool, donc une absence fausse retenue 6 h) ; puis UN
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

/** le temps de bloc le plus COURT envisage : 0,2 s (Base « Denim », nov. 2026). Un ecart restant de E secondes peut valoir jusqu a
 *  E / 0,2 blocs : c est cette borne, pas la pente du moment, qui dit si la fenetre de `marge` blocs contient encore la date. */
export const BLOC_S_MIN = 0.2;

/**
 * Le bloc d une date, LU : horodatage de la tete, puis d un bloc estime (2 s par bloc) ; ensuite la date est ENCADREE entre un bloc
 * plus ancien et un plus recent, et l encadrement se resserre par interpolation (secante tant qu il n y a pas de borne basse), avec
 * une bissection des que l interpolation ne le coupe pas de moitie — une chaine dont le temps de bloc CHANGE (2 s -> 0,2 s) ne
 * fait pas tourner la secante en rond. Au plus `essais` lectures apres la tete.
 * ⛔ Rend { etat: 'LU', bloc, ecartS } SEULEMENT si l ecart restant tient dans la fenetre : |ecartS| <= marge x BLOC_S_MIN. Sinon
 *   NON_LU « not converged » : un bloc faux rendu LU ferait lire une fenetre sans la pool, et une absence fausse serait retenue.
 */
export async function blocDeDate({ rpc, tsS, tete, essais = 10, marge = MARGE_BLOCS } = {}) {
  if (typeof rpc !== 'function' || !Number.isSafeInteger(tsS) || tsS <= 0 || !Number.isSafeInteger(tete) || tete <= 0) {
    return { etat: 'NON_LU', pourquoi: 'date or chain head missing' };
  }
  try {
    const tTete = await horodatage(rpc, tete);
    if (tsS > tTete) return { etat: 'NON_LU', pourquoi: 'the date is after the chain head' };
    const tolS = Math.max(2, Math.floor(Math.max(0, Number(marge) || 0) * BLOC_S_MIN));
    let meilleur = { n: tete, t: tTete };
    const rendre = () => (Math.abs(meilleur.t - tsS) <= tolS
      ? { etat: 'LU', bloc: meilleur.n, ecartS: meilleur.t - tsS }
      : { etat: 'NON_LU', pourquoi: 'creation block not converged: block ' + meilleur.n + ' is ' + (meilleur.t - tsS) + ' s from the date (window ' + tolS + ' s)' });
    if (Math.abs(tTete - tsS) <= 2) return rendre();
    /* hi : le plus ancien bloc lu POSTERIEUR a la date (la tete au depart) ; lo : le plus recent ANTERIEUR (aucun au depart).
     *   f = horodatage - date. Interpolation dans l encadrement (regula falsi) avec la correction « Illinois » : quand le MEME cote
     *   est remplace deux fois de suite, le f de l autre borne est divise par deux — sinon une borne restee dans la zone a 0,2 s
     *   fige l interpolation (mesure : 11 lectures sans converger sur une bascule 50 000 blocs apres la pool). */
    let hi = { n: tete, t: tTete, f: tTete - tsS }, lo = null, prec = null, cote = 0;
    /* premiere estimation : 2 s par bloc (Base, mesure 2026-10-25) */
    let n = Math.max(1, tete - Math.round((tTete - tsS) / 2));
    for (let i = 0; i < essais; i += 1) {
      const t = await horodatage(rpc, n);
      if (Math.abs(t - tsS) < Math.abs(meilleur.t - tsS)) meilleur = { n, t };
      if (Math.abs(t - tsS) <= 2) break;
      const point = { n, t, f: t - tsS };
      if (t < tsS) { if (cote === -1 && hi) hi.f /= 2; lo = point; cote = -1; } else { if (cote === 1 && lo) lo.f /= 2; hi = point; cote = 1; }
      let suivant;
      if (lo) {
        if (hi.n - lo.n <= 1) break;
        suivant = lo.n + Math.round(-lo.f * (hi.n - lo.n) / ((hi.f - lo.f) || 1));
        suivant = Math.max(lo.n + 1, Math.min(hi.n - 1, suivant));
      } else {
        /* pas encore de borne basse : secante entre les deux derniers blocs lus (ou 2 s), vers le passe */
        const a = prec || { n: tete, t: tTete };
        const pente = a.n !== n ? (a.t - t) / (a.n - n) : 0;
        suivant = Math.round(n - (t - tsS) / (pente > 0 ? pente : 2));
        if (suivant >= n) suivant = n - 1;
        if (suivant < 1) { if (n === 1) break; suivant = 1; }
      }
      prec = point;
      n = suivant;
    }
    return rendre();
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
export async function clePoolParId({ rpc, rpcLogs = null, poolId, jeton, creeLeMs, tete, marge = MARGE_BLOCS, essais = undefined } = {}) {
  const id = bas(poolId), j = bas(jeton);
  const nonLue = (pourquoi) => ({ etat: 'NON_LUE', poolId: id, pourquoi });
  if (!ID.test(id)) return nonLue('not a v4 poolId');
  if (!ADR.test(j)) return nonLue('not a token address');
  const ms = Number(creeLeMs);
  if (!Number.isFinite(ms) || ms <= 0) return nonLue('no creation date for this pool');
  /* ⛔ la fenetre lue est celle que blocDeDate a garantie : marge passee, sinon un bloc « LU » hors fenetre rendrait une absence fausse */
  const d = await blocDeDate({ rpc, tsS: Math.floor(ms / 1000), tete, marge, essais });
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
  /* ⛔ 2026-10-26 (revue) : 66 caracteres ne font pas une pool v4. Seule une paire que DexScreener dit Uniswap v4 (dexId 'uniswap',
   *   labels contenant 'v4') vaut un getLogs sur le PoolManager v4 — un autre identifiant de 32 octets (un autre dex, une autre
   *   version) couterait une fenetre profonde toutes les 6 h pour rien. Mesure (mesures/dexscreener-paires-v4-labels-20261026.json,
   *   195 paires Base des jetons du trending de prod) : les 159 pairAddress de 66 caracteres sont toutes « uniswap ["v4"] », les 36
   *   autres sont des adresses de 42. Sans ces marques : pas d indice, la recherche par profondeur. */
  const estV4 = (p) => bas(p.dexId) === 'uniswap' && Array.isArray(p.labels) && p.labels.some((x) => bas(x) === 'v4');
  const liste = (Array.isArray(paires) ? paires : []).filter((p) => p && bas(p.chainId) === 'base' && ID.test(bas(p.pairAddress)) && estV4(p))
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
