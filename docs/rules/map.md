# Map, terrain and the map generator

**Status:** draft · **Confidence:** high for geometry and terrain numbers, medium for generator shape

## Rule

**Geometry.** The map is Civ3's diamond grid: `width × height` in rule-file units, tiles at
(x, y) with x + y even, so a map holds width × height / 2 tiles (Huge: 160 × 160 = 12,800).
The map wraps east–west. A tile's diamond shares an edge with its NE, SE, SW and NW
neighbours and only a corner with N, E, S and W. Distance is the number of king moves on
the rotated grid u = (x + y) / 2, v = (y − x) / 2, which is (|dx| + |dy|) / 2.

**Terrain** numbers (food, shields, commerce, irrigation, mine and road bonuses,
movement cost, defence bonus, which improvements are allowed) come from the rule file
through `packages/rules/data/conquests.json`. An irrigation or mine bonus of 0 means the
terrain cannot be irrigated or mined (matches the Civilopedia tables: hills, tundra and
forest cannot be irrigated; flood plain and forest cannot be mined).

**Tile features**
- *Rivers* run along tile edges (bit per edge, stored symmetrically on both tiles). A tile
  with a river on any of its edges gets +1 commerce and is a fresh-water source.
- *Fresh-water lakes* are coast tiles in a small enclosed water body (≤ 15 tiles); they
  yield 1 extra food (2 like the Civilopedia table) and are fresh water.
- *Outcroppings* (bonus grassland) give +1 shield.
- *Resources*: bonus resources are always visible; luxury resources too; strategic
  resources are visible only to players who know the revealing tech.
- *Forest, jungle and marsh* remember the terrain underneath, which clearing restores.

**Generator parameters** are Civ3's: world size, land form (archipelago, continents,
pangaea), water coverage (60/70/80 %), climate (arid/normal/wet), temperature
(cool/temperate/warm), age (3/4/5 billion years) and barbarians (stored for Phase 3).
"Random" is resolved from the seed.

## How the generator works

1. Elevation = fractal value noise (periodic across the date line) plus continent
   "domes" (1 for pangaea, 2–3 for continents, 9–16 smaller ones for archipelago); the
   poles are pushed down. The top `100 − water%` of tiles become land, exactly.
2. Water is coast (next to land), sea (2–3 tiles out) or ocean; small enclosed bodies
   become lakes.
3. Relief: the most rugged land by a ridge noise becomes mountains, then hills; older
   worlds have fewer (mountains 9/6/4 %, hills 16/12/8 % for 3/4/5 billion years).
   Most coastal mountains soften to hills. A few volcanoes sit among the mountains.
4. Climate: temperature from latitude, the temperature setting, noise and altitude;
   moisture from noise, the climate setting and nearby water. They pick tundra, desert,
   plains or grassland, with jungle (hot and wet), marsh (wet lowland) and forest overlays.
5. Rivers start on hills and mountains and flow downhill along tile edges to the sea or
   into another river. Desert with a river becomes flood plain.
6. Resources: about 1 tile in 12, never next to another, chosen from what the terrain
   allows, strategic resources weighted by their appearance ratio; luxuries cluster.
7. Start positions: the best city sites by nearby food, shields, commerce, resources,
   rivers and coast, at least the world size's "distance between civs" apart (relaxed
   step by step only if the map cannot fit everyone).
8. Tribal villages: about 1 per 45 land tiles, spaced apart and away from starts.

All of it is integer maths with the game's seeded generator, so a seed always yields the
same map (`packages/engine/test/mapgen.test.ts`).

## Sources

Rule file TRRN, GOOD, WSIZ sections; Civilopedia entries for terrain, rivers, lakes,
irrigation and resources (used to understand the rules only).

## Open questions

- Civ3 places outcroppings in a regular pattern; we use a 1-in-4 random scatter.
- The real generator's land shapes and resource density are not documented; ours are
  tuned by eye and will be compared against Civ3 maps in Phase 8.
- Note: the Conquests rule file's Huge map is 160 × 160 (the plan's 180 × 180 was wrong).
