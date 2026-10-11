import { useState } from 'react';
import { defaultOptions, makeRng, PLAYER_COLORS, VICTORY_NAMES, type GameMode, type GameOptions } from '@civolution/engine';
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

const MODES: Choice<GameMode> = [
  { value: 'standard', label: 'Standard' },
  { value: 'regicide', label: 'Regicide' },
  { value: 'massRegicide', label: 'Mass regicide' },
  { value: 'elimination', label: 'Elimination' },
  { value: 'victoryPoints', label: 'Victory points' },
];

const MODE_TEXT: Record<GameMode, string> = {
  standard: 'Win by any of the victories you allow below, or by score when time runs out.',
  regicide: 'Every leader takes the field as a unit. A civilization whose leader dies is out, and its cities surrender to the killer.',
  massRegicide: 'Every civilization starts with two leader units; it is out once both have died.',
  elimination: 'A civilization is out the moment it loses any city.',
  victoryPoints: 'Wonders, victories, first discoveries and conquests earn points; the most points when time runs out wins.',
};

/** What each civilization trait does (docs/rules/civilizations.md). */
export const TRAIT_TEXT: Record<string, string> = {
  militaristic: 'Promoted twice as often; cheap barracks and military buildings.',
  religious: 'One turn of anarchy; cheap temples and cathedrals.',
  commercial: 'Extra commerce on rich tiles, less corruption; cheap markets and banks.',
  industrious: 'Workers 50 % faster, an extra shield in big cities; cheap construction.',
  expansionist: 'Starts with a scout and builds scouts; cheap exploration buildings.',
  scientific: 'A free advance with each new era, great scientists; cheap libraries.',
  agricultural: 'An extra food on every city tile; cheap aqueducts.',
  seafaring: 'Ships move one tile farther; cheap harbors.',
};

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

/** The chosen civilization's traits, unique unit and free advances. */
function CivDetail({ id }: { id: string }) {
  const c = rules.civ(id);
  return (
    <div className="civ-detail">
      <div>
        <strong>
          {c.leaderTitle} {c.leader} of {c.name}
        </strong>
        <div className="traits">
          {c.traits.map((t) => (
            <span key={t} className="trait" title={TRAIT_TEXT[t]}>
              <img src={`${import.meta.env.BASE_URL}art/traits/${t}.png`} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              {t[0]!.toUpperCase() + t.slice(1)}
            </span>
          ))}
        </div>
        <p className="muted">
          {c.traits.map((t) => TRAIT_TEXT[t]).join(' ')} Unique unit: {c.uniqueUnits.map((u) => rules.unit(u).name).join(', ') || 'none'}; its first victory starts a golden age. Starts with{' '}
          {c.freeTechs.map((t) => rules.tech(t).name).join(' and ')}.
        </p>
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
  const [mode, setMode] = useState<GameMode>('standard');
  const [victories, setVictories] = useState<GameOptions['victories']>(defaultOptions().victories);
  const [flips, setFlips] = useState(true);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [difficulty, setDifficulty] = useState(rules.set.general.defaultDifficulty);
  const civs = rules.set.civs;
  const [civ, setCiv] = useState<string>(() => civs[Math.floor(Math.random() * civs.length)]!.id);

  const start = async () => {
    // Rivals get distinct civilizations, drawn from the map seed.
    const rng = makeRng(seed ^ 0x63697673);
    const pool = civs.map((c) => c.id).filter((id) => id !== civ);
    const picks = [civ];
    for (let i = 0; i < rivals && pool.length > 0; i++) picks.push(pool.splice(rng.int(pool.length), 1)[0]!);
    const players = picks.map((id, i) => ({
      name: rules.civ(id).name,
      civ: id,
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
      difficulty,
      options: { mode, victories, cultureFlips: flips },
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
      <div className="field">
        <span className="field-label">Civilization</span>
        <div className="civ-picker" role="radiogroup" aria-label="Civilization">
          {civs.map((c) => (
            <button key={c.id} role="radio" aria-checked={civ === c.id} className={civ === c.id ? 'on' : ''} onClick={() => setCiv(c.id)} title={`${c.leaderTitle} ${c.leader} · ${c.traits.join(', ')}`}>
              <img src={`${import.meta.env.BASE_URL}art/leaders/${c.id}.jpg`} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              <span>{c.name}</span>
              <small>{c.leader}</small>
            </button>
          ))}
        </div>
      </div>
      <CivDetail id={civ} />
      <Segmented label="Difficulty" options={rules.set.difficulties.map((d) => ({ value: d.id, label: d.name }))} value={difficulty} onChange={setDifficulty} />
      <div className="field row">
        <label>
          <span className="field-label">Rivals</span>
          <input type="number" min={1} max={15} value={rivals} onChange={(e) => setRivals(Math.max(1, Math.min(15, Number(e.target.value))))} />
        </label>
        <label>
          <span className="field-label">Map seed</span>
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
      </div>
      <Segmented label="Game" options={MODES} value={mode} onChange={(m) => setMode(m === 'random' ? 'standard' : m)} />
      <p className="hint">{MODE_TEXT[mode]}</p>
      <div className="field">
        <span className="field-label">Victories</span>
        <div className="options-row">
          {(Object.keys(victories) as (keyof GameOptions['victories'])[]).map((k) => (
            <label key={k} className="check">
              <input type="checkbox" checked={victories[k]} onChange={(e) => setVictories({ ...victories, [k]: e.target.checked })} />
              {VICTORY_NAMES[k]}
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={flips} onChange={(e) => setFlips(e.target.checked)} />
            Culture flips
          </label>
        </div>
      </div>
      <p className="hint">Rivals are computer players with their own leaders' temper: they expand, trade, make alliances and go to war. You meet them as your explorers and borders reach theirs.</p>
      <div className="dialog-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy} onClick={() => void start()}>
          {busy ? 'Creating the world…' : 'Start'}
        </button>
      </div>
    </Dialog>
  );
}
