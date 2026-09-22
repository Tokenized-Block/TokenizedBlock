# DIG — Bridge tab MVP (tip 20260922-bridge-tab)

**Stamp:** 2026-09-22 ~23:35 CEST · Zero 1 / Raksha  
**Goal:** First **Bridge** bottom-nav tab on Tokenized Block — new fee path (0.01%) because Created « another launchpad » still pays 0.

## Model

| Piece | Role |
|---|---|
| Bottom nav `data-volet="bridge"` | New tab beside Create — separate from Create / Feed / Map |
| `#v-bridge` panel | Hub picker + Fund / Swap modes |
| **Bridge block** | Any normal TB block chosen as hub (localStorage `tb.bridge.block`) |
| Fund mode | Coinbase Onramp CTA (fiat → ETH/USDC in **user** wallet) — retarget from Create via Bridge link |
| Swap mode | From / To / Amount + quote; path is **via Bridge block**, not naked external Dex |
| Fee | **0.01%** = `amount * 0.0001` (`BRIDGE_FEE_BPS = 1`) → same on-chain sink (a6cf); **never shown in UI** |
| Settlement | Prefer ETH or USDC labels — amount-only (no « Fees for Dev », no ≈$1) |
| Untouched | Instant Birth / CreateRouter / `openFeeDejaPayePour` / V8 |

## Stub vs live

| Capability | Status |
|---|---|
| Bridge tab visible in nav | **Live (UI)** |
| Select / create Bridge block | **Live UI** — create jumps to Create (IB unchanged); list scrapes wallet selects / My blocks |
| Fund wallet CTA (Coinbase) | **Live link** (external Onramp) |
| Quote math 0.01% fee + net | **Live stub math** (`bridge.js` `quoteBridge`) |
| Confirm / wallet / on-chain transfer | **Fee skim live** (tip `20260923-bridge-fee-skim`) when From=ETH/USDC; net hub swap still Phil GO |
| Fee → sink on Bridge volume | **Client-side 0.01% skim** → a6cf; net swap Phil-blocked |

## Ship files

- `bridge.js` — quote + localStorage hub helpers  
- `app.html` — `#v-bridge`, nav, wiring, `#bridge` hash, Create→Bridge retarget note  
- `serveur-web.js` — `bridge.js` on SERVIS allowlist  
- `test-bridge-tab-0922.mjs` — fee math + UI wiring smoke  

## Verify

```bash
node test-bridge-tab-0922.mjs
```

`/sante` build should read `20260922-bridge-tab` after deploy.

## Deploy note

Prefer GitHub→Railway auto-deploy from tip-of-main after merge. Avoid colliding with Super: only force Railway from tip-of-main if auto-deploy stuck.
