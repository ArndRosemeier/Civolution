/**
 * Winning and losing (docs/rules/victory.md): conquest, domination, space, culture, the
 * United Nations, the score at the last turn, and the game modes regicide, mass regicide,
 * elimination and victory points.
 */
import { replaceCitizens, updateTerritory } from './cities.ts';
import { attitude, civilizations, score } from './diplomacy.ts';
import { atWar } from './queries.ts';
import type { Rules } from './rules.ts';
import { arrivedSpaceship } from './space.ts';
import type { GameOptions, GameState, VictoryKind } from './state.ts';
import { playerCities } from './territory.ts';
import type { Tx } from './tx.ts';
import { removeUnitDeep } from './units.ts';

/** Turns between United Nations elections. */
export const UN_VOTE_TURNS = 10;

export function defaultOptions(): GameOptions {
  return {
    mode: 'standard',
    victories: {
      conquest: true,
      domination: true,
      space: true,
      cultural: true,
      diplomatic: true,
    },
    cultureFlips: true,
  };
}

export const VICTORY_NAMES: Record<VictoryKind, string> = {
  conquest: 'Conquest',
  domination: 'Domination',
  space: 'Space Race',
  cultural: 'Cultural',
  diplomatic: 'Diplomatic',
  score: 'Histograph',
  regicide: 'Regicide',
  victoryPoints: 'Victory Points',
};

/** Victory points are kept only in a victory-point game. */
export function addVictoryPoints(tx: Tx, player: number, points: number, why: string): void {
  if (tx.state.options.mode !== 'victoryPoints' || points <= 0) return;
  const p = tx.state.players[player];
  if (!p?.alive || p.barbarian) return;
  tx.player(player).victoryPoints = p.victoryPoints + points;
  tx.emit({ type: 'victoryPoints', player, points, why });
}

/**
 * Takes a civilization out of the game: its units vanish and its cities surrender to
 * `by` (or are destroyed when nobody, or the barbarians, caused it).
 */
export function eliminatePlayer(rules: Rules, tx: Tx, player: number, by: number | null, why: string): void {
  const p = tx.state.players[player];
  if (!p?.alive || p.barbarian) return;
  const heir = by !== null && by !== player && tx.state.players[by]?.alive && !tx.state.players[by].barbarian ? by : null;
  for (const u of Object.values(tx.state.units).sort((a, b) => a.id - b.id)) {
    if (u.owner === player && tx.state.units[u.id]) removeUnitDeep(tx, u.id, false, 'eliminated');
  }
  for (const c of playerCities(tx.state, player)) {
    if (heir === null) {
      for (const b of Object.keys(c.buildings)) if (tx.state.wonders[b] === c.id) tx.setWonder(b, -1);
      tx.removeCity(c.id);
      tx.emit({
        type: 'cityDestroyed',
        city: c.id,
        player,
        by: by ?? player,
        tile: c.tile,
        name: c.name,
      });
      continue;
    }
    const w = tx.city(c.id);
    w.owner = heir;
    w.build = null;
    w.queue = [];
    w.manualTiles = false;
    w.resisters = 0;
    delete w.buildings.palace;
    for (const b of Object.keys(w.buildings)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- records keyed by building id
      if (rules.building(b).kind === 'smallWonder') delete w.buildings[b];
    }
    tx.emit({
      type: 'cityRevolted',
      city: c.id,
      player: heir,
      from: player,
      tile: c.tile,
      name: c.name,
    });
  }
  const pl = tx.player(player);
  pl.alive = false;
  pl.atWarWith = [];
  pl.warSince = {};
  pl.weariness = {};
  for (const o of tx.state.players) if (o.atWarWith.includes(player)) tx.player(o.id).atWarWith = o.atWarWith.filter((x) => x !== player);
  updateTerritory(rules, tx);
  for (const c of Object.values(tx.state.cities)) if (c.owner === heir && c.nationality === player) replaceCitizens(rules, tx, c.id);
  tx.emit({ type: 'playerEliminated', player, by, why });
}

