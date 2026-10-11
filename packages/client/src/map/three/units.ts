/**
 * Units on the map: one instanced mesh per model, team colour per instance, smooth
 * movement between tiles, a team-coloured base ring, and flat icons at strategic zoom
 * so a Huge map stays readable (PLAN.md §10.1).
 */
import * as THREE from 'three';
import { currentHp, maxHp, type GameEvent, type GameState, type Rules, type Unit } from '@civolution/engine';
import { applyFog, type FogUniforms } from './fog.ts';
import type { HeightField } from './heights.ts';
import { makeInstancedMaterial, MODELS, unitModel, type ModelId, type ModelSet } from './models.ts';
import { DebrisLayer, STRIKE_AT, swingPhase, swingPose } from './work.ts';

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
  /** Hit points left as a fraction of full health. */
  hp: number;
  domain: 'land' | 'sea' | 'air';
}

/** Aircraft hover over their base. */
const AIR_LIFT = 0.55;

function groundOf(s: { domain: 'land' | 'sea' | 'air'; model: ModelId }, hf: HeightField, x: number, z: number): number {
  if (s.domain === 'sea') return 0.02;
  const g = Math.max(0, hf.heightAt(x, z));
  return s.domain === 'air' ? g + AIR_LIFT : hf.heightAt(x, z);
}

interface Ghost extends Shown {
  /** Seconds since the unit fell. */
  t: number;
}

const ICON_DISTANCE = 42;
/** How far a unit lunges toward its target when it attacks, in tiles. */
const LUNGE = 0.42;

