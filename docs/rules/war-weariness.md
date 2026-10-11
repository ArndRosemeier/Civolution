# War, peace and war weariness

**Status:** draft (Phase 3) · **Confidence:** low (our model)

Code: `addWeariness`, `decayWeariness`, `wearinessFaces` in `packages/engine/src/war.ts`.

## Rule

- **War** is declared on the diplomacy screen (F4) and takes effect at once; **peace**
  needs the other side's agreement ([diplomacy.md](diplomacy.md)). Barbarians are always
  at war with everyone and cannot be treated with.
- **Points** a civilization collects against each enemy: +1 for every battle with them, +3
  for every unit lost to them, +10 for a city lost to them, +10 for being struck by a
  nuclear weapon. Battles with barbarians do not count.
- Every turn the points against each enemy drop by a tenth (rounded up); peace clears them.
- **Unhappiness:** governments with low weariness (Republic and Feudalism, `warWeariness: low` in the rule file) turn one content citizen
  unhappy in every city per 40 points; high weariness (Democracy) per 20 points. A Police
  Station halves it in its city, Universal Suffrage everywhere. Shown as the "War
  weariness" step of the city's moods ([happiness.md](happiness.md)).

## Open questions

- Civ3's documented weariness counters (per enemy, decaying, with a cap) differ in detail;
  this model keeps their shape and should be replaced with recorded vectors.
