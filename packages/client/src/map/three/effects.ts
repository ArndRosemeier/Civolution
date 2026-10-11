/**
 * Short-lived battle effects on the map: muzzle flashes and impacts, bombardment shells
 * flying in an arc, smoke, and the nuclear fireball with its shock ring. Purely visual;
 * a small pool of meshes is reused.
 */
import * as THREE from 'three';
import type { HeightField } from './heights.ts';

interface Effect {
  mesh: THREE.Mesh;
  kind: 'flash' | 'smoke' | 'shell' | 'ring' | 'fireball';
  age: number;
  life: number;
  size: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: THREE.Color;
}

const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const RING = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);

export class EffectLayer {
  readonly group = new THREE.Group();
  private live: Effect[] = [];
  private pool: THREE.Mesh[] = [];

  constructor(private readonly mapWidth: number) {}

  private mesh(geo: THREE.BufferGeometry, color: THREE.Color, additive: boolean): THREE.Mesh {
    let m = this.pool.pop();
    if (!m) {
      m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      m.renderOrder = 5;
    }
    m.geometry = geo;
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.copy(color);
    mat.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.opacity = 1;
    m.visible = true;
    this.group.add(m);
    return m;
  }

  private add(kind: Effect['kind'], at: THREE.Vector3, life: number, size: number, color: number, to?: THREE.Vector3): void {
    const c = new THREE.Color(color);
    const geo = kind === 'ring' ? RING : SPHERE;
    const mesh = this.mesh(geo, c, kind !== 'smoke');
    mesh.position.copy(at);
    mesh.scale.setScalar(0.001);
    this.live.push({ mesh, kind, age: 0, life, size, from: at.clone(), to: (to ?? at).clone(), color: c });
  }

  private ground(hf: HeightField, x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, Math.max(0, hf.heightAt(x, z)) + 0.25, z);
  }

  /** A clash on a tile: flashes and a puff of smoke. */
  clash(hf: HeightField, x: number, z: number, heavy: boolean): void {
    const p = this.ground(hf, x, z);
    this.add('flash', p, 0.35, heavy ? 0.45 : 0.28, 0xffd27a);
    this.add('flash', p.clone().add(new THREE.Vector3(0.15, 0.05, -0.1)), 0.5, heavy ? 0.3 : 0.18, 0xff9a3c);
    this.add('smoke', p.clone().add(new THREE.Vector3(0, 0.1, 0)), 1.6, heavy ? 0.5 : 0.32, 0x6f6a64);
  }

  /** A shell from one tile to another, bursting on arrival. */
  shell(hf: HeightField, fx: number, fz: number, tx: number, tz: number): void {
    let x1 = tx;
    if (x1 - fx > this.mapWidth / 2) x1 -= this.mapWidth;
    if (fx - x1 > this.mapWidth / 2) x1 += this.mapWidth;
    this.add('shell', this.ground(hf, fx, fz), 0.7, 0.07, 0xfff0b0, this.ground(hf, x1, tz));
  }

  /** The fireball, shock ring and rising smoke of a nuclear strike. */
  nuke(hf: HeightField, x: number, z: number): void {
    const p = this.ground(hf, x, z);
    this.add('fireball', p, 2.6, 2.2, 0xffe2a0);
    this.add('ring', p.clone().setY(p.y - 0.15), 2.2, 4.5, 0xffb060);
    this.add('smoke', p.clone().add(new THREE.Vector3(0, 0.8, 0)), 5, 1.8, 0x5a524c);
    this.add('smoke', p.clone().add(new THREE.Vector3(0, 1.9, 0)), 5.5, 2.4, 0x4c4642);
  }

  update(dt: number, cameraX: number): void {
    const keep: Effect[] = [];
    const current = this.live;
    // Effects spawned during the loop (a shell's burst) land in this.live.
    this.live = [];
    for (const e of current) {
      e.age += dt;
      const t = Math.min(1, e.age / e.life);
      const mat = e.mesh.material as THREE.MeshBasicMaterial;
      const wrap = Math.round((cameraX - e.from.x) / this.mapWidth) * this.mapWidth;
      switch (e.kind) {
        case 'flash':
          e.mesh.scale.setScalar(e.size * (0.4 + t));
          mat.opacity = 1 - t;
          e.mesh.position.set(e.from.x + wrap, e.from.y, e.from.z);
          break;
        case 'smoke':
          e.mesh.scale.setScalar(e.size * (0.3 + t * 0.9));
          mat.opacity = 0.55 * (1 - t);
          e.mesh.position.set(e.from.x + wrap, e.from.y + t * e.size * 0.8, e.from.z);
          break;
        case 'shell': {
          const x = e.from.x + (e.to.x - e.from.x) * t;
          const z = e.from.z + (e.to.z - e.from.z) * t;
          const y = e.from.y + (e.to.y - e.from.y) * t + Math.sin(Math.PI * t) * 1.2;
          e.mesh.position.set(x + wrap, y, z);
          e.mesh.scale.setScalar(e.size);
          if (t >= 1) {
            this.add('flash', e.to, 0.4, 0.4, 0xffc070);
            this.add('smoke', e.to.clone().add(new THREE.Vector3(0, 0.1, 0)), 1.4, 0.35, 0x6a6560);
          }
          break;
        }
        case 'ring':
          e.mesh.scale.setScalar(e.size * t);
          mat.opacity = 0.9 * (1 - t);
          e.mesh.position.set(e.from.x + wrap, e.from.y, e.from.z);
          break;
        case 'fireball':
          e.mesh.scale.setScalar(e.size * Math.min(1, t * 3) * (1 - t * 0.3));
          mat.color.copy(e.color).lerp(new THREE.Color(0xff5a20), t);
          mat.opacity = 1 - t * t;
          e.mesh.position.set(e.from.x + wrap, e.from.y + t * 1.5, e.from.z);
          break;
      }
      if (t >= 1) {
        e.mesh.visible = false;
        this.group.remove(e.mesh);
        this.pool.push(e.mesh);
      } else keep.push(e);
    }
    this.live = [...keep, ...this.live];
  }

  dispose(): void {
    for (const m of [...this.pool, ...this.live.map((e) => e.mesh)]) (m.material as THREE.Material).dispose();
  }
}
