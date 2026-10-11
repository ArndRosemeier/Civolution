/**
 * Small HTML badges pinned to tiles, for map lenses (PLAN.md §10.2): the automation lens
 * marks automated units and cities with what they are doing. Badges follow the camera
 * like the city name plates and hide at strategic zoom.
 */
import * as THREE from 'three';
import type { HeightField } from './heights.ts';

export interface MapMarker {
  tile: number;
  text: string;
  /** CSS modifier, e.g. 'unit' or 'city'. */
  kind: string;
  /** Longer explanation on hover. */
  title?: string;
}

interface Placed {
  marker: MapMarker;
  x: number;
  z: number;
  el: HTMLDivElement;
}

export class MarkerLayer {
  private placed: Placed[] = [];
  private pool: HTMLDivElement[] = [];
  private readonly v = new THREE.Vector3();

  constructor(
    private readonly layer: HTMLElement | null,
    private readonly mapWidth: number,
  ) {}

  set(markers: readonly MapMarker[]): void {
    const half = this.mapWidth >> 1;
    for (const p of this.placed) {
      p.el.style.display = 'none';
      this.pool.push(p.el);
    }
    this.placed = markers.map((marker) => {
      const z = Math.floor(marker.tile / half);
      const x = 2 * (marker.tile % half) + (z & 1);
      let el = this.pool.pop();
      if (!el) {
        el = document.createElement('div');
        this.layer?.appendChild(el);
      }
      el.className = `map-marker ${marker.kind}`;
      el.textContent = marker.text;
      el.title = marker.title ?? marker.text;
      return { marker, x, z, el };
    });
  }

  update(hf: HeightField, camera: THREE.Camera, cameraX: number, distance: number, canvas: HTMLCanvasElement): void {
    if (this.placed.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const W = this.mapWidth;
    const show = distance < 60;
    for (const p of this.placed) {
      const wx = p.x + Math.round((cameraX - p.x) / W) * W;
      this.v.set(wx, Math.max(hf.heightAt(wx, p.z), 0) + 0.5, p.z - 0.35).project(camera);
      const visible = show && this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      p.el.style.display = visible ? '' : 'none';
      if (visible) {
        const sx = ((this.v.x + 1) / 2) * rect.width;
        const sy = ((1 - this.v.y) / 2) * rect.height;
        p.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      }
    }
  }

  dispose(): void {
    for (const p of this.placed) p.el.remove();
    for (const el of this.pool) el.remove();
    this.placed = [];
    this.pool = [];
  }
}
