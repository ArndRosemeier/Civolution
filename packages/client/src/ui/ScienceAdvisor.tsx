/**
 * Science advisor: the current advance, what can be researched now, and the whole tree
 * by era (PLAN.md §10.2). Every card says what it unlocks.
 */
import { useMemo, useState } from 'react';
import { requiredTechs, researchBlocker, techCost, unitAvailable, type GameState } from '@civolution/engine';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';
import { Dialog } from './Dialog.tsx';
import { PediaLink } from './Civilopedia.tsx';
import { editAutomation } from './automation.ts';
import { empireSummary } from './empire.ts';

type TechRule = (typeof rules.set.techs)[number];

/** What learning a tech makes available. */
function unlocks(state: GameState, player: number, tech: string): string[] {
  const out: string[] = [];
  for (const u of rules.set.units) if (u.requiredTech === tech && unitAvailable(rules, state, player, u.id)) out.push(u.name);
  for (const b of rules.set.buildings) if (b.requiredTech === tech) out.push(b.name);
  for (const g of rules.set.governments) if (g.requiredTech === tech) out.push(`${g.name} (government)`);
  for (const j of rules.set.workerJobs) if (j.requiredTech === tech) out.push(`${j.name} (workers)`);
  return out;
}

/** Column of each tech within its era: one more than its deepest prerequisite of the same era. */
function layout(): Map<string, number> {
  const depth = new Map<string, number>();
  const d = (t: TechRule): number => {
    const known = depth.get(t.id);
    if (known !== undefined) return known;
    const same = t.prerequisites.map((p) => rules.tech(p)).filter((p) => p.era === t.era);
    const v = same.length === 0 ? 0 : 1 + Math.max(...same.map(d));
    depth.set(t.id, v);
    return v;
  };
  for (const t of rules.set.techs) d(t);
  return depth;
}

export function ScienceAdvisor({ onClose }: { onClose: () => void }) {
  const snap = useGame((s) => s.snapshot)!;
  const send = useGame((s) => s.send);
  const { state, human } = snap;
  const p = state.players[human]!;
  const sum = empireSummary(snap);
  const depth = useMemo(layout, []);
  const [era, setEra] = useState(p.era);
  const eraId = rules.set.eras[era]!.id;
  const techs = rules.set.techs.filter((t) => t.era === eraId);
  const cols = Math.max(...techs.map((t) => depth.get(t.id) ?? 0)) + 1;
  const required = requiredTechs(rules, rules.set.eras[p.era]!.id);
  const missing = required.filter((t) => !p.techs.includes(t));
  const choose = (t: string) => void send({ type: 'setResearch', tech: t }).then((ok) => ok && onClose());
  const current = p.research.tech;
  const goal = p.automation.researchGoal;
  const setGoal = (t: string | null) =>
    void editAutomation((a) => {
      a.researchGoal = t;
    }, t ? `Research goal: ${rules.tech(t).name}. Automation picks the advances on the way.` : 'Research goal cleared.');

  return (
    <Dialog title="Science advisor" onClose={onClose} wide>
      <div className="advisor science">
        <div className="advisor-top">
          <section className="card">
            <h3>Researching</h3>
            {current ? (
              <>
                <div className="big">
                  {rules.tech(current).name}
                  <PediaLink to={`techs/${current}`} />
                </div>
                <span className="bar science">
                  <i style={{ width: `${Math.min(100, (p.research.beakers * 100) / Math.max(1, sum.researchCost ?? 1))}%` }} />
                </span>
                <div className="muted small">
                  {p.research.beakers} / {sum.researchCost} beakers · +{sum.science} a turn · {sum.researchTurns} turn{sum.researchTurns === 1 ? '' : 's'}
                </div>
              </>
            ) : (
              <div className="warn">Nothing. Pick an advance below.</div>
            )}
          </section>
          <section className="card">
            <h3>{rules.set.eras[p.era]!.name}</h3>
            <div className="muted small">
              {p.era < rules.set.eras.length - 1
                ? missing.length === 0
                  ? 'All required advances known.'
                  : `${missing.length} required advance${missing.length === 1 ? '' : 's'} left before the ${rules.set.eras[p.era + 1]!.name}: ${missing.map((t) => rules.tech(t).name).join(', ')}.`
                : 'The last era.'}
            </div>
            <div className="muted small">{p.techs.length} of {rules.set.techs.length} advances known.</div>
          </section>
          <section className="card">
            <h3>Goal</h3>
            {goal ? (
              <>
                <div className="big">{rules.tech(goal).name}</div>
                <button onClick={() => setGoal(null)}>Clear goal</button>
              </>
            ) : (
              <div className="muted small">Click an advance you cannot research yet to head for it: automation picks the steps on the way.</div>
            )}
          </section>
        </div>
        <div className="segmented era-tabs">
          {rules.set.eras.map((e, i) => (
            <button key={e.id} className={i === era ? 'on' : ''} onClick={() => setEra(i)}>
              {e.name}
            </button>
          ))}
        </div>
        <div className="tech-tree" style={{ gridTemplateColumns: `repeat(${cols}, minmax(150px, 1fr))` }}>
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className="tech-col">
              {techs
                .filter((t) => (depth.get(t.id) ?? 0) === c)
                .map((t) => {
                  const known = p.techs.includes(t.id);
                  const blocker = researchBlocker(rules, p, t.id);
                  const state_ = known ? 'known' : t.id === current ? 'current' : blocker === null ? 'open' : t.id === goal ? 'goal' : 'locked';
                  const what = unlocks(state, human, t.id);
                  const cost = techCost(rules, state, t.id, human);
                  const tip = [
                    t.name,
                    t.prerequisites.length ? `Needs ${t.prerequisites.map((x) => rules.tech(x).name).join(', ')}` : null,
                    what.length ? `Unlocks ${what.join(', ')}` : null,
                    t.flags.includes('notRequiredForEraAdvance') ? 'Optional for the next era' : null,
                    blocker && !known ? blocker : null,
                  ]
                    .filter(Boolean)
                    .join('\n');
                  return (
                    <button key={t.id} className={`tech ${state_}`} title={`${state_ === 'locked' ? `${tip}\nClick to make it your research goal` : tip}\nRight-click: Civilopedia`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        useGame.getState().openPedia(`techs/${t.id}`);
                      }} onClick={() => (state_ === 'open' ? choose(t.id) : state_ === 'locked' ? setGoal(t.id) : undefined)}>
                      <img src={`${import.meta.env.BASE_URL}art/techs/${t.id}.png`} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                      <span className="tech-name">{t.name}</span>
                      <span className="tech-cost">{known ? 'known' : `${cost}`}</span>
                      {what.length > 0 && <span className="tech-unlocks">{what.slice(0, 3).join(' · ')}</span>}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
