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

const WATER = new Set(['coast', 'sea', 'ocean']);

export function curate(raw: ImportedRules): RuleSet {
  const terrainIds = idList(raw.terrains.map((t) => t.name));
  const resourceIds = idList(raw.resources.map((r) => r.name));
  const techIds = idList(raw.techs.map((t) => t.name));
  const unitIds = idList(raw.units.map((u) => u.name));
  const eraIds = idList(raw.eras.map((e) => e.name.replace(/ (Times|Ages)$/, '')));
  const govIds = idList(raw.governments.map((g) => g.name));
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
      defaultGovernment: 'despotism',
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
        zoneOfControl: u.zoneOfControl === 1,
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
  };
}
