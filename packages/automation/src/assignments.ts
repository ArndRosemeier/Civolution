/**
 * Which governor and template look after a city: its own setting, else the empire-wide
 * one when that aspect is delegated. Paused ones (the player stepped in) do nothing.
 */
import type { AutomationSettings, BuildTemplate, City, GameState, GovernorSetting } from '@civolution/engine';
import { findTemplate } from './templates.ts';

export function governorFor(state: GameState, city: City): GovernorSetting | null {
  const a = state.players[city.owner]!.automation;
  const own = a.governors[city.id];
  if (own) return own.paused ? null : own;
  return a.delegate.cities ? a.defaultGovernor : null;
}

/** The template id a city follows (null: none), and whether it is the city's own. */
export function templateIdFor(state: GameState, city: City): string | null {
  const a = state.players[city.owner]!.automation;
  const own = a.cityTemplates[city.id];
  if (own) return own.paused ? null : own.template;
  return null;
}

export function templateFor(state: GameState, city: City): BuildTemplate | null {
  const id = templateIdFor(state, city);
  return id ? findTemplate(state, city.owner, id) : null;
}

/** Whether automation chooses this city's builds. */
export function buildsAutomated(state: GameState, city: City): boolean {
  const a = state.players[city.owner]!.automation;
  const own = a.cityTemplates[city.id];
  if (own) return !own.paused;
  return a.delegate.builds;
}

/** Settings with every aspect handed to automation (the "delegate everything" level). */
export function delegateEverything(a: AutomationSettings): AutomationSettings {
  return {
    ...structuredClone(a),
    delegate: { cities: true, builds: true, workers: true, research: true, rates: true, military: true, diplomacy: true },
    defaultGovernor: { ...a.defaultGovernor, hurry: true },
    policies: { ...a.policies, autoUpgrade: true, hurryBudget: Math.max(a.policies.hurryBudget, 100) },
  };
}
