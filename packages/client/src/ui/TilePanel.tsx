import {
  FLAG_HUT,
  FLAG_LAKE,
  IMP_FORTRESS,
  IMP_IRRIGATION,
  IMP_MINE,
  IMP_RAIL,
  IMP_ROAD,
  directionTo,
  isExplored,
  resourceVisibleTo,
  stepCost,
  tileYield,
  type Explained,
} from '@civolution/engine';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';
import { formatMoves } from './describe.ts';

function Yield({ label, value, className }: { label: string; value: Explained; className: string }) {
  const tip = value.parts.map((p) => `${p.amount > 0 ? '+' : ''}${p.amount} ${p.label}`).join('\n');
  return (
    <span className={`yield ${className}`} title={`${label} ${value.value}\n${tip}`}>
      <i />
      {value.value}
    </span>
  );
}

export function TilePanel({ tile, unitId, pathTurns }: { tile: number | null; unitId: number | null; pathTurns: number | null }) {
  const snap = useGame((s) => s.snapshot);
  if (!snap || tile === null) return null;
  const { state, human, visible } = snap;
  const player = state.players[human]!;
  if (!isExplored(player, tile)) return <div className="tile-panel panel muted">Unexplored</div>;
  const m = state.map;
  const terrain = rules.terrains[m.terrain[tile]!]!;
  const y = tileYield(rules, state, tile, (r) => resourceVisibleTo(rules, state, human, r));
  const res = m.resource[tile]!;
  const resource = res >= 0 && resourceVisibleTo(rules, state, human, res) ? rules.resources[res]! : null;
  const imp = m.improvements[tile]!;
  const features = [
    m.flags[tile]! & FLAG_LAKE ? 'Fresh water lake' : null,
    m.rivers[tile] ? 'River' : null,
    imp & IMP_RAIL ? 'Railroad' : imp & IMP_ROAD ? 'Road' : null,
    imp & IMP_IRRIGATION ? 'Irrigation' : null,
    imp & IMP_MINE ? 'Mine' : null,
    imp & IMP_FORTRESS ? 'Fortress' : null,
    m.flags[tile]! & FLAG_HUT ? 'Tribal village' : null,
    visible[tile] ? null : 'Not in sight',
  ].filter(Boolean);
  const u = unitId !== null ? state.units[unitId] : undefined;
  const step = u && directionTo(m, u.tile, tile) >= 0 ? stepCost(rules, state, u, u.tile, tile) : null;
  const work = state.work[tile];
  return (
    <div className="tile-panel panel">
      <div className="tile-title">
        <strong>{terrain.name}</strong>
        {resource && (
          <span className={`res res-${resource.kind}`}>
            <img src={`${import.meta.env.BASE_URL}art/resources/${resource.id}.png`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
            {resource.name}
          </span>
        )}
      </div>
      <div className="yields">
        <Yield label="Food" value={y.food} className="food" />
        <Yield label="Shields" value={y.shields} className="shields" />
        <Yield label="Commerce" value={y.commerce} className="commerce" />
        <span className="muted" title="Defence bonus for units here">
          Defence +{terrain.defenceBonus}%
        </span>
      </div>
      {features.length > 0 && <div className="features">{features.join(' · ')}</div>}
      {work && <div className="muted">Workers: {rules.job(work.job).name} under way</div>}
      {step && (step.ok ? <div className="muted">Move cost {formatMoves(step.cost)} ({step.explain})</div> : <div className="warn">{step.error.message}</div>)}
      {pathTurns !== null && !step && <div className="muted">Route: {pathTurns} turn{pathTurns === 1 ? '' : 's'}</div>}
    </div>
  );
}
