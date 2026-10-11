/**
 * The player's automation settings (PLAN.md §8): which aspects are delegated, city
 * governors, build templates, worker priorities and regions, empire policies, rally
 * points and the player's own trigger → condition → action rules.
 *
 * The engine only stores and validates them (they are part of the save and change
 * through the `setAutomation` command like any other state). What they mean is up to
 * @civolution/automation, which reads them and issues ordinary commands.
 */

export type GovernorPreset = 'balanced' | 'growth' | 'production' | 'gold' | 'science' | 'culture' | 'militaryPump' | 'settlerPump';

export const GOVERNOR_PRESETS: readonly GovernorPreset[] = ['balanced', 'growth', 'production', 'gold', 'science', 'culture', 'militaryPump', 'settlerPump'];

/** Relative weights, 0–10, a custom governor gives each yield. */
export interface GovernorWeights {
  food: number;
  shields: number;
  commerce: number;
  gold: number;
  science: number;
  luxury: number;
}

export interface GovernorSetting {
  preset: GovernorPreset | 'custom';
  /** Only for `custom`. */
  weights?: GovernorWeights;
  /** May rush builds from the empire's hurry budget. */
  hurry: boolean;
  /** Set when the player placed citizens by hand; the governor waits until resumed. */
  paused?: boolean;
}

/** City and empire values that conditions test. */
export type Stat =
  | 'size'
  | 'unhappy'
  | 'happy'
  | 'foodSurplus'
  | 'shields'
  | 'commerce'
  | 'corruption'
  | 'defenders'
  | 'gold'
  | 'atWar'
  | 'coastal'
  | 'turn'
  | 'cities'
  | 'has';

export const STATS: readonly Stat[] = ['size', 'unhappy', 'happy', 'foodSurplus', 'shields', 'commerce', 'corruption', 'defenders', 'gold', 'atWar', 'coastal', 'turn', 'cities', 'has'];

export interface Condition {
  stat: Stat;
  op: '>=' | '<=' | '=';
  value: number;
  /** For `has`: the building looked for (value 1: present, 0: missing). */
  building?: string;
}

/** Unit roles a template or rule can ask for; the best unit the city can build is chosen. */
export type UnitRole = 'defender' | 'attacker' | 'siege' | 'worker' | 'settler' | 'explorer' | 'ship';

export const UNIT_ROLES: readonly UnitRole[] = ['defender', 'attacker', 'siege', 'worker', 'settler', 'explorer', 'ship'];

export type BuildRef = { kind: 'unit' | 'building'; id: string } | { kind: 'role'; role: UnitRole };

export interface TemplateEntry {
  build: BuildRef;
  /** All must hold; buildings already present are skipped anyway. */
  when: Condition[];
}

export interface BuildTemplate {
  id: string;
  name: string;
  entries: TemplateEntry[];
}

export interface CityTemplate {
  template: string;
  /** Set when the player changed the build by hand; the template waits until resumed. */
  paused?: boolean;
}

/** Kinds of worker jobs, in the order the player wants them done. */
export type WorkerTask = 'pollution' | 'connectResources' | 'connectCities' | 'irrigate' | 'mine' | 'railroads' | 'roads' | 'clear';

export const WORKER_TASKS: readonly WorkerTask[] = ['pollution', 'connectResources', 'connectCities', 'irrigate', 'mine', 'railroads', 'roads', 'clear'];

/** A part of the map with its own worker rules ("never chop here"). */
export interface WorkerRegion {
  id: number;
  name: string;
  center: number;
  radius: number;
  /** Jobs automated workers never do here (engine job ids such as `clearForest`, `mine`). */
  forbid: string[];
}

export type RatesPolicy = 'manual' | 'maxScience' | 'maxGold' | 'celebrate';

export interface Policies {
  rates: RatesPolicy;
  /** Gold per turn to keep while maximising science. */
  minIncome: number;
  /** Gold the treasury keeps: hurrying and upgrades never spend below it. */
  reserve: number;
  /** Gold per turn governors may spend rushing builds. */
  hurryBudget: number;
  autoUpgrade: boolean;
  /** Warn in the turn digest when a resource connection breaks. */
  tradeKeeper: boolean;
  deals: {
    /** Accept offers that ask nothing in return. */
    acceptGifts: boolean;
    /** Decline offers that only take. */
    declineDemands: boolean;
    /** Accept peace and ceasefire offers that ask nothing else. */
    acceptPeace: boolean;
  };
}

export type Trigger = 'turnStart' | 'cityGrew' | 'cityBuilt' | 'cityDisorder' | 'cityFounded' | 'cityCaptured' | 'unitBuilt';

export const TRIGGERS: readonly Trigger[] = ['turnStart', 'cityGrew', 'cityBuilt', 'cityDisorder', 'cityFounded', 'cityCaptured', 'unitBuilt'];

/** Routines a rule can give a unit. */
export type UnitRoutine = 'explore' | 'autoWorker' | 'autoSettle' | 'garrison' | 'bombard' | 'fortify' | 'sentry';

