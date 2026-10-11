/**
 * Derives our rule set from the importer's raw Conquests data: our ids, our field
 * names, only numbers and short names (PLAN.md §6.6). The output is committed as
 * data/conquests.json; `pnpm rules:curate` regenerates it, and a test checks the
 * committed file still matches the install wherever the install is present.
 *
 * Hand corrections belong in CORRECTIONS below so a re-run keeps them.
 */
import type { ImportedRules, RuleSet } from '@civolution/data-schema';

/** Turns a display name into a camelCase id ("Flood Plain" -> "floodPlain"). */
export function toId(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/'/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const id = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  return /^[a-z]/.test(id) ? id : `x${id}`;
}

/** Ids for a list, keeping the first occurrence of a name bare and suffixing repeats with their index. */
function idList(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.map((name, i) => {
    const base = toId(name);
    const out = seen.has(base) ? `${base}${i}` : base;
    seen.add(base);
    return out;
  });
}

const JOB_IDS = [
  'mine', 'irrigation', 'fortress', 'road', 'railroad', 'plantForest', 'clearForest', 'clearWetlands',
  'clearDamage', 'airfield', 'radarTower', 'outpost', 'barricade',
] as const;

const WORKER_ACTION_TO_JOB: Record<string, string> = {
  buildRoad: 'road',
  buildRailroad: 'railroad',
  buildFortress: 'fortress',
  buildMine: 'mine',
  irrigate: 'irrigation',
  clearForest: 'clearForest',
  clearJungle: 'clearWetlands',
  plantForest: 'plantForest',
  clearPollution: 'clearDamage',
  buildAirfield: 'airfield',
  buildRadarTower: 'radarTower',
  buildOutpost: 'outpost',
};

/** What each terrain-changing job turns a tile into. Not stored in the rule file. */
const TRANSFORM_RESULT: Record<string, string> = {
  plantForest: 'forest',
  // The real result is the tile's underlying terrain, which the map keeps; plains is the default.
  clearForest: 'plains',
  clearWetlands: 'grassland',
};

/** Culture groups in rule-file order. */
const CULTURE_GROUPS = ['american', 'european', 'mediterranean', 'middleEastern', 'asian'] as const;

const WATER = new Set(['coast', 'sea', 'ocean']);

const CORRUPTION = ['minimal', 'nuisance', 'problematic', 'rampant', 'catastrophic', 'communal', 'off'] as const;
const HURRY = ['none', 'forcedLabor', 'gold'] as const;
const WEARINESS = ['none', 'low', 'high'] as const;

/** Building flag bits whose names the importer does not know; these are our reading of them. */
const BUILDING_BIT_NAMES: Record<string, string> = {
  'improvement:bit25': 'increasesCommerceInWater',
  'wonder:bit17': 'touristAttraction',
  // The two Conquests building characteristics after placeOfWorship and constructionInstallation.
  'other:bit10': 'agriculturalInstallation',
  'other:bit11': 'seafaringInstallation',
};

/** Building flags that say what kind of building it is rather than what it does. */
const BUILDING_TAGS = new Set([
  'militaryInstallation', 'tradeInstallation', 'researchInstallation', 'explorationInstallation',
  'constructionInstallation', 'coastalInstallation', 'placeOfWorship', 'agriculturalInstallation', 'seafaringInstallation',
]);

/** Border growth thresholds in city culture points (not stored in the rule file; docs/rules/culture.md). */
const BORDER_THRESHOLDS = [10, 100, 1000, 10000, 20000, 40000, 80000];

function popcount(x: number): number {
  let v = x >>> 0;
  let c = 0;
  while (v) {
    v &= v - 1;
    c++;
  }
  return c;
}

