// test-fly-wallet-20261108.mjs — the fly's in-browser wallet (fly-wallet.js), without a node: the vendored @noble bytes against their
// manifest, signatures and addresses against the repo's two verified references (keccak.js, signeur-secp256k1.js: 30 Foundry vectors),
// sign -> decode round trips, tampered or mistyped transactions refused, and mutants on every encoding trap.
// The end-to-end money path (approvals, swap, sell, withdraw, signed raw) is proven on a fork by banc-fly-wallet-fork-20261108.mjs (17/17).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import './noble-node-resolve.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

async function banc(dir) {
  n = 0;
  const W = await import(pathToFileURL(join(dir, 'fly-wallet.js')).href + '?t=' + Date.now() + Math.random());
  const { keccak256Hex } = await import(pathToFileURL(join(ICI, 'keccak.js')).href);
  const { adresseDe, signerDigestDetail } = await import(pathToFileURL(join(ICI, 'signeur-secp256k1.js')).href);
  /* the vendored bytes are the verified ones */
  const man = JSON.parse(readFileSync(join(ICI, 'lib', 'noble', 'manifeste.json'), 'utf8')).fichiers, faux = [];
  for (const [p, h] of Object.entries(man)) if (createHash('sha256').update(readFileSync(join(ICI, p))).digest('hex') !== h) faux.push(p);
  ok(Object.keys(man).length === 25 && faux.length === 0, 'vendored @noble: 25 files, all bytes match the manifest (' + (faux.join(', ') || 'none off') + ')');
  /* keccak and addresses against the repo's references */
  for (const s of ['', 'abc', 'fly']) ok(W.keccakHex(new TextEncoder().encode(s)) === keccak256Hex(new TextEncoder().encode(s)), 'keccak = keccak.js for ' + JSON.stringify(s));
  for (const k of [1n, 2n, 0xA11CEn]) { const h = '0x' + k.toString(16).padStart(64, '0'); ok(W.addressOf(h) === adresseDe(h).toLowerCase(), 'address of key ' + k + ' = signeur-secp256k1'); }
  /* a signed transaction: same r, s, recovery as the Foundry-pinned signer, recovered sender = the key, tx hash = keccak(raw) */
  const key = '0x' + 'a11ce'.padStart(64, '0');
  const tx = { chainId: 8453, nonce: 3, maxPriorityFeePerGas: 1000000n, maxFeePerGas: 60000000n, gas: 150000, to: '0x' + 'c0'.repeat(20), value: 0, data: '0x095ea7b3' + '00'.repeat(64) };
  const s = W.signTx(tx, key), d = W.decodeTx(s.raw);
  ok(d.from === W.addressOf(key) && d.hash === s.hash && d.hash === W.keccakHex(Uint8Array.from(Buffer.from(s.raw.slice(2), 'hex'))), 'sign -> decode: sender recovered, hash = keccak(raw)');
  ok(d.chainId === 8453n && d.nonce === 3n && d.gas === 150000n && d.to === tx.to && d.data === tx.data && d.value === 0n && d.maxFeePerGas === 60000000n, 'every field decodes back');
  const raw = Buffer.from(s.raw.slice(2), 'hex'), [list] = W.unrlp(raw, 1);
  /* canonical integers, as a real node demands (a leading zero byte is rejected): value 0 is the EMPTY string, nonce 3 one byte */
  ok(list[6].length === 0 && list[1].length === 1 && list[1][0] === 3 && Array.isArray(list[8]) && list[8].length === 0, 'canonical RLP integers: value 0 -> empty string, nonce 3 -> one byte, empty access list');
  const payloadHash = W.keccakHex(Uint8Array.from([2, ...W.rlp(list.slice(0, 9))]));
  const ref = signerDigestDetail(key, payloadHash), r = Buffer.from(list[10]).toString('hex').padStart(64, '0'), s2 = Buffer.from(list[11]).toString('hex').padStart(64, '0');
  ok(ref.signature.slice(2, 130) === r + s2 && (list[9].length ? list[9][0] : 0) === ref.recid, 'r, s and yParity identical to signeur-secp256k1 (RFC 6979, Foundry-pinned)');
  /* refusals */
  const tampered = Buffer.from(raw); tampered[tampered.length - 40] ^= 1;
  let autre = null; try { autre = W.decodeTx('0x' + tampered.toString('hex')).from; } catch (_) { autre = 'refused'; }
  ok(autre !== d.from, 'a tampered transaction never recovers to the fly (' + autre + ')');
  assert.throws(() => W.decodeTx('0x01' + s.raw.slice(4)), /type-2/); n++;
  assert.throws(() => W.decodeTx(s.raw + '00'), /malformed|length|longer/); n++;
  assert.throws(() => W.signTx({ ...tx, to: '0x1234' }, key), /20-byte/); n++;
  assert.throws(() => W.signTx({ ...tx, gas: undefined }, key), /missing gas/); n++;
  /* zero is the empty string in RLP; a long list gets a long prefix */
  ok(Buffer.from(W.rlp(new Uint8Array(0))).toString('hex') === '80' && Buffer.from(W.rlp([])).toString('hex') === 'c0', 'rlp: empty string 0x80, empty list 0xc0');
  const longue = W.rlp([new Uint8Array(60)]); ok(longue[0] === 0xf8 && longue[1] === 62, 'rlp: a 62-byte list gets the long-list prefix 0xf8 0x3e');
  const T = await import(pathToFileURL(join(dir, 'fly-tx.js')).href + '?t=' + Date.now() + Math.random()), pt = T.parseTx(s.raw);
  ok(pt.to === tx.to && pt.chainId === 8453n && pt.data === tx.data && pt.nonce === 3n, 'fly-tx.parseTx (server side, no curve code) reads the same destination, chain and data');
  assert.throws(() => T.parseTx('0x02' + s.raw.slice(4).replace(/^f8/, 'f9')), /malformed|longer|truncated|length/); n++;
  const k2 = W.newKeyHex(); ok(/^0x[0-9a-f]{64}$/.test(k2) && k2 !== W.newKeyHex(), 'a new key is 32 random bytes, two draws differ');
  return n;
}