export const UNIT_ROUTINES: readonly UnitRoutine[] = ['explore', 'autoWorker', 'autoSettle', 'garrison', 'bombard', 'fortify', 'sentry'];

export type RuleAction =
  | { kind: 'build'; build: BuildRef }
  | { kind: 'hurry' }
  | { kind: 'governor'; preset: GovernorPreset }
  | { kind: 'template'; template: string }
  | { kind: 'routine'; routine: UnitRoutine }
  | { kind: 'notify'; text: string };

/** One of the player's own rules: when `trigger` fires and every condition holds, do `action`. */
export interface RoutineRule {
  id: number;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  when: Condition[];
  action: RuleAction;
}

/** The aspects of the game handed to automation (§8.8). */
export interface Delegation {
  /** Governors place citizens in every city. */
  cities: boolean;
  /** Templates choose every city's builds. */
  builds: boolean;
  /** New workers join the worker pool. */
  workers: boolean;
  research: boolean;
  rates: boolean;
  /** New military units garrison cities or go to rally points; auto upgrades. */
  military: boolean;
  /** Offers are answered by the deal policy. */
  diplomacy: boolean;
}

export interface AutomationSettings {
  delegate: Delegation;
  /** Governor of every city without its own. */
  defaultGovernor: GovernorSetting;
  /** Per-city governors, by city id. */
  governors: Record<string, GovernorSetting>;
  /** The player's own templates (the built-in ones live in @civolution/automation). */
  templates: BuildTemplate[];
  /** Template of each city, by city id. */
  cityTemplates: Record<string, CityTemplate>;
  /** Templates given to new cities: coastal ones, the others, and captured ones. */
  assign: { founded: string; coastal: string; captured: string };
  workerTasks: WorkerTask[];
  regions: WorkerRegion[];
  policies: Policies;
  /** Advance research heads for, or null to let automation choose. */
  researchGoal: string | null;
  /** Rally point (tile) of each city: new military units go there. */
  rally: Record<string, number>;
  /** Defenders each city should hold when military is delegated. */
  garrison: number;
  rules: RoutineRule[];
  nextId: number;
}

export function defaultAutomation(): AutomationSettings {
  return {
    delegate: { cities: false, builds: false, workers: false, research: false, rates: false, military: false, diplomacy: false },
    defaultGovernor: { preset: 'balanced', hurry: false },
    governors: {},
    templates: [],
    cityTemplates: {},
    assign: { founded: 'newTown', coastal: 'coastal', captured: 'frontier' },
    workerTasks: [...WORKER_TASKS],
    regions: [],
    policies: {
      rates: 'maxScience',
      minIncome: 0,
      reserve: 50,
      hurryBudget: 0,
      autoUpgrade: false,
      tradeKeeper: true,
      deals: { acceptGifts: true, declineDemands: true, acceptPeace: false },
    },
    researchGoal: null,
    rally: {},
    garrison: 1,
    rules: [],
    nextId: 1,
  };
}

/* eslint-disable @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unnecessary-type-conversion --
   settings arrive as JSON from the UI and from shared rule files, so the checks below do
   not trust the static types. */
const LIMITS = { templates: 32, entries: 24, conditions: 8, rules: 64, regions: 64, name: 60, text: 200 };

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isName = (v: unknown, max = LIMITS.name): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function checkCondition(c: Condition): string | null {
  if (!STATS.includes(c.stat)) return `Unknown value ${String(c.stat)}.`;
  if (!['>=', '<=', '='].includes(c.op)) return 'Comparisons are ≥, ≤ or =.';
  if (!isInt(c.value, -100000, 100000)) return 'Condition values are whole numbers.';
  if (c.stat === 'has' && !isName(c.building)) return 'Name the building the condition looks for.';
  return null;
}

function checkBuild(b: BuildRef): string | null {
  if (b.kind === 'role') return UNIT_ROLES.includes(b.role) ? null : `Unknown unit role ${String(b.role)}.`;
  if (b.kind === 'unit' || b.kind === 'building') return isName(b.id) ? null : 'A build needs an id.';
  return 'Unknown build.';
}

function checkGovernor(g: GovernorSetting): string | null {
  if (g.preset !== 'custom' && !GOVERNOR_PRESETS.includes(g.preset)) return `Unknown governor ${String(g.preset)}.`;
  if (!isBool(g.hurry) || (g.paused !== undefined && !isBool(g.paused))) return 'Bad governor flags.';
  if (g.preset === 'custom') {
    const w = g.weights;
    if (!w) return 'A custom governor needs weights.';
    for (const k of ['food', 'shields', 'commerce', 'gold', 'science', 'luxury'] as const) if (!isInt(w[k], 0, 10)) return 'Governor weights run from 0 to 10.';
  }
  return null;
}

/**
 * Checks the shape and limits of automation settings (they arrive from the UI and from
 * imported rule files). Ids of builds and templates are checked when used, so a rule
 * mentioning something unknown simply does nothing.
 */
