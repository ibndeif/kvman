import { describe, expect, it } from 'vitest';
import { busyRetryMs } from '../../src/jobs/dispatcher.ts';
import { timerClock } from '../fake-clock.ts';
import { captureLog } from '../log-capture.ts';
import { useTemporaryHomes } from '../temporary-home.ts';
import { answeringPool, dispatcherParts, dueSchedule, failingTransactions, jobsNamed, settle } from './dispatcher-parts.ts';

// A database still locked after the busy timeout is tried again 1 s later, never fatal (plan 02 §2.2, ADR 0085, 6).

const newHome = useTemporaryHomes();
const retryLine = "The job loop couldn't write to the database; it tries again in 1 s.";

function setUp(codes: string[], pool = answeringPool(0, null)) {
  const home = newHome();
  const clock = timerClock();
  const log = captureLog();
  const failing = failingTransactions(home.connection, codes);
  const parts = dispatcherParts(home.connection, failing.connection, clock, log.logger);
  parts.dispatcher.attach(pool, []);
  const retries = () => log.lines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((record) => record['msg'] === retryLine);
  return { ...parts, home, clock, failing, retries };
}

describe('a busy database in the job loop (ADR 0085, 6)', () => {
  it('QA53-H3 a tick that stays busy is tried again', () => {
    const { dispatcher, schedules, home, clock, retries } = setUp(['SQLITE_BUSY']);
    dueSchedule(schedules, clock);
    dispatcher.wake();
    expect(retries()).toEqual([expect.objectContaining({ level: 50, code: 'SQLITE_BUSY' })]);
    expect(jobsNamed(home.connection, 'x.tick')).toBe(0);
    clock.advance(busyRetryMs);
    expect(busyRetryMs).toBe(1000);
    expect(jobsNamed(home.connection, 'x.tick')).toBe(1);
  });

  it("QA53-H4 a job's end that stays busy is recorded later", async () => {
    const { dispatcher, rows, home, clock, retries } = setUp(['SQLITE_BUSY_SNAPSHOT'], answeringPool(4, 'done'));
    dispatcher.attach(answeringPool(4, 'done'), [{ point: 'kernel.job.succeeded', extension: '@test/x', retries: 0 }]);
    const id = dispatcher.queue({ name: 'x.work', input: {}, workspaceId: 'home', caller: { kind: 'user' }, retries: 0, fromHandler: false, runAt: clock.now() });
    await settle();
    expect(rows.get(id)?.status).toBe('running');
    expect(retries()).toEqual([expect.objectContaining({ code: 'SQLITE_BUSY_SNAPSHOT' })]);
    const ended = dispatcher.waitForJob(id);
    clock.advance(busyRetryMs);
    expect(await ended).toMatchObject({ id, status: 'succeeded', output: 'done' });
    await settle();
    expect(jobsNamed(home.connection, 'kernel.job.succeeded')).toBe(1);
  });

  it('QA53-E1 another database error is not caught', () => {
    const { dispatcher, schedules, clock, retries } = setUp(['SQLITE_CORRUPT']);
    dueSchedule(schedules, clock);
    expect(() => dispatcher.wake()).toThrow(expect.objectContaining({ code: 'SQLITE_CORRUPT' }));
    expect(retries()).toEqual([]);
  });

  it('QA53-E2 a busy tick that keeps failing keeps trying, and stops with the dispatcher', () => {
    const { dispatcher, schedules, home, clock, retries } = setUp(['SQLITE_BUSY', 'SQLITE_BUSY', 'SQLITE_BUSY']);
    dueSchedule(schedules, clock);
    dispatcher.wake();
    expect(retries()).toHaveLength(1);
    clock.advance(busyRetryMs - 1);
    expect(retries()).toHaveLength(1);
    clock.advance(1);
    expect(retries()).toHaveLength(2);
    clock.advance(busyRetryMs);
    expect(retries()).toHaveLength(3);
    expect(jobsNamed(home.connection, 'x.tick')).toBe(0);
    clock.advance(busyRetryMs);
    expect(jobsNamed(home.connection, 'x.tick')).toBe(1);

    const stopped = setUp(['SQLITE_BUSY']);
    dueSchedule(stopped.schedules, stopped.clock);
    stopped.dispatcher.wake();
    const tried = stopped.failing.transactions();
    stopped.dispatcher.setMode('stopped');
    stopped.clock.advance(busyRetryMs * 5);
    expect(stopped.failing.transactions()).toBe(tried);
    expect(jobsNamed(stopped.home.connection, 'x.tick')).toBe(0);
  });
});
