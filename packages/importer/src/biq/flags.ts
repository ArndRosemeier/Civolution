/**
 * Names for the bit fields in BIQ records, in bit order (bit 0 first), from the
 * community format documentation. Bits without a known meaning decode as `bitN`
 * so no information is lost.
 */

export const PRTO_ABILITIES = [
  'wheeled', 'footSoldier', 'blitz', 'cruiseMissile', 'allTerrainAsRoads', 'radar', 'amphibious', 'submarine',
  'aircraftCarrier', 'draft', 'immobile', 'sinksInSea', 'sinksInOcean', 'unusedMounted', 'carriesFootUnitsOnly', 'startsGoldenAge',
  'nuclearWeapon', 'hiddenNationality', 'army', 'leader', 'icbm', 'stealth', 'canSeeSubmarines', 'tacticalMissile',
  'canCarryTacticalMissiles', 'rangedAttackAnimations', 'turnToAttack', 'lethalLandBombard', 'lethalSeaBombard', 'king',
  'requiresEscort',
] as const;

export const PRTO_AI_STRATEGY = [
  'offence', 'defence', 'artillery', 'explore', 'army', 'cruiseMissile', 'airBombard', 'airDefence',
  'navalPower', 'airTransport', 'navalTransport', 'navalCarrier', 'terraform', 'settle', 'leader', 'tacticalNuke',
  'icbm', 'navalMissileTransport',
] as const;

export const PRTO_STANDARD_ORDERS = ['skipTurn', 'wait', 'fortify', 'disband', 'goTo', 'explore', 'sentry'] as const;

export const PRTO_SPECIAL_ACTIONS = [
  'load', 'unload', 'airlift', 'pillage', 'bombard', 'airdrop', 'buildArmy', 'finishImprovements',
  'upgrade', 'capture', 'bit10', 'bit11', 'bit12', 'bit13', 'bit14', 'bit15',
  'stealthAttack', 'bit17', 'enslave',
] as const;

export const PRTO_WORKER_ACTIONS = [
  'buildColony', 'buildCity', 'buildRoad', 'buildRailroad', 'buildFortress', 'buildMine', 'irrigate', 'clearForest',
  'clearJungle', 'plantForest', 'clearPollution', 'automate', 'joinCity', 'buildAirfield', 'buildRadarTower', 'buildOutpost',
] as const;

export const PRTO_AIR_MISSIONS = ['bomb', 'recon', 'intercept', 'rebase', 'precisionBomb'] as const;

export const BLDG_IMPROVEMENT = [
  'centerOfEmpire', 'veteranGroundUnits', 'research50', 'luxury50', 'tax50', 'removesPopulationPollution', 'reducesBuildingPollution', 'resistantToBribery',
  'reducesCorruption', 'doublesCityGrowth', 'increasesLuxuryTrade', 'allowsCitySize2', 'allowsCitySize3', 'replacesOtherBuildings', 'mustBeNearWater', 'mustBeNearRiver',
  'canMeltDown', 'veteranSeaUnits', 'veteranAirUnits', 'capitalization', 'allowsWaterTrade', 'allowsAirTrade', 'reducesWarWeariness', 'increasesShieldsInWater',
  'increasesFoodInWater',
] as const;

export const BLDG_OTHER = [
  'coastalInstallation', 'militaryInstallation', 'wonder', 'smallWonder', 'continentalMoodEffects', 'researchInstallation', 'tradeInstallation', 'explorationInstallation',
  'placeOfWorship', 'constructionInstallation',
] as const;

export const BLDG_SMALL_WONDER = [
  'increasesLeaderChance', 'buildArmiesWithoutLeader', 'buildLargerArmies', 'treasuryEarnsInterest', 'buildSpaceshipParts', 'reducesCorruption', 'decreasesMissileSuccess', 'allowsSpyMissions',
  'allowsHealingInEnemyTerritory', 'goodsMustBeInCityRadius', 'requiresVictoriousArmy',
] as const;

export const BLDG_WONDER = [
  'safeSeaTravel', 'gainAdvancesKnownByTwoCivs', 'doubleCombatVsBarbarians', 'plusOneShipMovement', 'doublesResearch', 'plusOneTradePerTile', 'halvesUpgradeCost', 'paysTradeMaintenance',
  'allowsAllCivsNukes', 'cityGrowthTwoCitizens', 'twoFreeAdvances', 'reducesWarWearinessAll', 'doublesCityDefences', 'allowsDiplomaticVictory',
] as const;

export const RACE_TRAITS = [
  'militaristic', 'commercial', 'expansionist', 'scientific', 'religious', 'industrious', 'agricultural', 'seafaring',
] as const;

export const RACE_BUILD_PREFS = [
  'offensiveLandUnits', 'defensiveLandUnits', 'artilleryLandUnits', 'settlers', 'workers', 'navalUnits', 'airUnits', 'growth',
  'production', 'happiness', 'science', 'wealth', 'trade', 'explore', 'culture',
] as const;

export const RACE_GOVERNOR = [
  'manageCitizens', 'emphasizeFood', 'emphasizeShields', 'emphasizeTrade', 'manageProduction', 'noWonders', 'noSmallWonders',
] as const;

export const TECH_FLAGS = [
  'enablesDiplomats', 'irrigationWithoutFreshWater', 'enablesBridges', 'disablesFloodPlainDisease', 'enablesConscription', 'enablesMobilization', 'enablesRecycling', 'enablesPrecisionBombing',
  'enablesMutualProtectionPacts', 'enablesRightOfPassage', 'enablesMilitaryAlliances', 'enablesTradeEmbargoes', 'doublesWealth', 'enablesSeaTrade', 'enablesOceanTrade', 'enablesMapTrading',
  'enablesCommunicationTrading', 'notRequiredForEraAdvance', 'doublesWorkRate',
] as const;

export const GAME_VICTORY = [
  'dominationVictory', 'spaceRaceVictory', 'diplomaticVictory', 'conquestVictory', 'culturalVictory', 'civSpecificAbilities', 'culturallyLinkedStart', 'restartPlayers',
  'preserveRandomSeed', 'acceleratedProduction', 'elimination', 'regicide', 'massRegicide', 'victoryLocations', 'captureTheFlag', 'allowCulturalConversions',
] as const;

/** Decodes a bit field into the names of its set bits. */
export function bitNames(value: number, names: readonly string[]): string[] {
  const out: string[] = [];
  for (let bit = 0; bit < 32; bit++) {
    if ((value >>> bit) & 1) out.push(names[bit] ?? `bit${bit}`);
  }
  return out;
}
