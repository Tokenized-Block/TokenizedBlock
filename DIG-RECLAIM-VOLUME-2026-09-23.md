# DIG — tip `20260923-reclaim-volume` (2026-09-23)

**Stamp:** 2026-09-23 ~11:05 CEST (Europe/Brussels) · Zero 1 · Bankr rails  
**Prior live:** `/sante` `20260923-feed-catch-router`  
**Ship tip:** `20260923-reclaim-volume`  
**Grok Super input:** `/workspace/GROK-SUPER-RECLAIM-FEE-FUNNEL-2026-09-23.md` (P0-1/2/3 taken)

## What shipped

### P0 (from GS)
1. **OpenLaunch Feed reclaim** — sous copy says TB earns $0 on unhooked OL; each OL row gets **Instant Birth on TB · 0.001 ETH** beside `open on OpenLaunch ↗`; `#sfOl` click → `#creer` CreateRouter path (same as Created IB).
2. **Buy/Sell panel 0.5%** — `#peFrais` unhidden (was `display:none`); Prepare buttons = **Prepare buy · 0.5%** / **Prepare sell · 0.5%**. Aligns Map/Trending sold 0.5% with the panel that signs. Phil `Fee:` list lines stay off.
3. **Profile Give birth flash** — MAIN first paint = Instant Birth on TB; swaps to Give birth · V8 **only** after `eligibleNaissanceV8.ok`. Outside LUE same: IB first, hook-launch only if label OK.

### Reclaim + volume (focus lock)
4. **Created default = TB·paid only** (Bankr-honest). Foreign residual under chip **another launchpad** (`CREATION_FOREIGN`) with stronger primary IB bouton + « opens hooked market / Buy ».
5. **Trending Buy fee-honest** — `Buy · 0.5%` only when `poolDecouvertPour` says fee-capturable (TB hook / NOTRE / SANS_HOOK) **and** liq ≥ $500; else **Trade on TB · 0.001 ETH** → Create. `etape('achat')` on Buy tap; IB path instruments `create_clic`.

## Residual still on-chain
Public factory + other launchpads still mint unpaid/foreign B20s. App cannot close factory without V9 `beforeInitialize` (Phil deploy). Reclaim = convert foreign **visibility** into paid Instant Birth / in-app trade — not an on-chain tax on foreign creates.

## What reclaim means for residual
| Residual class | On-chain | App after tip |
|----------------|----------|---------------|
| factoryDirect / foreign create | Still free at mint | Hidden from default Created; listed under **another launchpad** with IB CTA |
| OpenLaunch Dex-only | Unhooked volume = $0 to sink | IB reclaim beside OL link |
| Thin external Trending | No TB fee path | No fake Buy · 0.5% — Trade on TB instead |
| Hooked / LUE fee-ok | In-app 0.5% → FEE_WALLET | Buy · 0.5% shown + panel badge honest |

## Do not
- Smoke Instant Birth to pad sink
- Wallet-intent mega rewrite
- BridgeRouter Phil deploy
- Show sink address / Fees for Dev / ≈$1

## Files
- `app.html` (tip string + P0 + reclaim + Trending gate)
- `test-reclaim-volume-0923.mjs`

## Deploy
Clone tip-of-main → PR → merge → `railway up` from clean clone. Confirm `/sante` build `20260923-reclaim-volume`.
