import { describe, expect, it } from 'vitest';
import {
  apply,
  cityReport,
  defaultAutomation,
  loadGame,
  playerCities,
  playerUnits,
  saveGame,
  type AutomationSettings,
  type City,
  type GameEvent,
  type GameState,
} from '@civolution/engine';
import { at, flatGame, place, rules, run, setTerrain } from '../../engine/test/helpers.ts';
import { empireScenario } from '../../sim/src/scenarios.ts';
import {
  dealAnswer,
  delegateEverything,
  exportRoutines,
  findTemplate,
  governCity,
  importRoutines,
  inputSeconds,
  jobBoard,
  runAutomation,
  templateBuild,
} from '../src/index.ts';

function found(s: GameState, owner: number, x: number, y: number): { s: GameState; c: City } {
  const u = place(s, owner, 'settler', at(s, x, y));
  s = run(s, { type: 'foundCity', player: owner, unit: u.id });
  return { s, c: Object.values(s.cities).find((k) => k.tile === at(s, x, y))! };
}

const settings = (s: GameState, edit: (a: AutomationSettings) => void): GameState => {
  const a = structuredClone(s.players[0]!.automation);
  edit(a);
  return run(s, { type: 'setAutomation', player: 0, settings: a });
};

describe('automation settings', () => {
  it('are validated by the engine and survive a save', () => {
    let s = flatGame();
    const bad = { ...defaultAutomation(), garrison: 99 };
    expect(apply(rules, s, { type: 'setAutomation', player: 0, settings: bad }).error?.message).toMatch(/garrison/);
    const dup = { ...defaultAutomation(), workerTasks: ['roads', 'roads', 'mine', 'irrigate', 'pollution', 'clear', 'railroads', 'connectCities'] as AutomationSettings['workerTasks'] };
    expect(apply(rules, s, { type: 'setAutomation', player: 0, settings: dup }).error?.message).toMatch(/every task once/);
    s = settings(s, (a) => {
      a.delegate.cities = true;
      a.researchGoal = 'monarchy';
    });
    const loaded = loadGame(rules, saveGame(s));
    expect(loaded.players[0]!.automation.delegate.cities).toBe(true);
    expect(loaded.players[0]!.automation.researchGoal).toBe('monarchy');
  });

  it('loads alpha 0.002 saves (format 4) with default settings', () => {
    const s = flatGame();
    const old = JSON.parse(saveGame(s)) as { header: { version: number }; state: GameState & { version: number } };
    old.header.version = 4;
    old.state.version = 4;
    for (const p of old.state.players) delete (p as Partial<typeof p>).automation;
    const loaded = loadGame(rules, JSON.stringify(old));
    expect(loaded.version).toBe(5);
    expect(loaded.players[0]!.automation).toEqual(defaultAutomation());
  });
});

describe('governors', () => {
  function city(): { s: GameState; c: City } {
    const f = found(flatGame(), 0, 20, 20);
    // Grassland around, hills to the east for shields, a little ocean to the south.
    for (const [x, y] of [[22, 20], [21, 21], [22, 22], [21, 19]] as const) setTerrain(f.s, at(f.s, x, y), 'hills');
    const c = { ...f.s.cities[f.c.id]!, size: 2 };
    f.s.cities[c.id] = c;
    return { s: f.s, c };
  }

  it('place citizens for their goal and explain it', () => {
    const { s, c } = city();
    const yieldOf = (preset: 'growth' | 'production') => {
      const plan = governCity(rules, s, c, { preset, hurry: false });
      expect(plan.reason).toMatch(preset === 'growth' ? /Governor \(Growth\)/ : /Governor \(Production\)/);
      return cityReport(rules, s, { ...c, worked: plan.worked, specialists: plan.specialists });
    };
    const growth = yieldOf('growth');
    const production = yieldOf('production');
    expect(growth.foodSurplus).toBeGreaterThan(production.foodSurplus);
    expect(production.shields.value).toBeGreaterThan(growth.shields.value);
    expect(production.foodSurplus).toBeGreaterThanOrEqual(0);
  });

  it('run for delegated cities and pause when the player steps in', () => {
    let { s, c } = city();
    s = settings(s, (a) => {
      a.delegate.cities = true;
      a.defaultGovernor = { preset: 'production', hurry: false };
    });
    const r = runAutomation(rules, s, 0);
    const placed = r.commands.find((x) => x.type === 'setCitizens');
    expect(placed?.reason).toMatch(/Governor \(Production\)/);
    s = settings(r.state, (a) => {
      a.governors[c.id] = { preset: 'production', hurry: false, paused: true };
    });
    expect(runAutomation(rules, s, 0).commands.filter((x) => x.type === 'setCitizens')).toEqual([]);
  });
});

describe('build templates', () => {
  it('build the first entry that applies, with the conditions as the reason', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s.players[0] = { ...s.players[0]!, techs: ['bronzeWorking', 'alphabet', 'codeOfLaws', 'writing', 'literature'] };
    const core = findTemplate(s, 0, 'core')!;
    // No defender yet: the template asks for one.
    expect(templateBuild(rules, s, s.cities[c.id]!, core)?.reason).toMatch(/best defender \(defenders ≤ 0\)/);
    place(s, 0, 'warrior', c.tile);
    s = { ...s };
    const pick = templateBuild(rules, s, s.cities[c.id]!, core);
    expect(pick?.build).toEqual({ kind: 'building', id: 'library' });
  });

  it('are given to new cities and choose their builds when builds are delegated', () => {
    let s = flatGame();
    s = settings(s, (a) => {
      a.delegate.builds = true;
    });
    s = found(s, 0, 20, 20).s;
    const r = runAutomation(rules, s, 0, { events: [] });
    const a = r.state.players[0]!.automation;
    expect(Object.values(a.cityTemplates).map((t) => t.template)).toEqual(['newTown']);
    const build = playerCities(r.state, 0)[0]!.build!;
    expect(build.kind === 'unit' && rules.unit(build.id).defence > 0).toBe(true);
  });
});

