# New hook 0.07 % fee sink + 0.03 % creator, in the paired currency — DEPLOY PLAN (fork only, nothing sent)

**Rev. 2026-10-02 22:41 — SUPERSEDES 0x907e…24cc AND 0x0Db7…A4CC. Do not sign an older descriptor.**

Source: `src/TBlockLaunchLockHook.sol` (no owner, no setter: every value fixed at construction).
Config (`FeeLot2Test._cfgProd`): hookFee 700 pips · partCreateur 300 · partCollateral 0 · modeCollateral 1 ·
fraisVie 3e14 wei (inscrire, unchanged) · exigerB20 true · suivi24h false (no cradle) · devises = Devises7030
(V9 19 + 22 Coinbase stocks = 41, + ETH): AMDc ASTSc CAKEc DJTc DUOLc LLYc MRNAc MRVLc NFLXc NVAXc ORCLc PTONc PYPLc
QUBTc RBLXc RDDTc TTWOc WENc + GMEc HTZc PFEc PMc (founder decision 2026-10-02; addresses copied from
api.coinbase.com/v1/tokenized-stocks, read on Base: code 0xef, 8 decimals, supply > 0).

Changes since the previous descriptor:
- **GAS_LABEL 300 000 → 3 000 000** — at 300 000 every real Create reverted `SansLabel()`: contractURI() costs
  ~65.6 gas/byte cold; the app engraves faces up to 19 135 bytes (1 260 322 gas measured on a cold fork).
- 4 stocks added (above).

| field | value |
|---|---|
| to | 0x4e59b44847b379578588920cA78FbF26c0B4956C (CREATE2 deployer, permissionless) |
| value | 0 |
| data | `plan/deploy-calldata.hex` (salt ++ initcode, 28 896 bytes, sha256 of the hex file a7e9533a…6821) |
| salt | 0x000000000000000000000000000000000000000000000000000000000024ba22 (mined: address low 14 bits == 0x24cc) |
| resulting hook | 0xB8Cf7fB000C8415523A9ab8Dc80bCade061DA4CC |
| initcode hash | 0x1ae8c6986ea36c4e189fb508e879f0239b7442e11ee427a937e42f4d87c9e3c4 |
| runtime | 22 968 bytes |
| gas | inner CREATE2 on fork: 6 623 552 — ⚠️ a fresh eth_estimateGas on mainnet has NOT been run for this descriptor |
| signer | any team deployer EOA with ~0.0001 ETH — never the fee sink |

Fork proof (2026-10-02, Base mainnet fork, base-forge): full suite 89/89 PASS (88 + test_OFF_equals_V9_toTheWei
re-run after widening its orientation search 6 → 24 salts — a rig flake, not the hook), including
UriReelle 7/7 (URI 620 / 8 000 / 19 135 / 40 000 bytes read COLD, inscription at 19 135) and FeeLot2 L3 on the 22.
Mutation GAS_LABEL = 300 000 → [FAIL: SansLabel()] on the inscription.

## Why a fixed list (no "any genuine Coinbase stock" check)
Every on-chain attribute of a B20 is chosen by whoever calls the permissionless B20Factory: name, symbol, decimals,
variant, contractURI, extraMetadata, policy IDs (any existing ID can be referenced) and roles — `initialAdmin` can be any
address, and initCalls bypass role gates. `test_L3_fauxNFLXc_refuse` builds such a forgery on fork. The only binding to
the deployer is the address tail = keccak256(deployer, salt)[0:9] = 72 bits: a "prove the salt" check is forgeable by a
~2^36 birthday search (minutes on a GPU). Without an owner/setter, no robust check exists, so future stocks need a new
list (= a new hook), or a founder decision to accept an owner/timelocked append-only registry.
