# Fork it, deploy it, and read where the money goes

This repository is meant to be forked and redeployed. This page says exactly what happens to the
fees when you do — including the part we cannot control.

## The short version

| you do this | the fees go |
|---|---|
| fork this app, deploy it, open markets **on the hooks it ships with** | to `0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4`, always |
| deploy **your own hook** and point your blocks at it | to whatever wallet you put in *your* constructor |

There is no third case, and no configuration file that changes the first one.

## Why the first row cannot be changed from this repository

The hook contract declares:

```solidity
address public immutable feeWallet;
```

`immutable` means it is written once, in the constructor, at deployment. The contract has **no
setter**, **no owner**, and **no admin role of its own**. The deployed hooks on Base mainnet already
have our wallet burned into them.

So editing `FEE_WALLET` in `frais-creation.js` changes what this app *displays*. It changes nothing
about where the chain sends the money, because the app does not route the fee — the hook does.

Check it yourself, without trusting this file:

```bash
node test-frais-vont-au-wallet.mjs
```

It reads `feeWallet()` on the four deployed hooks over JSON-RPC, and separately checks the Solidity
source for a setter, an `Ownable`, or an owner variable. If the chain is unreachable it says so
instead of passing quietly.

## Proving the money actually moves

A contract that *can* pay is not a contract that *does* pay. This script simulates a full launch on
real Base mainnet state, with a **fabricated stranger address** as the creator — not ours:

```bash
node preuve-frais-arrivent.mjs
```

It traces every ETH transfer inside the simulation and reports the path hop by hop:

```
inconnu → hook : 1000000000000000 wei = 0.001000000 ETH
hook → a6cf    : 1000000000000000 wei = 0.001000000 ETH
rien ne reste au hook : ✅ oui
```

⛔ It refuses to report success on a green status alone. An call can return `status 0x1` and move
nothing; that is exactly the failure this script exists to catch.

⛔ **Its bound, stated in the file:** it is a simulation. It proves the contracts move the money as
described. It does not prove that a stranger will come and do it.

## If you want the fees to go to you instead

That is a fair thing to want, and the honest answer is: deploy your own hook.

1. `tblock-hook/src/TBlockFeeHookV8.sol` — set your wallet in the constructor arguments.
2. Mine an address whose **last 14 bits** match the permission flags your hook declares. Uniswap v4
   reads a hook's permissions from its address, so the address is not free; `HookMiner` in the forge
   scripts does this.
3. Deploy through the CREATE2 deployer, then point your app's `HOOK_V8` at your address.

Your blocks will then be yours end to end. They will not be Tokenized Block blocks, they will not
appear on our map, and our hooks will refuse to open markets for them — `_estDevise` and the label
lock are read from the hook, not from the app.

## What a fork inherits, and what it does not

**Inherits:** the B-20 factory (adminless tokens, supply minted at creation, no minter ever), the
Uniswap v4 launch plan, the permanent-liquidity rule, the 17 currencies a deployed hook admits, and
every measurement script in this repository with its stated bounds.

**Does not inherit:** our markets, our domain, and the possibility of redirecting our hooks' fees.

## Running it

Static files. No build step, no dependencies, no backend.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/app.html`.

The measurement scripts need Node 18+ and read-only JSON-RPC access to Base mainnet. None of them
signs, sends, or spends anything — that is checked, not promised: every one of them says so in its
own header, and none imports a signer.

```bash
for f in test-*.mjs; do node "$f"; done
```
