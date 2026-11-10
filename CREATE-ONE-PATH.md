# Create — one path (spec, 2026-11-10)

Why: the live test by Grok on mainnet (block TEST `0xb200…3F35`) stopped three times on the way, each time for a reason that
lived in the page, not on chain:

1. Rabby showed "wtCOIN received" on the first buy signature, no word from the app said why → the signer refused.
2. A stop in the middle said "nothing was sent" while 2 of 4 signatures had gone through; pressing Create again would have
   bought again on top of the bought wtCOIN.
3. Coming back to the block page (`?block=`), the market opening could not be resumed: the launch card opened only from Create
   or from the browser's local "asleep" list, and the Create salt lived only in the creating browser's storage.

Count in `app.html` today: the launch card has 12 entry points (`ouvrirLancement`, `calculerLancement`), its state is spread over
`localStorage` (prepaid, salt, asleep list) and module variables (`lancementLien`, `vieAuto`, `miroirVieDansCreate`, `tipAuto`).

## The rule

**One function decides the next step, from the chain only.** `etatNaissance({ wallet, block?, name?, symbol? })` reads:

| read on chain | means |
|---|---|
| wallet TBLOCK + wtCOIN balance | step 1 needed? resume from wtCOIN? |
| block code at the predicted / given address | created? |
| block balance of the wallet, allowance to Permit2, Permit2 allowance to the Position Manager (+ expiry) | approvals done? |
| hook `createurs(poolId)` | registered (fee + deposit paid)? |
| pool `slot0` / liquidity | market open? |
| vault received the TBLOCK part from this wallet for this block (Transfer log, `tx.from` checked) | step 3 done? |

It returns ONE next step with its calls, simulated whole (`eth_simulateV1`) before the wallet opens. Local storage may speed
it up (a salt already known), never decide it. Every entry point — Create button, block page, "My blocks", the server plan for
agents — calls this function; nothing else builds birth calls.

## The screen (Grok's v5, Create card)

- A single card "Pay for a birth, $5 in all, TBLOCK first" with the 3 steps, each step's state read from the chain:
  done / next / waiting.
- One button, always the same: **Continue** — it does the next step. Before the wallet opens: "Signature N of M — what it does,
  to which contract", and "checked by the app just now: passes".
- A stop never says "nothing was sent" if something was: it counts the confirmed hashes and says where the money sits.
- Node busy: "Base nodes are busy — retrying in Ns", never a dead end (the server relay `/api/rpc` is the last resort).
- The same card shows on the block page for a block not alive yet (its owner sees Continue).

## Steps, signatures, contracts (without a batching wallet)

| step | signatures | to |
|---|---|---|
| 1 buy TBLOCK (only if short) | 4: ETH→wtCOIN (Aerodrome router), approve wtCOIN→Permit2, Permit2 allow, wtCOIN→TBLOCK (Universal Router); resume from wtCOIN = 3 | `0x9ee3…d418`, wtCOIN `0x5cda…2204`, Permit2 `0x0000…8BA3`, `0x6ff5…9b43` |
| 2 birth | up to 5: createPaid 0.0007 ETH (CreateRouter `0xe05C…FdF5`), approve block→Permit2, Permit2 allow, register on hook 0.0003 ETH + deposit ~$1 (`0x32F3…64cc`), open market 0 ETH (Position Manager `0x7C5f…9bDc`) | |
| 3 pay the block in TBLOCK | 1: transfer to the community vault `0x025D…f331` | |

A batching wallet (Base app, Coinbase smart wallet) signs each step once.

## Order of work

1. `etatNaissance` + its fork bench (each state reached on a fork: fresh wallet, after step 1, after create, after
   registration, after opening, after the vault payment; and the TEST block's exact state).
2. Wire every entry point to it; remove dead paths (`creerEtVivreUneSignature` is unreachable on mainnet by its own comment,
   the free-create branch is retired). Full series, mutants on copies.
3. Grok's v5 Create card on top (skin only), its ids unchanged.
4. Live test by Grok's wallet, end to end, hashes read on chain.
