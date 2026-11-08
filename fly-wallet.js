/* fly-wallet.js — the fly's own small wallet, kept in the user's browser: key, address, and EIP-1559 (type 2) transactions signed
 * locally. The key NEVER leaves the browser; the server only relays an already signed transaction (and checks where it goes, with
 * fly-tx.js, without any key or curve code).
 * Curve and hash: @noble/curves 2.4.0 + @noble/hashes 2.4.0 (audited, MIT), in lib/noble byte for byte from the npm tarballs (sha512
 * checked against npm; lib/noble/manifeste.json), cross-checked 39/39 against the repo's keccak.js and signeur-secp256k1.js (30 Foundry
 * vectors). The library's own bare imports (@noble/hashes/...) are resolved by an import map in the page.
 * Phil 2026-11-08 (CLAUDE.md exception): the fly may trade on its own with what a user delegated to it by ONE opt-in transaction. */
import { secp256k1 } from './lib/noble/curves/secp256k1.js';
import { keccak_256 } from './lib/noble/hashes/sha3.js';
import { hexOf, bytesOf, intBytes, concat, rlp, unrlp, parseTx } from './fly-tx.js';

export { rlp, unrlp };
export const keccakHex = (bytes) => hexOf(keccak_256(bytes));
export function newKeyHex() { return hexOf(secp256k1.utils.randomSecretKey()); }
export function addressOf(keyHex) { return '0x' + hexOf(keccak_256(secp256k1.getPublicKey(bytesOf(keyHex), false).slice(1))).slice(26); }

const FIELDS = ['chainId', 'nonce', 'maxPriorityFeePerGas', 'maxFeePerGas', 'gas'];
function payload(tx) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(tx.to))) throw new Error('to must be a 20-byte address');
  return [intBytes(tx.chainId), intBytes(tx.nonce), intBytes(tx.maxPriorityFeePerGas), intBytes(tx.maxFeePerGas), intBytes(tx.gas),
    bytesOf(tx.to), intBytes(tx.value || 0), bytesOf(tx.data || '0x'), []];
}
/** Signs a type-2 transaction with the fly's key. Returns the raw transaction to broadcast, its hash, and the sender. */
export function signTx(tx, keyHex) {
  for (const f of FIELDS) if (tx[f] === undefined || tx[f] === null) throw new Error('missing ' + f);
  const fields = payload(tx), digest = keccak_256(concat(Uint8Array.of(2), rlp(fields)));
  const sig = secp256k1.sign(digest, bytesOf(keyHex), { prehash: false, format: 'recovered' }); /* noble: recovery byte FIRST */
  const yParity = sig[0], r = sig.slice(1, 33), s = sig.slice(33, 65);
  const raw = concat(Uint8Array.of(2), rlp([...fields, intBytes(yParity), intBytes(BigInt(hexOf(r))), intBytes(BigInt(hexOf(s)))]));
  return { raw: hexOf(raw), hash: keccakHex(raw), from: addressOf(keyHex) };
}
/** Decodes a signed type-2 transaction and RECOVERS its sender from the signature (never trusts a claimed sender). */
export function decodeTx(rawHex) {
  const t = parseTx(rawHex);
  if (t.yParity > 1n) throw new Error('bad yParity');
  const digest = keccak_256(concat(Uint8Array.of(2), rlp(t.list.slice(0, 9))));
  const r = t.r.toString(16).padStart(64, '0'), s = t.s.toString(16).padStart(64, '0');
  const pub = secp256k1.recoverPublicKey(concat(Uint8Array.of(Number(t.yParity)), bytesOf(r), bytesOf(s)), digest, { prehash: false });
  const point = secp256k1.Point.fromBytes(pub).toBytes(false);
  const { list, bytes, ...fields } = t;
  return { ...fields, from: '0x' + hexOf(keccak_256(point.slice(1))).slice(26), hash: keccakHex(bytes) };
}
