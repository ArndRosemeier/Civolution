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
| [turns.md](turns.md) | Turn pipeline, orders, tribal villages | draft (Phase 1) |
| combat.md | Round-based combat, hit points, retreat, bombard, defensive bonuses | to do (Phase 3) |
| corruption.md | Corruption and waste: distance, rank, optimal city number, government | to do (Phase 2) |
| culture.md | Culture points, border growth, culture flips | to do (Phase 2/6) |
| happiness.md | Content base, luxuries, war weariness, disorder, WLTKD | to do (Phase 2) |
| growth.md | Food box, city size limits, specialists | to do (Phase 2) |
| science.md | Tech cost, research limits, era advance | to do (Phase 2) |
| golden-age.md | Triggers and effects | to do (Phase 6) |
| leaders.md | Military and scientific great leaders | to do (Phase 3/6) |
| pollution.md | Pollution and global warming | to do (Phase 6) |
| ai-handicaps.md | Difficulty-level handicaps | to do (Phase 4) |

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
