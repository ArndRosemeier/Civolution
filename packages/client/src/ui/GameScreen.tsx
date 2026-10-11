import { useCallback, useEffect, useRef, useState } from 'react';
import { cityAt, findPath, neighbour, pathTurns, stepCost } from '@civolution/engine';
import { host } from '../host/client.ts';
import { loadModels, type ModelSet } from '../map/three/models.ts';
import { ThreeMapView } from '../map/three/ThreeMapView.ts';
import { rules } from '../rules.ts';
import { writeSave } from '../saves.ts';
import { idleCities, idleUnits, useGame } from '../store.ts';
import { CityScreen } from './CityScreen.tsx';
import { DomesticAdvisor } from './DomesticAdvisor.tsx';
import { ScienceAdvisor } from './ScienceAdvisor.tsx';
import { LogPanel } from './LogPanel.tsx';
import { Minimap } from './Minimap.tsx';
import { PerfHud } from './PerfHud.tsx';
import { SavesDialog } from './SavesDialog.tsx';
import { TilePanel } from './TilePanel.tsx';
import { TopBar } from './TopBar.tsx';
import { UnitPanel, unitActions } from './UnitPanel.tsx';

let modelsPromise: Promise<ModelSet> | null = null;

/** Numpad keys to compass directions (0 = N … 7 = NW) with the camera unrotated. */
const NUMPAD: Record<string, number> = { Numpad8: 0, Numpad9: 1, Numpad6: 2, Numpad3: 3, Numpad2: 4, Numpad1: 5, Numpad4: 6, Numpad7: 7 };

