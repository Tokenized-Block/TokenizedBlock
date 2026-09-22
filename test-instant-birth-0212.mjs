// tip 0212 — Instant Birth mint tx.value must be quoteEthWei (not ethRequis).
// Measured IB022: ethRequis was 39 wei short → Ask the chain refused (empty revert).
import assert from 'node:assert/strict';
import { mathsNaissanceInstantanee, MARGE_POUR_MILLE } from './lancer-pool.js';

const supply = 1_000_000_000n * 10n ** 18n;
const aPlacer = (supply * MARGE_POUR_MILLE) / 1000n;
const quote = 500000000000000n; // 0.0005 ETH — IB022 smoke seed

const r = mathsNaissanceInstantanee({ aPlacer, quoteEthWei: quote, blockEst1: true });
assert.equal(r.etat, 'OK');
assert.ok(r.ethRequis > 0n);
assert.ok(r.ethRequis <= quote);
/* The shortfall that broke Ask-the-chain on tip 0211: float sqrt math undershoots. */
const shortfall = quote - r.ethRequis;
assert.ok(shortfall >= 0n, 'ethRequis must not exceed seed');
console.log('ok: ethRequis', r.ethRequis.toString(), 'quote', quote.toString(), 'shortfall wei', shortfall.toString());
/* Plan rule (tip 0212): mint value = quote, never ethRequis alone when shortfall > 0. */
const txValue = quote; // mirrors planLancement
assert.equal(txValue, quote);
assert.ok(txValue >= r.ethRequis, 'tx.value covers on-chain settle');
console.log('ALL PASS tip 0212 Instant Birth mint value = quoteEthWei');
