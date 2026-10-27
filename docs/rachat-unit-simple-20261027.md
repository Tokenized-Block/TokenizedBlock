# UNIT buyback + reward distribution — the simple version (owner GO, 2026-10-27)

Decision (Phil, 27/10: "garde tes conseils GO"): no swap contract. The automatic on-chain buyback (`RachatUnit.sol`, branch
`claude/rachat-unit-20261027`, worktree `D:\tmp\wt-rachat-unit`) is **shelved**, not deployed.

## Why not the automatic buyback
- The UNIT/ETH pool is thin (below the 500 USDC listing bar; UNIT is not on the Map). An automatic buy pays heavy slippage and is
  easy to sandwich around its schedule.
- A B20 does not execute outside the Base node: `forge` gives `OpcodeNotFound`, an anvil fork a silent success with 0 logs
  (memory `b20-reads-only-on-base-node`). Its fork bench was 2/6 green, 4 red, and cannot be proven locally either way.
  Unit bench 12/12 green (mocks only).

## The simple flow
1. The reserve share of fees accrues **in USDC** in the reward pool wallet (`0x31e0…de3b`, as today).
2. **Once a week, the owner's wallet buys UNIT** with the app's normal Buy, at a size the pool can take (the Buy card shows the
   quote and the loss before signing). The app prepares; the owner signs. Nothing automatic.
3. **Distribution in UNIT = a second `TicketPot`, unchanged code, deployed with `usdc = UNIT`**
   (`0xb2000000000000000000007afa7ed748b0874f27`):
   - `TicketPot.sol` never reads `decimals` (0 references) — pots and claims are raw units, `amount = floor(potAtClose / nTickets)`;
     the constructor only needs code at the token address (a B20 has `0xef`).
   - Its bench: `forge test --match-path test/TicketPot.t.sol` → 37/37 green (mock token).
   - Same guarantees as the USDC pot: no owner withdrawal ever, frozen pot before any attestation, one claim per wallet per day,
     7-day grace then rollover, 48 h public notice for any verifier/guardian change.

## Not done / to do after the owner deploys
- Deploy the UNIT TicketPot: **owner's signature only** (constructor `(UNIT, verifier, guardian)`).
- Server: read the second pot's address, sign attestations from ITS `potAtClose`, show amounts with **18 decimals** (UNIT) —
  the USDC pot code assumes 6 in its display. Not written yet.
- First real claim on mainnet is the only end-to-end proof (B20 cannot be simulated off the Base node): a tiny pot first.
