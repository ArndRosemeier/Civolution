/**
 * @civolution/engine: the deterministic game core. No DOM, no I/O, no ambient time.
 * Everything changes state through `apply(rules, state, command)`.
 */
export * from './commands.ts';
export * from './grid.ts';
export * from './state.ts';
export * from './automation.ts';
export { indexRules, type Rules } from './rules.ts';
export { createGame, apply, resolveSettings, PLAYER_COLORS, type NewGameOptions, type ApplyResult } from './game.ts';
export { generateMap } from './map/generate.ts';
export { canStandOn, checkMove, stepCost, zocUnits, type MoveCheck } from './movement.ts';
export { costField, findPath, pathTurns, reachableThisTurn, type Path } from './pathfind.ts';
export * from './queries.ts';
export { sightRadius, unitSight, visibleTiles } from './vision.ts';
export { checkJob, jobBlocker, jobCost, turnsLeft, workRate, type JobCheck } from './workers.ts';
export { tileYield, resourceVisibleTo, type Explained, type Part, type TileYield } from './yields.ts';
export { saveGame, loadGame, stateHash, SaveError, type SaveHeader } from './save.ts';
export { checkInvariants, invariants, type Invariant } from './invariants.ts';
export { canonicalJson, hashString, hashValue } from './hash.ts';
export { yearOf, formatYear, yearsBetween } from './calendar.ts';
export { invalidateEverything as invalidateCaches } from './caches.ts';
export {
  cityReport,
  cityTileYield,
  corruptionRate,
  effectiveBuildings,
  foodBox,
  hasFreshWater,
  isCoastal,
  sizeClass,
  sizeLimit,
  workableTiles,
  workedTiles,
  type CityReport,
  type MoodStep,
  type SizeClass,
  type TileOutput,
} from './city.ts';
export { foundBlocker, siteBlocker, placeableTiles, unitSupportCost, TECH_BONUS_ADVANCE, TECH_REVEALS_MAP } from './cities.ts';
export { availableResources, cityResources, connectedToCapital, empireInfo, landMasses, tradeRoute, type EmpireInfo } from './empire.ts';
export { avoidDisorder, defaultSpecialist, placeCitizens, type Placement } from './governor.ts';
export { buildBlocker, buildCategory, buildCost, buildName, buildOptions, draftBlocker, draftedThisTurn, draftUnit, hurryQuote, isCommonUnit, type BuildCategory, type BuildOption, type HurryQuote } from './production.ts';
export {
  civOf,
  civVersionOf,
  hasTrait,
  inGoldenAge,
  isUnitVariant,
  leaderName,
  nextCityName,
  nextUpgrade,
  safeSeaTravel,
  shipMoveBonus,
  traitDiscount,
  unitAvailable,
  COMMERCIAL_OCN_PERCENT,
  INDUSTRIOUS_CITY_SIZE,
  INDUSTRIOUS_WORK_PERCENT,
  SCIENTIFIC_LEADER_PERCENT,
  WONDER_GOLDEN_AGE_PERCENT,
  TRAITS,
  TRAIT_CHARACTERISTIC,
  type Trait,
} from './civs.ts';
export { cultureInfluence, flipOdds, FLIP_MAX_PERCENT, FLIP_RADIUS, FLIP_THRESHOLD_PERCENT, GARRISON_PERCENT, UNITS_PER_QUELLED, type FlipOdds } from './culture.ts';
export { pollutionPoints, warmingThreshold, MELTDOWN_PERCENT, PERCENT_PER_POINT, POPULATION_FREE_SIZE, SHIELDS_PER_POINT } from './pollution.ts';
export { emptySpaceship, launchBlocker, spaceshipComplete, spaceshipPartBlocker, spaceshipParts, FLIGHT_TURNS } from './space.ts';
export { culturalWinner, defaultOptions, dominationShares, unCandidates, unVote, UN_VOTE_TURNS, VICTORY_NAMES } from './victory.ts';
export { treasuryInterest, INTEREST_CAP, INTEREST_PERCENT } from './cities.ts';
export { phase6Fields } from './game.ts';
export { TOURIST_YEARS } from './city.ts';
export { eraFor, requiredTechs, researchableTechs, researchBlocker, techCost } from './science.ts';
export { borderRadius, cityAt, cityRadiusTiles, computeTerritory, playerCities, ringTiles, CITY_RADIUS } from './territory.ts';
export { CITY_NAMES } from './names.ts';
export { makeRng, hash3, type Rng, type RngState } from './rng.ts';
export { SAM_DEFENCE_PERCENT, attackStrength, battleOdds, defenceStrength, fight, pickDefender, attackSide, defenceSide, isCombatant, retreatChance, type Strength, type Odds, type Side, type CombatKind, type BattleResult } from './combat.ts';
export { armyCount, armyLimit, attackBlocker, cityBombardDefence, previewAttack, upgradeQuote, wearinessFaces, nukesEnabled, PROMOTION_ODDS, LEADER_ODDS, type AttackPreview } from './war.ts';
export { cargoOf, cargoSpace, currentHp, isArmy, levelHp, maxHp, unitMaxMoves, canCarry, transportFor } from './units.ts';
export { barbarianPlayer, campTiles, BARBARIAN_START_TURN } from './barbarians.ts';
export { boardingTransport } from './movement.ts';
export { CAMP_GOLD, HUT_ODDS } from './move.ts';
export {
  attitude,
  attitudeLevel,
  civilizations,
  dealBlocker,
  dealItemLabel,
  embargoed,
  hasContact,
  hasTreaty,
  incomingResources,
  isTreatyItem,
  militaryPower,
  peaceBinding,
  relation,
  resourceSurplus,
  score,
  canReceiveTech,
  tradingPartners,
  treatiesBetween,
  BREACH_PENALTY,
  CEASEFIRE_TURNS,
  DEAL_TURNS,
  PEACE_TURNS,
  type Attitude,
  type AttitudeLevel,
  type Relation,
} from './diplomacy.ts';
export { cultureOpinion, missionBlocker, missionChance, missionCost, COUNTER_ESPIONAGE } from './espionage.ts';
export { airdropBlocker, airliftBlocker, stealthTargets } from './war.ts';
export { HUMAN_COST_FACTOR, KNOWN_TECH_DISCOUNT } from './science.ts';
