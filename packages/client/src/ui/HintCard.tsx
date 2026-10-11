/**
 * An advisor's tutorial hint over the map: the first unseen hint that applies, once.
 * "Got it" hides it for good, "Read more" opens its Civilopedia page, and hints can be
 * switched off here or in the settings.
 */
import { useEffect, useMemo, useState } from 'react';
import { play } from '../audio.ts';
import { useGame } from '../store.ts';
import { ADVISOR_NAMES, HINTS_CHANGED, nextHint, readSeenHints, writeSeenHints } from './hints.ts';

export function HintCard() {
  const snap = useGame((s) => s.snapshot);
  const enabled = useGame((s) => s.settings.hints);
  const busy = useGame((s) => s.panel !== null || s.pedia !== null || s.busy);
  const setSettings = useGame((s) => s.setSettings);
  const openPedia = useGame((s) => s.openPedia);
  const [seen, setSeen] = useState(readSeenHints);
  const hint = useMemo(() => (snap && enabled ? nextHint(snap, seen) : null), [snap, enabled, seen]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const reread = () => setSeen(readSeenHints());
    window.addEventListener(HINTS_CHANGED, reread);
    return () => window.removeEventListener(HINTS_CHANGED, reread);
  }, []);

  useEffect(() => {
    setFailed(false);
    if (hint && !busy) play('hint');
    // The chime is for a new hint only.
  }, [hint?.id]);

  if (!hint || busy) return null;
  const done = () => {
    const next = new Set(seen).add(hint.id);
    writeSeenHints(next);
  };
  return (
    <aside className="hint-card panel" role="status" aria-live="polite" aria-label={`${ADVISOR_NAMES[hint.advisor]}: ${hint.title}`}>
      {!failed && <img className="hint-portrait" src={`${import.meta.env.BASE_URL}art/advisors/${hint.advisor}.jpg`} alt="" onError={() => setFailed(true)} />}
      <div className="hint-body">
        <div className="muted small">{ADVISOR_NAMES[hint.advisor]}</div>
        <h3>{hint.title}</h3>
        <p>{hint.text}</p>
        <div className="hint-actions">
          <button className="primary" onClick={done}>
            Got it
          </button>
          {hint.pedia !== undefined && (
            <button
              onClick={() => {
                done();
                openPedia(hint.pedia!);
              }}
            >
              Read more
            </button>
          )}
          <button className="link" onClick={() => setSettings({ hints: false })} title="Switch tutorial hints off (they can be switched on again in Settings)">
            No more hints
          </button>
        </div>
      </div>
    </aside>
  );
}
