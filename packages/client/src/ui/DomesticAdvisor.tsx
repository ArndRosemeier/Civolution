/**
 * Domestic advisor as a dashboard (PLAN.md §10.2): every city in a sortable table you
 * can act from, the tax / science / luxury rates, the treasury, and the government.
 */
import { useState } from 'react';
import { buildCost, buildName, knowsTech, type Rates } from '@civolution/engine';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';
import { Dialog } from './Dialog.tsx';
import { empireSummary, signed } from './empire.ts';
import { Explain } from './Explain.tsx';

type SortKey = 'name' | 'size' | 'food' | 'shields' | 'commerce' | 'corruption' | 'mood' | 'build';

export function DomesticAdvisor({ onClose }: { onClose: () => void }) {
  const snap = useGame((s) => s.snapshot)!;
  const send = useGame((s) => s.send);
  const open = useGame((s) => s.open);
  const [sort, setSort] = useState<SortKey>('name');
  const { state, human } = snap;
  const p = state.players[human]!;
  const gov = rules.government(p.government);
  const sum = empireSummary(snap);
  const cap = Math.floor(gov.rateCap / 10);

  const rows = [...sum.cities].sort((a, b) => {
    const ra = a.report;
    const rb = b.report;
    switch (sort) {
      case 'size':
        return b.city.size - a.city.size;
      case 'food':
        return rb.foodSurplus - ra.foodSurplus;
      case 'shields':
        return rb.shields.value - ra.shields.value;
      case 'commerce':
        return rb.commerceBase.value - ra.commerceBase.value;
      case 'corruption':
        return rb.corruptionRate.value - ra.corruptionRate.value;
      case 'mood':
        return rb.unhappy - rb.happy - (ra.unhappy - ra.happy);
      case 'build':
        return (a.city.build ? buildName(rules, a.city.build) : '').localeCompare(b.city.build ? buildName(rules, b.city.build) : '');
      default:
        return a.city.name.localeCompare(b.city.name);
    }
  });

  const setRate = (key: keyof Rates, value: number) => {
    const r = { ...p.rates };
    const v = Math.max(0, Math.min(cap, value));
    const delta = v - r[key];
    if (delta === 0) return;
    r[key] = v;
    // Take from or give to the other rates, tax first, so they keep adding up to 100 %.
    const others = (['tax', 'science', 'luxury'] as const).filter((k) => k !== key);
    let left = -delta;
    for (const k of others) {
      const next = Math.max(0, Math.min(cap, r[k] + left));
      left -= next - r[k];
      r[k] = next;
    }
    if (left !== 0) return;
    void send({ type: 'setRates', rates: r });
  };

  const governments = rules.set.governments.filter((g) => !g.transitional);
  const th = (key: SortKey, label: string, num = false) => (
    <th className={`${sort === key ? 'sorted' : ''} ${num ? 'num' : ''}`} onClick={() => setSort(key)}>
      {label}
    </th>
  );

  return (
    <Dialog title="Domestic advisor" onClose={onClose} wide>
      <div className="advisor">
        <div className="advisor-top">
          <section className="card">
            <h3>Treasury</h3>
            <div className="big gold">{p.gold}</div>
            <table className="mini">
              <tbody>
                <tr>
                  <td>Taxes</td>
                  <td className="num">{signed(sum.tax)}</td>
                </tr>
                <tr>
                  <td>Building upkeep</td>
                  <td className="num">−{sum.upkeep}</td>
                </tr>
                <tr>
                  <td>Unit support</td>
                  <td className="num">−{sum.unitSupport}</td>
                </tr>
                <tr className="total">
                  <td>Per turn</td>
                  <td className={`num ${sum.net < 0 ? 'warn' : 'ok'}`}>{signed(sum.net)}</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section className="card">
            <h3>Rates {gov.transitional && <span className="muted small">fixed during {gov.name}</span>}</h3>
            {(['tax', 'science', 'luxury'] as const).map((k) => (
              <div className="rate" key={k}>
                <span className={`rate-label ${k}`}>{k === 'tax' ? 'Tax' : k === 'science' ? 'Science' : 'Luxury'}</span>
                <button disabled={gov.transitional} onClick={() => setRate(k, p.rates[k] - 1)}>
                  −
                </button>
                <span className="rate-bar">
                  <i className={k} style={{ width: `${p.rates[k] * 10}%` }} />
                </span>
                <button disabled={gov.transitional} onClick={() => setRate(k, p.rates[k] + 1)}>
                  +
                </button>
                <strong>{p.rates[k] * 10}%</strong>
                <span className="muted">{k === 'tax' ? sum.tax : k === 'science' ? sum.science : sum.luxury}</span>
              </div>
            ))}
            <div className="muted small">At most {gov.rateCap}% for any one rate.</div>
          </section>
          <section className="card">
            <h3>Government</h3>
            <div className="big">{gov.name}</div>
            {p.revolution && (
              <div className="warn small">
                Anarchy until turn {p.revolution.endsOnTurn}, then {rules.government(p.revolution.target).name}.
              </div>
            )}
            <div className="gov-list">
              {governments.map((g) => {
                const known = !g.requiredTech || knowsTech(p, g.requiredTech);
                const current = g.id === p.government || g.id === p.revolution?.target;
                return (
                  <button
                    key={g.id}
                    className={`${current ? 'on' : ''} ${known ? '' : 'disabled'}`}
                    title={known ? govTip(g.id) : `Requires ${rules.tech(g.requiredTech!).name}`}
                    onClick={() => known && !current && confirm(`Start a revolution to ${g.name}? Expect a few turns of anarchy.`) && void send({ type: 'revolution', government: g.id })}
                  >
                    <img src={`${import.meta.env.BASE_URL}art/governments/${g.id}.png`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    {g.name}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
        <table className="city-table">
          <thead>
            <tr>
              {th('name', 'City')}
              {th('size', 'Size', true)}
              {th('food', 'Food', true)}
              {th('shields', 'Shields', true)}
              {th('commerce', 'Commerce', true)}
              {th('corruption', 'Corruption', true)}
              {th('mood', 'Mood')}
              {th('build', 'Building')}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ city, report }) => {
              const cost = city.build ? buildCost(rules, city.build, state, city.owner) : 0;
              const turns = city.build && report.shields.value > 0 ? Math.ceil(Math.max(0, cost - city.shields) / report.shields.value) : null;
              return (
                <tr key={city.id} onClick={() => open({ kind: 'city', id: city.id })} className={report.disorder ? 'disorder' : ''}>
                  <td>
                    {city.name}
                    {'palace' in city.buildings ? ' ★' : ''}
                  </td>
                  <td className="num">{city.size}</td>
                  <td className="num">
                    <Explain title="Food" value={report.food}>
                      <span className={report.foodSurplus < 0 ? 'warn' : ''}>{signed(report.foodSurplus)}</span>
                    </Explain>
                  </td>
                  <td className="num">
                    <Explain title="Shields" value={report.shields}>
                      {report.shields.value}
                    </Explain>
                  </td>
                  <td className="num">
                    <Explain title="Commerce" value={report.commerceBase}>
                      {report.commerceBase.value}
                    </Explain>
                  </td>
                  <td className="num">
                    <Explain title="Corruption rate" value={report.corruptionRate} unit=" %">
                      {report.corruptionRate.value}%
                    </Explain>
                  </td>
                  <td>
                    <span className="mood-counts">
                      <b className="happy">{report.happy}</b> <b className="content">{report.content}</b> <b className="unhappy">{report.unhappy}</b>
                    </span>
                    {report.disorder && <span className="badge warn">riot</span>}
                    {report.celebrating && <span className="badge ok">party</span>}
                  </td>
                  <td>
                    {city.build ? buildName(rules, city.build) : <span className="warn">nothing</span>}
                    {turns !== null && <span className="muted"> · {turns}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted">No cities yet. Select a Settler and press B to found one.</p>}
      </div>
    </Dialog>
  );
}

function govTip(id: string): string {
  const g = rules.government(id);
  const bits = [
    `Corruption: ${g.corruption}`,
    g.tilePenalty ? 'tiles above 2 yield one less' : null,
    g.commerceBonus ? '+1 commerce on trade tiles' : null,
    `hurry: ${g.hurry === 'gold' ? 'pay gold' : g.hurry === 'forcedLabor' ? 'forced labour' : 'no'}`,
    `free units ${g.freeUnits.town}/${g.freeUnits.city}/${g.freeUnits.metropolis}, then ${g.unitCost} gold each`,
    g.militaryPoliceLimit ? `up to ${g.militaryPoliceLimit} military police` : 'no military police',
    g.warWeariness !== 'none' ? `${g.warWeariness} war weariness` : null,
  ].filter(Boolean);
  return `${g.name}\n${bits.join('\n')}`;
}
