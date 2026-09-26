import type { KernelToHostFrame } from '@kvman/protocol';
import type { HostLoad } from '../scheduler/dispatcher.ts';
import type { SchedulerTimers, TimerHandle } from '../scheduler/timers.ts';
import type { HostThread, StartHostThread } from './host-thread.ts';

export const workerCap = 64;

// ADR 0130: a host stops after 10 minutes without an invocation.
export const idleUnloadMs = 10 * 60_000;

// 03 §3.5: min(4, cores - 1) threads, and at least one (ADR 0071).
export function poolSize(cores: number): number {
  return Math.max(1, Math.min(4, cores - 1));
}

// `host` names the worker uniquely across every pool: `<pool>:<id>`.
export type PoolWorker = { id: number; host: string; thread: HostThread; inFlight: number; loaded: Set<string>; idle: TimerHandle | undefined };

export type PoolEvents = { frame(worker: PoolWorker, value: unknown): void; failed(worker: PoolWorker, error: unknown): void; exit(worker: PoolWorker): void };

export type PoolOptions = { name: string; size: number; start: StartHostThread; events: PoolEvents; timers: SchedulerTimers };

type Choice = { worker: PoolWorker } | { start: true };

// A pool of execution hosts: the shared pool, or the one host of a dedicated or sandboxed extension (03 §3.5). An
// invocation goes to the worker with the fewest in-flight invocations, preferring on a tie one that already loaded the
// extension, then a running worker over a new one (ADR 0071). Workers start only when chosen and stop once idle.
export class WorkerPool {
  readonly #options: PoolOptions;
  readonly #workers: PoolWorker[] = [];
  #nextId = 1;

  constructor(options: PoolOptions) {
    this.#options = options;
  }

  load(extension: string): HostLoad {
    const choice = this.#choose(extension);
    return 'worker' in choice
      ? { host: choice.worker.host, inFlight: choice.worker.inFlight, cap: workerCap }
      : { host: `${this.#options.name}:new`, inFlight: 0, cap: workerCap };
  }

  // Takes a place on the chosen worker for one invocation of `extension`.
  acquire(extension: string): PoolWorker {
    const choice = this.#choose(extension);
    const worker = 'worker' in choice ? choice.worker : this.#startWorker();
    worker.idle?.cancel();
    worker.idle = undefined;
    worker.inFlight += 1;
    return worker;
  }

  // ADR 0130: a worker left without an invocation stops once the idle time passes without another one; stopping it
  // is not a loss, so its exit is not reported.
  release(worker: PoolWorker): void {
    worker.inFlight = Math.max(0, worker.inFlight - 1);
    if (worker.inFlight > 0 || !this.#workers.includes(worker)) return;
    worker.idle?.cancel();
    worker.idle = this.#options.timers.set(idleUnloadMs, () => {
      if (worker.inFlight === 0) this.stop(worker);
    });
  }

  post(worker: PoolWorker, frame: KernelToHostFrame): void {
    if (this.#workers.includes(worker)) worker.thread.post(frame);
  }

  holds(worker: PoolWorker): boolean {
    return this.#workers.includes(worker);
  }

  // A stopped worker leaves the pool at once, so nothing more is sent to it; its exit is not reported.
  stop(worker: PoolWorker): void {
    const position = this.#workers.indexOf(worker);
    if (position !== -1) this.#workers.splice(position, 1);
    worker.idle?.cancel();
    worker.idle = undefined;
    worker.thread.terminate();
  }

  stopAll(): void {
    for (const worker of [...this.#workers]) this.stop(worker);
  }

  workers(): readonly PoolWorker[] {
    return this.#workers;
  }

  #choose(extension: string): Choice {
    const ranked = [...this.#workers].sort((left, right) => left.inFlight - right.inFlight
      || Number(right.loaded.has(extension)) - Number(left.loaded.has(extension)));
    const best = ranked[0];
    if (best === undefined || (best.inFlight > 0 && this.#workers.length < this.#options.size)) return { start: true };
    return { worker: best };
  }

  #startWorker(): PoolWorker {
    const id = this.#nextId;
    this.#nextId += 1;
    const { events } = this.#options;
    const thread = this.#options.start({
      frame: (value) => this.#withWorker(id, (worker) => events.frame(worker, value)),
      failed: (error) => this.#withWorker(id, (worker) => events.failed(worker, error)),
      exit: () => this.#withWorker(id, (worker) => {
        this.#workers.splice(this.#workers.indexOf(worker), 1);
        worker.idle?.cancel();
        events.exit(worker);
      }),
    });
    const worker: PoolWorker = { id, host: `${this.#options.name}:${id}`, thread, inFlight: 0, loaded: new Set(), idle: undefined };
    this.#workers.push(worker);
    return worker;
  }

  #withWorker(id: number, act: (worker: PoolWorker) => void): void {
    const worker = this.#workers.find((candidate) => candidate.id === id);
    if (worker !== undefined) act(worker);
  }
}
