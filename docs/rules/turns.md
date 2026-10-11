# Turns, orders and tribal villages

**Status:** draft · **Confidence:** medium

## Turn order

Players give orders in any order; a player ends their turn with `endTurn`. When every
living player has ended the turn, the engine runs the end of turn:

1. Worker jobs advance and complete (`docs/rules/workers.md`).
2. Cities that place their own citizens re-place them ([cities.md](cities.md)).
3. For each player, each city in id order: mood (disorder, celebration), food and growth,
   production and completed builds, wonder-made units, culture
   ([cities.md](cities.md), [production.md](production.md), [culture.md](culture.md)).
4. For each player: the treasury (tax − building upkeep − unit support), research, debt,
   and the end of anarchy ([science.md](science.md), [governments.md](governments.md)).
5. Borders are recomputed if any city's border ring grew.
6. The turn counter advances and every unit's movement is restored.
7. Sentries wake if a foreign unit is in sight.
8. Goto orders continue, in unit-id order.

Civ3 itself moves players one after another; simultaneous orders change nothing while
civilizations cannot interact, and Phase 4 revisits this with diplomacy and combat.

## Orders

Fortify (land units; ends the unit's turn), sentry, skip turn, wake, disband, goto, work.
Moving a unit clears its order. Automation routines (`explore`, `autoWorker`) are stored
on the unit and run by `@civolution/automation`, which issues ordinary commands with a
reason attached (PLAN.md §8).

## Tribal villages

Entering a village with a land unit opens it once (`enterHut` in
`packages/engine/src/move.ts`), on one weighted roll from the table `HUT_ODDS`:

| Weight | Outcome |
|---|---|
| 70 | 1–2 barbarian warriors next to the village |
| 10 | gold: 25, 50 or 75 |
| 6 | a free advance: one of the three cheapest the player can research (not a starting one) |
| 5 | a free unit: the civilization's Warrior (or its unique unit in that place) |
| 4 | a map of the tiles within 6 |
| 2 | Settlers |
| 2 | the village becomes a city of the player, if a city could be founded there |
| 1 | nothing |

Barbarians may not appear before turn 6, for a player with fewer than two cities, within 3
tiles of one of the player's cities, without barbarians in the game, or when there is no
free land next to the village; expansionist civilizations never meet them. When the roll
says barbarians but they may not appear, the village gives one of the positive outcomes
instead (rolled with the same weights), never nothing. A positive outcome that cannot happen
(no advance to give, no legal city site) is rolled again among those that can.

Source: owner's ruling 2026-10-11. The 70 % for barbarians is the owner's recollection of
Civ3; the positive odds are rough.

**Confidence:** medium for the village odds (owner's ruling; Civ3's exact odds are difficulty-dependent and undocumented).

`packages/engine/test/villages.test.ts`: the table adds up to 100; barbarians about 70 % of
the time once allowed; none early in the game or for an expansionist civilization (gifts
instead, never nothing in their place); Settlers and a village turned city; no city where
one may not be founded.
