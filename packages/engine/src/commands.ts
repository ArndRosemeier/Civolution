/**
 * The one way state changes: `apply(state, command)`. The human, the AI and the
 * automation layer all issue these same commands (PLAN.md §5, §8). `reason` is free
 * text the issuer attaches (for example an automation routine explaining itself); it
 * is echoed on the resulting events so the UI can show why something happened.
 */

import type { AutomationSettings } from './automation.ts';
import type { Build, DealItem, Rates, TreatyKind } from './state.ts';

interface Base {
  player: number;
  reason?: string;
}

export type Command =
  /**
   * Moving onto enemy units attacks them; onto an undefended enemy city captures it (or
   * razes it with `raze`). A unit able to stealth attack may pick the `defender`.
   */
  | (Base & { type: 'moveUnit'; unit: number; to: number; raze?: boolean; defender?: number })
  /** Paratroopers jump from a city to a land tile in range. */
  | (Base & { type: 'airdrop'; unit: number; target: number })
  /** A unit flies from a city with an airport to another (one airlift per airport and turn). */
  | (Base & { type: 'airlift'; unit: number; target: number })
  | (Base & { type: 'bombard'; unit: number; target: number })
  /** A stealth bomber may single out one unit on the target tile (`targetUnit`). */
  | (Base & { type: 'airMission'; unit: number; mission: AirMission; target?: number; targetUnit?: number })
  | (Base & { type: 'nuke'; unit: number; target: number })
  | (Base & { type: 'pillage'; unit: number })
  | (Base & { type: 'upgrade'; unit: number })
  | (Base & { type: 'load'; unit: number })
  /** A unit aboard a ship in port (or on land) steps off it. */
  | (Base & { type: 'unload'; unit: number })
  | (Base & { type: 'buildArmy'; unit: number })
  | (Base & { type: 'joinArmy'; unit: number; army: number })
  | (Base & { type: 'leaderHurry'; unit: number })
  /** Launches a finished spaceship from the capital (docs/rules/spaceship.md). */
  | (Base & { type: 'launchSpaceship' })
  /** Burns a city taken this turn to the ground. */
  | (Base & { type: 'razeCity'; city: number })
  | (Base & { type: 'declareWar'; target: number })
  /** Offers a deal: `give` goes to the target, `take` comes back (docs/rules/diplomacy.md). */
  | (Base & { type: 'proposeDeal'; target: number; give: DealItem[]; take: DealItem[] })
  /** The recipient of an offer accepts or declines it (allowed after the recipient ended its turn). */
  | (Base & { type: 'answerDeal'; proposal: number; accept: boolean })
  /** An espionage mission against `target` (docs/rules/espionage.md). */
  | (Base & { type: 'espionage'; target: number; mission: string; city?: number })
  | (Base & { type: 'goto'; unit: number; to: number })
  | (Base & { type: 'fortify'; unit: number })
  | (Base & { type: 'sentry'; unit: number })
  | (Base & { type: 'wake'; unit: number })
  | (Base & { type: 'skip'; unit: number })
  | (Base & { type: 'disband'; unit: number })
  | (Base & { type: 'work'; unit: number; job: string })
  | (Base & { type: 'setRoutine'; unit: number; routine: string | null })
  | (Base & { type: 'foundCity'; unit: number; name?: string })
  | (Base & { type: 'joinCity'; unit: number })
  | (Base & { type: 'setBuild'; city: number; build: Build })
  | (Base & { type: 'setQueue'; city: number; queue: Build[] })
  | (Base & { type: 'setCitizens'; city: number; worked: number[]; specialists: Record<string, number> })
  | (Base & { type: 'autoCitizens'; city: number })
  | (Base & { type: 'hurry'; city: number })
  /** Drafts the best draftable unit, at the cost of a citizen (docs/rules/governments.md). */
  | (Base & { type: 'draft'; city: number })
  | (Base & { type: 'renameCity'; city: number; name: string })
  | (Base & { type: 'setRates'; rates: Rates })
  | (Base & { type: 'setResearch'; tech: string })
  | (Base & { type: 'revolution'; government: string })
  /** Replaces the player's automation settings (automation.ts). */
  | (Base & { type: 'setAutomation'; settings: AutomationSettings })
  | (Base & { type: 'endTurn' });

export type AirMission = 'bomb' | 'precisionBomb' | 'recon' | 'rebase' | 'intercept';

export type UnitLossReason =
  | 'combat'
  | 'bombard'
  | 'nuke'
  | 'sunk'
  | 'captured'
  | 'destroyed'
  | 'eliminated'
  | 'shotDown'
  | 'spent'
  | 'upgraded'
  | 'formedArmy';

