import { describe, expect, it } from 'vitest';
import { temporaryHome } from '../daemon/harness.ts';
import { bootHome, type BootedHome } from '../first-run/builtins.ts';
import { workspaceA } from '../hosts/harness.ts';
import { applyTestPreset, withHomeDatabase } from '../install/fixture-presets.ts';
import { prepareHome } from '../install/fixture-snapshots.ts';
import { hour, installTicker, minute, nextEight, runsOf, scheduleRows, scheduleTests, settle, stepClock, tickerGrant, tickerName, type ScheduleRow } from './harness.ts';

const morning = nextEight(1_790_000_000_000);

// A home with Ticker 1.0.0 enabled in A by the test helper (ADR 0124).
async function tickerHome(): Promise<string> {
  const home = temporaryHome();
  await prepareHome(home, async (connection, folder) => {
    await installTicker(connection, folder);
    applyTestPreset(connection, { workspaceId: workspaceA, path: '/w/a', name: 'A' }, { [tickerName]: tickerGrant });
  });
  return home;
}

async function boot(home: string, startAt: number): Promise<BootedHome> {
  const booted = await bootHome(home, { startAt });
  await settle(booted.kernel.runtime, booted.kernel.connection, () => booted.timers.time.value);
  return booted;
}

async function stepped(booted: BootedHome, total: number): Promise<void> {
  await stepClock(booted.kernel.runtime, booted.kernel.connection, booted.timers, total);
}

function due(rows: readonly ScheduleRow[]): Array<[string, number]> {
  return rows.map((row) => [row.name, row.dueAt]);
}

describe('schedules across restarts (plan 03 §3.4, §3.9, ADR 0144)', scheduleTests, () => {
  it('M2.7-H6 a schedule fires on time and survives a restart', async () => {
    const home = await tickerHome();
    const first = await boot(home, morning);
    await stepped(first, hour);
    first.timers.advance(10 * minute);
    const rowsBefore = scheduleRows(first.kernel.connection);
    await first.close();
    const second = await boot(home, morning + 80 * minute);
    try {
      expect(scheduleRows(second.kernel.connection)).toEqual(rowsBefore);
      await stepped(second, 40 * minute);
      const runs = await runsOf(second.kernel.runtime);
      const at = (type: string) => runs.filter((run) => run.type === type).map((run) => [run.workspaceId, run.notBefore]);
      expect(at('ticker.tick')).toEqual([[workspaceA, morning + hour], [workspaceA, morning + 2 * hour]]);
      expect(at('ticker.daily')).toEqual([[workspaceA, morning + hour]]);
      expect(at('ticker.sweep')).toEqual([30, 60, 90, 120].map((minutes) => [null, morning + minutes * minute]));
      for (const run of runs) expect(run).toMatchObject({ source: 'kernel', priority: 'normal' });
    } finally {
      await second.close();
    }
  });

  it('M2.7-E39 occurrences missed while the daemon was down collapse into one catch-up run', async () => {
    const home = await tickerHome();
    const first = await boot(home, morning);
    first.timers.advance(5 * minute);
    await first.close();
    const second = await boot(home, morning + 4 * hour + 20 * minute);
    try {
      const runs = await runsOf(second.kernel.runtime);
      expect(runs.map((run) => [run.type, run.notBefore])).toEqual([['ticker.sweep', morning + 30 * minute], ['ticker.daily', morning + hour], ['ticker.tick', morning + hour]]);
      expect(due(scheduleRows(second.kernel.connection).filter((row) => row.name !== 'broken'))).toEqual([
        ['daily', morning + 25 * hour], ['sweep', morning + 4 * hour + 30 * minute], ['tick', morning + 5 * hour],
      ]);
    } finally {
      await second.close();
    }
  });

  it("M2.7-E35 a crash between a run's end and its next run loses nothing", async () => {
    const home = await tickerHome();
    const first = await boot(home, morning);
    const rows = scheduleRows(first.kernel.connection);
    const tick = rows.find((row) => row.name === 'tick');
    const daily = rows.find((row) => row.name === 'daily');
    await first.close();
    // The states a crash between a run's end and its next run's unit leaves: an ended run, and a vanished one.
    withHomeDatabase(home, (connection) => {
      connection.prepare("UPDATE messages SET state = 'done' WHERE id = ?").run(tick?.messageId ?? '');
      connection.prepare('DELETE FROM messages WHERE id = ?').run(daily?.messageId ?? '');
    });
    const restarted = await boot(home, morning + 30 * minute);
    try {
      const after = scheduleRows(restarted.kernel.connection);
      for (const name of ['tick', 'daily']) {
        const row = after.find((candidate) => candidate.name === name);
        const unfinished = restarted.kernel.connection.prepare("SELECT COUNT(*) AS count FROM messages WHERE type = ? AND state IN ('pending', 'running')").get(`ticker.${name}`);
        expect(row?.messageId, name).not.toBe(name === 'tick' ? tick?.messageId : daily?.messageId);
        expect(Number(unfinished?.['count']), name).toBe(1);
      }
      expect(due(after.filter((row) => row.name === 'tick' || row.name === 'daily'))).toEqual([['daily', morning + hour], ['tick', morning + hour]]);
    } finally {
      await restarted.close();
    }
  });
});
