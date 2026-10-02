# New hook 0.07 % fee sink + 0.03 % creator, in the paired currency — DEPLOY PLAN (fork only, nothing sent)

Source: `src/TBlockLaunchLockHook.sol` (no owner, no setter: every value fixed at construction).
Config (`FeeLot2Test._cfgProd`): hookFee 700 pips · partCreateur 300 · partCollateral 0 · modeCollateral 1 ·
fraisVie 3e14 wei (inscrire, unchanged) · exigerB20 true · suivi24h false (no cradle) · devises = Devises7030 (V9 19 + 18 new
Coinbase stocks = 37, + ETH). **Rev. 2026-10-02 16:37** — the 18 with a real pool proven on fork (0ea4661): AMDc ASTSc
CAKEc DJTc DUOLc LLYc MRNAc MRVLc NFLXc NVAXc ORCLc PTONc PYPLc QUBTc RBLXc RDDTc TTWOc WENc. Left out: GMEc HTZc PFEc PMc.

| field | value |
|---|---|
| to | 0x4e59b44847b379578588920cA78FbF26c0B4956C (CREATE2 deployer, permissionless) |
| value | 0 |
| data | `plan/deploy-calldata.hex` (salt ++ initcode, 28 589 bytes, sha256 of the hex file 29122c1d…f8c9) |
| salt | 0x…253955 (mined: address low 14 bits == FLAGS_V9 = 0x24cc: beforeInitialize, afterAddLiquidity, before/afterSwap, both return-deltas) |
| resulting hook | 0x907e5976E614e13c4e4CCA68535c93f2281124cc (no code on Base today; supersedes 0x643D…24cC) |
| initcode hash | 0x8515237938afdf8f10147faa65feac2f2a4436283cd5e8757a309ace7bd583b6 |
| gas | eth_estimateGas on Base mainnet (read-only, 2026-10-02 ~16:50): 6 917 997 (inner CREATE2 6 839 064) |
| cost | ~0.0000415 ETH L2 (at 0.006 gwei) + L1 data fee (~28.6 kB) |
| signer | any team deployer EOA with ~0.0001 ETH — never the fee sink |

Fork proof: `forge test --fork-url <anvil --base forked at 52081326> --match-contract FeeLot2Test -vv` → 14/14 PASS
(L2 7 pairs, L3 the 18: split to the wei in the stock, sink never holds the block; V8 refuses the 18; forged NFLXc refused).

## Why a fixed list (no "any genuine Coinbase stock" check)
Every on-chain attribute of a B20 is chosen by whoever calls the permissionless B20Factory: name, symbol, decimals,
variant, contractURI, extraMetadata, policy IDs (any existing ID can be referenced) and roles — `initialAdmin` can be any
address, and initCalls bypass role gates. `test_L3_fauxNFLXc_refuse` builds such a forgery on fork. The only binding to
the deployer is the address tail = keccak256(deployer, salt)[0:9] = 72 bits: a "prove the salt" check is forgeable by a
~2^36 birthday search (minutes on a GPU). Without an owner/setter, no robust check exists, so future stocks need a new
list (= a new hook), or a founder decision to accept an owner/timelocked append-only registry.
