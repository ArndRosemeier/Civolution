/**
 * The city screen as a dashboard (PLAN.md §10.2): the work area with every tile's
 * yields, citizens and their moods, food, production and commerce with their
 * breakdowns, the build list and queue, and the buildings in the city.
 */
import { useMemo, useState } from 'react';
import {
  flipOdds,
  PERCENT_PER_POINT,
  inGoldenAge,
  borderRadius,
  buildCategory,
  buildCost,
  buildName,
  buildOptions,
  cityRadiusTiles,
  cityReport,
  cityTileYield,
  deltaX,
  hurryQuote,
  isExplored,
  knowsTech,
  placeableTiles,
  resourceVisibleTo,
  tileX,
  tileY,
  type Build,
  type City,
} from '@civolution/engine';
import { TERRAIN_COLORS } from '../map/palette.ts';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';
import { Dialog } from './Dialog.tsx';
import { Explain, explainText } from './Explain.tsx';
import { pauseGovernorFor, pauseTemplateFor } from './automation.ts';
import { CityAutomation } from './CityAutomation.tsx';
import { unitArt } from './art.ts';
import { governorFor } from '@civolution/automation';

const sameBuild = (a: Build | null, b: Build | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;

function art(path: string) {
  return `${import.meta.env.BASE_URL}art/${path}`;
}

/** Small picture for a build (generated icons, docs/assets.md); hidden until the file exists. */
export function BuildIcon({ build }: { build: Build }) {
  const src = build.kind === 'unit' ? unitArt(build.id) : art(`buildings/${build.id}.png`);
  return <img className="build-icon" src={src} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />;
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  return (
    <span className={`bar ${className}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, (value * 100) / Math.max(1, max)))}%` }} />
    </span>
  );
}

