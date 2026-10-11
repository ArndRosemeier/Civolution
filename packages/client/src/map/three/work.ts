/**
 * Workers at work: while a unit has a terrain job it swings its tools in a steady
 * rhythm (wind up, strike, recover), and every strike throws up a few bits of earth,
 * stone, wood or water depending on the job. Purely visual; off with "Reduce motion".
 */
import * as THREE from 'three';
import type { HeightField } from './heights.ts';

/** Seconds per swing. */
export const SWING_PERIOD = 1.15;
/** Where in the swing the tool hits the ground (fraction of the period). */
export const STRIKE_AT = 0.62;

/** Body pose at a point in the swing: forward lean (radians) and vertical offset. */
export function swingPose(f: number): { lean: number; dip: number } {
  const ease = (t: number) => t * t * (3 - 2 * t);
  f -= Math.floor(f);
  if (f < 0.5) {
    // Wind up: lean back and rise a little.
    const t = ease(f / 0.5);
    return { lean: -0.14 * t, dip: 0.012 * t };
  }
  if (f < STRIKE_AT) {
    // Strike: a fast swing forward and down.
    const t = (f - 0.5) / (STRIKE_AT - 0.5);
    const k = t * t;
    return { lean: -0.14 + 0.52 * k, dip: 0.012 - 0.04 * k };
  }
  if (f < 0.72) return { lean: 0.38, dip: -0.028 };
  // Recover to standing.
  const t = ease((f - 0.72) / 0.28);
  return { lean: 0.38 * (1 - t), dip: -0.028 * (1 - t) };
}

/** Phase of a unit's swing at `time`; units are out of step with each other. */
export function swingPhase(unitId: number, time: number): number {
  return time / SWING_PERIOD + ((unitId * 0.618034) % 1);
}

/** Colours of what a strike throws up, per job: [main, accent]. */
const DEBRIS: Record<string, readonly [number, number]> = {
  road: [0x9c8461, 0x7d725f],
  railroad: [0x8a8070, 0x5c5a58],
  irrigation: [0x6b4a2b, 0x5aa0d8],
  mine: [0x8d8d8d, 0xffcf6a],
  fortress: [0x9a8a6e, 0x77736c],
  barricade: [0x8f7c5e, 0x6e6a62],
  clearForest: [0xc9a36b, 0x4f7a3a],
  plantForest: [0x5b3f24, 0x5e8f3e],
  clearWetlands: [0x4e4630, 0x6aa0b0],
  clearDamage: [0x6f6f6f, 0x8a7a5a],
};
const DEFAULT_DEBRIS: readonly [number, number] = [0x7a5a36, 0x9c8461];

export function debrisColours(job: string): readonly [number, number] {
  return DEBRIS[job] ?? DEFAULT_DEBRIS;
}

interface Bit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  color: THREE.Color;
}

const CAPACITY = 600;
const GRAVITY = 3.4;

/** The bits thrown up by strikes, drawn as one instanced mesh. */
export class DebrisLayer {
  readonly mesh: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private readonly tmp = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  constructor() {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  /** One strike at (x, y, z), thrown roughly along `heading`. */
  strike(x: number, y: number, z: number, heading: number, job: string): void {
    const [main, accent] = debrisColours(job);
    const n = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n && this.bits.length < CAPACITY; i++) {
      const a = heading + Math.PI + (Math.random() - 0.5) * 2.2;
      const out = 0.25 + Math.random() * 0.35;
      this.bits.push({
        x,
        y,
        z,
        vx: Math.sin(a) * out,
        vy: 0.7 + Math.random() * 0.6,
        vz: Math.cos(a) * out,
        age: 0,
        life: 0.45 + Math.random() * 0.25,
        size: 0.02 + Math.random() * 0.018,
        color: new THREE.Color(i % 3 === 2 ? accent : main),
      });
    }
  }

  update(dt: number, hf: HeightField): void {
    let n = 0;
    const keep: Bit[] = [];
    for (const b of this.bits) {
      b.age += dt;
      if (b.age >= b.life) continue;
      b.vy -= GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      const floor = Math.max(0, hf.heightAt(b.x, b.z));
      if (b.y < floor) {
        b.y = floor;
        b.vx *= 0.3;
        b.vz *= 0.3;
        b.vy = 0;
      }
      keep.push(b);
      const s = b.size * Math.sqrt(1 - b.age / b.life);
      this.euler.set(b.age * 9, b.age * 7, 0);
      this.tmp.compose(this.pos.set(b.x, b.y, b.z), this.q.setFromEuler(this.euler), this.scale.set(s, s, s));
      this.mesh.setMatrixAt(n, this.tmp);
      this.mesh.setColorAt(n, b.color);
      n++;
    }
    this.bits = keep;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.bits = [];
    this.mesh.count = 0;
  }
}
