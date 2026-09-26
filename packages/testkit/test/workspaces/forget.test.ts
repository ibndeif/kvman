import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeAppliedPreset } from '@kvman/kernel';
import { afterEach, describe, expect, it } from 'vitest';
import { eventually, workspaceB } from '../hosts/harness.ts';
import { emptyPreset } from '../install/fixture-presets.ts';
import { command, problemOf, sendAs, person, type InstallFixture } from '../install/harness.ts';
import { admission, enable, eventsOf, openFolderAsWorkspace, openWorkspaceFixture, rows, run, start, temporaryFolder, valueOf, workspaceTests } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

// Every table with a workspace column (04 §4.4 step 3).
const workspaceColumns = [
  ['kv', 'ws'], ['docs', 'ws'], ['logs', 'ws'], ['blob_refs', 'ws'], ['messages', 'workspace_id'], ['events', 'workspace_id'], ['llm_usage', 'ws'],
  ['workspace_presets', 'workspace_id'], ['workspace_config', 'workspace_id'], ['notifications', 'ws'], ['workspaces', 'id'],
] as const;

function rowsWith(current: InstallFixture, workspaceId: string): Record<string, number> {
  return Object.fromEntries(workspaceColumns.map(([table, column]) => [table, Number(rows(current, `SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`, workspaceId)[0]?.['count'])]));
}

const none = Object.fromEntries(workspaceColumns.map(([table]) => [table, 0]));

// A real folder opened as a workspace, with an empty applied preset and Desk enabled in it.
async function deskWorkspace(current: InstallFixture): Promise<{ workspaceId: string; folder: string }> {
  const folder = temporaryFolder('forget');
  writeFileSync(join(folder, 'kept.txt'), 'the folder is never touched');
  const workspaceId = await openFolderAsWorkspace(current, folder);
  writeAppliedPreset(current.connection, workspaceId, emptyPreset(), 1);
  valueOf(await enable(current, workspaceId, '@acme/desk'));
  return { workspaceId, folder };
}

async function stateIs(current: InstallFixture, id: string, state: string): Promise<void> {
  await eventually(() => expect(rows(current, 'SELECT state FROM messages WHERE id = ?', id)).toEqual([{ state }]));
}

function forget(current: InstallFixture, workspaceId: string): Promise<string> {
  return sendAs(current, person, 'kernel.workspace.forget', { workspaceId });
}

