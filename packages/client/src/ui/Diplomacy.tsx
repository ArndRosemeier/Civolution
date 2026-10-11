/**
 * The diplomacy screen (PLAN.md §10.2): every civilization met with its leader, their
 * mood and its reasons, treaties and running agreements, a trade table for offers, and
 * espionage. Offers go to the AI, which answers at once; "What would you want?" asks it
 * to name its price.
 */
import { useMemo, useState } from 'react';
import {
  attitude,
  canReceiveTech,
  dealBlocker,
  dealItemLabel,
  hasTechFlag,
  isExplored,
  missionBlocker,
  missionChance,
  missionCost,
  peaceBinding,
  playerCities,
  relation,
  resourceSurplus,
  treatiesBetween,
  score,
  militaryPower,
  type Deal,
  type DealItem,
  type GameState,
} from '@civolution/engine';
import { host } from '../host/client.ts';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';
import { Dialog } from './Dialog.tsx';
import { treatyName } from './describe.ts';
import { LeaderPortrait, civTitle, leaderName } from './leaders.tsx';

const RELATION_LABEL = { war: 'At war', ceasefire: 'Ceasefire', peace: 'At peace', unknown: 'Not met' } as const;

/** What `giver` could put on the table for `receiver`, each item possible on its own. */
function offerable(state: GameState, giver: number, receiver: number): DealItem[] {
  const g = state.players[giver]!;
  const r = state.players[receiver]!;
  const out: DealItem[] = [];
  const rel = relation(state, giver, receiver);
  if (rel === 'war') out.push({ kind: 'peace' }, { kind: 'ceasefire' });
  if (rel === 'ceasefire') out.push({ kind: 'peace' });
  for (const t of g.techs) if (canReceiveTech(rules, r, t)) out.push({ kind: 'tech', tech: t });
  if (hasTechFlag(rules, g, 'enablesMapTrading')) out.push({ kind: 'worldMap' });
  for (const o of g.contacts) if (o !== receiver && !r.contacts.includes(o) && state.players[o]?.alive) out.push({ kind: 'contact', player: o });
  if (!r.embassies.includes(giver)) out.push({ kind: 'embassy' });
  for (const res of rules.resources) if (res.kind !== 'bonus' && resourceSurplus(rules, state, giver, res.id) > 0) out.push({ kind: 'resource', resource: res.id });
  for (const c of playerCities(state, giver)) if (!('palace' in c.buildings)) out.push({ kind: 'city', city: c.id });
  if (rel !== 'war') {
    out.push({ kind: 'rightOfPassage' }, { kind: 'mutualProtection' });
    for (const x of g.contacts) {
      if (x === receiver || !state.players[x]?.alive) continue;
      out.push({ kind: 'alliance', against: x }, { kind: 'embargo', against: x });
    }
  }
  return out.filter((item) => dealBlocker(rules, state, { from: giver, to: receiver, give: [item], take: rel === 'war' && item.kind !== 'peace' && item.kind !== 'ceasefire' ? [{ kind: 'peace' }] : [] }) === null);
}

const same = (a: DealItem, b: DealItem) => JSON.stringify(a) === JSON.stringify(b);

function ItemPicker({ state, giver, receiver, chosen, onAdd }: { state: GameState; giver: number; receiver: number; chosen: DealItem[]; onAdd: (i: DealItem) => void }) {
  const options = useMemo(() => offerable(state, giver, receiver), [state, giver, receiver]);
  const [gold, setGold] = useState(0);
  const [gpt, setGpt] = useState(0);
  const max = state.players[giver]!.gold;
  const free = options.filter((o) => !chosen.some((c) => same(c, o)));
  return (
    <div className="item-picker">
      <select
        value=""
        onChange={(e) => {
          const i = free[Number(e.target.value)];
          if (i) onAdd(i);
        }}
        aria-label="Add an item"
      >
        <option value="">Add…</option>
        {free.map((o, i) => (
          <option key={JSON.stringify(o)} value={i}>
            {dealItemLabel(rules, state, o)}
          </option>
        ))}
      </select>
      <span className="gold-input">
        <input type="number" min={0} max={max} step={10} value={gold} onChange={(e) => setGold(Math.max(0, Math.min(max, Number(e.target.value))))} aria-label="Gold" />
        <button disabled={gold <= 0} onClick={() => onAdd({ kind: 'gold', amount: gold })}>
          + gold
        </button>
      </span>
      <span className="gold-input">
        <input type="number" min={0} max={200} value={gpt} onChange={(e) => setGpt(Math.max(0, Math.min(200, Number(e.target.value))))} aria-label="Gold per turn" />
        <button disabled={gpt <= 0} onClick={() => onAdd({ kind: 'goldPerTurn', amount: gpt })}>
          + per turn
        </button>
      </span>
    </div>
  );
}

