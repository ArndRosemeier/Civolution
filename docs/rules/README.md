# Rules reference

One page per mechanic. Each page says what the rule is, where the numbers come from,
and how sure we are, and links the tests that pin it down (PLAN.md §6.5, §11).

Numbers stored in the Conquests rule file are read by the importer
(`pnpm run import`, see [importing.md](importing.md)); the pages here cover what the rule
file does not contain (formulas hardcoded in the game) and how stored numbers are
interpreted.

| Page | Topic | Status |
|---|---|---|
| [importing.md](importing.md) | What the importer reads and how raw values are encoded | written |
| [map.md](map.md) | Map geometry, terrain, rivers, lakes, resources, the map generator | draft (Phase 1) |
| [movement.md](movement.md) | Movement costs, roads, rails, rivers, goto, zones of control | draft (Phase 1) |
| [vision.md](vision.md) | Sight radius and fog of war | draft (Phase 1) |
| [workers.md](workers.md) | Worker job timing and effects | draft (Phase 1) |
| [turns.md](turns.md) | Turn pipeline, orders, tribal villages | draft (Phase 1–2) |
| [cities.md](cities.md) | Founding, work area, tile yields, citizen placement, growth, specialists | draft (Phase 2) |
| [production.md](production.md) | Shields, what can be built, hurrying, building upkeep | draft (Phase 2) |
| [corruption.md](corruption.md) | Corruption and waste: distance, rank, optimal city number, government | draft (Phase 2) |
| [happiness.md](happiness.md) | Content base, luxuries, buildings, military police, disorder, WLTKD | draft (Phase 2) |
| [science.md](science.md) | Commerce split, treasury, tech cost, research time, eras | draft (Phase 2) |
| [governments.md](governments.md) | Government table, revolution and anarchy, unit support | draft (Phase 2) |
| [culture.md](culture.md) | Culture points, border growth, the calendar | draft (Phase 2; flips in 6) |
| [trade.md](trade.md) | Trade network, connected resources | draft (Phase 2) |
| [combat.md](combat.md) | Round-based combat, hit points, defence bonuses, retreat, promotion, healing | draft (Phase 3) |
| [bombard.md](bombard.md) | Bombardment and lethal bombard | draft (Phase 3) |
| [air.md](air.md) | Air missions, interception, air defence | draft (Phase 3) |
| [naval.md](naval.md) | Ships, ports, transports and cargo | draft (Phase 3) |
| [armies.md](armies.md) | Great leaders and armies | draft (Phase 3) |
| [capture.md](capture.md) | Capturing and razing cities, prizes, elimination | draft (Phase 3) |
| [war-weariness.md](war-weariness.md) | War weariness | draft (Phase 3) |
| [nukes.md](nukes.md) | Nuclear weapons and missile defence | draft (Phase 3) |
| [barbarians.md](barbarians.md) | Camps, raiders, tribal villages | draft (Phase 3) |
| golden-age.md | Triggers and effects | to do (Phase 6) |
| leaders.md | Scientific great leaders | to do (Phase 6) |
| pollution.md | Pollution and global warming | to do (Phase 6) |
| [diplomacy.md](diplomacy.md) | Contact, war and peace, treaties, deals, reputation, attitude | draft (Phase 4) |
| [espionage.md](espionage.md) | Embassies and espionage missions | draft (Phase 4) |
| [ai-handicaps.md](ai-handicaps.md) | Difficulty-level handicaps for computer players | draft (Phase 4) |

Page template:

```markdown
# <Mechanic>

**Status:** draft | verified · **Confidence:** high | medium | low

## Rule
Our own description of the mechanic and its formula.

## Sources
Rule-file fields used, and community analyses with links.

## Test vectors
Hand-computed or recorded-in-game cases, and the test file that checks them.

## Open questions
```
