import { describe, expect, it } from 'vitest';
import { poolSize, WorkerPool, type PoolWorker, type SchedulerTimers } from '../../src/index.ts';
import { fakeThreads } from './fake-threads.ts';

const quiet = { frame: () => undefined, failed: () => undefined, exit: () => undefined };
const noTimers: SchedulerTimers = { set: () => ({ cancel: () => undefined }) };

describe('the shared pool (plan 03 §3.5, ADR 0071)', () => {
  it('M1.6-E32 threads start lazily, invocations go to the least-loaded thread, preferring one that loaded the extension', () => {
    const { start, started } = fakeThreads();
    const pool = new WorkerPool({ name: 'shared', size: 3, start, events: quiet, timers: noTimers });
    expect(pool.load('@acme/notes')).toEqual({ host: 'shared:new', inFlight: 0, cap: 64 });
    expect(started).toHaveLength(0);

    const first = pool.acquire('@acme/notes');
    first.loaded.add('@acme/notes');
    const second = pool.acquire('@acme/audit');
    second.loaded.add('@acme/audit');
    expect(started).toHaveLength(2);
    pool.release(first);
    pool.release(second);

    const placed: PoolWorker[] = [pool.acquire('@acme/audit'), pool.acquire('@acme/notes')];
    expect(placed.map((worker) => worker.id)).toEqual([second.id, first.id]);
    expect(pool.load('@acme/notes')).toEqual({ host: 'shared:new', inFlight: 0, cap: 64 });
    const third = pool.acquire('@acme/notes');
    expect(third.id).toBe(3);
    expect(pool.load('@acme/notes')).toEqual({ host: `shared:${first.id}`, inFlight: 1, cap: 64 });
    for (let index = 0; index < 5; index += 1) pool.acquire('@acme/notes');
    expect(started).toHaveLength(3);
    expect(pool.workers().map((worker) => worker.inFlight)).toEqual([3, 3, 2]);
  });

  it('M1.6-E33 the pool holds min(4, cores - 1) threads and at least one', () => {
    expect([1, 2, 5, 16].map(poolSize)).toEqual([1, 1, 4, 4]);
  });
});
