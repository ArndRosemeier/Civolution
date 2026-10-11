# Culture and borders

**Status:** draft (Phase 2) · **Confidence:** high for culture points, medium for border shapes

## Culture points

Each turn a city adds the culture of its buildings and wonders (rule file `culture`:
Palace 1, Temple 2, Library 3, Cathedral 3, wonders 2–8). A building's culture doubles once
it has stood for 1000 years by the game calendar (50 years a turn at first, so after 20
turns early in the game). The civilization's culture is the sum of everything its cities
ever produced. Culture flips and cultural victory arrive in Phase 6.

## Borders

A city's border is ring 1 (the 3 × 3 block) when founded and grows by one ring at each
culture threshold: 10, 100, 1000, 10000, 20000, 40000, 80000 points. Ring *r* holds the
tiles with du² + dv² ≤ r(r + 1) on the rotated grid, so ring 2 is exactly the 21-tile work
area and later rings grow roughly as circles.

A tile in several rings goes to the closest city, then to the city with more culture, then
to the older city. A city's own tile is always its owner's. Borders decide which tiles a
city may work ([cities.md](cities.md)) and where resources count
([trade.md](trade.md)); a player always sees their own territory.

*Confidence: medium.* The Civilopedia gives the thresholds 10, 100, 1000, 10000, 20000
"etc."; we double from there. The ring shapes are our approximation of Civ3's border
growth.

## Calendar

Turn 1 is 4000 BC. The rule file's time scale gives 25 turns of 50 years, 25 of 40, 40 of
25, 50 of 20, 100 of 10, 100 of 5, then 2 years a turn; there is no year 0
(`calendar.ts`).

## Test vectors

`packages/engine/test/cities.test.ts`: Palace + Temple make 3 points a turn and the border
reaches the 21-tile ring 2 after four turns at 12 points; calendar years at turns 1, 26,
91, 128 and 129.
