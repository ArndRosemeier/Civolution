/**
 * Default citizen placement (docs/rules/cities.md). Like Civ3, a city places its own
 * citizens unless the player has set them by hand: every citizen works the best free
 * tile, food first until the city feeds itself with a little to spare, and citizens
 * without a useful tile become entertainers. The richer governors of PLAN.md §8 build on
 * this in @civolution/automation.
 */
import { cityReport, cityTileYield, effectiveBuildings, workableTiles } from './city.ts';
import type { Rules } from './rules.ts';
import type { City, GameState } from './state.ts';

export interface Placement {
  worked: number[];
  specialists: Record<string, number>;
}

/** Specialist used for citizens without a tile. */
export function defaultSpecialist(rules: Rules): string {
  return rules.set.specialists.find((s) => !s.laborer && s.luxury > 0)?.id ?? 'entertainer';
}

/**
 * Places `city.size` citizens. Tiles in `keep` are kept when still workable (manual
 * placement); the rest are chosen greedily.
 */
export function placeCitizens(rules: Rules, state: GameState, city: City, keep: readonly number[] = [], laborers = city.size): Placement {
  const have = effectiveBuildings(rules, state, city);
  const free = workableTiles(rules, state, city);
  const freeSet = new Set(free);
  const yields = new Map<number, { f: number; s: number; c: number }>();
  for (const t of free) {
    const y = cityTileYield(rules, state, city, t, have);
    yields.set(t, { f: y.food.value, s: y.shields.value, c: y.commerce.value });
  }
  const center = cityTileYield(rules, state, city, city.tile, have);
  let food = center.food.value;
  const need = city.size * rules.set.general.foodPerCitizen;
  let shields = center.shields.value;
  const worked: number[] = [];
  for (const t of keep) {
    if (worked.length >= laborers || !freeSet.has(t) || worked.includes(t)) continue;
    worked.push(t);
    food += yields.get(t)!.f;
    shields += yields.get(t)!.s;
  }
  const remaining = free.filter((t) => !worked.includes(t));
  while (worked.length < laborers && remaining.length > 0) {
    // Hungry when average tiles (2 food each) for the citizens still to place would leave less than +2.
    const hungry = food + 2 * (laborers - worked.length) < need + 2;
    // Keep production up too: about one shield for every two citizens.
    const idle = !hungry && shields < 1 + Math.floor((worked.length + 1) / 2);
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const y = yields.get(remaining[i]!)!;
      const score = y.f * 4 + y.s * 3 + y.c * 2 + (hungry ? y.f * 6 : 0) + (idle ? y.s * 6 : 0);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    const t = remaining.splice(best, 1)[0]!;
    const y = yields.get(t)!;
    // A tile that yields nothing at all is worse than an entertainer.
    if (y.f + y.s + y.c === 0) break;
    worked.push(t);
    food += y.f;
    shields += y.s;
  }
  const spare = laborers - worked.length;
  return { worked, specialists: spare > 0 ? { [defaultSpecialist(rules)]: spare } : {} };
}

/**
 * Civ3's "avoid disorder": while the city would riot, the least useful worked tile's
 * citizen becomes an entertainer.
 */
export function avoidDisorder(rules: Rules, state: GameState, city: City, placement: Placement): Placement {
  let worked = [...placement.worked];
  const ent = defaultSpecialist(rules);
  let specialists = { ...placement.specialists };
  const have = effectiveBuildings(rules, state, city);
  const value = (t: number) => {
    const y = cityTileYield(rules, state, city, t, have);
    return y.food.value * 4 + y.shields.value * 3 + y.commerce.value * 2;
  };
  while (worked.length > 0 && cityReport(rules, state, { ...city, worked, specialists }).disorder) {
    let worst = 0;
    for (let i = 1; i < worked.length; i++) if (value(worked[i]!) < value(worked[worst]!)) worst = i;
    worked = worked.filter((_, i) => i !== worst);
    specialists = { ...specialists, [ent]: (specialists[ent] ?? 0) + 1 };
  }
  return { worked, specialists };
}
