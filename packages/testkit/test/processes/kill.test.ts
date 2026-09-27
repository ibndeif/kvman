import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupAlive } from '@kvman/kernel';
import { command, person } from '../install/harness.ts';
import { rows, valueOf } from '../workspaces/harness.ts';
import {
  ended, exitsRecorded, gone, logShows, objectOf, openProcessesFixture, pidOf, processTests, runAs, sent, spawned, type ProcessesFixture,
} from './harness.ts';

let fixture: ProcessesFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const detachedSleep = { command: 'sleep', args: ['1000'], detached: true, onExit: 'runner.finish' };

describe('kill paths (plan 03 §3.7, 02 §2.9, ADR 0139)', () => {
  it('M2.6-E10 timeoutMs kills with SIGTERM, then SIGKILL after 3 s', processTests, async () => {
    fixture = await openProcessesFixture();
    const polite = await sent(fixture, 'runner.run', { spawn: { command: 'sleep', args: ['1000'], timeoutMs: 500 }, wait: true });
    const stubborn = String((await spawned(fixture, { command: 'sh', args: ['-c', 'trap "" TERM; echo ready; while :; do sleep 1; done'], timeoutMs: 500, detached: true, onExit: 'runner.finish' }))['processId']);
    await logShows(fixture, stubborn, 'ready');
    fixture.timers.advance(500);
    const reply = await fixture.runtime.awaitReply(polite);
    if (!reply.ok) throw new Error(`runner.run failed: ${reply.problem.code}`);
    expect(objectOf(objectOf(objectOf(reply.value)['value'])['result'])).toMatchObject({ signal: 'SIGTERM', exitCode: null });
    expect(groupAlive(pidOf(fixture, stubborn))).toBe(true);
    fixture.timers.advance(3000);
    expect(await ended(fixture, stubborn)).toMatchObject({ signal: 'SIGKILL', reason: 'killed' });
  });

  it('M2.6-E11 wait answers the same result twice; kill of an unknown id is NOT_FOUND and of an ended one a no-op', processTests, async () => {
    fixture = await openProcessesFixture();
    const answer = await spawned(fixture, { command: 'echo', args: ['once'] }, { waitTwice: true });
    expect(answer['again']).toEqual(answer['result']);
    expect(await runAs(fixture, 'runner.kill', { processId: '01JABCDEFGHJKMNPQRSTVWXYZ0' })).toMatchObject({ code: 'NOT_FOUND' });
    expect(await runAs(fixture, 'runner.kill', { processId: String(answer['processId']) })).toEqual({ value: 'killed' });
  });

  it('M2.6-E12 the process group ends with its leader', processTests, async () => {
    fixture = await openProcessesFixture();
    const answer = await spawned(fixture, { command: 'sh', args: ['-c', 'sleep 1000 & echo $!'] }, { wait: true, read: true });
    expect(objectOf(answer['result'])).toMatchObject({ exitCode: 0 });
    expect(await ended(fixture, String(answer['processId']))).toMatchObject({ reason: 'exited' });
    await gone(Number(String(answer['log']).trim()));
  });

  it('M2.6-E13 cancel of the spawning message kills its processes, detached ones included', processTests, async () => {
    fixture = await openProcessesFixture();
    const running = await sent(fixture, 'runner.run', { before: [detachedSleep], spawn: { command: 'sleep', args: ['1000'] }, wait: true });
    const spawnedIds = await runningProcesses(fixture, 2);
    const [message] = rows(fixture, 'SELECT correlation_id FROM messages WHERE id = ?', running);
    const pids = spawnedIds.map((processId) => pidOf(fixture!, processId));
    expect(valueOf(await command(fixture, 'kernel.cancel', { correlationId: String(message?.['correlation_id']) }, person, fixture.workspaceId))).toMatchObject({ cancelled: 1 });
    for (const pid of pids) await gone(pid);
    const exits = await vi.waitFor(async () => {
      const recorded = await exitsRecorded(fixture!);
      expect(recorded).toHaveLength(1);
      return recorded;
    }, { timeout: 15_000, interval: 20 });
    expect(objectOf(exits[0]?.['payload'])).toMatchObject({ reason: 'killed' });
  });

  it('M2.6-E14 quarantine of the owner kills its processes', processTests, async () => {
    fixture = await openProcessesFixture();
    const processId = String((await spawned(fixture, detachedSleep))['processId']);
    await fixture.runtime.quarantine('@acme/runner', 'HOST_FAILURES');
    await gone(pidOf(fixture, processId));
    expect(await ended(fixture, processId)).toMatchObject({ state: 'killed', reason: 'killed' });
    expect(await exitsRecorded(fixture)).toEqual([]);
  });
});

// The ids of the running processes, once there are `count` of them.
async function runningProcesses(fixture: ProcessesFixture, count: number): Promise<string[]> {
  return vi.waitFor(() => {
    const found = rows(fixture, "SELECT id FROM processes WHERE state = 'running' ORDER BY started_at").map((row) => String(row['id']));
    expect(found).toHaveLength(count);
    return found;
  }, { timeout: 15_000, interval: 10 });
}
