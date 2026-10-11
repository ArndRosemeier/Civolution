# Espionage

**Status:** draft (Phase 4) · **Confidence:** medium for the missions and base costs (rule
file), low for chances and the cost multiplier (ours)

Code: `packages/engine/src/espionage.ts`.

## Rule

Missions come from the rule file's espionage table, with who can carry them out and a base
cost. A mission costs **base cost × 3 × (era + 1)** gold of the civilization sending it.

| Mission | Needs | Chance | Effect |
|---|---|---|---|
| Establish embassy | contact, Writing (`enablesDiplomats`), not at war | always | see the other's treasury, government, research; reveals their capital |
| Investigate city | embassy or spy | 90 % | reveals the city's surroundings and what it builds |
| Steal technology | embassy or spy | 50 % | a random advance they know and you can use |
| Steal world map | spy | 70 % | their explored map |
| Plant spy | embassy and an Intelligence Agency | 75 % | a spy in that civilization |
| Steal plans | spy | 60 % | reveals where all their units stand |
| Propaganda | spy, not the capital | the culture table | the city defects with its garrison |
| Sabotage production | spy | 50 % | the city's shields are lost |
| Expose enemy spy | their spy among you, an Intelligence Agency | 60 % | removes it |

- An Intelligence Agency in the target civilization lowers every chance by 20 points.
- **Propaganda** succeeds with the chance the rule file's culture table gives for how the
  city's people see the sender's culture (3 % "disdainful" … 30 % "in awe", by the ratio of
  the two civilizations' culture).
- **Failure** costs the gold; a planted spy is caught and lost, and the victim remembers
  (−20 attitude). Stealing, sabotage and propaganda are resented even when they succeed (−10).

## Open questions

- Civ3's mission costs scale with distance and city size; ours scale with era only.
- Resistance after a propaganda flip waits for culture flips (Phase 6).
