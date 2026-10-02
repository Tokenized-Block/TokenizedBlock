# Hook 7030 — app wiring (B1), behind `HOOK_7030_ACTIF = false`

Hook `0x643DbB5e24D17a1d1D1909fa9F8C6267936124cC` (contract OK'd by Zero 1 at a7fc46c). **Not deployed. Flag OFF in this branch.**
Switching it on = one line in `tokenomics.js` (`HOOK_7030_ACTIF = true`), only AFTER the deploy in `PLAN-DEPLOY-HOOK-7030.md`
and a fork re-run of `app-wiring-proof/`.

## What the flag turns on
1. `HOOKS_PAIENT_DEJA_A6CF` (tokenomics.js): V8 both ways (as before) + 7030 both ways. `hookPaieDejaA6cf` reads it.
2. "Already pays" on every leg, any quote (echange.js `hookPaieEnDeviseVendable`): router fee 0 on 7030 ETH and non-ETH
   pools (PLTRc = exactly 10 bps, all from the hook). Multi-hop still skips the router fee only if EVERY hop pays.
   `deviseFraisHook` for 7030 = the admitted quote side (never the block), whatever the sort order.
3. `estNotreHook` / `estHookDeNaissance` know 7030 → the 7 pairs (TOSHI, OUSD, AVGOc, BEc, HIMSc, MUc, PLTRc) are no
   longer refused as "not a TokenizedBlock market"; `OPTIONS_LANCEMENT.h7030` opens them at Create; `hookCourant`
   picks 7030 (code read on chain) for ETH + its 19 quotes; `CLES_MARCHE` reads the 7030 ETH pool first; launch guard
   refuses a quote 7030 does not admit.
4. Birth = `inscrireAvecCaution(key, sqrtPrice, minimum)` (0xfde76f6a), never plain `inscrire`:
   - ETH quote: value = birth fee (if unpaid) + minimum. ERC-20 quote: `approve(hook, minimum)` first, value = birth fee.
   - **App floor for the creator caution: `CAUTION_CREATEUR_USD = 1` → minimum = ceil($1 / price × 10^decimals) raw
     units of the paired currency, at least 1** (paires.js `minimumCautionCreateur`; price = `/api/prix-usd`, ETH =
     ETH price). The hook has no floor of its own; $1 keeps an empty caution from collecting the 0.03 % and blocks no one.
     Price/decimals unreadable → NON_MESURE, nothing asked.
   - Already escrowed by this creator at this price → no second escrow; by another admin → refused.
   - Copy "swap fee 0.1% per trade (app 0.07% · creator 0.03%)" only when the flag is ON.

## Proof (fork, own anvil, Base @ 52,079,875 — no deploy, no tx)
`app-wiring-proof/proof.mjs` (app modules, flag flipped in a temp copy): hook deployed from the exact plan calldata,
blocks via CreateRouter.createPaid, birth via `planLancement` → `completerInscriptionPayee` (caution), buy via
`vieDuBlock` → `planEchange`.
- ETH birth: steps approve, Permit2, `inscrireAvecCaution` (value 0.001 ETH + 362,953,746,626,345 wei = $1 @ Chainlink
  $2,755.17); caution = minimumCaution = that amount; creator = admin.
- 0.001 ETH buy (market discovered, no key passed): router 0, fee wallet +700,000,000,000 wei, creator due
  +300,000,000,000 wei = 10 bps.
- PLTRc birth (8 dec, price fixture $180 → floor 555,556 raw): approve(hook) + `inscrireAvecCaution`, caution 555,556.
- 0.1 PLTRc buy: router 0, fee wallet +7,000 raw PLTRc, creator due +3,000 = 10 bps.
`neg.mjs` (same state): flag OFF tree and base 87a49cb → ETH buy routerBps 50 (60 bps stacked), PLTRc refused
"not a TokenizedBlock market", 7030 ETH pool not discovered, hookCourant = V8.
`bytes.mjs`: flag OFF vs base 87a49cb, same fork/clock: Create ETH, Create USDC, market key, Buy, Sell → identical bytes.
