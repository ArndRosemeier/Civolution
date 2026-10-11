/**
 * The AI's armed forces (PLAN.md §9): garrisons, the field army and its campaign against
 * one enemy city at a time (gather at a staging city, march, bombard, assault), local
 * counter-attacks, air strikes, leaders and armies, and upgrades. Every action is an
 * ordinary command; odds come from the engine's own combat preview.
 */
import {
  attackBlocker,
  cargoOf,
  cargoSpace,
  cityAt,
  distance,
  isExplored,
  neighbours,
  playerCities,
  playerUnits,
  previewAttack,
  upgradeQuote,
  armyCount,
  armyLimit,
  type City,
  type Command,
  type GameState,
  type Unit,
} from '@civolution/engine';
import { garrisonFor, type BuildNeeds } from './build.ts';
import { roleOf, type View } from './view.ts';

export interface Ctx {
  view: View;
  state: () => GameState;
  /** Issues a command; returns whether the engine accepted it. */
  act: (cmd: Command) => boolean;
}

const why = (text: string) => `AI: ${text}`;

function hostileTo(state: GameState, player: number, other: number): boolean {
  if (other === player) return false;
  const o = state.players[other]!;
  return o.barbarian || state.players[player]!.atWarWith.includes(other);
}

function enemyAt(state: GameState, player: number, tile: number): boolean {
  for (const u of Object.values(state.units)) if (u.tile === tile && hostileTo(state, player, u.owner)) return true;
  const c = cityAt(state, tile);
  return !!c && hostileTo(state, player, c.owner);
}

/** Attacks a neighbouring enemy if the odds reach `threshold`; returns whether it attacked. */
function strike(ctx: Ctx, unitId: number, tiles: number[], threshold: number, reason: string): boolean {
  const s = ctx.state();
  const u = s.units[unitId];
  if (!u || u.movesLeft <= 0) return false;
  let best: { tile: number; odds: number } | null = null;
  for (const t of tiles) {
    if (distance(s.map, u.tile, t) !== 1 || !enemyAt(s, u.owner, t)) continue;
    if (attackBlocker(ctx.view.rules, s, u, t)) continue;
    const p = previewAttack(ctx.view.rules, s, u, t);
    // An empty enemy city or lone worker is taken for free.
    const odds = p ? p.odds.attackerWins + p.odds.attackerRetreats * 0.5 : 1;
    if (odds >= threshold && (!best || odds > best.odds)) best = { tile: t, odds };
  }
  if (!best) return false;
  return ctx.act({ type: 'moveUnit', player: u.owner, unit: u.id, to: best.tile, reason: why(`${reason} (${Math.round(best.odds * 100)}% odds)`) });
}

/** Siege units fire at an enemy-held tile in range. */
function bombardTarget(ctx: Ctx, unit: Unit, target: number): boolean {
  const r = ctx.view.rules.unit(unit.type);
  if (r.bombardStrength <= 0 || !r.specialActions.includes('bombard') || unit.movesLeft <= 0 || unit.attacked) return false;
  const s = ctx.state();
  if (distance(s.map, unit.tile, target) > Math.max(1, r.bombardRange)) return false;
  if (!Object.values(s.units).some((x) => x.tile === target && hostileTo(s, unit.owner, x.owner))) return false;
  return ctx.act({ type: 'bombard', player: unit.owner, unit: unit.id, target, reason: why('softening the defenders') });
}

function goto(ctx: Ctx, u: Unit, to: number, reason: string): boolean {
  if (u.tile === to || u.movesLeft <= 0) return false;
  if (u.order?.type === 'goto' && u.order.target === to) return false;
  return ctx.act({ type: 'goto', player: u.owner, unit: u.id, to, reason: why(reason) });
}

function fortify(ctx: Ctx, u: Unit, reason: string): void {
  if (u.fortified || u.movesLeft <= 0) return;
  const r = ctx.view.rules.unit(u.type);
  if (r.domain !== 'land') {
    ctx.act({ type: 'sentry', player: u.owner, unit: u.id, reason: why(reason) });
    return;
  }
  ctx.act({ type: 'fortify', player: u.owner, unit: u.id, reason: why(reason) });
}

