import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { insertMessage, type Connection } from '@kvman/kernel';
import { jsonObjectSchema, type Message } from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import kiosk from '../../../protocol/test/fixtures/kiosk-preset.json' with { type: 'json' };
import { eventually, workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, installed, installTests, openInstallFixture, problemOf, staged, type InstallFixture } from './harness.ts';
import { extensionSource, packPackage, writePackage } from './packages.ts';
import { startRegistry, type LocalRegistry } from './registries.ts';

let registry: LocalRegistry;
let fixture: InstallFixture | undefined;

beforeAll(async () => {
  registry = await startRegistry();
  for (const namespace of ['keep', 'drop', 'busy']) {
    await registry.publish(await packPackage(writePackage({ name: `@acme/${namespace}`, files: { 'dist/extension.js': extensionSource(`@acme/${namespace}`, namespace) } })));
  }
});
afterAll(async () => {
  await registry.close();
});
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const grants = { isolation: 'sandboxed', requested: [], derived: { subscribes: [], providesLlm: [] } };

function presetEntry(name: string): object {
  return { source: `npm:${name}@1.0.0`, integrity: 'sha512-AAAA', enabled: false, grants };
}

// Every row 06 §6.8 names for one extension, in two workspaces and global where rows have a workspace.
function seedData(connection: Connection, name: string): void {
  for (const ws of [workspaceA, workspaceB, '']) {
    connection.prepare('INSERT INTO kv (owner, ws, key, value, version, updated_at) VALUES (?, ?, ?, ?, 1, 1)').run(name, ws, 'k', '1');
    connection.prepare('INSERT INTO docs (owner, ws, collection, id, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, 1)').run(name, ws, 'notes', 'n', '{}');
    connection.prepare('INSERT INTO logs (owner, ws, log, seq, data, at) VALUES (?, ?, ?, 1, ?, 1)').run(name, ws, 'events', '{}');
    connection.prepare('INSERT INTO blob_refs (blob_id, owner, ws, ref, expires_at) VALUES (?, ?, ?, ?, NULL)').run('a'.repeat(64), name, ws, 'r');
  }
  connection.prepare('INSERT INTO global_config (extension, value, revision) VALUES (?, ?, 1)').run(name, '{}');
  connection.prepare('INSERT INTO workspace_config (workspace_id, extension, value, revision, updated_at) VALUES (?, ?, ?, 1, 1)').run(workspaceA, name, '{}');
  connection.prepare('INSERT INTO schema_versions (owner, version) VALUES (?, 2)').run(name);
  connection.prepare('INSERT INTO notifications (id, ws, source, level, data, attention, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, 1)').run(`${name}-n`, workspaceA, `ext:${name}`, 'info', '{}');
  connection.prepare('INSERT INTO llm_models (provider, id, extension, info, source, refreshed_at) VALUES (?, ?, ?, ?, ?, 1)').run(`${name.slice(6)}-provider`, 'm', name, '{}', 'static');
}

const dataQueries = [
  'SELECT owner FROM kv WHERE owner = ?', 'SELECT owner FROM docs WHERE owner = ?', 'SELECT owner FROM logs WHERE owner = ?', 'SELECT owner FROM blob_refs WHERE owner = ?',
  'SELECT extension FROM global_config WHERE extension = ?', 'SELECT extension FROM workspace_config WHERE extension = ?', 'SELECT owner FROM schema_versions WHERE owner = ?',
  "SELECT id FROM notifications WHERE source = 'ext:' || ?", 'SELECT id FROM llm_models WHERE extension = ?',
];

function dataRows(connection: Connection, name: string): number[] {
  return dataQueries.map((sql) => connection.prepare(sql).all(name).length);
}

function presetExtensions(connection: Connection): { names: string[]; revision: unknown } {
  const row = connection.prepare('SELECT preset, revision FROM workspace_presets WHERE workspace_id = ?').get(workspaceA);
  const preset = jsonObjectSchema.parse(JSON.parse(String(row?.['preset'])));
  return { names: Object.keys(jsonObjectSchema.parse(preset['extensions'])).sort(), revision: row?.['revision'] };
}

