# Capture, razing and elimination

**Status:** draft (Phase 3) · **Confidence:** medium; building losses and plunder are low

Code: `enterUndefended`, `captureCity`, `destroyCity`, `raidCity`, `checkElimination` in
`packages/engine/src/war.ts`.

## Rule

**Undefended tiles.** A land unit at war moving onto (or winning the last battle for) a
tile where nothing can defend moves in and:

- **captures** workers, settlers and artillery when it has the `capture` action (armies
  always do): workers and artillery change sides; each settler becomes **two** workers
  (`slaveUnit`). Source: owner's ruling 2026-10-11;
- **destroys** everything else there (leaders, ships in port, aircraft).

**Cities.**

- The captor plunders the city's share of its owner's treasury:
  `gold × city size ÷ owner's total population`.
- A city taken with **raze**, or a size 1 city whose food box is less than half full
  (below "size 1.5"), is destroyed; its great wonders are lost for ever. A size 1 city with
  at least half a food box survives at size 1 with its food gone. Source: owner's ruling
  2026-10-11. A captured city may also be razed with **Raze city** on the turn it was taken
  (the game asks).
- Otherwise the city changes hands one citizen smaller (never below size 1), with an empty build, food and
  shield box; the palace and small wonders are lost, each improvement survives with a 50 %
  chance, great wonders are kept.
- A civilization that loses its capital gets a palace in its largest remaining city at no
  cost. A civilization without a capital makes its first conquest the capital.

**Barbarians** do not hold or destroy cities: entering an undefended city they take up to
10 gold per citizen, kill a citizen (a size 1 city keeps its last one) and leave with the
loot. Source: owner's ruling 2026-10-11 ([barbarians.md](barbarians.md)).

**Elimination.** A civilization with no cities and no unit able to found one is destroyed;
its remaining units are removed.

## Open questions

- Civ3's real rules for buildings surviving capture and for plunder. Resistance and culture
  flips arrive in Phase 6.
- Whether bigger cities lose a whole citizen or only part of their food box on capture
  (the owner's "size 1.5" reading suggests the latter); for now they lose one citizen.
