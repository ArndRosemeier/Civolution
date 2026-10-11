/**
 * The city screen's automation card: the city's governor and build template (its own,
 * the empire's default, or none), paused or running, with the next builds the template
 * plans, and the rally point for new units.
 */
import { GOVERNORS, allTemplates, governorFor, templateFor, templatePreview, buildsAutomated } from '@civolution/automation';
import { GOVERNOR_PRESETS, type City, type GovernorPreset } from '@civolution/engine';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';
import { editAutomation } from './automation.ts';
import { AutoIcon } from './AutoIcon.tsx';

export function CityAutomation({ city }: { city: City }) {
  const snap = useGame((s) => s.snapshot)!;
  const setTilePick = useGame((s) => s.setTilePick);
  const open = useGame((s) => s.open);
  const { state, human } = snap;
  const a = state.players[human]!.automation;
  const own = a.governors[city.id];
  const active = governorFor(state, city);
  const govValue = own ? own.preset : a.delegate.cities ? 'default' : 'none';
  const ownTemplate = a.cityTemplates[city.id];
  const template = templateFor(state, city);
  const preview = template ? templatePreview(rules, state, city, template) : [];
  const rally = a.rally[city.id];

  const setGovernor = (v: string) =>
    void editAutomation((x) => {
      if (v === 'default' || v === 'none') {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keyed by city id
        delete x.governors[city.id];
        if (v === 'none' && x.delegate.cities) x.governors[city.id] = { ...x.defaultGovernor, paused: true };
      } else x.governors[city.id] = { preset: v as GovernorPreset, hurry: own?.hurry ?? x.defaultGovernor.hurry };
    });
  const setTemplate = (v: string) =>
    void editAutomation((x) => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keyed by city id
      if (v === 'none') delete x.cityTemplates[city.id];
      else x.cityTemplates[city.id] = { template: v };
    });
  const resume = () =>
    void editAutomation((x) => {
      const g = x.governors[city.id];
      if (g?.paused) x.governors[city.id] = { ...g, paused: false };
      const t = x.cityTemplates[city.id];
      if (t?.paused) x.cityTemplates[city.id] = { template: t.template };
    });
  const paused = !!own?.paused || !!ownTemplate?.paused;

  return (
    <div className="city-automation">
      <h3>
        Automation <button className="link small" onClick={() => open({ kind: 'automation', tab: 'governors' })}>settings</button>
      </h3>
      <label className="auto-row">
        <AutoIcon name={active ? (active.preset === 'custom' ? 'custom' : active.preset) : 'manual'} />
        <span>Governor</span>
        <select value={govValue} onChange={(e) => setGovernor(e.target.value)} aria-label="Governor">
          <option value="none">None (citizens by hand or default)</option>
          {a.delegate.cities && <option value="default">Empire default ({a.defaultGovernor.preset === 'custom' ? 'Custom' : GOVERNORS[a.defaultGovernor.preset].name})</option>}
          {GOVERNOR_PRESETS.map((g) => (
            <option key={g} value={g}>
              {GOVERNORS[g].name}
            </option>
          ))}
          {own?.preset === 'custom' && <option value="custom">Custom</option>}
        </select>
      </label>
      <label className="auto-row">
        <AutoIcon name="template" />
        <span>Builds</span>
        <select value={ownTemplate?.template ?? 'none'} onChange={(e) => setTemplate(e.target.value)} aria-label="Build template">
          <option value="none">{a.delegate.builds ? 'Template for new cities' : 'No template (choose by hand)'}</option>
          {allTemplates(state, human).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {paused && (
        <div className="auto-paused">
          <span className="warn">Paused: you stepped in by hand.</span>
          <button onClick={resume}>Resume</button>
        </div>
      )}
      {buildsAutomated(state, city) && preview.length > 0 && <div className="muted small">Next: {preview.join(' → ')}</div>}
      {active && <div className="muted small">{active.preset === 'custom' ? 'Your own weights.' : GOVERNORS[active.preset].blurb}</div>}
      <div className="auto-row">
        <AutoIcon name="rally" />
        <span>Rally point</span>
        <button onClick={() => setTilePick({ purpose: 'rally', city: city.id })} title="Click a tile on the map: new attackers from this city go there when military is delegated">
          {rally === undefined ? 'Set on the map' : 'Move'}
        </button>
        {rally !== undefined && (
          <button
            className="icon"
            title="Clear the rally point"
            onClick={() =>
              void editAutomation((x) => {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keyed by city id
                delete x.rally[city.id];
              })
            }
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