describe('uninstall (plan 06 §6.8, ADR 0120)', installTests, () => {
  it('M2.2-H5 uninstall keeps or deletes data as chosen', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const keep = await installed(fixture, 'npm:@acme/keep@1.0.0');
    const drop = await installed(fixture, 'npm:@acme/drop@1.0.0');
    for (const name of ['@acme/keep', '@acme/drop']) seedData(fixture.connection, name);
    const preset = { ...kiosk, revision: 3, extensions: { '@acme/keep': presetEntry('@acme/keep'), '@acme/drop': presetEntry('@acme/drop') } };
    fixture.connection.prepare('INSERT INTO workspace_presets (workspace_id, preset, revision, applied_at) VALUES (?, ?, 3, 1)').run(workspaceA, JSON.stringify(preset));
    expect(await command(fixture, 'kernel.extension.uninstall', { name: '@acme/keep' })).toEqual({ ok: true, value: {} });
    expect(await command(fixture, 'kernel.extension.uninstall', { name: '@acme/drop', deleteData: true })).toEqual({ ok: true, value: {} });
    for (const { stage, name } of [{ stage: keep, name: '@acme/keep' }, { stage: drop, name: '@acme/drop' }]) {
      expect(fixture.connection.prepare('SELECT name FROM extensions WHERE name = ? UNION SELECT name FROM extension_versions WHERE name = ?').all(name, name)).toEqual([]);
      const snapshot = join(fixture.home, 'extensions', 'snapshots', stage.digest);
      await eventually(() => expect(existsSync(snapshot)).toBe(false));
      expect(fixture.connection.prepare("SELECT payload FROM events WHERE type = 'kernel.extension.uninstalled' AND payload = ?").all(JSON.stringify({ name }))).toHaveLength(1);
    }
    expect(dataRows(fixture.connection, '@acme/keep')).toEqual([3, 3, 3, 3, 1, 1, 1, 1, 1]);
    expect(dataRows(fixture.connection, '@acme/drop')).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(presetExtensions(fixture.connection)).toEqual({ names: ['@acme/keep'], revision: 4 });
    expect(fixture.connection.prepare("SELECT workspace_id, payload FROM events WHERE type = 'kernel.preset.changed'").all()).toEqual([
      { workspace_id: workspaceA, payload: JSON.stringify({ workspaceId: workspaceA, revision: 4, cause: 'disable' }) },
    ]);
  });

  it('M2.2-E38 an extension enabled somewhere cannot be uninstalled', async () => {
    fixture = await openInstallFixture({ registry: registry.url, enabled: [[workspaceA, ['@acme/keep']], [workspaceB, ['@acme/keep']]] });
    await installed(fixture, 'npm:@acme/keep@1.0.0');
    expect(problemOf(await command(fixture, 'kernel.extension.uninstall', { name: '@acme/keep' }))).toMatchObject({ code: 'EXT_IN_USE', params: { workspaces: [workspaceA, workspaceB] } });
    expect(fixture.connection.prepare('SELECT name FROM extension_versions').all()).toEqual([{ name: '@acme/keep' }]);
  });

  it('M2.2-E39 a name that is not installed', async () => {
    fixture = await openInstallFixture();
    expect(problemOf(await command(fixture, 'kernel.extension.uninstall', { name: '@acme/none' }))).toMatchObject({ code: 'NOT_FOUND', detail: 'no extension @acme/none is installed' });
  });

  it('M2.2-E40 its unfinished messages are cancelled and their waiters answered, without onAbort', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    await installed(fixture, 'npm:@acme/busy@1.0.0');
    const now = fixture.timers.time.value;
    const message = (id: string, kind: Message['kind'], type: string): Message => ({
      v: 1, id, kind, type, source: 'user:local', workspaceId: workspaceA, payload: {}, correlationId: id, context: {}, priority: 'normal', createdAt: now,
      ...(kind === 'event' ? { delivery: 'durable' as const } : {}),
    });
    const ids = ['01JAZ3K4M5N6P7Q8R9S0T1V2W4', '01JAZ3K4M5N6P7Q8R9S0T1V2W5', '01JAZ3K4M5N6P7Q8R9S0T1V2W6'] as const;
    insertMessage(fixture.connection, { message: message(ids[0], 'command', 'busy.echo'), handler: '@acme/busy' }, 'pending', undefined, now);
    insertMessage(fixture.connection, { message: message(ids[1], 'command', 'busy.echo'), handler: '@acme/busy' }, 'awaiting', undefined, now);
    fixture.connection.prepare('UPDATE messages SET on_abort = ? WHERE id = ?').run('busy.aborted', ids[1]);
    insertMessage(fixture.connection, { message: message(ids[2], 'event', 'kernel.extension.installed'), handler: '@acme/busy|subscription:kernel.*' }, 'pending', undefined, now);
    const waiters = ids.map((id) => fixture?.runtime.awaitReply(id));
    expect(await command(fixture, 'kernel.extension.uninstall', { name: '@acme/busy' })).toEqual({ ok: true, value: {} });
    for (const waiter of waiters) expect(await waiter).toMatchObject({ ok: false, problem: { code: 'CANCELLED' } });
    expect(fixture.connection.prepare(`SELECT state FROM messages WHERE id IN (?, ?, ?)`).all(...ids)).toEqual([{ state: 'cancelled' }, { state: 'cancelled' }, { state: 'cancelled' }]);
    expect(fixture.connection.prepare("SELECT id FROM messages WHERE type = 'busy.aborted'").all()).toEqual([]);
  });

  it('M2.2-E41 kept snapshots reinstall with local: and find their kept data', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const { digest } = await installed(fixture, 'npm:@acme/keep@1.0.0');
    seedData(fixture.connection, '@acme/keep');
    expect(await command(fixture, 'kernel.extension.uninstall', { name: '@acme/keep', keepSnapshots: true })).toMatchObject({ ok: true });
    expect(existsSync(join(fixture.home, 'extensions', 'snapshots', digest))).toBe(true);
    const local = await staged(fixture, `local:${digest}`);
    expect(await command(fixture, 'kernel.extension.install', { confirmationToken: local.confirmationToken })).toEqual({ ok: true, value: { name: '@acme/keep', digest } });
    expect(fixture.connection.prepare('SELECT source FROM extension_versions WHERE name = ?').all('@acme/keep')).toEqual([{ source: `local:${digest}` }]);
    expect(dataRows(fixture.connection, '@acme/keep')).toEqual([3, 3, 3, 3, 1, 1, 1, 1, 1]);
  });
});
