/**
 * Which sound every game event makes (PLAN.md §10.4). The table covers every event type,
 * so the compiler flags a new event without a sound. Only one sound plays per batch of
 * events: the one with the highest tier, so a battle is not drowned out by a footstep.
 * Pure data, no playback, so it can be tested.
 */
import type { GameEvent } from '@civolution/engine';

/** What playback needs to know about the game: a unit's family (see ui/family.ts) and its type. */
export interface SoundContext {
  human: number;
  /** Combat family of a unit type: melee, archery, mounted, gunpowder, rifle, armour, artillery, naval, air. */
  family: (unitType: string) => string;
  /** The type of a unit by id, when it still exists. */
  unitType: (unit: number) => string | undefined;
}

type Event<K extends GameEvent['type']> = Extract<GameEvent, { type: K }>;

interface Rule<K extends GameEvent['type']> {
  /** Higher wins within a batch. */
  tier: number;
  /** Sound id, or null to stay quiet for this particular event. */
  sound: string | ((e: Event<K>, ctx: SoundContext) => string | null);
  /** Every id `sound` can return, for the test that checks the files exist. */
  ids?: string[];
}

const MOVE_SOUNDS: Record<string, string> = {
  naval: 'move-ship',
  air: 'move-air',
  mounted: 'move-mounted',
  armour: 'move-wheeled',
  artillery: 'move-wheeled',
};

function moveSound(type: string | undefined, ctx: SoundContext): string {
  return (type && MOVE_SOUNDS[ctx.family(type)]) || 'move-foot';
}

/** Tiers: 9 the end of the game, 8 war, 7 great moments, 6 battle, 5 spies and diplomacy, 4 skirmishes, 3 cities and empire, 2 units, 1 small confirmations. */
export const EVENT_SOUNDS: { [K in GameEvent['type']]: Rule<K> | { covered: string } } = {
  gameWon: { tier: 9, sound: (e, ctx) => (e.player === ctx.human ? 'victory' : 'defeat'), ids: ['victory', 'defeat'] },
  nuclearStrike: { tier: 9, sound: (e) => (e.stopped ? 'missile-intercepted' : 'nuclear-blast'), ids: ['missile-intercepted', 'nuclear-blast'] },
  playerEliminated: { tier: 8, sound: 'city-destroyed' },
  warDeclared: { tier: 8, sound: 'war-declared' },
  treatyBroken: { tier: 8, sound: 'war-declared' },
  ceasefireEnded: { tier: 8, sound: 'war-declared' },
  peaceMade: { tier: 8, sound: 'peace' },
  cityCaptured: { tier: 8, sound: 'city-captured' },
  cityDestroyed: { tier: 8, sound: 'city-destroyed' },
  cityRaided: { tier: 8, sound: 'city-destroyed' },
  cityRevolted: { tier: 8, sound: 'culture-flip' },
  cityTraded: { tier: 8, sound: 'city-ceded' },
  barbarianLanding: { tier: 8, sound: 'barbarian-landing' },
  spaceshipLost: { tier: 8, sound: 'city-destroyed' },
  meltdown: { tier: 8, sound: 'meltdown' },
  leaderBorn: { tier: 8, sound: 'leader-born' },
  goldenAgeStarted: { tier: 7, sound: 'golden-age' },
  spaceshipLaunched: { tier: 7, sound: 'spaceship-launch' },
  globalWarming: { tier: 7, sound: 'global-warming' },
  unitedNationsVote: { tier: 7, sound: 'un-vote' },
  eraEntered: { tier: 7, sound: 'era-entered' },
  wonderBuilt: { tier: 7, sound: 'wonder-complete' },
  pollutionAppeared: { tier: 6, sound: 'pollution' },
  resistanceStarted: { tier: 6, sound: 'resistance' },
  combat: { tier: 6, sound: (e, ctx) => `attack-${ctx.family(e.attackerType)}`, ids: ['melee', 'archery', 'mounted', 'gunpowder', 'rifle', 'armour', 'artillery', 'naval', 'air'].map((f) => `attack-${f}`) },
  espionage: { tier: 5, sound: (e) => (e.mission === 'embassy' ? 'embassy' : e.success ? 'spy-success' : 'spy-caught'), ids: ['embassy', 'spy-success', 'spy-caught'] },
  contactMade: { tier: 5, sound: 'first-contact' },
  dealMade: { tier: 5, sound: 'treaty-signed' },
  ceasefireAgreed: { tier: 5, sound: 'treaty-signed' },
  dealRejected: { tier: 5, sound: 'deal-declined' },
  dealCancelled: { tier: 5, sound: 'deal-declined' },
  dealExpired: { tier: 5, sound: 'treaty-expired' },
  dealProposed: { tier: 5, sound: 'envoy-arrives' },
  unitsExpelled: { tier: 5, sound: 'expelled' },
  goldenAgeEnded: { tier: 5, sound: 'golden-age-ended' },
  anarchyStarted: { tier: 5, sound: 'revolution' },
  governmentChanged: { tier: 5, sound: 'government-changed' },
  techDiscovered: { tier: 5, sound: 'tech-discovered' },
  airdrop: { tier: 4, sound: 'parachute' },
  airlift: { tier: 4, sound: 'airlift' },
  bombarded: { tier: 4, sound: 'bombard' },
  defensiveBombard: { tier: 4, sound: 'bombard' },
  airMission: { tier: 4, sound: 'aircraft' },
  intercepted: { tier: 4, sound: 'dogfight' },
  tilePillaged: { tier: 4, sound: 'pillage' },
  unitCaptured: { tier: 4, sound: 'capture' },
  unitLost: { tier: 4, sound: 'unit-lost' },
  zoneOfControlAttack: { tier: 4, sound: 'zoc-strike' },
  zoneOfControl: { tier: 4, sound: 'zoc-strike' },
  campDestroyed: { tier: 4, sound: 'gold-coins' },
  campAppeared: { tier: 4, sound: 'barbarian-horn' },
  armyFormed: { tier: 4, sound: 'leader-born' },
  unitPromoted: { tier: 4, sound: 'promotion' },
  hutEntered: {
    tier: 4,
    sound: (e) => ({ gold: 'gold-coins', map: 'hut-map', unit: 'unit-trained', tech: 'tech-discovered', barbarians: 'barbarian-horn', empty: 'hut-empty' })[e.outcome.kind],
    ids: ['gold-coins', 'hut-map', 'unit-trained', 'tech-discovered', 'barbarian-horn', 'hut-empty'],
  },
  resistanceEnded: { tier: 3, sound: 'order-restored' },
  cityFounded: { tier: 3, sound: 'city-founded' },
  cityDisorder: { tier: 3, sound: 'disorder' },
  cityBuilt: { tier: 3, sound: (e) => (e.build.kind === 'unit' ? 'unit-trained' : 'building-complete'), ids: ['unit-trained', 'building-complete'] },
  cityGrew: { tier: 3, sound: 'city-grew' },
  cityJoined: { tier: 3, sound: 'city-grew' },
  cityCelebrating: { tier: 3, sound: (e) => (e.started ? 'celebration' : 'golden-age-ended'), ids: ['celebration', 'golden-age-ended'] },
  bordersGrew: { tier: 3, sound: 'borders-grew' },
  cityOrderRestored: { tier: 3, sound: 'order-restored' },
  cityStarved: { tier: 3, sound: 'city-starved' },
  cityCapped: { tier: 3, sound: 'warning' },
  cityBuildBlocked: { tier: 3, sound: 'warning' },
  buildingSold: { tier: 3, sound: 'gold-coins' },
  cityHurried: { tier: 3, sound: 'hurry' },
  treasury: { tier: 3, sound: (e) => (e.gold + e.income - e.upkeep - e.unitSupport < 0 ? 'warning' : null), ids: ['warning'] },
  unitUpgraded: { tier: 2, sound: 'unit-upgraded' },
  unitJoinedArmy: { tier: 2, sound: 'join-army' },
  unitBoarded: { tier: 2, sound: 'board-ship' },
  unitUnloaded: { tier: 2, sound: 'unload' },
  unitCreated: { tier: 2, sound: 'unit-trained' },
  unitDisbanded: { tier: 2, sound: 'disband' },
  unitWoke: { tier: 2, sound: 'unit-woke' },
  forestCleared: { tier: 2, sound: 'timber' },
  workCompleted: { tier: 2, sound: 'work-done' },
  workStarted: { tier: 2, sound: 'work-started' },
  unitMoved: { tier: 1, sound: (e, ctx) => moveSound(ctx.unitType(e.unit), ctx), ids: ['move-foot', 'move-mounted', 'move-wheeled', 'move-ship', 'move-air'] },
  gotoFinished: { tier: 1, sound: (e) => (e.arrived ? 'arrived' : 'warning'), ids: ['arrived', 'warning'] },
  orderChanged: { tier: 1, sound: 'order' },
  researchChanged: { tier: 1, sound: 'quill' },
  ratesChanged: { tier: 1, sound: 'gold-coins' },
  cityChanged: { tier: 1, sound: 'ui-click' },
  turnStarted: { tier: 1, sound: 'turn-start' },
  playerEndedTurn: { covered: 'the end-turn button plays end-turn' },
  tilesRevealed: { covered: 'always comes with the move that revealed the tiles' },
  victoryPoints: { covered: 'comes with the battle, wonder or advance that scored them' },
};

