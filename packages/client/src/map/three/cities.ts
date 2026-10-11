/**
 * Cities on the map (PLAN.md §10.1): a city model chosen by its owner's era and its size
 * class, cultural borders as coloured ribbons along territory edges, and HTML name
 * plates that follow the camera.
 */
import * as THREE from 'three';
import { isExplored, sizeClass, type City, type GameState, type Rules, type SizeClass } from '@civolution/engine';
import { applyFog, type FogUniforms } from './fog.ts';
import type { HeightField } from './heights.ts';
import { makeInstancedMaterial, type ModelId, type ModelSet } from './models.ts';

const ERA_MODELS: Record<string, Record<SizeClass, ModelId>> = {
  ancient: { town: 'cityAncientTown', city: 'cityAncientCity', metropolis: 'cityAncientMetro' },
  middle: { town: 'cityMedievalTown', city: 'cityMedievalCity', metropolis: 'cityMedievalMetro' },
  industrial: { town: 'cityIndustrialTown', city: 'cityIndustrialCity', metropolis: 'cityIndustrialMetro' },
  modern: { town: 'cityModernTown', city: 'cityModernCity', metropolis: 'cityModernMetro' },
};

export function cityModel(rules: Rules, eraIndex: number, size: number): ModelId {
  const era = rules.set.eras[Math.min(eraIndex, rules.set.eras.length - 1)]!.id;
  return (ERA_MODELS[era] ?? ERA_MODELS['ancient']!)[sizeClass(rules, size)];
}

export interface CityLabelInfo {
  city: City;
  production: string;
  turns: number | null;
  growth: number | null;
  disorder: boolean;
  celebrating: boolean;
}

interface Placed {
  city: City;
  model: ModelId;
  color: THREE.Color;
  x: number;
  z: number;
  label: HTMLDivElement;
}

/** Edge corner offsets (dx, dz) for the four edge-sharing directions NE, SE, SW, NW. */
const EDGES: [number, [number, number], [number, number]][] = [
  [1, [0, -1], [1, 0]],
  [3, [1, 0], [0, 1]],
  [5, [0, 1], [-1, 0]],
  [7, [-1, 0], [0, -1]],
];
const DIR_DX = [0, 1, 2, 1, 0, -1, -2, -1];
const DIR_DZ = [-2, -1, 0, 1, 2, 1, 0, -1];

export class CityLayer {
  readonly group = new THREE.Group();
  private readonly borders = new THREE.Group();
  private readonly material: THREE.MeshStandardMaterial;
  private readonly borderMaterial: THREE.MeshBasicMaterial;
  private meshes = new Map<ModelId, THREE.InstancedMesh>();
  private placed: Placed[] = [];
  private labels = new Map<number, HTMLDivElement>();
  private readonly tmp = new THREE.Matrix4();
  private readonly v = new THREE.Vector3();
  private territoryKey: number[] | null = null;
  private exploredKey = '';

  constructor(
    private readonly models: ModelSet,
    fog: FogUniforms,
    private readonly mapWidth: number,
    private readonly labelLayer: HTMLElement | null,
    private readonly onCityClick: (id: number) => void,
  ) {
    this.material = makeInstancedMaterial();
    applyFog(this.material, fog, true);
    this.borderMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    applyFog(this.borderMaterial, fog, false);
    this.group.add(this.borders);
  }

  private mesh(id: ModelId, need: number): THREE.InstancedMesh {
    let m = this.meshes.get(id);
    if (!m || m.instanceMatrix.count < need) {
      if (m) {
        this.group.remove(m);
        m.dispose();
      }
      const capacity = Math.max(16, need * 2);
      m = new THREE.InstancedMesh(this.models[id], this.material, capacity);
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
      this.meshes.set(id, m);
      this.group.add(m);
    }
    return m;
  }

  setCities(state: GameState, rules: Rules, human: number, hf: HeightField, info: Map<number, CityLabelInfo>): void {
    const player = state.players[human]!;
    const half = state.map.width >> 1;
    const next: Placed[] = [];
    const seen = new Set<number>();
    for (const c of Object.values(state.cities).sort((a, b) => a.id - b.id)) {
      if (c.owner !== human && !isExplored(player, c.tile)) continue;
      const z = Math.floor(c.tile / half);
      const x = 2 * (c.tile % half) + (z & 1);
      const owner = state.players[c.owner]!;
      seen.add(c.id);
      next.push({ city: c, model: cityModel(rules, owner.era, c.size), color: new THREE.Color(owner.color), x, z, label: this.label(c, owner.color, c.owner === human, info.get(c.id)) });
    }
    for (const [id, el] of this.labels) {
      if (!seen.has(id)) {
        el.remove();
        this.labels.delete(id);
      }
    }
    this.placed = next;
    this.buildBorders(state, human, hf);
  }

