// test-tokenized-bank.mjs — proofOfHold reads balanceOf; never invents; gate > 0.
import assert from 'node:assert/strict';
import { proofOfHold, preuvePositive, grefferBlock, lireGreffes, ouvrirCreditUsdcStub,
  BANK_CONTRACT } from './tokenized-bank.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const BLOCK = '0xb2' + '11'.repeat(19);
const HOLDER = '0x' + 'a1'.repeat(20);
const pad = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');

function rpcQuiRend(hexOuErr) {
  return async (methode, params) => {
    eq(methode, 'eth_call', 'proofOfHold uses eth_call');
    const p = params[0];
    ok(String(p.to).toLowerCase() === BLOCK.toLowerCase(), 'calls the block token');
    ok(String(p.data).startsWith('0x70a08231'), 'selector is balanceOf(address)');
    ok(String(p.data).endsWith(pad(HOLDER)), 'holder padded in calldata');
    if (hexOuErr instanceof Error) throw hexOuErr;
    return hexOuErr;
  };
}

// 1. positive hold
{
  const raw = '0x' + (1000n).toString(16).padStart(64, '0');
  const p = await proofOfHold({ rpc: rpcQuiRend(raw), block: BLOCK, holder: HOLDER });
  eq(p.etat, 'LU', 'readable balance');
  eq(p.balance, 1000n, 'exact balance');
  ok(preuvePositive(p), 'gate opens when > 0');
}

// 2. zero hold — LU but gate closed
{
  const raw = '0x' + (0n).toString(16).padStart(64, '0');
  const p = await proofOfHold({ rpc: rpcQuiRend(raw), block: BLOCK, holder: HOLDER });
  eq(p.etat, 'LU', 'zero is a real reading');
  eq(p.balance, 0n, 'zero balance');
  ok(!preuvePositive(p), 'gate stays closed on zero');
}

// 3. empty / unread
{
  const p = await proofOfHold({ rpc: rpcQuiRend('0x'), block: BLOCK, holder: HOLDER });
  eq(p.etat, 'NON_LU', 'empty eth_call is NON_LU, not a fake zero');
  ok(!preuvePositive(p), 'unread never gates open');
}

// 4. RPC throw
{
  const p = await proofOfHold({ rpc: rpcQuiRend(new Error('node 429')), block: BLOCK, holder: HOLDER });
  eq(p.etat, 'NON_LU', 'RPC error → NON_LU');
  ok(String(p.pourquoi).includes('429'), 'reason kept');
}

// 5. invalid addresses
{
  const p = await proofOfHold({ rpc: async () => { throw new Error('should not call'); },
    block: 'not-an-addr', holder: HOLDER });
  eq(p.etat, 'INVALIDE', 'bad address refused before RPC');
}

// 6. local graft (no custody)
{
  const mem = new Map();
  const stockage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
  };
  const g = grefferBlock(stockage, HOLDER, BLOCK);
  ok(g.ok, 'graft ok');
  eq(lireGreffes(stockage, HOLDER).length, 1, 'one graft stored');
  grefferBlock(stockage, HOLDER, BLOCK);
  eq(lireGreffes(stockage, HOLDER).length, 1, 'idempotent');
}

// 7. credit stub honest
{
  eq(BANK_CONTRACT, null, 'no bank contract invented');
  const preuve = { etat: 'LU', balance: 5n };
  const c = ouvrirCreditUsdcStub({ holder: HOLDER, block: BLOCK, preuve });
  eq(c.etat, 'PENDING_CONTRACT', 'stub until credit contract');
  eq(c.creditUsdc, null, 'no fake USDC amount');
  const refuse = ouvrirCreditUsdcStub({ holder: HOLDER, block: BLOCK, preuve: { etat: 'LU', balance: 0n } });
  eq(refuse.etat, 'REFUSE', 'zero proof refused');
}

console.log('ok — ' + n + ' asserts (tokenized-bank)');
