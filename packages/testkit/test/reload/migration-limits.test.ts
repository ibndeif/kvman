import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { problemOf } from '../install/harness.ts';
import { valueOf } from '../workspaces/harness.ts';
import { addNote, enableNotes, notesName, notesRow, openReloadFixture, reload, reloadTests, type ReloadFixture } from './harness.ts';

let fixture: ReloadFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function withNotes(target: '2.4.0' | '2.5.0'): Promise<ReloadFixture> {
  const opened = await openReloadFixture(['1.0.0', target]);
  valueOf(await enableNotes(opened, workspaceA));
  await addNote(opened, workspaceA, 'n1', 'one');
  return opened;
}

describe('the limits of a migration step (plan 04 §4.8, ADR 0143)', reloadTests, () => {
  it('M2.7-E8 a step running over 10 minutes is aborted, and its host is replaced without a charge', async () => {
    fixture = await withNotes('2.4.0');
    for (let round = 0; round < 3; round += 1) {
      const reloading = reload(fixture, { digest: fixture.digestOf('2.4.0') });
      await vi.waitFor(() => expect(fixture?.runtime.migrations.running()).toEqual([{ extension: notesName, isolation: 'sandboxed' }]), { timeout: 30_000, interval: 20 });
      fixture.timers.advance(10 * 60_000);
      const problem = problemOf(await reloading);
      expect(problem.code).toBe('MIGRATION_FAILED');
      expect(problem.detail).toContain('ran out of time');
      fixture.timers.advance(2000);
      expect(fixture.runtime.migrations.running()).toEqual([]);
    }
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.0.0'), stored: 1, status: 'active', reason: null });
  });

  it('M2.7-E9 a host that crashes during a step fails it without a charge', async () => {
    fixture = await withNotes('2.5.0');
    for (let round = 0; round < 3; round += 1) {
      const problem = problemOf(await reload(fixture, { digest: fixture.digestOf('2.5.0') }));
      expect(problem.code).toBe('MIGRATION_FAILED');
      expect(problem.detail).toContain('host ended');
    }
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.0.0'), stored: 1, status: 'active', reason: null });
  });
});
