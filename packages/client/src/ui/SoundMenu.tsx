import { useEffect, useRef, useState } from 'react';
import { getVolumes, onVolumes, setVolumes, type Volumes } from '../audio.ts';

/** Top-bar button with volume sliders for effects, music and ambience, and a mute switch (Ctrl+M). */
export function SoundMenu() {
  const [v, setV] = useState<Volumes>(getVolumes());
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => onVolumes(setV), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'KeyM') {
        e.preventDefault();
        setVolumes({ muted: !getVolumes().muted });
      }
    };
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', away);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', away);
    };
  }, []);
  const slider = (k: 'effects' | 'music' | 'ambience', label: string) => (
    <label className="sound-row">
      <span>{label}</span>
      <input type="range" min={0} max={100} value={Math.round(v[k] * 100)} onChange={(e) => setVolumes({ [k]: Number(e.target.value) / 100 })} />
      <small>{Math.round(v[k] * 100)}</small>
    </label>
  );
  return (
    <div className="sound-menu" ref={box}>
      <button className={v.muted ? '' : 'on'} onClick={() => setOpen(!open)} title="Sound: effects, music and ambience (Ctrl+M mutes)">
        {v.muted ? 'Muted' : 'Sound'}
      </button>
      {open && (
        <div className="sound-pop panel">
          {slider('effects', 'Effects')}
          {slider('music', 'Music')}
          {slider('ambience', 'Ambience')}
          <label className="sound-row">
            <input type="checkbox" checked={v.muted} onChange={(e) => setVolumes({ muted: e.target.checked })} />
            <span>Mute everything</span>
          </label>
        </div>
      )}
    </div>
  );
}
