import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectIntervalMs } from '@kvman/kernel';
import type { JsonObject } from '@kvman/protocol';
import { rows } from '../workspaces/harness.ts';
import { ended, exitsRecorded, gone, objectOf, openProcessesFixture, pidOf, processTests, runAs, spawned, type ProcessesFixture } from './harness.ts';

let fixture: ProcessesFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function exitsOnce(fixture: ProcessesFixture): Promise<JsonObject> {
  const [exit] = await vi.waitFor(async () => {
    const recorded = await exitsRecorded(fixture);
    expect(recorded).toHaveLength(1);
    return recorded;
  }, { timeout: 15_000, interval: 20 });
  return objectOf(exit);
}

describe('detached processes and onExit (plan 03 §3.7, ADR 0139)', () => {
  it('M2.6-H4 a detached process delivers exactly one onExit when it exits', processTests, async () => {
    fixture = await openProcessesFixture();
    const processId = String((await spawned(fixture, { command: 'sh', args: ['-c', 'echo done'], detached: true, onExit: 'runner.finish' }))['processId']);
    const exit = await exitsOnce(fixture);
    const payload = objectOf(exit['payload']);
    expect(payload).toMatchObject({ processId, exitCode: 0, signal: null, reason: 'exited', tail: 'done\n', truncated: false });
    expect(exit['log']).toBe('done\n');
    expect(objectOf(exit['message'])['idempotencyKey']).toBe(`${processId}:exit`);
    expect(rows(fixture, "SELECT count(*) AS count FROM messages WHERE type = 'runner.finish'")).toEqual([{ count: 1 }]);
    expect(await ended(fixture, processId)).toMatchObject({ state: 'exited', reason: 'exited' });
  });

  it('M2.6-H5 a detached process delivers exactly one onExit when it is killed', processTests, async () => {
    fixture = await openProcessesFixture();
    const processId = String((await spawned(fixture, { command: 'sleep', args: ['1000'], detached: true, onExit: 'runner.finish' }))['processId']);
    expect(await runAs(fixture, 'runner.kill', { processId })).toEqual({ value: 'killed' });
    await gone(pidOf(fixture, processId));
    const exit = await exitsOnce(fixture);
    expect(objectOf(exit['payload'])).toMatchObject({ processId, reason: 'killed', signal: 'SIGTERM', exitCode: null });
    expect(await runAs(fixture, 'runner.kill', { processId })).toEqual({ value: 'killed' });
    expect(await exitsRecorded(fixture)).toHaveLength(1);
  });

  it('M2.6-E16 the log blob outlives GC while its row lives, and retention then removes the row, the ref, and the blob', processTests, async () => {
    fixture = await openProcessesFixture();
    const processId = String((await spawned(fixture, { command: 'true', detached: true, onExit: 'runner.finish' }))['processId']);
    await exitsOnce(fixture);
    const blobId = String((await ended(fixture, processId))['log_blob']);
    fixture.timers.advance(2 * 3_600_000);
    await fixture.runtime.files.collector.idle();
    expect(rows(fixture, 'SELECT id FROM blobs WHERE id = ?', blobId)).toHaveLength(1);
    expect(rows(fixture, 'SELECT owner FROM blob_refs WHERE ref = ?', `process:${processId}`)).toEqual([{ owner: 'kernel' }]);
    // A move fires the GC timer that is due first, at its own time; the run after it comes 10 minutes later.
    fixture.timers.advance(7 * 86_400_000);
    await fixture.runtime.files.collector.idle();
    fixture.timers.advance(collectIntervalMs);
    await fixture.runtime.files.collector.idle();
    expect(rows(fixture, 'SELECT id FROM processes WHERE id = ?', processId)).toEqual([]);
    expect(rows(fixture, 'SELECT owner FROM blob_refs WHERE ref = ?', `process:${processId}`)).toEqual([]);
    expect(rows(fixture, 'SELECT id FROM blobs WHERE id = ? AND id NOT IN (SELECT blob_id FROM blob_refs)', blobId)).toEqual([]);
  });

  it('M2.6-E17 onExit carries the spawning message context and correlation', processTests, async () => {
    fixture = await openProcessesFixture();
    const answer = await runAs(fixture, 'delegator.start', { spawn: { command: 'true', detached: true, onExit: 'runner.finish' }, context: { sessionId: 's1' } });
    expect(objectOf(objectOf(answer['value'])['value'])['processId']).toBeTypeOf('string');
    const exit = await exitsOnce(fixture);
    const [spawner] = rows(fixture, "SELECT id, correlation_id FROM messages WHERE type = 'runner.run'");
    expect(objectOf(exit['message'])).toMatchObject({
      source: 'kernel', correlationId: spawner?.['correlation_id'], causationId: spawner?.['id'], context: { sessionId: 's1', locale: 'en' }, workspaceId: fixture.workspaceId,
    });
  });
});
