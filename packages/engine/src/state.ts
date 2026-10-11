/**
 * Game state: plain serialisable data, no classes (PLAN.md §5). A save is this object
 * plus the rule-set hash; a replay is the seed plus the command log.
 */
import type { RngState } from './rng.ts';

/** Improvement bits in `MapState.improvements`. */
export const IMP_ROAD = 1;
export const IMP_RAIL = 2;
export const IMP_IRRIGATION = 4;
export const IMP_MINE = 8;
export const IMP_FORTRESS = 16;
export const IMP_BARRICADE = 32;
export const IMP_POLLUTION = 64;
export const IMP_CRATER = 128;

/** Bits in `MapState.flags`. */
export const FLAG_BONUS_GRASSLAND = 1;
export const FLAG_LAKE = 2;
export const FLAG_HUT = 4;
/** A barbarian camp (docs/rules/barbarians.md). */
export const FLAG_CAMP = 8;

export type LandForm = 'archipelago' | 'continents' | 'pangaea';
export type Climate = 'arid' | 'normal' | 'wet';
export type Temperature = 'cool' | 'temperate' | 'warm';
export type Barbarians = 'none' | 'sedentary' | 'roaming' | 'restless' | 'raging';

/** Civ3's map parameters, resolved (no "random" left). */
export interface MapSettings {
  worldSize: string;
  landForm: LandForm;
  /** Percent of the map covered by water: Civ3 offers 60, 70 or 80. */
  waterPercent: 60 | 70 | 80;
  climate: Climate;
  temperature: Temperature;
  /** World age in billions of years: 3 is rugged, 5 is worn flat. */
  age: 3 | 4 | 5;
  barbarians: Barbarians;
}

export interface MapState {
  width: number;
  height: number;
  wrapX: boolean;
  /** Per tile: index into rules.terrains. */
  terrain: number[];
  /** Per tile: terrain under a forest, jungle or marsh (what clearing reveals), else -1. */
  underlying: number[];
  /** Per tile: river edge bits (EDGE_NE | EDGE_SE | EDGE_SW | EDGE_NW). */
  rivers: number[];
  /** Per tile: index into rules.resources, or -1. */
  resource: number[];
  /** Per tile: IMP_* bits. */
  improvements: number[];
  /** Per tile: FLAG_* bits. */
  flags: number[];
  /** Per tile: the player whose borders include it, or -1 (docs/rules/culture.md). */
  territory: number[];
  /** Start positions chosen by the generator, one per player slot. */
  starts: number[];
  /** Bumped whenever terrain, improvements or flags change, so views know to refresh. */
  revision: number;
}

export type Order =
  | { type: 'fortify' }
  | { type: 'sentry' }
  | { type: 'goto'; target: number }
  | { type: 'work'; job: string }
  /** Aircraft on interception duty (docs/rules/air.md). */
  | { type: 'intercept' };

export interface Unit {
  id: number;
  owner: number;
  type: string;
  tile: number;
  /** Movement left this turn, in thirds of a movement point. */
  movesLeft: number;
  experience: string;
  /** Hit points left (docs/rules/combat.md); an army's is the sum of its members'. */
  hp: number;
  fortified: boolean;
  /** Moved, attacked or bombarded this turn (units that did not heal). */
  acted: boolean;
  /** Made its attack or bombardment this turn (only blitz units attack again). */
  attacked: boolean;
  /** The transport, carrier or army holding this unit, or null. Carried units share its tile. */
  carriedBy: number | null;
  order: Order | null;
  /** Automation routine assigned by the player (run by @civolution/automation), or null. */
  routine: string | null;
}

export interface Player {
  id: number;
  name: string;
  /** CSS colour. */
  color: string;
  human: boolean;
  /** The barbarian tribes: always at war with everyone, moved by the engine (docs/rules/barbarians.md). */
  barbarian: boolean;
  alive: boolean;
  gold: number;
  government: string;
  techs: string[];
  /**
   * Resources granted by a scenario or test on top of what the trade network connects
   * (queries.availableResources has the full set).
   */
  resources: string[];
  /** Tax, science and luxury shares in tens of percent; they add up to 10. */
  rates: Rates;
  research: Research;
  /** Index into rules.set.eras of the era the player is in. */
  era: number;
  /** Set while in anarchy: the government that follows and the turn it takes over. */
  revolution: { target: string; endsOnTurn: number } | null;
  /** Culture points accumulated by all the player's cities, ever. */
  culture: number;
  /** Bitset of explored tiles, 32 tiles per word. */
  explored: number[];
  /** Players this player is at war with. */
  atWarWith: number[];
  /** War weariness points per enemy player id (docs/rules/war-weariness.md). */
  weariness: Record<string, number>;
  /** One of the player's armies has won a battle (unlocks the Military Academy and Heroic Epic). */
  armyVictory: boolean;
  endedTurn: boolean;
}

export interface Rates {
  tax: number;
  science: number;
  luxury: number;
}

export interface Research {
  /** Tech being researched, or null when the player has not chosen. */
  tech: string | null;
  /** Beakers collected toward it (kept when the target changes). */
  beakers: number;
  /** Turns spent on the current target (minimum and maximum research time). */
  turns: number;
}

/** What a city is building. */
export type Build = { kind: 'unit'; id: string } | { kind: 'building'; id: string };

export interface City {
  id: number;
  owner: number;
  name: string;
  tile: number;
  size: number;
  /** Food in the food box. */
  food: number;
  /** Shields toward the current build. */
  shields: number;
  build: Build | null;
  /** Builds that follow the current one. */
  queue: Build[];
  /** Category the shields were collected for; switching category loses half (docs/rules/production.md). */
  shieldsFor: 'unit' | 'improvement' | 'wonder' | null;
  /** Buildings present, mapped to the turn they were completed. */
  buildings: Record<string, number>;
  /** Tiles worked by laborers (never the city tile itself, which is always worked). */
  worked: number[];
  /** Specialists by specialist id. */
  specialists: Record<string, number>;
  /** When false the city reassigns its tiles itself as it grows and shrinks. */
  manualTiles: boolean;
  /** Accumulated culture points. */
  culture: number;
  founded: number;
  /** Consecutive turns in civil disorder. */
  disorder: number;
  celebrating: boolean;
  /** Turns on which forced-labour unhappiness ends, one entry per sacrificed citizen. */
  forcedLabor: number[];
  /** A hurry was paid this turn; the build completes at the end of the turn. */
  hurried: boolean;
  /** Turns until the next free unit from a wonder such as the Statue of Zeus. */
  wonderUnitTimer: number;
}

export interface WorkProgress {
  job: string;
  /** Work done, in percent-of-a-worker-turn units (see docs/rules/workers.md). */
  done: number;
}

export interface GameState {
  format: 'civolution-state';
  version: 3;
  rulesHash: string;
  seed: number;
  rng: RngState;
  turn: number;
  settings: MapSettings;
  map: MapState;
  players: Player[];
  units: Record<string, Unit>;
  nextUnitId: number;
  /** Ongoing worker jobs keyed by tile index. */
  work: Record<string, WorkProgress>;
  /** Difficulty level id. */
  difficulty: string;
  cities: Record<string, City>;
  nextCityId: number;
  /** Great wonders built anywhere, mapped to the city that holds them (-1: destroyed with its city). */
  wonders: Record<string, number>;
}
