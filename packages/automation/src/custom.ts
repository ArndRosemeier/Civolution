/**
 * The routine editor's rules (PLAN.md §8.6): when a trigger fires for a city and every
 * condition holds, the rule's action runs, as an ordinary command with the rule's name
 * as the reason. Rules and templates export to a small JSON format so they can move
 * between games.
 */
import {
  automationBlocker,
  buildBlocker,
  type AutomationSettings,
  type BuildTemplate,
  type Command,
  type GameEvent,
  type GameState,
  type RoutineRule,
  type Rules,
  type Trigger,
} from '@civolution/engine';
import { CityView, describeBuild, describeCondition, holds, resolveBuild } from './conditions.ts';
import { GOVERNORS } from './governors.ts';
import { findTemplate } from './templates.ts';

export interface Firing {
  rule: RoutineRule;
  city: number;
  unit?: number;
}

/** Cities (and units) each trigger fires for, from the events since the player's last turn. */
export function firings(state: GameState, player: number, events: readonly GameEvent[]): { trigger: Trigger; city: number; unit?: number }[] {
  const out: { trigger: Trigger; city: number; unit?: number }[] = [];
  for (const c of Object.values(state.cities)) if (c.owner === player) out.push({ trigger: 'turnStart', city: c.id });
  for (const e of events) {
    if (e.type === 'cityGrew' && e.player === player) out.push({ trigger: 'cityGrew', city: e.city });
    else if (e.type === 'cityBuilt' && e.player === player) {
      out.push({ trigger: 'cityBuilt', city: e.city });
      if (e.build.kind === 'unit' && e.unit !== undefined) out.push({ trigger: 'unitBuilt', city: e.city, unit: e.unit });
    } else if (e.type === 'cityDisorder' && e.player === player) out.push({ trigger: 'cityDisorder', city: e.city });
    else if (e.type === 'cityFounded' && e.player === player) out.push({ trigger: 'cityFounded', city: e.city });
    else if (e.type === 'cityCaptured' && e.player === player) out.push({ trigger: 'cityCaptured', city: e.city });
  }
  return out;
}

export interface RuleOutcome {
  commands: Command[];
  /** Notices for the turn digest. */
  notices: { text: string; city: number }[];
}

/**
 * Runs the player's enabled rules for the triggers that fired. Settings changes (a new
 * governor or template for a city) are gathered into one `setAutomation`.
 */
export function runCustomRules(rules: Rules, state: GameState, player: number, events: readonly GameEvent[]): RuleOutcome {
  const a = state.players[player]!.automation;
  const active = a.rules.filter((r) => r.enabled);
  const out: RuleOutcome = { commands: [], notices: [] };
  if (active.length === 0) return out;
  const pending: { settings?: AutomationSettings } = {};
  const edit = () => (pending.settings ??= structuredClone(a));
  const fired = firings(state, player, events);
  for (const rule of active) {
    for (const f of fired) {
      if (f.trigger !== rule.trigger) continue;
      const city = state.cities[f.city];
      if (!city || city.owner !== player) continue;
      const view = new CityView(rules, state, city);
      if (!rule.when.every((c) => holds(view, c))) continue;
      const why = `Rule "${rule.name}"${rule.when.length > 0 ? ` (${rule.when.map((c) => describeCondition(rules, c)).join(', ')})` : ''}`;
      const act = rule.action;
      switch (act.kind) {
        case 'build': {
          const build = resolveBuild(rules, state, city, act.build);
          if (!build || buildBlocker(rules, state, city, build) !== null) break;
          out.commands.push({ type: 'setBuild', player, city: city.id, build, reason: `${why}: ${describeBuild(rules, act.build)} in ${city.name}` });
          break;
        }
        case 'hurry':
          out.commands.push({ type: 'hurry', player, city: city.id, reason: `${why}: rushing ${city.name}'s build` });
          break;
        case 'governor':
          edit().governors[city.id] = { preset: act.preset, hurry: a.governors[city.id]?.hurry ?? a.defaultGovernor.hurry };
          out.notices.push({ text: `${why}: ${city.name} now has the ${GOVERNORS[act.preset].name} governor`, city: city.id });
          break;
        case 'template': {
          if (!findTemplate(state, player, act.template)) break;
          edit().cityTemplates[city.id] = { template: act.template };
          out.notices.push({ text: `${why}: ${city.name} now follows the ${findTemplate(state, player, act.template)!.name} template`, city: city.id });
          break;
        }
        case 'routine': {
          if (f.unit === undefined || !state.units[f.unit]) break;
          const unit = f.unit;
          const reason = `${why}: ${act.routine} for the new unit`;
          if (act.routine === 'fortify') out.commands.push({ type: 'fortify', player, unit, reason });
          else if (act.routine === 'sentry') out.commands.push({ type: 'sentry', player, unit, reason });
          else out.commands.push({ type: 'setRoutine', player, unit, routine: act.routine, reason });
          break;
        }
        case 'notify':
          out.notices.push({ text: `${rule.name}: ${act.text} (${city.name})`, city: city.id });
          break;
      }
    }
  }
  if (pending.settings) out.commands.unshift({ type: 'setAutomation', player, settings: pending.settings, reason: 'Your rules changed city automation' });
  return out;
}

export interface RoutineFile {
  format: 'civolution-routines';
  version: 1;
  rules: RoutineRule[];
  templates: BuildTemplate[];
}

/** The player's rules and templates as a file to share. */
export function exportRoutines(a: AutomationSettings): string {
  const file: RoutineFile = { format: 'civolution-routines', version: 1, rules: a.rules, templates: a.templates };
  return JSON.stringify(file, null, 2);
}

/**
 * Adds the rules and templates of a shared file to the settings (rules get new ids,
 * templates replace ones with the same id). Returns the new settings or an error.
 */
export function importRoutines(a: AutomationSettings, text: string): AutomationSettings | { error: string } {
  let file: Partial<RoutineFile>;
  try {
    file = JSON.parse(text) as Partial<RoutineFile>;
  } catch {
    return { error: 'The file is not valid JSON.' };
  }
  if (file.format !== 'civolution-routines' || file.version !== 1) return { error: 'This is not a Civolution routines file.' };
  const next = structuredClone(a);
  for (const r of file.rules ?? []) next.rules.push({ ...r, id: next.nextId++ });
  for (const t of file.templates ?? []) next.templates = [...next.templates.filter((x) => x.id !== t.id), t];
  const why = automationBlocker(next);
  return why ? { error: why } : next;
}
