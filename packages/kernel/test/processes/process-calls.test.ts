import { spawnResultSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { groupAlive } from '../../src/index.ts';
import { gone, grantProcess, invocationOf, openProcessFixture, type ProcessFixture } from './harness.ts';

let fixture: ProcessFixture | undefined;

afterEach(async () => {
  await fixture?.supervisor.stop();
  fixture = undefined;
});

function codeOf(result: { ok: boolean; problem?: { code: string } }): string {
  return result.ok ? 'ok' : result.problem?.code ?? 'no problem';
}

describe('process calls on forged frames (plan 03 §3.7, ADR 0139)', () => {
  it('M2.6-E35 another invocation or extension cannot wait on, or kill, a process it did not spawn', async () => {
    fixture = openProcessFixture();
    grantProcess(fixture, '@acme/pdf');
    grantProcess(fixture, '@kvman/agent');
    const spawner = await invocationOf(fixture, '@acme/pdf', 'pdf.archive');
    const spawned = await fixture.calls.handle(spawner, { name: 'process.spawn', options: { command: 'sleep', args: ['1000'] } });
    if (!spawned.ok) throw new Error(`the spawn failed: ${spawned.problem.code}`);
    const { processId } = spawnResultSchema.parse(spawned.value);
    const [row] = fixture.connection.prepare('SELECT pid FROM processes WHERE id = ?').all(processId);
    const pid = Number(row?.['pid']);

    const sibling = await invocationOf(fixture, '@acme/pdf', 'pdf.archive');
    const foreign = await invocationOf(fixture, '@kvman/agent', 'agent.run');
    expect(codeOf(await fixture.calls.handle(sibling, { name: 'process.wait', processId }))).toBe('NOT_FOUND');
    expect(codeOf(await fixture.calls.handle(foreign, { name: 'process.kill', processId }))).toBe('NOT_FOUND');
    expect(codeOf(await fixture.calls.handle(foreign, { name: 'process.wait', processId }))).toBe('NOT_FOUND');

    expect(groupAlive(pid)).toBe(true);
    expect(sibling.received.size).toBe(0);
    expect(foreign.received.size).toBe(0);
    await fixture.supervisor.stop();
    await gone(pid);
  });
});
