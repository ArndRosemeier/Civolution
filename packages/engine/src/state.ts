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
  /** Start positions chosen by the generator, one per player slot. */
  starts: number[];
  /** Bumped whenever terrain, improvements or flags change, so views know to refresh. */
  revision: number;
}

export type Order =
  | { type: 'fortify' }
  | { type: 'sentry' }
  | { type: 'goto'; target: number }
  | { type: 'work'; job: string };

export interface Unit {
  id: number;
  owner: number;
  type: string;
  tile: number;
  /** Movement left this turn, in thirds of a movement point. */
  movesLeft: number;
  experience: string;
  fortified: boolean;
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
  alive: boolean;
  gold: number;
  government: string;
  techs: string[];
  /**
   * Resources the player can use. Until trade networks exist (Phase 2) this is set by the
   * scenario or by tests.
   */
  resources: string[];
  /** Bitset of explored tiles, 32 tiles per word. */
  explored: number[];
  /** Players this player is at war with. */
  atWarWith: number[];
  endedTurn: boolean;
}

export interface WorkProgress {
  job: string;
  /** Work done, in percent-of-a-worker-turn units (see docs/rules/workers.md). */
  done: number;
}

export interface GameState {
  format: 'civolution-state';
  version: 1;
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
}
