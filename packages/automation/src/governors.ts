/**
 * City governors (PLAN.md §8.1). A governor places a city's citizens for a goal:
 * presets (Growth, Production, Gold, Science, Culture, Balanced, Military Pump, Settler
 * Pump) or the player's own weights. It keeps the city fed and out of disorder, turns
 * citizens into specialists where they are worth more than a tile, and explains the
 * result. It only proposes `setCitizens`; the engine checks it like any other command.
 */
import {
  cityReport,
  cityTileYield,
  defaultSpecialist,
  effectiveBuildings,
  workableTiles,
  type City,
  type GameState,
  type GovernorPreset,
  type GovernorSetting,
  type GovernorWeights,
  type Rules,
} from '@civolution/engine';

interface Profile {
  name: string;
  weights: GovernorWeights;
  /** Food surplus the governor aims for (it settles for less when the land cannot give it). */
  food: number;
  blurb: string;
}

export const GOVERNORS: Record<GovernorPreset, Profile> = {
  balanced: { name: 'Balanced', weights: { food: 4, shields: 3, commerce: 2, gold: 1, science: 1, luxury: 0 }, food: 2, blurb: 'Steady growth with fair production and trade.' },
  growth: { name: 'Growth', weights: { food: 9, shields: 2, commerce: 1, gold: 1, science: 1, luxury: 0 }, food: 6, blurb: 'As much food as the land gives.' },
  production: { name: 'Production', weights: { food: 2, shields: 9, commerce: 1, gold: 0, science: 0, luxury: 0 }, food: 1, blurb: 'Shields first, growing slowly.' },
  gold: { name: 'Gold', weights: { food: 3, shields: 2, commerce: 5, gold: 6, science: 0, luxury: 0 }, food: 1, blurb: 'Trade and tax collectors.' },
  science: { name: 'Science', weights: { food: 3, shields: 2, commerce: 5, gold: 0, science: 6, luxury: 0 }, food: 1, blurb: 'Trade and scientists.' },
  culture: { name: 'Culture', weights: { food: 3, shields: 6, commerce: 2, gold: 0, science: 0, luxury: 2 }, food: 1, blurb: 'Shields for temples, libraries and wonders.' },
  militaryPump: { name: 'Military Pump', weights: { food: 1, shields: 10, commerce: 0, gold: 0, science: 0, luxury: 0 }, food: 0, blurb: 'Every shield for units; the city stops growing.' },
  settlerPump: { name: 'Settler Pump', weights: { food: 9, shields: 6, commerce: 0, gold: 0, science: 0, luxury: 0 }, food: 4, blurb: 'Food and shields to turn out settlers and workers.' },
};

export function governorName(g: GovernorSetting): string {
  return g.preset === 'custom' ? 'Custom' : GOVERNORS[g.preset].name;
}

function profileOf(g: GovernorSetting): Profile {
  if (g.preset !== 'custom') return GOVERNORS[g.preset];
  const w = g.weights ?? GOVERNORS.balanced.weights;
  return { name: 'Custom', weights: w, food: w.food >= 6 ? 4 : w.food >= 3 ? 2 : 1, blurb: 'Your own weights.' };
}

export interface GovernorPlan {
  worked: number[];
  specialists: Record<string, number>;
  reason: string;
}

/**
 * Where a governor would put the city's citizens. Greedy by weighted value, with food
 * first while the city would fall short of its target surplus; specialists replace the
 * weakest tiles when they are worth more and food allows; entertainers end disorder.
 */
