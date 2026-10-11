import { formatYear, playerUnits, yearOf } from '@civolution/engine';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';
import { empireSummary, signed } from './empire.ts';

export function TopBar({ onSave, onLoad }: { onSave: () => void; onLoad: () => void }) {
  const snap = useGame((s) => s.snapshot)!;
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const open = useGame((s) => s.open);
  const { state, human } = snap;
  const p = state.players[human]!;
  const sum = empireSummary(snap);
  const gov = rules.government(p.government);
  const research = p.research.tech ? rules.tech(p.research.tech).name : null;
  const pct = sum.researchCost ? Math.min(100, Math.round((p.research.beakers * 100) / sum.researchCost)) : 0;
  return (
    <div className="top-bar panel">
      <div className="brand">Civolution</div>
      <div className="stat" title={`Turn ${state.turn}`}>
        <span className="label">{formatYear(yearOf(rules, state.turn))}</span>
        <strong>Turn {state.turn}</strong>
      </div>
      <div className="stat" title={`Treasury ${p.gold}\nTaxes ${signed(sum.tax)}\nBuilding upkeep −${sum.upkeep}\nUnit support −${sum.unitSupport}`}>
        <span className="label">Gold</span>
        <strong className="gold">
          {p.gold} <small className={sum.net < 0 ? 'warn' : 'muted'}>{signed(sum.net)}</small>
        </strong>
      </div>
      <button className={`stat research ${research ? '' : 'attention'}`} onClick={() => open({ kind: 'science' })} title="Science advisor (F6)">
        <span className="label">Research</span>
        <strong>{research ? `${research} · ${sum.researchTurns ?? '–'}` : 'Choose research'}</strong>
        {research && (
          <span className="bar">
            <i style={{ width: `${pct}%` }} />
          </span>
        )}
      </button>
      <button className="stat" onClick={() => open({ kind: 'domestic' })} title="Domestic advisor (F1)">
        <span className="label">{p.revolution ? `Revolution → ${rules.government(p.revolution.target).name}` : 'Government'}</span>
        <strong>
          {gov.name} <small className="muted">{p.rates.tax * 10}/{p.rates.science * 10}/{p.rates.luxury * 10}</small>
        </strong>
      </button>
      <button className={`stat ${p.atWarWith.some((x) => state.players[x]?.alive) ? 'at-war' : ''}`} onClick={() => open({ kind: 'foreign' })} title="War room (F4)">
        <span className="label">Foreign affairs</span>
        <strong>{p.atWarWith.filter((x) => state.players[x]?.alive).length > 0 ? `At war with ${p.atWarWith.filter((x) => state.players[x]?.alive).map((x) => state.players[x]!.name).join(', ')}` : 'At peace'}</strong>
      </button>
      <div className="stat" title={`${sum.cities.length} cities, ${playerUnits(state, human).length} units`}>
        <span className="label">Empire</span>
        <strong>
          {sum.cities.length} <small className="muted">cities · pop {sum.population}</small>
        </strong>
      </div>
      <div className="spacer" />
      <button className={settings.grid ? 'on' : ''} onClick={() => setSettings({ grid: !settings.grid })} title="Tile grid (Ctrl+G)">
        Grid
      </button>
      <button className={settings.perf ? 'on' : ''} onClick={() => setSettings({ perf: !settings.perf })} title="Performance overlay (`)">
        FPS
      </button>
      <button onClick={onSave} title="Save (Ctrl+S)">
        Save
      </button>
      <button onClick={onLoad} title="Load (Ctrl+L)">
        Load
      </button>
      <button onClick={() => confirm('Leave this game? Unsaved progress since the last autosave is lost.') && location.reload()}>Menu</button>
    </div>
  );
}
