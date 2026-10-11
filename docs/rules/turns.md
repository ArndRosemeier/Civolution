# Turns, orders and tribal villages

**Status:** draft · **Confidence:** medium

## Turn order

Players give orders in any order; a player ends their turn with `endTurn`. When every
living player has ended the turn, the engine runs the end of turn:

1. Worker jobs advance and complete (`docs/rules/workers.md`).
2. The turn counter advances and every unit's movement is restored.
3. Sentries wake if a foreign unit is in sight.
4. Goto orders continue, in unit-id order.

Cities, research and upkeep join this pipeline in Phase 2. Civ3 itself moves players one
after another; simultaneous orders change nothing while civilizations cannot interact,
and Phase 4 revisits this with diplomacy and combat.

## Orders

Fortify (land units; ends the unit's turn), sentry, skip turn, wake, disband, goto, work.
Moving a unit clears its order. Automation routines (`explore`, `autoWorker`) are stored
on the unit and run by `@civolution/automation`, which issues ordinary commands with a
reason attached (PLAN.md §8).

## Tribal villages

Entering a village with a land unit opens it once: 35 % gold (25, 50 or 75), 20 % a map
of the surroundings, 20 % a free Warrior, 25 % nothing. Free techs, settlers and barbarian
uprisings join when research and combat exist; the odds will be rebalanced then.

**Confidence:** low for the village odds (Civ3's are difficulty-dependent and undocumented).
