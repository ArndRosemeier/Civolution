# Culture and borders

**Status:** draft (Phase 2, flips Phase 6) · **Confidence:** high for culture points, medium for border shapes, low for flip odds

## Culture points

Each turn a city adds the culture of its buildings and wonders (rule file `culture`:
Palace 1, Temple 2, Library 3, Cathedral 3, wonders 2–8). A building's culture doubles once
it has stood for 1000 years by the game calendar (50 years a turn at first, so after 20
turns early in the game). The civilization's culture is the sum of everything its cities
ever produced. Cultural victory: [victory.md](victory.md).

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

## Nationality and resistance

A city's people belong to the civilization that founded it (`nationality`). When a city is
captured, each citizen resists with the `initialResistanceChance` of the rule file's
culture table for how its people see the conqueror (by the two civilizations' culture
ratio: in awe 40 %, … disdainful 90 %). Retaking a city of your own people meets no
resistance. While anyone resists, the city produces no shields, gold, science or luxury
and does not grow. Each turn each resister keeps resisting with the table's
`continuedResistanceChance`, and every two military land units in the city quell one more.

## Culture flips

A city may join a neighbour whose culture outweighs its own (`culture.ts`, shown on the
city screen with its reasons). Influence on a city is, for each civilization, the sum over
its cities within 8 tiles of (city culture + 10 × size) ÷ distance (the city itself counts
at distance 1). Capitals never flip. With the strongest foreign influence at least twice
the home influence, the chance per turn is:

- (ratio − 100 %) ÷ 50, plus
- the culture table's propaganda success ÷ 5 for how its people see that civilization,
- +5 in civil disorder, +5 with resisters, +5 when its people are that civilization's,
- −2 per military land unit in the city,

clamped to 0–20 %. A flipped city keeps its buildings except small wonders; the garrison
that failed to hold it is lost, as in Civ3. Flips can be switched off in the game options.

*Confidence: low.* The inputs (culture ratio, distance, unrest, nationality, garrison) are
Civ3's; the weights are ours.

## Calendar

Turn 1 is 4000 BC. The rule file's time scale gives 25 turns of 50 years, 25 of 40, 40 of
25, 50 of 20, 100 of 10, 100 of 5, then 2 years a turn; there is no year 0
(`calendar.ts`).

## Test vectors

`packages/engine/test/endgame.test.ts`: a resisting city makes nothing and six defenders
quell it in a turn; captures start resistance, retaking your own people's city does not;
flip odds need twice the home influence, capitals and switched-off games never flip, a
garrison lowers the odds, and a flip hands the city over and loses its garrison.

`packages/engine/test/cities.test.ts`: Palace + Temple make 3 points a turn and the border
reaches the 21-tile ring 2 after four turns at 12 points; calendar years at turns 1, 26,
91, 128 and 129.
