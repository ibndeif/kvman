import { describe, expect, it } from 'vitest';
import { idleUnloadMs, WorkerPool, type PoolEvents, type SchedulerTimers, type TimerHandle } from '../../src/index.ts';
import { fakeThreads } from './fake-threads.ts';

// The kernel's timers, fired by moving a fake clock.
class FakeClock implements SchedulerTimers {
  now = 0;
  readonly #timers: Array<{ at: number; fire: () => void; cancelled: boolean }> = [];

  set(delayMs: number, fire: () => void): TimerHandle {
    const timer = { at: this.now + delayMs, fire, cancelled: false };
    this.#timers.push(timer);
    return { cancel: () => { timer.cancelled = true; } };
  }

  advance(milliseconds: number): void {
    this.now += milliseconds;
    for (const timer of this.#timers.filter((candidate) => !candidate.cancelled && candidate.at <= this.now)) {
      timer.cancelled = true;
      timer.fire();
    }
  }
}

function poolWith(clock: FakeClock): { pool: WorkerPool; exits: number[]; started: ReturnType<typeof fakeThreads>['started'] } {
  const { start, started } = fakeThreads();
  const exits: number[] = [];
  const events: PoolEvents = { frame: () => undefined, failed: () => undefined, exit: (worker) => exits.push(worker.id) };
  return { pool: new WorkerPool({ name: 'sandboxed:@acme/probe', size: 1, start, events, timers: clock }), exits, started };
}

describe('idle unload (plan 03 §3.5, ADR 0130)', () => {
  it('M2.4-E15 an idle host stops after 10 minutes without an invocation', () => {
    const clock = new FakeClock();
    const { pool, exits, started } = poolWith(clock);
    const worker = pool.acquire('@acme/probe');
    pool.release(worker);
    clock.advance(idleUnloadMs - 1_000);
    expect(started[0]?.terminated).toBe(false);
    pool.release(pool.acquire('@acme/probe'));
    clock.advance(idleUnloadMs - 1);
    expect(started[0]?.terminated).toBe(false);
    clock.advance(1);
    expect(started[0]?.terminated).toBe(true);
    expect(pool.workers()).toEqual([]);
    expect(exits).toEqual([]);
    expect(pool.acquire('@acme/probe').id).toBe(2);
    expect(started).toHaveLength(2);
  });

  it('M2.4-E16 a thread with an invocation in flight is never stopped as idle', () => {
    const clock = new FakeClock();
    const { pool, started } = poolWith(clock);
    const worker = pool.acquire('@acme/probe');
    clock.advance(2 * idleUnloadMs);
    expect(started[0]?.terminated).toBe(false);
    pool.release(worker);
    clock.advance(idleUnloadMs);
    expect(started[0]?.terminated).toBe(true);
  });
});
