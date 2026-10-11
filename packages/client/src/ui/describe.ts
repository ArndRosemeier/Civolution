/**
 * Plain-language text for engine events (the turn log), and small formatting helpers.
 */
import { buildName, formatYear, yearOf, PEACE_TURNS, type GameEvent, type GameState, type TreatyKind } from '@civolution/engine';
import { rules } from '../rules.ts';

export function unitName(state: GameState, id: number): string {
  const u = state.units[id];
  return u ? rules.unit(u.type).name : 'A unit';
}

/** Movement thirds as Civ3 shows them: "1 1/3". */
export function formatMoves(thirds: number): string {
  const whole = Math.floor(thirds / 3);
  const rest = thirds % 3;
  if (rest === 0) return `${whole}`;
  return whole === 0 ? `${rest}/3` : `${whole} ${rest}/3`;
}

function cityName(state: GameState, id: number): string {
  return state.cities[id]?.name ?? 'A city';
}

function who(state: GameState, p: number): string {
  return state.players[p]?.name ?? 'Someone';
}

const TREATY_NAMES: Record<TreatyKind, string> = {
  peace: 'peace treaty',
  ceasefire: 'ceasefire',
  rightOfPassage: 'right of passage',
  mutualProtection: 'mutual protection pact',
  alliance: 'alliance',
  embargo: 'embargo',
};

export function treatyName(t: TreatyKind): string {
  return TREATY_NAMES[t];
}

function typeName(t: string): string {
  return rules.hasUnit(t) ? rules.unit(t).name : t;
}

/** Whether an event is news for the human player (their own, or something done to them). */
export function concernsHuman(e: GameEvent, human: number): boolean {
  switch (e.type) {
    case 'combat':
      return e.attackerPlayer === human || e.defenderPlayer === human;
    case 'bombarded':
      return e.player === human || e.targetPlayer === human;
    case 'cityCaptured':
      return e.player === human || e.from === human;
    case 'cityDestroyed':
      return e.player === human || e.by === human;
    case 'unitCaptured':
      return e.player === human || e.from === human;
    case 'intercepted':
      return e.player === human || e.byPlayer === human;
    case 'zoneOfControlAttack':
      return e.player === human || e.byPlayer === human;
    case 'defensiveBombard':
      return e.player === human || e.targetPlayer === human;
    case 'warDeclared':
    case 'peaceMade':
    case 'treatyBroken':
    case 'ceasefireAgreed':
    case 'ceasefireEnded':
    case 'dealMade':
    case 'dealCancelled':
    case 'dealExpired':
    case 'dealRejected':
    case 'dealProposed':
      return e.player === human || e.target === human;
    case 'contactMade':
      return e.player === human || e.other === human;
    case 'cityTraded':
    case 'cityRevolted':
    case 'unitsExpelled':
      return e.player === human || e.from === human;
    case 'espionage':
      // A mission against us is only noticed when the spy is caught.
      return e.player === human || (e.target === human && !e.success);
    case 'barbarianLanding':
      return true;
    case 'playerEliminated':
    case 'nuclearStrike':
    case 'campAppeared':
    case 'turnStarted':
      return true;
    default:
      return !('player' in e) || e.player === human;
  }
}

