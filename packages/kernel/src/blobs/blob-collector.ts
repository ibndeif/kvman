import { setImmediate as nextTurn } from 'node:timers/promises';
import type { SchedulerTimers, TimerHandle } from '../scheduler/timers.ts';
import { collectBatch, type BlobStore } from './blob-store.ts';

export const collectIntervalMs = 10 * 60_000;

// ADR 0134: GC runs at boot and then every 10 minutes on the kernel clock. Each batch is one synchronous step, and
// other work runs between batches. Each run first does the housekeeping that frees blobs (ADR 0139: ended processes).
export class BlobCollector {
  readonly #store: BlobStore;
  readonly #timers: SchedulerTimers;
  readonly #failed: (error: unknown) => void;
  readonly #housekeeping: () => void;
  #timer: TimerHandle | undefined;
  #running: Promise<void> = Promise.resolve();
  #stopped = false;

  // A run that fails (the database or the disk) is reported, and the next run comes at the next interval.
  constructor(store: BlobStore, timers: SchedulerTimers, failed: (error: unknown) => void, housekeeping: () => void) {
    this.#store = store;
    this.#timers = timers;
    this.#failed = failed;
    this.#housekeeping = housekeeping;
  }

  start(): Promise<void> {
    this.#stopped = false;
    return this.#run();
  }

  // The run in progress finishes its batch; no later run starts.
  async stop(): Promise<void> {
    this.#stopped = true;
    this.#timer?.cancel();
    await this.#running;
  }

  // The run started by the last tick, for tests that move the clock and then look.
  idle(): Promise<void> {
    return this.#running;
  }

  #run(): Promise<void> {
    this.#running = this.#collect().then(undefined, this.#failed).then(() => this.#schedule());
    return this.#running;
  }

  async #collect(): Promise<void> {
    if (!this.#stopped) this.#housekeeping();
    while (!this.#stopped && this.#store.collect() === collectBatch) await nextTurn();
  }

  #schedule(): void {
    if (this.#stopped) return;
    this.#timer = this.#timers.set(collectIntervalMs, () => void this.#run());
  }
}
