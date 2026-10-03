# New hook 0.07 % fee sink + 0.03 % creator, in the paired currency — DEPLOY PLAN (fork only, nothing sent)

Source: `src/TBlockLaunchLockHook.sol` (no owner, no setter: every value fixed at construction).
Config (`FeeLot2Test._cfgProd`): hookFee 700 pips · partCreateur 300 · partCollateral 0 · modeCollateral 1 ·
fraisVie 3e14 wei (inscrire, unchanged) · exigerB20 true · suivi24h false (no cradle) · devises = Devises7030 (V9 19 + 18 new
Coinbase stocks = 37, + ETH). **Rev. 2026-10-02 16:37** — the 18 with a real pool proven on fork (0ea4661): AMDc ASTSc
CAKEc DJTc DUOLc LLYc MRNAc MRVLc NFLXc NVAXc ORCLc PTONc PYPLc QUBTc RBLXc RDDTc TTWOc WENc.

**Rev. 2026-10-03 (founder: « la plus large »)** — devises = 62 + ETH: the 37 above + the 25 other stocks the issuer
(api.coinbase.com/v1/tokenized-stocks, 58 tokens) declares, each read on Base mainnet the same day (code 0xef, issuer
symbol, 8 decimals): AMCc AEOc BMNRc BIRDc BYNDc CIFRc CLSKc CRCLc CRWVc GMEc HTZc HUTc KSSc LCIDc MARAc OPENc PFEc PMc
RIOTc SOUNc USDEc VVVc WULFc WWc XYZc. 5 minted (GMEc HTZc PFEc PMc SOUNc), 20 with supply 0 (admitted now: the list can
never change). Measured the same day: the live V8 admits 13 quotes besides ETH — the 12 of the app registry AND CRCLc.

| field | value (rev. 2026-10-03) |
|---|---|
| to | 0x4e59b44847b379578588920cA78FbF26c0B4956C (CREATE2 deployer, permissionless) |
| value | 0 |
| data | `plan/deploy-calldata.hex` (salt ++ initcode, 29 389 bytes, sha256 of the hex file c0d80af9…2819861e) |
| salt | 0x…252567 (mined: address low 14 bits == FLAGS_V9 = 0x24cc) |
| resulting hook | 0xd68BA83a2B8Bd633607a6637e1D3aed9f47524cC (no code on Base on 2026-10-03; supersedes 0x907e…24cc) |
| initcode hash | 0x0d5a613a897a1533ab657deab97761c349f85a26956a6986ed3f91deb3189afc |
| independent check | CREATE2 address and initcode hash recomputed in JS from the calldata file: identical; 62/62 list addresses and the fee sink a6cf present in the initcode |
| gas | eth_estimateGas on Base mainnet (read-only, 2026-10-03): 8 071 712 (inner CREATE2 on fork 7 915 173) |
| signer | any team deployer EOA with a little ETH — never the fee sink |

Fork proof (rev. 2026-10-03, base-anvil local fork ~52.15M): `base-forge test --match-contract FeeLot2Test -vv` → 15/16 PASS:
L4 the 25 admitted, the 5 minted with the full split to the wei in the stock (sink never holds the block); L4 negative
control (V8 refuses 24, admits CRCLc); L2/L3 unchanged. The 1 FAIL, test_L2_porteCreateur ("PoolManager holds too little
to fund the test"), fails IDENTICALLY on the unmodified 37 code at the same fork block: fork state, not the list.

## Why a fixed list (no "any genuine Coinbase stock" check)
Every on-chain attribute of a B20 is chosen by whoever calls the permissionless B20Factory: name, symbol, decimals,
variant, contractURI, extraMetadata, policy IDs (any existing ID can be referenced) and roles — `initialAdmin` can be any
address, and initCalls bypass role gates. `test_L3_fauxNFLXc_refuse` builds such a forgery on fork. The only binding to
the deployer is the address tail = keccak256(deployer, salt)[0:9] = 72 bits: a "prove the salt" check is forgeable by a
~2^36 birthday search (minutes on a GPU). Without an owner/setter, no robust check exists, so future stocks need a new
list (= a new hook), or a founder decision to accept an owner/timelocked append-only registry.
