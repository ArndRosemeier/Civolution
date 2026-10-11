/**
 * The automation screen (PLAN.md §8, F7): what is delegated, governors, build templates,
 * workers and their job board, empire policies, and the player's own rules with import
 * and export. Every change is one `setAutomation` command.
 */
import { useEffect, useState } from 'react';
import {
  BUILT_IN_TEMPLATES,
  GOVERNORS,
  allTemplates,
  delegateEverything,
  describeBuild,
  describeCondition,
  exportRoutines,
  governCity,
  governorFor,
  importRoutines,
  type JobBoard,
} from '@civolution/automation';
import {
  GOVERNOR_PRESETS,
  STATS,
  TRIGGERS,
  UNIT_ROLES,
  UNIT_ROUTINES,
  playerCities,
  type AutomationSettings,
  type BuildRef,
  type BuildTemplate,
  type Condition,
  type Delegation,
  type GovernorPreset,
  type GovernorWeights,
  type RoutineRule,
  type RuleAction,
  type Stat,
  type Trigger,
  type UnitRoutine,
  type WorkerTask,
} from '@civolution/engine';
import { host } from '../host/client.ts';
import { rules } from '../rules.ts';
import { useGame, type AutomationTab } from '../store.ts';
import { editAutomation } from './automation.ts';
import { AutoIcon } from './AutoIcon.tsx';
import { Dialog } from './Dialog.tsx';

const TABS: { id: AutomationTab; label: string }[] = [
  { id: 'delegation', label: 'Delegation' },
  { id: 'governors', label: 'Governors' },
  { id: 'templates', label: 'Build templates' },
  { id: 'workers', label: 'Workers' },
  { id: 'policies', label: 'Policies' },
  { id: 'rules', label: 'Your rules' },
];

export function AutomationScreen({ tab: initial, onClose }: { tab?: AutomationTab; onClose: () => void }) {
  const [tab, setTab] = useState<AutomationTab>(initial ?? 'delegation');
  const snap = useGame((s) => s.snapshot)!;
  const a = snap.state.players[snap.human]!.automation;
  return (
    <Dialog title="Automation" onClose={onClose} wide>
      <div className="automation">
        <div className="segmented tabs">
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'delegation' && <DelegationTab a={a} />}
        {tab === 'governors' && <GovernorsTab a={a} />}
        {tab === 'templates' && <TemplatesTab a={a} />}
        {tab === 'workers' && <WorkersTab a={a} />}
        {tab === 'policies' && <PoliciesTab a={a} />}
        {tab === 'rules' && <RulesTab a={a} />}
      </div>
    </Dialog>
  );
}

const ASPECTS: { key: keyof Delegation; label: string; blurb: string }[] = [
  { key: 'cities', label: 'Citizens', blurb: 'Governors place citizens in every city.' },
  { key: 'builds', label: 'Builds', blurb: 'Templates choose builds; new cities get one; settlers settle.' },
  { key: 'workers', label: 'Workers', blurb: 'New workers join the worker pool.' },
  { key: 'research', label: 'Research', blurb: 'The next advance, toward your goal if you set one.' },
  { key: 'rates', label: 'Treasury', blurb: 'Rates by your policy, and the best government known.' },
  { key: 'military', label: 'Military', blurb: 'New units garrison cities or go to rally points; upgrades.' },
  { key: 'diplomacy', label: 'Offers', blurb: 'Answers offers by your deal policy.' },
];

