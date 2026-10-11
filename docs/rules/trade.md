# Trade network and resources

**Status:** draft (Phase 2) · **Confidence:** medium

## Connections

Two cities of a player are connected when (`empire.ts`, `tradeNetwork`):
- a chain of road or railroad tiles links them (city tiles count as road), through tiles
  that are not another civilization's territory; or
- a chain of river tiles links them (rivers carry trade as roads do); or
- both have a Harbor and a water route joins them: coast always, sea once a tech with
  "enables sea trade" is known (Astronomy), ocean with "enables ocean trade" (Navigation,
  Magnetism).

Airports join the network with air trade in a later phase.

A city not connected to the capital counts as far away for corruption
([corruption.md](corruption.md)).

## Resources

A luxury or strategic resource counts for the network it lies on when its tile is inside
the player's borders, the player can see it (strategic resources need their tech), and the
tile is either on the network (road, railroad, river) or in the work area of one of the
player's cities. Every city on that network can use it: luxuries make people happy
([happiness.md](happiness.md)), strategic resources allow units and buildings. Resources a
scenario grants (`player.resources`) count everywhere. Worker jobs that need a resource
(railroads need Iron and Coal) look at what the capital's network has.

Colonies on resources outside the borders, and trading resources with other
civilizations, arrive with diplomacy in Phase 4.

## Sources

Civilopedia *Trade* ("Domestic Trade", "Trade Route Connections", "Water Routes") and
*Territory*; rule file tech flags for sea and ocean trade.

## Open questions

- Whether Civ3 counts a resource in a city's work area as connected without a road (we do).
- Rivers as trade routes: Civ3 connects along river edges; we connect river tiles that are
  neighbours.
