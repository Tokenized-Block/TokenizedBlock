/* missions-plan.js — les appels NON SIGNES de BlockMissionsV3 : poster une mission (approve exact + postTask) et la reclamer (claim avec
 * l attestation du verifier). Pur : aucun reseau, aucune cle. Le wallet de l utilisateur signe ; ce module ne fait que l encodage ABI.
 * Selecteurs recalcules depuis l ABI COMPILEE dans test-missions-plan (jamais tapes a la main). Prouve de bout en bout sur anvil par
 * banc-missions-anvil-20261017.mjs (contrat compile, vraies lectures, claim accepte). */
import { selecteur } from './keccak.js';

/* claude/missions-v3 82f3570 : TaskParams porte topic1 EN DERNIER (une mission PoolManager nomme sa pool) */
export const SIG_POST = 'postTask((address,address,uint24,int24,address),(address,uint256,uint32,uint8,uint64,address,bytes32,bytes32,bytes32),(uint256,uint256,uint256,uint16,uint32))';
export const SIG_CLAIM = 'claim(uint256,bytes32,(uint256,uint256,uint64,uint256),bytes)';
const SIG_APPROVE = 'approve(address,uint256)';
const ADR = /^0x[0-9a-f]{40}$/, B32 = /^0x[0-9a-f]{64}$/;
const bas = (x) => String(x || '').toLowerCase();
const DEUX256 = 1n << 256n;
/* chasse 2026-10-17 soir (LOW) : les champs a LARGEUR FIXE n etaient bornes qu a 256 bits — un uint8 de 300 s encodait, et le contrat
 *   revertait (ou le wallet signait autre chose que ce que l ecran disait). Chaque champ est borne a SA largeur. */
const u = (n, bits = 256) => { const v = BigInt(n); if (v < 0n || v >= (1n << BigInt(bits))) throw new Error('uint' + bits + ' out of range: ' + n); return v.toString(16).padStart(64, '0'); };
const i = (n, bits = 256) => { let v = BigInt(n); const m = 1n << BigInt(bits - 1); if (v < -m || v >= m) throw new Error('int' + bits + ' out of range: ' + n); if (v < 0n) v += DEUX256; return v.toString(16).padStart(64, '0'); };
const a = (x) => { const s = bas(x); if (!ADR.test(s)) throw new Error('bad address ' + x); return s.slice(2).padStart(64, '0'); };
const b = (x) => { const s = bas(x); if (!B32.test(s)) throw new Error('bad bytes32 ' + x); return s.slice(2); };
const sel = (sig) => selecteur(sig).replace(/^0x/, '');

/** le budget mis sous sequestre, exactement comme le contrat (_escrow) : (reward + reward*bonusBps/10000) * maxDone */
export function budgetMission(params, hold) {
  const r = BigInt(params.reward);
  return (r + r * BigInt(hold.bonusBps || 0) / 10000n) * BigInt(params.maxDone);
}

/** les bornes STATIQUES de _checkPost (le contrat refuse le reste : cote, createur, cible = block, temps) — un refus dit avant la signature */
export function refusPoster(params, hold, maintenant, poolManager = null) {
  const r = [];
  const bps = Number(hold.bonusBps || 0); /* chasse (LOW) : `bonusBps` absent valait « !== 0 » -> une mission SANS bonus etait refusee */
  const nul = (x) => !x || /^0x0+$/.test(bas(x));
  if (nul(params.rewardToken) || nul(params.target)) r.push('a reward token and a task target are needed');
  if (nul(params.topic0)) r.push('the task event (topic0) is needed');
  if (poolManager && bas(params.target) === bas(poolManager) && nul(params.topic1)) r.push('a swap mission must name its pool (topic1 = the pool id)');
  if (BigInt(hold.minBlock) === 0n) r.push('a block holding is required (minBlock > 0)');
  if (hold.window < 86400 || hold.window > 7 * 86400) r.push('the holding window is 24 h to 7 days');
  if (bps > 2000) r.push('the bonus is at most 20 %');
  if ((bps !== 0) !== (BigInt(hold.bonusMinBlock || 0) !== 0n)) r.push('a bonus needs its own holding tier, and the other way round');
  if (BigInt(hold.bonusMinBlock || 0) !== 0n && BigInt(hold.bonusMinBlock) < BigInt(hold.minBlock)) r.push('the bonus tier cannot be below the minimum');
  if (BigInt(params.reward) < 1000n) r.push('the reward is at least 1000 raw units');
  if (!(params.maxDone >= 1 && params.maxDone <= 10000)) r.push('1 to 10 000 completions');
  if (!(params.perWallet >= 1 && params.perWallet <= 255)) r.push('1 to 255 completions per wallet');
  if (!(params.expiry > maintenant && params.expiry <= maintenant + 30 * 86400)) r.push('the mission ends within 30 days');
  if (bas(params.target) === bas(params.rewardToken)) r.push('the task target cannot be the reward token');
  return r;
}

/**
 * Poster : [approve(contrat, budget EXACT), postTask(key, params, hold)]. Jamais d approbation infinie.
 * cle = PoolKey { currency0, currency1, fee, tickSpacing, hooks } ; params = TaskParams ; hold = Hold (voir BlockMissionsV3.sol).
 */
export function planPoster({ contrat, cle, params, hold, maintenant = Math.floor(Date.now() / 1000), poolManager = null }) {
  const refus = refusPoster(params, hold, maintenant, poolManager);
  if (refus.length) return { etat: 'REFUSE', pourquoi: refus.join('; '), appels: [] };
  const budget = budgetMission(params, hold);
  let k, p, h;
  try {
    k = a(cle.currency0) + a(cle.currency1) + u(cle.fee, 24) + i(cle.tickSpacing, 24) + a(cle.hooks);
    p = a(params.rewardToken) + u(params.reward) + u(params.maxDone, 32) + u(params.perWallet, 8) + u(params.expiry, 64) + a(params.target)
      + b(params.topic0) + b(params.descHash) + b(params.topic1 || '0x' + '0'.repeat(64));
    h = u(hold.minBlock) + u(hold.minPaired || 0) + u(hold.bonusMinBlock || 0) + u(hold.bonusBps || 0, 16) + u(hold.window, 32);
  } catch (e) { return { etat: 'REFUSE', pourquoi: String(e.message || e), appels: [] }; }
  return {
    etat: 'PRET', budget: budget.toString(),
    appels: [
      { to: bas(params.rewardToken), data: '0x' + sel(SIG_APPROVE) + a(contrat) + u(budget), quoi: 'approve exactly the mission budget' },
      { to: bas(contrat), data: '0x' + sel(SIG_POST) + k + p + h, quoi: 'post the mission (escrow ' + budget + ')' },
    ],
  };
}

/** Reclamer : claim(taskId, txHash, Held{heldBlock, heldPaired, windowEnd, deadline}, signature) — avec ce que attester() a rendu. */
export function planReclamer({ contrat, taskId, txHash, held, signature }) {
  const sig = bas(signature).replace(/^0x/, '');
  if (!/^[0-9a-f]{130}$/.test(sig)) throw new Error('signature must be 65 bytes');
  const tete = u(taskId) + b(txHash) + u(held.heldBlock) + u(held.heldPaired) + u(held.windowEnd, 64) + u(held.deadline) + u(7 * 32);
  const queue = u(65) + sig.padEnd(192, '0');
  return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_CLAIM) + tete + queue, quoi: 'claim the mission reward' }] };
}