function DelegationTab({ a }: { a: AutomationSettings }) {
  const level = (name: 'manual' | 'cities' | 'all') =>
    void editAutomation((x) => {
      if (name === 'all') Object.assign(x, delegateEverything(x));
      else for (const k of Object.keys(x.delegate) as (keyof Delegation)[]) x.delegate[k] = name === 'cities' && (k === 'cities' || k === 'builds' || k === 'workers');
    });
  return (
    <div>
      <p className="hint">Hand whole parts of the game to automation and step back in anywhere. Everything it does is an ordinary order with its reason in the log; changing something by hand pauses it there.</p>
      <div className="segmented">
        <button onClick={() => level('manual')}>
          Manual<small>you decide everything</small>
        </button>
        <button onClick={() => level('cities')}>
          Domestic advisor<small>cities, builds, workers</small>
        </button>
        <button onClick={() => level('all')}>
          Delegate everything<small>you set the course</small>
        </button>
      </div>
      <div className="aspects">
        {ASPECTS.map((x) => (
          <label key={x.key} className={`aspect ${a.delegate[x.key] ? 'on' : ''}`}>
            <input
              type="checkbox"
              checked={a.delegate[x.key]}
              onChange={(e) =>
                void editAutomation((s) => {
                  s.delegate[x.key] = e.target.checked;
                })
              }
            />
            <AutoIcon name={x.key} size={34} />
            <span>
              <strong>{x.label}</strong>
              <small className="muted">{x.blurb}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="field row">
        <label>
          Defenders per city
          <input
            type="number"
            min={0}
            max={8}
            value={a.garrison}
            onChange={(e) =>
              void editAutomation((s) => {
                s.garrison = Math.max(0, Math.min(8, Math.round(Number(e.target.value) || 0)));
              })
            }
          />
        </label>
      </div>
    </div>
  );
}

const WEIGHTS: (keyof GovernorWeights)[] = ['food', 'shields', 'commerce', 'gold', 'science', 'luxury'];

function GovernorsTab({ a }: { a: AutomationSettings }) {
  const snap = useGame((s) => s.snapshot)!;
  const open = useGame((s) => s.open);
  const g = a.defaultGovernor;
  const cities = playerCities(snap.state, snap.human);
  return (
    <div>
      <span className="field-label">Empire default {a.delegate.cities ? '' : '(used once citizens are delegated)'}</span>
      <div className="segmented governors">
        {GOVERNOR_PRESETS.map((p) => (
          <button
            key={p}
            className={g.preset === p ? 'on' : ''}
            title={GOVERNORS[p].blurb}
            onClick={() =>
              void editAutomation((x) => {
                x.defaultGovernor = { ...x.defaultGovernor, preset: p };
              })
            }
          >
            <AutoIcon name={p} size={30} />
            {GOVERNORS[p].name}
          </button>
        ))}
        <button
          className={g.preset === 'custom' ? 'on' : ''}
          onClick={() =>
            void editAutomation((x) => {
              x.defaultGovernor = { ...x.defaultGovernor, preset: 'custom', weights: x.defaultGovernor.weights ?? { ...GOVERNORS.balanced.weights } };
            })
          }
        >
          <AutoIcon name="custom" size={30} />
          Custom
        </button>
      </div>
      {g.preset === 'custom' && (
        <div className="weights">
          {WEIGHTS.map((w) => (
            <label key={w}>
              <span>{w}</span>
              <input
                type="range"
                min={0}
                max={10}
                value={g.weights?.[w] ?? 0}
                onChange={(e) =>
                  void editAutomation((x) => {
                    x.defaultGovernor = { ...x.defaultGovernor, weights: { ...(x.defaultGovernor.weights ?? GOVERNORS.balanced.weights), [w]: Number(e.target.value) } };
                  })
                }
              />
              <b>{g.weights?.[w] ?? 0}</b>
            </label>
          ))}
        </div>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={g.hurry}
          onChange={(e) =>
            void editAutomation((x) => {
              x.defaultGovernor = { ...x.defaultGovernor, hurry: e.target.checked };
            })
          }
        />{' '}
        Governors may rush builds from the hurry budget ({a.policies.hurryBudget} gold a turn, set under Policies)
      </label>
      <table className="city-table">
        <thead>
          <tr>
            <th>City</th>
            <th>Governor</th>
            <th>What it does now</th>
          </tr>
        </thead>
        <tbody>
          {cities.slice(0, 60).map((c) => {
            const active = governorFor(snap.state, c);
            const own = a.governors[c.id];
            return (
              <tr key={c.id}>
                <td>
                  <button className="link" onClick={() => open({ kind: 'city', id: c.id })}>
                    {c.name}
                  </button>
                </td>
                <td>
                  <select
                    value={own?.preset ?? 'default'}
                    aria-label={`Governor of ${c.name}`}
                    onChange={(e) =>
                      void editAutomation((x) => {
                        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keyed by city id
                        if (e.target.value === 'default') delete x.governors[c.id];
                        else x.governors[c.id] = { preset: e.target.value as GovernorPreset, hurry: x.defaultGovernor.hurry };
                      })
                    }
                  >
                    <option value="default">{a.delegate.cities ? 'Default' : 'None'}</option>
                    {GOVERNOR_PRESETS.map((p) => (
                      <option key={p} value={p}>
                        {GOVERNORS[p].name}
                      </option>
                    ))}
                  </select>
                  {own?.paused && <span className="badge warn">paused</span>}
                </td>
                <td className="muted small">{active ? governCity(rules, snap.state, c, active).reason.replace(/^Governor \([^)]*\): /, '') : 'Not governed'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {cities.length > 60 && <div className="hint">The first 60 of {cities.length} cities; each city screen has its own governor setting.</div>}
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = { defender: 'Best defender', attacker: 'Best attacker', siege: 'Best siege unit', worker: 'Worker', settler: 'Settler', explorer: 'Explorer', ship: 'Best ship' };

function BuildPicker({ value, onChange }: { value: BuildRef; onChange: (b: BuildRef) => void }) {
  const key = value.kind === 'role' ? `role:${value.role}` : `${value.kind}:${value.id}`;
  return (
    <select
      value={key}
      aria-label="Build"
      onChange={(e) => {
        const [kind, id] = e.target.value.split(':') as [string, string];
        onChange(kind === 'role' ? { kind: 'role', role: id as Extract<BuildRef, { kind: 'role' }>['role'] } : { kind: kind as 'unit' | 'building', id });
      }}
    >
      <optgroup label="Unit roles">
        {UNIT_ROLES.map((r) => (
          <option key={r} value={`role:${r}`}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </optgroup>
      <optgroup label="Buildings">
        {rules.set.buildings
          .filter((b) => b.kind === 'improvement' || b.kind === 'smallWonder' || b.kind === 'wealth')
          .map((b) => (
            <option key={b.id} value={`building:${b.id}`}>
              {b.name}
            </option>
          ))}
      </optgroup>
    </select>
  );
}

const STAT_LABEL: Record<Stat, string> = {
  size: 'Size',
  unhappy: 'Unhappy',
  happy: 'Happy',
  foodSurplus: 'Food surplus',
  shields: 'Shields',
  commerce: 'Commerce',
  corruption: 'Corruption %',
  defenders: 'Defenders',
  gold: 'Treasury',
  atWar: 'At war (1/0)',
  coastal: 'Coastal (1/0)',
  turn: 'Turn',
  cities: 'Cities',
  has: 'Has building (1/0)',
};

function ConditionsEditor({ value, onChange }: { value: Condition[]; onChange: (c: Condition[]) => void }) {
  return (
    <div className="conditions">
      {value.map((c, i) => (
        <span key={i} className="condition">
          <select value={c.stat} aria-label="Value" onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, stat: e.target.value as Stat, ...(e.target.value === 'has' ? { building: x.building ?? 'temple' } : {}) } : x)))}>
            {STATS.map((s) => (
              <option key={s} value={s}>
                {STAT_LABEL[s]}
              </option>
            ))}
          </select>
          {c.stat === 'has' && (
            <select value={c.building} aria-label="Building" onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, building: e.target.value } : x)))}>
              {rules.set.buildings
                .filter((b) => b.kind !== 'wealth')
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          )}
          <select value={c.op} aria-label="Comparison" onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, op: e.target.value as Condition['op'] } : x)))}>
            <option value=">=">≥</option>
            <option value="<=">≤</option>
            <option value="=">=</option>
          </select>
          <input type="number" value={c.value} aria-label="Amount" onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, value: Math.round(Number(e.target.value) || 0) } : x)))} />
          <button className="icon" title="Remove the condition" onClick={() => onChange(value.filter((_, k) => k !== i))}>
            ×
          </button>
        </span>
      ))}
      {value.length < 8 && (
        <button className="small" onClick={() => onChange([...value, { stat: 'unhappy', op: '>=', value: 1 }])}>
          + condition
        </button>
      )}
    </div>
  );
}

