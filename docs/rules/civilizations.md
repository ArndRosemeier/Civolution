# Civilizations

**Status:** draft (Phase 6) · **Confidence:** high for what the rule file stores, medium for trait effects

## Rule

Each of the 31 civilizations comes from the rule file: names, leader, culture group,
temper, favourite and shunned government, two traits, its unique unit, its king unit, two
free advances, city names and great-leader names (`packages/rules`, `civs`).

**Free advances.** A civilization starts with its two free advances (Rome: Warrior Code
and Alphabet).

**Unique units.** A unit's `availableToMask` says which civilizations build it (bit = the
civilization's place in the rule file). A civilization builds the units whose bit it has,
so its unique unit replaces the common one (Rome builds the Legionary, never the
Swordsman); scouts are available only to the expansionist civilizations. Players without
a civilization (tests, scenarios) build the units available to at least half of the
civilizations. Upgrade lines skip other civilizations' unique units (a Roman Warrior
upgrades to a Legionary, anyone else's to a Swordsman). Leaders, armies, kings and the
second entries of repeated names (variants the game makes itself) are never built.

**City names** come from the civilization's list in order (the first is the capital),
then from a shared list of historical places; a name is never used twice in one world.

**Traits.** Every building carries characteristics; an improvement whose characteristic
matches one of the builder's traits costs half (temples for religious civilizations,
libraries for scientific ones). Wonders never get the discount; their characteristics
count toward golden ages instead ([golden-ages.md](golden-ages.md)).

| Trait | Characteristic | Effect (ours where Civ3's is not in the rule file) |
|---|---|---|
| Militaristic | military installation | Promotion odds doubled (1 in 4 instead of 1 in 8) |
| Religious | place of worship | Anarchy lasts one turn |
| Commercial | trade installation | +1 commerce on tiles already making 2; 25 % more optimal cities (less corruption) |
| Industrious | construction installation | Workers 50 % faster; +1 shield on the city tile from size 7 |
| Expansionist | exploration installation | Starts with a scout; builds scouts |
| Scientific | research installation | A free advance with each new era; scientific great leaders ([leaders.md](leaders.md)) |
| Agricultural | agricultural installation | +1 food on the city tile (land cities) |
| Seafaring | seafaring installation | Ships move one tile farther |

The agricultural and seafaring characteristics are rule-file bits the importer does not
name (`other` bits 10 and 11); we read them from the buildings that carry them (Aqueduct,
Harbor, …).

## Sources

Rule file `RACE` (traits, free techs, king unit, names, `uniqueCivCounter`), `PRTO`
`availableTo`, `BLDG` characteristic flags. Trait effects follow the Civilopedia's
descriptions; the exact amounts are ours where the rule file has no number.

## Test vectors

`packages/engine/test/civs.test.ts`: unique units per civilization, scouts and free
advances, city and leader names, half-cost temples and libraries, commercial tile
commerce, agricultural city tiles and industrious workers (road in 2 turns instead of 3),
one-turn religious anarchy, seafaring ship movement, the scientific free advance.

## Open questions

- Civ3's trait list changed between versions (commercial corruption, industrious city
  shields); we use one consistent reading.