function nearestCity(state: GameState, cities: City[], tile: number, mass: Int32Array): City | null {
  let best: City | null = null;
  let bestD = Infinity;
  for (const c of cities) {
    if (mass[c.tile] !== mass[tile] && mass[tile] !== -1) continue;
    const d = distance(state.map, c.tile, tile);
    if (d < bestD || (d === bestD && best && c.id < best.id)) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/**
 * Garrisons: each city keeps its wanted number of its best defenders fortified; spare
 * defenders walk to cities that are short.
 */
export function manageGarrisons(ctx: Ctx, needs: BuildNeeds): Set<number> {
  const { view } = ctx;
  const rules = view.rules;
  const assigned = new Set<number>();
  const s0 = ctx.state();
  const cities = playerCities(s0, view.player);
  const short: { city: City; missing: number }[] = [];
  for (const c of cities) {
    const want = needs.garrison.get(c.id) ?? garrisonFor(view, c);
    const here = Object.values(s0.units)
      .filter((u) => u.owner === view.player && u.tile === c.tile && u.carriedBy === null && roleOf(rules.unit(u.type)) === 'defender')
      .sort((a, b) => rules.unit(b.type).defence - rules.unit(a.type).defence || b.hp - a.hp || a.id - b.id);
    here.slice(0, want).forEach((u) => assigned.add(u.id));
    if (here.length < want) short.push({ city: c, missing: want - here.length });
  }
  // Spare defenders: in cities beyond the garrison, or out in the open.
  const spare = playerUnits(s0, view.player).filter(
    (u) => !assigned.has(u.id) && u.carriedBy === null && roleOf(rules.unit(u.type)) === 'defender' && !u.routine && u.order?.type !== 'goto',
  );
  for (const u of spare) {
    short.sort((a, b) => distance(s0.map, a.city.tile, u.tile) - distance(s0.map, b.city.tile, u.tile) || a.city.id - b.city.id);
    const target = short.find((x) => x.missing > 0 && view.masses[x.city.tile] === view.masses[u.tile]);
    if (target) {
      target.missing--;
      assigned.add(u.id);
      goto(ctx, u, target.city.tile, `reinforcing ${target.city.name}`);
      continue;
    }
    if (!cityAt(s0, u.tile)) {
      const home = nearestCity(s0, cities, u.tile, view.masses);
      if (home) goto(ctx, u, home.tile, 'back to the nearest city');
    }
  }
  for (const id of assigned) {
    const u = ctx.state().units[id];
    if (u && cityAt(ctx.state(), u.tile)?.owner === view.player && u.order?.type !== 'goto') fortify(ctx, u, 'garrison');
  }
  return assigned;
}

/** Units in a threatened city strike nearby enemies when the odds are good and the walls stay manned. */
export function counterAttack(ctx: Ctx): void {
  const { view } = ctx;
  for (const c of view.cities) {
    if ((view.threat.get(c.id) ?? 0) === 0) continue;
    const s = ctx.state();
    const near = neighbours(s.map, c.tile).filter((t) => enemyAt(s, view.player, t));
    if (near.length === 0) continue;
    const here = Object.values(s.units)
      .filter((u) => u.owner === view.player && u.tile === c.tile && u.carriedBy === null && view.rules.unit(u.type).attack > 0)
      .sort((a, b) => view.rules.unit(b.type).attack - view.rules.unit(a.type).attack || a.id - b.id);
    for (const u of here) {
      const left = Object.values(ctx.state().units).filter((x) => x.owner === view.player && x.tile === c.tile && view.rules.unit(x.type).defence > 0).length;
      if (left <= 1 && roleOf(view.rules.unit(u.type)) === 'defender') break;
      strike(ctx, u.id, near, 0.7, `sallying out of ${c.name}`);
    }
  }
}

export interface Campaign {
  enemy: number;
  target: City;
  staging: City;
}

/** The enemy city to march on: known, on a land mass the AI holds, nearest to one of its cities. */
export function chooseTarget(view: View, state: GameState, enemies: number[]): Campaign | null {
  const mine = playerCities(state, view.player);
  if (mine.length === 0) return null;
  let best: Campaign | null = null;
  let bestScore = Infinity;
  for (const c of Object.values(state.cities)) {
    if (!enemies.includes(c.owner) || !isExplored(view.me, c.tile)) continue;
    const staging = nearestCity(state, mine, c.tile, view.masses);
    if (!staging || view.masses[staging.tile] !== view.masses[c.tile]) continue;
    const d = distance(state.map, staging.tile, c.tile);
    if (d > 24) continue;
    const defenders = view.visible[c.tile] ? Object.values(state.units).filter((u) => u.tile === c.tile && u.owner === c.owner).length : 2;
    const score = d * 2 + defenders * 3 + c.size - ('palace' in c.buildings ? 0 : 0);
    if (score < bestScore || (score === bestScore && best && c.id < best.target.id)) {
      best = { enemy: c.owner, target: c, staging };
      bestScore = score;
    }
  }
  return best;
}

/** Approach tiles round a target: land next to it, free of enemies, nearest the unit first. */
function approaches(ctx: Ctx, target: number, from: number): number[] {
  const s = ctx.state();
  const rules = ctx.view.rules;
  return neighbours(s.map, target)
    .filter((t) => {
      const terr = rules.terrains[s.map.terrain[t]!]!;
      return !terr.water && !terr.impassable && !enemyAt(s, ctx.view.player, t) && ctx.view.masses[t] === ctx.view.masses[target];
    })
    .sort((a, b) => {
      const da = distance(s.map, a, from) - rules.terrains[s.map.terrain[a]!]!.defenceBonus / 50;
      const db = distance(s.map, b, from) - rules.terrains[s.map.terrain[b]!]!.defenceBonus / 50;
      return da - db || a - b;
    });
}

/**
 * The field army: gathers at the staging city until strong enough, then marches on the
 * target, bombards it and assaults it. Opportunistic attacks on the way.
 */
export function runCampaign(ctx: Ctx, campaign: Campaign | null, garrison: Set<number>, gatherAt: City | null): void {
  const { view } = ctx;
  const rules = view.rules;
  const s0 = ctx.state();
  const field = playerUnits(s0, view.player).filter((u) => {
    if (garrison.has(u.id) || u.carriedBy !== null || u.routine) return false;
    const r = roleOf(rules.unit(u.type));
    return (r === 'attacker' || r === 'siege' || (r === 'army' && cargoOf(s0, u.id).length > 0)) && rules.unit(u.type).domain === 'land';
  });
  if (field.length === 0) return;
  // Strike anything weak within reach first.
  for (const u of field) {
    const s = ctx.state();
    const v = s.units[u.id];
    if (!v || roleOf(rules.unit(v.type)) === 'siege') continue;
    const near = neighbours(s.map, v.tile).filter((t) => enemyAt(s, view.player, t) && !cityAt(s, t));
    if (near.length > 0) strike(ctx, v.id, near, 0.65, 'attacking an exposed enemy');
  }
  if (!campaign) {
    // No war to fight: wait in the gathering city (or the nearest one).
    for (const u of field) {
      const v = ctx.state().units[u.id];
      if (!v || v.movesLeft <= 0) continue;
      const home = gatherAt && view.masses[gatherAt.tile] === view.masses[v.tile] ? gatherAt : nearestCity(ctx.state(), playerCities(ctx.state(), view.player), v.tile, view.masses);
      if (!home) continue;
      if (v.tile === home.tile) fortify(ctx, v, 'standing ready');
      else goto(ctx, v, home.tile, `gathering at ${home.name}`);
    }
    return;
  }
  const { target, staging } = campaign;
  const s = ctx.state();
  const live = s.cities[target.id];
  if (!live || live.owner !== campaign.enemy) return;
  const toTarget = (u: Unit) => distance(s.map, u.tile, target.tile);
  const stagingDist = distance(s.map, staging.tile, target.tile);
  const visibleDefenders = view.visible[target.tile] ? Object.values(s.units).filter((u) => u.tile === target.tile && u.owner === target.owner).length : Math.max(2, Math.ceil(target.size / 3));
  const needed = Math.max(4, visibleDefenders * 2 + 2);
  const ready = field.filter((u) => toTarget(u) <= stagingDist + 1 || distance(s.map, u.tile, staging.tile) <= 2);
  const close = field.filter((u) => toTarget(u) <= 2);
  const advance = ready.length >= needed || close.length >= Math.ceil(needed / 2);
  if (!advance) {
    for (const u of field) {
      const v = ctx.state().units[u.id];
      if (!v) continue;
      if (distance(ctx.state().map, v.tile, staging.tile) <= 1 && toTarget(v) >= stagingDist) {
        if (v.tile === staging.tile) fortify(ctx, v, `mustering at ${staging.name} against ${target.name}`);
        continue;
      }
      if (toTarget(v) < stagingDist) continue;
      goto(ctx, v, staging.tile, `mustering at ${staging.name} against ${target.name}`);
    }
    return;
  }
  // Siege first, then the assault.
  const adjacent = () => field.map((u) => ctx.state().units[u.id]).filter((v): v is Unit => !!v && distance(ctx.state().map, v.tile, target.tile) === 1);
  for (const v of adjacent()) if (roleOf(rules.unit(v.type)) === 'siege') bombardTarget(ctx, v, target.tile);
  const attackers = adjacent().filter((v) => roleOf(rules.unit(v.type)) !== 'siege');
  // Many units at the walls accept worse odds; a lone one waits for help.
  const threshold = attackers.length >= 6 ? 0.3 : attackers.length >= 3 ? 0.45 : 0.6;
  for (let round = 0; round < attackers.length; round++) {
    const sorted = adjacent()
      .filter((v) => roleOf(rules.unit(v.type)) !== 'siege' && v.movesLeft > 0 && !v.attacked)
      .map((v) => {
        const p = previewAttack(rules, ctx.state(), v, target.tile);
        return { v, odds: p ? p.odds.attackerWins : 1 };
      })
      .sort((a, b) => b.odds - a.odds || a.v.id - b.v.id);
    const next = sorted[0];
    if (!next || next.odds < threshold) break;
    if (!strike(ctx, next.v.id, [target.tile], threshold, `assaulting ${target.name}`)) break;
    if (ctx.state().cities[target.id]?.owner === view.player) break;
  }
  // Everyone else closes in.
  for (const u of field) {
    const v = ctx.state().units[u.id];
    if (!v || v.movesLeft <= 0) continue;
    const d = distance(ctx.state().map, v.tile, target.tile);
    if (d <= 1) {
      if (v.order === null && !v.fortified && roleOf(rules.unit(v.type)) !== 'siege') fortify(ctx, v, `besieging ${target.name}`);
      continue;
    }
    const spot = approaches(ctx, target.tile, v.tile)[0];
    if (spot !== undefined) goto(ctx, v, spot, `marching on ${target.name}`);
  }
}

/** Bombers strike enemy units or cities in range; fighters guard the skies. */
export function runAir(ctx: Ctx): void {
  const { view } = ctx;
  const rules = view.rules;
  for (const u of playerUnits(ctx.state(), view.player)) {
    const r = rules.unit(u.type);
    if (r.domain !== 'air' || u.movesLeft <= 0 || u.attacked) continue;
    const s = ctx.state();
    if (view.enemies.length === 0) continue;
    if (r.airMissions.includes('bomb') && r.bombardStrength > 0) {
      const targets = Object.values(s.units)
        .filter((x) => view.enemies.includes(x.owner) && view.visible[x.tile] && distance(s.map, u.tile, x.tile) <= r.operationalRange && distance(s.map, u.tile, x.tile) >= 1)
        .map((x) => x.tile)
        .sort((a, b) => distance(s.map, u.tile, a) - distance(s.map, u.tile, b) || a - b);
      if (targets[0] !== undefined) {
        ctx.act({ type: 'airMission', player: view.player, unit: u.id, mission: 'bomb', target: targets[0], reason: why('air strike') });
        continue;
      }
    }
    if (r.airMissions.includes('intercept') && u.order?.type !== 'intercept') ctx.act({ type: 'airMission', player: view.player, unit: u.id, mission: 'intercept', reason: why('guarding the skies') });
  }
}

/** Great leaders form armies or hurry a wonder; armies take on attackers in their city. */
export function runLeaders(ctx: Ctx): void {
  const { view } = ctx;
  const rules = view.rules;
  for (const u of playerUnits(ctx.state(), view.player)) {
    const r = rules.unit(u.type);
    const s = ctx.state();
    if (r.abilities.includes('leader') && u.movesLeft > 0) {
      const here = cityAt(s, u.tile);
      if (here?.owner === view.player) {
        const building = here.build?.kind === 'building' ? rules.building(here.build.id) : null;
        if (building && (building.kind === 'wonder' || building.kind === 'smallWonder') && here.shields < building.cost && ctx.act({ type: 'leaderHurry', player: view.player, unit: u.id, reason: why('finishing a wonder') })) continue;
        if (armyCount(rules, s, view.player) < armyLimit(rules, s, view.player) && ctx.act({ type: 'buildArmy', player: view.player, unit: u.id, reason: why('forming an army') })) continue;
      }
      const capital = view.capital;
      if (capital && u.tile !== capital.tile) goto(ctx, u, capital.tile, 'to the capital');
      continue;
    }
    if (r.abilities.includes('army') && cityAt(s, u.tile)?.owner === view.player) {
      const room = cargoSpace(rules, s, u) - cargoOf(s, u.id).length;
      if (room <= 0) continue;
      const recruits = Object.values(s.units)
        .filter((x) => x.owner === view.player && x.tile === u.tile && x.carriedBy === null && roleOf(rules.unit(x.type)) === 'attacker')
        .sort((a, b) => rules.unit(b.type).attack - rules.unit(a.type).attack || a.id - b.id)
        .slice(0, room);
      for (const x of recruits) ctx.act({ type: 'joinArmy', player: view.player, unit: x.id, army: u.id, reason: why('joining the army') });
    }
  }
}

/** Upgrades units in cities while the treasury keeps a reserve. */
export function runUpgrades(ctx: Ctx): void {
  const { view } = ctx;
  const reserve = 40 + view.cities.length * 8;
  for (const u of playerUnits(ctx.state(), view.player)) {
    const s = ctx.state();
    if (u.movesLeft <= 0 || cityAt(s, u.tile)?.owner !== view.player) continue;
    const q = upgradeQuote(view.rules, s, u);
    if ('reason' in q || s.players[view.player]!.gold - q.gold < reserve) continue;
    ctx.act({ type: 'upgrade', player: view.player, unit: u.id, reason: why(`upgrading to ${view.rules.unit(q.to).name}`) });
  }
}
