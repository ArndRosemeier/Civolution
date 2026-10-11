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

A round with nothing left to hurt misses. Cruise missiles are spent when they fire.
Defensive bombard is described in [combat.md](combat.md).

## Open questions

- Civ3's exact choice between units, population and buildings, and whether the walls'
  `bombardDefence` enters D. We use the best defender's strength.
