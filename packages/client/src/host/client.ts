import * as Comlink from 'comlink';
import type { Host } from './worker.ts';

let remote: Comlink.Remote<Host> | null = null;

/** The game host running in its Web Worker. */
export function host(): Comlink.Remote<Host> {
  if (!remote) {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    remote = Comlink.wrap<Host>(worker);
  }
  return remote;
}

export type { Snapshot, CommandResult } from './worker.ts';
