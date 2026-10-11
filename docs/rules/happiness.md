# Happiness, disorder and celebration

**Status:** draft (Phase 2) · **Confidence:** high for the order of steps, medium for luxuries

## Rule

Only laborers have a mood; specialists are neither happy nor unhappy. `cityReport` lists
every step with the counts after it (`moods`), which the city screen shows.

1. **Born content:** the difficulty's content citizens (Chieftain 4, Warlord 3, Regent 2,
   Monarch 2, Emperor and above 1), one fewer for every OCN cities the empire has
   ([corruption.md](corruption.md)); the rest are unhappy.
2. **Forced labour:** each citizen sacrificed in the last 20 turns turns one content
   citizen unhappy.
3. **Luxury resources** connected to the city: one happy face per kind; with a Marketplace
   the Civilopedia table (1, 2, 4, 6, 9, 12, 16, 20 faces for 1–8 kinds).
4. **Luxury:** one happy face per luxury point (the luxury share of commerce, plus
   entertainers, +50 % with a Marketplace).
5. **Buildings** in the city: content faces (Temple 1, Colosseum 2, Cathedral 3, wonders
   such as the Mausoleum 3 in their own city), doubled by the Oracle (temples) and the
   Sistine Chapel (cathedrals).
6. **Wonders elsewhere:** content faces in every other city (Hanging Gardens 1, Cure for
   Cancer 1), on the same continent for JS Bach's Cathedral (2).
7. **Military police:** each military unit in the city makes one unhappy citizen content,
   up to the government's limit (Despotism 2, Monarchy and Feudalism 3, Communism and
   Fascism 4, none under Republic and Democracy).

A happy face turns a content citizen happy; faces left over work on unhappy citizens (two
faces make one happy, one makes it content). A content face turns an unhappy citizen
content.

**Disorder:** more unhappy than happy citizens. A city in disorder produces no shields,
collects no tax, science or luxury and stores no surplus food (a deficit still drains the
box). Cities that place their own citizens turn laborers into entertainers to avoid it
([cities.md](cities.md)).

**We Love the King Day:** at least `wltkdMinimumPopulation` (6) citizens, no unhappy
citizens, more happy than content citizens and no food deficit. While celebrating, the
Despotism tile penalty is lifted and waste is halved.

## Sources

Rule file: difficulty content citizens, building content faces and "doubles happiness of",
government military police limits, the WLTKD minimum size. Civilopedia: *Moods*,
*Happy Faces*, *Overpopulation*, *Disorder*, *We Love The King Day*, Marketplace.

## Test vectors

`packages/engine/test/cities.test.ts`: a size-4 Regent city is 0 / 2 / 2 (disorder); a
Temple makes it 0 / 3 / 1 (still disorder); one entertainer with the Temple gives
1 / 2 / 0; disorder zeroes shields, tax and science; automatic cities avoid disorder.

## Open questions

- Whether a luxury point is worth one happy face or half of one in Conquests (we follow the
  rule file's entertainer value of 1 and the Civilopedia's "one happy face").
- The exact empire-size unhappiness rule; war weariness arrives in Phase 3.
