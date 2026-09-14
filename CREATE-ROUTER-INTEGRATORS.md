# CreateRouter — integrator pack (Base mainnet)

**Audience:** other apps that create TB / B20 tokens and must pay the life fee.  
**Stamp:** 2026-09-14 night CEST · **Do not deploy hook.**

## Call this, not the factory

| | |
|--|--|
| **CreateRouter** | `0x34862fF4e76330E55853A371fc245f55f60BfF0a` |
| **FEE_WALLET** | `0x37eb9b7ce0b51fe12fbf092026e001918128580a` |
| **Floor** | `0.0003 ETH` (`300000000000000` wei) on-chain |
| **App target** | ≈ **$1 ETH** (oracle); always `msg.value >= floor` |
| **Selector** | `createPaid(uint8,bytes32,bytes,bytes[],address)` → **`0x1d03fb54`** |

Raw factory `0xb20f…` `createB20` and external UIs that skip the router stay **free** — fee is not enforceable at the genesis precompile.

## ABI

```solidity
function createPaid(
    uint8 variant,
    bytes32 salt,
    bytes calldata params,
    bytes[] calldata initCalls,
    address creator
) external payable returns (address token);
```

- **`tx.to`** = CreateRouter (above), **not** factory.
- **`msg.value`** ≥ `0.0003 ETH` (recommend ≈$1 ETH). Entire value is forwarded to **FEE_WALLET** only **after** create succeeds; revert refunds the user.
- **`creator`** = end-user address that receives the sealed **1B** mint (100%). **No 50M / 5% mint to fee.**
- **`initCalls`**: URI / non-mint bootstrap only. Router **strips** caller `updateSupplyCap` + `batchMint` and **force-appends** sealed cap + 100% mint to `creator`.

## Minimal checklist

1. Encode `createPaid(variant, salt, params, initCalls, creator)` — selector `0x1d03fb54`.
2. Send payable tx to `0x34862fF4e76330E55853A371fc245f55f60BfF0a` with `value >= 0.0003 ether` (≈$1 preferred).
3. Confirm `FEE_WALLET()` on the router equals `0x37eb9b7ce0b51fe12fbf092026e001918128580a`.
4. Predict token address with **deployer = router** (CREATE2 salt binds to router, not the EOA).
5. Do **not** rely on factory-direct creates for paid path honesty.

## Reference

- App constants: `frais-creation.js` (`CREATE_ROUTER`, `FEE_WALLET`, `CREATE_FEE_WEI_FLOOR`)
- Calldata: `encodeur.js` → `encodeCreatePaid`
- Dig: `/workspace/DIG-FEE-SINKS-0x37eb-2026-09-14.md`
