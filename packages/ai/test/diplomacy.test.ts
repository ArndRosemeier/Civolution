/**
 * The AI's demands and its answers to them (docs/ai.md, owner's ruling 2026-10-11):
 * withdrawal demands when foreign troops threaten a city, rare tribute demands of weaker
 * civilizations it dislikes, and giving in or not by strength and temper.
 */
import { describe, expect, it } from 'vitest';
import { apply, DEMAND_COOLDOWN, type City, type GameState, type Proposal } from '@civolution/engine';
import { at, flatGame, place, rules, run } from '../../engine/test/helpers.ts';
import { makeDemands, respond, TRIBUTE_CHANCE } from '../src/diplomacy.ts';
import type { Ctx } from '../src/military.ts';
import { dealGain } from '../src/value.ts';
import { buildView } from '../src/view.ts';

function found(s: GameState, owner: number, x: number, y: number): { s: GameState; c: City } {
  const u = place(s, owner, 'settler', at(s, x, y));
  s = run(s, { type: 'foundCity', player: owner, unit: u.id });
  return { s, c: Object.values(s.cities).find((k) => k.tile === at(s, x, y))! };
}

/** Runs `makeDemands` for `player` on `s`; returns the state after its commands. */
function demands(s: GameState, player: number): GameState {
  let current = s;
  const ctx: Ctx = {
    view: buildView(rules, s, player),
    state: () => current,
    act: (cmd) => {
      const r = apply(rules, current, cmd);
      if (r.error) throw new Error(`${cmd.type} rejected: ${r.error.message}`);
      current = r.state;
      return true;
    },
  };
  makeDemands(ctx);
  return current;
}

/** Two civilizations (0: `civ0`, 1: `civ1`), cities at (10, 20) and (30, 20), three of 0's warriors next to 1's city. */
function standoff(civ0?: string, civ1?: string): GameState {
  let s = flatGame(1, 2, { civs: [civ0, civ1] });
  s.players = s.players.map((p) => ({ ...p, human: false }));
  s = found(s, 0, 10, 20).s;
  s = found(s, 1, 30, 20).s;
  for (const t of [at(s, 31, 20), at(s, 29, 20), at(s, 30, 21)]) place(s, 0, 'warrior', t);
  return s;
}

/** Adds `n` spearmen of `player` at its city (10, 20) or (30, 20). */
function army(s: GameState, player: number, n: number): void {
  for (let i = 0; i < n; i++) place(s, player, 'spearman', at(s, player === 0 ? 10 : 30, 20));
}

const demandOf = (s: GameState, from: number, to: number): Proposal | undefined => s.diplomacy.proposals.find((p) => p.from === from && p.to === to && p.demand);

describe('withdrawal demands', () => {
  it('are made when troops threaten a city, once, and not again within the cooldown', () => {
    let s = demands(standoff(), 1);
    const p = demandOf(s, 1, 0);
    expect(p?.demand).toEqual({ kind: 'withdraw', war: true });
    expect(p?.take).toEqual([{ kind: 'withdraw' }]);
    // Still pending: no second demand.
    expect(demands(s, 1).diplomacy.proposals).toHaveLength(1);
    s = run(s, { type: 'answerDeal', player: 0, proposal: p!.id, accept: true });
    for (const t of [at(s, 31, 20), at(s, 29, 20), at(s, 30, 21)]) place(s, 0, 'warrior', t);
    expect(demandOf(demands(s, 1), 1, 0)).toBeUndefined();
    s = { ...s, turn: s.turn + DEMAND_COOLDOWN.withdraw };
    expect(demandOf(demands(s, 1), 1, 0)).toBeDefined();
  });

  it('are not made over a few units that pose no threat', () => {
    let s = flatGame();
    s = found(s, 0, 10, 20).s;
    const { s: next, c } = found(s, 1, 30, 20);
    s = next;
    place(s, 1, 'spearman', c.tile);
    place(s, 0, 'warrior', at(s, 31, 20));
    expect(demands(s, 1).diplomacy.proposals).toEqual([]);
  });

  it('are given in to by a weaker or peaceful AI; a stronger warlike one refuses and goes to war', () => {
    const answer = (s: GameState) => {
      s = demands(s, 1);
      const p = demandOf(s, 1, 0)!;
      return respond(rules, s, 0, p);
    };
    // Zulu (aggression 2), weaker: withdraws.
    let s = standoff('zulu');
    army(s, 1, 6);
    expect(answer(s)).toBe(true);
    // Zulu, far stronger: refuses.
    s = standoff('zulu');
    army(s, 0, 12);
    expect(answer(s)).toBe(false);
    // French (aggression −2), far stronger: still withdraws.
    s = standoff('french');
    army(s, 0, 12);
    expect(answer(s)).toBe(true);
    // A refusal answered through the engine means war.
    s = standoff('zulu');
    army(s, 0, 12);
    s = demands(s, 1);
    s = run(s, { type: 'answerDeal', player: 0, proposal: demandOf(s, 1, 0)!.id, accept: false });
    expect(s.players[1]!.atWarWith).toEqual([0]);
  });
});

