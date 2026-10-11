# Vision and fog of war

**Status:** draft · **Confidence:** medium

## Rule

Every tile is, for each player, *unexplored*, *explored* (seen before, shown greyed) or
*seen* (in sight now). The engine stores the explored set per player; what is seen is
derived from the player's units.

- Units see one tile around them; from mountains, or with the radar ability, two.
- Moving a unit marks everything in its sight as explored.
- Tribal villages may hand over a map of the area (radius 6).

Later phases add: territory is always seen (Phase 2), outposts (2 / 3 / 4 tiles on flat,
hills, mountains), radar towers, map trading.

## Sources

Civilopedia "Maps" (fog of intelligence), carrier/cruiser/AEGIS entries (radar sees two
tiles), outposts entry.

## Open questions

- Whether hills also extend sight for ordinary units in Civ3 (outposts get +1 on hills);
  we give the bonus on mountains only until checked in the original game.
- Explored tiles currently show their present state, not the state when last seen.
