/**
 * The Phase 1 go/no-go spike (PLAN.md §10.1): a Huge generated map with terrain,
 * rivers, forests, fog, 500 units and the three test models (warrior, galley, city),
 * measured while the camera sweeps through close, mid and strategic zoom.
 * Open with `?bench` (optionally `&size=standard&units=500`). Results land in
 * `window.__bench` for automated runs.
 */
import { useEffect, useRef, useState } from 'react';
import { PLAYER_COLORS } from '@civolution/engine';
import { host } from '../host/client.ts';
import { loadModels } from '../map/three/models.ts';
import { ThreeMapView } from '../map/three/ThreeMapView.ts';
import { rules } from '../rules.ts';

interface PhaseResult {
  phase: string;
  frames: number;
  avgFps: number;
  p1LowFps: number;
  worstMs: number;
  drawCalls: number;
  triangles: number;
}

export interface BenchResult {
  size: string;
  tiles: number;
  units: number;
  renderer: string;
  phases: PhaseResult[];
  setupMs: number;
  pass60: boolean;
}

declare global {
  interface Window {
    __bench?: BenchResult;
  }
}

function gpuName(canvas: HTMLCanvasElement): string {
  const gl = canvas.getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
}

let benchStarted = false;

export function BenchScreen({ size, units }: { size: string; units: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('Generating the map…');
  const [result, setResult] = useState<BenchResult | null>(null);

  useEffect(() => {
    // Run once per page load (React StrictMode mounts effects twice in development).
    if (benchStarted) return;
    benchStarted = true;
    let view: ThreeMapView;
    void (async () => {
      const t0 = performance.now();
      const ws = rules.set.worldSizes.find((w) => w.id === size) ?? rules.set.worldSizes[4]!;
      const players = Array.from({ length: ws.defaultCivs }, (_, i) => ({ name: `Civ ${i + 1}`, color: PLAYER_COLORS[i % 16]!, human: i === 0 }));
      await host().newGame({ seed: 20261011, map: { worldSize: ws.id }, players }, 0);
      const snap = await host().benchSetup(units);
      const models = await loadModels();
      if (!canvas.current) return;
      view = new ThreeMapView(canvas.current, rules, models);
      // Show every unit, not only those the first player can see.
      view.setGame({ ...snap, visible: new Uint8Array(snap.visible.length).fill(1) });
      (window as unknown as { __view: ThreeMapView }).__view = view;
      // Cities do not exist before Phase 2; the showcase puts the city model at each start.
      view.setShowcase([{ model: 'city', tiles: snap.state.map.starts }]);
      const setupMs = performance.now() - t0;
      const W = snap.state.map.width;
      const H = snap.state.map.height;
      const start = snap.state.map.starts[0]!;
      const sy = Math.floor(start / (W >> 1));
      const sx = 2 * (start % (W >> 1)) + (sy & 1);
      const phases: { name: string; distance: number; path: (t: number) => [number, number] }[] = [
        { name: 'close (units and models)', distance: 9, path: (t) => [sx + t * 30, sy + Math.sin(t * 6) * 6] },
        { name: 'mid (regional view)', distance: 28, path: (t) => [sx + t * W, H * 0.5 + Math.sin(t * 4) * H * 0.25] },
        { name: 'strategic (whole continents)', distance: 90, path: (t) => [sx + t * W, H * 0.5] },
      ];
      const results: PhaseResult[] = [];
      for (const ph of phases) {
        setStatus(`Measuring: ${ph.name}`);
        view.setView({ distance: ph.distance, x: ph.path(0)[0], z: ph.path(0)[1] }, true);
        await new Promise((r) => setTimeout(r, 800));
        const times: number[] = [];
        let draws = 0;
        let tris = 0;
        const duration = 6000;
        const begin = performance.now();
        let last = begin;
        await new Promise<void>((resolve) => {
          const step = () => {
            const now = performance.now();
            times.push(now - last);
            last = now;
            const t = (now - begin) / duration;
            const [x, z] = ph.path(Math.min(1, t));
            view!.setView({ x, z }, true);
            const s = view!.stats();
            draws = Math.max(draws, s.drawCalls);
            tris = Math.max(tris, s.triangles);
            if (t >= 1) resolve();
            else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
        times.shift();
        const sorted = [...times].sort((a, b) => b - a);
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const p1 = sorted.slice(0, Math.max(1, Math.floor(times.length / 100)));
        const p1avg = p1.reduce((a, b) => a + b, 0) / p1.length;
        results.push({
          phase: ph.name,
          frames: times.length,
          avgFps: Math.round(10000 / avg) / 10,
          p1LowFps: Math.round(10000 / p1avg) / 10,
          worstMs: Math.round(sorted[0]! * 10) / 10,
          drawCalls: draws,
          triangles: tris,
        });
      }
      const res: BenchResult = {
        size: ws.id,
        tiles: snap.state.map.terrain.length,
        units: Object.keys(snap.state.units).length,
        renderer: gpuName(document.createElement('canvas')),
        phases: results,
        setupMs: Math.round(setupMs),
        pass60: results.every((r) => r.avgFps >= 58),
      };
      window.__bench = res;
      setResult(res);
      setStatus('Done');
    })();
  }, [size, units]);

  return (
    <div className="game">
      <canvas ref={canvas} className="map-canvas" />
      <div className="bench panel">
        <h3>Map benchmark</h3>
        <p className="muted">{status}</p>
        {result && (
          <>
            <p>
              {result.size} map, {result.tiles} tiles, {result.units} units, setup {result.setupMs} ms
              <br />
              GPU: {result.renderer}
            </p>
            <table>
              <thead>
                <tr>
                  <th>View</th>
                  <th>avg fps</th>
                  <th>1% low</th>
                  <th>worst ms</th>
                  <th>draws</th>
                  <th>tris</th>
                </tr>
              </thead>
              <tbody>
                {result.phases.map((p) => (
                  <tr key={p.phase}>
                    <td>{p.phase}</td>
                    <td>{p.avgFps}</td>
                    <td>{p.p1LowFps}</td>
                    <td>{p.worstMs}</td>
                    <td>{p.drawCalls}</td>
                    <td>{Math.round(p.triangles / 1000)}k</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={result.pass60 ? 'ok' : 'warn'}>{result.pass60 ? 'Meets the 60 fps budget.' : 'Below the 60 fps budget.'}</p>
          </>
        )}
      </div>
    </div>
  );
}
