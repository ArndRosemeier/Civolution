/**
 * Loads the game's .glb models (built by the Blender pipeline, see docs/assets.md) and
 * flattens each into one geometry with per-vertex colours, so every model draws as a
 * single instanced draw call. Vertices from the material named "team" get a team mask
 * the unit shader uses to tint them in the owner's colour.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface ModelSpec {
  file: string;
  /** Target size in world units along the model's largest horizontal or vertical extent. */
  size: number;
  /** Which extent `size` refers to. */
  fit: 'height' | 'length';
}

export const MODELS = {
  warrior: { file: 'civ_unit_warrior.glb', size: 0.62, fit: 'height' },
  spearman: { file: 'civ_unit_spearman.glb', size: 0.62, fit: 'height' },
  archer: { file: 'civ_unit_archer.glb', size: 0.62, fit: 'height' },
  settler: { file: 'civ_unit_settler.glb', size: 0.62, fit: 'height' },
  worker: { file: 'civ_unit_worker.glb', size: 0.6, fit: 'height' },
  scout: { file: 'civ_unit_scout.glb', size: 0.62, fit: 'height' },
  explorer: { file: 'civ_unit_explorer.glb', size: 0.62, fit: 'height' },
  galley: { file: 'civ_unit_galley.glb', size: 1.25, fit: 'length' },
  city: { file: 'civ_city_ancient.glb', size: 1.9, fit: 'length' },
  village: { file: 'civ_tribal_village.glb', size: 1.0, fit: 'length' },
  pine: { file: 'civ_nature_pine.glb', size: 0.42, fit: 'height' },
  broadleaf: { file: 'civ_nature_broadleaf.glb', size: 0.4, fit: 'height' },
  palm: { file: 'civ_nature_palm.glb', size: 0.42, fit: 'height' },
  jungle: { file: 'civ_nature_jungle.glb', size: 0.42, fit: 'height' },
  reed: { file: 'civ_nature_reed.glb', size: 0.18, fit: 'height' },
  mine: { file: 'civ_nature_mine.glb', size: 0.6, fit: 'length' },
} satisfies Record<string, ModelSpec>;

export type ModelId = keyof typeof MODELS;
export type ModelSet = Record<ModelId, THREE.BufferGeometry>;

async function loadOne(loader: GLTFLoader, spec: ModelSpec): Promise<THREE.BufferGeometry> {
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${spec.file}`);
  const parts: THREE.BufferGeometry[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(obj instanceof THREE.Mesh)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const groups = geo.groups.length > 0 ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : geo.attributes['position']!.count, materialIndex: 0 }];
    const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
    const pos = nonIndexed.attributes['position']!;
    const color = new Float32Array(pos.count * 3);
    const team = new Float32Array(pos.count);
    for (const g of groups) {
      const mat = materials[g.materialIndex ?? 0] as THREE.MeshStandardMaterial;
      const c = mat.color;
      const isTeam = mat.name === 'team' ? 1 : 0;
      for (let v = g.start; v < g.start + g.count; v++) {
        color[v * 3] = c.r;
        color[v * 3 + 1] = c.g;
        color[v * 3 + 2] = c.b;
        team[v] = isTeam;
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', pos);
    out.setAttribute('normal', nonIndexed.attributes['normal']!);
    out.setAttribute('color', new THREE.BufferAttribute(color, 3));
    out.setAttribute('teamMask', new THREE.BufferAttribute(team, 1));
    parts.push(out);
  });
  const merged = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const extent = spec.fit === 'height' ? size.y : Math.max(size.x, size.z);
  const s = spec.size / extent;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  merged.translate(-cx, -box.min.y, -cz);
  merged.scale(s, s, s);
  merged.computeBoundingSphere();
  return merged;
}

export async function loadModels(): Promise<ModelSet> {
  const loader = new GLTFLoader();
  const ids = Object.keys(MODELS) as ModelId[];
  const geos = await Promise.all(ids.map((id) => loadOne(loader, MODELS[id])));
  return Object.fromEntries(ids.map((id, i) => [id, geos[i]!])) as ModelSet;
}

/** Model used for a unit type; unit types without their own model yet borrow a family member's. */
export function unitModel(type: string, domain: 'land' | 'sea' | 'air'): ModelId {
  if (type in MODELS) return type as ModelId;
  if (domain === 'sea') return 'galley';
  return 'warrior';
}

/**
 * Lit material for instanced models: vertex colours, with team-masked vertices
 * multiplied by the per-instance colour.
 */
export function makeInstancedMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float teamMask;\nvarying float vTeamMask;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTeamMask = teamMask;')
      // three multiplies vColor by instanceColor; undo that for non-team vertices.
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  vColor.xyz = color.xyz * mix(vec3(1.0), instanceColor.xyz, teamMask);
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTeamMask;');
  };
  return mat;
}
