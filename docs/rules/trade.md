# Trade network and resources

**Status:** draft (Phase 2) · **Confidence:** medium

## Connections

Two cities of a player are connected when (`empire.ts`, `tradeNetwork`):
- a chain of road or railroad tiles links them (city tiles count as road), through tiles
  that are not another civilization's territory; or
- both have a building with `allowsWaterTrade` (the Harbor, or what acts as one) and a
  water route joins them: coast always, sea once a tech with
  "enables sea trade" is known (Astronomy), ocean with "enables ocean trade" (Navigation,
  Magnetism).

Rivers do **not** connect cities or resources: only roads, railroads and harbour sea links
do. *Source: owner's ruling 2026-10-11.*

Airports join the network with air trade in a later phase.

Being connected to the capital does not change corruption: an unconnected city uses its
real distance ([corruption.md](corruption.md)). *Source: owner's ruling 2026-10-11.*

## Resources

A luxury or strategic resource counts for the network it lies on when its tile is inside
the player's borders, the player can see it (strategic resources need their tech), and the
tile is either on the network (road or railroad; a river is not enough) or in the work area of one of the
player's cities. Every city on that network can use it: luxuries make people happy
([happiness.md](happiness.md)), strategic resources allow units and buildings. Resources a
scenario grants (`player.resources`) count everywhere. Worker jobs that need a resource
(railroads need Iron and Coal) look at what the capital's network has.

Colonies on resources outside the borders arrive in a later phase.

## Trade between civilizations (Phase 5)

A luxury or strategic resource changes hands in a deal only along a trade route between
the two capitals (`tradeRoute`): roads and railroads (not rivers) through either side's
territory or unclaimed land, or the water between harbour cities of either side (sea and
ocean as either side's techs allow). A delivered resource reaches the receiver only while
the route stands; the deal itself runs on, and the turn digest reports the loss.

## Sources

Civilopedia *Trade* ("Domestic Trade", "Trade Route Connections", "Water Routes") and
*Territory*; rule file tech flags for sea and ocean trade.

## Open questions

- Whether Civ3 counts a resource in a city's work area as connected without a road (we do).
