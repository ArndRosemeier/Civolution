import {
  armyCount,
  armyLimit,
  cargoOf,
  cargoSpace,
  cityAt,
  checkJob,
  currentHp,
  foundBlocker,
  isArmy,
  maxHp,
  nukesEnabled,
  upgradeQuote,
  IMP_FORTRESS,
  IMP_IRRIGATION,
  IMP_MINE,
  IMP_RAIL,
  IMP_ROAD,
  type Unit,
} from '@civolution/engine';
import type { Snapshot } from '../host/client.ts';
import { rules } from '../rules.ts';
import { useGame, type AimAction } from '../store.ts';
import { formatMoves } from './describe.ts';
import { play } from '../audio.ts';

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
  const fired = u.attacked && !rule.abilities.includes('blitz') ? 'Already fired this turn.' : undefined;
  const aim = (action: AimAction) => () => {
    useGame.getState().setAim({ unit: u.id, action });
    return Promise.resolve();
  };
  const here0 = cityAt(snap.state, u.tile);
  const air = rule.domain === 'air';
  if (air) {
    const missions: [string, string, string, boolean?][] = [
      ['bomb', 'Bomb…', 'KeyB'],
      ['precisionBomb', 'Precision strike…', 'KeyB', true],
      ['recon', 'Reconnaissance…', 'KeyR'],
      ['rebase', 'Rebase…', 'KeyT'],
    ];
    for (const [id, label, key, shift] of missions) {
      if (!rule.airMissions.includes(id)) continue;
      out.push({ id, label, key, ...(shift ? { shift } : {}), run: aim(id as AimAction), ...(noMoves ?? fired ? { disabled: noMoves ?? fired! } : {}), detail: id === 'rebase' || id === 'recon' ? `${rule.operationalRange * 2} tiles` : `${rule.operationalRange} tiles` });
    }
    if (rule.airMissions.includes('intercept'))
      out.push({ id: 'intercept', label: 'Intercept', key: 'KeyI', advances: true, run: () => send({ type: 'airMission', unit: u.id, mission: 'intercept' }), ...(noMoves ? { disabled: noMoves } : {}) });
  }
  if (rule.abilities.includes('nuclearWeapon')) {
    const why = !nukesEnabled(rules, snap.state) ? 'Nuclear weapons need the Manhattan Project to be built somewhere.' : noMoves;
    out.push({ id: 'nuke', label: 'Launch nuclear strike…', key: 'KeyN', run: aim('nuke'), ...(why ? { disabled: why } : {}), detail: rule.abilities.includes('icbm') ? 'any range' : `${Math.max(1, rule.bombardRange)} tiles` });
  } else if (!air && rule.specialActions.includes('bombard') && rule.bombardStrength > 0) {
    out.push({ id: 'bombard', label: 'Bombard…', key: 'KeyB', run: aim('bombard'), detail: `strength ${rule.bombardStrength}, range ${Math.max(1, rule.bombardRange)}`, ...(noMoves ?? fired ? { disabled: noMoves ?? fired! } : {}) });
  }
  if (rule.specialActions.includes('airdrop')) {
    const why = here0?.owner !== u.owner ? 'Paratroopers jump from one of your cities.' : u.acted ? 'Paratroopers jump before moving.' : undefined;
    out.push({ id: 'airdrop', label: 'Parachute drop…', key: 'KeyD', shift: true, run: aim('airdrop'), detail: `${Math.max(1, rule.operationalRange)} tiles`, ...(why ? { disabled: why } : {}) });
  }
  if (rule.specialActions.includes('airlift') && here0?.owner === u.owner) {
    const airport = [...(Object.keys(here0.buildings))].some((b) => rules.building(b).effects.includes('allowsAirTrade'));
    const why = !airport ? 'Needs an airport in this city.' : here0.airliftedOn === snap.state.turn ? 'This airport has flown a unit out this turn.' : u.acted ? 'The unit has already moved this turn.' : undefined;
    out.push({ id: 'airlift', label: 'Airlift…', key: 'KeyT', shift: true, run: aim('airlift'), ...(why ? { disabled: why } : {}) });
  }
  if (rule.specialActions.includes('pillage')) {
    const imp = snap.state.map.improvements[u.tile]!;
    const any = imp & (IMP_MINE | IMP_IRRIGATION | IMP_RAIL | IMP_FORTRESS) || (imp & IMP_ROAD && !here0);
    out.push({ id: 'pillage', label: 'Pillage', key: 'KeyP', shift: true, advances: true, run: () => send({ type: 'pillage', unit: u.id }), ...(!any ? { disabled: 'Nothing to pillage here.' } : noMoves ? { disabled: noMoves } : {}) });
  }
  if (here0?.owner === u.owner && rule.upgradeTo && !isArmy(rules, u)) {
    const q = upgradeQuote(rules, snap.state, u);
    const gold = snap.state.players[u.owner]!.gold;
    if ('to' in q)
      out.push({ id: 'upgrade', label: `Upgrade to ${rules.unit(q.to).name}`, key: 'KeyU', detail: `${q.gold} gold`, run: () => send({ type: 'upgrade', unit: u.id }), ...(gold < q.gold ? { disabled: `Needs ${q.gold} gold.` } : noMoves ? { disabled: noMoves } : {}) });
  }
  if (rule.domain === 'land' && u.carriedBy === null) {
    const ship = Object.values(snap.state.units).find((h) => h.tile === u.tile && h.owner === u.owner && h.id !== u.id && rules.unit(h.type).domain === 'sea' && rules.unit(h.type).capacity > 0);
    if (ship) out.push({ id: 'load', label: `Board ${rules.unit(ship.type).name}`, key: 'KeyL', advances: true, run: () => send({ type: 'load', unit: u.id }) });
    const army = Object.values(snap.state.units).find((h) => h.tile === u.tile && h.owner === u.owner && h.id !== u.id && isArmy(rules, h));
    if (army && !isArmy(rules, u) && rule.attack > 0 && !rule.abilities.includes('leader')) {
      const full = cargoOf(snap.state, army.id).length >= cargoSpace(rules, snap.state, army);
      out.push({ id: 'joinArmy', label: 'Join the army', key: 'KeyJ', shift: true, advances: true, run: () => send({ type: 'joinArmy', unit: u.id, army: army.id }), ...(full ? { disabled: 'The army is full.' } : {}) });
    }
  }
  if (rule.specialActions.includes('buildArmy') && !u.scientific) {
    const limit = armyLimit(rules, snap.state, u.owner);
    const why = here0?.owner !== u.owner ? 'Leaders form armies in your cities.' : armyCount(rules, snap.state, u.owner) >= limit ? `You may field ${limit} arm${limit === 1 ? 'y' : 'ies'}.` : undefined;
    out.push({ id: 'buildArmy', label: 'Form an army', key: 'KeyA', shift: true, advances: true, run: () => send({ type: 'buildArmy', unit: u.id }), ...(why ? { disabled: why } : {}) });
  }
  if (rule.specialActions.includes('finishImprovements')) {
    const why = here0?.owner !== u.owner ? 'Leaders hurry production in your cities.' : here0.build?.kind !== 'building' ? 'The city must be building an improvement or wonder.' : undefined;
    out.push({ id: 'leaderHurry', label: 'Hurry production', key: 'KeyH', advances: true, run: () => send({ type: 'leaderHurry', unit: u.id }), ...(why ? { disabled: why } : {}) });
  }
  if (rule.specialActions.includes('buildCity')) {
    const why = foundBlocker(rules, snap.state, u);
    out.push({ id: 'found', label: 'Found city', key: 'KeyB', advances: true, run: () => send({ type: 'foundCity', unit: u.id }), ...(why ? { disabled: why } : {}) });
  }
  const here = cityAt(snap.state, u.tile);
  if (rule.specialActions.includes('joinCity') && rule.populationCost > 0 && here?.owner === u.owner) {
    out.push({ id: 'join', label: `Join ${here.name}`, key: 'KeyJ', advances: true, run: () => send({ type: 'joinCity', unit: u.id }) });
  }
  if (rule.domain === 'land') {
    out.push({ id: 'fortify', label: 'Fortify', key: 'KeyF', run: () => send({ type: 'fortify', unit: u.id }), advances: true, ...(u.fortified ? { disabled: 'Already fortified.' } : {}) });
  }
  out.push({ id: 'sentry', label: 'Sentry', key: 'KeyS', run: () => send({ type: 'sentry', unit: u.id }), advances: true });
  out.push({ id: 'skip', label: 'Skip turn', key: 'Space', run: () => send({ type: 'skip', unit: u.id }), advances: true, ...(noMoves ? { disabled: noMoves } : {}) });
  if (!air && !rule.abilities.includes('immobile'))
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
  } else if (rule.specialActions.includes('buildCity')) {
    out.push({
      id: 'autoSettle',
      label: u.routine === 'autoSettle' ? 'Stop automation' : 'Automate',
      key: 'KeyA',
      detail: 'find a site',
      advances: u.routine !== 'autoSettle',
      run: () => send({ type: 'setRoutine', unit: u.id, routine: u.routine === 'autoSettle' ? null : 'autoSettle' }),
    });
  } else if (!air && !rule.abilities.includes('immobile')) {
    out.push({
      id: 'explore',
      label: u.routine === 'explore' ? 'Stop exploring' : 'Explore',
      key: 'KeyX',
      advances: u.routine !== 'explore',
      run: () => send({ type: 'setRoutine', unit: u.id, routine: u.routine === 'explore' ? null : 'explore' }),
    });
    if (rule.defence > 0 && rule.domain === 'land') {
      out.push({
        id: 'garrison',
        label: u.routine === 'garrison' ? 'Stop garrison duty' : 'Garrison',
        key: 'KeyY',
        detail: 'nearest city short of defenders',
        advances: u.routine !== 'garrison',
        run: () => {
          if (u.routine !== 'garrison') play('garrison');
          return send({ type: 'setRoutine', unit: u.id, routine: u.routine === 'garrison' ? null : 'garrison' });
        },
      });
      out.push({
        id: 'patrol',
        label: u.routine?.startsWith('patrol:') ? 'Stop patrolling' : 'Patrol',
        key: 'KeyV',
        detail: 'between here and a tile',
        run: () => {
          if (u.routine?.startsWith('patrol:')) return send({ type: 'setRoutine', unit: u.id, routine: null });
          useGame.getState().setTilePick({ purpose: 'patrol', unit: u.id });
          return Promise.resolve();
        },
      });
    }
    if (rule.specialActions.includes('bombard') && rule.bombardStrength > 0) {
      out.push({
        id: 'autoBombard',
        label: u.routine === 'bombard' ? 'Stop bombarding' : 'Bombard each turn',
        key: 'KeyB',
        shift: true,
        advances: u.routine !== 'bombard',
        run: () => send({ type: 'setRoutine', unit: u.id, routine: u.routine === 'bombard' ? null : 'bombard' }),
      });
    }
  }
  if (u.order || u.routine) out.push({ id: 'wake', label: 'Wake', key: 'KeyZ', run: () => send({ type: 'setRoutine', unit: u.id, routine: null }).then(() => send({ type: 'wake', unit: u.id })) });
  out.push({ id: 'disband', label: 'Disband', key: 'KeyD', shift: true, run: () => (confirm(`Disband this ${rule.name}?`) ? send({ type: 'disband', unit: u.id }) : Promise.resolve(false)) });
  return out;
}

