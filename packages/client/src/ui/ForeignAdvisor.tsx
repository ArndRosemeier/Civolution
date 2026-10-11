/**
 * The war room (F3): every civilization met with war or peace, war weariness, and your
 * military at a glance. Treaties, trades and peace talks are on the diplomacy screen (F4).
 */
import { armyCount, armyLimit, attitude, campTiles, cargoOf, currentHp, isArmy, maxHp, playerCities, playerUnits, relation } from '@civolution/engine';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';
import { Dialog } from './Dialog.tsx';

export function ForeignAdvisor({ onClose }: { onClose: () => void }) {
  const snap = useGame((s) => s.snapshot)!;
  const { state, human } = snap;
  const me = state.players[human]!;
  const gov = rules.government(me.government);
  const rivals = state.players.filter((p) => p.id !== human && !p.barbarian && me.contacts.includes(p.id));
  const talk = (id: number) => useGame.getState().open({ kind: 'diplomacy', with: id });
  const barbarians = state.players.find((p) => p.barbarian);
  const totalWeariness = Object.values(me.weariness).reduce((a, x) => a + x, 0);
  const units = playerUnits(state, human).filter((u) => u.carriedBy === null || !isArmy(rules, state.units[u.carriedBy]!));
  const military = units.filter((u) => {
    const r = rules.unit(u.type);
    return r.attack > 0 || r.defence > 0 || r.bombardStrength > 0 || isArmy(rules, u);
  });
  const byType = new Map<string, { count: number; hurt: number }>();
  for (const u of military) {
    const e = byType.get(u.type) ?? { count: 0, hurt: 0 };
    e.count++;
    if (currentHp(rules, state, u) < maxHp(rules, state, u)) e.hurt++;
    byType.set(u.type, e);
  }
  const knownCamps = campTiles(state).filter((t) => (me.explored[t >> 5]! >>> (t & 31)) & 1).length;
  const leaders = units.filter((u) => rules.unit(u.type).abilities.includes('leader')).length;

  return (
    <Dialog title="War room" onClose={onClose} wide>
      <div className="advisor foreign">
        <section>
          <h3>Civilizations</h3>
          <table className="city-table">
            <thead>
              <tr>
                <th>Civilization</th>
                <th>Cities</th>
                <th>Status</th>
                <th>Mood</th>
                <th title="War weariness points your people feel against them">Weariness</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rivals.map((p) => {
                const war = me.atWarWith.includes(p.id);
                const ceasefire = relation(state, human, p.id) === 'ceasefire';
                return (
                  <tr key={p.id} className={p.alive ? '' : 'muted'}>
                    <td>
                      <span className="swatch" style={{ background: p.color }} /> {p.name}
                    </td>
                    <td>{p.alive ? playerCities(state, p.id).length : '—'}</td>
                    <td>
                      {!p.alive ? (
                        'Destroyed'
                      ) : war ? (
                        <span className="badge war">
                          <img src={`${import.meta.env.BASE_URL}art/war/war.png`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                          At war
                        </span>
                      ) : (
                        <span className="badge peace">
                          <img src={`${import.meta.env.BASE_URL}art/war/peace.png`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                          {ceasefire ? 'Ceasefire' : 'At peace'}
                        </span>
                      )}
                    </td>
                    <td className="cap">{p.alive ? attitude(rules, state, p.id, human).level : '—'}</td>
                    <td>{me.weariness[p.id] ?? 0}</td>
                    <td>
                      {p.alive && <button onClick={() => talk(p.id)}>{war ? 'Talk peace' : 'Talk'}</button>}
                    </td>
                  </tr>
                );
              })}
              {rivals.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No other civilization met yet.
                  </td>
                </tr>
              )}
              {barbarians && (
                <tr>
                  <td>
                    <span className="swatch" style={{ background: barbarians.color }} /> Barbarians
                  </td>
                  <td>{knownCamps} known camp{knownCamps === 1 ? '' : 's'}</td>
                  <td>
                    <span className="badge war">
                      <img src={`${import.meta.env.BASE_URL}art/war/barbarians.png`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      Always hostile
                    </span>
                  </td>
                  <td>—</td>
                  <td>—</td>
                  <td className="muted small">Activity: {state.settings.barbarians}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="muted small">
            War weariness: {totalWeariness} points. {gov.name}{' '}
            {gov.warWeariness === 'none' ? 'citizens do not tire of war.' : gov.warWeariness === 'low' ? 'citizens tire of war slowly (one unhappy face per 40 points).' : 'citizens tire of war quickly (one unhappy face per 20 points).'} Points come from battles and lost units and cities, and fade by a tenth each turn.
          </p>
        </section>
        <section>
          <h3>Your forces</h3>
          <p className="muted small">
            {military.length} military unit{military.length === 1 ? '' : 's'} · armies {armyCount(rules, state, human)} of {armyLimit(rules, state, human)} · {leaders} great leader{leaders === 1 ? '' : 's'}
          </p>
          <table className="city-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>A / D / M</th>
                <th>Count</th>
                <th>Wounded</th>
              </tr>
            </thead>
            <tbody>
              {[...byType.entries()]
                .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
                .map(([type, e]) => {
                  const r = rules.unit(type);
                  return (
                    <tr key={type}>
                      <td>
                        <img className="thumb" src={`${import.meta.env.BASE_URL}art/units/${type}.png`} alt="" onError={(ev) => (ev.currentTarget.style.display = 'none')} /> {r.name}
                      </td>
                      <td>
                        {r.attack} / {r.defence} / {r.movement}
                      </td>
                      <td>{e.count}</td>
                      <td>{e.hurt || ''}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {military.some((u) => isArmy(rules, u)) && (
            <ul className="muted small">
              {military
                .filter((u) => isArmy(rules, u))
                .map((a) => (
                  <li key={a.id}>
                    Army: {cargoOf(state, a.id).map((m) => rules.unit(m.type).name).join(', ') || 'empty'}
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}
