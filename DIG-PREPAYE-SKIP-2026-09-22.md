# DIG — tip 20260922-prepaye-skip (CreateRouter open fee once)

**Stamp:** 2026-09-22 ~23:02 CEST · Zero 1  
**P0:** Give birth / goLaunch after CreateRouter `createPaid` still charged a **2nd 0.001**.

## Root cause

1. `peindrePlan` / `verifierLancement` set `feeDejaPaye` only from `plan.v2 && plan.inscriptionPayee`.
2. CreateRouter path is not v2-payee on the hook — fee already at sink via `createPaid`, remembered as `prepaye` (localStorage).
3. `completerInscriptionPayee` still pushed a **payant** `inscrire` etape with `value = FRAIS_OUVERTURE_WEI` while `payee(poolId)=false`.
4. `lancerMarcheBlock` alone honored `prepayePour` — UI + balance gates + inscription etape did not.

## Fix

- `openFeeDejaPayePour` + `recupererPrepayeCreateRouter` (on-chain createPaid → prepaye; survives reconnect via localStorage keyed by block).
- peindrePlan / verifierLancement / lancerMarcheBlock skip 2nd 0.001 when prepaye.
- Before paint: zero `payant` inscription etapes when prepaye.
- Test: `test-prepaye-skip-0922.mjs`.

## Ship

- PR #28 MERGED · commit `71f864d` / merge `55a41a5`
- Live: `/sante` build `20260922-prepaye-skip` · Railway deploy `783f7864` SUCCESS (forced `railway up` — GitHub auto-deploy was stuck on `20260922-0220`)
- Verified CEST 2026-09-22 ~23:04: `openFeeDejaPayePour` + `recupererPrepayeCreateRouter` present on live `app.html`

## SS7K3P desk (Zero 1 after tip live — no desk smoke in this task)

Token `0xb200000000000000000000baa5356bfc210cc30a` · createPaid `0x1490c139…`  
Success: Give birth → Permit2 + mint/seed only — **no** second 0.001 to fee wallet. Pool prove via vieDuBlock / Brain.
