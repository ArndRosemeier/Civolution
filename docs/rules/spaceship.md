# The space race

**Status:** draft (Phase 6) · **Confidence:** high for the parts, medium for flight time

## Rule

- A civilization needs its own Apollo Program (a small wonder in the Conquests rules) to
  build spaceship parts.
- The ship needs every one of the ten parts in the counts the rule file stores
  (`spaceshipPartCounts`: one of each). A finished part joins the ship instead of standing
  in the city; a city cannot start a part the ship already has.
- A finished ship launches from the capital with the `launchSpaceship` command (the AI
  launches at once; players use the button on the victory screen, F8) and arrives 12 turns
  later; the civilization wins at the end of its arrival turn ([victory.md](victory.md)).
- If the capital is captured or destroyed, the ship and every part are lost, in flight or
  not.
- With the space victory switched off, parts cannot be built.

## Test vectors

`packages/engine/test/civs.test.ts` (Apollo needed, parts join the ship);
`packages/engine/test/endgame.test.ts` (launch, arrival after 12 turns, loss with the
capital).
