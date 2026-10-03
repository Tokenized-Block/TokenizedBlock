# Hook 7030 (0.07 % to the fee wallet + 0.03 % to the creator, in the paired currency): DEPLOY PLAN (fork only, nothing sent)

**Rev. 2026-10-03 (founder: « la plus large ») — 62 currencies = the 41 below + the 21 other stocks the Coinbase issuer
declares (api.coinbase.com/v1/tokenized-stocks, 58 tokens on 2026-10-03; each of the 21 read on Base mainnet that day:
code 0xef, issuer symbol, 8 decimals; SOUNc minted 843 units, the 20 others supply 0 — admitted now, the list never
changes). Built on Zero 1's a040db5 tree (GAS_LABEL 3M, idempotent caution cap, bounded creator share, label marker).
SUPERSEDES 0xDe294c…64Cc (41, a040db5) and 0xd68B…24cC (the 62 variant on e7a9c17, never to sign).**

| field (rev. 2026-10-03, 62) | value |
|---|---|
| to | 0x4e59b44847b379578588920cA78FbF26c0B4956C (CREATE2 deployer, permissionless) |
| value | 0 |
| data | `plan/deploy-calldata.hex` (salt ++ initcode, 31 161 bytes; sha256 of the hex file 0973f87408a139d2…be7709c5d) |
| salt | 0x00000000000000000000000000000000000000000000000000000000024b1b7 (mined: address low 14 bits == 0x24cc) |
| hook | 0x32F3f572Dd17625bAb9035789C953E1d001864cc (eth_getCode = 0x on Base, 2026-10-03 ~20:20 CEST, address free) |
| initcode hash | 0xe4e4224bf48a960ea4acb6a790ebd98322472db7e8f9df4c04a6b617964f13e4 |
| independent check | CREATE2 address and initcode hash recomputed in JS from the calldata file (keccak.js, not forge): identical; the 62 list addresses and the fee wallet a6cf found in the initcode |
| gas | eth_estimateGas on Base mainnet (read-only, mainnet.base.org, 2026-10-03): 7 923 881; fork 52 024 517: inner CREATE2 7 377 551 |
| runtime | 22 117 bytes |
| floors | `node script/planchers-caution.mjs check --block 52090382` → ALL 63 MATCH (ETH + 62); the 41 of Zero 1 unchanged; the 21 = REFERENCE (no pool declared, `pool: null` in `planchers-sources.json`), Yahoo + Nasdaq read 2026-10-03, both agree to the cent for all 21 |
| fork proof | base-anvil (Base build) at 52 024 517: FeeLot2Test 14/15 — new L4: the 62 admitted and every floor stored as listed, SOUNc split to the wei in the stock (the only one of the 21 the PoolManager can fund), V8 negative control refuses 20 and ADMITS CRCLc (measured on mainnet: V8 admits 13 quotes besides ETH, the app registry's 12 + CRCLc); GardesConstructeur 14/14. The 1 FAIL, test_L2_porteCreateur, is `InsufficientBalance(PM, 0x33829025, 1e9)` = fork state at this older block (passes on Grok's fork pinned at 52 090 382) |
| signer | any team deployer EOA; never the fee wallet |
| not done | `script/recompute-7030.sh` still requires "41 distinct currencies" — to update to 62 before use; the app descriptor (`hook-7030-descripteur.js`, Grok 1bd240e) still names 0xDe294c… (41) and must be regenerated for this address and these 62 floors |

---

**Rev. 2026-10-02 23:20 CEST: 41 currencies, GMEc IN (Phil GO 23:02). Built on a54ced1. SUPERSEDES 0xB8Cf…A4CC (a54ced1),
0x3678…64cc (the 40 variant, dropped), 0x7e97…24CC, 0x907e…24cc and 0x0Db7…A4CC. Do not sign an older descriptor.**

Source: `src/TBlockLaunchLockHook.sol`, no owner and no setter: every value is fixed at construction.
Config (`LLBase._cfgProd`): hookFee 700 pips · partCreateur 300 · partCollateral 0 · modeCollateral 1 · fraisVie 3e14 wei ·
delaiRetrait 7 days · exigerB20 true · marker `%22face%22%3A%7B` · createRouter 0xe05CD0336cD18A0909BCA980a4191A0B00a3FdF5 ·
fraisCreation 7e14 wei · devises = `Devises7030` (41 + ETH: the V9 19, the 18 Coinbase stocks of 0ea4661, then GMEc, HTZc,
PFEc, PMc, the a54ced1 order) · per-currency caution floor = `Devises7030.planchers()` / `PLANCHER_ETH` (~$1, sized at block
52090382 by `script/planchers-caution.mjs`, table in `PLANCHERS-CAUTION.md`; GMEc = 4 162 864 raw, POOL, v4 GMEc/USDC
0x723e3c6b…a11df5 at $24.0219, refs = regular close $24.70).

