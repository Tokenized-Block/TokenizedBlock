# Brain senses: what the brain takes in, holds and puts out that we did not show (2026-10-26)

Owner request (26/10): "capture other inputs, outputs and internals of the brain that were not seen at first, to bring
more complexity to what it feels, sees and can do". Measured first, in `cerveau.js` (`tblock-fly-brain/3`, called v1 here),
at c1e8b08. The live brain's wiring and behaviour are NOT changed by this commit: the v1 fingerprint
`0xed4344f6...0997fc` (176 cases x 40 beats) is unchanged (`test-sens-cerveau-20261026.mjs` section A).

## (a) Inputs the engine accepts that never reach a neuron

| input | what the code does with it | fed by the app? |
|---|---|---|
| `part` | clamped to 0..1 in `courant()`, then written into the input fingerprint `vu.entree`. **No formula reads it**: not `forces()`, not `pas()`. | no |
| `scelle` | turned into 0/1 in `courant()`, then written into `vu.entree`. **No formula reads it.** | no |

Measured: 88 cases x 30 beats with `part: 1, scelle: true` give the same potentials, traces, fired neurons and outputs
as without them. Only `vu.entree` changes (bench B). So feeding them in v1 would add nothing to what the brain feels. It
would only add a fact to the record. The earlier note said they were "always 0". That was wrong: they are not passed at all.

What they mean is not written in `cerveau.js`. `scelle` looks like "mint closed" (`faits.js#mintFerme`, supply = cap, read
on the block card). `part` is not documented anywhere. **Decision: not fed.** The screen now says "not fed, and no neuron
reads it (input fingerprint only)". Bench E fails if the app starts passing them without this screen changing.

## (b) Internal state that was never shown in the vision dialog

All of it is now shown read-only, through `vision-cerveau.js#interne(etat)`. Each value is copied from the live state
(`Object.is` on all 128 neurons, bench C):

- **Membrane potential** of each neuron (`etat.potentiels`, clamped to ±4) and its ratio to the threshold. Inside view: a
  halo whose strength is potential / threshold (0..1). A red dotted ring marks a neuron held below zero (inhibited).
  The halo is shown only for the latest beat. Older beats do not keep their state, so nothing is drawn for them (bench D).
- **Own trace** (`etat.memoire`, working memory: a moving average of the neuron's own spikes) and the amount it will
  re-feed on the next beat (trace x 0.2, always below threshold).
- **Spikes on the beat before** (`etat.dernierSpikes`): computed by `pas()` on every beat and never shown before.
- **Wing membership**: which neurons count for the left or right wing (`(i + aileG) % 3`), with counts. The bench replays
  `gauche_hz` and `droite_hz` from this rule, using constants written separately in the bench.
- **Rules**: threshold 1, leak 0.82, link gain 0.5, clamp ±4, trace decay 0.97, re-feed 0.2, noise up to 0.10.
  `pas()` used to hard-code these constants. They now live in `cerveau.js#INTERNES`, which `pas()` reads; the
  fingerprint is unchanged. `INTERNES` is kept out of `PARAMETRES`, so what Create stores at creation does not change.
- **What does not exist is said too**: there is no refractory period (a neuron that fires resets to 0 and can fire again
  on the next beat), and all 16 sensors get the same current (only their noise differs). There is no separate sensor
  for each fact.
- **Previous life**: the number of beats lived, with memory restored in this browser (`etat.tick`).

The Brain tab sphere already showed one clicked neuron's potential, trace and links (`dessinerReseauDit`). The dialog now
shows the whole network: how many neurons are near firing, how many are inhibited, the lowest, mean and highest potential,
and the strongest trace.

## (c) Outputs computed but not seen in the dialog

`gauche_hz` and `droite_hz`, `memoire` (mean trace) and `nourriture` (the food term) were rendered in the Brain tab but not
in the vision dialog. They now appear under "Inside its neurons". `delta` and `nourriture` are now also kept in
`champ().sortie`. No v1 output stays unused: `phase`, `virage` and `vitesse` drive the map, the journal, the rules and the
task gate.

## (d) Proposal: new senses and actions (NOT built, NOT wired)

A new sense changes what the brain does, so it needs a **new brain version** (`tblock-fly-brain/4`), selected explicitly
and stored at creation. v1 blocks keep replaying with v1. Conditions before any of this ships:

1. `cerveau-v4.js` (or `pas(etat, faits, { version })`). v1 is selected by default and its fingerprint is checked
   byte-identical (this bench, section A). v4 gets its own golden fingerprint, measured twice.
2. **Separate sensors**: today all 16 sensors get one sum, so a new fact would only add to that sum. v4 should give each
   fact its own sensor group (for example 0-3 market, 4-7 food, 8-11 game, 12-15 social). Then "which fact fired it"
   can be read from the wiring.
3. Each new fact needs a read-state (`LUE` / `NON_LUE`), a source, a block height, and a clamp. Unread is never zero.

Candidate senses, all from data the app already reads:

| sense | source already in the app | meaning, clamped |
|---|---|---|
| rolls | BlockRolls events / game state (`tblock_game_state`) | new rolls on this block since the last read, /5 |
| duels | `duels-etat.js` | a duel opened, won or lost, as a signed one-beat event |
| slot spins | BlockSlots v4 events | spins that named this block, /5 |
| skin worn | `blockskins-actif.js` | 0/1, plus a one-beat event on change |
| pool depth | `/api/trending` `liquiditeUsd` or on-chain liquidity | log scale like `taille` |
| holders change | holders count read twice | signed relative change, like `delta` |
| neighbours' moods | map `habitants[].phase` (only when JUDGED) | share of near neighbours EXCITE minus INQUIET; NON_LU ignored |
| mint closed (`scelle`) | `faits.js#mintFerme` | 0/1, three states |

Neighbours' moods carry a risk: every brain would read every other brain, and the map would loop back on itself. Replay
then needs the neighbours' recorded phases as input facts, dated by block height.

Candidate new outputs ("what it can do"), none of which signs anything:
- **Gaze**: the index of the sensor group that fired most, shown as "it is looking at its market / its food / the game".
- **Call**: a signal sent to the nearest neighbour when spikes pass a threshold. It is shown on the map only, and is a
  v4 output.
- **Preference**: the wing difference, accumulated over the day, as a slow "taste", stored like the memory trace.

## Not proven

- That the halo is easy to read at 375 px in sunlight. Measured: it renders (65 halos, 38 inhibited rings, matching
  `interne()`), with no horizontal overflow at 375 px or 1280 px. Its legibility was not judged by a person.
- The halo appears only when the beat shown is the latest one. When the dialog opens, it replays the last 24 beats first.
- `part` and `scelle` meanings: guessed from names, not documented. Neither is fed.
- Nothing in (d) is built. There is no v4 module, no v4 fingerprint, and no v4 replay bench.
