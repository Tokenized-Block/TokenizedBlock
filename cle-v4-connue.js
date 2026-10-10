// cle-v4-connue.js - RETROUVER UNE CLE V4 DEJA RESOLUE PAR SON poolId, SANS LIRE LA CHAINE.
// 2026-10-11 (diagnostic Grok, compteur d archive par consommateur) : /api/prix-usd a pris 880 appels d archive le 10/10, tous dans
//   cleV4DuPoolId (serveur-web.js) qui rebalaye 59 fenetres d Initialize pour reconstruire une PoolKey. Le cache de /api/cle (clesPool,
//   par jeton) porte deja des cles completes avec leur poolId - il n etait pas consulte.
// ⛔ UNE CLE N EST RENDUE QUE SI SON poolId SE RECALCULE (keccak de la PoolKey) : une entree alteree ou mal recopiee ne passe pas.
//   C est la meme regle que decoderInitialize - on ne garde que ce qu on peut reconstruire.
import { cleDePool, poolId } from './pool.js';

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();

/** entrees : iterable de { poolId, currency0, currency1, fee, tickSpacing, hooks } (les cles de clesPool). Rend la cle
 *  { currency0, currency1, fee, tickSpacing, hooks } du poolId `id`, ou null. */
export function cleV4Connue(id, entrees) {
  const k = bas(id);
  if (!/^0x[0-9a-f]{64}$/.test(k) || !entrees) return null;
  for (const c of entrees) {
    if (!c || bas(c.poolId) !== k) continue;
    const c0 = bas(c.currency0), c1 = bas(c.currency1), hooks = bas(c.hooks);
    if (!ADR.test(c0) || !ADR.test(c1) || !ADR.test(hooks) || !Number.isInteger(c.fee) || !Number.isInteger(c.tickSpacing)) continue;
    let recalcule = null;
    try { recalcule = bas(poolId(cleDePool(c0, c1, { fee: c.fee, tickSpacing: c.tickSpacing, hooks }))); } catch (_) { recalcule = null; }
    if (recalcule === k) return { currency0: c0, currency1: c1, fee: c.fee, tickSpacing: c.tickSpacing, hooks };
  }
  return null;
}
