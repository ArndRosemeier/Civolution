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
`packages/engine/src/move.ts`), on one roll out of 100:

| Roll | Outcome |
|---|---|
| 0–29 (30 %) | gold: 25, 50 or 75 |
| 30–44 (15 %) | a map of the tiles within 6 |
| 45–61 (17 %) | a free Warrior |
| 62–76 (15 %) | a free advance: one of the three cheapest the player can research (not a starting one) |
| 77–89 (13 %) | 1–2 barbarian warriors next to the village, only after turn 5, away from the player's cities (within 3 tiles) while barbarians are in the game, and only once the player has two cities (our default) |
| 90–99 (10 %) | nothing |

An outcome that cannot happen (no advance to give, barbarians not allowed) falls through to
the next row and ends as nothing. Free settlers are not given.

**Confidence:** low for the village odds (Civ3's are difficulty-dependent and undocumented).
