/* fly-relay.js — the guard of the autonomous fly's relay (CLAUDE.md exception decided by Phil 2026-11-08). PURE: no network, no key.
 * The fly's key lives in the user's browser; the server signs nothing and only relays an ALREADY SIGNED type-2 transaction, and
 * only one of:
 *   (a) a call the server's own planner (/api/rails/plan) produced in the last 10 minutes: same to, data and value;
 *   (b) transfer(address,uint256) of USDC or of a stock of the pool table, with no ETH: the user's withdraw;
 *   (c) a plain ETH send (no data): the gas left, sent back;
 *   (d) a memory seal (fly-seal.js note, 66 bytes, no ETH): the fly sealing its own memory on chain, automatically.
 * Base (8453) only, no contract creation. ⛔ This keeps the server from being an OPEN relay; it does NOT protect the fly's funds
 * (whoever holds the key can broadcast through any node). The user's protection is the small budget, Stop and Withdraw all. */
import { readSeal } from './fly-seal.js';

export function createRelayGuard({ usdc, isStock, transferSelector, ttlMs = 600000, max = 2000 }) {
  const planned = new Map();
  const key = (to, data, value) => String(to).toLowerCase() + '|' + String(data || '0x').toLowerCase() + '|' + BigInt(value || 0).toString();
  const sel = String(transferSelector).toLowerCase(), usdcL = String(usdc).toLowerCase();
  /** Keeps every call of a plan the server just answered (only a plan that is ok). */
  function remember(plan, now = Date.now()) {
    if (!plan || !plan.ok || !Array.isArray(plan.aSigner)) return 0;
    let n = 0;
    for (const c of plan.aSigner) { try { const k = key(c.to, c.data, c.value); planned.delete(k); planned.set(k, now); n++; } catch (_) { /* malformed: not kept */ } }
    while (planned.size > max) planned.delete(planned.keys().next().value);
    return n;
  }
  /** null when the parsed transaction (fly-tx.parseTx) may be relayed, else the reason it is refused. */
  function refusal(t, now = Date.now()) {
    if (t.chainId !== 8453n) return 'chain ' + t.chainId + ' refused: Base (8453) only';
    if (!t.to) return 'contract creation refused';
    if (t.data === '0x') return null;
    if (t.value === 0n && readSeal(t.data)) return null;
    const at = planned.get(key(t.to, t.data, t.value));
    if (at !== undefined && now - at < ttlMs) return null;
    const to = t.to.toLowerCase(), d = t.data.toLowerCase();
    if (d.startsWith(sel) && d.length === 2 + 8 + 128 && t.value === 0n && (to === usdcL || isStock(to))) return null;
    return 'refused: not a call this server planned in the last ' + Math.round(ttlMs / 60000) + ' minutes, nor a USDC / stock transfer, nor a plain ETH send, nor a memory seal';
  }
  /** 09/11 (QA open item): the address a transaction allowed ONLY as a memory seal goes to, else null. A seal path open to any `to` made the
   *   server an open relay for 0-ETH calls whose data starts with the seal note (a contract whose fallback acts on any data); the route
   *   relays it only when that address has NO code (the page seals to the fly's own wallet; a 7702-delegated account has code: refused). */
  function sealOnlyTarget(t, now = Date.now()) {
    if (refusal(t, now) !== null || t.data === '0x' || !(t.value === 0n && readSeal(t.data))) return null;
    const at = planned.get(key(t.to, t.data, t.value));
    if (at !== undefined && now - at < ttlMs) return null;
    return t.to;
  }
  return { remember, refusal, sealOnlyTarget, get size() { return planned.size; } };
}
