/**
 * Terrain shading. One continuous mesh per chunk; the fragment shader looks up which
 * tile a point belongs to (with a noisy offset, so borders between terrains look
 * natural instead of diamond-shaped) and paints it from a two-tone palette with
 * procedural detail: rock on steep slopes, snow on high peaks, sand along shores,
 * furrows on irrigated fields, and the fog of war.
 *
 * Ground detail comes from generated seamless textures (art/terrain/<id>.jpg) packed
 * into one texture array; each is sampled at two scales so the repeat does not show,
 * and the two-tone palette stays as the colour until (or if) the textures load.
 *
 * Data textures (map lattice resolution, width × height):
 *  - uTerrain (RGBA8, nearest): R terrain index, G improvement bits, B tile flags.
 *  - uFog (R8, linear): 0 unexplored, ~0.5 explored, 1 visible; corner texels hold
 *    the average of their tiles so linear filtering gives soft fog edges.
 */
import * as THREE from 'three';
import { TERRAIN_COLORS, hexToRgb } from '../palette.ts';

export const NOISE_GLSL = /* glsl */ `
float cvHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float cvNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cvHash(i), cvHash(i + vec2(1.0, 0.0)), u.x), mix(cvHash(i + vec2(0.0, 1.0)), cvHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cvFbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * cvNoise(p); p *= 2.07; a *= 0.5; }
  return s / 0.9375;
}
`;

export interface TerrainUniforms {
  uTerrain: { value: THREE.DataTexture };
  uFog: { value: THREE.DataTexture };
  uMapSize: { value: THREE.Vector2 };
  uTime: { value: number };
  uGrid: { value: number };
}

/** Ground textures in the array, in layer order; terrains without their own use the closest. */
export const GROUND_TEXTURES = ['grassland', 'plains', 'desert', 'tundra', 'floodPlain', 'hills', 'mountains', 'forest', 'jungle', 'marsh', 'volcano', 'beach', 'snow'] as const;
const GROUND_FOR: Record<string, string> = { coast: 'beach', sea: 'beach', ocean: 'beach' };
const TEX_SIZE = 512;

/** Loads the ground textures into one array texture; resolves false if any is missing. */
function loadGround(tex: THREE.DataArrayTexture): Promise<boolean> {
  const layers = GROUND_TEXTURES.length;
  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4 * layers);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return Promise.resolve(false);
  const one = (id: string, layer: number) =>
    new Promise<boolean>((done) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, TEX_SIZE, TEX_SIZE);
        data.set(ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE).data, layer * TEX_SIZE * TEX_SIZE * 4);
        done(true);
      };
      img.onerror = () => done(false);
      img.src = `${import.meta.env.BASE_URL}art/terrain/${id}.jpg`;
    });
  // Decoding one after another keeps the shared canvas simple; it is a one-off at start.
  return GROUND_TEXTURES.reduce<Promise<boolean>>((ok, id, i) => ok.then((all) => one(id, i).then((x) => all && x)), Promise.resolve(true)).then((ok) => {
    if (!ok) return false;
    tex.image = { data, width: TEX_SIZE, height: TEX_SIZE, depth: layers };
    tex.needsUpdate = true;
    return true;
  });
}

let ground: { tex: THREE.DataArrayTexture; ready: { value: number } } | null = null;

/** One shared ground texture array for every map view. */
function groundTextures(): { tex: THREE.DataArrayTexture; ready: { value: number } } {
  if (ground) return ground;
  const tex = new THREE.DataArrayTexture(new Uint8Array(4 * GROUND_TEXTURES.length), 1, 1, GROUND_TEXTURES.length);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  const g = { tex, ready: { value: 0 } };
  ground = g;
  if (typeof document !== 'undefined') void loadGround(tex).then((ok) => (g.ready.value = ok ? 1 : 0));
  return g;
}

