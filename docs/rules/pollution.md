# Pollution and global warming

**Status:** draft (Phase 6) · **Confidence:** low (our model with Civ3's inputs)

## Rule

**Pollution points** of a city (`pollution.ts`, shown on the city screen):

- Industry: the sum of its buildings' `pollution` values (Factory 2, Coal Plant 2,
  Manufacturing Plant 2, Offshore Platform 2, Iron Works 4, Research Lab 1, Airport 1,
  Commercial Dock 1) × shields ÷ 40. A Recycling Center leaves a third.
- People: once the owner knows Industrialization, one point per two citizens above 12; a
  Mass Transit System removes them.

Each turn a city with points has `4 % × points` chance (at most 90 %) to pollute a random
unpolluted land tile in its work area. Polluted tiles lose yield ([yields](cities.md))
until workers clean them.

**Meltdown.** A city with a Nuclear Plant that is in civil disorder has a 10 % chance a
turn of a meltdown: half its people die (rounded up, at least one survives), the plant is
lost and about half the land around is polluted.

**Global warming.** Every turn each polluted tile or crater adds a point of warming.
When warming passes the threshold (the map's tiles ÷ 50, at least 10, times the strikes so
far plus one) the climate strikes and the threshold is spent: one land tile in 200 changes
(grassland → plains → desert, tundra → plains, forest → plains, jungle → marsh, flood
plain → desert, snow → tundra) and loses its irrigation.

## Test vectors

`packages/engine/test/endgame.test.ts`: a Factory city of 40 shields has 2 points, a
Recycling Center at 120 shields leaves 2; size 17 after Industrialization adds 3 and a
Mass Transit System removes them; enough polluted tiles cause a strike that turns
grassland drier.

## Open questions

Civ3's pollution and warming formulas are not in the rule file; ours keeps the same
inputs and orders of magnitude.
