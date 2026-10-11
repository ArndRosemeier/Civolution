/**
 * Phase 4 rules: contact, war and peace, treaties, deals, reputation, espionage, AI
 * handicaps, airdrops, airlifts, stealth attacks and barbarian landings
 * (docs/rules/diplomacy.md, espionage.md, ai-handicaps.md, air.md, combat.md,
 * barbarians.md).
 */
import { describe, expect, it } from 'vitest';
import {
  apply,
  attitude,
  BREACH_PENALTY,
  CEASEFIRE_TURNS,
  checkInvariants,
  createGame,
  DEAL_TURNS,
  invalidateCaches,
  missionBlocker,
  missionCost,
  PLAYER_COLORS,
  playerUnits,
  relation,
  techCost,
  availableResources,
  resourceSurplus,
  tradeRoute,
  IMP_ROAD,
  type City,
  type Command,
  type GameState,
} from '../src/index.ts';
import { at, endTurnAll, flatGame, place, rules, run } from './helpers.ts';

const techWith = (flag: string) => rules.set.techs.find((t) => t.flags.includes(flag))!.id;
const withTechs = (s: GameState, player: number, techs: string[]) => {
  const p = s.players[player]!;
  s.players[player] = { ...p, techs: [...new Set([...p.techs, ...techs, ...techs.flatMap((t) => rules.tech(t).prerequisites)])] };
  invalidateCaches(s);
};

function found(s: GameState, owner: number, x: number, y: number): { s: GameState; c: City } {
  const u = place(s, owner, 'settler', at(s, x, y));
  s = run(s, { type: 'foundCity', player: owner, unit: u.id });
  return { s, c: Object.values(s.cities).find((k) => k.tile === at(s, x, y))! };
}

function deal(s: GameState, from: number, to: number, give: Extract<Command, { type: 'proposeDeal' }>['give'], take: Extract<Command, { type: 'proposeDeal' }>['take'] = [], accept = true): GameState {
  s = run(s, { type: 'proposeDeal', player: from, target: to, give, take });
  const id = s.diplomacy.proposals.at(-1)!.id;
  return run(s, { type: 'answerDeal', player: to, proposal: id, accept });
}

describe('contact', () => {
  it('needs contact before war, and units meeting make it', () => {
    let s = flatGame();
    s.players = s.players.map((p) => ({ ...p, contacts: [] }));
    const a = place(s, 0, 'warrior', at(s, 20, 20));
    place(s, 1, 'warrior', at(s, 24, 20));
    expect(apply(rules, s, { type: 'declareWar', player: 0, target: 1 }).error?.message).toMatch(/not met/);
    const r = apply(rules, s, { type: 'moveUnit', player: 0, unit: a.id, to: at(s, 22, 20) });
    expect(r.events.some((e) => e.type === 'contactMade')).toBe(true);
    s = r.state;
    expect(relation(s, 0, 1)).toBe('peace');
    expect(s.players[1]!.contacts).toEqual([0]);
    expect(checkInvariants(rules, s)).toEqual([]);
  });
});