describe('the worker pool', () => {
  it('gives each worker its own tile and keeps out of forbidden regions', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s = { ...s, cities: { ...s.cities, [c.id]: { ...s.cities[c.id]!, size: 4 } } };
    const w1 = place(s, 0, 'worker', c.tile, { routine: 'autoWorker' });
    const w2 = place(s, 0, 'worker', c.tile, { routine: 'autoWorker' });
    s = run(s, { type: 'autoCitizens', player: 0, city: c.id });
    let board = jobBoard(rules, s, 0);
    const tiles = board.assignments.map((a) => a.tile);
    expect(board.assignments.map((a) => a.unit).sort()).toEqual([w1.id, w2.id].sort());
    expect(new Set(tiles).size).toBe(2);
    s = settings(s, (a) => {
      a.regions.push({ id: 1, name: 'No roads', center: c.tile, radius: 3, forbid: ['road', 'irrigation', 'mine'] });
    });
    board = jobBoard(rules, s, 0);
    expect(board.jobs.filter((j) => ['road', 'irrigation', 'mine'].includes(j.job))).toEqual([]);
  });
});

describe('policies, rules and the digest', () => {
  it('accept gifts and decline demands by policy', () => {
    const s = flatGame();
    const base = { id: 1, from: 1, to: 0, turn: 1 };
    expect(dealAnswer(s, 0, { ...base, give: [{ kind: 'gold', amount: 10 }], take: [] })?.accept).toBe(true);
    expect(dealAnswer(s, 0, { ...base, give: [], take: [{ kind: 'gold', amount: 10 }] })?.accept).toBe(false);
    expect(dealAnswer(s, 0, { ...base, give: [{ kind: 'worldMap' }], take: [{ kind: 'gold', amount: 10 }] })).toBeNull();
  });

  it("run the player's rules, which export and import", () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s = settings(s, (a) => {
      a.rules.push({ id: a.nextId++, name: 'Scouts explore', enabled: true, trigger: 'unitBuilt', when: [], action: { kind: 'routine', routine: 'explore' } });
    });
    const scout = place(s, 0, 'warrior', c.tile);
    const r = runAutomation(rules, s, 0, { events: [{ type: 'cityBuilt', city: c.id, player: 0, tile: c.tile, build: { kind: 'unit', id: 'warrior' }, unit: scout.id }] });
    expect(r.commands.find((x) => x.type === 'setRoutine' && x.routine === 'explore')?.reason).toMatch(/Rule "Scouts explore"/);
    const file = exportRoutines(s.players[0]!.automation);
    const merged = importRoutines(defaultAutomation(), file);
    expect('error' in merged).toBe(false);
    expect((merged as AutomationSettings).rules.map((x) => x.name)).toEqual(['Scouts explore']);
    expect(importRoutines(defaultAutomation(), '{"format":"other"}')).toEqual({ error: 'This is not a Civolution routines file.' });
  });

  it('lists what needs the player and what automation handled', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    place(s, 0, 'warrior', c.tile);
    s = { ...s };
    let r = runAutomation(rules, s, 0);
    expect(r.digest.some((d) => d.kind === 'idleUnits' && d.needsInput)).toBe(true);
    expect(r.digest.some((d) => d.kind === 'research' && d.needsInput)).toBe(true);
    expect(inputSeconds(r.digest)).toBeGreaterThan(5);
    s = settings(s, (a) => Object.assign(a, delegateEverything(a)));
    r = runAutomation(rules, s, 0, { adopt: true });
    expect(r.digest.filter((d) => d.needsInput)).toEqual([]);
    expect(r.commands.every((x) => (x.reason ?? '').length > 0)).toBe(true);
  });
});

describe('Phase 5 exit criterion', () => {
  it('a 200-city late-game turn needs under 2 minutes of player input, every action with its reason', () => {
    let s = empireScenario(rules);
    expect(playerCities(s, 0).length).toBe(200);
    s = run(s, { type: 'setAutomation', player: 0, settings: delegateEverything(s.players[0]!.automation) });
    let prev = s;
    let events: GameEvent[] = [];
    for (let turn = 0; turn < 3; turn++) {
      const started = performance.now();
      const r = runAutomation(rules, s, 0, { events, prev, adopt: turn === 0 });
      const ms = performance.now() - started;
      expect(r.commands.length).toBeGreaterThan(0);
      expect(r.commands.filter((x) => !x.reason)).toEqual([]);
      expect(inputSeconds(r.digest)).toBeLessThan(120);
      // The automation pass itself stays quick (about 0.1 s on a desktop).
      expect(ms).toBeLessThan(10_000);
      prev = r.state;
      s = r.state;
      events = [];
      for (const p of [0, 1]) {
        const e = apply(rules, s, { type: 'endTurn', player: p });
        s = e.state;
        events.push(...e.events);
      }
    }
    expect(playerUnits(s, 0).filter((u) => u.movesLeft > 0 && u.order === null && u.routine === null).length).toBeLessThan(5);
  }, 120_000);
});
