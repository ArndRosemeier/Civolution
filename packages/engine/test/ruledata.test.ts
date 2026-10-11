/**
 * Rule-file fields the engine honours since Phase 8 (docs/rules/README.md, "Known
 * deviations"): the draft, SAM Missile Battery, building bombard defence, Conquests' bonus
 * tech and reveal-map tech flags, and seats of government found by effect.
 */
import { describe, expect, it } from 'vitest';
import {
  apply,
  createGame,
  PLAYER_COLORS,
  cityBombardDefence,
  defenceStrength,
  draftBlocker,
  draftUnit,
  empireInfo,
  invalidateCaches,
  SAM_DEFENCE_PERCENT,
  TECH_BONUS_ADVANCE,
  TECH_REVEALS_MAP,
  type City,
  type GameState,
} from '../src/index.ts';
import { at, endTurnAll, flatGame, place, rules, run } from './helpers.ts';

function found(s: GameState, owner: number, x: number, y: number): { s: GameState; c: City } {
  const u = place(s, owner, 'settler', at(s, x, y));
  s = run(s, { type: 'foundCity', player: owner, unit: u.id });
  return { s, c: Object.values(s.cities).find((k) => k.tile === at(s, x, y))! };
}

/** `tech` and every advance leading to it. */
function withPrerequisites(tech: string, into = new Set<string>()): Set<string> {
  if (into.has(tech)) return into;
  into.add(tech);
  for (const p of rules.tech(tech).prerequisites) withPrerequisites(p, into);
  return into;
}

function setCity(s: GameState, id: number, patch: Partial<City>): void {
  s.cities[id] = { ...s.cities[id]!, ...patch };
  invalidateCaches(s);
}

describe('the draft', () => {
  it('needs Nationalism and a government that allows it, and is limited per city and turn', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    setCity(s, c.id, { size: 5 });
    s.players[0] = { ...s.players[0]!, techs: ['bronzeWorking'] };
    invalidateCaches(s);
    expect(draftBlocker(rules, s, s.cities[c.id]!)).toMatch(/Nationalism/);
    s.players[0] = { ...s.players[0], techs: [...withPrerequisites('nationalism'), 'bronzeWorking'] };
    invalidateCaches(s);
    // Nationalism brings the Rifleman (defence 5, no resource): the best draftable unit.
    expect(draftUnit(rules, s, 0, s.cities[c.id])).toBe('rifleman');
    expect(draftBlocker(rules, s, s.cities[c.id]!)).toBeNull();
    // Despotism: draft limit 2.
    s = run(s, { type: 'draft', player: 0, city: c.id });
    s = run(s, { type: 'draft', player: 0, city: c.id });
    const city = s.cities[c.id]!;
    expect(city.size).toBe(3);
    expect(city.forcedLabor).toEqual([s.turn + rules.set.general.forcedLaborUnhappyTurns, s.turn + rules.set.general.forcedLaborUnhappyTurns]);
    const drafted = Object.values(s.units).filter((u) => u.type === 'rifleman' && u.tile === c.tile);
    expect(drafted).toHaveLength(2);
    // Drafted units come out as conscripts.
    expect(drafted.every((u) => u.experience === 'conscript' && u.hp === 2)).toBe(true);
    expect(apply(rules, s, { type: 'draft', player: 0, city: c.id }).error?.message).toMatch(/2 drafts per city/);
    s = endTurnAll(s);
    expect(draftBlocker(rules, s, s.cities[c.id]!)).toBeNull();
    // Anarchy allows no draft; a size-1 city has nobody to spare.
    s.players[0] = { ...s.players[0]!, government: 'anarchy' };
    invalidateCaches(s);
    expect(draftBlocker(rules, s, s.cities[c.id]!)).toMatch(/does not allow/);
    s.players[0] = { ...s.players[0], government: 'republic' };
    setCity(s, c.id, { size: 1 });
    expect(draftBlocker(rules, s, s.cities[c.id]!)).toMatch(/at least one citizen/);
  });

  it('drafts the strongest defender the civilization can field', () => {
    const s = flatGame();
    s.players[0] = { ...s.players[0]!, techs: [...withPrerequisites('nationalism'), ...withPrerequisites('replaceableParts')] };
    invalidateCaches(s);
    // Without a city, empire resources count: none here, so not Infantry (rubber) but the
    // Guerilla (defence 6, no resource) beats the Rifleman (5).
    expect(draftUnit(rules, s, 0)).toBe('guerilla');
  });
});

