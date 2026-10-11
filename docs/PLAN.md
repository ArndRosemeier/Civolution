# Civolution: plan

Civilization III Complete (vanilla + Play the World + Conquests rules) rebuilt as a
single-player TypeScript web app with a modern UI and a first-class automation system.

Status: revised 2026-10-11 after your decisions (§2). Mods, scenarios and multiplayer are deferred (see §12).

---

## 1. What is already on disk

| Where | What | Use for us |
|---|---|---|
| `C:\Projekte\Civolution\Civ3Conquests.exe` | Byte-identical copy of the Steam Conquests exe (MD5 `38e79a32…`) | Nothing on its own. The exe holds code, not game data. Reverse-engineering it is out of scope; we take numbers from the data files and documented formulas instead. |
| `C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization III Complete` (1.8 GB) | Full install: vanilla, `civ3PTW`, `Conquests` | **This is the real source.** |
| … `\Conquests\conquests.biq` (30 KB, PKWARE-DCL compressed) | The complete Conquests rule set: units, buildings, techs, governments, civs, terrain, resources, difficulty, eras, world sizes, general rules | Primary rules data (§5) |
| … `\Conquests\Text\Civilopedia.txt` (565 KB, 772 entries), `PediaIcons.txt`, `diplomacy.txt`, `labels.txt` | Encyclopaedia, icon mapping, AI diplomacy lines, UI strings | Reference text and name tables |
| 3,861 PCX, 1,686 FLC, 2,275 WAV, 419 AMB, 54 MP3 | Terrain sheets, unit animations (per-unit INI + FLC), leaderheads, city art, sounds, era music | Not used (D2). At most a private reference for what each unit looks like. |
| `C:\Projekte\Civ` (CivTS) | Your earlier Civ3-inspired TS game | Not reused (D1); inspiration only |
| `C:\Projekte\SoundStudio` | Local Stable Audio 3 Small-SFX and Small-Music on the RTX 5070 (12 GB), HTTP API on `127.0.0.1:8765`, clips 0.25–120 s, WAV + `catalog.json` | Second source for effects and music beds (§10.4); ByteDance Seed audio on OpenRouter is the primary effects source. Server is not running right now; it starts with `uv run soundstudio serve`. |
| [Imager](https://github.com/ArndRosemeier/Imager) `src/llm/` | Your most complete OpenRouter client: live model list incl. Images-API-only models (`/models?output_modalities=all`), per-model limits from `/images/models` (count, aspect ratios, reference images), Images API with `input_references`, chat-image refinement, plus music, speech and video | Basis of the asset pipeline's OpenRouter client (§10.3). Key from `OPEN_ROUTER_KEY` (D4). |
| `C:\Projekte\AssetGenerator` | Headless Blender pipeline producing `.glb` + renders from JSON specs, with automated quality gates | Main route to 3D models for units, cities and improvements (§10.2) |

---

## 2. Decisions

| # | Question | Decision (2026-10-11) |
|---|---|---|
| D1 | Start fresh or grow CivTS? | **Fresh repo.** CivTS is not reused. Its ideas (determinism rules, invariants, tournaments, golden hashes) are inspiration only; the test tooling is designed new for this project. |
| D2 | What do we use from the original game? | **Data mining only.** The importer reads rule numbers and facts from your install to build our own rule set. No original art, sound, music or text ships or is committed, and there is no "classic skin". The repo is public, so the importer's raw output stays gitignored; only our own curated rule data (numbers and mechanics, written in our own words) is committed. |
| D3 | Map presentation | **3D** (§10.1). Phase 1 still builds a 3D map prototype measured against the performance budget, so problems surface early; the engine stays renderer-agnostic. |
| D4 | OpenRouter key | Read from the `OPEN_ROUTER_KEY` environment variable. |
| D5 | Home | <https://github.com/ArndRosemeier/Civolution> (public). |
| D6 | Headless games | **Required.** The engine runs complete games in Node with any mix of AI and scripted players; this drives AI tuning, invariant checks and regression tests. |

---

## 3. Goals and non-goals

**Goals**
1. Rules fidelity: a Civ3 Complete veteran recognises every number and mechanic (combat odds, corruption, culture, golden ages, armies, great leaders, flips, resources, war weariness, etc.) with the Conquests rule set as the default.
2. A modern, information-rich, fast UI that explains itself (every number has a breakdown on hover).
3. First-class automation so that a large empire stays fun in the late game (§8).
4. Competent AI that plays by Civ3's rules with Civ3's difficulty handicaps.
5. Deterministic, testable engine; the game runs entirely in the browser with local saves.

**Non-goals (now):** multiplayer, scenario editor and scenario BIQs, mods, Conquests campaign scenarios (Mesopotamia, etc.), loading original `.SAV` games (possible later, §12).

---

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript 5.x, strict, ES modules | Required |
| Workspace | pnpm workspaces, Node 24 | Simple monorepo, fast installs |
| Engine | Plain TS, no dependencies, integer/fixed-point maths, seeded PRNG in state | Determinism, portability (browser, worker, Node) |
| Engine runtime in browser | Web Worker, state behind a command/event API (Comlink) | Keeps AI turns and automation off the UI thread |
| UI shell | React 19 + Vite, Zustand for UI state, Radix primitives, Tailwind or CSS modules | Panels, dialogs, advisors, accessibility |
| Map renderer | three.js behind a `MapView` interface: chunked terrain meshes, splat shader, instancing, KTX2 textures, glTF models (§10.1) | 3D with a 2D fallback path |
| Audio | Howler.js (sprites, ambience loops, music crossfade) | Simple, robust |
| Persistence | IndexedDB (autosave ring + named saves), export/import as compressed JSON | Local-first |
| Tests | Vitest (engine), Playwright (UI), headless game runner in Node (§11) | Fast unit tests plus whole-game simulation |
| Tooling scripts | TS (tsx) for the importer and asset pipeline; Python only where the existing helpers already are (Sound Studio) | One language where possible |

---

## 5. Architecture

```
packages/
  data-schema/   Zod schemas + TS types for the rule set (units, buildings, techs, govts, civs, terrain, resources, difficulty, eras, world sizes, general rules)
  importer/      BIQ decompressor + parser, Civilopedia/text parser -> data/imported/*.json (gitignored)
  rules/         Default rule set = imported data + our corrections/annotations; validator
  engine/        Pure deterministic core: state, commands, turn pipeline, all mechanics. No DOM, no I/O.
  automation/    Governors, worker automation, build-queue templates, routines (§8). Emits ordinary engine commands.
  ai/            AI players (§7). Uses automation/ for its own cities and workers.
  sim/           Headless game runner (CLI + library), scripted players, invariant registry, tournaments, fidelity test vectors
  client/        React app + three.js map, worker bridge, audio, saves
  assets/        Asset manifests, generation prompts, processing scripts, generated atlases
```

Hard boundaries:

- **engine** knows nothing about UI, AI or automation. Everything changes state through `apply(state, command) -> {state, events}`; the turn pipeline is a fixed sequence of pure phases (production, growth, research, culture, disorder, upkeep, …).
- **All actors use the same command API**: the human, the AI, and the automation layer. So automation can never cheat, and AI can reuse player automation.
- **State is plain serialisable data** (no classes), so saves are just state + rule-set hash, and replays are seed + command log.
- **Queries** (yields, combat odds, corruption breakdown, "why can't I build this?") live in the engine as pure functions and return structured explanations the UI renders as tooltips.
- **Determinism**: lint-ban `Math.random`, `Date`, float transcendentals in engine/ai/automation; golden state hashes; PRNG stored in state.

---

## 6. Data extraction (Phase 0)

1. **Decompress BIQ.** `conquests.biq` starts with PKWARE DCL "implode" data (`00 06 …`). Port Mark Adler's `blast.c` (≈400 lines) to TS.
2. **Parse sections.** Known, documented layout (Conquests version): `BLDG, CTZN, CULT, DIFF, ERAS, ESPN, EXPR, GOOD, GOVT, RULE, PRTO, RACE, TECH, TFRM, TRRN, WSIZ, FLAV` (+ map sections, ignored for random maps). Write a typed reader per section with round-trip tests (parse → serialise → identical bytes).
3. **Text.** Parse `Civilopedia.txt` (`#KEY` blocks with `^`/`$LINK<…>` markup) and `PediaIcons.txt` into linked entries; `labels.txt` / `diplomacy.txt` for names and AI speech tables.
4. **Cross-check** extracted values against `Civ3ConquestsEdit` (you can open the editor to spot-check), and against the PTW/vanilla `.bic` files to record which rules each expansion changed.
5. **Rules not in the BIQ** (hardcoded in the exe): combat resolution, retreat, corruption formula, flip chance, golden-age trigger, leader generation, pollution, war weariness, AI behaviour. Source these from the well-documented community analyses (CivFanatics "Civ3 Combat Explained", corruption/OCN articles, culture-flip formula, etc.), record each in `docs/rules/<topic>.md` with its source and our confidence, and cover each with test vectors (§11).
6. **Curate.** Turn the raw import into our own committed rule set (`packages/rules`): our identifiers, our field names, notes per entry. Civilopedia text is used only to understand mechanics; all player-facing text is written new. No original art or audio is decoded.

Output: `data/imported/conquests.json` (+ `ptw.json`, `vanilla.json` for reference), text JSON, all gitignored. Importer is re-runnable with the install path from `.env`.

---

## 7. Rules scope (Conquests rule set)

Grouped by engine phase; each item ships with tests and a `docs/rules` page.

- **Map and terrain:** Civ3 isometric grid, world sizes (Tiny–Huge), Conquests terrain incl. marsh, flood plains, volcanoes, jungle, rivers (edge-based), coast/sea/ocean, landmarks off by default; resources (bonus/luxury/strategic, appearance by tech, depletion), goody huts, map generator with Civ3's parameters (land mass, water coverage, climate, temperature, age, barbarians).
- **Units:** movement with roads/rails/rivers, ZOC, terrain costs, stacks, fortify/sentry, upgrades, obsolescence, hit points by experience (conscript–elite), Conquests unit abilities (lethal land/sea bombard, stealth attack, hidden nationality, blitz, amphibious, enslave, draft, sacrifice, king units), air missions (bombard, recon, intercept, air superiority, precision strike), naval transport, nukes.
- **Combat:** Civ3 round-based combat with A/D/HP, terrain and fortification modifiers, river/city/fortress bonuses, retreat for fast units, bombard and defensive bombard, artillery, armies, great leaders (military) and scientific great leaders, unit promotion odds.
- **Cities:** worked tiles (21-tile fat cross), food box per size, aqueduct/hospital caps, specialists as defined in the CTZN section (entertainer, tax collector, scientist, policeman, civil engineer), production overflow, rush buying, whipping, drafting, pollution, plague off.
- **Empire economy:** commerce split, corruption and waste (distance + rank, OCN by world size and government, courthouse, police, Forbidden Palace / Secret Police HQ), building upkeep, unit support by government, trade routes via connected resources, harbours/airports.
- **Happiness:** content base by difficulty, luxuries, temples/cathedrals/colosseums, wonders, martial law, war weariness, disorder, We Love the King Day and rapture growth rules.
- **Science:** tech tree with eras, era advance, tech trading, minimum research time, scientific leaders.
- **Culture:** building culture with doubling at 1000 years, border expansion, culture flips and resistance, cultural victory.
- **Governments (C3C):** Anarchy, Despotism, Tribalism, Monarchy, Feudalism, Republic, Democracy, Communism, Fascism; revolution length, religious civs, senate and war weariness flags, tile penalty.
- **Civs:** all 31 civs with traits (Militaristic, Religious, Commercial, Industrious, Expansionist, Scientific, Agricultural, Seafaring), unique units with golden-age trigger, leader traits, colours.
- **Diplomacy and espionage:** contact, embassies, trades (tech, gold, gold per turn, maps, cities, resources, workers), alliances, right of passage, MPPs, ceasefire, reputation, embassy-based espionage (steal tech, sabotage, investigate city, propaganda, plant spies).
- **Wonders and small wonders:** all of them with Civ3 effects.
- **Victory (default set):** conquest, domination, space race, cultural, diplomatic (UN), histograph/score, plus PTW/C3C game modes regicide, mass regicide, elimination and victory points as options.
- **Barbarians and difficulty:** Chieftain–Sid with the DIFF section's AI bonuses.

Explicitly later or off: global warming nuance beyond the documented model, plague/disease (scenario-only), scenario-only flags (Capture the Princess, victory locations, timed respawns).

---

## 8. Player automation system (first-class)

Design principles: everything automation does is an ordinary command; it is **explainable** (each decision carries a reason the UI shows), **overridable** (manual action pauses the rule for that object until the player resumes), and **reusable** (the AI uses the same modules).

1. **City governors** — per city or per city group, chosen from presets (Growth, Production, Gold, Science, Culture, Balanced, Military Pump, Settler Pump) or custom weights. Manages tile assignment, specialists, avoids disorder and starvation, optionally manages rush-buy within a budget. Replaces Civ3's governor with transparent scoring.
2. **Build queues with templates** — queue templates ("New town", "Core city", "Coastal", "Frontier fortress") and conditional entries: `if no Temple and unhappy ≥ 2 → Temple`, `when size ≥ 12 → Hospital`, `if at war and defenders < 2 → best defender`. Templates can be auto-assigned to new or captured cities by rule.
3. **Worker automation** — global worker pool with priorities (connect resources and cities, irrigate food-limited cities, mine production cities, rail the core, clean pollution), per-region overrides ("never chop here", "leave forests near X"), job board so the player sees what each worker is doing and why. Fixes Civ3's worst habits (re-terraforming, wandering into danger).
4. **Unit routines** — explore, patrol routes, sentry with wake conditions, garrison targets per city ("keep 2 best defenders, upgrade when gold > N"), rally points that forward new units, auto-reinforce a front, auto-upgrade policy, escort transports, bombard stack routine, air superiority/intercept schedules.
5. **Empire policies** — automated tax/science/luxury targeting ("max science without disorder", "keep +X gold/turn"), auto-luxury during WLTKD pushes, trade-route keeper (warns when a resource connection breaks), automated diplomatic responses (accept/decline rules for trade offers under thresholds).
6. **Routine editor** — a simple trigger → condition → action rule builder (no code) covering the above, plus an import/export format so routines can be shared between games.
7. **Attention queue / turn digest** — instead of interrupting with every popup, the turn starts with a prioritised list: "3 cities finished builds (all handled by templates), 1 city in disorder next turn (governor could not fix it: why), enemy stack near Kyoto". One click jumps to each item.
8. **Delegation levels** — the player can hand whole aspects to automation (e.g. "domestic advisor runs all cities") and step back in anywhere.

The automation package is built after the core economy exists (Phase 5) but its command and explanation hooks are designed in Phase 1.

---

## 9. AI opponents

- **Structure:** layered planner per AI civ: grand strategy (expand, build, war, space) → operational plans (settle sites, war campaigns with target cities, naval invasions, defence) → tactical execution (stack movement, attack odds via the engine's combat query) → city management via `automation/` with AI-specific weights.
- **Civ3 character:** use the BIQ's per-civ flavours (aggression level, build-often/never flags, favourite/shunned governments) and DIFF handicaps (free units, content citizens, production/research cost factors) exactly as Civ3 does.
- **Diplomacy:** AI attitude model (Civ3's annoyed–gracious scale), reputation, trade valuation that does not get exploited by the classic "sell a tech to everyone" loop unless the difficulty allows it.
- **Fair information:** AI reads only what its own fog of war shows, except where Civ3's AI documented cheats apply at higher difficulties (configurable).
- **Measurement:** headless tournaments on seeds × difficulties; metrics: score curves, war declaration rate, expansion speed, invariant failures. A regression in tournament results blocks a merge.

---

## 10. UI/UX direction and asset pipeline

### 10.1 The 3D map, and how to keep it safe

**Why 3D is less scary than it sounds here.** The hardest art problem in a 2D Civ3-style map is terrain: dozens of hand-matched transition tiles per terrain pair, which an image model cannot keep consistent. In 3D that problem goes away, because terrain is one continuous mesh blended in a shader. The remaining 3D cost is models for units, cities and improvements, and we already have a headless Blender pipeline (AssetGenerator) that builds models from specs and checks them automatically.

**How it is built**
- **Library:** three.js (WebGL2, WebGPU when stable), driven from React through a thin imperative scene layer, not React Three Fiber, so per-frame work never touches React.
- **Camera:** a strategy camera, not a free camera. Fixed tilt around 50°, zoom from strategic overview to close-up, optional 90° rotation steps. Civ3's diamond grid becomes a square grid seen at an angle, so every rule about adjacency and tiles stays identical.
- **Terrain:** one heightmapped mesh per map chunk (e.g. 32×32 tiles), generated from the engine's tile data. A splat shader blends terrain textures (grassland, plains, desert, tundra, marsh, flood plain, snow) with noise so tile edges look natural. Hills and mountains are real height; rivers are carved along tile edges with an animated water material; coast, sea and ocean are depth-shaded water. Textures are seamless tiling materials generated with OpenRouter and post-processed into texture arrays.
- **Things on tiles:** forests, jungle, mines, irrigation, roads, railroads, fortresses, resources and huts use GPU instancing (thousands of trees cost one draw call). Roads and rails are generated ribbons along the network, not tiles.
- **Units:** low-poly stylised models with a shared skeleton per family (foot soldier, mounted, wheeled, ship, aircraft), animations idle/move/attack/die. Era variants change the mesh and colours, not the rig. Civ colours via a mask channel.
- **Cities:** procedural clusters of building models chosen by era, culture group and size, plus landmark meshes for built wonders, so a city visibly grows.
- **Fog and borders:** fog of war and culture borders are textures sampled by the terrain shader, updated per turn from engine data. Overlays (lenses, movement range, path preview, threat range) are also shader layers, cheap to toggle.
- **Strategic view:** at far zoom units and cities switch to clear flat icons (like the old game's readability), so a Huge map stays legible and fast.
- **Performance budget:** Huge map (Civ3 Huge is 180×180) at 60 fps on your RTX 5070 and ≥30 fps on integrated graphics at Standard size, via chunk culling, LODs and instancing.

**How the risk is contained**
- The engine never knows about rendering. The client talks to a `MapView` interface; a 2D isometric renderer could replace the 3D one without touching game code.
- **Phase 1 spike with go/no-go:** a Huge generated map with terrain, rivers, forests, 500 placeholder units and fog, measured against the budget above, plus three test models (a warrior, a galley, a city) through the full pipeline. If either fails, we fall back to 2D and lose about two weeks of renderer work, nothing else.
- Placeholder art (coloured meshes, simple shapes) is a supported state, so gameplay work never waits for art.

### 10.2 UI
- **Look:** clean modern strategy UI (think Old World / Humankind clarity) over the 3D map: dark translucent panels, crisp typography, era-tinted accents, smooth zoom from strategic overview to city detail.
- **Screens:** map + contextual side panel (selected unit/city/tile), city screen as a dashboard (tiles, citizens, queue with templates, yields breakdown), tech tree (zoomable graph with search and goal-pathing), domestic/trade/military/foreign/cultural/science advisors redesigned as dashboards with tables you can sort and act from, diplomacy screen with leader portraits, Civilopedia with deep links from every tooltip, histograph, victory progress.
- **Explainability:** every number hovers into its calculation ("Shields 14 = 18 base − 4 waste (distance 9, Monarchy)"); combat odds preview with the full modifier list.
- **Map layers/lenses:** culture borders, corruption heatmap, worker jobs, resource connections, unit threat ranges, governor focus, automation status icons.
- **Ergonomics:** full keyboard support (Civ3 hotkeys as default), undo for the last move where no hidden info was revealed, configurable animation speed, colour-blind safe palettes, UI scale, light/dark.

### 10.3 Art
- **Style bible first:** a reference sheet (palette, lighting, level of stylisation, material feel) generated and approved before batch work. Every 2D prompt includes it as an input image; the 3D material library follows the same palette.
- **OpenRouter client:** ported from Imager's `src/llm/` into a Node tool (`tools/openrouter`), keeping its rule that model limits come from the live API, never from guesses. Model choice per asset class is explicit in the manifest and picked by comparing a small batch from several models on the style bible first.
- **2D via OpenRouter image models** (key from `OPEN_ROUTER_KEY`): seamless terrain and material textures, leader portraits (31 leaders), wonder splash art, building/wonder/tech/resource icons, UI ornaments, Civilopedia illustrations, and concept sheets that serve as references for 3D models.
- **3D via the AssetGenerator Blender pipeline:** a JSON spec per model (unit, building piece, wonder, improvement), built headless, gated by automated checks (poly budget, scale, pivot, rig, silhouette), exported as `.glb` with renders for review. Image-model concept sheets feed the specs; textures come from the 2D pipeline.
- **Pipeline:** a manifest per asset class (id, prompt or spec, references, size, post-processing) → `pnpm assets:gen` (rate-limited, cached by input hash) → post-process (background removal, seamless tiling, compression to KTX2) → contact sheets for review. Provenance recorded per file (model, prompt, date).

### 10.4 Sound, music and voice
- **Voice (OpenRouter speech, via Imager's client):** optional short spoken lines for advisors and leader greetings, written new (never the original lines).
- **Music:** era themes from Sound Studio's Small-Music; OpenRouter music models are a second source to compare for the longer themes.
- **Effects and ambience: ByteDance Seed audio on OpenRouter first.** Prompts must start with "The sound of …" ("the sound of a fireball"); without the prefix the model speaks the words instead. The pipeline adds the prefix automatically and rejects clips that a quick check flags as speech. The local Sound Studio stays as a free second source; a short A/B round on ten representative effects picks the default per category.
- **Effect list (either source):**
- Drive `POST /generate` on `127.0.0.1:8765` from a manifest the same way: UI clicks and confirms, per-unit-class move/attack/death (melee, archery, gunpowder, artillery, armour, ships, aircraft), city founding, building complete, wonder complete fanfare, tech discovered, golden age, disorder, terrain ambiences per biome and era, short music beds and stingers per era (Small-Music, up to 120 s, loopable prompts). Several variations each to avoid repetition. Output copied into `client/public/audio` with a generated sprite map.

---

## 11. Quality strategy

- **Rule tests:** every formula has unit tests with hand-computed vectors; where possible, vectors taken from the original game (played in Civ3 and recorded: corruption per city, combat odds of known matchups, culture totals).
- **Invariants:** registry checked every turn in simulations (no negative food box, unit counts match support, borders consistent, …), designed new for this rule set.
- **Golden hashes:** fixed seeds → fixed final state hash; changes require a stated reason.
- **Headless games:** `pnpm sim` runs complete games in Node (any mix of AI, scripted and idle players, any map size, seed and difficulty) at full speed, with invariant checks every turn, replays from seed + command log, and machine-readable reports. Used for AI tuning, rule regression and performance budgets.
- **Tournaments:** AI vs AI over many seeds per PR touching rules/AI.
- **UI:** Playwright smoke flows (new game, found city, move, end turn, save/load, open every screen), plus visual snapshots of key screens.
- **Performance budgets:** AI turn time on Huge map, render fps at full zoom-out, save size.

---

## 12. Phases

Each phase ends playable and is driven through PRs. UI work runs alongside engine work in every phase rather than at the end.

| Phase | Content | Exit criteria |
|---|---|---|
| **0. Foundations** | Repo, workspace, lint/determinism rules, CI; BIQ decompressor + parser; Civilopedia parser; data schema; `docs/rules` skeleton | `pnpm import` produces validated JSON for all BIQ sections from your install; round-trip byte tests pass |
| **1. Map and movement** | State model, map generator with Civ3 parameters, terrain/resources/rivers, units, movement/ZOC, fog of war, worker terraforming; 3D map spike with placeholder art and the go/no-go check from §10.1; headless runner plays scripted games; save/load | Generate a Huge map, explore it, build roads; the spike meets the performance budget (or we switch to 2D) |
| **2. Cities and economy** | Founding, tiles, growth, production, specialists, commerce, corruption/waste, upkeep, happiness, science, governments and revolutions, culture and borders; city screen and advisors | A single-civ game to the modern era with correct yields against test vectors |
| **3. Combat and war** | Combat, bombard, experience, armies, leaders, capture/raze, barbarians, air and naval, war weariness, nukes | Combat odds match published Civ3 calculations; invariants clean over 1,000 simulated battles |
| **4. Rivals** | AI layers, diplomacy and trades, espionage, reputation, difficulty handicaps; diplomacy screen | AI-only tournaments finish 500 turns without stalls; AI wins at Monarchy+ against a passive player |
| **5. Automation** | Governors, build templates and conditions, worker automation, unit routines, empire policies, routine editor, attention queue | A 200-city late-game turn needs under 2 minutes of player input with automation on; every automated action shows its reason |
| **6. Complete Conquests rules** | All civs, traits and UUs, golden ages, great leaders (military + scientific), all wonders, culture flips, pollution/global warming, spaceship, UN, all victory types and game modes | Rules checklist §7 complete; every rule page has tests |
| **7. Art and audio** | Style bible, generated terrain/units/icons/leaders/cities, 3D models via the Blender pipeline, sound and music via Sound Studio | No placeholder art left in normal play; all events have sounds |
| **8. Polish and fidelity pass** | Balance comparison with original, tutorialised hints, performance, accessibility, Civilopedia complete | A full game on a Standard map plays start to finish without known rule deviations |

Suggested order for early value: 0 → 1 → 2 gives a playable empire-builder; 5 can start its governor and worker parts right after 2 because AI (4) reuses them.

---

### Versions

Starting with the first alpha (Phase 3), every shipped change set (a phase PR or a later
fix PR) is one build: it raises the version by exactly 0.001 (Phase 3 is 0.001) and adds a
short player-facing entry on top of `packages/client/src/changelog.json`. The title screen
shows the version and a "What's new" panel with the history, newest first; a test checks
the numbering. Every later phase keeps doing this.

### Phase 3 notes (combat and war, alpha 0.001)

Defaults picked where the plan left a choice, all documented in `docs/rules/`:
- Combat bonuses add up (not multiply); promotion 1 in 8 per victory, great leaders 1 in 16
  for elite winners; retreat at the round that would kill a faster unit.
- War and peace are immediate for both sides until Phase 4 diplomacy; barbarians are a
  player of their own, moved by the engine, and loot rather than hold cities.
- War weariness is our own points model (battles, losses, cities; decays a tenth a turn).
- Rival civilizations in the browser used the scripted `conqueror` player until Phase 4.
- Not yet: helicopter transport, hidden nationality, resistance and culture flips (Phase 6).

### Phase 4 notes (rivals, alpha 0.002)

Defaults picked where the plan left a choice ([diplomacy.md](rules/diplomacy.md),
[espionage.md](rules/espionage.md), [ai-handicaps.md](rules/ai-handicaps.md), [ai.md](ai.md)):
- Contact puts two civilizations at peace. A signed peace binds for 20 turns; declaring
  war while bound costs 40 reputation (alliance 40, protection pact 30, ceasefire 25, right
  of passage 20). Peace sends units home; ceasefires last 16 turns.
- The difficulty's cost factor applies to AI research only; humans pay Regent's. Content
  citizens are the same for everyone.
- Espionage costs base cost × 3 × (era + 1); chances are ours, propaganda uses the rule
  file's culture table.
- Civilizations are curated from the rule file (names, leaders, aggression, governments,
  build preferences); their traits, unique units and free techs take effect in Phase 6.
- Results (`pnpm --filter @civolution/sim tournament`): AI beat a passive builder at
  Monarch in 7 of 8 Tiny games (eliminated it in 6; island maps take up to 400 turns);
  AI-only games on Small (4 civs) and Standard (8 civs) maps ran 500 turns with no
  invariant failures at 20–80 ms a turn; Huge with 16 civs about 90–155 ms a turn.
- For Phase 5: AI economies are slow (medieval to industrial by turn 500, the shared
  Phase 2 city logic), stealth aircraft cannot pick a bombing target, traded resources need
  no route between capitals yet, and the trade network recomputed after every command is
  the largest remaining cost on big maps.

### Phase 5 notes (automation, alpha 0.003)

Defaults picked where the plan left a choice ([automation.md](automation.md)):
- Automation settings are part of the state (format 5; 0.002 saves load with defaults) and
  change through one `setAutomation` command. Seven aspects can be delegated (citizens,
  builds, workers, research, treasury, military, offers); a city's own governor or
  template works whether or not its aspect is delegated.
- Governors: eight presets plus custom weights; disorder is ended with entertainers, and
  luxury is raised only under the Celebrate rates policy. Rushing uses one empire budget
  per turn (not a budget per city) and never goes below the treasury reserve.
- Builds: a defender first in an undefended city, then the empire's settlers (up to the
  world size's optimal number, one in flight per two cities) and workers (1.5 per city),
  then the template; military templates skip settlers and workers.
- Workers: one pool, one worker per tile, no re-terraforming, two tiles of distance from
  visible enemies. Manual orders pause automation for that city or unit.
- The digest's input estimate is five seconds a decision plus five to end the turn.
  Exit test: a 200-city industrial empire, fully delegated, needs about ten seconds of
  input a turn; the automation pass takes about 0.1 s.
- Carry-overs done: trade networks are cached across commands, traded resources need a
  trade route between the capitals, stealth bombers single out a unit. AI cities use the
  Balanced governor and AI workers the pool.
- For Phase 6: AI economies are still slow; the governors and worker pool did not change
  tournament results, so the cause lies in AI build choices and expansion (cities stay at
  size 1–4 while pumping settlers). Huge with 16 AI civilizations averages about 160 ms a
  turn over 500 turns (slowest turn about 0.5 s); a profile should find the next cost now
  that the trade network is cached. Not yet: automation map lenses, auto-reinforcing a
  front, transport escorts, interception schedules, sentry wake conditions.

### Phase 6 notes (complete Conquests rules, alpha 0.004)

Defaults picked where the plan left a choice ([civilizations.md](rules/civilizations.md),
[golden-ages.md](rules/golden-ages.md), [leaders.md](rules/leaders.md),
[wonders.md](rules/wonders.md), [culture.md](rules/culture.md),
[pollution.md](rules/pollution.md), [spaceship.md](rules/spaceship.md),
[victory.md](rules/victory.md)):
- Civilizations come entirely from the rule file (traits, unique units via the unit
  availability mask, kings, free advances, city and leader names). Trait amounts are ours
  where the rule file has no number; matching building characteristics halve improvements.
- Golden ages: first unique-unit victory or wonders covering both traits; 20 turns of +1
  shield and +1 commerce on productive tiles. Scientific leaders: 10 % on a first discovery.
- Culture flips and pollution use our formulas with Civ3's inputs (low confidence); the
  garrison of a flipped city is lost. Resistance uses the rule file's culture table.
- Spaceship: own Apollo Program, 12 turns of flight, lost with the capital. UN: elections
  every 10 turns, a majority of all citizens wins. Regicide and elimination hand the
  loser's cities to whoever caused it.
- State format 6; 0.003 saves load with defaults. Every rule page has tests
  (`civs.test.ts`, `endgame.test.ts`, a sim game played until it is decided).
- AI: prefers its unique units, builds wonders that match its traits, runs the space race,
  lets cities reach size 4 before giving up settlers, builds a temple once entertainers
  are needed, and keeps army upkeep under a third of its taxes. Tournaments now play real
  civilizations and report victories (a conquest win came on turn 281 on Small).
- For Phase 7: AI economies are still slower than Civ3's (Small maps reach the industrial
  era by turn 500, sometimes the modern era); golden ages come in about half the games.
  A Huge map with 16 AI civilizations runs about 70 ms a turn over 300 turns (slowest 0.3 s);
  the profile puts pathfinding first (findPath ≈ 27 %, almost all of it re-planning gotos
  every turn in continueGoto), then city-site search (bestSite/siteScore ≈ 13 %, called
  from the AI's land-full check and planBuild). Caching paths per goto and site scores
  per turn are the next wins. Still open from Phase 5: automation map lenses, front
  reinforcement, transport escorts, interception schedules.

### Phase 7 notes (art and audio, alpha 0.005)

Defaults picked where the plan left a choice ([assets.md](assets.md),
[automation.md](automation.md)):
- Art: the earlier phases had already made every building, advance, resource, leader and
  most unit pictures, so Phase 7 filled the gaps (`manifests/phase7.json`): portraits for
  the unique units, the princess, the crusader and the ancient cavalry; kings show their
  civilization's leader portrait and the rule file's numbered copies of a unit
  (`impi128`, …) show the original's; a barbarian chieftain portrait.
- Terrain: thirteen generated seamless ground textures (a new `seamless` post-step in the
  generator) packed into one texture array and sampled at two scales; the palette shading
  stays for slopes, snow, shores and fog, and shows if the textures are missing.
- 3D: fortresses and barricades are now on the map; the war elephant and the camel rider
  are new `civ.mounted` kinds. Other unique units keep the closest standard model (the
  hoplite the spearman's, the panzer the tank's), and leaders share the great leader.
  The strategic zoom keeps its flat team-coloured tokens by design (§10.1).
- Sound: `sounds.ts` gives every engine event a sound (or names the one that covers it,
  like the end-turn button for `playerEndedTurn`), one per batch by tier; move sounds per
  unit class; UI click, open, close and select. Music: an era bed (three variations each)
  and a title theme (the modern era has one: Seed Audio rejected the other two prompts); ambience follows the terrain under the camera (cities override it)
  and goes quiet at strategic zoom. Music and ambiences come from Seed Audio, not Sound
  Studio, so the whole set is generated one way. Volumes per channel live in the browser.
- Calendar: the rule file's seven spans cover 440 turns to AD 1951; after them the
  calendar runs one year a turn (Civ3's behaviour), so turn 540 is AD 2050.
- Speed: goto orders keep their planned route between turns (golden hash changed for
  that), site scores are cached per state, and explorers stop searching once no tile can
  beat the best. Huge with 16 AI civilizations: about 42 ms a turn over 300 turns (was
  about 70), slowest turn about 0.2 s.
- Automation carry-overs done: `front`, `escort:<unit>` and `airDefence` routines with
  unit-panel orders (Q, E, Shift+I) and the automation lens (Ctrl+K). Sentry wake
  conditions beyond "a foreign unit in sight" are still open.
- For Phase 8: AI economies are still slower than Civ3's; the next profile targets are
  bestSite from the AI's land-full check (about 15 %) and city reports in the governors.
  The Chinese leader portrait is Arnd's call and unchanged.

### Phase 8 notes (polish and fidelity, alpha 0.006)

Defaults picked where the plan left a choice ([rules/README.md](rules/README.md) "Known
deviations", [ai.md](ai.md), [assets.md](assets.md)):
- Civilopedia (F10, a "?" beside names, right-click in build lists and the science
  advisor): a page for every rule-set entity plus 31 game-concept articles. Facts are read
  from the rule set; the prose (`packages/client/src/pedia/text`) is written new for this
  project. Numbered rule-file copies of a unit share the original's page.
- Tutorial hints: six advisors (generated portraits) speak once per situation (founding,
  research, workers, disorder, contact, war, government, corruption, culture, pollution,
  …); seen hints live in the browser; off under browser automation so tests stay stable.
- Accessibility: interface size 80–150 % (panels only, not the map), light theme,
  Okabe–Ito civilization colours for colour-blind players (applied to the UI's copy of the
  state; saves keep the originals), reduce motion (follows the system setting by default),
  visible keyboard focus. Q and E give the unit's order when it has one, else turn the camera.
- Rule fidelity: drafting (Nationalism, the government's draft limit, conscripts, 20
  turns of unhappiness), SAM batteries, wall and coastal-fortress bombard defence,
  Philosophy's free advance, Satellites' map, unique units in the starting set, half the
  shields back for disbanding in a city, harbour water trade and second seats read from
  data. Rate caps stay at 100 %: the Conquests file has no lower ones. Unused fields are
  listed as known deviations (submarine stealth, airfields/outposts/radar towers,
  resource depletion, xenophobia, mobilisation and a few more).
- Villages release no barbarians while a civilization has one city (our default: two
  village warriors used to end games around turn 15).
- AI: the first three cities start settlers at any size, cities raising settlers use the
  Growth governor, threatened cities draft. Balance against Civ3 (Standard, 8 civs,
  Monarch, two seeds): the first AI reaches the Middle Ages around turn 165–170
  (AD 500), the industrial era around turn 265–290 (AD 1360–1490), and in one game of two
  the modern era at turn 383 (AD 1835). Civ3's AIs are earlier, mostly because their
  empires are bigger by turn 100 (here 3–4 cities on average). Expansion is the next lever.
- Speed: city reports are cached per state, site scores and tile values per turn, the
  site search tests cheap things first, governors reuse their last report, a march tries
  one route search. Huge with 16 AIs is about 28 ms a turn without invariant checks
  (45 ms with them) while the AIs now run bigger empires.
- Exit test: a Standard map with eight AI civilizations plays to its end with invariants
  checked every turn (`sim.test.ts`, about 30 s); refused commands are reported by reason.
- Art and sound: advisors, worker-job medallions, a picture per Civilopedia topic and
  era, the Civilopedia cover, hint and page sounds (`manifests/phase8*.json`). Seed
  Audio's moderation rejected the two extra modern-era music beds again (eight tries,
  two prompts), so the modern era keeps one track.
- Still open: AI gotos towards targets it cannot reach (refused, about 5 % of AI
  commands), more sentry wake conditions, the AI's expansion pace, the Chinese leader
  portrait (Arnd's call).

## 13. Deferred

Mods and rule-set editing UI, scenarios (custom BIQs, maps, Conquests campaigns), multiplayer (hotseat, PBEM, online), loading original `.SAV`/`.BIQ` maps as starting positions, mobile layout beyond basic responsiveness.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Hardcoded Civ3 rules are only known from community research and may be incomplete | Document source and confidence per rule; record test vectors from the original game; mark guesses openly |
| Consistent art across ~500 assets | Style bible with reference inputs; terrain blended in a shader instead of drawn transitions; shared rigs per unit family; contact sheets per batch |
| 3D performance or art cost too high | `MapView` interface and the Phase 1 go/no-go spike; placeholder art is a supported state |
| AI quality is the largest effort sink | Share automation modules with the AI; measure with tournaments from Phase 4; ship difficulty handicaps as Civ3 did |
| Late-game performance (Huge maps, 31 civs) | Engine in a worker, incremental caches for yields and paths, performance budgets in CI |
| Copyright (the repo is public) | D2: raw imports gitignored; only our own curated numbers and newly written text and art are committed; the exe and install files never enter the repo |
