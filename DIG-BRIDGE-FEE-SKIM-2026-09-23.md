# DIG — Bridge confirm 0.01% fee skim (tip 20260923-bridge-fee-skim)

**Stamp:** 2026-09-23 ~00:05 CEST · Zero 1 / Raksha  
**Goal:** Un-stub Bridge confirm so **0.01%** of volume hits FEE_WALLET (a6cf) in ETH or USDC — never show address; no Fees for Dev; no ≈$1.

## Dig findings

| Path | Verdict |
|---|---|
| Buy/Sell `FRAIS_INTERFACE_BPS = 50` + `assertFraisInterfaceA6cf` | **Cannot reuse** for 1 bps — fail-closed wants exactly 50 |
| CreateRouter | Paid **create** floor only — not a volume % skim |
| Dedicated 1 bps BridgeRouter / TAKE_PORTION | **Does not exist** → **GO Phil** (signed deploy) |
| Client-side ETH send / USDC `transfer` skim | **Shipped** — user-signed via `envoi.js` |

## Live vs Phil-blocked

| Capability | Status |
|---|---|
| Bridge tab UI + quote 0.01% | **Live** (prior tip) |
| Confirm → wallet fee skim when **From = ETH or USDC** | **Live** (this tip) |
| Fee → a6cf (ETH value or USDC ERC-20) | **Live** client-side |
| Net tokenized↔tokenized swap via Bridge hub | **Phil-blocked** — needs 1 bps on-chain router |
| Tokenized From (non-ETH/USDC) Confirm | Honest stub copy (GO Phil) |

## Security (client-side skim)

- Fee is a **separate** user-signed tx (wallet displays to/value/data). App never holds keys.
- **Not atomic** with the (still missing) net swap — user can refuse; refuse = nothing sent.
- Fail-closed if 1 bps rounds to **0** units.
- FEE_WALLET / a6cf **never** rendered in Bridge panel copy.
- Buy/Sell 0.5%, Instant Birth, CreateRouter, V8, prepaye dust — **untouched**.

## GO Phil (contract)

Ship a BridgeRouter (or extend Universal Router actions) that:

1. Accepts Bridged volume in ETH/USDC (and later tokenized legs via hub).
2. `TAKE` / `TAKE_PORTION` **1 bps** → FEE_WALLET in same tx as net path.
3. Makes fee+swap atomic so users cannot pay fee without receiving net.

Until then: UI takes the measurable 0.01% skim only.

## Smoke

- Micro skim with smoke `0x6Acc…d186` **if** wallet available on Base (min amount so fee ≥ 1 wei / 1 USDC unit).
- Box executor has **no smoke PK** — do not invent keys. Measure a6cf Δ after organic/smoke sign.
- Buy/Sell smoke proof remains separate (0.5%).

## Verify

```bash
node test-bridge-tab-0922.mjs
```

`/sante` build → `20260923-bridge-fee-skim`.

## Ship files

- `bridge.js` — `planBridgeFeeSkim`, `buildBridgeFeeCall`, `unitsFromHuman`
- `app.html` — Confirm Bridge fee → `envoyerDepuisWallet`
- `test-bridge-tab-0922.mjs` — skim math + no-address UI
- this DIG
