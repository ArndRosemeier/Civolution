import { exploredCount, playerUnits, tileCount } from '@civolution/engine';
import { useGame } from '../store.ts';

export function TopBar({ onSave, onLoad }: { onSave: () => void; onLoad: () => void }) {
  const snap = useGame((s) => s.snapshot)!;
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const { state, human } = snap;
  const p = state.players[human]!;
  const explored = Math.round((exploredCount(p) * 1000) / tileCount(state.map)) / 10;
  return (
    <div className="top-bar panel">
      <div className="brand">Civolution</div>
      <div className="stat" title="Turn">
        <span className="label">Turn</span>
        <strong>{state.turn}</strong>
      </div>
      <div className="stat" title="Treasury">
        <span className="label">Gold</span>
        <strong className="gold">{p.gold}</strong>
      </div>
      <div className="stat" title="Share of the world you have explored">
        <span className="label">Explored</span>
        <strong>{explored}%</strong>
      </div>
      <div className="stat" title="Your units">
        <span className="label">Units</span>
        <strong>{playerUnits(state, human).length}</strong>
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
