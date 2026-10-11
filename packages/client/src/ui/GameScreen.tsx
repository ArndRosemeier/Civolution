import { useCallback, useEffect, useRef, useState } from 'react';
import { cityAt, distance, findPath, neighbour, pathTurns, stealthTargets, stepCost, type GameState, type Unit } from '@civolution/engine';
import { play, setAmbience, setMusic, setSoundContext } from '../audio.ts';
import { AMBIENCE } from '../sounds.ts';
import { automationMarkers } from './lens.ts';
import { host } from '../host/client.ts';
import { loadModels, type ModelSet } from '../map/three/models.ts';
import { ThreeMapView } from '../map/three/ThreeMapView.ts';
import { rules } from '../rules.ts';
import { writeSave } from '../saves.ts';
import { idleCities, idleUnits, useGame } from '../store.ts';
import { AutomationScreen } from './AutomationScreen.tsx';
import { editAutomation } from './automation.ts';
import { CityScreen } from './CityScreen.tsx';
import { TurnDigest } from './TurnDigest.tsx';
import { DomesticAdvisor } from './DomesticAdvisor.tsx';
import { ForeignAdvisor } from './ForeignAdvisor.tsx';
import { DiplomacyScreen, OfferDialog } from './Diplomacy.tsx';
import { bestStealthTarget } from './AttackPreview.tsx';
import { NewsCards, RazeDialog } from './WarCards.tsx';
import { ScienceAdvisor } from './ScienceAdvisor.tsx';
import { LogPanel } from './LogPanel.tsx';
import { Minimap } from './Minimap.tsx';
import { PerfHud } from './PerfHud.tsx';
import { SavesDialog } from './SavesDialog.tsx';
import { TilePanel } from './TilePanel.tsx';
import { TopBar } from './TopBar.tsx';
import { UnitPanel, unitActions } from './UnitPanel.tsx';
import { VictoryScreen } from './VictoryScreen.tsx';
import { Civilopedia } from './Civilopedia.tsx';
import { HintCard } from './HintCard.tsx';
import { SettingsDialog } from './SettingsDialog.tsx';
import { unitFamily } from './family.ts';

let modelsPromise: Promise<ModelSet> | null = null;

setSoundContext({
  family: (type) => (rules.hasUnit(type) ? unitFamily(rules, type) : 'melee'),
  unitType: (id) => {
    const units = useGame.getState().snapshot?.state.units;
    return units && id in units ? units[id]!.type : undefined;
  },
});

/** The ambience for what the camera looks at: a city nearby, else the terrain, else none. */
function ambienceAt(state: GameState, human: number, tile: number): string | null {
  if (tile < 0) return null;
  const p = state.players[human];
  if (!p || !((p.explored[tile >> 5]! >>> (tile & 31)) & 1)) return null;
  if (Object.values(state.cities).some((c) => distance(state.map, c.tile, tile) <= 1)) return AMBIENCE['city']!;
  return AMBIENCE[rules.terrains[state.map.terrain[tile]!]!.id] ?? null;
}

/** Whether stepping from `u` onto `tile` would be an attack or a capture. */
function hostileStep(state: GameState, u: Unit, tile: number): boolean {
  if (distance(state.map, u.tile, tile) !== 1) return false;
  if (Object.values(state.units).some((x) => x.tile === tile && x.owner !== u.owner)) return true;
  const c = cityAt(state, tile);
  return !!c && c.owner !== u.owner;
}

/** Sends the aimed action of a unit at a tile. */
function fireAt(u: Unit, tile: number): void {
  const s = useGame.getState();
  const aim = s.aim;
  if (!aim) return;
  s.setAim(null);
  const done = (ok: boolean) => {
    const after = useGame.getState().snapshot?.state.units[u.id];
    if (ok && (!after || after.movesLeft <= 0)) useGame.getState().selectNext();
  };
  if (aim.action === 'bombard') void s.send({ type: 'bombard', unit: u.id, target: tile }).then(done);
  else if (aim.action === 'airdrop') void s.send({ type: 'airdrop', unit: u.id, target: tile }).then(done);
  else if (aim.action === 'airlift') void s.send({ type: 'airlift', unit: u.id, target: tile }).then(done);
  else if (aim.action === 'nuke') {
    if (confirm('Launch a nuclear strike? Every unit on and around the target is destroyed, and cities there lose half their people.')) void s.send({ type: 'nuke', unit: u.id, target: tile }).then(done);
  } else {
    // A stealth bomber singles out the most valuable unit on the tile.
    const snap = s.snapshot!;
    const pick = aim.action === 'bomb' ? stealthTargets(rules, snap.state, u, tile).sort((a, b) => rules.unit(b.type).shieldCost - rules.unit(a.type).shieldCost || a.id - b.id)[0] : undefined;
    void s.send({ type: 'airMission', unit: u.id, mission: aim.action, target: tile, ...(pick ? { targetUnit: pick.id } : {}) }).then(done);
  }
}

