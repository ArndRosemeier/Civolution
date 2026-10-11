/**
 * Terrain colours, shared by the 3D terrain shader (two tones blended by noise) and
 * the minimap. Linear-ish sRGB hex; the shader converts.
 */
export const TERRAIN_COLORS: Record<string, [string, string]> = {
  desert: ['#d9c08a', '#c9a46a'],
  plains: ['#b7a95a', '#9c9a4c'],
  grassland: ['#6f9b3c', '#5a8a34'],
  tundra: ['#98a08a', '#7f8a78'],
  floodPlain: ['#7fa04a', '#9aa75a'],
  hills: ['#8a8f4c', '#6f7a3e'],
  mountains: ['#857a6c', '#6a6158'],
  forest: ['#4f7a34', '#3e6a2c'],
  jungle: ['#3f7a30', '#2f6626'],
  marsh: ['#5c7a52', '#4a6a4a'],
  volcano: ['#5a4a44', '#3e3432'],
  coast: ['#3fa0b0', '#3590a2'],
  sea: ['#24708e', '#1f6482'],
  ocean: ['#173f66', '#14385c'],
};

export const MINIMAP_LAKE = '#4cb0c0';

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
