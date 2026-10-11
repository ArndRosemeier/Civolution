# The computer players

`packages/ai` (PLAN.md §9). The AI issues ordinary engine commands only, reads what its
own fog of war shows, and uses the engine's own queries (combat odds, attitudes, deal
checks) so it can never do anything a human could not.

## Layers

| Layer | Code | What it decides |
|---|---|---|
| View | `view.ts` | once per turn: personality, visible tiles, cities, threats per city (enemy attack in sight within 3 tiles), frontier cities, military power of everyone |
| Grand strategy | `diplomacy.ts` `planWar`, `index.ts` | expand while there is land; prepare for war against a weak, disliked neighbour on the same land mass; declare once the field army is ready and strong enough; offer peace when a war goes badly or drags on |
| Operations | `military.ts` | garrisons (best defenders, more on the frontier, in the capital and under threat), the campaign against one enemy city at a time: muster at the nearest own city until strong enough, march, bombard, assault |
| Tactics | `military.ts` | attack odds from `previewAttack`; the more units at the walls the worse odds they accept; sallies from threatened cities; strikes on exposed enemies; bombers and interceptors |
| Citizens and workers | `index.ts` | the automation's Balanced governor (Production while a city is threatened) places citizens; workers share the automation's worker pool and job board (docs/automation.md) |
| Cities | `build.ts` | defenders where short, the field army while at war or preparing one, otherwise the automation's building priorities (`planBuild`) with settlers capped and wonders per the civilization's preferences |
| Economy | `index.ts` | research and government through the automation helpers (favourite government first, a warlike leader keeps away from war-weary governments at war), rates that keep the treasury from shrinking |
| Diplomacy | `diplomacy.ts`, `value.ts` | embassies, technology swaps among AIs, alliances against a common enemy, swaps offered to humans it likes, withdrawal and tribute demands (`makeDemands`), and the answer to every offer and demand |

## Character

Each civilization's rule-file entry gives its leader's aggression (−2 … +2), favourite and
shunned government and what it builds often or never. Unnamed players get a stable
aggression from the seed. Aggression moves the first war earlier, lowers the strength the
AI wants before declaring, enlarges its field army and sours its attitude to others.

## Valuing deals

Everything is priced in gold (`value.ts`): advances at their beaker cost (more when handing
one to a rival it dislikes), per-turn gold discounted by the payer's reputation, resources
by kind, cities by size and buildings (its own at three times that), peace by how the war
goes (strength ratio, length, war weariness, temper). The AI accepts when what it gets
outweighs what it gives plus a margin: none between friends, more toward disliked or
human players at higher difficulties, less between AIs by the difficulty's AI trade rate.
`balance` answers "What would you want?" by adding the other side's advances, then gold.
A resource the AI would hand over as its last copy (it goes without it while the deal runs)
is priced far higher: 600 gold for a strategic resource, 200 for a luxury, against 120 and
40 for a spare copy (source: owner's ruling 2026-10-11).

## Demands

Source: owner's ruling 2026-10-11 (rules in docs/rules/diplomacy.md, "Demands").

- **Withdrawal.** Each turn the AI checks every civilization at peace with it whose armed
  units, as far as it can see, seriously threaten one of its cities (`trespassThreat`) and
  demands they withdraw or it means war; the engine allows one such demand per pair every
  8 turns.
- **Tribute.** Rarely, an AI demands an advance (the most expensive it can receive) or half
  the treasury in gold, rounded to tens, from a civilization it dislikes (attitude −15 or
  lower) that is at most two thirds as strong, with no alliance or protection pact between
  them, from turn 20 on. The chance a turn per rival is 1 + aggression percent (never for
  peaceful leaders, 3 % for the most warlike), doubled against a rival at most 40 % as
  strong; the engine allows one tribute demand per pair every 20 turns, and the AI makes at
  most one a turn. The threat is meant (war on refusal) for leaders with aggression 1 or
  more, half the time for an even temper, never for peaceful ones, and never while a peace
  treaty still binds unless the leader's aggression is 2. The rolls use the AI's own
  generator (`makeRng(hash3(seed, turn, player))`), so they never disturb the game's dice.
- **Answering.** Humans answer demands in the offer dialog. An AI withdraws its troops when
  it is weaker than the demander or not warlike (aggression 0 or less), and refuses
  otherwise (which means war); it pays tribute when it is weaker than the demander (a
  warlike leader only below 70 % of the demander's strength) (`yieldsTo`).

## Measuring

`pnpm --filter @civolution/sim tournament` plays many seeds; see docs/PLAN.md §11 and the
Phase 4 notes for results.

## Phase 8 changes

- The first three cities start settlers at any size (the settler waits while the city
  grows and its shields pile up); later cities give up settlers from size 4.
- A city raising settlers or workers uses the Growth governor instead of Balanced.
- A threatened city of size 4 or more with fewer than two defenders drafts one when its
  government and Nationalism allow it.
