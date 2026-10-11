/**
 * Espionage (docs/rules/espionage.md): embassies and the missions they and planted spies
 * make possible. Missions cost gold and may fail; a caught spy is lost and the victim
 * remembers.
 */
import { learn, replaceCitizens, updateTerritory } from './cities.ts';
import type { CommandError } from './commands.ts';
import { hasContact, meet, remember } from './diplomacy.ts';
import { empireInfo } from './empire.ts';
import { tilesInRadius } from './grid.ts';
import { atWar, hasTechFlag } from './queries.ts';
import type { Rules } from './rules.ts';
import type { GameState } from './state.ts';
import { playerCities } from './territory.ts';
import type { Tx } from './tx.ts';
import { reveal } from './vision.ts';

/** Gold per point of a mission's base cost, per era of the civilization sending it (era 0 counts as 1). */
export const COST_PER_ERA = 3;

/** Chance in percent each mission succeeds before counter-espionage (propaganda uses the culture table). */
export const MISSION_CHANCE: Record<string, number> = {
  embassy: 100,
  investigateCity: 90,
  stealTechnology: 50,
  stealWorldMap: 70,
  plantSpy: 75,
  stealPlans: 60,
  sabotageProduction: 50,
  exposeEnemySpy: 60,
};
/** An Intelligence Agency in the target civilization lowers every chance by this much. */
export const COUNTER_ESPIONAGE = 20;
/** Missions the victim holds against the sender even when they succeed. */
const HOSTILE = new Set(['stealTechnology', 'propaganda', 'sabotageProduction']);

const err = (code: CommandError['code'], message: string): CommandError => ({ code, message });

function agency(rules: Rules, state: GameState, player: number): boolean {
  for (const w of empireInfo(rules, state, player).activeWonders) if (rules.building(w).effects.includes('allowsSpyMissions')) return true;
  return false;
}

export function missionCost(rules: Rules, state: GameState, player: number, mission: string): number {
  return rules.mission(mission).baseCost * COST_PER_ERA * (1 + state.players[player]!.era);
}

/** The culture opinion a city of `target` holds of `player` (docs/rules/espionage.md). */
export function cultureOpinion(rules: Rules, state: GameState, player: number, target: number) {
  const mine = Math.max(1, state.players[player]!.culture);
  const theirs = Math.max(1, state.players[target]!.culture);
  const ratio = Math.floor((mine * 100) / theirs);
  const ordered = [...rules.set.cultureOpinions].sort((a, b) => b.ratioPercent - a.ratioPercent);
  return ordered.find((o) => ratio >= o.ratioPercent) ?? ordered.at(-1)!;
}

/** Chance in percent that `mission` against `target` (and its `city`) succeeds. */
export function missionChance(rules: Rules, state: GameState, player: number, target: number, mission: string, city?: number): number {
  if (mission === 'embassy') return 100;
  let chance = mission === 'propaganda' ? cultureOpinion(rules, state, player, target).propagandaSuccess : (MISSION_CHANCE[mission] ?? 50);
  if (agency(rules, state, target)) chance -= COUNTER_ESPIONAGE;
  // A Courthouse makes its city resistant to bribery: propaganda succeeds half as often.
  const c = city === undefined ? undefined : state.cities[city];
  if (mission === 'propaganda' && c && Object.keys(c.buildings).some((b) => rules.building(b).effects.includes('resistantToBribery'))) chance = Math.floor(chance / 2);
  return Math.max(1, chance);
}

/** Why `player` cannot run `mission` against `target` (and `city`) now, or null. */
export function missionBlocker(rules: Rules, state: GameState, player: number, target: number, mission: string, city?: number): string | null {
  if (!rules.set.espionageMissions.some((m) => m.id === mission)) return 'Unknown mission.';
  const p = state.players[player]!;
  const t = state.players[target];
  if (!t?.alive || t.barbarian || target === player) return 'Pick another civilization.';
  if (!hasContact(state, player, target)) return `You have not met ${t.name}.`;
  const rule = rules.mission(mission);
  const embassy = p.embassies.includes(target);
  const spy = p.spies.includes(target);
  if (mission === 'embassy') {
    if (embassy) return `You already have an embassy with ${t.name}.`;
    if (atWar(state, player, target)) return 'Embassies are not opened in wartime.';
    if (!hasTechFlag(rules, p, 'enablesDiplomats')) return 'Needs the advance that allows embassies (Writing).';
  } else if (mission === 'plantSpy') {
    if (!embassy) return `Needs an embassy with ${t.name} first.`;
    if (spy) return `A spy is already at work in ${t.name}.`;
    if (!agency(rules, state, player)) return 'Needs an Intelligence Agency.';
  } else if (mission === 'exposeEnemySpy') {
    if (!state.players[target]!.spies.includes(player)) return `${t.name} has no spy among your people that you know of.`;
    if (!agency(rules, state, player)) return 'Needs an Intelligence Agency.';
  } else {
    if (rule.needs === 'spy' && !spy) return `Needs a spy planted in ${t.name}.`;
    if (rule.needs === 'either' && !spy && !embassy) return `Needs an embassy or a spy in ${t.name}.`;
    if (rule.needs === 'embassy' && !embassy) return `Needs an embassy with ${t.name}.`;
  }
  const needsCity = ['investigateCity', 'propaganda', 'sabotageProduction'].includes(mission);
  if (needsCity) {
    const c = city === undefined ? undefined : state.cities[city];
    if (!c || c.owner !== target) return `Pick a city of ${t.name}.`;
    if (mission === 'propaganda' && 'palace' in c.buildings) return 'A capital does not fall to propaganda.';
  }
  if (mission === 'stealTechnology' && !t.techs.some((x) => !p.techs.includes(x) && rules.tech(x).prerequisites.every((q) => p.techs.includes(q))))
    return `${t.name} knows nothing you could use yet.`;
  const cost = missionCost(rules, state, player, mission);
  if (p.gold < cost) return `Costs ${cost} gold; the treasury has ${p.gold}.`;
  return null;
}

