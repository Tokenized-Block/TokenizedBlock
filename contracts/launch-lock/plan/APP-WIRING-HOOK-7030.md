# Hook 7030 — app wiring (B1), behind `HOOK_7030_ACTIF = false`

Hook `0x907e5976E614e13c4e4CCA68535c93f2281124cc` (rev. 2026-10-02 16:37: contract OK'd by Zero 1 at a7fc46c, quote list
re-fixed to V9 19 + the 18 new Coinbase stocks of 0ea4661 — `feat/hook-7030-37-devises-20261002` @ e7a9c17; supersedes
0x643D…24cC). **Not deployed. Flag OFF in this branch.** Switching it on = one line in `tokenomics.js`
(`HOOK_7030_ACTIF = true`), only AFTER the deploy in `PLAN-DEPLOY-HOOK-7030.md` and a fork re-run of `app-wiring-proof/`.

Base: live `feat/auto-salt-create` @ b027000 + 0ea4661 (18 stocks offered at Create). The dropped 24 h cradle commits
(2d49b00, c104d6c, d64a11e — hidden #cBerceau/#cSaisie/#pSaisie, berceau-24h.js, +2 lines in serveur-web.js, cradle contracts/tests) are NOT in this branch.

## What the flag turns on
1. `HOOKS_PAIENT_DEJA_A6CF` (tokenomics.js, live array form): + `{ hook: HOOK_7030, sens: both }` only when ON.
2. "Already pays" on every leg, any quote (echange.js `hookPaieEnDeviseVendable`): router fee 0 on 7030 ETH and stock
   pools. Multi-hop still skips the router fee only if EVERY hop pays. `deviseFraisHook` for 7030 = the admitted quote
   side (never the block), whatever the sort order.
3. `estNotreHook` / `estHookDeNaissance` know 7030; `OPTIONS_LANCEMENT.h7030` opens Create for ETH + the 37 of
   `DEVISES_ADMISES_7030` (paires.js = V9 19 + 18: AMDc ASTSc CAKEc DJTc DUOLc LLYc MRNAc MRVLc NFLXc NVAXc ORCLc PTONc
   PYPLc QUBTc RBLXc RDDTc TTWOc WENc; GMEc HTZc PFEc PMc neither offered nor admitted); `hookCourant` picks 7030 (code
   read on chain); `CLES_MARCHE` reads the 7030 ETH pool first; launch guard refuses a quote 7030 does not admit.
4. Birth = `inscrireAvecCaution(key, sqrtPrice, minimum)` (0xfde76f6a), never plain `inscrire`:
   - ETH quote: value = birth fee (if unpaid) + minimum. Stock quote: `approve(hook, minimum)` first, value = birth fee.
   - **App floor for the creator caution: `CAUTION_CREATEUR_USD = 1` → minimum = ceil($1 / price × 10^decimals) raw
     units of the paired currency, at least 1** (paires.js `minimumCautionCreateur`; price = `/api/prix-usd`, ETH =
     ETH price). Price/decimals unreadable → NON_MESURE, nothing asked.
   - Copy "swap fee 0.1% per trade (app 0.07% · creator 0.03%)" only when the flag is ON.

## Proof (fork, own anvil `--base`, Base @ 52,081,326 — no deploy, no tx)
`app-wiring-proof/proof18.mjs` (app modules, flag flipped in a temp copy): hook deployed from the exact plan calldata
(e7a9c17), blocks via CreateRouter.createPaid, birth via `planLancement` → `completerInscriptionPayee` (caution), trades
via `vieDuBlock` → `planEchange`.
- 0.001 ETH buy (market discovered): router 0, fee wallet +700,000,000,000 wei, creator due +300,000,000,000 wei.
- **NFLXc** birth (8 dec, price fixture $100 → floor 1,000,000 raw): approve(hook) + `inscrireAvecCaution`, caution 1e6.
  - buy 0.1 NFLXc (q = 10,000,000): router 0, fee wallet +7,000 NFLXc-raw (7 bps), creator +3,000 (3 bps), block 0.
  - sell half the blocks (q = 4,995,913): router 0, fee wallet +3,497 = floor(q·700/1e6), creator +1,498 =
    floor(q·300/1e6), fee wallet holds 0 block.
`neg18.mjs` (same state): flag OFF tree and live b027000 → ETH buy routerBps 50 (60 bps stacked), NFLXc pool refused
"not a TokenizedBlock market", hookCourant = V8. `bytes18.mjs`: flag OFF vs live b027000, same fork/clock: Create ETH,
Create USDC, market key, Buy, Sell → identical bytes.
