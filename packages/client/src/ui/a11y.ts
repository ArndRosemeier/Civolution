/**
 * Accessibility settings applied to the page: interface size, light or dark theme, less
 * motion, and civilization colours that stay apart for colour-blind players (PLAN.md
 * §10.2). Colours are swapped in the UI's copy of the state only; saves keep the originals.
 */
import { StrategyCamera } from '../map/three/camera.ts';
import type { Settings } from '../store.ts';

/**
 * Colour-blind-safe civilization colours: the Okabe–Ito set first, then darker and lighter
 * versions of it, so the first eight civilizations never depend on red against green.
 */
export const COLOUR_BLIND_COLORS = [
  '#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#f5f5f5',
  '#8a5f00', '#2d7fae', '#00604a', '#a49b1c', '#00426a', '#8a3d00', '#8a4a74', '#7a7a7a',
];

export function applySettings(s: Settings): void {
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(Math.min(1.5, Math.max(0.8, s.uiScale))));
  root.dataset['theme'] = s.theme;
  if (s.reduceMotion) root.dataset['reduceMotion'] = '';
  else delete root.dataset['reduceMotion'];
  StrategyCamera.smooth = !s.reduceMotion;
}

/** The colours players are drawn in. */
export function displayColours<P extends { color: string; barbarian?: boolean }>(players: readonly P[], colourBlind: boolean): P[] {
  if (!colourBlind) return players as P[];
  return players.map((p, i) => (p.barbarian ? p : { ...p, color: COLOUR_BLIND_COLORS[i % COLOUR_BLIND_COLORS.length]! }));
}
