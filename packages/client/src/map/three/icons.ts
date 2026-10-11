/**
 * Resource icons on the map: camera-facing instanced billboards using the generated
 * medallion art (public/art/resources/<id>.png, see docs/assets.md). Resources whose
 * icon has not been generated yet fall back to a coloured token. Shield grassland gets a
 * smaller shield badge from the same folder.
 */
import * as THREE from 'three';
import type { FogUniforms } from './fog.ts';

export const BONUS_GRASSLAND_ICON = 'bonus-grassland';

export async function loadResourceIcons(ids: readonly string[]): Promise<Map<string, THREE.Texture>> {
  const loader = new THREE.TextureLoader();
  const out = new Map<string, THREE.Texture>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const tex = await loader.loadAsync(`${import.meta.env.BASE_URL}art/resources/${id}.png`);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        out.set(id, tex);
      } catch {
        // Not generated yet; the map uses a token instead.
      }
    }),
  );
  return out;
}

export function makeIconMaterial(map: THREE.Texture, fog: FogUniforms, size = 0.34): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uSize: { value: size }, ...fog } as unknown as Record<string, THREE.IUniform>,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uSize;
      varying vec2 vUv;
      varying vec3 vCvWorld;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vCvWorld = world.xyz;
        vec4 view = viewMatrix * world;
        view.xy += position.xy * uSize;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform sampler2D uFog;
      uniform vec2 uMapSize;
      varying vec2 vUv;
      varying vec3 vCvWorld;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.05) discard;
        vec2 mp = vec2(mod(vCvWorld.x, uMapSize.x), vCvWorld.z);
        float fog = texture2D(uFog, (mp + 0.5) / uMapSize).r;
        c.rgb *= mix(0.55, 1.0, smoothstep(0.55, 0.95, fog));
        gl_FragColor = c;
        #include <colorspace_fragment>
      }`,
  });
}