export function describeEvent(s: { state: GameState; human: number }, e: GameEvent): string | null {
  const st = s.state;
  switch (e.type) {
    case 'turnStarted':
      return `Turn ${e.turn} begins (${formatYear(yearOf(rules, e.turn))}).`;
    case 'cityFounded':
      return `${e.name} is founded.`;
    case 'cityJoined':
      return `New citizens join ${cityName(st, e.city)} (size ${e.size}).`;
    case 'cityGrew':
      return `${cityName(st, e.city)} grows to size ${e.size}.`;
    case 'cityStarved':
      return `${cityName(st, e.city)} is starving${e.size > 0 ? ` (size ${e.size})` : ''}.`;
    case 'cityCapped':
      return `${cityName(st, e.city)} cannot grow without ${e.needs}.`;
    case 'cityBuilt':
      return `${cityName(st, e.city)} completes ${buildName(rules, e.build)}.`;
    case 'cityBuildBlocked':
      return `${cityName(st, e.city)} cannot finish ${buildName(rules, e.build)}: ${e.why}`;
    case 'cityHurried':
      return e.gold > 0 ? `${cityName(st, e.city)}: production bought for ${e.gold} gold.` : `${cityName(st, e.city)}: ${e.citizens} citizen${e.citizens === 1 ? '' : 's'} driven to forced labour.`;
    case 'cityDisorder':
      return `Civil disorder in ${cityName(st, e.city)}${e.turns > 1 ? ` (${e.turns} turns)` : ''}!`;
    case 'cityOrderRestored':
      return `Order is restored in ${cityName(st, e.city)}.`;
    case 'cityCelebrating':
      return e.started ? `${cityName(st, e.city)} celebrates We Love the King Day!` : `The celebrations in ${cityName(st, e.city)} are over.`;
    case 'bordersGrew':
      return `The borders of ${cityName(st, e.city)} expand.`;
    case 'wonderBuilt':
      return `${cityName(st, e.city)} completes the wonder ${rules.building(e.building).name}!`;
    case 'buildingSold':
      return `${rules.building(e.building).name} in ${cityName(st, e.city)} was sold: ${e.why}`;
    case 'techDiscovered':
      return `Your scholars discover ${rules.tech(e.tech).name}.`;
    case 'eraEntered':
      return `Your civilization enters the ${rules.set.eras.find((x) => x.id === e.era)?.name ?? e.era}.`;
    case 'anarchyStarted':
      return `Revolution! Anarchy for ${e.turns} turn${e.turns === 1 ? '' : 's'}, then ${rules.government(e.target).name}.`;
    case 'governmentChanged':
      return `Your civilization is now a ${rules.government(e.government).name}.`;
    case 'treasury':
      return null;
    case 'hutEntered': {
      const o = e.outcome;
      const who = unitName(st, e.unit);
      if (o.kind === 'gold') return `${who} found ${o.amount} gold in a tribal village.`;
      if (o.kind === 'map') return `The villagers shared their maps: ${o.tiles} tiles revealed.`;
      if (o.kind === 'unit') return `A band of warriors from the village joins you.`;
      if (o.kind === 'tech') return `The villagers teach you ${rules.tech(o.tech).name}.`;
      if (o.kind === 'barbarians') return 'The village was a barbarian lair! Hostile tribesmen attack.';
      return 'The village was abandoned.';
    }
    case 'workCompleted':
      return `${rules.job(e.job).name} finished.`;
    case 'workStarted':
      return `${unitName(st, e.unit)} starts: ${rules.job(e.job).name} (${e.turns} turns).`;
    case 'forestCleared':
      return e.city !== undefined ? `Forest cleared: ${e.shields} shields of timber for ${cityName(st, e.city)}.` : 'Forest cleared.';
    case 'zoneOfControl':
      return `${unitName(st, e.unit)} passed through an enemy zone of control.`;
    case 'unitWoke':
      return `${unitName(st, e.unit)} woke up: foreign units in sight.`;
    case 'gotoFinished':
      return e.arrived ? null : `${unitName(st, e.unit)} could not continue its route.`;
    case 'unitDisbanded':
      return 'Unit disbanded.';
    case 'combat': {
      const mine = e.attackerPlayer === s.human;
      const a = typeName(e.attackerType);
      const d = typeName(e.defenderType);
      if (mine) {
        if (e.result === 'attackerWon') return `Victory: your ${a} defeated the ${who(st, e.defenderPlayer)} ${d} (${e.odds} % odds).`;
        if (e.result === 'defenderWon') return `Defeat: your ${a} fell attacking the ${who(st, e.defenderPlayer)} ${d} (${e.odds} % odds).`;
        if (e.result === 'attackerRetreated') return `Your ${a} withdrew from the ${who(st, e.defenderPlayer)} ${d}.`;
        return `The ${who(st, e.defenderPlayer)} ${d} slipped away from your ${a}.`;
      }
      if (e.result === 'defenderWon') return `Your ${d} held against a ${who(st, e.attackerPlayer)} ${a}.`;
      if (e.result === 'attackerWon') return `Your ${d} was destroyed by a ${who(st, e.attackerPlayer)} ${a}.`;
      if (e.result === 'defenderRetreated') return `Your ${d} withdrew before a ${who(st, e.attackerPlayer)} ${a}.`;
      return `A ${who(st, e.attackerPlayer)} ${a} broke off its attack on your ${d}.`;
    }
    case 'bombarded': {
      const hits = e.hits.filter((h) => h.kind !== 'miss');
      const parts = hits.map((h) => (h.kind === 'unit' ? (h.killed ? 'a unit destroyed' : 'a unit damaged') : h.kind === 'population' ? 'a citizen killed' : `${rules.building(h.building).name} destroyed`));
      const what = parts.length > 0 ? parts.join(', ') : 'no damage';
      return e.player === s.human ? `Bombardment: ${what}.` : `${who(st, e.player)} bombards your lands: ${what}.`;
    }
    case 'unitLost':
      if (e.why === 'combat' || e.why === 'formedArmy' || e.why === 'spent' || e.why === 'upgraded') return null;
      return `${typeName(e.unitType)} lost${e.why === 'nuke' ? ' in a nuclear blast' : e.why === 'sunk' ? ' at sea' : e.why === 'shotDown' ? ': shot down' : e.why === 'bombard' ? ' to bombardment' : ''}.`;
    case 'unitCaptured':
      return e.player === s.human ? `Captured: a ${typeName(e.unitType)} now serves you.` : `A ${who(st, e.player)} force captured your ${typeName(e.unitType)}.`;
    case 'unitPromoted':
      return `${unitName(st, e.unit)} is promoted to ${e.experience}.`;
    case 'leaderBorn':
      return 'A great leader rises from the ranks! Form an army or hurry a wonder with them.';
    case 'armyFormed':
      return 'A new army is formed. Move up to three units into it.';
    case 'unitJoinedArmy':
      return `${unitName(st, e.unit)} joins the army.`;
    case 'unitUpgraded':
      return `${typeName(e.from)} upgraded to ${typeName(e.to)} for ${e.gold} gold.`;
    case 'unitBoarded':
      return null;
    case 'tilePillaged':
      return `Pillaged: ${e.removed}.`;
    case 'cityCaptured':
      return e.player === s.human ? `${e.name} is ours!${e.gold > 0 ? ` ${e.gold} gold plundered.` : ''}` : `${e.name} has fallen to ${who(st, e.player)}!`;
    case 'cityDestroyed':
      return e.player === s.human ? `${e.name} has been destroyed.` : `${e.name} is razed.`;
    case 'cityRaided':
      return e.size > 0 ? `Barbarians sack ${cityName(st, e.city)}: ${e.gold} gold taken.` : `Barbarians burn ${cityName(st, e.city)} to the ground.`;
    case 'airMission':
      return e.mission === 'rebase' ? `${unitName(st, e.unit)} rebased.` : e.mission === 'recon' ? 'Reconnaissance flight under way.' : null;
    case 'intercepted':
      return e.player === s.human ? (e.survived ? 'Our aircraft fought off an interceptor.' : 'Our aircraft was shot down.') : e.survived ? 'Enemy aircraft got past our interceptors.' : 'Our air defence shot down an enemy aircraft.';
    case 'nuclearStrike':
      return e.stopped ? 'A nuclear missile was destroyed in flight by missile defence.' : `A nuclear weapon has been detonated by ${who(st, e.player)}!`;
    case 'warDeclared':
      return e.player === s.human ? `We are at war with ${who(st, e.target)}.` : `${who(st, e.player)} declares war on us!`;
    case 'peaceMade':
      if (e.player !== s.human && e.target !== s.human) return null;
      return `A peace treaty is signed with ${who(st, e.player === s.human ? e.target : e.player)}. It binds both sides for ${PEACE_TURNS} turns.`;
    case 'contactMade': {
      const other = e.player === s.human ? e.other : e.player;
      const civ = st.players[other]?.civ;
      if (!civ) return `We have made contact with ${who(st, other)}.`;
      const c = rules.civ(civ);
      return `We have met the ${c.noun}, led by ${c.leaderTitle} ${c.leader}.`;
    }
    case 'treatyBroken':
      return e.player === s.human
        ? `We broke our ${treatyName(e.treaty)} with ${who(st, e.target)}; every civilization will remember.`
        : `${who(st, e.player)} broke the ${treatyName(e.treaty)} and attacks without warning!`;
    case 'ceasefireAgreed':
      return `Ceasefire with ${who(st, e.player === s.human ? e.target : e.player)} until turn ${e.until}.`;
    case 'ceasefireEnded':
      return `The ceasefire with ${who(st, e.player === s.human ? e.target : e.player)} has run out: we are at war again.`;
    case 'dealMade': {
      const other = who(st, e.player === s.human ? e.target : e.player);
      const mine = e.player === s.human ? e.give : e.take;
      const theirs = e.player === s.human ? e.take : e.give;
      return `Agreement with ${other}: we give ${mine.join(', ') || 'nothing'}; we receive ${theirs.join(', ') || 'nothing'}.`;
    }
    case 'dealRejected':
      return e.target === s.human ? `We decline the offer from ${who(st, e.player)}.` : `${who(st, e.player)} turns down our offer.`;
    case 'dealProposed':
      return e.target === s.human ? `${who(st, e.player)} has an offer for us.` : null;
    case 'dealCancelled':
      return `The agreement between ${who(st, e.player)} and ${who(st, e.target)} has fallen through: ${e.why}`;
    case 'dealExpired':
      return `An agreement between ${who(st, e.player)} and ${who(st, e.target)} has run its course.`;
    case 'unitsExpelled':
      return e.player === s.human ? `${e.units} of our units were sent home from ${who(st, e.from)} lands.` : `${e.units} ${who(st, e.player)} units left our lands.`;
    case 'cityTraded':
      return e.player === s.human ? `${e.name} joins our civilization by treaty.` : `${e.name} is handed over to ${who(st, e.player)}.`;
    case 'cityRevolted':
      return e.player === s.human ? `Our propaganda wins over ${e.name}: the city joins us!` : `${e.name} has been turned against us by ${who(st, e.player)} propaganda and defects!`;
    case 'espionage':
      if (e.target === s.human) return `A ${who(st, e.player)} spy was caught in our lands.`;
      return e.success
        ? `${rules.mission(e.mission).name}: ${e.detail} (${e.cost} gold)`
        : `${rules.mission(e.mission).name} against ${who(st, e.target)} failed. ${e.detail} (${e.cost} gold)`.replace(' .', '.');
    case 'airdrop':
      return `${unitName(st, e.unit)} parachutes into position.`;
    case 'airlift':
      return `${unitName(st, e.unit)} is airlifted to ${Object.values(st.cities).find((c) => c.tile === e.tile)?.name ?? 'another city'}.`;
    case 'barbarianLanding':
      return st.cities[e.near]?.owner === s.human ? `Barbarians have landed near ${cityName(st, e.near)}!` : null;
    case 'playerEliminated':
      return e.player === s.human ? 'Your civilization has been destroyed.' : `The ${who(st, e.player)} civilization has been destroyed.`;
    case 'campDestroyed':
      return `Barbarian camp destroyed: ${e.gold} gold.`;
    case 'campAppeared':
      return st.players[s.human]!.explored[e.tile >> 5]! & (1 << (e.tile & 31)) ? 'A barbarian camp has appeared.' : null;
    case 'zoneOfControlAttack':
      return e.hit && e.player === s.human ? `${unitName(st, e.unit)} took fire passing an enemy zone of control.` : null;
    default:
      return null;
  }
}
