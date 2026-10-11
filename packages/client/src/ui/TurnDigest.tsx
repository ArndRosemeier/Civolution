/**
 * The turn digest (PLAN.md §8.7): at the start of a turn, a short list, most urgent
 * first, of what needs the player and what automation already handled, each with its
 * reason and a click that jumps there.
 */
import { inputSeconds, type DigestItem } from '@civolution/automation';
import { useGame } from '../store.ts';
import { AutoIcon } from './AutoIcon.tsx';

export function TurnDigest({ onJump }: { onJump: (tile: number) => void }) {
  const digest = useGame((s) => s.digest);
  const open = useGame((s) => s.digestOpen);
  const snap = useGame((s) => s.snapshot)!;
  const setOpen = useGame((s) => s.setDigestOpen);
  if (!open || digest.length === 0) return null;
  const needs = digest.filter((d) => d.needsInput);
  const go = (d: DigestItem) => {
    const st = useGame.getState();
    if (d.kind === 'research') st.open({ kind: 'science' });
    else if (d.kind === 'offer') st.open({ kind: 'diplomacy' });
    else if (d.unit !== undefined && snap.state.units[d.unit]) {
      st.select(d.unit);
      onJump(snap.state.units[d.unit]!.tile);
    } else if (d.city !== undefined && snap.state.cities[d.city] && (d.kind === 'disorder' || d.kind === 'idleCity' || d.kind === 'starving')) st.open({ kind: 'city', id: d.city });
    else if (d.tile !== undefined) onJump(d.tile);
    else if (d.city !== undefined && snap.state.cities[d.city]) onJump(snap.state.cities[d.city]!.tile);
  };
  const jumpable = (d: DigestItem) => d.kind === 'research' || d.kind === 'offer' || d.unit !== undefined || d.city !== undefined || d.tile !== undefined;
  return (
    <div className="turn-digest panel" role="region" aria-label="Turn digest">
      <header>
        <AutoIcon name="digest" size={26} />
        <div>
          <h3>Turn {snap.state.turn}</h3>
          <span className="muted small">
            {needs.length === 0 ? 'Nothing needs you: automation handled the rest.' : `${needs.length} thing${needs.length === 1 ? '' : 's'} need${needs.length === 1 ? 's' : ''} you · about ${inputSeconds(digest)} s`}
          </span>
        </div>
        <button className="icon" aria-label="Close the digest" onClick={() => setOpen(false)}>
          ×
        </button>
      </header>
      <ul>
        {digest.map((d, i) => (
          <li key={i} className={`digest-item p${d.priority} ${d.needsInput ? 'needs' : ''}`}>
            <AutoIcon name={d.kind} />
            <div className="digest-text">
              {jumpable(d) ? (
                <button className="link" onClick={() => go(d)}>
                  {d.text}
                </button>
              ) : (
                <span>{d.text}</span>
              )}
              {d.why && <span className="muted small">{d.why}</span>}
            </div>
            {d.needsInput && <span className="badge warn">You</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
