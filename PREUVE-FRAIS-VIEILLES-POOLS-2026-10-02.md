# Old TB pools: does the in-app fee reach a6cf? Fork proof, to the wei (2026-10-02)

Founder decision at 14:20: old pools stay untouched. No new pool, no liquidity withdrawal. This file only proves what an in-app
Buy/Sell on those pools pays to a6cf (`0xa6cf99d3…f5d4`).
Fork-only (anvil `--base`, fork of Base block **52,077,197**, 14:22 CEST). No mainnet tx, no deploy.
Script: `preuve-frais-vieilles-pools-fork.mjs`. It calls the app's own `planEchange` (the Buy/Sell button), then executes
EXACTLY the returned tx, from blank impersonated addresses. Raw output: `preuve-frais-vieilles-pools-52077197.json`.
Result: **123 checks, 0 KO**.

## Inventory (old TB block pools)
- Source: Initialize events on our 8 hooks, 649/649 windows from 50,773,816 to 52,069,816, then 4/4 windows up to 52,077,197
  (0 new pools; 1,318 Initialize events read). Plus the hookless TBLOCK/ETH pool in Launch format.
- No pool exists on V3–V7.
- Swaps on these pool ids: **0 since 2026-09-23** (MESURE-fuite-frais-rails-2026-10-02), so 24h volume = 0.

| block | hook | quote | in-range L | in-app buy (0.001 ETH): a6cf receives | in-app sell (half): a6cf receives | block tokens to a6cf |
|---|---|---|---|---|---|---|
| TBGAS | V1 | ETH | 3.17e22 | **5,000,000,000,000 wei ETH** = floor(1e15·50/1e4), router | 9,656,421,633,624 wei ETH, hook (2.02 % of gross), router 0 | buy: V1 hook sends 19,751,851,187,638,752,206,370 (not the router) |
| RNG | V1 | ETH | 1.00e23 | 5,000,000,000,000 router | 9,651,994,237,365 hook | buy: hook 1,986,548,914,753,236,597,724 |
| TUTU | V1 | ETH | 1.00e23 | 5,000,000,000,000 router | 9,651,994,245,623 hook | buy: hook 1,986,615,294,939,960,917,386 |
| OK | V1 | ETH | 1.00e23 | 5,000,000,000,000 router | 9,651,994,244,335 hook | buy: hook 1,986,604,946,656,340,535,003 |
| O | V1 | ETH | 0 (liquidity out of range, still tradable) | 5,000,000,000,000 router | 9,651,994,245,916 hook | buy: hook 1,986,617,653,252,006,543,005 |
| A | V2 | ETH | 0 (out of range) | 5,000,000,000,000 router | 9,651,994,245,916 hook | 0 |
| BASED | V2 | ETH | 0 (out of range) | 5,000,000,000,000 router | 9,651,994,245,916 hook | 0 |
| IB022 | V8 | ETH | 6.03e20 | 5,000,000,000,000 **hook** = floor(1e15·5000/1e6), router 0 | 3,463,597,482,720 hook = floor(692,719,496,544,115·5000/1e6) | 0 |
| SS7K3P | V8 | ETH | 6.03e20 | 5,000,000,000,000 hook, router 0 | 3,776,296,764,756 hook = floor(755,259,352,951,365·5000/1e6) | 0 |
| TBLOCK(e7e9) | V8 | **SPCXc** | 0 (out of range) | **9,975 SPCXc-wei = router 5,000 + hook 4,975 → DOUBLE FEE** | **4,937 = hook 2,475 + router 2,462 → DOUBLE FEE** | 0 |
| TBLOCK(24c3) | none | ETH | 3.56e22 | 5,000,000,000,000 router | 2,487,982,676,550 = floor(497,596,535,310,007·50/1e4), router | 0 |

On every buy, the user pays exactly 1,000,000,000,000,000 wei excluding gas (1,000,000 SPCXc-wei on the SPCXc pool).
On every sell, exactly the requested block units leave the user.
In-app routing picks the old pool itself for all 11 (checked `cle.hooks`).

**Negative control** (on every pool where the router charges): the same tx with the TAKE recipient rewritten to `0x…beef`.
Result: a6cf +0 and `0x…beef` + 5,000,000,000,000 (on SPCXc: a6cf +4,975 = the hook's part alone, `beef` +5,000).
This shows the meter really reads the router TAKE, and it isolates hook vs router to the wei.

## Old blocks where the app route does NOT charge the ROUTER fee
- **V8 (IB022, SS7K3P)**, both directions: by design. The hook pays exactly 0.5 % in ETH; one fee per leg.
- **V1 (TBGAS, RNG, TUTU, OK, O) and V2 (A, BASED), sell side**: by design. The hook pays ETH (2.02 % of gross); router 0.
- **Fee wallet a6cf itself** (buyback): exempt by design.
- **No old block is traded in-app for free.**

## Two things to fix or decide (not changed here)
1. **Double fee on V8 + ERC-20 quote** (TBLOCK(e7e9)/SPCXc): `echange.js` sets `hookPaie` only when currency0 = ETH.
   - Measured: the V8 hook also pays a6cf in the quote (SPCXc) in BOTH directions.
   - So an in-app trade pays about 1 % (0.5 router + 0.5 hook).
   - Fix: in `hookPaieDejaA6cf`, treat V8 as paying for any quote that it pays in the quote currency (measured here). Then keep the router at 0 on that leg.
2. **V1 buys**: the router fee is ETH (correct), but the **V1 hook** sends **block tokens** to a6cf (≈2 % of the output).
   - That is the hook's own behaviour, unchangeable (the hook is in the PoolKey).
   - The rule "never block token" holds for the router, not for the V1 hook.
