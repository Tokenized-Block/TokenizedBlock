# DIG — Bridge legs × x402 × Brain bot loop

**Stamp:** 2026-09-23 ~14:20 CEST · **Author:** C2  
**Source handoff:** `HANDOFF-CLAUDE-C4A-BRIDGE-ADVANCE-2026-09-23.md` (clean rewrite only)  
**Scope:** P1 paper — architecture matrix. **No live tip. No overnight Railway.**  
**C4A ≠ TB:** Coinbase for Agents / equities MCP is a **signal**, not a product to copy. Advance = our Bridge model on Base.

---

## Verdict (fill once)

- [ ] APPROVE dig → Zero 1 may tip small P2
- [ ] CHANGES (list)
- [x] **BLOCKED on organic P0** — dig is the model; **no P2 Railway tip** until organic a6cf ETH/USDC Δ ≥ 1e15 wei (sender ≠ smoke `0x6acc…`) **or** explicit Raksha GO. Why: sink still flat; convert/IB/Buy-Sell is the live KPI; BridgeRouter/V9 stays Phil GO; overnight scope creep forbidden.

Zero 1 may keep P0 green (convert path, tip self-QA). P2 code may be drafted offline only after this dig is acknowledged — **ship gate = organic / Raksha**, not dig completeness.

---

## 1. Bridge legs matrix (allowed pairs + fee)

| From → To | Allowed? | Fee rail | Settlement | Live today | Gate |
|---|---|---|---|---|---|
| Fiat → user wallet ETH/USDC | **Yes** (Fund mode) | Provider fees (Coinbase/MoonPay) — **not** TB skim | Destination = **user** wallet only; never TB custody / never a6cf as dest | Onramp CTA / Fund link | Keep A-first dig; no custody |
| ETH/USDC → ETH/USDC (Bridge confirm skim) | **Yes** | Bridge **0.01%** (1 bps) client skim → a6cf | Separate user-signed ETH value / USDC transfer | Live skim tip | Fail-closed if fee rounds to 0 |
| Token ↔ Token via Bridge hub block | **Yes (model)** | Same **0.01%** — prefer atomic | Hub allowlist + minOut | UI quote stub; **net swap Phil-blocked** | **Phil BridgeRouter 1 bps** only with Phil GO |
| Tokenized equity → Token / Block | **Leg later** | 0.01% when real venue exists | Equity as Bridge **leg**, not TB broker | Not live | P3 — real availability outside US roadmap |
| Block ↔ Block (TB hub) | **Yes (model)** | 0.01% Bridge rail | Via chosen Bridge block | Hub picker UI | Same Phil gate for atomic net |
| Buy/Sell after Launch (pool) | **Separate rail** | **0.5%** hook / interface → a6cf | Hooked TB pool only | Live | Untouched by Bridge dig |
| Instant Birth / CreateRouter | **Separate rail** | **0.001 ETH** same-sig → a6cf | On-chain birth | Live lock | Never ≈$1; never replace with x402 alone |

**Pair rules**

1. Fee asset for any **TB Bridge fee** = **ETH or USDC only** (never TBGAS / arbitrary ERC-20 / equity share as fee).
2. Fiat never settles into a6cf or a TB hot wallet — only into the user’s address, then existing rails apply.
3. Tokenized equities are a **future Bridge leg**, not a FINRA/CCM broker inside TB, not a Coinbase equities MCP wrap.
4. No 2factor / leverage surface on Bridge.

---

## 2. x402 fee matrix (what may use x402 vs on-chain-only)

| Fee / action | x402 allowed? | Why | Recognition |
|---|---|---|---|
| Brain / bot **data or tool micropay** (watch feeds, paid APIs) | **Yes — primary** | Less wallet friction for agent loop | Pay → receipt → Brain journal write |
| Bridge **0.01%** skim (user Bridge confirm) | **Hybrid later** | Today = wallet skim; x402 OK only if receipt maps 1:1 to a6cf ETH/USDC and fails closed | Must not double-charge skim + x402 |
| Buy/Sell **0.5%** | **No (P1–P2)** | Must stay hooked / interface on-chain → a6cf | Keep `assertFrais…` / hook path |
| Instant Birth **0.001 ETH** | **No (P1–P2)** | Same-sig CreateRouter lock | Never substitute x402 for birth fee |
| BridgeRouter atomic 1 bps (Phil) | **No substitute** | Atomicity is on-chain | x402 is not a BridgeRouter |
| “Prepaye / openFee already paid” spirit | **Yes (recognition)** | x402 receipt can mark a **bot session allowance** used — not a birth fee replacement | ETH/USDC sink credit only |

