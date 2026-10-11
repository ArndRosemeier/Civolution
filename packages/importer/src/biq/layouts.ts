/**
 * Record layouts of the BIQ sections that carry rules.
 *
 * Field order and sizes follow the community-documented BIC/BIX/BIQ format
 * (Gramphos et al., Apolyton "Civilization III BIX/BIQ file format"), corrected
 * against the actual Conquests file. Field names are ours. Each layout ends in
 * `rest('unparsed')`, so bytes we do not understand yet survive a round trip and
 * show up in the import report.
 */
import type { Codec } from '../codec.ts';

export type Edition = 'vanilla' | 'ptw' | 'conquests';

export interface LayoutContext {
  edition: Edition;
  /** Number of eras (ERAS records); RACE stores per-era file names. */
  eras: number;
  /** Number of terrain types; PRTO stores a per-terrain flag. */
  terrains: number;
}

export type Layout = (c: Codec, ctx: LayoutContext) => void;

const c3c = (ctx: LayoutContext) => ctx.edition === 'conquests';

export const header: Layout = (c) => {
  c.i32('unknown1');
  c.i32('unknown2');
  c.i32('majorVersion');
  c.i32('minorVersion');
  c.str('description', 640);
  c.str('title', 64);
};

export const BLDG: Layout = (c, ctx) => {
  c.str('description', 64);
  c.str('name', 32);
  c.str('civilopediaEntry', 32);
  c.i32('doublesHappinessOf');
  c.i32('gainInEveryCity');
  c.i32('gainOnContinent');
  c.i32('reqImprovement');
  c.i32('cost');
  c.i32('culture');
  c.i32('bombardDefence');
  c.i32('navalBombardDefence');
  c.i32('defenceBonus');
  c.i32('navalDefenceBonus');
  c.i32('maintenanceCost');
  c.i32('happyAll');
  c.i32('happy');
  c.i32('unhappyAll');
  c.i32('unhappy');
  c.i32('numReqBuildings');
  c.i32('airPower');
  c.i32('navalPower');
  c.i32('pollution');
  c.i32('production');
  c.i32('reqGovernment');
  c.i32('spaceshipPart');
  c.i32('reqAdvance');
  c.i32('obsoleteBy');
  c.i32('reqResource1');
  c.i32('reqResource2');
  c.i32('improvementFlags');
  c.i32('otherFlags');
  c.i32('smallWonderFlags');
  c.i32('wonderFlags');
  c.i32('armiesRequired');
  if (c3c(ctx)) {
    c.i32('flavors');
    c.i32('unknown1');
    c.i32('unitProduced');
    c.i32('unitFrequency');
  }
  c.rest('unparsed');
};

export const CTZN: Layout = (c, ctx) => {
  c.i32('defaultCitizen');
  c.str('name', 32);
  c.str('civilopediaEntry', 32);
  c.str('pluralName', 32);
  c.i32('prerequisite');
  c.i32('luxuries');
  c.i32('research');
  c.i32('taxes');
  if (c3c(ctx)) {
    c.i32('corruption');
    c.i32('construction');
  }
  c.rest('unparsed');
};

export const CULT: Layout = (c) => {
  c.str('name', 64);
  c.i32('propagandaSuccess');
  c.i32('cultureRatioPercent');
  c.i32('ratioDenominator');
  c.i32('ratioNumerator');
  c.i32('initialResistanceChance');
  c.i32('continuedResistanceChance');
  c.rest('unparsed');
};

export const DIFF: Layout = (c, ctx) => {
  c.str('name', 64);
  c.i32('contentCitizens');
  c.i32('maxGovtTransitionTime');
  c.i32('aiDefensiveStartUnits');
  c.i32('aiOffensiveStartUnits');
  c.i32('extraStartUnit1');
  c.i32('extraStartUnit2');
  c.i32('additionalFreeSupport');
  c.i32('bonusPerCity');
  c.i32('attackBonusVsBarbarians');
  c.i32('costFactor');
  c.i32('percentOptimalCities');
  c.i32('aiToAiTradeRate');
  c.i32('corruptionPercent');
  if (ctx.edition !== 'vanilla') c.i32('militaryLaw');
  c.rest('unparsed');
};

export const ERAS: Layout = (c, ctx) => {
  c.str('name', 64);
  c.str('civilopediaEntry', 32);
  c.strs('researchers', 32, 5);
  c.i32('usedResearcherNames');
  if (c3c(ctx)) c.i32('unknown1');
  c.rest('unparsed');
};

export const ESPN: Layout = (c) => {
  c.str('description', 128);
  c.str('name', 64);
  c.str('civilopediaEntry', 32);
  c.i32('performedBy');
  c.i32('baseCost');
  c.rest('unparsed');
};