| field | value |
|---|---|
| to | 0x4e59b44847b379578588920cA78FbF26c0B4956C (CREATE2 deployer, permissionless) |
| value | 0 |
| data | `plan/deploy-calldata.hex` (salt ++ initcode, 29 817 bytes; sha256 of the hex file 9626b33ee4bbdeef…2903e42b) |
| salt | 0x000000000000000000000000000000000000000000000000000000000024e735 (mined: address low 14 bits == 0x24cc: beforeInitialize, afterAddLiquidity, before/afterSwap, both return-deltas) |
| hook | 0xDe294c10a1ab203a345767cd9072F820e4F864Cc (eth_getCode = 0x on Base at block 52093316, address free) |
| initcode hash | 0xbdc2fe8e30d0db471715562cac87394e0fe40546dd91eea03473b42445f9cd50 |
| gas | eth_estimateGas on Base mainnet (read-only, block 52093316, 2026-10-02 23:19 CEST, from 0x…dEaD and 0x…7a179107, tenderly + mainnet.base.org): 6 950 468. Fork 52090382 (anvil --base): estimate 6 940 408, used 6 839 567 |
| runtime | 22 117 bytes |
| signer | any team deployer EOA; never the fee wallet |

Recompute: `script/recompute-7030.sh` (rebuilds the calldata on the pinned fork, re-derives salt / hash / address / bits with
cast, decodes the constructor config and requires 41 distinct currencies incl. GMEc, checks the fee wallet against the live
V8 `feeWallet()`, the CreateRouter and its FEE_WALLET, and the list + floors against `plan/planchers-caution.json`;
`node script/planchers-caution.mjs check --block 52090382` must say ALL 42 MATCH = ETH + 41).

## Label read (D3)
The B20 interface has no hash/length/prefix getter for contractURI, so the label check reads the whole URI. GAS_LABEL is
3 000 000 (163b627). Real Base node (eth_estimateGas of `porteLeLabel` with this runtime set by state override, read-only):
live faces of 6 966 B -> 594k, 13 494 B -> 1.04M, 14 152 B -> 1.09M, all `true`; the same runtime with the old 300k cap
returns `false` for all three. Forge fork, cold (vm.cool): 620 B 44 788 · 8 000 B 528 478 · 19 135 B 1 260 322 ·
40 000 B 2 631 478. Every fork bench that reads a URI cools the block first (`LLBase._froidTous`). A failed or starved read
returns false -> SansLabel (fail closed); `test_M4_lectureAffamee6364_revertSansLabel_jamaisAcceptee` proves it under the
63/64 rule (14 000 B cold, cost 980k: 100k..925k -> exactly SansLabel, 950k..1 050k -> outer out of gas, >= 1 075k registers).

## Provenance (forged B20 pays the Create fee)
`inscrire(key, sp, sel)` / `inscrireAvecCaution(key, sp, min, sel)`: the block address must equal the B20 address
CreateRouter.createPaid derives from `sel` (0xb2 ++ 10 zero bytes ++ keccak256(abi.encode(createRouter, sel))[0:9]); then only
fraisVie is due. The unsalted overloads charge fraisVie + fraisCreation (0.0007 ETH, = CREATE_FEE). Residual: the binding is a
72-bit address tail, so a ~2^36 birthday search (GPU-minutes) could fake a proof and save 0.0007 ETH per block.

## Why a fixed list (no "any genuine Coinbase stock" check)
Every on-chain attribute of a B20 is chosen by whoever calls the permissionless B20Factory: name, symbol, decimals,
variant, contractURI, policy IDs and roles. `test_L3_fauxNFLXc_refuse` and `test_FO_fauxNFLXc_B20_refuse` build such a
forgery on fork. Without an owner/setter no robust check exists, so a new stock needs a new list (= a new hook).
The block side is a shape check (`porteLeLabel`): any B20 admin can engrave the marker; such a pool still pays the life
fee (plus the Create fee without a router proof), a caution at or above the floor, and 0.07 % of every swap to the fee wallet.