/** Completes a pending map pick (rally point, patrol end, worker region). */
function finishTilePick(tile: number): void {
  const s = useGame.getState();
  const pick = s.tilePick;
  if (!pick) return;
  s.setTilePick(null);
  const snap = s.snapshot!;
  if (pick.purpose === 'rally') {
    const city = snap.state.cities[pick.city];
    void editAutomation((a) => {
      a.rally[pick.city] = tile;
    }, `Rally point set for ${city?.name ?? 'the city'}.`);
  } else if (pick.purpose === 'escort') {
    const u = snap.state.units[pick.unit];
    // The unit to escort: a transport on that tile first, else any other unit of ours there.
    const others = Object.values(snap.state.units).filter((x) => x.tile === tile && x.owner === snap.human && x.id !== pick.unit && x.carriedBy === null);
    const charge = others.find((x) => rules.unit(x.type).capacity > 0) ?? others[0];
    if (u && charge) {
      play('rally-call');
      void s.send({ type: 'setRoutine', unit: u.id, routine: `escort:${charge.id}` }).then(() => useGame.getState().selectNext());
    } else s.showToast('Pick a tile with another of your units.');
  } else if (pick.purpose === 'patrol') {
    const u = snap.state.units[pick.unit];
    if (u && tile !== u.tile) {
      play('rally-call');
      void s.send({ type: 'setRoutine', unit: u.id, routine: `patrol:${u.tile}:${tile}` }).then(() => useGame.getState().selectNext());
    }
  } else {
    const near = Object.values(snap.state.cities)
      .filter((c) => c.owner === snap.human)
      .sort((a, b) => distance(snap.state.map, a.tile, tile) - distance(snap.state.map, b.tile, tile))[0];
    void editAutomation((a) => {
      a.regions.push({ id: a.nextId++, name: near ? `Near ${near.name}` : 'Region', center: tile, radius: 2, forbid: ['clearForest', 'clearWetlands'] });
    }, 'Region added: workers will not clear forests or wetlands there. Change it under Automation › Workers.');
  }
}

/** Numpad keys to compass directions (0 = N … 7 = NW) with the camera unrotated. */
const NUMPAD: Record<string, number> = { Numpad8: 0, Numpad9: 1, Numpad6: 2, Numpad3: 3, Numpad2: 4, Numpad1: 5, Numpad4: 6, Numpad7: 7 };

