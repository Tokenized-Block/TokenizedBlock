# DIG — Where do Created/Feed fees go? (catch → CreateRouter)

**Stamp:** 2026-09-23 ~10:40 CEST (Europe/Brussels) · Zero 1 · Bankr rails  
**Live before ship:** `/sante` `20260923-map-buy-cta`  
**Ship tip:** `20260923-feed-catch-router`  
**Sink (never UI):** `0xa6cf…f5d4` · CreateRouter `0xe05C…FdF5` · Factory `0xb20f…`

## 1) How a block gets listed on Feed / Created

| Step | Mechanism |
|------|-----------|
| Index | `fil-live.js` → `listerCreations` (`index-blocks.js`) reads factory `B20Created` logs on Base |
| Row | Every factory create in the Live window → `type: CREATION` on Social Live |
| Paid flag | `creationPayee`: `tx.to === CREATE_ROUTER` only (`paidCreate`) |
| Map cubes | Same factory `B20Created` stream (density ≠ fee) |

**Root cause:** Created celebrates **all** B20 births on Base. Almost none shop CreateRouter → **0 ETH to sink** at create. Foreign pads may take their own fee; factory-direct is value 0.

## 2) On-chain sample (2026-09-23 morning)

Window ~12k blocks via `listerCreations` · **35** creates · **0 paidCreate**:

| Class | n | Create fee → a6cf? | Mint cut → a6cf? | Hook / Buy 0.5% → a6cf? |
|-------|--:|--------------------|------------------|-------------------------|
| **paidCreate** (tx→CreateRouter) | **0** | Yes · 0.001 ETH | N/A (sealed 1B creator) | After Launch hooked: yes |
| **factoryDirect** (tx→b20f value 0) | **20** | **No** | No | Only if later TB hooked Launch + in-app Buy |
| **foreignLaunchpad** (other `tx.to`) | **15** | **No** (fee stays on their router; e.g. `0x1176…` often 0.001+ ETH elsewhere) | No | External Dex unhooked = $0 to a6cf |

Prior dig (22 Sep, 10k blocks): paid ratio **~1%** (1/102). Pattern unchanged.

## 3) Product catch (decided — Bankr rails)

Cannot stop raw factory on-chain. Catch = **app listing + create UX must shop our router**.

| Option | Verdict |
|--------|---------|
| A UI hide foreign | Partial — keep visible as secondary honesty |
| **B Force Create tab / IB → CreateRouter** | **SHIP** — MAIN `utiliseCreateRouter()` always true; kill factory value-0 / `creerSansVie` |
| **C Feed honesty + IB CTA** | **SHIP** — foreign never plain « was born »; primary CTA Instant Birth on TB · 0.001 ETH |
| D On-chain gate | Residual — V9+ Phil; not this tip |

## 4) Residual (honesty)

Public factory + other launchpads still mint free/foreign B20s. Feed may still *list* them (demoted). Only TB Create path is forced paid. Sink flat today = funnel cold + this flood (see DIG-WHY-SINK-FLAT).
