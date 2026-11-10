/* tblock-burn.js — HOW MUCH TBLOCK IS OUT OF CIRCULATION, AND WHO SENT IT THERE (game323, Phil 2026-11-09).
 * TBLOCK is an adminless B20: no burn(), the supply never shrinks (1e27 raw, read on chain). "Burned" here means held by
 * 0x…dEaD, an address nobody has the key of: out of circulation for good. This module says exactly that, with real numbers only.
 * Sources of what reaches 0x…dEaD, told apart by the Transfer log's `from` (a log is only counted if TBLOCK's own contract emitted it):
 *   - the Uniswap v4 PoolManager: the pool's hook sends a cut of EVERY trade there (measured on a fork: ~1 % of each swap's output,
 *     part of it to 0x…dEaD);
 *   - the buyback contract and the block contest (once deployed: their addresses are passed in, never guessed);
 *   - anyone else (people sending TBLOCK there themselves).
 * PURE: the logs and balances are passed in. */
import { topic } from './keccak.js';

export const TBLOCK = '0xb200000000000000000000ba9bf8330307f8830e';
export const DEAD = '0x000000000000000000000000000000000000dead';
export const POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b';
export const TOPIC_TRANSFER = topic('Transfer(address,address,uint256)');
const bas = (x) => String(x || '').toLowerCase();
const pad = (a) => '0x' + bas(a).replace(/^0x/, '').padStart(64, '0');
const ADR = /^0x[0-9a-f]{40}$/;

/** the share of the supply held by 0x…dEaD; null if a read is missing */
export function burnShare({ deadBalance, totalSupply }) {
  let d, s;
  try { d = BigInt(deadBalance); s = BigInt(totalSupply); } catch (_) { return null; }
  if (s <= 0n || d < 0n || d > s) return null;
  return { dead: d, supply: s, tokens: Number(d / 10n ** 18n), pct: Number((d * 1_000_000n) / s) / 10_000 };
}

/** group the Transfer-to-dead logs of TBLOCK by source. `named` = { address: label } for known contracts (buyback, contest). */
export function burnSources(logs, named = {}) {
  const labels = { [POOL_MANAGER]: 'trades (pool hook cut)' };
  for (const [a, l] of Object.entries(named || {})) if (ADR.test(bas(a)) && typeof l === 'string' && l) labels[bas(a)] = l;
  const out = new Map();
  let count = 0;
  for (const l of logs || []) {
    if (bas(l && l.address) !== TBLOCK) continue;                 /* only TBLOCK's own logs */
    const t = (l.topics || []).map(bas);
    if (t[0] !== TOPIC_TRANSFER || t[2] !== pad(DEAD) || !t[1]) continue;
    let v; try { v = BigInt(l.data); } catch (_) { continue; }
    const from = '0x' + t[1].slice(-40);
    const label = labels[from] || 'people sending it there';
    const cur = out.get(label) || { label, raw: 0n, transfers: 0 };
    cur.raw += v; cur.transfers += 1; out.set(label, cur);
    count += 1;
  }
  return { transfers: count, sources: [...out.values()].sort((a, b) => (b.raw > a.raw ? 1 : b.raw < a.raw ? -1 : 0)) };
}

/** read what 0x…dEaD holds and the supply at ONE block, through `lire(to, data, block)`. Public shape (strings, no BigInt):
 *  { ok:true, dead, supply, tokens, pct, block } or { ok:false, state:'NOT_READ', why, block }. A lecteur that throws is NOT caught here. */
export async function readBurn({ lire, block }) {
  const [bal, sup] = await Promise.all([lire(TBLOCK, '0x70a08231' + pad(DEAD).slice(2), block), lire(TBLOCK, '0x18160ddd', block)]);
  const word = (x) => typeof x === 'string' && /^0x[0-9a-fA-F]{64}$/.test(x);
  if (!word(bal) || !word(sup)) return { ok: false, state: 'NOT_READ', why: 'a read came back empty or cut', block };
  const s = burnShare({ deadBalance: bal, totalSupply: sup });
  if (!s) return { ok: false, state: 'NOT_READ', why: 'the two reads do not fit together', block };
  return { ok: true, dead: s.dead.toString(), supply: s.supply.toString(), tokens: s.tokens, pct: s.pct, block };
}

/** the eth_getLogs filter for TBLOCK transfers to 0x…dEaD in [from, to] (hex block numbers) */
export function burnLogsFilter(fromBlock, toBlock) {
  return { address: TBLOCK, topics: [TOPIC_TRANSFER, null, pad(DEAD)], fromBlock: '0x' + Number(fromBlock).toString(16), toBlock: '0x' + Number(toBlock).toString(16) };
}