export function curate(raw: ImportedRules): RuleSet {
  const terrainIds = idList(raw.terrains.map((t) => t.name));
  const resourceIds = idList(raw.resources.map((r) => r.name));
  const techIds = idList(raw.techs.map((t) => t.name));
  const unitIds = idList(raw.units.map((u) => u.name));
  const eraIds = idList(raw.eras.map((e) => e.name.replace(/ (Times|Ages)$/, '')));
  const govIds = idList(raw.governments.map((g) => g.name));
  const buildingIds = idList(raw.buildings.map((b) => b.name.replace(/^The /, '')));
  const difficultyIds = idList(raw.difficulties.map((d) => d.name));
  if (raw.workerJobs.length !== JOB_IDS.length) throw new Error('unexpected worker job count');

  const ref = (list: readonly string[], i: number): string | undefined => (i >= 0 ? list[i] : undefined);
  const refs = (list: readonly string[], xs: readonly number[]): string[] =>
    xs.filter((i) => i >= 0).map((i) => list[i]!);
  const opt = <K extends string, V>(key: K, v: V | undefined): { [P in K]?: V } =>
    (v === undefined ? {} : { [key]: v }) as { [P in K]?: V };

  const g = raw.generalRules;

  return {
    meta: { id: 'conquests', name: 'Conquests', basedOn: 'Civilization III Complete, Conquests rules', version: 1 },
    general: {
      roadMovementRate: g.roadMovementRate,
      foodPerCitizen: g.foodPerCitizen,
      startingGold: g.startingTreasury,
      startUnits: refs(unitIds, [g.startUnit1, g.startUnit2]),
      scoutUnit: unitIds[g.scoutUnit]!,
      forestClearShields: g.forestValueInShields,
      fortressDefenceBonus: g.fortressDefenceBonus,
      fortifiedDefenceBonus: g.fortificationsDefenceBonus,
      riverDefenceBonus: g.riverDefenceBonus,
      townDefenceBonus: g.townDefenceBonus,
      cityDefenceBonus: g.cityDefenceBonus,
      metropolisDefenceBonus: g.metropolisDefenceBonus,
      basicBarbarian: unitIds[g.basicBarbarian]!,
      advancedBarbarian: unitIds[g.advancedBarbarian]!,
      barbarianSeaUnit: unitIds[g.barbarianSeaUnit]!,
      leaderUnit: unitIds[g.battleCreatedUnit]!,
      armyUnit: unitIds[g.buildArmyUnit]!,
      citiesPerArmy: g.citiesPerArmy,
      slaveUnit: unitIds[g.slaveUnit]!,
      interceptChance: g.chanceInterceptAir,
      stealthInterceptChance: g.chanceInterceptStealth,
      upgradeCostPerShield: g.upgradeCost,
      defaultGovernment: 'despotism',
      defaultDifficulty: difficultyIds[g.defaultDifficulty]!,
      maxTownSize: g.maxCityLevel1Size,
      maxCitySize: g.maxCityLevel2Size,
      celebrationMinimumSize: g.wltkdMinimumPopulation,
      shieldCostInGold: g.shieldCostInGold,
      shieldValueInGold: g.shieldValueInGold,
      citizenValueInShields: g.citizenValueInShields,
      forcedLaborUnhappyTurns: g.hurrySacrificeTurnPenalty,
      minimumResearchTime: g.minimumResearchTime,
      maximumResearchTime: g.maximumResearchTime,
      futureTechCost: g.futureTechCost,
      goldenAgeDuration: g.goldenAgeDuration,
      borderThresholds: BORDER_THRESHOLDS,
      lastTurn: raw.game.turnTimeLimit,
      victory: {
        cityCulture: raw.game.oneCityCultureWin,
        civCulture: raw.game.allCitiesCultureWin,
        dominationLandPercent: raw.game.dominationTerrainPercent,
        dominationPopulationPercent: raw.game.dominationPopulationPercent,
        pointLimit: raw.game.victoryPointLimit,
        wonderPoints: raw.game.wonderVictoryPoints,
        defeatUnitPoints: raw.game.defeatUnitVictoryPoints,
        advancePoints: raw.game.advanceVictoryPoints,
        cityConquestPoints: raw.game.cityConquestVictoryPoints,
      },
    },
    eras: raw.eras.map((e, i) => ({ id: eraIds[i]!, name: e.name })),
    terrains: raw.terrains.map((t, i) => {
      const id = terrainIds[i]!;
      const job = t.workerJob >= 0 ? JOB_IDS[t.workerJob] : undefined;
      return {
        id,
        name: t.name,
        water: WATER.has(id),
        food: t.food,
        shields: t.shields,
        commerce: t.commerce,
        irrigationFood: t.irrigationBonus,
        mineShields: t.miningBonus,
        roadCommerce: t.roadBonus,
        defenceBonus: t.defenceBonus,
        movementCost: t.movementCost,
        canFoundCity: t.allowCities === 1,
        impassable: t.impassable === 1,
        impassableToWheeled: t.impassableByWheeled === 1,
        allowsFortress: t.allowForts === 1,
        allowsAirfield: t.allowAirfields === 1,
        allowsOutpost: t.allowOutposts === 1,
        allowsRadarTower: t.allowRadarTowers === 1,
        possibleResources: refs(resourceIds, t.possibleResources),
        ...opt('transform', job ? { job, result: TRANSFORM_RESULT[job]! } : undefined),
      };
    }),
    resources: raw.resources.map((r, i) => ({
      id: resourceIds[i]!,
      name: r.name,
      kind: (['bonus', 'luxury', 'strategic'] as const)[r.type]!,
      ...opt('revealedBy', ref(techIds, r.prerequisite)),
      appearanceRatio: r.appearanceRatio,
      disappearanceProbability: r.disappearanceProbability,
      food: r.foodBonus,
      shields: r.shieldsBonus,
      commerce: r.commerceBonus,
    })),
    workerJobs: raw.workerJobs.map((j, i) => ({
      id: JOB_IDS[i]!,
      name: j.name,
      baseTurns: j.turnsToComplete,
      ...opt('requiredTech', ref(techIds, j.requiredTech)),
      requiredResources: refs(resourceIds, [j.reqResource1, j.reqResource2]),
    })),
    units: raw.units.map((u, i) => {
      const jobs = u.traits.workerActions.flatMap((a) => (WORKER_ACTION_TO_JOB[a] ? [WORKER_ACTION_TO_JOB[a]] : []));
      if (jobs.includes('fortress')) jobs.push('barricade');
      return {
        id: unitIds[i]!,
        name: u.name,
        domain: (['land', 'sea', 'air'] as const)[u.unitClass]!,
        attack: u.attack,
        defence: u.defence,
        movement: u.movement,
        shieldCost: u.shieldCost,
        populationCost: u.populationCost,
        hitPointBonus: u.hitPointBonus,
        bombardStrength: u.bombardStrength,
        bombardRange: u.bombardRange,
        rateOfFire: u.rateOfFire,
        operationalRange: u.operationalRange,
        capacity: u.capacity,
        airDefence: u.airDefence,
        zoneOfControl: u.zoneOfControl === 1,
        requiresSupport: u.requiresSupport === 1,
        ...opt('enslavesTo', ref(unitIds, u.enslaveResults)),
        ...opt('requiredTech', ref(techIds, u.requiredTech)),
        ...opt('upgradeTo', ref(unitIds, u.upgradeTo)),
        requiredResources: refs(resourceIds, [u.reqResource1, u.reqResource2, u.reqResource3]),
        workRate: Math.round(u.workerStrength * 100),
        jobs,
        ignoresTerrainCost: u.ignoreMovementCost.flatMap((on, t) =>
          on === 1 && terrainIds[t] && !WATER.has(terrainIds[t]) ? [terrainIds[t]] : [],
        ),
        abilities: u.traits.abilities,
        standardOrders: u.traits.standardOrders,
        specialActions: [
          ...u.traits.specialActions,
          ...u.traits.workerActions.filter((a) => !WORKER_ACTION_TO_JOB[a] && !/^bit\d+$/.test(a)),
        ],
        airMissions: u.traits.airMissions,
        aiRoles: u.traits.aiStrategy,
        availableToMask: u.availableTo,
      };
    }),
    techs: raw.techs.map((t, i) => ({
      id: techIds[i]!,
      name: t.name,
      era: eraIds[t.era]!,
      costFactor: t.cost,
      prerequisites: refs(techIds, t.prerequisites),
      flags: t.traits,
    })),
    governments: raw.governments.map((gv, i) => ({
      id: govIds[i]!,
      name: gv.name,
      ...opt('requiredTech', ref(techIds, gv.prerequisiteTech)),
      workerRate: gv.workerRate,
      transitional: gv.transitionType === 1,
      corruption: CORRUPTION[gv.corruption]!,
      tilePenalty: gv.tilePenalty === 1,
      commerceBonus: gv.commerceBonus === 1,
      hurry: HURRY[gv.hurrying]!,
      // Stored in tens of percent.
      rateCap: gv.scienceCap * 10,
      buildingUpkeep: gv.requiresMaintenance === 1,
      draftLimit: gv.draftLimit,
      militaryPoliceLimit: gv.militaryPoliceLimit,
      freeUnits: { town: gv.freeUnitsPerTown, city: gv.freeUnitsPerCity, metropolis: gv.freeUnitsPerMetropolis },
      unitCost: gv.costPerUnit,
      warWeariness: WEARINESS[gv.warWeariness]!,
      xenophobic: gv.xenophobic === 1,
      forcedResettlement: gv.forceResettle === 1,
    })),
    worldSizes: raw.worldSizes.map((w, i) => ({
      id: idList(raw.worldSizes.map((x) => x.name))[i]!,
      name: w.name,
      width: w.width,
      height: w.height,
      optimalCities: w.optimalCities,
      techRate: w.techRate,
      distanceBetweenCivs: w.distanceBetweenCivs,
      defaultCivs: w.numCivs,
    })),
    experienceLevels: raw.experienceLevels.map((x) => ({
      id: toId(x.name),
      name: x.name,
      hitPoints: x.baseHitPoints,
      retreatChance: x.retreatBonus,
    })),
    buildings: raw.buildings.map((b, i) => {
      const effects = (['improvement', 'smallWonder', 'wonder'] as const).flatMap((k) =>
        b.traits[k].flatMap((f) => (/^bit\d+$/.test(f) ? (BUILDING_BIT_NAMES[`${k}:${f}`] ?? []) : [f])),
      );
      const other = b.traits.other.flatMap((f) => (/^bit\d+$/.test(f) ? (BUILDING_BIT_NAMES[`other:${f}`] ?? []) : [f]));
      const kind = other.includes('wonder')
        ? 'wonder'
        : other.includes('smallWonder')
          ? 'smallWonder'
          : effects.includes('capitalization')
            ? 'wealth'
            : 'improvement';
      return {
        id: buildingIds[i]!,
        name: b.name,
        kind,
        // Stored in tens of shields.
        cost: b.cost * 10,
        upkeep: Math.max(0, b.maintenanceCost),
        culture: b.culture,
        ...opt('requiredTech', ref(techIds, b.reqAdvance)),
        ...opt('obsoletedBy', ref(techIds, b.obsoleteBy)),
        ...opt('requiredBuilding', ref(buildingIds, b.reqImprovement)),
        requiredCount: Math.max(1, b.numReqBuildings),
        ...opt('requiredGovernment', ref(govIds, b.reqGovernment)),
        requiredResources: refs(resourceIds, [b.reqResource1, b.reqResource2]),
        contentFaces: b.happy,
        contentFacesElsewhere: b.happyAll,
        continental: other.includes('continentalMoodEffects'),
        // Stored in quarters: 2 is +50 % (docs/rules/production.md).
        productionPercent: b.production * 25,
        pollution: b.pollution,
        defenceBonus: b.defenceBonus,
        bombardDefence: b.bombardDefence,
        navalDefenceBonus: b.navalDefenceBonus,
        navalBombardDefence: b.navalBombardDefence,
        ...opt('doublesContentOf', ref(buildingIds, b.doublesHappinessOf)),
        ...opt('actsAsOnContinent', ref(buildingIds, b.gainOnContinent)),
        ...opt('actsAsEverywhere', ref(buildingIds, b.gainInEveryCity)),
        ...opt('unitProduced', ref(unitIds, b.unitProduced)),
        unitEvery: b.unitProduced >= 0 ? b.unitFrequency : 0,
        spaceshipParts: b.spaceshipPart >= 0 ? (g.spaceshipPartCounts[b.spaceshipPart] ?? 1) : 0,
        effects,
        tags: other.filter((f) => BUILDING_TAGS.has(f)),
      };
    }),
    specialists: raw.citizens.map((c) => ({
      id: toId(c.name),
      name: c.name,
      pluralName: c.pluralName,
      laborer: c.defaultCitizen === 1,
      ...opt('requiredTech', ref(techIds, c.prerequisite)),
      luxury: c.luxuries,
      science: c.research,
      gold: c.taxes,
      corruption: c.corruption,
      shields: c.construction,
    })),
    difficulties: raw.difficulties.map((d, i) => ({
      id: difficultyIds[i]!,
      name: d.name,
      contentCitizens: d.contentCitizens,
      maxAnarchyTurns: d.maxGovtTransitionTime,
      costFactor: d.costFactor,
      optimalCitiesPercent: d.percentOptimalCities,
      corruptionPercent: d.corruptionPercent,
      aiDefensiveStartUnits: d.aiDefensiveStartUnits,
      aiOffensiveStartUnits: d.aiOffensiveStartUnits,
      aiExtraStartUnits: [d.extraStartUnit1, d.extraStartUnit2],
      aiFreeUnitSupport: d.additionalFreeSupport,
      aiBonusPerCity: d.bonusPerCity,
      aiTradeRate: d.aiToAiTradeRate,
      attackBonusVsBarbarians: d.attackBonusVsBarbarians,
    })),
    civs: raw.civs
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => c.cultureGroup >= 0)
      .map(({ c, index }) => ({
        id: toId(c.noun),
        name: c.name,
        adjective: c.adjective,
        noun: c.noun,
        leader: c.leaderName,
        leaderTitle: c.leaderTitle,
        leaderFemale: c.leaderGender === 1,
        cultureGroup: CULTURE_GROUPS[c.cultureGroup]!,
        aggression: c.aggressionLevel,
        ...opt('favoriteGovernment', ref(govIds, c.favoriteGovernment)),
        ...opt('shunnedGovernment', ref(govIds, c.shunnedGovernment)),
        traits: c.traits.civ,
        buildOften: c.traits.buildOften,
        buildNever: c.traits.buildNever,
        color: c.defaultColor,
        unitBit: index,
        uniqueUnits: raw.units.flatMap((u, i) => {
          const m = u.availableTo >>> 0;
          const civs = popcount(m & ~1);
          // A repeated name (Impi, Legionary, …) is a variant the game makes itself, not a unit to build.
          const variant = unitIds[i] !== toId(u.name);
          return civs === 1 && m & (1 << index) && u.shieldCost > 0 && !variant ? [unitIds[i]!] : [];
        }),
        ...opt('kingUnit', ref(unitIds, c.kingUnit)),
        freeTechs: refs(techIds, c.freeTechs),
        cityNames: c.cityNames.map((n) => n.trim()).filter(Boolean),
        militaryLeaders: c.militaryLeaders.map((n) => n.trim()).filter(Boolean),
        scientificLeaders: c.scientificLeaders.map((n) => n.trim()).filter(Boolean),
      })),
    espionageMissions: raw.espionageMissions.map((m) => ({
      id: toId(m.name.replace(/^(Build an|Initiate) /, '')),
      name: m.name,
      needs: m.performedBy === 1 ? ('embassy' as const) : m.performedBy === 2 ? ('spy' as const) : ('either' as const),
      baseCost: m.baseCost,
    })),
    cultureOpinions: raw.cultureOpinions.map((o) => ({
      id: toId(o.name),
      name: o.name,
      ratioPercent: o.cultureRatioPercent,
      propagandaSuccess: o.propagandaSuccess,
      initialResistanceChance: o.initialResistanceChance,
      continuedResistanceChance: o.continuedResistanceChance,
    })),
    calendar: {
      startYear: raw.game.startYear,
      spans: raw.game.turnsPerTimescalePart.map((turns, i) => ({ turns, years: raw.game.timeUnitsPerTurn[i]! })),
    },
  };
}