describe('war, peace and treaties', () => {
  it('makes peace only by agreement, ends the war and sends units home', () => {
    let { s } = found(flatGame(), 0, 20, 20);
    ({ s } = found(s, 1, 30, 20));
    s = run(s, { type: 'declareWar', player: 0, target: 1 });
    const intruder = place(s, 1, 'warrior', at(s, 21, 21));
    // A declined offer changes nothing.
    s = deal(s, 1, 0, [{ kind: 'peace' }], [], false);
    expect(relation(s, 0, 1)).toBe('war');
    s = deal(s, 1, 0, [{ kind: 'peace' }]);
    expect(relation(s, 0, 1)).toBe('peace');
    expect(s.players[0]!.atWarWith).toEqual([]);
    expect(s.units[intruder.id]!.tile).not.toBe(at(s, 21, 21));
    expect(s.map.territory[s.units[intruder.id]!.tile]).toBe(1);
    expect(checkInvariants(rules, s)).toEqual([]);
  });

  it('costs reputation to break a fresh peace treaty, and everyone remembers', () => {
    let s = flatGame(1, 3);
    s = run(s, { type: 'declareWar', player: 0, target: 1 });
    s = deal(s, 0, 1, [{ kind: 'peace' }]);
    const r = apply(rules, s, { type: 'declareWar', player: 0, target: 1 });
    expect(r.events.some((e) => e.type === 'treatyBroken')).toBe(true);
    s = r.state;
    expect(s.players[0]!.reputation).toBe(100 - BREACH_PENALTY.peace);
    expect(s.players[2]!.memory[0]).toBeLessThan(0);
    expect(attitude(rules, s, 1, 0).level).toBe('furious');
  });

  it('breaks no treaty when declaring on a neighbour merely met', () => {
    let s = flatGame();
    s = run(s, { type: 'declareWar', player: 0, target: 1 });
    expect(s.players[0]!.reputation).toBe(100);
    expect(s.players[0]!.warSince[1]).toBe(s.turn);
  });

  it('calls protection pact partners to war', () => {
    let s = flatGame(1, 3);
    const flag = techWith('enablesMutualProtectionPacts');
    withTechs(s, 1, [flag]);
    withTechs(s, 2, [flag]);
    s = deal(s, 1, 2, [{ kind: 'mutualProtection' }]);
    s = run(s, { type: 'declareWar', player: 0, target: 1 });
    expect(s.players[2]!.atWarWith).toContain(0);
    expect(s.players[2]!.reputation).toBe(100);
    expect(checkInvariants(rules, s)).toEqual([]);
  });

  it('turns a ceasefire back into war when it runs out', () => {
    let s = flatGame();
    s = run(s, { type: 'declareWar', player: 0, target: 1 });
    s = deal(s, 0, 1, [{ kind: 'ceasefire' }]);
    expect(relation(s, 0, 1)).toBe('ceasefire');
    for (let i = 0; i < CEASEFIRE_TURNS; i++) s = endTurnAll(s);
    expect(relation(s, 0, 1)).toBe('war');
  });

  it('allies go to war together', () => {
    let s = flatGame(1, 3);
    const flag = techWith('enablesMilitaryAlliances');
    withTechs(s, 0, [flag]);
    withTechs(s, 1, [flag]);
    s = deal(s, 0, 1, [{ kind: 'alliance', against: 2 }]);
    expect(s.players[2]!.atWarWith).toEqual([0, 1]);
    expect(checkInvariants(rules, s)).toEqual([]);
  });
});

describe('deals', () => {
  it('trades advances, gold and maps', () => {
    let s = flatGame();
    withTechs(s, 0, ['bronzeWorking', techWith('enablesMapTrading')]);
    withTechs(s, 1, ['alphabet']);
    s.players[1] = { ...s.players[1]!, gold: 100, explored: s.players[1]!.explored.map(() => 0) };
    s.players[0] = { ...s.players[0]!, explored: s.players[0]!.explored.map((_w, i) => (i === 0 ? 0xffffffff : 0)) };
    s = deal(s, 0, 1, [{ kind: 'tech', tech: 'bronzeWorking' }, { kind: 'worldMap' }], [{ kind: 'tech', tech: 'alphabet' }, { kind: 'gold', amount: 40 }]);
    expect(s.players[0]!.techs).toContain('alphabet');
    expect(s.players[1]!.techs).toContain('bronzeWorking');
    expect(s.players[0]!.gold - flatGame().players[0]!.gold).toBe(40);
    expect(s.players[1]!.explored[0]).toBe(0xffffffff);
  });

  it('refuses what a side does not have', () => {
    const s = flatGame();
    const r = apply(rules, s, { type: 'proposeDeal', player: 0, target: 1, give: [{ kind: 'gold', amount: 999 }], take: [] });
    expect(r.error?.message).toMatch(/only/);
    const war = run(s, { type: 'declareWar', player: 0, target: 1 });
    expect(apply(rules, war, { type: 'proposeDeal', player: 0, target: 1, give: [{ kind: 'gold', amount: 1 }], take: [] }).error?.message).toMatch(/peace or a ceasefire/);
  });

  it('pays gold per turn for twenty turns, and a default costs reputation', () => {
    let s = flatGame();
    s.players[0] = { ...s.players[0]!, gold: 1000 };
    s = deal(s, 0, 1, [{ kind: 'goldPerTurn', amount: 5 }]);
    const before = s.players[1]!.gold;
    s = endTurnAll(s);
    expect(s.players[1]!.gold).toBe(before + 5);
    for (let i = 1; i < DEAL_TURNS + 1; i++) s = endTurnAll(s);
    expect(s.diplomacy.ongoing).toEqual([]);
    // A payer who cannot pay defaults.
    s = deal(s, 1, 0, [{ kind: 'goldPerTurn', amount: 900 }]);
    s.players[1] = { ...s.players[1]!, gold: 0 };
    s = endTurnAll(s);
    expect(s.diplomacy.ongoing).toEqual([]);
    expect(s.players[1]!.reputation).toBeLessThan(100);
  });

  it('expires unanswered offers when the recipient ends its turn', () => {
    let s = flatGame();
    s = run(s, { type: 'proposeDeal', player: 1, target: 0, give: [{ kind: 'gold', amount: 1 }], take: [] });
    expect(s.diplomacy.proposals).toHaveLength(1);
    s = run(s, { type: 'endTurn', player: 0 });
    expect(s.diplomacy.proposals).toHaveLength(0);
  });

  it('hands over a city with its buildings', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    ({ s } = found(s, 0, 30, 20));
    const second = Object.values(s.cities).find((x) => x.id !== c.id)!;
    s = deal(s, 0, 1, [{ kind: 'city', city: second.id }]);
    expect(s.cities[second.id]!.owner).toBe(1);
    expect(apply(rules, s, { type: 'proposeDeal', player: 0, target: 1, give: [{ kind: 'city', city: c.id }], take: [] }).error?.message).toMatch(/capital/);
    expect(checkInvariants(rules, s)).toEqual([]);
  });
});

