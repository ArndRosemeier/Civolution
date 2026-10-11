/**
 * Combat odds before you attack (PLAN.md §10.2): who would defend, the chance to win,
 * retreat or lose, and every modifier on both sides.
 */
import { attackStrength, defenceStrength, distance, isArmy, cargoOf, cityAt, previewAttack, attackBlocker, type GameState, type Strength, type Unit } from '@civolution/engine';
import { rules } from '../rules.ts';

function pct(x: number): string {
  return `${Math.round(x * 1000) / 10} %`;
}

function StrengthLine({ label, s }: { label: string; s: Strength }) {
  const tip = [`Base ${s.base}`, ...s.mods.map((m) => `${m.amount > 0 ? '+' : ''}${m.amount} % ${m.label}`)].join('\n');
  return (
    <div className="strength" title={tip}>
      <span className="muted">{label}</span>
      <strong>{(s.value / 100).toFixed(2)}</strong>
      <small className="muted">{s.mods.length > 0 ? s.mods.map((m) => `${m.amount > 0 ? '+' : ''}${m.amount}% ${m.label}`).join(', ') : 'no modifiers'}</small>
    </div>
  );
}

/** The fighter whose strength matters most on a side: the unit, or an army's strongest member. */
function front(state: GameState, u: Unit, attack: boolean): Unit {
  if (!isArmy(rules, u)) return u;
  const ms = cargoOf(state, u.id);
  return ms.sort((a, b) => (attack ? rules.unit(b.type).attack - rules.unit(a.type).attack : rules.unit(b.type).defence - rules.unit(a.type).defence) || b.hp - a.hp)[0] ?? u;
}

export function AttackPreview({ state, unit, tile }: { state: GameState; unit: Unit; tile: number }) {
  if (distance(state.map, unit.tile, tile) !== 1) return null;
  const enemies = Object.values(state.units).filter((x) => x.tile === tile && x.owner !== unit.owner);
  const city = cityAt(state, tile);
  if (enemies.length === 0 && !(city && city.owner !== unit.owner)) return null;
  const other = enemies[0]?.owner ?? city!.owner;
  const p = state.players[unit.owner]!;
  const atWar = state.players[other]!.barbarian || p.atWarWith.includes(other);
  if (!atWar) return <div className="attack-preview warn">At peace with {state.players[other]!.name}: declare war in the war room (F4) to attack.</div>;
  const why = attackBlocker(rules, state, unit, tile);
  if (why) return <div className="attack-preview warn">{why}</div>;
  const preview = previewAttack(rules, state, unit, tile);
  if (!preview) {
    return <div className="attack-preview good">Undefended: moving in {city ? `captures ${city.name}` : 'captures or destroys what stands there'}.</div>;
  }
  const d = preview.defender;
  const o = preview.odds;
  const a = front(state, unit, true);
  const df = front(state, d, false);
  const as = attackStrength(rules, state, a, d.owner, unit.owner);
  const ds = defenceStrength(rules, state, df, tile, { kind: preview.kind, opponent: unit.owner, from: unit.tile }, d.owner);
  const lead = o.attackerWins >= 0.66 ? 'good' : o.attackerWins >= 0.4 ? '' : 'warn';
  return (
    <div className="attack-preview">
      <div className={`odds ${lead}`}>
        <strong>{pct(o.attackerWins)}</strong> to win
        {o.attackerRetreats > 0.0005 && <span> · {pct(o.attackerRetreats)} retreat</span>}
        {o.defenderRetreats > 0.0005 && <span> · {pct(o.defenderRetreats)} they withdraw</span>}
        <span className="muted"> · {pct(o.defenderWins)} loss</span>
      </div>
      <div className="odds-bar">
        <i className="win" style={{ width: pct(o.attackerWins) }} />
        <i className="retreat" style={{ width: pct(o.attackerRetreats + o.defenderRetreats) }} />
        <i className="loss" style={{ width: pct(o.defenderWins) }} />
      </div>
      <div className="muted small">
        Defender: {state.players[d.owner]!.name} {rules.unit(d.type).name} ({d.experience}, {d.hp} hp)
      </div>
      <StrengthLine label="Attack" s={as} />
      <StrengthLine label="Defence" s={ds} />
    </div>
  );
}