describe('kernel.workspace.forget (plan 04 §4.4, ADR 0122)', workspaceTests, () => {
  it('M2.3-H5 forgetting a workspace with a running handler and a deferred command cancels both and leaves no rows with its id', async () => {
    const current = fixture = await openWorkspaceFixture();
    const { workspaceId, folder } = await deskWorkspace(current);
    valueOf(await enable(current, workspaceB, '@acme/desk'));
    valueOf(await run(current, 'desk.note', { lane: 'x' }, workspaceId));
    valueOf(await run(current, 'desk.note', { lane: 'x' }, workspaceB));
    current.connection.prepare("INSERT INTO docs (owner, ws, collection, id, data, version, created_at, updated_at) VALUES ('@acme/desk', ?, 'notes', 'n', '{}', 1, 1, 1)").run(workspaceId);
    current.connection.prepare("INSERT INTO logs (owner, ws, log, seq, data, at) VALUES ('@acme/desk', ?, 'events', 1, '{}', 1)").run(workspaceId);
    current.connection.prepare("INSERT INTO workspace_config (workspace_id, extension, value, revision, updated_at) VALUES (?, '@acme/desk', '{}', 1, 1)").run(workspaceId);
    current.connection.prepare("INSERT INTO notifications (id, ws, source, level, data, attention, created_at, updated_at) VALUES ('n1', ?, 'ext:@acme/desk', 'info', '{}', 0, 1, 1)").run(workspaceId);
    const hang = await start(current, 'desk.hang', {}, workspaceId);
    const ask = await start(current, 'desk.ask', {}, workspaceId);
    await stateIs(current, hang, 'running');
    await stateIs(current, ask, 'awaiting');
    const kept = rowsWith(current, workspaceB);
    const replies = [current.runtime.awaitReply(hang), current.runtime.awaitReply(ask)];

    expect(await command(current, 'kernel.workspace.forget', { workspaceId })).toEqual({ ok: true, value: {} });
    for (const reply of await Promise.all(replies)) expect(problemOf(reply)).toMatchObject({ code: 'CANCELLED' });
    expect(rows(current, "SELECT key, value FROM kv WHERE owner = '@acme/desk' AND ws = ''")).toEqual([{ key: `expired:${ask}`, value: JSON.stringify({ reason: 'cancelled' }) }]);
    expect(eventsOf(current, 'kernel.workspace.forgotten')).toEqual([{ workspaceId: null, payload: { workspaceId } }]);
    expect(rowsWith(current, workspaceId)).toEqual(none);
    expect(readdirSync(folder)).toEqual(['kept.txt']);
    expect(rowsWith(current, workspaceB)).toEqual(kept);
    await eventually(() => expect(current.runtime.hosts.workers().every((worker) => worker.inFlight === 0)).toBe(true));
    expect(rowsWith(current, workspaceId)).toEqual(none);
  });

  it('M2.3-E7 while a forget waits, people are refused and the kernel\'s onAbort commands run', async () => {
    const current = fixture = await openWorkspaceFixture();
    const { workspaceId } = await deskWorkspace(current);
    const ask = await start(current, 'desk.ask.stuck', {}, workspaceId);
    await stateIs(current, ask, 'awaiting');
    const forgetting = await forget(current, workspaceId);
    await eventually(() => expect(rows(current, "SELECT source, state FROM messages WHERE type = 'desk.expire.stuck'")).toEqual([{ source: 'kernel', state: 'running' }]));
    expect(await admission(current, 'desk.note', { lane: 'x' }, person, workspaceId)).toBe('WORKSPACE_INVALID');
    current.timers.advance(10_000);
    expect(await current.runtime.awaitReply(forgetting)).toEqual({ ok: true, value: {} });
  });

  it('M2.3-E8 the forget deletes the workspace\'s rows in every table and keeps the others\'', async () => {
    const current = fixture = await openWorkspaceFixture();
    const { workspaceId } = await deskWorkspace(current);
    valueOf(await enable(current, workspaceB, '@acme/desk'));
    const notes = { forgotten: valueOf(await run(current, 'desk.note', { lane: 'x' }, workspaceId)), kept: valueOf(await run(current, 'desk.note', { lane: 'x' }, workspaceB)) };
    expect(notes).toEqual({ forgotten: {}, kept: {} });
    for (const ws of [workspaceId, workspaceB, '']) {
      current.connection.prepare("INSERT INTO docs (owner, ws, collection, id, data, version, created_at, updated_at) VALUES ('@acme/desk', ?, 'notes', 'n', '{}', 1, 1, 1)").run(ws);
      current.connection.prepare("INSERT INTO logs (owner, ws, log, seq, data, at) VALUES ('@acme/desk', ?, 'events', 1, '{}', 1)").run(ws);
      current.connection.prepare("INSERT INTO blob_refs (blob_id, owner, ws, ref, expires_at) VALUES (?, '@acme/desk', ?, 'r', NULL)").run('a'.repeat(64), ws);
      current.connection.prepare("INSERT INTO llm_usage (message_id, ws, caller, provider, model, input, output, cache_read, cache_write, cost_usd, correlation_id, at) VALUES (?, ?, '@acme/desk', 'p', 'm', 1, 1, 0, 0, 0, 'c', 1)").run(`usage-${ws}`, ws);
      current.connection.prepare("INSERT INTO notifications (id, ws, source, level, data, attention, created_at, updated_at) VALUES (?, ?, 'ext:@acme/desk', 'info', '{}', 0, 1, 1)").run(`note-${ws}`, ws);
    }
    for (const ws of [workspaceId, workspaceB]) {
      current.connection.prepare("INSERT INTO workspace_config (workspace_id, extension, value, revision, updated_at) VALUES (?, '@acme/desk', '{}', 1, 1)").run(ws);
      current.connection.prepare("INSERT INTO events (id, type, source, workspace_id, payload, correlation_id, created_at) VALUES (?, 'desk.seen', 'kernel', ?, '{}', 'c', 1)").run(`event-${ws}`, ws);
    }
    const [message] = rows(current, 'SELECT id FROM messages WHERE workspace_id = ?', workspaceId);
    current.connection.prepare("INSERT INTO steps (message_id, name, state) VALUES (?, 's', 'done')").run(String(message?.['id']));
    current.connection.prepare("INSERT INTO recorded_values (message_id, kind, n, value) VALUES (?, 'id', 1, 'x')").run(String(message?.['id']));
    const kept = rowsWith(current, workspaceB);
    const global = rowsWith(current, '');
    expect(await command(current, 'kernel.workspace.forget', { workspaceId })).toEqual({ ok: true, value: {} });
    expect(rowsWith(current, workspaceId)).toEqual(none);
    expect(rows(current, 'SELECT COUNT(*) AS count FROM steps WHERE message_id = ?', String(message?.['id']))).toEqual([{ count: 0 }]);
    expect(rows(current, 'SELECT COUNT(*) AS count FROM recorded_values WHERE message_id = ?', String(message?.['id']))).toEqual([{ count: 0 }]);
    expect(rowsWith(current, workspaceB)).toEqual(kept);
    expect(rowsWith(current, '')).toEqual(global);
  });

  it('M2.3-E9 an onAbort that never finishes is aborted after 10 s and the forget completes', async () => {
    const current = fixture = await openWorkspaceFixture();
    const { workspaceId } = await deskWorkspace(current);
    const ask = await start(current, 'desk.ask.stuck', {}, workspaceId);
    await stateIs(current, ask, 'awaiting');
    const forgetting = await forget(current, workspaceId);
    await eventually(() => expect(rows(current, "SELECT state FROM messages WHERE type = 'desk.expire.stuck'")).toEqual([{ state: 'running' }]));
    await eventually(() => expect(current.timers.pendingDelays()).toContain(10_000));
    current.timers.advance(10_000);
    expect(await current.runtime.awaitReply(forgetting)).toEqual({ ok: true, value: {} });
    expect(rowsWith(current, workspaceId)).toEqual(none);
  });

  it('M2.3-E10 a forget sent in the workspace it forgets replies and leaves no row; a second forget is refused', async () => {
    const current = fixture = await openWorkspaceFixture();
    const { workspaceId } = await deskWorkspace(current);
    const ask = await start(current, 'desk.ask.stuck', {}, workspaceId);
    await stateIs(current, ask, 'awaiting');
    const first = await sendAs(current, person, 'kernel.workspace.forget', { workspaceId }, workspaceId);
    await eventually(() => expect(rows(current, "SELECT state FROM messages WHERE type = 'desk.expire.stuck'")).toEqual([{ state: 'running' }]));
    expect(await admission(current, 'kernel.workspace.forget', { workspaceId }, person, workspaceId)).toBe('WORKSPACE_INVALID');
    expect(problemOf(await command(current, 'kernel.workspace.forget', { workspaceId }))).toMatchObject({ code: 'WORKSPACE_INVALID' });
    current.timers.advance(10_000);
    expect(await current.runtime.awaitReply(first)).toEqual({ ok: true, value: {} });
    expect(rows(current, 'SELECT id FROM messages WHERE id = ?', first)).toEqual([]);
  });

  it('M2.3-E11 a workspace that does not exist cannot be forgotten', async () => {
    const current = fixture = await openWorkspaceFixture();
    expect(problemOf(await command(current, 'kernel.workspace.forget', { workspaceId: 'c'.repeat(64) }))).toMatchObject({ code: 'WORKSPACE_INVALID' });
  });
});