describe('espionage', () => {
  it('opens embassies once writing is known, and spy missions need an agency', () => {
    let s = flatGame();
    expect(missionBlocker(rules, s, 0, 1, 'embassy')).toMatch(/Writing/);
    withTechs(s, 0, [techWith('enablesDiplomats')]);
    s.players[0] = { ...s.players[0]!, gold: 500 };
    const cost = missionCost(rules, s, 0, 'embassy');
    expect(cost).toBe(rules.mission('embassy').baseCost * 3);
    s = run(s, { type: 'espionage', player: 0, target: 1, mission: 'embassy' });
    expect(s.players[0]!.embassies).toEqual([1]);
    expect(s.players[0]!.gold).toBe(500 - cost);
    expect(missionBlocker(rules, s, 0, 1, 'plantSpy')).toMatch(/Intelligence Agency/);
  });

  it('steals an advance or gets caught, either way paying', () => {
    const s = flatGame();
    withTechs(s, 0, [techWith('enablesDiplomats')]);
    withTechs(s, 1, ['bronzeWorking']);
    s.players[0] = { ...s.players[0]!, gold: 500, embassies: [1] };
    const r = apply(rules, s, { type: 'espionage', player: 0, target: 1, mission: 'stealTechnology' });
    const e = r.events.find((x) => x.type === 'espionage');
    expect(e?.type === 'espionage' && (e.success ? r.state.players[0]!.techs.includes('bronzeWorking') : r.state.players[1]!.memory[0]! < 0)).toBe(true);
  });
});

describe('AI handicaps', () => {
  const game = (difficulty: string) =>
    createGame(rules, {
      seed: 4,
      map: { worldSize: 'tiny' },
      difficulty,
      players: [
        { name: 'Human', color: PLAYER_COLORS[0]!, human: true },
        { name: 'AI', color: PLAYER_COLORS[1]!, human: false },
      ],
    });

  it('gives AI players extra start units at higher levels', () => {
    const s = game('deity');
    const diff = rules.difficulty('deity');
    expect(playerUnits(s, 0)).toHaveLength(rules.set.general.startUnits.length);
    const extra = diff.aiExtraStartUnits.reduce((a, b) => a + b, 0) + diff.aiDefensiveStartUnits + diff.aiOffensiveStartUnits;
    expect(playerUnits(s, 1)).toHaveLength(rules.set.general.startUnits.length + extra);
  });

  it('scales AI research by the difficulty and leaves humans at the standard cost', () => {
    const s = game('deity');
    expect(techCost(rules, s, 'bronzeWorking', 0)).toBe(48);
    expect(techCost(rules, s, 'bronzeWorking', 1)).toBe(Math.floor((48 * rules.difficulty('deity').costFactor) / 10));
  });

  it('makes advances known to civilizations met cheaper', () => {
    const s = flatGame(1, 3);
    const base = techCost(rules, s, 'bronzeWorking', 0);
    withTechs(s, 1, ['bronzeWorking']);
    expect(techCost(rules, s, 'bronzeWorking', 0)).toBeLessThan(base);
  });
});

