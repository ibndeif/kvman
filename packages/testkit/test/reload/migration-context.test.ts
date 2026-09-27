import { jsonObjectSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { problemOf } from '../install/harness.ts';
import { rows, valueOf } from '../workspaces/harness.ts';
import { addNote, enableNotes, notesItems, notesName, notesRow, openReloadFixture, reload, reloadTests, type ReloadFixture } from './harness.ts';

let fixture: ReloadFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function parsed(text: unknown): Record<string, unknown> {
  return jsonObjectSchema.parse(JSON.parse(String(text)));
}

describe('the migration context m (plan 04 §4.8, ADR 0143)', reloadTests, () => {
  it('M2.7-E4 m.each visits every workspace and global, in order, as committed at the start of the step', async () => {
    fixture = await openReloadFixture(['1.0.0', '2.0.0']);
    valueOf(await enableNotes(fixture, workspaceA));
    valueOf(await enableNotes(fixture, workspaceB));
    await addNote(fixture, workspaceB, 'x', 'bx');
    await addNote(fixture, workspaceA, 'y', 'ay');
    await addNote(fixture, workspaceA, 'x', 'ax');
    await addNote(fixture, workspaceA, 'y', 'gy', true);
    await addNote(fixture, workspaceA, 'x', 'gx', true);
    fixture.connection.prepare("INSERT INTO kv (owner, ws, key, value, version, updated_at) VALUES (?, '', 'old:1', '\"gone\"', 1, 0)").run(notesName);
    valueOf(await reload(fixture, { digest: fixture.digestOf('2.0.0') }));

    expect(notesItems(fixture).map((item) => [item.ws, item.id, item.data['order']])).toEqual([['', 'x', 1], ['', 'y', 2], [workspaceA, 'x', 3], [workspaceA, 'y', 4], [workspaceB, 'x', 5]]);
    const kv = rows(fixture, 'SELECT ws, key, value FROM kv WHERE owner = ? ORDER BY ws, key', notesName).map((row) => [row['ws'], row['key'], parsed(row['value'])]);
    expect(kv).toEqual([
      ['', 'item:x', { v: 2, value: 'gx', order: 1 }], ['', 'item:y', { v: 2, value: 'gy', order: 2 }],
      [workspaceA, 'item:x', { v: 2, value: 'ax', order: 4 }], [workspaceA, 'item:y', { v: 2, value: 'ay', order: 5 }],
      [workspaceB, 'item:x', { v: 2, value: 'bx', order: 6 }],
    ]);
    const history = rows(fixture, "SELECT ws, log, seq, data FROM logs WHERE owner = ? AND log LIKE 'history:%' ORDER BY ws, log, seq", notesName)
      .map((row) => [row['ws'], row['log'], row['seq'], parsed(row['data'])['order']]);
    expect(history).toEqual([['', 'history:x', 1, 1], ['', 'history:y', 1, 2], [workspaceA, 'history:x', 1, 3], [workspaceA, 'history:y', 1, 4], [workspaceB, 'history:x', 1, 5]]);
    const audit = rows(fixture, "SELECT ws, seq, data FROM logs WHERE owner = ? AND log = 'audit' ORDER BY ws, seq", notesName).map((row) => [row['ws'], row['seq'], parsed(row['data'])]);
    expect(audit).toEqual([
      ['', 1, { id: 'y', v: 2, order: 1 }], ['', 2, { id: 'x', v: 2, order: 2 }],
      [workspaceA, 1, { id: 'y', v: 2, order: 3 }], [workspaceA, 2, { id: 'x', v: 2, order: 4 }], [workspaceB, 1, { id: 'x', v: 2, order: 5 }],
    ]);
    expect(rows(fixture, 'SELECT value FROM global_config WHERE extension = ?', notesName).map((row) => parsed(row['value']))).toEqual([{ migrated: true }]);
  });

  it('M2.7-E5 a replaced document that breaks its schema fails the step', async () => {
    fixture = await openReloadFixture(['1.0.0', '2.7.0']);
    valueOf(await enableNotes(fixture, workspaceA));
    await addNote(fixture, workspaceA, 'n1', 'one');
    const before = notesItems(fixture);
    const problem = problemOf(await reload(fixture, { digest: fixture.digestOf('2.7.0') }));
    expect(problem.code).toBe('MIGRATION_FAILED');
    expect(problem.detail).toContain('VALIDATION_FAILED');
    expect(problem.detail).toContain('"items"');
    expect(notesItems(fixture)).toEqual(before);
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.0.0'), stored: 1, migrating: null });
  });
});
