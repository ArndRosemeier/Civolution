/**
 * Invariant registry (PLAN.md §11): facts that must hold between turns in every game.
 * The headless runner checks them after every turn; tests check them after scripted
 * sequences. Each check returns human-readable problems, empty when all is well.
 */
import { neighbour, tileCount } from './grid.ts';
import { canStandOn } from './movement.ts';
import { isExplored } from './queries.ts';
import { canCarry, cargoOf, cargoSpace, isArmy, levelHp, unitMaxMoves } from './units.ts';
import type { Rules } from './rules.ts';
import { FLAG_CAMP, type GameState } from './state.ts';
import { foodBox } from './city.ts';
import { eraFor } from './science.ts';
import { cityRadiusTiles } from './territory.ts';

export interface Invariant {
  id: string;
  check(rules: Rules, state: GameState): string[];
}

export const invariants: Invariant[] = [
  {
    id: 'map-arrays',
    check(rules, s) {
      const n = tileCount(s.map);
      const out: string[] = [];
      for (const key of ['terrain', 'underlying', 'rivers', 'resource', 'improvements', 'flags', 'territory'] as const)
        if (s.map[key].length !== n) out.push(`map.${key} has ${s.map[key].length} entries, expected ${n}`);
      s.map.terrain.forEach((t, i) => {
        if (!rules.terrains[t]) out.push(`tile ${i}: bad terrain ${t}`);
      });
      s.map.resource.forEach((r, i) => {
        if (r !== -1 && !rules.resources[r]) out.push(`tile ${i}: bad resource ${r}`);
      });
      return out;
    },
  },
  {
    id: 'rivers-symmetric',
    check(_rules, s) {
      const out: string[] = [];
      const pairs = [[1, 1, 4], [3, 2, 8], [5, 4, 1], [7, 8, 2]] as const;
      for (let i = 0; i < s.map.rivers.length; i++) {
        for (const [dir, bit, opposite] of pairs) {
          if (!(s.map.rivers[i]! & bit)) continue;
          const j = neighbour(s.map, i, dir);
          if (j >= 0 && !(s.map.rivers[j]! & opposite)) out.push(`river edge at tile ${i} has no partner on ${j}`);
        }
      }
      return out;
    },
  },
  {
    id: 'units-valid',
    check(rules, s) {
      const out: string[] = [];
      const n = tileCount(s.map);
      const owners = new Map<number, number>();
      for (const [key, u] of Object.entries(s.units)) {
        if (String(u.id) !== key) out.push(`unit key ${key} holds unit ${u.id}`);
        if (u.id >= s.nextUnitId) out.push(`unit ${u.id} is not below nextUnitId ${s.nextUnitId}`);
        if (!rules.hasUnit(u.type)) out.push(`unit ${u.id}: unknown type ${u.type}`);
        if (u.tile < 0 || u.tile >= n) {
          out.push(`unit ${u.id}: tile ${u.tile} off the map`);
          continue;
        }
        const p = s.players[u.owner];
        if (!p?.alive) out.push(`unit ${u.id}: owner ${u.owner} is not an active player`);
        else if (!isExplored(p, u.tile)) out.push(`unit ${u.id}: owner has not explored its tile`);
        const blocked = canStandOn(rules, s, u, u.tile);
        if (blocked) out.push(`unit ${u.id} (${u.type}) stands where it cannot: ${blocked}`);
        if (u.movesLeft < 0 || u.movesLeft > unitMaxMoves(rules, s, u)) out.push(`unit ${u.id}: movesLeft ${u.movesLeft} out of range`);
        if (isArmy(rules, u)) {
          const sum = cargoOf(s, u.id).reduce((a, m) => a + m.hp, 0);
          if (u.hp !== sum) out.push(`army ${u.id}: hp ${u.hp} is not its members' ${sum}`);
        } else if (u.hp < 1 || u.hp > levelHp(rules, u.type, u.experience)) out.push(`unit ${u.id}: hp ${u.hp} out of range`);
        if (!rules.set.experienceLevels.some((l) => l.id === u.experience)) out.push(`unit ${u.id}: unknown experience ${u.experience}`);
        if (u.carriedBy !== null) {
          const h = s.units[u.carriedBy];
          if (!h) out.push(`unit ${u.id}: carried by missing unit ${u.carriedBy}`);
          else {
            if (h.tile !== u.tile) out.push(`unit ${u.id}: not on its carrier's tile`);
            if (h.owner !== u.owner) out.push(`unit ${u.id}: carried by another player's unit`);
            if (!isArmy(rules, h) && !canCarry(rules.unit(h.type), rules.unit(u.type))) out.push(`unit ${u.id}: ${h.type} cannot carry ${u.type}`);
          }
        }
        const other = owners.get(u.tile);
        if (other !== undefined && other !== u.owner) out.push(`tile ${u.tile} holds units of players ${other} and ${u.owner}`);
        owners.set(u.tile, u.owner);
        if (u.order?.type === 'goto' && (u.order.target < 0 || u.order.target >= n)) out.push(`unit ${u.id}: goto target off the map`);
      }
      const loads = new Map<number, number>();
      for (const u of Object.values(s.units)) if (u.carriedBy !== null) loads.set(u.carriedBy, (loads.get(u.carriedBy) ?? 0) + 1);
      for (const [id, load] of loads) {
        const h = s.units[id];
        if (h && load > cargoSpace(rules, s, h)) out.push(`unit ${id} carries ${load}, more than its ${cargoSpace(rules, s, h)}`);
      }
      return out;
    },
  },
  {
    id: 'work-has-workers',
    check(_rules, s) {
      const out: string[] = [];
      for (const [tile, w] of Object.entries(s.work)) {
        const working = Object.values(s.units).some((u) => String(u.tile) === tile && u.order?.type === 'work' && u.order.job === w.job);
        if (!working) out.push(`work on tile ${tile} (${w.job}) has no worker`);
        if (w.done < 0) out.push(`work on tile ${tile} has negative progress`);
      }
      return out;
    },
  },
  {
    id: 'players',
    check(rules, s) {
      const out: string[] = [];
      const words = Math.ceil(tileCount(s.map) / 32);
      if (s.players.filter((p) => p.barbarian).length > 1) out.push('more than one barbarian player');
      s.players.forEach((p, i) => {
        if (p.id !== i) out.push(`player at ${i} has id ${p.id}`);
        if (p.explored.length !== words) out.push(`player ${i}: explored bitset has ${p.explored.length} words, expected ${words}`);
        if (p.gold < 0) out.push(`player ${i}: negative gold`);
        const r = p.rates;
        if (r.tax + r.science + r.luxury !== 10 || r.tax < 0 || r.science < 0 || r.luxury < 0) out.push(`player ${i}: rates ${r.tax}/${r.science}/${r.luxury} do not add up to 10`);
        if (p.research.beakers < 0) out.push(`player ${i}: negative beakers`);
        if (p.era !== eraFor(rules, p.techs)) out.push(`player ${i}: era ${p.era} does not match known techs`);
        if (new Set(p.techs).size !== p.techs.length) out.push(`player ${i}: a tech is listed twice`);
        for (const [k, v] of Object.entries(p.weariness)) {
          if (!s.players[Number(k)] || Number(k) === i) out.push(`player ${i}: weariness against bad player ${k}`);
          if (!(v > 0)) out.push(`player ${i}: weariness ${v} against ${k}`);
        }
        for (const e of p.atWarWith) if (!s.players[e]?.atWarWith.includes(i) && s.players[e]?.alive && p.alive) out.push(`player ${i} is at war with ${e} but not the other way round`);
      });
      return out;
    },
  },
  {
    id: 'cities',
    check(rules, s) {
      const out: string[] = [];
      const n = tileCount(s.map);
      const worked = new Map<number, number>();
      const palaces = new Map<number, number>();
      for (const [key, c] of Object.entries(s.cities)) {
        if (String(c.id) !== key) out.push(`city key ${key} holds city ${c.id}`);
        if (c.id >= s.nextCityId) out.push(`city ${c.id} is not below nextCityId`);
        if (c.tile < 0 || c.tile >= n) {
          out.push(`city ${c.id}: tile off the map`);
          continue;
        }
        if (!s.players[c.owner]?.alive) out.push(`city ${c.id}: owner ${c.owner} is not an active player`);
        if (c.size < 1) out.push(`city ${c.id}: size ${c.size}`);
        const specialists = Object.values(c.specialists).reduce((a, x) => a + x, 0);
        if (c.worked.length + specialists !== c.size) out.push(`city ${c.id}: ${c.worked.length} worked + ${specialists} specialists != size ${c.size}`);
        if (c.food < 0 || c.food > foodBox(rules, c.size)) out.push(`city ${c.id}: food ${c.food} outside the box`);
        if (c.shields < 0) out.push(`city ${c.id}: negative shields`);
        if (s.map.territory[c.tile] !== c.owner) out.push(`city ${c.id}: its tile is not in its owner's territory`);
        const area = new Set(cityRadiusTiles(s.map, c.tile));
        for (const t of [c.tile, ...c.worked]) {
          if (worked.has(t)) out.push(`tile ${t} worked by cities ${worked.get(t)} and ${c.id}`);
          worked.set(t, c.id);
          if (!area.has(t)) out.push(`city ${c.id} works tile ${t} outside its area`);
        }
        if ('palace' in c.buildings) palaces.set(c.owner, (palaces.get(c.owner) ?? 0) + 1);
        for (const b of Object.keys(c.buildings)) if (!rules.hasBuilding(b)) out.push(`city ${c.id}: unknown building ${b}`);
      }
      for (const [p, count] of palaces) if (count > 1) out.push(`player ${p} has ${count} palaces`);
      for (const [w, id] of Object.entries(s.wonders)) {
        if (id === -1) continue;
        if (!s.cities[id] || !(w in s.cities[id].buildings)) out.push(`wonder ${w} is recorded in city ${id}, which does not have it`);
      }
      return out;
    },
  },
];

