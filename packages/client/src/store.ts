/**
 * UI state (zustand). The authoritative game state lives in the worker; this holds the
 * latest snapshot plus what only the UI cares about: selection, hover, log, settings.
 */
import { create } from 'zustand';
import type { DigestItem } from '@civolution/automation';
import { playerCities, playerUnits, researchableTechs, type Command, type GameEvent, type NewGameOptions } from '@civolution/engine';
import { rules } from './rules.ts';
import { host, type Snapshot } from './host/client.ts';
import { concernsHuman, describeEvent } from './ui/describe.ts';
import { play, playEvents } from './audio.ts';

/** A command without its player; the store fills in the human player. */
export type CommandInput = Command extends infer C ? (C extends Command ? Omit<C, 'player'> : never) : never;

export interface LogEntry {
  turn: number;
  text: string;
  reason?: string;
  tile?: number;
}

/** The open screen over the map, if any. */
export type Panel =
  | { kind: 'city'; id: number }
  | { kind: 'domestic' }
  | { kind: 'science' }
  | { kind: 'foreign' }
  | { kind: 'diplomacy'; with?: number }
  | { kind: 'automation'; tab?: AutomationTab }
  /** Victory progress, the spaceship and the histograph (F8); `gameOver` when the game was just decided. */
  | { kind: 'victory'; gameOver?: boolean }
  | null;

export type AutomationTab = 'delegation' | 'governors' | 'templates' | 'workers' | 'policies' | 'rules';

/** A map click the UI is waiting for (setting a rally point, a patrol's far end, a worker region). */
export type TilePick = { purpose: 'rally'; city: number } | { purpose: 'patrol'; unit: number } | { purpose: 'region' };

/** A unit action waiting for its target tile. */
export type AimAction = 'bombard' | 'bomb' | 'precisionBomb' | 'recon' | 'rebase' | 'nuke' | 'airdrop' | 'airlift';

/** A headline event shown as a card over the map. */
export interface News {
  kind:
    | 'warDeclared'
    | 'peaceMade'
    | 'cityCaptured'
    | 'cityLost'
    | 'cityDestroyed'
    | 'cityRaided'
    | 'nuclearStrike'
    | 'leaderBorn'
    | 'playerEliminated'
    | 'contactMade'
    | 'ceasefireEnded'
    | 'treatyBroken'
    | 'cityRevolted'
    | 'barbarianLanding'
    | 'spyCaught'
    | 'goldenAge'
    | 'scientistBorn'
    | 'cultureFlip'
    | 'spaceshipLaunched'
    | 'spaceshipLost'
    | 'globalWarming'
    | 'meltdown'
    | 'unitedNations';
  /** The civilization the news is about (its leader's portrait is shown). */
  civ?: number;
  text: string;
  tile?: number;
}

export interface Settings {
  grid: boolean;
  perf: boolean;
  shadows: boolean;
}

interface Store {
  snapshot: Snapshot | null;
  selected: number | null;
  hover: number | null;
  log: LogEntry[];
  /** Events from the last host call, for the map view. */
  lastEvents: GameEvent[];
  busy: boolean;
  toast: string | null;
  settings: Settings;
  gotoMode: boolean;
  aim: { unit: number; action: AimAction } | null;
  /** A city taken this turn that the player may keep or raze. */
  razePrompt: number | null;
  news: News[];
  /** The turn digest (PLAN.md §8.7) and whether it is showing. */
  digest: DigestItem[];
  digestOpen: boolean;
  tilePick: TilePick | null;
  panel: Panel;
  setDigestOpen: (open: boolean) => void;
  setTilePick: (pick: TilePick | null) => void;
  open: (panel: Panel) => void;
  newGame: (options: NewGameOptions) => Promise<void>;
  send: (cmd: CommandInput) => Promise<boolean>;
  endTurn: () => Promise<void>;
  load: (text: string) => Promise<void>;
  select: (id: number | null) => void;
  selectNext: () => void;
  setHover: (tile: number | null) => void;
  setSettings: (s: Partial<Settings>) => void;
  setGotoMode: (on: boolean) => void;
  setAim: (aim: { unit: number; action: AimAction } | null) => void;
  dismissNews: () => void;
  answerRaze: (raze: boolean) => Promise<void>;
  showToast: (text: string | null) => void;
}

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem('civolution.settings');
    if (raw) return { grid: false, perf: false, shadows: true, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Private mode or blocked storage: defaults are fine.
  }
  return { grid: false, perf: false, shadows: true };
}

/** Cities of the human player with nothing to build. */
export function idleCities(s: Snapshot): number[] {
  return playerCities(s.state, s.human)
    .filter((c) => c.build === null)
    .map((c) => c.id);
}

/** True when the human player should pick a research target. */
export function needsResearch(s: Snapshot): boolean {
  const p = s.state.players[s.human]!;
  return p.research.tech === null && playerCities(s.state, s.human).length > 0 && researchableTechs(rules, p).length > 0;
}

