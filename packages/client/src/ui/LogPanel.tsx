import { useState } from 'react';
import { useGame } from '../store.ts';

export function LogPanel({ onJump }: { onJump: (tile: number) => void }) {
  const log = useGame((s) => s.log);
  const [open, setOpen] = useState(true);
  const recent = log.slice(-8).reverse();
  return (
    <div className={`log-panel panel ${open ? '' : 'closed'}`}>
      <button className="log-toggle" onClick={() => setOpen(!open)}>
        {open ? 'Hide log' : 'Show log'}
      </button>
      {open && (
        <ul>
          {recent.length === 0 && <li className="muted">Your units await orders. Right-click a tile to move, or press X to explore.</li>}
          {recent.map((e, i) => (
            <li key={`${e.turn}-${i}-${e.text}`} title={e.reason ?? ''}>
              {e.tile !== undefined ? (
                <button className="link" onClick={() => onJump(e.tile!)}>
                  {e.text}
                </button>
              ) : (
                e.text
              )}
              {e.reason && <small>{e.reason}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
