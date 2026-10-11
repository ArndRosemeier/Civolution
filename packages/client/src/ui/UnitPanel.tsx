import { checkJob, type Unit } from '@civolution/engine';
import type { Snapshot } from '../host/client.ts';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';
import { formatMoves } from './describe.ts';

export interface UnitAction {
  id: string;
  label: string;
  key: string;
  shift?: boolean;
  /** Why the action is unavailable, or undefined if it can be done. */
  disabled?: string;
  /** Extra detail, e.g. how many turns a job takes. */
  detail?: string;
  /** Select the next unit afterwards. */
  advances?: boolean;
  run: () => Promise<unknown>;
}

const JOB_KEYS: Record<string, { key: string; shift?: boolean }> = {
  road: { key: 'KeyR' },
  railroad: { key: 'KeyR', shift: true },
  irrigation: { key: 'KeyI' },
  mine: { key: 'KeyM' },
  clearForest: { key: 'KeyC', shift: true },
  clearWetlands: { key: 'KeyC', shift: true },
  plantForest: { key: 'KeyN' },
  fortress: { key: 'KeyF', shift: true },
  barricade: { key: 'KeyF', shift: true },
  clearDamage: { key: 'KeyK', shift: true },
};

const KEY_LABEL = (key: string, shift?: boolean) => `${shift ? 'Shift+' : ''}${key.replace(/^Key/, '')}`;

export function unitActions(snap: Snapshot, u: Unit): UnitAction[] {
  const send = useGame.getState().send;
  const rule = rules.unit(u.type);
  const out: UnitAction[] = [];
  const noMoves = u.movesLeft <= 0 ? 'No movement left this turn.' : undefined;
  if (rule.domain === 'land') {
    out.push({ id: 'fortify', label: 'Fortify', key: 'KeyF', run: () => send({ type: 'fortify', unit: u.id }), advances: true, ...(u.fortified ? { disabled: 'Already fortified.' } : {}) });
  }
  out.push({ id: 'sentry', label: 'Sentry', key: 'KeyS', run: () => send({ type: 'sentry', unit: u.id }), advances: true });
  out.push({ id: 'skip', label: 'Skip turn', key: 'Space', run: () => send({ type: 'skip', unit: u.id }), advances: true, ...(noMoves ? { disabled: noMoves } : {}) });
  out.push({ id: 'goto', label: 'Go to…', key: 'KeyG', run: () => {
      useGame.getState().setGotoMode(true);
      return Promise.resolve();
    }, ...(noMoves ? { disabled: noMoves } : {}) });
  if (rule.jobs.length > 0) {
    const shown = new Set<string>();
    for (const job of rule.jobs) {
      const keys = JOB_KEYS[job];
      if (!keys) continue;
      const check = checkJob(rules, snap.state, u, job);
      // Hide jobs that make no sense on this terrain; show the rest with their reason.
      if (!check.ok && /cannot|Not possible|water/.test(check.reason)) continue;
      if (shown.has(`${keys.key}${keys.shift ? 's' : ''}`) && !check.ok) continue;
      shown.add(`${keys.key}${keys.shift ? 's' : ''}`);
      out.push({
        id: job,
        label: rules.job(job).name,
        ...keys,
        ...(check.ok ? { detail: `${check.turns} turn${check.turns === 1 ? '' : 's'}` } : { disabled: check.reason }),
        advances: true,
        run: () => send({ type: 'work', unit: u.id, job }),
      });
    }
    out.push({
      id: 'autoWorker',
      label: u.routine === 'autoWorker' ? 'Stop automation' : 'Automate',
      key: 'KeyA',
      advances: u.routine !== 'autoWorker',
      run: () => send({ type: 'setRoutine', unit: u.id, routine: u.routine === 'autoWorker' ? null : 'autoWorker' }),
    });
  } else {
    out.push({
      id: 'explore',
      label: u.routine === 'explore' ? 'Stop exploring' : 'Explore',
      key: 'KeyX',
      advances: u.routine !== 'explore',
      run: () => send({ type: 'setRoutine', unit: u.id, routine: u.routine === 'explore' ? null : 'explore' }),
    });
  }
  if (u.order || u.routine) out.push({ id: 'wake', label: 'Wake', key: 'KeyZ', run: () => send({ type: 'setRoutine', unit: u.id, routine: null }).then(() => send({ type: 'wake', unit: u.id })) });
  out.push({ id: 'disband', label: 'Disband', key: 'KeyD', shift: true, run: () => (confirm(`Disband this ${rule.name}?`) ? send({ type: 'disband', unit: u.id }) : Promise.resolve(false)) });
  return out;
}

function orderText(u: Unit): string {
  if (u.routine === 'explore') return 'Exploring';
  if (u.routine === 'autoWorker') return u.order?.type === 'work' ? `Automated: ${rules.job(u.order.job).name}` : 'Automated';
  switch (u.order?.type) {
    case 'fortify':
      return 'Fortified';
    case 'sentry':
      return 'Sentry';
    case 'goto':
      return 'Travelling';
    case 'work':
      return rules.job(u.order.job).name;
    default:
      return u.movesLeft > 0 ? 'Awaiting orders' : 'Done for this turn';
  }
}

export function UnitPanel() {
  const snap = useGame((s) => s.snapshot);
  const selected = useGame((s) => s.selected);
  const busy = useGame((s) => s.busy);
  const showToast = useGame((s) => s.showToast);
  const u = snap && selected !== null ? snap.state.units[selected] : undefined;
  if (!snap || !u) {
    return busy ? <div className="unit-panel panel muted">Other civilizations are moving…</div> : null;
  }
  const rule = rules.unit(u.type);
  const mine = u.owner === snap.human;
  const owner = snap.state.players[u.owner]!;
  const actions = mine ? unitActions(snap, u) : [];
  return (
    <div className="unit-panel panel">
      <div className="unit-head">
        <span className="swatch" style={{ background: owner.color }} />
        <div>
          <h3>{rule.name}</h3>
          <span className="muted">
            {owner.name} · {u.experience[0]!.toUpperCase() + u.experience.slice(1)}
          </span>
        </div>
        <div className="stats" title="Attack / Defence / Movement">
          <span>{rule.attack}</span>
          <span>{rule.defence}</span>
          <span>{rule.movement}</span>
        </div>
      </div>
      <div className="unit-status">
        <span>
          Moves {formatMoves(u.movesLeft)} / {rule.movement}
        </span>
        <span className="order">{orderText(u)}</span>
      </div>
      {mine && (
        <div className="actions">
          {actions.map((a) => (
            <button
              key={a.id}
              className={a.disabled ? 'disabled' : ''}
              title={a.disabled ?? a.detail ?? ''}
              onClick={() => {
                if (a.disabled) showToast(a.disabled);
                else void a.run().then(() => a.advances && useGame.getState().selectNext());
              }}
            >
              {a.label}
              {a.detail && <small>{a.detail}</small>}
              <kbd>{KEY_LABEL(a.key, a.shift)}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
