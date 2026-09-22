# DIG — Instant Birth primary on Create (tip 20260922-2140)

**Stamp:** 2026-09-22 ~21:40 CEST · Zero 1 / Raksha HARD  
**Repo:** tokenizedblock-app · tip `20260922-2140`  
**Supersedes:** tip 2125 free-Create-then-Give-birth primary · open PR #18 Create-here(free) feed

## Product

| Was (2125 / PR18) | Now (2140) |
|---|---|
| Primary Create = free factory, then separate Give birth | **Primary Create = Instant Birth hooked V8 DIRECT** (create + open V8 + FRAIS_OUVERTURE 0.001 ETH → FEE_WALLET) |
| Created unhooked rows: Launch hooked V8 / Create here (free) | **Instant Birth on TB · 0.001 ETH · V8** → `#creer` · or Open profile — never birth on foreign unlabeled token |
| Profile create-here (free) | **Instant Birth on TB** (asleep local → vieAuto; else `#creer`) |
| — | Free create-only buried under **Advanced** (`#cCreerFree` + `creerSansVie`) |

## Invariants kept

- Birth = V8 only · hooks ≠ 0x0 on MAIN  
- Fees for Dev · never show sink address  
- tip 2026 Buy/Sell 0.5% untouched  
- Factory createB20 still value 0 under the hood; fee moment = Instant Birth / inscription

## Verify

- `/sante` build `20260922-2140`  
- Live HTML: no `Launch hooked V8`; primary Create promises paid Instant Birth  
- `node test-instant-birth-primary-2140.mjs` · `node test-naissance-label-gate.mjs`
