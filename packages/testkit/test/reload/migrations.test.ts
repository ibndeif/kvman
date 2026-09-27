import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { problemOf } from '../install/harness.ts';
import { admission, disable, eventsOf, presetRow, rows, valueOf } from '../workspaces/harness.ts';
import { addNote, enableNotes, notesItems, notesName, notesRow, openReloadFixture, reload, reloadTests, setNotesConfig, versionIn, type ReloadFixture } from './harness.ts';

let fixture: ReloadFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function seeded(versions: Parameters<typeof openReloadFixture>[0], workspaces: readonly string[] = [workspaceA]): Promise<ReloadFixture> {
  const opened = await openReloadFixture(versions);
  for (const workspaceId of workspaces) {
    valueOf(await enableNotes(opened, workspaceId));
    await addNote(opened, workspaceId, 'n1', `one in ${workspaceId.slice(0, 1)}`);
  }
  await addNote(opened, workspaces[0] ?? workspaceA, 'g1', 'global one', true);
  return opened;
}

describe('data migrations at reload (plan 04 §4.8, 06 §6.6, ADRs 0142, 0143)', reloadTests, () => {
  it('M2.7-H1 an upgrade with a migration runs it once', async () => {
    fixture = await seeded(['1.0.0', '2.0.0'], [workspaceA, workspaceB]);
    const digest = fixture.digestOf('2.0.0');
    expect(valueOf(await reload(fixture, { digest }))).toEqual({ digest });
    const items = notesItems(fixture);
    expect(items.map((item) => item.ws)).toEqual(['', workspaceA, workspaceB]);
    for (const item of items) expect(Object.keys(item.data).sort()).toEqual(['id', 'order', 'title']);
    expect(notesRow(fixture)).toMatchObject({ activeDigest: digest, migrating: null, stored: 2, status: 'active' });
    expect(await versionIn(fixture, workspaceA)).toBe('2.0.0');
    expect(eventsOf(fixture, 'kernel.extension.reloaded').map((event) => event.workspaceId)).toEqual([workspaceA, workspaceB]);
    const kvBefore = fixture.connection.prepare("SELECT ws, key, value FROM kv WHERE owner = '@acme/notes' ORDER BY ws, key").all();
    expect(valueOf(await reload(fixture, { digest }))).toEqual({ digest });
    expect(fixture.connection.prepare("SELECT ws, key, value FROM kv WHERE owner = '@acme/notes' ORDER BY ws, key").all()).toEqual(kvBefore);
    expect(notesItems(fixture)).toEqual(items);
  });

  it('M2.7-H2 a migration that fails at its first step leaves the old version active', async () => {
    fixture = await seeded(['1.0.0', '2.0.1']);
    const before = notesItems(fixture);
    const problem = problemOf(await reload(fixture, { digest: fixture.digestOf('2.0.1') }));
    expect(problem.code).toBe('MIGRATION_FAILED');
    expect(problem.detail).toContain('step 2');
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.0.0'), migrating: null, stored: 1, status: 'active' });
    expect(notesItems(fixture)).toEqual(before);
    expect(await versionIn(fixture, workspaceA)).toBe('1.0.0');
    expect(eventsOf(fixture, 'kernel.extension.reloaded')).toEqual([]);
  });

  it('M2.7-H3 a migration that fails after a committed step quarantines; Retry upgrade resumes it', async () => {
    fixture = await seeded(['1.0.0', '3.0.0']);
    await setNotesConfig(fixture, 'global', { blockStep3: true });
    const digest = fixture.digestOf('3.0.0');
    expect(problemOf(await reload(fixture, { digest })).code).toBe('MIGRATION_FAILED');
    expect(notesRow(fixture)).toMatchObject({ stored: 2, migrating: { digest }, status: 'quarantined', reason: 'MIGRATION_FAILED' });
    expect(eventsOf(fixture, 'kernel.extension.quarantined').map((event) => event.payload)).toEqual([{ name: '@acme/notes', reason: 'MIGRATION_FAILED' }]);
    expect(await admission(fixture, 'notes.add', { id: 'n2', text: 'two' })).toBe('HANDLER_UNAVAILABLE');
    const itemsAfterStep2 = notesItems(fixture);
    await setNotesConfig(fixture, 'global', { blockStep3: false, migrated: true });
    expect(valueOf(await reload(fixture, { digest }))).toEqual({ digest });
    expect(notesItems(fixture)).toEqual(itemsAfterStep2);
    expect(notesRow(fixture)).toMatchObject({ activeDigest: digest, stored: 3, migrating: null, status: 'active', reason: null });
    expect(eventsOf(fixture, 'kernel.extension.unquarantined').map((event) => event.payload)).toEqual([{ name: '@acme/notes' }]);
  });

  it('M2.7-E1 a reload of an extension enabled nowhere runs no migration; enable does', async () => {
    fixture = await seeded(['1.0.0', '2.0.0']);
    valueOf(await disable(fixture, workspaceA, notesName));
    const digest = fixture.digestOf('2.0.0');
    expect(valueOf(await reload(fixture, { digest }))).toEqual({ digest });
    expect(notesRow(fixture)).toMatchObject({ activeDigest: digest, stored: 1, migrating: null });
    expect(notesItems(fixture).every((item) => 'text' in item.data)).toBe(true);
    expect(eventsOf(fixture, 'kernel.extension.reloaded')).toEqual([]);
    valueOf(await enableNotes(fixture, workspaceA));
    expect(notesRow(fixture)).toMatchObject({ stored: 2, migrating: null });
    expect(notesItems(fixture).every((item) => 'title' in item.data && !('text' in item.data))).toBe(true);
  });

  it('M2.7-E2 without a stored version, no migration runs and the row is written', async () => {
    fixture = await openReloadFixture(['2.0.0', '3.0.0']);
    expect(notesRow(fixture).stored).toBeNull();
    valueOf(await enableNotes(fixture, workspaceA));
    expect(notesRow(fixture).stored).toBe(2);
    expect(rows(fixture, 'SELECT extension FROM global_config')).toEqual([]);
    valueOf(await disable(fixture, workspaceA, notesName));
    valueOf(await reload(fixture, { digest: fixture.digestOf('3.0.0') }));
    valueOf(await enableNotes(fixture, workspaceA));
    expect(notesRow(fixture).stored).toBe(3);
    expect(rows(fixture, 'SELECT extension FROM global_config')).toEqual([]);
  });

  it('M2.7-E3 a stored version newer than the code fails SCHEMA_TOO_NEW unless covered', async () => {
    fixture = await openReloadFixture(['1.0.0', '1.1.0']);
    fixture.connection.prepare('INSERT INTO schema_versions (owner, version) VALUES (?, 2)').run(notesName);
    const revision = presetRow(fixture).revision;
    expect(problemOf(await enableNotes(fixture, workspaceA))).toMatchObject({ code: 'SCHEMA_TOO_NEW', params: { stored: 2, supported: 1 } });
    expect(presetRow(fixture).revision).toBe(revision);
    expect(notesRow(fixture).stored).toBe(2);
    valueOf(await reload(fixture, { digest: fixture.digestOf('1.1.0') }));
    valueOf(await enableNotes(fixture, workspaceA));
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.1.0'), stored: 2 });
  });

  it('M2.7-E6 a part-way failure keeps the active version when it covers the intermediate version', async () => {
    fixture = await seeded(['1.1.0', '3.0.0']);
    await setNotesConfig(fixture, 'global', { blockStep3: true });
    expect(problemOf(await reload(fixture, { digest: fixture.digestOf('3.0.0') })).code).toBe('MIGRATION_FAILED');
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.1.0'), stored: 2, migrating: null, status: 'active' });
    expect(await versionIn(fixture, workspaceA)).toBe('1.1.0');
  });

  it('M2.7-E10 a migration runs at the most isolated level granted', async () => {
    fixture = await openReloadFixture(['1.0.0', '2.4.0']);
    valueOf(await enableNotes(fixture, workspaceA, 'shared'));
    valueOf(await enableNotes(fixture, workspaceB, 'sandboxed'));
    await addNote(fixture, workspaceA, 'n1', 'one');
    const sharedHosts = (): string[] => (fixture?.runtime.hosts.hosts() ?? []).filter((entry) => entry.isolation === 'shared').map((entry) => entry.worker.host);
    const before = sharedHosts();
    const reloading = reload(fixture, { digest: fixture.digestOf('2.4.0') });
    await vi.waitFor(() => expect(fixture?.runtime.migrations.running()).toEqual([{ extension: notesName, isolation: 'sandboxed' }]), { timeout: 30_000, interval: 20 });
    expect(sharedHosts()).toEqual(before);
    fixture.timers.advance(10 * 60_000);
    expect(problemOf(await reloading).code).toBe('MIGRATION_FAILED');
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.0.0'), stored: 1 });
  });
});

