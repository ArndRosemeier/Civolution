/**
 * Schema of our own curated rule set (packages/rules/data/*.json), the data the engine
 * runs on. Unlike the importer's output this is committed: it holds rule numbers and
 * facts under our own identifiers and field names, never original text or art
 * (PLAN.md D2). Every reference is a string id into another list of the same rule set.
 *
 * The rule set grows phase by phase: Phase 1 covered maps, units and workers; Phase 2
 * adds buildings, specialists, governments in full, difficulty levels and the calendar.
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
  /** Strength against air missions over the unit's tile (Flak, SAM, warships). */
  airDefence: nonNeg,
  zoneOfControl: z.boolean(),
  /** Counts toward the government's unit support (leaders and kings do not). */
  requiresSupport: z.boolean(),
  /** Unit created by enslaving (or capturing) a defeated enemy. */
  enslavesTo: id.optional(),
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

export const CORRUPTION_LEVELS = ['minimal', 'nuisance', 'problematic', 'rampant', 'catastrophic', 'communal', 'off'] as const;

export const GovernmentRuleSchema = z.strictObject({
  id,
  name: z.string(),
  requiredTech: id.optional(),
  /** Worker work rate multiplier under this government. */
  workerRate: nonNeg,
  /** The interim government between two others (Anarchy). */
  transitional: z.boolean(),
  corruption: z.enum(CORRUPTION_LEVELS),
  /** Tiles yielding more than 2 of anything yield one less (Despotism, Anarchy). */
  tilePenalty: z.boolean(),
  /** Tiles yielding at least 1 commerce yield one more (Republic, Democracy). */
  commerceBonus: z.boolean(),
  /** How production can be hurried. */
  hurry: z.enum(['none', 'forcedLabor', 'gold']),
  /** Highest share of commerce, in percent, any one of tax, science and luxury may take. */
  rateCap: percent,
  /** Buildings cost upkeep under this government. */
  buildingUpkeep: z.boolean(),
  draftLimit: nonNeg,
  militaryPoliceLimit: nonNeg,
  /** Units each town, city and metropolis supports for free. */
  freeUnits: z.strictObject({ town: nonNeg, city: nonNeg, metropolis: nonNeg }),
  /** Gold per turn for each unit beyond the free ones. */
  unitCost: nonNeg,
  warWeariness: z.enum(['none', 'low', 'high']),
  xenophobic: z.boolean(),
  forcedResettlement: z.boolean(),
  notes,
});

export const SpecialistRuleSchema = z.strictObject({
  id,
  name: z.string(),
  pluralName: z.string(),
  /** The citizen working a tile; never a specialist. */
  laborer: z.boolean(),
  requiredTech: id.optional(),
  luxury: nonNeg,
  science: nonNeg,
  gold: nonNeg,
  /** Corruption and waste reduction steps (Policeman). */
  corruption: nonNeg,
  /** Shields toward buildings and wonders (Civil Engineer). */
  shields: nonNeg,
  notes,
});

export const DifficultyRuleSchema = z.strictObject({
  id,
  name: z.string(),
  /** Citizens born content in each city before overpopulation makes the rest unhappy. */
  contentCitizens: nonNeg,
  /** Upper bound for anarchy turns; 0 means no difficulty limit. */
  maxAnarchyTurns: nonNeg,
  /** Research cost factor (10 = 100 %). */
  costFactor: nonNeg,
  /** Optimal city number in percent of the world size's value. */
  optimalCitiesPercent: nonNeg,
  corruptionPercent: nonNeg,
  aiDefensiveStartUnits: nonNeg,
  aiOffensiveStartUnits: nonNeg,
  aiExtraStartUnits: z.array(nonNeg),
  aiFreeUnitSupport: nonNeg,
  aiBonusPerCity: nonNeg,
  aiTradeRate: nonNeg,
  attackBonusVsBarbarians: percent,
  notes,
});

export const BuildingRuleSchema = z.strictObject({
  id,
  name: z.string(),
  kind: z.enum(['improvement', 'smallWonder', 'wonder', 'wealth']),
  /** Shields to build. */
  cost: nonNeg,
  /** Gold per turn. */
  upkeep: nonNeg,
  /** Culture points per turn (doubling once the building is 1000 years old). */
  culture: nonNeg,
  requiredTech: id.optional(),
  obsoletedBy: id.optional(),
  /** A building the city must already have (or, with requiredCount > 1, the empire must have that many of). */
  requiredBuilding: id.optional(),
  requiredCount: z.int().min(1),
  requiredGovernment: id.optional(),
  requiredResources: z.array(id),
  /** Unhappy citizens made content in this city. */
  contentFaces: z.int(),
  /** Unhappy citizens made content in every other city (or on the continent with `continental`). */
  contentFacesElsewhere: z.int(),
  /** Mood effects reach the continent rather than the whole empire. */
  continental: z.boolean(),
  /** Production bonus in percent (power plants: of the factory's bonus). */
  productionPercent: nonNeg,
  pollution: nonNeg,
  defenceBonus: percent,
  bombardDefence: nonNeg,
  navalDefenceBonus: percent,
  navalBombardDefence: nonNeg,
  /** Doubles the content faces of this building in every city of the owner. */
  doublesContentOf: id.optional(),
  /** Acts as this building in every city of the owner on the same continent. */
  actsAsOnContinent: id.optional(),
  /** Acts as this building in every city of the owner. */
  actsAsEverywhere: id.optional(),
  /** Produces a free unit every `unitEvery` turns. */
  unitProduced: id.optional(),
  unitEvery: nonNeg,
  /** Effect flags (tax50, research50, reducesCorruption, allowsCitySize2, …). */
  effects: z.array(z.string()),
  /** Categories (militaryInstallation, tradeInstallation, coastalInstallation, …). */
  tags: z.array(z.string()),
  notes,
});

