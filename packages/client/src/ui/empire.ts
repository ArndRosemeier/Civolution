/**
 * Empire figures for the HUD and advisors, from the same engine queries the end of turn
 * uses, so the numbers shown are the numbers that happen. Cached per snapshot.
 */
import { cityReport, playerCities, techCost, unitSupportCost, type City, type CityReport } from '@civolution/engine';
import type { Snapshot } from '../host/client.ts';
import { rules } from '../rules.ts';

export interface EmpireSummary {
  cities: { city: City; report: CityReport }[];
  tax: number;
  science: number;
  luxury: number;
  upkeep: number;
  unitSupport: number;
  /** Gold change per turn. */
  net: number;
  /** Turns until the current research completes, or null. */
  researchTurns: number | null;
  researchCost: number | null;
  population: number;
}

const cache = new WeakMap<Snapshot['state'], EmpireSummary>();

export function empireSummary(snap: Snapshot): EmpireSummary {
  const hit = cache.get(snap.state);
  if (hit) return hit;
  const { state, human } = snap;
  const p = state.players[human]!;
  const cities = playerCities(state, human).map((city) => ({ city, report: cityReport(rules, state, city) }));
  const sum = (f: (r: CityReport) => number) => cities.reduce((a, c) => a + f(c.report), 0);
  const tax = sum((r) => r.tax.value);
  const science = sum((r) => r.science.value);
  const upkeep = sum((r) => r.upkeep.value);
  const unitSupport = unitSupportCost(rules, state, human);
  let researchTurns: number | null = null;
  let researchCost: number | null = null;
  if (p.research.tech) {
    researchCost = techCost(rules, state, p.research.tech);
    const left = Math.max(0, researchCost - p.research.beakers);
    const byBeakers = science > 0 ? Math.ceil(left / science) : Infinity;
    const minTurns = Math.max(0, rules.set.general.minimumResearchTime - p.research.turns);
    const maxTurns = Math.max(1, rules.set.general.maximumResearchTime - p.research.turns);
    researchTurns = Math.max(1, Math.min(maxTurns, Math.max(minTurns, byBeakers)));
  }
  const out: EmpireSummary = {
    cities,
    tax,
    science,
    luxury: sum((r) => r.luxury.value),
    upkeep,
    unitSupport,
    net: tax - upkeep - unitSupport,
    researchTurns,
    researchCost,
    population: cities.reduce((a, c) => a + c.city.size, 0),
  };
  cache.set(state, out);
  return out;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
