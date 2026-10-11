# Victory and game modes

**Status:** draft (Phase 6) · **Confidence:** high for thresholds, medium for the UN

Victory is checked at the end of every turn (`victory.ts`). The first condition met
decides the game; play may go on afterwards but nobody else can win. Every turn's score is
recorded for the histograph.

## Victory conditions (each can be switched off when starting a game)

| Victory | Condition |
|---|---|
| Conquest | Every other civilization is gone (with two or more at the start) |
| Domination | 66 % of the world's land tiles inside your borders and 66 % of its citizens |
| Space race | Your spaceship arrives ([spaceship.md](spaceship.md)) |
| Cultural | 100 000 culture points and at least twice any rival's, or 20 000 in one city |
| Diplomatic | Elected by the United Nations |
| Histograph | When the last turn (540, AD 2050) ends, the highest score wins; always on |

**United Nations.** While someone holds the United Nations, an election is held the turn
after it is built and then every 10 turns. The candidates are the owner and the most
populous other civilization. Every civilization votes with its citizens: for itself if it
stands, otherwise for the candidate it likes better and is not at war with, abstaining if
it dislikes both (attitude below −15). More than half of all citizens' votes wins.

## Game modes

| Mode | Rule |
|---|---|
| Standard | The conditions above |
| Regicide | Each civilization starts with its king unit; when the king dies the civilization is out and its cities surrender to the killer |
| Mass regicide | Two kings each; the civilization is out when both are dead |
| Elimination | A civilization is out as soon as it loses any city; its other cities surrender to the conqueror |
| Victory points | Points for wonders (10), defeated units (5), first discoveries (5) and conquered cities (100); 50 000 points or the most when time runs out wins |

**Culture flips** can be switched off with the game options ([culture.md](culture.md)).

## Sources

Rule file `GAME` section: `turnTimeLimit`, `oneCityCultureWin`, `allCitiesCultureWin`,
`dominationTerrainPercent`, `dominationPopulationPercent`, victory-point values. The
election rules and the cities surrendering in regicide and elimination are ours.

## Test vectors

`packages/engine/test/endgame.test.ts`: domination shares, a 20 000-point city, a UN
election won with 10 of 17 votes, the score winner at the last turn, conquest, regicide,
elimination, victory points for a kill, loading 0.003 saves.
`packages/sim/test/sim.test.ts`: three AI civilizations play until the game is decided.