function ItemList({ state, items, onRemove }: { state: GameState; items: DealItem[]; onRemove?: (i: number) => void }) {
  if (items.length === 0) return <p className="muted small">Nothing</p>;
  return (
    <ul className="deal-items">
      {items.map((it, i) => (
        <li key={JSON.stringify(it)} className={`deal-item kind-${it.kind}`}>
          <img src={`${import.meta.env.BASE_URL}art/diplomacy/${it.kind}.png`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <span>{dealItemLabel(rules, state, it)}</span>
          {onRemove && (
            <button className="icon" aria-label="Remove" onClick={() => onRemove(i)}>
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Espionage({ state, human, other }: { state: GameState; human: number; other: number }) {
  const send = useGame((s) => s.send);
  const theirCities = playerCities(state, other).filter((c) => isExplored(state.players[human]!, c.tile));
  const [city, setCity] = useState<number | undefined>(theirCities[0]?.id);
  return (
    <section className="espionage">
      <h3>Espionage</h3>
      <table className="city-table">
        <thead>
          <tr>
            <th>Mission</th>
            <th>Cost</th>
            <th>Chance</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rules.set.espionageMissions.map((m) => {
            const needsCity = ['investigateCity', 'propaganda', 'sabotageProduction'].includes(m.id);
            const target = needsCity ? city : undefined;
            const why = missionBlocker(rules, state, human, other, m.id, target);
            return (
              <tr key={m.id} className={why ? 'muted' : ''}>
                <td>
                  <img className="thumb" src={`${import.meta.env.BASE_URL}art/diplomacy/${m.id}.png`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} /> {m.name}
                  <div className="small muted">{m.needs === 'embassy' ? 'needs Writing' : m.needs === 'spy' ? 'needs a planted spy' : 'embassy or spy'}</div>
                </td>
                <td>{missionCost(rules, state, human, m.id)}</td>
                <td>{missionChance(rules, state, human, other, m.id)}%</td>
                <td>
                  <button disabled={!!why} title={why ?? ''} onClick={() => void send({ type: 'espionage', target: other, mission: m.id, ...(target === undefined ? {} : { city: target }) })}>
                    {needsCity ? 'Send' : 'Go'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {theirCities.length > 0 && (
        <label className="small">
          Target city:{' '}
          <select value={city ?? ''} onChange={(e) => setCity(Number(e.target.value))}>
            {theirCities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (size {c.size})
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

export function DiplomacyScreen({ initial, onClose }: { initial?: number; onClose: () => void }) {
  const snap = useGame((s) => s.snapshot)!;
  const send = useGame((s) => s.send);
  const { state, human } = snap;
  const me = state.players[human]!;
  const met = me.contacts.filter((o) => state.players[o]).sort((a, b) => Number(state.players[b]!.alive) - Number(state.players[a]!.alive) || a - b);
  const [sel, setSel] = useState<number | null>(initial !== undefined && met.includes(initial) ? initial : (met[0] ?? null));
  const [give, setGive] = useState<DealItem[]>([]);
  const [take, setTake] = useState<DealItem[]>([]);
  const [reply, setReply] = useState<string | null>(null);
  const [tab, setTab] = useState<'talk' | 'spies'>('talk');

  if (sel === null) {
    return (
      <Dialog title="Diplomacy" onClose={onClose} wide>
        <p className="muted">You have not met another civilization yet. Explore: contact comes when your units or borders meet theirs.</p>
      </Dialog>
    );
  }
  const other = state.players[sel]!;
  const leader = leaderName(other);
  const mood = attitude(rules, state, sel, human);
  const rel = relation(state, human, sel);
  const treaties = treatiesBetween(state, human, sel);
  const ongoing = state.diplomacy.ongoing.filter((o) => (o.from === human && o.to === sel) || (o.from === sel && o.to === human));
  const embassy = me.embassies.includes(sel);
  const deal: Deal = { from: human, to: sel, give, take };
  const blocker = give.length + take.length === 0 ? 'Put something on the table.' : dealBlocker(rules, state, deal);
  const pick = (id: number) => {
    setSel(id);
    setGive([]);
    setTake([]);
    setReply(null);
  };

  const propose = async () => {
    const ok = await send({ type: 'proposeDeal', target: sel, give, take });
    if (!ok) return;
    const events = useGame.getState().lastEvents;
    const made = events.some((e) => e.type === 'dealMade' && e.player === human && e.target === sel);
    setReply(made ? `${leader}: “We have an agreement.”` : `${leader}: “We cannot accept this.”`);
    if (made) {
      setGive([]);
      setTake([]);
    }
  };
  const appraise = async () => {
    const r = await host().appraise(deal);
    if (r.accepts) setReply(`${leader}: “That would be acceptable.”`);
    else if (r.counter) {
      setGive(r.counter.give);
      setTake(r.counter.take);
      setReply(`${leader}: “For that, this is what we would want.”`);
    } else setReply(`${leader}: “Nothing you have would make this worth our while.”`);
  };
  const declare = () => {
    const bound = peaceBinding(state, human, sel);
    const kinds = treaties.map((t) => treatyName(t.kind));
    const warn = bound || treaties.some((t) => t.kind !== 'peace' && t.kind !== 'embargo') ? `\n\nThis breaks our ${kinds.join(', ')} and costs reputation with every civilization.` : '';
    if (confirm(`Declare war on ${civTitle(other)}?${warn}`)) void send({ type: 'declareWar', target: sel });
  };

  return (
    <Dialog title="Diplomacy" onClose={onClose} wide>
      <div className="diplomacy">
        <aside className="civ-list">
          {met.map((id) => {
            const p = state.players[id]!;
            const a = attitude(rules, state, id, human);
            return (
              <button key={id} className={`civ-row ${id === sel ? 'on' : ''} ${p.alive ? '' : 'muted'}`} onClick={() => pick(id)}>
                <LeaderPortrait player={p} size={44} />
                <span className="civ-row-text">
                  <strong>{p.name}</strong>
                  <small>
                    {p.alive ? `${RELATION_LABEL[relation(state, human, id)]} · ${a.level}` : 'Destroyed'}
                  </small>
                </span>
              </button>
            );
          })}
        </aside>
        <div className="diplo-main">
          <header className="leader-head">
            <LeaderPortrait player={other} size={132} mood={mood.level} />
            <div>
              <h3 className="leader-title">{leader}</h3>
              <p className="muted">{civTitle(other)}</p>
              <p>
                <span className={`badge rel-${rel}`}>{RELATION_LABEL[rel]}</span>{' '}
                <span className={`badge mood mood-${mood.level}`} title={mood.reasons.map((r) => `${r.label}: ${r.amount > 0 ? '+' : ''}${r.amount}`).join('\n')}>
                  {mood.level} ({mood.value > 0 ? '+' : ''}
                  {mood.value})
                </span>
              </p>
              <p className="small muted">
                Reputation {other.reputation} · yours {me.reputation} · score {score(rules, state, sel)} vs {score(rules, state, human)} · military{' '}
                {militaryPower(rules, state, sel) > militaryPower(rules, state, human) * 1.2 ? 'stronger than ours' : militaryPower(rules, state, sel) * 1.2 < militaryPower(rules, state, human) ? 'weaker than ours' : 'about even'}
              </p>
              {embassy && (
                <p className="small">
                  Embassy: {other.gold} gold · {rules.government(other.government).name} · {playerCities(state, sel).length} cities · {other.techs.length} advances · researching {other.research.tech ? rules.tech(other.research.tech).name : 'nothing'}
                </p>
              )}
            </div>
            <div className="mood-reasons small">
              {mood.reasons.map((r) => (
                <div key={r.label} className={r.amount > 0 ? 'good' : 'bad'}>
                  {r.amount > 0 ? '+' : ''}
                  {r.amount} {r.label}
                </div>
              ))}
            </div>
          </header>
          <div className="segmented tabs">
            <button className={tab === 'talk' ? 'on' : ''} onClick={() => setTab('talk')}>
              Negotiate
            </button>
            <button className={tab === 'spies' ? 'on' : ''} onClick={() => setTab('spies')}>
              Espionage
            </button>
          </div>
          {tab === 'talk' && other.alive && (
            <>
              <section className="treaties">
                <h3>Agreements</h3>
                {treaties.length + ongoing.length === 0 && <p className="muted small">No treaties or running agreements.</p>}
                <ul className="small">
                  {treaties.map((t) => (
                    <li key={t.id}>
                      {treatyName(t.kind)}
                      {t.against !== undefined ? ` against ${state.players[t.against]?.name}` : ''}
                      {t.kind === 'ceasefire' && t.until !== null ? ` until turn ${t.until}` : ''}
                      {t.kind === 'peace' && t.until !== null && t.until > state.turn ? ` (binding until turn ${t.until})` : ''}
                    </li>
                  ))}
                  {ongoing.map((o) => (
                    <li key={o.id}>
                      {o.from === human ? 'We give' : 'They give'} {o.item.kind === 'goldPerTurn' ? `${o.item.amount} gold per turn` : rules.resources[rules.resourceIndex(o.item.resource)]!.name} until turn {o.until}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="trade-table">
                <div>
                  <h3>We offer</h3>
                  <ItemList state={state} items={give} onRemove={(i) => setGive(give.filter((_, k) => k !== i))} />
                  <ItemPicker state={state} giver={human} receiver={sel} chosen={give} onAdd={(i) => setGive([...give.filter((x) => !(x.kind === i.kind && (i.kind === 'gold' || i.kind === 'goldPerTurn'))), i])} />
                </div>
                <div>
                  <h3>We ask for</h3>
                  <ItemList state={state} items={take} onRemove={(i) => setTake(take.filter((_, k) => k !== i))} />
                  <ItemPicker state={state} giver={sel} receiver={human} chosen={take} onAdd={(i) => setTake([...take.filter((x) => !(x.kind === i.kind && (i.kind === 'gold' || i.kind === 'goldPerTurn'))), i])} />
                </div>
              </section>
              {reply && <p className="leader-reply">{reply}</p>}
              <div className="dialog-actions">
                {rel !== 'war' && (
                  <button className="danger" onClick={declare}>
                    Declare war
                  </button>
                )}
                <span className="spacer" />
                <button onClick={() => void appraise()} disabled={give.length + take.length === 0}>
                  What would you want?
                </button>
                <button className="primary" disabled={!!blocker} title={blocker ?? ''} onClick={() => void propose()}>
                  Propose
                </button>
              </div>
            </>
          )}
          {tab === 'spies' && other.alive && <Espionage state={state} human={human} other={sel} />}
        </div>
      </div>
    </Dialog>
  );
}

/** An offer from an AI leader waiting for the player's answer. */
export function OfferDialog() {
  const snap = useGame((s) => s.snapshot);
  const send = useGame((s) => s.send);
  const busy = useGame((s) => s.busy);
  if (!snap || busy) return null;
  const { state, human } = snap;
  const offer = state.diplomacy.proposals.find((p) => p.to === human);
  if (!offer) return null;
  const from = state.players[offer.from]!;
  const answer = (accept: boolean) => void send({ type: 'answerDeal', proposal: offer.id, accept });
  const peace = [...offer.give, ...offer.take].some((i) => i.kind === 'peace' || i.kind === 'ceasefire');
  return (
    <Dialog title={`${leaderName(from)} has an offer`} onClose={() => answer(false)}>
      <div className="offer">
        <LeaderPortrait player={from} size={110} mood={attitude(rules, state, offer.from, human).level} />
        <div>
          <p>{peace ? `“Let us put an end to this war.”` : `“Perhaps we can come to an arrangement.”`}</p>
          <h3>They give</h3>
          <ItemList state={state} items={offer.give} />
          <h3>They ask for</h3>
          <ItemList state={state} items={offer.take} />
        </div>
      </div>
      <div className="dialog-actions">
        <button onClick={() => answer(false)}>Decline</button>
        <button className="primary" onClick={() => answer(true)}>
          Accept
        </button>
      </div>
    </Dialog>
  );
}