invariants.push({
  id: 'camps',
  check(rules, s) {
    const out: string[] = [];
    s.map.flags.forEach((f, t) => {
      if (!(f & FLAG_CAMP)) return;
      if (rules.terrains[s.map.terrain[t]!]!.water) out.push(`camp on water tile ${t}`);
      if (Object.values(s.cities).some((c) => c.tile === t)) out.push(`camp on city tile ${t}`);
    });
    return out;
  },
});

export function checkInvariants(rules: Rules, state: GameState): string[] {
  return invariants.flatMap((inv) => inv.check(rules, state).map((msg) => `[${inv.id}] ${msg}`));
}

invariants.push({
  id: 'diplomacy',
  check(rules, s) {
    const out: string[] = [];
    s.players.forEach((p, i) => {
      if (p.reputation < 0 || p.reputation > 100) out.push(`player ${i}: reputation ${p.reputation}`);
      for (const o of p.contacts) {
        if (o === i || s.players[o]?.barbarian) out.push(`player ${i}: contact with ${o}`);
        else if (!s.players[o]?.contacts.includes(i)) out.push(`player ${i} has met ${o} but not the other way round`);
      }
      if (p.barbarian && p.contacts.length > 0) out.push('the barbarians have contacts');
      for (const e of p.atWarWith) {
        if (!s.players[e]?.barbarian && !p.contacts.includes(e) && p.alive && s.players[e]?.alive) out.push(`player ${i} is at war with ${e} without contact`);
        if (p.alive && s.players[e]?.alive && !(String(e) in p.warSince)) out.push(`player ${i}: no start turn for the war with ${e}`);
      }
      for (const [k, v] of Object.entries(p.memory)) if (v < -100 || v > 100 || Number(k) === i) out.push(`player ${i}: memory ${v} of ${k}`);
    });
    const seen = new Set<string>();
    for (const t of s.diplomacy.treaties) {
      const [a, b] = t.parties;
      if (a >= b) out.push(`treaty ${t.id}: parties out of order`);
      if (t.id >= s.diplomacy.nextId) out.push(`treaty ${t.id} is not below nextId`);
      const key = `${t.kind}:${a}:${b}:${t.against ?? ''}`;
      if (seen.has(key)) out.push(`treaty ${t.kind} between ${a} and ${b} twice`);
      seen.add(key);
      const war = s.players[a]?.atWarWith.includes(b);
      if (war && t.kind !== 'embargo') out.push(`treaty ${t.kind} between ${a} and ${b} while at war`);
    }
    for (const o of s.diplomacy.ongoing) {
      if (o.from === o.to) out.push(`ongoing deal ${o.id} with itself`);
      if (o.item.kind === 'resource' && !rules.resources.some((r) => r.id === (o.item as { resource: string }).resource)) out.push(`ongoing deal ${o.id}: unknown resource`);
    }
    return out;
  },
});
