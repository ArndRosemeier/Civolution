# Player automation

`packages/automation` (PLAN.md §8). Automation reads the state and issues ordinary engine
commands, each with a reason that the log, the city screen and the turn digest show. It
can do nothing the player could not, and the AI uses the same modules.

The player's settings live in the state (`player.automation`, `engine/src/automation.ts`)
and change through the `setAutomation` command, so they are saved with the game. The
engine only checks their shape and limits; their meaning is all in this package.

## One pass per turn

`runAutomation` (`run.ts`) runs at the start of the player's turn, in this order:

| Step | Code | What it does |
|---|---|---|
| Offers | `policies.ts` `dealAnswer` | accepts gifts, declines demands, accepts peace, by the deal policy (diplomacy delegated); a demand backed by a threat of war (withdrawal, tribute) is always left to the player |
| Research | `policyResearch` | the next step toward the research goal, else the cheapest advance toward the next era |
| Treasury | `policyRates`, `planGovernment` | rates by policy (most science that keeps +X gold a turn, most gold, celebrate), the best government known |
| Templates | `templates.ts` | gives new and captured cities their template (inland, coastal, captured) |
| Builds | `chooseBuild` | a defender when a city has none, the empire's settlers and workers, then the template's first applicable entry, then the planner's priorities; improvements in progress are kept |
| Governors | `governors.ts` | places citizens, then rushes builds within the hurry budget |
| Your rules | `custom.ts` | trigger → conditions → action, after the rest so they win |
| New units | `delegateUnit` | workers join the pool, settlers settle, defenders garrison, attackers go to the city's rally point, siege units bombard, one unit explores |
| Routines | `routines.ts`, `workers.ts` | every unit routine, workers from one job board |
| Upgrades | `policyUpgrades` | cheapest first, never below the treasury reserve |
| Digest | `digest.ts` | what needs the player and what was handled |

A refused command is skipped and reported, never forced. Each aspect has a delegation
switch; a city's own governor or template applies whether or not the aspect is delegated.

## Governors

Weights per yield (food, shields, commerce, gold, science, luxury) and a food target:

| Preset | Food · shields · commerce | Gold · science · luxury | Food target |
|---|---|---|---|
| Balanced | 4 · 3 · 2 | 1 · 1 · 0 | +2 |
| Growth | 9 · 2 · 1 | 1 · 1 · 0 | +6 |
| Production | 2 · 9 · 1 | 0 · 0 · 0 | +1 |
| Gold | 3 · 2 · 5 | 6 · 0 · 0 | +1 |
| Science | 3 · 2 · 5 | 0 · 6 · 0 | +1 |
| Culture | 3 · 6 · 2 | 0 · 0 · 2 | +1 |
| Military Pump | 1 · 10 · 0 | 0 · 0 · 0 | 0 |
| Settler Pump | 9 · 6 · 0 | 0 · 0 · 0 | +4 |

Commerce is worth its own weight plus what the current rates make of it. Citizens are
placed greedily by weighted value, food first while the target is out of reach and food
worth less once it is in reach (except Growth and Settler Pump). Then: the poorest food
tiles are swapped for richer ones while the city would starve; specialists replace the
weakest tiles where they are worth more and food allows; entertainers end disorder,
taking the tiles whose loss hurts least and never food the city needs. The reason lists
the result ("Governor (Science): +2 food, 6 shields, 4 gold, 9 science").

## Templates

Built in: New town, Core city, Coastal, Frontier fortress, Military pump, Settler pump,
Science, Culture, Gold. An entry is a building, a unit or a unit role (best defender,
attacker, siege unit, ship; worker, settler, explorer) with conditions on city values:
size, unhappy, happy, food surplus, shields, commerce, corruption, defenders, treasury, at
war, coastal, turn, cities, has a building. The player copies one to edit it.

## Workers

One job board per pass: jobs from every city's work area (irrigation for food-short
cities, mines for weak producers, roads for trade, railroads, clearing for hungry cities,
pollution), roads between neighbouring cities that the network does not join, and roads
from luxuries and strategic resources outside every work area to the nearest city. Jobs
score by the player's task order plus the city's need. Each idle worker takes the best job
less three points a tile of travel on land it knows a way across; one worker per tile.
Workers never replace a mine with irrigation or the other way round, never work in a
region where the job is forbidden, avoid tiles within two of a visible enemy, and walk to
the nearest city when one comes close.

## Unit routines

`explore`, `autoWorker`, `autoSettle`, `garrison` (to the nearest city on its land short of
defenders, then fortify), `patrol:<a>:<b>`, `rally:<tile>` and `bombard` (fire at the
strongest enemy stack or city in range every turn), and since Phase 7:

- `front`: reinforce the city on this land that visible enemies press hardest. A city's
  need is the attack of visible enemy land units within three tiles less the defence
  inside; the unit holds a city while it is threatened and waits in the nearest city as a
  reserve when nothing is.
- `escort:<unit>`: keep to another of the player's units (a transport, a settler, a
  great leader), moving onto its tile each turn; it ends when that unit is gone.
- `airDefence`, the interception schedule: on interception duty every turn while at war
  with a civilization, standing down to repair when damaged and at peace. Delegated
  military gives it to new fighters.

The map's automation lens (L) marks every automated unit and city with its routine.

## The digest and the exit criterion

The digest lists threats, disorder that a governor could not end, offers, research,
cities with nothing to build, idle units, starving cities without a governor, resources
lost or gained (the trade-route keeper compares with the previous turn), rule notices,
and what automation handled. `inputSeconds` counts five seconds per decision plus five to
end the turn.

Phase 5's exit test (`packages/automation/test/automation.test.ts`) plays three turns of a
200-city industrial-era empire (`empireScenario` in `packages/sim/src/scenarios.ts`, also
`?scenario=empire` in the browser) with everything delegated: every command carries a
reason and each turn asks for well under two minutes of input (about ten seconds). The
automation pass takes about 0.1 s for 200 cities on a desktop.

## Sharing

`exportRoutines` writes the player's rules and templates as JSON
(`format: "civolution-routines"`); `importRoutines` adds them with fresh ids.