export const EXPR: Layout = (c) => {
  c.str('name', 32);
  c.i32('baseHitPoints');
  c.i32('retreatBonus');
  c.rest('unparsed');
};

export const GOOD: Layout = (c) => {
  c.str('name', 24);
  c.str('civilopediaEntry', 32);
  c.i32('type');
  c.i32('appearanceRatio');
  c.i32('disappearanceProbability');
  c.i32('icon');
  c.i32('prerequisite');
  c.i32('foodBonus');
  c.i32('shieldsBonus');
  c.i32('commerceBonus');
  c.rest('unparsed');
};

export const GOVT: Layout = (c, ctx) => {
  c.i32('defaultType');
  c.i32('transitionType');
  c.i32('requiresMaintenance');
  c.i32('unknown1');
  c.i32('tilePenalty');
  c.i32('commerceBonus');
  c.str('name', 64);
  c.str('civilopediaEntry', 32);
  c.strs('rulerTitles', 32, 8);
  c.i32('corruption');
  c.i32('immuneTo');
  c.i32('diplomatsAre');
  c.i32('spiesAre');
  const n = c.i32('numGovernments');
  c.list('relations', n, (r) => {
    r.i32('canBribe');
    r.i32('briberyModifier');
    r.i32('resistanceModifier');
  });
  c.i32('hurrying');
  c.i32('assimilationChance');
  c.i32('draftLimit');
  c.i32('militaryPoliceLimit');
  c.i32('rulerTitlePairsUsed');
  c.i32('prerequisiteTech');
  c.i32('scienceCap');
  c.i32('workerRate');
  c.i32('unknown2');
  c.i32('unknown3');
  c.i32('unknown4');
  c.i32('freeUnits');
  c.i32('freeUnitsPerTown');
  c.i32('freeUnitsPerCity');
  c.i32('freeUnitsPerMetropolis');
  c.i32('costPerUnit');
  c.i32('warWeariness');
  if (c3c(ctx)) {
    c.i32('xenophobic');
    c.i32('forceResettle');
  }
  c.rest('unparsed');
};

export const RULE: Layout = (c, ctx) => {
  c.strs('citySizeNames', 32, 3);
  const parts = c.i32('numSpaceshipParts');
  c.i32s('spaceshipPartCounts', parts);
  c.i32('advancedBarbarian');
  c.i32('basicBarbarian');
  c.i32('barbarianSeaUnit');
  c.i32('citiesPerArmy');
  c.i32('chanceOfRioting');
  c.i32('draftTurnPenalty');
  c.i32('shieldCostInGold');
  c.i32('fortressDefenceBonus');
  c.i32('citizensAffectedByHappyFace');
  c.i32('unknown1');
  c.i32('unknown2');
  c.i32('forestValueInShields');
  c.i32('shieldValueInGold');
  c.i32('citizenValueInShields');
  c.i32('defaultDifficulty');
  c.i32('battleCreatedUnit');
  c.i32('buildArmyUnit');
  c.i32('buildingDefenceBonus');
  c.i32('citizenDefenceBonus');
  c.i32('defaultMoneyResource');
  c.i32('chanceInterceptAir');
  c.i32('chanceInterceptStealth');
  c.i32('startingTreasury');
  c.i32('unknown3');
  c.i32('foodPerCitizen');
  c.i32('riverDefenceBonus');
  c.i32('hurrySacrificeTurnPenalty');
  c.i32('scoutUnit');
  c.i32('slaveUnit');
  c.i32('roadMovementRate');
  c.i32('startUnit1');
  c.i32('startUnit2');
  c.i32('wltkdMinimumPopulation');
  c.i32('townDefenceBonus');
  c.i32('cityDefenceBonus');
  c.i32('metropolisDefenceBonus');
  c.i32('maxCityLevel1Size');
  c.i32('maxCityLevel2Size');
  c.i32('unknown4');
  c.i32('fortificationsDefenceBonus');
  const levels = c.i32('numCultureLevels');
  c.strs('cultureLevelNames', 64, levels);
  c.i32('borderExpansionMultiplier');
  c.i32('borderFactor');
  c.i32('futureTechCost');
  c.i32('goldenAgeDuration');
  c.i32('maximumResearchTime');
  c.i32('minimumResearchTime');
  if (ctx.edition !== 'vanilla') c.i32('flagUnit');
  if (c3c(ctx)) c.i32('upgradeCost');
  c.rest('unparsed');
};

