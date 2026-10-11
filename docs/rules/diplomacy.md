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
  their running deals (which breaks them, see Reputation). The victim remembers (−50
  attitude points).
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
an embassy, a luxury or strategic resource (20 turns; any copy the giver holds, its last one
included, and giving away the last copy leaves the giver without the resource while the
deal runs, see [trade.md](trade.md); source: owner's ruling 2026-10-11), a city (never the capital; small wonders in it are
lost), and the treaties above. At war only a deal containing peace or a ceasefire can be
made. Offers to the human wait until the human ends the turn; AI players answer at once.

Running deals pay or deliver at the end of every turn. A payer whose treasury cannot cover
a payment defaults: the deal ends, and defaulting breaks a trade deal (20, see Reputation).

## Demands

A demand is an offer that gives nothing and threatens war if refused (`Deal.demand`, with
`war` saying whether the threat is meant). A human answers it in the offer dialog (closing
the dialog does not refuse it); an AI answers at once. A demand left unanswered when the
recipient ends its turn counts as refused. A civilization makes the same kind of demand of
the same rival at most once every 8 turns (withdrawal) or 20 turns (tribute). Source:
owner's ruling 2026-10-11.

- **Withdraw your troops.** When armed units (attack above 0, not aircraft) of a
  civilization at peace stand in a civilization's territory without right of passage or
  an alliance and seriously threaten one of its cities — three or more within 3 tiles of
  it, or their attack within 2 tiles more than 1.5 times the defence of the units in the
  city (an empty city counts as 1) — the owner may demand: "withdraw your troops
  immediately or it means war". Accepted, **all** the intruder's units inside the
  territory (workers and ships too) are teleported to the intruder's nearest city, as on
  signing peace. Refused, the demander declares war; this war breaks no treaty of the
  demander's (the intruder provoked it).
- **Tribute.** Gold or advances, nothing in return. Paid, the demander is pleased (+5) and
  the payer resents it (−5). Refused, the demander resents it (−10) and declares war if
  it threatened it; that declaration breaks treaties as any other would.


## Reputation and attitude

**Reputation** (0–100, starts at 100) falls when a civilization breaks its word: declaring
war while bound by a treaty (peace still binding 40, alliance 40, protection pact 30,
ceasefire 25, right of passage 20) or while running trade deals with the victim (20; the
worst one broken counts), and defaulting on a payment (20). Every civilization that knows
the breaker, the victim included, remembers the **full** penalty as attitude points, not a
share of it (source: owner's ruling 2026-10-11). Declarations honouring a protection pact
or answering a refused withdrawal demand break nothing. Reputation recovers one point
every ten turns.

**Attitude** (Civ3's furious, annoyed, cautious, polite, gracious; −100 … 100) is what one
leader feels about another, with every reason shown on the diplomacy screen:
remembered events (war declared on them −50, broken treaties and trade deals the full
penalty above, peace +10, gifts +8, fair trades +2, demands met +5, tribute paid −5,
demands refused −10, caught spies −20, trespassing military units −1 to −4 a turn, fading a
point a turn), the other's
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

## Test vectors

`packages/engine/test/diplomacy.test.ts`: the full penalty with every civilization for a
broken peace and ceasefire, trade deals cancelled by war and a default; withdrawal demands
(threat threshold, every unit sent home on acceptance, war on refusal or lapse with no
reputation lost, cooldown, troops needed); tribute (paid, refused with and without war,
gold or advances only); trading the last copy of a resource.

## Open questions

- Civ3's exact attitude points and reputation recovery are undocumented.
- Civ3's exact threat threshold for withdrawal demands is undocumented; ours is above.
