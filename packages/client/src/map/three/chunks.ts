/**
 * The map split into square chunks. Each chunk owns its terrain mesh, river ribbons,
 * roads and map dressing (trees, mines, villages, resource tokens), so the renderer can
 * cull, rebuild and wrap them independently. Wrapping east–west: each chunk is placed
 * at whichever copy of the world (offset -W, 0 or +W) lies closest to the camera.
 */
import * as THREE from 'three';
import {
  cityAt,
  FLAG_CAMP,
  FLAG_HUT,
  IMP_CRATER,
  IMP_MINE,
  IMP_FORTRESS,
  IMP_BARRICADE,
  IMP_RAIL,
  IMP_ROAD,
  isExplored,
  neighbour,
  type GameState,
  type Rules,
} from '@civolution/engine';
import { HeightField } from './heights.ts';
import type { ModelId, ModelSet } from './models.ts';

export const CHUNK = 32;
const ICON_QUAD = new THREE.PlaneGeometry(1, 1);

interface DressingMaterials {
  dressing: THREE.Material;
  road: THREE.Material;
  river: THREE.Material;
  terrain: THREE.Material;
  token: THREE.Material;
  /** Billboard materials for resources whose icon art exists, by resource id. */
  icons: Map<string, THREE.Material>;
}

function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export class Chunk {
  readonly group = new THREE.Group();
  private dressing = new THREE.Group();
  private terrainMesh: THREE.Mesh | null = null;
  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly x1: number,
    readonly z1: number,
  ) {
    this.group.add(this.dressing);
  }

  get centerX(): number {
    return (this.x0 + this.x1) / 2;
  }

  buildTerrain(hf: HeightField, sub: number, mats: DressingMaterials): void {
    if (this.terrainMesh) {
      this.group.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
    }
    const nx = (this.x1 - this.x0) * sub + 1;
    const nz = (this.z1 - this.z0) * sub + 1;
    // Heights with a one-vertex border so normals match across chunk seams.
    const bw = nx + 2;
    const hs = new Float32Array(bw * (nz + 2));
    for (let j = -1; j <= nz; j++) {
      for (let i = -1; i <= nx; i++) {
        hs[(j + 1) * bw + (i + 1)] = hf.heightAt(this.x0 + i / sub, this.z0 + j / sub);
      }
    }
    const pos = new Float32Array(nx * nz * 3);
    const nrm = new Float32Array(nx * nz * 3);
    const step = 1 / sub;
    const n = new THREE.Vector3();
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const h = hs[(j + 1) * bw + (i + 1)]!;
        pos[k * 3] = this.x0 + i * step;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = this.z0 + j * step;
        const hl = hs[(j + 1) * bw + i]!;
        const hr = hs[(j + 1) * bw + i + 2]!;
        const hd = hs[j * bw + i + 1]!;
        const hu = hs[(j + 2) * bw + i + 1]!;
        n.set(hl - hr, 2 * step, hd - hu).normalize();
        nrm[k * 3] = n.x;
        nrm[k * 3 + 1] = n.y;
        nrm[k * 3 + 2] = n.z;
      }
    }
    const index = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let p = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        index[p++] = a; index[p++] = c; index[p++] = b;
        index[p++] = b; index[p++] = c; index[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    this.terrainMesh = new THREE.Mesh(geo, mats.terrain);
    this.terrainMesh.receiveShadow = true;
    this.group.add(this.terrainMesh);
  }

  buildDressing(state: GameState, rules: Rules, human: number, hf: HeightField, models: ModelSet, mats: DressingMaterials): void {
    for (const child of [...this.dressing.children]) {
      this.dressing.remove(child);
      const m = child as THREE.Mesh;
      if (!(m instanceof THREE.InstancedMesh)) m.geometry.dispose();
      if (m instanceof THREE.InstancedMesh) m.dispose();
    }
    const map = state.map;
    const player = state.players[human]!;
    const T = rules.t;
    const placements = new Map<ModelId, THREE.Matrix4[]>();
    const put = (id: ModelId, x: number, z: number, scale: number, rot: number) => {
      const y = hf.heightAt(x, z);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y - 0.01, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
        new THREE.Vector3(scale, scale, scale),
      );
      const list = placements.get(id);
      if (list) list.push(m);
      else placements.set(id, [m]);
    };
    const roads: number[] = [];
    const roadColors: number[] = [];
    const tokens: { x: number; z: number; color: THREE.Color; id: string }[] = [];
    const half = map.width >> 1;
    for (let z = this.z0; z < this.z1 && z < map.height; z++) {
      for (let x = this.x0 + ((this.x0 + z) & 1); x < this.x1; x += 2) {
        const tile = z * half + (x >> 1);
        if (!isExplored(player, tile)) continue;
        const terrain = map.terrain[tile]!;
        const r = rand(tile * 2654435761 + 7);
        // Points inside the diamond: rotated local coordinates in [-0.4, 0.4].
        const spot = (margin = 0.38) => {
          const a = (r() * 2 - 1) * margin;
          const b = (r() * 2 - 1) * margin;
          return [x + a - b, z + a + b] as const;
        };
        const lat = Math.abs((2 * z) / map.height - 1);
        const imp = map.improvements[tile]!;
        // A city stands here: its model replaces trees, mines and tokens.
        const city = cityAt(state, tile) !== undefined;
        if (city) {
          // nothing but roads
        } else if (terrain === T['forest']) {
          const cold = map.underlying[tile] === T['tundra'] || lat > 0.55;
          for (let k = 0; k < 6; k++) {
            const [px, pz] = spot();
            put(cold || r() < 0.3 ? 'pine' : 'broadleaf', px, pz, 0.8 + r() * 0.45, r() * 6.28);
          }
        } else if (terrain === T['jungle']) {
          for (let k = 0; k < 6; k++) {
            const [px, pz] = spot();
            put(r() < 0.6 ? 'jungle' : 'palm', px, pz, 0.85 + r() * 0.4, r() * 6.28);
          }
        } else if (terrain === T['marsh']) {
          for (let k = 0; k < 4; k++) {
            const [px, pz] = spot(0.4);
            put('reed', px, pz, 0.9 + r() * 0.5, r() * 6.28);
          }
        } else if ((terrain === T['grassland'] || terrain === T['plains']) && r() < 0.2) {
          const [px, pz] = spot();
          put(lat > 0.5 ? 'pine' : 'broadleaf', px, pz, 0.7 + r() * 0.3, r() * 6.28);
        } else if (terrain === T['desert'] && map.resource[tile] === rules.resources.findIndex((x) => x.id === 'oasis')) {
          for (let k = 0; k < 3; k++) {
            const [px, pz] = spot(0.25);
            put('palm', px, pz, 0.8 + r() * 0.3, r() * 6.28);
          }
        }
        if (imp & IMP_MINE && !city) put('mine', x + 0.15, z - 0.1, 1, r() * 6.28);
        if (map.flags[tile]! & FLAG_HUT) put('village', x, z, 1, r() * 6.28);
        if (map.flags[tile]! & FLAG_CAMP) put('civ_barbarian_camp', x, z, 1, r() * 6.28);
        if (imp & IMP_CRATER && !city) put('civ_fx_crater', x, z, 1, r() * 6.28);
        // A barricade is built on a fortress and replaces its look.
        if (imp & IMP_BARRICADE && !city) put('barricade', x, z, 1, r() * 6.28);
        else if (imp & IMP_FORTRESS && !city) put('fortress', x, z, 1, Math.floor(r() * 4) * (Math.PI / 2));
        const res = map.resource[tile]!;
        if (res >= 0 && !city) {
          const rule = rules.resources[res]!;
          if (!rule.revealedBy || player.techs.includes(rule.revealedBy)) {
            const color = new THREE.Color(rule.kind === 'bonus' ? '#7dd36a' : rule.kind === 'luxury' ? '#c47ae6' : '#f0a640');
            tokens.push({ x: x - 0.32, z: z + 0.32, color, id: rule.id });
          }
        }
        if (imp & IMP_ROAD) {
          const rail = (imp & IMP_RAIL) !== 0;
          const color = rail ? [0.22, 0.21, 0.2] : [0.5, 0.39, 0.25];
          const width = rail ? 0.09 : 0.075;
          let linked = 0;
          for (let dir = 0; dir < 8; dir++) {
            const nb = neighbour(map, tile, dir);
            if (nb < 0 || !(map.improvements[nb]! & IMP_ROAD)) continue;
            linked++;
            const dx = [0, 1, 2, 1, 0, -1, -2, -1][dir]!;
            const dz = [-2, -1, 0, 1, 2, 1, 0, -1][dir]!;
            ribbon(roads, roadColors, hf, x, z, x + dx * 0.5, z + dz * 0.5, width, color, 0.03);
          }
          if (linked === 0) ribbon(roads, roadColors, hf, x - 0.2, z, x + 0.2, z, width, color, 0.03);
        }
      }
    }
    for (const [id, list] of placements) {
      const mesh = new THREE.InstancedMesh(models[id], mats.dressing, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.dressing.add(mesh);
    }
    if (roads.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(roads, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(roadColors, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mats.road);
      mesh.receiveShadow = true;
      this.dressing.add(mesh);
    }
    const plain = tokens.filter((t) => !mats.icons.has(t.id));
    if (plain.length > 0) {
      const disc = new THREE.CylinderGeometry(0.11, 0.11, 0.04, 16);
      const mesh = new THREE.InstancedMesh(disc, mats.token, plain.length);
      plain.forEach((t, i) => {
        mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(t.x, hf.heightAt(t.x, t.z) + 0.04, t.z));
        mesh.setColorAt(i, t.color);
      });
      mesh.computeBoundingSphere();
      this.dressing.add(mesh);
    }
    const byIcon = new Map<string, typeof tokens>();
    for (const t of tokens) if (mats.icons.has(t.id)) byIcon.set(t.id, [...(byIcon.get(t.id) ?? []), t]);
    for (const [id, list] of byIcon) {
      const mesh = new THREE.InstancedMesh(ICON_QUAD, mats.icons.get(id), list.length);
      list.forEach((t, i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(t.x, Math.max(hf.heightAt(t.x, t.z), 0) + 0.3, t.z)));
      mesh.computeBoundingSphere();
      mesh.renderOrder = 5;
      this.dressing.add(mesh);
    }
    this.buildRivers(hf, mats);
  }

  private buildRivers(hf: HeightField, mats: DressingMaterials): void {
    const pos: number[] = [];
    const along: number[] = [];
    const across: number[] = [];
    const W = hf.width;
    const half = 0.075;
    for (const line of hf.riverLines) {
      let dist = 0;
      for (let k = 0; k + 1 < line.length; k++) {
        const [ax, az] = line[k]!;
        const [bx, bz] = line[k + 1]!;
        const len = Math.hypot(bx - ax, bz - az);
        const mx = ((((ax + bx) / 2) % W) + W) % W;
        const mz = (az + bz) / 2;
        const d0 = dist;
        dist += len;
        if (mx < this.x0 || mx >= this.x1 || mz < this.z0 || mz >= this.z1) continue;
        const shift = (ax + bx) / 2 - mx;
        const p0x = ax - shift;
        const p1x = bx - shift;
        // Widen slightly downstream, extend a little so joints overlap.
        const ox = (-(bz - az) / len) * half;
        const oz = ((bx - ax) / len) * half;
        const ex = ((bx - ax) / len) * 0.02;
        const ez = ((bz - az) / len) * 0.02;
        const h0 = Math.max(hf.heightAt(p0x, az), -0.02) + 0.03;
        const h1 = Math.max(hf.heightAt(p1x, bz), -0.02) + 0.03;
        const q = [
          [p0x - ex - ox, h0, az - ez - oz, d0, -1], [p1x + ex - ox, h1, bz + ez - oz, dist, -1], [p1x + ex + ox, h1, bz + ez + oz, dist, 1],
          [p0x - ex - ox, h0, az - ez - oz, d0, -1], [p1x + ex + ox, h1, bz + ez + oz, dist, 1], [p0x - ex + ox, h0, az - ez + oz, d0, 1],
        ];
        for (const v of q) {
          pos.push(v[0]!, v[1]!, v[2]!);
          along.push(v[3]!);
          across.push(v[4]!);
        }
      }
    }
    if (pos.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    geo.setAttribute('across', new THREE.Float32BufferAttribute(across, 1));
    geo.computeBoundingSphere();
    this.dressing.add(new THREE.Mesh(geo, mats.river));
  }

  dispose(): void {
    this.terrainMesh?.geometry.dispose();
    for (const c of this.dressing.children) {
      if (c instanceof THREE.InstancedMesh) c.dispose();
      else (c as THREE.Mesh).geometry.dispose();
    }
  }
}

