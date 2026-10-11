/**
 * Build templates (PLAN.md §8.2): an ordered list of builds, each with conditions
 * ("Temple if unhappy ≥ 1", "best defender if at war and defenders ≤ 2"). A city with a
 * template builds the first entry that applies; when none does, the empire planner's
 * priorities take over. Templates are given to new and captured cities by rule.
 */
import {
  buildBlocker,
  cityReport,
  isCoastal,
  playerCities,
  playerUnits,
  type Build,
  type BuildRef,
  type BuildTemplate,
  type City,
  type Condition,
  type GameState,
  type Rules,
  type TemplateEntry,
} from '@civolution/engine';
import { CityView, bestOfRole, defenders, describeBuild, describeCondition, holds, resolveBuild, unitRole } from './conditions.ts';
import { bestSite, planBuild } from './empire.ts';

const b = (id: string, ...when: Condition[]): TemplateEntry => ({ build: { kind: 'building', id }, when });
const role = (r: Extract<BuildRef, { kind: 'role' }>['role'], ...when: Condition[]): TemplateEntry => ({ build: { kind: 'role', role: r }, when });
const ge = (stat: Condition['stat'], value: number): Condition => ({ stat, op: '>=', value });
const le = (stat: Condition['stat'], value: number): Condition => ({ stat, op: '<=', value });
const is = (stat: Condition['stat']): Condition => ({ stat, op: '=', value: 1 });

const noDefender = le('defenders', 0);

/** Templates every player has; a player's own template with the same id replaces one. */
export const BUILT_IN_TEMPLATES: readonly BuildTemplate[] = [
  {
    id: 'newTown',
    name: 'New town',
    entries: [role('defender', noDefender), b('temple', ge('unhappy', 1)), b('granary', ge('size', 3)), b('library'), b('harbor', is('coastal'), le('foodSurplus', 2)), b('marketplace', ge('commerce', 6)), b('aqueduct', ge('size', 6))],
  },
  {
    id: 'core',
    name: 'Core city',
    entries: [
      role('defender', noDefender),
      b('temple', ge('unhappy', 1)),
      b('library'),
      b('marketplace'),
      b('harbor', is('coastal'), le('foodSurplus', 2)),
      b('granary', ge('size', 5)),
      b('aqueduct', ge('size', 6)),
      b('courthouse', ge('corruption', 30)),
      b('colosseum', ge('unhappy', 2)),
      b('university'),
      b('bank'),
      b('cathedral', ge('unhappy', 2)),
      b('factory', ge('shields', 8)),
      b('hospital', ge('size', 11)),
      b('coalPlant', { stat: 'has', op: '=', value: 1, building: 'factory' }),
      b('researchLab'),
      b('stockExchange'),
    ],
  },
  {
    id: 'coastal',
    name: 'Coastal',
    entries: [
      role('defender', noDefender),
      b('harbor'),
      b('temple', ge('unhappy', 1)),
      b('library'),
      b('marketplace'),
      b('coastalFortress', is('atWar')),
      role('ship', is('atWar'), ge('defenders', 2)),
      b('aqueduct', ge('size', 6)),
      b('commercialDock'),
      b('offshorePlatform', ge('size', 12)),
    ],
  },
  {
    id: 'frontier',
    name: 'Frontier fortress',
    entries: [
      role('defender', le('defenders', 1)),
      b('walls'),
      role('defender', is('atWar'), le('defenders', 2)),
      b('barracks'),
      b('temple', ge('unhappy', 1)),
      b('courthouse', ge('corruption', 30)),
      b('library'),
      role('attacker', is('atWar')),
    ],
  },
  {
    id: 'militaryPump',
    name: 'Military pump',
    entries: [role('defender', noDefender), b('barracks'), b('temple', ge('unhappy', 2)), role('siege', is('atWar'), ge('size', 4)), role('attacker')],
  },
  {
    id: 'settlerPump',
    name: 'Settler pump',
    entries: [role('defender', noDefender), b('granary'), b('temple', ge('unhappy', 1)), role('worker', le('size', 2)), role('settler', ge('size', 3))],
  },
  {
    id: 'science',
    name: 'Science',
    entries: [role('defender', noDefender), b('temple', ge('unhappy', 1)), b('library'), b('marketplace', ge('unhappy', 2)), b('university'), b('aqueduct', ge('size', 6)), b('researchLab'), b('hospital', ge('size', 11))],
  },
  {
    id: 'culture',
    name: 'Culture',
    entries: [role('defender', noDefender), b('temple'), b('library'), b('colosseum'), b('cathedral'), b('university'), b('aqueduct', ge('size', 6))],
  },
  {
    id: 'gold',
    name: 'Gold',
    entries: [role('defender', noDefender), b('temple', ge('unhappy', 1)), b('marketplace'), b('harbor', is('coastal')), b('library'), b('bank'), b('aqueduct', ge('size', 6)), b('stockExchange')],
  },
];

