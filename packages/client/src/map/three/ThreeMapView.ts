/**
 * The 3D map (three.js). See PLAN.md §10.1 and docs/rendering.md.
 */
import * as THREE from 'three';
import { buildCost, buildName, cityReport, isExplored, tileCount, type GameEvent, type Rules } from '@civolution/engine';
import type { MapSnapshot, MapStats, MapView } from '../MapView.ts';
import { StrategyCamera } from './camera.ts';
import { CityLayer, type CityLabelInfo } from './cities.ts';
import { MarkerLayer, type MapMarker } from './markers.ts';
import { Chunk, makeChunks, type DressingMaterials } from './chunks.ts';
import { applyFog, type FogUniforms } from './fog.ts';
import { HeightField } from './heights.ts';
import { loadResourceIcons, makeIconMaterial } from './icons.ts';
import { makeInstancedMaterial, type ModelSet } from './models.ts';
import { makeTerrainMaterial, type TerrainUniforms } from './terrainMaterial.ts';
import { EffectLayer } from './effects.ts';
import { UnitLayer } from './units.ts';
import { makeRiverMaterial, makeWaterMaterial, type WaterUniforms } from './waterMaterial.ts';

export interface ThreeMapOptions {
  /** Terrain vertices per map unit (3 default, 4 for high quality). */
  terrainDetail?: number;
  shadows?: boolean;
  /** Element that holds the city name plates (positioned over the canvas). */
  labelLayer?: HTMLElement;
  onCityClick?: (city: number) => void;
}