  private label(c: City, color: string, mine: boolean, info: CityLabelInfo | undefined): HTMLDivElement {
    let el = this.labels.get(c.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'city-label';
      el.addEventListener('click', () => this.onCityClick(c.id));
      this.labelLayer?.appendChild(el);
      this.labels.set(c.id, el);
    }
    el.classList.toggle('mine', mine);
    el.classList.toggle('disorder', !!info?.disorder);
    el.classList.toggle('celebrating', !!info?.celebrating);
    el.style.setProperty('--owner', color);
    const prod = info && mine ? `<span class="prod">${escapeHtml(info.production)}${info.turns !== null ? ` · ${info.turns}` : ''}</span>` : '';
    const grow = info && mine && info.growth !== null ? `<span class="grow ${info.growth < 0 ? 'starve' : ''}" title="${info.growth > 0 ? 'Grows' : 'Starves'} in ${Math.abs(info.growth)} turns">${Math.abs(info.growth)}</span>` : '';
    el.innerHTML = `<span class="size">${c.size}</span><span class="name">${escapeHtml(c.name)}</span>${grow}${prod}`;
    return el;
  }

  /** Coloured ribbons just inside each border edge, rebuilt when territory or exploration changes. */
  private buildBorders(state: GameState, human: number, hf: HeightField): void {
    const m = state.map;
    const player = state.players[human]!;
    const exploredKey = player.explored.join(',');
    if (this.territoryKey === m.territory && this.exploredKey === exploredKey) return;
    this.territoryKey = m.territory;
    this.exploredKey = exploredKey;
    for (const child of [...this.borders.children]) {
      this.borders.remove(child);
      (child as THREE.Mesh).geometry.dispose();
    }
    const half = m.width >> 1;
    const pos: number[] = [];
    const col: number[] = [];
    const colors = state.players.map((p) => new THREE.Color(p.color));
    const height = (x: number, z: number) => Math.max(hf.heightAt(x, z), 0.02) + 0.05;
    for (let t = 0; t < m.territory.length; t++) {
      const owner = m.territory[t]!;
      if (owner < 0 || !isExplored(player, t)) continue;
      const z = Math.floor(t / half);
      const x = 2 * (t % half) + (z & 1);
      for (const [dir, a, b] of EDGES) {
        const nx = x + DIR_DX[dir]!;
        const nz = z + DIR_DZ[dir]!;
        let other = -1;
        if (nz >= 0 && nz < m.height) {
          const wx = ((nx % m.width) + m.width) % m.width;
          other = m.territory[nz * half + (wx >> 1)]!;
        }
        if (other === owner) continue;
        // Quad from the edge inward by 0.14 toward the tile centre.
        const ax = x + a[0];
        const az = z + a[1];
        const bx = x + b[0];
        const bz = z + b[1];
        const inset = 0.14;
        const aix = ax + (x - ax) * inset;
        const aiz = az + (z - az) * inset;
        const bix = bx + (x - bx) * inset;
        const biz = bz + (z - bz) * inset;
        const c = colors[owner]!;
        const quad = [ax, az, bx, bz, bix, biz, ax, az, bix, biz, aix, aiz];
        for (let k = 0; k < 6; k++) {
          const px = quad[k * 2]!;
          const pz = quad[k * 2 + 1]!;
          pos.push(px, height(px, pz), pz);
          col.push(c.r, c.g, c.b);
        }
      }
    }
    if (pos.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    for (const offset of [-1, 0, 1]) {
      const mesh = new THREE.Mesh(geo, this.borderMaterial);
      mesh.position.x = offset * this.mapWidth;
      mesh.renderOrder = 1;
      mesh.frustumCulled = false;
      this.borders.add(mesh);
    }
  }

  /** Per frame: models in the camera's copy of the world, labels projected to the screen. */
  update(hf: HeightField, camera: THREE.PerspectiveCamera, cameraX: number, distance: number, canvas: HTMLCanvasElement): void {
    const W = this.mapWidth;
    const counts = new Map<ModelId, number>();
    for (const p of this.placed) counts.set(p.model, (counts.get(p.model) ?? 0) + 1);
    for (const [id, n] of counts) this.mesh(id, n);
    const used = new Map<ModelId, number>();
    const rect = canvas.getBoundingClientRect();
    const base = Math.floor(cameraX / W) * W;
    this.borders.position.x = base;
    const showLabels = distance < 90;
    for (const p of this.placed) {
      const wx = p.x + Math.round((cameraX - p.x) / W) * W;
      const ground = Math.max(hf.heightAt(wx, p.z), 0);
      const mesh = this.meshes.get(p.model)!;
      const i = used.get(p.model) ?? 0;
      used.set(p.model, i + 1);
      this.tmp.makeTranslation(wx, ground, p.z);
      mesh.setMatrixAt(i, this.tmp);
      mesh.setColorAt(i, p.color);
      // Name plate above the city.
      this.v.set(wx, ground + 0.9, p.z + 0.9).project(camera);
      const visible = showLabels && this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      p.label.style.display = visible ? '' : 'none';
      if (visible) {
        const sx = ((this.v.x + 1) / 2) * rect.width;
        const sy = ((1 - this.v.y) / 2) * rect.height;
        p.label.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, 0)`;
        p.label.classList.toggle('compact', distance > 40);
      }
    }
    for (const [id, mesh] of this.meshes) {
      mesh.count = used.get(id) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const el of this.labels.values()) el.remove();
    this.labels.clear();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
