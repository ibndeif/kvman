import type { Isolation, KernelToHostFrame } from '@kvman/protocol';
import type { GrantsSource } from '../router/grants.ts';
import type { HostLoad } from '../scheduler/dispatcher.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import type { StartHostThread } from './host-thread.ts';
import { WorkerPool, type PoolEvents, type PoolWorker } from './worker-pool.ts';

export type HostRegistryOptions = {
  poolSize: number;
  grants: GrantsSource;
  // Worker threads for shared and dedicated hosts; a sandboxed process for an extension's verified snapshot folder.
  startThread: StartHostThread;
  startSandbox: (snapshotFolder: string) => StartHostThread;
  snapshotFolder: (extension: string) => string | undefined;
  events: PoolEvents;
  timers: SchedulerTimers;
};

// The one host of a dedicated or sandboxed extension.
type OwnHost = { pool: WorkerPool; isolation: 'dedicated' | 'sandboxed'; extension: string };

// A running host as the kernel lists it.
export type HostEntry = { worker: PoolWorker; isolation: Isolation; extension: string | undefined };

// 03 §3.5: hosts are keyed by (extension, isolation), with the isolation granted where the message runs. Shared
// extensions share one pool; a dedicated extension has one worker thread of its own, and a sandboxed one a child
// process of its own.
export class HostRegistry {
  readonly #options: HostRegistryOptions;
  readonly #shared: WorkerPool;
  readonly #own = new Map<string, OwnHost>();
  readonly #pools = new WeakMap<PoolWorker, WorkerPool>();

  constructor(options: HostRegistryOptions) {
    this.#options = options;
    this.#shared = new WorkerPool({ name: 'shared', size: options.poolSize, start: options.startThread, events: options.events, timers: options.timers });
  }

  load(extension: string, workspaceId: string | undefined): HostLoad {
    return this.#pool(extension, this.#isolationOf(extension, workspaceId)).load(extension);
  }

  acquire(extension: string, workspaceId: string | undefined): PoolWorker {
    const pool = this.#pool(extension, this.#isolationOf(extension, workspaceId));
    const worker = pool.acquire(extension);
    this.#pools.set(worker, pool);
    return worker;
  }

  release(worker: PoolWorker): void {
    this.#pools.get(worker)?.release(worker);
  }

  post(worker: PoolWorker, frame: KernelToHostFrame): void {
    this.#pools.get(worker)?.post(worker, frame);
  }

  // Whether the worker still runs in its pool, so a frame may go to it.
  holds(worker: PoolWorker): boolean {
    return this.#pools.get(worker)?.holds(worker) === true;
  }

  stop(worker: PoolWorker): void {
    this.#pools.get(worker)?.stop(worker);
  }

  // 06 §6.6 step 5: the extension's own hosts leave (the caller stops them) and so do the shared workers that loaded
  // it; fresh ones start on the next dispatch.
  retire(extension: string): PoolWorker[] {
    const retired = this.#shared.retire(extension);
    for (const [key, own] of this.#own) {
      if (own.extension !== extension) continue;
      this.#own.delete(key);
      retired.push(...own.pool.workers());
    }
    return retired;
  }

  stopAll(): void {
    this.#shared.stopAll();
    for (const { pool } of this.#own.values()) pool.stopAll();
  }

  list(): HostEntry[] {
    const own = [...this.#own.values()].flatMap(({ pool, isolation, extension }) => pool.workers().map((worker) => ({ worker, isolation, extension })));
    return [...this.#shared.workers().map((worker) => ({ worker, isolation: 'shared' as const, extension: undefined })), ...own];
  }

  // 05 §5.7: with no grant (a disable racing the dispatch), the most isolated level.
  #isolationOf(extension: string, workspaceId: string | undefined): Isolation {
    return this.#options.grants.capabilities(extension, workspaceId)?.isolation ?? 'sandboxed';
  }

  #sandbox(extension: string): StartHostThread {
    return (events) => {
      const folder = this.#options.snapshotFolder(extension);
      if (folder === undefined) throw new Error(`${extension} has no verified snapshot to run sandboxed`);
      return this.#options.startSandbox(folder)(events);
    };
  }

  #pool(extension: string, isolation: Isolation): WorkerPool {
    if (isolation === 'shared') return this.#shared;
    const key = `${isolation}:${extension}`;
    const existing = this.#own.get(key);
    if (existing !== undefined) return existing.pool;
    const start = isolation === 'dedicated' ? this.#options.startThread : this.#sandbox(extension);
    const pool = new WorkerPool({ name: key, size: 1, start, events: this.#options.events, timers: this.#options.timers });
    this.#own.set(key, { pool, isolation, extension });
    return pool;
  }
}
