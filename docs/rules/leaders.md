# Great leaders

**Status:** draft (Phase 6) · **Confidence:** medium

## Rule

**Military leaders** come from elite victories ([armies.md](armies.md)). They form armies
or hurry an improvement or wonder.

**Scientific leaders.** When a scientific civilization is the first in the world to learn
an advance, there is a 10 % chance a scientific leader appears in its capital. A scientific
leader hurries an improvement or wonder like a military one but never leads an army, and
does not count toward the one military leader a civilization may have at a time.

**Names.** Leaders take the names of the civilization's military or scientific leaders from
the rule file, in order (Rome: Trajan, Hadrian, …; Leonardo da Vinci, …), with a numeral
once the list runs out.

The AI hurries wonders with any leader and lets a scientist finish any building with at
least 150 shields to go.

## Sources

Rule file `RACE` military and scientific leader names; the leader unit's
`finishImprovements` action. The 10 % chance is ours.

## Test vectors

`packages/engine/test/civs.test.ts`: names; a scientific leader appears for Greece's first
discovery on one of the first seeds and is refused an army.
