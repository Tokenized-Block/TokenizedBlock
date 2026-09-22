// test-tokenized-bank.mjs — proofOfHold + basket credit model (Raksha 2026-09-22).
import assert from 'node:assert/strict';
import {
  proofOfHold, proofOfHoldPanier, preuvePositive, grefferBlock, lireGreffes, retirerGreffe,
  ouvrirCreditUsdcStub, creditSurvitPerte, noterEarlyHolder, lireEarlyHolders, BANK_CONTRACT,
} from './tokenized-bank.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const BLOCK = '0xb2' + '11'.repeat(19);
const BLOCK2 = '0xb2' + '22'.repeat(19);
const HOLDER = '0x' + 'a1'.repeat(20);
const pad = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const hexBal = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');

function rpcQuiRend(hexOuErr) {
  return async (methode, params) => {
    eq(methode, 'eth_call', 'proofOfHold uses eth_call');
    const p = params[0];
    ok(String(p.data).startsWith('0x70a08231'), 'selector is balanceOf(address)');
    ok(String(p.data).endsWith(pad(HOLDER)), 'holder padded in calldata');
    if (hexOuErr instanceof Error) throw hexOuErr;
    return hexOuErr;
  };
}

function rpcPanier(map) {
  return async (methode, params) => {
    eq(methode, 'eth_call', 'panier uses eth_call');
    const to = String(params[0].to).toLowerCase();
    if (!(to in map)) throw new Error('unknown block');
    if (map[to] instanceof Error) throw map[to];
    return map[to];
  };
}

function memStore() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
  };
}

// 1. positive hold
{
  const p = await proofOfHold({ rpc: rpcQuiRend(hexBal(1000n)), block: BLOCK, holder: HOLDER });
  eq(p.etat, 'LU', 'readable balance');
  eq(p.balance, 1000n, 'exact balance');
  ok(preuvePositive(p), 'gate opens when > 0');
}

// 2. zero hold — LU but gate closed
{
  const p = await proofOfHold({ rpc: rpcQuiRend(hexBal(0n)), block: BLOCK, holder: HOLDER });
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

// 6. local graft basket + ungraft
{
  const stockage = memStore();
  grefferBlock(stockage, HOLDER, BLOCK);
  grefferBlock(stockage, HOLDER, BLOCK2);
  eq(lireGreffes(stockage, HOLDER).length, 2, 'basket has two');
  retirerGreffe(stockage, HOLDER, BLOCK);
  eq(lireGreffes(stockage, HOLDER).join(','), BLOCK2.toLowerCase(), 'one removed, other remains');
}

// 7. basket proof — credit on totality of survivors
{
  const rpc = rpcPanier({
    [BLOCK.toLowerCase()]: hexBal(10n),
    [BLOCK2.toLowerCase()]: hexBal(0n),
  });
  const panier = await proofOfHoldPanier({ rpc, blocks: [BLOCK, BLOCK2], holder: HOLDER });
  eq(panier.survivants.length, 1, 'only positive holds back credit');
  eq(panier.survivants[0], BLOCK.toLowerCase(), 'survivor is BLOCK');
  ok(panier.etat === 'LU' || panier.etat === 'PARTIEL', 'basket readable');
}

// 8. one block lost ≠ credit dead
{
  const preuves = [
    { etat: 'LU', balance: 5n, block: BLOCK.toLowerCase() },
    { etat: 'LU', balance: 9n, block: BLOCK2.toLowerCase() },
  ];
  const r = creditSurvitPerte([BLOCK, BLOCK2], BLOCK, preuves);
  ok(r.survit, 'credit survives losing one of two');
  eq(r.survivants.join(','), BLOCK2.toLowerCase(), 'other block still backs');
  const dead = creditSurvitPerte([BLOCK], BLOCK, preuves);
  ok(!dead.survit, 'last block lost → credit dies');
}

// 9. credit stub on basket + early holders share
{
  eq(BANK_CONTRACT, null, 'no bank contract invented');
  const stockage = memStore();
  const preuves = [
    { etat: 'LU', balance: 5n, block: BLOCK.toLowerCase() },
    { etat: 'LU', balance: 1n, block: BLOCK2.toLowerCase() },
  ];
  const c = ouvrirCreditUsdcStub({
    holder: HOLDER, blocks: [BLOCK, BLOCK2], preuves, stockage,
  });
  eq(c.etat, 'PENDING_CONTRACT', 'stub until credit contract');
  eq(c.creditUsdc, null, 'no fake USDC amount');
  eq(c.basket.length, 2, 'credit on basket totality');
  ok(c.holdRequired, 'must hold to maintain');
  ok(c.oneLostDoesNotKill, 'resilience flag');
  ok(c.yieldSharedWithEarlyHolders, 'early holders share yield');
  ok(c.earlyHolders.includes(HOLDER.toLowerCase()), 'opener recorded as early holder');
  const refuse = ouvrirCreditUsdcStub({
    holder: HOLDER, blocks: [BLOCK], preuves: [{ etat: 'LU', balance: 0n, block: BLOCK }],
  });
  eq(refuse.etat, 'REFUSE', 'zero basket refused');
  /* back-compat single block */
  const one = ouvrirCreditUsdcStub({ holder: HOLDER, block: BLOCK, preuve: { etat: 'LU', balance: 3n, block: BLOCK } });
  eq(one.etat, 'PENDING_CONTRACT', 'single-block API still works');
}

// 10. early holders accumulate
{
  const stockage = memStore();
  noterEarlyHolder(stockage, HOLDER, HOLDER);
  const other = '0x' + 'b3'.repeat(20);
  noterEarlyHolder(stockage, HOLDER, other);
  eq(lireEarlyHolders(stockage, HOLDER).length, 2, 'pooled early holders listed');
}

console.log('ok — ' + n + ' asserts (tokenized-bank)');
