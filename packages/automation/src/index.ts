/**
 * @civolution/automation: player automation that only ever issues engine commands
 * (PLAN.md §8). The AI reuses these modules.
 */
import { apply, playerUnits, type Command, type GameEvent, type GameState, type Rules } from '@civolution/engine';
import { proposeRoutine } from './routines.ts';

export { proposeRoutine, proposeExplore, proposeAutoWorker, homeTile, type Proposal, type RoutineId } from './routines.ts';

export interface RoutineRun {
  state: GameState;
  events: GameEvent[];
  commands: Command[];
}

/**
 * Runs every routine of one player until none has anything more to do this turn.
 * Each unit gets a bounded number of steps so a routine can never loop forever.
 */
export function runRoutines(rules: Rules, state: GameState, player: number): RoutineRun {
  const events: GameEvent[] = [];
  const commands: Command[] = [];
  for (const unit of playerUnits(state, player)) {
    if (!unit.routine) continue;
    for (let step = 0; step < 8; step++) {
      const u = state.units[unit.id];
      if (!u?.routine) break;
      const proposal = proposeRoutine(rules, state, u);
      if (!proposal) break;
      const r = apply(rules, state, proposal.command);
      if (r.error) {
        // A routine proposed something the engine refused; stop it for this turn.
        break;
      }
      state = r.state;
      events.push(...r.events);
      commands.push(proposal.command);
      if (proposal.finished || proposal.command.type === 'skip' || proposal.command.type === 'work') break;
      const after = state.units[unit.id];
      if (!after || after.movesLeft <= 0 || after.order?.type === 'goto') break;
    }
  }
  return { state, events, commands };
}
