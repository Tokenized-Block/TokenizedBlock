/* fly-seal.js — the fly's memory, SEALED on Base (Phil 2026-11-08: "a local memory written on chain"). PURE: no network, no key.
 * The memory itself stays in the browser (what the fly learned on one stock: its KC->MBON synapse strengths, integers 0..100000).
 * What goes on chain is its FINGERPRINT, in a transaction the USER's wallet signs: 0 ETH sent to itself, with a 66-byte note
 *   "TBFLY1" (6 bytes) · the stock (20 bytes) · keccak-256 of the memory (32 bytes) · the number of windows it learned from (8 bytes).
 * Anyone can later check that a memory is the one sealed at that time: same fingerprint, read from the TRANSACTION (its sender is
 * checked, never an event). It proves the memory existed then and was not changed since — not that the fly is any good. */
import { keccak256Hex } from './keccak.js';

export const SEAL_MAGIC = '544246'.concat('4c5931'); /* "TBFLY1" in ASCII hex */
/** keccak-256 of the memory as fixed 4-byte big-endian integers: the same memory always gives the same fingerprint. */
export function memoryFingerprint(memory) {
  if (!Array.isArray(memory) || !memory.length) throw new Error('no memory to seal');
  const b = new Uint8Array(memory.length * 4);
  memory.forEach((v, k) => {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new Error('memory value out of range at ' + k);
    b[4 * k] = v >>> 24; b[4 * k + 1] = (v >>> 16) & 255; b[4 * k + 2] = (v >>> 8) & 255; b[4 * k + 3] = v & 255;
  });
  return keccak256Hex(b);
}
/** The 66-byte note of the sealing transaction. */
export function sealData({ stock, fingerprint, windows }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(stock))) throw new Error('stock must be an address');
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(fingerprint))) throw new Error('fingerprint must be 32 bytes');
  if (!Number.isInteger(windows) || windows < 0) throw new Error('windows must be a whole number');
  return '0x' + SEAL_MAGIC + stock.slice(2).toLowerCase() + fingerprint.slice(2).toLowerCase() + BigInt(windows).toString(16).padStart(16, '0');
}
/** Reads a sealing transaction's note back; null when it is not one. */
export function readSeal(data) {
  const h = String(data || '').toLowerCase();
  if (!/^0x[0-9a-f]{132}$/.test(h) || h.slice(2, 14) !== SEAL_MAGIC) return null;
  return { stock: '0x' + h.slice(14, 54), fingerprint: '0x' + h.slice(54, 118), windows: Number(BigInt('0x' + h.slice(118, 134))) };
}
/** Checks a transaction (as eth_getTransactionByHash returns it) against the sealer and the memory held now. */
export function checkSeal(tx, { sealer, stock, memory }) {
  if (!tx) return { ok: false, why: 'transaction not found' };
  const s = readSeal(tx.input || tx.data);
  if (!s) return { ok: false, why: 'not a fly memory seal' };
  if (String(tx.from).toLowerCase() !== String(sealer).toLowerCase() || String(tx.to).toLowerCase() !== String(sealer).toLowerCase()) return { ok: false, why: 'not sent by this wallet to itself' };
  if (s.stock !== String(stock).toLowerCase()) return { ok: false, why: 'sealed for another stock' };
  const same = s.fingerprint === memoryFingerprint(memory);
  return { ok: true, same, windows: s.windows, fingerprint: s.fingerprint };
}
