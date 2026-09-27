import { groupAlive } from '@kvman/kernel';
import { expect, vi } from 'vitest';
import { command, send } from '../adapters/http-client.ts';
import { fixtureWorkspace } from '../child-kernel/workspace.ts';
import { inspect } from '../faults/ledger-database.ts';

export type ProcessRow = { id: string; pid: number; state: string; reason: string | null; detached: number; log_blob: string | null };

function objectOf(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`expected an object, got ${JSON.stringify(value)}`);
  return Object.fromEntries(Object.entries(value));
}

export function dataOf(json: unknown): unknown {
  return objectOf(json)['data'];
}

// runner.run through HTTP; with `wait: 0` it answers at once and the handler keeps running.
export async function runner(port: number, payload: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return objectOf((await command(port, 'runner.run', payload, { wait: 10_000, ...extra })).json);
}

export function processRows(home: string): ProcessRow[] {
  return inspect(home, (connection) => connection.prepare('SELECT id, pid, state, reason, detached, log_blob FROM processes ORDER BY started_at').all()).map((row) => ({
    id: String(row['id']), pid: Number(row['pid']), state: String(row['state']), reason: row['reason'] === null ? null : String(row['reason']),
    detached: Number(row['detached']), log_blob: row['log_blob'] === null ? null : String(row['log_blob']),
  }));
}

export async function runningRows(home: string, count: number): Promise<ProcessRow[]> {
  return vi.waitFor(() => {
    const running = processRows(home).filter((row) => row.state === 'running');
    expect(running).toHaveLength(count);
    return running;
  }, { timeout: 15_000, interval: 20 });
}

// What runner.finish recorded, read through HTTP.
export async function exits(port: number): Promise<Array<Record<string, unknown>>> {
  const answer = await send(port, 'POST', '/api/v1/queries/runner.exits.list', { body: { payload: {}, workspaceId: fixtureWorkspace } });
  const data = dataOf(answer.json);
  return Array.isArray(data) ? data.map(objectOf) : [];
}

export async function exitsFor(port: number, processId: string, count: number): Promise<Array<Record<string, unknown>>> {
  return vi.waitFor(async () => {
    const found = (await exits(port)).filter((exit) => objectOf(exit['payload'])['processId'] === processId);
    expect(found).toHaveLength(count);
    return found;
  }, { timeout: 20_000, interval: 50 });
}

export function payloadOf(exit: Record<string, unknown> | undefined): Record<string, unknown> {
  return objectOf(exit?.['payload']);
}

export async function gone(pid: number): Promise<void> {
  await vi.waitFor(() => expect(groupAlive(pid), `process group ${pid}`).toBe(false), { timeout: 15_000, interval: 20 });
}

// Invariant 5 (14 §14.3), checked while a kernel runs: every process is tracked (running and alive) or killed and
// marked, and every detached one that ended has exactly one onExit command, keyed `<processId>:exit`.
export function checkProcessInvariant(home: string): void {
  inspect(home, (connection) => {
    for (const row of connection.prepare('SELECT id, pid, state, detached FROM processes').all()) {
      if (row['state'] === 'running') expect(groupAlive(Number(row['pid'])), `running process ${String(row['id'])}`).toBe(true);
      if (row['state'] === 'running' || Number(row['detached']) !== 1) continue;
      const sent = connection.prepare("SELECT count(*) AS count FROM messages WHERE type = 'runner.finish' AND idempotency_key = ?").get(`${String(row['id'])}:exit`);
      expect(Number(sent?.['count']), `onExit of ${String(row['id'])}`).toBe(1);
    }
  });
}
