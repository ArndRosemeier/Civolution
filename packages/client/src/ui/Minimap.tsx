import { useEffect, useRef } from 'react';
import { isExplored, tileCount } from '@civolution/engine';
import { MINIMAP_LAKE, TERRAIN_COLORS } from '../map/palette.ts';
import type { MapView } from '../map/MapView.ts';
import { rules } from '../rules.ts';
import { useGame } from '../store.ts';

/** Overview map: explored terrain, units, and the camera's view; click to jump. */
export function Minimap({ view }: { view: MapView }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const snap = useGame((s) => s.snapshot)!;
  const base = useRef<ImageData | null>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const { state, human, visible } = snap;
    const m = state.map;
    c.width = m.width;
    c.height = m.height;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(m.width, m.height);
    const colors = rules.terrains.map((t) => {
      const hex = TERRAIN_COLORS[t.id]?.[0] ?? '#ff00ff';
      const n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    });
    const lake = parseInt(MINIMAP_LAKE.slice(1), 16);
    const player = state.players[human]!;
    const half = m.width >> 1;
    for (let i = 0; i < tileCount(m); i++) {
      if (!isExplored(player, i)) continue;
      const y = Math.floor(i / half);
      const x = 2 * (i % half) + (y & 1);
      let col = colors[m.terrain[i]!]!;
      if (m.flags[i]! & 2) col = [(lake >> 16) & 255, (lake >> 8) & 255, lake & 255];
      const dim = visible[i] ? 1 : 0.6;
      for (const xx of [x, (x + 1) % m.width]) {
        const k = (y * m.width + xx) * 4;
        img.data[k] = col[0]! * dim;
        img.data[k + 1] = col[1]! * dim;
        img.data[k + 2] = col[2]! * dim;
        img.data[k + 3] = 255;
      }
    }
    for (const u of Object.values(state.units)) {
      if (u.owner !== human && !visible[u.tile]) continue;
      const y = Math.floor(u.tile / half);
      const x = 2 * (u.tile % half) + (y & 1);
      const n = parseInt(state.players[u.owner]!.color.slice(1), 16);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const xx = (x + dx) % m.width;
        const yy = Math.min(m.height - 1, y + dy);
        const k = (yy * m.width + xx) * 4;
        img.data[k] = (n >> 16) & 255;
        img.data[k + 1] = (n >> 8) & 255;
        img.data[k + 2] = n & 255;
        img.data[k + 3] = 255;
      }
    }
    base.current = img;
  }, [snap]);

  // Redraw the camera frame continuously.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current;
      if (!c || !base.current) return;
      const ctx = c.getContext('2d')!;
      ctx.putImageData(base.current, 0, 0);
      const v = view.view();
      const W = c.width;
      const x = ((v.x % W) + W) % W;
      const half = v.distance * 0.75;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      for (const off of [-W, 0, W]) ctx.strokeRect(x + off - half, v.z - half * 0.6, half * 2, half * 1.2);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [view]);

  const jump = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * c.width;
    const z = ((e.clientY - r.top) / r.height) * c.height;
    const cur = view.view().x;
    const W = c.width;
    view.setView({ x: x + Math.round((cur - x) / W) * W, z });
  };

  return <canvas ref={canvas} className="minimap" onMouseDown={jump} onMouseMove={(e) => e.buttons === 1 && jump(e)} />;
}
