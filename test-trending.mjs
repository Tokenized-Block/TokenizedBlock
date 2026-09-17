// test-trending.mjs — classement Trending sur des paires au format DexScreener (structure lue le 2026-09-17), temoins inclus.
import assert from 'node:assert/strict';
import { resumerTrending, usdCourt } from './trending.js';

const A = '0xb2000000000000000000000000000000000000aa', B = '0xb2000000000000000000000000000000000000bb',
  C = '0xb2000000000000000000000000000000000000cc', X = '0x1111111111111111111111111111111111111111';
const paire = (adr, o) => ({ chainId: 'base', dexId: 'uniswap', baseToken: { address: adr, symbol: o.sym || 'S', name: 'N' },
  priceUsd: o.prix ?? '0.001', priceChange: { h1: o.c1 ?? 0, h24: o.c24 ?? 0 }, volume: { h1: o.v1 ?? 0, h24: o.v24 ?? 0 },
  liquidity: { usd: o.liq ?? 1000 }, txns: { h24: { buys: 3, sells: 2 } }, fdv: 5000, pairCreatedAt: 1 });
let n = 0;
const ok = (f) => { f(); n++; };

ok(() => {
  const r = resumerTrending([
    paire(A, { sym: 'AAA', v1: 10, v24: 100, liq: 2000, prix: '0.5' }),
    paire(A, { sym: 'AAA', v1: 5, v24: 50, liq: 9000, prix: '0.6' }),   // 2e paire : volumes additionnes, prix de la plus liquide
    paire(B, { sym: 'BBB', v1: 100, v24: 120, liq: 800 }),
    paire(C, { sym: 'CCC', v1: 0, v24: 0, liq: 50000 }),                // aucun volume : ecarte
    paire(X, { sym: 'XXX', v1: 999, v24: 999, liq: 99999 }),            // pas un block connu : ecarte
  ], [A, B, C]);
  assert.deepEqual(r.lignes.map((l) => l.sym), ['BBB', 'AAA']);
  const a = r.lignes[1];
  assert.equal(a.volume1hUsd, 15);
  assert.equal(a.volume24hUsd, 150);
  assert.equal(a.liquiditeUsd, 11000);
  assert.equal(a.prixUsd, 0.6);
  assert.equal(a.trades24h, 10);
  assert.equal(r.blocksAvecPaire, 3);
  assert.equal(r.volume24hUsd, 270);
});

ok(() => {
  /* temoins : liquidite trop faible, autre chaine, texte hostile, champ absent reste absent */
  const r = resumerTrending([
    paire(A, { v1: 5, v24: 5, liq: 100 }),
    { ...paire(B, { v1: 5, v24: 5 }), chainId: 'ethereum' },
    { ...paire(C, { v1: 5, v24: 5 }), baseToken: { address: C, symbol: '<img src=x>', name: 'x' }, priceUsd: undefined },
  ], [A, B, C]);
  assert.equal(r.lignes.length, 1);
  assert.ok(!/[<>]/.test(r.lignes[0].sym));
  assert.equal(r.lignes[0].prixUsd, null);
  assert.deepEqual(resumerTrending(null, []).lignes, []);
});

ok(() => {
  assert.equal(usdCourt(5417990), '$5.4M');
  assert.equal(usdCourt(86052), '$86.1k');
  assert.equal(usdCourt(0.00002329), '$0.0000233');
  assert.equal(usdCourt(null), '—');
});

console.log('test-trending : ' + n + ' blocs verts');
