/**
 * Settings: interface size, theme, motion, colours for colour-blind players, tutorial
 * hints and map display. Kept in the browser like the sound volumes.
 */
import { useGame } from '../store.ts';
import { Dialog } from './Dialog.tsx';
import { writeSeenHints } from './hints.ts';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useGame((s) => s.settings);
  const set = useGame((s) => s.setSettings);
  const toast = useGame((s) => s.showToast);
  const check = (key: 'colourBlind' | 'reduceMotion' | 'hints' | 'shadows' | 'grid', label: string, detail: string) => (
    <label className="setting-row">
      <input type="checkbox" checked={settings[key]} onChange={(e) => set({ [key]: e.target.checked })} />
      <span>
        {label}
        <small className="muted">{detail}</small>
      </span>
    </label>
  );
  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="settings">
        <section>
          <h3>Display</h3>
          <label className="setting-row">
            <span>
              Interface size
              <small className="muted">Panels, text and buttons; the map is not affected.</small>
            </span>
            <input
              type="range"
              min={80}
              max={150}
              step={10}
              value={Math.round(settings.uiScale * 100)}
              aria-valuetext={`${Math.round(settings.uiScale * 100)} percent`}
              onChange={(e) => set({ uiScale: Number(e.target.value) / 100 })}
            />
            <small>{Math.round(settings.uiScale * 100)}%</small>
          </label>
          <div className="setting-row" role="radiogroup" aria-label="Theme">
            <span>
              Theme
              <small className="muted">Colours of panels and dialogs.</small>
            </span>
            <div className="segmented">
              {(['dark', 'light'] as const).map((t) => (
                <button key={t} role="radio" aria-checked={settings.theme === t} className={settings.theme === t ? 'on' : ''} onClick={() => set({ theme: t })}>
                  {t === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>
          </div>
          {check('colourBlind', 'Colour-blind civilization colours', 'Colours that stay apart without telling red from green.')}
          {check('reduceMotion', 'Reduce motion', 'The camera jumps instead of gliding; no fades or pulsing.')}
          {check('shadows', 'Shadows', 'Turn off for speed on slower computers.')}
          {check('grid', 'Tile grid', 'Ctrl+G')}
        </section>
        <section>
          <h3>Help</h3>
          {check('hints', 'Advisor hints', 'Short tips when something comes up for the first time.')}
          <button
            onClick={() => {
              writeSeenHints(new Set());
              set({ hints: true });
              toast('The advisors will repeat their hints.');
            }}
          >
            Show all hints again
          </button>
        </section>
      </div>
    </Dialog>
  );
}
