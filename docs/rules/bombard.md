# Bombardment

**Status:** draft (Phase 3) · **Confidence:** medium for the round model, low for how hits pick a target

Code: `bombardTile` and `bombardCommand` in `packages/engine/src/war.ts`.

## Rule

A unit with the `bombard` action and a bombard strength (catapult, cannon, artillery,
frigates and warships, cruise missiles) fires at a tile within `max(1, bombardRange)` tiles
that holds units or a city of a civilization it is at war with. It fires once per turn
(blitz units may fire again while they have moves); firing costs one movement point.

Each of its `rateOfFire` rounds succeeds with probability B / (B + D): B is the bombard
strength, D the best defence strength among the target's units against bombardment
(at least 1.00). A successful round picks one of what is there, at random:

- a **unit**: it loses a hit point; the last hit point only falls to **lethal** bombard
  (`lethalLandBombard` against land units, `lethalSeaBombard` against ships);
- a **citizen**, if the city has more than one;
- an ordinary **building** (never wonders or the palace).

A round with nothing left to hurt misses.

**City defence against bombardment.** When a round aims at a city's citizens or buildings,
D is at least the city's own bombard defence: the best `bombardDefence` of its buildings
against land bombardment (Walls 8, also through the Great Wall acting as Walls) or the best
`navalBombardDefence` against ships (Coastal Fortress 8), in whole strength points. A
Catapult (4) thus hits a walled city's people a third of the time instead of four in five.
Rounds aimed at units use only the units' defence; air strikes ignore these buildings
(the SAM Missile Battery covers them, [air.md](air.md)). `cityBombardDefence` in
`packages/engine/src/war.ts`. *Confidence: low* for this use of the two fields; Civ3
documents only that they defend against bombardment. Cruise missiles are spent when they fire.
Defensive bombard is described in [combat.md](combat.md).

## Open questions

- Civ3's exact choice between units, population and buildings, and exactly how the walls'
  `bombardDefence` enters D (we take the larger of it and the best defender's strength).
