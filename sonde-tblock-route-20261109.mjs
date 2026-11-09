// sonde-tblock-route-20261109.mjs — READ-ONLY probe of the TBLOCK route pieces (fork or mainnet RPC). Nothing is sent.
import { selecteur } from './keccak.js';
import { encodeQuote } from './pool.js';
import { TBLOCK_POOL, TBLOCK, WTCOIN, poolIdOfKey } from './tblock-hold.js';
const RPC = process.argv[2] || 'http://127.0.0.1:8658';
let id = 0;
const rpc = async (m, p) => { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) }).then((x) => x.json()); if (r.error) throw new Error(JSON.stringify(r.error)); return r.result; };
const w = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const n = (x) => BigInt(x).toString(16).padStart(64, '0');
const i24 = (x) => BigInt.asUintN(256, BigInt(x)).toString(16).padStart(64, '0');
const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', WETH = '0x4200000000000000000000000000000000000006';
const FACT = '0xf8f2eb4940cfe7d13603dddd87f123820fc061ef', QCL = '0x514c8b5f54112481e28028f1166bd78501089259';
console.log('block', parseInt(await rpc('eth_blockNumber', []), 16));
console.log('poolId recomputed', poolIdOfKey(TBLOCK_POOL), '==', TBLOCK_POOL.poolId);
for (const ts of [1, 10, 50, 80, 100, 150, 200, 500, 2000]) {
  const r = await call(FACT, selecteur('getPool(address,address,int24)') + w(WTCOIN) + w(USDC) + i24(ts));
  const p = '0x' + r.slice(-40);
  if (/^0x0{40}$/.test(p)) continue;
  const fee = BigInt(await call(p, selecteur('fee()')));
  const bU = BigInt(await call(USDC, selecteur('balanceOf(address)') + w(p)));
  const bW = BigInt(await call(WTCOIN, selecteur('balanceOf(address)') + w(p)));
  const liq = BigInt(await call(p, selecteur('liquidity()')));
  console.log('factory CL3 wtCOIN/USDC ts', ts, p, 'fee', fee, 'USDC', Number(bU) / 1e6, 'wtCOIN', Number(bW) / 1e18, 'liq', liq);
}
for (const ts of [1, 10, 50, 100, 200]) {
  try { const q = await call(QCL, selecteur('quoteExactInputSingle((address,address,uint256,int24,uint160))') + w(USDC) + w(WTCOIN) + n(5000000n) + i24(ts) + n(0)); console.log('CL quote 5 USDC->wtCOIN ts', ts, BigInt(q.slice(0, 66)).toString()); } catch (e) { }
}
console.log('wtCOIN symbol/dec', Buffer.from((await call(WTCOIN, selecteur('symbol()'))).slice(130), 'hex').toString().replace(/\0/g, ''), BigInt(await call(WTCOIN, selecteur('decimals()'))));
const key = { currency0: TBLOCK_POOL.currency0, currency1: TBLOCK_POOL.currency1, fee: TBLOCK_POOL.fee, tickSpacing: TBLOCK_POOL.tickSpacing, hooks: TBLOCK_POOL.hooks };
const Q4 = '0x0d5e0f971ed27fbff6c2837bf31316121532048d';
for (const amt of [10n ** 15n, 10n ** 16n]) {
  try { const q = await call(Q4, encodeQuote({ cle: key, zeroForOne: true, montant: amt })); console.log('v4 quote wtCOIN->TBLOCK', amt, BigInt(q.slice(0, 66)).toString()); } catch (e) { console.log('v4 quote err', e.message.slice(0, 200)); }
}
const code = await rpc('eth_getCode', [TBLOCK_POOL.hooks, 'latest']);
console.log('hook code bytes', (code.length - 2) / 2, 'hook flags (low 14 bits)', (BigInt(TBLOCK_POOL.hooks) & 0x3fffn).toString(2));
console.log('TBLOCK code prefix', (await rpc('eth_getCode', [TBLOCK, 'latest'])).slice(0, 12));
const V3 = '0x8495444b5f3699D223baa01E67Bf534475620aff';
console.log('v3 pool fee', BigInt(await call(V3, selecteur('fee()'))), 'token0', '0x' + (await call(V3, selecteur('token0()'))).slice(-40), 'liq', BigInt(await call(V3, selecteur('liquidity()'))));
const Q3 = '0x3d4e44eb1374240ce5f1b871ab261cd16335b76a';
try { const q = await call(Q3, selecteur('quoteExactInputSingle((address,address,uint256,uint24,uint160))') + w(WETH) + w(WTCOIN) + n(2n * 10n ** 15n) + n(10000) + n(0)); console.log('v3 quote 0.002 WETH->wtCOIN', BigInt(q.slice(0, 66)).toString()); } catch (e) { console.log('v3 q err', e.message.slice(0, 200)); }
// WETH->USDC on pinned Aerodrome ts50 pool, then USDC->wtCOIN
try { const q = await call(QCL, selecteur('quoteExactInputSingle((address,address,uint256,int24,uint160))') + w(WETH) + w(USDC) + n(2n * 10n ** 15n) + i24(50) + n(0)); console.log('CL quote 0.002 WETH->USDC ts50', BigInt(q.slice(0, 66)).toString()); } catch (e) { console.log('err', e.message.slice(0, 200)); }
