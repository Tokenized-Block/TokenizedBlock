# TokenizedBlock: on-chain usage, measured 2026-10-27

Every number below was read from Base mainnet public data. There are no cookies, no analytics and no server logs.
Measured through block **53,154,527**, at **2026-10-27 10:53:21 UTC**. The JSON-RPC endpoint was https://base-rpc.publicnode.com.
Raw results are in `mesures/usage-onchain-20261027.json`: one row per counted transaction, plus every unread range.
The rules live in `usage-onchain.js`. The script is `mesures/mesurer-usage-onchain-20261027.mjs`, and
`mesures/reprendre-usage-onchain-20261027.mjs` re-read the ranges left unread.
The live counter `GET /api/usage` uses the same rules.

## The five numbers

| | including team wallets | excluding team wallets |
|---|---:|---:|
| Users onboarded, all time (distinct senders) | **10** | **7** |
| DAU (distinct senders, 24 h to the end time above) | **0** | **0** |
| WAU (distinct senders, 7 days to the end time above) | **2** | **0** |
| Volume processed, all time (USD) | **$567.31** | **$543.67** |
| Volume, last 30 days (USD) | **$24.24** | **$1.59** |
| Transactions counted | 126 | 54 |

Read these numbers plainly:

- **No external user has made a transaction in the last 7 days.** The most recent external transaction was on 2026-10-11.
  The two senders in this week's WAU are team wallets testing the games and trades.
- **One external sender accounts for $393.50 of the $543.67** (24 transactions, 2026-09-18 to 09-29). Those transactions
  call an unverified contract that swaps through several pools in one transaction, including round trips in ETH.
  That is the structure of arbitrage or routing. The data does not show who is behind it or why, so the address is
  counted as a user, exactly as the rule says.
- Of the external volume, $536.52 comes from swaps on pools that use our hooks. The rest is births ($2.03) and one
  app-routed stock trade ($0.76). The external volume in the game contracts is $0.

## Definitions

**Our surface.** A transaction counts when one of the following is true.

- One of our contracts emitted a log in it. The contracts are BlockSlots, BlockDuels v1 and v2, BlockRolls, TicketPot,
  BlockSkins v1 and v2, BlockMissions with its deployer and rail, the CreateRouter and the two older routers, and our
  9 hooks (V1 to V8 and the 7030 launch-lock hook).
- The Uniswap v4 PoolManager emitted `Initialize` (a birth) or `Swap` for a pool whose `PoolKey.hooks` is one of our hooks.
  12 such pools were found.
- A token on the whitelist paid the fee wallet inside a transaction that contains a swap. This is how app-routed stock
  trades are attributed. The whitelist is the 62 currencies of the 7030 hook plus WETH.

Every address was copied from the repo's records: `*-deploiement.js`, `tokenomics.js`, `hook-7030-descripteur.js` and
`frais-creation.js`. The emitter's address is the filter, so a log that names us but comes from someone else's contract
never counts.

**User.** A user is the sender of the transaction, `tx.from`, read from `eth_getTransactionByHash` for each transaction.
For an ERC-4337 bundle, the user is the `sender` of the `UserOperationEvent` emitted by a known EntryPoint (`payeurDe`,
`revenu-externe.js`), because `tx.from` would be the bundler. A user is never an address read from one of our log fields.
Each transaction is counted once, and each sender is counted once.

**DAU / WAU.** Distinct senders with a counted transaction in the time window that ends at the end time above. The window
is open at its start and closed at its end: (end − 24 h, end] for DAU and (end − 7 d, end] for WAU. Times are UTC.
Block times come from the 2 s cadence. They were checked against three real block timestamps 1, 7 and 30 days back,
and all three matched exactly.

**Volume.** For each transaction, volume is the largest of its priced legs, never their sum, so one trade is not counted
twice. The legs are:

- the ETH sent with the transaction;
- the stables transferred into our contracts;
- the stable or ETH leg of a `Swap` on one of our pools;
- for app-routed trades, the stables the sender paid or received.

Stables are priced at face value (USDC, OUSD). ETH is priced at the median of 4 Uniswap v4 ETH/USDC pools (`prix-eth.js`),
read on chain at the last block of each UTC day. The fallback rule, fee × 1000, was never needed: 0 transactions.

**Team wallets (excluded in the second column).** Only the wallets the repo names as ours are excluded:

- the fee wallet, a smart wallet: 4 transactions;
- the legacy operator and owner wallet: 16 transactions;
- the community reserve, which also signed the game deployments and serves as the test wallet. It is already treated as
  internal by `serveur-web.js internesRevenu`. 52 transactions.

Any other wallet we use that the repo does not name is counted as external.

## What is NOT counted or could not be read

- **Blocks 50,861,088 to 51,001,087 are unread** (140,000 blocks, 2026-09-04 08:45 to 2026-09-07 14:32 UTC). The public node
  refuses them ("Archive requests require a personal token"). They are reported as unread, not counted as empty.
  Two other windows (52,311,088–52,361,087 and 52,511,088–52,561,087) first returned "internal filter error". They were
  re-read and contained nothing. A pool that our hook initialized inside the unread range would be missing from the pool
  list. Swaps on such a pool are still counted if our hook emitted a log in them (category `hook`), but only their ETH
  and stable legs are priced.
- **Not priced, so counted as $0:**
  - 15 transactions have a leg that could not be priced. 3 of them are external.
  - Stock-token and block-token legs: 7 trades took their fee in NVDAc, 2 in GOOGLc, and 1 each in AAPLc, TSLAc, SNDKc
    and one other token. Two swap legs were in a block token.
  - ETH on 2026-09-15 and 2026-09-16: the price pools did not answer at that depth, which affects 2 transactions.
  - AUDF, which is an AUD stable and is not converted.
- **Excluded by the rules:**
  - 3 ERC-4337 bundles with several user operations. The sender is ambiguous, so it is never guessed.
  - 10 transfers to the fee wallet without a swap in the same transaction (gifts or direct payments, which are not trades).
- **Not measured at all:**
  - Failed transactions (they emit no logs).
  - Calls to our contracts that emit no event.
  - Liquidity added to our pools after their birth (`ModifyLiquidity`).
  - Fees paid to the fee wallet in native ETH outside our contracts (native ETH leaves no log).
  - Trades the app routed to pools that are not ours and that paid no whitelisted fee token.

## Live counter

`GET /api/usage` starts from this measure and catches up in the background, at most one step every 10 minutes. Each step
reads up to 10 windows of 2,000 blocks. It returns counts only, never an address or a hash.
If a transaction in a window cannot be read, that window is not marked as done; it is retried on the next step.
New rows are priced at the ETH price read at scan time. The bench `test-usage-onchain-20261027.mjs` covers the counting
rules: sender from `tx.from` and not from log fields, 4337 sender, foreign emitters, dedup, window bounds, exclusions,
largest leg instead of a sum, unread ranges, and an engine that never skips a window. It kills 6 of 6 mutants.
