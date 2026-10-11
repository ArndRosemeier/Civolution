/**
 * Game state: plain serialisable data, no classes (PLAN.md §5). A save is this object
 * plus the rule-set hash; a replay is the seed plus the command log.
 */
import type { AutomationSettings } from './automation.ts';
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
  /** `route` is the planned path still ahead (without the unit's tile); missing means plan again. */
  | { type: 'goto'; target: number; route?: number[] }
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
  /** A great leader's name (docs/rules/leaders.md); absent for other units. */
  name?: string;
  /** A scientific great leader: hurries buildings and wonders, cannot lead an army. */
  scientific?: boolean;
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
  /** Turn each current war began, by enemy player id. */
  warSince: Record<string, number>;
  /** War weariness points per enemy player id (docs/rules/war-weariness.md). */
  weariness: Record<string, number>;
  /** One of the player's armies has won a battle (unlocks the Military Academy and Heroic Epic). */
  armyVictory: boolean;
  endedTurn: boolean;
  /** The civilization played (rules.set.civs), or null for unnamed players and the barbarians. */
  civ: string | null;
  /** Civilizations this one has met (docs/rules/diplomacy.md). */
  contacts: number[];
  /** Civilizations where this one keeps an embassy. */
  embassies: number[];
  /** Civilizations where this one has planted a spy (docs/rules/espionage.md). */
  spies: number[];
  /** Standing for keeping its word, 0–100; broken treaties lower it. */
  reputation: number;
  /** What this civilization remembers about each other one, −100 … 100 (attitude before standing and circumstances). */
  memory: Record<string, number>;
  /** What the player hands to automation and how (PLAN.md §8; run by @civolution/automation). */
  automation: AutomationSettings;
  /** The running golden age (docs/rules/golden-ages.md), or null. */
  goldenAge: { since: number; until: number } | null;
  /** A civilization has one golden age per game. */
  hadGoldenAge: boolean;
  /** Great leaders born so far, for their names. */
  leadersBorn: number;
  /** The spaceship (docs/rules/spaceship.md). */
  spaceship: Spaceship;
  /** Points in a victory-point game (docs/rules/victory.md). */
  victoryPoints: number;
  /** Score at the end of each turn so far (the histograph). */
  scores: number[];
}

export interface Spaceship {
  /** Parts built, by spaceship building id. */
  parts: Record<string, number>;
  /** Turn the ship was launched and the turn it arrives, or null. */
  launched: number | null;
  arrives: number | null;
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
  /** Turn the current owner took the city by force, or null; it may be razed that turn. */
  capturedOn: number | null;
  /** Last turn a unit was airlifted out of the city (one airlift per airport and turn). */
  airliftedOn: number;
  /** The civilization whose people live here (the founder; docs/rules/culture.md). */
  nationality: number;
  /** Citizens resisting a new owner; they neither work nor obey (docs/rules/culture.md). */
  resisters: number;
}

export interface WorkProgress {
  job: string;
  /** Work done, in percent-of-a-worker-turn units (see docs/rules/workers.md). */
  done: number;
}

export type TreatyKind = 'peace' | 'ceasefire' | 'rightOfPassage' | 'mutualProtection' | 'alliance' | 'embargo';

/** A standing agreement between two civilizations (docs/rules/diplomacy.md). */
export interface Treaty {
  id: number;
  kind: TreatyKind;
  /** The two parties, lower id first. */
  parties: [number, number];
  since: number;
  /** Turn the treaty runs out (ceasefires), or null when it lasts until broken. */
  until: number | null;
  /** The common enemy of an alliance, or the target of an embargo. */
  against?: number;
}

/** One thing changing hands in a deal. Treaty items bind both sides whichever list holds them. */
export type DealItem =
  | { kind: 'gold'; amount: number }
  | { kind: 'goldPerTurn'; amount: number }
  | { kind: 'tech'; tech: string }
  | { kind: 'worldMap' }
  | { kind: 'contact'; player: number }
  | { kind: 'embassy' }
  | { kind: 'resource'; resource: string }
  | { kind: 'city'; city: number }
  | { kind: 'peace' }
  | { kind: 'ceasefire' }
  | { kind: 'rightOfPassage' }
  | { kind: 'mutualProtection' }
  | { kind: 'alliance'; against: number }
  | { kind: 'embargo'; against: number };

/** A trade offer: `give` goes from `from` to `to`, `take` from `to` to `from`. */
export interface Deal {
  from: number;
  to: number;
  give: DealItem[];
  take: DealItem[];
}

/** An offer waiting for its recipient's answer. */
export interface Proposal extends Deal {
  id: number;
  turn: number;
}

/** A per-turn obligation from a deal: gold or a resource flowing for a number of turns. */
export interface OngoingDeal {
  id: number;
  from: number;
  to: number;
  item: { kind: 'goldPerTurn'; amount: number } | { kind: 'resource'; resource: string };
  since: number;
  until: number;
}

export interface Diplomacy {
  treaties: Treaty[];
  ongoing: OngoingDeal[];
  proposals: Proposal[];
  nextId: number;
}

export type VictoryKind = 'conquest' | 'domination' | 'space' | 'cultural' | 'diplomatic' | 'score' | 'regicide' | 'victoryPoints';

/** How the game is won (docs/rules/victory.md). */
export type GameMode = 'standard' | 'regicide' | 'massRegicide' | 'elimination' | 'victoryPoints';

export interface GameOptions {
  mode: GameMode;
  /** Victory conditions that end the game; the score victory at the last turn always applies. */
  victories: Record<Exclude<VictoryKind, 'score' | 'regicide' | 'victoryPoints'>, boolean>;
  /** Cities may change sides through culture (docs/rules/culture.md). */
  cultureFlips: boolean;
}

export interface Victory {
  kind: VictoryKind;
  /** The winner, or null when nobody won (every civilization destroyed). */
  winner: number | null;
  turn: number;
  detail: string;
}

/** The United Nations' elections (docs/rules/victory.md). */
export interface UnitedNations {
  /** Turn of the next vote. */
  nextVote: number;
  /** The last result: votes per candidate. */
  last: { turn: number; votes: Record<string, number>; total: number } | null;
}

export interface GameState {
  format: 'civolution-state';
  version: 6;
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
  diplomacy: Diplomacy;
  options: GameOptions;
  /** Set once the game is decided; play may go on but nobody else can win. */
  victory: Victory | null;
  /** Climate damage: points from polluted tiles, and how often warming has struck (docs/rules/pollution.md). */
  climate: { warming: number; strikes: number };
  un: UnitedNations | null;
}