describe('city defences from the rule file', () => {
  it('a SAM Missile Battery doubles defence against air strikes only', () => {
    const { s, c } = found(flatGame(), 1, 20, 20);
    const gun = place(s, 1, 'spearman', c.tile);
    const before = defenceStrength(rules, s, gun, c.tile, { kind: 'air', opponent: 0 }).value;
    setCity(s, c.id, { buildings: { ...s.cities[c.id]!.buildings, samMissileBattery: 1 } });
    expect(defenceStrength(rules, s, gun, c.tile, { kind: 'air', opponent: 0 }).value).toBe(before + 2 * SAM_DEFENCE_PERCENT);
    expect(defenceStrength(rules, s, gun, c.tile, { kind: 'land', opponent: 0 }).mods.some((m) => m.label === 'SAM Missile Battery')).toBe(false);
  });

  it('walls and the coastal fortress shield a city against bombardment', () => {
    const { s, c } = found(flatGame(), 1, 20, 20);
    expect(cityBombardDefence(rules, s, c, false)).toBe(0);
    setCity(s, c.id, { buildings: { ...c.buildings, walls: 1, coastalFortress: 1 } });
    expect(cityBombardDefence(rules, s, s.cities[c.id]!, false)).toBe(rules.building('walls').bombardDefence);
    expect(cityBombardDefence(rules, s, s.cities[c.id]!, true)).toBe(rules.building('coastalFortress').navalBombardDefence);
  });

  it('walls make catapult fire on an empty city miss more often', () => {
    // Catapult 4 against no defender (1.00): 80 % per shot; against walls (8): 33 %.
    const hitRate = (walls: boolean) => {
      let hits = 0;
      const trials = 60;
      for (let seed = 1; seed <= trials; seed++) {
        let { s, c } = found(flatGame(seed), 1, 20, 20);
        place(s, 0, 'settler', at(s, 50, 50));
        place(s, 1, 'settler', at(s, 50, 54));
        s = run(s, { type: 'declareWar', player: 0, target: 1 });
        setCity(s, c.id, { size: 6, buildings: { ...c.buildings, temple: 1, ...(walls ? { walls: 1 } : {}) } });
        const cat = place(s, 0, 'catapult', at(s, 22, 20));
        const r = apply(rules, s, { type: 'bombard', player: 0, unit: cat.id, target: c.tile });
        expect(r.error).toBeUndefined();
        hits += r.events.flatMap((e) => (e.type === 'bombarded' ? e.hits : [])).filter((h) => h.kind !== 'miss').length;
      }
      return hits / trials;
    };
    expect(hitRate(false)).toBeGreaterThan(0.6);
    expect(hitRate(true)).toBeLessThan(0.5);
  });
});

