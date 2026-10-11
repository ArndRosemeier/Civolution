import { useState } from 'react';
import { PLAYER_COLORS } from '@civolution/engine';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';
import { Dialog } from './Dialog.tsx';

type Choice<T extends string | number> = { value: T | 'random'; label: string }[];

const LAND: Choice<string> = [
  { value: 'archipelago', label: 'Archipelago' },
  { value: 'continents', label: 'Continents' },
  { value: 'pangaea', label: 'Pangaea' },
  { value: 'random', label: 'Random' },
];
const WATER: Choice<number> = [
  { value: 60, label: '60%' },
  { value: 70, label: '70%' },
  { value: 80, label: '80%' },
  { value: 'random', label: 'Random' },
];
const CLIMATE: Choice<string> = [
  { value: 'arid', label: 'Arid' },
  { value: 'normal', label: 'Normal' },
  { value: 'wet', label: 'Wet' },
  { value: 'random', label: 'Random' },
];
const TEMP: Choice<string> = [
  { value: 'cool', label: 'Cool' },
  { value: 'temperate', label: 'Temperate' },
  { value: 'warm', label: 'Warm' },
  { value: 'random', label: 'Random' },
];
const AGE: Choice<number> = [
  { value: 3, label: '3 billion years' },
  { value: 4, label: '4 billion years' },
  { value: 5, label: '5 billion years' },
  { value: 'random', label: 'Random' },
];

function Segmented<T extends string | number>({ label, options, value, onChange }: { label: string; options: Choice<T>; value: T | 'random'; onChange: (v: T | 'random') => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.value)} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NewGameDialog({ onClose }: { onClose: () => void }) {
  const newGame = useGame((s) => s.newGame);
  const busy = useGame((s) => s.busy);
  const sizes = rules.set.worldSizes;
  const [size, setSize] = useState('standard');
  const [land, setLand] = useState<string>('continents');
  const [water, setWater] = useState<number | 'random'>(70);
  const [climate, setClimate] = useState<string>('normal');
  const [temp, setTemp] = useState<string>('temperate');
  const [age, setAge] = useState<number | 'random'>(4);
  const sizeRule = sizes.find((s) => s.id === size)!;
  const [rivals, setRivals] = useState(sizeRule.defaultCivs - 1);
  const [scout, setScout] = useState(true);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));

  const start = async () => {
    const players = Array.from({ length: rivals + 1 }, (_, i) => ({
      name: i === 0 ? 'Your people' : `Rival ${i}`,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
      human: i === 0,
    }));
    await newGame({
      seed,
      map: {
        worldSize: size,
        landForm: land as 'continents',
        waterPercent: water as 70,
        climate: climate as 'normal',
        temperature: temp as 'temperate',
        age: age as 4,
      },
      players,
      ...(scout ? { startUnits: [...rules.set.general.startUnits, rules.set.general.scoutUnit] } : {}),
    });
  };

  return (
    <Dialog title="New game" onClose={onClose} wide>
      <div className="field">
        <span className="field-label">World size</span>
        <div className="segmented">
          {sizes.map((s) => (
            <button
              key={s.id}
              className={size === s.id ? 'on' : ''}
              onClick={() => {
                setSize(s.id);
                setRivals(s.defaultCivs - 1);
              }}
            >
              {s.name}
              <small>{(s.width * s.height) / 2} tiles</small>
            </button>
          ))}
        </div>
      </div>
      <Segmented label="Land form" options={LAND} value={land} onChange={setLand} />
      <Segmented label="Water coverage" options={WATER} value={water} onChange={setWater} />
      <Segmented label="Climate" options={CLIMATE} value={climate} onChange={setClimate} />
      <Segmented label="Temperature" options={TEMP} value={temp} onChange={setTemp} />
      <Segmented label="Age" options={AGE} value={age} onChange={setAge} />
      <div className="field row">
        <label>
          <span className="field-label">Rivals</span>
          <input type="number" min={1} max={15} value={rivals} onChange={(e) => setRivals(Math.max(1, Math.min(15, Number(e.target.value))))} />
        </label>
        <label>
          <span className="field-label">Map seed</span>
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={scout} onChange={(e) => setScout(e.target.checked)} />
          Start with a scout
        </label>
      </div>
      <p className="hint">Cities, research and diplomacy arrive in later phases; this build covers the map, exploration, movement and workers.</p>
      <div className="dialog-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy} onClick={() => void start()}>
          {busy ? 'Creating the world…' : 'Start'}
        </button>
      </div>
    </Dialog>
  );
}
