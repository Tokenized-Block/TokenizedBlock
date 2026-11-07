// test-fly-price-20261107.mjs — the live pool price that feeds the fly (fly-price.js), with mutants.
// Witnesses do NOT come from the module: the price is rebuilt from the TICK (1.0001^tick, Uniswap v3 definition), read on mainnet
// 2026-11-07 (SNDKc pool, block 54 491 546: tick -21223, $834.92) and matched against Coinbase search_tokens ($835.42) the same evening.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

async function banc(dir) {
  const { priceFromSqrt, readPoolPrice } = await import(pathToFileURL(join(dir, 'fly-price.js')).href + '?t=' + Date.now() + Math.random());
  const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', STOCK = '0xb200000000000000000000397293cb8cda9a10c5', POOL = '0x5a8236f575471e7bfca2c8462a200c28f737246e';
  /* sqrtPriceX96 for tick -21223, built from the tick, not from the module */
  const sqrtAt = (tick) => BigInt(Math.round(Math.sqrt(1.0001 ** tick) * 2 ** 96));
  const tick = -21223, sqrt = sqrtAt(tick);
  /* USDC (6) is token0, the stock (8) token1: one stock = 1 / (1.0001^tick * 10^(6-8)) USDC */
  const witness = 1 / (1.0001 ** tick * 1e-2);
  ok(Math.abs(witness - 834.92) / 834.92 < 0.001, 'witness from the tick = the mainnet reading: ' + witness);
  const p = priceFromSqrt({ sqrtPriceX96: sqrt, tokenIsToken0: false, decimals0: 6, decimals1: 8 });
  ok(Math.abs(p - witness) / witness < 1e-9, 'stock as token1: ' + p);
  /* the same pool written the other way round: the stock as token0 (8), USDC token1 (6) -> price = 1.0001^t * 10^(8-6) */
  const t2 = 21223, p2 = priceFromSqrt({ sqrtPriceX96: sqrtAt(t2), tokenIsToken0: true, decimals0: 8, decimals1: 6 });
  ok(Math.abs(p2 - 1.0001 ** t2 * 1e2) / p2 < 1e-9 && Math.abs(p2 - witness) / witness < 1e-6, 'stock as token0 gives the same price: ' + p2);
  ok(priceFromSqrt({ sqrtPriceX96: 0n, tokenIsToken0: false, decimals0: 6, decimals1: 8 }) === null, 'empty pool -> null, never 0 or Infinity');

  /* readPoolPrice against a fake node that counts calls */
  const word = (x) => BigInt.asUintN(256, BigInt(x)).toString(16).padStart(64, '0');
  const addr = (a) => '0x' + a.slice(2).padStart(64, '0');
  const fake = (token0, token1, s0) => { const calls = []; const rpc = async (m, params) => {
    calls.push(m === 'eth_call' ? params[0].data + '@' + params[0].to : m);
    if (m === 'eth_blockNumber') return '0x' + (54491546).toString(16);
    const { to, data } = params[0];
    if (to === POOL && data === '0x3850c7bd') return '0x' + word(s0) + word(BigInt.asUintN(24, BigInt(tick))) + word(0).repeat(5);
    if (to === POOL && data === '0x0dfe1681') return addr(token0);
    if (to === POOL && data === '0xd21220a7') return addr(token1);
    if (to === POOL && data === '0xddca3f43') return '0x' + word(500);   // fee(), 500 read on the SNDKc pool 2026-11-07
    if (data === '0x313ce567') return '0x' + word(to === USDC ? 6 : 8);
    throw new Error('unexpected call ' + data + ' to ' + to);
  }; return { rpc, calls }; };
  const f = fake(USDC, STOCK, sqrt);
  const r = await readPoolPrice({ rpc: f.rpc, pool: POOL, token: STOCK });
  ok(Math.abs(r.priceUsd - witness) / witness < 1e-9 && r.tick === tick && r.block === 54491546, 'read: price, signed tick, block ' + JSON.stringify(r));
  ok(r.tokenDecimals === 8, 'the stock side decimals, read on chain, not the USDC side: ' + r.tokenDecimals);
  ok(r.feePips === 500, 'the pool fee, read: ' + r.feePips);
  const avant = f.calls.length;
  await readPoolPrice({ rpc: f.rpc, pool: POOL, token: STOCK });
  const second = f.calls.slice(avant);
  ok(second.length === 2 && second.some((c) => c.startsWith('0x3850c7bd')) && second.includes('eth_blockNumber'), 'second read costs slot0 + blockNumber only: ' + second.join(', '));
  const autre = '0xb2000000000000000000007b9fcbd005511acbd5';
  await assert.rejects(readPoolPrice({ rpc: f.rpc, pool: POOL, token: autre }), /does not hold this token/); n++;
  const vide = fake(USDC, STOCK, 0n);
  await assert.rejects(readPoolPrice({ rpc: vide.rpc, pool: POOL, token: STOCK }), /pool not initialized/); n++;
  /* selectors are computed by keccak.js, never typed */
  const src = readFileSync(join(dir, 'fly-price.js'), 'utf8');
  ok(!/0x3850c7bd|0x0dfe1681|0xd21220a7|0x313ce567|0xddca3f43/.test(src) && /selecteur\('slot0\(\)'\)/.test(src), 'selectors computed, not typed');
  return n;
}

const total = await banc(ICI);
console.log('test-fly-price-20261107 : ' + total + ' assertions OK');

/* mutants: each must turn the bench red */
const MUTANTS = [
  ['inverse oublie', (s) => s.replace('return tokenIsToken0 ? oneIn0 : 1 / oneIn0;', 'return oneIn0;')],
  ['decimales inversees', (s) => s.replace('10 ** (decimals0 - decimals1)', '10 ** (decimals1 - decimals0)')],
  ['tick non signe', (s) => s.replace('tickRaw >= 1n << 23n ? tickRaw - (1n << 24n) : tickRaw', 'tickRaw')],
  ['pas de cache de pool', (s) => s.replace('if (!poolCache.has(key)) {', 'if (true) {')],
  ['jeton etranger accepte', (s) => s.replace("if (token0 !== t && token1 !== t) throw new Error('pool does not hold this token');", '')],
  ['frais non verifies', (s) => s.replace("if (!Number.isInteger(feePips) || feePips < 0 || feePips > 1000000) throw new Error('fee not read');", '').replace('const feePips = Number(BigInt(f));', 'const feePips = 0;')],
  ['pool vide = prix', (s) => s.replace("if (sqrtPriceX96 === 0n) throw new Error('pool not initialized');", '').replace('if (!(oneIn0 > 0) || !Number.isFinite(oneIn0)) return null;', '')],
];
let tues = 0;
const source = readFileSync(join(ICI, 'fly-price.js'), 'utf8');
for (const [nom, muter] of MUTANTS) {
  const muted = muter(source);
  if (muted === source) { console.log('  ' + nom + ' : MOTIF ABSENT'); continue; }
  const d = mkdtempSync(join(tmpdir(), 'fly-mut-'));
  writeFileSync(join(d, 'fly-price.js'), muted); copyFileSync(join(ICI, 'keccak.js'), join(d, 'keccak.js'));
  n = 0;
  try { await banc(d); console.log('  ' + nom + ' : SURVIT'); } catch (e) { tues++; console.log('  ' + nom + ' : TUE (' + String(e.message).slice(0, 80) + ')'); }
}
assert.equal(tues, MUTANTS.length, 'MUTANTS : ' + tues + '/' + MUTANTS.length);
console.log('MUTANTS : ' + tues + '/' + MUTANTS.length + ' tues');
