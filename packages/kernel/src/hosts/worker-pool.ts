import type { KernelToHostFrame } from '@kvman/protocol';
import type { HostLoad } from '../scheduler/dispatcher.ts';
import type { HostThread, StartHostThread } from './host-thread.ts';

export const workerCap = 64;

// 03 §3.5: min(4, cores - 1) threads, and at least one (ADR 0071).
export function poolSize(cores: number): number {
  return Math.max(1, Math.min(4, cores - 1));
}

export type PoolWorker = { id: number; thread: HostThread; inFlight: number; loaded: Set<string> };

export type PoolEvents = { frame(worker: PoolWorker, value: unknown): void; failed(worker: PoolWorker, error: unknown): void; exit(worker: PoolWorker): void };

type Choice = { worker: PoolWorker } | { start: true };

// The shared pool (ADR 0071): an invocation goes to the worker with the fewest in-flight invocations, preferring on a
// tie one that already loaded the extension, then a running worker over a new one. Workers start only when chosen.
export class WorkerPool {
  readonly #size: number;
  readonly #start: StartHostThread;
  readonly #events: PoolEvents;
  readonly #workers: PoolWorker[] = [];
  #nextId = 1;

  constructor(size: number, start: StartHostThread, events: PoolEvents) {
    this.#size = size;
    this.#start = start;
    this.#events = events;
  }

  load(extension: string): HostLoad {
    const choice = this.#choose(extension);
    return 'worker' in choice
      ? { host: `shared:${choice.worker.id}`, inFlight: choice.worker.inFlight, cap: workerCap }
      : { host: 'shared:new', inFlight: 0, cap: workerCap };
  }

  // Takes a place on the chosen worker for one invocation of `extension`.
  acquire(extension: string): PoolWorker {
    const choice = this.#choose(extension);
    const worker = 'worker' in choice ? choice.worker : this.#startWorker();
    worker.inFlight += 1;
    return worker;
  }

  release(worker: PoolWorker): void {
    worker.inFlight = Math.max(0, worker.inFlight - 1);
  }

  post(worker: PoolWorker, frame: KernelToHostFrame): void {
    if (this.#workers.includes(worker)) worker.thread.post(frame);
  }

  stop(worker: PoolWorker): void {
    worker.thread.terminate();
  }

  stopAll(): void {
    for (const worker of this.#workers) worker.thread.terminate();
  }

  workers(): readonly PoolWorker[] {
    return this.#workers;
  }

  #choose(extension: string): Choice {
    const ranked = [...this.#workers].sort((left, right) => left.inFlight - right.inFlight
      || Number(right.loaded.has(extension)) - Number(left.loaded.has(extension)));
    const best = ranked[0];
    if (best === undefined || (best.inFlight > 0 && this.#workers.length < this.#size)) return { start: true };
    return { worker: best };
  }

  #startWorker(): PoolWorker {
    const id = this.#nextId;
    this.#nextId += 1;
    const thread = this.#start({
      frame: (value) => this.#withWorker(id, (worker) => this.#events.frame(worker, value)),
      failed: (error) => this.#withWorker(id, (worker) => this.#events.failed(worker, error)),
      exit: () => this.#withWorker(id, (worker) => {
        this.#workers.splice(this.#workers.indexOf(worker), 1);
        this.#events.exit(worker);
      }),
    });
    const worker: PoolWorker = { id, thread, inFlight: 0, loaded: new Set() };
    this.#workers.push(worker);
    return worker;
  }

  #withWorker(id: number, act: (worker: PoolWorker) => void): void {
    const worker = this.#workers.find((candidate) => candidate.id === id);
    if (worker !== undefined) act(worker);
  }
}
