/* fly-price.js — the LIVE on-chain price of a tokenized stock, read from its Aerodrome CL pool (slot0), read-only.
 * Tokenized stocks trade 24/7 on Base: this is the price the market is paying right now, weekends included — unlike the Chainlink
 * reference (/api/actions/reference/), which holds its last value while US markets are closed.
 * Pure: takes an `rpc(method, params)` function, so it runs the same in the server and in a test. */

import { selecteur } from './keccak.js';

/* selectors are computed, never typed: a typed one that is wrong does not fail, it asks ANOTHER function */
const SEL = { slot0: selecteur('slot0()'), token0: selecteur('token0()'), token1: selecteur('token1()'), decimals: selecteur('decimals()') };
const word = (hex, i) => '0x' + String(hex).slice(2 + 64 * i, 2 + 64 * (i + 1));
const asAddress = (hex) => '0x' + String(hex).slice(-40).toLowerCase();

/** USD price of one `token` given the pool's sqrtPriceX96 and both tokens' order and decimals (the other side is USDC). */
export function priceFromSqrt({ sqrtPriceX96, tokenIsToken0, decimals0, decimals1 }) {
  const s = Number(BigInt(sqrtPriceX96)) / 2 ** 96;
  /* token1 per token0, in whole units */
  const oneIn0 = s * s * 10 ** (decimals0 - decimals1);
  if (!(oneIn0 > 0) || !Number.isFinite(oneIn0)) return null;
  return tokenIsToken0 ? oneIn0 : 1 / oneIn0;
}

const decimalsCache = new Map(), poolCache = new Map();
async function decimalsOf(rpc, address) {
  if (decimalsCache.has(address)) return decimalsCache.get(address);
  const d = Number(BigInt(await rpc('eth_call', [{ to: address, data: SEL.decimals }, 'latest'])));
  if (!Number.isInteger(d) || d < 0 || d > 36) throw new Error('decimals not read for ' + address);
  decimalsCache.set(address, d);
  return d;
}

/** Reads slot0, token0, token1 and decimals; returns { priceUsd, tick, block } or throws. */
export async function readPoolPrice({ rpc, pool, token }) {
  const t = String(token).toLowerCase(), key = String(pool).toLowerCase();
  /* a pool's tokens and decimals never change: read once, then each price costs slot0 + blockNumber */
  if (!poolCache.has(key)) {
    const [a0, a1] = await Promise.all([rpc('eth_call', [{ to: pool, data: SEL.token0 }, 'latest']), rpc('eth_call', [{ to: pool, data: SEL.token1 }, 'latest'])]);
    const token0 = asAddress(a0), token1 = asAddress(a1);
    const [decimals0, decimals1] = await Promise.all([decimalsOf(rpc, token0), decimalsOf(rpc, token1)]);
    poolCache.set(key, { token0, token1, decimals0, decimals1 });
  }
  const { token0, token1, decimals0, decimals1 } = poolCache.get(key);
  if (token0 !== t && token1 !== t) throw new Error('pool does not hold this token');
  const [s0, blockHex] = await Promise.all([rpc('eth_call', [{ to: pool, data: SEL.slot0 }, 'latest']), rpc('eth_blockNumber', [])]);
  const sqrtPriceX96 = BigInt(word(s0, 0));
  if (sqrtPriceX96 === 0n) throw new Error('pool not initialized');
  const tickRaw = BigInt(word(s0, 1)) & ((1n << 24n) - 1n);
  const tick = Number(tickRaw >= 1n << 23n ? tickRaw - (1n << 24n) : tickRaw);
  const priceUsd = priceFromSqrt({ sqrtPriceX96, tokenIsToken0: token0 === t, decimals0, decimals1 });
  if (priceUsd == null) throw new Error('price not computable');
  return { priceUsd, tick, block: Number(BigInt(blockHex)) };
}
