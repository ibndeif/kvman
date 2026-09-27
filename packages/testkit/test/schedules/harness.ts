import { fileURLToPath } from 'node:url';
import type { KernelRuntime } from '@kvman/kernel';
import { jsonObjectSchema, type Capabilities, type JsonObject } from '@kvman/protocol';
import { expect, vi } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { installFixture } from '../install/fixture-snapshots.ts';
import { openInstallFixture, person, type InstallFixture } from '../install/harness.ts';
import type { Connection } from '@kvman/kernel';
import ticker1 from './fixtures/extensions/ticker/ticker-1.ts';
import ticker2 from './fixtures/extensions/ticker/ticker-2.ts';

// ADR 0144: cron runs in the machine's local time zone; the schedule tests run in UTC.
process.env['TZ'] = 'UTC';

export const scheduleTests = { timeout: 120_000 } as const;

export const tickerName = '@acme/ticker';

const tickerFolder = fileURLToPath(new URL('./fixtures/extensions/ticker/', import.meta.url));

export const hour = 3_600_000;
export const minute = 60_000;

export const tickerGrant: Capabilities = { isolation: 'sandboxed', requested: [], derived: { subscribes: [], providesLlm: [] } };

// Ticker 1.0.0 (active) and 2.0.0, as snapshots.
export async function installTicker(connection: Connection, home: string): Promise<{ first: string; second: string }> {
  const first = await installFixture(connection, home, { definition: ticker1, folder: tickerFolder, entry: 'ticker-1.ts', version: '1.0.0' });
  const second = await installFixture(connection, home, { definition: ticker2, folder: tickerFolder, entry: 'ticker-2.ts', version: '2.0.0' });
  return { first, second };
}

// The first 08:00 UTC at or after the clock.
export function nextEight(now: number): number {
  const day = Math.floor(now / (24 * hour)) * 24 * hour;
  return day + 8 * hour >= now ? day + 8 * hour : day + 32 * hour;
}

export type TickerFixture = InstallFixture & { digests: { first: string; second: string }; morning: number };

// A runtime with Ticker installed and the clock at 08:00 UTC plus `offset`; nothing is enabled.
export async function openTickerFixture(offset = 0): Promise<TickerFixture> {
  const fixture = await openInstallFixture();
  const digests = await installTicker(fixture.connection, fixture.home);
  fixture.runtime.registry.refresh();
  const morning = nextEight(fixture.timers.time.value);
  fixture.timers.advance(morning + offset - fixture.timers.time.value);
  return { ...fixture, digests, morning };
}

// Nothing runs or is due, and every schedule row waits on an unfinished run, after the schedules reconciled.
export async function settle(runtime: KernelRuntime, connection: Connection, now: () => number): Promise<void> {
  await vi.waitFor(async () => {
    await runtime.schedules.settled();
    expect(connection.prepare("SELECT id FROM messages WHERE state = 'running' OR (state = 'pending' AND COALESCE(not_before, 0) <= ?)").all(now())).toEqual([]);
    expect(connection.prepare("SELECT s.name FROM schedules s LEFT JOIN messages m ON m.id = s.message_id WHERE m.state IS NULL OR m.state NOT IN ('pending', 'running')").all()).toEqual([]);
  }, { timeout: 30_000, interval: 20 });
}

// Moves the clock in steps of `step`, letting every due run finish after each. The schedules of these tests fall on
// 5-minute boundaries, so a step ends at each due time: a run never starts in the middle of a step, where the rest of
// the step would pass its handler timeout before it could answer.
export async function stepClock(runtime: KernelRuntime, connection: Connection, timers: { advance(ms: number): void; time: { value: number } }, total: number, step = 5 * minute): Promise<void> {
  for (let moved = 0; moved < total; moved += step) {
    timers.advance(Math.min(step, total - moved));
    await settle(runtime, connection, () => timers.time.value);
  }
}

export type Run = { type: string; source: string; priority: string; workspaceId: string | null; payload: JsonObject; notBefore: number | null };

// What Ticker recorded, ordered by due time, type, and workspace.
export async function runsOf(runtime: KernelRuntime, workspaceId = workspaceA): Promise<Run[]> {
  const answer = jsonObjectSchema.parse(JSON.parse(JSON.stringify(await runtime.query({ sender: person, type: 'ticker.runs.list', payload: {}, cause: undefined, workspaceId }))));
  const runs = [answer['value']].flat().map((entry) => {
    const run = jsonObjectSchema.parse(entry);
    return {
      type: String(run['type']), source: String(run['source']), priority: String(run['priority']), workspaceId: typeof run['workspaceId'] === 'string' ? run['workspaceId'] : null,
      payload: jsonObjectSchema.parse(run['payload']), notBefore: typeof run['notBefore'] === 'number' ? run['notBefore'] : null,
    };
  });
  return runs.sort((left, right) => (left.notBefore ?? 0) - (right.notBefore ?? 0) || left.type.localeCompare(right.type) || (left.workspaceId ?? '').localeCompare(right.workspaceId ?? ''));
}

export type ScheduleRow = { name: string; ws: string; anchorAt: number; dueAt: number; messageId: string | null };

export function scheduleRows(connection: Connection): ScheduleRow[] {
  return connection.prepare('SELECT name, ws, anchor_at, due_at, message_id FROM schedules ORDER BY name, ws').all().map((row) => ({
    name: String(row['name']), ws: String(row['ws']), anchorAt: Number(row['anchor_at']), dueAt: Number(row['due_at']), messageId: typeof row['message_id'] === 'string' ? row['message_id'] : null,
  }));
}