export class UnitLayer {
  /** Off when the player asks for less motion: workers then stand still. */
  static motion = true;
  readonly group = new THREE.Group();
  private meshes = new Map<ModelId, THREE.InstancedMesh>();
  private readonly material: THREE.MeshStandardMaterial;
  private readonly ringMesh: THREE.InstancedMesh;
  private readonly iconMesh: THREE.InstancedMesh;
  private readonly selection: THREE.Mesh;
  private shown = new Map<number, Shown>();
  private selected: number | null = null;
  private readonly hpBack: THREE.InstancedMesh;
  private readonly hpFill: THREE.InstancedMesh;
  private lunges = new Map<number, { dx: number; dz: number; t: number }>();
  private ghosts: Ghost[] = [];
  private readonly debris = new DebrisLayer();
  /** Per working unit: the swing it last struck in. */
  private strikes = new Map<number, number>();
  private readonly lean = new THREE.Quaternion();
  private readonly side = new THREE.Vector3(1, 0, 0);
  private readonly camQ = new THREE.Quaternion();
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
    const bar = new THREE.PlaneGeometry(1, 1);
    this.hpBack = new THREE.InstancedMesh(bar, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75, depthWrite: false, depthTest: false }), 1024);
    this.hpFill = new THREE.InstancedMesh(bar, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, depthTest: false }), 1024);
    for (const m of [this.hpBack, this.hpFill]) {
      m.frustumCulled = false;
      m.renderOrder = 6;
    }
    this.hpFill.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1024 * 3).fill(1), 3);
    this.hpBack.renderOrder = 6;
    this.hpFill.renderOrder = 7;
    this.group.add(this.ringMesh, this.iconMesh, this.selection, this.hpBack, this.hpFill, this.debris.mesh);
  }

  /** The camera's orientation, so health bars face the viewer. */
  setCameraQuaternion(q: THREE.Quaternion): void {
    this.camQ.copy(q);
  }

  /** Battle animation: attackers lunge at their target, the fallen sink away. Call before setUnits. */
  onEvents(events: readonly GameEvent[], state: GameState): void {
    const half = state.map.width >> 1;
    const pos = (tile: number) => {
      const z = Math.floor(tile / half);
      return [2 * (tile % half) + (z & 1), z] as const;
    };
    for (const e of events) {
      if (e.type === 'combat' || e.type === 'bombarded') {
        const id = e.type === 'combat' ? e.attacker : e.unit;
        const from = e.type === 'combat' ? e.from : e.from;
        const [fx, fz] = pos(from);
        let [tx, tz] = pos(e.tile);
        if (tx - fx > this.mapWidth / 2) tx -= this.mapWidth;
        if (fx - tx > this.mapWidth / 2) tx += this.mapWidth;
        const len = Math.hypot(tx - fx, tz - fz) || 1;
        const reach = e.type === 'combat' ? LUNGE : LUNGE * 0.3;
        this.lunges.set(id, { dx: ((tx - fx) / len) * reach, dz: ((tz - fz) / len) * reach, t: 0 });
      } else if (e.type === 'unitLost' && e.why !== 'formedArmy' && e.why !== 'upgraded') {
        const s = this.shown.get(e.unit);
        if (s) this.ghosts.push({ ...s, t: e.why === 'spent' ? 0.6 : 0 });
      }
    }
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
      // Cargo and army members travel inside their holder.
      if (u.carriedBy !== null) continue;
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
          hp: Math.min(1, currentHp(rules, state, u) / Math.max(1, maxHp(rules, state, u))),
          domain: rule.domain,
        });
      });
    }
    this.shown = next;
    for (const id of this.strikes.keys()) if (next.get(id)?.unit.order?.type !== 'work') this.strikes.delete(id);
  }

  setSelected(id: number | null): void {
    this.selected = id;
  }

  /** Per frame: animate and lay out instances around the camera's copy of the world. */
  update(dt: number, hf: HeightField, cameraX: number, cameraDistance: number, time: number): void {
    const icons = cameraDistance > ICON_DISTANCE;
    const counts = new Map<ModelId, number>();
    for (const s of this.shown.values()) counts.set(s.model, (counts.get(s.model) ?? 0) + 1);
    this.ghosts = this.ghosts.filter((g) => (g.t += dt) < 1.4);
    for (const g of this.ghosts) counts.set(g.model, (counts.get(g.model) ?? 0) + 1);
    for (const [id, l] of this.lunges) {
      l.t += dt * 2.4;
      if (l.t >= 1) this.lunges.delete(id);
    }
    let bars = 0;
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
      const lunge = this.lunges.get(s.unit.id);
      const push = lunge ? Math.sin(Math.PI * lunge.t) : 0;
      let wx = s.x + (lunge ? lunge.dx * push : 0);
      const wz = s.z + (lunge ? lunge.dz * push : 0);
      wx += Math.round((cameraX - wx) / W) * W;
      const ground = groundOf(s, hf, wx, wz);
      const bob = s.domain === 'sea' ? Math.sin(time * 1.6 + s.unit.id) * 0.015 : s.domain === 'air' ? Math.sin(time * 2 + s.unit.id) * 0.04 : 0;
      if (icons) {
        if (s.stackIndex === 0) {
          this.tmp.compose(new THREE.Vector3(wx, Math.max(ground, 0) + 0.15, wz), this.q.identity(), new THREE.Vector3(iconScale, 1, iconScale));
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
        let dip = 0;
        const order = s.unit.order;
        if (order?.type === 'work' && s.domain === 'land' && UnitLayer.motion) {
          const phase = swingPhase(s.unit.id, time);
          const pose = swingPose(phase);
          this.q.multiply(this.lean.setFromAxisAngle(this.side, pose.lean));
          dip = pose.dip;
          const swing = Math.floor(phase - STRIKE_AT);
          const last = this.strikes.get(s.unit.id);
          if (last !== undefined && last !== swing) {
            const reach = MODELS[s.model]!.size * 0.3;
            this.debris.strike(wx + Math.sin(s.heading) * reach, ground + 0.01, wz + Math.cos(s.heading) * reach, s.heading, order.job);
          }
          this.strikes.set(s.unit.id, swing);
        }
        this.tmp.compose(new THREE.Vector3(wx, ground + bob + dip, wz), this.q, new THREE.Vector3(scale, scale, scale));
        mesh.setMatrixAt(i, this.tmp);
        mesh.setColorAt(i, s.color);
        // Health bar over the front unit when it is hurt or selected.
        if (s.stackIndex === 0 && (s.hp < 0.999 || s.unit.id === this.selected) && bars < 1024) {
          const top = ground + MODELS[s.model]!.size * (MODELS[s.model]!.fit === 'height' ? 1.08 : 0.55) + 0.12;
          const w = 0.42;
          this.tmp.compose(new THREE.Vector3(wx, top, wz), this.camQ, new THREE.Vector3(w + 0.03, 0.075, 1));
          this.hpBack.setMatrixAt(bars, this.tmp);
          const f = Math.max(0.02, s.hp);
          // Shift the fill left so it shrinks from the right, in the camera's frame.
          const off = new THREE.Vector3(-(w * (1 - f)) / 2, 0, 0.001).applyQuaternion(this.camQ);
          this.tmp.compose(new THREE.Vector3(wx + off.x, top + off.y, wz + off.z), this.camQ, new THREE.Vector3(w * f, 0.05, 1));
          this.hpFill.setMatrixAt(bars, this.tmp);
          this.hpFill.setColorAt(bars, new THREE.Color(f > 0.66 ? 0x5fd36a : f > 0.34 ? 0xe8c547 : 0xe0553a));
          bars++;
        }
        if (s.stackIndex === 0) {
          this.tmp.compose(new THREE.Vector3(wx, Math.max(ground, 0) + 0.03, wz), this.q.identity(), new THREE.Vector3(1, 1, 1));
          this.ringMesh.setMatrixAt(rings, this.tmp);
          this.ringMesh.setColorAt(rings, s.color);
          rings++;
        }
      }
      if (s.unit.id === this.selected) {
        this.selection.visible = true;
        const pulse = 1 + Math.sin(time * 5) * 0.08;
        this.selection.position.set(wx, Math.max(ground, 0) + 0.04, wz);
        this.selection.scale.setScalar(pulse * (icons ? iconScale * 1.4 : 1));
      }
    }
    if (!icons) {
      for (const g of this.ghosts) {
        const mesh = this.meshes.get(g.model)!;
        const i = used.get(g.model) ?? 0;
        used.set(g.model, i + 1);
        let wx = g.x;
        wx += Math.round((cameraX - wx) / W) * W;
        const ground = groundOf(g, hf, wx, g.z);
        const f = Math.min(1, g.t / 1.4);
        this.q.setFromAxisAngle(this.up, g.heading);
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), f * 1.2);
        this.tmp.compose(new THREE.Vector3(wx, ground - f * 0.35, g.z), this.q.clone().multiply(tilt), new THREE.Vector3(1 - f * 0.6, 1 - f * 0.6, 1 - f * 0.6));
        mesh.setMatrixAt(i, this.tmp);
        mesh.setColorAt(i, new THREE.Color(g.color).lerp(new THREE.Color(0x222222), f));
      }
    }
    if (icons || !UnitLayer.motion) this.debris.clear();
    else this.debris.update(dt, hf);
    this.hpBack.count = icons ? 0 : bars;
    this.hpFill.count = icons ? 0 : bars;
    this.hpBack.instanceMatrix.needsUpdate = true;
    this.hpFill.instanceMatrix.needsUpdate = true;
    if (this.hpFill.instanceColor) this.hpFill.instanceColor.needsUpdate = true;
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