const total = await banc(ICI);
console.log('test-fly-wallet-20261108 : ' + total + ' assertions OK');

const MUTANTS = [
  ['octet de recuperation lu a la fin', (s) => s.replace('const yParity = sig[0], r = sig.slice(1, 33), s = sig.slice(33, 65);', 'const yParity = sig[64], r = sig.slice(0, 32), s = sig.slice(32, 64);')],
  ['zero encode sur un octet', (s) => s.replace('const out = []; while (n > 0n)', 'const out = n === 0n ? [0] : []; while (n > 0n)')],
  ['pas de type 2 dans le hash signe', (s) => s.replace('digest = keccak_256(concat(Uint8Array.of(2), rlp(fields)));', 'digest = keccak_256(rlp(fields));')],
  ['access list oubliee', (s) => s.replace("bytesOf(tx.to), intBytes(tx.value || 0), bytesOf(tx.data || '0x'), []];", "bytesOf(tx.to), intBytes(tx.value || 0), bytesOf(tx.data || '0x')];")],
  ['expediteur annonce au lieu de recupere', (s) => s.replace("return { ...fields, from: '0x' + hexOf(keccak_256(point.slice(1))).slice(26), hash: keccakHex(bytes) };", "return { ...fields, from: fields.to, hash: keccakHex(bytes) };")],
  ['prefixe long faux', (s) => s.replace('return concat(Uint8Array.of(base + 55 + l.length), l);', 'return concat(Uint8Array.of(base + 56 + l.length), l);')],
  ['destination lue dans les donnees', (s) => s.replace('to: l[5].length === 20 ? hexOf(l[5]) : null,', 'to: hexOf(l[7].slice(0, 20)),')],
  ['adresse sur la cle compressee', (s) => s.replace("secp256k1.getPublicKey(bytesOf(keyHex), false).slice(1)", "secp256k1.getPublicKey(bytesOf(keyHex), true).slice(1)")],
];
let tues = 0;
const SOURCES = ['fly-wallet.js', 'fly-tx.js'].map((f) => [f, readFileSync(join(ICI, f), 'utf8')]);
for (const [nom, muter] of MUTANTS) {
  const hits = SOURCES.filter(([, src]) => muter(src) !== src);
  if (hits.length !== 1) { console.log('  ' + nom + ' : MOTIF ' + (hits.length ? 'AMBIGU' : 'ABSENT')); continue; }
  const d = mkdtempSync(join(tmpdir(), 'flywallet-mut-'));
  for (const [f, src] of SOURCES) writeFileSync(join(d, f), f === hits[0][0] ? muter(src) : src);
  cpSync(join(ICI, 'lib'), join(d, 'lib'), { recursive: true });
  try { await banc(d); console.log('  ' + nom + ' : SURVIT'); } catch (e) { tues++; console.log('  ' + nom + ' : TUE (' + String(e.message).slice(0, 80) + ')'); }
}
assert.equal(tues, MUTANTS.length, 'MUTANTS : ' + tues + '/' + MUTANTS.length);
console.log('MUTANTS : ' + tues + '/' + MUTANTS.length + ' tues');
