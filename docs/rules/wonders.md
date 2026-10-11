# Wonders

**Status:** draft (Phase 6) · **Confidence:** high for stored effects, low where marked

Every wonder and small wonder in the rule file works in the engine. Where the effect
lives:

| Effect flag | Wonders | Where |
|---|---|---|
| contentFaces, contentFacesElsewhere, doublesContentOf, continental | Temple of Artemis, Sistine Chapel, J.S. Bach, Shakespeare, Cure for Cancer | [happiness.md](happiness.md) |
| actsAsEverywhere / actsAsOnContinent | Pyramids (granary), Great Wall (walls), Oracle, Hoover Dam, Internet | `empire.ts` effective buildings |
| unitProduced | Statue of Zeus, Knights Templar | [production.md](production.md) |
| plusOneTradePerTile | Colossus | [cities.md](cities.md) |
| doublesResearch, research50 | Copernicus, Newton, SETI | [science.md](science.md) |
| allowsCitySize3 | Shakespeare's Theater | [cities.md](cities.md) |
| halvesUpgradeCost | Leonardo's Workshop | [combat.md](combat.md) |
| doubleCombatVsBarbarians | Great Wall | [barbarians.md](barbarians.md) |
| reducesWarWearinessAll | Universal Suffrage | [war-weariness.md](war-weariness.md) |
| paysTradeMaintenance | Smith's Trading Company | [production.md](production.md) |
| twoFreeAdvances | Theory of Evolution | [science.md](science.md) |
| cityGrowthTwoCitizens | Longevity | [cities.md](cities.md) |
| allowsAllCivsNukes, decreasesMissileSuccess | Manhattan Project, SDI | [nukes.md](nukes.md) |
| increasesLeaderChance, buildArmiesWithoutLeader, buildLargerArmies | Heroic Epic, Military Academy, Pentagon | [armies.md](armies.md) |
| allowsSpyMissions | Intelligence Agency | [espionage.md](espionage.md) |
| allowsHealingInEnemyTerritory | Battlefield Medicine | [combat.md](combat.md) |
| reducesCorruption (small wonder) | Forbidden Palace, Secret Police HQ | [corruption.md](corruption.md) |
| **gainAdvancesKnownByTwoCivs** | Great Library | below |
| **treasuryEarnsInterest** | Wall Street | below |
| **plusOneShipMovement, safeSeaTravel** | Great Lighthouse, Magellan's Voyage | below |
| **touristAttraction** | most ancient and medieval wonders | below (low confidence) |
| **buildSpaceshipParts** | Apollo Program | [spaceship.md](spaceship.md) |
| **allowsDiplomaticVictory** | United Nations | [victory.md](victory.md) |
| **resistantToBribery** (improvement) | Courthouse | below |

- **Great Library:** at the end of each turn its owner learns every advance it can research
  that at least two civilizations it has met already know.
- **Wall Street:** 5 % interest on a positive treasury, at most 50 gold a turn (ours).
- **Great Lighthouse, Magellan's Voyage:** each adds a movement point to its owner's ships.
  The Great Lighthouse also lets coast-bound ships (galleys) enter sea, never ocean.
- **Tourist attraction:** a wonder 2000 years old or more earns its doubled culture again as
  gold in its city each turn (ours; Civ3's exact rule is not known to us).
- **Courthouse:** propaganda against its city succeeds half as often.

## Test vectors

`packages/engine/test/civs.test.ts` (Wall Street 20 gold of 400 and the 50 cap, Great
Library, Colossus visitors, Great Lighthouse galleys, Apollo Program); earlier phases' tests
for the rest.
