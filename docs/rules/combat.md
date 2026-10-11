# Combat

**Status:** draft (Phase 3) · **Confidence:** high for the round model and hit points, medium for retreat, defender choice and bonus stacking, low for promotion and leader odds

Code: `packages/engine/src/combat.ts` (strengths, defender, odds, the fight) and
`packages/engine/src/war.ts` (what follows a battle). Tests:
`packages/engine/test/combat.test.ts`.

## Rule

**Starting a battle.** Moving a unit onto a tile held by a civilization you are at war with
attacks it (barbarians are always at war with everyone). The attacker needs attack strength
above 0 (an army needs at least one member), movement left, and must not have attacked yet
this turn unless it has **blitz**. Land units attack land tiles; ships attack ships; only
**amphibious** units attack straight from a transport. Aircraft use missions
([air.md](air.md)). Attacking costs one movement point.

**Hit points.** A unit has the hit points of its experience level (Conscript 2, Regular 3,
Veteran 4, Elite 5, from the rule file) plus its type's `hitPointBonus`. Experience changes
hit points and retreat chance, never strength. An army's hit points are its members'.

**Rounds.** Each round the attacker wins with probability A / (A + D), where A and D are the
modified strengths; the loser of the round loses one hit point. The battle ends when a side
has no hit points left. Strengths are integers in hundredths (`base × (100 + Σ bonus %)`),
so the fight needs no floating point.

**Attack strength:** the unit's attack, plus against barbarians the difficulty's bonus for
human players (Chieftain +800 %, Warlord +400 %, Regent +200 %, Monarch +100 %, Emperor
+50 %, Demigod +25 %) and +100 % with the Great Wall.

**Defence strength:** the unit's defence plus these percentages, added together:

| Bonus | When | Amount |
|---|---|---|
| Terrain | land defender on land | the terrain's `defenceBonus` (grassland 10, hills 50, mountains 100, forest and jungle 25, …) |
| River | the attack crosses a river edge | 25 |
| Fortress | defender in a fortress, not a city | 50 |
| Fortified | fortified, or anywhere in a city (not in a fortress) | 25 |
| Town / city / metropolis | land attack on a city of size ≤ 6 / 7–12 / 13+ | 0 / 50 / 100 |
| City Walls | land attack on a town | 50 (walls bring a town up to a city's bonus) |
| Coastal Fortress | sea attack on the city | 50 |
| Civil Defense | bombardment and air strikes | 50 |
| Barbarians | defending against barbarians | as for attack |

**Defender.** The defender is the unit on the tile with the highest best-strength × hit
points against this attack (ties: lowest id). Units that cannot defend against this kind
of attack (workers, settlers, leaders, artillery with defence 0; ships in a city against a
land attack; aircraft; cargo) never defend. Armies defend with their members.

**Armies fight member by member.** Each round the member with the highest strength ×
hit points fights; it takes the damage. A member at 0 hit points dies; the army falls when
all members are dead.

**Retreat.** A land unit whose movement is greater than its opponent's may withdraw
instead of losing its last hit point: when a round would kill it, it rolls its level's
retreat chance from the rule file (Conscript 34 %, Regular 50 %, Veteran 58 %, Elite 66 %).
Success ends the battle with the unit
at 1 hit point. Defenders do not withdraw from cities or fortresses; armies never retreat.
Retreat never changes the chance to win; it converts part of the losses into retreats.

**Before the battle:** every unit in the defending stack with a bombard strength (archers,
catapults, …) that has not fired this turn fires once at a land attacker: one round of its
bombard strength against the attacker's base defence; a hit costs a hit point but never
the last one (C3C's defensive bombard).

**Zone of control:** an enemy unit with ZOC (or any attacker standing in a fortress) next
to both the start and the end of a move fires one round at the mover; a hit costs a hit
point but never the last one.

**After the battle**
- The winner may be promoted one level: 1 in 8 (`PROMOTION_ODDS`), 1 in 4 for
  militaristic civilizations ([civilizations.md](civilizations.md)). Victories over
  barbarians promote no further than Veteran; barbarians are never promoted.
- An **Elite** winner may bring a **great leader**: 1 in 16 (1 in 8 with the Heroic Epic),
  not against barbarians, and only while the civilization has no living leader
  ([armies.md](armies.md)).
- A unit that **enslaves** (Javelin Thrower, Man-O-War, Privateer) takes a captive of its
  `enslavesTo` type in 1 of 3 victories.
- When the last defender of a tile falls, a land attacker moves in and takes what is left
  ([capture.md](capture.md)).
- War weariness: both sides +1, the side that lost a unit +3
  ([war-weariness.md](war-weariness.md)).

**Healing.** A unit that neither moved nor fought this turn heals at the end of the turn:
1 hit point in the field, none in enemy territory (unless Battlefield Medicine), 2 in a city
of its own, all of them in a city with a Barracks (land), Harbour (sea) or Airport (air).
Ships heal only in port; cargo at sea does not heal.

## Sources

- Rule file: experience levels (hit points, retreat), `PRTO` attack/defence/hit point
  bonus/abilities, `TRRN` defence bonuses, `RULE` fortress, fortification, river, town,
  city and metropolis bonuses, `DIFF` barbarian bonus, `BLDG` walls and coastal fortress.
- Round model and retreat at the fatal round: the long-standing community descriptions of
  Civ3 combat (CivFanatics "Combat Explained" threads, Apolyton Civ3 strategy archive).
- Published vector: Apolyton Civ3 strategy archive, "civ 3 combat calculations with
  retreat odds" (2002): veteran Cavalry (6, 5 hp) against fortified Infantry in a size 7–12
  city on plains (18.15, 4 hp), no retreat: 11.2 %. Our odds give 11.2 %.

## Test vectors (combat.test.ts)

- Regular A 3 against regular D 2: 0.6³ (1 + 3·0.4 + 6·0.4²) = 68.256 %.
- The closed form Σ C(hpD−1+k, k) pᵈ qᵏ for several matchups.
- The Apolyton vector above.
- Retreat at 50 %: win chance unchanged, retreat = half of the old losses.
- Army of three equal 3-hp members against one: loses with (1 + 11 + 55) / 2¹¹.
- Spearman fortified on hills behind a river: 2 × 2.00 = 4.00.
- A thousand random battles via the command API: invariants clean after each, and the
  number of wins within four standard deviations of the summed odds.

## Open questions

- Whether bonuses add or multiply. Some 2002 posts multiply them; most later analyses
  add them. We add.
- Promotion odds (we use 1 in 8 for every level, doubled to 1 in 4 for militaristic
  civilizations).
- Exact defender choice: Civ3 is said to weigh hit points; we use strength × hit points.
- Whether defenders retreat in C3C, and to where; ours withdraw in place.