export function governCity(rules: Rules, state: GameState, city: City, setting: GovernorSetting): GovernorPlan {
  const profile = profileOf(setting);
  const w = profile.weights;
  const p = state.players[city.owner]!;
  const have = effectiveBuildings(rules, state, city);
  // Commerce is worth its own weight plus what the rates make of it.
  const perCommerce = w.commerce + (p.rates.tax * w.gold + p.rates.science * w.science + p.rates.luxury * w.luxury) / 10;
  const free = workableTiles(rules, state, city);
  const yields = new Map<number, { f: number; s: number; c: number; v: number }>();
  for (const t of free) {
    const y = cityTileYield(rules, state, city, t, have);
    const f = y.food.value;
    const s = y.shields.value;
    const c = y.commerce.value;
    yields.set(t, { f, s, c, v: f * w.food + s * w.shields + c * perCommerce });
  }
  const center = cityTileYield(rules, state, city, city.tile, have);
  const perCitizen = rules.set.general.foodPerCitizen;
  const need = city.size * perCitizen;
  let food = center.food.value;
  const worked: number[] = [];
  const remaining = [...free].sort((a, b) => a - b);
  while (worked.length < city.size && remaining.length > 0) {
    const left = city.size - worked.length;
    // Short of the target unless every remaining citizen finds an average (2-food) tile.
    const hungry = food + 2 * left < need + profile.food;
    // Once the target is in reach, more food is worth less (growth goals excepted).
    const fed = profile.food < 4 && food + 2 * (left - 1) >= need + profile.food + 2;
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const y = yields.get(remaining[i]!)!;
      const score = y.v - (fed ? y.f * w.food * 0.65 : 0) + (hungry ? y.f * 20 : 0);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    const t = remaining.splice(best, 1)[0]!;
    const y = yields.get(t)!;
    if (y.f + y.s + y.c === 0) break;
    worked.push(t);
    food += y.f;
  }
  // Feed the city: while it would starve, trade the worked tile with the least food (or
  // an idle specialist slot) for the free tile with the most.
  const unworked = () => free.filter((t) => !worked.includes(t));
  const feed = (laborers: number) => {
    for (let guard = 0; guard < 21 && food < need; guard++) {
      const richest = unworked().sort((a, b) => yields.get(b)!.f - yields.get(a)!.f || yields.get(b)!.v - yields.get(a)!.v || a - b)[0];
      if (richest === undefined || yields.get(richest)!.f === 0) break;
      if (worked.length < laborers) {
        worked.push(richest);
        food += yields.get(richest)!.f;
        continue;
      }
      const poorest = [...worked].sort((a, b) => yields.get(a)!.f - yields.get(b)!.f || yields.get(a)!.v - yields.get(b)!.v || a - b)[0];
      if (poorest === undefined || yields.get(richest)!.f <= yields.get(poorest)!.f) break;
      worked.splice(worked.indexOf(poorest), 1, richest);
      food += yields.get(richest)!.f - yields.get(poorest)!.f;
    }
  };
  feed(city.size);
  // Specialists: the most valuable one the player may use.
  const known = new Set(p.techs);
  const options = rules.set.specialists.filter((s) => !s.laborer && (!s.requiredTech || known.has(s.requiredTech)));
  const specValue = (s: (typeof options)[number]) => s.gold * w.gold + s.science * w.science + s.luxury * w.luxury + s.shields * w.shields;
  const bestSpec = [...options].sort((a, b) => specValue(b) - specValue(a) || a.id.localeCompare(b.id))[0];
  const specialists: Record<string, number> = {};
  const fallback = defaultSpecialist(rules);
  const spare = city.size - worked.length;
  if (spare > 0) specialists[bestSpec && specValue(bestSpec) > 0 ? bestSpec.id : fallback] = spare;
  if (bestSpec && specValue(bestSpec) > 0) {
    // Swap the weakest tiles for specialists while that keeps the food target (or zero).
    const floor = Math.min(profile.food, Math.max(0, food - need));
    const byValue = [...worked].sort((a, b) => yields.get(a)!.v - yields.get(b)!.v || a - b);
    for (const t of byValue) {
      const y = yields.get(t)!;
      if (specValue(bestSpec) <= y.v || food - y.f - need < floor) break;
      worked.splice(worked.indexOf(t), 1);
      food -= y.f;
      specialists[bestSpec.id] = (specialists[bestSpec.id] ?? 0) + 1;
    }
  }
  // Disorder: entertainers replace tiles, the ones whose loss hurts the goal least and
  // never food the city needs while other tiles can go.
  const ents0 = specialists[fallback] ?? 0;
  let last: ReturnType<typeof cityReport> | null = null;
  while (worked.length > 0 && (last = cityReport(rules, state, { ...city, worked: [...worked], specialists: { ...specialists } })).disorder) {
    let drop = 0;
    let dropCost = Infinity;
    for (let i = 0; i < worked.length; i++) {
      const y = yields.get(worked[i]!)!;
      const short = Math.max(0, need - (food - y.f));
      const cost = short * 1000 + y.v;
      if (cost < dropCost) {
        drop = i;
        dropCost = cost;
      }
    }
    food -= yields.get(worked[drop]!)!.f;
    worked.splice(drop, 1);
    specialists[fallback] = (specialists[fallback] ?? 0) + 1;
  }
  // Entertainers took tiles: make the most of the food tiles left.
  const fed = (specialists[fallback] ?? 0) > ents0;
  if (fed) feed(worked.length);
  const placement = { worked, specialists: Object.fromEntries(Object.entries(specialists).filter(([, n]) => n > 0)) };
  // The last disorder check already looked at this placement unless the city was fed since (empty specialist slots count for nothing).
  const report = !fed && last && worked.length > 0 ? last : cityReport(rules, state, { ...city, worked: placement.worked, specialists: placement.specialists });
  const parts = [
    `${report.foodSurplus >= 0 ? '+' : ''}${report.foodSurplus} food`,
    `${report.shields.value} shields`,
    `${report.tax.value} gold`,
    `${report.science.value} science`,
  ];
  const ents = placement.specialists[fallback] ?? 0;
  if (report.disorder) parts.push('still in disorder: raise luxury or build happiness');
  else if (ents > ents0) parts.push(`${ents} entertainers keep order`);
  if (report.foodSurplus < 0) parts.push('starving: the land cannot feed it');
  return { ...placement, reason: `Governor (${profile.name}): ${parts.join(', ')}` };
}

/** Whether two placements put citizens in the same places. */
export function samePlacement(city: City, plan: { worked: number[]; specialists: Record<string, number> }): boolean {
  if (city.worked.length !== plan.worked.length) return false;
  const a = [...city.worked].sort((x, y) => x - y);
  const b = [...plan.worked].sort((x, y) => x - y);
  if (a.some((t, i) => t !== b[i])) return false;
  const keys = new Set([...Object.keys(city.specialists), ...Object.keys(plan.specialists)]);
  for (const k of keys) if ((city.specialists[k] ?? 0) !== (plan.specialists[k] ?? 0)) return false;
  return true;
}