export function automationBlocker(a: AutomationSettings): string | null {
  if (typeof a !== 'object' || a === null) return 'Automation settings are missing.';
  const d = a.delegate;
  if (!d || !(['cities', 'builds', 'workers', 'research', 'rates', 'military', 'diplomacy'] as const).every((k) => isBool(d[k]))) return 'Bad delegation flags.';
  const gov = checkGovernor(a.defaultGovernor);
  if (gov) return gov;
  if (typeof a.governors !== 'object' || a.governors === null) return 'Bad governor list.';
  for (const g of Object.values(a.governors)) {
    const e = checkGovernor(g);
    if (e) return e;
  }
  if (!Array.isArray(a.templates) || a.templates.length > LIMITS.templates) return `At most ${LIMITS.templates} templates.`;
  const ids = new Set<string>();
  for (const t of a.templates) {
    if (!isName(t.id) || !isName(t.name)) return 'Templates need an id and a name.';
    if (ids.has(t.id)) return `Two templates share the id ${t.id}.`;
    ids.add(t.id);
    if (!Array.isArray(t.entries) || t.entries.length > LIMITS.entries) return `A template holds at most ${LIMITS.entries} entries.`;
    for (const e of t.entries) {
      const b = checkBuild(e.build);
      if (b) return b;
      if (!Array.isArray(e.when) || e.when.length > LIMITS.conditions) return `At most ${LIMITS.conditions} conditions per entry.`;
      for (const c of e.when) {
        const ce = checkCondition(c);
        if (ce) return ce;
      }
    }
  }
  if (typeof a.cityTemplates !== 'object' || a.cityTemplates === null) return 'Bad city templates.';
  for (const ct of Object.values(a.cityTemplates)) if (!isName(ct.template) || (ct.paused !== undefined && !isBool(ct.paused))) return 'Bad city template.';
  if (!a.assign || !isName(a.assign.founded) || !isName(a.assign.coastal) || !isName(a.assign.captured)) return 'Bad template assignment.';
  if (!Array.isArray(a.workerTasks) || a.workerTasks.length !== WORKER_TASKS.length || new Set(a.workerTasks).size !== WORKER_TASKS.length || a.workerTasks.some((t) => !WORKER_TASKS.includes(t)))
    return 'The worker priorities list every task once.';
  if (!Array.isArray(a.regions) || a.regions.length > LIMITS.regions) return `At most ${LIMITS.regions} worker regions.`;
  for (const r of a.regions) {
    if (!isInt(r.id, 0, 1e9) || !isName(r.name) || !isInt(r.center, 0, 1e7) || !isInt(r.radius, 0, 20)) return 'Bad worker region.';
    if (!Array.isArray(r.forbid) || r.forbid.length > 16 || r.forbid.some((j) => !isName(j))) return 'Bad worker region jobs.';
  }
  const p = a.policies;
  if (!p || !['manual', 'maxScience', 'maxGold', 'celebrate'].includes(p.rates)) return 'Unknown rates policy.';
  if (!isInt(p.minIncome, -1000, 10000) || !isInt(p.reserve, 0, 1000000) || !isInt(p.hurryBudget, 0, 1000000)) return 'Policy amounts are whole numbers.';
  if (!isBool(p.autoUpgrade) || !isBool(p.tradeKeeper) || !p.deals || !isBool(p.deals.acceptGifts) || !isBool(p.deals.declineDemands) || !isBool(p.deals.acceptPeace)) return 'Bad policy flags.';
  if (a.researchGoal !== null && !isName(a.researchGoal)) return 'Bad research goal.';
  if (typeof a.rally !== 'object' || a.rally === null || Object.values(a.rally).some((t) => !isInt(t, 0, 1e7))) return 'Bad rally points.';
  if (!isInt(a.garrison, 0, 8)) return 'A garrison is 0 to 8 defenders.';
  if (!Array.isArray(a.rules) || a.rules.length > LIMITS.rules) return `At most ${LIMITS.rules} rules.`;
  for (const r of a.rules) {
    if (!isInt(r.id, 0, 1e9) || !isName(r.name) || !isBool(r.enabled) || !TRIGGERS.includes(r.trigger)) return 'Bad rule.';
    if (!Array.isArray(r.when) || r.when.length > LIMITS.conditions) return `At most ${LIMITS.conditions} conditions per rule.`;
    for (const c of r.when) {
      const ce = checkCondition(c);
      if (ce) return ce;
    }
    const act = r.action;
    if (!act) return 'A rule needs an action.';
    if (act.kind === 'build') {
      const b = checkBuild(act.build);
      if (b) return b;
    } else if (act.kind === 'governor') {
      if (!GOVERNOR_PRESETS.includes(act.preset)) return `Unknown governor ${String(act.preset)}.`;
    } else if (act.kind === 'template') {
      if (!isName(act.template)) return 'Name the template.';
    } else if (act.kind === 'routine') {
      if (!UNIT_ROUTINES.includes(act.routine)) return `Unknown routine ${String(act.routine)}.`;
    } else if (act.kind === 'notify') {
      if (!isName(act.text, LIMITS.text)) return 'A notice needs a text.';
    } else if (act.kind !== 'hurry') return 'Unknown action.';
  }
  if (!isInt(a.nextId, 1, 1e9)) return 'Bad id counter.';
  return null;
}
