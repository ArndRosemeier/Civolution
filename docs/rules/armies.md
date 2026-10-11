# Great leaders and armies

**Status:** draft (Phase 3; scientific leaders arrive in Phase 6) · **Confidence:** medium

Code: `maybeLeader`, `buildArmyCommand`, `joinArmyCommand`, `leaderHurryCommand` in
`packages/engine/src/war.ts`.

## Rule

- **Birth:** an Elite unit that wins a battle brings a military great leader (the rule
  file's `battleCreatedUnit`) with chance 1 in 16, 1 in 8 with the Heroic Epic. Not from
  battles with barbarians, and a civilization has at most one living leader.
- **Form an army:** a leader in one of its owner's cities becomes an empty army (the rule
  file's `buildArmyUnit`). A civilization may field one army per `citiesPerArmy` (4) cities,
  at least one. The Military Academy lets its city build armies directly, within the same
  limit.
- **Fill it:** land units with attack join an army on their tile; an army holds its
  capacity (3), one more with the Pentagon. Members take no orders of their own.
- **Fighting:** an army attacks and defends with its members one at a time (the strongest
  by strength × hit points fights each round); its hit points are its members'. An army
  moves at its slowest member's speed and has blitz. An army that wins a battle unlocks the
  Military Academy and the Heroic Epic.
- **Hurry:** instead, a leader in a city completes the improvement or wonder being built
  (not Wealth) and is spent.

## Open questions

- Civ3's exact leader odds and whether armies get a hit point bonus.
