import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, person } from '../install/harness.ts';
import { enable, grantsOf, valueOf } from '../workspaces/harness.ts';
import { hour, minute, openTickerFixture, runsOf, scheduleRows, scheduleTests, settle, stepClock, tickerName, type TickerFixture } from './harness.ts';

let fixture: TickerFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function enableTicker(current: TickerFixture, workspaceId: string): Promise<void> {
  valueOf(await enable(current, workspaceId, tickerName, grantsOf(current, tickerName)));
  await current.runtime.schedules.settled();
}

// No schedule and workspace ever has two unfinished runs (ADR 0144); each schedule of Ticker 1.0.0 sends its own type.
function outstandingPerSchedule(current: TickerFixture): number[] {
  return current.connection.prepare("SELECT COUNT(*) AS count FROM messages WHERE state IN ('pending', 'running') AND source = 'kernel' GROUP BY type, workspace_id").all()
    .map((row) => Number(row['count']));
}

describe('declared schedules (plan 03 §3.4, ADR 0144)', scheduleTests, () => {
  it('M2.7-E32 runs go to each enabled workspace, or once without one for a global command', async () => {
    const current = await openTickerFixture();
    fixture = current;
    const { morning } = current;
    await enableTicker(current, workspaceA);
    await enableTicker(current, workspaceB);
    await stepClock(current.runtime, current.connection, current.timers, hour);
    const runs = await runsOf(current.runtime);
    const of = (type: string) => runs.filter((run) => run.type === type).map((run) => [run.workspaceId, run.notBefore]);
    expect(of('ticker.sweep')).toEqual([[null, morning + 30 * minute], [null, morning + hour]]);
    for (const type of ['ticker.tick', 'ticker.daily']) expect(of(type), type).toEqual([[workspaceA, morning + hour], [workspaceB, morning + hour]]);
    const broken = current.connection.prepare("SELECT workspace_id, not_before, state, source FROM messages WHERE type = 'ticker.broken' AND state = 'failed' ORDER BY workspace_id").all();
    expect(broken).toEqual([workspaceA, workspaceB].map((workspaceId) => ({ workspace_id: workspaceId, not_before: morning + hour, state: 'failed', source: 'kernel' })));
    for (const run of runs) expect(run).toMatchObject({ source: 'kernel', priority: 'normal', payload: {} });
    expect(scheduleRows(current.connection).map((row) => [row.name, row.ws, row.dueAt])).toEqual([
      ['broken', workspaceA, morning + 2 * hour], ['broken', workspaceB, morning + 2 * hour],
      ['daily', workspaceA, morning + 25 * hour], ['daily', workspaceB, morning + 25 * hour],
      ['sweep', '', morning + 90 * minute],
      ['tick', workspaceA, morning + 2 * hour], ['tick', workspaceB, morning + 2 * hour],
    ]);
  });

  it('M2.7-E33 one outstanding run, followed after any end; every counts from activation', async () => {
    const current = await openTickerFixture(10 * minute);
    fixture = current;
    const { morning } = current;
    await enableTicker(current, workspaceA);
    await stepClock(current.runtime, current.connection, current.timers, hour);
    const ticks = async (): Promise<Array<number | null>> => (await runsOf(current.runtime)).filter((run) => run.type === 'ticker.tick').map((run) => run.notBefore);
    expect(await ticks()).toEqual([morning + 70 * minute]);
    const brokenRow = scheduleRows(current.connection).find((row) => row.name === 'broken');
    expect(brokenRow?.dueAt).toBe(morning + 130 * minute);
    const tickRow = scheduleRows(current.connection).find((row) => row.name === 'tick');
    valueOf(await command(current, 'kernel.cancel', { messageId: tickRow?.messageId ?? '' }, person));
    await settle(current.runtime, current.connection, () => current.timers.time.value);
    const replaced = scheduleRows(current.connection).find((row) => row.name === 'tick');
    expect(replaced?.messageId).not.toBe(tickRow?.messageId);
    expect(replaced?.dueAt).toBe(morning + 130 * minute);
    expect(outstandingPerSchedule(current).every((count) => count === 1)).toBe(true);
    await stepClock(current.runtime, current.connection, current.timers, hour);
    expect(await ticks()).toEqual([morning + 70 * minute, morning + 130 * minute]);
    expect(scheduleRows(current.connection).find((row) => row.name === 'tick')?.dueAt).toBe(morning + 190 * minute);
    expect(outstandingPerSchedule(current).every((count) => count === 1)).toBe(true);
  });
});
