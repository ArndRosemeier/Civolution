/**
 * "What's new" on the title screen: the version history from src/changelog.json, newest first.
 */
import { RELEASES } from '../version.ts';
import { Dialog } from './Dialog.tsx';

export function WhatsNew({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="What’s new" onClose={onClose} wide>
      <div className="whats-new">
        {RELEASES.map((r, i) => (
          <section key={r.version} className={i === 0 ? 'latest' : ''}>
            <header>
              <span className="version">Alpha {r.version}</span>
              <span className="muted">{r.date}</span>
              {i === 0 && <span className="badge peace">Current</span>}
            </header>
            <h3>{r.title}</h3>
            <ul>
              {r.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
