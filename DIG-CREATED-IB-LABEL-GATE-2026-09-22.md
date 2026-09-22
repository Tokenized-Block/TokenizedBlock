# DIG — Created→IB engraved refuse (tip 20260922-2112)

**Stamp:** 2026-09-22 ~21:12 CEST · Zero 1 / Raksha HARD  
**Repo:** tokenizedblock-app · tip `20260922-2112`

## 1) Exact refuse condition (« engraved »)

| Item | Detail |
|------|--------|
| UI site | `app.html` `calculerLancement` (~7274) |
| Gate | `label === 'NON'` after `blockPorteLeLabel({ rpc, jeton })` when hooks ∈ {V4…V8} |
| On-chain | Hook `porteLeLabel(address)` (`SEL 0x330676aa`) — reads `contractURI()` and searches for marqueur **`%22face%22%3A%7B`** (`"face":{`) |
| Not | `memoire-chaine` / localStorage Create session / face browser cache |
| Measure | COMMS `0xb200…3e01` → V4/V5 `porteLeLabel=NON`, URI `ipfs://…` (AUTRE_SOURCE). TBGAS → `OUI` (TB Create face JSON). |
| V8 | Bytecode still has NoLabel (`0x3f685d8d`) + `porteLeLabel`. `inscrire` reverts without marker. B20 `updateContractURI` post-create is refused (DIG-RAIL-FEES-NFT) — cannot engrave after the fact. |

## 2) Decision (Prefer ALLOW vs product)

**Prefer ALLOW** (any factory B20 → HOOK_V8 Instant Birth) **cannot land FRAIS_OUVERTURE** for OpenLaunch-born tokens: V8 still requires the face marker. Skipping the UI check only wastes gas on revert.

**Shipped (OR path):** keep Birth=V8 refuse for `label=NON`; **hide / replace V8 CTAs** when ineligible with honest reason; secondary fee path documented below. `label=NON_LU` still fail-open (RPC cough ≠ NON).

## 3) Secondary fee path (fees → a6cf, no sink addr in UI)

1. **Create here (free)** → face+brain engraved → **Give birth · V8** (0.001 ETH once · Fees for Dev) → `inscrire` → a6cf.  
2. **Buy/Sell in-app** on already-hooked V8/TbFeeHook pools → 0.5% interface fee → a6cf (tip 2026).  
3. External OpenLaunch volume on unhooked pools → **no** TB open fee; do not advertise V8 birth for unlabeled B20s.

## 4) Created filter = 0 rows (desk)

`filtreLive` for `CREATION` is `e.type === liveFiltre` — **no wrong hide**. Empty Created chip = no `B20Created` in the Live window (RPC `getLogs` rate-limit → `fenetresRatees`) or quiet window — not a one-liner filter bug. All still shows everything once events are read.

## 5) Before / after refuse line

**Before:** `this block was not engraved by this app's Create, so its market cannot open here`  
**After:** `V8 birth needs a face engraved at Create (on-chain label). This block was born elsewhere — Create a new block here (free), then Give birth · V8 (0.001 ETH once · Fees for Dev).`

## 6) Tests

`test-naissance-label-gate.mjs` — string + helper semantics; `test-hook-v5.mjs` still covers `blockPorteLeLabel` OUI/NON/NON_LU.
