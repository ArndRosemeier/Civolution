/**
 * Strategy camera (PLAN.md §10.1): looks at a ground target from a fixed tilt that
 * steepens as it zooms out, rotates in 90° steps, pans with keys or drag, zooms with
 * the wheel toward the cursor. Smoothly damped.
 */
import * as THREE from 'three';

export const MIN_DISTANCE = 5;

export class StrategyCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Ground point the camera looks at (map coordinates, x unwrapped). */
  readonly target = new THREE.Vector3(10, 0, 10);
  private goal = new THREE.Vector3(10, 0, 10);
  distance = 18;
  private goalDistance = 18;
  yaw = 0;
  private goalYaw = 0;
  maxDistance = 120;
  private readonly keys = new Set<string>();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 2000);
  }

  setBounds(mapWidth: number, mapHeight: number): void {
    // Never see more than one copy of the world.
    this.maxDistance = Math.min(150, Math.max(mapWidth, mapHeight) * 0.75);
    this.mapHeight = mapHeight;
  }

  private mapHeight = 100;

  lookAt(x: number, z: number, instant = false): void {
    // Keep x continuous with the current target so wrapping animates the short way.
    this.goal.set(x, 0, z);
    if (instant) this.target.copy(this.goal);
  }

  zoomBy(factor: number): void {
    this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * factor, MIN_DISTANCE, this.maxDistance);
  }

  setDistance(d: number, instant = false): void {
    this.goalDistance = THREE.MathUtils.clamp(d, MIN_DISTANCE, this.maxDistance);
    if (instant) this.distance = this.goalDistance;
  }

  rotate(steps: number): void {
    this.goalYaw += (steps * Math.PI) / 2;
  }

  pan(dx: number, dz: number): void {
    // dx, dz are in screen-aligned units scaled by distance.
    const s = this.distance * 0.0016;
    const c = Math.cos(this.yaw);
    const n = Math.sin(this.yaw);
    this.goal.x += (dx * c + dz * n) * s;
    this.goal.z += (-dx * n + dz * c) * s;
  }

  keyDown(code: string): void {
    this.keys.add(code);
  }

  keyUp(code: string): void {
    this.keys.delete(code);
  }

  pitch(): number {
    const t = (this.distance - MIN_DISTANCE) / Math.max(1, this.maxDistance - MIN_DISTANCE);
    return THREE.MathUtils.degToRad(46 + 26 * Math.sqrt(Math.max(0, t)));
  }

  update(dt: number, groundHeight: (x: number, z: number) => number): void {
    const speed = this.distance * 0.9 * dt;
    let kx = 0;
    let kz = 0;
    // Arrow keys pan; letters belong to unit orders (Civ3 hotkeys).
    if (this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('ArrowUp')) kz -= 1;
    if (this.keys.has('ArrowDown')) kz += 1;
    if (kx || kz) {
      const c = Math.cos(this.yaw);
      const n = Math.sin(this.yaw);
      this.goal.x += (kx * c + kz * n) * speed;
      this.goal.z += (-kx * n + kz * c) * speed;
    }
    this.goal.z = THREE.MathUtils.clamp(this.goal.z, -2, this.mapHeight + 2);
    const k = 1 - Math.exp(-dt * 10);
    this.target.lerp(this.goal, k);
    this.distance += (this.goalDistance - this.distance) * k;
    this.yaw += (this.goalYaw - this.yaw) * k;
    this.target.y = Math.max(0, groundHeight(this.target.x, this.target.z));
    const p = this.pitch();
    const d = this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(p) * d,
      this.target.y + Math.sin(p) * d,
      this.target.z + Math.cos(this.yaw) * Math.cos(p) * d,
    );
    this.camera.lookAt(this.target);
  }
}
