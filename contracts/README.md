# OfferCircuit (Foundry) — not broadcast

32 recorded uint8 signals → integer `0` refuse / `1` dinner served.  
Full 128 LIF brain stays **offchain** (`cerveau.js`). This is **not** an LLM.

- **FEE_WALLET:** `0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4` (app smart wallet · tip 2220; CreateRouter/hook live still 0x37eb until redeploy)
- **Circuit:** `tblock-offer-circuit/1` ↔ `brain-tasks.js`
- **Align:** `decide()` mirrors `decideOffre` (THRESHOLD=5, toy weights)

```bash
forge build
forge test -vv
# Fork later (O4) — eth_call only, never --broadcast:
# forge test --match-contract OfferCircuitFork --fork-url https://mainnet.base.org -vv
```

See `/workspace/DIG-OFFERCIRCUIT-O123-2026-09-15.md`.
