# OfferCircuit (Foundry) — not broadcast

32 recorded uint8 signals → integer `0` refuse / `1` dinner served.  
Full 128 LIF brain stays **offchain** (`cerveau.js`). This is **not** an LLM.

- **FEE_WALLET:** `0x37Eb9b7ce0b51Fe12fBf092026e001918128580A`
- **Circuit:** `tblock-offer-circuit/1` ↔ `brain-tasks.js`
- **Align:** `decide()` mirrors `decideOffre` (THRESHOLD=5, toy weights)

```bash
forge build
forge test -vv
# Fork later (O4) — eth_call only, never --broadcast:
# forge test --match-contract OfferCircuitFork --fork-url https://mainnet.base.org -vv
```

See `/workspace/DIG-OFFERCIRCUIT-O123-2026-09-15.md`.
