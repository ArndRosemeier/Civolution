# Art pipeline

Everything that ships is made for this project (PLAN.md D2): no original Civ3 art.

## 3D models (Blender, via AssetGenerator)

Models are built headless by the AssetGenerator pipeline
(`C:\Projekte\AssetGenerator`, generators `civ.figure`, `civ.ship`, `civ.settlement`,
`civ.nature`). Each model is a JSON spec; the pipeline builds it, checks it (triangle
budget, manifold, UVs, origin at the base, export round trip) and renders previews.

Copies of the generator code and specs live in `tools/models/` so this repo carries
what it depends on. The generators are committed on AssetGenerator's local branch
`civolution-models`; that branch is not pushed yet.

To rebuild after changing a spec (in the AssetGenerator checkout):

```bash
python tools/ag.py generate civ_unit_warrior
```

then copy `assets/out/civ_*.glb` to `packages/client/public/models/`.

| Model | Used for |
|---|---|
| civ_unit_warrior, spearman, archer, settler, worker, scout, explorer | foot units (other land units borrow the warrior until their own models exist) |
| civ_unit_galley | ships |
| civ_city_ancient | cities (benchmark showcase until Phase 2) |
| civ_tribal_village | tribal villages |
| civ_nature_pine, broadleaf, palm, jungle, reed | forest, jungle, marsh dressing |
| civ_nature_mine | mines |

Conventions: flat PBR colours (no textures), one material named `team` that the game tints
in the owner's colour, low triangle counts (figures ~800, trees ≤ 300) so thousands can be
instanced.

## 2D art (OpenRouter)

`packages/assets` holds the OpenRouter client (ported from Imager `src/llm`: retries,
typed errors, Images API with reference images, model limits read from the live
`/images/models` list) and `src/generate.ts`, which works through a manifest:

```bash
OPEN_ROUTER_KEY=… pnpm --filter @civolution/assets gen -- --manifest manifests/phase1.json
```

The style bible is generated first and passed as a reference image to every other item,
so the set stays consistent. Outputs go to `packages/client/public/art/` with
`provenance.json` (model, prompt, date, cost) per file. Unchanged items are skipped.

`manifests/phase1.json`: style bible, 26 resource medallion icons, title-screen painting.
