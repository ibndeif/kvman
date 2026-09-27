import { afterEach, describe, expect, it } from 'vitest';
import { extensionActor } from '../install/harness.ts';
import { ended, objectOf, openProcessesFixture, processesListed, processTests, queried, spawned, type ProcessesFixture } from './harness.ts';

let fixture: ProcessesFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe('kernel.processes.list (plan 03 §3.8, ADR 0139)', () => {
  it('M2.6-E18 an extension lists its own processes, others only an administrator, and a process none', processTests, async () => {
    fixture = await openProcessesFixture();
    const done = String((await spawned(fixture, { command: 'true', detached: true, onExit: 'runner.finish' }))['processId']);
    await ended(fixture, done);
    const running = String((await spawned(fixture, { command: 'sleep', args: ['1000'], detached: true, onExit: 'runner.finish' }))['processId']);
    const runner = extensionActor('@acme/runner');

    const own = await processesListed(fixture, {}, runner);
    expect(own.items.map((item) => item.processId)).toEqual([running, done]);
    expect(own.items[0]).toMatchObject({ extension: '@acme/runner', command: 'sleep', state: 'running', detached: true, workspaceId: fixture.workspaceId });
    expect(own.items[1]).toMatchObject({ state: 'exited', reason: 'exited', exitCode: 0 });
    expect(Object.keys(own.items[1] ?? {}).sort()).toEqual([
      'command', 'detached', 'endedAt', 'exitCode', 'extension', 'logBlobId', 'messageId', 'pid', 'processId', 'reason', 'startedAt', 'state', 'workspaceId',
    ]);
    expect((await processesListed(fixture, { state: 'running' }, runner)).items.map((item) => item.processId)).toEqual([running]);

    const foreign = objectOf(await queried(fixture, 'kernel.processes.list', { extension: '@acme/runner' }, extensionActor('@acme/target')));
    expect(objectOf(foreign['problem'])['code']).toBe('CAPABILITY_DENIED');
    expect((await processesListed(fixture, {})).total).toBe(2);
    const tooMany = objectOf(await queried(fixture, 'kernel.processes.list', { limit: 1001 }));
    expect(objectOf(tooMany['problem'])['code']).toBe('VALIDATION_FAILED');

    const kv = await spawned(fixture, { command: 'kv', args: ['kernel.processes.list'], token: { calls: ['kernel.processes.list'] } }, { wait: true, read: true });
    expect(objectOf(kv['result'])['exitCode']).toBe(1);
    expect(String(kv['log'])).toContain('"code":"CAPABILITY_DENIED"');
  });
});