/** Regicide: a civilization whose kings have all died is out (checked after every command and turn). */
export function checkRegicide(rules: Rules, tx: Tx): void {
  const mode = tx.state.options.mode;
  if (mode !== 'regicide' && mode !== 'massRegicide') return;
  for (const p of tx.state.players) {
    if (!p.alive || p.barbarian || !p.civ) continue;
    const king = rules.civ(p.civ).kingUnit;
    if (!king) continue;
    const lost = tx.events.find((e) => e.type === 'unitLost' && e.player === p.id && e.unitType === king);
    if (!lost || lost.type !== 'unitLost') continue;
    if (Object.values(tx.state.units).some((u) => u.owner === p.id && u.type === king)) continue;
    const fight = [...tx.events].reverse().find((e) => e.type === 'combat' && (e.attacker === lost.unit || e.defender === lost.unit));
    let by: number | null = null;
    if (fight?.type === 'combat') by = fight.attacker === lost.unit ? fight.defenderPlayer : fight.attackerPlayer;
    eliminatePlayer(rules, tx, p.id, by, `lost ${p.civ ? rules.civ(p.civ).leader : 'its king'}`);
  }
}

/** Share of the world's land tiles inside a civilization's borders, and of its citizens, in percent. */
export function dominationShares(rules: Rules, state: GameState, player: number): { land: number; population: number } {
  let landTotal = 0;
  let mine = 0;
  const { terrain, territory } = state.map;
  for (let t = 0; t < terrain.length; t++) {
    if (rules.terrains[terrain[t]!]!.water) continue;
    landTotal++;
    if (territory[t] === player) mine++;
  }
  let people = 0;
  let own = 0;
  for (const c of Object.values(state.cities)) {
    if (state.players[c.owner]?.barbarian) continue;
    people += c.size;
    if (c.owner === player) own += c.size;
  }
  return {
    land: Math.floor((mine * 100) / Math.max(1, landTotal)),
    population: Math.floor((own * 100) / Math.max(1, people)),
  };
}

/** Whether a civilization meets the cultural victory: one city or the whole civilization. */
export function culturalWinner(rules: Rules, state: GameState): { player: number; detail: string } | null {
  const v = rules.set.general.victory;
  const civs = civilizations(state);
  for (const p of [...civs].sort((a, b) => b.culture - a.culture || a.id - b.id)) {
    const runnerUp = Math.max(0, ...civs.filter((o) => o.id !== p.id).map((o) => o.culture));
    if (p.culture >= v.civCulture && p.culture >= runnerUp * 2)
      return {
        player: p.id,
        detail: `${p.culture} culture points, twice any rival's`,
      };
  }
  const city = Object.values(state.cities)
    .filter((c) => !state.players[c.owner]?.barbarian && c.culture >= v.cityCulture)
    .sort((a, b) => b.culture - a.culture || a.id - b.id)[0];
  return city
    ? {
        player: city.owner,
        detail: `${city.name} reached ${city.culture} culture points`,
      }
    : null;
}

/** The United Nations' owner, while the wonder stands. */
function unOwner(rules: Rules, state: GameState): number | null {
  for (const [w, cityId] of Object.entries(state.wonders)) {
    if (!rules.building(w).effects.includes('allowsDiplomaticVictory')) continue;
    const c = state.cities[cityId];
    if (c && !state.players[c.owner]!.barbarian) return c.owner;
  }
  return null;
}

/** The two candidates in a UN election: the UN's owner and the most populous other civilization. */
export function unCandidates(rules: Rules, state: GameState): number[] {
  const owner = unOwner(rules, state);
  if (owner === null) return [];
  const pop = (p: number) => playerCities(state, p).reduce((a, c) => a + c.size, 0);
  const other = civilizations(state)
    .filter((p) => p.id !== owner)
    .sort((a, b) => pop(b.id) - pop(a.id) || a.id - b.id)[0];
  return other ? [owner, other.id] : [owner];
}

/** Each civilization votes with its citizens: for itself if it stands, else for the candidate it likes better. */
export function unVote(rules: Rules, state: GameState): { votes: Record<string, number>; total: number; winner: number | null } {
  const candidates = unCandidates(rules, state);
  const votes: Record<string, number> = {};
  let total = 0;
  for (const p of civilizations(state)) {
    const weight = playerCities(state, p.id).reduce((a, c) => a + c.size, 0);
    total += weight;
    let choice: number | null = null;
    if (candidates.includes(p.id)) choice = p.id;
    else {
      let best = -Infinity;
      for (const c of candidates) {
        if (atWar(state, p.id, c)) continue;
        const v = attitude(rules, state, p.id, c).value;
        if (v > best) {
          best = v;
          choice = c;
        }
      }
      if (best < -15) choice = null;
    }
    if (choice !== null) votes[choice] = (votes[choice] ?? 0) + weight;
  }
  let winner: number | null = null;
  for (const [c, n] of Object.entries(votes)) if (n * 2 > total) winner = Number(c);
  return { votes, total, winner };
}