export function GameScreen() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const panel = useGame((s) => s.panel);
  const [view, setView] = useState<ThreeMapView | null>(null);
  const [dialog, setDialog] = useState<'save' | 'load' | null>(null);
  const snapshot = useGame((s) => s.snapshot)!;
  const selected = useGame((s) => s.selected);
  const hover = useGame((s) => s.hover);
  const settings = useGame((s) => s.settings);
  const gotoMode = useGame((s) => s.gotoMode);
  const lastEvents = useGame((s) => s.lastEvents);
  const toast = useGame((s) => s.toast);
  const built = useRef<number | null>(null);

  // Create the renderer once the models are loaded.
  useEffect(() => {
    let disposed = false;
    let v: ThreeMapView | null = null;
    modelsPromise ??= loadModels();
    void modelsPromise.then((models) => {
      if (disposed || !canvas.current) return;
      v = new ThreeMapView(canvas.current, rules, models, {
        shadows: settings.shadows,
        ...(labels.current ? { labelLayer: labels.current } : {}),
        onCityClick: (id) => useGame.getState().open({ kind: 'city', id }),
      });
      setView(v);
    });
    return () => {
      disposed = true;
      v?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!view) return;
    const key = snapshot.state.seed * 1000 + snapshot.state.map.width;
    if (built.current !== key) {
      view.setGame(snapshot);
      built.current = key;
    } else {
      view.update(snapshot, lastEvents);
    }
  }, [view, snapshot, lastEvents]);

  useEffect(() => view?.setSelectedUnit(selected), [view, selected]);
  useEffect(() => view?.setGrid(settings.grid), [view, settings.grid]);
  useEffect(() => view?.setHoverTile(hover), [view, hover]);

  // Centre on the selected unit when the selection changes.
  useEffect(() => {
    const u = selected !== null ? snapshot.state.units[selected] : undefined;
    if (view && u) view.centerOn(u.tile);
  }, [view, selected]);

  // Path preview from the selected unit to the hovered tile.
  useEffect(() => {
    if (!view) return;
    const u = selected !== null ? snapshot.state.units[selected] : undefined;
    if (!u || hover === null || hover === u.tile || u.owner !== snapshot.human) {
      view.setPath(null);
      return;
    }
    const path = findPath(rules, snapshot.state, u, hover);
    if (!path) {
      view.setPath(null);
      return;
    }
    // Mark where each turn ends.
    const ends: number[] = [];
    let left = u.movesLeft;
    let from = u.tile;
    const full = rules.unit(u.type).movement * rules.moveScale;
    path.tiles.forEach((t, i) => {
      if (left <= 0) left = full;
      const step = stepCost(rules, snapshot.state, u, from, t);
      left -= step.ok ? step.cost : full;
      if (left <= 0 && i < path.tiles.length - 1) ends.push(i + 1);
      from = t;
    });
    view.setPath([u.tile, ...path.tiles], ends);
  }, [view, selected, hover, snapshot]);

  // Autosave at the start of each turn.
  const turn = snapshot.state.turn;
  useEffect(() => {
    if (turn <= 1) return;
    void host()
      .save()
      .then((text) => writeSave('Autosave', turn, text))
      .catch(() => undefined);
  }, [turn]);

  const store = useGame;
  const act = useCallback(
    (code: string, shift: boolean, ctrl: boolean): boolean => {
      const s = store.getState();
      const snap = s.snapshot;
      if (!snap) return false;
      if (code === 'F1') {
        s.open({ kind: 'domestic' });
        return true;
      }
      if (code === 'F6') {
        s.open({ kind: 'science' });
        return true;
      }
      if (code === 'Enter' || code === 'NumpadEnter') {
        void s.endTurn();
        return true;
      }
      if (ctrl && code === 'KeyS') {
        setDialog('save');
        return true;
      }
      if (ctrl && code === 'KeyL') {
        setDialog('load');
        return true;
      }
      if (ctrl && code === 'KeyG') {
        s.setSettings({ grid: !s.settings.grid });
        return true;
      }
      if (code === 'Backquote') {
        s.setSettings({ perf: !s.settings.perf });
        return true;
      }
      if (code === 'KeyQ') {
        view?.camera.rotate(-1);
        return true;
      }
      if (code === 'KeyE') {
        view?.camera.rotate(1);
        return true;
      }
      if (code === 'Equal' || code === 'NumpadAdd') {
        view?.camera.zoomBy(0.8);
        return true;
      }
      if (code === 'Minus' || code === 'NumpadSubtract') {
        view?.camera.zoomBy(1.25);
        return true;
      }
      const u = s.selected !== null ? snap.state.units[s.selected] : undefined;
      if (code === 'KeyC' && !shift && u) {
        view?.centerOn(u.tile);
        return true;
      }
      if (code === 'KeyW' && !ctrl) {
        s.selectNext();
        return true;
      }
      if (!u || u.owner !== snap.human) return false;
      if (code in NUMPAD) {
        const yawSteps = Math.round((view?.camera.yaw ?? 0) / (Math.PI / 2));
        const dir = (((NUMPAD[code]! - yawSteps * 2) % 8) + 8) % 8;
        const to = neighbour(snap.state.map, u.tile, dir);
        if (to >= 0) {
          void s.send({ type: 'moveUnit', unit: u.id, to }).then((ok) => {
            const after = store.getState().snapshot?.state.units[u.id];
            if (ok && after && after.movesLeft <= 0) store.getState().selectNext();
          });
        }
        return true;
      }
      for (const a of unitActions(snap, u)) {
        if (a.key === code && !!a.shift === shift) {
          if (a.disabled) s.showToast(a.disabled);
          else void a.run().then(() => a.advances && store.getState().selectNext());
          return true;
        }
      }
      return false;
    },
    [view, store],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || dialog || useGame.getState().panel) return;
      if (e.code.startsWith('Arrow')) {
        view?.camera.keyDown(e.code);
        e.preventDefault();
        return;
      }
      if (act(e.code, e.shiftKey, e.ctrlKey || e.metaKey)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => view?.camera.keyUp(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [act, view, dialog]);

  // Mouse: hover picking, click to select or move, drag to pan, wheel to zoom.
  const drag = useRef<{ x: number; y: number; button: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!view) return;
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (d.moved || Math.abs(dx) + Math.abs(dy) > 6) {
        d.moved = true;
        view.camera.pan(-dx, -dy);
        d.x = e.clientX;
        d.y = e.clientY;
      }
      return;
    }
    useGame.getState().setHover(view.pick(e.clientX, e.clientY));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!view || !d || d.moved) return;
    const tile = view.pick(e.clientX, e.clientY);
    if (tile < 0) return;
    const s = useGame.getState();
    const snap = s.snapshot!;
    const u = s.selected !== null ? snap.state.units[s.selected] : undefined;
    if ((d.button === 2 || s.gotoMode) && u && u.owner === snap.human) {
      s.setGotoMode(false);
      void s.send({ type: 'goto', unit: u.id, to: tile }).then((ok) => {
        const after = useGame.getState().snapshot?.state.units[u.id];
        if (ok && after && after.movesLeft <= 0) useGame.getState().selectNext();
      });
      return;
    }
    if (d.button !== 0) return;
    const mine = Object.values(snap.state.units)
      .filter((x) => x.tile === tile && x.owner === snap.human)
      .sort((a, b) => a.id - b.id);
    const city = cityAt(snap.state, tile);
    // A click on your city opens it, unless it cycles through a unit stack already selected there.
    if (city && city.owner === snap.human && !(u && u.tile === tile && mine.length > 1)) {
      s.open({ kind: 'city', id: city.id });
      return;
    }
    if (mine.length > 0) {
      const idx = mine.findIndex((x) => x.id === s.selected);
      s.select(mine[(idx + 1) % mine.length]!.id);
    }
  };
  const onWheel = (e: React.WheelEvent) => view?.camera.zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15);

  const remaining = idleUnits(snapshot).length;
  const idle = idleCities(snapshot);
  const pathInfo = (() => {
    const u = selected !== null ? snapshot.state.units[selected] : undefined;
    if (!u || hover === null || hover === u.tile) return null;
    const path = findPath(rules, snapshot.state, u, hover);
    return path ? pathTurns(rules, snapshot.state, u, path) : null;
  })();

  return (
    <div className={`game ${gotoMode ? 'goto' : ''}`}>
      <canvas
        ref={canvas}
        className="map-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => useGame.getState().setHover(null)}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div ref={labels} className="city-labels" />
      {!view && <div className="loading">Preparing the world…</div>}
      <TopBar onSave={() => setDialog('save')} onLoad={() => setDialog('load')} />
      <LogPanel onJump={(tile) => view?.centerOn(tile)} />
      <TilePanel tile={hover} unitId={selected} pathTurns={pathInfo} />
      <UnitPanel />
      <div className="corner">
        {view && <Minimap view={view} />}
        {idle.length > 0 && (
          <button className="idle-cities" onClick={() => useGame.getState().open({ kind: 'city', id: idle[0]! })} title="Open the first city with nothing to build">
            {idle.length} cit{idle.length === 1 ? 'y needs' : 'ies need'} orders
          </button>
        )}
        <button className={`end-turn ${remaining === 0 ? 'ready' : ''}`} onClick={() => void useGame.getState().endTurn()} title="End turn (Enter)">
          <span>End turn</span>
          <small>{remaining === 0 ? 'All units have orders' : `${remaining} unit${remaining === 1 ? '' : 's'} waiting`}</small>
        </button>
      </div>
      {settings.perf && view && <PerfHud view={view} />}
      {toast && <div className="toast">{toast}</div>}
      {dialog && <SavesDialog mode={dialog} onClose={() => setDialog(null)} />}
      {panel?.kind === 'city' && <CityScreen cityId={panel.id} onClose={() => useGame.getState().open(null)} />}
      {panel?.kind === 'domestic' && <DomesticAdvisor onClose={() => useGame.getState().open(null)} />}
      {panel?.kind === 'science' && <ScienceAdvisor onClose={() => useGame.getState().open(null)} />}
    </div>
  );
}
