// test-fly-seal-20261108.mjs — the fly's memory sealed on Base (fly-seal.js): fingerprint, note, read-back and the checks on the
// TRANSACTION (sender = receiver = the sealing wallet), with mutants.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

async function banc(dir) {
  n = 0;
  const S = await import(pathToFileURL(join(dir, 'fly-seal.js')).href + '?t=' + Date.now() + Math.random());
  const { keccak256Hex } = await import(pathToFileURL(join(ICI, 'keccak.js')).href);
  ok(S.SEAL_MAGIC === Buffer.from('TBFLY1').toString('hex'), 'the magic is "TBFLY1", computed, not typed');
  const mem = [100000, 99950, 87000, 5000, 100000], mem2 = [100000, 99950, 87001, 5000, 100000];
  const fp = S.memoryFingerprint(mem);
  ok(fp === keccak256Hex(Uint8Array.from([0, 1, 134, 160, 0, 1, 134, 110, 0, 1, 83, 216, 0, 0, 19, 136, 0, 1, 134, 160])), 'fingerprint = keccak-256 of 4-byte big-endian integers (checked by hand)');
  ok(S.memoryFingerprint([...mem]) === fp && S.memoryFingerprint(mem2) !== fp, 'same memory, same fingerprint; one synapse off by 1/100000 changes it');
  assert.throws(() => S.memoryFingerprint([]), /no memory/); n++;
  assert.throws(() => S.memoryFingerprint([1, 2.5]), /out of range/); n++;
  const stock = '0xb20000000000000000000078ee7ce2fe4908108c', me = '0x' + '5a'.repeat(20);
  const data = S.sealData({ stock, fingerprint: fp, windows: 173 });
  ok(data.length === 2 + 132, 'the note is 66 bytes');
  const back = S.readSeal(data);
  ok(back && back.stock === stock && back.fingerprint === fp && back.windows === 173, 'the note reads back: stock, fingerprint, windows');
  ok(S.readSeal('0x' + '00'.repeat(66)) === null && S.readSeal(data + '00') === null && S.readSeal(data.slice(0, -2)) === null, 'anything else is not a seal');
  const tx = { from: me, to: me, input: data };
  const c = S.checkSeal(tx, { sealer: me, stock, memory: mem });
  ok(c.ok && c.same && c.windows === 173, 'the sealed memory matches');
  const c2 = S.checkSeal(tx, { sealer: me, stock, memory: mem2 });
  ok(c2.ok && !c2.same, 'a memory changed since is told apart');
  ok(!S.checkSeal({ ...tx, from: '0x' + '7e'.repeat(20) }, { sealer: me, stock, memory: mem }).ok, 'a seal sent by another wallet is refused');
  ok(!S.checkSeal({ ...tx, to: '0x' + '7e'.repeat(20) }, { sealer: me, stock, memory: mem }).ok, 'a seal sent to someone else is refused');
  ok(!S.checkSeal(tx, { sealer: me, stock: '0x' + '11'.repeat(20), memory: mem }).ok, 'a seal for another stock is refused');
  ok(!S.checkSeal(null, { sealer: me, stock, memory: mem }).ok, 'no transaction, no seal');
  return n;
}
const total = await banc(ICI);
console.log('test-fly-seal-20261108 : ' + total + ' assertions OK');
const MUTANTS = [
  ['octets dans le mauvais ordre', (s) => s.replace('b[4 * k] = v >>> 24; b[4 * k + 1] = (v >>> 16) & 255; b[4 * k + 2] = (v >>> 8) & 255; b[4 * k + 3] = v & 255;', 'b[4 * k + 3] = v >>> 24; b[4 * k + 2] = (v >>> 16) & 255; b[4 * k + 1] = (v >>> 8) & 255; b[4 * k] = v & 255;')],
  ['expediteur non verifie', (s) => s.replace("if (String(tx.from).toLowerCase() !== String(sealer).toLowerCase() || String(tx.to)", "if (String(tx.to)")],
  ['destinataire non verifie', (s) => s.replace("|| String(tx.to).toLowerCase() !== String(sealer).toLowerCase()) return", ") return")],
  ['action non verifiee', (s) => s.replace("if (s.stock !== String(stock).toLowerCase()) return { ok: false, why: 'sealed for another stock' };", '')],
  ['longueur non verifiee', (s) => s.replace("if (!/^0x[0-9a-f]{132}$/.test(h) ||", "if (!/^0x[0-9a-f]{132,}$/.test(h) ||")],
  ['marqueur non verifie', (s) => s.replace("|| h.slice(2, 14) !== SEAL_MAGIC) return null;", ') return null;')],
  ['memoire jamais comparee', (s) => s.replace('const same = s.fingerprint === memoryFingerprint(memory);', 'const same = true;')],
];
let tues = 0;
const source = readFileSync(join(ICI, 'fly-seal.js'), 'utf8');
for (const [nom, muter] of MUTANTS) {
  const muted = muter(source);
  if (muted === source) { console.log('  ' + nom + ' : MOTIF ABSENT'); continue; }
  const d = mkdtempSync(join(tmpdir(), 'flyseal-mut-'));
  writeFileSync(join(d, 'fly-seal.js'), muted); copyFileSync(join(ICI, 'keccak.js'), join(d, 'keccak.js'));
  try { await banc(d); console.log('  ' + nom + ' : SURVIT'); } catch (e) { tues++; console.log('  ' + nom + ' : TUE (' + String(e.message).slice(0, 80) + ')'); }
}
assert.equal(tues, MUTANTS.length, 'MUTANTS : ' + tues + '/' + MUTANTS.length);
console.log('MUTANTS : ' + tues + '/' + MUTANTS.length + ' tues');
