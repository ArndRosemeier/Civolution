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
| Diplomacy | `diplomacy.ts`, `value.ts` | embassies, technology swaps among AIs, alliances against a common enemy, swaps offered to humans it likes, and the answer to every offer |

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

## Measuring

`pnpm --filter @civolution/sim tournament` plays many seeds; see docs/PLAN.md §11 and the
Phase 4 notes for results.

## Phase 8 changes

- The first three cities start settlers at any size (the settler waits while the city
  grows and its shields pile up); later cities give up settlers from size 4.
- A city raising settlers or workers uses the Growth governor instead of Balanced.
- A threatened city of size 4 or more with fewer than two defenders drafts one when its
  government and Nationalism allow it.