/** A civilization: its leader and the character the AI plays it with (docs/rules/ai.md). */
export const CivRuleSchema = z.strictObject({
  id,
  /** The country ("Rome"), the adjective ("Roman") and the people ("Romans"). */
  name: z.string(),
  adjective: z.string(),
  noun: z.string(),
  leader: z.string(),
  leaderTitle: z.string(),
  leaderFemale: z.boolean(),
  cultureGroup: z.enum(['american', 'european', 'mediterranean', 'middleEastern', 'asian']),
  /** −2 (peaceful) … +2 (aggressive). */
  aggression: z.int().min(-2).max(2),
  favoriteGovernment: id.optional(),
  shunnedGovernment: id.optional(),
  /** Civilization traits (effects arrive in Phase 6). */
  traits: z.array(id),
  /** What the AI builds often or never (offensiveLandUnits, growth, wonders, …). */
  buildOften: z.array(id),
  buildNever: z.array(id),
  /** Index of the civilization's default colour in the rule file's palette. */
  color: nonNeg,
  notes,
});

/** An espionage mission (docs/rules/espionage.md). */
export const EspionageMissionRuleSchema = z.strictObject({
  id,
  name: z.string(),
  /** Who can carry it out: an embassy, a planted spy, or either. */
  needs: z.enum(['embassy', 'spy', 'either']),
  /** Base cost before the era multiplier. */
  baseCost: nonNeg,
  notes,
});

/** How a city's people see a rival culture, by culture ratio (propaganda now, flips in Phase 6). */
export const CultureOpinionRuleSchema = z.strictObject({
  id,
  name: z.string(),
  /** The rival's culture as a percentage of the city owner's at which this opinion starts. */
  ratioPercent: nonNeg,
  propagandaSuccess: percent,
  initialResistanceChance: percent,
  continuedResistanceChance: percent,
});

export const CalendarRuleSchema = z.strictObject({
  startYear: z.int(),
  /** Consecutive spans: `turns` turns of `years` years each; the last one repeats. */
  spans: z.array(z.strictObject({ turns: z.int().positive(), years: z.int().positive() })).min(1),
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
  /** Defence bonus of units in a town, city and metropolis against land attacks. */
  townDefenceBonus: percent,
  cityDefenceBonus: percent,
  metropolisDefenceBonus: percent,
  /** Barbarian units: the early foot unit, the later mounted unit, and their ship. */
  basicBarbarian: id,
  advancedBarbarian: id,
  barbarianSeaUnit: id,
  /** Military great leader born from victories, and the army a leader forms. */
  leaderUnit: id,
  armyUnit: id,
  /** Cities per army a civilization may field (docs/rules/armies.md). */
  citiesPerArmy: z.int().positive(),
  /** Unit that captured workers and settlers become. */
  slaveUnit: id,
  /** Chance in percent that an interceptor engages an air mission, and a stealth one. */
  interceptChance: percent,
  stealthInterceptChance: percent,
  /** Gold per shield of difference when upgrading a unit. */
  upgradeCostPerShield: nonNeg,
  defaultGovernment: id,
  defaultDifficulty: id,
  /** Largest size of a town and of a city; above that a city is a metropolis. */
  maxTownSize: z.int().positive(),
  maxCitySize: z.int().positive(),
  /** Smallest city that can celebrate We Love the King Day. */
  celebrationMinimumSize: nonNeg,
  /** Gold per shield when buying units (improvements cost half). */
  shieldCostInGold: nonNeg,
  /** Shields per gold for the Wealth build. */
  shieldValueInGold: nonNeg,
  /** Shields one citizen is worth when hurrying by forced labour. */
  citizenValueInShields: nonNeg,
  /** Turns a forced-labour sacrifice keeps a citizen unhappy. */
  forcedLaborUnhappyTurns: nonNeg,
  /** Research takes at least / at most this many turns per advance. */
  minimumResearchTime: nonNeg,
  maximumResearchTime: nonNeg,
  futureTechCost: nonNeg,
  goldenAgeDuration: nonNeg,
  /** City culture totals at which borders grow by one ring. */
  borderThresholds: z.array(nonNeg),
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
  buildings: z.array(BuildingRuleSchema),
  specialists: z.array(SpecialistRuleSchema),
  difficulties: z.array(DifficultyRuleSchema),
  civs: z.array(CivRuleSchema),
  espionageMissions: z.array(EspionageMissionRuleSchema),
  cultureOpinions: z.array(CultureOpinionRuleSchema),
  calendar: CalendarRuleSchema,
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
export type BuildingRule = z.infer<typeof BuildingRuleSchema>;
export type SpecialistRule = z.infer<typeof SpecialistRuleSchema>;
export type DifficultyRule = z.infer<typeof DifficultyRuleSchema>;
export type CivRule = z.infer<typeof CivRuleSchema>;
export type EspionageMissionRule = z.infer<typeof EspionageMissionRuleSchema>;
export type CultureOpinionRule = z.infer<typeof CultureOpinionRuleSchema>;
export type CorruptionLevel = (typeof CORRUPTION_LEVELS)[number];
