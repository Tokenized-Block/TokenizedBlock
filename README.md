<h1 align="center">Tokenized Block</h1>

<p align="center">
  Build a block — name, symbol, colour, supply — and it becomes a <b>B-20 native token on Base</b>
  with a permanent Uniswap&nbsp;v4 market.
</p>

<p align="center">
  <a href="https://tokenizedblock.space"><b>tokenizedblock.space</b></a> ·
  <a href="DEPLOY.md">Fork &amp; deploy</a> ·
  <a href="#run-the-instruments">Reproduce every number</a>
</p>

---

## What a block is

- **No administrator, no minter.** No account holds `DEFAULT_ADMIN_ROLE` or `MINT_ROLE` — at any
  point, creation included.
- **Supply is final at birth.** It is minted inside the creation transaction and equals the cap, so
  no further unit can ever exist. Not for the creator, not for us.
- **The market is permanent.** Liquidity is deposited to the dead address. Nobody can withdraw it,
  and therefore nobody can collect LP fees — which is why the LP fee is set to `0`.

This page holds no key, has no backend that can move funds, and presents transactions for *your*
wallet to sign. Every state it shows is re-read from the chain: a green result means a receipt with
status `0x1` was read back, never that a transaction was merely broadcast.

## What it costs

| moment | cost | where it goes |
|---|---|---|
| create a block **and** open its market | **0.001 ETH**, once, in one signature | the fee wallet, in full |
| every swap afterwards | **0.5 %** of the swap | the fee wallet, in full |

Fee wallet, and the only one: `0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4` — `feeWallet()` on the
hook returns it.

<details>
<summary><b>Why 0.001 ETH, and why it changed on 2026-09-21</b></summary>

<br>

Opening a market used to cost `0.0003 ETH` — not by choice. That was a floor inherited from an
older contract, and a `$1` target in ETH falls below it at current prices, so the floor applied to
every launch, silently. Nobody had picked that price.

`prix-du-lancement.mjs` then read the 103 markets opened in one day by the busiest hook on Base:
**43 distinct creators, median sent 0.001001 ETH**. We were asking three times less than the
market, from the only side that actually pays. The new price is that median, rounded down.

⛔ This is not a revenue forecast. It aligns our price with the market's; it brings in no creator by
itself. The effect will be measured — creations before and after — and published either way.

</details>

## Where the fees go if you fork this

The hook declares `address public immutable feeWallet`. Written once, in the constructor. **No
setter, no owner, no admin role of its own.**

| you do this | the fees go |
|---|---|
| fork the app, open markets **on the hooks it ships with** | to our wallet, always |
| deploy **your own hook** | to whatever wallet *you* put in its constructor |

Editing `FEE_WALLET` in this repository changes what the app *displays*. It changes nothing on
chain, because the app does not route the fee — the hook does.

```bash
node test-frais-vont-au-wallet.mjs   # reads feeWallet() on 4 deployed hooks + checks the source
node preuve-frais-arrivent.mjs       # simulates a stranger opening a market, traces every transfer
```

The second one reports the path hop by hop rather than trusting a green status:

```
inconnu → hook : 1000000000000000 wei = 0.001000000 ETH
hook → a6cf    : 1000000000000000 wei = 0.001000000 ETH
rien ne reste au hook : ✅ oui
```

**[DEPLOY.md](DEPLOY.md)** explains how to make the fees go to *you* instead. We would rather write
that down than have you discover it.

## What the chain says

Read on 2026-09-21. Every figure below is reproducible with the scripts in this repository.

**The hook, read on chain**

| call | value |
|---|---|
| `HOOK_FEE()` | `5000` / 1e6 = **0.5 %** |
| `feeWallet()` | `0xa6cF…f5d4` |
| fee split | 100 % to the fee wallet |
| currencies a block can be priced in | **17** — ETH, TBLOCK, USDC, cbBTC + 13 tokenized stocks |

The currency list lives in a `deviseAdmise` mapping written only in the constructor. It cannot be
extended after deployment — a constraint on us, and exactly what makes it trustworthy.

**Fees collected — 14 days, 1818 log windows, zero missed**

