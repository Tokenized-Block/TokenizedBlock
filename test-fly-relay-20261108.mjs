// test-fly-relay-20261108.mjs — the autonomous fly's relay guard (fly-relay.js) on REAL signed transactions (fly-wallet.js signs,
// fly-tx.js parses as the server will), with mutants: what it relays, what it refuses, and when a planned call expires.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import './noble-node-resolve.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

async function banc(dir) {
  n = 0;
  const { createRelayGuard } = await import(pathToFileURL(join(dir, 'fly-relay.js')).href + '?t=' + Date.now() + Math.random());
  const { signTx } = await import(pathToFileURL(join(ICI, 'fly-wallet.js')).href);
  const { parseTx } = await import(pathToFileURL(join(ICI, 'fly-tx.js')).href);
  const { selecteur } = await import(pathToFileURL(join(ICI, 'keccak.js')).href);
  const { USDC_BASE } = await import(pathToFileURL(join(ICI, 'frais-creation.js')).href);
  const { POOLS_ACTIONS_AERODROME } = await import(pathToFileURL(join(ICI, 'pools-actions-aerodrome.js')).href);
  const NVDA = [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === 'NVDAc')[0];
  const T = selecteur('transfer(address,uint256)'), g = createRelayGuard({ usdc: USDC_BASE, isStock: (a) => !!POOLS_ACTIONS_AERODROME.get(a), transferSelector: T, ttlMs: 600000 });
  const key = '0x' + 'a11ce'.padStart(64, '0'), user = '0x' + '5'.repeat(40), router = '0x' + 'c0'.repeat(20);
  const tx = (o) => parseTx(signTx({ chainId: 8453, nonce: 0, maxPriorityFeePerGas: 1, maxFeePerGas: 2, gas: 21000, value: 0, data: '0x', to: router, ...o }, key).raw);
  const word = (a) => a.slice(2).toLowerCase().padStart(64, '0'), amt = (x) => BigInt(x).toString(16).padStart(64, '0');
  const swap = { to: router, data: '0x3593564c' + '11'.repeat(64), value: '0x0' }, T0 = 1_000_000;

  ok(g.refusal(tx({ to: swap.to, data: swap.data }), T0) !== null, 'a router call nobody planned is refused');
  ok(g.remember({ ok: true, aSigner: [swap] }, T0) === 1 && g.refusal(tx({ to: swap.to, data: swap.data }), T0 + 1000) === null, 'the same call, once the planner produced it, is relayed');
  const mixed = { to: '0x' + 'aB'.repeat(20), data: '0xABCD' + 'Ef'.repeat(30), value: '0x0' }; g.remember({ ok: true, aSigner: [mixed] }, T0);
  ok(g.refusal(tx({ to: mixed.to.toLowerCase(), data: mixed.data.toLowerCase() }), T0 + 1000) === null, 'a planner call in mixed case (checksummed address) still matches the signed bytes');
  ok(g.refusal(tx({ to: swap.to, data: swap.data, value: 1 }), T0 + 1000) !== null, 'the planned call with ETH added is refused');
  ok(g.refusal(tx({ to: swap.to, data: swap.data.slice(0, -2) + '12' }), T0 + 1000) !== null, 'one byte changed in the data: refused');
  ok(g.refusal(tx({ to: swap.to, data: swap.data }), T0 + 600000) !== null && g.refusal(tx({ to: swap.to, data: swap.data }), T0 + 599999) === null, 'a planned call expires after exactly 10 minutes');
  ok(g.remember({ ok: false, aSigner: [{ to: router, data: '0xdead', value: '0x0' }] }, T0) === 0 && g.refusal(tx({ to: router, data: '0xdead' }), T0) !== null, 'a refused plan teaches the guard nothing');
  /* withdraw */
  ok(g.refusal(tx({ to: USDC_BASE, data: T + word(user) + amt(5) }), T0) === null, 'USDC transfer (withdraw) relayed');
  ok(g.refusal(tx({ to: NVDA, data: T + word(user) + amt(5) }), T0) === null, 'stock transfer (withdraw) relayed');
  ok(g.refusal(tx({ to: router, data: T + word(user) + amt(5) }), T0) !== null, 'a "transfer" to an unknown contract is refused');
  ok(g.refusal(tx({ to: USDC_BASE, data: selecteur('approve(address,uint256)') + word(user) + amt(5) }), T0) !== null, 'an unplanned approve on USDC is refused');
  ok(g.refusal(tx({ to: USDC_BASE, data: T + word(user) + amt(5), value: 1 }), T0) !== null, 'a transfer carrying ETH is refused');
  ok(g.refusal(tx({ to: USDC_BASE, data: T + word(user) + amt(5) + '00' }), T0) !== null, 'a transfer with trailing bytes is refused');
  /* chain and plain ETH */
  ok(g.refusal(tx({ to: user, value: 1000 }), T0) === null, 'a plain ETH send is relayed');
  const { sealData } = await import(pathToFileURL(join(ICI, 'fly-seal.js')).href);
  const seal = sealData({ stock: NVDA, fingerprint: '0x' + 'ab'.repeat(32), windows: 7 });
  ok(g.refusal(tx({ to: user, data: seal }), T0) === null, 'a memory seal (66-byte note, no ETH) is relayed');
  ok(g.refusal(tx({ to: user, data: seal, value: 1 }), T0) !== null && g.refusal(tx({ to: user, data: seal + '00' }), T0) !== null, 'a seal carrying ETH, or with one byte more, is refused');
  ok(/8453/.test(g.refusal(tx({ to: user, value: 1000, chainId: 1 }), T0) || ''), 'another chain is refused, even for a plain send');
  for (let k = 0; k < 2100; k++) g.remember({ ok: true, aSigner: [{ to: router, data: '0x' + k.toString(16).padStart(8, '0'), value: '0x0' }] }, T0);
  ok(g.size === 2000, 'the memory of planned calls is bounded (' + g.size + ')');
  return n;
}

