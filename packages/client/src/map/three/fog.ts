/**
 * Fog of war for lit materials (trees, roads, units, villages): samples the same fog
 * texture as the terrain at the fragment's map position and dims or blacks it out.
 */
import type * as THREE from 'three';

export interface FogUniforms {
  uFog: { value: THREE.DataTexture };
  uMapSize: { value: THREE.Vector2 };
}

export function applyFog(mat: THREE.Material, fog: FogUniforms, instanced: boolean): void {
  const previous = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    Object.assign(shader.uniforms, fog);
    const world = instanced ? 'modelMatrix * instanceMatrix * vec4(transformed, 1.0)' : 'modelMatrix * vec4(transformed, 1.0)';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCvWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>\nvCvWorld = (${world}).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCvWorld;\nuniform sampler2D uFog;\nuniform vec2 uMapSize;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
{
  vec2 mp = vec2(mod(vCvWorld.x, uMapSize.x), vCvWorld.z);
  float fog = texture2D(uFog, (mp + 0.5) / uMapSize).r;
  float seen = smoothstep(0.02, 0.3, fog);
  float lit = smoothstep(0.55, 0.95, fog);
  vec3 c = gl_FragColor.rgb;
  vec3 grey = vec3(dot(c, vec3(0.3, 0.55, 0.15)));
  c = mix(mix(grey * 0.55, c * 0.62, 0.35), c, lit);
  gl_FragColor.rgb = mix(vec3(0.015, 0.02, 0.03), c, seen);
}`,
      );
  };
}
