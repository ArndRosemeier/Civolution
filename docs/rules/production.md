# Production, buildings and hurrying

**Status:** draft (Phase 2) · **Confidence:** high for costs and requirements, medium for bonuses

## Shields

Shields per turn = worked-tile shields − waste (see [corruption.md](corruption.md))
+ Civil Engineers (toward buildings and wonders only) + building bonuses. A city in civil
disorder adds nothing.

Building bonuses (rule file `production`, stored in quarters, so 2 = +50 %):
- Factory +50 %, Manufacturing Plant +50 % (of the shields after waste).
- A power plant (Coal, Hydro, Nuclear, Solar; or Hoover Dam's effect) raises the factory
  bonus by its own percentage (Coal +50 % of the factory bonus, Nuclear +100 %). Only the
  best plant counts, and building a new one replaces the old.
- Iron Works +100 %.

*Confidence: medium.* The percentages come from the rule file and match the Civilopedia
text; how Civ3 stacks plants with the Manufacturing Plant is our reading.

## Building things

- Costs: units as stored, buildings stored in tens (Temple 6 → 60 shields).
- When the box reaches the cost, the item completes at the end of the turn. Shields beyond
  the cost are lost: the next item starts from an empty box. *Source: owner's ruling
  2026-10-11.*
- A unit with a population cost (Settler 2, Worker 1) waits, box full, until the city is
  larger than that cost; completing it shrinks the city.
- After a unit, the city repeats it unless a queue entry follows; after a building, the
  queue continues or the city waits for orders.
- Switching the build between units, improvements and wonders costs nothing: every shield
  in the box is kept. *Source: owner's ruling 2026-10-11.*
- Units are veteran from a city with Barracks (land), Harbor (sea) or Airport (air).
- Wealth (the `wealth` build kind, flag `capitalization`) turns shields into gold: one gold
  per 4 shields (`shieldValueInGold`), per 2 once an advance flagged `doublesWealth`
  (Economics) is known.
- **Disbanding** a unit inside one of the player's cities adds half its shield cost
  (rounded down) to the city's current build (not to Wealth, nor without a build);
  elsewhere nothing comes back. *Confidence: medium.*

## What a city can build (`production.ts`, `buildBlocker`)

Units: known tech, required resources connected to the city, a coast for ships; a unit is
no longer offered once its upgrade can be built. Until civilizations are chosen
(Phase 6), units available to fewer than half of the civilizations (unique units, the
Scout) are left out. Aircraft wait for Phase 3.

Buildings: known tech, not obsolete, not already there; great wonders once in the world,
small wonders once per civilization; the required building in the city (or, for small
wonders such as Wall Street, that many across the empire); the required government and
resources; coastal buildings need a coast; Hydro Plant and Hoover Dam need a river in the
work area, the Nuclear Plant water; Hospital and Shakespeare's Theater need a city larger
than a town. Small wonders that need a victorious army or armies wait for Phase 3, the
spaceship for Phase 6.

## Hurrying

Despotism, Communism, Feudalism and Fascism hurry by forced labour; Monarchy, Republic and
Democracy pay gold; Anarchy cannot hurry (rule file `hurrying`). Wonders and Wealth cannot
be hurried, nor can a city in disorder.

- **Gold:** `shieldCostInGold` (4) per missing shield for units, half that (2) for
  buildings, doubled when the box is empty.
- **Forced labour:** one citizen per `citizenValueInShields` (20) missing shields; the city
  must keep at least one citizen. Each sacrificed citizen leaves one content citizen
  unhappy for `hurrySacrificeTurnPenalty` (20) turns.

The hurried item completes at the end of the turn.

## Upkeep

Each building costs its upkeep in gold every turn, except under governments without
building maintenance (Anarchy). Smith's Trading Company pays the 1-gold upkeep of trade
buildings. Unit support is in [governments.md](governments.md).

## Sources

Rule file: building costs, upkeep, flags, production and pollution values, unit costs and
population costs, general rules (shield and citizen values, forced-labour penalty).
Civilopedia: *Hurry Production*, *Maintenance*, Factory, power plant and Wealth entries.

## Test vectors

`packages/engine/test/cities.test.ts`: warrior in ten shields, switching penalty, settler
waiting for size 3, hurry quotes (240 gold for an empty Temple box under Monarchy, 100 with
10 shields in).

## Open questions

- Exact Civ3 hurry costs (the original's formula has a fixed part per item).
- Whether overflow carries across categories in Civ3.
