import { jsonObjectSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { problemOf } from '../install/harness.ts';
import { rows, valueOf } from '../workspaces/harness.ts';
import { addNote, enableNotes, notesItems, notesName, notesRow, openReloadFixture, reload, reloadTests, setNotesConfig, type ReloadFixture } from './harness.ts';

let fixture: ReloadFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function storedConfig(current: ReloadFixture): Array<[string, Record<string, unknown>]> {
  const global = rows(current, 'SELECT value FROM global_config WHERE extension = ?', notesName).map((row): [string, Record<string, unknown>] => ['global', jsonObjectSchema.parse(JSON.parse(String(row['value'])))]);
  const workspaces = rows(current, 'SELECT workspace_id, value FROM workspace_config WHERE extension = ? ORDER BY workspace_id', notesName)
    .map((row): [string, Record<string, unknown>] => [String(row['workspace_id']), jsonObjectSchema.parse(JSON.parse(String(row['value'])))]);
  return [...global, ...workspaces];
}

describe('the config check of enable and reload (plan 04 §4.8, ADR 0143)', reloadTests, () => {
  it('M2.7-H7 an upgrade whose config schema rejects a stored value fails CONFIG_INVALID unless a migration fixes it', async () => {
    fixture = await openReloadFixture(['1.0.0', '2.2.0', '2.3.0']);
    valueOf(await enableNotes(fixture, workspaceA));
    valueOf(await enableNotes(fixture, workspaceB));
    await addNote(fixture, workspaceA, 'n1', 'one');
    await setNotesConfig(fixture, 'global', { limit: 50 });
    await setNotesConfig(fixture, 'workspace', { limit: 40 }, workspaceA);
    const before = storedConfig(fixture);
    const problem = problemOf(await reload(fixture, { digest: fixture.digestOf('2.2.0') }));
    expect(problem.code).toBe('CONFIG_INVALID');
    expect(problem.issues?.map((issue) => issue.path)).toEqual(['global.limit', `workspaces.${workspaceA}.limit`]);
    expect(storedConfig(fixture)).toEqual(before);
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.0.0'), stored: 1 });
    valueOf(await reload(fixture, { digest: fixture.digestOf('2.3.0') }));
    expect(storedConfig(fixture)).toEqual([['global', { limit: 10, migrated: true }], [workspaceA, { limit: 10 }]]);
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('2.3.0'), stored: 2 });
  });

  it('M2.7-E7 the config check runs inside the last step', async () => {
    fixture = await openReloadFixture(['1.0.0', '2.3.1']);
    valueOf(await enableNotes(fixture, workspaceA));
    await addNote(fixture, workspaceA, 'n1', 'one');
    await setNotesConfig(fixture, 'global', { limit: 50 });
    const items = notesItems(fixture);
    const problem = problemOf(await reload(fixture, { digest: fixture.digestOf('2.3.1') }));
    expect(problem.code).toBe('CONFIG_INVALID');
    expect(problem.issues?.map((issue) => issue.path)).toEqual(['global.limit']);
    expect(notesItems(fixture)).toEqual(items);
    expect(storedConfig(fixture)).toEqual([['global', { limit: 50 }]]);
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.0.0'), stored: 1, migrating: null, status: 'active' });
  });
});
