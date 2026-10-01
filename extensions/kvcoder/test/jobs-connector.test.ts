import { describe, expect, it, vi } from 'vitest';
import { openGate } from './support/gates.ts';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

const startedId = (result: string | undefined): string => /^started (\S+)\n/.exec(result ?? '')?.[1] ?? '';

describe('the jobs connector (ADR 0009, 88)', { timeout: 30_000 }, () => {
  it("M2.4-E37 jobs lists, reads, and cancels this session's background work, and refuses other ids", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const gate = openGate('jobs');
    fake.reply(calls(`todo wait --async '{"gate":"jobs","text":"a"}'`, `subagent run --async '{"task":"Background","mode":"fresh"}'`), says('one'), says('two'), says('three'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await gate.waiting;
    await vi.waitFor(async () => expect(fake.requests()).toHaveLength(4), wait);
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
    const [connectorResult, childResult] = toolResults(fake, 1).length === 2 ? toolResults(fake, 1) : toolResults(fake, 2);
    const jobId = startedId(connectorResult);
    const childId = startedId(childResult);

    fake.reply(calls('jobs list', `jobs get ${childId}`, `jobs get ${jobId}`, `jobs cancel ${jobId}`, 'jobs get nope'), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'check' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(6), wait);
    gate.release();
    await kernel.clock.advance(0);
    const [list, child, running, cancel, missing] = toolResults(fake).slice(-5).map((text) => text.replace(/\n\[exit code \d\]$/, ''));
    const rows: unknown = JSON.parse(list ?? '[]');
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(expect.arrayContaining([
      { id: childId, kind: 'subagent', call: `subagent run --async '{"task":"Background","mode":"fresh"}'`, status: 'succeeded', startedAt: expect.any(String) as unknown, endedAt: expect.any(String) as unknown },
      { id: jobId, kind: 'connector', call: `todo wait --async '{"gate":"jobs","text":"a"}'`, status: 'running', startedAt: expect.any(String) as unknown },
    ]));
    expect(JSON.parse(child ?? '{}')).toMatchObject({ id: childId, status: 'succeeded', output: expect.stringMatching(/\[exit code 0\]$/) as unknown });
    expect(JSON.parse(running ?? '{}')).toMatchObject({ id: jobId, status: 'running' });
    expect(JSON.parse(cancel ?? '{}')).toEqual({ cancelled: true });
    expect(missing).toBe('error kvcoder/JOB_NOT_FOUND: This chat started no background job nope.');
    expect((await kernel.waitForJob(jobId)).status).toBe('cancelled');
  });
});
