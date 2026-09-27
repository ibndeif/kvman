import type { QuarantineReason } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { command, person, problemOf } from '../install/harness.ts';
import { disable, enable, eventsOf, grantsOf, valueOf } from '../workspaces/harness.ts';
import { addNote, enableNotes, notesName, notesRow, openReloadFixture, reload, reloadTests, versionIn, type ReloadFixture } from './harness.ts';

let fixture: ReloadFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function unquarantine(current: ReloadFixture, name = notesName): ReturnType<typeof command> {
  return command(current, 'kernel.extension.unquarantine', { name }, person);
}

// 03 §3.6: disabled in every workspace, a quarantined extension is released; it is then enabled again.
async function released(current: ReloadFixture): Promise<void> {
  valueOf(await disable(current, workspaceA, notesName));
  expect(notesRow(current)).toMatchObject({ status: 'active', reason: null });
  valueOf(await enableNotes(current, workspaceA));
}

describe('quarantine reasons and their recovery (plan 03 §3.6, ADR 0145)', reloadTests, () => {
  it('M2.7-E26 unquarantine is for HOST_FAILURES only', async () => {
    fixture = await openReloadFixture(['1.0.0']);
    valueOf(await enableNotes(fixture, workspaceA));
    valueOf(await enable(fixture, workspaceA, '@acme/caller', grantsOf(fixture, '@acme/caller')));
    expect(valueOf(await unquarantine(fixture))).toEqual({});
    expect(eventsOf(fixture, 'kernel.extension.unquarantined')).toEqual([]);
    const reasons: QuarantineReason[] = ['EXT_INTEGRITY', 'MIGRATION_FAILED', 'EXT_MANIFEST_INVALID'];
    for (const reason of reasons) {
      await fixture.runtime.quarantine(notesName, reason);
      expect(problemOf(await unquarantine(fixture)), reason).toMatchObject({ code: 'EXT_QUARANTINED', params: { reason } });
      expect(notesRow(fixture), reason).toMatchObject({ status: 'quarantined', reason });
      await released(fixture);
    }
    await fixture.runtime.quarantine(notesName, 'HOST_FAILURES');
    expect(valueOf(await command(fixture, 'caller.call', { type: 'kernel.extension.unquarantine', payload: { name: notesName } }, person, workspaceA))).toEqual({ ok: false, code: 'CALLER_NOT_ALLOWED' });
    expect(problemOf(await unquarantine(fixture, '@acme/missing')).code).toBe('NOT_FOUND');
    expect(valueOf(await unquarantine(fixture))).toEqual({});
    expect(notesRow(fixture)).toMatchObject({ status: 'active', reason: null });
    expect(eventsOf(fixture, 'kernel.extension.unquarantined').map((event) => event.payload)).toHaveLength(reasons.length + 1);
    await addNote(fixture, workspaceA, 'n1', 'one');
  });

  it('M2.7-E27 any successful reload clears any quarantine', async () => {
    fixture = await openReloadFixture(['1.0.0', '1.1.0']);
    valueOf(await enableNotes(fixture, workspaceA));
    await fixture.runtime.quarantine(notesName, 'HOST_FAILURES');
    valueOf(await reload(fixture, { digest: fixture.digestOf('1.1.0') }));
    expect(notesRow(fixture)).toMatchObject({ status: 'active', reason: null });
    expect(await versionIn(fixture, workspaceA)).toBe('1.1.0');
    await fixture.runtime.quarantine(notesName, 'EXT_MANIFEST_INVALID');
    valueOf(await reload(fixture, { digest: fixture.digestOf('1.0.0') }));
    expect(notesRow(fixture)).toMatchObject({ status: 'active', reason: null });
    expect(await versionIn(fixture, workspaceA)).toBe('1.0.0');
    expect(eventsOf(fixture, 'kernel.extension.unquarantined')).toHaveLength(2);
  });
});
