# Barbarians

**Status:** draft (Phase 3) · **Confidence:** medium; spawn rates are our own

Code: `packages/engine/src/barbarians.ts`, `raidCity` (war.ts), tribal villages (move.ts).

## Rule

- Every game with barbarians (the default, "roaming") has a barbarian player after the
  civilizations. It knows the map, is always at war with everyone and is moved by the
  engine at the end of each turn.
- **Camps** appear from turn 10 on empty land outside all borders, at least 6 tiles from
  any city and 4 from any civilized unit (standing in for "unseen"): chance per turn 4, 6,
  9 or 14 % for sedentary, roaming, restless or raging, up to (activity level + 1 per 1,500
  tiles) camps. A camp always keeps one fortified guard.
- Each camp sends out a raider every 14, 9 or 5 turns on average (roaming, restless,
  raging; sedentary barbarians stay home), up to 3 units per camp plus 4.
- **Units:** the rule file's basic barbarian (Warrior) until any civilization reaches the
  second era, then the advanced one (Horseman).
- **Raiders** head for the nearest city or unit within 8 tiles, attack when their chance to
  win or retreat is at least 25 %, and otherwise wander.
- **Raids:** barbarians never hold or destroy a city. Entering an undefended city they take
  up to 10 gold per citizen from its owner's treasury, kill one citizen (a size 1 city stays
  at size 1) and leave with the loot. Source: owner's ruling 2026-10-11.
- Entering an empty camp destroys it for 25 gold.
- Human players fight barbarians with the difficulty's bonus ([combat.md](combat.md)).
- **Tribal villages** hold 1 or 2 barbarians about 70 % of the time (after turn 5, not
  within 3 tiles of your cities, never while you have only one city, never for
  expansionist civilizations; otherwise a gift instead): see [turns.md](turns.md#tribal-villages).

- **Landings:** from turn 40, with a chance per turn of 2, 3 or 5 % (roaming, restless,
  raging), a barbarian ship appears off a random coastal city and puts 1 to 3 raiders
  ashore on a free tile within 2 tiles of it. The ship waits offshore.

## Not yet

Uprisings and barbarian leaders.
