# Air missions

**Status:** draft (Phase 3) · **Confidence:** medium

Code: `airCommand`, `interception`, `airDefence` in `packages/engine/src/war.ts`.

## Rule

Aircraft are based in their owner's cities or on carriers (a carrier holds aircraft up to
its capacity) and never move by stepping; they fly one mission per turn:

| Mission | Reach | Effect |
|---|---|---|
| Bomb | operational range | bombardment with the aircraft's bombard strength and rate of fire ([bombard.md](bombard.md)) |
| Precision strike | operational range | as bombing, but only buildings are hit; needs a tech with `enablesPrecisionBombing` |
| Reconnaissance | twice the operational range | reveals the tiles within 2 of the target |
| Rebase | twice the operational range | moves to one of your cities or a carrier with room |
| Intercept | none | stands guard until it next acts |

**Interception.** Before a bombing or reconnaissance mission resolves, the strongest enemy
interceptor (on intercept duty, not yet engaged this turn, with the target within its
operational range) rises with the rule file's chance (50 %, 5 % against stealth aircraft).
It then fights the intruder to the death: interceptor attack against the intruder's
defence. A destroyed intruder aborts the mission.

**Air defence.** A surviving bomber then meets the best air defence on the target tile
(Flak 2, Mobile SAM 4, warships 1 to 3, from the rule file's `airDefence`): one round of
air defence against the bomber's defence; a hit costs a hit point, and a bomber on its
last hit point is shot down.

## Not yet

Airdrops, airlifts, helicopters carrying troops, air superiority over a stack, and
stealth attacks.

## Airdrops and airlifts (Phase 4)

- **Airdrop:** a unit with the airdrop action (Paratroopers) that has not moved this turn
  jumps from one of your cities onto any known, free land tile within its operational
  range (not a foreign city). It lands with no movement left.
- **Airlift:** a unit with the airlift action that has not moved flies from one of your
  cities with an airport (or what acts as one) to another; each airport sends out one
  unit per turn. The unit arrives with no movement left.

## Stealth attack (Phase 4)

Units with the stealth attack action (submarines, stealth aircraft) pick which unit of a
stack they fight instead of meeting its best defender (`moveUnit` with `defender`). Air
units with the action still bomb the whole stack; choosing a target for them is open.