/** Units of the human player that still want orders this turn. */
export function idleUnits(s: Snapshot): number[] {
  return playerUnits(s.state, s.human)
    .filter((u) => u.movesLeft > 0 && u.order === null && u.routine === null)
    .map((u) => u.id);
}

/** Headline cards for the big events of a batch. */
function headlines(snapshot: Snapshot, events: readonly GameEvent[]): News[] {
  const h = snapshot.human;
  const out: News[] = [];
  for (const e of events) {
    const text = describeEvent(snapshot, e);
    if (!text) continue;
    if (e.type === 'warDeclared' && e.target === h) out.push({ kind: 'warDeclared', text, civ: e.player });
    else if (e.type === 'peaceMade' && (e.target === h || e.player === h)) out.push({ kind: 'peaceMade', text, civ: e.player === h ? e.target : e.player });
    else if (e.type === 'contactMade' && (e.player === h || e.other === h)) out.push({ kind: 'contactMade', text, civ: e.player === h ? e.other : e.player });
    else if (e.type === 'ceasefireEnded' && (e.player === h || e.target === h)) out.push({ kind: 'ceasefireEnded', text, civ: e.player === h ? e.target : e.player });
    else if (e.type === 'treatyBroken' && e.target === h) out.push({ kind: 'treatyBroken', text, civ: e.player });
    else if (e.type === 'cityRevolted' && (e.player === h || e.from === h)) out.push({ kind: e.cause === 'culture' ? 'cultureFlip' : 'cityRevolted', text, tile: e.tile, civ: e.player === h ? e.from : e.player });
    else if (e.type === 'goldenAgeStarted' && e.player === h) out.push({ kind: 'goldenAge', text });
    else if (e.type === 'spaceshipLaunched') out.push({ kind: 'spaceshipLaunched', text, ...(e.player === h ? {} : { civ: e.player }) });
    else if (e.type === 'spaceshipLost' && (e.player === h || e.by === h)) out.push({ kind: 'spaceshipLost', text });
    else if (e.type === 'globalWarming') out.push({ kind: 'globalWarming', text });
    else if (e.type === 'meltdown' && e.player === h) out.push({ kind: 'meltdown', text, tile: e.tile });
    else if (e.type === 'unitedNationsVote') out.push({ kind: 'unitedNations', text });
    else if (e.type === 'barbarianLanding' && snapshot.state.cities[e.near]?.owner === h) out.push({ kind: 'barbarianLanding', text, tile: e.tile });
    else if (e.type === 'espionage' && e.target === h && !e.success) out.push({ kind: 'spyCaught', text, civ: e.player });
    else if (e.type === 'cityCaptured' && e.player === h) out.push({ kind: 'cityCaptured', text, tile: e.tile });
    else if (e.type === 'cityCaptured' && e.from === h) out.push({ kind: 'cityLost', text, tile: e.tile });
    else if (e.type === 'cityDestroyed' && e.player === h) out.push({ kind: 'cityDestroyed', text, tile: e.tile });
    else if (e.type === 'cityRaided' && e.player === h) out.push({ kind: 'cityRaided', text, tile: e.tile });
    else if (e.type === 'nuclearStrike' && !e.stopped) out.push({ kind: 'nuclearStrike', text, tile: e.tile });
    else if (e.type === 'leaderBorn' && e.player === h) out.push({ kind: e.scientific ? 'scientistBorn' : 'leaderBorn', text, tile: e.tile });
    else if (e.type === 'playerEliminated') out.push({ kind: 'playerEliminated', text });
  }
  return out.slice(0, 4);
}

