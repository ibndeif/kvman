import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, person } from '../install/harness.ts';
import { disable, enable, grantsOf, valueOf } from '../workspaces/harness.ts';
import { hour, minute, openTickerFixture, runsOf, scheduleRows, scheduleTests, settle, tickerName, type ScheduleRow, type TickerFixture } from './harness.ts';

let fixture: TickerFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function stateOf(current: TickerFixture, messageId: string | null): unknown {
  return current.connection.prepare('SELECT state FROM messages WHERE id = ?').get(messageId ?? '')?.['state'];
}

function rowsBy(current: TickerFixture, name: string): ScheduleRow[] {
  return scheduleRows(current.connection).filter((row) => row.name === name);
}

describe('schedule runs across the extension lifecycle (ADR 0144)', scheduleTests, () => {
  it('M2.7-E34 runs follow disable, quarantine, reload, uninstall, and forget', async () => {
    const current = await openTickerFixture();
    fixture = current;
    const now = (): number => current.timers.time.value;
    const settled = (): Promise<void> => settle(current.runtime, current.connection, now);
    const { morning } = current;
    for (const workspaceId of [workspaceA, workspaceB]) valueOf(await enable(current, workspaceId, tickerName, grantsOf(current, tickerName)));
    await settled();

    const inB = scheduleRows(current.connection).filter((row) => row.ws === workspaceB);
    valueOf(await disable(current, workspaceB, tickerName));
    await settled();
    expect(scheduleRows(current.connection).filter((row) => row.ws === workspaceB)).toEqual([]);
    for (const row of inB) expect(stateOf(current, row.messageId), row.name).toBe('cancelled');
    expect(rowsBy(current, 'sweep').map((row) => row.ws)).toEqual(['']);
    current.timers.advance(5 * minute);
    valueOf(await enable(current, workspaceB, tickerName, grantsOf(current, tickerName)));
    await settled();
    expect(scheduleRows(current.connection).filter((row) => row.ws === workspaceB).map((row) => row.anchorAt)).toEqual([0, 1, 2].map(() => morning + 5 * minute));

    const waiting = scheduleRows(current.connection);
    await current.runtime.quarantine(tickerName, 'HOST_FAILURES');
    current.timers.advance(hour);
    expect(scheduleRows(current.connection)).toEqual(waiting);
    for (const row of waiting) expect(stateOf(current, row.messageId), row.name).toBe('pending');
    expect(current.connection.prepare("SELECT id FROM messages WHERE source = 'kernel' AND state IN ('running', 'done', 'failed')").all()).toEqual([]);
    valueOf(await command(current, 'kernel.extension.unquarantine', { name: tickerName }, person));
    await settled();
    expect((await runsOf(current.runtime)).filter((run) => run.type === 'ticker.tick').map((run) => [run.workspaceId, run.notBefore])).toEqual([[workspaceA, morning + hour], [workspaceB, morning + 65 * minute]]);

    const kept = [...rowsBy(current, 'sweep'), ...rowsBy(current, 'broken')];
    const ticks = rowsBy(current, 'tick');
    const daily = rowsBy(current, 'daily');
    valueOf(await command(current, 'kernel.extension.reload', { name: tickerName, digest: current.digests.second }, person));
    await settled();
    expect(rowsBy(current, 'daily')).toEqual([]);
    for (const row of daily) expect(stateOf(current, row.messageId)).toBe('cancelled');
    expect(rowsBy(current, 'tick').map((row) => row.messageId).some((id) => ticks.some((row) => row.messageId === id))).toBe(false);
    expect(rowsBy(current, 'hourly').map((row) => row.ws)).toEqual([workspaceA, workspaceB]);
    expect([...rowsBy(current, 'sweep'), ...rowsBy(current, 'broken')]).toEqual(kept);

    valueOf(await command(current, 'kernel.workspace.forget', { workspaceId: workspaceB }, person));
    await settled();
    expect(scheduleRows(current.connection).filter((row) => row.ws === workspaceB)).toEqual([]);

    const sweep = rowsBy(current, 'sweep')[0];
    valueOf(await disable(current, workspaceA, tickerName));
    await settled();
    expect(scheduleRows(current.connection)).toEqual([]);
    expect(stateOf(current, sweep?.messageId ?? null)).toBe('cancelled');
    valueOf(await command(current, 'kernel.extension.uninstall', { name: tickerName }, person));
    expect(current.connection.prepare('SELECT name FROM schedules WHERE extension = ?').all(tickerName)).toEqual([]);
  });
});
