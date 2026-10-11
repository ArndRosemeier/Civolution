# Corruption and waste

**Status:** draft (Phase 2) · **Confidence:** medium for the structure, low for the constants

## Rule

Corruption takes commerce and waste takes shields, at the same rate per city
(`city.ts`, `corruptionRate`), before commerce is split into tax, science and luxury.
Waste is halved while a city celebrates.

**Seats of government:** the capital (Palace) has no corruption. Cities with a Forbidden
Palace, or a Secret Police HQ under Communism, are secondary seats: distance is measured to
the nearest seat. The engine finds them by their rule data (small wonders with
`reducesCorruption`, only under their `requiredGovernment` if they have one); the capital
is the city with the Palace (`centerOfEmpire`), looked up by its id.

**Optimal city number (OCN):** the world size's optimal cities × the difficulty's
percentage (Regent 90 %, so 18 on a Standard map, 12 on a Tiny one).

**Rate** for a city at distance *d* from the nearest seat and corruption rank *r* (0 for
the capital, then cities by distance to a seat):

1. Distance part = 50 × min(d, D) / D, where D = (map width + map height) / 4 tiles (30 on
   Tiny, 50 on Standard). A city not connected to the capital by the trade network
   ([trade.md](trade.md)) counts as d = D.
2. Rank part = 50 × min(r, OCN) / OCN, plus 50 × (r − OCN) / OCN beyond the OCN.
3. The government's level scales both parts:

| Level (rule file) | Governments | Rate |
|---|---|---|
| Minimal | Democracy | 40 % of the rank part only (distance does not matter) |
| Nuisance | Republic, Fascism | 60 % of both parts |
| Problematic | Monarchy, Feudalism | 75 % |
| Rampant | Despotism | 90 % |
| Catastrophic | Anarchy | a flat 90 % |
| Communal | Communism | a flat 30 % everywhere but the capital |

4. The difficulty's corruption percentage (100 at every level in Conquests).
5. Reductions, in order: Courthouse −50 %, Police Station −25 %, each Policeman −10 %.

Corruption = commerce × rate / 100 (rounded down); waste = shields × rate / 100.

## Sources

- Rule file: government corruption levels, difficulty OCN and corruption percentages, world
  size optimal cities, the Courthouse and Police Station flags, the Policeman's corruption
  value.
- Civilopedia *Corruption*: distance from the capital, number of cities, government,
  courthouses, police, Forbidden Palace and Secret Police HQ, connection to the capital,
  We Love the King Day.
- The constants (50/50 split, D, the level percentages, the size of the reductions) are
  ours. Community analyses of Civ3's formula exist; recording per-city corruption from the
  original game and fitting these constants is open work.

## Test vectors

`packages/engine/test/cities.test.ts` on a Tiny map (D = 30, OCN = 12), Despotism:
- a city 6 tiles from the capital, connected, rank 1: 9 + 3 = **12 %**;
- the same city unconnected: 45 + 3 = **48 %**; with a Courthouse **24 %**;
- under Communism **30 %**; the capital **0 %**.

## Open questions

- Civ3's actual distance scale and rank curve; how Courthouses change the OCN.
