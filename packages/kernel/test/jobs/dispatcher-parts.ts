import Database from 'better-sqlite3';
import { createDispatcher, type Dispatcher } from '../../src/jobs/dispatcher.ts';
import { createJobRows, type JobRows } from '../../src/jobs/job-rows.ts';
import { createIdGenerator } from '../../src/ids.ts';
import type { KernelLogger } from '../../src/logging/logger.ts';
import { createScheduleRows, type ScheduleRows } from '../../src/schedules/schedule-rows.ts';
import type { Connection } from '../../src/storage/database.ts';
import type { WorkerPool } from '../../src/workers/pool.ts';
import { countingRandom, type TimerClock } from '../fake-clock.ts';

// The parts a dispatcher test builds on: a pool that answers each job with `output`, a connection whose next
// transactions fail with the given SQLite codes, and the rows and dispatcher over them.

export function answeringPool(slots: number, output: unknown): WorkerPool {
  return {
    summary: { jobs: [], handlers: [] },
    run: () => Promise.resolve(output),
    abort: () => false,
    abortAll: () => undefined,
    freeSlots: () => slots,
    idle: () => Promise.resolve(),
    retire: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
}

export type FailingConnection = { connection: Connection; transactions(): number };

/** The connection, except that its next transactions fail with `codes`, one each, when they begin. */
export function failingTransactions(real: Connection, codes: string[]): FailingConnection {
  let count = 0;
  const transaction: Connection['transaction'] = (fn) => {
    count += 1;
    const code = codes.shift();
    if (code === undefined) return real.transaction(fn);
    const locked = new Proxy(fn, {
      apply: () => {
        throw new Database.SqliteError('database is locked', code);
      },
    });
    return real.transaction(locked);
  };
  const connection = new Proxy(real, {
    get: (target, property) => {
      if (property === 'transaction') return transaction;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { connection, transactions: () => count };
}

export type DispatcherParts = { dispatcher: Dispatcher; rows: JobRows; schedules: ScheduleRows };

export function dispatcherParts(real: Connection, connection: Connection, clock: TimerClock, logger: KernelLogger): DispatcherParts {
  const ids = createIdGenerator(clock, countingRandom());
  const rows = createJobRows(real, clock, ids, () => []);
  const schedules = createScheduleRows(real, clock, ids, () => []);
  const dispatcher = createDispatcher({ connection, rows, schedules, clock, logger, workspaceOf: (id) => ({ id, name: id, path: '/' }) });
  return { dispatcher, rows, schedules };
}

/** A schedule that falls due on the next minute; the clock is moved to it. */
export function dueSchedule(schedules: ScheduleRows, clock: TimerClock): string {
  const id = schedules.upsert({ owner: '@test/x', workspaceId: 'home', name: 'x.tick', input: {}, timing: { cron: '* * * * *' }, retries: 0, fromHandler: false });
  clock.advance(60_000);
  return id;
}

export const jobsNamed = (connection: Connection, name: string): number =>
  connection.prepare<[string], { count: number }>('SELECT count(*) AS count FROM jobs WHERE name = ?').get(name)?.count ?? 0;

export const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
