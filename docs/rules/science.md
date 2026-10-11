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
rule file). During Anarchy all commerce goes to luxury and there is no research.

## Treasury

Each turn: gold += tax − building upkeep − unit support
([governments.md](governments.md)). When the treasury would go negative, the building
with the highest upkeep is sold and the debt is written off.

## Research cost

Beakers for a tech = cost factor (rule file, in tens) × the difficulty's cost factor
(Regent 10) × the world size's tech rate / 100 (Tiny 160 … Huge 400).
Bronze Working on a Tiny map at Regent: 3 × 10 × 160 / 100 = 48 beakers.

Research takes at least `minimumResearchTime` (4) turns per advance; beakers beyond the
cost are lost when the advance arrives. After `maximumResearchTime` (50) turns on one
advance it arrives regardless. Beakers collected without a target are kept for the next.
Civ3 also makes a tech cheaper when known civilizations already have it; that waits for
contact and diplomacy (Phase 4).

## Eras

Conquests splits the tree by era: the first techs of a new era have no prerequisites in the
rule file. A player enters the next era once they know every tech of their current era not
flagged "not required for era advance"; techs of later eras cannot be researched before.
The Theory of Evolution grants two free advances.

## Sources

Rule file: tech costs, eras, prerequisites and flags, difficulty cost factors, world-size
tech rates, minimum and maximum research time, specialist values, building flags.
Civilopedia: *Research*, *Treasury*, *Commerce*.

## Test vectors

`packages/engine/test/cities.test.ts`: Bronze Working costs 48 on Tiny/Regent; a tech
needs four turns even with beakers to spare and the spare beakers are lost; Monotheism
opens only with the Middle Ages. `packages/sim/test/sim.test.ts`: a single civilization
reaches the Modern era.

## Open questions

- Whether Conquests' cost formula has an extra term per tech already known.
- The real rate caps per government (the rule file stores 100 % for all).
