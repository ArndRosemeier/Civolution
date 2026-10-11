import { formatYear, inGoldenAge, playerUnits, yearOf } from '@civolution/engine';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';
import { empireSummary, signed } from './empire.ts';
import { VERSION } from '../version.ts';
import { SoundMenu } from './SoundMenu.tsx';

export function TopBar({ onSave, onLoad }: { onSave: () => void; onLoad: () => void }) {
  const snap = useGame((s) => s.snapshot)!;
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const open = useGame((s) => s.open);
  const digestOpen = useGame((s) => s.digestOpen);
  const setDigestOpen = useGame((s) => s.setDigestOpen);
  const needs = useGame((s) => s.digest.filter((d) => d.needsInput).length);
  const { state, human } = snap;
  const p = state.players[human]!;
  const sum = empireSummary(snap);
  const gov = rules.government(p.government);
  const research = p.research.tech ? rules.tech(p.research.tech).name : null;
  const pct = sum.researchCost ? Math.min(100, Math.round((p.research.beakers * 100) / sum.researchCost)) : 0;
  return (
    <div className="top-bar panel">
      <div className="brand" title={`Civolution alpha ${VERSION}`}>Civolution</div>
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
      <button className={`stat ${p.atWarWith.some((x) => state.players[x]?.alive) ? 'at-war' : ''}`} onClick={() => open({ kind: 'diplomacy' })} title="Diplomacy (F4) · war room (F3)">
        <span className="label">Foreign affairs</span>
        <strong>
          {p.atWarWith.filter((x) => state.players[x]?.alive).length > 0
            ? `At war with ${p.atWarWith.filter((x) => state.players[x]?.alive).map((x) => state.players[x]!.name).join(', ')}`
            : p.contacts.length > 0
              ? `At peace · ${p.contacts.filter((x) => state.players[x]?.alive).length} met`
              : 'No contact yet'}
        </strong>
      </button>
      <div className="stat" title={`${sum.cities.length} cities, ${playerUnits(state, human).length} units`}>
        <span className="label">Empire</span>
        <strong>
          {sum.cities.length} <small className="muted">cities · pop {sum.population}</small>
        </strong>
      </div>
      {inGoldenAge(state, human) && (
        <div className="stat golden" title={`A golden age: +1 shield and +1 commerce on every tile that yields any, until turn ${p.goldenAge!.until}`}>
          <span className="label">Golden age</span>
          <strong>{p.goldenAge!.until - state.turn} turns</strong>
        </div>
      )}
      <button className={`stat ${state.victory ? 'attention' : ''}`} onClick={() => open({ kind: 'victory' })} title="Victory, spaceship and histograph (F8)">
        <span className="label">Victory</span>
        <strong>{state.victory ? (state.victory.winner === human ? 'Won' : 'Decided') : p.spaceship.launched !== null ? `Ship · turn ${p.spaceship.arrives}` : `Score ${p.scores.at(-1) ?? 0}`}</strong>
      </button>
      <div className="spacer" />
      <button className={Object.values(p.automation.delegate).some(Boolean) ? 'on' : ''} onClick={() => open({ kind: 'automation' })} title="Automation: governors, templates, workers, policies, rules (F7)">
        Automation
      </button>
      <button className={digestOpen ? 'on' : ''} onClick={() => setDigestOpen(!digestOpen)} title="Turn digest (F9)">
        Digest{needs > 0 ? ` · ${needs}` : ''}
      </button>
      <button className={settings.lens ? 'on' : ''} onClick={() => setSettings({ lens: !settings.lens })} title="Automation lens: what every automated unit and city is doing (Ctrl+K)">
        Lens
      </button>
      <button className={settings.grid ? 'on' : ''} onClick={() => setSettings({ grid: !settings.grid })} title="Tile grid (Ctrl+G)">
        Grid
      </button>
      <button className={settings.perf ? 'on' : ''} onClick={() => setSettings({ perf: !settings.perf })} title="Performance overlay (`)">
        FPS
      </button>
      <SoundMenu />
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