**x402 → sink rules**

- Settlement asset **ETH or USDC only**.
- Destination recognition = on-chain sink `a6cf` (or a dedicated x402 collector that **sweeps** to a6cf — Phil/ops design, not UI).
- Never show sink address / “Fees for Dev” in UI.
- Organic notify still = real inbound ETH/USDC Δ only (smoke ≠ KPI).

---

## 3. Bot loop sequence + who signs (Option A)

```
detect (Brain watch)
  → optional x402 pay for data/tool (delegated signer under caps)
  → propose action (Brain) — Launch / Buy / Bridge / journal note
  → user or capped agent session **signs / pays** fees within limits
  → Brain **writes** result into journal/memory
```

| Role | Does | Does not |
|---|---|---|
| Brain | Watch, propose, write journal | Freestyle-sign markets; open-ended Launch/Buy |
| Delegated signer (user wallet / Coinbase agent / app session) | Pays x402 + TB fees under caps | Exceed caps; invent fee recipient |
| On-chain rails | Collect birth / 0.5% / Bridge skim → a6cf | Accept TBGAS fee |

**Option B** (capped x402 bot allowance that auto-pays) = **later**, only after A proven + explicit C2+Zero 1 GO. Remove soft “maybe Brain signs everything”.

---

## 4. Delete / retire (same PR spirit when P2 eventually ships)

| Retire / delete | Reason |
|---|---|
| Copy that implies TB is a US equities broker / C4A clone | C4A ≠ TB |
| Dead Bridge stubs that promise atomic tokenized↔tokenized without Phil GO | Honest “GO Phil” / blocked copy only |
| ≈$1 / Fees for Dev / sink address in Bridge or Brain UI | Hard rules |
| Stacked addendum handoffs fighting this clean file | This dig + clean handoff only |
| Open-ended “Brain signs markets” language | Option A only |
| 2factor / leverage Bridge affordances | Non-goal |

Keep: Fund onramp → user wallet; Bridge hub picker; 0.01% skim for ETH/USDC From; Buy/Sell 0.5%; IB 0.001 ETH.

---

## 5. Non-goals (explicit)

- Copying Coinbase equities MCP into TB
- TB as FINRA/CCM broker
- Wrapping 2factor leverage
- Overnight mega-refactor / live tip for P2 while organic flat
- Replacing CreateRouter / IB / Buy-Sell with x402
- Showing fee sink in UI
- Counting smoke (`0x6acc…`) as organic success
- Phil BridgeRouter / V9 `beforeInitialize` without Phil GO
- TokenizedBank before organic fees

---

## 6. Live check (stamp)

- `/sante` at dig write: build **`20260923-companion-role`** (HTTP 200) — tip moved past `created-history` / earlier watches. **Re-check before any tip.**
- a6cf ETH last watches: flat `3391122938172295` wei · Δ=0 · USDC 0.
- Prior Bridge digs still valid: `DIG-BRIDGE-TAB-2026-09-22.md`, `DIG-BRIDGE-FEE-SKIM-2026-09-23.md`, `DIG-BRIDGE-ROUTER-1BPS-GO-PHIL-2026-09-23.md`.

---

## 7. Next (gated)

| Who | Action |
|---|---|
| Zero 1 | ACK verdict; **no P2 tip**; keep P0 organic convert / self-QA `/sante` |
| C2 | Fee watch organic-only; QA convert path without smoke-KPI when tip stable |
| Phil | BridgeRouter 1 bps only on GO |
| Raksha | Optional GO to unblock P2 tip early |

**Signature:** C2 · 2026-09-23 · BLOCKED on organic P0 for live P2 · dig = model only


## Zero 1 tip ship

- Tip id: `20260923-bridge-x402-brain`
- Raksha GO + dig model → small P2 live tip
