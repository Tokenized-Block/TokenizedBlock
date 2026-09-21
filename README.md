# Tokenized Block

Build a block — name, symbol, decimals, supply, description, colour — and it becomes a **B-20
native token on Base**, with a permanent Uniswap v4 market.

Live: **https://tokenizedblock.space**

The block is created **with no administrator and no minter**: no account holds `DEFAULT_ADMIN_ROLE`
or `MINT_ROLE`, at any point, including at creation. Its supply is minted in the creation
transaction itself and equals the supply cap, so no further unit can ever exist. Nobody — the
creator included — can mint more, or change its name, logo or description.

## What this page does, and what it does not

- It **presents** transactions. Your wallet shows them and signs them.
- It **holds no key**, sends nothing on your behalf, and has no backend that can move funds.
- Every state it shows is **re-read from the chain** — never inferred from a transaction having
  been broadcast. A green result means a receipt with status `0x1` was read back.

## What it costs

| moment | cost | where it goes |
|---|---|---|
| **Create** | **free** — `createB20` on the B-20 factory, `value` = 0 | nowhere; only network gas |
| **Launch** (open the market) | **0.0003 ETH** life fee, paid inside `inscrire` | the fee wallet |
| **each swap** | **0.5 %** of the swap, taken by the hook | the fee wallet, in full |

Creation has no service fee. An earlier version of this file claimed a `0.001 ETH` create fee; the
code says otherwise — `utiliseCreateRouter()` returns `false`, so Create goes straight to the
factory at value zero. That claim was wrong, and it is retracted here rather than quietly deleted.

Fee wallet, and the only one: `0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4`.
Read it yourself — `feeWallet()` on the hook returns it.

## The hook

Current hook: `0x5926abdAbf5D0006Ee960A8270f3e124e5a764cc` (Base mainnet).

| read on chain | value |
|---|---|
| `HOOK_FEE()` | `5000` / 1e6 = **0.5 %** |
| `feeWallet()` | `0xa6cF…f5d4` |
| fee split | **100 % to the fee wallet** — the creator's share was removed |

A hook is part of the Uniswap v4 `PoolKey`. A market that is already open therefore **keeps the
hook it was opened with, forever** — no migration exists, and none is claimed here.

### What a block can be priced in

The hook's `deviseAdmise` mapping is written **only in the constructor**, and the contract has no
setter — so the list is fixed at deployment, for that hook, permanently. Measured on the live hook
on 2026-09-21:

**17 currencies** — native ETH, TBLOCK, USDC, cbBTC, and 13 tokenized Coinbase stocks
(AAPLc, AMZNc, COINc, CRCLc, GOOGLc, INTCc, METAc, MSFTc, MSTRc, NVDAc, SNDKc, SPCXc, TSLAc).

Run it yourself: `node devises-admises.mjs`. It reads the mapping address by address, and also asks
a witness address that has no reason to be admitted — if the witness came back admitted, the script
says the table is unreliable instead of printing it.

⛔ Being *priceable* in a currency is not the same as being *traded* in it. This repository measures
the first. The second is below, and it is much thinner.

## Measured on Base mainnet

14 days ending 2026-09-21, 1818 log windows read, **zero windows missed** — so these are counts,
not floors:

| what | measured |
|---|---|
| fee collections | **41** (2.93 / day) |
| ETH reaching the fee wallet | **0.002798464 ETH** (the wallet's share of the fee) |
| paid by addresses that are not ours | **32.8 %**, from **5** distinct addresses |
| which hooks collected | V1: 39 · V2: 2 |

And the part that is not flattering, published next to the rest:

- **Two thirds of that ETH came from our own wallets trading our own blocks.** Only 32.8 % is
  outside money.
- Hooks V6, V7 and V8 were deployed, verified on chain, and had **zero markets** on them. The cause
  was not demand: the app's fast Create path had the hook written as a constant (`HOOK_V5`), while
  only the step-by-step path read the chain. Fixed on 2026-09-21;
  `test-un-seul-choix-de-hook.mjs` now refuses a second copy of that decision.
- Total revenue to date is **well under one cent per day**. Nothing here is a business yet.

## Verified on Base Sepolia (kept — it is what proves the encoders)

| what | evidence |
|---|---|
| the creation calldata is canonical | byte-for-byte identical to what `forge` produces via `B20FactoryLib` |
| a B-20 can hold liquidity in a Uniswap v4 pool | positions `27264` / `27265` |
| that pool quotes, both ways | measured curve, 0.3001 % → 83.34 % |
| that pool is tradeable | tx `0x2f952a47…d00ff` — the quote was exact **to the unit** |

## Fork it

```bash
git clone https://github.com/Tokenized-Block/tokenized-block.github.io.git
cd tokenized-block.github.io
python -m http.server 8000
```

Static files, no build step, no dependencies. Then open `http://localhost:8000/app.html`.

⚠️ A wallet's built-in browser on Android refuses plain HTTP (`ERR_CLEARTEXT_NOT_PERMITTED`). Use
the hosted HTTPS page for mobile wallets, or a desktop browser with a wallet extension.

**If you fork this and open markets, the fee wallet above is what the deployed hooks pay.** It is
immutable inside those contracts — changing the constant in this repository changes nothing on
chain. To send fees somewhere else you would have to deploy your own hook, mine its address for the
permission bits, and pair your blocks with it.

## Running the instruments

Every claim above has a script behind it, and each script states the bound of what it can prove.

```bash
node devises-admises.mjs
node ou-vit-le-volume.mjs 14
node reference-frais.mjs
```

- `devises-admises.mjs` — what a deployed hook accepts as a pair currency.
- `ou-vit-le-volume.mjs` — where B-20 swap volume actually goes: hooked pools, or free ones.
- `reference-frais.mjs` — fees now, against a reference frozen *before* the V6 hook existed, so a
  change can be attributed instead of assumed. It returns `PAS_DE_CAUSE` and publishes nothing when
  the hook being compared has produced no collection at all.

The test suite is 34 files; all were green on 2026-09-21.

```bash
for f in test-*.mjs; do node "$f"; done
```

## Files

`app.html` the app · `encodeur.js` B-20 creation calldata · `lancer-pool.js` the launch plan ·
`pool.js` Uniswap v4 liquidity and swap · `tokenomics.js` hooks, supply, and the single function
that chooses a hook · `lecteur.js` reads a block's on-chain metadata · `keccak.js` Keccak-256.

Every encoder is compared byte-for-byte against `forge` output in the development repository; the
references are read from simulation artifacts, never transcribed by hand.

## Method

No undated figures. No ARR, MRR or projection appears anywhere in this repository. A number that was
not measured is not written down, and a measurement that went against us is printed next to one that
did not.
