# DIG — tip 20260922-prepaye-skip (CreateRouter open fee once)

**Stamp:** 2026-09-22 ~23:02 CEST · Zero 1  
**P0:** Give birth / goLaunch after CreateRouter `createPaid` still charged a **2nd 0.001**.

## Root cause

1. `peindrePlan` / `verifierLancement` set `feeDejaPaye` only from `plan.v2 && plan.inscriptionPayee`.
2. CreateRouter path is not v2-payee on the hook — fee already at sink via `createPaid`, remembered as `prepaye` (localStorage).
3. `completerInscriptionPayee` still pushed a **payant** `inscrire` etape with `value = FRAIS_OUVERTURE_WEI` while `payee(poolId)=false`.
4. `lancerMarcheBlock` alone honored `prepayePour` — UI + balance gates + inscription etape did not.

## Fix

- `openFeeDejaPayePour` + `recupererPrepayeCreateRouter` (on-chain createPaid → prepaye).
- peindrePlan / verifierLancement / lancerMarcheBlock skip 2nd 0.001 when prepaye.
- Before paint: zero `payant` inscription etapes when prepaye.
- Test: `test-prepaye-skip-0922.mjs`.

## SS7K3P desk (after tip live)

Token `0xb200000000000000000000baa5356bfc210cc30a` · createPaid `0x1490c139…` · smoke `0x6Acc…d186` ~0.002217 ETH.  
Sign: approvals + seed (~0.0003 ETH) — **not** second 0.001. Pool prove via vieDuBlock / Brain.
