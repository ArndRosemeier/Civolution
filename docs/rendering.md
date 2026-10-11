# The 3D map

How the map is drawn (PLAN.md §10.1) and the Phase 1 go/no-go result.

## Structure

The UI talks to a `MapView` (`packages/client/src/map/MapView.ts`); the 3D implementation
is `ThreeMapView`. The engine knows nothing about rendering, so a 2D view could replace it.

- **Height field** (`heights.ts`): heights blend between tile centres on the rotated grid,
  with peaks for hills and mountains, ragged noise along coasts and river beds carved in.
- **Chunks** (`chunks.ts`): 32 × 32 map units each, with their own terrain mesh
  (3 vertices per unit by default), river ribbons (tile-edge rivers chained into smoothed
  polylines), road and rail ribbons, and instanced dressing: trees by terrain and
  latitude, mines, tribal villages, resource icons. A chunk's dressing is rebuilt only when
  one of its tiles changes or gets explored.
- **Terrain shader** (`terrainMaterial.ts`): looks up the tile under each pixel through a
  noisy domain warp, so borders between terrains look natural; two-tone palettes, rock on
  slopes, snow on high peaks, beach sand, irrigation furrows, outcroppings, pollution, an
  optional tile grid and the fog of war. Unexplored land is sunk below the sea and black,
  so its relief cannot give the map away.
- **Water** (`waterMaterial.ts`): one plane per world copy, coloured by depth with ripples,
  sun glints and shore foam.
- **Units** (`units.ts`): one instanced mesh per model with per-instance team colour,
  smooth movement, a team ring, and flat team-coloured markers at strategic zoom.
- **Wrapping**: each chunk sits at whichever world copy (−W, 0, +W) is nearest the camera.
- **Camera** (`camera.ts`): fixed tilt that steepens as you zoom out, 90° rotation steps
  (Q/E), arrow keys and drag to pan, wheel to zoom.
- Shadows follow the view and switch off at strategic zoom.

## Go/no-go spike (Phase 1)

`?bench` (or `pnpm --filter @civolution/client bench` with the dev server running) builds
a Huge map (12,800 tiles), reveals it, adds ~525 units (all foot unit models and galleys)
and the city model at every start position, then sweeps the camera at close, mid and
strategic zoom for 6 s each.

Result on the development PC (RTX 5070, Chrome, 1920 × 1080, 2026-10-11), frame rate not
capped by vsync in the automated run:

| View | avg fps | 1% low | draw calls | triangles |
|---|---|---|---|---|
| close (units and models) | 1142 | 614 | 26 | 617k |
| mid (regional) | 902 | 485 | 56 | 974k |
| strategic (whole continents) | 920 | 331 | 105 | 942k |

**Decision: go for 3D.** The budget is 60 fps on Huge; the worst 1 % of frames stays above
300 fps, so there is ample headroom for later content (cities, borders, animation).

Not yet measured: the "≥ 30 fps on integrated graphics at Standard size" half of the
budget, because no such machine is available here. The levers if it falls short are
already in place: terrain detail (vertices per unit), shadows off, lower pixel ratio.

## Not in Phase 1

Animated unit rigs (idle/move/attack/die), LODs, KTX2 texture arrays, culture borders and
lens overlays. Placeholder-free: all models come from the Blender pipeline
(`docs/assets.md`); the remaining 2D art (resource icons, title painting) comes from the
OpenRouter pipeline, with coloured tokens shown until it is generated.
