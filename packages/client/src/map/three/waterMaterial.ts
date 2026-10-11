/**
 * Sea surface: a flat plane at height 0 coloured by the depth of the terrain below
 * (turquoise shallows to navy ocean), with moving ripples, sun glints, shore foam and
 * the fog of war. Rivers use the same look on thin ribbons (`makeRiverMaterial`).
 */
import * as THREE from 'three';
import { NOISE_GLSL } from './terrainMaterial.ts';

export interface WaterUniforms {
  uDepth: { value: THREE.DataTexture };
  uFog: { value: THREE.DataTexture };
  uMapSize: { value: THREE.Vector2 };
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
}

export function makeWaterMaterial(uniforms: WaterUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: /* glsl */ `
      varying vec2 vMapPos;
      varying vec3 vWorld;
      void main() {
        vMapPos = position.xz;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDepth;
      uniform sampler2D uFog;
      uniform vec2 uMapSize;
      uniform float uTime;
      uniform vec3 uSunDir;
      varying vec2 vMapPos;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        vec2 p = vMapPos;
        vec2 uv = (p + 0.5) / uMapSize;
        float depth = texture2D(uDepth, uv).r; // 0 = shore, 1 = deep ocean
        depth = clamp(depth + (cvFbm(p * 0.35) - 0.5) * 0.25, 0.0, 1.0);
        if (p.y < -0.5 || p.y > uMapSize.y - 0.5) depth = 1.0;
        vec3 shallow = vec3(0.13, 0.6, 0.62);
        vec3 mid = vec3(0.05, 0.3, 0.5);
        vec3 deep = vec3(0.02, 0.1, 0.24);
        vec3 col = mix(shallow, mid, smoothstep(0.0, 0.35, depth));
        col = mix(col, deep, smoothstep(0.35, 0.9, depth));
        // Ripples: two scrolling noise layers perturb a normal for glints.
        float t = uTime * 0.05;
        float n1 = cvFbm(p * 2.2 + vec2(t, t * 0.7));
        float n2 = cvFbm(p * 3.7 - vec2(t * 0.8, t * 1.1));
        vec3 nrm = normalize(vec3((n1 - 0.5) * 0.6, 1.0, (n2 - 0.5) * 0.6));
        vec3 view = normalize(cameraPosition - vWorld);
        vec3 h = normalize(uSunDir + view);
        float spec = pow(max(dot(nrm, h), 0.0), 90.0);
        float fres = pow(1.0 - max(dot(view, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
        col = mix(col, vec3(0.55, 0.7, 0.85), fres * 0.35);
        col += vec3(1.0, 0.95, 0.85) * spec * 0.8;
        col *= 0.94 + 0.12 * n1;
        // Foam along the shore.
        float foam = smoothstep(0.06, 0.0, depth) * smoothstep(0.5, 0.8, cvFbm(p * 4.0 + vec2(uTime * 0.25, -uTime * 0.1)));
        col = mix(col, vec3(0.92, 0.96, 0.97), foam * 0.7);
        float fog = texture2D(uFog, uv).r;
        float seen = smoothstep(0.02, 0.3, fog);
        float lit = smoothstep(0.55, 0.95, fog);
        vec3 grey = vec3(dot(col, vec3(0.3, 0.55, 0.15)));
        col = mix(mix(grey * 0.55, col * 0.62, 0.35), col, lit);
        col = mix(vec3(0.015, 0.02, 0.03), col, seen);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export function makeRiverMaterial(uniforms: Pick<WaterUniforms, 'uFog' | 'uMapSize' | 'uTime'>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: /* glsl */ `
      attribute float along;
      varying vec2 vMapPos;
      varying float vAlong;
      varying float vAcross;
      attribute float across;
      void main() {
        vMapPos = position.xz;
        vAlong = along;
        vAcross = across;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uFog;
      uniform vec2 uMapSize;
      uniform float uTime;
      varying vec2 vMapPos;
      varying float vAlong;
      varying float vAcross;
      ${NOISE_GLSL}
      void main() {
        float flow = cvFbm(vec2(vAlong * 2.2 - uTime * 0.5, vAcross * 1.5));
        vec3 col = mix(vec3(0.1, 0.38, 0.52), vec3(0.22, 0.55, 0.66), flow);
        float edge = smoothstep(0.55, 1.0, abs(vAcross));
        col = mix(col, vec3(0.42, 0.45, 0.33), edge * 0.55);
        float fog = texture2D(uFog, (vMapPos + 0.5) / uMapSize).r;
        float seen = smoothstep(0.02, 0.3, fog);
        float lit = smoothstep(0.55, 0.95, fog);
        vec3 grey = vec3(dot(col, vec3(0.3, 0.55, 0.15)));
        col = mix(mix(grey * 0.55, col * 0.62, 0.35), col, lit);
        col = mix(vec3(0.015, 0.02, 0.03), col, seen);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
