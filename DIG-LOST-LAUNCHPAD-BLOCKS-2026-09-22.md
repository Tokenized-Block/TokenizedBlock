# DIG — Lost launchpad blocks (CreateRouter paid vs free factory / other pads)

**Stamp:** 2026-09-22 ~22:58 CEST (Europe/Brussels) · Zero 1 executor  
**Repo tip ship:** `20260922-prepaye-skip` (CreateRouter open-fee once at Launch)  
**Live at measure start:** `/sante` build `20260922-no-unhooked`  
**Artifact:** `/workspace/lost-launchpad-mesure-2026-09-22.json` · script `tokenizedblock-app/mesure-lost-launchpad.mjs`  
**Addresses (from `frais-creation.js` / integrators pack, not memory):**  
- FACTORY `0xb20f000000000000000000000000000000000000`  
- CreateRouter `0xe05CD0336cD18A0909BCA980a4191A0B00a3FdF5`  
- FEE_WALLET sink (never show in UI) recorded in module only  

## 1) Measured counts (Base head `51660502`)

| Window | B20Created | CREATE_ROUTER (paid) | FACTORY_DIRECT (value 0) | EXTERNAL_LAUNCHER | ratio paid | **lost (unpaid)** |
|--------|------------:|---------------------:|-------------------------:|------------------:|-----------:|------------------:|
| last ~10k blocks (~5.6 h) | **102** | **1** | **22** | **79** | **0.0098** | **101** |
| last ~50k blocks (~28 h) | **354** | **1** | **99** | **254** | **0.0028** | **353** |

CreateRouter ETH forwarded in 10k window (successful receipts): **0.001 ETH** (= SS7K3P smoke `0x1490c139…`).

### Top external `tx.to` (10k)

- `0x1176122eb77ad6a2339322cda7c4d7ea9bfa63dc` · **63**
- `0x274d92df0d1ceff9080360191fee0d3299c21b49` · **3**
- `0x9ef9f550e9916a59d5dc6bd6b22203cf769b6a7e` · **3**
- `0x15a3f3abb733868d193b511dd5b91f82ebf888a3` · **2**
- `0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789` · **2**
- `0x953d633b49ba14e5410f7168e8d0de7f269c51a3` · **2**

Lead external `0x1176122e…63dc` alone = **63 / 102** creates in 10k — another launchpad path. Some of those txs carry `value=0.001` but **not** to our CreateRouter / sink.

## 2) Product reading

Created « another launchpad » ⇒ TB feed still lists factory `B20Created`, but **~99% never pay a6cf at create**. App Instant Birth CreateRouter same-sig closes the **TB UI** hole for creators who stay in-app; it does **not** tax OpenLaunch / other routers.

## 3) Convert paths (ordered)

1. **App (shipped lineage):** Instant Birth → CreateRouter `createPaid` 0.001 → sink, then Launch seed **without second 0.001** (`20260922-prepaye-skip`).  
2. **Hook V9+ (handoff §6):** `beforeInitialize` requires open fee — external opens still pay (Phil signs deploy).  
3. **Integrators:** publish CreateRouter pack; do not rely on raw factory honesty.

## 4) SS7K3P parallel (measured)

| Item | Value |
|------|--------|
| Token | `0xb200000000000000000000baa5356bfc210cc30a` |
| Sym | SS7K3P · `porteLeLabel(V8)=true` |
| createPaid | `0x1490c139dca6ebbe879d47eaf37558d5b32235434c36830aff9939a46bfaa46d` SUCCESS · value 0.001 → CreateRouter |
| Pool | none yet (Brain ASLEEP) |
| Smoke bal | ~0.002217 ETH (`0x6Acc0473…d186`) |
| planLancement | APPROBATIONS · seed ~0.00031 ETH · enough for seed; **pre-fix** double-charge was 2nd 0.001 via `completerInscriptionPayee` / UI `feeDejaPaye` ignoring CreateRouter prepaye |

## 5) Coinbase tokenized quotes (from `paires.js` only)

`pairesProposees(8453)` = DEVISES_BASE + ACTIONS_COINBASE. Examples:  
AAPLc `0xb200…d1fb` · GOOGLc `0xb200…58b7` · COINc `0xb200…ecfb` · NVDAc `0xb200…108c` · TSLAc `0xb200…0cd0` (full list in `ACTIONS_COINBASE`). Pairing UI chips: stock-pair-ux graft on same branch.

