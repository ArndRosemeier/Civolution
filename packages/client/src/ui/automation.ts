/**
 * Helpers for the automation UI: changing the human's automation settings (one
 * `setAutomation` command with an edited copy), and pausing a city's governor or
 * template when the player steps in by hand (PLAN.md §8: overridable).
 */
import { buildsAutomated, governorFor } from '@civolution/automation';
import type { AutomationSettings, City } from '@civolution/engine';
import { play } from '../audio.ts';
import { useGame } from '../store.ts';

/** Edits a copy of the human's settings and sends it. */
export async function editAutomation(edit: (a: AutomationSettings) => void, toast?: string): Promise<boolean> {
  const st = useGame.getState();
  const snap = st.snapshot;
  if (!snap) return false;
  const before = snap.state.players[snap.human]!.automation;
  const a = structuredClone(before);
  edit(a);
  const ok = await st.send({ type: 'setAutomation', settings: a });
  if (ok) {
    const keys = Object.keys(a.delegate) as (keyof typeof a.delegate)[];
    if (keys.some((k) => a.delegate[k] && !before.delegate[k])) play('automation-on');
    else if (keys.some((k) => !a.delegate[k] && before.delegate[k])) play('automation-off');
    else if (JSON.stringify(a.governors) !== JSON.stringify(before.governors) || JSON.stringify(a.cityTemplates) !== JSON.stringify(before.cityTemplates)) play('template-set');
    else if (JSON.stringify(a.rally) !== JSON.stringify(before.rally)) play('rally-call');
  }
  if (ok && toast) st.showToast(toast);
  return ok;
}

/** Before a hand-made citizen change: pause the city's governor, saying so. */
export async function pauseGovernorFor(city: City): Promise<void> {
  const snap = useGame.getState().snapshot;
  if (!snap || !governorFor(snap.state, city)) return;
  const a = snap.state.players[snap.human]!.automation;
  const g = a.governors[city.id] ?? a.defaultGovernor;
  await editAutomation((x) => {
    x.governors[city.id] = { ...g, paused: true };
  }, `${city.name}: governor paused while you place citizens. Resume it in the city screen.`);
}

/** Before a hand-made build change: pause the city's template, saying so. */
export async function pauseTemplateFor(city: City): Promise<void> {
  const snap = useGame.getState().snapshot;
  if (!snap || !buildsAutomated(snap.state, city)) return;
  const own = snap.state.players[snap.human]!.automation.cityTemplates[city.id];
  await editAutomation((x) => {
    x.cityTemplates[city.id] = { template: own?.template ?? x.assign.founded, paused: true };
  }, `${city.name}: build template paused while you choose builds. Resume it in the city screen.`);
}
