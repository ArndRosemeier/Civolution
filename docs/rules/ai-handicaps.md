# Difficulty handicaps

**Status:** draft (Phase 4) · **Confidence:** medium (fields from the rule file, how they
apply from community descriptions)

Code: `createGame` (game.ts), `unitSupportCost` (cities.ts), `techCost` (science.ts),
AI trade margins in `packages/ai/src/value.ts`.

## Rule

Each difficulty level in the rule file carries handicaps that apply to computer players
(players not marked human):

| Field | Effect | Chieftain … Sid |
|---|---|---|
| AI defensive / offensive start units | extra best defender / attacker available without advances at the start | 0/0 … 12/6 |
| Extra start units 1 and 2 | extra copies of the rule file's start units (Settler, Worker) | 0/0 … 2/4 |
| Additional free support, bonus per city | units supported for free on top of the government's | 0, 0 … 24, 8 |
| Cost factor | research cost multiplier in tenths (humans always pay Regent's 10) | 20 … 4 |
| AI-to-AI trade rate | AIs trade among themselves at a better rate than with humans | 110 … 200 % |
| Content citizens | as before, for every player | 4 … 1 |

Humans get the difficulty's attack bonus against barbarians ([combat.md](combat.md)).
The AI asks humans a growing margin on trades above Regent (5 % per level) and is wary of
human ambition above Regent (attitude −3 per level).

## Open questions

- Whether Civ3 applies the cost factor to AI production and the food box as well as
  research; we apply it to research only.
- Whether the AI's content citizens differ from the human's at the same level; ours are equal.