function TemplatesTab({ a }: { a: AutomationSettings }) {
  const snap = useGame((s) => s.snapshot)!;
  const templates = allTemplates(snap.state, snap.human);
  const [selected, setSelected] = useState(templates[0]?.id ?? 'core');
  const t = templates.find((x) => x.id === selected) ?? templates[0]!;
  const own = a.templates.some((x) => x.id === t.id);
  const save = (next: BuildTemplate) =>
    void editAutomation((x) => {
      x.templates = x.templates.some((y) => y.id === next.id) ? x.templates.map((y) => (y.id === next.id ? next : y)) : [...x.templates, next];
    });
  const copy = () => {
    const id = `own${a.nextId}`;
    void editAutomation((x) => {
      x.templates.push({ ...structuredClone(t), id, name: `${t.name} (yours)` });
      x.nextId++;
    }).then((ok) => ok && setSelected(id));
  };
  return (
    <div>
      <div className="field row">
        {(['founded', 'coastal', 'captured'] as const).map((k) => (
          <label key={k}>
            {k === 'founded' ? 'New inland cities' : k === 'coastal' ? 'New coastal cities' : 'Captured cities'}
            <select
              value={a.assign[k]}
              onChange={(e) =>
                void editAutomation((x) => {
                  x.assign[k] = e.target.value;
                })
              }
            >
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="templates">
        <ul className="template-list">
          {templates.map((x) => (
            <li key={x.id}>
              <button className={x.id === t.id ? 'on' : ''} onClick={() => setSelected(x.id)}>
                <AutoIcon name="template" size={18} /> {x.name}
                {BUILT_IN_TEMPLATES.some((b) => b.id === x.id) && !a.templates.some((o) => o.id === x.id) ? '' : ' ✎'}
              </button>
            </li>
          ))}
        </ul>
        <div className="template-detail">
          <div className="row">
            {own ? (
              <input value={t.name} aria-label="Template name" onChange={(e) => e.target.value.trim() && save({ ...t, name: e.target.value.slice(0, 60) })} />
            ) : (
              <strong>{t.name}</strong>
            )}
            <span className="spacer" />
            <button onClick={copy}>Copy to edit</button>
            {own && (
              <button
                onClick={() =>
                  void editAutomation((x) => {
                    x.templates = x.templates.filter((y) => y.id !== t.id);
                  })
                }
              >
                Delete
              </button>
            )}
          </div>
          <ol className="entries">
            {t.entries.map((e, i) => (
              <li key={i}>
                {own ? (
                  <>
                    <BuildPicker value={e.build} onChange={(b) => save({ ...t, entries: t.entries.map((x, k) => (k === i ? { ...x, build: b } : x)) })} />
                    <span className="muted">if</span>
                    <ConditionsEditor value={e.when} onChange={(w) => save({ ...t, entries: t.entries.map((x, k) => (k === i ? { ...x, when: w } : x)) })} />
                    <button className="icon" title="Move up" disabled={i === 0} onClick={() => save({ ...t, entries: t.entries.map((x, k) => (k === i - 1 ? t.entries[i]! : k === i ? t.entries[i - 1]! : x)) })}>
                      ↑
                    </button>
                    <button className="icon" title="Remove" onClick={() => save({ ...t, entries: t.entries.filter((_, k) => k !== i) })}>
                      ×
                    </button>
                  </>
                ) : (
                  <span>
                    {describeBuild(rules, e.build)}
                    {e.when.length > 0 && <span className="muted"> if {e.when.map((c) => describeCondition(rules, c)).join(' and ')}</span>}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {own && t.entries.length < 24 && <button onClick={() => save({ ...t, entries: [...t.entries, { build: { kind: 'building', id: 'library' }, when: [] }] })}>+ entry</button>}
          <p className="hint">Cities build the first entry that applies and is not built yet. A city with no defender always gets one first, and the empire&apos;s settlers and workers come before the template (except in military templates). When nothing applies, the usual priorities take over.</p>
        </div>
      </div>
    </div>
  );
}

const TASK_LABEL: Record<WorkerTask, string> = {
  pollution: 'Clean pollution',
  connectResources: 'Connect resources',
  connectCities: 'Connect cities',
  irrigate: 'Irrigate',
  mine: 'Mine',
  railroads: 'Railroads',
  roads: 'Roads for trade',
  clear: 'Clear forest and wetland for food',
};

const FORBIDDABLE = ['clearForest', 'clearWetlands', 'plantForest', 'mine', 'irrigation', 'road', 'railroad'];

function WorkersTab({ a }: { a: AutomationSettings }) {
  const snap = useGame((s) => s.snapshot)!;
  const setTilePick = useGame((s) => s.setTilePick);
  const open = useGame((s) => s.open);
  const [board, setBoard] = useState<JobBoard | null>(null);
  useEffect(() => {
    let live = true;
    void host()
      .jobBoard()
      .then((b) => live && setBoard(b));
    return () => {
      live = false;
    };
  }, [snap]);
  const move = (i: number, d: number) =>
    void editAutomation((x) => {
      const t = [...x.workerTasks];
      const j = i + d;
      if (j < 0 || j >= t.length) return;
      [t[i], t[j]] = [t[j]!, t[i]!];
      x.workerTasks = t;
    });
  const unitName = (id: number) => {
    const u = snap.state.units[id];
    return u ? `${rules.unit(u.type).name} ${id}` : `#${id}`;
  };
  return (
    <div className="workers-tab">
      <section>
        <span className="field-label">Priorities</span>
        <ol className="tasks">
          {a.workerTasks.map((t, i) => (
            <li key={t}>
              {TASK_LABEL[t]}
              <button className="icon" title="Higher" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button className="icon" title="Lower" disabled={i === a.workerTasks.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
            </li>
          ))}
        </ol>
        <span className="field-label">Regions</span>
        {a.regions.length === 0 && <div className="hint">No regions. A region keeps automated workers from chosen jobs, such as never cutting a forest near a city.</div>}
        {a.regions.map((r) => (
          <div key={r.id} className="region">
            <input
              value={r.name}
              aria-label="Region name"
              onChange={(e) =>
                e.target.value.trim() &&
                void editAutomation((x) => {
                  x.regions = x.regions.map((y) => (y.id === r.id ? { ...y, name: e.target.value.slice(0, 60) } : y));
                })
              }
            />
            <label>
              radius
              <input
                type="number"
                min={0}
                max={20}
                value={r.radius}
                onChange={(e) =>
                  void editAutomation((x) => {
                    x.regions = x.regions.map((y) => (y.id === r.id ? { ...y, radius: Math.max(0, Math.min(20, Math.round(Number(e.target.value) || 0))) } : y));
                  })
                }
              />
            </label>
            {FORBIDDABLE.map((j) => (
              <label key={j} className="check">
                <input
                  type="checkbox"
                  checked={r.forbid.includes(j)}
                  onChange={(e) =>
                    void editAutomation((x) => {
                      x.regions = x.regions.map((y) => (y.id === r.id ? { ...y, forbid: e.target.checked ? [...y.forbid, j] : y.forbid.filter((k) => k !== j) } : y));
                    })
                  }
                />
                no {rules.job(j).name.toLowerCase()}
              </label>
            ))}
            <button
              className="icon"
              title="Delete the region"
              onClick={() =>
                void editAutomation((x) => {
                  x.regions = x.regions.filter((y) => y.id !== r.id);
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            setTilePick({ purpose: 'region' });
            open(null);
          }}
        >
          + Region (click its centre on the map)
        </button>
      </section>
      <section>
        <span className="field-label">Job board</span>
        {!board ? (
          <div className="hint">Loading…</div>
        ) : (
          <>
            <div className="muted small">
              {board.assignments.length} at work or on the way · {board.idle.length} idle · {board.jobs.length} jobs open
            </div>
            <table className="city-table">
              <tbody>
                {board.assignments.slice(0, 40).map((x) => (
                  <tr key={x.unit}>
                    <td>{unitName(x.unit)}</td>
                    <td>{x.why}</td>
                    <td className="muted small">{x.travel > 0 ? `${x.travel} tiles away` : 'here'}</td>
                  </tr>
                ))}
                {board.retreat.map((x) => (
                  <tr key={`r${x.unit}`}>
                    <td>{unitName(x.unit)}</td>
                    <td className="warn">retreating from enemies</td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
            {board.assignments.length === 0 && <div className="hint">No worker is in the pool. Put workers on Auto (A) or delegate workers.</div>}
            <span className="field-label">Waiting jobs</span>
            <ul className="jobs">
              {board.jobs
                .filter((j) => !board.assignments.some((x) => x.tile === j.tile))
                .slice(0, 12)
                .map((j) => (
                  <li key={`${j.tile}:${j.job}`}>
                    {j.why} <span className="muted small">({TASK_LABEL[j.task]})</span>
                  </li>
                ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function PoliciesTab({ a }: { a: AutomationSettings }) {
  const p = a.policies;
  const num = (key: 'minIncome' | 'reserve' | 'hurryBudget', label: string, min: number) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        value={p[key]}
        onChange={(e) =>
          void editAutomation((x) => {
            x.policies[key] = Math.max(min, Math.round(Number(e.target.value) || 0));
          })
        }
      />
    </label>
  );
  const flag = (get: (x: AutomationSettings) => boolean, set: (x: AutomationSettings, v: boolean) => void, label: string) => (
    <label className="check">
      <input type="checkbox" checked={get(a)} onChange={(e) => void editAutomation((x) => set(x, e.target.checked))} /> {label}
    </label>
  );
  return (
    <div>
      <span className="field-label">Rates {a.delegate.rates ? '' : '(used once the treasury is delegated)'}</span>
      <div className="segmented">
        {(
          [
            ['maxScience', 'Most science', 'keeps the income below'],
            ['maxGold', 'Most gold', 'taxes at the limit'],
            ['celebrate', 'Celebrate', 'luxury for rapture'],
            ['manual', 'By hand', 'automation leaves rates alone'],
          ] as const
        ).map(([id, label, small]) => (
          <button
            key={id}
            className={p.rates === id ? 'on' : ''}
            onClick={() =>
              void editAutomation((x) => {
                x.policies.rates = id;
              })
            }
          >
            {label}
            <small>{small}</small>
          </button>
        ))}
      </div>
      <div className="field row">
        {num('minIncome', 'Keep gold per turn', -1000)}
        {num('reserve', 'Treasury reserve', 0)}
        {num('hurryBudget', 'Hurry budget per turn', 0)}
      </div>
      {flag((x) => x.policies.autoUpgrade, (x, v) => (x.policies.autoUpgrade = v), 'Upgrade units in cities when the treasury allows (with military delegated)')}
      {flag((x) => x.policies.tradeKeeper, (x, v) => (x.policies.tradeKeeper = v), 'Warn in the digest when a resource connection breaks')}
      <span className="field-label">Offers {a.delegate.diplomacy ? '' : '(used once offers are delegated)'}</span>
      {flag((x) => x.policies.deals.acceptGifts, (x, v) => (x.policies.deals.acceptGifts = v), 'Accept gifts that ask nothing back')}
      {flag((x) => x.policies.deals.declineDemands, (x, v) => (x.policies.deals.declineDemands = v), 'Decline demands that offer nothing')}
      {flag((x) => x.policies.deals.acceptPeace, (x, v) => (x.policies.deals.acceptPeace = v), 'Accept every peace or ceasefire offer')}
      <span className="field-label">Research goal</span>
      <div className="row">
        {a.researchGoal ? <strong>{rules.tech(a.researchGoal).name}</strong> : <span className="muted">None: pick a locked advance in the science advisor (F6) to head for it.</span>}
        {a.researchGoal && (
          <button
            onClick={() =>
              void editAutomation((x) => {
                x.researchGoal = null;
              })
            }
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

const TRIGGER_LABEL: Record<Trigger, string> = {
  turnStart: 'Every turn, in each city',
  cityGrew: 'A city grows',
  cityBuilt: 'A city finishes a build',
  cityDisorder: 'A city falls into disorder',
  cityFounded: 'A city is founded',
  cityCaptured: 'A city is captured',
  unitBuilt: 'A unit is built',
};

const ROUTINE_LABEL: Record<UnitRoutine, string> = { explore: 'explore', autoWorker: 'join the worker pool', autoSettle: 'settle', garrison: 'garrison a city', bombard: 'bombard enemies in range', fortify: 'fortify', sentry: 'sentry' };

function describeAction(act: RuleAction): string {
  switch (act.kind) {
    case 'build':
      return `build ${describeBuild(rules, act.build)}`;
    case 'hurry':
      return 'hurry the build';
    case 'governor':
      return `governor ${GOVERNORS[act.preset].name}`;
    case 'template':
      return `template ${act.template}`;
    case 'routine':
      return `the unit should ${ROUTINE_LABEL[act.routine]}`;
    case 'notify':
      return `tell me: “${act.text}”`;
  }
}

function blankRule(id: number): RoutineRule {
  return { id, name: 'New rule', enabled: true, trigger: 'cityGrew', when: [{ stat: 'size', op: '>=', value: 12 }, { stat: 'has', op: '=', value: 0, building: 'hospital' }], action: { kind: 'build', build: { kind: 'building', id: 'hospital' } } };
}

function RulesTab({ a }: { a: AutomationSettings }) {
  const snap = useGame((s) => s.snapshot)!;
  const showToast = useGame((s) => s.showToast);
  const [draft, setDraft] = useState<RoutineRule | null>(null);
  const [text, setText] = useState('');
  const templates = allTemplates(snap.state, snap.human);
  const saveDraft = () => {
    if (!draft) return;
    void editAutomation((x) => {
      if (x.rules.some((r) => r.id === draft.id)) x.rules = x.rules.map((r) => (r.id === draft.id ? draft : r));
      else {
        x.rules.push(draft);
        x.nextId = Math.max(x.nextId, draft.id + 1);
      }
    }).then((ok) => ok && setDraft(null));
  };
  const setAction = (kind: RuleAction['kind']) => {
    if (!draft) return;
    const act: RuleAction =
      kind === 'build'
        ? { kind, build: { kind: 'role', role: 'defender' } }
        : kind === 'governor'
          ? { kind, preset: 'growth' }
          : kind === 'template'
            ? { kind, template: templates[0]!.id }
            : kind === 'routine'
              ? { kind, routine: 'explore' }
              : kind === 'notify'
                ? { kind, text: 'Have a look' }
                : { kind: 'hurry' };
    setDraft({ ...draft, action: act });
  };
  return (
    <div className="rules-tab">
      <p className="hint">When something happens in a city and every condition holds, your rule acts. Rules run after governors and templates, so they win.</p>
      <ul className="rules">
        {a.rules.map((r) => (
          <li key={r.id}>
            <input
              type="checkbox"
              checked={r.enabled}
              aria-label={`Enable ${r.name}`}
              onChange={(e) =>
                void editAutomation((x) => {
                  x.rules = x.rules.map((y) => (y.id === r.id ? { ...y, enabled: e.target.checked } : y));
                })
              }
            />
            <AutoIcon name="rule" size={18} />
            <span>
              <strong>{r.name}</strong>
              <small className="muted">
                {TRIGGER_LABEL[r.trigger]}
                {r.when.length > 0 ? `, if ${r.when.map((c) => describeCondition(rules, c)).join(' and ')}` : ''} → {describeAction(r.action)}
              </small>
            </span>
            <button onClick={() => setDraft(structuredClone(r))}>Edit</button>
            <button
              className="icon"
              title="Delete the rule"
              onClick={() =>
                void editAutomation((x) => {
                  x.rules = x.rules.filter((y) => y.id !== r.id);
                })
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {!draft && <button onClick={() => setDraft(blankRule(a.nextId))}>+ New rule</button>}
      {draft && (
        <div className="rule-editor panel">
          <label>
            Name <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 60) })} />
          </label>
          <label>
            When
            <select value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value as Trigger })}>
              {TRIGGERS.map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <div>
            If <ConditionsEditor value={draft.when} onChange={(w) => setDraft({ ...draft, when: w })} />
          </div>
          <label>
            Then
            <select value={draft.action.kind} onChange={(e) => setAction(e.target.value as RuleAction['kind'])}>
              <option value="build">build</option>
              <option value="hurry">hurry the build</option>
              <option value="governor">set the governor</option>
              <option value="template">set the template</option>
              <option value="routine">give the new unit a routine</option>
              <option value="notify">tell me</option>
            </select>
            {draft.action.kind === 'build' && <BuildPicker value={draft.action.build} onChange={(b) => setDraft({ ...draft, action: { kind: 'build', build: b } })} />}
            {draft.action.kind === 'governor' && (
              <select value={draft.action.preset} onChange={(e) => setDraft({ ...draft, action: { kind: 'governor', preset: e.target.value as GovernorPreset } })}>
                {GOVERNOR_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {GOVERNORS[p].name}
                  </option>
                ))}
              </select>
            )}
            {draft.action.kind === 'template' && (
              <select value={draft.action.template} onChange={(e) => setDraft({ ...draft, action: { kind: 'template', template: e.target.value } })}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            {draft.action.kind === 'routine' && (
              <select value={draft.action.routine} onChange={(e) => setDraft({ ...draft, action: { kind: 'routine', routine: e.target.value as UnitRoutine } })}>
                {UNIT_ROUTINES.map((r) => (
                  <option key={r} value={r}>
                    {ROUTINE_LABEL[r]}
                  </option>
                ))}
              </select>
            )}
            {draft.action.kind === 'notify' && <input value={draft.action.text} onChange={(e) => setDraft({ ...draft, action: { kind: 'notify', text: e.target.value.slice(0, 200) } })} />}
          </label>
          <div className="dialog-actions">
            <button onClick={() => setDraft(null)}>Cancel</button>
            <button className="primary" onClick={saveDraft}>
              Save rule
            </button>
          </div>
        </div>
      )}
      <span className="field-label">Share</span>
      <div className="row">
        <button onClick={() => setText(exportRoutines(a))}>Export rules and templates</button>
        <button
          onClick={() => {
            const next = importRoutines(a, text);
            if ('error' in next) showToast(next.error);
            else void editAutomation((x) => Object.assign(x, next), 'Rules and templates imported.');
          }}
          disabled={!text.trim()}
        >
          Import the text below
        </button>
        <button
          disabled={!text.trim()}
          onClick={() => {
            const blob = new Blob([text], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'civolution-routines.json';
            link.click();
            URL.revokeObjectURL(link.href);
          }}
        >
          Download
        </button>
      </div>
      <textarea className="routines-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Exported rules appear here; paste a shared file here to import it." aria-label="Rules file" />
    </div>
  );
}
