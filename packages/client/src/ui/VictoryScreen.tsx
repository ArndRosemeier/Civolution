/**
 * Victory (F8): how close every civilization you know is to each way of winning, the
 * spaceship with its launch button, the United Nations, and the histograph of scores.
 * When the game has just been decided it opens on its own with the result.
 */
import {
  culturalWinner,
  dominationShares,
  FLIGHT_TURNS,
  formatYear,
  inGoldenAge,
  launchBlocker,
  playerCities,
  score,
  spaceshipParts,
  unCandidates,
  UN_VOTE_TURNS,
  VICTORY_NAMES,
  yearOf,
  type GameState,
} from '@civolution/engine';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';
import { Dialog } from './Dialog.tsx';

const v = rules.set.general.victory;

function Meter({ value, goal, label }: { value: number; goal: number; label: string }) {
  const pct = goal > 0 ? Math.min(100, Math.round((value * 100) / goal)) : 0;
  return (
    <div className="meter" title={`${label}: ${value} of ${goal}`}>
      <span className="bar">
        <i style={{ width: `${pct}%` }} />
      </span>
      <small className="muted">
        {value.toLocaleString()} / {goal.toLocaleString()}
      </small>
    </div>
  );
}

/** Scores over time as lines, one per known civilization. */
function Histograph({ state, players }: { state: GameState; players: number[] }) {
  const series = players.map((id) => ({ p: state.players[id]!, scores: state.players[id]!.scores }));
  const turns = Math.max(2, ...series.map((s) => s.scores.length));
  const top = Math.max(10, ...series.flatMap((s) => s.scores));
  const w = 640;
  const h = 200;
  const x = (i: number) => (i / (turns - 1)) * w;
  const y = (n: number) => h - (n / top) * (h - 10);
  return (
    <svg className="histograph" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Score over time">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={0} x2={w} y1={y(top * f)} y2={y(top * f)} className="grid" />
      ))}
      {series.map(({ p, scores }) => (
        <polyline key={p.id} fill="none" stroke={p.color} strokeWidth={p.id === players[0] ? 2.5 : 1.5} points={scores.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ')}>
          <title>{`${p.name}: ${scores.at(-1) ?? 0}`}</title>
        </polyline>
      ))}
    </svg>
  );
}