export const PRTO: Layout = (c, ctx) => {
  c.i32('zoneOfControl');
  c.str('name', 32);
  c.str('civilopediaEntry', 32);
  c.i32('bombardStrength');
  c.i32('bombardRange');
  c.i32('capacity');
  c.i32('shieldCost');
  c.i32('defence');
  c.i32('iconIndex');
  c.i32('attack');
  c.i32('operationalRange');
  c.i32('populationCost');
  c.i32('rateOfFire');
  c.i32('movement');
  c.i32('requiredTech');
  c.i32('upgradeTo');
  c.i32('reqResource1');
  c.i32('reqResource2');
  c.i32('reqResource3');
  c.i32('abilities');
  c.i32('aiStrategy');
  c.i32('availableTo');
  c.i32('ordersLegacy');
  c.i32('airMissionsLegacy');
  c.i32('unitClass');
  c.i32('otherStrategy');
  c.i32('hitPointBonus');
  if (ctx.edition === 'vanilla') {
    c.rest('unparsed');
    return;
  }
  c.i32('standardOrders');
  c.i32('specialActions');
  c.i32('workerActions');
  c.i32('airMissions');
  c.i16('actionsMix');
  c.i16('unknown1');
  c.i32('bombardEffects');
  c.u8s('ignoreMovementCost', ctx.terrains);
  c.i32('requiresSupport');
  if (ctx.edition === 'ptw') {
    c.rest('unparsed');
    return;
  }
  c.i32('unknown2');
  c.i32('unknown3');
  c.i32('unknown4');
  c.i32('unknown5');
  c.i32('enslaveResults');
  c.i32('unknown6');
  const stealth = c.i32('numStealthTargets');
  c.i32s('stealthTargets', stealth);
  c.i32('unknown7');
  c.i32('unknown8');
  c.u8('createsCraters');
  c.f32('workerStrength');
  c.i32('unknown9');
  c.i32('airDefence');
  c.rest('unparsed');
};

export const RACE: Layout = (c, ctx) => {
  const cities = c.i32('numCityNames');
  c.strs('cityNames', 24, cities);
  const leaders = c.i32('numMilitaryLeaders');
  c.strs('militaryLeaders', 32, leaders);
  c.str('leaderName', 32);
  c.str('leaderTitle', 24);
  c.str('civilopediaEntry', 32);
  c.str('adjective', 40);
  c.str('name', 40);
  c.str('noun', 40);
  c.strs('forwardFilenames', 260, ctx.eras);
  c.strs('reverseFilenames', 260, ctx.eras);
  c.i32('cultureGroup');
  c.i32('leaderGender');
  c.i32('civGender');
  c.i32('aggressionLevel');
  c.i32('uniqueCivCounter');
  c.i32('shunnedGovernment');
  c.i32('favoriteGovernment');
  c.i32('defaultColor');
  c.i32('uniqueColor');
  c.i32s('freeTechs', 4);
  c.i32('bonuses');
  c.i32('governorSettings');
  c.i32('buildNever');
  c.i32('buildOften');
  c.i32('plurality');
  if (ctx.edition !== 'vanilla') c.i32('kingUnit');
  if (c3c(ctx)) {
    c.i32('flavors');
    c.i32('unknown1');
    c.i32('diplomacyTextIndex');
    const sci = c.i32('numScientificLeaders');
    c.strs('scientificLeaders', 32, sci);
  }
  c.rest('unparsed');
};

export const TECH: Layout = (c, ctx) => {
  c.str('name', 32);
  c.str('civilopediaEntry', 32);
  c.i32('cost');
  c.i32('era');
  c.i32('icon');
  c.i32('x');
  c.i32('y');
  c.i32s('prerequisites', 4);
  c.i32('flags');
  if (c3c(ctx)) {
    c.i32('flavors');
    c.i32('unknown1');
  }
  c.rest('unparsed');
};

export const TFRM: Layout = (c) => {
  c.str('name', 32);
  c.str('civilopediaEntry', 32);
  c.i32('turnsToComplete');
  c.i32('requiredTech');
  c.i32('reqResource1');
  c.i32('reqResource2');
  c.str('order', 32);
  c.rest('unparsed');
};

