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
| civ_unit_warrior, spearman, archer, settler, worker, scout, explorer | early foot units (`civ.figure`) |
| civ_unit_swordsman, pikeman, longbowman, medieval_infantry, musketman, rifleman, infantry, marine, paratrooper | foot soldiers from the Bronze Age to today (`civ.figure`) |
| civ_unit_leader, army | great leader with banner; army of three round a standard (`civ.figure`) |
| civ_unit_horseman, chariot, knight, cavalry | mounted units (`civ.mounted`) |
| civ_unit_catapult, trebuchet, cannon, artillery | siege and artillery (`civ.siege`) |
| civ_unit_tank, modern_armor, mech_infantry, mobile_sam | vehicles (`civ.vehicle`) |
| civ_unit_galley, caravel, galleon, frigate, ironclad, transport, destroyer, battleship, carrier, submarine | ships (`civ.ship`) |
| civ_unit_fighter, jet_fighter, bomber, stealth_bomber, helicopter, cruise_missile, nuclear_missile | aircraft and missiles (`civ.aircraft`) |
| civ_barbarian_camp, civ_fx_crater | barbarian camps, nuclear craters (`civ.settlement`, `civ.fx`) |

`tools/models/unit-models.json` maps every unit type of the rule set to its model (unique
units borrow the closest one) and gives each model its in-game size (`_fit`); the client
reads it directly.
| civ_city_ancient | benchmark showcase |
| civ_city_{ancient,medieval,industrial,modern}_{town,city,metro} | cities on the map, by the owner's era and the city's size class (generator `civ.city`) |
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

`manifests/phase2.json` (229 items, written by `pnpm --filter @civolution/assets manifest:phase2`
from hand-written subjects): building and wonder icons (`art/buildings`), tech medallions
(`art/techs`), government emblems (`art/governments`), citizen and specialist portraits
(`art/people`), unit portraits for the build list (`art/units`). The UI hides a picture
until its file exists.

## Sound effects (OpenRouter, ByteDance Seed Audio)

`src/sounds.ts` calls `POST /audio/speech` with `bytedance-seed/seed-audio-1-0` and writes
MP3s plus `provenance.json` and `index.json` (variations per sound) to
`packages/client/public/audio/`. Prompts are prefixed with "The sound of" automatically;
without it the model reads the words aloud.

```bash
OPEN_ROUTER_KEY=… pnpm --filter @civolution/assets sounds -- --manifest manifests/phase2-sounds.json
```

`manifests/phase3.json` (19 items, written by `pnpm --filter @civolution/assets manifest:phase3`):
portraits for the scout, great leader and army, experience badges (`art/experience`), war,
peace and barbarian emblems (`art/war`), and headline illustrations for war news
(`art/news/*.jpg`, 16:9).

`manifests/phase3-sounds.json`: 26 sounds, 59 clips: an attack sound per unit family
(melee, archery, mounted, gunpowder, rifle, armour, artillery, naval, air), battle won and
lost, bombardment, aircraft, dogfight, nuclear blast and missile interception, war declared,
peace, city captured and destroyed, great leader, promotion, pillage, capture, boarding,
barbarian horn.

`manifests/phase2-sounds.json`: 20 sounds, 42 clips (city founded and grown, building,
unit and wonder complete, tech and era, disorder and celebration, revolution, borders,
gold, hurry, UI clicks, end of turn). The client (`src/audio.ts`) plays one per batch of
events and stays silent without the files.
