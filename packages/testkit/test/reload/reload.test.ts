import { jsonObjectSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, person, problemOf } from '../install/harness.ts';
import { disable, enable, eventsOf, grantsOf, presetRow, valueOf } from '../workspaces/harness.ts';
import { enableNotes, notesName, notesRow, openReloadFixture, reload, reloadTests, versionIn, type ReloadFixture } from './harness.ts';

let fixture: ReloadFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function sharedHostsWithNotes(current: ReloadFixture): string[] {
  return current.runtime.hosts.hosts().filter((entry) => entry.isolation === 'shared' && entry.worker.loaded.has(notesName)).map((entry) => entry.worker.host);
}

describe('kernel.extension.reload (plan 06 §6.6, ADR 0145)', reloadTests, () => {
  it('M2.7-E14 a reload that would break a workspace fails VALIDATION_FAILED listing it', async () => {
    fixture = await openReloadFixture(['1.0.0', '2.6.0']);
    valueOf(await enableNotes(fixture, workspaceA));
    valueOf(await enable(fixture, workspaceA, '@acme/lister', grantsOf(fixture, '@acme/lister')));
    const problem = problemOf(await reload(fixture, { digest: fixture.digestOf('2.6.0') }));
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.issues).toEqual([{ path: `workspaces.${workspaceA}`, message: '@acme/lister requires notes.items.list, which the new version no longer provides' }]);
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.0.0'), pendingDigest: null });
    expect(fixture.runtime.registry.current().isReloading(notesName)).toBe(false);
  });

  it('M2.7-E18 the swap updates every applied preset in one unit and announces the reload per workspace', async () => {
    fixture = await openReloadFixture(['1.0.0', '2.0.0']);
    valueOf(await enableNotes(fixture, workspaceA));
    valueOf(await enableNotes(fixture, workspaceB));
    valueOf(await disable(fixture, workspaceB, notesName));
    const changes = eventsOf(fixture, 'kernel.preset.changed').length;
    const revisions = [presetRow(fixture, workspaceA).revision, presetRow(fixture, workspaceB).revision];
    const digest = fixture.digestOf('2.0.0');
    valueOf(await reload(fixture, { digest }));
    for (const workspaceId of [workspaceA, workspaceB]) expect(jsonObjectSchema.parse(presetRow(fixture, workspaceId).extensions[notesName])).toMatchObject({ digest, source: `local:${digest}` });
    expect([presetRow(fixture, workspaceA).revision, presetRow(fixture, workspaceB).revision]).toEqual(revisions);
    expect(eventsOf(fixture, 'kernel.preset.changed')).toHaveLength(changes);
    expect(eventsOf(fixture, 'kernel.extension.reloaded')).toEqual([{ workspaceId: workspaceA, payload: { workspaceId: workspaceA, name: notesName, digest } }]);
  });

  it('M2.7-E20 reload of an unknown extension or digest fails NOT_FOUND; without a digest it reloads the active one', async () => {
    const current = await openReloadFixture(['1.0.0']);
    fixture = current;
    valueOf(await enableNotes(fixture, workspaceA, 'shared'));
    expect(await versionIn(fixture, workspaceA)).toBe('1.0.0');
    const before = sharedHostsWithNotes(fixture);
    expect(before).toHaveLength(1);
    expect(problemOf(await command(fixture, 'kernel.extension.reload', { name: '@acme/missing' }, person)).code).toBe('NOT_FOUND');
    expect(problemOf(await reload(fixture, { digest: 'f'.repeat(64) })).code).toBe('NOT_FOUND');
    expect(valueOf(await reload(fixture, {}))).toEqual({ digest: fixture.digestOf('1.0.0') });
    expect(eventsOf(fixture, 'kernel.extension.reloaded').map((event) => event.workspaceId)).toEqual([workspaceA]);
    expect(await versionIn(fixture, workspaceA)).toBe('1.0.0');
    await vi.waitFor(() => {
      const after = sharedHostsWithNotes(current);
      expect(after).toHaveLength(1);
      expect(after).not.toEqual(before);
    }, { timeout: 30_000, interval: 20 });
  });

  it('M2.7-E22 a reload of an extension enabled nowhere switches the digest and clears the recovery state', async () => {
    fixture = await openReloadFixture(['1.0.0', '2.0.0']);
    fixture.connection.prepare("UPDATE extensions SET pending_digest = ?, status = 'quarantined', quarantine_reason = 'HOST_FAILURES' WHERE name = ?").run(fixture.digestOf('2.0.0'), notesName);
    fixture.runtime.registry.refresh();
    const digest = fixture.digestOf('2.0.0');
    valueOf(await reload(fixture, { digest }));
    expect(notesRow(fixture)).toMatchObject({ activeDigest: digest, pendingDigest: null, status: 'active', reason: null });
    expect(eventsOf(fixture, 'kernel.extension.unquarantined').map((event) => event.payload)).toEqual([{ name: notesName }]);
    expect(eventsOf(fixture, 'kernel.extension.reloaded')).toEqual([]);
  });
});
