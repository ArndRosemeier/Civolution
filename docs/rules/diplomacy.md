# Diplomacy

**Status:** draft (Phase 4) · **Confidence:** medium for the shape (Civ3's treaties and
trade items), low for the numbers (treaty lengths, reputation and attitude points are ours)

Code: `packages/engine/src/diplomacy.ts`; tests in `packages/engine/test/diplomacy.test.ts`.

## Contact

Two civilizations meet when a unit, city or border of one comes into sight of the other's
(checked after every move and for everything in sight at the end of each turn), or when a
third civilization introduces them in a deal. Meeting puts them at peace. War can only be
declared on a civilization met. The barbarians never meet anyone and are always at war.

## War and peace

- **War** is declared by one side alone. It ends every treaty between the two and cancels
  their running deals. The victim remembers (−50 attitude points).
- **Peace** needs the other side's agreement: a `peace` item in a deal. Signing ends the
  war, clears war weariness and sends both sides' units home from the other's territory
  (to their nearest city, as Civ3 does). A signed peace treaty **binds for 20 turns**.
- **Ceasefire** ends a war for 16 turns; when it runs out the war resumes unless peace was
  signed in between.
- Signing a separate peace with the enemy of an ally ends that alliance; the ally resents it.

## Treaties

| Treaty | Needs (both sides) | Effect |
|---|---|---|
| Right of passage | tech with `enablesRightOfPassage` | units may stay in the other's land without annoying them |
| Mutual protection pact | `enablesMutualProtectionPacts` | whoever declares war on one is at war with the other at once |
| Alliance against X | `enablesMilitaryAlliances`, both met X | both are at war with X; ends when X is gone or both make peace |
| Embargo against X | `enablesTradeEmbargoes` | no deals between the parties and X; running deals with X stop |

## Deals

A deal lists what each side gives. Items: gold, gold per turn (20 turns), an advance (the
receiver needs its prerequisites; the era rule does not apply to trades), the world map
(giver needs `enablesMapTrading`), contact with a third civilization (`enablesCommunicationTrading`),
an embassy, a luxury or strategic resource (20 turns, only a surplus: a resource the giver
has from more sources than it uses), a city (never the capital; small wonders in it are
lost), and the treaties above. At war only a deal containing peace or a ceasefire can be
made. Offers to the human wait until the human ends the turn; AI players answer at once.

Running deals pay or deliver at the end of every turn. A payer whose treasury cannot cover
a payment defaults: the deal ends and the payer loses 10 reputation.

## Reputation and attitude

**Reputation** (0–100, starts at 100) falls when a civilization declares war while bound by
a treaty: peace still binding 40, alliance 40, protection pact 30, ceasefire 25, right of
passage 20; every civilization that knows the breaker also remembers it. It recovers one
point every ten turns.

**Attitude** (Civ3's furious, annoyed, cautious, polite, gracious; −100 … 100) is what one
leader feels about another, with every reason shown on the diplomacy screen:
remembered events (war declared on them −50, peace +10, gifts +8, fair trades +2, caught
spies −20, trespassing military units −1 to −4 a turn, fading a point a turn), the other's
reputation, war, common enemies (+15 each), treaties and running trade, the leader's
temper (−4 per point of the civilization's aggression from the rule file), crowded borders
(−3 per pair of cities within 7 tiles), wariness of humans above Regent, and fear of a
runaway leader. Levels: furious ≤ −50 < annoyed ≤ −15 < cautious < 15 ≤ polite < 50 ≤ gracious.

## Research

An advance costs 30 % less when every other living civilization you have met knows it, in
proportion to how many do (`KNOWN_TECH_DISCOUNT`).

## Sources

Rule file: tech flags for diplomacy, civilization aggression and governments. Civilopedia:
*Diplomacy*, *Treaties*, *Reputation*, *Embassies*. Numbers marked ours above are our
model, written to keep Civ3's behaviour: binding peace, chained protection pacts, AI
attitudes that remember broken treaties.

## Open questions

- Civ3's exact attitude points and reputation recovery are undocumented.
- Trade routes for resources (Civ3 needs a connection between the capitals) are not
  required yet.
