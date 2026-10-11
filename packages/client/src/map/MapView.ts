/**
 * What the UI needs from a map renderer. The game never depends on how the map is
 * drawn: the 3D renderer implements this, and a 2D one could replace it (PLAN.md §10.1).
 */
import type { GameEvent, GameState } from '@civolution/engine';

export interface MapSnapshot {
  state: GameState;
  visible: Uint8Array;
  human: number;
}

export interface MapStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  units: number;
}

export interface MapView {
  /** Full rebuild for a new or loaded game. */
  setGame(snapshot: MapSnapshot): void;
  /** Incremental refresh after commands and turns. */
  update(snapshot: MapSnapshot, events: readonly GameEvent[]): void;
  setSelectedUnit(id: number | null): void;
  setHoverTile(tile: number | null): void;
  setPath(tiles: readonly number[] | null, turnEnds?: readonly number[]): void;
  centerOn(tile: number, instant?: boolean): void;
  /** Tile under a screen position, or -1. */
  pick(clientX: number, clientY: number): number;
  setGrid(on: boolean): void;
  stats(): MapStats;
  /** Camera access for the minimap and benchmarks. */
  view(): { x: number; z: number; distance: number; yaw: number };
  setView(v: { x?: number; z?: number; distance?: number; yaw?: number }, instant?: boolean): void;
  dispose(): void;
}