function ribbon(out: number[], colors: number[], hf: HeightField, ax: number, az: number, bx: number, bz: number, width: number, color: number[], lift: number): void {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  const ox = (-dz / len) * width;
  const oz = (dx / len) * width;
  const steps = 3;
  for (let s = 0; s < steps; s++) {
    const t0 = s / steps;
    const t1 = (s + 1) / steps;
    const p0x = ax + dx * t0;
    const p0z = az + dz * t0;
    const p1x = ax + dx * t1;
    const p1z = az + dz * t1;
    const h0 = hf.heightAt(p0x, p0z) + lift;
    const h1 = hf.heightAt(p1x, p1z) + lift;
    out.push(p0x - ox, h0, p0z - oz, p1x + ox, h1, p1z + oz, p1x - ox, h1, p1z - oz);
    out.push(p0x - ox, h0, p0z - oz, p0x + ox, h0, p0z + oz, p1x + ox, h1, p1z + oz);
    for (let k = 0; k < 6; k++) colors.push(color[0]!, color[1]!, color[2]!);
  }
}

export function makeChunks(width: number, height: number): Chunk[] {
  const out: Chunk[] = [];
  for (let z = 0; z < height; z += CHUNK) {
    for (let x = 0; x < width; x += CHUNK) {
      out.push(new Chunk(x, z, Math.min(width, x + CHUNK), Math.min(height, z + CHUNK)));
    }
  }
  return out;
}

export function chunkOfTile(chunks: Chunk[], width: number, x: number, z: number): Chunk | undefined {
  const cols = Math.ceil(width / CHUNK);
  return chunks[Math.floor(z / CHUNK) * cols + Math.floor(x / CHUNK)];
}

export type { DressingMaterials };
