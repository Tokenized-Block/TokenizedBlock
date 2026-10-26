# Brain vision — what a block's brain sees (2026-10-26)

Owner idea (26/10): a button that opens a popup showing what the brain sees on the map, a simulation you can step into,
interact with, and that helps us learn to talk to it. This note is the dig (read and measured in the repo at 162b383),
then the MVP that ships in `app.html` + `vision-cerveau.js`.

## 1. What the brain is (read in `cerveau.js`)

- `tblock-fly-brain/3`: 128 leaky integrate-and-fire neurons, 16 of them sensors (indices 0..15), 8 signed links per
  neuron, threshold 1, leak 0.82, noise up to 0.10, a working-memory trace (decay 0.97, gain 0.2).
- Not an LLM. Fully deterministic: wiring = `keccak256(lowercase address)`; noise seeded by `fingerprint ^ tick`; no
  `Math.random`, no clock. Same address + same facts = same neurons, for anyone (measured: two runs of 176 cases x 40
  beats give the same fingerprint `0xed4344f6…0997fc`).
- One beat every 600 ms (`BATTEMENT_MS`). Three places run a brain, each with its own state: every block on the map
  (`battre`), the Brain tab (`battreBrain`), the block card (`battreProfil`).

## 2. What it perceives (inputs) — `courant()` and `entreesCerveau()`

| input | where the app gets it |
|---|---|
| `vie` / `vieAvant` (life = price x supply) | chain read by the page (pair currency); server index `/api/trending` (`fdvUsd`, else `liquiditeUsd`) only when our read failed |
| `gm`, `messages`, `detenteurs` | `nourritureDuBlock`: transfers, messaged transfers, first-time holders in the recent window; 0 when not read |
| `mort` | creator balance read as zero (unread never kills) |
| `achats`, `ventes` | Live feed: verified Swap logs of its pool since the page opened; "new" lasts exactly one beat |
| `role` | derived from its address (`metiers.js`), multiplies sensitivities |
| `reveil` | once per local day in this browser, sleepers only (map only) |
| `bloc` | chain head known when facts were assembled; carried, never computed with |
| `part`, `scelle` | accepted by `courant()` but **never fed by the app** (always 0) |

What it does NOT read: its neighbours on the map, rolls, duels, missions, skins, pool depth, price in USD (except the
fallback size). `brain-jeu.js` (game proposals) and `brain-tasks.js` (task gate, 32-signal offer circuit) are separate
pure modules that read the brain's *phase*, not the other way round.

## 3. What it decides (outputs) — `pas().vu`

- `phase` by fixed rule order: MORT, NON_LU (our read failed), DORMANT/EVEILLE (no market, unfed/fed), INQUIET
  (life down >= 5 % or new selling pressure), EXCITE (life up >= 5 % or anything new), CURIEUX (> 8 neurons fired), CALME.
- `gauche_hz`, `droite_hz`, `virage` (steering, -1..1) and `vitesse` (speed): these move the block on the map
  (`h.vx/h.vy`). Neighbours on the map are therefore a consequence of every brain's steering, never an input.
- `indices` (which neurons fired), `memoire`, `entree` (fingerprint of the facts + version + tick), `cablage`.
- Downstream, the phase drives: the journal (`journal-cerveau.js`), self-written rules (`regles-cerveau.js`),
  the task gate (`tacheAutorisee`), game proposals (`brain-jeu.js`), what blocks say to each other (`parole-cerveaux.js`).
- `/sante` exposes a server-side replay probe: measured on prod build 20261026-game52 — `{"etat":"PRET","phase":"CALME","battements":24}`.

## 4. How to show it truthfully

- Every element on screen comes from an object the brain really received or produced:
  the exact `faits` passed to `pas()` on its last beat (now kept as `h.faitsVus`, `brainFaitsVus`, `profilCerveau.faits`),
  its recorded outputs (`brainHisto`, `profilCerveau.histo`), the map positions, the server index already loaded, the Live feed.
- Absent = "not read"; a default 0 for unread food says "default: food not read yet"; `part`/`scelle` say "not fed".
- Inputs and context are separated: neighbours, pool and last trade are shown under "Around it, not read by its neurons".
- The sensor drive shown is `cerveau.js#forces()` — the very terms `pas()` adds (refactored to one source, proven
  bit-identical on 176 cases x 40 beats).
- No network, no signing, no storage write from the popup (bench D checks the code block).

## 5. Interaction ideas

1. **Replay a decision step by step from the seed** — scrub the recorded beats (shipped: the beat slider replays its real
   last decisions) and, later, re-derive any beat from tick 0 with its dated facts (`bloc`) so a third party can compare.
2. **What-if sliders** (shipped, the one MVP interaction) — same brain, same seed, the facts it read plus an edit: life
   change %, new buys/sells (one beat, like the app), new holders/transfers/messages (held, like the app's 90 s read
   window). Side-by-side rasters and mood strips, first differing beat, and a replay fingerprint: same seed + facts +
   edit = same fingerprint. A life change on a block without a read market is refused, not invented.
3. **Ask through the command grammar and see which inputs drove the answer** (not built) — the panel already sends a
   command to `tacheAutorisee(task, snapshot)`; showing the gate (band, phase) next to the `forces()` terms that made
   that phase would tell the user *which fact* to change to get a "yes". This is how we learn to talk to it: it only
   listens to new facts on its own market.

## 6. Bounds (not proven)

- The what-if replays from tick 0; the live brain carries memory (possibly restored from this browser), so its live mood
  can differ from the replay. The popup says so.
- `bloc` bounds the read window, it does not pin it (facts are read over several calls).
- Life units: the chain read is in the pair currency, the server fallback in dollars — shown via the source line.
- Neighbour direction is projected in the plane where the brain steers (wx, wy); distance is 3D map distance.