export type BombardHit =
  | { kind: 'unit'; unit: number; killed: boolean }
  | { kind: 'population'; size: number }
  | { kind: 'building'; building: string }
  | { kind: 'miss' };

export type HutOutcome =
  | { kind: 'gold'; amount: number }
  | { kind: 'map'; tiles: number }
  | { kind: 'unit'; unitType: string; unit: number }
  | { kind: 'tech'; tech: string }
  | { kind: 'barbarians'; units: number }
  | { kind: 'city'; city: number }
  | { kind: 'empty' };

export type GameEvent = { reason?: string } & (
  | { type: 'unitMoved'; unit: number; player: number; from: number; to: number; cost: number }
  | { type: 'tilesRevealed'; player: number; tiles: number[] }
  | { type: 'hutEntered'; unit: number; player: number; tile: number; outcome: HutOutcome }
  | { type: 'zoneOfControl'; unit: number; player: number; from: number; to: number; by: number[] }
  | { type: 'unitCreated'; unit: number; player: number; unitType: string; tile: number }
  | { type: 'unitDisbanded'; unit: number; player: number }
  | { type: 'orderChanged'; unit: number; player: number }
  | { type: 'workStarted'; unit: number; player: number; tile: number; job: string; turns: number }
  | { type: 'workCompleted'; tile: number; job: string; player: number }
  | { type: 'forestCleared'; tile: number; player: number; shields: number; city?: number }
  | { type: 'gotoFinished'; unit: number; player: number; arrived: boolean }
  | { type: 'unitWoke'; unit: number; player: number; tile: number }
  | { type: 'playerEndedTurn'; player: number }
  | { type: 'turnStarted'; turn: number }
  | { type: 'cityFounded'; city: number; player: number; tile: number; name: string }
  | { type: 'cityJoined'; city: number; player: number; tile: number; size: number }
  | { type: 'cityGrew'; city: number; player: number; tile: number; size: number }
  | { type: 'cityStarved'; city: number; player: number; tile: number; size: number }
  | { type: 'cityCapped'; city: number; player: number; tile: number; needs: string }
  | { type: 'cityBuilt'; city: number; player: number; tile: number; build: Build; unit?: number }
  | { type: 'cityBuildBlocked'; city: number; player: number; tile: number; build: Build; why: string }
  | { type: 'cityChanged'; city: number; player: number; tile: number }
  | { type: 'cityHurried'; city: number; player: number; tile: number; gold: number; citizens: number }
  | { type: 'cityDisorder'; city: number; player: number; tile: number; turns: number }
  | { type: 'cityOrderRestored'; city: number; player: number; tile: number }
  | { type: 'cityCelebrating'; city: number; player: number; tile: number; started: boolean }
  | { type: 'bordersGrew'; city: number; player: number; tile: number; radius: number }
  | { type: 'wonderBuilt'; city: number; player: number; tile: number; building: string }
  | { type: 'buildingSold'; city: number; player: number; tile: number; building: string; why: string }
  | { type: 'techDiscovered'; player: number; tech: string }
  | { type: 'researchChanged'; player: number; tech: string }
  | { type: 'freeAdvanceOwed'; player: number }
  | { type: 'eraEntered'; player: number; era: string }
  | { type: 'ratesChanged'; player: number }
  | { type: 'anarchyStarted'; player: number; target: string; turns: number }
  | { type: 'governmentChanged'; player: number; government: string }
  | { type: 'treasury'; player: number; income: number; upkeep: number; unitSupport: number; gold: number }
  | {
      type: 'combat';
      attacker: number;
      attackerPlayer: number;
      attackerType: string;
      defender: number;
      defenderPlayer: number;
      defenderType: string;
      from: number;
      tile: number;
      result: 'attackerWon' | 'defenderWon' | 'attackerRetreated' | 'defenderRetreated';
      /** One letter per round: 'a' when the attacker won it, 'd' when the defender did. */
      rounds: string;
      attackerHp: number;
      defenderHp: number;
      /** The attacker's chance to win as it stood before the battle, in percent. */
      odds: number;
    }
  | { type: 'zoneOfControlAttack'; unit: number; player: number; by: number; byPlayer: number; hit: boolean }
  | { type: 'defensiveBombard'; unit: number; player: number; target: number; targetPlayer: number; hit: boolean }
  | { type: 'bombarded'; unit: number; player: number; from: number; tile: number; targetPlayer: number; hits: BombardHit[] }
  | { type: 'unitLost'; unit: number; player: number; unitType: string; tile: number; why: UnitLossReason }
  | { type: 'unitCaptured'; unit: number; player: number; from: number; unitType: string; tile: number }
  | { type: 'unitPromoted'; unit: number; player: number; experience: string }
  | { type: 'leaderBorn'; unit: number; player: number; tile: number; name?: string; scientific?: boolean }
  | { type: 'armyFormed'; unit: number; player: number; tile: number }
  | { type: 'unitJoinedArmy'; unit: number; army: number; player: number }
  | { type: 'unitUpgraded'; unit: number; player: number; from: string; to: string; gold: number }
  | { type: 'unitBoarded'; unit: number; transport: number; player: number }
  | { type: 'unitUnloaded'; unit: number; transport: number; player: number }
  | { type: 'tilePillaged'; tile: number; player: number; removed: string }
  | { type: 'cityCaptured'; city: number; player: number; from: number; tile: number; name: string; gold: number }
  | { type: 'cityDestroyed'; city: number; player: number; by: number; tile: number; name: string }
  | { type: 'cityRaided'; city: number; player: number; tile: number; gold: number; size: number }
  | { type: 'airMission'; unit: number; player: number; mission: AirMission; from: number; target: number }
  | { type: 'intercepted'; unit: number; player: number; by: number; byPlayer: number; survived: boolean }
  | { type: 'nuclearStrike'; unit: number; player: number; tile: number; stopped: boolean }
  | { type: 'warDeclared'; player: number; target: number }
  | { type: 'peaceMade'; player: number; target: number }
  | { type: 'contactMade'; player: number; other: number }
  | { type: 'treatyBroken'; player: number; target: number; treaty: TreatyKind }
  | { type: 'unitsExpelled'; player: number; from: number; units: number }
  | { type: 'ceasefireAgreed'; player: number; target: number; until: number }
  | { type: 'ceasefireEnded'; player: number; target: number }
  | { type: 'dealProposed'; proposal: number; player: number; target: number }
  | { type: 'dealRejected'; proposal: number; player: number; target: number }
  | { type: 'dealMade'; player: number; target: number; give: string[]; take: string[] }
  | { type: 'dealCancelled'; player: number; target: number; why: string }
  | { type: 'dealExpired'; player: number; target: number }
  | { type: 'cityTraded'; city: number; player: number; from: number; tile: number; name: string }
  /** A city changed sides through propaganda or, with `cause: 'culture'`, a culture flip. */
  | { type: 'cityRevolted'; city: number; player: number; from: number; tile: number; name: string; cause?: 'propaganda' | 'culture' }
  | { type: 'resistanceStarted'; city: number; player: number; tile: number; resisters: number }
  | { type: 'resistanceEnded'; city: number; player: number; tile: number }
  | { type: 'goldenAgeStarted'; player: number; cause: 'uniqueUnit' | 'wonders'; detail: string; until: number }
  | { type: 'goldenAgeEnded'; player: number }
  | { type: 'pollutionAppeared'; tile: number; player: number; city: number }
  | { type: 'globalWarming'; tiles: number[] }
  | { type: 'meltdown'; city: number; player: number; tile: number }
  | { type: 'spaceshipLaunched'; player: number; arrives: number }
  | { type: 'spaceshipLost'; player: number; by: number }
  | { type: 'unitedNationsVote'; votes: Record<string, number>; total: number; winner: number | null }
  | { type: 'victoryPoints'; player: number; points: number; why: string }
  | { type: 'gameWon'; player: number | null; kind: import('./state.ts').VictoryKind; detail: string }
  | { type: 'espionage'; player: number; target: number; mission: string; success: boolean; cost: number; city?: number; detail: string }
  | { type: 'airdrop'; unit: number; player: number; from: number; tile: number }
  | { type: 'airlift'; unit: number; player: number; from: number; tile: number }
  | { type: 'barbarianLanding'; tile: number; units: number; near: number }
  | { type: 'playerEliminated'; player: number; by: number | null; why?: string }
  | { type: 'campDestroyed'; tile: number; player: number; gold: number }
  | { type: 'campAppeared'; tile: number }
);

export interface CommandError {
  code:
    | 'unknownUnit'
    | 'notYourUnit'
    | 'notAdjacent'
    | 'cannotEnter'
    | 'noMovesLeft'
    | 'cannotWork'
    | 'turnEnded'
    | 'unknownCity'
    | 'notYourCity'
    | 'cannotFound'
    | 'cannotBuild'
    | 'notImplemented'
    | 'notAtWar'
    | 'invalid';
  message: string;
}
