/**
 * UI state (zustand). The authoritative game state lives in the worker; this holds the
 * latest snapshot plus what only the UI cares about: selection, hover, log, settings.
 */
import { create } from 'zustand';
import { playerCities, playerUnits, researchableTechs, type Command, type GameEvent, type NewGameOptions } from '@civolution/engine';
import { rules } from './rules.ts';
import { host, type Snapshot } from './host/client.ts';
import { describeEvent } from './ui/describe.ts';
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
export type Panel = { kind: 'city'; id: number } | { kind: 'domestic' } | { kind: 'science' } | null;

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
  panel: Panel;
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

export const useGame = create<Store>((set, get) => {
  const absorb = (snapshot: Snapshot, events: GameEvent[]) => {
    const entries = events
      .filter((e) => !('player' in e) || e.player === snapshot.human)
      .flatMap((e) => {
        const text = describeEvent(snapshot, e);
        return text ? [{ turn: snapshot.state.turn, text, ...(e.reason ? { reason: e.reason } : {}), ...('tile' in e ? { tile: e.tile } : {}) }] : [];
      });
    set((st) => ({ snapshot, lastEvents: events, log: [...st.log, ...entries].slice(-200) }));
    playEvents(events, snapshot.human);
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
    panel: null,
    open(panel) {
      set({ panel, gotoMode: false });
    },
    async newGame(options) {
      set({ busy: true, log: [], selected: null, panel: null });
      const snapshot = await host().newGame(options, 0);
      set({ snapshot, busy: false, lastEvents: [] });
      get().selectNext();
    },
    async send(cmd) {
      const s = get().snapshot;
      if (!s) return false;
      const r = await host().command({ ...cmd, player: s.human });
      absorb(r.snapshot, r.events);
      if (r.error) {
        get().showToast(r.error);
        return false;
      }
      return true;
    },
    async endTurn() {
      if (get().busy) return;
      play('end-turn');
      set({ busy: true, selected: null });
      const r = await host().endTurn();
      absorb(r.snapshot, r.events);
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
        set({ snapshot, log: [{ turn: snapshot.state.turn, text: 'Game loaded.' }], selected: null, lastEvents: [], panel: null });
        get().selectNext();
      } catch (e) {
        get().showToast(e instanceof Error ? e.message : String(e));
      } finally {
        set({ busy: false });
      }
    },
    select(id) {
      set({ selected: id, gotoMode: false });
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
      set({ gotoMode: on });
    },
    showToast(text) {
      set({ toast: text });
      if (text) setTimeout(() => get().toast === text && set({ toast: null }), 3500);
    },
  };
});