/** Carries out the `espionage` command. */
export function runMission(rules: Rules, tx: Tx, player: number, target: number, mission: string, city?: number): CommandError | null {
  const why = missionBlocker(rules, tx.state, player, target, mission, city);
  if (why) return err('invalid', why);
  const cost = missionCost(rules, tx.state, player, mission);
  tx.player(player).gold = tx.state.players[player]!.gold - cost;
  const chance = missionChance(rules, tx.state, player, target, mission, city);
  const success = chance >= 100 || tx.random(100) < chance;
  const t = tx.state.players[target]!;
  let detail = '';
  if (!success) {
    // A caught spy is lost; a failed embassy-led mission only causes an incident.
    if (rules.mission(mission).needs !== 'embassy' && tx.state.players[player]!.spies.includes(target) && mission !== 'exposeEnemySpy') {
      tx.player(player).spies = tx.state.players[player]!.spies.filter((x) => x !== target);
      detail = 'The spy was caught.';
    }
    remember(tx, target, player, -20);
    tx.emit({ type: 'espionage', player, target, mission, success: false, cost, ...(city === undefined ? {} : { city }), detail });
    return null;
  }
  switch (mission) {
    case 'embassy': {
      tx.player(player).embassies = [...tx.state.players[player]!.embassies, target].sort((a, b) => a - b);
      const capital = playerCities(tx.state, target).find((c) => 'palace' in c.buildings);
      if (capital) reveal(tx, player, tilesInRadius(tx.state.map, capital.tile, 2), 'Embassy');
      detail = `Embassy opened in ${t.name}.`;
      break;
    }
    case 'investigateCity': {
      const c = tx.state.cities[city!]!;
      reveal(tx, player, tilesInRadius(tx.state.map, c.tile, 2), 'Investigation');
      detail = `${c.name}: size ${c.size}, building ${c.build ? (c.build.kind === 'unit' ? rules.unit(c.build.id).name : rules.building(c.build.id).name) : 'nothing'}.`;
      break;
    }
    case 'stealTechnology': {
      const p = tx.state.players[player]!;
      const options = t.techs.filter((x) => !p.techs.includes(x) && rules.tech(x).prerequisites.every((q) => p.techs.includes(q))).sort();
      const tech = options[tx.random(options.length)]!;
      learn(rules, tx, player, tech);
      detail = `Stole ${rules.tech(tech).name}.`;
      break;
    }
    case 'stealWorldMap': {
      const src = t.explored;
      const p = tx.player(player);
      for (let i = 0; i < src.length; i++) p.explored[i] = (p.explored[i]! | src[i]!) >>> 0;
      detail = `Copied the ${t.name} world map.`;
      break;
    }
    case 'plantSpy':
      tx.player(player).spies = [...tx.state.players[player]!.spies, target].sort((a, b) => a - b);
      detail = `A spy is at work in ${t.name}.`;
      break;
    case 'stealPlans': {
      const tiles = Object.values(tx.state.units).filter((u) => u.owner === target).map((u) => u.tile);
      reveal(tx, player, [...new Set(tiles)], 'Stolen plans');
      detail = `${tiles.length} ${t.name} units located.`;
      break;
    }
    case 'sabotageProduction': {
      const c = tx.state.cities[city!]!;
      tx.city(c.id).shields = 0;
      detail = `Production in ${c.name} destroyed.`;
      break;
    }
    case 'propaganda': {
      const c = tx.state.cities[city!]!;
      const w = tx.city(c.id);
      w.owner = player;
      w.build = null;
      w.queue = [];
      w.shields = 0;
      w.shieldsFor = null;
      w.manualTiles = false;
      w.disorder = 0;
      for (const u of Object.values(tx.state.units).sort((a, b) => a.id - b.id)) {
        if (u.tile !== c.tile || u.owner !== target) continue;
        // The garrison changes sides with the city.
        const x = tx.unit(u.id);
        x.owner = player;
        x.order = null;
        x.routine = null;
        x.fortified = false;
      }
      updateTerritory(rules, tx);
      replaceCitizens(rules, tx, c.id);
      reveal(tx, player, tilesInRadius(tx.state.map, c.tile, 2));
      tx.emit({ type: 'cityRevolted', city: c.id, player, from: target, tile: c.tile, name: c.name });
      detail = `${c.name} joined you.`;
      break;
    }
    case 'exposeEnemySpy':
      tx.player(target).spies = t.spies.filter((x) => x !== player);
      detail = `The ${t.name} spy was unmasked.`;
      break;
  }
  if (HOSTILE.has(mission)) remember(tx, target, player, -10);
  if (!tx.state.players[target]!.contacts.includes(player)) meet(tx, player, target);
  tx.emit({ type: 'espionage', player, target, mission, success: true, cost, ...(city === undefined ? {} : { city }), detail });
  return null;
}