| | |
|---|---|
| fee collections | **41** (2.93 / day) |
| ETH reaching the fee wallet | **0.002798464 ETH** |
| paid by addresses that are not ours | **32.8 %**, from 5 distinct addresses |

**Where B-20 volume actually lives — 1 day, 100 % of blocks read**

| | pools | swaps | distinct addresses | swaps per address |
|---|---|---|---|---|
| pools with **no** hook | 20 | 282 | 19 | 4.3 |
| pools **with** a hook | 242 | 25 395 | 35 | **725.6** |

A hook does not repel traders — hooked pools get far more swaps. But 725 swaps per address is
automation, not demand. **Across the whole of Base, in one day, 54 distinct addresses touched a
newly-born B-20 pool at all.**

**For scale — same day, same method**

| token | distinct addresses | transfers |
|---|---|---|
| USDC | **329 365** | 3 610 687 |
| cbBTC | 10 816 | 583 892 |
| NVDAc | 2 158 | 35 403 |
| TBLOCK *(ours)* | **0** | **0** |

## What is not true yet

Published here because a page that only lists its wins is marketing, not evidence.

- **Two thirds** of the ETH collected came from our own wallets trading our own blocks.
- Total revenue to date is **well under one cent per day**. This is not a business yet.
- **TBLOCK, our own token, had zero transfers in 24 hours.**
- There is **no bridge to a bank account**. Selling a block returns USDC to a wallet, not to an IBAN.
- There is **no tokenized yuan or rouble on Base**. We looked; what exists has a supply of zero.
- Hooks V6, V7 and V8 sat at **zero markets** for days. Not from lack of demand — the app's fast
  Create path had the hook written as a constant. Fixed 2026-09-21, and a test now refuses a second
  copy of that decision.

## Corrections

Every claim this file got wrong, kept next to what replaced it.

| what was said | what is true |
|---|---|
| "Nothing above has been done on Base mainnet" | 41 fee collections were measured over 14 days |
| "Real Create charges a 0.001 ETH service fee" | `utiliseCreateRouter()` returns `false`; Create went to the factory at value zero |
| "Create is free" | true of one call, false for anyone reading it — opening a market cost 0.0003 ETH |
| "B-20 tokens do get traded, at scale" | 43 263 swaps looked like a crowd; the address column said 35 addresses |
| "`main` holds the retired GitHub Pages stub" | Pages reports `status: built` and is still serving |

## Run the instruments

Each script states, in its own header, the bound of what it can prove — and several refuse to give a
verdict rather than publish a biased one.

```bash
node devises-admises.mjs          # what a deployed hook accepts as a pair currency
node ou-vit-le-volume.mjs 1       # hooked pools vs free pools, by swaps AND by addresses
node bridge-devises-liquidite.mjs # how much each admitted currency actually moves
node prix-du-lancement.mjs        # what creators pay to open a market elsewhere on Base
node reference-frais.mjs          # fees now, against a reference frozen before the V6 hook existed
```

```bash
for f in test-*.mjs; do node "$f"; done   # 37 files, all green on 2026-09-21
```

Two of these instruments were rebuilt after being caught measuring badly:

- `ou-vit-le-volume.mjs` first read **19 windows out of 303** and would have published a ratio built
  on 6 % of the period — and the windows that failed were the busiest ones, so the bias ran toward
  the conclusion. It now splits a window in half on failure and **refuses any verdict** if a single
  block stayed unread.
- `test-texte-a-l-ecran.mjs` first scanned one page while the defect it was written for sat on four.

## Fork it

Static files. No build step, no dependencies, no backend.

```bash
git clone https://github.com/Tokenized-Block/tokenizedblock-app.git
cd tokenizedblock-app
python -m http.server 8000
```

Then open `http://localhost:8000/app.html`.

⚠️ A wallet's in-app browser on Android refuses plain HTTP (`ERR_CLEARTEXT_NOT_PERMITTED`). Use the
hosted HTTPS page on mobile, or a desktop browser with a wallet extension.

## Method

No undated figures. No ARR, MRR or projection appears anywhere in this repository. A number that was
not measured is not written down, and a measurement that went against us is printed next to one that
did not.