export function GameScreen() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const panel = useGame((s) => s.panel);
  const [view, setView] = useState<ThreeMapView | null>(null);
  const [dialog, setDialog] = useState<'save' | 'load' | 'settings' | null>(null);
  const pedia = useGame((s) => s.pedia);
  const snapshot = useGame((s) => s.snapshot)!;
  const selected = useGame((s) => s.selected);
  const hover = useGame((s) => s.hover);
  const settings = useGame((s) => s.settings);
  const gotoMode = useGame((s) => s.gotoMode);
  const aim = useGame((s) => s.aim);
  const lastEvents = useGame((s) => s.lastEvents);
  const toast = useGame((s) => s.toast);
  const tilePick = useGame((s) => s.tilePick);
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
      // Test hook for scripted UI checks (?scenario=�).
      if (new URLSearchParams(location.search).has('scenario')) (window as unknown as { __civ: unknown }).__civ = { view: v, store: useGame };
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

  // Music follows the player's era; the ambience follows the camera.
  const era = snapshot.state.players[snapshot.human]?.era ?? 0;
  useEffect(() => setMusic(era), [era]);
  useEffect(() => {
    if (!view) return;
    const tick = () => {
      const s = useGame.getState().snapshot;
      if (!s || !canvas.current) return;
      const r = canvas.current.getBoundingClientRect();
      // Far out over the whole map there is no single place to listen to.
      const far = view.view().distance > 42;
      setAmbience(far ? null : ambienceAt(s.state, s.human, view.pick(r.left + r.width / 2, r.top + r.height / 2)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      setAmbience(null);
    };
  }, [view]);

  useEffect(() => view?.setSelectedUnit(selected), [view, selected]);
  useEffect(() => view?.setGrid(settings.grid), [view, settings.grid]);
  useEffect(() => view?.setMarkers(settings.lens ? automationMarkers(snapshot) : []), [view, settings.lens, snapshot]);
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
      if (code === 'F3') {
        s.open({ kind: 'foreign' });
        return true;
      }
      if (code === 'F4') {
        s.open({ kind: 'diplomacy' });
        return true;
      }
      if (code === 'F7') {
        s.open({ kind: 'automation' });
        return true;
      }
      if (code === 'F8') {
        s.open({ kind: 'victory' });
        return true;
      }
      if (code === 'F10') {
        s.openPedia(s.pedia ?? '');
        return true;
      }
      if (code === 'F9') {
        s.setDigestOpen(!s.digestOpen);
        return true;
      }
      if (code === 'Escape' && (s.aim || s.gotoMode || s.tilePick)) {
        s.setAim(null);
        s.setGotoMode(false);
        s.setTilePick(null);
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
      if (ctrl && code === 'KeyK') {
        s.setSettings({ lens: !s.settings.lens });
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
      // Q and E turn the camera unless the selected unit has an order on that key (Reinforce front, Escort).
      const rotate = () => {
        if (code !== 'KeyQ' && code !== 'KeyE') return false;
        view?.camera.rotate(code === 'KeyQ' ? -1 : 1);
        return true;
      };
      if (!u || u.owner !== snap.human) return rotate();
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
      return rotate();
    },
    [view, store],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const st = useGame.getState();
      if (e.target instanceof HTMLInputElement || dialog || st.pedia !== null) return;
      // F10 opens the Civilopedia over any screen.
      if (st.panel) {
        if (e.code === 'F10') {
          e.preventDefault();
          st.openPedia('');
        }
        return;
      }
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
    if (s.tilePick) {
      if (d.button === 2) s.setTilePick(null);
      else finishTilePick(tile);
      return;
    }
    if (s.aim && u && u.owner === snap.human) {
      if (d.button === 2) s.setAim(null);
      else fireAt(u, tile);
      return;
    }
    if ((d.button === 2 || s.gotoMode) && u && u.owner === snap.human && hostileStep(snap.state, u, tile)) {
      s.setGotoMode(false);
      const defender = bestStealthTarget(snap.state, u, tile);
      void s.send({ type: 'moveUnit', unit: u.id, to: tile, ...(defender === undefined ? {} : { defender }) }).then((ok) => {
        const after = useGame.getState().snapshot?.state.units[u.id];
        if (ok && (!after || after.movesLeft <= 0)) useGame.getState().selectNext();
      });
      return;
    }
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
    <div className={`game ${gotoMode ? 'goto' : ''} ${aim || tilePick ? 'aim' : ''}`}>
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
      <TopBar onSave={() => setDialog('save')} onLoad={() => setDialog('load')} onSettings={() => setDialog('settings')} />
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
      {aim && (
        <div className="aim-hint panel">
          Pick a target for{' '}
          {aim.action === 'bombard'
            ? 'bombardment'
            : aim.action === 'nuke'
              ? 'the nuclear strike'
              : aim.action === 'recon'
                ? 'reconnaissance'
                : aim.action === 'rebase'
                  ? 'rebasing'
                  : aim.action === 'airdrop'
                    ? 'the parachute drop'
                    : aim.action === 'airlift'
                      ? 'the airlift (a city with an airport)'
                      : 'the air strike'}{' '}
          · Esc or right-click to cancel
        </div>
      )}
      {tilePick && (
        <div className="aim-hint panel">
          {tilePick.purpose === 'rally' ? 'Click the rally point' : tilePick.purpose === 'patrol' ? 'Click the far end of the patrol route' : tilePick.purpose === 'escort' ? 'Click the unit to escort' : 'Click the centre of the worker region'} · Esc or right-click to cancel
        </div>
      )}
      <TurnDigest onJump={(tile) => view?.centerOn(tile)} />
      <NewsCards onJump={(tile) => view?.centerOn(tile)} />
      <RazeDialog />
      {toast && <div className="toast">{toast}</div>}
      {(dialog === 'save' || dialog === 'load') && <SavesDialog mode={dialog} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {panel?.kind === 'city' && <CityScreen cityId={panel.id} onClose={() => useGame.getState().open(null)} />}
      {panel?.kind === 'domestic' && <DomesticAdvisor onClose={() => useGame.getState().open(null)} />}
      {panel?.kind === 'science' && <ScienceAdvisor onClose={() => useGame.getState().open(null)} />}
      {panel?.kind === 'automation' && <AutomationScreen {...(panel.tab ? { tab: panel.tab } : {})} onClose={() => useGame.getState().open(null)} />}
      {panel?.kind === 'foreign' && <ForeignAdvisor onClose={() => useGame.getState().open(null)} />}
      {panel?.kind === 'victory' && <VictoryScreen {...(panel.gameOver ? { gameOver: true } : {})} onClose={() => useGame.getState().open(null)} />}
      {panel?.kind === 'diplomacy' && <DiplomacyScreen {...(panel.with === undefined ? {} : { initial: panel.with })} onClose={() => useGame.getState().open(null)} />}
      {!panel && <OfferDialog />}
      {!dialog && <HintCard />}
      {pedia !== null && <Civilopedia />}
    </div>
  );
}