const total = await banc(ICI);
console.log('test-fly-relay-20261108 : ' + total + ' assertions OK');
const MUTANTS = [
  ['sceau avec ETH', (s) => s.replace('if (t.value === 0n && readSeal(t.data)) return null;', 'if (readSeal(t.data)) return null;')],
  ['toute chaine acceptee', (s) => s.replace("if (t.chainId !== 8453n) return 'chain ' + t.chainId + ' refused: Base (8453) only';", '')],
  ['valeur ignoree dans la cle', (s) => s.replace("+ '|' + BigInt(value || 0).toString();", ';')],
  ['jamais d expiration', (s) => s.replace('if (at !== undefined && now - at < ttlMs) return null;', 'if (at !== undefined) return null;')],
  ['plan refuse retenu', (s) => s.replace('if (!plan || !plan.ok || !Array.isArray(plan.aSigner)) return 0;', 'if (!plan || !Array.isArray(plan.aSigner)) return 0;')],
  ['transfer vers tout contrat', (s) => s.replace('&& (to === usdcL || isStock(to))) return null;', ') return null;')],
  ['transfer avec ETH', (s) => s.replace('&& t.value === 0n && (to === usdcL', '&& (to === usdcL')],
  ['longueur du transfer ignoree', (s) => s.replace('&& d.length === 2 + 8 + 128 ', '')],
  ['memoire sans borne', (s) => s.replace('while (planned.size > max)', 'while (false)')],
  ['casse comptee', (s) => s.replace("const key = (to, data, value) => String(to).toLowerCase() + '|' + String(data || '0x').toLowerCase()", "const key = (to, data, value) => String(to) + '|' + String(data || '0x').toLowerCase()")],
];
let tues = 0;
const source = readFileSync(join(ICI, 'fly-relay.js'), 'utf8');
for (const [nom, muter] of MUTANTS) {
  const muted = muter(source);
  if (muted === source) { console.log('  ' + nom + ' : MOTIF ABSENT'); continue; }
  const d = mkdtempSync(join(tmpdir(), 'flyrelay-mut-'));
  writeFileSync(join(d, 'fly-relay.js'), muted); cpSync(join(ICI, 'fly-seal.js'), join(d, 'fly-seal.js')); cpSync(join(ICI, 'keccak.js'), join(d, 'keccak.js'));
  try { await banc(d); console.log('  ' + nom + ' : SURVIT'); } catch (e) { tues++; console.log('  ' + nom + ' : TUE (' + String(e.message).slice(0, 80) + ')'); }
}
assert.equal(tues, MUTANTS.length, 'MUTANTS : ' + tues + '/' + MUTANTS.length);
console.log('MUTANTS : ' + tues + '/' + MUTANTS.length + ' tues');
