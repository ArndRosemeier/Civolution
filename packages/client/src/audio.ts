/**
 * Sound playback (PLAN.md §10.4): effects for game events and UI actions, an era music
 * bed and a terrain ambience under the camera. Clips are generated into public/audio with
 * an index of variations (packages/assets, `sounds`); a random variation plays each time.
 * Which event makes which sound lives in sounds.ts. Without the files the game is silent.
 * Volumes are kept per browser; choosing variations never touches game state.
 */
import type { GameEvent } from '@civolution/engine';
import { MUSIC, TITLE_MUSIC, pickSound, type SoundContext } from './sounds.ts';
import { concernsHuman } from './ui/describe.ts';

let index: Record<string, string[]> | null = null;
let loading: Promise<void> | null = null;

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

export type Channel = 'effects' | 'music' | 'ambience';

export interface Volumes {
  effects: number;
  music: number;
  ambience: number;
  muted: boolean;
}

const DEFAULTS: Volumes = { effects: 0.6, music: 0.35, ambience: 0.3, muted: false };
const STORAGE = 'civolution.volumes';

let volumes: Volumes = readVolumes();
const listeners = new Set<(v: Volumes) => void>();

function readVolumes(): Volumes {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Volumes>) };
  } catch {
    // Storage can be missing or blocked; the defaults do.
  }
  return { ...DEFAULTS };
}

export function getVolumes(): Volumes {
  return volumes;
}

export function setVolumes(change: Partial<Volumes>): void {
  volumes = { ...volumes, ...change };
  for (const k of ['effects', 'music', 'ambience'] as const) volumes[k] = Math.max(0, Math.min(1, volumes[k]));
  try {
    localStorage.setItem(STORAGE, JSON.stringify(volumes));
  } catch {
    // Not saved; it still applies for this visit.
  }
  music.apply();
  ambience.apply();
  for (const f of listeners) f(volumes);
}

export function onVolumes(f: (v: Volumes) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

function level(channel: Channel): number {
  return volumes.muted ? 0 : volumes[channel];
}

function url(file: string): string {
  return `${import.meta.env.BASE_URL}audio/${file}`;
}

function variation(id: string): string | null {
  const files = index?.[id];
  if (!files || files.length === 0) return null;
  return files[Math.floor(Math.random() * files.length)]!;
}

let lastPlayed = 0;

/** Plays one effect. */
export function play(id: string): void {
  lastPlayed = performance.now();
  void load().then(() => {
    const file = variation(id);
    const v = level('effects');
    if (!file || v === 0) return;
    const a = new Audio(url(file));
    a.volume = v;
    void a.play().catch(() => undefined);
  });
}

/**
 * A looping bed (music or ambience): plays variations of the current id one after
 * another and crossfades when the id changes.
 */
class Bed {
  private current: HTMLAudioElement | null = null;
  private id: string | null = null;
  private fading = false;

  constructor(
    private readonly channel: Channel,
    private readonly fadeMs: number,
    /** Ambiences repeat one clip; music moves on to another variation. */
    private readonly loopOne: boolean,
  ) {}

  set(id: string | null): void {
    if (id === this.id) return;
    this.id = id;
    void load().then(() => {
      if (this.id === id) this.start();
    });
  }

  apply(): void {
    const v = level(this.channel);
    if (this.current && v === 0) {
      this.current.pause();
      this.current = null;
    } else if (this.current && !this.fading) this.current.volume = v;
    else if (!this.current && this.id && v > 0) this.start();
  }

  private start(): void {
    const old = this.current;
    this.current = null;
    if (old) this.fade(old, old.volume, 0, () => old.pause());
    const file = this.id ? variation(this.id) : null;
    if (!file || level(this.channel) === 0) return;
    const a = new Audio(url(file));
    a.loop = this.loopOne;
    a.volume = 0;
    a.addEventListener('ended', () => {
      if (this.current === a) {
        this.current = null;
        this.start();
      }
    });
    this.current = a;
    void a.play().then(
      () => this.fade(a, 0, level(this.channel)),
      () => {
        // Autoplay is blocked until the first click or key; try again then.
        if (this.current === a) this.current = null;
        waitForGesture();
      },
    );
  }

  private fade(a: HTMLAudioElement, from: number, to: number, done?: () => void): void {
    const t0 = performance.now();
    const mine = a === this.current;
    if (mine) this.fading = true;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / this.fadeMs);
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) requestAnimationFrame(step);
      else {
        if (mine && a === this.current) this.fading = false;
        done?.();
      }
    };
    requestAnimationFrame(step);
  }
}

const music = new Bed('music', 2500, false);
const ambience = new Bed('ambience', 1500, true);

let waiting = false;
function waitForGesture(): void {
  if (waiting || typeof window === 'undefined') return;
  waiting = true;
  const resume = () => {
    waiting = false;
    window.removeEventListener('pointerdown', resume);
    window.removeEventListener('keydown', resume);
    music.apply();
    ambience.apply();
  };
  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', resume);
}

/**
 * A soft click for any button press that made no sound of its own: React's handlers run
 * before this document listener, so a button that played something is left alone.
 */
export function installClickSounds(): void {
  document.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('button, [role="tab"], .button') : null;
    if (!b || (b as HTMLButtonElement).disabled) return;
    if (performance.now() - lastPlayed > 120) play('ui-click');
  });
}

/** The music bed for an era (0 ancient … 3 modern), or the title theme. */
export function setMusic(era: number | 'title' | null): void {
  music.set(era === null ? null : era === 'title' ? TITLE_MUSIC : MUSIC[Math.max(0, Math.min(MUSIC.length - 1, era))]!);
}

/** The ambience under the camera (an id from sounds.ts AMBIENCE), or none. */
export function setAmbience(id: string | null): void {
  ambience.set(id);
}

let context: Omit<SoundContext, 'human'> = { family: () => 'melee', unitType: () => undefined };

/** Tells the audio how to look up units (the client's rules and current state). */
export function setSoundContext(c: Omit<SoundContext, 'human'>): void {
  context = c;
}

/** Plays the most important sound among a batch of the human player's events. */
export function playEvents(events: readonly GameEvent[], human: number): void {
  const mine = events.filter((e) => concernsHuman(e, human));
  const id = pickSound(mine, { ...context, human });
  if (!id) return;
  play(id);
  // A battle also says how it went, a moment later (presentation timing only).
  const last = mine.filter((e) => e.type === 'combat').at(-1);
  if (last?.type === 'combat' && id.startsWith('attack-')) {
    const attackerWon = last.result === 'attackerWon' || last.result === 'defenderRetreated';
    setTimeout(() => play((last.attackerPlayer === human) === attackerWon ? 'battle-won' : 'battle-lost'), 900);
  }
}
