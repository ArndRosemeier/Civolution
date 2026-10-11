# Movement and zones of control

**Status:** draft · **Confidence:** high for costs, medium for the edge cases noted below

## Rule

Movement is counted in thirds of a movement point (the rule file's road movement rate is 3).

| Step | Cost |
|---|---|
| Railroad on both tiles | 0 |
| Road on both tiles | 1/3 |
| Unit that treats all terrain as road (Explorer, Conquistador) | 1/3 |
| Terrain the unit ignores (e.g. Keshik on hills and mountains) | 1 |
| Otherwise | the destination terrain's movement cost (hills 2, mountains 3, …) |
| Ships | 1 per tile |

- **Rivers and bridges:** a road does not help when the step crosses a river until the
  player knows a tech that "enables bridges" (Engineering). Crossing a river costs
  nothing extra otherwise. A diagonal step through a tile corner crosses a river when
  both ways around that corner do.
- **Partial moves:** a unit with any movement left may always make one more step; if
  the step costs more than it has left, the step uses up the rest.
- **Where units may go:** land units stay on land (transports come later); ships stay on
  water, galleys (sinks in sea) only on coast, units that sink in ocean not on ocean;
  wheeled units need a road to enter jungle, marsh, mountains or volcanoes; impassable
  terrain is closed to all.
- **Other civilizations:** a tile held by another civilization's units cannot be entered
  in peace; at war it would be an attack, which arrives with combat in Phase 3.
- **Goto** finds the cheapest known route (Dijkstra over explored tiles; each step counts
  at most a full turn of movement), moves as far as it can now and continues at the
  start of each turn until it arrives or the route is blocked.

**Zones of control (Conquests).** Land units with the ZOC flag (Cavalry, Tanks, Modern
Armor, Keshik, …) and armed units inside a fortress exert a zone of control over the
eight surrounding tiles. A land unit of a civilization at war that moves from one tile in
that zone to another tile in the same zone triggers it: the engine emits a
`zoneOfControl` event naming the units. Their free attack is resolved by the combat rules
in Phase 3; ZOC never blocks movement in Conquests.

## Sources

Rule file: PRTO (movement, abilities, ZOC flag, ignored terrain), TRRN (movement cost),
TFRM/TECH (bridges); Civilopedia: roads, railroads, Engineering ("roads now bridge
rivers"), zone of control, fortresses.

## Test vectors

`packages/engine/test/movement.test.ts`: terrain/road/rail costs, the partial-move rule,
river bridging, coast-only galleys, explorer road movement, occupied tiles and ZOC events,
goto across turns.

## Open questions

- Civ2 had a random chance for partial moves; we take the community reading that Civ3
  always allows the step. To verify in the original game.
- Whether Conquests gives road-like movement along rivers: not stated in the rule file or
  Civilopedia, so not implemented.
- Railroads in enemy territory and right of passage arrive with borders in Phase 2/4.
