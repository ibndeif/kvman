import { afterEach, describe, expect, it, vi } from 'vitest';
import { command, person } from '../install/harness.ts';
import { eventsOf, rows, valueOf } from '../workspaces/harness.ts';
import { gone, openProcessesFixture, pidOf, processTests, sent, spawned, type ProcessesFixture } from './harness.ts';

let fixture: ProcessesFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe('forgetting a workspace with running processes (plan 04 §4.4, ADRs 0122, 0139)', () => {
  it('M2.6-H7 forget kills the workspace processes and leaves no processes row', processTests, async () => {
    fixture = await openProcessesFixture();
    const detached = String((await spawned(fixture, { command: 'sleep', args: ['1000'], detached: true, onExit: 'runner.finish' }))['processId']);
    await sent(fixture, 'runner.run', { spawn: { command: 'sleep', args: ['1000'] }, wait: true });
    const waiting = await vi.waitFor(() => {
      const [row] = rows(fixture!, 'SELECT id FROM processes WHERE id != ?', detached);
      if (row === undefined) throw new Error('the waiting handler has not spawned yet');
      return String(row['id']);
    }, { timeout: 15_000, interval: 10 });
    const pids = [pidOf(fixture, detached), pidOf(fixture, waiting)];
    const finished: string[] = [];
    fixture.runtime.pipeline.observe(() => {
      for (const row of rows(fixture!, "SELECT state FROM messages WHERE type = 'runner.finish'")) finished.push(String(row['state']));
    });

    expect(valueOf(await command(fixture, 'kernel.workspace.forget', { workspaceId: fixture.workspaceId }, person))).toEqual({});
    for (const pid of pids) await gone(pid);
    expect(finished).toContain('done');
    expect(rows(fixture, 'SELECT id FROM processes')).toEqual([]);
    expect(rows(fixture, "SELECT ref FROM blob_refs WHERE ref LIKE 'process:%'")).toEqual([]);
    expect(rows(fixture, 'SELECT id FROM messages WHERE workspace_id = ?', fixture.workspaceId)).toEqual([]);
    expect(eventsOf(fixture, 'kernel.workspace.forgotten').map((event) => event.payload)).toEqual([{ workspaceId: fixture.workspaceId }]);
  });
});
