/* fly-guard.js — what the fly's OWN key may sign, checked IN THE BROWSER before every signature (security review 2026-11-08, H1).
 * The server plans the calls; it must not be able to make the fly sign a transfer of its money elsewhere (a compromised deploy, a
 * planner bug, a lying node). PURE: no network. Every call of a plan must be one of:
 *   approve(spender, amount)            on the token paid, spender = a known router or Permit2, amount ≤ the amount paid;
 *   Permit2.approve(token, spender, …)  token = the token paid, spender = a known router, amount ≤ paid, expiry ≤ 2 h from now;
 *   transfer(feeWallet, amount)         on the token paid, to the app's own fee wallet, amount ≤ 1% of the amount paid;
 *   a call to a known router            in which EVERY address found in the calldata is one of: the fly itself, the two tokens of
 *                                       the trade, a known router, Permit2, WETH, the fee wallet.
 * Never ETH attached. Anything else: refused, and the fly stops. The addresses are copied from the repo's own constants and a test
 * checks they still match them (test-fly-guard). A route through an unknown contract (a Uniswap v4 hook, say) is refused: fail-closed. */
export const KNOWN = Object.freeze({
  usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  weth: '0x4200000000000000000000000000000000000006',
  permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
  routers: Object.freeze(['0x9ee35bf1bd69a03c6f0393582030fce8bb93d418' /* Aerodrome, newer factory */, '0x698cb2b6dd822994581fea6ea4fc755d1363a92f' /* Aerodrome CL */,
    '0x6ff5693b99212da76ad316178a184ab56d299b43' /* Uniswap Universal Router */]),
  feeWallet: '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4',
});
const SEL = { approve: '0x095ea7b3', permit2Approve: '0x87517c45', transfer: '0xa9059cbb' };
const MAX_FEE_BPS = 100n, MAX_PERMIT_S = 7200n;
const word = (d, k) => BigInt('0x' + d.slice(10 + 64 * k, 10 + 64 * (k + 1)));
const addrAt = (d, k) => '0x' + d.slice(10 + 64 * k + 24, 10 + 64 * (k + 1));
/* Calls that carry other calls (or router inputs) in a bytes[]: the selector -> the argument index of that bytes[], and whether each
 * element starts with its own 4-byte selector. Computed with keccak.js selecteur() and checked by test-fly-guard. */
const NESTED = Object.freeze({
  '0xac9650d8': { arg: 0, selector: true },   /* multicall(bytes[]) */
  '0x5ae401dc': { arg: 1, selector: true },   /* multicall(uint256,bytes[]) */
  '0x3593564c': { arg: 1, selector: false },  /* execute(bytes,bytes[],uint256) — Universal Router inputs */
  '0x24856bc3': { arg: 1, selector: false },  /* execute(bytes,bytes[]) */
});
const ADDR_MIN = 1n << 100n; /* an address-sized word: amounts, deadlines, fee rates and offsets are far below */
/** Every address-like word of a call's arguments, read on the ABI's own 32-byte grid, recursing into the bytes[] of a multicall or a
 *  Universal Router execute. A word counts when its 12 top bytes are zero and its value is ≥ 2^100. Malformed nesting throws. */
export function addressesIn(data, depth = 0) {
  const h = String(data).toLowerCase().replace(/^0x/, ''), out = new Set();
  if (depth > 3) throw new Error('nested too deep');
  const sel = '0x' + h.slice(0, 8), args = h.slice(8), nWords = Math.floor(args.length / 64);
  const W = (k) => BigInt('0x' + args.slice(64 * k, 64 * k + 64));
  for (let k = 0; k < nWords; k++) {
    const w = args.slice(64 * k, 64 * k + 64);
    if (w.startsWith('000000000000000000000000') && BigInt('0x' + w) >= ADDR_MIN) out.add('0x' + w.slice(24));
  }
  const nest = NESTED[sel];
  if (nest) {
    const base = Number(W(nest.arg)) * 2, len = Number(BigInt('0x' + args.slice(base, base + 64)));
    if (!(base >= 0 && base + 64 <= args.length && len <= 64)) throw new Error('malformed bytes[]');
    for (let e = 0; e < len; e++) {
      const at = base + 64 + Number(BigInt('0x' + args.slice(base + 64 + 64 * e, base + 128 + 64 * e))) * 2;
      const n = Number(BigInt('0x' + args.slice(at, at + 64))) * 2, body = args.slice(at + 64, at + 64 + n);
      if (body.length !== n) throw new Error('malformed bytes[] element');
      for (const a of addressesIn(nest.selector ? '0x' + body : '0x00000000' + body, depth + 1)) out.add(a);
    }
  }
  return out;
}
/** null if every call may be signed, else { index, why }. `pay` and `receive`: the two tokens of the trade; `amount`: raw units paid. */
export function checkPlanCalls({ calls, fly, pay, receive, amount, nowSec, known = KNOWN }) {
  if (!Array.isArray(calls) || !calls.length) return { index: -1, why: 'no call to sign' };
  const lc = (x) => String(x || '').toLowerCase(), F = lc(fly), P = lc(pay), R = lc(receive), A = BigInt(amount), routers = new Set(known.routers.map(lc));
  const allowed = new Set([F, P, R, lc(known.permit2), lc(known.weth), lc(known.feeWallet), ...routers]);
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i], to = lc(c.to), d = lc(c.data);
    const no = (why) => ({ index: i, why: 'call ' + (i + 1) + ' refused: ' + why });
    if (!/^0x[0-9a-f]{40}$/.test(to) || !/^0x([0-9a-f]{2})*$/.test(d) || d.length < 10) return no('malformed');
    let v; try { v = BigInt(c.value || '0x0'); } catch (_) { return no('malformed value'); }
    if (v !== 0n) return no('ETH attached');
    const sel = d.slice(0, 10);
    if (sel === SEL.approve) {
      if (to !== P || d.length !== 138) return no('an approve that is not on the token paid');
      if (!routers.has(addrAt(d, 0)) && addrAt(d, 0) !== lc(known.permit2)) return no('approve to an unknown spender ' + addrAt(d, 0));
      if (word(d, 1) > A) return no('approves more than the amount paid');
      continue;
    }
    if (sel === SEL.permit2Approve) {
      if (to !== lc(known.permit2) || d.length !== 266) return no('not Permit2');
      if (addrAt(d, 0) !== P || !routers.has(addrAt(d, 1))) return no('Permit2 approval of another token or to an unknown spender');
      if (word(d, 2) > A) return no('Permit2 approval above the amount paid');
      if (word(d, 3) > BigInt(nowSec) + MAX_PERMIT_S) return no('Permit2 approval lasting more than 2 hours');
      continue;
    }
    if (sel === SEL.transfer) {
      if (to !== P || d.length !== 138 || addrAt(d, 0) !== lc(known.feeWallet)) return no('a transfer that is not the app fee on the token paid');
      if (word(d, 1) * 10000n > A * MAX_FEE_BPS) return no('a fee above 1% of the amount paid');
      continue;
    }
    if (!routers.has(to)) return no('a call to an unknown contract ' + to);
    let found; try { found = addressesIn(d); } catch (e) { return no('calldata not readable (' + e.message + ')'); }
    for (const a of found) if (!allowed.has(a)) return no('the swap names an unknown address ' + a + ' (only the fly, the two tokens, known routers and the fee wallet may appear)');
    if (!found.has(F)) return no('the swap does not pay the fly itself');
  }
  return null;
}
