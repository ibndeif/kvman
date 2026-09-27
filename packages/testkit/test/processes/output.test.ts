import { afterEach, describe, expect, it } from 'vitest';
import { rows } from '../workspaces/harness.ts';
import { objectOf, openProcessesFixture, processTests, runAs, spawned, type ProcessesFixture } from './harness.ts';

let fixture: ProcessesFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe('process output (plan 03 §3.7, ADR 0139)', () => {
  it('M2.6-E6 output over the cap is truncated after its marker and drained, so the process never blocks', processTests, async () => {
    fixture = await openProcessesFixture();
    const script = "head -c 65536 /dev/zero | tr '\\0' x; echo END";
    const answer = await spawned(fixture, { command: 'sh', args: ['-c', script], logCapBytes: 1024 }, { wait: true, read: true });
    const log = `${'x'.repeat(1024)}\n[kvman: output truncated at 1024 bytes]\n`;
    expect(answer['log']).toBe(log);
    expect(objectOf(answer['result'])).toMatchObject({ exitCode: 0, truncated: true, tail: 'x'.repeat(1024) });
    expect(rows(fixture, 'SELECT truncated FROM processes WHERE id = ?', String(answer['processId']))).toEqual([{ truncated: 1 }]);
  });

  it('M2.6-E8 live output streams under the spawner run, only to its own live events', processTests, async () => {
    fixture = await openProcessesFixture();
    const answer = await spawned(fixture, { command: 'printf', args: ['hello'], live: 'runner.output.written:job-1' }, { wait: true });
    const frames = fixture.live.filter((frame) => frame.type === 'runner.output.written' && frame.key === 'job-1');
    expect(frames.map((frame) => frame.chunk)).toEqual([{ text: 'hello' }]);
    const [run] = rows(fixture, "SELECT id FROM messages WHERE type = 'runner.run'");
    expect(frames[0]?.run).toBe(run?.['id']);
    expect(answer['processId']).toBeTypeOf('string');
    for (const live of ['target.ping:x', 'runner.echo:x']) {
      expect(await runAs(fixture, 'runner.run', { spawn: { command: 'true', live } }), live).toMatchObject({ code: 'CAPABILITY_DENIED' });
    }
  });
});
