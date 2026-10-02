# New hook 0.07 % fee sink + 0.03 % creator, in the paired currency — DEPLOY PLAN (fork only, nothing sent)

Source: `src/TBlockLaunchLockHook.sol` (no owner, no setter: every value fixed at construction).
Config (`FeeLot2Test._cfgProd`): hookFee 700 pips · partCreateur 300 · partCollateral 0 · modeCollateral 1 ·
fraisVie 3e14 wei (inscrire, unchanged) · exigerB20 true · suivi24h false (no cradle) · devises = V9Devises (19 + ETH).

| field | value |
|---|---|
| to | 0x4e59b44847b379578588920cA78FbF26c0B4956C (CREATE2 deployer, permissionless) |
| value | 0 |
| data | `plan/deploy-calldata.hex` (salt ++ initcode, 28 013 bytes, sha256 of the hex file 23d75515…3ff7) |
| salt | 0x…24b4d1 (mined: address low bits == FLAGS_V9) |
| resulting hook | 0x643DbB5e24D17a1d1D1909fa9F8C6267936124cC (no code on Base today) |
| gas | eth_estimateGas on Base mainnet: 6 087 312 |
| cost | ~0.0000365 ETH L2 (at 0.006 gwei) + ~0.0000006 ETH L1 data fee |
| signer | any team deployer EOA with ~0.0001 ETH — never the fee sink |

Fork proof: `BASE_RPC=… FORK_BLOCK=52077000 ./fork-test.sh --match-contract FeeLot2Test --match-test test_L2_ -vv` → 4/4 PASS.
