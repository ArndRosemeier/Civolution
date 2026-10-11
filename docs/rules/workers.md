# Workers and terrain improvements

**Status:** draft · **Confidence:** medium (timing formula), high (what each job does)

## Rule

A job needs `base turns × terrain movement cost × 100` work; every worker on the tile
doing the same job adds `work rate × government worker rate` per turn (×2 once the player
knows a tech that doubles work rate, Replaceable Parts). The Worker's work rate is 100;
Despotism's worker rate is 2. So a road on grassland takes 3 turns, a mine on hills
12 (6 with two workers), irrigation on grassland 4.

Work is added at the end of the turn. Workers on one tile pool their work; switching the
tile to another job abandons the old one. A job that becomes impossible stops.

| Job | Where | Effect |
|---|---|---|
| Road | land without a road | road (+1 commerce on most terrain, faster movement) |
| Railroad | tile with a road; needs the rule set's tech and resources | railroad (free movement, +1 shield where the tile already yields shields) |
| Irrigation | terrain with an irrigation bonus, next to fresh water: a river on the tile or a neighbour, or a lake, irrigated tile or city next to it, diagonals included (Arnd, 2026-10-11). A city counts as irrigated only when it has fresh water itself (a river on its tile, or a lake or irrigated tile next to it); any tile after a tech that allows irrigation without fresh water (Electricity) | +food; replaces a mine |
| Mine | terrain with a mining bonus | +shields; replaces irrigation |
| Fortress / barricade | where allowed; needs Construction | defence bonus (combat in Phase 3) |
| Clear forest | forest | restores the terrain underneath; 10 shields go to the nearest city once cities exist (the engine emits `forestCleared`) |
| Clear wetlands | jungle, marsh | grassland (or the terrain underneath) |
| Plant forest | plains, grassland, tundra; needs Engineering | forest |
| Clear damage | pollution or crater | removes it |

Resources the new terrain cannot hold disappear when the terrain changes.
Airfields, radar towers, outposts and colonies arrive in later phases.

## Sources

Rule file TFRM (base turns, tech and resource requirements), TRRN (bonuses, which job
changes the terrain), GOVT (worker rate), TECH flags; Civilopedia worker job pages.

## Test vectors

`packages/engine/test/workers.test.ts`: road in 3 turns, two workers mining hills in 6,
fresh-water rules, forest clearing back to tundra, explanations for blocked jobs.

## Open questions

- The `base × movement cost` timing is the community formula; to verify against the
  original game (especially jungle, 24 worker-turns for one Worker under Despotism).
- The rule file lists only Iron for railroads, the Civilopedia says Iron and Coal; we
  follow the rule file.
- The railroad shield bonus (+1 where the tile yields shields) is the vanilla reading.
