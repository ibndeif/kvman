import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { applyTestPreset } from '../install/fixture-presets.ts';
import { valueOf } from '../workspaces/harness.ts';
import { enableNotes, notesName, openReloadFixture, reload, reloadTests, versionIn, type ReloadFixture } from './harness.ts';

let fixture: ReloadFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const workspaceC = 'c'.repeat(64);

// The hosts that have loaded Notes, by isolation, each named with its process and thread.
function notesHosts(current: ReloadFixture): Record<string, string[]> {
  const hosts: Record<string, string[]> = {};
  for (const entry of current.runtime.hosts.hosts()) {
    if (!entry.worker.loaded.has(notesName)) continue;
    const { pid, threadId } = entry.worker.thread.identity;
    hosts[entry.isolation] = [...(hosts[entry.isolation] ?? []), `${entry.worker.host}@${pid}/${threadId}`];
  }
  return hosts;
}

describe('hosts replaced by a reload (plan 06 §6.6 step 5)', reloadTests, () => {
  it('M2.7-E19 a reload replaces hosts', async () => {
    const current = await openReloadFixture(['1.0.0', '2.0.0']);
    fixture = current;
    applyTestPreset(current.connection, { workspaceId: workspaceC, path: '/w/c', name: 'C' });
    current.runtime.registry.refresh();
    valueOf(await enableNotes(current, workspaceA, 'shared'));
    valueOf(await enableNotes(current, workspaceB, 'dedicated'));
    valueOf(await enableNotes(current, workspaceC, 'sandboxed'));
    for (const workspaceId of [workspaceA, workspaceB, workspaceC]) expect(await versionIn(current, workspaceId)).toBe('1.0.0');
    const before = notesHosts(current);
    expect(Object.keys(before).sort()).toEqual(['dedicated', 'sandboxed', 'shared']);
    valueOf(await reload(current, { digest: current.digestOf('2.0.0') }));
    for (const workspaceId of [workspaceA, workspaceB, workspaceC]) expect(await versionIn(current, workspaceId)).toBe('2.0.0');
    await vi.waitFor(() => {
      const after = notesHosts(current);
      for (const isolation of ['shared', 'dedicated', 'sandboxed']) {
        expect(after[isolation], isolation).toHaveLength(1);
        expect(after[isolation]?.some((host) => before[isolation]?.includes(host)), isolation).toBe(false);
      }
    }, { timeout: 30_000, interval: 20 });
  });
});