export function makeTerrainMaterial(terrainIds: readonly string[], uniforms: TerrainUniforms): THREE.MeshStandardMaterial {
  const n = terrainIds.length;
  const g = groundTextures();
  const layerOf = (id: string) => Math.max(0, GROUND_TEXTURES.indexOf((GROUND_FOR[id] ?? id) as (typeof GROUND_TEXTURES)[number]));
  const layers = terrainIds.map((id) => layerOf(id));
  const palA = terrainIds.map((id) => new THREE.Color().setRGB(...hexToRgb(TERRAIN_COLORS[id]?.[0] ?? '#ff00ff'), THREE.SRGBColorSpace));
  const palB = terrainIds.map((id) => new THREE.Color().setRGB(...hexToRgb(TERRAIN_COLORS[id]?.[1] ?? '#ff00ff'), THREE.SRGBColorSpace));
  const idx = (id: string) => terrainIds.indexOf(id);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uPalA: { value: palA }, uPalB: { value: palB }, uGround: { value: g.tex }, uGroundReady: g.ready, uLayer: { value: layers } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMapPos;\nvarying float vHeight;\nvarying vec3 vUpNormal;\nuniform sampler2D uFog;\nuniform vec2 uMapSize;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vMapPos = position.xz;
vHeight = position.y;
vUpNormal = normal;
// Unexplored land sinks below the sea so its relief does not give the map away.
float cvFogV = texture2D(uFog, (position.xz + 0.5) / uMapSize).r;
transformed.y = mix(-0.08, transformed.y, smoothstep(0.0, 0.12, cvFogV));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vMapPos;
varying float vHeight;
varying vec3 vUpNormal;
uniform sampler2D uTerrain;
uniform sampler2D uFog;
uniform vec2 uMapSize;
uniform float uTime;
uniform float uGrid;
uniform vec3 uPalA[${n}];
uniform vec3 uPalB[${n}];
uniform highp sampler2DArray uGround;
uniform float uGroundReady;
uniform int uLayer[${n}];
${NOISE_GLSL}
// Two scales, the larger one rotated, mixed by noise: the repeat of one texture vanishes.
vec3 cvGround(float layer, vec2 p) {
  vec3 a = texture(uGround, vec3(p * 0.42, layer)).rgb;
  vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p * 0.13 + 0.37;
  vec3 b = texture(uGround, vec3(q, layer)).rgb;
  return mix(a, b, 0.25 + 0.35 * cvNoise(p * 0.35));
}
vec4 cvTile(vec2 p, out vec2 local) {
  float u = (p.x + p.y) * 0.5;
  float v = (p.y - p.x) * 0.5;
  float ur = floor(u + 0.5);
  float vr = floor(v + 0.5);
  local = vec2(u - ur, v - vr);
  float x = mod(ur - vr, uMapSize.x);
  float y = clamp(ur + vr, 0.0, uMapSize.y - 1.0);
  return texelFetch(uTerrain, ivec2(int(x), int(y)), 0);
}
vec3 cvPal(int id, vec2 p) {
  vec3 a = uPalA[0]; vec3 b = uPalB[0];
  for (int i = 0; i < ${n}; i++) { if (i == id) { a = uPalA[i]; b = uPalB[i]; } }
  float t = cvFbm(p * 0.9);
  vec3 c = mix(a, b, smoothstep(0.3, 0.7, t));
  c *= 0.9 + 0.2 * cvNoise(p * 7.0);
  return c;
}
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec2 p = vMapPos;
  // Domain warp: large slow swirls plus fine fringe, so tile borders read as natural edges.
  vec2 jitter = (vec2(cvFbm(p * 0.55), cvFbm(p * 0.55 + 19.3)) - 0.5) * 1.3
              + (vec2(cvNoise(p * 2.6 + 7.1), cvNoise(p * 2.6 - 3.7)) - 0.5) * 0.45;
  vec2 local;
  vec4 tile = cvTile(p + jitter, local);
  int id = int(tile.r * 255.0 + 0.5);
  int imp = int(tile.g * 255.0 + 0.5);
  int flags = int(tile.b * 255.0 + 0.5);
  vec3 col = cvPal(id, p);
  float slope = 1.0 - clamp(vUpNormal.y, 0.0, 1.0);
  vec3 rock = mix(vec3(0.42, 0.39, 0.35), vec3(0.55, 0.52, 0.47), cvNoise(p * 5.0));
  vec3 sand = vec3(0.83, 0.76, 0.56);
  vec3 snow = vec3(0.93, 0.95, 0.98);
  if (uGroundReady > 0.5) {
    int layer = 0;
    for (int i = 0; i < ${n}; i++) { if (i == id) layer = uLayer[i]; }
    col = cvGround(float(layer), p);
    rock = cvGround(${layerOf('mountains')}.0, p);
    sand = cvGround(${layerOf('beach')}.0, p);
    snow = cvGround(${layerOf('snow')}.0, p);
  }
  if (id == ${idx('mountains')} || id == ${idx('volcano')} || id == ${idx('hills')}) {
    col = mix(col, rock, smoothstep(0.25, 0.6, slope));
  }
  if (id == ${idx('volcano')}) col = mix(col, vec3(0.12, 0.1, 0.1), smoothstep(1.0, 1.4, vHeight));
  if (id == ${idx('mountains')}) col = mix(col, snow, smoothstep(1.05, 1.25, vHeight + cvNoise(p * 3.0) * 0.15) * (1.0 - smoothstep(0.55, 0.8, slope)));
  if (id == ${idx('tundra')}) col = mix(col, snow, smoothstep(0.62, 0.8, cvFbm(p * 2.3)) * 0.7);
  // Shore sand on land just above the water line.
  if (vHeight > -0.02 && vHeight < 0.07 && id != ${idx('coast')} && id != ${idx('sea')} && id != ${idx('ocean')}) {
    col = mix(col, sand, (1.0 - smoothstep(0.02, 0.07, vHeight)) * 0.8);
  }
  // Warped lookups can land on a water tile while the ground here is above the sea:
  // that ground is beach, not sea floor.
  bool waterTile = id == ${idx('coast')} || id == ${idx('sea')} || id == ${idx('ocean')};
  if (waterTile && vHeight > -0.03) col = sand * (0.92 + 0.16 * cvNoise(p * 6.0));
  if (vHeight < -0.03) col = mix(col, vec3(0.62, 0.58, 0.45), 0.5);
  // Outcroppings on bonus grassland.
  if ((flags & 1) != 0) col = mix(col, vec3(0.45, 0.38, 0.28), step(0.83, cvNoise(p * 9.0)) * 0.8);
  // Irrigation: furrows along the tile with water glints.
  if ((imp & 4) != 0 && max(abs(local.x), abs(local.y)) < 0.42) {
    float f = abs(fract(local.x * 7.0) - 0.5);
    col = mix(col, vec3(0.32, 0.5, 0.25), 0.35);
    col = mix(col, vec3(0.3, 0.55, 0.7), smoothstep(0.08, 0.0, f) * 0.6);
  }
  // Pollution and craters: grey blight.
  if ((imp & 192) != 0) col = mix(col, vec3(0.35, 0.33, 0.3), 0.55 * step(0.45, cvNoise(p * 4.0)));
  // Optional tile grid.
  if (uGrid > 0.5) {
    vec2 lu; cvTile(p, lu);
    float edge = max(abs(lu.x), abs(lu.y));
    col = mix(col, vec3(0.0), smoothstep(0.47, 0.5, edge) * 0.35);
  }
  // Fog of war.
  float fog = texture2D(uFog, (p + 0.5) / uMapSize).r;
  float seen = smoothstep(0.02, 0.3, fog);
  float lit = smoothstep(0.55, 0.95, fog);
  vec3 grey = vec3(dot(col, vec3(0.3, 0.55, 0.15)));
  col = mix(mix(grey * 0.55, col * 0.62, 0.35), col, lit);
  col = mix(vec3(0.015, 0.02, 0.03), col, seen);
  diffuseColor.rgb = col;
}
`,
      );
  };
  return mat;
}
