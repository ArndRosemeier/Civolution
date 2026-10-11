/**
 * Units on the map: one instanced mesh per model, team colour per instance, smooth
 * movement between tiles, a team-coloured base ring, and flat icons at strategic zoom
 * so a Huge map stays readable (PLAN.md §10.1).
 */
import * as THREE from 'three';
import type { GameState, Rules, Unit } from '@civolution/engine';
import { applyFog, type FogUniforms } from './fog.ts';
import type { HeightField } from './heights.ts';
import { makeInstancedMaterial, MODELS, unitModel, type ModelId, type ModelSet } from './models.ts';

interface Shown {
  unit: Unit;
  model: ModelId;
  color: THREE.Color;
  /** Displayed position (unwrapped map coordinates) and target. */
  x: number;
  z: number;
  tx: number;
  tz: number;
  heading: number;
  stackIndex: number;
  stackSize: number;
}

const ICON_DISTANCE = 42;

export class UnitLayer {
  readonly group = new THREE.Group();
  private meshes = new Map<ModelId, THREE.InstancedMesh>();
  private readonly material: THREE.MeshStandardMaterial;
  private readonly ringMesh: THREE.InstancedMesh;
  private readonly iconMesh: THREE.InstancedMesh;
  private readonly selection: THREE.Mesh;
  private shown = new Map<number, Shown>();
  private selected: number | null = null;
  private readonly tmp = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly models: ModelSet,
    fog: FogUniforms,
    private readonly mapWidth: number,
  ) {
    this.material = makeInstancedMaterial();
    applyFog(this.material, fog, true);
    const ringGeo = new THREE.RingGeometry(0.2, 0.27, 28).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
    this.ringMesh = new THREE.InstancedMesh(ringGeo, ringMat, 2048);
    this.ringMesh.frustumCulled = false;
    this.ringMesh.renderOrder = 2;
    const iconGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 6);
    const iconMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    this.iconMesh = new THREE.InstancedMesh(iconGeo, iconMat, 2048);
    this.iconMesh.frustumCulled = false;
    const selGeo = new THREE.RingGeometry(0.3, 0.38, 40).rotateX(-Math.PI / 2);
    this.selection = new THREE.Mesh(selGeo, new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, depthWrite: false }));
    this.selection.renderOrder = 3;
    this.selection.visible = false;
    this.group.add(this.ringMesh, this.iconMesh, this.selection);
  }

  private mesh(id: ModelId, need: number): THREE.InstancedMesh {
    let m = this.meshes.get(id);
    if (!m || m.instanceMatrix.count < need) {
      if (m) {
        this.group.remove(m);
        m.dispose();
      }
      const capacity = Math.max(64, need * 2);
      m = new THREE.InstancedMesh(this.models[id], this.material, capacity);
      m.frustumCulled = false;
      m.castShadow = true;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
      this.meshes.set(id, m);
      this.group.add(m);
    }
    return m;
  }

  setUnits(state: GameState, rules: Rules, visible: Uint8Array, human: number): void {
    const next = new Map<number, Shown>();
    const byTile = new Map<number, Unit[]>();
    for (const u of Object.values(state.units)) {
      if (u.owner !== human && !visible[u.tile]) continue;
      const list = byTile.get(u.tile);
      if (list) list.push(u);
      else byTile.set(u.tile, [u]);
    }
    const half = state.map.width >> 1;
    for (const [tile, list] of byTile) {
      list.sort((a, b) => (a.id === this.selected ? -1 : b.id === this.selected ? 1 : a.id - b.id));
      const z = Math.floor(tile / half);
      const x = 2 * (tile % half) + (z & 1);
      list.forEach((u, i) => {
        if (i >= 3) return;
        const prev = this.shown.get(u.id);
        const rule = rules.unit(u.type);
        const [ox, oz] = i === 0 ? [0, 0] : i === 1 ? [-0.28, -0.12] : [0.28, -0.12];
        const tx = x + ox;
        const tz = z + oz;
        let px = prev?.x ?? tx;
        // Follow wrap-arounds the short way.
        if (px - tx > this.mapWidth / 2) px -= this.mapWidth;
        if (tx - px > this.mapWidth / 2) px += this.mapWidth;
        let heading = prev?.heading ?? 0;
        if (prev && (Math.abs(prev.tx - tx) > 0.01 || Math.abs(prev.tz - tz) > 0.01)) heading = Math.atan2(tx - px, tz - prev.z);
        next.set(u.id, {
          unit: u,
          model: unitModel(u.type, rule.domain),
          color: new THREE.Color(state.players[u.owner]!.color),
          x: px,
          z: prev?.z ?? tz,
          tx,
          tz,
          heading,
          stackIndex: i,
          stackSize: list.length,
        });
      });
    }
    this.shown = next;
  }

  setSelected(id: number | null): void {
    this.selected = id;
  }

  /** Per frame: animate and lay out instances around the camera's copy of the world. */
  update(dt: number, hf: HeightField, cameraX: number, cameraDistance: number, time: number): void {
    const icons = cameraDistance > ICON_DISTANCE;
    const counts = new Map<ModelId, number>();
    for (const s of this.shown.values()) counts.set(s.model, (counts.get(s.model) ?? 0) + 1);
    for (const [id, n] of counts) this.mesh(id, n);
    const used = new Map<ModelId, number>();
    let rings = 0;
    const k = Math.min(1, dt * 9);
    const W = this.mapWidth;
    const iconScale = Math.min(3.2, cameraDistance / ICON_DISTANCE);
    this.selection.visible = false;
    for (const s of this.shown.values()) {
      s.x += (s.tx - s.x) * k;
      s.z += (s.tz - s.z) * k;
      let wx = s.x;
      wx += Math.round((cameraX - wx) / W) * W;
      const sea = MODELS[s.model].fit === 'length';
      const ground = sea ? 0.02 : hf.heightAt(wx, s.z);
      const bob = sea ? Math.sin(time * 1.6 + s.unit.id) * 0.015 : 0;
      if (icons) {
        if (s.stackIndex === 0) {
          this.tmp.compose(new THREE.Vector3(wx, Math.max(ground, 0) + 0.15, s.z), this.q.identity(), new THREE.Vector3(iconScale, 1, iconScale));
          this.iconMesh.setMatrixAt(rings, this.tmp);
          this.iconMesh.setColorAt(rings, s.color);
          rings++;
        }
      } else {
        const mesh = this.meshes.get(s.model)!;
        const i = used.get(s.model) ?? 0;
        used.set(s.model, i + 1);
        this.q.setFromAxisAngle(this.up, s.heading);
        const scale = s.unit.order?.type === 'sentry' ? 0.92 : 1;
        this.tmp.compose(new THREE.Vector3(wx, ground + bob, s.z), this.q, new THREE.Vector3(scale, scale, scale));
        mesh.setMatrixAt(i, this.tmp);
        mesh.setColorAt(i, s.color);
        if (s.stackIndex === 0) {
          this.tmp.compose(new THREE.Vector3(wx, Math.max(ground, 0) + 0.03, s.z), this.q.identity(), new THREE.Vector3(1, 1, 1));
          this.ringMesh.setMatrixAt(rings, this.tmp);
          this.ringMesh.setColorAt(rings, s.color);
          rings++;
        }
      }
      if (s.unit.id === this.selected) {
        this.selection.visible = true;
        const pulse = 1 + Math.sin(time * 5) * 0.08;
        this.selection.position.set(wx, Math.max(ground, 0) + 0.04, s.z);
        this.selection.scale.setScalar(pulse * (icons ? iconScale * 1.4 : 1));
      }
    }
    for (const [id, mesh] of this.meshes) {
      mesh.count = icons ? 0 : (used.get(id) ?? 0);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.ringMesh.count = icons ? 0 : rings;
    this.iconMesh.count = icons ? rings : 0;
    for (const m of [this.ringMesh, this.iconMesh]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  get unitCount(): number {
    return this.shown.size;
  }
}
