/**
 * The rule set indexed for fast lookup. Map arrays store terrain and resource as
 * indices into the rule set's lists; everything else uses string ids.
 */
import type {
  BuildingRule,
  CivRule,
  EspionageMissionRule,
  DifficultyRule,
  GovernmentRule,
  SpecialistRule,
  ResourceRule,
  RuleSet,
  TechRule,
  TerrainRule,
  UnitRule,
  WorkerJobRule,
} from '@civolution/data-schema';
import { hashValue } from './hash.ts';

export interface Rules {
  readonly set: RuleSet;
  readonly hash: string;
  readonly terrains: readonly TerrainRule[];
  readonly resources: readonly ResourceRule[];
  terrainIndex(id: string): number;
  resourceIndex(id: string): number;
  unit(id: string): UnitRule;
  job(id: string): WorkerJobRule;
  tech(id: string): TechRule;
  government(id: string): GovernmentRule;
  hasUnit(id: string): boolean;
  building(id: string): BuildingRule;
  hasBuilding(id: string): boolean;
  specialist(id: string): SpecialistRule;
  difficulty(id: string): DifficultyRule;
  civ(id: string): CivRule;
  hasCiv(id: string): boolean;
  mission(id: string): EspionageMissionRule;
  /** Index of an era id in rules.set.eras. */
  eraIndex(id: string): number;
  /** Movement points per tile on flat terrain, in thirds (3 for Conquests). */
  readonly moveScale: number;
  /** Terrain index constants used by the map generator and renderer. */
  readonly t: Readonly<Record<string, number>>;
}

function byId<T extends { id: string }>(xs: readonly T[], kind: string): (id: string) => T {
  const m = new Map(xs.map((x) => [x.id, x]));
  return (id) => {
    const v = m.get(id);
    if (!v) throw new Error(`unknown ${kind} "${id}"`);
    return v;
  };
}

export function indexRules(set: RuleSet): Rules {
  const terrainIdx = new Map(set.terrains.map((t, i) => [t.id, i]));
  const resourceIdx = new Map(set.resources.map((r, i) => [r.id, i]));
  const units = new Set(set.units.map((u) => u.id));
  const buildingIds = new Set(set.buildings.map((b) => b.id));
  const t: Record<string, number> = {};
  for (const [id, i] of terrainIdx) t[id] = i;
  return {
    set,
    hash: hashValue(set),
    terrains: set.terrains,
    resources: set.resources,
    terrainIndex: (id) => {
      const i = terrainIdx.get(id);
      if (i === undefined) throw new Error(`unknown terrain "${id}"`);
      return i;
    },
    resourceIndex: (id) => {
      const i = resourceIdx.get(id);
      if (i === undefined) throw new Error(`unknown resource "${id}"`);
      return i;
    },
    unit: byId(set.units, 'unit'),
    job: byId(set.workerJobs, 'worker job'),
    tech: byId(set.techs, 'tech'),
    government: byId(set.governments, 'government'),
    hasUnit: (id) => units.has(id),
    building: byId(set.buildings, 'building'),
    hasBuilding: (id) => buildingIds.has(id),
    specialist: byId(set.specialists, 'specialist'),
    difficulty: byId(set.difficulties, 'difficulty'),
    civ: byId(set.civs, 'civilization'),
    hasCiv: (id) => set.civs.some((c) => c.id === id),
    mission: byId(set.espionageMissions, 'espionage mission'),
    eraIndex: (id) => {
      const i = set.eras.findIndex((e) => e.id === id);
      if (i < 0) throw new Error(`unknown era "${id}"`);
      return i;
    },
    moveScale: set.general.roadMovementRate,
    t,
  };
}