function win(tx: Tx, kind: VictoryKind, winner: number | null, detail: string): void {
  tx.state.victory = { kind, winner, turn: tx.state.turn, detail };
  tx.emit({ type: 'gameWon', player: winner, kind, detail });
}

/** Records the turn's scores and checks every victory condition (end of turn). */
export function runVictory(rules: Rules, tx: Tx): void {
  for (const p of tx.state.players) {
    if (!p.alive || p.barbarian) continue;
    tx.player(p.id).scores = [...p.scores, score(rules, tx.state, p.id)];
  }
  // United Nations elections, whether or not the game is decided.
  const owner = unOwner(rules, tx.state);
  if (owner !== null && tx.state.options.victories.diplomatic) {
    const un = tx.state.un ?? { nextVote: tx.state.turn, last: null };
    if (tx.state.turn >= un.nextVote) {
      const r = unVote(rules, tx.state);
      tx.state.un = {
        nextVote: tx.state.turn + UN_VOTE_TURNS,
        last: { turn: tx.state.turn, votes: r.votes, total: r.total },
      };
      tx.emit({
        type: 'unitedNationsVote',
        votes: r.votes,
        total: r.total,
        winner: r.winner,
      });
      if (r.winner !== null && !tx.state.victory) win(tx, 'diplomatic', r.winner, `elected by the United Nations with ${r.votes[r.winner]} of ${r.total} votes`);
    } else if (!tx.state.un) tx.state.un = un;
  }
  if (tx.state.victory) return;
  const opts = tx.state.options;
  const v = rules.set.general.victory;
  const civs = civilizations(tx.state);
  const started = tx.state.players.filter((p) => !p.barbarian).length;
  if (civs.length === 0) {
    win(tx, 'conquest', null, 'No civilization survived.');
    return;
  }
  if (civs.length === 1 && started > 1) {
    const kind: VictoryKind = opts.mode === 'regicide' || opts.mode === 'massRegicide' ? 'regicide' : 'conquest';
    if (opts.victories.conquest || kind === 'regicide') {
      win(tx, kind, civs[0]!.id, 'the last civilization standing');
      return;
    }
  }
  const ship = arrivedSpaceship(tx.state);
  if (ship !== null && opts.victories.space) {
    win(tx, 'space', ship, 'the spaceship reached Alpha Centauri');
    return;
  }
  if (opts.victories.domination) {
    for (const p of civs) {
      const s = dominationShares(rules, tx.state, p.id);
      if (s.land >= v.dominationLandPercent && s.population >= v.dominationPopulationPercent) {
        win(tx, 'domination', p.id, `${s.land} % of the land and ${s.population} % of the people`);
        return;
      }
    }
  }
  if (opts.victories.cultural) {
    const c = culturalWinner(rules, tx.state);
    if (c) {
      win(tx, 'cultural', c.player, c.detail);
      return;
    }
  }
  if (opts.mode === 'victoryPoints') {
    const top = [...civs].sort((a, b) => b.victoryPoints - a.victoryPoints || a.id - b.id)[0]!;
    if (top.victoryPoints >= v.pointLimit) {
      win(tx, 'victoryPoints', top.id, `${top.victoryPoints} victory points`);
      return;
    }
  }
  if (tx.state.turn >= rules.set.general.lastTurn) {
    if (opts.mode === 'victoryPoints') {
      const top = [...civs].sort((a, b) => b.victoryPoints - a.victoryPoints || a.id - b.id)[0]!;
      {
        win(tx, 'victoryPoints', top.id, `the most victory points (${top.victoryPoints}) when time ran out`);
        return;
      }
    }
    const top = [...civs].sort((a, b) => score(rules, tx.state, b.id) - score(rules, tx.state, a.id) || a.id - b.id)[0]!;
    {
      win(tx, 'score', top.id, `the highest score (${score(rules, tx.state, top.id)}) when time ran out`);
      return;
    }
  }
}
