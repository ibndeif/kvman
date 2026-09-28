import { notificationsListResultSchema, type NotificationItem } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { person, problemOf } from '../install/harness.ts';
import { valueOf } from '../workspaces/harness.ts';
import { addNote, enableNotes, notesRow, openReloadFixture, reload, reloadTests, setNotesConfig, type ReloadFixture } from './harness.ts';

let fixture: ReloadFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function kernelEntries(current: ReloadFixture): Promise<NotificationItem[]> {
  const answer = await current.runtime.query({ sender: person, type: 'kernel.notifications.list', payload: {}, cause: undefined, workspaceId: undefined });
  if (!answer.ok) throw new Error(answer.problem.code);
  return notificationsListResultSchema.parse(answer.value).items.filter((item) => item.source === 'kernel');
}

describe('migration failure notifications (ADR 0164)', reloadTests, () => {
  it('M2.12-E40 a failure that keeps the old version notifies; a part-way failure notifies only as a quarantine', async () => {
    fixture = await openReloadFixture(['1.0.0', '2.0.1', '3.0.0']);
    valueOf(await enableNotes(fixture, workspaceA));
    await addNote(fixture, workspaceA, 'n1', 'one');
    expect(problemOf(await reload(fixture, { digest: fixture.digestOf('2.0.1') })).code).toBe('MIGRATION_FAILED');
    expect(notesRow(fixture).status).toBe('active');
    expect(await kernelEntries(fixture)).toMatchObject([{
      key: 'migration:@acme/notes', level: 'error', title: { $t: 'notifications.migrationFailed', extension: '@acme/notes' }, problem: { code: 'MIGRATION_FAILED' },
    }]);

    await setNotesConfig(fixture, 'global', { blockStep3: true });
    expect(problemOf(await reload(fixture, { digest: fixture.digestOf('3.0.0') })).code).toBe('MIGRATION_FAILED');
    expect(notesRow(fixture)).toMatchObject({ status: 'quarantined', reason: 'MIGRATION_FAILED' });
    const entries = await kernelEntries(fixture);
    expect(entries.map((entry) => entry.key).sort()).toEqual(['migration:@acme/notes', 'quarantine:@acme/notes']);
    expect(entries.find((entry) => entry.key === 'quarantine:@acme/notes')).toMatchObject({ title: { $t: 'notifications.quarantined', extension: '@acme/notes', reason: 'MIGRATION_FAILED' } });
    expect(entries.find((entry) => entry.key === 'migration:@acme/notes')?.updatedAt).toBe(entries.find((entry) => entry.key === 'migration:@acme/notes')?.createdAt);
  });
});