export function VictoryScreen({ onClose, gameOver }: { onClose: () => void; gameOver?: boolean }) {
  const snap = useGame((s) => s.snapshot)!;
  const send = useGame((s) => s.send);
  const { state, human } = snap;
  const me = state.players[human]!;
  const known = [human, ...me.contacts.filter((x) => !state.players[x]!.barbarian)];
  const alive = known.filter((x) => state.players[x]!.alive);
  const opts = state.options;
  const won = state.victory;
  const parts = spaceshipParts(rules);
  const ship = me.spaceship;
  const launch = launchBlocker(rules, state, human);
  const candidates = unCandidates(rules, state);
  const culture = culturalWinner(rules, state);
  const bestCity = (p: number) => Math.max(0, ...playerCities(state, p).map((c) => c.culture));
  const turnsLeft = rules.set.general.lastTurn - state.turn;

  return (
    <Dialog title={won ? (won.winner === human ? 'Victory' : 'The game is decided') : 'Victory'} onClose={onClose} wide>
      <div className="advisor victory">
        {won && (
          <section className={`victory-banner ${won.winner === human ? 'won' : 'lost'}`}>
            <img src={`${import.meta.env.BASE_URL}art/victory/${won.winner === human ? won.kind : 'defeat'}.jpg`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <div>
              <h3>{won.winner === human ? `${VICTORY_NAMES[won.kind]} victory!` : won.winner === null ? 'Nobody won' : `${state.players[won.winner]!.name} wins`}</h3>
              <p>
                {won.winner === null ? won.detail : `${state.players[won.winner]!.name}: ${won.detail}`} ({formatYear(yearOf(rules, won.turn))}, turn {won.turn}).
              </p>
              {gameOver && <p className="muted">You may keep playing; nobody else can win this game.</p>}
            </div>
          </section>
        )}
        <section>
          <h3>Histograph</h3>
          <Histograph state={state} players={known} />
          <table className="city-table">
            <thead>
              <tr>
                <th>Civilization</th>
                <th>Score</th>
                <th>Land</th>
                <th>People</th>
                <th>Culture</th>
                {opts.mode === 'victoryPoints' && <th>Victory points</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {alive.map((id) => {
                const p = state.players[id]!;
                const s = dominationShares(rules, state, id);
                return (
                  <tr key={id}>
                    <td>
                      <span className="swatch" style={{ background: p.color }} /> {p.name}
                    </td>
                    <td>{score(rules, state, id)}</td>
                    <td>{s.land} %</td>
                    <td>{s.population} %</td>
                    <td>{p.culture.toLocaleString()}</td>
                    {opts.mode === 'victoryPoints' && <td>{p.victoryPoints}</td>}
                    <td className="muted">{inGoldenAge(state, id) ? 'Golden age' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="victory-grid">
          <div>
            <h4>Domination {opts.victories.domination ? '' : <small className="muted">(off)</small>}</h4>
            <p className="muted">
              {v.dominationLandPercent} % of the land and {v.dominationPopulationPercent} % of the people.
            </p>
            <Meter label="Land" value={dominationShares(rules, state, human).land} goal={v.dominationLandPercent} />
            <Meter label="People" value={dominationShares(rules, state, human).population} goal={v.dominationPopulationPercent} />
          </div>
          <div>
            <h4>Culture {opts.victories.cultural ? '' : <small className="muted">(off)</small>}</h4>
            <p className="muted">
              {v.civCulture.toLocaleString()} points and twice any rival, or {v.cityCulture.toLocaleString()} in one city.
            </p>
            <Meter label="Civilization" value={me.culture} goal={v.civCulture} />
            <Meter label="Best city" value={bestCity(human)} goal={v.cityCulture} />
            {culture && culture.player !== human && <p className="warn">{state.players[culture.player]!.name} is on the brink.</p>}
          </div>
          <div>
            <h4>Space race {opts.victories.space ? '' : <small className="muted">(off)</small>}</h4>
            <p className="muted">Your own Apollo Program, then the ten parts; the ship flies {FLIGHT_TURNS} turns from the capital.</p>
            <ul className="ship-parts">
              {parts.map((x) => (
                <li key={x.id} className={(ship.parts[x.id] ?? 0) >= x.needed ? 'done' : ''}>
                  <img src={`${import.meta.env.BASE_URL}art/buildings/${x.id}.png`} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  {rules.building(x.id).name.replace(/^SS /, '')}
                </li>
              ))}
            </ul>
            {ship.launched !== null ? (
              <p>Launched on turn {ship.launched}; it arrives on turn {ship.arrives}.</p>
            ) : (
              <button className="primary" disabled={launch !== null} title={launch ?? 'Launch the spaceship'} onClick={() => void send({ type: 'launchSpaceship' })}>
                Launch the spaceship
              </button>
            )}
            {alive
              .filter((id) => id !== human && state.players[id]!.spaceship.launched !== null)
              .map((id) => (
                <p key={id} className="warn">
                  {state.players[id]!.name}'s ship arrives on turn {state.players[id]!.spaceship.arrives}.
                </p>
              ))}
          </div>
          <div>
            <h4>United Nations {opts.victories.diplomatic ? '' : <small className="muted">(off)</small>}</h4>
            {candidates.length === 0 ? (
              <p className="muted">Whoever builds the United Nations calls an election every {UN_VOTE_TURNS} turns; a majority of the world's citizens wins it.</p>
            ) : (
              <>
                <p>Candidates: {candidates.map((c) => state.players[c]!.name).join(' and ')}.</p>
                {state.un && <p className="muted">Next vote on turn {state.un.nextVote}.</p>}
                {state.un?.last && (
                  <p className="muted">
                    Last vote: {Object.entries(state.un.last.votes).map(([p, n]) => `${state.players[Number(p)]!.name} ${n}`).join(', ')} of {state.un.last.total}.
                  </p>
                )}
              </>
            )}
          </div>
          <div>
            <h4>Conquest {opts.victories.conquest ? '' : <small className="muted">(off)</small>}</h4>
            <p className="muted">
              {state.players.filter((p) => p.alive && !p.barbarian).length} civilizations remain
              {opts.mode === 'regicide' || opts.mode === 'massRegicide' ? '; a civilization falls with its king' : ''}
              {opts.mode === 'elimination' ? '; a civilization falls with its first lost city' : ''}.
            </p>
          </div>
          <div>
            <h4>Time</h4>
            <p className="muted">
              {turnsLeft > 0 ? `${turnsLeft} turns left until ${formatYear(yearOf(rules, rules.set.general.lastTurn))}` : 'Time is up'}; then the {opts.mode === 'victoryPoints' ? 'most victory points' : 'highest score'} wins.
            </p>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