export function CityScreen({ cityId, onClose }: { cityId: number; onClose: () => void }) {
  const snap = useGame((s) => s.snapshot)!;
  const send = useGame((s) => s.send);
  const showToast = useGame((s) => s.showToast);
  const open = useGame((s) => s.open);
  const [showAll, setShowAll] = useState(false);
  const { state, human } = snap;
  const city = state.cities[cityId];
  const report = useMemo(() => (city ? cityReport(rules, state, city) : null), [state, city]);
  if (!city || !report) return null;
  const flip = flipOdds(rules, state, city, report.disorder);
  const mine = city.owner === human;
  const p = state.players[city.owner]!;
  const cost = city.build ? buildCost(rules, city.build, state, city.owner) : 0;
  const perTurn = report.shields.value;
  const turns = city.build && perTurn > 0 ? Math.max(1, Math.ceil(Math.max(0, cost - city.shields) / perTurn)) : null;

  // Navigation between own cities.
  const own = Object.values(state.cities).filter((c) => c.owner === human).sort((a, b) => a.id - b.id);
  const idx = own.findIndex((c) => c.id === city.id);
  const go = (d: number) => {
    const next = own[(idx + d + own.length) % own.length];
    if (next) open({ kind: 'city', id: next.id });
  };

  const setCitizens = (worked: number[], specialists: Record<string, number>) => {
    void pauseGovernorFor(city).then(() => send({ type: 'setCitizens', city: city.id, worked, specialists }));
  };
  const specialistTypes = rules.set.specialists.filter((s) => !s.laborer && (!s.requiredTech || knowsTech(p, s.requiredTech)));
  const toggleTile = (t: number) => {
    if (!mine) return;
    const specialists = { ...city.specialists };
    if (city.worked.includes(t)) {
      specialists['entertainer'] = (specialists['entertainer'] ?? 0) + 1;
      setCitizens(city.worked.filter((x) => x !== t), specialists);
      return;
    }
    const free = Object.entries(specialists).sort((a, b) => (a[0] === 'entertainer' ? -1 : b[0] === 'entertainer' ? 1 : 0)).find(([, n]) => n > 0);
    if (!free) {
      showToast('Every citizen is working a tile; click a worked tile first to free a citizen.');
      return;
    }
    specialists[free[0]] = free[1] - 1;
    setCitizens([...city.worked, t], specialists);
  };
  const cycleSpecialist = (from: string) => {
    if (!mine) return;
    const i = specialistTypes.findIndex((s) => s.id === from);
    const to = specialistTypes[(i + 1) % specialistTypes.length]!.id;
    if (to === from) return;
    const specialists = { ...city.specialists, [from]: (city.specialists[from] ?? 0) - 1, [to]: (city.specialists[to] ?? 0) + 1 };
    setCitizens(city.worked, specialists);
  };

  return (
    <Dialog title={city.name} onClose={onClose} wide>
      <div className="city-screen">
        <div className="city-head">
          <span className="swatch" style={{ background: p.color }} />
          <strong className="city-size">{city.size}</strong>
          <span className="muted">
            {report.sizeClass === 'town' ? 'Town' : report.sizeClass === 'city' ? 'City' : 'Metropolis'}
            {'palace' in city.buildings ? ' · Capital' : ''} · {p.name}
          </span>
          {report.disorder && <span className="badge warn">Civil disorder</span>}
          {report.celebrating && <span className="badge ok">We Love the King Day</span>}
          {report.resisters > 0 && (
            <span className="badge warn" title="Resisters neither work nor obey; the city produces nothing until a garrison quells them (two units quell one resister a turn).">
              {report.resisters} resisting
            </span>
          )}
          {inGoldenAge(state, city.owner) && <span className="badge ok">Golden age</span>}
          {report.pollution.value > 0 && (
            <span className="badge warn" title={`${report.pollution.parts.map((x) => `${x.label} ${x.amount > 0 ? '+' : ''}${x.amount}`).join('\n')}\nEach point is a ${PERCENT_PER_POINT} % chance a turn of a polluted tile.`}>
              Pollution {report.pollution.value}
            </span>
          )}
          {flip.chance > 0 && flip.toward !== null && (
            <span className="badge warn" title={flip.reasons.join('\n')}>
              {flip.chance} % a turn to join {state.players[flip.toward]!.name}
            </span>
          )}
          {city.nationality !== city.owner && state.players[city.nationality] && <span className="muted">{state.players[city.nationality]!.name} people</span>}
          <span className="spacer" />
          {mine && (
            <>
              <button onClick={() => go(-1)} title="Previous city">‹</button>
              <button onClick={() => go(1)} title="Next city">›</button>
              <button
                onClick={() => {
                  const name = prompt('Rename the city', city.name);
                  if (name && name.trim() && name !== city.name) void send({ type: 'renameCity', city: city.id, name });
                }}
              >
                Rename
              </button>
            </>
          )}
        </div>

        <div className="city-grid">
          <section className="city-col">
            <h3>Work area</h3>
            <TileMap city={city} onTile={toggleTile} />
            <div className="citizens">
              {(['happy', 'content', 'unhappy'] as const).flatMap((mood) =>
                Array.from({ length: report[mood] }, (_, i) => (
                  <span key={`${mood}${i}`} className={`citizen ${mood}`} title={mood[0]!.toUpperCase() + mood.slice(1)}>
                    <img src={art(`people/${mood}.png`)} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  </span>
                )),
              )}
              {Object.entries(city.specialists).flatMap(([s, n]) =>
                Array.from({ length: n }, (_, i) => (
                  <button key={`${s}${i}`} className={`citizen specialist ${s}`} title={`${rules.specialist(s).name}: click to change`} onClick={() => cycleSpecialist(s)}>
                    <img src={art(`people/${s}.png`)} alt={rules.specialist(s).name[0]} onError={(e) => (e.currentTarget.replaceWith(rules.specialist(s).name[0]!))} />
                  </button>
                )),
              )}
            </div>
            {mine && (
              <div className="row">
                {governorFor(state, city) ? (
                  <span className="muted small">Citizens placed by the governor; clicking a tile pauses it.</span>
                ) : (
                  <button className={city.manualTiles ? '' : 'on'} onClick={() => void send({ type: 'autoCitizens', city: city.id })} title="Let the city place its citizens itself">
                    {city.manualTiles ? 'Placed by hand · switch to automatic' : 'Citizens placed automatically'}
                  </button>
                )}
              </div>
            )}
            {mine && <CityAutomation city={city} />}
            <h3>Mood</h3>
            <ul className="moods">
              {report.moods.map((m, i) => (
                <li key={i}>
                  <span>{m.label}</span>
                  <span className="mood-counts">
                    <b className="happy">{m.happy}</b> <b className="content">{m.content}</b> <b className="unhappy">{m.unhappy}</b>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="city-col">
            <h3>Food</h3>
            <div className="meter">
              <Explain title="Food" value={report.food}>
                <span className="yield food">
                  <i />
                  {report.food.value}
                </span>
              </Explain>
              <span className="muted">− {report.foodEaten} eaten</span>
              <strong className={report.foodSurplus < 0 ? 'warn' : 'ok'}>{report.foodSurplus >= 0 ? `+${report.foodSurplus}` : report.foodSurplus}</strong>
            </div>
            <Bar value={city.food} max={report.foodBox} className="food" />
            <div className="muted small">
              {city.food} / {report.foodBox}
              {report.growth === null
                ? city.size >= report.sizeLimit
                  ? ` · needs ${report.sizeLimit <= rules.set.general.maxTownSize ? 'an Aqueduct' : 'a Hospital'} to grow`
                  : ' · not growing'
                : report.growth > 0
                  ? ` · grows in ${report.growth} turns`
                  : ` · starves in ${-report.growth} turns`}
            </div>

            <h3>Production</h3>
            <div className="meter">
              <Explain title="Shields" value={report.shields}>
                <span className="yield shields">
                  <i />
                  {report.shields.value}
                </span>
              </Explain>
              {report.waste.value > 0 && (
                <Explain title="Waste" value={report.corruptionRate} unit=" %">
                  <span className="muted">waste {report.waste.value}</span>
                </Explain>
              )}
            </div>
            {city.build ? (
              <>
                <div className="current-build">
                  <BuildIcon build={city.build} />
                  <strong>{buildName(rules, city.build)}</strong>
                  <span className="muted">{turns !== null ? `${turns} turn${turns === 1 ? '' : 's'}` : 'stalled'}</span>
                </div>
                <Bar value={city.shields} max={cost} className="shields" />
                <div className="muted small">
                  {city.shields} / {cost}
                </div>
                {mine && <HurryButton city={city} />}
              </>
            ) : (
              <div className="warn">Nothing is being built.</div>
            )}
            {city.queue.length > 0 && (
              <ol className="queue">
                {city.queue.map((b, i) => (
                  <li key={i}>
                    <BuildIcon build={b} />
                    {buildName(rules, b)}
                    {mine && (
                      <button className="icon" title="Remove" onClick={() => void send({ type: 'setQueue', city: city.id, queue: city.queue.filter((_, k) => k !== i) })}>
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}

            <h3>Commerce</h3>
            <div className="meter">
              <Explain title="Commerce" value={report.commerceBase}>
                <span className="yield commerce">
                  <i />
                  {report.commerceBase.value}
                </span>
              </Explain>
              <Explain title="Corruption rate" value={report.corruptionRate} unit=" %">
                <span className="muted">corruption {report.corruption.value}</span>
              </Explain>
            </div>
            <div className="split">
              <Explain title="Tax" value={report.tax}>
                <span className="gold">Gold {report.tax.value}</span>
              </Explain>
              <Explain title="Science" value={report.science}>
                <span className="science">Science {report.science.value}</span>
              </Explain>
              <Explain title="Luxury" value={report.luxury}>
                <span className="luxury">Luxury {report.luxury.value}</span>
              </Explain>
            </div>
            <div className="muted small">
              <Explain title="Upkeep" value={report.upkeep}>
                <span>Upkeep {report.upkeep.value} gold</span>
              </Explain>
              {' · '}
              <Explain title="Culture per turn" value={report.culture}>
                <span>
                  Culture {city.culture} (+{report.culture.value}) · border ring {borderRadius(rules, city.culture)}
                </span>
              </Explain>
            </div>
            {report.resources.length > 0 && (
              <div className="city-resources">
                {report.resources.map((r) => (
                  <img key={r} src={art(`resources/${r}.png`)} title={rules.resources[rules.resourceIndex(r)]!.name} alt={r} onError={(e) => (e.currentTarget.style.display = 'none')} />
                ))}
              </div>
            )}

            <h3>Buildings</h3>
            <ul className="buildings">
              {Object.keys(city.buildings)
                .sort((a, b) => rules.set.buildings.findIndex((x) => x.id === a) - rules.set.buildings.findIndex((x) => x.id === b))
                .map((b) => {
                  const r = rules.building(b);
                  return (
                    <li key={b} title={[r.upkeep ? `Upkeep ${r.upkeep}` : '', r.culture ? `Culture ${r.culture}` : '', r.contentFaces ? `Content +${r.contentFaces}` : ''].filter(Boolean).join(' · ')}>
                      <BuildIcon build={{ kind: 'building', id: b }} />
                      {r.name}
                    </li>
                  );
                })}
            </ul>
          </section>

          <section className="city-col build-list">
            <h3>
              Build
              <label className="check small">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> show unavailable
              </label>
            </h3>
            {mine ? <BuildList city={city} perTurn={perTurn} showAll={showAll} /> : <div className="muted">Another civilization’s city.</div>}
            <p className="muted small">Click to build now, Shift+click to add to the queue.</p>
          </section>
        </div>
      </div>
    </Dialog>
  );
}

function HurryButton({ city }: { city: City }) {
  const snap = useGame((s) => s.snapshot)!;
  const send = useGame((s) => s.send);
  const q = hurryQuote(rules, snap.state, city);
  const gold = snap.state.players[city.owner]!.gold;
  if (q.kind === 'none') return <div className="muted small">{q.reason}</div>;
  const label = q.kind === 'gold' ? `Buy for ${q.gold} gold` : `Forced labour: ${q.citizens} citizen${q.citizens === 1 ? '' : 's'}`;
  const short = q.kind === 'gold' && q.gold > gold;
  return (
    <button
      className={short ? 'disabled' : 'primary'}
      title={short ? `The treasury has ${gold} gold.` : `Completes ${buildName(rules, city.build!)} at the end of the turn.`}
      onClick={() => !short && confirm(`${label}?`) && void send({ type: 'hurry', city: city.id })}
    >
      {label}
    </button>
  );
}

function BuildList({ city, perTurn, showAll }: { city: City; perTurn: number; showAll: boolean }) {
  const snap = useGame((s) => s.snapshot)!;
  const send = useGame((s) => s.send);
  const options = useMemo(() => buildOptions(rules, snap.state, city), [snap.state, city]);
  const groups: { title: string; items: typeof options }[] = [
    { title: 'Units', items: options.filter((o) => o.build.kind === 'unit') },
    { title: 'Buildings', items: options.filter((o) => o.build.kind === 'building' && buildCategory(rules, o.build) === 'improvement') },
    { title: 'Wonders', items: options.filter((o) => buildCategory(rules, o.build) === 'wonder') },
  ];
  const pick = (b: Build, queue: boolean) => {
    void pauseTemplateFor(city).then(() => (queue ? send({ type: 'setQueue', city: city.id, queue: [...city.queue, b] }) : send({ type: 'setBuild', city: city.id, build: b })));
  };
  return (
    <div>
      {groups.map((g) => {
        const items = g.items.filter((o) => showAll || o.blocker === null);
        if (items.length === 0) return null;
        return (
          <div key={g.title}>
            <h4>{g.title}</h4>
            <ul className="build-options">
              {items.map((o) => {
                const have = sameBuild(city.build, o.build) ? city.shields : 0;
                const t = perTurn > 0 ? Math.max(1, Math.ceil((o.cost - have) / perTurn)) : null;
                const wealth = o.build.kind === 'building' && rules.building(o.build.id).kind === 'wealth';
                return (
                  <li key={`${o.build.kind}:${o.build.id}`}>
                    <button
                      className={`${o.blocker ? 'disabled' : ''} ${sameBuild(city.build, o.build) ? 'on' : ''}`}
                      title={o.blocker ?? buildTip(o.build)}
                      onClick={(e) => !o.blocker && pick(o.build, e.shiftKey)}
                    >
                      <BuildIcon build={o.build} />
                      <span className="name">{buildName(rules, o.build)}</span>
                      <span className="muted">{wealth ? 'gold' : o.cost}</span>
                      <span className="turns">{wealth ? '' : o.blocker ? '' : t !== null ? `${t}` : '–'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function buildTip(b: Build): string {
  if (b.kind === 'unit') {
    const u = rules.unit(b.id);
    return `${u.name}: attack ${u.attack}, defence ${u.defence}, moves ${u.movement}${u.populationCost ? `, uses ${u.populationCost} citizens` : ''}`;
  }
  const r = rules.building(b.id);
  const parts = [
    r.upkeep ? `upkeep ${r.upkeep} gold` : null,
    r.culture ? `culture ${r.culture}` : null,
    r.contentFaces ? `${r.contentFaces} content` : null,
    r.productionPercent ? `+${r.productionPercent} % production` : null,
    ...r.effects.filter((e) => e !== 'touristAttraction').map(effectText),
  ].filter(Boolean);
  return `${r.name}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

const EFFECTS: Record<string, string> = {
  tax50: '+50 % tax',
  research50: '+50 % science',
  increasesLuxuryTrade: '+50 % luxury, more from luxury resources',
  doublesCityGrowth: 'keeps half the food on growth',
  allowsCitySize2: 'growth past size 6',
  allowsCitySize3: 'growth past size 12',
  reducesCorruption: 'less corruption',
  veteranGroundUnits: 'veteran land units',
  veteranSeaUnits: 'veteran ships',
  veteranAirUnits: 'veteran aircraft',
  increasesFoodInWater: '+1 food on water',
  increasesShieldsInWater: '+1 shield on water',
  increasesCommerceInWater: '+1 commerce on water',
  doublesResearch: 'doubles science here',
  capitalization: 'shields become gold',
  centerOfEmpire: 'seat of government',
};

function effectText(e: string): string | null {
  return EFFECTS[e] ?? null;
}

/** The 21-tile work area as diamonds with each tile's yields; click to work or free a tile. */
function TileMap({ city, onTile }: { city: City; onTile: (t: number) => void }) {
  const snap = useGame((s) => s.snapshot)!;
  const { state, human } = snap;
  const g = state.map;
  const player = state.players[human]!;
  const placeable = new Set(city.owner === human ? placeableTiles(rules, state, city) : []);
  const S = 34;
  const H = 22;
  const x0 = tileX(g, city.tile);
  const y0 = tileY(g, city.tile);
  const tiles = cityRadiusTiles(g, city.tile);
  return (
    <svg className="tile-map" viewBox={`${-3 * S} ${-3 * H} ${6 * S} ${6 * H}`}>
      {tiles.map((t) => {
        const dx = deltaX(g, x0, tileX(g, t));
        const dy = tileY(g, t) - y0;
        const cx = dx * S;
        const cy = dy * H;
        const seen = isExplored(player, t);
        const terrain = rules.terrains[g.terrain[t]!]!;
        const fill = seen ? TERRAIN_COLORS[terrain.id]?.[0] ?? '#555' : '#0b0f14';
        const worked = t === city.tile || city.worked.includes(t);
        const ours = g.territory[t] === city.owner;
        const y = seen ? cityTileYield(rules, state, city, t) : null;
        const res = g.resource[t]!;
        const resource = seen && res >= 0 && resourceVisibleTo(rules, state, human, res) ? rules.resources[res]! : null;
        const clickable = t !== city.tile && (worked || placeable.has(t));
        const tip = y
          ? `${terrain.name}${resource ? ` · ${resource.name}` : ''}${!ours ? ' · outside the borders' : ''}\n${explainText('Food', y.food)}\n${explainText('Shields', y.shields)}\n${explainText('Commerce', y.commerce)}`
          : 'Unexplored';
        return (
          <g key={t} className={`tile ${worked ? 'worked' : ''} ${clickable ? 'clickable' : ''} ${ours ? '' : 'foreign'}`} onClick={() => clickable && onTile(t)}>
            <title>{tip}</title>
            <polygon points={`${cx},${cy - H} ${cx + S},${cy} ${cx},${cy + H} ${cx - S},${cy}`} fill={fill} />
            {t === city.tile && <circle cx={cx} cy={cy - 8} r={6} className="city-dot" />}
            {y && (worked || ours) && (
              <text x={cx} y={cy + 6} textAnchor="middle" className="tile-yield">
                <tspan className="f">{y.food.value}</tspan>
                <tspan className="s" dx="5">
                  {y.shields.value}
                </tspan>
                <tspan className="c" dx="5">
                  {y.commerce.value}
                </tspan>
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