describe('tribute demands', () => {
  /** A strong civilization 1 that loathes a weak, rich civilization 0; turn by turn over `turns` turns, refusals without war. */
  function count(civ1: string, turns: number, memory = -100): number {
    let s = flatGame(3, 2, { civs: ['dutch', civ1] });
    s = found(s, 0, 10, 20).s;
    s = found(s, 1, 30, 20).s;
    army(s, 1, 10);
    s.players[0] = { ...s.players[0]!, gold: 300 };
    s.players[1] = { ...s.players[1]!, memory: { 0: memory } };
    let made = 0;
    let last = -Infinity;
    for (let t = 20; t < 20 + turns; t++) {
      s = { ...s, turn: t, players: s.players.map((p) => (p.id === 1 ? { ...p, memory: { 0: memory } } : p)) };
      const after = demands(s, 1);
      const p = demandOf(after, 1, 0);
      if (!p) continue;
      made++;
      expect(p.demand!.kind).toBe('tribute');
      expect(t - last).toBeGreaterThanOrEqual(DEMAND_COOLDOWN.tribute);
      last = t;
      // An aggressive leader means it.
      expect(p.demand!.war).toBe(true);
      // The demand asks for something and offers nothing.
      expect(p.give).toEqual([]);
      expect(dealGain(rules, after, 1, p)).toBeGreaterThan(0);
      s = run(after, { type: 'answerDeal', player: 0, proposal: p.id, accept: true });
    }
    return made;
  }

  it('are rare, made by aggressive leaders of weaker civilizations they dislike', () => {
    expect(TRIBUTE_CHANCE(2)).toBeLessThanOrEqual(5);
    const made = count('zulu', 300);
    expect(made).toBeGreaterThan(0);
    expect(made).toBeLessThanOrEqual(300 / DEMAND_COOLDOWN.tribute);
  });

  it('are never made by a peaceful leader or of a civilization the AI likes', () => {
    expect(count('french', 200)).toBe(0);
    expect(count('zulu', 200, 60)).toBe(0);
  });

  it('are paid by a weaker AI and refused by a stronger one', () => {
    let s = flatGame(1, 2, { civs: ['dutch', 'zulu'] });
    s = found(s, 0, 10, 20).s;
    s = found(s, 1, 30, 20).s;
    s.players[0] = { ...s.players[0]!, gold: 300 };
    const demand = (st: GameState): Proposal => {
      const r = run(st, { type: 'proposeDeal', player: 1, target: 0, give: [], take: [{ kind: 'gold', amount: 100 }], demand: { kind: 'tribute', war: true } });
      return r.diplomacy.proposals.at(-1)!;
    };
    const weak = structuredClone(s);
    army(weak, 1, 10);
    expect(respond(rules, weak, 0, demand(weak))).toBe(true);
    const strong = structuredClone(s);
    army(strong, 0, 10);
    expect(respond(rules, strong, 0, demand(strong))).toBe(false);
  });
});
