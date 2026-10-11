import { useEffect, useState } from 'react';
import type { MapStats, MapView } from '../map/MapView.ts';

export function PerfHud({ view }: { view: MapView }) {
  const [s, setS] = useState<MapStats | null>(null);
  useEffect(() => {
    const id = setInterval(() => setS(view.stats()), 500);
    return () => clearInterval(id);
  }, [view]);
  if (!s) return null;
  return (
    <div className="perf-hud panel">
      <div>
        <strong>{s.fps.toFixed(0)}</strong> fps · {s.frameMs.toFixed(1)} ms
      </div>
      <div>
        {s.drawCalls} draws · {(s.triangles / 1000).toFixed(0)}k tris · {s.units} units
      </div>
    </div>
  );
}
