/**
 * Sound effects for game events (PLAN.md §10.4). Clips are generated into public/audio
 * with an index of variations (packages/assets, `sounds`); a random variation plays per
 * event. Without the files the game stays silent.
 */
import type { GameEvent } from '@civolution/engine';

let index: Record<string, string[]> | null = null;
let loading: Promise<void> | null = null;
let volume = 0.6;

function load(): Promise<void> {
  loading ??= fetch(`${import.meta.env.BASE_URL}audio/index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string[]>>) : {}))
    .then((j) => {
      index = j;
    })
    .catch(() => {
      index = {};
    });
  return loading;
}

export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
}

export function play(id: string): void {
  void load().then(() => {
    const files = index?.[id];
    if (!files || files.length === 0 || volume === 0) return;
    // Variation choice is presentation only; it never touches game state.
    const file = files[Math.floor(Math.random() * files.length)]!;
    const a = new Audio(`${import.meta.env.BASE_URL}audio/${file}`);
    a.volume = volume;
    void a.play().catch(() => undefined);
  });
}

const EVENT_SOUNDS: Partial<Record<GameEvent['type'], string>> = {
  cityFounded: 'city-founded',
  cityGrew: 'city-grew',
  cityStarved: 'city-starved',
  wonderBuilt: 'wonder-complete',
  techDiscovered: 'tech-discovered',
  eraEntered: 'era-entered',
  cityDisorder: 'disorder',
  cityOrderRestored: 'order-restored',
  anarchyStarted: 'revolution',
  governmentChanged: 'government-changed',
  bordersGrew: 'borders-grew',
  cityHurried: 'hurry',
};

/** Plays the most important sound among a batch of the human player's events. */
export function playEvents(events: readonly GameEvent[], human: number): void {
  const mine = events.filter((e) => !('player' in e) || e.player === human);
  const priority = ['eraEntered', 'wonderBuilt', 'anarchyStarted', 'governmentChanged', 'techDiscovered', 'cityFounded', 'cityDisorder', 'cityBuilt', 'cityGrew', 'cityCelebrating', 'bordersGrew', 'cityOrderRestored', 'cityStarved', 'cityHurried'];
  for (const type of priority) {
    const e = mine.find((x) => x.type === type);
    if (!e) continue;
    if (e.type === 'cityBuilt') play(e.build.kind === 'unit' ? 'unit-trained' : 'building-complete');
    else if (e.type === 'cityCelebrating') {
      if (e.started) play('celebration');
    } else {
      const id = EVENT_SOUNDS[e.type];
      if (id) play(id);
    }
    return;
  }
}
