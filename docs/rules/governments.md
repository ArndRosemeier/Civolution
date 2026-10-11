# Governments, revolution and unit support

**Status:** draft (Phase 2) · **Confidence:** high for the table, low for anarchy length

## Governments

All values from the rule file (`packages/rules/data/conquests.json`, `governments`):

| | Needs | Corruption | Tiles | Hurry | Workers | Free units (town/city/metro) | Gold per extra unit | Police |
|---|---|---|---|---|---|---|---|---|
| Anarchy | – | catastrophic | −1 above 2 | none | ×1 | 0/0/0 | 1 | 0 |
| Despotism | – | rampant | −1 above 2 | forced labour | ×2 | 4/4/4 | 1 | 2 |
| Monarchy | Monarchy | problematic | | gold | ×2 | 2/4/8 | 1 | 3 |
| Feudalism | Feudalism | problematic | | forced labour | ×2 | 5/2/1 | 3 | 3 |
| Communism | Communism | communal | | forced labour | ×2 | 6/6/6 | 1 | 4 |
| Fascism | Fascism | nuisance | | forced labour | ×4 | 4/7/10 | 1 | 4 |
| Republic | The Republic | nuisance | +1 commerce | gold | ×2 | 1/3/4 | 2 | 0 |
| Democracy | Democracy | minimal | +1 commerce | gold | ×3 | 0/0/0 | 1 | 0 |

The worker column is the work-rate multiplier used in [workers.md](workers.md).
War weariness (Republic low, Democracy high) arrives with war in Phase 3.

## Revolution

Changing government (`revolution`) starts Anarchy for 2–5 turns (random), capped by the
difficulty's maximum transition time where it has one (Monarch 4, Emperor 3, Demigod and
Deity 2, Sid 1). The new government takes over at the start of the turn the anarchy ends.
Changing the target during anarchy keeps the end turn. Rates are clamped to the new
government's cap.

*Confidence: low* for the 2–5 range; Civ3's anarchy length is random and religious
civilizations have shorter anarchy (Phase 6).

## Unit support

Every military unit (attack or defence above 0) counts. The government supports, for free,
its per-town, per-city and per-metropolis number for each city; every unit beyond costs
the government's gold per unit each turn. Workers, settlers and explorers are free.
Computer players get the difficulty's extra free support ([ai-handicaps.md](ai-handicaps.md)).

## Sources

Rule file `GOVT` section; Civilopedia *Governments*, *Unit Support*, *Revolution*,
government entries.

## Test vectors

`packages/engine/test/cities.test.ts`: revolution goes through 2–5 turns of anarchy, no
science during anarchy, unit support (6 warriors in one town: 2 gold under Despotism, 10
under the Republic).