function orderText(u: Unit): string {
  if (u.order?.type === 'intercept') return 'On interception duty';
  if (u.routine === 'explore') return 'Exploring';
  if (u.routine === 'autoWorker') return u.order?.type === 'work' ? `Automated: ${rules.job(u.order.job).name}` : 'Automated';
  if (u.routine === 'autoSettle') return 'Looking for a city site';
  if (u.routine === 'garrison') return u.fortified ? 'Garrison' : 'Garrison: on the way';
  if (u.routine === 'bombard') return 'Bombarding enemies in range';
  if (u.routine?.startsWith('patrol:')) return 'Patrolling';
  if (u.routine?.startsWith('rally:')) return 'To the rally point';
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
  const hp = currentHp(rules, snap.state, u);
  const hpMax = Math.max(1, maxHp(rules, snap.state, u));
  const members = isArmy(rules, u) ? cargoOf(snap.state, u.id) : [];
  const cargo = !isArmy(rules, u) ? cargoOf(snap.state, u.id) : [];
  const holder = u.carriedBy !== null ? snap.state.units[u.carriedBy] : undefined;
  return (
    <div className="unit-panel panel">
      <div className="unit-head">
        <span className="swatch" style={{ background: owner.color }} />
        <div>
          <h3>{u.name ? `${u.name} · ${u.scientific ? 'Great scientist' : rule.name}` : rule.name}</h3>
          <span className="muted">
            {owner.name} ·{' '}
            <img className="rank" src={`${import.meta.env.BASE_URL}art/experience/${u.experience}.png`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
            {u.experience[0]!.toUpperCase() + u.experience.slice(1)}
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
          Moves {formatMoves(u.movesLeft)} / {formatMoves(Math.max(rule.movement * rules.moveScale, u.movesLeft))}
        </span>
        <span className="order">{holder ? `Aboard the ${rules.unit(holder.type).name}` : orderText(u)}</span>
      </div>
      <div className="hp" title={`Hit points ${hp} of ${hpMax}`}>
        <span className="hp-bar">
          <i style={{ width: `${(hp * 100) / hpMax}%` }} className={hp * 3 <= hpMax ? 'low' : hp * 3 <= hpMax * 2 ? 'mid' : ''} />
        </span>
        <span className="muted">
          {hp}/{hpMax} hp
        </span>
      </div>
      {members.length > 0 && <div className="muted small">Army: {members.map((m) => `${rules.unit(m.type).name} (${m.hp})`).join(', ')}</div>}
      {isArmy(rules, u) && members.length === 0 && <div className="warn small">An empty army: move units here and join them to it.</div>}
      {cargo.length > 0 && <div className="muted small">Carrying {cargo.map((m) => rules.unit(m.type).name).join(', ')}</div>}
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