export class ThreeMapView implements MapView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly cam: StrategyCamera;
  private readonly sun: THREE.DirectionalLight;
  private chunks: Chunk[] = [];
  private hf: HeightField | null = null;
  private snapshot: MapSnapshot | null = null;
  private units: UnitLayer | null = null;
  private effects = new EffectLayer(1);
  private cities: CityLayer | null = null;
  private markers: MarkerLayer | null = null;
  private pendingMarkers: readonly MapMarker[] = [];
  private readonly labelLayer: HTMLElement | null;
  private readonly onCityClick: (city: number) => void;
  private water: THREE.Mesh[] = [];
  private readonly world = new THREE.Group();
  private readonly overlay = new THREE.Group();
  private readonly showcase = new THREE.Group();
  private hover: THREE.LineLoop;
  private pathLine: THREE.Line | null = null;
  private pathDots: THREE.InstancedMesh | null = null;
  private terrainUniforms!: TerrainUniforms;
  private waterUniforms!: WaterUniforms;
  private mats!: DressingMaterials;
  private fogData = new Uint8Array(1);
  private terrainData = new Uint8Array(4);
  private previous: { explored: number[]; improvements: number[]; terrain: number[]; flags: number[]; resource: number[] } | null = null;
  private frameTimes: number[] = [];
  private last = performance.now();
  private time = 0;
  private raf = 0;
  private hoverTile: number | null = null;
  private disposed = false;
  private readonly detail: number;
  private grid = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly rules: Rules,
    private readonly models: ModelSet,
    options: ThreeMapOptions = {},
  ) {
    this.detail = options.terrainDetail ?? 3;
    this.labelLayer = options.labelLayer ?? null;
    this.onCityClick = options.onCityClick ?? (() => undefined);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = options.shadows ?? true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color('#06090d');
    this.cam = new StrategyCamera(1);
    const hemi = new THREE.HemisphereLight('#cfe0ff', '#4a3b2a', 1.1);
    this.sun = new THREE.DirectionalLight('#fff1dc', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(hemi, this.sun, this.sun.target, this.world, this.overlay);
    this.world.add(this.showcase);
    const hoverGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 16 }, () => new THREE.Vector3()));
    this.hover = new THREE.LineLoop(hoverGeo, new THREE.LineBasicMaterial({ color: '#fff7d0', transparent: true, opacity: 0.9, depthTest: false }));
    this.hover.renderOrder = 10;
    this.hover.visible = false;
    this.overlay.add(this.hover);
    this.resize();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.cam.camera.aspect = w / h;
    this.cam.camera.updateProjectionMatrix();
  }

  get camera(): StrategyCamera {
    return this.cam;
  }

  setGame(snapshot: MapSnapshot): void {
    const { state } = snapshot;
    const { width: W, height: H } = state.map;
    for (const c of this.chunks) {
      this.world.remove(c.group);
      c.dispose();
    }
    for (const w of this.water) this.world.remove(w);
    if (this.units) this.world.remove(this.units.group);
    this.world.remove(this.effects.group);
    this.effects.dispose();
    this.effects = new EffectLayer(W);
    this.world.add(this.effects.group);
    if (this.cities) {
      this.world.remove(this.cities.group);
      this.cities.dispose();
    }
    this.hf = new HeightField(state.map, this.rules);
    const mapSize = new THREE.Vector2(W, H);
    this.fogData = new Uint8Array(W * H);
    const fogTex = new THREE.DataTexture(this.fogData, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    fogTex.magFilter = THREE.LinearFilter;
    fogTex.minFilter = THREE.LinearFilter;
    fogTex.wrapS = THREE.RepeatWrapping;
    fogTex.needsUpdate = true;
    this.terrainData = new Uint8Array(W * H * 4);
    const terrainTex = new THREE.DataTexture(this.terrainData, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    terrainTex.magFilter = THREE.NearestFilter;
    terrainTex.minFilter = THREE.NearestFilter;
    terrainTex.needsUpdate = true;
    const depthData = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) depthData[y * W + x] = Math.round(THREE.MathUtils.clamp(-this.hf.heightAt(x, y) / 0.85, 0, 1) * 255);
    // Soften the depth field so shallows fade out gradually instead of in tile-shaped steps.
    for (let pass = 0; pass < 2; pass++) {
      const src = depthData.slice();
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let sum = 0;
          let cnt = 0;
          for (let dy = -2; dy <= 2; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= H) continue;
            for (let dx = -2; dx <= 2; dx++) {
              sum += src[yy * W + ((x + dx + W) % W)]!;
              cnt++;
            }
          }
          // Keep the shoreline itself crisp: never lift depth where the terrain is above water.
          depthData[y * W + x] = src[y * W + x] === 0 ? 0 : Math.round(sum / cnt);
        }
      }
    }
    const depthTex = new THREE.DataTexture(depthData, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    depthTex.magFilter = THREE.LinearFilter;
    depthTex.minFilter = THREE.LinearFilter;
    depthTex.wrapS = THREE.RepeatWrapping;
    depthTex.needsUpdate = true;

    const fog: FogUniforms = { uFog: { value: fogTex }, uMapSize: { value: mapSize } };
    this.terrainUniforms = { uTerrain: { value: terrainTex }, uFog: fog.uFog, uMapSize: fog.uMapSize, uTime: { value: 0 }, uGrid: { value: this.grid ? 1 : 0 } };
    this.waterUniforms = { uDepth: { value: depthTex }, uFog: fog.uFog, uMapSize: fog.uMapSize, uTime: this.terrainUniforms.uTime, uSunDir: { value: new THREE.Vector3(0.45, 0.8, 0.4).normalize() } };
    const dressing = makeInstancedMaterial();
    applyFog(dressing, fog, true);
    const road = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    applyFog(road, fog, false);
    const token = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.1 });
    applyFog(token, fog, true);
    const river = makeRiverMaterial(this.waterUniforms);
    river.side = THREE.DoubleSide;
    river.polygonOffset = true;
    river.polygonOffsetFactor = -1;
    this.mats = { terrain: makeTerrainMaterial(this.rules.terrains.map((t) => t.id), this.terrainUniforms), dressing, road, river, token, icons: new Map() };
    const mats = this.mats;
    void loadResourceIcons(this.rules.resources.map((r) => r.id)).then((textures) => {
      if (textures.size === 0 || this.mats !== mats) return;
      for (const [id, tex] of textures) mats.icons.set(id, makeIconMaterial(tex, fog));
      this.previous = null;
      if (this.snapshot) this.refresh(this.snapshot);
    });

    this.chunks = makeChunks(W, H);
    for (const c of this.chunks) {
      c.buildTerrain(this.hf, this.detail, this.mats);
      this.world.add(c.group);
    }
    const waterMat = makeWaterMaterial(this.waterUniforms);
    const waterGeo = new THREE.PlaneGeometry(W, H + 16, 1, 1).rotateX(-Math.PI / 2).translate(W / 2, 0, H / 2);
    this.water = [-1, 0, 1].map(() => new THREE.Mesh(waterGeo, waterMat));
    for (const w of this.water) this.world.add(w);
    this.units = new UnitLayer(this.models, fog, W);
    this.world.add(this.units.group);
    this.cities = new CityLayer(this.models, fog, W, this.labelLayer, (id) => this.onCityClick(id));
    this.markers?.dispose();
    this.markers = new MarkerLayer(this.labelLayer, W);
    this.markers.set(this.pendingMarkers);
    this.world.add(this.cities.group);
    this.cam.setBounds(W, H);
    this.previous = null;
    this.snapshot = snapshot;
    this.refresh(snapshot);
    const start = state.map.starts[snapshot.human] ?? 0;
    this.centerOn(start, true);
    this.cam.setDistance(16, true);
  }

  update(snapshot: MapSnapshot, events: readonly GameEvent[]): void {
    if (!this.hf || snapshot.state.map.width !== this.snapshot?.state.map.width) {
      this.setGame(snapshot);
      return;
    }
    this.battleEffects(snapshot, events);
    this.units?.onEvents(events.filter((e) => this.seen(snapshot, e)), snapshot.state);
    this.snapshot = snapshot;
    this.refresh(snapshot);
  }

  /** Whether the human player could see where an event happened. */
  private seen(snapshot: MapSnapshot, e: GameEvent): boolean {
    const raw = 'tile' in e ? e.tile : 'from' in e ? e.from : -1;
    const tile = typeof raw === 'number' ? raw : -1;
    if (tile < 0) return true;
    return snapshot.visible[tile] === 1 || (this.snapshot?.visible[tile] ?? 0) === 1;
  }

  private tileCentre(snapshot: MapSnapshot, tile: number): [number, number] {
    const half = snapshot.state.map.width >> 1;
    const z = Math.floor(tile / half);
    return [2 * (tile % half) + (z & 1), z];
  }

  /** Flashes, shells and fireballs for the battles of a batch the player can see. */
  private battleEffects(snapshot: MapSnapshot, events: readonly GameEvent[]): void {
    const hf = this.hf;
    if (!hf) return;
    for (const e of events) {
      if (!this.seen(snapshot, e)) continue;
      if (e.type === 'combat') {
        const [x, z] = this.tileCentre(snapshot, e.tile);
        const heavy = this.rules.unit(e.attackerType).attack >= 8;
        this.effects.clash(hf, x, z, heavy);
      } else if (e.type === 'bombarded') {
        const [fx, fz] = this.tileCentre(snapshot, e.from);
        const [x, z] = this.tileCentre(snapshot, e.tile);
        this.effects.shell(hf, fx, fz, x, z);
      } else if (e.type === 'nuclearStrike' && !e.stopped) {
        const [x, z] = this.tileCentre(snapshot, e.tile);
        this.effects.nuke(hf, x, z);
      } else if (e.type === 'defensiveBombard' || e.type === 'zoneOfControlAttack') {
        const u = snapshot.state.units[e.unit] ?? this.snapshot?.state.units[e.unit];
        if (u) {
          const [x, z] = this.tileCentre(snapshot, u.tile);
          this.effects.clash(hf, x, z, false);
        }
      }
    }
  }

  private refresh(snapshot: MapSnapshot): void {
    const { state, visible, human } = snapshot;
    const m = state.map;
    const W = m.width;
    const H = m.height;
    const player = state.players[human]!;
    const n = tileCount(m);
    const half = W >> 1;
    const fogTile = new Uint8Array(n);
    for (let i = 0; i < n; i++) fogTile[i] = visible[i] ? 255 : isExplored(player, i) ? 120 : 0;
    const tileAt = (x: number, y: number) => {
      if (y < 0 || y >= H) return -1;
      const xx = ((x % W) + W) % W;
      return y * half + (xx >> 1);
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (((x + y) & 1) === 0) {
          const t = y * half + (x >> 1);
          this.fogData[k] = fogTile[t]!;
          this.terrainData[k * 4] = m.terrain[t]!;
          this.terrainData[k * 4 + 1] = m.improvements[t]! & 255;
          this.terrainData[k * 4 + 2] = m.flags[t]! & 255;
          this.terrainData[k * 4 + 3] = 255;
        } else {
          let sum = 0;
          let cnt = 0;
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const t = tileAt(x + dx, y + dy);
            if (t >= 0) {
              sum += fogTile[t]!;
              cnt++;
            }
          }
          this.fogData[k] = cnt ? Math.round(sum / cnt) : 0;
        }
      }
    }
    this.terrainUniforms.uFog.value.needsUpdate = true;
    this.terrainUniforms.uTerrain.value.needsUpdate = true;

    // Rebuild dressing only for chunks whose tiles changed.
    const prev = this.previous;
    const dirty = new Set<Chunk>();
    const cols = Math.ceil(W / 32);
    for (let i = 0; i < n; i++) {
      const changed =
        !prev ||
        prev.improvements[i] !== m.improvements[i] ||
        prev.terrain[i] !== m.terrain[i] ||
        prev.flags[i] !== m.flags[i] ||
        prev.resource[i] !== m.resource[i] ||
        ((prev.explored[i >> 5]! >>> (i & 31)) & 1) !== ((player.explored[i >> 5]! >>> (i & 31)) & 1);
      if (!changed) continue;
      const y = Math.floor(i / half);
      const x = 2 * (i % half) + (y & 1);
      const c = this.chunks[Math.floor(y / 32) * cols + Math.floor(x / 32)];
      if (c) dirty.add(c);
    }
    for (const c of dirty) c.buildDressing(state, this.rules, human, this.hf!, this.models, this.mats);
    this.previous = { explored: [...player.explored], improvements: m.improvements, terrain: m.terrain, flags: m.flags, resource: m.resource };
    this.units!.setUnits(state, this.rules, visible, human);
    const info = new Map<number, CityLabelInfo>();
    for (const c of Object.values(state.cities)) {
      if (c.owner !== human) continue;
      const r = cityReport(this.rules, state, c);
      const remaining = c.build ? Math.max(0, buildCost(this.rules, c.build, state, c.owner) - c.shields) : 0;
      info.set(c.id, {
        city: c,
        production: c.build ? buildName(this.rules, c.build) : 'Choose production',
        turns: c.build && r.shields.value > 0 ? Math.max(1, Math.ceil(remaining / r.shields.value)) : null,
        growth: r.growth,
        disorder: r.disorder,
        celebrating: c.celebrating,
      });
    }
    this.cities!.setCities(state, this.rules, human, this.hf!, info);
  }

  setSelectedUnit(id: number | null): void {
    this.units?.setSelected(id);
    if (this.snapshot) this.units?.setUnits(this.snapshot.state, this.rules, this.snapshot.visible, this.snapshot.human);
  }

  private tileXY(tile: number): [number, number] {
    const half = this.snapshot!.state.map.width >> 1;
    const y = Math.floor(tile / half);
    return [2 * (tile % half) + (y & 1), y];
  }

  /** x of a map position in the world copy nearest the camera. */
  private nearX(x: number): number {
    const W = this.snapshot!.state.map.width;
    return x + Math.round((this.cam.target.x - x) / W) * W;
  }

  setHoverTile(tile: number | null): void {
    this.hoverTile = tile;
  }

  private placeHover(): void {
    if (this.hoverTile === null || !this.hf || !this.snapshot) {
      this.hover.visible = false;
      return;
    }
    const [x, y] = this.tileXY(this.hoverTile);
    const cx = this.nearX(x);
    const pos = this.hover.geometry.attributes['position'] as THREE.BufferAttribute;
    const corners: [number, number][] = [[cx, y - 1], [cx + 1, y], [cx, y + 1], [cx - 1, y]];
    for (let k = 0; k < 16; k++) {
      const a = corners[Math.floor(k / 4)]!;
      const b = corners[(Math.floor(k / 4) + 1) % 4]!;
      const t = (k % 4) / 4;
      const px = a[0] + (b[0] - a[0]) * t;
      const pz = a[1] + (b[1] - a[1]) * t;
      pos.setXYZ(k, px, Math.max(this.hf.heightAt(px, pz), 0) + 0.04, pz);
    }
    pos.needsUpdate = true;
    this.hover.visible = true;
  }

  setPath(tiles: readonly number[] | null, turnEnds: readonly number[] = []): void {
    if (this.pathLine) {
      this.overlay.remove(this.pathLine);
      this.pathLine.geometry.dispose();
      this.pathLine = null;
    }
    if (this.pathDots) {
      this.overlay.remove(this.pathDots);
      this.pathDots.dispose();
      this.pathDots = null;
    }
    if (!tiles || tiles.length < 2 || !this.hf) return;
    const pts: THREE.Vector3[] = [];
    let lastX: number | null = null;
    const W = this.snapshot!.state.map.width;
    for (const t of tiles) {
      const [tx, y] = this.tileXY(t);
      const x: number = lastX === null ? tx : tx + Math.round((lastX - tx) / W) * W;
      lastX = x;
      pts.push(new THREE.Vector3(x, Math.max(this.hf.heightAt(x, y), 0) + 0.12, y));
    }
    const shift = this.nearX(pts[0]!.x) - pts[0]!.x;
    for (const p of pts) p.x += shift;
    this.pathLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ffe27a', depthTest: false, transparent: true }));
    this.pathLine.renderOrder = 11;
    this.overlay.add(this.pathLine);
    if (turnEnds.length > 0) {
      this.pathDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffb347', depthTest: false }), turnEnds.length);
      turnEnds.forEach((idx, i) => {
        const p = pts[idx];
        if (p) this.pathDots!.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
      });
      this.pathDots.renderOrder = 12;
      this.overlay.add(this.pathDots);
    }
  }

  centerOn(tile: number, instant = false): void {
    if (!this.snapshot) return;
    const [x, y] = this.tileXY(tile);
    this.cam.lookAt(this.nearX(x), y, instant);
  }

  /** Screen position of a tile's centre (client pixels), for tests and overlays. */
  screenOf(tile: number): { x: number; y: number } | null {
    if (!this.hf || !this.snapshot) return null;
    const [tx, tz] = this.tileCentre(this.snapshot, tile);
    const x = this.nearX(tx);
    const p = new THREE.Vector3(x, Math.max(0, this.hf.heightAt(x, tz)), tz).project(this.cam.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  pick(clientX: number, clientY: number): number {
    if (!this.hf || !this.snapshot) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.cam.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const surface = (x: number, z: number) => Math.max(this.hf!.heightAt(x, z), 0);
    let t = 0;
    let prevT = 0;
    const maxT = 4000;
    let step = Math.max(0.05, this.cam.distance / 200);
    let hit = -1;
    for (let i = 0; i < 4000 && t < maxT; i++) {
      const p = o.clone().addScaledVector(d, t);
      if (p.y <= surface(p.x, p.z)) {
        // Bisect between prevT and t.
        let lo = prevT;
        let hi = t;
        for (let k = 0; k < 20; k++) {
          const mid = (lo + hi) / 2;
          const q = o.clone().addScaledVector(d, mid);
          if (q.y <= surface(q.x, q.z)) hi = mid;
          else lo = mid;
        }
        hit = hi;
        break;
      }
      prevT = t;
      t += step;
      if (p.y > 3) step = Math.max(step, (p.y - 3) * 0.5);
    }
    if (hit < 0) return -1;
    const p = o.clone().addScaledVector(d, hit);
    const { width: W, height: H } = this.snapshot.state.map;
    const u = Math.round((p.x + p.z) / 2);
    const v = Math.round((p.z - p.x) / 2);
    const x = (((u - v) % W) + W) % W;
    const y = u + v;
    if (y < 0 || y >= H) return -1;
    return y * (W >> 1) + (x >> 1);
  }

  /**
   * Places extra static models (benchmark showcase, e.g. cities before Phase 2 has
   * them). Each entry is a model id and the tiles to put it on.
   */
  setShowcase(items: { model: keyof ModelSet; tiles: number[] }[]): void {
    for (const c of [...this.showcase.children]) this.showcase.remove(c);
    if (!this.hf || !this.snapshot) return;
    for (const item of items) {
      const mesh = new THREE.InstancedMesh(this.models[item.model], this.mats.dressing, item.tiles.length);
      item.tiles.forEach((t, i) => {
        const [x, y] = this.tileXY(t);
        mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, this.hf!.heightAt(x, y), y));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.showcase.add(mesh);
    }
  }

  /** Lens badges pinned to tiles (empty list to clear). */
  setMarkers(markers: readonly MapMarker[]): void {
    this.pendingMarkers = markers;
    this.markers?.set(markers);
  }

  setGrid(on: boolean): void {
    this.grid = on;
    if (this.hf) this.terrainUniforms.uGrid.value = on ? 1 : 0;
  }

  view(): { x: number; z: number; distance: number; yaw: number } {
    return { x: this.cam.target.x, z: this.cam.target.z, distance: this.cam.distance, yaw: this.cam.yaw };
  }

  setView(v: { x?: number; z?: number; distance?: number; yaw?: number }, instant = false): void {
    if (v.x !== undefined || v.z !== undefined) this.cam.lookAt(v.x ?? this.cam.target.x, v.z ?? this.cam.target.z, instant);
    if (v.distance !== undefined) this.cam.setDistance(v.distance, instant);
  }

  stats(): MapStats {
    const times = this.frameTimes;
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    return {
      fps: avg > 0 ? 1000 / avg : 0,
      frameMs: avg,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      units: this.units?.unitCount ?? 0,
    };
  }

  /** Recent frame times in ms (for benchmarks). */
  frameLog(): number[] {
    return [...this.frameTimes];
  }

  /** CPU time spent in the last frames' JS (ms), for diagnosing GPU- vs CPU-bound frames. */
  cpuLog: number[] = [];

  private frame(): void {
    const now = performance.now();
    try {
      this.frameInner(now);
    } finally {
      this.cpuLog.push(performance.now() - now);
      if (this.cpuLog.length > 120) this.cpuLog.shift();
    }
  }

  private frameInner(now: number): void {
    const dtMs = now - this.last;
    this.last = now;
    const dt = Math.min(0.1, dtMs / 1000);
    this.frameTimes.push(dtMs);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    this.time += dt;
    if (this.canvas.width !== Math.floor(this.canvas.clientWidth * this.renderer.getPixelRatio())) this.resize();
    if (!this.hf || !this.snapshot) {
      this.renderer.render(this.scene, this.cam.camera);
      return;
    }
    this.terrainUniforms.uTime.value = this.time;
    this.cam.update(dt, (x, z) => this.hf!.heightAt(x, z));
    const W = this.snapshot.state.map.width;
    const tx = this.cam.target.x;
    for (const c of this.chunks) c.group.position.x = Math.round((tx - c.centerX) / W) * W;
    const base = Math.floor(tx / W) * W;
    this.water.forEach((w, i) => (w.position.x = base + (i - 1) * W));
    this.showcase.position.x = Math.round((tx - W / 2) / W) * W;
    this.units!.setCameraQuaternion(this.cam.camera.quaternion);
    this.units!.update(dt, this.hf, tx, this.cam.distance, this.time);
    this.effects.update(dt, tx);
    this.cities!.update(this.hf, this.cam.camera, tx, this.cam.distance, this.canvas);
    this.markers?.update(this.hf, this.cam.camera, tx, this.cam.distance, this.canvas);
    this.placeHover();
    // Shadows follow the view and switch off at strategic zoom.
    const d = this.cam.distance;
    const shadows = d < 45;
    this.sun.castShadow = shadows;
    if (shadows) {
      const s = d * 0.85;
      const sc = this.sun.shadow.camera;
      if (sc.right !== s) {
        sc.left = -s;
        sc.right = s;
        sc.top = s;
        sc.bottom = -s;
        sc.near = 1;
        sc.far = d * 6 + 40;
        sc.updateProjectionMatrix();
      }
    }
    const sunDir = this.waterUniforms.uSunDir.value;
    this.sun.target.position.copy(this.cam.target);
    this.sun.position.copy(this.cam.target).addScaledVector(sunDir, d * 2 + 20);
    this.renderer.render(this.scene, this.cam.camera);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const c of this.chunks) c.dispose();
    this.cities?.dispose();
    this.markers?.dispose();
    this.effects.dispose();
    this.renderer.dispose();
  }
}
