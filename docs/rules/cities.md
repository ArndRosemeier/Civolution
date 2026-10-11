# Cities: founding, tiles, growth and specialists

**Status:** draft (Phase 2) · **Confidence:** high for tiles and limits, low for the food box

## Founding

- A unit with the *build city* action (the Settler) founds a city on its tile when it has
  movement left. The terrain must allow cities (not water, mountains or volcanoes), the
  tile must not be inside another civilization's borders, and no city may be within one
  tile: cities need at least one tile between them.
- The new city has size 1, a road on its tile and a border of ring 1. The player's first
  city (any city founded while they have no Palace) gets the Palace.
- Settlers and Workers can *join* a city, adding their population cost to its size,
  as long as the city stays within its size limit.
- City names come from a list of historical places until civilizations bring their own
  (Phase 6).

## Work area and tiles

The work area is the 21-tile "fat cross": the 5 × 5 block on the rotated grid without its
four corners (`territory.ts`, `cityRadiusTiles`). A city can work a tile in its work area
only when the tile is inside its owner's borders (Civilopedia, *City Radius*), not worked
by another city, not a city tile and not held by foreign units. Where two cities' borders
compete over a tile, it goes to the city with the most influence on it, culture points ÷
distance to the tile (at least 1), ties to the older city; a city tile always belongs to
its owner ([culture.md](culture.md)). *Source: owner's ruling 2026-10-11.*

The city tile is always worked and yields:
- the terrain, resource, river and road as for any tile;
- irrigation where the terrain can be irrigated, even without fresh water;
- at least 1 shield.

Every citizen either works a tile or is a specialist. Government and buildings change tile
yields after the terrain (`city.ts`, `cityTileYield`):

| Effect | Rule |
|---|---|
| Despotism, Anarchy tile penalty | each yield above 2 is reduced by 1, except while the city celebrates |
| Republic, Democracy commerce bonus | +1 commerce on tiles that already yield commerce |
| Harbor | +1 food on water tiles |
| Offshore Platform | +1 shield on water tiles |
| Commercial Dock | +1 commerce on water tiles that already yield commerce |
| Colossus | +1 commerce in its city on tiles that already yield commerce |

## Placing citizens

Unless the player places citizens by hand (`setCitizens`), a city places its own
(`governor.ts`): each citizen takes the best free tile, valuing food most while the city
would end below +2 food, shields when production lags (under one shield per two
citizens), and then food 4 : shields 3 : commerce 2. Citizens without a useful tile become
entertainers. Then, as in Civ3 with *avoid disorder* switched on, the least useful
laborers become entertainers until the city is not in disorder. Cities that place their own
citizens re-place them at the start of every end of turn.

Hand placement stays until the player switches the city back to automatic
(`autoCitizens`); when such a city grows or loses tiles, the new or displaced citizens are
placed by the same rules and the player's specialists are kept.

## Growth

Each citizen eats `foodPerCitizen` (2) food. The surplus goes into the food box; when the
box holds `foodBox(size)` the city grows by one and the box empties. A Granary keeps half
of the new box. With Longevity a city grows by two. A deficit takes food out of the box; a
city whose box would go below zero shrinks by one and the box empties (a size-1 city stays
at size 1).

**Food box:** 10 × (size + 1): 20 at size 1, 70 at size 6, 80 at size 7.
*Confidence: low.* The rule file does not store the food box and we have not recorded the
original's values yet; this formula gives Civ3-like early growth and is the first thing to
fit against recorded games.

**Size limits:** a *town* is size 1–6 (`maxTownSize`), a *city* 7–12 (`maxCitySize`), a
*metropolis* 13 and up. A town cannot grow past 6 without an Aqueduct, unless it sits on a
river or next to a fresh-water lake. Past 12 a city needs a Hospital (or Shakespeare's
Theater). A full box at the limit stays full.

## Specialists

From the rule file's citizen types: Entertainer (+1 luxury), Tax Collector (+2 gold),
Scientist (+3 beakers), Policeman (one step of corruption reduction, needs Nationalism),
Civil Engineer (+2 shields toward buildings and wonders, needs Replaceable Parts).
Specialists work no tile, eat like everyone else and have no mood.

## Sources

- Rule file: terrain yields, general rules (food per citizen, town and city size limits),
  citizen types, building flags (`allowsCitySize2/3`, `doublesCityGrowth`, water bonuses).
- Civilopedia: *City Radius*, *Food*, *Specialists*, Aqueduct, Hospital, Granary entries.

## Test vectors

`packages/engine/test/cities.test.ts`: founding, the city tile on grassland (2/1/1 under
Despotism, 3/1/1 under Monarchy), the Despotism penalty on irrigated wheat, the Republic
bonus, growth in 10 turns at +2, the Granary, the size-6 cap.

## Open questions

- The real food box sizes per city size and difficulty.
- Whether Civ3 lets a starving size-1 city die (we keep it at size 1).