export const useGame = create<Store>((set, get) => {
  const absorb = (snapshot: Snapshot, events: GameEvent[], digest?: DigestItem[]) => {
    if (digest) set({ digest, digestOpen: digest.some((d) => d.priority <= 2) });
    const raw: LogEntry[] = events
      .filter((e) => concernsHuman(e, snapshot.human))
      .flatMap((e) => {
        const text = describeEvent(snapshot, e);
        return text ? [{ turn: snapshot.state.turn, text, ...(e.reason ? { reason: e.reason } : {}), ...('tile' in e ? { tile: e.tile } : {}) }] : [];
      });
    // Automation repeats itself across a big empire: identical lines are counted, not repeated.
    const entries: LogEntry[] = [];
    const seen = new Map<string, LogEntry & { count: number }>();
    for (const e of raw) {
      const key = `${e.text}|${e.reason ?? ''}`;
      const prev = seen.get(key);
      if (prev) {
        prev.count++;
        prev.text = `${e.text} (×${prev.count})`;
        continue;
      }
      const entry = { ...e, count: 1 };
      seen.set(key, entry);
      entries.push(entry);
    }
    const captured = events.find((e) => e.type === 'cityCaptured' && e.player === snapshot.human);
    const fresh = headlines(snapshot, events);
    set((st) => ({
      snapshot,
      lastEvents: events,
      log: [...st.log, ...entries].slice(-200),
      news: [...st.news, ...fresh].slice(-6),
      ...(captured?.type === 'cityCaptured' && snapshot.state.cities[captured.city]?.owner === snapshot.human ? { razePrompt: captured.city } : {}),
    }));
    playEvents(events, snapshot.human);
    // The game was just decided: the victory screen opens.
    if (events.some((e) => e.type === 'gameWon')) set({ panel: { kind: 'victory', gameOver: true } });
    const sel = get().selected;
    if (sel !== null && !snapshot.state.units[sel]) set({ selected: null });
  };
  return {
    snapshot: null,
    selected: null,
    hover: null,
    log: [],
    lastEvents: [],
    busy: false,
    toast: null,
    settings: readSettings(),
    gotoMode: false,
    aim: null,
    razePrompt: null,
    news: [],
    digest: [],
    digestOpen: false,
    tilePick: null,
    panel: null,
    setDigestOpen(open) {
      set({ digestOpen: open });
    },
    setTilePick(pick) {
      set({ tilePick: pick, gotoMode: false, aim: null });
    },
    open(panel) {
      if ((panel === null) !== (get().panel === null)) play(panel ? 'ui-open' : 'ui-close');
      set({ panel, gotoMode: false, aim: null });
    },
    async newGame(options) {
      set({ busy: true, log: [], selected: null, panel: null, news: [], razePrompt: null, aim: null, digest: [], digestOpen: false, tilePick: null });
      let snapshot = await host().newGame(options, 0);
      // Test scenarios (e2e and visual checks): ?scenario=skirmish, ?scenario=empire.
      const params = new URLSearchParams(location.search);
      const scenario = params.get('scenario');
      if (scenario === 'skirmish') snapshot = await host().skirmish();
      if (scenario === 'empire') snapshot = await host().empire(Number(params.get('cities') ?? 200));
      set({ snapshot, busy: false, lastEvents: [] });
      get().selectNext();
    },
    async send(cmd) {
      const s = get().snapshot;
      if (!s) return false;
      const r = await host().command({ ...cmd, player: s.human });
      absorb(r.snapshot, r.events, r.digest);
      if (r.error) {
        get().showToast(r.error);
        return false;
      }
      return true;
    },
    async endTurn() {
      if (get().busy) return;
      play('end-turn');
      set({ busy: true, selected: null, aim: null, razePrompt: null });
      const r = await host().endTurn();
      absorb(r.snapshot, r.events, r.digest);
      // The digest's chime follows the turn's own sounds (presentation timing only).
      if (r.digest && r.digest.length > 0) {
        const id = r.digest.some((d) => d.needsInput) ? 'digest-open' : r.digest.some((d) => d.kind === 'notice') ? 'rule-fired' : 'digest-clear';
        setTimeout(() => play(id), 700);
      }
      set({ busy: false });
      if (r.error) get().showToast(r.error);
      get().selectNext();
      // A finished advance: ask what to research next.
      if (needsResearch(r.snapshot) && get().panel === null) set({ panel: { kind: 'science' } });
    },
    async load(text) {
      set({ busy: true });
      try {
        const snapshot = await host().load(text);
        set({ snapshot, log: [{ turn: snapshot.state.turn, text: 'Game loaded.' }], selected: null, lastEvents: [], panel: null, digest: [], digestOpen: false, tilePick: null });
        get().selectNext();
      } catch (e) {
        get().showToast(e instanceof Error ? e.message : String(e));
      } finally {
        set({ busy: false });
      }
    },
    select(id) {
      if (id !== null && id !== get().selected) play('ui-select');
      set({ selected: id, gotoMode: false, aim: null });
    },
    selectNext() {
      const s = get().snapshot;
      if (!s) return;
      const idle = idleUnits(s);
      if (idle.length === 0) {
        set({ selected: null });
        return;
      }
      const cur = get().selected;
      const next = idle.find((id) => cur === null || id > cur) ?? idle[0]!;
      set({ selected: next, gotoMode: false });
    },
    setHover(tile) {
      if (get().hover !== tile) set({ hover: tile });
    },
    setSettings(s) {
      const settings = { ...get().settings, ...s };
      set({ settings });
      try {
        localStorage.setItem('civolution.settings', JSON.stringify(settings));
      } catch {
        // Not persisted; fine.
      }
    },
    setGotoMode(on) {
      set({ gotoMode: on, aim: null });
    },
    setAim(aim) {
      set({ aim, gotoMode: false });
    },
    dismissNews() {
      set((st) => ({ news: st.news.slice(1) }));
    },
    async answerRaze(raze) {
      const city = get().razePrompt;
      set({ razePrompt: null });
      if (raze && city !== null) await get().send({ type: 'razeCity', city });
    },
    showToast(text) {
      set({ toast: text });
      if (text) setTimeout(() => get().toast === text && set({ toast: null }), 3500);
    },
  };
});