/** The one sound for a batch of the human player's events, or null. */
export function pickSound(events: readonly GameEvent[], ctx: SoundContext): string | null {
  let best: string | null = null;
  let bestTier = -1;
  for (const e of events) {
    const rule = EVENT_SOUNDS[e.type] as Rule<typeof e.type> | { covered: string };
    if ('covered' in rule || rule.tier <= bestTier) continue;
    const id = typeof rule.sound === 'string' ? rule.sound : rule.sound(e, ctx);
    if (id === null) continue;
    best = id;
    bestTier = rule.tier;
  }
  return best;
}

/** Every sound id the table can play. */
export function eventSoundIds(): string[] {
  const out = new Set<string>();
  for (const rule of Object.values(EVENT_SOUNDS)) {
    if ('covered' in rule) continue;
    if (typeof rule.sound === 'string') out.add(rule.sound);
    for (const id of rule.ids ?? []) out.add(id);
  }
  return [...out].sort();
}

/** Music beds by era index (ancient, medieval, industrial, modern), and the title theme. */
export const MUSIC = ['music-ancient', 'music-medieval', 'music-industrial', 'music-modern'] as const;
export const TITLE_MUSIC = 'music-title';

/** Ambience by the terrain under the camera; cities override the land. */
export const AMBIENCE: Record<string, string> = {
  grassland: 'ambience-grassland',
  plains: 'ambience-grassland',
  floodPlain: 'ambience-grassland',
  hills: 'ambience-grassland',
  forest: 'ambience-forest',
  jungle: 'ambience-forest',
  marsh: 'ambience-forest',
  desert: 'ambience-desert',
  volcano: 'ambience-desert',
  tundra: 'ambience-snow',
  mountains: 'ambience-snow',
  coast: 'ambience-ocean',
  sea: 'ambience-ocean',
  ocean: 'ambience-ocean',
  city: 'ambience-city',
};
