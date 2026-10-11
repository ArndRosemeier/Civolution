# Commerce, research and eras

**Status:** draft (Phase 2) · **Confidence:** high for eras, medium for costs

## Commerce

After corruption, a city's commerce is split by the player's rates (in tens of percent,
adding up to 100 %): luxury and science are taken rounded down, tax gets the rest.
Specialists add their gold, beakers and luxury. Then buildings multiply:
- tax: +50 % each for Marketplace, Bank, Stock Exchange;
- science: +50 % each for Library, University, Research Lab; +100 % in the city of
  Copernicus' Observatory, Newton's University or the SETI Program;
- luxury: +50 % with a Marketplace.

No single rate may exceed the government's cap (100 % for every Conquests government in the
rule file; see [governments.md](governments.md#rate-cap)). During Anarchy all commerce goes to luxury and there is no research.

## Treasury

Each turn: gold += tax − building upkeep − unit support
([governments.md](governments.md)). When the treasury would go negative, the building
with the highest upkeep is sold and the debt is written off.

## Research cost

Beakers for a tech = cost factor (rule file, in tens) × a cost factor × the world size's
tech rate / 100 (Tiny 160 … Huge 400). Humans use Regent's factor (10) at every level;
computer players use the difficulty's ([ai-handicaps.md](ai-handicaps.md)).
Bronze Working on a Tiny map at Regent: 3 × 10 × 160 / 100 = 48 beakers.

Research takes at least `minimumResearchTime` (4) turns per advance; beakers beyond the
cost are lost when the advance arrives. After `maximumResearchTime` (50) turns on one
advance it arrives regardless. Beakers collected without a target are kept for the next.
A tech costs up to 30 % less when the civilizations you have met already know it
([diplomacy.md](diplomacy.md)).

## Eras

Conquests splits the tree by era: the first techs of a new era have no prerequisites in the
rule file. A player enters the next era once they know every tech of their current era not
flagged "not required for era advance"; techs of later eras cannot be researched before.

## Free advances

A free advance (the first civilization to Philosophy, a scientific civilization entering a
new era, the Theory of Evolution) is the advance currently being researched: it arrives at
once and the beakers already put into it are kept for the next research. When nothing is
being researched, the free advance is a free pick instead. A source that gives two advances
(the Theory of Evolution) gives the advance being researched plus a free pick.

A free pick is owed to the player (`freeAdvances` on the player) until it is chosen: the
player picks any advance it can research, and it is learned at once. A human is asked (the
science advisor opens and the next advance chosen there is the free one; `setResearch`
spends the credit); computer players choose with their normal research choice
(`planResearch`). `grantFreeAdvance` and `oweFreeAdvance` in
`packages/engine/src/cities.ts`.

Source: owner's ruling 2026-10-11.

**Conquests tech flags the importer leaves unnamed** (`flags` holds them as `bitN`):

- `bit21` (Philosophy), the "bonus tech": the first civilization to discover it gets a
  free advance (see [Free advances](#free-advances); `learn` in `packages/engine/src/cities.ts`).
- `bit22` (Satellites), "reveal map": its discoverer sees the whole map once.

*Confidence: medium.* The Conquests editor lists these two flags after the 19 the importer
names (with "cannot be traded" and "permits sacrifice", which no Conquests advance sets);
which advances carry them matches the games' Philosophy and Satellites behaviour.

## Sources

Rule file: tech costs, eras, prerequisites and flags, difficulty cost factors, world-size
tech rates, minimum and maximum research time, specialist values, building flags.
Civilopedia: *Research*, *Treasury*, *Commerce*.

## Test vectors

`packages/engine/test/cities.test.ts`: Bronze Working costs 48 on Tiny/Regent; a tech
needs four turns even with beakers to spare and the spare beakers are lost; Monotheism
opens only with the Middle Ages. `packages/engine/test/ruledata.test.ts`: Philosophy's free
advance is a free pick owed and spent by the next choice. `packages/engine/test/civs.test.ts`:
the Theory of Evolution gives the advance being researched (its beakers kept) and a free
pick. `packages/sim/test/sim.test.ts`: a single civilization
reaches the Modern era.

## Open questions

- Whether Conquests' cost formula has an extra term per tech already known.
- Rate caps: settled, the rule file stores 100 % for all governments (governments.md).