describe('Conquests tech flags', () => {
  it('the first civilization to Philosophy gets a free advance; later ones do not', () => {
    expect(rules.tech('philosophy').flags).toContain(TECH_BONUS_ADVANCE);
    let s = flatGame();
    const prereqs = [...withPrerequisites('philosophy')].filter((t) => t !== 'philosophy');
    for (const p of [0, 1]) s.players[p] = { ...s.players[p]!, techs: prereqs, research: { tech: 'philosophy', beakers: 100000, turns: 50 } };
    // Player 1 waits a turn with no research target.
    s.players[1] = { ...s.players[1]!, research: { tech: null, beakers: 0, turns: 0 } };
    invalidateCaches(s);
    s = endTurnAll(s);
    expect(s.players[0]!.techs).toContain('philosophy');
    expect(s.players[0]!.techs.length).toBe(prereqs.length + 2);
    s.players[1] = { ...s.players[1]!, research: { tech: 'philosophy', beakers: 100000, turns: 50 } };
    s = endTurnAll(s);
    expect(s.players[1]!.techs.length).toBe(prereqs.length + 1);
  });

  it('Satellites reveal the whole map to its discoverer', () => {
    expect(rules.tech('satellites').flags).toContain(TECH_REVEALS_MAP);
    let s = flatGame();
    // Modern advances need every required advance of the earlier eras too.
    const eras = rules.set.eras.map((e) => e.id);
    const earlier = rules.set.techs.filter((t) => eras.indexOf(t.era) < eras.indexOf('modern')).map((t) => t.id);
    const prereqs = [...new Set([...withPrerequisites('satellites'), ...earlier])].filter((t) => t !== 'satellites');
    s.players[0] = { ...s.players[0]!, techs: prereqs, era: eras.indexOf('modern'), explored: s.players[0]!.explored.map(() => 0), research: { tech: 'satellites', beakers: 1e9, turns: 50 } };
    s.players[1] = { ...s.players[1]!, explored: s.players[1]!.explored.map(() => 0) };
    invalidateCaches(s);
    s = endTurnAll(s);
    const n = s.map.terrain.length;
    const known = (p: number) => Array.from({ length: n }, (_, t) => (s.players[p]!.explored[t >> 5]! >>> (t & 31)) & 1).filter(Boolean).length;
    expect(known(0)).toBe(n);
    expect(known(1)).toBe(0);
  });
});

describe('seats of government by effect', () => {
  it('the Secret Police HQ is a second seat only under Communism', () => {
    let { s } = found(flatGame(), 0, 20, 20);
    const second = found(s, 0, 40, 20);
    s = second.s;
    setCity(s, second.c.id, { buildings: { ...second.c.buildings, secretPoliceHq: 1 } });
    const far = (st: GameState) => empireInfo(rules, st, 0);
    const despot = far(s);
    s.players[0] = { ...s.players[0]!, government: 'communism' };
    invalidateCaches(s);
    const communist = far(s);
    // The second city's distance to the nearest seat drops to 0 under Communism.
    expect(JSON.stringify(despot)).not.toBe(JSON.stringify(communist));
  });
});

describe('unique units at the start', () => {
  it('the Inca (expansionist) start with a Chasqui Scout instead of the Scout', () => {
    const s = createGame(rules, {
      seed: 3,
      map: { worldSize: 'tiny' },
      players: [
        { name: 'A', color: PLAYER_COLORS[0]!, human: true, civ: 'inca' },
        { name: 'B', color: PLAYER_COLORS[1]!, human: true, civ: 'americans' },
      ],
    });
    const types = (p: number) => Object.values(s.units).filter((u) => u.owner === p).map((u) => u.type).sort();
    expect(types(0)).toContain('chasquiScout');
    expect(types(0)).not.toContain('scout');
    // The Americans (expansionist too) have no unique scout.
    expect(types(1)).toContain('scout');
  });
});

describe('disbanding in a city', () => {
  it('gives half the unit cost to the current build', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s = run(s, { type: 'setBuild', player: 0, city: c.id, build: { kind: 'unit', id: 'warrior' } });
    const shields = s.cities[c.id]!.shields;
    const sp = place(s, 0, 'spearman', c.tile);
    s = run(s, { type: 'disband', player: 0, unit: sp.id });
    expect(s.cities[c.id]!.shields).toBe(shields + Math.floor(rules.unit('spearman').shieldCost / 2));
    // Outside a city nothing comes back.
    const out = place(s, 0, 'spearman', at(s, 30, 20));
    const before = s.cities[c.id]!.shields;
    s = run(s, { type: 'disband', player: 0, unit: out.id });
    expect(s.cities[c.id]!.shields).toBe(before);
  });
});
