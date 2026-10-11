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

Religious civilizations go through a single turn of anarchy (`anarchyTurns` in
`packages/engine/src/cities.ts`; [civilizations.md](civilizations.md)).

*Confidence: low* for the 2–5 range; Civ3's anarchy length is random.

## Unit support

Every military unit (attack or defence above 0) counts. The government supports, for free,
its per-town, per-city and per-metropolis number for each city; every unit beyond costs
the government's gold per unit each turn. Workers, settlers and explorers are free.
Computer players get the difficulty's extra free support ([ai-handicaps.md](ai-handicaps.md)).

## Rate cap

Each government's `rateCap` (curated from the rule file's `scienceCap`, stored in tens of
percent) bounds every one of tax, science and luxury; `setRates` refuses more, the AI's
fiscal rates and a change of government clamp to it. The Conquests rule file stores 10
(100 %) for **every** government (checked against `data/imported/conquests.json`), so in
practice there is no cap; the 60/70/80/90 % caps sometimes quoted are Civilization II's.
During Anarchy all commerce goes to luxury regardless ([science.md](science.md)).
*Confidence: high* (read from the rule file).

## The draft

A city can **draft** (`draft` command; `draftBlocker` and `draftUnit` in
`packages/engine/src/production.ts`):

- only under a government with a `draftLimit` above 0 (Anarchy has none), and once the
  player knows an advance flagged `enablesConscription` (Nationalism);
- at most `draftLimit` units per city each turn (Despotism, Monarchy, Feudalism,
  Communism, Fascism 2; Republic, Democracy 1);
- only while the city is larger than 1 and not resisting a new owner.

Each draft turns one citizen into the best unit flagged `draft` the city could build now
(strongest defence, then attack: Spearman … Rifleman, Guerilla, Infantry, Mech Infantry,
or the civilization's unique counterpart such as the Numidian Mercenary). The unit comes
out as a **Conscript**. The family left behind is unhappy for `forcedLaborUnhappyTurns`
turns (20), exactly like a forced-labour citizen ([happiness.md](happiness.md)).

*Our defaults, confidence low:* Civ3's rule file has a separate `draftTurnPenalty` that our
curated rule set does not carry, so we reuse the forced-labour duration; that the limit is
per city and turn (rather than empire-wide) is our reading of `draftLimit`.

Xenophobic and forced-resettlement governments (Fascism) are not modelled: see the known
deviations in [README.md](README.md).

## Sources

Rule file `GOVT` section; Civilopedia *Governments*, *Unit Support*, *Revolution*,
government entries.

## Test vectors

`packages/engine/test/cities.test.ts`: revolution goes through 2–5 turns of anarchy, no
science during anarchy, unit support (6 warriors in one town: 2 gold under Despotism, 10
under the Republic). `packages/engine/test/ruledata.test.ts`: the draft (needs
Nationalism, 2 per city and turn under Despotism, none under Anarchy, conscripts, 20 turns
of unhappiness).