export const TERR: Layout = (c, ctx) => {
  const n = c.i32('numPossibleResources');
  c.u8s('possibleResourcesMask', Math.ceil(n / 8));
  c.str('name', 32);
  c.str('civilopediaEntry', 32);
  c.i32('irrigationBonus');
  c.i32('miningBonus');
  c.i32('roadBonus');
  c.i32('defenceBonus');
  c.i32('movementCost');
  c.i32('food');
  c.i32('shields');
  c.i32('commerce');
  c.i32('workerJob');
  c.i32('pollutionEffect');
  c.u8('allowCities');
  c.u8('allowColonies');
  if (ctx.edition === 'vanilla') {
    c.rest('unparsed');
    return;
  }
  c.u8('impassable');
  c.u8('impassableByWheeled');
  c.u8('allowAirfields');
  c.u8('allowForts');
  c.u8('allowOutposts');
  c.u8('allowRadarTowers');
  if (c3c(ctx)) {
    c.i32('unknown1');
    c.u8('landmarkEnabled');
    c.i32('landmarkFood');
    c.i32('landmarkShields');
    c.i32('landmarkCommerce');
    c.i32('landmarkIrrigationBonus');
    c.i32('landmarkMiningBonus');
    c.i32('landmarkRoadBonus');
    c.i32('landmarkMovementCost');
    c.i32('landmarkDefenceBonus');
    c.str('landmarkName', 32);
    c.str('landmarkCivilopediaEntry', 32);
    c.i32('unknown2');
    c.i32('terrainFlags');
    c.i32('diseaseStrength');
  }
  c.rest('unparsed');
};

export const WSIZ: Layout = (c) => {
  c.i32('optimalCities');
  c.i32('techRate');
  c.str('unknown1', 24);
  c.str('name', 32);
  c.i32('height');
  c.i32('distanceBetweenCivs');
  c.i32('numCivs');
  c.i32('width');
  c.rest('unparsed');
};

/** FLAV has no per-record length prefix; this layout covers the whole section body. */
export const FLAV: Layout = (c) => {
  const groups = c.i32('numGroups');
  c.list('groups', groups, (g) => {
    const n = g.i32('numFlavors');
    g.list('flavors', n, (f) => {
      f.i32('unknown1');
      f.str('name', 256);
      const rel = f.i32('numRelations');
      f.i32s('relations', rel);
    });
  });
};

export const GAME: Layout = (c, ctx) => {
  c.i32('useDefaultRules');
  c.i32('useDefaultVictoryConditions');
  const playable = c.i32('numPlayableCivs');
  c.i32s('playableCivs', playable);
  c.i32('victoryFlags');
  if (ctx.edition === 'vanilla') {
    c.rest('unparsed');
    return;
  }
  c.i32('placeCaptureUnits');
  c.i32('autoPlaceKings');
  c.i32('autoPlaceVictoryLocations');
  c.i32('debugMode');
  c.i32('useTimeLimit');
  c.i32('baseTimeUnit');
  c.i32('startMonth');
  c.i32('startWeek');
  c.i32('startYear');
  c.i32('minuteTimeLimit');
  c.i32('turnTimeLimit');
  c.i32s('turnsPerTimescalePart', 7);
  c.i32s('timeUnitsPerTurn', 7);
  c.str('searchFolders', 5200);
  if (ctx.edition === 'ptw') {
    c.rest('unparsed');
    return;
  }
  c.i32s('alliances', playable);
  c.i32('victoryPointLimit');
  c.i32('cityEliminationCount');
  c.i32('oneCityCultureWin');
  c.i32('allCitiesCultureWin');
  c.i32('dominationTerrainPercent');
  c.i32('dominationPopulationPercent');
  c.i32('wonderVictoryPoints');
  c.i32('defeatUnitVictoryPoints');
  c.i32('advanceVictoryPoints');
  c.i32('cityConquestVictoryPoints');
  c.i32('victoryPointScoring');
  c.i32('captureSpecialUnitVictoryPoints');
  c.i32('unknown1');
  c.u8('unknown2');
  c.strs('allianceNames', 256, 5);
  c.i32s('allianceWars', 25);
  c.i32('allianceVictoryType');
  c.str('plagueName', 260);
  c.u8('permitPlagues');
  c.i32('plagueEarliestStart');
  c.i32('plagueVariation');
  c.i32('plagueDuration');
  c.i32('plagueStrength');
  c.i32('plagueGracePeriod');
  c.i32('plagueMaxOccurrence');
  c.i32('unknown3');
  c.str('unknown4', 260);
  c.i32('respawnFlagUnits');
  c.u8('captureAnyFlag');
  c.i32('goldForCapture');
  c.u8('mapVisible');
  c.u8('retainCulture');
  c.i32('unknown5');
  c.i32('eruptionPeriod');
  c.i32('mpBaseTime');
  c.i32('mpCityTime');
  c.i32('mpUnitTime');
  c.rest('unparsed');
};

/** Sections whose records we decode, by tag. */
export const LAYOUTS: Record<string, Layout> = {
  BLDG,
  CTZN,
  CULT,
  DIFF,
  ERAS,
  ESPN,
  EXPR,
  GOOD,
  GOVT,
  RULE,
  PRTO,
  RACE,
  TECH,
  TFRM,
  TERR,
  WSIZ,
  GAME,
};
