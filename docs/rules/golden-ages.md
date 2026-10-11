# Golden ages

**Status:** draft (Phase 6) · **Confidence:** high for triggers, medium for the effect

## Rule

A civilization has one golden age per game. It starts when:

- one of its unique units wins a battle for the first time (attacking or defending; a
  retreating enemy counts), or
- the great wonders it holds together carry the characteristics of both its traits (one
  wonder may cover both: the Pyramids are a place of worship and a construction, so they
  start Egypt's golden age on their own).

It lasts `goldenAgeDuration` turns (20). While it lasts every tile that yields at least one
shield yields one more, and every tile that yields at least one commerce yields one more.
The bonus comes after the despotism penalty, so it is never lost to it.

## Sources

Rule file `goldenAgeDuration`, unit ability `startsGoldenAge`, building characteristics.
The tile bonus is the documented Civ3 effect.

## Test vectors

`packages/engine/test/civs.test.ts`: a Panzer's first victory starts Germany's golden age,
the city tile gains a shield and a commerce, it ends after 20 turns and does not return;
Egypt's Pyramids start one.
