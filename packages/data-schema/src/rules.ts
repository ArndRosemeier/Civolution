/**
 * Schema of our own curated rule set (packages/rules/data/*.json), the data the engine
 * runs on. Unlike the importer's output this is committed: it holds rule numbers and
 * facts under our own identifiers and field names, never original text or art
 * (PLAN.md D2). Every reference is a string id into another list of the same rule set.
 *
 * The rule set grows phase by phase; Phase 1 covers what maps, units and workers need.
 */
import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'ids are camelCase');
const nonNeg = z.int().min(0);
const percent = z.int();
const notes = z.string().optional();

export const TerrainRuleSchema = z.strictObject({
  id,
  name: z.string(),
  /** Water terrain: only sea units move here, cities and workers cannot use it. */
  water: z.boolean(),
  food: nonNeg,
  shields: nonNeg,
  commerce: nonNeg,
  /** Extra food from irrigation; 0 means the terrain cannot be irrigated. */
  irrigationFood: nonNeg,
  /** Extra shields from a mine; 0 means the terrain cannot be mined. */
  mineShields: nonNeg,
  /** Extra commerce from a road (roads cannot be built where this is 0 on water). */
  roadCommerce: nonNeg,
  /** Defence bonus in percent for units standing here. */
  defenceBonus: percent,
  /** Movement points needed to enter. */
  movementCost: z.int().min(1),
  canFoundCity: z.boolean(),
  impassable: z.boolean(),
  impassableToWheeled: z.boolean(),
  allowsFortress: z.boolean(),
  allowsAirfield: z.boolean(),
  allowsOutpost: z.boolean(),
  allowsRadarTower: z.boolean(),
  /** Resources the map generator may place here. */
  possibleResources: z.array(id),
  /** The terrain-changing job workers can do here and what the tile becomes. */
  transform: z.strictObject({ job: id, result: id }).optional(),
  notes,
});

export const ResourceRuleSchema = z.strictObject({
  id,
  name: z.string(),
  kind: z.enum(['bonus', 'luxury', 'strategic']),
  /** Strategic resources are only visible to players who know this tech. */
  revealedBy: id.optional(),
  /** Relative frequency used by the map generator (strategic resources only). */
  appearanceRatio: nonNeg,
  /** Depletion chance as stored in the rule file; used once resources can run out. */
  disappearanceProbability: nonNeg,
  food: nonNeg,
  shields: nonNeg,
  commerce: nonNeg,
  notes,
});

export const WorkerJobRuleSchema = z.strictObject({
  id,
  name: z.string(),
  /** Base work needed, in worker-turns at a work rate of 1, before the terrain multiplier. */
  baseTurns: nonNeg,
  requiredTech: id.optional(),
  requiredResources: z.array(id),
  notes,
});

export const UnitRuleSchema = z.strictObject({
  id,
  name: z.string(),
  domain: z.enum(['land', 'sea', 'air']),
  attack: nonNeg,
  defence: nonNeg,
  movement: nonNeg,
  shieldCost: nonNeg,
  populationCost: nonNeg,
  hitPointBonus: z.int(),
  bombardStrength: nonNeg,
  bombardRange: nonNeg,
  rateOfFire: nonNeg,
  operationalRange: nonNeg,
  capacity: nonNeg,
  zoneOfControl: z.boolean(),
  requiredTech: id.optional(),
  upgradeTo: id.optional(),
  requiredResources: z.array(id),
  /** Work rate in percent of a standard worker (100); 0 for units that cannot work. */
  workRate: nonNeg,
  /** Worker jobs this unit can do. */
  jobs: z.array(id),
  /** Terrains whose movement cost this unit ignores (pays as flat terrain). */
  ignoresTerrainCost: z.array(id),
  abilities: z.array(z.string()),
  standardOrders: z.array(z.string()),
  specialActions: z.array(z.string()),
  airMissions: z.array(z.string()),
  aiRoles: z.array(z.string()),
  /** Civ ownership bit mask as stored; resolved once civs are curated. */
  availableToMask: z.int(),
  notes,
});

export const TechRuleSchema = z.strictObject({
  id,
  name: z.string(),
  era: id,
  /** Research cost factor as stored in the rule file (tens of beakers before map-size scaling). */
  costFactor: nonNeg,
  prerequisites: z.array(id),
  flags: z.array(z.string()),
  notes,
});

export const EraRuleSchema = z.strictObject({ id, name: z.string() });

export const GovernmentRuleSchema = z.strictObject({
  id,
  name: z.string(),
  requiredTech: id.optional(),
  /** Worker work rate multiplier under this government. */
  workerRate: nonNeg,
  notes,
});

export const WorldSizeRuleSchema = z.strictObject({
  id,
  name: z.string(),
  /** Map width and height in rule-file units (diamond grid, so width × height / 2 tiles). */
  width: z.int().positive(),
  height: z.int().positive(),
  optimalCities: nonNeg,
  techRate: nonNeg,
  distanceBetweenCivs: nonNeg,
  defaultCivs: nonNeg,
});

export const ExperienceLevelRuleSchema = z.strictObject({
  id,
  name: z.string(),
  hitPoints: nonNeg,
  retreatChance: percent,
});

export const CuratedGeneralSchema = z.strictObject({
  /** Movement thirds: a road move costs 1 / roadMovementRate movement points. */
  roadMovementRate: z.int().positive(),
  foodPerCitizen: nonNeg,
  startingGold: nonNeg,
  startUnits: z.array(id),
  scoutUnit: id,
  forestClearShields: nonNeg,
  fortressDefenceBonus: percent,
  fortifiedDefenceBonus: percent,
  riverDefenceBonus: percent,
  defaultGovernment: id,
  notes,
});

export const RuleSetSchema = z.strictObject({
  meta: z.strictObject({ id, name: z.string(), basedOn: z.string(), version: nonNeg }),
  general: CuratedGeneralSchema,
  eras: z.array(EraRuleSchema),
  terrains: z.array(TerrainRuleSchema),
  resources: z.array(ResourceRuleSchema),
  workerJobs: z.array(WorkerJobRuleSchema),
  units: z.array(UnitRuleSchema),
  techs: z.array(TechRuleSchema),
  governments: z.array(GovernmentRuleSchema),
  worldSizes: z.array(WorldSizeRuleSchema),
  experienceLevels: z.array(ExperienceLevelRuleSchema),
});

export type RuleSet = z.infer<typeof RuleSetSchema>;
export type TerrainRule = z.infer<typeof TerrainRuleSchema>;
export type ResourceRule = z.infer<typeof ResourceRuleSchema>;
export type WorkerJobRule = z.infer<typeof WorkerJobRuleSchema>;
export type UnitRule = z.infer<typeof UnitRuleSchema>;
export type TechRule = z.infer<typeof TechRuleSchema>;
export type GovernmentRule = z.infer<typeof GovernmentRuleSchema>;
export type WorldSizeRule = z.infer<typeof WorldSizeRuleSchema>;
export type GeneralRules = z.infer<typeof CuratedGeneralSchema>;
