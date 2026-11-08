/* fly-tx.js — EIP-1559 (type 2) transaction bytes, PURE: RLP encode / decode and field parsing, no cryptography. The browser's
 * fly-wallet.js signs with it; the server uses it to check a transaction it is asked to relay (where it goes, on which chain) without
 * holding any key or any curve code. */
export const hexOf = (b) => '0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export function bytesOf(h) {
  const s = String(h).replace(/^0x/, '');
  if (s.length % 2 || /[^0-9a-fA-F]/.test(s)) throw new Error('not hex: ' + String(h).slice(0, 20));
  return Uint8Array.from(s.match(/../g) || [], (x) => parseInt(x, 16));
}
/* an unsigned integer as minimal big-endian bytes (0 -> empty): the canonical RLP form a node demands */
export function intBytes(v) {
  let n = BigInt(v); if (n < 0n) throw new Error('negative integer');
  const out = []; while (n > 0n) { out.unshift(Number(n & 0xffn)); n >>= 8n; } return Uint8Array.from(out);
}
export const concat = (...l) => { const o = new Uint8Array(l.reduce((s, x) => s + x.length, 0)); let k = 0; for (const x of l) { o.set(x, k); k += x.length; } return o; };

/* RLP: a Uint8Array is a string, an Array is a list */
export function rlp(x) {
  if (x instanceof Uint8Array) {
    if (x.length === 1 && x[0] < 0x80) return x;
    return concat(lenPrefix(x.length, 0x80), x);
  }
  if (!Array.isArray(x)) throw new Error('rlp: bytes or list only');
  const body = concat(...x.map(rlp));
  return concat(lenPrefix(body.length, 0xc0), body);
}
function lenPrefix(n, base) {
  if (n < 56) return Uint8Array.of(base + n);
  const l = intBytes(n); return concat(Uint8Array.of(base + 55 + l.length), l);
}
export function unrlp(b, i = 0) {
  const p = b[i];
  if (p === undefined) throw new Error('rlp: truncated');
  if (p < 0x80) return [b.slice(i, i + 1), i + 1];
  const long = (k) => { let n = 0; for (let j = 0; j < k; j++) n = n * 256 + b[i + 1 + j]; return n; };
  if (p < 0xb8) { const n = p - 0x80; return [b.slice(i + 1, i + 1 + n), i + 1 + n]; }
  if (p < 0xc0) { const k = p - 0xb7, n = long(k); return [b.slice(i + 1 + k, i + 1 + k + n), i + 1 + k + n]; }
  let start, end;
  if (p < 0xf8) { start = i + 1; end = start + (p - 0xc0); } else { const k = p - 0xf7; start = i + 1 + k; end = start + long(k); }
  if (end > b.length) throw new Error('rlp: list longer than the input');
  const out = []; let j = start; while (j < end) { const [v, nx] = unrlp(b, j); out.push(v); j = nx; }
  if (j !== end) throw new Error('rlp: list length mismatch');
  return [out, end];
}

/** The fields of a signed type-2 transaction, as a node will read them. The sender is NOT derived here (no curve code): a relay only
 *  needs where it goes and on which chain; the node itself rejects a bad signature. */
export function parseTx(rawHex) {
  const b = bytesOf(rawHex);
  if (b[0] !== 2) throw new Error('not a type-2 transaction');
  const [l, end] = unrlp(b, 1);
  if (end !== b.length || !Array.isArray(l) || l.length !== 12) throw new Error('malformed type-2 transaction');
  if (!Array.isArray(l[8]) || l[8].length) throw new Error('access lists are not used here');
  const num = (x) => { if (x.length && x[0] === 0) throw new Error('non-canonical integer'); return x.length ? BigInt(hexOf(x)) : 0n; };
  return { chainId: num(l[0]), nonce: num(l[1]), maxPriorityFeePerGas: num(l[2]), maxFeePerGas: num(l[3]), gas: num(l[4]),
    to: l[5].length === 20 ? hexOf(l[5]) : null, value: num(l[6]), data: hexOf(l[7]), yParity: num(l[9]), r: num(l[10]), s: num(l[11]), list: l, bytes: b };
}