describe('air and stealth', () => {
  it('drops paratroopers from a city and airlifts between airports', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    ({ s } = found(s, 0, 40, 20));
    const other = Object.values(s.cities).find((x) => x.id !== c.id)!;
    for (const city of [c, other]) s.cities[city.id] = { ...s.cities[city.id]!, buildings: { ...s.cities[city.id]!.buildings, airport: 1 } };
    invalidateCaches(s);
    const para = place(s, 0, 'paratrooper', c.tile);
    s = run(s, { type: 'airdrop', player: 0, unit: para.id, target: at(s, 23, 22) });
    expect(s.units[para.id]!.tile).toBe(at(s, 23, 22));
    const inf = place(s, 0, 'infantry', c.tile);
    s = run(s, { type: 'airlift', player: 0, unit: inf.id, target: other.tile });
    expect(s.units[inf.id]!.tile).toBe(other.tile);
    const second = place(s, 0, 'infantry', c.tile);
    expect(apply(rules, s, { type: 'airlift', player: 0, unit: second.id, target: other.tile }).error?.message).toMatch(/already/);
  });

  it('lets a stealth attacker pick its target', () => {
    let s = flatGame();
    s = run(s, { type: 'declareWar', player: 0, target: 1 });
    const ocean = rules.terrainIndex('coast');
    for (const t of [at(s, 20, 20), at(s, 22, 20)]) s.map.terrain[t] = ocean;
    invalidateCaches(s);
    const t = at(s, 22, 20);
    place(s, 1, 'destroyer', t);
    const transport = place(s, 1, 'transport', t);
    const sub = place(s, 0, 'submarine', at(s, 20, 20));
    const r = apply(rules, s, { type: 'moveUnit', player: 0, unit: sub.id, to: t, defender: transport.id });
    expect(r.error).toBeUndefined();
    const fight = r.events.find((e) => e.type === 'combat');
    expect(fight?.type === 'combat' && fight.defender).toBe(transport.id);
    // Ordinary units cannot single out a target.
    const destroyer = place(s, 0, 'destroyer', at(s, 20, 20));
    expect(apply(rules, s, { type: 'moveUnit', player: 0, unit: destroyer.id, to: t, defender: transport.id }).error?.message).toMatch(/singled/);
  });
});

describe('barbarian landings', () => {
  it('put raiders ashore next to a coastal city', () => {
    let s = createGame(rules, { seed: 9, map: { worldSize: 'tiny', barbarians: 'raging' }, players: [{ name: 'A', color: PLAYER_COLORS[0]!, human: true }] });
    // A city on the coast.
    const coast = s.map.terrain.findIndex((t, i) => rules.terrains[t]!.canFoundCity && !rules.terrains[t]!.water && s.map.terrain.some((w, j) => rules.terrains[w]!.water && Math.abs((j % s.map.width) - (i % s.map.width)) <= 1 && Math.abs(Math.floor(j / s.map.width) - Math.floor(i / s.map.width)) === 2));
    const settler = place(s, 0, 'settler', coast);
    s = run(s, { type: 'foundCity', player: 0, unit: settler.id });
    s = { ...s, turn: 40 };
    let landed = false;
    for (let i = 0; i < 120 && !landed; i++) {
      const r = apply(rules, s, { type: 'endTurn', player: 0 });
      landed = r.events.some((e) => e.type === 'barbarianLanding');
      s = r.state;
      if (!s.players[0]!.alive) break;
    }
    expect(landed).toBe(true);
  });
});

describe('resource trade routes (docs/rules/trade.md)', () => {
  it('needs a road joining the capitals, and the resource stops when the road is cut', () => {
    let s = flatGame();
    s = found(s, 0, 20, 20).s;
    s = found(s, 1, 30, 20).s;
    const wines = rules.resourceIndex('wines');
    s.map.resource[at(s, 21, 21)] = wines;
    s.map.resource[at(s, 19, 19)] = wines;
    invalidateCaches(s);
    expect(resourceSurplus(rules, s, 0, 'wines')).toBe(1);
    expect(tradeRoute(rules, s, 0, 1)).toBe(false);
    const refused = apply(rules, s, { type: 'proposeDeal', player: 0, target: 1, give: [{ kind: 'resource', resource: 'wines' }], take: [] });
    expect(refused.error?.message).toMatch(/trade route/);
    for (let x = 20; x <= 30; x++) s.map.improvements[at(s, x, 20)]! |= IMP_ROAD;
    invalidateCaches(s);
    expect(tradeRoute(rules, s, 0, 1)).toBe(true);
    s = deal(s, 0, 1, [{ kind: 'resource', resource: 'wines' }]);
    expect(availableResources(rules, s, 1).has('wines')).toBe(true);
    s.map.improvements[at(s, 25, 20)] = 0;
    invalidateCaches(s);
    expect(availableResources(rules, s, 1).has('wines')).toBe(false);
    expect(checkInvariants(rules, s)).toEqual([]);
  });
});