/** A template by id: the player's own first, then the built-in ones. */
export function findTemplate(state: GameState, player: number, id: string): BuildTemplate | null {
  return state.players[player]!.automation.templates.find((t) => t.id === id) ?? BUILT_IN_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Every template the player can choose from. */
export function allTemplates(state: GameState, player: number): BuildTemplate[] {
  const own = state.players[player]!.automation.templates;
  return [...own, ...BUILT_IN_TEMPLATES.filter((t) => !own.some((o) => o.id === t.id))];
}

/** The template new cities of this kind get. */
export function templateForNewCity(rules: Rules, state: GameState, city: City, captured: boolean): string {
  const a = state.players[city.owner]!.automation.assign;
  if (captured) return a.captured;
  return isCoastal(rules, state, city.tile) ? a.coastal : a.founded;
}

export interface TemplatePick {
  build: Build;
  reason: string;
}

/** The first entry of `template` that applies to the city, or null when none does. */
export function templateBuild(rules: Rules, state: GameState, city: City, template: BuildTemplate): TemplatePick | null {
  const view = new CityView(rules, state, city);
  for (const entry of template.entries) {
    if (entry.build.kind === 'building' && entry.build.id in city.buildings) continue;
    if (!entry.when.every((c) => holds(view, c))) continue;
    const build = resolveBuild(rules, state, city, entry.build);
    if (!build || buildBlocker(rules, state, city, build) !== null) continue;
    const why = entry.when.length > 0 ? ` (${entry.when.map((c) => describeCondition(rules, c)).join(', ')})` : '';
    return { build, reason: `Template ${template.name}: ${describeBuild(rules, entry.build)}${why}` };
  }
  return null;
}

/** What the empire as a whole still wants built this turn; used up as cities take it on. */
export interface BuildNeeds {
  settlers: number;
  workers: number;
  /** A unit to explore for city sites is wanted. */
  explorer: boolean;
}

/** Templates that never spend a city on settlers or workers. */
const NO_EXPANSION = new Set(['militaryPump', 'frontier']);

/**
 * Settlers while the empire has fewer cities than the world size's optimum (counting
 * those on the way and in production, at most one in flight per two cities), workers up
 * to one and a half per city, and an explorer when no site is known.
 */
export function buildNeeds(rules: Rules, state: GameState, player: number): BuildNeeds {
  const cities = playerCities(state, player);
  const units = playerUnits(state, player);
  const building = (role: string) => cities.filter((c) => c.build?.kind === 'unit' && unitRole(rules.unit(c.build.id)) === role).length;
  const settlers = units.filter((u) => unitRole(rules.unit(u.type)) === 'settler').length + building('settler');
  const workers = units.filter((u) => unitRole(rules.unit(u.type)) === 'worker').length + building('worker');
  const optimal = rules.set.worldSizes.find((w) => w.id === state.settings.worldSize)?.optimalCities ?? 16;
  const room = Math.max(0, optimal - cities.length - settlers);
  const inFlight = Math.max(1, Math.ceil(cities.length / 2)) - settlers;
  const exploring = units.some((u) => u.routine === 'explore');
  return { settlers: Math.max(0, Math.min(room, inFlight)), workers: Math.max(0, Math.ceil(cities.length * 1.5) - workers), explorer: !exploring && building('explorer') === 0 };
}

/**
 * A city's next build: a defender when it has none, the empire's settlers and workers
 * (unless its template is a military one), then the template, then the empire planner's
 * priorities. `needs` is shared by all cities of one pass and used up as they choose.
 */
export function chooseBuild(rules: Rules, state: GameState, city: City, template: BuildTemplate | null, needs?: BuildNeeds): TemplatePick {
  const unit = (role: Parameters<typeof bestOfRole>[3]) => bestOfRole(rules, state, city, role);
  if (defenders(rules, state, city) === 0) {
    const d = unit('defender');
    if (d) return { build: { kind: 'unit', id: d }, reason: `${rules.unit(d).name}: the city has no defender` };
  }
  if (needs && !(template && NO_EXPANSION.has(template.id))) {
    const report = cityReport(rules, state, city);
    if (needs.settlers > 0 && city.size >= 2 && report.foodSurplus >= 1) {
      const s = unit('settler');
      if (s && bestSite(rules, state, city.owner, city.tile, 12) >= 0) {
        needs.settlers--;
        return { build: { kind: 'unit', id: s }, reason: `Expansion: room for another city near ${city.name}` };
      }
      if (needs.explorer) {
        const e = unit('explorer') ?? unit('attacker') ?? unit('defender');
        if (e) {
          needs.explorer = false;
          return { build: { kind: 'unit', id: e }, reason: 'Expansion: someone to look for city sites' };
        }
      }
    }
    if (needs.workers > 0 && city.size >= 2) {
      const w = unit('worker');
      if (w) {
        needs.workers--;
        return { build: { kind: 'unit', id: w }, reason: 'Fewer workers than the cities need' };
      }
    }
  }
  const pick = template ? templateBuild(rules, state, city, template) : null;
  if (pick) return pick;
  const plan = planBuild(rules, state, city, { noSettlers: true });
  return { build: plan.build, reason: template ? `Template ${template.name} done; ${plan.reason}` : plan.reason };
}

/** The next few builds a template would make, for the city screen (ignores how the city changes meanwhile). */
export function templatePreview(rules: Rules, state: GameState, city: City, template: BuildTemplate, count = 4): string[] {
  const out: string[] = [];
  let c = city;
  for (let i = 0; i < count; i++) {
    const pick = templateBuild(rules, state, c, template);
    if (!pick) break;
    out.push(pick.reason.replace(`Template ${template.name}: `, ''));
    if (pick.build.kind !== 'building') break;
    c = { ...c, buildings: { ...c.buildings, [pick.build.id]: state.turn } };
  }
  return out;
}
